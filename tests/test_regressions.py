from pathlib import Path

import pytest
import yaml

from packqa.adapters.yaml_adapter import load_bundles
from packqa.adapters.yaml_adapter import load_bundles_text
from packqa.rules.engine import RuleEngine, Status

ROOT = Path(__file__).resolve().parents[1]
ENGINE = RuleEngine.from_yaml(ROOT / "pack_rules.yaml")


def expected_failures(filename: str):
    with (ROOT / "fixtures" / filename).open(encoding="utf-8") as stream:
        return yaml.safe_load(stream)["failures"]


def actual_failure(bundle, finding):
    return {
        "bundle_id": bundle.bundle_id,
        "rule_id": finding.rule_id,
        "field": finding.field,
        "source": finding.source.value,
        "expected": finding.expected,
        "actual": finding.actual,
        "status": finding.status.value,
        "severity": finding.severity,
    }


@pytest.fixture(scope="module")
def dao_bundles():
    return load_bundles(ROOT / "fixtures" / "dao_167.regression.yaml")


def test_aura_black_amount_mismatch_is_the_only_failure(dao_bundles) -> None:
    aura = next(bundle for bundle in dao_bundles if bundle.bundle_id == 114434)
    failures = [
        finding
        for finding in ENGINE.evaluate(aura)
        if finding.status is Status.FAIL
    ]

    assert [actual_failure(aura, finding) for finding in failures] == (
        expected_failures("dao_167.expected.yaml")
    )


def test_gsp_x49_violates_seed_point_invariant() -> None:
    bundle = load_bundles(ROOT / "fixtures" / "gsp_x49.synthetic.yaml")[0]
    failures = [
        finding
        for finding in ENGINE.evaluate(bundle)
        if finding.status is Status.FAIL
    ]

    assert [actual_failure(bundle, finding) for finding in failures] == (
        expected_failures("gsp_x49.expected.yaml")
    )


def test_other_six_dao_packs_have_no_false_failures(dao_bundles) -> None:
    normal_bundles = [
        bundle for bundle in dao_bundles if bundle.bundle_id != 114434
    ]

    assert len(normal_bundles) == 6
    failures = [
        finding
        for bundle in normal_bundles
        for finding in ENGINE.evaluate(bundle)
        if finding.status is Status.FAIL
    ]
    assert failures == []


def test_legacy_annotation_is_skipped(dao_bundles) -> None:
    bundle = next(item for item in dao_bundles if item.bundle_id == 114437)
    item_amount_findings = [
        finding
        for finding in ENGINE.evaluate(bundle)
        if finding.rule_id == "ITEM_AMOUNT_WEBSITE"
    ]

    assert not any("GOD-COIN" in finding.field for finding in item_amount_findings)
    assert not any(finding.status is Status.FAIL for finding in item_amount_findings)


def test_missing_optional_receipt_is_not_counted(dao_bundles) -> None:
    bundle = dao_bundles[0].model_copy(update={"receipt": None})
    receipt_findings = [
        finding
        for finding in ENGINE.evaluate(bundle)
        if finding.rule_id == "ITEM_DELIVERED_RECEIPT"
    ]

    assert receipt_findings == []


def test_admin_name_and_purchase_limit_regressions_match_golden() -> None:
    bundles = load_bundles(
        ROOT / "fixtures" / "admin_and_limit.synthetic.yaml"
    )
    golden = expected_failures("admin_and_limit.expected.yaml")
    failures = [
        (bundle, finding)
        for bundle in bundles
        for finding in ENGINE.evaluate(bundle)
        if finding.status is Status.FAIL
    ]

    assert len(failures) == len(golden) == 2
    for (bundle, finding), expected in zip(failures, golden, strict=True):
        actual = {
            **actual_failure(bundle, finding),
            "actual_locator": finding.actual_locator,
        }
        assert {key: actual[key] for key in expected} == expected


def test_real_dao_225_tab_is_clean_and_fully_verifiable() -> None:
    bundle = load_bundles(ROOT / "fixtures" / "dao_225.real.yaml")[0]
    findings = ENGINE.evaluate(bundle)

    assert len(findings) == 13
    assert all(finding.status is Status.PASS for finding in findings)
    assert any(
        finding.actual_locator
        and "/xl/media/image1070.png" in finding.actual_locator
        for finding in findings
    )


