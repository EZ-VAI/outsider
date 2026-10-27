/*
 * Local, cooperating-writer append-only head registry for v1 Episode
 * Attempt-set compositions.
 *
 * The frozen v1 composition remains the semantic record.  This successor
 * atomically creates one exact entry per v1 revision and replays every stored
 * ancestor through `verifyEpisodeAttemptSetComposition`.  For cooperating
 * writers using the same directory and this writer path, an exclusive lock
 * plus a compare-and-swap token prevents two accepted successors from the
 * same observed local head.  It does not coordinate a second root or an owner
 * that writes around this module.
 *
 * This is deliberately not called durable external provenance.  The complete
 * directory can still be copied, rolled back, replaced, or recreated under a
 * second root by its owner.  No caller pin, local self-hash, fsync, or unique
 * filename changes that fact.  External anchoring, independent witnesses,
 * WORM retention, non-omission, and global fork/genesis exclusion all remain
 * false.  Once an entry link is created, a later fsync, verification, or lock
 * release failure is reported as COMMIT_STATUS_UNKNOWN_REPLAY_REQUIRED; that
 * error never means the entry is absent.  The module never deletes a linked
 * target and never performs automatic stale-lock recovery.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  EPISODE_ATTEMPT_SET_SCHEMAS,
  verifyEpisodeAttemptSetComposition,
} from "./outsider-episode-attempt-set-composition.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const REGISTRY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ENTRY_FILE = /^[0-9]{12}\.json$/u;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 100_000;

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferPrototype = Buffer.prototype;
const BufferEquals = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(BufferPrototype, "equals").value);
const BufferToString = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(BufferPrototype, "toString").value);
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
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
const TypeErrorConstructor = TypeError;

export const EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_SCHEMAS = ObjectFreeze({
  entry: "outsider/episode-attempt-set-local-head-entry/v2",
  head: "outsider/episode-attempt-set-local-head/v2",
  verification: "outsider/episode-attempt-set-local-head-verification/v2",
});

export const EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_COMMIT_STATUS_UNKNOWN_ERROR
  = "EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_COMMIT_STATUS_UNKNOWN_REPLAY_REQUIRED";

export const EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_BOUNDARY = deepFreeze({
  position:
    "LOCAL_UNIQUE_HEAD_STRUCTURAL_DESCENDANT_OVER_FROZEN_V1_COMPOSITIONS_HOLD_ONLY",
  frozenV1CompositionReusedWithoutModification: true,
  entryWriterUsesAtomicCreatePerV1Revision: true,
  entryImmutabilityEstablished: false,
  everyStoredV1CompositionReplayedFromGenesis: true,
  fullAncestryScope:
    "TWO_PASS_STABLE_EXACT_ENTRY_BYTES_IN_ONE_OBSERVED_LOCAL_REGISTRY",
  twoPassFileDescriptorStatAndByteStabilityRequired: true,
  cooperativeLocalFilesystemObservationOnly: true,
  hostileConcurrentOwnerMutationExcluded: false,
  localHeadDerivedFromEntrySetNotMutableHeadFile: true,
  mutableHeadFileRead: false,
  expectedLocalHeadHashRequiredForAppend: true,
  expectedLocalHeadHashIsConcurrencyTokenOnly: true,
  appendFailureCanRequireReplay: true,
  commitStatusUnknownNeverMeansEntryAbsent: true,
  commitStatusUnknownErrorCode:
    EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_COMMIT_STATUS_UNKNOWN_ERROR,
  automaticStaleLockRecovery: false,
  staleLockRequiresExplicitOperatorReview: true,
  callerSelfPinAcceptedAsDurabilityProof: false,
  sameRevisionResealAccepted: false,
  observedDirectoryParallelGenesisAccepted: false,
  observedDirectoryForkAccepted: false,
  secondDirectoryForSameEpisodePrevented: false,
  parallelGenesisExclusionEstablished: false,
  forkExclusionEstablished: false,
  ownerRollbackOrDirectoryReplacementExcluded: false,
  externalHeadPinVerified: false,
  externalAnchorEstablished: false,
  independentExternalProvenanceEstablished: false,
  independentWitnessEstablished: false,
  wormStorageEstablished: false,
  nonOmissionProofEstablished: false,
  nonEquivocationEstablished: false,
  durableAppendOnlyHistoryEstablished: false,
  sourceReplayBeyondFrozenV1CompositionPerformed: false,
  episodeMembershipSourceReplayVerified: false,
  obligationSourceReplayVerified: false,
  independentOutcomeEstablished: false,
  authority: "NONE",
  authorityGrants: 0,
  actionReady: false,
  actionAuthorized: false,
  actionAdmissions: 0,
  executable: false,
  automaticTraining: false,
  productionTrainingAuthorized: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  pricingAuthorized: false,
  permitsPricing: false,
  guaranteeEstablished: false,
  permitsGuarantee: false,
  settlementAuthorized: false,
  permitsSettlement: false,
  status: "HOLD",
  decisionState: "HOLD",
  disposition: "QUARANTINED",
});

export const EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_GENESIS_ENTRY_HASH
  = `sha256:${createHash("sha256")
    .update("outsider/episode-attempt-set-local-head/genesis-entry/v2", "utf8")
    .digest("hex")}`;

function fail(code, detail = null) {
  throw new TypeErrorConstructor(detail === null
    ? `EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_${code}`
    : `EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_${code}:${detail}`);
}

function commitStatusUnknown(phase) {
  throw new TypeErrorConstructor(
    `${EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_COMMIT_STATUS_UNKNOWN_ERROR}:${phase}`);
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)
    || SetHas(seen, value)) return value;
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return ObjectFreeze(value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
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

function exactArray(value, code) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype) {
    fail(`${code}_ARRAY_INVALID`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_ARRAY_INVALID`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_ARRAY_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function registryId(value) {
  if (typeof value !== "string" || !RegExpTest(REGISTRY_ID, value)) {
    fail("REGISTRY_ID_INVALID");
  }
  return value;
}

function canonicalTimestamp(value, code) {
  if (typeof value !== "string") fail(`${code}_INVALID`);
  const parsed = DateParse(value);
  if (!NumberIsSafeInteger(parsed) || DateToISOString(new Date(parsed)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function assertPrivateDirectory(directory, code) {
  let stat;
  try { stat = lstatSync(directory); }
  catch (error) { fail(`${code}_UNREADABLE`, error?.code ?? "UNKNOWN"); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${code}_UNSAFE_TYPE`);
  if ((stat.mode & 0o077) !== 0) fail(`${code}_PERMISSIONS_TOO_BROAD`);
}

function validatePrivateRegularStat(stat, code, { pathStat = false } = {}) {
  if ((pathStat && stat.isSymbolicLink()) || !stat.isFile()) {
    fail(`${code}_UNSAFE_TYPE`);
  }
  if ((stat.mode & 0o077n) !== 0n) fail(`${code}_PERMISSIONS_TOO_BROAD`);
  if (stat.size < 2n || stat.size > BigInt(MAX_ENTRY_BYTES)) {
    fail(`${code}_SIZE_INVALID`);
  }
}

function fileSnapshot(stat) {
  return {
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    size: stat.size.toString(),
    mode: stat.mode.toString(),
    modifiedAtNanoseconds: stat.mtimeNs.toString(),
    changedAtNanoseconds: stat.ctimeNs.toString(),
  };
}

function sameFileSnapshot(left, right) {
  return left.device === right.device && left.inode === right.inode
    && left.size === right.size && left.mode === right.mode
    && left.modifiedAtNanoseconds === right.modifiedAtNanoseconds
    && left.changedAtNanoseconds === right.changedAtNanoseconds;
}

function readDeclaredFileBytes(descriptor, declaredSize, code) {
  const size = Number(declaredSize);
  const storage = Buffer.allocUnsafe(size + 1);
  let offset = 0;
  while (offset < storage.length) {
    const count = readSync(descriptor, storage, offset, storage.length - offset, null);
    if (count === 0) break;
    offset += count;
  }
  if (offset !== size) fail(`${code}_SIZE_CHANGED_DURING_BOUNDED_FD_READ`);
  return storage.subarray(0, size);
}

function readStablePrivateFile(file, code) {
  if (!NumberIsSafeInteger(constants.O_NOFOLLOW)) fail("O_NOFOLLOW_UNAVAILABLE");
  let pathBefore;
  try { pathBefore = lstatSync(file, { bigint: true }); }
  catch (error) { fail(`${code}_UNREADABLE`, error?.code ?? "UNKNOWN"); }
  validatePrivateRegularStat(pathBefore, code, { pathStat: true });
  const pathBeforeSnapshot = fileSnapshot(pathBefore);
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW;
  let descriptor;
  try {
    descriptor = openSync(file, flags);
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    validatePrivateRegularStat(descriptorBefore, code);
    const descriptorBeforeSnapshot = fileSnapshot(descriptorBefore);
    if (!sameFileSnapshot(pathBeforeSnapshot, descriptorBeforeSnapshot)) {
      fail(`${code}_PATH_DESCRIPTOR_SNAPSHOT_MISMATCH`);
    }
    // Read at most the pre-open bounded size plus one sentinel byte.  A file
    // that grows after fstat therefore fails without an unbounded allocation.
    const bytes = readDeclaredFileBytes(descriptor, descriptorBefore.size, code);
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    validatePrivateRegularStat(descriptorAfter, code);
    const descriptorAfterSnapshot = fileSnapshot(descriptorAfter);
    let pathAfter;
    try { pathAfter = lstatSync(file, { bigint: true }); }
    catch (error) { fail(`${code}_PATH_RESTAT_FAILED`, error?.code ?? "UNKNOWN"); }
    validatePrivateRegularStat(pathAfter, code, { pathStat: true });
    const pathAfterSnapshot = fileSnapshot(pathAfter);
    if (!sameFileSnapshot(descriptorBeforeSnapshot, descriptorAfterSnapshot)
      || !sameFileSnapshot(descriptorAfterSnapshot, pathAfterSnapshot)
      || bytes.length !== Number(descriptorAfter.size)) {
      fail(`${code}_CHANGED_DURING_FD_READ`);
    }
    return { bytes, snapshot: descriptorAfterSnapshot };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory, constants.O_RDONLY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function pathsFor(directory) {
  const root = path.resolve(directory);
  return {
    root,
    entries: path.join(root, "entries"),
    temporary: path.join(root, "tmp"),
    lock: path.join(root, "append.lock"),
  };
}

function createLayout(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    fail("DIRECTORY_INVALID");
  }
  const paths = pathsFor(directory);
  if (existsSync(paths.root)) fail("DIRECTORY_ALREADY_EXISTS");
  assertPrivateDirectory(path.dirname(paths.root), "PARENT_DIRECTORY");
  try { mkdirSync(paths.root, { mode: 0o700 }); }
  catch (error) { fail("DIRECTORY_CREATE_FAILED", error?.code ?? "UNKNOWN"); }
  mkdirSync(paths.entries, { mode: 0o700 });
  mkdirSync(paths.temporary, { mode: 0o700 });
  fsyncDirectory(path.dirname(paths.root));
  fsyncDirectory(paths.root);
  return paths;
}

function assertLayout(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    fail("DIRECTORY_INVALID");
  }
  const paths = pathsFor(directory);
  assertPrivateDirectory(paths.root, "REGISTRY_DIRECTORY");
  assertPrivateDirectory(paths.entries, "ENTRY_DIRECTORY");
  assertPrivateDirectory(paths.temporary, "TEMP_DIRECTORY");
  const top = readdirSync(paths.root).sort();
  const permitted = existsSync(paths.lock)
    ? ["append.lock", "entries", "tmp"] : ["entries", "tmp"];
  if (!same(top, permitted)) fail("REGISTRY_LAYOUT_EXTRA_OR_MISSING_ENTRY");
  return paths;
}

function entryPath(paths, sequence) {
  return path.join(paths.entries, `${String(sequence).padStart(12, "0")}.json`);
}

function atomicCreateEntry(paths, sequence, entry) {
  const target = entryPath(paths, sequence);
  if (existsSync(target)) fail("ENTRY_TARGET_ALREADY_EXISTS");
  const temporary = path.join(paths.temporary,
    `.entry-${String(sequence).padStart(12, "0")}-${process.pid}`
      + `-${BufferToString(randomBytes(12), "hex")}.tmp`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  let descriptor;
  let linked = false;
  try {
    descriptor = openSync(temporary, flags, 0o600);
    writeFileSync(descriptor, canonicalBytes(entry));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, target);
    linked = true;
    fsyncDirectory(paths.entries);
  } catch (error) {
    if (linked) commitStatusUnknown("ENTRY_LINKED_POST_LINK_DURABILITY_FAILED");
    if (error?.code === "EEXIST") fail("ENTRY_TARGET_ALREADY_EXISTS");
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* uncommitted temporary only */ }
  }
  try {
    const committed = readCanonicalJson(target, "ENTRY_FILE");
    if (!same(committed.value, entry)) fail("ENTRY_POST_CREATE_BYTES_MISMATCH");
  } catch {
    commitStatusUnknown("ENTRY_LINKED_POST_CREATE_REPLAY_FAILED");
  }
}

