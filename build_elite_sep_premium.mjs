import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/elite-sep-premium";
const outputPath = `${outputDir}/Elite SEP [Premium].xlsx`;
const prefix = "Elite SEP [Premium]";

const items = [
  ["ITEM", 1002002, "Fellow Stamina Token (7 Days)", 1],
  ["ITEM", 51502, "กุญแจ Kepa Festival II", 5],
  ["ITEM", 1212024, "Mysterious Boss Card : Epic", 2],
  ["WALLET_DEBIT", "Kupole Coin", "Kupole Coin 1", 3],
  ["ITEM", 10070, "Leticia Coin Ticket", 5],
  ["ITEM", 4235100, "Belorb Stabilizer", 10],
  ["ITEM", 1411204, "Dungeon Reward X2 Ticket", 10],
  ["WALLET_DEBIT", "Fellow Coin", "Fellow Coin 1", 3],
  ["ITEM", 45024, "Celestial Belorb Stabilizer", 10],
  ["ITEM", 4235163, "Starlight Belorb Stabilizer : Goddess", 3],
  ["ITEM", 51201, "Lanistar Key", 5],
  ["WALLET_DEBIT", "God Coin", "God Coin 1", 3],
  ["ITEM", 52002, "Crystal Hall Key Selection", 5],
  ["ITEM", 52001, "Memory Stone Key Selection", 5],
  ["ITEM", 43027, "Fellow Level 160 Training Certificate", 1],
];

const rows = items.map(([itemType, itemId, itemName, quantity]) => [
  `${prefix} - ${itemName} ${quantity}`,
  "FIXED",
  itemType,
  itemId,
  quantity,
  "Trainee",
  1,
  null,
  null,
]);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
const sheet = workbook.worksheets.getItem("Import Bundle_Final Cleaning");

sheet.getRange("A2:I200").clear({ applyTo: "contents" });
sheet.getRange(`A2:I${rows.length + 1}`).values = rows;
sheet.getRange(`D2:D${rows.length + 1}`).format.numberFormat = "@";
sheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`G2:G${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange("A:A").format.columnWidth = 52;
sheet.getRange("B:B").format.columnWidth = 14;
sheet.getRange("C:C").format.columnWidth = 16;
sheet.getRange("D:D").format.columnWidth = 18;
sheet.getRange("E:G").format.columnWidth = 12;
sheet.getRange("H:I").format.columnWidth = 12;

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({
  sheetName: "Import Bundle_Final Cleaning",
  range: "A1:I16",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const inspection = await workbook.inspect({
  kind: "table",
  range: "Import Bundle_Final Cleaning!A1:I16",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 9,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
