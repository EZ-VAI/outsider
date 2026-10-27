/*
 * TraceLab v0.0.2 versioned metadata/schema candidate.
 *
 * The existing v0.0.1 full-source adapter and artifact remain authoritative.
 * This module replays only bounded release/tag/commit/license/schema metadata
 * and emits a no-clobber Episode Data Engine acquisition queue. It never
 * treats publisher counts as replayed rows or downloads the release payload.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, rmdirSync,
} from "node:fs";
import path from "node:path";
import { types as utilTypes } from "node:util";

import { canonicalizeStrict } from "./canonical.js";
import { PUBLIC_AGENT_PINS } from "./outsider-public-agent-corpus.js";

/* Capture every ambient primitive used by both build and verify. A caller may
 * mutate globals or prototypes after import; this evidence path must continue
 * to use the functions that were reviewed at module initialization. Pre-import
 * realm integrity remains a host responsibility. */
const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BigIntConstructor = BigInt;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const ErrorConstructor = Error;
const FunctionPrototypeCall = Function.prototype.call;
const FunctionPrototypeBind = Function.prototype.bind;
const ReflectApply = Reflect.apply;
const uncurryThis = (method) => ReflectApply(
  FunctionPrototypeBind, FunctionPrototypeCall, [method],
);
const ArraySort = uncurryThis(Array.prototype.sort);
const BufferToString = uncurryThis(Buffer.prototype.toString);
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectIsFrozen = Object.isFrozen;
const ObjectKeys = Object.keys;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = uncurryThis(RegExp.prototype.test);
const StringConstructor = String;
const StringIncludes = uncurryThis(String.prototype.includes);
const StringSlice = uncurryThis(String.prototype.slice);
const StructuredClone = globalThis.structuredClone;
const JSONParse = JSON.parse;
const NumberConstructor = Number;
const NumberIsSafeInteger = Number.isSafeInteger;
const SetConstructor = Set;
const SetAdd = uncurryThis(Set.prototype.add);
const SetDelete = uncurryThis(Set.prototype.delete);
const SetHas = uncurryThis(Set.prototype.has);
const IsProxy = utilTypes.isProxy;
const PathDirname = path.dirname;
const PathJoin = path.join;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const CreateHash = createHash;
const hashProbe = CreateHash("sha256");
const HashUpdate = uncurryThis(hashProbe.update);
const HashDigest = uncurryThis(hashProbe.digest);
HashDigest(hashProbe);
const statsProbe = lstatSync(new URL(import.meta.url), { bigint: true });
const StatsIsFile = uncurryThis(statsProbe.isFile);
const StatsIsDirectory = uncurryThis(statsProbe.isDirectory);
const StatsIsSymbolicLink = uncurryThis(statsProbe.isSymbolicLink);

const typedArrayPrototype = ObjectGetPrototypeOf(Uint8Array.prototype);
const typedArrayByteLengthDescriptor = ObjectGetOwnPropertyDescriptor(
  typedArrayPrototype, "byteLength",
);
if (!typedArrayByteLengthDescriptor
  || typeof typedArrayByteLengthDescriptor.get !== "function") {
  throw new ErrorConstructor("TRACELAB_V002_QUEUE_INTRINSIC_CAPTURE_FAILED");
}
const TypedArrayByteLength = uncurryThis(typedArrayByteLengthDescriptor.get);

export const TRACELAB_V002_RELEASE = "v0.0.2";
export const TRACELAB_V002_COMMIT = "61fea8f97277d0aa247cc2e4c7e31f90ed2bea1c";
export const TRACELAB_V002_TREE = "efe2159a61747c6a13a8449a61f12ca42301365b";
export const TRACELAB_V002_HEAD_AT_REVIEW
  = "11b8b14c6005808ab272b3431487066832582414";
export const TRACELAB_V002_SCHEMA
  = "outsider/tracelab-versioned-source-candidate/v1";
export const TRACELAB_V002_CONTROL_QUEUE_SCHEMA
  = "outsider/episode-data-engine-source-candidate-queue/v1";

