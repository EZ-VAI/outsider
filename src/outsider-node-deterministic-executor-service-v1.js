/*
 * Node-compatible deterministic executor service v1.
 *
 * Registrations exist only in the process-local factory closure. A network
 * invocation carries the hash-only Formation Job envelope and can neither add
 * nor replace a plan, capability, request URL, prompt, code, credential, or
 * payment instrument. The exact factory-issued stage plan delegates provider
 * effects, source occurrences, and cold replay to the existing buyer-native
 * transaction runtime.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { canonicalizeStrict } from "./canonical.js";
import {
  executeDeterministicBuyerNativeStagePlanV1,
} from "./outsider-deterministic-buyer-native-plan-runtime-v1.js";
import {
  formationJobIdentityV1,
  normalizeFormationJobV1,
} from "./outsider-formation-job-worker-v1.js";

const PREFIX = "OUTSIDER_NODE_DETERMINISTIC_EXECUTOR_SERVICE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_PRIVATE_PARAMETER_BYTES = 1024 * 1024;
const MAX_HTTP_BODY_BYTES = 16 * 1024;
const SIDE_EFFECT_OPERATIONS = Object.freeze(new Set([
  "HOLD", "RESERVE", "COMMIT", "CANCEL", "RECOVER",
]));
const SERVICES = new WeakMap();

export const OUTSIDER_NODE_DETERMINISTIC_EXECUTOR_SERVICE_V1_SCHEMAS
  = Object.freeze({
    invocation: "outsider/formation-executor-invocation/v1",
    registry: "outsider/node-deterministic-executor-registry/v1",
  });

export const OUTSIDER_NODE_DETERMINISTIC_EXECUTOR_SERVICE_V1_BOUNDARY
  = Object.freeze({
    position: "VERSION_PINNED_FORMATION_JOB_EXECUTOR",
    planRuntimeVersion: "outsider/deterministic-buyer-native-stage-plan/v1",
    precommitOperationsOnly: Object.freeze(["QUOTE", "HOLD", "STATUS"]),
    consequentialOperationsAccepted: false,
    reserveCommitCancelRecoverRequireAtomicCoordinator: true,
    registrationMutationAfterFactoryCreation: false,
    factoryIssuedPlanRequired: true,
    factoryIssuedCapabilityRequired: true,
    capabilityBindingHashCheckedBeforeEffect: true,
    privateParameterEnvelopeHashCheckedBeforeEffect: true,
    orderOutcomeAndTypedGraphBindingCheckedBeforeEffect: true,
    promptAcceptedOverNetwork: false,
    arbitraryUrlAcceptedOverNetwork: false,
    executableCodeAcceptedOverNetwork: false,
    credentialAcceptedOverNetwork: false,
    paymentMaterialAcceptedOverNetwork: false,
    privateParameterEnvelopeProjected: false,
    manualQueueAvailable: false,
    modelCalls: 0,
    browserClicks: 0,
    employeeTouches: 0,
    userBabysitting: 0,
    sourceOccurrenceTruthUpgraded: false,
    authorityMinted: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(`${code}_INVALID`);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function bindingKey(value) {
  return `${value.adapterId}\0${value.adapterVersion}\0${value.planHash}`;
}

function unavailable(entryHash, reasonCode) {
  return Object.freeze({
    state: "UNAVAILABLE",
    reasonCode,
    resultHash: digest("outsider/node-deterministic-executor-unavailable/v1", {
      entryHash,
      reasonCode,
    }),
    sourceOccurrenceHashes: Object.freeze([]),
    externalEffect: "NONE",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function interrupted(entryHash) {
  return Object.freeze({
    state: "HOLD",
    reasonCode: "EXECUTOR_INTERRUPTED_EFFECT_UNKNOWN",
    resultHash: digest("outsider/node-deterministic-executor-interrupted/v1", {
      entryHash,
    }),
    sourceOccurrenceHashes: Object.freeze([]),
    externalEffect: "UNKNOWN",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function executionResult(result) {
  const projection = result.publicProjection;
  const sourceOccurrenceHashes = [];
  const seen = new Set();
  let sideEffectReached = false;
  for (const stage of projection.stages) {
    if (SIDE_EFFECT_OPERATIONS.has(stage.operation)) sideEffectReached = true;
    const occurrenceHash = stage.result.sourceOccurrenceHash;
    if (occurrenceHash !== null && !seen.has(occurrenceHash)) {
      hash(occurrenceHash, "SOURCE_OCCURRENCE_HASH");
      seen.add(occurrenceHash);
      sourceOccurrenceHashes.push(occurrenceHash);
    }
  }
  let state = "COMPLETED";
  let reasonCode = "PLAN_EXECUTED";
  let externalEffect = sideEffectReached ? "CONFIRMED" : "READ_ONLY";
  if (projection.executionState === "AMBIGUOUS_NO_RETRY_HOLD") {
    state = "HOLD";
    reasonCode = "AMBIGUOUS_NO_RETRY_HOLD";
    externalEffect = "UNKNOWN";
  } else if (projection.executionState === "SOURCE_REJECTED") {
    state = "UNAVAILABLE";
    reasonCode = "SOURCE_REJECTED";
    externalEffect = sideEffectReached ? "ATTEMPTED" : "READ_ONLY";
  } else if (projection.executionState !== "COMPLETED") {
    fail("EXECUTION_STATE_INVALID");
  }
  return Object.freeze({
    state,
    reasonCode,
    resultHash: digest("outsider/node-deterministic-executor-result/v1",
      projection),
    sourceOccurrenceHashes: Object.freeze(sourceOccurrenceHashes),
    externalEffect,
    retryDisposition: "DO_NOT_RETRY",
  });
}

function normalizeRegistration(raw, journalDirectory) {
  exact(raw, ["adapterId", "adapterVersion", "orderId", "outcomeProgramHash",
    "graphRefs", "parameterEnvelopeBytes", "plan", "capability"],
  "REGISTRATION");
  if (!Buffer.isBuffer(raw.parameterEnvelopeBytes)
    || raw.parameterEnvelopeBytes.length < 1
    || raw.parameterEnvelopeBytes.length > MAX_PRIVATE_PARAMETER_BYTES) {
    fail("PRIVATE_PARAMETER_ENVELOPE_INVALID");
  }
  if (raw.plan === null || typeof raw.plan !== "object"
    || !HASH.test(String(raw.plan.planHash ?? ""))) fail("PLAN_INVALID");
  if (raw.capability === null || typeof raw.capability !== "object"
    || !HASH.test(String(raw.capability.capabilityBindingHash ?? ""))) {
    fail("CAPABILITY_INVALID");
  }
  if (raw.plan.capabilityBindingHash !== raw.capability.capabilityBindingHash) {
    fail("CAPABILITY_BINDING_MISMATCH");
  }
  const parameterEnvelopeBytes = Buffer.from(raw.parameterEnvelopeBytes);
  const normalized = normalizeFormationJobV1({
    schema: "outsider/formation-job/v1",
    orderId: raw.orderId,
    planHash: raw.plan.planHash,
    adapterBinding: { adapterId: raw.adapterId,
      adapterVersion: raw.adapterVersion },
    outcomeProgramHash: raw.outcomeProgramHash,
    parameterEnvelopeHash: bytesHash(parameterEnvelopeBytes),
    graphRefs: raw.graphRefs,
    issuedAt: "2000-01-01T00:00:00.000Z",
    expiresAt: "2100-01-01T00:00:00.000Z",
  });
  const publicBinding = Object.freeze({
    adapterId: normalized.adapterBinding.adapterId,
    adapterVersion: normalized.adapterBinding.adapterVersion,
    orderId: normalized.orderId,
    planHash: normalized.planHash,
    outcomeProgramHash: normalized.outcomeProgramHash,
    parameterEnvelopeHash: normalized.parameterEnvelopeHash,
    graphRefs: normalized.graphRefs,
    capabilityBindingHash: raw.capability.capabilityBindingHash,
  });
  const entryHash = digest("outsider/node-deterministic-executor-entry/v1",
    publicBinding);
  const journalId = `transaction_${createHash("sha256")
    .update(`${normalized.orderId}\0${normalized.planHash}`, "utf8")
    .digest("hex").slice(0, 32)}`;
  return Object.freeze({
    key: bindingKey({ ...normalized.adapterBinding,
      planHash: normalized.planHash }),
    entryHash,
    publicBinding,
    plan: raw.plan,
    capability: raw.capability,
    parameterEnvelopeBytes,
    journalDirectory,
    journalId,
  });
}

function sameGraph(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

/**
 * Create one immutable process-local registry and execution service.
 * Registrations cannot be added through the returned object or through HTTP.
 */
