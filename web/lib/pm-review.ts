export type PmDecision = "pending" | "approved" | "changes_requested";

export type PmReviewState = {
  receipt_confirmed: boolean;
  decision: PmDecision;
  reviewer_name: string;
  note: string;
  decided_at: string | null;
};

export type ReadinessSummary = {
  FAIL?: number;
  WARN?: number;
  UNVERIFIABLE?: number;
};

export type ApprovalReadiness = {
  data_passed: boolean;
  evidence_complete: boolean;
  ready_for_approval: boolean;
  missing: string[];
};

export const EMPTY_PM_REVIEW: PmReviewState = {
  receipt_confirmed: false,
  decision: "pending",
  reviewer_name: "",
  note: "",
  decided_at: null,
};

export function normalizePmReview(value: unknown): PmReviewState {
  if (!isRecord(value)) return { ...EMPTY_PM_REVIEW };
  const decision = ["pending", "approved", "changes_requested"].includes(
    String(value.decision),
  )
    ? (value.decision as PmDecision)
    : "pending";
  return {
    receipt_confirmed: value.receipt_confirmed === true,
    decision,
    reviewer_name:
      typeof value.reviewer_name === "string" ? value.reviewer_name : "",
    note: typeof value.note === "string" ? value.note : "",
    decided_at:
      typeof value.decided_at === "string" ? value.decided_at : null,
  };
}

export function invalidatePmDecision(review: PmReviewState): PmReviewState {
  if (review.decision === "pending" && review.decided_at === null) return review;
  return {
    ...review,
    decision: "pending",
    decided_at: null,
  };
}

export function evaluateApprovalReadiness(input: {
  summary: ReadinessSummary | null;
  has_spec_evidence: boolean;
  website_evidence_count: number;
  has_aztek_evidence: boolean;
  receipt_evidence_count: number;
  receipt_confirmed: boolean;
}): ApprovalReadiness {
  const summary = input.summary;
  const dataPassed = Boolean(
    summary &&
      Number(summary.FAIL ?? 0) === 0 &&
      Number(summary.UNVERIFIABLE ?? 0) === 0 &&
      Number(summary.WARN ?? 0) === 0,
  );
  const missing: string[] = [];
  if (!input.has_spec_evidence) missing.push("ภาพ Req");
  if (input.website_evidence_count < 1) missing.push("ภาพ Website");
  if (!input.has_aztek_evidence) missing.push("ภาพ Aztek Tool");
  if (input.receipt_evidence_count < 1) {
    missing.push("ภาพ Receipt");
  } else if (!input.receipt_confirmed) {
    missing.push("ยืนยันว่า Receipt ถูกต้อง");
  }
  return {
    data_passed: dataPassed,
    evidence_complete: missing.length === 0,
    ready_for_approval: dataPassed && missing.length === 0,
    missing,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
