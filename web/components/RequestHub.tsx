"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, downloadApiFile } from "@/lib/api-client";

import ItemCodeRequestForm from "@/components/ItemCodeRequestForm";
import { parseExcelPaste } from "@/lib/excel-paste";
import { readSpreadsheetTabs, sourceTextFromAttachments } from "@/lib/spreadsheet-upload";

type RequestType = "WEB_SHOP" | "ITEM_CODE";
type WebshopType = "NORMAL" | "RANDOM";
type RequestStatus = "NEW" | "PROCESSING" | "REVIEW" | "READY_TO_IMPORT" | "IMPORTED" | "FAILED";
type SheetTab = { name: string; text: string };
type HubRequest = {
  id: string;
  title: string;
  request_type: RequestType;
  webshop_type: WebshopType | null;
  fixed_rewards: boolean;
  status: RequestStatus;
  requester: string;
  created_at: string;
  updated_at: string;
  notification_status: string;
  history?: Array<{ type: string; at: string; from?: RequestStatus; to?: RequestStatus; filename?: string }>;
  source_text?: string;
  attachments?: Array<{ name: string; type: string; data_url?: string }>;
  payload: Record<string, unknown>;
};

const API = "/api";
const localKey = "bundle-import-local-requests-v1";
const labels: Record<RequestStatus, string> = {
  NEW: "งานใหม่",
  PROCESSING: "กำลังประมวลผล",
  REVIEW: "รอตรวจ",
  READY_TO_IMPORT: "พร้อม Import",
  IMPORTED: "Import แล้ว",
  FAILED: "ต้องแก้ไข",
};

