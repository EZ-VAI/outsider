/*
 * Outsider durable one-use endpoint-effect ledger v1.
 *
 * This module is a local, fsync-backed, cooperating-writer ledger for the
 * evidence boundary around one endpoint submission.  It never contacts an
 * endpoint and never handles a URL, credential, provider registry, callback,
 * or human queue.  A durable SUBMIT_ATTEMPTED event forbids another attempt;
 * only an endpoint-receipt observation or an explicit ambiguous/no-retry
 * reconciliation may follow it.
 *
 * The filesystem owner can still copy, replace, or roll back the whole root.
 * Consequently this is not an external non-equivocation or authority proof.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
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
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferEquals = Function.prototype.call.bind(Buffer.prototype.equals);
const BufferToString = Function.prototype.call.bind(Buffer.prototype.toString);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const MapConstructor = Map;
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
const MapForEach = Function.prototype.call.bind(Map.prototype.forEach);
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ErrorPrototype = Error.prototype;
const TypeErrorPrototype = TypeError.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;

const PREFIX = "OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const ENTRY_FILE = /^[0-9]{12}\.json$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_ENTRIES = 100_000;
const MAX_ENTRY_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

export const OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS
  = ObjectFreeze({
    event: "outsider/durable-one-use-endpoint-effect-event/v1",
    entry: "outsider/durable-one-use-endpoint-effect-entry/v1",
    head: "outsider/durable-one-use-endpoint-effect-head/v1",
    verification:
      "outsider/durable-one-use-endpoint-effect-ledger-verification/v1",
  });

export const OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_EVENT_TYPES
  = ObjectFreeze([
    "INTENT_ADMITTED",
    "SUBMIT_RESERVED",
    "SUBMIT_ATTEMPTED",
    "ENDPOINT_RECEIPT_OBSERVED",
    "REVOKED_BEFORE_SUBMIT",
    "EXPIRED_BEFORE_SUBMIT",
    "AMBIGUOUS_NO_RETRY_HOLD",
  ]);

export const OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_TERMINAL_STATES
  = ObjectFreeze([
    "ENDPOINT_RECEIPT_OBSERVED",
    "REVOKED_BEFORE_SUBMIT",
    "EXPIRED_BEFORE_SUBMIT",
    "AMBIGUOUS_NO_RETRY_HOLD",
  ]);

export const OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_GENESIS
  = `sha256:${createHash("sha256")
    .update("outsider/durable-one-use-endpoint-effect-entry/genesis/v1", "utf8")
    .digest("hex")}`;

export const OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_COMMIT_UNKNOWN
  = `${PREFIX}COMMIT_STATUS_UNKNOWN_REPLAY_REQUIRED`;

export const OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_BOUNDARY
  = deepFreeze({
    position: "LOCAL_FSYNC_BACKED_ONE_USE_ENDPOINT_EFFECT_LEDGER_HOLD_ONLY",
    exactStateChain:
      "INTENT_ADMITTED_TO_SUBMIT_RESERVED_TO_SUBMIT_ATTEMPTED_TO_RECONCILIATION",
    submitAttemptedMayBeRetried: false,
    onlyReceiptOrAmbiguousReconciliationAfterAttempt: true,
    revokedOrExpiredBeforeSubmitAreTerminal: true,
    nonceUniqueAcrossLedgerEffects: true,
    idempotencyKeyBoundToExactlyOneBodyAndEffect: true,
    occurrenceCensusSeparatedFromObjectDedup: true,
    privateRootMode: "0700",
    privateEntryMode: "0600",
    noFollowRequired: true,
    noClobberEntryCreation: true,
    exclusiveCooperatingWriterLock: true,
    expectedLocalHeadCasRequired: true,
    twoPassExactEntryReplayRequired: true,
    fsyncFileAndDirectoryBeforeAcknowledgement: true,
    linkedEntriesDeletedByModule: false,
    automaticStaleLockRecovery: false,
    staleLockDisposition: "OPERATOR_REVIEW_HOLD_NOT_HUMAN_TASK_QUEUE",
    cooperatingLocalWriterCrashDurabilityMechanicsEstablished: true,
    filesystemOwnerRollbackOrReplacementExcluded: false,
    secondRootForSameLedgerExcluded: false,
    externalHeadAnchorEstablished: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    durableExternalHistoryEstablished: false,
    trustedClockEstablished: false,
    timestampsAreCallerAsserted: true,
    deadlineEnforcementAuthoritative: false,
    networkInterfacePresent: false,
    urlInterfacePresent: false,
    credentialInterfacePresent: false,
    callbackInterfacePresent: false,
    providerRegistryPresent: false,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    endpointContactPerformed: false,
    providerContactPerformed: false,
    liveActionPerformed: false,
    enabledCapabilityTypes: ObjectFreeze(["PRIVATE_LOCAL_LEDGER_APPEND"]),
    provenAuthorityCapabilityTypes:
      ObjectFreeze(["PRIVATE_LOCAL_LEDGER_APPEND"]),
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "ONE_CALLER_SELECTED_PRIVATE_LOCAL_LEDGER_ROOT_ONLY",
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
  });

const EVENT_INPUT_FIELDS = ObjectFreeze([
  "ledgerId", "eventType", "effectIdHash", "transactionBindingHash",
  "endpointBindingHash", "adapterInstanceRefHash", "permissionGrantHash",
  "oneUseNonceHash", "idempotencyKeyHash", "bodyHash", "effectDeadline",
  "recordedAt", "previousEffectEventHash", "occurrenceNonceHash",
  "endpointReceiptHash", "terminalEvidenceHash",
]);

const EVENT_RECORD_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", ...EVENT_INPUT_FIELDS,
  "endpointEffectPerformedByThisLedger", "networkIoPerformed",
  "retryAfterSubmitAttemptedPermitted", "decisionState", "authority",
  "actionReady", "executable", "eventHash",
]);

const ENTRY_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "ledgerId", "sequence", "previousEntryHash",
  "event", "eventHash", "recordedAt", "decisionState", "authority",
  "actionReady", "executable", "entryHash",
]);

const TRANSITIONS = ObjectFreeze({
  INTENT_ADMITTED: ObjectFreeze([
    "SUBMIT_RESERVED", "REVOKED_BEFORE_SUBMIT", "EXPIRED_BEFORE_SUBMIT",
  ]),
  SUBMIT_RESERVED: ObjectFreeze([
    "SUBMIT_ATTEMPTED", "REVOKED_BEFORE_SUBMIT", "EXPIRED_BEFORE_SUBMIT",
  ]),
  SUBMIT_ATTEMPTED: ObjectFreeze([
    "ENDPOINT_RECEIPT_OBSERVED", "AMBIGUOUS_NO_RETRY_HOLD",
  ]),
  ENDPOINT_RECEIPT_OBSERVED: ObjectFreeze([]),
  REVOKED_BEFORE_SUBMIT: ObjectFreeze([]),
  EXPIRED_BEFORE_SUBMIT: ObjectFreeze([]),
  AMBIGUOUS_NO_RETRY_HOLD: ObjectFreeze([]),
});

const BINDING_FIELDS = ObjectFreeze([
  "ledgerId", "effectIdHash", "transactionBindingHash", "endpointBindingHash",
  "adapterInstanceRefHash", "permissionGrantHash", "oneUseNonceHash",
  "idempotencyKeyHash", "bodyHash", "effectDeadline",
]);

function fail(code, detail = null) {
  throw new TypeErrorConstructor(detail === null
    ? `${PREFIX}${code}` : `${PREFIX}${code}:${detail}`);
}

function commitUnknown(phase) {
  throw new TypeErrorConstructor(
    `${OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_COMMIT_UNKNOWN}:${phase}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, enumerable: true, writable: true, configurable: true,
  });
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
  if (value === null || typeof value !== "object" || isProxy(value)
    || ArrayIsArray(value)) fail(`${code}_OBJECT_INVALID`);
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

function hash(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function ledgerId(value) {
  if (typeof value !== "string" || !RegExpTest(LEDGER_ID, value)) {
    fail("LEDGER_ID_INVALID");
  }
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)) {
    fail(`${code}_INVALID`);
  }
  const parsed = DateParse(value);
  if (!NumberIsSafeInteger(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function eventType(value) {
  for (let index = 0;
    index < OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_EVENT_TYPES.length;
    index += 1) {
    if (OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_EVENT_TYPES[index]
      === value) return value;
  }
  fail("EVENT_TYPE_INVALID");
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function eventInputFromRecord(record) {
  const result = {};
  for (let index = 0; index < EVENT_INPUT_FIELDS.length; index += 1) {
    const field = EVENT_INPUT_FIELDS[index];
    result[field] = record[field];
  }
  return result;
}

export function createDurableOneUseEndpointEffectEventV1(input = {}) {
  exactObject(input, EVENT_INPUT_FIELDS, "EVENT_INPUT");
  const type = eventType(input.eventType);
  const recordedAt = instant(input.recordedAt, "RECORDED_AT");
  const deadline = instant(input.effectDeadline, "EFFECT_DEADLINE");
  const previous = hash(input.previousEffectEventHash,
    "PREVIOUS_EFFECT_EVENT_HASH", true);
  const receipt = hash(input.endpointReceiptHash, "ENDPOINT_RECEIPT_HASH", true);
  const terminalEvidence = hash(input.terminalEvidenceHash,
    "TERMINAL_EVIDENCE_HASH", true);
  if ((type === "INTENT_ADMITTED") !== (previous === null)) {
    fail("EVENT_PREDECESSOR_CARDINALITY_INVALID");
  }
  const receiptRequired = type === "ENDPOINT_RECEIPT_OBSERVED";
  const terminalEvidenceRequired = type === "REVOKED_BEFORE_SUBMIT"
    || type === "EXPIRED_BEFORE_SUBMIT"
    || type === "AMBIGUOUS_NO_RETRY_HOLD";
  if ((receipt !== null) !== receiptRequired
    || (terminalEvidence !== null) !== terminalEvidenceRequired) {
    fail("EVENT_EVIDENCE_CARDINALITY_INVALID");
  }
  if ((type === "INTENT_ADMITTED" || type === "SUBMIT_RESERVED"
      || type === "SUBMIT_ATTEMPTED")
    && DateParse(recordedAt) >= DateParse(deadline)) {
    fail("PRE_SUBMIT_EVENT_AT_OR_AFTER_DEADLINE");
  }
  if (type === "EXPIRED_BEFORE_SUBMIT"
    && DateParse(recordedAt) < DateParse(deadline)) {
    fail("EXPIRY_EVENT_BEFORE_DEADLINE");
  }
  const body = {
    schema: OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.event,
    schemaVersion: "1.0.0",
    recordClass: "LOCAL_ONE_USE_ENDPOINT_EFFECT_OCCURRENCE",
    ledgerId: ledgerId(input.ledgerId),
    eventType: type,
    effectIdHash: hash(input.effectIdHash, "EFFECT_ID_HASH"),
    transactionBindingHash: hash(input.transactionBindingHash,
      "TRANSACTION_BINDING_HASH"),
    endpointBindingHash: hash(input.endpointBindingHash,
      "ENDPOINT_BINDING_HASH"),
    adapterInstanceRefHash: hash(input.adapterInstanceRefHash,
      "ADAPTER_INSTANCE_REF_HASH"),
    permissionGrantHash: hash(input.permissionGrantHash,
      "PERMISSION_GRANT_HASH"),
    oneUseNonceHash: hash(input.oneUseNonceHash, "ONE_USE_NONCE_HASH"),
    idempotencyKeyHash: hash(input.idempotencyKeyHash,
      "IDEMPOTENCY_KEY_HASH"),
    bodyHash: hash(input.bodyHash, "BODY_HASH"),
    effectDeadline: deadline,
    recordedAt,
    previousEffectEventHash: previous,
    occurrenceNonceHash: hash(input.occurrenceNonceHash,
      "OCCURRENCE_NONCE_HASH"),
    endpointReceiptHash: receipt,
    terminalEvidenceHash: terminalEvidence,
    endpointEffectPerformedByThisLedger: false,
    networkIoPerformed: false,
    retryAfterSubmitAttemptedPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, eventHash: digest(
    OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.event, body) });
}

function assertEventRecord(value) {
  exactObject(value, EVENT_RECORD_FIELDS, "EVENT_RECORD");
  const expected = createDurableOneUseEndpointEffectEventV1(
    eventInputFromRecord(value));
  if (!same(value, expected)) fail("EVENT_RECORD_DERIVATION_INVALID");
  return expected;
}

function initialState() {
  return {
    effects: new MapConstructor(),
    nonces: new MapConstructor(),
    idempotency: new MapConstructor(),
    idempotencyBodyPairs: new MapConstructor(),
    occurrenceNonces: new SetConstructor(),
    eventHashes: new MapConstructor(),
    transitionCounts: {
      INTENT_ADMITTED: 0,
      SUBMIT_RESERVED: 0,
      SUBMIT_ATTEMPTED: 0,
      ENDPOINT_RECEIPT_OBSERVED: 0,
      REVOKED_BEFORE_SUBMIT: 0,
      EXPIRED_BEFORE_SUBMIT: 0,
      AMBIGUOUS_NO_RETRY_HOLD: 0,
    },
  };
}

function allowedTransition(previous, next) {
  const allowed = TRANSITIONS[previous];
  for (let index = 0; index < allowed.length; index += 1) {
    if (allowed[index] === next) return true;
  }
  return false;
}

function exactBindingMatch(first, next) {
  for (let index = 0; index < BINDING_FIELDS.length; index += 1) {
    const field = BINDING_FIELDS[index];
    if (first[field] !== next[field]) return false;
  }
  return true;
}

function applyEvent(state, event) {
  if (SetHas(state.occurrenceNonces, event.occurrenceNonceHash)) {
    fail("OCCURRENCE_NONCE_REUSED");
  }
  if (MapHas(state.eventHashes, event.eventHash)) {
    fail("EVENT_OCCURRENCE_REPLAYED");
  }
  const current = MapGet(state.effects, event.effectIdHash) ?? null;
  if (event.eventType === "INTENT_ADMITTED") {
    if (current !== null) fail("EFFECT_INTENT_ALREADY_ADMITTED");
    if (MapHas(state.nonces, event.oneUseNonceHash)) {
      fail("ONE_USE_NONCE_ALREADY_BOUND");
    }
    if (MapHas(state.idempotency, event.idempotencyKeyHash)) {
      const prior = MapGet(state.idempotency, event.idempotencyKeyHash);
      fail(prior.bodyHash === event.bodyHash
        ? "IDEMPOTENCY_BODY_PAIR_ALREADY_BOUND"
        : "IDEMPOTENCY_KEY_BODY_SPLICE");
    }
    const pair = `${event.idempotencyKeyHash}:${event.bodyHash}`;
    if (MapHas(state.idempotencyBodyPairs, pair)) {
      fail("IDEMPOTENCY_BODY_PAIR_ALREADY_BOUND");
    }
    MapSet(state.nonces, event.oneUseNonceHash, event.effectIdHash);
    MapSet(state.idempotency, event.idempotencyKeyHash, {
      bodyHash: event.bodyHash, effectIdHash: event.effectIdHash,
    });
    MapSet(state.idempotencyBodyPairs, pair, event.effectIdHash);
  } else {
    if (current === null) fail("EFFECT_INTENT_MISSING");
    if (event.previousEffectEventHash !== current.event.eventHash) {
      fail("EFFECT_EVENT_PREDECESSOR_MISMATCH");
    }
    if (!exactBindingMatch(current.first, event)) {
      fail("EFFECT_BINDING_CHANGED");
    }
    if (!allowedTransition(current.event.eventType, event.eventType)) {
      fail(current.event.eventType === "SUBMIT_ATTEMPTED"
        ? "SUBMIT_ATTEMPT_RETRY_OR_INVALID_RECONCILIATION_FORBIDDEN"
        : "EFFECT_STATE_TRANSITION_INVALID");
    }
    if (DateParse(event.recordedAt) < DateParse(current.event.recordedAt)) {
      fail("EFFECT_EVENT_TIME_REGRESSION");
    }
  }
  SetAdd(state.occurrenceNonces, event.occurrenceNonceHash);
  MapSet(state.eventHashes, event.eventHash, event);
  MapSet(state.effects, event.effectIdHash, {
    first: current?.first ?? event,
    event,
  });
  state.transitionCounts[event.eventType] += 1;
}

function assertPrivateDirectory(directory, code, exactMode = false) {
  const absolute = path.resolve(directory);
  let before;
  try { before = lstatSync(absolute, { bigint: true }); }
  catch (error) { fail(`${code}_UNREADABLE`, error?.code ?? "UNKNOWN"); }
  if (before.isSymbolicLink() || !before.isDirectory()) {
    fail(`${code}_UNSAFE_TYPE`);
  }
  const mode = Number(before.mode & 0o777n);
  if (exactMode ? mode !== 0o700 : (mode & 0o077) !== 0) {
    fail(`${code}_PERMISSIONS_INVALID`);
  }
  if (typeof process.getuid === "function"
    && before.uid !== BigInt(process.getuid())) fail(`${code}_OWNER_INVALID`);
  if (realpathSync(absolute) !== absolute) fail(`${code}_REALPATH_INVALID`);
  if (!NumberIsSafeInteger(constants.O_NOFOLLOW)) fail("O_NOFOLLOW_UNAVAILABLE");
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isDirectory() || opened.dev !== before.dev
      || opened.ino !== before.ino) fail(`${code}_PATH_DESCRIPTOR_MISMATCH`);
    const after = lstatSync(absolute, { bigint: true });
    if (after.isSymbolicLink() || after.dev !== opened.dev
      || after.ino !== opened.ino) fail(`${code}_CHANGED_DURING_CHECK`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return absolute;
}

function fileSnapshot(stat) {
  return { device: stat.dev.toString(), inode: stat.ino.toString(),
    size: stat.size.toString(), mode: stat.mode.toString(),
    modifiedAtNanoseconds: stat.mtimeNs.toString(),
    changedAtNanoseconds: stat.ctimeNs.toString() };
}

function sameFileSnapshot(left, right) {
  return left.device === right.device && left.inode === right.inode
    && left.size === right.size && left.mode === right.mode
    && left.modifiedAtNanoseconds === right.modifiedAtNanoseconds
    && left.changedAtNanoseconds === right.changedAtNanoseconds;
}

function validatePrivateFile(stat, code, pathStat = false) {
  if ((pathStat && stat.isSymbolicLink()) || !stat.isFile()) {
    fail(`${code}_UNSAFE_TYPE`);
  }
  if (Number(stat.mode & 0o777n) !== 0o600) {
    fail(`${code}_PERMISSIONS_INVALID`);
  }
  if (typeof process.getuid === "function"
    && stat.uid !== BigInt(process.getuid())) fail(`${code}_OWNER_INVALID`);
  if (stat.size < 2n || stat.size > BigInt(MAX_ENTRY_BYTES)) {
    fail(`${code}_SIZE_INVALID`);
  }
}

function readStablePrivateFile(file, code) {
  const before = lstatSync(file, { bigint: true });
  validatePrivateFile(before, code, true);
  const beforeSnapshot = fileSnapshot(before);
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    validatePrivateFile(opened, code);
    if (!sameFileSnapshot(beforeSnapshot, fileSnapshot(opened))) {
      fail(`${code}_PATH_DESCRIPTOR_MISMATCH`);
    }
    const size = Number(opened.size);
    const storage = Buffer.allocUnsafe(size + 1);
    let offset = 0;
    while (offset < storage.length) {
      const count = readSync(descriptor, storage, offset,
        storage.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    if (offset !== size) fail(`${code}_SIZE_CHANGED_DURING_READ`);
    const afterDescriptor = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(file, { bigint: true });
    validatePrivateFile(afterDescriptor, code);
    validatePrivateFile(afterPath, code, true);
    const snapshot = fileSnapshot(afterDescriptor);
    if (!sameFileSnapshot(fileSnapshot(opened), snapshot)
      || !sameFileSnapshot(snapshot, fileSnapshot(afterPath))) {
      fail(`${code}_CHANGED_DURING_READ`);
    }
    return { bytes: storage.subarray(0, size), snapshot };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readCanonicalJson(file, code) {
  const read = readStablePrivateFile(file, code);
  if (read.bytes[read.bytes.length - 1] !== 0x0a) {
    fail(`${code}_CANONICAL_NEWLINE_MISSING`);
  }
  let value;
  try { value = JSON.parse(BufferToString(read.bytes, "utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (!BufferEquals(read.bytes, canonicalBytes(value))) {
    fail(`${code}_NON_CANONICAL_BYTES`);
  }
  return { ...read, value };
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory,
    constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function pathsFor(directory) {
  const root = path.resolve(directory);
  return { root, entries: path.join(root, "entries"),
    temporary: path.join(root, "tmp"), lock: path.join(root, "append.lock") };
}

function createLayout(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    fail("DIRECTORY_INVALID");
  }
  const paths = pathsFor(directory);
  if (existsSync(paths.root)) fail("DIRECTORY_ALREADY_EXISTS");
  assertPrivateDirectory(path.dirname(paths.root), "PARENT_DIRECTORY");
  mkdirSync(paths.root, { mode: 0o700 });
  mkdirSync(paths.entries, { mode: 0o700 });
  mkdirSync(paths.temporary, { mode: 0o700 });
  chmodSync(paths.root, 0o700);
  chmodSync(paths.entries, 0o700);
  chmodSync(paths.temporary, 0o700);
  fsyncDirectory(path.dirname(paths.root));
  fsyncDirectory(paths.root);
  assertPrivateDirectory(paths.root, "LEDGER_ROOT", true);
  assertPrivateDirectory(paths.entries, "ENTRY_DIRECTORY", true);
  assertPrivateDirectory(paths.temporary, "TEMP_DIRECTORY", true);
  return paths;
}

function assertLayout(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    fail("DIRECTORY_INVALID");
  }
  const paths = pathsFor(directory);
  assertPrivateDirectory(paths.root, "LEDGER_ROOT", true);
  assertPrivateDirectory(paths.entries, "ENTRY_DIRECTORY", true);
  assertPrivateDirectory(paths.temporary, "TEMP_DIRECTORY", true);
  const rootNames = readdirSync(paths.root).sort();
  const permitted = existsSync(paths.lock)
    ? ["append.lock", "entries", "tmp"] : ["entries", "tmp"];
  if (!same(rootNames, permitted)) fail("LEDGER_LAYOUT_INVALID");
  if (readdirSync(paths.temporary).length !== 0) {
    fail("TEMP_DIRECTORY_NOT_EMPTY_OPERATOR_REVIEW_REQUIRED");
  }
  return paths;
}

function entryPath(paths, sequence) {
  return path.join(paths.entries,
    `${StringConstructor(sequence).padStart(12, "0")}.json`);
}

function atomicCreateEntry(paths, entry) {
  const target = entryPath(paths, entry.sequence);
  if (existsSync(target)) fail("ENTRY_TARGET_ALREADY_EXISTS");
  const temporary = path.join(paths.temporary,
    `.entry-${StringConstructor(entry.sequence).padStart(12, "0")}`
      + `-${process.pid}-${BufferToString(randomBytes(12), "hex")}.tmp`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | constants.O_NOFOLLOW;
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
    if (linked) commitUnknown("ENTRY_LINKED_POST_LINK_DURABILITY_FAILED");
    if (error?.code === "EEXIST") fail("ENTRY_TARGET_ALREADY_EXISTS");
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* unlinked temporary only */ }
  }
  try {
    const stored = readCanonicalJson(target, "ENTRY_POST_CREATE");
    if (!same(stored.value, entry)) fail("ENTRY_POST_CREATE_MISMATCH");
  } catch { commitUnknown("ENTRY_LINKED_POST_CREATE_REPLAY_FAILED"); }
}

