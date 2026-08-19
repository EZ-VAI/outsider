/*
 * V49 — Stage 0.5: the agent process fact sheet.
 *
 * WHAT THIS IS, AND WHY IT SHIPS BEFORE STAGE 1
 * =============================================
 * Stage 1 is the clearing house: pricing a guarantee on consequential machine
 * action, which needs outcome labels, repeated trials, counterparties. All of
 * that is data- and relationship-limited right now.
 *
 * Stage 0.5 needs none of it. An agent's WASTE and FAKING are visible in the
 * trajectory itself, with no outcome label required: a run that submits nothing,
 * that never executes a test, that burns 70x the tokens a peer used on the same
 * task — you can see all of that from the trace alone. That is a product a
 * developer running coding agents wants this quarter, and it is pure measurement
 * on their OWN agent's output.
 *
 * THE ONE RULE: MEASUREMENT, NOT JUDGMENT
 * =======================================
 * This module reports FACTS and EMPIRICAL BASE RATES, never verdicts. It says
 * "submitted 0 diff bytes; in a 22,871-run corpus, 99.0% of empty submissions
 * did not resolve the task" — a fact plus a measured reference. It never says
 * "your agent is lazy". A verdict can be wrong and indefensible on someone
 * else's machine; a measurement of their own data plus a corpus base rate
 * cannot. This is the same safety line the whole project holds: arithmetic on
 * the user's own data is safe; judging a partner's specific action is not.
 *
 * All base rates below are VALIDATED and pinned by scripts/v49-pathology-
 * validate.mjs against the sealed 22,871-run corpus + the authoritative
 * 39-agent cost matrix. A test re-derives them so they cannot drift.
 */

/*
 * Empirically validated base rates. Each is a measured fact about the corpus,
 * not an assumption. `flaggable: true` means the signal is clean enough to
 * surface; `flaggable: false` signals are computed but reported as weak/
 * confounded, because pretending a confounded signal is clean is the failure
 * mode this project audits out.
 */
export const PATHOLOGY_BASE_RATES_V49 = {
  corpusRuns: 22871,
  corpusFailRate: 0.407,
  emptySubmission: { failRate: 0.990, n: 702, flaggable: true,
    reads: "empty or trivial (<50 byte) diff — in-corpus 99.0% of these did not resolve" },
  aboveMedianErrorRate: { failRate: 0.428, vsBelow: 0.393, flaggable: true, weak: true,
    reads: "more shell errors than the median run on the same task — a +3.5pp "
      + "failure gradient within-Claim, real but small" },
  highThrash: { failRate: 0.353, vsLow: 0.438, flaggable: false,
    reads: "consecutive repeated verbs — NOT a clean signal; productive edit/view "
      + "loops look identical to thrashing, so this is reported, not flagged" },
  /*
   * Measured on the p12 UNCAPPED streams, where every step carries its true exit
   * code (the capped corpus only has an aggregate returnCodes dict). With real
   * per-step exits the error-rate signal is 3.5x stronger: runs with any errored
   * command fail 90.9% vs 78.5%, a +12.4pp gradient, against the +3.5pp the
   * capped data showed. Caveat pinned with the number: this is ONE weak system
   * (Llama-4-Maverick, 79% base fail); the direction is trustworthy, the
   * magnitude is single-system and awaits multi-system stream data.
   */
  errorRateUncapped: { failWithErrors: 0.909, failWithout: 0.785, deltaPp: 12.4,
    flaggable: true, scope: "single-system (Llama), suggestive not definitive",
    reads: "on true per-step exit codes, any errored command raises measured "
      + "failure by ~12pp — stronger than the capped corpus could see" },
  costSpreadSameTaskSolved: { medianRatio: 73.7, p90Ratio: 211.7, flaggable: true,
    reads: "among agents that ALL solved the same task, cost varied 73.7x (median)" },
  costSpreadSameTaskAll: { medianRatio: 201.9, p90Ratio: 782.2 },
  apiCallSpreadSameTask: { medianRatio: 22.7, p90Ratio: 74.0 },
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
 * Turn facts into FLAGS, each carrying the validated corpus base rate. A flag is
 * "observed X; in the corpus, base rate Y" — fact plus reference, never verdict.
 * Only `flaggable` signals raise a flag; weak/confounded ones are omitted here
 * and left in the fact sheet for the reader to see raw.
 */
export function flagPathologiesV49(facts) {
  const flags = [];
  const B = PATHOLOGY_BASE_RATES_V49;
  if (facts.faking.emptyOrTrivialSubmission === true) {
    flags.push({ kind: "faking", signal: "empty-or-trivial-submission",
      observed: `${facts.faking.submissionBytes ?? 0} diff bytes`,
      corpusBaseRate: B.emptySubmission.failRate,
      reads: B.emptySubmission.reads });
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
      reads: `among agents that solved the same task, cost spread is `
        + `${B.costSpreadSameTaskSolved.medianRatio}x (median) in the reference corpus` });
  }
  if (facts.mistakes.shellErrorRate != null && facts.mistakes.shellErrorRate > 0.5) {
    flags.push({ kind: "mistakes", signal: "high-shell-error-rate",
      observed: `${(facts.mistakes.shellErrorRate * 100).toFixed(0)}% of commands errored`,
      corpusBaseRate: B.aboveMedianErrorRate.failRate,
      weak: true,
      reads: B.aboveMedianErrorRate.reads });
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
    disclaimer: "measurement of this run only; base rates are corpus references, "
      + "not predictions or judgments of this agent",
  };
}
