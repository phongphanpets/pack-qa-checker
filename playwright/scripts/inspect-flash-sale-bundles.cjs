const { chromium } = require('@playwright/test');

const terms = ['เสวเสาร์', 'สาวเวียด', 'Ai Đưa', 'Đi Đu', 'CÀ PHÊ', 'Lanistar'];
const bundlesUrl = process.argv[2] || 'https://aztek-tools-v2.exe.in.th/exe/tosm/shop/bundles';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({ storageState: 'playwright/.auth/aztek.json' });
  const page = await context.newPage();

  await page.goto(bundlesUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const inputs = await page.locator('input').evaluateAll((elements) =>
    elements.map((element) => ({
      placeholder: element.getAttribute('placeholder'),
      ariaLabel: element.getAttribute('aria-label'),
      type: element.getAttribute('type'),
    })),
  );
  const candidates = page.locator('input[placeholder*="ค้นหา"], input[aria-label*="ค้นหา"]');
  const count = await candidates.count();
  if (count !== 1) {
    const visibleText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600);
    console.log(JSON.stringify({
      status: 'BUNDLE_SEARCH_UNVERIFIABLE',
      page: { url: page.url(), title: await page.title(), visibleText },
      inputs,
    }));
    await browser.close();
    return;
  }

  const results = [];
  for (const term of terms) {
    await candidates.fill(term);
    const searchButton = page.getByRole('button', { name: 'ค้นหา', exact: true });
    if (await searchButton.count()) await searchButton.click();
    await page.waitForTimeout(700);
    const rows = await page.locator('main a').evaluateAll((elements) =>
      elements.map((element) => ({
        text: element.textContent?.trim() || '',
        href: element.getAttribute('href') || '',
      })).filter((link) => /\/exe\/tosm\/shop\/bundles\/\d+/.test(link.href)),
    );
    results.push({ term, bundles: rows });
  }

  console.log(JSON.stringify({ status: 'BUNDLE_SEARCH', results }));
  await browser.close();
}

main().catch((error) => {
  console.error(String(error.stack || error));
  process.exitCode = 1;
});
