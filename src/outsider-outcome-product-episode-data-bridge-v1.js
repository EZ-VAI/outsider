/*
 * Product/execution -> existing Outsider episode-data bridge v1.
 *
 * This is not a second episode ontology. It binds Outcome Product Runtime v2
 * formation events and exact buyer-native source occurrences to one already-
 * existing Autonomous Work Order typed graph, then delegates Attempt/report
 * occurrence accounting to outsider-episode-attempt-set-composition.
 *
 * Exact source bytes are retained only in a caller-selected private directory.
 * The public projection contains hashes and counts; cart, quote, provider ACK,
 * model output and product state never become independent outcome truth.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, readdirSync, statSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAutonomousWorkOrderProjection,
} from "./outsider-autonomous-work-order.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS,
} from "./outsider-buyer-native-transaction-capability-v1.js";
import {
  createEpisodeAttemptSetComposition,
  verifyEpisodeAttemptSetComposition,
} from "./outsider-episode-attempt-set-composition.js";
import { EPISODE_DATA_ENGINE_SCHEMA }
  from "./outsider-episode-data-engine.js";
import { EPISODE_DATA_SOURCE_LEDGER_SCHEMA }
  from "./outsider-episode-data-source-ledger.js";
import { OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS }
  from "./outsider-outcome-product-runtime-v2.js";

const PREFIX = "OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const RAW_HANDLE = /^raw_[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_OCCURRENCES = 4_096;

export const OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_SCHEMAS
  = Object.freeze({
    privateSourceOccurrence:
      "outsider/outcome-product-episode-data-private-source-occurrence/v1",
    projection: "outsider/outcome-product-episode-data-bridge-projection/v1",
    feeder: "outsider/outcome-product-episode-data-engine-feeder/v1",
    verification:
      "outsider/outcome-product-episode-data-bridge-verification/v1",
  });

export const OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_BOUNDARY
  = Object.freeze({
    position: "PRODUCT_EXECUTION_TO_EXISTING_OUTSIDER_TYPED_EPISODE_DATA_PATH",
    createsParallelIdentityDelegationEpisodeAttemptOntology: false,
    existingAutonomousWorkOrderTypedGraphRequired: true,
    graphPath:
      "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
    existingEpisodeAttemptSetCompositionReused: true,
    allCapturedReceiptsMapToExistingWorkOrderAttempt: true,
    recoveryAttemptIdentityCreatedByBridge: false,
    episodeDataEngineSchemaReused: true,
    episodeDataSourceLedgerSchemaReused: true,
    sourceReplayRequired: true,
    exactSourceBytesProjected: false,
    privateRawHandlesProjected: false,
    occurrenceCensusSeparatedFromObjectDedup: true,
    distinctOccurrencesWithEqualSourceBytesRetained: true,
    objectDedupCanReduceOccurrenceDenominator: false,
    productFormationStateIsOutcomeTruth: false,
    cartIsCapacity: false,
    quoteIsCapacity: false,
    providerAcknowledgementIsOwnerAuthority: false,
    providerAcknowledgementIsIndependentOutcomeTruth: false,
    vendorFulfilledStateIsIndependentOutcomeTruth: false,
    modelOutputIsAuthority: false,
    modelRewardIsOutcomeTruth: false,
    automaticTraining: false,
    trainingRows: 0,
    productionModelPromotion: false,
    modelDecision: "KEEP_BASELINE",
    authority: "NONE",
    actionReady: false,
    executable: false,
    causalExperienceUnits: 0,
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = statSync(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) fail("DIRECTORY_NOT_PRIVATE");
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(file, bytes) {
  if (existsSync(file)) {
    const existing = readFileSync(file);
    if (!existing.equals(bytes)) fail("APPEND_ONLY_FILE_CONTENT_MISMATCH");
    return false;
  }
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  fsyncDirectory(path.dirname(file));
  return true;
}

function jsonBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function readCanonicalRecord(file, code) {
  const info = statSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(file);
  if (bytes.length < 3 || bytes.at(-1) !== 0x0a) fail(`${code}_PARTIAL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (!jsonBytes(value).equals(bytes)) fail(`${code}_NOT_CANONICAL`);
  return value;
}

function rawHandle(sourceBytesHash) {
  return `raw_${hash(sourceBytesHash, "SOURCE_BYTES_HASH").slice(7)}`;
}

function objectIdentity(sourceBytesHash, sourceBytesLength) {
  return digest("outsider/outcome-product-episode-data-source-object/v1", {
    sourceBytesHash, sourceBytesLength,
  });
}

const TRANSACTION_FIELDS = Object.freeze([
  "schema", "schemaVersion", "transactionRefHash", "outcomeIntentRefHash",
  "routeRole", "operation", "operationState", "runtimeState",
  "effectIdHash", "idempotencyKeyHash", "sourceOccurrenceHash",
  "sourceBytesHash", "sourceState", "sourceRecordClass", "sourceExpiresAt",
  "replayed", "retryPermitted", "sourceOccurrenceOnly",
  "sourceDeclarationOnly", "publishedInventoryEstablishesCapacity",
  "checkoutReceiptEstablishesCapacity", "resourceOwnerAuthorityEstablished",
  "capacityReserved", "independentOutcomeEstablished", "paymentPerformed",
  "userResultCommitted", "authority", "decisionState",
]);

function normalizeTransactionResult(result, promisedOutcomeRefHash) {
  exact(result, ["publicProjection"], "TRANSACTION_RESULT");
  const value = exact(result.publicProjection, TRANSACTION_FIELDS,
    "TRANSACTION_PROJECTION");
  if (value.schema
      !== OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.result
    || value.schemaVersion !== "1.0.0"
    || value.outcomeIntentRefHash !== promisedOutcomeRefHash
    || value.operationState !== "SOURCE_OCCURRENCE_OBSERVED"
    || value.sourceOccurrenceOnly !== true
    || value.sourceDeclarationOnly !== true
    || value.retryPermitted !== false
    || value.publishedInventoryEstablishesCapacity !== false
    || value.checkoutReceiptEstablishesCapacity !== false
    || value.resourceOwnerAuthorityEstablished !== false
    || value.independentOutcomeEstablished !== false
    || value.paymentPerformed !== false || value.userResultCommitted !== false
    || value.authority !== "NONE" || value.decisionState !== "HOLD") {
    fail("TRANSACTION_PROJECTION_BOUNDARY_INVALID");
  }
  ["transactionRefHash", "outcomeIntentRefHash", "effectIdHash",
    "idempotencyKeyHash", "sourceOccurrenceHash", "sourceBytesHash"]
    .forEach((field) => hash(value[field], field.toUpperCase()));
  if (typeof value.capacityReserved !== "boolean"
    || typeof value.replayed !== "boolean") fail("TRANSACTION_BOOLEAN_INVALID");
  return {
    transactionRefHash: value.transactionRefHash,
    outcomeIntentRefHash: value.outcomeIntentRefHash,
    routeRole: value.routeRole,
    operation: value.operation,
    runtimeState: value.runtimeState,
    effectIdHash: value.effectIdHash,
    idempotencyKeyHash: value.idempotencyKeyHash,
    sourceOccurrenceHash: value.sourceOccurrenceHash,
    sourceBytesHash: value.sourceBytesHash,
    sourceState: value.sourceState,
    sourceRecordClass: value.sourceRecordClass,
    sourceExpiresAt: value.sourceExpiresAt,
    operationalCapacityReceipt: value.capacityReserved,
    independentOutcomeEstablished: false,
  };
}

function normalizeFormationEvent(value, expectedProgramHash) {
  exact(value, ["schema", "schemaVersion", "eventType", "requestRefHash",
    "programHash", "formationSnapshotHash", "recordedAt", "formation",
    "providerSourceBytesIncluded", "outcomePromiseIssued", "eventIdHash"],
  "FORMATION_EVENT");
  if (value.schema
      !== OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formationEvent
    || value.schemaVersion !== "2.0.0"
    || value.eventType !== "FORMATION_SNAPSHOT_RECORDED"
    || value.programHash !== expectedProgramHash
    || value.providerSourceBytesIncluded !== false
    || value.outcomePromiseIssued !== false) fail("FORMATION_EVENT_BOUNDARY_INVALID");
  ["requestRefHash", "programHash", "formationSnapshotHash", "eventIdHash"]
    .forEach((field) => hash(value[field], field.toUpperCase()));
  instant(value.recordedAt, "FORMATION_RECORDED_AT");
  exact(value.formation, ["schema", "schemaVersion", "requestId", "programHash",
    "ordinal", "observedAt", "state", "dispositionReason", "preparation",
    "exactCommitmentProposal", "humanQueueCreated", "outcomePromiseIssued"],
  "FORMATION_SNAPSHOT");
  if (value.formation.schema
      !== OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formation
    || value.formation.schemaVersion !== "2.0.0"
    || value.formation.programHash !== expectedProgramHash
    || value.formation.observedAt !== value.recordedAt
    || value.formation.humanQueueCreated !== false
    || value.formation.outcomePromiseIssued !== false
    || !Number.isSafeInteger(value.formation.ordinal)
    || value.formation.ordinal < 1
    || value.formationSnapshotHash !== digest(
      OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formation,
      value.formation)) fail("FORMATION_SNAPSHOT_INVALID");
  const { eventIdHash, ...body } = value;
  if (eventIdHash !== digest(value.schema, body)) fail("FORMATION_EVENT_HASH_INVALID");
  return {
    requestRefHash: value.requestRefHash,
    programHash: value.programHash,
    formationSnapshotHash: value.formationSnapshotHash,
    formationState: value.formation.state,
    formationOrdinal: value.formation.ordinal,
    eventIdHash,
    independentOutcomeEstablished: false,
  };
}

function occurrenceFile(directory, sequence) {
  return path.join(directory, "occurrences",
    `${String(sequence).padStart(8, "0")}.json`);
}

function projectionFile(directory, revision) {
  return path.join(directory, "projections",
    `${String(revision).padStart(8, "0")}.json`);
}

function executionDisposition(record) {
  if (record.sourceKind === "PRODUCT_FORMATION") return "UNKNOWN";
  if (record.transaction.sourceState === "REJECTED") return "REJECTED";
  if (record.transaction.sourceState === "FAILED") return "FAILED";
  if (record.transaction.sourceState === "CANCELLED"
    || record.transaction.operation === "CANCEL") return "ABORTED";
  /* FULFILLED and COMMIT_ACKNOWLEDGED remain vendor declarations. */
  return "UNKNOWN";
}

