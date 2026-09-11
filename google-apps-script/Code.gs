/* Deploy as USER_ACCESSING. Set ALLOWED_EMAILS or REVIEWER_EMAILS to * for link-based team access. */
const HUB_HEADERS = ['id', 'title', 'status', 'requester', 'created_at', 'updated_at', 'record_json'];
const HUB_STATUSES = ['NEW', 'PROCESSING', 'REVIEW', 'READY_TO_IMPORT', 'IMPORTED', 'FAILED'];

// Run once from the editor. Private resources are created only by the installing account.
function setupHub() {
  const props = PropertiesService.getScriptProperties();
  const email = Session.getActiveUser().getEmail().toLowerCase();
  if (!email) throw new Error('Sign in to Google first');
  if (!props.getProperty('OWNER_EMAIL')) props.setProperty('OWNER_EMAIL', email);
  if (props.getProperty('OWNER_EMAIL') !== email) throw new Error('Only the installing owner can run setup');
  if (!props.getProperty('ALLOWED_EMAILS')) props.setProperty('ALLOWED_EMAILS', email);
  if (!props.getProperty('REVIEWER_EMAILS')) props.setProperty('REVIEWER_EMAILS', email);
  if (!props.getProperty('SPREADSHEET_ID')) {
    const book = SpreadsheetApp.create('GP Request Hub');
    props.setProperty('SPREADSHEET_ID', book.getId());
    book.getSheets()[0].setName('Requests');
  }
  const book = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  const sheet = book.getSheetByName('Requests') || book.insertSheet('Requests');
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, HUB_HEADERS.length).setValues([HUB_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HUB_HEADERS.length).setBackground('#164e63').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setColumnWidths(1, 6, 190);
    sheet.setColumnWidth(2, 360);
    sheet.setColumnWidth(7, 400);
  }
  if (!props.getProperty('FILES_FOLDER_ID')) {
    props.setProperty('FILES_FOLDER_ID', DriveApp.createFolder('GP Request Hub Files').getId());
  }
  const result = { spreadsheet: book.getUrl(), folder: DriveApp.getFolderById(props.getProperty('FILES_FOLDER_ID')).getUrl() };
  console.log(JSON.stringify(result));
  return result;
}

function doGet() {
  authorize_(false);
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('GP Request Hub').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function authorize_(reviewer) {
  const props = PropertiesService.getScriptProperties();
  const email = Session.getActiveUser().getEmail().toLowerCase();
  const allowed = String(props.getProperty(reviewer ? 'REVIEWER_EMAILS' : 'ALLOWED_EMAILS') || '').split(',').map(s => s.trim().toLowerCase());
  if (allowed.includes('*')) return email || 'PUBLIC';
  if (!email || !allowed.includes(email)) fail_(403, reviewer ? 'บัญชีนี้ยังไม่มีสิทธิ์ตรวจงานหรือ Export' : 'บัญชีนี้ยังไม่ได้รับสิทธิ์ Request Hub');
  return email;
}

function fail_(status, message) { const error = new Error(message); error.status = status; throw error; }

function hubApi(path, method, body, operationId) {
  let lock;
  try {
    const email = authorize_(false);
    if (typeof path !== 'string' || !['GET', 'POST'].includes(method)) fail_(400, 'Invalid request');
    if (method === 'POST') {
      if (!/^[\w-]{16,100}$/.test(operationId || '')) fail_(400, 'Missing operation ID');
      lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) fail_(503, 'มีงานกำลังบันทึก กรุณาลองอีกครั้ง');
    }
    return route_(path, method, body || {}, operationId, email);
  } catch (error) {
    console.error(String(error));
    return { status: error.status || 500, body: { error: error.status ? error.message : 'บันทึกหรืออ่าน Google ไม่สำเร็จ กรุณาตรวจสิทธิ์ Sheets/Drive แล้วลองอีกครั้ง' } };
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) fail_(503, 'เจ้าของต้องรัน setupHub ก่อน');
  const sheet = SpreadsheetApp.openById(id).getSheetByName('Requests');
  if (!sheet || JSON.stringify(sheet.getRange(1, 1, 1, HUB_HEADERS.length).getValues()[0]) !== JSON.stringify(HUB_HEADERS)) fail_(409, 'โครงสร้าง Requests ไม่ตรง ห้ามเปลี่ยนหัวคอลัมน์');
  return sheet;
}

