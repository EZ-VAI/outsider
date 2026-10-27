import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateA2AOutputRequirement, summarizeA2AOutputAcceptance } from '../src/outsider-a2a-output-contract.js';

const wide = { minimumParts: 1, acceptedPartKinds: ['text', 'data'] };
const checked = { ...wide, dataValidation: { artifactIndex: 0, partIndex: 0,
  checks: [{ pointer: '/status', operator: 'EQUALS', expected: 'provided' }] } };
const jsonOnly = { selectedOutputModes: ['application/json'] };

test('a selected JSON output narrows a broad artifact contract without guessing refusal words or claiming business success', () => {
  const reply = { artifacts: [{ parts: [{ text: 'A received reply without the required JSON data.' }] }] };
  assert.equal(evaluateA2AOutputRequirement(reply, wide).satisfied, true, 'the legacy artifact contract keeps its exact meaning');
  const selected = evaluateA2AOutputRequirement(reply, wide, jsonOnly);
  assert.equal(selected.satisfied, false); assert.equal(selected.receivedAcceptedParts, 0);
  assert.deepEqual(selected.selectedOutputModes, ['application/json']);
  const missing = summarizeA2AOutputAcceptance(reply, checked, jsonOnly);
  assert.equal(missing.artifactBytesAvailable, true); assert.equal(missing.declaredDataConditionsSatisfied, false);
  assert.equal(missing.returnedOutputContractSatisfied, false);
  assert.equal(missing.acceptanceScope, 'PROVIDER_RETURNED_DATA_CONDITIONS');
  const matching = { artifacts: [{ parts: [{ data: { status: 'provided', note: 'The word refused is not a semantic classifier.' } }] }] };
  const passed = summarizeA2AOutputAcceptance(matching, checked, jsonOnly);
  assert.equal(passed.declaredDataConditionsSatisfied, true); assert.equal(passed.returnedOutputContractSatisfied, true);
  assert.equal(passed.semanticOutcomeSatisfied, false); assert.equal(passed.independentOutcomeEvidence, false);
  const bytesOnly = summarizeA2AOutputAcceptance(reply, wide, { selectedOutputModes: ['text/plain'] });
  assert.equal(bytesOnly.acceptanceScope, 'PROVIDER_RETURNED_ARTIFACT_BYTES');
  assert.equal(bytesOnly.declaredDataConditionsSatisfied, null);
});

test('selected modes reject contradictory media types at the exact checked part while old evaluator results remain unchanged', () => {
  const output = { artifacts: [{ parts: [{ data: { status: 'provided' }, mediaType: 'text/plain' },
    { data: { status: 'provided' }, mediaType: 'application/json' }] }] };
  assert.equal(evaluateA2AOutputRequirement(output, checked).satisfied, true);
  const selected = evaluateA2AOutputRequirement(output, checked, jsonOnly);
  assert.equal(selected.minimumPartsSatisfied, true);
  assert.equal(selected.dataValidation.satisfied, false);
  assert.equal(selected.dataValidation.checks[0].reason, 'DATA_PART_REQUIRED');
  assert.equal(selected.satisfied, false, 'another correctly typed JSON part cannot replace the contracted index');
  assert.equal(Object.hasOwn(evaluateA2AOutputRequirement(output, checked), 'selectedOutputModes'), false);
  assert.throws(() => evaluateA2AOutputRequirement(output, checked, { selectedOutputModes: ['text/plain'] }), /A2A_OUTPUT_REQUIREMENT_INVALID/);
  assert.throws(() => evaluateA2AOutputRequirement(output, checked, { selectedOutputModes: ['application/json'], unchecked: true }),
    /A2A_OUTPUT_REQUIREMENT_INVALID/);
});