function lockBody() {
  const body = { schema: "outsider/durable-one-use-endpoint-effect-lock/v1",
    pid: process.pid, nonce: BufferToString(randomBytes(16), "hex") };
  return { ...body, lockHash: digest(
    "outsider/durable-one-use-endpoint-effect-lock/v1", body) };
}

function acquireLock(paths) {
  const lock = lockBody();
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | constants.O_NOFOLLOW;
  let descriptor;
  let created = false;
  try {
    descriptor = openSync(paths.lock, flags, 0o600);
    created = true;
    writeFileSync(descriptor, canonicalBytes(lock));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    fsyncDirectory(paths.root);
    return lock;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!created && error?.code === "EEXIST") fail("WRITER_LOCK_PRESENT");
    if (created) commitUnknown("LOCK_ACQUIRE_DURABILITY_UNKNOWN");
    throw error;
  }
}

function releaseLock(paths, owned) {
  const observed = readCanonicalJson(paths.lock, "LOCK_FILE").value;
  exactObject(observed, ["schema", "pid", "nonce", "lockHash"], "LOCK");
  if (!same(observed, owned)) fail("LOCK_OWNERSHIP_LOST");
  unlinkSync(paths.lock);
  fsyncDirectory(paths.root);
}

function underLock(paths, operation) {
  const lock = acquireLock(paths);
  let result;
  let operationError = null;
  try { result = operation(); } catch (error) { operationError = error; }
  try { releaseLock(paths, lock); }
  catch { commitUnknown("LOCK_RELEASE_STATUS_UNKNOWN_OPERATOR_REVIEW_REQUIRED"); }
  if (operationError !== null) throw operationError;
  return result;
}

