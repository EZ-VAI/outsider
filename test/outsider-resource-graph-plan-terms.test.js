import test from 'node:test';
import assert from 'node:assert/strict';
import { projectResourceGraphPlanTerms as project } from '../src/outsider-resource-graph-plan-terms.js';
import { assessOutcomePlanFeasibility as assess } from '../src/outsider-resource-graph-execution-plan.js';

const NOW = '2026-09-08T09:00:00.000Z', minute = 60000;
const at = milliseconds => new Date(Date.parse(NOW) + milliseconds).toISOString();
const DEADLINE = at(60 * minute), HASH = `sha256:${'1'.repeat(64)}`;
const has = (assessment, id, code) => assessment.conflicts.some(row => row.requirementId === id && row.code === code);

function inputFor(parts, executionWindows = {}, options = {}) {
  const graph = { summary: 'Check the frozen component terms before the original plan is confirmed', missingFacts: [],
    requirements: parts.map(part => ({ id: part.id, capability: `${part.category}_CONTRACT`, dependsOn: [],
      outcome: 'The component satisfies its explicitly scoped acceptance contract',
      acceptance: [part.acceptanceContract ?? 'FIXTURE_TYPED_ACCEPTANCE'], recoveryNeeds: ['Preserve accepted effects'],
      resourceKinds: [part.category], discoveryQueries: ['already prepared component'], candidateDocumentationUrls: [] })) };
  const operations = parts.map(part => ({ capability: `${part.category}_CONTRACT`, category: part.category,
    acceptanceContract: part.acceptanceContract ?? 'FIXTURE_TYPED_ACCEPTANCE' }));
  return { graph, observedAt: NOW, completionDeadline: DEADLINE, budget: { currency: 'USD', maximumAmountMinor: '0' },
    executionWindows, terms: project({ graph, parts, operations }), ...options };
}

function nativePart() {
  const quote = (quoteId, completionBy) => ({ quoteId, accepted: true, httpAccepted: true,
    expiresAt: at(5 * minute), completionBy, totalAmountMinor: '0', currency: 'USD', responsibilityTerms: 'Frozen fixture terms' });
  return { id: 'native', category: 'NATIVE_RESOURCE_NETWORK', acceptanceContract: 'FIXTURE_NATIVE_ACCEPTANCE',
    quotes: { primary: quote('primary', at(30 * minute)), recovery: quote('recovery', at(50 * minute)) },
    formationFeasibility: { providerCompletionBound: at(50 * minute), quotedExecutorTotalMinor: '0',
      currency: 'USD', independentAcceptanceTimingProven: false, unquotedCostsIncluded: false } };
}

test('a future calendar-backed service retains quote acceptance expiry without treating it as the service deadline',()=>{
  const part={id:'crew',category:'PARTICIPANT_WORK',purchase:{planHash:HASH,totalAmountMinor:'0',currency:'USD',
    expiresAt:at(5*minute),availableStart:at(20*minute),availableEnd:at(40*minute),durationMs:20*minute,
    serviceSource:{connectorId:'outsider_schedule'}}};
  const input=inputFor([part],{crew:{notBefore:at(20*minute)}});
  assert.equal(assess(input).acceptable,true);
  assert.deepEqual(input.terms[0].confirmationConstraints,[{sourceHash:HASH,validUntil:at(5*minute)}]);
  assert.equal(assess({...input,observedAt:at(6*minute)}).acceptable,false,'an unaccepted expired quote still cannot be bought');
  delete part.purchase.serviceSource;
  assert.ok(has(assess(inputFor([part],{crew:{notBefore:at(20*minute)}})),'crew','SOURCE_DISPATCH_VALIDITY_EXPIRED'));
});

