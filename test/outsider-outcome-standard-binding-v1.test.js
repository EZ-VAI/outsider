import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY,
  createOutcomeStandardBindingV1,
  verifyOutcomeStandardBindingV1,
} from "../src/outsider-outcome-standard-binding-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;

function input(overrides = {}) {
  return {
    standardName: "UCP",
    standardVersion: "2026-01-23",
    standardRevisionHash: h("ucp:specification-revision"),
    sourcePayloadHash: h("ucp:source-payload"),
    outsiderOutcomeArtifactHash: h("outsider:outcome"),
    outsiderLifecycleHeadHash: h("outsider:lifecycle-head"),
    bindingKind: "LIFECYCLE_STATE_REPORT",
    ...overrides,
  };
}

test("UCP, AP2, and A2A bind as version-pinned source reports only", () => {
  const cases = [
    ["UCP", "2026-01-23", "LIFECYCLE_STATE_REPORT"],
    ["AP2", "v0.2", "SOURCE_RECEIPT_REPORT"],
    ["A2A", "1.0.0", "LIFECYCLE_STATE_REPORT"],
  ];
  for (const [standardName, standardVersion, bindingKind] of cases) {
    const receipt = createOutcomeStandardBindingV1(input({
      standardName,
      standardVersion,
      standardRevisionHash: h(`${standardName}:revision`),
      sourcePayloadHash: h(`${standardName}:payload`),
      bindingKind,
    }));
    assert.equal(receipt.standardName, standardName);
    assert.equal(receipt.standardVersion, standardVersion);
    assert.equal(receipt.standardRevisionPinned, true);
    assert.equal(receipt.compatibilityOnly, true);
    assert.equal(receipt.sourceReportMeaning, "SOURCE_REPORT_ONLY");
    assert.equal(receipt.externalStandardImplemented, false);
    assert.equal(receipt.externalStandardPayloadParsed, false);
    assert.equal(receipt.externalStandardSchemaValidated, false);
    assert.equal(receipt.externalStandardSemanticsReplayed, false);
    assert.equal(receipt.sourceSignatureVerified, false);
    assert.equal(receipt.cryptographicSignatureCreated, false);
    assert.equal(receipt.externalStandardStateAcceptedAsOutcomeTruth, false);
    assert.equal(receipt.externalStandardReceiptAcceptedAsOutcomeTruth, false);
    assert.equal(receipt.externalStandardMandateAcceptedAsAuthority, false);
    assert.equal(receipt.externalStandardCapabilityAcceptedAsCapacity, false);
    assert.equal(receipt.authorityMinted, false);
    assert.equal(receipt.capacityEstablished, false);
    assert.equal(receipt.outcomeTruthEstablished, false);
    assert.equal(receipt.outcomeCommitIssued, false);
    assert.equal(receipt.authority, "NONE");
    assert.equal(receipt.actionReady, false);
    assert.equal(receipt.executable, false);
    assert.match(receipt.bindingHash, /^sha256:[a-f0-9]{64}$/u);
    assert.match(receipt.receiptHash, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(verifyOutcomeStandardBindingV1(
      structuredClone(receipt)).receiptHash, receipt.receiptHash);
  }
});

test("the structural receipt and both hashes are deterministic", () => {
  const first = createOutcomeStandardBindingV1(input());
  const second = createOutcomeStandardBindingV1({
    bindingKind: "LIFECYCLE_STATE_REPORT",
    outsiderLifecycleHeadHash: h("outsider:lifecycle-head"),
    outsiderOutcomeArtifactHash: h("outsider:outcome"),
    sourcePayloadHash: h("ucp:source-payload"),
    standardRevisionHash: h("ucp:specification-revision"),
    standardVersion: "2026-01-23",
    standardName: "UCP",
  });
  assert.deepEqual(first, second);
  assert.equal(first.bindingHash, second.bindingHash);
  assert.equal(first.receiptHash, second.receiptHash);
  const changed = createOutcomeStandardBindingV1(input({
    sourcePayloadHash: h("ucp:different-source-payload"),
  }));
  assert.notEqual(changed.bindingHash, first.bindingHash);
  assert.notEqual(changed.receiptHash, first.receiptHash);
});

test("unknown standards fail closed", () => {
  assert.throws(() => createOutcomeStandardBindingV1(input({
    standardName: "UNKNOWN",
  })), /STANDARD_NAME_INVALID/u);
  assert.throws(() => createOutcomeStandardBindingV1(input({
    standardName: "ucp",
  })), /STANDARD_NAME_INVALID/u);
});

test("an absent or malformed specification revision pin fails closed", () => {
  const { standardRevisionHash: ignored, ...missing } = input();
  assert.throws(() => createOutcomeStandardBindingV1(missing),
    /INPUT_FIELDS_INVALID/u);
  assert.throws(() => createOutcomeStandardBindingV1(input({
    standardRevisionHash: "main",
  })), /STANDARD_REVISION_HASH_INVALID/u);
  assert.throws(() => createOutcomeStandardBindingV1(input({
    standardRevisionHash: null,
  })), /STANDARD_REVISION_HASH_INVALID/u);
});

test("unversioned input and unknown binding kinds fail closed", () => {
  assert.throws(() => createOutcomeStandardBindingV1(input({
    standardVersion: "",
  })), /STANDARD_VERSION_INVALID/u);
  assert.throws(() => createOutcomeStandardBindingV1(input({
    standardVersion: "latest",
  })), /STANDARD_VERSION_INVALID/u);
  assert.throws(() => createOutcomeStandardBindingV1(input({
    bindingKind: "COMMIT",
  })), /BINDING_KIND_INVALID/u);
});

test("raw standard data, URL, PII, credentials, and payment cannot enter", () => {
  for (const extra of [
    { sourcePayload: { status: "COMPLETED" } },
    { sourceUrl: "https://standard.example/report" },
    { email: "person@example.test" },
    { credential: "secret" },
    { paymentToken: "payment" },
  ]) {
    assert.throws(() => createOutcomeStandardBindingV1({
      ...input(), ...extra,
    }), /INPUT_FIELDS_INVALID/u);
  }
  assert.equal(JSON.stringify(createOutcomeStandardBindingV1(input()))
    .includes("standard.example"), false);
});

test("receipt tampering cannot upgrade a source report", () => {
  const valid = createOutcomeStandardBindingV1(input());
  for (const mutation of [
    { outcomeTruthEstablished: true },
    { authorityMinted: true },
    { capacityEstablished: true },
    { outcomeCommitIssued: true },
    { sourceSignatureVerified: true },
    { receiptHash: h("forged") },
  ]) {
    assert.throws(() => verifyOutcomeStandardBindingV1({
      ...structuredClone(valid), ...mutation,
    }), /RECEIPT_DERIVATION_OR_HASH_INVALID/u);
  }
});

test("the exported boundary states the non-authorizing compatibility scope",
  () => {
    assert.equal(OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY
      .externalStandardImplemented, false);
    assert.equal(OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY
      .sourceReportMeaning, "SOURCE_REPORT_ONLY");
    assert.equal(OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY
      .externalStandardStateAcceptedAsOutcomeTruth, false);
    assert.equal(OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY
      .externalStandardReceiptAcceptedAsOutcomeTruth, false);
    assert.equal(OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY
      .authorityMinted, false);
    assert.equal(OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY
      .capacityEstablished, false);
    assert.equal(OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY
      .outcomeCommitIssued, false);
    assert.equal(OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY
      .cryptographicSignatureCreated, false);
  });