function makeEntry({ ledger, sequence, previousEntryHash, event, state }) {
  const checkedEvent = assertEventRecord(event);
  if (checkedEvent.ledgerId !== ledger) fail("EVENT_LEDGER_ID_MISMATCH");
  applyEvent(state, checkedEvent);
  const body = {
    schema: OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.entry,
    schemaVersion: "1.0.0",
    ledgerId: ledger,
    sequence,
    previousEntryHash,
    event: checkedEvent,
    eventHash: checkedEvent.eventHash,
    recordedAt: checkedEvent.recordedAt,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, entryHash: digest(
    OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.entry, body) });
}

function assertStoredEntry(value, context) {
  exactObject(value, ENTRY_FIELDS, "ENTRY");
  const expected = makeEntry({ ...context, event: value.event });
  if (!same(value, expected)) fail("ENTRY_DERIVATION_OR_HASH_INVALID");
  return expected;
}

function makeHead(ledger, entries, byteCommitments, state) {
  const last = entries[entries.length - 1];
  let terminalEffectCount = 0;
  let submitAttemptedOrReconciledEffectCount = 0;
  MapForEach(state.effects, (current) => {
    if (TRANSITIONS[current.event.eventType].length === 0) {
      terminalEffectCount += 1;
    }
    if (current.event.eventType === "SUBMIT_ATTEMPTED"
      || current.event.eventType === "ENDPOINT_RECEIPT_OBSERVED"
      || current.event.eventType === "AMBIGUOUS_NO_RETRY_HOLD") {
      submitAttemptedOrReconciledEffectCount += 1;
    }
  });
  const body = {
    schema: OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.head,
    schemaVersion: "1.0.0",
    ledgerId: ledger,
    entryCount: entries.length,
    headSequence: last.sequence,
    headEntryHash: last.entryHash,
    entrySetRoot: digest(
      "outsider/durable-one-use-endpoint-effect-entry-set/v1",
      { byteCommitments }),
    effectCount: state.effects.size,
    terminalEffectCount,
    submitAttemptedOrReconciledEffectCount,
    nonceIndexCount: state.nonces.size,
    idempotencyIndexCount: state.idempotency.size,
    idempotencyBodyPairIndexCount: state.idempotencyBodyPairs.size,
    transitionCounts: {
      INTENT_ADMITTED: state.transitionCounts.INTENT_ADMITTED,
      SUBMIT_RESERVED: state.transitionCounts.SUBMIT_RESERVED,
      SUBMIT_ATTEMPTED: state.transitionCounts.SUBMIT_ATTEMPTED,
      ENDPOINT_RECEIPT_OBSERVED:
        state.transitionCounts.ENDPOINT_RECEIPT_OBSERVED,
      REVOKED_BEFORE_SUBMIT: state.transitionCounts.REVOKED_BEFORE_SUBMIT,
      EXPIRED_BEFORE_SUBMIT: state.transitionCounts.EXPIRED_BEFORE_SUBMIT,
      AMBIGUOUS_NO_RETRY_HOLD:
        state.transitionCounts.AMBIGUOUS_NO_RETRY_HOLD,
    },
    exactOccurrenceCount: entries.length,
    occurrenceCensusSeparatedFromObjectDedup: true,
    fullAncestryScope:
      "TWO_PASS_STABLE_EXACT_ENTRY_BYTES_IN_ONE_PRIVATE_LOCAL_ROOT",
    localFsyncBackedHistoryObserved: true,
    durableExternalHistoryEstablished: false,
    trustedClockEstablished: false,
    timestampsAreCallerAsserted: true,
    deadlineEnforcementAuthoritative: false,
    automaticRetryAfterSubmitAttemptedPermitted: false,
    endpointContactPerformed: false,
    humanQueueCreated: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, headHash: digest(
    OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.head, body) });
}

