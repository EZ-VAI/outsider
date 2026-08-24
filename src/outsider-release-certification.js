import { createHash } from "node:crypto";
import {
  closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { assessAgentTeamConformance } from "./outsider-agent-team-conformance.js";
import { verifyStage05RunDirectory } from "./outsider-stage05-evidence.js";

const STABLE_PUBLIC_FIELD_EVIDENCE = [
  "liveCanary",
  "r1Repeatability",
  "r2AgentTeamDelivery",
  "r3IntegrationCorrection",
  "r4CrashRecovery",
  "desktopCoworkPlugin",
  "multiHourEndurance",
  "independentSecondMachineInstall",
  "codexLifecycleControl",
  "chatgptLivePluginInstall",
  "chatgptNewChatSkillEvaluation",
];

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export function writePrivateReleaseCertificate(file, certificate) {
  if (typeof file !== "string" || !file || !certificate
    || typeof certificate !== "object" || Array.isArray(certificate)) {
    throw new Error("PRIVATE_RELEASE_CERTIFICATE_INPUT_INVALID");
  }
  const serialized = `${JSON.stringify(certificate, null, 2)}\n`;
  const absolute = path.resolve(file);
  mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  const descriptor = openSync(absolute,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | NOFOLLOW, 0o600);
  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new Error("PRIVATE_RELEASE_CERTIFICATE_FILE_REQUIRED");
    }
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, serialized);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const written = lstatSync(absolute);
  if (!written.isFile() || written.isSymbolicLink() || (written.mode & 0o777) !== 0o600) {
    throw new Error("PRIVATE_RELEASE_CERTIFICATE_MODE_INVALID");
  }
  return absolute;
}

export function assessReleaseReadiness({ deterministicReady, fieldEvidence } = {}) {
  const privateBetaReady = deterministicReady === true;
  const stablePublicReleaseReady = privateBetaReady
    && STABLE_PUBLIC_FIELD_EVIDENCE.every((name) => fieldEvidence?.[name]?.status === "PASS");
  return {
    releaseDecision: privateBetaReady ? "PRIVATE_BETA_READY" : "BLOCKED",
    stablePublicReleaseReady,
  };
}

