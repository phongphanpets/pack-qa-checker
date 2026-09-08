import test from "node:test";
import assert from "node:assert/strict";
import { expandBundleRewards } from "../lib/bundle-rewards.ts";
import type { SpecBundle } from "../lib/website-ocr.ts";

const item = { item_id: "51201", name: "Lanistar Key", amount: 1, chance: null };
const base: SpecBundle = { bundle_id: 1, name: "Product", seed_point: null, gsp_earn: null, purchase_limit: 1, items: [item] };

test("standalone rewards stay standalone while normal Web Shop gains points", () => {
  assert.equal(expandBundleRewards([base])[0].items.length, 1);
  const normal = expandBundleRewards([base], { seedPoint: 595, playerExp: 59.5 });
  assert.deepEqual(normal[0].items.map(i => [i.item_id, i.amount]), [["51201", 1], ["GSP", 595], ["PLAYER_EXP", 59.5]]);
  assert.equal(normal[0].name, "Product");
});

test("mixed and pure random shop put points in a single fixed bundle", () => {
  for (const fixed of [[], [item]]) {
    const result = expandBundleRewards([{ ...base, items: [...fixed, { ...item, chance: 100 }] }], { seedPoint: 100, playerExp: 10 });
    assert.equal(result.length, 2);
    assert.equal(result[0].is_gacha, false);
    assert.equal(result[1].is_gacha, true);
    assert.equal(result[1].items.length, 1);
    assert.equal(result[0].items.filter(i => i.item_id === "GSP").length, 1);
    assert.equal(result[0].items.filter(i => i.item_id === "PLAYER_EXP").length, 1);
  }
});

test("explicit source rewards take precedence and existing point items are not duplicated", () => {
  const result = expandBundleRewards([{ ...base, seed_point: 590, gsp_earn: 300, player_exp: 12.5, items: [item, { ...item, item_id: "GSP", amount: 300 }] }], { seedPoint: 999, playerExp: 99.9 });
  assert.equal(result[0].items.length, 3);
  assert.equal(result[0].items.find(i => i.item_id === "PLAYER_EXP")?.amount, 12.5);
});

test("multiple products calculate their own points; random itemcode adds no empty fixed bundle", () => {
  const products = expandBundleRewards([{ ...base, seed_point: 595 }, { ...base, name: "Second", seed_point: 790 }]);
  assert.equal(products[0].items.find(i => i.item_id === "PLAYER_EXP")?.amount, 59.5);
  assert.equal(products[1].items.find(i => i.item_id === "PLAYER_EXP")?.amount, 79);
  const random = expandBundleRewards([{ ...base, items: [{ ...item, chance: 100 }] }]);
  assert.equal(random.length, 1);
  assert.equal(random[0].is_gacha, true);
});
