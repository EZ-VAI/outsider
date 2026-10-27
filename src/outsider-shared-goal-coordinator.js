import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { canonicalizeStrict } from './canonical.js';
import { compileExecutionOnlyProgramV3, verifyExecutableOutcomeProgram } from './outsider-outcome-program-v1.js';
import { createDurableOutcomeProgramOrchestratorV1 } from './outsider-durable-outcome-program-orchestrator-v1.js';
import { createSharedResourceCoordinator } from './outsider-shared-resource-coordinator.js';
import { publishPrivateExecutionBytes, withUserHeldExecutionLockV2 } from './outsider-user-held-durable-execution-v2.js';

const hash = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;
const copy = value => JSON.parse(canonicalizeStrict(value));
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/u.test(value);
const fail = code => { throw Object.assign(new Error(`SHARED_GOAL_${code}`), { code: `SHARED_GOAL_${code}` }); };
const FINAL = 'goal_acceptance';
const terminal = state => ['SUCCEEDED', 'FAILED_CLOSED', 'UNAVAILABLE'].includes(state);

function compileGoal(input, now) {
  const goal = copy(input);
  if (!id(goal.goalId) || typeof goal.goal !== 'string' || !goal.goal.trim() || goal.goal.length > 16_000
    || !Array.isArray(goal.tasks) || !goal.tasks.length || goal.tasks.length > 64
    || !Number.isFinite(Date.parse(goal.completionDeadline)) || Date.parse(goal.completionDeadline) <= now + 1000
    || goal.budget && goal.budget.maximumAmountMinor !== '0') fail('DEFINITION_INVALID');
  const tasks = goal.tasks.map(task => {
    if (!id(task.taskId) || task.taskId === FINAL || typeof task.title !== 'string' || !task.title.trim()
      || !Array.isArray(task.dependsOn) || !task.dependsOn.every(id)
      || task.allowedActorIds !== undefined && (!Array.isArray(task.allowedActorIds) || !task.allowedActorIds.every(id))
      || task.resourceIds !== undefined && (!Array.isArray(task.resourceIds) || !task.resourceIds.every(id))) fail('TASK_INVALID');
    return { taskId: task.taskId, title: task.title, dependsOn: task.dependsOn,
      allowedActorIds: task.allowedActorIds ?? [], resourceIds: task.resourceIds ?? [], input: task.input ?? null };
  });
  if (new Set(tasks.map(task => task.taskId)).size !== tasks.length
    || tasks.some(task => ['constructor', 'prototype'].includes(task.taskId))) fail('TASK_INVALID');
  const definition = { goalId: goal.goalId, goal: goal.goal, completionDeadline: new Date(goal.completionDeadline).toISOString(),
    acceptance: goal.acceptance ?? [], tasks };
  const requirement = (requirementId, role, constraints) => ({ requirementId, role,
    capability: role === 'PRIMARY' ? 'SHARED_AGENT_TASK' : 'OWNER_CONFIGURED_GOAL_VERIFICATION',
    constraints, minimumReservationMs: 1, dependsOnRequirementIds: [] });
  const program = compileExecutionOnlyProgramV3({
    programId: goal.goalId, orderId: goal.goalId, createdAt: new Date(now).toISOString(),
    formationDeadline: new Date(Math.min(now + 60_000, Date.parse(goal.completionDeadline) - 1)).toISOString(),
    completionDeadline: definition.completionDeadline, tenderHash: null,
    commitmentMode: 'EXECUTION_ONLY_NO_OUTCOME_PROMISE',
    outcome: { statement: goal.goal, budget: { currency: 'USD', maximumAmountMinor: '0' },
      acceptance: [{ criterionId: 'goal_verified', comparator: 'OWNER_CONFIGURED_VERIFIER', subject: goal.goal, expected: true }] },
    requirements: [
      requirement('agent_tasks', 'PRIMARY', { admissionMode: 'EXECUTION_PHASE_TRANSACTION', maximumAmountMinor: '0' }),
      requirement('goal_verifier', 'INDEPENDENT_WITNESS', { admissionMode: 'ON_DEMAND_OBSERVATION' }),
    ],
    nodes: [...tasks.map(task => ({ nodeId: task.taskId, kind: 'TRANSACTION', dependsOn: task.dependsOn,
      primaryRequirementId: 'agent_tasks', recoveryRequirementId: null, witnessRequirementId: 'goal_verifier', input: { task }, acceptance: [] })),
    { nodeId: FINAL, kind: 'OBSERVATION', dependsOn: tasks.map(task => task.taskId), primaryRequirementId: null,
      recoveryRequirementId: null, witnessRequirementId: 'goal_verifier', input: { acceptance: definition.acceptance }, acceptance: [] }],
    obligations: [{ obligationId: 'close_goal_work', trigger: 'ALWAYS', targetRequirementId: 'agent_tasks', nodeId: null,
      action: 'Close the local agent work lifecycle; retain the goal record and unresolved external obligations.', deadline: definition.completionDeadline }],
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false },
  });
  return { definition, program };
}

