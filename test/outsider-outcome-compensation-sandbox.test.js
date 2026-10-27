import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createOutcomeEconomicContractDraftV1 }
  from "../src/outsider-outcome-economic-contract-v1.js";
import { compileSandboxOutcomeCompensation }
  from "../src/outsider-outcome-compensation-sandbox.js";

const h = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const usd = (minorUnits) => ({ currency: "USD", minorUnits });
const at = "2026-09-05T18:00:00.000Z";
const draft = (calculation = { kind: "FIXED", amount: usd("5000") }) =>
  createOutcomeEconomicContractDraftV1({
    contractVersion: 1, supersedesContractHash: null,
    outcomeProgramHash: h("program"), outcomeDefinitionHash: h("definition"),
    episodeRefHash: h("episode"), compensationTerms: [{
      termRefHash: h("term"), triggerPredicateRefHash: h("failure-trigger"),
      responsiblePartyRefHash: h("responsible"), beneficiaryRefHash: h("beneficiary"),
      paymentDueWithinSeconds: 86400, calculation,
    }],
  });
const projection = (state = "SUCCEEDED") => ({
  schema: "outsider/durable-outcome-program-orchestrator-projection/v1",
  programId: "outcome-program-1", programHash: h("program"), state,
  journalHeadHash: h(`journal-${state}`),
  bindings: { privateBinding: "SHOULD_NOT_BE_EXPORTED" },
  nodes: { sample: { primary: { status: "SUCCEEDED" } } },
});
const scenario = (kind = "CONTROLLED_FAILURE_REHEARSAL", quantity = null) => ({
  kind, scenarioRefHash: h("scenario"), termRefHash: h("term"),
  triggerPredicateRefHash: h("failure-trigger"), quantity,
  evidenceRefHashes: [h("rehearsal-source")],
});
const input = (state = "SUCCEEDED") => ({
  contractDraft: draft(), terminalOutcome: projection(state), createdAt: at,
});

test("successful runner outcome records no compensation and exports only references", () => {
  const source = input();
  const before = JSON.stringify(source);
  const result = compileSandboxOutcomeCompensation(source);
  assert.equal(result.mode, "SANDBOX");
  assert.equal(result.decision, "NO_SANDBOX_COMPENSATION");
  assert.equal(result.calculation, null);
  assert.equal(result.sandboxTransfer, null);
  assert.equal(result.observedOutcome.state, "SUCCEEDED");
  assert.equal(JSON.stringify(result).includes("SHOULD_NOT_BE_EXPORTED"), false);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(result.observedOutcome), true);
});

test("controlled failure rehearsal stays separate from actual success and never submits money", () => {
  const source = { ...input(), scenario: scenario() };
  const result = compileSandboxOutcomeCompensation(source);
  assert.equal(result.observedOutcome.state, "SUCCEEDED");
  assert.equal(result.rehearsal.assumedOutcomeState, "FAILED");
  assert.equal(result.decision, "SANDBOX_COMPENSATION_CALCULATED");
  assert.deepEqual(result.calculation.amount, usd("5000"));
  assert.equal(result.calculation.triggerEstablished, false);
  assert.equal(result.sandboxTransfer.status, "SIMULATED_NOT_SUBMITTED");
  for (const field of ["paymentAuthorized", "moneyMoved", "guaranteeCreated",
    "capitalBound", "actualFailureEstablished", "independentOutcomeVerified",
    "sourceReplayPerformed", "originalHistoryModified"]) assert.equal(result[field], false);
  assert.equal(result.contractStatus, "DRAFT_NOT_ACCEPTED");
  assert.equal(result.actualCompensationDue, null);
  assert.equal(result.sandboxTransfer.submitted, false);
  assert.deepEqual(result, compileSandboxOutcomeCompensation(source));
  assert.equal(result.sandboxTransfer.idempotencyKey,
    compileSandboxOutcomeCompensation({ ...source,
      createdAt: "2026-09-05T18:01:00.000Z" }).sandboxTransfer.idempotencyKey);
});

test("FAILED_CLOSED requires an explicit draft-trigger scenario, never infers actual failure", () => {
  const source = input("FAILED_CLOSED");
  const noScenario = compileSandboxOutcomeCompensation(source);
  assert.equal(noScenario.decision, "FAILURE_SCENARIO_REQUIRED");
  assert.equal(noScenario.sandboxTransfer, null);
  const replay = compileSandboxOutcomeCompensation({ ...source,
    scenario: scenario("OBSERVED_FAILURE_REPLAY") });
  assert.equal(replay.decision, "SANDBOX_COMPENSATION_CALCULATED");
  assert.equal(replay.actualFailureEstablished, false);
  assert.equal(replay.rehearsal.kind, "OBSERVED_FAILURE_REPLAY");
  assert.throws(() => compileSandboxOutcomeCompensation({ ...input(),
    scenario: scenario("OBSERVED_FAILURE_REPLAY") }), /OBSERVED_FAILURE_STATE_MISMATCH/);
});

test("pending, unknown, paused and unavailable outcomes do not adjudicate or calculate", () => {
  for (const state of ["PENDING", "UNKNOWN", "FORMING", "COMMITTED", "EXECUTING",
    "CLOSING", "PAUSED_RETRYABLE", "UNAVAILABLE"]) {
    const result = compileSandboxOutcomeCompensation({ ...input(state), scenario: scenario() });
    assert.equal(result.decision, state === "UNAVAILABLE"
      ? "UNAVAILABLE_BEFORE_COMMIT" : "AWAITING_OUTCOME");
    assert.equal(result.calculation, null);
    assert.equal(result.sandboxTransfer, null);
  }
});

test("bounded quantities reuse exact existing draft formula and cap without floating point", () => {
  const source = { ...input("FAILED_CLOSED"),
    contractDraft: draft({ kind: "BOUNDED_PER_UNIT", unitRefHash: h("unit"),
      unitAmount: usd("9007199254740993"), maximumUnits: "2", maximumAmount: usd("5000") }),
    scenario: scenario("OBSERVED_FAILURE_REPLAY", "999"),
  };
  assert.deepEqual(compileSandboxOutcomeCompensation(source).calculation.amount, usd("5000"));
  assert.throws(() => compileSandboxOutcomeCompensation({ ...source,
    scenario: { ...source.scenario, quantity: "-1" } }), /QUANTITY_INVALID/);
  assert.throws(() => compileSandboxOutcomeCompensation({ ...input(),
    scenario: scenario("CONTROLLED_FAILURE_REHEARSAL", "1") }), /FIXED_QUANTITY_MUST_BE_NULL/);
});

test("cross-program, modified drafts and mismatched trigger/evidence are rejected", () => {
  assert.throws(() => compileSandboxOutcomeCompensation({ ...input(),
    terminalOutcome: { ...projection(), programHash: h("different-program") } }),
  /PROGRAM_BINDING_MISMATCH/);
  assert.throws(() => compileSandboxOutcomeCompensation({ ...input(),
    contractDraft: { ...draft(), paymentAuthorized: true } }), /DRAFT_HASH_MISMATCH/);
  assert.throws(() => compileSandboxOutcomeCompensation({ ...input(),
    scenario: { ...scenario(), triggerPredicateRefHash: h("different-trigger") } }),
  /TRIGGER_BINDING_MISMATCH/);
  assert.throws(() => compileSandboxOutcomeCompensation({ ...input(),
    scenario: { ...scenario(), evidenceRefHashes: [] } }), /SCENARIO_EVIDENCE_REQUIRED/);
});
