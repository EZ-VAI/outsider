/*
 * UptimeRobot HTTP prospective-witness adapter v1.
 *
 * This is a production transport seam for one order-scoped HTTP witness. It
 * creates, observes, and removes an UptimeRobot API v3 monitor through an
 * injected fetch-compatible transport. Mutating calls are recorded in the
 * existing fsync-backed one-use effect ledger before contact and are never
 * automatically retried. A monitor ACK or status remains a source-declared
 * witness claim; a higher-level episode must establish owner authority,
 * operational independence, and outcome acceptance.
 */

import { createHash, randomBytes } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  replayDurableOneUseEndpointEffectStatesSinceV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const PREFIX = "OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_";
const API_ORIGIN = "https://api.uptimerobot.com";
const API_PREFIX = "/v3";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const PRIVATE_NONCE = /^[A-Za-z0-9_-]{16,256}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const SOURCE_ISO_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/u;
const SUCCESS_CODE = /^(?:[1-5]xx|[1-5]\d\d)$/u;
const SOURCE_STATUSES = new Set([
  "PAUSED", "STARTED", "UP", "LOOKS_DOWN", "DOWN",
]);
const MAX_RESPONSE_BYTES = 1024 * 1024;

const CAPABILITIES = new WeakMap();
const DRIVERS = new WeakMap();

export const OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SOURCE_PINS
  = Object.freeze({
    officialApiDocumentation: "https://uptimerobot.com/api/v3/",
    officialCliRepository: "https://github.com/uptimerobot/uptimerobot-cli",
    officialCliCommit: "41e7c11124c49d2c98c13dac8af871c808428d24",
    openApiPath: "openapi/openapi.yaml",
    openApiBytes: 269690,
    openApiSha256:
      "e7fb5d5cdff613174886c34195132588f829e5e3fcd6693e51b7d4d26fdf7a95",
    baseUrl: "https://api.uptimerobot.com/v3",
    createMonitorOperation: "POST /monitors",
    getMonitorOperation: "GET /monitors/{id}",
    getMonitorUptimeStatsOperation:
      "GET /monitors/{id}/stats/uptime?from={ISO8601}&to={ISO8601}",
    listMonitorsOperation: "GET /monitors",
    deleteMonitorOperation: "DELETE /monitors/{id}",
    authentication: "BEARER_TOKEN",
    freePlanRateLimitPerMinute: 10,
  });

export const OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS
  = Object.freeze({
    plan: "outsider/uptimerobot-http-witness-plan/v1",
    capability: "outsider/uptimerobot-api-capability/v1",
    projection: "outsider/uptimerobot-http-witness-projection/v1",
    adapter: "outsider/prospective-witness-adapter/v1",
    adapterState: "outsider/uptimerobot-monitor-handle/v1",
  });

export const OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_BOUNDARY
  = Object.freeze({
    position: "ORDER_SCOPED_PROSPECTIVE_HTTP_WITNESS_EXECUTION_ADAPTER",
    provider: "UPTIMEROBOT_API_V3",
    providerEnrollmentRequiredByAdapter: false,
    userHeldProviderAccountCredentialRequired: true,
    paymentPerformed: false,
    automaticMutationRetries: 0,
    createAmbiguityDisposition: "EXACT_LIST_RECONCILIATION_ONLY",
    deleteAmbiguityDisposition: "EXACT_ID_GET_RECONCILIATION_ONLY",
    durableMutationLedgerRequired: true,
    safeReadPollingPermitted: true,
    monitorAcknowledgementIsOutcomeTruth: false,
    monitorStatusIsIndependentOutcomeTruthByItself: false,
    operationalIndependenceEstablishedByAdapter: false,
    ownerAuthorityEstablishedByAdapter: false,
    externalWitnessCapacityEstablishedByAdapter: false,
    userOutcomeCommitmentIssuedByAdapter: false,
    credentialProjected: false,
    targetProjectedInRuntimeProjection: false,
    monitorIdProjectedInRuntimeProjection: false,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isSafeInteger(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function text(value, maximumBytes, code) {
  if (typeof value !== "string" || value.length < 1
    || Buffer.byteLength(value, "utf8") > maximumBytes) fail(`${code}_INVALID`);
  return value;
}

function targetUrl(raw) {
  text(raw, 10_000, "TARGET_URL");
  let parsed;
  try { parsed = new URL(raw); } catch { fail("TARGET_URL_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.hash !== "" || parsed.search !== ""
    || parsed.port !== "" || parsed.hostname.length < 1
    || parsed.href !== raw) fail("CANONICAL_PUBLIC_HTTPS_TARGET_REQUIRED");
  return parsed.href;
}

function finiteInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function normalizedSuccessCodes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    fail("SUCCESS_HTTP_RESPONSE_CODES_INVALID");
  }
  const copy = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !SUCCESS_CODE.test(item)
      || seen.has(item)) fail("SUCCESS_HTTP_RESPONSE_CODES_INVALID");
    seen.add(item);
    copy.push(item);
  }
  return Object.freeze(copy);
}

const PLAN_FIELDS = Object.freeze([
  "targetUrl", "friendlyName", "intervalSeconds", "timeoutSeconds",
  "httpMethod", "successHttpResponseCodes", "observationRequirementHash",
  "serviceFrom", "serviceUntil", "formationDeadline", "cleanupDeadline",
]);

export function createUptimeRobotHttpWitnessPlanV1(input = {}) {
  exactObject(input, PLAN_FIELDS, "PLAN_INPUT");
  const url = targetUrl(input.targetUrl);
  const friendlyName = text(input.friendlyName, 250, "FRIENDLY_NAME");
  if (/\r|\n/u.test(friendlyName)) fail("FRIENDLY_NAME_INVALID");
  const interval = finiteInteger(input.intervalSeconds, 30, 2_678_400,
    "INTERVAL_SECONDS");
  const timeout = finiteInteger(input.timeoutSeconds, 1, 60,
    "TIMEOUT_SECONDS");
  if (input.httpMethod !== "HEAD" && input.httpMethod !== "GET") {
    fail("HTTP_METHOD_INVALID");
  }
  const codes = normalizedSuccessCodes(input.successHttpResponseCodes);
  const serviceFrom = instant(input.serviceFrom, "SERVICE_FROM");
  const serviceUntil = instant(input.serviceUntil, "SERVICE_UNTIL");
  const formationDeadline = instant(input.formationDeadline,
    "FORMATION_DEADLINE");
  const cleanupDeadline = instant(input.cleanupDeadline, "CLEANUP_DEADLINE");
  if (Date.parse(formationDeadline) > Date.parse(serviceFrom)
    || Date.parse(serviceFrom) >= Date.parse(serviceUntil)
    || Date.parse(serviceUntil) > Date.parse(cleanupDeadline)) {
    fail("LIFECYCLE_WINDOW_INVALID");
  }
  const createBody = deepFreeze({
    friendlyName,
    type: "HTTP",
    url,
    interval,
    timeout,
    httpMethodType: input.httpMethod,
    authType: "NONE",
    successHttpResponseCodes: codes,
    checkSSLErrors: true,
    followRedirections: false,
    config: { applicationErrorRetries: 0 },
  });
  const body = {
    schema: OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS.plan,
    schemaVersion: "1.0.0",
    provider: "UPTIMEROBOT_API_V3",
    witnessRole: "INDEPENDENT_WITNESS",
    targetUrl: url,
    friendlyName,
    intervalSeconds: interval,
    timeoutSeconds: timeout,
    httpMethod: input.httpMethod,
    successHttpResponseCodes: codes,
    observationRequirementHash: hash(input.observationRequirementHash,
      "OBSERVATION_REQUIREMENT_HASH"),
    serviceFrom,
    serviceUntil,
    formationDeadline,
    cleanupDeadline,
    createBody,
    createBodyHash: byteHash(Buffer.from(canonicalizeStrict(createBody), "utf8")),
    sourcePins:
      OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SOURCE_PINS,
    monitorAcknowledgementIsOutcomeTruth: false,
    monitorStatusIsIndependentOutcomeTruthByItself: false,
  };
  return deepFreeze({ ...body, planHash: digest(body.schema, body) });
}