test('an accepted digital order can receive its file after checkout expiry; an unsubmitted purchase cannot', () => {
  const part = { id: 'file', category: 'DIGITAL_GOODS_ACQUISITION', continuingAcceptedOrder: true,
    executionTiming: 'AFTER_DEPENDENCY_ACCEPTANCE',
    purchase: { planHash: HASH, totalAmountMinor: '0', currency: 'USD', expiresAt: at(-minute) } };
  const bytes = JSON.stringify(part), accepted = inputFor([part], { file: { notBefore: at(10 * minute) } });
  const result = assess(accepted);
  assert.equal(result.acceptable, true);
  assert.deepEqual(accepted.terms[0].dispatchConstraints, []);
  assert.equal(accepted.terms[0].cost.basis, 'EXISTING_ACCEPTED_ORDER_NO_NEW_CHARGE');
  assert.equal(result.businessFeasibilityEstablished, false);

  const unsubmitted = { ...part, continuingAcceptedOrder: false };
  const expired = assess(inputFor([unsubmitted]));
  assert.equal(expired.acceptable, false);
  assert.ok(has(expired, 'file', 'SOURCE_DISPATCH_VALIDITY_EXPIRED'));

  const currentPurchase = { ...unsubmitted, purchase: { ...part.purchase, expiresAt: at(5 * minute) } };
  const tooLate = assess(inputFor([currentPurchase], { file: { notBefore: at(6 * minute) } }));
  assert.equal(tooLate.acceptable, false, 'a currently valid quote still cannot support a new checkout after expiry');
  assert.ok(has(tooLate, 'file', 'SOURCE_DISPATCH_VALIDITY_EXPIRED'));
  assert.equal(JSON.stringify(part), bytes, 'projecting current constraints does not rewrite the original accepted order');
});

test('a booking keeps its source currency and must first dispatch strictly before the booked slot starts', () => {
  const slotStart = at(10 * minute);
  const part = { id: 'booking', category: 'SCHEDULED_BOOKING', booking: { slotStart,
    slotEnd: at(30 * minute), event: { eventTypeId: 123, totalAmountMinor: '0', currency: 'EUR', sourceHash: HASH } } };
  const budget = { currency: 'EUR', maximumAmountMinor: '0' };
  const before = inputFor([part], { booking: { notBefore: at(10 * minute - 1) } }, { budget });
  const result = assess(before);
  assert.equal(result.acceptable, true);
  assert.equal(before.terms[0].cost.currency, 'EUR');
  assert.equal(before.terms[0].cost.basis, 'SOURCE_QUOTED_MAXIMUM');
  assert.deepEqual(result.budget.currencyConflictRequirementIds, []);
  assert.equal(result.requirements[0].latestStartAt, at(10 * minute - 1));
  const atStart = assess({ ...before, executionWindows: { booking: { notBefore: slotStart } } });
  assert.equal(atStart.acceptable, false);
  assert.ok(has(atStart, 'booking', 'SOURCE_DISPATCH_VALIDITY_EXPIRED'));
  const lateConfirmation = assess({ ...before, observedAt: slotStart });
  assert.equal(lateConfirmation.acceptable, false);
  assert.ok(has(lateConfirmation, 'booking', 'SOURCE_DISPATCH_VALIDITY_EXPIRED'));
  assert.equal(result.wholeOutcomeTimingProven, false, 'a legal booking dispatch does not prove attendance or service completion');
});

test('a later native backup completion bound cannot hide an impossible first start on the primary route', () => {
  const part = nativePart();
  part.quotes.primary.completionBy = at(10 * minute);
  const input = inputFor([part], { native: { notBefore: at(20 * minute) } });
  const result = assess(input);
  assert.equal(input.terms[0].providerCompletionBy, at(50 * minute), 'the graph still retains the bound covering either route');
  assert.equal(result.acceptable, false);
  assert.ok(has(result, 'native', 'SOURCE_LATEST_START_CONFLICT'));
  assert.equal(result.requirements[0].latestStartAt, at(10 * minute));
  assert.equal(has(result, 'native', 'SOURCE_COMPLETION_BOUND_BEFORE_DISPATCH'), false,
    'the rejection comes from the primary terms, not a fictitious earlier combined completion time');
  const notYetImpossible = assess({ ...input, executionWindows: { native: { notBefore: at(10 * minute) } } });
  assert.equal(notYetImpossible.acceptable, true);
  assert.equal(notYetImpossible.requirements[0].dispatchNotBeforeBound, at(10 * minute));
  assert.equal(notYetImpossible.wholeOutcomeTimingProven, false);
});

