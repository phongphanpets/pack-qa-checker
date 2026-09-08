import type { PilotSession } from "@/lib/pilot-session";

const HISTORY_API = "http://127.0.0.1:8765/api/history";

export type HistoryEntry = {
  id: string;
  created_at: string;
  title: string;
  bundle_count: number;
  pack_mode: string;
  checks: number;
  PASS: number;
  FAIL: number;
  WARN: number;
  UNVERIFIABLE: number;
  evidence_count: number;
  approval_state: "pending" | "approved" | "changes_requested";
  reviewer_name: string;
  pm_decided_at: string | null;
};

export async function listHistory(): Promise<HistoryEntry[]> {
  const response = await fetch(`${HISTORY_API}?limit=50`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "เปิดประวัติไม่สำเร็จ");
  return Array.isArray(payload.entries) ? payload.entries : [];
}

export async function saveHistory(session: PilotSession) {
  const response = await fetch(HISTORY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "บันทึกประวัติไม่สำเร็จ");
  return payload.entry as HistoryEntry;
}

export async function loadHistory(id: string): Promise<PilotSession> {
  const response = await fetch(`${HISTORY_API}/${encodeURIComponent(id)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "เปิดประวัติไม่สำเร็จ");
  return payload.session as PilotSession;
}

export async function deleteHistory(id: string) {
  const response = await fetch(`${HISTORY_API}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "ลบประวัติไม่สำเร็จ");
}
