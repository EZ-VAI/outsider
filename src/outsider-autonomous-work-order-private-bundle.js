/*
 * Private, no-clobber publication for the Stage 1 autonomous work-order
 * product projection.
 *
 * This module deliberately separates three facts:
 *   1. the five local files are canonical, private, and mutually bound;
 *   2. the projection and Attempt-set are structurally reproducible; and
 *   3. the referenced network/semantic sources were replayed.
 *
 * This v1 implements (1) and (2) only.  Its source-bound-envelope file is an
 * explicit pending-integration slot and can never claim (3).  A later trusted
 * verifier must rebuild sources through fixed imports and issue a versioned
 * descendant; no callback, caller boolean, or coherently resealed directory
 * can turn this receipt into source replay.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAutonomousWorkOrderProjection,
} from "./outsider-autonomous-work-order.js";
import {
  verifyEpisodeAttemptSetComposition,
} from "./outsider-episode-attempt-set-composition.js";
import { publishPrivateArtifact } from
  "./outsider-private-artifact-publication.js";

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashPrototypeUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashPrototypeDigest = Function.prototype.call.bind(HashPrototype.digest);

export const AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS = Object.freeze({
  bundle: "outsider/autonomous-work-order-private-bundle/v1",
  sourceBoundEnvelope:
    "outsider/autonomous-work-order-source-bound-envelope-pending/v1",
  lineage: "outsider/autonomous-work-order-private-lineage/v1",
  publication: "outsider/autonomous-work-order-private-publication/v1",
  receipt: "outsider/autonomous-work-order-private-run-receipt/v1",
  structuralVerification:
    "outsider/autonomous-work-order-private-structural-verification/v1",
  trustedVerification:
    "outsider/autonomous-work-order-private-trusted-verification/v1",
});

export const AUTONOMOUS_WORK_ORDER_PRIVATE_FILES = Object.freeze({
  projection: "work-order-projection.json",
  attemptSetComposition: "attempt-set-composition.json",
  sourceBoundEnvelope: "source-bound-envelope.json",
  lineage: "lineage.json",
  receipt: "run-receipt.json",
});

const FILE_ORDER = Object.freeze([
  "projection",
  "attemptSetComposition",
  "sourceBoundEnvelope",
  "lineage",
  "receipt",
]);

export const AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY = deepFreeze({
  position:
    "PRIVATE_STAGE1_WORK_ORDER_BYTE_BINDING_NOT_NETWORK_ORDER_OR_SOURCE_TRUST",
  privateLocalArtifactOnly: true,
  expectedDirectoryMode: "0700",
  expectedFileMode: "0600",
  fixedFileCount: 5,
  exactFileSetRequired: true,
  noClobberRequired: true,
  receiptWrittenLastRequired: true,
  cooperativeSinglePublisherAssumed: true,
  concurrentSameUserParentPathReplacementResistanceEstablished: false,
  atomicWholeDirectoryPublicationEstablished: false,
  partialPublicationMayLeaveTerminalTombstoneDirectory: true,
  partialPublicationResumeAllowed: false,
  structuralVerificationEstablishesSourceReplay: false,
  trustedSourceReplayVerifierIntegrated: false,
  sourceReplayVerified: false,
  predecessorSourceReplayVerified: false,
  externalHeadAnchorEstablished: false,
  networkOrderEstablished: false,
  externalContractAcceptanceEstablished: false,
  independentOutcomeEstablished: false,
  obligationClosureEstablished: false,
  authority: "NONE",
  decisionState: "HOLD",
  actionReady: false,
  executable: false,
  automaticTraining: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  custodyEstablished: false,
  moneyMovementEnabled: false,
  platformAdvanceEnabled: false,
  guaranteeEstablished: false,
  insuranceEstablished: false,
  settlementEnabled: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

function fail(code, detail = null) {
  throw new Error(detail === null
    ? `AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_${code}`
    : `AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_${code}:${detail}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor && Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(value);
}

function exactObject(value, fields, code) {
  canonicalizeStrict(value);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
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

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashPrototypeUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashPrototypeDigest(state, "hex")}`;
}

function sha256(bytes) {
  const state = createHash("sha256");
  HashPrototypeUpdate(state, bytes);
  return `sha256:${HashPrototypeDigest(state, "hex")}`;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function lstatOrNull(target) {
  try { return lstatSync(target, { bigint: true }); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sameNode(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino
    && (left.mode & 0o170000n) === (right.mode & 0o170000n));
}

function sameStableStat(left, right) {
  return sameNode(left, right) && left.mode === right.mode
    && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs && left.nlink === right.nlink;
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    const status = fstatSync(descriptor, { bigint: true });
    if (!status.isDirectory()) fail("FSYNC_DIRECTORY_INVALID");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function claimedOutput(options) {
  exactObject(options, ["trustedRoot", "outputDirectory",
    "expectedWorkOrderHash", "expectedAttemptSetCompositionHash",
    "expectedSourceBoundEnvelopeHash", "expectedLineageHash",
    "attemptSetPredecessor"], "PUBLICATION_OPTIONS");
  const trustedRoot = path.resolve(options.trustedRoot);
  const outputDirectory = path.resolve(options.outputDirectory);
  const rootStat = lstatOrNull(trustedRoot);
  if (trustedRoot === path.parse(trustedRoot).root || !rootStat
    || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail("TRUSTED_ROOT_INVALID");
  }
  if (path.dirname(outputDirectory) !== trustedRoot
    || outputDirectory === trustedRoot) fail("OUTPUT_MUST_BE_NEW_DIRECT_CHILD");
  if (lstatOrNull(outputDirectory)) fail("OUTPUT_DIRECTORY_EXISTS");
  return {
    trustedRoot,
    outputDirectory,
    rootStat,
    expectedWorkOrderHash: hash(options.expectedWorkOrderHash,
      "EXPECTED_WORK_ORDER_HASH"),
    expectedAttemptSetCompositionHash: hash(
      options.expectedAttemptSetCompositionHash,
      "EXPECTED_ATTEMPT_SET_COMPOSITION_HASH"),
    expectedSourceBoundEnvelopeHash: hash(options.expectedSourceBoundEnvelopeHash,
      "EXPECTED_SOURCE_BOUND_ENVELOPE_HASH"),
    expectedLineageHash: hash(options.expectedLineageHash,
      "EXPECTED_LINEAGE_HASH"),
    attemptSetPredecessor: options.attemptSetPredecessor,
  };
}

function assertTrustedRoot(root, claimed) {
  const current = lstatOrNull(root);
  if (!current || current.isSymbolicLink() || !current.isDirectory()
    || !sameNode(current, claimed) || current.mode !== claimed.mode) {
    fail("TRUSTED_ROOT_IDENTITY_CHANGED");
  }
}

function assertOutputDirectory(directory, claimed) {
  const current = lstatOrNull(directory);
  if (!current || current.isSymbolicLink() || !current.isDirectory()
    || !sameNode(current, claimed) || (current.mode & 0o7777n) !== 0o700n) {
    fail("OUTPUT_DIRECTORY_IDENTITY_CHANGED");
  }
}

function createOutputDirectory(publication) {
  try { mkdirSync(publication.outputDirectory, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === "EEXIST") fail("OUTPUT_DIRECTORY_EXISTS_AFTER_BUILD");
    throw error;
  }
  let descriptor;
  try {
    descriptor = openSync(publication.outputDirectory,
      constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    fchmodSync(descriptor, 0o700);
    const claimed = fstatSync(descriptor, { bigint: true });
    if (!claimed.isDirectory() || (claimed.mode & 0o7777n) !== 0o700n) {
      fail("OUTPUT_DIRECTORY_MODE_INVALID");
    }
    return claimed;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateProjection(record, expectedHash) {
  const checked = verifyAutonomousWorkOrderProjection(record, {
    expectedWorkOrderHash: expectedHash,
  });
  if (!checked.ok || checked.structuralProjectionVerified !== true
    || checked.sourceReplayVerified !== false
    || checked.networkOrderEstablished !== false) {
    fail("WORK_ORDER_PROJECTION_INVALID", checked.error ?? null);
  }
  return checked;
}

function validateAttemptSet(record, expectedHash, predecessor) {
  const checked = verifyEpisodeAttemptSetComposition(record, {
    predecessor,
    expectedCompositionHash: expectedHash,
    expectedPredecessorCompositionHash:
      predecessor === null ? null : predecessor.compositionHash,
  });
  if (!checked.ok || checked.structuralCompositionVerified !== true
    || checked.referencedSourceReplayVerified !== false
    || checked.globalAttemptCensusCompletenessEstablished !== false) {
    fail("ATTEMPT_SET_COMPOSITION_INVALID", checked.error ?? null);
  }
  return checked;
}

export function createPendingAutonomousWorkOrderSourceBoundEnvelope({
  workOrderHash,
  attemptSetCompositionHash,
} = {}) {
  hash(workOrderHash, "WORK_ORDER_HASH");
  hash(attemptSetCompositionHash, "ATTEMPT_SET_COMPOSITION_HASH");
  const body = {
    schema:
      AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.sourceBoundEnvelope,
    schemaVersion: "1.0.0",
    envelopeClass:
      "PENDING_FIXED_IMPORT_SOURCE_REPLAY_INTEGRATION_HOLD_ONLY",
    workOrderHash,
    attemptSetCompositionHash,
    sourceReplayRootHash: null,
    externalTrustPinRootHash: null,
    trustedVerifierImplementationHash: null,
    trustedSourceReplayVerifierIntegrated: false,
    referencedSourcesReplayed: false,
    predecessorSourceReplayVerified: false,
    externalHeadAnchorEstablished: false,
    sourceReplayVerified: false,
    networkOrderEstablished: false,
    result: "SOURCE_BOUND_ENVELOPE_PENDING_HOLD",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
  };
  return deepFreeze({ ...body, sourceBoundEnvelopeHash: digest(
    AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.sourceBoundEnvelope, body) });
}

function exactPendingSourceEnvelope(value) {
  exactObject(value, ["schema", "schemaVersion", "envelopeClass",
    "workOrderHash", "attemptSetCompositionHash", "sourceReplayRootHash",
    "externalTrustPinRootHash", "trustedVerifierImplementationHash",
    "trustedSourceReplayVerifierIntegrated", "referencedSourcesReplayed",
    "predecessorSourceReplayVerified", "externalHeadAnchorEstablished",
    "sourceReplayVerified", "networkOrderEstablished", "result",
    "decisionState", "authority", "actionReady", "executable", "boundary",
    "sourceBoundEnvelopeHash"], "SOURCE_BOUND_ENVELOPE");
  if (value.schema
      !== AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.sourceBoundEnvelope
    || value.schemaVersion !== "1.0.0"
    || value.envelopeClass
      !== "PENDING_FIXED_IMPORT_SOURCE_REPLAY_INTEGRATION_HOLD_ONLY"
    || value.sourceReplayRootHash !== null
    || value.externalTrustPinRootHash !== null
    || value.trustedVerifierImplementationHash !== null
    || value.trustedSourceReplayVerifierIntegrated !== false
    || value.referencedSourcesReplayed !== false
    || value.predecessorSourceReplayVerified !== false
    || value.externalHeadAnchorEstablished !== false
    || value.sourceReplayVerified !== false
    || value.networkOrderEstablished !== false
    || value.result !== "SOURCE_BOUND_ENVELOPE_PENDING_HOLD"
    || value.decisionState !== "HOLD" || value.authority !== "NONE"
    || value.actionReady !== false || value.executable !== false
    || !same(value.boundary, AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY)) {
    fail("SOURCE_BOUND_ENVELOPE_STATE_INVALID");
  }
  const rebuilt = createPendingAutonomousWorkOrderSourceBoundEnvelope({
    workOrderHash: value.workOrderHash,
    attemptSetCompositionHash: value.attemptSetCompositionHash,
  });
  if (!same(value, rebuilt)) fail("SOURCE_BOUND_ENVELOPE_HASH_INVALID");
  return value;
}

function predecessorIdentity(value) {
  exactObject(value, ["revision", "orderIdentityHash", "workOrderHash",
    "attemptSetCompositionHash", "sourceBoundEnvelopeHash",
    "publicationReceiptHash", "actualFileSetHash"], "PREDECESSOR_IDENTITY");
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    fail("PREDECESSOR_REVISION_INVALID");
  }
  return {
    revision: value.revision,
    orderIdentityHash: hash(value.orderIdentityHash,
      "PREDECESSOR_ORDER_IDENTITY_HASH"),
    workOrderHash: hash(value.workOrderHash, "PREDECESSOR_WORK_ORDER_HASH"),
    attemptSetCompositionHash: hash(value.attemptSetCompositionHash,
      "PREDECESSOR_ATTEMPT_SET_COMPOSITION_HASH"),
    sourceBoundEnvelopeHash: hash(value.sourceBoundEnvelopeHash,
      "PREDECESSOR_SOURCE_BOUND_ENVELOPE_HASH"),
    publicationReceiptHash: hash(value.publicationReceiptHash,
      "PREDECESSOR_PUBLICATION_RECEIPT_HASH"),
    actualFileSetHash: hash(value.actualFileSetHash,
      "PREDECESSOR_ACTUAL_FILE_SET_HASH"),
  };
}

export function createAutonomousWorkOrderPrivateLineage({
  projection,
  attemptSetComposition,
  sourceBoundEnvelope,
  predecessor = null,
} = {}) {
  exactPendingSourceEnvelope(sourceBoundEnvelope);
  const revision = projection?.appendOnlyLineage?.revision;
  if (!Number.isSafeInteger(revision) || revision < 0
    || attemptSetComposition?.appendOnlyLineage?.revision !== revision) {
    fail("LINEAGE_REVISION_CROSSWALK_INVALID");
  }
  if (sourceBoundEnvelope.workOrderHash !== projection.workOrderHash
    || sourceBoundEnvelope.attemptSetCompositionHash
      !== attemptSetComposition.compositionHash) {
    fail("LINEAGE_PAYLOAD_CROSSWALK_INVALID");
  }
  let prior = null;
  if (revision === 0) {
    if (predecessor !== null
      || projection.appendOnlyLineage.predecessorProjectionHash !== null
      || attemptSetComposition.appendOnlyLineage.predecessorCompositionHash
        !== null) fail("GENESIS_LINEAGE_PREDECESSOR_FORBIDDEN");
  } else {
    prior = predecessorIdentity(predecessor);
    if (prior.revision !== revision - 1
      || prior.orderIdentityHash !== projection.episodeAlias.orderIdentityHash
      || projection.appendOnlyLineage.predecessorProjectionHash
        !== prior.workOrderHash
      || projection.appendOnlyLineage.supersedesProjectionHash
        !== prior.workOrderHash
      || attemptSetComposition.appendOnlyLineage.predecessorCompositionHash
        !== prior.attemptSetCompositionHash
      || attemptSetComposition.appendOnlyLineage.supersedesCompositionHash
        !== prior.attemptSetCompositionHash) {
      fail("DESCENDANT_LINEAGE_PREDECESSOR_CROSSWALK_INVALID");
    }
  }
  const body = {
    schema: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.lineage,
    schemaVersion: "1.0.0",
    lineageClass:
      "APPEND_ONLY_BACKWARD_BINDING_NO_PREDECESSOR_SOURCE_REPLAY",
    revision,
    orderIdentityHash: projection.episodeAlias.orderIdentityHash,
    workOrderHash: projection.workOrderHash,
    attemptSetCompositionHash: attemptSetComposition.compositionHash,
    sourceBoundEnvelopeHash: sourceBoundEnvelope.sourceBoundEnvelopeHash,
    predecessor: prior,
    supersedes: prior,
    predecessorExactBytesVerified: false,
    predecessorSourceReplayVerified: false,
    forwardLinkWrittenIntoPredecessorDirectory: false,
    inPlaceMutationAllowed: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
  return deepFreeze({ ...body, lineageHash: digest(
    AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.lineage, body) });
}

function exactLineage(value, projection, attemptSet, sourceEnvelope) {
  exactObject(value, ["schema", "schemaVersion", "lineageClass", "revision",
    "orderIdentityHash", "workOrderHash", "attemptSetCompositionHash",
    "sourceBoundEnvelopeHash", "predecessor", "supersedes",
    "predecessorExactBytesVerified", "predecessorSourceReplayVerified",
    "forwardLinkWrittenIntoPredecessorDirectory", "inPlaceMutationAllowed",
    "decisionState", "authority", "lineageHash"], "LINEAGE");
  if (value.schema !== AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.lineage
    || value.schemaVersion !== "1.0.0"
    || value.lineageClass
      !== "APPEND_ONLY_BACKWARD_BINDING_NO_PREDECESSOR_SOURCE_REPLAY"
    || value.predecessorExactBytesVerified !== false
    || value.predecessorSourceReplayVerified !== false
    || value.forwardLinkWrittenIntoPredecessorDirectory !== false
    || value.inPlaceMutationAllowed !== false
    || value.decisionState !== "HOLD" || value.authority !== "NONE") {
    fail("LINEAGE_STATE_INVALID");
  }
  const rebuilt = createAutonomousWorkOrderPrivateLineage({
    projection,
    attemptSetComposition: attemptSet,
    sourceBoundEnvelope: sourceEnvelope,
    predecessor: value.predecessor,
  });
  if (!same(value, rebuilt) || !same(value.predecessor, value.supersedes)) {
    fail("LINEAGE_DERIVATION_INVALID");
  }
  return value;
}

function enforceCrosswalk(projection, attemptSet, sourceEnvelope, lineage) {
  const binding = attemptSet.episodeBinding;
  if (binding.workOrderProjectionHash !== projection.workOrderHash
    || binding.episodeHash !== projection.typedGraph.episode.episodeHash
    || binding.orderIdentityHash !== projection.episodeAlias.orderIdentityHash
    || binding.principalEpochProjectionHash
      !== projection.typedGraph.principalEpoch.principalEpochProjectionHash
    || binding.accountableDeploymentSubjectHash
      !== projection.typedGraph.accountableDeployment.accountableDeploymentSubjectHash
    || binding.runtimeInstanceHash
      !== projection.typedGraph.runtime.runtimeInstanceHash
    || binding.embodimentRevisionHash
      !== projection.typedGraph.embodiment.embodimentRevisionHash
    || binding.delegationEdgeHash
      !== projection.typedGraph.delegation.delegationEdgeHash
    || binding.networkCompleteEpisodeJoinHash
      !== projection.typedGraph.episode.networkCompleteEpisodeJoinHash
    || binding.realityObligationGenesisHash
      !== projection.contractReferences.realityObligationGenesisHash
    || binding.realityObligationStateHash
      !== projection.contractReferences.realityObligationStateHash
    || binding.callerSuppliedGenesisObligationAttemptHash
      !== projection.typedGraph.attempt.attemptHash
    || attemptSet.attempts[0].attemptHash
      !== projection.typedGraph.attempt.attemptHash
    || attemptSet.attempts[0].attemptActorSubjectHash
      !== projection.typedGraph.attempt.attemptActorSubjectHash
    || sourceEnvelope.workOrderHash !== projection.workOrderHash
    || sourceEnvelope.attemptSetCompositionHash !== attemptSet.compositionHash
    || lineage.workOrderHash !== projection.workOrderHash
    || lineage.attemptSetCompositionHash !== attemptSet.compositionHash
    || lineage.sourceBoundEnvelopeHash !== sourceEnvelope.sourceBoundEnvelopeHash) {
    fail("PAYLOAD_CROSSWALK_INVALID");
  }
}

function payloadBytes(bundle) {
  return {
    projection: canonicalBytes(bundle.projection),
    attemptSetComposition: canonicalBytes(bundle.attemptSetComposition),
    sourceBoundEnvelope: canonicalBytes(bundle.sourceBoundEnvelope),
    lineage: canonicalBytes(bundle.lineage),
  };
}

function publicationManifest(payloads) {
  const files = FILE_ORDER.map((role) => role === "receipt" ? {
    role,
    fileName: AUTONOMOUS_WORK_ORDER_PRIVATE_FILES[role],
    serialization: "CANONICAL_JSON_LF",
    sizeBytes: null,
    sha256: null,
    fileHashBoundByReceipt: false,
  } : {
    role,
    fileName: AUTONOMOUS_WORK_ORDER_PRIVATE_FILES[role],
    serialization: "CANONICAL_JSON_LF",
    sizeBytes: payloads[role].length,
    sha256: sha256(payloads[role]),
    fileHashBoundByReceipt: true,
  });
  return {
    schema: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.publication,
    expectedDirectoryMode: "0700",
    expectedFileMode: "0600",
    exactFileSetRequired: true,
    extraFilesAllowed: false,
    symlinksAllowed: false,
    hardlinksAllowed: false,
    noClobber: true,
    allowExistingIdentical: false,
    expectedFileCount: FILE_ORDER.length,
    publicationOrder: FILE_ORDER.map((role) =>
      AUTONOMOUS_WORK_ORDER_PRIVATE_FILES[role]),
    receiptFileName: AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.receipt,
    receiptWrittenLast: true,
    receiptFileSelfHashEmbedded: false,
    files,
  };
}

function bundleReceipt(bundle) {
  const payloads = payloadBytes(bundle);
  const body = {
    schema: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    receiptClass:
      "PRIVATE_CANONICAL_BYTE_BOUND_STRUCTURAL_RECEIPT_NO_SOURCE_REPLAY",
    bundleSchema: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.bundle,
    orderIdentityHash: bundle.projection.episodeAlias.orderIdentityHash,
    workOrderHash: bundle.projection.workOrderHash,
    attemptSetCompositionHash: bundle.attemptSetComposition.compositionHash,
    sourceBoundEnvelopeHash: bundle.sourceBoundEnvelope.sourceBoundEnvelopeHash,
    lineageHash: bundle.lineage.lineageHash,
    attemptCount: bundle.attemptSetComposition.attemptCensus.attemptCount,
    reportOccurrenceCount:
      bundle.attemptSetComposition.reportOccurrenceCensus.reportOccurrenceCount,
    distinctSuppliedNetworkObjectIdentityHashCount:
      bundle.attemptSetComposition.objectDedupView
        .distinctSuppliedNetworkObjectIdentityHashCount,
    structuralProjectionVerified: true,
    structuralAttemptSetVerified: true,
    receiptToPayloadByteBindingDeclared: true,
    trustedSourceReplayVerifierIntegrated: false,
    sourceReplayVerified: false,
    predecessorSourceReplayVerified: false,
    externalHeadAnchorEstablished: false,
    networkOrderEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    publication: publicationManifest(payloads),
    boundary: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
  };
  return deepFreeze({ ...body, receiptHash: digest(
    AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.receipt, body) });
}

function buildBundle({ projection, attemptSetComposition, sourceBoundEnvelope,
  lineage }, { expectedWorkOrderHash, expectedAttemptSetCompositionHash,
  expectedSourceBoundEnvelopeHash, expectedLineageHash,
  attemptSetPredecessor = null }) {
  validateProjection(projection, expectedWorkOrderHash);
  validateAttemptSet(attemptSetComposition,
    expectedAttemptSetCompositionHash, attemptSetPredecessor);
  exactPendingSourceEnvelope(sourceBoundEnvelope);
  if (sourceBoundEnvelope.sourceBoundEnvelopeHash
      !== expectedSourceBoundEnvelopeHash) {
    fail("EXPECTED_SOURCE_BOUND_ENVELOPE_HASH_MISMATCH");
  }
  exactLineage(lineage, projection, attemptSetComposition, sourceBoundEnvelope);
  if (lineage.lineageHash !== expectedLineageHash) {
    fail("EXPECTED_LINEAGE_HASH_MISMATCH");
  }
  enforceCrosswalk(projection, attemptSetComposition, sourceBoundEnvelope,
    lineage);
  const base = {
    schema: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.bundle,
    projection,
    attemptSetComposition,
    sourceBoundEnvelope,
    lineage,
  };
  const receipt = bundleReceipt(base);
  return deepFreeze({ ...base, receipt });
}

function directorySnapshot(directory) {
  const target = path.resolve(directory);
  if (target === path.parse(target).root) fail("DIRECTORY_TOO_BROAD");
  const initial = lstatOrNull(target);
  if (!initial || initial.isSymbolicLink() || !initial.isDirectory()
    || (initial.mode & 0o7777n) !== 0o700n) fail("DIRECTORY_INVALID");
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isDirectory() || !sameStableStat(initial, before)) {
      fail("DIRECTORY_IDENTITY_CHANGED");
    }
    const entries = readdirSync(target, { withFileTypes: true });
    const after = fstatSync(descriptor, { bigint: true });
    const final = lstatOrNull(target);
    if (!final || !sameStableStat(before, after)
      || !sameStableStat(before, final)) fail("DIRECTORY_CHANGED_DURING_READ");
    return { target, stat: after, entries };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readPrivateFile(directory, fileName) {
  if (path.basename(fileName) !== fileName || fileName === "." || fileName === "..") {
    fail("FILE_NAME_INVALID");
  }
  const target = path.join(directory, fileName);
  const initial = lstatOrNull(target);
  if (!initial || initial.isSymbolicLink() || !initial.isFile()
    || (initial.mode & 0o7777n) !== 0o600n || initial.nlink !== 1n
    || initial.size > BigInt(MAX_FILE_BYTES)) fail("FILE_INVALID", fileName);
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || !sameStableStat(initial, before)) {
      fail("FILE_IDENTITY_CHANGED", fileName);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const final = lstatOrNull(target);
    if (!final || !sameStableStat(before, after) || !sameStableStat(before, final)
      || BigInt(bytes.length) !== after.size) fail("FILE_CHANGED_DURING_READ", fileName);
    return { fileName, bytes, stat: after, sha256: sha256(bytes) };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseCanonicalFile(file) {
  let value;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    value = JSON.parse(text);
  } catch { fail("JSON_INVALID", file.fileName); }
  if (!canonicalBytes(value).equals(file.bytes)) {
    fail("CANONICAL_SERIALIZATION_INVALID", file.fileName);
  }
  return value;
}

function validatePublicationManifest(receipt) {
  const value = receipt.publication;
  exactObject(value, ["schema", "expectedDirectoryMode", "expectedFileMode",
    "exactFileSetRequired", "extraFilesAllowed", "symlinksAllowed",
    "hardlinksAllowed", "noClobber", "allowExistingIdentical",
    "expectedFileCount", "publicationOrder", "receiptFileName",
    "receiptWrittenLast", "receiptFileSelfHashEmbedded", "files"],
  "PUBLICATION_MANIFEST");
  if (value.schema
      !== AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.publication
    || value.expectedDirectoryMode !== "0700"
    || value.expectedFileMode !== "0600"
    || value.exactFileSetRequired !== true
    || value.extraFilesAllowed !== false || value.symlinksAllowed !== false
    || value.hardlinksAllowed !== false || value.noClobber !== true
    || value.allowExistingIdentical !== false
    || value.expectedFileCount !== FILE_ORDER.length
    || value.receiptFileName !== AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.receipt
    || value.receiptWrittenLast !== true
    || value.receiptFileSelfHashEmbedded !== false
    || !same(value.publicationOrder, FILE_ORDER.map((role) =>
      AUTONOMOUS_WORK_ORDER_PRIVATE_FILES[role]))
    || !Array.isArray(value.files) || value.files.length !== FILE_ORDER.length) {
    fail("PUBLICATION_MANIFEST_INVALID");
  }
  for (let index = 0; index < FILE_ORDER.length; index += 1) {
    const role = FILE_ORDER[index];
    const file = value.files[index];
    exactObject(file, ["role", "fileName", "serialization", "sizeBytes",
      "sha256", "fileHashBoundByReceipt"], "PUBLICATION_FILE");
    if (file.role !== role
      || file.fileName !== AUTONOMOUS_WORK_ORDER_PRIVATE_FILES[role]
      || file.serialization !== "CANONICAL_JSON_LF") {
      fail("PUBLICATION_FILE_INVALID", role);
    }
    if (role === "receipt") {
      if (file.sizeBytes !== null || file.sha256 !== null
        || file.fileHashBoundByReceipt !== false) {
        fail("RECEIPT_SELF_REFERENCE_INVALID");
      }
    } else if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0
      || !HASH.test(file.sha256 ?? "")
      || file.fileHashBoundByReceipt !== true) {
      fail("PUBLICATION_PAYLOAD_BINDING_INVALID", role);
    }
  }
  return value;
}

function exactReceipt(value) {
  exactObject(value, ["schema", "schemaVersion", "receiptClass", "bundleSchema",
    "orderIdentityHash", "workOrderHash", "attemptSetCompositionHash",
    "sourceBoundEnvelopeHash", "lineageHash", "attemptCount",
    "reportOccurrenceCount", "distinctSuppliedNetworkObjectIdentityHashCount",
    "structuralProjectionVerified",
    "structuralAttemptSetVerified", "receiptToPayloadByteBindingDeclared",
    "trustedSourceReplayVerifierIntegrated", "sourceReplayVerified",
    "predecessorSourceReplayVerified", "externalHeadAnchorEstablished",
    "networkOrderEstablished", "decisionState", "authority", "actionReady",
    "executable", "publication", "boundary", "receiptHash"], "RECEIPT");
  if (value.schema !== AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.receipt
    || value.schemaVersion !== "1.0.0"
    || value.receiptClass
      !== "PRIVATE_CANONICAL_BYTE_BOUND_STRUCTURAL_RECEIPT_NO_SOURCE_REPLAY"
    || value.bundleSchema !== AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.bundle
    || value.structuralProjectionVerified !== true
    || value.structuralAttemptSetVerified !== true
    || value.receiptToPayloadByteBindingDeclared !== true
    || value.trustedSourceReplayVerifierIntegrated !== false
    || value.sourceReplayVerified !== false
    || value.predecessorSourceReplayVerified !== false
    || value.externalHeadAnchorEstablished !== false
    || value.networkOrderEstablished !== false
    || value.decisionState !== "HOLD" || value.authority !== "NONE"
    || value.actionReady !== false || value.executable !== false
    || !same(value.boundary, AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY)) {
    fail("RECEIPT_STATE_INVALID");
  }
  validatePublicationManifest(value);
  const { receiptHash, ...body } = value;
  if (receiptHash !== digest(
    AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.receipt, body)) {
    fail("RECEIPT_HASH_INVALID");
  }
  return value;
}

function actualFileProjection(files) {
  return FILE_ORDER.map((role) => {
    const file = files.get(role);
    return { role, fileName: file.fileName, sizeBytes: file.bytes.length,
      sha256: file.sha256 };
  });
}

function actualFileSetHash(files) {
  return digest("outsider/autonomous-work-order-private-actual-file-set/v1",
    actualFileProjection(files));
}

function readBundle(directory, { attemptSetPredecessor = null } = {}) {
  const before = directorySnapshot(directory);
  const expectedNames = FILE_ORDER.map((role) =>
    AUTONOMOUS_WORK_ORDER_PRIVATE_FILES[role]).sort();
  const actualNames = before.entries.map((entry) => entry.name).sort();
  if (!same(actualNames, expectedNames)
    || before.entries.some((entry) => !entry.isFile()
      || entry.isSymbolicLink())) fail("EXACT_FILE_SET_INVALID");
  const files = new Map();
  for (const role of FILE_ORDER) {
    files.set(role, readPrivateFile(before.target,
      AUTONOMOUS_WORK_ORDER_PRIVATE_FILES[role]));
  }
  const receipt = exactReceipt(parseCanonicalFile(files.get("receipt")));
  const publication = receipt.publication;
  for (const declared of publication.files) {
    if (declared.role === "receipt") continue;
    const actual = files.get(declared.role);
    if (actual.bytes.length !== declared.sizeBytes
      || actual.sha256 !== declared.sha256) {
      fail("ACTUAL_FILE_HASH_MISMATCH", declared.role);
    }
  }
  for (const role of FILE_ORDER) {
    if (role === "receipt") continue;
    const payload = files.get(role);
    if (files.get("receipt").stat.mtimeNs < payload.stat.mtimeNs
      || files.get("receipt").stat.ctimeNs < payload.stat.ctimeNs) {
      fail("RECEIPT_NOT_LAST_BY_FILESYSTEM_METADATA", role);
    }
  }
  const projection = parseCanonicalFile(files.get("projection"));
  const attemptSetComposition = parseCanonicalFile(
    files.get("attemptSetComposition"));
  const sourceBoundEnvelope = parseCanonicalFile(files.get("sourceBoundEnvelope"));
  const lineage = parseCanonicalFile(files.get("lineage"));
  const rebuilt = buildBundle({ projection, attemptSetComposition,
    sourceBoundEnvelope, lineage }, {
    expectedWorkOrderHash: receipt.workOrderHash,
    expectedAttemptSetCompositionHash: receipt.attemptSetCompositionHash,
    expectedSourceBoundEnvelopeHash: receipt.sourceBoundEnvelopeHash,
    expectedLineageHash: receipt.lineageHash,
    attemptSetPredecessor,
  });
  if (!same(rebuilt.receipt, receipt)) fail("BUNDLE_RECEIPT_REPRODUCTION_INVALID");
  const after = directorySnapshot(before.target);
  if (!sameStableStat(before.stat, after.stat)
    || !same(after.entries.map((entry) => entry.name).sort(), expectedNames)) {
    fail("DIRECTORY_CHANGED_DURING_VERIFICATION");
  }
  return { directory: before.target, directoryStat: after.stat,
    bundle: rebuilt, files };
}

export function publishAutonomousWorkOrderPrivateBundle(input = {}, options = {}) {
  exactObject(input, ["projection", "attemptSetComposition",
    "sourceBoundEnvelope", "lineage"], "BUNDLE_INPUT");
  const publication = claimedOutput(options);
  const bundle = buildBundle(input, publication);
  const payloads = payloadBytes(bundle);
  const receiptBytes = canonicalBytes(bundle.receipt);
  assertTrustedRoot(publication.trustedRoot, publication.rootStat);
  if (lstatOrNull(publication.outputDirectory)) {
    fail("OUTPUT_DIRECTORY_EXISTS_AFTER_BUILD");
  }
  const claimed = createOutputDirectory(publication);
  fsyncDirectory(publication.trustedRoot);
  for (const role of FILE_ORDER) {
    if (role === "receipt") continue;
    assertTrustedRoot(publication.trustedRoot, publication.rootStat);
    assertOutputDirectory(publication.outputDirectory, claimed);
    publishPrivateArtifact(path.join(publication.outputDirectory,
      AUTONOMOUS_WORK_ORDER_PRIVATE_FILES[role]), payloads[role], {
      trustedRoot: publication.trustedRoot,
      allowExistingIdentical: false,
    });
  }
  assertTrustedRoot(publication.trustedRoot, publication.rootStat);
  assertOutputDirectory(publication.outputDirectory, claimed);
  publishPrivateArtifact(path.join(publication.outputDirectory,
    AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.receipt), receiptBytes, {
    trustedRoot: publication.trustedRoot,
    allowExistingIdentical: false,
  });
  assertTrustedRoot(publication.trustedRoot, publication.rootStat);
  assertOutputDirectory(publication.outputDirectory, claimed);
  const checked = readBundle(publication.outputDirectory, {
    attemptSetPredecessor: publication.attemptSetPredecessor,
  });
  if (!same(checked.bundle, bundle)) fail("POST_PUBLICATION_BUNDLE_MISMATCH");
  return deepFreeze({
    ok: true,
    outputDirectory: publication.outputDirectory,
    structuralBundleVerified: true,
    receiptToActualFileByteBindingEstablished: true,
    exactFileSetEstablished: true,
    receiptWrittenLastByPublisher: true,
    receiptNotOlderThanPayloadByFilesystemMetadata: true,
    noClobber: true,
    sourceReplayVerified: false,
    trustedSourceReplayVerifierIntegrated: false,
    networkOrderEstablished: false,
    receiptHash: bundle.receipt.receiptHash,
    receiptFileSha256: checked.files.get("receipt").sha256,
    actualFiles: actualFileProjection(checked.files),
    actualFileSetHash: actualFileSetHash(checked.files),
    bundle,
    boundary: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
  });
}

function structuralFailure(error) {
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.structuralVerification,
    ok: false,
    structuralBundleVerified: false,
    receiptToActualFileByteBindingEstablished: false,
    exactFileSetEstablished: false,
    receiptNotOlderThanPayloadByFilesystemMetadata: false,
    sourceReplayVerified: false,
    trustedSourceReplayVerifierIntegrated: false,
    networkOrderEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: error instanceof Error ? error.message : String(error),
    boundary: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderPrivateBundleStructure(directory,
  { attemptSetPredecessor = null } = {}) {
  try {
    const read = readBundle(directory, { attemptSetPredecessor });
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.structuralVerification,
      ok: true,
      structuralBundleVerified: true,
      projectionStructureVerified: true,
      attemptSetStructureVerified: true,
      receiptToActualFileByteBindingEstablished: true,
      exactFileSetEstablished: true,
      receiptNotOlderThanPayloadByFilesystemMetadata: true,
      sourceReplayVerified: false,
      predecessorSourceReplayVerified: false,
      trustedSourceReplayVerifierIntegrated: false,
      externalHeadAnchorEstablished: false,
      networkOrderEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      orderIdentityHash: read.bundle.receipt.orderIdentityHash,
      workOrderHash: read.bundle.receipt.workOrderHash,
      attemptSetCompositionHash:
        read.bundle.receipt.attemptSetCompositionHash,
      sourceBoundEnvelopeHash: read.bundle.receipt.sourceBoundEnvelopeHash,
      lineageHash: read.bundle.receipt.lineageHash,
      receiptHash: read.bundle.receipt.receiptHash,
      receiptFileSha256: read.files.get("receipt").sha256,
      actualFiles: actualFileProjection(read.files),
      actualFileSetHash: actualFileSetHash(read.files),
      boundary: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
    });
  } catch (error) { return structuralFailure(error); }
}

/*
 * Deliberate stop gate.  The function first proves the local byte bundle and
 * optional caller pins, then refuses to call that result trusted replay.  It
 * takes no callback and accepts no sourceReplayVerified boolean.  Replace it
 * only with a versioned descendant that imports and executes the fixed
 * source-bound verifier over the actual source roots.
 */
