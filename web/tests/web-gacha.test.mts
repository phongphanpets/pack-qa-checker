import test from "node:test";
import assert from "node:assert/strict";
import { parseExcelPaste } from "../lib/excel-paste.ts";
import { expandBundleRewards } from "../lib/bundle-rewards.ts";
import { prepareBundleRows } from "../lib/bundle-export-rows.mjs";

test("web gacha preserves both percentage rates and source grades", () => {
  const source = '1\tSequence 1 - 79\n\t\t1.2\n\tIMG\tItem ID\tItem Name\tAmt\tGrade\tStatus\tChance จริง\tTH Price\tEV\tChance ข่าวจ้า\n1\t\t1333015\tDawn Raven Rexipher\t1\tStar\tRate Up\t1.250%\t7500\t0.9\t2.000%\n2\t\t1333014\t"Penguin Queen\t"\t1\tUR God\tNormal\t0.125%\t7500\t0.1\t0.129%\n3\t\t1333012\tThe Great Giltine\t1\t\tNormal\t0.125%\t7500\t0.1\t0.129%';
  const parsed = parseExcelPaste(source);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.bundles.length, 1);
  assert.deepEqual(parsed.bundles[0].items.map(i => [i.chance, i.secret_chance, i.tier]), [[2, 1.25, "UR(K/F/C)"], [0.129, 0.125, "UR(K/F/C)"], [0.129, 0.125, "Trainee"]]);
  const output = prepareBundleRows(expandBundleRewards(parsed.bundles.map(b => ({ ...b, name: "My Gacha" }))), { mirrorChance: true });
  assert.deepEqual(output.errors, []);
  assert.deepEqual(output.rows.map(r => [r[5], r[7], r[8]]), [["UR(K/F/C)", 2, 1.25], ["UR(K/F/C)", 0.129, 0.125], ["Trainee", 0.129, 0.125]]);
});

test("maps gacha grades and preserves already valid import tiers", () => {
  for (const [grade, expected] of [["R", "R(K/F/C)"], ["SR", "SR(K/F/C)"], ["UR", "UR(K/F/C)"], ["UR(K/F/C)", "UR(K/F/C)"], ["Legendary", "Legendary"], ["", "Trainee"]]) {
    const parsed = parseExcelPaste(`Item ID\tItem Name\tAmt\tGrade\tChance จริง\tChance ข่าวจ้า\n1333015\tDawn Raven Rexipher\t1\t${grade}\t100%\t100%`);
    assert.equal(parsed.bundles[0].items[0].tier, expected);
  }
});
