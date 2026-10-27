/*
 * Outcome Formation offline diagnostic v1.
 *
 * This is the deliberately narrow offline operator entry point for the first
 * Outcome Formation Engine slice.  It accepts one private, canonical JSON
 * file, replays the supplied source records through the foundation bridge,
 * and emits only a bounded HOLD summary.  It has no network, callback,
 * action, authority, capacity, custody, pricing, guarantee, settlement, or
 * human-queue capability.
 */

import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

import { canonicalizeStrict } from "./canonical.js";
import {
  createOutcomeFormationFoundationBoundEvaluationV1,
  verifyOutcomeFormationFoundationBoundEvaluationV1,
} from "./outsider-outcome-formation-foundation-replay-v1.js";

const MAX_INPUT_BYTES = 2_097_152;
const MAX_GAP_CODES = 64;
const MAX_GAP_CODE_LENGTH = 128;
const SAFE_GAP_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const INPUT_FIELDS = Object.freeze(["schema", "source"]);
const INPUT_SCHEMA = "outsider/outcome-formation-offline-diagnostic-input/v1";
const OUTPUT_SCHEMA = "outsider/outcome-formation-offline-diagnostic-summary/v1";
const NOFOLLOW = fsConstants.O_NOFOLLOW;
const OPEN_FLAGS = fsConstants.O_RDONLY
  | (fsConstants.O_CLOEXEC ?? 0)
  | (NOFOLLOW ?? 0);

export const OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1 = Object.freeze({
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  maximumInputBytes: MAX_INPUT_BYTES,
  canonicalJsonRequired: true,
  privateFileRequired: true,
  requiredFileMode: "0600",
  uniqueLinkRequired: true,
  targetNoFollowRequired: true,
  ancestorSymlinksPermitted: false,
  jsonWitnessReplaySupported: false,
  jsonActionObligationReplaySupported: false,
  sourceReplayRequired: true,
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  consequenceReach: "NONE",
  networkIoPerformed: false,
  callbacksAccepted: false,
  humanFallbackPermitted: false,
  moneyMovementEnabled: false,
});

