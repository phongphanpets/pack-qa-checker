"use client";

import { useState } from "react";
import { localProductExport, type LocalProductDraft } from "@/lib/local-template-export";
import type { SpecBundle } from "@/lib/website-ocr";
import { CategoryPicker } from "@/components/ProductExportPanel";

const categoryName = "Starlight SS2 Shop - [ Battery Shop ]";
type Edit = Partial<Pick<LocalProductDraft, "name" | "actualPrice" | "purchaseLimit">>;

export default function StarlightProductExportPanel({ bundles }: { bundles: SpecBundle[] }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(categoryName);
  const [nameEn, setNameEn] = useState("Starlight SS2");
  const [currency, setCurrency] = useState("Battery");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = bundles.map((bundle, index) => {
    const key = String(bundle.bundle_id);
    const item = bundle.items[0];
    const edit = edits[key] || {};
    const price = edit.actualPrice ?? String(item?.battery ?? "");
    return { key, draft: {
      name: edit.name ?? item?.name ?? bundle.name ?? "",
      nameEn: nameEn.trim(), category, currency, actualPrice: price, fullPrice: price,
      purchaseLimit: edit.purchaseLimit ?? (bundle.purchase_limit == null ? "" : String(bundle.purchase_limit)),
      displayOrder: String(500 - index), saleStart: start, saleEnd: end, bundleNames: [bundle.name || ""],
    } satisfies LocalProductDraft };
  });
  function edit(key: string, field: keyof Edit, value: string) {
    setEdits(current => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }
  async function download() {
    setError("");
    if (!nameEn.trim()) { setError("กรอกชื่ออังกฤษสำหรับค้นหาใน Aztek"); return; }
    if (!currency.trim()) { setError("กรอกชื่อสกุลเงินให้ตรงกับ Aztek"); return; }
    if (rows.some(({ draft }) => !draft.name.trim() || !draft.actualPrice.trim() || !Number.isFinite(Number(draft.actualPrice)) || Number(draft.actualPrice) < 0)) {
      setError("กรอกชื่อและราคา Battery ให้ครบ ราคาต้องตั้งแต่ 0 ขึ้นไป"); return;
    }
    if (rows.some(({ draft }) => draft.purchaseLimit.trim() && (!Number.isSafeInteger(Number(draft.purchaseLimit)) || Number(draft.purchaseLimit) < 1))) {
      setError("Limit ต้องเป็นจำนวนเต็มตั้งแต่ 1 หรือเว้นว่างสำหรับไม่จำกัด"); return;
    }
    setBusy(true);
    try {
      const blob = await localProductExport(rows.map(row => row.draft));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "starlight-ss2-product-import.xlsx"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export ไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <section className="product-export-panel">
    <div className="product-export-heading"><div><h2>Product · Starlight Shop</h2><p>1 Product ต่อ Bundle · ราคาและ Limit จากตารางต้นทาง</p></div>
      <button type="button" className="quiet-button" onClick={() => setOpen(!open)}>{open ? "ปิดการตั้งค่า Product" : "ตั้งค่า Product Starlight"}</button></div>
    {open && <div className="product-export-body">
      <div className="field-grid product-fields">
        <CategoryPicker value={category} onChange={setCategory} />
        <Field label="ชื่อสินค้า (อังกฤษ) ทุก Product" value={nameEn} onChange={setNameEn} />
        <Field label="สกุลเงิน (ตรงกับชื่อใน Aztek)" value={currency} onChange={setCurrency} />
        <Field label="เริ่มขายทั้งหมด" value={start} onChange={setStart} placeholder="YYYY-MM-DD HH:mm:ss" />
        <Field label="หยุดขายทั้งหมด" value={end} onChange={setEnd} placeholder="YYYY-MM-DD HH:mm:ss" />
      </div>
      <p>ชื่ออังกฤษในคอลัมน์ C จะเหมือนกันทุกแถว เพื่อใช้ค้นหาทั้งชุดใน Aztek ส่วนคอลัมน์ B เป็นชื่อรายสินค้า</p>
      <div className="product-lines">{rows.map(({ key, draft }, index) => <div className="product-line" key={key}>
        <span className="product-line-number">{index + 1}</span>
        <Field label={`ชื่อสินค้า (ไทย) ${index + 1}`} value={draft.name} onChange={value => edit(key, "name", value)} />
        <Field label={`ราคา Battery ${index + 1}`} value={draft.actualPrice} onChange={value => edit(key, "actualPrice", value)} />
        <Field label={`Limit / Player ${index + 1}`} value={draft.purchaseLimit} onChange={value => edit(key, "purchaseLimit", value)} placeholder="ไม่จำกัด" />
        <small>ชื่ออังกฤษ: {draft.nameEn} · Bundle: {draft.bundleNames[0]}</small>
      </div>)}</div>
      <div className="product-export-footer"><span>เปิดใช้งาน: True · โหมดทดสอบ: True · ซ่อน: False · No-Limit ส่งออกเป็นช่องว่าง</span>
        <button type="button" className="primary-button" disabled={busy || !rows.length} onClick={() => void download()}>{busy ? "กำลังสร้างไฟล์..." : `Export Product Starlight (${rows.length})`}</button></div>
      {error && <p role="alert" className="hub-error">{error}</p>}
    </div>}
  </section>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label><span>{label}</span><input aria-label={label} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>;
}
