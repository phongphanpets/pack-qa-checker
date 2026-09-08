import assert from "node:assert/strict";
import test from "node:test";

import { parseItemCatalog, validateCatalogItems } from "../lib/item-catalog.ts";

const catalogText = `Image\tItem ID\tCDN URL\tItem TH\tItem EN\tGrade
\t4235100\thttps://cdn.example/belorb.png\tเบลอร์บ\tBelorb Stabilizer\tTrainee
\t101147\thttps://cdn.example/gold.png\tทอง\tGold\tCommon
\t51201\thttps://cdn.example/key.png\tกุญแจ\tLanistar Key\tRare`;

test("parses the Copy of Data columns into a usable item catalog", () => {
  const catalog = parseItemCatalog(catalogText);
  assert.equal(catalog.length, 3);
  assert.deepEqual(catalog[0], {
    id: "4235100",
    name: "Belorb Stabilizer",
    tier: "Trainee",
    imageUrl: "https://cdn.example/belorb.png",
    sourceName: "เบลอร์บ",
  });
});

test("reports unknown IDs, name mismatches, and mapped currency", () => {
  const catalog = parseItemCatalog(catalogText);
  const validation = validateCatalogItems([
    {
      bundle_id: 1,
      name: "Test bundle",
      seed_point: null,
      gsp_earn: null,
      purchase_limit: null,
      is_gacha: false,
      is_permanent: false,
      items: [
        { item_id: "4235100", name: "Belorb Stabilizer", amount: 1, chance: null },
        { item_id: "51201", name: "Wrong item name", amount: 1, chance: null },
        { item_id: "Gold_Cur", name: "Gold", amount: 30, chance: null },
        { item_id: "999999", name: "Unknown", amount: 1, chance: null },
      ],
    },
  ], catalog);

  assert.equal(validation.checked, 4);
  assert.deepEqual(validation.mapped, [{ from: "Gold_Cur", to: "101147", label: "Gold" }]);
  assert.deepEqual(validation.missing, [{ id: "999999", name: "Unknown", bundleName: "Test bundle" }]);
  assert.deepEqual(validation.nameMismatches, [{
    id: "51201",
    requestName: "Wrong item name",
    catalogName: "Lanistar Key",
    bundleName: "Test bundle",
  }]);
});
