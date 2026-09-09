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

test("parses a markdown request table with a title and alternate headers", () => {
  const result = parseExcelPaste(
    `น้องใหม่ไฟแรง
| Item Code | Display Name | Quantity |
| :-------: | ------------ | :------: |
| 1313861 | Maid Ruta | x1 |
| 51502 | กุญแจ Kepa Festival II | 30 |`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.name, "น้องใหม่ไฟแรง");
  assert.equal(result.summary.generatedBundleId, true);
  assert.equal(result.summary.itemCount, 2);
  assert.equal(result.bundles[0].items[0].item_id, "1313861");
  assert.equal(result.bundles[0].items[0].amount, 1);
  assert.equal(result.bundles[0].items[1].name, "กุญแจ Kepa Festival II");
});

test("parses an Item Code reward table after the request title is supplied as Bundle Name", () => {
  const result = parseExcelPaste(
    `Bundle Name\tStreamer itemcode 6/9 #1
Item ID\tItem Name\tAmt
4224500\tCard Fragment\t100
1112101\tEXP Book 200% (24 Hours)\t1`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.bundles.length, 1);
  assert.equal(result.bundles[0].name, "Streamer itemcode 6/9 #1");
  assert.equal(result.bundles[0].items.length, 2);
});

test("parses a headerless Item ID, Item Name and Amt list", () => {
  const result = parseExcelPaste(
    "1315002\tGod Fellow Ticket\t30\n1315001\tFellow Ticket\t30\nGold_Cur\tGold\t1500",
  );

  assert.equal(result.valid, true);
  assert.equal(result.bundles.length, 1);
  assert.equal(result.bundles[0].name, "Untitled Bundle");
  assert.equal(result.bundles[0].items.length, 3);
  assert.deepEqual(result.bundles[0].items.map((item) => item.item_id), ["1315002", "1315001", "Gold_Cur"]);
  assert.equal(result.bundles[0].items[2].amount, 1500);
});

test("reads GSP Earn and EXP Rank Earn from the bundle summary row", () => {
  const result = parseExcelPaste(
    "Product Name\tSample Bundle\n" +
      "0\tTHB\tSeed Point\tGSP Earn\tEXP Rank Earn\tIMG\tItem ID\tItem Name\tAmt\n" +
      "1\t99\t990\t990\t99\t\t4235100\tBelorb Stabilizer\t1",
  );
  assert.equal(result.valid, true);
  assert.equal(result.bundles[0].gsp_earn, 990);
  assert.equal(result.bundles[0].player_exp, 99);
});

test("preserves fractional Seed Point, GSP and Player EXP", () => {
  const result = parseExcelPaste("Product Name\tDecimal rewards\n0\tTHB\tSeed Point\tGSP Earn\tEXP Rank Earn\tIMG\tItem ID\tItem Name\tAmt\n1\t59.5\t595\t595\t59.5\t\t51201\tLanistar Key\t1");
  assert.equal(result.bundles[0].gsp_earn, 595);
  assert.equal(result.bundles[0].player_exp, 59.5);
});

test("shifted rows without a Chance header never treat price as a random rate", () => {
  const result = parseExcelPaste("Product Name\tFixed pack\nIMG\tItem ID\tItem Name\tAmt\tTP\n\t51201\tLanistar Key\t2\t10\n52001\tMemory Stone Key Selection\t3\t50");
  assert.equal(result.bundles[0].items.length, 2);
  assert.ok(result.bundles[0].items.every(item => item.chance === null));
  assert.equal(result.bundles[0].is_gacha, false);
});

test("preserves distinct Chance and Secret Chance in direct and shifted rows", () => {
  const result = parseExcelPaste("Product Name\tTwo rates\nIMG\tItem ID\tItem Name\tAmt\tChance\tSecret Chance\n\t51201\tLanistar Key\t2\t10\t20\n52001\tMemory Stone Key Selection\t3\t90\t80");
  assert.deepEqual(result.bundles[0].items.map(item => [item.chance, item.secret_chance]), [[10, 20], [90, 80]]);
});

test("recognizes Cost Chance as a random chance column", () => {
  const result = parseExcelPaste(
    `Bundle Name\tWheel Rewards
Item ID\tItem Name\tAmt\tCost Chance
4235100\tBelorb Stabilizer\t3\t45
101147\tGold\t500\t55`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.isGacha, true);
  assert.equal(result.summary.chanceTotal, 100);
  assert.equal(result.bundles[0].items[1].chance, 55);
});

