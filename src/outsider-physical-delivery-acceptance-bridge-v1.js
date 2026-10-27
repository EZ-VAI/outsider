/*
 * Provider-neutral physical delivery acceptance bridge v1.
 *
 * This is a pure evidence composition seam.  It binds one carrier delivery
 * occurrence and one independent physical inspection to the same frozen
 * Outcome/Episode/Attempt, then reuses the existing signed independent-witness
 * lifecycle.  A carrier's DELIVERED status is occurrence evidence only.  It
 * never establishes acceptance, capacity, authority, or independent truth.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyIndependentOutcomeWitnessLifecycleV1 }
  from "./outsider-independent-outcome-witness-lifecycle-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const DELIVERY_STATUSES = new Set([
  "DELIVERED", "IN_TRANSIT", "FAILED", "UNKNOWN",
]);
const INSPECTION_SOURCE_CLASSES = new Set([
  "WITNESS_DIRECT_OBSERVATION", "INDEPENDENT_INSTRUMENT_OBSERVATION",
]);

export const OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_SCHEMAS
  = Object.freeze({
    carrierOccurrence: "outsider/physical-carrier-delivery-occurrence/v1",
    independentInspection: "outsider/physical-delivery-independent-inspection/v1",
    evaluation: "outsider/physical-delivery-acceptance-evaluation/v1",
  });

export const OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_BOUNDARY
  = Object.freeze({
    position: "PROVIDER_NEUTRAL_DELIVERY_AND_INSPECTION_EVIDENCE_HOLD_ONLY",
    sameFrozenOutcomeEpisodeAttemptRequired: true,
    carrierDeliveredStatusEstablishesAcceptance: false,
    providerOrExecutorMayServeAsIndependentWitness: false,
    providerSelfReportAcceptedAsOutcomeTruth: false,
    serverAcknowledgementAcceptedAsOutcomeTruth: false,
    witnessLifecycleReused: true,
    witnessReceiptAloneEstablishesIndependentControl: false,
    independentOutcomeTruthEstablished: false,
    registryCreated: false,
    externalIoPerformed: false,
    sellerSpecificLogicPresent: false,
    capacityReserved: false,
    paymentPerformed: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function object(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  return value;
}

function exactObject(value, fields, code) {
  object(value, code);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256Bytes(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function verifyTender(tender, expectedTenderHash) {
  const replay = verifyOutsiderOutcomeTenderV1(tender, {
    expectedTenderHash: hash(expectedTenderHash, "EXPECTED_TENDER_HASH"),
  });
  if (!replay.ok || replay.authority !== "NONE") fail("TENDER_REPLAY_FAILED");
  return tender;
}

function frozenBindings(tender, frozenProductStateHash) {
  return {
    tenderHash: tender.tenderHash,
    exactOutcomeHash: tender.exactOutcome.exactOutcomeHash,
    acceptanceCriteriaRefHash: tender.exactOutcome.acceptanceCriteriaRefHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    frozenProductStateHash: hash(frozenProductStateHash,
      "FROZEN_PRODUCT_STATE_HASH"),
  };
}

const CARRIER_INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "frozenProductStateHash",
  "deliveryExecutorProviderRefHash", "deliveryExecutorControllerRefHash",
  "sourceOccurrenceRefHash", "sourceArtifactHash", "sourceReplayReceiptHash",
  "deliveryStatus", "deliveredAt", "observedAt",
]);

export function createPhysicalCarrierDeliveryOccurrenceV1(input = {}) {
  exactObject(input, CARRIER_INPUT_FIELDS, "CARRIER_INPUT");
  const tender = verifyTender(input.tender, input.expectedTenderHash);
  if (!DELIVERY_STATUSES.has(input.deliveryStatus)) {
    fail("DELIVERY_STATUS_INVALID");
  }
  const deliveredAt = input.deliveredAt === null
    ? null : instant(input.deliveredAt, "DELIVERED_AT");
  if ((input.deliveryStatus === "DELIVERED") !== (deliveredAt !== null)) {
    fail("DELIVERY_STATUS_TIME_MISMATCH");
  }
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  if (deliveredAt !== null && Date.parse(deliveredAt) > Date.parse(observedAt)) {
    fail("DELIVERY_AFTER_OBSERVATION");
  }
  const body = {
    schema:
      OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_SCHEMAS.carrierOccurrence,
    schemaVersion: "1.0.0",
    ...frozenBindings(tender, input.frozenProductStateHash),
    deliveryExecutorProviderRefHash: hash(
      input.deliveryExecutorProviderRefHash, "DELIVERY_EXECUTOR_PROVIDER_REF_HASH"),
    deliveryExecutorControllerRefHash: hash(
      input.deliveryExecutorControllerRefHash,
      "DELIVERY_EXECUTOR_CONTROLLER_REF_HASH"),
    sourceOccurrenceRefHash: hash(input.sourceOccurrenceRefHash,
      "SOURCE_OCCURRENCE_REF_HASH"),
    sourceArtifactHash: hash(input.sourceArtifactHash, "SOURCE_ARTIFACT_HASH"),
    sourceReplayReceiptHash: hash(input.sourceReplayReceiptHash,
      "SOURCE_REPLAY_RECEIPT_HASH"),
    deliveryStatus: input.deliveryStatus,
    deliveredAt,
    observedAt,
    carrierDeliveredStatusEstablishesAcceptance: false,
    providerSelfReportAcceptedAsOutcomeTruth: false,
    authority: "NONE",
  };
  return deepFreeze({
    ...body,
    carrierOccurrenceHash: digest(body.schema, body),
  });
}

const INSPECTION_INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "frozenProductStateHash",
  "witnessProviderRefHash", "witnessControllerRefHash",
  "evidenceSourceClass", "inspectedAt", "checks",
]);
const CHECK_FIELDS = Object.freeze([
  "connectorA", "connectorB", "dataTransferSucceeded",
  "nominalFiveVoltObserved", "quantity", "condition",
]);
const OBSERVATION_FIELDS = Object.freeze(["observedValue", "evidenceRefHash"]);

function observation(value, code) {
  exactObject(value, OBSERVATION_FIELDS, code);
  hash(value.evidenceRefHash, `${code}_EVIDENCE_REF_HASH`);
  return {
    observedValue: value.observedValue,
    evidenceRefHash: value.evidenceRefHash,
  };
}

export function createPhysicalDeliveryIndependentInspectionV1(input = {}) {
  exactObject(input, INSPECTION_INPUT_FIELDS, "INSPECTION_INPUT");
  const tender = verifyTender(input.tender, input.expectedTenderHash);
  if (!INSPECTION_SOURCE_CLASSES.has(input.evidenceSourceClass)) {
    fail("INSPECTION_EVIDENCE_SOURCE_CLASS_INVALID");
  }
  exactObject(input.checks, CHECK_FIELDS, "CHECKS");
  const checks = Object.fromEntries(CHECK_FIELDS.map((field) =>
    [field, observation(input.checks[field], `CHECK_${field.toUpperCase()}`)]));
  if (typeof checks.connectorA.observedValue !== "string"
    || typeof checks.connectorB.observedValue !== "string"
    || typeof checks.condition.observedValue !== "string"
    || typeof checks.dataTransferSucceeded.observedValue !== "boolean"
    || typeof checks.nominalFiveVoltObserved.observedValue !== "boolean"
    || !Number.isSafeInteger(checks.quantity.observedValue)
    || checks.quantity.observedValue < 0) fail("CHECK_OBSERVED_VALUE_INVALID");
  const body = {
    schema:
      OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_SCHEMAS
        .independentInspection,
    schemaVersion: "1.0.0",
    ...frozenBindings(tender, input.frozenProductStateHash),
    witnessProviderRefHash: hash(input.witnessProviderRefHash,
      "WITNESS_PROVIDER_REF_HASH"),
    witnessControllerRefHash: hash(input.witnessControllerRefHash,
      "WITNESS_CONTROLLER_REF_HASH"),
    evidenceSourceClass: input.evidenceSourceClass,
    inspectedAt: instant(input.inspectedAt, "INSPECTED_AT"),
    checks,
    providerSelfReportAcceptedAsOutcomeTruth: false,
    authority: "NONE",
  };
  return deepFreeze({
    ...body,
    inspectionHash: digest(body.schema, body),
  });
}

function verifyFrozenProductState(record, expectedHash) {
  object(record, "FROZEN_PRODUCT_STATE");
  if (record.schema !== "outsider/first-physical-formation-product-state/v2"
    || record.schemaVersion !== "2.0.0") fail("PRODUCT_STATE_SCHEMA_INVALID");
  const productStateHash = hash(record.productStateHash, "PRODUCT_STATE_HASH");
  if (productStateHash !== hash(expectedHash, "EXPECTED_PRODUCT_STATE_HASH")) {
    fail("PRODUCT_STATE_HASH_MISMATCH");
  }
  const body = { ...record };
  delete body.productStateHash;
  if (digest(record.schema, body) !== productStateHash) {
    fail("PRODUCT_STATE_SEMANTIC_HASH_MISMATCH");
  }
  exactObject(record.product, ["exactItem", "outcomeKind"], "PRODUCT");
  if (record.product.outcomeKind !== "PHYSICAL_GOODS_DELIVERY") {
    fail("OUTCOME_KIND_INVALID");
  }
  exactObject(record.product.exactItem, [
    "condition", "connectorA", "connectorB", "dataRequired",
    "fiveVoltPowerRequired", "maximumLengthMm", "minimumLengthMm", "quantity",
  ], "EXACT_ITEM");
  const item = record.product.exactItem;
  if (typeof item.condition !== "string"
    || typeof item.connectorA !== "string"
    || typeof item.connectorB !== "string"
    || typeof item.dataRequired !== "boolean"
    || typeof item.fiveVoltPowerRequired !== "boolean"
    || !Number.isSafeInteger(item.minimumLengthMm)
    || !Number.isSafeInteger(item.maximumLengthMm)
    || item.minimumLengthMm < 0
    || item.maximumLengthMm < item.minimumLengthMm
    || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
    fail("EXACT_ITEM_VALUE_INVALID");
  }
  return item;
}

const CARRIER_RECORD_FIELDS = Object.freeze([
  "schema", "schemaVersion", "tenderHash", "exactOutcomeHash",
  "acceptanceCriteriaRefHash", "episodeHash", "attemptHash",
  "frozenProductStateHash", "deliveryExecutorProviderRefHash",
  "deliveryExecutorControllerRefHash", "sourceOccurrenceRefHash",
  "sourceArtifactHash", "sourceReplayReceiptHash", "deliveryStatus",
  "deliveredAt", "observedAt", "carrierDeliveredStatusEstablishesAcceptance",
  "providerSelfReportAcceptedAsOutcomeTruth", "authority",
  "carrierOccurrenceHash",
]);
const INSPECTION_RECORD_FIELDS = Object.freeze([
  "schema", "schemaVersion", "tenderHash", "exactOutcomeHash",
  "acceptanceCriteriaRefHash", "episodeHash", "attemptHash",
  "frozenProductStateHash", "witnessProviderRefHash",
  "witnessControllerRefHash", "evidenceSourceClass", "inspectedAt", "checks",
  "providerSelfReportAcceptedAsOutcomeTruth", "authority", "inspectionHash",
]);

function verifyRecord(record, fields, schema, hashField, expectedHash, code) {
  exactObject(record, fields, code);
  if (record.schema !== schema || record.schemaVersion !== "1.0.0"
    || record.providerSelfReportAcceptedAsOutcomeTruth !== false
    || record.authority !== "NONE") fail(`${code}_BOUNDARY_INVALID`);
  const body = { ...record };
  delete body[hashField];
  const calculated = digest(schema, body);
  if (record[hashField] !== calculated
    || calculated !== hash(expectedHash, `EXPECTED_${code}_HASH`)) {
    fail(`${code}_HASH_MISMATCH`);
  }
}

function verifyCarrierSemantics(carrier) {
  if (carrier.carrierDeliveredStatusEstablishesAcceptance !== false
    || !DELIVERY_STATUSES.has(carrier.deliveryStatus)) {
    fail("CARRIER_SEMANTICS_INVALID");
  }
  hash(carrier.deliveryExecutorProviderRefHash,
    "DELIVERY_EXECUTOR_PROVIDER_REF_HASH");
  hash(carrier.deliveryExecutorControllerRefHash,
    "DELIVERY_EXECUTOR_CONTROLLER_REF_HASH");
  hash(carrier.sourceOccurrenceRefHash, "SOURCE_OCCURRENCE_REF_HASH");
  hash(carrier.sourceArtifactHash, "SOURCE_ARTIFACT_HASH");
  hash(carrier.sourceReplayReceiptHash, "SOURCE_REPLAY_RECEIPT_HASH");
  const deliveredAt = carrier.deliveredAt === null
    ? null : instant(carrier.deliveredAt, "DELIVERED_AT");
  const observedAt = instant(carrier.observedAt, "OBSERVED_AT");
  if ((carrier.deliveryStatus === "DELIVERED") !== (deliveredAt !== null)
    || (deliveredAt !== null
      && Date.parse(deliveredAt) > Date.parse(observedAt))) {
    fail("CARRIER_DELIVERY_STATUS_TIME_MISMATCH");
  }
}

function verifyInspectionSemantics(inspection) {
  if (!INSPECTION_SOURCE_CLASSES.has(inspection.evidenceSourceClass)) {
    fail("INSPECTION_EVIDENCE_SOURCE_CLASS_INVALID");
  }
  hash(inspection.witnessProviderRefHash, "WITNESS_PROVIDER_REF_HASH");
  hash(inspection.witnessControllerRefHash, "WITNESS_CONTROLLER_REF_HASH");
  instant(inspection.inspectedAt, "INSPECTED_AT");
  exactObject(inspection.checks, CHECK_FIELDS, "CHECKS");
  for (const field of CHECK_FIELDS) {
    observation(inspection.checks[field], `CHECK_${field.toUpperCase()}`);
  }
  const values = Object.fromEntries(CHECK_FIELDS.map((field) =>
    [field, inspection.checks[field].observedValue]));
  if (typeof values.connectorA !== "string"
    || typeof values.connectorB !== "string"
    || typeof values.condition !== "string"
    || typeof values.dataTransferSucceeded !== "boolean"
    || typeof values.nominalFiveVoltObserved !== "boolean"
    || !Number.isSafeInteger(values.quantity) || values.quantity < 0) {
    fail("INSPECTION_CHECK_VALUE_INVALID");
  }
}

function signedResultPayload(sourceBytes) {
  if (!Buffer.isBuffer(sourceBytes)) fail("RESULT_SOURCE_BYTES_INVALID");
  let source;
  try { source = JSON.parse(sourceBytes.toString("utf8")); } catch {
    fail("RESULT_SOURCE_JSON_INVALID");
  }
  if (canonicalizeStrict(source) !== sourceBytes.toString("utf8")) {
    fail("RESULT_SOURCE_NOT_CANONICAL");
  }
  return object(source.payload, "RESULT_SOURCE_PAYLOAD");
}

const EVALUATION_INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "frozenProductState",
  "expectedProductStateHash", "carrierDeliveryOccurrence",
  "expectedCarrierOccurrenceHash", "independentInspection",
  "expectedInspectionHash", "witnessLifecycleSource",
  "expectedWitnessReplayHash", "evaluatedAt",
]);

function safeFailure(error) {
  const errorCode = error instanceof Error
    && /^OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_[A-Z0-9_]+$/u
      .test(error.message)
    ? error.message : `${PREFIX}UNTRUSTED_FAILURE`;
  return deepFreeze({
    schema: OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_SCHEMAS.evaluation,
    schemaVersion: "1.0.0",
    ok: false,
    errorCode,
    carrierDeliveredStatusObserved: false,
    carrierDeliveredStatusEstablishesAcceptance: false,
    independentInspectionPresent: false,
    sameFrozenOutcomeEpisodeAttemptBound: false,
    deliveryAcceptanceEvidenceComplete: false,
    deliveryAcceptanceEstablished: false,
    independentOutcomeTruthEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_BOUNDARY,
  });
}

export function evaluatePhysicalDeliveryAcceptanceV1(input = {}) {
  try {
    exactObject(input, EVALUATION_INPUT_FIELDS, "EVALUATION_INPUT");
    const evaluatedAt = instant(input.evaluatedAt, "EVALUATED_AT");
    const tender = verifyTender(input.tender, input.expectedTenderHash);
    const item = verifyFrozenProductState(input.frozenProductState,
      input.expectedProductStateHash);
    const carrier = input.carrierDeliveryOccurrence;
    verifyRecord(carrier, CARRIER_RECORD_FIELDS,
      OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_SCHEMAS.carrierOccurrence,
      "carrierOccurrenceHash", input.expectedCarrierOccurrenceHash, "CARRIER");
    verifyCarrierSemantics(carrier);
    const bindings = frozenBindings(tender, input.expectedProductStateHash);
    const bindingFields = Object.keys(bindings);
    if (bindingFields.some((field) => carrier[field] !== bindings[field])) {
      fail("CARRIER_FROZEN_BINDING_MISMATCH");
    }

    const gaps = [];
    const delivered = carrier.deliveryStatus === "DELIVERED";
    if (!delivered) gaps.push("CARRIER_DELIVERED_STATUS_NOT_OBSERVED");
    if (delivered && Date.parse(carrier.deliveredAt)
      > Date.parse(tender.exactOutcome.deadline)) {
      gaps.push("CARRIER_DELIVERY_AFTER_OUTCOME_DEADLINE");
    }
    if (Date.parse(carrier.observedAt) > Date.parse(evaluatedAt)) {
      fail("CARRIER_OBSERVED_AFTER_EVALUATION");
    }

    const inspectionPresent = input.independentInspection !== null;
    if (inspectionPresent !== (input.expectedInspectionHash !== null)
      || inspectionPresent !== (input.witnessLifecycleSource !== null)
      || inspectionPresent !== (input.expectedWitnessReplayHash !== null)) {
      fail("INSPECTION_WITNESS_PRESENCE_MISMATCH");
    }

    let inspection = null;
    let replay = null;
    let inspectionMatches = false;
    let structuralSeparation = false;
    let inspectionSignedByWitness = false;
    if (!inspectionPresent) {
      gaps.push("INDEPENDENT_INSPECTION_NOT_PRESENT");
      gaps.push("WITNESS_LIFECYCLE_NOT_PRESENT");
    } else {
      inspection = input.independentInspection;
      verifyRecord(inspection, INSPECTION_RECORD_FIELDS,
        OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_SCHEMAS
          .independentInspection,
        "inspectionHash", input.expectedInspectionHash, "INSPECTION");
      verifyInspectionSemantics(inspection);
      if (bindingFields.some((field) => inspection[field] !== bindings[field])) {
        fail("INSPECTION_FROZEN_BINDING_MISMATCH");
      }
      if (Date.parse(inspection.inspectedAt) > Date.parse(evaluatedAt)) {
        fail("INSPECTION_AFTER_EVALUATION");
      }
      if (delivered && Date.parse(inspection.inspectedAt)
        < Date.parse(carrier.deliveredAt)) {
        gaps.push("INSPECTION_BEFORE_DELIVERY");
      }
      const expected = {
        connectorA: item.connectorA,
        connectorB: item.connectorB,
        dataTransferSucceeded: item.dataRequired,
        nominalFiveVoltObserved: item.fiveVoltPowerRequired,
        quantity: item.quantity,
        condition: item.condition,
      };
      for (const field of CHECK_FIELDS) {
        if (inspection.checks[field].observedValue !== expected[field]) {
          gaps.push(`INSPECTION_${field.toUpperCase()}_NOT_SATISFIED`);
        }
      }
      inspectionMatches = CHECK_FIELDS.every((field) =>
        inspection.checks[field].observedValue === expected[field]);
      structuralSeparation = carrier.deliveryExecutorProviderRefHash
          !== inspection.witnessProviderRefHash
        && carrier.deliveryExecutorControllerRefHash
          !== inspection.witnessControllerRefHash;
      if (!structuralSeparation) {
        gaps.push("DELIVERY_EXECUTOR_IS_INDEPENDENT_WITNESS");
      }

      replay = verifyIndependentOutcomeWitnessLifecycleV1(
        input.witnessLifecycleSource);
      if (!replay.ok
        || replay.replayHash !== input.expectedWitnessReplayHash) {
        fail("WITNESS_LIFECYCLE_REPLAY_FAILED");
      }
      if (replay.tenderHash !== bindings.tenderHash
        || replay.exactOutcomeHash !== bindings.exactOutcomeHash
        || replay.acceptanceCriteriaRefHash
          !== bindings.acceptanceCriteriaRefHash
        || replay.primaryAttemptHash !== bindings.attemptHash
        || replay.witnessProviderRefHash !== inspection.witnessProviderRefHash
        || replay.witnessControllerRefHash
          !== inspection.witnessControllerRefHash) {
        fail("WITNESS_LIFECYCLE_BINDING_MISMATCH");
      }
      if (!replay.resultReceiptPresent) gaps.push("WITNESS_RESULT_NOT_PRESENT");
      if (!replay.reservationCurrent) gaps.push("WITNESS_RESERVATION_NOT_CURRENT");
      if (replay.witnessSourceDeclaredObservation !== "OBSERVED_SATISFIED") {
        gaps.push("WITNESS_DID_NOT_DECLARE_SATISFIED");
      }
      if (replay.acceptedEvidenceSourceClass
        !== inspection.evidenceSourceClass) {
        gaps.push("WITNESS_EVIDENCE_SOURCE_CLASS_MISMATCH");
      }
      if (replay.resultReceiptPresent) {
        const payload = signedResultPayload(
          input.witnessLifecycleSource.resultReceiptSourceBytes);
        inspectionSignedByWitness
          = Array.isArray(payload.observationEvidenceHashes)
          && payload.observationEvidenceHashes.includes(inspection.inspectionHash);
        if (!inspectionSignedByWitness) {
          gaps.push("INSPECTION_NOT_BOUND_IN_SIGNED_WITNESS_RESULT");
        }
      }
    }

    const evidenceComplete = delivered
      && Date.parse(carrier.deliveredAt) <= Date.parse(tender.exactOutcome.deadline)
      && inspectionPresent && inspectionMatches && structuralSeparation
      && inspectionSignedByWitness && replay.resultReceiptPresent
      && replay.reservationCurrent
      && replay.witnessSourceDeclaredObservation === "OBSERVED_SATISFIED"
      && replay.acceptedEvidenceSourceClass === inspection.evidenceSourceClass;
    if (replay && !replay.independentControlEstablished) {
      gaps.push("INDEPENDENT_CONTROL_NOT_ESTABLISHED");
    }
    if (replay && !replay.independentOutcomeTruthEstablished) {
      gaps.push("INDEPENDENT_OUTCOME_TRUTH_NOT_ESTABLISHED");
    }
    const body = {
      schema: OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_SCHEMAS.evaluation,
      schemaVersion: "1.0.0",
      ok: true,
      ...bindings,
      carrierOccurrenceHash: carrier.carrierOccurrenceHash,
      inspectionHash: inspection?.inspectionHash ?? null,
      witnessReplayHash: replay?.replayHash ?? null,
      evaluatedAt,
      carrierDeliveredStatusObserved: delivered,
      carrierDeliveredStatusEstablishesAcceptance: false,
      independentInspectionPresent: inspectionPresent,
      independentWitnessStructurallyDistinctFromExecutor: structuralSeparation,
      allFrozenProductInspectionChecksObservedSatisfied: inspectionMatches,
      inspectionBoundIntoSignedWitnessResult: inspectionSignedByWitness,
      sameFrozenOutcomeEpisodeAttemptBound: true,
      deliveryAcceptanceEvidenceComplete: evidenceComplete,
      deliveryAcceptanceEstablished: evidenceComplete
        && replay.independentControlEstablished
        && replay.independentOutcomeTruthEstablished,
      independentOutcomeTruthEstablished:
        replay?.independentOutcomeTruthEstablished ?? false,
      gapCodes: [...new Set(gaps)].sort(),
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      boundary: OUTSIDER_PHYSICAL_DELIVERY_ACCEPTANCE_BRIDGE_V1_BOUNDARY,
    };
    return deepFreeze({
      ...body,
      evaluationHash: digest(body.schema, body),
    });
  } catch (error) {
    return safeFailure(error);
  }
}
