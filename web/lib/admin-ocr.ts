import type Tesseract from "tesseract.js";

import {
  isPermanentDateRange,
  type AdminPasteResult,
} from "./excel-paste.ts";

export type AdminCropRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function adminCropRegions(width: number, height: number) {
  return {
    name: { left: Math.round(width * 0.005), top: Math.round(height * 0.43), width: Math.round(width * 0.245), height: Math.round(height * 0.53) },
    start: { left: Math.round(width * 0.704), top: Math.round(height * 0.43), width: Math.round(width * 0.095), height: Math.round(height * 0.54) },
    end: { left: Math.round(width * 0.805), top: Math.round(height * 0.43), width: Math.round(width * 0.105), height: Math.round(height * 0.54) },
  } satisfies Record<"name" | "start" | "end", AdminCropRegion>;
}

export function parseAdminOcrDates(raw: string) {
  const text = raw.replace(/\s+/g, " ").trim();
  const dates = [...text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/g)].map((match) => normalizeDate(match[1], match[2], match[3]));
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g)].map((match) => match[1]);
  return { startDate: dates[0] || null, endDate: dates[1] || null, startTime: times[0] || null, endTime: times[1] || null };
}

export async function recognizeAdminScreenshot(file: File, worker: Tesseract.Worker): Promise<AdminPasteResult> {
  const bitmap = await createImageBitmap(file);
  try {
    const regions = adminCropRegions(bitmap.width, bitmap.height);
    await worker.setParameters({ tessedit_pageseg_mode: "7" as Tesseract.PSM, preserve_interword_spaces: "1" });
    const nameResult = await worker.recognize(cropCanvas(bitmap, regions.name));
    const name = clean(nameResult.data.text);
    const nameConfidence = clamp((nameResult.data.confidence || 0) / 100);

    await worker.setParameters({ tessedit_pageseg_mode: "6" as Tesseract.PSM, preserve_interword_spaces: "1", tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:/- " });
    const startResult = await worker.recognize(cropCanvas(bitmap, regions.start));
    const endResult = await worker.recognize(cropCanvas(bitmap, regions.end));
    const startParsed = parseAdminOcrDates(startResult.data.text);
    const endParsed = parseAdminOcrDates(endResult.data.text);
    const dateConfidence = clamp(Math.min(startResult.data.confidence || 0, endResult.data.confidence || 0) / 100);
    const startRaw = clean(startResult.data.text);
    const endRaw = clean(endResult.data.text);
    const startDate = startParsed.startDate;
    const endDate = endParsed.startDate || endParsed.endDate;
    const isPermanent =
      startDate && endDate
        ? isPermanentDateRange(startDate, endDate)
        : null;
    const admin = compact({
      name: name ? field(name, nameConfidence, nameResult.data.text, "name") : undefined,
      start_date: startDate ? field(startDate, dateConfidence, startRaw, "start") : undefined,
      end_date: endDate ? field(endDate, dateConfidence, endRaw, "end") : undefined,
      is_permanent:
        isPermanent !== null
          ? permanentField(
              isPermanent,
              dateConfidence,
              startRaw,
              endRaw,
            )
          : undefined,
    });
    return {
      admin: Object.keys(admin).length ? admin : null,
      valid: Boolean(name && startDate && endDate),
      summary: {
        name,
        startDate,
        endDate,
        startRaw,
        endRaw,
        isPermanent,
      },
    };
  } finally {
    bitmap.close();
  }
}

function field(value: string, confidence: number, raw: string | null, column: string) {
  return { value, source: "admin", confidence, raw_text: clean(raw) || value, locator: `admin-image:${column}` };
}

function permanentField(
  value: boolean,
  confidence: number,
  startRaw: string | null,
  endRaw: string | null,
) {
  return {
    value,
    source: "admin",
    confidence,
    raw_text: `${startRaw || "?"} → ${endRaw || "?"}`,
    locator: "admin-image:start-end:derived-permanence",
  };
}

function normalizeDate(day: string, month: string, year: string) {
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  return `${year}-${months[month.slice(0, 3).toLowerCase()] || "01"}-${day.padStart(2, "0")}`;
}

function cropCanvas(bitmap: ImageBitmap, crop: AdminCropRegion) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, crop.width * 4);
  canvas.height = Math.max(1, crop.height * 4);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ไม่สามารถเตรียมภาพ Admin ได้");
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, crop.left, crop.top, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function clean(value: string | null | undefined) { return value?.replace(/\s+/g, " ").trim() || null; }
function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function compact(values: Record<string, unknown>) { return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)); }
