"""Provider-independent Website OCR observations -> canonical Website Pack.

This module intentionally does not call an OCR vendor.  It defines the
boundary between any OCR provider and the canonical model, including the
confidence policy and safe item-identity reconciliation against Spec.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from datetime import date, datetime
from pathlib import Path
from typing import Any, TypeVar

import yaml
from pydantic import BaseModel, Field, model_validator

from packqa.model import Confidence, Field_, Item, Pack, PackBundle, Source

T = TypeVar("T")
_MULTIPLIER = re.compile(r"^[xX×]?\s*([+-]?\d[\d,]*)\s*[xX×]?$")


class ObservedField(BaseModel):
    value: Any = None
    confidence: float = 0.0
    raw_text: str | None = None
    locator: str | None = None
    human_confirmed: bool = False

    @model_validator(mode="after")
    def confidence_is_probability(self) -> ObservedField:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        return self


class WebsiteItemObservation(BaseModel):
    name: ObservedField
    amount: ObservedField
    chance: ObservedField | None = None
    item_id: ObservedField | None = None


class WebsiteObservation(BaseModel):
    name: ObservedField | None = None
    seed_point: ObservedField | None = None
    gsp_earn: ObservedField | None = None
    purchase_limit: ObservedField | None = None
    start_date: ObservedField | None = None
    end_date: ObservedField | None = None
    reset_type: ObservedField | None = None
    items: list[WebsiteItemObservation] = Field(default_factory=list)


class WebsiteOcrPolicy(BaseModel):
    min_verifiable_confidence: float = 0.75

    @model_validator(mode="after")
    def threshold_is_probability(self) -> WebsiteOcrPolicy:
        if not 0.0 <= self.min_verifiable_confidence <= 1.0:
            raise ValueError("min_verifiable_confidence must be between 0 and 1")
        return self


def load_website_observations(
    path: str | Path,
) -> dict[int, WebsiteObservation]:
    """Load OCR observations keyed by canonical bundle ID."""

    observation_path = Path(path)
    return load_website_observations_text(
        observation_path.read_text(encoding="utf-8"),
        source_name=str(observation_path),
    )


def load_website_observations_text(
    text: str,
    *,
    source_name: str = "<memory>",
) -> dict[int, WebsiteObservation]:
    """Load OCR observations from YAML text without persisting an upload."""

    document = yaml.safe_load(text)
    if not isinstance(document, Mapping) or not isinstance(
        document.get("bundles"), list
    ):
        raise ValueError(
            f"{source_name}: expected a mapping containing a bundles list"
        )

    observations: dict[int, WebsiteObservation] = {}
    for index, raw_bundle in enumerate(document["bundles"]):
        if not isinstance(raw_bundle, Mapping):
            raise ValueError(
                f"{source_name}: bundles[{index}] must be a mapping"
            )
        try:
            bundle_id = int(raw_bundle["bundle_id"])
            observation = WebsiteObservation.model_validate(
                raw_bundle["website"]
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(
                f"{source_name}: invalid bundles[{index}]"
            ) from error
        if bundle_id in observations:
            raise ValueError(
                f"{source_name}: duplicate bundle_id {bundle_id}"
            )
        observations[bundle_id] = observation
    return observations


def apply_website_observations(
    bundles: Sequence[PackBundle],
    observations: Mapping[int, WebsiteObservation],
    *,
    aliases: Mapping[str, str] | None = None,
    policy: WebsiteOcrPolicy | None = None,
) -> list[PackBundle]:
    """Replace Website packs for matching bundles, leaving others unchanged."""

    bundles_by_id = {bundle.bundle_id: bundle for bundle in bundles}
    unknown_ids = set(observations) - set(bundles_by_id)
    if unknown_ids:
        raise ValueError(
            f"Website observations reference unknown bundle IDs: "
            f"{sorted(unknown_ids)}"
        )

    return [
        bundle.model_copy(
            update={
                "website": website_pack_from_observation(
                    bundle.spec,
                    observations[bundle.bundle_id],
                    aliases=aliases,
                    policy=policy,
                )
            }
        )
        if bundle.bundle_id in observations
        else bundle
        for bundle in bundles
    ]


def website_pack_from_observation(
    spec: Pack,
    observation: WebsiteObservation,
    *,
    aliases: Mapping[str, str] | None = None,
    policy: WebsiteOcrPolicy | None = None,
) -> Pack:
    """Convert one OCR observation to a canonical Website Pack."""

    active_policy = policy or WebsiteOcrPolicy()
    identity_index = _spec_identity_index(spec)
    normalized_aliases = {
        _normalize_name(name): item_id
        for name, item_id in (aliases or {}).items()
    }

    items = [
        _website_item(
            raw_item,
            identity_index,
            normalized_aliases,
            active_policy,
        )
        for raw_item in observation.items
    ]
    return Pack(
        bundle_id=spec.bundle_id.model_copy(),
        name=_observed(
            observation.name, Source.WEBSITE, str, active_policy
        ),
        seed_point=_observed(
            observation.seed_point, Source.WEBSITE, _as_int, active_policy
        ),
        gsp_earn=_observed(
            observation.gsp_earn, Source.WEBSITE, _as_int, active_policy
        ),
        purchase_limit=_observed(
            observation.purchase_limit,
            Source.WEBSITE,
            _as_int,
            active_policy,
        ),
        start_date=_observed(
            observation.start_date, Source.WEBSITE, _as_date, active_policy
        ),
        end_date=_observed(
            observation.end_date, Source.WEBSITE, _as_date, active_policy
        ),
        reset_type=_observed(
            observation.reset_type, Source.WEBSITE, str, active_policy
        ),
        items=items,
        is_gacha=False,
        source=Source.WEBSITE,
    )


def _website_item(
    observation: WebsiteItemObservation,
    identity_index: Mapping[str, list[Field_[str]]],
    aliases: Mapping[str, str],
    policy: WebsiteOcrPolicy,
) -> Item:
    name = _observed(observation.name, Source.WEBSITE, str, policy)
    amount = _observed(observation.amount, Source.WEBSITE, _as_int, policy)
    item_id = _resolve_item_id(
        observation.item_id,
        name,
        identity_index,
        aliases,
        policy,
    )
    return Item(
        item_id=item_id,
        name=name,
        amount=amount,
        chance=(
            _observed(
                observation.chance,
                Source.WEBSITE,
                float,
                policy,
            )
            if observation.chance is not None
            else None
        ),
    )


def _resolve_item_id(
    observed_id: ObservedField | None,
    observed_name: Field_[str],
    identity_index: Mapping[str, list[Field_[str]]],
    aliases: Mapping[str, str],
    policy: WebsiteOcrPolicy,
) -> Field_[str]:
    if observed_id is not None:
        return _observed(observed_id, Source.WEBSITE, str, policy)

    if not observed_name.is_verifiable:
        return Field_(
            value=None,
            source=Source.SPEC,
            confidence=Confidence.NONE,
            raw_text=observed_name.raw_text,
            locator=observed_name.locator,
        )

    normalized_name = _normalize_name(observed_name.value)
    alias_id = aliases.get(normalized_name)
    if alias_id is not None:
        candidates = [
            candidate
            for values in identity_index.values()
            for candidate in values
            if candidate.value == alias_id
        ]
    else:
        candidates = identity_index.get(normalized_name, [])

    verifiable_candidates = [
        candidate for candidate in candidates if candidate.is_verifiable
    ]
    candidate_ids = {
        candidate.value for candidate in verifiable_candidates
    }
    if len(candidate_ids) != 1:
        return Field_(
            value=None,
            source=Source.SPEC,
            confidence=Confidence.NONE,
            raw_text=f"unresolved from website name: {observed_name.raw_text}",
            locator=observed_name.locator,
        )

    candidate = verifiable_candidates[0]
    return Field_(
        value=candidate.value,
        source=Source.SPEC,
        confidence=candidate.confidence,
        raw_text=f"{candidate.value} (resolved from {observed_name.raw_text})",
        locator=candidate.locator,
    )


def _observed(
    observation: ObservedField | None,
    source: Source,
    converter: Callable[[Any], T],
    policy: WebsiteOcrPolicy,
) -> Field_[T]:
    if observation is None:
        return Field_(
            value=None,
            source=source,
            confidence=Confidence.NONE,
        )

    locator = observation.locator
    if observation.human_confirmed:
        if locator:
            if "human-confirmed" not in locator:
                locator = f"{locator}:human-confirmed"
        else:
            locator = "website:human-confirmed"

    raw_text = (
        observation.raw_text
        if observation.raw_text is not None
        else None if observation.value is None else str(observation.value)
    )
    if observation.value is None:
        return Field_(
            value=None,
            source=source,
            confidence=Confidence.NONE,
            raw_text=raw_text,
            locator=locator,
        )

    if (
        not observation.human_confirmed
        and observation.confidence < policy.min_verifiable_confidence
    ):
        return Field_(
            value=None,
            source=source,
            confidence=(
                Confidence.LOW
                if observation.confidence > 0
                else Confidence.NONE
            ),
            raw_text=raw_text,
            locator=locator,
        )

    try:
        value = converter(observation.value)
    except (TypeError, ValueError):
        return Field_(
            value=None,
            source=source,
            confidence=Confidence.NONE,
            raw_text=raw_text,
            locator=locator,
        )

    return Field_(
        value=value,
        source=source,
        confidence=(
            Confidence.CERTAIN
            if observation.human_confirmed
            else Confidence.HIGH
        ),
        raw_text=raw_text,
        locator=locator,
    )


def _spec_identity_index(spec: Pack) -> dict[str, list[Field_[str]]]:
    index: dict[str, list[Field_[str]]] = {}
    for item in spec.items:
        if item.name.is_verifiable:
            index.setdefault(_normalize_name(item.name.value), []).append(
                item.item_id
            )
    return index


def _normalize_name(value: str) -> str:
    return " ".join(value.casefold().split())


def _as_int(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("boolean is not an integer observation")
    if isinstance(value, int):
        return value
    match = _MULTIPLIER.fullmatch(str(value).strip())
    if not match:
        raise ValueError(f"not an integer observation: {value!r}")
    return int(match.group(1).replace(",", ""))


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for date_format in ("%Y-%m-%d", "%d/%m/%Y", "%b %d, %Y"):
        try:
            return datetime.strptime(text, date_format).date()
        except ValueError:
            continue
    raise ValueError(f"not a date observation: {value!r}")
