import json
from pathlib import Path

import yaml

from packqa.adapters.yaml_adapter import load_bundles
from packqa.cli import main
from packqa.reporting import build_report, write_html_report, write_json_report
from packqa.rules.engine import RuleEngine, Status

ROOT = Path(__file__).resolve().parents[1]


def test_report_summary_and_provenance() -> None:
    engine = RuleEngine.from_yaml(ROOT / "pack_rules.yaml")
    bundles = load_bundles(ROOT / "fixtures" / "dao_167.regression.yaml")

    report = build_report(engine, bundles)

    assert report.summary["bundles"] == 7
    assert report.summary["FAIL"] == 1
    assert report.summary["UNVERIFIABLE"] == 0
    failure = next(
        finding
        for bundle in report.bundles
        for finding in bundle.findings
        if finding.status is Status.FAIL
    )
    assert failure.actual_locator == "website image: Aura Black amount"
    assert failure.actual_raw_text == "2x"


def test_report_writers_create_valid_json_and_html(tmp_path: Path) -> None:
    engine = RuleEngine.from_yaml(ROOT / "pack_rules.yaml")
    bundles = load_bundles(ROOT / "fixtures" / "gsp_x49.synthetic.yaml")
    report = build_report(engine, bundles)
    json_path = write_json_report(report, tmp_path / "gsp.json")
    html_path = write_html_report(report, tmp_path / "gsp.html")

    document = json.loads(json_path.read_text(encoding="utf-8"))
    html = html_path.read_text(encoding="utf-8")
    assert document["summary"]["FAIL"] == 1
    assert document["bundles"][0]["findings"][0]["rule_id"]
    assert "<table>" in html
    assert "GSP_EQ_SEED" in html
    assert "synthetic website GSP earn" in html


def test_cli_writes_both_formats_and_returns_failure_exit_code(
    tmp_path: Path,
) -> None:
    output = tmp_path / "validation.html"
    exit_code = main(
        [
            "validate",
            str(ROOT / "fixtures" / "gsp_x49.synthetic.yaml"),
            "--rules",
            str(ROOT / "pack_rules.yaml"),
            "--output",
            str(output),
        ]
    )

    assert exit_code == 1
    assert output.exists()
    assert output.with_suffix(".json").exists()


def test_real_dao_225_report_matches_expected_summary() -> None:
    engine = RuleEngine.from_yaml(ROOT / "pack_rules.yaml")
    bundles = load_bundles(ROOT / "fixtures" / "dao_225.real.yaml")
    report = build_report(engine, bundles)
    with (ROOT / "fixtures" / "dao_225.expected.yaml").open(
        encoding="utf-8"
    ) as stream:
        expected = yaml.safe_load(stream)

    assert report.summary == expected["summary"]


def test_cli_can_replace_website_pack_from_ocr_observations(
    tmp_path: Path,
) -> None:
    output = tmp_path / "real-ocr.html"
    exit_code = main(
        [
            "validate",
            str(ROOT / "fixtures" / "dao_225.real.yaml"),
            "--website-ocr",
            str(ROOT / "fixtures" / "dao_225.website_ocr.yaml"),
            "--rules",
            str(ROOT / "pack_rules.yaml"),
            "--output",
            str(output),
        ]
    )

    report = json.loads(output.with_suffix(".json").read_text("utf-8"))
    assert exit_code == 0
    assert report["summary"]["PASS"] == 13
    assert report["summary"]["FAIL"] == 0
    assert report["summary"]["UNVERIFIABLE"] == 0
