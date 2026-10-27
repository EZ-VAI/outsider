import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createOutcomeEconomicContractDraftV1,
  evaluateDraftCompensationV1,
  bindOutcomeEconomicRecordsV1,
} from "../src/outsider-outcome-economic-contract-v1.js";

const h = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const usd = (minorUnits) => ({ currency: "USD", minorUnits });
const at = "2026-09-05T12:00:00.000Z";
const term = (calculation = { kind: "FIXED", amount: usd("5000") }) => ({
  termRefHash: h("term"), triggerPredicateRefHash: h("failure-trigger"),
  responsiblePartyRefHash: h("responsible-party"), beneficiaryRefHash: h("beneficiary"),
  paymentDueWithinSeconds: 86400, calculation,
});
const draftInput = (compensationTerms = [term()]) => ({
  contractVersion: 1, supersedesContractHash: null,
  outcomeProgramHash: h("program"), outcomeDefinitionHash: h("outcome"),
  episodeRefHash: h("existing-episode"), compensationTerms,
});
const records = (contractDraft = createOutcomeEconomicContractDraftV1(draftInput())) => ({
  contractDraft, predictedLosses: [], observedLosses: [], transactions: [],
});

test("ordinary execution attaches an empty economic draft without coverage or money authority", () => {
  const input = draftInput([]);
  const draft = createOutcomeEconomicContractDraftV1(input);
  assert.deepEqual(draft, createOutcomeEconomicContractDraftV1(input));
  assert.equal(draft.episodeRefHash, input.episodeRefHash);
  assert.equal(draft.status, "DRAFT_NOT_ACCEPTED");
  assert.equal(draft.capitalSupport, "NOT_BOUND");
  assert.equal(draft.guaranteeCreated, false);
  assert.equal(draft.paymentAuthorized, false);
  assert.equal(Object.isFrozen(draft.compensationTerms), true);
  const result = bindOutcomeEconomicRecordsV1(records(draft));
  assert.equal(result.contractHash, draft.contractHash);
  assert.deepEqual(result.observedLosses, []);
  assert.equal(result.sourceReplayPerformed, false);
});

test("fixed compensation is an exact draft scenario, never actual loss or amount authorized", () => {
  const draft = createOutcomeEconomicContractDraftV1(draftInput([
    term({ kind: "FIXED", amount: usd("900719925474099312345") }),
  ]));
  const value = evaluateDraftCompensationV1({ contractDraft: draft,
    termRefHash: h("term"), quantity: null });
  assert.deepEqual(value.amount, usd("900719925474099312345"));
  assert.equal(value.triggerEstablished, false);
  assert.equal(value.paymentAuthorized, false);
  assert.throws(() => evaluateDraftCompensationV1({ contractDraft: draft,
    termRefHash: h("term"), quantity: "1" }), /FIXED_QUANTITY_MUST_BE_NULL/);
});

test("bounded formulas clamp quantity and amount using integer arithmetic with no FX", () => {
  const make = (maximumAmount) => createOutcomeEconomicContractDraftV1(draftInput([
    term({ kind: "BOUNDED_PER_UNIT", unitRefHash: h("full-delay-day"),
      unitAmount: usd("9007199254740993"), maximumUnits: "2", maximumAmount }),
  ]));
  const evaluated = evaluateDraftCompensationV1({ contractDraft: make(usd("99999999999999999")),
    termRefHash: h("term"), quantity: "3" });
  assert.equal(evaluated.amount.minorUnits, "18014398509481986");
  assert.equal(evaluateDraftCompensationV1({ contractDraft: make(usd("5000")),
    termRefHash: h("term"), quantity: "2" }).amount.minorUnits, "5000");
  assert.throws(() => make({ currency: "JPY", minorUnits: "5000" }), /CURRENCY_MISMATCH/);
});

