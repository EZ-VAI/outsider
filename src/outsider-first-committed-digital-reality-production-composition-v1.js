/*
 * Concrete provider composition for the first committed digital-reality
 * milestone.  This is deliberately wiring, not another admission layer:
 *
 *   Cloudflare Worker primary
 *   GitHub Contents recovery
 *   per-route UptimeRobot monitor + direct Globalping exact-body observation
 *
 * Both public routes receive witness capacity before COMMIT.  Provider
 * credentials stay in adapter/driver closures; stable route hashes select the
 * private ledgers needed to resume the same monitor after process restart.
 */

import { createHash, createHmac } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { createCloudflareWorkerProductionAdapterV1 }
  from "./outsider-cloudflare-worker-production-adapter-v1.js";
import { createComposedHttpOutcomeWitnessAdapterV1,
  unwrapComposedHttpOutcomeWitnessStateV1 }
  from "./outsider-composed-http-outcome-witness-adapter-v1.js";
import { createGitHubContentsProductionRecoveryAdapterV1 }
  from "./outsider-github-contents-production-recovery-adapter-v1.js";
import { createGlobalpingExactHttpObserverV1 }
  from "./outsider-globalping-exact-http-observer-v1.js";
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
  = "OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_COMPOSITION_V1_";
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

function checkedEffectAdapter(value, role) {
  if (value === null || typeof value !== "object"
    || typeof value.reserve !== "function"
    || typeof value.execute !== "function"
    || typeof value.release !== "function"
    || typeof value.closeObligation !== "function") {
    fail(`${role}_ADAPTER_INVALID`);
  }
  return value;
}

function makeEffectAdapters(input) {
  const primary = input.primaryAdapter === undefined
    ? createCloudflareWorkerProductionAdapterV1(input.cloudflare)
    : checkedEffectAdapter(input.primaryAdapter, "PRIMARY");
  const recovery = input.recoveryAdapter === undefined
    ? createGitHubContentsProductionRecoveryAdapterV1(input.github)
    : checkedEffectAdapter(input.recoveryAdapter, "RECOVERY");
  return { primary, recovery };
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
  const directory = path.join(root, "witness-routes", programKey,
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

/**
 * Build the actual three-role production composition. Supplying prebuilt
 * primary/recovery adapters is useful for another endpoint or an injected
 * production test; otherwise the Cloudflare/GitHub configs are passed to the
 * existing production adapter constructors unchanged.
 */
export function createFirstCommittedDigitalRealityProductionCompositionV1(
  input = {}) {
  if (typeof input.directory !== "string" || input.directory.length < 1) {
    fail("DIRECTORY_INVALID");
  }
  const privateRoot = path.resolve(input.directory);
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const uptime = checkedUptimeInput(input.uptimeRobot);
  const uptimeCapability = sealUptimeRobotApiCapabilityV1({
    apiToken: uptime.apiToken,
    expiresAt: uptime.expiresAt,
  });
  const requestImpl = uptime.requestImpl ?? globalThis.fetch;
  const clock = uptime.clock ?? (() => new Date().toISOString());
  if (typeof requestImpl !== "function") fail("UPTIMEROBOT_REQUEST_INVALID");
  const globalping = input.globalping ?? {};
  const { primary, recovery } = makeEffectAdapters(input);

  const routeAwareWitness = createRouteAwareWitnessAdapterV1({
    adapterId: input.witnessAdapterId
      ?? "first-committed-reality-route-witness-v1",
    providerRef: "uptimerobot-globalping-independent",
    routeFromReservation({ dependencyReservation }) {
      return publicRouteFromReservation(dependencyReservation);
    },
    createRouteWitness({ program, witnessRequirement, routeRole, routeRef,
      resumeReservation }) {
      const key = routeKey(program, routeRole, routeRef);
      const routeRoot = privateRouteRoot(privateRoot, program, routeRole, key);
      const lifecycle = witnessLifecycle(program, witnessRequirement,
        uptime.lifecycle);
      const plan = createUptimeRobotHttpWitnessPlanV1({
        targetUrl: routeRef,
        friendlyName: `outsider-${key.slice(0, 24)}-${routeRole.toLowerCase()}`,
        intervalSeconds: uptime.intervalSeconds ?? 300,
        timeoutSeconds: uptime.timeoutSeconds ?? 30,
        httpMethod: "GET",
        successHttpResponseCodes: uptime.successHttpResponseCodes ?? ["2xx"],
        observationRequirementHash: digest(
          "outsider/first-reality-observation-requirement/v1",
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
          "outsider/uptimerobot-route-adapter-instance/v1", {
            programHash: program.programHash, routeRole, routeRef,
          }),
        permissionGrantHash: uptime.permissionGrantHash,
        privateProjectionNonce: `private_${createHmac("sha256", uptime.apiToken)
          .update(`${program.programHash}\0${routeRole}\0${routeRef}`, "utf8")
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
      const exact = createGlobalpingExactHttpObserverV1({
        directory: path.join(routeRoot, "globalping-observations"),
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
      return createComposedHttpOutcomeWitnessAdapterV1({
        adapterId: `uptime-globalping-${routeRole.toLowerCase()}-${
          key.slice(0, 16)}`,
        uptimeAdapter,
        uptimeProviderRef: "uptimerobot-api-v3",
        spotProviderRef: "globalping-public-api-v1",
        exactSpotObserver: routeBoundSpotObserver,
      });
    },
  });

  const witness = createTemporalObservationWindowWitnessV1({
    witnessAdapter: routeAwareWitness,
    clock,
  });

  return createPrimaryRecoveryWitnessCompositionV1({
    primaryAdapter: primary,
    recoveryAdapter: recovery,
    witnessAdapter: witness,
  });
}
