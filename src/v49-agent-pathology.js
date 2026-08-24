/*
 * V49 — Stage 0.5: the agent process fact sheet.
 *
 * WHAT THIS IS
 * ============
 * Stage 0.5 reports facts that are visible in the trajectory itself:
 * a run submitted no diff, no matching acceptance command appears in the trace,
 * or measured resource use exceeded a caller-supplied peer denominator. Those
 * are measurements of the current run. They are not outcome probabilities.
 *
 * THE ONE RULE: MEASUREMENT, NOT JUDGMENT
 * =======================================
 * This module reports facts, never verdicts. An older implementation also
 * shipped numeric corpus references whose claimed rebuild script and source
 * receipt are not present in the current tree. Those values are therefore
 * quarantined rather than used by any product decision or user-facing finding.
 */

/*
 * Compatibility export for the retired v49 reference surface. Nulls are
 * deliberate: Git history preserves the old constants, but current code has no
 * source-aware receipt with which to reproduce them. Reintroducing a numeric
 * value requires a pinned source, deterministic derivation and focused test.
 */
export const PATHOLOGY_BASE_RATES_V49 = {
  status: "QUARANTINED_UNREPLAYABLE_LEGACY_REFERENCE",
  sourceArtifactHash: null,
  sourceReplayEstablished: false,
  decisionUseEligible: false,
  corpusRuns: null,
  corpusFailRate: null,
  emptySubmission: { failRate: null, n: null, flaggable: false },
  aboveMedianErrorRate: { failRate: null, vsBelow: null, flaggable: false },
  highThrash: { failRate: null, vsLow: null, flaggable: false },
  errorRateUncapped: { failWithErrors: null, failWithout: null, deltaPp: null,
    flaggable: false },
  costSpreadSameTaskSolved: { medianRatio: null, p90Ratio: null, flaggable: false },
  costSpreadSameTaskAll: { medianRatio: null, p90Ratio: null },
  apiCallSpreadSameTask: { medianRatio: null, p90Ratio: null },
};

const TEST_RE = /\b(pytest|tox|unittest|nosetests|test)\b/i;

/*
 * Normalize the two trajectory shapes this project holds into one fact object.
 * Accepts either a v39 corpus record (verbCounts / returnCodes / emptySubmission)
 * or a p12 event stream (steps[] with per-step verb / exit / isTest / obsBytes).
 */
export function agentProcessFactsV49(record, { peerCostMedianUsd = null, peerApiMedian = null } = {}) {
  const steps = Array.isArray(record.steps) && typeof record.steps[0] === "object"
    ? record.steps : null;

  let nSteps, ranTest, errorCount, commandCount, destructive, submitAfterError;
  if (steps) {
    nSteps = steps.length;
    ranTest = steps.some((s) => s.isTest);
    errorCount = steps.filter((s) => s.exit && s.exit !== 0).length;
    commandCount = steps.length;
    destructive = steps.filter((s) => s.verb === "rm" || /reset|checkout/.test(s.verb)).length;
    const lastReal = [...steps].reverse().find((s) => !s.isSubmit);
    submitAfterError = Boolean(lastReal && lastReal.exit && lastReal.exit !== 0
      && steps[steps.length - 1]?.isSubmit);
  } else {
    const verbs = record.verbSequence ?? [];
    const counts = record.verbCounts ?? {};
    nSteps = record.steps ?? verbs.length;
    ranTest = verbs.some((v) => TEST_RE.test(v)) || Object.keys(counts).some((v) => TEST_RE.test(v));
    const rc = record.returnCodes ?? {};
    errorCount = Object.entries(rc).reduce((a, [k, v]) => a + (String(k) !== "0" ? v : 0), 0);
    commandCount = Object.values(rc).reduce((a, v) => a + v, 0) || nSteps;
    destructive = record.destructiveCount ?? 0;
    submitAfterError = null;                 // needs per-step alignment the corpus lacks
  }

  const submissionBytes = record.submissionBytes ?? null;
  const emptySubmission = record.emptySubmission
    ?? (submissionBytes != null ? submissionBytes < 50 : null);
  const costUsd = record.instanceCost ?? record.costUsd ?? null;
  const apiCalls = record.apiCalls ?? null;
  const errorRate = commandCount > 0 ? errorCount / commandCount : null;

  const facts = {
    waste: {
      steps: nSteps, apiCalls, costUsd,
      costVsPeerMedian: (costUsd != null && peerCostMedianUsd)
        ? Number((costUsd / peerCostMedianUsd).toFixed(2)) : null,
      apiVsPeerMedian: (apiCalls != null && peerApiMedian)
        ? Number((apiCalls / peerApiMedian).toFixed(2)) : null,
    },
    faking: {
      emptyOrTrivialSubmission: emptySubmission,
      submissionBytes,
      ranAnyTest: ranTest,
      submittedRightAfterAFailingCommand: submitAfterError,
    },
    mistakes: {
      shellErrorRate: errorRate != null ? Number(errorRate.toFixed(3)) : null,
      destructiveCommands: destructive,
    },
  };
  return facts;
}

