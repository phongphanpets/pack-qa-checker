import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';

test('packaged Google UI uses RPC and exports original templates without an HTTP API', async () => {
  const html = await readFile('../outputs/google-apps-script/Index.html');
  const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
    await page.addInitScript(() => {
      window.rpcCalls = [];
      const draft = { id: 'REQ-google-test', title: 'Google test', request_type: 'WEB_SHOP', webshop_type: 'NORMAL', status: 'NEW', requester: 'gp@example.com',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source_text: '51201\tLanistar Key\t2', payload: { exports: [] }, history: [] };
      function runner(success = () => {}, failure = () => {}) {
        return { withSuccessHandler: fn => runner(fn, failure), withFailureHandler: fn => runner(success, fn),
          hubApi(path, method, body, operationId) {
            window.rpcCalls.push({ path, method, body, operationId });
            setTimeout(() => success({ status: 200, body: path === '/api/requests' ? { requests: [draft] } : { request: draft } }), 0);
          } };
      }
      window.google = { script: { run: runner() } };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('Google test', { exact: true }).waitFor();
    assert.equal(await page.getByText('เซิร์ฟเวอร์ Request และ History', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'เปิดใน Adapter', exact: true }).click();
    await page.getByText('Lanistar Key', { exact: true }).first().waitFor();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export Import file/ }).click();
    const zip = await download;
    const entries = unzipSync(await readFile(await zip.path()));
    assert.equal(Object.keys(entries).length, 1);
    assert.ok(unzipSync(Object.values(entries)[0])['xl/worksheets/sheet1.xml']);
    const calls = await page.evaluate(() => window.rpcCalls);
    const saved = calls.find(call => call.path === '/api/requests/REQ-google-test/exports');
    assert.equal(saved.body.type, 'BUNDLE_IMPORT');
    assert.match(saved.body.data_url, /^data:.*;base64,/);
    assert.equal(requests.length, 0);
    await mkdir('../outputs/google-review', { recursive: true });
    await page.screenshot({ path: '../outputs/google-review/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '../outputs/google-review/mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
