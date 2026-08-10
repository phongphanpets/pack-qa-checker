import assert from "node:assert/strict";
import test from "node:test";

import {
  attachAdminPaste,
  parseAdminPaste,
  parseExcelPaste,
} from "../lib/excel-paste.ts";
import { adminCropRegions, parseAdminOcrDates } from "../lib/admin-ocr.ts";

const copiedExcelBlock = `🔥FLASH SALE\tProduct Name\tSat เสว : Smooth like butter\tStart\t25 Jul\t00.01 น.\tReset\tNo Reset\tLimit (ครั้ง / ID)\tTotal Paid\tลดกี่ %
\tRank Codition\tBronze+\tEnd\t26 Jul\t23.59 น.\tType\tRecommend\t1\t**39**\t86%
0\tTHB\tSeed Point\tGSP Earn\tEXP Rank Earn\tIMG\tItem ID\tItem Name\tAmt\tTradable\tRealistic Price (บาท)\tTHB
\t**39**\t390\t390\t39\t\t4235100\tBelorb Stabilizer\t2\tX\t40\t80
\t\t\t\t\t\t51301\tRift Key\t1\tX\t8.4\t16.8
\t\t\t\t\t\t51201\tLanistar Key\t1\tX\t8.4\t16.8
\t\t\t\t\t\t40199\tGod Sphere\t10\tX\t50\t100
\t\t\t\t\t\t400001\tMegaphone \t20\tX\t3\t6
\t\t\t\t\t\t1002102\t[แจกรางวัล] Dungeon Battle Token (3 วัน)\t1\tX\t15\t30
\t\t\t\t\t\t4413210\tZone Quest Scroll\t10\tX\t1\t2
\t\t\t\t\t\tGold_cur\tGold\t20\tX\t10\t20`;

test("parses a copied Excel pack table without OCR", () => {
  const result = parseExcelPaste(copiedExcelBlock);

  assert.equal(result.valid, true);
  assert.equal(result.summary.generatedBundleId, true);
  assert.match(String(result.summary.bundleId), /^9\d{8}$/);
  assert.equal(result.summary.name, "Sat เสว : Smooth like butter");
  assert.equal(result.summary.seedPoint, 390);
  assert.equal(result.summary.gspEarn, 390);
  assert.equal(result.summary.purchaseLimit, 1);
  assert.equal(result.summary.itemCount, 8);

  const bundle = result.document.bundles[0] as any;
  assert.equal(bundle.spec.items[0].item_id.value, "4235100");
  assert.equal(bundle.spec.items[0].name.value, "Belorb Stabilizer");
  assert.equal(bundle.spec.items[0].amount.value, 2);
  assert.equal(bundle.spec.items[7].item_id.value, "Gold_cur");
  assert.equal(bundle.spec.items[7].amount.value, 20);
  assert.equal(
    bundle.spec.items[0].item_id.locator,
    "excel-paste:R4C7",
  );
  assert.equal(bundle.spec.items[0].item_id.confidence, 1);
});

test("keeps missing year and generated identity visible as warnings", () => {
  const result = parseExcelPaste(copiedExcelBlock);

  assert.deepEqual(
    result.warnings.map((warning) => warning.code),
    ["GENERATED_BUNDLE_ID", "DATE_WITHOUT_YEAR"],
  );
  assert.equal((result.document.bundles[0] as any).spec.start_date.value, "2026-07-25");
  assert.equal((result.document.bundles[0] as any).spec.end_date.value, "2026-07-26");
});

test("uses a copied bundle_id when the block contains one", () => {
  const result = parseExcelPaste(
    `Bundle ID\t114434
Product Name\tAura Black
Seed Point\t490
GSP Earn\t490
Item ID\tItem Name\tAmt
TIP-AURA\t[TIP] Aura Black\t3`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.bundleId, 114434);
  assert.equal(result.summary.generatedBundleId, false);
  assert.equal(
    result.warnings.some(
      (warning) => warning.code === "GENERATED_BUNDLE_ID",
    ),
    false,
  );
});

test("keeps a permanent Excel End as an explicit canonical status", () => {
  const result = parseExcelPaste(
    `Bundle ID\t7002
Product Name\tมือใหม่ : ใบทหาร 140\tStart\t27 Jul 2026\tReset\tNo Reset
\t\t\tEnd\tถาวร
THB\tSeed Point\tGSP Earn\tItem ID\tItem Name\tAmt
140\t140\t140\tITEM-1\tStarter Item\t1`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.isPermanent, true);
  assert.equal(
    result.warnings.some((warning) => warning.code === "DATE_WITHOUT_YEAR"),
    false,
  );
  const spec = (result.document.bundles[0] as any).spec;
  assert.equal(spec.is_permanent.value, true);
  assert.equal(spec.is_permanent.raw_text, "ถาวร");
  assert.equal(spec.end_date, undefined);
  assert.equal(result.bundles[0].is_permanent, true);
});

test("parses a random pack with repeated item IDs and a 100% chance pool", () => {
  const result = parseExcelPaste(
    `FLASH SALE\tProduct Name\tLeticia Random\tLimit\t20
\t\t\t\t20
THB\tSeed Point\tGSP Earn\tEXP Rank Earn\tItem ID\tItem Name\tAmt\tChance
69\t690\t690\t69\t10070\tLeticia Coin Ticket\t2\tFixed
\t\t\t\t10070\tLeticia Coin Ticket\t100\t0.1
\t\t\t\t10070\tLeticia Coin Ticket\t1\t58.45
\t\t\t\t1517310\tCostume Box\t1\t41.45`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.isGacha, true);
  assert.equal(result.summary.fixedItemCount, 1);
  assert.equal(result.summary.randomOutcomeCount, 3);
  assert.equal(result.summary.chanceTotal, 100);
  assert.equal(result.bundles[0].items[0].chance, null);
  assert.equal(result.bundles[0].items[1].chance, 0.1);

  const bundle = result.document.bundles[0] as any;
  assert.equal(bundle.spec.is_gacha, true);
  assert.equal(bundle.gacha.items.length, 3);
  assert.equal(bundle.gacha.items[0].item_id.value, "10070");
  assert.equal(bundle.gacha.items[0].chance.value, 0.1);
});