test("keeps the supplied Item Code title for headerless rewards", () => {
  const result = parseExcelPaste("Bundle Name\tStreamer itemcode 6/9 #1\n1315001\tFellow Ticket\t2\nCurrency\tGold\t20");
  assert.equal(result.summary.name, "Streamer itemcode 6/9 #1");
  assert.equal(result.bundles[0].items.length, 2);
});

test("reordered Trade and Amt columns retain quantities and shifted rates", () => {
  const fixed = parseExcelPaste("Bundle Name\tLevel 180\nIMG\tItem ID\tItem Name\tTrade\tAmt\n\t4225031\tBelorb Core\tX\t3");
  assert.equal(fixed.bundles[0].items[0].amount, 3);
  const random = parseExcelPaste("Bundle Name\tReordered chance\nIMG\tItem ID\tItem Name\tAmt\tTradable\tChance\tSecret Chance\n51201\tLanistar Key\t3\tX\t100\t70");
  assert.equal(random.bundles[0].items[0].chance, 100);
  assert.equal(random.bundles[0].items[0].secret_chance, 70);
});

test("blocks side by side days, Tier amount matrices and Paid/Free ambiguity", () => {
  for (const input of [
    "Item ID\tItem Name\tAmt\tItem ID\tItem Name\tAmt\n51201\tLanistar Key\t2\t52001\tMemory Key\t3",
    "Item ID\tDisplay Name\tAmt\tAmt\tAmt\n51201\tLanistar Key\t100\t70\t50",
    "Item ID\tItem Name\tAmt\tCost Chance\tFree Chance\n51201\tLanistar Key\t1\t100\t0",
  ]) {
    const result = parseExcelPaste(input);
    assert.equal(result.valid, false);
    assert.equal(result.bundles.length, 0, "Never silently export just the first column group");
    assert.equal(result.warnings[0].code, "UNSUPPORTED_LAYOUT");
  }
});

test("invalid quantities and blank random rates cannot become a valid partial bundle", () => {
  for (const row of ["52001\tMemory Key\t1.5\t50", "52001\tMemory Key\t\t50", "52001\tMemory Key\t1\t", "52001\tMemory Key\t1\toops"]) {
    const result = parseExcelPaste("Bundle Name\tBad input\nItem ID\tItem Name\tAmt\tChance\n51201\tLanistar Key\t1\t50\n" + row);
    assert.equal(result.valid, false, row);
    assert.ok(result.warnings.some(warning => warning.code === "INVALID_ITEM"));
  }
});

test("Markdown escaped currencies and thousands quantities survive", () => {
  const result = parseExcelPaste("Bundle Name\tBACKVELNAS\n| Item ID | Item Name | Amt |\n| --- | --- | --- |\n| Gold\\_Cur | Gold | 1,500 |\n| Popo\\_Fellow\\_1 | Fellow Coin 1 | 30 |");
  assert.equal(result.valid, true);
  assert.deepEqual(result.bundles[0].items.map(item => [item.item_id, item.amount]), [["Gold_Cur", 1500], ["Popo_Fellow_1", 30]]);
});

test("missing ID or truncated headerless quantity blocks partial results", () => {
  for (const input of [
    "Bundle Name\tDemo\n1315001\tFellow Ticket\t2\n52001\tMemory Key",
    "Bundle Name\tDemo\nItem ID\tItem Name\tAmt\n1315001\tFellow Ticket\t2\n\tMemory Key\t3",
  ]) {
    const result = parseExcelPaste(input);
    assert.equal(result.valid, false);
    assert.ok(result.warnings.some(warning => warning.code === "INVALID_ITEM"));
  }
});

test("invalid Secret Chance is rejected while blank and zero remain valid", () => {
  for (const rate of ["oops", "", "0", "25.5"]) {
    const result = parseExcelPaste("Bundle Name\tDemo\nItem ID\tItem Name\tAmt\tChance\tSecret Chance\n1315001\tFellow Ticket\t2\t100\t" + rate);
    assert.equal(result.valid, rate !== "oops");
    if (rate === "oops") assert.ok(result.warnings.some(warning => warning.message.includes("Secret Chance")));
  }
});

