import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const GENESIS_SCHEMA = "outsider/reality-obligation-genesis/v1";
const EVENT_SCHEMA = "outsider/reality-obligation-event/v1";
const STATE_SCHEMA = "outsider/reality-obligation-state/v1";
const HEAD_SCHEMA = "outsider/reality-obligation-head/v1";
const LOCK_SCHEMA = "outsider/reality-obligation-lock/v1";
const RECEIPT_SCHEMA =
  "outsider/reality-external-closure-receipt-slot/test-fixture/v1";
const FIXTURE_PROVIDER_PROFILE =
  "TEST_FIXTURE_PROVIDER_ALPHA_EXTERNAL_CLOSURE_V1";
const PRODUCTION_CAPABILITY =
  "PRODUCTION_EXTERNAL_CLOSURE_UNREACHABLE_NO_PROVIDER_REGISTRY";
const FIXTURE_CAPABILITY =
  "TEST_FIXTURE_ONLY_PROVIDER_SPECIFIC_RECEIPT_SLOT";
const HASH = /^sha256:[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EVENT_FILE = /^[0-9]{12}\.json$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_HORIZON_MS = 100 * 365 * 24 * 60 * 60 * 1_000;
const CONSTRUCT = Symbol("RealityObligationStore.construct");
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

export const REALITY_OBLIGATION_STATUSES = Object.freeze({
  PRECOMMITTED: "PRECOMMITTED",
  OPEN: "OPEN",
  HORIZON_PENDING: "HORIZON_PENDING",
  RECOVERY_DUE: "RECOVERY_DUE",
  CHALLENGED: "CHALLENGED",
  CLOSURE_CANDIDATE: "CLOSURE_CANDIDATE",
  EXTERNALLY_CLOSED: "EXTERNALLY_CLOSED",
  REOPENED: "REOPENED",
});

export const REALITY_NON_CLOSING_FACT_KINDS = Object.freeze([
  "SUCCESS_REPORTED",
  "ROLLBACK_REPORTED",
  "PAYMENT_REPORTED",
  "COVERAGE_VOID_REPORTED",
  "PROVIDER_REPLACED",
  "GRANT_EXPIRED",
]);

const NON_CLOSING_FACTS = new Set(REALITY_NON_CLOSING_FACT_KINDS);
const EVENT_KINDS = new Set([
  "ACTIVATE",
  "EVALUATE_HORIZONS",
  "RECORD_HORIZON_REPORT",
  "MARK_RECOVERY_DUE",
  "RECORD_RECOVERY_EVIDENCE",
  "OPEN_CHALLENGE",
  "RESOLVE_CHALLENGE",
  "RECORD_NON_CLOSING_FACT",
  "NOMINATE_CLOSURE_CANDIDATE",
  "REOPEN",
  "RECORD_TEST_FIXTURE_EXTERNAL_CLOSURE",
]);

const AUTHORITY = Object.freeze({
  authorityMode: "NONE_LOCAL_OBLIGATION_INTEGRITY_ONLY",
  actionReady: false,
  executionAuthorityEstablished: false,
  obligationClosureAuthorityEstablished: false,
  externalProviderAuthorityEstablished: false,
  institutionalAuthorityEstablished: false,
  callerAssertionsAcceptedAsAuthority: false,
  callbackVerificationAccepted: false,
});

function fail(code, detail = "") {
  throw new Error(`REALITY_OBLIGATION_${code}${detail ? `:${detail}` : ""}`);
}

function digest(domain, value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value)
    ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256")
    .update(`${domain}\0`).update(bytes).digest("hex")}`;
}

function assertExactObject(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(`${label}_OBJECT_REQUIRED`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    fail(`${label}_EXACT_FIELDS_REQUIRED`, actual.join(","));
  }
  canonicalizeStrict(value);
  return value;
}

function assertHash(value, label) {
  if (!HASH.test(value)) fail(`${label}_HASH_REQUIRED`);
  return value;
}

function normalizeHashSet(values, label) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 128) {
    fail(`${label}_ONE_TO_ONE_HUNDRED_TWENTY_EIGHT_REQUIRED`);
  }
  const normalized = values.map((value) => assertHash(value, label)).sort();
  if (new Set(normalized).size !== normalized.length) fail(`${label}_DUPLICATE`);
  return normalized;
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail(`${label}_IDENTIFIER_REQUIRED`);
  }
  return value;
}

function assertTimestamp(value, label) {
  if (typeof value !== "string") fail(`${label}_TIMESTAMP_REQUIRED`);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    fail(`${label}_CANONICAL_TIMESTAMP_REQUIRED`);
  }
  return value;
}

function assertAtOrAfter(value, lower, label) {
  assertTimestamp(value, label);
  if (Date.parse(value) < Date.parse(lower)) fail(`${label}_BEFORE_PRIOR_EVENT`);
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function authority() {
  return { ...AUTHORITY };
}

function assertAuthority(value) {
  assertExactObject(value, Object.keys(AUTHORITY), "AUTHORITY");
  for (const [key, expected] of Object.entries(AUTHORITY)) {
    if (value[key] !== expected) fail("AUTHORITY_ESCALATION", key);
  }
}

function assertPrivateDirectory(directory, label) {
  let stat;
  try { stat = lstatSync(directory); } catch (error) {
    fail(`${label}_UNREADABLE`, error?.code ?? error?.message);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label}_UNSAFE_TYPE`);
  if ((stat.mode & 0o077) !== 0) fail(`${label}_PERMISSIONS_TOO_BROAD`);
}

