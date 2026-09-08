import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbook = await SpreadsheetFile.importXlsx(
  await FileBlob.load("Approve งาน GM (4).xlsx"),
);
console.log((await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 12000 })).ndjson);

for (const sheetName of ["Import Bundle_Final Cleaning", "Sheet1"]) {
  try {
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    const fs = await import("node:fs/promises");
    await fs.writeFile(`template-${sheetName.replace(/[^a-z0-9]/gi, "-")}.png`, new Uint8Array(await preview.arrayBuffer()));
  } catch {
    // Only one sheet name is expected to exist.
  }
}