const CAPABILITY_FIELDS = Object.freeze(["apiToken", "expiresAt"]);

export function sealUptimeRobotApiCapabilityV1(input = {}) {
  exactObject(input, CAPABILITY_FIELDS, "CAPABILITY_INPUT");
  const apiToken = text(input.apiToken, 4096, "API_TOKEN");
  if (/\s/u.test(apiToken)) fail("API_TOKEN_INVALID");
  const expiresAt = instant(input.expiresAt, "CAPABILITY_EXPIRES_AT");
  const body = {
    schema: OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS.capability,
    schemaVersion: "1.0.0",
    provider: "UPTIMEROBOT_API_V3",
    expiresAt,
    apiTokenProjected: false,
  };
  const capability = Object.freeze({
    ...body,
    capabilityHash: digest(body.schema, {
      ...body,
      privateTokenCommitment: digest(
        "outsider/uptimerobot-api-token-commitment/v1", apiToken),
    }),
  });
  CAPABILITIES.set(capability, { apiToken, expiresAt });
  return capability;
}

function now(state) {
  let value;
  try { value = state.clock(); } catch { fail("CLOCK_FAILED"); }
  return instant(value, "CLOCK_INSTANT");
}

function checkCredential(state) {
  const observedAt = now(state);
  return {
    observedAt,
    current: Date.parse(observedAt) < Date.parse(state.credential.expiresAt),
  };
}

function operationBinding(state, operation, method, path, bodyBytes,
  deadline) {
  return {
    operation,
    method,
    path,
    bodyBytes,
    effectDeadline: deadline,
    effectIdHash: operationEffectIdHash(state.transactionBindingHash,
      operation, method, path),
    transactionBindingHash: state.transactionBindingHash,
    endpointBindingHash: digest("outsider/uptimerobot-fixed-endpoint/v1",
      { origin: API_ORIGIN, method, path }),
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: state.permissionGrantHash,
    oneUseNonceHash: digest(
      `outsider/uptimerobot-${operation.toLowerCase()}-nonce/v1`,
      randomBytes(32).toString("hex")),
    idempotencyKeyHash: digest(
      `outsider/uptimerobot-${operation.toLowerCase()}-local-key/v1`,
      randomBytes(32).toString("hex")),
    bodyHash: bodyBytes === null
      ? digest("outsider/uptimerobot-empty-body/v1", { method, path })
      : byteHash(bodyBytes),
    currentEvent: null,
  };
}

function operationEffectIdHash(transactionBindingHash, operation, method,
  path) {
  return digest(
    `outsider/uptimerobot-${operation.toLowerCase()}-effect/v1`, {
      transactionBindingHash, method, path,
    });
}

function resumedOperationBinding(state, operation, method, path, bodyBytes,
  deadline, replayedEffect) {
  if (replayedEffect === null) return null;
  const first = replayedEffect.firstEvent;
  const expected = {
    effectIdHash: operationEffectIdHash(state.transactionBindingHash,
      operation, method, path),
    transactionBindingHash: state.transactionBindingHash,
    endpointBindingHash: digest("outsider/uptimerobot-fixed-endpoint/v1",
      { origin: API_ORIGIN, method, path }),
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: state.permissionGrantHash,
    bodyHash: bodyBytes === null
      ? digest("outsider/uptimerobot-empty-body/v1", { method, path })
      : byteHash(bodyBytes),
    effectDeadline: deadline,
  };
  if (first.eventType !== "INTENT_ADMITTED"
    || replayedEffect.effectIdHash !== expected.effectIdHash
    || Object.entries(expected).some(([field, value]) =>
      first[field] !== value)) fail("ADAPTER_STATE_LEDGER_REPLAY_FAILED");
  return {
    operation,
    method,
    path,
    bodyBytes,
    effectDeadline: deadline,
    effectIdHash: first.effectIdHash,
    transactionBindingHash: first.transactionBindingHash,
    endpointBindingHash: first.endpointBindingHash,
    adapterInstanceRefHash: first.adapterInstanceRefHash,
    permissionGrantHash: first.permissionGrantHash,
    oneUseNonceHash: first.oneUseNonceHash,
    idempotencyKeyHash: first.idempotencyKeyHash,
    bodyHash: first.bodyHash,
    currentEvent: replayedEffect.currentEvent,
  };
}

function makeEvent(state, binding, eventType, endpointReceiptHash = null,
  terminalEvidenceHash = null) {
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: state.ledgerId,
    eventType,
    effectIdHash: binding.effectIdHash,
    transactionBindingHash: binding.transactionBindingHash,
    endpointBindingHash: binding.endpointBindingHash,
    adapterInstanceRefHash: binding.adapterInstanceRefHash,
    permissionGrantHash: binding.permissionGrantHash,
    oneUseNonceHash: binding.oneUseNonceHash,
    idempotencyKeyHash: binding.idempotencyKeyHash,
    bodyHash: binding.bodyHash,
    effectDeadline: binding.effectDeadline,
    recordedAt: now(state),
    previousEffectEventHash: binding.currentEvent?.eventHash ?? null,
    occurrenceNonceHash: digest(
      "outsider/uptimerobot-effect-occurrence/v1", {
        operation: binding.operation,
        eventType,
        entropy: randomBytes(32).toString("hex"),
      }),
    endpointReceiptHash,
    terminalEvidenceHash,
  });
}

function appendEvent(state, binding, eventType, endpointReceiptHash = null,
  terminalEvidenceHash = null) {
  const event = makeEvent(state, binding, eventType, endpointReceiptHash,
    terminalEvidenceHash);
  state.verification = appendDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    event,
    expectedLocalHeadHash: state.verification.head.headHash,
  });
  binding.currentEvent = event;
}

function prepareMutation(state, binding) {
  if (binding.currentEvent?.eventType === "ENDPOINT_RECEIPT_OBSERVED") {
    return "OBSERVED";
  }
  if (binding.currentEvent?.eventType === "AMBIGUOUS_NO_RETRY_HOLD"
    || binding.currentEvent?.eventType === "EXPIRED_BEFORE_SUBMIT") {
    return "TERMINAL";
  }
  if (binding.currentEvent?.eventType === "SUBMIT_ATTEMPTED") {
    return "AMBIGUOUS";
  }
  const current = now(state);
  if (Date.parse(current) >= Date.parse(binding.effectDeadline)) {
    if (binding.currentEvent === null) appendEvent(state, binding,
      "INTENT_ADMITTED");
    appendEvent(state, binding, "EXPIRED_BEFORE_SUBMIT", null,
      digest("outsider/uptimerobot-deadline-expiry/v1", {
        operation: binding.operation, current,
      }));
    return "TERMINAL";
  }
  if (binding.currentEvent === null) appendEvent(state, binding,
    "INTENT_ADMITTED");
  if (binding.currentEvent.eventType === "INTENT_ADMITTED") {
    appendEvent(state, binding, "SUBMIT_RESERVED");
  }
  appendEvent(state, binding, "SUBMIT_ATTEMPTED");
  return "ATTEMPTED";
}

