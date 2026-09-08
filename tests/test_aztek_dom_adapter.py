import json
from pathlib import Path

import pytest

from packqa.adapters.aztek_dom import (
    AztekDomAdapterError,
    AztekDomObservationDocument,
    AztekDomTarget,
    apply_aztek_dom_observations,
    load_aztek_dom_observations_text,
)
from packqa.adapters.yaml_adapter import load_bundles_text
from packqa.model import Confidence, Source
from packqa.rules import RuleEngine, Status

ROOT = Path(__file__).resolve().parents[1]

PRODUCT_UUID = "a2a598c7-7e83-40d8-8ff8-3e8e88685fb9"


def _spec_bundles():
    return load_bundles_text(
        """
bundles:
  - bundle_id: 115184
    spec:
      name: TP & Gold 9.1
      purchase_limit: 3
      start_date: 2026-09-02
      end_date: 2026-09-30
      items:
        - {item_id: GSP, name: Golden Seed Point, amount: 90}
"""
    )


def _document() -> AztekDomObservationDocument:
    return AztekDomObservationDocument.model_validate(
        {
            "products": [
                {
                    "product_uuid": PRODUCT_UUID,
                    "name": {
                        "value": "TP & Gold 9.1",
                        "raw_text": "TP & Gold 9.1",
                        "locator": "label:ชื่อสินค้า (ไทย) *",
                    },
                    "price": {"value": "90", "locator": "label:ราคาขาย"},
                    "full_price": {"value": "180", "locator": "label:ราคาเต็ม"},
                    "currency": {"value": "SP", "locator": "label:สกุลเงิน"},
                    "enabled": {"value": True, "locator": "switch:เปิดใช้งาน"},
                    "hidden": {"value": False, "locator": "switch:ซ่อนสินค้า"},
                    "test_mode": {"value": True, "locator": "switch:โหมดทดสอบ"},
                    "player_limit": {"value": "3", "locator": "limit:PLAYER"},
                    "server_limit": {"value": "10", "locator": "limit:SERVER"},
                    "character_limit": {"value": "1", "locator": "limit:CHARACTER"},
                    "product_limit": {"value": "2", "locator": "limit:PRODUCT"},
                    "reset_interval": {"value": "1 day", "locator": "label:Reset interval"},
                    "next_reset_at": {
                        "value": "2026-09-03T00:01:00+07:00",
                        "locator": "label:Next reset",
                    },
                    "purchase_limit": {
                        "value": "3",
                        "raw_text": "3",
                        "locator": "label:จำนวนครั้งที่ซื้อต่อผู้เล่น",
                    },
                    "start_date": {
                        "value": "2026-09-02T18:00:00+07:00",
                        "raw_text": "02 Sep 2026 18:00:00",
                        "locator": "label:วันเวลาเริ่มขาย",
                    },
                    "end_date": {
                        "value": "2026-09-30T23:59:59+07:00",
                        "raw_text": "30 Sep 2026 23:59:59",
                        "locator": "label:วันเวลาสิ้นสุด",
                    },
                    "bundles": [
                        {
                            "bundle_id": 115184,
                            "bundle_type": {"value": "FIXED"},
                            "is_primary": {"value": True, "locator": "text:Primary"},
                            "seed_point": {"value": "90"},
                            "gsp_earn": {"value": "90"},
                            "items": [
                                {
                                    "item_id": {"value": "GSP"},
                                    "name": {"value": "Golden Seed Point"},
                                    "amount": {"value": "90"},
                                }
                            ],
                        }
                    ],
                }
            ]
        }
    )


def _targets():
    return [AztekDomTarget(product_uuid=PRODUCT_UUID, bundle_id=115184)]


def test_aztek_dom_adapter_projects_readback_with_provenance() -> None:
    bundle = apply_aztek_dom_observations(
        _spec_bundles(), _document(), _targets()
    )[0]

    assert bundle.admin is not None
    assert bundle.admin.source is Source.ADMIN
    assert bundle.admin.name.value == "TP & Gold 9.1"
    assert bundle.admin.name.source is Source.ADMIN
    assert bundle.admin.name.confidence is Confidence.CERTAIN
    assert bundle.admin.name.raw_text == "TP & Gold 9.1"
    assert bundle.admin.name.locator == "label:ชื่อสินค้า (ไทย) *"
    assert bundle.admin.start_date.value.isoformat() == "2026-09-02"
    assert bundle.admin.items[0].item_id.value == "GSP"
    assert bundle.admin.items[0].amount.value == 90
    assert not bundle.admin.is_gacha
    assert bundle.admin.bundle_type is not None
    assert bundle.admin.bundle_type.value == "FIXED"

    assert bundle.product is not None
    assert bundle.product.product_uuid.value == PRODUCT_UUID
    assert bundle.product.price is not None
    assert bundle.product.price.value == 90.0
    assert bundle.product.currency is not None
    assert bundle.product.currency.value == "SP"
    assert bundle.product.enabled is not None and bundle.product.enabled.value is True
    assert bundle.product.hidden is not None and bundle.product.hidden.value is False
    assert bundle.product.test_mode is not None and bundle.product.test_mode.value is True
    assert bundle.product.starts_at is not None
    assert bundle.product.starts_at.value is not None
    assert bundle.product.starts_at.value.isoformat() == "2026-09-02T18:00:00+07:00"
    assert bundle.product.next_reset_at is not None
    assert bundle.product.next_reset_at.value is not None
    assert bundle.product.next_reset_at.value.tzinfo is not None
    assert bundle.product.purchase_limits.player is not None
    assert bundle.product.purchase_limits.player.value == 3
    assert bundle.product.purchase_limits.server is not None
    assert bundle.product.purchase_limits.server.value == 10
    assert bundle.product.bundle_links[0].is_primary is not None
    assert bundle.product.bundle_links[0].is_primary.value is True

    engine = RuleEngine.from_yaml(ROOT / "pack_rules.yaml")
    admin_findings = [
        finding
        for finding in engine.evaluate(bundle)
        if finding.source is Source.ADMIN
    ]
    assert admin_findings
    assert all(finding.status is Status.PASS for finding in admin_findings)


def test_adapter_never_joins_by_display_name() -> None:
    with pytest.raises(AztekDomAdapterError, match="missing target"):
        apply_aztek_dom_observations(
            _spec_bundles(),
            _document(),
            [
                AztekDomTarget(
                    product_uuid="same-name-but-different-product",
                    bundle_id=115184,
                )
            ],
        )


def test_low_confidence_dom_value_becomes_unverifiable() -> None:
    raw = _document().model_dump(mode="json")
    raw["products"][0]["purchase_limit"]["confidence"] = 0.4
    document = AztekDomObservationDocument.model_validate(raw)

    bundle = apply_aztek_dom_observations(
        _spec_bundles(), document, _targets()
    )[0]

    assert bundle.admin is not None
    assert bundle.admin.purchase_limit.value is None
    assert bundle.admin.purchase_limit.confidence is Confidence.LOW


def test_snapshot_text_is_json_and_keeps_the_contract_token_free() -> None:
    document = load_aztek_dom_observations_text(
        json.dumps(_document().model_dump(mode="json")),
        source_name="fixture.json",
    )
    assert document.products[0].product_uuid == PRODUCT_UUID


def test_target_must_reference_existing_canonical_bundle() -> None:
    with pytest.raises(AztekDomAdapterError, match="unknown canonical bundle_id"):
        apply_aztek_dom_observations(
            _spec_bundles(),
            _document(),
            [AztekDomTarget(product_uuid=PRODUCT_UUID, bundle_id=999999)],
        )
