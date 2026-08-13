import assert from "node:assert/strict";
import test from "node:test";

import {
  PILOT_VERSION,
  createPilotSession,
  parsePilotSession,
} from "../lib/pilot-session.ts";

test("builds one portable Pilot session with diagnostics", async () => {
  const session = await createPilotSession({
    packMode: "excel",
    packData: {
      bundles: [{ bundle_id: 7001, spec: { name: "Pilot Pack" } }],
    },
    packFormValid: true,
    packYamlName: null,
    packYamlText: null,
    websiteOcrYamlText: null,
    specBundles: [
      {
        bundle_id: 7001,
        name: "Pilot Pack",
        seed_point: 100,
        gsp_earn: 100,
        purchase_limit: 1,
        items: [],
      },
    ],
    websiteObservations: [
      {
        bundle_id: 7001,
        website: {
          name: field("Pilot Pack", "website:name:human-confirmed", true),
          seed_point: field(100, "website:seed"),
          gsp_earn: field(100, "website:gsp"),
          purchase_limit: field(1, "website:limit"),
          items: [],
        },
      },
    ],
    imagesPending: false,
    report: {
      summary: { FAIL: 1, UNVERIFIABLE: 2 },
    },
    specEvidence: {
      name: "req.png",
      url: "data:image/png;base64,AA==",
    },
    websiteEvidence: [],
    aztekEvidence: null,
    receiptEvidence: [],
    userAgent: "Pack QA test",
  });

  assert.equal(session.app_version, PILOT_VERSION);
  assert.equal(session.diagnostics.human_confirmed_fields, 1);
  assert.equal(session.diagnostics.fail_checks, 1);
  assert.equal(session.diagnostics.unverifiable_checks, 2);
  assert.equal(session.diagnostics.evidence_counts.spec, 1);
  assert.equal(session.evidence.spec?.name, "req.png");
  assert.equal(session.pm_review.decision, "pending");
  assert.equal(parsePilotSession(JSON.stringify(session)).pack_mode, "excel");
});

test("rejects ordinary report JSON as a saved work file", () => {
  assert.throws(
    () => parsePilotSession('{"summary":{"PASS":1}}'),
    /ไม่ใช่งานที่บันทึกจาก Pack QA/,
  );
});

test("opens a Feedback export as a reusable Pilot session", async () => {
  const session = await createPilotSession({
    packMode: "excel",
    packData: null,
    packFormValid: true,
    packYamlName: null,
    packYamlText: null,
    websiteOcrYamlText: null,
    specBundles: [],
    websiteObservations: [],
    imagesPending: false,
    report: { summary: { FAIL: 0, UNVERIFIABLE: 0 } },
    specEvidence: null,
    websiteEvidence: [],
    aztekEvidence: null,
    receiptEvidence: [],
    userAgent: "Pack QA test",
  });
  const feedback = JSON.stringify({
    export_type: "pack-qa-pilot-feedback",
    session,
  });

  assert.equal(parsePilotSession(feedback).saved_at, session.saved_at);
});

test("preserves a PM decision and keeps old sessions backward compatible", async () => {
  const session = await createPilotSession({
    packMode: "excel",
    packData: null,
    packFormValid: true,
    packYamlName: null,
    packYamlText: null,
    websiteOcrYamlText: null,
    specBundles: [],
    websiteObservations: [],
    imagesPending: false,
    report: { summary: { FAIL: 0, WARN: 0, UNVERIFIABLE: 0 } },
    pmReview: {
      receipt_confirmed: true,
      decision: "approved",
      reviewer_name: "PM A",
      note: "พร้อมปล่อย",
      decided_at: "2026-08-13T10:00:00.000Z",
    },
    specEvidence: null,
    websiteEvidence: [],
    aztekEvidence: null,
    receiptEvidence: [],
    userAgent: "Pack QA test",
  });
  assert.equal(parsePilotSession(JSON.stringify(session)).pm_review.decision, "approved");

  const legacy = JSON.parse(JSON.stringify(session));
  delete legacy.pm_review;
  assert.equal(parsePilotSession(JSON.stringify(legacy)).pm_review.decision, "pending");
});

function field(
  value: string | number,
  locator: string,
  humanConfirmed = false,
) {
  return {
    value,
    source: "website",
    confidence: 1,
    raw_text: String(value),
    locator,
    human_confirmed: humanConfirmed,
  };
}
