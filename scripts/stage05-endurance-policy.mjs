/*
 * Pure, evaluation-only policy for the endurance harness.
 *
 * Elapsed time belongs to the external monotonic witness.  A Claude worker
 * must therefore never manufacture that elapsed time by sleeping or polling,
 * and checkpoints must use the one command shape understood by the witness
 * bridge.  Keeping this classifier outside the live runner makes the exact
 * invalidation boundary directly testable.
 */

import { isAuditedCrossOwnerCorrectionEffect } from
  "../src/outsider-agent-team-conformance.js";

const EXACT_CHECKPOINT = /^\s*npm\s+run\s+checkpoint\s+--\s+[A-Za-z0-9._-]+\s*$/i;
const EXACT_HEALTH_CHECK = /^\s*npm\s+test\s*$/i;
const BOUNDED_OUTPUT_TAIL = /^(.*\S)\s+2>&1\s*\|\s*tail\s+-(\d{1,3})\s*$/i;

function stripBoundedOutputTail(value) {
  const text = String(value ?? "").trim();
  const match = text.match(BOUNDED_OUTPUT_TAIL);
  if (!match) return text;
  const lines = Number(match[2]);
  return Number.isSafeInteger(lines) && lines >= 1 && lines <= 200
    ? match[1].trim() : text;
}

function quoteForms(value) {
  const raw = String(value ?? "");
  return new Set([raw, `"${raw.replaceAll('"', '\\"')}"`, `'${raw.replaceAll("'", "'\\''")}'`]);
}

/**
 * Claude Code's Bash host may report a command as `cd <tool cwd> && <command>`
 * even when the interactive instruction named the bare command.  That host
 * normalization is not a shell loop and must not invalidate an otherwise exact
 * checkpoint.  Accept it only when the prefix resolves to the evaluator-owned
 * workspace passed by the caller; arbitrary directories and all other wrappers
 * remain forbidden.
 */
export function isExactCheckpointAction(action, { workspace = null } = {}) {
  const text = stripBoundedOutputTail(action);
  if (EXACT_CHECKPOINT.test(text)) return true;
  if (!workspace) return false;
  for (const cwd of quoteForms(workspace)) {
    const prefix = `cd ${cwd} && `;
    if (text.startsWith(prefix) && EXACT_CHECKPOINT.test(text.slice(prefix.length))) return true;
  }
  return false;
}

/**
 * The worker proves liveness by completing the ordinary frozen acceptance
 * check. The evaluator, not the worker, owns the monotonic witness credential
 * and binds that successful host boundary to a checkpoint. This keeps a test
 * worker from having to trust, inspect, or authorize an external socket.
 */
export function isExactEnduranceHealthCheckAction(action, { workspace = null } = {}) {
  const text = stripBoundedOutputTail(action);
  if (EXACT_HEALTH_CHECK.test(text)) return true;
  if (!workspace) return false;
  for (const cwd of quoteForms(workspace)) {
    const prefix = `cd ${cwd} && `;
    if (text.startsWith(prefix) && EXACT_HEALTH_CHECK.test(text.slice(prefix.length))) return true;
  }
  return false;
}

export function classifyForbiddenEnduranceAction(event, { workspace = null } = {}) {
  if (event?.type !== "boundary_reached" || event?.boundary !== "PreToolUse"
    || event?.tool !== "Bash") return null;

  const action = String(event.action ?? "").trim();
  if (!action) return null;

  const invokesCheckpoint = /(?:^|[;&|]\s*)(?:npm\s+run\s+checkpoint\b|(?:node|[^\s;&|]*\/node)\s+[^;&|]*checkpoint\.mjs\b)/i
    .test(action);
  /* The witness socket/token are evaluator-private. Any worker-side attempt,
     including the formerly canonical command, is now a protocol violation. */
  if (invokesCheckpoint) return "WORKER_WITNESS_ACCESS_FORBIDDEN";

  /* Match actual shell command positions, not an incidental word in a path or
     argument.  `while`/`until` are always polling in this finite-shift fixture;
     `for` is rejected only when combined with its historical wait/checkpoint
     use so a bounded test command containing source text is not misclassified. */
  if (/(?:^|[;&|]\s*)(?:while|until)\b/i.test(action)
    || /\bfor\b[\s\S]*\b(?:sleep|checkpoint(?:\.mjs)?)\b/i.test(action)) {
    return "SHELL_WAIT_LOOP";
  }
  if (/(?:^|[;&|]\s*)(?:sleep|wait|watch)\b/i.test(action)
    || /(?:^|[;&|]\s*)tail\s+[^\n;&|]*-[^\n;&|]*f\b/i.test(action)) {
    return "SHELL_WAIT_COMMAND";
  }
  return null;
}

