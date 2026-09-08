import { apiFetch } from "./api-client";

export async function sourceTextFromAttachments(files: File[]) {
  if (files.some((file) => /\.xls$/i.test(file.name))) throw new Error("ไฟล์ .xls แบบเก่ายังอ่านไม่ได้ กรุณา Save As เป็น .xlsx ก่อน");
  const spreadsheet = files.find((file) => /\.(xlsx|csv|txt|md)$/i.test(file.name));
  if (!spreadsheet) return "";
  const tabs = await readSpreadsheetTabs(spreadsheet);
  return tabs[0]?.text || "";
}

export type SpreadsheetTab = { name: string; text: string };

export async function readSpreadsheetTabs(file: File): Promise<SpreadsheetTab[]> {
  if (/\.xls$/i.test(file.name)) throw new Error("ไฟล์ .xls แบบเก่ายังอ่านไม่ได้ กรุณา Save As เป็น .xlsx ก่อน");
  if (/\.(csv|txt|md)$/i.test(file.name)) return [{ name: file.name.replace(/\.[^.]+$/, "") || "Text", text: await file.text() }];
  if (!/\.xlsx$/i.test(file.name)) throw new Error("รองรับไฟล์ .xlsx, .csv และ .txt");
  const dataUrl = await fileDataUrl(file);
  const response = await apiFetch("/api/read-spreadsheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, data_url: dataUrl }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "อ่านไฟล์ Spreadsheet ไม่สำเร็จ");
  return Array.isArray(body.tabs) ? body.tabs : [];
}

function fileDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`)); reader.readAsDataURL(file); }); }