export function createNodeDeterministicExecutorServiceV1(input = {}) {
  exact(input, ["registrations", "journalDirectory", "clock",
    "monotonicClock"], "SERVICE_INPUT");
  if (!Array.isArray(input.registrations) || input.registrations.length < 1
    || input.registrations.length > 256
    || typeof input.journalDirectory !== "string"
    || input.journalDirectory.length < 1 || typeof input.clock !== "function"
    || typeof input.monotonicClock !== "function") fail("SERVICE_CONFIG_INVALID");
  const entries = new Map();
  for (const raw of input.registrations) {
    const entry = normalizeRegistration(raw, input.journalDirectory);
    if (entries.has(entry.key)) fail("REGISTRATION_DUPLICATE");
    entries.set(entry.key, entry);
  }
  const publicRegistry = Object.freeze({
    schema: OUTSIDER_NODE_DETERMINISTIC_EXECUTOR_SERVICE_V1_SCHEMAS.registry,
    schemaVersion: "1.0.0",
    registrationCount: entries.size,
    registrations: Object.freeze([...entries.values()].map((entry) =>
      entry.publicBinding)),
    privateParameterEnvelopeProjected: false,
    registryMutable: false,
    boundary: OUTSIDER_NODE_DETERMINISTIC_EXECUTOR_SERVICE_V1_BOUNDARY,
  });

  async function handleInvocation(rawInvocation) {
    exact(rawInvocation, ["schema", "job", "jobHash", "jobKey"],
      "INVOCATION");
    if (rawInvocation.schema
      !== OUTSIDER_NODE_DETERMINISTIC_EXECUTOR_SERVICE_V1_SCHEMAS.invocation) {
      fail("INVOCATION_SCHEMA_INVALID");
    }
    const identity = formationJobIdentityV1(rawInvocation.job);
    if (identity.jobHash !== rawInvocation.jobHash
      || identity.jobKey !== rawInvocation.jobKey) fail("INVOCATION_HASH_MISMATCH");
    const entry = entries.get(bindingKey({
      adapterId: identity.job.adapterBinding.adapterId,
      adapterVersion: identity.job.adapterBinding.adapterVersion,
      planHash: identity.job.planHash,
    }));
    if (entry === undefined) {
      return unavailable(identity.jobHash, "REGISTRATION_NOT_FOUND");
    }
    const bindingMatches = identity.job.orderId === entry.publicBinding.orderId
      && identity.job.outcomeProgramHash
        === entry.publicBinding.outcomeProgramHash
      && identity.job.parameterEnvelopeHash
        === entry.publicBinding.parameterEnvelopeHash
      && sameGraph(identity.job.graphRefs, entry.publicBinding.graphRefs);
    if (!bindingMatches) return unavailable(entry.entryHash, "JOB_BINDING_MISMATCH");
    if (entry.plan.planHash !== identity.job.planHash
      || entry.capability.capabilityBindingHash
        !== entry.plan.capabilityBindingHash) {
      return unavailable(entry.entryHash, "PLAN_CAPABILITY_BINDING_MISMATCH");
    }
    try {
      return executionResult(await executeDeterministicBuyerNativeStagePlanV1({
        plan: entry.plan,
        expectedPlanHash: identity.job.planHash,
        journalDirectory: entry.journalDirectory,
        journalId: entry.journalId,
      }, {
        capability: entry.capability,
        clock: input.clock,
        monotonicClock: input.monotonicClock,
      }));
    } catch {
      return interrupted(entry.entryHash);
    }
  }

  const service = Object.freeze({
    async executeFrozenPlan(value) {
      exact(value, ["job", "jobHash", "jobKey"], "EXECUTE_INPUT");
      return handleInvocation({
        schema:
          OUTSIDER_NODE_DETERMINISTIC_EXECUTOR_SERVICE_V1_SCHEMAS.invocation,
        job: value.job,
        jobHash: value.jobHash,
        jobKey: value.jobKey,
      });
    },
    handleInvocation,
    describe() { return publicRegistry; },
  });
  SERVICES.set(service, true);
  return service;
}