export default function RequestHub({ onOpenAdapter, onStartBundleOnly }: { onOpenAdapter: () => void; onStartBundleOnly?: () => void }) {
  const [view, setView] = useState<"list" | "webshop" | "itemcode">("list");
  const [requests, setRequests] = useState<HubRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [pendingStatuses, setPendingStatuses] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [webshopType, setWebshopType] = useState<WebshopType | null>(null);
  const [hasFixed, setHasFixed] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [price, updatePrice] = useState("");
  const [limit, updateLimit] = useState("");
  const [priceEdited, setPriceEdited] = useState(false);
  const [limitEdited, setLimitEdited] = useState(false);
  function setPrice(value: string) { setPriceEdited(true); updatePrice(value); }
  function setLimit(value: string) { setLimitEdited(true); updateLimit(value); }
  const [sourceText, setSourceText] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTabs, setSheetTabs] = useState<SheetTab[]>([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const filteredRequests = requests.filter((request) =>
    (!statusFilter || request.status === statusFilter) &&
    (!typeFilter || request.request_type === typeFilter) &&
    [request.title, request.id, request.requester].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const sourceResult = useMemo(() => parseExcelPaste(sourceText), [sourceText]);
  const sourceSummary = sourceResult.bundles.length ? {
    bundles: sourceResult.bundles.length,
    fixed: sourceResult.bundles.filter((bundle) => !bundle.is_gacha).length,
    random: sourceResult.bundles.filter((bundle) => bundle.is_gacha).length,
    items: sourceResult.bundles.reduce((total, bundle) => total + bundle.items.length, 0),
  } : null;

  useEffect(() => { void loadRequests(); }, []);
  useEffect(() => {
    if (!priceEdited) updatePrice(sourceResult.summary.seedPoint == null ? "" : String(sourceResult.summary.seedPoint));
    if (!limitEdited) updateLimit(sourceResult.summary.purchaseLimit == null ? "" : String(sourceResult.summary.purchaseLimit));
  }, [sourceResult, priceEdited, limitEdited]);

  async function loadRequests() {
    setLoading(true);
    try {
      const response = await apiFetch(API + "/requests");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "โหลดรายการไม่สำเร็จ");
      setRequests(body.requests);
      setError("");
    } catch (error) {
      const remote = Boolean(localStorage.getItem("bundle-import-api-endpoint")) || window.location.hostname.endsWith("github.io");
      setRequests(remote ? [] : readLocalRequests());
      setError(remote ? error instanceof Error ? error.message : "โหลด History ไม่สำเร็จ" : "กำลังใช้ Request Hub ในเครื่องชั่วคราว — เปิด API เพื่อบันทึกส่วนกลางและแจ้ง Discord");
    } finally {
      setLoading(false);
    }
  }

  function resetWebShopForm() {
    setWebshopType(null);
    setHasFixed(null);
    setTitle("");
    updatePrice("");
    updateLimit("");
    setPriceEdited(false);
    setLimitEdited(false);
    setSourceText("");
    setSheetUrl("");
    setSheetTabs([]);
    setSelectedTab("");
    setAttachments([]);
    setError("");
  }

  async function loadSheetTabs() {
    if (!sheetUrl.trim()) return setError("วางลิงก์ Google Sheet ก่อน");
    setLoadingSheet(true);
    setError("");
    try {
      const response = await apiFetch(API + "/google-sheets?url=" + encodeURIComponent(sheetUrl));
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "อ่าน Google Sheet ไม่สำเร็จ");
      setSheetTabs(body.tabs);
      setSelectedTab(body.tabs[0]?.name || "");
    } catch (caught) {
      setSheetTabs([]);
      setSelectedTab("");
      setError(caught instanceof Error ? caught.message : "อ่าน Google Sheet ไม่สำเร็จ");
    } finally {
      setLoadingSheet(false);
    }
  }

  function useSheetTab() {
    const tab = sheetTabs.find((item) => item.name === selectedTab);
    if (!tab) return;
    setSourceText(tab.text);
    setError("");
  }

  function openAdapterWithRequest(request: HubRequest) {
    window.localStorage.setItem("bundle-import-request-source", request.source_text || "");
    window.localStorage.setItem("bundle-import-request", JSON.stringify(request));
    window.localStorage.setItem("bundle-import-request-title", request.title || "");
    onOpenAdapter();
  }

  async function createRequest() {
    if (!title.trim() || !webshopType) return setError("กรอกชื่อ และเลือกประเภท Web Shop ให้ครบก่อนส่ง");
    if (webshopType === "RANDOM" && hasFixed === null) return setError("เลือกก่อนว่าสินค้าสุ่มมี Fixed rewards หรือไม่");
    setSaving(true);
    setError("");
    let payload: Record<string, unknown> | undefined;
    try {
      const importedFileText = sourceText.trim() ? "" : await sourceTextFromAttachments(attachments);
      const effectiveSourceText = sourceText.trim() ? sourceText : importedFileText;
      const effectiveResult = parseExcelPaste(effectiveSourceText);
      const effectiveSummary = effectiveResult.bundles.length ? {
        bundles: effectiveResult.bundles.length,
        fixed: effectiveResult.bundles.filter((bundle) => !bundle.is_gacha).length,
        random: effectiveResult.bundles.filter((bundle) => bundle.is_gacha).length,
        items: effectiveResult.bundles.reduce((total, bundle) => total + bundle.items.length, 0),
      } : null;
      const resolvedPrice = priceEdited ? price.trim() : effectiveResult.summary.seedPoint == null ? "" : String(effectiveResult.summary.seedPoint);
      const resolvedLimit = limitEdited ? limit.trim() : effectiveResult.summary.purchaseLimit == null ? "" : String(effectiveResult.summary.purchaseLimit);
      if (resolvedPrice && (!Number.isFinite(Number(resolvedPrice)) || Number(resolvedPrice) < 0)) throw new Error("Seed Point ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
      if (resolvedLimit && (!Number.isSafeInteger(Number(resolvedLimit)) || Number(resolvedLimit) < 1)) throw new Error("Purchase limit per player ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป หรือเว้นว่าง");
      payload = {
        title,
        request_type: "WEB_SHOP",
        webshop_type: webshopType,
        fixed_rewards: webshopType === "RANDOM" ? Boolean(hasFixed) : false,
        requester: "GP",
        source_text: effectiveSourceText,
        attachments: await Promise.all(attachments.map(readAttachment)),
        payload: {
          category: "",
          seed_point: resolvedPrice || null,
          full_price: resolvedPrice || null,
          purchase_limit: resolvedLimit || null,
          source_sheet: sheetTabs.length && selectedTab ? { url: sheetUrl, tab: selectedTab } : null,
          processing: effectiveSummary ? {
            state: effectiveResult.valid ? "READY_FOR_REVIEW" : "AWAITING_SOURCE",
            ...effectiveSummary,
            warnings: effectiveResult.warnings.map((warning) => warning.message),
          } : { state: "AWAITING_SOURCE", warnings: effectiveResult.warnings.map((warning) => warning.message) },
          auto_rewards: webshopType === "RANDOM" && hasFixed === false ? {
            golden_seed_point: resolvedPrice || null,
            player_exp: resolvedPrice ? Number(resolvedPrice) / 10 : null,
          } : null,
        },
      };
      const response = await apiFetch(API + "/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "สร้าง Request ไม่สำเร็จ");
      setRequests((current) => [body.request, ...current]);
      openAdapterWithRequest(body.request);
    } catch (caught) {
      if (caught instanceof TypeError && payload) {
        const offline = offlineRequest(payload);
        setRequests((current) => {
          const next = [offline, ...current];
          writeLocalRequests(next);
          return next;
        });
        openAdapterWithRequest(offline);
      } else {
        setError(caught instanceof Error ? caught.message : "สร้าง Request ไม่สำเร็จ");
      }
    } finally {
      setSaving(false);
    }
  }

  async function moveStatus(id: string, status: RequestStatus) {
    setPendingStatuses((current) => new Set(current).add(id));
    setError("");
    try {
      const response = await apiFetch(API + "/requests/" + id + "/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "อัปเดตสถานะไม่สำเร็จ");
      setRequests((current) => current.map((item) => item.id === id ? body.request : item));
    } catch (caught) {
      if (caught instanceof TypeError) {
        setRequests((current) => {
          const next = current.map((item) => item.id === id ? { ...item, status, updated_at: new Date().toISOString(), notification_status: "LOCAL_ONLY" } : item);
          writeLocalRequests(next);
          return next;
        });
        setError("อัปเดตสถานะในเครื่องแล้ว — เปิด API เพื่อ sync และแจ้ง Discord");
      } else {
        setError(caught instanceof Error ? caught.message : "อัปเดตสถานะไม่สำเร็จ");
      }
    } finally {
      setPendingStatuses((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  async function openInAdapter(id: string) {
    try {
      const response = await apiFetch(API + "/requests/" + id);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "เปิด Request ไม่สำเร็จ");
      openAdapterWithRequest(body.request);
    } catch (caught) {
      const local = readLocalRequests().find((item) => item.id === id);
      if (local) openAdapterWithRequest(local);
      else setError(caught instanceof Error ? caught.message : "เปิด Request ไม่สำเร็จ");
    }
  }

  if (view === "itemcode") return <ItemCodeRequestForm onBack={() => { setView("list"); void loadRequests(); }} onOpenAdapter={onOpenAdapter} />;

  return <main className="hub-shell">
    <header className="hub-header"><div className="adapter-brand"><span className="adapter-mark">BI</span><div><strong>Bundle Import</strong><span>Request Hub</span></div></div><button className="quiet-button" type="button" onClick={() => void loadRequests()}>รีเฟรช</button></header>
    {view === "list" ? <section className="hub-content">
      <div className="hub-intro">
        <div><p className="eyebrow">Request hub</p><h1>วันนี้ต้องสร้างอะไร?</h1><p>เริ่มงานจากประเภทที่ต้องการ แล้วระบบจะจัดข้อมูลให้พร้อมเข้า Import Studio</p></div>
        <div className="hub-create-actions">
          <button type="button" className="hub-create-card" onClick={() => { resetWebShopForm(); setView("webshop"); }}><b>Web Shop</b><span>สร้าง Product และ Bundle สำหรับขายบนเว็บ</span></button>
          <button type="button" className="hub-create-card" onClick={() => setView("itemcode")}><b>Item Code</b><span>เก็บข้อมูล Code แล้วจัดรางวัลเป็น Bundle พร้อม Import</span></button>
          <button type="button" className="hub-create-card bundle-only" onClick={() => onStartBundleOnly?.()}><b>Bundle only</b><span>สร้างและ Export Bundle โดยไม่สร้าง Request หรือ Product</span></button>
        </div>
      </div>
      <section className="request-history">
        <div className="section-heading"><div><p className="eyebrow">History</p><h2>งานที่เข้ามา</h2></div><p>{loading ? "กำลังโหลด..." : requests.length + " Requests"}</p></div>
        <div className="request-filters">
          <label>ค้นหางาน<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ชื่องาน / เลข Request / ผู้ขอ" /></label>
          <label>ประเภทงาน<select aria-label="ประเภทงาน" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">ทุกประเภท</option><option value="WEB_SHOP">Web Shop</option><option value="ITEM_CODE">Item Code</option></select></label>
          <label>กรองสถานะ<select aria-label="กรองสถานะ" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        {error && <p className="hub-error">{error}</p>}
        {!loading && !requests.length && <div className="hub-empty"><b>ยังไม่มี Request</b><span>เริ่มจากเลือก Web Shop หรือ Item Code ด้านบน</span></div>}
        {!loading && requests.length > 0 && filteredRequests.length === 0 && <p role="status">ไม่พบงานที่ตรงกับการค้นหา</p>}
        <div className="request-list">{filteredRequests.map((item) => <RequestRow key={item.id} request={item} pending={pendingStatuses.has(item.id)} onStatus={moveStatus} onOpen={openInAdapter} />)}</div>
      </section>
    </section> : <WebShopForm title={title} price={price} limit={limit} webshopType={webshopType} hasFixed={hasFixed} sourceText={sourceText} sourceSummary={sourceSummary} warnings={sourceResult.warnings.map((warning) => warning.message)} sheetUrl={sheetUrl} sheetTabs={sheetTabs} selectedTab={selectedTab} loadingSheet={loadingSheet} attachments={attachments} saving={saving} error={error} onBack={() => setView("list")} onTitle={setTitle} onPrice={setPrice} onLimit={setLimit} onType={setWebshopType} onFixed={setHasFixed} onSource={setSourceText} onSheetUrl={setSheetUrl} onLoadTabs={loadSheetTabs} onSelectedTab={setSelectedTab} onUseTab={useSheetTab} onAttachments={setAttachments} onSubmit={createRequest} />}
  </main>;
}

function WebShopForm(props: {
  title: string; price: string; limit: string; webshopType: WebshopType | null; hasFixed: boolean | null; sourceText: string;
  sourceSummary: { bundles: number; fixed: number; random: number; items: number } | null; warnings: string[];
  sheetUrl: string; sheetTabs: SheetTab[]; selectedTab: string; loadingSheet: boolean; attachments: File[]; saving: boolean; error: string;
  onBack: () => void; onTitle: (value: string) => void; onPrice: (value: string) => void; onLimit: (value: string) => void;
  onType: (value: WebshopType) => void; onFixed: (value: boolean) => void; onSource: (value: string) => void; onSheetUrl: (value: string) => void;
  onLoadTabs: () => void; onSelectedTab: (value: string) => void; onUseTab: () => void; onAttachments: (files: File[]) => void; onSubmit: () => void;
}) {
  const [attachmentTabs, setAttachmentTabs] = useState<SheetTab[]>([]);
  const [selectedAttachmentTab, setSelectedAttachmentTab] = useState("");
  const [loadingAttachment, setLoadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const autoExp = props.price ? Number(props.price) / 10 : null;

  async function chooseAttachments(files: File[]) {
    props.onAttachments(files);
    setAttachmentTabs([]);
    setSelectedAttachmentTab("");
    setAttachmentError("");
    const spreadsheet = files.find((file) => /\.(xlsx|csv|txt|md)$/i.test(file.name));
    if (!spreadsheet) return;
    setLoadingAttachment(true);
    try {
      const tabs = await readSpreadsheetTabs(spreadsheet);
      setAttachmentTabs(tabs);
      setSelectedAttachmentTab(tabs[0]?.name || "");
    } catch (caught) {
      setAttachmentError(caught instanceof Error ? caught.message : "อ่านไฟล์ Spreadsheet ไม่สำเร็จ");
    } finally {
      setLoadingAttachment(false);
    }
  }

  function useAttachmentTab() {
    const tab = attachmentTabs.find((item) => item.name === selectedAttachmentTab);
    if (tab) props.onSource(tab.text);
  }

  return <section className="hub-content request-create">
    <button type="button" className="back-link" onClick={props.onBack}>← กลับไป Request Hub</button>
    <p className="eyebrow">New request</p><h1>สร้างงาน Web Shop</h1>
    <p className="form-lead">เลือกรูปแบบสินค้า แล้ววางตารางหรือเลือกแท็บจาก Google Sheet ระบบจะส่งงานไป Review ใน Import Studio</p>
    <section className="request-form-card">
      <label><span>ชื่องาน / ชื่อ Product</span><input value={props.title} onChange={(event) => props.onTitle(event.target.value)} placeholder="เช่น เสวเสาร์ : Lanistar" /></label>
      <fieldset><legend>ประเภท Web Shop</legend><div className="decision-cards">
        <DecisionCard active={props.webshopType === "NORMAL"} title="Normal" detail="Bundle ปกติ ได้ Item ตามรายการ" onClick={() => { props.onType("NORMAL"); props.onFixed(false); }} />
        <DecisionCard active={props.webshopType === "RANDOM"} title="Random" detail="สุ่มรางวัลตาม Chance ที่กำหนด" onClick={() => props.onType("RANDOM")} />
      </div></fieldset>
      {props.webshopType === "RANDOM" && <fieldset><legend>มี Fixed rewards เพิ่มไหม?</legend><div className="decision-cards compact">
        <DecisionCard active={props.hasFixed === true} title="มี Fixed" detail="เพิ่มรายการ Fixed และ Random จากข้อมูลเดียวกันได้" onClick={() => props.onFixed(true)} />
        <DecisionCard active={props.hasFixed === false} title="ไม่มี" detail="ระบบจะสร้าง Fixed GSP และ Player EXP ให้เอง" onClick={() => props.onFixed(false)} />
      </div></fieldset>}
      <div className="request-fields">
        <label><span>Seed Point</span><input inputMode="decimal" value={props.price} onChange={(event) => props.onPrice(event.target.value)} placeholder="เช่น 590" /></label>
        <label><span>Purchase limit per player</span><input inputMode="numeric" value={props.limit} onChange={(event) => props.onLimit(event.target.value)} placeholder="เช่น 1" /></label>
      </div>
      {props.webshopType && props.price.trim() && Number.isFinite(Number(props.price)) && Number(props.price) >= 0 && <div className="auto-reward-note"><b>ระบบจะเพิ่ม Fixed rewards</b><span>Golden Seed Point {props.price} · Player EXP {autoExp}</span></div>}
      <section className="sheet-source"><div><b>ดึงจาก Google Sheet</b><span>วางลิงก์ครั้งเดียว แล้วเลือกแท็บที่จะใช้</span></div>
        <div className="sheet-url-row"><input value={props.sheetUrl} onChange={(event) => props.onSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." /><button type="button" className="quiet-button" disabled={props.loadingSheet} onClick={props.onLoadTabs}>{props.loadingSheet ? "กำลังอ่าน..." : "อ่านแท็บ"}</button></div>
        {props.sheetTabs.length > 0 && <div className="sheet-tab-row"><select aria-label="เลือกแท็บ Google Sheet" value={props.selectedTab} onChange={(event) => props.onSelectedTab(event.target.value)}>{props.sheetTabs.map((tab) => <option key={tab.name} value={tab.name}>{tab.name}</option>)}</select><button type="button" className="secondary-button" onClick={props.onUseTab}>ใช้แท็บนี้</button><small>{props.sheetTabs.length} แท็บ · ข้อมูลจะถูกนำไปใส่ในช่องตารางด้านล่าง</small></div>}
      </section>
      <label><span>ตาราง Request หรือรายละเอียดเพิ่มเติม</span><textarea value={props.sourceText} onChange={(event) => props.onSource(event.target.value)} placeholder="วางตาราง Item, เงื่อนไข หรือข้อความจาก PM ได้เลย" /></label>
      {props.sourceSummary && <div className="processing-summary"><div><b>อ่านตารางได้แล้ว</b><span>ตรวจต่อใน Import Studio ก่อน Export</span></div><dl><div><dt>{props.sourceSummary.bundles}</dt><dd>Bundles</dd></div><div><dt>{props.sourceSummary.fixed}</dt><dd>Fixed</dd></div><div><dt>{props.sourceSummary.random}</dt><dd>Random</dd></div><div><dt>{props.sourceSummary.items}</dt><dd>Items</dd></div></dl>{props.warnings.length > 0 && <small>{props.warnings.join(" · ")}</small>}</div>}
      {props.sourceText && !props.sourceSummary && <p className="source-warning">ยังหา Header Item ID, Item Name และ Amt ไม่ครบ ระบบจะเก็บข้อความไว้ แต่ยังไม่สร้างรายการอัตโนมัติ</p>}
      <label><span>ไฟล์ประกอบ</span><input type="file" multiple accept=".xlsx,.xls,.csv,.txt,.md,image/*" onChange={(event) => void chooseAttachments(Array.from(event.target.files || []))} /><small>{props.attachments.length ? props.attachments.map((file) => file.name).join(", ") : "แนบ Excel, CSV, Text หรือภาพ Request ได้"}</small></label>
      {attachmentTabs.length > 0 && <div className="sheet-tab-row"><select aria-label="เลือกแท็บจากไฟล์ประกอบ" value={selectedAttachmentTab} onChange={(event) => setSelectedAttachmentTab(event.target.value)}>{attachmentTabs.map((tab) => <option value={tab.name} key={tab.name}>{tab.name}</option>)}</select><button type="button" className="secondary-button" onClick={useAttachmentTab}>{loadingAttachment ? "กำลังอ่าน..." : "ใช้แท็บนี้"}</button><small>{attachmentTabs.length} แท็บ · ข้อมูลจะถูกใส่ในช่องตารางด้านบน</small></div>}
      {attachmentError && <p className="source-warning">{attachmentError}</p>}
      <button type="button" className="primary-button" disabled={props.saving} onClick={props.onSubmit}>{props.saving ? "กำลังสร้าง..." : "สร้าง Request และ Review Bundle"}</button>
      {props.error && <p className="hub-error">{props.error}</p>}
    </section>
  </section>;
}

function RequestRow({ request, pending, onStatus, onOpen }: { request: HubRequest; pending: boolean; onStatus: (id: string, status: RequestStatus) => Promise<void>; onOpen: (id: string) => Promise<void> }) {
  const detail = request.webshop_type === "RANDOM" ? "Random · " + (request.fixed_rewards ? "มี Fixed" : "Auto Fixed GSP + EXP") : request.webshop_type === "NORMAL" ? "Normal Bundle" : String(request.payload.code_kind || "Code");
  return <article className="request-row">
    <div className="request-id"><b>{request.request_type === "WEB_SHOP" ? "Web Shop" : "Item Code"}</b><span>{request.id}</span></div>
    <div className="request-title"><strong>{request.title}</strong><span>{detail}{request.attachments?.length ? " · " + request.attachments.length + " files" : ""}</span><RequestArtifacts request={request} /></div>
    <div className={"request-status status-" + request.status.toLowerCase()}>{labels[request.status] || "งานใหม่"}</div>
    <time>{new Date(request.updated_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</time>
    <select disabled={pending} aria-label={"สถานะ " + request.title} value={request.status} onChange={(event) => void onStatus(request.id, event.target.value as RequestStatus)}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
    <button type="button" className="quiet-button" onClick={() => void onOpen(request.id)}>เปิดใน Adapter</button>
  </article>;
}

function DecisionCard({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) {
  return <button type="button" className={"decision-card " + (active ? "selected" : "")} onClick={onClick}><span className="source-radio" /><b>{title}</b><small>{detail}</small></button>;
}

function RequestArtifacts({ request }: { request: HubRequest }) {
  const [downloadError, setDownloadError] = useState("");
  const exports = Array.isArray(request.payload.exports) ? request.payload.exports.filter((item): item is { id: string; filename: string; type: string } => Boolean(item && typeof item === "object" && "id" in item && "filename" in item)) : [];
  return <details className="request-artifacts"><summary>ประวัติและไฟล์ ({exports.length})</summary>
    <p>Discord: {({ SENT: "แจ้งแล้ว", FAILED: "แจ้งไม่สำเร็จ", PENDING: "รอแจ้ง", NOT_CONFIGURED: "ยังไม่ได้ตั้งค่า Webhook", LOCAL_ONLY: "งานในเครื่อง ยังไม่ได้แจ้ง" } as Record<string, string>)[request.notification_status] || "ยังไม่มีข้อมูล"}</p>
    {exports.map((artifact) => <button type="button" className="quiet-button" key={artifact.id} onClick={() => { setDownloadError(""); void downloadApiFile(API + "/requests/" + encodeURIComponent(request.id) + "/exports/" + encodeURIComponent(artifact.id), artifact.filename).catch(error => setDownloadError(error.message)); }}>{artifact.type === "PRODUCT_IMPORT" ? "Product" : "Bundle"}: {artifact.filename}</button>)}
    {downloadError && <p role="alert">{downloadError}</p>}
    <ol>{(request.history || []).map((event, index) => <li key={index}><time>{new Date(event.at).toLocaleString("th-TH")}</time>{" · "}{event.type === "EXPORTED" ? "Export " + event.filename : event.type === "CREATED" ? "สร้าง Request" : `${event.from ? labels[event.from] || event.from : ""} → ${event.to ? labels[event.to] || event.to : ""}`}</li>)}</ol>
    {!request.history?.length && <p>ยังไม่มีประวัติการเปลี่ยนสถานะที่บันทึกไว้</p>}
  </details>;
}

function readAttachment(file: File): Promise<{ name: string; type: string; data_url: string }> {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) return reject(new Error(file.name + " มีขนาดเกิน 8 MB"));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, data_url: String(reader.result || "") });
    reader.onerror = () => reject(new Error("อ่านไฟล์ " + file.name + " ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function readLocalRequests(): HubRequest[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(localKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocalRequests(requests: HubRequest[]) {
  window.localStorage.setItem(localKey, JSON.stringify(requests));
}

function offlineRequest(payload: Record<string, unknown>): HubRequest {
  const now = new Date().toISOString();
  return {
    id: "LOCAL-" + Date.now().toString(36).toUpperCase(),
    title: String(payload.title),
    request_type: payload.request_type as RequestType,
    webshop_type: payload.webshop_type as WebshopType | null,
    fixed_rewards: Boolean(payload.fixed_rewards),
    status: "NEW",
    requester: String(payload.requester || "GP"),
    created_at: now,
    updated_at: now,
    notification_status: "LOCAL_ONLY",
    source_text: String(payload.source_text || ""),
    attachments: (payload.attachments as HubRequest["attachments"]) || [],
    payload: (payload.payload as Record<string, unknown>) || {},
  };
}
