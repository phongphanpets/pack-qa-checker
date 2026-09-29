import assert from "node:assert/strict";
import test from "node:test";

import { parseExcelPaste } from "../lib/excel-paste.ts";
import { prepareBundleRows } from "../lib/bundle-export-rows.mjs";

const grid = Array.from({ length: 17 }, () => Array(20).fill(""));

function set(row: number, column: number, value: string) {
  grid[row - 1][column - 1] = value;
}

for (const [column, date] of [[2, "1 ต.ค."], [12, "2 ต.ค."]] as const) {
  set(1, column, "Live Date");
  set(1, column + 1, date);
  for (const [headerRow, code] of [[5, "#1"], [12, "#2"]] as const) {
    set(headerRow, column, `Code ${code}`);
    set(headerRow, column + 2, "Item ID");
    set(headerRow, column + 3, "Item Name");
    set(headerRow, column + 4, "Amt");
    set(headerRow + 1, column + 2, "4224500");
    set(headerRow + 1, column + 3, "Card Fragment");
    set(headerRow + 1, column + 4, "100");
    set(headerRow + 2, column + 2, "Gold_Cur");
    set(headerRow + 2, column + 3, "Gold");
    set(headerRow + 2, column + 4, "30");
    set(headerRow + 3, column + 2, "51201");
    set(headerRow + 3, column + 3, "Lanistar Key");
    set(headerRow + 3, column + 4, "2");
    set(headerRow + 3, column + 7, "#REF!");
  }
}

test("parses side-by-side Itemcode days and codes into fixed Bundles only", () => {
  const result = parseExcelPaste(grid.map((row) => row.join("\t")).join("\n"));

  assert.equal(result.valid, true);
  assert.equal(result.sourceFormat, "itemcode-grid");
  assert.equal(result.bundles.length, 4);
  assert.equal(result.summary.itemCount, 12);
  assert.deepEqual(result.bundles.map((bundle) => bundle.name), [
    "Itemcode 1 ต.ค. #1", "Itemcode 1 ต.ค. #2",
    "Itemcode 2 ต.ค. #1", "Itemcode 2 ต.ค. #2",
  ]);
  assert.equal(result.bundles[0].is_gacha, false);
  assert.equal(result.bundles[0].seed_point, null);
  assert.equal(result.bundles[0].items[1].item_id, "Gold_Cur");
  assert.equal(result.bundles[0].items[1].amount, 30);
  assert.equal((result.document.bundles[0] as any).spec.items[1].item_id.value, "Gold_Cur");
  const exported = prepareBundleRows(result.bundles);
  assert.deepEqual(exported.errors, []);
  assert.equal(exported.rows.length, 12);
  assert.deepEqual(exported.rows[1].slice(0, 5), ["Itemcode 1 ต.ค. #1", "FIXED", "ITEM", "101147", 30]);
});

test("also accepts a single Itemcode day and rejects a malformed reward", () => {
  const oneDay = grid.map((row) => row.slice(0, 10));
  const valid = parseExcelPaste(oneDay.map((row) => row.join("\t")).join("\n"));
  assert.equal(valid.valid, true);
  assert.equal(valid.bundles.length, 2);

  oneDay[6][5] = "bad quantity";
  const invalid = parseExcelPaste(oneDay.map((row) => row.join("\t")).join("\n"));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.warnings.some((warning) => warning.code === "INVALID_ITEM"));
});

test("numbers exported Bundles within each day even when sheet headers start at Code #2", () => {
  const laterDays = grid.map((row) => [...row]);
  for (const column of [2, 12]) {
    laterDays[4][column - 1] = "Code #2";
    laterDays[11][column - 1] = "Code #3";
  }
  laterDays[0][2] = "16 ต.ค.";
  laterDays[0][12] = "17 ต.ค.";

  const result = parseExcelPaste(laterDays.map((row) => row.join("\t")).join("\n"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.bundles.map((bundle) => bundle.name), [
    "Itemcode 16 ต.ค. #1", "Itemcode 16 ต.ค. #2",
    "Itemcode 17 ต.ค. #1", "Itemcode 17 ต.ค. #2",
  ]);
  assert.equal(prepareBundleRows(result.bundles).errors.length, 0);
});
