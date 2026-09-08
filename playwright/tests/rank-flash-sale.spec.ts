import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertPageContains,
  assertReadyForTosmShop,
  normalizeText,
} from './support/tosm';

type FlashSaleProduct = {
  nameContains: string;
  rank?: string;
  bonusContains?: string;
  priceText?: string;
  soldOut?: boolean;
  purchaseLimitText?: string;
};

type FlashSaleRequest = {
  url: string;
  sectionTitle: string;
  countdownLabels?: string[];
  products: FlashSaleProduct[];
  selectors?: {
    section?: string;
    productCard?: string;
    nextButton?: string;
  };
};

const requestPath = path.resolve(
  process.env.RANK_FLASH_SALE_FILE || 'requests/rank-flash-sale.json',
);

function loadRequest(): FlashSaleRequest {
  if (!fs.existsSync(requestPath)) {
    throw new Error(`Rank flash sale request file not found: ${requestPath}`);
  }

  return JSON.parse(fs.readFileSync(requestPath, 'utf8')) as FlashSaleRequest;
}

const flashSale = loadRequest();

test.describe('rank page flash sale', () => {
  test('opens Flash Sale automatically and validates visible products', async ({ page }) => {
    await page.goto(flashSale.url);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await assertReadyForTosmShop(page);

    const title = page.getByText(flashSale.sectionTitle, { exact: false }).first();
    await expect(title, `Expected section title: ${flashSale.sectionTitle}`).toBeVisible();
    await title.scrollIntoViewIfNeeded();

    for (const label of flashSale.countdownLabels ?? []) {
      await assertPageContains(page, label);
    }

    const section = flashSale.selectors?.section
      ? page.locator(flashSale.selectors.section).filter({ hasText: flashSale.sectionTitle }).first()
      : page.locator('body');

    for (const product of flashSale.products) {
      const productCard = flashSale.selectors?.productCard
        ? section.locator(flashSale.selectors.productCard).filter({ hasText: product.nameContains }).first()
        : section;

      const text = normalizeText(await productCard.innerText());

      expect(text, `Expected Flash Sale to contain product: "${product.nameContains}"`).toContain(
        normalizeText(product.nameContains),
      );

      if (product.rank) {
        expect(text, `Expected ${product.nameContains} rank`).toContain(normalizeText(product.rank));
      }

      if (product.bonusContains) {
        expect(text, `Expected ${product.nameContains} bonus`).toContain(
          normalizeText(product.bonusContains),
        );
      }

      if (product.priceText) {
        expect(text, `Expected ${product.nameContains} price`).toContain(
          normalizeText(product.priceText),
        );
      }

      if (product.purchaseLimitText) {
        expect(text, `Expected ${product.nameContains} purchase limit`).toContain(
          normalizeText(product.purchaseLimitText),
        );
      }

      if (product.soldOut === true) {
        expect(text, `Expected ${product.nameContains} to be sold out`).toContain('สินค้าหมด');
      }
    }

    const nextButton = flashSale.selectors?.nextButton
      ? page.locator(flashSale.selectors.nextButton).first()
      : page
          .locator('button, [role="button"]')
          .filter({ hasText: /^$|›|>|ถัดไป|Next/i })
          .last();

    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(500);
    }

    await test.info().attach('rank-flash-sale-visible-state', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });
});