function projection(state, stage, io = {}) {
  const counts = state.verification.head.transitionCounts;
  const body = {
    schema: OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS.projection,
    schemaVersion: "1.0.0",
    provider: "UPTIMEROBOT_API_V3",
    stage,
    planHash: state.plan.planHash,
    observationRequirementHash: state.plan.observationRequirementHash,
    serviceFrom: state.plan.serviceFrom,
    serviceUntil: state.plan.serviceUntil,
    durableOccurrenceCount: state.verification.head.exactOccurrenceCount,
    mutationAttemptCount: counts.SUBMIT_ATTEMPTED,
    providerReceiptCount: counts.ENDPOINT_RECEIPT_OBSERVED,
    networkIoPerformedByThisCall: io.network === true,
    preflightGetPerformedByThisCall: io.preflight === true,
    createPostPerformedByThisCall: io.create === true,
    reconcileListGetPerformedByThisCall: io.reconcileCreate === true,
    monitorGetPerformedByThisCall: io.observe === true,
    deletePerformedByThisCall: io.delete === true,
    reconcileDeleteGetPerformedByThisCall: io.reconcileDelete === true,
    sourceDeclaredWitnessReservationCurrent:
      state.monitorId !== null && state.released !== true,
    sourceDeclaredMonitorStatus: state.sourceStatus,
    sourceDeclaredRequirementMatch: state.requirementMatch,
    observationOccurrenceCount: state.observationCount,
    latestObservationHash: state.latestObservationHash,
    releaseSourceDeclared: state.released,
    preflightSourceDeclaredWritable: state.preflightWritable,
    createCommitUnknown: state.createCommitUnknown,
    deleteCommitUnknown: state.deleteCommitUnknown,
    privateBindingCommitmentHash: digest(
      "outsider/uptimerobot-private-runtime-binding/v1", {
        privateProjectionNonce: state.privateProjectionNonce,
        targetUrl: state.plan.targetUrl,
        friendlyName: state.plan.friendlyName,
        monitorId: state.monitorId,
        ledgerHeadHash: state.verification.head.headHash,
      }),
    apiTokenProjected: false,
    targetProjected: false,
    monitorIdProjected: false,
    providerAcknowledgementIsOutcomeTruth: false,
    providerMonitorStatusIsIndependentOutcomeTruthByItself: false,
    operationalIndependenceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalWitnessCapacityEstablished: false,
    independentOutcomeTruthEstablished: false,
    userOutcomePromiseIssued: false,
    paymentPerformed: false,
    internalHumanInterventionCount: 0,
    humanQueueCreated: false,
  };
  return deepFreeze({ ...body, projectionHash: digest(body.schema, body) });
}

function result(state, stage, io = {}) {
  return Object.freeze({ publicProjection: projection(state, stage, io) });
}

const DRIVER_FIELDS = Object.freeze([
  "plan", "expectedPlanHash", "credentialCapability", "ledgerDirectory",
  "ledgerId", "adapterInstanceRefHash", "permissionGrantHash",
  "privateProjectionNonce",
]);
const DEPENDENCY_FIELDS = Object.freeze(["requestImpl", "clock"]);

export function createUptimeRobotHttpWitnessDriverV1(input = {},
  dependencies = {}) {
  exactObject(input, DRIVER_FIELDS, "DRIVER_INPUT");
  exactObject(dependencies, DEPENDENCY_FIELDS, "DEPENDENCIES");
  if (input.plan?.schema
      !== OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS.plan
    || input.plan.planHash !== hash(input.expectedPlanHash,
      "EXPECTED_PLAN_HASH")) fail("PLAN_INVALID");
  const planBody = { ...input.plan };
  delete planBody.planHash;
  if (digest(input.plan.schema, planBody) !== input.expectedPlanHash) {
    fail("PLAN_HASH_MISMATCH");
  }
  const credential = CAPABILITIES.get(input.credentialCapability);
  if (credential === undefined) fail("CAPABILITY_NOT_MODULE_ISSUED");
  if (typeof dependencies.requestImpl !== "function"
    || typeof dependencies.clock !== "function"
    || typeof input.ledgerDirectory !== "string"
    || !LEDGER_ID.test(input.ledgerId)
    || !PRIVATE_NONCE.test(input.privateProjectionNonce)) {
    fail("DRIVER_CONFIGURATION_INVALID");
  }
  const state = {
    plan: input.plan,
    credential,
    requestImpl: dependencies.requestImpl,
    clock: dependencies.clock,
    ledgerDirectory: input.ledgerDirectory,
    ledgerId: input.ledgerId,
    adapterInstanceRefHash: hash(input.adapterInstanceRefHash,
      "ADAPTER_INSTANCE_REF_HASH"),
    permissionGrantHash: hash(input.permissionGrantHash,
      "PERMISSION_GRANT_HASH"),
    privateProjectionNonce: input.privateProjectionNonce,
    transactionBindingHash: null,
    create: null,
    deletion: null,
    verification: null,
    monitorId: null,
    sourceStatus: null,
    requirementMatch: null,
    observationCount: 0,
    latestObservationHash: null,
    released: false,
    preflightWritable: null,
    createCommitUnknown: false,
    deleteCommitUnknown: false,
    formationReservationId: null,
    formationReserveOperationId: null,
  };
  state.transactionBindingHash = digest(
    "outsider/uptimerobot-http-witness-transaction/v1", {
      planHash: input.plan.planHash,
      targetUrl: input.plan.targetUrl,
      friendlyName: input.plan.friendlyName,
      serviceFrom: input.plan.serviceFrom,
      serviceUntil: input.plan.serviceUntil,
    });
  const createBytes = Buffer.from(canonicalizeStrict(input.plan.createBody),
    "utf8");
  state.create = operationBinding(state, "CREATE_MONITOR", "POST",
    `${API_PREFIX}/monitors`, createBytes, input.plan.formationDeadline);
  const intent = makeEvent(state, state.create, "INTENT_ADMITTED");
  state.verification = initializeDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    genesisEvent: intent,
  });
  state.create.currentEvent = intent;
  const driver = Object.freeze({ publicProjection:
    projection(state, "CREATE_INTENT_DURABLY_ADMITTED") });
  DRIVERS.set(driver, state);
  return driver;
}

const ADAPTER_STATE_FIELDS = Object.freeze([
  "schema", "schemaVersion", "provider", "planHash", "monitorId",
  "reservationId", "reserveOperationId", "ledgerHeadHash", "sourceStatus",
  "sourceDeclaredRequirementMatch", "observationOccurrenceCount",
  "latestObservationHash", "released", "containsCredential", "handleHash",
]);

function createAdapterState(state) {
  if (state.monitorId === null || state.formationReservationId === null
    || state.formationReserveOperationId === null) return null;
  const body = {
    schema:
      OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS.adapterState,
    schemaVersion: "1.0.0",
    provider: "UPTIMEROBOT_API_V3",
    planHash: state.plan.planHash,
    monitorId: state.monitorId,
    reservationId: state.formationReservationId,
    reserveOperationId: state.formationReserveOperationId,
    ledgerHeadHash: state.verification.head.headHash,
    sourceStatus: state.sourceStatus,
    sourceDeclaredRequirementMatch: state.requirementMatch,
    observationOccurrenceCount: state.observationCount,
    latestObservationHash: state.latestObservationHash,
    released: state.released,
    containsCredential: false,
  };
  return deepFreeze({ ...body, handleHash: digest(body.schema, body) });
}

const RESUME_FIELDS = Object.freeze([
  "plan", "expectedPlanHash", "credentialCapability", "ledgerDirectory",
  "ledgerId", "adapterInstanceRefHash", "permissionGrantHash",
  "privateProjectionNonce", "adapterState",
]);

