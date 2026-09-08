"use client";
import { apiFetch } from "@/lib/api-client";

import { useEffect, useMemo, useState } from "react";

import {
  parseItemCatalog,
  validateCatalogItems,
  type CatalogItem,
} from "@/lib/item-catalog";
import type { SpecBundle } from "@/lib/website-ocr";

const storageKey = "pack-qa-item-catalog-v1";
type SheetTab = { name: string; text: string };

export default function ItemCatalogCheck({ bundles, onCatalogChange }: { bundles: SpecBundle[]; onCatalogChange?: (catalog: CatalogItem[]) => void }) {
  const [catalogText, setCatalogText] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [open, setOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTabs, setSheetTabs] = useState<SheetTab[]>([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    setCatalogText(stored);
    const parsed = parseItemCatalog(stored);
    setCatalog(parsed);
    onCatalogChange?.(parsed);
  }, []);

  const validation = useMemo(
    () => validateCatalogItems(bundles, catalog),
    [bundles, catalog],
  );

  function applyCatalog() {
    const next = parseItemCatalog(catalogText);
    setCatalog(next);
    onCatalogChange?.(next);
    window.localStorage.setItem(storageKey, catalogText);
    setOpen(false);
  }

  function clearCatalog() {
    setCatalogText("");
    setCatalog([]);
    onCatalogChange?.([]);
    window.localStorage.removeItem(storageKey);
  }

  async function loadSheetTabs() {
    if (!sheetUrl.trim()) { setSheetError("วางลิงก์ Google Sheet ก่อน"); return; }
    setLoadingSheet(true); setSheetError("");
    try {
      const response = await apiFetch(`/api/google-sheets?url=${encodeURIComponent(sheetUrl)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "อ่าน Google Sheet ไม่สำเร็จ");
      setSheetTabs(body.tabs || []);
      setSelectedTab(body.tabs?.[0]?.name || "");
    } catch (error) { setSheetError(error instanceof Error ? error.message : "อ่าน Google Sheet ไม่สำเร็จ"); }
    finally { setLoadingSheet(false); }
  }

  function useSheetTab() {
    const tab = sheetTabs.find((item) => item.name === selectedTab);
    if (!tab) return;
    setCatalogText(tab.text);
    const next = parseItemCatalog(tab.text);
    setCatalog(next);
    onCatalogChange?.(next);
    window.localStorage.setItem(storageKey, tab.text);
    setSheetError(next.length ? "" : "แท็บนี้ไม่พบหัวตาราง Item ID");
    if (next.length) setOpen(false);
  }

  if (!bundles.length) return null;

  return (
    <section className={`catalog-check ${catalog.length ? "ready" : "setup"}`}>
      <div className="catalog-check-heading">
        <div>
          <strong>ตรวจข้อมูลไอเทม</strong>
          <span>{catalog.length ? `อ้างอิง Data กลาง ${catalog.length.toLocaleString()} รายการ` : "ยังไม่ได้เชื่อม Data กลาง"}</span>
        </div>
        <button type="button" onClick={() => setOpen((current) => !current)}>{open ? "ปิด" : catalog.length ? "อัปเดต Data" : "เพิ่ม Data"}</button>
      </div>

      {open && (
        <div className="catalog-import">
          <p>เชื่อม Google Sheet เพื่อเลือกแท็บ Data กลาง หรือวางข้อมูลด้วยมือได้</p>
          <div className="catalog-sheet-source"><input value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." /><button type="button" onClick={() => void loadSheetTabs()} disabled={loadingSheet}>{loadingSheet ? "กำลังอ่าน..." : "อ่านแท็บ"}</button></div>
          {sheetTabs.length > 0 && <div className="catalog-sheet-tabs"><select value={selectedTab} onChange={(event) => setSelectedTab(event.target.value)}>{sheetTabs.map((tab) => <option value={tab.name} key={tab.name}>{tab.name}</option>)}</select><button type="button" onClick={useSheetTab}>ใช้ Data แท็บนี้</button></div>}
          {sheetError && <p className="catalog-sheet-error">{sheetError}</p>}
          <textarea aria-label="วางข้อมูล Item Master จาก Google Sheet" value={catalogText} onChange={(event) => setCatalogText(event.target.value)} placeholder={"Image\tItem ID\tCDN URL\tItem TH\tItem EN\t...\tGrade"} spellCheck={false} />
          <div>
            <button type="button" onClick={applyCatalog}>บันทึกและตรวจ</button>
            {catalog.length > 0 && <button type="button" className="quiet" onClick={clearCatalog}>ลบ Data ในเครื่อง</button>}
          </div>
        </div>
      )}

      {catalog.length > 0 && (
        <div className="catalog-summary">
          <span className={validation.missing.length ? "bad" : "good"}>{validation.missing.length ? `ไม่พบ ${validation.missing.length} Item` : `พบครบ ${validation.checked} Item`}</span>
          {validation.nameMismatches.length > 0 && <span className="warn">ชื่อไม่ตรง {validation.nameMismatches.length}</span>}
          {validation.mapped.length > 0 && <span>แปลง Currency {validation.mapped.length}</span>}
        </div>
      )}

      {catalog.length > 0 && (validation.missing.length > 0 || validation.nameMismatches.length > 0) && (
        <details className="catalog-details" open>
          <summary>ดูรายการที่ต้องแก้</summary>
          {validation.missing.map((item, index) => <p className="catalog-missing" key={`${item.id}-${index}`}><code>{item.id}</code><span>{item.name || "ไม่มีชื่อ"}</span><b>ไม่พบใน Data กลาง</b></p>)}
          {validation.nameMismatches.map((item, index) => <p className="catalog-mismatch" key={`${item.id}-${index}`}><code>{item.id}</code><span>{item.requestName}</span><b>Data กลาง: {item.catalogName}</b></p>)}
        </details>
      )}
    </section>
  );
}