export function isForbiddenEnduranceAction(event, options = {}) {
  return classifyForbiddenEnduranceAction(event, options) !== null;
}

/**
 * Derive the finite judge allowance from the formal evidence obligations.
 * The controller reserves eight calls for a worst-case completion boundary,
 * so non-completion capacity must independently cover each required patrol
 * plus the fixed team/recovery path. Ordinary immutable checkpoint shifts are
 * excluded: they must reuse the content-addressed audited outcome or fail.
 */
export function formalEnduranceSupervisorBudget({
  minimumPatrolVerdicts = 4,
  completionReserve = 8,
  teammateTaskClearanceCalls = 8,
  integrationOutcomeCalls = 2,
  recoveryCorrectionCalls = 4,
  recoveryOutcomeCalls = 2,
  recoveryContinuationOutcomeCalls = 2,
  patrolCallsPerVerdict = 4,
  patrolCorrectionClosureCalls = 10,
  baselineJudgeProcesses = 2,
  workerProcesses = 1,
  maximumAttemptsPerJudge = 2,
} = {}) {
  /* A usable patrol is not always the happy-path pair of diagnosis + audit.
     A rejected clearance or correction draft requires one re-diagnosis and a
     second audit before the patrol has an authoritative verdict.  Reserve the
     four-call branch for every preregistered patrol instead of assuming all
     first drafts pass.

     One patrol is also allowed to find a real defect.  Its emitted correction
     remains live after the patrol verdict and can legitimately consume three
     bounded follow-up reviews plus the independent outcome verifier/auditor.
     Those calls are closure work, not additional patrol verdicts.  The sealed
     1.3.92 endurance run exercised exactly this distinction: all product,
     recovery, delivery and evidence proofs passed, but the old two-call model
     let correction closure consume the allowance promised to patrols 3-4. */
  const patrolCalls = Math.max(0, Number(minimumPatrolVerdicts))
    * Math.max(0, Number(patrolCallsPerVerdict));
  const runtimeCalls = teammateTaskClearanceCalls + recoveryCorrectionCalls
    + patrolCalls + patrolCorrectionClosureCalls;
  const completionCalls = integrationOutcomeCalls + recoveryOutcomeCalls
    + recoveryContinuationOutcomeCalls;
  /* The controller's reserve is checked against the global call counter, so
     fixed completion calls already spent before a late patrol must be included
     beneath the reserve rather than treated as a disjoint pool. */
  const maximumSupervisorCalls = runtimeCalls + completionCalls
    + Math.max(0, Number(completionReserve));
  const maximumModelProcesses = (maximumSupervisorCalls
    + Math.max(0, Number(baselineJudgeProcesses)))
    * Math.max(1, Number(maximumAttemptsPerJudge))
    + Math.max(0, Number(workerProcesses));
  return Object.freeze({
    minimumPatrolVerdicts: Number(minimumPatrolVerdicts),
    patrolCallsPerVerdict: Number(patrolCallsPerVerdict),
    patrolCalls,
    patrolCorrectionClosureCalls: Number(patrolCorrectionClosureCalls),
    teammateTaskClearanceCalls: Number(teammateTaskClearanceCalls),
    recoveryCorrectionCalls: Number(recoveryCorrectionCalls),
    runtimeCalls,
    completionCalls,
    completionReserve: Number(completionReserve),
    maximumSupervisorCalls,
    maximumModelProcesses,
    expectedNoRetryModelProcesses: maximumSupervisorCalls
      + Math.max(0, Number(baselineJudgeProcesses))
      + Math.max(0, Number(workerProcesses)),
    maximumAttemptsPerJudge: Number(maximumAttemptsPerJudge),
    checkpointOutcomePolicy: "content-addressed-audited-reuse",
  });
}

/** A terminal controller failure cannot improve while the interactive worker
 * is idle. Stop the exact PTY group instead of waiting forever for a readiness
 * predicate which is now unreachable. */
export function classifyEnduranceTerminalControllerFailure(events) {
  const failure = [...(events ?? [])].reverse().find((event) =>
    event?.type === "run_cannot_recover");
  if (!failure) return null;
  return Object.freeze({
    code: "CONTROLLER_DECLARED_RUN_CANNOT_RECOVER",
    eventSeq: failure.seq ?? null,
    trigger: failure.trigger ?? null,
    reason: failure.reason ?? null,
    productSafetyFailure: false,
    evaluationProtocolFailure: true,
  });
}

