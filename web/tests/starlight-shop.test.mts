import assert from "node:assert/strict";
import test from "node:test";

import { parseExcelPaste, parseStarlightShopPaste } from "../lib/excel-paste.ts";
import { prepareStarlightRows } from "../lib/starlight-shop.mjs";
import { productExportRows } from "../lib/product-export-rows.ts";

test("six-column Markdown retains Battery prices independently of reward quantity", () => {
  const input = `| **Battery** | **Image** | **Item ID** | **Item Name** | **Stackable** | **Amt** |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 400 | | 6012100 | Legendary Star Costume | not found | 1 |
| 5 | | 4224500 | Card Fragment | FALSE | 100 |
| 1 | | 1311331 | Silver Box 100,000 | FALSE | 1 |`;
  for (const parse of [parseStarlightShopPaste, parseExcelPaste]) {
    const parsed = parse(input);
    assert.equal(parsed.valid, true);
    assert.deepEqual(parsed.bundles.map(bundle => [bundle.items[0].battery, bundle.items[0].amount, bundle.purchase_limit]), [[400, 1, null], [5, 100, null], [1, 1, null]]);
    const rows = productExportRows(parsed.bundles.map(bundle => ({ name: bundle.name!, nameEn: "Starlight SS2", category: "Starlight SS2 Shop - [ Battery Shop ]", currency: "Battery", actualPrice: String(bundle.items[0].battery), fullPrice: String(bundle.items[0].battery), purchaseLimit: "", displayOrder: "500", saleStart: "", saleEnd: "", bundleNames: [bundle.name!] })));
    assert.deepEqual(rows.map(row => [row[25], row[26]]), [["400", "400"], ["5", "5"], ["1", "1"]]);
  }
});

const source = `Battery\tImage\tItem ID\tItem Name\tStackable\tAmt\tTrade\tLimit
400\t\t6012100\tLegendary Star Costume\tnot found\t1\tTradable\t1
300\t\t7070500\tStar Sunglasses\tFALSE\t1\tTradable\t1
100\t\t4225032\tBelorb Core: Celestial\tnot found\t1\tNon-Trade\t3
1\t\t1311331\tSilver Box 100,000\tFALSE\t1\tNon-Trade\tNo-Limit`;

test("splits Starlight Shop rows into one bundle per row", () => {
  const parsed = parseStarlightShopPaste(source);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.bundles.length, 4);
  assert.equal(parsed.bundles[0].name, "Legendary Star Costume");
  assert.equal(parsed.bundles[0].seed_point, null);
  assert.equal(parsed.bundles[0].gsp_earn, null);
  assert.equal(parsed.bundles[0].items[0].battery, 400);
  assert.equal(parsed.bundles[0].purchase_limit, 1);
  assert.equal(parsed.bundles[2].items[0].trade, "Non-Trade");
  assert.equal(parsed.bundles[3].items[0].limit, "No-Limit");
});

test("auto-detects the Starlight Shop table from the standard parser", () => {
  const parsed = parseExcelPaste(source);
  assert.equal(parsed.bundles.length, 4);
  assert.equal(parsed.bundles[1].items[0].stackable, undefined);
});

test("prepares Starlight Shop rows with the requested columns", () => {
  const parsed = parseStarlightShopPaste(source);
  const review = prepareStarlightRows(parsed.bundles);
  assert.deepEqual(review.errors, []);
  assert.deepEqual(review.rows[0], ["Legendary Star Costume", "FIXED", "ITEM", "6012100", 1, "Trainee", 1, null, null]);
  assert.deepEqual(review.rows[3], ["Silver Box 100,000", "FIXED", "ITEM", "1311331", 1, "Trainee", 1, null, null]);
  assert.deepEqual(review.warnings, []);
});
