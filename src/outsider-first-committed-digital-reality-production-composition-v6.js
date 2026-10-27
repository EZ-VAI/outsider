/*
 * First committed-reality production composition v6.
 *
 * V6 preserves the v5 formation/recovery/witness composition and replaces
 * only the Cloudflare upload transport with its protocol-correct v3 descendant:
 *
 *   - Cloudflare primary uses native FormData with the exact worker.js
 *     metadata/part/filename tuple, then is reversibly preactivated;
 *   - one redirect-aware Globalping observer supports the direct workers.dev
 *     primary and the exact GitHub 302 -> release-assets target recovery;
 *   - each route must independently return the program-bound 200/body hash;
 *   - GitHub recovery monitoring follows its single HTTPS redirect while the
 *     exact observer independently enforces the pinned redirect policy;
 *   - monitor creation is insufficient: a fresh current UP must be observed
 *     before COMMIT, and every longitudinal range begins after that readyAt.
 *
 * Construction itself performs no provider I/O. Frozen predecessors v1-v5 and
 * their persisted episodes are not modified.
 */

import { createHash, createHmac } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { createCloudflareWorkerPreactivatedProductionAdapterV3 }
  from "./outsider-cloudflare-worker-production-adapter-v3.js";
import { createComposedHttpOutcomeWitnessAdapterV2,
  unwrapComposedHttpOutcomeWitnessStateV2 }
  from "./outsider-composed-http-outcome-witness-adapter-v2.js";
import { createFirstCommittedDigitalRealityProductionCompositionV2 }
  from "./outsider-first-committed-digital-reality-production-composition-v2.js";
import { createGlobalpingExactHttpObserverV2 }
  from "./outsider-globalping-exact-http-observer-v2.js";
import { createPreflightedHttpOutcomeWitnessAdapterV2 }
  from "./outsider-preflighted-http-outcome-witness-adapter-v2.js";
import {
  createReadinessGatedLongitudinalWitnessAdapterV1,
  unwrapReadinessGatedLongitudinalWitnessStateV1,
} from "./outsider-readiness-gated-longitudinal-witness-adapter-v1.js";
import { createPrimaryRecoveryWitnessCompositionV1 }
  from "./outsider-production-outcome-runner-v1.js";
import { createRouteAwareWitnessAdapterV2 }
  from "./outsider-route-aware-witness-adapter-v2.js";
import { createTemporalObservationWindowWitnessV1 }
  from "./outsider-temporal-observation-window-witness-v1.js";
import {
  createUptimeRobotFormationWitnessAdapterV2,
  createUptimeRobotHttpWitnessDriverV2,
  createUptimeRobotHttpWitnessPlanV2,
  discoverUptimeRobotPendingCreateStateV2,
  OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V2_SCHEMAS,
  resumeUptimeRobotHttpWitnessDriverV2,
  sealUptimeRobotApiCapabilityV2,
} from "./outsider-uptimerobot-http-witness-adapter-v2.js";
import { createUptimeRobotAccountRateLimiterV1 }
  from "./outsider-uptimerobot-account-rate-limiter-v1.js";

const PREFIX
  = "OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_COMPOSITION_V6_";
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function routeKey(program, routeRole, routeRef) {
  return createHash("sha256")
    .update(`${program.programHash}\0${routeRole}\0${routeRef}`, "utf8")
    .digest("hex");
}

function maximumCleanupDeadline(program, requirementId) {
  return (program.obligations ?? [])
    .filter((item) => item.targetRequirementId === requirementId)
    .reduce((latest, item) => Date.parse(item.deadline) > Date.parse(latest)
      ? item.deadline : latest, program.completionDeadline);
}

