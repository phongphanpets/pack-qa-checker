import fs from 'node:fs';
import path from 'node:path';

export type QaStatus = 'PASS' | 'FAIL' | 'REVIEW' | 'BLOCKED';

export type QaCheck = {
  source: 'Google Sheet' | 'Aztek Tools' | 'QA Handoff';
  item: string;
  field: string;
  expected: unknown;
  actual: unknown;
  status: QaStatus;
  message?: string;
  url?: string;
  screenshot?: string;
};

type QaReportDocument = {
  title: string;
  sourceSpec: string;
  runId: string;
  generatedAt: string;
  summary: Record<QaStatus, number>;
  checks: QaCheck[];
};

function html(value: unknown): string {
  const text = (Array.isArray(value) ? value.join(', ') : String(value ?? '-'))
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\nCall log:[\s\S]*$/, '')
    .trim();
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function displayTime(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

function renderReport(report: QaReportDocument): string {
  const priority: Record<QaStatus, number> = { FAIL: 0, BLOCKED: 1, REVIEW: 2, PASS: 3 };
  const checks = [...report.checks].sort((left, right) => priority[left.status] - priority[right.status]);
  const labels: Record<QaStatus, string> = { PASS: 'ผ่าน', FAIL: 'ไม่ตรง', REVIEW: 'รอตรวจ', BLOCKED: 'ตรวจไม่ได้' };
  const sources: Record<QaCheck['source'], string> = {
    'Google Sheet': 'Request',
    'Aztek Tools': 'หลังบ้าน',
    'QA Handoff': 'หลักฐาน QA',
  };
  const issueCount = report.summary.FAIL + report.summary.BLOCKED + report.summary.REVIEW;
  const defaultFilter = issueCount > 0 ? 'issues' : 'all';
  const sheetUrl = report.checks.find((check) => check.source === 'Google Sheet' && check.url)?.url;
  const health = report.summary.FAIL > 0 || report.summary.BLOCKED > 0
    ? { tone: 'danger', label: 'ต้องจัดการ', title: `พบ ${report.summary.FAIL + report.summary.BLOCKED} จุดที่ตรวจไม่ผ่าน`, detail: `ข้อมูลไม่ตรง ${report.summary.FAIL} จุด และตรวจไม่ได้ ${report.summary.BLOCKED} จุด` }
    : report.summary.REVIEW > 0
      ? { tone: 'warning', label: 'เกือบพร้อม', title: `ข้อมูลหลักผ่าน มี ${report.summary.REVIEW} จุดรอยืนยัน`, detail: 'เปิดดูรายการด้านล่างเพื่อเติมหรือยืนยันหลักฐานก่อนปิดงาน' }
      : { tone: 'success', label: 'พร้อมใช้งาน', title: 'ตรวจผ่านครบทุกจุด', detail: 'ไม่พบข้อมูลผิด จุดติดขัด หรือหลักฐานที่ต้องตรวจเพิ่ม' };
  const issues = checks.filter((check) => check.status !== 'PASS');
  const issueItems = issues.slice(0, 5).map((check, index) => `<li><a href="#check-${index}">${html(check.item)} · ${html(check.field)}</a><span>${html(check.message || check.actual)}</span></li>`).join('');
  const rows = checks.map((check, index) => {
    const evidence = [
      check.url ? `<a href="${html(check.url)}" target="_blank" rel="noreferrer">เปิดข้อมูลต้นทาง</a>` : '',
      check.screenshot ? `<a href="${html(check.screenshot)}" target="_blank">ดูภาพที่บันทึก</a>` : '',
      check.message ? `<span class="note">${html(check.message)}</span>` : '',
    ].filter(Boolean).join('');
    const searchText = [check.status, labels[check.status], check.source, sources[check.source], check.item,
      check.field, check.expected, check.actual, check.message].join(' ').toLocaleLowerCase('th');

    return `<tr id="check-${index}" data-status="${check.status}" data-search="${html(searchText)}">
      <td data-label="ผล"><span class="status ${check.status.toLowerCase()}"><span class="dot" aria-hidden="true"></span>${labels[check.status]}</span></td>
      <td data-label="สินค้า"><strong class="item-name">${html(check.item)}</strong><span class="source">${sources[check.source]}</span></td>
      <td data-label="จุดตรวจ"><span class="field">${html(check.field)}</span></td>
      <td data-label="Request"><span class="value expected">${html(check.expected)}</span></td>
      <td data-label="ค่าจริง"><span class="value">${html(check.actual)}</span></td>
      <td data-label="หลักฐาน" class="evidence">${evidence || '<span class="muted">ไม่มี</span>'}</td>
    </tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${issueCount > 0 ? `(${issueCount}) ` : ''}${html(report.title)}</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", Tahoma, sans-serif; color: #202124; background: #f7f8fa; font-size: 16px; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; }
    a { color: #075eb5; text-underline-offset: 2px; }
    a:hover { color: #003e78; }
    a:focus-visible, button:focus-visible, input:focus-visible { outline: 3px solid #ffbf47; outline-offset: 2px; }
    .topbar { background: #fff; border-bottom: 1px solid #d9dde3; }
    .topbar-inner { max-width: 1480px; margin: 0 auto; padding: 18px 28px; display: flex; gap: 24px; justify-content: space-between; align-items: center; }
    .brand { display: flex; gap: 12px; align-items: center; min-width: 0; }
    .brand-mark { width: 8px; height: 42px; flex: 0 0 8px; background: #e87500; border-radius: 2px; }
    .product-name { margin: 0 0 2px; color: #5f6368; font-size: 13px; font-weight: 700; }
    h1 { margin: 0; font-size: 22px; line-height: 1.3; letter-spacing: 0; overflow-wrap: anywhere; }
    .meta { text-align: right; color: #5f6368; font-size: 13px; line-height: 1.7; }
    .meta a { margin-left: 12px; white-space: nowrap; }
    main { max-width: 1480px; margin: 0 auto; padding: 24px 28px 48px; }
    .health { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: center; padding: 18px 20px; border: 1px solid #d9dde3; border-left-width: 6px; background: #fff; }
    .health.danger { border-left-color: #c5221f; background: #fff7f6; }
    .health.warning { border-left-color: #e87500; background: #fff9ee; }
    .health.success { border-left-color: #137333; background: #f2faf4; }
    .eyebrow { display: block; margin-bottom: 2px; color: #5f6368; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .health h2 { margin: 0; font-size: 20px; line-height: 1.35; letter-spacing: 0; }
    .health p { margin: 4px 0 0; color: #4d5156; }
    .run-id { color: #5f6368; font-family: Consolas, monospace; font-size: 12px; white-space: nowrap; }
    .metrics { display: grid; grid-template-columns: repeat(6, minmax(100px, 1fr)); margin: 20px 0; border-block: 1px solid #d9dde3; background: #fff; }
    .metric { min-width: 0; padding: 13px 16px; border: 0; border-right: 1px solid #e4e7eb; background: transparent; color: #3c4043; text-align: left; cursor: pointer; }
    .metric:last-child { border-right: 0; }
    .metric:hover { background: #f1f3f4; }
    .metric[aria-pressed="true"] { box-shadow: inset 0 -4px #0b57d0; background: #eef4ff; color: #0b57d0; }
    .metric strong { display: block; font-size: 23px; line-height: 1.1; }
    .metric span { display: block; margin-top: 4px; font-size: 12px; font-weight: 600; }
    .attention { margin-bottom: 20px; padding: 18px 20px; border: 1px solid #efc46f; border-left: 6px solid #e87500; background: #fffaf0; }
    .attention h2 { margin: 0; font-size: 18px; letter-spacing: 0; }
    .attention p { margin: 4px 0 0; color: #5f4b22; }
    .attention ul { margin: 12px 0 0; padding: 0; list-style: none; }
    .attention li { display: grid; grid-template-columns: minmax(220px, .8fr) minmax(0, 1.2fr); gap: 16px; padding: 10px 0; border-top: 1px solid #efd9ad; }
    .attention li a { font-weight: 700; }
    .attention li span { color: #5f4b22; overflow-wrap: anywhere; }
    .results-head { display: flex; justify-content: space-between; align-items: end; gap: 20px; margin: 28px 0 12px; }
    .results-head h2 { margin: 0; font-size: 19px; letter-spacing: 0; }
    .results-count { margin: 4px 0 0; color: #5f6368; font-size: 13px; }
    .search { width: min(420px, 100%); }
    .search label { display: block; margin-bottom: 6px; color: #3c4043; font-size: 13px; font-weight: 700; }
    .search-row { display: flex; }
    .search input { width: 100%; min-width: 0; height: 40px; padding: 8px 11px; border: 1px solid #9aa0a6; border-radius: 4px 0 0 4px; background: #fff; color: #202124; font: inherit; }
    .search button { height: 40px; padding: 0 14px; border: 1px solid #9aa0a6; border-left: 0; border-radius: 0 4px 4px 0; background: #f1f3f4; color: #3c4043; font-weight: 600; cursor: pointer; }
    .table-wrap { overflow: auto; max-height: 70vh; background: #fff; border: 1px solid #d9dde3; }
    table { width: 100%; border-collapse: collapse; min-width: 1060px; table-layout: fixed; }
    col.status-col { width: 112px; } col.item-col { width: 19%; } col.field-col { width: 14%; } col.value-col { width: 18%; } col.evidence-col { width: 19%; }
    th, td { text-align: left; vertical-align: top; padding: 12px 14px; border-bottom: 1px solid #e4e7eb; overflow-wrap: anywhere; }
    th { position: sticky; top: 0; z-index: 2; background: #f1f3f4; color: #3c4043; font-size: 12px; font-weight: 700; }
    tbody tr:nth-child(even) { background: #fafbfc; }
    tbody tr:hover { background: #f4f7fb; }
    tbody tr:target { scroll-margin-top: 44px; background: #fff3d6; }
    tbody tr[data-status="FAIL"] { box-shadow: inset 4px 0 #c5221f; }
    tbody tr[data-status="BLOCKED"] { box-shadow: inset 4px 0 #6f42c1; }
    tbody tr[data-status="REVIEW"] { box-shadow: inset 4px 0 #e87500; }
    .status { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 3px 8px; border-radius: 3px; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: currentColor; }
    .status.pass { color: #0d652d; background: #dff2e5; } .status.fail { color: #a50e0e; background: #fce8e6; }
    .status.review { color: #8a4b00; background: #feefc3; } .status.blocked { color: #5b2e91; background: #eee5f7; }
    .item-name { display: block; line-height: 1.35; }
    .source { display: inline-block; margin-top: 6px; color: #5f6368; font-size: 11px; font-weight: 600; }
    .field { color: #3c4043; font-weight: 600; }
    .value { display: block; font-family: Consolas, "Segoe UI", sans-serif; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
    .expected { color: #174ea6; }
    .evidence { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; font-size: 13px; }
    .note { color: #5f6368; line-height: 1.45; }
    .muted { color: #9aa0a6; }
    .empty { padding: 40px 20px; border: 1px solid #d9dde3; border-top: 0; background: #fff; color: #5f6368; text-align: center; }
    [hidden] { display: none !important; }
    @media (max-width: 900px) {
      .topbar-inner, main { padding-left: 18px; padding-right: 18px; }
      .topbar-inner { align-items: flex-start; }
      .meta { text-align: left; }
      .metrics { grid-template-columns: repeat(3, 1fr); }
      .metric:nth-child(3) { border-right: 0; } .metric:nth-child(-n+3) { border-bottom: 1px solid #e4e7eb; }
      .attention li { grid-template-columns: 1fr; gap: 3px; }
      .results-head { align-items: stretch; flex-direction: column; }
      .search { width: 100%; }
    }
    @media (max-width: 700px) {
      .topbar-inner { flex-direction: column; gap: 10px; }
      .meta a:first-of-type { margin-left: 0; }
      main { padding-top: 16px; }
      .health { grid-template-columns: 1fr; gap: 10px; }
      .metrics { grid-template-columns: repeat(2, 1fr); }
      .metric:nth-child(odd) { border-right: 1px solid #e4e7eb; } .metric:nth-child(even) { border-right: 0; }
      .metric:nth-child(-n+4) { border-bottom: 1px solid #e4e7eb; }
      .table-wrap { overflow: visible; max-height: none; border: 0; background: transparent; }
      table, tbody { display: block; min-width: 0; } thead, colgroup { display: none; }
      tr { display: block; margin-bottom: 12px; border: 1px solid #d9dde3; background: #fff !important; }
      td { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 10px; padding: 10px 12px; border-bottom: 1px solid #eceff1; }
      td:last-child { border-bottom: 0; }
      td::before { content: attr(data-label); color: #5f6368; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .evidence { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: start; }
      .evidence::before { grid-row: 1 / span 8; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span><div><p class="product-name">PACK QA CHECKER</p><h1>${html(report.title)}</h1></div></div>
      <div class="meta"><div>ตรวจเมื่อ ${html(report.generatedAt)}</div><div>Request: ${html(report.sourceSpec)}${sheetUrl ? ` <a href="${html(sheetUrl)}" target="_blank" rel="noreferrer">เปิด Google Sheet</a>` : ''}<a href="latest.json" target="_blank">ดู JSON</a></div></div>
    </div>
  </header>
  <main>
    <section class="health ${health.tone}" aria-labelledby="health-title">
      <div><span class="eyebrow">${health.label}</span><h2 id="health-title">${health.title}</h2><p>${health.detail}</p></div>
      <span class="run-id">Run ${html(report.runId)}</span>
    </section>

    <nav class="metrics" aria-label="กรองผลการตรวจ">
      <button class="metric" type="button" data-filter="issues" aria-pressed="${defaultFilter === 'issues'}"><strong>${issueCount}</strong><span>ต้องจัดการ</span></button>
      <button class="metric" type="button" data-filter="all" aria-pressed="${defaultFilter === 'all'}"><strong>${checks.length}</strong><span>ทั้งหมด</span></button>
      <button class="metric" type="button" data-filter="FAIL" aria-pressed="false"><strong>${report.summary.FAIL}</strong><span>ข้อมูลไม่ตรง</span></button>
      <button class="metric" type="button" data-filter="BLOCKED" aria-pressed="false"><strong>${report.summary.BLOCKED}</strong><span>ตรวจไม่ได้</span></button>
      <button class="metric" type="button" data-filter="REVIEW" aria-pressed="false"><strong>${report.summary.REVIEW}</strong><span>รอยืนยัน</span></button>
      <button class="metric" type="button" data-filter="PASS" aria-pressed="false"><strong>${report.summary.PASS}</strong><span>ผ่าน</span></button>
    </nav>

    ${issues.length > 0 ? `<section class="attention" aria-labelledby="attention-title"><h2 id="attention-title">จุดที่ควรเปิดดูก่อน</h2><p>แสดงสูงสุด 5 จุดสำคัญ รายละเอียดทั้งหมดอยู่ในตาราง</p><ul>${issueItems}</ul>${issues.length > 5 ? `<p>และอีก ${issues.length - 5} จุด ใช้ตัวกรองด้านบนเพื่อดูทั้งหมด</p>` : ''}</section>` : ''}

    <section aria-labelledby="results-title">
      <div class="results-head">
        <div><h2 id="results-title">รายละเอียดการตรวจ</h2><p class="results-count" aria-live="polite"><span id="visible-count">0</span> จาก ${checks.length} จุด</p></div>
        <div class="search"><label for="search-input">ค้นหาสินค้า จุดตรวจ หรือค่า</label><div class="search-row"><input id="search-input" type="search" autocomplete="off" placeholder="เช่น ติดหวาน, Bundle ID, 790"><button id="clear-search" type="button">ล้าง</button></div></div>
      </div>
      <div class="table-wrap">
      <table aria-describedby="results-title">
        <colgroup><col class="status-col"><col class="item-col"><col class="field-col"><col class="value-col"><col class="value-col"><col class="evidence-col"></colgroup>
        <thead><tr><th scope="col">ผล</th><th scope="col">สินค้า / แหล่งข้อมูล</th><th scope="col">จุดตรวจ</th><th scope="col">Request</th><th scope="col">ค่าจริง</th><th scope="col">หลักฐาน</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
      <div id="empty-state" class="empty" hidden>ไม่พบรายการที่ตรงกับตัวกรองหรือคำค้น</div>
    </section>
    <script>
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const buttons = Array.from(document.querySelectorAll('[data-filter]'));
        const input = document.getElementById('search-input');
        const clear = document.getElementById('clear-search');
        const count = document.getElementById('visible-count');
        const empty = document.getElementById('empty-state');
        let activeFilter = '${defaultFilter}';

        function matchesStatus(status) {
          if (activeFilter === 'all') return true;
          if (activeFilter === 'issues') return status !== 'PASS';
          return status === activeFilter;
        }
        function render() {
          const query = input.value.trim().toLocaleLowerCase('th');
          let visible = 0;
          rows.forEach((row) => {
            const show = matchesStatus(row.dataset.status) && (!query || row.dataset.search.includes(query));
            row.hidden = !show;
            if (show) visible += 1;
          });
          count.textContent = String(visible);
          empty.hidden = visible !== 0;
        }
        buttons.forEach((button) => button.addEventListener('click', () => {
          activeFilter = button.dataset.filter;
          buttons.forEach((candidate) => candidate.setAttribute('aria-pressed', String(candidate === button)));
          render();
        }));
        input.addEventListener('input', render);
        clear.addEventListener('click', () => { input.value = ''; input.focus(); render(); });
        document.querySelectorAll('.attention a[href^="#check-"]').forEach((link) => link.addEventListener('click', () => {
          activeFilter = 'issues';
          buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === 'issues')));
          render();
        }));
        render();
      })();
    </script>
  </main>
</body>
</html>`;
}

export class QaReport {
  readonly runId: string;
  readonly evidenceDirectory: string;
  private readonly checks: QaCheck[] = [];

  constructor(
    private readonly title: string,
    private readonly sourceSpec: string,
    private readonly outputDirectory = path.resolve('qa-reports'),
  ) {
    const now = new Date();
    this.runId = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    this.evidenceDirectory = path.join(this.outputDirectory, 'evidence', this.runId);
  }

  add(check: QaCheck): void {
    this.checks.push(check);
  }

  count(status: QaStatus): number {
    return this.checks.filter((check) => check.status === status).length;
  }

  write(): { htmlPath: string; jsonPath: string; hasBlockingProblems: boolean } {
    fs.mkdirSync(this.outputDirectory, { recursive: true });

    const report: QaReportDocument = {
      title: this.title,
      sourceSpec: this.sourceSpec,
      runId: this.runId,
      generatedAt: displayTime(new Date()),
      summary: {
        PASS: this.count('PASS'),
        FAIL: this.count('FAIL'),
        REVIEW: this.count('REVIEW'),
        BLOCKED: this.count('BLOCKED'),
      },
      checks: this.checks,
    };

    const json = `${JSON.stringify(report, null, 2)}\n`;
    const renderedHtml = renderReport(report);
    const jsonPath = path.join(this.outputDirectory, `${this.runId}.json`);
    const htmlPath = path.join(this.outputDirectory, `${this.runId}.html`);

    fs.writeFileSync(jsonPath, json, 'utf8');
    fs.writeFileSync(htmlPath, renderedHtml, 'utf8');
    fs.writeFileSync(path.join(this.outputDirectory, 'latest.json'), json, 'utf8');
    fs.writeFileSync(path.join(this.outputDirectory, 'latest.html'), renderedHtml, 'utf8');

    return {
      htmlPath,
      jsonPath,
      hasBlockingProblems: report.summary.FAIL > 0 || report.summary.BLOCKED > 0,
    };
  }
}
