from pathlib import Path

from packqa.adapters import (
    apply_website_observations,
    load_bundles,
    load_bundles_text,
    load_website_observations,
    load_website_observations_text,
)
from packqa.model import Confidence, Source
from packqa.rules import RuleEngine, Status

ROOT = Path(__file__).resolve().parents[1]
ENGINE = RuleEngine.from_yaml(ROOT / "pack_rules.yaml")


def real_bundle_and_observation():
    bundle = load_bundles(ROOT / "fixtures" / "dao_225.real.yaml")[0]
    observation = load_website_observations(
        ROOT / "fixtures" / "dao_225.website_ocr.yaml"
    )[bundle.bundle_id]
    return bundle, observation


def test_ocr_observation_resolves_ids_from_spec_with_provenance() -> None:
    bundle, observation = real_bundle_and_observation()
    updated = apply_website_observations(
        [bundle], {bundle.bundle_id: observation}
    )[0]

    assert updated.website is not None
    ids = [item.item_id.value for item in updated.website.items]
    assert ids == ["Currency", "1315001", "Web-Currency"]
    assert all(
        item.item_id.source is Source.SPEC for item in updated.website.items
    )
    assert all(
        item.amount.source is Source.WEBSITE
        for item in updated.website.items
    )
    assert all(
        item.amount.confidence is Confidence.HIGH
        for item in updated.website.items
    )


def test_real_ocr_observation_passes_all_rules() -> None:
    bundle, observation = real_bundle_and_observation()
    updated = apply_website_observations(
        [bundle], {bundle.bundle_id: observation}
    )[0]

    findings = ENGINE.evaluate(updated)

    assert len(findings) == 13
    assert all(finding.status is Status.PASS for finding in findings)


def test_low_confidence_amount_is_unverifiable_not_fail() -> None:
    bundle, observation = real_bundle_and_observation()
    first_item = observation.items[0]
    low_amount = first_item.amount.model_copy(update={"confidence": 0.40})
    low_item = first_item.model_copy(update={"amount": low_amount})
    low_observation = observation.model_copy(
        update={"items": [low_item, *observation.items[1:]]}
    )
    updated = apply_website_observations(
        [bundle], {bundle.bundle_id: low_observation}
    )[0]

    findings = ENGINE.evaluate(updated)
    gold_amount = next(
        finding
        for finding in findings
        if finding.rule_id == "ITEM_AMOUNT_WEBSITE"
        and "item_id=Currency]" in finding.field
    )
    assert gold_amount.status is Status.UNVERIFIABLE
    assert not any(finding.status is Status.FAIL for finding in findings)


def test_unresolved_item_name_is_unverifiable_not_false_fail() -> None:
    bundle, observation = real_bundle_and_observation()
    first_item = observation.items[0]
    unknown_name = first_item.name.model_copy(
        update={"value": "Unreadable Item", "raw_text": "Unreadable Item"}
    )
    unresolved_item = first_item.model_copy(update={"name": unknown_name})
    unresolved_observation = observation.model_copy(
        update={"items": [unresolved_item, *observation.items[1:]]}
    )
    updated = apply_website_observations(
        [bundle], {bundle.bundle_id: unresolved_observation}
    )[0]

    findings = ENGINE.evaluate(updated)

    assert any(
        finding.rule_id == "ITEM_AMOUNT_WEBSITE"
        and finding.status is Status.UNVERIFIABLE
        for finding in findings
    )
    assert not any(finding.status is Status.FAIL for finding in findings)


def test_truly_missing_item_still_fails_when_all_observed_ids_resolve() -> None:
    bundle, observation = real_bundle_and_observation()
    missing_observation = observation.model_copy(
        update={"items": observation.items[1:]}
    )
    updated = apply_website_observations(
        [bundle], {bundle.bundle_id: missing_observation}
    )[0]

    failures = [
        finding
        for finding in ENGINE.evaluate(updated)
        if finding.status is Status.FAIL
    ]

    assert len(failures) == 1
    assert failures[0].rule_id == "ITEM_AMOUNT_WEBSITE"
    assert "Currency" in failures[0].field


