import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const templatePath = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const outputDir = "outputs/elite-sep-f";
const outputPath = `${outputDir}/Elite SEP [F].xlsx`;
const prefix = "Elite SEP [F]";

const items = [
  [1112001, "HP Regen", 5],
  [1112002, "SP Regen", 5],
  [1311331, "Silver Box 100,000", 5],
  [4413210, "Zone Quest Scroll", 10],
  [1112004, "Goddess Blessed Potion", 5],
  [1211001, "Mysterious Dish", 5],
  [1002000, "Fellow Stamina Token (3 Days)", 1],
  [1311106, "Material Jar : Epic", 5],
  [1315001, "Fellow Ticket", 2],
  [1315011, "Kupole Ticket", 2],
  [1314321, "Mercenary Trainee Certificate Ticket : Unique", 2],
  [10003, "Mysterious Gift Box : Rare", 2],
  [1211021, "Mysterious Farm Material Box", 5],
  [4224500, "Card Fragment", 10],
  [1315002, "God Fellow Ticket", 2],
];

const rows = items.map(([itemId, itemName, quantity]) => [
  `${prefix} - ${itemName} ${quantity}`,
  "FIXED",
  "ITEM",
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
sheet.getRange(`D2:D${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`E2:E${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`G2:G${rows.length + 1}`).format.numberFormat = "0";
sheet.getRange("A:A").format.columnWidth = 52;
sheet.getRange("B:B").format.columnWidth = 14;
sheet.getRange("C:C").format.columnWidth = 12;
sheet.getRange("D:D").format.columnWidth = 14;
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
