import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, request as proxyRequest } from "node:http";
import { extname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { recordRequestEvent, changeRequestStatus } from "./lib/request-events.mjs";

const port = Number(process.env.PORT ?? 3003);
const upstreamPort = Number(process.env.PACK_QA_UPSTREAM_PORT ?? 3005);
const clientRoot = resolve("dist/client");
const requestStorePath = resolve("../data/import_requests.local.json");
const bundleTemplatePath = resolve("templates/bundle-import-template.xlsx");
const productTemplatePath = resolve("templates/product-import-template.xlsx");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

function staticFilePath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  if (!pathname.startsWith("/assets/") && pathname !== "/favicon.svg") return null;

  const filePath = resolve(clientRoot, `.${pathname}`);
  return filePath.startsWith(`${clientRoot}${sep}`) || filePath === clientRoot ? filePath : null;
}

createServer((req, res) => {
  if ((req.url ?? "").startsWith("/api/google-sheets")) {
    void handleGoogleSheet(req, res);
    return;
  }
  if ((req.url ?? "").startsWith("/api/read-spreadsheet")) {
    void handleSpreadsheetUpload(req, res);
    return;
  }
  if ((req.url ?? "").startsWith("/api/bundle-import")) {
    void handleBundleImport(req, res);
    return;
  }
  if ((req.url ?? "").startsWith("/api/product-import")) {
    void handleProductImport(req, res);
    return;
  }
  if ((req.url ?? "").startsWith("/api/requests")) {
    void handleRequestHub(req, res);
    return;
  }
  const filePath = staticFilePath(req.url ?? "/");
  if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    if (req.method === "HEAD") return res.end();
    return createReadStream(filePath).pipe(res);
  }

  const upstream = proxyRequest(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Pack QA preview is not ready.");
  });
  req.pipe(upstream);
}).listen(port, "127.0.0.1", () => {
  console.log(`Pack QA preview is ready at http://127.0.0.1:${port}`);
});

