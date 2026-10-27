/*
 * User-held Formation executor client v1.
 *
 * The client only opens outbound HTTPS requests.  It claims one pre-enqueued
 * hash-only job, executes the matching process-local private binding, and
 * returns a keyed, hash-only result.  It deliberately has no discovery,
 * browser, payment, order, retry, or central private-envelope upload path.
 */

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS,
  assertUserHeldFormationPrivateBindingV1,
  createUserHeldFormationExecutionClaimRequestV1,
  createUserHeldFormationExecutionResultSubmissionV1,
  deriveUserHeldFormationExecutorCapabilityHashV1,
  normalizeUserHeldFormationExecutionCompletionAckV1,
  normalizeUserHeldFormationExecutionClaimResponseV1,
} from "./outsider-user-held-formation-executor-protocol-v1.js";

const PREFIX = "OUTSIDER_USER_HELD_FORMATION_EXECUTOR_CLIENT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_RESPONSE_BYTES = 64 * 1024;
const PUBLISH_REQUEST_SCHEMA
  = "outsider/user-held-formation-execution-publish-request/v1";
const PUBLISH_RESPONSE_SCHEMA
  = "outsider/user-held-formation-execution-publish-response/v1";

export const OUTSIDER_USER_HELD_FORMATION_EXECUTOR_CLIENT_V1_BOUNDARY
  = Object.freeze({
    networkDirection: "USER_NODE_OUTBOUND_ONLY",
    centralOriginFromJob: false,
    arbitraryProviderUrlFromJob: false,
    privateParameterUpload: false,
    unkeyedPrivateHashUpload: false,
    durableHashOnlyPublication: true,
    browserActions: 0,
    modelCalls: 0,
    paymentActions: 0,
    orderActions: 0,
    automaticRetry: false,
    reconciliationRequiresLocalReplayGuard: true,
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

function centralOrigin(value) {
  if (typeof value !== "string" || value.length > 2048) fail("ORIGIN_INVALID");
  let parsed;
  try { parsed = new URL(value); }
  catch { fail("ORIGIN_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.pathname !== "/"
    || parsed.search !== "" || parsed.hash !== "") fail("ORIGIN_INVALID");
  return parsed.origin;
}

function bearer(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32
    || Buffer.byteLength(value, "utf8") > 512
    || /[\u0000-\u0020\u007f]/u.test(value)) fail("BEARER_TOKEN_INVALID");
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

async function responseJson(response, code) {
  if (!(response instanceof Response)) fail(`${code}_RESPONSE_INVALID`);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d{1,6}$/u.test(declared)
    || Number(declared) > MAX_RESPONSE_BYTES)) fail(`${code}_RESPONSE_TOO_LARGE`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 2 || bytes.length > MAX_RESPONSE_BYTES) {
    fail(`${code}_RESPONSE_TOO_LARGE`);
  }
  try {
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
  } catch { fail(`${code}_RESPONSE_INVALID_JSON`); }
}

async function post(fetchImpl, url, token, body, code) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: Object.freeze({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    }),
    body: canonicalizeStrict(body),
  });
  if (response.status !== 200) fail(`${code}_HTTP_${response.status}`);
  return responseJson(response, code);
}

/**
 * Publish one already-bound user-held job without uploading its private
 * parameter bytes, provider route, or unkeyed local hashes. Publication uses
 * the Formation credential; the later claim and receipt use a distinct,
 * order-scoped executor bearer.
 */
export async function publishUserHeldFormationExecutionV1(input = {},
  dependencies = {}) {
  exact(input, ["centralOrigin", "publicationBearerToken",
    "executorCapabilityHash", "binding"], "PUBLISH_INPUT");
  exact(dependencies, ["fetchImpl", "clock"], "PUBLISH_DEPENDENCIES");
  if (typeof dependencies.fetchImpl !== "function"
    || typeof dependencies.clock !== "function") fail("DEPENDENCIES_INVALID");
  const origin = centralOrigin(input.centralOrigin);
  const token = bearer(input.publicationBearerToken);
  const executorCapabilityHash = hash(input.executorCapabilityHash,
    "EXECUTOR_CAPABILITY_HASH");
  const binding = assertUserHeldFormationPrivateBindingV1(input.binding);
  const publishedAt = instant(dependencies.clock(), "CLOCK");
  const request = Object.freeze({
    schema: PUBLISH_REQUEST_SCHEMA,
    job: binding.job,
    bindingProjection: binding.publicProjection,
    executorCapabilityHash,
    publishedAt,
  });
  const response = await dependencies.fetchImpl(
    `${origin}/v1/client-executions`, {
      method: "POST",
      headers: Object.freeze({
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      }),
      body: canonicalizeStrict(request),
    });
  if (!(response instanceof Response)
    || ![200, 201].includes(response.status)) {
    fail(`PUBLISH_HTTP_${response instanceof Response
      ? response.status : "INVALID"}`);
  }
  const body = await responseJson(response, "PUBLISH");
  exact(body, ["schema", "apiVersion", "ok", "state", "jobKey", "jobHash",
    "replayed", "durableStorage", "privateParameterBytesStored",
    "privateParameterUnkeyedHashStored", "authorityMinted",
    "capacityEstablished", "independentOutcomeTruthEstablished",
    "outcomeCommitted"], "PUBLISH_RESPONSE");
  if (body.schema !== PUBLISH_RESPONSE_SCHEMA || body.apiVersion !== "2.5.0"
    || body.ok !== true || body.state !== "PUBLISHED"
    || body.jobKey !== binding.jobKey || body.jobHash !== binding.jobHash
    || typeof body.replayed !== "boolean"
    || body.durableStorage !== "SQLITE_DURABLE_OBJECT"
    || body.privateParameterBytesStored !== false
    || body.privateParameterUnkeyedHashStored !== false
    || body.authorityMinted !== false || body.capacityEstablished !== false
    || body.independentOutcomeTruthEstablished !== false
    || body.outcomeCommitted !== false) fail("PUBLISH_RESPONSE_MISMATCH");
  return Object.freeze({
    state: body.state,
    replayed: body.replayed,
    jobKey: body.jobKey,
    jobHash: body.jobHash,
    publishedAt,
    privateParameterBytesStored: false,
    privateParameterUnkeyedHashStored: false,
    authorityMinted: false,
    capacityEstablished: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });
}