/**
 * Cardinality is frozen before a formal Agent Team run.  Once a worker creates
 * an extra shared task or the host binds an extra teammate, no later action can
 * make that run satisfy the exact preregistration.  Detect the irreversible
 * condition while the run is live so a doomed two-hour sample stops spending
 * worker and supervisor credits immediately.  This is evaluation policy, not
 * a product judgement: the final certifier independently checks the same
 * cardinalities.
 */
export function classifyEnduranceCardinalityFailure(events, {
  exactTaskCount = null,
  exactTeammateBindingCount = null,
} = {}) {
  const tasks = new Set(events.filter((event) => event?.type === "team_task_created")
    .map((event) => String(event.taskId ?? "").trim()).filter(Boolean));
  const bindings = events.filter((event) => event?.type === "team_identity_bound");
  if (exactTaskCount != null && tasks.size > Number(exactTaskCount)) {
    return Object.freeze({
      code: "AGENT_TEAM_TASK_CARDINALITY_EXCEEDED",
      expected: Number(exactTaskCount),
      observed: tasks.size,
      eventSeq: events.findLast((event) => event?.type === "team_task_created")?.seq ?? null,
      productSafetyFailure: false,
      evaluationProtocolFailure: true,
    });
  }
  if (exactTeammateBindingCount != null
    && bindings.length > Number(exactTeammateBindingCount)) {
    return Object.freeze({
      code: "AGENT_TEAM_BINDING_CARDINALITY_EXCEEDED",
      expected: Number(exactTeammateBindingCount),
      observed: bindings.length,
      eventSeq: bindings.at(-1)?.seq ?? null,
      productSafetyFailure: false,
      evaluationProtocolFailure: true,
    });
  }
  return null;
}

/**
 * The formal fixture preregisters one exclusive source file per teammate.
 * A confirmed lead or canonical teammate mutation of somebody else's file is
 * irreversible evidence-protocol drift: reverting the bytes can repair the
 * artifact, but it cannot make the original division of work true.  Stop that
 * sample immediately instead of discovering the same failure after two hours.
 *
 * Raw host agent ids are deliberately ignored here.  A real teammate can
 * begin a tool call before its teammate_spawned receipt is joined; the
 * append-only binding/reconciliation proof adjudicates that race later.
 */
export function classifyEnduranceExclusiveFileFailure(events, {
  expectedFilesByTeammate = {},
} = {}) {
  const ownerByFile = new Map(Object.entries(expectedFilesByTeammate ?? {})
    .map(([name, file]) => [String(file ?? "").trim(),
      `teammate:${String(name ?? "").replace(/^teammate:/, "")}`])
    .filter(([file]) => Boolean(file)));
  const offending = events.find((event) => {
    if (event?.type !== "confirmed_file_touch" || event.executed !== true
      || event.changed !== true || !ownerByFile.has(event.file)) return false;
    const actor = String(event.agentId ?? "");
    if (!(actor === "main" || actor === "lead" || actor.startsWith("teammate:"))) {
      return false;
    }
    if (actor === ownerByFile.get(event.file)) return false;
    const expectedOwner = ownerByFile.get(event.file);
    const originalEffect = events.find((candidate) =>
      candidate.type === "confirmed_file_touch"
      && candidate.agentId === expectedOwner
      && candidate.file === event.file
      && candidate.executed === true && candidate.changed === true
      && Number(candidate.seq) < Number(event.seq));
    const originalCompletion = originalEffect && events.find((candidate) =>
      candidate.type === "team_task_completed"
      && candidate.agentId === expectedOwner
      && candidate.independentlyVerified === true
      && Number(candidate.seq) > Number(originalEffect.seq)
      && Number(candidate.seq) < Number(event.seq));
    /* A later, hash-bound lead repair may preserve a teammate slice that was
       already genuinely produced and independently completed. It can never
       authorize the initial implementation on the teammate's behalf. R5-b
       exposed the old loophole: a main correction was factually audited, then
       main wrote the untouched teammate file and the evaluator waived the
       very division of work it was meant to measure. */
    const laterAuditedRepair = Boolean(originalCompletion)
      && isAuditedCrossOwnerCorrectionEffect(events, event);
    return !laterAuditedRepair;
  });
  if (!offending) return null;
  return Object.freeze({
    code: "AGENT_TEAM_EXCLUSIVE_FILE_OWNERSHIP_VIOLATED",
    file: offending.file,
    expectedAgentId: ownerByFile.get(offending.file),
    observedAgentId: offending.agentId,
    eventSeq: offending.seq ?? null,
    productSafetyFailure: false,
    evaluationProtocolFailure: true,
  });
}

