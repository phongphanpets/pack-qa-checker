"use client";
/* The line editor intentionally synchronizes initial values when the selected bundles change. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { localProductExport, type LocalProductDraft } from "@/lib/local-template-export";
import type { SpecBundle } from "@/lib/website-ocr";

type Props = { requestId: string; productName: string; bundles: SpecBundle[]; selectedIndexes: Set<number>; fallbackPrice: string; fallbackLimit: string };
type ProductLine = { key: string; bundleName: string; name: string; price: string; displayOrder: string; saleStart: string; saleEnd: string };

function dateValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16).replace("T", " ");
}
function endOfYear() { return `${new Date().getFullYear()}-12-31 23:59`; }
function safeFilename(value: string) { return value.trim().replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").slice(0, 100) || "product-import"; }
function initialPrice(bundle: SpecBundle, fallback: string) { return bundle.gsp_earn != null ? String(bundle.gsp_earn) : bundle.seed_point != null ? String(bundle.seed_point) : fallback; }

const categories = [
  "Savior Shop - [ Savior Shop ]",
  "Step up Shop - [ STEP GOD GACHA #1: Penguin Queen Austeja ]",
  "Step up Shop - [ STEP GOD GACHA #2: GOD COIN DC UPTO 70% ]",
  "Step up Shop - [ Fellow ]", "Step up Shop - [ God ]", "Step up Shop - [ Kupole ]",
  "Gacha rate up - Coin - [ God Coin ]", "Gacha rate up - Coin - [ Fellow Coin ]", "Gacha rate up - Coin - [ Kupole Coin ]",
  "Rank Shop - GSP", "Rank Shop - Monthly", "Starlight Station Shop - [ Battery Shop ]",
  "TOSM - Ayothaya - [ Free ]", "TOSM - Ayothaya - [ Paid ]",
  "TOSM - Ayothaya [Little Red Riding Hood] - [ Free ]", "TOSM - Ayothaya [Little Red Riding Hood] - [ Paid ]",
];

export default function ProductExportPanel({ productName, bundles, selectedIndexes, fallbackPrice, fallbackLimit }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [displayOrder, setDisplayOrder] = useState("500");
  const [purchaseLimit, setPurchaseLimit] = useState(fallbackLimit || "1");
  const [currency, setCurrency] = useState("Seed Point");
  const [commonStart, setCommonStart] = useState(() => dateValue(new Date()));
  const [commonEnd, setCommonEnd] = useState(endOfYear);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const selectedBundles = useMemo(() => bundles.filter((_, index) => selectedIndexes.size === 0 || selectedIndexes.has(index)), [bundles, selectedIndexes]);
  const signature = selectedBundles.map((bundle, index) => `${bundle.bundle_id || bundle.name}-${index}`).join("|");

  useEffect(() => {
    setLines((current) => selectedBundles.map((bundle, index) => {
      const key = `${bundle.bundle_id || bundle.name}-${index}`;
      return current.find((line) => line.key === key) || {
        key,
        bundleName: bundle.name || `Bundle #${index + 1}`,
        name: bundle.name || (selectedBundles.length === 1 ? productName : `Product #${index + 1}`),
        price: initialPrice(bundle, fallbackPrice),
        displayOrder: String((Number(displayOrder) || 500) - index),
        saleStart: commonStart,
        saleEnd: commonEnd,
      };
    }));
  // The signature is deliberately stable: typing in a line must not reset that line.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, fallbackPrice, productName]);
  useEffect(() => { if (fallbackLimit) setPurchaseLimit((value) => value || fallbackLimit); }, [fallbackLimit]);

  const updateLine = (key: string, field: keyof Omit<ProductLine, "key" | "bundleName">, value: string) => setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  const applyDates = () => setLines((current) => current.map((line) => ({ ...line, saleStart: commonStart, saleEnd: commonEnd })));
  const applyPriceOrder = () => {
    const highestOrder = Number(displayOrder) || 0;
    setLines((current) => current.map((line, index) => ({ line, index })).sort((left, right) => {
      const priceDifference = Number(left.line.price) - Number(right.line.price);
      return Number.isFinite(priceDifference) && priceDifference !== 0 ? priceDifference : left.index - right.index;
    }).map(({ line }, index) => ({ ...line, displayOrder: String(highestOrder - index) })));
  };

  async function download() {
    if (lines.some((line) => !line.name.trim() || !line.price.trim())) { setExportError("กรอกชื่อ Product และราคา SP ให้ครบก่อน Export"); return; }
    setExporting(true); setExportError("");
    try {
      const drafts: LocalProductDraft[] = lines.map((line) => ({
        name: line.name, category, displayOrder: line.displayOrder, saleStart: line.saleStart, saleEnd: line.saleEnd,
        purchaseLimit, currency, actualPrice: line.price, fullPrice: line.price, bundleNames: [line.bundleName],
      }));
      const blob = await localProductExport(drafts);
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `${safeFilename(productName)}-product-import.xlsx`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(error instanceof Error ? error.message : "Export Product ไม่สำเร็จ"); }
    finally { setExporting(false); }
  }

  return <section className="product-export-panel"><div className="product-export-heading"><div><p className="eyebrow">Optional · Product Import</p><h2>สร้าง Product แยกตาม Bundle</h2><p>ราคา SP เริ่มจาก GSP Earn ของแต่ละ Bundle แล้วแก้เฉพาะรายการได้</p></div><button type="button" className="quiet-button" onClick={() => setOpen((value) => !value)}>{open ? "ปิดการตั้งค่า Product" : "ตั้งค่า Product"}</button></div>{open && <div className="product-export-body"><div className="field-grid product-fields"><CategoryPicker value={category} onChange={setCategory} /><Field label="ลำดับแสดงสูงสุด" value={displayOrder} onChange={setDisplayOrder} /><Field label="จำกัดซื้อต่อ Player" value={purchaseLimit} onChange={setPurchaseLimit} /><Field label="สกุลเงิน" value={currency} onChange={setCurrency} /></div><div className="product-schedule"><div><Field label="เวลาเริ่มขายทั้งหมด" value={commonStart} onChange={setCommonStart} /><Field label="เวลาหยุดขายทั้งหมด" value={commonEnd} onChange={setCommonEnd} /></div><button type="button" className="quiet-button" onClick={applyDates}>ใช้เวลานี้กับทุก Product</button></div><div className="product-order-tools"><span>กด Auto เพื่อเรียงราคาน้อยไปมาก: 50 SP = 510, 100 SP = 509, 100 SP = 508</span><button type="button" className="quiet-button" onClick={applyPriceOrder}>Auto ลำดับตามราคา</button></div><div className="product-lines"><div className="product-lines-heading"><b>Product ที่จะสร้าง ({lines.length})</b><span>แก้ชื่อ ราคา SP ลำดับ และช่วงเวลาราย Product ได้</span></div>{lines.map((line, index) => <div className="product-line" key={line.key}><span className="product-line-number">{index + 1}</span><label><span>ชื่อ Product</span><input aria-label={`ชื่อ Product ${index + 1}`} value={line.name} onChange={(event) => updateLine(line.key, "name", event.target.value)} /></label><label><span>ราคา SP</span><input aria-label={`ราคา SP ${index + 1}`} inputMode="decimal" value={line.price} onChange={(event) => updateLine(line.key, "price", event.target.value)} /></label><label><span>ลำดับแสดง</span><input aria-label={`ลำดับแสดง ${index + 1}`} inputMode="numeric" value={line.displayOrder} onChange={(event) => updateLine(line.key, "displayOrder", event.target.value)} /></label><label><span>เริ่มขาย</span><input aria-label={`เริ่มขาย ${index + 1}`} value={line.saleStart} onChange={(event) => updateLine(line.key, "saleStart", event.target.value)} /></label><label><span>หยุดขาย</span><input aria-label={`หยุดขาย ${index + 1}`} value={line.saleEnd} onChange={(event) => updateLine(line.key, "saleEnd", event.target.value)} /></label><small>Bundle: {line.bundleName}</small></div>)}</div><div className="product-export-footer"><span>สถานะเปิดใช้งาน: True · โหมดทดสอบ: True · ซ่อนสินค้า: False</span><button type="button" className="primary-button product-download" disabled={!lines.length || exporting} onClick={() => void download()}>{exporting ? "กำลังสร้างไฟล์..." : `Export Product Import (${lines.length})`}</button></div>{exportError && <p className="hub-error">{exportError}</p>}</div>}</section>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>; }

function CategoryPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const matches = categories.filter((category) => category.toLocaleLowerCase().includes(value.toLocaleLowerCase())).slice(0, 8);
  return <label className="category-picker"><span>หมวดหมู่</span><input aria-label="หมวดหมู่" value={value} placeholder="ค้นหา Category..." onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 120)} />{open && <div className="category-options" role="listbox">{matches.length ? matches.map((category) => <button type="button" role="option" aria-selected={category === value} key={category} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(category); setOpen(false); }}>{category}</button>) : <span>ไม่พบหมวดหมู่ พิมพ์ชื่อใหม่ได้เลย</span>}</div>}</label>;
}
