import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateApprovalReadiness,
  invalidatePmDecision,
  normalizePmReview,
} from "../lib/pm-review.ts";

test("keeps a clean rule report in evidence review until every proof is ready", () => {
  const readiness = evaluateApprovalReadiness({
    summary: { FAIL: 0, WARN: 0, UNVERIFIABLE: 0 },
    has_spec_evidence: true,
    website_evidence_count: 1,
    has_aztek_evidence: true,
    receipt_evidence_count: 0,
    receipt_confirmed: false,
  });

  assert.equal(readiness.data_passed, true);
  assert.equal(readiness.ready_for_approval, false);
  assert.deepEqual(readiness.missing, ["ภาพ Receipt"]);
});

test("requires a human Receipt attestation before PM approval", () => {
  const before = evaluateApprovalReadiness({
    summary: { FAIL: 0, WARN: 0, UNVERIFIABLE: 0 },
    has_spec_evidence: true,
    website_evidence_count: 2,
    has_aztek_evidence: true,
    receipt_evidence_count: 1,
    receipt_confirmed: false,
  });
  const after = evaluateApprovalReadiness({
    summary: { FAIL: 0, WARN: 0, UNVERIFIABLE: 0 },
    has_spec_evidence: true,
    website_evidence_count: 2,
    has_aztek_evidence: true,
    receipt_evidence_count: 1,
    receipt_confirmed: true,
  });

  assert.deepEqual(before.missing, ["ยืนยันว่า Receipt ถูกต้อง"]);
  assert.equal(after.ready_for_approval, true);
});

test("never makes evidence completeness override a failed rule", () => {
  const readiness = evaluateApprovalReadiness({
    summary: { FAIL: 1, WARN: 0, UNVERIFIABLE: 0 },
    has_spec_evidence: true,
    website_evidence_count: 1,
    has_aztek_evidence: true,
    receipt_evidence_count: 1,
    receipt_confirmed: true,
  });

  assert.equal(readiness.evidence_complete, true);
  assert.equal(readiness.ready_for_approval, false);
});

test("opens old sessions with a pending PM review and invalidates stale approval", () => {
  assert.equal(normalizePmReview(undefined).decision, "pending");
  assert.deepEqual(
    invalidatePmDecision({
      receipt_confirmed: true,
      decision: "approved",
      reviewer_name: "PM A",
      note: "",
      decided_at: "2026-08-13T10:00:00.000Z",
    }),
    {
      receipt_confirmed: true,
      decision: "pending",
      reviewer_name: "PM A",
      note: "",
      decided_at: null,
    },
  );
});