function records_() {
  const sheet = sheet_();
  const count = sheet.getLastRow() - 1;
  if (count > 2000) fail_(413, 'เกิน 2,000 Requests กรุณาให้ผู้ดูแลจัดเก็บงานเก่าก่อน');
  return count > 0 ? sheet.getRange(2, 7, count, 1).getValues().map((row, index) => ({ row: index + 2, request: JSON.parse(row[0]) })) : [];
}

function write_(request, row) {
  const json = JSON.stringify(request);
  if (json.length > 45000) fail_(413, 'Request และ History ใหญ่เกินไป กรุณาแบ่งงาน');
  const sheet = sheet_();
  const values = [request.id, request.title, request.status, request.requester, request.created_at, request.updated_at, json];
  sheet.getRange(row || sheet.getLastRow() + 1, 1, 1, values.length).setValues([values.map(value => /^[=+@-]/.test(value) ? "'" + value : value)]);
  SpreadsheetApp.flush();
}

function public_(request) {
  const copy = JSON.parse(JSON.stringify(request));
  delete copy.operations;
  return copy;
}

function route_(path, method, body, operationId, email) {
  if (path.startsWith('/api/google-sheets?') && method === 'GET') {
    const match = path.match(/[?&]url=([^&]+)/);
    const url = match ? decodeURIComponent(match[1]) : '';
    const id = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:\/|$)/);
    if (!id) fail_(400, 'ใช้ลิงก์ Google Sheets เท่านั้น');
    return { status: 200, body: { tabs: tabs_(SpreadsheetApp.openById(id[1])) } };
  }
  if (path === '/api/read-spreadsheet' && method === 'POST') {
    if (!/\.xlsx$/i.test(body.name || '')) fail_(400, 'รองรับ .xlsx เท่านั้น');
    const blob = blob_(body.data_url, body.name);
    let file;
    try {
      file = Drive.Files.create({ name: 'Temporary Request Import', mimeType: 'application/vnd.google-apps.spreadsheet' }, blob, { fields: 'id' });
      return { status: 200, body: { tabs: tabs_(SpreadsheetApp.openById(file.id)) } };
    } finally { if (file) DriveApp.getFileById(file.id).setTrashed(true); }
  }
  const rows = records_();
  if (path === '/api/requests' && method === 'GET') return { status: 200, body: { requests: rows.map(entry => public_(entry.request)).reverse() } };
  if (path === '/api/requests' && method === 'POST') {
    const duplicate = rows.find(entry => entry.request.operations.some(op => op.id === operationId && op.email === email));
    if (duplicate) return { status: 200, body: { request: public_(duplicate.request) } };
    if (rows.length >= 2000) fail_(413, 'เกินจำนวน Requests ที่รองรับ');
    const title = String(body.title || '').trim();
    if (!title || title.length > 300 || !['WEB_SHOP', 'ITEM_CODE'].includes(body.request_type)) fail_(400, 'ตรวจชื่อและประเภท Request');
    if (body.request_type === 'WEB_SHOP' && !['NORMAL', 'RANDOM'].includes(body.webshop_type)) fail_(400, 'เลือก Normal หรือ Random');
    if (body.attachments && (!Array.isArray(body.attachments) || body.attachments.length > 10)) fail_(400, 'แนบได้ไม่เกิน 10 ไฟล์');
    const now = new Date().toISOString();
    const request = { id: 'REQ-' + Utilities.getUuid(), title: title, request_type: body.request_type,
      webshop_type: body.webshop_type || null, fixed_rewards: body.fixed_rewards === true, status: 'NEW', requester: email,
      created_at: now, updated_at: now, source_text: String(body.source_text || ''), attachments: [],
      payload: Object.assign({}, body.payload, { exports: [] }), notification_status: 'NOT_CONFIGURED',
      history: [{ type: 'CREATED', at: now, by: email }], operations: [{ id: operationId, email: email }] };
    if (JSON.stringify(request).length > 40000) fail_(413, 'ตารางใหญ่เกินไป กรุณาแบ่ง Request');
    const created = [];
    let committed = false;
    try {
      request.attachments = (body.attachments || []).map(attachment => {
        const file = folder_().createFile(blob_(attachment.data_url, attachment.name));
        created.push(file);
        return { name: String(attachment.name), type: file.getMimeType(), drive_id: file.getId() };
      });
      write_(request);
      committed = true;
    } finally { if (!committed) created.forEach(file => file.setTrashed(true)); }
    // Notification failure must never turn an already committed request into a failed submission.
    try {
      request.notification_status = notify_(request);
      write_(request, sheet_().getLastRow());
    } catch (error) { console.error('Notification status: ' + String(error)); }
    return { status: 201, body: { request: public_(request) } };
  }
  const match = path.match(/^\/api\/requests\/([\w-]+)(?:\/(status|exports)(?:\/([\w-]+))?)?$/);
  if (!match) fail_(404, 'ไม่พบการทำงานนี้ใน Google backend');
  const entry = rows.find(entry => entry.request.id === match[1]);
  if (!entry) fail_(404, 'ไม่พบ Request');
  const request = entry.request;
  if (!match[2] && method === 'GET') return { status: 200, body: { request: public_(request) } };
  if (match[2] === 'exports' && match[3] && method === 'GET') {
    const exported = request.payload.exports.find(file => file.id === match[3]);
    if (!exported) fail_(404, 'ไม่พบไฟล์');
    const blob = DriveApp.getFileById(exported.drive_id).getBlob();
    return { status: 200, base64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
  }
  if (method !== 'POST' || match[3]) fail_(405, 'Method not allowed');
  authorize_(true);
  if (request.operations.some(op => op.id === operationId && op.email === email)) return { status: 200, body: { request: public_(request) } };
  const now = new Date().toISOString();
  if (match[2] === 'status') {
    if (!HUB_STATUSES.includes(body.status)) fail_(400, 'สถานะไม่ถูกต้อง');
    if (request.status !== body.status) {
      request.history.push({ type: 'STATUS_CHANGED', at: now, from: request.status, to: body.status, by: email });
      request.status = body.status;
    }
  } else if (match[2] === 'exports') {
    if (!['BUNDLE_IMPORT', 'PRODUCT_IMPORT'].includes(body.type) || !/\.(zip|xlsx)$/i.test(body.filename || '')) fail_(400, 'ประเภทไฟล์ Export ไม่ถูกต้อง');
    const file = folder_().createFile(blob_(body.data_url, body.filename));
    request.payload.exports.push({ id: Utilities.getUuid(), filename: body.filename, type: body.type, drive_id: file.getId(), created_at: now });
    request.history.push({ type: 'EXPORTED', at: now, filename: body.filename, by: email });
    // Remove only the new orphan if the canonical Sheet write fails.
    try {
      request.updated_at = now;
      request.operations.push({ id: operationId, email: email });
      write_(request, entry.row);
    } catch (error) { file.setTrashed(true); throw error; }
    return { status: 200, body: { request: public_(request) } };
  } else fail_(404, 'Not found');
  request.updated_at = now;
  request.operations.push({ id: operationId, email: email });
  write_(request, entry.row);
  return { status: 200, body: { request: public_(request) } };
}