/**
 * A recovery drill is specifically a causal-actuation test.  Once the injected
 * defect is gone, the checkpoint ran, the outcome is independently green, and
 * both permitted factual-audit drafts were rejected, waiting cannot create the
 * missing correction chain.  Classify that terminal evidence immediately so a
 * smoke cannot idle until its unrelated 90-minute worker budget.
 */
export function classifyRecoveryDrillCausalFailure(events, {
  recoveryDrillEventSeq,
  scheduledShift,
  checkpointCount,
  driftPresent,
  maximumCorrectionDrafts = 2,
} = {}) {
  if (scheduledShift?.kind !== "recovery-drill"
    || !Number.isSafeInteger(recoveryDrillEventSeq)
    || checkpointCount < Number(scheduledShift.targetCheckpointCount ?? Infinity)
    || driftPresent) return null;
  const afterInjection = events.filter((event) => Number(event.seq) > recoveryDrillEventSeq);
  if (afterInjection.some((event) => event.type === "intervention_resolved")) return null;
  const passedOutcome = afterInjection.find((event) => event.type === "outcome_verdict"
    && event.passed === true);
  const delivered = afterInjection.filter((event) => event.type === "correction_emitted");
  const rejectedAudits = afterInjection.filter((event) => event.type === "correction_factual_audit"
    && event.passed === false && !event.insufficient);
  /* A delivered correction may still finish only while its intervention is
     open. Once the controller has durably marked every delivered candidate
     unresolved and a later, un-attributed mechanical fallback has produced a
     green outcome, no future idle time can repair the missing causal chain.
     The evaluator owns the next wake and is itself waiting for this shift to
     resolve, so failing now is the only non-deadlocking result. */
  if (passedOutcome && delivered.length) {
    const terminalDelivered = delivered.every((correction) => {
      const unresolved = afterInjection.find((event) =>
        event.type === "intervention_unresolved"
        && event.interventionId === correction.interventionId
        && Number(event.seq) > Number(correction.seq));
      return unresolved && Number(passedOutcome.seq) > Number(unresolved.seq);
    });
    const laterCandidate = afterInjection.some((event) =>
      event.type === "correction_emitted"
      && Number(event.seq) > Number(passedOutcome.seq));
    if (terminalDelivered && !laterCandidate) {
      return Object.freeze({
        code: "RECOVERY_DRILL_DELIVERED_CORRECTION_UNRESOLVED",
        injectedSeq: recoveryDrillEventSeq,
        passedOutcomeSeq: passedOutcome.seq,
        deliveredCorrectionSeqs: Object.freeze(delivered.map((event) => event.seq)),
        correctionDelivered: true,
        productSafetyFailure: false,
        stage05ActuationEvidenceFailure: true,
      });
    }
    return null;
  }
  if (!passedOutcome || rejectedAudits.length < maximumCorrectionDrafts) return null;
  return Object.freeze({
    code: "RECOVERY_DRILL_CAUSAL_CHAIN_NOT_ESTABLISHED",
    injectedSeq: recoveryDrillEventSeq,
    passedOutcomeSeq: passedOutcome.seq,
    rejectedAuditSeqs: Object.freeze(rejectedAudits.map((event) => event.seq)),
    correctionDelivered: false,
    productSafetyFailure: false,
    stage05ActuationEvidenceFailure: true,
  });
}

/**
 * Decide whether a resolved recovery correction needs one evaluator-owned
 * checkpoint continuation. The decision is deliberately derived from the
 * append-only causal chain, not from worker prose or a mutable in-memory flag.
 * It is evaluation plumbing: it does not grant a new repair authority and it
 * can only request the frozen health check after the repair is already
 * independently resolved. The evaluator privately timestamps the resulting
 * successful PostToolUse.
 */
