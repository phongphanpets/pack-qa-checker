"use client";

import type { ChangeEvent } from "react";

import type { EvidenceRef } from "@/lib/pilot-session";

export default function HistoryEvidenceEditor({
  website,
  receipt,
  onWebsiteChange,
  onReceiptChange,
}: {
  website: EvidenceRef[];
  receipt: EvidenceRef[];
  onWebsiteChange: (images: EvidenceRef[]) => void;
  onReceiptChange: (images: EvidenceRef[]) => void;
}) {
  function add(
    event: ChangeEvent<HTMLInputElement>,
    current: EvidenceRef[],
    update: (images: EvidenceRef[]) => void,
    limit: number,
  ) {
    const available = Math.max(0, limit - current.length);
    const incoming = [...(event.target.files || [])].slice(0, available);
    update([
      ...current,
      ...incoming.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    ]);
    event.currentTarget.value = "";
  }

  function remove(
    index: number,
    current: EvidenceRef[],
    update: (images: EvidenceRef[]) => void,
  ) {
    const removed = current[index];
    if (removed?.url.startsWith("blob:")) URL.revokeObjectURL(removed.url);
    update(current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <section className="history-evidence-editor">
      <header>
        <div>
          <strong>แก้ไขรูปหลักฐาน</strong>
          <span>
            เพิ่มภาพฉบับเต็มหรือ Receipt ได้โดยไม่ต้องเริ่มตรวจใหม่
          </span>
        </div>
      </header>
      <EvidenceGroup
        title="Website ฉบับเต็ม"
        description="ใช้แสดงให้ PM ดู · ไม่อ่าน OCR ซ้ำและไม่เปลี่ยนผลตรวจ"
        images={website}
        limit={20}
        onAdd={(event) => add(event, website, onWebsiteChange, 20)}
        onRemove={(index) => remove(index, website, onWebsiteChange)}
      />
      <EvidenceGroup
        title="Receipt"
        description="เพิ่มได้สูงสุด 10 รูป · เป็นหลักฐานประกอบ ไม่กระทบผลตรวจ"
        images={receipt}
        limit={10}
        onAdd={(event) => add(event, receipt, onReceiptChange, 10)}
        onRemove={(index) => remove(index, receipt, onReceiptChange)}
      />
    </section>
  );
}

function EvidenceGroup({
  title,
  description,
  images,
  limit,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  images: EvidenceRef[];
  limit: number;
  onAdd: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="history-evidence-group">
      <div className="history-evidence-heading">
        <div>
          <strong>{title}</strong>
          <small>{description}</small>
        </div>
        <label className={images.length >= limit ? "disabled" : ""}>
          + เพิ่มรูป
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={images.length >= limit}
            onChange={onAdd}
          />
        </label>
      </div>
      {images.length ? (
        <div className="history-evidence-grid">
          {images.map((image, index) => (
            <figure key={`${image.url}-${index}`}>
              <img src={image.url} alt={`${title} ${index + 1}`} />
              <figcaption>{image.name}</figcaption>
              <button
                type="button"
                aria-label={`ลบรูป ${image.name}`}
                onClick={() => onRemove(index)}
              >
                ลบ
              </button>
            </figure>
          ))}
        </div>
      ) : (
        <p>ยังไม่มีรูป</p>
      )}
    </div>
  );
}
