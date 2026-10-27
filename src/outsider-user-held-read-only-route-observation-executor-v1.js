/*
 * User-held, seller-neutral read-only route observation executor v1.
 *
 * The central formation broker receives the existing generic user-held job
 * projection only.  A URL, seller identity, destination, private parameters,
 * raw response bytes, and every unkeyed local digest stay inside the user
 * node.  The injected machine adapter can produce only a read-only source
 * observation.  Raw bytes are durably stored before the local source
 * occurrence and result receipt are sealed.
 *
 * This module does not issue or reinterpret the network typed-graph Attempt.
 * Its caller must bind graphRefs.attemptHash to USER_HELD_ROUTE_OBSERVATION /
 * READ_ONLY_SOURCE_OBSERVATION semantics before creating the composition.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { formationJobIdentityV1 }
  from "./outsider-formation-job-worker-v1.js";
import { createUserHeldFormationPrivateBindingV1 }
  from "./outsider-user-held-formation-executor-protocol-v1.js";

const PREFIX
  = "OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_PRIVATE_ENVELOPE_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const ADAPTER_ID = "user-held-read-only-route-observation";
const ADAPTER_VERSION = "1.0.0";
const OPERATION = "READ_ONLY_SOURCE_OBSERVATION";
const ATTEMPT_KIND = "USER_HELD_ROUTE_OBSERVATION";
const SOURCE_STATES = Object.freeze([
  "OBSERVED", "NOT_FOUND", "UNAVAILABLE",
]);
const SOURCE_DECLARATION_CLASSES = Object.freeze([
  "ROUTE_OBSERVATION", "PUBLISHED_OFFER", "QUOTE", "ATP", "ACK",
  "RECEIPT", "OTHER_SOURCE_DECLARATION",
]);
const MACHINE_ADAPTERS = new WeakMap();

export const
  OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
  = Object.freeze({
    machineAdapter:
      "outsider/user-held-read-only-route-observation-machine-adapter/v1",
    machineCommand:
      "outsider/private-user-held-read-only-route-machine-command/v1",
    plan: "outsider/user-held-read-only-route-observation-plan/v1",
    localExecutionMarker:
      "outsider/private-user-held-read-only-route-local-execution-marker/v1",
    sourceOccurrence:
      "outsider/private-user-held-read-only-route-source-occurrence/v1",
    resultReceipt:
      "outsider/private-user-held-read-only-route-result-receipt/v1",
    compositionProjection:
      "outsider/private-user-held-read-only-route-observation-composition/v1",
  });

export const
  OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_BOUNDARY
  = Object.freeze({
    position: "USER_HELD_ROUTE_OBSERVATION_EXECUTOR",
    centralProtocol: "outsider/user-held-formation-executor-protocol/v1",
    adapterBinding: Object.freeze({ adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION }),
    sellerSpecificCentralLogic: false,
    supportedSellerScope: "ANY_MACHINE_ADAPTER",
    privateEnvelopeOpaqueToCentral: true,
    urlProjectedToCentral: false,
    destinationProjectedToCentral: false,
    providerIdentityProjectedToCentral: false,
    piiProjectedToCentral: false,
    rawSourceProjectedToCentral: false,
    unkeyedPrivateHashesProjectedToCentral: false,
    permittedExternalEffect: "READ_ONLY",
    writeMethodsPermitted: false,
    browserOrMouseRequired: false,
    paymentAllowed: false,
    orderAllowed: false,
    shippingApplicationAllowed: false,
    typedGraphAttemptIssuedByThisModule: false,
    requiredAttemptKind: ATTEMPT_KIND,
    requiredExecutionClass: OPERATION,
    sellerReceiptEstablishesCapacity: false,
    atpEstablishesCapacity: false,
    acknowledgementEstablishesAuthority: false,
    executorReceiptEstablishesIndependentOutcomeTruth: false,
    capacityReserved: false,
    authorityMinted: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function bytes(value, code, maximum) {
  if (!Buffer.isBuffer(value) || value.length < 1 || value.length > maximum) {
    fail(`${code}_INVALID`);
  }
  return Buffer.from(value);
}

function bytesHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function privateRoot(value) {
  if (typeof value !== "string" || value === "") fail("PRIVATE_ROOT_INVALID");
  const absolute = realpathSync(path.resolve(value));
  const info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("PRIVATE_ROOT_NOT_PRIVATE");
  return absolute;
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("ARTIFACT_DIRECTORY_NOT_PRIVATE");
  return directory;
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writePrivateBytesOnce(file, value) {
  const payload = Buffer.from(value);
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let offset = 0;
    while (offset < payload.length) {
      offset += writeSync(descriptor, payload, offset, payload.length - offset);
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  syncDirectory(path.dirname(file));
  return Object.freeze({ bytes: payload.length, bytesHash: bytesHash(payload) });
}

function writePrivateJsonOnce(file, value) {
  return writePrivateBytesOnce(file,
    Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"));
}

function readPrivateBytes(file, code, maximum) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 1
    || info.size > maximum) fail(`${code}_NOT_PRIVATE`);
  return readFileSync(file);
}

function readPrivateJson(file, code) {
  const raw = readPrivateBytes(file, code, MAX_SOURCE_BYTES);
  const source = raw.toString("utf8");
  let value;
  try { value = JSON.parse(source); } catch { fail(`${code}_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== source) fail(`${code}_NOT_CANONICAL`);
  return Object.freeze({ value, bytes: raw, bytesHash: bytesHash(raw) });
}

function sealed(value, schema, field, code) {
  if (value?.schema !== schema || !HASH.test(String(value?.[field] ?? ""))) {
    fail(`${code}_SCHEMA_INVALID`);
  }
  const { [field]: claimed, ...body } = value;
  if (claimed !== digest(schema, body)) fail(`${code}_HASH_INVALID`);
  return value;
}

function sourceExpiry(value, observedAt, expiresAt) {
  if (value === null) return null;
  const selected = instant(value, "SOURCE_EXPIRES_AT");
  if (Date.parse(selected) <= Date.parse(observedAt)
    || Date.parse(selected) > Date.parse(expiresAt)) {
    fail("SOURCE_EXPIRY_OUTSIDE_JOB_WINDOW");
  }
  return selected;
}

function normalizeMachineObservation(value, observedAt, expiresAt) {
  exact(value, ["rawSourceBytes", "sourceState", "sourceDeclarationClass",
    "sourceExpiresAt"], "MACHINE_OBSERVATION");
  if (!SOURCE_STATES.includes(value.sourceState)) {
    fail("SOURCE_STATE_INVALID");
  }
  if (!SOURCE_DECLARATION_CLASSES.includes(value.sourceDeclarationClass)) {
    fail("SOURCE_DECLARATION_CLASS_INVALID");
  }
  return Object.freeze({
    rawSourceBytes: bytes(value.rawSourceBytes, "RAW_SOURCE_BYTES",
      MAX_SOURCE_BYTES),
    sourceState: value.sourceState,
    sourceDeclarationClass: value.sourceDeclarationClass,
    sourceExpiresAt: sourceExpiry(value.sourceExpiresAt, observedAt, expiresAt),
  });
}

function outcomeForSourceState(sourceState) {
  if (sourceState === "OBSERVED") return Object.freeze({ state: "HOLD",
    reasonCode: "READ_ONLY_ROUTE_OBSERVATION_RECORDED" });
  if (sourceState === "NOT_FOUND") return Object.freeze({ state: "UNAVAILABLE",
    reasonCode: "READ_ONLY_ROUTE_NOT_FOUND" });
  return Object.freeze({ state: "UNAVAILABLE",
    reasonCode: "READ_ONLY_ROUTE_UNAVAILABLE" });
}

function executorResultFromReceipt(receipt) {
  return Object.freeze({
    state: receipt.state,
    reasonCode: receipt.reasonCode,
    resultHash: receipt.receiptHash,
    sourceOccurrenceHashes: Object.freeze([receipt.sourceOccurrenceHash]),
    externalEffect: "READ_ONLY",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function noEffectResult(state, reasonCode, domain, jobHash) {
  return Object.freeze({ state, reasonCode,
    resultHash: digest(domain, { jobHash }),
    sourceOccurrenceHashes: Object.freeze([]), externalEffect: "NONE",
    retryDisposition: "DO_NOT_RETRY" });
}

function incompleteResult(jobHash, planHash) {
  return Object.freeze({
    state: "HOLD",
    reasonCode: "READ_ONLY_ROUTE_OBSERVATION_LOCAL_EVIDENCE_INCOMPLETE",
    resultHash: digest(
      "outsider/user-held-read-only-route-observation-incomplete/v1",
      { jobHash, planHash }),
    sourceOccurrenceHashes: Object.freeze([]),
    externalEffect: "READ_ONLY",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function artifactPaths(runDirectory) {
  return Object.freeze({
    marker: path.join(runDirectory, "local-execution-marker.v1.json"),
    raw: path.join(runDirectory, "source.v1.bin"),
    occurrence: path.join(runDirectory, "source-occurrence.v1.json"),
    receipt: path.join(runDirectory, "result-receipt.v1.json"),
  });
}

function replayLocalResult(runDirectory, identity, planHash,
  adapterInstanceRefHash) {
  if (!existsSync(runDirectory)) return null;
  const info = lstatSync(runDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("RUN_DIRECTORY_NOT_PRIVATE");
  const paths = artifactPaths(runDirectory);
  if (!existsSync(paths.receipt)) return Object.freeze({ incomplete: true });
  const expected = ["local-execution-marker.v1.json", "result-receipt.v1.json",
    "source-occurrence.v1.json", "source.v1.bin"];
  const observed = readdirSync(runDirectory).sort();
  if (canonicalizeStrict(observed) !== canonicalizeStrict(expected)) {
    fail("REPLAY_ARTIFACT_SET_INVALID");
  }
  const markerValue = readPrivateJson(paths.marker,
    "LOCAL_EXECUTION_MARKER").value;
  exact(markerValue, ["schema", "schemaVersion", "jobHash", "planHash",
    "adapterInstanceRefHash", "privateEnvelopeHash", "attemptKind",
    "executionClass", "observedAt", "externalEffectCeiling",
    "typedGraphAttemptIssued", "markerHash"], "LOCAL_EXECUTION_MARKER");
  const marker = sealed(markerValue,
  OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
    .localExecutionMarker, "markerHash", "LOCAL_EXECUTION_MARKER");
  const occurrenceValue = readPrivateJson(paths.occurrence,
    "SOURCE_OCCURRENCE").value;
  exact(occurrenceValue, ["schema", "schemaVersion", "jobHash", "planHash",
    "adapterInstanceRefHash", "operation", "sourceState",
    "sourceDeclarationClass", "sourceBytesHash", "sourceBytesLength",
    "observedAt", "sourceExpiresAt", "externalEffect", "rawSourceProjected",
    "providerIdentityProjected", "destinationProjected", "capacityReserved",
    "authorityMinted", "independentOutcomeTruthEstablished",
    "outcomeCommitted", "occurrenceHash"], "SOURCE_OCCURRENCE");
  const occurrence = sealed(occurrenceValue,
  OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
    .sourceOccurrence, "occurrenceHash", "SOURCE_OCCURRENCE");
  const receiptValue = readPrivateJson(paths.receipt, "RESULT_RECEIPT").value;
  exact(receiptValue, ["schema", "schemaVersion", "jobHash", "planHash",
    "sourceOccurrenceHash", "sourceState", "state", "reasonCode",
    "externalEffect", "retryDisposition", "rawSourceProjected",
    "unkeyedSourceHashProjected", "capacityReserved", "authorityMinted",
    "independentOutcomeTruthEstablished", "outcomeCommitted", "receiptHash"],
  "RESULT_RECEIPT");
  const receipt = sealed(receiptValue,
  OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
    .resultReceipt, "receiptHash", "RESULT_RECEIPT");
  const raw = readPrivateBytes(paths.raw, "RAW_SOURCE", MAX_SOURCE_BYTES);
  if (marker.schemaVersion !== "1.0.0"
    || occurrence.schemaVersion !== "1.0.0"
    || receipt.schemaVersion !== "1.0.0"
    || !SOURCE_STATES.includes(occurrence.sourceState)
    || !SOURCE_DECLARATION_CLASSES.includes(
      occurrence.sourceDeclarationClass)) fail("REPLAY_SCHEMA_INVALID");
  const markerObservedAt = instant(marker.observedAt, "REPLAY_OBSERVED_AT");
  if (Date.parse(markerObservedAt) < Date.parse(identity.job.issuedAt)
    || Date.parse(markerObservedAt) >= Date.parse(identity.job.expiresAt)) {
    fail("REPLAY_OBSERVATION_OUTSIDE_JOB_WINDOW");
  }
  const expectedOutcome = outcomeForSourceState(occurrence.sourceState);
  if (marker.jobHash !== identity.jobHash || marker.planHash !== planHash
    || marker.adapterInstanceRefHash !== adapterInstanceRefHash
    || marker.attemptKind !== ATTEMPT_KIND
    || marker.executionClass !== OPERATION
    || marker.privateEnvelopeHash !== identity.job.parameterEnvelopeHash
    || marker.externalEffectCeiling !== "READ_ONLY"
    || marker.typedGraphAttemptIssued !== false
    || occurrence.jobHash !== identity.jobHash
    || occurrence.planHash !== planHash
    || occurrence.adapterInstanceRefHash !== adapterInstanceRefHash
    || occurrence.operation !== OPERATION
    || occurrence.observedAt !== marker.observedAt
    || occurrence.sourceBytesHash !== bytesHash(raw)
    || occurrence.sourceBytesLength !== raw.length
    || occurrence.externalEffect !== "READ_ONLY"
    || occurrence.rawSourceProjected !== false
    || occurrence.providerIdentityProjected !== false
    || occurrence.destinationProjected !== false
    || occurrence.capacityReserved !== false
    || occurrence.authorityMinted !== false
    || occurrence.independentOutcomeTruthEstablished !== false
    || occurrence.outcomeCommitted !== false
    || receipt.jobHash !== identity.jobHash || receipt.planHash !== planHash
    || receipt.sourceOccurrenceHash !== occurrence.occurrenceHash
    || receipt.sourceState !== occurrence.sourceState
    || receipt.state !== expectedOutcome.state
    || receipt.reasonCode !== expectedOutcome.reasonCode
    || receipt.externalEffect !== "READ_ONLY"
    || receipt.retryDisposition !== "DO_NOT_RETRY"
    || receipt.rawSourceProjected !== false
    || receipt.unkeyedSourceHashProjected !== false
    || receipt.capacityReserved !== false
    || receipt.authorityMinted !== false
    || receipt.independentOutcomeTruthEstablished !== false
    || receipt.outcomeCommitted !== false) fail("REPLAY_BINDING_INVALID");
  sourceExpiry(occurrence.sourceExpiresAt, occurrence.observedAt,
    identity.job.expiresAt);
  return Object.freeze({ incomplete: false,
    result: executorResultFromReceipt(receipt) });
}

/**
 * Brand one local machine adapter. Its callback receives only the fixed
 * READ_ONLY_SOURCE_OBSERVATION command and opaque private envelope bytes.
 */