/** Resume observation/release from a secret-free persisted monitor handle. */
export function resumeUptimeRobotHttpWitnessDriverV1(input = {},
  dependencies = {}) {
  exactObject(input, RESUME_FIELDS, "RESUME_INPUT");
  exactObject(dependencies, DEPENDENCY_FIELDS, "DEPENDENCIES");
  if (input.plan?.schema
      !== OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS.plan
    || input.plan.planHash !== hash(input.expectedPlanHash,
      "EXPECTED_PLAN_HASH")) fail("PLAN_INVALID");
  const planBody = { ...input.plan };
  delete planBody.planHash;
  if (digest(input.plan.schema, planBody) !== input.expectedPlanHash) {
    fail("PLAN_HASH_MISMATCH");
  }
  const credential = CAPABILITIES.get(input.credentialCapability);
  if (credential === undefined) fail("CAPABILITY_NOT_MODULE_ISSUED");
  if (typeof dependencies.requestImpl !== "function"
    || typeof dependencies.clock !== "function"
    || typeof input.ledgerDirectory !== "string"
    || !LEDGER_ID.test(input.ledgerId)
    || !PRIVATE_NONCE.test(input.privateProjectionNonce)) {
    fail("RESUME_CONFIGURATION_INVALID");
  }
  const handle = exactObject(input.adapterState, ADAPTER_STATE_FIELDS,
    "ADAPTER_STATE");
  const handleBody = { ...handle };
  delete handleBody.handleHash;
  if (handle.schema
      !== OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS.adapterState
    || handle.schemaVersion !== "1.0.0"
    || handle.provider !== "UPTIMEROBOT_API_V3"
    || handle.planHash !== input.expectedPlanHash
    || handle.containsCredential !== false
    || !Number.isSafeInteger(handle.monitorId) || handle.monitorId < 1
    || !HASH.test(handle.reservationId)
    || typeof handle.reserveOperationId !== "string"
    || handle.reserveOperationId.length < 1
    || Buffer.byteLength(handle.reserveOperationId, "utf8") > 512
    || digest(handle.schema, handleBody) !== hash(handle.handleHash,
      "ADAPTER_STATE_HASH")) fail("ADAPTER_STATE_INVALID");
  hash(handle.ledgerHeadHash, "ADAPTER_STATE_LEDGER_HEAD_HASH");
  if (handle.latestObservationHash !== null) hash(handle.latestObservationHash,
    "ADAPTER_STATE_OBSERVATION_HASH");
  if (!Number.isSafeInteger(handle.observationOccurrenceCount)
    || handle.observationOccurrenceCount < 0
    || (handle.sourceDeclaredRequirementMatch !== null
      && typeof handle.sourceDeclaredRequirementMatch !== "boolean")
    || (handle.sourceStatus !== null && !SOURCE_STATUSES.has(handle.sourceStatus))
    || typeof handle.released !== "boolean") fail("ADAPTER_STATE_INVALID");
  const adapterInstanceRefHash = hash(input.adapterInstanceRefHash,
    "ADAPTER_INSTANCE_REF_HASH");
  const permissionGrantHash = hash(input.permissionGrantHash,
    "PERMISSION_GRANT_HASH");
  const transactionBindingHash = digest(
    "outsider/uptimerobot-http-witness-transaction/v1", {
      planHash: input.plan.planHash,
      targetUrl: input.plan.targetUrl,
      friendlyName: input.plan.friendlyName,
      serviceFrom: input.plan.serviceFrom,
      serviceUntil: input.plan.serviceUntil,
    });
  const createPath = `${API_PREFIX}/monitors`;
  const deletePath = `${API_PREFIX}/monitors/${handle.monitorId}`;
  let replayed;
  try {
    replayed = replayDurableOneUseEndpointEffectStatesSinceV1({
      directory: input.ledgerDirectory,
      ledgerId: input.ledgerId,
      expectedAncestorHeadHash: handle.ledgerHeadHash,
      effectIdHashes: [
        operationEffectIdHash(transactionBindingHash, "CREATE_MONITOR",
          "POST", createPath),
        operationEffectIdHash(transactionBindingHash, "DELETE_MONITOR",
          "DELETE", deletePath),
      ],
    });
  } catch {
    fail("ADAPTER_STATE_LEDGER_REPLAY_FAILED");
  }
  const [createEffect, deletionEffect] = replayed.effects;
  if (replayed.verification.head.effectCount
      !== replayed.effects.filter((effect) => effect !== null).length
    || createEffect === null
    || createEffect.currentEvent.eventType !== "ENDPOINT_RECEIPT_OBSERVED") {
    fail("ADAPTER_STATE_LEDGER_REPLAY_FAILED");
  }
  const state = {
    plan: input.plan,
    credential,
    requestImpl: dependencies.requestImpl,
    clock: dependencies.clock,
    ledgerDirectory: input.ledgerDirectory,
    ledgerId: input.ledgerId,
    adapterInstanceRefHash,
    permissionGrantHash,
    privateProjectionNonce: input.privateProjectionNonce,
    transactionBindingHash,
    create: null,
    deletion: null,
    verification: replayed.verification,
    monitorId: handle.monitorId,
    sourceStatus: handle.sourceStatus,
    requirementMatch: handle.sourceDeclaredRequirementMatch,
    observationCount: handle.observationOccurrenceCount,
    latestObservationHash: handle.latestObservationHash,
    released: false,
    preflightWritable: null,
    createCommitUnknown: false,
    deleteCommitUnknown: deletionEffect?.currentEvent.eventType
      === "SUBMIT_ATTEMPTED",
    formationReservationId: handle.reservationId,
    formationReserveOperationId: handle.reserveOperationId,
  };
  const createBytes = Buffer.from(canonicalizeStrict(input.plan.createBody),
    "utf8");
  state.create = resumedOperationBinding(state, "CREATE_MONITOR", "POST",
    createPath, createBytes, input.plan.formationDeadline, createEffect);
  state.deletion = resumedOperationBinding(state, "DELETE_MONITOR", "DELETE",
    deletePath, null, input.plan.cleanupDeadline, deletionEffect);
  state.released = state.deletion?.currentEvent.eventType
    === "ENDPOINT_RECEIPT_OBSERVED";
  if (handle.released && !state.released) {
    fail("ADAPTER_STATE_LEDGER_REPLAY_FAILED");
  }
  const driver = Object.freeze({ publicProjection:
    projection(state, "RESUMED_FROM_DURABLE_MONITOR_HANDLE") });
  DRIVERS.set(driver, state);
  return driver;
}

function checkedDriver(driver, input, code) {
  exactObject(input, ["expectedPlanHash"], code);
  const state = DRIVERS.get(driver);
  if (state === undefined) fail("DRIVER_NOT_MODULE_ISSUED");
  if (hash(input.expectedPlanHash, "EXPECTED_PLAN_HASH")
    !== state.plan.planHash) fail("PLAN_HASH_MISMATCH");
  return state;
}

