/*
 * Formation-time compatibility gate for a composed HTTP outcome witness.
 *
 * Reserving a longitudinal monitor does not prove that the independent exact
 * observer can actually read a frozen execution route. This versioned wrapper
 * therefore performs one durable, route-bound exact observation before it
 * asks the child to reserve monitor capacity. The child reservation is issued
 * only when the observed 200/body hash equals the exact program constraints.
 * A Globalping/server acknowledgement alone is not upgraded into authority or
 * outcome truth; this is only a fail-closed formation compatibility check.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_PREFLIGHTED_HTTP_OUTCOME_WITNESS_ADAPTER_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function receiptHash(domain, value) {
  try { return digest(domain, value ?? null); }
  catch { return digest(domain, "NON_CANONICAL_RECEIPT_OMITTED"); }
}

function checkedAdapter(value) {
  if (value === null || typeof value !== "object"
    || typeof value.adapterId !== "string" || !IDENTIFIER.test(value.adapterId)
    || typeof value.reserve !== "function"
    || typeof value.observe !== "function"
    || typeof value.release !== "function"
    || typeof value.closeObligation !== "function") {
    fail("CHILD_ADAPTER_INVALID");
  }
  return value;
}

function checkedObserver(value) {
  if (value === null || typeof value !== "object"
    || typeof value.providerRef !== "string"
    || !IDENTIFIER.test(value.providerRef)
    || typeof value.observe !== "function") fail("EXACT_OBSERVER_INVALID");
  return value;
}

function exactProgramBinding(context, expected) {
  const witness = context?.requirement;
  const dependency = context?.dependencyRequirement;
  if (context?.routeRef !== expected.routeRef
    || witness?.role !== "INDEPENDENT_WITNESS"
    || witness?.constraints?.expectedStatus !== expected.status
    || witness?.constraints?.expectedBodyHash !== expected.bodyHash
    || !Array.isArray(witness?.dependsOnRequirementIds)
    || !witness.dependsOnRequirementIds.includes(dependency?.requirementId)
    || !["PRIMARY", "RECOVERY"].includes(dependency?.role)
    || dependency?.constraints?.artifactHash !== expected.bodyHash) {
    return false;
  }
  const frozen = (context?.program?.requirements ?? []).find((item) =>
    item?.requirementId === witness.requirementId);
  const frozenDependency = (context?.program?.requirements ?? []).find((item) =>
    item?.requirementId === dependency.requirementId);
  return frozen?.constraints?.expectedStatus === expected.status
    && frozen?.constraints?.expectedBodyHash === expected.bodyHash
    && frozenDependency?.constraints?.artifactHash === expected.bodyHash;
}

function preflightReceipt(config, observation, childReceipt) {
  const body = {
    schema: "outsider/preflighted-http-witness-reservation-receipt/v2",
    schemaVersion: "2.0.0",
    adapterId: config.adapterId,
    exactObserverProviderRef: config.observer.providerRef,
    routeRefHash: config.routeRefHash,
    expectedStatus: config.status,
    expectedBodyHash: config.bodyHash,
    observedStatus: observation.status,
    observedBodyHash: observation.bodyHash,
    exactObserverReceiptHash: receiptHash(
      "outsider/formation-exact-route-preflight-receipt/v2",
      observation.providerReceipt ?? null),
    childReservationReceiptHash: receiptHash(
      "outsider/formation-longitudinal-child-reservation-receipt/v2",
      childReceipt ?? null),
    exactCompatibilityProvenBeforeChildCapacityReservation: true,
    globalpingCapacityReservedClaimed: false,
    authorityMintedByPreflight: false,
    independentOutcomeTruthClaimedByPreflight: false,
    rawRouteProjected: false,
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

/**
 * Wrap one route-specific UptimeRobot+Globalping child. The same exact observer
 * must be injected into the composed child for later outcome observations.
 */
export function createPreflightedHttpOutcomeWitnessAdapterV2(input = {}) {
  const child = checkedAdapter(input.childAdapter);
  const observer = checkedObserver(input.exactSpotObserver);
  const adapterId = input.adapterId
    ?? `preflighted-v2:${child.adapterId}`;
  if (typeof adapterId !== "string" || !IDENTIFIER.test(adapterId)
    || typeof input.routeRef !== "string" || input.routeRef.length < 1
    || input.routeRef.length > 4096 || input.expectedStatus !== 200
    || typeof input.expectedBodyHash !== "string"
    || !HASH.test(input.expectedBodyHash)) fail("CONFIG_INVALID");
  const config = Object.freeze({
    adapterId,
    routeRef: input.routeRef,
    routeRefHash: digest(
      "outsider/preflighted-http-witness-route/v2", input.routeRef),
    status: input.expectedStatus,
    bodyHash: input.expectedBodyHash,
    observer,
  });

  return Object.freeze({
    ...child,
    adapterId: config.adapterId,
    providerRef: `${child.providerRef ?? child.adapterId}+formation-preflight-v2`,

    supports(requirement) {
      return (typeof child.supports !== "function"
        || child.supports.call(child, requirement))
        && requirement?.constraints?.expectedStatus === config.status
        && requirement?.constraints?.expectedBodyHash === config.bodyHash;
    },

    async reserve(context) {
      if (!exactProgramBinding(context, config)) {
        return {
          status: "UNAVAILABLE",
          reason: "EXACT_PREFLIGHT_PROGRAM_BINDING_MISMATCH",
        };
      }
      let observation;
      try {
        observation = await observer.observe({
          operationId: `${context.operationId}:EXACT_PREFLIGHT`,
          targetUrl: config.routeRef,
        });
      } catch {
        return {
          status: "UNAVAILABLE",
          reason: "EXACT_ROUTE_PREFLIGHT_UNAVAILABLE",
        };
      }
      if (observation?.status !== config.status
        || observation?.bodyHash !== config.bodyHash) {
        return {
          status: "UNAVAILABLE",
          reason: "EXACT_ROUTE_PREFLIGHT_MISMATCH",
        };
      }
      const reserved = await child.reserve.call(child, context);
      if (reserved?.status !== "RESERVED") return reserved;
      return {
        ...reserved,
        providerReceipt: preflightReceipt(config, observation,
          reserved.providerReceipt),
        exactRoutePreflightProven: true,
      };
    },

    observe(context) {
      return child.observe.call(child, context);
    },

    release(context) {
      return child.release.call(child, context);
    },

    closeObligation(context) {
      return child.closeObligation.call(child, context);
    },
  });
}
