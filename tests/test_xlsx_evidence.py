from pathlib import Path
from zipfile import ZipFile

import pytest

from packqa.xlsx_evidence import extract_sheet_evidence


def test_extracts_embedded_image_with_auditable_anchor(
    tmp_path: Path,
) -> None:
    workbook = tmp_path / "fixture.xlsx"
    with ZipFile(workbook, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            """<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <sheets><sheet name="ดาว Test" sheetId="1" r:id="rId1"/></sheets>
            </workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId1"
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
                Target="worksheets/sheet1.xml"/>
            </Relationships>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            """<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <drawing r:id="rId2"/>
            </worksheet>""",
        )
        archive.writestr(
            "xl/worksheets/_rels/sheet1.xml.rels",
            """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId2"
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"
                Target="../drawings/drawing1.xml"/>
            </Relationships>""",
        )
        archive.writestr(
            "xl/drawings/drawing1.xml",
            """<xdr:wsDr
              xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <xdr:oneCellAnchor>
                <xdr:from>
                  <xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff>
                  <xdr:row>31</xdr:row><xdr:rowOff>0</xdr:rowOff>
                </xdr:from>
                <xdr:ext cx="952500" cy="476250"/>
                <xdr:pic><xdr:blipFill><a:blip r:embed="rId3"/></xdr:blipFill></xdr:pic>
                <xdr:clientData/>
              </xdr:oneCellAnchor>
            </xdr:wsDr>""",
        )
        archive.writestr(
            "xl/drawings/_rels/drawing1.xml.rels",
            """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId3"
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
                Target="../media/website.png"/>
            </Relationships>""",
        )
        archive.writestr("xl/media/website.png", b"\x89PNG\r\nfixture")

    output = tmp_path / "evidence"
    manifest = extract_sheet_evidence(workbook, "ดาว Test", output)

    assert len(manifest["images"]) == 1
    image = manifest["images"][0]
    assert image["from"]["row"] == 31
    assert image["from"]["column"] == 1
    assert image["extent"]["width_px"] == 100
    assert image["extent"]["height_px"] == 50
    assert (output / image["output_file"]).read_bytes() == b"\x89PNG\r\nfixture"
    assert (output / "manifest.json").exists()


def test_unknown_sheet_is_reported(tmp_path: Path) -> None:
    workbook = tmp_path / "empty.xlsx"
    with ZipFile(workbook, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            """<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <sheets/>
            </workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>""",
        )

    with pytest.raises(ValueError, match="not found"):
        extract_sheet_evidence(workbook, "missing", tmp_path / "out")