test("keeps all items when copied Flash Sale rows shift left after the first row", () => {
  const result = parseExcelPaste(
    `🔥FLASH SALE\tProduct Name\tเสวเสาร์ : ก็แค่อยากเป็นสาวเวียด\tStart\t5 Sep\t00.01 น.\tReset\tNo Reset\tLimit (ครั้ง / ID)\tTotal Paid
\tRank Codition\tBronze+\tEnd\t7 Sep\t23.59 น.\tType\tFlash Sale\t1\t49
0\tTHB\tSeed Point\tGSP Earn\tEXP Rank Earn\tIMG\tItem ID\tItem Name\tAmt\tTradable\tTP / ea
49\t490\t490\t49\t\t63301001\tSpecial Fellow Ticket - Half Year Anniversary\t1\tX\t50
\t63301002\tSpecial Kupole Ticket - Half Year Anniversary\t1\tX\t50
\tPopo_Fellow_1\tFellow Coin 1\t1\tX\t50
\tPopo_Kupo_1\tKupole Coin 1\t1\tX\t50
\t1002102\t[แจกรางวัล] Dungeon Battle Token (3 วัน)\t1\tX\t15`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.name, "เสวเสาร์ : ก็แค่อยากเป็นสาวเวียด");
  assert.equal(result.summary.seedPoint, 490);
  assert.equal(result.summary.gspEarn, 490);
  assert.equal(result.summary.playerExp, 49);
  assert.equal(result.summary.purchaseLimit, 1);
  assert.equal(result.summary.itemCount, 5);
  assert.deepEqual(
    result.bundles[0].items.map((item) => item.item_id),
    ["63301001", "63301002", "Popo_Fellow_1", "Popo_Kupo_1", "1002102"],
  );
});

test("separates fixed and random rows in a shifted Flash Sale request", () => {
  const result = parseExcelPaste(
    `FLASH SALE\tProduct Name\tเสวเสาร์ : Ai Đưa Em Về\tStart\t5 Sep\t00.01 น.\tReset\tNo Reset\tLimit (ครั้ง / ID)\tTotal Paid
\tRank Codition\tBronze+\tEnd\t7 Sep\t23.59 น.\tType\tFlash Sale\t10\t590
1\tTHB\tSeed Point\tGSP Earn\tEXP Rank Earn\tIMG\tItem ID\tItem Name\tAmt\tChance\tTradable
59\t590\t590\t59\t\t51201\tLanistar Key\t5\tFixed\tX
\t45024\tCelestial Belorb Stabilizer\t1\tFixed\tX
\t43014\tMercenary Trainee Certificate : Epic\t1\tFixed\tX
\t51201\tLanistar Key\t50\t0.2\tX
\t51201\tLanistar Key\t40\t0.3\tX
\t51201\tLanistar Key\t30\t0.5\tX
\t51201\tLanistar Key\t10\t1\tX
\t51201\tLanistar Key\t7\t3\tX
\t51201\tLanistar Key\t5\t10\tX
\t51201\tLanistar Key\t3\t15\tX
\t51201\tLanistar Key\t1\t70\tX`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.summary.itemCount, 11);
  assert.equal(result.summary.gspEarn, 590);
  assert.equal(result.summary.playerExp, 59);
  assert.equal(result.summary.isGacha, true);
  assert.equal(result.summary.fixedItemCount, 3);
  assert.equal(result.summary.randomOutcomeCount, 8);
  assert.equal(result.summary.chanceTotal, 100);
  assert.equal(result.bundles[0].items[1].item_id, "45024");
  assert.equal(result.bundles[0].items[1].chance, null);
  assert.equal(result.bundles[0].items[10].chance, 70);
});

test("parses multiple copied Product blocks into separate bundles", () => {
  const result = parseExcelPaste(
    `FLASH SALE\tProduct Name\tStarter A\tLimit\t1
THB\tSeed Point\tGSP Earn\tItem ID\tItem Name\tAmt
10\t100\t100\t50012\tConvent Key\t3

FLASH SALE\tProduct Name\tStarter B\tLimit\t2
THB\tSeed Point\tGSP Earn\tItem ID\tItem Name\tAmt
20\t200\t200\t50013\tArgent Temple Key\t4`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.bundles.length, 2);
  assert.equal(result.document.bundles.length, 2);
  assert.deepEqual(
    result.bundles.map((bundle) => bundle.name),
    ["Starter A", "Starter B"],
  );
  assert.deepEqual(
    result.bundles.map((bundle) => bundle.purchase_limit),
    [1, 2],
  );
  assert.deepEqual(
    result.bundles.map((bundle) => bundle.items[0].item_id),
    ["50012", "50013"],
  );
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
