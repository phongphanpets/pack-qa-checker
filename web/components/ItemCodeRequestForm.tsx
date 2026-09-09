"use client";
import { apiFetch } from "@/lib/api-client";

import { useMemo, useState } from "react";

import { parseExcelPaste } from "@/lib/excel-paste";
import { readSpreadsheetTabs, sourceTextFromAttachments } from "@/lib/spreadsheet-upload";

type SheetTab = { name: string; text: string };
type Props = { onBack: () => void; onOpenAdapter: () => void };

const API = "/api";
const localKey = "bundle-import-local-requests-v1";
const conditions = [
  "Create Account After or Equal",
  "Create Account Before or Equal",
  "Create Account Between",
  "Create Game Account After or Equal",
  "Create Game Account Before or Equal",
  "Last Logged In After or Equal",
  "Last Logged In Before or Equal",
  "Logged In Between",
  "No Logged In Between",
];

export default function ItemCodeRequestForm({ onBack, onOpenAdapter }: Props) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"MASTER" | "UNIQUE">("MASTER");
  const [serial, setSerial] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [perUserLimit, setPerUserLimit] = useState("1");
  const [redeemLimit, setRedeemLimit] = useState("");
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [conditionChoice, setConditionChoice] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTabs, setSheetTabs] = useState<SheetTab[]>([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentTabs, setAttachmentTabs] = useState<SheetTab[]>([]);
  const [selectedAttachmentTab, setSelectedAttachmentTab] = useState("");
  const [loadingAttachment, setLoadingAttachment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const parsed = useMemo(() => parseExcelPaste(itemCodeBundleSource(sourceText, title)), [sourceText, title]);
  const summary = parsed.bundles.length ? {
    bundles: parsed.bundles.length,
    items: parsed.bundles.reduce((total, bundle) => total + bundle.items.length, 0),
  } : null;

  async function loadTabs() {
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
      setError(caught instanceof Error ? caught.message : "อ่าน Google Sheet ไม่สำเร็จ");
    } finally {
      setLoadingSheet(false);
    }
  }

  async function submit() {
    if (!title.trim()) return setError("กรอกชื่องานก่อนส่ง");
    for (const [label, value] of [["ใช้ได้ต่อ User", perUserLimit], ["จำนวนครั้งรวมของ Code", redeemLimit]]) {
      if (value.trim() && (!Number.isSafeInteger(Number(value)) || Number(value) < 1)) return setError(label + " ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป หรือเว้นว่าง");
    }
    setSaving(true);
    setError("");
    let payload: Record<string, unknown> | undefined;
    try {
      const importedFileText = sourceText.trim() ? "" : await sourceTextFromAttachments(attachments);
      const effectiveSourceText = itemCodeBundleSource(sourceText.trim() ? sourceText : importedFileText, title);
      const effectiveParsed = parseExcelPaste(effectiveSourceText);
      const effectiveSummary = effectiveParsed.bundles.length ? {
        bundles: effectiveParsed.bundles.length,
        items: effectiveParsed.bundles.reduce((total, bundle) => total + bundle.items.length, 0),
      } : null;
      payload = {
        title,
        request_type: "ITEM_CODE",
        webshop_type: null,
        fixed_rewards: false,
        requester: "GP",
        source_text: effectiveSourceText,
        attachments: await Promise.all(attachments.map(readAttachment)),
        payload: {
          code_kind: kind,
          code_serial: serial || null,
          start_at: startAt || null,
          end_at: endAt || null,
          per_user_limit: perUserLimit || null,
          redeem_limit: redeemLimit || null,
          conditions: selectedConditions,
          condition_operator: "AND",
          source_sheet: sheetTabs.length && selectedTab ? { url: sheetUrl, tab: selectedTab } : null,
          processing: effectiveSummary ? {
            state: effectiveParsed.valid ? "READY_FOR_REVIEW" : "AWAITING_SOURCE",
            ...effectiveSummary,
            warnings: effectiveParsed.warnings.map((warning) => warning.message),
          } : { state: "AWAITING_SOURCE", warnings: effectiveParsed.warnings.map((warning) => warning.message) },
        },
      };
      const response = await apiFetch(API + "/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "สร้าง Request ไม่สำเร็จ");
      finish(body.request);
    } catch (caught) {
      if (!(caught instanceof TypeError)) {
        setError(caught instanceof Error ? caught.message : "สร้าง Request ไม่สำเร็จ");
        setSaving(false);
        return;
      }
      const now = new Date().toISOString();
      const request = {
        ...payload,
        id: "LOCAL-" + Date.now().toString(36).toUpperCase(),
        status: summary ? "REVIEW" : "NEW",
        created_at: now,
        updated_at: now,
        notification_status: "LOCAL_ONLY",
      };
      const current = JSON.parse(window.localStorage.getItem(localKey) || "[]");
      window.localStorage.setItem(localKey, JSON.stringify([request, ...(Array.isArray(current) ? current : [])]));
      finish(request);
    }
  }

  async function chooseAttachments(files: File[]) {
    setAttachments(files);
    setAttachmentTabs([]);
    setSelectedAttachmentTab("");
    const spreadsheet = files.find((file) => /\.(xlsx|csv|txt|md)$/i.test(file.name));
    if (!spreadsheet) return;
    setLoadingAttachment(true);
    setError("");
    try {
      const tabs = await readSpreadsheetTabs(spreadsheet);
      setAttachmentTabs(tabs);
      setSelectedAttachmentTab(tabs[0]?.name || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "อ่านไฟล์ Spreadsheet ไม่สำเร็จ");
    } finally {
      setLoadingAttachment(false);
    }
  }

  function useAttachmentTab() {
    const tab = attachmentTabs.find((item) => item.name === selectedAttachmentTab);
    if (tab) setSourceText(tab.text);
  }

  function finish(request: { id?: string; title?: string; source_text?: string }) {
    const sourceForAdapter = itemCodeBundleSource(request.source_text || sourceText, request.title || title);
    window.localStorage.setItem("bundle-import-request-source", sourceForAdapter);
    window.localStorage.setItem("bundle-import-request", JSON.stringify({
      ...request,
      source_text: sourceForAdapter,
      request_type: "ITEM_CODE",
      payload: {
        code_kind: kind,
        code_serial: serial || null,
        start_at: startAt || null,
        end_at: endAt || null,
        per_user_limit: perUserLimit || null,
        redeem_limit: redeemLimit || null,
        conditions: selectedConditions,
        condition_operator: "AND",
      },
    }));
    window.localStorage.setItem("bundle-import-request-title", request.title || title);
    setSuccess("สร้าง Request แล้ว กำลังเปิด Adapter เพื่อ Review Bundle");
    setSaving(false);
    onOpenAdapter();
  }

  return <main className="hub-shell">
    <header className="hub-header"><div className="adapter-brand"><span className="adapter-mark">BI</span><div><strong>Bundle Import</strong><span>Request Hub</span></div></div></header>
    <section className="hub-content request-create">
      <button type="button" className="back-link" onClick={onBack}>← กลับไป Request Hub</button>
      <p className="eyebrow">New request</p>
      <h1>สร้างงาน Item Code</h1>
      <p className="form-lead">กรอกข้อมูล Code และรางวัลครั้งเดียว ระบบจะเก็บเงื่อนไขเป็น AND แล้วส่งรายการรางวัลไปตรวจและ Export เป็น Bundle Import</p>
      <section className="request-form-card">
        <label><span>ชื่องาน / ชื่อ Bundle</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น Streamer itemcode 6/9 #1" /></label>
        <fieldset><legend>ประเภท Code</legend><div className="decision-cards compact">
          <Choice active={kind === "MASTER"} title="Master Code" detail="ทุกคนใช้ Code เดียวกัน" onClick={() => setKind("MASTER")} />
          <Choice active={kind === "UNIQUE"} title="Unique Code" detail="ใช้ Code แยกต่อผู้ใช้" onClick={() => setKind("UNIQUE")} />
        </div></fieldset>
        <div className="request-fields">
          <Field label="Code Serial" value={serial} onChange={setSerial} placeholder="เว้นว่างได้หากยังไม่กำหนด Code" />
          <Field label="ใช้ได้ต่อ User" value={perUserLimit} onChange={setPerUserLimit} placeholder="1" />
          <Field label="เริ่มใช้งาน" value={startAt} onChange={setStartAt} placeholder="เช่น 6 Sep 18.30 น." />
          <Field label="หมดอายุ" value={endAt} onChange={setEndAt} placeholder="เช่น 9 Sep 12.00 น." />
          <Field label="จำนวนครั้งรวมของ Code" value={redeemLimit} onChange={setRedeemLimit} placeholder="เช่น 420" />
        </div>
        <fieldset><legend>เงื่อนไขการใช้ Code <small>ทุกข้อเป็น AND</small></legend>
          <div className="condition-row"><select value={conditionChoice} onChange={(event) => setConditionChoice(event.target.value)}>
            <option value="">เลือกเงื่อนไข</option>
            {conditions.filter((condition) => !selectedConditions.includes(condition)).map((condition) => <option value={condition} key={condition}>{condition}</option>)}
          </select><button type="button" className="secondary-button" onClick={() => {
            if (conditionChoice) {
              setSelectedConditions((current) => [...current, conditionChoice]);
              setConditionChoice("");
            }
          }}>เพิ่มเงื่อนไข</button></div>
          {selectedConditions.length > 0 && <div className="condition-chips">{selectedConditions.map((condition) => <button type="button" key={condition} onClick={() => setSelectedConditions((current) => current.filter((item) => item !== condition))}>{condition} <span>×</span></button>)}</div>}
        </fieldset>
        <section className="sheet-source"><div><b>ดึงจาก Google Sheet</b><span>วางลิงก์ครั้งเดียว แล้วเลือกแท็บที่จะใช้</span></div>
          <div className="sheet-url-row"><input value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." /><button type="button" className="quiet-button" disabled={loadingSheet} onClick={() => void loadTabs()}>{loadingSheet ? "กำลังอ่าน..." : "อ่านแท็บ"}</button></div>
          {sheetTabs.length > 0 && <div className="sheet-tab-row"><select value={selectedTab} onChange={(event) => setSelectedTab(event.target.value)}>{sheetTabs.map((tab) => <option value={tab.name} key={tab.name}>{tab.name}</option>)}</select><button type="button" className="secondary-button" onClick={() => { const tab = sheetTabs.find((item) => item.name === selectedTab); if (tab) setSourceText(tab.text); }}>ใช้แท็บนี้</button></div>}
        </section>
        <label><span>ตาราง Item หรือรายละเอียดเพิ่มเติม</span><textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="วางตาราง Item ID, Item Name และ Amt ได้เลย" /></label>
        {summary && <div className="processing-summary"><div><b>อ่านตารางได้แล้ว</b><span>{summary.bundles} Bundles · {summary.items} Items พร้อมตรวจต่อ</span></div></div>}
        {parsed.warnings.filter(warning => warning.code === "INVALID_ITEM" || warning.code === "UNSUPPORTED_LAYOUT").map((warning, index) => <p className="source-warning" key={index}>{warning.message}</p>)}
        <label><span>ไฟล์ประกอบ</span><input type="file" multiple accept=".xlsx,.xls,.csv,.txt,.md,image/*" onChange={(event) => void chooseAttachments(Array.from(event.target.files || []))} /><small>{attachments.length ? attachments.map((file) => file.name).join(", ") : "แนบ Excel, CSV, Text หรือภาพ Request ได้"}</small></label>
        {attachmentTabs.length > 0 && <div className="sheet-tab-row"><select aria-label="เลือกแท็บจากไฟล์ประกอบ" value={selectedAttachmentTab} onChange={(event) => setSelectedAttachmentTab(event.target.value)}>{attachmentTabs.map((tab) => <option value={tab.name} key={tab.name}>{tab.name}</option>)}</select><button type="button" className="secondary-button" onClick={useAttachmentTab}>{loadingAttachment ? "กำลังอ่าน..." : "ใช้แท็บนี้"}</button><small>{attachmentTabs.length} แท็บ · ข้อมูลจะถูกใส่ในช่องตารางด้านบน</small></div>}
        <button type="button" className="primary-button" disabled={saving || Boolean(success)} onClick={() => void submit()}>{saving ? "กำลังสร้าง..." : success ? "กำลังเปิด Adapter..." : "สร้าง Request และ Review Bundle"}</button>
        {success && <p className="request-success">{success}</p>}
        {error && <p className="hub-error">{error}</p>}
      </section>
    </section>
  </main>;
}

function Choice({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) {
  return <button type="button" className={"decision-card " + (active ? "selected" : "")} onClick={onClick}><span className="source-radio" /><b>{title}</b><small>{detail}</small></button>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
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

function itemCodeBundleSource(source: string, bundleName: string) {
  if (/\b(?:bundle|product|pack|package)\s*name\b|ชื่อ(?:แพ็ก|บันเดิ้ล)/i.test(source)) return source;
  return "Bundle Name\t" + bundleName + "\n" + source;
}
