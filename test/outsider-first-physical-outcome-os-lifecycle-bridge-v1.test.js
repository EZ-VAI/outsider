import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { compileFirstPhysicalOutcomeOsLifecycleBridgeV1 } from "../src/outsider-first-physical-outcome-os-lifecycle-bridge-v1.js";

const h = x => `sha256:${createHash("sha256").update(x).digest("hex")}`;

test("insufficient evidence returns an explicit HOLD without invented requests", () => {
  const result = compileFirstPhysicalOutcomeOsLifecycleBridgeV1({});
  assert.equal(result.decision, "HOLD");
  assert.equal(result.requests, null);
  assert(result.gaps.includes("FOUNDATION_COMPILATION_SOURCE_REPLAY_FAILED"));
  assert.equal(result.sellerObservationEstablishesCapacity, false);
  assert.equal(result.sellerObservationEstablishesOutcomeTruth, false);
  assert.equal(result.sellerObservationEstablishesCommit, false);
  assert.equal(result.networkIoPerformed, false);
});

test("invalid seller references remain HOLD and cannot become truth or COMMIT", () => {
  const result = compileFirstPhysicalOutcomeOsLifecycleBridgeV1({
    recordedAt: "2026-09-04T16:00:00.000Z",
    openedAt: "2026-09-04T16:00:01.000Z",
    attemptRecordedAt: "2026-09-04T16:00:02.000Z",
    sellerObservation: { attemptSetCompositionRefHash: h("set") },
  });
  assert.equal(result.decision, "HOLD");
  assert(result.gaps.includes("PRODUCT_STATE_MISSING_OR_UNTYPED"));
  assert(result.gaps.some(gap => gap.includes("OCCURRENCEREFHASH")));
  assert(!JSON.stringify(result).includes("COMMIT\":true"));
});
