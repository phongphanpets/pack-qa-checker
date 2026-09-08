import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/di-du-dua-di";
const outputPath = `${outputDir}/เสวเสาร์ Di Du Dua Di.xlsx`;
const campaign = "เสวเสาร์ : Đi Đu Đưa Đi";

const fixedItems = [
  ["ITEM", 101146, 70],
  ["ITEM", 4235152, 7],
  ["WALLET_CREDIT", "Golden Seed Point", 590],
  ["PLAYER_EXPERIENCE", "Player Experience - tosm", 59],
];
const randomItems = [
  [100, 0.03],
  [80, 0.05],
  [60, 0.1],
  [40, 0.2],
  [30, 0.5],
  [15, 1],
  [10, 3],
  [7, 5],
  [5, 25.12],
  [3, 65],
];

const fixedRows = fixedItems.map(([itemType, itemId, quantity], index) => [
  `${campaign} - Fixed`, "FIXED", itemType, itemId, quantity, "Trainee", index + 1, null, null,
]);
const randomRows = randomItems.map(([quantity, chance], index) => [
  `${campaign} - Random`, "RANDOM", "ITEM", 4235152, quantity, "Trainee", index + 1, chance, null,
]);
const rows = [...fixedRows, ...randomRows];

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
const sheet = workbook.worksheets.getItem("Import Bundle_Final Cleaning");
sheet.getRange("A2:I200").clear({ applyTo: "contents" });
sheet.getRange(`A2:I${rows.length + 1}`).values = rows;
sheet.getRange(`D2:D${rows.length + 1}`).format.numberFormat = "@";
sheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`G2:G${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`H2:H${rows.length + 1}`).format.numberFormat = "0.0##";
sheet.getRange("A:A").format.columnWidth = 38;
sheet.getRange("B:C").format.columnWidth = 18;
sheet.getRange("D:D").format.columnWidth = 28;
sheet.getRange("E:G").format.columnWidth = 12;
sheet.getRange("H:I").format.columnWidth = 12;

await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({
  kind: "table",
  range: "Import Bundle_Final Cleaning!A1:I15",
  include: "values,formulas",
  tableMaxRows: 20,
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
  range: "A1:I15",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
