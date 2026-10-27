import {
  createHash, createPrivateKey, createPublicKey, randomUUID, sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import {
  ANCHOR_OPERATOR_RELATIONSHIPS,
  EXTERNAL_ANCHOR_ASSURANCE as PROVIDER_ANCHOR_ASSURANCE,
  verifyExternalAnchorEvidence,
} from "./outsider-external-anchor.js";

const CENSUS_DIRECTORY = ".outsider-run-census-v1";
const ENTRY_GENESIS = `sha256:${createHash("sha256")
  .update("outsider/global-run-census/genesis/v1").digest("hex")}`;
const TERMINAL_STATUSES = new Set([
  "SAFE", "DELIVERED_UNATTRIBUTED", "BLOCKED", "ABANDONED", "UNFINALIZED",
]);
/* Legacy v1 Ed25519 receipts bind a caller-pinned key to a commitment, but
   contain no out-of-record evidence that the key belongs to an independent
   operator. Keep the API for signature-integrity use without calling it an
   independent witness. The provider-neutral bridge below always re-runs its
   profile verifier, but still cannot prove provider externality or operator
   independence from caller-supplied policy and trust material. */
const EXTERNAL_ASSURANCE = "EXTERNAL_PINNED_SIGNATURE_IDENTITY_ONLY";
const LOCAL_ASSURANCE = "LOCAL_SELF_WITNESS_INTEGRITY_ONLY";
const REQUIRED_EXTERNAL_ANCHOR_ASSURANCE =
  "POLICY_PINNED_ARTIFACT_OR_VERIFIER_DECISION_NO_OPERATOR_INDEPENDENCE";
const PROVIDER_NEUTRAL_ANCHOR_ASSURANCES = new Set([
  PROVIDER_ANCHOR_ASSURANCE.CRYPTOGRAPHIC_ONLY,
  PROVIDER_ANCHOR_ASSURANCE.VERIFICATION_DECISION_ONLY,
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function withHash(body, field) {
  canonicalizeStrict(body);
  return { ...body, [field]: digest(body) };
}

function processExists(pid) {
  if (!(Number(pid) > 0)) return false;
  try { process.kill(Number(pid), 0); return true; } catch (error) {
    return error?.code === "EPERM";
  }
}

function fsyncDirectory(directory) {
  const fd = openSync(directory, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function assertPrivateDirectory(directory, label) {
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label}_UNSAFE_TYPE`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label}_PERMISSIONS_TOO_BROAD`);
}

function assertPrivateFile(file, label) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label}_UNSAFE_TYPE`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label}_PERMISSIONS_TOO_BROAD`);
}

