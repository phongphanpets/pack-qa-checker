from pathlib import Path

from packqa.adapters.yaml_adapter import load_bundles
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
