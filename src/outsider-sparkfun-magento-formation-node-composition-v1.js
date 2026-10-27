/*
 * SparkFun/Magento full-address, no-payment Formation -> Node composition v1.
 *
 * The existing machine runner owns the actual catalog/cart/address/shipping
 * flow. This module only binds one private 0600 input file to one hash-only
 * Formation Job and exposes a factory-issued Node executor closure. No address,
 * contact, URL, credential, payment material, or executable input crosses the
 * job boundary.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  formationJobIdentityV1,
} from "./outsider-formation-job-worker-v1.js";
import { runSparkFunFullAddressPrepaymentLiveV1 }
  from "../scripts/outsider-sparkfun-full-address-prepayment-live-runner-v1.mjs";

const PREFIX = "OUTSIDER_SPARKFUN_MAGENTO_FORMATION_NODE_COMPOSITION_V1_";
const ADAPTER_ID = "sparkfun-magento-full-address-no-payment";
const ADAPTER_VERSION = "1.0.0";
const INPUT_SCHEMA
  = "outsider/private-sparkfun-full-address-prepayment-run-request/v1";
const PLAN_SCHEMA
  = "outsider/sparkfun-magento-full-address-formation-plan/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_INPUT_BYTES = 64 * 1024;

export const OUTSIDER_SPARKFUN_MAGENTO_FORMATION_NODE_COMPOSITION_V1_BOUNDARY
  = Object.freeze({
    provider: "SPARKFUN_MAGENTO_GUEST_CART",
    transport: "MAGENTO_GUEST_REST",
    stableExecutionIdentityFromJobKey: true,
    privateCanonicalInputMode: "0600",
    rawAddressOrContactInFormationJob: false,
    dynamicUrlInFormationJob: false,
    credentialInFormationJob: false,
    paymentMaterialInFormationJob: false,
    modelCalls: 0,
    browserClicks: 0,
    employeeTouches: 0,
    userBabysitting: 0,
    paymentEndpointAllowed: false,
    orderEndpointAllowed: false,
    capacityReserved: false,
    deliveryDeadlineProven: false,
    userResultCommitted: false,
    strongestState: "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD",
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

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function privateInput(file) {
  if (typeof file !== "string" || file.length < 1) fail("INPUT_FILE_INVALID");
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600
    || info.size < 3 || info.size > MAX_INPUT_BYTES) fail("INPUT_FILE_NOT_PRIVATE");
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("INPUT_FILE_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")
    || value?.schema !== INPUT_SCHEMA || value.schemaVersion !== "1.0.0"
    || value.paymentAuthorized !== false || value.orderAuthorized !== false) {
    fail("INPUT_FILE_BINDING_INVALID");
  }
  return Object.freeze({ absolute, bytes: Buffer.from(bytes),
    hash: bytesHash(bytes), value });
}

function canonicalPrivateArtifact(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
    fail("REPLAY_ARTIFACT_NOT_PRIVATE");
  }
  const bytes = readFileSync(file);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("REPLAY_ARTIFACT_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail("REPLAY_ARTIFACT_INVALID");
  }
  return value;
}

function replayProjection(runDirectory, expected) {
  if (!existsSync(runDirectory)) return null;
  const projectionFile = path.join(runDirectory, "public-projection.json");
  const manifestFile = path.join(runDirectory, "private-manifest.json");
  if (!existsSync(projectionFile) || !existsSync(manifestFile)) {
    return Object.freeze({ incomplete: true });
  }
  const projection = canonicalPrivateArtifact(projectionFile);
  const manifest = canonicalPrivateArtifact(manifestFile);
  const { projectionHash, ...projectionBody } = projection;
  const { manifestHash, ...manifestBody } = manifest;
  if (!HASH.test(String(projectionHash ?? ""))
    || projectionHash !== digest(projection.schema, projectionBody)
    || !HASH.test(String(manifestHash ?? ""))
    || manifestHash !== digest(manifest.schema, manifestBody)
    || manifest.projectionHash !== projectionHash
    || projection.privateInputBytesHash !== expected.privateInputHash
    || !Number.isFinite(Date.parse(projection.observedAt))
    || Date.parse(projection.observedAt) < Date.parse(expected.issuedAt)
    || Date.parse(projection.observedAt) >= Date.parse(expected.expiresAt)
    || projection.paymentPerformed !== false
    || projection.orderSubmitted !== false
    || projection.userResultCommitted !== false) fail("REPLAY_BINDING_INVALID");
  return Object.freeze({ incomplete: false, projection });
}

function findStableRunDirectory(privateRoot, nonce) {
  if (!existsSync(privateRoot)) return null;
  const expected = new RegExp(
    `^sparkfun-full-address-prepayment-[0-9]{8}-${nonce}$`, "u");
  const matches = readdirSync(privateRoot).filter((name) => expected.test(name));
  if (matches.length > 1) fail("MULTIPLE_STABLE_EXECUTIONS_OBSERVED");
  return matches.length === 0 ? null : path.join(privateRoot, matches[0]);
}

function executorResult(projection) {
  if (projection.paymentPerformed !== false || projection.orderSubmitted !== false
    || projection.userResultCommitted !== false || projection.capacityReserved !== false
    || projection.deliveryDeadlineProven !== false) fail("PROJECTION_BOUNDARY_BROKEN");
  const sourceOccurrenceHashes = [];
  const seen = new Set();
  for (const stage of projection.stages) {
    const occurrence = stage.sourceOccurrenceHash;
    if (occurrence !== null && !seen.has(occurrence)) {
      if (!HASH.test(String(occurrence))) fail("SOURCE_OCCURRENCE_INVALID");
      seen.add(occurrence);
      sourceOccurrenceHashes.push(occurrence);
    }
  }
  const ready = projection.runState
    === "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD";
  return Object.freeze({
    state: "HOLD",
    reasonCode: ready ? "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN"
      : "SPARKFUN_FORMATION_INCOMPLETE",
    resultHash: projection.projectionHash,
    sourceOccurrenceHashes: Object.freeze(sourceOccurrenceHashes),
    externalEffect: projection.counters.postRequestCount > 0
      ? ready ? "CONFIRMED" : "ATTEMPTED"
      : projection.counters.liveHttpRequestCount > 0 ? "READ_ONLY" : "NONE",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function interruptedResult(planHash) {
  return Object.freeze({
    state: "HOLD",
    reasonCode: "SPARKFUN_EXECUTION_INTERRUPTED_EFFECT_UNKNOWN",
    resultHash: digest("outsider/sparkfun-formation-interrupted/v1", { planHash }),
    sourceOccurrenceHashes: Object.freeze([]),
    externalEffect: "UNKNOWN",
    retryDisposition: "DO_NOT_RETRY",
  });
}

export function createSparkFunMagentoFormationNodeCompositionV1(input = {},
  dependencies = {}) {
  exact(input, ["orderId", "outcomeProgramHash", "graphRefs", "inputFile",
    "privateRoot", "issuedAt", "expiresAt"], "INPUT");
  exact(dependencies, ["fetchImpl", "clock"], "DEPENDENCIES");
  if (typeof dependencies.fetchImpl !== "function"
    || typeof dependencies.clock !== "function") fail("DEPENDENCIES_INVALID");
  const source = privateInput(input.inputFile);
  const issuedAt = instant(input.issuedAt, "ISSUED_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  const sourceFormationExpiry = instant(source.value.formationExpiresAt,
    "SOURCE_FORMATION_EXPIRES_AT");
  if (Date.parse(issuedAt) >= Date.parse(expiresAt)
    || Date.parse(expiresAt) > Date.parse(sourceFormationExpiry)) {
    fail("EXPIRY_BINDING_INVALID");
  }
  const planBody = {
    schema: PLAN_SCHEMA,
    schemaVersion: "1.0.0",
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    orderId: input.orderId,
    outcomeProgramHash: input.outcomeProgramHash,
    graphRefs: input.graphRefs,
    privateInputBytesHash: source.hash,
    issuedAt,
    expiresAt,
    runner: "outsider-sparkfun-full-address-prepayment-live-runner-v1",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const planHash = digest(PLAN_SCHEMA, planBody);
  const job = {
    schema: "outsider/formation-job/v1",
    orderId: input.orderId,
    planHash,
    adapterBinding: { adapterId: ADAPTER_ID, adapterVersion: ADAPTER_VERSION },
    outcomeProgramHash: input.outcomeProgramHash,
    parameterEnvelopeHash: source.hash,
    graphRefs: input.graphRefs,
    issuedAt,
    expiresAt,
  };
  const identity = formationJobIdentityV1(job);
  const nonce = createHash("sha256").update(identity.jobKey, "utf8")
    .digest("hex").slice(0, 32);
  const privateRoot = path.resolve(input.privateRoot);
  let inFlight = null;
  let completed = null;

  const executor = Object.freeze({
    async executeFrozenPlan(value) {
      exact(value, ["job", "jobHash", "jobKey"], "EXECUTION");
      const received = formationJobIdentityV1(value.job);
      if (received.jobHash !== value.jobHash || received.jobKey !== value.jobKey
        || received.jobHash !== identity.jobHash || received.jobKey !== identity.jobKey) {
        return Object.freeze({
          state: "UNAVAILABLE", reasonCode: "JOB_BINDING_MISMATCH",
          resultHash: digest("outsider/sparkfun-job-binding-mismatch/v1", {
            expectedJobHash: identity.jobHash, receivedJobHash: received.jobHash,
          }),
          sourceOccurrenceHashes: Object.freeze([]), externalEffect: "NONE",
          retryDisposition: "DO_NOT_RETRY",
        });
      }
      const observed = instant(dependencies.clock(), "CLOCK");
      if (Date.parse(observed) < Date.parse(issuedAt)
        || Date.parse(observed) >= Date.parse(expiresAt)) {
        return Object.freeze({
          state: "UNAVAILABLE", reasonCode: "FORMATION_JOB_EXPIRED",
          resultHash: digest("outsider/sparkfun-job-expired/v1", {
            jobHash: identity.jobHash,
          }), sourceOccurrenceHashes: Object.freeze([]), externalEffect: "NONE",
          retryDisposition: "DO_NOT_RETRY",
        });
      }
      const currentSource = privateInput(source.absolute);
      if (currentSource.hash !== source.hash) {
        return Object.freeze({
          state: "UNAVAILABLE", reasonCode: "PRIVATE_INPUT_HASH_MISMATCH",
          resultHash: digest("outsider/sparkfun-input-mismatch/v1", {
            jobHash: identity.jobHash,
          }), sourceOccurrenceHashes: Object.freeze([]), externalEffect: "NONE",
          retryDisposition: "DO_NOT_RETRY",
        });
      }
      if (completed !== null) return completed;
      if (inFlight !== null) return inFlight;
      inFlight = (async () => {
        const stableRunDirectory = findStableRunDirectory(privateRoot, nonce);
        const replay = stableRunDirectory === null ? null
          : replayProjection(stableRunDirectory, {
            privateInputHash: source.hash, issuedAt, expiresAt,
          });
        if (replay?.incomplete === true) return interruptedResult(planHash);
        if (replay?.projection) return executorResult(replay.projection);
        try {
          const result = await runSparkFunFullAddressPrepaymentLiveV1({
            inputFile: source.absolute,
            privateRoot,
            observedAt: observed,
            nonce,
            fetchImpl: dependencies.fetchImpl,
          });
          return executorResult(result.projection);
        } catch {
          return interruptedResult(planHash);
        }
      })();
      completed = await inFlight;
      inFlight = null;
      return completed;
    },
  });
  const executorResolver = async (binding) => binding.adapterId === ADAPTER_ID
    && binding.adapterVersion === ADAPTER_VERSION && binding.planHash === planHash
    ? executor : null;
  const publicProjection = Object.freeze({
    schema: "outsider/sparkfun-magento-formation-node-composition/v1",
    schemaVersion: "1.0.0",
    adapterBinding: identity.job.adapterBinding,
    jobKey: identity.jobKey,
    jobHash: identity.jobHash,
    planHash,
    parameterEnvelopeHash: source.hash,
    stableExecutionNonceHash: bytesHash(Buffer.from(nonce, "utf8")),
    rawPrivateInputProjected: false,
    paymentAuthorized: false,
    orderAuthorized: false,
    boundary: OUTSIDER_SPARKFUN_MAGENTO_FORMATION_NODE_COMPOSITION_V1_BOUNDARY,
  });
  return Object.freeze({ job: identity.job, executor, executorResolver,
    publicProjection });
}
