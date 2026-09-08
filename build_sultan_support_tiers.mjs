import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/sultan-support-tiers";
const outputPath = `${outputDir}/Sultan support Tiers.xlsx`;

const items = [
  [1315002, "God Fellow Ticket", 100, 70, 50],
  [1315001, "Fellow Ticket", 100, 70, 50],
  [1315011, "Kupole Ticket", 100, 70, 50],
  [50012, "Convent Key", 100, 100, 100],
  [51201, "Lanistar Key", 100, 100, 100],
  [50014, "Ominous Ruins Key", 100, 100, 100],
  [50013, "Argent Temple Key", 100, 100, 100],
  [52002, "Crystal Hall Key Selection", 100, 100, 100],
  [52001, "Memory Stone Key Selection", 100, 100, 100],
  [1316014, "Episode 4 EXP Card", 999, 999, 999],
  [1316018, "Episode 8 EXP Card(N)", 999, 999, 999],
  [1316022, "Episode 12 EXP Card", 999, 999, 999],
  [1314331, "Mercenary Trainee Certificate Ticket : Epic", 100, 100, 100],
  [4224500, "Card Fragment", 10000, 10000, 10000],
  [1314121, "Rank Up Scroll Ticket : UR", 10, 10, 10],
  [1314021, "Goddess's Grace Ticket : UR (สำหรับส่งของรางวัล)", 10, 10, 10],
  [4235100, "Belorb Stabilizer", 100, 70, 50],
  [540002, "Faded Card (Non-tradable)", 1, 1, 1],
  [4225000, "Equipment Modification Toolkit", 5, 3, 1],
  [4225010, "Equipment Restoration Potion", 5, 3, 1],
  [4225011, "Armor Restoration Potion", 5, 3, 1],
  [4235163, "Starlight Belorb Stabilizer : Goddess", 10, 6, 3],
  [4235152, "Starlight Belorb : Goddess", 120, 90, 30],
  [1411204, "Dungeon Reward X2 Ticket", 100, 100, 100],
  [4225031, "Belorb Core : Goddess", 10, 5, 3],
  [4413210, "Zone Quest Scroll", 100, 100, 100],
  [101147, "Gold", 5000, 4000, 3000],
  [300011, "Skill Reset Scroll", 3, 3, 3],
  [1311336, "Silver Box 100,000,000", 1, 1, 1],
  [4414130, "Upinis Shining Wing Powder", 20, 20, 20],
  [1112405, "EXP Book Quest x2 (Lv 1-99)", 1, 1, 1],
  [1112406, "Exp Book - Quest x2.0 (Lv 100~119) ถาวร", 1, 1, 1],
];

const bundles = [
  { name: "Sultan support Tier S", amountIndex: 2 },
  { name: "Sultan support Tier A", amountIndex: 3 },
  { name: "Sultan support Tier B", amountIndex: 4 },
];

const rows = bundles.flatMap(({ name, amountIndex }) =>
  items.map(([itemId, _displayName, ...amounts], index) => [
    name,
    "FIXED",
    "ITEM",
    itemId,
    amounts[amountIndex - 2],
    "Trainee",
    index + 1,
    null,
    null,
  ]),
);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
const sheet = workbook.worksheets.getItem("Import Bundle_Final Cleaning");

sheet.getRange("A2:I200").clear({ applyTo: "contents" });
sheet.getRange(`A2:I${rows.length + 1}`).values = rows;
sheet.getRange(`D2:D${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`G2:G${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange("A:A").format.columnWidth = 28;
sheet.getRange("B:B").format.columnWidth = 14;
sheet.getRange("C:C").format.columnWidth = 12;
sheet.getRange("D:D").format.columnWidth = 14;
sheet.getRange("E:E").format.columnWidth = 12;
sheet.getRange("F:F").format.columnWidth = 12;
sheet.getRange("G:G").format.columnWidth = 12;
sheet.getRange("H:I").format.columnWidth = 12;

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({
  sheetName: "Import Bundle_Final Cleaning",
  range: "A1:I18",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const inspection = await workbook.inspect({
  kind: "table",
  range: "Import Bundle_Final Cleaning!A1:I97",
  include: "values,formulas",
  tableMaxRows: 100,
  tableMaxCols: 9,
});
await fs.writeFile(`${outputDir}/inspection.ndjson`, inspection.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
await fs.writeFile(`${outputDir}/formula-errors.ndjson`, errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`Created ${outputPath}`);
console.log(`Rows: ${rows.length}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
