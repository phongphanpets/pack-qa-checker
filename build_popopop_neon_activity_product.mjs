import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Downloads/product-import-template.xlsx";
const outputDir = "outputs/popupop-neon-activity-product";
const outputPath = `${outputDir}/Popopop Neon Activity Costume - Product Import.xlsx`;
const productName = "Popopop Neon Activity Costume";

const row = [[
  "GAME",
  productName,
  productName,
  "Savior Shop",
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  510,
  "2026-09-07 00:00:00",
  "2026-12-31 23:59:59",
  1,
  null,
  null,
  null,
  null,
  null,
  null,
  "TRUE",
  true,
  false,
  "Social Point",
  4000,
  4000,
  null,
  null,
  null,
  null,
  null,
  null,
  productName,
]];

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
const sheet = workbook.worksheets.getItem("Products");

sheet.getRange("A2:AH200").clear({ applyTo: "contents" });
sheet.getRange("A2:AH2").values = row;
sheet.getRange("L2").format.numberFormat = "0";
sheet.getRange("O2:U2").format.numberFormat = "0";
sheet.getRange("Z2:AA2").format.numberFormat = "0";
sheet.getRange("A:AH").format.wrapText = true;

await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({
  kind: "table",
  range: "Products!A1:AH2",
  include: "values,formulas",
  tableMaxRows: 3,
  tableMaxCols: 34,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
const preview = await workbook.render({
  sheetName: "Products",
  range: "A1:AH2",
  scale: 1.2,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
