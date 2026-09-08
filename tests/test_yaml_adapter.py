from pathlib import Path

from packqa.adapters.yaml_adapter import load_bundles, load_bundles_text
from packqa.model import Confidence, Source

ROOT = Path(__file__).resolve().parents[1]


def test_yaml_adapter_builds_canonical_model_with_provenance() -> None:
    bundle = load_bundles(ROOT / "fixtures" / "gsp_x49.synthetic.yaml")[0]

    assert bundle.bundle_id == 990049
    assert bundle.website is not None
    assert bundle.website.gsp_earn.value == 49
    assert bundle.website.gsp_earn.source is Source.WEBSITE
    assert bundle.website.gsp_earn.confidence is Confidence.CERTAIN
    assert bundle.website.gsp_earn.raw_text == "x49"
    assert bundle.website.gsp_earn.locator == "synthetic website GSP earn"


def test_missing_source_fields_are_unverifiable_not_fabricated() -> None:
    bundle = load_bundles(ROOT / "fixtures" / "gsp_x49.synthetic.yaml")[0]

    assert bundle.admin is not None
    assert bundle.admin.purchase_limit.value is None
    assert bundle.admin.purchase_limit.confidence is Confidence.NONE
    assert not bundle.admin.purchase_limit.is_verifiable


def test_field_level_source_override_preserves_reconciled_identity() -> None:
    bundle = load_bundles(ROOT / "fixtures" / "dao_225.real.yaml")[0]

    assert bundle.website is not None
    assert bundle.website.items[0].item_id.source is Source.SPEC
    assert bundle.website.items[0].amount.source is Source.WEBSITE
    assert "resolved from Fellow Coin" in (
        bundle.website.items[0].item_id.raw_text or ""
    )


def test_yaml_adapter_accepts_product_listing_with_scoped_limits() -> None:
    bundle = load_bundles_text(
        """
bundles:
  - bundle_id: 115184
    spec: {name: "TP & Gold 9.1", items: []}
    product:
      source: admin
      product_uuid: a2a598c7-7e83-40d8-8ff8-3e8e88685fb9
      price: 90
      currency: SP
      enabled: true
      test_mode: true
      starts_at: 2026-09-02T18:00:00+07:00
      ends_at: 2026-09-30T23:59:59+07:00
      purchase_limits: {player: 3, server: 10, character: 1, product: 2}
      bundle_links:
        - {bundle_id: 115184, is_primary: true}
"""
    )[0]

    assert bundle.product is not None
    assert bundle.product.product_uuid.value == "a2a598c7-7e83-40d8-8ff8-3e8e88685fb9"
    assert bundle.product.purchase_limits.player is not None
    assert bundle.product.purchase_limits.player.value == 3
    assert bundle.product.starts_at is not None
    assert bundle.product.starts_at.value is not None
    assert bundle.product.starts_at.value.utcoffset().total_seconds() == 7 * 60 * 60
