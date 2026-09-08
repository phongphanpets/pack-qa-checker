"use client";

import { useEffect, useMemo, useState } from "react";

import type { SpecBundle } from "@/lib/website-ocr";

type Props = { requestId: string; productName: string; bundles: SpecBundle[]; selectedIndexes: Set<number>; fallbackPrice: string; fallbackLimit: string };

function dateValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16).replace("T", " ");
}

function endOfYear() { return `${new Date().getFullYear()}-12-31 23:59`; }
function safeFilename(value: string) { return value.trim().replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").slice(0, 100) || "product-import"; }

export default function ProductExportPanel({ requestId, productName, bundles, selectedIndexes, fallbackPrice, fallbackLimit }: Props) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(productName);
  const [category, setCategory] = useState("");
  const [displayOrder, setDisplayOrder] = useState("500");
  const [saleStart, setSaleStart] = useState(() => dateValue(new Date()));
  const [saleEnd, setSaleEnd] = useState(endOfYear);
  const [purchaseLimit, setPurchaseLimit] = useState(fallbackLimit || "1");
  const [currency, setCurrency] = useState("Social Point");
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
      const response = await fetch("/api/product-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, filename: `${safeFilename(name)}-product-import.xlsx`, name, category, displayOrder, saleStart, saleEnd, purchaseLimit, currency, actualPrice, fullPrice, bundleNames: selectedBundles.map((bundle) => bundle.name) }),
      });
      if (!response.ok) throw new Error("สร้างไฟล์จาก Product Import Template ไม่สำเร็จ");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(name)}-product-import.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export Product ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  const randomCount = selectedBundles.filter((bundle) => bundle.is_gacha).length;
  const fixedCount = selectedBundles.length - randomCount;
  const totalItems = selectedBundles.reduce((total, bundle) => total + bundle.items.length, 0);
  return <section className="product-export-panel"><div className="product-export-heading"><div><p className="eyebrow">Step 4 · Review & Export</p><h2>Product ที่ผูกกับ Bundle</h2><p>ตรวจข้อมูลสุดท้ายก่อนสร้างไฟล์ Product Import จาก Template จริง</p></div><button type="button" className="quiet-button" onClick={() => setOpen((value) => !value)}>{open ? "ซ่อนรายละเอียด" : "เปิด Review"}</button></div>{open && <div className="product-export-body"><div className="field-grid product-fields"><Field label="ชื่อ Product" value={name} onChange={setName} /><Field label="หมวดหมู่" value={category} onChange={setCategory} placeholder="เช่น Savior Shop - [ Savior Shop ]" /><Field label="ลำดับการแสดง" value={displayOrder} onChange={setDisplayOrder} /><Field label="จำกัดซื้อต่อ Player" value={purchaseLimit} onChange={setPurchaseLimit} /><Field label="เวลาเริ่มขาย" value={saleStart} onChange={setSaleStart} /><Field label="เวลาหยุดขาย" value={saleEnd} onChange={setSaleEnd} /><Field label="สกุลเงิน" value={currency} onChange={setCurrency} /><Field label="ราคาขายจริง" value={actualPrice} onChange={setActualPrice} /><Field label="ราคาเต็ม" value={fullPrice} onChange={setFullPrice} /></div><div className="product-review-summary"><div><b>พร้อมสร้าง Product 1 รายการ</b><span>{selectedBundles.length} Bundles · {fixedCount} Fixed · {randomCount} Random · {totalItems} Items</span></div><dl><div><dt>{actualPrice || "-"}</dt><dd>ราคาขายจริง</dd></div><div><dt>{purchaseLimit || "-"}</dt><dd>ต่อ Player</dd></div><div><dt>{currency || "-"}</dt><dd>สกุลเงิน</dd></div></dl></div><div className="product-bundle-summary"><b>Bundle ที่จะผูกกับ Product นี้</b><ul>{selectedBundles.map((bundle, index) => <li key={`${bundle.name}-${index}`}><span className={bundle.is_gacha ? "random-tag" : "fixed-tag"}>{bundle.is_gacha ? "Random" : "Fixed"}</span><strong>{bundle.name}</strong><small>{bundle.items.length} Items</small></li>)}</ul>{!selectedBundles.length && <span>ยังไม่มี Bundle ที่เลือก</span>}</div><div className="product-export-footer"><span>สถานะเปิดใช้งาน: True · โหมดทดสอบ: True · ซ่อนสินค้า: False</span><button type="button" className="primary-button product-download" disabled={!name.trim() || !selectedBundles.length || exporting} onClick={() => void download()}>{exporting ? "กำลังสร้างไฟล์..." : "Export Product Import"}</button></div>{exportError && <p className="hub-error">{exportError}</p>}</div>}</section>;
}

function Field({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label><span>{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
