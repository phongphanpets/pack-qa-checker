import assert from "node:assert/strict";
import test from "node:test";

import { productImportRows } from "../lib/product-import-xlsx.ts";

test("creates a Product import row with defaults required by the tool", () => {
  const [row] = productImportRows({
    name: "Sample Product",
    category: "Savior Shop - [ Savior Shop ]",
    displayOrder: "510",
    saleStart: "2026-09-07 00:00",
    saleEnd: "2026-12-31 23:59",
    purchaseLimit: "1",
    currency: "Social Point",
    actualPrice: "4000",
    fullPrice: "4000",
    bundleNames: ["Sample - Fixed", "Sample - Random"],
  });
  assert.equal(row.length, 34);
  assert.equal(row[21], "TRUE");
  assert.equal(row[22], "TRUE");
  assert.equal(row[23], "FALSE");
  assert.equal(row[24], "Social Point");
  assert.equal(row[33], "Sample - Fixed, Sample - Random");
});
