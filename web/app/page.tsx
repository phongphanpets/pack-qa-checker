"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import ExcelPasteForm from "@/components/ExcelPasteForm";
import PackForm, {
  type PackFormDocument,
} from "@/components/PackForm";
import WebsiteImageReview, {
  type ReviewedWebsiteObservation,
} from "@/components/WebsiteImageReview";
import ReceiptEvidence from "@/components/ReceiptEvidence";
import HistoryPanel from "@/components/HistoryPanel";
import HistoryEvidenceEditor from "@/components/HistoryEvidenceEditor";
import {
  PILOT_VERSION,
  clearLastDraft,
  createPilotSession,
  downloadFeedbackExport,
  downloadPilotSession,
  evidenceFromStored,
  evidenceListFromStored,
  loadLastDraft,
  parsePilotSession,
  saveLastDraft,
  type EvidenceRef,
  type PackMode,
  type PilotSession,
} from "@/lib/pilot-session";
import type { SpecBundle } from "@/lib/website-ocr";
import {
  deleteHistory,
  listHistory,
  loadHistory,
  saveHistory,
  type HistoryEntry,
} from "@/lib/history";

type Status = "PASS" | "FAIL" | "WARN" | "UNVERIFIABLE";

type Finding = {
  rule_id: string;
  check: number;
  field: string;
  source: string;
  expected: unknown;
  actual: unknown;
  expected_raw_text?: string | null;
  actual_raw_text?: string | null;
  expected_locator?: string | null;
  actual_locator?: string | null;
  status: Status;
  severity: string;
  message: string;
};

type BundleReport = {
  bundle_id: number;
  name: string | null;
  findings: Finding[];
};

type ValidationReport = {
  generated_at: string;
  summary: Record<"bundles" | "checks" | Status, number>;
  bundles: BundleReport[];
};

type ResultRow = Finding & {
  bundle_id: number;
  bundle_name: string | null;
};

type CanonicalField = {
  value?: unknown;
};

type PmSpecItem = {
  item_id?: CanonicalField;
  name?: CanonicalField;
  amount?: CanonicalField;
  chance?: CanonicalField;
};

type PmSpec = {
  start_date?: CanonicalField;
  end_date?: CanonicalField;
  seed_point?: CanonicalField;
  gsp_earn?: CanonicalField;
  purchase_limit?: CanonicalField;
  reset_type?: CanonicalField;
  is_permanent?: CanonicalField;
  is_gacha?: boolean;
  items?: PmSpecItem[];
};

const API_URL = "http://127.0.0.1:8765/api/validate";
const statuses: Status[] = ["FAIL", "UNVERIFIABLE", "WARN", "PASS"];
const ruleLabels: Record<string, string> = {
  PACK_NAME_ADMIN: "ชื่อแพ็กใน Aztek Tool",
  PACK_NAME_WEBSITE: "ชื่อแพ็กบน Website",
  DATE_ADMIN: "ช่วงเวลาขายใน Aztek Tool",
  PERMANENT_ADMIN: "สถานะแพ็กถาวรใน Aztek Tool",
  SEED_POINT_WEBSITE: "ราคา Seed Point บน Website",
  GSP_EARN_WEBSITE: "Golden Seed Point ที่ได้รับ",
  PURCHASE_LIMIT_WEBSITE: "จำนวนครั้งที่ซื้อได้",
  ITEM_AMOUNT_WEBSITE: "จำนวนไอเทมบน Website",
  ITEM_CHANCE_WEBSITE: "โอกาสของไอเทมสุ่มบน Website",
  ITEM_DELIVERED_RECEIPT: "ไอเทมที่ได้รับจริงใน Receipt",
  GSP_EQ_SEED: "GSP ต้องเท่ากับราคา Seed Point",
  GACHA_CHANCE_SUM: "ผลรวมโอกาส Gacha",
};

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function decision(report: ValidationReport) {
  if (report.summary.FAIL > 0) {
    return {
      tone: "blocked",
      eyebrow: "ยังไม่พร้อมอนุมัติ",
      title: `พบข้อผิดพลาด ${report.summary.FAIL} จุด`,
      detail: "แก้ข้อมูลที่ผิดแล้วตรวจใหม่ก่อนปล่อยแพ็ก",
    };
  }
  if (report.summary.UNVERIFIABLE > 0) {
    return {
      tone: "review",
      eyebrow: "รอคนยืนยัน",
      title: `มีข้อมูลอ่านไม่ชัด ${report.summary.UNVERIFIABLE} จุด`,
      detail: "ไม่พบข้อผิด แต่ยังต้องตรวจหลักฐานภาพให้ครบ",
    };
  }
  if (report.summary.WARN > 0) {
    return {
      tone: "review",
      eyebrow: "ควรตรวจเพิ่มเติม",
      title: `มีคำเตือน ${report.summary.WARN} จุด`,
      detail: "ตรวจคำเตือนก่อนส่งอนุมัติ",
    };
  }
  return {
    tone: "ready",
    eyebrow: "พร้อมส่งอนุมัติ",
    title: `ผ่าน ${report.summary.PASS}/${report.summary.checks} รายการ`,
    detail: "ไม่พบข้อผิดพลาดหรือข้อมูลที่ยังยืนยันไม่ได้",
  };
}