test('native quote expiry limits first confirmation, without becoming an execution expiry for the proposed future dispatch', () => {
  const part = nativePart(), expiresAt = part.quotes.primary.expiresAt;
  const input = inputFor([part], { native: { notBefore: at(20 * minute) } });
  const termsBytes = JSON.stringify(input.terms), confirmedBeforeExpiry = assess(input);
  assert.equal(confirmedBeforeExpiry.acceptable, true, 'confirming current quotes can authorize a dispatch after quote expiry');
  assert.equal(confirmedBeforeExpiry.requirements[0].dispatchNotBeforeBound, at(20 * minute));
  assert.equal(confirmedBeforeExpiry.requirements[0].latestStartAt, at(30 * minute));
  assert.equal(input.terms[0].confirmationConstraints.length, 2);
  assert.ok(input.terms[0].confirmationConstraints.every(row => row.validUntil === expiresAt));
  assert.ok(input.terms[0].dispatchConstraints.every(row => row.validUntil !== expiresAt));

  // This is a second, late FIRST-confirmation assessment, not a runtime check
  // against an already accepted order. Runtime keeps its original journal.
  const lateFirstConfirmation = assess({ ...input, observedAt: expiresAt });
  assert.equal(lateFirstConfirmation.acceptable, false);
  assert.ok(has(lateFirstConfirmation, 'native', 'SOURCE_TERMS_EXPIRED_BEFORE_CONFIRMATION'));
  assert.equal(has(lateFirstConfirmation, 'native', 'SOURCE_DISPATCH_VALIDITY_EXPIRED'), false);
  assert.equal(confirmedBeforeExpiry.acceptable, true);
  assert.equal(JSON.stringify(input.terms), termsBytes, 'later assessment preserves the earlier frozen terms');
});

test('cost evidence keeps its limited basis while private adapter state is hashed and never projected or mutated', () => {
  const tokenMarker = 'fixture-secret-do-not-publish', privatePath = '/fixture/private/provider-credentials.json';
  const rawMarker = 'fixture-private-provider-response';
  const native = nativePart();
  native.networkFile = privatePath;
  native.quotes.primary.rawPayload = { marker: rawMarker, headers: { authorization: tokenMarker } };
  const parts = [native,
    { id: 'agent', category: 'AGENT_TASK_EXECUTION', connectionHash: HASH, resourceFile: privatePath,
      resource: { expiresAt: DEADLINE, authorization: { maximumAmountMinor: '0', sourceHash: HASH },
        route: { headersFile: privatePath, token: tokenMarker } } },
    { id: 'software', category: 'SOFTWARE_EXECUTION', preparation: {
      profile: { credentialsFile: privatePath }, compilation: { program: { outcome: { budget: { currency: 'USD', maximumAmountMinor: '0' } } } } } },
    { id: 'publication', category: 'PUBLIC_JSON_ARTIFACT_PUBLICATION', connectionHash: HASH, maximumAmountMinor: '0',
      publicationProfile: { github: { credentialsFile: privatePath }, zeroCostScope: { confirmed: true, expiresAt: DEADLINE } } },
  ];
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const original = JSON.stringify(parts);
  freeze(parts);
  const input = inputFor(parts), result = assess(input);
  assert.equal(result.acceptable, true);
  assert.deepEqual(Object.fromEntries(input.terms.map(term => [term.requirementId, term.cost.basis])), {
    native: 'SOURCE_QUOTED_MAXIMUM', agent: 'AUTHORIZED_EXECUTION_CEILING',
    software: 'FROZEN_EXECUTION_BUDGET', publication: 'AUTHORIZED_EXECUTION_CEILING',
  });
  assert.equal(result.budget.allCostsKnown, true);
  assert.equal(result.budget.knownCostMaximumMinor, '0');
  assert.equal(result.budget.comparisonBasis, 'PROJECTED_AUTHORIZED_OR_QUOTED_CEILINGS');
  assert.equal(result.budget.scope, 'BOUND_EXECUTION_CEILINGS_ONLY');
  assert.equal(result.budget.unquotedCostsIncluded, false);
  assert.equal(result.budget.previouslyIncurredCostsIncluded, false);
  assert.equal(result.businessFeasibilityEstablished, false);
  assert.equal(result.capacityReserved, false);
  assert.equal(input.terms.find(term => term.requirementId === 'native').jointEvidence, 'UNREPORTED');
  assert.equal(input.terms.find(term => term.requirementId === 'agent').jointEvidence, 'UNSUPPORTED');
  for (const publicValue of [input.terms, result]) {
    const bytes = JSON.stringify(publicValue);
    for (const privateValue of [tokenMarker, privatePath, rawMarker, 'headersFile', 'credentialsFile', 'rawPayload', 'networkFile'])
      assert.equal(bytes.includes(privateValue), false, `${privateValue} must stay inside adapter records`);
  }
  assert.ok(input.terms.every(term => /^sha256:[a-f0-9]{64}$/u.test(term.cost.sourceHash)));
  assert.equal(JSON.stringify(parts), original);
});
