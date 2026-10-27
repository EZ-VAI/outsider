/*
 * Fixed, offline Stage 1 discovery snapshot for one public issue candidate.
 *
 * This adapter never performs network I/O.  It accepts five caller-acquired
 * GitHub REST response bodies and their response metadata, requires a complete
 * issue/comments/issue/comments/issue bracket against frozen byte pins, and
 * publishes a private 0700/0600 bundle.  The public projection contains only
 * counts, lengths, keyed commitments, typed missingness, and hard HOLD
 * boundaries.  Provider account references, URLs, issue numbers, raw hashes,
 * ETags, and all raw narrative remain private.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fsyncSync, fstatSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync,
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { publishPrivateArtifact } from "./outsider-private-artifact-publication.js";

const ArrayIsArray = Array.isArray;
const ArrayConstructor = Array;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BigIntConstructor = BigInt;
const BufferAlloc = Buffer.alloc;
const BufferEquals = Function.prototype.call.bind(Buffer.prototype.equals);
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const DateConstructor = Date;
const DateNow = Date.now;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HmacPrototype = Object.getPrototypeOf(createHmac("sha256", BufferAlloc(32)));
const HmacUpdate = Function.prototype.call.bind(HmacPrototype.update);
const HmacDigest = Function.prototype.call.bind(HmacPrototype.digest);
const JSONParse = JSON.parse;
const JSONStringify = JSON.stringify;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const NumberConstructor = Number;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringIncludes = Function.prototype.call.bind(String.prototype.includes);
const StringSlice = Function.prototype.call.bind(String.prototype.slice);
const StringStartsWith = Function.prototype.call.bind(String.prototype.startsWith);
const StringToLowerCase = Function.prototype.call.bind(String.prototype.toLowerCase);
const StringToUpperCase = Function.prototype.call.bind(String.prototype.toUpperCase);
const TextDecoderConstructor = TextDecoder;
const TextDecoderDecode = Function.prototype.call.bind(TextDecoder.prototype.decode);
const TypeErrorConstructor = TypeError;

const UTF8_DECODER = new TextDecoderConstructor("utf-8", {
  fatal: true, ignoreBOM: true,
});

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;
const FILE_TYPE_MASK = 0o170000n;
const DIRECTORY_TYPE = 0o040000n;
const REGULAR_FILE_TYPE = 0o100000n;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const HMAC_HASH = /^hmac-sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const REVIEW_ID = /^awo_[a-f0-9]{32}$/u;
const ACQUISITION_ATTEMPT_ID = /^acq_[a-f0-9]{32}$/u;
const PUBLICATION_ATTEMPT_ID = /^pub_[a-f0-9]{32}$/u;
const REVIEWER_ALIAS = /^reviewer_[a-f0-9]{32}$/u;
const WEAK_ETAG = /^W\/"[A-Fa-f0-9]{64}"$/u;
const OPAQUE_DIRECTORY = /^snapshot_[a-f0-9]{32}$/u;
const ZERO_HASH
  = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
const MAX_RAW_BYTES = 32 * 1024;
const MAX_TOTAL_BUNDLE_BYTES = 256 * 1024;
const MAX_PREFLIGHT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const MAX_TREE_NODES = 20_000;
const MAX_TREE_KEYS = 80_000;

const TARGET = ObjectFreeze({
  issueRequestUrl:
    "https://api.github.com/repos/anthropics/claude-code/issues/64056",
  commentsRequestUrl:
    "https://api.github.com/repos/anthropics/claude-code/issues/64056/comments?per_page=100&page=1",
  repositoryUrl: "https://api.github.com/repos/anthropics/claude-code",
  issueHtmlUrl: "https://github.com/anthropics/claude-code/issues/64056",
  issueNumber: 64_056,
  authVisibilityProfile: "PUBLIC_ANONYMOUS_NO_CREDENTIALS",
});

const CAPTURE_MANIFEST_SCHEMA
  = "outsider.autonomous-work-order.github-discovery-snapshot-capture-manifest.v2";
const ACQUISITION_LIFECYCLE_RECEIPT_SCHEMA
  = "outsider/autonomous-work-order-github-discovery-acquisition-lifecycle-receipt/v1";
const PUBLICATION_LIFECYCLE_RECEIPT_SCHEMA
  = "outsider/autonomous-work-order-github-discovery-publication-lifecycle-receipt/v1";
const MANIFEST_ROLE_BINDINGS = ObjectFreeze([
  ObjectFreeze({ key: "issueBefore", role: "ISSUE_BEFORE",
    file: "issue-before.json", url: TARGET.issueRequestUrl }),
  ObjectFreeze({ key: "commentsA", role: "COMMENTS_SCAN_A",
    file: "comments-scan-a.json", url: TARGET.commentsRequestUrl }),
  ObjectFreeze({ key: "issueMid", role: "ISSUE_MID",
    file: "issue-mid.json", url: TARGET.issueRequestUrl }),
  ObjectFreeze({ key: "commentsB", role: "COMMENTS_SCAN_B",
    file: "comments-scan-b.json", url: TARGET.commentsRequestUrl }),
  ObjectFreeze({ key: "issueAfter", role: "ISSUE_AFTER",
    file: "issue-after.json", url: TARGET.issueRequestUrl }),
]);

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS
  = ObjectFreeze({
    headersManifest:
      "outsider/autonomous-work-order-github-discovery-headers-manifest/v1",
    networkSafeReport:
      "outsider/autonomous-work-order-public-issue-discovery-snapshot/v1",
    privateReceipt:
      "outsider/autonomous-work-order-github-discovery-private-receipt/v1",
    preflightReview:
      "outsider/autonomous-work-order-github-discovery-acquisition-preflight-review/v1",
    acquisitionLifecycleReceipt: ACQUISITION_LIFECYCLE_RECEIPT_SCHEMA,
    publicationLifecycleReceipt: PUBLICATION_LIFECYCLE_RECEIPT_SCHEMA,
    rightsReview:
      "outsider/autonomous-work-order-github-discovery-rights-review/v1",
    privacyReview:
      "outsider/autonomous-work-order-github-discovery-privacy-review/v1",
    structuralVerification:
      "outsider/autonomous-work-order-github-discovery-structural-verification/v1",
  });

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS
  = ObjectFreeze({
    requestedAndSelectedApiVersion: "2026-03-10",
    issue: ObjectFreeze({
      bytes: 10_175,
      sha256:
        "sha256:e429691ddcf684248168c8333942b6a3d6bba74085aab669da25748ce207dbe5",
    }),
    comments: ObjectFreeze({
      bytes: 16_132,
      sha256:
        "sha256:0a9515e8edf2bd829cf11ea659f7d4b260650fc6386eaeac29cde5549d0750aa",
      expectedCurrentObjectCount: 6,
    }),
    bracketRawBytes: 62_789,
    captureCount: 5,
  });

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE = deepFreeze({
  candidateTarget: {
    sourceClass: "PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT",
    issueRequestUrl: TARGET.issueRequestUrl,
    commentsRequestUrl: TARGET.commentsRequestUrl,
    requestedApiVersion:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS
        .requestedAndSelectedApiVersion,
  },
  authVisibilityProfile: TARGET.authVisibilityProfile,
  requestPlan: [
    { ordinal: 1, role: "ISSUE_BEFORE", method: "GET",
      requestUrl: TARGET.issueRequestUrl,
      expectedBytes: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.bytes,
      expectedSha256:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.sha256 },
    { ordinal: 2, role: "COMMENTS_SCAN_A", method: "GET",
      requestUrl: TARGET.commentsRequestUrl,
      expectedBytes: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.bytes,
      expectedSha256:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.sha256 },
    { ordinal: 3, role: "ISSUE_MID", method: "GET",
      requestUrl: TARGET.issueRequestUrl,
      expectedBytes: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.bytes,
      expectedSha256:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.sha256 },
    { ordinal: 4, role: "COMMENTS_SCAN_B", method: "GET",
      requestUrl: TARGET.commentsRequestUrl,
      expectedBytes: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.bytes,
      expectedSha256:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.sha256 },
    { ordinal: 5, role: "ISSUE_AFTER", method: "GET",
      requestUrl: TARGET.issueRequestUrl,
      expectedBytes: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.bytes,
      expectedSha256:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.sha256 },
  ],
  requestHeaders: {
    accept: "application/vnd.github+json",
    acceptEncoding: "identity",
  },
  transport: {
    redirectFollowing: false,
    retries: 0,
    tlsRejectUnauthorized: true,
    tlsServername: "api.github.com",
  },
  maximumTotalRawBytes:
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.bracketRawBytes,
});

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH
  = canonicalHash(
    "outsider.autonomous-work-order.github-discovery.target-profile.v1",
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE);

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES
  = ObjectFreeze({
    issueBefore: "01-issue-before.json",
    commentsA: "02-comments-a.json",
    issueMid: "03-issue-mid.json",
    commentsB: "04-comments-b.json",
    issueAfter: "05-issue-after.json",
    acquisitionLifecycleReceipt: "acquisition-lifecycle-receipt.json",
    acquisitionCaptureManifest: "acquisition-capture-manifest.json",
    preflightReview: "preflight-review.json",
    publicationLifecycleReceipt: "publication-lifecycle-receipt.json",
    projectionKey: "projection-key.bytes",
    rightsReview: "rights-review.json",
    privacyReview: "privacy-review.json",
    networkSafeReport: "network-safe-report.json",
    receipt: "run-receipt.json",
  });

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES
  = ObjectFreeze({
    acquisitionLifecycleReceipt: "acquisition-lifecycle-receipt.json",
    acquisitionCaptureManifest: "capture-manifest.json",
    preflightReview: "preflight-review.json",
    issueBefore: "issue-before.json",
    commentsA: "comments-scan-a.json",
    issueMid: "issue-mid.json",
    commentsB: "comments-scan-b.json",
    issueAfter: "issue-after.json",
  });

const ACQUISITION_FILE_ROLES = ObjectFreeze([
  "acquisitionLifecycleReceipt", "acquisitionCaptureManifest", "preflightReview",
  "issueBefore", "commentsA", "issueMid", "commentsB", "issueAfter",
]);

const CAPTURE_ROLES = ObjectFreeze([
  "issueBefore", "commentsA", "issueMid", "commentsB", "issueAfter",
]);
const FILE_ROLES = ObjectFreeze([
  "issueBefore", "commentsA", "issueMid", "commentsB", "issueAfter",
  "acquisitionLifecycleReceipt", "acquisitionCaptureManifest", "preflightReview",
  "publicationLifecycleReceipt",
  "projectionKey", "rightsReview", "privacyReview", "networkSafeReport", "receipt",
]);
const ISSUE_ROLES = ObjectFreeze(["issueBefore", "issueMid", "issueAfter"]);
const COMMENT_ROLES = ObjectFreeze(["commentsA", "commentsB"]);

export const AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
  = deepFreeze({
    position: "PRIVATE_PUBLIC_SOURCE_PRODUCT_DISCOVERY_SNAPSHOT_ONLY",
    offlineAdapterPerformsNetworkIo: false,
    callerProvidedCaptureSlotCount: 5,
    callerProvidedSlotsEstablishExternalHttpOccurrences: false,
    externalHttpResponseOccurrenceCountEstablished: 0,
    acquisitionCaptureManifestMeaningOrControlFlowReplayed: false,
    callerOperatorPolicyPreflightBytesCrosswalkedToManifest: false,
    draftRequiresOperatorPolicyPreflightManifestCrosswalk: true,
    callerManifestPreflightTimingClaimsAreIndependentTime: false,
    reviewerIdentityVerified: false,
    reviewerAuthorityEstablished: false,
    reviewerSignatureVerified: false,
    reviewBasisBytesReplayed: false,
    reviewTimeIndependent: false,
    independentAcquisitionWitnessEstablished: false,
    acquisitionDirectoryMetadataDerivedOnlyFromPinnedPrivateManifest: false,
    draftRequiresMetadataOnlyFromPinnedPrivateManifest: true,
    operatorSuppliedCaptureMetadataAccepted: false,
    callerAcquisitionFilePinsAreExternalProvenance: false,
    fixedCallerProvidedSlotOrderRequired: true,
    callerSlotRequestedVersionMustEqualSelectedVersion: true,
    crossVersionNormalizationAllowed: false,
    weakEtagIsContentRevision: false,
    updatedAtCoversCommentsEventsOrTimeline: false,
    currentSnapshotProvesHistoricalCompleteness: false,
    currentSnapshotProvesNoDeletedOrEditedRecords: false,
    officialProviderBytesEstablishPublisherNarrativeTruth: false,
    providerAccountContinuityEstablishesHumanOrLegalIdentity: false,
    providerClosureOrLabelEstablishesFaultOrOutcome: false,
    privateDirectoryMode: "0700",
    privateFileMode: "0600",
    exactFileAllowlistRequired: true,
    noClobberRequired: true,
    receiptWrittenLastByPublisherControlFlow: false,
    publicationLifecycleReceiptWrittenFirstByPublisherControlFlow: false,
    publicationLifecycleReceiptEstablishesExternalTime: false,
    finalDirectoryReservedByAtomicMkdirNoClobber: false,
    disabledPublisherRequiresLifecycleFirstAndReceiptLast: true,
    atomicWholeDirectoryPublicationEstablished: false,
    sameUserConcurrentMutationOrParentReplacementResistanceEstablished: false,
    rawBodiesRemainPrivate: true,
    rawHeadersRemainPrivate: true,
    networkProjectionContainsUrls: false,
    networkProjectionContainsLogins: false,
    networkProjectionContainsProviderIdsOrNodeIds: false,
    networkProjectionContainsIssueNumber: false,
    networkProjectionContainsRawSha256OrEtag: false,
    networkProjectionContainsOnlyLengthsCountsTypedMissingnessAndKeyedCommitments:
      false,
    draftNetworkProjectionRestrictedToLengthsCountsMissingnessAndCommitments: true,
    projectionKeyEntropyProvenanceEstablished: false,
    commitmentHidingOrCrossCaseUnlinkabilityEstablished: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    redistributionPermissionEstablished: false,
    publicationPermissionEstablished: false,
    retentionPermissionEstablished: false,
    rawRetentionLifecycleEnforcementIntegrated: false,
    currentTimeCheckedBeforeRawRead: false,
    purgeLifecycleIntegrated: false,
    rawReadRejectedBeforePathStatOrBufferCopy: true,
    rawAcquisitionLoaderEnabled: false,
    rawDescendantPublisherEnabled: false,
    rawBundleVerifierEnabled: false,
    networkSafeProjectionPublisherIntegrated: false,
    latentRawBundleImplementationDraftOnly: true,
    localPolicyClockIsIndependentTime: false,
    durablePurgeQueueIntegrated: false,
    liveAcquisitionAllowedBeforePurgeOperatorIntegration: false,
    privateRetentionPurgeDueTimeIsLocalPolicyTimeOnly: true,
    fixedOperatorPolicy: "PRIVATE_LOCAL_SOURCE_REPLAY_ONLY",
    repositoryLicenseCoversIssueProseEstablished: false,
    sourceSpecificRightsReviewGeneratedBeforePublication: false,
    sourceSpecificPrivacyReviewGeneratedBeforePublication: false,
    trainingPermissionEstablished: false,
    contactAttempted: false,
    invitationCreated: false,
    responseCreated: false,
    directHistoricalParticipationVerified: false,
    actualHumanResponseEstablished: false,
    independentOutcomeEstablished: false,
    recoveryEstablished: false,
    trustedExternalFactEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    createsPrincipalEpoch: false,
    createsAccountableDeployment: false,
    createsRuntimeOrEmbodiment: false,
    createsDelegation: false,
    createsEpisode: false,
    createsAttempt: false,
    caseReferenceIsPseudonymousProductDiscoveryOnly: true,
    sourceEntryBound: false,
    sourceEntryState: "PENDING_ACQUISITION",
    appendOnlyLineageEstablished: false,
    acquisitionAttemptIsNotSourceRevisionOrLineage: true,
    predecessorReceiptHash: null,
    supersedesReceiptHash: null,
    externalHeadEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsInsurance: false,
    permitsSettlement: false,
    permitsMoneyMovement: false,
  });

function fail(code, detail = null) {
  throw new TypeErrorConstructor(detail === null
    ? `AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_${code}`
    : `AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_${code}:${detail}`);
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
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (BufferIsBuffer(value)) return;
  if (depth > 96) fail("VALUE_TOO_DEEP");
  if (SetHas(seen, value)) fail("VALUE_CYCLE");
  SetAdd(seen, value);
  budget.nodes += 1;
  if (budget.nodes > MAX_TREE_NODES) fail("VALUE_NODE_BUDGET_EXCEEDED");
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== ArrayPrototype) {
    fail("VALUE_PROTOTYPE_FORBIDDEN");
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > MAX_TREE_KEYS) fail("VALUE_KEY_BUDGET_EXCEEDED");
  if (ArrayIsArray(value)) {
    if (!NumberIsSafeInteger(value.length) || value.length > MAX_TREE_KEYS) {
      fail("ARRAY_LENGTH_INVALID");
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!ObjectHasOwn(descriptors, StringConstructor(index))) {
        fail("SPARSE_ARRAY_FORBIDDEN");
      }
    }
  }
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (typeof keys[index] === "symbol" || !descriptor
      || ObjectHasOwn(descriptor, "get") || ObjectHasOwn(descriptor, "set")) {
      fail("ACCESSOR_OR_SYMBOL_FORBIDDEN");
    }
    if (ObjectHasOwn(descriptor, "value")) {
      rejectTree(descriptor.value, seen, depth + 1, budget);
    }
  }
  SetDelete(seen, value);
}

function ownValue(object, key, code) {
  const descriptor = ObjectGetOwnPropertyDescriptor(object, key);
  if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail(`${code}_FIELD_INVALID`, key);
  return descriptor.value;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || BufferIsBuffer(value) || isProxy(value)
    || ObjectGetPrototypeOf(value) !== ObjectPrototype) fail(`${code}_INVALID`);
  const keys = ReflectOwnKeys(ObjectGetOwnPropertyDescriptors(value));
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    if (!ObjectHasOwn(value, fields[index])) fail(`${code}_FIELDS_INVALID`);
    ownValue(value, fields[index], code);
  }
  return value;
}

function sha256(bytes) {
  const digest = createHash("sha256");
  HashUpdate(digest, bytes);
  return `sha256:${HashDigest(digest, "hex")}`;
}

function canonicalBytes(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function canonicalHash(domain, value) {
  return sha256(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function decodeUtf8Fatal(bytes, code) {
  let text;
  try { text = TextDecoderDecode(UTF8_DECODER, bytes); }
  catch { fail(code); }
  if (text[0] === "\uFEFF") fail(code);
  return text;
}

function skipJsonSpace(text, cursor) {
  while (cursor.index < text.length) {
    const character = text[cursor.index];
    if (character !== " " && character !== "\n" && character !== "\r"
      && character !== "\t") break;
    cursor.index += 1;
  }
}

function scanJsonString(text, cursor, code) {
  if (text[cursor.index] !== "\"") fail(code);
  const start = cursor.index;
  cursor.index += 1;
  while (cursor.index < text.length) {
    const character = text[cursor.index];
    if (character === "\"") {
      cursor.index += 1;
      try { return JSONParse(StringSlice(text, start, cursor.index)); }
      catch { fail(code); }
    }
    if (character === "\\") {
      cursor.index += 2;
      continue;
    }
    cursor.index += 1;
  }
  fail(code);
}

function scanJsonValue(text, cursor, code, depth = 0) {
  if (depth > 96) fail(code);
  skipJsonSpace(text, cursor);
  const character = text[cursor.index];
  if (character === "{") {
    cursor.index += 1;
    skipJsonSpace(text, cursor);
    const keys = new SetConstructor();
    if (text[cursor.index] === "}") { cursor.index += 1; return; }
    while (cursor.index < text.length) {
      const key = scanJsonString(text, cursor, code);
      if (SetHas(keys, key)) fail("DUPLICATE_JSON_KEY", key);
      SetAdd(keys, key);
      skipJsonSpace(text, cursor);
      if (text[cursor.index] !== ":") fail(code);
      cursor.index += 1;
      scanJsonValue(text, cursor, code, depth + 1);
      skipJsonSpace(text, cursor);
      if (text[cursor.index] === "}") { cursor.index += 1; return; }
      if (text[cursor.index] !== ",") fail(code);
      cursor.index += 1;
      skipJsonSpace(text, cursor);
    }
    fail(code);
  }
  if (character === "[") {
    cursor.index += 1;
    skipJsonSpace(text, cursor);
    if (text[cursor.index] === "]") { cursor.index += 1; return; }
    while (cursor.index < text.length) {
      scanJsonValue(text, cursor, code, depth + 1);
      skipJsonSpace(text, cursor);
      if (text[cursor.index] === "]") { cursor.index += 1; return; }
      if (text[cursor.index] !== ",") fail(code);
      cursor.index += 1;
    }
    fail(code);
  }
  if (character === "\"") { scanJsonString(text, cursor, code); return; }
  const start = cursor.index;
  while (cursor.index < text.length) {
    const token = text[cursor.index];
    if (token === "," || token === "]" || token === "}" || token === " "
      || token === "\n" || token === "\r" || token === "\t") break;
    cursor.index += 1;
  }
  if (cursor.index === start) fail(code);
}

function parseJsonStrict(bytes, code) {
  const text = decodeUtf8Fatal(bytes, code);
  const cursor = { index: 0 };
  scanJsonValue(text, cursor, code);
  skipJsonSpace(text, cursor);
  if (cursor.index !== text.length) fail(code);
  let value;
  try { value = JSONParse(text); }
  catch { fail(code); }
  rejectTree(value);
  return value;
}

function framedHmac(key, domain, parts) {
  const mac = createHmac("sha256", key);
  const domainBytes = BufferFrom(domain, "utf8");
  HmacUpdate(mac, BufferFrom(`${domainBytes.length}:`, "ascii"));
  HmacUpdate(mac, domainBytes);
  HmacUpdate(mac, BufferFrom(`${parts.length}:`, "ascii"));
  for (let index = 0; index < parts.length; index += 1) {
    const part = exactObject(parts[index], ["role", "bytes"], "HMAC_PART");
    const role = typeof part.role === "string" ? BufferFrom(part.role, "utf8") : null;
    const bytes = BufferIsBuffer(part.bytes) ? part.bytes : null;
    if (role === null || role.length < 1 || role.length > 128 || bytes === null) {
      fail("HMAC_PART_INVALID");
    }
    HmacUpdate(mac, BufferFrom(`${role.length}:`, "ascii"));
    HmacUpdate(mac, role);
    HmacUpdate(mac, BufferFrom(`${bytes.length}:`, "ascii"));
    HmacUpdate(mac, bytes);
  }
  return `hmac-sha256:${HmacDigest(mac, "hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function parseHttpDate(value, code) {
  if (typeof value !== "string" || value.length < 20 || value.length > 64) fail(code);
  const milliseconds = DateParse(value);
  if (!NumberIsFinite(milliseconds)) fail(code);
  return milliseconds;
}

function validateMeta(value, expectedOrdinal, role) {
  exactObject(value, ["captureOrdinal", "requestMethod", "requestUrl",
    "authVisibilityProfile", "credentialsSent", "redirectCount", "requestAccept",
    "requestAcceptEncoding", "requestedApiVersion", "responseStatus",
    "selectedApiVersion", "etag", "lastModified", "responseDate", "contentType",
    "contentEncoding", "link", "requestId"], "CAPTURE_META");
  const expectedUrl = role === "commentsA" || role === "commentsB"
    ? TARGET.commentsRequestUrl : TARGET.issueRequestUrl;
  if (value.captureOrdinal !== expectedOrdinal || value.requestMethod !== "GET"
    || value.requestUrl !== expectedUrl
    || value.authVisibilityProfile !== TARGET.authVisibilityProfile
    || value.credentialsSent !== false || value.redirectCount !== 0
    || value.requestAccept !== "application/vnd.github+json"
    || value.requestAcceptEncoding !== "identity"
    || value.requestedApiVersion
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS
        .requestedAndSelectedApiVersion
    || value.selectedApiVersion !== value.requestedApiVersion
    || value.responseStatus !== 200
    || !RegExpTest(WEAK_ETAG, value.etag)
    || !(value.lastModified === null || typeof value.lastModified === "string")
    || typeof value.contentType !== "string"
    || !StringStartsWith(StringToLowerCase(value.contentType), "application/json")
    || !(value.contentEncoding === null || value.contentEncoding === "identity")
    || value.link !== null
    || typeof value.requestId !== "string" || value.requestId.length < 8
    || value.requestId.length > 256) fail("CAPTURE_META_INVALID", role);
  const responseDateMs = parseHttpDate(value.responseDate, "RESPONSE_DATE_INVALID");
  if (value.lastModified !== null) {
    parseHttpDate(value.lastModified, "LAST_MODIFIED_INVALID");
  }
  return responseDateMs;
}

function validatePinnedBytes(bytes, pin, role) {
  if (!BufferIsBuffer(bytes) || bytes.length !== pin.bytes
    || bytes.length > MAX_RAW_BYTES || sha256(bytes) !== pin.sha256) {
    fail("SOURCE_PIN_MISMATCH", role);
  }
}

function parseJson(bytes, role) {
  return parseJsonStrict(bytes, `SOURCE_JSON_INVALID:${role}`);
}

function providerRef(value, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)) fail(code);
  const id = ownValue(value, "id", code);
  const nodeId = ownValue(value, "node_id", code);
  if (!NumberIsSafeInteger(id) || id < 1 || typeof nodeId !== "string"
    || nodeId.length < 4 || nodeId.length > 256) fail(code);
  return { id, nodeId };
}

function sourceSemantics(parsed) {
  const issue = parsed.issueBefore;
  if (issue === null || typeof issue !== "object" || ArrayIsArray(issue)) {
    fail("ISSUE_OBJECT_INVALID");
  }
  const issueRef = providerRef(issue, "ISSUE_REFERENCE_INVALID");
  const publisherRef = providerRef(ownValue(issue, "user", "ISSUE"),
    "ISSUE_PUBLISHER_REFERENCE_INVALID");
  const publisher = ownValue(issue, "user", "ISSUE");
  const issueNumber = ownValue(issue, "number", "ISSUE");
  const issueUrl = ownValue(issue, "url", "ISSUE");
  const repositoryUrl = ownValue(issue, "repository_url", "ISSUE");
  const issueHtmlUrl = ownValue(issue, "html_url", "ISSUE");
  const declaredCommentCount = ownValue(issue, "comments", "ISSUE");
  if (issueNumber !== TARGET.issueNumber || issueUrl !== TARGET.issueRequestUrl
    || repositoryUrl !== TARGET.repositoryUrl || issueHtmlUrl !== TARGET.issueHtmlUrl
    || ObjectHasOwn(issue, "pull_request")
    || typeof ownValue(publisher, "login", "ISSUE_PUBLISHER") !== "string"
    || typeof ownValue(publisher, "url", "ISSUE_PUBLISHER") !== "string"
    || typeof ownValue(publisher, "html_url", "ISSUE_PUBLISHER") !== "string"
    || typeof ownValue(publisher, "avatar_url", "ISSUE_PUBLISHER") !== "string"
    || ownValue(publisher, "type", "ISSUE_PUBLISHER") !== "User"
    || typeof ownValue(publisher, "site_admin", "ISSUE_PUBLISHER") !== "boolean"
    || declaredCommentCount
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments
        .expectedCurrentObjectCount
    || !same(parsed.issueBefore, parsed.issueMid)
    || !same(parsed.issueBefore, parsed.issueAfter)) fail("ISSUE_BRACKET_CROSSWALK_INVALID");

  if (!ArrayIsArray(parsed.commentsA) || !ArrayIsArray(parsed.commentsB)
    || parsed.commentsA.length !== declaredCommentCount
    || !same(parsed.commentsA, parsed.commentsB)) fail("COMMENTS_BRACKET_INVALID");

  const commentIds = new SetConstructor();
  const commentNodeIds = new SetConstructor();
  let publisherAccountCommentCount = 0;
  let botCommentCount = 0;
  let priorId = -1;
  for (let index = 0; index < parsed.commentsA.length; index += 1) {
    const comment = parsed.commentsA[index];
    if (comment === null || typeof comment !== "object" || ArrayIsArray(comment)) {
      fail("COMMENT_OBJECT_INVALID", StringConstructor(index));
    }
    const ref = providerRef(comment, "COMMENT_REFERENCE_INVALID");
    const author = providerRef(ownValue(comment, "user", "COMMENT"),
      "COMMENT_AUTHOR_REFERENCE_INVALID");
    if (ref.id <= priorId || SetHas(commentIds, ref.id)
      || SetHas(commentNodeIds, ref.nodeId)
      || ownValue(comment, "issue_url", "COMMENT") !== issueUrl) {
      fail("COMMENT_CROSSWALK_INVALID", StringConstructor(index));
    }
    priorId = ref.id;
    SetAdd(commentIds, ref.id);
    SetAdd(commentNodeIds, ref.nodeId);
    if (author.id === publisherRef.id && author.nodeId === publisherRef.nodeId) {
      publisherAccountCommentCount += 1;
    }
    if (ownValue(ownValue(comment, "user", "COMMENT"), "type", "COMMENT") === "Bot") {
      botCommentCount += 1;
    }
  }
  if (publisherAccountCommentCount !== 2 || botCommentCount !== 1) {
    fail("EXPECTED_CURRENT_COMMENT_COMPOSITION_INVALID");
  }
  return {
    issueRef, publisherRef, issueNumber, issueUrl, repositoryUrl, issueHtmlUrl,
    currentCommentObjectCount: parsed.commentsA.length,
    publisherAccountCommentCount, botCommentCount,
  };
}

function collectPrivateIdentityTokens(value, output) {
  if (value === null || typeof value !== "object") return;
  if (ArrayIsArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectPrivateIdentityTokens(value[index], output);
    }
    return;
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const item = descriptors[key].value;
    const lower = StringToLowerCase(key);
    const sensitive = lower === "id" || lower === "node_id" || lower === "number"
      || lower === "login" || lower === "url" || StringEndsWithSafe(lower, "_url")
      || lower === "avatar_url" || lower === "gravatar_id";
    if (sensitive && (typeof item === "string" || typeof item === "number")) {
      const token = StringConstructor(item);
      if (token.length > 0) output[output.length] = token;
    }
    if (item !== null && typeof item === "object") {
      collectPrivateIdentityTokens(item, output);
    }
  }
}

function StringEndsWithSafe(value, suffix) {
  if (suffix.length > value.length) return false;
  return StringSlice(value, value.length - suffix.length) === suffix;
}

function assertProjectionSafe(report, parsed, semantics, privateReceiptBase) {
  const forbidden = [semantics.issueUrl, semantics.repositoryUrl,
    semantics.issueHtmlUrl, StringConstructor(semantics.issueNumber),
    privateReceiptBase.sourcePins.issue.sha256,
    privateReceiptBase.sourcePins.comments.sha256];
  collectPrivateIdentityTokens(parsed.issueBefore, forbidden);
  collectPrivateIdentityTokens(parsed.commentsA, forbidden);
  for (let index = 0; index < privateReceiptBase.captureMetadata.length; index += 1) {
    forbidden[forbidden.length] = privateReceiptBase.captureMetadata[index].etag;
    forbidden[forbidden.length] = privateReceiptBase.captureMetadata[index].requestId;
    forbidden[forbidden.length] = privateReceiptBase.captureMetadata[index].requestUrl;
  }
  const safeView = JSONParse(canonicalizeStrict(report));
  safeView.commitments.sourceSetCommitment = "KEYED_COMMITMENT_REDACTED";
  safeView.commitments.bracketCommitment = "KEYED_COMMITMENT_REDACTED";
  safeView.commitments.rightsReviewCommitment = "KEYED_COMMITMENT_REDACTED";
  safeView.commitments.privacyReviewCommitment = "KEYED_COMMITMENT_REDACTED";
  safeView.reportHash = "DOMAIN_HASH_REDACTED";
  const serialized = canonicalizeStrict(safeView);
  if (RegExpTest(/https?:\/\//iu, serialized)
    || RegExpTest(/"(?:login|id|node_id|issue_number|etag|url)"\s*:/iu, serialized)) {
    fail("NETWORK_PROJECTION_PRIVATE_FIELD_LEAK");
  }
  for (let index = 0; index < forbidden.length; index += 1) {
    if (typeof forbidden[index] === "string" && forbidden[index].length > 0
      && StringIncludes(serialized, JSONStringify(forbidden[index]))) {
      fail("NETWORK_PROJECTION_VALUE_LEAK");
    }
  }
}

function captureInput(input, key, ordinal) {
  const capture = exactObject(ownValue(input.captures, key, "CAPTURES"),
    ["bytes", "meta"], "CAPTURE");
  const responseDateMs = validateMeta(capture.meta, ordinal, key);
  const pin = key === "commentsA" || key === "commentsB"
    ? AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments
    : AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue;
  if (!BufferIsBuffer(capture.bytes) || capture.bytes.length !== pin.bytes) {
    fail("SOURCE_PIN_MISMATCH", key);
  }
  const stableBytes = BufferFrom(capture.bytes);
  validatePinnedBytes(stableBytes, pin, key);
  return { bytes: stableBytes, meta: copyCaptureMeta(capture.meta), responseDateMs,
    parsed: parseJson(stableBytes, key) };
}

function copyCaptureMeta(value) {
  return {
    captureOrdinal: value.captureOrdinal,
    requestMethod: value.requestMethod,
    requestUrl: value.requestUrl,
    authVisibilityProfile: value.authVisibilityProfile,
    credentialsSent: value.credentialsSent,
    redirectCount: value.redirectCount,
    requestAccept: value.requestAccept,
    requestAcceptEncoding: value.requestAcceptEncoding,
    requestedApiVersion: value.requestedApiVersion,
    responseStatus: value.responseStatus,
    selectedApiVersion: value.selectedApiVersion,
    etag: value.etag,
    lastModified: value.lastModified,
    responseDate: value.responseDate,
    contentType: value.contentType,
    contentEncoding: value.contentEncoding,
    link: value.link,
    requestId: value.requestId,
  };
}

function acquisitionCandidateTarget() {
  return {
    sourceClass: "PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT",
    issueRequestUrl: TARGET.issueRequestUrl,
    commentsRequestUrl: TARGET.commentsRequestUrl,
    requestedApiVersion:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS
        .requestedAndSelectedApiVersion,
  };
}

function canonicalUtcMilliseconds(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)) fail(code);
  const milliseconds = DateParse(value);
  if (!NumberIsFinite(milliseconds)
    || DateToISOString(new DateConstructor(milliseconds)) !== value) fail(code);
  return milliseconds;
}

function preflightReviewBase(reviewId, reviewedAt, validThrough,
  reviewerPairwiseAlias, reviewBasisCommitment, retentionSeconds) {
  return {
    schema:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.preflightReview,
    candidateTarget: acquisitionCandidateTarget(),
    operatorReviewOccurrence: {
      reviewId,
      reviewedAt,
      validThrough,
      reviewerPairwiseAlias,
      reviewBasisCommitment,
      callerSuppliedReviewTimeIsExternalTime: false,
      reviewerIdentityVerified: false,
      reviewerAuthorityEstablished: false,
      reviewSignatureVerified: false,
      reviewBasisReplayed: false,
    },
    acquisitionScope: {
      targetProfileHash: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH,
      purpose: "STAGE1_PRIVATE_PRODUCT_DISCOVERY_RECONSTRUCTION",
      audience: "PRIVATE_LOCAL_OPERATOR_ONLY",
      maxCaptureSlots: 5,
      maxRawBytes:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.bracketRawBytes,
      retentionSeconds,
      allowedOperations: ["ANONYMOUS_GET_FIXED_TARGET",
        "PRIVATE_LOCAL_STORAGE", "OFFLINE_REPLAY"],
    },
    operatorPolicy: {
      policyName: "PRIVATE_LOCAL_SOURCE_REPLAY_ONLY",
      operatorDecision: "ALLOW_BOUNDED_PRIVATE_CAPTURE",
      maximumRetentionSeconds: MAX_RETENTION_SECONDS,
      rawIdentifiersExpected: true,
      publicVisibilityIsRedistributionPermission: false,
      redistribution: false,
      publication: false,
      training: false,
      contact: false,
      externalFact: false,
      authority: false,
      action: false,
      economics: false,
    },
    legalBoundary: {
      repositoryLicenseCoversIssueProseEstablished: false,
      privateLocalReplayLegalPermissionEstablished: false,
      retentionLegalClearanceEstablished: false,
      redistributionLegalClearanceEstablished: false,
      privacyClearanceEstablished: false,
      legalClearanceEstablished: false,
    },
    decision: "ALLOW_BOUNDED_PRIVATE_CAPTURE",
  };
}

function parsePreflightReview(bytes) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2 || bytes.length > 32 * 1024) {
    fail("PREFLIGHT_REVIEW_BYTES_INVALID");
  }
  const review = parseJsonStrict(bytes, "PREFLIGHT_REVIEW_JSON_INVALID");
  exactObject(review, ["schema", "candidateTarget", "operatorReviewOccurrence",
    "acquisitionScope", "operatorPolicy", "legalBoundary", "decision",
    "reviewHash"],
  "PREFLIGHT_REVIEW");
  exactObject(review.candidateTarget, ["sourceClass", "issueRequestUrl",
    "commentsRequestUrl", "requestedApiVersion"], "PREFLIGHT_TARGET");
  const occurrence = exactObject(review.operatorReviewOccurrence,
    ["reviewId", "reviewedAt", "validThrough", "reviewerPairwiseAlias",
      "reviewBasisCommitment", "callerSuppliedReviewTimeIsExternalTime",
      "reviewerIdentityVerified", "reviewerAuthorityEstablished",
      "reviewSignatureVerified", "reviewBasisReplayed"],
    "PREFLIGHT_REVIEW_OCCURRENCE");
  const reviewedAtMs = canonicalUtcMilliseconds(occurrence.reviewedAt,
    "PREFLIGHT_REVIEWED_AT_INVALID");
  const validThroughMs = canonicalUtcMilliseconds(occurrence.validThrough,
    "PREFLIGHT_VALID_THROUGH_INVALID");
  if (!RegExpTest(REVIEW_ID, occurrence.reviewId)
    || occurrence.reviewId === "awo_00000000000000000000000000000000"
    || !RegExpTest(REVIEWER_ALIAS, occurrence.reviewerPairwiseAlias)
    || occurrence.reviewerPairwiseAlias
      === "reviewer_00000000000000000000000000000000"
    || !RegExpTest(HASH, occurrence.reviewBasisCommitment)
    || occurrence.reviewBasisCommitment === ZERO_HASH
    || occurrence.callerSuppliedReviewTimeIsExternalTime !== false
    || occurrence.reviewerIdentityVerified !== false
    || occurrence.reviewerAuthorityEstablished !== false
    || occurrence.reviewSignatureVerified !== false
    || occurrence.reviewBasisReplayed !== false
    || validThroughMs <= reviewedAtMs
    || validThroughMs - reviewedAtMs > MAX_PREFLIGHT_WINDOW_MS) {
    fail("PREFLIGHT_REVIEW_OCCURRENCE_INVALID");
  }
  const scope = exactObject(review.acquisitionScope,
    ["targetProfileHash", "purpose", "audience", "maxCaptureSlots",
      "maxRawBytes", "retentionSeconds", "allowedOperations"],
    "PREFLIGHT_ACQUISITION_SCOPE");
  if (!NumberIsSafeInteger(scope.retentionSeconds)
    || scope.retentionSeconds < 1
    || scope.retentionSeconds > MAX_RETENTION_SECONDS) {
    fail("PREFLIGHT_RETENTION_INVALID");
  }
  const expectedBase = preflightReviewBase(occurrence.reviewId,
    occurrence.reviewedAt, occurrence.validThrough,
    occurrence.reviewerPairwiseAlias, occurrence.reviewBasisCommitment,
    scope.retentionSeconds);
  const expectedHash = canonicalHash(
    "outsider.autonomous-work-order.github-discovery.acquisition-preflight-review.v1",
    expectedBase);
  if (!same(review, { ...expectedBase, reviewHash: expectedHash })
    || review.reviewHash !== expectedHash
    || !BufferEquals(bytes, canonicalBytes(review))) {
    fail("PREFLIGHT_REVIEW_REPLAY_INVALID");
  }
  return review;
}

export function createAutonomousWorkOrderGithubDiscoveryPreflightReview(input) {
  rejectTree(input);
  exactObject(input, ["reviewId", "reviewedAt", "validThrough",
    "reviewerPairwiseAlias", "reviewBasisCommitment", "retentionSeconds"],
  "CREATE_PREFLIGHT_REVIEW_INPUT");
  const reviewId = ownValue(input, "reviewId", "CREATE_PREFLIGHT_REVIEW_INPUT");
  const reviewedAt = ownValue(input, "reviewedAt",
    "CREATE_PREFLIGHT_REVIEW_INPUT");
  const validThrough = ownValue(input, "validThrough",
    "CREATE_PREFLIGHT_REVIEW_INPUT");
  const reviewerPairwiseAlias = ownValue(input, "reviewerPairwiseAlias",
    "CREATE_PREFLIGHT_REVIEW_INPUT");
  const reviewBasisCommitment = ownValue(input, "reviewBasisCommitment",
    "CREATE_PREFLIGHT_REVIEW_INPUT");
  const retentionSeconds = ownValue(input, "retentionSeconds",
    "CREATE_PREFLIGHT_REVIEW_INPUT");
  const base = preflightReviewBase(reviewId, reviewedAt, validThrough,
    reviewerPairwiseAlias, reviewBasisCommitment, retentionSeconds);
  parsePreflightReview(canonicalBytes({ ...base, reviewHash: canonicalHash(
    "outsider.autonomous-work-order.github-discovery.acquisition-preflight-review.v1",
    base) }));
  return canonicalBytes({ ...base, reviewHash: canonicalHash(
    "outsider.autonomous-work-order.github-discovery.acquisition-preflight-review.v1",
    base) });
}

export function parseAutonomousWorkOrderGithubDiscoveryPreflightReview(bytes) {
  return deepFreeze(parsePreflightReview(bytes));
}

function parseAcquisitionLifecycleReceipt(bytes, preflightReview,
  preflightReviewBytes) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2 || bytes.length > 32 * 1024) {
    fail("ACQUISITION_LIFECYCLE_RECEIPT_BYTES_INVALID");
  }
  const receipt = parseJsonStrict(bytes,
    "ACQUISITION_LIFECYCLE_RECEIPT_JSON_INVALID");
  exactObject(receipt, ["schema", "attemptId", "state", "preflightReviewHash",
    "preflightReviewFileSha256", "targetProfileHash", "transportClass",
    "startedAtPublisherClock", "publisherClockIsIndependentTime",
    "retentionSeconds", "retentionUntilPublisherClock", "purgeRequired",
    "manifestLastRequiredForTerminalInterpretation",
    "wholeDirectoryAtomicPublicationEstablished",
    "independentOccurrenceWitness", "externalProvenanceEstablished"],
  "ACQUISITION_LIFECYCLE_RECEIPT");
  const startedAtMs = canonicalUtcMilliseconds(receipt.startedAtPublisherClock,
    "ACQUISITION_LIFECYCLE_STARTED_AT_INVALID");
  const retentionUntilMs = canonicalUtcMilliseconds(
    receipt.retentionUntilPublisherClock,
    "ACQUISITION_LIFECYCLE_RETENTION_UNTIL_INVALID");
  const reviewedAtMs = canonicalUtcMilliseconds(
    preflightReview.operatorReviewOccurrence.reviewedAt,
    "PREFLIGHT_REVIEWED_AT_INVALID");
  const validThroughMs = canonicalUtcMilliseconds(
    preflightReview.operatorReviewOccurrence.validThrough,
    "PREFLIGHT_VALID_THROUGH_INVALID");
  const retentionSeconds = preflightReview.acquisitionScope.retentionSeconds;
  if (receipt.schema !== ACQUISITION_LIFECYCLE_RECEIPT_SCHEMA
    || !RegExpTest(ACQUISITION_ATTEMPT_ID, receipt.attemptId)
    || receipt.attemptId === "acq_00000000000000000000000000000000"
    || receipt.state !== "INCOMPLETE"
    || receipt.preflightReviewHash !== preflightReview.reviewHash
    || receipt.preflightReviewFileSha256 !== sha256(preflightReviewBytes)
    || receipt.targetProfileHash
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH
    || receipt.transportClass !== "NODE_HTTPS_FIXED_PUBLIC_API"
    || receipt.publisherClockIsIndependentTime !== false
    || receipt.retentionSeconds !== retentionSeconds
    || retentionUntilMs !== startedAtMs + retentionSeconds * 1000
    || startedAtMs < reviewedAtMs || startedAtMs > validThroughMs
    || receipt.purgeRequired !== true
    || receipt.manifestLastRequiredForTerminalInterpretation !== true
    || receipt.wholeDirectoryAtomicPublicationEstablished !== false
    || receipt.independentOccurrenceWitness !== false
    || receipt.externalProvenanceEstablished !== false
    || !BufferEquals(bytes, canonicalBytes(receipt))) {
    fail("ACQUISITION_LIFECYCLE_RECEIPT_REPLAY_INVALID");
  }
  return { receipt, startedAtMs, retentionUntilMs };
}

function assertLocalRetentionWindowAllowsRawRead(acquisitionLifecycle) {
  const localNowMs = DateNow();
  if (!NumberIsFinite(localNowMs)
    || localNowMs < acquisitionLifecycle.startedAtMs) {
    fail("LOCAL_POLICY_CLOCK_BEFORE_ACQUISITION_RAW_READ_FORBIDDEN");
  }
  if (localNowMs >= acquisitionLifecycle.retentionUntilMs) {
    fail("RETENTION_EXPIRED_RAW_READ_FORBIDDEN");
  }
  return localNowMs;
}

function validateAcquisitionManifest(bytes, captures, preflightReview,
  preflightReviewBytes, lifecycle, lifecycleBytes) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2 || bytes.length > 128 * 1024) {
    fail("ACQUISITION_MANIFEST_BYTES_INVALID");
  }
  const manifest = parseJsonStrict(bytes, "ACQUISITION_MANIFEST_JSON_INVALID");
  exactObject(manifest, ["schema", "transportClass", "acquisitionAttempt",
    "preflightReviewBinding", "captureSequence", "controlFlowBoundary",
    "requestPolicy", "invariants", "semantics", "source", "sourceEntry",
    "truthBoundary"], "ACQUISITION_MANIFEST");
  if (manifest.schema !== CAPTURE_MANIFEST_SCHEMA
    || manifest.transportClass !== "NODE_HTTPS_FIXED_PUBLIC_API"
    || !BufferEquals(bytes, canonicalBytes(manifest))) {
    fail("ACQUISITION_MANIFEST_FIXED_BOUNDARY_INVALID");
  }

  const reviewStartMs = canonicalUtcMilliseconds(
    preflightReview.operatorReviewOccurrence.reviewedAt,
    "PREFLIGHT_REVIEWED_AT_INVALID");
  const reviewEndMs = canonicalUtcMilliseconds(
    preflightReview.operatorReviewOccurrence.validThrough,
    "PREFLIGHT_VALID_THROUGH_INVALID");
  const attempt = exactObject(manifest.acquisitionAttempt,
    ["attemptId", "startedAtPublisherClock", "completedAtPublisherClock",
      "publisherClockIsIndependentTime", "terminalState",
      "initialLifecycleReceiptFile", "initialLifecycleReceiptBytes",
      "initialLifecycleReceiptSha256", "retentionSeconds",
      "retentionUntilPublisherClock", "purgeRequired",
      "manifestLastRequiredForTerminalInterpretation",
      "wholeDirectoryAtomicPublicationEstablished"],
    "ACQUISITION_MANIFEST_ATTEMPT");
  const startedAtMs = canonicalUtcMilliseconds(attempt.startedAtPublisherClock,
    "ACQUISITION_MANIFEST_STARTED_AT_INVALID");
  const completedAtMs = canonicalUtcMilliseconds(attempt.completedAtPublisherClock,
    "ACQUISITION_MANIFEST_COMPLETED_AT_INVALID");
  const retentionUntilMs = canonicalUtcMilliseconds(
    attempt.retentionUntilPublisherClock,
    "ACQUISITION_MANIFEST_RETENTION_UNTIL_INVALID");
  if (attempt.attemptId !== lifecycle.receipt.attemptId
    || attempt.startedAtPublisherClock
      !== lifecycle.receipt.startedAtPublisherClock
    || attempt.publisherClockIsIndependentTime !== false
    || attempt.terminalState !== "COMPLETE"
    || attempt.initialLifecycleReceiptFile
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES
        .acquisitionLifecycleReceipt
    || attempt.initialLifecycleReceiptBytes !== lifecycleBytes.length
    || attempt.initialLifecycleReceiptSha256 !== sha256(lifecycleBytes)
    || attempt.retentionSeconds !== preflightReview.acquisitionScope.retentionSeconds
    || attempt.retentionSeconds !== lifecycle.receipt.retentionSeconds
    || attempt.retentionUntilPublisherClock
      !== lifecycle.receipt.retentionUntilPublisherClock
    || attempt.purgeRequired !== true
    || attempt.manifestLastRequiredForTerminalInterpretation !== true
    || attempt.wholeDirectoryAtomicPublicationEstablished !== false
    || startedAtMs !== lifecycle.startedAtMs || retentionUntilMs
      !== lifecycle.retentionUntilMs
    || startedAtMs < reviewStartMs || completedAtMs < startedAtMs
    || completedAtMs > reviewEndMs || completedAtMs > retentionUntilMs) {
    fail("ACQUISITION_MANIFEST_ATTEMPT_INVALID");
  }

  const preflightBinding = exactObject(manifest.preflightReviewBinding,
    ["file", "bytes", "sha256", "reviewHash", "targetProfileHash",
      "reviewValidatedBeforeDirectoryCreation",
      "reviewValidatedBeforeFirstNetworkRequest", "captureStartedAfterReview",
      "localPolicyWindowSatisfiedAtStart", "publisherControlFlowFactOnly",
      "independentReviewTimingWitness"], "ACQUISITION_MANIFEST_PREFLIGHT");
  if (preflightBinding.file
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES.preflightReview
    || preflightBinding.bytes !== preflightReviewBytes.length
    || preflightBinding.sha256 !== sha256(preflightReviewBytes)
    || preflightBinding.reviewHash !== preflightReview.reviewHash
    || preflightBinding.targetProfileHash
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH
    || preflightBinding.reviewValidatedBeforeDirectoryCreation !== true
    || preflightBinding.reviewValidatedBeforeFirstNetworkRequest !== true
    || preflightBinding.captureStartedAfterReview !== true
    || preflightBinding.localPolicyWindowSatisfiedAtStart !== true
    || preflightBinding.publisherControlFlowFactOnly !== true
    || preflightBinding.independentReviewTimingWitness !== false) {
    fail("ACQUISITION_MANIFEST_PREFLIGHT_INVALID");
  }

  const control = exactObject(manifest.controlFlowBoundary,
    ["preflightValidatedBeforePrivateDirectoryCreation",
      "preflightValidatedBeforeFirstNetworkRequest",
      "fixedSequenceExecutedByPublisherControlFlow",
      "finalDirectoryReservedByAtomicMkdirNoClobber",
      "sameUserParentReplacementResistanceEstablished",
      "independentOccurrenceWitness", "publisherControlFlowFactOnly"],
    "ACQUISITION_MANIFEST_CONTROL_FLOW");
  if (control.preflightValidatedBeforePrivateDirectoryCreation !== true
    || control.preflightValidatedBeforeFirstNetworkRequest !== true
    || control.fixedSequenceExecutedByPublisherControlFlow !== true
    || control.finalDirectoryReservedByAtomicMkdirNoClobber !== true
    || control.sameUserParentReplacementResistanceEstablished !== false
    || control.independentOccurrenceWitness !== false
    || control.publisherControlFlowFactOnly !== true) {
    fail("ACQUISITION_MANIFEST_CONTROL_FLOW_INVALID");
  }

  const policy = exactObject(manifest.requestPolicy,
    ["accept", "acceptEncoding", "apiOrigin", "authVisibilityProfile",
      "authenticationReadOrSent", "cookiesReadOrSent",
      "contactOrMutationSideEffect", "exactGetCount", "redirectFollowing",
      "retries", "requestedApiVersion", "tlsRejectUnauthorized",
      "tlsServername", "requestAbsoluteDeadlineMs", "bracketAbsoluteDeadlineMs"],
    "ACQUISITION_MANIFEST_REQUEST_POLICY");
  if (policy.accept !== "application/vnd.github+json"
    || policy.acceptEncoding !== "identity"
    || policy.apiOrigin !== "https://api.github.com"
    || policy.authVisibilityProfile !== TARGET.authVisibilityProfile
    || policy.authenticationReadOrSent !== false
    || policy.cookiesReadOrSent !== false
    || policy.contactOrMutationSideEffect !== false || policy.exactGetCount !== 5
    || policy.redirectFollowing !== false || policy.retries !== 0
    || policy.requestedApiVersion
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS
        .requestedAndSelectedApiVersion
    || policy.tlsRejectUnauthorized !== true
    || policy.tlsServername !== "api.github.com"
    || policy.requestAbsoluteDeadlineMs !== 30_000
    || policy.bracketAbsoluteDeadlineMs !== 180_000) {
    fail("ACQUISITION_MANIFEST_REQUEST_POLICY_INVALID");
  }

  const invariants = exactObject(manifest.invariants,
    ["issueByteLengthPin", "issueSha256Pin", "commentsByteLengthPin",
      "commentsSha256Pin", "issueBeforeMidAfterRawExact",
      "issueBeforeMidAfterSemanticExact", "commentsScanAAndBRawExact",
      "commentsScanAAndBSemanticExact", "fiveRequestIdsDistinct",
      "responseDatesMonotonic", "linkHeaderNullOnEveryCapture"],
    "ACQUISITION_MANIFEST_INVARIANTS");
  if (invariants.issueByteLengthPin !== 10_175
    || invariants.issueSha256Pin
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.sha256
    || invariants.commentsByteLengthPin !== 16_132
    || invariants.commentsSha256Pin
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.sha256
    || invariants.issueBeforeMidAfterRawExact !== true
    || invariants.issueBeforeMidAfterSemanticExact !== true
    || invariants.commentsScanAAndBRawExact !== true
    || invariants.commentsScanAAndBSemanticExact !== true
    || invariants.fiveRequestIdsDistinct !== true
    || invariants.responseDatesMonotonic !== true
    || invariants.linkHeaderNullOnEveryCapture !== true) {
    fail("ACQUISITION_MANIFEST_INVARIANTS_INVALID");
  }

  const semantics = exactObject(manifest.semantics,
    ["commentsPage", "commentsPerPage", "commentsPageTerminalAtCapture",
      "issueDeclaredCommentCount", "visibleCommentsCaptured",
      "uniqueVisibleCommentIds", "fullEditOrDeletionHistoryEstablished"],
    "ACQUISITION_MANIFEST_SEMANTICS");
  if (semantics.commentsPage !== 1 || semantics.commentsPerPage !== 100
    || semantics.commentsPageTerminalAtCapture !== true
    || semantics.issueDeclaredCommentCount !== 6
    || semantics.visibleCommentsCaptured !== 6
    || semantics.uniqueVisibleCommentIds !== 6
    || semantics.fullEditOrDeletionHistoryEstablished !== false) {
    fail("ACQUISITION_MANIFEST_SEMANTICS_INVALID");
  }

  const source = exactObject(manifest.source,
    ["sourceClass", "repository", "issueApiUrl", "commentsApiUrl",
      "mutablePublicApi", "revisionPinned", "contentHashPinned"],
    "ACQUISITION_MANIFEST_SOURCE");
  if (source.sourceClass !== "PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT"
    || source.repository !== "anthropics/claude-code"
    || source.issueApiUrl !== TARGET.issueRequestUrl
    || source.commentsApiUrl !== TARGET.commentsRequestUrl
    || source.mutablePublicApi !== true || source.revisionPinned !== false
    || source.contentHashPinned !== true) fail("ACQUISITION_MANIFEST_SOURCE_INVALID");

  const sourceEntry = exactObject(manifest.sourceEntry,
    ["bound", "disposition", "eligibleForPrivateStructuralReplay"],
    "ACQUISITION_MANIFEST_SOURCE_ENTRY");
  if (sourceEntry.bound !== false
    || sourceEntry.disposition !== "PENDING_ACQUISITION"
    || sourceEntry.eligibleForPrivateStructuralReplay !== true) {
    fail("ACQUISITION_MANIFEST_SOURCE_ENTRY_INVALID");
  }

  const truth = exactObject(manifest.truthBoundary,
    ["localAcquisitionAttemptOnly", "externalHttpOccurrenceCountEstablished",
      "externalProvenanceEstablished", "independentOccurrenceWitnessEstablished",
      "serverDatesRequestIdsEtagsOrTlsMetadataAreIndependentProvenance",
      "officialIncidentSource", "directParticipantConfirmation",
      "externalOutcomeTruth", "recoveryTruth", "completeAttemptCensusEstablished",
      "currentSnapshotProvesHistoricalCompleteness", "reviewerIdentityVerified",
      "reviewerAuthorityEstablished", "reviewSignatureVerified",
      "reviewBasisReplayed", "reviewTimeIsIndependent",
      "legalClearanceEstablished", "redistributionPermissionEstablished",
      "publicationPermissionEstablished", "trainingPermissionEstablished",
      "networkProjectionEmitted", "networkAdmissionRows", "authorityUnits",
      "actionUnits", "CEU", "pricingUnits", "guaranteeUnits", "settlementUnits",
      "trustedVerification", "decisionState"],
    "ACQUISITION_MANIFEST_TRUTH_BOUNDARY");
  if (truth.localAcquisitionAttemptOnly !== true
    || truth.externalHttpOccurrenceCountEstablished !== 0
    || truth.externalProvenanceEstablished !== false
    || truth.independentOccurrenceWitnessEstablished !== false
    || truth.serverDatesRequestIdsEtagsOrTlsMetadataAreIndependentProvenance
      !== false
    || truth.officialIncidentSource !== false
    || truth.directParticipantConfirmation !== false
    || truth.externalOutcomeTruth !== false || truth.recoveryTruth !== false
    || truth.completeAttemptCensusEstablished !== false
    || truth.currentSnapshotProvesHistoricalCompleteness !== false
    || truth.reviewerIdentityVerified !== false
    || truth.reviewerAuthorityEstablished !== false
    || truth.reviewSignatureVerified !== false
    || truth.reviewBasisReplayed !== false
    || truth.reviewTimeIsIndependent !== false
    || truth.legalClearanceEstablished !== false
    || truth.redistributionPermissionEstablished !== false
    || truth.publicationPermissionEstablished !== false
    || truth.trainingPermissionEstablished !== false
    || truth.networkProjectionEmitted !== false || truth.networkAdmissionRows !== 0
    || truth.authorityUnits !== 0 || truth.actionUnits !== 0 || truth.CEU !== 0
    || truth.pricingUnits !== 0 || truth.guaranteeUnits !== 0
    || truth.settlementUnits !== 0 || truth.trustedVerification !== "NOT_INTEGRATED"
    || truth.decisionState !== "HOLD") {
    fail("ACQUISITION_MANIFEST_TRUTH_BOUNDARY_INVALID");
  }

  if (!ArrayIsArray(manifest.captureSequence)
    || manifest.captureSequence.length !== MANIFEST_ROLE_BINDINGS.length) {
    fail("ACQUISITION_MANIFEST_CAPTURE_SEQUENCE_INVALID");
  }
  let priorAcquiredAtMs = -Infinity;
  for (let index = 0; index < MANIFEST_ROLE_BINDINGS.length; index += 1) {
    const binding = MANIFEST_ROLE_BINDINGS[index];
    const row = exactObject(manifest.captureSequence[index],
      ["role", "file", "body", "acquiredAtPublisherClock",
        "acquiredAtIsIndependentTime", "meta", "transport"],
      "ACQUISITION_MANIFEST_CAPTURE_ROW");
    const body = exactObject(row.body, ["byteLength", "sha256"],
      "ACQUISITION_MANIFEST_CAPTURE_BODY");
    const transport = exactObject(row.transport,
      ["requestUrl", "finalUrl", "redirected", "transportClass",
        "tlsRejectUnauthorized", "tlsServername", "requestAbsoluteDeadlineMs",
        "bracketAbsoluteDeadlineMs"], "ACQUISITION_MANIFEST_CAPTURE_TRANSPORT");
    const capture = captures === null
      ? { meta: copyCaptureMeta(row.meta),
        responseDateMs: validateMeta(row.meta, index + 1, binding.key) }
      : captures[binding.key];
    const expectedPin = binding.key === "commentsA" || binding.key === "commentsB"
      ? AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments
      : AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue;
    const acquiredAtMs = canonicalUtcMilliseconds(row.acquiredAtPublisherClock,
      "ACQUISITION_MANIFEST_CAPTURE_TIME_INVALID");
    if (row.role !== binding.role || row.file !== binding.file
      || body.byteLength !== expectedPin.bytes || body.sha256 !== expectedPin.sha256
      || row.acquiredAtIsIndependentTime !== false
      || acquiredAtMs < priorAcquiredAtMs || acquiredAtMs < startedAtMs
      || acquiredAtMs > completedAtMs || acquiredAtMs < reviewStartMs
      || acquiredAtMs > reviewEndMs || capture.responseDateMs < reviewStartMs
      || capture.responseDateMs > reviewEndMs || !same(row.meta, capture.meta)
      || transport.requestUrl !== binding.url || transport.finalUrl !== binding.url
      || transport.redirected !== false
      || transport.transportClass !== "NODE_HTTPS_FIXED_PUBLIC_API"
      || transport.tlsRejectUnauthorized !== true
      || transport.tlsServername !== "api.github.com"
      || transport.requestAbsoluteDeadlineMs !== 30_000
      || transport.bracketAbsoluteDeadlineMs !== 180_000) {
      fail("ACQUISITION_MANIFEST_CAPTURE_CROSSWALK_INVALID", binding.role);
    }
    priorAcquiredAtMs = acquiredAtMs;
  }
  return { manifest, startedAtMs, completedAtMs, retentionUntilMs };
}

function rightsReviewFor(sourceSetCommitment, bracketCommitment) {
  const base = {
    schema: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.rightsReview,
    sourceClass: "PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT",
    sourceSetCommitment,
    bracketCommitment,
    operatorPolicy: "PRIVATE_LOCAL_SOURCE_REPLAY_ONLY",
    callerManifestDeclaresPublicApiReadability: true,
    publicApiReadabilityGrantsRedistributionRights: false,
    repositoryLicenseCoversIssueProseEstablished: false,
    reporterOwnsOrCanLicenseAllEmbeddedMaterialEstablished: false,
    counterpartyMaterialRightsEstablished: false,
    privateLocalReplayPermissionEstablished: false,
    rawRetentionLegalClearanceEstablished: false,
    publicProjectionPermissionEstablished: false,
    redistributionPermissionEstablished: false,
    publicationPermissionEstablished: false,
    trainingPermissionEstablished: false,
    contactPermissionEstablished: false,
    legalClearanceEstablished: false,
    status: "UNRESOLVED_HOLD",
  };
  return { ...base, reviewHash: canonicalHash(
    "outsider.autonomous-work-order.github-discovery.rights-review.v1", base) };
}

function privacyReviewFor(sourceSetCommitment, bracketCommitment) {
  const base = {
    schema: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.privacyReview,
    sourceClass: "PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT",
    sourceSetCommitment,
    bracketCommitment,
    operatorPolicy: "PRIVATE_LOCAL_SOURCE_REPLAY_ONLY",
    rawProviderAccountIdentifiersPresent: true,
    rawStableProviderObjectIdentifiersPresent: true,
    rawUrlsAndProfileReferencesPresent: true,
    sensitiveIncidentNarrativePresent: true,
    possibleCounterpartyOrThirdPartyDataPresent: true,
    secretOrCredentialAbsenceEstablished: false,
    dataMinimizationBeyondFixedFiveBodiesEstablished: false,
    networkProjectionContainsRawIdentifiersOrNarrative: false,
    privacyClearanceEstablished: false,
    retentionPermissionEstablished: false,
    redistributionPermissionEstablished: false,
    publicationPermissionEstablished: false,
    trainingPermissionEstablished: false,
    contactPermissionEstablished: false,
    legalClearanceEstablished: false,
    status: "UNRESOLVED_HOLD",
  };
  return { ...base, reviewHash: canonicalHash(
    "outsider.autonomous-work-order.github-discovery.privacy-review.v1", base) };
}

function deriveInternal(input) {
  fail("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED");
  rejectTree(input);
  exactObject(input, ["captures", "acquisitionLifecycleReceiptBytes",
    "acquisitionCaptureManifestBytes", "preflightReviewBytes", "projectionKey"],
  "INPUT");
  exactObject(input.captures, CAPTURE_ROLES, "CAPTURES");
  if (!BufferIsBuffer(input.projectionKey) || input.projectionKey.length !== 32) {
    fail("PROJECTION_KEY_INVALID");
  }
  if (!BufferIsBuffer(input.acquisitionLifecycleReceiptBytes)
    || input.acquisitionLifecycleReceiptBytes.length < 2
    || input.acquisitionLifecycleReceiptBytes.length > 32 * 1024
    || !BufferIsBuffer(input.acquisitionCaptureManifestBytes)
    || input.acquisitionCaptureManifestBytes.length < 2
    || input.acquisitionCaptureManifestBytes.length > 128 * 1024
    || !BufferIsBuffer(input.preflightReviewBytes)
    || input.preflightReviewBytes.length < 2
    || input.preflightReviewBytes.length > 32 * 1024) {
    fail("PRIVATE_POLICY_BYTES_INVALID");
  }
  const projectionKey = BufferFrom(input.projectionKey);
  const acquisitionLifecycleReceiptBytes
    = BufferFrom(input.acquisitionLifecycleReceiptBytes);
  const acquisitionCaptureManifestBytes
    = BufferFrom(input.acquisitionCaptureManifestBytes);
  const preflightReviewBytes = BufferFrom(input.preflightReviewBytes);
  let allZero = true;
  for (let index = 0; index < projectionKey.length; index += 1) {
    if (projectionKey[index] !== 0) { allZero = false; break; }
  }
  if (allZero) fail("PROJECTION_KEY_INVALID");

  const preflightReview = parsePreflightReview(preflightReviewBytes);
  const acquisitionLifecycle = parseAcquisitionLifecycleReceipt(
    acquisitionLifecycleReceiptBytes, preflightReview, preflightReviewBytes);
  assertLocalRetentionWindowAllowsRawRead(acquisitionLifecycle);

  const captures = {};
  let priorDateMs = -Infinity;
  const requestIds = new SetConstructor();
  for (let index = 0; index < CAPTURE_ROLES.length; index += 1) {
    const role = CAPTURE_ROLES[index];
    const capture = captureInput(input, role, index + 1);
    if (capture.responseDateMs < priorDateMs
      || SetHas(requestIds, capture.meta.requestId)) fail("CAPTURE_ORDER_INVALID", role);
    priorDateMs = capture.responseDateMs;
    SetAdd(requestIds, capture.meta.requestId);
    captures[role] = capture;
  }
  if (captures.issueBefore.meta.etag !== captures.issueMid.meta.etag
    || captures.issueBefore.meta.etag !== captures.issueAfter.meta.etag
    || captures.commentsA.meta.etag !== captures.commentsB.meta.etag) {
    fail("BRACKET_ETAG_CHANGED");
  }

  const parsed = {};
  for (let index = 0; index < CAPTURE_ROLES.length; index += 1) {
    parsed[CAPTURE_ROLES[index]] = captures[CAPTURE_ROLES[index]].parsed;
  }
  const semantics = sourceSemantics(parsed);
  const acquisitionManifest = validateAcquisitionManifest(
    acquisitionCaptureManifestBytes, captures, preflightReview,
    preflightReviewBytes, acquisitionLifecycle, acquisitionLifecycleReceiptBytes);
  const rawParts = new ArrayConstructor(CAPTURE_ROLES.length + 3);
  const metadataParts = [];
  const fileManifest = [];
  const captureMetadata = [];
  for (let index = 0; index < CAPTURE_ROLES.length; index += 1) {
    const role = CAPTURE_ROLES[index];
    const bytes = captures[role].bytes;
    rawParts[index] = { role: StringToUpperCase(role), bytes };
    metadataParts[index] = { role: `${StringToUpperCase(role)}_METADATA`,
      bytes: canonicalBytes(captures[role].meta) };
    fileManifest[index] = { role: StringToUpperCase(role),
      file: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES[role],
      bytes: bytes.length, sha256: sha256(bytes) };
    captureMetadata[index] = copyCaptureMeta(captures[role].meta);
  }
  rawParts[CAPTURE_ROLES.length] = { role: "ACQUISITION_LIFECYCLE_RECEIPT",
    bytes: acquisitionLifecycleReceiptBytes };
  rawParts[CAPTURE_ROLES.length + 1] = { role: "ACQUISITION_CAPTURE_MANIFEST",
    bytes: acquisitionCaptureManifestBytes };
  rawParts[CAPTURE_ROLES.length + 2] = { role: "ACQUISITION_PREFLIGHT_REVIEW",
    bytes: preflightReviewBytes };
  fileManifest[fileManifest.length] = { role: "ACQUISITION_LIFECYCLE_RECEIPT",
    file:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES
        .acquisitionLifecycleReceipt,
    bytes: acquisitionLifecycleReceiptBytes.length,
    sha256: sha256(acquisitionLifecycleReceiptBytes) };
  fileManifest[fileManifest.length] = { role: "ACQUISITION_CAPTURE_MANIFEST",
    file:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES
        .acquisitionCaptureManifest,
    bytes: acquisitionCaptureManifestBytes.length,
    sha256: sha256(acquisitionCaptureManifestBytes) };
  fileManifest[fileManifest.length] = { role: "PREFLIGHT_REVIEW",
    file: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES.preflightReview,
    bytes: preflightReviewBytes.length,
    sha256: sha256(preflightReviewBytes) };
  const sourceSetCommitment = framedHmac(projectionKey,
    "outsider.autonomous-work-order.github-discovery.source-set.v1", rawParts);
  const bracketParts = new ArrayConstructor(rawParts.length + metadataParts.length);
  for (let index = 0; index < rawParts.length; index += 1) {
    bracketParts[index] = rawParts[index];
  }
  for (let index = 0; index < metadataParts.length; index += 1) {
    bracketParts[index + rawParts.length] = metadataParts[index];
  }
  const bracketCommitment = framedHmac(projectionKey,
    "outsider.autonomous-work-order.github-discovery.bracket.v1", bracketParts);
  const identityBytes = canonicalBytes({
    issue: semantics.issueRef, publisher: semantics.publisherRef,
    issueNumber: semantics.issueNumber, issueUrl: semantics.issueUrl,
    repositoryUrl: semantics.repositoryUrl,
  });
  const privateIdentityCommitment = framedHmac(projectionKey,
    "outsider.autonomous-work-order.github-discovery.private-identity.v1",
    [{ role: "PRIVATE_PROVIDER_REFERENCES", bytes: identityBytes }]);
  const rightsReview = rightsReviewFor(sourceSetCommitment, bracketCommitment);
  const privacyReview = privacyReviewFor(sourceSetCommitment, bracketCommitment);
  const rightsReviewBytes = canonicalBytes(rightsReview);
  const privacyReviewBytes = canonicalBytes(privacyReview);
  const rightsReviewCommitment = framedHmac(projectionKey,
    "outsider.autonomous-work-order.github-discovery.rights-review-commitment.v1",
    [{ role: "RIGHTS_REVIEW", bytes: rightsReviewBytes }]);
  const privacyReviewCommitment = framedHmac(projectionKey,
    "outsider.autonomous-work-order.github-discovery.privacy-review-commitment.v1",
    [{ role: "PRIVACY_REVIEW", bytes: privacyReviewBytes }]);

  const reportBase = {
    schema:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.networkSafeReport,
    sourceClass: "PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT",
    captureShape: {
      callerProvidedCaptureSlotCount: 5,
      externallyEstablishedHttpResponseOccurrenceCount: 0,
      callerProvidedIssueSlotCount: 3,
      callerProvidedCommentCollectionSlotCount: 2,
      issueSnapshotBytesEach: 10_175,
      commentCollectionBytesEach: 16_132,
      totalPrivateRawBytes: 62_789,
      acquisitionLifecycleReceiptBytes: acquisitionLifecycleReceiptBytes.length,
      acquisitionCaptureManifestBytes: acquisitionCaptureManifestBytes.length,
      pinnedBytesCurrentVisibleCommentObjectCount:
        semantics.currentCommentObjectCount,
      occurrenceCensusPreservedSeparatelyFromObjectEquality: true,
      duplicateEndpointSlotObjectsDiscarded: false,
    },
    commitments: { sourceSetCommitment, bracketCommitment,
      rightsReviewCommitment, privacyReviewCommitment },
    replay: {
      fixedRawPinsMatched: true,
      fiveCallerProvidedSlotOrderReplayed: true,
      acquisitionCaptureManifestBytesBound: true,
      acquisitionCaptureManifestControlFlowMeaningReplayed: false,
      callerOperatorPolicyReviewBytesReplayed: true,
      callerOperatorPolicyReviewCrosswalkedToManifest: true,
      preAcquisitionReviewTimingIndependentlyEstablished: false,
      independentAcquisitionWitnessEstablished: false,
      externalHttpResponseOccurrenceCountEstablished: 0,
      requestedVersionMatchedSelectedVersionInEveryCallerProvidedSlot: true,
      issueBytesEqualAcrossThreeCallerProvidedSlots: true,
      commentBytesEqualAcrossTwoCallerProvidedSlots: true,
      publicSnapshotCurrentRepresentationOnly: true,
      historicalEditDeletionCompletenessEstablished: false,
      externalDurableHeadEstablished: false,
    },
    rightsAndPrivacy: {
      rawBodiesProjected: false,
      providerIdentifiersProjected: false,
      callerOperatorPolicyRequestedTimeLimitedPrivateReplay: true,
      rawRetentionLifecycleEnforcementIntegrated: false,
      operatorPreflightEstablishesLegalPermission: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      retentionPermissionEstablished: false,
      redistributionPermissionEstablished: false,
      trainingPermissionEstablished: false,
    },
    discoveryBoundary: {
      publisherNarrativePresentInPrivateSource: true,
      publisherNarrativeIncidentFactEstablished: false,
      directHistoricalParticipationVerified: false,
      actualHumanResponseEstablished: false,
      independentOutcomeEstablished: false,
      contactAttempted: false,
      invitationCreated: false,
      responseCreated: false,
      trustedExternalFactEstablished: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      actorCredit: false,
      economicAuthority: "NONE",
    },
  };
  const report = { ...reportBase, reportHash: canonicalHash(
    "outsider.autonomous-work-order.github-discovery.network-report.v1",
    reportBase) };

  const keyManifest = { role: "PROJECTION_KEY",
    file: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES.projectionKey,
    bytes: projectionKey.length, sha256: sha256(projectionKey) };
  fileManifest[fileManifest.length] = keyManifest;
  fileManifest[fileManifest.length] = { role: "RIGHTS_REVIEW",
    file: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES.rightsReview,
    bytes: rightsReviewBytes.length, sha256: sha256(rightsReviewBytes) };
  fileManifest[fileManifest.length] = { role: "PRIVACY_REVIEW",
    file: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES.privacyReview,
    bytes: privacyReviewBytes.length, sha256: sha256(privacyReviewBytes) };
  const reportBytes = canonicalBytes(report);
  fileManifest[fileManifest.length] = { role: "NETWORK_SAFE_REPORT",
    file: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES.networkSafeReport,
    bytes: reportBytes.length, sha256: sha256(reportBytes) };
  const receiptBase = {
    schema: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.privateReceipt,
    recordedAt: DateToISOString(new DateConstructor(priorDateMs)),
    providerResponseDateIsIndependentTime: false,
    captureOrder: ["ISSUE_BEFORE", "COMMENTS_A", "ISSUE_MID", "COMMENTS_B",
      "ISSUE_AFTER"],
    captureMetadata,
    acquisitionLifecycleReceipt: {
      schema: acquisitionLifecycle.receipt.schema,
      initialState: "INCOMPLETE",
      callerManifestTerminalState: "COMPLETE",
      initialReceiptBytesReplayed: true,
      initialReceiptCrosswalkedToManifest: true,
      callerManifestLastControlFlowMeaningIndependentlyReplayed: false,
      wholeDirectoryAtomicPublicationEstablished: false,
      publisherClockIsIndependentTime: false,
      retentionSeconds: acquisitionLifecycle.receipt.retentionSeconds,
      retentionUntilPublisherClock:
        acquisitionLifecycle.receipt.retentionUntilPublisherClock,
      currentTimeCheckedBeforeRawRead: false,
      automaticPurgeIntegrated: false,
      retentionPermissionEstablished: false,
      sha256: sha256(acquisitionLifecycleReceiptBytes),
      bytes: acquisitionLifecycleReceiptBytes.length,
    },
    acquisitionCaptureManifest: {
      schema: acquisitionManifest.manifest.schema,
      callerManifestBytesBound: true,
      callerManifestControlFlowMeaningReplayed: false,
      independentOccurrenceWitnessEstablished: false,
      sha256: sha256(acquisitionCaptureManifestBytes),
      bytes: acquisitionCaptureManifestBytes.length,
    },
    preflightReview: {
      reviewHash: preflightReview.reviewHash,
      callerOperatorPolicyReviewBytesReplayed: true,
      callerManifestBindingCrosswalked: true,
      callerManifestClaimsReviewValidatedBeforeFirstNetworkRequest: true,
      preAcquisitionReviewTimingIndependentlyEstablished: false,
      reviewerIdentityVerified: false,
      reviewerAuthorityEstablished: false,
      reviewSignatureVerified: false,
      reviewBasisBytesReplayed: false,
      reviewTimeIndependent: false,
      legalClearanceEstablished: false,
      sha256: sha256(preflightReviewBytes),
      bytes: preflightReviewBytes.length,
    },
    sourcePins: {
      apiVersion:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS
          .requestedAndSelectedApiVersion,
      issue: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue,
      comments: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments,
    },
    privateCrosswalk: {
      sameIssueBytesAcrossThreeCallerProvidedSlots: true,
      sameCommentsBytesAcrossTwoCallerProvidedSlots: true,
      commentObjectsCrosswalkToIssue: true,
      currentCommentObjectCount: semantics.currentCommentObjectCount,
      sameProviderAccountReferenceCommentCount:
        semantics.publisherAccountCommentCount,
      botCommentCount: semantics.botCommentCount,
      privateIdentityCommitment,
      providerAccountContinuityProvesActualHumanIdentity: false,
      currentObjectsProveHistoricalCompleteness: false,
    },
    privateCommitments: { sourceSetCommitment, bracketCommitment },
    sourceSpecificReviews: {
      rightsReviewHash: rightsReview.reviewHash,
      privacyReviewHash: privacyReview.reviewHash,
      rightsReviewCommitment,
      privacyReviewCommitment,
      legalClearanceEstablished: false,
    },
    sourceEntryLifecycle: {
      state: "PENDING_ACQUISITION",
      sourceEntryBound: false,
      appendOnlyLineageEstablished: false,
      acquisitionAttemptAcceptedAsSourceRevisionOrLineage: false,
      predecessorReceiptHash: null,
      supersedesReceiptHash: null,
      externalHeadEstablished: false,
    },
    fileManifest,
    networkSafeReportHash: report.reportHash,
    publicationOrder: ["publicationLifecycleReceipt", "preflightReview",
      "acquisitionLifecycleReceipt",
      "issueBefore", "commentsA", "issueMid", "commentsB", "issueAfter",
      "acquisitionCaptureManifest", "projectionKey", "rightsReview",
      "privacyReview", "networkSafeReport", "receipt"],
    receiptWrittenLastRequired: true,
    boundary: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY,
  };
  const receipt = { ...receiptBase, receiptHash: canonicalHash(
    "outsider.autonomous-work-order.github-discovery.private-receipt.v1",
    receiptBase) };
  assertProjectionSafe(report, parsed, semantics, receiptBase);
  return { captures, acquisitionLifecycleReceiptBytes,
    acquisitionCaptureManifestBytes,
    preflightReviewBytes, projectionKey, acquisitionManifest,
    rightsReviewBytes, privacyReviewBytes,
    report: deepFreeze(report), receipt: deepFreeze(receipt), reportBytes,
    receiptBytes: canonicalBytes(receipt), sourceSetCommitment, bracketCommitment };
}

export function deriveAutonomousWorkOrderGithubDiscoverySnapshot(input) {
  const derived = deriveInternal(input);
  return deepFreeze({
    networkSafeReport: derived.report,
    privateReceipt: derived.receipt,
    trustedExternalFactEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
  });
}

function modeType(stat) { return stat.mode & FILE_TYPE_MASK; }
function modeBits(stat) { return stat.mode & 0o777n; }
function sameNode(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && modeType(left) === modeType(right);
}
function sameStableStat(left, right) {
  return sameNode(left, right) && left.mode === right.mode && left.size === right.size
    && left.nlink === right.nlink && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function safeStat(target, expectedType, expectedMode, code) {
  let stat;
  try { stat = lstatSync(target, { bigint: true }); }
  catch { fail(code); }
  if (modeType(stat) !== expectedType || modeBits(stat) !== expectedMode) fail(code);
  return stat;
}

function stablePrivateRead(file, maximumBytes = MAX_TOTAL_BUNDLE_BYTES) {
  const initial = safeStat(file, REGULAR_FILE_TYPE, 0o600n, "PRIVATE_FILE_UNSAFE");
  if (initial.nlink !== 1n || initial.size < 0n
    || initial.size > BigIntConstructor(maximumBytes)) fail("PRIVATE_FILE_UNSAFE");
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!sameStableStat(initial, before)) fail("PRIVATE_FILE_CHANGED");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(file, { bigint: true });
    if (!sameStableStat(before, after) || !sameStableStat(before, finalPath)
      || bytes.length !== NumberConstructor(before.size)) fail("PRIVATE_FILE_CHANGED");
    return { bytes, stat: after };
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function externalLifecycleGuard(trustedLifecycleRoot, snapshotDirectory,
  expectedParent) {
  if (typeof trustedLifecycleRoot !== "string") {
    fail("TRUSTED_LIFECYCLE_ROOT_INVALID");
  }
  const requestedRoot = path.resolve(trustedLifecycleRoot);
  if (requestedRoot === path.parse(requestedRoot).root
    || requestedRoot !== path.join(expectedParent, "lifecycle")) {
    fail("TRUSTED_LIFECYCLE_ROOT_INVALID");
  }
  const requestedStat = safeStat(requestedRoot, DIRECTORY_TYPE, 0o700n,
    "TRUSTED_LIFECYCLE_ROOT_UNSAFE");
  let canonicalRoot;
  try { canonicalRoot = realpathSync(requestedRoot); }
  catch { fail("TRUSTED_LIFECYCLE_ROOT_UNSAFE"); }
  const rootStat = safeStat(canonicalRoot, DIRECTORY_TYPE, 0o700n,
    "TRUSTED_LIFECYCLE_ROOT_UNSAFE");
  if (canonicalRoot !== requestedRoot || !sameNode(requestedStat, rootStat)) {
    fail("TRUSTED_LIFECYCLE_ROOT_UNSAFE");
  }
  const snapshotId = path.basename(snapshotDirectory);
  if (!RegExpTest(OPAQUE_DIRECTORY, snapshotId)) {
    fail("LIFECYCLE_CAPTURE_ALIAS_INVALID");
  }
  return { root: canonicalRoot, rootStat,
    captureLifecycleDirectory: path.join(canonicalRoot, snapshotId) };
}

function assertExternalLifecycleClear(guard) {
  const currentRoot = safeStat(guard.root, DIRECTORY_TYPE, 0o700n,
    "TRUSTED_LIFECYCLE_ROOT_CHANGED");
  if (!sameNode(guard.rootStat, currentRoot)) {
    fail("TRUSTED_LIFECYCLE_ROOT_CHANGED");
  }
  try {
    lstatSync(guard.captureLifecycleDirectory, { bigint: true });
    fail("EXTERNAL_PURGE_LIFECYCLE_RAW_READ_FORBIDDEN");
  } catch (error) {
    if (StringStartsWith(StringConstructor(error?.message ?? ""),
      "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_")) throw error;
    if (error?.code !== "ENOENT") fail("EXTERNAL_PURGE_LIFECYCLE_CHECK_FAILED");
  }
}

function acquisitionDirectoryPins(input) {
  rejectTree(input);
  exactObject(input, ["trustedAcquisitionRoot", "trustedLifecycleRoot",
    "expectedCaptureManifestSha256", "expectedLifecycleReceiptSha256",
    "expectedPreflightReviewSha256"],
  "ACQUISITION_DIRECTORY_PINS");
  if (typeof input.trustedAcquisitionRoot !== "string"
    || typeof input.trustedLifecycleRoot !== "string"
    || !RegExpTest(HASH, input.expectedCaptureManifestSha256)
    || !RegExpTest(HASH, input.expectedLifecycleReceiptSha256)
    || !RegExpTest(HASH, input.expectedPreflightReviewSha256)) {
    fail("ACQUISITION_DIRECTORY_PINS_INVALID");
  }
  return input;
}

function readAcquisitionDirectory(directory, pinInput) {
  fail("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED");
  if (typeof directory !== "string") fail("ACQUISITION_DIRECTORY_INVALID");
  const pins = acquisitionDirectoryPins(pinInput);
  const requested = path.resolve(directory);
  const requestedRoot = path.resolve(pins.trustedAcquisitionRoot);
  if (requestedRoot === path.parse(requestedRoot).root) {
    fail("ACQUISITION_TRUSTED_ROOT_UNSAFE");
  }
  const requestedRootStat = safeStat(requestedRoot, DIRECTORY_TYPE, 0o700n,
    "ACQUISITION_TRUSTED_ROOT_UNSAFE");
  let canonicalRoot;
  try { canonicalRoot = realpathSync(requestedRoot); }
  catch { fail("ACQUISITION_TRUSTED_ROOT_UNSAFE"); }
  const rootBefore = safeStat(canonicalRoot, DIRECTORY_TYPE, 0o700n,
    "ACQUISITION_TRUSTED_ROOT_UNSAFE");
  if (!sameNode(requestedRootStat, rootBefore)) {
    fail("ACQUISITION_TRUSTED_ROOT_UNSAFE");
  }
  if (!RegExpTest(OPAQUE_DIRECTORY, path.basename(requested))) {
    fail("ACQUISITION_DIRECTORY_ALIAS_INVALID");
  }
  const requestedStat = safeStat(requested, DIRECTORY_TYPE, 0o700n,
    "ACQUISITION_DIRECTORY_UNSAFE");
  let canonicalPath;
  try { canonicalPath = realpathSync(requested); }
  catch { fail("ACQUISITION_DIRECTORY_UNSAFE"); }
  if (path.basename(canonicalPath) !== path.basename(requested)) {
    fail("ACQUISITION_DIRECTORY_UNSAFE");
  }
  const resolved = canonicalPath;
  const parent = path.dirname(resolved);
  if (parent !== canonicalRoot) fail("ACQUISITION_DIRECTORY_NOT_DIRECT_CHILD");
  const lifecycleGuard = externalLifecycleGuard(input.trustedLifecycleRoot,
    resolved, canonicalRoot);
  assertExternalLifecycleClear(lifecycleGuard);
  const parentBefore = safeStat(parent, DIRECTORY_TYPE, 0o700n,
    "ACQUISITION_PARENT_UNSAFE");
  const directoryBefore = safeStat(resolved, DIRECTORY_TYPE, 0o700n,
    "ACQUISITION_DIRECTORY_UNSAFE");
  if (!sameNode(requestedStat, directoryBefore)) {
    fail("ACQUISITION_DIRECTORY_UNSAFE");
  }
  const names = readdirSync(resolved);
  for (let index = 0; index < names.length; index += 1) {
    if (StringIncludes(StringToLowerCase(names[index]), "purge")) {
      fail("PURGE_INTENT_OR_RECEIPT_RAW_READ_FORBIDDEN");
    }
  }
  const expectedNames = new ArrayConstructor(ACQUISITION_FILE_ROLES.length);
  for (let index = 0; index < ACQUISITION_FILE_ROLES.length; index += 1) {
    expectedNames[index]
      = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES[
        ACQUISITION_FILE_ROLES[index]];
  }
  ArraySort(names);
  ArraySort(expectedNames);
  if (!same(names, expectedNames)) fail("ACQUISITION_FILE_ALLOWLIST_INVALID");

  const files = {};
  let totalBytes = 0;
  let newestPreManifestMtime = 0n;
  const controlRoles = ["preflightReview", "acquisitionLifecycleReceipt",
    "acquisitionCaptureManifest"];
  for (let index = 0; index < controlRoles.length; index += 1) {
    const role = controlRoles[index];
    const maximumBytes = role === "acquisitionCaptureManifest"
      ? 128 * 1024 : 32 * 1024;
    const read = stablePrivateRead(path.join(resolved,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES[role]),
    maximumBytes);
    files[role] = read;
    totalBytes += read.bytes.length;
    if (role !== "acquisitionCaptureManifest" && read.stat.mtimeNs
      > newestPreManifestMtime) {
      newestPreManifestMtime = read.stat.mtimeNs;
    }
  }
  if (sha256(files.acquisitionCaptureManifest.bytes)
      !== pins.expectedCaptureManifestSha256
    || sha256(files.acquisitionLifecycleReceipt.bytes)
      !== pins.expectedLifecycleReceiptSha256
    || sha256(files.preflightReview.bytes)
      !== pins.expectedPreflightReviewSha256) {
    fail("ACQUISITION_CALLER_PIN_MISMATCH");
  }

  const preflightReview = parsePreflightReview(files.preflightReview.bytes);
  const acquisitionLifecycle = parseAcquisitionLifecycleReceipt(
    files.acquisitionLifecycleReceipt.bytes, preflightReview,
    files.preflightReview.bytes);
  assertLocalRetentionWindowAllowsRawRead(acquisitionLifecycle);
  const manifest = validateAcquisitionManifest(
    files.acquisitionCaptureManifest.bytes, null, preflightReview,
    files.preflightReview.bytes, acquisitionLifecycle,
    files.acquisitionLifecycleReceipt.bytes).manifest;
  assertExternalLifecycleClear(lifecycleGuard);
  const rawRoles = ["issueBefore", "commentsA", "issueMid", "commentsB",
    "issueAfter"];
  for (let index = 0; index < rawRoles.length; index += 1) {
    const role = rawRoles[index];
    assertExternalLifecycleClear(lifecycleGuard);
    const read = stablePrivateRead(path.join(resolved,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES[role]),
    32 * 1024);
    assertExternalLifecycleClear(lifecycleGuard);
    files[role] = read;
    totalBytes += read.bytes.length;
    if (read.stat.mtimeNs > newestPreManifestMtime) {
      newestPreManifestMtime = read.stat.mtimeNs;
    }
  }
  if (totalBytes > MAX_TOTAL_BUNDLE_BYTES
    || files.acquisitionCaptureManifest.stat.mtimeNs < newestPreManifestMtime) {
    fail("ACQUISITION_SIZE_OR_MANIFEST_ORDER_INVALID");
  }
  const captures = {};
  for (let index = 0; index < MANIFEST_ROLE_BINDINGS.length; index += 1) {
    const binding = MANIFEST_ROLE_BINDINGS[index];
    const row = exactObject(manifest.captureSequence[index],
      ["role", "file", "body", "acquiredAtPublisherClock",
        "acquiredAtIsIndependentTime", "meta", "transport"],
      "ACQUISITION_MANIFEST_CAPTURE_ROW");
    if (row.role !== binding.role || row.file !== binding.file) {
      fail("ACQUISITION_MANIFEST_ROLE_FILE_CROSSWALK_INVALID", binding.role);
    }
    const sourceFile = files[binding.key];
    captures[binding.key] = ObjectFreeze({ bytes: BufferFrom(sourceFile.bytes),
      meta: deepFreeze(copyCaptureMeta(row.meta)) });
  }

  for (let index = 0; index < ACQUISITION_FILE_ROLES.length; index += 1) {
    const role = ACQUISITION_FILE_ROLES[index];
    const finalStat = lstatSync(path.join(resolved,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES[role]),
    { bigint: true });
    if (!sameStableStat(files[role].stat, finalStat)) {
      fail("ACQUISITION_DIRECTORY_CHANGED_DURING_READ");
    }
  }
  const directoryAfter = lstatSync(resolved, { bigint: true });
  const parentAfter = lstatSync(parent, { bigint: true });
  if (!sameStableStat(directoryBefore, directoryAfter)
    || !sameStableStat(parentBefore, parentAfter)
    || !sameStableStat(rootBefore, parentAfter)) {
    fail("ACQUISITION_DIRECTORY_CHANGED_DURING_READ");
  }
  assertExternalLifecycleClear(lifecycleGuard);

  const loadedInput = {
    captures: ObjectFreeze(captures),
    acquisitionLifecycleReceiptBytes:
      BufferFrom(files.acquisitionLifecycleReceipt.bytes),
    acquisitionCaptureManifestBytes:
      BufferFrom(files.acquisitionCaptureManifest.bytes),
    preflightReviewBytes: BufferFrom(files.preflightReview.bytes),
    projectionKey: BufferAlloc(32, 1),
  };
  deriveInternal(loadedInput);
  return ObjectFreeze({
    captures: loadedInput.captures,
    acquisitionLifecycleReceiptBytes:
      BufferFrom(loadedInput.acquisitionLifecycleReceiptBytes),
    acquisitionCaptureManifestBytes:
      BufferFrom(loadedInput.acquisitionCaptureManifestBytes),
    preflightReviewBytes: BufferFrom(loadedInput.preflightReviewBytes),
    callerPinConsistencyVerified: true,
    externalProvenanceEstablished: false,
    independentAcquisitionWitnessEstablished: false,
    returnedPrivateBuffersAreImmutable: false,
  });
}

export function loadAutonomousWorkOrderGithubDiscoveryAcquisitionDirectory(
  directory, input) {
  return readAcquisitionDirectory(directory, input);
}

function fsyncDirectory(directory) {
  let descriptor;
  try { descriptor = openSync(directory, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function assertDerivedRetentionWindowAllowsPublication(derived) {
  const nowMs = DateNow();
  const retentionUntilMs = canonicalUtcMilliseconds(
    derived.receipt.acquisitionLifecycleReceipt.retentionUntilPublisherClock,
    "PUBLICATION_RETENTION_UNTIL_INVALID");
  const startedAtMs = retentionUntilMs
    - derived.receipt.acquisitionLifecycleReceipt.retentionSeconds * 1000;
  if (!NumberIsFinite(nowMs) || nowMs < startedAtMs
    || nowMs < derived.acquisitionManifest.completedAtMs) {
    fail("LOCAL_POLICY_CLOCK_BEFORE_ACQUISITION_PUBLICATION_FORBIDDEN");
  }
  if (nowMs >= retentionUntilMs) {
    fail("RETENTION_EXPIRED_PUBLICATION_FORBIDDEN");
  }
  return nowMs;
}

function publicationLifecycleFor(derived, nowMs) {
  if (!NumberIsFinite(nowMs)) fail("PUBLICATION_POLICY_CLOCK_INVALID");
  const randomCommitment = sha256(randomBytes(32));
  const base = {
    schema: PUBLICATION_LIFECYCLE_RECEIPT_SCHEMA,
    publicationAttemptId: `pub_${StringSlice(randomCommitment, 7, 39)}`,
    state: "INCOMPLETE",
    sourcePrivateReceiptHash: derived.receipt.receiptHash,
    networkSafeReportHash: derived.report.reportHash,
    acquisitionLifecycleReceiptSha256:
      sha256(derived.acquisitionLifecycleReceiptBytes),
    acquisitionCaptureManifestSha256:
      sha256(derived.acquisitionCaptureManifestBytes),
    preflightReviewSha256: sha256(derived.preflightReviewBytes),
    createdAtPublisherClock: DateToISOString(new DateConstructor(nowMs)),
    publisherClockIsIndependentTime: false,
    runReceiptLastRequiredForTerminalInterpretation: true,
    finalDirectoryReservedByAtomicMkdirNoClobber: true,
    wholeDirectoryAtomicPublicationEstablished: false,
    sameUserParentReplacementResistanceEstablished: false,
    independentOccurrenceWitness: false,
    externalHeadEstablished: false,
  };
  const receipt = { ...base, publicationLifecycleReceiptHash: canonicalHash(
    "outsider.autonomous-work-order.github-discovery.publication-lifecycle-receipt.v1",
    base) };
  return { receipt: deepFreeze(receipt), bytes: canonicalBytes(receipt) };
}

function parsePublicationLifecycleReceipt(bytes) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2 || bytes.length > 32 * 1024) {
    fail("PUBLICATION_LIFECYCLE_RECEIPT_BYTES_INVALID");
  }
  const receipt = parseJsonStrict(bytes,
    "PUBLICATION_LIFECYCLE_RECEIPT_JSON_INVALID");
  exactObject(receipt, ["schema", "publicationAttemptId", "state",
    "sourcePrivateReceiptHash", "networkSafeReportHash",
    "acquisitionLifecycleReceiptSha256", "acquisitionCaptureManifestSha256",
    "preflightReviewSha256", "createdAtPublisherClock",
    "publisherClockIsIndependentTime",
    "runReceiptLastRequiredForTerminalInterpretation",
    "finalDirectoryReservedByAtomicMkdirNoClobber",
    "wholeDirectoryAtomicPublicationEstablished",
    "sameUserParentReplacementResistanceEstablished",
    "independentOccurrenceWitness", "externalHeadEstablished",
    "publicationLifecycleReceiptHash"], "PUBLICATION_LIFECYCLE_RECEIPT");
  canonicalUtcMilliseconds(receipt.createdAtPublisherClock,
    "PUBLICATION_LIFECYCLE_CREATED_AT_INVALID");
  const base = {
    schema: receipt.schema,
    publicationAttemptId: receipt.publicationAttemptId,
    state: receipt.state,
    sourcePrivateReceiptHash: receipt.sourcePrivateReceiptHash,
    networkSafeReportHash: receipt.networkSafeReportHash,
    acquisitionLifecycleReceiptSha256:
      receipt.acquisitionLifecycleReceiptSha256,
    acquisitionCaptureManifestSha256:
      receipt.acquisitionCaptureManifestSha256,
    preflightReviewSha256: receipt.preflightReviewSha256,
    createdAtPublisherClock: receipt.createdAtPublisherClock,
    publisherClockIsIndependentTime: receipt.publisherClockIsIndependentTime,
    runReceiptLastRequiredForTerminalInterpretation:
      receipt.runReceiptLastRequiredForTerminalInterpretation,
    finalDirectoryReservedByAtomicMkdirNoClobber:
      receipt.finalDirectoryReservedByAtomicMkdirNoClobber,
    wholeDirectoryAtomicPublicationEstablished:
      receipt.wholeDirectoryAtomicPublicationEstablished,
    sameUserParentReplacementResistanceEstablished:
      receipt.sameUserParentReplacementResistanceEstablished,
    independentOccurrenceWitness: receipt.independentOccurrenceWitness,
    externalHeadEstablished: receipt.externalHeadEstablished,
  };
  if (receipt.schema !== PUBLICATION_LIFECYCLE_RECEIPT_SCHEMA
    || !RegExpTest(PUBLICATION_ATTEMPT_ID, receipt.publicationAttemptId)
    || receipt.publicationAttemptId === "pub_00000000000000000000000000000000"
    || receipt.state !== "INCOMPLETE"
    || !RegExpTest(HASH, receipt.sourcePrivateReceiptHash)
    || !RegExpTest(HASH, receipt.networkSafeReportHash)
    || !RegExpTest(HASH, receipt.acquisitionLifecycleReceiptSha256)
    || !RegExpTest(HASH, receipt.acquisitionCaptureManifestSha256)
    || !RegExpTest(HASH, receipt.preflightReviewSha256)
    || receipt.publisherClockIsIndependentTime !== false
    || receipt.runReceiptLastRequiredForTerminalInterpretation !== true
    || receipt.finalDirectoryReservedByAtomicMkdirNoClobber !== true
    || receipt.wholeDirectoryAtomicPublicationEstablished !== false
    || receipt.sameUserParentReplacementResistanceEstablished !== false
    || receipt.independentOccurrenceWitness !== false
    || receipt.externalHeadEstablished !== false
    || receipt.publicationLifecycleReceiptHash !== canonicalHash(
      "outsider.autonomous-work-order.github-discovery.publication-lifecycle-receipt.v1",
      base)
    || !BufferEquals(bytes, canonicalBytes(receipt))) {
    fail("PUBLICATION_LIFECYCLE_RECEIPT_REPLAY_INVALID");
  }
  return receipt;
}

function publicationPaths(options) {
  exactObject(options, ["trustedRoot", "trustedLifecycleRoot", "outputDirectory"],
    "PUBLICATION_OPTIONS");
  if (typeof options.trustedRoot !== "string"
    || typeof options.trustedLifecycleRoot !== "string"
    || typeof options.outputDirectory !== "string") fail("PUBLICATION_PATH_INVALID");
  const trustedRoot = path.resolve(options.trustedRoot);
  const outputDirectory = path.resolve(options.outputDirectory);
  const rootStat = safeStat(trustedRoot, DIRECTORY_TYPE, 0o700n,
    "TRUSTED_ROOT_UNSAFE");
  if (trustedRoot === path.parse(trustedRoot).root
    || path.dirname(outputDirectory) !== trustedRoot
    || !RegExpTest(OPAQUE_DIRECTORY, path.basename(outputDirectory))) {
    fail("OUTPUT_DIRECTORY_INVALID");
  }
  const lifecycleGuard = externalLifecycleGuard(options.trustedLifecycleRoot,
    outputDirectory, trustedRoot);
  assertExternalLifecycleClear(lifecycleGuard);
  try { lstatSync(outputDirectory, { bigint: true }); fail("OUTPUT_DIRECTORY_EXISTS"); }
  catch (error) {
    if (StringStartsWith(StringConstructor(error?.message ?? ""),
      "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_")) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
  return { trustedRoot, outputDirectory, rootStat, lifecycleGuard };
}

function assertRoot(publication) {
  const current = safeStat(publication.trustedRoot, DIRECTORY_TYPE, 0o700n,
    "TRUSTED_ROOT_CHANGED");
  if (!sameNode(current, publication.rootStat)) fail("TRUSTED_ROOT_CHANGED");
  assertExternalLifecycleClear(publication.lifecycleGuard);
}

function createOutput(publication) {
  assertRoot(publication);
  mkdirSync(publication.outputDirectory, { mode: 0o700 });
  const stat = safeStat(publication.outputDirectory, DIRECTORY_TYPE, 0o700n,
    "OUTPUT_DIRECTORY_UNSAFE");
  let descriptor;
  try { descriptor = openSync(publication.outputDirectory,
    constants.O_RDONLY | DIRECTORY | NOFOLLOW); fchmodSync(descriptor, 0o700); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
  return stat;
}

function assertOutput(publication, expected) {
  const current = safeStat(publication.outputDirectory, DIRECTORY_TYPE, 0o700n,
    "OUTPUT_DIRECTORY_CHANGED");
  if (!sameNode(current, expected)) fail("OUTPUT_DIRECTORY_CHANGED");
}

function publishFile(publication, outputStat, role, bytes) {
  assertRoot(publication);
  assertOutput(publication, outputStat);
  publishPrivateArtifact(path.join(publication.outputDirectory,
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES[role]), bytes, {
    trustedRoot: publication.trustedRoot, allowExistingIdentical: false,
  });
}

export function publishAutonomousWorkOrderGithubDiscoverySnapshot(input, options) {
  fail("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED");
  const derived = deriveInternal(input);
  const publicationLifecycle = publicationLifecycleFor(derived,
    assertDerivedRetentionWindowAllowsPublication(derived));
  const publication = publicationPaths(options);
  assertDerivedRetentionWindowAllowsPublication(derived);
  const outputStat = createOutput(publication);
  publishFile(publication, outputStat, "publicationLifecycleReceipt",
    publicationLifecycle.bytes);
  fsyncDirectory(publication.outputDirectory);
  publishFile(publication, outputStat, "preflightReview",
    derived.preflightReviewBytes);
  publishFile(publication, outputStat, "acquisitionLifecycleReceipt",
    derived.acquisitionLifecycleReceiptBytes);
  for (let index = 0; index < CAPTURE_ROLES.length; index += 1) {
    assertDerivedRetentionWindowAllowsPublication(derived);
    const role = CAPTURE_ROLES[index];
    publishFile(publication, outputStat, role, derived.captures[role].bytes);
  }
  publishFile(publication, outputStat, "acquisitionCaptureManifest",
    derived.acquisitionCaptureManifestBytes);
  publishFile(publication, outputStat, "projectionKey", derived.projectionKey);
  publishFile(publication, outputStat, "rightsReview", derived.rightsReviewBytes);
  publishFile(publication, outputStat, "privacyReview", derived.privacyReviewBytes);
  publishFile(publication, outputStat, "networkSafeReport", derived.reportBytes);
  assertDerivedRetentionWindowAllowsPublication(derived);
  publishFile(publication, outputStat, "receipt", derived.receiptBytes);
  fsyncDirectory(publication.outputDirectory);
  fsyncDirectory(publication.trustedRoot);
  const verified = verifyAutonomousWorkOrderGithubDiscoverySnapshotBundle(
    publication.outputDirectory, {
      trustedLifecycleRoot: publication.lifecycleGuard.root,
      expectedReceiptHash: derived.receipt.receiptHash,
      expectedNetworkSafeReportHash: derived.report.reportHash,
      expectedPublicationLifecycleReceiptHash:
        publicationLifecycle.receipt.publicationLifecycleReceiptHash,
    });
  if (!verified.ok) fail("POST_PUBLICATION_REPLAY_FAILED", verified.error);
  return deepFreeze({
    ok: true,
    fixedFiveCallerProvidedSlotBundlePublished: true,
    receiptWrittenLastByPublisherControlFlow: true,
    networkSafeReport: derived.report,
    privateReceiptHash: derived.receipt.receiptHash,
    publicationLifecycleReceiptHash:
      publicationLifecycle.receipt.publicationLifecycleReceiptHash,
    trustedExternalFactEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    boundary: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY,
  });
}

export function publishAutonomousWorkOrderGithubDiscoverySnapshotFromAcquisitionDirectory(
  acquisitionDirectory, options) {
  fail("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED");
  rejectTree(options);
  exactObject(options, ["trustedAcquisitionRoot", "trustedLifecycleRoot",
    "trustedRoot", "outputDirectory", "projectionKey",
    "expectedCaptureManifestSha256", "expectedLifecycleReceiptSha256",
    "expectedPreflightReviewSha256"], "ACQUISITION_PUBLISH_OPTIONS");
  const loaded = readAcquisitionDirectory(acquisitionDirectory, {
    trustedAcquisitionRoot: ownValue(options, "trustedAcquisitionRoot",
      "ACQUISITION_PUBLISH_OPTIONS"),
    trustedLifecycleRoot: ownValue(options, "trustedLifecycleRoot",
      "ACQUISITION_PUBLISH_OPTIONS"),
    expectedCaptureManifestSha256: ownValue(options,
      "expectedCaptureManifestSha256", "ACQUISITION_PUBLISH_OPTIONS"),
    expectedLifecycleReceiptSha256: ownValue(options,
      "expectedLifecycleReceiptSha256", "ACQUISITION_PUBLISH_OPTIONS"),
    expectedPreflightReviewSha256: ownValue(options,
      "expectedPreflightReviewSha256", "ACQUISITION_PUBLISH_OPTIONS"),
  });
  const published = publishAutonomousWorkOrderGithubDiscoverySnapshot({
    captures: loaded.captures,
    acquisitionLifecycleReceiptBytes: loaded.acquisitionLifecycleReceiptBytes,
    acquisitionCaptureManifestBytes: loaded.acquisitionCaptureManifestBytes,
    preflightReviewBytes: loaded.preflightReviewBytes,
    projectionKey: ownValue(options, "projectionKey", "ACQUISITION_PUBLISH_OPTIONS"),
  }, {
    trustedRoot: ownValue(options, "trustedRoot", "ACQUISITION_PUBLISH_OPTIONS"),
    trustedLifecycleRoot: ownValue(options, "trustedLifecycleRoot",
      "ACQUISITION_PUBLISH_OPTIONS"),
    outputDirectory: ownValue(options, "outputDirectory",
      "ACQUISITION_PUBLISH_OPTIONS"),
  });
  return deepFreeze({
    ...published,
    acquisitionDirectoryReadWithExactAllowlist: true,
    captureMetadataDerivedFromPinnedPrivateManifest: true,
    callerAcquisitionFilePinsConsistent: true,
    callerAcquisitionFilePinsEstablishExternalProvenance: false,
    externalProvenanceEstablished: false,
  });
}

export function publishAutonomousWorkOrderGithubDiscoveryNetworkSafeProjectionFromAcquisitionDirectory(
  acquisitionDirectory, options) {
  fail("NETWORK_SAFE_PROJECTION_NOT_INTEGRATED_FAIL_CLOSED");
}

function readBundle(directory, trustedLifecycleRoot,
  expectedPublicationLifecycleReceiptHash) {
  fail("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED");
  if (typeof directory !== "string") fail("BUNDLE_DIRECTORY_INVALID");
  const resolved = path.resolve(directory);
  const directoryBefore = safeStat(resolved, DIRECTORY_TYPE, 0o700n,
    "BUNDLE_DIRECTORY_UNSAFE");
  if (!RegExpTest(OPAQUE_DIRECTORY, path.basename(resolved))) {
    fail("BUNDLE_DIRECTORY_ALIAS_INVALID");
  }
  const lifecycleGuard = externalLifecycleGuard(trustedLifecycleRoot, resolved,
    path.dirname(resolved));
  assertExternalLifecycleClear(lifecycleGuard);
  const names = readdirSync(resolved);
  for (let index = 0; index < names.length; index += 1) {
    if (StringIncludes(StringToLowerCase(names[index]), "purge")) {
      fail("PURGE_INTENT_OR_RECEIPT_RAW_READ_FORBIDDEN");
    }
  }
  const expectedNames = [];
  for (let index = 0; index < FILE_ROLES.length; index += 1) {
    expectedNames[index] = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES[
      FILE_ROLES[index]];
  }
  ArraySort(names);
  ArraySort(expectedNames);
  if (!same(names, expectedNames)) fail("BUNDLE_FILE_ALLOWLIST_INVALID");
  const files = {};
  let totalBytes = 0;
  let newestPayloadMtime = 0n;
  const controlRoles = ["publicationLifecycleReceipt", "preflightReview",
    "acquisitionLifecycleReceipt", "acquisitionCaptureManifest"];
  for (let index = 0; index < controlRoles.length; index += 1) {
    const role = controlRoles[index];
    const maximumBytes = role === "acquisitionCaptureManifest"
      ? 128 * 1024 : 32 * 1024;
    const read = stablePrivateRead(path.join(resolved,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES[role]),
    maximumBytes);
    files[role] = read;
    totalBytes += read.bytes.length;
    if (read.stat.mtimeNs > newestPayloadMtime) {
      newestPayloadMtime = read.stat.mtimeNs;
    }
  }
  const preflightReview = parsePreflightReview(files.preflightReview.bytes);
  const acquisitionLifecycle = parseAcquisitionLifecycleReceipt(
    files.acquisitionLifecycleReceipt.bytes, preflightReview,
    files.preflightReview.bytes);
  const publicationLifecycle = parsePublicationLifecycleReceipt(
    files.publicationLifecycleReceipt.bytes);
  if (publicationLifecycle.publicationLifecycleReceiptHash
      !== expectedPublicationLifecycleReceiptHash
    || publicationLifecycle.acquisitionLifecycleReceiptSha256
      !== sha256(files.acquisitionLifecycleReceipt.bytes)
    || publicationLifecycle.acquisitionCaptureManifestSha256
      !== sha256(files.acquisitionCaptureManifest.bytes)
    || publicationLifecycle.preflightReviewSha256
      !== sha256(files.preflightReview.bytes)) {
    fail("PUBLICATION_LIFECYCLE_RECEIPT_CROSSWALK_INVALID");
  }
  assertLocalRetentionWindowAllowsRawRead(acquisitionLifecycle);
  const manifestControl = validateAcquisitionManifest(
    files.acquisitionCaptureManifest.bytes, null,
    preflightReview, files.preflightReview.bytes, acquisitionLifecycle,
    files.acquisitionLifecycleReceipt.bytes);
  const publicationCreatedAtMs = canonicalUtcMilliseconds(
    publicationLifecycle.createdAtPublisherClock,
    "PUBLICATION_LIFECYCLE_CREATED_AT_INVALID");
  if (publicationCreatedAtMs < manifestControl.completedAtMs
    || publicationCreatedAtMs >= acquisitionLifecycle.retentionUntilMs) {
    fail("PUBLICATION_LIFECYCLE_TIME_CROSSWALK_INVALID");
  }
  for (let index = 0; index < FILE_ROLES.length; index += 1) {
    const role = FILE_ROLES[index];
    if (role === "publicationLifecycleReceipt" || role === "preflightReview"
      || role === "acquisitionLifecycleReceipt"
      || role === "acquisitionCaptureManifest") continue;
    const rawRole = role === "issueBefore" || role === "commentsA"
      || role === "issueMid" || role === "commentsB" || role === "issueAfter";
    if (rawRole) assertExternalLifecycleClear(lifecycleGuard);
    const read = stablePrivateRead(path.join(resolved,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES[role]));
    if (rawRole) assertExternalLifecycleClear(lifecycleGuard);
    files[role] = read;
    totalBytes += read.bytes.length;
    if (role !== "receipt" && read.stat.mtimeNs > newestPayloadMtime) {
      newestPayloadMtime = read.stat.mtimeNs;
    }
  }
  if (totalBytes > MAX_TOTAL_BUNDLE_BYTES
    || files.receipt.stat.mtimeNs < newestPayloadMtime) fail("BUNDLE_SIZE_OR_ORDER_INVALID");
  for (let index = 0; index < FILE_ROLES.length; index += 1) {
    const role = FILE_ROLES[index];
    const finalStat = lstatSync(path.join(resolved,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES[role]),
    { bigint: true });
    if (!sameStableStat(files[role].stat, finalStat)) fail("BUNDLE_CHANGED_DURING_READ");
  }
  const directoryAfter = lstatSync(resolved, { bigint: true });
  if (!sameStableStat(directoryBefore, directoryAfter)) fail("BUNDLE_CHANGED_DURING_READ");
  assertExternalLifecycleClear(lifecycleGuard);
  const receipt = parseJsonStrict(files.receipt.bytes, "BUNDLE_RECEIPT_JSON_INVALID");
  const report = parseJsonStrict(files.networkSafeReport.bytes,
    "BUNDLE_REPORT_JSON_INVALID");
  if (publicationLifecycle.sourcePrivateReceiptHash !== receipt.receiptHash
    || publicationLifecycle.networkSafeReportHash !== report.reportHash) {
    fail("PUBLICATION_LIFECYCLE_FINAL_CROSSWALK_INVALID");
  }
  return { files, receipt, report, publicationLifecycle };
}

function receiptCaptureInput(read) {
  exactObject(read.receipt, ["schema", "recordedAt",
    "providerResponseDateIsIndependentTime", "captureOrder", "captureMetadata",
    "acquisitionLifecycleReceipt", "acquisitionCaptureManifest",
    "preflightReview", "sourcePins",
    "privateCrosswalk", "privateCommitments", "sourceSpecificReviews",
    "sourceEntryLifecycle", "fileManifest", "networkSafeReportHash",
    "publicationOrder", "receiptWrittenLastRequired", "boundary", "receiptHash"],
  "PRIVATE_RECEIPT");
  if (read.receipt.schema
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.privateReceipt
    || !ArrayIsArray(read.receipt.captureMetadata)
    || read.receipt.captureMetadata.length !== CAPTURE_ROLES.length) {
    fail("PRIVATE_RECEIPT_INVALID");
  }
  const captures = {};
  for (let index = 0; index < CAPTURE_ROLES.length; index += 1) {
    const role = CAPTURE_ROLES[index];
    captures[role] = { bytes: read.files[role].bytes,
      meta: read.receipt.captureMetadata[index] };
  }
  return { captures,
    acquisitionLifecycleReceiptBytes:
      read.files.acquisitionLifecycleReceipt.bytes,
    acquisitionCaptureManifestBytes: read.files.acquisitionCaptureManifest.bytes,
    preflightReviewBytes: read.files.preflightReview.bytes,
    projectionKey: read.files.projectionKey.bytes };
}

function structuralFailure(error) {
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.structuralVerification,
    ok: false,
    fixedRawPinsMatched: false,
    exactFileAllowlistVerified: false,
    privateModesVerified: false,
    requestedVersionMatchedSelectedVersionInEveryCallerProvidedSlot: false,
    fiveCallerProvidedSlotOrderReplayed: false,
    externalHttpResponseOccurrenceCountEstablished: 0,
    acquisitionCaptureManifestControlFlowMeaningReplayed: false,
    independentAcquisitionWitnessEstablished: false,
    callerOperatorPolicyPreflightBytesCrosswalkedToManifest: false,
    preAcquisitionReviewTimingIndependentlyEstablished: false,
    acquisitionLifecycleReceiptReplayed: false,
    publicationLifecycleReceiptReplayed: false,
    rawRetentionLifecycleEnforcementIntegrated: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    trustedExternalFactEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    error: error instanceof ErrorConstructor ? error.message : "UNKNOWN_ERROR",
    boundary: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderGithubDiscoverySnapshotBundle(directory,
  input = {}) {
  try {
    fail("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED");
    rejectTree(input);
    exactObject(input, ["trustedLifecycleRoot", "expectedReceiptHash",
      "expectedNetworkSafeReportHash", "expectedPublicationLifecycleReceiptHash"],
    "VERIFY_INPUT");
    if (typeof input.trustedLifecycleRoot !== "string"
      || !RegExpTest(HASH, input.expectedReceiptHash)
      || !RegExpTest(HASH, input.expectedNetworkSafeReportHash)
      || !RegExpTest(HASH, input.expectedPublicationLifecycleReceiptHash)) {
      fail("EXPECTED_HASH_INVALID");
    }
    const read = readBundle(directory, input.trustedLifecycleRoot,
      input.expectedPublicationLifecycleReceiptHash);
    const rebuilt = deriveInternal(receiptCaptureInput(read));
    if (rebuilt.receipt.receiptHash !== input.expectedReceiptHash
      || rebuilt.report.reportHash !== input.expectedNetworkSafeReportHash
      || !same(rebuilt.receipt, read.receipt) || !same(rebuilt.report, read.report)
      || !BufferEquals(rebuilt.receiptBytes, read.files.receipt.bytes)
      || !BufferEquals(rebuilt.reportBytes, read.files.networkSafeReport.bytes)
      || !BufferEquals(rebuilt.rightsReviewBytes, read.files.rightsReview.bytes)
      || !BufferEquals(rebuilt.privacyReviewBytes, read.files.privacyReview.bytes)) {
      fail("BUNDLE_SEMANTIC_REPLAY_INVALID");
    }
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS
          .structuralVerification,
      ok: true,
      fixedRawPinsMatched: true,
      exactFileAllowlistVerified: true,
      privateModesVerified: true,
      localFilesystemReceiptOrderingConsistencyObserved: true,
      requestedVersionMatchedSelectedVersionInEveryCallerProvidedSlot: true,
      fiveCallerProvidedSlotOrderReplayed: true,
      externalHttpResponseOccurrenceCountEstablished: 0,
      acquisitionCaptureManifestControlFlowMeaningReplayed: false,
      independentAcquisitionWitnessEstablished: false,
      callerOperatorPolicyPreflightBytesCrosswalkedToManifest: true,
      preAcquisitionReviewTimingIndependentlyEstablished: false,
      acquisitionLifecycleReceiptReplayed: true,
      publicationLifecycleReceiptReplayed: true,
      rawRetentionLifecycleEnforcementIntegrated: false,
      currentTimeCheckedBeforeRawRead: false,
      occurrenceCensusPreservedSeparatelyFromObjectEquality: true,
      publisherNarrativeIncidentFactEstablished: false,
      directHistoricalParticipationVerified: false,
      actualHumanResponseEstablished: false,
      independentOutcomeEstablished: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      trustedExternalFactEstablished: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      error: null,
      boundary: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY,
    });
  } catch (error) { return structuralFailure(error); }
}

export function verifyAutonomousWorkOrderGithubDiscoverySnapshotAgainstTrustedFacts(
  directory, input = {}) {
  const structural = verifyAutonomousWorkOrderGithubDiscoverySnapshotBundle(
    directory, input);
  return deepFreeze({
    schema:
      "outsider/autonomous-work-order-github-discovery-trusted-fact-check/v1",
    ok: false,
    structuralSnapshotVerified: structural.ok,
    trustedExternalFactAdaptersIntegrated: false,
    trustedExternalFactEstablished: false,
    directHistoricalParticipationVerified: false,
    actualHumanResponseEstablished: false,
    independentOutcomeEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    result: "NOT_INTEGRATED",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    error: structural.ok
      ? "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_TRUSTED_FACT_NOT_INTEGRATED"
      : structural.error,
    boundary: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY,
  });
}

export function createAutonomousWorkOrderGithubDiscoveryProjectionKey() {
  return randomBytes(32);
}

export function parseAutonomousWorkOrderGithubDiscoveryHeadersManifest(bytes) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2 || bytes.length > 64 * 1024) {
    fail("HEADERS_MANIFEST_BYTES_INVALID");
  }
  const value = parseJsonStrict(bytes, "HEADERS_MANIFEST_JSON_INVALID");
  exactObject(value, ["schema", "captures"], "HEADERS_MANIFEST");
  if (value.schema
    !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.headersManifest) {
    fail("HEADERS_MANIFEST_SCHEMA_INVALID");
  }
  exactObject(value.captures, CAPTURE_ROLES, "HEADERS_MANIFEST_CAPTURES");
  for (let index = 0; index < CAPTURE_ROLES.length; index += 1) {
    validateMeta(value.captures[CAPTURE_ROLES[index]], index + 1,
      CAPTURE_ROLES[index]);
  }
  return deepFreeze(value);
}