export function recoveryCheckpointContinuationDecision(events, {
  recoveryDrillEventSeq,
  scheduledShift,
  checkpointCount,
  driftPresent,
  idleAtApprovedStop,
  approvedStopSeq,
  checkpointDue,
} = {}) {
  if (scheduledShift?.kind !== "recovery-drill"
    || scheduledShift.checkpointContinuationDispatched
    || !Number.isSafeInteger(Number(recoveryDrillEventSeq))
    || Number(checkpointCount) >= Number(scheduledShift.targetCheckpointCount ?? Infinity)
    || driftPresent || !idleAtApprovedStop || checkpointDue !== true
    || !Number.isSafeInteger(Number(approvedStopSeq))
    || Number(approvedStopSeq) <= Number(scheduledShift.afterSeq ?? Infinity)) return null;
  const ordered = events.filter((event) => Number.isSafeInteger(Number(event?.seq)))
    .sort((left, right) => Number(left.seq) - Number(right.seq));
  for (const correction of ordered.filter((event) =>
    event.type === "correction_emitted" && event.source === "supervisor_plan"
    && event.interventionId && event.correctionAuthorityHash
    && Number(event.seq) > Number(recoveryDrillEventSeq))) {
    const same = (event) => event.interventionId === correction.interventionId
      && event.correctionAuthorityHash === correction.correctionAuthorityHash;
    const audit = ordered.find((event) => event.type === "correction_factual_audit"
      && event.interventionId === correction.interventionId && event.passed === true
      && !event.insufficient && Number(event.seq) === Number(correction.factualAuditSeq)
      && Number(event.seq) < Number(correction.seq));
    const observed = ordered.find((event) => event.type === "correction_observed" && same(event)
      && Number(event.seq) > Number(correction.seq));
    const effect = observed && ordered.find((event) => event.type === "effect_observed" && same(event)
      && Number(event.seq) > Number(observed.seq));
    /* The controller approves a Stop by writing acceptance/outcome and only
       then resolves the intervention. Therefore the approved Stop boundary is
       necessarily before intervention_resolved. Requiring a later Stop creates
       a circular wait: the evaluator cannot dispatch the checkpoint wake until
       a later Stop exists, while that later Stop cannot exist without the wake. */
    const stop = effect && ordered.find((event) => event.type === "boundary_reached"
      && event.boundary === "Stop" && Number(event.seq) === Number(approvedStopSeq)
      && Number(event.seq) > Number(effect.seq));
    const acceptance = stop && ordered.find((event) => event.type === "acceptance_finished"
      && event.phase === "stop" && event.passed === true
      && event.interventionId === correction.interventionId
      && Number(event.seq) > Number(stop.seq));
    const outcome = acceptance && ordered.find((event) => event.type === "outcome_verdict"
      && event.phase === "stop" && event.passed === true && !event.insufficient
      && event.interventionId === correction.interventionId
      && Number(event.seq) > Number(acceptance.seq));
    const resolved = outcome && ordered.find((event) => event.type === "intervention_resolved"
      && same(event) && event.correctionObserved === true && event.effectObserved === true
      && Number(event.seq) > Number(outcome.seq));
    if (audit && observed && effect && stop && acceptance && outcome && resolved) {
      return Object.freeze({
        interventionId: correction.interventionId,
        correctionAuthorityHash: correction.correctionAuthorityHash,
        correctionSeq: correction.seq,
        resolvedSeq: resolved.seq,
        approvedStopSeq: Number(approvedStopSeq),
        targetCheckpointCount: Number(scheduledShift.targetCheckpointCount),
      });
    }
  }
  return null;
}

/**
 * The evaluator permits exactly one bounded patrol warmup.  Once that shift
 * has reached an independently approved Stop, no future wall-clock progress
 * can turn an unusable judge response into a usable patrol verdict unless the
 * evaluator spends another model turn.  The preregistration forbids that
 * implicit retry, so terminate the sample instead of idling until the worker
 * wall-clock budget expires.
 */
export function classifyPatrolWarmupFailure(events, {
  usablePatrolVerdicts = 0,
} = {}) {
  if (Number(usablePatrolVerdicts) > 0) return null;
  const dispatches = events.filter((event) =>
    event?.type === "endurance_patrol_warmup_dispatched");
  if (dispatches.length === 0) return null;
  const dispatch = dispatches.at(-1);
  const completed = events.find((event) =>
    event?.type === "endurance_shift_completed"
    && event.kind === "patrol-warmup"
    && Number(event.dispatchedAtSeq) === Number(dispatch.seq));
  if (!completed) return null;
  const patrols = events.filter((event) =>
    event?.type === "semantic_patrol_finished"
    && Number(event.seq) > Number(dispatch.seq)
    && Number(event.seq) < Number(completed.seq));
  return Object.freeze({
    code: "PATROL_WARMUP_COMPLETED_WITHOUT_USABLE_VERDICT",
    dispatchedAtSeq: dispatch.seq,
    completedAtSeq: completed.seq,
    patrolStatuses: Object.freeze(patrols.map((event) => event.status ?? "unknown")),
    productSafetyFailure: false,
    enduranceEvidenceFailure: true,
  });
}