function lockBody() {
  const body = {
    schema: "outsider/episode-attempt-set-local-head-lock/v2",
    pid: process.pid,
    nonce: BufferToString(randomBytes(16), "hex"),
  };
  return { ...body, lockHash: digest("outsider/episode-attempt-set-local-head-lock/v2", body) };
}

function acquireLock(paths) {
  const lock = lockBody();
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  let descriptor;
  let lockPathCreated = false;
  try {
    descriptor = openSync(paths.lock, flags, 0o600);
    lockPathCreated = true;
    writeFileSync(descriptor, canonicalBytes(lock));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    fsyncDirectory(paths.root);
    return lock;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* lock state remains operator-reviewed */ }
    }
    if (!lockPathCreated && error?.code === "EEXIST") fail("WRITER_LOCK_PRESENT");
    if (lockPathCreated) {
      commitStatusUnknown("LOCK_ACQUIRE_DURABILITY_UNKNOWN_OPERATOR_REVIEW_REQUIRED");
    }
    throw error;
  }
}

function readCanonicalJson(file, code) {
  const { bytes, snapshot } = readStablePrivateFile(file, code);
  if (bytes[bytes.length - 1] !== 0x0a) fail(`${code}_BYTES_INVALID`);
  let value;
  try { value = JSON.parse(BufferToString(bytes, "utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (!BufferEquals(bytes, canonicalBytes(value))) fail(`${code}_NON_CANONICAL`);
  return { value, bytes, snapshot };
}

function releaseLock(paths, owned) {
  const { value: observed } = readCanonicalJson(paths.lock, "LOCK_FILE");
  exactObject(observed, ["schema", "pid", "nonce", "lockHash"], "LOCK");
  if (observed.schema !== owned.schema || observed.pid !== owned.pid
    || observed.nonce !== owned.nonce || observed.lockHash !== owned.lockHash) {
    fail("LOCK_OWNERSHIP_LOST");
  }
  unlinkSync(paths.lock);
  fsyncDirectory(paths.root);
}

function underLock(paths, operation) {
  const owned = acquireLock(paths);
  let result;
  let operationError = null;
  try { result = operation(); }
  catch (error) { operationError = error; }
  try { releaseLock(paths, owned); }
  catch { commitStatusUnknown("LOCK_RELEASE_STATUS_UNKNOWN_OPERATOR_REVIEW_REQUIRED"); }
  if (operationError !== null) throw operationError;
  return result;
}

function verifyV1Composition(composition, predecessor, expectedRevision) {
  if (composition === null || typeof composition !== "object" || isProxy(composition)) {
    fail("COMPOSITION_OBJECT_INVALID");
  }
  canonicalizeStrict(composition);
  const compositionHash = hash(composition.compositionHash, "COMPOSITION_HASH");
  const expectedPredecessorCompositionHash = predecessor?.compositionHash ?? null;
  const result = verifyEpisodeAttemptSetComposition(composition, {
    predecessor,
    expectedCompositionHash: compositionHash,
    expectedPredecessorCompositionHash,
  });
  if (result.ok !== true) fail("V1_COMPOSITION_REPLAY_FAILED", result.error ?? "UNKNOWN");
  if (composition.schema !== EPISODE_ATTEMPT_SET_SCHEMAS.composition
    || composition.appendOnlyLineage.revision !== expectedRevision) {
    fail("COMPOSITION_REVISION_INVALID");
  }
  return result;
}

function entryBody({ registry, sequence, composition, predecessor, previousEntryHash }) {
  const revision = sequence - 1;
  const verified = verifyV1Composition(composition, predecessor, revision);
  const predecessorCompositionHash = predecessor?.compositionHash ?? null;
  if (composition.appendOnlyLineage.predecessorCompositionHash
      !== predecessorCompositionHash
    || composition.appendOnlyLineage.supersedesCompositionHash
      !== predecessorCompositionHash) {
    fail("COMPOSITION_PREDECESSOR_LINK_INVALID");
  }
  return {
    schema: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_SCHEMAS.entry,
    registryId: registry,
    sequence,
    recordedAt: canonicalTimestamp(composition.recordedAt, "COMPOSITION_RECORDED_AT"),
    episodeHash: hash(composition.episodeBinding.episodeHash, "EPISODE_HASH"),
    compositionRevision: revision,
    compositionHash: composition.compositionHash,
    predecessorCompositionHash,
    previousEntryHash,
    attemptCount: verified.attemptCount,
    reportOccurrenceCount: verified.reportOccurrenceCount,
    composition,
    status: "HOLD",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_BOUNDARY,
  };
}

function makeEntry(input) {
  const body = entryBody(input);
  return deepFreeze({ ...body, entryHash: digest(
    EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_SCHEMAS.entry, body) });
}

function assertStoredEntry(value, context) {
  exactObject(value, ["schema", "registryId", "sequence", "recordedAt",
    "episodeHash", "compositionRevision", "compositionHash",
    "predecessorCompositionHash", "previousEntryHash", "attemptCount",
    "reportOccurrenceCount", "composition", "status", "decisionState",
    "authority", "actionReady", "executable", "boundary", "entryHash"],
  "ENTRY");
  const expected = makeEntry(context);
  if (!same(value, expected)) fail("ENTRY_DERIVATION_OR_HASH_INVALID");
  return expected;
}

function makeHead({ registry, entries, byteCommitments }) {
  const last = entries[entries.length - 1];
  const body = {
    schema: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_SCHEMAS.head,
    registryId: registry,
    episodeHash: last.episodeHash,
    entryCount: entries.length,
    headSequence: last.sequence,
    headCompositionRevision: last.compositionRevision,
    headCompositionHash: last.compositionHash,
    headEntryHash: last.entryHash,
    entrySetRoot: digest("outsider/episode-attempt-set-local-head-entry-set/v2", {
      schema: "outsider/episode-attempt-set-local-head-entry-set/v2",
      byteCommitments,
    }),
    attemptCount: last.attemptCount,
    reportOccurrenceCount: last.reportOccurrenceCount,
    fullAncestryReplayVerified: true,
    fullAncestryScope:
      "TWO_PASS_STABLE_EXACT_ENTRY_BYTES_IN_ONE_OBSERVED_LOCAL_REGISTRY",
    twoPassEntrySnapshotStabilityVerified: true,
    cooperativeLocalFilesystemObservationOnly: true,
    hostileConcurrentOwnerMutationExcluded: false,
    entryImmutabilityEstablished: false,
    localUniqueHeadStructuralHistoryEstablished: true,
    localHeadOnly: true,
    mutableHeadFileRead: false,
    externalHeadPinVerified: false,
    independentExternalProvenanceEstablished: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    durableAppendOnlyHistoryEstablished: false,
    status: "HOLD",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_BOUNDARY,
  };
  return deepFreeze({ ...body, headHash: digest(
    EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_SCHEMAS.head, body) });
}

function replay(directory, expectedRegistryId) {
  const paths = assertLayout(directory);
  const registry = registryId(expectedRegistryId);
  const before = readdirSync(paths.entries).sort();
  if (before.length < 1 || before.length > MAX_ENTRIES
    || before.some((name) => !RegExpTest(ENTRY_FILE, name))) {
    fail("ENTRY_FILE_SET_INVALID");
  }
  const entries = [];
  const byteCommitments = [];
  const firstPassReads = [];
  let predecessor = null;
  let previousEntryHash = EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_GENESIS_ENTRY_HASH;
  let episodeHash = null;
  let exactByteCount = 0;
  for (let index = 0; index < before.length; index += 1) {
    const sequence = index + 1;
    const expectedName = `${String(sequence).padStart(12, "0")}.json`;
    if (before[index] !== expectedName) fail("ENTRY_SEQUENCE_GAP_OR_REORDER");
    const file = path.join(paths.entries, before[index]);
    const { value, bytes, snapshot } = readCanonicalJson(file, "ENTRY_FILE");
    exactByteCount += bytes.length;
    if (!NumberIsSafeInteger(exactByteCount) || exactByteCount > MAX_TOTAL_BYTES) {
      fail("ENTRY_TOTAL_BYTES_EXCEEDED");
    }
    const expected = assertStoredEntry(value, {
      registry,
      sequence,
      composition: value.composition,
      predecessor,
      previousEntryHash,
    });
    if (episodeHash === null) episodeHash = expected.episodeHash;
    else if (expected.episodeHash !== episodeHash) fail("EPISODE_CHANGED_WITHIN_REGISTRY");
    entries.push(expected);
    byteCommitments.push({
      sequence,
      byteLength: bytes.length,
      byteHash: byteHash(bytes),
      entryHash: expected.entryHash,
      compositionHash: expected.compositionHash,
    });
    firstPassReads.push({ file, bytes, snapshot });
    predecessor = expected.composition;
    previousEntryHash = expected.entryHash;
  }
  const after = readdirSync(paths.entries).sort();
  if (!same(before, after)) fail("ENTRY_SET_CHANGED_DURING_REPLAY");
  for (let index = 0; index < firstPassReads.length; index += 1) {
    const first = firstPassReads[index];
    const second = readCanonicalJson(first.file, "ENTRY_FILE_SECOND_PASS");
    if (!sameFileSnapshot(first.snapshot, second.snapshot)
      || !BufferEquals(first.bytes, second.bytes)) {
      fail("ENTRY_SNAPSHOT_OR_BYTES_CHANGED_BETWEEN_REPLAY_PASSES");
    }
  }
  const finalNames = readdirSync(paths.entries).sort();
  if (!same(before, finalNames)) fail("ENTRY_SET_CHANGED_DURING_SECOND_REPLAY_PASS");
  return {
    paths,
    entries,
    byteCommitments,
    exactByteCount,
    head: makeHead({ registry, entries, byteCommitments }),
  };
}

function verificationFromReplay(replayed, expectedLocalHeadHash, {
  appendPredecessorExpectedLocalHeadHash = null,
  appendPredecessorCasMatched = false,
} = {}) {
  const expectedProvided = expectedLocalHeadHash !== null;
  if (expectedProvided) {
    hash(expectedLocalHeadHash, "EXPECTED_LOCAL_HEAD_HASH");
    if (replayed.head.headHash !== expectedLocalHeadHash) {
      fail("EXPECTED_LOCAL_HEAD_HASH_MISMATCH");
    }
  }
  const appendPredecessorExpectedProvided
    = appendPredecessorExpectedLocalHeadHash !== null;
  if (appendPredecessorExpectedProvided) {
    hash(appendPredecessorExpectedLocalHeadHash,
      "APPEND_PREDECESSOR_EXPECTED_LOCAL_HEAD_HASH");
  }
  if (appendPredecessorCasMatched !== appendPredecessorExpectedProvided) {
    fail("APPEND_PREDECESSOR_CAS_REPORT_INVALID");
  }
  const body = {
    schema: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_SCHEMAS.verification,
    ok: true,
    verificationScope: "ONE_OBSERVED_PRIVATE_LOCAL_REGISTRY_DIRECTORY",
    head: replayed.head,
    entryFileCount: replayed.entries.length,
    exactEntryByteCount: replayed.exactByteCount,
    entryByteCommitments: replayed.byteCommitments,
    fullAncestryReplayVerified: true,
    fullAncestryScope:
      "TWO_PASS_STABLE_EXACT_ENTRY_BYTES_IN_ONE_OBSERVED_LOCAL_REGISTRY",
    twoPassEntrySnapshotStabilityVerified: true,
    cooperativeLocalFilesystemObservationOnly: true,
    hostileConcurrentOwnerMutationExcluded: false,
    entryImmutabilityEstablished: false,
    everyStoredV1CompositionDerivationVerified: true,
    everyStoredV1ImmediatePrefixVerified: true,
    exactStoredEntrySetReplayed: true,
    localUniqueHeadStructuralHistoryEstablished: true,
    observedDirectoryParallelGenesisAccepted: false,
    observedDirectoryForkAccepted: false,
    sameRevisionResealAccepted: false,
    expectedLocalHeadHashProvided: expectedProvided,
    expectedLocalHeadHashMatched: expectedProvided,
    expectedLocalHeadHashIsConcurrencyTokenOnly: true,
    appendPredecessorExpectedLocalHeadHash,
    appendPredecessorCasMatched,
    appendPredecessorCasIsConcurrencyOnly: true,
    callerSelfPinAcceptedAsDurabilityProof: false,
    externalHeadPinVerified: false,
    independentExternalProvenanceEstablished: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    durableAppendOnlyHistoryEstablished: false,
    independentOutcomeEstablished: false,
    status: "HOLD",
    decisionState: "HOLD",
    authority: "NONE",
    authorityGrants: 0,
    actionReady: false,
    actionAuthorized: false,
    actionAdmissions: 0,
    executable: false,
    automaticTraining: false,
    productionTrainingAuthorized: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    pricingAuthorized: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    settlementAuthorized: false,
    permitsSettlement: false,
    boundary: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_BOUNDARY,
  };
  return deepFreeze({ ...body, verificationHash: digest(
    EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_SCHEMAS.verification, body) });
}

function verificationFailure(error) {
  return deepFreeze({
    schema: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_SCHEMAS.verification,
    ok: false,
    verificationScope: "ONE_OBSERVED_PRIVATE_LOCAL_REGISTRY_DIRECTORY",
    fullAncestryReplayVerified: false,
    fullAncestryScope:
      "TWO_PASS_STABLE_EXACT_ENTRY_BYTES_IN_ONE_OBSERVED_LOCAL_REGISTRY",
    twoPassEntrySnapshotStabilityVerified: false,
    cooperativeLocalFilesystemObservationOnly: true,
    hostileConcurrentOwnerMutationExcluded: false,
    entryImmutabilityEstablished: false,
    everyStoredV1CompositionDerivationVerified: false,
    everyStoredV1ImmediatePrefixVerified: false,
    exactStoredEntrySetReplayed: false,
    localUniqueHeadStructuralHistoryEstablished: false,
    expectedLocalHeadHashProvided: false,
    expectedLocalHeadHashMatched: false,
    appendPredecessorExpectedLocalHeadHash: null,
    appendPredecessorCasMatched: false,
    appendPredecessorCasIsConcurrencyOnly: true,
    callerSelfPinAcceptedAsDurabilityProof: false,
    externalHeadPinVerified: false,
    independentExternalProvenanceEstablished: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    durableAppendOnlyHistoryEstablished: false,
    independentOutcomeEstablished: false,
    status: "HOLD",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    pricingAuthorized: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    settlementAuthorized: false,
    permitsSettlement: false,
    error: error instanceof Error ? error.message : StringConstructor(error),
    boundary: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_BOUNDARY,
  });
}

export function initializeEpisodeAttemptSetLocalHeadV2(input = {}) {
  exactObject(input, ["directory", "registryId", "genesisComposition"],
    "INITIALIZE_INPUT");
  const registry = registryId(input.registryId);
  const entry = makeEntry({
    registry,
    sequence: 1,
    composition: input.genesisComposition,
    predecessor: null,
    previousEntryHash: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_GENESIS_ENTRY_HASH,
  });
  // Reject a malformed or non-genesis v1 composition before creating any
  // directory.  Once the private registry root exists, initialization is
  // intentionally never retried or overwritten in place.
  const paths = createLayout(input.directory);
  atomicCreateEntry(paths, 1, entry);
  try {
    return verificationFromReplay(replay(paths.root, registry), null);
  } catch {
    commitStatusUnknown("GENESIS_ENTRY_LINKED_POST_COMMIT_REPLAY_FAILED");
  }
}

export function appendEpisodeAttemptSetLocalHeadV2(input = {}) {
  exactObject(input, ["directory", "registryId", "composition",
    "expectedLocalHeadHash"], "APPEND_INPUT");
  const registry = registryId(input.registryId);
  const expectedLocalHeadHash = hash(input.expectedLocalHeadHash,
    "EXPECTED_LOCAL_HEAD_HASH");
  const paths = assertLayout(input.directory);
  return underLock(paths, () => {
    const current = replay(paths.root, registry);
    if (current.head.headHash !== expectedLocalHeadHash) {
      fail("COMPARE_AND_SWAP_LOCAL_HEAD_MISMATCH");
    }
    const sequence = current.entries.length + 1;
    const predecessor = current.entries[current.entries.length - 1].composition;
    const entry = makeEntry({
      registry,
      sequence,
      composition: input.composition,
      predecessor,
      previousEntryHash: current.head.headEntryHash,
    });
    atomicCreateEntry(paths, sequence, entry);
    try {
      const next = replay(paths.root, registry);
      if (next.entries.length !== sequence || next.head.headEntryHash !== entry.entryHash) {
        fail("POST_APPEND_REPLAY_MISMATCH");
      }
      return verificationFromReplay(next, null, {
        appendPredecessorExpectedLocalHeadHash: expectedLocalHeadHash,
        appendPredecessorCasMatched: true,
      });
    } catch {
      commitStatusUnknown("DESCENDANT_ENTRY_LINKED_POST_COMMIT_REPLAY_FAILED");
    }
  });
}

export function verifyEpisodeAttemptSetLocalHeadV2(input = {}) {
  try {
    exactObject(input, ["directory", "registryId", "expectedLocalHeadHash"],
      "VERIFY_INPUT");
    if (input.expectedLocalHeadHash !== null) {
      hash(input.expectedLocalHeadHash, "EXPECTED_LOCAL_HEAD_HASH");
    }
    return verificationFromReplay(replay(input.directory, input.registryId),
      input.expectedLocalHeadHash);
  } catch (error) {
    return verificationFailure(error);
  }
}
