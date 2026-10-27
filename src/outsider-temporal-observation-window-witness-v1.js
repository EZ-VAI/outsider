/*
 * Temporal decorator for an OutcomeProgram witness adapter.
 *
 * It never sleeps. Before an observation horizon closes it returns a durable,
 * retryable INCONCLUSIVE result with retryAfter. Once the caller's clock has
 * reached that horizon it delegates one new read-only observation occurrence.
 * Elapsed wall time plus a current endpoint sample is deliberately not treated
 * as longitudinal evidence: provider-reported-zero-downtime and mathematical
 * continuous criteria can become SATISFIED only when the child explicitly
 * proves the requested longitudinal window.
 */

const PREFIX = "OUTSIDER_TEMPORAL_OBSERVATION_WINDOW_WITNESS_V1_";
const INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function instant(value, code) {
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function checkedAdapter(value) {
  if (value === null || typeof value !== "object"
    || typeof value.adapterId !== "string" || value.adapterId.length === 0
    || typeof value.reserve !== "function"
    || typeof value.observe !== "function"
    || typeof value.release !== "function"
    || typeof value.closeObligation !== "function") {
    fail("ADAPTER_INVALID");
  }
  return value;
}

function temporalCriteria(context) {
  const accepted = new Set(Array.isArray(context.node?.acceptance)
    ? context.node.acceptance : []);
  return (context.program?.outcome?.acceptance ?? []).filter((criterion) =>
    accepted.has(criterion.criterionId)
      && ["ENDPOINT_SAMPLED_AT_OR_AFTER_MS",
        "PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS", "CONTINUOUS_FOR_MS"]
        .includes(criterion.comparator));
}

function observationWindowMs(context, criteria) {
  const fromNode = context.node?.input?.observationWindowMs;
  // Only an explicit OBSERVATION node opens a new temporal horizon. A later
  // CHECKPOINT may cite the same criterion but merely closes already-produced
  // evidence; it must not silently start the window again.
  if (context.node?.kind !== "OBSERVATION"
    || !Number.isSafeInteger(fromNode)) return 0;
  const values = [fromNode, ...criteria.map((criterion) => criterion.expected)
    .filter(Number.isSafeInteger)];
  if (values.some((value) => value < 0 || value > 31_536_000_000)) {
    fail("OBSERVATION_WINDOW_INVALID");
  }
  return Math.max(...values);
}

function validMillis(value) {
  return typeof value === "string" && INSTANT.test(value)
    && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}

function dependencyAnchor(effectResult) {
  if (!Array.isArray(effectResult?.dependencyEvidence)
    || effectResult.dependencyEvidence.length === 0) return null;
  const dependencyTimes = effectResult.dependencyEvidence.map((evidence) => {
    // The orchestrator's journal timestamps are preferred over timestamps
    // asserted by a provider result. The witness timestamp is normally last,
    // and therefore starts the committed post-publication observation horizon.
    const candidates = [
      validMillis(evidence?.primaryEffectRecordedAt),
      validMillis(evidence?.recoveryEffectRecordedAt),
      validMillis(evidence?.witnessRecordedAt),
    ].filter((value) => value !== null);
    return candidates.length === 0 ? null : Math.max(...candidates);
  });
  if (dependencyTimes.some((value) => value === null)) return null;
  return Math.max(...dependencyTimes);
}

function windowResult(now, anchor, windowMs) {
  const due = anchor + windowMs;
  return {
    observedAt: now,
    windowStartedAt: new Date(anchor).toISOString(),
    retryAfter: new Date(due).toISOString(),
    observationWindowMs: windowMs,
    elapsedMs: Math.max(0, Date.parse(now) - anchor),
  };
}

/** Decorate one witness adapter without changing its provider identity. */
export function createTemporalObservationWindowWitnessV1(input = {}) {
  const child = checkedAdapter(input.witnessAdapter ?? input.adapter);
  const clock = input.clock ?? (() => new Date().toISOString());
  if (typeof clock !== "function") fail("CLOCK_INVALID");

  const decorated = {
    ...child,
    adapterId: child.adapterId,
    providerRef: child.providerRef ?? child.adapterId,

    async observe(context = {}) {
      const now = instant(clock(), "CLOCK_RESULT_INVALID");
      const criteria = temporalCriteria(context);
      const windowMs = observationWindowMs(context, criteria);
      if (windowMs > 0) {
        const anchor = dependencyAnchor(context.effectResult);
        if (anchor === null) {
          return {
            status: "INCONCLUSIVE",
            reason: "OBSERVATION_WINDOW_ANCHOR_MISSING",
            observedAt: now,
            retryAfter: null,
            observationWindowMs: windowMs,
          };
        }
        const temporal = windowResult(now, anchor, windowMs);
        if (Date.parse(now) < anchor + windowMs) {
          return {
            status: "INCONCLUSIVE",
            reason: "OBSERVATION_WINDOW_OPEN",
            ...temporal,
          };
        }
        const result = await child.observe.call(child, context);
        if (result === null || typeof result !== "object"
          || !["SATISFIED", "NOT_SATISFIED", "INCONCLUSIVE"]
            .includes(result.status)) fail("CHILD_OBSERVATION_INVALID");
        const continuousRequired = criteria.some((criterion) =>
          criterion.comparator === "CONTINUOUS_FOR_MS");
        const providerReportedRequired = criteria.some((criterion) =>
          criterion.comparator
            === "PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS");
        const longitudinalRequired = continuousRequired
          || providerReportedRequired;
        if (longitudinalRequired && result.status === "SATISFIED"
          && result.longitudinalWindowProven !== true) {
          return {
            ...result,
            status: "INCONCLUSIVE",
            reason: "LONGITUDINAL_WINDOW_NOT_PROVEN",
            observedAt: now,
            ...temporal,
            endpointSampledAtOrAfterHorizon: true,
            continuousWindowSatisfied: continuousRequired ? false : null,
            providerReportedZeroDowntimeSatisfied:
              providerReportedRequired ? false : null,
          };
        }
        const childRetry = validMillis(result.retryAfter);
        const wrapperRetry = validMillis(temporal.retryAfter);
        return {
          ...result,
          observedAt: now,
          ...temporal,
          retryAfter: childRetry === null ? temporal.retryAfter
            : new Date(Math.max(childRetry, wrapperRetry)).toISOString(),
          endpointSampledAtOrAfterHorizon: true,
          continuousWindowSatisfied: continuousRequired
            ? result.longitudinalWindowProven === true : null,
          providerReportedZeroDowntimeSatisfied: providerReportedRequired
            ? result.longitudinalWindowProven === true : null,
        };
      }
      const result = await child.observe.call(child, context);
      if (result === null || typeof result !== "object") {
        fail("CHILD_OBSERVATION_INVALID");
      }
      return { ...result, observedAt: now };
    },
  };
  return Object.freeze(decorated);
}