/*
 * Turn facts into deterministic process findings. No corpus probability is
 * attached: the current tree cannot source-replay the retired v49 references.
 */
export function flagPathologiesV49(facts) {
  const flags = [];
  if (facts.faking.emptyOrTrivialSubmission === true) {
    flags.push({ kind: "faking", signal: "empty-or-trivial-submission",
      observed: `${facts.faking.submissionBytes ?? 0} diff bytes`,
      corpusBaseRate: null,
      reads: "empty or trivial submission observed; task resolution and consequence are not inferred" });
  }
  if (facts.faking.ranAnyTest === false) {
    flags.push({ kind: "faking", signal: "never-ran-a-test",
      observed: "0 test executions before submitting",
      corpusBaseRate: null,
      reads: "no test command detected in the run; whether this matters is "
        + "task-dependent, so it is surfaced as a fact without a base-rate claim" });
  }
  if (facts.faking.submittedRightAfterAFailingCommand === true) {
    flags.push({ kind: "faking", signal: "submitted-after-failing-command",
      observed: "final action followed a non-zero exit",
      reads: "submitted immediately after a command that errored" });
  }
  if (facts.waste.costVsPeerMedian && facts.waste.costVsPeerMedian >= 3) {
    flags.push({ kind: "waste", signal: "cost-far-above-peers",
      observed: `${facts.waste.costVsPeerMedian}x the median cost for this task`,
      corpusBaseRate: null,
      reads: "caller-supplied same-task peer denominator exceeded; no outcome effect is inferred" });
  }
  if (facts.mistakes.shellErrorRate != null && facts.mistakes.shellErrorRate > 0.5) {
    flags.push({ kind: "mistakes", signal: "high-shell-error-rate",
      observed: `${(facts.mistakes.shellErrorRate * 100).toFixed(0)}% of commands errored`,
      corpusBaseRate: null,
      weak: true,
      reads: "descriptive within-run error fraction; task failure probability is not inferred" });
  }
  return flags;
}

/*
 * The Stage 0.5 product surface: one trajectory in, one fact card out.
 * Deterministic, label-free, no verdict. `verdict` is deliberately absent —
 * this scores PROCESS, and process facts do not authorize or forbid anything.
 */
export function processReportCardV49(record, peers = {}) {
  const facts = agentProcessFactsV49(record, peers);
  const flags = flagPathologiesV49(facts);
  return {
    schema: "outsider/agent-process-card/v49",
    instanceId: record.instanceId ?? null,
    system: record.system ?? record.modelName ?? null,
    facts,
    flags,
    referenceBoundary: PATHOLOGY_BASE_RATES_V49.status,
    disclaimer: "measurement of this run only; no replayable corpus base rate, "
      + "outcome prediction, or judgment of this agent is attached",
  };
}