/** Execute at most one claimed job.  This function never retries a request. */
export async function runUserHeldFormationExecutorOnceV1(input = {},
  dependencies = {}) {
  exact(input, ["centralOrigin", "bearerToken", "executorCapabilityHash",
    "binding"], "INPUT");
  exact(dependencies, ["fetchImpl", "clock"], "DEPENDENCIES");
  if (typeof dependencies.fetchImpl !== "function"
    || typeof dependencies.clock !== "function") fail("DEPENDENCIES_INVALID");
  const origin = centralOrigin(input.centralOrigin);
  const token = bearer(input.bearerToken);
  const executorCapabilityHash = hash(input.executorCapabilityHash,
    "EXECUTOR_CAPABILITY_HASH");
  const binding = assertUserHeldFormationPrivateBindingV1(input.binding);
  if (executorCapabilityHash
    !== deriveUserHeldFormationExecutorCapabilityHashV1({
      bearerToken: token,
      jobHash: binding.jobHash,
    })) fail("EXECUTOR_CAPABILITY_BEARER_MISMATCH");
  const requestedAt = instant(dependencies.clock(), "CLOCK");
  const claimRequest = createUserHeldFormationExecutionClaimRequestV1({
    jobKey: binding.jobKey,
    jobHash: binding.jobHash,
    executorCapabilityHash,
    requestedAt,
  });
  const claim = normalizeUserHeldFormationExecutionClaimResponseV1(
    await post(dependencies.fetchImpl,
      `${origin}/v1/client-execution-claims`, token, claimRequest, "CLAIM"));
  if (claim.jobKey !== binding.jobKey || claim.jobHash !== binding.jobHash) {
    fail("CLAIM_JOB_MISMATCH");
  }
  if (claim.state === "HOLD") fail("CLAIM_HOLD");
  if (claim.state === "COMPLETE") {
    return Object.freeze({
      state: "COMPLETE",
      replayed: true,
      executionPerformed: false,
      jobKey: binding.jobKey,
      jobHash: binding.jobHash,
      resultHash: claim.completion.result.resultHash,
      receiptHash: claim.completion.receiptHash,
      authorityMinted: false,
      independentOutcomeTruthEstablished: false,
      outcomeCommitted: false,
    });
  }
  if (Date.parse(requestedAt) >= Date.parse(claim.leaseExpiresAt)) {
    fail("CLAIM_EXPIRED");
  }
  const result = await binding.executeFrozenPlan(claim.invocation);
  const submittedAt = instant(dependencies.clock(), "CLOCK");
  const submission = createUserHeldFormationExecutionResultSubmissionV1({
    jobKey: binding.jobKey,
    jobHash: binding.jobHash,
    leaseHash: claim.leaseHash,
    submittedAt,
    result,
  });
  const completion = normalizeUserHeldFormationExecutionCompletionAckV1(
    await post(dependencies.fetchImpl,
    `${origin}/v1/client-executions/${binding.jobKey}/receipt`,
    token, submission, "RESULT"));
  if (completion.jobKey !== binding.jobKey
    || completion.jobHash !== binding.jobHash
    || completion.leaseHash !== claim.leaseHash
    || completion.result.resultHash !== result.resultHash) {
    fail("COMPLETION_RESULT_MISMATCH");
  }
  return Object.freeze({
    state: "COMPLETE",
    replayed: false,
    executionPerformed: true,
    jobKey: binding.jobKey,
    jobHash: binding.jobHash,
    resultHash: completion.result.resultHash,
    receiptHash: completion.receiptHash,
    authorityMinted: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });
}

