from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape
import re

source_path = Path(r"C:\Users\User\.codex\attachments\13bdc82e-4955-4790-9c4b-17c0b19fe1af\pasted-text.txt")
template_path = Path(r"C:\Users\User\Downloads\Bundle Import Template (3).xlsx")
output_path = Path(r"C:\Users\User\Desktop\Pack_QA_Checker\exports\Streamer-itemcode-8-15-Sep-bundle-import-template.xlsx")

rows = [line.split("\t") for line in source_path.read_text(encoding="utf-8").rstrip().splitlines()]
dates = [rows[0][column + 1].strip() for column in range(0, 80, 10)]
bundles = []
for row_index, row in enumerate(rows):
    for day_index, date in enumerate(dates):
        base = day_index * 10
        code = re.fullmatch(r"Code #(\d+)", row[base].strip() if base < len(row) else "")
        if not code:
            continue
        items = []
        for item_row in rows[row_index + 1:]:
            if item_row[base].strip():
                break
            item_id, name, amount = item_row[base + 2].strip(), item_row[base + 3].strip(), item_row[base + 4].strip()
            if item_id and name and amount and float(amount.replace(",", "")) > 0:
                items.append((item_id, name, float(amount.replace(",", ""))))
        if not items:
            raise RuntimeError(f"No items found for {date} #{code.group(1)}")
        day = re.match(r"\d+", date).group(0)
        bundles.append((f"Streamer itemcode {day}/9 #{code.group(1)}", items))

if len(bundles) != 24:
    raise RuntimeError(f"Expected 24 bundles, got {len(bundles)}")

def col(index):
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name

def string_cell(ref, style, value):
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'

def number_cell(ref, style, value):
    integer = int(value) if float(value).is_integer() else value
    return f'<c r="{ref}" s="{style}"><v>{integer}</v></c>'

data_rows = []
row_number = 2
for bundle_name, items in bundles:
    for order, (item_id, item_name, amount) in enumerate(items, start=1):
        exported_id = 101147 if item_id.lower() == "currency" else item_id
        cells = [
            string_cell(f"A{row_number}", 3, bundle_name),
            string_cell(f"B{row_number}", 3, "FIXED"),
            string_cell(f"C{row_number}", 3, "ITEM"),
            number_cell(f"D{row_number}", 4, exported_id),
            number_cell(f"E{row_number}", 3, amount),
            string_cell(f"F{row_number}", 3, "Trainee"),
            number_cell(f"G{row_number}", 3, order),
            f'<c r="H{row_number}" s="3"/>',
            f'<c r="I{row_number}" s="3"/>',
        ]
        data_rows.append(f'<row r="{row_number}" ht="22.5" customHeight="1">{"".join(cells)}</row>')
        row_number += 1

with ZipFile(template_path) as template:
    sheet = template.read("xl/worksheets/sheet1.xml").decode("utf-8")
    header = re.search(r"(<row r=\"1\"[\s\S]*?</row>)", sheet).group(1)
    replacement = f"<sheetData>{header}{''.join(data_rows)}</sheetData>"
    sheet = re.sub(r"<sheetData>[\s\S]*?</sheetData>", replacement, sheet, count=1)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output_path, "w", ZIP_DEFLATED) as output:
        for entry in template.infolist():
            output.writestr(entry, sheet.encode("utf-8") if entry.filename == "xl/worksheets/sheet1.xml" else template.read(entry.filename))

print(f"{output_path}\nBundles: {len(bundles)}\nItems: {len(data_rows)}")