const DATASET_ID = "uw-syfi/TraceLab";
const REVIEWED_AT = "2026-08-28T05:00:00.000Z";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const LICENSE_STABLE_PSEUDONYM = /stable\s+pseudonyms/u;
const LICENSE_REAL_SESSION = /real Claude Code\s*\/\s*Codex sessions/u;
const MAX_SOURCE_BYTES = 512 * 1024;
const EXPECTED_RELEASE = ObjectFreeze({
  id: 359_213_480,
  publishedAt: "2026-07-24T09:55:14Z",
  immutable: false,
  publisherCounts: ObjectFreeze({
    agentSteps: 665_453,
    sessions: 8_058,
    pseudonymousUsers: 52,
    normalizedToolCalls: 743_819,
  }),
  assets: ObjectFreeze([
    ObjectFreeze({ name: "syfi_coding_trace.duckdb", sizeBytes: 160_182_272,
      sha256: "sha256:a7bab286bc640844560850965ccf47975cf66407154132abaab90f27ec9be744" }),
    ObjectFreeze({ name: "syfi_coding_trace.jsonl.gz", sizeBytes: 100_939_722,
      sha256: "sha256:11ce51ec0a25e3d1d95b025bca2f7d1647e47571eb7cc968acd5fc64d4b4fb65" }),
  ]),
});

export const TRACELAB_V002_SOURCE_URLS = ObjectFreeze({
  "tag-ref.json": `https://api.github.com/repos/uw-syfi/TraceLab/git/ref/tags/${TRACELAB_V002_RELEASE}`,
  "tag-commit.json": `https://api.github.com/repos/uw-syfi/TraceLab/git/commits/${TRACELAB_V002_COMMIT}`,
  "release.json": `https://api.github.com/repos/uw-syfi/TraceLab/releases/tags/${TRACELAB_V002_RELEASE}`,
  "head-at-review.json": "https://api.github.com/repos/uw-syfi/TraceLab/commits/main",
  "README.md": `https://raw.githubusercontent.com/uw-syfi/TraceLab/${TRACELAB_V002_COMMIT}/README.md`,
  "LICENSE-DATASET.md": `https://raw.githubusercontent.com/uw-syfi/TraceLab/${TRACELAB_V002_COMMIT}/LICENSE-DATASET.md`,
  NOTICE: `https://raw.githubusercontent.com/uw-syfi/TraceLab/${TRACELAB_V002_COMMIT}/NOTICE`,
});

