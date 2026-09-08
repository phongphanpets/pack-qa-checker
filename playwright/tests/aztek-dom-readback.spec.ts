import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './support/tosm';

/**
 * Read-only producer for packqa.adapters.aztek_dom.
 *
 * Targets use Product UUID + Bundle ID only.  This deliberately does not
 * search by a display name and it never clicks Save, Import, or Delete.
 */
type TargetFile = {
  adminUrl: string;
  outputFile?: string;
  targets: Array<{ productUuid: string; bundleIds: number[] }>;
};

type DomField = {
  value: string | number | boolean | null;
  raw_text: string | null;
  locator: string;
  confidence: number;
};

type BundleObservation = {
  bundle_id: number;
  bundle_type?: DomField;
  items: [];
};

type ProductObservation = {
  product_uuid: string;
  name?: DomField;
  purchase_limit?: DomField;
  start_date?: DomField;
  end_date?: DomField;
  bundles: BundleObservation[];
};

const targetFile = process.env.AZTEK_DOM_TARGETS;

function loadTargets(): TargetFile {
  if (!targetFile) {
    throw new Error('Set AZTEK_DOM_TARGETS to a Product UUID/Bundle ID target file.');
  }
  return JSON.parse(fs.readFileSync(path.resolve(targetFile), 'utf8')) as TargetFile;
}

function field(
  value: string | number | boolean | null,
  locator: string,
  rawText = value === null ? null : String(value),
): DomField {
  return { value, raw_text: rawText, locator, confidence: value === null ? 0 : 1 };
}

async function optionalInput(
  page: Page,
  accessibleName: string,
): Promise<DomField | undefined> {
  const input = page.getByRole('textbox', { name: accessibleName, exact: true });
  if (await input.count() !== 1) return undefined;
  const value = await input.inputValue();
  return field(value || null, `role=textbox[name=${JSON.stringify(accessibleName)}]`);
}

function dateFields(mainText: string): { start_date?: DomField; end_date?: DomField } {
  const values = [...mainText.matchAll(/\d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2}/g)]
    .map((match) => match[0]);
  return {
    start_date: values[0] ? field(values[0], 'main:text/date[0]') : undefined,
    end_date: values[1] ? field(values[1], 'main:text/date[1]') : undefined,
  };
}

function bundleType(mainText: string): DomField | undefined {
  const match = mainText.match(/(?:Bundle Type|ประเภท Bundle)\s*[:：]?\s*(FIXED|RANDOM)/i);
  return match ? field(match[1].toUpperCase(), 'main:text/Bundle Type') : undefined;
}

async function readTarget(
  page: Page,
  adminUrl: string,
  target: TargetFile['targets'][number],
): Promise<ProductObservation> {
  const productUrl = new URL(
    `/exe/tosm/shop/products/${target.productUuid}/edit`,
    adminUrl,
  ).toString();
  await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'แก้ไข Product', exact: true }))
    .toBeVisible({ timeout: 30_000 });
  expect(page.url(), 'Aztek must keep the requested Product UUID route').toContain(target.productUuid);

  const mainText = normalizeText(await page.locator('main').innerText());
  const linkedBundleIds = [...mainText.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
  expect(
    [...new Set(linkedBundleIds)].sort((left, right) => left - right),
    'Product must link to exactly the target Bundle IDs',
  ).toEqual([...target.bundleIds].sort((left, right) => left - right));

  const dates = dateFields(mainText);
  const product: ProductObservation = {
    product_uuid: target.productUuid,
    name: await optionalInput(page, 'ชื่อสินค้า (ไทย) *'),
    ...dates,
    bundles: [],
  };

  for (const bundleId of target.bundleIds) {
    const bundleUrl = new URL(`/exe/tosm/shop/bundles/${bundleId}`, adminUrl).toString();
    await page.goto(bundleUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'แก้ไข Bundle', exact: true }))
      .toBeVisible({ timeout: 30_000 });
    const text = normalizeText(await page.locator('main').innerText());
    product.bundles.push({
      bundle_id: bundleId,
      bundle_type: bundleType(text),
      // Reward extraction is intentionally added separately with Item ID/Kind
      // selectors.  Empty means UNVERIFIABLE, never an inferred reward list.
      items: [],
    });
  }
  return product;
}

test('Aztek DOM read-back exports canonical adapter JSON without writes', async ({ page }) => {
  test.skip(!targetFile, 'Set AZTEK_DOM_TARGETS to run the authenticated read-back.');
  test.setTimeout(180_000);
  const targets = loadTargets();
  const document = {
    products: [] as ProductObservation[],
  };

  for (const target of targets.targets) {
    document.products.push(await readTarget(page, targets.adminUrl, target));
  }

  const outputFile = path.resolve(targets.outputFile || 'qa-reports/aztek-dom/latest.json');
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await test.info().attach('aztek-dom-observations.json', {
    path: outputFile,
    contentType: 'application/json',
  });
});
