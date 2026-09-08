"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { prepareBundleRows } from "@/lib/bundle-export-rows.mjs";

import ItemCatalogCheck from "@/components/ItemCatalogCheck";
import ProductExportPanel from "@/components/ProductExportPanel";
import RequestHub from "@/components/RequestHub";
import { parseExcelPaste, type ExcelPasteResult } from "@/lib/excel-paste";
import type { CatalogItem } from "@/lib/item-catalog";
import { readSpreadsheetTabs, type SpreadsheetTab } from "@/lib/spreadsheet-upload";
import type { SpecBundle } from "@/lib/website-ocr";

type SourceMode = "paste" | "manual" | "sheet";
type ManualItem = { key: number; itemId: string; name: string; amount: string; tier: string; chance: string };
type AutoRewards = { title: string; seedPoint: number; playerExp: number; purchaseLimit: number | null };

const emptyItem = (key: number): ManualItem => ({ key, itemId: "", name: "", amount: "1", tier: "Trainee", chance: "" });

function applyBareBundleName(result: ExcelPasteResult, value: string): ExcelPasteResult {
  const name = value.trim();
  if (!name || !result.bundles.some((bundle) => bundle.name === "Untitled Bundle")) return result;
  return {
    ...result,
    bundles: result.bundles.map((bundle) => bundle.name === "Untitled Bundle" ? { ...bundle, name } : bundle),
    summary: result.summary.name === "Untitled Bundle" ? { ...result.summary, name } : result.summary,
  };
}

function numberOrNull(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
}

function manualBundles(name: string, price: string, limit: string, items: ManualItem[]): SpecBundle[] {
  const usable = items.filter((item) => item.itemId.trim() && item.name.trim() && numberOrNull(item.amount) !== null);
  if (!name.trim() || !usable.length) return [];
  const fixedItems = usable.filter((item) => numberOrNull(item.chance) === null);
  const randomItems = usable.filter((item) => numberOrNull(item.chance) !== null);
  const base = { bundle_id: 0, seed_point: numberOrNull(price), gsp_earn: numberOrNull(price), purchase_limit: numberOrNull(limit), is_permanent: false };
  const mapItems = (source: ManualItem[]) => source.map((item) => ({
    item_id: item.itemId.trim(),
    name: item.name.trim(),
    amount: numberOrNull(item.amount) || 1,
    chance: numberOrNull(item.chance),
  }));
  if (!randomItems.length) return [{ ...base, name: name.trim(), is_gacha: false, items: mapItems(fixedItems) }];
  if (!fixedItems.length) return [{ ...base, name: name.trim() + " - Random", is_gacha: true, items: mapItems(randomItems) }];
  return [
    { ...base, name: name.trim() + " - Fixed", is_gacha: false, items: mapItems(fixedItems) },
    { ...base, name: name.trim() + " - Random", is_gacha: true, items: mapItems(randomItems) },
  ];
}

function expandParsedBundles(source: SpecBundle[]): SpecBundle[] {
  return source.flatMap((bundle) => {
    const fixedItems = bundle.items.filter((item) => item.chance == null);
    const randomItems = bundle.items.filter((item) => item.chance != null);
    const rewards = [
      bundle.gsp_earn !== null && bundle.gsp_earn !== undefined && !bundle.items.some((item) => item.item_id?.toLowerCase() === "gsp")
        ? { item_id: "GSP", name: "Golden Seed Point", amount: bundle.gsp_earn, chance: null }
        : null,
      bundle.player_exp !== null && bundle.player_exp !== undefined && !bundle.items.some((item) => item.item_id?.toLowerCase() === "player_exp")
        ? { item_id: "PLAYER_EXP", name: "Player EXP", amount: bundle.player_exp, chance: null }
        : null,
    ].filter((item): item is { item_id: string; name: string; amount: number; chance: null } => item !== null);
    const withBase = (name: string, items: typeof bundle.items, isGacha: boolean): SpecBundle => ({ ...bundle, name, is_gacha: isGacha, items });
    if (!randomItems.length) return [withBase(bundle.name || "Bundle", [...fixedItems, ...rewards], false)];
    return [
      ...((fixedItems.length || rewards.length) ? [withBase((bundle.name || "Bundle") + " - Fixed", [...fixedItems, ...rewards], false)] : []),
      withBase((bundle.name || "Bundle") + " - Random", randomItems, true),
    ];
  });
}