/** Shared task ownership around the existing OutcomeProgram scheduler.
 * Owner-authenticated actors claim work; configured verifiers accept outputs.
 * Leases allocate work, not legal standing, external capacity or payment rights.
 */
export function createSharedGoalCoordinator({ directory, authorize, verifyTask, verifyGoal,
  resources = {}, resourceDirectory, clock = Date.now }) {
  if (!path.isAbsolute(directory ?? '') || ![authorize, verifyTask, verifyGoal, clock].every(value => typeof value === 'function')) fail('CONFIGURATION_INVALID');
  if (Object.keys(resources).length && (!path.isAbsolute(resourceDirectory ?? '')
    || Object.entries(resources).some(([resourceId, resource]) => !id(resourceId)
      || !['observe', 'execute', 'reconcile'].every(name => typeof resource?.adapter?.[name] === 'function')))) fail('RESOURCE_CONFIGURATION_INVALID');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const root = realpathSync(directory), file = path.join(root, 'shared-goal.json');
  const lock = hash({ root, scope: 'shared-goal' });
  const now = () => { const value = clock(); if (!Number.isSafeInteger(value) || value < 0) fail('CLOCK_INVALID'); return value; };
  const save = state => publishPrivateExecutionBytes(file, Buffer.from(canonicalizeStrict(state) + '\n'), { replace: true });
  function load() {
    if (!existsSync(file)) fail('NOT_FOUND');
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.schema !== 'outsider/shared-goal/v1' || hash(state.definition) !== state.definitionHash
      || verifyExecutableOutcomeProgram(state.program).programHash !== state.program.programHash) fail('STATE_INVALID');
    let previousHash = null;
    for (const [index, event] of state.events.entries()) {
      const { eventHash, ...body } = event;
      if (body.sequence !== index + 1 || body.previousHash !== previousHash || hash(body) !== eventHash) fail('AUDIT_CHAIN_INVALID');
      previousHash = eventHash;
    }
    return state;
  }
  function record(state, type, data = {}) {
    const event = { sequence: state.events.length + 1, previousHash: state.events.at(-1)?.eventHash ?? null,
      at: new Date(now()).toISOString(), type, ...data };
    state.events.push({ ...event, eventHash: hash(event) }); save(state);
  }
  async function allowed(actorId, operation, state, task = null, context = {}) {
    if (!id(actorId) || await authorize({ actorId, operation, goal: state?.definition ?? null, task, ...context }) !== true) fail('NOT_AUTHORIZED');
  }
  function assertClaim(state, input) {
    const job = state.jobs[input.taskId];
    if (!Object.hasOwn(state.jobs, input.taskId) || job.status !== 'CLAIMED' || !job.claim
      || job.claim.actorId !== input.actorId || job.claim.leaseId !== input.leaseId
      || job.claim.generation !== input.generation || Date.parse(job.claim.expiresAt) <= now()
      || Date.parse(state.definition.completionDeadline) <= now()) fail('CLAIM_LOST');
    return job;
  }
  const taskFor = (state, taskId) => state.definition.tasks.find(task => task.taskId === taskId);
  const inputsFor = (state, task) => Object.fromEntries(task.dependsOn.map(taskId => [taskId,
    { output: copy(state.jobs[taskId].accepted.output), outputHash: state.jobs[taskId].accepted.outputHash }]));
  let current = null;
  const lifecycle = {
    async release() { return { status: 'RELEASED', receipt: { scope: 'LOCAL_AGENT_QUEUE' } }; },
    async closeObligation() { return { status: 'CLOSED', receipt: { scope: 'LOCAL_AGENT_QUEUE_ONLY' } }; },
  };
  const engine = createDurableOutcomeProgramOrchestratorV1({ directory: path.join(root, 'program'), clock: () => new Date(now()).toISOString(),
    measureOperations: async () => ({ outsiderStaffTouchCount: 0, humanQueueCreated: false, source: 'SHARED_GOAL_COORDINATOR_RUNTIME' }),
    adapters: {
      agents: { ...lifecycle,
        async reserve({ program, operationId }) { return { status: 'READY_FOR_TRANSACTION', reservationId: operationId,
          validUntil: program.completionDeadline, capacityReserved: false, providerReceipt: { transactionSubmitted: false } }; },
        async execute({ node, operationId, dependencyEvidence }) {
          let job = current.jobs[node.nodeId];
          if (!Object.hasOwn(current.jobs, node.nodeId)) {
            job = { taskId: node.nodeId, operationId, status: 'READY', generation: 0, claim: null,
              accepted: null, attempts: [], effects: {}, dependencyEvidence };
            current.jobs[node.nodeId] = job; record(current, 'TASK_READY', { taskId: node.nodeId, operationId });
          }
          if (job.operationId !== operationId) fail('TASK_OPERATION_CHANGED');
          if (!job.accepted) fail('WAITING_FOR_AGENT');
          return { status: 'SUCCEEDED', taskId: node.nodeId, outputHash: job.accepted.outputHash,
            verificationHash: job.accepted.verificationHash };
        } },
      verifier: { ...lifecycle,
        async reserve({ program, operationId }) { return { status: 'READY_ON_DEMAND', reservationId: operationId,
          validUntil: program.completionDeadline, capacityReserved: false, providerReceipt: { source: 'OWNER_CONFIGURED_VERIFIER' } }; },
        async observe({ node }) {
          if (node.nodeId !== FINAL) return current.jobs[node.nodeId]?.accepted
            ? { status: 'SATISFIED', outputHash: current.jobs[node.nodeId].accepted.outputHash,
              verificationHash: current.jobs[node.nodeId].accepted.verificationHash }
            : { status: 'INCONCLUSIVE' };
          let result;
          try { result = copy(await verifyGoal({ goal: copy(current.definition),
            outputs: Object.fromEntries(current.definition.tasks.map(task => [task.taskId, copy(current.jobs[task.taskId].accepted)])) })); }
          catch { result = { accepted: false, reason: 'VERIFIER_UNAVAILABLE' }; }
          current.goalVerification = { ...result, verificationHash: hash(result) };
          record(current, 'GOAL_VERIFIED', { accepted: result.accepted === true, verificationHash: hash(result) });
          return { status: result.accepted === true ? 'SATISFIED' : 'INCONCLUSIVE', verificationHash: hash(result), reason: result.reason ?? null };
        } },
    } });
  async function advance(state) {
    if (!state.active) return;
    current = state;
    try { await engine.run(state.program, { bindings: { agent_tasks: 'agents', goal_verifier: 'verifier' } }); }
    finally { current = null; }
  }
  const locked = operation => withUserHeldExecutionLockV2(lock, async () => operation(load()));
  const effectView = effect => { const { resourceLease, ...receipt } = effect; return copy(receipt); };
  const effectsView = job => Object.fromEntries(Object.entries(job.effects).map(([key, effect]) => [key, effectView(effect)]));
  const resourceActor = (state, input) => `agent-${hash({ root, goalId: state.definition.goalId,
    taskId: input.taskId, actorId: input.actorId, generation: input.generation }).slice(7)}`;
  async function resourceAccess(state, input, action = null) {
    const task = taskFor(state, input.taskId); assertClaim(state, input);
    if (!id(input.resourceId) || !Object.hasOwn(resources, input.resourceId)
      || !task.resourceIds.includes(input.resourceId)) fail('RESOURCE_NOT_ALLOWED');
    await allowed(input.actorId, 'USE_RESOURCE', state, task, { resourceId: input.resourceId, action });
    const resource = resources[input.resourceId];
    if (resource.authorize && await resource.authorize({ actorId: input.actorId, goal: state.definition,
      task, resourceId: input.resourceId, action }) !== true) fail('RESOURCE_NOT_ALLOWED');
    assertClaim(load(), input);
    return resource;
  }
  function resourceHandle(input, scopedActor) {
    const resource = resources[input.resourceId];
    const context = () => ({ goalId: load().definition.goalId, taskId: input.taskId,
      agentId: input.actorId, claimGeneration: input.generation });
    return createSharedResourceCoordinator({ directory: resourceDirectory, resourceId: input.resourceId, clock,
      authorize: async ({ actorId, action }) => {
        if (actorId !== scopedActor) return false;
        await resourceAccess(load(), input, action); return true;
      },
      adapter: { observe: command => resource.adapter.observe({ ...command, ...context() }),
        ...(resource.adapter.capture ? { capture: command => resource.adapter.capture({ ...command, ...context() }) } : {}),
        reconcile: command => resource.adapter.reconcile({ ...command, ...context() }), execute: async command => {
        // Check the task generation again at the owner's dispatch boundary.
        assertClaim(load(), input);
        return resource.adapter.execute({ ...command, ...context(),
          assertCurrentClaim: () => resourceAccess(load(), input, command.action) });
      } },
    });
  }
  async function finishEffect(input, effect, result) {
    return locked(state => {
      const stored = state.jobs[input.taskId]?.effects[input.stepId];
      if (!stored || stored.operationId !== effect.operationId) fail('RESOURCE_OPERATION_CHANGED');
      if (stored.status !== 'RECONCILIATION_REQUIRED') return effectView(stored);
      stored.status = result.status; stored.receipt = copy(result);
      record(state, 'RESOURCE_STEP_UPDATED', { taskId: input.taskId, stepId: input.stepId,
        operationId: stored.operationId, status: stored.status });
      return effectView(stored);
    });
  }
  async function releaseResource(handle, effect) {
    if (!effect.resourceLease) return;
    try { await handle.release(effect.resourceLease); } catch { /* Expiry/restart leaves a bounded lease; never erases an unknown write. */ }
  }
  function view(state) {
    const program = state.active ? engine.inspect(state.program.programId) : null;
    return { goalId: state.definition.goalId, goal: state.definition.goal, programHash: state.program.programHash,
      state: program?.state === 'SUCCEEDED' ? 'SUCCEEDED' : terminal(program?.state) ? 'FAILED' : state.active ? 'ACTIVE' : 'PROPOSED',
      programState: program?.state ?? null, goalVerification: state.goalVerification,
      tasks: state.definition.tasks.map(task => {
        const job = state.jobs[task.taskId];
        return { ...task, status: job?.accepted ? 'ACCEPTED' : job?.claim && Date.parse(job.claim.expiresAt) > now() ? 'CLAIMED' : job ? 'READY' : 'WAITING_DEPENDENCIES',
          generation: job?.generation ?? 0, actorId: job?.claim?.actorId ?? null,
          expiresAt: job?.claim?.expiresAt ?? null, outputHash: job?.accepted?.outputHash ?? null,
          rejection: job?.rejection ?? null, effects: job ? effectsView(job) : {} };
      }), auditHeadHash: state.events.at(-1)?.eventHash ?? null, outcomePromiseIssued: false };
  }
  return Object.freeze({
    async create({ actorId, goal }) {
      await allowed(actorId, 'CREATE_GOAL', { definition: goal });
      return withUserHeldExecutionLockV2(lock, async () => {
        if (existsSync(file)) { const state = load(); if (hash(goal) !== state.requestHash) fail('GOAL_ID_CONFLICT'); return view(state); }
        const { definition, program } = compileGoal(goal, now());
        if (definition.tasks.some(task => task.resourceIds.some(resourceId => !Object.hasOwn(resources, resourceId)))) fail('RESOURCE_NOT_CONFIGURED');
        const state = { schema: 'outsider/shared-goal/v1', requestHash: hash(goal), definition,
          definitionHash: hash(definition), program, active: false, jobs: {}, events: [], goalVerification: null };
        record(state, 'GOAL_CREATED', { programHash: program.programHash }); return view(state);
      });
    },
    async activate({ actorId, programHash }) {
      return locked(async state => { await allowed(actorId, 'ACTIVATE_GOAL', state);
        if (programHash !== state.program.programHash) fail('PROGRAM_HASH_MISMATCH');
        if (!state.active) { state.active = true; record(state, 'GOAL_ACTIVATED', { actorId, programHash }); }
        await advance(state); return view(state); });
    },
    async claim({ actorId, taskId = null, ttlMs = 60_000 }) {
      if (!Number.isSafeInteger(ttlMs) || ttlMs < 100 || ttlMs > 300_000) fail('CLAIM_DURATION_INVALID');
      return locked(async state => {
        await allowed(actorId, 'READ_GOAL', state); await advance(state);
        if (!state.active || terminal(engine.inspect(state.program.programId).state)
          || Date.parse(state.definition.completionDeadline) <= now()) return { claim: null, goal: view(state) };
        for (const task of state.definition.tasks) {
          if (taskId !== null && taskId !== task.taskId || task.allowedActorIds.length && !task.allowedActorIds.includes(actorId)) continue;
          const job = state.jobs[task.taskId];
          if (!job || job.accepted || job.claim && Date.parse(job.claim.expiresAt) > now()) continue;
          if (await authorize({ actorId, operation: 'CLAIM_TASK', goal: state.definition, task }) !== true) continue;
          job.generation += 1; job.status = 'CLAIMED';
          job.claim = { actorId, leaseId: randomUUID(), generation: job.generation,
            expiresAt: new Date(Math.min(now() + ttlMs, Date.parse(state.definition.completionDeadline))).toISOString() };
          record(state, 'TASK_CLAIMED', { taskId: task.taskId, actorId, generation: job.generation });
          return { claim: { ...copy(job.claim), task: copy(task), inputs: inputsFor(state, task),
            effects: effectsView(job), operationId: job.operationId }, goalId: state.definition.goalId };
        }
        return { claim: null, goal: view(state) };
      });
    },
    async renew(input) {
      if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs < 100 || input.ttlMs > 300_000) fail('CLAIM_DURATION_INVALID');
      return locked(async state => { await allowed(input.actorId, 'WORK_TASK', state, taskFor(state, input.taskId));
        const job = assertClaim(state, input);
        job.claim.expiresAt = new Date(Math.min(now() + input.ttlMs, Date.parse(state.definition.completionDeadline))).toISOString();
        record(state, 'CLAIM_RENEWED', { taskId: input.taskId, generation: job.generation }); return copy(job.claim); });
    },
    async abandon(input) {
      return locked(async state => { await allowed(input.actorId, 'WORK_TASK', state, taskFor(state, input.taskId));
        const job = assertClaim(state, input); job.claim = null; job.status = 'READY';
        record(state, 'TASK_HANDED_OFF', { taskId: input.taskId, actorId: input.actorId, generation: job.generation }); return view(state); });
    },
    async complete(input) {
      if (!id(input.submissionId)) fail('SUBMISSION_ID_INVALID');
      const output = copy(input.output); if (Buffer.byteLength(canonicalizeStrict(output)) > 65_536) fail('OUTPUT_TOO_LARGE');
      const fingerprint = hash({ actorId: input.actorId, taskId: input.taskId, submissionId: input.submissionId,
        generation: input.generation, output });
      const priorSubmission = state => {
        const existing = Object.hasOwn(state.jobs, input.taskId)
          ? state.jobs[input.taskId].attempts.find(row => row.submissionId === input.submissionId) : null;
        if (existing && existing.fingerprint !== fingerprint) fail('SUBMISSION_ID_CONFLICT');
        return existing ? copy(existing) : null;
      };
      const prepared = await locked(async state => {
        const task = taskFor(state, input.taskId); await allowed(input.actorId, 'WORK_TASK', state, task);
        const existing = priorSubmission(state); if (existing) return { existing };
        const job = assertClaim(state, input);
        if (Object.values(job.effects).some(effect => effect.status === 'RECONCILIATION_REQUIRED')) fail('RESOURCE_RECONCILIATION_REQUIRED');
        return { effectsHash: hash(effectsView(job)), context: { goal: copy(state.definition), task: copy(task), actorId: input.actorId,
          output, inputs: inputsFor(state, task), effects: copy(job.effects) } };
      });
      if (prepared.existing) return prepared.existing;
      // A slow provider/model verifier must not block other tasks or renewals.
      let verification;
      try { verification = copy(await verifyTask(prepared.context)); }
      catch { verification = { accepted: false, reason: 'VERIFIER_UNAVAILABLE' }; }
      return locked(async state => {
        await allowed(input.actorId, 'WORK_TASK', state, taskFor(state, input.taskId));
        const existing = priorSubmission(state); if (existing) return existing;
        const job = assertClaim(state, input);
        if (hash(effectsView(job)) !== prepared.effectsHash) fail('SUBMISSION_CONTEXT_CHANGED');
        const result = { submissionId: input.submissionId, fingerprint, accepted: verification.accepted === true,
          outputHash: hash(output), verificationHash: hash(verification), reason: verification.reason ?? null };
        job.attempts.push(result);
        if (result.accepted) { job.accepted = { ...result, output, actorId: input.actorId }; job.status = 'ACCEPTED'; job.claim = null; job.rejection = null; }
        else job.rejection = result;
        record(state, result.accepted ? 'TASK_ACCEPTED' : 'TASK_REJECTED', { taskId: input.taskId, actorId: input.actorId, ...result });
        await advance(state); return result;
      });
    },
    async observeResource(input) {
      await resourceAccess(load(), input);
      const actorId = resourceActor(load(), input);
      return resourceHandle(input, actorId).observe({ actorId });
    },
    async captureResource(input) {
      await resourceAccess(load(), input);
      const actorId = resourceActor(load(), input);
      return resourceHandle(input, actorId).capture({ actorId });
    },
    async performResource(input) {
      if (!id(input.stepId) || !Number.isSafeInteger(input.expectedVersion)
        || !/^sha256:[a-f0-9]{64}$/u.test(input.expectedStateHash ?? '')) fail('RESOURCE_STEP_INVALID');
      const action = copy(input.action);
      const requestHash = hash({ resourceId: input.resourceId, action,
        expectedVersion: input.expectedVersion, expectedStateHash: input.expectedStateHash });
      const { effect, fresh } = await locked(async state => {
        await resourceAccess(state, input, action);
        const effects = state.jobs[input.taskId].effects;
        if (Object.hasOwn(effects, input.stepId)) {
          if (effects[input.stepId].requestHash !== requestHash) fail('RESOURCE_STEP_CONFLICT');
          return { effect: copy(effects[input.stepId]), fresh: false };
        }
        const effect = { stepId: input.stepId, resourceId: input.resourceId,
          operationId: `goal-${hash({ root, goalId: state.definition.goalId, taskId: input.taskId, stepId: input.stepId }).slice(7)}`,
          requestHash, actionHash: hash(action), resourceActorId: resourceActor(state, input),
          claimGeneration: input.generation, expectedVersion: input.expectedVersion, expectedStateHash: input.expectedStateHash,
          status: 'RECONCILIATION_REQUIRED', resourceLease: null };
        effects[input.stepId] = effect;
        record(state, 'RESOURCE_STEP_INTENT', { taskId: input.taskId, stepId: input.stepId,
          resourceId: input.resourceId, operationId: effect.operationId, actionHash: effect.actionHash });
        return { effect: copy(effect), fresh: true };
      });
      if (!fresh) return effectView(effect);
      const handle = resourceHandle(input, effect.resourceActorId);
      let dispatched = false, result;
      try {
        effect.resourceLease = await handle.acquire({ actorId: effect.resourceActorId,
          ttlMs: Math.max(100, Math.min(30_000, Date.parse(load().jobs[input.taskId].claim?.expiresAt ?? '') - now())) });
        await locked(state => { state.jobs[input.taskId].effects[input.stepId].resourceLease = copy(effect.resourceLease); save(state); });
        dispatched = true;
        result = await handle.execute({ ...effect.resourceLease, actorId: effect.resourceActorId,
          operationId: effect.operationId, action, expectedVersion: input.expectedVersion, expectedStateHash: input.expectedStateHash });
      } catch (error) {
        const beforeIntent = !dispatched || ['SHARED_RESOURCE_STALE_STATE', 'SHARED_RESOURCE_LEASE_LOST', 'SHARED_RESOURCE_NOT_AUTHORIZED',
          'SHARED_GOAL_CLAIM_LOST', 'SHARED_GOAL_NOT_AUTHORIZED', 'SHARED_GOAL_RESOURCE_NOT_ALLOWED'].includes(error.code);
        result = { status: beforeIntent ? 'NOT_DISPATCHED' : 'RECONCILIATION_REQUIRED',
          reason: error.code ?? error.outsiderCode ?? 'OWNER_GATEWAY_UNAVAILABLE' };
      }
      const receipt = await finishEffect(input, effect, result);
      if (receipt.status !== 'RECONCILIATION_REQUIRED') await releaseResource(handle, effect);
      return receipt;
    },
    async reconcileResource(input) {
      const effect = await locked(async state => {
        await resourceAccess(state, input);
        const effects = state.jobs[input.taskId].effects;
        if (!id(input.stepId) || !Object.hasOwn(effects, input.stepId)
          || effects[input.stepId].resourceId !== input.resourceId) fail('RESOURCE_STEP_NOT_FOUND');
        return copy(effects[input.stepId]);
      });
      const handle = resourceHandle(input, effect.resourceActorId);
      if (effect.status !== 'RECONCILIATION_REQUIRED') { await releaseResource(handle, effect); return effectView(effect); }
      let result;
      try { result = await handle.reconcile({ actorId: effect.resourceActorId, operationId: effect.operationId }); }
      catch (error) {
        if (error.code !== 'SHARED_RESOURCE_OPERATION_NOT_FOUND') throw error;
        result = { status: 'NOT_APPLIED', reason: 'NO_OWNER_GATEWAY_INTENT' };
      }
      const receipt = await finishEffect(input, effect, result);
      if (receipt.status !== 'RECONCILIATION_REQUIRED') await releaseResource(handle, effect);
      return receipt;
    },
    async resume({ actorId }) { return locked(async state => { await allowed(actorId, 'READ_GOAL', state); await advance(state); return view(state); }); },
    async inspect({ actorId }) { return locked(async state => { await allowed(actorId, 'READ_GOAL', state); return view(state); }); },
  });
}