function authorized(header, expected) {
  const prefix = "Bearer ";
  const presented = typeof header === "string" && header.startsWith(prefix)
    ? header.slice(prefix.length) : "";
  const left = createHash("sha256").update(presented).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right) && presented.length === expected.length;
}

function writeJson(response, statusCode, body) {
  const bytes = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(bytes.length),
    "cache-control": "no-store, max-age=0",
    "x-content-type-options": "nosniff",
  });
  response.end(bytes);
}

function httpErrorStatus(error) {
  const code = String(error?.outsiderCode ?? error?.message ?? error)
    .split(":", 1)[0];
  const statusCode = code.includes("TOO_LARGE") ? 413
    : code.includes("CONTENT_TYPE") ? 415 : 400;
  return { statusCode, code };
}

async function readHttpBody(request) {
  const declared = request.headers["content-length"];
  if (declared !== undefined && (!/^[0-9]{1,6}$/u.test(String(declared))
    || Number(declared) > MAX_HTTP_BODY_BYTES)) fail("HTTP_BODY_TOO_LARGE");
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_HTTP_BODY_BYTES) fail("HTTP_BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  if (total < 1) fail("HTTP_BODY_INVALID");
  try { return JSON.parse(Buffer.concat(chunks, total).toString("utf8")); }
  catch { fail("HTTP_BODY_INVALID_JSON"); }
}

