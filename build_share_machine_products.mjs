import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Downloads/product-import-template.xlsx";
const outputDir = "outputs/share-machine-products";
const outputPath = `${outputDir}/Share Machine - Product Import.xlsx`;

const products = [
  ["Faded Card (Non-tradable)", 2000],
  ["Belorb Core : Goddess", 1000],
  ["Starlight Belorb Stabilizer : Goddess", 1080],
  ["Belorb Stabilizer", 1000],
  ["God Fellow Ticket", 250],
  ["Fellow Ticket", 125],
  ["Kupole Ticket", 125],
  ["Convent Key", 100],
  ["Lanistar Key", 100],
  ["Ominous Ruins Key", 100],
  ["Argent Temple Key", 100],
  ["Crystal Hall Key Selection", 100],
  ["Memory Stone Key Selection", 100],
  ["Mercenary Trainee Certificate : Epic", 300],
  ["Dungeon Reward X2 Ticket", 225],
  ["Card Fragment", 1000],
  ["Zone Quest Scroll", 150],
  ["Mysterious Dish", 150],
  ["Grain", 1500],
];

const rows = products.map(([name, price]) => [
  "GAME",
  name,
  name,
  "Savior - [ Savior Shop ]",
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
  price,
  price,
  null,
  null,
  null,
  null,
  null,
  null,
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
  kind: "table",
  range: "Products!A1:AH20",
  include: "values,formulas",
  tableMaxRows: 22,
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
  range: "A1:AH20",
  scale: 1.1,
  format: "png",
});
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`Created ${outputPath}`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
