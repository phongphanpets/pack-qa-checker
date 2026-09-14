import test from "node:test";
import assert from "node:assert/strict";
import { expandBundleRewards } from "../lib/bundle-rewards.ts";
import { groupProductBundles } from "../lib/product-groups.ts";
import type { SpecBundle } from "../lib/website-ocr.ts";

const base: SpecBundle = { bundle_id: 1, name: "Sale", seed_point: 590, gsp_earn: 590, purchase_limit: 1, items: [{ item_id: "51201", name: "Key", amount: 5, chance: null }, { item_id: "51201", name: "Key", amount: 50, chance: 100 }] };
test("mixed rewards and pure random rewards link both bundles to one product", () => {
  for (const items of [base.items, base.items.slice(1)]) {
    const expanded = expandBundleRewards([{ ...base, items }]);
    const groups = groupProductBundles(expanded);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].bundleNames, ["Sale - Fixed", "Sale - Random"]);
    assert.equal(groups[0].bundle.product_name, "Sale");
    assert.deepEqual(groupProductBundles(expanded.slice(1))[0].bundleNames, ["Sale - Random"]);
  }
});
test("different source products stay separate even with equal names IDs and prices", () => {
  assert.equal(groupProductBundles(expandBundleRewards([base, base])).length, 2);
  const step = { ...base, items: base.items.slice(0, 1) };
  assert.equal(groupProductBundles(expandBundleRewards(Array(10).fill(step))).length, 10);
});