function episodeBinding(workOrder, prospectiveCensusProjectionHash) {
  const graph = workOrder.typedGraph;
  return {
    principalEpochProjectionHash:
      graph.principalEpoch.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      graph.accountableDeployment.accountableDeploymentSubjectHash,
    runtimeInstanceHash: graph.runtime.runtimeInstanceHash,
    embodimentRevisionHash: graph.embodiment.embodimentRevisionHash,
    delegationEdgeHash: graph.delegation.delegationEdgeHash,
    episodeHash: graph.episode.episodeHash,
    workOrderProjectionHash: workOrder.workOrderHash,
    networkCompleteEpisodeJoinHash:
      graph.episode.networkCompleteEpisodeJoinHash,
    prospectiveCensusProjectionHash,
    realityObligationGenesisHash:
      workOrder.contractReferences.realityObligationGenesisHash,
    realityObligationStateHash:
      workOrder.contractReferences.realityObligationStateHash,
    genesisObligationAttemptHash: graph.attempt.attemptHash,
  };
}

function reportRows(records, workOrder) {
  return records.map((record, index) => ({
    reportOrdinal: index + 1,
    reportedAt: record.capturedAt,
    episodeHash: workOrder.typedGraph.episode.episodeHash,
    occurrenceIdentityHash: record.occurrenceIdentityHash,
    attemptHash: workOrder.typedGraph.attempt.attemptHash,
    networkObjectIdentityHash: record.objectIdentityHash,
    networkReceiptHash: record.recordHash,
    executionDisposition: executionDisposition(record),
    outcomeObservationStatus: "MISSING",
    reportedOutcomeEvidenceHash: null,
    consequenceEvidenceHashes: [],
  }));
}