function replay(directory, expectedLedgerId) {
  const paths = assertLayout(directory);
  const ledger = ledgerId(expectedLedgerId);
  const before = readdirSync(paths.entries).sort();
  if (before.length < 1 || before.length > MAX_ENTRIES) {
    fail("ENTRY_FILE_COUNT_INVALID");
  }
  const entries = [];
  const byteCommitments = [];
  const reads = [];
  const state = initialState();
  let previousEntryHash
    = OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_GENESIS;
  let totalBytes = 0;
  for (let index = 0; index < before.length; index += 1) {
    const sequence = index + 1;
    const expectedName = `${StringConstructor(sequence).padStart(12, "0")}.json`;
    if (before[index] !== expectedName || !RegExpTest(ENTRY_FILE, before[index])) {
      fail("ENTRY_SEQUENCE_GAP_OR_REORDER");
    }
    const file = path.join(paths.entries, before[index]);
    const read = readCanonicalJson(file, "ENTRY_FILE");
    totalBytes += read.bytes.length;
    if (!NumberIsSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) {
      fail("ENTRY_TOTAL_BYTES_EXCEEDED");
    }
    const entry = assertStoredEntry(read.value, { ledger, sequence,
      previousEntryHash, state });
    append(entries, entry);
    append(byteCommitments, { sequence, byteLength: read.bytes.length,
      byteHash: byteHash(read.bytes), entryHash: entry.entryHash,
      eventHash: entry.eventHash });
    append(reads, { file, bytes: read.bytes, snapshot: read.snapshot });
    previousEntryHash = entry.entryHash;
  }
  const after = readdirSync(paths.entries).sort();
  if (!same(before, after)) fail("ENTRY_SET_CHANGED_DURING_REPLAY");
  for (let index = 0; index < reads.length; index += 1) {
    const second = readCanonicalJson(reads[index].file, "ENTRY_SECOND_PASS");
    if (!sameFileSnapshot(reads[index].snapshot, second.snapshot)
      || !BufferEquals(reads[index].bytes, second.bytes)) {
      fail("ENTRY_CHANGED_BETWEEN_REPLAY_PASSES");
    }
  }
  if (!same(before, readdirSync(paths.entries).sort())) {
    fail("ENTRY_SET_CHANGED_DURING_SECOND_PASS");
  }
  return { paths, entries, byteCommitments, state, totalBytes,
    head: makeHead(ledger, entries, byteCommitments, state) };
}

