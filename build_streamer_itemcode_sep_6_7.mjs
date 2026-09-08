import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/streamer-itemcode-sep-6-7";
const outputPath = `${outputDir}/Streamer itemcode w-c 6-7 Sep.xlsx`;

const bundles = [
  {
    name: "Streamer itemcode w/c 6/9 #1",
    items: [[4224500, "Card Fragment", 100], [1112101, "EXP Book 200% (24 Hours)", 1], [51201, "Lanistar Key", 2]],
  },
  {
    name: "Streamer itemcode w/c 6/9 #2",
    items: [[4244300, "Blessed Gem : Goddess", 5], [1411075, "Ominous Ruins Key Ticket", 2], [31021, "Meat", 100]],
  },
  {
    name: "Streamer itemcode w/c 6/9 #3",
    items: [[31031, "Mercenary Special Mission Permit", 10], [1311332, "Silver Box 1,000,000", 3], [101147, "Gold", 30]],
  },
  {
    name: "Streamer itemcode w/c 7/9 #1",
    items: [[4413210, "Zone Quest Scroll", 10], [1314331, "Mercenary Trainee Certificate Ticket : Epic", 2], [1112001, "HP Regen", 10]],
  },
  {
    name: "Streamer itemcode w/c 7/9 #2",
    items: [[1411074, "Argent Temple Key Ticket", 2], [1411204, "Dungeon Reward X2 Ticket", 3], [101147, "Gold", 30]],
  },
  {
    name: "Streamer itemcode w/c 7/9 #3",
    items: [[1315002, "God Fellow Ticket", 3], [84001, "Soul Crystal", 5], [1112002, "SP Regen", 10]],
  },
];

const rows = bundles.flatMap(({ name, items }) => items.map(([itemId, itemName, quantity], index) => [
  name,
  "FIXED",
  "ITEM",
  itemId,
  quantity,
  "Trainee",
  index + 1,
  null,
  null,
]));

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
const sheet = workbook.worksheets.getItem("Import Bundle_Final Cleaning");

sheet.getRange("A2:I200").clear({ applyTo: "contents" });
sheet.getRange(`A2:I${rows.length + 1}`).values = rows;
sheet.getRange(`D2:D${rows.length + 1}`).format.numberFormat = "@";
sheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`G2:G${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange("A:A").format.columnWidth = 38;
sheet.getRange("B:B").format.columnWidth = 14;
sheet.getRange("C:C").format.columnWidth = 16;
sheet.getRange("D:D").format.columnWidth = 18;
sheet.getRange("E:G").format.columnWidth = 12;
sheet.getRange("H:I").format.columnWidth = 12;

await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({
  kind: "table",
  range: "Import Bundle_Final Cleaning!A1:I19",
  include: "values,formulas",
  tableMaxRows: 22,
  tableMaxCols: 9,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
const preview = await workbook.render({
  sheetName: "Import Bundle_Final Cleaning",
  range: "A1:I19",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
