"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PackFormDocument } from "@/components/PackForm";
import {
  attachAdminPaste,
  parseAdminPaste,
  parseExcelPaste,
} from "@/lib/excel-paste";
import type { SpecBundle } from "@/lib/website-ocr";
import AdminImageReview from "@/components/AdminImageReview";

export default function ExcelPasteForm({
  onChange,
  onSpecEvidenceChange,
  onAztekEvidenceChange,
}: {
  onChange: (
    document: PackFormDocument,
    bundles: SpecBundle[],
    valid: boolean,
  ) => void;
  onSpecEvidenceChange?: (evidence: { name: string; url: string } | null) => void;
  onAztekEvidenceChange?: (evidence: { name: string; url: string } | null) => void;
}) {
  const [value, setValue] = useState("");
  const [adminValue, setAdminValue] = useState("");
  const [adminImageResult, setAdminImageResult] = useState<ReturnType<typeof parseAdminPaste> | null>(null);
  const [specImage, setSpecImage] = useState<{ name: string; url: string } | null>(null);
  const specImageRef = useRef<{ name: string; url: string } | null>(null);
  const result = useMemo(() => parseExcelPaste(value), [value]);
  const pastedAdminResult = useMemo(
    () => parseAdminPaste(adminValue),
    [adminValue],
  );
  const adminResult = adminImageResult || pastedAdminResult;
  const document = useMemo(
    () => attachAdminPaste(result.document, adminResult),
    [adminResult, result.document],
  );

  useEffect(() => {
    onChange(
      document,
      result.bundles,
      result.valid && adminResult.valid,
    );
  }, [adminResult.valid, document, onChange, result]);

  useEffect(() => {
    specImageRef.current = specImage;
  }, [specImage]);

  useEffect(
    () => () => {
      if (specImageRef.current) {
        URL.revokeObjectURL(specImageRef.current.url);
      }
    },
    [],
  );

  function selectSpecEvidence(file: File | null) {
    if (!file) return;
    if (specImage) URL.revokeObjectURL(specImage.url);
    const next = { name: file.name, url: URL.createObjectURL(file) };
    setSpecImage(next);
    onSpecEvidenceChange?.(next);
  }

  function clearSpecEvidence() {
    if (specImage) URL.revokeObjectURL(specImage.url);
    setSpecImage(null);
    onSpecEvidenceChange?.(null);
  }

  return (
    <section className="excel-paste">
      <div className="excel-paste-heading">
        <div>
          <strong>วางข้อมูลจาก Excel</strong>
          <span>
            ลากคลุมตารางใน Excel แล้วกด Ctrl+C จากนั้นวางที่นี่
          </span>
        </div>
        {value && (
          <button type="button" onClick={() => setValue("")}>
            ล้าง
          </button>
        )}
      </div>

      <textarea
        aria-label="วางข้อมูลแพ็กที่ก๊อบจาก Excel"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={"Product Name\t...\tStart\t...\nItem ID\tItem Name\tAmt\n4235100\tBelorb Stabilizer\t2"}
        spellCheck={false}
      />
      <section className={`spec-evidence-card ${specImage ? "has-image" : ""}`}>
        <div className="spec-evidence-copy">
          <strong>ภาพ Req จาก Excel</strong>
          <span>หลักฐานสำหรับ PM เท่านั้น ไม่มีผลต่อการคำนวณ</span>
        </div>
        {specImage ? (
          <div className="spec-evidence-preview">
            <img src={specImage.url} alt={`ภาพ Req จาก Excel: ${specImage.name}`} />
            <div>
              <strong>{specImage.name}</strong>
              <label>
                เปลี่ยนรูป
                <input type="file" accept="image/*" onChange={(event) => selectSpecEvidence(event.target.files?.[0] || null)} />
              </label>
              <button type="button" onClick={clearSpecEvidence}>ลบรูป</button>
            </div>
          </div>
        ) : (
          <label className="spec-evidence-upload">
            <input type="file" accept="image/*" onChange={(event) => selectSpecEvidence(event.target.files?.[0] || null)} />
            <span>+ เลือกภาพ Req</span>
            <small>PNG, JPG หรือ WEBP</small>
          </label>
        )}
      </section>

      {!value ? (
        <div className="excel-paste-empty">
          <span>1</span> ก๊อบตารางจาก Excel
          <span>2</span> วางในช่อง
          <span>3</span> อัปโหลดภาพ Website
        </div>
      ) : result.valid ? (
        <div className="excel-paste-result">
          <div className="excel-paste-success">
            <span aria-hidden>✓</span>
            <div>
              <strong>{result.summary.name}</strong>
              <small>
                อ่านได้ {result.summary.itemCount} items · Seed Point{" "}
                {result.summary.seedPoint ?? "—"} · GSP{" "}
                {result.summary.gspEarn ?? "—"} · Limit{" "}
                {result.summary.purchaseLimit ?? "—"}
              </small>
            </div>
          </div>

          <div className="excel-paste-tags">
            {result.summary.isPermanent && (
              <span className="pack-mode permanent">
                แพ็กถาวร · ตรวจวันจบระยะยาวใน Aztek Tool
              </span>
            )}
            <span
              className={`pack-mode ${result.summary.isGacha ? "random" : "normal"}`}
              title="ระบบเลือกโหมดอัตโนมัติจากคอลัมน์ Chance"
            >
              {result.summary.isGacha
                ? `ตรวจพบ Random Pack · Fixed ${result.summary.fixedItemCount} · สุ่ม ${result.summary.randomOutcomeCount}`
                : "ตรวจพบ Normal Pack"}
            </span>
            <span>
              {result.summary.generatedBundleId
                ? `ID ชั่วคราว ${result.summary.bundleId}`
                : `bundle_id ${result.summary.bundleId}`}
            </span>
            <span>Spec จาก Excel · ความมั่นใจ 100%</span>
            {result.summary.isGacha && (
              <span>
                ผลรวม Chance{" "}
                {result.summary.chanceTotal?.toFixed(2)}%
              </span>
            )}
          </div>

          {result.warnings.map((warning) => (
            <p className="excel-paste-warning" key={warning.code}>
              <span>!</span>
              {warning.message}
            </p>
          ))}

          <details className="excel-paste-preview">
            <summary>ดูรายการที่อ่านได้</summary>
            <div>
              {result.bundles[0]?.items.map((item) => (
                <p key={`${item.item_id}-${item.name}`}>
                  <code>{item.item_id || "—"}</code>
                  <span>{item.name || "ไม่มีชื่อ"}</span>
                  <strong>x{item.amount ?? "—"}</strong>
                </p>
              ))}
            </div>
          </details>
        </div>
      ) : (
        <div className="excel-paste-invalid" role="alert">
          <span>!</span>
          ยังหา Product Name, Item ID, Item Name และ Amt ไม่ครบ
          กรุณาก๊อบให้ติดหัวตารางมาด้วย
        </div>
      )}

      {result.valid && (
        <section className="admin-paste">
          <div className="excel-paste-heading">
            <div>
              <strong>วางข้อมูลจาก Aztek Tool</strong>
              <span>
                จำเป็น · ก๊อบ Name, Start และ End มาวางครั้งเดียว
              </span>
            </div>
            {adminValue && (
              <button
                type="button"
                onClick={() => setAdminValue("")}
              >
                ล้าง
              </button>
            )}
          </div>

          <AdminImageReview
            permanent={result.summary.isPermanent}
            onChange={(next) => {
              setAdminImageResult(next);
              if (next) setAdminValue("");
            }}
            onEvidenceChange={onAztekEvidenceChange}
          />

          <details className="admin-paste-fallback">
            <summary>หรือวางข้อความจาก Aztek Tool (สำรอง)</summary>
          <textarea
            aria-label="วางชื่อแพ็กและวันเปิดปิดที่ก๊อบจาก Aztek Tool"
            value={adminValue}
            onChange={(event) => setAdminValue(event.target.value)}
            placeholder={"Name\tชื่อแพ็กใน Aztek Tool\nStart\tMay 24, 2026 12:01 AM\nEnd\tMay 26, 2026 11:59 PM"}
            spellCheck={false}
          />

          {!adminValue ? (
            <div className="admin-paste-required">
              <span>!</span>
              รอข้อมูล Aztek Tool เพื่อยืนยันชื่อและวันเปิด–ปิด
            </div>
          ) : adminResult.valid ? (
            <div className="admin-paste-result">
              <span aria-hidden>✓</span>
              <div>
                <strong>{adminResult.summary.name}</strong>
                <small>
                  เปิด {adminResult.summary.startRaw} · ปิด{" "}
                  {adminResult.summary.endRaw}
                </small>
                <small>
                  เทียบวันที่ {adminResult.summary.startDate} →{" "}
                  {adminResult.summary.endDate} · เวลาเต็มเก็บในหลักฐาน
                </small>
              </div>
            </div>
          ) : (
            <div className="excel-paste-invalid" role="alert">
              <span>!</span>
              ต้องมี Name, Start และ End โดยวันที่ต้องมีปี ค.ศ.
            </div>
          )}
          </details>
        </section>
      )}
    </section>
  );
}
