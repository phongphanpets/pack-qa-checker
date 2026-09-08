import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const source = "C:/Users/User/Documents/Codex/2026-08-19/new-chat-4/work/sample_template.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
console.log((await workbook.inspect({ kind: "workbook,sheet,table", maxChars: 5000, tableMaxRows: 5, tableMaxCols: 10 })).ndjson);
const preview = await workbook.render({ sheetName: "Import Bundle_Final Cleaning", range: "A1:I14", scale: 1.5, format: "png" });
await fs.writeFile("template-import-preview.png", new Uint8Array(await preview.arrayBuffer()));