export function assessEnduranceEvents({ events, proofComplete }, {
  minDurationMs = 2 * 60 * 60 * 1000,
  requireMultiAgent = false,
  requireControllerRecovery = false,
  minimumTeammates = 1,
  minimumTeamTasks = 0,
} = {}) {
  const launch = events.find((event) => event.type === "worker_launch");
  const finalized = [...events].reverse().find((event) => event.type === "run_finalized");
  const startedAt = Date.parse(launch?.at ?? "");
  const endedAt = Date.parse(finalized?.at ?? "");
  const durationMs = Number.isFinite(startedAt) && Number.isFinite(endedAt)
    ? Math.max(0, endedAt - startedAt) : null;
  const patrolsDue = events.filter((event) => event.type === "semantic_patrol_due").length;
  const patrolVerdicts = events.filter((event) =>
    ["semantic_patrol_passed", "semantic_patrol_finished"].includes(event.type)).length;
  const registeredAgents = new Set(events.filter((event) => event.type === "agent_registered")
    .map((event) => event.agentId).filter(Boolean)).size;
  const registeredTeammates = new Set(events.filter((event) => event.type === "agent_registered")
    .map((event) => event.agentId).filter((agentId) => agentId && agentId !== "main")).size;
  const teamTasksCreated = new Set(events.filter((event) => event.type === "team_task_created")
    .map((event) => event.taskId).filter(Boolean)).size;
  const integrated = events.some((event) => event.type === "multi_agent_integration_verified");
  const recoveries = events.filter((event) => event.type === "controller_recovered").length;
  const errors = [];
  if (!proofComplete || finalized?.proofComplete !== true) errors.push("causal proof is incomplete");
  if (durationMs == null || durationMs < minDurationMs) errors.push("minimum endurance duration not reached");
  if (patrolsDue === 0) errors.push("no periodic semantic patrol became due");
  if (patrolVerdicts === 0) errors.push("no periodic semantic patrol produced a verdict");
  if (requireMultiAgent && (registeredTeammates < Math.max(1, Number(minimumTeammates) || 1)
    || teamTasksCreated < Math.max(0, Number(minimumTeamTasks) || 0) || !integrated)) {
    errors.push("multi-agent coordination/integration evidence missing");
  }
  if (requireControllerRecovery && recoveries === 0) errors.push("controller recovery evidence missing");
  return {
    ok: errors.length === 0,
    durationMs,
    minimumDurationMs: minDurationMs,
    patrolsDue,
    patrolVerdicts,
    registeredAgents,
    registeredTeammates,
    teamTasksCreated,
    multiAgentIntegrationVerified: integrated,
    controllerRecoveries: recoveries,
    requirements: { requireMultiAgent, requireControllerRecovery,
      minimumTeammates, minimumTeamTasks },
    errors,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function strictCheckpointEvidence({ events, preregistration, witness }) {
  const errors = [];
  if (preregistration?.schema !== "outsider/stage05-endurance-preregistration/v1") {
    errors.push("sealed endurance preregistration missing or invalid");
  }
  if (witness?.schema !== "outsider/stage05-endurance-witness/v1") {
    errors.push("controller-external endurance witness missing or invalid");
  }
  if (errors.length) return { ok: false, errors, checkpoints: 0, witnessedDurationMs: null };

  const preregistrationBody = Object.fromEntries(Object.entries(preregistration)
    .filter(([key]) => key !== "preregistrationHash"));
  if (preregistration.preregistrationHash !== sha256(JSON.stringify(preregistrationBody))) {
    errors.push("endurance preregistration hash is invalid");
  }
  const policy = preregistration.checkpointPolicy ?? {};
  const minimumDurationMs = Number(preregistration.minimumDurationMs);
  const minimumIntervalMs = Number(policy.minimumIntervalMs);
  const minimumCheckpoints = Number(policy.minimumCheckpoints);
  if (!Number.isFinite(minimumDurationMs) || minimumDurationMs <= 0
    || !Number.isFinite(minimumIntervalMs) || minimumIntervalMs <= 0
    || !Number.isInteger(minimumCheckpoints) || minimumCheckpoints < 2) {
    errors.push("endurance preregistration checkpoint policy is invalid");
  }
  if (policy.timestampsOwnedBy !== "controller-external-unix-socket-witness") {
    errors.push("checkpoint timestamps are not owned by the external witness");
  }
  if (Number(witness.minimumDurationMs) !== minimumDurationMs
    || Number(witness.minimumIntervalMs) !== minimumIntervalMs
    || Number(witness.minimumCheckpoints) !== minimumCheckpoints) {
    errors.push("witness thresholds differ from the preregistered thresholds");
  }
  const checkpoints = Array.isArray(witness.checkpoints) ? witness.checkpoints : [];
  if (witness.passed !== true || witness.enoughDuration !== true
    || witness.enoughCheckpoints !== true || checkpoints.length < minimumCheckpoints) {
    errors.push("external witness did not satisfy duration and checkpoint requirements");
  }
  let prior = null;
  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index];
    const atMs = Number(checkpoint?.atMs);
    const monotonicMs = Number(checkpoint?.monotonicMs);
    if (checkpoint?.ordinal !== index + 1 || !Number.isFinite(atMs)
      || !Number.isFinite(monotonicMs) || Date.parse(checkpoint?.at ?? "") !== atMs
      || !checkpoint?.runId || !checkpoint?.toolUseId) {
      errors.push(`checkpoint ${index + 1} has invalid ordinal or timestamp`);
      continue;
    }
    if (prior != null && monotonicMs - prior < minimumIntervalMs) {
      errors.push(`checkpoint ${index + 1} violates the minimum interval`);
    }
    prior = monotonicMs;
  }
  const firstAt = Number(checkpoints[0]?.atMs);
  const lastAt = Number(checkpoints.at(-1)?.atMs);
  const firstMonotonic = Number(checkpoints[0]?.monotonicMs);
  const lastMonotonic = Number(checkpoints.at(-1)?.monotonicMs);
  const witnessedDurationMs = Number.isFinite(firstMonotonic) && Number.isFinite(lastMonotonic)
    ? Math.max(0, lastMonotonic - firstMonotonic) : null;
  if (witnessedDurationMs == null || witnessedDurationMs < minimumDurationMs) {
    errors.push("first-to-last external checkpoint duration is too short");
  }
  const launch = events.find((event) => event.type === "worker_launch");
  const finalized = [...events].reverse().find((event) => event.type === "run_finalized");
  const launchAt = Date.parse(launch?.at ?? "");
  const finalizedAt = Date.parse(finalized?.at ?? "");
  if (!Number.isFinite(launchAt) || !Number.isFinite(finalizedAt)
    || firstAt < launchAt || lastAt > finalizedAt) {
    errors.push("external checkpoints are not contained inside the worker lifetime");
  }
  const evaluatorBoundHealthChecks = policy.sourceBoundBy
    === "evaluator-owned-successful-health-check-posttooluse";
  const checkpointRecords = evaluatorBoundHealthChecks
    ? events.filter((event) => event.type === "endurance_checkpoint_recorded") : [];
  const checkpointBoundaries = evaluatorBoundHealthChecks
    ? checkpointRecords.map((record) => events.find((event) =>
      event.type === "boundary_reached" && event.boundary === "PostToolUse"
      && event.tool === "Bash" && event.exit === 0
      && event.toolUseId === record.toolUseId
      && Number(event.seq) === Number(record.sourceBoundarySeq)
      && event.eventHash === record.sourceBoundaryEventHash
      && Number(record.seq) > Number(event.seq)
      && record.sourceCommandClass === "EXACT_FROZEN_ACCEPTANCE_HEALTH_CHECK"
      && record.evaluatorOwnsWitnessCredential === true
      && record.workerReceivedWitnessCredential === false)).filter(Boolean)
    : events.filter((event) => event.type === "boundary_reached"
      && event.boundary === "PostToolUse" && event.exit === 0
      && /(?:npm\s+run\s+checkpoint|checkpoint\.mjs)/i.test(String(event.action ?? "")));
  const checkpointToolUseIds = new Set(checkpointBoundaries.map((event) => event.toolUseId).filter(Boolean));
  if (checkpointBoundaries.length < checkpoints.length
    || checkpoints.some((checkpoint) => !checkpointToolUseIds.has(checkpoint.toolUseId))
    || new Set(checkpoints.map((checkpoint) => checkpoint.toolUseId)).size !== checkpoints.length) {
    errors.push("accepted external checkpoints are not backed by distinct successful tool boundaries");
  }
  if (evaluatorBoundHealthChecks && (checkpointRecords.length !== checkpoints.length
    || checkpoints.some((checkpoint) => !checkpointRecords.some((record) =>
      Number(record.witnessOrdinal) === Number(checkpoint.ordinal)
      && record.toolUseId === checkpoint.toolUseId && record.label === checkpoint.label)))) {
    errors.push("evaluator checkpoint commitments do not exactly bind the external witness");
  }
  if (Array.isArray(witness.wallClockDiscontinuities)
    && witness.wallClockDiscontinuities.length > 0) {
    errors.push("wall clock discontinuity was observed during the endurance run");
  }
  return {
    ok: errors.length === 0,
    errors,
    checkpoints: checkpoints.length,
    witnessedDurationMs,
    minimumDurationMs,
    minimumIntervalMs,
    minimumCheckpoints,
    successfulCheckpointBoundaries: checkpointBoundaries.length,
  };
}