function verificationFromReplay(replayed, expectedHeadHash, options = {}) {
  const expectedProvided = expectedHeadHash !== null;
  if (expectedProvided) {
    hash(expectedHeadHash, "EXPECTED_LOCAL_HEAD_HASH");
    if (replayed.head.headHash !== expectedHeadHash) {
      fail("EXPECTED_LOCAL_HEAD_HASH_MISMATCH");
    }
  }
  const body = {
    schema:
      OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.verification,
    schemaVersion: "1.0.0",
    ok: true,
    verificationScope: "ONE_CALLER_SELECTED_PRIVATE_LOCAL_LEDGER_ROOT",
    head: replayed.head,
    entryFileCount: replayed.entries.length,
    exactEntryByteCount: replayed.totalBytes,
    entryByteCommitments: replayed.byteCommitments,
    fullAncestryReplayVerified: true,
    twoPassEntrySnapshotStabilityVerified: true,
    durableNonceIndexReplayed: true,
    durableIdempotencyBodyIndexReplayed: true,
    expectedLocalHeadHashProvided: expectedProvided,
    expectedLocalHeadHashMatched: expectedProvided,
    appendPredecessorCasMatched: options.appendPredecessorCasMatched === true,
    appendPredecessorExpectedLocalHeadHash:
      options.appendPredecessorExpectedLocalHeadHash ?? null,
    appended: options.appended === true,
    idempotentReplay: options.idempotentReplay === true,
    appendedEventType: options.appendedEventType ?? null,
    filesystemReadPerformed: true,
    filesystemAppendPerformed: options.appended === true,
    fsyncBeforeAppendAcknowledgementCompleted: options.appended === true,
    localCooperatingWriterDurabilityMechanicsEstablished: true,
    durableExternalHistoryEstablished: false,
    trustedClockEstablished: false,
    timestampsAreCallerAsserted: true,
    deadlineEnforcementAuthoritative: false,
    filesystemOwnerRollbackOrReplacementExcluded: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    networkIoPerformed: false,
    endpointContactPerformed: false,
    providerContactPerformed: false,
    providerRegistryPresent: false,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    enabledCapabilityTypes: ObjectFreeze(["PRIVATE_LOCAL_LEDGER_APPEND"]),
    provenAuthorityCapabilityTypes:
      ObjectFreeze(["PRIVATE_LOCAL_LEDGER_APPEND"]),
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "ONE_CALLER_SELECTED_PRIVATE_LOCAL_LEDGER_ROOT_ONLY",
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, verificationHash: digest(
    OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.verification,
    body) });
}