test("versioned descendants preserve the old draft and bound references; tampering is rejected", () => {
  const first = createOutcomeEconomicContractDraftV1(draftInput());
  const second = createOutcomeEconomicContractDraftV1({ ...draftInput(),
    contractVersion: 2, supersedesContractHash: first.contractHash });
  assert.notEqual(first.contractHash, second.contractHash);
  assert.equal(first.contractVersion, 1);
  assert.equal(second.supersedesContractHash, first.contractHash);
  assert.throws(() => createOutcomeEconomicContractDraftV1({ ...draftInput(),
    contractVersion: 2 }), /SUPERSESSION_MISMATCH/);
  assert.throws(() => bindOutcomeEconomicRecordsV1(records({ ...first,
    episodeRefHash: h("another-episode") })), /DRAFT_HASH_MISMATCH/);
  assert.throws(() => bindOutcomeEconomicRecordsV1(records({ ...first,
    paymentAuthorized: true })), /DRAFT_HASH_MISMATCH/);
});

test("predictions, zero/unknown observed losses and refund/compensation receipts remain distinct", () => {
  const input = records();
  input.predictedLosses = [{ recordRefHash: h("prediction"), estimatedAt: at,
    modelRefHash: h("research-model"), evidenceRefHash: h("features"), expectedLoss: usd("100") }];
  input.observedLosses = [
    { recordRefHash: h("zero-loss"), occurredAt: at, status: "RECOGNIZED",
      amount: usd("0"), economicLossBasis: "INVOICE_VERIFIED", evidenceRefHash: h("invoice") },
    { recordRefHash: h("unknown-loss"), occurredAt: at, status: "UNKNOWN",
      amount: null, economicLossBasis: null, evidenceRefHash: null },
  ];
  input.transactions = [
    { recordRefHash: h("refund"), occurredAt: at, kind: "CUSTOMER_REFUND", state: "CONFIRMED",
      amount: usd("2000"), sourceReceiptRefHash: h("refund-receipt"), relatedTermRefHash: null },
    { recordRefHash: h("compensation"), occurredAt: at, kind: "COMPENSATION_PAYMENT", state: "PENDING",
      amount: usd("5000"), sourceReceiptRefHash: h("payment-status"), relatedTermRefHash: h("term") },
  ];
  const value = bindOutcomeEconomicRecordsV1(input);
  assert.deepEqual(value.predictedLosses, input.predictedLosses);
  assert.deepEqual(value.observedLosses, input.observedLosses);
  assert.deepEqual(value.transactions, input.transactions);
  assert.equal(value.automaticOffsetsApplied, false);
  assert.equal(value.automaticTraining, false);
  assert.equal(value.paymentAuthorized, false);
  assert.equal(value.outcomeProgramHash, input.contractDraft.outcomeProgramHash);
  assert.equal(Object.hasOwn(value, "netLoss"), false);
});

test("bad money, duplicated records and unsupported recognized-loss claims fail narrowly", () => {
  for (const minorUnits of [5000, "05", "5.0", "-1"]) {
    assert.throws(() => createOutcomeEconomicContractDraftV1(draftInput([
      term({ kind: "FIXED", amount: usd(minorUnits) }),
    ])), /MINOR_UNITS_INVALID/);
  }
  assert.throws(() => createOutcomeEconomicContractDraftV1(draftInput([term(), term()])),
    /DUPLICATE_RECORD_REFERENCE/);
  const input = records();
  input.observedLosses = [{ recordRefHash: h("loss"), occurredAt: at, status: "RECOGNIZED",
    amount: usd("5000"), economicLossBasis: null, evidenceRefHash: null }];
  assert.throws(() => bindOutcomeEconomicRecordsV1(input), /REQUIRES_EVIDENCE_AND_BASIS/);
  input.observedLosses[0] = { ...input.observedLosses[0], status: "REPORTED" };
  input.transactions = [{ recordRefHash: h("loss"), occurredAt: at, kind: "CUSTOMER_REFUND",
    state: "CONFIRMED", amount: usd("5000"), sourceReceiptRefHash: h("receipt"), relatedTermRefHash: null }];
  assert.throws(() => bindOutcomeEconomicRecordsV1(input), /DUPLICATE_RECORD_REFERENCE/);
  input.transactions[0].recordRefHash = h("refund");
  input.transactions[0].relatedTermRefHash = h("term");
  input.transactions[0].amount.currency = "EUR";
  assert.throws(() => bindOutcomeEconomicRecordsV1(input), /TERM_CURRENCY_MISMATCH/);
});
