/*
 * Append-only, HOLD-only Episode-level Attempt occurrence composition.
 *
 * This is a structural projection over the existing Episode and Attempt
 * identities. It does not create an Episode, Attempt, census, obligation,
 * outcome, recovery, authority, or execution lifecycle. Distinct report
 * occurrences remain in their denominator even when their network object is
 * content-addressed elsewhere. A later reported success cannot remove an
 * earlier refusal, abort, timeout, missing row, consequence, retry, or
 * recovery within the caller-supplied immediate predecessor branch. It does
 * not exclude a parallel genesis or fork. Episode membership and the
 * genesis-obligation reference are only
 * caller-supplied crosswalks here; this projection replays neither source and
 * never implies whole-set obligation coverage.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const HashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(HashPrototype, "update").value);
const HashDigest = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(HashPrototype, "digest").value);
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;

export const EPISODE_ATTEMPT_SET_SCHEMAS = ObjectFreeze({
  composition: "outsider/episode-attempt-set-composition/v1",
  verification: "outsider/episode-attempt-set-composition-verification/v1",
});

export const EPISODE_ATTEMPT_OCCURRENCE_KINDS = ObjectFreeze([
  "PRIMARY",
  "RECOVERY",
  "RETRY",
]);

export const EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS = ObjectFreeze([
  "ABORTED",
  "FAILED",
  "REFUSED",
  "REJECTED",
  "SUCCEEDED",
  "TIMED_OUT",
  "UNKNOWN",
]);

export const EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES = ObjectFreeze([
  "CENSORED",
  "MISSING",
  "OBSERVED",
  "REFUSED",
  "UNAVAILABLE",
  "UNKNOWN",
]);

export const EPISODE_ATTEMPT_SET_BOUNDARY = deepFreeze({
  position:
    "EPISODE_ATTEMPT_OCCURRENCE_PROJECTION_NOT_EXECUTION_OR_VENDOR_SAFETY_CONTROL",
  existingEpisodeAliasOnly: true,
  createsEpisode: false,
  createsAttempt: false,
  createsCensus: false,
  createsObligation: false,
  createsOutcomeOrRecoveryTruth: false,
  projectionVerificationScope:
    "CANONICAL_STRUCTURE_SELF_HASH_CALLER_PIN_AND_SUPPLIED_IMMEDIATE_PREFIX_ONLY",
  episodeMembershipCallerSuppliedOnly: true,
  obligationBindingCallerSuppliedOnly: true,
  referencedSourceReplayPerformed: false,
  episodeMembershipSourceReplayVerified: false,
  obligationSourceReplayVerified: false,
  externalHeadPinVerified: false,
  fullAncestryReplayVerified: false,
  globalAttemptCensusCompletenessEstablished: false,
  globalReportOccurrenceCompletenessEstablished: false,
  omittedAttemptAbsenceEstablished: false,
  omittedReportOccurrenceAbsenceEstablished: false,
  parallelGenesisExclusionEstablished: false,
  forkExclusionEstablished: false,
  durableAppendOnlyHistoryEstablished: false,
  attemptDenominatorSeparateFromReportOccurrenceDenominator: true,
  reportOccurrenceDenominatorSeparateFromObjectDeduplication: true,
  duplicateNetworkObjectMayAppearInDistinctReportOccurrences: true,
  objectDeduplicationCanReduceAttemptDenominator: false,
  objectDeduplicationCanReduceReportOccurrenceDenominator: false,
  laterReportedSuccessCanEraseRowsWithinCallerSuppliedImmediatePrefix: false,
  laterReportedSuccessCanEraseConsequencesWithinCallerSuppliedImmediatePrefix: false,
  laterObservedOutcomeCanEraseMissingRowsWithinCallerSuppliedImmediatePrefix: false,
  executionDispositionAcceptedAsIndependentOutcomeTruth: false,
  outcomeObservationStatusAcceptedAsIndependentOutcomeTruth: false,
  vendorSuccessAcceptedAsOutcomeTruth: false,
  serverAcknowledgementAcceptedAsOutcomeTruth: false,
  entireAttemptSetObligationCoverageEstablished: false,
  retryPolicyEnforcedByThisProjection: false,
  recoveryPerformanceEstablished: false,
  rawSourceIncluded: false,
  secretsIncluded: false,
  piiIncluded: false,
  nativeSafetyUnconditionalVetoPreserved: true,
  outsiderCanOverrideNativeSafetyVeto: false,
  disposition: "QUARANTINED",
  status: "HOLD",
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  automaticTraining: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  custodyEstablished: false,
  moneyMovementEnabled: false,
  platformAdvanceEnabled: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsInsurance: false,
  permitsSettlement: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_OCCURRENCES = 4_096;
const MAX_CONSEQUENCE_REFS = 256;
const MAX_TREE_NODES = 100_000;
const MAX_TREE_KEYS = 250_000;

function fail(code) {
  throw new TypeErrorConstructor(`EPISODE_ATTEMPT_SET_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function rejectTree(value, seen = new SetConstructor(), depth = 0,
  budget = { nodes: 0, keys: 0 }) {
  if (value === null || typeof value !== "object") return;
  if (depth > 128) fail("VALUE_TOO_DEEP");
  budget.nodes += 1;
  if (budget.nodes > MAX_TREE_NODES) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > MAX_TREE_KEYS) fail("VALUE_TREE_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("ACCESSOR_FORBIDDEN");
    rejectTree(descriptor.value, seen, depth + 1, budget);
  }
  SetDelete(seen, value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) fail(`${code}_OBJECT_INVALID`);
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function denseArray(value, code, minimum, maximum) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length < minimum || value.length > maximum) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function timestamp(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)) {
    fail(`${code}_INVALID`);
  }
  const parsed = DateParse(value);
  if (!NumberIsSafeInteger(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) fail(`${code}_INVALID`);
  return value;
}

function contains(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function oneOf(value, allowed, code) {
  if (!contains(allowed, value)) fail(`${code}_INVALID`);
  return value;
}

function containsValue(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function normalizeHashList(value, code) {
  denseArray(value, code, 0, MAX_CONSEQUENCE_REFS);
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    append(result, hash(value[index], `${code}_HASH`));
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function normalizeEpisodeBinding(value) {
  exactObject(value, ["principalEpochProjectionHash",
    "accountableDeploymentSubjectHash", "runtimeInstanceHash",
    "embodimentRevisionHash", "delegationEdgeHash", "episodeHash",
    "workOrderProjectionHash", "networkCompleteEpisodeJoinHash",
    "prospectiveCensusProjectionHash", "realityObligationGenesisHash",
    "realityObligationStateHash", "genesisObligationAttemptHash"],
  "EPISODE_BINDING");
  const episodeHash = hash(value.episodeHash, "EPISODE_HASH");
  return {
    graphPath:
      "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
    principalEpochProjectionHash: hash(value.principalEpochProjectionHash,
      "PRINCIPAL_EPOCH_PROJECTION_HASH"),
    accountableDeploymentSubjectHash: hash(value.accountableDeploymentSubjectHash,
      "ACCOUNTABLE_DEPLOYMENT_SUBJECT_HASH"),
    runtimeInstanceHash: hash(value.runtimeInstanceHash, "RUNTIME_INSTANCE_HASH"),
    embodimentRevisionHash: nullableHash(value.embodimentRevisionHash,
      "EMBODIMENT_REVISION_HASH"),
    delegationEdgeHash: hash(value.delegationEdgeHash, "DELEGATION_EDGE_HASH"),
    episodeHash,
    orderIdentityHash: episodeHash,
    workOrderProjectionHash: hash(value.workOrderProjectionHash,
      "WORK_ORDER_PROJECTION_HASH"),
    networkCompleteEpisodeJoinHash: hash(value.networkCompleteEpisodeJoinHash,
      "NETWORK_COMPLETE_EPISODE_JOIN_HASH"),
    prospectiveCensusProjectionHash: hash(value.prospectiveCensusProjectionHash,
      "PROSPECTIVE_CENSUS_PROJECTION_HASH"),
    realityObligationGenesisHash: hash(value.realityObligationGenesisHash,
      "REALITY_OBLIGATION_GENESIS_HASH"),
    realityObligationStateHash: hash(value.realityObligationStateHash,
      "REALITY_OBLIGATION_STATE_HASH"),
    callerSuppliedGenesisObligationAttemptHash: hash(value.genesisObligationAttemptHash,
      "GENESIS_OBLIGATION_ATTEMPT_HASH"),
    sourceReferencesCallerSuppliedOnly: true,
    referencedSourcesReplayed: false,
    existingEpisodeAliasOnly: true,
    episodeMembershipCallerSuppliedOnly: true,
    episodeMembershipSourceReplayVerified: false,
    callerSuppliedGenesisObligationReferenceMatchesFirstAttempt: true,
    obligationSourceReplayVerified: false,
    entireAttemptSetObligationCoverageEstablished: false,
  };
}

function episodeBindingInput(value) {
  return {
    principalEpochProjectionHash: value.principalEpochProjectionHash,
    accountableDeploymentSubjectHash: value.accountableDeploymentSubjectHash,
    runtimeInstanceHash: value.runtimeInstanceHash,
    embodimentRevisionHash: value.embodimentRevisionHash,
    delegationEdgeHash: value.delegationEdgeHash,
    episodeHash: value.episodeHash,
    workOrderProjectionHash: value.workOrderProjectionHash,
    networkCompleteEpisodeJoinHash: value.networkCompleteEpisodeJoinHash,
    prospectiveCensusProjectionHash: value.prospectiveCensusProjectionHash,
    realityObligationGenesisHash: value.realityObligationGenesisHash,
    realityObligationStateHash: value.realityObligationStateHash,
    genesisObligationAttemptHash: value.callerSuppliedGenesisObligationAttemptHash,
  };
}

function normalizeLineage(value) {
  exactObject(value, ["revision", "predecessorCompositionHash",
    "supersedesCompositionHash"], "APPEND_ONLY_LINEAGE");
  if (!NumberIsSafeInteger(value.revision) || value.revision < 0) {
    fail("APPEND_ONLY_REVISION_INVALID");
  }
  const predecessorCompositionHash = nullableHash(value.predecessorCompositionHash,
    "PREDECESSOR_COMPOSITION_HASH");
  const supersedesCompositionHash = nullableHash(value.supersedesCompositionHash,
    "SUPERSEDES_COMPOSITION_HASH");
  if (value.revision === 0) {
    if (predecessorCompositionHash !== null || supersedesCompositionHash !== null) {
      fail("GENESIS_LINEAGE_MUST_NOT_REFERENCE_PREDECESSOR");
    }
  } else if (predecessorCompositionHash === null || supersedesCompositionHash === null
    || predecessorCompositionHash !== supersedesCompositionHash) {
    fail("DESCENDANT_REQUIRES_EXACT_PREDECESSOR_SUPERSESSION_LINK");
  }
  return {
    revision: value.revision,
    predecessorCompositionHash,
    supersedesCompositionHash,
    appendOnlyDeclaration: true,
    callerSuppliedImmediatePredecessorSelfHashAndPrefixMatched: value.revision > 0,
    predecessorSourceReplayVerified: false,
    externalHeadPinVerified: false,
    fullAncestryReplayVerified: false,
    durableAppendOnlyHistoryEstablished: false,
    inPlaceMutationAllowed: false,
  };
}

function lineageInput(value) {
  return {
    revision: value.revision,
    predecessorCompositionHash: value.predecessorCompositionHash,
    supersedesCompositionHash: value.supersedesCompositionHash,
  };
}

function normalizeAttempts(value, binding) {
  denseArray(value, "ATTEMPTS", 1, MAX_OCCURRENCES);
  const rows = [];
  const attemptHashes = [];
  let priorOccurredAt = null;
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["attemptOrdinal", "occurredAt", "episodeHash", "attemptHash",
      "attemptActorSubjectHash", "kind", "retryOfAttemptHash",
      "recoveryOfAttemptHash"], "ATTEMPT");
    if (!NumberIsSafeInteger(row.attemptOrdinal) || row.attemptOrdinal !== index + 1) {
      fail("ATTEMPT_ORDINAL_GAP_OR_REORDER");
    }
    const occurredAt = timestamp(row.occurredAt, "ATTEMPT_OCCURRED_AT");
    if (priorOccurredAt !== null && occurredAt < priorOccurredAt) {
      fail("ATTEMPT_TIME_ORDER_INVALID");
    }
    priorOccurredAt = occurredAt;
    const episodeHash = hash(row.episodeHash, "ATTEMPT_EPISODE_HASH");
    if (episodeHash !== binding.episodeHash) fail("ATTEMPT_EPISODE_CROSSWALK_MISMATCH");
    const attemptHash = hash(row.attemptHash, "ATTEMPT_HASH");
    if (containsValue(attemptHashes, attemptHash)) fail("ATTEMPT_HASH_DUPLICATE");
    const kind = oneOf(row.kind, EPISODE_ATTEMPT_OCCURRENCE_KINDS,
      "ATTEMPT_KIND");
    const retryOfAttemptHash = nullableHash(row.retryOfAttemptHash,
      "RETRY_OF_ATTEMPT_HASH");
    const recoveryOfAttemptHash = nullableHash(row.recoveryOfAttemptHash,
      "RECOVERY_OF_ATTEMPT_HASH");
    if (index === 0) {
      if (kind !== "PRIMARY" || retryOfAttemptHash !== null
        || recoveryOfAttemptHash !== null
        || attemptHash !== binding.callerSuppliedGenesisObligationAttemptHash) {
        fail("CALLER_SUPPLIED_GENESIS_ATTEMPT_CROSSWALK_INVALID");
      }
    } else if (kind === "PRIMARY") {
      fail("ONLY_GENESIS_ATTEMPT_MAY_BE_PRIMARY");
    } else if (kind === "RETRY") {
      if (retryOfAttemptHash === null || recoveryOfAttemptHash !== null
        || !containsValue(attemptHashes, retryOfAttemptHash)) {
        fail("RETRY_MUST_REFERENCE_PRIOR_ATTEMPT");
      }
    } else if (recoveryOfAttemptHash === null || retryOfAttemptHash !== null
      || !containsValue(attemptHashes, recoveryOfAttemptHash)) {
      fail("RECOVERY_MUST_REFERENCE_PRIOR_ATTEMPT");
    }
    append(rows, {
      attemptOrdinal: row.attemptOrdinal,
      occurredAt,
      episodeHash,
      attemptHash,
      attemptActorSubjectHash: hash(row.attemptActorSubjectHash,
        "ATTEMPT_ACTOR_SUBJECT_HASH"),
      kind,
      retryOfAttemptHash,
      recoveryOfAttemptHash,
      attemptIdentitySourceReplayVerified: false,
      episodeMembershipCallerSuppliedOnly: true,
      episodeMembershipSourceReplayVerified: false,
      countsInAttemptDenominator: true,
    });
    append(attemptHashes, attemptHash);
  }
  return rows;
}

function attemptInput(row) {
  return {
    attemptOrdinal: row.attemptOrdinal,
    occurredAt: row.occurredAt,
    episodeHash: row.episodeHash,
    attemptHash: row.attemptHash,
    attemptActorSubjectHash: row.attemptActorSubjectHash,
    kind: row.kind,
    retryOfAttemptHash: row.retryOfAttemptHash,
    recoveryOfAttemptHash: row.recoveryOfAttemptHash,
  };
}

function attemptInputs(rows) {
  const result = [];
  for (let index = 0; index < rows.length; index += 1) append(result, attemptInput(rows[index]));
  return result;
}

function attemptNamed(rows, attemptHash) {
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].attemptHash === attemptHash) return rows[index];
  }
  return null;
}

function normalizeReportOccurrences(value, binding, attempts) {
  denseArray(value, "REPORT_OCCURRENCES", 0, MAX_OCCURRENCES);
  const rows = [];
  const occurrenceHashes = [];
  const receiptHashes = [];
  let priorReportedAt = null;
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["reportOrdinal", "reportedAt", "episodeHash",
      "occurrenceIdentityHash", "attemptHash", "networkObjectIdentityHash",
      "networkReceiptHash", "executionDisposition", "outcomeObservationStatus",
      "reportedOutcomeEvidenceHash", "consequenceEvidenceHashes"],
    "REPORT_OCCURRENCE");
    if (!NumberIsSafeInteger(row.reportOrdinal) || row.reportOrdinal !== index + 1) {
      fail("REPORT_ORDINAL_GAP_OR_REORDER");
    }
    const reportedAt = timestamp(row.reportedAt, "REPORT_REPORTED_AT");
    if (priorReportedAt !== null && reportedAt < priorReportedAt) {
      fail("REPORT_TIME_ORDER_INVALID");
    }
    priorReportedAt = reportedAt;
    const episodeHash = hash(row.episodeHash, "REPORT_EPISODE_HASH");
    if (episodeHash !== binding.episodeHash) fail("REPORT_EPISODE_CROSSWALK_MISMATCH");
    const attemptHash = hash(row.attemptHash, "REPORT_ATTEMPT_HASH");
    const attempt = attemptNamed(attempts, attemptHash);
    if (attempt === null) fail("REPORT_NAMES_UNKNOWN_ATTEMPT");
    if (reportedAt < attempt.occurredAt) fail("REPORT_PRECEDES_ATTEMPT");
    const occurrenceIdentityHash = hash(row.occurrenceIdentityHash,
      "REPORT_OCCURRENCE_IDENTITY_HASH");
    const networkReceiptHash = hash(row.networkReceiptHash, "NETWORK_RECEIPT_HASH");
    if (containsValue(occurrenceHashes, occurrenceIdentityHash)) {
      fail("REPORT_OCCURRENCE_IDENTITY_DUPLICATE");
    }
    if (containsValue(receiptHashes, networkReceiptHash)) fail("NETWORK_RECEIPT_DUPLICATE");
    const executionDisposition = oneOf(row.executionDisposition,
      EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS, "EXECUTION_DISPOSITION");
    const outcomeObservationStatus = oneOf(row.outcomeObservationStatus,
      EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES, "OUTCOME_OBSERVATION_STATUS");
    const reportedOutcomeEvidenceHash = nullableHash(row.reportedOutcomeEvidenceHash,
      "REPORTED_OUTCOME_EVIDENCE_HASH");
    if ((outcomeObservationStatus === "OBSERVED")
      !== (reportedOutcomeEvidenceHash !== null)) {
      fail("OBSERVED_STATUS_AND_OUTCOME_EVIDENCE_PRESENCE_MISMATCH");
    }
    const consequenceEvidenceHashes = normalizeHashList(row.consequenceEvidenceHashes,
      "CONSEQUENCE_EVIDENCE_HASHES");
    append(rows, {
      reportOrdinal: row.reportOrdinal,
      reportedAt,
      episodeHash,
      occurrenceIdentityHash,
      attemptHash,
      networkObjectIdentityHash: hash(row.networkObjectIdentityHash,
        "NETWORK_OBJECT_IDENTITY_HASH"),
      networkReceiptHash,
      occurrenceIdentitySourceReplayVerified: false,
      networkObjectIdentitySourceReplayVerified: false,
      networkReceiptSourceReplayVerified: false,
      executionDisposition,
      outcomeObservationStatus,
      reportedOutcomeEvidenceHash,
      reportedOutcomeEvidencePresent: reportedOutcomeEvidenceHash !== null,
      consequenceEvidenceHashes,
      reportedConsequenceEvidencePresent: consequenceEvidenceHashes.length > 0,
      episodeAndAttemptMembershipCallerSuppliedOnly: true,
      membershipSourceReplayVerified: false,
      countsInReportOccurrenceDenominator: true,
      executionDispositionIsCallerReportedOnly: true,
      outcomeObservationStatusIsCallerReportedOnly: true,
      reportedOutcomeAcceptedAsIndependentTruth: false,
      consequenceEvidenceAcceptedAsAdjudicatedConsequence: false,
    });
    append(occurrenceHashes, occurrenceIdentityHash);
    append(receiptHashes, networkReceiptHash);
  }
  return rows;
}

function reportInput(row) {
  return {
    reportOrdinal: row.reportOrdinal,
    reportedAt: row.reportedAt,
    episodeHash: row.episodeHash,
    occurrenceIdentityHash: row.occurrenceIdentityHash,
    attemptHash: row.attemptHash,
    networkObjectIdentityHash: row.networkObjectIdentityHash,
    networkReceiptHash: row.networkReceiptHash,
    executionDisposition: row.executionDisposition,
    outcomeObservationStatus: row.outcomeObservationStatus,
    reportedOutcomeEvidenceHash: row.reportedOutcomeEvidenceHash,
    consequenceEvidenceHashes: row.consequenceEvidenceHashes,
  };
}

function reportInputs(rows) {
  const result = [];
  for (let index = 0; index < rows.length; index += 1) append(result, reportInput(rows[index]));
  return result;
}

function emptyCounts(keys) {
  const result = {};
  for (let index = 0; index < keys.length; index += 1) result[keys[index]] = 0;
  return result;
}

function attemptCensus(rows) {
  const countsByKind = emptyCounts(EPISODE_ATTEMPT_OCCURRENCE_KINDS);
  for (let index = 0; index < rows.length; index += 1) {
    countsByKind[rows[index].kind] += 1;
  }
  return {
    ledgerKind: "ATTEMPT",
    unit: "ATTEMPT",
    attemptCount: rows.length,
    countsByKind,
    everySuppliedAttemptRetained: true,
    attemptCountDerivedFromReportOccurrenceCount: false,
    attemptCountDerivedFromDistinctObjectCount: false,
    globalAttemptCensusCompletenessEstablished: false,
  };
}

function reportOccurrenceCensus(rows) {
  const countsByExecutionDisposition
    = emptyCounts(EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS);
  const countsByOutcomeObservationStatus
    = emptyCounts(EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES);
  let reportedOutcomeEvidencePresentCount = 0;
  let reportedConsequenceOccurrenceCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    countsByExecutionDisposition[row.executionDisposition] += 1;
    countsByOutcomeObservationStatus[row.outcomeObservationStatus] += 1;
    if (row.reportedOutcomeEvidencePresent) reportedOutcomeEvidencePresentCount += 1;
    if (row.reportedConsequenceEvidencePresent) reportedConsequenceOccurrenceCount += 1;
  }
  return {
    ledgerKind: "NETWORK_REPORT_OCCURRENCE",
    unit: "NETWORK_REPORT_OCCURRENCE",
    reportOccurrenceCount: rows.length,
    countsByExecutionDisposition,
    countsByOutcomeObservationStatus,
    reportedOutcomeEvidencePresentCount,
    reportedConsequenceOccurrenceCount,
    everySuppliedReportOccurrenceRetained: true,
    reportOccurrenceCountDerivedFromAttemptCount: false,
    reportOccurrenceCountDerivedFromDistinctObjectCount: false,
    withinSuppliedRecordLaterSuccessCanReduceReportOccurrenceCount: false,
    withinSuppliedRecordLaterObservedOutcomeCanReducePriorMissingCount: false,
    withinSuppliedRecordLaterSuccessCanReducePriorConsequenceCount: false,
    globalReportOccurrenceCompletenessEstablished: false,
  };
}

function objectHashEqualityView(rows) {
  const objectHashes = [];
  let duplicateSuppliedNetworkObjectHashReportOccurrenceCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const candidate = rows[index].networkObjectIdentityHash;
    if (containsValue(objectHashes, candidate)) {
      duplicateSuppliedNetworkObjectHashReportOccurrenceCount += 1;
    }
    else append(objectHashes, candidate);
  }
  ArraySort(objectHashes);
  return {
    ledgerKind: "SUPPLIED_NETWORK_OBJECT_IDENTITY_HASH_EQUALITY_VIEW",
    distinctSuppliedNetworkObjectIdentityHashCount: objectHashes.length,
    suppliedNetworkObjectIdentityHashes: objectHashes,
    duplicateSuppliedNetworkObjectHashReportOccurrenceCount,
    networkObjectIdentitySourceReplayVerified: false,
    contentAddressedObjectIdentityEstablished: false,
    suppliedHashEqualityAppliesToObjectReferenceViewOnly: true,
    contentAddressedDeduplicationAppliesToAttempts: false,
    contentAddressedDeduplicationAppliesToReportOccurrences: false,
    attemptCountDerivedFromObjectCount: false,
    reportOccurrenceCountDerivedFromObjectCount: false,
  };
}

function validateSuppliedPredecessor(predecessor) {
  rejectTree(predecessor);
  canonicalizeStrict(predecessor);
  exactObject(predecessor, ["schema", "schemaVersion", "compositionClass",
    "recordedAt", "episodeBinding", "appendOnlyLineage", "attempts",
    "reportOccurrences", "attemptCensus", "reportOccurrenceCensus",
    "objectDedupView", "retentionBoundary", "status", "decisionState",
    "authority", "actionReady", "executable", "result", "boundary",
    "compositionHash"], "PREDECESSOR_COMPOSITION");
  if (predecessor.schema !== EPISODE_ATTEMPT_SET_SCHEMAS.composition
    || predecessor.schemaVersion !== "1.0.0"
    || predecessor.compositionClass
      !== "APPEND_ONLY_EPISODE_ATTEMPT_OCCURRENCE_COMPOSITION_HOLD_ONLY"
    || predecessor.status !== "HOLD" || predecessor.decisionState !== "HOLD"
    || predecessor.authority !== "NONE" || predecessor.actionReady !== false
    || predecessor.executable !== false
    || predecessor.result !== "EPISODE_ATTEMPT_SET_STRUCTURALLY_COMPOSED_HOLD"
    || !same(predecessor.boundary, EPISODE_ATTEMPT_SET_BOUNDARY)) {
    fail("PREDECESSOR_STATE_INVALID");
  }
  const rebuilt = compositionBody(compositionInput(predecessor), {
    predecessor: null,
    enforceSuppliedPrefix: false,
  });
  const expectedHash = digest(EPISODE_ATTEMPT_SET_SCHEMAS.composition, rebuilt);
  if (predecessor.compositionHash !== expectedHash
    || !same(predecessor, { ...rebuilt, compositionHash: expectedHash })) {
    fail("PREDECESSOR_DERIVATION_OR_SELF_HASH_INVALID");
  }
  return predecessor;
}

function enforceAppendOnlyPrefix(lineage, binding, attempts, reports, recordedAt,
  predecessor) {
  if (lineage.revision === 0) {
    if (predecessor !== null) fail("GENESIS_MUST_NOT_RECEIVE_PREDECESSOR");
    return;
  }
  if (predecessor === null) fail("DESCENDANT_PREDECESSOR_REQUIRED");
  const checked = validateSuppliedPredecessor(predecessor);
  if (lineage.revision !== checked.appendOnlyLineage.revision + 1
    || lineage.predecessorCompositionHash !== checked.compositionHash
    || lineage.supersedesCompositionHash !== checked.compositionHash) {
    fail("DESCENDANT_PREDECESSOR_REVISION_OR_HASH_MISMATCH");
  }
  if (!same(binding, checked.episodeBinding)) fail("DESCENDANT_EPISODE_BINDING_CHANGED");
  if (recordedAt < checked.recordedAt) fail("DESCENDANT_RECORDED_AT_REGRESSION");
  if (attempts.length < checked.attempts.length
    || reports.length < checked.reportOccurrences.length
    || attempts.length === checked.attempts.length
      && reports.length === checked.reportOccurrences.length) {
    fail("DESCENDANT_MUST_APPEND_ATTEMPT_OR_REPORT_OCCURRENCE");
  }
  for (let index = 0; index < checked.attempts.length; index += 1) {
    if (!same(attempts[index], checked.attempts[index])) {
      fail("DESCENDANT_ATTEMPT_PREFIX_CHANGED_OR_DROPPED");
    }
  }
  for (let index = 0; index < checked.reportOccurrences.length; index += 1) {
    if (!same(reports[index], checked.reportOccurrences[index])) {
      fail("DESCENDANT_REPORT_PREFIX_CHANGED_OR_DROPPED");
    }
  }
}

function compositionBody(input, {
  predecessor = null,
  enforceSuppliedPrefix = true,
} = {}) {
  exactObject(input, ["recordedAt", "episodeBinding", "appendOnlyLineage",
    "attempts", "reportOccurrences"], "CREATE_INPUT");
  const recordedAt = timestamp(input.recordedAt, "RECORDED_AT");
  const binding = normalizeEpisodeBinding(input.episodeBinding);
  const lineage = normalizeLineage(input.appendOnlyLineage);
  const attempts = normalizeAttempts(input.attempts, binding);
  const reports = normalizeReportOccurrences(input.reportOccurrences, binding, attempts);
  if (recordedAt < attempts[attempts.length - 1].occurredAt
    || reports.length > 0 && recordedAt < reports[reports.length - 1].reportedAt) {
    fail("RECORDED_AT_PRECEDES_LATEST_SUPPLIED_ROW");
  }
  if (enforceSuppliedPrefix) {
    enforceAppendOnlyPrefix(lineage, binding, attempts, reports, recordedAt,
      predecessor);
  }
  return {
    schema: EPISODE_ATTEMPT_SET_SCHEMAS.composition,
    schemaVersion: "1.0.0",
    compositionClass:
      "APPEND_ONLY_EPISODE_ATTEMPT_OCCURRENCE_COMPOSITION_HOLD_ONLY",
    recordedAt,
    episodeBinding: binding,
    appendOnlyLineage: lineage,
    attempts,
    reportOccurrences: reports,
    attemptCensus: attemptCensus(attempts),
    reportOccurrenceCensus: reportOccurrenceCensus(reports),
    objectDedupView: objectHashEqualityView(reports),
    retentionBoundary: {
      everySuppliedAttemptRetained: true,
      everySuppliedReportOccurrenceRetained: true,
      withinCallerSuppliedImmediatePrefixLaterSuccessDoesNotEraseOccurrences: true,
      withinCallerSuppliedImmediatePrefixLaterSuccessDoesNotEraseConsequences: true,
      withinCallerSuppliedImmediatePrefixNamedStatesRetained: true,
      parallelGenesisExclusionEstablished: false,
      forkExclusionEstablished: false,
      durableAppendOnlyHistoryEstablished: false,
      objectDedupDoesNotChangeAttemptDenominator: true,
      objectDedupDoesNotChangeReportOccurrenceDenominator: true,
      globalAttemptCompletenessEstablished: false,
      globalReportOccurrenceCompletenessEstablished: false,
      callerSuppliedObligationReferenceMatchesOnlyGenesisAttempt: true,
      onlyGenesisAttemptCrosswalkStructurallyChecked: true,
      entireAttemptSetObligationCoverageEstablished: false,
      obligationSourceReplayVerified: false,
    },
    status: "HOLD",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    result: "EPISODE_ATTEMPT_SET_STRUCTURALLY_COMPOSED_HOLD",
    boundary: EPISODE_ATTEMPT_SET_BOUNDARY,
  };
}

function compositionInput(record) {
  return {
    recordedAt: record.recordedAt,
    episodeBinding: episodeBindingInput(record.episodeBinding),
    appendOnlyLineage: lineageInput(record.appendOnlyLineage),
    attempts: attemptInputs(record.attempts),
    reportOccurrences: reportInputs(record.reportOccurrences),
  };
}

export function createEpisodeAttemptSetComposition(input = {}, options = {
  predecessor: null,
}) {
  rejectTree(input);
  rejectTree(options);
  exactObject(options, ["predecessor"], "CREATE_OPTIONS");
  const predecessor = options.predecessor;
  rejectTree(predecessor);
  canonicalizeStrict(input);
  if (predecessor !== null) canonicalizeStrict(predecessor);
  const body = compositionBody(input, { predecessor, enforceSuppliedPrefix: true });
  return deepFreeze({ ...body, compositionHash: digest(
    EPISODE_ATTEMPT_SET_SCHEMAS.composition, body) });
}

function verificationFailure(error) {
  return deepFreeze({
    schema: EPISODE_ATTEMPT_SET_SCHEMAS.verification,
    ok: false,
    structuralCompositionVerified: false,
    exactSchemaVerified: false,
    selfHashVerified: false,
    expectedHashMatched: false,
    callerSuppliedImmediatePredecessorSelfHashAndPrefixMatched: false,
    callerSuppliedExpectedPredecessorHashMatched: false,
    durableAppendOnlyHistoryEstablished: false,
    referencedSourceReplayVerified: false,
    episodeMembershipSourceReplayVerified: false,
    obligationSourceReplayVerified: false,
    globalAttemptCensusCompletenessEstablished: false,
    globalReportOccurrenceCompletenessEstablished: false,
    independentOutcomeEstablished: false,
    entireAttemptSetObligationCoverageEstablished: false,
    status: "HOLD",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    moneyMovementEnabled: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsInsurance: false,
    permitsSettlement: false,
    error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    boundary: EPISODE_ATTEMPT_SET_BOUNDARY,
  });
}

export function verifyEpisodeAttemptSetComposition(record, options = {
  predecessor: null,
  expectedCompositionHash: null,
  expectedPredecessorCompositionHash: null,
}) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["predecessor", "expectedCompositionHash",
      "expectedPredecessorCompositionHash"], "VERIFY_OPTIONS");
    const predecessor = options.predecessor;
    const expectedCompositionHash = options.expectedCompositionHash;
    const expectedPredecessorCompositionHash = options.expectedPredecessorCompositionHash;
    rejectTree(predecessor);
    canonicalizeStrict(record);
    exactObject(record, ["schema", "schemaVersion", "compositionClass",
      "recordedAt", "episodeBinding", "appendOnlyLineage", "attempts",
      "reportOccurrences", "attemptCensus", "reportOccurrenceCensus",
      "objectDedupView", "retentionBoundary", "status", "decisionState",
      "authority", "actionReady", "executable", "result", "boundary",
      "compositionHash"], "COMPOSITION");
    if (record.schema !== EPISODE_ATTEMPT_SET_SCHEMAS.composition
      || record.schemaVersion !== "1.0.0"
      || record.compositionClass
        !== "APPEND_ONLY_EPISODE_ATTEMPT_OCCURRENCE_COMPOSITION_HOLD_ONLY"
      || record.status !== "HOLD" || record.decisionState !== "HOLD"
      || record.authority !== "NONE" || record.actionReady !== false
      || record.executable !== false
      || record.result !== "EPISODE_ATTEMPT_SET_STRUCTURALLY_COMPOSED_HOLD"
      || !same(record.boundary, EPISODE_ATTEMPT_SET_BOUNDARY)) {
      fail("COMPOSITION_STATE_INVALID");
    }
    const rebuilt = createEpisodeAttemptSetComposition(compositionInput(record), {
      predecessor,
    });
    if (!same(record, rebuilt)) fail("COMPOSITION_DERIVATION_OR_SELF_HASH_INVALID");
    const expected = hash(expectedCompositionHash, "EXPECTED_COMPOSITION_HASH");
    if (record.compositionHash !== expected) fail("EXPECTED_COMPOSITION_HASH_MISMATCH");
    const descendant = record.appendOnlyLineage.revision > 0;
    if (descendant) {
      const expectedPredecessor = hash(expectedPredecessorCompositionHash,
        "EXPECTED_PREDECESSOR_COMPOSITION_HASH");
      if (predecessor === null || predecessor.compositionHash !== expectedPredecessor
        || record.appendOnlyLineage.predecessorCompositionHash !== expectedPredecessor) {
        fail("CALLER_SUPPLIED_EXPECTED_PREDECESSOR_HASH_MISMATCH");
      }
    } else if (expectedPredecessorCompositionHash !== null || predecessor !== null) {
      fail("GENESIS_EXPECTED_PREDECESSOR_MUST_BE_NULL");
    }
    return deepFreeze({
      schema: EPISODE_ATTEMPT_SET_SCHEMAS.verification,
      ok: true,
      structuralCompositionVerified: true,
      exactSchemaVerified: true,
      selfHashVerified: true,
      expectedHashMatched: true,
      callerSuppliedImmediatePredecessorSelfHashAndPrefixMatched: descendant,
      callerSuppliedExpectedPredecessorHashMatched: descendant,
      durableAppendOnlyHistoryEstablished: false,
      referencedSourceReplayVerified: false,
      episodeMembershipSourceReplayVerified: false,
      obligationSourceReplayVerified: false,
      externalHeadPinVerified: false,
      fullAncestryReplayVerified: false,
      globalAttemptCensusCompletenessEstablished: false,
      globalReportOccurrenceCompletenessEstablished: false,
      omittedAttemptAbsenceEstablished: false,
      omittedReportOccurrenceAbsenceEstablished: false,
      independentOutcomeEstablished: false,
      entireAttemptSetObligationCoverageEstablished: false,
      attemptCount: rebuilt.attemptCensus.attemptCount,
      reportOccurrenceCount: rebuilt.reportOccurrenceCensus.reportOccurrenceCount,
      distinctSuppliedNetworkObjectIdentityHashCount:
        rebuilt.objectDedupView.distinctSuppliedNetworkObjectIdentityHashCount,
      compositionHash: rebuilt.compositionHash,
      status: "HOLD",
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      moneyMovementEnabled: false,
      permitsPricing: false,
      permitsGuarantee: false,
      permitsInsurance: false,
      permitsSettlement: false,
      boundary: EPISODE_ATTEMPT_SET_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