function safeError(error) {
  try {
    if (error === null || typeof error !== "object") {
      return `${PREFIX}UNTRUSTED_FAILURE`;
    }
    const prototype = ObjectGetPrototypeOf(error);
    if (prototype !== ErrorPrototype && prototype !== TypeErrorPrototype) {
      return `${PREFIX}UNTRUSTED_FAILURE`;
    }
    const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || typeof descriptor.value !== "string") {
      return `${PREFIX}UNTRUSTED_FAILURE`;
    }
    const message = descriptor.value;
    if (message.length < PREFIX.length || message.length > 512) {
      return `${PREFIX}UNTRUSTED_FAILURE`;
    }
    for (let index = 0; index < PREFIX.length; index += 1) {
      if (message[index] !== PREFIX[index]) {
        return `${PREFIX}UNTRUSTED_FAILURE`;
      }
    }
    for (let index = 0; index < message.length; index += 1) {
      const code = message.charCodeAt(index);
      if (code < 0x20 || code > 0x7e) {
        return `${PREFIX}UNTRUSTED_FAILURE`;
      }
    }
    return message;
  } catch { /* fixed fallback */ }
  return `${PREFIX}UNTRUSTED_FAILURE`;
}

function verificationFailure(error) {
  return deepFreeze({
    schema:
      OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_SCHEMAS.verification,
    schemaVersion: "1.0.0",
    ok: false,
    fullAncestryReplayVerified: false,
    twoPassEntrySnapshotStabilityVerified: false,
    durableNonceIndexReplayed: false,
    durableIdempotencyBodyIndexReplayed: false,
    filesystemReadMayHaveBeenAttempted: true,
    filesystemAppendPerformed: false,
    networkIoPerformed: false,
    endpointContactPerformed: false,
    providerRegistryPresent: false,
    humanQueueCreated: false,
    durableExternalHistoryEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: safeError(error),
    boundary: OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_BOUNDARY,
  });
}

