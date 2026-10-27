/*
 * Thin, provider-neutral economic attachment to an existing Outcome/Episode.
 * A draft is neither an accepted obligation nor insurance/capital/payment
 * authority. Evidence references identify caller-supplied records; this module
 * does not replay their sources, infer actual loss, or move money.
 *
 * Amounts are canonical unsigned decimal strings in the declared currency's
 * minor units. No floating-point money, FX, cross-currency totals, automatic
 * offsets, source deduplication, persistence, or training is performed here.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { OBSERVED_ECONOMIC_LOSS_BASES }
  from "./outsider-loss-exposure-evidence.js";

const PREFIX = "OUTSIDER_OUTCOME_ECONOMIC_CONTRACT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const INTEGER = /^(?:0|[1-9][0-9]{0,39})$/u;
const DRAFT_SCHEMA = "outsider/outcome-economic-contract-draft/v1";
const RECORD_SCHEMA = "outsider/outcome-economic-record-binding/v1";
const INPUT_FIELDS = ["contractVersion", "supersedesContractHash",
  "outcomeProgramHash", "outcomeDefinitionHash", "episodeRefHash",
  "compensationTerms"];

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exact(value, fields, code) {
  canonicalizeStrict(value);
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function integer(value, code) {
  if (typeof value !== "string" || !INTEGER.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function money(value) {
  exact(value, ["currency", "minorUnits"], "MONEY");
  if (typeof value.currency !== "string"
    || !/^[A-Z]{3}$/u.test(value.currency)) fail("CURRENCY_INVALID");
  return { currency: value.currency,
    minorUnits: integer(value.minorUnits, "MINOR_UNITS") };
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function digest(schema, value) {
  return `sha256:${createHash("sha256")
    .update(`${schema}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function normalizeCalculation(value) {
  canonicalizeStrict(value);
  if (value?.kind === "FIXED") {
    exact(value, ["kind", "amount"], "FIXED_CALCULATION");
    return { kind: "FIXED", amount: money(value.amount) };
  }
  exact(value, ["kind", "unitRefHash", "unitAmount", "maximumUnits",
    "maximumAmount"], "BOUNDED_CALCULATION");
  if (value.kind !== "BOUNDED_PER_UNIT") fail("CALCULATION_KIND_INVALID");
  const unitAmount = money(value.unitAmount);
  const maximumAmount = money(value.maximumAmount);
  if (unitAmount.currency !== maximumAmount.currency) fail("FORMULA_CURRENCY_MISMATCH");
  return {
    kind: value.kind,
    unitRefHash: hash(value.unitRefHash, "UNIT_REF_HASH"),
    unitAmount,
    maximumUnits: integer(value.maximumUnits, "MAXIMUM_UNITS"),
    maximumAmount,
  };
}

function normalizeTerm(value) {
  exact(value, ["termRefHash", "triggerPredicateRefHash",
    "responsiblePartyRefHash", "beneficiaryRefHash", "paymentDueWithinSeconds",
    "calculation"], "COMPENSATION_TERM");
  if (!Number.isSafeInteger(value.paymentDueWithinSeconds)
    || value.paymentDueWithinSeconds < 0) fail("PAYMENT_WINDOW_INVALID");
  return {
    termRefHash: hash(value.termRefHash, "TERM_REF_HASH"),
    triggerPredicateRefHash: hash(value.triggerPredicateRefHash, "TRIGGER_REF_HASH"),
    responsiblePartyRefHash: hash(value.responsiblePartyRefHash, "RESPONSIBLE_PARTY_REF_HASH"),
    beneficiaryRefHash: hash(value.beneficiaryRefHash, "BENEFICIARY_REF_HASH"),
    paymentDueWithinSeconds: value.paymentDueWithinSeconds,
    calculation: normalizeCalculation(value.calculation),
  };
}

function uniqueRecords(values, normalize, key, seen = new Set()) {
  if (!Array.isArray(values) || values.length > 256) fail("RECORD_LIST_INVALID");
  return values.map((value) => {
    const normalized = normalize(value);
    if (seen.has(normalized[key])) fail("DUPLICATE_RECORD_REFERENCE");
    seen.add(normalized[key]);
    return normalized;
  });
}

/** A proposal may attach an empty compensationTerms array for ordinary execution. */
export function createOutcomeEconomicContractDraftV1(input) {
  exact(input, INPUT_FIELDS, "DRAFT");
  if (!Number.isSafeInteger(input.contractVersion) || input.contractVersion < 1) {
    fail("CONTRACT_VERSION_INVALID");
  }
  const supersedesContractHash = hash(input.supersedesContractHash,
    "SUPERSEDES_CONTRACT_HASH", true);
  if ((input.contractVersion === 1) !== (supersedesContractHash === null)) {
    fail("CONTRACT_VERSION_SUPERSESSION_MISMATCH");
  }
  const body = {
    schema: DRAFT_SCHEMA,
    contractVersion: input.contractVersion,
    supersedesContractHash,
    outcomeProgramHash: hash(input.outcomeProgramHash, "OUTCOME_PROGRAM_HASH"),
    outcomeDefinitionHash: hash(input.outcomeDefinitionHash, "OUTCOME_DEFINITION_HASH"),
    episodeRefHash: hash(input.episodeRefHash, "EPISODE_REF_HASH"),
    compensationTerms: uniqueRecords(input.compensationTerms,
      normalizeTerm, "termRefHash"),
    status: "DRAFT_NOT_ACCEPTED",
    capitalSupport: "NOT_BOUND",
    guaranteeCreated: false,
    paymentAuthorized: false,
  };
  return freeze({ ...body, contractHash: digest(DRAFT_SCHEMA, body) });
}

