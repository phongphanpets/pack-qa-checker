"""Command-line entry point for end-to-end Pack QA validation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

from packqa.adapters.yaml_adapter import YamlAdapterError, load_bundles
from packqa.adapters.website_ocr import (
    apply_website_observations,
    load_website_observations,
)
from packqa.reporting import build_report, write_html_report, write_json_report
from packqa.rules.engine import RuleEngine
from packqa.xlsx_evidence import extract_sheet_evidence


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.command == "extract-evidence":
        try:
            manifest = extract_sheet_evidence(
                args.workbook,
                args.sheet,
                args.output,
            )
        except (OSError, ValueError) as error:
            print(f"Pack QA error: {error}", file=sys.stderr)
            return 2
        print(
            f"Extracted {len(manifest['images'])} image(s) from "
            f"{args.sheet!r}"
        )
        print(f"Manifest: {Path(args.output) / 'manifest.json'}")
        return 0
    if args.command == "serve-api":
        from packqa.web_api import serve

        serve(
            args.host,
            args.port,
            rules_path=args.rules,
        )
        return 0
    if args.command != "validate":
        parser.error("a command is required")

    try:
        bundles = load_bundles(args.input)
        if args.website_ocr is not None:
            bundles = apply_website_observations(
                bundles,
                load_website_observations(args.website_ocr),
            )
        engine = RuleEngine.from_yaml(args.rules)
        report = build_report(engine, bundles)
        html_path, json_path = _output_paths(args.output)
        write_html_report(report, html_path)
        write_json_report(report, json_path)
    except (OSError, ValueError, YamlAdapterError) as error:
        print(f"Pack QA error: {error}", file=sys.stderr)
        return 2

    summary = report.summary
    print(
        f"Validated {summary['bundles']} bundle(s): "
        f"PASS={summary['PASS']} FAIL={summary['FAIL']} "
        f"WARN={summary['WARN']} "
        f"UNVERIFIABLE={summary['UNVERIFIABLE']}"
    )
    print(f"HTML: {html_path}")
    print(f"JSON: {json_path}")
    return 1 if summary["FAIL"] else 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="packqa")
    subparsers = parser.add_subparsers(dest="command")
    validate = subparsers.add_parser(
        "validate",
        help="validate human-authored YAML and write HTML + JSON reports",
    )
    validate.add_argument("input", type=Path, help="input YAML file")
    validate.add_argument(
        "--rules",
        type=Path,
        default=Path("pack_rules.yaml"),
        help="declarative rules YAML (default: pack_rules.yaml)",
    )
    validate.add_argument(
        "--website-ocr",
        type=Path,
        help=(
            "optional provider-independent Website OCR observations YAML; "
            "matching Website packs replace those in the input"
        ),
    )
    validate.add_argument(
        "--output",
        type=Path,
        default=Path("packqa-report.html"),
        help=(
            "HTML or JSON output path; the sibling format is written "
            "automatically"
        ),
    )
    extract = subparsers.add_parser(
        "extract-evidence",
        help="extract embedded images + manifest from one XLSX worksheet",
    )
    extract.add_argument("workbook", type=Path, help="source XLSX workbook")
    extract.add_argument("--sheet", required=True, help="worksheet name")
    extract.add_argument(
        "--output",
        type=Path,
        required=True,
        help="directory for extracted images and manifest.json",
    )
    api = subparsers.add_parser(
        "serve-api",
        help="run the local-only validation API for the Phase 1 web UI",
    )
    api.add_argument("--host", default="127.0.0.1")
    api.add_argument("--port", type=int, default=8765)
    api.add_argument(
        "--rules",
        type=Path,
        default=Path("pack_rules.yaml"),
    )
    return parser


def _output_paths(output: Path) -> tuple[Path, Path]:
    suffix = output.suffix.lower()
    if suffix == ".html":
        return output, output.with_suffix(".json")
    if suffix == ".json":
        return output.with_suffix(".html"), output
    return output.with_suffix(".html"), output.with_suffix(".json")
