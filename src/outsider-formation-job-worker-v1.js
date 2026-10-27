/*
 * Outcome Formation Engine: portable formation job worker v1.
 *
 * This is the production hot-path seam between an already compiled order and
 * a version-pinned deterministic executor. The submitted job contains only
 * identifiers and content hashes: it accepts no prompt, prose instructions,
 * arbitrary URL, executable code, credentials, or payment material.
 *
 * A durable store owns the orderId + planHash decision. Once a worker claims a
 * job, a concurrent request observes RUNNING_HOLD; after completion every
 * replay receives the exact same receipt. An interrupted executor is recorded
 * as an ambiguous, do-not-retry HOLD rather than being silently executed twice.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_FORMATION_JOB_WORKER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const ADAPTER_ID = /^[a-z0-9][a-z0-9._:-]{2,127}$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{1,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_SOURCE_OCCURRENCES = 128;

const RESULT_STATES = Object.freeze([
  "COMPLETED",
  "HOLD",
  "UNAVAILABLE",
  "RECOVERY_REQUIRED",
]);
const EXTERNAL_EFFECT_STATES = Object.freeze([
  "NONE",
  "READ_ONLY",
  "ATTEMPTED",
  "CONFIRMED",
  "UNKNOWN",
]);
const RETRY_DISPOSITIONS = Object.freeze([
  "DO_NOT_RETRY",
  "SAFE_TO_RETRY_PRE_EFFECT",
]);

export const OUTSIDER_FORMATION_JOB_WORKER_V1_SCHEMAS = Object.freeze({
  job: "outsider/formation-job/v1",
  receipt: "outsider/formation-job-machine-receipt/v1",
});

export const OUTSIDER_FORMATION_JOB_WORKER_V1_BOUNDARY = Object.freeze({
  position: "COMPILED_ORDER_TO_DETERMINISTIC_EXECUTOR_HOT_PATH",
  identityKey: "ORDER_ID_PLUS_PLAN_HASH",
  durableClaimRequired: true,
  exactReplayReceiptRequired: true,
  unknownAdapterOrVersionFailsClosed: true,
  interruptedExecutionRetriesAutomatically: false,
  promptAccepted: false,
  proseInstructionAccepted: false,
  arbitraryUrlAccepted: false,
  executableCodeAccepted: false,
  credentialMaterialAccepted: false,
  paymentMaterialAccepted: false,
  manualQueueAvailable: false,
  modelCalls: 0,
  browserClicks: 0,
  employeeTouches: 0,
  userBabysitting: 0,
  authorityMinted: false,
  executorResultUpgradedToIndependentOutcomeTruth: false,
});

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function plain(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(`${code}_INVALID`);
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

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function normalizeGraphRefs(value) {
  exact(value, ["principalEpochHash", "accountableDeploymentHash",
    "runtimeOrEmbodimentHash", "delegationHash", "episodeHash", "attemptHash"],
  "GRAPH_REFS");
  return Object.freeze({
    principalEpochHash: hash(value.principalEpochHash, "PRINCIPAL_EPOCH_HASH"),
    accountableDeploymentHash: hash(value.accountableDeploymentHash,
      "ACCOUNTABLE_DEPLOYMENT_HASH"),
    runtimeOrEmbodimentHash: hash(value.runtimeOrEmbodimentHash,
      "RUNTIME_OR_EMBODIMENT_HASH"),
    delegationHash: hash(value.delegationHash, "DELEGATION_HASH"),
    episodeHash: hash(value.episodeHash, "EPISODE_HASH"),
    attemptHash: hash(value.attemptHash, "ATTEMPT_HASH"),
  });
}

function normalizeAdapterBinding(value) {
  exact(value, ["adapterId", "adapterVersion"], "ADAPTER_BINDING");
  if (typeof value.adapterId !== "string" || !ADAPTER_ID.test(value.adapterId)) {
    fail("ADAPTER_ID_INVALID");
  }
  if (typeof value.adapterVersion !== "string"
    || !VERSION.test(value.adapterVersion)) fail("ADAPTER_VERSION_INVALID");
  return Object.freeze({ adapterId: value.adapterId,
    adapterVersion: value.adapterVersion });
}

/** Validate and detach one network-safe, hash-only formation job. */
export function normalizeFormationJobV1(value) {
  exact(value, ["schema", "orderId", "planHash", "adapterBinding",
    "outcomeProgramHash", "parameterEnvelopeHash", "graphRefs", "issuedAt",
    "expiresAt"], "JOB");
  if (value.schema !== OUTSIDER_FORMATION_JOB_WORKER_V1_SCHEMAS.job) {
    fail("JOB_SCHEMA_INVALID");
  }
  if (typeof value.orderId !== "string" || !ORDER_ID.test(value.orderId)) {
    fail("ORDER_ID_INVALID");
  }
  const issuedAt = instant(value.issuedAt, "ISSUED_AT");
  const expiresAt = instant(value.expiresAt, "EXPIRES_AT");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) fail("TIME_WINDOW_INVALID");
  return Object.freeze({
    schema: value.schema,
    orderId: value.orderId,
    planHash: hash(value.planHash, "PLAN_HASH"),
    adapterBinding: normalizeAdapterBinding(value.adapterBinding),
    outcomeProgramHash: hash(value.outcomeProgramHash, "OUTCOME_PROGRAM_HASH"),
    parameterEnvelopeHash: hash(value.parameterEnvelopeHash,
      "PARAMETER_ENVELOPE_HASH"),
    graphRefs: normalizeGraphRefs(value.graphRefs),
    issuedAt,
    expiresAt,
  });
}