function fail(code) {
  throw new TypeError(`OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1_${code}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object"
    && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, fields, code) {
  if (!isPlainObject(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function sameFile(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.gid === right.gid
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function sameDirectory(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.uid === right.uid
    && left.gid === right.gid;
}

function pathSnapshots(absolute) {
  const parsed = path.parse(absolute);
  const parts = absolute.slice(parsed.root.length).split(path.sep)
    .filter((part) => part.length > 0);
  const snapshots = [];
  let cursor = parsed.root;
  const rootStatus = lstatSync(cursor, { bigint: true });
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    fail("ANCESTOR_INVALID");
  }
  snapshots.push({ target: cursor, status: rootStatus });
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = path.join(cursor, parts[index]);
    const status = lstatSync(cursor, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()) {
      fail("ANCESTOR_INVALID");
    }
    snapshots.push({ target: cursor, status });
  }
  return snapshots;
}

function verifyPathSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    const observed = lstatSync(snapshot.target, { bigint: true });
    if (!observed.isDirectory() || observed.isSymbolicLink()
      || !sameDirectory(snapshot.status, observed)) {
      fail("ANCESTOR_CHANGED");
    }
  }
}

function validateLeaf(status) {
  const currentUid = typeof process.getuid === "function"
    ? BigInt(process.getuid()) : null;
  if (!status.isFile() || status.isSymbolicLink()
    || status.size < 1n || status.size > BigInt(MAX_INPUT_BYTES)
    || (status.mode & 0o777n) !== 0o600n
    || status.nlink !== 1n
    || currentUid !== null && status.uid !== currentUid) {
    fail("PRIVATE_INPUT_FILE_INVALID");
  }
}

/**
 * Read one exact private file while binding the bytes to the lstat/open/fstat
 * identity and to the same non-symlink ancestor chain before and after read.
 */
function readPrivateCanonicalFormationInputInternal(inputPath) {
  if (typeof inputPath !== "string" || inputPath.length < 1
    || inputPath.includes("\0") || NOFOLLOW === undefined || NOFOLLOW === 0) {
    fail("INPUT_PATH_INVALID");
  }
  const absolute = path.resolve(inputPath);
  const ancestors = pathSnapshots(absolute);
  const initialRealPath = realpathSync(absolute);
  if (initialRealPath !== absolute) fail("INPUT_PATH_NOT_CANONICAL");
  const initial = lstatSync(absolute, { bigint: true });
  validateLeaf(initial);

  let descriptor;
  try {
    descriptor = openSync(absolute, OPEN_FLAGS);
    const before = fstatSync(descriptor, { bigint: true });
    validateLeaf(before);
    if (!sameFile(initial, before)) fail("INPUT_CHANGED_BEFORE_READ");

    const expectedBytes = Number(before.size);
    const bytes = Buffer.alloc(expectedBytes);
    let offset = 0;
    while (offset < expectedBytes) {
      const count = readSync(descriptor, bytes, offset,
        expectedBytes - offset, offset);
      if (count < 1) fail("INPUT_SHORT_READ");
      offset += count;
    }
    const extra = Buffer.alloc(1);
    if (readSync(descriptor, extra, 0, 1, expectedBytes) !== 0) {
      fail("INPUT_LONG_READ");
    }

    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(absolute, { bigint: true });
    if (!sameFile(before, after) || !sameFile(before, finalPath)
      || realpathSync(absolute) !== absolute) {
      fail("INPUT_CHANGED_DURING_READ");
    }
    verifyPathSnapshots(ancestors);

    let text;
    let value;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      value = JSON.parse(text);
    } catch {
      fail("INPUT_JSON_INVALID");
    }
    let canonical;
    try {
      canonical = canonicalizeStrict(value);
    } catch {
      fail("INPUT_JSON_INVALID");
    }
    if (text !== canonical) fail("INPUT_JSON_NOT_CANONICAL");
    exactObject(value, INPUT_FIELDS, "INPUT");
    if (value.schema !== INPUT_SCHEMA) fail("INPUT_SCHEMA_INVALID");
    if (!isPlainObject(value.source)) fail("SOURCE_INVALID");
    return value;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function readPrivateCanonicalFormationInputV1(inputPath) {
  try {
    return readPrivateCanonicalFormationInputInternal(inputPath);
  } catch (error) {
    if (error instanceof TypeError
      && /^OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1_[A-Z0-9_]+$/u
        .test(error.message)) {
      throw error;
    }
    fail("INPUT_REJECTED");
  }
}

function validateJsonBridgeBoundary(source) {
  /* Registry instances, byte buffers, and obligation filesystem paths do not
     belong in this JSON-only entry point.  Their dedicated replay APIs must be
     invoked before a later, explicitly versioned diagnostic can bind them. */
  if (source.networkOutcomeWitnessReplay !== null
    || source.actionObligationHoldCompositionInput !== null) {
    fail("OPAQUE_OR_FILESYSTEM_REPLAY_INPUT_FORBIDDEN");
  }
  for (const field of ["tender", "ownerMandate", "providerAcceptance",
    "capacityReservationReceipt", "autonomousWorkOrder",
    "actionAdmissionReplay", "attemptSetReplay"]) {
    if (!isPlainObject(source[field])) fail("REQUIRED_SOURCE_RECORD_MISSING");
  }
}

function safeGapCodes(value) {
  if (!Array.isArray(value) || value.length > MAX_GAP_CODES) {
    fail("GAP_CODES_INVALID");
  }
  const result = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > MAX_GAP_CODE_LENGTH
      || !SAFE_GAP_CODE.test(item)) fail("GAP_CODES_INVALID");
    result.push(item);
  }
  return Object.freeze(result);
}

function assertHoldBoundary(record, verification) {
  const evaluation = record.formationEvaluation;
  const boundaries = [record, verification, record.foundationReplay, evaluation];
  for (const value of boundaries) {
    if (value.decisionState !== "HOLD" || value.authority !== "NONE"
      || value.actionReady !== false || value.executable !== false
      || value.consequenceReach !== "NONE") fail("HOLD_BOUNDARY_INVALID");
  }
  if (verification.ok !== true || verification.sourceRecordsReplayed !== true
    || verification.engineEvaluationRederived !== true
    || verification.holdBoundaryVerified !== true
    || record.foundationReplay.tenderAssessment.verifierOk !== true
    || record.foundationReplay
      .allCoreFoundationRecordsRederivedAndCrossBound !== true
    || evaluation.oneUseAssessment.structuralVerificationOk !== true
    || evaluation.oneUseAssessment.crossBoundToTender !== true
    || record.boundary.networkIoPerformed !== false
    || record.boundary.callbackInvoked !== false
    || record.boundary.humanFallbackPermitted !== false
    || evaluation.operationalBoundary.zeroInternalOps !== true
    || evaluation.operationalBoundary.outsiderStaffInterventionsAllowed !== 0
    || evaluation.operationalBoundary.humanQueueFallbackAllowed !== false
    || evaluation.operationalBoundary.providerDiscoveryPerformed !== false
    || evaluation.operationalBoundary.providerContactPerformed !== false
    || evaluation.operationalBoundary.manualRecoveryPerformed !== false
    || evaluation.authorityBoundary.cEnabledSubsetAProven !== true
    || evaluation.authorityBoundary.enabledCapabilityCount !== 0
    || evaluation.economicBoundary.priceEstablished !== false
    || evaluation.economicBoundary.guaranteeCreated !== false
    || evaluation.economicBoundary.settlementPermitted !== false
    || evaluation.economicBoundary.moneyMovementEnabled !== false) {
    fail("HOLD_BOUNDARY_INVALID");
  }
}

/** Replay the bridge and return only a non-sensitive, bounded HOLD summary. */
export function evaluateOutcomeFormationOfflineDiagnosticV1(inputPath) {
  const input = readPrivateCanonicalFormationInputV1(inputPath);
  validateJsonBridgeBoundary(input.source);
  const record = createOutcomeFormationFoundationBoundEvaluationV1(input.source);
  const verification = verifyOutcomeFormationFoundationBoundEvaluationV1(
    record, {
      source: input.source,
      expectedFoundationBoundEvaluationHash:
        record.foundationBoundEvaluationHash,
    });
  assertHoldBoundary(record, verification);
  const evaluation = record.formationEvaluation;
  return Object.freeze({
    schema: OUTPUT_SCHEMA,
    diagnosticVerificationOk: true,
    sourceRecordsReplayed: true,
    engineEvaluationRederived: true,
    coreFoundationRecordsRederivedAndCrossBound:
      record.foundationReplay.allCoreFoundationRecordsRederivedAndCrossBound,
    allRequiredFormationFoundationsReplayed: false,
    tenderStructurallyVerified:
      record.foundationReplay.tenderAssessment.verifierOk,
    oneUseBindingsStructurallyVerified:
      evaluation.oneUseAssessment.structuralVerificationOk,
    externalCapacityEstablished: false,
    externalTrustEstablished: false,
    independentOutcomeTruthEstablished: false,
    gapCodes: safeGapCodes([
      ...record.foundationReplay.gapCodes,
      ...evaluation.gapCodes,
    ]),
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    cEnabledSubsetAProven: true,
    priceEstablished: false,
    guaranteeCreated: false,
    settlementPermitted: false,
    moneyMovementEnabled: false,
    networkIoPerformed: false,
    providerDiscoveryPerformed: false,
    providerContactPerformed: false,
    liveActionPerformed: false,
    internalManualOperationsPerformed: false,
    humanFallbackPermitted: false,
  });
}

export function outcomeFormationOfflineDiagnosticFailureV1() {
  return Object.freeze({
    schema: OUTPUT_SCHEMA,
    diagnosticVerificationOk: false,
    sourceRecordsReplayed: false,
    engineEvaluationRederived: false,
    coreFoundationRecordsRederivedAndCrossBound: false,
    allRequiredFormationFoundationsReplayed: false,
    tenderStructurallyVerified: false,
    oneUseBindingsStructurallyVerified: false,
    externalCapacityEstablished: false,
    externalTrustEstablished: false,
    independentOutcomeTruthEstablished: false,
    gapCodes: Object.freeze(["INPUT_OR_SOURCE_REPLAY_REJECTED"]),
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    cEnabledSubsetAProven: true,
    priceEstablished: false,
    guaranteeCreated: false,
    settlementPermitted: false,
    moneyMovementEnabled: false,
    networkIoPerformed: false,
    providerDiscoveryPerformed: false,
    providerContactPerformed: false,
    liveActionPerformed: false,
    internalManualOperationsPerformed: false,
    humanFallbackPermitted: false,
  });
}
