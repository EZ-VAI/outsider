/*
 * Production composition v2 for an order-scoped HTTP outcome witness.
 *
 * UptimeRobot supplies the reserved longitudinal monitor lifecycle. An
 * independently injected spot observer supplies one exact HTTP status and
 * response-body hash observation (for example, a Globalping runner bridge).
 * The composite reports SATISFIED only when both sources agree with the
 * program's exact response criteria. It never upgrades a plain monitor UP
 * status into body-hash evidence.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_COMPOSED_HTTP_OUTCOME_WITNESS_ADAPTER_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const CAPABILITY = "PUBLIC_HTTPS_LONGITUDINAL_EXACT_RESPONSE_OBSERVATION";
const UPTIME_CAPABILITY = "PUBLIC_HTTPS_LONGITUDINAL_OBSERVATION";
const STATE_SCHEMA = "outsider/composed-http-outcome-witness-state/v2";

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function identifier(value, code) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function receiptCommitment(domain, value) {
  try { return digest(domain, value ?? null); }
  catch { return digest(domain, "NON_CANONICAL_RECEIPT_OMITTED"); }
}

function compositeState(uptimeReservation, uptimeProviderRef,
  spotProviderRef) {
  const body = {
    schema: STATE_SCHEMA,
    schemaVersion: "2.0.0",
    uptimeProviderRef,
    spotProviderRef,
    uptimeReservationId: uptimeReservation.reservationId,
    uptimeAdapterState: uptimeReservation.adapterState ?? null,
    containsCredential: false,
  };
  return Object.freeze({ ...body, stateHash: digest(STATE_SCHEMA, body) });
}

function checkedState(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.schema !== STATE_SCHEMA || value.schemaVersion !== "2.0.0"
    || value.containsCredential !== false
    || typeof value.uptimeReservationId !== "string"
    || !IDENTIFIER.test(value.uptimeProviderRef)
    || !IDENTIFIER.test(value.spotProviderRef)
    || typeof value.stateHash !== "string" || !HASH.test(value.stateHash)) {
    fail("ADAPTER_STATE_INVALID");
  }
  const body = { ...value };
  delete body.stateHash;
  if (digest(STATE_SCHEMA, body) !== value.stateHash) {
    fail("ADAPTER_STATE_HASH_MISMATCH");
  }
  return value;
}

export function unwrapComposedHttpOutcomeWitnessStateV2(value) {
  return checkedState(value).uptimeAdapterState;
}

function underlyingReservation(reservation) {
  const state = checkedState(reservation?.adapterState);
  if (reservation.reservationId !== state.uptimeReservationId) {
    fail("RESERVATION_ID_MISMATCH");
  }
  return Object.freeze({
    ...reservation,
    reservationId: state.uptimeReservationId,
    adapterState: state.uptimeAdapterState,
  });
}

function activeAcceptanceCriteria(context) {
  const criteria = context?.program?.outcome?.acceptance;
  if (!Array.isArray(criteria)) return null;
  const active = context.acceptance ?? context?.node?.acceptance ?? [];
  if (!Array.isArray(active)) return null;
  const byId = new Map(criteria.map((criterion) =>
    [criterion?.criterionId, criterion]));
  if (active.some((criterionId) => !byId.has(criterionId))) return null;
  return active.map((criterionId) => byId.get(criterionId));
}

function isExactStatusCriterion(criterion) {
  return criterion?.comparator === "EQUALS"
    && Number.isSafeInteger(criterion.expected)
    && /(?:http|status)/iu.test(
      `${criterion.criterionId ?? ""} ${criterion.subject ?? ""}`);
}

function isExactHashCriterion(criterion) {
  return criterion?.comparator === "MATCHES_HASH"
    && typeof criterion.expected === "string"
    && HASH.test(criterion.expected);
}

function exactResponseExpectation(context) {
  const criteria = activeAcceptanceCriteria(context);
  if (criteria === null) return null;
  const statusCriteria = criteria.filter((criterion) =>
    isExactStatusCriterion(criterion));
  const bodyCriteria = criteria.filter((criterion) =>
    isExactHashCriterion(criterion));
  const constrainedStatus = context?.requirement?.constraints?.expectedStatus;
  const constrainedHash = context?.requirement?.constraints?.expectedBodyHash;
  const status = statusCriteria.length === 1 ? statusCriteria[0].expected
    : Number.isSafeInteger(constrainedStatus) ? constrainedStatus : null;
  const bodyHash = bodyCriteria.length === 1 ? bodyCriteria[0].expected
    : typeof constrainedHash === "string" && HASH.test(constrainedHash)
      ? constrainedHash : null;
  if (!Number.isSafeInteger(status) || status < 100 || status > 599
    || bodyHash === null) return null;
  return Object.freeze({ status, bodyHash });
}

function exactSpotOnlyAcceptance(context) {
  const criteria = activeAcceptanceCriteria(context);
  return Array.isArray(criteria) && criteria.length > 0
    && criteria.every((criterion) => isExactStatusCriterion(criterion)
      || isExactHashCriterion(criterion));
}

function longitudinalProofRequired(context) {
  if (context?.node?.kind !== "OBSERVATION") return false;
  const criteria = activeAcceptanceCriteria(context);
  return Array.isArray(criteria) && criteria.some((criterion) =>
    ["PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS", "CONTINUOUS_FOR_MS"]
      .includes(criterion?.comparator));
}

function exactSpotResult(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !Number.isSafeInteger(value.status) || value.status < 100
    || value.status > 599 || typeof value.bodyHash !== "string"
    || !HASH.test(value.bodyHash)) return null;
  return {
    status: value.status,
    bodyHash: value.bodyHash,
    providerReceiptHash: receiptCommitment(
      "outsider/exact-spot-observer-provider-receipt/v1",
      value.providerReceipt ?? value.observationId ?? null),
  };
}

function sanitizedLongitudinalMetrics(uptime) {
  const value = uptime?.sanitizedExactMetrics
    ?? uptime?.providerReceipt?.metrics ?? null;
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.uptime !== "number" || !Number.isFinite(value.uptime)
    || value.uptime < 0 || value.uptime > 100
    || typeof value.totalDowntimeSeconds !== "number"
    || !Number.isFinite(value.totalDowntimeSeconds)
    || value.totalDowntimeSeconds < 0
    || !Number.isSafeInteger(value.incidentCount) || value.incidentCount < 0
    || typeof value.from !== "string" || !Number.isFinite(Date.parse(value.from))
    || typeof value.to !== "string" || !Number.isFinite(Date.parse(value.to))) {
    return null;
  }
  return Object.freeze({
    uptime: value.uptime,
    totalDowntimeSeconds: value.totalDowntimeSeconds,
    incidentCount: value.incidentCount,
    mtbf: typeof value.mtbf === "number" && Number.isFinite(value.mtbf)
      ? value.mtbf : null,
    from: new Date(Date.parse(value.from)).toISOString(),
    to: new Date(Date.parse(value.to)).toISOString(),
  });
}

function observationReceipt(config, uptime, spot, expected, status,
  longitudinalWindowProven, longitudinalRequired) {
  const body = {
    schema: "outsider/composed-http-outcome-witness-receipt/v2",
    schemaVersion: "2.0.0",
    result: status,
    longitudinal: {
      providerRef: config.uptimeProviderRef,
      requiredForThisNode: longitudinalRequired,
      status: longitudinalRequired
        ? uptime?.status ?? "UNAVAILABLE" : "NOT_REQUIRED",
      exactRangeWindowProven: uptime?.longitudinalWindowProven === true,
      sanitizedExactMetrics: sanitizedLongitudinalMetrics(uptime),
      providerReceiptHash: receiptCommitment(
        "outsider/uptime-longitudinal-provider-receipt/v1",
        uptime?.providerReceipt ?? uptime?.observationId ?? null),
    },
    exactSpot: {
      providerRef: config.spotProviderRef,
      status: spot?.status ?? null,
      bodyHash: spot?.bodyHash ?? null,
      providerReceiptHash: spot?.providerReceiptHash ?? null,
    },
    expectedExactResponse: expected,
    bothSourcesRequired: longitudinalRequired,
    longitudinalWindowProven,
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

function checkpointEvidence(context) {
  if (context?.node?.kind !== "CHECKPOINT") return null;
  const criteria = activeAcceptanceCriteria(context);
  const dependencies = context?.effectResult?.dependencyEvidence;
  if (!Array.isArray(criteria) || criteria.length === 0
    || !Array.isArray(dependencies) || dependencies.length === 0) return {
    satisfied: false,
    criteria: criteria ?? [],
    witnesses: [],
  };
  const witnesses = dependencies.map((dependency) => dependency?.witness)
    .filter((witness) => witness !== null && typeof witness === "object"
      && witness.status === "SATISFIED"
      && (typeof context.routeRef !== "string"
        || typeof witness.selectedRouteRef !== "string"
        || witness.selectedRouteRef === context.routeRef));
  const criterionProven = (criterion) => witnesses.some((witness) => {
    if (isExactStatusCriterion(criterion)
      || isExactHashCriterion(criterion)) {
      return witness.exactResponseMatched === true;
    }
    if (["PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS", "CONTINUOUS_FOR_MS"]
      .includes(criterion?.comparator)) {
      return witness.longitudinalWindowProven === true;
    }
    if (criterion?.comparator === "ENDPOINT_SAMPLED_AT_OR_AFTER_MS") {
      return witness.endpointSampledAtOrAfterHorizon === true;
    }
    return false;
  });
  return {
    satisfied: dependencies.every((dependency) =>
      dependency?.witness?.status === "SATISFIED")
      && criteria.every(criterionProven),
    criteria,
    witnesses,
  };
}

function checkpointReceipt(config, context, evidence, status) {
  const body = {
    schema: "outsider/composed-http-outcome-checkpoint-receipt/v1",
    schemaVersion: "1.0.0",
    result: status,
    evidenceMode: "REUSED_SATISFIED_DEPENDENCY_EVIDENCE",
    longitudinalProviderRef: config.uptimeProviderRef,
    exactSpotProviderRef: config.spotProviderRef,
    acceptedCriterionIds: evidence.criteria.map((criterion) =>
      criterion.criterionId),
    selectedRouteRefHash: receiptCommitment(
      "outsider/composed-http-checkpoint-route/v1", context.routeRef ?? null),
    dependencyWitnesses: evidence.witnesses.map((witness) => ({
      observationReceiptHash: receiptCommitment(
        "outsider/composed-http-checkpoint-dependency/v1",
        witness.providerReceipt ?? witness.observationId ?? null),
      exactResponseMatched: witness.exactResponseMatched === true,
      longitudinalWindowProven:
        witness.longitudinalWindowProven === true,
    })),
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

function reservationReceipt(config, source) {
  const body = {
    schema: "outsider/composed-http-witness-reservation-receipt/v1",
    schemaVersion: "1.0.0",
    longitudinalProviderRef: config.uptimeProviderRef,
    exactSpotProviderRef: config.spotProviderRef,
    exactSpotReservationKind: "PER_OBSERVATION_INJECTED_CALL",
    uptimeProviderReceiptHash: receiptCommitment(
      "outsider/uptime-reservation-provider-receipt/v1",
      source.providerReceipt ?? null),
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

function lifecycleReceipt(config, phase, source) {
  const body = {
    schema: "outsider/composed-http-witness-lifecycle-receipt/v1",
    schemaVersion: "1.0.0",
    phase,
    longitudinalProviderRef: config.uptimeProviderRef,
    exactSpotProviderRef: config.spotProviderRef,
    uptimeProviderReceiptHash: receiptCommitment(
      `outsider/uptime-${phase.toLowerCase()}-provider-receipt/v1`,
      source.receipt ?? source.providerReceipt ?? null),
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

export function createComposedHttpOutcomeWitnessAdapterV2(input = {}) {
  const uptimeAdapter = input.uptimeAdapter;
  const spot = input.exactSpotObserver;
  const spotObserve = typeof spot === "function" ? spot
    : typeof spot?.observe === "function" ? spot.observe.bind(spot) : null;
  if (uptimeAdapter === null || typeof uptimeAdapter !== "object"
    || typeof uptimeAdapter.reserve !== "function"
    || typeof uptimeAdapter.observe !== "function"
    || typeof uptimeAdapter.release !== "function"
    || typeof uptimeAdapter.closeObligation !== "function"
    || spotObserve === null) fail("ADAPTER_SURFACE_INVALID");
  const config = Object.freeze({
    adapterId: identifier(input.adapterId
      ?? `composed-http-witness-v2:${uptimeAdapter.adapterId}`,
    "ADAPTER_ID"),
    uptimeProviderRef: identifier(input.uptimeProviderRef
      ?? uptimeAdapter.providerRef ?? "uptimerobot-api-v3",
    "UPTIME_PROVIDER_REF"),
    spotProviderRef: identifier(input.spotProviderRef
      ?? spot.providerRef ?? "injected-exact-http-spot-observer",
    "SPOT_PROVIDER_REF"),
  });

  const adapter = {
    adapterId: config.adapterId,
    providerRef:
      `${config.uptimeProviderRef}+${config.spotProviderRef}`,
    capabilities: Object.freeze([CAPABILITY]),

    supports(requirement) {
      const own = requirement?.role === "INDEPENDENT_WITNESS"
        && requirement?.capability === CAPABILITY;
      return own && (typeof uptimeAdapter.supports !== "function"
        || uptimeAdapter.supports({
          ...requirement,
          capability: UPTIME_CAPABILITY,
        }));
    },

    async reserve(context) {
      const source = await uptimeAdapter.reserve(context);
      if (!["RESERVED", "PENDING"].includes(source?.status)) return {
        status: source?.status ?? "UNAVAILABLE",
        reason: source?.reason ?? "UPTIME_RESERVATION_UNAVAILABLE",
      };
      if (typeof source.reservationId !== "string"
        || source.reservationId.length < 1
        || typeof source.validUntil !== "string"
        || !Number.isFinite(Date.parse(source.validUntil))
        || source.adapterState === null
        || typeof source.adapterState !== "object") {
        fail("UPTIME_RESERVATION_STATE_INVALID");
      }
      const state = compositeState(source, config.uptimeProviderRef,
        config.spotProviderRef);
      return {
        status: source.status,
        reservationId: source.reservationId,
        validUntil: source.validUntil,
        providerReceipt: reservationReceipt(config, source),
        adapterState: state,
        ...(source.status === "PENDING"
          ? { reason: source.reason ?? "UPTIME_CREATE_RECONCILIATION_PENDING",
            createReconciliationPending: true }
          : {}),
      };
    },

    async observe(context) {
      let reservation;
      try { reservation = underlyingReservation(context.reservation); }
      catch {
        return {
          status: "INCONCLUSIVE",
          reason: "COMPOSITE_RESERVATION_INVALID",
        };
      }
      const prior = checkpointEvidence(context);
      if (prior !== null) {
        const status = prior.satisfied ? "SATISFIED" : "INCONCLUSIVE";
        const receipt = checkpointReceipt(config, context, prior, status);
        const exactRequired = prior.criteria.some((criterion) =>
          isExactStatusCriterion(criterion)
            || isExactHashCriterion(criterion));
        const longitudinalRequired = prior.criteria.some((criterion) =>
          ["PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS", "CONTINUOUS_FOR_MS"]
            .includes(criterion?.comparator));
        return {
          status,
          observationId: receipt.receiptHash,
          reason: prior.satisfied ? null
            : "CHECKPOINT_ACCEPTANCE_EVIDENCE_NOT_PROVEN",
          providerReceipt: receipt,
          adapterState: context.reservation.adapterState,
          acceptanceEvidenceReused: true,
          acceptedCriterionIds: prior.criteria.map((criterion) =>
            criterion.criterionId),
          longitudinalStatusSatisfied: longitudinalRequired
            ? prior.satisfied : null,
          exactResponseMatched: exactRequired ? prior.satisfied : null,
          bothSourcesSatisfied: exactRequired && longitudinalRequired
            ? prior.satisfied : false,
          longitudinalWindowProven: longitudinalRequired
            && prior.satisfied,
          retryAfter: null,
        };
      }
      const expected = exactResponseExpectation(context);
      const delegated = { ...context, reservation };
      const proofRequired = longitudinalProofRequired(context);
      const spotOnly = exactSpotOnlyAcceptance(context);
      if (!proofRequired && !spotOnly) {
        return {
          status: "INCONCLUSIVE",
          reason: "ACCEPTANCE_CRITERIA_UNSUPPORTED_BY_EXACT_HTTP_WITNESS",
          adapterState: context.reservation.adapterState,
          retryAfter: null,
        };
      }
      let uptimeSettled = null;
      let spotSettled = null;
      if (proofRequired) {
        [uptimeSettled] = await Promise.allSettled([
          uptimeAdapter.observe(delegated),
        ]);
        if (uptimeSettled.status === "fulfilled"
          && uptimeSettled.value?.status === "SATISFIED") {
          [spotSettled] = await Promise.allSettled([spotObserve({
            ...context,
            reservation,
            expectedExactResponse: expected,
            targetUrl: context?.effectResult?.routeUrl
              ?? context?.effectResult?.publicUrl ?? context?.routeRef ?? null,
          })]);
        }
      } else {
        [spotSettled] = await Promise.allSettled([spotObserve({
          ...context,
          reservation,
          expectedExactResponse: expected,
          targetUrl: context?.effectResult?.routeUrl
            ?? context?.effectResult?.publicUrl ?? context?.routeRef ?? null,
        })]);
      }
      const uptime = uptimeSettled?.status === "fulfilled"
        ? uptimeSettled.value : null;
      const exact = spotSettled?.status === "fulfilled"
        ? exactSpotResult(spotSettled.value) : null;
      const spotMismatch = expected !== null && exact !== null
        && (exact.status !== expected.status
          || exact.bodyHash !== expected.bodyHash);
      const uptimeMismatch = uptime?.status === "NOT_SATISFIED";
      const exactSatisfied = expected !== null && exact !== null
        && !spotMismatch;
      const exactAndUptimeSatisfied = exactSatisfied
        && uptime?.status === "SATISFIED";
      const longitudinalWindowProven = proofRequired
        && exactAndUptimeSatisfied
        && uptime?.longitudinalWindowProven === true;
      const bothSatisfied = exactAndUptimeSatisfied
        && (!proofRequired || longitudinalWindowProven);
      const acceptanceSatisfied = proofRequired
        ? bothSatisfied : exactSatisfied;
      const status = acceptanceSatisfied ? "SATISFIED"
        : uptimeMismatch || spotMismatch ? "NOT_SATISFIED" : "INCONCLUSIVE";
      const receipt = observationReceipt(config, uptime, exact, expected,
        status, longitudinalWindowProven, proofRequired);
      const nextAdapterState = uptime?.adapterState === undefined
        ? context.reservation.adapterState
        : compositeState({
          reservationId: reservation.reservationId,
          adapterState: uptime.adapterState,
        }, config.uptimeProviderRef, config.spotProviderRef);
      return {
        status,
        observationId: receipt.receiptHash,
        reason: status === "SATISFIED" ? null
          : expected === null ? "EXACT_RESPONSE_CRITERIA_UNRESOLVED"
            : uptimeSettled?.status === "rejected"
              ? "UPTIME_OBSERVATION_UNAVAILABLE"
              : uptimeMismatch ? "LONGITUDINAL_REQUIREMENT_MISMATCH"
                : proofRequired && uptime?.status === "INCONCLUSIVE"
                  ? uptime.reason ?? "LONGITUDINAL_OBSERVATION_INCONCLUSIVE"
                  : proofRequired
                    && uptime?.longitudinalWindowProven !== true
                    ? "LONGITUDINAL_WINDOW_NOT_PROVEN"
                    : spotSettled?.status === "rejected" || exact === null
                      ? "EXACT_SPOT_OBSERVATION_UNAVAILABLE"
                      : spotMismatch ? "EXACT_RESPONSE_MISMATCH"
                        : "BOTH_WITNESS_SOURCES_NOT_SATISFIED",
        providerReceipt: receipt,
        adapterState: nextAdapterState,
        acceptedCriterionIds: activeAcceptanceCriteria(context)
          ?.map((criterion) => criterion.criterionId) ?? [],
        longitudinalStatusSatisfied: proofRequired
          ? uptime?.status === "SATISFIED" : null,
        exactResponseMatched: expected !== null && exact !== null
          && !spotMismatch,
        bothSourcesSatisfied: proofRequired ? bothSatisfied : false,
        longitudinalWindowProven,
        sanitizedExactMetrics: sanitizedLongitudinalMetrics(uptime),
        witnessReadyAt: uptime?.witnessReadyAt ?? null,
        windowFrom: uptime?.windowFrom ?? null,
        windowTo: uptime?.windowTo ?? null,
        observationWindowAnchoredAfterReadiness:
          uptime?.observationWindowAnchoredAfterReadiness ?? null,
        retryAfter: status === "INCONCLUSIVE"
          ? uptime?.retryAfter ?? null : null,
      };
    },

    async release(context) {
      const reservation = underlyingReservation(context.reservation);
      const source = await uptimeAdapter.release({ ...context, reservation });
      const receipt = lifecycleReceipt(config, "RELEASE", source ?? {});
      return {
        status: source?.status ?? "UNAVAILABLE",
        reason: source?.reason ?? null,
        receipt: receipt.receiptHash,
        providerReceipt: receipt,
        adapterState: source?.adapterState === undefined
          ? context.reservation.adapterState
          : compositeState({
            reservationId: context.reservation.reservationId,
            adapterState: source.adapterState,
          }, config.uptimeProviderRef, config.spotProviderRef),
      };
    },

    async closeObligation(context) {
      const reservation = underlyingReservation(context.reservation);
      const source = await uptimeAdapter.closeObligation({
        ...context, reservation,
      });
      const receipt = lifecycleReceipt(config, "CLOSE", source ?? {});
      const nextState = source?.adapterState === undefined
        ? context.reservation.adapterState
        : compositeState({
          reservationId: context.reservation.reservationId,
          adapterState: source.adapterState,
        }, config.uptimeProviderRef, config.spotProviderRef);
      return {
        status: source?.status ?? "OPEN",
        reason: source?.reason ?? null,
        receipt: receipt.receiptHash,
        providerReceipt: receipt,
        adapterState: nextState,
      };
    },
  };
  return Object.freeze(adapter);
}
