import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/exp1-170";
const outputPath = `${outputDir}/EXP1-170.xlsx`;
const items = [
  [1316011, 64], [1316012, 312], [1316013, 688], [1316014, 717], [1316015, 610],
  [1316016, 873], [1316017, 766], [1316018, 1565], [1316019, 2542], [1316022, 608],
  [1316023, 825], [1316024, 889], [1316025, 880], [1316026, 879], [1316035, 876],
  [1316036, 877], [1316037, 1435],
];

const rows = items.map(([itemId, quantity], index) => [
  "EXP1-170",
  "FIXED",
  "ITEM",
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
sheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "#,##0";
sheet.getRange(`G2:G${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange("A:A").format.columnWidth = 24;
sheet.getRange("B:B").format.columnWidth = 14;
sheet.getRange("C:C").format.columnWidth = 16;
sheet.getRange("D:D").format.columnWidth = 18;
sheet.getRange("E:G").format.columnWidth = 12;
sheet.getRange("H:I").format.columnWidth = 12;

await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({
  kind: "table",
  range: "Import Bundle_Final Cleaning!A1:I18",
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
  range: "A1:I18",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
