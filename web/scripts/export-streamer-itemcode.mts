import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createBundleImportXlsx } from "../lib/bundle-import-xlsx.ts";
import type { SpecBundle } from "../lib/website-ocr";

const sourcePath = "C:/Users/User/.codex/attachments/13bdc82e-4955-4790-9c4b-17c0b19fe1af/pasted-text.txt";
const outputDir = resolve("../exports");
const outputPath = resolve(outputDir, "Streamer-itemcode-8-15-Sep-bundle-import.xlsx");
const rows = readFileSync(sourcePath, "utf8").trimEnd().split(/\r?\n/).map((line) => line.split("\t"));
const dates = [0, 10, 20, 30, 40, 50, 60, 70].map((column) => rows[0][column + 1]?.trim());
const bundles: SpecBundle[] = [];

for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
  for (let dayIndex = 0; dayIndex < dates.length; dayIndex += 1) {
    const base = dayIndex * 10;
    const codeMatch = rows[rowIndex][base]?.match(/^Code #(\d+)$/i);
    if (!codeMatch) continue;
    const items = [];
    for (let itemRow = rowIndex + 1; itemRow < rows.length; itemRow += 1) {
      if (rows[itemRow][base]?.trim()) break;
      const itemId = rows[itemRow][base + 2]?.trim();
      const name = rows[itemRow][base + 3]?.trim();
      const amount = Number((rows[itemRow][base + 4] || "").replace(/,/g, "").trim());
      if (itemId && name && Number.isFinite(amount) && amount > 0) items.push({ item_id: itemId, name, amount, chance: null });
    }
    if (!items.length) throw new Error(`ไม่พบ Item ใน ${dates[dayIndex]} #${codeMatch[1]}`);
    const day = dates[dayIndex].match(/^\d+/)?.[0] || dates[dayIndex];
    bundles.push({ bundle_id: 0, name: `Streamer itemcode ${day}/9 #${codeMatch[1]}`, is_gacha: false, is_permanent: false, items });
  }
}

if (bundles.length !== 24) throw new Error(`คาดว่าได้ 24 Bundles แต่พบ ${bundles.length}`);
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, createBundleImportXlsx(bundles));
console.log(JSON.stringify({ outputPath, bundles: bundles.length, items: bundles.reduce((total, bundle) => total + bundle.items.length, 0), names: bundles.map((bundle) => bundle.name) }, null, 2));
