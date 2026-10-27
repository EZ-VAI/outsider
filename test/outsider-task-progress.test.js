import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTaskProgress as progress } from '../src/outsider-task-progress.js';
test('a recoverable preparation error with unanswered questions points to the actual user action',()=>{
  const p=progress({state:'UNAVAILABLE',terminal:true,failureCode:'MODEL_INPUT_INVALID',taskBrief:{questions:[{}],canUpdate:true,canRetry:true}});
  assert.equal(p.code,'NEEDS_DETAILS'); assert.equal(p.action,'CLARIFY'); assert.equal(p.group,'attention'); assert.equal(p.issueCode,'MODEL_INPUT_INVALID');
  assert.equal(progress({state:'UNAVAILABLE',failureCode:'MODEL_INPUT_INVALID',taskBrief:{questions:[],canUpdate:true,canRetry:true}}).code,'PREPARATION_FAILED');
});
test('empty recruitment cannot be presented as waiting for sent invitations',()=>{
  const s={state:'UNAVAILABLE',participantSourcing:{autoAssemble:true,state:'AWAITING_OFFERS',recruitment:[{invitationCount:0}]}};
  assert.equal(progress(s).code,'PARTICIPANTS_NEEDED');
  s.participantSourcing.recruitment[0].invitationCount=1;assert.equal(progress(s).code,'WAITING_QUOTES');
});
test('progress uses accepted deliveries and recorded changes while waiting, never the current read time',()=>{
  const p=progress({state:'WAITING_EXTERNAL',confirmed:true,nextWakeAt:'2026-09-09T05:15:00Z',executionProgress:{observedAt:'2026-09-09T01:00:00Z',steps:[{state:'ACCEPTED'},{state:'RUNNING'},{state:'WAITING'}]}},{now:'2026-09-09T02:00:00Z'});
  assert.equal(p.code,'WAITING_EXECUTION');assert.equal(p.acceptedSteps,1);assert.equal(p.totalSteps,3);assert.equal(p.updatedAt,'2026-09-09T01:00:00Z');assert.equal(p.stage,2);
  assert.equal(progress({state:'SUCCEEDED'},{completionDeadline:'2026-01-01T00:00:00Z'}).code,'COMPLETED');
  assert.equal(progress({state:'UNAVAILABLE'},{completionDeadline:'2026-01-01T00:00:00Z'}).code,'WINDOW_ENDED');
});


test('open formation and an unconnected contact channel retain the unmet work without implying execution or sent invitations',()=>{
  assert.equal(progress({state:'FORMING',formationPending:true,waitingFor:'RESOURCE_FORMATION',taskBrief:{canRetry:true}}).code,'FORMATION_NEEDS_ROUTE');
  const pending=progress({state:'FORMING',participantSourcing:{autoAssemble:true,state:'AWAITING_OFFERS',recruitment:[{invitationCount:0,continuous:{state:'WAITING_CONTACT_CHANNEL'}}]}});
  assert.equal(pending.code,'CONTACT_CHANNEL_NEEDED');assert.equal(pending.group,'attention');
});
