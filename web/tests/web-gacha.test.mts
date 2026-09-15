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
  assert.deepEqual(parsed.bundles[0].items.map(i => [i.chance, i.secret_chance, i.tier]), [[2, 1.25, "Star"], [0.129, 0.125, "UR God"], [0.129, 0.125, "Trainee"]]);
  const output = prepareBundleRows(expandBundleRewards(parsed.bundles.map(b => ({ ...b, name: "My Gacha" }))), { mirrorChance: true });
  assert.deepEqual(output.errors, []);
  assert.deepEqual(output.rows.map(r => [r[5], r[7], r[8]]), [["Star", 2, 1.25], ["UR God", 0.129, 0.125], ["Trainee", 0.129, 0.125]]);
});
