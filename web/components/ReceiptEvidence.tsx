"use client";

import { useEffect, useRef, useState } from "react";

export default function ReceiptEvidence({ onEvidenceChange }: { onEvidenceChange?: (images: Array<{ name: string; url: string }>) => void }) {
  const [files, setFiles] = useState<Array<{ file: File; url: string }>>([]);
  const filesRef = useRef<Array<{ file: File; url: string }>>([]);
  useEffect(() => { onEvidenceChange?.(files.map((item) => ({ name: item.file.name, url: item.url }))); }, [files, onEvidenceChange]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => filesRef.current.forEach(({ url }) => URL.revokeObjectURL(url)), []);
  function add(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = [...(event.target.files || [])].slice(0, 10 - files.length);
    setFiles((current) => [...current, ...incoming.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    event.currentTarget.value = "";
  }
  function remove(index: number) {
    setFiles((current) => { URL.revokeObjectURL(current[index].url); return current.filter((_, itemIndex) => itemIndex !== index); });
  }
  return <section className="receipt-evidence">
    <div className="subsection-heading"><div><strong>Receipt หลักฐานการซื้อ</strong><span>แนบรูปให้ PM ดูเท่านั้น — ยังไม่ทำ OCR และไม่กระทบผลตรวจ</span></div><label className={`image-upload ${files.length >= 10 ? "disabled" : ""}`}><input type="file" accept="image/*" multiple disabled={files.length >= 10} onChange={add} />+ เพิ่มรูป</label></div>
    {!files.length ? <p className="receipt-empty">ยังไม่ได้แนบ Receipt (ไม่บล็อกการตรวจ)</p> : <div className="receipt-grid">{files.map((item, index) => <figure key={`${item.file.name}-${index}`}><img src={item.url} alt={`Receipt ${index + 1}`} /><button type="button" onClick={() => remove(index)}>ลบ</button><figcaption>รูปที่ {index + 1} · {item.file.name}</figcaption></figure>)}</div>}
  </section>;
}
