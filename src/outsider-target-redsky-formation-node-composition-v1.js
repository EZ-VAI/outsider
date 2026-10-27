/*
 * Target RedSky user-held Formation composition v1.
 *
 * Two existing mode-0600 inputs stay on the user-owned node.  The private
 * composition executes Target RedSky read-only runner v3 and can be wrapped
 * by the generic user-held claim/result protocol.  The central broker then
 * receives only order-scoped keyed commitments and a hash-only receipt.
 */

import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, readFileSync, readdirSync, realpathSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { formationJobIdentityV1 }
  from "./outsider-formation-job-worker-v1.js";
import { createUserHeldFormationPrivateBindingV1 }
  from "./outsider-user-held-formation-executor-protocol-v1.js";
import { runTargetRedskyReadOnlyLiveV3 }
  from "../scripts/outsider-target-redsky-read-only-live-v3.mjs";

const PREFIX = "OUTSIDER_TARGET_REDSKY_FORMATION_NODE_COMPOSITION_V1_";
const ADAPTER_ID = "target-redsky-user-held-read-only";
const ADAPTER_VERSION = "3.0.0";
const PLAN_SCHEMA = "outsider/target-redsky-user-held-formation-plan/v1";
const ENVELOPE_DOMAIN = "outsider/target-redsky-private-input-envelope/v1\0";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_PRIVATE_FILE_BYTES = 64 * 1024;

export const OUTSIDER_TARGET_REDSKY_FORMATION_NODE_COMPOSITION_V1_BOUNDARY
  = Object.freeze({
    provider: "TARGET_REDSKY_PUBLIC_WEB",
    transport: "USER_HELD_OUTBOUND_MACHINE_HTTPS",
    centralProtocol: "outsider/user-held-formation-executor-protocol/v1",
    publicRequestCount: 2,
    permittedHttpMethods: Object.freeze(["GET"]),
    accountOnlySameDayPathAllowed: false,
    browserOrMouseUsed: false,
    cartMutationAllowed: false,
    checkoutAllowed: false,
    paymentAllowed: false,
    orderAllowed: false,
    rawPrivateInputProjected: false,
    unkeyedPrivateHashMayLeaveNode: false,
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

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function privateFile(privateRoot, file, code) {
  if (typeof file !== "string" || file.length < 1) fail(`${code}_INVALID`);
  const root = realpathSync(path.resolve(privateRoot));
  const absolute = realpathSync(path.resolve(file));
  if (!absolute.startsWith(`${root}${path.sep}`)) fail(`${code}_OUTSIDE_ROOT`);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 2
    || info.size > MAX_PRIVATE_FILE_BYTES) fail(`${code}_NOT_PRIVATE`);
  return Object.freeze({ absolute, bytes: readFileSync(absolute) });
}

function uint32(value) {
  const result = Buffer.alloc(4);
  result.writeUInt32BE(value, 0);
  return result;
}

function privateEnvelope(outcome, route, productState) {
  return Buffer.concat([
    Buffer.from(ENVELOPE_DOMAIN, "utf8"),
    uint32(outcome.length), outcome,
    uint32(route.length), route,
    uint32(productState.length), productState,
  ]);
}

function canonicalPrivateArtifact(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600) fail("REPLAY_ARTIFACT_NOT_PRIVATE");
  const bytes = readFileSync(file);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("REPLAY_ARTIFACT_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail("REPLAY_ARTIFACT_INVALID");
  }
  return value;
}

function findStableRunDirectory(privateRoot, nonce) {
  if (!existsSync(privateRoot)) return null;
  const expected = new RegExp(
    `^target-redsky-read-only-live-v2-[0-9]{8}-${nonce}$`, "u");
  const matches = readdirSync(privateRoot).filter((name) => expected.test(name));
  if (matches.length > 1) fail("MULTIPLE_STABLE_EXECUTIONS_OBSERVED");
  return matches.length === 0 ? null : path.join(privateRoot, matches[0]);
}

