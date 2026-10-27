/*
 * Outcome Formation Engine: user-held executor pull protocol v1.
 *
 * This is a transport seam, not an executor, authority issuer, or outcome
 * witness.  A private executor maps one existing deterministic composition to
 * an order-scoped keyed public job.  The central broker sees only hashes and
 * the frozen typed-graph references; the commitment key, private parameter
 * bytes, provider exchanges, and unkeyed local hashes remain in the executor.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { formationJobIdentityV1 }
  from "./outsider-formation-job-worker-v1.js";

const PREFIX = "OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{1,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_PRIVATE_PARAMETER_BYTES = 64 * 1024;
const MAX_SOURCE_OCCURRENCES = 128;
const RESULT_STATES = Object.freeze([
  "COMPLETED", "HOLD", "UNAVAILABLE", "RECOVERY_REQUIRED",
]);
const EXTERNAL_EFFECT_STATES = Object.freeze([
  "NONE", "READ_ONLY", "ATTEMPTED", "CONFIRMED", "UNKNOWN",
]);
const RETRY_DISPOSITIONS = Object.freeze([
  "DO_NOT_RETRY", "SAFE_TO_RETRY_PRE_EFFECT",
]);
const BINDINGS = new WeakSet();

export const OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS
  = Object.freeze({
    claimRequest: "outsider/user-held-formation-execution-claim-request/v1",
    claimResponse: "outsider/user-held-formation-execution-claim-response/v1",
    invocation: "outsider/formation-executor-invocation/v1",
    resultSubmission:
      "outsider/user-held-formation-execution-result-submission/v1",
    completionAck:
      "outsider/user-held-formation-execution-completion-ack/v1",
    bindingProjection:
      "outsider/user-held-formation-private-binding-projection/v1",
  });

export const OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_BOUNDARY
  = Object.freeze({
    transport: "USER_OWNED_OUTBOUND_CLAIM_AND_RESULT",
    centralPrivateParameterBytes: false,
    centralPrivateParameterUnkeyedHash: false,
    centralPrivateOrderId: false,
    centralOrderIdIsKeyedCommitment: true,
    centralProviderExchangeBytes: false,
    centralProviderExchangeUnkeyedHashes: false,
    centralSeesOrderScopedKeyedCommitmentsOnly: true,
    inboundUserDevicePortRequired: false,
    browserRequired: false,
    modelRequired: false,
    automaticReassignmentAfterClaim: false,
    unknownEffectRetriesAutomatically: false,
    executorSelfReportIsIndependentOutcomeTruth: false,
    executorClaimMintsAuthority: false,
    capacityEstablished: false,
    outcomeCommitted: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function plain(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function exact(value, fields, code) {
  plain(value, code);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function bytes(value, code, minimum, maximum) {
  if (!Buffer.isBuffer(value) || value.length < minimum || value.length > maximum) {
    fail(`${code}_INVALID`);
  }
  return Buffer.from(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function rawBytesHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function bearerSecret(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32
    || Buffer.byteLength(value, "utf8") > 512
    || /[\u0000-\u0020\u007f]/u.test(value)) fail("BEARER_TOKEN_INVALID");
  return value;
}

/** Derive the order/job-scoped public commitment for one executor bearer. */
export function deriveUserHeldFormationExecutorCapabilityHashV1(input = {}) {
  exact(input, ["bearerToken", "jobHash"], "CAPABILITY_DERIVATION_INPUT");
  const bearerToken = bearerSecret(input.bearerToken);
  const jobHash = hash(input.jobHash, "JOB_HASH");
  return digest("outsider/user-held-formation-executor-capability/v1", {
    bearerToken,
    jobHash,
  });
}

function keyedBytesHash(key, domain, parts) {
  const state = createHmac("sha256", key);
  state.update(domain, "utf8");
  for (const part of parts) {
    state.update("\0", "utf8");
    state.update(part);
  }
  return `sha256:${state.digest("hex")}`;
}