function ItemCodeContext({ details }: { details: Record<string, unknown> }) {
  const conditions = Array.isArray(details.conditions) ? details.conditions.filter((value): value is string => typeof value === "string") : [];
  const fields = [
    ["ประเภท", details.code_kind],
    ["Code Serial", details.code_serial],
    ["เริ่มใช้งาน", details.start_at],
    ["หมดอายุ", details.end_at],
    ["ใช้ได้ต่อ User", details.per_user_limit],
    ["จำนวนครั้งรวม", details.redeem_limit],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  return <section className="item-code-context">
    <div><p className="eyebrow">Item Code request</p><h2>รายละเอียด Code ที่บันทึกไว้</h2></div>
    <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>
    <p>{conditions.length ? "เงื่อนไข (AND): " + conditions.join(" · ") : "ไม่มีเงื่อนไขเพิ่มเติม"}</p>
  </section>;
}

export default function ImportAdapterWorkspace() {
  const [screen, setScreen] = useState<"hub" | "adapter">("hub");
  const [sourceMode, setSourceMode] = useState<SourceMode>("paste");
  const [pasteValue, setPasteValue] = useState("");
  const [exportName, setExportName] = useState("bundle-import");
  const [bareBundleName, setBareBundleName] = useState("");
  const [bundleName, setBundleName] = useState("");
  const [price, setPrice] = useState("");
  const [limit, setLimit] = useState("");
  const [items, setItems] = useState<ManualItem[]>([emptyItem(1)]);
  const [nextItemKey, setNextItemKey] = useState(2);
  const [locked, setLocked] = useState<Set<number>>(new Set());
  const [sheetFileName, setSheetFileName] = useState("");
  const [sheetTabs, setSheetTabs] = useState<SpreadsheetTab[]>([]);
  const [selectedSheetTab, setSelectedSheetTab] = useState("");
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [autoRewards, setAutoRewards] = useState<AutoRewards | null>(null);
  const [requestId, setRequestId] = useState("");
  const [requestType, setRequestType] = useState<"WEB_SHOP" | "ITEM_CODE" | null>(null);
  const [itemCodeDetails, setItemCodeDetails] = useState<Record<string, unknown> | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [mirrorChance, setMirrorChance] = useState(true);

  const rawParsedPaste = useMemo<ExcelPasteResult>(() => parseExcelPaste(pasteValue), [pasteValue]);
  const parsedPaste = useMemo<ExcelPasteResult>(() => applyBareBundleName(rawParsedPaste, bareBundleName), [rawParsedPaste, bareBundleName]);
  const selectedSheetText = sheetTabs.find((tab) => tab.name === selectedSheetTab)?.text || "";
  const rawParsedSheet = useMemo<ExcelPasteResult>(() => parseExcelPaste(selectedSheetText), [selectedSheetText]);
  const parsedSheet = useMemo<ExcelPasteResult>(() => applyBareBundleName(rawParsedSheet, bareBundleName), [rawParsedSheet, bareBundleName]);
  const manual = useMemo(() => manualBundles(bundleName, price, limit, items), [bundleName, price, limit, items]);
  const autoFixedBundle = useMemo<SpecBundle | null>(() => autoRewards ? {
    bundle_id: -1,
    name: autoRewards.title + " - Fixed",
    seed_point: autoRewards.seedPoint,
    gsp_earn: autoRewards.seedPoint,
    purchase_limit: autoRewards.purchaseLimit,
    is_gacha: false,
    is_permanent: false,
    items: [
      { item_id: "GSP", name: "Golden Seed Point", amount: autoRewards.seedPoint, chance: null },
      { item_id: "PLAYER_EXP", name: "Player EXP", amount: autoRewards.playerExp, chance: null },
    ],
  } : null, [autoRewards]);
  const sourceResult = sourceMode === "paste" ? parsedPaste : sourceMode === "manual" ? null : parsedSheet;
  const parsedBundles = sourceMode === "paste" ? parsedPaste.bundles : sourceMode === "manual" ? manual : parsedSheet.bundles;
  const bundles = autoFixedBundle ? [autoFixedBundle, ...parsedBundles] : sourceMode === "manual" ? parsedBundles : expandParsedBundles(parsedBundles);
  const lockedCount = [...locked].filter((index) => index < bundles.length).length;
  const selectedCount = lockedCount || bundles.length;
  const exportReview = prepareBundleRows(bundles.filter((_, index) => lockedCount === 0 || locked.has(index)), { catalog, mirrorChance });

  useEffect(() => {
    if (screen !== "adapter") return;
    const source = window.localStorage.getItem("bundle-import-request-source") || "";
    const rawRequest = window.localStorage.getItem("bundle-import-request");
    try {
      const request = rawRequest ? JSON.parse(rawRequest) : null;
      setRequestId(String(request?.id || ""));
      setRequestType(request?.request_type === "ITEM_CODE" ? "ITEM_CODE" : request ? "WEB_SHOP" : null);
      setItemCodeDetails(request?.request_type === "ITEM_CODE" && request?.payload ? request.payload : null);
      const rewards = request?.payload?.auto_rewards;
      if (rewards && rewards.golden_seed_point != null && rewards.player_exp != null) {
        setAutoRewards({
          title: request.title || "Product",
          seedPoint: Number(rewards.golden_seed_point),
          playerExp: Number(rewards.player_exp),
          purchaseLimit: request?.payload?.purchase_limit === null ? null : Number(request?.payload?.purchase_limit),
        });
        setBundleName(request.title || "");
        setPrice(String(rewards.golden_seed_point));
        setLimit(String(request?.payload?.purchase_limit ?? 1));
      } else {
        setAutoRewards(null);
      }
      if (request?.title) {
        setExportName(request.title);
        setBareBundleName(request.title);
      }
    } catch {
      setAutoRewards(null);
      setRequestId("");
      setRequestType(null);
      setItemCodeDetails(null);
    }
    if (!source) return;
    setSourceMode("paste");
    setPasteValue(source);
    window.localStorage.removeItem("bundle-import-request-source");
    window.localStorage.removeItem("bundle-import-request");
  }, [screen]);

  async function chooseSpreadsheet(file: File | null) {
    if (!file) return;
    setLoadingSheet(true);
    setSheetError("");
    setSheetFileName(file.name);
    setSheetTabs([]);
    setSelectedSheetTab("");
    setLocked(new Set());
    try {
      const tabs = await readSpreadsheetTabs(file);
      setSheetTabs(tabs);
      setSelectedSheetTab(tabs[0]?.name || "");
    } catch (caught) {
      setSheetError(caught instanceof Error ? caught.message : "อ่านไฟล์ Spreadsheet ไม่สำเร็จ");
    } finally {
      setLoadingSheet(false);
    }
  }

  function startBundleOnly() {
    window.localStorage.removeItem("bundle-import-request-source");
    window.localStorage.removeItem("bundle-import-request");
    window.localStorage.removeItem("bundle-import-request-title");
    setSourceMode("paste");
    setPasteValue("");
    setExportName("bundle-import");
    setBareBundleName("");
    setBundleName("");
    setPrice("");
    setLimit("");
    setItems([emptyItem(1)]);
    setNextItemKey(2);
    setLocked(new Set());
    setSheetFileName("");
    setSheetTabs([]);
    setSelectedSheetTab("");
    setSheetError("");
    setAutoRewards(null);
    setRequestId("");
    setRequestType(null);
    setItemCodeDetails(null);
    setScreen("adapter");
  }

  function toggleLock(index: number) {
    setLocked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function patchItem(key: number, patch: Partial<ManualItem>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function downloadImport() {
    setExportError("");
    setExporting(true);
    try {
    const included = bundles.filter((_, index) => lockedCount === 0 || locked.has(index));
    const filename = safeFilename(exportName || bundleName || included[0]?.name || "bundle-import") + ".xlsx";
    const response = await apiFetch("/api/bundle-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundles: included, catalog, requestId, filename, mirrorChance }),
    });
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || "สร้างไฟล์จาก Bundle Import Template ไม่สำเร็จ"); }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export ไม่สำเร็จ");
    } finally { setExporting(false); }
  }

  if (screen === "hub") return <RequestHub onOpenAdapter={() => setScreen("adapter")} onStartBundleOnly={startBundleOnly} />;

  return <main className="adapter-shell">
    <header className="adapter-header">
      <div className="adapter-brand"><span className="adapter-mark">BI</span><div><strong>Bundle Import</strong><span>Import Studio</span></div></div>
      <div className="adapter-header-actions"><span className="adapter-status">Draft</span><button type="button" className="quiet-button" onClick={() => setScreen("hub")}>Request Hub</button></div>
    </header>
    <section className="adapter-intro">
      <div><p className="eyebrow">Create import batch</p><h1>แปลง Request ให้เป็น Bundle พร้อม Import</h1><p>เริ่มจากเลือกวิธีส่งข้อมูล ระบบจะแยก Bundle ตรวจ Item และจัดชุดงานให้ก่อนส่งออก</p></div>
      <div className="adapter-stats"><span><b>{bundles.length}</b> Bundles</span><span><b>{bundles.reduce((total, bundle) => total + bundle.items.length, 0)}</b> Items</span></div>
    </section>
    {requestType === "ITEM_CODE" && itemCodeDetails && <ItemCodeContext details={itemCodeDetails} />}
    <section className="source-panel">
      <div className="section-heading"><div><p className="eyebrow">Step 1</p><h2>เลือกแหล่งข้อมูล</h2></div><p>เลือกเพียงหนึ่งแบบก่อน ระบบจะเปิดช่องที่เกี่ยวข้องให้</p></div>
      <div className="source-options">
        <SourceOption active={sourceMode === "paste"} title="วางตารางจาก Request" detail="รองรับข้อมูลที่ก๊อบจาก Excel หรือ Google Sheet" onClick={() => setSourceMode("paste")} />
        <SourceOption active={sourceMode === "manual"} title="กรอกข้อมูลเอง" detail="เหมาะกับ Bundle ใหม่หรือรายการสั้น" onClick={() => setSourceMode("manual")} />
        <SourceOption active={sourceMode === "sheet"} title="แนบ Spreadsheet" detail="เลือกไฟล์และแท็บที่จะใช้ก่อน Preview" onClick={() => setSourceMode("sheet")} />
      </div>
    </section>
    <section className="adapter-layout">
      <div className="adapter-input">
        {sourceMode === "paste" && <PasteInput value={pasteValue} onChange={setPasteValue} parsed={parsedPaste} rawParsed={rawParsedPaste} bareBundleName={bareBundleName} onBareBundleName={(value) => { setBareBundleName(value); if (value.trim()) setExportName(value); }} />}
        {sourceMode === "manual" && <ManualInput bundleName={bundleName} price={price} limit={limit} items={items} onBundleName={setBundleName} onPrice={setPrice} onLimit={setLimit} onPatchItem={patchItem} onAddItem={() => { setItems((current) => [...current, emptyItem(nextItemKey)]); setNextItemKey((current) => current + 1); }} onDeleteItem={(key) => setItems((current) => current.length === 1 ? current : current.filter((item) => item.key !== key))} />}
        {sourceMode === "sheet" && <SpreadsheetInput fileName={sheetFileName} tabs={sheetTabs} selectedTab={selectedSheetTab} loading={loadingSheet} error={sheetError} parsed={parsedSheet} rawParsed={rawParsedSheet} bareBundleName={bareBundleName} onBareBundleName={(value) => { setBareBundleName(value); if (value.trim()) setExportName(value); }} onChoose={chooseSpreadsheet} onTabChange={(tab) => { setSelectedSheetTab(tab); setLocked(new Set()); }} />}
      </div>
      <aside className="adapter-preview">
        <div className="preview-heading"><div><p className="eyebrow">Step 2</p><h2>รายการก่อนล็อก</h2></div>{bundles.length > 1 && <button type="button" className="quiet-button" onClick={() => setLocked(new Set(bundles.map((_, index) => index)))}>ล็อกทั้งหมด</button>}</div>
        {!bundles.length ? <EmptyPreview mode={sourceMode} /> : <>
          <div className="preview-summary"><span>{selectedCount} รายการพร้อมส่งต่อ</span><span>{bundles.filter((bundle) => bundle.is_gacha).length} Random</span></div>
          <div className="bundle-preview-list">{bundles.map((bundle, index) => <BundlePreview bundle={bundle} index={index} locked={locked.has(index)} onToggle={() => toggleLock(index)} key={bundle.name + "-" + index} />)}</div>
          <label><input type="checkbox" checked={mirrorChance} onChange={event => setMirrorChance(event.target.checked)} /> Chance / Secret Chance เท่ากัน</label>
          {exportReview.errors.map((message, index) => <p className="hub-error" key={`error-${index}`}>{message}</p>)}
          {exportReview.warnings.map((message, index) => <p className="source-warning" key={`warning-${index}`}>{message}</p>)}
          <button type="button" className="primary-button" disabled={exporting || exportReview.errors.length > 0} onClick={() => void downloadImport()}>{exporting ? "กำลังสร้างไฟล์..." : `Export Import file (${selectedCount})`}</button>
          {exportError && <p className="hub-error" role="alert">{exportError}</p>}
          <p className="hint">สร้าง Excel ตาม Bundle Import format พร้อม Fixed, Random, Coin, GSP และ Player EXP</p>
        </>}
      </aside>
    </section>
    {bundles.length > 0 && requestType !== "ITEM_CODE" && <ProductExportPanel requestId={requestId} productName={exportName || bundleName} bundles={bundles} selectedIndexes={locked} fallbackPrice={price || String(bundles[0]?.seed_point ?? "")} fallbackLimit={limit || String(bundles[0]?.purchase_limit ?? "")} />}
    {bundles.length > 0 && <section className="adapter-validation"><div className="section-heading"><div><p className="eyebrow">Step 3</p><h2>ตรวจ Item ก่อน Export</h2></div><p>เทียบกับ Data กลางเพื่อลด Item ID หรือชื่อที่ไม่ตรง</p></div><ItemCatalogCheck bundles={bundles} onCatalogChange={setCatalog} /></section>}
  </main>;
}

