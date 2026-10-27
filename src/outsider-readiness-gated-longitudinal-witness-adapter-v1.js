/*
 * Formation readiness gate for an independent longitudinal witness.
 *
 * A create acknowledgement is only a monitor allocation, never usable
 * witness capacity. This decorator performs rate-bounded safe GET reads until
 * the child reports a fresh current UP, persists that exact readiness
 * occurrence, and only then returns RESERVED. If readiness cannot be proven
 * before the program's formation deadline, it releases (or reconciles an
 * ambiguous release of) the child reservation and returns UNAVAILABLE.
 *
 * The ready timestamp is carried through resume and later observations. A
 * longitudinal child is explicitly told to begin no earlier than the maximum
 * of this timestamp, its serviceFrom, and post-effect witness evidence.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX
  = "OUTSIDER_READINESS_GATED_LONGITUDINAL_WITNESS_ADAPTER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,255}$/u;
const INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const STATE_SCHEMA
  = "outsider/readiness-gated-longitudinal-witness-state/v1";
const MINIMUM_SAFE_READ_SPACING_MS = 15_000;
const DEFAULT_MAXIMUM_READ_OCCURRENCES = 20;

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

function snapshot(value, code) {
  try { return JSON.parse(canonicalizeStrict(value)); }
  catch { fail(code); }
}

function instant(value, code) {
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function identifier(value, code) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(code);
  return value;
}

function checkedChild(value) {
  if (value === null || typeof value !== "object"
    || typeof value.reserve !== "function"
    || typeof value.observe !== "function"
    || typeof value.release !== "function"
    || typeof value.closeObligation !== "function") {
    fail("CHILD_ADAPTER_INVALID");
  }
  identifier(value.adapterId, "CHILD_ADAPTER_ID_INVALID");
  identifier(value.providerRef ?? value.adapterId,
    "CHILD_PROVIDER_REF_INVALID");
  const redirect = value.redirectObservation;
  if (redirect === null || typeof redirect !== "object"
    || typeof redirect.followRedirections !== "boolean"
    || typeof redirect.externalRedirectPolicyHash !== "string"
    || !HASH.test(redirect.externalRedirectPolicyHash)
    || redirect.providerEnforcesExternalRedirectPolicy !== false) {
    fail("CHILD_REDIRECT_OBSERVATION_METADATA_INVALID");
  }
  return value;
}

function checkedState(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.schema !== STATE_SCHEMA || value.schemaVersion !== "1.0.0"
    || value.containsCredential !== false
    || !IDENTIFIER.test(value.childAdapterId)
    || !IDENTIFIER.test(value.childProviderRef)
    || typeof value.childReservationId !== "string"
    || value.childReservationId.length < 1
    || value.childAdapterState === null
    || typeof value.childAdapterState !== "object"
    || Array.isArray(value.childAdapterState)
    || value.childAdapterState.containsCredential !== false
    || !INSTANT.test(value.readyAt) || !INSTANT.test(value.formationDeadline)
    || Date.parse(value.readyAt) >= Date.parse(value.formationDeadline)
    || typeof value.readinessObservationId !== "string"
    || !HASH.test(value.readinessObservationId)
    || typeof value.readinessProviderReceiptHash !== "string"
    || !HASH.test(value.readinessProviderReceiptHash)
    || value.readinessSourceStatus !== "UP"
    || value.readinessSourceDeclaredRequirementMatch !== true
    || !Number.isSafeInteger(value.readinessOccurrenceCount)
    || value.readinessOccurrenceCount < 1
    || !Number.isSafeInteger(value.minimumSafeReadSpacingMs)
    || value.minimumSafeReadSpacingMs < MINIMUM_SAFE_READ_SPACING_MS
    || !Number.isSafeInteger(value.maximumReadOccurrences)
    || value.maximumReadOccurrences < value.readinessOccurrenceCount
    || typeof value.followRedirections !== "boolean"
    || typeof value.externalRedirectPolicyHash !== "string"
    || !HASH.test(value.externalRedirectPolicyHash)
    || typeof value.released !== "boolean"
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

export function unwrapReadinessGatedLongitudinalWitnessStateV1(value) {
  return checkedState(value).childAdapterState;
}

function buildState(config, childReservation, readiness, released = false) {
  const childState = snapshot(childReservation.adapterState,
    "CHILD_ADAPTER_STATE_NOT_CANONICAL");
  if (childState === null || typeof childState !== "object"
    || Array.isArray(childState) || childState.containsCredential !== false) {
    fail("CHILD_ADAPTER_STATE_INVALID");
  }
  const body = {
    schema: STATE_SCHEMA,
    schemaVersion: "1.0.0",
    containsCredential: false,
    childAdapterId: config.child.adapterId,
    childProviderRef: config.child.providerRef ?? config.child.adapterId,
    childReservationId: childReservation.reservationId,
    childAdapterState: childState,
    readyAt: readiness.readyAt,
    formationDeadline: readiness.formationDeadline,
    readinessObservationId: readiness.observationId,
    readinessProviderReceiptHash: readiness.providerReceiptHash,
    readinessSourceStatus: "UP",
    readinessSourceDeclaredRequirementMatch: true,
    readinessOccurrenceCount: readiness.occurrenceCount,
    minimumSafeReadSpacingMs: config.minimumSafeReadSpacingMs,
    maximumReadOccurrences: config.maximumReadOccurrences,
    followRedirections:
      config.child.redirectObservation.followRedirections,
    externalRedirectPolicyHash:
      config.child.redirectObservation.externalRedirectPolicyHash,
    released,
  };
  return Object.freeze({ ...body, stateHash: digest(STATE_SCHEMA, body) });
}

function stateFromReservation(reservation, config) {
  const state = checkedState(reservation?.adapterState);
  if (reservation.reservationId !== state.childReservationId
    || state.childAdapterId !== config.child.adapterId
    || state.childProviderRef
      !== (config.child.providerRef ?? config.child.adapterId)
    || state.minimumSafeReadSpacingMs !== config.minimumSafeReadSpacingMs
    || state.maximumReadOccurrences !== config.maximumReadOccurrences
    || state.followRedirections
      !== config.child.redirectObservation.followRedirections
    || state.externalRedirectPolicyHash
      !== config.child.redirectObservation.externalRedirectPolicyHash) {
    fail("RESERVATION_STATE_BINDING_MISMATCH");
  }
  return state;
}

function childReservation(reservation, state) {
  return Object.freeze({
    ...reservation,
    reservationId: state.childReservationId,
    adapterState: state.childAdapterState,
  });
}

function publicChildReservation(value) {
  if (value === null || typeof value !== "object"
    || value.status !== "RESERVED"
    || typeof value.reservationId !== "string"
    || value.reservationId.length < 1
    || typeof value.validUntil !== "string"
    || !Number.isFinite(Date.parse(value.validUntil))
    || value.adapterState === null || typeof value.adapterState !== "object") {
    return null;
  }
  return snapshot({
    status: "RESERVED",
    reservationId: value.reservationId,
    validUntil: value.validUntil,
    providerReceipt: value.providerReceipt ?? null,
    adapterState: value.adapterState,
  }, "CHILD_RESERVATION_NOT_CANONICAL");
}

function defaultWait(milliseconds, options = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const signal = options.signal;
    if (signal === undefined) return;
    if (signal.aborted) {
      clearTimeout(timer);
      reject(new Error("ABORTED"));
      return;
    }
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("ABORTED"));
    }, { once: true });
  });
}

function operationId(base, phase, occurrence = null) {
  const suffix = createHash("sha256").update(`${base}\0${phase}`, "utf8")
    .digest("hex").slice(0, 32);
  return `readiness:${phase.toLowerCase()}:${suffix}${occurrence === null
    ? "" : `:${occurrence}`}`;
}

function programFormationDeadline(context) {
  return instant(context?.program?.formationDeadline,
    "FORMATION_DEADLINE_INVALID");
}

function dependencyAnchor(effectResult) {
  if (!Array.isArray(effectResult?.dependencyEvidence)
    || effectResult.dependencyEvidence.length === 0) return null;
  const times = effectResult.dependencyEvidence.map((evidence) => {
    const values = [evidence?.primaryEffectRecordedAt,
      evidence?.recoveryEffectRecordedAt, evidence?.witnessRecordedAt]
      .filter((value) => typeof value === "string"
        && Number.isFinite(Date.parse(value)))
      .map(Date.parse);
    return values.length === 0 ? null : Math.max(...values);
  });
  return times.some((value) => value === null) ? null : Math.max(...times);
}

function longitudinalRequired(context) {
  if (context?.node?.kind !== "OBSERVATION") return false;
  const accepted = new Set(Array.isArray(context.node.acceptance)
    ? context.node.acceptance : []);
  return (context?.program?.outcome?.acceptance ?? []).some((criterion) =>
    accepted.has(criterion?.criterionId)
      && ["PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS", "CONTINUOUS_FOR_MS"]
        .includes(criterion?.comparator));
}

function reservationReceipt(config, child, readiness) {
  const body = {
    schema:
      "outsider/readiness-gated-longitudinal-witness-reservation-receipt/v1",
    schemaVersion: "1.0.0",
    adapterId: config.adapterId,
    childAdapterId: config.child.adapterId,
    childProviderRef: config.child.providerRef ?? config.child.adapterId,
    childReservationReceiptHash: receiptHash(
      "outsider/readiness-child-reservation-receipt/v1",
      child.providerReceipt ?? null),
    readinessObservationId: readiness.observationId,
    readinessProviderReceiptHash: readiness.providerReceiptHash,
    sourceStatus: "UP",
    sourceDeclaredRequirementMatch: true,
    readyAt: readiness.readyAt,
    formationDeadline: readiness.formationDeadline,
    safeReadOccurrenceCount: readiness.occurrenceCount,
    minimumSafeReadSpacingMs: config.minimumSafeReadSpacingMs,
    maximumReadOccurrences: config.maximumReadOccurrences,
    followRedirections:
      config.child.redirectObservation.followRedirections,
    externalRedirectPolicyHash:
      config.child.redirectObservation.externalRedirectPolicyHash,
    providerEnforcesExternalRedirectPolicy: false,
    freshUpRequiredBeforeCommit: true,
    monitorCreateAcknowledgementAcceptedAsReadiness: false,
    authorityMintedByReadinessGate: false,
    independentOutcomeTruthClaimedByReadinessGate: false,
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

function wrapResult(config, result, reservation, state, extras = {}) {
  const nextChild = result?.adapterState === undefined ? reservation : {
    ...reservation, adapterState: result.adapterState,
  };
  return {
    ...result,
    ...extras,
    adapterState: buildState(config, nextChild, {
      readyAt: state.readyAt,
      formationDeadline: state.formationDeadline,
      observationId: state.readinessObservationId,
      providerReceiptHash: state.readinessProviderReceiptHash,
      occurrenceCount: state.readinessOccurrenceCount,
    }, result?.status === "RELEASED" || result?.status === "CLOSED"
      || state.released),
  };
}

export function createReadinessGatedLongitudinalWitnessAdapterV1(
  input = {}) {
  const child = checkedChild(input.childAdapter);
  const clock = input.clock ?? (() => new Date().toISOString());
  const wait = input.wait ?? defaultWait;
  const minimumSafeReadSpacingMs = input.minimumSafeReadSpacingMs
    ?? MINIMUM_SAFE_READ_SPACING_MS;
  const maximumReadOccurrences = input.maximumReadOccurrences
    ?? DEFAULT_MAXIMUM_READ_OCCURRENCES;
  if (typeof clock !== "function" || typeof wait !== "function"
    || !Number.isSafeInteger(minimumSafeReadSpacingMs)
    || minimumSafeReadSpacingMs < MINIMUM_SAFE_READ_SPACING_MS
    || minimumSafeReadSpacingMs > 60_000
    || !Number.isSafeInteger(maximumReadOccurrences)
    || maximumReadOccurrences < 1 || maximumReadOccurrences > 240
    || typeof input.requireRedirectFollowing !== "boolean"
    || typeof input.externalRedirectPolicyHash !== "string"
    || !HASH.test(input.externalRedirectPolicyHash)) fail("CONFIG_INVALID");
  if (input.externalRedirectPolicyHash
      !== child.redirectObservation.externalRedirectPolicyHash) {
    fail("EXTERNAL_REDIRECT_POLICY_BINDING_MISMATCH");
  }
  if (input.requireRedirectFollowing
    && child.redirectObservation.followRedirections !== true) {
    fail("REQUIRED_REDIRECT_FOLLOWING_DISABLED");
  }
  const adapterId = identifier(input.adapterId
    ?? `readiness-gated-v1:${child.adapterId}`, "ADAPTER_ID_INVALID");
  const config = Object.freeze({
    child, clock, wait, minimumSafeReadSpacingMs, maximumReadOccurrences,
    adapterId,
  });
  if (input.resumeAdapterState !== undefined
    && input.resumeAdapterState !== null) {
    const resumed = checkedState(input.resumeAdapterState);
    if (resumed.childAdapterId !== child.adapterId
      || resumed.childProviderRef !== (child.providerRef ?? child.adapterId)
      || resumed.minimumSafeReadSpacingMs !== minimumSafeReadSpacingMs
      || resumed.maximumReadOccurrences !== maximumReadOccurrences
      || resumed.followRedirections
        !== child.redirectObservation.followRedirections
      || resumed.externalRedirectPolicyHash
        !== child.redirectObservation.externalRedirectPolicyHash) {
      fail("RESUME_STATE_BINDING_MISMATCH");
    }
  }

  async function compensate(reservation, context) {
    let current = reservation;
    let result = null;
    const releaseOperationId = operationId(context.operationId,
      "READINESS_ABORT_RELEASE");
    const cleanupDeadline = instant(current.validUntil,
      "CHILD_RESERVATION_VALID_UNTIL_INVALID");
    // A repeated call cannot replay one DELETE effect: the child either
    // returns cached success, performs the exact GET reconciliation permitted
    // after an ambiguous mutation, or (after an explicit 429 rejection) waits
    // for and creates a separately-ledgered one-use cleanup effect.
    for (let attempt = 0; attempt < 64; attempt += 1) {
      try {
        result = await child.release({
          ...context,
          reservation: current,
          operationId: releaseOperationId,
          disposition: "FORMATION_READINESS_NOT_PROVEN",
        });
      } catch {
        result = null;
      }
      if (["RELEASED", "CLOSED"].includes(result?.status)) return result;
      if (result?.adapterState !== undefined) {
        current = { ...current, adapterState: result.adapterState };
      }
      if (!["PENDING", "OPEN"].includes(result?.status)) break;
      if (typeof result?.retryAfter === "string"
        && Number.isFinite(Date.parse(result.retryAfter))) {
        const before = Date.parse(instant(clock(), "CLOCK_RESULT_INVALID"));
        const retryAt = Date.parse(result.retryAfter);
        if (retryAt >= Date.parse(cleanupDeadline)) break;
        if (retryAt > before) {
          try {
            await wait(retryAt - before, context.options ?? {});
          } catch { break; }
          if (Date.parse(instant(clock(), "CLOCK_RESULT_INVALID")) < retryAt) {
            break;
          }
        }
      }
    }
    return result;
  }

  const adapter = {
    ...child,
    adapterId,
    providerRef: `${child.providerRef ?? child.adapterId}+readiness-gate-v1`,

    supports(requirement) {
      return typeof child.supports !== "function"
        || child.supports.call(child, requirement);
    },

    async reserve(context = {}) {
      const deadline = programFormationDeadline(context);
      if (Date.parse(instant(clock(), "CLOCK_RESULT_INVALID"))
        >= Date.parse(deadline)) {
        return { status: "UNAVAILABLE",
          reason: "FORMATION_DEADLINE_REACHED_BEFORE_WITNESS_RESERVATION" };
      }
      let source = await child.reserve.call(child, context);
      let occurrenceCount = source?.createReconciliationReadPerformed === true
        ? 1 : 0;
      let priorReconciliationReadAlreadySpaced = false;
      // A lost CREATE response is not an unavailable route. Re-enter the
      // child with the exact same operation id so a one-use adapter can only
      // perform its declared list reconciliation; it cannot issue a second
      // POST. Zero exact matches may be provider eventual consistency, so the
      // same safe read is repeated at the account-limited cadence. Never hand
      // an unresolved PENDING upward where a composed adapter could collapse
      // it and lose the only automatic path to the newly-created resource.
      while (source?.status === "PENDING") {
        const before = instant(clock(), "CLOCK_RESULT_INVALID");
        if (source?.createReconciliationReadPerformed === true
          && !priorReconciliationReadAlreadySpaced) {
          const remaining = Date.parse(deadline) - Date.parse(before);
          if (remaining <= 0) {
            fail("CREATE_RECONCILIATION_UNRESOLVED_AT_FORMATION_DEADLINE");
          }
          const notBefore = Math.min(
            Date.parse(before) + minimumSafeReadSpacingMs,
            Date.parse(deadline));
          try {
            await wait(Math.min(minimumSafeReadSpacingMs, remaining),
              context.options ?? {});
          } catch {
            fail("CREATE_RECONCILIATION_WAIT_ABORTED");
          }
          if (Date.parse(instant(clock(), "CLOCK_RESULT_INVALID"))
            < notBefore) {
            fail("CREATE_RECONCILIATION_WAIT_DID_NOT_ADVANCE_SAFE_INTERVAL");
          }
        }
        priorReconciliationReadAlreadySpaced = false;
        if (occurrenceCount >= maximumReadOccurrences) {
          fail("CREATE_RECONCILIATION_SAFE_READ_BUDGET_EXHAUSTED");
        }
        occurrenceCount += 1;
        source = await child.reserve.call(child, context);
        if (source?.status !== "PENDING") break;
        const afterRead = instant(clock(), "CLOCK_RESULT_INVALID");
        if (Date.parse(afterRead) >= Date.parse(deadline)) {
          fail("CREATE_RECONCILIATION_UNRESOLVED_AT_FORMATION_DEADLINE");
        }
        const remaining = Date.parse(deadline) - Date.parse(afterRead);
        const notBefore = Math.min(
          Date.parse(afterRead) + minimumSafeReadSpacingMs,
          Date.parse(deadline));
        try {
          await wait(Math.min(minimumSafeReadSpacingMs, remaining),
            context.options ?? {});
        } catch {
          fail("CREATE_RECONCILIATION_WAIT_ABORTED");
        }
        const afterWait = instant(clock(), "CLOCK_RESULT_INVALID");
        if (Date.parse(afterWait) < notBefore) {
          fail("CREATE_RECONCILIATION_WAIT_DID_NOT_ADVANCE_SAFE_INTERVAL");
        }
        priorReconciliationReadAlreadySpaced = true;
      }
      let reservation = publicChildReservation(source);
      if (reservation === null) return source;
      let lastStatus = null;
      let reason = "READINESS_SAFE_READ_BUDGET_EXHAUSTED";
      while (occurrenceCount < maximumReadOccurrences) {
        const before = instant(clock(), "CLOCK_RESULT_INVALID");
        if (Date.parse(before) >= Date.parse(deadline)) {
          reason = "LONGITUDINAL_MONITOR_NOT_READY_BEFORE_FORMATION_DEADLINE";
          break;
        }
        occurrenceCount += 1;
        let observed = null;
        try {
          observed = await child.observe.call(child, {
            ...context,
            reservation,
            operationId: operationId(context.operationId,
              "READINESS_OBSERVE", occurrenceCount),
          });
        } catch { /* one safe read occurrence was still consumed */ }
        if (observed?.adapterState !== undefined) {
          reservation = { ...reservation,
            adapterState: observed.adapterState };
        }
        lastStatus = observed?.adapterState?.sourceStatus ?? null;
        const readyAt = instant(clock(), "CLOCK_RESULT_INVALID");
        const observationId = observed?.observationId;
        const currentUp = observed?.status === "SATISFIED"
          && observed?.adapterState?.sourceStatus === "UP"
          && observed?.adapterState?.sourceDeclaredRequirementMatch === true
          && typeof observationId === "string" && HASH.test(observationId);
        if (currentUp && Date.parse(readyAt) < Date.parse(deadline)) {
          const readiness = {
            readyAt,
            formationDeadline: deadline,
            observationId,
            providerReceiptHash: receiptHash(
              "outsider/readiness-fresh-up-provider-receipt/v1",
              observed.providerReceipt ?? null),
            occurrenceCount,
          };
          const receipt = reservationReceipt(config, source, readiness);
          return {
            status: "RESERVED",
            reservationId: reservation.reservationId,
            validUntil: reservation.validUntil,
            providerReceipt: receipt,
            adapterState: buildState(config, reservation, readiness),
            witnessReadyAt: readyAt,
            freshUpProvenBeforeCommit: true,
          };
        }
        if (occurrenceCount >= maximumReadOccurrences) break;
        const remaining = Date.parse(deadline) - Date.parse(readyAt);
        if (remaining <= 0) {
          reason = "LONGITUDINAL_MONITOR_NOT_READY_BEFORE_FORMATION_DEADLINE";
          break;
        }
        const notBefore = Math.min(
          Date.parse(readyAt) + minimumSafeReadSpacingMs,
          Date.parse(deadline));
        try {
          await wait(Math.min(minimumSafeReadSpacingMs, remaining),
            context.options ?? {});
        } catch {
          reason = "READINESS_WAIT_ABORTED";
          break;
        }
        const afterWait = instant(clock(), "CLOCK_RESULT_INVALID");
        if (Date.parse(afterWait) < notBefore) {
          reason = "READINESS_WAIT_DID_NOT_ADVANCE_SAFE_INTERVAL";
          break;
        }
      }
      const released = await compensate(reservation, context);
      if (!["RELEASED", "CLOSED"].includes(released?.status)) {
        fail("READINESS_ABORT_RELEASE_NOT_CLOSED");
      }
      return {
        status: "UNAVAILABLE",
        reason,
        sourceStatus: lastStatus,
        readinessSafeReadOccurrenceCount: occurrenceCount,
        childReservationReleased: true,
        providerReceipt: released.providerReceipt ?? null,
      };
    },

    async observe(context = {}) {
      const state = stateFromReservation(context.reservation, config);
      const reservation = childReservation(context.reservation, state);
      const longitudinal = longitudinalRequired(context);
      const anchor = longitudinal ? dependencyAnchor(context.effectResult)
        : null;
      if (longitudinal && anchor !== null
        && anchor < Date.parse(state.readyAt)) {
        return {
          status: "INCONCLUSIVE",
          reason: "OBSERVATION_WINDOW_PREDATES_WITNESS_READINESS",
          adapterState: context.reservation.adapterState,
          witnessReadyAt: state.readyAt,
          observationWindowAnchoredAfterReadiness: false,
        };
      }
      const result = await child.observe.call(child, {
        ...context,
        reservation,
        witnessReadyAt: state.readyAt,
      });
      if (longitudinal && typeof result?.windowFrom === "string"
        && Date.parse(result.windowFrom) < Date.parse(state.readyAt)) {
        return {
          status: "INCONCLUSIVE",
          reason: "CHILD_WINDOW_PREDATES_WITNESS_READINESS",
          adapterState: context.reservation.adapterState,
          witnessReadyAt: state.readyAt,
          observationWindowAnchoredAfterReadiness: false,
        };
      }
      return wrapResult(config, result, reservation, state, {
        witnessReadyAt: state.readyAt,
        observationWindowAnchoredAfterReadiness: longitudinal
          ? anchor === null || anchor >= Date.parse(state.readyAt) : null,
      });
    },

    async release(context = {}) {
      const state = stateFromReservation(context.reservation, config);
      const reservation = childReservation(context.reservation, state);
      const result = await child.release.call(child, {
        ...context, reservation,
      });
      return wrapResult(config, result, reservation, state);
    },

    async closeObligation(context = {}) {
      const state = stateFromReservation(context.reservation, config);
      const reservation = childReservation(context.reservation, state);
      const result = await child.closeObligation.call(child, {
        ...context, reservation,
      });
      return wrapResult(config, result, reservation, state);
    },
  };
  return Object.freeze(adapter);
}

export const OUTSIDER_READINESS_GATED_LONGITUDINAL_WITNESS_V1_BOUNDARY
  = Object.freeze({
    monitorCreateAcknowledgementIsReadiness: false,
    freshCurrentUpRequiredBeforeCommit: true,
    minimumSafeReadSpacingMs: MINIMUM_SAFE_READ_SPACING_MS,
    defaultMaximumReadOccurrences: DEFAULT_MAXIMUM_READ_OCCURRENCES,
    safeReadRatePerMinutePerAdapter: 4,
    expectedParallelRouteAdapters: 2,
    automaticMutationRetries: 0,
    ambiguousReleaseReconciliationReads: 1,
    readinessFailureDisposition: "AUTO_RELEASE_THEN_UNAVAILABLE",
    readinessMintsAuthority: false,
    readinessIsIndependentOutcomeTruth: false,
    internalHumanFallbackPermitted: false,
    paymentPerformed: false,
  });
