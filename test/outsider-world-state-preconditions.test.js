/* Synthetic state only. No service availability or provider capacity claim. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compileWorldStateResourcePlan, compileWorldStateResourcePlanWithPreconditions }
  from '../src/outsider-world-state-program-compiler.js';
import { compileOutcomeProgramV1, verifyOutcomeProgramV1 } from '../src/outsider-outcome-program-v1.js';
import { createWorldStateGoalCompiler } from '../src/outsider-world-state-goal-compiler.js';
import { createWorldStateResourceNetworkExample } from '../examples/world-state-resource-network.mjs';
import { runWorldStatePlanCli } from '../scripts/outsider-world-state-plan.mjs';
import { createDurableOutcomeProgramOrchestratorV1 }
  from '../src/outsider-durable-outcome-program-orchestrator-v1.js';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';

const START = '2026-09-08T12:00:00.000Z';
const fact = (predicateId, value) => ({ predicateId, valueType: typeof value, value });
const condition = (predicateId, value, operator = 'EQ') => ({ ...fact(predicateId, value), operator });

function input() {
  const actions = [
    { actionId: 'qualify', capability: 'synthetic.qualification', preconditions: [],
      effects: [fact('authorized', true), fact('units_available', 3)], durationMs: 10, costMinor: '0' },
    { actionId: 'perform', capability: 'synthetic.operation',
      preconditions: [condition('authorized', true), condition('units_available', 2, 'GTE')],
      effects: [fact('delivered', true)], durationMs: 10, costMinor: '0' },
  ];
  const requirements = actions.flatMap(action => ['PRIMARY', 'RECOVERY'].map(role => ({
    requirementId: `${action.actionId}_${role.toLowerCase()}`, role, capability: action.capability,
    minimumReservationMs: 60000, constraints: { evidenceClass: 'SIMULATION_ONLY' }, dependsOnRequirementIds: [],
  })));
  requirements.push({ requirementId: 'independent_state', role: 'INDEPENDENT_WITNESS',
    capability: 'synthetic.current_state', minimumReservationMs: 60000,
    constraints: { evidenceClass: 'SIMULATION_ONLY' }, dependsOnRequirementIds: [] });
  return {
    planningInput: { initialState: [], targetPredicates: [condition('delivered', true)], actions, resources: [],
      budget: { currency: 'USD', maximumAmountMinor: '0' }, deadlineMs: 60000 },
    programInput: { programId: 'synthetic_precondition_compilation', orderId: 'synthetic_precondition_order',
      createdAt: START, formationDeadline: '2026-09-08T12:01:00.000Z', completionDeadline: '2026-09-08T12:02:00.000Z',
      statement: 'Synthetic operation requires current authorization and available units.', requirements,
      finalWitnessRequirementId: 'independent_state', obligations: requirements.map(requirement => ({
        obligationId: `release_${requirement.requirementId}`, targetRequirementId: requirement.requirementId,
        nodeId: null, trigger: 'ALWAYS', action: 'RELEASE_SYNTHETIC_RESOURCE', input: {},
        deadline: '2026-09-08T12:03:00.000Z',
      })) },
    actionBindings: Object.fromEntries(actions.map(action => [action.actionId, {
      primaryRequirementId: `${action.actionId}_primary`, recoveryRequirementId: `${action.actionId}_recovery`,
      witnessRequirementId: 'independent_state', preconditionObserverRequirementId: 'independent_state', input: {},
    }])),
    preconditionObservation: { maximumEvidenceAgeMs: 5000, retryIntervalMs: 1000 },
  };
}

test('legacy world-state compilation preserves the exact r116 program and compilation hashes', () => {
  const legacy = compileWorldStateResourcePlan(createWorldStateResourceNetworkExample());
  assert.equal(legacy.program.programHash, 'sha256:202a082354e7fd7eee2f24a2bf5428e025ba3cd24382f2b853194e8a10b066e3');
  assert.equal(legacy.compilationHash, 'sha256:0a64ba11e4c6693b58835f7cadc4920305435c0f1b38f62f813c61837be5ab01');
});

test('explicit successor freezes actual selected action predicates and existing observer authority', () => {
  const source = input(), legacy = compileWorldStateResourcePlan(source);
  const compiled = compileWorldStateResourcePlanWithPreconditions(source);
  assert.equal(compiled.schema, 'outsider/world-state-program-compilation/v2');
  assert.equal(compiled.program.schema, 'outsider/outcome-program/v1');
  assert.equal(verifyOutcomeProgramV1(compiled.program).programHash, compiled.program.programHash);
  assert.notEqual(compiled.program.programHash, legacy.program.programHash);
  const node = compiled.program.nodes.find(row => row.nodeId === compiled.nodeMapping.perform);
  assert.deepEqual(node.input.executionPreconditions.conditions, source.planningInput.actions[1].preconditions);
  assert.equal(node.input.executionPreconditions.observerRequirementId, 'independent_state');
  assert.deepEqual(compiled.preconditionObservation.checkedNodeIds, [node.nodeId]);
  assert.equal(compiled.preconditionObservation.historicalDependencySuccessIsCurrentEvidence, false);
  assert.equal(compiled.preconditionObservation.atomicCheckAndAct, false);
  assert.equal(compiled.authorityMinted, false);
  assert.equal(compiled.externalEffectsPerformed, 0);
  source.planningInput.actions[1].preconditions[1].value = 1;
  assert.equal(node.input.executionPreconditions.conditions[1].value, 2, 'caller mutation cannot weaken the frozen program');
});

test('fresh compilation rejects absent authority, primary-as-observer, shadow contracts and invalid policy', () => {
  for (const mutate of [
    value => { delete value.actionBindings.perform.preconditionObserverRequirementId; },
    value => { value.actionBindings.perform.preconditionObserverRequirementId = 'perform_primary'; },
    value => { value.actionBindings.perform.input.executionPreconditions = {}; },
    value => { value.preconditionObservation.maximumEvidenceAgeMs = 0; },
    value => { value.preconditionObservation.ignoreMissingFacts = true; },
  ]) {
    const value = input(); mutate(value);
    assert.throws(() => compileWorldStateResourcePlanWithPreconditions(value), /WORLD_STATE_COMPILER_/u);
  }
  const compiled = compileWorldStateResourcePlanWithPreconditions(input());
  const tampered = structuredClone(compiled.program);
  tampered.nodes.find(row => row.input.executionPreconditions).input.executionPreconditions.observerRequirementId = 'perform_primary';
  assert.throws(() => compileOutcomeProgramV1(tampered), /EFFECT_PRECONDITION_/u,
    'the underlying program compiler rejects an invalid explicit contract before resource formation');
});

test('existing goal compilation carries an explicit catalog precondition policy into the same program', async () => {
  const source = input();
  const catalog = { catalogId: 'synthetic_preconditions', observedAt: START, expiresAt: '2026-09-08T12:04:00.000Z',
    semanticTargets: [{ targetId: 'delivered', description: 'Synthetic completed operation.',
      predicates: source.planningInput.targetPredicates }], sourceReferences: [], executionReadiness: { ready: false },
    planningInput: source.planningInput, programInput: source.programInput, actionBindings: source.actionBindings,
    preconditionObservation: source.preconditionObservation };
  const compiler = createWorldStateGoalCompiler({ catalog, clock: () => START,
    interpretGoal: async () => ({ status: 'MATCHED', summary: 'Synthetic operation', targetIds: ['delivered'],
      unsupportedOutcomes: [], missingInformation: [] }) });
  const request = { requestId: 'synthetic_goal_preconditions', goal: source.programInput.statement,
    completionDeadline: source.programInput.completionDeadline, budget: source.planningInput.budget };
  const program = await compiler.compileGoal(request);
  assert.equal(program.nodes.filter(node => node.input.executionPreconditions).length, 1);
  const record = compiler.inspectCompilation(request.requestId);
  assert.equal(record.compilation.schema, 'outsider/world-state-program-compilation/v2');
  assert.equal(record.providerEffectsPerformed, 0);
  assert.equal(JSON.stringify(compiler.catalogProjection).includes('preconditionObserverRequirementId'), false);
});

test('existing planner CLI requires explicit fresh-check opt-in and emits only a private compiled proposal', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-precondition-compile-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourceFile = path.join(directory, 'input.json'), output = path.join(directory, 'compiled.json');
  writeFileSync(sourceFile, JSON.stringify(input()), { mode: 0o600 });
  assert.throws(() => runWorldStatePlanCli(['--input', sourceFile, '--compile-preconditions', '--output', output]),
    /PRECONDITION_INPUT_REQUIRED/u);
  const result = runWorldStatePlanCli(['--input', sourceFile, '--compile', '--compile-preconditions', '--output', output]);
  assert.equal(result.externalEffectsPerformed, 0);
  const compiled = JSON.parse(readFileSync(output));
  assert.equal(compiled.schema, 'outsider/world-state-program-compilation/v2');
  assert.equal(compiled.program.nodes.filter(node => node.input.executionPreconditions).length, 1);
});

test('planner to original runtime pauses after a completed prerequisite changes, then resumes the same order', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-planned-current-preconditions-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const compiled = compileWorldStateResourcePlanWithPreconditions(input());
  const state = new Map(), executions = [], reads = [], completedEffects = new Map();
  let time = Date.parse(START), lostPrerequisite = false;
  const clock = () => new Date(time++).toISOString();
  const lifecycle = role => ({ adapterId: `synthetic_${role}`, providerRef: `synthetic-provider-${role}`,
    async reserve({ requirement }) { return { status: 'RESERVED', reservationId: `synthetic:${requirement.requirementId}`,
      validUntil: '2026-09-08T12:04:00.000Z', providerReceipt: { evidenceClass: 'SIMULATION_ONLY' } }; },
    async closeObligation() { return { status: 'CLOSED', evidenceClass: 'SIMULATION_ONLY' }; },
    async release() { return { status: 'RELEASED', evidenceClass: 'SIMULATION_ONLY' }; },
  });
  const execute = async ({ node, operationId, resumeOnly = false }) => {
    if (completedEffects.has(operationId)) return completedEffects.get(operationId);
    if (resumeOnly) throw new Error('SYNTHETIC_EFFECT_NOT_PREVIOUSLY_SENT');
    executions.push(node.input.worldStateAction.actionId);
    for (const effect of node.input.worldStateAction.declaredEffects) state.set(effect.predicateId, effect.value);
    const result = { status: 'SUCCEEDED', evidenceClass: 'SIMULATION_ONLY' };
    completedEffects.set(operationId, result); return result;
  };
  const witness = { ...lifecycle('witness'),
    async observe({ node, acceptance }) {
      const satisfied = acceptance.every(criterion => state.get(criterion.subject) === criterion.expected.value);
      // The prior check was valid; the fact subsequently changes before the
      // next effect. A durable SATISFIED event cannot answer the new question.
      if (node.nodeId === compiled.nodeMapping.qualify && !lostPrerequisite) {
        state.set('authorized', false); lostPrerequisite = true;
      }
      return { status: satisfied ? 'SATISFIED' : 'NOT_SATISFIED', observedAt: clock(), evidenceClass: 'SIMULATION_ONLY' };
    },
    async observePreconditions({ preconditionBinding, contract, operationId }) {
      reads.push(operationId);
      return { schema: 'outsider/effect-precondition-evidence/v1', bindingHash: preconditionBinding.bindingHash,
        observedAt: clock(), facts: contract.conditions.map(condition => ({
          ...fact(condition.predicateId, state.get(condition.predicateId)),
          evidenceHash: digest({ operationId, predicateId: condition.predicateId, value: state.get(condition.predicateId) }),
        })) };
    },
  };
  const options = { directory, clock,
    adapters: { synthetic_primary: { ...lifecycle('primary'), supportsResumeOnly: true, execute },
      synthetic_recovery: { ...lifecycle('recovery'), supportsResumeOnly: true, execute }, synthetic_witness: witness },
    discover: async ({ requirement }) => ({ adapterId: requirement.role === 'INDEPENDENT_WITNESS'
      ? 'synthetic_witness' : `synthetic_${requirement.role.toLowerCase()}` }),
    measureOperations: async () => ({ outsiderStaffTouchCount: 0, humanQueueCreated: false, source: 'SYNTHETIC_COUNTER' }),
  };
  const first = await createDurableOutcomeProgramOrchestratorV1(options).run(compiled.program);
  assert.equal(first.state, 'PAUSED_RETRYABLE');
  assert.equal(first.nodes[compiled.nodeMapping.qualify].witness.status, 'SATISFIED');
  assert.deepEqual(executions, ['qualify'], 'the changed prerequisite must stop a new provider effect');
  state.set('authorized', true); time += 2000;
  const second = await createDurableOutcomeProgramOrchestratorV1(options).resume(compiled.program.programId);
  assert.equal(second.state, 'SUCCEEDED');
  assert.equal(second.programHash, first.programHash);
  assert.deepEqual(executions, ['qualify', 'perform'], 'same original order keeps the already completed action');
  assert.equal(reads.length, 2);
  assert.notEqual(reads[0], reads[1], 'resolved read failures are followed by a new source observation');
});
