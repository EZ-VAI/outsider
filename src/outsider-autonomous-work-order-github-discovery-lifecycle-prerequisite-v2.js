/**
 * Audited, non-integrated lifecycle prerequisite for the fixed GitHub
 * discovery candidate.
 *
 * This module is deliberately pure. It has no filesystem, transport, process,
 * timer, randomness, or deletion capability. A structurally valid receipt is
 * only a reviewable protocol specification. It cannot lift the production raw
 * derive/load/publish/verify, acquisition, or purge kill gates.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const uncurryThis = (method) => Function.prototype.call.bind(method);
const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const BufferAllocUnsafe = Buffer.allocUnsafe.bind(Buffer);
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from.bind(Buffer);
const BufferIsBuffer = Buffer.isBuffer;
const BufferPrototype = Buffer.prototype;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectKeys = Object.keys;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const StringStartsWith = Function.prototype.call.bind(String.prototype.startsWith);
const StringConstructor = String;
const TextDecoderConstructor = TextDecoder;
const TypeErrorConstructor = TypeError;
const ArrayMap = uncurryThis(Array.prototype.map);
const ArraySort = uncurryThis(Array.prototype.sort);
const BufferCopy = uncurryThis(Buffer.prototype.copy);
const BufferEquals = uncurryThis(Buffer.prototype.equals);
const BufferWriteUInt32BE = uncurryThis(Buffer.prototype.writeUInt32BE);
const FunctionHasInstance = uncurryThis(Function.prototype[Symbol.hasInstance]);
const TextDecoderDecode = uncurryThis(TextDecoder.prototype.decode);
const TypedArrayPrototype = ObjectGetPrototypeOf(
  ObjectGetPrototypeOf(BufferPrototype),
);
const TypedArrayLengthDescriptor = ObjectGetOwnPropertyDescriptor(
  TypedArrayPrototype,
  "length",
);
if (!TypedArrayLengthDescriptor
  || typeof TypedArrayLengthDescriptor.get !== "function") {
  throw new TypeErrorConstructor(
    "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_TYPED_ARRAY_INTRINSIC_INVALID",
  );
}
const TypedArrayLength = uncurryThis(TypedArrayLengthDescriptor.get);
const hashIntrinsicProbe = createHash("sha256");
const HashPrototype = ObjectGetPrototypeOf(hashIntrinsicProbe);
const HashUpdate = uncurryThis(HashPrototype.update);
const HashDigest = uncurryThis(HashPrototype.digest);

const utf8Decoder = new TextDecoderConstructor("utf-8", {
  fatal: true,
  ignoreBOM: false,
});

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_SCHEMA
  = "outsider/autonomous-work-order-github-discovery-lifecycle-prerequisite/v2";
export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_VERIFICATION_SCHEMA
  = "outsider/autonomous-work-order-github-discovery-lifecycle-prerequisite-verification/v2";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const TYPED_ERROR
  = /^AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_[A-Z0-9_]+$/u;
const MAX_RECEIPT_BYTES = 64 * 1024;
const RECEIPT_HASH_DOMAIN
  = "outsider.autonomous-work-order.github-discovery.lifecycle-prerequisite.v2";

const PARENT_BINDINGS = ObjectFreeze([
  ObjectFreeze({
    role: "GITHUB_DISCOVERY_SNAPSHOT_V1",
    file: "src/outsider-autonomous-work-order-github-discovery-snapshot.js",
    bytes: 117_472,
    sha256:
      "sha256:b6253409183d5f3b7d81ae4986ca5c60c1a58546227f1793cbe1cc718ae8a6f6",
  }),
  ObjectFreeze({
    role: "GITHUB_DISCOVERY_ACQUISITION_DRAFT_V1",
    file: "scripts/acquire-autonomous-work-order-github-discovery-snapshot.mjs",
    bytes: 49_241,
    sha256:
      "sha256:eaa74e2209e848415d34200ae538d81cb975a57db1c9838675ec694af7283167",
  }),
  ObjectFreeze({
    role: "GITHUB_DISCOVERY_PURGE_DRAFT_V1",
    file: "scripts/purge-autonomous-work-order-github-discovery-snapshot.mjs",
    bytes: 54_004,
    sha256:
      "sha256:c957204b28bdebb699142ce51cd72cd41d8484d7842076e8005dd30522f3e5c9",
  }),
  ObjectFreeze({
    role: "DISPUTE_REVIEW_SOURCE_BUNDLE_V1",
    file: "src/outsider-autonomous-work-order-dispute-review-source-bundle.js",
    bytes: 74_504,
    sha256:
      "sha256:2d8b97ad59513c1f5632358197ad1c85311299f4da307794149b57f3bd0134f0",
  }),
]);

const FIXED_ROOTS = ObjectFreeze({
  workspaceRelativeIgnoredRoot: "artifacts",
  acquisitionRoot: "artifacts/private-source-captures",
  externalLifecycleRoot: "artifacts/private-source-captures/lifecycle",
  publicationDescendantRoot:
    "artifacts/private-source-captures/publication-descendants",
  exactLiteralRootsOnly: true,
  callerRootOverrideAllowed: false,
  environmentRootOverrideAllowed: false,
  rootFilesystemPathAllowed: false,
  homeDirectoryAliasAllowed: false,
  symlinkRootAllowed: false,
  gitignoreMustContainExactArtifactsEntry: true,
  gitignoreNegationBelowArtifactsAllowed: false,
});

const EXTERNAL_TOMBSTONE_PROTOCOL = ObjectFreeze({
  captureDirectoryIdPattern: "^snapshot_[a-f0-9]{32}$",
  captureLifecycleDirectoryComponents:
    ObjectFreeze(["lifecycle", "<captureDirectoryId>"]),
  purgeIntentFile: "purge-intent-v2.json",
  purgeReceiptFile: "purge-receipt-v2.json",
  lifecycleDirectoryMode: "0700",
  lifecycleFileMode: "0600",
  intentNoClobber: true,
  intentFileFsyncRequired: true,
  lifecycleDirectoryFsyncRequired: true,
  lifecycleRootFsyncRequired: true,
  independentLifecycleRegistryHeadRequired: true,
  registryMissingUnavailableRollbackOrUnknownDecision: "HOLD",
  ownerRollbackResistanceEstablished: false,
  forkExclusionEstablished: false,
  durableExternalHeadEstablished: false,
  independentExternalWitnessEstablished: false,
  intentMustBeDurableBeforeCaptureDirectoryStat: true,
  intentMustBeDurableBeforeRawPathStat: true,
  intentMustBeDurableBeforeRawOpen: true,
  intentMustBeDurableBeforeRawReadOrBufferCopy: true,
  tombstoneCheckedAtEveryRawReaderEntry: true,
  tombstoneCheckedImmediatelyBeforeEveryRawPathStatOpenReadOrCopy: true,
  acquisitionLoaderBlockedByIntent: true,
  rawDeriverBlockedByIntent: true,
  rawBundleVerifierBlockedByIntent: true,
  rawDescendantPublisherBlockedByIntent: true,
  networkSafeProjectionPublisherBlockedByIntent: true,
  disputeReviewSourceBundlePublisherBlockedByIntent: true,
  newPublicationDescendantRegistrationBlockedByIntent: true,
  purgeWorkerIsOnlyRawReaderAllowedAfterIntent: true,
  purgeWorkerRawReadPurpose: "EXACT_TARGET_PRE_UNLINK_VALIDATION_ONLY",
});

const DESCENDANT_CASCADE_PROTOCOL = ObjectFreeze({
  acquisitionDescendantClass:
    "PRIVATE_GITHUB_DISCOVERY_ACQUISITION_DIRECTORY",
  publicationDescendantClasses: ObjectFreeze([
    "PRIVATE_GITHUB_DISCOVERY_SNAPSHOT_BUNDLE",
    "NETWORK_SAFE_GITHUB_DISCOVERY_PROJECTION",
    "PRIVATE_DISPUTE_REVIEW_SOURCE_BUNDLE",
  ]),
  descendantRegistryMustBeExternalToRawAndPublicationRoots: true,
  exactFiniteDescendantCensusRequiredBeforeIntent: true,
  globalDescendantCensusCompletenessMustBeProven: true,
  callerClaimIsNotDescendantCensusProof: true,
  directoryScanIsNotDescendantCensusProof: true,
  globDiscoveryAllowed: false,
  recursiveTraversalAllowed: false,
  intentMustBindEveryDescendantIdAndReceiptHash: true,
  intentMustTombstoneAcquisitionAndEveryPublicationDescendant: true,
  allDescendantTombstonesDurableBeforeAnyRawPathStatOrRead: true,
  crashResumeUsesIntentBoundExplicitDescendantRowsOnly: true,
  descendantMutationAfterTombstoneAllowed: false,
  missingOrUnprovenDescendantCensusDecision: "HOLD",
});

const CRASH_RESUME_PROTOCOL = ObjectFreeze({
  stateSequence: ObjectFreeze([
    "NO_INTENT",
    "INTENT_DURABLE_RAW_FORBIDDEN",
    "EXACT_RAW_UNLINKS_IN_PROGRESS",
    "RAW_ABSENCE_VERIFIED",
    "DESCENDANT_TOMBSTONES_VERIFIED",
    "RECEIPT_DURABLE",
  ]),
  restartStateComesFromExactIntentAndReceiptPathsOnly: true,
  restartStateMayBeInferredFromDirectoryScan: false,
  intentImmutableNoOverwrite: true,
  intentIdentityAndBindingsMustReplayBeforeResume: true,
  alreadyAbsentTargetAcceptedOnlyWhenBoundByDurableIntent: true,
  remainingTargetSetDerivedFromIntentRowsOnly: true,
  directoryFsyncAfterEveryUnlink: true,
  rawAbsenceRecheckedBeforeReceipt: true,
  descendantTombstonesRecheckedBeforeReceipt: true,
  receiptWrittenLastNoClobber: true,
  receiptFileFsyncRequired: true,
  lifecycleDirectoryFsyncAfterReceiptRequired: true,
  ambiguousIntentWriteRequiresRawForbiddenRecovery: true,
  incompleteIntentOrReceiptNeverRestoresRawReadPermission: true,
});

const EXACT_RAW_DELETION_PLAN = ObjectFreeze([
  ObjectFreeze({ ordinal: 1, role: "ISSUE_BEFORE", file: "issue-before.json" }),
  ObjectFreeze({ ordinal: 2, role: "COMMENTS_SCAN_A",
    file: "comments-scan-a.json" }),
  ObjectFreeze({ ordinal: 3, role: "ISSUE_MID", file: "issue-mid.json" }),
  ObjectFreeze({ ordinal: 4, role: "COMMENTS_SCAN_B",
    file: "comments-scan-b.json" }),
  ObjectFreeze({ ordinal: 5, role: "ISSUE_AFTER", file: "issue-after.json" }),
]);

const DELETION_BOUNDARY = ObjectFreeze({
  exactRawFileAllowlist: EXACT_RAW_DELETION_PLAN,
  targetPathBuiltFromValidatedFixedComponentsOnly: true,
  callerAbsoluteTargetAllowed: false,
  callerRelativeTargetAllowed: false,
  globAllowed: false,
  wildcardAllowed: false,
  recursiveDeleteAllowed: false,
  captureDirectoryDeleteAllowed: false,
  lifecycleDirectoryDeleteAllowed: false,
  publicationDirectoryDeleteAllowed: false,
  symlinkTargetAllowed: false,
  hardlinkTargetAllowed: false,
  linkCountMustEqualOne: true,
  exactBytesAndSha256MustMatchIntentBeforeUnlink: true,
  unlinkOnlyAfterExternalIntentDurable: true,
  secureEraseEstablished: false,
  physicalMediaErasureEstablished: false,
  filesystemSnapshotDeletionEstablished: false,
  backupDeletionEstablished: false,
  remoteCopyDeletionEstablished: false,
  copiesOutsideBoundCaptureDirectoryDeletionEstablished: false,
});

const RIGHTS_PRIVACY_BOUNDARY = ObjectFreeze({
  lifecycleProtocolIsRightsAdjudication: false,
  lifecycleProtocolIsPrivacyAdjudication: false,
  sourceSpecificRightsClearanceEstablished: false,
  sourceSpecificPrivacyClearanceEstablished: false,
  redistributionPermissionEstablished: false,
  publicationPermissionEstablished: false,
  retentionPermissionEstablished: false,
  trainingPermissionEstablished: false,
  withdrawalOrRetractionAuthorityEstablished: false,
  historicalOccurrenceDeletionEstablished: false,
  purgeReceiptCanProveRemoteDeletion: false,
  purgeReceiptCanProveSecureErase: false,
  ledgerRecordedOccurrenceNonResurrectionEstablished: false,
  futureDescendantMustNotRestoreRawOrPublicationEligibility: true,
});

const INTEGRATION_GATE = ObjectFreeze({
  protocolState: "AUDITED_DRAFT_NOT_INTEGRATED",
  exactParentByteReferencesDeclared: true,
  currentParentFilesRehashedByContract: false,
  externalLifecycleRegistrarImplemented: false,
  allRawReadersUseExternalLifecycleGuard: false,
  crashResumablePurgeWorkerIntegrated: false,
  acquisitionDescendantCascadeIntegrated: false,
  publicationDescendantCascadeIntegrated: false,
  disputeSourceBundleCascadeIntegrated: false,
  independentDescendantCensusEstablished: false,
  lifecycleFocusedTestsExecuted: false,
  lifecycleAdjacentTestsExecuted: false,
  liveAcquisitionEnabled: false,
  productionRawLoaderEnabled: false,
  productionRawPublisherEnabled: false,
  productionRawVerifierEnabled: false,
  purgeExecutionEnabled: false,
  eligibleToLiftExistingKillGate: false,
  stage1EngineeringGateSatisfied: false,
  stage1ExternalFactGateSatisfied: false,
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  provenAuthorityUnits: 0,
  enabledConsequenceUnits: 0,
  consequenceReach: "NONE",
  trainingRows: 0,
  causalExperienceUnits: 0,
  pricingUnits: 0,
  guaranteeUnits: 0,
  settlementUnits: 0,
  capitalUnits: 0,
});

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_BOUNDARY
  = ObjectFreeze({
    pureDataContractOnly: true,
    filesystemCapabilityPresent: false,
    networkCapabilityPresent: false,
    processExecutionCapabilityPresent: false,
    deletionCapabilityPresent: false,
    readsRawBytes: false,
    readsPaths: false,
    writesLifecycleIntent: false,
    writesLifecycleReceipt: false,
    deletesRawBytes: false,
    externalLifecycleTombstoneEstablished: false,
    descendantCascadePerformed: false,
    crashRecoveryPerformed: false,
    secureEraseEstablished: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    liveKillGateRemainsRequired: true,
    decisionState: "HOLD",
    authority: "NONE",
  });

function fail(code) {
  throw new TypeErrorConstructor(
    `AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_${code}`,
  );
}

function strictBufferLength(bytes) {
  if (!BufferIsBuffer(bytes) || ObjectGetPrototypeOf(bytes) !== BufferPrototype
    || ObjectGetOwnPropertyDescriptor(bytes, "length") !== undefined) {
    fail("RECEIPT_BUFFER_SHAPE_INVALID");
  }
  let length;
  try { length = TypedArrayLength(bytes); }
  catch { fail("RECEIPT_BUFFER_SHAPE_INVALID"); }
  if (!NumberIsSafeInteger(length) || length < 0) {
    fail("RECEIPT_BUFFER_SHAPE_INVALID");
  }
  // Bound work before ReflectOwnKeys materializes one key per typed-array byte.
  if (length < 2 || length > MAX_RECEIPT_BYTES) {
    fail("RECEIPT_BYTES_INVALID");
  }
  const ownKeys = ReflectOwnKeys(bytes);
  if (ownKeys.length !== length) fail("RECEIPT_BUFFER_SHAPE_INVALID");
  for (let index = 0; index < length; index += 1) {
    if (ownKeys[index] !== StringConstructor(index)) {
      fail("RECEIPT_BUFFER_SHAPE_INVALID");
    }
    const descriptor = ObjectGetOwnPropertyDescriptor(bytes, ownKeys[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail("RECEIPT_BUFFER_SHAPE_INVALID");
  }
  return length;
}

function ownDataValue(object, key, code) {
  const descriptor = ObjectGetOwnPropertyDescriptor(object, key);
  if (!descriptor || !ObjectHasOwn(descriptor, "value")
    || descriptor.enumerable !== true) {
    fail(code);
  }
  return descriptor.value;
}

function sortedKeys(value) {
  const keys = ObjectKeys(value);
  ArraySort(keys);
  return keys;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || ObjectGetPrototypeOf(value) !== ObjectPrototype) fail(code);
  const actual = sortedKeys(value);
  const expected = new ArrayConstructor(fields.length);
  for (let index = 0; index < fields.length; index += 1) {
    expected[index] = fields[index];
  }
  ArraySort(expected);
  if (actual.length !== expected.length) fail(code);
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) fail(code);
    ownDataValue(value, expected[index], code);
  }
  return value;
}

function canonicalIso(value, code) {
  if (typeof value !== "string") fail(code);
  const milliseconds = DateParse(value);
  if (!NumberIsFinite(milliseconds)
    || DateToISOString(new DateConstructor(milliseconds)) !== value) fail(code);
  return value;
}

function canonicalBytes(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function sha256(bytes) {
  const hash = createHash("sha256");
  HashUpdate(hash, bytes);
  return `sha256:${HashDigest(hash, "hex")}`;
}

function canonicalHash(domain, value) {
  const domainBytes = BufferFrom(domain, "utf8");
  const valueBytes = BufferFrom(canonicalizeStrict(value), "utf8");
  const domainLength = TypedArrayLength(domainBytes);
  const valueLength = TypedArrayLength(valueBytes);
  const framed = BufferAllocUnsafe(8 + domainLength + valueLength);
  BufferWriteUInt32BE(framed, domainLength, 0);
  BufferCopy(domainBytes, framed, 4);
  BufferWriteUInt32BE(framed, valueLength, 4 + domainLength);
  BufferCopy(valueBytes, framed, 8 + domainLength);
  return sha256(framed);
}

function copyParentBindings() {
  return ArrayMap(PARENT_BINDINGS, (binding) => ({ ...binding }));
}

function copyProtocolValue(value) {
  if (ArrayIsArray(value)) {
    return ArrayMap(value, (item) => copyProtocolValue(item));
  }
  if (value !== null && typeof value === "object") {
    const copy = {};
    const keys = ObjectKeys(value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      copy[key] = copyProtocolValue(value[key]);
    }
    return copy;
  }
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) {
    return value;
  }
  const keys = ObjectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    deepFreeze(value[keys[index]]);
  }
  return ObjectFreeze(value);
}

function receiptBase(auditedAt) {
  return {
    schema:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_SCHEMA,
    protocolVersion: 2,
    protocolState: "AUDITED_DRAFT_NOT_INTEGRATED",
    auditedAtLocalClock: auditedAt,
    localClockIsIndependentTime: false,
    parentBindings: copyParentBindings(),
    fixedRoots: copyProtocolValue(FIXED_ROOTS),
    externalTombstoneBeforeRawRead:
      copyProtocolValue(EXTERNAL_TOMBSTONE_PROTOCOL),
    descendantCascade: copyProtocolValue(DESCENDANT_CASCADE_PROTOCOL),
    crashResume: copyProtocolValue(CRASH_RESUME_PROTOCOL),
    deletionBoundary: copyProtocolValue(DELETION_BOUNDARY),
    rightsPrivacyBoundary: copyProtocolValue(RIGHTS_PRIVACY_BOUNDARY),
    integrationGate: copyProtocolValue(INTEGRATION_GATE),
    boundary: copyProtocolValue(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_BOUNDARY,
    ),
  };
}

function assertSame(left, right, code) {
  if (canonicalizeStrict(left) !== canonicalizeStrict(right)) fail(code);
}

function validateReceipt(receipt) {
  exactObject(receipt, [
    "schema", "protocolVersion", "protocolState", "auditedAtLocalClock",
    "localClockIsIndependentTime", "parentBindings", "fixedRoots",
    "externalTombstoneBeforeRawRead", "descendantCascade", "crashResume",
    "deletionBoundary", "rightsPrivacyBoundary", "integrationGate", "boundary",
    "receiptHash",
  ], "RECEIPT_FIELDS_INVALID");
  const auditedAt = canonicalIso(ownDataValue(receipt, "auditedAtLocalClock",
    "AUDITED_AT_INVALID"), "AUDITED_AT_INVALID");
  if (receipt.schema
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_SCHEMA
    || receipt.protocolVersion !== 2
    || receipt.protocolState !== "AUDITED_DRAFT_NOT_INTEGRATED"
    || receipt.localClockIsIndependentTime !== false
    || !RegExpTest(HASH, receipt.receiptHash)) fail("RECEIPT_IDENTITY_INVALID");
  const expectedBase = receiptBase(auditedAt);
  assertSame(receipt.parentBindings, expectedBase.parentBindings,
    "PARENT_BINDINGS_INVALID");
  assertSame(receipt.fixedRoots, expectedBase.fixedRoots, "FIXED_ROOTS_INVALID");
  assertSame(receipt.externalTombstoneBeforeRawRead,
    expectedBase.externalTombstoneBeforeRawRead,
    "EXTERNAL_TOMBSTONE_PROTOCOL_INVALID");
  assertSame(receipt.descendantCascade, expectedBase.descendantCascade,
    "DESCENDANT_CASCADE_INVALID");
  assertSame(receipt.crashResume, expectedBase.crashResume,
    "CRASH_RESUME_INVALID");
  assertSame(receipt.deletionBoundary, expectedBase.deletionBoundary,
    "DELETION_BOUNDARY_INVALID");
  assertSame(receipt.rightsPrivacyBoundary, expectedBase.rightsPrivacyBoundary,
    "RIGHTS_PRIVACY_BOUNDARY_INVALID");
  assertSame(receipt.integrationGate, expectedBase.integrationGate,
    "INTEGRATION_GATE_INVALID");
  assertSame(receipt.boundary, expectedBase.boundary, "BOUNDARY_INVALID");
  if (receipt.receiptHash !== canonicalHash(RECEIPT_HASH_DOMAIN, expectedBase)) {
    fail("RECEIPT_HASH_INVALID");
  }
  return deepFreeze(receipt);
}

function parseCanonicalReceipt(bytes) {
  strictBufferLength(bytes);
  let text;
  try { text = TextDecoderDecode(utf8Decoder, bytes); }
  catch { fail("RECEIPT_UTF8_INVALID"); }
  if (StringStartsWith(text, "\uFEFF")) fail("RECEIPT_BOM_INVALID");
  let receipt;
  try { receipt = JSONParse(text); }
  catch { fail("RECEIPT_JSON_INVALID"); }
  if (ObjectGetPrototypeOf(receipt) !== ObjectPrototype
    || !BufferEquals(canonicalBytes(receipt), bytes)) {
    fail("RECEIPT_NOT_CANONICAL");
  }
  return validateReceipt(receipt);
}

export function createAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
  input,
) {
  exactObject(input, ["auditedAtLocalClock"], "INPUT_FIELDS_INVALID");
  const auditedAt = canonicalIso(ownDataValue(input, "auditedAtLocalClock",
    "AUDITED_AT_INVALID"), "AUDITED_AT_INVALID");
  const base = receiptBase(auditedAt);
  const receipt = deepFreeze({
    ...base,
    receiptHash: canonicalHash(RECEIPT_HASH_DOMAIN, base),
  });
  return canonicalBytes(receipt);
}

export function parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
  bytes,
) {
  return parseCanonicalReceipt(bytes);
}

function failure(error) {
  const prefix
    = "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_";
  let typedMessage = null;
  try {
    const messageDescriptor = error !== null && typeof error === "object"
      && FunctionHasInstance(ErrorConstructor, error)
      ? ObjectGetOwnPropertyDescriptor(error, "message") : undefined;
    if (messageDescriptor && ObjectHasOwn(messageDescriptor, "value")
      && typeof messageDescriptor.value === "string"
      && RegExpTest(TYPED_ERROR, messageDescriptor.value)) {
      typedMessage = messageDescriptor.value;
    }
  } catch {
    typedMessage = null;
  }
  const message = typedMessage ?? `${prefix}UNTRUSTED_FAILURE`;
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_VERIFICATION_SCHEMA,
    ok: false,
    structuralProtocolVerified: false,
    protocolState: "AUDITED_DRAFT_NOT_INTEGRATED",
    lifecycleIntegrated: false,
    eligibleToLiftExistingKillGate: false,
    stage1EngineeringGateSatisfied: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    error: message,
    boundary:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
  bytes,
) {
  try {
    const receipt = parseCanonicalReceipt(bytes);
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_VERIFICATION_SCHEMA,
      ok: true,
      structuralProtocolVerified: true,
      protocolState: receipt.protocolState,
      receiptHash: receipt.receiptHash,
      receiptBytes: BufferByteLength(canonicalizeStrict(receipt), "utf8") + 1,
      exactParentByteReferencesVerified: false,
      exactParentByteReferencesDeclaredAndStructurallyMatched: true,
      currentParentFilesRehashedByContract: false,
      currentGitignoreBytesVerifiedByContract: false,
      fixedIgnoredRootsSpecified: true,
      externalTombstoneBeforeRawReadSpecified: true,
      acquisitionAndPublicationDescendantCascadeSpecified: true,
      crashResumableIntentSpecified: true,
      exactNonRecursiveDeletionPlanSpecified: true,
      secureEraseEstablished: false,
      lifecycleIntegrated: false,
      eligibleToLiftExistingKillGate: false,
      stage1EngineeringGateSatisfied: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      error: null,
      boundary:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_BOUNDARY,
    });
  } catch (error) {
    return failure(error);
  }
}
