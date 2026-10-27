/*
 * Append-only private source bundle for the Stage 1 dispute-review ledger.
 *
 * Seven role-separated opaque byte sources stay in a 0700/0600 directory.  A
 * network-safe projection exposes only role, byte length, and keyed/domain-
 * separated commitments.  Exact file hashes, filenames, the commitment key,
 * case bindings, and lifecycle details stay in the private receipt.
 *
 * Structural replay proves local bytes and their crosswalk to one structural
 * dispute-review ledger.  It never proves that the bytes came from a real
 * external account, that the account belongs to a historical participant, or
 * that a material response is true.  The trusted entrypoint is deliberately
 * NOT_INTEGRATED and accepts no callback, token, or caller-positive boolean.
 */

import { createHash, createHmac } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fsyncSync, fstatSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAutonomousWorkOrderDisputeReviewLedger,
} from "./outsider-autonomous-work-order-dispute-review.js";
import { publishPrivateArtifact } from "./outsider-private-artifact-publication.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArrayMap = Function.prototype.call.bind(Array.prototype.map);
const ArrayPush = Function.prototype.call.bind(Array.prototype.push);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferAlloc = Buffer.alloc;
const BufferEquals = Function.prototype.call.bind(Buffer.prototype.equals);
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const DateConstructor = Date;
const DateParse = Date.parse;
const DatePrototypeToISOString = Function.prototype.call.bind(
  Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HmacPrototype = Object.getPrototypeOf(createHmac("sha256", BufferAlloc(32)));
const HmacUpdate = Function.prototype.call.bind(HmacPrototype.update);
const HmacDigest = Function.prototype.call.bind(HmacPrototype.digest);
const JSONParse = JSON.parse;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const TextDecoderConstructor = TextDecoder;
const TypeErrorConstructor = TypeError;

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const CASE_ALIAS = /^case_[a-f0-9]{32}$/u;
const PARTICIPANT_ALIAS = /^participant_[a-f0-9]{32}$/u;
const BUNDLE_DIRECTORY_ALIAS = /^bundle_[a-f0-9]{32}$/u;
const MAX_RAW_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_RAW_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_TREE_NODES = 100_000;
const MAX_TREE_KEYS = 250_000;
const FILE_TYPE_MASK = 0o170000n;
const DIRECTORY_TYPE = 0o040000n;
const REGULAR_FILE_TYPE = 0o100000n;
const SYMBOLIC_LINK_TYPE = 0o120000n;

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS
  = ObjectFreeze({
    networkProjection:
      "outsider/autonomous-work-order-dispute-review-source-network-projection/v1",
    privateReceipt:
      "outsider/autonomous-work-order-dispute-review-private-source-receipt/v1",
    structuralVerification:
      "outsider/autonomous-work-order-dispute-review-source-structural-verification/v1",
    trustedReplayDescendant:
      "outsider/autonomous-work-order-dispute-review-trusted-replay-descendant/v1",
  });

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES = ObjectFreeze([
  "HISTORICAL_CASE_MANIFEST",
  "RECONSTRUCTION_PACKET",
  "EXTERNAL_CHANNEL_INVITATION",
  "EXTERNAL_CHANNEL_RESPONSE",
  "RIGHTS_EVIDENCE",
  "PRIVACY_EVIDENCE",
  "LIFECYCLE_EVIDENCE",
]);

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES
  = ObjectFreeze({
    historicalCaseManifest: "historical-case-manifest.bytes",
    reconstructionPacket: "reconstruction-packet.bytes",
    externalChannelInvitation: "external-channel-invitation.bytes",
    externalChannelResponse: "external-channel-response.bytes",
    rightsEvidence: "rights-evidence.bytes",
    privacyEvidence: "privacy-evidence.bytes",
    lifecycleEvidence: "lifecycle-evidence.bytes",
    commitmentKey: "commitment-key.bytes",
    networkProjection: "network-safe-projection.json",
    receipt: "run-receipt.json",
  });

const FILE_ROLES = ObjectFreeze([
  "historicalCaseManifest", "reconstructionPacket", "externalChannelInvitation",
  "externalChannelResponse", "rightsEvidence", "privacyEvidence",
  "lifecycleEvidence", "commitmentKey", "networkProjection", "receipt",
]);

const SOURCE_FILE_ROLE = ObjectFreeze({
  HISTORICAL_CASE_MANIFEST: "historicalCaseManifest",
  RECONSTRUCTION_PACKET: "reconstructionPacket",
  EXTERNAL_CHANNEL_INVITATION: "externalChannelInvitation",
  EXTERNAL_CHANNEL_RESPONSE: "externalChannelResponse",
  RIGHTS_EVIDENCE: "rightsEvidence",
  PRIVACY_EVIDENCE: "privacyEvidence",
  LIFECYCLE_EVIDENCE: "lifecycleEvidence",
});

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY
  = deepFreeze({
    position:
      "PRIVATE_STAGE1_DISPUTE_REVIEW_SOURCE_BYTES_NOT_EXTERNAL_FACT_OR_AUTHORITY",
    appendOnlyVersionedPrivateBundleOnly: true,
    expectedDirectoryMode: "0700",
    expectedFileMode: "0600",
    exactFileAllowlistRequired: true,
    fixedFileCount: 10,
    noClobberRequired: true,
    receiptWrittenLastRequired: true,
    cooperativeSinglePublisherAssumed: true,
    atomicWholeDirectoryPublicationEstablished: false,
    sameUserConcurrentMutationOrParentReplacementResistanceEstablished: false,
    symlinksAllowed: false,
    hardlinksAllowed: false,
    regularFilesOnly: true,
    partialFailureMayLeaveTerminalTombstoneDirectory: true,
    partialPublicationResumeAllowed: false,
    networkProjectionContainsOnlyRoleLengthAndDomainCommitments: true,
    networkProjectionContainsExactFileHashes: false,
    networkProjectionContainsFilenamesOrPaths: false,
    networkProjectionContainsUrls: false,
    networkProjectionContainsRawBytes: false,
    networkProjectionContainsPiiOrStableAccountOrKeyIdentifiers: false,
    exactFileHashesRemainPrivate: true,
    commitmentKeyRemainsPrivate: true,
    commitmentKeyEntropyProvenanceVerified: false,
    filesystemMetadataPrivacyEstablished: false,
    receiptRecordedAtExternalTimeEstablished: false,
    retentionControlledRawVaultSeparated: false,
    purgeTombstoneDescendantIntegrated: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    retentionPermissionCurrent: false,
    sourceRoleByteReplayVerifiedByStructuralCheck: true,
    sourceRoleMeaningOrExternalProvenanceVerified: false,
    historicalManifestListedObjectBytesReplayed: false,
    freshSessionOrKeyControlVerified: false,
    externalAccountOrChannelContinuityVerified: false,
    directHistoricalParticipationVerified: false,
    exactMaterialResponseSemanticsVerified: false,
    localSignatureOrCallerPinCanVerifyExternalRelationship: false,
    selfAttestationCanVerifyLegalIdentityOrStanding: false,
    participantLegalIdentityVerified: false,
    participantStandingVerified: false,
    actualPastCaseSourceReplayVerified: false,
    independentExternalProvenancePinVerified: false,
    externalLifecycleHeadVerified: false,
    fullAncestryReplayVerified: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    ledgerRecordedWithdrawalOrRetractionCanBeResurrectedByThisSidecar: false,
    opaqueLifecycleBytesAloneCanBlockResurrection: false,
    withdrawalOrRetractionDeletesHistoricalOccurrence: false,
    purgeProvesRemoteCopyDeletion: false,
    occurrenceCensusCanBeReducedByObjectHashEquality: false,
    callbackTokenOrCallerBooleanAcceptedAsTrust: false,
    createsIdentity: false,
    createsEpisodeOrAttempt: false,
    independentOutcomeEstablished: false,
    recoveryEstablished: false,
    adoptionEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    disposition: "QUARANTINED",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    custodyEstablished: false,
    moneyMovementEnabled: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsInsurance: false,
    permitsSettlement: false,
  });

function fail(code, detail = null) {
  throw new TypeErrorConstructor(detail === null
    ? `AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_${code}`
    : `AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_${code}:${detail}`);
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
  if (value === null || typeof value !== "object" || BufferIsBuffer(value)) return;
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
    || BufferIsBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) fail(`${code}_OBJECT_INVALID`);
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
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
  const milliseconds = DateParse(value);
  if (!NumberIsSafeInteger(milliseconds)
    || DatePrototypeToISOString(new DateConstructor(milliseconds)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function alias(value, expression, code) {
  if (typeof value !== "string" || !RegExpTest(expression, value)) fail(`${code}_INVALID`);
  return value;
}

function exactInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
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

function sha256(bytes) {
  const state = createHash("sha256");
  HashUpdate(state, bytes);
  return `sha256:${HashDigest(state, "hex")}`;
}

function keyedCommitment(key, domain, context, ...byteParts) {
  const state = createHmac("sha256", key);
  HmacUpdate(state,
    `${domain}\0${canonicalizeStrict(context)}\0parts:${byteParts.length}\0`,
    "utf8");
  for (let index = 0; index < byteParts.length; index += 1) {
    HmacUpdate(state, `part:${index}:length:${byteParts[index].length}\0`, "utf8");
    HmacUpdate(state, byteParts[index]);
  }
  return `sha256:${HmacDigest(state, "hex")}`;
}

function canonicalBytes(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function sourceBytes(value) {
  exactObject(value, ["historicalCaseManifest", "reconstructionPacket",
    "externalChannelInvitation", "externalChannelResponse", "rightsEvidence",
    "privacyEvidence", "lifecycleEvidence"], "SOURCE_BYTES");
  const result = {};
  let total = 0;
  for (let index = 0;
    index < AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES.length;
    index += 1) {
    const role = AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES[index];
    const fileRole = SOURCE_FILE_ROLE[role];
    const bytes = value[fileRole];
    if (!BufferIsBuffer(bytes) || isProxy(bytes) || bytes.length < 1
      || bytes.length > MAX_RAW_BYTES) fail(`SOURCE_BYTES_${role}_INVALID`);
    total += bytes.length;
    if (total > MAX_TOTAL_RAW_BYTES) fail("SOURCE_BYTES_TOTAL_BUDGET_EXCEEDED");
    result[fileRole] = BufferFrom(bytes);
  }
  return result;
}

function bindingContext(value) {
  exactObject(value, ["bundleRevision", "caseScopedAlias",
    "caseScopedParticipantAlias", "workOrderHash", "episodeHash",
    "attemptSetCompositionHash", "reconstructionHash", "purposeHash",
    "audienceHash", "invitationOccurrenceIdentityHash",
    "responseOccurrenceIdentityHash", "challengeNonceCommitmentHash"],
  "BINDING_CONTEXT");
  return {
    bundleRevision: exactInteger(value.bundleRevision, 0, Number.MAX_SAFE_INTEGER,
      "BUNDLE_REVISION"),
    caseScopedAlias: alias(value.caseScopedAlias, CASE_ALIAS, "CASE_SCOPED_ALIAS"),
    caseScopedParticipantAlias: alias(value.caseScopedParticipantAlias,
      PARTICIPANT_ALIAS, "CASE_SCOPED_PARTICIPANT_ALIAS"),
    workOrderHash: hash(value.workOrderHash, "BINDING_WORK_ORDER_HASH"),
    episodeHash: hash(value.episodeHash, "BINDING_EPISODE_HASH"),
    attemptSetCompositionHash: hash(value.attemptSetCompositionHash,
      "BINDING_ATTEMPT_SET_COMPOSITION_HASH"),
    reconstructionHash: hash(value.reconstructionHash,
      "BINDING_RECONSTRUCTION_HASH"),
    purposeHash: hash(value.purposeHash, "BINDING_PURPOSE_HASH"),
    audienceHash: hash(value.audienceHash, "BINDING_AUDIENCE_HASH"),
    invitationOccurrenceIdentityHash: hash(value.invitationOccurrenceIdentityHash,
      "INVITATION_OCCURRENCE_IDENTITY_HASH"),
    responseOccurrenceIdentityHash: hash(value.responseOccurrenceIdentityHash,
      "RESPONSE_OCCURRENCE_IDENTITY_HASH"),
    challengeNonceCommitmentHash: hash(value.challengeNonceCommitmentHash,
      "CHALLENGE_NONCE_COMMITMENT_HASH"),
  };
}

function commitmentKey(value) {
  if (!BufferIsBuffer(value) || isProxy(value) || value.length !== 32) {
    fail("COMMITMENT_KEY_MUST_BE_PRIVATE_32_BYTES");
  }
  let nonzero = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) nonzero = true;
  }
  if (!nonzero) fail("ALL_ZERO_COMMITMENT_KEY_FORBIDDEN");
  return BufferFrom(value);
}

function deriveInternal(input) {
  rejectTree(input);
  exactObject(input, ["bindingContext", "sourceBytes", "commitmentKey"],
    "DERIVATION_INPUT");
  const context = bindingContext(input.bindingContext);
  const sources = sourceBytes(input.sourceBytes);
  const key = commitmentKey(input.commitmentKey);
  const effectiveContext = {
    ...context,
    reviewPacketHash: sha256(sources.reconstructionPacket),
  };
  const stableOccurrenceContext = {
    caseScopedAlias: context.caseScopedAlias,
    caseScopedParticipantAlias: context.caseScopedParticipantAlias,
    workOrderHash: context.workOrderHash,
    episodeHash: context.episodeHash,
    attemptSetCompositionHash: context.attemptSetCompositionHash,
    reconstructionHash: context.reconstructionHash,
    reviewPacketHash: effectiveContext.reviewPacketHash,
    purposeHash: context.purposeHash,
    audienceHash: context.audienceHash,
    invitationOccurrenceIdentityHash: context.invitationOccurrenceIdentityHash,
    responseOccurrenceIdentityHash: context.responseOccurrenceIdentityHash,
    challengeNonceCommitmentHash: context.challengeNonceCommitmentHash,
  };
  const sourceRoleProjections = [];
  const privateSourceMetadata = [];
  for (let index = 0;
    index < AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES.length;
    index += 1) {
    const role = AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES[index];
    const fileRole = SOURCE_FILE_ROLE[role];
    const bytes = sources[fileRole];
    const domainCommitmentHash = keyedCommitment(key,
      "outsider.dispute-review.private-source-role.v1",
      { role, ...effectiveContext }, bytes);
    ArrayPush(sourceRoleProjections, { role, byteLength: bytes.length,
      domainCommitmentHash });
    ArrayPush(privateSourceMetadata, { role, fileRole, byteLength: bytes.length,
      exactSha256: sha256(bytes), domainCommitmentHash });
  }
  const projectionWithoutRoot = {
    schema:
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.networkProjection,
    schemaVersion: "1.0.0",
    projectionClass: "ROLE_LENGTH_AND_KEYED_DOMAIN_COMMITMENTS_ONLY_HOLD",
    bundleRevision: context.bundleRevision,
    sourceRoles: sourceRoleProjections,
    rawBytesIncluded: false,
    exactFileHashesIncluded: false,
    filenamesOrPathsIncluded: false,
    urlsIncluded: false,
    piiAccountOrKeyIdentifiersIncluded: false,
    commitmentKeyIncluded: false,
    sourceMeaningOrExternalProvenanceEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
  const privateBundleRootCommitment = keyedCommitment(key,
    "outsider.dispute-review.private-source-bundle-root.v1", effectiveContext,
    canonicalBytes(projectionWithoutRoot));
  const projectionBody = { ...projectionWithoutRoot, privateBundleRootCommitment };
  const networkProjection = deepFreeze({
    ...projectionBody,
    projectionHash: digest(
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.networkProjection,
      projectionBody),
  });
  const historical = sources.historicalCaseManifest;
  const invitation = sources.externalChannelInvitation;
  const response = sources.externalChannelResponse;
  const privateLedgerBindings = deepFreeze({
    privateBundleRootCommitment,
    reviewPacketHash: effectiveContext.reviewPacketHash,
    suppliedPrivateInvitationObjectCommitmentHash: keyedCommitment(key,
      "outsider.dispute-review.invitation-object.v1", stableOccurrenceContext,
      invitation),
    suppliedPrivateResponseObjectCommitmentHash: keyedCommitment(key,
      "outsider.dispute-review.response-object.v1", stableOccurrenceContext,
      response),
    sourceChannelContinuityCommitmentHash: keyedCommitment(key,
      "outsider.dispute-review.channel-continuity.v1", stableOccurrenceContext,
      historical, invitation, response),
    directParticipationLinkCommitmentHash: keyedCommitment(key,
      "outsider.dispute-review.direct-participation.v1", stableOccurrenceContext,
      historical, invitation, response),
    rightsReviewRootCommitment: keyedCommitment(key,
      "outsider.dispute-review.rights-review.v1", stableOccurrenceContext,
      sources.rightsEvidence),
    privacyReviewRootCommitment: keyedCommitment(key,
      "outsider.dispute-review.privacy-review.v1", stableOccurrenceContext,
      sources.privacyEvidence),
    lifecycleEvidenceRootCommitment: keyedCommitment(key,
      "outsider.dispute-review.lifecycle-evidence.v1", stableOccurrenceContext,
      sources.lifecycleEvidence),
  });
  return { context, sources, key, networkProjection, privateSourceMetadata,
    privateLedgerBindings };
}

export function deriveAutonomousWorkOrderDisputeReviewPrivateSourceProjection(
  input = {}) {
  const derived = deriveInternal(input);
  return deepFreeze({
    networkProjection: derived.networkProjection,
    privateLedgerBindings: derived.privateLedgerBindings,
    boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY,
  });
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

function isDirectoryStat(value) {
  return Boolean(value && (value.mode & FILE_TYPE_MASK) === DIRECTORY_TYPE);
}

function isRegularFileStat(value) {
  return Boolean(value && (value.mode & FILE_TYPE_MASK) === REGULAR_FILE_TYPE);
}

function isSymbolicLinkStat(value) {
  return Boolean(value && (value.mode & FILE_TYPE_MASK) === SYMBOLIC_LINK_TYPE);
}

function sameStableStat(left, right) {
  return sameNode(left, right) && left.mode === right.mode && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
    && left.nlink === right.nlink;
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    if (!isDirectoryStat(fstatSync(descriptor, { bigint: true }))) {
      fail("FSYNC_DIRECTORY_INVALID");
    }
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function claimPublication(options) {
  rejectTree(options);
  exactObject(options, ["trustedRoot", "outputDirectory", "expectedLedgerHash",
    "expectedNetworkProjectionHash", "expectedPrivateBundleRootCommitment",
    "predecessorBundleDirectory", "expectedPredecessorReceiptHash"],
  "PUBLICATION_OPTIONS");
  if (typeof options.trustedRoot !== "string"
    || typeof options.outputDirectory !== "string") fail("PUBLICATION_PATH_INVALID");
  const trustedRoot = path.resolve(options.trustedRoot);
  const outputDirectory = path.resolve(options.outputDirectory);
  const rootStat = lstatOrNull(trustedRoot);
  if (trustedRoot === path.parse(trustedRoot).root || !rootStat
    || isSymbolicLinkStat(rootStat) || !isDirectoryStat(rootStat)
    || (rootStat.mode & 0o7777n) !== 0o700n) fail("TRUSTED_ROOT_INVALID");
  if (path.dirname(outputDirectory) !== trustedRoot || outputDirectory === trustedRoot) {
    fail("OUTPUT_MUST_BE_NEW_DIRECT_CHILD");
  }
  if (!RegExpTest(BUNDLE_DIRECTORY_ALIAS, path.basename(outputDirectory))) {
    fail("OUTPUT_DIRECTORY_ALIAS_NOT_OPAQUE");
  }
  if (lstatOrNull(outputDirectory)) fail("OUTPUT_DIRECTORY_EXISTS");
  const predecessorBundleDirectory = options.predecessorBundleDirectory;
  const expectedPredecessorReceiptHash = options.expectedPredecessorReceiptHash;
  if ((predecessorBundleDirectory === null) !== (expectedPredecessorReceiptHash === null)) {
    fail("PREDECESSOR_BUNDLE_PATH_AND_PIN_MUST_COINCIDE");
  }
  if (predecessorBundleDirectory !== null
    && typeof predecessorBundleDirectory !== "string") fail("PREDECESSOR_PATH_INVALID");
  return {
    trustedRoot, outputDirectory, rootStat,
    expectedLedgerHash: hash(options.expectedLedgerHash, "EXPECTED_LEDGER_HASH"),
    expectedNetworkProjectionHash: hash(options.expectedNetworkProjectionHash,
      "EXPECTED_NETWORK_PROJECTION_HASH"),
    expectedPrivateBundleRootCommitment: hash(
      options.expectedPrivateBundleRootCommitment,
      "EXPECTED_PRIVATE_BUNDLE_ROOT_COMMITMENT"),
    predecessorBundleDirectory: predecessorBundleDirectory === null ? null
      : path.resolve(predecessorBundleDirectory),
    expectedPredecessorReceiptHash: expectedPredecessorReceiptHash === null ? null
      : hash(expectedPredecessorReceiptHash, "EXPECTED_PREDECESSOR_RECEIPT_HASH"),
  };
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
    const stat = fstatSync(descriptor, { bigint: true });
    if (!isDirectoryStat(stat) || (stat.mode & 0o7777n) !== 0o700n) {
      fail("OUTPUT_DIRECTORY_INVALID");
    }
    return stat;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function assertRoot(publication) {
  const current = lstatOrNull(publication.trustedRoot);
  if (!current || isSymbolicLinkStat(current) || !isDirectoryStat(current)
    || !sameNode(current, publication.rootStat)
    || current.mode !== publication.rootStat.mode) fail("TRUSTED_ROOT_CHANGED");
}

function assertOutput(publication, stat) {
  const current = lstatOrNull(publication.outputDirectory);
  if (!current || isSymbolicLinkStat(current) || !isDirectoryStat(current)
    || !sameNode(current, stat) || (current.mode & 0o7777n) !== 0o700n) {
    fail("OUTPUT_DIRECTORY_CHANGED");
  }
}

function verifyLedger(ledger, predecessor, expectedLedgerHash) {
  const checked = verifyAutonomousWorkOrderDisputeReviewLedger(ledger, {
    predecessor,
    expectedLedgerHash,
    expectedPredecessorLedgerHash: predecessor === null ? null : predecessor.ledgerHash,
    allowUnreplayedDescendantAsSuppliedPredecessor: false,
  });
  if (!checked.ok || checked.structuralLedgerVerified !== true
    || checked.stage1ExternalFactGateSatisfied !== false) {
    fail("DISPUTE_REVIEW_LEDGER_INVALID", checked.error ?? "INVALID");
  }
}

function findOccurrence(ledger, identityHash) {
  for (let index = 0; index < ledger.reviewOccurrences.length; index += 1) {
    if (ledger.reviewOccurrences[index].occurrenceIdentityHash === identityHash) {
      return ledger.reviewOccurrences[index];
    }
  }
  return null;
}

function invalidationFor(ledger, responseIdentityHash) {
  let result = null;
  for (let index = 0; index < ledger.reviewOccurrences.length; index += 1) {
    const row = ledger.reviewOccurrences[index];
    if ((row.kind === "WITHDRAWAL" || row.kind === "RETRACTION")
      && row.respondsToOccurrenceIdentityHash === responseIdentityHash) result = row.kind;
  }
  return result;
}

function lifecycleDisposition(value, ledger, responseIdentityHash) {
  const allowed = ["CURRENT", "PURGED", "RETRACTED", "WITHDRAWN"];
  let valid = false;
  for (let index = 0; index < allowed.length; index += 1) {
    if (allowed[index] === value) valid = true;
  }
  if (!valid) fail("LIFECYCLE_DISPOSITION_INVALID");
  if (value === "PURGED") {
    fail("PURGED_REQUIRES_RAW_UNAVAILABLE_TOMBSTONE_DESCENDANT_NOT_THIS_BUNDLE");
  }
  const invalidation = invalidationFor(ledger, responseIdentityHash);
  if (invalidation === "WITHDRAWAL" && value !== "WITHDRAWN") {
    fail("WITHDRAWN_RESPONSE_CANNOT_BE_RESURRECTED_BY_SIDECAR");
  }
  if (invalidation === "RETRACTION" && value !== "RETRACTED") {
    fail("RETRACTED_RESPONSE_CANNOT_BE_RESURRECTED_BY_SIDECAR");
  }
  if (invalidation === null && (value === "WITHDRAWN" || value === "RETRACTED")) {
    fail("LIFECYCLE_DISPOSITION_NOT_IN_LEDGER");
  }
  return value;
}

function crosswalkLedger(ledger, derived, lifecycle) {
  const context = derived.context;
  const bindings = derived.privateLedgerBindings;
  if (ledger.appendOnlyLineage.revision !== context.bundleRevision
    || ledger.caseBinding.caseScopedAlias !== context.caseScopedAlias
    || ledger.caseBinding.workOrderHash !== context.workOrderHash
    || ledger.caseBinding.episodeHash !== context.episodeHash
    || ledger.caseBinding.attemptSetCompositionHash
      !== context.attemptSetCompositionHash
    || ledger.caseBinding.reconstructionHash !== context.reconstructionHash
    || ledger.caseBinding.purposeHash !== context.purposeHash
    || ledger.caseBinding.audienceHash !== context.audienceHash
    || ledger.caseBinding.privateBundleRootCommitment
      !== bindings.privateBundleRootCommitment
    || ledger.caseBinding.reviewPacketHash !== bindings.reviewPacketHash
    || ledger.caseBinding.rightsReviewRootCommitment
      !== bindings.rightsReviewRootCommitment
    || ledger.caseBinding.privacyReviewRootCommitment
      !== bindings.privacyReviewRootCommitment) fail("LEDGER_CASE_BINDING_CROSSWALK_INVALID");
  const response = findOccurrence(ledger, context.responseOccurrenceIdentityHash);
  const invitation = findOccurrence(ledger, context.invitationOccurrenceIdentityHash);
  if (!response || response.kind !== "RESPONSE"
    || !invitation || invitation.kind !== "INVITATION"
    || response.respondsToOccurrenceIdentityHash !== invitation.occurrenceIdentityHash
    || response.caseScopedParticipantAlias !== context.caseScopedParticipantAlias
    || invitation.caseScopedParticipantAlias !== context.caseScopedParticipantAlias
    || response.reviewPacketHash !== ledger.caseBinding.reviewPacketHash
    || response.reconstructionHash !== ledger.caseBinding.reconstructionHash
    || invitation.reviewPacketHash !== ledger.caseBinding.reviewPacketHash
    || invitation.reconstructionHash !== ledger.caseBinding.reconstructionHash
    || response.challengeNonceCommitmentHash !== context.challengeNonceCommitmentHash
    || invitation.challengeNonceCommitmentHash !== context.challengeNonceCommitmentHash
    || invitation.suppliedPrivateObjectCommitmentHash
      !== bindings.suppliedPrivateInvitationObjectCommitmentHash
    || response.suppliedPrivateObjectCommitmentHash
      !== bindings.suppliedPrivateResponseObjectCommitmentHash
    || response.sourceChannelContinuityCommitmentHash
      !== bindings.sourceChannelContinuityCommitmentHash
    || response.directParticipationLinkCommitmentHash
      !== bindings.directParticipationLinkCommitmentHash) {
    fail("LEDGER_RESPONSE_BINDING_CROSSWALK_INVALID");
  }
  lifecycleDisposition(lifecycle, ledger, response.occurrenceIdentityHash);
  if (lifecycle === "CURRENT"
    && (invalidationFor(ledger, response.occurrenceIdentityHash) !== null
      || response.responseArrivedAfterTimeout !== false
      || ledger.currentCandidateState.activeMaterialCorrectionsRequiredOccurrenceCount !== 0)) {
    fail("CURRENT_RESPONSE_NOT_CURRENT_OR_FRESH_FOR_STRUCTURAL_CANDIDATE");
  }
  return response;
}

function publicationManifest(derived) {
  const sourceByFileRole = {};
  for (let index = 0; index < derived.privateSourceMetadata.length; index += 1) {
    const row = derived.privateSourceMetadata[index];
    sourceByFileRole[row.fileRole] = row;
  }
  const files = [];
  for (let index = 0; index < FILE_ROLES.length; index += 1) {
    const fileRole = FILE_ROLES[index];
    if (fileRole === "receipt") {
      ArrayPush(files, { fileRole, fileName:
        AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[fileRole],
      serialization: "CANONICAL_JSON_LF", byteLength: null, exactSha256: null,
      domainCommitmentHash: null, boundByReceipt: false });
    } else if (fileRole === "networkProjection") {
      const bytes = canonicalBytes(derived.networkProjection);
      ArrayPush(files, { fileRole, fileName:
        AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[fileRole],
      serialization: "CANONICAL_JSON_LF", byteLength: bytes.length,
      exactSha256: sha256(bytes), domainCommitmentHash: null,
      boundByReceipt: true });
    } else if (fileRole === "commitmentKey") {
      ArrayPush(files, { fileRole, fileName:
        AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[fileRole],
      serialization: "RAW_PRIVATE_BYTES", byteLength: derived.key.length,
      exactSha256: sha256(derived.key), domainCommitmentHash: null,
      boundByReceipt: true });
    } else {
      const row = sourceByFileRole[fileRole];
      ArrayPush(files, { fileRole, fileName:
        AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[fileRole],
      serialization: "OPAQUE_PRIVATE_SOURCE_BYTES", byteLength: row.byteLength,
      exactSha256: row.exactSha256,
      domainCommitmentHash: row.domainCommitmentHash,
      boundByReceipt: true });
    }
  }
  return {
    expectedDirectoryMode: "0700", expectedFileMode: "0600",
    exactFileAllowlistRequired: true, extraFilesAllowed: false,
    regularFilesOnly: true, symlinksAllowed: false, hardlinksAllowed: false,
    noClobber: true, allowExistingIdentical: false,
    publicationOrder: ArrayMap(FILE_ROLES, (role) =>
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[role]),
    receiptWrittenLast: true, files,
  };
}

function receiptFor(ledger, derived, response, lifecycle, predecessorReceipt) {
  const body = {
    schema:
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.privateReceipt,
    schemaVersion: "1.0.0",
    receiptClass:
      "PRIVATE_ROLE_SEPARATED_SOURCE_BYTE_RECEIPT_EXTERNAL_PROVENANCE_NOT_INTEGRATED",
    recordedAt: ledger.recordedAt,
    privateSourceLineage: {
      revision: ledger.appendOnlyLineage.revision,
      predecessorReceiptHash: predecessorReceipt?.receiptHash ?? null,
      supersedesReceiptHash: predecessorReceipt?.receiptHash ?? null,
      callerSuppliedImmediatePredecessorReplayed: predecessorReceipt !== null,
      fullAncestryReplayVerified: false,
      externalLifecycleHeadVerified: false,
      parallelGenesisExclusionEstablished: false,
      forkExclusionEstablished: false,
    },
    ledgerBinding: {
      ledgerHash: ledger.ledgerHash,
      caseScopedAlias: ledger.caseBinding.caseScopedAlias,
      workOrderHash: ledger.caseBinding.workOrderHash,
      episodeHash: ledger.caseBinding.episodeHash,
      attemptSetCompositionHash: ledger.caseBinding.attemptSetCompositionHash,
      reconstructionHash: ledger.caseBinding.reconstructionHash,
      reviewPacketHash: ledger.caseBinding.reviewPacketHash,
      purposeHash: ledger.caseBinding.purposeHash,
      audienceHash: ledger.caseBinding.audienceHash,
      invitationOccurrenceIdentityHash:
        response.respondsToOccurrenceIdentityHash,
      responseOccurrenceIdentityHash: response.occurrenceIdentityHash,
      caseScopedParticipantAlias: response.caseScopedParticipantAlias,
      responseVerdict: response.responseVerdict,
      challengeNonceCommitmentHash: response.challengeNonceCommitmentHash,
    },
    privateLedgerBindings: derived.privateLedgerBindings,
    callerDeclaredLifecycleDisposition: lifecycle,
    structurallyCurrentPositiveCandidateOnly:
      lifecycle === "CURRENT" && response.responseVerdict === "YES_WOULD_HAVE_CHANGED"
      && ledger.currentCandidateState.activeMaterialCorrectionsRequiredOccurrenceCount === 0
      && ledger.currentCandidateState.activePositiveMaterialResponseOccurrenceCount > 0,
    reviewOccurrenceCensus: {
      reviewOccurrenceCount: ledger.reviewOccurrenceCensus.reviewOccurrenceCount,
      countsByKind: ledger.reviewOccurrenceCensus.countsByKind,
      countsByVerdict: ledger.reviewOccurrenceCensus.countsByVerdict,
      distinctSuppliedPrivateObjectCommitmentHashCount:
        ledger.suppliedPrivateObjectCommitmentEqualityView
          .distinctSuppliedPrivateObjectCommitmentHashCount,
      objectHashEqualityCanReduceOccurrenceDenominator: false,
    },
    networkProjectionHash: derived.networkProjection.projectionHash,
    privateSourceRoleBytesReplayed: true,
    callerDesignatedExternalChannelResponseRoleBytesPresent: true,
    sourceRoleMeaningOrExternalProvenanceVerified: false,
    freshChallengeControlReplayed: false,
    externalChannelContinuityReplayed: false,
    sourceLinkedDirectParticipationClaimReplayed: false,
    exactMaterialDeltaReplayed: false,
    freshSessionOrKeyControlVerified: false,
    externalAccountOrChannelContinuityVerified: false,
    directHistoricalParticipationVerified: false,
    exactMaterialResponseSemanticsVerified: false,
    actualPastCaseSourceReplayVerified: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    retentionPermissionCurrent: false,
    externalLifecycleHeadVerified: false,
    stage1ExternalFactGateSatisfied: false,
    disposition: "QUARANTINED",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    publication: publicationManifest(derived),
    boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY,
  };
  return deepFreeze({ ...body, receiptHash: digest(
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.privateReceipt,
    body) });
}

function directorySnapshot(directory) {
  const target = path.resolve(directory);
  if (target === path.parse(target).root) fail("DIRECTORY_TOO_BROAD");
  const initial = lstatOrNull(target);
  if (!initial || isSymbolicLinkStat(initial) || !isDirectoryStat(initial)
    || (initial.mode & 0o7777n) !== 0o700n) fail("DIRECTORY_INVALID");
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!isDirectoryStat(before) || !sameStableStat(initial, before)) {
      fail("DIRECTORY_IDENTITY_CHANGED");
    }
    const entries = readdirSync(target);
    const after = fstatSync(descriptor, { bigint: true });
    const final = lstatOrNull(target);
    if (!final || !sameStableStat(before, after) || !sameStableStat(before, final)) {
      fail("DIRECTORY_CHANGED_DURING_READ");
    }
    return { target, stat: after, entries };
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function readPrivateFile(directory, fileName, maximum = MAX_RAW_BYTES) {
  if (path.basename(fileName) !== fileName) fail("FILE_NAME_INVALID");
  const target = path.join(directory, fileName);
  const initial = lstatOrNull(target);
  if (!initial || isSymbolicLinkStat(initial) || !isRegularFileStat(initial)
    || (initial.mode & 0o7777n) !== 0o600n || initial.nlink !== 1n
    || initial.size < 1n || initial.size > BigInt(maximum)) fail("FILE_INVALID", fileName);
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!isRegularFileStat(before) || !sameStableStat(initial, before)) {
      fail("FILE_IDENTITY_CHANGED", fileName);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const final = lstatOrNull(target);
    if (!final || !sameStableStat(before, after) || !sameStableStat(before, final)
      || BigInt(bytes.length) !== after.size) fail("FILE_CHANGED_DURING_READ", fileName);
    return { bytes, stat: after, exactSha256: sha256(bytes) };
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function parseCanonical(file, code) {
  let value;
  try {
    value = JSONParse(new TextDecoderConstructor("utf-8", { fatal: true })
      .decode(file.bytes));
  } catch { fail(`${code}_JSON_INVALID`); }
  if (!BufferEquals(canonicalBytes(value), file.bytes)) {
    fail(`${code}_CANONICAL_BYTES_INVALID`);
  }
  return value;
}

function exactNetworkProjection(value) {
  exactObject(value, ["schema", "schemaVersion", "projectionClass",
    "bundleRevision", "sourceRoles", "rawBytesIncluded",
    "exactFileHashesIncluded", "filenamesOrPathsIncluded", "urlsIncluded",
    "piiAccountOrKeyIdentifiersIncluded", "commitmentKeyIncluded",
    "sourceMeaningOrExternalProvenanceEstablished",
    "stage1ExternalFactGateSatisfied", "decisionState", "authority",
    "privateBundleRootCommitment", "projectionHash"], "NETWORK_PROJECTION");
  if (value.schema
      !== AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.networkProjection
    || value.schemaVersion !== "1.0.0"
    || value.projectionClass !== "ROLE_LENGTH_AND_KEYED_DOMAIN_COMMITMENTS_ONLY_HOLD"
    || !ArrayIsArray(value.sourceRoles)
    || value.sourceRoles.length
      !== AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES.length
    || value.rawBytesIncluded !== false || value.exactFileHashesIncluded !== false
    || value.filenamesOrPathsIncluded !== false || value.urlsIncluded !== false
    || value.piiAccountOrKeyIdentifiersIncluded !== false
    || value.commitmentKeyIncluded !== false
    || value.sourceMeaningOrExternalProvenanceEstablished !== false
    || value.stage1ExternalFactGateSatisfied !== false
    || value.decisionState !== "HOLD" || value.authority !== "NONE") {
    fail("NETWORK_PROJECTION_STATE_INVALID");
  }
  for (let index = 0;
    index < AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES.length;
    index += 1) {
    exactObject(value.sourceRoles[index], ["role", "byteLength",
      "domainCommitmentHash"], "NETWORK_SOURCE_ROLE");
    if (value.sourceRoles[index].role
      !== AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES[index]) {
      fail("NETWORK_SOURCE_ROLE_ORDER_INVALID");
    }
    exactInteger(value.sourceRoles[index].byteLength, 1, MAX_RAW_BYTES,
      "NETWORK_SOURCE_ROLE_BYTE_LENGTH");
    hash(value.sourceRoles[index].domainCommitmentHash,
      "NETWORK_SOURCE_ROLE_COMMITMENT");
  }
  hash(value.privateBundleRootCommitment, "PRIVATE_BUNDLE_ROOT_COMMITMENT");
  const { projectionHash, ...body } = value;
  if (projectionHash !== digest(
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.networkProjection,
    body)) fail("NETWORK_PROJECTION_HASH_INVALID");
}

function exactReceipt(value) {
  exactObject(value, ["schema", "schemaVersion", "receiptClass", "recordedAt",
    "privateSourceLineage", "ledgerBinding", "privateLedgerBindings",
    "callerDeclaredLifecycleDisposition",
    "structurallyCurrentPositiveCandidateOnly",
    "reviewOccurrenceCensus", "networkProjectionHash",
    "privateSourceRoleBytesReplayed",
    "callerDesignatedExternalChannelResponseRoleBytesPresent",
    "sourceRoleMeaningOrExternalProvenanceVerified",
    "freshChallengeControlReplayed", "externalChannelContinuityReplayed",
    "sourceLinkedDirectParticipationClaimReplayed", "exactMaterialDeltaReplayed",
    "freshSessionOrKeyControlVerified",
    "externalAccountOrChannelContinuityVerified",
    "directHistoricalParticipationVerified",
    "exactMaterialResponseSemanticsVerified",
    "actualPastCaseSourceReplayVerified", "rightsClearanceEstablished",
    "privacyClearanceEstablished", "retentionPermissionCurrent",
    "externalLifecycleHeadVerified",
    "stage1ExternalFactGateSatisfied", "disposition", "decisionState",
    "authority", "actionReady", "executable", "publication", "boundary",
    "receiptHash"], "PRIVATE_RECEIPT");
  timestamp(value.recordedAt, "RECEIPT_RECORDED_AT");
  exactObject(value.privateSourceLineage, ["revision", "predecessorReceiptHash",
    "supersedesReceiptHash", "callerSuppliedImmediatePredecessorReplayed",
    "fullAncestryReplayVerified", "externalLifecycleHeadVerified",
    "parallelGenesisExclusionEstablished", "forkExclusionEstablished"],
  "PRIVATE_SOURCE_LINEAGE");
  const revision = exactInteger(value.privateSourceLineage.revision, 0,
    Number.MAX_SAFE_INTEGER, "PRIVATE_SOURCE_LINEAGE_REVISION");
  const predecessorReceiptHash = nullableHash(
    value.privateSourceLineage.predecessorReceiptHash,
    "PRIVATE_SOURCE_PREDECESSOR_RECEIPT_HASH");
  const supersedesReceiptHash = nullableHash(
    value.privateSourceLineage.supersedesReceiptHash,
    "PRIVATE_SOURCE_SUPERSEDES_RECEIPT_HASH");
  if ((revision === 0 && (predecessorReceiptHash !== null
      || supersedesReceiptHash !== null
      || value.privateSourceLineage.callerSuppliedImmediatePredecessorReplayed !== false))
    || (revision > 0 && (predecessorReceiptHash === null
      || predecessorReceiptHash !== supersedesReceiptHash
      || value.privateSourceLineage.callerSuppliedImmediatePredecessorReplayed !== true))
    || value.privateSourceLineage.fullAncestryReplayVerified !== false
    || value.privateSourceLineage.externalLifecycleHeadVerified !== false
    || value.privateSourceLineage.parallelGenesisExclusionEstablished !== false
    || value.privateSourceLineage.forkExclusionEstablished !== false) {
    fail("PRIVATE_SOURCE_LINEAGE_STATE_INVALID");
  }
  exactObject(value.ledgerBinding, ["ledgerHash", "caseScopedAlias",
    "workOrderHash", "episodeHash", "attemptSetCompositionHash",
    "reconstructionHash", "reviewPacketHash", "purposeHash", "audienceHash",
    "invitationOccurrenceIdentityHash", "responseOccurrenceIdentityHash",
    "caseScopedParticipantAlias", "responseVerdict",
    "challengeNonceCommitmentHash"], "LEDGER_BINDING");
  hash(value.ledgerBinding.ledgerHash, "LEDGER_BINDING_LEDGER_HASH");
  alias(value.ledgerBinding.caseScopedAlias, CASE_ALIAS,
    "LEDGER_BINDING_CASE_ALIAS");
  hash(value.ledgerBinding.workOrderHash, "LEDGER_BINDING_WORK_ORDER_HASH");
  hash(value.ledgerBinding.episodeHash, "LEDGER_BINDING_EPISODE_HASH");
  hash(value.ledgerBinding.attemptSetCompositionHash,
    "LEDGER_BINDING_ATTEMPT_SET_HASH");
  hash(value.ledgerBinding.reconstructionHash,
    "LEDGER_BINDING_RECONSTRUCTION_HASH");
  hash(value.ledgerBinding.reviewPacketHash, "LEDGER_BINDING_REVIEW_PACKET_HASH");
  hash(value.ledgerBinding.purposeHash, "LEDGER_BINDING_PURPOSE_HASH");
  hash(value.ledgerBinding.audienceHash, "LEDGER_BINDING_AUDIENCE_HASH");
  hash(value.ledgerBinding.invitationOccurrenceIdentityHash,
    "LEDGER_BINDING_INVITATION_OCCURRENCE_HASH");
  hash(value.ledgerBinding.responseOccurrenceIdentityHash,
    "LEDGER_BINDING_RESPONSE_OCCURRENCE_HASH");
  alias(value.ledgerBinding.caseScopedParticipantAlias, PARTICIPANT_ALIAS,
    "LEDGER_BINDING_PARTICIPANT_ALIAS");
  if (typeof value.ledgerBinding.responseVerdict !== "string") {
    fail("LEDGER_BINDING_RESPONSE_VERDICT_INVALID");
  }
  hash(value.ledgerBinding.challengeNonceCommitmentHash,
    "LEDGER_BINDING_CHALLENGE_HASH");
  exactObject(value.privateLedgerBindings, ["privateBundleRootCommitment",
    "reviewPacketHash", "suppliedPrivateInvitationObjectCommitmentHash",
    "suppliedPrivateResponseObjectCommitmentHash",
    "sourceChannelContinuityCommitmentHash",
    "directParticipationLinkCommitmentHash", "rightsReviewRootCommitment",
    "privacyReviewRootCommitment", "lifecycleEvidenceRootCommitment"],
  "PRIVATE_LEDGER_BINDINGS");
  const privateBindingKeys = ReflectOwnKeys(value.privateLedgerBindings);
  for (let index = 0; index < privateBindingKeys.length; index += 1) {
    hash(value.privateLedgerBindings[privateBindingKeys[index]],
      "PRIVATE_LEDGER_BINDING_HASH");
  }
  if (value.callerDeclaredLifecycleDisposition !== "CURRENT"
    && value.callerDeclaredLifecycleDisposition !== "WITHDRAWN"
    && value.callerDeclaredLifecycleDisposition !== "RETRACTED") {
    fail("PRIVATE_RECEIPT_LIFECYCLE_DISPOSITION_INVALID");
  }
  if (typeof value.structurallyCurrentPositiveCandidateOnly !== "boolean") {
    fail("STRUCTURALLY_CURRENT_POSITIVE_CANDIDATE_INVALID");
  }
  exactObject(value.reviewOccurrenceCensus, ["reviewOccurrenceCount",
    "countsByKind", "countsByVerdict",
    "distinctSuppliedPrivateObjectCommitmentHashCount",
    "objectHashEqualityCanReduceOccurrenceDenominator"],
  "REVIEW_OCCURRENCE_CENSUS");
  exactInteger(value.reviewOccurrenceCensus.reviewOccurrenceCount, 1, 4_096,
    "REVIEW_OCCURRENCE_COUNT");
  exactInteger(value.reviewOccurrenceCensus
    .distinctSuppliedPrivateObjectCommitmentHashCount, 1, 4_096,
  "DISTINCT_SUPPLIED_PRIVATE_OBJECT_COUNT");
  exactObject(value.reviewOccurrenceCensus.countsByKind,
    ["INVITATION", "RESPONSE", "RETRACTION", "TIMEOUT", "WITHDRAWAL"],
    "COUNTS_BY_KIND");
  exactObject(value.reviewOccurrenceCensus.countsByVerdict,
    ["DECLINE", "MATERIAL_CORRECTIONS_REQUIRED", "NO_WOULD_NOT_HAVE_CHANGED",
      "UNSURE", "YES_WOULD_HAVE_CHANGED"], "COUNTS_BY_VERDICT");
  const kindKeys = ReflectOwnKeys(value.reviewOccurrenceCensus.countsByKind);
  const verdictKeys = ReflectOwnKeys(value.reviewOccurrenceCensus.countsByVerdict);
  for (let index = 0; index < kindKeys.length; index += 1) {
    exactInteger(value.reviewOccurrenceCensus.countsByKind[kindKeys[index]], 0,
      4_096, "COUNT_BY_KIND");
  }
  for (let index = 0; index < verdictKeys.length; index += 1) {
    exactInteger(value.reviewOccurrenceCensus.countsByVerdict[verdictKeys[index]],
      0, 4_096, "COUNT_BY_VERDICT");
  }
  if (value.reviewOccurrenceCensus.objectHashEqualityCanReduceOccurrenceDenominator
    !== false) fail("OBJECT_EQUALITY_DENOMINATOR_STATE_INVALID");
  exactObject(value.publication, ["expectedDirectoryMode", "expectedFileMode",
    "exactFileAllowlistRequired", "extraFilesAllowed", "regularFilesOnly",
    "symlinksAllowed", "hardlinksAllowed", "noClobber",
    "allowExistingIdentical", "publicationOrder", "receiptWrittenLast",
    "files"], "PUBLICATION_MANIFEST");
  if (value.publication.expectedDirectoryMode !== "0700"
    || value.publication.expectedFileMode !== "0600"
    || value.publication.exactFileAllowlistRequired !== true
    || value.publication.extraFilesAllowed !== false
    || value.publication.regularFilesOnly !== true
    || value.publication.symlinksAllowed !== false
    || value.publication.hardlinksAllowed !== false
    || value.publication.noClobber !== true
    || value.publication.allowExistingIdentical !== false
    || value.publication.receiptWrittenLast !== true
    || !ArrayIsArray(value.publication.publicationOrder)
    || value.publication.publicationOrder.length !== FILE_ROLES.length
    || !ArrayIsArray(value.publication.files)
    || value.publication.files.length !== FILE_ROLES.length) {
    fail("PUBLICATION_MANIFEST_STATE_INVALID");
  }
  for (let index = 0; index < FILE_ROLES.length; index += 1) {
    if (value.publication.publicationOrder[index]
      !== AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[FILE_ROLES[index]]) {
      fail("PUBLICATION_ORDER_INVALID");
    }
  }
  hash(value.networkProjectionHash, "RECEIPT_NETWORK_PROJECTION_HASH");
  if (value.schema
      !== AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.privateReceipt
    || value.schemaVersion !== "1.0.0"
    || value.receiptClass
      !== "PRIVATE_ROLE_SEPARATED_SOURCE_BYTE_RECEIPT_EXTERNAL_PROVENANCE_NOT_INTEGRATED"
    || value.privateSourceRoleBytesReplayed !== true
    || value.callerDesignatedExternalChannelResponseRoleBytesPresent !== true
    || value.sourceRoleMeaningOrExternalProvenanceVerified !== false
    || value.freshChallengeControlReplayed !== false
    || value.externalChannelContinuityReplayed !== false
    || value.sourceLinkedDirectParticipationClaimReplayed !== false
    || value.exactMaterialDeltaReplayed !== false
    || value.freshSessionOrKeyControlVerified !== false
    || value.externalAccountOrChannelContinuityVerified !== false
    || value.directHistoricalParticipationVerified !== false
    || value.exactMaterialResponseSemanticsVerified !== false
    || value.actualPastCaseSourceReplayVerified !== false
    || value.rightsClearanceEstablished !== false
    || value.privacyClearanceEstablished !== false
    || value.retentionPermissionCurrent !== false
    || value.externalLifecycleHeadVerified !== false
    || value.stage1ExternalFactGateSatisfied !== false
    || value.disposition !== "QUARANTINED" || value.decisionState !== "HOLD"
    || value.authority !== "NONE" || value.actionReady !== false
    || value.executable !== false
    || !same(value.boundary,
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY)) {
    fail("PRIVATE_RECEIPT_STATE_INVALID");
  }
  const { receiptHash, ...body } = value;
  if (receiptHash !== digest(
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.privateReceipt,
    body)) fail("PRIVATE_RECEIPT_HASH_INVALID");
}

function readBundle(directory) {
  const before = directorySnapshot(directory);
  const expectedNames = ArraySort(ArrayMap(FILE_ROLES, (role) =>
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[role]));
  const actualNames = ArraySort(ArrayMap(before.entries, (entry) => entry));
  if (!same(expectedNames, actualNames)) fail("EXACT_FILE_ALLOWLIST_INVALID");
  const files = {};
  for (let index = 0; index < FILE_ROLES.length; index += 1) {
    const role = FILE_ROLES[index];
    const maximum = role === "receipt" || role === "networkProjection"
      ? MAX_JSON_BYTES : MAX_RAW_BYTES;
    files[role] = readPrivateFile(before.target,
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[role], maximum);
  }
  if (files.commitmentKey.bytes.length !== 32) fail("COMMITMENT_KEY_FILE_INVALID");
  const projection = parseCanonical(files.networkProjection, "NETWORK_PROJECTION");
  const receipt = parseCanonical(files.receipt, "PRIVATE_RECEIPT");
  exactNetworkProjection(projection);
  exactReceipt(receipt);
  if (receipt.networkProjectionHash !== projection.projectionHash) {
    fail("RECEIPT_PROJECTION_HASH_MISMATCH");
  }
  if (!ArrayIsArray(receipt.publication.files)
    || receipt.publication.files.length !== FILE_ROLES.length) {
    fail("PUBLICATION_MANIFEST_INVALID");
  }
  for (let index = 0; index < FILE_ROLES.length; index += 1) {
    const role = FILE_ROLES[index];
    const declared = receipt.publication.files[index];
    exactObject(declared, ["fileRole", "fileName", "serialization", "byteLength",
      "exactSha256", "domainCommitmentHash", "boundByReceipt"],
    "PUBLICATION_FILE");
    if (declared.fileRole !== role || declared.fileName
      !== AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[role]) {
      fail("PUBLICATION_FILE_ROLE_INVALID");
    }
    if (role === "receipt") {
      if (declared.byteLength !== null || declared.exactSha256 !== null
        || declared.domainCommitmentHash !== null || declared.boundByReceipt !== false) {
        fail("RECEIPT_SELF_REFERENCE_INVALID");
      }
    } else if (declared.byteLength !== files[role].bytes.length
      || declared.exactSha256 !== files[role].exactSha256
      || declared.boundByReceipt !== true) fail("PRIVATE_FILE_HASH_MISMATCH", role);
  }
  for (let index = 0; index < FILE_ROLES.length - 1; index += 1) {
    const role = FILE_ROLES[index];
    if (files.receipt.stat.mtimeNs < files[role].stat.mtimeNs
      || files.receipt.stat.ctimeNs < files[role].stat.ctimeNs) {
      fail("RECEIPT_NOT_LAST_BY_FILESYSTEM_METADATA", role);
    }
  }
  const context = receipt.ledgerBinding;
  const derived = deriveInternal({
    bindingContext: {
      bundleRevision: receipt.privateSourceLineage.revision,
      caseScopedAlias: context.caseScopedAlias,
      caseScopedParticipantAlias: findParticipantAliasInReceipt(receipt),
      workOrderHash: context.workOrderHash,
      episodeHash: context.episodeHash,
      attemptSetCompositionHash: context.attemptSetCompositionHash,
      reconstructionHash: context.reconstructionHash,
      purposeHash: context.purposeHash,
      audienceHash: context.audienceHash,
      invitationOccurrenceIdentityHash:
        context.invitationOccurrenceIdentityHash,
      responseOccurrenceIdentityHash: context.responseOccurrenceIdentityHash,
      challengeNonceCommitmentHash: context.challengeNonceCommitmentHash,
    },
    sourceBytes: {
      historicalCaseManifest: files.historicalCaseManifest.bytes,
      reconstructionPacket: files.reconstructionPacket.bytes,
      externalChannelInvitation: files.externalChannelInvitation.bytes,
      externalChannelResponse: files.externalChannelResponse.bytes,
      rightsEvidence: files.rightsEvidence.bytes,
      privacyEvidence: files.privacyEvidence.bytes,
      lifecycleEvidence: files.lifecycleEvidence.bytes,
    },
    commitmentKey: files.commitmentKey.bytes,
  });
  if (!same(derived.networkProjection, projection)
    || !same(derived.privateLedgerBindings, receipt.privateLedgerBindings)) {
    fail("PRIVATE_SOURCE_DERIVATION_MISMATCH");
  }
  if (!same(receipt.publication, publicationManifest(derived))) {
    fail("PRIVATE_PUBLICATION_MANIFEST_REPRODUCTION_INVALID");
  }
  for (let index = 0; index < FILE_ROLES.length; index += 1) {
    const role = FILE_ROLES[index];
    const current = lstatOrNull(path.join(before.target,
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[role]));
    if (!current || !sameStableStat(current, files[role].stat)) {
      fail("FILE_CHANGED_AFTER_ROLE_READ", role);
    }
  }
  const after = directorySnapshot(before.target);
  if (!sameStableStat(before.stat, after.stat)
    || !same(expectedNames, ArraySort(ArrayMap(after.entries, (entry) => entry)))) {
    fail("DIRECTORY_CHANGED_DURING_VERIFICATION");
  }
  return { receipt, projection, derived, files };
}

function findParticipantAliasInReceipt(receipt) {
  return receipt.ledgerBinding.caseScopedParticipantAlias;
}

function predecessorReceiptFor(publication, ledger, ledgerPredecessor) {
  const revision = ledger.appendOnlyLineage.revision;
  if (revision === 0) {
    if (publication.predecessorBundleDirectory !== null
      || ledgerPredecessor !== null) fail("GENESIS_PRIVATE_SOURCE_PREDECESSOR_FORBIDDEN");
    return null;
  }
  if (ledgerPredecessor === null || publication.predecessorBundleDirectory === null) {
    fail("DESCENDANT_PRIVATE_SOURCE_PREDECESSOR_REQUIRED");
  }
  const priorRead = readBundle(publication.predecessorBundleDirectory);
  assertReceiptLedgerSemanticCrosswalk(priorRead, ledgerPredecessor);
  const prior = priorRead.receipt;
  if (prior.receiptHash !== publication.expectedPredecessorReceiptHash
    || prior.ledgerBinding.ledgerHash !== ledgerPredecessor.ledgerHash
    || prior.privateSourceLineage.revision + 1 !== revision
    || prior.ledgerBinding.caseScopedAlias !== ledger.caseBinding.caseScopedAlias) {
    fail("PRIVATE_SOURCE_PREDECESSOR_CROSSWALK_INVALID");
  }
  return prior;
}

function publicationPayloads(derived) {
  return {
    historicalCaseManifest: derived.sources.historicalCaseManifest,
    reconstructionPacket: derived.sources.reconstructionPacket,
    externalChannelInvitation: derived.sources.externalChannelInvitation,
    externalChannelResponse: derived.sources.externalChannelResponse,
    rightsEvidence: derived.sources.rightsEvidence,
    privacyEvidence: derived.sources.privacyEvidence,
    lifecycleEvidence: derived.sources.lifecycleEvidence,
    commitmentKey: derived.key,
    networkProjection: canonicalBytes(derived.networkProjection),
  };
}

export function publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle(
  input = {}, options = {}) {
  rejectTree(input);
  exactObject(input, ["ledger", "ledgerPredecessor", "bindingContext",
    "sourceBytes", "commitmentKey", "lifecycleDisposition"], "PUBLISH_INPUT");
  const publication = claimPublication(options);
  verifyLedger(input.ledger, input.ledgerPredecessor, publication.expectedLedgerHash);
  const derived = deriveInternal({ bindingContext: input.bindingContext,
    sourceBytes: input.sourceBytes, commitmentKey: input.commitmentKey });
  if (derived.networkProjection.projectionHash
      !== publication.expectedNetworkProjectionHash
    || derived.privateLedgerBindings.privateBundleRootCommitment
      !== publication.expectedPrivateBundleRootCommitment) {
    fail("CALLER_SUPPLIED_PROJECTION_OR_ROOT_PIN_MISMATCH");
  }
  const response = crosswalkLedger(input.ledger, derived,
    input.lifecycleDisposition);
  const predecessorReceipt = predecessorReceiptFor(publication, input.ledger,
    input.ledgerPredecessor);
  const receipt = receiptFor(input.ledger, derived, response,
    input.lifecycleDisposition, predecessorReceipt);
  const payloads = publicationPayloads(derived);
  assertRoot(publication);
  const outputStat = createOutputDirectory(publication);
  fsyncDirectory(publication.trustedRoot);
  for (let index = 0; index < FILE_ROLES.length - 1; index += 1) {
    const role = FILE_ROLES[index];
    assertRoot(publication);
    assertOutput(publication, outputStat);
    publishPrivateArtifact(path.join(publication.outputDirectory,
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES[role]), payloads[role], {
      trustedRoot: publication.trustedRoot, allowExistingIdentical: false,
    });
  }
  assertRoot(publication);
  assertOutput(publication, outputStat);
  publishPrivateArtifact(path.join(publication.outputDirectory,
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES.receipt),
  canonicalBytes(receipt), {
    trustedRoot: publication.trustedRoot, allowExistingIdentical: false,
  });
  const read = readBundle(publication.outputDirectory);
  if (!same(read.receipt, receipt)) fail("POST_PUBLICATION_REPLAY_MISMATCH");
  return deepFreeze({
    ok: true,
    structuralPrivateSourceBundleVerified: true,
    exactFileAllowlistVerified: true,
    privateModesVerified: true,
    receiptWrittenLastByPublisherControlFlow: true,
    networkProjection: read.projection,
    receiptHash: receipt.receiptHash,
    lifecycleDisposition: receipt.callerDeclaredLifecycleDisposition,
    privateSourceRoleBytesReplayed: true,
    sourceRoleMeaningOrExternalProvenanceVerified: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY,
  });
}

function structuralFailure(error) {
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.structuralVerification,
    ok: false,
    structuralPrivateSourceBundleVerified: false,
    exactFileAllowlistVerified: false,
    privateModesVerified: false,
    predecessorByteBundleCrosswalked: false,
    sourceRoleByteReplayVerified: false,
    occurrenceCensusPreserved: false,
    sourceRoleMeaningOrExternalProvenanceVerified: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    error: error instanceof ErrorConstructor ? error.message : "UNKNOWN_ERROR",
    boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY,
  });
}

function assertReceiptLedgerSemanticCrosswalk(read, ledger) {
  const response = crosswalkLedger(ledger, read.derived,
    read.receipt.callerDeclaredLifecycleDisposition);
  const binding = read.receipt.ledgerBinding;
  const expectedStructuralCandidate
    = read.receipt.callerDeclaredLifecycleDisposition === "CURRENT"
      && response.responseVerdict === "YES_WOULD_HAVE_CHANGED"
      && ledger.currentCandidateState.activeMaterialCorrectionsRequiredOccurrenceCount === 0
      && ledger.currentCandidateState.activePositiveMaterialResponseOccurrenceCount > 0;
  if (read.receipt.recordedAt !== ledger.recordedAt
    || read.receipt.privateSourceLineage.revision
      !== ledger.appendOnlyLineage.revision
    || binding.ledgerHash !== ledger.ledgerHash
    || binding.caseScopedAlias !== ledger.caseBinding.caseScopedAlias
    || binding.workOrderHash !== ledger.caseBinding.workOrderHash
    || binding.episodeHash !== ledger.caseBinding.episodeHash
    || binding.attemptSetCompositionHash
      !== ledger.caseBinding.attemptSetCompositionHash
    || binding.reconstructionHash !== ledger.caseBinding.reconstructionHash
    || binding.reviewPacketHash !== ledger.caseBinding.reviewPacketHash
    || binding.purposeHash !== ledger.caseBinding.purposeHash
    || binding.audienceHash !== ledger.caseBinding.audienceHash
    || binding.invitationOccurrenceIdentityHash
      !== response.respondsToOccurrenceIdentityHash
    || binding.responseOccurrenceIdentityHash !== response.occurrenceIdentityHash
    || binding.caseScopedParticipantAlias !== response.caseScopedParticipantAlias
    || binding.responseVerdict !== response.responseVerdict
    || binding.challengeNonceCommitmentHash
      !== response.challengeNonceCommitmentHash
    || read.receipt.structurallyCurrentPositiveCandidateOnly
      !== expectedStructuralCandidate
    || read.receipt.reviewOccurrenceCensus.reviewOccurrenceCount
      !== ledger.reviewOccurrenceCensus.reviewOccurrenceCount
    || !same(read.receipt.reviewOccurrenceCensus.countsByKind,
      ledger.reviewOccurrenceCensus.countsByKind)
    || !same(read.receipt.reviewOccurrenceCensus.countsByVerdict,
      ledger.reviewOccurrenceCensus.countsByVerdict)
    || read.receipt.reviewOccurrenceCensus
      .distinctSuppliedPrivateObjectCommitmentHashCount
      !== ledger.suppliedPrivateObjectCommitmentEqualityView
        .distinctSuppliedPrivateObjectCommitmentHashCount) {
    fail("RECEIPT_LEDGER_SEMANTIC_CROSSWALK_INVALID");
  }
  return response;
}

function verifyStructuralPredecessor(read, ledger, ledgerPredecessor,
  predecessorBundleDirectory, expectedPredecessorReceiptHash) {
  if (ledger.appendOnlyLineage.revision === 0) {
    if (ledgerPredecessor !== null || predecessorBundleDirectory !== null
      || expectedPredecessorReceiptHash !== null
      || read.receipt.privateSourceLineage.predecessorReceiptHash !== null) {
      fail("GENESIS_STRUCTURAL_PREDECESSOR_FORBIDDEN");
    }
    return false;
  }
  if (ledgerPredecessor === null || typeof predecessorBundleDirectory !== "string") {
    fail("DESCENDANT_STRUCTURAL_PREDECESSOR_REQUIRED");
  }
  const expected = hash(expectedPredecessorReceiptHash,
    "EXPECTED_PREDECESSOR_RECEIPT_HASH");
  const priorRead = readBundle(predecessorBundleDirectory);
  const prior = priorRead.receipt;
  assertReceiptLedgerSemanticCrosswalk(priorRead, ledgerPredecessor);
  if (prior.receiptHash !== expected
    || read.receipt.privateSourceLineage.predecessorReceiptHash !== expected
    || read.receipt.privateSourceLineage.supersedesReceiptHash !== expected
    || prior.ledgerBinding.ledgerHash !== ledgerPredecessor.ledgerHash
    || prior.privateSourceLineage.revision + 1
      !== read.receipt.privateSourceLineage.revision
    || prior.ledgerBinding.caseScopedAlias !== ledger.caseBinding.caseScopedAlias) {
    fail("STRUCTURAL_PREDECESSOR_RECEIPT_CROSSWALK_INVALID");
  }
  return true;
}

export function verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
  directory, input = {}) {
  try {
    rejectTree(input);
    exactObject(input, ["ledger", "ledgerPredecessor", "expectedLedgerHash",
      "expectedReceiptHash", "expectedNetworkProjectionHash",
      "predecessorBundleDirectory", "expectedPredecessorReceiptHash"],
    "STRUCTURAL_VERIFY_INPUT");
    verifyLedger(input.ledger, input.ledgerPredecessor,
      hash(input.expectedLedgerHash, "EXPECTED_LEDGER_HASH"));
    const read = readBundle(directory);
    if (read.receipt.receiptHash !== hash(input.expectedReceiptHash,
      "EXPECTED_RECEIPT_HASH")
      || read.projection.projectionHash !== hash(input.expectedNetworkProjectionHash,
        "EXPECTED_NETWORK_PROJECTION_HASH")
      || read.receipt.ledgerBinding.ledgerHash !== input.ledger.ledgerHash) {
      fail("EXPECTED_HASH_OR_LEDGER_BINDING_MISMATCH");
    }
    const predecessorByteBundleCrosswalked = verifyStructuralPredecessor(read,
      input.ledger, input.ledgerPredecessor, input.predecessorBundleDirectory,
      input.expectedPredecessorReceiptHash);
    assertReceiptLedgerSemanticCrosswalk(read, input.ledger);
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS
          .structuralVerification,
      ok: true,
      structuralPrivateSourceBundleVerified: true,
      exactFileAllowlistVerified: true,
      privateModesVerified: true,
      receiptNotOlderThanPayloadByFilesystemMetadata: true,
      predecessorByteBundleCrosswalked,
      sourceRoleByteReplayVerified: true,
      callerDesignatedExternalChannelResponseRoleBytesPresent: true,
      occurrenceCensusPreserved: true,
      objectHashEqualityCanReduceOccurrenceDenominator: false,
      sourceRoleMeaningOrExternalProvenanceVerified: false,
      freshChallengeControlReplayed: false,
      externalChannelContinuityReplayed: false,
      sourceLinkedDirectParticipationClaimReplayed: false,
      exactMaterialDeltaReplayed: false,
      freshSessionOrKeyControlVerified: false,
      externalAccountOrChannelContinuityVerified: false,
      directHistoricalParticipationVerified: false,
      exactMaterialResponseSemanticsVerified: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      retentionPermissionCurrent: false,
      externalLifecycleHeadVerified: false,
      fullAncestryReplayVerified: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      receiptHash: read.receipt.receiptHash,
      networkProjectionHash: read.projection.projectionHash,
      lifecycleDisposition: read.receipt.callerDeclaredLifecycleDisposition,
      error: null,
      boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY,
    });
  } catch (error) { return structuralFailure(error); }
}

export function verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleAgainstTrustedSources(
  directory, input = {}) {
  let structuralPrivateSourceBundleVerified = false;
  try {
    rejectTree(input);
    exactObject(input, ["ledger", "ledgerPredecessor", "expectedLedgerHash",
      "expectedReceiptHash", "expectedNetworkProjectionHash",
      "predecessorBundleDirectory", "expectedPredecessorReceiptHash",
      "externalProvenancePins"], "TRUSTED_VERIFY_INPUT");
    exactObject(input.externalProvenancePins,
      ["historicalCaseExternalRevisionPinHash",
        "externalChannelRelationshipProvenancePinHash",
        "externalLifecycleHeadPinHash"], "EXTERNAL_PROVENANCE_PINS");
    hash(input.externalProvenancePins.historicalCaseExternalRevisionPinHash,
      "HISTORICAL_CASE_EXTERNAL_REVISION_PIN_HASH");
    hash(input.externalProvenancePins.externalChannelRelationshipProvenancePinHash,
      "EXTERNAL_CHANNEL_RELATIONSHIP_PROVENANCE_PIN_HASH");
    hash(input.externalProvenancePins.externalLifecycleHeadPinHash,
      "EXTERNAL_LIFECYCLE_HEAD_PIN_HASH");
    const structural
      = verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
        directory, {
          ledger: input.ledger,
          ledgerPredecessor: input.ledgerPredecessor,
          expectedLedgerHash: input.expectedLedgerHash,
          expectedReceiptHash: input.expectedReceiptHash,
          expectedNetworkProjectionHash: input.expectedNetworkProjectionHash,
          predecessorBundleDirectory: input.predecessorBundleDirectory,
          expectedPredecessorReceiptHash: input.expectedPredecessorReceiptHash,
        });
    if (!structural.ok) fail("STRUCTURAL_PRIVATE_SOURCE_REPLAY_INVALID",
      structural.error);
    structuralPrivateSourceBundleVerified = true;
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS
          .trustedReplayDescendant,
      ok: false,
      structuralPrivateSourceBundleVerified: true,
      privateSourceRoleBytesReplayed: true,
      callerSuppliedExternalProvenancePinsPresent: true,
      independentExternalProvenancePinsVerified: false,
      trustedExternalSourceAdaptersIntegrated: false,
      freshChallengeControlReplayed: false,
      externalChannelContinuityReplayed: false,
      sourceLinkedDirectParticipationClaimReplayed: false,
      exactMaterialDeltaReplayed: false,
      freshSessionOrKeyControlVerified: false,
      externalAccountOrChannelContinuityVerified: false,
      directHistoricalParticipationVerified: false,
      exactMaterialResponseSemanticsVerified: false,
      actualPastCaseSourceReplayVerified: false,
      currentRightsPrivacyPermissionVerified: false,
      externalLifecycleHeadVerified: false,
      fullAncestryReplayVerified: false,
      independentOutcomeEstablished: false,
      stage1ExternalFactGateSatisfied: false,
      result: "TRUSTED_EXTERNAL_PROVENANCE_REPLAY_NOT_INTEGRATED",
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      error:
        "AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_TRUSTED_EXTERNAL_PROVENANCE_REPLAY_NOT_INTEGRATED",
      boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY,
    });
  } catch (error) {
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS
          .trustedReplayDescendant,
      ok: false,
      structuralPrivateSourceBundleVerified,
      privateSourceRoleBytesReplayed: structuralPrivateSourceBundleVerified,
      callerSuppliedExternalProvenancePinsPresent: false,
      independentExternalProvenancePinsVerified: false,
      trustedExternalSourceAdaptersIntegrated: false,
      freshChallengeControlReplayed: false,
      externalChannelContinuityReplayed: false,
      sourceLinkedDirectParticipationClaimReplayed: false,
      exactMaterialDeltaReplayed: false,
      freshSessionOrKeyControlVerified: false,
      externalAccountOrChannelContinuityVerified: false,
      directHistoricalParticipationVerified: false,
      exactMaterialResponseSemanticsVerified: false,
      actualPastCaseSourceReplayVerified: false,
      currentRightsPrivacyPermissionVerified: false,
      externalLifecycleHeadVerified: false,
      fullAncestryReplayVerified: false,
      independentOutcomeEstablished: false,
      stage1ExternalFactGateSatisfied: false,
      result: "NOT_INTEGRATED",
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      error: error instanceof ErrorConstructor ? error.message : "UNKNOWN_ERROR",
      boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY,
    });
  }
}