function assertPrivateFile(file, label) {
  let stat;
  try { stat = lstatSync(file); } catch (error) {
    fail(`${label}_UNREADABLE`, error?.code ?? error?.message);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label}_UNSAFE_TYPE`);
  if ((stat.mode & 0o077) !== 0) fail(`${label}_PERMISSIONS_TOO_BROAD`);
  if (stat.size > MAX_FILE_BYTES) fail(`${label}_TOO_LARGE`);
}

function fsyncDirectory(directory) {
  const fd = openSync(directory, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function ensureNewDirectory(directory) {
  const resolved = path.resolve(directory);
  if (existsSync(resolved)) fail("DIRECTORY_ALREADY_EXISTS");
  const parent = path.dirname(resolved);
  assertPrivateDirectory(parent, "PARENT_DIRECTORY");
  mkdirSync(resolved, { mode: 0o700 });
  mkdirSync(path.join(resolved, "events"), { mode: 0o700 });
  mkdirSync(path.join(resolved, "tmp"), { mode: 0o700 });
  fsyncDirectory(parent);
  fsyncDirectory(resolved);
  return pathsFor(resolved);
}

function pathsFor(directory) {
  const root = path.resolve(directory);
  return {
    root,
    events: path.join(root, "events"),
    temporary: path.join(root, "tmp"),
    genesis: path.join(root, "genesis.json"),
    head: path.join(root, "head.json"),
    lock: path.join(root, "append.lock"),
  };
}

function assertExistingLayout(directory) {
  const paths = pathsFor(directory);
  assertPrivateDirectory(paths.root, "STORE_DIRECTORY");
  assertPrivateDirectory(paths.events, "EVENT_DIRECTORY");
  assertPrivateDirectory(paths.temporary, "TEMP_DIRECTORY");
  return paths;
}

function writeFdFully(fd, value) {
  writeFileSync(fd, value, { encoding: "utf8" });
  fsyncSync(fd);
}

function atomicCreate(file, value, paths, label) {
  if (existsSync(file)) fail(`${label}_IMMUTABLE_TARGET_EXISTS`);
  const temporary = path.join(paths.temporary,
    `${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(temporary, flags, 0o600);
  try { writeFdFully(fd, value); } finally { closeSync(fd); }
  try {
    linkSync(temporary, file);
    fsyncDirectory(path.dirname(file));
  } finally {
    try { unlinkSync(temporary); } catch { /* non-ledger temporary residue */ }
  }
  assertPrivateFile(file, label);
}

function atomicReplace(file, value, paths, label) {
  const temporary = path.join(paths.temporary,
    `${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(temporary, flags, 0o600);
  try { writeFdFully(fd, value); } finally { closeSync(fd); }
  renameSync(temporary, file);
  chmodSync(file, 0o600);
  fsyncDirectory(path.dirname(file));
  assertPrivateFile(file, label);
}

function readJson(file, label) {
  assertPrivateFile(file, label);
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (error) {
    fail(`${label}_INVALID_JSON`, error?.message ?? String(error));
  }
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) {
    return error?.code === "EPERM";
  }
}

function lockBody() {
  const body = {
    schema: LOCK_SCHEMA,
    pid: process.pid,
    nonce: randomUUID(),
    acquiredAt: new Date().toISOString(),
  };
  return { ...body, lockHash: digest("outsider/reality-obligation-lock/v1", body) };
}

function validateLock(lock) {
  assertExactObject(lock,
    ["schema", "pid", "nonce", "acquiredAt", "lockHash"], "LOCK");
  if (lock.schema !== LOCK_SCHEMA || !Number.isInteger(lock.pid) || lock.pid <= 0
    || typeof lock.nonce !== "string" || !lock.nonce) fail("LOCK_INVALID");
  assertTimestamp(lock.acquiredAt, "LOCK_ACQUIRED_AT");
  const { lockHash, ...body } = lock;
  if (lockHash !== digest("outsider/reality-obligation-lock/v1", body)) {
    fail("LOCK_HASH_MISMATCH");
  }
}

function acquireLock(paths, timeoutMs = 5_000) {
  const own = lockBody();
  const deadline = Date.now() + timeoutMs;
  const candidate = path.join(paths.temporary,
    `lock.${process.pid}.${own.nonce}.tmp`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(candidate, flags, 0o600);
  try { writeFdFully(fd, JSON.stringify(own)); } finally { closeSync(fd); }
  try {
    while (true) {
      try {
        linkSync(candidate, paths.lock);
        unlinkSync(candidate);
        fsyncDirectory(paths.root);
        return own;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        let holder;
        try { holder = readJson(paths.lock, "LOCK_FILE"); } catch (readError) {
          if (String(readError?.message).includes("ENOENT")) continue;
          throw readError;
        }
        validateLock(holder);
        /* PID/mtime based lock stealing is not an atomic ownership test. A
           contender could otherwise rename a freshly acquired live lock after
           first observing an older dead holder. Crash recovery is therefore an
           explicit operator workflow; ordinary writers always fail closed. */
        if (!processExists(holder.pid)) fail("STALE_LOCK_REQUIRES_EXPLICIT_RECOVERY");
        if (Date.now() >= deadline) fail("LOCK_BUSY");
        Atomics.wait(sleepCell, 0, 0, 20);
      }
    }
  } finally {
    try { unlinkSync(candidate); } catch { /* linked or already absent */ }
  }
}

function releaseLock(paths, own) {
  const current = readJson(paths.lock, "LOCK_FILE");
  validateLock(current);
  if (current.lockHash !== own.lockHash || current.nonce !== own.nonce) {
    fail("LOCK_OWNERSHIP_LOST");
  }
  unlinkSync(paths.lock);
  fsyncDirectory(paths.root);
}

function underLock(paths, operation) {
  const own = acquireLock(paths);
  try { return operation(); } finally { releaseLock(paths, own); }
}

function normalizeBindings(bindings) {
  const keys = [
    "claimHash",
    "wayHash",
    "worldHash",
    "episodeHash",
    "attemptHash",
    "censusRegistrationHash",
    "responsibilityGraphHash",
    "affectedPartyRootHash",
    "budgetCommitmentHash",
    "recoveryPolicyHash",
    "challengePolicyHash",
  ];
  assertExactObject(bindings, keys, "BINDINGS");
  const normalized = {};
  for (const key of keys) normalized[key] = assertHash(bindings[key], key.toUpperCase());
  return normalized;
}

function normalizeHorizons(horizons, stored = false) {
  if (!Array.isArray(horizons) || horizons.length < 2 || horizons.length > 64) {
    fail("MANDATORY_HORIZONS_TWO_TO_SIXTY_FOUR_REQUIRED");
  }
  const normalized = horizons.map((horizon) => {
    assertExactObject(horizon, stored
      ? ["horizonId", "dueAfterMs", "observationRequirementHash", "mandatory",
        "horizonCommitmentHash"]
      : ["horizonId", "dueAfterMs", "observationRequirementHash", "mandatory"],
      "HORIZON");
    assertIdentifier(horizon.horizonId, "HORIZON_ID");
    if (!Number.isSafeInteger(horizon.dueAfterMs) || horizon.dueAfterMs < 0
      || horizon.dueAfterMs > MAX_HORIZON_MS) fail("HORIZON_DELAY_INVALID");
    assertHash(horizon.observationRequirementHash, "OBSERVATION_REQUIREMENT");
    if (horizon.mandatory !== true) fail("HORIZON_MUST_BE_MANDATORY");
    const normalizedHorizon = {
      horizonId: horizon.horizonId,
      dueAfterMs: horizon.dueAfterMs,
      observationRequirementHash: horizon.observationRequirementHash,
      mandatory: true,
    };
    const horizonCommitmentHash = digest(
      "outsider/reality-obligation-horizon-commitment/v1", normalizedHorizon);
    if (stored && horizon.horizonCommitmentHash !== horizonCommitmentHash) {
      fail("HORIZON_COMMITMENT_HASH_MISMATCH", horizon.horizonId);
    }
    return {
      ...normalizedHorizon,
      horizonCommitmentHash,
    };
  }).sort((left, right) => left.dueAfterMs - right.dueAfterMs
    || (left.horizonId < right.horizonId ? -1 : left.horizonId > right.horizonId ? 1 : 0));
  if (new Set(normalized.map(({ horizonId }) => horizonId)).size !== normalized.length) {
    fail("HORIZON_ID_DUPLICATE");
  }
  if (!normalized.some(({ dueAfterMs }) => dueAfterMs === 0)
    || !normalized.some(({ dueAfterMs }) => dueAfterMs > 0)) {
    fail("IMMEDIATE_AND_DELAYED_HORIZONS_REQUIRED");
  }
  return normalized;
}

function genesisHash(body) {
  return digest("outsider/reality-obligation-genesis/v1", body);
}

function stateHash(state) {
  return digest("outsider/reality-obligation-state/v1", state);
}

function eventHash(body) {
  return digest("outsider/reality-obligation-event/v1", body);
}

function headFor(state, stateDigest, updatedAt) {
  const body = {
    schema: HEAD_SCHEMA,
    obligationId: state.obligationId,
    revision: state.revision,
    stateHash: stateDigest,
    lastEventHash: state.lastEventHash,
    updatedAt,
  };
  return { ...body, headHash: digest("outsider/reality-obligation-head/v1", body) };
}

function validateHead(head) {
  assertExactObject(head, [
    "schema", "obligationId", "revision", "stateHash", "lastEventHash",
    "updatedAt", "headHash",
  ], "HEAD");
  if (head.schema !== HEAD_SCHEMA) fail("HEAD_SCHEMA_INVALID");
  assertIdentifier(head.obligationId, "HEAD_OBLIGATION_ID");
  if (!Number.isSafeInteger(head.revision) || head.revision < 0) {
    fail("HEAD_REVISION_INVALID");
  }
  assertHash(head.stateHash, "HEAD_STATE");
  assertHash(head.lastEventHash, "HEAD_EVENT");
  assertTimestamp(head.updatedAt, "HEAD_UPDATED_AT");
  const { headHash: claimed, ...body } = head;
  if (claimed !== digest("outsider/reality-obligation-head/v1", body)) {
    fail("HEAD_HASH_MISMATCH");
  }
}

function createGenesis(input, closureCapability) {
  assertExactObject(input, [
    "directory", "obligationId", "bindings", "consequenceChannelHashes",
    "mandatoryHorizons", "createdAt",
  ], "CREATE_INPUT");
  if (typeof input.directory !== "string" || !input.directory) {
    fail("DIRECTORY_REQUIRED");
  }
  const body = {
    schema: GENESIS_SCHEMA,
    obligationId: assertIdentifier(input.obligationId, "OBLIGATION_ID"),
    closureCapability,
    bindings: normalizeBindings(input.bindings),
    consequenceChannelHashes: normalizeHashSet(input.consequenceChannelHashes,
      "CONSEQUENCE_CHANNEL"),
    mandatoryHorizons: normalizeHorizons(input.mandatoryHorizons),
    createdAt: assertTimestamp(input.createdAt, "CREATED_AT"),
    authority: authority(),
  };
  return { ...body, genesisHash: genesisHash(body) };
}

function validateGenesis(genesis) {
  assertExactObject(genesis, [
    "schema", "obligationId", "closureCapability", "bindings",
    "consequenceChannelHashes", "mandatoryHorizons", "createdAt", "authority",
    "genesisHash",
  ], "GENESIS");
  if (genesis.schema !== GENESIS_SCHEMA) fail("GENESIS_SCHEMA_INVALID");
  assertIdentifier(genesis.obligationId, "OBLIGATION_ID");
  if (![PRODUCTION_CAPABILITY, FIXTURE_CAPABILITY].includes(genesis.closureCapability)) {
    fail("GENESIS_CLOSURE_CAPABILITY_INVALID");
  }
  const bindings = normalizeBindings(genesis.bindings);
  const consequenceChannelHashes = normalizeHashSet(genesis.consequenceChannelHashes,
    "CONSEQUENCE_CHANNEL");
  const horizons = normalizeHorizons(genesis.mandatoryHorizons, true);
  assertTimestamp(genesis.createdAt, "CREATED_AT");
  assertAuthority(genesis.authority);
  const body = {
    schema: genesis.schema,
    obligationId: genesis.obligationId,
    closureCapability: genesis.closureCapability,
    bindings,
    consequenceChannelHashes,
    mandatoryHorizons: horizons,
    createdAt: genesis.createdAt,
    authority: authority(),
  };
  if (genesis.genesisHash !== genesisHash(body)) fail("GENESIS_HASH_MISMATCH");
  return { ...body, genesisHash: genesis.genesisHash };
}

function initialState(genesis) {
  return {
    schema: STATE_SCHEMA,
    obligationId: genesis.obligationId,
    genesisHash: genesis.genesisHash,
    closureCapability: genesis.closureCapability,
    bindings: clone(genesis.bindings),
    consequenceChannelHashes: clone(genesis.consequenceChannelHashes),
    mandatoryHorizons: genesis.mandatoryHorizons.map((horizon) => ({
      ...horizon,
      dueAt: null,
      status: "NOT_STARTED",
      consequenceReportHash: null,
      reportedAt: null,
    })),
    status: REALITY_OBLIGATION_STATUSES.PRECOMMITTED,
    openedAt: null,
    lastOccurredAt: genesis.createdAt,
    revision: 0,
    lastEventHash: genesis.genesisHash,
    recovery: {
      status: "NOT_DUE",
      triggerEvidenceHash: null,
      recoveryEvidenceHash: null,
      recordedAt: null,
    },
    challenges: [],
    nonClosingFacts: [],
    closureCandidate: null,
    externalClosureReceiptSlot: null,
    reopenedCount: 0,
    workflowOpen: true,
    obligationOutstanding: true,
    fixtureScenarioClosed: false,
    productionClosureEstablished: false,
    liveActionConnected: false,
    causalExperienceUnits: 0,
    authority: authority(),
  };
}

function currentOpenChallenges(state) {
  return state.challenges.filter(({ status }) => status === "OPEN");
}

function operationalStatus(state) {
  if (currentOpenChallenges(state).length) return REALITY_OBLIGATION_STATUSES.CHALLENGED;
  if (state.recovery.status === "DUE") return REALITY_OBLIGATION_STATUSES.RECOVERY_DUE;
  return REALITY_OBLIGATION_STATUSES.HORIZON_PENDING;
}

function normalizeReceipt(receipt, state) {
  assertExactObject(receipt, [
    "schema", "providerProfile", "providerIdHash", "providerPolicyHash",
    "verifierImplementationHash", "providerReceiptHash", "receiptIssuedAt",
    "closureCandidateHash", "subjectStateHash",
  ], "FIXTURE_RECEIPT");
  if (receipt.schema !== RECEIPT_SCHEMA
    || receipt.providerProfile !== FIXTURE_PROVIDER_PROFILE) {
    fail("FIXTURE_RECEIPT_PROFILE_INVALID");
  }
  for (const key of [
    "providerIdHash", "providerPolicyHash", "verifierImplementationHash",
    "providerReceiptHash", "closureCandidateHash", "subjectStateHash",
  ]) assertHash(receipt[key], key.toUpperCase());
  assertTimestamp(receipt.receiptIssuedAt, "RECEIPT_ISSUED_AT");
  if (receipt.closureCandidateHash !== state.closureCandidate?.candidateHash) {
    fail("FIXTURE_RECEIPT_CANDIDATE_MISMATCH");
  }
  const currentStateHash = stateHash(state);
  if (receipt.subjectStateHash !== currentStateHash) {
    fail("FIXTURE_RECEIPT_SUBJECT_STATE_MISMATCH");
  }
  return {
    schema: receipt.schema,
    providerProfile: receipt.providerProfile,
    providerIdHash: receipt.providerIdHash,
    providerPolicyHash: receipt.providerPolicyHash,
    verifierImplementationHash: receipt.verifierImplementationHash,
    providerReceiptHash: receipt.providerReceiptHash,
    receiptIssuedAt: receipt.receiptIssuedAt,
    closureCandidateHash: receipt.closureCandidateHash,
    subjectStateHash: receipt.subjectStateHash,
  };
}

function fixtureReceiptSlot(receipt) {
  const body = {
    ...receipt,
    fixtureOnly: true,
    providerSpecific: true,
    recordingSemantics: "RECEIPT_SLOT_OCCUPIED_NOT_PROVIDER_VERIFIED",
    externalVerificationEstablished: false,
    productionClosureEstablished: false,
  };
  return {
    ...body,
    slotHash: digest(
      "outsider/reality-external-closure-receipt-slot/test-fixture/v1", body),
  };
}

function normalizePayload(kind, payload, state) {
  if (!EVENT_KINDS.has(kind)) fail("EVENT_KIND_UNKNOWN", kind);
  if (kind === "ACTIVATE" || kind === "EVALUATE_HORIZONS") {
    assertExactObject(payload, [], `${kind}_PAYLOAD`);
    return {};
  }
  if (kind === "RECORD_HORIZON_REPORT") {
    assertExactObject(payload, ["horizonId", "consequenceReportHash"], `${kind}_PAYLOAD`);
    return {
      horizonId: assertIdentifier(payload.horizonId, "HORIZON_ID"),
      consequenceReportHash: assertHash(payload.consequenceReportHash,
        "CONSEQUENCE_REPORT"),
    };
  }
  if (kind === "MARK_RECOVERY_DUE") {
    assertExactObject(payload, ["triggerEvidenceHash"], `${kind}_PAYLOAD`);
    return { triggerEvidenceHash: assertHash(payload.triggerEvidenceHash,
      "RECOVERY_TRIGGER_EVIDENCE") };
  }
  if (kind === "RECORD_RECOVERY_EVIDENCE") {
    assertExactObject(payload, ["recoveryEvidenceHash"], `${kind}_PAYLOAD`);
    return { recoveryEvidenceHash: assertHash(payload.recoveryEvidenceHash,
      "RECOVERY_EVIDENCE") };
  }
  if (kind === "OPEN_CHALLENGE") {
    assertExactObject(payload, ["challengeHash"], `${kind}_PAYLOAD`);
    return { challengeHash: assertHash(payload.challengeHash, "CHALLENGE") };
  }
  if (kind === "RESOLVE_CHALLENGE") {
    assertExactObject(payload, ["challengeHash", "resolutionHash"], `${kind}_PAYLOAD`);
    return {
      challengeHash: assertHash(payload.challengeHash, "CHALLENGE"),
      resolutionHash: assertHash(payload.resolutionHash, "CHALLENGE_RESOLUTION"),
    };
  }
  if (kind === "RECORD_NON_CLOSING_FACT") {
    assertExactObject(payload, ["factKind", "factEvidenceHash"], `${kind}_PAYLOAD`);
    if (!NON_CLOSING_FACTS.has(payload.factKind)) fail("NON_CLOSING_FACT_KIND_INVALID");
    return {
      factKind: payload.factKind,
      factEvidenceHash: assertHash(payload.factEvidenceHash, "FACT_EVIDENCE"),
    };
  }
  if (kind === "NOMINATE_CLOSURE_CANDIDATE") {
    assertExactObject(payload, ["evidenceSetHash"], `${kind}_PAYLOAD`);
    return { evidenceSetHash: assertHash(payload.evidenceSetHash, "EVIDENCE_SET") };
  }
  if (kind === "REOPEN") {
    assertExactObject(payload, ["reopeningEvidenceHash"], `${kind}_PAYLOAD`);
    return { reopeningEvidenceHash: assertHash(payload.reopeningEvidenceHash,
      "REOPENING_EVIDENCE") };
  }
  assertExactObject(payload, ["receipt"], `${kind}_PAYLOAD`);
  return { receipt: normalizeReceipt(payload.receipt, state) };
}

function reduceEvent(previous, event) {
  const state = clone(previous);
  const { kind, occurredAt } = event;
  const payload = normalizePayload(kind, event.payload, previous);
  if (kind !== "RECORD_TEST_FIXTURE_EXTERNAL_CLOSURE"
    && previous.status === REALITY_OBLIGATION_STATUSES.EXTERNALLY_CLOSED
    && !["REOPEN", "RECORD_NON_CLOSING_FACT"].includes(kind)) {
    fail("FIXTURE_CLOSED_REQUIRES_REOPEN");
  }

  if (kind === "ACTIVATE") {
    if (previous.status !== REALITY_OBLIGATION_STATUSES.PRECOMMITTED) {
      fail("ACTIVATE_REQUIRES_PRECOMMITTED");
    }
    state.openedAt = occurredAt;
    state.mandatoryHorizons = state.mandatoryHorizons.map((horizon) => {
      const dueMillis = Date.parse(occurredAt) + horizon.dueAfterMs;
      if (!Number.isFinite(dueMillis)) fail("HORIZON_DUE_AT_OVERFLOW");
      return { ...horizon, dueAt: new Date(dueMillis).toISOString(), status: "PENDING" };
    });
    state.status = REALITY_OBLIGATION_STATUSES.OPEN;
  } else if (kind === "EVALUATE_HORIZONS") {
    if (previous.status === REALITY_OBLIGATION_STATUSES.PRECOMMITTED) {
      fail("HORIZON_EVALUATION_REQUIRES_ACTIVATION");
    }
    state.mandatoryHorizons = state.mandatoryHorizons.map((horizon) => (
      horizon.status === "PENDING" && Date.parse(horizon.dueAt) <= Date.parse(occurredAt)
        ? { ...horizon, status: "OVERDUE" } : horizon
    ));
    if (previous.status !== REALITY_OBLIGATION_STATUSES.CLOSURE_CANDIDATE) {
      state.status = operationalStatus(state);
    }
  } else if (kind === "RECORD_HORIZON_REPORT") {
    if (previous.status === REALITY_OBLIGATION_STATUSES.PRECOMMITTED) {
      fail("HORIZON_REPORT_REQUIRES_ACTIVATION");
    }
    const index = state.mandatoryHorizons.findIndex(
      ({ horizonId }) => horizonId === payload.horizonId);
    if (index < 0) fail("HORIZON_NOT_REGISTERED", payload.horizonId);
    if (Date.parse(occurredAt) < Date.parse(state.mandatoryHorizons[index].dueAt)) {
      fail("HORIZON_REPORT_BEFORE_DUE", payload.horizonId);
    }
    if (state.mandatoryHorizons[index].status === "REPORTED") {
      fail("HORIZON_REPORT_IMMUTABLE", payload.horizonId);
    }
    state.mandatoryHorizons[index] = {
      ...state.mandatoryHorizons[index],
      status: "REPORTED",
      consequenceReportHash: payload.consequenceReportHash,
      reportedAt: occurredAt,
    };
    state.status = operationalStatus(state);
  } else if (kind === "MARK_RECOVERY_DUE") {
    if (previous.status === REALITY_OBLIGATION_STATUSES.PRECOMMITTED) {
      fail("RECOVERY_REQUIRES_ACTIVATION");
    }
    state.recovery = {
      status: "DUE",
      triggerEvidenceHash: payload.triggerEvidenceHash,
      recoveryEvidenceHash: null,
      recordedAt: null,
    };
    state.closureCandidate = null;
    state.status = currentOpenChallenges(state).length
      ? REALITY_OBLIGATION_STATUSES.CHALLENGED
      : REALITY_OBLIGATION_STATUSES.RECOVERY_DUE;
  } else if (kind === "RECORD_RECOVERY_EVIDENCE") {
    if (previous.recovery.status !== "DUE") fail("RECOVERY_NOT_DUE");
    state.recovery = {
      ...state.recovery,
      status: "RECORDED_LOCAL_EVIDENCE_ONLY",
      recoveryEvidenceHash: payload.recoveryEvidenceHash,
      recordedAt: occurredAt,
    };
    state.status = operationalStatus(state);
  } else if (kind === "OPEN_CHALLENGE") {
    if (previous.status === REALITY_OBLIGATION_STATUSES.PRECOMMITTED) {
      fail("CHALLENGE_REQUIRES_ACTIVATION");
    }
    if (state.challenges.some(({ challengeHash }) => challengeHash === payload.challengeHash)) {
      fail("CHALLENGE_ALREADY_REGISTERED");
    }
    state.challenges.push({
      challengeHash: payload.challengeHash,
      status: "OPEN",
      openedAt: occurredAt,
      resolutionHash: null,
      resolvedAt: null,
    });
    state.closureCandidate = null;
    state.status = REALITY_OBLIGATION_STATUSES.CHALLENGED;
  } else if (kind === "RESOLVE_CHALLENGE") {
    const index = state.challenges.findIndex(({ challengeHash }) => (
      challengeHash === payload.challengeHash));
    if (index < 0 || state.challenges[index].status !== "OPEN") {
      fail("OPEN_CHALLENGE_NOT_FOUND");
    }
    state.challenges[index] = {
      ...state.challenges[index],
      status: "RESOLVED_LOCAL_RECORD_ONLY",
      resolutionHash: payload.resolutionHash,
      resolvedAt: occurredAt,
    };
    state.status = operationalStatus(state);
  } else if (kind === "RECORD_NON_CLOSING_FACT") {
    state.nonClosingFacts.push({
      ...payload,
      recordedAt: occurredAt,
      closureEffect: "NONE",
    });
    if (previous.status === REALITY_OBLIGATION_STATUSES.EXTERNALLY_CLOSED) {
      /* A later fact is necessarily outside the evidence set that supported the
         fixture close. Record and reopen in one immutable transition so a crash
         cannot leave the fact appended while the workflow still appears closed. */
      state.reopenedCount += 1;
      state.closureCandidate = null;
      state.externalClosureReceiptSlot = null;
      state.workflowOpen = true;
      state.fixtureScenarioClosed = false;
      state.recovery = {
        status: "DUE",
        triggerEvidenceHash: payload.factEvidenceHash,
        recoveryEvidenceHash: null,
        recordedAt: null,
      };
      state.status = REALITY_OBLIGATION_STATUSES.REOPENED;
    /* The new fact is outside a previously nominated evidence set. It cannot
       close the duty, and a stale candidate cannot silently survive it. */
    } else if (previous.status === REALITY_OBLIGATION_STATUSES.CLOSURE_CANDIDATE) {
      state.closureCandidate = null;
      state.status = operationalStatus(state);
    }
  } else if (kind === "NOMINATE_CLOSURE_CANDIDATE") {
    if (previous.status !== REALITY_OBLIGATION_STATUSES.HORIZON_PENDING) {
      fail("CLOSURE_CANDIDATE_REQUIRES_HORIZON_PENDING");
    }
    if (state.mandatoryHorizons.some(({ status }) => status !== "REPORTED")) {
      fail("CLOSURE_CANDIDATE_REQUIRES_ALL_HORIZONS_REPORTED");
    }
    if (state.recovery.status === "DUE" || currentOpenChallenges(state).length) {
      fail("CLOSURE_CANDIDATE_BLOCKED_BY_OPEN_DUTY");
    }
    const candidateBody = {
      obligationId: state.obligationId,
      priorStateHash: event.previousStateHash,
      evidenceSetHash: payload.evidenceSetHash,
      nominatedAt: occurredAt,
    };
    state.closureCandidate = {
      ...candidateBody,
      candidateHash: digest(
        "outsider/reality-obligation-closure-candidate/v1", candidateBody),
      authorityEffect: "NONE",
    };
    state.status = REALITY_OBLIGATION_STATUSES.CLOSURE_CANDIDATE;
  } else if (kind === "REOPEN") {
    if (![REALITY_OBLIGATION_STATUSES.CLOSURE_CANDIDATE,
      REALITY_OBLIGATION_STATUSES.EXTERNALLY_CLOSED].includes(previous.status)) {
      fail("REOPEN_REQUIRES_CANDIDATE_OR_FIXTURE_EXTERNAL_CLOSE");
    }
    state.reopenedCount += 1;
    state.closureCandidate = null;
    state.externalClosureReceiptSlot = null;
    state.workflowOpen = true;
    state.fixtureScenarioClosed = false;
    state.recovery = {
      status: "DUE",
      triggerEvidenceHash: payload.reopeningEvidenceHash,
      recoveryEvidenceHash: null,
      recordedAt: null,
    };
    state.status = REALITY_OBLIGATION_STATUSES.REOPENED;
  } else {
    if (previous.closureCapability !== FIXTURE_CAPABILITY) {
      fail("PRODUCTION_EXTERNAL_CLOSURE_UNREACHABLE");
    }
    if (previous.status !== REALITY_OBLIGATION_STATUSES.CLOSURE_CANDIDATE) {
      fail("FIXTURE_EXTERNAL_CLOSURE_REQUIRES_CANDIDATE");
    }
    if (Date.parse(payload.receipt.receiptIssuedAt) < Date.parse(
      previous.closureCandidate.nominatedAt)
      || Date.parse(payload.receipt.receiptIssuedAt) > Date.parse(occurredAt)) {
      fail("FIXTURE_RECEIPT_TIME_OUTSIDE_CANDIDATE_EVENT_WINDOW");
    }
    state.externalClosureReceiptSlot = fixtureReceiptSlot(payload.receipt);
    state.status = REALITY_OBLIGATION_STATUSES.EXTERNALLY_CLOSED;
    state.workflowOpen = false;
    state.fixtureScenarioClosed = true;
    /* A fixture receipt exercises replay mechanics. It cannot discharge the
       real obligation or create production authority. */
    state.obligationOutstanding = true;
    state.productionClosureEstablished = false;
  }

  state.revision = previous.revision + 1;
  state.lastOccurredAt = occurredAt;
  state.lastEventHash = event.eventHash;
  state.authority = authority();
  state.liveActionConnected = false;
  state.causalExperienceUnits = 0;
  state.productionClosureEstablished = false;
  state.obligationOutstanding = true;
  return state;
}

function validateEventShape(event, expectedSequence) {
  assertExactObject(event, [
    "schema", "sequence", "commandId", "kind", "occurredAt",
    "previousEventHash", "previousStateHash", "payload", "eventHash",
    "resultStateHash",
  ], "EVENT");
  if (event.schema !== EVENT_SCHEMA) fail("EVENT_SCHEMA_INVALID");
  if (event.sequence !== expectedSequence) fail("EVENT_SEQUENCE_GAP");
  assertIdentifier(event.commandId, "COMMAND_ID");
  if (!EVENT_KINDS.has(event.kind)) fail("EVENT_KIND_UNKNOWN", event.kind);
  assertTimestamp(event.occurredAt, "EVENT_OCCURRED_AT");
  assertHash(event.previousEventHash, "PREVIOUS_EVENT");
  assertHash(event.previousStateHash, "PREVIOUS_STATE");
  assertHash(event.eventHash, "EVENT");
  assertHash(event.resultStateHash, "RESULT_STATE");
}

function replayImmutablePrefix(paths, expectedRevision = null) {
  const genesis = validateGenesis(readJson(paths.genesis, "GENESIS_FILE"));
  let state = initialState(genesis);
  let currentStateHash = stateHash(state);
  const statesByRevision = new Map([[0, {
    stateHash: currentStateHash,
    lastEventHash: state.lastEventHash,
  }]]);
  const commands = new Set();
  const names = readdirSync(paths.events).sort();
  if (names.some((name) => !EVENT_FILE.test(name))) fail("EVENT_DIRECTORY_UNKNOWN_MEMBER");
  const targetRevision = expectedRevision === null ? names.length : expectedRevision;
  if (!Number.isSafeInteger(targetRevision) || targetRevision < 0) {
    fail("EXPECTED_REVISION_INVALID");
  }
  if (targetRevision > names.length) fail("PREFIX_REVISION_NOT_AVAILABLE");
  for (let index = 0; index < targetRevision; index += 1) {
    const expectedSequence = index + 1;
    const expectedName = `${String(expectedSequence).padStart(12, "0")}.json`;
    if (names[index] !== expectedName) fail("EVENT_SEQUENCE_GAP", names[index]);
    const event = readJson(path.join(paths.events, names[index]), "EVENT_FILE");
    validateEventShape(event, expectedSequence);
    if (commands.has(event.commandId)) fail("COMMAND_ID_REUSED", event.commandId);
    commands.add(event.commandId);
    if (event.previousEventHash !== state.lastEventHash) fail("EVENT_CHAIN_MISMATCH");
    if (event.previousStateHash !== currentStateHash) fail("EVENT_STATE_CHAIN_MISMATCH");
    assertAtOrAfter(event.occurredAt, state.lastOccurredAt, "EVENT_OCCURRED_AT");
    const body = {
      schema: event.schema,
      sequence: event.sequence,
      commandId: event.commandId,
      kind: event.kind,
      occurredAt: event.occurredAt,
      previousEventHash: event.previousEventHash,
      previousStateHash: event.previousStateHash,
      payload: event.payload,
    };
    if (event.eventHash !== eventHash(body)) fail("EVENT_HASH_MISMATCH");
    const next = reduceEvent(state, event);
    const nextHash = stateHash(next);
    if (event.resultStateHash !== nextHash) fail("EVENT_RESULT_STATE_HASH_MISMATCH");
    state = next;
    currentStateHash = nextHash;
    statesByRevision.set(state.revision, {
      stateHash: currentStateHash,
      lastEventHash: state.lastEventHash,
    });
  }

  return { genesis, state, stateHash: currentStateHash, statesByRevision, commands };
}

function replay(paths) {
  const immutable = replayImmutablePrefix(paths);
  const { genesis, state, stateHash: currentStateHash, statesByRevision, commands } = immutable;

  let head = null;
  let headStatus = "MISSING_REPAIRABLE_FROM_IMMUTABLE_CHAIN";
  if (existsSync(paths.head)) {
    head = readJson(paths.head, "HEAD_FILE");
    validateHead(head);
    if (head.obligationId !== state.obligationId) fail("HEAD_OBLIGATION_MISMATCH");
    const historic = statesByRevision.get(head.revision);
    if (!historic || historic.stateHash !== head.stateHash
      || historic.lastEventHash !== head.lastEventHash) fail("HEAD_NOT_CHAIN_PREFIX");
    headStatus = head.revision === state.revision
      ? "CURRENT" : "LAGGING_REPAIRABLE_FROM_IMMUTABLE_CHAIN";
  }
  return { genesis, state, stateHash: currentStateHash, head, headStatus, commands };
}

function projectedOverdueHorizonIds(state, asOf) {
  if (state.openedAt === null) return [];
  const millis = Date.parse(assertTimestamp(asOf, "AS_OF"));
  return state.mandatoryHorizons
    .filter((horizon) => horizon.status !== "REPORTED"
      && Date.parse(horizon.dueAt) <= millis)
    .map(({ horizonId }) => horizonId);
}

function snapshotFrom(replayed, asOf = replayed.state.lastOccurredAt) {
  assertTimestamp(asOf, "AS_OF");
  if (Date.parse(asOf) < Date.parse(replayed.state.lastOccurredAt)) {
    fail("AS_OF_BEFORE_REPLAYED_STATE");
  }
  const overdueHorizonIds = projectedOverdueHorizonIds(replayed.state, asOf);
  return clone({
    schema: "outsider/reality-obligation-snapshot/v1",
    genesis: replayed.genesis,
    state: replayed.state,
    stateHash: replayed.stateHash,
    revision: replayed.state.revision,
    headStatus: replayed.headStatus,
    asOf,
    overdueHorizonIds,
    overdue: overdueHorizonIds.length > 0,
    verification: {
      sourceReplayComplete: true,
      immutableEventChainConsistent: true,
      casHeadIsSourceOfTruth: false,
      localTamperEvidenceOnly: true,
      externalAnchorEstablished: false,
      externalClosureVerified: false,
      testFixtureLedger: replayed.state.closureCapability === FIXTURE_CAPABILITY,
      externallyClosedStatusHasProductionEffect: false,
      productionClosureEstablished: false,
      liveActionConnected: false,
      actionReady: false,
      authority: authority(),
    },
  });
}

function repairHeadIfNeeded(paths, replayed) {
  if (replayed.headStatus === "CURRENT") return replayed;
  atomicReplace(paths.head, JSON.stringify(headFor(
    replayed.state, replayed.stateHash, replayed.state.lastOccurredAt)),
  paths, "HEAD_FILE");
  return replay(paths);
}

function initialize(input, capability, StoreType) {
  const genesis = createGenesis(input, capability);
  const paths = ensureNewDirectory(input.directory);
  atomicCreate(paths.genesis, JSON.stringify(genesis), paths, "GENESIS_FILE");
  const state = initialState(genesis);
  atomicCreate(paths.head, JSON.stringify(headFor(
    state, stateHash(state), genesis.createdAt)), paths, "HEAD_FILE");
  return new StoreType(paths.root, CONSTRUCT);
}

function validateCommandInput(input, payloadKeys) {
  assertExactObject(input, [
    "commandId", "expectedRevision", "expectedStateHash", "occurredAt", ...payloadKeys,
  ], "COMMAND_INPUT");
  assertIdentifier(input.commandId, "COMMAND_ID");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    fail("EXPECTED_REVISION_INVALID");
  }
  assertHash(input.expectedStateHash, "EXPECTED_STATE");
  assertTimestamp(input.occurredAt, "OCCURRED_AT");
}

class RealityObligationStoreCore {
  constructor(directory, token) {
    if (token !== CONSTRUCT) fail("DIRECT_CONSTRUCTION_FORBIDDEN");
    this.directory = path.resolve(directory);
  }

  snapshot(options = {}) {
    assertExactObject(options, Object.hasOwn(options, "asOf") ? ["asOf"] : [],
      "SNAPSHOT_OPTIONS");
    const replayed = replay(assertExistingLayout(this.directory));
    return snapshotFrom(replayed, options.asOf ?? replayed.state.lastOccurredAt);
  }

  _append(kind, input, payloadKeys, buildPayload) {
    validateCommandInput(input, payloadKeys);
    const paths = assertExistingLayout(this.directory);
    return underLock(paths, () => {
      let replayed = replay(paths);
      replayed = repairHeadIfNeeded(paths, replayed);
      if (replayed.commands.has(input.commandId)) fail("COMMAND_ID_REUSED", input.commandId);
      if (input.expectedRevision !== replayed.state.revision
        || input.expectedStateHash !== replayed.stateHash) fail("CAS_MISMATCH");
      assertAtOrAfter(input.occurredAt, replayed.state.lastOccurredAt, "OCCURRED_AT");
      const payload = buildPayload(input);
      const normalized = normalizePayload(kind, payload, replayed.state);
      const body = {
        schema: EVENT_SCHEMA,
        sequence: replayed.state.revision + 1,
        commandId: input.commandId,
        kind,
        occurredAt: input.occurredAt,
        previousEventHash: replayed.state.lastEventHash,
        previousStateHash: replayed.stateHash,
        payload: normalized,
      };
      const event = { ...body, eventHash: eventHash(body) };
      const next = reduceEvent(replayed.state, event);
      event.resultStateHash = stateHash(next);
      const eventFile = path.join(paths.events,
        `${String(event.sequence).padStart(12, "0")}.json`);
      atomicCreate(eventFile, JSON.stringify(event), paths, "EVENT_FILE");
      atomicReplace(paths.head, JSON.stringify(headFor(
        next, event.resultStateHash, input.occurredAt)), paths, "HEAD_FILE");
      return snapshotFrom({
        ...replayed,
        state: next,
        stateHash: event.resultStateHash,
        headStatus: "CURRENT",
      }, input.occurredAt);
    });
  }

  activate(input) {
    return this._append("ACTIVATE", input, [], () => ({}));
  }

  evaluateHorizons(input) {
    return this._append("EVALUATE_HORIZONS", input, [], () => ({}));
  }

  recordHorizonReport(input) {
    return this._append("RECORD_HORIZON_REPORT", input,
      ["horizonId", "consequenceReportHash"], (value) => ({
        horizonId: value.horizonId,
        consequenceReportHash: value.consequenceReportHash,
      }));
  }

  markRecoveryDue(input) {
    return this._append("MARK_RECOVERY_DUE", input, ["triggerEvidenceHash"],
      (value) => ({ triggerEvidenceHash: value.triggerEvidenceHash }));
  }

  recordRecoveryEvidence(input) {
    return this._append("RECORD_RECOVERY_EVIDENCE", input, ["recoveryEvidenceHash"],
      (value) => ({ recoveryEvidenceHash: value.recoveryEvidenceHash }));
  }

  openChallenge(input) {
    return this._append("OPEN_CHALLENGE", input, ["challengeHash"],
      (value) => ({ challengeHash: value.challengeHash }));
  }

  resolveChallenge(input) {
    return this._append("RESOLVE_CHALLENGE", input,
      ["challengeHash", "resolutionHash"], (value) => ({
        challengeHash: value.challengeHash,
        resolutionHash: value.resolutionHash,
      }));
  }

  recordNonClosingFact(input) {
    return this._append("RECORD_NON_CLOSING_FACT", input,
      ["factKind", "factEvidenceHash"], (value) => ({
        factKind: value.factKind,
        factEvidenceHash: value.factEvidenceHash,
      }));
  }

  nominateClosureCandidate(input) {
    return this._append("NOMINATE_CLOSURE_CANDIDATE", input,
      ["evidenceSetHash"], (value) => ({ evidenceSetHash: value.evidenceSetHash }));
  }

  reopen(input) {
    return this._append("REOPEN", input, ["reopeningEvidenceHash"],
      (value) => ({ reopeningEvidenceHash: value.reopeningEvidenceHash }));
  }
}

export class RealityObligationStore extends RealityObligationStoreCore {
  static create(input) {
    return initialize(input, PRODUCTION_CAPABILITY, RealityObligationStore);
  }

  static open(directory) {
    const paths = assertExistingLayout(directory);
    const replayed = underLock(paths, () => {
      const current = replay(paths);
      if (current.genesis.closureCapability !== PRODUCTION_CAPABILITY) {
        fail("PRODUCTION_STORE_REFUSES_TEST_FIXTURE_LEDGER");
      }
      return repairHeadIfNeeded(paths, current);
    });
    return new RealityObligationStore(paths.root, CONSTRUCT);
  }
}

/* This type exists only to attack-test the otherwise unreachable terminal
   transition. It records a provider-specific receipt slot, but deliberately
   establishes no provider verification, authority, action readiness, or
   production discharge. Production stores cannot be opened through it. */
export class RealityObligationFixtureStoreForTests extends RealityObligationStoreCore {
  static create(input) {
    return initialize(input, FIXTURE_CAPABILITY,
      RealityObligationFixtureStoreForTests);
  }

  static open(directory) {
    const paths = assertExistingLayout(directory);
    const replayed = underLock(paths, () => {
      const current = replay(paths);
      if (current.genesis.closureCapability !== FIXTURE_CAPABILITY) {
        fail("FIXTURE_STORE_REFUSES_PRODUCTION_LEDGER");
      }
      return repairHeadIfNeeded(paths, current);
    });
    return new RealityObligationFixtureStoreForTests(paths.root, CONSTRUCT);
  }

  recordProviderSpecificExternalClosureReceipt(input) {
    return this._append("RECORD_TEST_FIXTURE_EXTERNAL_CLOSURE", input,
      ["receipt"], (value) => ({ receipt: value.receipt }));
  }
}

export function verifyRealityObligationStore(directory, options = {}) {
  assertExactObject(options, Object.hasOwn(options, "asOf") ? ["asOf"] : [],
    "VERIFY_OPTIONS");
  const replayed = replay(assertExistingLayout(directory));
  return snapshotFrom(replayed, options.asOf ?? replayed.state.lastOccurredAt);
}

/*
 * Replay a caller-pinned immutable ledger prefix without consulting head.json.
 * This is intentionally a read-only historical verifier: later immutable
 * events may exist, but they do not change the state at the requested
 * revision, and a mutable head can neither select nor bless that state.
 */
export function verifyRealityObligationStatePrefix(directory, options = {}) {
  const hasExpectedGenesisHash = Object.hasOwn(options, "expectedGenesisHash");
  assertExactObject(options, hasExpectedGenesisHash
    ? ["expectedRevision", "expectedStateHash", "expectedGenesisHash"]
    : ["expectedRevision", "expectedStateHash"], "PREFIX_VERIFY_OPTIONS");
  if (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0) {
    fail("EXPECTED_REVISION_INVALID");
  }
  assertHash(options.expectedStateHash, "EXPECTED_STATE");
  if (hasExpectedGenesisHash) assertHash(options.expectedGenesisHash, "EXPECTED_GENESIS");

  const replayed = replayImmutablePrefix(
    assertExistingLayout(directory), options.expectedRevision);
  if (hasExpectedGenesisHash
    && replayed.genesis.genesisHash !== options.expectedGenesisHash) {
    fail("PREFIX_EXPECTED_GENESIS_HASH_MISMATCH");
  }
  if (replayed.state.revision !== options.expectedRevision) {
    fail("PREFIX_REVISION_MISMATCH");
  }
  if (replayed.stateHash !== options.expectedStateHash) {
    fail("PREFIX_EXPECTED_STATE_HASH_MISMATCH");
  }

  const snapshot = snapshotFrom({
    ...replayed,
    head: null,
    headStatus: "MUTABLE_HEAD_NOT_READ_BY_PREFIX_VERIFIER",
  }, replayed.state.lastOccurredAt);
  return {
    ...snapshot,
    schema: "outsider/reality-obligation-state-prefix-verification/v1",
    verification: {
      ...snapshot.verification,
      sourceReplayComplete: false,
      sourceReplayScope: "PINNED_IMMUTABLE_PREFIX_ONLY",
      sourceReplayThroughRevision: options.expectedRevision,
      fullLedgerSourceReplayComplete: false,
      immutablePrefixReplayComplete: true,
      requestedRevision: options.expectedRevision,
      expectedStateHashMatched: true,
      expectedGenesisHashChecked: hasExpectedGenesisHash,
      expectedGenesisHashMatched: hasExpectedGenesisHash,
      mutableHeadRead: false,
      mutableHeadTrusted: false,
      writesPerformed: false,
    },
  };
}

export const REALITY_OBLIGATION_TEST_FIXTURE_PROVIDER_PROFILE =
  FIXTURE_PROVIDER_PROFILE;
export const REALITY_OBLIGATION_TEST_FIXTURE_RECEIPT_SCHEMA = RECEIPT_SCHEMA;
