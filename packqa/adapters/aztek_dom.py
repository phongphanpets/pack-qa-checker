"""Read-only Aztek DOM snapshot -> canonical Admin Pack adapter.

The canonical model still calls the Aztek source ``admin`` for compatibility
with the current rule set.  This module is the boundary for a Playwright DOM
reader: it never drives Save/Import controls and it never identifies a pack by
its display name.  A target manifest must name the Product UUID and Bundle ID
that are allowed to populate each canonical bundle.

The input is intentionally JSON-shaped rather than tied to Playwright types so
the browser reader can write a safe, token-free snapshot and the Python rule
engine can be run separately.  Every projected value keeps its DOM locator,
raw text, source, and confidence.  Missing or low-confidence DOM fields stay
unverifiable instead of being guessed.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from datetime import date, datetime
from typing import Any, TypeVar

from pydantic import BaseModel, Field, model_validator

from packqa.model import (
    Confidence,
    Field_,
    Item,
    Pack,
    PackBundle,
    ProductBundleLink,
    ProductListing,
    PurchaseLimits,
    Source,
)

T = TypeVar("T")
_MIN_VERIFIABLE_CONFIDENCE = 0.75


class AztekDomAdapterError(ValueError):
    """Raised when an Aztek DOM snapshot cannot safely be attached."""


class AztekDomField(BaseModel):
    """One value read from Aztek DOM, before canonical normalization."""

    value: Any = None
    raw_text: str | None = None
    locator: str | None = None
    confidence: float = 1.0

    @model_validator(mode="after")
    def confidence_is_probability(self) -> AztekDomField:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        return self


class AztekDomItemObservation(BaseModel):
    """A fixed or random outcome from one Bundle DOM page."""

    item_id: AztekDomField | None = None
    name: AztekDomField | None = None
    amount: AztekDomField | None = None
    chance: AztekDomField | None = None


class AztekDomBundleObservation(BaseModel):
    """The bundle-scoped part of a Product DOM read-back."""

    bundle_id: int
    bundle_type: AztekDomField | None = None
    is_primary: AztekDomField | None = None
    seed_point: AztekDomField | None = None
    gsp_earn: AztekDomField | None = None
    items: list[AztekDomItemObservation] = Field(default_factory=list)


class AztekDomProductObservation(BaseModel):
    """A product and every Bundle page read for that product."""

    product_uuid: str
    name: AztekDomField | None = None
    price: AztekDomField | None = None
    full_price: AztekDomField | None = None
    currency: AztekDomField | None = None
    enabled: AztekDomField | None = None
    hidden: AztekDomField | None = None
    test_mode: AztekDomField | None = None
    purchase_limit: AztekDomField | None = None
    player_limit: AztekDomField | None = None
    server_limit: AztekDomField | None = None
    character_limit: AztekDomField | None = None
    product_limit: AztekDomField | None = None
    start_date: AztekDomField | None = None
    end_date: AztekDomField | None = None
    next_reset_at: AztekDomField | None = None
    is_permanent: AztekDomField | None = None
    reset_type: AztekDomField | None = None
    reset_interval: AztekDomField | None = None
    bundles: list[AztekDomBundleObservation] = Field(default_factory=list)

    @model_validator(mode="after")
    def product_has_identity_and_unique_bundles(self) -> AztekDomProductObservation:
        if not self.product_uuid.strip():
            raise ValueError("product_uuid is required")
        bundle_ids = [bundle.bundle_id for bundle in self.bundles]
        if len(bundle_ids) != len(set(bundle_ids)):
            raise ValueError("duplicate bundle_id inside one product observation")
        return self


class AztekDomObservationDocument(BaseModel):
    """Token-free document produced by the read-only Playwright collector."""

    products: list[AztekDomProductObservation]

    @model_validator(mode="after")
    def target_pairs_are_unique(self) -> AztekDomObservationDocument:
        pairs = [
            (product.product_uuid, bundle.bundle_id)
            for product in self.products
            for bundle in product.bundles
        ]
        if len(pairs) != len(set(pairs)):
            raise ValueError("duplicate product_uuid/bundle_id observation")
        return self


class AztekDomTarget(BaseModel):
    """Stable identity of one requested Aztek Product/Bundle pair."""

    product_uuid: str
    bundle_id: int

    @model_validator(mode="after")
    def product_uuid_is_present(self) -> AztekDomTarget:
        if not self.product_uuid.strip():
            raise ValueError("product_uuid is required")
        return self


def load_aztek_dom_observations_text(
    text: str,
    *,
    source_name: str = "<memory>",
) -> AztekDomObservationDocument:
    """Load a JSON DOM snapshot without persisting the uploaded file."""

    try:
        document = json.loads(text)
        return AztekDomObservationDocument.model_validate(document)
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        raise AztekDomAdapterError(
            f"{source_name}: invalid Aztek DOM observation document"
        ) from error


def aztek_pack_from_observation(
    product: AztekDomProductObservation,
    bundle: AztekDomBundleObservation,
) -> Pack:
    """Project one known Product/Bundle observation into the Admin source."""

    prefix = _prefix(product.product_uuid, bundle.bundle_id)
    bundle_type = _field(
        bundle.bundle_type,
        str,
        f"{prefix}.bundle_type",
    )
    return Pack(
        bundle_id=Field_(
            value=bundle.bundle_id,
            source=Source.ADMIN,
            confidence=Confidence.CERTAIN,
            raw_text=str(bundle.bundle_id),
            locator=f"{prefix}.bundle_id",
        ),
        name=_field(product.name, str, f"{prefix}.product.name"),
        seed_point=_field(bundle.seed_point, _as_int, f"{prefix}.seed_point"),
        gsp_earn=_field(bundle.gsp_earn, _as_int, f"{prefix}.gsp_earn"),
        purchase_limit=_field(
            product.purchase_limit,
            _as_int,
            f"{prefix}.product.purchase_limit",
        ),
        start_date=_field(
            product.start_date,
            _as_date,
            f"{prefix}.product.start_date",
        ),
        end_date=_field(product.end_date, _as_date, f"{prefix}.product.end_date"),
        is_permanent=_field(
            product.is_permanent,
            _as_bool,
            f"{prefix}.product.is_permanent",
        ),
        reset_type=_field(
            product.reset_type,
            str,
            f"{prefix}.product.reset_type",
        ),
        bundle_type=bundle_type,
        items=[
            _item(item, f"{prefix}.items[{index}]")
            for index, item in enumerate(bundle.items)
        ],
        is_gacha=(
            bundle_type.value is not None
            and bundle_type.value.strip().upper() == "RANDOM"
        ),
        source=Source.ADMIN,
    )


def aztek_product_listing_from_observation(
    product: AztekDomProductObservation,
) -> ProductListing:
    """Project product-level DOM state without discarding its time zone."""

    prefix = f"aztek-dom:products/{product.product_uuid}"
    return ProductListing(
        product_uuid=Field_(
            value=product.product_uuid,
            source=Source.ADMIN,
            confidence=Confidence.CERTAIN,
            raw_text=product.product_uuid,
            locator=f"{prefix}.product_uuid",
        ),
        name=_field(product.name, str, f"{prefix}.name"),
        price=_field(product.price, _as_float, f"{prefix}.price"),
        full_price=_field(product.full_price, _as_float, f"{prefix}.full_price"),
        currency=_field(product.currency, str, f"{prefix}.currency"),
        enabled=_field(product.enabled, _as_bool, f"{prefix}.enabled"),
        hidden=_field(product.hidden, _as_bool, f"{prefix}.hidden"),
        test_mode=_field(product.test_mode, _as_bool, f"{prefix}.test_mode"),
        starts_at=_field(product.start_date, _as_datetime, f"{prefix}.starts_at"),
        ends_at=_field(product.end_date, _as_datetime, f"{prefix}.ends_at"),
        reset_interval=_field(
            product.reset_interval,
            str,
            f"{prefix}.reset_interval",
        ),
        next_reset_at=_field(
            product.next_reset_at,
            _as_datetime,
            f"{prefix}.next_reset_at",
        ),
        purchase_limits=PurchaseLimits(
            player=_field(product.player_limit, _as_int, f"{prefix}.limits.player"),
            server=_field(product.server_limit, _as_int, f"{prefix}.limits.server"),
            character=_field(
                product.character_limit,
                _as_int,
                f"{prefix}.limits.character",
            ),
            product=_field(product.product_limit, _as_int, f"{prefix}.limits.product"),
        ),
        bundle_links=[
            ProductBundleLink(
                bundle_id=Field_(
                    value=bundle.bundle_id,
                    source=Source.ADMIN,
                    confidence=Confidence.CERTAIN,
                    raw_text=str(bundle.bundle_id),
                    locator=f"{prefix}.bundles/{bundle.bundle_id}.bundle_id",
                ),
                is_primary=_field(
                    bundle.is_primary,
                    _as_bool,
                    f"{prefix}.bundles/{bundle.bundle_id}.is_primary",
                ),
            )
            for bundle in product.bundles
        ],
        source=Source.ADMIN,
    )


def apply_aztek_dom_observations(
    bundles: Sequence[PackBundle],
    observation: AztekDomObservationDocument,
    targets: Sequence[AztekDomTarget],
) -> list[PackBundle]:
    """Attach Aztek read-backs to matching canonical bundles.

    ``targets`` is a manifest, not a search hint.  Every requested pair must
    exist in the snapshot and every target Bundle ID must already exist in the
    canonical input.  This is what prevents a same-name Product from being
    silently attached to the wrong pack.
    """

    bundle_by_id = {bundle.bundle_id: bundle for bundle in bundles}
    if len(bundle_by_id) != len(bundles):
        raise AztekDomAdapterError("canonical input contains duplicate bundle_id")

    target_pairs = [(target.product_uuid, target.bundle_id) for target in targets]
    if len(target_pairs) != len(set(target_pairs)):
        raise AztekDomAdapterError("target manifest contains duplicate Product/Bundle pairs")

    unknown_bundle_ids = {target.bundle_id for target in targets} - set(bundle_by_id)
    if unknown_bundle_ids:
        raise AztekDomAdapterError(
            "target manifest references unknown canonical bundle_id: "
            f"{sorted(unknown_bundle_ids)}"
        )

    observed_pairs = {
        (product.product_uuid, bundle.bundle_id): (product, bundle)
        for product in observation.products
        for bundle in product.bundles
    }
    missing_pairs = set(target_pairs) - set(observed_pairs)
    if missing_pairs:
        formatted = ", ".join(
            f"{product_uuid}/{bundle_id}"
            for product_uuid, bundle_id in sorted(missing_pairs)
        )
        raise AztekDomAdapterError(
            f"Aztek snapshot is missing target Product/Bundle pair(s): {formatted}"
        )

    admin_by_bundle = {}
    product_by_bundle = {}
    for target in targets:
        product, observed_bundle = observed_pairs[
            (target.product_uuid, target.bundle_id)
        ]
        admin_by_bundle[target.bundle_id] = aztek_pack_from_observation(
            product, observed_bundle
        )
        product_by_bundle[target.bundle_id] = aztek_product_listing_from_observation(
            product
        )
    if len(admin_by_bundle) != len(targets):
        raise AztekDomAdapterError(
            "target manifest maps more than one Product UUID to the same bundle_id"
        )

    return [
        bundle.model_copy(
            update={
                "admin": admin_by_bundle[bundle.bundle_id],
                "product": product_by_bundle[bundle.bundle_id],
            }
        )
        if bundle.bundle_id in admin_by_bundle
        else bundle
        for bundle in bundles
    ]


def _item(observation: AztekDomItemObservation, prefix: str) -> Item:
    return Item(
        item_id=_field(observation.item_id, str, f"{prefix}.item_id"),
        name=_field(observation.name, str, f"{prefix}.name"),
        amount=_field(observation.amount, _as_int, f"{prefix}.amount"),
        chance=(
            _field(observation.chance, float, f"{prefix}.chance")
            if observation.chance is not None
            else None
        ),
    )


def _field(
    observation: AztekDomField | None,
    converter: Callable[[Any], T],
    default_locator: str,
) -> Field_[T]:
    if observation is None or observation.value is None:
        return Field_(
            value=None,
            source=Source.ADMIN,
            confidence=Confidence.NONE,
            raw_text=None if observation is None else observation.raw_text,
            locator=default_locator if observation is None else observation.locator,
        )

    raw_text = (
        observation.raw_text
        if observation.raw_text is not None
        else str(observation.value)
    )
    locator = observation.locator or default_locator
    if observation.confidence < _MIN_VERIFIABLE_CONFIDENCE:
        return Field_(
            value=None,
            source=Source.ADMIN,
            confidence=(
                Confidence.LOW if observation.confidence > 0 else Confidence.NONE
            ),
            raw_text=raw_text,
            locator=locator,
        )

    try:
        value = converter(observation.value)
    except (TypeError, ValueError):
        return Field_(
            value=None,
            source=Source.ADMIN,
            confidence=Confidence.NONE,
            raw_text=raw_text,
            locator=locator,
        )

    return Field_(
        value=value,
        source=Source.ADMIN,
        confidence=(
            Confidence.CERTAIN
            if observation.confidence >= 0.9
            else Confidence.HIGH
        ),
        raw_text=raw_text,
        locator=locator,
    )


def _prefix(product_uuid: str, bundle_id: int) -> str:
    return f"aztek-dom:products/{product_uuid}/bundles/{bundle_id}"


def _as_int(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("boolean is not an integer")
    return int(str(value).replace(",", "").strip())


def _as_float(value: Any) -> float:
    if isinstance(value, bool):
        raise ValueError("boolean is not a price")
    return float(str(value).replace(",", "").strip())


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d %b %Y %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"unsupported date {value!r}")


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError(f"unsupported datetime {value!r}") from error
    if parsed.tzinfo is None:
        raise ValueError("Aztek datetime has no timezone")
    return parsed


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().casefold()
        if normalized in {"true", "yes", "1", "permanent", "ถาวร"}:
            return True
        if normalized in {"false", "no", "0", "temporary", "ชั่วคราว"}:
            return False
    if isinstance(value, int) and value in {0, 1}:
        return bool(value)
    raise ValueError(f"unsupported bool {value!r}")