function checkedDraft(value) {
  canonicalizeStrict(value);
  if (!value || typeof value !== "object") fail("DRAFT_INVALID");
  const rebuilt = createOutcomeEconomicContractDraftV1(Object.fromEntries(
    INPUT_FIELDS.map((field) => [field, value[field]])));
  if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(value)) fail("DRAFT_HASH_MISMATCH");
  return rebuilt;
}

/** Calculates a draft scenario only, not a trigger determination or amount due.
 * Formula: min(unitAmount * min(quantity, maximumUnits), maximumAmount).
 */
export function evaluateDraftCompensationV1(input) {
  exact(input, ["contractDraft", "termRefHash", "quantity"], "EVALUATION");
  const draft = checkedDraft(input.contractDraft);
  const term = draft.compensationTerms.find((entry) => entry.termRefHash
    === hash(input.termRefHash, "TERM_REF_HASH"));
  if (!term) fail("COMPENSATION_TERM_NOT_FOUND");
  const calculation = term.calculation;
  let amount;
  if (calculation.kind === "FIXED") {
    if (input.quantity !== null) fail("FIXED_QUANTITY_MUST_BE_NULL");
    amount = calculation.amount;
  } else {
    const quantity = BigInt(integer(input.quantity, "QUANTITY"));
    const maximumUnits = BigInt(calculation.maximumUnits);
    const product = BigInt(calculation.unitAmount.minorUnits)
      * (quantity < maximumUnits ? quantity : maximumUnits);
    const cap = BigInt(calculation.maximumAmount.minorUnits);
    amount = { currency: calculation.unitAmount.currency,
      minorUnits: (product < cap ? product : cap).toString() };
  }
  return freeze({ contractHash: draft.contractHash, termRefHash: term.termRefHash,
    quantity: input.quantity, amount, calculationOnly: true,
    triggerEstablished: false, paymentAuthorized: false });
}

function prediction(value) {
  exact(value, ["recordRefHash", "estimatedAt", "modelRefHash",
    "evidenceRefHash", "expectedLoss"], "PREDICTION");
  return {
    recordRefHash: hash(value.recordRefHash, "PREDICTION_REF_HASH"),
    estimatedAt: instant(value.estimatedAt, "ESTIMATED_AT"),
    modelRefHash: hash(value.modelRefHash, "MODEL_REF_HASH"),
    evidenceRefHash: hash(value.evidenceRefHash, "PREDICTION_EVIDENCE_REF_HASH"),
    expectedLoss: value.expectedLoss === null ? null : money(value.expectedLoss),
  };
}