/**
 * Reconcile one already-claimed execution from its user-node durable replay.
 *
 * The caller must give the binding an executor whose provider transport is
 * hard-disabled. A production HOLD claim intentionally omits the invocation;
 * the immutable public job and the existing lease are sufficient to rebuild
 * it locally. Missing/incomplete local evidence resolves to UNKNOWN and is
 * interlocked before any receipt is submitted.
 */
export async function reconcileUserHeldFormationExecutorOnceV1(input = {},
  dependencies = {}) {
  exact(input, ["centralOrigin", "bearerToken", "executorCapabilityHash",
    "binding"], "RECONCILE_INPUT");
  exact(dependencies, ["fetchImpl", "clock", "localReplayGuard"],
    "RECONCILE_DEPENDENCIES");
  if (typeof dependencies.fetchImpl !== "function"
    || typeof dependencies.clock !== "function"
    || typeof dependencies.localReplayGuard !== "function") {
    fail("DEPENDENCIES_INVALID");
  }
  const origin = centralOrigin(input.centralOrigin);
  const token = bearer(input.bearerToken);
  const executorCapabilityHash = hash(input.executorCapabilityHash,
    "EXECUTOR_CAPABILITY_HASH");
  const binding = assertUserHeldFormationPrivateBindingV1(input.binding);
  if (executorCapabilityHash
    !== deriveUserHeldFormationExecutorCapabilityHashV1({
      bearerToken: token,
      jobHash: binding.jobHash,
    })) fail("EXECUTOR_CAPABILITY_BEARER_MISMATCH");
  const requestedAt = instant(dependencies.clock(), "CLOCK");
  const claimRequest = createUserHeldFormationExecutionClaimRequestV1({
    jobKey: binding.jobKey,
    jobHash: binding.jobHash,
    executorCapabilityHash,
    requestedAt,
  });
  const claim = normalizeUserHeldFormationExecutionClaimResponseV1(
    await post(dependencies.fetchImpl,
      `${origin}/v1/client-execution-claims`, token, claimRequest, "CLAIM"));
  if (claim.jobKey !== binding.jobKey || claim.jobHash !== binding.jobHash) {
    fail("CLAIM_JOB_MISMATCH");
  }
  if (claim.state === "COMPLETE") {
    return Object.freeze({
      state: "COMPLETE",
      replayed: true,
      reconciled: true,
      executionPerformed: false,
      localDurableReplayPerformed: false,
      receiptSubmitted: false,
      jobKey: binding.jobKey,
      jobHash: binding.jobHash,
      resultHash: claim.completion.result.resultHash,
      receiptHash: claim.completion.receiptHash,
      authorityMinted: false,
      independentOutcomeTruthEstablished: false,
      outcomeCommitted: false,
    });
  }
  if (claim.leaseHash === null || claim.leaseExpiresAt === null) {
    fail("RECONCILIATION_LEASE_UNAVAILABLE");
  }
  if (Date.parse(requestedAt) >= Date.parse(claim.leaseExpiresAt)) {
    fail("RECONCILIATION_LEASE_EXPIRED");
  }
  const invocation = claim.state === "CLAIMED" ? claim.invocation
    : Object.freeze({
      schema:
        OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.invocation,
      job: binding.job,
      jobHash: binding.jobHash,
      jobKey: binding.jobKey,
    });
  const result = await binding.executeFrozenPlan(invocation);
  if (dependencies.localReplayGuard(result) !== true
    || result.externalEffect === "UNKNOWN"
    || result.state === "UNAVAILABLE" && result.externalEffect === "NONE") {
    fail("RECONCILIATION_LOCAL_COMPLETION_REQUIRED");
  }
  const submittedAt = instant(dependencies.clock(), "CLOCK");
  const submission = createUserHeldFormationExecutionResultSubmissionV1({
    jobKey: binding.jobKey,
    jobHash: binding.jobHash,
    leaseHash: claim.leaseHash,
    submittedAt,
    result,
  });
  const completion = normalizeUserHeldFormationExecutionCompletionAckV1(
    await post(dependencies.fetchImpl,
      `${origin}/v1/client-executions/${binding.jobKey}/receipt`,
      token, submission, "RESULT"));
  if (completion.jobKey !== binding.jobKey
    || completion.jobHash !== binding.jobHash
    || completion.leaseHash !== claim.leaseHash
    || completion.result.resultHash !== result.resultHash) {
    fail("COMPLETION_RESULT_MISMATCH");
  }
  return Object.freeze({
    state: "COMPLETE",
    replayed: false,
    reconciled: true,
    executionPerformed: false,
    localDurableReplayPerformed: true,
    receiptSubmitted: true,
    jobKey: binding.jobKey,
    jobHash: binding.jobHash,
    resultHash: completion.result.resultHash,
    receiptHash: completion.receiptHash,
    authorityMinted: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });
}
