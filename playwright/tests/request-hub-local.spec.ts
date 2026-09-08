import { expect, test } from "@playwright/test";

const baseUrl = process.env.SITE_URL || "http://127.0.0.1:3003/";

test("Web Shop request selects Random and explains automatic rewards", async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.getByRole("heading", { name: "วันนี้ต้องสร้างอะไร?" })).toBeVisible();
  await page.getByRole("button", { name: "Web Shop" }).click();
  await expect(page.getByRole("heading", { name: "สร้างงาน Web Shop" })).toBeVisible();

  await page.getByLabel("ชื่องาน / ชื่อ Product").fill("Browser smoke request");
  await page.getByRole("button", { name: "Random" }).click();
  await page.getByRole("button", { name: "ไม่มี" }).click();
  await page.getByLabel("Seed Point").fill("590");

  await expect(page.getByText("Golden Seed Point 590 · Player EXP 59")).toBeVisible();
  await expect(page.getByRole("button", { name: "สร้าง Request และ Review Bundle" })).toBeVisible();
  await page.screenshot({ path: "test-results/request-hub-webshop.png", fullPage: true });
});

test("Item Code request clearly leads to Bundle Import", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Item Code" }).click();
  await expect(page.getByRole("heading", { name: "สร้างงาน Item Code" })).toBeVisible();
  await expect(page.getByText("ส่งรายการรางวัลไปตรวจและ Export เป็น Bundle Import")).toBeVisible();
  await expect(page.getByRole("button", { name: "สร้าง Request และ Review Bundle" })).toBeVisible();
  await page.getByRole("button", { name: "สร้าง Request และ Review Bundle" }).screenshot({ path: "test-results/request-hub-itemcode-button.png" });
  await page.screenshot({ path: "test-results/request-hub-itemcode-mobile.png", fullPage: true });
});

test("Spreadsheet source selects a tab and creates a Bundle preview", async ({ page }) => {
  const request = {
    id: "BROWSER-ADAPTER",
    title: "Spreadsheet browser smoke",
    request_type: "WEB_SHOP",
    webshop_type: "NORMAL",
    fixed_rewards: false,
    status: "REVIEW",
    requester: "GP",
    created_at: "2026-09-08T00:00:00.000Z",
    updated_at: "2026-09-08T00:00:00.000Z",
    notification_status: "NOT_CONFIGURED",
    source_text: "",
    attachments: [],
    payload: {},
  };
  await page.route("**/api/requests", async (route) => {
    if (route.request().method() === "GET") await route.fulfill({ json: { requests: [request] } });
    else await route.continue();
  });
  await page.route("**/api/requests/BROWSER-ADAPTER", async (route) => {
    await route.fulfill({ json: { request } });
  });

  await page.goto(baseUrl);
  await page.getByRole("button", { name: "เปิดใน Adapter" }).click();
  await expect(page.getByRole("heading", { name: "แปลง Request ให้เป็น Bundle พร้อม Import" })).toBeVisible();
  await page.getByRole("button", { name: "แนบ Spreadsheet" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "request-table.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Bundle Name\tSpreadsheet smoke bundle\nItem ID\tItem Name\tAmt\n4235100\tBelorb Stabilizer\t5\n", "utf8"),
  });

  await expect(page.getByLabel("เลือกแท็บ Spreadsheet")).toHaveValue("request-table");
  await expect(page.getByRole("heading", { name: "Spreadsheet smoke bundle" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Import file (1)" })).toBeVisible();
});

test("Web Shop request can choose a tab from an attached spreadsheet", async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Web Shop" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "attached-request.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Bundle Name\tAttached tab bundle\nItem ID\tItem Name\tAmt\n4235100\tBelorb Stabilizer\t5\n", "utf8"),
  });

  await expect(page.getByLabel("เลือกแท็บจากไฟล์ประกอบ")).toHaveValue("attached-request");
  await page.getByRole("button", { name: "ใช้แท็บนี้" }).last().click();
  await expect(page.getByText("อ่านตารางได้แล้ว")).toBeVisible();
  await expect(page.locator(".processing-summary").getByText("Bundles")).toBeVisible();
});

test("Item Code request can choose a tab from an attached spreadsheet", async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Item Code" }).click();
  await page.getByLabel("ชื่องาน / ชื่อ Bundle").fill("Attached Item Code bundle");
  await page.locator('input[type="file"]').setInputFiles({
    name: "itemcode-items.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Item ID\tItem Name\tAmt\n4224500\tCard Fragment\t100\n", "utf8"),
  });

  await expect(page.getByLabel("เลือกแท็บจากไฟล์ประกอบ")).toHaveValue("itemcode-items");
  await page.getByRole("button", { name: "ใช้แท็บนี้" }).last().click();
  await expect(page.getByText("อ่านตารางได้แล้ว")).toBeVisible();
});

test("Bundle only opens a clean Adapter without Product export", async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Bundle only" }).click();
  await expect(page.getByRole("heading", { name: "แปลง Request ให้เป็น Bundle พร้อม Import" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product ที่ผูกกับ Bundle" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "วางข้อมูลจาก Request" })).toBeVisible();
});

test("reads a bare Item ID, Item Name and Amt list and lets the user name its bundle", async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Bundle only" }).click();
  await page.locator("textarea.request-textarea").fill("1315002\tGod Fellow Ticket\t30\nGold_Cur\tGold\t1500");
  await expect(page.getByLabel("ชื่อ Bundle จากรายการ")).toBeVisible();
  await page.getByLabel("ชื่อ Bundle จากรายการ").fill("EXP1-170");
  await expect(page.getByRole("heading", { name: "EXP1-170" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Export Import file/ })).toBeVisible();
});
