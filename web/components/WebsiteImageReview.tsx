"use client";

import { useEffect, useRef, useState } from "react";

import {
  attestFieldMatchesSpec,
  confirmField,
  confirmObservedField,
  createLocalOcrWorker,
  recognizeWebsiteScreenshot,
  reviewFieldStatus,
  type ObservedField,
  type SpecBundle,
  type WebsiteObservationDraft,
} from "@/lib/website-ocr";

export type ReviewedWebsiteObservation = {
  bundle_id: number;
  website: WebsiteObservationDraft;
};

type ImageJob = {
  id: string;
  file: File;
  previewUrl: string;
  bundleId: string;
  status: "idle" | "reading" | "ready" | "error";
  progress: number;
  error?: string;
  observation?: WebsiteObservationDraft;
};

export default function WebsiteImageReview({
  bundles,
  disabled,
  onChange,
  onPendingChange,
  onEvidenceChange,
  initialObservations = [],
  initialEvidence = [],
  onRevisionChange,
}: {
  bundles: SpecBundle[];
  disabled: boolean;
  onChange: (observations: ReviewedWebsiteObservation[]) => void;
  onPendingChange: (pending: boolean) => void;
  onEvidenceChange?: (images: Array<{ name: string; url: string }>) => void;
  initialObservations?: ReviewedWebsiteObservation[];
  initialEvidence?: Array<{ name: string; url: string }>;
  onRevisionChange?: (dirty: boolean) => void;
}) {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [previewJob, setPreviewJob] = useState<ImageJob | null>(null);
  const jobsRef = useRef<ImageJob[]>([]);
  const initialObservationsRef = useRef(initialObservations);
  const initialEvidenceRef = useRef(initialEvidence);
  useEffect(() => {
    jobsRef.current = jobs;
    onPendingChange(
      jobs.length > 0 &&
        jobs.some(
          (job) => job.bundleId === "" || job.status !== "ready",
        ),
    );
    onChange(
      mergeReviewedObservations(
        initialObservationsRef.current,
        combineReadyJobs(jobs),
      ),
    );
    onEvidenceChange?.([
      ...initialEvidenceRef.current,
      ...jobs.map((job) => ({
        name: job.file.name,
        url: job.previewUrl,
      })),
    ]);
    onRevisionChange?.(jobs.length > 0);
  }, [
    jobs,
    onChange,
    onPendingChange,
    onEvidenceChange,
    onRevisionChange,
  ]);

  useEffect(
    () => () => {
      jobsRef.current.forEach((job) =>
        URL.revokeObjectURL(job.previewUrl),
      );
    },
    [],
  );

  function addFiles(files: FileList | null) {
    if (!files) return;
    const additions = [...files].map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      bundleId:
        bundles.length === 1 ? String(bundles[0].bundle_id) : "",
      status: "idle" as const,
      progress: 0,
    }));
    setJobs((current) => [...current, ...additions]);
  }

  function removeJob(id: string) {
    setJobs((current) => {
      const removed = current.find((job) => job.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((job) => job.id !== id);
    });
  }

  async function readImages() {
    if (
      disabled ||
      !jobs.length ||
      jobs.some((job) => job.bundleId === "")
    ) {
      return;
    }

    let activeJobId = "";
    const worker = await createLocalOcrWorker((progress) => {
      if (!activeJobId) return;
      setJobs((current) =>
        current.map((job) =>
          job.id === activeJobId
            ? { ...job, progress: Math.round(progress * 100) }
            : job,
        ),
      );
    });

    try {
      for (const job of jobs) {
        activeJobId = job.id;
        const spec = bundles.find(
          (bundle) => bundle.bundle_id === Number(job.bundleId),
        );
        if (!spec) continue;
        setJobs((current) =>
          current.map((candidate) =>
            candidate.id === job.id
              ? {
                  ...candidate,
                  status: "reading",
                  progress: 0,
                  error: undefined,
                }
              : candidate,
          ),
        );
        try {
          const observation = await recognizeWebsiteScreenshot(
            job.file,
            spec,
            worker,
          );
          setJobs((current) =>
            current.map((candidate) =>
              candidate.id === job.id
                ? {
                    ...candidate,
                    status: "ready",
                    progress: 100,
                    observation,
                  }
                : candidate,
            ),
          );
        } catch (error) {
          setJobs((current) =>
            current.map((candidate) =>
              candidate.id === job.id
                ? {
                    ...candidate,
                    status: "error",
                    error:
                      error instanceof Error
                        ? error.message
                        : "อ่านภาพไม่สำเร็จ",
                  }
                : candidate,
            ),
          );
        }
      }
    } finally {
      await worker.terminate();
    }
  }

  function updateField(
    jobId: string,
    field: keyof Omit<WebsiteObservationDraft, "items">,
    value: string,
  ) {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId && job.observation
          ? {
              ...job,
              observation: {
                ...job.observation,
                [field]: confirmField(job.observation[field], value),
              },
            }
          : job,
      ),
    );
  }

  function updateItemField(
    jobId: string,
    itemIndex: number,
    field: "name" | "amount" | "chance",
    value: string,
  ) {
    setJobs((current) =>
      current.map((job) => {
        if (job.id !== jobId || !job.observation) return job;
        const items = job.observation.items.map((item, index) =>
          index === itemIndex
            ? { ...item, [field]: confirmField(item[field], value) }
            : item,
        );
        return {
          ...job,
          observation: { ...job.observation, items },
        };
      }),
    );
  }

  function confirmOneField(
    jobId: string,
    field: keyof Omit<WebsiteObservationDraft, "items">,
  ) {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId && job.observation
          ? {
              ...job,
              observation: {
                ...job.observation,
                [field]: attestField(job.observation[field],
                  bundles.find((bundle) => bundle.bundle_id === Number(job.bundleId))?.[field === "name" ? "name" : field] ?? null),
              },
            }
          : job,
      ),
    );
  }

  function confirmOneItemField(
    jobId: string,
    itemIndex: number,
    field: "name" | "amount" | "chance",
  ) {
    setJobs((current) =>
      current.map((job) => {
        if (job.id !== jobId || !job.observation) return job;
        const spec = bundles.find((bundle) => bundle.bundle_id === Number(job.bundleId));
        const expected = spec?.items[itemIndex]?.[field] ?? null;
        return {
          ...job,
          observation: {
            ...job.observation,
            items: job.observation.items.map((item, index) =>
              index === itemIndex
                ? {
                    ...item,
                    [field]: attestField(item[field], expected),
                  }
                : item,
            ),
          },
        };
      }),
    );
  }

  function confirmRandomBundle(bundleId: number) {
    setJobs((current) =>
      current.map((job) => {
        if (
          !job.observation ||
          Number(job.bundleId) !== bundleId
        ) {
          return job;
        }
        const spec = bundles.find(
          (bundle) => bundle.bundle_id === bundleId,
        );
        if (!spec?.is_gacha) return job;
        return {
          ...job,
          observation: {
            ...job.observation,
            items: job.observation.items.map((item, index) => {
              const expected = spec.items[index];
              if (
                expected?.chance === null ||
                expected?.chance === undefined
              ) {
                return item;
              }
              return {
                name: attestFieldMatchesSpec(item.name, expected.name),
                amount: attestFieldMatchesSpec(item.amount, expected.amount),
                chance: attestFieldMatchesSpec(item.chance, expected.chance),
              };
            }),
          },
        };
      }),
    );
  }

  return (
    <section className="image-review">
      <div className="subsection-heading">
        <div>
          <strong>ภาพ Website</strong>
          <span>OCR ทำในเครื่องและต้องจับคู่กับ bundle_id</span>
        </div>
        <label className={`image-upload ${disabled ? "disabled" : ""}`}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={disabled}
            onChange={(event) => {
              addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          + เพิ่มภาพ
        </label>
      </div>

      {!jobs.length ? (
        <div className="image-hint">
          เลือกภาพหน้าซื้อแพ็กจาก Website ได้หลายภาพในครั้งเดียว
        </div>
      ) : (
        <>
          <div className="image-job-list">
            {jobs.map((job) => {
              const spec = bundles.find(
                (bundle) =>
                  bundle.bundle_id === Number(job.bundleId),
              );
              return (
                <article className="image-job" key={job.id}>
                  <div className="image-job-head">
                    <img src={job.previewUrl} alt="" />
                    <div className="image-job-map">
                      <strong>{job.file.name}</strong>
                      <select
                        value={job.bundleId}
                        onChange={(event) =>
                          setJobs((current) =>
                            current.map((candidate) =>
                              candidate.id === job.id
                                ? {
                                    ...candidate,
                                    bundleId: event.target.value,
                                    status: "idle",
                                    observation: undefined,
                                  }
                                : candidate,
                            ),
                          )
                        }
                        aria-label={`จับคู่ ${job.file.name} กับแพ็ก`}
                      >
                        <option value="">เลือก bundle</option>
                        {bundles.map((bundle) => (
                          <option
                            value={bundle.bundle_id}
                            key={bundle.bundle_id}
                          >
                            {bundle.bundle_id} — {bundle.name || "ไม่มีชื่อ"}
                          </option>
                        ))}
                      </select>
                      {job.status === "reading" && (
                        <div className="ocr-progress">
                          <span style={{ width: `${job.progress}%` }} />
                          <small>กำลังอ่าน {job.progress}%</small>
                        </div>
                      )}
                      {job.error && (
                        <small className="ocr-error">{job.error}</small>
                      )}
                    </div>
                    <button
                      className="remove-image"
                      type="button"
                      onClick={() => removeJob(job.id)}
                      aria-label={`ลบ ${job.file.name}`}
                    >
                      ×
                    </button>
                  </div>

                  <div className="evidence-viewer">
                    <div className="evidence-viewer-head">
                      <div>
                        <strong>ภาพหลักฐานสำหรับคนตรวจ</strong>
                        <span>
                          เทียบภาพต้นฉบับก่อนยืนยันค่าจาก OCR
                        </span>
                      </div>
                      <button type="button" onClick={() => setPreviewJob(job)}>
                        เปิดภาพเต็ม ↗
                      </button>
                    </div>
                    <button
                      className="evidence-canvas"
                      type="button"
                      onClick={() => setPreviewJob(job)}
                      aria-label={`เปิดภาพ ${job.file.name} ขนาดเต็ม`}
                    >
                      <img
                        src={job.previewUrl}
                        alt={`ภาพ Website ที่อัปโหลด: ${job.file.name}`}
                      />
                      <span>คลิกเพื่อขยาย</span>
                    </button>
                    <small>
                      {job.file.name} ·{" "}
                      {(job.file.size / 1024).toFixed(0)} KB
                    </small>
                  </div>

                  {job.status === "ready" &&
                    job.observation &&
                    spec && (
                      <details className="ocr-image-details">
                        <summary>
                          ดูหรือแก้ค่า OCR ของภาพนี้
                          <span>{observedItemCount(job.observation)}/{spec.items.length} รายการที่อ่านพบ</span>
                        </summary>
                        <ObservationEditor
                          observation={job.observation}
                          spec={spec}
                          onField={(field, value) =>
                            updateField(job.id, field, value)
                          }
                          onConfirmField={(field) =>
                            confirmOneField(job.id, field)
                          }
                          onItem={(index, field, value) =>
                            updateItemField(job.id, index, field, value)
                          }
                          onConfirmItem={(index, field) =>
                            confirmOneItemField(job.id, index, field)
                          }
                        />
                      </details>
                    )}
                </article>
              );
            })}
          </div>

          {bundles.filter((bundle) => bundle.is_gacha).map((bundle) => {
            const evidenceCount = jobs.filter(
              (job) =>
                Number(job.bundleId) === bundle.bundle_id &&
                job.status === "ready",
            ).length;
            if (!evidenceCount) return null;
            return (
              <section className="random-bundle-review" key={bundle.bundle_id}>
                <div>
                  <span>Random Pack</span>
                  <strong>ตรวจตารางสุ่มครั้งเดียวต่อแพ็ก</strong>
                  <small>
                    {evidenceCount} ภาพหลักฐาน · {bundle.items.filter((item) => item.chance !== null && item.chance !== undefined).length} outcomes
                  </small>
                </div>
                <p>
                  เปิดรายการสุ่มบน Website ให้ครบและตรวจภาพด้านบน หาก Amount และ Chance ตรง Req ให้กดปุ่มเดียวนี้
                </p>
                <button
                  type="button"
                  onClick={() => confirmRandomBundle(bundle.bundle_id)}
                >
                  ภาพครบแล้ว · ยืนยันตารางสุ่มตรง Req
                </button>
              </section>
            );
          })}

          <button
            type="button"
            className="ocr-button"
            onClick={readImages}
            disabled={
              disabled ||
              jobs.some(
                (job) =>
                  job.bundleId === "" || job.status === "reading",
              )
            }
          >
            {jobs.some((job) => job.status === "reading")
              ? "กำลังอ่านภาพ…"
              : jobs.every((job) => job.status === "ready")
                ? "อ่านภาพใหม่"
                : `อ่านภาพ ${jobs.length} ไฟล์`}
          </button>
        </>
      )}
      {previewJob && (
        <div className="image-modal" role="dialog" aria-modal="true" aria-label="ภาพ Website ขนาดเต็ม" onClick={() => setPreviewJob(null)}>
          <div className="image-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="image-modal-head"><strong>{previewJob.file.name}</strong><button type="button" onClick={() => setPreviewJob(null)}>ปิด</button></div>
            <img src={previewJob.previewUrl} alt={`ภาพ Website ${previewJob.file.name}`} />
          </div>
        </div>
      )}
    </section>
  );
}

function attestField(field: ObservedField, expected: string | number | null) {
  return expected !== null
    ? confirmField(field, String(expected))
    : confirmObservedField(field);
}

function ObservationEditor({
  observation,
  spec,
  onField,
  onConfirmField,
  onItem,
  onConfirmItem,
}: {
  observation: WebsiteObservationDraft;
  spec: SpecBundle;
  onField: (
    field: keyof Omit<WebsiteObservationDraft, "items">,
    value: string,
  ) => void;
  onConfirmField: (
    field: keyof Omit<WebsiteObservationDraft, "items">,
  ) => void;
  onItem: (
    index: number,
    field: "name" | "amount" | "chance",
    value: string,
  ) => void;
  onConfirmItem: (
    index: number,
    field: "name" | "amount" | "chance",
  ) => void;
}) {
  return (
    <div className="observation-editor">
      <div className="review-toolbar">
        <p>
          ระบบเทียบค่าจากภาพกับ Spec โดยตรง แตะเฉพาะช่องสีเหลือง
          ที่ต้องยืนยันหรือแก้ค่าจากภาพเมื่อเป็นสีแดง
        </p>
        <div className="review-legend" aria-label="ความหมายของสถานะ">
          <span className="match">ตรง Spec</span>
          <span className="mismatch">ไม่ตรง Spec</span>
          <span className="review">ต้องยืนยัน</span>
        </div>
      </div>
      <section className="ocr-category pack">
        <header>
          <span>01</span>
          <div><strong>ข้อมูลแพ็ก</strong><small>ชื่อแพ็กและเงื่อนไขการซื้อ</small></div>
        </header>
        <div className="observation-grid">
          <ReviewInput
            label="ชื่อแพ็ก"
            expected={spec.name}
            field={observation.name}
            onChange={(value) => onField("name", value)}
            onConfirm={() => onConfirmField("name")}
          />
          <ReviewInput
            label="จำกัดการซื้อ"
            expected={spec.purchase_limit}
            field={observation.purchase_limit}
            onChange={(value) => onField("purchase_limit", value)}
            onConfirm={() => onConfirmField("purchase_limit")}
          />
        </div>
      </section>
      <section className="ocr-category economy">
        <header>
          <span>02</span>
          <div><strong>ราคาและแต้ม</strong><small>ราคา SP และ GSP ที่ได้รับ</small></div>
        </header>
        <div className="observation-grid">
          <ReviewInput
            label="ราคา SP"
            expected={spec.seed_point}
            field={observation.seed_point}
            onChange={(value) => onField("seed_point", value)}
            onConfirm={() => onConfirmField("seed_point")}
          />
          <ReviewInput
            label="GSP"
            expected={spec.gsp_earn}
            field={observation.gsp_earn}
            onChange={(value) => onField("gsp_earn", value)}
            onConfirm={() => onConfirmField("gsp_earn")}
          />
        </div>
      </section>
      <section className={`ocr-category items ${spec.is_gacha ? "random" : ""}`}>
        <header>
          <span>03</span>
          <div><strong>รายการ Item</strong><small>ชื่อ จำนวน{spec.is_gacha ? " และ Chance" : ""}</small></div>
          <b>{spec.items.length} รายการ</b>
        </header>
        <div className="item-review-list">
          {observation.items.map((item, index) => (
            <div className={`item-review-row ${spec.items[index].chance !== null && spec.items[index].chance !== undefined ? "gacha" : ""}`} key={`${spec.items[index].item_id}-${index}`}>
              <ReviewInput
                label={`Item ${index + 1}`}
                expected={spec.items[index].name}
                field={item.name}
                onChange={(value) => onItem(index, "name", value)}
                onConfirm={() => onConfirmItem(index, "name")}
              />
              <ReviewInput
                label="จำนวน"
                expected={spec.items[index].amount}
                field={item.amount}
                onChange={(value) => onItem(index, "amount", value)}
                onConfirm={() => onConfirmItem(index, "amount")}
              />
              {spec.items[index].chance !== null &&
                spec.items[index].chance !== undefined && (
                <ReviewInput
                  label="Chance %"
                  expected={spec.items[index].chance ?? null}
                  field={item.chance}
                  onChange={(value) => onItem(index, "chance", value)}
                  onConfirm={() => onConfirmItem(index, "chance")}
                />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReviewInput({
  label,
  expected,
  field,
  onChange,
  onConfirm,
}: {
  label: string;
  expected: string | number | null;
  field: ObservedField;
  onChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const confidence = Math.round(field.confidence * 100);
  const status = reviewFieldStatus(field, expected);
  const statusLabel = {
    match: "ตรง Spec",
    mismatch: "ไม่ตรง Spec",
    review: "ต้องยืนยัน",
  }[status];
  return (
    <label className={`review-input ${status}`}>
      <span>
        {label}
        <span className="confidence-actions">
          <em title={`OCR confidence ${confidence}%`}>
            {statusLabel}
          </em>
          {(field.value !== null || expected !== null) &&
            !field.human_confirmed &&
            status !== "match" && (
            <button type="button" onClick={onConfirm}>
              ยืนยันค่าจากภาพ
            </button>
          )}
        </span>
      </span>
      <input
        value={field.value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`ตาม Spec: ${expected ?? "—"}`}
      />
      {(field.value !== null || expected !== null) && !field.human_confirmed && status !== "match" && (
        <button className="review-confirm-visible" type="button" onClick={onConfirm}>
          ยืนยันตาม Spec
        </button>
      )}
      <small className="spec-value">
        Spec: {expected ?? "—"}
        {!field.human_confirmed && field.raw_text
          ? ` · OCR ${confidence}%`
          : " · คนยืนยัน"}
      </small>
      {field.raw_text && (
        <small className="ocr-raw" title={field.raw_text}>
          OCR: {field.raw_text}
        </small>
      )}
    </label>
  );
}

function normalizeConfirmedObservation(
  observation: WebsiteObservationDraft,
): WebsiteObservationDraft {
  const normalizedField = (field: ObservedField): ObservedField => {
    if (!field.human_confirmed || typeof field.value !== "string") {
      return field;
    }
    const value = field.value.trim();
    return {
      ...field,
      value: value || null,
    };
  };
  return {
    ...observation,
    name: normalizedField(observation.name),
    seed_point: normalizedField(observation.seed_point),
    gsp_earn: normalizedField(observation.gsp_earn),
    purchase_limit: normalizedField(observation.purchase_limit),
    items: observation.items.map((item) => ({
      name: normalizedField(item.name),
      amount: normalizedField(item.amount),
      chance: normalizedField(item.chance),
    })),
  };
}

function combineReadyJobs(jobs: ImageJob[]): ReviewedWebsiteObservation[] {
  const combined = new Map<number, WebsiteObservationDraft>();
  for (const job of jobs) {
    if (
      job.status !== "ready" ||
      !job.observation ||
      job.bundleId === ""
    ) {
      continue;
    }
    const bundleId = Number(job.bundleId);
    const observation = normalizeConfirmedObservation(job.observation);
    const current = combined.get(bundleId);
    combined.set(
      bundleId,
      current ? mergeObservations(current, observation) : observation,
    );
  }
  return [...combined].map(([bundle_id, website]) => ({
    bundle_id,
    website,
  }));
}

function mergeReviewedObservations(
  baseline: ReviewedWebsiteObservation[],
  additions: ReviewedWebsiteObservation[],
) {
  const combined = new Map(
    baseline.map((item) => [item.bundle_id, item.website]),
  );
  for (const addition of additions) {
    const current = combined.get(addition.bundle_id);
    combined.set(
      addition.bundle_id,
      current
        ? mergeObservations(current, addition.website)
        : addition.website,
    );
  }
  return [...combined].map(([bundle_id, website]) => ({
    bundle_id,
    website,
  }));
}

function observedItemCount(observation: WebsiteObservationDraft) {
  return observation.items.filter(
    (item) =>
      item.name.value !== null ||
      item.amount.value !== null ||
      item.chance.value !== null,
  ).length;
}

function mergeObservations(
  current: WebsiteObservationDraft,
  next: WebsiteObservationDraft,
): WebsiteObservationDraft {
  const pick = (left: ObservedField, right: ObservedField) => {
    if (left.value === null && right.value !== null) return right;
    if (right.value === null) return left;
    if (right.human_confirmed && !left.human_confirmed) return right;
    if (
      String(left.value) === String(right.value) &&
      right.confidence > left.confidence
    ) {
      return right;
    }
    return left;
  };
  return {
    name: pick(current.name, next.name),
    seed_point: pick(current.seed_point, next.seed_point),
    gsp_earn: pick(current.gsp_earn, next.gsp_earn),
    purchase_limit: pick(
      current.purchase_limit,
      next.purchase_limit,
    ),
    items: current.items.map((item, index) => {
      const other = next.items[index];
      if (!other) return item;
      return {
        name: pick(item.name, other.name),
        amount: pick(item.amount, other.amount),
        chance: pick(item.chance, other.chance),
      };
    }),
  };
}
