import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import bundleTemplateUrl from "../templates/bundle-import-template.xlsx?url";
import productTemplateUrl from "../templates/product-import-template.xlsx?url";
import { prepareBundleRows } from "./bundle-export-rows.mjs";
import type { SpecBundle } from "./website-ocr";
import type { CatalogItem } from "./item-catalog";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
type Value = string | number | null | undefined;

async function templateRows(url: string, rows: Value[][], bundle: boolean) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("โหลด Import Template ไม่สำเร็จ กรุณาโหลดหน้าเว็บใหม่");
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const parse = (path: string) => {
    if (!archive[path]) throw new Error("Import Template ไม่สมบูรณ์");
    const doc = new DOMParser().parseFromString(strFromU8(archive[path]), "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Import Template อ่านไม่ได้");
    return doc;
  };
  const sheet = parse("xl/worksheets/sheet1.xml");
  const strings = parse("xl/sharedStrings.xml");
  const entries = Array.from(strings.getElementsByTagNameNS(ns, "si"));
  const indexes = new Map(entries.map((item, index) => [item.textContent || "", index]));
  const addString = (value: string) => {
    if (indexes.has(value)) return indexes.get(value)!;
    const index = entries.length;
    const item = strings.createElementNS(ns, "si");
    const text = strings.createElementNS(ns, "t");
    text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    text.textContent = value;
    item.append(text);
    strings.documentElement.append(item);
    entries.push(item);
    indexes.set(value, index);
    return index;
  };
  const data = sheet.getElementsByTagNameNS(ns, "sheetData")[0];
  const header = data?.firstElementChild?.cloneNode(true);
  if (!header) throw new Error("ไม่พบหัวตาราง Import Template");
  data.replaceChildren(header);
  rows.forEach((values, index) => {
    const row = sheet.createElementNS(ns, "row");
    row.setAttribute("r", String(index + 2));
    if (bundle) { row.setAttribute("ht", "22.5"); row.setAttribute("customHeight", "1"); }
    values.forEach((value, column) => {
      if (!bundle && (value == null || value === "")) return;
      const cell = sheet.createElementNS(ns, "c");
      let letters = "";
      for (let n = column + 1; n; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
      cell.setAttribute("r", letters + (index + 2));
      if (bundle) cell.setAttribute("s", "3");
      if (value != null && value !== "") {
        const numeric = typeof value === "number" || ((!bundle || column === 3) && /^\d+(?:\.\d+)?$/.test(String(value)));
        const v = sheet.createElementNS(ns, "v");
        if (!numeric) cell.setAttribute("t", "s");
        v.textContent = numeric ? String(value) : String(addString(String(value)));
        cell.append(v);
      }
      row.append(cell);
    });
    data.append(row);
  });
  strings.documentElement.setAttribute("count", String(entries.length));
  strings.documentElement.setAttribute("uniqueCount", String(entries.length));
  const serializer = new XMLSerializer();
  archive["xl/worksheets/sheet1.xml"] = strToU8(serializer.serializeToString(sheet));
  archive["xl/sharedStrings.xml"] = strToU8(serializer.serializeToString(strings));
  return zipSync(archive, { level: 0 });
}

export async function localBundleExport(bundles: SpecBundle[], catalog: CatalogItem[], mirrorChance: boolean, split: boolean) {
  const review = prepareBundleRows(bundles, { catalog, mirrorChance });
  if (review.errors.length) throw new Error(review.errors.join("\n"));
  if (!split) return new Blob([await templateRows(bundleTemplateUrl, review.rows, true)], { type: mime });
  const files: Record<string, Uint8Array> = {};
  for (const [index, bundle] of bundles.entries()) {
    const name = String(bundle.name || "bundle").replace(/[<>:"/\\|?*\r\n]/g, "-").slice(0, 120).replace(/[. ]+$/, "");
    files[`${String(index + 1).padStart(3, "0")}-${name}.xlsx`] = await templateRows(bundleTemplateUrl, prepareBundleRows([bundle], { catalog, mirrorChance }).rows, true);
  }
  return new Blob([zipSync(files, { level: 0 })], { type: "application/zip" });
}

export async function localProductExport(draft: { name: string; category: string; displayOrder: string; saleStart: string; saleEnd: string; purchaseLimit: string; currency: string; actualPrice: string; fullPrice: string; bundleNames: string[] }) {
  if (!draft.name.trim() || !draft.bundleNames.length) throw new Error("กรอกชื่อ Product และเลือก Bundle ก่อน Export");
  const date = (value: string) => value.trim() ? value.trim().replace("T", " ").replace(/(?<=\d{2}:\d{2})$/, ":00") : "";
  const values = ["GAME", draft.name, draft.name, draft.category, "", "", "", "", "", "", "", draft.displayOrder,
    date(draft.saleStart), date(draft.saleEnd), draft.purchaseLimit, "", "", "", "", "", "", "",
    "TRUE", "TRUE", "FALSE", draft.currency, draft.actualPrice, draft.fullPrice, "", "", "", "", "", "", draft.bundleNames.join(", ")];
  return new Blob([await templateRows(productTemplateUrl, [values], false)], { type: mime });
}