function dataFeeder(records, workOrder, composition) {
  const transactionRecords = records.filter((record) =>
    record.sourceKind === "BUYER_NATIVE_TRANSACTION");
  const sourceNativeRecoveryCount = transactionRecords.filter((record) =>
    record.transaction.operation === "RECOVER").length;
  const segment = (sourceNativeCount = 0) => ({
    sourceNativeCount, independentCount: 0,
    crossAttributionAdditionPermitted: false, additiveTotal: null,
  });
  const body = {
    schema: OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_SCHEMAS.feeder,
    episodeDataEngineSchema: EPISODE_DATA_ENGINE_SCHEMA,
    episodeDataSourceLedgerSchema: EPISODE_DATA_SOURCE_LEDGER_SCHEMA,
    episodeHash: workOrder.typedGraph.episode.episodeHash,
    attemptHash: workOrder.typedGraph.attempt.attemptHash,
    attemptSetCompositionHash: composition.compositionHash,
    sourceOccurrenceSetHash: digest(
      "outsider/outcome-product-episode-data-source-occurrence-set/v1",
      records.map((record) => record.recordHash)),
    segments: {
      opportunityCensus: segment(),
      delegationAuthorization: segment(),
      actionTrace: segment(transactionRecords.length),
      effect: segment(),
      outcome: segment(),
      recovery: segment(sourceNativeRecoveryCount),
      longitudinal: segment(),
    },
    independentOutcomeCount: 0,
    independentRecoveryCount: 0,
    queueDisposition: "QUARANTINED_NEEDS_INDEPENDENT_OUTCOME_RECOVERY",
    automaticQueueDispatch: false,
    offlineResearchModelFittingEligible: false,
    automaticTraining: false,
    authorizedTrainingRows: 0,
    productionModelPromotion: false,
    modelDecision: "KEEP_BASELINE",
  };
  return { ...body, feederHash: digest(body.schema, body) };
}