async function handleGoogleSheet(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const spreadsheetId = spreadsheetIdFromUrl(url.searchParams.get("url") || "");
    if (!spreadsheetId) throw new Error("วางลิงก์ Google Sheet ที่ถูกต้อง");
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`, { redirect: "follow" });
    if (!response.ok) throw new Error("เปิด Google Sheet ไม่ได้ ตรวจสอบว่าแชร์เป็น ‘ทุกคนที่มีลิงก์ดูได้’ แล้ว");
    const workbook = readXlsxWorkbook(Buffer.from(await response.arrayBuffer()));
    if (!workbook.tabs.length) throw new Error("ไม่พบแท็บที่อ่านได้ใน Google Sheet นี้");
    return json(res, 200, { spreadsheet_id: spreadsheetId, tabs: workbook.tabs });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "อ่าน Google Sheet ไม่สำเร็จ" });
  }
}

async function handleSpreadsheetUpload(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const body = await readJsonBody(req);
    const dataUrl = String(body.data_url || "");
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) throw new Error("อ่านไฟล์ Spreadsheet ไม่ได้");
    const buffer = Buffer.from(match[1], "base64");
    if (buffer.length > 8 * 1024 * 1024) throw new Error("ไฟล์ Spreadsheet มีขนาดเกิน 8 MB");
    const filename = String(body.name || "").toLowerCase();
    const tabs = filename.endsWith(".csv") || filename.endsWith(".txt")
      ? [{ name: filename.endsWith(".csv") ? "CSV" : "Text", text: buffer.toString("utf8") }]
      : readXlsxWorkbook(buffer).tabs;
    if (!tabs.length) throw new Error("ไม่พบแท็บที่อ่านได้ในไฟล์นี้");
    return json(res, 200, { tabs });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "อ่านไฟล์ Spreadsheet ไม่สำเร็จ" });
  }
}

async function handleBundleImport(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const body = await readJsonBody(req);
    const bundles = Array.isArray(body.bundles) ? body.bundles : [];
    if (!bundles.length) throw new Error("ไม่พบ Bundle สำหรับ Export");
    const file = await buildBundleImportFromTemplate(bundles, Array.isArray(body.catalog) ? body.catalog : []);
    await saveRequestExport(body.requestId, body.filename, "BUNDLE_IMPORT", file, {
      bundle_count: bundles.length,
      item_count: bundles.reduce((total, bundle) => total + (Array.isArray(bundle.items) ? bundle.items.length : 0), 0),
    });
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"bundle-import.xlsx\"",
      "Content-Length": file.length,
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "สร้าง Bundle Import ไม่สำเร็จ" });
  }
}

async function handleProductImport(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const draft = await readJsonBody(req);
    if (!String(draft.name || "").trim()) throw new Error("กรอกชื่อ Product ก่อน Export");
    if (!Array.isArray(draft.bundleNames) || !draft.bundleNames.length) throw new Error("เลือก Bundle อย่างน้อย 1 รายการก่อน Export");
    const file = await buildProductImportFromTemplate(draft);
    await saveRequestExport(draft.requestId, draft.filename, "PRODUCT_IMPORT", file, {
      bundle_count: draft.bundleNames.length,
      item_count: null,
    });
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"product-import.xlsx\"",
      "Content-Length": file.length,
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "สร้าง Product Import ไม่สำเร็จ" });
  }
}

async function buildBundleImportFromTemplate(bundles, catalog) {
  if (!existsSync(bundleTemplatePath)) throw new Error("ไม่พบ Bundle Import Template ในโปรแกรม");
  const archive = readZipEntries(await readFile(bundleTemplatePath));
  const stringsXml = archive.get("xl/sharedStrings.xml")?.toString("utf8");
  const sheetXml = archive.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!stringsXml || !sheetXml) throw new Error("Bundle Import Template ไม่สมบูรณ์");
  const strings = readSharedStrings(stringsXml);
  const stringIndex = new Map(strings.map((value, index) => [value, index]));
  const addString = (value) => {
    const text = String(value ?? "");
    const existing = stringIndex.get(text);
    if (existing !== undefined) return existing;
    const index = strings.length;
    strings.push(text);
    stringIndex.set(text, index);
    return index;
  };
  const catalogById = new Map(catalog.map((item) => [normalizeCatalogId(item?.id), item]));
  const rows = bundles.flatMap((bundle) => (Array.isArray(bundle.items) ? bundle.items : []).map((item, index) => {
    const reward = importReward(item?.item_id);
    return [
      String(bundle?.name || "Bundle"),
      bundle?.is_gacha ? "RANDOM" : "FIXED",
      reward.type,
      reward.id,
      numberValue(item?.amount),
      tierForItem(item?.item_id, reward.id, catalogById),
      index + 1,
      bundle?.is_gacha ? numberValue(item?.chance) : null,
      null,
    ];
  }));
  if (!rows.length) throw new Error("Bundle ที่เลือกไม่มี Item");
  const header = sheetXml.match(/<row r="1"[\s\S]*?<\/row>/)?.[0];
  if (!header) throw new Error("อ่านหัวตาราง Template ไม่สำเร็จ");
  const outputRows = rows.map((row, index) => templateRowXml(index + 2, row, addString)).join("");
  archive.set("xl/worksheets/sheet1.xml", Buffer.from(sheetXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${header}${outputRows}</sheetData>`), "utf8"));
  archive.set("xl/sharedStrings.xml", Buffer.from(sharedStringsXml(stringsXml, strings), "utf8"));
  return writeZipEntries(archive);
}

function normalizeCatalogId(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, ""); }
function tierForItem(originalId, importedId, catalogById) {
  const record = catalogById.get(normalizeCatalogId(importedId)) || catalogById.get(normalizeCatalogId(originalId));
  return String(record?.tier || "").trim() || "Trainee";
}

