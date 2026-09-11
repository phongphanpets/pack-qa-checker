"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { localProductExport } from "@/lib/local-template-export";
import { isGoogleScript, saveGoogleExport } from "@/lib/google-script-client";

import type { SpecBundle } from "@/lib/website-ocr";

type Props = { requestId: string; productName: string; bundles: SpecBundle[]; selectedIndexes: Set<number>; fallbackPrice: string; fallbackLimit: string };

function dateValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16).replace("T", " ");
}

function endOfYear() { return `${new Date().getFullYear()}-12-31 23:59`; }
function safeFilename(value: string) { return value.trim().replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").slice(0, 100) || "product-import"; }

const categories = [
  "Savior Shop - [ Savior Shop ]",
  "Step up Shop - [ STEP GOD GACHA #1: Penguin Queen Austeja ]",
  "Step up Shop - [ STEP GOD GACHA #2: GOD COIN DC UPTO 70% ]",
  "Step up Shop - [ Fellow ]",
  "Step up Shop - [ God ]",
  "Step up Shop - [ Kupole ]",
  "Gacha rate up - Coin - [ God Coin ]",
  "Gacha rate up - Coin - [ Fellow Coin ]",
  "Gacha rate up - Coin - [ Kupole Coin ]",
  "Rank Shop - GSP",
  "Rank Shop - Monthly",
  "Starlight Station Shop - [ Battery Shop ]",
  "TOSM - Ayothaya - [ Free ]",
  "TOSM - Ayothaya - [ Paid ]",
  "TOSM - Ayothaya [Little Red Riding Hood] - [ Free ]",
  "TOSM - Ayothaya [Little Red Riding Hood] - [ Paid ]",
];

export default function ProductExportPanel({ requestId, productName, bundles, selectedIndexes, fallbackPrice, fallbackLimit }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(productName);
  const [category, setCategory] = useState("");
  const [displayOrder, setDisplayOrder] = useState("500");
  const [saleStart, setSaleStart] = useState(() => dateValue(new Date()));
  const [saleEnd, setSaleEnd] = useState(endOfYear);
  const [purchaseLimit, setPurchaseLimit] = useState(fallbackLimit || "1");
  const [currency, setCurrency] = useState("Seed Point");
  const [actualPrice, setActualPrice] = useState(fallbackPrice);
  const [fullPrice, setFullPrice] = useState(fallbackPrice);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const selectedBundles = useMemo(() => bundles.filter((_, index) => selectedIndexes.size === 0 || selectedIndexes.has(index)), [bundles, selectedIndexes]);
  useEffect(() => { if (productName) setName(productName); }, [productName]);
  useEffect(() => { if (fallbackPrice) { setActualPrice((value) => value || fallbackPrice); setFullPrice((value) => value || fallbackPrice); } }, [fallbackPrice]);
  useEffect(() => { if (fallbackLimit) setPurchaseLimit((value) => value || fallbackLimit); }, [fallbackLimit]);

  async function download() {
    setExporting(true);
    setExportError("");
    try {
      const draft = { name, category, displayOrder, saleStart, saleEnd, purchaseLimit, currency, actualPrice, fullPrice, bundleNames: selectedBundles.map((bundle) => bundle.name) };
      let blob: Blob;
      if (!requestId || isGoogleScript()) {
        blob = await localProductExport(draft);
        if (requestId) await saveGoogleExport(requestId, `${safeFilename(name)}-product-import.xlsx`, "PRODUCT_IMPORT", blob);
      }
      else {
      const response = await apiFetch("/api/product-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, filename: `${safeFilename(name)}-product-import.xlsx`, name, category, displayOrder, saleStart, saleEnd, purchaseLimit, currency, actualPrice, fullPrice, bundleNames: selectedBundles.map((bundle) => bundle.name) }),
      });
      if (!response.ok) throw new Error("สร้างไฟล์จาก Product Import Template ไม่สำเร็จ");
      blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(name)}-product-import.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export Product ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  const randomCount = selectedBundles.filter((bundle) => bundle.is_gacha).length;
  const fixedCount = selectedBundles.length - randomCount;
  const totalItems = selectedBundles.reduce((total, bundle) => total + bundle.items.length, 0);
  return <section className="product-export-panel"><div className="product-export-heading"><div><p className="eyebrow">Optional · Product Import</p><h2>สร้าง Product จาก Bundle ที่ล็อกไว้</h2><p>ใช้เมื่อชุด Bundle นี้ต้องผูกกับ Product บน Web Shop</p></div><button type="button" className="quiet-button" onClick={() => setOpen((value) => !value)}>{open ? "ปิดการตั้งค่า Product" : "ตั้งค่า Product"}</button></div><label className="product-name-top"><span>ชื่อ Product</span><input aria-label="ชื่อ Product" value={name} onChange={(event) => setName(event.target.value)} placeholder="ตั้งชื่อ Product" /></label>{open && <div className="product-export-body"><div className="field-grid product-fields"><CategoryPicker value={category} onChange={setCategory} /><Field label="ลำดับการแสดง" value={displayOrder} onChange={setDisplayOrder} /><Field label="จำกัดซื้อต่อ Player" value={purchaseLimit} onChange={setPurchaseLimit} /><Field label="เวลาเริ่มขาย" value={saleStart} onChange={setSaleStart} /><Field label="เวลาหยุดขาย" value={saleEnd} onChange={setSaleEnd} /><Field label="สกุลเงิน" value={currency} onChange={setCurrency} /><Field label="ราคาขายจริง" value={actualPrice} onChange={setActualPrice} /><Field label="ราคาเต็ม" value={fullPrice} onChange={setFullPrice} /></div><div className="product-review-summary"><div><b>พร้อมสร้าง Product 1 รายการ</b><span>{selectedBundles.length} Bundles · {fixedCount} Fixed · {randomCount} Random · {totalItems} Items</span></div><dl><div><dt>{actualPrice || "-"}</dt><dd>ราคาขายจริง</dd></div><div><dt>{purchaseLimit || "-"}</dt><dd>ต่อ Player</dd></div><div><dt>{currency || "-"}</dt><dd>สกุลเงิน</dd></div></dl></div><div className="product-bundle-summary"><b>Bundle ที่จะผูกกับ Product นี้</b><ul>{selectedBundles.map((bundle, index) => <li key={`${bundle.name}-${index}`}><span className={bundle.is_gacha ? "random-tag" : "fixed-tag"}>{bundle.is_gacha ? "Random" : "Fixed"}</span><strong>{bundle.name}</strong><small>{bundle.items.length} Items</small></li>)}</ul>{!selectedBundles.length && <span>ยังไม่มี Bundle ที่เลือก</span>}</div><div className="product-export-footer"><span>สถานะเปิดใช้งาน: True · โหมดทดสอบ: True · ซ่อนสินค้า: False</span><button type="button" className="primary-button product-download" disabled={!name.trim() || !selectedBundles.length || exporting} onClick={() => void download()}>{exporting ? "กำลังสร้างไฟล์..." : "Export Product Import"}</button></div>{exportError && <p className="hub-error">{exportError}</p>}</div>}</section>;
}

function Field({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label><span>{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }

function CategoryPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const matches = categories.filter((category) => category.toLocaleLowerCase().includes(value.toLocaleLowerCase())).slice(0, 8);
  return <label className="category-picker"><span>หมวดหมู่</span><input aria-label="หมวดหมู่" value={value} placeholder="ค้นหา Category..." onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 120)} />{open && <div className="category-options" role="listbox">{matches.length ? matches.map((category) => <button type="button" role="option" aria-selected={category === value} key={category} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(category); setOpen(false); }}>{category}</button>) : <span>ไม่พบหมวดหมู่ พิมพ์ชื่อใหม่ได้เลย</span>}</div>}</label>;
}
