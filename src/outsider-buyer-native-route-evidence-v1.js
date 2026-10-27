/*
 * Seller-neutral buyer-native route evidence v1.
 *
 * Every seller adapter can emit this closed, content-addressed shape instead
 * of teaching the recovery admission path its private projection schema. The
 * four facts map directly into the existing append-only candidate evidence
 * stream. Missing, partial, mismatched, unstructured, and unreserved states
 * remain first-class facts; this layer cannot promote an ATP value, cart, or
 * seller acknowledgement into owner-lifecycle capacity or Outcome truth.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1,
  createRecoveryCandidateEvidenceEventV1,
  selectRecoveryPortfolioCandidatesV1,
} from "./outsider-recovery-portfolio-admission-gate-v1.js";

const PREFIX = "OUTSIDER_BUYER_NATIVE_ROUTE_EVIDENCE_V1_";
const SCHEMA = "outsider/buyer-native-route-evidence/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_ROUTES = 1_000;

const INPUT_FIELDS = Object.freeze([
  "routeProposalRefHash", "occurrenceRefHash", "recoveryOptionRefHash",
  "observedAt", "validUntil", "sourceReplayReceiptHash", "facts",
]);
const RECORD_FIELDS = Object.freeze([
  "schema", "schemaVersion", ...INPUT_FIELDS, "evidenceHash",
]);
const FACTS_FIELDS = Object.freeze([
  "specification", "allInPrice", "eta", "capacity",
]);
const FACT_FIELDS = Object.freeze({
  specification: Object.freeze([
    "sourceOccurrenceRefHash", "frozenPredicateHash", "evaluationRefHash",
    "status",
  ]),
  allInPrice: Object.freeze([
    "sourceOccurrenceRefHash", "constraintRefHash", "currency",
    "allInMinorUnits", "includesItemTaxShippingAndFees", "status",
  ]),
  eta: Object.freeze([
    "sourceOccurrenceRefHash", "completionDeadline",
    "estimatedCompletionAt", "status",
  ]),
  capacity: Object.freeze([
    "sourceOccurrenceRefHash", "capacityLifecycleRefHash",
    "capacityLifecycleHeadHash", "reservedFrom", "reservedUntil", "status",
    "sourceClass",
  ]),
});
const KIND_BY_FACT = Object.freeze({
  specification: "SPECIFICATION",
  allInPrice: "ALL_IN_PRICE",
  eta: "ETA",
  capacity: "CAPACITY",
});
const SELECT_INPUT_FIELDS = Object.freeze([
  "outcomeLifecycleEvents", "routeProposalRegistryEvents",
  "recoveryPortfolio", "evaluatedAt", "frozenConstraints", "routeEvidence",
]);

export const OUTSIDER_BUYER_NATIVE_ROUTE_EVIDENCE_V1_SCHEMA = SCHEMA;

export const OUTSIDER_BUYER_NATIVE_ROUTE_EVIDENCE_V1_BOUNDARY = deepFreeze({
  position: "SELLER_ADAPTER_TO_EXISTING_RECOVERY_ADMISSION_GATE",
  sellerSpecificProjectionSchemasAccepted: false,
  providerIdentifiersAccepted: false,
  productIdentifiersAccepted: false,
  contentHashesOnlyForSourceIdentity: true,
  normalizedFacts: Object.freeze([
    "SPECIFICATION", "ALL_IN_PRICE", "ETA", "CAPACITY",
  ]),
  negativeAndUnprovenStatesPreserved: true,
  rawProviderBytesAccepted: false,
  directPiiAccepted: false,
  credentialsAccepted: false,
  paymentMaterialAccepted: false,
  atpAcceptedAsCapacityReservation: false,
  cartAcceptedAsCapacityReservation: false,
  sellerAcknowledgementAcceptedAsOwnerLifecycleCapacity: false,
  sellerClaimAcceptedAsIndependentOutcomeTruth: false,
  serverAcknowledgementAcceptedAsIndependentOutcomeTruth: false,
  sourceReplayReceiptAcceptedAsIndependentOutcomeTruth: false,
  existingRecoveryAdmissionGateReused: true,
  additionalRegistryCreated: false,
  mappingReservesCapacity: false,
  mappingMintsAuthority: false,
  mappingCommitsOutcome: false,
  networkIoPerformed: false,
  authority: "NONE",
  actionReady: false,
  executable: false,
});

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

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== fields.length) {
    fail(`${code}_FIELDS_INVALID`);
  }
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function dense(value, maximum, code) {
  if (!Array.isArray(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1
    || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) fail(`${code}_INVALID`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC.test(value)
    || !Number.isSafeInteger(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function normalizedFacts(input, common) {
  exact(input, FACTS_FIELDS, "FACTS");
  let previousEventHash = OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1;
  return Object.fromEntries(FACTS_FIELDS.map((factName, index) => {
    const fact = exact(input[factName], FACT_FIELDS[factName],
      `${factName.toUpperCase()}_FACT`);
    const { sourceOccurrenceRefHash, ...payload } = fact;
    const evidenceKind = KIND_BY_FACT[factName];
    const event = createRecoveryCandidateEvidenceEventV1({
      routeProposalRefHash: common.routeProposalRefHash,
      recoveryOptionRefHash: common.recoveryOptionRefHash,
      ordinal: index + 1,
      previousEventHash,
      observedAt: common.observedAt,
      validUntil: common.validUntil,
      evidenceKind,
      evidenceOccurrenceRefHash: digest(
        "outsider/buyer-native-route-evidence-validation-occurrence/v1", {
          routeProposalRefHash: common.routeProposalRefHash,
          evidenceKind,
        }),
      sourceOccurrenceRefHash: hash(sourceOccurrenceRefHash,
        `${factName.toUpperCase()}_SOURCE_OCCURRENCE_REF_HASH`),
      sourceArtifactHash: common.routeProposalRefHash,
      sourceReplayReceiptHash: common.sourceReplayReceiptHash,
      payload,
    });
    previousEventHash = event.eventHash;
    return [factName, deepFreeze({
      sourceOccurrenceRefHash: event.sourceOccurrenceRefHash,
      ...event.payload,
    })];
  }));
}

function normalizeInput(input) {
  exact(input, INPUT_FIELDS, "INPUT");
  const common = {
    routeProposalRefHash: hash(input.routeProposalRefHash,
      "ROUTE_PROPOSAL_REF_HASH"),
    occurrenceRefHash: hash(input.occurrenceRefHash, "OCCURRENCE_REF_HASH"),
    recoveryOptionRefHash: hash(input.recoveryOptionRefHash,
      "RECOVERY_OPTION_REF_HASH"),
    observedAt: instant(input.observedAt, "OBSERVED_AT"),
    validUntil: instant(input.validUntil, "VALID_UNTIL"),
    sourceReplayReceiptHash: hash(input.sourceReplayReceiptHash,
      "SOURCE_REPLAY_RECEIPT_HASH"),
  };
  if (Date.parse(common.observedAt) >= Date.parse(common.validUntil)) {
    fail("EVIDENCE_VALIDITY_WINDOW_INVALID");
  }
  return deepFreeze({ ...common, facts: normalizedFacts(input.facts, common) });
}

function verifyRecord(value) {
  exact(value, RECORD_FIELDS, "ROUTE_EVIDENCE");
  if (value.schema !== SCHEMA || value.schemaVersion !== "1.0.0") {
    fail("ROUTE_EVIDENCE_SCHEMA_INVALID");
  }
  const { schema, schemaVersion, evidenceHash, ...input } = value;
  const normalized = normalizeInput(input);
  const body = { schema, schemaVersion, ...normalized };
  if (hash(evidenceHash, "EVIDENCE_HASH") !== digest(schema, body)
    || canonicalizeStrict({ ...body, evidenceHash })
      !== canonicalizeStrict(value)) fail("ROUTE_EVIDENCE_REPLAY_INVALID");
  return deepFreeze({ ...body, evidenceHash });
}

/** Create one provider-free, content-addressed route evidence object. */
export function createBuyerNativeRouteEvidenceV1(input = {}) {
  const normalized = normalizeInput(input);
  const body = { schema: SCHEMA, schemaVersion: "1.0.0", ...normalized };
  return deepFreeze({ ...body, evidenceHash: digest(SCHEMA, body) });
}

