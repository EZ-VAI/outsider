/*
 * Reserve independent witnesses for every execution route before COMMIT (v2).
 *
 * The route references are extracted from already-confirmed PRIMARY and
 * RECOVERY reservations by injected code. They must be public, secret-free
 * references. A child witness is created and reserved for each route. After
 * execution, only the child whose route exactly matches routeUrl/resultUrl is
 * allowed to judge the outcome; lifecycle closure still releases both.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_ROUTE_AWARE_WITNESS_ADAPTER_V2_";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const PROVIDER_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,255}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const STATE_SCHEMA = "outsider/route-aware-witness-state/v2";
const DEFAULT_CAPABILITY
  = "PUBLIC_HTTPS_LONGITUDINAL_EXACT_RESPONSE_OBSERVATION";
const ROUTE_ROLES = Object.freeze(["PRIMARY", "RECOVERY"]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function identifier(value, code) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(code);
  return value;
}

function providerIdentifier(value, code) {
  if (typeof value !== "string" || !PROVIDER_REF.test(value)) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function snapshot(value, code) {
  try { return JSON.parse(canonicalizeStrict(value)); }
  catch { fail(code); }
}

function receiptHash(domain, value) {
  try { return digest(domain, value ?? null); }
  catch { return digest(domain, "NON_CANONICAL_RECEIPT_OMITTED"); }
}

function publicRouteRef(value) {
  const candidate = typeof value === "string" ? value
    : typeof value?.routeRef === "string" ? value.routeRef
      : typeof value?.routeUrl === "string" ? value.routeUrl
        : typeof value?.resultUrl === "string" ? value.resultUrl : null;
  if (candidate === null || candidate.length === 0 || candidate.length > 4096
    || candidate.trim() !== candidate || /[\u0000-\u001f\u007f]/u.test(candidate)) {
    fail("PUBLIC_ROUTE_REF_INVALID");
  }
  return candidate;
}

function childOperationId(operationId, phase, routeRef) {
  identifier(operationId, "OPERATION_ID_INVALID");
  const suffix = createHash("sha256").update(routeRef, "utf8")
    .digest("hex").slice(0, 20);
  return `${operationId}:${phase}:${suffix}`;
}

function checkedChildAdapter(value) {
  if (value === null || typeof value !== "object"
    || typeof value.reserve !== "function"
    || typeof value.observe !== "function"
    || typeof value.release !== "function"
    || typeof value.closeObligation !== "function") {
    fail("CHILD_ADAPTER_SURFACE_INVALID");
  }
  identifier(value.adapterId, "CHILD_ADAPTER_ID_INVALID");
  providerIdentifier(value.providerRef ?? value.adapterId,
    "CHILD_PROVIDER_REF_INVALID");
  return value;
}

function publicChildReservation(value) {
  if (value === null || typeof value !== "object"
    || !["RESERVED", "PENDING"].includes(value.status)
    || typeof value.reservationId !== "string"
    || value.reservationId.length === 0
    || typeof value.validUntil !== "string"
    || !Number.isFinite(Date.parse(value.validUntil))) return null;
  return snapshot({
    status: value.status,
    reservationId: value.reservationId,
    validUntil: value.validUntil,
    providerReceipt: value.providerReceipt ?? null,
    adapterState: value.adapterState ?? null,
  }, "CHILD_RESERVATION_NOT_PUBLIC_CANONICAL");
}

function buildState(routeEntries) {
  const routes = [...routeEntries]
    .sort((left, right) => ROUTE_ROLES.indexOf(left.routeRole)
      - ROUTE_ROLES.indexOf(right.routeRole))
    .map((entry) => snapshot(entry, "ROUTE_STATE_NOT_CANONICAL"));
  const body = {
    schema: STATE_SCHEMA,
    schemaVersion: "2.0.0",
    containsCredential: false,
    routes,
  };
  return Object.freeze({ ...body, stateHash: digest(STATE_SCHEMA, body) });
}

function checkedState(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.schema !== STATE_SCHEMA || value.schemaVersion !== "2.0.0"
    || value.containsCredential !== false || !Array.isArray(value.routes)
    || value.routes.length !== 2 || typeof value.stateHash !== "string"
    || !HASH.test(value.stateHash)) fail("ADAPTER_STATE_INVALID");
  const roles = new Set();
  for (const entry of value.routes) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || !ROUTE_ROLES.includes(entry.routeRole)
      || typeof entry.dependencyRequirementId !== "string"
      || entry.dependencyRequirementId.length === 0
      || typeof entry.routeRef !== "string"
      || typeof entry.childAdapterId !== "string"
      || typeof entry.childProviderRef !== "string"
      || publicChildReservation(entry.childReservation) === null) {
      fail("ADAPTER_ROUTE_STATE_INVALID");
    }
    publicRouteRef(entry.routeRef);
    identifier(entry.childAdapterId, "ADAPTER_ROUTE_CHILD_ID_INVALID");
    providerIdentifier(entry.childProviderRef,
      "ADAPTER_ROUTE_CHILD_PROVIDER_INVALID");
    if (roles.has(entry.routeRole)) fail("ADAPTER_ROUTE_ROLE_DUPLICATE");
    roles.add(entry.routeRole);
  }
  if (roles.size !== 2) fail("ADAPTER_ROUTE_ROLES_INCOMPLETE");
  const body = { ...value };
  delete body.stateHash;
  if (digest(STATE_SCHEMA, body) !== value.stateHash) {
    fail("ADAPTER_STATE_HASH_MISMATCH");
  }
  return value;
}

function reservationState(reservation) {
  if (reservation === null || typeof reservation !== "object") {
    fail("RESERVATION_INVALID");
  }
  return checkedState(reservation.adapterState);
}

function reservationReceipt(adapterId, entries) {
  const body = {
    schema: "outsider/route-aware-witness-reservation-receipt/v2",
    schemaVersion: "2.0.0",
    adapterId,
    routes: entries.map((entry) => ({
      routeRole: entry.routeRole,
      routeRef: entry.routeRef,
      childAdapterId: entry.childAdapterId,
      childProviderRef: entry.childProviderRef,
      childReservationId: entry.childReservation.reservationId,
      childProviderReceiptHash: receiptHash(
        "outsider/route-child-reservation-provider-receipt/v1",
        entry.childReservation.providerReceipt),
    })),
    allRoutesReservedBeforeCommit: entries.every((entry) =>
      entry.childReservation.status === "RESERVED"),
    pendingCreateReconciliationPreserved: entries.some((entry) =>
      entry.childReservation.status === "PENDING"),
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

function observationReceipt(adapterId, entry, childResult) {
  const metrics = childResult?.sanitizedExactMetrics;
  const sanitizedExactMetrics = metrics !== null
    && typeof metrics === "object" && !Array.isArray(metrics)
    && typeof metrics.uptime === "number"
    && typeof metrics.totalDowntimeSeconds === "number"
    && Number.isSafeInteger(metrics.incidentCount)
    && typeof metrics.from === "string" && typeof metrics.to === "string"
    ? snapshot(metrics, "LONGITUDINAL_METRICS_NOT_CANONICAL") : null;
  const body = {
    schema: "outsider/route-aware-witness-observation-receipt/v2",
    schemaVersion: "2.0.0",
    adapterId,
    selectedRouteRole: entry.routeRole,
    selectedRouteRef: entry.routeRef,
    childAdapterId: entry.childAdapterId,
    childProviderRef: entry.childProviderRef,
    childStatus: childResult.status,
    witnessReadyAt: typeof childResult.witnessReadyAt === "string"
      ? childResult.witnessReadyAt : null,
    longitudinalWindowFrom: typeof childResult.windowFrom === "string"
      ? childResult.windowFrom : null,
    longitudinalWindowTo: typeof childResult.windowTo === "string"
      ? childResult.windowTo : null,
    sanitizedExactMetrics,
    childProviderReceiptHash: receiptHash(
      "outsider/route-child-observation-provider-receipt/v1",
      childResult.providerReceipt ?? childResult.observationId ?? null),
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

function lifecycleReceipt(adapterId, phase, entries, results) {
  const body = {
    schema: "outsider/route-aware-witness-lifecycle-receipt/v2",
    schemaVersion: "2.0.0",
    adapterId,
    phase,
    routes: entries.map((entry, index) => ({
      routeRole: entry.routeRole,
      routeRef: entry.routeRef,
      childAdapterId: entry.childAdapterId,
      childProviderRef: entry.childProviderRef,
      childStatus: results[index]?.status ?? "UNAVAILABLE",
      childReceiptHash: receiptHash(
        `outsider/route-child-${phase.toLowerCase()}-receipt/v1`,
        results[index]?.receipt ?? results[index]?.providerReceipt ?? null),
    })),
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

function routeDependencies(program, requirement, dependencyReservations) {
  if (!Array.isArray(requirement?.dependsOnRequirementIds)
    || requirement.dependsOnRequirementIds.length !== 2
    || dependencyReservations === null
    || typeof dependencyReservations !== "object"
    || Array.isArray(dependencyReservations)) {
    fail("ROUTE_DEPENDENCIES_INVALID");
  }
  const requirements = new Map((program?.requirements ?? []).map((item) =>
    [item.requirementId, item]));
  const dependencies = requirement.dependsOnRequirementIds.map(
    (dependencyRequirementId) => ({
      dependencyRequirementId,
      dependencyRequirement: requirements.get(dependencyRequirementId),
      dependencyReservation: dependencyReservations[dependencyRequirementId],
    }));
  for (const dependency of dependencies) {
    if (!dependency.dependencyRequirement
      || !ROUTE_ROLES.includes(dependency.dependencyRequirement.role)
      || dependency.dependencyReservation === null
      || typeof dependency.dependencyReservation !== "object") {
      fail("ROUTE_DEPENDENCY_MISSING");
    }
  }
  if (new Set(dependencies.map((item) =>
    item.dependencyRequirement.role)).size !== 2) {
    fail("ROUTE_DEPENDENCY_ROLES_INVALID");
  }
  return dependencies.sort((left, right) =>
    ROUTE_ROLES.indexOf(left.dependencyRequirement.role)
      - ROUTE_ROLES.indexOf(right.dependencyRequirement.role));
}

function directEffectRouteRef(effectResult) {
  const routeUrl = typeof effectResult?.routeUrl === "string"
    ? effectResult.routeUrl : null;
  const resultUrl = typeof effectResult?.resultUrl === "string"
    ? effectResult.resultUrl : null;
  if (routeUrl !== null && resultUrl !== null && routeUrl !== resultUrl) {
    return null;
  }
  const value = routeUrl ?? resultUrl;
  if (value === null) return null;
  try { return publicRouteRef(value); }
  catch { return null; }
}

function uniqueRouteRef(values) {
  const unique = [...new Set(values.filter((value) => value !== null))];
  return unique.length === 1 ? unique[0] : null;
}

function actualRouteRef(effectResult) {
  const direct = directEffectRouteRef(effectResult);
  if (direct !== null) return direct;
  if (!Array.isArray(effectResult?.dependencyEvidence)) return null;

  // Non-effect program nodes receive dependency evidence rather than a new
  // effect URL. A prior route-aware observation is the authoritative pointer.
  const witnessedCandidates = effectResult.dependencyEvidence.map(
    (evidence) => {
      const value = evidence?.witness?.selectedRouteRef;
      if (typeof value !== "string") return null;
      try { return publicRouteRef(value); }
      catch { return null; }
    }).filter((value) => value !== null);
  if (witnessedCandidates.length > 0) {
    return uniqueRouteRef(witnessedCandidates);
  }

  // Compatibility fallback for the immediately preceding EFFECT: only a
  // successful route is eligible, so a failed primary can never override the
  // successful recovery URL.
  return uniqueRouteRef(effectResult.dependencyEvidence.flatMap((evidence) =>
    [evidence?.primary, evidence?.recovery]
      .filter((result) => result?.status === "SUCCEEDED")
      .map((result) => directEffectRouteRef(result))));
}

/**
 * createRouteWitness receives a public routeRef and may return a composed
 * Uptime+exact-spot adapter configured for that route. On replay it also
 * receives resumeReservation, the child's previously persisted public state.
 */
