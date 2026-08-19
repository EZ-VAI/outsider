import test from "node:test";
import assert from "node:assert/strict";
import { assessCoworkConformance } from "../src/outsider-cowork-conformance.js";

const prompt = "fix the real ledger";
const session = {
  host: "claude-desktop",
  cwd: "/fixture",
  revisions: [{ prompt }],
  completedRuns: [{ status: "complete", runId: "r", runDirectory: "/run" }],
};
const verified = {
  ok: true,
  binding: { source: { hostProtocol: "claude-desktop" }, createdBeforeWorker: false,
    createdBeforeFirstAction: true,
    authority: { lane: "RESEARCH", capabilityRequired: false } },
  manifest: { sourceRunId: "r" },
  projection: { outcome: { terminalClass: "SAFE_DELIVERY" } },
};
const events = [
  { type: "worker_attached" },
  { type: "boundary_reached", boundary: "PreToolUse" },
  { type: "boundary_reached", boundary: "PostToolUse" },
  { type: "acceptance_finished", phase: "final", passed: true },
  { type: "outcome_verdict", phase: "final", passed: true },
  { type: "run_finalized", proofComplete: true },
];

test("Cowork conformance requires real attached boundaries and sealed safe delivery", () => {
  const result = assessCoworkConformance({ session, verified, events,
    workspace: "/fixture", expectedPrompt: prompt });
  assert.equal(result.ok, true);
  assert.equal(result.preToolBoundaries, 1);
  assert.equal(result.postToolBoundaries, 1);
});

test("Cowork conformance fails when PostTool evidence or honest binding semantics are missing", () => {
  const result = assessCoworkConformance({ session, verified: {
    ...verified, binding: { ...verified.binding, createdBeforeWorker: true },
  }, events: events.filter((event) => event.boundary !== "PostToolUse"),
  workspace: "/fixture", expectedPrompt: prompt });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /PostToolUse/.test(error)));
  assert.ok(result.errors.some((error) => /pre-action/.test(error)));
});

test("Cowork conformance accepts a content-addressed Stop verdict reused at finalization", () => {
  const reusedEvents = [
    { type: "worker_attached" },
    { type: "boundary_reached", boundary: "PreToolUse" },
    { type: "boundary_reached", boundary: "PostToolUse" },
    { type: "outcome_verdict", seq: 9, phase: "stop", passed: true },
    { type: "acceptance_finished", phase: "final", passed: true },
    { type: "outcome_verification_reused", sourceSeq: 9 },
    { type: "run_finalized", proofComplete: true },
  ];
  const result = assessCoworkConformance({ session, verified, events: reusedEvents,
    workspace: "/fixture", expectedPrompt: prompt });
  assert.equal(result.ok, true);
});

test("Cowork conformance rejects a binding that requires an execution capability", () => {
  const result = assessCoworkConformance({ session, verified: {
    ...verified,
    binding: { ...verified.binding,
      authority: { lane: "AUTHORITY", capabilityRequired: true } },
  }, events, workspace: "/fixture", expectedPrompt: prompt });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /execution authority/.test(error)));
});

test("verified-but-unattributed delivery never passes the Stage 0.5 Cowork causal canary", () => {
  const result = assessCoworkConformance({
    session: { ...session, completedRuns: [{ status: "delivered-unattributed",
      runId: "r", runDirectory: "/run" }] },
    verified: { ...verified, projection: { outcome: {
      terminalClass: "VERIFIED_DELIVERY_UNATTRIBUTED",
      deliveryComplete: true, proofComplete: false,
    } } },
    events: events.map((event) => event.type === "run_finalized"
      ? { ...event, proofComplete: false, deliveryComplete: true } : event),
    workspace: "/fixture", expectedPrompt: prompt,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /completed run|proofComplete|SAFE_DELIVERY/.test(error)));
});