def test_repeated_item_ids_are_compared_as_separate_outcomes() -> None:
    bundle = load_bundles_text(
        """
bundles:
  - bundle_id: 1
    spec:
      is_gacha: true
      items:
        - {item_id: "10070", name: Coin, amount: 2}
        - {item_id: "10070", name: Coin, amount: 100}
        - {item_id: "10070", name: Coin, amount: 1}
    website:
      items:
        - {item_id: "10070", name: Coin, amount: 2}
        - {item_id: "10070", name: Coin, amount: 1}
        - {item_id: "10070", name: Coin, amount: 100}
    gacha:
      items:
        - {item_id: "10070", name: Coin, amount: 100, chance: 41.55}
        - {item_id: "10070", name: Coin, amount: 1, chance: 58.45}
"""
    )[0]

    findings = ENGINE.evaluate(bundle)
    item_findings = [
        finding
        for finding in findings
        if finding.rule_id == "ITEM_AMOUNT_WEBSITE"
    ]
    chance_findings = [
        finding
        for finding in findings
        if finding.rule_id == "GACHA_CHANCE_SUM"
    ]

    assert len(item_findings) == 3
    assert all(finding.status is Status.PASS for finding in item_findings)
    assert len({finding.field for finding in item_findings}) == 3
    assert chance_findings[0].status is Status.PASS


def test_random_pack_conflicts_survive_even_when_chance_total_is_100() -> None:
    bundle = load_bundles_text(
        """
bundles:
  - bundle_id: 2
    spec:
      name: Correct Pack
      seed_point: 100
      is_gacha: true
      items:
        - {item_id: A, name: Coin, amount: 1}
        - {item_id: A, name: Coin, amount: 2}
    website:
      name: Wrong Pack
      seed_point: 90
      items:
        - {item_id: A, name: Coin, amount: 1, chance: 41}
        - {item_id: A, name: Coin, amount: 3, chance: 59}
    gacha:
      items:
        - {item_id: A, name: Coin, amount: 1, chance: 40}
        - {item_id: A, name: Coin, amount: 2, chance: 60}
"""
    )[0]

    findings = ENGINE.evaluate(bundle)
    failures = [
        finding for finding in findings if finding.status is Status.FAIL
    ]

    assert {
        finding.rule_id for finding in failures
    } == {
        "PACK_NAME_WEBSITE",
        "SEED_POINT_WEBSITE",
        "ITEM_AMOUNT_WEBSITE",
        "ITEM_CHANCE_WEBSITE",
    }
    assert sum(
        finding.rule_id == "ITEM_CHANCE_WEBSITE"
        for finding in failures
    ) == 2
    chance_sum = next(
        finding
        for finding in findings
        if finding.rule_id == "GACHA_CHANCE_SUM"
    )
    assert chance_sum.status is Status.PASS


def test_permanent_pack_uses_long_term_admin_status_not_exact_end_date() -> None:
    bundle = load_bundles_text(
        """
bundles:
  - bundle_id: 7002
    spec:
      name: "มือใหม่ : ใบทหาร 140"
      start_date: 2026-07-27
      is_permanent: true
      items:
        - {item_id: ITEM-1, name: Starter Item, amount: 1}
    admin:
      name: "มือใหม่ : ใบทหาร 140"
      start_date: 2026-07-27
      end_date: 2036-07-27
      is_permanent: true
"""
    )[0]

    date_findings = [
        finding
        for finding in ENGINE.evaluate(bundle)
        if finding.rule_id in {"DATE_ADMIN", "PERMANENT_ADMIN"}
    ]

    assert len(date_findings) == 2
    assert {finding.rule_id for finding in date_findings} == {
        "DATE_ADMIN",
        "PERMANENT_ADMIN",
    }
    assert all(finding.status is Status.PASS for finding in date_findings)
    assert not any(finding.field == "end_date" for finding in date_findings)


def test_permanent_pack_fails_when_admin_range_is_not_long_term() -> None:
    bundle = load_bundles_text(
        """
bundles:
  - bundle_id: 7003
    spec:
      name: Permanent Pack
      start_date: 2026-07-27
      is_permanent: true
      items:
        - {item_id: ITEM-1, name: Starter Item, amount: 1}
    admin:
      name: Permanent Pack
      start_date: 2026-07-27
      end_date: 2026-07-28
      is_permanent: false
"""
    )[0]

    finding = next(
        finding
        for finding in ENGINE.evaluate(bundle)
        if finding.rule_id == "PERMANENT_ADMIN"
    )

    assert finding.status is Status.FAIL
    assert finding.expected is True
    assert finding.actual is False


def test_extra_website_item_is_not_silently_ignored() -> None:
    bundle = load_bundles_text(
        """
bundles:
  - bundle_id: 7004
    spec:
      items:
        - {item_id: A, name: Expected, amount: 1}
    website:
      items:
        - {item_id: A, name: Expected, amount: 1}
        - {item_id: B, name: Unexpected, amount: 1}
"""
    )[0]

    item_findings = [
        finding
        for finding in ENGINE.evaluate(bundle)
        if finding.rule_id == "ITEM_AMOUNT_WEBSITE"
    ]

    assert len(item_findings) == 2
    extra = next(finding for finding in item_findings if "item_id=B" in finding.field)
    assert extra.status is Status.FAIL
    assert extra.expected is None
    assert extra.actual == 1