function strictBoundedShiftEvidence({ events, preregistration, witness }) {
  const errors = [];
  const policy = preregistration?.shiftPolicy ?? null;
  if (!policy) return { ok: true, enabled: false, errors, shifts: 0, expectedShifts: 0 };
  if (policy?.scheduler !== "controller-external-monotonic-witness"
    || policy?.idleBetweenShifts !== true) {
    return { ok: false, errors: ["bounded idle-shift policy is missing"], shifts: 0 };
  }
  const sequence = (event) => Number(event?.seq);
  const ordered = events.filter((event) => Number.isInteger(sequence(event)))
    .sort((left, right) => sequence(left) - sequence(right));
  const checkpoints = Array.isArray(witness?.checkpoints) ? witness.checkpoints : [];
  const expectedShifts = Math.max(0, checkpoints.length - 1);
  const checkpointKinds = new Set(["checkpoint", "recovery-drill"]);
  const dispatched = ordered.filter((event) => event.type === "endurance_shift_dispatched"
    && checkpointKinds.has(event.kind));
  const completed = ordered.filter((event) => event.type === "endurance_shift_completed"
    && checkpointKinds.has(event.kind));
  if (dispatched.length !== expectedShifts || completed.length !== expectedShifts) {
    errors.push("bounded checkpoint-shift cardinality does not match the external witness");
  }
  for (let ordinal = 1; ordinal <= expectedShifts; ordinal += 1) {
    const dispatch = dispatched.find((event) => Number(event.ordinal) === ordinal);
    const completion = completed.find((event) => Number(event.ordinal) === ordinal);
    const checkpoint = checkpoints[ordinal];
    if (!dispatch || !completion || !checkpoint) continue;
    const priorStop = ordered.find((event) => event.type === "boundary_reached"
      && event.boundary === "Stop" && event.seq === dispatch.afterApprovedStopSeq);
    const priorPass = ordered.find((event) => event.type === "outcome_verdict"
      && event.phase === "stop" && event.passed === true && !event.insufficient
      && sequence(event) > sequence(priorStop) && sequence(event) < sequence(dispatch));
    const checkpointBoundary = ordered.find((event) => event.type === "boundary_reached"
      && event.boundary === "PostToolUse" && event.exit === 0
      && event.toolUseId === checkpoint.toolUseId
      && sequence(event) > sequence(dispatch) && sequence(event) < sequence(completion));
    const nextStop = ordered.find((event) => event.type === "boundary_reached"
      && event.boundary === "Stop" && event.seq === completion.approvedStopSeq
      && sequence(event) > sequence(checkpointBoundary));
    const nextPass = ordered.find((event) => event.type === "outcome_verdict"
      && event.phase === "stop" && event.passed === true && !event.insufficient
      && event.seq === completion.outcomeVerdictSeq && sequence(event) > sequence(nextStop));
    const workDuringIdle = priorStop && ordered.some((event) => event.type === "boundary_reached"
      && ["PreToolUse", "PostToolUse"].includes(event.boundary)
      && sequence(event) > sequence(priorPass) && sequence(event) < sequence(dispatch));
    if (!priorStop || !priorPass || !checkpointBoundary || !nextStop || !nextPass) {
      errors.push(`checkpoint shift ${ordinal} is not bounded by two independently approved Stops`);
    }
    if (workDuringIdle) errors.push(`checkpoint shift ${ordinal} did not remain idle before dispatch`);
    if (Number(dispatch.targetCheckpointCount) !== ordinal + 1
      || Number(completion.checkpointCount) < ordinal + 1) {
      errors.push(`checkpoint shift ${ordinal} is not bound to witness checkpoint ${ordinal + 1}`);
    }
  }
  return { ok: errors.length === 0, enabled: true, errors,
    shifts: completed.length, expectedShifts };
}