function apiHeaders(state, withBody) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${state.credential.apiToken}`,
  };
  if (withBody) headers["Content-Type"] = "application/json";
  return Object.freeze(headers);
}

async function exchange(state, path, options) {
  try {
    const response = await state.requestImpl(`${API_ORIGIN}${path}`, {
      ...options,
      redirect: "error",
      credentials: "omit",
    });
    if (!Number.isSafeInteger(response?.status)
      || typeof response?.arrayBuffer !== "function") {
      return { contacted: true, status: 0, bytes: null, json: null,
        transportFailure: true };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_RESPONSE_BYTES) {
      return { contacted: true, status: response.status, bytes: null,
        json: null, transportFailure: true };
    }
    let json = null;
    if (bytes.length > 0) {
      try { json = JSON.parse(bytes.toString("utf8")); } catch { /* source */ }
    }
    return { contacted: true, status: response.status, bytes, json,
      transportFailure: false };
  } catch {
    return { contacted: true, status: 0, bytes: null, json: null,
      transportFailure: true };
  }
}

function monitorRecord(value, state) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !Number.isSafeInteger(value.id) || value.id < 1
    || value.type !== "HTTP" || value.friendlyName !== state.plan.friendlyName
    || value.url !== state.plan.targetUrl) return null;
  return value;
}

function monitorReceipt(response, domain) {
  return digest(domain, {
    status: response.status,
    bodyHash: response.bytes === null ? null : byteHash(response.bytes),
  });
}

function continuousCriterion(context) {
  const accepted = new Set(Array.isArray(context?.node?.acceptance)
    ? context.node.acceptance : []);
  const matches = (context?.program?.outcome?.acceptance ?? [])
    .filter((criterion) => accepted.has(criterion?.criterionId)
      && ["PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS", "CONTINUOUS_FOR_MS"]
        .includes(criterion?.comparator));
  if (matches.length === 0) return null;
  // A CHECKPOINT may cite the already-proven criterion but does not open or
  // re-prove a new longitudinal window.
  if (context?.node?.kind !== "OBSERVATION") return null;
  if (matches.length !== 1) {
    return { invalidReason: "CONTINUOUS_WINDOW_REQUEST_INVALID" };
  }
  const windowMs = context.node?.input?.observationWindowMs;
  if (!Number.isSafeInteger(windowMs) || windowMs < 1
    || matches[0].expected !== windowMs || windowMs > 90 * 24 * 60 * 60_000) {
    return { invalidReason: "CONTINUOUS_WINDOW_REQUEST_INVALID" };
  }
  const evidence = context?.effectResult?.dependencyEvidence;
  if (!Array.isArray(evidence) || evidence.length < 1) {
    return { invalidReason: "CONTINUOUS_WINDOW_ANCHOR_MISSING" };
  }
  const starts = evidence.map((item) => {
    const witness = typeof item?.witnessRecordedAt === "string"
      && Number.isFinite(Date.parse(item.witnessRecordedAt))
      ? Date.parse(item.witnessRecordedAt) : null;
    if (witness !== null) return witness;
    const effects = [item?.primaryEffectRecordedAt,
      item?.recoveryEffectRecordedAt].map((value) =>
      typeof value === "string" && Number.isFinite(Date.parse(value))
        ? Date.parse(value) : null).filter((value) => value !== null);
    return effects.length === 0 ? null : Math.max(...effects);
  });
  if (starts.some((value) => value === null)) {
    return { invalidReason: "CONTINUOUS_WINDOW_ANCHOR_MISSING" };
  }
  const fromMs = Math.max(...starts);
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(fromMs + windowMs).toISOString(),
    windowMs,
  };
}

function uptimeStatsRecord(value, requested) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.uptime !== "number" || !Number.isFinite(value.uptime)
    || value.uptime < 0 || value.uptime > 100
    || typeof value.total_downtime_seconds !== "number"
    || !Number.isFinite(value.total_downtime_seconds)
    || value.total_downtime_seconds < 0
    || !Number.isSafeInteger(value.incident_count)
    || value.incident_count < 0
    || (value.mtbf !== null && (typeof value.mtbf !== "number"
      || !Number.isFinite(value.mtbf) || value.mtbf < 0))
    || typeof value.from !== "string" || !SOURCE_ISO_INSTANT.test(value.from)
    || typeof value.to !== "string" || !SOURCE_ISO_INSTANT.test(value.to)
    || !Number.isFinite(Date.parse(value.from))
    || !Number.isFinite(Date.parse(value.to))) return null;
  const exactRange = Date.parse(value.from) === Date.parse(requested.from)
    && Date.parse(value.to) === Date.parse(requested.to);
  return {
    uptime: value.uptime,
    totalDowntimeSeconds: value.total_downtime_seconds,
    incidentCount: value.incident_count,
    mtbf: value.mtbf,
    from: new Date(Date.parse(value.from)).toISOString(),
    to: new Date(Date.parse(value.to)).toISOString(),
    exactRange,
  };
}

function uptimeStatsReceipt(response, requested, stats) {
  const body = {
    schema: "outsider/uptimerobot-uptime-window-provider-receipt/v1",
    schemaVersion: "1.0.0",
    provider: "UPTIMEROBOT_API_V3",
    operation: "GET_MONITOR_UPTIME_STATS",
    requestedFrom: requested.from,
    requestedTo: requested.to,
    responseStatus: response.status,
    responseBodyHash: response.bytes === null ? null : byteHash(response.bytes),
    exactRangeEchoed: stats?.exactRange === true,
    metrics: stats === null ? null : {
      uptime: stats.uptime,
      totalDowntimeSeconds: stats.totalDowntimeSeconds,
      incidentCount: stats.incidentCount,
      mtbf: stats.mtbf,
      from: stats.from,
      to: stats.to,
    },
  };
  return deepFreeze({ ...body, receiptHash: digest(body.schema, body) });
}

async function observeContinuousUptimeWindow(state, requested, options = {}) {
  if (state.monitorId === null || state.released) return {
    status: "INCONCLUSIVE",
    reason: "NO_CURRENT_WITNESS_RESERVATION",
    longitudinalWindowProven: false,
    providerReceipt: null,
  };
  if (requested.invalidReason !== undefined) {
    return {
      status: "INCONCLUSIVE",
      reason: requested.invalidReason,
      longitudinalWindowProven: false,
      providerReceipt: null,
    };
  }
  const reservedFromMs = Math.max(Date.parse(requested.from),
    Date.parse(state.plan.serviceFrom));
  const effectiveRequested = {
    ...requested,
    from: new Date(reservedFromMs).toISOString(),
    to: new Date(reservedFromMs + requested.windowMs).toISOString(),
  };
  const credential = checkCredential(state);
  if (!credential.current) return {
    status: "INCONCLUSIVE",
    reason: "CAPABILITY_EXPIRED_BEFORE_LONGITUDINAL_OBSERVATION",
    longitudinalWindowProven: false,
    providerReceipt: null,
  };
  if (Date.parse(effectiveRequested.to) > Date.parse(state.plan.serviceUntil)) {
    return {
      status: "INCONCLUSIVE",
      reason: "REQUESTED_WINDOW_OUTSIDE_RESERVED_SERVICE",
      longitudinalWindowProven: false,
      providerReceipt: null,
    };
  }
  if (Date.parse(credential.observedAt) < Date.parse(effectiveRequested.to)) {
    return {
      status: "INCONCLUSIVE",
      reason: "CONTINUOUS_WINDOW_NOT_DUE",
      retryAfter: effectiveRequested.to,
      longitudinalWindowProven: false,
      providerReceipt: null,
    };
  }
  const params = new URLSearchParams([
    ["from", effectiveRequested.from], ["to", effectiveRequested.to],
  ]);
  const response = await exchange(state,
    `${API_PREFIX}/monitors/${state.monitorId}/stats/uptime?${params}`, {
      method: "GET", headers: apiHeaders(state, false), signal: options.signal,
    });
  const stats = response.status === 200
    ? uptimeStatsRecord(response.json, effectiveRequested) : null;
  const receipt = uptimeStatsReceipt(response, effectiveRequested, stats);
  let status = "INCONCLUSIVE";
  let reason = response.status !== 200
    ? "LONGITUDINAL_STATS_UNAVAILABLE"
    : stats === null ? "LONGITUDINAL_STATS_INVALID"
      : !stats.exactRange ? "LONGITUDINAL_RANGE_NOT_EXACT"
        : null;
  if (stats?.exactRange === true) {
    const satisfied = stats.uptime === 100
      && stats.totalDowntimeSeconds === 0 && stats.incidentCount === 0;
    status = satisfied ? "SATISFIED" : "NOT_SATISFIED";
    reason = satisfied ? null : "LONGITUDINAL_WINDOW_REPORTED_FAILURE";
  }
  state.requirementMatch = status === "SATISFIED" ? true
    : status === "NOT_SATISFIED" ? false : null;
  state.observationCount += 1;
  state.latestObservationHash = receipt.receiptHash;
  return {
    status,
    reason,
    longitudinalWindowProven: status === "SATISFIED",
    windowFrom: effectiveRequested.from,
    windowTo: effectiveRequested.to,
    providerReceipt: receipt,
  };
}

export async function preflightUptimeRobotHttpWitnessV1(driver, input = {},
  options = {}) {
  const state = checkedDriver(driver, input, "PREFLIGHT_INPUT");
  const credential = checkCredential(state);
  if (!credential.current) return result(state, "CAPABILITY_EXPIRED");
  const response = await exchange(state, `${API_PREFIX}/monitors?limit=1`, {
    method: "GET", headers: apiHeaders(state, false), signal: options.signal,
  });
  state.preflightWritable = response.status === 200 ? "NOT_PROVEN_BY_READ" : null;
  const stage = response.status === 200 ? "PREFLIGHT_READ_REACHABLE"
    : response.status === 401 ? "PREFLIGHT_UNAUTHENTICATED"
      : response.status === 403 ? "PREFLIGHT_FORBIDDEN"
        : response.status === 429 ? "PREFLIGHT_RATE_LIMITED"
          : "PREFLIGHT_UNAVAILABLE";
  return result(state, stage, { network: response.contacted, preflight: true });
}

export async function reserveUptimeRobotHttpWitnessV1(driver, input = {},
  options = {}) {
  const state = checkedDriver(driver, input, "RESERVE_INPUT");
  if (!checkCredential(state).current) return result(state,
    "CAPABILITY_EXPIRED_BEFORE_CREATE");
  const prepared = prepareMutation(state, state.create);
  if (prepared === "OBSERVED") return result(state,
    "SOURCE_DECLARED_WITNESS_RESERVED");
  if (prepared === "AMBIGUOUS") return result(state,
    "CREATE_COMMIT_UNKNOWN_RECONCILE_ONLY");
  if (prepared === "TERMINAL") return result(state,
    "CREATE_TERMINAL_NO_RETRY");
  const response = await exchange(state, state.create.path, {
    method: "POST",
    headers: apiHeaders(state, true),
    body: state.create.bodyBytes,
    signal: options.signal,
  });
  const monitor = response.status === 201
    ? monitorRecord(response.json, state) : null;
  if (monitor !== null) {
    appendEvent(state, state.create, "ENDPOINT_RECEIPT_OBSERVED",
      monitorReceipt(response,
        "outsider/uptimerobot-create-monitor-receipt/v1"));
    state.monitorId = monitor.id;
    state.sourceStatus = SOURCE_STATUSES.has(monitor.status)
      ? monitor.status : null;
    state.createCommitUnknown = false;
    return result(state, "SOURCE_DECLARED_WITNESS_RESERVED",
      { network: true, create: true });
  }
  state.createCommitUnknown = true;
  if ([400, 401, 403, 409, 422, 429].includes(response.status)) {
    appendEvent(state, state.create, "AMBIGUOUS_NO_RETRY_HOLD", null,
      monitorReceipt(response,
        "outsider/uptimerobot-create-monitor-rejection/v1"));
    state.createCommitUnknown = false;
    return result(state, "CREATE_REJECTED_NO_RETRY",
      { network: response.contacted, create: true });
  }
  return result(state, "CREATE_COMMIT_UNKNOWN_RECONCILE_ONLY",
    { network: response.contacted, create: true });
}

export async function reconcileUptimeRobotHttpWitnessReservationV1(driver,
  input = {}, options = {}) {
  const state = checkedDriver(driver, input, "RECONCILE_RESERVATION_INPUT");
  if (state.monitorId !== null) return result(state,
    "SOURCE_DECLARED_WITNESS_RESERVED");
  if (state.create.currentEvent?.eventType !== "SUBMIT_ATTEMPTED") {
    return result(state, "CREATE_NOT_RECONCILABLE");
  }
  if (!checkCredential(state).current) return result(state,
    "CAPABILITY_EXPIRED_BEFORE_CREATE_RECONCILIATION");
  const params = new URLSearchParams([
    ["limit", "200"], ["name", state.plan.friendlyName],
    ["url", state.plan.targetUrl],
  ]);
  const response = await exchange(state,
    `${API_PREFIX}/monitors?${params.toString()}`, {
      method: "GET", headers: apiHeaders(state, false), signal: options.signal,
    });
  const candidates = response.status === 200 && Array.isArray(response.json?.data)
    ? response.json.data.map((value) => monitorRecord(value, state))
      .filter((value) => value !== null) : [];
  if (candidates.length === 1) {
    appendEvent(state, state.create, "ENDPOINT_RECEIPT_OBSERVED",
      monitorReceipt(response,
        "outsider/uptimerobot-create-monitor-reconciliation/v1"));
    state.monitorId = candidates[0].id;
    state.sourceStatus = SOURCE_STATUSES.has(candidates[0].status)
      ? candidates[0].status : null;
    state.createCommitUnknown = false;
    return result(state, "SOURCE_DECLARED_WITNESS_RESERVED_RECONCILED",
      { network: true, reconcileCreate: true });
  }
  if (response.status === 200) {
    appendEvent(state, state.create, "AMBIGUOUS_NO_RETRY_HOLD", null,
      monitorReceipt(response,
        "outsider/uptimerobot-create-monitor-reconciliation-terminal/v1"));
    state.createCommitUnknown = false;
    return result(state, candidates.length === 0
      ? "CREATE_SOURCE_DECLARED_ABSENT_NO_RETRY"
      : "CREATE_MULTIPLE_EXACT_MATCHES_HOLD",
    { network: true, reconcileCreate: true });
  }
  return result(state, "CREATE_RECONCILIATION_UNAVAILABLE",
    { network: response.contacted, reconcileCreate: true });
}

export async function observeUptimeRobotHttpWitnessV1(driver, input = {},
  options = {}) {
  const state = checkedDriver(driver, input, "OBSERVE_INPUT");
  if (state.monitorId === null || state.released) return result(state,
    "NO_CURRENT_WITNESS_RESERVATION");
  if (!checkCredential(state).current) return result(state,
    "CAPABILITY_EXPIRED_BEFORE_OBSERVATION");
  const response = await exchange(state,
    `${API_PREFIX}/monitors/${state.monitorId}`, {
      method: "GET", headers: apiHeaders(state, false), signal: options.signal,
    });
  const monitor = response.status === 200
    ? monitorRecord(response.json, state) : null;
  if (monitor === null) return result(state,
    response.status === 404 ? "MONITOR_SOURCE_DECLARED_ABSENT"
      : "MONITOR_OBSERVATION_UNAVAILABLE",
    { network: response.contacted, observe: true });
  state.sourceStatus = SOURCE_STATUSES.has(monitor.status)
    ? monitor.status : null;
  state.requirementMatch = state.sourceStatus === "UP" ? true
    : state.sourceStatus === "DOWN" || state.sourceStatus === "LOOKS_DOWN"
      ? false : null;
  state.observationCount += 1;
  state.latestObservationHash = digest(
    "outsider/uptimerobot-source-declared-http-observation/v1", {
      planHash: state.plan.planHash,
      observedAt: now(state),
      responseHash: byteHash(response.bytes),
      sourceStatus: state.sourceStatus,
      sourceDeclaredRequirementMatch: state.requirementMatch,
    });
  return result(state, state.requirementMatch === true
    ? "SOURCE_DECLARED_REQUIREMENT_MATCH"
    : state.requirementMatch === false
      ? "SOURCE_DECLARED_REQUIREMENT_MISMATCH"
      : "SOURCE_DECLARED_OBSERVATION_INCONCLUSIVE",
  { network: true, observe: true });
}

function ensureDeleteBinding(state) {
  if (state.deletion !== null) return;
  state.deletion = operationBinding(state, "DELETE_MONITOR", "DELETE",
    `${API_PREFIX}/monitors/${state.monitorId}`, null,
    state.plan.cleanupDeadline);
}

export async function releaseUptimeRobotHttpWitnessV1(driver, input = {},
  options = {}) {
  const state = checkedDriver(driver, input, "RELEASE_INPUT");
  if (state.released) return result(state, "WITNESS_RELEASE_SOURCE_DECLARED");
  if (state.monitorId === null) return result(state,
    "NO_WITNESS_RESERVATION_TO_RELEASE");
  if (!checkCredential(state).current) return result(state,
    "CAPABILITY_EXPIRED_BEFORE_RELEASE");
  ensureDeleteBinding(state);
  const prepared = prepareMutation(state, state.deletion);
  if (prepared === "OBSERVED") return result(state,
    "WITNESS_RELEASE_SOURCE_DECLARED");
  if (prepared === "AMBIGUOUS") return result(state,
    "DELETE_COMMIT_UNKNOWN_RECONCILE_ONLY");
  if (prepared === "TERMINAL") return result(state,
    "DELETE_TERMINAL_NO_RETRY");
  const response = await exchange(state, state.deletion.path, {
    method: "DELETE", headers: apiHeaders(state, false), signal: options.signal,
  });
  if (response.status === 200 || response.status === 204
    || response.status === 404) {
    appendEvent(state, state.deletion, "ENDPOINT_RECEIPT_OBSERVED",
      monitorReceipt(response,
        "outsider/uptimerobot-delete-monitor-receipt/v1"));
    state.released = true;
    state.deleteCommitUnknown = false;
    return result(state, "WITNESS_RELEASE_SOURCE_DECLARED",
      { network: true, delete: true });
  }
  state.deleteCommitUnknown = true;
  if ([400, 401, 403, 409, 422, 429].includes(response.status)) {
    appendEvent(state, state.deletion, "AMBIGUOUS_NO_RETRY_HOLD", null,
      monitorReceipt(response,
        "outsider/uptimerobot-delete-monitor-rejection/v1"));
    state.deleteCommitUnknown = false;
    return result(state, "DELETE_REJECTED_NO_RETRY",
      { network: response.contacted, delete: true });
  }
  return result(state, "DELETE_COMMIT_UNKNOWN_RECONCILE_ONLY",
    { network: response.contacted, delete: true });
}

export async function reconcileUptimeRobotHttpWitnessReleaseV1(driver,
  input = {}, options = {}) {
  const state = checkedDriver(driver, input, "RECONCILE_RELEASE_INPUT");
  if (state.released) return result(state, "WITNESS_RELEASE_SOURCE_DECLARED");
  if (state.deletion?.currentEvent?.eventType !== "SUBMIT_ATTEMPTED") {
    return result(state, "DELETE_NOT_RECONCILABLE");
  }
  if (!checkCredential(state).current) return result(state,
    "CAPABILITY_EXPIRED_BEFORE_DELETE_RECONCILIATION");
  const response = await exchange(state, state.deletion.path, {
    method: "GET", headers: apiHeaders(state, false), signal: options.signal,
  });
  if (response.status === 404) {
    appendEvent(state, state.deletion, "ENDPOINT_RECEIPT_OBSERVED",
      monitorReceipt(response,
        "outsider/uptimerobot-delete-monitor-reconciliation/v1"));
    state.released = true;
    state.deleteCommitUnknown = false;
    return result(state, "WITNESS_RELEASE_SOURCE_DECLARED_RECONCILED",
      { network: true, reconcileDelete: true });
  }
  if (response.status === 200 && monitorRecord(response.json, state) !== null) {
    appendEvent(state, state.deletion, "AMBIGUOUS_NO_RETRY_HOLD", null,
      monitorReceipt(response,
        "outsider/uptimerobot-delete-monitor-still-present/v1"));
    state.deleteCommitUnknown = false;
    return result(state, "DELETE_SOURCE_DECLARED_NOT_EFFECTIVE_NO_RETRY",
      { network: true, reconcileDelete: true });
  }
  return result(state, "DELETE_RECONCILIATION_UNAVAILABLE",
    { network: response.contacted, reconcileDelete: true });
}

export function createUptimeRobotProspectiveWitnessAdapterV1(driver) {
  const state = DRIVERS.get(driver);
  if (state === undefined) fail("DRIVER_NOT_MODULE_ISSUED");
  const binding = { expectedPlanHash: state.plan.planHash };
  return Object.freeze({
    schema: OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SCHEMAS.adapter,
    schemaVersion: "1.0.0",
    provider: "UPTIMEROBOT_API_V3",
    role: "INDEPENDENT_WITNESS",
    planHash: state.plan.planHash,
    preflight: (options = {}) => preflightUptimeRobotHttpWitnessV1(
      driver, binding, options),
    reserve: (options = {}) => reserveUptimeRobotHttpWitnessV1(
      driver, binding, options),
    reconcileReservation: (options = {}) =>
      reconcileUptimeRobotHttpWitnessReservationV1(driver, binding, options),
    observe: (options = {}) => observeUptimeRobotHttpWitnessV1(
      driver, binding, options),
    release: (options = {}) => releaseUptimeRobotHttpWitnessV1(
      driver, binding, options),
    reconcileRelease: (options = {}) =>
      reconcileUptimeRobotHttpWitnessReleaseV1(driver, binding, options),
  });
}

function formationOperationId(value) {
  if (typeof value !== "string" || value.length < 1
    || Buffer.byteLength(value, "utf8") > 512) fail("OPERATION_ID_INVALID");
  return value;
}

function requestedCompletionDeadline(context) {
  const candidates = [
    context?.program?.completionDeadline,
    context?.program?.lifecycle?.completionDeadline,
    context?.requirement?.completionDeadline,
    context?.binding?.completionDeadline,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return instant(candidate, "COMPLETION_DEADLINE");
    }
  }
  return null;
}

function providerReceipt(projection) {
  return Object.freeze({
    provider: "UPTIMEROBOT_API_V3",
    projectionHash: projection.projectionHash,
    sourceDeclared: true,
    providerAcknowledgementIsOutcomeTruth: false,
    independentOutcomeTruthEstablished: false,
  });
}

function formationReservationId(state, operationId) {
  return digest("outsider/uptimerobot-formation-reservation/v1", {
    planHash: state.plan.planHash,
    operationId,
    privateMonitorId: state.monitorId,
  });
}

function operationMismatchResult(kind, operationId) {
  return Object.freeze({
    status: kind === "OBSERVE" ? "INCONCLUSIVE" : "UNAVAILABLE",
    operationId,
    reason: "OPERATION_ID_MISMATCH",
    sourceDeclared: false,
    independentOutcomeTruthEstablished: false,
  });
}

/**
 * Thin execution wrapper for the production formation orchestrator.
 *
 * UptimeRobot has no mutation idempotency header. The supplied operationId is
 * therefore the adapter's single local idempotency/reconciliation key: a
 * repeated reserve/release with the same key goes to exact-source
 * reconciliation after an ambiguous response, while a different key cannot
 * cause a second mutation. Safe observations are cached per operationId; the
 * caller uses a new operationId for a new poll occurrence.
 */
export function createUptimeRobotFormationWitnessAdapterV1(driver) {
  const state = DRIVERS.get(driver);
  if (state === undefined) fail("DRIVER_NOT_MODULE_ISSUED");
  const binding = Object.freeze({ expectedPlanHash: state.plan.planHash });
  let reserveOperationId = state.formationReserveOperationId;
  let releaseOperationId = null;
  let reservationId = state.formationReservationId;
  const observationResults = new Map();
  let releasedResult = null;

  async function reserve(context = {}) {
    const operationId = formationOperationId(context.operationId);
    if (reserveOperationId !== null && reserveOperationId !== operationId) {
      return operationMismatchResult("RESERVE", operationId);
    }
    reserveOperationId = operationId;
    const completionDeadline = requestedCompletionDeadline(context);
    if (completionDeadline !== null
      && Date.parse(state.plan.cleanupDeadline) < Date.parse(completionDeadline)) {
      return Object.freeze({
        status: "UNAVAILABLE",
        operationId,
        reason: "WITNESS_WINDOW_ENDS_BEFORE_COMPLETION_DEADLINE",
        validUntil: state.plan.cleanupDeadline,
        sourceDeclared: false,
      });
    }
    let sourceResult;
    if (state.create.currentEvent?.eventType === "SUBMIT_ATTEMPTED") {
      sourceResult = await reconcileUptimeRobotHttpWitnessReservationV1(
        driver, binding, context.options ?? {});
    } else {
      sourceResult = await reserveUptimeRobotHttpWitnessV1(
        driver, binding, context.options ?? {});
    }
    const source = sourceResult.publicProjection;
    if (source.sourceDeclaredWitnessReservationCurrent) {
      reservationId ??= formationReservationId(state, operationId);
      state.formationReservationId = reservationId;
      state.formationReserveOperationId = operationId;
      return Object.freeze({
        status: "RESERVED",
        reservationId,
        validUntil: state.plan.cleanupDeadline,
        operationId,
        providerReceipt: providerReceipt(source),
        adapterState: createAdapterState(state),
        sourceDeclared: true,
        independentOutcomeTruthEstablished: false,
      });
    }
    return Object.freeze({
      status: source.createCommitUnknown ? "PENDING" : "UNAVAILABLE",
      operationId,
      reason: source.stage,
      validUntil: state.plan.cleanupDeadline,
      providerReceipt: providerReceipt(source),
      adapterState: createAdapterState(state),
      sourceDeclared: true,
      independentOutcomeTruthEstablished: false,
    });
  }

  async function observe(context = {}) {
    const operationId = formationOperationId(context.operationId);
    if (observationResults.has(operationId)) {
      return observationResults.get(operationId);
    }
    if (reservationId === null
      || context.reservation?.reservationId !== reservationId) {
      return operationMismatchResult("OBSERVE", operationId);
    }
    const continuous = continuousCriterion(context);
    if (continuous !== null) {
      const result = await observeContinuousUptimeWindow(
        state, continuous, context.options ?? {});
      const output = Object.freeze({
        ...result,
        observationId: result.providerReceipt?.receiptHash ?? digest(
          "outsider/uptimerobot-inconclusive-window-observation/v1", {
            operationId,
            reason: result.reason,
            from: continuous.from ?? null,
            to: continuous.to ?? null,
          }),
        reservationId,
        operationId,
        adapterState: createAdapterState(state),
        sourceDeclared: result.providerReceipt !== null,
        independentOutcomeTruthEstablished: false,
      });
      observationResults.set(operationId, output);
      return output;
    }
    const sourceResult = await observeUptimeRobotHttpWitnessV1(
      driver, binding, context.options ?? {});
    const source = sourceResult.publicProjection;
    const status = source.sourceDeclaredRequirementMatch === true
      ? "SATISFIED" : source.sourceDeclaredRequirementMatch === false
        ? "NOT_SATISFIED" : "INCONCLUSIVE";
    const output = Object.freeze({
      status,
      observationId: source.latestObservationHash ?? digest(
        "outsider/uptimerobot-inconclusive-observation/v1", {
          operationId, projectionHash: source.projectionHash,
        }),
      reservationId,
      operationId,
      providerReceipt: providerReceipt(source),
      adapterState: createAdapterState(state),
      sourceDeclared: true,
      independentOutcomeTruthEstablished: false,
    });
    observationResults.set(operationId, output);
    return output;
  }

  async function release(context = {}) {
    const operationId = formationOperationId(context.operationId);
    if (releasedResult !== null) return releasedResult;
    if (releaseOperationId !== null && releaseOperationId !== operationId) {
      return operationMismatchResult("RELEASE", operationId);
    }
    releaseOperationId = operationId;
    let sourceResult;
    if (state.deletion?.currentEvent?.eventType === "SUBMIT_ATTEMPTED") {
      sourceResult = await reconcileUptimeRobotHttpWitnessReleaseV1(
        driver, binding, context.options ?? {});
    } else {
      sourceResult = await releaseUptimeRobotHttpWitnessV1(
        driver, binding, context.options ?? {});
    }
    const source = sourceResult.publicProjection;
    const stateHandle = createAdapterState(state);
    const output = Object.freeze({
      status: source.releaseSourceDeclared ? "RELEASED"
        : source.deleteCommitUnknown ? "PENDING" : "UNAVAILABLE",
      reservationId,
      operationId,
      reason: source.stage,
      providerReceipt: providerReceipt(source),
      receipt: source.releaseSourceDeclared ? stateHandle?.handleHash ?? null
        : null,
      adapterState: stateHandle,
      sourceDeclared: true,
    });
    if (source.releaseSourceDeclared) releasedResult = output;
    return output;
  }

  async function closeObligation(context = {}) {
    if (state.released) {
      const stateHandle = createAdapterState(state);
      return Object.freeze({
        status: "CLOSED",
        reservationId,
        operationId: formationOperationId(context.operationId),
        closureKind: "WITNESS_MONITOR_RELEASED",
        receipt: stateHandle?.handleHash ?? null,
        adapterState: stateHandle,
      });
    }
    const releaseResult = await release(context);
    return Object.freeze({
      status: releaseResult.status === "RELEASED" ? "CLOSED" : "OPEN",
      reservationId,
      operationId: releaseResult.operationId,
      closureKind: releaseResult.status === "RELEASED"
        ? "WITNESS_MONITOR_RELEASED" : "WITNESS_RELEASE_NOT_CLOSED",
      receipt: releaseResult.status === "RELEASED"
        ? releaseResult.adapterState?.handleHash ?? null : null,
      providerReceipt: releaseResult.providerReceipt,
      adapterState: releaseResult.adapterState,
    });
  }

  return Object.freeze({
    adapterId:
      `uptimerobot-http-witness-v1:${state.plan.planHash.slice(7, 23)}`,
    providerRef: "uptimerobot-api-v3",
    capabilities: Object.freeze(["PUBLIC_HTTPS_LONGITUDINAL_OBSERVATION"]),
    supports: (requirement) =>
      requirement?.role === "INDEPENDENT_WITNESS"
      && requirement?.capability === "PUBLIC_HTTPS_LONGITUDINAL_OBSERVATION"
      && (!Number.isSafeInteger(requirement.minimumReservationMs)
        || requirement.minimumReservationMs
          <= Date.parse(state.plan.cleanupDeadline)
            - Date.parse(state.plan.serviceFrom)),
    reserve,
    observe,
    release,
    closeObligation,
  });
}