export function createUserHeldReadOnlyRouteObservationMachineAdapterV1(
  input = {}) {
  exact(input, ["adapterInstanceRefHash", "observeReadOnly"],
    "MACHINE_ADAPTER_INPUT");
  const adapterInstanceRefHash = hash(input.adapterInstanceRefHash,
    "ADAPTER_INSTANCE_REF_HASH");
  if (typeof input.observeReadOnly !== "function") {
    fail("OBSERVE_READ_ONLY_INVALID");
  }
  const adapter = Object.freeze({
    schema:
      OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
        .machineAdapter,
    schemaVersion: "1.0.0",
    operation: OPERATION,
    sellerNeutral: true,
  });
  MACHINE_ADAPTERS.set(adapter, Object.freeze({ adapterInstanceRefHash,
    observeReadOnly: input.observeReadOnly }));
  return adapter;
}

/**
 * Create the private composition consumed by the existing user-held binding
 * and client. Call createUserHeldBinding() before enqueueing anything central.
 */
export function createUserHeldReadOnlyRouteObservationCompositionV1(input = {},
  dependencies = {}) {
  exact(input, ["orderId", "outcomeProgramHash", "graphRefs",
    "privateEnvelopeBytes", "privateRoot", "issuedAt", "expiresAt"], "INPUT");
  exact(dependencies, ["machineAdapter", "clock"], "DEPENDENCIES");
  const machineState = MACHINE_ADAPTERS.get(dependencies.machineAdapter);
  if (machineState === undefined || typeof dependencies.clock !== "function") {
    fail("DEPENDENCIES_INVALID");
  }
  const issuedAt = instant(input.issuedAt, "ISSUED_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (Date.parse(issuedAt) >= Date.parse(expiresAt)) fail("WINDOW_INVALID");
  const root = privateRoot(input.privateRoot);
  const privateEnvelope = bytes(input.privateEnvelopeBytes,
    "PRIVATE_ENVELOPE_BYTES", MAX_PRIVATE_ENVELOPE_BYTES);
  const parameterEnvelopeHash = bytesHash(privateEnvelope);
  const planBody = {
    schema:
      OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS.plan,
    schemaVersion: "1.0.0",
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    orderId: input.orderId,
    outcomeProgramHash: input.outcomeProgramHash,
    graphRefs: input.graphRefs,
    parameterEnvelopeHash,
    issuedAt,
    expiresAt,
    attemptKind: ATTEMPT_KIND,
    executionClass: OPERATION,
    typedGraphAttemptIssued: false,
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const planHash = digest(planBody.schema, planBody);
  const identity = formationJobIdentityV1({
    schema: "outsider/formation-job/v1",
    orderId: input.orderId,
    planHash,
    adapterBinding: { adapterId: ADAPTER_ID, adapterVersion: ADAPTER_VERSION },
    outcomeProgramHash: input.outcomeProgramHash,
    parameterEnvelopeHash,
    graphRefs: input.graphRefs,
    issuedAt,
    expiresAt,
  });
  const familyDirectory = path.join(root,
    "user-held-read-only-route-observation-v1");
  const runDirectory = path.join(familyDirectory, identity.jobHash.slice(7));
  let inFlight = null;
  let completed = null;
  const executor = Object.freeze({
    async executeFrozenPlan(value) {
      exact(value, ["job", "jobHash", "jobKey"], "EXECUTION");
      const received = formationJobIdentityV1(value.job);
      if (received.jobHash !== value.jobHash || received.jobKey !== value.jobKey
        || received.jobHash !== identity.jobHash
        || received.jobKey !== identity.jobKey) {
        return noEffectResult("UNAVAILABLE",
          "READ_ONLY_ROUTE_OBSERVATION_JOB_BINDING_MISMATCH",
          "outsider/user-held-read-only-route-job-mismatch/v1",
          identity.jobHash);
      }
      const observedAt = instant(dependencies.clock(), "CLOCK");
      if (Date.parse(observedAt) < Date.parse(issuedAt)
        || Date.parse(observedAt) >= Date.parse(expiresAt)) {
        return noEffectResult("UNAVAILABLE",
          "READ_ONLY_ROUTE_OBSERVATION_JOB_EXPIRED",
          "outsider/user-held-read-only-route-job-expired/v1",
          identity.jobHash);
      }
      if (bytesHash(privateEnvelope) !== parameterEnvelopeHash) {
        return noEffectResult("UNAVAILABLE",
          "READ_ONLY_ROUTE_OBSERVATION_PRIVATE_INPUT_MISMATCH",
          "outsider/user-held-read-only-route-private-input-mismatch/v1",
          identity.jobHash);
      }
      if (completed !== null) return completed;
      if (inFlight !== null) return inFlight;
      inFlight = (async () => {
        const replay = replayLocalResult(runDirectory, identity, planHash,
          machineState.adapterInstanceRefHash);
        if (replay?.incomplete === true) {
          return incompleteResult(identity.jobHash, planHash);
        }
        if (replay?.result !== undefined) return replay.result;
        ensurePrivateDirectory(familyDirectory);
        ensurePrivateDirectory(runDirectory);
        const paths = artifactPaths(runDirectory);
        const markerBody = {
          schema:
            OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
              .localExecutionMarker,
          schemaVersion: "1.0.0",
          jobHash: identity.jobHash,
          planHash,
          adapterInstanceRefHash: machineState.adapterInstanceRefHash,
          privateEnvelopeHash: parameterEnvelopeHash,
          attemptKind: ATTEMPT_KIND,
          executionClass: OPERATION,
          observedAt,
          externalEffectCeiling: "READ_ONLY",
          typedGraphAttemptIssued: false,
        };
        writePrivateJsonOnce(paths.marker, { ...markerBody,
          markerHash: digest(markerBody.schema, markerBody) });
        let observation;
        const commandEnvelope = Buffer.from(privateEnvelope);
        try {
          observation = normalizeMachineObservation(
            await machineState.observeReadOnly(Object.freeze({
              schema:
                OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
                  .machineCommand,
              schemaVersion: "1.0.0",
              operation: OPERATION,
              executionClass: OPERATION,
              privateEnvelopeBytes: commandEnvelope,
            })), observedAt, expiresAt);
        } catch {
          return incompleteResult(identity.jobHash, planHash);
        } finally {
          commandEnvelope.fill(0);
        }
        writePrivateBytesOnce(paths.raw, observation.rawSourceBytes);
        const occurrenceBody = {
          schema:
            OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
              .sourceOccurrence,
          schemaVersion: "1.0.0",
          jobHash: identity.jobHash,
          planHash,
          adapterInstanceRefHash: machineState.adapterInstanceRefHash,
          operation: OPERATION,
          sourceState: observation.sourceState,
          sourceDeclarationClass: observation.sourceDeclarationClass,
          sourceBytesHash: bytesHash(observation.rawSourceBytes),
          sourceBytesLength: observation.rawSourceBytes.length,
          observedAt,
          sourceExpiresAt: observation.sourceExpiresAt,
          externalEffect: "READ_ONLY",
          rawSourceProjected: false,
          providerIdentityProjected: false,
          destinationProjected: false,
          capacityReserved: false,
          authorityMinted: false,
          independentOutcomeTruthEstablished: false,
          outcomeCommitted: false,
        };
        const occurrence = Object.freeze({ ...occurrenceBody,
          occurrenceHash: digest(occurrenceBody.schema, occurrenceBody) });
        writePrivateJsonOnce(paths.occurrence, occurrence);
        const outcome = outcomeForSourceState(observation.sourceState);
        const receiptBody = {
          schema:
            OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
              .resultReceipt,
          schemaVersion: "1.0.0",
          jobHash: identity.jobHash,
          planHash,
          sourceOccurrenceHash: occurrence.occurrenceHash,
          sourceState: observation.sourceState,
          state: outcome.state,
          reasonCode: outcome.reasonCode,
          externalEffect: "READ_ONLY",
          retryDisposition: "DO_NOT_RETRY",
          rawSourceProjected: false,
          unkeyedSourceHashProjected: false,
          capacityReserved: false,
          authorityMinted: false,
          independentOutcomeTruthEstablished: false,
          outcomeCommitted: false,
        };
        const receipt = Object.freeze({ ...receiptBody,
          receiptHash: digest(receiptBody.schema, receiptBody) });
        writePrivateJsonOnce(paths.receipt, receipt);
        observation.rawSourceBytes.fill(0);
        return executorResultFromReceipt(receipt);
      })();
      completed = await inFlight;
      inFlight = null;
      return completed;
    },
  });
  const privateComposition = Object.freeze({ job: identity.job, executor,
    localProjection: Object.freeze({
      schema:
        OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
          .compositionProjection,
      schemaVersion: "1.0.0",
      adapterBinding: identity.job.adapterBinding,
      jobKey: identity.jobKey,
      jobHash: identity.jobHash,
      privateProjectionOnly: true,
      typedGraphAttemptIssued: false,
      requiredAttemptKind: ATTEMPT_KIND,
      requiredExecutionClass: OPERATION,
      rawPrivateInputProjected: false,
      rawSourceProjected: false,
      paymentAuthorized: false,
      orderAuthorized: false,
      capacityReserved: false,
      authorityMinted: false,
      independentOutcomeTruthEstablished: false,
      outcomeCommitted: false,
    }),
  });
  return Object.freeze({
    ...privateComposition,
    createUserHeldBinding(commitmentKeyBytes) {
      return createUserHeldFormationPrivateBindingV1({
        composition: privateComposition,
        privateEnvelopeBytes: privateEnvelope,
        commitmentKeyBytes,
      });
    },
  });
}