export function formationJobIdentityV1(value) {
  const job = normalizeFormationJobV1(value);
  const jobHash = digest(job.schema, job);
  const jobKey = digest("outsider/formation-job-key/v1", {
    orderId: job.orderId,
    planHash: job.planHash,
  });
  return Object.freeze({ job, jobHash, jobKey });
}

function normalizeExecutorResult(value) {
  exact(value, ["state", "reasonCode", "resultHash", "sourceOccurrenceHashes",
    "externalEffect", "retryDisposition"], "EXECUTOR_RESULT");
  if (!RESULT_STATES.includes(value.state)) fail("EXECUTOR_RESULT_STATE_INVALID");
  if (typeof value.reasonCode !== "string"
    || !REASON_CODE.test(value.reasonCode)) fail("EXECUTOR_REASON_CODE_INVALID");
  hash(value.resultHash, "EXECUTOR_RESULT_HASH");
  if (!Array.isArray(value.sourceOccurrenceHashes)
    || value.sourceOccurrenceHashes.length > MAX_SOURCE_OCCURRENCES) {
    fail("SOURCE_OCCURRENCE_HASHES_INVALID");
  }
  const unique = new Set();
  const sourceOccurrenceHashes = value.sourceOccurrenceHashes.map((item) => {
    const selected = hash(item, "SOURCE_OCCURRENCE_HASH");
    if (unique.has(selected)) fail("SOURCE_OCCURRENCE_HASH_DUPLICATE");
    unique.add(selected);
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
    resultHash: value.resultHash,
    sourceOccurrenceHashes: Object.freeze(sourceOccurrenceHashes),
    externalEffect: value.externalEffect,
    retryDisposition: value.retryDisposition,
  });
}

function counterProjection(executorInvocations) {
  return Object.freeze({
    modelCalls: 0,
    browserClicks: 0,
    employeeTouches: 0,
    userBabysitting: 0,
    manualQueueEnqueues: 0,
    executorInvocations,
  });
}

