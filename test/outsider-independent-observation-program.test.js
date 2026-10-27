import test from 'node:test';
import assert from 'node:assert/strict';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';
import { compileObservationOnlyProgramV1, compileExecutionOnlyProgramV2, verifyExecutableOutcomeProgram,
  OUTSIDER_OBSERVATION_ONLY_PROGRAM_V1_SCHEMA } from '../src/outsider-outcome-program-v1.js';
import { EFFECT_PRECONDITIONS_SCHEMA, EFFECT_PRECONDITION_EVIDENCE_SCHEMA, EFFECT_PRECONDITION_EVIDENCE_SCHEMA_V2,
  effectPreconditionEvidenceBinding, projectEffectPreconditionObservation } from '../src/outsider-effect-preconditions.js';

const NOW='2026-09-08T18:00:00.000Z',at=ms=>new Date(Date.parse(NOW)+ms).toISOString();
const binding=effectPreconditionEvidenceBinding({programHash:digest('original-order'),nodeId:'apply',route:'PRIMARY',operationId:'read_conditions',
  contract:{schema:EFFECT_PRECONDITIONS_SCHEMA,observerRequirementId:'asset_state',maximumEvidenceAgeMs:1000,retryIntervalMs:1000,
    conditions:[{predicateId:'available',valueType:'boolean',operator:'EQ',value:true}]}});
const sampled=(changes={})=>({schema:EFFECT_PRECONDITION_EVIDENCE_SCHEMA_V2,bindingHash:binding.bindingHash,observedAt:NOW,
  sourceObservedAt:at(-900),facts:[{predicateId:'available',valueType:'boolean',value:true,evidenceHash:digest('actual-source-sample')}],...changes});
const project=(observation,observedAt=NOW)=>projectEffectPreconditionObservation({binding,observation,observationStartedAt:NOW,observedAt});

test('a newly read periodic sample retains its actual age and cannot outlive its accepted freshness at dispatch',()=>{
  const observation=sampled(),accepted=project(observation);
  assert.equal(accepted.status,'SATISFIED');
  assert.equal(accepted.evidenceReadAt,NOW);assert.equal(accepted.sourceObservedAt,at(-900));
  assert.equal(accepted.evidenceObservedAt,at(-900));
  assert.equal(project(observation,at(100)).status,'SATISFIED');
  assert.equal(project(observation,at(101)).reason,'EVIDENCE_EXPIRED');
  assert.equal(project(sampled({observedAt:at(-1)})).reason,'EVIDENCE_PREDATES_OBSERVATION');
  assert.equal(project(sampled({sourceObservedAt:at(1)})).reason,'SOURCE_OBSERVATION_FROM_FUTURE');
  assert.equal(project(sampled({sourceObservedAt:at(-1001)})).reason,'EVIDENCE_EXPIRED');
});

test('sampled evidence cannot add clocks to legacy evidence or replace actual typed facts',()=>{
  const {sourceObservedAt,...legacy}=sampled({schema:EFFECT_PRECONDITION_EVIDENCE_SCHEMA});
  const previous=project(legacy);assert.equal(previous.status,'SATISFIED');
  assert.equal(Object.hasOwn(previous,'sourceObservedAt'),false);assert.equal(Object.hasOwn(previous,'evidenceReadAt'),false);
  assert.equal(project({...legacy,sourceObservedAt}).reason,'EVIDENCE_INVALID');
  assert.equal(project(sampled({sourceObservedAt:undefined})).reason,'EVIDENCE_INVALID');
  assert.equal(project(sampled({bindingHash:digest('another-order')})).reason,'EVIDENCE_BINDING_MISMATCH');
  assert.equal(project(sampled({facts:[{...legacy.facts[0],value:false}]})).status,'NOT_SATISFIED');
  assert.equal(project(sampled({facts:[{...legacy.facts[0],value:'true'}]})).reason,'FACT_INVALID');
});

function observationProgram(){return {programId:'read_existing_state',orderId:'same_read_order',createdAt:NOW,
  formationDeadline:at(10000),completionDeadline:at(60000),tenderHash:null,commitmentMode:'EXECUTION_ONLY_NO_OUTCOME_PROMISE',
  outcome:{statement:'Observe the declared actual subject condition',acceptance:[{criterionId:'source_state',comparator:'SOURCE_CONDITION',subject:'actual-subject',expected:true}],
    budget:{currency:'USD',maximumAmountMinor:'0'}},
  requirements:[{requirementId:'state_read',role:'INDEPENDENT_WITNESS',capability:'SOURCE_STATE_OBSERVATION',minimumReservationMs:1,
    constraints:{admissionMode:'ON_DEMAND_OBSERVATION'},dependsOnRequirementIds:[]}],
  nodes:[{nodeId:'observed_state',kind:'OBSERVATION',dependsOn:[],primaryRequirementId:null,recoveryRequirementId:null,witnessRequirementId:'state_read',input:{},acceptance:['SOURCE_STATE']}],
  obligations:[{obligationId:'close_read',trigger:'ALWAYS',targetRequirementId:'state_read',nodeId:null,action:'CLOSE_READ_SESSION',input:{},deadline:at(60000)}],
  zeroInternalOps:{staffTouchLimit:0,humanQueueFallback:false}};}

test('a sealed observation-only goal needs no fabricated primary execution or backup reservation',()=>{
  const input=observationProgram(),program=compileObservationOnlyProgramV1(input);
  assert.equal(program.schema,OUTSIDER_OBSERVATION_ONLY_PROGRAM_V1_SCHEMA);
  assert.deepEqual(verifyExecutableOutcomeProgram(program),program);
  assert.deepEqual(program.executionOrder,['observed_state']);
  assert.equal(program.requirements.length,1);
  assert.deepEqual(compileObservationOnlyProgramV1(input),program);
  assert.throws(()=>compileExecutionOnlyProgramV2(input),/REQUIREMENTS_INVALID|REQUIRED_ROLE_PRIMARY_MISSING/);
  const changed=structuredClone(program);changed.nodes[0].input.subject='another-subject';
  assert.throws(()=>verifyExecutableOutcomeProgram(changed),/PROGRAM_HASH_OR_CONTENT_INVALID/);
});

test('read-only admission cannot acquire capacity or dispatch an effect by changing the new schema',()=>{
  for(const change of [p=>p.requirements[0].role='PRIMARY',p=>p.requirements[0].constraints.admissionMode='EXECUTION_PHASE_TRANSACTION',
    p=>p.nodes[0].kind='EFFECT',p=>p.nodes[0].kind='TRANSACTION',p=>p.nodes[0].primaryRequirementId='state_read',
    p=>p.outcome.budget.maximumAmountMinor='1',p=>p.tenderHash=digest('outcome-promise')]){
    const input=observationProgram();change(input);assert.throws(()=>compileObservationOnlyProgramV1(input));
  }
});