async function buildProductImportFromTemplate(draft) {
  if (!existsSync(productTemplatePath)) throw new Error("ไม่พบ Product Import Template ในโปรแกรม");
  const archive = readZipEntries(await readFile(productTemplatePath));
  const stringsXml = archive.get("xl/sharedStrings.xml")?.toString("utf8");
  const sheetXml = archive.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!stringsXml || !sheetXml) throw new Error("Product Import Template ไม่สมบูรณ์");
  const strings = readSharedStrings(stringsXml);
  const stringIndex = new Map(strings.map((value, index) => [value, index]));
  const addString = (value) => {
    const text = String(value ?? "");
    const existing = stringIndex.get(text);
    if (existing !== undefined) return existing;
    const index = strings.length;
    strings.push(text);
    stringIndex.set(text, index);
    return index;
  };
  const values = [
    "GAME", draft.name, draft.name, draft.category || "", "", "", "", "", "", "", "",
    draft.displayOrder || "", dateForTemplate(draft.saleStart), dateForTemplate(draft.saleEnd), draft.purchaseLimit || "", "", "", "", "", "", "", "",
    "TRUE", "TRUE", "FALSE", draft.currency || "", draft.actualPrice || "", draft.fullPrice || "",
    "", "", "", "", "", "", draft.bundleNames.join(", "),
  ];
  const header = sheetXml.match(/<row r="1"[\s\S]*?<\/row>/)?.[0];
  if (!header) throw new Error("อ่านหัวตาราง Product Template ไม่สำเร็จ");
  const productRow = genericTemplateRowXml(2, values, addString);
  archive.set("xl/worksheets/sheet1.xml", Buffer.from(sheetXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${header}${productRow}</sheetData>`), "utf8"));
  archive.set("xl/sharedStrings.xml", Buffer.from(sharedStringsXml(stringsXml, strings), "utf8"));
  return writeZipEntries(archive);
}

function dateForTemplate(value) {
  const text = String(value || "").trim();
  return text ? `${text.replace("T", " ")}:00` : "";
}

function importReward(value) {
  const source = String(value || "");
  const normalized = source.trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "gsp") return { type: "WALLET_DEBIT", id: "Golden Seed Point" };
  if (normalized === "player_exp") return { type: "PLAYER_EXPERIENCE", id: "Player Experience - tosm" };
  if (normalized === "popo_god_1") return { type: "WALLET_DEBIT", id: "God Coin" };
  if (normalized === "popo_fellow_1") return { type: "WALLET_DEBIT", id: "Fellow Coin" };
  if (normalized === "popo_kupo_1") return { type: "WALLET_DEBIT", id: "Kupole Coin" };
  if (normalized === "gold_cur" || normalized === "currency") return { type: "ITEM", id: "101147" };
  if (normalized === "diamond_cur") return { type: "ITEM", id: "101146" };
  return { type: "ITEM", id: source };
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function templateRowXml(row, values, addString) {
  const cells = values.map((value, index) => templateCellXml(index, row, value, addString)).join("");
  return `<row r="${row}" ht="22.5" customHeight="1">${cells}</row>`;
}

function templateCellXml(column, row, value, addString) {
  const ref = `${columnName(column)}${row}`;
  if (value === null || value === undefined || value === "") return `<c r="${ref}" s="3"/>`;
  if (typeof value === "number") return `<c r="${ref}" s="3"><v>${value}</v></c>`;
  if (column === 3 && /^\d+(?:\.\d+)?$/.test(value)) return `<c r="${ref}" s="3"><v>${value}</v></c>`;
  return `<c r="${ref}" s="3" t="s"><v>${addString(value)}</v></c>`;
}

function genericTemplateRowXml(row, values, addString) {
  const cells = values.map((value, index) => {
    if (value === null || value === undefined || value === "") return "";
    const ref = `${columnName(index)}${row}`;
    if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="s"><v>${addString(value)}</v></c>`;
  }).join("");
  return `<row r="${row}">${cells}</row>`;
}

