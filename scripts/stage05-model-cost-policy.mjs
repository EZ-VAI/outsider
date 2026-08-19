/*
 * Evaluation cost policy.  This is deliberately outside the product control
 * loop: it prevents a reliability experiment from silently inheriting an
 * expensive interactive-account default.
 */

export const DEFAULT_EVALUATION_SUPERVISOR_MODEL = "sonnet";
export const DEFAULT_EVALUATION_SUPERVISOR_EFFORT = "low";
/* This is a product-wide evaluator ceiling, not a canary default.  Individual
   gates must preregister an equal or smaller limit and a per-process dollar
   cap.  Keeping one exported value prevents a runner from advertising a
   finite budget that the executable guard rejects before launch. */
/* Formal R5 needs a preregistered ceiling of 61 processes: 31 on the expected
   no-retry path and one retry for every JSON judge.  Keep a small fixed
   product-wide envelope above that exact gate while every evaluator still
   chooses and publishes its own lower bound. */
export const MAX_EVALUATION_MODEL_PROCESSES = 64;
export const INTERACTIVE_CREDIT_ACK = "--acknowledge-unbounded-interactive-credits";

export function requireInteractiveCreditAcknowledgement(args, gate) {
  if (!Array.isArray(args) || !args.includes(INTERACTIVE_CREDIT_ACK)) {
    throw new Error(`${gate}_INTERACTIVE_CREDITS_NOT_HARD_CAPPED: `
      + `interactive Claude does not enforce --max-budget-usd; rerun with `
      + `${INTERACTIVE_CREDIT_ACK} only after reviewing the preregistered model, effort, `
      + "duration and supervisor-call limits");
  }
  return {
    acknowledged: true,
    dollarHardCapEnforced: false,
    acknowledgementFlag: INTERACTIVE_CREDIT_ACK,
    reason: "Claude interactive/PTY sessions do not expose the headless --max-budget-usd cap",
  };
}

export function headlessCostEnvelope({ maxBudgetUsd, workerProcesses = 1,
  baselineJudgeProcesses = 0, runtimeSupervisorCalls = 0,
  maximumAttemptsPerJudge = 1 } = {}) {
  const budget = Number(maxBudgetUsd);
  const integers = [workerProcesses, baselineJudgeProcesses, runtimeSupervisorCalls,
    maximumAttemptsPerJudge];
  if (!Number.isFinite(budget) || budget <= 0
    || integers.some((value) => !Number.isInteger(value) || value < 0)
    || maximumAttemptsPerJudge < 1) {
    throw new Error("HEADLESS_COST_ENVELOPE_INVALID");
  }
  const maximumModelProcesses = workerProcesses
    + (baselineJudgeProcesses + runtimeSupervisorCalls) * maximumAttemptsPerJudge;
  return {
    dollarHardCapEnforcedPerProcess: true,
    maxBudgetUsdPerProcess: budget,
    maximumModelProcesses,
    maximumNominalUsd: Number((maximumModelProcesses * budget).toFixed(6)),
    assumptions: { workerProcesses, baselineJudgeProcesses, runtimeSupervisorCalls,
      maximumAttemptsPerJudge },
  };
}
