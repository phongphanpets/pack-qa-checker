import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/ca-phe";
const outputPath = `${outputDir}/เสวเสาร์ CA PHE.xlsx`;
const bundleName = "เสวเสาร์ : CÀ PHÊ";

const items = [
  ["ITEM", 540051, 1],
  ["ITEM", 540041, 1],
  ["ITEM", 540031, 1],
  ["ITEM", 540021, 1],
  ["ITEM", 540011, 1],
  ["ITEM", 4224500, 999],
  ["WALLET_CREDIT", "Golden Seed Point", 2490],
  ["PLAYER_EXPERIENCE", "Player Experience - tosm", 249],
];
const rows = items.map(([itemType, itemId, quantity], index) => [
  bundleName, "FIXED", itemType, itemId, quantity, "Trainee", index + 1, null, null,
]);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
const sheet = workbook.worksheets.getItem("Import Bundle_Final Cleaning");
sheet.getRange("A2:I200").clear({ applyTo: "contents" });
sheet.getRange(`A2:I${rows.length + 1}`).values = rows;
sheet.getRange(`D2:D${rows.length + 1}`).format.numberFormat = "@";
sheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`G2:G${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange("A:A").format.columnWidth = 30;
sheet.getRange("B:C").format.columnWidth = 18;
sheet.getRange("D:D").format.columnWidth = 28;
sheet.getRange("E:G").format.columnWidth = 12;
sheet.getRange("H:I").format.columnWidth = 12;

await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({
  kind: "table",
  range: "Import Bundle_Final Cleaning!A1:I9",
  include: "values,formulas",
  tableMaxRows: 12,
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
  range: "A1:I9",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