function bridgeProjection(records, workOrder, expectedProgramHash,
  prospectiveCensusProjectionHash, predecessor = null) {
  if (records.length < 1) return null;
  const revision = records.length - 1;
  const composition = createEpisodeAttemptSetComposition({
    recordedAt: records.at(-1).capturedAt,
    episodeBinding: episodeBinding(workOrder, prospectiveCensusProjectionHash),
    appendOnlyLineage: {
      revision,
      predecessorCompositionHash: predecessor?.episodeAttemptSetComposition
        .compositionHash ?? null,
      supersedesCompositionHash: predecessor?.episodeAttemptSetComposition
        .compositionHash ?? null,
    },
    attempts: [{
      attemptOrdinal: 1,
      occurredAt: workOrder.recordedAt,
      episodeHash: workOrder.typedGraph.episode.episodeHash,
      attemptHash: workOrder.typedGraph.attempt.attemptHash,
      attemptActorSubjectHash:
        workOrder.typedGraph.attempt.attemptActorSubjectHash,
      kind: "PRIMARY",
      retryOfAttemptHash: null,
      recoveryOfAttemptHash: null,
    }],
    reportOccurrences: reportRows(records, workOrder),
  }, { predecessor: predecessor?.episodeAttemptSetComposition ?? null });
  const verification = verifyEpisodeAttemptSetComposition(composition, {
    predecessor: predecessor?.episodeAttemptSetComposition ?? null,
    expectedCompositionHash: composition.compositionHash,
    expectedPredecessorCompositionHash: predecessor?.episodeAttemptSetComposition
      .compositionHash ?? null,
  });
  if (!verification.ok) fail("ATTEMPT_SET_COMPOSITION_REUSE_FAILED");
  const distinctObjects = new Set(records.map((record) =>
    record.objectIdentityHash)).size;
  const formationCount = records.filter((record) =>
    record.sourceKind === "PRODUCT_FORMATION").length;
  const transactionCount = records.length - formationCount;
  const body = {
    schema: OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_SCHEMAS.projection,
    schemaVersion: "1.0.0",
    revision,
    appendOnlyLineage: {
      predecessorProjectionHash: predecessor?.projectionHash ?? null,
      supersedesProjectionHash: predecessor?.projectionHash ?? null,
      inPlaceMutationAllowed: false,
    },
    expectedProgramHash,
    workOrderProjectionHash: workOrder.workOrderHash,
    typedGraphHash: workOrder.typedGraph.typedGraphHash,
    graphPath: workOrder.typedGraph.graphPath,
    episodeAttemptSetComposition: composition,
    occurrenceCensus: {
      ledgerKind: "PRODUCT_EXECUTION_SOURCE_OCCURRENCE",
      sourceOccurrenceCount: records.length,
      productFormationOccurrenceCount: formationCount,
      buyerNativeTransactionOccurrenceCount: transactionCount,
      everyCapturedOccurrenceRetained: true,
      countDerivedFromDistinctObjectCount: false,
      globalOccurrenceCompletenessEstablished: false,
    },
    objectDedupView: {
      ledgerKind: "PRIVATE_SOURCE_BYTE_OBJECT_EQUALITY_VIEW",
      distinctSourceObjectCount: distinctObjects,
      duplicateObjectOccurrenceCount: records.length - distinctObjects,
      objectEqualityCanReduceOccurrenceCount: false,
      privateRawHandlesProjected: false,
    },
    episodeDataEngineFeeder: dataFeeder(records, workOrder, composition),
    privateSourceReplay: {
      exactPrivateSourceBytesReplayed: true,
      privateSourceObjectCount: distinctObjects,
      privateRawHandlesProjected: false,
      sourcePathsProjected: false,
    },
    externalOutcomeEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_BOUNDARY,
  };
  return Object.freeze({ ...body, projectionHash: digest(body.schema, body) });
}