function publicRouteFromReservation(reservation) {
  const state = reservation?.adapterState;
  const route = state?.publicUrl ?? state?.routeUrl ?? state?.publicRoute;
  if (typeof route !== "string") fail("PUBLIC_ROUTE_MISSING");
  let parsed;
  try { parsed = new URL(route); } catch { fail("PUBLIC_ROUTE_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.hash !== "") {
    fail("PUBLIC_HTTPS_ROUTE_REQUIRED");
  }
  return route;
}

function checkedUptimeInput(value) {
  if (value === null || typeof value !== "object"
    || typeof value.apiToken !== "string" || value.apiToken.length < 1
    || typeof value.expiresAt !== "string"
    || typeof value.permissionGrantHash !== "string"
    || !HASH.test(value.permissionGrantHash)
    || (value.requestImpl !== undefined
      && typeof value.requestImpl !== "function")
    || (value.clock !== undefined && typeof value.clock !== "function")
    || (value.readinessWait !== undefined
      && typeof value.readinessWait !== "function")
    || (value.minimumSafeReadSpacingMs !== undefined
      && (!Number.isSafeInteger(value.minimumSafeReadSpacingMs)
        || value.minimumSafeReadSpacingMs < 20_000))
    || (value.maximumReadOccurrences !== undefined
      && (!Number.isSafeInteger(value.maximumReadOccurrences)
        || value.maximumReadOccurrences < 1
        || value.maximumReadOccurrences > 240))) {
    fail("UPTIMEROBOT_INPUT_INVALID");
  }
  return value;
}

function privateRouteRoot(root, program, routeRole, key) {
  const programKey = createHash("sha256")
    .update(program.programHash, "utf8").digest("hex").slice(0, 24);
  const directory = path.join(root, "witness-routes-v6", programKey,
    `${routeRole.toLowerCase()}-${key.slice(0, 24)}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  return realpathSync(directory);
}

function witnessLifecycle(program, requirement, configured = {}) {
  return {
    formationDeadline:
      configured.formationDeadline ?? program.formationDeadline,
    serviceFrom: configured.serviceFrom ?? program.formationDeadline,
    serviceUntil: configured.serviceUntil ?? program.completionDeadline,
    cleanupDeadline: configured.cleanupDeadline
      ?? maximumCleanupDeadline(program, requirement.requirementId),
  };
}

function effectAdapters(base, primary) {
  const recovery = base.adapters?.[
    "github-release-asset-production-recovery-v2"];
  const primaryFromBase = base.adapters?.[primary.adapterId];
  if (recovery === undefined || primaryFromBase !== primary
    || typeof recovery.execute !== "function") {
    fail("V2_EFFECT_COMPOSITION_MISMATCH");
  }
  return { primary, recovery };
}

/** Build the v6 production federation without contacting a provider. */
export function createFirstCommittedDigitalRealityProductionCompositionV6(
  input = {}) {
  if (typeof input.directory !== "string" || input.directory.length < 1) {
    fail("DIRECTORY_INVALID");
  }
  if (input.primaryAdapter !== undefined
    || input.recoveryAdapter !== undefined) {
    fail("EFFECT_ADAPTER_OVERRIDE_FORBIDDEN");
  }
  const privateRoot = path.resolve(input.directory);
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const primary = createCloudflareWorkerPreactivatedProductionAdapterV3(
    input.cloudflare);
  const base = createFirstCommittedDigitalRealityProductionCompositionV2({
    ...input,
    primaryAdapter: primary,
  });
  const effects = effectAdapters(base, primary);
  const uptime = checkedUptimeInput(input.uptimeRobot);
  const uptimeCapability = sealUptimeRobotApiCapabilityV2({
    apiToken: uptime.apiToken,
    expiresAt: uptime.expiresAt,
  });
  const requestImpl = uptime.requestImpl ?? globalThis.fetch;
  const clock = uptime.clock ?? (() => new Date().toISOString());
  if (typeof requestImpl !== "function") fail("UPTIMEROBOT_REQUEST_INVALID");
  const uptimeRequests = createUptimeRobotAccountRateLimiterV1({
    requestImpl,
    clock,
    ...(uptime.readinessWait === undefined
      ? {} : { wait: uptime.readinessWait }),
  });
  const globalping = input.globalping ?? {};

  const routeAwareWitness = createRouteAwareWitnessAdapterV2({
    adapterId: input.witnessAdapterId
      ?? "first-committed-reality-route-witness-v6",
    providerRef: "uptimerobot-globalping-independent-ready-v6",
    routeFromReservation({ dependencyReservation }) {
      return publicRouteFromReservation(dependencyReservation);
    },
    createRouteWitness({ program, witnessRequirement, routeRole, routeRef,
      dependencyRequirement, reserveOperationId, resumeReservation }) {
      const key = routeKey(program, routeRole, routeRef);
      const routeRoot = privateRouteRoot(privateRoot, program, routeRole, key);
      const lifecycle = witnessLifecycle(program, witnessRequirement,
        uptime.lifecycle);
      const exact = createGlobalpingExactHttpObserverV2({
        directory: path.join(routeRoot, "globalping-observations-v2"),
        ...(globalping.fetchImpl === undefined
          ? {} : { fetchImpl: globalping.fetchImpl }),
        ...(globalping.wait === undefined ? {} : { wait: globalping.wait }),
        ...(globalping.clock === undefined
          ? {} : { clock: globalping.clock }),
        ...(globalping.pollIntervalMs === undefined
          ? {} : { pollIntervalMs: globalping.pollIntervalMs }),
        ...(globalping.maximumPolls === undefined
          ? {} : { maximumPolls: globalping.maximumPolls }),
      });
      const plan = createUptimeRobotHttpWitnessPlanV2({
        targetUrl: routeRef,
        friendlyName: `outsider-v6-${key.slice(0, 21)}-${
          routeRole.toLowerCase()}`,
        intervalSeconds: uptime.intervalSeconds ?? 300,
        timeoutSeconds: uptime.timeoutSeconds ?? 30,
        httpMethod: "GET",
        successHttpResponseCodes: uptime.successHttpResponseCodes ?? ["2xx"],
        followRedirections: routeRole === "RECOVERY",
        redirectPolicyHash: exact.supportedPolicySetHash,
        observationRequirementHash: digest(
          "outsider/first-reality-observation-requirement/v6",
          witnessRequirement),
        ...lifecycle,
      });
      const driverInput = {
        plan,
        expectedPlanHash: plan.planHash,
        credentialCapability: uptimeCapability,
        ledgerDirectory: path.join(routeRoot, "uptimerobot-effect-ledger"),
        ledgerId: `ledger_${key.slice(0, 32)}`,
        adapterInstanceRefHash: digest(
          "outsider/uptimerobot-route-adapter-instance/v6", {
            programHash: program.programHash, routeRole, routeRef,
          }),
        permissionGrantHash: uptime.permissionGrantHash,
        privateProjectionNonce: `private_v6_${createHmac("sha256",
          uptime.apiToken).update(
          `${program.programHash}\0${routeRole}\0${routeRef}`, "utf8")
          .digest("hex")}`,
      };
      const explicitResumeUptimeState = resumeReservation === null ? null
        : unwrapComposedHttpOutcomeWitnessStateV2(
          resumeReservation.adapterState);
      const discoveredPendingState = explicitResumeUptimeState !== null
        || typeof reserveOperationId !== "string" ? null
          : discoverUptimeRobotPendingCreateStateV2({
            ledgerDirectory: driverInput.ledgerDirectory,
            ledgerId: driverInput.ledgerId,
            expectedPlanHash: plan.planHash,
            reserveOperationId,
          });
      const resumeUptimeState = explicitResumeUptimeState
        ?? discoveredPendingState;
      const resumeIsRawHandle = resumeUptimeState?.schema
        === OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V2_SCHEMAS.adapterState;
      const resumeReadinessState = resumeUptimeState === null
        || resumeIsRawHandle ? null : resumeUptimeState;
      const resumeRawState = resumeIsRawHandle ? resumeUptimeState
        : resumeReadinessState === null ? null
          : unwrapReadinessGatedLongitudinalWitnessStateV1(
            resumeReadinessState);
      const driver = resumeRawState === null
        ? createUptimeRobotHttpWitnessDriverV2(driverInput, {
          requestImpl: uptimeRequests.request, clock,
        })
        : resumeUptimeRobotHttpWitnessDriverV2({
          ...driverInput,
          adapterState: resumeRawState,
        }, { requestImpl: uptimeRequests.request, clock });
      const uptimeAdapter = createReadinessGatedLongitudinalWitnessAdapterV1({
        adapterId: `uptimerobot-ready-v1-${routeRole.toLowerCase()}-${
          key.slice(0, 16)}`,
        childAdapter: createUptimeRobotFormationWitnessAdapterV2(driver),
        clock,
        wait: uptime.readinessWait,
        minimumSafeReadSpacingMs: uptime.minimumSafeReadSpacingMs ?? 20_000,
        maximumReadOccurrences: uptime.maximumReadOccurrences ?? 20,
        requireRedirectFollowing: routeRole === "RECOVERY",
        externalRedirectPolicyHash: exact.supportedPolicySetHash,
        resumeAdapterState: resumeReadinessState,
      });
      const routeBoundSpotObserver = Object.freeze({
        providerRef: exact.providerRef,
        observe(observation) {
          if (observation?.targetUrl !== routeRef) {
            fail("GLOBALPING_ROUTE_BINDING_MISMATCH");
          }
          return exact.observe({ ...observation, targetUrl: routeRef });
        },
      });
      const composed = createComposedHttpOutcomeWitnessAdapterV2({
        adapterId: `uptime-globalping-v3-${routeRole.toLowerCase()}-${
          key.slice(0, 16)}`,
        uptimeAdapter,
        uptimeProviderRef:
          "uptimerobot-api-v3-redirect-aware-v2-readiness-gate-v1",
        spotProviderRef: exact.providerRef,
        exactSpotObserver: routeBoundSpotObserver,
      });
      return createPreflightedHttpOutcomeWitnessAdapterV2({
        adapterId: `uptime-globalping-preflight-v2-${
          routeRole.toLowerCase()}-${key.slice(0, 12)}`,
        childAdapter: composed,
        exactSpotObserver: routeBoundSpotObserver,
        routeRef,
        expectedStatus: witnessRequirement?.constraints?.expectedStatus,
        expectedBodyHash: witnessRequirement?.constraints?.expectedBodyHash,
        dependencyRequirement,
      });
    },
  });

  const witness = createTemporalObservationWindowWitnessV1({
    witnessAdapter: routeAwareWitness,
    clock,
  });

  return createPrimaryRecoveryWitnessCompositionV1({
    primaryAdapter: effects.primary,
    recoveryAdapter: effects.recovery,
    witnessAdapter: witness,
  });
}
