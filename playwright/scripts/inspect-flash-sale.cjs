const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const productNames = [
  'เสวเสาร์ : ก็แค่อยากเป็นสาวเวียด',
  'เสวเสาร์ : Ai Đưa Em Về',
  'เสวเสาร์ : Đi Đu Đưa Đi',
  'เสวเสาร์ : CÀ PHÊ',
];
const fallbackSearchTerms = ['เสวเสาร์', 'สาวเวียด', 'Ai Đưa', 'Đi Đu', 'CÀ PHÊ'];

const productsUrl = process.argv[2] || 'https://aztek-tools-v2.exe.in.th/exe/tosm/shop/products';

function writeObservation(results) {
  const outputDirectory = path.resolve('qa-reports');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const document = {
    campaign: 'FLASH SALE 5-7 Sep 2026',
    generatedAt: new Date().toISOString(),
    source: `${new URL(productsUrl).host} Product list (read-only)`,
    results,
  };
  fs.writeFileSync(
    path.join(outputDirectory, 'flash-sale-inspection-latest.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
  return document;
}

async function inspectProduct(page, name) {
  const search = page.getByPlaceholder('ค้นหา Product...');
  await search.fill(name);
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await page.waitForTimeout(700);

  const matches = page.getByRole('link', { name, exact: true });
  const count = await matches.count();
  if (count !== 1) {
    return { name, status: count === 0 ? 'NOT_FOUND' : 'AMBIGUOUS', matchCount: count };
  }

  const href = await matches.first().getAttribute('href');
  await page.goto(new URL(href, page.url()).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('heading', { name: 'แก้ไข Product', exact: true }).waitFor({ timeout: 15_000 });

  const values = await page.locator('input').evaluateAll((elements) =>
    elements.map((element) => ({
      type: element.type,
      value: element.value,
      name: element.getAttribute('name'),
      ariaLabel: element.getAttribute('aria-label'),
    })),
  );
  const switches = await page.locator('[role="switch"]').evaluateAll((elements) =>
    elements.map((element) => ({
      label: element.getAttribute('aria-label') || element.textContent?.trim() || null,
      checked: element.getAttribute('aria-checked'),
    })),
  );
  const bundleLinks = await page.locator('main a').evaluateAll((elements) =>
    elements
      .map((element) => ({ text: element.textContent?.trim() || '', href: element.getAttribute('href') || '' }))
      .filter((link) => /bundle/i.test(link.href) || /^#/.test(link.text)),
  );
  const mainText = (await page.locator('main').innerText()).replace(/\s+/g, ' ').trim();

  return {
    name,
    status: 'FOUND',
    href,
    values,
    switches,
    bundleLinks,
    bundleIds: [...new Set(mainText.match(/#\d+/g) || [])],
  };
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({ storageState: 'playwright/.auth/aztek.json' });
  const page = await context.newPage();
  const results = [];

  try {
    await page.goto(productsUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.getByPlaceholder('ค้นหา Product...').waitFor({ timeout: 30_000 });
  } catch (error) {
    const visibleText = (await page.locator('body').innerText().catch(() => ''))
      .replace(/\s+/g, ' ')
      .slice(0, 500);
    results.push({
      status: 'BACKEND_UNAVAILABLE',
      detail: String(error.message).split('\n')[0],
      page: { url: page.url(), title: await page.title().catch(() => ''), visibleText },
    });
    console.log(JSON.stringify(writeObservation(results)));
    await browser.close();
    return;
  }

  for (const name of productNames) {
    try {
      results.push(await inspectProduct(page, name));
    } catch (error) {
      results.push({ name, status: 'DETAIL_ERROR', detail: String(error.message).split('\n')[0] });
    }
  }

  const fallbackMatches = [];
  for (const term of fallbackSearchTerms) {
    const search = page.getByPlaceholder('ค้นหา Product...');
    await search.fill(term);
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await page.waitForTimeout(700);
    const links = await page.locator('a[href*="/exe/tosm/shop/products/"]').evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.textContent?.trim() || '',
        href: element.getAttribute('href') || '',
      })).filter((link) =>
        link.name && /\/exe\/tosm\/shop\/products\/(?!import$|create$)[^/]+(?:\/edit)?$/.test(link.href),
      ),
    );
    fallbackMatches.push({ term, products: links });
  }
  results.push({ status: 'FALLBACK_SEARCH', matches: fallbackMatches });

  console.log(JSON.stringify(writeObservation(results)));
  await browser.close();
}

main().catch((error) => {
  console.error(String(error.stack || error));
  process.exitCode = 1;
});