function sharedStringsXml(original, strings) {
  const start = original.match(/<sst\b[^>]*>/)?.[0] || '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  const root = start.replace(/\bcount="\d+"/, `count="${strings.length}"`).replace(/\buniqueCount="\d+"/, `uniqueCount="${strings.length}"`);
  return `${original.slice(0, original.indexOf(start))}${root}${strings.map((value) => `<si><t>${xmlEscape(value)}</t></si>`).join("")}</sst>`;
}

function xmlEscape(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;"); }
function columnName(index) { let name = ""; for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name; return name; }

function spreadsheetIdFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== "docs.google.com") return "";
    return url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] || "";
  } catch { return ""; }
}

// Google Sheets exports a conventional XLSX file, so GP needs neither a download nor Google API credentials.
function readXlsxWorkbook(buffer) {
  const archive = readZipEntries(buffer);
  const workbookXml = archive.get("xl/workbook.xml")?.toString("utf8") || "";
  const relsXml = archive.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const shared = readSharedStrings(archive.get("xl/sharedStrings.xml")?.toString("utf8") || "");
  const targets = new Map([...relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*>/g)].map((match) => [match[1], match[2]]));
  const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g)];
  return { tabs: sheets.map((match) => {
    const target = targets.get(match[2]) || "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    return { name: xmlText(match[1]), text: readWorksheet(archive.get(path)?.toString("utf8") || "", shared) };
  }) };
}

function readZipEntries(buffer) {
  const end = findZipEnd(buffer);
  if (end < 0) throw new Error("ไฟล์จาก Google Sheet ไม่สมบูรณ์");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    entries.set(name, compression === 0 ? compressed : compression === 8 ? inflateRawSync(compressed) : Buffer.alloc(0));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// Writes every part back into a conventional XLSX archive. Parts are stored rather
// than recompressed so the original template XML, styles and metadata stay intact.
function writeZipEntries(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, contents] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const bytes = Buffer.from(contents);
    const crc = crc32(bytes);
    const localEntry = Buffer.alloc(30 + nameBytes.length + bytes.length);
    localEntry.writeUInt32LE(0x04034b50, 0);
    localEntry.writeUInt16LE(20, 4);
    localEntry.writeUInt16LE(0, 6);
    localEntry.writeUInt16LE(0, 8);
    localEntry.writeUInt32LE(crc, 14);
    localEntry.writeUInt32LE(bytes.length, 18);
    localEntry.writeUInt32LE(bytes.length, 22);
    localEntry.writeUInt16LE(nameBytes.length, 26);
    localEntry.writeUInt16LE(0, 28);
    nameBytes.copy(localEntry, 30);
    bytes.copy(localEntry, 30 + nameBytes.length);
    local.push(localEntry);

    const centralEntry = Buffer.alloc(46 + nameBytes.length);
    centralEntry.writeUInt32LE(0x02014b50, 0);
    centralEntry.writeUInt16LE(20, 4);
    centralEntry.writeUInt16LE(20, 6);
    centralEntry.writeUInt16LE(0, 8);
    centralEntry.writeUInt16LE(0, 10);
    centralEntry.writeUInt32LE(crc, 16);
    centralEntry.writeUInt32LE(bytes.length, 20);
    centralEntry.writeUInt32LE(bytes.length, 24);
    centralEntry.writeUInt16LE(nameBytes.length, 28);
    centralEntry.writeUInt16LE(0, 30);
    centralEntry.writeUInt16LE(0, 32);
    centralEntry.writeUInt16LE(0, 34);
    centralEntry.writeUInt16LE(0, 36);
    centralEntry.writeUInt32LE(0, 38);
    centralEntry.writeUInt32LE(offset, 42);
    nameBytes.copy(centralEntry, 46);
    central.push(centralEntry);
    offset += localEntry.length;
  }
  const centralSize = central.reduce((total, entry) => total + entry.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let step = 0; step < 8; step += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function findZipEnd(buffer) { for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) if (buffer.readUInt32LE(i) === 0x06054b50) return i; return -1; }