function strictRecoveryDrillEvidence({ events, preregistration }) {
  const policy = preregistration?.recoveryDrill ?? null;
  if (!policy) return { ok: true, enabled: false, errors: [] };
  if (policy?.mustProduceAuditedCausalIntervention !== true) {
    return { ok: false, errors: ["preregistered recovery drill policy is missing"] };
  }
  const errors = [];
  const ordered = events.filter((event) => Number.isInteger(Number(event?.seq)))
    .sort((left, right) => Number(left.seq) - Number(right.seq));
  const injections = ordered.filter((event) => event.type === "endurance_recovery_drill_injected"
    && event.path === policy.path && event.contentHash === policy.contentHash
    && event.evaluatorOwned === true && event.controllerPreparedBeforeHook === true);
  const injected = injections[0] ?? null;
  const armed = injected ? ordered.find((event) => event.type === "endurance_recovery_drill_armed"
    && event.seq === injected.armedEventSeq && event.path === policy.path
    && event.contentHash === policy.contentHash && event.evaluatorOwned === true
    && Number(event.seq) < Number(injected.seq)) : null;
  const recovery = armed ? [...ordered].reverse().find((event) =>
    event.type === "endurance_crash_recovery_confirmed"
    && Number(event.seq) < Number(armed.seq)) : null;
  const approvedStop = armed ? ordered.find((event) => event.type === "boundary_reached"
    && event.boundary === "Stop" && event.seq === armed.afterApprovedStopSeq
    && Number(event.seq) < Number(armed.seq)) : null;
  const approvedOutcome = approvedStop ? ordered.find((event) => event.type === "outcome_verdict"
    && event.phase === "stop" && event.passed === true && !event.insufficient
    && Number(event.seq) > Number(approvedStop.seq) && Number(event.seq) < Number(armed.seq)) : null;
  const injectionBoundary = injected ? ordered.find((event) => event.type === "boundary_reached"
    && Number(event.seq) > Number(injected.seq)) : null;
  const expectedDelete = (correction) => correction?.expectedActions?.find((action) =>
    action?.kind === "delete" && action.path === policy.path
    && action.preSha256 === policy.contentHash) ?? null;
  const matchedDeleteEffect = (effect) => {
    if (!effect?.matchedExpectedAction) return false;
    try {
      const action = typeof effect.matchedExpectedAction === "string"
        ? JSON.parse(effect.matchedExpectedAction) : effect.matchedExpectedAction;
      return action?.kind === "delete" && action.path === policy.path
        && action.preSha256 === policy.contentHash;
    } catch { return false; }
  };
  const corrections = injectionBoundary ? ordered.filter((event) =>
    event.type === "correction_emitted" && event.source === "supervisor_plan"
    && event.interventionId && event.correctionAuthorityHash
    && Number(event.seq) > Number(injectionBoundary.seq) && expectedDelete(event)) : [];
  const initialCorrection = corrections[0] ?? null;
  /* A periodic patrol may independently diagnose the same injected defect
     while the Stop correction is being observed. The controller records that
     replacement explicitly; follow only that append-only supersession chain
     instead of either freezing the first proposal or accepting an unrelated
     later correction. */
  /* The first audited plan can be observed yet ineffective. A later Stop may
     legitimately issue a fresh intervention for the still-present, same
     preregistered marker. Select the first complete marker-bound chain rather
     than permanently freezing the first proposal. Exact path+preimage and the
     effect's matched expected action prevent an unrelated later correction
     from receiving recovery-drill credit. Explicit patrol supersession remains
     naturally supported because the replacement is another bound candidate. */
  let correction = null;
  let audit = null;
  let observed = null;
  let effect = null;
  let resolved = null;
  let shift = null;
  for (const candidate of corrections) {
    const candidateAudit = ordered.find((event) => event.type === "correction_factual_audit"
      && event.interventionId === candidate.interventionId && event.passed === true
      && !event.insufficient && Number(event.seq) === Number(candidate.factualAuditSeq)
      && Number(event.seq) > Number(injectionBoundary.seq)
      && Number(event.seq) < Number(candidate.seq));
    const candidateObserved = candidateAudit && ordered.find((event) =>
      event.type === "correction_observed" && event.interventionId === candidate.interventionId
      && event.correctionAuthorityHash === candidate.correctionAuthorityHash
      && Number(event.seq) > Number(candidate.seq));
    const candidateEffect = candidateObserved && ordered.find((event) =>
      event.type === "effect_observed" && event.interventionId === candidate.interventionId
      && event.correctionAuthorityHash === candidate.correctionAuthorityHash
      && Number(event.seq) > Number(candidateObserved.seq) && matchedDeleteEffect(event));
    const candidateResolved = candidateEffect && ordered.find((event) =>
      event.type === "intervention_resolved" && event.interventionId === candidate.interventionId
      && event.correctionAuthorityHash === candidate.correctionAuthorityHash
      && event.correctionObserved === true && event.effectObserved === true
      && Number(event.seq) > Number(candidateEffect.seq));
    const candidateShift = candidateResolved && ordered.find((event) =>
      event.type === "endurance_shift_completed" && event.kind === "recovery-drill"
      && event.interventionId === candidate.interventionId
      && Number(event.seq) > Number(candidateResolved.seq));
    if (candidateAudit && candidateObserved && candidateEffect
      && candidateResolved && candidateShift) {
      correction = candidate;
      audit = candidateAudit;
      observed = candidateObserved;
      effect = candidateEffect;
      resolved = candidateResolved;
      shift = candidateShift;
      break;
    }
  }
  const dispatch = armed ? ordered.find((event) => event.type === "endurance_shift_dispatched"
    && event.kind === "recovery-drill" && Number.isInteger(Number(event.ordinal))
    && event.armedEventSeq === armed.seq && Number(event.seq) > Number(armed.seq)) : null;
  if (!injected) errors.push("preregistered evaluator-owned recovery drill was not injected");
  if (injections.length !== 1) errors.push("recovery drill injection cardinality is not exactly one");
  if (!armed || !dispatch || !recovery || !approvedStop || !approvedOutcome
    || injectionBoundary?.boundary !== "Stop") {
    errors.push("recovery drill was not atomically injected at the first Stop after a recovered approved delivery");
  }
  if (!audit || !correction || !observed || !effect || !resolved || !shift) {
    errors.push("recovery drill did not produce one observed, effective and resolved audited correction");
  }
  return { ok: errors.length === 0, enabled: true, errors, injectedSeq: injected?.seq ?? null,
    initialInterventionId: initialCorrection?.interventionId ?? null,
    interventionId: correction?.interventionId ?? null, resolvedSeq: resolved?.seq ?? null };
}