function sameHash(left, right) {
  if (!HASH.test(String(left)) || !HASH.test(String(right))) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function normalizeExecutorResult(value) {
  exact(value, ["state", "reasonCode", "resultHash", "sourceOccurrenceHashes",
    "externalEffect", "retryDisposition"], "EXECUTOR_RESULT");
  if (!RESULT_STATES.includes(value.state)) fail("EXECUTOR_RESULT_STATE_INVALID");
  if (typeof value.reasonCode !== "string" || !REASON_CODE.test(value.reasonCode)) {
    fail("EXECUTOR_RESULT_REASON_CODE_INVALID");
  }
  const resultHash = hash(value.resultHash, "EXECUTOR_RESULT_HASH");
  if (!Array.isArray(value.sourceOccurrenceHashes)
    || value.sourceOccurrenceHashes.length > MAX_SOURCE_OCCURRENCES) {
    fail("SOURCE_OCCURRENCE_HASHES_INVALID");
  }
  const seen = new Set();
  const sourceOccurrenceHashes = value.sourceOccurrenceHashes.map((item) => {
    const selected = hash(item, "SOURCE_OCCURRENCE_HASH");
    if (seen.has(selected)) fail("SOURCE_OCCURRENCE_HASH_DUPLICATE");
    seen.add(selected);
    return selected;
  });
  if (!EXTERNAL_EFFECT_STATES.includes(value.externalEffect)) {
    fail("EXTERNAL_EFFECT_INVALID");
  }
  if (!RETRY_DISPOSITIONS.includes(value.retryDisposition)) {
    fail("RETRY_DISPOSITION_INVALID");
  }
  if (value.externalEffect === "UNKNOWN"
    && value.retryDisposition !== "DO_NOT_RETRY") {
    fail("UNKNOWN_EFFECT_RETRY_INVALID");
  }
  return Object.freeze({
    state: value.state,
    reasonCode: value.reasonCode,
    resultHash,
    sourceOccurrenceHashes: Object.freeze(sourceOccurrenceHashes),
    externalEffect: value.externalEffect,
    retryDisposition: value.retryDisposition,
  });
}

function normalizeInvocation(value) {
  exact(value, ["schema", "job", "jobHash", "jobKey"], "INVOCATION");
  if (value.schema
    !== OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.invocation) {
    fail("INVOCATION_SCHEMA_INVALID");
  }
  const identity = formationJobIdentityV1(value.job);
  if (!sameHash(identity.jobHash, value.jobHash)
    || !sameHash(identity.jobKey, value.jobKey)) fail("INVOCATION_HASH_MISMATCH");
  return Object.freeze({ schema: value.schema, job: identity.job,
    jobHash: identity.jobHash, jobKey: identity.jobKey });
}

function interruptedResult(key, publicJobHash) {
  return Object.freeze({
    state: "HOLD",
    reasonCode: "USER_HELD_EXECUTION_INTERRUPTED_EFFECT_UNKNOWN",
    resultHash: keyedBytesHash(key,
      "outsider/user-held-interrupted-result/v1",
      [Buffer.from(publicJobHash, "utf8")]),
    sourceOccurrenceHashes: Object.freeze([]),
    externalEffect: "UNKNOWN",
    retryDisposition: "DO_NOT_RETRY",
  });
}

/**
 * Bind an existing private deterministic composition to one network-safe job.
 * The returned object contains no key, private bytes, or unkeyed local hashes.
 */
export function createUserHeldFormationPrivateBindingV1(input = {}) {
  exact(input, ["composition", "privateEnvelopeBytes", "commitmentKeyBytes"],
    "PRIVATE_BINDING_INPUT");
  const composition = input.composition;
  if (composition === null || typeof composition !== "object"
    || composition.executor === null || typeof composition.executor !== "object"
    || typeof composition.executor.executeFrozenPlan !== "function") {
    fail("PRIVATE_COMPOSITION_INVALID");
  }
  const privateIdentity = formationJobIdentityV1(composition.job);
  const privateEnvelopeBytes = bytes(input.privateEnvelopeBytes,
    "PRIVATE_ENVELOPE_BYTES", 1, MAX_PRIVATE_PARAMETER_BYTES);
  const commitmentKey = bytes(input.commitmentKeyBytes, "COMMITMENT_KEY", 32, 64);
  if (!sameHash(rawBytesHash(privateEnvelopeBytes),
    privateIdentity.job.parameterEnvelopeHash)) {
    fail("PRIVATE_ENVELOPE_JOB_BINDING_MISMATCH");
  }
  const orderIdBytes = Buffer.from(privateIdentity.job.orderId, "utf8");
  const publicOrderId = `order:uhf:${keyedBytesHash(commitmentKey,
    "outsider/user-held-private-order-id-commitment/v1",
    [orderIdBytes]).slice("sha256:".length)}`;
  const publicPlanHash = keyedBytesHash(commitmentKey,
    "outsider/user-held-private-plan-commitment/v1",
    [orderIdBytes, Buffer.from(privateIdentity.job.planHash, "utf8")]);
  const publicParameterHash = keyedBytesHash(commitmentKey,
    "outsider/user-held-private-parameter-commitment/v1",
    [orderIdBytes, privateEnvelopeBytes]);
  const publicIdentity = formationJobIdentityV1({
    ...privateIdentity.job,
    orderId: publicOrderId,
    planHash: publicPlanHash,
    parameterEnvelopeHash: publicParameterHash,
  });
  const publicProjection = Object.freeze({
    schema:
      OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.bindingProjection,
    schemaVersion: "1.0.0",
    jobKey: publicIdentity.jobKey,
    jobHash: publicIdentity.jobHash,
    planCommitmentHash: publicPlanHash,
    parameterEnvelopeCommitmentHash: publicParameterHash,
    commitmentAlgorithm: "HMAC-SHA-256",
    commitmentScope: "ORDER_SCOPED_PRIVATE_EXECUTOR",
    privatePlanHashProjected: false,
    privateParameterBytesProjected: false,
    privateParameterUnkeyedHashProjected: false,
    providerExchangeBytesProjected: false,
    providerExchangeUnkeyedHashesProjected: false,
    authorityMinted: false,
    capacityEstablished: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });
  let inFlight = null;
  let completed = null;
  const binding = Object.freeze({
    job: publicIdentity.job,
    jobHash: publicIdentity.jobHash,
    jobKey: publicIdentity.jobKey,
    publicProjection,
    async executeFrozenPlan(rawInvocation) {
      const invocation = normalizeInvocation(rawInvocation);
      if (!sameHash(invocation.jobHash, publicIdentity.jobHash)
        || !sameHash(invocation.jobKey, publicIdentity.jobKey)) {
        fail("PUBLIC_JOB_BINDING_MISMATCH");
      }
      const currentParameterHash = keyedBytesHash(commitmentKey,
        "outsider/user-held-private-parameter-commitment/v1",
        [orderIdBytes, privateEnvelopeBytes]);
      if (!sameHash(currentParameterHash,
        publicIdentity.job.parameterEnvelopeHash)) {
        fail("PRIVATE_PARAMETER_COMMITMENT_MISMATCH");
      }
      if (completed !== null) return completed;
      if (inFlight !== null) return inFlight;
      inFlight = (async () => {
        let privateResult;
        try {
          privateResult = normalizeExecutorResult(
            await composition.executor.executeFrozenPlan({
              job: privateIdentity.job,
              jobHash: privateIdentity.jobHash,
              jobKey: privateIdentity.jobKey,
            }));
        } catch {
          return interruptedResult(commitmentKey, publicIdentity.jobHash);
        }
        const resultHash = keyedBytesHash(commitmentKey,
          "outsider/user-held-private-result-commitment/v1", [
            Buffer.from(publicIdentity.jobHash, "utf8"),
            Buffer.from(privateResult.resultHash, "utf8"),
          ]);
        const sourceOccurrenceHashes = privateResult.sourceOccurrenceHashes
          .map((occurrenceHash, index) => keyedBytesHash(commitmentKey,
            "outsider/user-held-private-source-occurrence-commitment/v1", [
              Buffer.from(publicIdentity.jobHash, "utf8"),
              Buffer.from(String(index), "utf8"),
              Buffer.from(occurrenceHash, "utf8"),
            ]));
        return Object.freeze({
          state: privateResult.state,
          reasonCode: privateResult.reasonCode,
          resultHash,
          sourceOccurrenceHashes: Object.freeze(sourceOccurrenceHashes),
          externalEffect: privateResult.externalEffect,
          retryDisposition: privateResult.retryDisposition,
        });
      })();
      completed = normalizeExecutorResult(await inFlight);
      inFlight = null;
      return completed;
    },
  });
  BINDINGS.add(binding);
  return binding;
}

export function createUserHeldFormationExecutionClaimRequestV1(input = {}) {
  exact(input, ["jobKey", "jobHash", "executorCapabilityHash", "requestedAt"],
    "CLAIM_REQUEST_INPUT");
  return Object.freeze({
    schema:
      OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.claimRequest,
    jobKey: hash(input.jobKey, "JOB_KEY"),
    jobHash: hash(input.jobHash, "JOB_HASH"),
    executorCapabilityHash: hash(input.executorCapabilityHash,
      "EXECUTOR_CAPABILITY_HASH"),
    requestedAt: instant(input.requestedAt, "REQUESTED_AT"),
  });
}

export function normalizeUserHeldFormationExecutionClaimRequestV1(value) {
  exact(value, ["schema", "jobKey", "jobHash", "executorCapabilityHash",
    "requestedAt"], "CLAIM_REQUEST");
  if (value.schema
    !== OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.claimRequest) {
    fail("CLAIM_REQUEST_SCHEMA_INVALID");
  }
  return createUserHeldFormationExecutionClaimRequestV1({
    jobKey: value.jobKey,
    jobHash: value.jobHash,
    executorCapabilityHash: value.executorCapabilityHash,
    requestedAt: value.requestedAt,
  });
}

export function normalizeUserHeldFormationExecutionCompletionAckV1(value) {
  exact(value, ["schema", "state", "jobKey", "jobHash", "leaseHash",
    "submittedAt", "leaseExpiredBeforeReceipt", "result", "receiptHash",
    "authorityMinted",
    "independentOutcomeTruthEstablished", "outcomeCommitted"],
  "COMPLETION_ACK");
  if (value.schema
      !== OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.completionAck
    || value.state !== "COMPLETE" || value.authorityMinted !== false
    || typeof value.leaseExpiredBeforeReceipt !== "boolean"
    || value.independentOutcomeTruthEstablished !== false
    || value.outcomeCommitted !== false) fail("COMPLETION_ACK_INVALID");
  return Object.freeze({
    schema: value.schema,
    state: value.state,
    jobKey: hash(value.jobKey, "JOB_KEY"),
    jobHash: hash(value.jobHash, "JOB_HASH"),
    leaseHash: hash(value.leaseHash, "LEASE_HASH"),
    submittedAt: instant(value.submittedAt, "SUBMITTED_AT"),
    leaseExpiredBeforeReceipt: value.leaseExpiredBeforeReceipt === true,
    result: normalizeExecutorResult(value.result),
    receiptHash: hash(value.receiptHash, "RECEIPT_HASH"),
    authorityMinted: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });
}

export function normalizeUserHeldFormationExecutionClaimResponseV1(value) {
  exact(value, ["schema", "state", "jobKey", "jobHash", "leaseHash",
    "leaseExpiresAt", "invocation", "completion"], "CLAIM_RESPONSE");
  if (value.schema
    !== OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.claimResponse
    || !["CLAIMED", "COMPLETE", "HOLD"].includes(value.state)) {
    fail("CLAIM_RESPONSE_INVALID");
  }
  const jobKey = hash(value.jobKey, "JOB_KEY");
  const jobHash = hash(value.jobHash, "JOB_HASH");
  const leaseHash = value.leaseHash === null ? null
    : hash(value.leaseHash, "LEASE_HASH");
  const leaseExpiresAt = value.leaseExpiresAt === null ? null
    : instant(value.leaseExpiresAt, "LEASE_EXPIRES_AT");
  const invocation = value.invocation === null ? null
    : normalizeInvocation(value.invocation);
  const completion = value.completion === null ? null
    : normalizeUserHeldFormationExecutionCompletionAckV1(value.completion);
  if (value.state === "CLAIMED"
    && (leaseHash === null || leaseExpiresAt === null || invocation === null
      || completion !== null)
    || value.state === "COMPLETE"
      && (leaseHash === null || leaseExpiresAt === null || invocation !== null
        || completion === null)
    || value.state === "HOLD"
      && (invocation !== null || completion !== null)) {
    fail("CLAIM_RESPONSE_STATE_INVALID");
  }
  if (invocation !== null && (!sameHash(invocation.jobKey, jobKey)
    || !sameHash(invocation.jobHash, jobHash))) fail("CLAIM_RESPONSE_JOB_MISMATCH");
  if (completion !== null && (!sameHash(completion.jobKey, jobKey)
    || !sameHash(completion.jobHash, jobHash)
    || !sameHash(completion.leaseHash, leaseHash))) {
    fail("CLAIM_RESPONSE_COMPLETION_MISMATCH");
  }
  return Object.freeze({ schema: value.schema, state: value.state, jobKey,
    jobHash, leaseHash, leaseExpiresAt, invocation, completion });
}

export function createUserHeldFormationExecutionResultSubmissionV1(input = {}) {
  exact(input, ["jobKey", "jobHash", "leaseHash", "submittedAt", "result"],
    "RESULT_SUBMISSION_INPUT");
  return Object.freeze({
    schema:
      OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.resultSubmission,
    jobKey: hash(input.jobKey, "JOB_KEY"),
    jobHash: hash(input.jobHash, "JOB_HASH"),
    leaseHash: hash(input.leaseHash, "LEASE_HASH"),
    submittedAt: instant(input.submittedAt, "SUBMITTED_AT"),
    result: normalizeExecutorResult(input.result),
  });
}

export function normalizeUserHeldFormationExecutionResultSubmissionV1(value) {
  exact(value, ["schema", "jobKey", "jobHash", "leaseHash", "submittedAt",
    "result"], "RESULT_SUBMISSION");
  if (value.schema
    !== OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.resultSubmission) {
    fail("RESULT_SUBMISSION_SCHEMA_INVALID");
  }
  return createUserHeldFormationExecutionResultSubmissionV1({
    jobKey: value.jobKey,
    jobHash: value.jobHash,
    leaseHash: value.leaseHash,
    submittedAt: value.submittedAt,
    result: value.result,
  });
}

/** Non-durable reference broker for focused tests and future DO conformance. */
export function createMemoryUserHeldFormationLeaseBrokerV1(input = {}) {
  exact(input, ["clock"], "BROKER_INPUT");
  if (typeof input.clock !== "function") fail("BROKER_CLOCK_INVALID");
  const records = new Map();

  function enqueue(rawJob, rawExecutorCapabilityHash) {
    const identity = formationJobIdentityV1(rawJob);
    const executorCapabilityHash = hash(rawExecutorCapabilityHash,
      "EXECUTOR_CAPABILITY_HASH");
    const existing = records.get(identity.jobKey);
    if (existing !== undefined) {
      if (!sameHash(existing.identity.jobHash, identity.jobHash)
        || !sameHash(existing.executorCapabilityHash,
          executorCapabilityHash)) {
        fail("JOB_IDENTITY_CONFLICT");
      }
      return Object.freeze({ enqueued: false, jobKey: identity.jobKey,
        jobHash: identity.jobHash });
    }
    records.set(identity.jobKey, { identity, executorCapabilityHash,
      state: "QUEUED", claim: null, completion: null });
    return Object.freeze({ enqueued: true, jobKey: identity.jobKey,
      jobHash: identity.jobHash });
  }

  function claim(rawRequest) {
    const request = normalizeUserHeldFormationExecutionClaimRequestV1(rawRequest);
    const record = records.get(request.jobKey);
    if (record === undefined || !sameHash(record.identity.jobHash, request.jobHash)) {
      fail("JOB_NOT_FOUND");
    }
    if (!sameHash(record.executorCapabilityHash,
      request.executorCapabilityHash)) fail("CLAIM_CAPABILITY_CONFLICT");
    if (record.state === "COMPLETE") {
      if (!sameHash(record.claim.executorCapabilityHash,
        request.executorCapabilityHash)) fail("CLAIM_CAPABILITY_CONFLICT");
      return Object.freeze({
        schema:
          OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.claimResponse,
        state: "COMPLETE",
        jobKey: record.identity.jobKey,
        jobHash: record.identity.jobHash,
        leaseHash: record.claim.leaseHash,
        leaseExpiresAt: record.claim.leaseExpiresAt,
        invocation: null,
        completion: record.completion,
      });
    }
    const observedAt = instant(input.clock(), "CLOCK");
    if (Date.parse(observedAt) < Date.parse(record.identity.job.issuedAt)
      || Date.parse(observedAt) >= Date.parse(record.identity.job.expiresAt)) {
      fail("JOB_OUTSIDE_EXECUTION_WINDOW");
    }
    if (record.state === "CLAIMED") {
      if (!sameHash(record.claim.executorCapabilityHash,
        request.executorCapabilityHash)) fail("CLAIM_CAPABILITY_CONFLICT");
    } else {
      const leaseHash = digest("outsider/user-held-formation-lease/v1", {
        jobKey: record.identity.jobKey,
        jobHash: record.identity.jobHash,
        executorCapabilityHash: request.executorCapabilityHash,
        claimedAt: observedAt,
      });
      record.claim = Object.freeze({
        executorCapabilityHash: request.executorCapabilityHash,
        claimedAt: observedAt,
        leaseHash,
        leaseExpiresAt: record.identity.job.expiresAt,
      });
      record.state = "CLAIMED";
    }
    return Object.freeze({
      schema:
        OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.claimResponse,
      state: "CLAIMED",
      jobKey: record.identity.jobKey,
      jobHash: record.identity.jobHash,
      leaseHash: record.claim.leaseHash,
      leaseExpiresAt: record.claim.leaseExpiresAt,
      invocation: Object.freeze({
        schema:
          OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.invocation,
        job: record.identity.job,
        jobHash: record.identity.jobHash,
        jobKey: record.identity.jobKey,
      }),
      completion: null,
    });
  }

  function complete(rawSubmission) {
    const submission
      = normalizeUserHeldFormationExecutionResultSubmissionV1(rawSubmission);
    const record = records.get(submission.jobKey);
    if (record === undefined || record.claim === null
      || !sameHash(record.identity.jobHash, submission.jobHash)
      || !sameHash(record.claim.leaseHash, submission.leaseHash)) {
      fail("RESULT_LEASE_MISMATCH");
    }
    const receiptHash = digest(
      "outsider/user-held-formation-execution-completion/v1", submission);
    if (record.state === "COMPLETE") {
      if (!sameHash(record.completion.receiptHash, receiptHash)) {
        fail("RESULT_REPLAY_CONFLICT");
      }
      return record.completion;
    }
    record.completion = Object.freeze({
      schema:
        OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.completionAck,
      state: "COMPLETE",
      jobKey: record.identity.jobKey,
      jobHash: record.identity.jobHash,
      leaseHash: record.claim.leaseHash,
      submittedAt: submission.submittedAt,
      leaseExpiredBeforeReceipt: Date.parse(submission.submittedAt)
        >= Date.parse(record.claim.leaseExpiresAt),
      result: submission.result,
      receiptHash,
      authorityMinted: false,
      independentOutcomeTruthEstablished: false,
      outcomeCommitted: false,
    });
    record.state = "COMPLETE";
    return record.completion;
  }

  function read(jobKey) {
    hash(jobKey, "JOB_KEY");
    const record = records.get(jobKey);
    if (record === undefined) return null;
    return Object.freeze({
      state: record.state,
      jobKey: record.identity.jobKey,
      jobHash: record.identity.jobHash,
      leaseHash: record.claim?.leaseHash ?? null,
      completion: record.completion,
    });
  }

  return Object.freeze({ enqueue, claim, complete, read });
}

export function assertUserHeldFormationPrivateBindingV1(value) {
  if (BINDINGS.has(value) !== true) fail("PRIVATE_BINDING_INVALID");
  return value;
}