export function createRouteAwareWitnessAdapterV2(input = {}) {
  if (typeof input.routeFromReservation !== "function"
    || typeof input.createRouteWitness !== "function") {
    fail("FACTORY_FUNCTIONS_INVALID");
  }
  const adapterId = identifier(input.adapterId ?? "route-aware-witness-v1",
    "ADAPTER_ID_INVALID");
  const providerRef = providerIdentifier(input.providerRef
    ?? "route-aware-independent-witness", "PROVIDER_REF_INVALID");
  const capabilities = Object.freeze([...(input.capabilities
    ?? [DEFAULT_CAPABILITY])].map((value) => identifier(value,
    "CAPABILITY_INVALID")));
  const cache = new Map();

  async function childFor(entry, context = {}) {
    const key = `${entry.routeRole}\0${entry.routeRef}`;
    if (cache.has(key)) return cache.get(key);
    const child = checkedChildAdapter(await input.createRouteWitness({
      program: context.program ?? null,
      witnessRequirement: context.requirement ?? null,
      binding: context.binding ?? null,
      routeRole: entry.routeRole,
      routeRef: entry.routeRef,
      dependencyRequirementId: entry.dependencyRequirementId,
      dependencyRequirement: context.dependencyRequirement ?? null,
      dependencyReservation: context.dependencyReservation ?? null,
      reserveOperationId: context.reserveOperationId ?? null,
      resumeReservation: entry.childReservation ?? null,
    }));
    if (entry.childAdapterId !== undefined
      && (child.adapterId !== entry.childAdapterId
        || (child.providerRef ?? child.adapterId) !== entry.childProviderRef)) {
      fail("CHILD_ADAPTER_REPLAY_IDENTITY_MISMATCH");
    }
    cache.set(key, child);
    return child;
  }

  async function compensate(entries, context) {
    const settled = await Promise.allSettled(entries.map(async (entry) => {
      const child = await childFor(entry, context);
      return child.release({
        ...context,
        routeRole: entry.routeRole,
        routeRef: entry.routeRef,
        reservation: entry.childReservation,
        operationId: childOperationId(context.operationId,
          "RESERVE_COMPENSATE", entry.routeRef),
        disposition: "FORMATION_FAILED",
      });
    }));
    if (settled.some((result) => result.status === "rejected"
      || !["RELEASED", "CLOSED"].includes(result.value?.status))) {
      fail("COMPENSATING_RELEASE_FAILED");
    }
  }

  async function lifecycle(method, phase, context) {
    const state = reservationState(context.reservation);
    const entries = state.routes;
    const settled = await Promise.allSettled(entries.map(async (entry) => {
      const child = await childFor(entry, context);
      return child[method]({
        ...context,
        routeRole: entry.routeRole,
        routeRef: entry.routeRef,
        reservation: entry.childReservation,
        operationId: childOperationId(context.operationId, phase,
          entry.routeRef),
      });
    }));
    const rejected = settled.find((result) => result.status === "rejected");
    if (rejected) throw rejected.reason;
    const results = settled.map((result) => result.value);
    const allowed = phase === "CLOSE"
      ? ["CLOSED", "RELEASED"] : ["RELEASED", "CLOSED"];
    const completed = results.every((result) =>
      allowed.includes(result?.status));
    const nextEntries = entries.map((entry, index) => ({
      ...entry,
      childReservation: {
        ...entry.childReservation,
        adapterState: results[index]?.adapterState
          ?? entry.childReservation.adapterState,
      },
    }));
    const receipt = lifecycleReceipt(adapterId, phase, entries, results);
    return {
      status: completed ? (phase === "CLOSE" ? "CLOSED" : "RELEASED")
        : "OPEN",
      reason: completed ? null : "NOT_ALL_ROUTE_WITNESSES_RELEASED",
      receipt: receipt.receiptHash,
      providerReceipt: receipt,
      adapterState: buildState(nextEntries),
    };
  }

  const adapter = {
    adapterId,
    providerRef,
    capabilities,

    supports(requirement) {
      return requirement?.role === "INDEPENDENT_WITNESS"
        && capabilities.includes(requirement.capability);
    },

    async reserve(context) {
      let resumeRoutes = [];
      if (context.resumeReservation !== undefined
        && context.resumeReservation !== null) {
        resumeRoutes = reservationState(context.resumeReservation).routes;
      }
      const dependencies = routeDependencies(context.program,
        context.requirement, context.dependencyReservations);
      const routed = await Promise.all(dependencies.map(async (dependency) => ({
        ...dependency,
        routeRole: dependency.dependencyRequirement.role,
        routeRef: publicRouteRef(await input.routeFromReservation({
          program: context.program,
          witnessRequirement: context.requirement,
          binding: context.binding ?? null,
          ...dependency,
        })),
      })));
      if (new Set(routed.map((item) => item.routeRef)).size !== 2) {
        fail("PRIMARY_RECOVERY_ROUTE_REFS_NOT_DISTINCT");
      }
      const prepared = await Promise.all(routed.map(async (item) => {
        const prior = resumeRoutes.find((entry) =>
          entry.routeRole === item.routeRole && entry.routeRef === item.routeRef)
          ?? null;
        return {
          item,
          child: await childFor({
          routeRole: item.routeRole,
          routeRef: item.routeRef,
          dependencyRequirementId: item.dependencyRequirementId,
          ...(prior === null ? {} : {
            childAdapterId: prior.childAdapterId,
            childProviderRef: prior.childProviderRef,
            childReservation: prior.childReservation,
          }),
        }, {
          ...context,
          reserveOperationId: childOperationId(context.operationId, "RESERVE",
            item.routeRef),
          dependencyRequirement: item.dependencyRequirement,
          dependencyReservation: item.dependencyReservation,
        }),
        };
      }));
      const settled = await Promise.allSettled(prepared.map(({ item, child }) =>
        child.reserve({
          ...context,
          routeRole: item.routeRole,
          routeRef: item.routeRef,
          dependencyRequirement: item.dependencyRequirement,
          dependencyReservation: item.dependencyReservation,
          dependencyReservations: {
            [item.dependencyRequirementId]: item.dependencyReservation,
          },
          operationId: childOperationId(context.operationId, "RESERVE",
            item.routeRef),
        })));
      const entries = [];
      for (let index = 0; index < settled.length; index += 1) {
        if (settled[index].status !== "fulfilled") continue;
        const childReservation = publicChildReservation(settled[index].value);
        if (childReservation === null) continue;
        const { item, child } = prepared[index];
        entries.push({
          routeRole: item.routeRole,
          dependencyRequirementId: item.dependencyRequirementId,
          routeRef: item.routeRef,
          childAdapterId: child.adapterId,
          childProviderRef: child.providerRef ?? child.adapterId,
          childReservation,
        });
      }
      if (entries.length !== 2) {
        if (entries.length > 0) await compensate(entries, context);
        const rejected = settled.find((result) => result.status === "rejected");
        if (rejected) throw rejected.reason;
        return {
          status: "UNAVAILABLE",
          reason: "ALL_ROUTE_WITNESS_RESERVATIONS_REQUIRED",
        };
      }
      const state = buildState(entries);
      const receipt = reservationReceipt(adapterId, entries);
      const allReserved = entries.every((entry) =>
        entry.childReservation.status === "RESERVED");
      const validUntil = entries.map((entry) =>
        entry.childReservation.validUntil).sort((left, right) =>
        Date.parse(left) - Date.parse(right))[0];
      return {
        status: allReserved ? "RESERVED" : "PENDING",
        reservationId: `route-witness:${digest(
          "outsider/route-aware-witness-reservation-id/v1", {
            operationId: context.operationId,
            routes: entries.map((entry) => ({
              routeRole: entry.routeRole,
              routeRef: entry.routeRef,
              childReservationId: entry.childReservation.reservationId,
            })),
          }).slice("sha256:".length)}`,
        validUntil,
        providerReceipt: receipt,
        adapterState: state,
        ...(allReserved ? {} : {
          reason: "ROUTE_CREATE_RECONCILIATION_PENDING",
          allRoutesReservedBeforeCommit: false,
        }),
      };
    },

    async observe(context) {
      let state;
      try { state = reservationState(context.reservation); }
      catch {
        return { status: "INCONCLUSIVE", reason: "ROUTE_STATE_INVALID" };
      }
      const routeRef = actualRouteRef(context.effectResult);
      const entry = routeRef === null ? null : state.routes.find((item) =>
        item.routeRef === routeRef) ?? null;
      if (entry === null) {
        return {
          status: "INCONCLUSIVE",
          reason: routeRef === null
            ? "EFFECT_RESULT_ROUTE_REF_MISSING"
            : "EFFECT_RESULT_ROUTE_NOT_RESERVED",
          adapterState: context.reservation.adapterState,
        };
      }
      const child = await childFor(entry, context);
      const childResult = snapshot(await child.observe({
        ...context,
        routeRole: entry.routeRole,
        routeRef: entry.routeRef,
        reservation: entry.childReservation,
        operationId: childOperationId(context.operationId, "OBSERVE",
          entry.routeRef),
      }), "CHILD_OBSERVATION_NOT_CANONICAL");
      if (!["SATISFIED", "NOT_SATISFIED", "INCONCLUSIVE"]
        .includes(childResult?.status)) fail("CHILD_OBSERVATION_INVALID");
      const receipt = observationReceipt(adapterId, entry, childResult);
      const nextRoutes = state.routes.map((candidate) => candidate !== entry
        ? candidate : {
          ...candidate,
          childReservation: {
            ...candidate.childReservation,
            adapterState: childResult.adapterState
              ?? candidate.childReservation.adapterState,
          },
        });
      return {
        ...childResult,
        providerReceipt: receipt,
        observationId: receipt.receiptHash,
        adapterState: buildState(nextRoutes),
        selectedRouteRole: entry.routeRole,
        selectedRouteRef: entry.routeRef,
      };
    },

    async release(context) {
      return lifecycle("release", "RELEASE", context);
    },

    async closeObligation(context) {
      return lifecycle("closeObligation", "CLOSE", context);
    },
  };
  return Object.freeze(adapter);
}
