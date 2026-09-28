import type { SpreadsheetTab } from "./spreadsheet-upload";

const SHEETS_READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const DEFAULT_GOOGLE_CLIENT_ID = "388166320286-da1hd1d4ihl0st3aj4irmn4smaod9hf4.apps.googleusercontent.com";

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleIdentity = {
  accounts: { oauth2: { initTokenClient: (options: { client_id: string; scope: string; callback: (response: TokenResponse) => void }) => TokenClient } };
};

declare global {
  interface Window { google?: GoogleIdentity }
}

let scriptPromise: Promise<void> | null = null;
let accessToken = "";
let expiresAt = 0;

export function spreadsheetIdFromGoogleUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return "";
    return url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] || "";
  } catch {
    return "";
  }
}

export function configuredGoogleClientId(): string {
  return String(import.meta.env?.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim();
}

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GOOGLE_SCRIPT_URL;
      script.async = true;
      script.onload = () => window.google?.accounts?.oauth2 ? resolve() : reject(new Error("เปิด Google Sign-In ไม่สำเร็จ"));
      script.onerror = () => reject(new Error("โหลด Google Sign-In ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ต"));
      document.head.appendChild(script);
    }).catch((error) => { scriptPromise = null; throw error; });
  }
  return scriptPromise;
}

export function preloadGoogleIdentity(): void {
  void loadGoogleIdentity().catch(() => undefined);
}

export function hasGoogleSheetAccess(): boolean {
  return !!accessToken && Date.now() < expiresAt;
}

export async function connectGoogleSheet(clientId: string): Promise<void> {
  if (!clientId.trim()) throw new Error("ยังไม่ได้ตั้งค่า Google OAuth Client ID สำหรับเว็บไซต์นี้");
  await loadGoogleIdentity();
  const google = window.google;
  if (!google) throw new Error("เปิด Google Sign-In ไม่สำเร็จ");
  await new Promise<void>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: SHEETS_READ_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error("เชื่อม Google ไม่สำเร็จหรือไม่ได้อนุญาตให้อ่านชีต"));
          return;
        }
        accessToken = response.access_token;
        expiresAt = Date.now() + Math.max(0, Number(response.expires_in || 3600) - 60) * 1000;
        resolve();
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function sheetsGet(path: string): Promise<unknown> {
  if (!hasGoogleSheetAccess()) throw new Error("สิทธิ์ Google หมดอายุ กรุณาเชื่อมบัญชีอีกครั้ง");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) { accessToken = ""; expiresAt = 0; }
    if (response.status === 403 || response.status === 404) throw new Error("เปิดชีตไม่ได้ ตรวจว่าบัญชี Google ที่เลือกมีสิทธิ์เข้าถึงไฟล์นี้");
    throw new Error(`Google Sheets อ่านข้อมูลไม่สำเร็จ (${response.status})`);
  }
  return response.json();
}

export async function listGoogleSheetTabs(url: string): Promise<SpreadsheetTab[]> {
  const id = spreadsheetIdFromGoogleUrl(url);
  if (!id) throw new Error("วางลิงก์ Google Sheet ที่ถูกต้อง");
  const result = await sheetsGet(`${id}?fields=sheets(properties(title))`) as { sheets?: Array<{ properties?: { title?: string } }> };
  const tabs = (result.sheets || []).flatMap((sheet) => sheet.properties?.title ? [{ name: sheet.properties.title, text: "" }] : []);
  if (!tabs.length) throw new Error("ไม่พบแท็บใน Google Sheet นี้");
  return tabs;
}

export async function readGoogleSheetTab(url: string, tabName: string): Promise<string> {
  const id = spreadsheetIdFromGoogleUrl(url);
  if (!id) throw new Error("วางลิงก์ Google Sheet ที่ถูกต้อง");
  const range = `'${tabName.replace(/'/g, "''")}'`;
  const result = await sheetsGet(`${id}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`) as { values?: unknown[][] };
  return (result.values || []).map((row) => row.map((cell) => String(cell ?? "").replace(/\t|\r?\n/g, " ")).join("\t")).join("\n");
}
