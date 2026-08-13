import type { PackFormDocument } from "@/components/PackForm";
import type { ReviewedWebsiteObservation } from "@/components/WebsiteImageReview";
import type { SpecBundle } from "@/lib/website-ocr";
import {
  normalizePmReview,
  type PmReviewState,
} from "./pm-review.ts";

export const PILOT_VERSION = "Pilot RC1";
export const SESSION_SCHEMA_VERSION = 1;

export type PackMode = "excel" | "form" | "yaml";

export type EvidenceRef = {
  name: string;
  url: string;
};

export type StoredEvidence = {
  name: string;
  data_url: string;
};

export type PilotSession = {
  kind: "pack-qa-pilot-session";
  schema_version: typeof SESSION_SCHEMA_VERSION;
  app_version: typeof PILOT_VERSION;
  saved_at: string;
  pack_mode: PackMode;
  pack_data: PackFormDocument | null;
  pack_form_valid: boolean;
  pack_yaml_name: string | null;
  pack_yaml_text: string | null;
  website_ocr_yaml_text: string | null;
  spec_bundles: SpecBundle[];
  website_observations: ReviewedWebsiteObservation[];
  images_pending: boolean;
  report: unknown | null;
  pm_review: PmReviewState;
  evidence: {
    spec: StoredEvidence | null;
    website: StoredEvidence[];
    aztek: StoredEvidence | null;
    receipt: StoredEvidence[];
  };
  diagnostics: {
    user_agent: string;
    human_confirmed_fields: number;
    unverifiable_checks: number;
    fail_checks: number;
    evidence_counts: {
      spec: number;
      website: number;
      aztek: number;
      receipt: number;
    };
  };
};

export type PilotSessionInput = {
  packMode: PackMode;
  packData: PackFormDocument | null;
  packFormValid: boolean;
  packYamlName: string | null;
  packYamlText: string | null;
  websiteOcrYamlText: string | null;
  specBundles: SpecBundle[];
  websiteObservations: ReviewedWebsiteObservation[];
  imagesPending: boolean;
  report: unknown | null;
  pmReview?: PmReviewState;
  specEvidence: EvidenceRef | null;
  websiteEvidence: EvidenceRef[];
  aztekEvidence: EvidenceRef | null;
  receiptEvidence: EvidenceRef[];
  userAgent?: string;
};

const DB_NAME = "pack-qa-pilot";
const STORE_NAME = "drafts";
const LAST_DRAFT_KEY = "last-work";

export async function createPilotSession(
  input: PilotSessionInput,
): Promise<PilotSession> {
  const evidence = {
    spec: input.specEvidence
      ? await storeEvidence(input.specEvidence)
      : null,
    website: await Promise.all(
      input.websiteEvidence.map(storeEvidence),
    ),
    aztek: input.aztekEvidence
      ? await storeEvidence(input.aztekEvidence)
      : null,
    receipt: await Promise.all(
      input.receiptEvidence.map(storeEvidence),
    ),
  };

  return {
    kind: "pack-qa-pilot-session",
    schema_version: SESSION_SCHEMA_VERSION,
    app_version: PILOT_VERSION,
    saved_at: new Date().toISOString(),
    pack_mode: input.packMode,
    pack_data: input.packData,
    pack_form_valid: input.packFormValid,
    pack_yaml_name: input.packYamlName,
    pack_yaml_text: input.packYamlText,
    website_ocr_yaml_text: input.websiteOcrYamlText,
    spec_bundles: input.specBundles,
    website_observations: input.websiteObservations,
    images_pending: input.imagesPending,
    report: input.report,
    pm_review: normalizePmReview(input.pmReview),
    evidence,
    diagnostics: {
      user_agent:
        input.userAgent ??
        (typeof navigator === "undefined" ? "" : navigator.userAgent),
      human_confirmed_fields: countHumanConfirmed(
        input.websiteObservations,
      ),
      unverifiable_checks: reportCount(input.report, "UNVERIFIABLE"),
      fail_checks: reportCount(input.report, "FAIL"),
      evidence_counts: {
        spec: evidence.spec ? 1 : 0,
        website: evidence.website.length,
        aztek: evidence.aztek ? 1 : 0,
        receipt: evidence.receipt.length,
      },
    },
  };
}

