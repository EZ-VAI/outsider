import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { issueUserHeldOutcomeProgramAttempt } from "../src/outsider-user-held-outcome-program-attempt.js";
const h = s => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const input = () => ({
  identityBinding: { principalEpochHash: h("principal"), accountableDeploymentHash: h("deployment"),
    runtimeOrEmbodimentHash: h("runtime"), sourceRefHash: h("existing-reporting-identity") },
  request: { requestId: "digital-order-1", completionDeadline: "2026-09-05T18:00:00.000Z" },
  proposal: { requestId: "digital-order-1", programHash: h("program-1") },
  confirmation: { requestId: "digital-order-1", programHash: h("program-1") },
  recordedAt: "2026-09-05T12:30:00.000Z", authorizationRefHash: h("existing-user-authorization"),
});
test("new program gets distinct delegation/episode/primary Attempt under existing ancestry", () => {
  const a = input(), b = input();
  for (const field of ["request", "proposal", "confirmation"]) b[field].requestId = "digital-order-2";
  b.proposal.programHash = b.confirmation.programHash = h("program-2");
  const first = issueUserHeldOutcomeProgramAttempt(a), second = issueUserHeldOutcomeProgramAttempt(b);
  for (const field of ["principalEpochHash", "accountableDeploymentHash", "runtimeOrEmbodimentHash"])
    assert.equal(first.graphRefs[field], second.graphRefs[field]);
  for (const field of ["delegationHash", "episodeHash", "attemptHash"])
    assert.notEqual(first.graphRefs[field], second.graphRefs[field]);
  assert.equal(first.attempt.kind, "PRIMARY");
  assert.equal(first.attempt.retryOfAttemptHash, null);
  assert.equal(first.authorityMinted, false);
  assert.deepEqual(first, issueUserHeldOutcomeProgramAttempt(a));
});
test("cannot bind a confirmation for a different program or start after the deadline", () => {
  const a = input(); a.confirmation.programHash = h("unconfirmed-program");
  assert.throws(() => issueUserHeldOutcomeProgramAttempt(a), /PROGRAM_BINDING_INVALID/);
  const b = input(); b.recordedAt = "2026-09-05T18:00:00.000Z";
  assert.throws(() => issueUserHeldOutcomeProgramAttempt(b), /TIME_INVALID/);
});
