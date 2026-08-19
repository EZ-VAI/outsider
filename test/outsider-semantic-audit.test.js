import test from "node:test";
import assert from "node:assert/strict";

import {
  auditOutcomeApproval,
  normalizeSemanticAudit,
  semanticAuditSchemaViolations,
  validSemanticAudit,
} from "../src/outsider-semantic-audit.js";

const passWithNote = {
  decision: "pass",
  blockingErrors: [],
  notes: ["coverage could be broader, but this does not contradict the frozen claim"],
  verifiedFacts: ["the hostile input was independently recomputed"],
  insufficientReason: null,
};

test("PASS may carry notes without turning them into blocking errors", () => {
  assert.equal(validSemanticAudit(passWithNote), true);
  const verdict = normalizeSemanticAudit(passWithNote);
  assert.equal(verdict.passed, true);
  assert.equal(verdict.decision, "pass");
  assert.deepEqual(verdict.errors, []);
  assert.deepEqual(verdict.blockingErrors, []);
  assert.deepEqual(verdict.notes, passWithNote.notes);
  assert.equal(verdict.insufficient, null);
});

test("the three semantic audit decisions are mutually exclusive", () => {
  const badPass = { ...passWithNote, blockingErrors: ["actual contradiction"] };
  assert.equal(validSemanticAudit(badPass), false);
  assert.match(semanticAuditSchemaViolations(badPass).join("; "),
    /decision=pass requires blockingErrors=\[\]/);

  const emptyReject = { ...passWithNote, decision: "reject" };
  assert.equal(validSemanticAudit(emptyReject), false);
  assert.match(semanticAuditSchemaViolations(emptyReject).join("; "),
    /decision=reject requires at least one/);

  const ambiguousInsufficient = {
    ...passWithNote,
    decision: "insufficient",
    blockingErrors: ["unverified suspicion"],
    insufficientReason: "source bytes missing",
  };
  const violations = semanticAuditSchemaViolations(ambiguousInsufficient).join("; ");
  assert.match(violations, /decision=insufficient requires blockingErrors=\[\]/);
});

test("missing verified facts and non-array notes receive exact schema reasons", () => {
  const missingFacts = { decision: "pass", blockingErrors: [], notes: [],
    insufficientReason: null };
  assert.match(semanticAuditSchemaViolations(missingFacts).join("; "),
    /verifiedFacts must be an array/);

  const badNotes = { ...passWithNote, notes: "just a thought" };
  assert.match(semanticAuditSchemaViolations(badNotes).join("; "),
    /notes must be an array/);

  const mixed = { ...passWithNote, passed: true, errors: [] };
  assert.match(semanticAuditSchemaViolations(mixed).join("; "),
    /cannot mix legacy fields/);
});

test("legacy audit verdicts remain readable but ambiguous legacy authority is rejected", () => {
  const legacy = normalizeSemanticAudit({
    passed: false,
    errors: ["contract contradiction"],
    verifiedFacts: [],
  });
  assert.equal(legacy.decision, "reject");
  assert.deepEqual(legacy.blockingErrors, ["contract contradiction"]);

  const ambiguous = { passed: false, errors: ["claimed error"], verifiedFacts: [],
    insufficient: "source missing" };
  assert.equal(validSemanticAudit(ambiguous), false);
  assert.match(semanticAuditSchemaViolations(ambiguous).join("; "),
    /both reject and insufficient/);
});

test("audit wrapper normalizes the strict protocol and includes precise retry feedback", () => {
  let observedInput = "";
  let observedDescriptor = null;
  const result = auditOutcomeApproval({
    cmd: "fake",
    outcomePacket: { frozen: true },
    proposedVerdict: { passed: true },
    validationFeedback: "decision=pass requires blockingErrors=[]",
    execute: ({ input, describeValidationErrors }) => {
      observedInput = input;
      observedDescriptor = describeValidationErrors;
      return { ok: true, value: passWithNote };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict.passed, true);
  assert.deepEqual(result.verdict.errors, []);
  assert.deepEqual(result.verdict.notes, passWithNote.notes);
  assert.match(observedInput, /上一次响应的 schema 错误/);
  assert.match(observedInput, /decision=pass requires blockingErrors=\[\]/);
  assert.equal(typeof observedDescriptor, "function");
});

test("an execute adapter that bypasses validation still returns typed schema failure", () => {
  const result = auditOutcomeApproval({
    cmd: "fake",
    outcomePacket: {},
    proposedVerdict: { passed: true },
    execute: () => ({ ok: true, value: {
      decision: "pass",
      blockingErrors: ["this was only a note"],
      notes: [],
      verifiedFacts: [],
      insufficientReason: null,
    } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.kind, "schema-invalid");
  assert.match(result.failure.schemaViolations.join("; "),
    /decision=pass requires blockingErrors=\[\]/);
  assert.match(result.retryInput, /SCHEMA REPAIR REQUIRED/);
});