/* A patrol becoming due is only a scheduling fact.  A usable patrol is a
   one-to-one, ordered due/verdict pair for the same actor and patrol clock.
   A correction verdict additionally has to be the result of a factual audit
   that actually authorized a supervisor correction.  In particular,
   insufficient, invalid and completion-budget-reserved terminal statuses are
   not semantic evidence merely because markSemanticPatrol() emitted a
   semantic_patrol_finished event for them. */
function strictUsablePatrols(events) {
  const sequence = (event) => Number(event?.seq);
  const ordered = events.filter((event) => Number.isInteger(sequence(event)))
    .sort((left, right) => sequence(left) - sequence(right));
  const dueEvents = ordered.filter((event) => event.type === "semantic_patrol_due");
  const verdictEvents = ordered.filter((event) =>
    ["semantic_patrol_passed", "semantic_patrol_finished"].includes(event.type));
  const usedVerdicts = new Set();
  const usable = [];

  const correctionEvidence = (due, verdict) => {
    if (verdict.type !== "semantic_patrol_finished" || verdict.status !== "correction"
      || !verdict.interventionId) return null;
    const audit = ordered.find((event) => event.type === "correction_factual_audit"
      && event.interventionId === verdict.interventionId && event.passed === true
      && !event.insufficient && sequence(event) > sequence(due)
      && sequence(event) < sequence(verdict));
    if (!audit) return null;
    const correction = ordered.find((event) => event.type === "correction_emitted"
      && event.interventionId === verdict.interventionId
      && event.agentId === due.agentId && event.source === "supervisor_plan"
      && sequence(event) > sequence(audit) && sequence(event) < sequence(verdict)
      && Number(event.factualAuditSeq) === sequence(audit));
    return correction ? { audit, correction } : null;
  };

  for (const due of dueEvents) {
    if (!due.agentId || !Number.isFinite(Number(due.toolBoundaries))) continue;
    const verdict = verdictEvents.find((candidate) => !usedVerdicts.has(sequence(candidate))
      && sequence(candidate) > sequence(due) && candidate.agentId === due.agentId
      && Number(candidate.toolBoundaries) === Number(due.toolBoundaries)
      && (candidate.status === "on-track" || correctionEvidence(due, candidate)));
    if (!verdict) continue;
    const correction = verdict.status === "on-track" ? null : correctionEvidence(due, verdict);
    usedVerdicts.add(sequence(verdict));
    usable.push({
      agentId: due.agentId,
      toolBoundaries: Number(due.toolBoundaries),
      dueSeq: sequence(due),
      verdictSeq: sequence(verdict),
      status: verdict.status,
      interventionId: verdict.interventionId ?? null,
      auditSeq: correction ? sequence(correction.audit) : null,
      correctionSeq: correction ? sequence(correction.correction) : null,
    });
  }
  return { dueEvents, verdictEvents, usable };
}

/** Non-certifying harness assessment. This deliberately reuses the same
 * external-clock, bounded-shift and recovery-drill proofs as the formal
 * endurance gate, while omitting only Agent Team and two-hour requirements.
 * A PASS here proves the wake/recovery harness is fit to start an expensive
 * formal run; it is never field endurance evidence. */
export function assessEnduranceSmokeEvidence({
  events, proofComplete, preregistration, witness,
} = {}) {
  const errors = [];
  if (preregistration?.evaluationMode !== "NON_CERTIFYING_SMOKE") {
    errors.push("non-certifying smoke preregistration is missing");
  }
  const checkpointEvidence = strictCheckpointEvidence({ events, preregistration, witness });
  const boundedShiftEvidence = strictBoundedShiftEvidence({ events, preregistration, witness });
  const recoveryDrillEvidence = strictRecoveryDrillEvidence({ events, preregistration });
  errors.push(...checkpointEvidence.errors, ...boundedShiftEvidence.errors,
    ...recoveryDrillEvidence.errors);
  const finalized = [...events].reverse().find((event) => event.type === "run_finalized");
  if (proofComplete !== true || finalized?.proofComplete !== true
    || finalized?.deliveryComplete !== true || finalized?.interventionComplete !== true) {
    errors.push("complete delivery and intervention proof are required");
  }
  const patrolEvidence = strictUsablePatrols(events);
  const injected = events.find((event) => event.type === "endurance_crash_injection_due");
  const recovered = events.find((event) => event.type === "controller_recovered"
    && Number(event.generation) >= 2 && Number(event.seq) > Number(injected?.seq));
  const confirmed = events.find((event) => event.type === "endurance_crash_recovery_confirmed"
    && Number(event.seq) > Number(recovered?.seq));
  const workerExit = events.find((event) => event.type === "worker_exit"
    && Number(event.seq) > Number(confirmed?.seq));
  const preCrash = injected ? patrolEvidence.usable.filter((patrol) =>
    patrol.verdictSeq < Number(injected.seq)) : [];
  const postRecovery = confirmed ? patrolEvidence.usable.filter((patrol) =>
    patrol.dueSeq > Number(confirmed.seq) && patrol.verdictSeq < Number(workerExit?.seq)) : [];
  if (!injected || !recovered || !confirmed || !workerExit) {
    errors.push("crash injection, confirmed recovery and worker exit are not causally ordered");
  }
  if (preCrash.length === 0 || postRecovery.length === 0) {
    errors.push("usable semantic patrol evidence is required both before crash and after recovery");
  }
  return {
    ok: errors.length === 0,
    nonCertifying: true,
    checkpointEvidence,
    boundedShiftEvidence,
    recoveryDrillEvidence,
    usablePatrolsBeforeCrash: preCrash.length,
    usablePatrolsAfterRecovery: postRecovery.length,
    errors,
  };
}

