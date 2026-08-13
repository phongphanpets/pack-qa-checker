"use client";

import type { HistoryEntry } from "@/lib/history";

export default function HistoryPanel({
  entries,
  loading,
  error,
  onOpen,
  onDelete,
  onRefresh,
}: {
  entries: HistoryEntry[];
  loading: boolean;
  error: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <details className="history-panel">
      <summary>
        <span>
          <b>ประวัติการตรวจ</b>
          <small>
            {entries.length
              ? `${entries.length} รายการล่าสุด`
              : "ผลตรวจจะถูกบันทึกอัตโนมัติ"}
          </small>
        </span>
        <em>{entries.length}</em>
      </summary>
      <div className="history-panel-body">
        <div className="history-toolbar">
          <span>กดเปิดเพื่อดูผล เพิ่มรูปหลักฐาน หรือแก้ต่อ</span>
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "กำลังโหลด…" : "รีเฟรช"}
          </button>
        </div>
        {error && <p className="history-error">{error}</p>}
        {!loading && !entries.length && !error && (
          <div className="history-empty">
            ยังไม่มีประวัติ — ตรวจแพ็กสำเร็จหนึ่งครั้งแล้วรายการจะขึ้นที่นี่
          </div>
        )}
        <div className="history-list">
          {entries.map((entry) => {
            const status =
              entry.approval_state === "approved"
                ? "approved"
                : entry.approval_state === "changes_requested"
                  ? "fail"
              : entry.FAIL > 0
                ? "fail"
                : entry.UNVERIFIABLE > 0 || entry.WARN > 0
                  ? "review"
                  : "pass";
            const statusText =
              entry.approval_state === "approved"
                ? "PM อนุมัติแล้ว"
                : entry.approval_state === "changes_requested"
                  ? "PM ส่งกลับแก้"
              : status === "fail"
                ? `ผิด ${entry.FAIL}`
                : status === "review"
                  ? `รอตรวจ ${entry.UNVERIFIABLE + entry.WARN}`
                  : `ผ่าน ${entry.PASS}/${entry.checks}`;
            return (
              <article className={`history-entry ${status}`} key={entry.id}>
                <button
                  className="history-open"
                  type="button"
                  onClick={() => onOpen(entry.id)}
                >
                  <span className="history-status">{statusText}</span>
                  <strong>{entry.title}</strong>
                  <small>
                    {new Date(entry.created_at).toLocaleString("th-TH")} ·{" "}
                    {entry.bundle_count} bundle · {entry.evidence_count} รูป
                    {entry.reviewer_name ? ` · ${entry.reviewer_name}` : ""}
                  </small>
                </button>
                <button
                  className="history-delete"
                  type="button"
                  aria-label={`ลบประวัติ ${entry.title}`}
                  onClick={() => onDelete(entry.id)}
                >
                  ลบ
                </button>
              </article>
            );
          })}
        </div>
        <p className="history-scope">
          เก็บในฐานข้อมูลของ Pack QA เครื่องนี้ · เมื่อนำระบบขึ้นเครื่องกลาง
          ทุกคนจะเห็นประวัติชุดเดียวกัน
        </p>
      </div>
    </details>
  );
}
