import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { once } from "node:events";
import { chromium } from "playwright";

test("Product fields follow a replacement source without losing edits within the same source", async () => {
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
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const table = (name, price) => `Product Name\t${name}\n0\tTHB\tSeed Point\tGSP Earn\tEXP Rank Earn\tIMG\tItem ID\tItem Name\tAmt\n1\t${price / 10}\t${price}\t${price}\t${price / 10}\t\t51201\tLanistar Key\t2`;
    await page.goto(`http://127.0.0.1:${server.address().port}/pack-qa-checker/`);
    const source = page.locator(".request-textarea");
    await source.fill(table("Pack 10.1", 990));
    await page.getByRole("button", { name: "ตั้งค่า Product", exact: true }).click();
    await page.getByLabel("ชื่อ Product 1").fill("Custom 10.1");
    await source.fill(table("Pack 10.2", 290));
    await page.getByLabel("ชื่อ Product 1").waitFor();
    assert.equal(await page.getByLabel("ชื่อ Product 1").inputValue(), "Pack 10.2");
    assert.equal(await page.getByLabel("ราคา SP 1").inputValue(), "290");
    assert.match(await page.locator(".product-line small").innerText(), /Bundle: Pack 10\.2/);
    await page.getByLabel("ชื่อ Product 1").fill("Custom 10.2");
    await page.getByLabel("ชื่อ Bundle 1").fill("New bundle 10.2");
    assert.equal(await page.getByLabel("ชื่อ Product 1").inputValue(), "Custom 10.2");
    assert.match(await page.locator(".product-line small").innerText(), /Bundle: New bundle 10\.2/);

    const sheets = { "10.1": table("Sheet 10.1", 990), "10.2": table("Sheet 10.2", 290) };
    await page.evaluate(() => {
      window.google = { accounts: { oauth2: { initTokenClient: ({ callback }) => ({
        requestAccessToken: () => callback({ access_token: "test-access", expires_in: 3600 }),
      }) } } };
    });
    await page.route("https://sheets.googleapis.com/v4/spreadsheets/**", async (route) => {
      const url = route.request().url();
      const values = Object.entries(sheets).find(([name]) => url.includes(encodeURIComponent(`'${name}'`)))?.[1];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(values
        ? { values: values.split("\n").map((row) => row.split("\t")) }
        : { sheets: Object.keys(sheets).map((name, sheetId) => ({ properties: { title: name, sheetId } })) }) });
    });
    await page.getByRole("button", { name: /Google Sheet วางลิงก์แล้วเลือกแท็บ/ }).click();
    await page.getByLabel("ลิงก์ Google Sheet").fill("https://docs.google.com/spreadsheets/d/test-sheet/edit?gid=0");
    await page.getByRole("button", { name: /เชื่อม Google และอ่านแท็บ/ }).click();
    await page.getByLabel("เลือกแท็บ Spreadsheet").waitFor();
    await page.getByRole("button", { name: "ตั้งค่า Product", exact: true }).click();
    assert.equal(await page.getByLabel("ชื่อ Product 1").inputValue(), "Sheet 10.1");
    await page.getByLabel("ชื่อ Product 1").fill("Custom sheet 10.1");
    await page.getByLabel("ชื่อ Bundle 1").fill("Old sheet override");
    await page.getByLabel("เลือกแท็บ Spreadsheet").selectOption("10.2");
    await page.getByLabel("ชื่อ Product 1").waitFor();
    assert.equal(await page.getByLabel("ชื่อ Product 1").inputValue(), "Sheet 10.2");
    assert.equal(await page.getByLabel("ราคา SP 1").inputValue(), "290");
    assert.equal(await page.getByLabel("ชื่อ Bundle 1").inputValue(), "Sheet 10.2");
    assert.match(await page.locator(".product-line small").innerText(), /Bundle: Sheet 10\.2/);
  } finally {
    await browser.close();
    server.close();
  }
});
