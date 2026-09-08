import { expect, type Page } from '@playwright/test';

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export async function assertPageContains(page: Page, expectedText: string): Promise<void> {
  const bodyText = normalizeText(await page.locator('body').innerText());

  expect(
    bodyText,
    `Expected page body to contain: "${expectedText}"`,
  ).toContain(normalizeText(expectedText));
}

export async function assertReadyForTosmShop(page: Page): Promise<void> {
  const bodyText = normalizeText(await page.locator('body').innerText());
  const isLoginPage = bodyText.includes('EXE ID') && bodyText.includes('รหัสผ่าน');
  const isSecurityCheck = bodyText.includes('Performing security verification');

  if (isLoginPage) {
    throw new Error(
      [
        'The shop page redirected to the EXE login page.',
        'Run "pnpm run auth:tosm" first, log in manually, then run with the saved session:',
        '$env:STORAGE_STATE="playwright/.auth/tosm.json"; pnpm test',
        'For Rank Flash Sale only, run:',
        '$env:STORAGE_STATE="playwright/.auth/tosm.json"; pnpm run test:rank-flash-sale',
      ].join('\n'),
    );
  }

  if (isSecurityCheck) {
    throw new Error(
      'The site is showing a security verification page. Run headed or save a logged-in session with "pnpm run auth:tosm".',
    );
  }
}