/** Strict field-evidence assessor. Unlike assessEnduranceEvents(), this does
 * not equate a long gap between two event timestamps with an endurance proof.
 * It requires the independently timestamped checkpoint ledger, real Agent Team
 * lifecycle evidence, a live controller takeover, and a sealed causal proof. */
export function assessEnduranceEvidence({ events, proofComplete, preregistration, witness }, {
  minDurationMs = 2 * 60 * 60 * 1000,
  minimumPatrolVerdicts = 1,
  minimumTeammates = 2,
  minimumTeamTasks = 3,
  requiredTeammateNames = null,
} = {}) {
  const errors = [];
  const checkpointEvidence = strictCheckpointEvidence({ events, preregistration, witness });
  errors.push(...checkpointEvidence.errors);
  const boundedShiftEvidence = strictBoundedShiftEvidence({ events, preregistration, witness });
  errors.push(...boundedShiftEvidence.errors);
  const recoveryDrillEvidence = strictRecoveryDrillEvidence({ events, preregistration });
  errors.push(...recoveryDrillEvidence.errors);
  if (Number(preregistration?.minimumDurationMs) < minDurationMs) {
    errors.push("preregistered duration is below the certification threshold");
  }
  const finalized = [...events].reverse().find((event) => event.type === "run_finalized");
  if (proofComplete !== true || finalized?.proofComplete !== true
    || finalized?.deliveryComplete !== true || finalized?.interventionComplete !== true) {
    errors.push("complete delivery and intervention proof are required");
  }
  if (preregistration?.requiredEvidence?.completeCausalIntervention === true) {
    const resolvedIds = new Set(events.filter((event) => event.type === "intervention_resolved")
      .map((event) => event.interventionId).filter(Boolean));
    const completeIntervention = events.some((event) => event.type === "correction_emitted"
      && resolvedIds.has(event.interventionId)
      && events.some((candidate) => candidate.type === "correction_observed"
        && candidate.interventionId === event.interventionId && candidate.seq > event.seq)
      && events.some((candidate) => candidate.type === "effect_observed"
        && candidate.interventionId === event.interventionId && candidate.seq > event.seq));
    if (!completeIntervention) errors.push("no complete causal intervention occurred during endurance");
  }

  const patrolEvidence = strictUsablePatrols(events);
  const patrolsDue = patrolEvidence.dueEvents;
  const usablePatrols = patrolEvidence.usable;
  if (usablePatrols.length < minimumPatrolVerdicts) {
    errors.push("periodic semantic patrol evidence is below the required minimum");
  }

  const requiredIds = (requiredTeammateNames
    ?? preregistration?.requiredEvidence?.teammateNames ?? [])
    .map((name) => `teammate:${String(name).replace(/^teammate:/, "")}`);
  const expectedMinimumTeammates = Math.max(minimumTeammates,
    Number(preregistration?.requiredEvidence?.distinctRegisteredTeammates) || 0,
    requiredIds.length);
  const teamTasks = events.filter((event) => event.type === "team_task_created");
  const expectedMinimumTasks = Math.max(minimumTeamTasks,
    Number(preregistration?.requiredEvidence?.teamTasksCreated) || 0);
  if (new Set(teamTasks.map((event) => event.taskId).filter(Boolean)).size < expectedMinimumTasks) {
    errors.push("required Agent Team task graph was not created");
  }
  /* The teammate: prefix is routing data, not host identity proof.  Reuse the
     host-conformance gate so endurance certification also requires lifecycle
     lineage and one-time frozen-context injection before the teammate acts. */
  const agentTeamConformance = assessAgentTeamConformance(events, {
    requiredTeammateNames: requiredIds,
    minimumTasks: expectedMinimumTasks,
    requireIntegration: true,
    requireTeammateSpawnBinding: preregistration?.agentTeamPolicy
      ?.requireTeammateSpawnBinding === true,
    expectedFilesByTeammate: preregistration?.agentTeamPolicy
      ?.expectedFilesByTeammate ?? {},
    initialFileHashesByTeammate: preregistration?.agentTeamPolicy
      ?.initialFileHashesByTeammate ?? {},
    expectedChecksByTeammate: preregistration?.agentTeamPolicy
      ?.expectedChecksByTeammate ?? {},
    expectedIntegrationCheck: preregistration?.agentTeamPolicy
      ?.expectedIntegrationCheck ?? null,
    exactTaskCount: preregistration?.agentTeamPolicy?.exactTaskCount ?? null,
    exactTeammateBindingCount: preregistration?.agentTeamPolicy
      ?.exactTeammateBindingCount ?? null,
    exactIntegrationCount: preregistration?.agentTeamPolicy?.exactIntegrationCount ?? null,
  });
  errors.push(...agentTeamConformance.errors.map((error) =>
    `Agent Team conformance: ${error}`));
  /* Modern implicit Teams first register an opaque host execution id, then
     append an immutable team_identity_bound join. The strict conformance
     assessor has already verified that receipt/registration/context chain.
     Count its canonical teammate chains alongside legacy direct teammate
     registrations instead of re-imposing the pre-2.1.219 identity schema. */
  const registeredTeammates = new Set([
    ...events.filter((event) => event.type === "agent_registered"
      && String(event.agentId ?? "").startsWith("teammate:"))
      .map((event) => event.agentId),
    ...agentTeamConformance.teammateChains.map((chain) => chain.agentId),
  ]);
  if (registeredTeammates.size < expectedMinimumTeammates
    || requiredIds.some((id) => !registeredTeammates.has(id))) {
    errors.push("required real Agent Team teammates were not host-bound");
  }
  /* Counts are not coordination proof. Bind every required teammate to one
     controller-owned team task and require the same task identity across
     ownership, an attributed file effect and the independent completion gate.
     Otherwise two unrelated agents, touches and completed tasks can be pooled
     into a false multi-agent PASS. */
  const sequence = (event) => Number(event?.seq);
  const createdTaskIds = new Set(teamTasks.map((event) => event.taskId).filter(Boolean));
  const teammateIdentity = (value) => {
    const owner = String(value ?? "").trim();
    if (!owner) return null;
    return owner.startsWith("teammate:") ? owner : `teammate:${owner}`;
  };
  const requiredTaskChains = [];
  if (requiredIds.length < expectedMinimumTeammates) {
    errors.push("required Agent Team teammate identities were not preregistered");
  }
  for (const teammateId of requiredIds) {
    const ownerships = events.filter((event) => event.type === "task_graph_updated"
      && createdTaskIds.has(event.taskId) && teammateIdentity(event.owner) === teammateId
      && Number.isInteger(sequence(event))
      && teamTasks.some((created) => created.taskId === event.taskId
        && sequence(created) < sequence(event)));
    let chain = null;
    for (const ownership of ownerships) {
      const touches = events.filter((event) => event.type === "confirmed_file_touch"
        && event.agentId === teammateId && Array.isArray(event.taskIds)
        && event.taskIds.includes(ownership.taskId) && sequence(event) > sequence(ownership));
      for (const touch of touches) {
        const ownershipAtTouch = events.filter((event) => event.type === "task_graph_updated"
          && event.taskId === ownership.taskId && sequence(event) <= sequence(touch))
          .sort((left, right) => sequence(right) - sequence(left))[0];
        if (teammateIdentity(ownershipAtTouch?.owner) !== teammateId) continue;
        const completions = events.filter((event) => event.type === "team_task_completed"
          && event.taskId === ownership.taskId && event.agentId === teammateId
          && event.independentlyVerified === true && sequence(event) > sequence(touch));
        for (const completion of completions) {
          const lastOwnership = events.filter((event) => event.type === "task_graph_updated"
            && event.taskId === ownership.taskId && sequence(event) <= sequence(completion))
            .sort((left, right) => sequence(right) - sequence(left))[0];
          if (teammateIdentity(lastOwnership?.owner) !== teammateId) continue;
          chain = { teammateId, taskId: ownership.taskId,
            ownershipSeq: sequence(ownershipAtTouch), touchSeq: sequence(touch),
            completionSeq: sequence(completion) };
          break;
        }
        if (chain) break;
      }
      if (chain) break;
    }
    if (!chain) errors.push(`required teammate task causal chain missing: ${teammateId}`);
    else requiredTaskChains.push(chain);
  }
  const teammateTaskIds = requiredTaskChains.map((chain) => chain.taskId);
  if (requiredIds.length > 0 && new Set(teammateTaskIds).size !== requiredIds.length) {
    errors.push("required teammates were not bound to distinct team tasks");
  }

  const ready = [...events].reverse().find((event) => event.type === "coordination_ready_at_stop");
  const lastTeammateCompletionSeq = requiredTaskChains.length === requiredIds.length
    ? Math.max(0, ...requiredTaskChains.map((chain) => chain.completionSeq)) : Infinity;
  let integration = null;
  let integrationTask = null;
  for (const candidate of events.filter((event) =>
    event.type === "multi_agent_integration_verified" && createdTaskIds.has(event.taskId))) {
    if (!(sequence(candidate) > lastTeammateCompletionSeq)
      || !(sequence(candidate) < sequence(ready))) continue;
    const leadTask = events.filter((event) => event.type === "task_graph_updated"
      && event.taskId === candidate.taskId && sequence(event) < sequence(candidate))
      .sort((left, right) => sequence(right) - sequence(left))[0];
    if (!leadTask || !["lead", "main"].includes(String(leadTask.owner ?? ""))
      || !Array.isArray(leadTask.blockedBy)
      || !teammateTaskIds.every((taskId) => leadTask.blockedBy.includes(taskId))
      || !teamTasks.some((created) => created.taskId === candidate.taskId
        && sequence(created) < sequence(leadTask))
      || teammateTaskIds.includes(candidate.taskId)) continue;
    integration = candidate;
    integrationTask = leadTask;
    break;
  }
  if (!integration || !integrationTask || !ready) {
    errors.push("lead integration task is not causally bound to both completed teammate tasks before Stop");
  }

  const orderedEvents = events.filter((event) => Number.isInteger(sequence(event)))
    .sort((left, right) => sequence(left) - sequence(right));
  const injected = orderedEvents.find((event) => event.type === "endurance_crash_injection_due");
  const recovered = orderedEvents.find((event) => event.type === "controller_recovered"
    && Number(event.generation) >= 2 && (!injected || sequence(event) > sequence(injected)));
  const recoveryConfirmed = orderedEvents.find((event) =>
    event.type === "endurance_crash_recovery_confirmed" && recovered
    && sequence(event) > sequence(recovered)
    && (event.generation == null || Number(event.generation) === Number(recovered.generation)));
  const workerExit = orderedEvents.find((event) => event.type === "worker_exit"
    && (!recoveryConfirmed || sequence(event) > sequence(recoveryConfirmed)));
  const recoverySeq = sequence(recoveryConfirmed);
  const postRecoveryBoundary = orderedEvents.find((event) => event.type === "boundary_reached"
    && event.boundary === "PostToolUse" && Boolean(event.toolUseId)
    && sequence(event) > recoverySeq && sequence(event) < sequence(workerExit));
  const preCrashPatrols = injected ? usablePatrols.filter((patrol) =>
    patrol.verdictSeq < sequence(injected)) : [];
  const postRecoveryPatrols = recoveryConfirmed ? usablePatrols.filter((patrol) =>
    patrol.dueSeq > recoverySeq && patrol.verdictSeq < sequence(workerExit)) : [];
  if (!injected || !recovered || !recoveryConfirmed || !workerExit || !postRecoveryBoundary) {
    errors.push("crash injection, confirmed recovery, post-recovery tool boundary and worker exit are not causally ordered");
  }
  if (preCrashPatrols.length === 0 || postRecoveryPatrols.length === 0) {
    errors.push("usable semantic patrol evidence is required both before crash and after recovery");
  }
  if (injected && (preCrashPatrols.length === 0
    || requiredIds.some((id) => !agentTeamConformance.teammateChains.some((chain) =>
      chain.agentId === id && chain.registrationSeq < sequence(injected))))) {
    errors.push("crash injection occurred before the preregistered live evidence threshold");
  }
  const generations = orderedEvents.filter((event) =>
    ["controller_started", "controller_recovered"].includes(event.type))
    .map((event) => Number(event.generation));
  if (generations.some((generation, index) => generation !== index + 1)) {
    errors.push("controller generations are not strictly monotonic");
  }

  return {
    ok: errors.length === 0,
    checkpointEvidence,
    boundedShiftEvidence,
    recoveryDrillEvidence,
    patrolsDue: patrolsDue.length,
    patrolVerdicts: usablePatrols.length,
    usablePatrols,
    usablePatrolsBeforeCrash: preCrashPatrols.length,
    usablePatrolsAfterRecovery: postRecoveryPatrols.length,
    registeredTeammates: registeredTeammates.size,
    requiredTeammateIds: requiredIds,
    teamTasksCreated: new Set(teamTasks.map((event) => event.taskId).filter(Boolean)).size,
    teammatesWithCompletedTasks: requiredTaskChains.length,
    teammatesWithFileTouches: requiredTaskChains.length,
    teammateTaskCausalChains: requiredTaskChains,
    agentTeamConformance,
    integrationTaskId: integrationTask?.taskId ?? null,
    multiAgentIntegrationVerified: Boolean(integration),
    controllerRecoveries: events.filter((event) => event.type === "controller_recovered").length,
    postRecoveryBoundarySeq: postRecoveryBoundary ? sequence(postRecoveryBoundary) : null,
    errors,
  };
}