function validatePrivateRecord(record, prior, directory) {
  exact(record, ["schema", "schemaVersion", "sequence",
    "previousSourceRecordHash", "sourceKind", "capturedAt",
    "occurrenceIdentityHash", "sourceBytesHash", "sourceBytesLength",
    "privateRawHandle", "objectIdentityHash", "objectAlreadyPresent",
    "formation", "transaction", "recordHash"], "PRIVATE_SOURCE_RECORD");
  if (record.schema
      !== OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_SCHEMAS
        .privateSourceOccurrence
    || record.schemaVersion !== "1.0.0"
    || !Number.isSafeInteger(record.sequence) || record.sequence < 1
    || record.sequence !== (prior?.sequence ?? 0) + 1
    || record.previousSourceRecordHash !== (prior?.recordHash ?? null)
    || !["PRODUCT_FORMATION", "BUYER_NATIVE_TRANSACTION"]
      .includes(record.sourceKind)
    || !Number.isSafeInteger(record.sourceBytesLength)
    || record.sourceBytesLength < 1
    || typeof record.objectAlreadyPresent !== "boolean") {
    fail("PRIVATE_SOURCE_RECORD_STATE_INVALID");
  }
  instant(record.capturedAt, "PRIVATE_SOURCE_CAPTURED_AT");
  hash(record.occurrenceIdentityHash, "OCCURRENCE_IDENTITY_HASH");
  hash(record.sourceBytesHash, "SOURCE_BYTES_HASH");
  hash(record.objectIdentityHash, "OBJECT_IDENTITY_HASH");
  if (typeof record.privateRawHandle !== "string"
    || !RAW_HANDLE.test(record.privateRawHandle)
    || record.privateRawHandle !== rawHandle(record.sourceBytesHash)
    || record.objectIdentityHash !== objectIdentity(record.sourceBytesHash,
      record.sourceBytesLength)
    || (record.sourceKind === "PRODUCT_FORMATION")
      !== (record.formation !== null)
    || (record.sourceKind === "BUYER_NATIVE_TRANSACTION")
      !== (record.transaction !== null)) fail("PRIVATE_SOURCE_BINDING_INVALID");
  const { recordHash, ...body } = record;
  if (recordHash !== digest(record.schema, body)) fail("PRIVATE_SOURCE_HASH_INVALID");
  const rawPath = path.join(directory, "objects", `${record.privateRawHandle}.bin`);
  const rawInfo = statSync(rawPath);
  if (!rawInfo.isFile() || (rawInfo.mode & 0o077) !== 0) fail("RAW_OBJECT_NOT_PRIVATE");
  const raw = readFileSync(rawPath);
  if (raw.length !== record.sourceBytesLength
    || bytesHash(raw) !== record.sourceBytesHash) fail("RAW_OBJECT_REPLAY_INVALID");
  return record;
}

