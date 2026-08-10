import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders Pack QA with Excel paste as the primary flow", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Pack QA · Pilot RC1<\/title>/i);
  assert.match(html, /เช็กแพ็กให้ครบ ก่อนส่ง PM/);
  assert.match(html, /Pilot RC1/);
  assert.match(html, /บันทึกงาน/);
  assert.match(html, /เปิดงาน/);
  assert.match(html, />วาง Excel<\/button>/);
  assert.match(html, /วางข้อมูลจาก Excel/);
  assert.match(html, /ก๊อบตารางจาก Excel/);
  assert.match(html, /อัปโหลดภาพ Website/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps Excel parsing separate from the canonical API", async () => {
  const [page, component, parser] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/ExcelPasteForm.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/excel-paste.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /useState<PackMode>\("excel"\)/);
  assert.match(page, /createPilotSession/);
  assert.match(page, /pack_data: packMode !== "yaml"/);
  assert.match(component, /parseExcelPaste/);
  assert.match(component, /Spec จาก Excel · ความมั่นใจ 100%/);
  assert.match(parser, /excel-paste:R\$\{cell\.row\}C\$\{cell\.column\}/);
  assert.match(parser, /GENERATED_BUNDLE_ID/);
  assert.doesNotMatch(parser, /fetch\(|127\.0\.0\.1|RuleEngine/);
});