/** Build a bounded bearer-authenticated Node request handler. */
export function createNodeDeterministicExecutorHttpHandlerV1(input = {}) {
  exact(input, ["service", "bearerToken"], "HTTP_HANDLER_INPUT");
  if (SERVICES.get(input.service) !== true || typeof input.bearerToken !== "string"
    || Buffer.byteLength(input.bearerToken, "utf8") < 32
    || Buffer.byteLength(input.bearerToken, "utf8") > 512) {
    fail("HTTP_HANDLER_CONFIG_INVALID");
  }
  return async function handler(request, response) {
    if (request.method === "GET" && request.url === "/healthz") {
      writeJson(response, 200, { ok: true,
        service: "outsider-node-deterministic-executor", version: "1.0.0",
        registry: input.service.describe() });
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/execute-frozen-plan") {
      writeJson(response, 404, { ok: false, error: "NOT_FOUND" });
      return;
    }
    if (!authorized(request.headers.authorization, input.bearerToken)) {
      writeJson(response, 401, { ok: false, error: "UNAUTHORIZED" });
      return;
    }
    if (String(request.headers["content-type"] ?? "")
      .split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      writeJson(response, 415, { ok: false, error: "CONTENT_TYPE_INVALID" });
      return;
    }
    try {
      writeJson(response, 200,
        await input.service.handleInvocation(await readHttpBody(request)));
    } catch (error) {
      const failure = httpErrorStatus(error);
      writeJson(response, failure.statusCode,
        { ok: false, error: failure.code });
    }
  };
}

/** Start a Node HTTP server from an already factory-injected service. */
export async function startNodeDeterministicExecutorHttpServerV1(input = {}) {
  exact(input, ["service", "bearerToken", "host", "port"],
    "HTTP_SERVER_INPUT");
  if (typeof input.host !== "string" || input.host.length < 1
    || !Number.isSafeInteger(input.port) || input.port < 0 || input.port > 65535) {
    fail("HTTP_SERVER_ADDRESS_INVALID");
  }
  const server = createServer(createNodeDeterministicExecutorHttpHandlerV1({
    service: input.service,
    bearerToken: input.bearerToken,
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, input.host, resolve);
  });
  return Object.freeze({
    server,
    address: server.address(),
    async close() {
      await new Promise((resolve, reject) => server.close((error) =>
        error ? reject(error) : resolve()));
    },
  });
}