export function certifyEnduranceRun(directory, options = {}) {
  const verified = verifyStage05RunDirectory(directory);
  if (!verified.ok) return { ok: false, error: `RUN_EVIDENCE_INVALID:${verified.error}` };
  const events = readFileSync(path.join(directory, "events.jsonl"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse);
  const preregistration = readJsonIfPresent(path.join(directory, "endurance-preregistration.json"));
  const witness = readJsonIfPresent(path.join(directory, "endurance-witness.json"));
  return {
    ...assessEnduranceEvidence({
      events,
      proofComplete: verified.projection.outcome.proofComplete,
      preregistration,
      witness,
    }, options),
    runId: verified.manifest.sourceRunId,
    manifestHash: verified.manifest.manifestHash,
    eventChainHash: verified.manifest.eventChain.chainHash,
    productVersion: verified.binding.source.packageVersion,
    releaseArtifact: preregistration?.releaseArtifact ?? null,
    runtimeHashes: {
      controller: verified.binding.source.controllerImplementationHash,
      runner: verified.binding.source.runnerImplementationHash,
      hook: verified.binding.source.hookImplementationHash,
      contractCompiler: verified.binding.source.contractCompilerHash,
      outcomeVerifier: verified.binding.source.outcomeVerifierHash,
    },
  };
}
