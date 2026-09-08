"use client";

import { useEffect, useState } from "react";
import { createLocalOcrWorker } from "@/lib/website-ocr";
import { recognizeAdminScreenshot } from "@/lib/admin-ocr";
import {
  isPermanentDateRange,
  type AdminPasteResult,
} from "@/lib/excel-paste";

export default function AdminImageReview({ permanent = false, onChange, onEvidenceChange }: { permanent?: boolean; onChange: (result: AdminPasteResult | null) => void; onEvidenceChange?: (evidence: { name: string; url: string } | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<AdminPasteResult | null>(null);
  const [status, setStatus] = useState<"idle" | "reading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function read(next: File) {
    setFile(next);
    const previewUrl = URL.createObjectURL(next);
    setPreview(previewUrl);
    onEvidenceChange?.({ name: next.name, url: previewUrl });
    setStatus("reading");
    setError("");
    const worker = await createLocalOcrWorker(() => {});
    try {
      const nextResult = await recognizeAdminScreenshot(next, worker);
      const reviewResult = { ...nextResult, admin: withoutName(nextResult.admin), valid: false };
      setResult(reviewResult);
      onChange(reviewResult);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "อ่านภาพ Aztek Tool ไม่สำเร็จ");
      onChange(null);
    } finally {
      await worker.terminate();
    }
  }

  function edit(field: "name" | "startDate" | "endDate", value: string) {
    if (!result) return;
    const name = field === "name" ? value : result.summary.name || "";
    const startDate = field === "startDate" ? value : result.summary.startDate || "";
    const endDate = field === "endDate" ? value : result.summary.endDate || "";
    const isPermanent =
      startDate && endDate
        ? isPermanentDateRange(startDate, endDate)
        : null;
    const next: AdminPasteResult = {
      ...result,
      valid: Boolean(result.admin?.name && name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)),
      summary: {
        ...result.summary,
        name: name.trim() || null,
        startDate: startDate || null,
        endDate: endDate || null,
        startRaw: field === "startDate" ? withTime(startDate, result.summary.startRaw) : result.summary.startRaw,
        endRaw: field === "endDate" ? withTime(endDate, result.summary.endRaw) : result.summary.endRaw,
        isPermanent,
      },
      admin: {
        ...(result.admin || {}),
        ...(field === "name" ? {} : result.admin?.name ? { name: result.admin.name } : {}),
        ...(startDate ? { start_date: adminField(startDate, "start") } : {}),
        ...(endDate ? { end_date: adminField(endDate, "end") } : {}),
        ...(isPermanent !== null
          ? {
              is_permanent: adminPermanentField(
                isPermanent,
                startDate,
                endDate,
              ),
            }
          : {}),
      },
    };
    setResult(next);
    onChange(next);
  }

  function confirmName() {
    if (!result || !result.summary.name) return;
    const next: AdminPasteResult = {
      ...result,
      valid: Boolean(result.summary.name && result.summary.startDate && result.summary.endDate),
      admin: { ...(result.admin || {}), name: adminField(result.summary.name, "name") },
    };
    setResult(next);
    onChange(next);
  }

  return <div className="admin-image-review">
    <div className="admin-image-toolbar">
      <label className="file-picker"><input type="file" accept="image/*" onChange={(event) => { const next = event.target.files?.[0]; if (next) void read(next); }} />เลือกภาพ Aztek Tool</label>
      <small>อ่านตามคอลัมน์ชื่อ / วันที่เริ่ม / วันที่สิ้นสุด</small>
    </div>
    {permanent && (
      <div className="permanent-admin-note">
        <strong>แพ็กถาวร</strong>
        <span>
          Aztek ต้องตั้งวันสิ้นสุดระยะยาวอย่างน้อย 9 ปี
          จากวันเริ่ม จากภาพตัวอย่างควรเป็นปี 2036
        </span>
      </div>
    )}
    {preview && <div className="admin-image-evidence">
      <img src={preview} alt="ภาพ Admin ที่แนบ" />
      <div className="admin-image-fields">
        {result && <>
          <label>ชื่อ<input value={result.summary.name || ""} onChange={(event) => edit("name", event.target.value)} /><button type="button" className="admin-name-confirm" onClick={confirmName}>{result.admin?.name ? "ยืนยันชื่อแล้ว" : "ยืนยันชื่อนี้"}</button></label>
          <label>วันเริ่ม<input type="date" value={result.summary.startDate || ""} onChange={(event) => edit("startDate", event.target.value)} /></label>
          <label>{permanent ? "วันสิ้นสุดใน Aztek (ระยะยาว)" : "วันสิ้นสุด"}<input type="date" value={result.summary.endDate || ""} onChange={(event) => edit("endDate", event.target.value)} /></label>
          <small className="admin-image-help">{permanent ? `สถานะที่อ่านได้: ${result.summary.isPermanent ? "ถาวร" : "ยังไม่ถึงเกณฑ์ถาวร"}` : "ถ้า OCR อ่านวันที่ไม่ได้ ให้เลือกวันที่จากช่องนี้ได้เลย เวลาเดิมจะเก็บไว้เป็นหลักฐาน"}</small>
        </>}
        {status === "reading" && <p>กำลังอ่านภาพ…</p>}
        {status === "error" && <p role="alert">{error}</p>}
      </div>
    </div>}
    {file && result && !result.valid && <p className="admin-paste-required">ยังขาดข้อมูล — กรอกวันเริ่มและวันสิ้นสุดให้ครบก่อนเริ่มตรวจ</p>}
  </div>;
}

function adminField(value: string, column: string) {
  return { value, source: "admin", confidence: 1, raw_text: value, locator: `admin-image:${column}:human-confirmed` };
}

function adminPermanentField(
  value: boolean,
  startDate: string,
  endDate: string,
) {
  return {
    value,
    source: "admin",
    confidence: 1,
    raw_text: `${startDate} → ${endDate}`,
    locator: "admin-image:start-end:derived-permanence:human-confirmed",
  };
}

function withoutName(admin: Record<string, unknown> | null) {
  if (!admin) return null;
  const next = { ...admin };
  delete next.name;
  return Object.keys(next).length ? next : null;
}

function withTime(date: string, raw: string | null) {
  const time = raw?.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0];
  return date ? `${date}${time ? ` ${time}` : ""}` : raw;
}