function ensureDirectory(directory, label) {
  if (!existsSync(directory)) {
    try { mkdirSync(directory, { mode: 0o700 }); } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  assertPrivateDirectory(directory, label);
}

export function censusPaths(stateRoot) {
  const root = path.join(path.resolve(stateRoot), CENSUS_DIRECTORY);
  return {
    stateRoot: path.resolve(stateRoot),
    root,
    entries: path.join(root, "entries"),
    receipts: path.join(root, "anchor-receipts"),
    quarantine: path.join(root, "lock-quarantine"),
    temporary: path.join(root, "tmp"),
    identity: path.join(root, "identity.json"),
    head: path.join(root, "head.json"),
    lock: path.join(root, "append.lock"),
  };
}

function ensureLayout(stateRoot) {
  const paths = censusPaths(stateRoot);
  if (!existsSync(paths.stateRoot)) mkdirSync(paths.stateRoot, { recursive: true, mode: 0o700 });
  assertPrivateDirectory(paths.stateRoot, "RUN_CENSUS_STATE_ROOT");
  ensureDirectory(paths.root, "RUN_CENSUS_ROOT");
  ensureDirectory(paths.entries, "RUN_CENSUS_ENTRIES");
  ensureDirectory(paths.receipts, "RUN_CENSUS_RECEIPTS");
  ensureDirectory(paths.quarantine, "RUN_CENSUS_LOCK_QUARANTINE");
  ensureDirectory(paths.temporary, "RUN_CENSUS_TEMPORARY");
  return paths;
}

function writeFdFully(fd, value) {
  writeFileSync(fd, value, { encoding: "utf8" });
  fsyncSync(fd);
}

function atomicCreate(file, value, paths) {
  if (existsSync(file)) throw new Error(`RUN_CENSUS_IMMUTABLE_TARGET_EXISTS:${path.basename(file)}`);
  const temporary = path.join(paths.temporary,
    `${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(temporary, flags, 0o600);
  try { writeFdFully(fd, value); } finally { closeSync(fd); }
  try {
    /* link() gives the immutable target O_EXCL semantics; rename() would be
       allowed to replace a same-UID target. The temporary inode is complete
       and fsynced before it becomes a ledger member. */
    linkSync(temporary, file);
    fsyncDirectory(path.dirname(file));
  } finally {
    try { unlinkSync(temporary); } catch { /* a leftover is outside the ledger */ }
  }
  assertPrivateFile(file, "RUN_CENSUS_FILE");
}

function atomicReplace(file, value, paths) {
  const temporary = path.join(paths.temporary,
    `${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(temporary, flags, 0o600);
  try { writeFdFully(fd, value); } finally { closeSync(fd); }
  renameSync(temporary, file);
  chmodSync(file, 0o600);
  fsyncDirectory(path.dirname(file));
  assertPrivateFile(file, "RUN_CENSUS_FILE");
}

function readJson(file, label) {
  assertPrivateFile(file, label);
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (error) {
    const wrapped = new Error(`${label}_UNREADABLE:${error?.message ?? error}`);
    wrapped.code = error?.code;
    throw wrapped;
  }
}

function lockRecord() {
  const body = {
    schema: "outsider/run-census-lock/v1",
    pid: process.pid,
    nonce: randomUUID(),
    acquiredAt: new Date().toISOString(),
  };
  return withHash(body, "lockHash");
}

function acquireLock(paths, { timeoutMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const own = lockRecord();
  const candidate = path.join(paths.temporary,
    `append-lock.${process.pid}.${own.nonce}.tmp`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(candidate, flags, 0o600);
  try { writeFdFully(fd, JSON.stringify(own)); } finally { closeSync(fd); }
  try {
    while (true) {
      try {
        /* Publishing an already-fsynced inode avoids the visible empty-lock
           interval produced by open(O_EXCL) followed by write. link() fails
           with EEXIST and never replaces another owner's lock. */
        linkSync(candidate, paths.lock);
        unlinkSync(candidate);
        fsyncDirectory(paths.root);
        return own;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        let holder;
        try { holder = readJson(paths.lock, "RUN_CENSUS_LOCK"); } catch (readError) {
          if (readError?.code === "ENOENT") continue;
          throw new Error(`RUN_CENSUS_LOCK_UNTRUSTED:${readError?.message ?? readError}`);
        }
        const { lockHash, ...body } = holder;
        if (lockHash !== digest(body) || holder.schema !== "outsider/run-census-lock/v1"
          || !(Number(holder.pid) > 0) || !holder.nonce) {
          throw new Error("RUN_CENSUS_LOCK_UNTRUSTED");
        }
        if (!processExists(holder.pid)) {
          /* A dead owner cannot still be appending. Preserve its lock for audit
             instead of deleting evidence, then retry the O_EXCL acquisition. */
          const quarantined = path.join(paths.quarantine,
            `${String(holder.acquiredAt).replaceAll(/[^0-9A-Za-z.-]/g, "_")}-${holder.nonce}.json`);
          try {
            renameSync(paths.lock, quarantined);
            chmodSync(quarantined, 0o600);
            fsyncDirectory(paths.root);
            continue;
          } catch (renameError) {
            if (renameError?.code === "ENOENT") continue;
            throw renameError;
          }
        }
        if (Date.now() >= deadline) throw new Error("RUN_CENSUS_LOCK_BUSY");
        Atomics.wait(sleepCell, 0, 0, 20);
      }
    }
  } finally {
    try { unlinkSync(candidate); } catch { /* linked or already cleaned */ }
  }
}

function releaseLock(paths, own) {
  const current = readJson(paths.lock, "RUN_CENSUS_LOCK");
  if (current.lockHash !== own.lockHash || current.nonce !== own.nonce) {
    throw new Error("RUN_CENSUS_LOCK_OWNERSHIP_LOST");
  }
  unlinkSync(paths.lock);
  fsyncDirectory(paths.root);
}

function underLock(stateRoot, operation) {
  const paths = ensureLayout(stateRoot);
  const lock = acquireLock(paths);
  try { return operation(paths); } finally { releaseLock(paths, lock); }
}

function initialHead(ledgerId) {
  return withHash({
    schema: "outsider/global-run-census-head/v1",
    ledgerId,
    entryCount: 0,
    startedCount: 0,
    contractBoundCount: 0,
    terminalCount: 0,
    openCount: 0,
    headEntryHash: ENTRY_GENESIS,
    prefixRoot: digest([]),
    updatedAt: new Date().toISOString(),
  }, "headHash");
}

function initializeLocked(paths) {
  const hasIdentity = existsSync(paths.identity);
  const hasHead = existsSync(paths.head);
  const entryNames = readdirSync(paths.entries);
  if (!hasIdentity && (hasHead || entryNames.length)) {
    throw new Error("RUN_CENSUS_IDENTITY_MISSING_WITH_EXISTING_LEDGER");
  }
  if (!hasIdentity) {
    const identity = withHash({
      schema: "outsider/global-run-census-identity/v1",
      ledgerId: randomUUID(),
      genesisHash: ENTRY_GENESIS,
      stateRootCommitment: digest({
        schema: "outsider/run-census-state-root/v1",
        canonicalStateRoot: paths.stateRoot,
      }),
      createdAt: new Date().toISOString(),
      privacyClass: "LOCAL_PRIVATE_COMMITMENTS_ONLY_EXTERNALLY",
      trustBoundary: "TAMPER_EVIDENT_FOR_ACCIDENTAL_OR_AGENT_MUTATION_NOT_SAME_UID_ADVERSARY",
    }, "identityHash");
    atomicCreate(paths.identity, JSON.stringify(identity, null, 2), paths);
    atomicCreate(paths.head, JSON.stringify(initialHead(identity.ledgerId), null, 2), paths);
    return identity;
  }
  if (!hasHead) throw new Error("RUN_CENSUS_HEAD_MISSING");
  const identity = readJson(paths.identity, "RUN_CENSUS_IDENTITY");
  const { identityHash, ...body } = identity;
  if (identity.schema !== "outsider/global-run-census-identity/v1"
    || identityHash !== digest(body) || identity.genesisHash !== ENTRY_GENESIS
    || identity.stateRootCommitment !== digest({
      schema: "outsider/run-census-state-root/v1",
      canonicalStateRoot: paths.stateRoot,
    })) {
    throw new Error("RUN_CENSUS_IDENTITY_BROKEN");
  }
  return identity;
}

function entryFile(paths, sequence) {
  return path.join(paths.entries, `${String(sequence).padStart(20, "0")}.json`);
}

function readEntries(paths) {
  const names = readdirSync(paths.entries).sort();
  if (names.some((name) => !/^\d{20}\.json$/.test(name))) {
    throw new Error("RUN_CENSUS_ENTRY_FILE_SET_INVALID");
  }
  return names.map((name, index) => {
    if (name !== `${String(index + 1).padStart(20, "0")}.json`) {
      throw new Error(`RUN_CENSUS_ENTRY_SEQUENCE_GAP:${index + 1}`);
    }
    return readJson(path.join(paths.entries, name), "RUN_CENSUS_ENTRY");
  });
}

function deriveLedger(identity, entries) {
  let prior = ENTRY_GENESIS;
  let startedCount = 0;
  let contractBoundCount = 0;
  let terminalCount = 0;
  const runs = new Map();
  const entryHashes = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const { entryHash, ...body } = entry;
    if (entry.schema !== "outsider/global-run-census-entry/v1"
      || entry.ledgerId !== identity.ledgerId || entry.entrySeq !== index + 1
      || entry.stateRootCommitment !== identity.stateRootCommitment
      || entry.prevEntryHash !== prior || entryHash !== digest(body)) {
      throw new Error(`RUN_CENSUS_HASH_CHAIN_BROKEN:${index + 1}`);
    }
    if (!HASH.test(entry.runCommitment) || !(Number(entry.runOrdinal) > 0)) {
      throw new Error(`RUN_CENSUS_RUN_BINDING_INVALID:${index + 1}`);
    }
    if (entry.kind === "STARTED") {
      startedCount += 1;
      const supersedesRunCommitment = entry.supersedesRunCommitment ?? null;
      const superseded = supersedesRunCommitment == null
        ? null : runs.get(supersedesRunCommitment);
      if (entry.runOrdinal !== startedCount || runs.has(entry.runCommitment)
        || !HASH.test(entry.goalCommitment) || entry.contractSeal !== null
        || entry.startEntryHash !== null || entry.terminalStatus !== null
        || (supersedesRunCommitment != null
          && (!HASH.test(supersedesRunCommitment) || !superseded))) {
        throw new Error(`RUN_CENSUS_START_SEQUENCE_BROKEN:${index + 1}`);
      }
      runs.set(entry.runCommitment, { start: entry, contractBinding: null, terminal: null });
    } else if (entry.kind === "CONTRACT_BOUND") {
      const run = runs.get(entry.runCommitment);
      const expectedBindingHash = run ? digest({
        schema: "outsider/run-census-contract-binding/v1",
        runCommitment: entry.runCommitment,
        goalCommitment: run.start.goalCommitment,
        contractSeal: entry.contractSeal,
        startEntryHash: run.start.entryHash,
      }) : null;
      if (!run || run.contractBinding || run.terminal
        || entry.runOrdinal !== run.start.runOrdinal
        || entry.startEntryHash !== run.start.entryHash
        || entry.goalCommitment !== run.start.goalCommitment
        || !HASH.test(entry.contractSeal)
        || entry.contractBindingHash !== expectedBindingHash
        || entry.terminalStatus !== null) {
        throw new Error(`RUN_CENSUS_CONTRACT_BINDING_INVALID:${index + 1}`);
      }
      run.contractBinding = entry;
      contractBoundCount += 1;
    } else if (entry.kind === "TERMINAL") {
      const run = runs.get(entry.runCommitment);
      const supersededByRunCommitment = entry.supersededByRunCommitment ?? null;
      const replacement = supersededByRunCommitment == null
        ? null : runs.get(supersededByRunCommitment);
      if (!run || run.terminal || entry.runOrdinal !== run.start.runOrdinal
        || entry.startEntryHash !== run.start.entryHash
        || !TERMINAL_STATUSES.has(entry.terminalStatus)
        || entry.goalCommitment !== run.start.goalCommitment
        || entry.contractSeal !== (run.contractBinding?.contractSeal ?? null)
        || !HASH.test(entry.evidenceCommitment)
        || !HASH.test(entry.terminalFactsHash)
        || entry.terminalFactsHash !== digest({
          terminalClass: entry.terminalClass,
          proofComplete: entry.proofComplete,
          deliveryComplete: entry.deliveryComplete,
        })
        || (supersededByRunCommitment != null
          && (!HASH.test(supersededByRunCommitment)
            || entry.terminalStatus !== "ABANDONED"
            || entry.terminalClass !== "OPERATOR_SUPERSEDED_ATTEMPT"
            || !replacement
            || (replacement.start.supersedesRunCommitment ?? null) !== entry.runCommitment))) {
        throw new Error(`RUN_CENSUS_TERMINAL_TRANSITION_INVALID:${index + 1}`);
      }
      run.terminal = entry;
      terminalCount += 1;
    } else {
      throw new Error(`RUN_CENSUS_ENTRY_KIND_INVALID:${index + 1}`);
    }
    prior = entryHash;
    entryHashes.push(entryHash);
  }
  return {
    entries,
    runs,
    entryCount: entries.length,
    startedCount,
    contractBoundCount,
    terminalCount,
    openCount: startedCount - terminalCount,
    headEntryHash: prior,
    prefixRoot: digest(entryHashes),
  };
}

function verifyHead(identity, head, derived) {
  const { headHash, ...body } = head;
  if (head.schema !== "outsider/global-run-census-head/v1"
    || head.ledgerId !== identity.ledgerId || headHash !== digest(body)) {
    throw new Error("RUN_CENSUS_HEAD_BROKEN");
  }
  for (const field of ["entryCount", "startedCount", "contractBoundCount",
    "terminalCount", "openCount",
    "headEntryHash", "prefixRoot"]) {
    if (head[field] !== derived[field]) throw new Error(`RUN_CENSUS_HEAD_MISMATCH:${field}`);
  }
}

function loadLocked(paths) {
  const identity = initializeLocked(paths);
  const entries = readEntries(paths);
  const derived = deriveLedger(identity, entries);
  const head = readJson(paths.head, "RUN_CENSUS_HEAD");
  try {
    verifyHead(identity, head, derived);
  } catch (error) {
    /* A crash can happen after an immutable entry is linked but before the
       replaceable head is advanced. Only that exact one-way lag is repaired;
       missing, reordered, invalid or truncated entries remain fail-closed. */
    const headBody = (() => {
      const { headHash, ...body } = head;
      return headHash === digest(body) ? body : null;
    })();
    const oldPrefix = headBody && Number.isSafeInteger(head.entryCount)
      && head.entryCount >= 0 && head.entryCount <= entries.length
      ? deriveLedger(identity, entries.slice(0, head.entryCount)) : null;
    const exactOldPrefix = oldPrefix && ["entryCount", "startedCount", "contractBoundCount",
      "terminalCount", "openCount", "headEntryHash", "prefixRoot"]
      .every((field) => head[field] === oldPrefix[field]);
    if (!headBody || head.ledgerId !== identity.ledgerId || !exactOldPrefix
      || derived.entryCount !== head.entryCount + 1) {
      throw error;
    }
    const repaired = withHash({
      schema: "outsider/global-run-census-head/v1",
      ledgerId: identity.ledgerId,
      entryCount: derived.entryCount,
      startedCount: derived.startedCount,
      contractBoundCount: derived.contractBoundCount,
      terminalCount: derived.terminalCount,
      openCount: derived.openCount,
      headEntryHash: derived.headEntryHash,
      prefixRoot: derived.prefixRoot,
      updatedAt: new Date().toISOString(),
    }, "headHash");
    atomicReplace(paths.head, JSON.stringify(repaired, null, 2), paths);
    verifyHead(identity, repaired, derived);
    return { paths, identity, head: repaired, ...derived, recoveredHead: true };
  }
  return { paths, identity, head, ...derived, recoveredHead: false };
}

function appendLocked(ledger, body) {
  const entry = withHash({
    schema: "outsider/global-run-census-entry/v1",
    ledgerId: ledger.identity.ledgerId,
    stateRootCommitment: ledger.identity.stateRootCommitment,
    entrySeq: ledger.entryCount + 1,
    prevEntryHash: ledger.headEntryHash,
    observedAt: new Date().toISOString(),
    clockTrust: "LOCAL_WALL_CLOCK_UNTRUSTED_UNTIL_EXTERNALLY_ANCHORED",
    ...body,
  }, "entryHash");
  atomicCreate(entryFile(ledger.paths, entry.entrySeq), JSON.stringify(entry, null, 2), ledger.paths);
  const entries = [...ledger.entries, entry];
  const derived = deriveLedger(ledger.identity, entries);
  const head = withHash({
    schema: "outsider/global-run-census-head/v1",
    ledgerId: ledger.identity.ledgerId,
    entryCount: derived.entryCount,
    startedCount: derived.startedCount,
    contractBoundCount: derived.contractBoundCount,
    terminalCount: derived.terminalCount,
    openCount: derived.openCount,
    headEntryHash: derived.headEntryHash,
    prefixRoot: derived.prefixRoot,
    updatedAt: new Date().toISOString(),
  }, "headHash");
  atomicReplace(ledger.paths.head, JSON.stringify(head, null, 2), ledger.paths);
  return { entry, head, derived };
}

function intakeCommitments({ runId, ask, host }) {
  const goalCommitment = digest({
    schema: "outsider/run-census-goal/v1",
    operatorWords: String(ask),
  });
  const runCommitment = digest({
    schema: "outsider/run-census-intake-binding/v1",
    runId: String(runId),
    goalCommitment,
    host: String(host ?? "unknown"),
  });
  return { goalCommitment, runCommitment };
}

function makeRegistration({ ledger, run, contractBinding = run.contractBinding,
  idempotent = false }) {
  const body = {
    schema: "outsider/run-census-registration/v2",
    ledgerId: ledger.identity.ledgerId,
    stateRootCommitment: ledger.identity.stateRootCommitment,
    runOrdinal: run.start.runOrdinal,
    startEntrySeq: run.start.entrySeq,
    startEntryHash: run.start.entryHash,
    runCommitment: run.start.runCommitment,
    goalCommitment: run.start.goalCommitment,
    hostClass: run.start.hostClass,
    contractBinding: contractBinding ? {
      entrySeq: contractBinding.entrySeq,
      entryHash: contractBinding.entryHash,
      contractSeal: contractBinding.contractSeal,
      contractBindingHash: contractBinding.contractBindingHash,
    } : null,
    trustBoundary: ledger.identity.trustBoundary,
  };
  return { ...withHash(body, "registrationHash"), idempotent };
}

export function registerCensusIntake({ stateRoot, runId, ask, host,
  supersedesRegistration = null } = {}) {
  if (!stateRoot) throw new Error("RUN_CENSUS_STATE_ROOT_REQUIRED");
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(String(runId ?? ""))) {
    throw new Error("RUN_CENSUS_RUN_ID_INVALID");
  }
  if (typeof ask !== "string" || ask.length === 0) throw new Error("RUN_CENSUS_GOAL_REQUIRED");
  const { goalCommitment, runCommitment } = intakeCommitments({ runId, ask, host });
  const supersedes = supersedesRegistration == null
    ? null : registrationBody(supersedesRegistration);
  if (supersedes && (supersedes.body.schema !== "outsider/run-census-registration/v2"
    || supersedes.registrationHash !== digest(supersedes.body))) {
    throw new Error("RUN_CENSUS_SUPERSEDED_REGISTRATION_HASH_BROKEN");
  }
  return underLock(stateRoot, (paths) => {
    const ledger = loadLocked(paths);
    let superseded = null;
    if (supersedes) {
      if (supersedes.body.ledgerId !== ledger.identity.ledgerId
        || supersedes.body.stateRootCommitment !== ledger.identity.stateRootCommitment) {
        throw new Error("RUN_CENSUS_SUPERSEDED_REGISTRATION_LEDGER_MISMATCH");
      }
      superseded = ledger.runs.get(supersedes.body.runCommitment);
      if (!superseded || superseded.start.entryHash !== supersedes.body.startEntryHash
        || superseded.start.entrySeq !== supersedes.body.startEntrySeq
        || superseded.start.runOrdinal !== supersedes.body.runOrdinal
        || superseded.start.goalCommitment !== supersedes.body.goalCommitment
        || superseded.start.hostClass !== supersedes.body.hostClass) {
        throw new Error("RUN_CENSUS_SUPERSEDED_RUN_NOT_FOUND");
      }
    }
    const existing = ledger.runs.get(runCommitment);
    if (existing) {
      if (existing.terminal) throw new Error("RUN_CENSUS_RUN_ALREADY_TERMINAL");
      if ((existing.start.supersedesRunCommitment ?? null)
        !== (supersedes?.body.runCommitment ?? null)) {
        throw new Error("RUN_CENSUS_CONFLICTING_SUPERSESSION_BINDING");
      }
      return makeRegistration({ ledger, run: existing, idempotent: true });
    }
    const runOrdinal = ledger.startedCount + 1;
    const { entry } = appendLocked(ledger, {
      kind: "STARTED",
      runOrdinal,
      runCommitment,
      goalCommitment,
      contractSeal: null,
      hostClass: String(host ?? "unknown"),
      startEntryHash: null,
      terminalStatus: null,
      evidenceCommitment: null,
      supersedesRunCommitment: superseded?.start.runCommitment ?? null,
      reasonCode: "OPERATOR_INTAKE_REGISTERED_BEFORE_PREFLIGHT",
    });
    return makeRegistration({ ledger, run: { start: entry, contractBinding: null },
      idempotent: false });
  });
}

function registrationBody(registration) {
  const value = registration ?? {};
  const body = {
    schema: value.schema,
    ledgerId: value.ledgerId,
    stateRootCommitment: value.stateRootCommitment,
    runOrdinal: value.runOrdinal,
    startEntrySeq: value.startEntrySeq,
    startEntryHash: value.startEntryHash,
    runCommitment: value.runCommitment,
    goalCommitment: value.goalCommitment,
    hostClass: value.hostClass,
    contractBinding: value.contractBinding ?? null,
    trustBoundary: value.trustBoundary,
  };
  const registrationHash = value.registrationHash;
  return { body, registrationHash };
}

export function bindCensusContract({ stateRoot, registration, contractSeal } = {}) {
  if (!HASH.test(String(contractSeal ?? ""))) throw new Error("RUN_CENSUS_CONTRACT_SEAL_INVALID");
  const { body, registrationHash } = registrationBody(registration);
  if (body.schema !== "outsider/run-census-registration/v2"
    || registrationHash !== digest(body)) throw new Error("RUN_CENSUS_REGISTRATION_HASH_BROKEN");
  return underLock(stateRoot, (paths) => {
    const ledger = loadLocked(paths);
    if (ledger.identity.ledgerId !== body.ledgerId) throw new Error("RUN_CENSUS_LEDGER_MISMATCH");
    if (ledger.identity.stateRootCommitment !== body.stateRootCommitment) {
      throw new Error("RUN_CENSUS_STATE_ROOT_BINDING_MISMATCH");
    }
    const run = ledger.runs.get(body.runCommitment);
    if (!run || run.start.entryHash !== body.startEntryHash
      || run.start.goalCommitment !== body.goalCommitment
      || run.start.runOrdinal !== body.runOrdinal) throw new Error("RUN_CENSUS_START_NOT_FOUND");
    if (run.terminal) throw new Error("RUN_CENSUS_RUN_ALREADY_TERMINAL");
    if (run.contractBinding) {
      if (run.contractBinding.contractSeal !== contractSeal) {
        throw new Error("RUN_CENSUS_CONFLICTING_CONTRACT_BINDING");
      }
      return makeRegistration({ ledger, run, idempotent: true });
    }
    if (body.contractBinding !== null) throw new Error("RUN_CENSUS_REGISTRATION_BINDING_NOT_FOUND");
    const contractBindingHash = digest({
      schema: "outsider/run-census-contract-binding/v1",
      runCommitment: body.runCommitment,
      goalCommitment: body.goalCommitment,
      contractSeal,
      startEntryHash: body.startEntryHash,
    });
    const { entry } = appendLocked(ledger, {
      kind: "CONTRACT_BOUND",
      runOrdinal: body.runOrdinal,
      runCommitment: body.runCommitment,
      goalCommitment: body.goalCommitment,
      contractSeal,
      contractBindingHash,
      hostClass: body.hostClass,
      startEntryHash: body.startEntryHash,
      terminalStatus: null,
      evidenceCommitment: null,
      reasonCode: "FROZEN_OPERATOR_CONTRACT_BOUND",
    });
    return makeRegistration({ ledger, run, contractBinding: entry, idempotent: false });
  });
}

export function registerCensusRun({ stateRoot, runId, ask = null, contractSeal, host } = {}) {
  const intake = registerCensusIntake({ stateRoot, runId, ask, host });
  return bindCensusContract({ stateRoot, registration: intake, contractSeal });
}

export function verifyCensusRegistration({ stateRoot, registration, runId,
  ask, contractSeal = null, host } = {}) {
  try {
    const { body, registrationHash } = registrationBody(registration);
    if (body.schema !== "outsider/run-census-registration/v2"
      || registrationHash !== digest(body)) throw new Error("RUN_CENSUS_REGISTRATION_HASH_BROKEN");
    const expected = intakeCommitments({ runId, ask, host });
    if (body.runCommitment !== expected.runCommitment
      || body.goalCommitment !== expected.goalCommitment) {
      throw new Error("RUN_CENSUS_REGISTRATION_RUN_BINDING_MISMATCH");
    }
    const verified = verifyRunCensus(stateRoot);
    if (!verified.ok) throw new Error(verified.error);
    if (verified.ledgerId !== body.ledgerId) throw new Error("RUN_CENSUS_REGISTRATION_LEDGER_MISMATCH");
    if (verified.stateRootCommitment !== body.stateRootCommitment) {
      throw new Error("RUN_CENSUS_STATE_ROOT_BINDING_MISMATCH");
    }
    const run = verified.runs.find((item) => item.runCommitment === body.runCommitment);
    if (!run || run.runOrdinal !== body.runOrdinal || run.startEntryHash !== body.startEntryHash
      || run.startEntrySeq !== body.startEntrySeq) {
      throw new Error("RUN_CENSUS_REGISTRATION_START_NOT_FOUND");
    }
    if (contractSeal != null && (body.contractBinding?.contractSeal !== contractSeal
      || run.contractBinding?.contractSeal !== contractSeal
      || body.contractBinding.entryHash !== run.contractBinding.entryHash)) {
      throw new Error("RUN_CENSUS_REGISTRATION_CONTRACT_BINDING_MISMATCH");
    }
    return { ok: true, registration: { ...body, registrationHash }, terminal: run.terminal };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function normalizedTerminalFacts(terminalStatus, terminalFacts = null) {
  const defaults = terminalStatus === "SAFE"
    ? { terminalClass: "SAFE_DELIVERY", proofComplete: true, deliveryComplete: true }
    : terminalStatus === "DELIVERED_UNATTRIBUTED"
      ? { terminalClass: "VERIFIED_DELIVERY_UNATTRIBUTED",
        proofComplete: false, deliveryComplete: true }
      : { terminalClass: terminalStatus, proofComplete: false, deliveryComplete: false };
  const facts = terminalFacts == null ? defaults : {
    terminalClass: String(terminalFacts.terminalClass ?? ""),
    proofComplete: terminalFacts.proofComplete === true,
    deliveryComplete: terminalFacts.deliveryComplete === true,
  };
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(facts.terminalClass)
    || (terminalStatus === "SAFE" && (!facts.proofComplete || !facts.deliveryComplete))
    || (terminalStatus === "DELIVERED_UNATTRIBUTED"
      && (facts.terminalClass !== "VERIFIED_DELIVERY_UNATTRIBUTED"
        || facts.proofComplete || !facts.deliveryComplete))
    || (["BLOCKED", "ABANDONED", "UNFINALIZED"].includes(terminalStatus)
      && (facts.proofComplete || facts.deliveryComplete))) {
    throw new Error("RUN_CENSUS_TERMINAL_FACTS_INVALID");
  }
  return facts;
}

export function settleCensusRun({ stateRoot, registration, terminalStatus,
  evidenceCommitment, reasonCode, terminalFacts = null,
  supersededByRunCommitment = null } = {}) {
  if (!TERMINAL_STATUSES.has(terminalStatus)) throw new Error("RUN_CENSUS_TERMINAL_STATUS_INVALID");
  if (!HASH.test(String(evidenceCommitment ?? ""))) {
    throw new Error("RUN_CENSUS_TERMINAL_EVIDENCE_COMMITMENT_REQUIRED");
  }
  if (!/^[A-Z0-9][A-Z0-9_-]{2,127}$/.test(String(reasonCode ?? ""))) {
    throw new Error("RUN_CENSUS_TERMINAL_REASON_CODE_INVALID");
  }
  const facts = normalizedTerminalFacts(terminalStatus, terminalFacts);
  if (supersededByRunCommitment != null
    && (!HASH.test(String(supersededByRunCommitment))
      || terminalStatus !== "ABANDONED"
      || facts.terminalClass !== "OPERATOR_SUPERSEDED_ATTEMPT")) {
    throw new Error("RUN_CENSUS_SUPERSESSION_TERMINAL_INVALID");
  }
  const terminalFactsHash = digest(facts);
  const { body, registrationHash } = registrationBody(registration);
  if (body.schema !== "outsider/run-census-registration/v2"
    || registrationHash !== digest(body)) throw new Error("RUN_CENSUS_REGISTRATION_HASH_BROKEN");
  return underLock(stateRoot, (paths) => {
    const ledger = loadLocked(paths);
    if (ledger.identity.ledgerId !== body.ledgerId) throw new Error("RUN_CENSUS_LEDGER_MISMATCH");
    if (ledger.identity.stateRootCommitment !== body.stateRootCommitment) {
      throw new Error("RUN_CENSUS_STATE_ROOT_BINDING_MISMATCH");
    }
    const run = ledger.runs.get(body.runCommitment);
    if (!run || run.start.entryHash !== body.startEntryHash
      || run.start.entrySeq !== body.startEntrySeq
      || run.start.runOrdinal !== body.runOrdinal
      || run.start.goalCommitment !== body.goalCommitment
      || run.start.hostClass !== body.hostClass) throw new Error("RUN_CENSUS_START_NOT_FOUND");
    if (supersededByRunCommitment != null) {
      const replacement = ledger.runs.get(supersededByRunCommitment);
      if (!replacement
        || (replacement.start.supersedesRunCommitment ?? null) !== body.runCommitment) {
        throw new Error("RUN_CENSUS_SUPERSESSION_REPLACEMENT_NOT_FOUND");
      }
    }
    if (["SAFE", "DELIVERED_UNATTRIBUTED"].includes(terminalStatus)
      && !run.contractBinding) throw new Error("RUN_CENSUS_DELIVERY_WITHOUT_CONTRACT_BINDING");
    if (run.terminal) {
      if (run.terminal.terminalStatus !== terminalStatus
        || run.terminal.evidenceCommitment !== evidenceCommitment
        || run.terminal.reasonCode !== reasonCode
        || run.terminal.terminalFactsHash !== terminalFactsHash
        || (run.terminal.supersededByRunCommitment ?? null)
          !== (supersededByRunCommitment ?? null)) {
        throw new Error("RUN_CENSUS_CONFLICTING_TERMINAL");
      }
      return { entry: run.terminal, idempotent: true };
    }
    const { entry } = appendLocked(ledger, {
      kind: "TERMINAL",
      runOrdinal: body.runOrdinal,
      runCommitment: body.runCommitment,
      goalCommitment: run.start.goalCommitment,
      contractSeal: run.contractBinding?.contractSeal ?? null,
      hostClass: run.start.hostClass,
      startEntryHash: body.startEntryHash,
      terminalStatus,
      ...facts,
      terminalFactsHash,
      evidenceCommitment,
      supersededByRunCommitment: supersededByRunCommitment ?? null,
      reasonCode,
    });
    return { entry, idempotent: false };
  });
}

/** Explicit only: callers must commit concrete crash/operator evidence. No age
 * heuristic is accepted as evidence that a live run may be closed. */
export function reconcileCensusRun({ terminalStatus, ...options } = {}) {
  if (!new Set(["ABANDONED", "UNFINALIZED"]).has(terminalStatus)) {
    throw new Error("RUN_CENSUS_RECONCILIATION_STATUS_INVALID");
  }
  return settleCensusRun({ ...options, terminalStatus });
}

/** Reconcile a surfaced open ordinal when bootstrap failed before the caller
 * received a registration object. The ordinal comes from verifyRunCensus; the
 * same immutable STARTED entry is used, never recreated. */
export function reconcileOpenCensusRun({ stateRoot, runOrdinal, terminalStatus,
  evidenceCommitment, reasonCode, terminalFacts = null } = {}) {
  if (!Number.isSafeInteger(runOrdinal) || runOrdinal < 1) {
    throw new Error("RUN_CENSUS_RECONCILIATION_ORDINAL_INVALID");
  }
  const registration = underLock(stateRoot, (paths) => {
    const ledger = loadLocked(paths);
    const run = [...ledger.runs.values()].find((item) => item.start.runOrdinal === runOrdinal);
    if (!run) throw new Error("RUN_CENSUS_RECONCILIATION_RUN_NOT_FOUND");
    if (run.terminal) throw new Error("RUN_CENSUS_RUN_ALREADY_TERMINAL");
    return makeRegistration({ ledger, run, idempotent: true });
  });
  return reconcileCensusRun({ stateRoot, registration, terminalStatus,
    evidenceCommitment, reasonCode, terminalFacts });
}

export function verifyRunCensus(stateRoot) {
  try {
    const paths = censusPaths(stateRoot);
    if (!existsSync(paths.root)) throw new Error("RUN_CENSUS_NOT_FOUND");
    assertPrivateDirectory(paths.root, "RUN_CENSUS_ROOT");
    assertPrivateDirectory(paths.entries, "RUN_CENSUS_ENTRIES");
    assertPrivateDirectory(paths.receipts, "RUN_CENSUS_RECEIPTS");
    const identity = readJson(paths.identity, "RUN_CENSUS_IDENTITY");
    const { identityHash, ...identityBody } = identity;
    if (identity.schema !== "outsider/global-run-census-identity/v1"
      || identityHash !== digest(identityBody) || identity.genesisHash !== ENTRY_GENESIS) {
      throw new Error("RUN_CENSUS_IDENTITY_BROKEN");
    }
    if (identity.stateRootCommitment !== digest({
      schema: "outsider/run-census-state-root/v1",
      canonicalStateRoot: paths.stateRoot,
    })) throw new Error("RUN_CENSUS_STATE_ROOT_BINDING_MISMATCH");
    const entries = readEntries(paths);
    const derived = deriveLedger(identity, entries);
    const head = readJson(paths.head, "RUN_CENSUS_HEAD");
    verifyHead(identity, head, derived);
    return {
      ok: true,
      ledgerId: identity.ledgerId,
      stateRootCommitment: identity.stateRootCommitment,
      trustBoundary: identity.trustBoundary,
      entryCount: derived.entryCount,
      startedCount: derived.startedCount,
      contractBoundCount: derived.contractBoundCount,
      terminalCount: derived.terminalCount,
      openCount: derived.openCount,
      headEntryHash: derived.headEntryHash,
      prefixRoot: derived.prefixRoot,
      runs: [...derived.runs.values()].map(({ start, contractBinding, terminal }) => ({
        runOrdinal: start.runOrdinal,
        runCommitment: start.runCommitment,
        goalCommitment: start.goalCommitment,
        hostClass: start.hostClass,
        startEntrySeq: start.entrySeq,
        startEntryHash: start.entryHash,
        supersedesRunCommitment: start.supersedesRunCommitment ?? null,
        registrationHashes: {
          intake: makeRegistration({ ledger: { identity },
            run: { start, contractBinding: null } }).registrationHash,
          bound: contractBinding ? makeRegistration({ ledger: { identity },
            run: { start, contractBinding } }).registrationHash : null,
        },
        contractBinding: contractBinding ? {
          entrySeq: contractBinding.entrySeq,
          entryHash: contractBinding.entryHash,
          contractSeal: contractBinding.contractSeal,
          contractBindingHash: contractBinding.contractBindingHash,
        } : null,
        terminal: terminal ? {
          terminalStatus: terminal.terminalStatus,
          terminalClass: terminal.terminalClass,
          proofComplete: terminal.proofComplete,
          deliveryComplete: terminal.deliveryComplete,
          terminalFactsHash: terminal.terminalFactsHash,
          evidenceCommitment: terminal.evidenceCommitment,
          reasonCode: terminal.reasonCode,
          terminalEntrySeq: terminal.entrySeq,
          terminalEntryHash: terminal.entryHash,
          supersededByRunCommitment: terminal.supersededByRunCommitment ?? null,
        } : null,
      })),
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/**
 * Read-only identity lookup for callers that must distinguish a genuinely
 * pre-census legacy run from a state file relabelled to an older schema.  This
 * never initializes a ledger, repairs a head, appends an entry, or accepts a
 * caller-provided commitment.  The run commitment is derived here by the same
 * private intake function used at registration.
 */
export function findCensusRun({ stateRoot, runId, ask, host } = {}) {
  try {
    if (!stateRoot) throw new Error("RUN_CENSUS_STATE_ROOT_REQUIRED");
    if (!/^[A-Za-z0-9._-]{8,128}$/.test(String(runId ?? ""))) {
      throw new Error("RUN_CENSUS_RUN_ID_INVALID");
    }
    if (typeof ask !== "string" || ask.length === 0) {
      throw new Error("RUN_CENSUS_GOAL_REQUIRED");
    }
    const paths = censusPaths(stateRoot);
    if (!existsSync(paths.root)) return { ok: true, found: false, run: null };
    const verified = verifyRunCensus(stateRoot);
    if (!verified.ok) return { ok: false, error: verified.error };
    const expected = intakeCommitments({ runId, ask, host });
    const run = verified.runs.find((item) => item.runCommitment === expected.runCommitment
      && item.goalCommitment === expected.goalCommitment
      && item.hostClass === String(host ?? "unknown")) ?? null;
    return run === null
      ? { ok: true, found: false, run: null }
      : { ok: true, found: true, run };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export function defaultAnchorPolicy() {
  return {
    schema: "outsider/census-anchor-policy/v1",
    purpose: "RUN_CENSUS_NON_OMISSION_CHECKPOINT",
    disclosure: "COMMITMENT_ONLY",
    rawRunDataIncluded: false,
    requiredAssurance: REQUIRED_EXTERNAL_ANCHOR_ASSURANCE,
  };
}

function prefixFrom(stateRoot, entryCount) {
  const paths = censusPaths(stateRoot);
  const identity = readJson(paths.identity, "RUN_CENSUS_IDENTITY");
  const all = readEntries(paths);
  if (!Number.isSafeInteger(entryCount) || entryCount < 0 || entryCount > all.length) {
    throw new Error("RUN_CENSUS_ANCHOR_PREFIX_COUNT_INVALID");
  }
  return { identity, ...deriveLedger(identity, all.slice(0, entryCount)) };
}

export function createCensusAnchorCommitment({ stateRoot, prefixEntryCount = null,
  policy = defaultAnchorPolicy() } = {}) {
  canonicalizeStrict(policy);
  const current = verifyRunCensus(stateRoot);
  if (!current.ok) throw new Error(current.error);
  const count = prefixEntryCount == null ? current.entryCount : Number(prefixEntryCount);
  const prefix = prefixFrom(stateRoot, count);
  const body = {
    schema: "outsider/census-anchor-commitment/v1",
    ledgerId: prefix.identity.ledgerId,
    entryCount: prefix.entryCount,
    startedCount: prefix.startedCount,
    contractBoundCount: prefix.contractBoundCount,
    terminalCount: prefix.terminalCount,
    openCount: prefix.openCount,
    headEntryHash: prefix.headEntryHash,
    prefixRoot: prefix.prefixRoot,
    anchorPolicyHash: digest(policy),
    disclosure: "COMMITMENT_ONLY_NO_RUN_PROMPT_PATH_OUTPUT_OR_EVENT_DATA",
  };
  return withHash(body, "anchorCommitmentHash");
}

export function verifyCensusAnchorCommitment({ stateRoot, commitment,
  policy = defaultAnchorPolicy() } = {}) {
  try {
    const current = verifyRunCensus(stateRoot);
    if (!current.ok) throw new Error(current.error);
    const { anchorCommitmentHash, ...body } = commitment ?? {};
    const expectedKeys = ["anchorCommitmentHash", "anchorPolicyHash", "contractBoundCount",
      "disclosure", "entryCount", "headEntryHash", "ledgerId", "openCount", "prefixRoot",
      "schema", "startedCount", "terminalCount"].sort();
    if (Object.keys(commitment ?? {}).sort().join("\0") !== expectedKeys.join("\0")) {
      throw new Error("RUN_CENSUS_ANCHOR_COMMITMENT_SHAPE_INVALID");
    }
    if (body.schema !== "outsider/census-anchor-commitment/v1"
      || anchorCommitmentHash !== digest(body)) throw new Error("RUN_CENSUS_ANCHOR_COMMITMENT_BROKEN");
    if (body.disclosure !== "COMMITMENT_ONLY_NO_RUN_PROMPT_PATH_OUTPUT_OR_EVENT_DATA") {
      throw new Error("RUN_CENSUS_ANCHOR_DISCLOSURE_INVALID");
    }
    if (body.anchorPolicyHash !== digest(policy)) throw new Error("RUN_CENSUS_ANCHOR_POLICY_MISMATCH");
    const prefix = prefixFrom(stateRoot, body.entryCount);
    for (const field of ["ledgerId", "entryCount", "startedCount", "contractBoundCount",
      "terminalCount", "openCount", "headEntryHash", "prefixRoot"]) {
      const expected = field === "ledgerId" ? prefix.identity.ledgerId : prefix[field];
      if (body[field] !== expected) throw new Error(`RUN_CENSUS_ANCHOR_PREFIX_MISMATCH:${field}`);
    }
    return { ok: true, anchorCommitmentHash, entryCount: body.entryCount };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function receiptSigningPayload(body) {
  return canonicalizeStrict({
    schema: "outsider/census-anchor-receipt-signature/v1",
    commitmentHash: body.commitment.anchorCommitmentHash,
    provider: body.provider,
    observedAt: body.observedAt,
    anchorPolicyHash: body.anchorPolicyHash,
  });
}

function canonicalIso(value) {
  return typeof value === "string" && value.length === 24
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function providerIdValid(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function ed25519SignatureValid(value) {
  if (typeof value !== "string" || value.length !== 88
    || !/^[A-Za-z0-9+/]{86}==$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 64 && decoded.toString("base64") === value;
}

export function issueExternalAnchorReceipt({ commitment, providerId, privateKeyPem,
  observedAt = new Date().toISOString() } = {}) {
  if (!providerIdValid(providerId)) throw new Error("RUN_CENSUS_ANCHOR_PROVIDER_ID_INVALID");
  if (!canonicalIso(observedAt)) throw new Error("RUN_CENSUS_ANCHOR_OBSERVED_AT_INVALID");
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const keyId = digest(publicKey.export({ type: "spki", format: "der" }));
  const body = {
    schema: "outsider/census-anchor-receipt/v1",
    commitment,
    provider: { providerId: String(providerId), keyId, assurance: EXTERNAL_ASSURANCE },
    observedAt: String(observedAt),
    anchorPolicyHash: commitment?.anchorPolicyHash ?? null,
  };
  const signature = {
    algorithm: "Ed25519",
    value: cryptoSign(null, Buffer.from(receiptSigningPayload(body)), privateKey).toString("base64"),
  };
  return withHash({ ...body, signature }, "receiptHash");
}

export function createLocalAnchorReceipt({ commitment,
  observedAt = new Date().toISOString() } = {}) {
  if (!canonicalIso(observedAt)) throw new Error("RUN_CENSUS_ANCHOR_OBSERVED_AT_INVALID");
  const body = {
    schema: "outsider/census-anchor-receipt/v1",
    commitment,
    provider: { providerId: "local-self", keyId: null, assurance: LOCAL_ASSURANCE },
    observedAt: String(observedAt),
    anchorPolicyHash: commitment?.anchorPolicyHash ?? null,
    signature: null,
  };
  return withHash(body, "receiptHash");
}

export function verifyAnchorReceipt({ stateRoot, receipt, policy = defaultAnchorPolicy(),
  trustedPublicKeys = {}, externalVerifier = null, externalVerifierPin = null } = {}) {
  try {
    if (!exactKeys(receipt, ["schema", "commitment", "provider", "observedAt",
      "anchorPolicyHash", "signature", "receiptHash"])) {
      throw new Error("RUN_CENSUS_ANCHOR_RECEIPT_SHAPE_INVALID");
    }
    const { receiptHash, ...body } = receipt ?? {};
    if (body.schema !== "outsider/census-anchor-receipt/v1" || receiptHash !== digest(body)) {
      throw new Error("RUN_CENSUS_ANCHOR_RECEIPT_HASH_BROKEN");
    }
    const commitment = verifyCensusAnchorCommitment({ stateRoot,
      commitment: body.commitment, policy });
    if (!commitment.ok) throw new Error(commitment.error);
    if (body.anchorPolicyHash !== body.commitment.anchorPolicyHash) {
      throw new Error("RUN_CENSUS_ANCHOR_RECEIPT_POLICY_MISMATCH");
    }
    if (!canonicalIso(body.observedAt)) throw new Error("RUN_CENSUS_ANCHOR_OBSERVED_AT_INVALID");
    if (!exactKeys(body.provider, ["providerId", "keyId", "assurance"])) {
      throw new Error("RUN_CENSUS_ANCHOR_PROVIDER_SHAPE_INVALID");
    }
    if (body.provider?.assurance === LOCAL_ASSURANCE) {
      if (body.provider.providerId !== "local-self" || body.provider.keyId !== null
        || body.signature !== null) throw new Error("RUN_CENSUS_LOCAL_RECEIPT_INVALID");
      return { ok: true, external: false, assurance: LOCAL_ASSURANCE,
        receiptHash, anchorCommitmentHash: commitment.anchorCommitmentHash };
    }
    if (body.provider?.assurance !== EXTERNAL_ASSURANCE || !body.provider.providerId
      || !HASH.test(String(body.provider.keyId ?? ""))
      || !providerIdValid(body.provider.providerId)
      || !exactKeys(body.signature, ["algorithm", "value"])
      || body.signature?.algorithm !== "Ed25519"
      || !ed25519SignatureValid(body.signature.value)) {
      throw new Error("RUN_CENSUS_EXTERNAL_RECEIPT_SHAPE_INVALID");
    }
    let trusted = false;
    const publicKeyPem = trustedPublicKeys instanceof Map
      ? trustedPublicKeys.get(body.provider.keyId) : trustedPublicKeys?.[body.provider.keyId];
    if (publicKeyPem) {
      const publicKey = createPublicKey(publicKeyPem);
      const actualKeyId = digest(publicKey.export({ type: "spki", format: "der" }));
      if (actualKeyId !== body.provider.keyId) throw new Error("RUN_CENSUS_ANCHOR_KEY_ID_MISMATCH");
      trusted = cryptoVerify(null, Buffer.from(receiptSigningPayload(body)), publicKey,
        Buffer.from(body.signature.value, "base64"));
    } else if (typeof externalVerifier === "function") {
      /* A callback is only a plugin transport. It cannot turn record-owned
         fields into trust: the caller must pin an out-of-record verifier
         identity and the verifier must echo that exact pin in its decision. */
      if (!HASH.test(String(externalVerifierPin ?? ""))) {
        throw new Error("RUN_CENSUS_EXTERNAL_VERIFIER_PIN_REQUIRED");
      }
      const decision = externalVerifier({ receipt, signingPayload: receiptSigningPayload(body),
        verifierPin: externalVerifierPin });
      trusted = decision?.ok === true && decision.verifierPin === externalVerifierPin;
    }
    if (!trusted) throw new Error("RUN_CENSUS_EXTERNAL_RECEIPT_UNTRUSTED");
    return { ok: true, external: true, independent: false,
      assurance: EXTERNAL_ASSURANCE,
      trustBoundary: "PINNED_SIGNATURE_IDENTITY_ONLY_PROVIDER_INDEPENDENCE_NOT_PROVEN",
      providerId: body.provider.providerId, keyId: body.provider.keyId,
      receiptHash, anchorCommitmentHash: commitment.anchorCommitmentHash };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export function importExternalAnchorReceipt(options = {}) {
  const checked = verifyAnchorReceipt(options);
  if (!checked.ok) throw new Error(checked.error);
  if (!checked.external) throw new Error("RUN_CENSUS_LOCAL_RECEIPT_NOT_EXTERNAL_ANCHOR");
  return underLock(options.stateRoot, (paths) => {
    const file = path.join(paths.receipts,
      `${checked.receiptHash.slice("sha256:".length)}.json`);
    const serialized = `${JSON.stringify(options.receipt, null, 2)}\n`;
    if (existsSync(file)) {
      if (readFileSync(file, "utf8") !== serialized) {
        throw new Error("RUN_CENSUS_ANCHOR_RECEIPT_CONFLICT");
      }
      return { ...checked, file, idempotent: true };
    }
    atomicCreate(file, serialized, paths);
    return { ...checked, file, idempotent: false };
  });
}

function assertExternalTrustPolicyPin(trustPolicy, trustedPolicyHash) {
  if (!HASH.test(String(trustedPolicyHash ?? ""))) {
    throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_POLICY_PIN_REQUIRED");
  }
  if (trustPolicy?.policyHash !== trustedPolicyHash) {
    throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_POLICY_PIN_MISMATCH");
  }
}

function providerNeutralAnchorVerification({ stateRoot, commitment, request, evidence,
  policy, trustPolicy, trustedPolicyHash, opensslPath, scittVerifier }) {
  assertExternalTrustPolicyPin(trustPolicy, trustedPolicyHash);
  const censusCommitment = verifyCensusAnchorCommitment({ stateRoot, commitment, policy });
  if (!censusCommitment.ok) throw new Error(censusCommitment.error);
  if (request?.anchorCommitmentHash !== commitment?.anchorCommitmentHash
    || request?.anchorPolicyHash !== commitment?.anchorPolicyHash) {
    throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_REQUEST_COMMITMENT_MISMATCH");
  }
  const checked = verifyExternalAnchorEvidence({ request, evidence, trustPolicy,
    opensslPath, scittVerifier });
  if (!checked.ok) throw new Error(checked.error);
  if (checked.policyHash !== trustedPolicyHash
    || !PROVIDER_NEUTRAL_ANCHOR_ASSURANCES.has(checked.assurance)
    || checked.verificationDecisionAccepted !== true
    || typeof checked.builtInCryptographicVerification !== "boolean"
    || checked.cryptographicArtifactVerified
      !== checked.builtInCryptographicVerification
    || (checked.builtInCryptographicVerification
      ? checked.assurance !== PROVIDER_ANCHOR_ASSURANCE.CRYPTOGRAPHIC_ONLY
      : checked.assurance !== PROVIDER_ANCHOR_ASSURANCE.VERIFICATION_DECISION_ONLY)
    || checked.independent !== false
    || checked.operatorIndependenceEstablished !== false
    || !Object.values(ANCHOR_OPERATOR_RELATIONSHIPS)
      .includes(checked.operatorRelationshipClaimed)
    || typeof checked.remoteClaimed !== "boolean"
    || checked.remoteClaimed !== (checked.operatorRelationshipClaimed
      !== ANCHOR_OPERATOR_RELATIONSHIPS.LOCAL_SELF)
    || checked.trustBoundary
      !== "CALLER_SUPPLIED_POLICY_AND_TRUST_ROOT_NO_MAINTAINER_EXTERNAL_REGISTRY") {
    throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_VERIFICATION_SEMANTICS_INVALID");
  }
  return checked;
}

function independentAnchorBinding(commitment, checked) {
  return withHash({
    schema: "outsider/census-independent-anchor-binding/v1",
    ledgerId: commitment.ledgerId,
    anchorCommitmentHash: commitment.anchorCommitmentHash,
    requestHash: checked.requestHash,
    providerId: checked.providerId,
    trustPolicyHash: checked.policyHash,
  }, "bindingHash");
}

function independentAnchorProjection(checked) {
  return withHash({
    /* The schema name is retained for persisted v1 compatibility only. These
       fields are the authority boundary; the legacy label is not evidence of
       provider externality or operator independence. */
    schema: "outsider/census-independent-anchor-verification/v1",
    requestHash: checked.requestHash,
    evidenceHash: checked.evidenceHash,
    trustPolicyHash: checked.policyHash,
    providerId: checked.providerId,
    verificationDecisionAccepted: checked.verificationDecisionAccepted,
    builtInCryptographicVerification: checked.builtInCryptographicVerification,
    cryptographicArtifactVerified: checked.cryptographicArtifactVerified,
    externalAnchorBundleVerified: true,
    providerExternalityEstablished: false,
    operatorRelationshipClaimed: checked.operatorRelationshipClaimed,
    remoteClaimed: checked.remoteClaimed,
    independent: false,
    operatorIndependenceEstablished: false,
    externalPreselectionEstablished: false,
    assurance: checked.assurance,
    trustBoundary: checked.trustBoundary,
    independenceBasis: checked.independenceBasis,
    proof: checked.proof,
  }, "verificationHash");
}

function makeIndependentAnchorBundle({ commitment, request, evidence,
  trustedPolicyHash, checked }) {
  const binding = independentAnchorBinding(commitment, checked);
  const body = {
    schema: "outsider/census-independent-anchor-bundle/v1",
    commitment,
    request,
    evidence,
    binding,
    trustPolicyReference: {
      policyHash: trustedPolicyHash,
      policyEmbedded: false,
      verificationRequirement:
        "OUT_OF_RECORD_POLICY_AND_PIN_REQUIRED_ON_EVERY_IMPORT_AND_VERIFY",
    },
    verification: independentAnchorProjection(checked),
  };
  return withHash(body, "bundleHash");
}

function assertIndependentAnchorBundleShape(bundle) {
  if (!exactKeys(bundle, ["schema", "commitment", "request", "evidence", "binding",
    "trustPolicyReference", "verification", "bundleHash"])) {
    throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_BUNDLE_SHAPE_INVALID");
  }
  const { bundleHash, ...body } = bundle;
  if (body.schema !== "outsider/census-independent-anchor-bundle/v1"
    || !HASH.test(String(bundleHash ?? "")) || bundleHash !== digest(body)
    || !exactKeys(body.trustPolicyReference,
      ["policyHash", "policyEmbedded", "verificationRequirement"])
    || !HASH.test(String(body.trustPolicyReference.policyHash ?? ""))
    || body.trustPolicyReference.policyEmbedded !== false
    || body.trustPolicyReference.verificationRequirement
      !== "OUT_OF_RECORD_POLICY_AND_PIN_REQUIRED_ON_EVERY_IMPORT_AND_VERIFY") {
    throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_BUNDLE_INVALID");
  }
}

/**
 * Re-verify a persisted provider-neutral anchor bundle. The trust policy is
 * intentionally absent from the bundle. Both it and its separately stored
 * hash pin are mandatory inputs on every call. Caller-selected trust material
 * can validate an artifact or verifier decision, but cannot establish that the
 * provider is external to the operator or independently governed.
 */
export function verifyCensusExternalAnchorBundle({ stateRoot, bundle,
  policy = defaultAnchorPolicy(), trustPolicy, trustedPolicyHash,
  opensslPath = "/usr/bin/openssl", scittVerifier = null } = {}) {
  try {
    assertExternalTrustPolicyPin(trustPolicy, trustedPolicyHash);
    assertIndependentAnchorBundleShape(bundle);
    if (bundle.trustPolicyReference.policyHash !== trustedPolicyHash) {
      throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_BUNDLE_POLICY_MISMATCH");
    }
    const checked = providerNeutralAnchorVerification({ stateRoot,
      commitment: bundle.commitment, request: bundle.request, evidence: bundle.evidence,
      policy, trustPolicy, trustedPolicyHash, opensslPath, scittVerifier });
    const expectedBinding = independentAnchorBinding(bundle.commitment, checked);
    if (canonicalizeStrict(bundle.binding) !== canonicalizeStrict(expectedBinding)) {
      throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_BINDING_MISMATCH");
    }
    const expectedVerification = independentAnchorProjection(checked);
    if (canonicalizeStrict(bundle.verification) !== canonicalizeStrict(expectedVerification)) {
      throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_VERIFICATION_MISMATCH");
    }
    return {
      ok: true,
      external: false,
      externalAnchorBundleVerified: true,
      providerExternalityEstablished: false,
      verificationDecisionAccepted: checked.verificationDecisionAccepted,
      builtInCryptographicVerification: checked.builtInCryptographicVerification,
      cryptographicArtifactVerified: checked.cryptographicArtifactVerified,
      operatorRelationshipClaimed: checked.operatorRelationshipClaimed,
      remoteClaimed: checked.remoteClaimed,
      independent: false,
      operatorIndependenceEstablished: false,
      externalPreselectionEstablished: false,
      assurance: checked.assurance,
      trustBoundary: checked.trustBoundary,
      independenceBasis: checked.independenceBasis,
      providerId: checked.providerId,
      trustedPolicyHash,
      bindingHash: expectedBinding.bindingHash,
      bundleHash: bundle.bundleHash,
      anchorCommitmentHash: bundle.commitment.anchorCommitmentHash,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/**
 * Import a policy-pinned anchor artifact or verifier decision into the census'
 * private receipt directory. Import verifies the bundle, not provider
 * externality or operator independence. The stable binding filename makes an
 * exact replay idempotent and treats a different artifact for the same
 * commitment, request, provider and policy as a conflict.
 */
export function importCensusExternalAnchorEvidence({ stateRoot, commitment, request, evidence,
  policy = defaultAnchorPolicy(), trustPolicy, trustedPolicyHash,
  opensslPath = "/usr/bin/openssl", scittVerifier = null } = {}) {
  const checked = providerNeutralAnchorVerification({ stateRoot, commitment, request, evidence,
    policy, trustPolicy, trustedPolicyHash, opensslPath, scittVerifier });
  const bundle = makeIndependentAnchorBundle({ commitment, request, evidence,
    trustedPolicyHash, checked });
  const serialized = `${canonicalizeStrict(bundle)}\n`;
  return underLock(stateRoot, (paths) => {
    const file = path.join(paths.receipts,
      `independent-${bundle.binding.bindingHash.slice("sha256:".length)}.json`);
    if (existsSync(file)) {
      assertPrivateFile(file, "RUN_CENSUS_EXTERNAL_ANCHOR_FILE");
      if (readFileSync(file, "utf8") !== serialized) {
        throw new Error("RUN_CENSUS_EXTERNAL_ANCHOR_CONFLICT");
      }
      return { ...checked, external: false, externalAnchorBundleVerified: true,
        providerExternalityEstablished: false, independent: false,
        operatorIndependenceEstablished: false, externalPreselectionEstablished: false,
        bindingHash: bundle.binding.bindingHash, bundleHash: bundle.bundleHash,
        bundle, file, idempotent: true };
    }
    atomicCreate(file, serialized, paths);
    return { ...checked, external: false, externalAnchorBundleVerified: true,
      providerExternalityEstablished: false, independent: false,
      operatorIndependenceEstablished: false, externalPreselectionEstablished: false,
      bindingHash: bundle.binding.bindingHash, bundleHash: bundle.bundleHash,
      bundle, file, idempotent: false };
  });
}

export { ENTRY_GENESIS as RUN_CENSUS_GENESIS, EXTERNAL_ASSURANCE, LOCAL_ASSURANCE,
  REQUIRED_EXTERNAL_ANCHOR_ASSURANCE };
