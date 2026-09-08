import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Downloads/product-import-template.xlsx";
const outputDir = "outputs/share-machine-products-2";
const outputPath = `${outputDir}/Share Machine - Product Import 2.xlsx`;
const products = [
  ["Fellow Stamina Token (7 Days)", 500],
  ["Goddess's Grace Ticket : UR (สำหรับส่งของรางวัล)", 1200],
  ["Rank Up Scroll Ticket : UR", 2000],
  ["Armor Restoration Potion", 3000],
  ["Equipment Restoration Potion", 4000],
  ["Equipment Modification Toolkit", 5000],
  ["Popopop Neon Sunglasses", 6000],
];

const rows = products.map(([name, price]) => [
  "GAME", name, name, "Savior Shop - [ Savior Shop ]", null, null, null, null, null, null, null,
  510, "2026-09-07 00:00:00", "2026-12-31 23:59:59", 1, null, null, null, null, null, null,
  "TRUE", true, false, "Social Point", price, price, null, null, null, null, null, null,
  `Share Machine - ${name}`,
]);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
const sheet = workbook.worksheets.getItem("Products");
sheet.getRange("A2:AH200").clear({ applyTo: "contents" });
sheet.getRange(`A2:AH${rows.length + 1}`).values = rows;
sheet.getRange(`L2:L${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`O2:U${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`Z2:AA${rows.length + 1}`).format.numberFormat = "#,##0";
sheet.getRange("A:AH").format.wrapText = true;

await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({
  kind: "table", range: "Products!A1:AH8", include: "values,formulas", tableMaxRows: 10, tableMaxCols: 34,
});
const errors = await workbook.inspect({
  kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan",
});
const preview = await workbook.render({ sheetName: "Products", range: "A1:AH8", scale: 1.2, format: "png" });
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