export function initializeDurableOneUseEndpointEffectLedgerV1(input = {}) {
  exactObject(input, ["directory", "ledgerId", "genesisEvent"],
    "INITIALIZE_INPUT");
  const ledger = ledgerId(input.ledgerId);
  const event = assertEventRecord(input.genesisEvent);
  if (event.eventType !== "INTENT_ADMITTED" || event.ledgerId !== ledger) {
    fail("GENESIS_INTENT_REQUIRED");
  }
  const state = initialState();
  const entry = makeEntry({ ledger, sequence: 1,
    previousEntryHash:
      OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_GENESIS,
    event, state });
  const paths = createLayout(input.directory);
  atomicCreateEntry(paths, entry);
  try {
    return verificationFromReplay(replay(paths.root, ledger), null, {
      appendPredecessorCasMatched: false,
      appended: true,
      appendedEventType: event.eventType,
    });
  } catch { commitUnknown("GENESIS_LINKED_POST_COMMIT_REPLAY_FAILED"); }
}

export function appendDurableOneUseEndpointEffectLedgerV1(input = {}) {
  exactObject(input, ["directory", "ledgerId", "event",
    "expectedLocalHeadHash"], "APPEND_INPUT");
  const ledger = ledgerId(input.ledgerId);
  const event = assertEventRecord(input.event);
  const expectedHeadHash = hash(input.expectedLocalHeadHash,
    "EXPECTED_LOCAL_HEAD_HASH");
  if (event.ledgerId !== ledger) fail("EVENT_LEDGER_ID_MISMATCH");
  const paths = assertLayout(input.directory);
  return underLock(paths, () => {
    const current = replay(paths.root, ledger);
    if (current.head.headHash !== expectedHeadHash) {
      fail("COMPARE_AND_SWAP_LOCAL_HEAD_MISMATCH");
    }
    if (MapHas(current.state.eventHashes, event.eventHash)) {
      return verificationFromReplay(current, expectedHeadHash, {
        appendPredecessorCasMatched: true,
        appendPredecessorExpectedLocalHeadHash: expectedHeadHash,
        appended: false,
        idempotentReplay: true,
        appendedEventType: event.eventType,
      });
    }
    const entry = makeEntry({ ledger,
      sequence: current.entries.length + 1,
      previousEntryHash: current.head.headEntryHash,
      event, state: current.state });
    atomicCreateEntry(paths, entry);
    try {
      const next = replay(paths.root, ledger);
      if (next.head.headEntryHash !== entry.entryHash
        || next.entries.length !== entry.sequence) {
        fail("POST_APPEND_REPLAY_MISMATCH");
      }
      return verificationFromReplay(next, null, {
        appendPredecessorCasMatched: true,
        appendPredecessorExpectedLocalHeadHash: expectedHeadHash,
        appended: true,
        appendedEventType: event.eventType,
      });
    } catch { commitUnknown("ENTRY_LINKED_POST_COMMIT_REPLAY_FAILED"); }
  });
}

