/*
 * Outsider Outcome standard binding v1.
 *
 * This is a deliberately narrow compatibility plane between one canonical
 * Outsider Outcome/lifecycle and a version-pinned UCP, AP2, or A2A source
 * report. It accepts hashes only. It does not parse, validate, or reimplement
 * any external standard, and it does not turn an external status, mandate,
 * acknowledgement, or receipt into Outcome truth, authority, capacity, or an
 * Outsider COMMIT.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_OUTCOME_STANDARD_BINDING_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const VERSION = /^[A-Za-z0-9](?:[A-Za-z0-9._+-]{0,127})$/u;
const UNPINNED_VERSION_ALIASES = new Set([
  "current", "head", "latest", "main", "master", "next", "tip", "trunk",
]);

export const OUTSIDER_OUTCOME_STANDARD_BINDING_V1_SCHEMAS = Object.freeze({
  binding: "outsider/outcome-standard-binding/v1",
  receipt: "outsider/outcome-standard-binding-structural-receipt/v1",
});

export const OUTSIDER_OUTCOME_STANDARD_BINDING_V1_STANDARDS = Object.freeze([
  "UCP",
  "AP2",
  "A2A",
]);

export const OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BINDING_KINDS
  = Object.freeze([
    "OUTCOME_REFERENCE",
    "LIFECYCLE_STATE_REPORT",
    "SOURCE_RECEIPT_REPORT",
  ]);

export const OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY = deepFreeze({
  position: "VERSION_PINNED_HASH_ONLY_STANDARD_COMPATIBILITY_PLANE",
  acceptedStandards: OUTSIDER_OUTCOME_STANDARD_BINDING_V1_STANDARDS,
  acceptedBindingKinds:
    OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BINDING_KINDS,
  exactSpecificationRevisionRequired: true,
  sourcePayloadAcceptedByHashOnly: true,
  outsiderOutcomeAcceptedByHashOnly: true,
  outsiderLifecycleAcceptedByHashOnly: true,
  rawSourcePayloadAccepted: false,
  arbitraryUrlsAccepted: false,
  directPiiAccepted: false,
  credentialsAccepted: false,
  paymentMaterialAccepted: false,
  externalStandardImplemented: false,
  externalStandardPayloadParsed: false,
  externalStandardSchemaValidated: false,
  externalStandardSemanticsReplayed: false,
  sourceSignatureVerified: false,
  cryptographicSignatureCreated: false,
  receiptForm:
    "DETERMINISTIC_CONTENT_ADDRESSED_STRUCTURAL_REPORT_NOT_A_SIGNATURE",
  sourceReportReferenceBound: true,
  sourceReportMeaning: "SOURCE_REPORT_ONLY",
  externalStandardStateAcceptedAsOutcomeTruth: false,
  externalStandardReceiptAcceptedAsOutcomeTruth: false,
  externalStandardMandateAcceptedAsAuthority: false,
  externalStandardCapabilityAcceptedAsCapacity: false,
  authorityMinted: false,
  capacityEstablished: false,
  outcomeTruthEstablished: false,
  outcomePromiseIssued: false,
  guaranteeCreated: false,
  outcomeCommitIssued: false,
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
});

const INPUT_FIELDS = Object.freeze([
  "standardName",
  "standardVersion",
  "standardRevisionHash",
  "sourcePayloadHash",
  "outsiderOutcomeArtifactHash",
  "outsiderLifecycleHeadHash",
  "bindingKind",
]);

const RECEIPT_FIELDS = Object.freeze([
  "schema",
  "schemaVersion",
  "recordClass",
  ...INPUT_FIELDS,
  "standardRevisionPinned",
  "compatibilityOnly",
  "sourceReportReferenceBound",
  "sourceReportMeaning",
  "externalStandardImplemented",
  "externalStandardPayloadParsed",
  "externalStandardSchemaValidated",
  "externalStandardSemanticsReplayed",
  "sourceSignatureVerified",
  "cryptographicSignatureCreated",
  "externalStandardStateAcceptedAsOutcomeTruth",
  "externalStandardReceiptAcceptedAsOutcomeTruth",
  "externalStandardMandateAcceptedAsAuthority",
  "externalStandardCapabilityAcceptedAsCapacity",
  "authorityMinted",
  "capacityEstablished",
  "outcomeTruthEstablished",
  "outcomePromiseIssued",
  "guaranteeCreated",
  "outcomeCommitIssued",
  "decisionState",
  "authority",
  "actionReady",
  "executable",
  "boundary",
  "bindingHash",
  "receiptHash",
]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function oneOf(value, allowed, code) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function version(value) {
  if (typeof value !== "string" || !VERSION.test(value)
    || UNPINNED_VERSION_ALIASES.has(value.toLowerCase())) {
    fail("STANDARD_VERSION_INVALID");
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function normalizeInput(value) {
  exactObject(value, INPUT_FIELDS, "INPUT");
  return deepFreeze({
    standardName: oneOf(value.standardName,
      OUTSIDER_OUTCOME_STANDARD_BINDING_V1_STANDARDS, "STANDARD_NAME"),
    standardVersion: version(value.standardVersion),
    standardRevisionHash: hash(value.standardRevisionHash,
      "STANDARD_REVISION_HASH"),
    sourcePayloadHash: hash(value.sourcePayloadHash, "SOURCE_PAYLOAD_HASH"),
    outsiderOutcomeArtifactHash: hash(value.outsiderOutcomeArtifactHash,
      "OUTSIDER_OUTCOME_ARTIFACT_HASH"),
    outsiderLifecycleHeadHash: hash(value.outsiderLifecycleHeadHash,
      "OUTSIDER_LIFECYCLE_HEAD_HASH"),
    bindingKind: oneOf(value.bindingKind,
      OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BINDING_KINDS, "BINDING_KIND"),
  });
}

function bindingBody(input) {
  return deepFreeze({
    schema: OUTSIDER_OUTCOME_STANDARD_BINDING_V1_SCHEMAS.binding,
    schemaVersion: "1.0.0",
    ...input,
    standardRevisionPinned: true,
    compatibilityOnly: true,
    sourceReportReferenceBound: true,
    sourceReportMeaning: "SOURCE_REPORT_ONLY",
    externalStandardImplemented: false,
    externalStandardPayloadParsed: false,
    externalStandardSchemaValidated: false,
    externalStandardSemanticsReplayed: false,
    externalStandardStateAcceptedAsOutcomeTruth: false,
    externalStandardReceiptAcceptedAsOutcomeTruth: false,
    externalStandardMandateAcceptedAsAuthority: false,
    externalStandardCapabilityAcceptedAsCapacity: false,
    authorityMinted: false,
    capacityEstablished: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });
}

/**
 * Create a deterministic, content-addressed structural receipt.
 *
 * The receipt proves only that the supplied hashes were structurally bound
 * under the named, version-pinned compatibility namespace. It is neither an
 * external-standard signature verification nor an Outsider action admission.
 */
