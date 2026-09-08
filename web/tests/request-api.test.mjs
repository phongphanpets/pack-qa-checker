import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";

test("shared API persists concurrent intake, timelines and identical downloads after restart", async () => {
  await mkdir("../outputs", { recursive: true });
  const data = await mkdtemp(resolve("../outputs/api-test-"));
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const endpoint = `http://127.0.0.1:${port}`;
  const headers = { Authorization: "Bearer integration-only", "Content-Type": "application/json" };
  let child;
  async function start() {
    child = spawn(process.execPath, ["asset-preview-proxy.mjs"], {
      env: { ...process.env, PORT: String(port), PACK_QA_API_ONLY: "1", PACK_QA_API_TOKEN: "integration-only", PACK_QA_ALLOWED_ORIGIN: "https://phongphanpets.github.io", PACK_QA_DATA_DIR: data, PACK_QA_DISCORD_WEBHOOK_URL: "http://127.0.0.1:1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(endpoint + "/api/requests", { headers })).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("API did not start");
  }
  async function stop() { if (child && child.exitCode === null) { const closed = once(child, "exit"); child.kill(); await closed; } }
  async function post(path, body) {
    const response = await fetch(endpoint + path, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(response.status, 200, await response.clone().text());
    return response;
  }
  try {
    await start();
    assert.equal((await fetch(endpoint + "/api/requests")).status, 401);
    assert.equal((await fetch(endpoint + "/api/requests", { headers: { ...headers, Origin: "https://unexpected.example" } })).status, 403);
    const preflight = await fetch(endpoint + "/api/requests", { method: "OPTIONS", headers: { Origin: "https://phongphanpets.github.io" } });
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://phongphanpets.github.io");
    const created = await Promise.all(Array.from({ length: 8 }, async (_, n) => {
      const response = await fetch(endpoint + "/api/requests", { method: "POST", headers, body: JSON.stringify({ title: `Integration ${n}`, request_type: "ITEM_CODE", source_text: "52001\tMemory Stone Key Selection\t2" }) });
      assert.equal(response.status, 201, await response.clone().text());
      return (await response.json()).request;
    }));
    const id = created[0].id;
    await post(`/api/requests/${id}/status`, { status: "PROCESSING" });
    const file = await post("/api/bundle-import", { requestId: id, filename: "verified.xlsx", bundles: [{ name: "Verified", is_gacha: false, items: [{ item_id: "52001", amount: 2 }] }] });
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    const spreadsheet = await post("/api/read-spreadsheet", { name: "verified.xlsx", data_url: "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + bytes.toString("base64") });
    assert.ok((await spreadsheet.json()).tabs[0].text.includes("Verified"));
    await stop();
    await start();
    const all = await (await fetch(endpoint + "/api/requests", { headers })).json();
    assert.equal(all.requests.length, 8);
    const saved = (await (await fetch(endpoint + `/api/requests/${id}`, { headers })).json()).request;
    assert.equal(saved.status, "READY_TO_IMPORT");
    assert.equal(saved.source_text, created[0].source_text);
    assert.deepEqual(saved.history.map(event => event.type), ["CREATED", "STATUS_CHANGED", "EXPORTED", "STATUS_CHANGED"]);
    const download = await fetch(endpoint + `/api/requests/${id}/exports/${saved.payload.exports[0].id}`, { headers });
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  } finally { await stop(); }
});