function machineReceipt(identity, result, startedAt, completedAt,
  executorInvocations) {
  const body = {
    schema: OUTSIDER_FORMATION_JOB_WORKER_V1_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    jobKey: identity.jobKey,
    jobHash: identity.jobHash,
    orderId: identity.job.orderId,
    planHash: identity.job.planHash,
    adapterBinding: identity.job.adapterBinding,
    outcomeProgramHash: identity.job.outcomeProgramHash,
    graphRefs: identity.job.graphRefs,
    state: result.state,
    reasonCode: result.reasonCode,
    resultHash: result.resultHash,
    sourceOccurrenceHashes: result.sourceOccurrenceHashes,
    externalEffect: result.externalEffect,
    retryDisposition: result.retryDisposition,
    startedAt,
    completedAt,
    counters: counterProjection(executorInvocations),
    manualQueue: null,
    independentOutcomeTruthEstablished: false,
    authorityMinted: false,
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

function now(clock) {
  if (typeof clock !== "function") fail("CLOCK_INVALID");
  return instant(clock(), "CLOCK_VALUE");
}

function validateStore(store) {
  if (store === null || typeof store !== "object"
    || typeof store.claim !== "function" || typeof store.complete !== "function"
    || typeof store.read !== "function") fail("STORE_INVALID");
  return store;
}

function unavailableResult(identity, reasonCode) {
  const body = { jobHash: identity.jobHash, reasonCode };
  return normalizeExecutorResult({
    state: "UNAVAILABLE",
    reasonCode,
    resultHash: digest("outsider/formation-job-unavailable/v1", body),
    sourceOccurrenceHashes: [],
    externalEffect: "NONE",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function interruptedResult(identity) {
  return normalizeExecutorResult({
    state: "HOLD",
    reasonCode: "EXECUTION_INTERRUPTED_EFFECT_UNKNOWN",
    resultHash: digest("outsider/formation-job-interrupted/v1", {
      jobHash: identity.jobHash,
    }),
    sourceOccurrenceHashes: [],
    externalEffect: "UNKNOWN",
    retryDisposition: "DO_NOT_RETRY",
  });
}

/**
 * Build the portable worker. `executorResolver` must return either null or a
 * deployed executor exposing executeFrozenPlan({job, jobHash, jobKey}).
 */
export function createFormationJobWorkerV1(input = {}) {
  exact(input, ["store", "executorResolver", "clock"], "WORKER_INPUT");
  const store = validateStore(input.store);
  if (typeof input.executorResolver !== "function") {
    fail("EXECUTOR_RESOLVER_INVALID");
  }

  async function dispatch(rawJob) {
    const identity = formationJobIdentityV1(rawJob);
    const observedAt = now(input.clock);
    if (Date.parse(observedAt) < Date.parse(identity.job.issuedAt)) {
      fail("JOB_NOT_YET_VALID");
    }
    const claim = await store.claim({
      jobKey: identity.jobKey,
      jobHash: identity.jobHash,
      job: identity.job,
      claimedAt: observedAt,
    });
    if (claim?.status === "CONFLICT") {
      return Object.freeze({ statusCode: 409, replayed: false,
        state: "JOB_IDENTITY_CONFLICT", receipt: null });
    }
    if (claim?.status === "RUNNING") {
      return Object.freeze({ statusCode: 202, replayed: false,
        state: "RUNNING_HOLD", receipt: null });
    }
    if (claim?.status === "COMPLETE") {
      return Object.freeze({ statusCode: 200, replayed: true,
        state: claim.receipt.state, receipt: claim.receipt });
    }
    if (claim?.status !== "CLAIMED") fail("STORE_CLAIM_RESULT_INVALID");

    const startedAt = observedAt;
    let result;
    let executorInvocations = 0;
    if (Date.parse(startedAt) >= Date.parse(identity.job.expiresAt)) {
      result = unavailableResult(identity, "JOB_EXPIRED_BEFORE_EXECUTION");
    } else {
      let executor = null;
      try {
        executor = await input.executorResolver(Object.freeze({
          adapterId: identity.job.adapterBinding.adapterId,
          adapterVersion: identity.job.adapterBinding.adapterVersion,
          planHash: identity.job.planHash,
        }));
      } catch {
        executor = null;
      }
      if (executor === null) {
        result = unavailableResult(identity, "UNKNOWN_EXECUTOR_BINDING");
      } else if (typeof executor !== "object"
        || typeof executor.executeFrozenPlan !== "function") {
        result = unavailableResult(identity, "INVALID_EXECUTOR_BINDING");
      } else {
        executorInvocations = 1;
        try {
          result = normalizeExecutorResult(await executor.executeFrozenPlan({
            job: identity.job,
            jobHash: identity.jobHash,
            jobKey: identity.jobKey,
          }));
        } catch {
          result = interruptedResult(identity);
        }
      }
    }
    const receipt = machineReceipt(identity, result, startedAt,
      now(input.clock), executorInvocations);
    const completed = await store.complete({
      jobKey: identity.jobKey,
      jobHash: identity.jobHash,
      receipt,
    });
    if (!completed || !new Set(["COMPLETED", "EXISTING"]).has(
      completed.status) || completed.receipt.receiptHash !== receipt.receiptHash) {
      fail("STORE_COMPLETE_RESULT_INVALID");
    }
    return Object.freeze({ statusCode: 200,
      replayed: completed.status === "EXISTING",
      state: completed.receipt.state,
      receipt: completed.receipt });
  }

  async function read(jobKey) {
    hash(jobKey, "JOB_KEY");
    return store.read({ jobKey });
  }

  return Object.freeze({ dispatch, read });
}

/** Non-durable reference store for unit tests and local embedding only. */
export function createMemoryFormationJobStoreV1() {
  const records = new Map();
  return Object.freeze({
    async claim(request) {
      exact(request, ["jobKey", "jobHash", "job", "claimedAt"],
        "STORE_CLAIM_INPUT");
      const existing = records.get(request.jobKey);
      if (existing === undefined) {
        records.set(request.jobKey, Object.freeze({ ...request,
          state: "RUNNING", receipt: null }));
        return Object.freeze({ status: "CLAIMED" });
      }
      if (existing.jobHash !== request.jobHash) {
        return Object.freeze({ status: "CONFLICT" });
      }
      if (existing.state === "COMPLETE") {
        return Object.freeze({ status: "COMPLETE", receipt: existing.receipt });
      }
      return Object.freeze({ status: "RUNNING", claimedAt: existing.claimedAt });
    },
    async complete(request) {
      exact(request, ["jobKey", "jobHash", "receipt"],
        "STORE_COMPLETE_INPUT");
      const existing = records.get(request.jobKey);
      if (existing === undefined || existing.jobHash !== request.jobHash) {
        fail("STORE_COMPLETE_WITHOUT_CLAIM");
      }
      if (existing.state === "COMPLETE") {
        if (existing.receipt.receiptHash !== request.receipt.receiptHash) {
          fail("STORE_RECEIPT_CONFLICT");
        }
        return Object.freeze({ status: "EXISTING", receipt: existing.receipt });
      }
      const record = Object.freeze({ ...existing, state: "COMPLETE",
        receipt: request.receipt });
      records.set(request.jobKey, record);
      return Object.freeze({ status: "COMPLETED", receipt: record.receipt });
    },
    async read(request) {
      exact(request, ["jobKey"], "STORE_READ_INPUT");
      const existing = records.get(request.jobKey);
      if (existing === undefined) return null;
      return Object.freeze({ state: existing.state,
        jobKey: existing.jobKey, jobHash: existing.jobHash,
        claimedAt: existing.claimedAt, receipt: existing.receipt });
    },
  });
}
