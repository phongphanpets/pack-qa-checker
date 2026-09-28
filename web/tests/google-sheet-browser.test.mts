import assert from "node:assert/strict";
import { after, test } from "node:test";
import { connectGoogleSheet, ensureGoogleSheetAccess, listGoogleSheetTabs, readGoogleSheetTab, spreadsheetIdFromGoogleUrl } from "../lib/google-sheet-browser.ts";

test("accepts only Google Sheets document links", () => {
  assert.equal(spreadsheetIdFromGoogleUrl("https://docs.google.com/spreadsheets/d/abc_123/edit?gid=42"), "abc_123");
  assert.equal(spreadsheetIdFromGoogleUrl("https://evil.test/spreadsheets/d/abc_123/edit"), "");
  assert.equal(spreadsheetIdFromGoogleUrl("https://docs.google.com.evil.test/spreadsheets/d/abc_123/edit"), "");
});

test("reads tab metadata and only the selected tab with read-only scope", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const scope: string[] = [];
  const prompts: string[] = [];
  globalThis.window = {
    google: { accounts: { oauth2: { initTokenClient: (options: { scope: string; callback: (response: { access_token: string; expires_in: number }) => void }) => {
      scope.push(options.scope);
      return { requestAccessToken: (request: { prompt: string }) => { prompts.push(request.prompt); options.callback({ access_token: "test-access", expires_in: 3600 }); } };
    } } } },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("?fields=")) return new Response(JSON.stringify({ sheets: [{ properties: { title: "Main" } }, { properties: { title: "GM's tab" } }] }), { status: 200 });
    return new Response(JSON.stringify({ values: [["Item ID", "Amt"], ["1315002", 30]] }), { status: 200 });
  };
  try {
    await connectGoogleSheet("test-client-id");
    const tabs = await listGoogleSheetTabs("https://docs.google.com/spreadsheets/d/test-sheet/edit");
    assert.deepEqual(tabs.map((tab) => tab.name), ["Main", "GM's tab"]);
    assert.equal(await readGoogleSheetTab("https://docs.google.com/spreadsheets/d/test-sheet/edit", "GM's tab"), "Item ID\tAmt\n1315002\t30");
    assert.deepEqual(scope, ["https://www.googleapis.com/auth/spreadsheets.readonly"]);
    assert.deepEqual(prompts, [""]);
    assert.match(requests[1].url, /GM''s%20tab/);
    assert.equal((requests[1].init?.headers as Record<string, string>).Authorization, "Bearer test-access");
    assert.equal(requests.length, 2);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test("reports a closed Google popup instead of leaving the sheet loading", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    google: { accounts: { oauth2: { initTokenClient: (options: { error_callback: (error: { type: string }) => void }) => ({
      requestAccessToken: () => options.error_callback({ type: "popup_closed" }),
    }) } } },
  } as unknown as Window & typeof globalThis;
  try {
    await assert.rejects(connectGoogleSheet("test-client-id"), /ปิดหน้าต่าง Google/);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("reuses a live token and requests a new one without forcing consent after expiry", async () => {
  const originalWindow = globalThis.window;
  const prompts: string[] = [];
  let expiresIn = 60;
  globalThis.window = {
    google: { accounts: { oauth2: { initTokenClient: (options: { callback: (response: { access_token: string; expires_in: number }) => void }) => ({
      requestAccessToken: (request: { prompt: string }) => { prompts.push(request.prompt); options.callback({ access_token: "test-access", expires_in: expiresIn }); },
    }) } } },
  } as unknown as Window & typeof globalThis;
  try {
    await connectGoogleSheet("test-client-id");
    expiresIn = 3600;
    await ensureGoogleSheetAccess("test-client-id");
    await ensureGoogleSheetAccess("test-client-id");
    assert.deepEqual(prompts, ["", ""]);
  } finally {
    globalThis.window = originalWindow;
  }
});