def test_repeated_gacha_name_resolves_when_all_candidates_share_one_id() -> None:
    bundle = load_bundles_text(
        """
bundles:
  - bundle_id: 7
    spec:
      is_gacha: true
      items:
        - {item_id: "10070", name: Leticia Coin Ticket, amount: 100}
        - {item_id: "10070", name: Leticia Coin Ticket, amount: 1}
    gacha:
      items:
        - {item_id: "10070", name: Leticia Coin Ticket, amount: 100, chance: 41.55}
        - {item_id: "10070", name: Leticia Coin Ticket, amount: 1, chance: 58.45}
"""
    )[0]
    observation = load_website_observations_text(
        """
bundles:
  - bundle_id: 7
    website:
      items:
        - name: {value: Leticia Coin Ticket, confidence: 0.9}
          amount: {value: 100, confidence: 0.9}
          chance: {value: 41.55, confidence: 0.9}
        - name: {value: Leticia Coin Ticket, confidence: 0.9}
          amount: {value: 1, confidence: 0.9}
          chance: {value: 58.45, confidence: 0.9}
"""
    )[7]

    updated = apply_website_observations([bundle], {7: observation})[0]
    findings = ENGINE.evaluate(updated)

    assert updated.website is not None
    assert [item.item_id.value for item in updated.website.items] == [
        "10070",
        "10070",
    ]
    assert all(
        finding.status is Status.PASS
        for finding in findings
        if finding.rule_id in {
            "ITEM_AMOUNT_WEBSITE",
            "ITEM_CHANCE_WEBSITE",
            "GACHA_CHANCE_SUM",
        }
    )


def test_human_confirmed_website_value_is_auditable_in_report() -> None:
    bundle, observation = real_bundle_and_observation()
    first_item = observation.items[0]
    confirmed_amount = first_item.amount.model_copy(
        update={"human_confirmed": True}
    )
    confirmed_item = first_item.model_copy(
        update={"amount": confirmed_amount}
    )
    confirmed_observation = observation.model_copy(
        update={"items": [confirmed_item, *observation.items[1:]]}
    )
    updated = apply_website_observations(
        [bundle], {bundle.bundle_id: confirmed_observation}
    )[0]

    finding = next(
        finding
        for finding in ENGINE.evaluate(updated)
        if finding.rule_id == "ITEM_AMOUNT_WEBSITE"
        and "human-confirmed" in (finding.actual_locator or "")
    )

    assert finding.status is Status.PASS
    assert "human-confirmed" in (finding.actual_locator or "")
    assert finding.message.endswith("human confirmed")


def test_confident_wrong_website_name_fails_against_spec() -> None:
    bundle, observation = real_bundle_and_observation()
    assert observation.name is not None
    wrong_name = observation.name.model_copy(
        update={
            "value": "Wrong Pack",
            "confidence": 0.95,
            "raw_text": "Wrong Pack",
            "human_confirmed": False,
        }
    )
    updated = apply_website_observations(
        [bundle],
        {
            bundle.bundle_id: observation.model_copy(
                update={"name": wrong_name}
            )
        },
    )[0]

    finding = next(
        finding
        for finding in ENGINE.evaluate(updated)
        if finding.rule_id == "PACK_NAME_WEBSITE"
    )

    assert finding.status is Status.FAIL
    assert finding.expected == bundle.spec.name.value
    assert finding.actual == "Wrong Pack"


def test_low_confidence_website_price_is_unverifiable_not_fail() -> None:
    bundle, observation = real_bundle_and_observation()
    assert observation.seed_point is not None
    unclear_price = observation.seed_point.model_copy(
        update={"confidence": 0.4, "human_confirmed": False}
    )
    updated = apply_website_observations(
        [bundle],
        {
            bundle.bundle_id: observation.model_copy(
                update={"seed_point": unclear_price}
            )
        },
    )[0]

    finding = next(
        finding
        for finding in ENGINE.evaluate(updated)
        if finding.rule_id == "SEED_POINT_WEBSITE"
    )

    assert finding.status is Status.UNVERIFIABLE