function replayProjection(runDirectory, issuedAt, expiresAt) {
  if (!existsSync(runDirectory)) return null;
  const file = path.join(runDirectory,
    "route-assessment.public-projection.v3.json");
  if (!existsSync(file)) return Object.freeze({ incomplete: true });
  const projection = canonicalPrivateArtifact(file);
  const { projectionHash, ...body } = projection;
  if (!HASH.test(String(projectionHash ?? ""))
    || projectionHash !== digest(projection.schema, body)
    || projection.schema
      !== "outsider/target-redsky-read-only-route-assessment/v3"
    || !Number.isFinite(Date.parse(projection.observedAt))
    || Date.parse(projection.observedAt) < Date.parse(issuedAt)
    || Date.parse(projection.observedAt) >= Date.parse(expiresAt)
    || projection.externalEffects.publicReadRequests !== 2
    || projection.externalEffects.accountOnlySameDayRequests !== 0
    || projection.externalEffects.cartMutations !== 0
    || projection.externalEffects.checkoutSubmissions !== 0
    || projection.externalEffects.paymentAttempts !== 0
    || projection.externalEffects.orderSubmissions !== 0
    || projection.routeAssessment.capacityReserved !== false
    || projection.routeAssessment.commitEligible !== false) {
    fail("REPLAY_BINDING_INVALID");
  }
  return Object.freeze({ incomplete: false, projection });
}

