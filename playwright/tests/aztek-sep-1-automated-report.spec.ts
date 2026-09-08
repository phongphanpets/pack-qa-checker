import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './support/tosm';
import { QaReport, type QaStatus } from './support/qa-report';

type PackReference = { name: string; bundleIds: number[] };
type VerifiedPack = PackReference & {
  price: number;
  purchaseLimit: number;
  startsAt: string;
  endsAt: string;
};
type PackQaRequest = {
  adminUrl: string;
  sourceSpec: string;
  googleSheet: { spreadsheetId: string; gid: string };
  verifiedPacks: VerifiedPack[];
  manualReview: Array<{ name: string; bundleIds?: number[]; reason: string }>;
};

const requestFile = path.resolve(process.env.AZTEK_PACK_QA_FILE || 'requests/aztek-sep-1-pack-qa.json');
const qaRequest = JSON.parse(fs.readFileSync(requestFile, 'utf8')) as PackQaRequest;

function firstCsvCell(line: string): string {
  const match = line.match(/^(?:"((?:[^"]|"")*)"|([^,]*))/);
  return (match?.[1] ?? match?.[2] ?? '').replace(/""/g, '"');
}

function parsePacks(csv: string): PackReference[] {
  const cells = csv.split(/\r?\n/).map(firstCsvCell);
  const packs: PackReference[] = [];

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] !== 'Package Name' || !cells[index + 1]) continue;

    const bundleIds: number[] = [];
    for (let rowIndex = index + 3; rowIndex < cells.length && cells[rowIndex] !== 'Package Name'; rowIndex += 1) {
      if (/^\d+$/.test(cells[rowIndex])) bundleIds.push(Number(cells[rowIndex]));
    }
    packs.push({ name: cells[index + 1], bundleIds });
  }

  return packs;
}

function sameNumbers(actual: number[], expected: number[]): boolean {
  return [...actual].sort((a, b) => a - b).join(',') === [...expected].sort((a, b) => a - b).join(',');
}

function status(matches: boolean): QaStatus {
  return matches ? 'PASS' : 'FAIL';
}

async function checkGoogleSheet(api: APIRequestContext, report: QaReport): Promise<void> {
  const { spreadsheetId, gid } = qaRequest.googleSheet;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const expectedPacks = [
    ...qaRequest.verifiedPacks,
    ...qaRequest.manualReview.filter((pack) => (pack.bundleIds?.length ?? 0) > 0),
  ].map(({ name, bundleIds }) => ({ name, bundleIds: bundleIds! }));

  try {
    const response = await api.get(sheetUrl, { timeout: 30_000 });
    if (!response.ok()) throw new Error(`Google Sheet returned HTTP ${response.status()}`);

    const actualPacks = parsePacks(await response.text());
    for (const expected of expectedPacks) {
      const actual = actualPacks.find((pack) => pack.name === expected.name);
      report.add({
        source: 'Google Sheet', item: expected.name, field: 'Package Name', expected: expected.name,
        actual: actual?.name ?? 'ไม่พบ', status: status(Boolean(actual)), url: sheetUrl,
      });
      report.add({
        source: 'Google Sheet', item: expected.name, field: 'Bundle ID', expected: expected.bundleIds,
        actual: actual?.bundleIds ?? [], status: status(Boolean(actual) && sameNumbers(actual!.bundleIds, expected.bundleIds)), url: sheetUrl,
      });
    }
  } catch (error) {
    report.add({
      source: 'Google Sheet', item: 'QA specification', field: 'การเข้าถึงข้อมูล', expected: 'อ่านข้อมูลได้',
      actual: 'อ่านไม่ได้', status: 'BLOCKED', message: error instanceof Error ? error.message : String(error), url: sheetUrl,
    });
  }
}

async function openProducts(page: Page, url: string): Promise<void> {
  const heading = page.getByRole('heading', { name: 'Products', exact: true });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (await heading.isVisible().catch(() => false)) return;
  if (!normalizeText(await page.locator('body').innerText().catch(() => ''))) await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(heading).toBeVisible({ timeout: 30_000 });
}

async function searchProduct(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder('ค้นหา Product...').fill(name);
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await page.getByRole('button', { name: 'กำลังค้นหา...', exact: true }).waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
}

function addValueCheck(
  report: QaReport,
  pack: VerifiedPack,
  field: string,
  expected: unknown,
  actual: unknown,
  matches: boolean,
  url: string,
): void {
  report.add({ source: 'Aztek Tools', item: pack.name, field, expected, actual, status: status(matches), url });
}

