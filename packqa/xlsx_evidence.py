"""Read-only extraction of embedded images from one XLSX worksheet.

This is migration/test-data tooling, not a rule-engine adapter.  It keeps XLSX
knowledge outside the canonical model and emits an auditable JSON manifest
that a human or OCR provider can use to select Website evidence.
"""

from __future__ import annotations

import json
import posixpath
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile

_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_DOC_REL = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)
_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
_XDR = (
    "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
)
_DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main"


def extract_sheet_evidence(
    workbook_path: str | Path,
    sheet_name: str,
    output_dir: str | Path,
) -> dict[str, Any]:
    """Extract embedded images and return the written manifest."""

    source_path = Path(workbook_path)
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)

    with ZipFile(source_path) as archive:
        worksheet_part = _worksheet_part(archive, sheet_name)
        worksheet = _xml(archive, worksheet_part)
        worksheet_rels = _relationships(archive, worksheet_part)
        drawing_ids = [
            element.attrib[f"{{{_DOC_REL}}}id"]
            for element in worksheet.findall(f"{{{_MAIN}}}drawing")
        ]

        images: list[dict[str, Any]] = []
        for drawing_id in drawing_ids:
            drawing_rel = worksheet_rels.get(drawing_id)
            if drawing_rel is None or not drawing_rel["type"].endswith(
                "/drawing"
            ):
                continue
            drawing_part = drawing_rel["target"]
            drawing = _xml(archive, drawing_part)
            drawing_rels = _relationships(archive, drawing_part)
            for anchor in list(drawing):
                image = _image_from_anchor(
                    archive,
                    anchor,
                    drawing_rels,
                    len(images),
                    destination,
                )
                if image is not None:
                    images.append(image)

    manifest = {
        "source_workbook": str(source_path),
        "sheet": sheet_name,
        "worksheet_part": worksheet_part,
        "images": images,
    }
    manifest_path = destination / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


def _worksheet_part(archive: ZipFile, sheet_name: str) -> str:
    workbook_part = "xl/workbook.xml"
    workbook = _xml(archive, workbook_part)
    relationships = _relationships(archive, workbook_part)
    for sheet in workbook.findall(f".//{{{_MAIN}}}sheet"):
        if sheet.attrib.get("name") != sheet_name:
            continue
        relationship_id = sheet.attrib.get(f"{{{_DOC_REL}}}id")
        relationship = relationships.get(str(relationship_id))
        if relationship is None:
            break
        return relationship["target"]
    raise ValueError(f"worksheet {sheet_name!r} not found")


def _image_from_anchor(
    archive: ZipFile,
    anchor: ET.Element,
    relationships: dict[str, dict[str, str]],
    index: int,
    output_dir: Path,
) -> dict[str, Any] | None:
    blip = anchor.find(f".//{{{_DRAWING}}}blip")
    if blip is None:
        return None
    relationship_id = blip.attrib.get(f"{{{_DOC_REL}}}embed")
    relationship = relationships.get(str(relationship_id))
    if relationship is None or not relationship["type"].endswith("/image"):
        return None

    media_part = relationship["target"]
    media_name = PurePosixPath(media_part).name
    output_name = f"{index:03d}_{media_name}"
    (output_dir / output_name).write_bytes(archive.read(media_part))

    start = anchor.find(f"{{{_XDR}}}from")
    end = anchor.find(f"{{{_XDR}}}to")
    extent = anchor.find(f"{{{_XDR}}}ext")
    return {
        "index": index,
        "media_part": media_part,
        "output_file": output_name,
        "anchor_type": _local_name(anchor.tag),
        "from": _marker(start),
        "to": _marker(end),
        "extent": (
            {
                "width_emu": int(extent.attrib.get("cx", 0)),
                "height_emu": int(extent.attrib.get("cy", 0)),
                "width_px": round(int(extent.attrib.get("cx", 0)) / 9525),
                "height_px": round(int(extent.attrib.get("cy", 0)) / 9525),
            }
            if extent is not None
            else None
        ),
    }


def _marker(element: ET.Element | None) -> dict[str, int] | None:
    if element is None:
        return None

    def integer(name: str) -> int:
        child = element.find(f"{{{_XDR}}}{name}")
        return int(child.text or 0) if child is not None else 0

    return {
        "row": integer("row"),
        "column": integer("col"),
        "row_offset_emu": integer("rowOff"),
        "column_offset_emu": integer("colOff"),
    }


def _relationships(
    archive: ZipFile, source_part: str
) -> dict[str, dict[str, str]]:
    relation_part = posixpath.join(
        posixpath.dirname(source_part),
        "_rels",
        f"{posixpath.basename(source_part)}.rels",
    )
    try:
        root = _xml(archive, relation_part)
    except KeyError:
        return {}

    relationships: dict[str, dict[str, str]] = {}
    for relation in root.findall(f"{{{_PKG_REL}}}Relationship"):
        relationship_id = relation.attrib["Id"]
        relationships[relationship_id] = {
            "type": relation.attrib["Type"],
            "target": _resolve_part(source_part, relation.attrib["Target"]),
        }
    return relationships


def _resolve_part(source_part: str, target: str) -> str:
    if target.startswith("/"):
        resolved = posixpath.normpath(target.lstrip("/"))
    else:
        resolved = posixpath.normpath(
            posixpath.join(posixpath.dirname(source_part), target)
        )
    if resolved == ".." or resolved.startswith("../"):
        raise ValueError(f"relationship escapes XLSX package: {target!r}")
    return resolved


def _xml(archive: ZipFile, part: str) -> ET.Element:
    return ET.fromstring(archive.read(part))


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]