function loadRecords(directory) {
  const names = readdirSync(path.join(directory, "occurrences"))
    .filter((name) => /^\d{8}\.json$/u.test(name)).sort();
  if (names.length > MAX_OCCURRENCES) fail("OCCURRENCE_LIMIT_EXCEEDED");
  const records = [];
  let prior = null;
  for (const name of names) {
    const record = validatePrivateRecord(readCanonicalRecord(
      path.join(directory, "occurrences", name), "PRIVATE_SOURCE_RECORD"),
    prior, directory);
    records.push(record);
    prior = record;
  }
  return records;
}

function sinkReceipt(schema, version, key, value, duplicateDelivery) {
  return Object.freeze({ schema, schemaVersion: version, accepted: true,
    [key]: value, duplicateDelivery });
}

/**
 * Create or cold-replay one bridge bound to an existing Work Order graph.
 * Pass its two sink functions into buyer-native capabilities and Product
 * Runtime v2 respectively.
 */
export function createOutcomeProductEpisodeDataBridgeV1(input = {},
  dependencies = {}) {
  exact(input, ["privateDirectory", "workOrderProjection",
    "expectedWorkOrderHash", "expectedProgramHash",
    "prospectiveCensusProjectionHash"], "INPUT");
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || Buffer.isBuffer(dependencies)
    || Reflect.ownKeys(dependencies).length !== 1
    || !Object.hasOwn(dependencies, "clock")) fail("DEPENDENCIES_FIELDS_INVALID");
  if (typeof input.privateDirectory !== "string" || input.privateDirectory === ""
    || typeof dependencies.clock !== "function") fail("INPUT_INVALID");
  const expectedProgramHash = hash(input.expectedProgramHash,
    "EXPECTED_PROGRAM_HASH");
  const prospectiveCensusProjectionHash = hash(
    input.prospectiveCensusProjectionHash,
    "PROSPECTIVE_CENSUS_PROJECTION_HASH");
  const workOrderCheck = verifyAutonomousWorkOrderProjection(
    input.workOrderProjection, {
      expectedWorkOrderHash: hash(input.expectedWorkOrderHash,
        "EXPECTED_WORK_ORDER_HASH"),
    });
  if (!workOrderCheck.ok) fail("WORK_ORDER_PROJECTION_INVALID");
  const workOrder = input.workOrderProjection;
  const directory = path.resolve(input.privateDirectory);
  ensurePrivateDirectory(directory);
  for (const name of ["objects", "occurrences", "projections"]) {
    const child = path.join(directory, name);
    if (!existsSync(child)) mkdirSync(child, { mode: 0o700 });
    chmodSync(child, 0o700);
    ensurePrivateDirectory(child);
  }
  const state = { records: loadRecords(directory), latest: null };

  function rebuildAndReconcile() {
    let predecessor = null;
    for (let index = 0; index < state.records.length; index += 1) {
      const projection = bridgeProjection(state.records.slice(0, index + 1),
        workOrder, expectedProgramHash, prospectiveCensusProjectionHash,
        predecessor);
      const file = projectionFile(directory, index);
      writeOnce(file, jsonBytes(projection));
      const persisted = readCanonicalRecord(file, "BRIDGE_PROJECTION");
      if (canonicalizeStrict(persisted) !== canonicalizeStrict(projection)) {
        fail("BRIDGE_PROJECTION_REPLAY_INVALID");
      }
      predecessor = persisted;
    }
    state.latest = predecessor;
  }
  rebuildAndReconcile();

  function existingOccurrence(occurrenceIdentityHash) {
    return state.records.find((record) =>
      record.occurrenceIdentityHash === occurrenceIdentityHash) ?? null;
  }

  function appendOccurrence(sourceKind, occurrenceIdentityHash, sourceBytes,
    formation, transaction) {
    if (state.records.length >= MAX_OCCURRENCES) fail("OCCURRENCE_LIMIT_EXCEEDED");
    const capturedAt = instant(dependencies.clock(), "CLOCK");
    if (capturedAt < workOrder.recordedAt
      || state.records.length > 0
        && capturedAt < state.records.at(-1).capturedAt) {
      fail("CAPTURE_TIME_ORDER_INVALID");
    }
    const sourceBytesHash = bytesHash(sourceBytes);
    const handle = rawHandle(sourceBytesHash);
    const rawPath = path.join(directory, "objects", `${handle}.bin`);
    const objectAlreadyPresent = existsSync(rawPath);
    const body = {
      schema: OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_SCHEMAS
        .privateSourceOccurrence,
      schemaVersion: "1.0.0",
      sequence: state.records.length + 1,
      previousSourceRecordHash: state.records.at(-1)?.recordHash ?? null,
      sourceKind,
      capturedAt,
      occurrenceIdentityHash,
      sourceBytesHash,
      sourceBytesLength: sourceBytes.length,
      privateRawHandle: handle,
      objectIdentityHash: objectIdentity(sourceBytesHash, sourceBytes.length),
      objectAlreadyPresent,
      formation,
      transaction,
    };
    const record = Object.freeze({ ...body, recordHash: digest(body.schema, body) });
    const prospectiveRecords = [...state.records, record];
    const projection = bridgeProjection(prospectiveRecords, workOrder,
      expectedProgramHash, prospectiveCensusProjectionHash, state.latest);
    writeOnce(rawPath, sourceBytes);
    writeOnce(occurrenceFile(directory, record.sequence), jsonBytes(record));
    writeOnce(projectionFile(directory, projection.revision), jsonBytes(projection));
    state.records.push(record);
    state.latest = projection;
    return projection;
  }

  function captureTransaction(result) {
    const transaction = normalizeTransactionResult(result,
      workOrder.promisedOutcome.promisedOutcomeRefHash);
    const claim = claimBuyerNativeTransactionSourceOccurrenceV1(result);
    if (claim.sourceOccurrenceHash !== transaction.sourceOccurrenceHash
      || claim.sourceBytesHash !== transaction.sourceBytesHash
      || claim.establishesOwnerAuthority !== false
      || claim.establishesIndependentOutcome !== false
      || claim.publicProjectionPermitted !== false
      || !Buffer.isBuffer(claim.sourceBytes)
      || bytesHash(claim.sourceBytes) !== transaction.sourceBytesHash) {
      fail("TRANSACTION_PRIVATE_SOURCE_CLAIM_INVALID");
    }
    const existing = existingOccurrence(transaction.sourceOccurrenceHash);
    if (existing !== null) {
      if (existing.sourceKind !== "BUYER_NATIVE_TRANSACTION"
        || existing.sourceBytesHash !== transaction.sourceBytesHash
        || canonicalizeStrict(existing.transaction)
          !== canonicalizeStrict(transaction)) fail("OCCURRENCE_REPLAY_MISMATCH");
      return sinkReceipt(
        OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
          .sourceOccurrenceSinkReceipt,
        "1.0.0", "sourceOccurrenceHash", transaction.sourceOccurrenceHash,
        true);
    }
    appendOccurrence("BUYER_NATIVE_TRANSACTION",
      transaction.sourceOccurrenceHash, claim.sourceBytes, null, transaction);
    return sinkReceipt(
      OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .sourceOccurrenceSinkReceipt,
      "1.0.0", "sourceOccurrenceHash", transaction.sourceOccurrenceHash,
      false);
  }

  function captureFormation(event) {
    const formation = normalizeFormationEvent(event, expectedProgramHash);
    const raw = Buffer.from(canonicalizeStrict(event), "utf8");
    const existing = existingOccurrence(formation.eventIdHash);
    if (existing !== null) {
      if (existing.sourceKind !== "PRODUCT_FORMATION"
        || existing.sourceBytesHash !== bytesHash(raw)
        || canonicalizeStrict(existing.formation)
          !== canonicalizeStrict(formation)) fail("FORMATION_REPLAY_MISMATCH");
      return sinkReceipt(
        OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formationEventSinkReceipt,
        "2.0.0", "eventIdHash", formation.eventIdHash, true);
    }
    appendOccurrence("PRODUCT_FORMATION", formation.eventIdHash, raw,
      formation, null);
    return sinkReceipt(
      OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formationEventSinkReceipt,
      "2.0.0", "eventIdHash", formation.eventIdHash, false);
  }

  let tail = Promise.resolve();
  function enqueue(operation) {
    const run = tail.then(operation, operation).catch((error) => {
      /* A source record is the durable side of the boundary. If projection
         persistence was interrupted, reload that exact record and reconcile
         its deterministic descendant before a delivery can be retried. */
      state.records = loadRecords(directory);
      rebuildAndReconcile();
      throw error;
    });
    tail = run.catch(() => {});
    return run;
  }

  return Object.freeze({
    buyerNativeSourceOccurrenceSink(result) {
      return enqueue(() => captureTransaction(result));
    },
    formationEventSink(event) {
      return enqueue(() => captureFormation(event));
    },
    inspect() {
      return tail.then(() => state.latest);
    },
  });
}