async function checkAztekPack(page: Page, report: QaReport, pack: VerifiedPack): Promise<void> {
  const adminUrl = qaRequest.adminUrl.replace(/\/$/, '');
  let currentUrl = `${adminUrl}/exe/tosm/shop/products`;
  const beforeFailures = report.count('FAIL');

  try {
    await openProducts(page, currentUrl);
    await searchProduct(page, pack.name);

    const productLink = page.getByRole('link', { name: pack.name, exact: true });
    const productCount = await productLink.count();
    if (productCount !== 1) {
      report.add({
        source: 'Aztek Tools', item: pack.name, field: 'Product', expected: 'พบสินค้า 1 รายการ',
        actual: `พบ ${productCount} รายการ`, status: 'FAIL', url: currentUrl,
      });
      return;
    }

    const productPath = await productLink.getAttribute('href');
    if (!productPath) throw new Error('ลิงก์ Product ไม่มีปลายทาง');
    currentUrl = new URL(productPath, adminUrl).toString();
    await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'แก้ไข Product', exact: true })).toBeVisible({ timeout: 30_000 });

    const productName = await page.getByRole('textbox', { name: 'ชื่อสินค้า (ไทย) *', exact: true }).inputValue();
    const numberValues = await page.locator('input[type="number"]').evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
    const actualPrice = numberValues[1] ?? numberValues[0] ?? 'ไม่พบ';
    const actualPurchaseLimit = numberValues[3] ?? 'ไม่พบ';
    const mainText = normalizeText(await page.locator('main').innerText());
    const actualBundleIds = [...mainText.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
    const dateValues = [...mainText.matchAll(/\d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2}/g)].map((match) => match[0]);
    const actualStartsAt = dateValues[0] ?? 'ไม่พบ';
    const actualEndsAt = dateValues[1] ?? 'ไม่พบ';
    const enabled = await page.getByRole('switch', { name: 'เปิดใช้งาน', exact: true }).isChecked();
    const testMode = await page.getByRole('switch', { name: 'โหมดทดสอบ', exact: true }).isChecked();

    addValueCheck(report, pack, 'ชื่อสินค้า', pack.name, productName, productName === pack.name, currentUrl);
    addValueCheck(report, pack, 'ราคาขาย', pack.price, actualPrice, actualPrice === String(pack.price), currentUrl);
    addValueCheck(report, pack, 'จำนวนครั้งที่ซื้อต่อผู้เล่น', pack.purchaseLimit, actualPurchaseLimit, actualPurchaseLimit === String(pack.purchaseLimit), currentUrl);
    addValueCheck(report, pack, 'Bundle ID', pack.bundleIds, actualBundleIds, pack.bundleIds.every((id) => actualBundleIds.includes(id)), currentUrl);
    addValueCheck(report, pack, 'เวลาเริ่มขาย', pack.startsAt, actualStartsAt, actualStartsAt === pack.startsAt, currentUrl);
    addValueCheck(report, pack, 'เวลาสิ้นสุด', pack.endsAt, actualEndsAt, actualEndsAt === pack.endsAt, currentUrl);
    addValueCheck(report, pack, 'Limit type', 'PLAYER', mainText.includes('PLAYER') ? 'PLAYER' : 'ไม่พบ', mainText.includes('PLAYER'), currentUrl);
    addValueCheck(report, pack, 'เปิดใช้งาน', true, enabled, enabled, currentUrl);
    addValueCheck(report, pack, 'โหมดทดสอบ', false, testMode, !testMode, currentUrl);

    if (report.count('FAIL') > beforeFailures) {
      fs.mkdirSync(report.evidenceDirectory, { recursive: true });
      const screenshotPath = path.join(report.evidenceDirectory, `${pack.name.replace(/[^a-zA-Z0-9ก-๙]+/g, '-')}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      report.add({
        source: 'Aztek Tools', item: pack.name, field: 'หลักฐานเมื่อพบข้อมูลไม่ตรง', expected: 'ค่าตรง Request ทุกข้อ',
        actual: 'มีอย่างน้อยหนึ่งข้อไม่ตรง', status: 'REVIEW', url: currentUrl,
        screenshot: path.relative(path.resolve('qa-reports'), screenshotPath).replace(/\\/g, '/'),
      });
    }
  } catch (error) {
    let screenshot: string | undefined;
    try {
      fs.mkdirSync(report.evidenceDirectory, { recursive: true });
      const screenshotPath = path.join(report.evidenceDirectory, `${pack.name.replace(/[^a-zA-Z0-9ก-๙]+/g, '-')}-blocked.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshot = path.relative(path.resolve('qa-reports'), screenshotPath).replace(/\\/g, '/');
    } catch { /* The page may already be closed. */ }

    report.add({
      source: 'Aztek Tools', item: pack.name, field: 'การเข้าถึงข้อมูล', expected: 'ตรวจ Product ได้',
      actual: 'ตรวจไม่สำเร็จ', status: 'BLOCKED', message: error instanceof Error ? error.message : String(error),
      url: currentUrl, screenshot,
    });
  }
}

test('สร้างรายงาน QA: Google Sheet เทียบ Aztek Tools', async ({ page, request }) => {
  test.setTimeout(180_000);
  const report = new QaReport('TOSM Shop QA Report - 1 Sep Packs', qaRequest.sourceSpec);

  await checkGoogleSheet(request, report);
  for (const pack of qaRequest.verifiedPacks) await checkAztekPack(page, report, pack);

  for (const review of qaRequest.manualReview) {
    report.add({
      source: 'QA Handoff', item: review.name, field: 'หลักฐานที่ต้องตรวจเพิ่ม', expected: 'หลักฐานครบและยืนยันแล้ว',
      actual: review.reason, status: 'REVIEW',
    });
  }

  const output = report.write();
  await test.info().attach('qa-report-html', { path: output.htmlPath, contentType: 'text/html' });
  await test.info().attach('qa-report-json', { path: output.jsonPath, contentType: 'application/json' });

  expect(
    output.hasBlockingProblems,
    'พบ FAIL หรือ BLOCKED กรุณาเปิด qa-reports/latest.html เพื่อดูรายละเอียด',
  ).toBeFalsy();
});
