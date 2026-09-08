import type { SpecBundle } from "@/lib/website-ocr";

// The importer matches these labels exactly. Keep them aligned with Bundle Import Template (3).
export const bundleImportHeaders = ["Bundle Name", "Bundle Type", "Item Type", "Item ID", "Quantity", "Tier", "Position", "เรทสุ่ม", "เรทโชว์"];

export function downloadBundleImportXlsx(bundles: SpecBundle[], filename = "bundle-import.xlsx") {
  const blob = new Blob([createBundleImportXlsx(bundles)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function createBundleImportXlsx(bundles: SpecBundle[]) { return createSimpleXlsx(bundleImportHeaders, toImportRows(bundles), "Import Bundle_Final Cleaning"); }

export function createSimpleXlsx(headers: string[], rows: Array<Array<string | number | null>>, sheetName: string) {
  return xlsxFile([headers, ...rows], sheetName);
}

export function toImportRows(bundles: SpecBundle[]): Array<Array<string | number | null>> {
  return bundles.flatMap((bundle) => bundle.items.map((item, index) => {
    const source = exportItem(item.item_id);
    return [bundle.name || "Bundle", bundle.is_gacha ? "RANDOM" : "FIXED", source.type, source.id, item.amount, "Trainee", index + 1, bundle.is_gacha ? item.chance : null, null];
  }));
}

function exportItem(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "gsp") return { type: "WALLET_DEBIT", id: "Golden Seed Point" };
  if (normalized === "player_exp") return { type: "PLAYER_EXPERIENCE", id: "Player Experience - tosm" };
  if (normalized === "popo_god_1") return { type: "WALLET_DEBIT", id: "God Coin" };
  if (normalized === "popo_fellow_1") return { type: "WALLET_DEBIT", id: "Fellow Coin" };
  if (normalized === "popo_kupo_1") return { type: "WALLET_DEBIT", id: "Kupole Coin" };
  if (normalized === "gold_cur" || normalized === "currency") return { type: "ITEM", id: "101147" };
  if (normalized === "diamond_cur") return { type: "ITEM", id: "101146" };
  return { type: "ITEM", id: value };
}

function xlsxFile(rows: Array<Array<string | number | null>>, sheetName: string) {
  const sheet = worksheetXml(rows);
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName.slice(0, 31) || "Sheet1")}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
  ]);
}

function worksheetXml(rows: Array<Array<string | number | null>>) {
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, column) => cell(column, rowIndex + 1, value)).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="42" customWidth="1"/><col min="2" max="3" width="18" customWidth="1"/><col min="4" max="4" width="28" customWidth="1"/><col min="5" max="9" width="14" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData></worksheet>`;
}

function cell(column: number, row: number, value: string | number | null) {
  if (value === null || value === undefined || value === "") return "";
  const ref = `${columnName(column)}${row}`;
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function columnName(index: number) { let name = ""; for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name; return name; }
function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }

function zip(files: Array<[string, string]>) {
  const encoder = new TextEncoder();
  const entries = files.map(([name, contents]) => ({ name: encoder.encode(name), contents: encoder.encode(contents) }));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const crc = crc32(entry.contents);
    const local = new Uint8Array(30 + entry.name.length + entry.contents.length);
    write32(local, 0, 0x04034b50); write16(local, 4, 20); write16(local, 8, 0); write32(local, 14, crc); write32(local, 18, entry.contents.length); write32(local, 22, entry.contents.length); write16(local, 26, entry.name.length); local.set(entry.name, 30); local.set(entry.contents, 30 + entry.name.length);
    localParts.push(local);
    const central = new Uint8Array(46 + entry.name.length);
    write32(central, 0, 0x02014b50); write16(central, 4, 20); write16(central, 6, 20); write16(central, 10, 0); write32(central, 16, crc); write32(central, 20, entry.contents.length); write32(central, 24, entry.contents.length); write16(central, 28, entry.name.length); write32(central, 42, offset); central.set(entry.name, 46);
    centralParts.push(central); offset += local.length;
  }
  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const end = new Uint8Array(22); write32(end, 0, 0x06054b50); write16(end, 8, entries.length); write16(end, 10, entries.length); write32(end, 12, centralSize); write32(end, 16, offset);
  return concatenate([...localParts, ...centralParts, end]);
}

function write16(target: Uint8Array, offset: number, value: number) { target[offset] = value & 255; target[offset + 1] = (value >>> 8) & 255; }
function write32(target: Uint8Array, offset: number, value: number) { write16(target, offset, value); write16(target, offset + 2, value >>> 16); }
function concatenate(parts: Uint8Array[]) { const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0)); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
const crcTable = Array.from({ length: 256 }, (_, index) => { let value = index; for (let step = 0; step < 8; step += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
function crc32(input: Uint8Array) { let value = 0xffffffff; for (const byte of input) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