export function createOutcomeStandardBindingV1(input = {}) {
  const normalized = normalizeInput(input);
  const binding = bindingBody(normalized);
  const bindingHash = digest(binding.schema, binding);
  const body = {
    schema: OUTSIDER_OUTCOME_STANDARD_BINDING_V1_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    recordClass: "HASH_ONLY_STANDARD_SOURCE_REPORT_STRUCTURAL_RECEIPT",
    ...normalized,
    standardRevisionPinned: true,
    compatibilityOnly: true,
    sourceReportReferenceBound: true,
    sourceReportMeaning: "SOURCE_REPORT_ONLY",
    externalStandardImplemented: false,
    externalStandardPayloadParsed: false,
    externalStandardSchemaValidated: false,
    externalStandardSemanticsReplayed: false,
    sourceSignatureVerified: false,
    cryptographicSignatureCreated: false,
    externalStandardStateAcceptedAsOutcomeTruth: false,
    externalStandardReceiptAcceptedAsOutcomeTruth: false,
    externalStandardMandateAcceptedAsAuthority: false,
    externalStandardCapabilityAcceptedAsCapacity: false,
    authorityMinted: false,
    capacityEstablished: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY,
    bindingHash,
  };
  return deepFreeze({ ...body, receiptHash: digest(body.schema, body) });
}

/** Verify an exported structural receipt by exact deterministic recreation. */
export function verifyOutcomeStandardBindingV1(receipt = {}) {
  exactObject(receipt, RECEIPT_FIELDS, "RECEIPT");
  const recreated = createOutcomeStandardBindingV1({
    standardName: receipt.standardName,
    standardVersion: receipt.standardVersion,
    standardRevisionHash: receipt.standardRevisionHash,
    sourcePayloadHash: receipt.sourcePayloadHash,
    outsiderOutcomeArtifactHash: receipt.outsiderOutcomeArtifactHash,
    outsiderLifecycleHeadHash: receipt.outsiderLifecycleHeadHash,
    bindingKind: receipt.bindingKind,
  });
  if (!same(receipt, recreated)) fail("RECEIPT_DERIVATION_OR_HASH_INVALID");
  return recreated;
}
