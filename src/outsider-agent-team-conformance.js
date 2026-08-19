import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

const hash = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const strictEventHash = (event) => {
  if (!event?.eventHash) return null;
  const { eventHash: ignored, ...body } = event;
  return hash(canonicalizeStrict(body));
};
const expectedCheckBindingHash = (agentId, commands) => hash(canonicalizeStrict({
  schema: "outsider/expected-check-binding/v1",
  agentId: String(agentId),
  commands: commands.map((command) => String(command).trim()),
}));
const matchesExpectedCheck = (event, agentId, expected, preregisteredPrefix = []) => {
  if (!expected) return true;
  if (String(event?.action ?? "").trim() === String(expected).trim()) return true;
  const kind = event?.expectedCheckMatch;
  const commands = ["exact-preregistered-suite",
    "exact-workspace-preregistered-suite"].includes(kind)
    ? [...preregisteredPrefix, expected] : [expected];
  return event?.expectedCheckHash === expectedCheckBindingHash(agentId, commands)
    && ["exact-workspace-cd-wrapper", "exact-preregistered-suite",
      "exact-workspace-preregistered-suite"].includes(kind);
};

/**
 * A teammate owns the initial slice, but a later independent outcome audit may
 * discover a defect after that teammate has completed and exited.  The lead is
 * allowed to repair that file only when the write is the exact, hash-bound
 * effect of a factually audited correction.  This is deliberately much
 * narrower than trusting prose or merely seeing an intervention nearby.
 */
export function isAuditedCrossOwnerCorrectionEffect(events = [], touch = null) {
  if (touch?.type !== "confirmed_file_touch" || touch.executed !== true
    || touch.changed !== true || !["main", "lead"].includes(touch.agentId)
    || !touch.file || !touch.toolUseId || !touch.beforeHash || !touch.afterHash
    || touch.beforeHash === touch.afterHash
    || strictEventHash(touch) !== touch.eventHash) return false;
  const seq = (event) => Number(event?.seq);
  const expected = events.find((event) => event.type === "expected_action_observed"
    && event.agentId === touch.agentId && event.toolUseId === touch.toolUseId
    && Number(event.eventSeq) === Number(touch.postBoundarySeq)
    && event.effectKind === "edit" && event.strong === true && event.succeeded === true
    && seq(event) > seq(touch) && strictEventHash(event) === event.eventHash);
  if (!expected?.interventionId || !expected.correctionAuthorityHash) return false;
  const emitted = events.find((event) => event.type === "correction_emitted"
    && event.interventionId === expected.interventionId
    && event.correctionAuthorityHash === expected.correctionAuthorityHash
    && event.agentId === touch.agentId && seq(event) < seq(touch)
    && strictEventHash(event) === event.eventHash);
  const action = emitted?.expectedActions?.find((candidate) => candidate?.kind === "edit"
    && candidate.path === touch.file && candidate.preSha256 === touch.beforeHash);
  if (!emitted || !action || expected.expectedAction !== JSON.stringify(action)) return false;
  const audit = events.find((event) => event.seq === emitted.factualAuditSeq
    && event.type === "correction_factual_audit" && event.passed === true
    && event.interventionId === expected.interventionId
    && event.correctionAuthorityHash === expected.correctionAuthorityHash
    && strictEventHash(event) === event.eventHash);
  const observed = events.find((event) => event.type === "correction_observed"
    && event.interventionId === expected.interventionId
    && event.correctionAuthorityHash === expected.correctionAuthorityHash
    && event.agentId === touch.agentId && seq(event) > seq(emitted) && seq(event) < seq(touch)
    && strictEventHash(event) === event.eventHash);
  const effect = events.find((event) => event.type === "effect_observed"
    && event.interventionId === expected.interventionId
    && event.correctionAuthorityHash === expected.correctionAuthorityHash
    && event.agentId === touch.agentId && event.toolUseId === touch.toolUseId
    && Number(event.eventSeq) === Number(touch.postBoundarySeq)
    && Array.isArray(event.changedFiles) && event.changedFiles.includes(touch.file)
    && seq(event) > seq(expected) && strictEventHash(event) === event.eventHash);
  return Boolean(audit && observed && effect
    && seq(audit) < seq(emitted) && seq(emitted) < seq(observed)
    && seq(observed) < seq(touch) && seq(touch) < seq(expected)
    && seq(expected) < seq(effect));
}

/**
 * Pure, fail-closed assessment of real Claude Agent Team evidence.
 *
 * A `teammate:` string is not identity proof.  The controller must first bind
 * host lifecycle lineage or an append-only teammate_spawned receipt to the
 * teammate, then preserve that identity through the teammate's first executed
 * tool boundary, owned task, file effect and completion.
 */
