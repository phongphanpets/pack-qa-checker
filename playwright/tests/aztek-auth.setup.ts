import { expect, test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './support/tosm';

const authFile = path.resolve(process.env.STORAGE_STATE || 'playwright/.auth/aztek.json');
const adminUrl = process.env.AZTEK_URL || 'https://aztek-tools-v2.exe.in.th/exe/dashboard';

setup('save Aztek Tools login session', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto(adminUrl);

  console.log('Log in manually in the opened browser.');
  console.log('Keep this window open until the Aztek dashboard is visible.');

  await expect.poll(async () => {
    const bodyText = normalizeText(await page.locator('body').innerText().catch(() => ''));
    const dashboardVisible = await page.getByRole('heading', { name: 'Dashboard', exact: true })
      .isVisible()
      .catch(() => false);

    return page.url().includes('/exe/') && dashboardVisible && bodyText.length > 0;
  }, {
    message: 'Wait for manual login to finish and the Aztek dashboard to load.',
    timeout: 300_000,
  }).toBe(true);

  await page.context().storageState({ path: authFile });
  console.log(`Saved Aztek login session to ${authFile}`);
});
