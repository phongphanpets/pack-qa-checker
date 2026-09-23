import assert from "node:assert/strict";
import test from "node:test";
import { productExportRows } from "../lib/product-export-rows.ts";

const draft = { name: "Legendary Star Costume", nameEn: "Starlight SS2", category: "Starlight SS2 Shop - [ Battery Shop ]", displayOrder: "500", saleStart: "", saleEnd: "", purchaseLimit: "1", currency: "Battery", actualPrice: "400", fullPrice: "400", bundleNames: ["[SLS] Legendary Star Costume"] };
test("Starlight products share English search name while retaining names, prices, limits and links", () => {
  const rows = productExportRows([draft, { ...draft, name: "Silver Box 100,000", actualPrice: "1", fullPrice: "1", purchaseLimit: "", bundleNames: ["[SLS] Silver Box 100,000"] }]);
  assert.deepEqual(rows.map(row => row.slice(1, 4)), [[draft.name, "Starlight SS2", draft.category], ["Silver Box 100,000", "Starlight SS2", draft.category]]);
  assert.deepEqual(rows.map(row => [row[14], row[24], row[25], row[33]]), [["1", "Battery", "400", draft.bundleNames[0]], ["", "Battery", "1", "[SLS] Silver Box 100,000"]]);
  assert.equal(rows[0].length, 35);
});
test("existing product exports still use the same name for both languages", () => {
  const rows = productExportRows([{ ...draft, nameEn: undefined }]);
  assert.equal(rows[0][1], rows[0][2]);
});
