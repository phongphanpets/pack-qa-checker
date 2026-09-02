import { expect, test } from "@playwright/test";

test("loads the Pack QA workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Pack QA/);
  await expect(page.getByRole("heading", { name: "เช็กแพ็กให้ครบ ก่อนส่ง PM" })).toBeVisible();
});
