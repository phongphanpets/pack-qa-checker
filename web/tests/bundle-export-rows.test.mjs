import test from "node:test";
import assert from "node:assert/strict";
import { prepareBundleRows, rewardIdentity } from "../lib/bundle-export-rows.mjs";

test("retains repeated outcomes, zero chance and mirrors display rates exactly", () => {
  const result = prepareBundleRows([{ name: "Random", is_gacha: true, items: [
    { item_id: "51201", amount: 50, chance: 0 },
    { item_id: "51201", amount: 1, chance: 100 },
  ] }], { mirrorChance: true });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.rows.map(row => row.slice(6)), [[1, 0, 0], [2, 100, 100]]);
});

test("blocks missing quantities and rates rather than coercing blank to zero", () => {
  const result = prepareBundleRows([{ name: "Random", is_gacha: true, items: [
    { item_id: "51201", amount: 2, chance: "" },
    { item_id: "51201", amount: "", chance: 100 },
  ] }]);
  assert.equal(result.errors.length, 2);
  assert.equal(result.rows.length, 0);
});

test("fixed reward decimals and independent secret chance survive", () => {
  const fixed = prepareBundleRows([{ name: "Fixed", items: [{ item_id: "PLAYER_EXP", amount: 5.9 }] }]);
  assert.equal(fixed.rows[0][4], 5.9);
  assert.deepEqual(fixed.rows[0].slice(7), [null, null]);
  const random = prepareBundleRows([{ name: "Random", is_gacha: true, items: [{ item_id: "51201", amount: 1, chance: 100, secret_chance: 30 }] }]);
  assert.deepEqual(random.rows[0].slice(7), [100, 30]);
});

test("currency mapping requires identity and wrong totals remain unchanged", () => {
  assert.equal(rewardIdentity("Currency", "Diamond").id, "101146");
  assert.equal(rewardIdentity("Gold_Cur").id, "101147");
  assert.throws(() => rewardIdentity("Currency", "Unknown"));
  const result = prepareBundleRows([{ name: "Random", is_gacha: true, items: [{ item_id: "51201", amount: 1, chance: 99 }] }]);
  assert.equal(result.rows[0][7], 99);
  assert.equal(result.warnings.length, 1);
});
