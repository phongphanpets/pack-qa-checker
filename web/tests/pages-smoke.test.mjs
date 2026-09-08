import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { once } from "node:events";
import { chromium } from "playwright";

test("Pages renders connection and parses a pasted bundle without a server", async () => {
  const root = resolve("dist-pages");
  const server = createServer(async (req, res) => {
    const path = resolve(root, "." + new URL(req.url, "http://localhost").pathname.replace(/^\/pack-qa-checker/, "").replace(/\/$/, "/index.html"));
    if (!path.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    try {
      const bytes = await readFile(path);
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[extname(path)] || "application/octet-stream");
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/pack-qa-checker/`);
    await page.getByText("วันนี้ต้องสร้างอะไร?", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Bundle only/ }).click();
    const textarea = page.locator("textarea").first();
    await textarea.fill("1315002\tGod Fellow Ticket\t30");
    await page.getByText("God Fellow Ticket", { exact: true }).first().waitFor();
    await mkdir("../outputs/pages-review", { recursive: true });
    await page.screenshot({ path: "../outputs/pages-review/desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "../outputs/pages-review/mobile.png", fullPage: true });
    const request = { id: "SMOKE1", title: "Saved request", request_type: "ITEM_CODE", status: "REVIEW", updated_at: "2026-09-08T00:00:00Z", source_text: "1315002\tGod Fellow Ticket\t30", payload: {} };
    await page.route("**/api/requests", route => route.fulfill({ json: { requests: [request] } }));
    await page.route("**/api/requests/SMOKE1", route => route.fulfill({ json: { request } }));
    let exportedId;
    await page.route("**/api/bundle-import", route => {
      exportedId = route.request().postDataJSON().requestId;
      return route.fulfill({ contentType: "application/octet-stream", body: "test-download" });
    });
    await page.reload();
    await page.getByRole("button", { name: "เปิดใน Adapter", exact: true }).click();
    await page.getByRole("button", { name: /Export Import file/ }).click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).some(b => b.textContent.includes("กำลังสร้างไฟล์")));
    assert.equal(exportedId, "SMOKE1", "Reopening a request without auto rewards must retain its export history ID");
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