function folder_() {
  return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
}

function blob_(dataUrl, name) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 7000000) fail_(413, 'ไฟล์ต้องไม่เกิน 5 MB');
  const match = dataUrl.match(/^data:([^;,]*);base64,([A-Za-z0-9+/=]*)$/);
  if (!match || !name || String(name).length > 200) fail_(400, 'ข้อมูลไฟล์ไม่ถูกต้อง');
  return Utilities.newBlob(Utilities.base64Decode(match[2]), match[1] || 'application/octet-stream', String(name));
}

function tabs_(book) {
  let cells = 0;
  return book.getSheets().map(sheet => {
    const rows = sheet.getLastRow(), cols = sheet.getLastColumn();
    cells += rows * cols;
    if (cells > 100000) fail_(413, 'Sheet ใหญ่เกิน 100,000 ช่อง กรุณาแยกเฉพาะแท็บงาน');
    const values = rows && cols ? sheet.getRange(1, 1, rows, cols).getDisplayValues() : [];
    return { name: sheet.getName(), text: values.map(row => row.map(value => value.replace(/[\r\n\t]+/g, ' ')).join('\t')).join('\n') };
  });
}

function notify_(request) {
  const url = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK_URL');
  if (!url) return 'NOT_CONFIGURED';
  if (!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) return 'FAILED';
  try {
    const response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ content: ('New Request: ' + request.title + '\n' + request.id).slice(0, 1900), allowed_mentions: { parse: [] } }) });
    return response.getResponseCode() >= 200 && response.getResponseCode() < 300 ? 'SENT' : 'FAILED';
  } catch (error) { return 'FAILED'; }
}
