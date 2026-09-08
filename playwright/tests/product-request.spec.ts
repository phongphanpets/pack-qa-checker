import { expect, type Page, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type ProductRequest = {
  id: string;
  url: string;
  skip?: boolean;
  selectors?: {
    name?: string;
    price?: string;
    sku?: string;
    availability?: string;
    stepContainer?: string;
  };
  expected: {
    name?: string;
    nameContains?: string;
    priceText?: string;
    priceContains?: string;
    priceNumber?: number;
    sku?: string;
    availabilityText?: string;
    inStock?: boolean;
    pageTexts?: string[];
    steps?: Array<{
      label: string;
      fields: string[];
    }>;
  };
};

type ProductRequestFile = {
  products: ProductRequest[];
};

const requestPath = path.resolve(
  process.env.PRODUCT_REQUEST_FILE || 'requests/products.json',
);

function loadRequests(): ProductRequest[] {
  if (!fs.existsSync(requestPath)) {
    throw new Error(`Product request file not found: ${requestPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(requestPath, 'utf8')) as ProductRequestFile;

  if (!Array.isArray(parsed.products)) {
    throw new Error('Product request file must contain a "products" array.');
  }

  return parsed.products;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function assertPageContains(page: Page, expectedText: string): Promise<void> {
  const bodyText = normalizeText(await page.locator('body').innerText());

  expect(
    bodyText,
    `Expected page body to contain: "${expectedText}"`,
  ).toContain(normalizeText(expectedText));
}

async function assertTextGroupNearLabel(
  page: Page,
  label: string,
  expectedFields: string[],
): Promise<void> {
  const bodyText = await page.locator('body').innerText();
  const lines = bodyText.split('\n').map(normalizeText).filter(Boolean);
  const labelIndex = lines.findIndex((line) => line.includes(label));

  expect(labelIndex, `Expected page body to contain label: "${label}"`).toBeGreaterThanOrEqual(0);

  const nearbyText = lines.slice(labelIndex, labelIndex + 20).join(' ');

  for (const field of expectedFields) {
    expect(nearbyText, `Expected text near ${label} to contain: "${field}"`).toContain(
      normalizeText(field),
    );
  }
}

async function assertReadyForProductCheck(page: Page): Promise<void> {
  const bodyText = normalizeText(await page.locator('body').innerText());
  const isLoginPage = bodyText.includes('EXE ID') && bodyText.includes('รหัสผ่าน');
  const isSecurityCheck = bodyText.includes('Performing security verification');

  if (isLoginPage) {
    throw new Error(
      [
        'The shop page redirected to the EXE login page.',
        'Run "pnpm run auth:tosm" first, log in manually, then run:',
        '$env:STORAGE_STATE="playwright/.auth/tosm.json"; pnpm test',
      ].join('\n'),
    );
  }

  if (isSecurityCheck) {
    throw new Error(
      'The site is showing a security verification page. Run the test headed or save a logged-in session with "pnpm run auth:tosm".',
    );
  }
}

function parsePriceNumber(value: string): number {
  const normalized = value.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);

  if (Number.isNaN(parsed)) {
    throw new Error(`Could not parse price number from: "${value}"`);
  }

  return parsed;
}

async function textBySelector(page: Page, selector?: string): Promise<string | undefined> {
  if (!selector) {
    return undefined;
  }

  const locator = page.locator(selector).first();
  await expect(locator, `Expected selector to exist: ${selector}`).toBeVisible();

  return normalizeText(await locator.innerText());
}

const productRequests = loadRequests();

test.describe('product matches request', () => {
  for (const product of productRequests) {
    const productTest = product.skip ? test.skip : test;

    productTest(`${product.id}`, async ({ page }) => {
      await page.goto(product.url);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await assertReadyForProductCheck(page);

      const actualName = await textBySelector(page, product.selectors?.name);
      const actualPrice = await textBySelector(page, product.selectors?.price);
      const actualSku = await textBySelector(page, product.selectors?.sku);
      const actualAvailability = await textBySelector(page, product.selectors?.availability);

      if (product.expected.name !== undefined) {
        if (actualName !== undefined) {
          expect(actualName).toBe(product.expected.name);
        } else {
          await assertPageContains(page, product.expected.name);
        }
      }

      if (product.expected.nameContains !== undefined) {
        if (actualName !== undefined) {
          expect(actualName).toContain(product.expected.nameContains);
        } else {
          await assertPageContains(page, product.expected.nameContains);
        }
      }

      if (product.expected.priceText !== undefined) {
        expect(actualPrice).toBe(product.expected.priceText);
      }

      if (product.expected.priceContains !== undefined) {
        expect(actualPrice).toContain(product.expected.priceContains);
      }

      if (product.expected.priceNumber !== undefined) {
        expect(parsePriceNumber(actualPrice ?? '')).toBe(product.expected.priceNumber);
      }

      if (product.expected.sku !== undefined) {
        expect(actualSku).toBe(product.expected.sku);
      }

      if (product.expected.availabilityText !== undefined) {
        expect(actualAvailability).toBe(product.expected.availabilityText);
      }

      if (product.expected.inStock !== undefined) {
        const availability = (actualAvailability ?? '').toLowerCase();
        const looksInStock = /(in stock|available|พร้อมส่ง|มีสินค้า)/i.test(availability);
        const looksOutOfStock = /(out of stock|sold out|หมด|ไม่มีสินค้า)/i.test(availability);

        if (product.expected.inStock) {
          expect(looksInStock, `Availability should look in stock: "${actualAvailability}"`).toBe(true);
        } else {
          expect(looksOutOfStock, `Availability should look out of stock: "${actualAvailability}"`).toBe(true);
        }
      }

      for (const expectedText of product.expected.pageTexts ?? []) {
        await assertPageContains(page, expectedText);
      }

      for (const step of product.expected.steps ?? []) {
        if (product.selectors?.stepContainer) {
          const stepContainer = page
            .locator(product.selectors.stepContainer)
            .filter({ hasText: step.label })
            .first();

          await expect(
            stepContainer,
            `Expected step container to exist for: ${step.label}`,
          ).toBeVisible();

          const stepText = normalizeText(await stepContainer.innerText());

          for (const field of step.fields) {
            expect(stepText, `Expected ${step.label} to contain: "${field}"`).toContain(
              normalizeText(field),
            );
          }
        } else {
          await assertTextGroupNearLabel(page, step.label, step.fields);
        }
      }
    });
  }
});
