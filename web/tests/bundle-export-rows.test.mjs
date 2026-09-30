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
  for (const id of ["TP", "TP_Cur", "101145"]) {
    assert.deepEqual(rewardIdentity(id), { type: "ITEM", id: "101145" });
  }
  assert.deepEqual(rewardIdentity("Currency", "TP"), { type: "ITEM", id: "101145" });
  const tp = prepareBundleRows([{ name: "TP reward", items: [{ item_id: "TP", amount: 100 }] }]);
  assert.deepEqual(tp.errors, []);
  assert.deepEqual(tp.rows[0].slice(2, 5), ["ITEM", "101145", 100]);
  assert.equal(rewardIdentity("Currency", "Diamond").id, "101146");
  assert.equal(rewardIdentity("Gold_Cur").id, "101147");
  assert.deepEqual(rewardIdentity("Popo_God_1"), {
    type: "WALLET_DEBIT",
    id: "God Coin",
  });
  assert.deepEqual(rewardIdentity("Popo_Fellow_1"), {
    type: "WALLET_DEBIT",
    id: "Fellow Coin",
  });
  assert.deepEqual(rewardIdentity("Popo_Kupo_1"), {
    type: "WALLET_DEBIT",
    id: "Kupole Coin",
  });
  assert.throws(() => rewardIdentity("Currency", "Unknown"));
  const result = prepareBundleRows([{ name: "Random", is_gacha: true, items: [{ item_id: "51201", amount: 1, chance: 99 }] }]);
  assert.equal(result.rows[0][7], 99);
  assert.equal(result.warnings.length, 1);
});

test("wallet coin aliases export as debit with canonical names", () => {
  const aliases = [
    ["God Coin", "God Coin 1"],
    ["Fellow Coin", "Fellow Coin 1"],
    ["Kupole Coin", "Kupole Coin 1"],
  ];
  for (const [coin, label] of aliases) {
    assert.deepEqual(rewardIdentity(coin, label), { type: "WALLET_DEBIT", id: coin });
    assert.deepEqual(rewardIdentity(label), { type: "WALLET_DEBIT", id: coin });
    assert.deepEqual(rewardIdentity("Currency", coin), { type: "WALLET_DEBIT", id: coin });
  }
  const result = prepareBundleRows([{ name: "Coins", items: aliases.map(([coin, label]) => ({ item_id: `Popo_${coin === "Kupole Coin" ? "Kupo" : coin.split(" ")[0]}_1`, name: label, amount: 1 })) }]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map(row => row.slice(2, 5)), aliases.map(([coin]) => ["WALLET_DEBIT", coin, 1]));
});

test("existing GSP and Player EXP identities remain unchanged", () => {
  assert.deepEqual(rewardIdentity("GSP"), {
    type: "WALLET_DEBIT",
    id: "Golden Seed Point",
  });
  assert.deepEqual(rewardIdentity("PLAYER_EXP"), {
    type: "PLAYER_EXPERIENCE",
    id: "Player Experience - tosm",
  });
});
