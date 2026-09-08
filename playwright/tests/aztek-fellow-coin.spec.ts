import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './support/tosm';

type StepExpectation = {
  step: number;
  productName: string;
  price: number;
  quantity: number;
  seedPoint: number;
  experience: number;
};

type FellowCoinRequest = {
  adminUrl: string;
  campaign: string;
  productWindow: {
    startsAt: string;
    endsAt: string;
  };
  steps: StepExpectation[];
};

const requestFile = path.resolve(process.env.AZTEK_REQUEST_FILE || 'requests/aztek-fellow-coin.json');
const request = JSON.parse(fs.readFileSync(requestFile, 'utf8')) as FellowCoinRequest;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function search(page: Page, placeholder: string, query: string): Promise<void> {
  await page.getByPlaceholder(placeholder).fill(query);
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await page.getByRole('button', { name: 'กำลังค้นหา...', exact: true })
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => undefined);
}

async function findProductRow(page: Page, expected: StepExpectation): Promise<Locator> {
  const rows = page.getByRole('row').filter({ hasText: expected.productName });
  const pricePattern = new RegExp(
    `^${escapeRegExp(expected.productName)}\\s+${expected.price.toLocaleString('en-US')}\\s+${expected.price.toLocaleString('en-US')}\\s+1\\s+`,
  );

  for (const row of await rows.all()) {
    if (pricePattern.test(normalizeText(await row.innerText()))) {
      return row;
    }
  }

  throw new Error(`Product row not found: ${expected.productName} at ${expected.price}`);
}

function expectBundleItem(text: string, name: string, kind: string, quantity: number): void {
  const pattern = new RegExp(
    `${escapeRegExp(name)}\\s+${escapeRegExp(kind)}\\s+(?:x|\\u00d7)${quantity}\\b`,
    'i',
  );

  expect.soft(text, `Expected bundle item ${name} x${quantity}`).toMatch(pattern);
}

test('Aztek Tools: STEP GOD GACHA #3 Fellow Coin matches the request', async ({ page }) => {
  const adminUrl = request.adminUrl.replace(/\/$/, '');

  await page.goto(`${adminUrl}/exe/tosm/shop/products`);
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
  await search(page, 'ค้นหา Product...', 'STEP GOD GACHA #3');

  for (const expected of request.steps) {
    const row = await findProductRow(page, expected);
    const rowText = normalizeText(await row.innerText());

    expect.soft(rowText).toContain(request.productWindow.startsAt);
    expect.soft(rowText).toContain(request.productWindow.endsAt);
    await expect.soft(row.getByRole('switch', { name: 'เปิดใช้งาน', exact: true })).toBeChecked();
    await expect.soft(row.getByRole('switch', { name: 'โหมดทดสอบ', exact: true })).not.toBeChecked();
  }

  await page.goto(`${adminUrl}/exe/tosm/shop/bundles`);
  await expect(page.getByRole('heading', { name: 'Bundles', exact: true })).toBeVisible();
  await search(page, 'ค้นหา Bundle...', request.campaign);

  const bundlePaths = new Map<number, string>();
  for (const expected of request.steps) {
    const bundleName = `${request.campaign} S${expected.step}`;
    const bundleLink = page.getByRole('link', { name: bundleName, exact: true });

    await expect(bundleLink).toHaveCount(1);
    const bundlePath = await bundleLink.getAttribute('href');
    expect(bundlePath, `Expected URL for ${bundleName}`).toBeTruthy();
    bundlePaths.set(expected.step, bundlePath!);
  }

  for (const expected of request.steps) {
    const bundleName = `${request.campaign} S${expected.step}`;
    await page.goto(new URL(bundlePaths.get(expected.step)!, adminUrl).toString());
    await expect(page.getByRole('heading', { name: 'แก้ไข Bundle', exact: true })).toBeVisible();
    await page.getByText('Fellow Coin', { exact: true }).first().waitFor({ state: 'visible' });

    const bundleText = normalizeText(await page.locator('main').innerText());
    expectBundleItem(bundleText, 'Fellow Coin', 'WALLET', expected.quantity);
    expectBundleItem(bundleText, 'Golden Seed Point', 'WALLET', expected.seedPoint);
    expectBundleItem(bundleText, 'Player Experience - tosm', 'PLAYER_EXPERIENCE', expected.experience);
  }
});