function readSharedStrings(xml) { return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1].replace(/<[^>]+>/g, ""))); }
function readWorksheet(xml, shared) {
  const rows = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1] || "A";
      const type = cell[1].match(/\bt="([^"]+)"/)?.[1] || "";
      const value = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] || cell[2].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || "";
      cells[columnIndex(reference)] = type === "s" ? (shared[Number(value)] || "") : xmlText(value);
    }
    rows.push(cells.map((value) => value || "").join("\t"));
  }
  return rows.filter((row) => row.trim()).slice(0, 3000).join("\n").slice(0, 1_500_000);
}
function columnIndex(value) { return [...value].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0) - 1; }
function xmlText(value) { return String(value).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }

async function handleRequestHub(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);
  const requestId = segments[2];
  const isStatusRoute = segments[3] === "status";
  const isExportRoute = segments[3] === "exports";
  const exportId = segments[4];
  try {
    const requests = await readRequests();
    if (req.method === "GET" && requestId && isExportRoute && exportId) return sendRequestExport(res, requests, requestId, exportId);
    if (req.method === "GET" && !requestId) return json(res, 200, { requests: requests.map(requestSummary) });
    if (req.method === "GET" && requestId && !isStatusRoute) {
      const entry = requests.find((item) => item.id === requestId);
      return entry ? json(res, 200, { request: entry }) : json(res, 404, { error: "Request not found" });
    }
    if (req.method === "POST" && !requestId) {
      const body = await readJsonBody(req);
      const entry = createRequest(body);
      recordRequestEvent(entry, "CREATED", { to: entry.status }, entry.created_at);
      const notificationStatus = await notifyDiscord(entry, "New import request");
      entry.notification_status = notificationStatus;
      requests.unshift(entry);
      await writeRequests(requests);
      return json(res, 201, { request: entry });
    }
    if (req.method === "POST" && requestId && isStatusRoute) {
      const body = await readJsonBody(req);
      const entry = requests.find((item) => item.id === requestId);
      if (!entry) return json(res, 404, { error: "Request not found" });
      if (!validStatuses.has(body.status)) return json(res, 400, { error: "invalid request status" });
      if (!changeRequestStatus(entry, body.status)) return json(res, 200, { request: entry });
      entry.notification_status = await notifyDiscord(entry, "Import request status updated");
      await writeRequests(requests);
      return json(res, 200, { request: entry });
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "Request Hub error" });
  }
}

const validStatuses = new Set(["NEW", "PROCESSING", "REVIEW", "READY_TO_IMPORT", "IMPORTED", "FAILED"]);

function createRequest(body) {
  if (!body || !["WEB_SHOP", "ITEM_CODE"].includes(body.request_type)) throw new Error("invalid request_type");
  if (!String(body.title || "").trim()) throw new Error("title is required");
  if (body.request_type === "WEB_SHOP" && !["NORMAL", "RANDOM"].includes(body.webshop_type)) throw new Error("webshop_type is required");
  const now = new Date().toISOString();
  return {
    id: randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(),
    title: String(body.title).trim().slice(0, 200),
    request_type: body.request_type,
    webshop_type: body.request_type === "WEB_SHOP" ? body.webshop_type : null,
    fixed_rewards: Boolean(body.fixed_rewards),
    status: body?.payload?.processing?.state === "READY_FOR_REVIEW" ? "REVIEW" : "NEW",
    requester: String(body.requester || "GP"),
    source_text: String(body.source_text || ""),
    attachments: Array.isArray(body.attachments) ? body.attachments.map((file) => ({ name: String(file?.name || "attachment"), type: String(file?.type || ""), data_url: String(file?.data_url || "") })) : [],
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    notification_status: "PENDING",
    created_at: now,
    updated_at: now,
  };
}