function fail(code, detail = null) {
  throw new ErrorConstructor(detail == null ? `TRACELAB_V002_QUEUE_${code}`
    : `TRACELAB_V002_QUEUE_${code}:${detail}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function sha256(bytes) {
  const hash = CreateHash("sha256");
  HashUpdate(hash, bytes);
  return `sha256:${HashDigest(hash, "hex")}`;
}

function digest(domain, value) {
  return sha256(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function json(bytes, code) {
  try {
    const parsed = JSONParse(BufferToString(bytes, "utf8"));
    const canonical = canonicalizeStrict(parsed);
    return JSONParse(canonical, nullPrototypeReviver);
  }
  catch { fail(code); }
}

function text(bytes, code) {
  const value = BufferToString(bytes, "utf8");
  if (value.length === 0 || StringIncludes(value, "\u0000")) fail(code);
  return value;
}

function nullPrototypeReviver(_key, value) {
  if (!value || typeof value !== "object" || ArrayIsArray(value)) return value;
  const clean = ObjectCreate(null);
  const keys = ObjectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail("JSON_OBJECT_INVALID");
    }
    ObjectDefineProperty(clean, keys[index], {
      value: descriptor.value, enumerable: true, writable: true, configurable: true,
    });
  }
  return clean;
}

function stringCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedStrings(values) {
  const copy = new ArrayConstructor(values.length);
  for (let index = 0; index < values.length; index += 1) {
    ObjectDefineProperty(copy, index, { value: values[index], enumerable: true,
      writable: true, configurable: true });
  }
  ArraySort(copy, stringCompare);
  return copy;
}

function exactStrings(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function preflightCanonical(value, active = new SetConstructor()) {
  if (value === null || typeof value !== "object") return;
  if (IsProxy(value)) fail("PROXY_INPUT_REJECTED");
  const prototype = ObjectGetPrototypeOf(value);
  if (ArrayIsArray(value)) {
    if (prototype !== ArrayPrototype) fail("EXOTIC_INPUT_REJECTED");
  } else if (prototype !== ObjectPrototype && prototype !== null) {
    fail("EXOTIC_INPUT_REJECTED");
  }
  if (SetHas(active, value)) fail("CYCLIC_INPUT_REJECTED");
  SetAdd(active, value);
  try {
    const keys = ReflectOwnKeys(value);
    for (let index = 0; index < keys.length; index += 1) {
      const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
      if (!descriptor || !("value" in descriptor)) fail("ACCESSOR_INPUT_REJECTED");
      preflightCanonical(descriptor.value, active);
    }
  } finally {
    SetDelete(active, value);
  }
}

function strictClone(value) {
  preflightCanonical(value);
  canonicalizeStrict(value);
  const cloned = StructuredClone(value);
  canonicalizeStrict(cloned);
  return cloned;
}

function dataProperty(object, key, { required = true } = {}) {
  const descriptor = ObjectGetOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
    if (required) fail("CANONICAL_DATA_PROPERTY_REQUIRED", key);
    return undefined;
  }
  return descriptor.value;
}

function requireBytes(sourceBytes) {
  const names = sortedStrings(ObjectKeys(TRACELAB_V002_SOURCE_URLS));
  if (!sourceBytes || typeof sourceBytes !== "object" || IsProxy(sourceBytes)
    || ArrayIsArray(sourceBytes)
    || ObjectGetPrototypeOf(sourceBytes) !== ObjectPrototype) fail("SOURCE_SET_INVALID");
  const ownKeys = ReflectOwnKeys(sourceBytes);
  for (let index = 0; index < ownKeys.length; index += 1) {
    if (typeof ownKeys[index] !== "string") fail("SOURCE_SET_INVALID");
  }
  const suppliedNames = sortedStrings(ObjectKeys(sourceBytes));
  if (ownKeys.length !== suppliedNames.length || !exactStrings(suppliedNames, names)) {
    fail("SOURCE_SET_INVALID");
  }
  const clean = ObjectCreate(null);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const descriptor = ObjectGetOwnPropertyDescriptor(sourceBytes, name);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail("SOURCE_SET_INVALID");
    }
    const bytes = descriptor.value;
    if (IsProxy(bytes) || !BufferIsBuffer(bytes)) fail("SOURCE_OBJECT_SIZE_INVALID", name);
    const copied = BufferFrom(bytes);
    const byteLength = TypedArrayByteLength(copied);
    if (byteLength < 1 || byteLength > MAX_SOURCE_BYTES) {
      fail("SOURCE_OBJECT_SIZE_INVALID", name);
    }
    ObjectDefineProperty(clean, name, { value: copied, enumerable: true,
      writable: false, configurable: false });
  }
  return clean;
}

const PRIOR_TRACE_LAB_PIN = deepFreeze(strictClone(
  dataProperty(PUBLIC_AGENT_PINS, "traceLab"),
));

function tagProjection(bytes) {
  const value = json(bytes, "TAG_JSON_INVALID");
  if (value.ref !== `refs/tags/${TRACELAB_V002_RELEASE}`
    || value.object?.type !== "commit"
    || value.object?.sha !== TRACELAB_V002_COMMIT) fail("TAG_BINDING_INVALID");
  return { ref: value.ref, targetType: "commit", targetCommit: TRACELAB_V002_COMMIT };
}

function commitProjection(bytes) {
  const value = json(bytes, "COMMIT_JSON_INVALID");
  if (value.sha !== TRACELAB_V002_COMMIT || value.tree?.sha !== TRACELAB_V002_TREE
    || value.verification?.verified !== true
    || !ArrayIsArray(value.parents) || value.parents.length !== 2) {
    fail("TAG_COMMIT_INVALID");
  }
  const parentCommits = new ArrayConstructor(value.parents.length);
  for (let index = 0; index < value.parents.length; index += 1) {
    const parent = value.parents[index];
    if (!parent || !RegExpTest(SHA1, parent.sha ?? "")) fail("TAG_COMMIT_INVALID");
    ObjectDefineProperty(parentCommits, index, { value: parent.sha, enumerable: true,
      writable: true, configurable: true });
  }
  return { commit: value.sha, tree: value.tree.sha,
    authorDate: value.author?.date ?? null, verifiedByHost: true,
    parentCommits };
}

function assetProjection(asset) {
  if (asset?.state !== "uploaded" || !NumberIsSafeInteger(asset.size)
    || !RegExpTest(HASH, asset.digest ?? "") || typeof asset.name !== "string") {
    fail("RELEASE_ASSET_INVALID");
  }
  return { name: asset.name, sizeBytes: asset.size, sha256: asset.digest };
}

function releaseProjection(bytes) {
  const value = json(bytes, "RELEASE_JSON_INVALID");
  if (value.id !== EXPECTED_RELEASE.id || value.tag_name !== TRACELAB_V002_RELEASE
    || value.name !== "SyFI TraceLab v0.0.2" || value.draft !== false
    || value.prerelease !== false || value.immutable !== EXPECTED_RELEASE.immutable
    || value.published_at !== EXPECTED_RELEASE.publishedAt
    || !ArrayIsArray(value.assets) || value.assets.length !== 2) {
    fail("RELEASE_METADATA_INVALID");
  }
  const assets = new ArrayConstructor(value.assets.length);
  for (let index = 0; index < value.assets.length; index += 1) {
    ObjectDefineProperty(assets, index, { value: assetProjection(value.assets[index]),
      enumerable: true, writable: true, configurable: true });
  }
  ArraySort(assets, (left, right) => stringCompare(left.name, right.name));
  if (!same(assets, EXPECTED_RELEASE.assets)) fail("RELEASE_ASSET_BINDING_CHANGED");
  const body = StringConstructor(value.body ?? "");
  const bodyRequirements = [
    "665,453 agent steps", "8,058 sessions", "52 pseudonymous users",
    "743,819 normalized tool calls", StringSlice(EXPECTED_RELEASE.assets[0].sha256, 7),
    StringSlice(EXPECTED_RELEASE.assets[1].sha256, 7), "Privacy hardening",
  ];
  for (let index = 0; index < bodyRequirements.length; index += 1) {
    const required = bodyRequirements[index];
    if (!StringIncludes(body, required)) fail("RELEASE_BODY_CLAIM_MISSING", required);
  }
  return { releaseId: value.id, release: value.tag_name,
    publishedAt: value.published_at, immutableOnHost: value.immutable,
    publisherCounts: strictClone(EXPECTED_RELEASE.publisherCounts), assets,
    publisherPrivacyHardeningClaimObserved: true };
}

function headProjection(bytes) {
  const value = json(bytes, "HEAD_JSON_INVALID");
  if (value.sha !== TRACELAB_V002_HEAD_AT_REVIEW
    || value.sha === TRACELAB_V002_COMMIT
    || !RegExpTest(SHA1, value.commit?.tree?.sha ?? "")) {
    fail("HEAD_SNAPSHOT_INVALID");
  }
  return { branch: "main", headAtReview: value.sha,
    headTreeAtReview: value.commit.tree.sha,
    tagTargetDiffersFromMovingHead: true,
    headObservedCommitDate: value.commit?.committer?.date ?? null };
}

function documentationProjection(sourceBytes) {
  const readme = text(sourceBytes["README.md"], "README_INVALID");
  const license = text(sourceBytes["LICENSE-DATASET.md"], "LICENSE_INVALID");
  const notice = text(sourceBytes.NOTICE, "NOTICE_INVALID");
  const readmeRequirements = ["357K LLM rounds", "43 developers", "tools[].input",
    "timing_events[]", "tool_call_id", "command_exit_code"];
  for (let index = 0; index < readmeRequirements.length; index += 1) {
    const required = readmeRequirements[index];
    if (!StringIncludes(readme, required)) {
      fail("README_SCHEMA_OR_PRIOR_COUNT_MISSING", required);
    }
  }
  const licenseRequirements = ["Creative Commons Attribution 4.0 International",
    "sanitized", "local context", "tool inputs", "stripped before",
    "do not attempt to re-identify"];
  for (let index = 0; index < licenseRequirements.length; index += 1) {
    const required = licenseRequirements[index];
    if (!StringIncludes(license, required)) fail("LICENSE_DECLARATION_INVALID", required);
  }
  if (!RegExpTest(LICENSE_STABLE_PSEUDONYM, license)
    || !RegExpTest(LICENSE_REAL_SESSION, license)) {
    fail("LICENSE_PRIVACY_DECLARATION_INVALID");
  }
  if (!StringIncludes(notice, "Creative Commons Attribution 4.0 International License")) {
    fail("NOTICE_DECLARATION_INVALID");
  }
  return {
    declaredDatasetLicense: "CC-BY-4.0",
    attributionRequired: true,
    privacyClaims: {
      realClaudeCodexSessions: true,
      stablePseudonyms: true,
      localPathsAndToolInputsStripped: true,
      noReidentificationRequested: true,
      independentlyVerifiedByOutsider: false,
    },
    schemaFieldsObserved: ["timing_events[]", "tools[].tool_call_id",
      "tools[].emitted_at", "tools[].result_at", "tools[].input_chars",
      "tools[].result_chars", "tools[].is_error", "tools[].command_exit_code"],
    metadataConflict: {
      releaseClaimsAgentSteps: EXPECTED_RELEASE.publisherCounts.agentSteps,
      tagCommitReadmeStillDisplaysApproximateRounds: "357K",
      releaseClaimsPseudonymousUsers: EXPECTED_RELEASE.publisherCounts.pseudonymousUsers,
      tagCommitReadmeStillDisplaysDevelopers: 43,
      reconciled: false,
      consequence: "RELEASE_COUNTS_REMAIN_PUBLISHER_CLAIMS_UNTIL_FULL_ASSET_REPLAY",
    },
  };
}

function sourceObject(name, bytes) {
  return { path: `source/${name}`, url: TRACELAB_V002_SOURCE_URLS[name],
    sizeBytes: TypedArrayByteLength(bytes), sha256: sha256(bytes) };
}

function trainingBoundary() {
  return {
    purpose: "EPISODE_GAP_REVIEW_AND_RECOVERY_ACQUISITION_RANKING_ONLY",
    sourceReplayedEpisodeRows: 0,
    admittedTrainingRows: 0,
    fixedGroupDisjointHoldoutEstablished: false,
    explicitBaseline: null,
    candidateModel: null,
    outcomeBlindRandomAuditReserve: null,
    fitPerformed: false,
    decision: "KEEP_BASELINE_NO_SOURCE_REPLAYED_ADMITTED_EPISODE_ROWS",
    promoted: false,
    productionTrainingAuthorized: false,
    modelDeploymentAuthorized: false,
  };
}

function boundary() {
  return {
    metadataSchemaOnly: true,
    releasePayloadDownloaded: false,
    releasePayloadBytesDownloaded: 0,
    episodeRowsAdmitted: 0,
    networkRecordsCreated: 0,
    rawMaterialNetworkProjection: false,
    authority: "none",
    authorityUnits: 0,
    causalExperienceUnits: 0,
    CEU: 0,
    actionReady: false,
    executable: false,
    expandDelegation: false,
    price: false,
    guarantee: false,
    settle: false,
  };
}

function ownerProviderQuestions(sourceRoot) {
  const questions = [
    {
      segment: "PRE_ACTION_DELEGATION_AND_CENSUS",
      question: "Can each contributing runtime emit, before execution, an owner-signed opaque episode key bound to principal epoch, accountable deployment, runtime, delegated scope, expiry/revocation state, expected effect class and affected-party class?",
      currentStatus: "ABSENT_FROM_RELEASE_METADATA",
    },
    {
      segment: "NATIVE_COMMAND_TO_EFFECT_TRACE",
      question: "Can the v0.0.2 asset be replayed at its published digest and preserve ordered proposed, blocked, committed, result and observed-effect events plus contributor correlation roots, without restoring stripped tool inputs or local identifiers?",
      currentStatus: "PUBLISHER_SCHEMA_CLAIM_ONLY_PAYLOAD_NOT_DOWNLOADED",
    },
    {
      segment: "INDEPENDENT_DELAYED_OUTCOME_AND_RECOVERY",
      question: "Can an observer independent of the acting model and trace publisher join later repository, CI, user-acceptance, affected-party consequence, repair, challenge and reopen events to the same opaque episode key under predeclared windows?",
      currentStatus: "ABSENT_FROM_RELEASE_METADATA",
    },
  ];
  const projected = new ArrayConstructor(questions.length);
  for (let index = 0; index < questions.length; index += 1) {
    ObjectDefineProperty(projected, index, {
      value: { ...questions[index], metadataSourceRoot: sourceRoot },
      enumerable: true, writable: true, configurable: true,
    });
  }
  return projected;
}

export function buildTraceLabV002SourceCandidate(sourceBytes) {
  const sources = requireBytes(sourceBytes);
  if (PRIOR_TRACE_LAB_PIN.id !== DATASET_ID
    || PRIOR_TRACE_LAB_PIN.release !== "v0.0.1") fail("PRIOR_ADAPTER_PIN_INVALID");
  const tag = tagProjection(sources["tag-ref.json"]);
  const commit = commitProjection(sources["tag-commit.json"]);
  const release = releaseProjection(sources["release.json"]);
  const head = headProjection(sources["head-at-review.json"]);
  const documentation = documentationProjection(sources);
  const sourceNames = sortedStrings(ObjectKeys(TRACELAB_V002_SOURCE_URLS));
  const sourceObjects = new ArrayConstructor(sourceNames.length);
  for (let index = 0; index < sourceNames.length; index += 1) {
    const name = sourceNames[index];
    ObjectDefineProperty(sourceObjects, index, { value: sourceObject(name, sources[name]),
      enumerable: true, writable: true, configurable: true });
  }
  const sourceRoot = digest("outsider/tracelab-v002-metadata-source-set/v1", sourceObjects);
  const episodeCoverage = {
    sourceReplayedRows: 0,
    publisherClaimedAgentSteps: release.publisherCounts.agentSteps,
    publisherClaimedCountsPromotedToReplayedRows: false,
    preActionDelegationCensusObserved: 0,
    actionBoundaryTraceObserved: 0,
    physicalEffectTraceObserved: 0,
    sourceNativeTerminalOutcomeObserved: 0,
    independentHumanTerminalReviewObserved: 0,
    sourceNativeValidRecoveryWindowsObserved: 0,
    independentLongitudinalOutcomeObserved: 0,
    completeThreeSegmentEpisodes: 0,
  };
  const training = trainingBoundary();
  const questions = ownerProviderQuestions(sourceRoot);
  const queueBody = {
    schema: TRACELAB_V002_CONTROL_QUEUE_SCHEMA,
    queueId: "tracelab-v002-versioned-full-source-and-missing-segments-v1",
    datasetId: DATASET_ID,
    candidateRelease: TRACELAB_V002_RELEASE,
    candidateCommit: TRACELAB_V002_COMMIT,
    metadataSourceRoot: sourceRoot,
    lane: "DIGITAL_AGENT_ACTION_TRACE_VERSION_UPGRADE_AND_EPISODE_COMPLETION",
    state: "HOLD_METADATA_SCHEMA_ONLY_FULL_ASSET_AND_OWNER_PROVIDER_REVIEW_REQUIRED",
    episodeCoverage,
    acquisitionQuestions: questions,
    fullAssetAdmissionGates: [
      "NEW_NO_CLOBBER_VERSIONED_SOURCE_DIRECTORY",
      "JSONL_GZIP_EXACT_SIZE_AND_SHA256_MATCH",
      "GZIP_STREAM_AND_COMPLETE_LOGICAL_ROW_REPLAY",
      "TAG_TARGET_COMMIT_AND_PINNED_LICENSE_REPLAY",
      "PRIVACY_SANITIZATION_REVIEW_WITHOUT_REIDENTIFICATION",
      "PSEUDONYMOUS_CONTRIBUTOR_CORRELATION_ROOT_FREEZE",
      "NORMALIZED_RECORD_SET_REBUILD_AND_EXACT_COMPARE",
      "EXISTING_V001_ARTIFACT_REMAINS_AVAILABLE_AND_SUPERSEDED_NOT_OVERWRITTEN",
    ],
    trainingDecision: training.decision,
    automaticRetrieval: false,
    dispatched: false,
    actionReady: false,
    executable: false,
  };
  const controlPlaneQueue = { ...queueBody,
    queueHash: digest(TRACELAB_V002_CONTROL_QUEUE_SCHEMA, queueBody) };
  const body = {
    schema: TRACELAB_V002_SCHEMA,
    schemaVersion: "1.0.0",
    reviewedAt: REVIEWED_AT,
    datasetId: DATASET_ID,
    sourceTrust: {
      trustClass: "PINNED_RELEASE_METADATA_SCHEMA_AND_RIGHTS_BYTES_REPLAYED",
      fullReleaseAssetReplayed: false,
      sourceRowsReplayed: 0,
      sourceObjects,
      sourceRoot,
      rawSourceMaterialProjectedToNetwork: false,
    },
    tag,
    commit,
    movingHeadObservation: head,
    release,
    documentation,
    priorVersion: {
      release: PRIOR_TRACE_LAB_PIN.release,
      revision: PRIOR_TRACE_LAB_PIN.revision,
      asset: strictClone(PRIOR_TRACE_LAB_PIN.upstreamObject),
      existingAdapter: "src/outsider-public-agent-corpus.js",
      existingArtifact: "artifacts/public-agent-corpus-20260820",
      existingNormalizedSessionRecords: 4_265,
      fullSourceReplayClaimedByThisCandidateModule: false,
      preserved: true,
    },
    supersession: {
      mode: "VERSIONED_NO_CLOBBER_CANDIDATE",
      candidateRelease: TRACELAB_V002_RELEASE,
      priorReleasePreserved: true,
      priorArtifactOverwritten: false,
      currentPointerUpdated: false,
      candidatePromoted: false,
      promotionRequiresFullAssetReplay: true,
    },
    rightsAndPrivacy: {
      declaredDatasetLicense: documentation.declaredDatasetLicense,
      licenseAndNoticeBytesReplayed: true,
      publisherSanitizationClaimsObserved: true,
      payloadPrivacyInspectedByOutsider: false,
      contributorConsentScopeIndependentlyVerified: false,
      affectedPartyReviewComplete: false,
      legalConclusion: false,
      disposition: "METADATA_SCHEMA_PIN_ONLY_NO_PAYLOAD_OR_TRAINING_ADMISSION",
    },
    episodeCoverage,
    training,
    controlPlaneQueue,
    boundary: boundary(),
    limitations: [
      "The 665,453 step count is a publisher release claim; Outsider replayed zero v0.0.2 payload rows.",
      "The release object is not marked immutable by GitHub, so exact stored metadata bytes and asset digests remain mandatory.",
      "The tag commit README retains v0.0.1-scale display counts; the conflict is not silently reconciled.",
      "TraceLab supplies sanitized action telemetry, not pre-action delegation census or independent delayed outcome/recovery.",
      "The existing v0.0.1 full-source artifact remains authoritative until a separate v0.0.2 full-source replay passes every gate.",
      "No metadata, publisher count, error flag or model-derived signal grants authority, CEU, PRICE, GUARANTEE, SETTLE or delegation expansion.",
    ],
  };
  return deepFreeze({ ...body, reportHash: digest(TRACELAB_V002_SCHEMA, body) });
}

function safeRead(file) {
  const target = PathResolve(file);
  const stat = lstatSync(target, { bigint: true });
  if (StatsIsSymbolicLink(stat) || !StatsIsFile(stat) || stat.size < 1n
    || stat.size > BigIntConstructor(MAX_SOURCE_BYTES)) fail("SOURCE_FILE_UNSAFE", target);
  let descriptor;
  try {
    descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!StatsIsFile(before) || before.dev !== stat.dev || before.ino !== stat.ino
      || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs
      || TypedArrayByteLength(bytes) !== NumberConstructor(before.size)) {
      fail("SOURCE_FILE_CHANGED_DURING_READ", target);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function buildTraceLabV002SourceCandidateFromDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length === 0) {
    fail("SOURCE_DIRECTORY_REQUIRED");
  }
  const root = PathResolve(sourceDirectory);
  const sources = {};
  const names = ObjectKeys(TRACELAB_V002_SOURCE_URLS);
  for (let index = 0; index < names.length; index += 1) {
    ObjectDefineProperty(sources, names[index], {
      value: safeRead(PathJoin(root, names[index])), enumerable: true,
      writable: true, configurable: true,
    });
  }
  return buildTraceLabV002SourceCandidate(sources);
}

export function publishTraceLabV002ArtifactDirectory(stagingDirectory,
  targetDirectory) {
  if (typeof stagingDirectory !== "string" || stagingDirectory.length === 0
    || typeof targetDirectory !== "string" || targetDirectory.length === 0) {
    fail("PUBLISH_DIRECTORY_REQUIRED");
  }
  const staging = PathResolve(stagingDirectory);
  const target = PathResolve(targetDirectory);
  if (staging === target || PathDirname(staging) !== PathDirname(target)) {
    fail("PUBLISH_DIRECTORIES_MUST_BE_DISTINCT_SIBLINGS");
  }
  const stagingStat = lstatSync(staging, { bigint: true });
  if (StatsIsSymbolicLink(stagingStat) || !StatsIsDirectory(stagingStat)) {
    fail("PUBLISH_STAGING_UNSAFE", staging);
  }

  /* mkdir without recursive is the atomic no-clobber claim. Even if another
   * process creates target after the caller's early existence check, this
   * fails rather than replacing that directory. Receipt moves last and is the
   * completion marker; a mid-publish failure leaves a fail-closed partial claim. */
  try {
    mkdirSync(target, { mode: 0o700 });
    chmodSync(target, 0o700);
  } catch {
    fail("TARGET_CLAIM_FAILED", target);
  }
  const claimedStat = lstatSync(target, { bigint: true });
  if (StatsIsSymbolicLink(claimedStat) || !StatsIsDirectory(claimedStat)) {
    fail("TARGET_CLAIM_UNSAFE", target);
  }
  try {
    renameSync(PathJoin(staging, "source"), PathJoin(target, "source"));
    renameSync(PathJoin(staging, "report.json"), PathJoin(target, "report.json"));
    renameSync(PathJoin(staging, "run-receipt.json"),
      PathJoin(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch {
    fail("TARGET_PUBLISH_FAILED", target);
  }
  return target;
}

function canonicalSnapshot(value) {
  preflightCanonical(value);
  const canonical = canonicalizeStrict(value);
  return JSONParse(canonical, nullPrototypeReviver);
}

function safeErrorMessage(error) {
  try {
    const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
    if (descriptor && "value" in descriptor && typeof descriptor.value === "string") {
      return descriptor.value;
    }
  } catch {
    // A hostile proxy may also reject descriptor inspection.
  }
  return "TRACELAB_V002_QUEUE_UNSAFE_OR_NONCANONICAL_INPUT";
}

export function verifyTraceLabV002SourceCandidate(record, options = undefined) {
  try {
    /* Snapshot before schema/reportHash access. canonicalizeStrict rejects
     * accessors and exotics; the detached value cannot change between the
     * verifier's precheck and its full metadata replay comparison. */
    const snapshot = canonicalSnapshot(record);
    const schema = dataProperty(snapshot, "schema");
    const reportHash = dataProperty(snapshot, "reportHash");
    let sourceDirectory = null;
    if (options !== undefined) {
      const optionsSnapshot = canonicalSnapshot(options);
      const optionKeys = ObjectKeys(optionsSnapshot);
      if (optionKeys.length !== 1 || optionKeys[0] !== "sourceDirectory") {
        fail("VERIFY_OPTIONS_INVALID");
      }
      sourceDirectory = dataProperty(optionsSnapshot, "sourceDirectory");
    }
    if (schema !== TRACELAB_V002_SCHEMA
      || !RegExpTest(HASH, reportHash) || typeof sourceDirectory !== "string") {
      return ObjectFreeze({ ok: false,
        error: "TRACELAB_V002_QUEUE_FULL_METADATA_SOURCE_REPLAY_REQUIRED" });
    }
    const rebuilt = buildTraceLabV002SourceCandidateFromDirectory(sourceDirectory);
    if (!same(snapshot, rebuilt)) return ObjectFreeze({ ok: false,
      error: "TRACELAB_V002_QUEUE_SOURCE_REPLAY_MISMATCH" });
    return ObjectFreeze({ ok: true, reportHash: rebuilt.reportHash,
      sourceRoot: rebuilt.sourceTrust.sourceRoot,
      queueHash: rebuilt.controlPlaneQueue.queueHash,
      sourceRowsReplayed: 0, admittedEpisodeRows: 0,
      trainingDecision: rebuilt.training.decision,
      priorReleasePreserved: true });
  } catch (error) {
    return ObjectFreeze({ ok: false, error: safeErrorMessage(error) });
  }
}
