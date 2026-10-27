/*
 * First committed-reality production composition v4.
 *
 * V4 keeps Release Asset recovery from v2 and replaces the formation witness
 * path with a route-compatibility-aware descendant:
 *
 *   - Cloudflare primary is reversibly preactivated after confirmation, so it
 *     can be observed before COMMIT just like the staged recovery route.
 *   - one redirect-aware Globalping observer supports the direct workers.dev
 *     primary and the exact GitHub 302 -> release-assets target recovery;
 *   - each route must independently return the program-bound 200/body hash
 *     before its UptimeRobot capacity reservation is accepted.
 *
 * Construction itself performs no provider I/O. Frozen v1/v2 files and their
 * persisted episodes are not modified.
 */

import { createHash, createHmac } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { createCloudflareWorkerPreactivatedProductionAdapterV2 }
  from "./outsider-cloudflare-worker-preactivated-production-adapter-v2.js";
import { createComposedHttpOutcomeWitnessAdapterV1,
  unwrapComposedHttpOutcomeWitnessStateV1 }
  from "./outsider-composed-http-outcome-witness-adapter-v1.js";
import { createFirstCommittedDigitalRealityProductionCompositionV2 }
  from "./outsider-first-committed-digital-reality-production-composition-v2.js";
import { createGlobalpingExactHttpObserverV2 }
  from "./outsider-globalping-exact-http-observer-v2.js";
import { createPreflightedHttpOutcomeWitnessAdapterV2 }
  from "./outsider-preflighted-http-outcome-witness-adapter-v2.js";
import { createPrimaryRecoveryWitnessCompositionV1 }
  from "./outsider-production-outcome-runner-v1.js";
import { createRouteAwareWitnessAdapterV1 }
  from "./outsider-route-aware-witness-adapter-v1.js";
import { createTemporalObservationWindowWitnessV1 }
  from "./outsider-temporal-observation-window-witness-v1.js";
import {
  createUptimeRobotFormationWitnessAdapterV1,
  createUptimeRobotHttpWitnessDriverV1,
  createUptimeRobotHttpWitnessPlanV1,
  resumeUptimeRobotHttpWitnessDriverV1,
  sealUptimeRobotApiCapabilityV1,
} from "./outsider-uptimerobot-http-witness-adapter-v1.js";

const PREFIX
  = "OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_COMPOSITION_V4_";
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
    || (value.clock !== undefined && typeof value.clock !== "function")) {
    fail("UPTIMEROBOT_INPUT_INVALID");
  }
  return value;
}

function privateRouteRoot(root, program, routeRole, key) {
  const programKey = createHash("sha256")
    .update(program.programHash, "utf8").digest("hex").slice(0, 24);
  const directory = path.join(root, "witness-routes-v4", programKey,
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

/** Build the future v3 production federation without contacting a provider. */
export function createFirstCommittedDigitalRealityProductionCompositionV4(
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
  const primary = createCloudflareWorkerPreactivatedProductionAdapterV2(
    input.cloudflare);
  const base = createFirstCommittedDigitalRealityProductionCompositionV2({
    ...input,
    primaryAdapter: primary,
  });
  const effects = effectAdapters(base, primary);
  const uptime = checkedUptimeInput(input.uptimeRobot);
  const uptimeCapability = sealUptimeRobotApiCapabilityV1({
    apiToken: uptime.apiToken,
    expiresAt: uptime.expiresAt,
  });
  const requestImpl = uptime.requestImpl ?? globalThis.fetch;
  const clock = uptime.clock ?? (() => new Date().toISOString());
  if (typeof requestImpl !== "function") fail("UPTIMEROBOT_REQUEST_INVALID");
  const globalping = input.globalping ?? {};

  const routeAwareWitness = createRouteAwareWitnessAdapterV1({
    adapterId: input.witnessAdapterId
      ?? "first-committed-reality-route-witness-v4",
    providerRef: "uptimerobot-globalping-independent-preflight-v4",
    routeFromReservation({ dependencyReservation }) {
      return publicRouteFromReservation(dependencyReservation);
    },
    createRouteWitness({ program, witnessRequirement, routeRole, routeRef,
      dependencyRequirement, resumeReservation }) {
      const key = routeKey(program, routeRole, routeRef);
      const routeRoot = privateRouteRoot(privateRoot, program, routeRole, key);
      const lifecycle = witnessLifecycle(program, witnessRequirement,
        uptime.lifecycle);
      const plan = createUptimeRobotHttpWitnessPlanV1({
        targetUrl: routeRef,
        friendlyName: `outsider-v4-${key.slice(0, 21)}-${
          routeRole.toLowerCase()}`,
        intervalSeconds: uptime.intervalSeconds ?? 300,
        timeoutSeconds: uptime.timeoutSeconds ?? 30,
        httpMethod: "GET",
        successHttpResponseCodes: uptime.successHttpResponseCodes ?? ["2xx"],
        observationRequirementHash: digest(
          "outsider/first-reality-observation-requirement/v4",
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
          "outsider/uptimerobot-route-adapter-instance/v4", {
            programHash: program.programHash, routeRole, routeRef,
          }),
        permissionGrantHash: uptime.permissionGrantHash,
        privateProjectionNonce: `private_v4_${createHmac("sha256",
          uptime.apiToken).update(
          `${program.programHash}\0${routeRole}\0${routeRef}`, "utf8")
          .digest("hex")}`,
      };
      const driver = resumeReservation === null
        ? createUptimeRobotHttpWitnessDriverV1(driverInput, {
          requestImpl, clock,
        })
        : resumeUptimeRobotHttpWitnessDriverV1({
          ...driverInput,
          adapterState: unwrapComposedHttpOutcomeWitnessStateV1(
            resumeReservation.adapterState),
        }, { requestImpl, clock });
      const uptimeAdapter = createUptimeRobotFormationWitnessAdapterV1(driver);
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
      const routeBoundSpotObserver = Object.freeze({
        providerRef: exact.providerRef,
        observe(observation) {
          if (observation?.targetUrl !== routeRef) {
            fail("GLOBALPING_ROUTE_BINDING_MISMATCH");
          }
          return exact.observe({ ...observation, targetUrl: routeRef });
        },
      });
      const composed = createComposedHttpOutcomeWitnessAdapterV1({
        adapterId: `uptime-globalping-v2-${routeRole.toLowerCase()}-${
          key.slice(0, 16)}`,
        uptimeAdapter,
        uptimeProviderRef: "uptimerobot-api-v3",
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
