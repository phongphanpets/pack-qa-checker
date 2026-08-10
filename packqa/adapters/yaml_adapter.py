"""Human-authored YAML adapter for the canonical pack model.

The YAML format deliberately accepts plain scalar values for convenient manual
entry.  A value can also be expanded to a mapping with ``value``, ``source``,
``confidence``, ``raw_text`` and ``locator`` when provenance needs to be
specified explicitly.  Field-level ``source`` is important when an adapter
reconciles an identity from Spec with a value observed on another source.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import date, datetime
from pathlib import Path
from typing import Any, TypeVar

import yaml

from packqa.model import Confidence, Field_, Item, Pack, PackBundle, Source

T = TypeVar("T")

_PACK_FIELDS: dict[str, Callable[[Any], Any]] = {
    "name": str,
    "seed_point": int,
    "gsp_earn": int,
    "purchase_limit": int,
    "start_date": lambda value: _as_date(value),
    "end_date": lambda value: _as_date(value),
    "is_permanent": lambda value: _as_bool(value),
    "reset_type": str,
}


class YamlAdapterError(ValueError):
    """Raised when human-authored YAML cannot form a canonical bundle."""


def load_bundles(path: str | Path) -> list[PackBundle]:
    """Load one or more bundles from a human-authored YAML file."""

    yaml_path = Path(path)
    return load_bundles_text(
        yaml_path.read_text(encoding="utf-8"),
        source_name=str(yaml_path),
    )


def load_bundles_text(
    text: str,
    *,
    source_name: str = "<memory>",
) -> list[PackBundle]:
    """Load bundles from YAML text without writing an upload to disk."""

    document = yaml.safe_load(text)
    return load_bundles_document(document, source_name=source_name)


def load_bundles_document(
    document: Any,
    *,
    source_name: str = "<document>",
) -> list[PackBundle]:
    """Load bundles from an already-decoded mapping, such as a web form."""

    if not isinstance(document, Mapping):
        raise YamlAdapterError(f"{source_name}: top level must be a mapping")

    raw_bundles = document.get("bundles")
    if not isinstance(raw_bundles, list):
        raise YamlAdapterError(f"{source_name}: 'bundles' must be a list")

    return [
        _bundle(raw_bundle, f"{source_name}:bundles[{index}]")
        for index, raw_bundle in enumerate(raw_bundles)
    ]


def _bundle(raw: Any, locator: str) -> PackBundle:
    if not isinstance(raw, Mapping):
        raise YamlAdapterError(f"{locator}: bundle must be a mapping")

    try:
        bundle_id = int(raw["bundle_id"])
    except (KeyError, TypeError, ValueError) as error:
        raise YamlAdapterError(f"{locator}: bundle_id must be an integer") from error

    if not isinstance(raw.get("spec"), Mapping):
        raise YamlAdapterError(f"{locator}: spec is required")

    packs: dict[str, Pack | None] = {}
    for source in Source:
        source_name = source.value
        raw_pack = raw.get(source_name)
        packs[source_name] = (
            _pack(raw_pack, bundle_id, source, f"{locator}.{source_name}")
            if isinstance(raw_pack, Mapping)
            else None
        )

    return PackBundle(bundle_id=bundle_id, **packs)


def _pack(
    raw: Mapping[str, Any],
    bundle_id: int,
    source: Source,
    locator: str,
) -> Pack:
    declared_source = raw.get("source")
    if declared_source is not None and Source(declared_source) is not source:
        raise YamlAdapterError(
            f"{locator}: declared source {declared_source!r} does not match {source.value!r}"
        )

    bundle_field = _field(
        raw.get("bundle_id", bundle_id),
        source,
        int,
        f"{locator}.bundle_id",
    )
    if bundle_field.value != bundle_id:
        raise YamlAdapterError(
            f"{locator}: source bundle_id {bundle_field.value!r} "
            f"does not match bundle {bundle_id}"
        )

    fields = {
        name: _field(raw.get(name), source, converter, f"{locator}.{name}")
        for name, converter in _PACK_FIELDS.items()
    }

    raw_items = raw.get("items", [])
    if raw_items is None:
        raw_items = []
    if not isinstance(raw_items, list):
        raise YamlAdapterError(f"{locator}.items must be a list")

    items = [
        _item(raw_item, source, f"{locator}.items[{index}]")
        for index, raw_item in enumerate(raw_items)
    ]

    return Pack(
        bundle_id=bundle_field,
        items=items,
        is_gacha=bool(raw.get("is_gacha", False)),
        source=source,
        **fields,
    )


def _item(raw: Any, source: Source, locator: str) -> Item:
    if not isinstance(raw, Mapping):
        raise YamlAdapterError(f"{locator}: item must be a mapping")

    chance = (
        _field(raw.get("chance"), source, float, f"{locator}.chance")
        if "chance" in raw
        else None
    )
    return Item(
        item_id=_field(raw.get("item_id"), source, str, f"{locator}.item_id"),
        name=_field(raw.get("name"), source, str, f"{locator}.name"),
        amount=_field(raw.get("amount"), source, int, f"{locator}.amount"),
        chance=chance,
    )


def _field(
    raw: Any,
    source: Source,
    converter: Callable[[Any], T],
    default_locator: str,
) -> Field_[T]:
    if isinstance(raw, Mapping):
        value = raw.get("value")
        field_source = _source(raw.get("source"), source)
        confidence = _confidence(raw.get("confidence"), value)
        raw_text = raw.get("raw_text")
        locator = raw.get("locator", default_locator)
    else:
        value = raw
        field_source = source
        confidence = Confidence.CERTAIN if value is not None else Confidence.NONE
        raw_text = None if value is None else str(value)
        locator = default_locator

    converted: T | None = None
    if value is not None:
        try:
            converted = converter(value)
        except (TypeError, ValueError) as error:
            raise YamlAdapterError(
                f"{locator}: cannot convert {value!r}"
            ) from error

    if converted is None:
        confidence = Confidence.NONE

    return Field_(
        value=converted,
        source=field_source,
        confidence=confidence,
        raw_text=raw_text if raw_text is not None else (
            None if value is None else str(value)
        ),
        locator=str(locator) if locator is not None else None,
    )


def _source(raw: Any, default: Source) -> Source:
    if raw is None:
        return default
    try:
        return Source(raw)
    except ValueError as error:
        raise YamlAdapterError(f"invalid source {raw!r}") from error


def _confidence(raw: Any, value: Any) -> Confidence:
    if raw is None:
        return Confidence.CERTAIN if value is not None else Confidence.NONE
    if isinstance(raw, str):
        try:
            return Confidence[raw.upper()]
        except KeyError:
            pass
    try:
        return Confidence(float(raw))
    except (TypeError, ValueError) as error:
        raise YamlAdapterError(f"invalid confidence {raw!r}") from error


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for date_format in ("%Y-%m-%d", "%d/%m/%Y", "%d %b"):
        try:
            return datetime.strptime(text, date_format).date()
        except ValueError:
            continue
    raise ValueError(f"unsupported date {value!r}")


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "1", "permanent", "ถาวร"}:
            return True
        if normalized in {"false", "no", "0", "temporary", "ชั่วคราว"}:
            return False
    if isinstance(value, int) and value in {0, 1}:
        return bool(value)
    raise ValueError(f"unsupported bool {value!r}")
