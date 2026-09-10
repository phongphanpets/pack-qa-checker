import { useState } from "react";
import { apiConfiguration, apiFetch, configureApi } from "../lib/api-client";

export default function Connection() {
  const current = apiConfiguration();
  const [endpoint, setEndpoint] = useState(current.endpoint);
  const [token, setToken] = useState(current.token);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true);
    try {
      configureApi(endpoint, token);
      const response = await apiFetch("/api/requests");
      if (!response.ok) throw new Error("เซิร์ฟเวอร์ปฏิเสธการเชื่อมต่อ กรุณาตรวจรหัสเข้าถึง");
      const result = await response.json();
      if (!Array.isArray(result.requests)) throw new Error("URL นี้ไม่ใช่เซิร์ฟเวอร์ Request Hub");
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <details className="server-connection" open={!current.endpoint}>
    <summary>เซิร์ฟเวอร์ Request และ History</summary>
    {!current.endpoint && <p>Bundle only วางตารางและ Export ได้โดยไม่เชื่อม Server ส่วนการส่ง Request, History ส่วนกลาง และอ่านไฟล์ Excel ยังต้องเชื่อมต่อ</p>}
    <div className="request-fields">
      <label>URL เซิร์ฟเวอร์<input type="url" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://..." /></label>
      <label>รหัสเข้าถึง<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label>
      <button className="primary-button" type="button" disabled={busy || !endpoint} onClick={() => void connect()}>{busy ? "กำลังเชื่อมต่อ..." : "เชื่อมต่อ"}</button>
    </div>
    {message && <p role="alert">{message}</p>}
  </details>;
}
