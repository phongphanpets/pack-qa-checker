"""JSON and single-table HTML reports for canonical validation results."""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment
from pydantic import BaseModel, Field

from packqa.model import PackBundle
from packqa.rules.engine import Finding, RuleEngine, Status


class BundleReport(BaseModel):
    bundle_id: int
    name: str | None
    findings: list[Finding] = Field(default_factory=list)


class ValidationReport(BaseModel):
    generated_at: datetime
    summary: dict[str, int]
    bundles: list[BundleReport]


def build_report(
    engine: RuleEngine, bundles: Iterable[PackBundle]
) -> ValidationReport:
    """Evaluate bundles and retain bundle context around each finding."""

    bundle_reports = [
        BundleReport(
            bundle_id=bundle.bundle_id,
            name=bundle.spec.name.value,
            findings=engine.evaluate(bundle),
        )
        for bundle in bundles
    ]
    findings = [
        finding
        for bundle_report in bundle_reports
        for finding in bundle_report.findings
    ]
    summary = {
        "bundles": len(bundle_reports),
        "checks": len(findings),
        **{
            status.value: sum(
                finding.status is status for finding in findings
            )
            for status in Status
        },
    }
    return ValidationReport(
        generated_at=datetime.now(UTC),
        summary=summary,
        bundles=bundle_reports,
    )


def write_json_report(report: ValidationReport, path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        report.model_dump_json(indent=2),
        encoding="utf-8",
    )
    return output_path


def write_html_report(report: ValidationReport, path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    template = _ENV.from_string(_HTML_TEMPLATE)
    output_path.write_text(
        template.render(report=report, display=_display),
        encoding="utf-8",
    )
    return output_path


def _display(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


_ENV = Environment(autoescape=True)

_HTML_TEMPLATE = """<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pack QA Validation Report</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, "Noto Sans Thai", system-ui, sans-serif;
      background: #f5f7fa;
      color: #172033;
    }
    body { margin: 0; padding: 28px; }
    main { max-width: 1500px; margin: 0 auto; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    .meta { color: #667085; margin-bottom: 20px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(6, minmax(110px, 1fr));
      gap: 10px;
      margin: 0 0 22px;
    }
    .card {
      background: white;
      border: 1px solid #e4e7ec;
      border-radius: 10px;
      padding: 14px;
      box-shadow: 0 1px 2px rgb(16 24 40 / 5%);
    }
    .card span { display: block; color: #667085; font-size: 12px; }
    .card strong { display: block; margin-top: 4px; font-size: 24px; }
    .table-wrap {
      overflow-x: auto;
      background: white;
      border: 1px solid #e4e7ec;
      border-radius: 10px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      position: sticky;
      top: 0;
      text-align: left;
      background: #f9fafb;
      color: #475467;
      padding: 11px 10px;
      border-bottom: 1px solid #e4e7ec;
      white-space: nowrap;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #eef0f3;
      vertical-align: top;
    }
    tr:last-child td { border-bottom: 0; }
    code { font-family: "Cascadia Code", monospace; font-size: 12px; }
    .status {
      display: inline-block;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
    }
    .PASS { background: #dcfae6; color: #067647; }
    .FAIL { background: #fee4e2; color: #b42318; }
    .WARN { background: #fef0c7; color: #b54708; }
    .UNVERIFIABLE { background: #e4e7ec; color: #344054; }
    .locator { min-width: 180px; color: #475467; }
    .message { min-width: 260px; }
    @media (max-width: 900px) {
      body { padding: 16px; }
      .summary { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
<main>
  <h1>Pack QA Validation Report</h1>
  <div class="meta">Generated {{ report.generated_at.isoformat() }}</div>
  <section class="summary" aria-label="Validation summary">
    {% for key in ["bundles", "checks", "PASS", "FAIL", "WARN", "UNVERIFIABLE"] %}
      <div class="card"><span>{{ key }}</span><strong>{{ report.summary[key] }}</strong></div>
    {% endfor %}
  </section>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Bundle</th><th>Pack</th><th>Check</th><th>Rule</th>
          <th>Field</th><th>Source</th><th>Status</th>
          <th>Expected</th><th>Actual</th><th>Locator</th><th>Message</th>
        </tr>
      </thead>
      <tbody>
      {% for bundle in report.bundles %}
        {% for finding in bundle.findings %}
        <tr>
          <td><code>{{ bundle.bundle_id }}</code></td>
          <td>{{ bundle.name or "—" }}</td>
          <td>{{ finding.check }}</td>
          <td><code>{{ finding.rule_id }}</code></td>
          <td><code>{{ finding.field }}</code></td>
          <td>{{ finding.source.value }}</td>
          <td><span class="status {{ finding.status.value }}">{{ finding.status.value }}</span></td>
          <td>{{ display(finding.expected) }}</td>
          <td>{{ display(finding.actual) }}</td>
          <td class="locator">
            {{ finding.actual_locator or finding.expected_locator or "—" }}
          </td>
          <td class="message">{{ finding.message }}</td>
        </tr>
        {% endfor %}
      {% endfor %}
      </tbody>
    </table>
  </div>
</main>
</body>
</html>
"""