export function parsePilotSession(raw: string): PilotSession {
  const decoded: unknown = JSON.parse(raw);
  let parsed: unknown = decoded;
  if (
    isRecord(decoded) &&
    decoded.export_type === "pack-qa-pilot-feedback" &&
    isRecord(decoded.session)
  ) {
    parsed = decoded.session;
  }
  if (!isRecord(parsed)) {
    throw new Error("ไฟล์งานต้องเป็น JSON object");
  }
  if (parsed.kind !== "pack-qa-pilot-session") {
    throw new Error("ไฟล์นี้ไม่ใช่งานที่บันทึกจาก Pack QA");
  }
  if (parsed.schema_version !== SESSION_SCHEMA_VERSION) {
    throw new Error("เวอร์ชันไฟล์งานนี้ยังไม่รองรับ");
  }
  if (
    !["excel", "form", "yaml"].includes(String(parsed.pack_mode)) ||
    !Array.isArray(parsed.spec_bundles) ||
    !Array.isArray(parsed.website_observations) ||
    !isRecord(parsed.evidence) ||
    !isRecord(parsed.diagnostics)
  ) {
    throw new Error("ไฟล์งาน Pack QA มีข้อมูลไม่ครบ");
  }
  return {
    ...(parsed as PilotSession),
    pm_review: normalizePmReview(parsed.pm_review),
  };
}

export function evidenceFromStored(
  evidence: StoredEvidence | null,
): EvidenceRef | null {
  return evidence
    ? { name: evidence.name, url: evidence.data_url }
    : null;
}

export function evidenceListFromStored(
  evidence: StoredEvidence[],
): EvidenceRef[] {
  return evidence.map((item) => ({
    name: item.name,
    url: item.data_url,
  }));
}

export function downloadPilotSession(
  session: PilotSession,
  prefix = "pack-qa-work",
) {
  downloadJson(session, `${prefix}-${fileTimestamp(session.saved_at)}.json`);
}

export function downloadFeedbackExport(session: PilotSession) {
  downloadJson(
    {
      export_type: "pack-qa-pilot-feedback",
      schema_version: SESSION_SCHEMA_VERSION,
      app_version: PILOT_VERSION,
      exported_at: new Date().toISOString(),
      session,
    },
    `pack-qa-feedback-${fileTimestamp(session.saved_at)}.json`,
  );
}

export async function saveLastDraft(session: PilotSession) {
  const database = await openDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(session, LAST_DRAFT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("บันทึก Draft ไม่สำเร็จ"));
  });
  database.close();
}

export async function loadLastDraft(): Promise<PilotSession | null> {
  const database = await openDraftDatabase();
  const result = await new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction
      .objectStore(STORE_NAME)
      .get(LAST_DRAFT_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () =>
      reject(request.error ?? new Error("เปิด Draft ไม่สำเร็จ"));
  });
  database.close();
  if (result === null) return null;
  return parsePilotSession(JSON.stringify(result));
}

export async function clearLastDraft() {
  const database = await openDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(LAST_DRAFT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("ล้าง Draft ไม่สำเร็จ"));
  });
  database.close();
}

function countHumanConfirmed(
  observations: ReviewedWebsiteObservation[],
) {
  return observations.reduce((total, bundle) => {
    const fields = [
      bundle.website.name,
      bundle.website.seed_point,
      bundle.website.gsp_earn,
      bundle.website.purchase_limit,
      ...bundle.website.items.flatMap((item) => [
        item.name,
        item.amount,
        item.chance,
      ]),
    ];
    return (
      total +
      fields.filter(
        (field) =>
          field.human_confirmed ||
          field.locator?.includes("human-confirmed"),
      ).length
    );
  }, 0);
}

function reportCount(report: unknown, status: string) {
  if (!isRecord(report) || !isRecord(report.summary)) return 0;
  const value = report.summary[status];
  return typeof value === "number" ? value : 0;
}

async function storeEvidence(
  evidence: EvidenceRef,
): Promise<StoredEvidence> {
  if (evidence.url.startsWith("data:")) {
    return { name: evidence.name, data_url: evidence.url };
  }
  const response = await fetch(evidence.url);
  if (!response.ok) {
    throw new Error(`อ่านภาพ ${evidence.name} เพื่อบันทึกไม่สำเร็จ`);
  }
  return {
    name: evidence.name,
    data_url: await blobToDataUrl(await response.blob()),
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("แปลงภาพไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

function downloadJson(payload: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileTimestamp(value: string) {
  return value.replaceAll(":", "").replaceAll("-", "").slice(0, 15);
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("เปิดพื้นที่ Draft ไม่สำเร็จ"));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
