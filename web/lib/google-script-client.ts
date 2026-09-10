type ScriptReply = { status: number; body?: unknown; base64?: string; mime?: string };
type Runner = {
  withSuccessHandler(callback: (reply: ScriptReply) => void): Runner;
  withFailureHandler(callback: (error: { message?: string }) => void): Runner;
  hubApi(path: string, method: string, body: unknown, operationId: string): void;
};
declare global { interface Window { google?: { script?: { run?: Runner } } } }

export function isGoogleScript() {
  return typeof window !== "undefined" && Boolean(window.google?.script?.run);
}

// Keep the operation ID after an uncertain failure, so retrying cannot create duplicates.
const pending = new Map<string, string>();
export async function googleScriptFetch(path: string, options: RequestInit = {}) {
  const method = (options.method || "GET").toUpperCase();
  const raw = typeof options.body === "string" ? options.body : "";
  const key = method + path + raw;
  const operationId = pending.get(key) || crypto.randomUUID();
  if (method !== "GET") pending.set(key, operationId);
  const reply = await new Promise<ScriptReply>((resolve, reject) => {
    window.google!.script!.run!
      .withSuccessHandler(resolve)
      .withFailureHandler(error => reject(new Error(error.message || "ติดต่อ Google ไม่สำเร็จ กรุณาลองอีกครั้ง")))
      .hubApi(path, method, raw ? JSON.parse(raw) : null, operationId);
  });
  if (reply.status < 500) pending.delete(key);
  if (reply.base64 !== undefined) {
    const bytes = Uint8Array.from(atob(reply.base64), char => char.charCodeAt(0));
    return new Response(bytes, { status: reply.status, headers: { "Content-Type": reply.mime || "application/octet-stream" } });
  }
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
}

export async function saveGoogleExport(requestId: string, filename: string, type: string, blob: Blob) {
  const data_url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("อ่านไฟล์ Export ไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
  const response = await googleScriptFetch(`/api/requests/${encodeURIComponent(requestId)}/exports`, {
    method: "POST", body: JSON.stringify({ filename, type, data_url }),
  });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error || "บันทึกไฟล์ลง Drive ไม่สำเร็จ");
  }
}