function executorResult(projection) {
  const assessment = projection.routeAssessment;
  const rejected = assessment.state.startsWith("REJECT_");
  const occurrences = [projection.sourceOccurrences.pdp.occurrenceHash,
    projection.sourceOccurrences.fulfillment.occurrenceHash];
  if (new Set(occurrences).size !== 2
    || occurrences.some((value) => !HASH.test(String(value)))) {
    fail("SOURCE_OCCURRENCES_INVALID");
  }
  return Object.freeze({
    state: rejected ? "UNAVAILABLE" : "HOLD",
    reasonCode: assessment.reasonCode,
    resultHash: projection.projectionHash,
    sourceOccurrenceHashes: Object.freeze(occurrences),
    externalEffect: "READ_ONLY",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function interruptedResult(planHash) {
  return Object.freeze({
    state: "HOLD",
    reasonCode: "TARGET_READ_ONLY_EXECUTION_INTERRUPTED_EFFECT_UNKNOWN",
    resultHash: digest("outsider/target-redsky-execution-interrupted/v1",
      { planHash }),
    sourceOccurrenceHashes: Object.freeze([]),
    externalEffect: "UNKNOWN",
    retryDisposition: "DO_NOT_RETRY",
  });
}

export function createTargetRedskyFormationNodeCompositionV1(input = {},
  dependencies = {}) {
  exact(input, ["orderId", "outcomeProgramHash", "graphRefs",
    "outcomeInputFile", "priorRouteBindingFile", "frozenProductStateFile",
    "privateRoot",
    "issuedAt", "expiresAt"], "INPUT");
  exact(dependencies, ["fetchImpl", "clock"], "DEPENDENCIES");
  if (typeof dependencies.fetchImpl !== "function"
    || typeof dependencies.clock !== "function") fail("DEPENDENCIES_INVALID");
  const issuedAt = instant(input.issuedAt, "ISSUED_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (Date.parse(issuedAt) >= Date.parse(expiresAt)) fail("WINDOW_INVALID");
  const privateRoot = realpathSync(path.resolve(input.privateRoot));
  const outcome = privateFile(privateRoot, input.outcomeInputFile,
    "OUTCOME_INPUT");
  const route = privateFile(privateRoot, input.priorRouteBindingFile,
    "ROUTE_BINDING");
  const productState = privateFile(privateRoot, input.frozenProductStateFile,
    "PRODUCT_STATE");
  const envelope = privateEnvelope(outcome.bytes, route.bytes,
    productState.bytes);
  const parameterEnvelopeHash = bytesHash(envelope);
  const planBody = {
    schema: PLAN_SCHEMA,
    schemaVersion: "1.0.0",
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    orderId: input.orderId,
    outcomeProgramHash: input.outcomeProgramHash,
    graphRefs: input.graphRefs,
    parameterEnvelopeHash,
    issuedAt,
    expiresAt,
    runner: "outsider-target-redsky-read-only-live-v3",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const planHash = digest(PLAN_SCHEMA, planBody);
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
  const nonce = createHash("sha256").update(identity.jobKey, "utf8")
    .digest("hex").slice(0, 32);
  let inFlight = null;
  let completed = null;
  const executor = Object.freeze({
    async executeFrozenPlan(value) {
      exact(value, ["job", "jobHash", "jobKey"], "EXECUTION");
      const received = formationJobIdentityV1(value.job);
      if (received.jobHash !== value.jobHash || received.jobKey !== value.jobKey
        || received.jobHash !== identity.jobHash
        || received.jobKey !== identity.jobKey) {
        return Object.freeze({
          state: "UNAVAILABLE", reasonCode: "TARGET_JOB_BINDING_MISMATCH",
          resultHash: digest("outsider/target-redsky-job-mismatch/v1", {
            expectedJobHash: identity.jobHash,
            receivedJobHash: received.jobHash,
          }), sourceOccurrenceHashes: Object.freeze([]),
          externalEffect: "NONE", retryDisposition: "DO_NOT_RETRY",
        });
      }
      const observedAt = instant(dependencies.clock(), "CLOCK");
      if (Date.parse(observedAt) < Date.parse(issuedAt)
        || Date.parse(observedAt) >= Date.parse(expiresAt)) {
        return Object.freeze({
          state: "UNAVAILABLE", reasonCode: "TARGET_FORMATION_JOB_EXPIRED",
          resultHash: digest("outsider/target-redsky-job-expired/v1", {
            jobHash: identity.jobHash,
          }), sourceOccurrenceHashes: Object.freeze([]),
          externalEffect: "NONE", retryDisposition: "DO_NOT_RETRY",
        });
      }
      const currentOutcome = privateFile(privateRoot, outcome.absolute,
        "OUTCOME_INPUT");
      const currentRoute = privateFile(privateRoot, route.absolute,
        "ROUTE_BINDING");
      const currentProductState = privateFile(privateRoot,
        productState.absolute, "PRODUCT_STATE");
      const currentEnvelope = privateEnvelope(currentOutcome.bytes,
        currentRoute.bytes, currentProductState.bytes);
      const inputUnchanged = bytesHash(currentEnvelope) === parameterEnvelopeHash;
      currentEnvelope.fill(0);
      if (!inputUnchanged) {
        return Object.freeze({
          state: "UNAVAILABLE", reasonCode: "TARGET_PRIVATE_INPUT_MISMATCH",
          resultHash: digest("outsider/target-redsky-input-mismatch/v1", {
            jobHash: identity.jobHash,
          }), sourceOccurrenceHashes: Object.freeze([]),
          externalEffect: "NONE", retryDisposition: "DO_NOT_RETRY",
        });
      }
      if (completed !== null) return completed;
      if (inFlight !== null) return inFlight;
      inFlight = (async () => {
        const stableDirectory = findStableRunDirectory(privateRoot, nonce);
        const replay = stableDirectory === null ? null
          : replayProjection(stableDirectory, issuedAt, expiresAt);
        if (replay?.incomplete === true) return interruptedResult(planHash);
        if (replay?.projection) return executorResult(replay.projection);
        try {
          const result = await runTargetRedskyReadOnlyLiveV3({
            outcomeInputFile: outcome.absolute,
            priorRouteBindingFile: route.absolute,
            frozenProductStateFile: productState.absolute,
            privateRoot,
            observedAt,
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
  const privateComposition = Object.freeze({
    job: identity.job,
    executor,
    publicProjection: Object.freeze({
      schema: "outsider/target-redsky-formation-node-composition/v1",
      schemaVersion: "1.0.0",
      adapterBinding: identity.job.adapterBinding,
      jobKey: identity.jobKey,
      jobHash: identity.jobHash,
      privateProjectionOnly: true,
      rawPrivateInputProjected: false,
      paymentAuthorized: false,
      orderAuthorized: false,
      boundary:
        OUTSIDER_TARGET_REDSKY_FORMATION_NODE_COMPOSITION_V1_BOUNDARY,
    }),
  });
  return Object.freeze({
    ...privateComposition,
    createUserHeldBinding(commitmentKeyBytes) {
      return createUserHeldFormationPrivateBindingV1({
        composition: privateComposition,
        privateEnvelopeBytes: envelope,
        commitmentKeyBytes,
      });
    },
  });
}
