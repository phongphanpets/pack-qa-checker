"""Rule engine that evaluates only the canonical model.

The supported rule shapes are the ones declared in ``pack_rules.yaml``:
scalar/list cross-source comparisons, item presence, scalar equality
invariants, and sum invariants.  Expressions are parsed rather than evaluated
as Python code.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Mapping
from enum import Enum
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel

from packqa.model import Field_, Item, Pack, PackBundle, Source

_SCALAR_EQUALITY = re.compile(
    r"^(?P<left>[a-z_]+\.[a-z_]+)\s*==\s*(?P<right>[a-z_]+\.[a-z_]+)$"
)
_SUM_EQUALITY = re.compile(
    r"^sum\((?P<path>[a-z_]+\.items\[\]\.[a-z_]+)\)\s*==\s*"
    r"(?P<expected>-?\d+(?:\.\d+)?)$"
)
_LIST_PATH = re.compile(
    r"^(?P<source>[a-z_]+)\.items\[\]\.(?P<field>[a-z_]+)$"
)
_SCALAR_PATH = re.compile(r"^(?P<source>[a-z_]+)\.(?P<field>[a-z_]+)$")


class Status(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    UNVERIFIABLE = "UNVERIFIABLE"


class Finding(BaseModel):
    rule_id: str
    check: int
    field: str
    source: Source
    expected: Any = None
    actual: Any = None
    expected_raw_text: str | None = None
    actual_raw_text: str | None = None
    expected_locator: str | None = None
    actual_locator: str | None = None
    status: Status
    severity: str
    message: str


def load_rule_config(path: str | Path) -> dict[str, Any]:
    """Read and minimally validate the declarative rule document."""

    rule_path = Path(path)
    with rule_path.open("r", encoding="utf-8") as stream:
        config = yaml.safe_load(stream)
    if not isinstance(config, dict) or not isinstance(config.get("rules"), list):
        raise ValueError(f"{rule_path}: expected a mapping containing a rules list")
    return config


class RuleEngine:
    def __init__(self, config: Mapping[str, Any]):
        self.rules = list(config.get("rules", []))
        self.ignore_patterns = [
            re.compile(pattern) for pattern in config.get("ignore_patterns", [])
        ]

    @classmethod
    def from_yaml(cls, path: str | Path) -> RuleEngine:
        return cls(load_rule_config(path))

    def evaluate(self, bundle: PackBundle) -> list[Finding]:
        findings: list[Finding] = []
        for rule in self.rules:
            if not self._applies(rule, bundle):
                continue
            kind = rule.get("kind")
            if kind == "cross_source":
                findings.extend(self._cross_source(rule, bundle))
            elif kind == "presence":
                if rule.get("optional") and self._presence_source_missing(rule, bundle):
                    continue
                findings.extend(self._presence(rule, bundle))
            elif kind == "invariant":
                findings.extend(self._invariant(rule, bundle))
            else:
                raise ValueError(f"unsupported rule kind {kind!r}")
        return findings

    def evaluate_many(self, bundles: Iterable[PackBundle]) -> list[Finding]:
        return [
            finding
            for bundle in bundles
            for finding in self.evaluate(bundle)
        ]

    def _applies(self, rule: Mapping[str, Any], bundle: PackBundle) -> bool:
        condition = rule.get("when")
        if condition is None:
            return True
        if condition == "is_gacha":
            return bundle.spec.is_gacha
        if condition == "is_permanent":
            return self._is_permanent(bundle)
        if condition == "not_permanent":
            return not self._is_permanent(bundle)
        raise ValueError(f"unsupported rule condition {condition!r}")

    @staticmethod
    def _is_permanent(bundle: PackBundle) -> bool:
        field = bundle.spec.is_permanent
        return bool(
            field is not None
            and field.is_verifiable
            and field.value
        )

    def _presence_source_missing(self, rule: Mapping[str, Any], bundle: PackBundle) -> bool:
        source, _ = self._list_parts(bundle, rule["compare"]["right"])
        return source is None

    def _cross_source(
        self, rule: Mapping[str, Any], bundle: PackBundle
    ) -> list[Finding]:
        comparisons = rule["compare"]
        if isinstance(comparisons, Mapping):
            comparisons = [comparisons]

        findings: list[Finding] = []
        for comparison in comparisons:
            left_path = comparison["left"]
            right_path = comparison["right"]
            if "[]" in left_path or "[]" in right_path:
                findings.extend(
                    self._compare_item_fields(
                        rule,
                        bundle,
                        left_path,
                        right_path,
                        comparison.get("join_on"),
                    )
                )
            else:
                findings.extend(
                    self._compare_scalar(rule, bundle, left_path, right_path)
                )
        return findings

    def _compare_scalar(
        self,
        rule: Mapping[str, Any],
        bundle: PackBundle,
        left_path: str,
        right_path: str,
    ) -> list[Finding]:
        left = self._scalar(bundle, left_path)
        right = self._scalar(bundle, right_path)
        if self._is_ignored(left) or self._is_ignored(right):
            return []
        return [
            self._comparison_finding(
                rule, right_path, self._path_source(right_path), left, right
            )
        ]

    def _compare_item_fields(
        self,
        rule: Mapping[str, Any],
        bundle: PackBundle,
        left_path: str,
        right_path: str,
        join_on: str | None,
    ) -> list[Finding]:
        if not join_on:
            raise ValueError(f"{rule['id']}: list comparison requires join_on")

        left_pack, left_field_name = self._list_parts(bundle, left_path)
        right_pack, right_field_name = self._list_parts(bundle, right_path)
        source = self._path_source(right_path)
        if left_pack is None or right_pack is None:
            return [
                self._unverifiable(
                    rule,
                    right_path,
                    source,
                    "source pack is missing",
                )
            ]

        right_by_key: dict[Any, list[Item]] = {}
        for item in right_pack.items:
            key = getattr(item, join_on)
            if key.is_verifiable and not self._is_ignored(key):
                right_by_key.setdefault(key.value, []).append(item)
        right_has_unresolved_keys = any(
            not getattr(item, join_on).is_verifiable
            for item in right_pack.items
        )
        findings: list[Finding] = []
        left_key_counts = Counter(
            getattr(item, join_on).value
            for item in left_pack.items
            if getattr(item, join_on).is_verifiable
        )
        key_occurrences: dict[Any, int] = {}
        for left_item in left_pack.items:
            key: Field_[Any] = getattr(left_item, join_on)
            left: Field_[Any] = getattr(left_item, left_field_name)
            if self._is_ignored(key) or self._is_ignored(left):
                continue
            if not key.is_verifiable:
                findings.append(
                    self._unverifiable(
                        rule,
                        f"{right_path}[unknown]",
                        source,
                        "left item identity is unreadable",
                    )
                )
                continue

            occurrence = key_occurrences.get(key.value, 0) + 1
            key_occurrences[key.value] = occurrence
            candidates = right_by_key.get(key.value, [])
            matching_index = next(
                (
                    index
                    for index, item in enumerate(candidates)
                    if (
                        right_field := getattr(item, right_field_name)
                    ) is not None
                    and right_field.is_verifiable
                    and left.is_verifiable
                    and right_field.value == left.value
                ),
                0 if candidates else -1,
            )
            right_item = (
                candidates.pop(matching_index)
                if matching_index >= 0
                else None
            )
            field = f"{right_path}[{join_on}={key.value}]"
            if left_key_counts[key.value] > 1:
                field += f"[occurrence={occurrence}]"
            if right_item is None:
                if right_has_unresolved_keys:
                    findings.append(
                        self._unverifiable(
                            rule,
                            field,
                            source,
                            "an observed item identity is unresolved",
                            expected_field=left,
                        )
                    )
                else:
                    findings.append(
                        self._finding(
                            rule,
                            field,
                            source,
                            left.value,
                            None,
                            Status.FAIL,
                            "matching item is missing",
                            expected_field=left,
                        )
                    )
                continue

            right: Field_[Any] = getattr(right_item, right_field_name)
            if self._is_ignored(right):
                continue
            findings.append(
                self._comparison_finding(rule, field, source, left, right)
            )
        for key, candidates in right_by_key.items():
            for extra_index, right_item in enumerate(candidates, start=1):
                right = getattr(right_item, right_field_name)
                if (
                    right is None
                    or self._is_ignored(right)
                    or not right.is_verifiable
                ):
                    continue
                occurrence = left_key_counts.get(key, 0) + extra_index
                field = f"{right_path}[{join_on}={key}]"
                if occurrence > 1:
                    field += f"[occurrence={occurrence}]"
                findings.append(
                    self._finding(
                        rule,
                        field,
                        source,
                        None,
                        right.value,
                        Status.FAIL,
                        "unexpected observed item is present",
                        actual_field=right,
                    )
                )
        return findings

    def _presence(
        self, rule: Mapping[str, Any], bundle: PackBundle
    ) -> list[Finding]:
        comparison = rule["compare"]
        left_path = comparison["left"]
        right_path = comparison["right"]
        if comparison.get("assert") != "right_contains_all_left":
            raise ValueError(f"{rule['id']}: unsupported presence assertion")

        left_pack, left_field_name = self._list_parts(bundle, left_path)
        right_pack, right_field_name = self._list_parts(bundle, right_path)
        source = self._path_source(right_path)
        if left_pack is None or right_pack is None:
            return [
                self._unverifiable(
                    rule, right_path, source, "source pack is missing"
                )
            ]

        right_values = {
            field.value: field
            for item in right_pack.items
            if (field := getattr(item, right_field_name)).is_verifiable
            and not self._is_ignored(field)
        }
        right_has_unresolved_values = any(
            not getattr(item, right_field_name).is_verifiable
            for item in right_pack.items
        )
        findings: list[Finding] = []
        for item in left_pack.items:
            expected: Field_[Any] = getattr(item, left_field_name)
            if self._is_ignored(expected):
                continue
            field = f"{right_path}[{expected.value}]"
            if not expected.is_verifiable:
                findings.append(
                    self._unverifiable(
                        rule, field, source, "expected item identity is unreadable"
                    )
                )
                continue
            present = expected.value in right_values
            actual = right_values.get(expected.value)
            if not present and right_has_unresolved_values:
                findings.append(
                    self._unverifiable(
                        rule,
                        field,
                        source,
                        "an observed item identity is unresolved",
                        expected_field=expected,
                    )
                )
                continue
            findings.append(
                self._finding(
                    rule,
                    field,
                    source,
                    expected.value,
                    actual.value if actual is not None else None,
                    Status.PASS if present else Status.FAIL,
                    "item is present" if present else "item is missing",
                    expected_field=expected,
                    actual_field=actual,
                )
            )
        return findings

    def _invariant(
        self, rule: Mapping[str, Any], bundle: PackBundle
    ) -> list[Finding]:
        expression = rule["assert"]
        scalar_match = _SCALAR_EQUALITY.fullmatch(expression)
        if scalar_match:
            left_path = scalar_match.group("left")
            right_path = scalar_match.group("right")
            left = self._scalar(bundle, left_path)
            right = self._scalar(bundle, right_path)
            if self._is_ignored(left) or self._is_ignored(right):
                return []
            return [
                self._comparison_finding(
                    rule,
                    left_path,
                    self._path_source(left_path),
                    right,
                    left,
                )
            ]

        sum_match = _SUM_EQUALITY.fullmatch(expression)
        if sum_match:
            path = sum_match.group("path")
            pack, field_name = self._list_parts(bundle, path)
            source = self._path_source(path)
            expected = float(sum_match.group("expected"))
            if pack is None:
                return [
                    self._unverifiable(rule, path, source, "source pack is missing")
                ]
            fields: list[Field_[Any]] = [
                getattr(item, field_name) for item in pack.items
            ]
            if any(
                field is None
                or not field.is_verifiable
                or self._is_ignored(field)
                for field in fields
            ):
                return [
                    self._unverifiable(
                        rule, path, source, "one or more chance values are unreadable"
                    )
                ]
            actual = sum(float(field.value) for field in fields)
            tolerance = float(rule.get("tolerance", 0))
            status = (
                Status.PASS
                if abs(actual - expected) <= tolerance
                else Status.FAIL
            )
            return [
                self._finding(
                    rule,
                    path,
                    source,
                    expected,
                    actual,
                    status,
                    "sum matches" if status is Status.PASS else "sum differs",
                    actual_locator="; ".join(
                        field.locator for field in fields if field.locator
                    )
                    or None,
                    actual_raw_text=" + ".join(
                        field.raw_text for field in fields if field.raw_text
                    )
                    or None,
                )
            ]

        raise ValueError(f"{rule['id']}: unsupported invariant {expression!r}")

    def _comparison_finding(
        self,
        rule: Mapping[str, Any],
        field: str,
        source: Source,
        expected: Field_[Any] | None,
        actual: Field_[Any] | None,
    ) -> Finding:
        if (
            expected is None
            or actual is None
            or not expected.is_verifiable
            or not actual.is_verifiable
        ):
            return self._unverifiable(
                rule,
                field,
                source,
                "one or both values are unreadable",
                expected_field=expected,
                actual_field=actual,
            )
        human_attested = bool(
            actual.locator
            and "human-confirmed" in actual.locator
        )
        human_override_allowed = field == "admin.name" and human_attested
        status = (
            Status.PASS
            if expected.value == actual.value or human_override_allowed
            else Status.FAIL
        )
        return self._finding(
            rule,
            field,
            source,
            expected.value,
            actual.value,
            status,
            "human confirmed" if human_attested and status is Status.PASS
            else "values match" if status is Status.PASS else "values differ",
            expected_field=expected,
            actual_field=actual,
        )

    def _unverifiable(
        self,
        rule: Mapping[str, Any],
        field: str,
        source: Source,
        detail: str,
        expected_field: Field_[Any] | None = None,
        actual_field: Field_[Any] | None = None,
    ) -> Finding:
        return self._finding(
            rule,
            field,
            source,
            expected_field.value if expected_field else None,
            actual_field.value if actual_field else None,
            Status.UNVERIFIABLE,
            detail,
            expected_field=expected_field,
            actual_field=actual_field,
        )

    @staticmethod
    def _finding(
        rule: Mapping[str, Any],
        field: str,
        source: Source,
        expected: Any,
        actual: Any,
        status: Status,
        detail: str,
        *,
        expected_field: Field_[Any] | None = None,
        actual_field: Field_[Any] | None = None,
        expected_raw_text: str | None = None,
        actual_raw_text: str | None = None,
        expected_locator: str | None = None,
        actual_locator: str | None = None,
    ) -> Finding:
        return Finding(
            rule_id=rule["id"],
            check=int(rule["check"]),
            field=field,
            source=source,
            expected=expected,
            actual=actual,
            expected_raw_text=(
                expected_field.raw_text if expected_field else expected_raw_text
            ),
            actual_raw_text=(
                actual_field.raw_text if actual_field else actual_raw_text
            ),
            expected_locator=(
                expected_field.locator if expected_field else expected_locator
            ),
            actual_locator=(
                actual_field.locator if actual_field else actual_locator
            ),
            status=status,
            severity=str(rule["severity"]),
            message=f"{rule['desc']}: {detail}",
        )

    def _is_ignored(self, field: Field_[Any] | None) -> bool:
        return bool(
            field
            and field.raw_text
            and any(pattern.search(field.raw_text) for pattern in self.ignore_patterns)
        )

    @staticmethod
    def _scalar(bundle: PackBundle, path: str) -> Field_[Any] | None:
        match = _SCALAR_PATH.fullmatch(path)
        if not match:
            raise ValueError(f"invalid scalar path {path!r}")
        pack = getattr(bundle, match.group("source"))
        return None if pack is None else getattr(pack, match.group("field"))

    @staticmethod
    def _list_parts(bundle: PackBundle, path: str) -> tuple[Pack | None, str]:
        match = _LIST_PATH.fullmatch(path)
        if not match:
            raise ValueError(f"invalid list path {path!r}")
        return getattr(bundle, match.group("source")), match.group("field")

    @staticmethod
    def _path_source(path: str) -> Source:
        return Source(path.split(".", 1)[0])
