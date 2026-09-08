import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/streamer-itemcode-6-7";
const outputPath = `${outputDir}/Streamer itemcode 6-7 Sep.xlsx`;

const bundles = [
  {
    name: "Streamer itemcode 6/9 #1",
    items: [[1315001, "Fellow Ticket", 2], [52001, "Memory Stone Key Selection", 2], [101147, "Gold", 20]],
  },
  {
    name: "Streamer itemcode 6/9 #2",
    items: [[43014, "Mercenary Trainee Certificate : Epic", 2], [1411202, "Rift Key Ticket", 2], [4413210, "Zone Quest Scroll", 10]],
  },
  {
    name: "Streamer itemcode 6/9 #3",
    items: [[44023, "Mount EXP Stone : Unique", 5], [51010, "กุญแจ Heart of Chaos", 2], [101147, "Gold", 20]],
  },
  {
    name: "Streamer itemcode 7/9 #1",
    items: [[4217000, "Eid Crystal : Goddess", 10], [44023, "Mount EXP Stone : Unique", 5], [101147, "Gold", 20]],
  },
  {
    name: "Streamer itemcode 7/9 #2",
    items: [[1315011, "Kupole Ticket", 3], [52002, "Crystal Hall Key Selection", 2], [31001, "Grain", 100]],
  },
  {
    name: "Streamer itemcode 7/9 #3",
    items: [[4234300, "Belorb : Goddess", 10], [1311106, "Material Jar : Epic", 5], [31011, "Fruits", 100]],
  },
];

const rows = bundles.flatMap(({ name, items }) => items.map(([itemId, _itemName, quantity], index) => [
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
sheet.getRange("A:A").format.columnWidth = 34;
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
