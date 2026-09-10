import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('../google-apps-script/Code.gs', 'utf8');
function harness() {
  const rows = [['id', 'title', 'status', 'requester', 'created_at', 'updated_at', 'record_json']];
  let email = 'owner@example.com', locked = false, notifications = 0;
  const files = new Map();
  const props = { SPREADSHEET_ID: 'book', FILES_FOLDER_ID: 'folder', ALLOWED_EMAILS: 'owner@example.com,gp@example.com', REVIEWER_EMAILS: 'owner@example.com', DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/test' };
  const sheet = {
    getLastRow: () => rows.length,
    getRange: (r, c, h, w) => ({
      getValues: () => rows.slice(r - 1, r - 1 + h).map(row => row.slice(c - 1, c - 1 + w)),
      setValues: values => { for (let i = 0; i < h; i++) rows[r - 1 + i] = values[i]; },
    }),
  };
  const context = vm.createContext({ console: { error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] || null }) },
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; } }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} },
    Utilities: { getUuid: () => crypto.randomUUID(), base64Decode: s => [...Buffer.from(s, 'base64')], base64Encode: b => Buffer.from(b).toString('base64'), newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, getContentType: () => mime, name }) },
    DriveApp: { getFolderById: () => ({ createFile: blob => {
      const id = crypto.randomUUID();
      const file = { getId: () => id, getBlob: () => blob, getMimeType: () => blob.getContentType(), setTrashed: () => files.delete(id) };
      files.set(id, file); return file;
    } }), getFileById: id => files.get(id) },
    UrlFetchApp: { fetch: () => { notifications++; return { getResponseCode: () => 204 }; } },
  });
  vm.runInContext(source, context);
  return { call: (path, method = 'GET', body = {}, op = crypto.randomUUID()) => JSON.parse(JSON.stringify(context.hubApi(path, method, body, op))),
    user: value => { email = value; }, rows, files, props, notifications: () => notifications, locked: () => locked };
}
const draft = { title: '=unsafe formula', request_type: 'WEB_SHOP', webshop_type: 'NORMAL', source_text: '51201\tKey\t2', payload: { seed_point: 590 } };

test('Google backend blocks unknown/blank accounts and GP status changes', () => {
  const h = harness();
  h.user('stranger@example.com');
  assert.equal(h.call('/api/requests').status, 403);
  h.user(''); assert.equal(h.call('/api/requests').status, 403);
  h.user('gp@example.com');
  const created = h.call('/api/requests', 'POST', draft);
  assert.equal(created.status, 201);
  assert.equal(created.body.request.requester, 'gp@example.com');
  assert.equal(h.call(`/api/requests/${created.body.request.id}/status`, 'POST', { status: 'IMPORTED' }).status, 403);
  assert.equal(h.locked(), false);
});

test('Google backend retries create once, stores literal titles, and persists history', () => {
  const h = harness(), op = crypto.randomUUID();
  const first = h.call('/api/requests', 'POST', draft, op);
  const second = h.call('/api/requests', 'POST', draft, op);
  assert.equal(first.body.request.id, second.body.request.id);
  assert.equal(h.rows.length, 2);
  assert.equal(h.notifications(), 1);
  assert.equal(h.rows[1][1], "'=unsafe formula");
  assert.equal(first.body.request.operations, undefined);
  const path = `/api/requests/${first.body.request.id}/status`;
  assert.equal(h.call(path, 'POST', { status: 'BAD' }).status, 400);
  const change = h.call(path, 'POST', { status: 'REVIEW' });
  assert.equal(change.body.request.history.length, 2);
  assert.equal(h.call(path, 'POST', { status: 'REVIEW' }).body.request.history.length, 2);
  assert.equal(h.call('/api/requests').body.requests[0].status, 'REVIEW');
});

test('Google export retry stores one file; download is scoped to the request', () => {
  const h = harness();
  const request = h.call('/api/requests', 'POST', draft).body.request;
  const path = `/api/requests/${request.id}/exports`, op = crypto.randomUUID();
  const body = { filename: 'bundle.xlsx', type: 'BUNDLE_IMPORT', data_url: 'data:application/octet-stream;base64,UEsDBA==' };
  const first = h.call(path, 'POST', body, op);
  h.call(path, 'POST', body, op);
  assert.equal(h.files.size, 1);
  const file = first.body.request.payload.exports[0];
  assert.equal(h.call(path + '/' + file.id).base64, 'UEsDBA==');
  assert.equal(h.call(path + '/missing').status, 404);
  assert.equal(first.body.request.history.at(-1).type, 'EXPORTED');
  assert.equal(h.call(path, 'POST', { ...body, type: 'CODE' }).status, 400);
});

test('Google backend rejects oversized requests and malformed source URLs', () => {
  const h = harness();
  assert.equal(h.call('/api/requests', 'POST', { ...draft, source_text: 'x'.repeat(45000) }).status, 413);
  assert.equal(h.rows.length, 1);
  assert.equal(h.call('/api/google-sheets?url=' + encodeURIComponent('https://evil.test/spreadsheets/d/abc')).status, 400);
  assert.equal(h.call('/api/requests', 'POST', { ...draft, attachments: 'bad' }).status, 400);
});
