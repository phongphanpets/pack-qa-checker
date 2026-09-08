import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/newbie-fire";
const outputPath = `${outputDir}/น้องใหม่ไฟแรง.xlsx`;
const bundleName = "น้องใหม่ไฟแรง";

const items = [
  ["ITEM", 1313861, 1],
  ["ITEM", 6013940, 1],
  ["ITEM", 7120080, 1],
  ["ITEM", 4225023, 1],
  ["ITEM", 1212041, 5],
  ["ITEM", 1212024, 20],
  ["ITEM", 51502, 30],
  ["ITEM", 10070, 100],
  ["WALLET_DEBIT", "God Coin", 30],
  ["WALLET_DEBIT", "Fellow Coin", 30],
  ["WALLET_DEBIT", "Kupole Coin", 30],
  ["ITEM", 4235100, 30],
];

const rows = items.map(([itemType, itemId, quantity], index) => [
  bundleName,
  "FIXED",
  itemType,
  itemId,
  quantity,
  "Trainee",
  index + 1,
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
sheet.getRange("A:A").format.columnWidth = 28;
sheet.getRange("B:B").format.columnWidth = 16;
sheet.getRange("C:C").format.columnWidth = 16;
sheet.getRange("D:D").format.columnWidth = 18;
sheet.getRange("E:G").format.columnWidth = 12;
sheet.getRange("H:I").format.columnWidth = 12;

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({
  sheetName: "Import Bundle_Final Cleaning",
  range: "A1:I13",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const inspection = await workbook.inspect({
  kind: "table",
  range: "Import Bundle_Final Cleaning!A1:I13",
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