function requestSummary(entry) {
  return { ...entry, attachments: Array.isArray(entry.attachments) ? entry.attachments.map(({ name, type }) => ({ name, type })) : [] };
}

async function readRequests() {
  try {
    const value = JSON.parse(await readFile(requestStorePath, "utf8"));
    return Array.isArray(value) ? value.map((entry) => entry?.status === "AI_PROCESSING" ? { ...entry, status: "PROCESSING" } : entry) : [];
  } catch { return []; }
}

async function writeRequests(requests) {
  await mkdir(resolve(requestStorePath, ".."), { recursive: true });
  await writeFile(requestStorePath, JSON.stringify(requests, null, 2), "utf8");
}

async function saveRequestExport(requestId, filename, type, contents, details) {
  if (!requestId || requestId.startsWith("LOCAL-")) return;
  const requests = await readRequests();
  const entry = requests.find((item) => item.id === requestId);
  if (!entry) return;
  const artifactId = randomUUID().replaceAll("-", "").slice(0, 12);
  const safeName = safeExportFilename(filename || `${type.toLowerCase()}.xlsx`);
  const directory = resolve("../data/request_exports", requestId);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${artifactId}.xlsx`), contents);
  const exports = Array.isArray(entry.payload?.exports) ? entry.payload.exports : [];
  exports.unshift({ id: artifactId, filename: safeName, type, created_at: new Date().toISOString(), ...details });
  entry.payload = { ...entry.payload, exports };
  recordRequestEvent(entry, "EXPORTED", { filename: safeName, artifact_id: artifactId, export_type: type });
  const becomesReady = entry.request_type === "ITEM_CODE" || type === "PRODUCT_IMPORT";
  if (becomesReady && entry.status !== "READY_TO_IMPORT") {
    changeRequestStatus(entry, "READY_TO_IMPORT");
    entry.notification_status = await notifyDiscord(entry, "Import files ready");
  }
  entry.updated_at = new Date().toISOString();
  await writeRequests(requests);
}

function sendRequestExport(res, requests, requestId, exportId) {
  const entry = requests.find((item) => item.id === requestId);
  const artifact = Array.isArray(entry?.payload?.exports) ? entry.payload.exports.find((item) => item?.id === exportId) : null;
  if (!artifact) return json(res, 404, { error: "ไม่พบไฟล์ Export" });
  const filePath = resolve("../data/request_exports", requestId, `${exportId}.xlsx`);
  if (!filePath.startsWith(resolve("../data/request_exports") + sep) || !existsSync(filePath)) return json(res, 404, { error: "ไม่พบไฟล์ Export" });
  res.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${safeExportFilename(artifact.filename)}"`,
    "Content-Length": statSync(filePath).size,
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(res);
}

function safeExportFilename(value) {
  return String(value || "export.xlsx").replace(/[<>:"/\\|?*]/g, "-").replace(/[\r\n]/g, "").slice(0, 150) || "export.xlsx";
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function notifyDiscord(entry, event) {
  const webhookUrl = process.env.PACK_QA_DISCORD_WEBHOOK_URL?.trim() || await webhookFromEnvFile();
  if (!webhookUrl) return "NOT_CONFIGURED";
  try {
    const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: `**${event}**\n\`${entry.id}\` · ${entry.title}\nType: ${entry.request_type} · Status: ${entry.status}` }) });
    return response.ok ? "SENT" : "FAILED";
  } catch { return "FAILED"; }
}

async function webhookFromEnvFile() {
  try {
    const text = await readFile(resolve("../.env"), "utf8");
    const match = text.match(/^PACK_QA_DISCORD_WEBHOOK_URL\s*=\s*(.+)$/m);
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
  } catch { return ""; }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}
