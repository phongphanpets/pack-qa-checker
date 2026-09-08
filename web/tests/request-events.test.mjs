import test from "node:test";
import assert from "node:assert/strict";
import { recordRequestEvent, changeRequestStatus } from "../lib/request-events.mjs";

test("keeps chronological status and artifact history across serialization", () => {
  const entry = { status: "NEW" };
  recordRequestEvent(entry, "CREATED", { to: "NEW" }, "2026-09-08T01:00:00Z");
  changeRequestStatus(entry, "REVIEW", "2026-09-08T02:00:00Z");
  const restored = JSON.parse(JSON.stringify(entry));
  recordRequestEvent(restored, "EXPORTED", { artifact_id: "a", filename: "bundle.xlsx" }, "2026-09-08T03:00:00Z");
  assert.equal(restored.history.length, 3);
  assert.equal(restored.history[1].from, "NEW");
  assert.equal(restored.history[1].to, "REVIEW");
  assert.equal(restored.history[2].artifact_id, "a");
  assert.equal(changeRequestStatus(restored, "REVIEW"), false);
  assert.equal(restored.history.length, 3);
});