export function verifyAutonomousWorkOrderPrivateBundleAgainstTrustedSources(
  directory, { expectedReceiptHash, expectedActualFileSetHash,
    attemptSetPredecessor = null } = {}) {
  const structural = verifyAutonomousWorkOrderPrivateBundleStructure(directory,
    { attemptSetPredecessor });
  if (!structural.ok) {
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.trustedVerification,
      ok: false,
      structuralBundleVerified: false,
      callerSuppliedBytePinsMatched: false,
      externalPinProvenanceEstablished: false,
      trustedSourceReplayVerifierIntegrated: false,
      sourceReplayVerified: false,
      networkOrderEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      error: structural.error,
      boundary: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
    });
  }
  try {
    hash(expectedReceiptHash, "EXPECTED_RECEIPT_HASH");
    hash(expectedActualFileSetHash, "EXPECTED_ACTUAL_FILE_SET_HASH");
    if (structural.receiptHash !== expectedReceiptHash
      || structural.actualFileSetHash !== expectedActualFileSetHash) {
      fail("CALLER_SUPPLIED_BYTE_PIN_MISMATCH");
    }
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.trustedVerification,
      ok: false,
      structuralBundleVerified: true,
      callerSuppliedBytePinsMatched: true,
      externalPinProvenanceEstablished: false,
      trustedSourceReplayVerifierIntegrated: false,
      sourceReplayVerified: false,
      predecessorSourceReplayVerified: false,
      externalHeadAnchorEstablished: false,
      networkOrderEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      receiptHash: structural.receiptHash,
      actualFileSetHash: structural.actualFileSetHash,
      error:
        "AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_TRUSTED_SOURCE_REPLAY_VERIFIER_NOT_INTEGRATED",
      boundary: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
    });
  } catch (error) {
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_SCHEMAS.trustedVerification,
      ok: false,
      structuralBundleVerified: true,
      callerSuppliedBytePinsMatched: false,
      externalPinProvenanceEstablished: false,
      trustedSourceReplayVerifierIntegrated: false,
      sourceReplayVerified: false,
      networkOrderEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      error: error instanceof Error ? error.message : String(error),
      boundary: AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
    });
  }
}