export function verifyDurableOneUseEndpointEffectLedgerV1(input = {}) {
  try {
    exactObject(input, ["directory", "ledgerId", "expectedLocalHeadHash"],
      "VERIFY_INPUT");
    if (input.expectedLocalHeadHash !== null) {
      hash(input.expectedLocalHeadHash, "EXPECTED_LOCAL_HEAD_HASH");
    }
    return verificationFromReplay(replay(input.directory, input.ledgerId),
      input.expectedLocalHeadHash);
  } catch (error) { return verificationFailure(error); }
}

function historicalHeadRelation(replayed, expectedHeadHash) {
  if (replayed.head.headHash === expectedHeadHash) return "CURRENT";
  const state = initialState();
  const entries = [];
  const byteCommitments = [];
  for (let index = 0; index < replayed.entries.length - 1; index += 1) {
    const entry = replayed.entries[index];
    applyEvent(state, entry.event);
    append(entries, entry);
    append(byteCommitments, replayed.byteCommitments[index]);
    const prefix = makeHead(replayed.head.ledgerId, entries,
      byteCommitments, state);
    if (prefix.headHash === expectedHeadHash) return "ANCESTOR";
  }
  return null;
}

/**
 * Replay selected effect states only after proving that a caller-persisted
 * head is either the current head or an exact prefix head of this append-only
 * ledger. This is the restart seam for a parent that may crash after a child
 * effect append but before persisting the child's newer public handle.
 */
export function replayDurableOneUseEndpointEffectStatesSinceV1(input = {}) {
  exactObject(input, ["directory", "ledgerId", "expectedAncestorHeadHash",
    "effectIdHashes"], "STATE_REPLAY_INPUT");
  const expected = hash(input.expectedAncestorHeadHash,
    "EXPECTED_ANCESTOR_HEAD_HASH");
  if (!ArrayIsArray(input.effectIdHashes)
    || input.effectIdHashes.length < 1 || input.effectIdHashes.length > 64) {
    fail("STATE_REPLAY_EFFECT_IDS_INVALID");
  }
  const ids = new SetConstructor();
  for (let index = 0; index < input.effectIdHashes.length; index += 1) {
    const effectIdHash = hash(input.effectIdHashes[index],
      "STATE_REPLAY_EFFECT_ID");
    if (SetHas(ids, effectIdHash)) fail("STATE_REPLAY_EFFECT_IDS_INVALID");
    SetAdd(ids, effectIdHash);
  }
  const replayed = replay(input.directory, input.ledgerId);
  const headRelation = historicalHeadRelation(replayed, expected);
  if (headRelation === null) fail("EXPECTED_ANCESTOR_HEAD_HASH_NOT_FOUND");
  const effects = input.effectIdHashes.map((effectIdHash) => {
    const current = MapGet(replayed.state.effects, effectIdHash) ?? null;
    return current === null ? null : ObjectFreeze({
      effectIdHash,
      firstEvent: current.first,
      currentEvent: current.event,
    });
  });
  return deepFreeze({
    headRelation,
    verification: verificationFromReplay(replayed, null),
    effects,
  });
}
