import { expect, test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './support/tosm';

const authFile = path.resolve(process.env.STORAGE_STATE || 'playwright/.auth/tosm.json');
const shopUrl = process.env.TOSM_URL || 'https://tosm-portal.exe.in.th/shop/rank';
const readyText = process.env.AUTH_READY_TEXT;

setup('save TOSM login session', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto(shopUrl);

  console.log('Complete any Cloudflare verification manually, then log in.');
  console.log('Keep this window open until the target shop page is visible.');

  await expect.poll(async () => {
    const bodyText = normalizeText(await page.locator('body').innerText().catch(() => ''));
    const isLoginPage = bodyText.includes('EXE ID') && bodyText.includes('รหัสผ่าน');
    const isSecurityCheck = bodyText.includes('Performing security verification');

    if (isLoginPage || isSecurityCheck) {
      return false;
    }

    if (readyText) {
      return bodyText.includes(readyText);
    }

    return page.url().includes('/shop/') && bodyText.length > 0;
  }, {
    message: 'Wait for manual login to finish and the target shop page to load.',
    timeout: 300_000,
  }).toBe(true);

  await page.context().storageState({ path: authFile });
  console.log(`Saved login session to ${authFile}`);
});