/** Read-only structural/source replay of the current bridge directory. */
export function verifyOutcomeProductEpisodeDataBridgeV1(input = {}) {
  try {
    exact(input, ["privateDirectory", "workOrderProjection",
      "expectedWorkOrderHash", "expectedProgramHash",
      "prospectiveCensusProjectionHash"], "VERIFY_INPUT");
    const directory = path.resolve(input.privateDirectory);
    ensurePrivateDirectory(directory);
    const workOrderCheck = verifyAutonomousWorkOrderProjection(
      input.workOrderProjection, {
        expectedWorkOrderHash: hash(input.expectedWorkOrderHash,
          "EXPECTED_WORK_ORDER_HASH"),
      });
    if (!workOrderCheck.ok) fail("WORK_ORDER_PROJECTION_INVALID");
    const records = loadRecords(directory);
    let predecessor = null;
    for (let index = 0; index < records.length; index += 1) {
      const expected = bridgeProjection(records.slice(0, index + 1),
        input.workOrderProjection,
        hash(input.expectedProgramHash, "EXPECTED_PROGRAM_HASH"),
        hash(input.prospectiveCensusProjectionHash,
          "PROSPECTIVE_CENSUS_PROJECTION_HASH"), predecessor);
      const actual = readCanonicalRecord(projectionFile(directory, index),
        "BRIDGE_PROJECTION");
      if (canonicalizeStrict(actual) !== canonicalizeStrict(expected)) {
        fail("BRIDGE_PROJECTION_REPLAY_INVALID");
      }
      predecessor = actual;
    }
    return Object.freeze({
      schema: OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_SCHEMAS
        .verification,
      ok: true,
      sourceReplayComplete: true,
      occurrenceCount: records.length,
      distinctSourceObjectCount: new Set(records.map((record) =>
        record.objectIdentityHash)).size,
      projectionHash: predecessor?.projectionHash ?? null,
      externalOutcomeEstablished: false,
      authorizedTrainingRows: 0,
      modelDecision: "KEEP_BASELINE",
      boundary: OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_BOUNDARY,
    });
  } catch (error) {
    return Object.freeze({
      schema: OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_SCHEMAS
        .verification,
      ok: false,
      sourceReplayComplete: false,
      occurrenceCount: 0,
      distinctSourceObjectCount: 0,
      projectionHash: null,
      externalOutcomeEstablished: false,
      authorizedTrainingRows: 0,
      modelDecision: "KEEP_BASELINE",
      error: error instanceof Error ? error.message : "UNKNOWN_FAILURE",
      boundary: OUTSIDER_OUTCOME_PRODUCT_EPISODE_DATA_BRIDGE_V1_BOUNDARY,
    });
  }
}
