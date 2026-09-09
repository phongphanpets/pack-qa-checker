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

test("server-renders Request Hub with request intake and history", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Bundle Import · Request Hub<\/title>/i);
  assert.match(html, /วันนี้ต้องสร้างอะไร/);
  assert.match(html, /Web Shop/);
  assert.match(html, /Item Code/);
  assert.match(html, /Bundle only/);
  assert.match(html, /งานที่เข้ามา/);
  assert.match(html, /ค้นหางาน/);
  assert.match(html, /กรองสถานะ/);
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