/** Verify a serialized/replayed route evidence object without external I/O. */
export function verifyBuyerNativeRouteEvidenceV1(value = {}) {
  return verifyRecord(value);
}

/** Convert one verified generic object into the existing gate's event stream. */
export function mapBuyerNativeRouteEvidenceToRecoveryCandidateV1(value = {}) {
  const evidence = verifyRecord(value);
  let previousEventHash = OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1;
  const evidenceEvents = FACTS_FIELDS.map((factName, index) => {
    const fact = evidence.facts[factName];
    const { sourceOccurrenceRefHash, ...payload } = fact;
    const evidenceKind = KIND_BY_FACT[factName];
    const event = createRecoveryCandidateEvidenceEventV1({
      routeProposalRefHash: evidence.routeProposalRefHash,
      recoveryOptionRefHash: evidence.recoveryOptionRefHash,
      ordinal: index + 1,
      previousEventHash,
      observedAt: evidence.observedAt,
      validUntil: evidence.validUntil,
      evidenceKind,
      evidenceOccurrenceRefHash: digest(
        "outsider/buyer-native-route-evidence-fact-occurrence/v1", {
          routeEvidenceHash: evidence.evidenceHash,
          evidenceKind,
          ordinal: index + 1,
        }),
      sourceOccurrenceRefHash,
      sourceArtifactHash: evidence.routeProposalRefHash,
      sourceReplayReceiptHash: evidence.sourceReplayReceiptHash,
      payload,
    });
    previousEventHash = event.eventHash;
    return event;
  });
  return deepFreeze({
    routeProposalRefHash: evidence.routeProposalRefHash,
    occurrenceRefHash: evidence.occurrenceRefHash,
    recoveryOptionRefHash: evidence.recoveryOptionRefHash,
    evidenceEvents,
  });
}

/** Feed generic seller-adapter evidence into the existing hard gate. */
export function selectBuyerNativeRouteEvidenceRecoveryCandidatesV1(input = {}) {
  exact(input, SELECT_INPUT_FIELDS, "SELECTION_INPUT");
  const evidence = dense(input.routeEvidence, MAX_ROUTES, "ROUTE_EVIDENCE_SET");
  return selectRecoveryPortfolioCandidatesV1({
    outcomeLifecycleEvents: input.outcomeLifecycleEvents,
    routeProposalRegistryEvents: input.routeProposalRegistryEvents,
    recoveryPortfolio: input.recoveryPortfolio,
    evaluatedAt: input.evaluatedAt,
    frozenConstraints: input.frozenConstraints,
    candidates: evidence.map(mapBuyerNativeRouteEvidenceToRecoveryCandidateV1),
  });
}