function SourceOption({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) {
  return <button type="button" className={"source-option " + (active ? "selected" : "")} onClick={onClick}><span className="source-radio" aria-hidden="true" /><strong>{title}</strong><small>{detail}</small></button>;
}

function PasteInput({ value, onChange, parsed, rawParsed, bareBundleName, onBareBundleName }: { value: string; onChange: (value: string) => void; parsed: ExcelPasteResult; rawParsed: ExcelPasteResult; bareBundleName: string; onBareBundleName: (value: string) => void }) {
  return <section className="adapter-card"><h2>วางข้อมูลจาก Request</h2><p>ก๊อบตารางทั้งหมดจาก Excel, Google Sheet หรือข้อความใน Request แล้ววางได้เลย</p><BareBundleName parsed={rawParsed} value={bareBundleName} onChange={onBareBundleName} /><textarea className="request-textarea" value={value} onChange={(event) => onChange(event.target.value)} placeholder={"Item ID\tItem Name\tAmt\n4235100\tBelorb Stabilizer\t1"} spellCheck={false} />{value && <ParseStatus parsed={parsed} />}</section>;
}

function SpreadsheetInput({ fileName, tabs, selectedTab, loading, error, parsed, rawParsed, bareBundleName, onBareBundleName, onChoose, onTabChange }: { fileName: string; tabs: SpreadsheetTab[]; selectedTab: string; loading: boolean; error: string; parsed: ExcelPasteResult; rawParsed: ExcelPasteResult; bareBundleName: string; onBareBundleName: (value: string) => void; onChoose: (file: File | null) => void; onTabChange: (tab: string) => void }) {
  return <section className="adapter-card sheet-card"><h2>แนบ Spreadsheet</h2><p>เลือกไฟล์ แล้วเลือกว่าแท็บไหนคือ Request ที่ต้องการแปลง</p>
    <label className="file-drop"><input type="file" accept=".xlsx,.csv,.txt,.md" onChange={(event) => void onChoose(event.target.files?.[0] || null)} /><b>{loading ? "กำลังอ่านไฟล์..." : fileName || "เลือกไฟล์ Spreadsheet"}</b><span>รองรับ .xlsx, .csv, .txt และ .md</span></label>
    {error && <p className="source-warning">{error}</p>}
    {tabs.length > 0 && <div className="sheet-tab-row"><select aria-label="เลือกแท็บ Spreadsheet" value={selectedTab} onChange={(event) => onTabChange(event.target.value)}>{tabs.map((tab) => <option value={tab.name} key={tab.name}>{tab.name}</option>)}</select><small>{tabs.length} แท็บ · เลือกแท็บแล้วรายการจะปรากฏด้านขวา</small></div>}
    {tabs.length > 0 && <BareBundleName parsed={rawParsed} value={bareBundleName} onChange={onBareBundleName} />}
    {tabs.length > 0 && <ParseStatus parsed={parsed} />}
  </section>;
}

function BareBundleName({ parsed, value, onChange }: { parsed: ExcelPasteResult; value: string; onChange: (value: string) => void }) {
  const needsName = parsed.bundles.some((bundle) => bundle.name === "Untitled Bundle");
  return <label className="bare-bundle-name"><span>ชื่อ Bundle {needsName ? "*" : "(ถ้าตารางไม่มีชื่อ)"}</span><input aria-label="ชื่อ Bundle จากรายการ" value={value} onChange={(event) => onChange(event.target.value)} placeholder="เช่น EXP1-170" /><small>{needsName ? "ระบบอ่าน Item ID, Item Name และ Amt ได้แล้ว กรุณาตั้งชื่อก่อน Export" : "กรอกไว้ล่วงหน้าได้ หากวางตารางรายการที่ไม่มีชื่อ Bundle"}</small></label>;
}

function ParseStatus({ parsed }: { parsed: ExcelPasteResult }) {
  return <div className="parse-line"><span className={parsed.valid ? "success" : "warning"}>{parsed.valid ? "อ่านตารางได้" : "กำลังรอหัวตาราง Item ID, Item Name และ Amt"}</span>{parsed.warnings.map((warning) => <span key={warning.code}>{warning.message}</span>)}</div>;
}

function ManualInput(props: { bundleName: string; price: string; limit: string; items: ManualItem[]; onBundleName: (value: string) => void; onPrice: (value: string) => void; onLimit: (value: string) => void; onPatchItem: (key: number, patch: Partial<ManualItem>) => void; onAddItem: () => void; onDeleteItem: (key: number) => void }) {
  return <section className="adapter-card"><h2>รายละเอียด Bundle</h2><div className="field-grid"><Field label="ชื่อ Bundle" value={props.bundleName} onChange={props.onBundleName} placeholder="เช่น เสวเสาร์ : Lanistar" wide /><Field label="Seed Point" value={props.price} onChange={props.onPrice} placeholder="0" /><Field label="Purchase limit / Player" value={props.limit} onChange={props.onLimit} placeholder="1" /></div><div className="item-editor-heading"><div><h3>ไอเท็มใน Bundle</h3><span>Chance เว้นว่างได้สำหรับ Fixed</span></div><button type="button" className="quiet-button" onClick={props.onAddItem}>+ เพิ่มไอเท็ม</button></div><div className="manual-items">{props.items.map((item) => <div className="manual-item" key={item.key}><input aria-label="Item ID" value={item.itemId} onChange={(event) => props.onPatchItem(item.key, { itemId: event.target.value })} placeholder="Item ID" /><input aria-label="ชื่อไอเท็ม" value={item.name} onChange={(event) => props.onPatchItem(item.key, { name: event.target.value })} placeholder="ชื่อไอเท็ม" /><input aria-label="จำนวน" value={item.amount} onChange={(event) => props.onPatchItem(item.key, { amount: event.target.value })} placeholder="Amt" /><select aria-label="Tier" value={item.tier} onChange={(event) => props.onPatchItem(item.key, { tier: event.target.value })}><option>Trainee</option><option>Rare</option><option>Epic</option><option>Unique</option><option>Legendary</option></select><input aria-label="Chance" value={item.chance} onChange={(event) => props.onPatchItem(item.key, { chance: event.target.value })} placeholder="Chance" /><button type="button" className="delete-item" aria-label="ลบไอเท็ม" onClick={() => props.onDeleteItem(item.key)}>×</button></div>)}</div></section>;
}

function Field({ label, value, onChange, placeholder, wide = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; wide?: boolean }) {
  return <label className={wide ? "wide" : ""}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function EmptyPreview({ mode }: { mode: SourceMode }) {
  return <div className="empty-preview"><b>{mode === "paste" ? "วางตารางเพื่อเริ่มแปลง" : mode === "manual" ? "เพิ่มชื่อและไอเท็มอย่างน้อยหนึ่งรายการ" : "เลือกไฟล์และแท็บ Spreadsheet"}</b><span>รายการ Bundle ที่ระบบอ่านได้จะแสดงตรงนี้ก่อนล็อก</span></div>;
}

function safeFilename(value: string) {
  return value.trim().replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").slice(0, 100) || "bundle-import";
}

function BundlePreview({ bundle, index, locked, onToggle }: { bundle: SpecBundle; index: number; locked: boolean; onToggle: () => void }) {
  const chanceTotal = bundle.is_gacha ? bundle.items.reduce((total, item) => total + (item.chance || 0), 0) : null;
  return <article className={"bundle-preview " + (locked ? "locked" : "")}>
    <div className="bundle-preview-top"><label><input type="checkbox" checked={locked} onChange={onToggle} /><span>{locked ? "ล็อกแล้ว" : "เลือกส่งออก"}</span></label><span className={bundle.is_gacha ? "random-tag" : "fixed-tag"}>{bundle.is_gacha ? "Random" : "Fixed"}</span></div>
    <h3>{bundle.name || "Bundle " + (index + 1)}</h3>
    <div className="bundle-meta"><span>Seed {bundle.seed_point ?? "-"}</span><span>Limit {bundle.purchase_limit ?? "-"}</span><span>{bundle.items.length} items</span>{chanceTotal !== null && <span>Chance {chanceTotal}%</span>}</div>
    <ul>{bundle.items.slice(0, 4).map((item, itemIndex) => <li key={item.item_id + "-" + itemIndex}><code>{item.item_id}</code><span>{item.name}</span><b>×{item.amount}</b></li>)}{bundle.items.length > 4 && <li className="more-items">และอีก {bundle.items.length - 4} รายการ</li>}</ul>
  </article>;
}