export default function Home() {
  const [packMode, setPackMode] = useState<PackMode>("excel");
  const [packFile, setPackFile] = useState<File | null>(null);
  const [packYamlText, setPackYamlText] = useState<string | null>(
    null,
  );
  const [packData, setPackData] = useState<PackFormDocument | null>(
    null,
  );
  const [packFormValid, setPackFormValid] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [websiteOcrYamlText, setWebsiteOcrYamlText] = useState<
    string | null
  >(null);
  const [specBundles, setSpecBundles] = useState<SpecBundle[]>([]);
  const [websiteObservations, setWebsiteObservations] = useState<
    ReviewedWebsiteObservation[]
  >([]);
  const [imagesPending, setImagesPending] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [resultView, setResultView] = useState<"summary" | "detail">(
    "summary",
  );
  const [activeStatus, setActiveStatus] = useState<Status | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [specEvidence, setSpecEvidence] = useState<EvidenceRef | null>(null);
  const [websiteEvidence, setWebsiteEvidence] = useState<EvidenceRef[]>([]);
  const [aztekEvidence, setAztekEvidence] = useState<EvidenceRef | null>(null);
  const [receiptEvidence, setReceiptEvidence] = useState<EvidenceRef[]>([]);
  const [restoredSession, setRestoredSession] =
    useState<PilotSession | null>(null);
  const [resumeWebsiteReview, setResumeWebsiteReview] = useState(false);
  const [revisionDirty, setRevisionDirty] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [apiStatus, setApiStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");
  const restoreStarted = useRef(false);

  const rows = useMemo<ResultRow[]>(() => {
    if (!report) return [];
    return report.bundles.flatMap((bundle) =>
      bundle.findings.map((finding) => ({
        ...finding,
        bundle_id: bundle.bundle_id,
        bundle_name: bundle.name,
      })),
    );
  }, [report]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const statusMatches =
        activeStatus === "ALL" || row.status === activeStatus;
      const searchMatches =
        !needle ||
        [
          row.bundle_id,
          row.bundle_name,
          row.rule_id,
          row.field,
          row.source,
          row.expected,
          row.actual,
        ]
          .map(display)
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      return statusMatches && searchMatches;
    });
  }, [rows, activeStatus, query]);
  const handleWebsiteObservations = useCallback(
    (observations: ReviewedWebsiteObservation[]) => {
      setWebsiteObservations(observations);
    },
    [],
  );
  const handleImagesPending = useCallback((pending: boolean) => {
    setImagesPending(pending);
  }, []);
  const handlePackForm = useCallback(
    (
      document: PackFormDocument,
      bundles: SpecBundle[],
      valid: boolean,
    ) => {
      setPackData(document);
      setSpecBundles(bundles);
      setPackFormValid(valid);
      setReport(null);
    },
    [],
  );

  const restoreWork = useCallback((session: PilotSession) => {
    setPackMode(session.pack_mode);
    setPackFile(null);
    setPackYamlText(session.pack_yaml_text);
    setPackData(session.pack_data);
    setPackFormValid(session.pack_form_valid);
    setOcrFile(null);
    setWebsiteOcrYamlText(session.website_ocr_yaml_text);
    setSpecBundles(session.spec_bundles);
    setWebsiteObservations(session.website_observations);
    setImagesPending(false);
    setReport(session.report as ValidationReport | null);
    setSpecEvidence(evidenceFromStored(session.evidence.spec));
    setWebsiteEvidence(
      evidenceListFromStored(session.evidence.website),
    );
    setAztekEvidence(evidenceFromStored(session.evidence.aztek));
    setReceiptEvidence(
      evidenceListFromStored(session.evidence.receipt),
    );
    setRestoredSession(session);
    setResumeWebsiteReview(!session.website_observations.length);
    setRevisionDirty(false);
    setResultView("summary");
    setWorkspaceKey((value) => value + 1);
  }, []);

  const createSession = useCallback(
    (reportOverride?: ValidationReport | null) =>
      createPilotSession({
        packMode,
        packData,
        packFormValid,
        packYamlName: packFile?.name ?? restoredSession?.pack_yaml_name ?? null,
        packYamlText,
        websiteOcrYamlText,
        specBundles,
        websiteObservations,
        imagesPending,
        report: reportOverride === undefined ? report : reportOverride,
        specEvidence,
        websiteEvidence,
        aztekEvidence,
        receiptEvidence,
      }),
    [
      aztekEvidence,
      imagesPending,
      packData,
      packFile?.name,
      packFormValid,
      packMode,
      packYamlText,
      receiptEvidence,
      report,
      restoredSession?.pack_yaml_name,
      specBundles,
      specEvidence,
      websiteEvidence,
      websiteObservations,
      websiteOcrYamlText,
    ],
  );

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistoryEntries(await listHistory());
      setHistoryError("");
    } catch {
      setHistoryError("ยังเชื่อมประวัติไม่ได้ กรุณาตรวจว่า API เปิดอยู่");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
    void (async () => {
      try {
        const draft = await loadLastDraft();
        if (draft && hasSessionContent(draft)) {
          restoreWork(draft);
          if (draft.report) {
            await saveHistory(draft).catch(() => undefined);
          }
        }
      } catch {
        setDraftStatus("error");
      } finally {
        setDraftReady(true);
      }
    })();
  }, [restoreWork]);

  useEffect(() => {
    let active = true;
    void fetch("http://127.0.0.1:8765/api/health")
      .then((response) => {
        if (active) setApiStatus(response.ok ? "online" : "offline");
      })
      .catch(() => {
        if (active) setApiStatus("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (apiStatus === "online") void refreshHistory();
  }, [apiStatus, refreshHistory]);

  useEffect(() => {
    if (
      !draftReady ||
      imagesPending ||
      (!packFormValid && !packYamlText && !report)
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDraftStatus("saving");
      void createSession()
        .then(saveLastDraft)
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("error"));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    createSession,
    draftReady,
    imagesPending,
    packData,
    packFormValid,
    packYamlText,
    report,
  ]);

  function switchPackMode(mode: PackMode) {
    if (mode === packMode) return;
    setPackMode(mode);
    setPackFile(null);
    setPackYamlText(null);
    setPackData(null);
    setSpecBundles([]);
    setWebsiteObservations([]);
    setImagesPending(false);
    setReport(null);
    setError("");
  }

  async function selectPack(file: File | null) {
    setPackFile(file);
    setPackYamlText(null);
    setSpecBundles([]);
    setWebsiteObservations([]);
    setReport(null);
    setError("");
    if (!file) return;

    setInspecting(true);
    try {
      const packYaml = await file.text();
      setPackYamlText(packYaml);
      const response = await fetch("http://127.0.0.1:8765/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_yaml: packYaml }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "อ่าน Pack YAML ไม่สำเร็จ");
      }
      setSpecBundles(payload.bundles);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "อ่าน Pack YAML ไม่สำเร็จ";
      setError(
        message === "Failed to fetch"
          ? "เชื่อม Local API ไม่ได้ — เปิด Pack QA API ที่พอร์ต 8765 ก่อน"
          : message,
      );
    } finally {
      setInspecting(false);
    }
  }

  async function validate() {
    if (
      (packMode === "yaml" && !packYamlText) ||
      (packMode !== "yaml" && (!packData || !packFormValid))
    ) {
      setError(
        packMode === "yaml"
          ? "เลือก Pack YAML ก่อนเริ่มตรวจ"
          : packMode === "excel"
            ? "วางตาราง Excel และข้อมูล Aztek Tool ที่มี Name, Start และ End ให้ครบก่อน"
            : "กรอก bundle_id, ชื่อแพ็ก และ item_id ให้ครบก่อน",
      );
      return;
    }
    if (imagesPending) {
      setError("กรุณาอ่านภาพ Website และตรวจค่าที่ได้ให้เสร็จก่อน");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack_yaml:
            packMode === "yaml" && packYamlText
              ? packYamlText
              : null,
          pack_data: packMode !== "yaml" ? packData : null,
          website_ocr_yaml: websiteOcrYamlText,
          website_observations: websiteObservations.length
            ? websiteObservations
            : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "ตรวจข้อมูลไม่สำเร็จ");
      }
      setReport(payload);
      setRevisionDirty(false);
      try {
        const session = await createSession(payload);
        await saveHistory(session);
        await refreshHistory();
      } catch {
        setHistoryError(
          "ตรวจสำเร็จ แต่ยังบันทึกประวัติไม่ได้ กรุณากดตรวจอีกครั้งหลังเปิด API",
        );
      }
      setResultView("summary");
      setActiveStatus("ALL");
      setQuery("");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "เกิดข้อผิดพลาด";
      setError(
        message === "Failed to fetch"
          ? "เชื่อม Local API ไม่ได้ — เปิด Pack QA API ที่พอร์ต 8765 ก่อน"
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  async function selectOcrFile(file: File | null) {
    setOcrFile(file);
    setWebsiteOcrYamlText(file ? await file.text() : null);
  }

  async function saveWork() {
    if (imagesPending) {
      setError("รอให้ OCR อ่านภาพเสร็จก่อนบันทึกงาน");
      return;
    }
    try {
      setDraftStatus("saving");
      const session = await createSession();
      await saveLastDraft(session);
      downloadPilotSession(session);
      setDraftStatus("saved");
      setError("");
    } catch (caught) {
      setDraftStatus("error");
      setError(
        caught instanceof Error ? caught.message : "บันทึกงานไม่สำเร็จ",
      );
    }
  }

  async function exportFeedback() {
    if (!report) return;
    try {
      downloadFeedbackExport(await createSession());
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Export Feedback ไม่สำเร็จ",
      );
    }
  }

  async function loadWork(file: File | null) {
    if (!file) return;
    try {
      const session = parsePilotSession(await file.text());
      restoreWork(session);
      await saveLastDraft(session);
      if (session.report) {
        await saveHistory(session);
        await refreshHistory();
      }
      setDraftStatus("saved");
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "เปิดงานไม่สำเร็จ",
      );
    }
  }

  async function openHistory(entryId: string) {
    setHistoryLoading(true);
    try {
      restoreWork(await loadHistory(entryId));
      setHistoryError("");
    } catch (caught) {
      setHistoryError(
        caught instanceof Error ? caught.message : "เปิดประวัติไม่สำเร็จ",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function removeHistory(entryId: string) {
    if (!window.confirm("ลบประวัติรายการนี้ใช่ไหม?")) return;
    setHistoryLoading(true);
    try {
      await deleteHistory(entryId);
      await refreshHistory();
    } catch (caught) {
      setHistoryError(
        caught instanceof Error ? caught.message : "ลบประวัติไม่สำเร็จ",
      );
      setHistoryLoading(false);
    }
  }

  async function saveHistoryRevision() {
    if (imagesPending) {
      setError("รอให้ OCR อ่านภาพเสร็จก่อนบันทึกการแก้ไข");
      return;
    }
    try {
      setDraftStatus("saving");
      const session = await createSession();
      await saveLastDraft(session);
      await saveHistory(session);
      setRestoredSession(session);
      await refreshHistory();
      setDraftStatus("saved");
      setError("");
    } catch (caught) {
      setDraftStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "บันทึกการแก้ไขลง History ไม่สำเร็จ",
      );
    }
  }

  async function resetWork() {
    await clearLastDraft().catch(() => undefined);
    setPackMode("excel");
    setPackFile(null);
    setPackYamlText(null);
    setPackData(null);
    setPackFormValid(false);
    setOcrFile(null);
    setWebsiteOcrYamlText(null);
    setSpecBundles([]);
    setWebsiteObservations([]);
    setImagesPending(false);
    setReport(null);
    setSpecEvidence(null);
    setWebsiteEvidence([]);
    setAztekEvidence(null);
    setReceiptEvidence([]);
    setRestoredSession(null);
    setResumeWebsiteReview(false);
    setRevisionDirty(false);
    setDraftStatus("idle");
    setError("");
    setWorkspaceKey((value) => value + 1);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PQ</span>
          <div>
            <strong>Pack QA</strong>
            <span>Validation System</span>
          </div>
        </div>
        <div className="topbar-status">
          <span className="pilot-badge">{PILOT_VERSION}</span>
          <div className={`local-badge ${apiStatus}`}>
            <span className="pulse" />
            {apiStatus === "online"
              ? "ระบบพร้อม"
              : apiStatus === "offline"
                ? "API ยังไม่พร้อม"
                : "กำลังตรวจระบบ"}
          </div>
        </div>
      </header>

      <div className="pilot-notice">
        <strong>เวอร์ชันทดลองใช้งาน</strong>
        <span>ใช้ช่วยตรวจเท่านั้น · Excel ยังเป็นเอกสารอนุมัติหลัก</span>
      </div>

      <section className="hero">
        <div className="eyebrow">ตรวจตั้งแต่ Draft จนพร้อมอนุมัติ</div>
        <h1>เช็กแพ็กให้ครบ ก่อนส่ง PM</h1>
        <p>
          เริ่มตรวจได้ตั้งแต่งานยังไม่ครบ เติมภาพ Product และ Receipt ภายหลัง
          แล้วตรวจซ้ำจนข้อมูลพร้อมสำหรับการอนุมัติ
        </p>
      </section>

      <section className="workspace">
        <aside className="input-panel">
          <div className="panel-heading">
            <span className="step">01</span>
            <div>
              <h2>เตรียมข้อมูล</h2>
              <p>ไฟล์จะถูกประมวลผลในเครื่องนี้เท่านั้น</p>
            </div>
          </div>

          <section className="work-controls" aria-label="บันทึกและเปิดงาน">
            <div className={`draft-state ${draftStatus}`}>
              <span aria-hidden>
                {draftStatus === "saving"
                  ? "…"
                  : draftStatus === "saved"
                    ? "✓"
                    : draftStatus === "error"
                      ? "!"
                      : "○"}
              </span>
              <div>
                <strong>
                  {draftStatus === "saving"
                    ? "กำลังบันทึกอัตโนมัติ"
                    : draftStatus === "saved"
                      ? "บันทึก Draft ในเครื่องแล้ว"
                      : draftStatus === "error"
                        ? "บันทึกอัตโนมัติไม่สำเร็จ"
                        : "Draft จะบันทึกอัตโนมัติ"}
                </strong>
                <small>
                  บันทึกเมื่อข้อมูลพร้อม แล้วกลับมาเปิดต่อได้หลังรีเฟรช
                </small>
              </div>
            </div>
            <div className="work-actions">
              <button
                type="button"
                onClick={() => void saveWork()}
                disabled={
                  imagesPending ||
                  (!packFormValid && !packYamlText && !report)
                }
              >
                บันทึกงาน
              </button>
              <label>
                เปิดงาน
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    void loadWork(event.target.files?.[0] || null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </section>

          <HistoryPanel
            entries={historyEntries}
            loading={historyLoading}
            error={historyError}
            onOpen={(entryId) => void openHistory(entryId)}
            onDelete={(entryId) => void removeHistory(entryId)}
            onRefresh={() => void refreshHistory()}
          />

          {restoredSession ? (
            <section className="restored-work">
              <div className="restored-work-head">
                <span aria-hidden>✓</span>
                <div>
                  <strong>เปิดงานที่บันทึกไว้แล้ว</strong>
                  <small>
                    บันทึกเมื่อ{" "}
                    {new Date(restoredSession.saved_at).toLocaleString(
                      "th-TH",
                    )}
                  </small>
                </div>
              </div>
              <div className="restored-work-stats">
                <span>
                  <b>{specBundles.length}</b> bundle
                </span>
                <span>
                  <b>{websiteObservations.length}</b> Website OCR
                </span>
                <span>
                  <b>
                    {websiteEvidence.length +
                      (specEvidence ? 1 : 0) +
                      (aztekEvidence ? 1 : 0) +
                      receiptEvidence.length}
                  </b>{" "}
                  ภาพหลักฐาน
                </span>
              </div>
              <p>
                Canonical data, ค่าที่คนยืนยัน และหลักฐานถูกกู้คืนแล้ว
                สามารถเพิ่มรูปหลักฐาน กดตรวจใหม่ หรือดูผลเดิมทางขวาได้
              </p>
              <div className="restored-work-actions">
                <button
                  type="button"
                  className="recheck-website"
                  onClick={() =>
                    setResumeWebsiteReview((current) => !current)
                  }
                >
                  {resumeWebsiteReview
                    ? "ปิดส่วนตรวจ Website เพิ่ม"
                    : "ตรวจ Website เพิ่มเพื่อเปลี่ยนผล"}
                </button>
                <button
                  type="button"
                  className="save-revision"
                  onClick={() => void saveHistoryRevision()}
                  disabled={imagesPending}
                >
                  บันทึกการแก้ไขลง History
                </button>
                <button type="button" onClick={() => void resetWork()}>
                  เริ่มงานใหม่
                </button>
              </div>
              <HistoryEvidenceEditor
                website={websiteEvidence}
                receipt={receiptEvidence}
                onWebsiteChange={setWebsiteEvidence}
                onReceiptChange={setReceiptEvidence}
              />
              {revisionDirty && (
                <div className="history-recheck-note">
                  <strong>มีภาพ Website ชุดใหม่แล้ว</strong>
                  <span>
                    ตรวจและยืนยันค่า OCR ให้ครบ จากนั้นกด “เริ่มตรวจแพ็ก”
                    ด้านล่างเพื่อคำนวณผลใหม่และสร้าง History revision
                  </span>
                </div>
              )}
              {resumeWebsiteReview && (
                <WebsiteImageReview
                  key={`restored-website-${workspaceKey}`}
                  bundles={specBundles}
                  disabled={!specBundles.length}
                  onChange={handleWebsiteObservations}
                  onPendingChange={handleImagesPending}
                  onEvidenceChange={setWebsiteEvidence}
                  initialObservations={websiteObservations}
                  initialEvidence={websiteEvidence}
                  onRevisionChange={setRevisionDirty}
                />
              )}
            </section>
          ) : (
            <>
              <div className="input-mode-tabs">
                <button
                  type="button"
                  className={packMode === "excel" ? "active" : ""}
                  onClick={() => switchPackMode("excel")}
                >
                  วาง Excel
                </button>
                <button
                  type="button"
                  className={packMode === "form" ? "active" : ""}
                  onClick={() => switchPackMode("form")}
                >
                  กรอกฟอร์ม
                </button>
                <button
                  type="button"
                  className={packMode === "yaml" ? "active" : ""}
                  onClick={() => switchPackMode("yaml")}
                >
                  ใช้ YAML เดิม
                </button>
              </div>

              {packMode === "excel" ? (
                <ExcelPasteForm
                  key={`excel-${workspaceKey}`}
                  onChange={handlePackForm}
                  onSpecEvidenceChange={setSpecEvidence}
                  onAztekEvidenceChange={setAztekEvidence}
                />
              ) : packMode === "form" ? (
                <PackForm key={`form-${workspaceKey}`} onChange={handlePackForm} />
              ) : (
                <FilePicker
                  id="pack-yaml"
                  title="Pack YAML"
                  description="Spec, Aztek Tool และ Receipt"
                  required
                  file={packFile}
                  onChange={selectPack}
                />
              )}
              {(packFile || packMode !== "yaml") &&
                specBundles.length > 0 && (
                <div className="pack-loaded">
                  <span>{inspecting ? "…" : "✓"}</span>
                  {inspecting
                    ? "กำลังอ่านรายการ bundle"
                    : `${specBundles.length} bundle พร้อมจับคู่ภาพ`}
                </div>
              )}

              <WebsiteImageReview
                key={`website-${packMode}-${workspaceKey}`}
                bundles={specBundles}
                disabled={inspecting || !specBundles.length}
                onChange={handleWebsiteObservations}
                onPendingChange={handleImagesPending}
                onEvidenceChange={setWebsiteEvidence}
              />

              <ReceiptEvidence
                key={`receipt-${workspaceKey}`}
                onEvidenceChange={setReceiptEvidence}
              />

              <details className="legacy-ocr">
                <summary>มี Website OCR YAML อยู่แล้ว</summary>
                <FilePicker
                  id="ocr-yaml"
                  title="Website OCR YAML"
                  description="ทางเลือกสำหรับข้อมูล observation เดิม"
                  file={ocrFile}
                  onChange={selectOcrFile}
                />
              </details>
            </>
          )}

          {error && (
            <div className="error-banner" role="alert">
              <span>!</span>
              {error}
            </div>
          )}

          <button
            className="validate-button"
            type="button"
            onClick={validate}
            disabled={loading || inspecting || imagesPending}
          >
            {loading ? "กำลังตรวจ…" : "เริ่มตรวจแพ็ก"}
            <span aria-hidden>→</span>
          </button>

          <div className="privacy-note">
            <span className="shield">✓</span>
            <div>
              <strong>ข้อมูลไม่ออกจากเครื่อง</strong>
              <p>หน้าเว็บคุยกับ 127.0.0.1 เท่านั้น</p>
            </div>
          </div>
        </aside>

        <section className="results-panel">
          <div className="panel-heading results-heading">
            <span className="step">02</span>
            <div>
              <h2>ผลการตรวจ</h2>
              <p>
                {report
                  ? `${report.summary.bundles} bundle · ${report.summary.checks} checks`
                  : "รอข้อมูลสำหรับการตรวจ"}
              </p>
            </div>
            {report && (
              <button
                className="download-button"
                type="button"
                onClick={() => void exportFeedback()}
              >
                Export Feedback
              </button>
            )}
          </div>

          {!report ? (
            <div className="empty-state">
              <div className="radar">
                <span />
                <span />
                <span />
              </div>
              <h3>พร้อมตรวจเมื่อคุณพร้อม</h3>
              <p>
                วางข้อมูลจาก Excel แล้วแนบภาพ Website ทางซ้าย
                ผลตรวจจะปรากฏในพื้นที่นี้
              </p>
              <ol>
                <li><span>1</span>โหลด canonical data</li>
                <li><span>2</span>ตรวจ declarative rules</li>
                <li><span>3</span>เปิด provenance ย้อนกลับได้</li>
              </ol>
            </div>
          ) : (
            <>
              <div
                className={`decision-banner ${
                  decision(report).tone
                }`}
              >
                <div className="decision-icon" aria-hidden>
                  {decision(report).tone === "ready"
                    ? "✓"
                    : decision(report).tone === "blocked"
                      ? "!"
                      : "?"}
                </div>
                <div>
                  <span>{decision(report).eyebrow}</span>
                  <strong>{decision(report).title}</strong>
                  <p>{decision(report).detail}</p>
                </div>
              </div>

              <div className="result-view-tabs">
                <button
                  type="button"
                  className={resultView === "summary" ? "active" : ""}
                  onClick={() => setResultView("summary")}
                >
                  สรุปสำหรับ PM
                </button>
                <button
                  type="button"
                  className={resultView === "detail" ? "active" : ""}
                  onClick={() => setResultView("detail")}
                >
                  รายละเอียด QA
                </button>
              </div>

              {resultView === "summary" ? (
                <section className="pm-summary">
                  <PmReview
                    report={report}
                    document={packData}
                    rows={rows}
                    specEvidence={specEvidence}
                    websiteEvidence={websiteEvidence}
                    aztekEvidence={aztekEvidence}
                    receiptEvidence={receiptEvidence}
                  />
                </section>
              ) : (
                <>
              <div className="summary-grid">
                {statuses.map((status) => (
                  <button
                    key={status}
                    className={`summary-card ${status.toLowerCase()} ${
                      activeStatus === status ? "active" : ""
                    }`}
                    onClick={() =>
                      setActiveStatus(
                        activeStatus === status ? "ALL" : status,
                      )
                    }
                    type="button"
                  >
                    <span>{status}</span>
                    <strong>{report.summary[status]}</strong>
                  </button>
                ))}
              </div>

              <div className="table-tools">
                <label className="search-box">
                  <span aria-hidden>⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ค้นหา bundle, rule, field…"
                    aria-label="ค้นหาผลการตรวจ"
                  />
                </label>
                <button
                  type="button"
                  className={`problem-toggle ${
                    activeStatus === "FAIL" ? "active" : ""
                  }`}
                  onClick={() =>
                    setActiveStatus(
                      activeStatus === "FAIL" ? "ALL" : "FAIL",
                    )
                  }
                >
                  เฉพาะข้อผิด
                </button>
                <span className="row-count">{visibleRows.length} รายการ</span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Bundle</th>
                      <th>Rule / Field</th>
                      <th>Expected</th>
                      <th>Actual</th>
                      <th>Source & Locator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, index) => (
                      <tr key={`${row.bundle_id}-${row.rule_id}-${index}`}>
                        <td>
                          <span
                            className={`status-pill ${row.status.toLowerCase()}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <code>{row.bundle_id}</code>
                          <small>{row.bundle_name || "—"}</small>
                        </td>
                        <td>
                          <strong>{row.rule_id}</strong>
                          <code>{row.field}</code>
                        </td>
                        <td className="value-cell">
                          {display(row.expected)}
                          {row.expected_raw_text && (
                            <small>{row.expected_raw_text}</small>
                          )}
                        </td>
                        <td className="value-cell">
                          {display(row.actual)}
                          {row.actual_raw_text && (
                            <small>{row.actual_raw_text}</small>
                          )}
                        </td>
                        <td className="locator-cell">
                          <span>{row.source}</span>
                          <small>
                            {row.actual_locator ||
                              row.expected_locator ||
                              "ไม่มี locator"}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleRows.length && (
                  <div className="no-results">ไม่พบรายการตามตัวกรอง</div>
                )}
              </div>
                </>
              )}
            </>
          )}
        </section>
      </section>

      <footer>
        <span>Phase 1 · ตรวจอย่างเดียว · Excel approval ยังอยู่</span>
        <span>Canonical model → Rule engine → Report</span>
      </footer>
    </main>
  );
}

function FilePicker({
  id,
  title,
  description,
  required = false,
  file,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  required?: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className={`file-picker ${file ? "has-file" : ""}`} htmlFor={id}>
      <input
        id={id}
        type="file"
        accept=".yaml,.yml"
        onChange={(event) =>
          onChange(event.target.files?.item(0) || null)
        }
      />
      <span className="file-icon">{file ? "✓" : "+"}</span>
      <span className="file-copy">
        <strong>
          {title}
          {required && <em>required</em>}
        </strong>
        <small>{file ? file.name : description}</small>
      </span>
      <span className="browse">{file ? "เปลี่ยน" : "เลือกไฟล์"}</span>
    </label>
  );
}

function PmReview({ report, document, rows, specEvidence, websiteEvidence, aztekEvidence, receiptEvidence }: {
  report: ValidationReport;
  document: PackFormDocument | null;
  rows: ResultRow[];
  specEvidence: EvidenceRef | null;
  websiteEvidence: EvidenceRef[];
  aztekEvidence: EvidenceRef | null;
  receiptEvidence: EvidenceRef[];
}) {
  const bundle = document?.bundles[0] as
    | { spec?: PmSpec }
    | undefined;
  const spec = bundle?.spec || {};
  const isGacha = Boolean(spec.is_gacha);
  const isPermanent = Boolean(spec.is_permanent?.value);
  const issues = rows.filter((row) => row.status !== "PASS" && row.source !== "receipt");
  const itemRows = rows.filter((row) => row.rule_id === "ITEM_AMOUNT_WEBSITE");
  const checkCards = [
    pmCheck("ชื่อแพ็กใน Aztek Tool", rows.filter((row) => row.rule_id === "PACK_NAME_ADMIN"), "ชื่อ Req เทียบกับ Aztek Tool"),
    pmCheck("ชื่อแพ็กบน Website", rows.filter((row) => row.rule_id === "PACK_NAME_WEBSITE"), "ชื่อที่แสดงบน Website เทียบกับ Req"),
    pmCheck(
      isPermanent ? "วันเปิดและสถานะถาวร" : "วันเปิด–ปิด",
      rows.filter((row) => ["DATE_ADMIN", "PERMANENT_ADMIN"].includes(row.rule_id)),
      isPermanent ? "วันเปิดต้องตรง Req และ Aztek Tool ต้องตั้งวันจบระยะยาว" : "Start และ End เทียบกับ Req",
    ),
    pmCheck("ราคา SP และ GSP", rows.filter((row) => ["SEED_POINT_WEBSITE", "GSP_EQ_SEED"].includes(row.rule_id)), "ราคา Website ต้องตรง Req และ GSP ต้องเท่ากับ Seed Point"),
    pmCheck("จำนวนครั้งที่ซื้อ", rows.filter((row) => row.rule_id === "PURCHASE_LIMIT_WEBSITE"), "Limit บน Website เทียบกับ Req"),
    {
      title: "รายการและจำนวนไอเทม",
      detail: `${itemRows.filter((row) => row.status === "PASS").length}/${itemRows.length} รายการตรง Req`,
      status: itemRows.some((row) => row.status === "FAIL") ? "FAIL" : itemRows.some((row) => row.status !== "PASS") ? "REVIEW" : "PASS",
    },
    {
      title: "หลักฐานภาพ",
      detail: `Req ${specEvidence ? 1 : 0} · Website ${websiteEvidence.length} · Aztek ${aztekEvidence ? 1 : 0} · Receipt ${receiptEvidence.length}`,
      status: specEvidence && websiteEvidence.length && aztekEvidence ? "PASS" : "REVIEW",
    },
    ...(isGacha
      ? [
          pmCheck(
            "Chance บน Website",
            rows.filter((row) => row.rule_id === "ITEM_CHANCE_WEBSITE"),
            "โอกาสของแต่ละ outcome เทียบกับ Req",
          ),
          pmCheck(
            "ผลรวมโอกาสแพ็กสุ่ม",
            rows.filter((row) => row.rule_id === "GACHA_CHANCE_SUM"),
            "ผลรวม Chance ของทุก outcome ต้องเท่ากับ 100%",
          ),
        ]
      : []),
  ];
  return <div className="pm-review">
    <div className={`pm-review-status ${issues.length ? "review" : "ready"}`}><strong>{issues.length ? `รอยืนยัน ${issues.length} จุด` : "พร้อมให้ PM อนุมัติ"}</strong><span>{issues.length ? "ดูจุดที่ต้องตรวจในหลักฐานด้านล่าง" : "ผลที่ตรวจได้ทั้งหมดตรงตาม Req"}</span></div>
    <section className="pm-checked">
      <header><div><strong>ตรวจอะไรไปบ้าง</strong><small>สรุปเงื่อนไขที่ระบบใช้ตัดสินรอบนี้</small></div><span>{report.summary.PASS}/{report.summary.checks} ผ่าน</span></header>
      <div className="pm-check-grid">
        {checkCards.map((check) => <article className={`pm-check ${check.status.toLowerCase()}`} key={check.title}><span>{check.status === "PASS" ? "✓" : check.status === "FAIL" ? "!" : "?"}</span><div><strong>{check.title}</strong><small>{check.detail}</small></div><b>{check.status === "PASS" ? "ผ่าน" : check.status === "FAIL" ? "ไม่ผ่าน" : "ตรวจเพิ่ม"}</b></article>)}
      </div>
    </section>
    <PmSection title="1. Request parameters จาก Excel" subtitle="Req ต้นทางสำหรับการอนุมัติ" images={specEvidence ? [specEvidence] : []} centerImages modalImages>
      <div className="pm-params"><span>Start–End <b>{fieldValue(spec.start_date)} → {isPermanent ? "ถาวร" : fieldValue(spec.end_date)}</b></span><span>Seed Point <b>{fieldValue(spec.seed_point)}</b></span><span>GSP <b>{fieldValue(spec.gsp_earn)}</b></span><span>Limit <b>{fieldValue(spec.purchase_limit)}</b></span><span>Reset <b>{fieldValue(spec.reset_type)}</b></span></div>
      <div className={`pm-item-table ${isGacha ? "gacha" : ""}`}><b>Item ID</b><b>Item name</b><b>Amt</b>{isGacha && <b>Chance</b>}{(spec.items || []).map((item, index) => <Fragment key={`${fieldValue(item.item_id)}-${index}`}><code>{fieldValue(item.item_id)}</code><span>{fieldValue(item.name)}</span><strong>x{fieldValue(item.amount)}</strong>{isGacha && <em>{item.chance !== null && item.chance !== undefined ? `${fieldValue(item.chance)}%` : "Fixed"}</em>}</Fragment>)}</div>
    </PmSection>
    <PmSection title="2. Website" subtitle="ผลเทียบกับ Req และหลักฐานภาพ Website" images={websiteEvidence} modalImages>
      <PmFindings rows={rows.filter((row) => row.source === "website" && row.status !== "PASS")} empty="Website ที่ตรวจได้ตรงตาม Req" />
    </PmSection>
    <PmSection title="3. Aztek Tool" subtitle="ชื่อแพ็กและช่วงเวลาที่อ่านจาก Aztek Tool" images={aztekEvidence ? [aztekEvidence] : []} modalImages>
      <PmFindings rows={rows.filter((row) => row.source === "admin" && row.status !== "PASS")} empty="ข้อมูล Aztek Tool ได้รับการยืนยันแล้ว" />
    </PmSection>
    <PmSection title="4. Receipt" subtitle="หลักฐานประกอบสำหรับ PM — ไม่กระทบผลตรวจใน Phase นี้" images={receiptEvidence}>
      {!receiptEvidence.length && <p className="pm-empty">ยังไม่ได้แนบ Receipt</p>}
    </PmSection>
  </div>;
}

function PmSection({ title, subtitle, images, children, centerImages = false, modalImages = false }: {
  title: string;
  subtitle: string;
  images: EvidenceRef[];
  children: ReactNode;
  centerImages?: boolean;
  modalImages?: boolean;
}) {
  const [previewImage, setPreviewImage] = useState<EvidenceRef | null>(null);
  return (
    <section className="pm-section">
      <header><div><strong>{title}</strong><small>{subtitle}</small></div></header>
      {children}
      {images.length > 0 && (
        <div className={`pm-evidence ${centerImages ? "centered" : ""}`}>
          {images.map((image) => modalImages ? (
            <button className="pm-evidence-button" key={image.url} type="button" onClick={() => setPreviewImage(image)} aria-label={`เปิดภาพ ${image.name}`}>
              <img src={image.url} alt={image.name} />
              <span>{image.name}</span>
              <b>กดเพื่อขยาย</b>
            </button>
          ) : (
            <a key={image.url} href={image.url} target="_blank" rel="noreferrer">
              <img src={image.url} alt={image.name} />
              <span>{image.name}</span>
            </a>
          ))}
        </div>
      )}
      {previewImage && (
        <div className="image-modal" role="dialog" aria-modal="true" aria-label="ภาพ Website ขนาดเต็ม" onClick={() => setPreviewImage(null)}>
          <div className="image-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="image-modal-head">
              <strong>{previewImage.name}</strong>
              <button type="button" onClick={() => setPreviewImage(null)}>ปิด</button>
            </div>
            <img src={previewImage.url} alt={previewImage.name} />
          </div>
        </div>
      )}
    </section>
  );
}

function PmFindings({ rows, empty }: { rows: ResultRow[]; empty: string }) {
  return rows.length ? <div className="pm-findings">{rows.map((row, index) => <div key={`${row.rule_id}-${index}`}><b>{ruleLabels[row.rule_id] || row.rule_id}</b><span>{row.status} · {display(row.actual)}</span></div>)}</div> : <p className="pm-empty">{empty}</p>;
}

function fieldValue(field?: CanonicalField) {
  return display(field?.value);
}

function pmCheck(title: string, rows: ResultRow[], detail: string) {
  const status = rows.some((row) => row.status === "FAIL")
    ? "FAIL"
    : rows.some((row) => row.status !== "PASS") || !rows.length
      ? "REVIEW"
      : "PASS";
  return { title, detail, status };
}

function hasSessionContent(session: PilotSession) {
  return Boolean(
    (session.pack_form_valid && session.pack_data) ||
      session.pack_yaml_text ||
      session.report,
  );
}
