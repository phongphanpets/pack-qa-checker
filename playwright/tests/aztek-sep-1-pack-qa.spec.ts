import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './support/tosm';

type VerifiedPack = {
  name: string;
  price: number;
  purchaseLimit: number;
  bundleIds: number[];
  startsAt: string;
  endsAt: string;
};

type PackQaRequest = {
  adminUrl: string;
  sourceSpec: string;
  verifiedPacks: VerifiedPack[];
  manualReview: Array<{
    name: string;
    bundleIds?: number[];
    reason: string;
  }>;
};

const requestFile = path.resolve(process.env.AZTEK_PACK_QA_FILE || 'requests/aztek-sep-1-pack-qa.json');
const request = JSON.parse(fs.readFileSync(requestFile, 'utf8')) as PackQaRequest;

async function searchProduct(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder('ค้นหา Product...').fill(name);
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await page.getByRole('button', { name: 'กำลังค้นหา...', exact: true })
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => undefined);
}

async function openProducts(page: Page, url: string): Promise<void> {
  const productsHeading = page.getByRole('heading', { name: 'Products', exact: true });

  await page.goto(url);
  if (await productsHeading.isVisible().catch(() => false)) {
    return;
  }

  const bodyText = normalizeText(await page.locator('body').innerText().catch(() => ''));
  if (!bodyText) {
    await page.reload();
  }

  await expect(productsHeading).toBeVisible({ timeout: 30_000 });
}

test('Aztek Tools: 1 Sep TOSM packs match the approved QA spec', async ({ page }) => {
  const adminUrl = request.adminUrl.replace(/\/$/, '');
  test.setTimeout(120_000);

  for (const pack of request.verifiedPacks) {
    await openProducts(page, `${adminUrl}/exe/tosm/shop/products`);
    await searchProduct(page, pack.name);

    const productLink = page.getByRole('link', { name: pack.name, exact: true });
    await expect(productLink, `${pack.name} should appear in Products`).toHaveCount(1);
    const productPath = await productLink.getAttribute('href');
    expect(productPath).toBeTruthy();

    await page.goto(new URL(productPath!, adminUrl).toString());
    await expect(page.getByRole('heading', { name: 'แก้ไข Product', exact: true })).toBeVisible();

    const productName = await page.getByRole('textbox', { name: 'ชื่อสินค้า (ไทย) *', exact: true }).inputValue();
    const numberInputs = await page.locator('input[type="number"]').evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
    const productText = normalizeText(await page.locator('main').innerText());

    expect(productName).toBe(pack.name);
    expect(numberInputs).toContain(String(pack.price));
    expect(numberInputs).toContain(String(pack.purchaseLimit));
    expect(productText).toContain(pack.startsAt);
    expect(productText).toContain(pack.endsAt);
    expect(productText).toContain('PLAYER');

    for (const bundleId of pack.bundleIds) {
      expect(productText, `${pack.name} should use Bundle #${bundleId}`).toContain(`#${bundleId}`);
    }

    await expect(page.getByRole('switch', { name: 'เปิดใช้งาน', exact: true })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'โหมดทดสอบ', exact: true })).not.toBeChecked();
  }
});

test('QA handoff: packs still needing manual evidence are visible', async () => {
  const reviewNames = request.manualReview.map((item) => item.name).join(', ');

  expect(reviewNames).toContain('เสวเบา ๆ : ติดหวาน 99%');
  expect(request.manualReview).toHaveLength(2);
});