test("keeps Excel rows whose quoted item name contains a newline", () => {
  const result = parseExcelPaste(
    `FLASH SALE\tProduct Name\tForever July\tLimit\t20
\t\t\t\t20
THB\tSeed Point\tGSP Earn\tEXP Rank Earn\tItem ID\tItem Name\tAmt\tChance
69\t690\t690\t69\t10070\tLeticia Coin Ticket\t2\tFixed
\t\t\t\t1320120\tBlack Ranger Command Ship Summoner\t1\t0.25
\t\t\t\t1320061\tMount Summoning Stone : Loxodon\t1\t0.25
\t\t\t\t1324010\tBlue Ribbon Snake\t1\t0.25
\t\t\t\t1322020\tBlack Shark Mount Summoning Stone\t1\t0.25
\t\t\t\t1318400\t"Sniego Mount Summoning Stone Ticket
(แลกเปลี่ยนได้)"\t1\t0.25
\t\t\t\t1318601\tTosri Flagship Caller\t1\t0.25
\t\t\t\t1318780\tLittle Dionysus Mount\t1\t0.25
\t\t\t\t1322010\tSpace Popori\t1\t0.25
\t\t\t\t10070\tLeticia Coin Ticket\t100\t0.1
\t\t\t\t10070\tLeticia Coin Ticket\t70\t0.25
\t\t\t\t10070\tLeticia Coin Ticket\t50\t0.5
\t\t\t\t10070\tLeticia Coin Ticket\t25\t0.7
\t\t\t\t10070\tLeticia Coin Ticket\t10\t1
\t\t\t\t10070\tLeticia Coin Ticket\t7\t5
\t\t\t\t10070\tLeticia Coin Ticket\t5\t10
\t\t\t\t10070\tLeticia Coin Ticket\t3\t18
\t\t\t\t10070\tLeticia Coin Ticket\t1\t62.45`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.itemCount, 18);
  assert.equal(result.summary.randomOutcomeCount, 17);
  assert.equal(result.summary.chanceTotal, 100);
  const sniego = result.bundles[0].items.find(
    (item) => item.item_id === "1318400",
  );
  assert.equal(
    sniego?.name,
    "Sniego Mount Summoning Stone Ticket (แลกเปลี่ยนได้)",
  );
  assert.equal(sniego?.chance, 0.25);
});

test("parses copied Admin name and opening dates with provenance", () => {
  const result = parseAdminPaste(
    `Name\tSat เสว : Smooth like butter
Start\tMay 24, 2026 12:01 AM
End\tMay 26, 2026 11:59 PM`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.name, "Sat เสว : Smooth like butter");
  assert.equal(result.summary.startDate, "2026-05-24");
  assert.equal(result.summary.endDate, "2026-05-26");
  assert.equal(
    (result.admin as any).start_date.raw_text,
    "May 24, 2026 12:01 AM",
  );
  assert.equal(
    (result.admin as any).start_date.locator,
    "admin-paste:R2C2",
  );
  assert.equal((result.admin as any).name.source, "admin");
  assert.equal(result.summary.isPermanent, false);
});

test("derives permanent status from a long Aztek Tool date range", () => {
  const result = parseAdminPaste(
    `Name\tมือใหม่ : ใบทหาร 140
Start\t27 Jul 2026 01:00:00
End\t27 Jul 2036 00:00:00`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.isPermanent, true);
  assert.equal((result.admin as any).is_permanent.value, true);
  assert.match(
    (result.admin as any).is_permanent.locator,
    /derived-permanence/,
  );
});

test("does not guess an Admin year that was not copied", () => {
  const result = parseAdminPaste(
    `Name\tAura Black
Start\t24 May 00.01
End\t26 May 23.59`,
  );

  assert.equal(result.valid, false);
  assert.equal(result.summary.startDate, null);
  assert.equal(result.summary.endDate, null);
});

test("attaches Admin paste to the existing canonical document shape", () => {
  const specResult = parseExcelPaste(copiedExcelBlock);
  const adminResult = parseAdminPaste(
    `Name\tSat เสว : Smooth like butter
Start\t2026-07-25 00:01
End\t2026-07-26 23:59`,
  );
  const document = attachAdminPaste(
    specResult.document,
    adminResult,
  );

  assert.equal(
    (document.bundles[0] as any).admin.name.value,
    "Sat เสว : Smooth like butter",
  );
  assert.equal(
    (document.bundles[0] as any).admin.end_date.value,
    "2026-07-26",
  );
});

test("parses Admin OCR dates without using a title", () => {
  assert.deepEqual(
    parseAdminOcrDates("25 Jul 2026 00:01:00 26 Jul 2026 23:59:00"),
    {
      startDate: "2026-07-25",
      endDate: "2026-07-26",
      startTime: "00:01:00",
      endTime: "23:59:00",
    },
  );
});

test("keeps Admin OCR regions anchored to table columns", () => {
  const regions = adminCropRegions(1355, 98);
  assert.ok(regions.name.left < 20);
  assert.ok(regions.start.left > 900);
  assert.ok(regions.end.left > regions.start.left);
  assert.ok(regions.start.top > 35);
});
