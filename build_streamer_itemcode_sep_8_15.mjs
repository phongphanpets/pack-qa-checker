import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/streamer-itemcode-sep-8-15";
const outputPath = `${outputDir}/Streamer itemcode w-c 8-15 Sep.xlsx`;

const bundles = [
  [8, 1, [[44023, 5], [51010, 2], [101147, 20]]],
  [8, 2, [[63301001, 1], [1411202, 2], [4413210, 10]]],
  [8, 3, [[1411204, 3], [52002, 2], [31001, 100]]],
  [9, 1, [[52002, 2], [84001, 5], [1311106, 5]]],
  [9, 2, [[51201, 2], [1411075, 2], [1211001, 5]]],
  [9, 3, [[4217000, 5], [4413210, 10], [1311332, 3]]],
  [10, 1, [[1315002, 3], [1315001, 3], [1315011, 3]]],
  [10, 2, [[1411204, 3], [44023, 5], [1314331, 1]]],
  [10, 3, [[52001, 2], [1311332, 3], [4224500, 100]]],
  [11, 1, [[1314331, 3], [1112001, 10], [52001, 2]]],
  [11, 2, [[1411204, 2], [4224500, 100], [1112101, 1]]],
  [11, 3, [[52002, 2], [84001, 5], [1311106, 5]]],
  [12, 1, [[4218000, 5], [84001, 5], [1211001, 6]]],
  [12, 2, [[51201, 2], [4224500, 100], [52001, 2]]],
  [12, 3, [[1411204, 3], [1314331, 1], [51010, 2]]],
  [13, 1, [[1314331, 1], [44023, 3], [1311332, 3]]],
  [13, 2, [[4234400, 2], [1311332, 3], [1411202, 2]]],
  [13, 3, [[101147, 30], [1411074, 2], [1411204, 3]]],
  [14, 1, [[1311106, 3], [31031, 10], [1112002, 10]]],
  [14, 2, [[51201, 2], [1411074, 2], [31011, 100]]],
  [14, 3, [[4244400, 2], [4413210, 10], [31021, 100]]],
  [15, 1, [[63301002, 1], [1411202, 2], [4413210, 5]]],
  [15, 2, [[1411204, 2], [1311332, 2], [31031, 10]]],
  [15, 3, [[101147, 30], [1411075, 2], [1211001, 6]]],
];

const rows = bundles.flatMap(([date, codeNumber, items]) => items.map(([itemId, quantity], index) => [
  `Streamer itemcode w/c ${date}/9 #${codeNumber}`,
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
sheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "#,##0";
sheet.getRange(`G2:G${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange("A:A").format.columnWidth = 36;
sheet.getRange("B:B").format.columnWidth = 14;
sheet.getRange("C:C").format.columnWidth = 16;
sheet.getRange("D:D").format.columnWidth = 18;
sheet.getRange("E:G").format.columnWidth = 12;
sheet.getRange("H:I").format.columnWidth = 12;

await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({
  kind: "table",
  range: "Import Bundle_Final Cleaning!A1:I73",
  include: "values,formulas",
  tableMaxRows: 75,
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
  range: "A1:I73",
  scale: 1.25,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