function observation(value) {
  exact(value, ["recordRefHash", "occurredAt", "status", "amount",
    "economicLossBasis", "evidenceRefHash"], "OBSERVED_LOSS");
  if (!["REPORTED", "RECOGNIZED", "DISPUTED", "UNKNOWN"].includes(value.status)) {
    fail("OBSERVED_LOSS_STATUS_INVALID");
  }
  if ((value.status === "UNKNOWN") !== (value.amount === null)) {
    fail("OBSERVED_LOSS_UNKNOWN_AMOUNT_MISMATCH");
  }
  if (value.economicLossBasis !== null
    && !OBSERVED_ECONOMIC_LOSS_BASES.includes(value.economicLossBasis)) {
    fail("OBSERVED_LOSS_BASIS_INVALID");
  }
  if (value.status === "RECOGNIZED"
    && (value.economicLossBasis === null || value.evidenceRefHash === null)) {
    fail("RECOGNIZED_LOSS_REQUIRES_EVIDENCE_AND_BASIS");
  }
  return {
    recordRefHash: hash(value.recordRefHash, "OBSERVED_LOSS_REF_HASH"),
    occurredAt: instant(value.occurredAt, "LOSS_OCCURRED_AT"),
    status: value.status,
    amount: value.amount === null ? null : money(value.amount),
    economicLossBasis: value.economicLossBasis,
    evidenceRefHash: hash(value.evidenceRefHash, "LOSS_EVIDENCE_REF_HASH", true),
  };
}

function transaction(value, draft) {
  exact(value, ["recordRefHash", "occurredAt", "kind", "state", "amount",
    "sourceReceiptRefHash", "relatedTermRefHash"], "TRANSACTION");
  if (!["EXECUTION_COST", "RECOVERY_COST", "CUSTOMER_REFUND",
    "SUPPLIER_RECOVERY", "INSURANCE_PAYMENT", "COMPENSATION_PAYMENT"]
    .includes(value.kind)) fail("TRANSACTION_KIND_INVALID");
  if (!["PENDING", "CONFIRMED", "REVERSED"].includes(value.state)) {
    fail("TRANSACTION_STATE_INVALID");
  }
  const relatedTermRefHash = hash(value.relatedTermRefHash, "RELATED_TERM_REF_HASH", true);
  const term = relatedTermRefHash === null ? null
    : draft.compensationTerms.find((entry) => entry.termRefHash === relatedTermRefHash);
  if (relatedTermRefHash !== null && !term) fail("TRANSACTION_TERM_NOT_FOUND");
  const amount = money(value.amount);
  if (term && amount.currency !== (term.calculation.amount
    ?? term.calculation.unitAmount).currency) fail("TRANSACTION_TERM_CURRENCY_MISMATCH");
  return {
    recordRefHash: hash(value.recordRefHash, "TRANSACTION_REF_HASH"),
    occurredAt: instant(value.occurredAt, "TRANSACTION_OCCURRED_AT"),
    kind: value.kind,
    state: value.state,
    amount,
    sourceReceiptRefHash: hash(value.sourceReceiptRefHash, "TRANSACTION_RECEIPT_REF_HASH"),
    relatedTermRefHash,
  };
}

/** Attaches distinct source records to the existing episode, without creating a
 * second ledger or converting a receipt/prediction into recognized loss.
 * The caller retains source bytes and uses the existing source-replay bridge.
 */
export function bindOutcomeEconomicRecordsV1(input) {
  exact(input, ["contractDraft", "predictedLosses", "observedLosses",
    "transactions"], "ECONOMIC_RECORDS");
  const draft = checkedDraft(input.contractDraft);
  const seen = new Set();
  const body = {
    schema: RECORD_SCHEMA,
    contractHash: draft.contractHash,
    contractVersion: draft.contractVersion,
    outcomeProgramHash: draft.outcomeProgramHash,
    outcomeDefinitionHash: draft.outcomeDefinitionHash,
    episodeRefHash: draft.episodeRefHash,
    predictedLosses: uniqueRecords(input.predictedLosses,
      prediction, "recordRefHash", seen),
    observedLosses: uniqueRecords(input.observedLosses,
      observation, "recordRefHash", seen),
    transactions: uniqueRecords(input.transactions,
      (value) => transaction(value, draft), "recordRefHash", seen),
    sourceVerification: "CALLER_REFERENCES_ONLY",
    currencyConversion: "NONE",
    automaticOffsetsApplied: false,
    sourceReplayPerformed: false,
    automaticTraining: false,
    paymentAuthorized: false,
  };
  return freeze({ ...body, recordBindingHash: digest(RECORD_SCHEMA, body) });
}
