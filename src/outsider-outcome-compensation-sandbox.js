/*
 * Pure draft-compensation rehearsal attached to the existing runner's terminal
 * projection. No payment adapter, actual amount due, or accepted contract is
 * created here. In particular FAILED_CLOSED may reflect closure/telemetry
 * failure, so it is not automatically an independently established failure of
 * the customer's outcome. A rehearsal must name the draft trigger explicitly.
 */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  bindOutcomeEconomicRecordsV1,
  evaluateDraftCompensationV1,
} from "./outsider-outcome-economic-contract-v1.js";

const SCHEMA = "outsider/outcome-compensation-sandbox/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PENDING = new Set(["UNKNOWN", "PENDING", "FORMING", "COMMITTED",
  "EXECUTING", "CLOSING", "PAUSED_RETRYABLE"]);
const STATES = new Set([...PENDING, "SUCCEEDED", "FAILED_CLOSED", "UNAVAILABLE"]);
const SCENARIO_FIELDS = ["kind", "scenarioRefHash", "termRefHash",
  "triggerPredicateRefHash", "quantity", "evidenceRefHashes"];

function fail(code) {
  throw new TypeError(`OUTSIDER_OUTCOME_COMPENSATION_SANDBOX_${code}`);
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function terminalReference(value, contract) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !STATES.has(value.state)) fail("TERMINAL_OUTCOME_INVALID");
  const programHash = hash(value.programHash, "PROGRAM_HASH_INVALID");
  if (programHash !== contract.outcomeProgramHash) fail("PROGRAM_BINDING_MISMATCH");
  if (typeof value.programId !== "string" || value.programId.length < 1
    || value.programId.length > 256) fail("PROGRAM_ID_INVALID");
  return {
    programId: value.programId,
    programHash,
    state: value.state,
    journalHeadHash: hash(value.journalHeadHash, "JOURNAL_HEAD_HASH_INVALID"),
  };
}

function scenarioReference(value, draft, terminal) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== SCENARIO_FIELDS.length
    || SCENARIO_FIELDS.some((key) => !Object.hasOwn(value, key))) {
    fail("SCENARIO_FIELDS_INVALID");
  }
  if (!["CONTROLLED_FAILURE_REHEARSAL", "OBSERVED_FAILURE_REPLAY"]
    .includes(value.kind)) fail("SCENARIO_KIND_INVALID");
  if (value.kind === "OBSERVED_FAILURE_REPLAY"
    && terminal.state !== "FAILED_CLOSED") fail("OBSERVED_FAILURE_STATE_MISMATCH");
  const termRefHash = hash(value.termRefHash, "TERM_REF_HASH_INVALID");
  const term = draft.compensationTerms.find((entry) => entry.termRefHash === termRefHash);
  if (!term) fail("COMPENSATION_TERM_NOT_FOUND");
  if (hash(value.triggerPredicateRefHash, "TRIGGER_REF_HASH_INVALID")
    !== term.triggerPredicateRefHash) fail("TRIGGER_BINDING_MISMATCH");
  if (term.calculation.kind === "FIXED") {
    if (value.quantity !== null) fail("FIXED_QUANTITY_MUST_BE_NULL");
  } else if (typeof value.quantity !== "string"
    || !/^(?:0|[1-9][0-9]{0,39})$/u.test(value.quantity)) fail("QUANTITY_INVALID");
  if (!Array.isArray(value.evidenceRefHashes) || value.evidenceRefHashes.length < 1
    || value.evidenceRefHashes.length > 256) fail("SCENARIO_EVIDENCE_REQUIRED");
  const evidenceRefHashes = value.evidenceRefHashes
    .map((ref) => hash(ref, "SCENARIO_EVIDENCE_HASH_INVALID"));
  if (new Set(evidenceRefHashes).size !== evidenceRefHashes.length) {
    fail("DUPLICATE_SCENARIO_EVIDENCE");
  }
  return {
    kind: value.kind,
    scenarioRefHash: hash(value.scenarioRefHash, "SCENARIO_REF_HASH_INVALID"),
    termRefHash,
    triggerPredicateRefHash: term.triggerPredicateRefHash,
    quantity: value.quantity,
    evidenceRefHashes: [...evidenceRefHashes].sort(),
    assumedOutcomeState: "FAILED",
    triggerAssumedForRehearsalOnly: true,
  };
}

/**
 * Accepts the original runner inspect/public projection and projects only its
 * identifying references. A controlled hypothetical failure may be rehearsed
 * alongside a real success; the observed success is never replaced or edited.
 * Pending/unknown and pre-commit unavailable outcomes never calculate a payout.
 */
export function compileSandboxOutcomeCompensation({
  contractDraft, terminalOutcome, createdAt, scenario = null,
}) {
  canonicalizeStrict({ contractDraft, terminalOutcome, createdAt, scenario });
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))
    || new Date(createdAt).toISOString() !== createdAt) fail("CREATED_AT_INVALID");
  // Reuse the existing full draft/hash check, including an empty terms array.
  bindOutcomeEconomicRecordsV1({ contractDraft, predictedLosses: [],
    observedLosses: [], transactions: [] });
  const observedOutcome = terminalReference(terminalOutcome, contractDraft);
  const rehearsal = scenarioReference(scenario, contractDraft, observedOutcome);
  let decision;
  let calculation = null;
  if (PENDING.has(observedOutcome.state)) decision = "AWAITING_OUTCOME";
  else if (observedOutcome.state === "UNAVAILABLE") decision = "UNAVAILABLE_BEFORE_COMMIT";
  else if (rehearsal !== null) {
    decision = "SANDBOX_COMPENSATION_CALCULATED";
    calculation = evaluateDraftCompensationV1({ contractDraft,
      termRefHash: rehearsal.termRefHash, quantity: rehearsal.quantity });
  } else if (observedOutcome.state === "SUCCEEDED") decision = "NO_SANDBOX_COMPENSATION";
  else decision = "FAILURE_SCENARIO_REQUIRED";

  const sandboxTransfer = calculation === null ? null : {
    idempotencyKey: digest(`${SCHEMA}/transfer`, {
      contractHash: contractDraft.contractHash, observedOutcome, rehearsal,
      amount: calculation.amount,
    }),
    status: "SIMULATED_NOT_SUBMITTED",
    termRefHash: calculation.termRefHash,
    amount: calculation.amount,
    submitted: false,
    moneyMoved: false,
    paymentAuthorized: false,
  };
  const body = {
    schema: SCHEMA,
    mode: "SANDBOX",
    createdAt,
    contractHash: contractDraft.contractHash,
    contractStatus: "DRAFT_NOT_ACCEPTED",
    outcomeProgramHash: contractDraft.outcomeProgramHash,
    episodeRefHash: contractDraft.episodeRefHash,
    observedOutcome,
    rehearsal,
    decision,
    calculation,
    sandboxTransfer,
    sourceVerification: "CALLER_REFERENCES_ONLY",
    sourceReplayPerformed: false,
    independentOutcomeVerified: false,
    actualFailureEstablished: false,
    actualCompensationDue: null,
    guaranteeCreated: false,
    capitalBound: false,
    paymentAuthorized: false,
    moneyMoved: false,
    originalHistoryModified: false,
  };
  return freeze({ ...body, recordHash: digest(SCHEMA, body) });
}
