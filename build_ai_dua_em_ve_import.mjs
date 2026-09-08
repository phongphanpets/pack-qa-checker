import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/ai-dua-em-ve";
const outputPath = `${outputDir}/เสวเสาร์ Ai Dua Em Ve.xlsx`;
const campaign = "เสวเสาร์ : Ai Đưa Em Về";

const fixedItems = [
  ["ITEM", 51201, 5],
  ["ITEM", 45024, 1],
  ["ITEM", 43014, 1],
  ["WALLET_CREDIT", "Golden Seed Point", 590],
  ["PLAYER_EXPERIENCE", "Player Experience - tosm", 59],
];

const randomItems = [
  [51201, 50, 0.2],
  [51201, 40, 0.3],
  [51201, 30, 0.5],
  [51201, 10, 1],
  [51201, 7, 3],
  [51201, 5, 10],
  [51201, 3, 15],
  [51201, 1, 70],
];

const fixedRows = fixedItems.map(([itemType, itemId, quantity], index) => [
  `${campaign} - Fixed`,
  "FIXED",
  itemType,
  itemId,
  quantity,
  "Trainee",
  index + 1,
  null,
  null,
]);
const randomRows = randomItems.map(([itemId, quantity, chance], index) => [
  `${campaign} - Random`,
  "RANDOM",
  "ITEM",
  itemId,
  quantity,
  "Trainee",
  index + 1,
  chance,
  null,
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
  range: "Import Bundle_Final Cleaning!A1:I14",
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
  range: "A1:I14",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
