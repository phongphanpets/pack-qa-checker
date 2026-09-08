import assert from "node:assert/strict";
import test from "node:test";

import { bundleImportHeaders, createBundleImportXlsx, toImportRows } from "../lib/bundle-import-xlsx.ts";

test("creates the established bundle import columns and maps special rewards", () => {
  const bundles = [
    { name: "Example - Fixed", is_gacha: false, items: [
      { item_id: "Popo_God_1", name: "God Coin 1", amount: 3, chance: null },
      { item_id: "GSP", name: "Golden Seed Point", amount: 590, chance: null },
      { item_id: "PLAYER_EXP", name: "Player EXP", amount: 59, chance: null },
    ] },
    { name: "Example - Random", is_gacha: true, items: [
      { item_id: "Diamond_Cur", name: "Diamond", amount: 10, chance: 0.5 },
    ] },
  ] as never;
  const rows = toImportRows(bundles);

  assert.deepEqual(rows[0], ["Example - Fixed", "FIXED", "WALLET_DEBIT", "God Coin", 3, "Trainee", 1, null, null]);
  assert.deepEqual(rows[1], ["Example - Fixed", "FIXED", "WALLET_DEBIT", "Golden Seed Point", 590, "Trainee", 2, null, null]);
  assert.deepEqual(rows[2], ["Example - Fixed", "FIXED", "PLAYER_EXPERIENCE", "Player Experience - tosm", 59, "Trainee", 3, null, null]);
  assert.deepEqual(rows[3], ["Example - Random", "RANDOM", "ITEM", "101146", 10, "Trainee", 1, 0.5, null]);

  const file = createBundleImportXlsx(bundles);
  assert.equal(new TextDecoder().decode(file.slice(0, 2)), "PK");
  assert.deepEqual(bundleImportHeaders, ["Bundle Name", "Bundle Type", "Item Type", "Item ID", "Quantity", "Tier", "Position", "เรทสุ่ม", "เรทโชว์"]);
});