export function assessAgentTeamConformance(events = [], {
  requiredTeammateNames = [],
  minimumTasks = 3,
  requireIntegration = true,
  requireTeammateSpawnBinding = false,
  expectedFilesByTeammate = {},
  initialFileHashesByTeammate = {},
  expectedChecksByTeammate = {},
  expectedIntegrationCheck = null,
  exactTaskCount = null,
  exactIntegrationCount = null,
  exactTeammateBindingCount = null,
} = {}) {
  const errors = [];
  const requiredIds = requiredTeammateNames.map((name) =>
    `teammate:${String(name).replace(/^teammate:/, "")}`);
  const seq = (event) => Number(event?.seq);
  const normalizedOwner = (value) => {
    const owner = String(value ?? "").trim();
    if (!owner) return null;
    return owner.startsWith("teammate:") || ["lead", "main"].includes(owner)
      ? owner : `teammate:${owner}`;
  };
  const conflicts = events.filter((event) => ["agent_identity_conflict",
    "agent_host_identity_conflict", "team_identity_binding_conflict",
    "team_spawn_intent_conflict"].includes(event.type));
  if (conflicts.length) errors.push("host teammate identity conflicted during the run");

  const registrations = new Map();
  for (const event of events.filter((candidate) => candidate.type === "agent_registered")) {
    if (!registrations.has(event.agentId)) registrations.set(event.agentId, event);
  }
  const createdTasks = new Set(events.filter((event) => event.type === "team_task_created")
    .map((event) => event.taskId).filter(Boolean));
  const bySeq = new Map(events.filter((event) => Number.isFinite(seq(event)))
    .map((event) => [seq(event), event]));
  const hostAppliedTaskUpdate = (event) => {
    const pre = bySeq.get(Number(event?.preBoundarySeq));
    const post = bySeq.get(Number(event?.postBoundarySeq));
    return Boolean(event?.hostSucceeded === true && event.toolUseId
      && strictEventHash(event) === event.eventHash
      && pre?.type === "boundary_reached" && pre.boundary === "PreToolUse"
      && pre.tool === "TaskUpdate" && pre.toolUseId === event.toolUseId
      && pre.eventHash === event.preBoundaryEventHash && strictEventHash(pre) === pre.eventHash
      && post?.type === "boundary_reached" && post.boundary === "PostToolUse"
      && post.tool === "TaskUpdate" && post.toolUseId === event.toolUseId
      && post.agentId === pre.agentId
      && post.eventHash === event.postBoundaryEventHash && strictEventHash(post) === post.eventHash
      && seq(pre) < seq(post) && seq(post) < seq(event));
  };
  const validReopen = (event, taskId, ownerId, expectedGeneration) => {
    const update = bySeq.get(Number(event?.taskUpdateSeq));
    return Boolean(event?.type === "team_task_reopened"
      && event.taskId === taskId
      && ["main", "lead", "teammate:lead"].includes(String(event.agentId ?? ""))
      && normalizedOwner(event.owner) === ownerId
      && event.hostSucceeded === true
      && Number(event.taskGeneration) === Number(expectedGeneration)
      && strictEventHash(event) === event.eventHash
      && update?.type === "task_graph_updated"
      && update.taskId === taskId
      && normalizedOwner(update.owner) === ownerId
      && ["in_progress", "running"].includes(String(update.status ?? ""))
      && update.toolUseId === event.toolUseId
      && update.eventHash === event.taskUpdateEventHash
      && hostAppliedTaskUpdate(update)
      && seq(update) < seq(event));
  };
  const modernIdentity = (agentId) => {
    const name = agentId.replace(/^teammate:/, "");
    const teammateNameHash = hash(`teammate-name\0${name}`);
    const capabilities = events.filter((event) =>
      event.type === "team_spawn_capability_observed"
      && event.requestedNameHash === teammateNameHash);
    if (capabilities.some((event) => event.status === "async_launched")) {
      return { attempted: true, error: "host reported async_launched, not teammate_spawned" };
    }
    const requests = events.filter((event) => event.type === "team_spawn_requested"
      && event.teammateNameHash === teammateNameHash);
    const bindings = events.filter((event) => event.type === "team_identity_bound"
      && event.teammateNameHash === teammateNameHash);
    const attempted = requests.length > 0 || bindings.length > 0 || capabilities.length > 0;
    for (const binding of bindings) {
      if (binding.status !== "teammate_spawned") continue;
      const request = requests.find((candidate) =>
        candidate.spawnIntentHash === binding.spawnIntentHash
        && candidate.toolUseIdHash === binding.toolUseIdHash
        && candidate.taskLinkStatus === "unique-owned-team-task");
      if (!request) continue;
      if (strictEventHash(request) !== request.eventHash
        || strictEventHash(binding) !== binding.eventHash) continue;
      const delegation = events.find((event) => event.type === "team_delegation_bound"
        && event.delegationBindingHash === request.delegationBindingHash
        && event.taskDefinitionHash === request.taskDefinitionHash
        && event.teamTaskIdHash === request.teamTaskIdHash
        && event.toolUseIdHash === request.toolUseIdHash
        && event.teammateNameHash === request.teammateNameHash
        && event.directPromptBound === true
        && seq(event) < seq(request));
      if (requireTeammateSpawnBinding && (!request.delegationBindingHash
        || !request.taskDefinitionHash || !delegation
        || strictEventHash(delegation) !== delegation.eventHash)) continue;
      const expectedIntentHash = hash(canonicalizeStrict({
        key: request.toolUseIdHash,
        teammateNameHash: request.teammateNameHash,
        promptHash: request.promptHash,
        parentAgentIdHash: request.parentAgentIdHash,
        spawnDelegationIdHash: request.spawnDelegationIdHash ?? null,
        teamTaskIdHash: request.teamTaskIdHash ?? null,
        taskLinkStatus: request.taskLinkStatus,
        delegationBindingHash: request.delegationBindingHash ?? null,
        taskDefinitionHash: request.taskDefinitionHash ?? null,
      }));
      if (expectedIntentHash !== request.spawnIntentHash) continue;
      const capability = capabilities.find((candidate) =>
        candidate.toolUseId === binding.toolUseId
        || (candidate.toolUseId != null
          && hash(`agent-tool-use\0${candidate.toolUseId}`) === binding.toolUseIdHash));
      if (!capability || capability.status !== "teammate_spawned"
        || capability.bindable !== true
        || strictEventHash(capability) !== capability.eventHash) continue;
      const registration = bySeq.get(Number(binding.rawRegistrationSeq));
      const rawContext = bySeq.get(Number(binding.rawContextSeq));
      if (!registration || registration.type !== "agent_registered"
        || !["subagent", "agent"].includes(registration.agentKind)
        || registration.eventHash !== binding.rawRegistrationEventHash
        || strictEventHash(registration) !== registration.eventHash) continue;
      if (!rawContext || rawContext.type !== "subagent_context_injected"
        || rawContext.agentId !== registration.agentId
        || rawContext.eventHash !== binding.rawContextEventHash
        || strictEventHash(rawContext) !== rawContext.eventHash) continue;
      if (hash(`host-agent\0${registration.agentId}`) !== binding.agentIdHash) continue;
      if (!(seq(request) < seq(registration)
        && seq(registration) < seq(rawContext)
        && seq(rawContext) < seq(binding)
        && seq(request) < seq(capability)
        && seq(capability) < seq(binding))) continue;
      const canonicalAgentIdHash = hash(`canonical-agent\0${agentId}`);
      const expectedBindingHash = hash(canonicalizeStrict({
        spawnIntentHash: request.spawnIntentHash,
        teammateNameHash,
        agentIdHash: binding.agentIdHash,
        canonicalAgentIdHash,
      }));
      if (binding.identityBindingHash !== expectedBindingHash
        || binding.canonicalAgentIdHash !== canonicalAgentIdHash
        || binding.teamTaskIdHash !== request.teamTaskIdHash
        || binding.spawnDelegationIdHash !== request.spawnDelegationIdHash) continue;
      const teamTaskIds = [...createdTasks]
        .filter((taskId) => hash(`task\0${taskId}`) === request.teamTaskIdHash);
      if (teamTaskIds.length !== 1) continue;
      return {
        attempted: true,
        evidence: {
          binding,
          request,
          delegation,
          capability,
          rawRegistration: registration,
          rawContext,
          rawAgentIdHash: binding.agentIdHash,
          teamTaskId: teamTaskIds[0],
        },
      };
    }
    return { attempted, error: attempted ? "append-only teammate binding chain is invalid" : null };
  };
  const teammateChains = [];
  const modernRawAgentHashes = [];
  for (const agentId of requiredIds) {
    const modern = modernIdentity(agentId);
    const legacyRegistration = registrations.get(agentId);
    const legacyValid = legacyRegistration?.agentKind === "teammate"
      && legacyRegistration.identityProvenanceHash
      && Array.isArray(legacyRegistration.lineageHashes)
      && legacyRegistration.lineageHashes.length > 0;
    if (modern.error) {
      errors.push(`real host identity evidence missing: ${agentId} (${modern.error})`);
      continue;
    }
    if (!modern.evidence && (!legacyValid || requireTeammateSpawnBinding)) {
      errors.push(`real host identity evidence missing: ${agentId}`);
      continue;
    }
    const registration = modern.evidence?.rawRegistration ?? legacyRegistration;
    if (modern.evidence) modernRawAgentHashes.push(modern.evidence.rawAgentIdHash);
    const context = events.find((event) => event.type === "teammate_context_injected"
      && event.agentId === agentId && event.oncePerAgent === true
      && event.identityProvenanceHash
      && (modern.evidence
        ? event.identityProvenanceHash === modern.evidence.binding.identityBindingHash
          && event.identityLineageHash == null && seq(event) > seq(modern.evidence.binding)
        : event.identityLineageHash
          && legacyRegistration.lineageHashes.some((lineage) =>
            lineage.hash === event.identityLineageHash)));
    const firstAction = modern.evidence
      ? events.find((event) => {
        if (event.type !== "boundary_reached" || event.boundary !== "PostToolUse"
          || event.agentId !== agentId) return false;
        const pre = events.find((candidate) => candidate.type === "boundary_reached"
          && candidate.boundary === "PreToolUse" && candidate.toolUseId === event.toolUseId
          && candidate.agentId === agentId && seq(candidate) < seq(event));
        /* A Post may close an Edit that began under the raw subagent identity
           before the teammate receipt bound it.  That in-flight action is
           protected by the raw SubagentStart context; canonical context is due
           before the first newly-started canonical action, not before that
           crossing Post. */
        return pre && seq(pre) > seq(modern.evidence.binding);
      })
      : events.find((event) => event.agentId === agentId
        && (event.type === "confirmed_file_touch"
          || (event.type === "boundary_reached" && event.boundary !== "PreToolUse")));
    if (!context || (firstAction && seq(context) >= seq(firstAction))) {
      errors.push(`frozen mandate was not injected before first teammate action: ${agentId}`);
    }
    const ownerships = events.filter((event) => event.type === "task_graph_updated"
      && normalizedOwner(event.owner) === agentId
      && !["completed", "cancelled", "deleted"].includes(String(event.status ?? ""))
      && createdTasks.has(event.taskId)
      && (!modern.evidence || event.taskId === modern.evidence.teamTaskId));
    let chain = null;
    for (const ownership of ownerships) {
      if (modern.evidence) {
        if (!hostAppliedTaskUpdate(ownership)) continue;
      }
      const expectedFile = expectedFilesByTeammate[agentId.replace(/^teammate:/, "")];
      const expectedInitialHash = initialFileHashesByTeammate[agentId.replace(/^teammate:/, "")];
      const touch = events.find((event) => {
        const direct = event.type === "confirmed_file_touch" && event.agentId === agentId
          && Array.isArray(event.taskIds) && event.taskIds.length === 1
          && event.taskIds[0] === ownership.taskId;
        const reconciled = modern.evidence && event.type === "team_prebinding_effect_reconciled"
          && event.agentId === agentId
          && event.identityBindingHash === modern.evidence.binding.identityBindingHash
          && event.teamTaskIdHash === hash(`task\0${ownership.taskId}`);
        if (!direct && !reconciled) return false;
        if (expectedFile && event.file !== expectedFile) return false;
        if (expectedInitialHash && event.beforeHash !== expectedInitialHash) return false;
        if (modern.evidence) {
          if (event.executed !== true || event.changed !== true
            || !event.toolUseId || !event.beforeHash || !event.afterHash
            || event.beforeHash === event.afterHash
            || strictEventHash(event) !== event.eventHash) return false;
          if (direct) {
            const pre = bySeq.get(Number(event.preBoundarySeq));
            const post = bySeq.get(Number(event.postBoundarySeq));
            const preActorMatches = pre?.agentId === agentId
              || (event.identityBindingHash === modern.evidence.binding.identityBindingHash
                && pre?.agentId === modern.evidence.rawRegistration.agentId);
            if (!pre || pre.type !== "boundary_reached" || pre.boundary !== "PreToolUse"
              || !preActorMatches || pre.toolUseId !== event.toolUseId
              || pre.eventHash !== event.preBoundaryEventHash
              || strictEventHash(pre) !== pre.eventHash) return false;
            if (!post || post.type !== "boundary_reached" || post.boundary !== "PostToolUse"
              || post.agentId !== agentId || post.toolUseId !== event.toolUseId
              || post.eventHash !== event.postBoundaryEventHash
              || strictEventHash(post) !== post.eventHash
              || (post.exit != null && Number(post.exit) !== 0)) return false;
            const directOrder = pre.agentId === agentId
              ? seq(modern.evidence.binding) < seq(pre)
              : seq(pre) < seq(modern.evidence.binding)
                && seq(modern.evidence.binding) < seq(post);
            if (!(directOrder && seq(pre) < seq(post) && seq(post) < seq(event))) return false;
          } else {
            const rawTouch = bySeq.get(Number(event.rawTouchSeq));
            const bindingEvent = bySeq.get(Number(event.bindingSeq));
            if (!rawTouch || rawTouch.type !== "confirmed_file_touch"
              || rawTouch.eventHash !== event.rawTouchEventHash
              || strictEventHash(rawTouch) !== rawTouch.eventHash
              || rawTouch.agentId !== modern.evidence.rawRegistration.agentId
              || rawTouch.toolUseId !== event.toolUseId
              || rawTouch.file !== event.file
              || rawTouch.executed !== true || rawTouch.changed !== true) return false;
            const rawPre = bySeq.get(Number(rawTouch.preBoundarySeq));
            const rawPost = bySeq.get(Number(rawTouch.postBoundarySeq));
            if (!rawPre || rawPre.type !== "boundary_reached" || rawPre.boundary !== "PreToolUse"
              || rawPre.agentId !== modern.evidence.rawRegistration.agentId
              || rawPre.toolUseId !== rawTouch.toolUseId
              || rawPre.eventHash !== rawTouch.preBoundaryEventHash
              || strictEventHash(rawPre) !== rawPre.eventHash) return false;
            if (!rawPost || rawPost.type !== "boundary_reached" || rawPost.boundary !== "PostToolUse"
              || rawPost.agentId !== modern.evidence.rawRegistration.agentId
              || rawPost.toolUseId !== rawTouch.toolUseId
              || rawPost.eventHash !== rawTouch.postBoundaryEventHash
              || strictEventHash(rawPost) !== rawPost.eventHash
              || rawPost.exit == null || Number(rawPost.exit) !== 0) return false;
            if (!bindingEvent || bindingEvent !== modern.evidence.binding
              || bindingEvent.eventHash !== event.bindingEventHash) return false;
            if (!(seq(modern.evidence.rawContext) < seq(rawPre)
              && seq(rawPre) < seq(rawPost) && seq(rawPost) < seq(rawTouch)
              && seq(rawTouch) < seq(bindingEvent) && seq(bindingEvent) < seq(event))) return false;
          }
        }
        const latestBeforeEffect = events.filter((candidate) =>
          candidate.type === "task_graph_updated" && candidate.taskId === ownership.taskId
          && seq(candidate) <= seq(event)).sort((left, right) => seq(right) - seq(left))[0];
        if (normalizedOwner(latestBeforeEffect?.owner) !== agentId
          || ["completed", "cancelled", "deleted"].includes(String(latestBeforeEffect?.status ?? ""))) {
          return false;
        }
        if (modern.evidence && events.some((candidate) => {
          if (!["confirmed_file_touch", "team_prebinding_effect_reconciled"].includes(candidate.type)
            || candidate.file !== event.file || candidate.agentId === agentId) return false;
          if (candidate.type === "confirmed_file_touch"
            && isAuditedCrossOwnerCorrectionEffect(events, candidate)) return false;
          return !(reconciled && candidate.type === "confirmed_file_touch"
            && Number(candidate.seq) === Number(event.rawTouchSeq));
        })) return false;
        return true;
      });
      if (!touch) continue;
      const completion = events.find((event) => event.type === "team_task_completed"
        && event.agentId === agentId && event.taskId === ownership.taskId
        && event.independentlyVerified === true && seq(event) > seq(touch));
      if (!completion) continue;
      if (modern.evidence) {
        const intentEvent = bySeq.get(Number(completion.completionIntentEventSeq));
        const completionPre = bySeq.get(Number(completion.preBoundarySeq));
        const completionPost = bySeq.get(Number(completion.postBoundarySeq));
        const pendingVerification = events.find((event) =>
          event.type === "task_completion_verified_pending_host"
          && event.completionIntentHash === completion.completionIntentHash
          && event.taskId === ownership.taskId && event.agentId === agentId);
        const completionIntentBody = intentEvent ? {
          toolUseIdHash: intentEvent.toolUseIdHash,
          taskIdHash: hash(`task\0${ownership.taskId}`),
          agentIdHash: hash(`completion-agent\0${agentId}`),
          identityBindingHash: modern.evidence.binding.identityBindingHash,
          preBoundarySeq: intentEvent.preBoundarySeq,
          preBoundaryEventHash: intentEvent.preBoundaryEventHash,
        } : null;
        if (completionIntentBody && (intentEvent.taskGeneration != null
          || completion.taskGeneration != null)) {
          completionIntentBody.taskGeneration = Math.max(1,
            Number(completion.taskGeneration ?? intentEvent.taskGeneration ?? 1));
        }
        const expectedCompletionIntentHash = completionIntentBody
          ? hash(canonicalizeStrict(completionIntentBody)) : null;
        if (!completion.completionIntentHash
          || strictEventHash(completion) !== completion.eventHash
          || completion.identityBindingHash !== modern.evidence.binding.identityBindingHash
          || completion.postHostSucceeded !== true
          || !intentEvent || intentEvent.type !== "task_completion_intent_recorded"
          || intentEvent.completionIntentHash !== completion.completionIntentHash
          || intentEvent.completionIntentHash !== expectedCompletionIntentHash
          || intentEvent.toolUseIdHash !== hash(`task-completion-tool-use\0${completion.toolUseId}`)
          || intentEvent.eventHash !== completion.completionIntentEventHash
          || strictEventHash(intentEvent) !== intentEvent.eventHash
          || intentEvent.identityBindingHash !== modern.evidence.binding.identityBindingHash
          || !completionPre || completionPre.type !== "boundary_reached"
          || completionPre.boundary !== "PreToolUse" || completionPre.tool !== "TaskUpdate"
          || completionPre.agentId !== agentId || completionPre.toolUseId !== completion.toolUseId
          || completionPre.eventHash !== completion.preBoundaryEventHash
          || strictEventHash(completionPre) !== completionPre.eventHash
          || !completionPost || completionPost.type !== "boundary_reached"
          || completionPost.boundary !== "PostToolUse" || completionPost.tool !== "TaskUpdate"
          || completionPost.agentId !== agentId || completionPost.toolUseId !== completion.toolUseId
          || completionPost.eventHash !== completion.postBoundaryEventHash
          || strictEventHash(completionPost) !== completionPost.eventHash
          || !pendingVerification || pendingVerification.independentlyVerified !== true
          || strictEventHash(pendingVerification) !== pendingVerification.eventHash
          || pendingVerification.completionIntentHash !== completion.completionIntentHash
          || pendingVerification.identityBindingHash !== modern.evidence.binding.identityBindingHash
          || Number(intentEvent.taskGeneration ?? 1)
            !== Math.max(1, Number(completion.taskGeneration ?? 1))
          || Number(pendingVerification.taskGeneration ?? 1)
            !== Math.max(1, Number(completion.taskGeneration ?? 1))
          || !(seq(modern.evidence.binding) < seq(completionPre)
            && seq(completionPre) < seq(intentEvent)
            && seq(intentEvent) < seq(pendingVerification)
            && seq(pendingVerification) < seq(completionPost)
            && seq(completionPost) < seq(completion))) continue;
      }
      const expectedCheck = expectedChecksByTeammate[agentId.replace(/^teammate:/, "")];
      const verification = events.find((event) => event.type === "boundary_reached"
        && event.boundary === "PostToolUse" && event.agentId === agentId
        && event.isTest === true && event.exit != null && Number(event.exit) === 0
        && matchesExpectedCheck(event, agentId, expectedCheck)
        && seq(event) > seq(touch) && seq(event) < seq(completion));
      if (modern.evidence && !verification) continue;
      const latestOwner = events.filter((event) => event.type === "task_graph_updated"
        && event.taskId === ownership.taskId && seq(event) <= seq(completion))
        .sort((left, right) => seq(right) - seq(left))[0];
      if (normalizedOwner(latestOwner?.owner) !== agentId) continue;
      chain = { agentId, taskId: ownership.taskId, registrationSeq: seq(registration),
        contextSeq: seq(context), ownershipSeq: seq(ownership), touchSeq: seq(touch),
        verificationSeq: verification ? seq(verification) : null,
        completionSeq: seq(completion), file: touch.file ?? null,
        identityMode: modern.evidence ? "host-teammate-spawn-binding" : "lifecycle-lineage",
        identityBindingHash: modern.evidence?.binding.identityBindingHash ?? null,
        delegationBindingHash: modern.evidence?.delegation?.delegationBindingHash ?? null,
        taskDefinitionHash: modern.evidence?.delegation?.taskDefinitionHash ?? null,
        delegationBindingSeq: modern.evidence?.delegation
          ? seq(modern.evidence.delegation) : null,
        rawAgentIdHash: modern.evidence?.rawAgentIdHash ?? null,
        completionToolUseId: modern.evidence ? completion.toolUseId : null,
        completionIntentHash: modern.evidence ? completion.completionIntentHash : null,
        taskGeneration: Math.max(1, Number(completion.taskGeneration ?? 1)),
        reopenSeqs: [] };
      break;
    }
    if (chain) {
      const reopens = events.filter((event) => event.type === "team_task_reopened"
        && event.taskId === chain.taskId && seq(event) > chain.completionSeq)
        .sort((left, right) => seq(left) - seq(right));
      let generation = chain.taskGeneration;
      let priorCompletionSeq = chain.completionSeq;
      for (const [reopenIndex, reopen] of reopens.entries()) {
        const nextGeneration = generation + 1;
        const nextReopenSeq = reopens[reopenIndex + 1]
          ? seq(reopens[reopenIndex + 1]) : Infinity;
        if (!validReopen(reopen, chain.taskId, agentId, nextGeneration)) {
          errors.push(`invalid teammate task reopen evidence: ${agentId} generation ${nextGeneration}`);
          chain = null;
          break;
        }
        const effectsBeforeReopen = events.some((event) =>
          ["confirmed_file_touch", "team_prebinding_effect_reconciled"].includes(event.type)
          && event.agentId === agentId && seq(event) > priorCompletionSeq && seq(event) < seq(reopen));
        if (effectsBeforeReopen) {
          errors.push(`teammate acted after completion before a lead reopen: ${agentId}`);
          chain = null;
          break;
        }
        const expectedFile = expectedFilesByTeammate[agentId.replace(/^teammate:/, "")];
        const touch = events.find((event) => event.type === "confirmed_file_touch"
          && event.agentId === agentId && Array.isArray(event.taskIds)
          && event.taskIds.length === 1 && event.taskIds[0] === chain.taskId
          && (!expectedFile || event.file === expectedFile)
          && event.executed === true && event.changed === true
          && event.toolUseId && event.beforeHash && event.afterHash
          && event.beforeHash !== event.afterHash
          && strictEventHash(event) === event.eventHash
          && seq(event) > seq(reopen) && seq(event) < nextReopenSeq);
        if (!touch) {
          errors.push(`reopened teammate generation has no confirmed effect: ${agentId}`);
          chain = null;
          break;
        }
        const touchPre = bySeq.get(Number(touch.preBoundarySeq));
        const touchPost = bySeq.get(Number(touch.postBoundarySeq));
        if (modern.evidence && (!touchPre || touchPre.type !== "boundary_reached"
          || touchPre.boundary !== "PreToolUse" || touchPre.agentId !== agentId
          || touchPre.toolUseId !== touch.toolUseId
          || touchPre.eventHash !== touch.preBoundaryEventHash
          || strictEventHash(touchPre) !== touchPre.eventHash
          || !touchPost || touchPost.type !== "boundary_reached"
          || touchPost.boundary !== "PostToolUse" || touchPost.agentId !== agentId
          || touchPost.toolUseId !== touch.toolUseId
          || touchPost.eventHash !== touch.postBoundaryEventHash
          || strictEventHash(touchPost) !== touchPost.eventHash
          || (touchPost.exit != null && Number(touchPost.exit) !== 0)
          || !(seq(reopen) < seq(touchPre) && seq(touchPre) < seq(touchPost)
            && seq(touchPost) < seq(touch)))) {
          errors.push(`reopened teammate effect evidence is invalid: ${agentId}`);
          chain = null;
          break;
        }
        const completion = events.find((event) => event.type === "team_task_completed"
          && event.agentId === agentId && event.taskId === chain.taskId
          && event.independentlyVerified === true
          && Math.max(1, Number(event.taskGeneration ?? 1)) === nextGeneration
          && strictEventHash(event) === event.eventHash
          && seq(event) > seq(touch) && seq(event) < nextReopenSeq);
        if (!completion) {
          errors.push(`reopened teammate generation has no verified completion: ${agentId}`);
          chain = null;
          break;
        }
        const intentEvent = bySeq.get(Number(completion.completionIntentEventSeq));
        const completionPre = bySeq.get(Number(completion.preBoundarySeq));
        const completionPost = bySeq.get(Number(completion.postBoundarySeq));
        const pendingVerification = events.find((event) =>
          event.type === "task_completion_verified_pending_host"
          && event.completionIntentHash === completion.completionIntentHash
          && event.taskId === chain.taskId && event.agentId === agentId
          && Number(event.taskGeneration ?? 1) === nextGeneration);
        const expectedCompletionIntentHash = intentEvent ? hash(canonicalizeStrict({
          toolUseIdHash: intentEvent.toolUseIdHash,
          taskIdHash: hash(`task\0${chain.taskId}`),
          agentIdHash: hash(`completion-agent\0${agentId}`),
          identityBindingHash: modern.evidence?.binding.identityBindingHash ?? null,
          taskGeneration: nextGeneration,
          preBoundarySeq: intentEvent.preBoundarySeq,
          preBoundaryEventHash: intentEvent.preBoundaryEventHash,
        })) : null;
        if (modern.evidence && (!completion.completionIntentHash
          || completion.identityBindingHash !== modern.evidence.binding.identityBindingHash
          || completion.postHostSucceeded !== true
          || !intentEvent || intentEvent.type !== "task_completion_intent_recorded"
          || intentEvent.completionIntentHash !== expectedCompletionIntentHash
          || intentEvent.eventHash !== completion.completionIntentEventHash
          || strictEventHash(intentEvent) !== intentEvent.eventHash
          || Number(intentEvent.taskGeneration ?? 1) !== nextGeneration
          || !pendingVerification || pendingVerification.independentlyVerified !== true
          || strictEventHash(pendingVerification) !== pendingVerification.eventHash
          || !completionPre || completionPre.type !== "boundary_reached"
          || completionPre.boundary !== "PreToolUse" || completionPre.tool !== "TaskUpdate"
          || completionPre.agentId !== agentId || completionPre.toolUseId !== completion.toolUseId
          || completionPre.eventHash !== completion.preBoundaryEventHash
          || strictEventHash(completionPre) !== completionPre.eventHash
          || !completionPost || completionPost.type !== "boundary_reached"
          || completionPost.boundary !== "PostToolUse" || completionPost.tool !== "TaskUpdate"
          || completionPost.agentId !== agentId || completionPost.toolUseId !== completion.toolUseId
          || completionPost.eventHash !== completion.postBoundaryEventHash
          || strictEventHash(completionPost) !== completionPost.eventHash
          || !(seq(reopen) < seq(completionPre)
            && seq(completionPre) < seq(intentEvent)
            && seq(intentEvent) < seq(pendingVerification)
            && seq(pendingVerification) < seq(completionPost)
            && seq(completionPost) < seq(completion)))) {
          errors.push(`reopened teammate completion evidence is invalid: ${agentId}`);
          chain = null;
          break;
        }
        const expectedCheck = expectedChecksByTeammate[agentId.replace(/^teammate:/, "")];
        const verification = events.find((event) => event.type === "boundary_reached"
          && event.boundary === "PostToolUse" && event.agentId === agentId
          && event.isTest === true && event.exit != null && Number(event.exit) === 0
          && matchesExpectedCheck(event, agentId, expectedCheck)
          && seq(event) > seq(touch) && seq(event) < seq(completion)
          && strictEventHash(event) === event.eventHash);
        if (modern.evidence && !verification) {
          errors.push(`reopened teammate generation has no successful slice check: ${agentId}`);
          chain = null;
          break;
        }
        generation = nextGeneration;
        priorCompletionSeq = seq(completion);
        chain = { ...chain, touchSeq: seq(touch),
          verificationSeq: verification ? seq(verification) : null,
          completionSeq: seq(completion), completionToolUseId: completion.toolUseId ?? null,
          completionIntentHash: completion.completionIntentHash ?? null,
          taskGeneration: generation, reopenSeqs: [...chain.reopenSeqs, seq(reopen)] };
      }
    }
    if (!chain) errors.push(`owned teammate task chain missing: ${agentId}`);
    else teammateChains.push(chain);
  }
  if (new Set(modernRawAgentHashes).size !== modernRawAgentHashes.length) {
    errors.push("required teammates do not have distinct raw host agent identities");
  }
  if (new Set(teammateChains.map((chain) => chain.taskId)).size !== teammateChains.length) {
    errors.push("required teammates do not own distinct tasks");
  }
  if (new Set(teammateChains.map((chain) => chain.file).filter(Boolean)).size
    !== teammateChains.filter((chain) => chain.file).length) {
    errors.push("required teammates do not have distinct confirmed file effects");
  }
  if (createdTasks.size < minimumTasks) errors.push("required team task graph was not created");
  if (exactTaskCount != null && createdTasks.size !== Number(exactTaskCount)) {
    errors.push(`team task graph cardinality mismatch: expected ${Number(exactTaskCount)}, got ${createdTasks.size}`);
  }
  const modernBindingCount = events.filter((event) => event.type === "team_identity_bound"
    && event.status === "teammate_spawned").length;
  if (exactTeammateBindingCount != null
    && modernBindingCount !== Number(exactTeammateBindingCount)) {
    errors.push(`teammate binding cardinality mismatch: expected ${Number(exactTeammateBindingCount)}, got ${modernBindingCount}`);
  }
  if (exactTeammateBindingCount != null) {
    const canonicalTeammateIds = new Set();
    for (const event of events) {
      if (String(event?.agentId ?? "").startsWith("teammate:")) {
        canonicalTeammateIds.add(event.agentId);
      }
      const owner = normalizedOwner(event?.owner);
      if (owner?.startsWith("teammate:")) canonicalTeammateIds.add(owner);
    }
    const unexpected = [...canonicalTeammateIds]
      .filter((agentId) => !requiredIds.includes(agentId) && agentId !== "teammate:lead");
    if (unexpected.length) {
      errors.push(`unexpected canonical teammates were observed: ${unexpected.sort().join(",")}`);
    }
    for (const chain of teammateChains) {
      const expectedFile = expectedFilesByTeammate[chain.agentId.replace(/^teammate:/, "")];
      const effects = events.filter((event) =>
        ["confirmed_file_touch", "team_prebinding_effect_reconciled"].includes(event.type)
        && event.agentId === chain.agentId);
      if (expectedFile && effects.some((event) => event.file !== expectedFile)) {
        errors.push(`teammate modified a file outside its frozen slice: ${chain.agentId}`);
      }
      if (effects.some((event) => seq(event) > chain.completionSeq)) {
        errors.push(`teammate modified its slice after task completion: ${chain.agentId}`);
      }
    }
  }

  let integrationChain = null;
  if (requireIntegration) {
    const integrationEvents = events.filter((event) =>
      event.type === "multi_agent_integration_verified");
    if (exactIntegrationCount != null
      && integrationEvents.length !== Number(exactIntegrationCount)) {
      errors.push(`integration cardinality mismatch: expected ${Number(exactIntegrationCount)}, got ${integrationEvents.length}`);
    }
    const dependencyIds = teammateChains.map((chain) => chain.taskId);
    const allTeammatesDoneAt = teammateChains.length === requiredIds.length
      ? Math.max(...teammateChains.map((chain) => chain.completionSeq)) : Infinity;
    const ready = [...events].reverse().find((event) => event.type === "coordination_ready_at_stop");
    for (const integration of events.filter((event) =>
      event.type === "multi_agent_integration_verified" && createdTasks.has(event.taskId)
      && ["main", "lead"].includes(event.agentId))) {
      const owner = events.filter((event) => event.type === "task_graph_updated"
        && event.taskId === integration.taskId && seq(event) < seq(integration))
        .sort((left, right) => seq(right) - seq(left))[0];
      if (!owner || !["lead", "main"].includes(normalizedOwner(owner.owner))
        || !Array.isArray(owner.blockedBy)
        || !dependencyIds.every((taskId) => owner.blockedBy.includes(taskId))
        || (requireTeammateSpawnBinding && !hostAppliedTaskUpdate(owner))
        || seq(integration) <= allTeammatesDoneAt || !ready || seq(integration) >= seq(ready)) continue;
      const integrationCheck = events.find((event) => event.type === "boundary_reached"
        && event.boundary === "PostToolUse" && ["main", "lead"].includes(event.agentId)
        && event.isTest === true && event.exit != null && Number(event.exit) === 0
        && matchesExpectedCheck(event, event.agentId, expectedIntegrationCheck,
          requiredIds.map((agentId) => expectedChecksByTeammate[
            agentId.replace(/^teammate:/, "")]).filter(Boolean))
        && seq(event) > allTeammatesDoneAt && seq(event) < seq(integration)
        && strictEventHash(event) === event.eventHash
        && events.some((pre) => pre.type === "boundary_reached"
          && pre.boundary === "PreToolUse" && pre.agentId === event.agentId
          && pre.toolUseId === event.toolUseId && seq(pre) < seq(event)
          && strictEventHash(pre) === pre.eventHash));
      if (requireTeammateSpawnBinding && !integrationCheck) continue;
      const integrationAcceptance = bySeq.get(Number(integration.acceptanceSeq));
      const integrationOutcome = bySeq.get(Number(integration.outcomeVerdictSeq));
      const integrationAudit = bySeq.get(Number(integration.approvalAuditSeq));
      const integrationCheckPrecedesAcceptance = integration.interventionId
        ? seq(integrationCheck) < seq(integration)
        : seq(integrationCheck) < seq(integrationAcceptance);
      const integrationInterventionResolved = !integration.interventionId || events.some((event) =>
        event.type === "intervention_resolved"
        && event.interventionId === integration.interventionId
        && event.correctionAuthorityHash === integration.correctionAuthorityHash
        && event.correctionObserved === true && event.effectObserved === true
        && seq(event) > seq(integrationOutcome ?? {}) && seq(event) < seq(integration));
      const integrationProofBound = Boolean(
        Number(integration.acceptanceExit) === 0
        && typeof integration.finalFingerprint === "string"
        && integrationAcceptance?.type === "acceptance_finished"
        && integrationAcceptance.phase === "integration"
        && integrationAcceptance.ran === true
        && integrationAcceptance.passed === true
        && Number(integrationAcceptance.exit) === 0
        && integrationAcceptance.finalFingerprint === integration.finalFingerprint
        && strictEventHash(integrationAcceptance) === integrationAcceptance.eventHash
        && integrationOutcome?.type === "outcome_verdict"
        && integrationOutcome.phase === "integration"
        && integrationOutcome.passed === true
        && integrationOutcome.approvalAuditSeq === integration.approvalAuditSeq
        && integrationOutcome.finalFingerprint === integration.finalFingerprint
        && strictEventHash(integrationOutcome) === integrationOutcome.eventHash
        && integrationAudit?.type === "outcome_approval_audit"
        && integrationAudit.passed === true
        && integrationAudit.finalFingerprint === integration.finalFingerprint
        && strictEventHash(integrationAudit) === integrationAudit.eventHash
        && integrationCheckPrecedesAcceptance
        && seq(integrationAcceptance) < seq(integrationAudit)
        && seq(integrationAudit) < seq(integrationOutcome)
        && seq(integrationOutcome) < seq(integration)
        && integrationInterventionResolved);
      if (requireTeammateSpawnBinding && !integrationProofBound) continue;
      integrationChain = { taskId: integration.taskId, ownerSeq: seq(owner),
        dependencyTaskIds: dependencyIds, verifiedSeq: seq(integration), readySeq: seq(ready),
        checkSeq: integrationCheck ? seq(integrationCheck) : null,
        checkToolUseId: integrationCheck?.toolUseId ?? null,
        acceptanceSeq: integrationAcceptance?.seq ?? null,
        acceptanceExit: integrationAcceptance?.exit ?? null,
        outcomeVerdictSeq: integrationOutcome?.seq ?? null,
        approvalAuditSeq: integrationAudit?.seq ?? null,
        interventionId: integration.interventionId ?? null,
        correctionAuthorityHash: integration.correctionAuthorityHash ?? null,
        finalFingerprint: integration.finalFingerprint ?? null };
      break;
    }
    if (!integrationChain) {
      errors.push("lead integration is not bound to both completed teammate tasks before Stop");
    }
  }
  return {
    ok: errors.length === 0,
    requiredTeammateIds: requiredIds,
    teammateChains,
    integrationChain,
    registeredAgentIds: [...new Set([...registrations.keys(),
      ...teammateChains.map((chain) => chain.agentId)])],
    identityConflicts: conflicts.length,
    taskCount: createdTasks.size,
    errors,
  };
}
