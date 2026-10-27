import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeA2AOutputRequirement as normalize, evaluateA2AOutputRequirement as evaluate } from '../src/outsider-a2a-output-contract.js';

const requirement = checks => ({ minimumParts: 1, acceptedPartKinds: ['data'],
  dataValidation: { artifactIndex: 0, partIndex: 0, checks } });
const equals = (pointer, expected) => ({ pointer, operator: 'EQUALS', expected });
const output = data => ({ artifacts: [{ parts: [{ data }] }] });

test('legacy requirements retain their exact shape and count only actual accepted part content', () => {
  const original = { acceptedPartKinds: ['file', 'data', 'text'], minimumParts: 5 };
  const normalized = normalize(original);
  assert.equal(JSON.stringify(normalized), JSON.stringify(original));
  assert.notEqual(normalized, original); assert.equal(Object.hasOwn(normalized, 'dataValidation'), false);
  const delivered = { artifacts: [{ parts: [
    { text: 'a real artifact' }, { data: null }, { raw: 'YQ==' },
    { url: 'https://example.test/unread-file' }, { text: ' \n ' }, { raw: '' }, { raw: 'YQ=' },
  ] }], message: { parts: [{ text: 'a synchronous message' }, { data: false }] } };
  assert.deepEqual(evaluate(delivered, normalized), { satisfied: true, minimumPartsSatisfied: true,
    receivedAcceptedParts: 5, dataValidation: null, scope: 'PROVIDER_RETURNED_PARTS_ONLY' });
  const insufficient = evaluate(delivered, { minimumParts: 2, acceptedPartKinds: ['file'] });
  assert.equal(insufficient.receivedAcceptedParts, 1); assert.equal(insufficient.satisfied, false);
  assert.equal(evaluate({ artifacts: [{ parts: [{ url: 'https://example.test/reference' }] }] },
    { minimumParts: 1, acceptedPartKinds: ['file'] }).satisfied, false);
});

test('fixed JSON checks compare structure and numeric bounds without returning expected or observed values', () => {
  const data = { classification: 'private-provider-value', score: 7,
    structured: { second: [false, null], first: 1 }, 'a/b': { '~name': ['escaped-key-value'] } };
  const checks = [equals('/structured', { first: 1, second: [false, null] }),
    { pointer: '/classification', operator: 'IN', expected: ['private-user-value', 'private-provider-value'] },
    { pointer: '/score', operator: 'NUMBER_AT_LEAST', expected: 7 },
    { pointer: '/score', operator: 'NUMBER_AT_MOST', expected: 7 },
    equals('/a~1b/~0name/0', 'escaped-key-value')];
  const contract = requirement(checks), bytes = JSON.stringify({ data, contract });
  const result = evaluate(output(data), contract);
  assert.equal(result.satisfied, true); assert.equal(result.dataValidation.checks.length, 5);
  assert.ok(result.dataValidation.checks.every(check => check.reason === 'SATISFIED'));
  assert.equal(/private-user-value|private-provider-value|escaped-key-value|expected|observed/u.test(JSON.stringify(result)), false);
  assert.equal(JSON.stringify({ data, contract }), bytes, 'pure evaluation does not change provider data or the accepted contract');
  assert.equal(evaluate(output(data), requirement([equals('', { ...data })])).satisfied, true, 'an empty pointer selects the entire data value');
  assert.equal(evaluate(output({ score: 6 }), requirement([{ pointer: '/score', operator: 'NUMBER_AT_LEAST', expected: 7 }]))
    .dataValidation.checks[0].reason, 'VALUE_MISMATCH');
});

test('a missing or incorrect selected artifact cannot be replaced by another artifact or a synchronous message', () => {
  const contract = requirement([equals('/accepted', true)]);
  const elsewhere = { artifacts: [{ parts: [{ text: 'not JSON' }] }, { parts: [{ data: { accepted: true } }] }],
    message: { parts: [{ data: { accepted: true } }] } };
  let result = evaluate(elsewhere, contract);
  assert.equal(result.minimumPartsSatisfied, true); assert.equal(result.satisfied, false);
  assert.equal(result.dataValidation.checks[0].reason, 'DATA_PART_REQUIRED');
  result = evaluate(elsewhere, { ...contract, dataValidation: { ...contract.dataValidation, partIndex: 1 } });
  assert.equal(result.dataValidation.checks[0].reason, 'PART_NOT_FOUND');
  result = evaluate({ message: elsewhere.message }, contract);
  assert.equal(result.minimumPartsSatisfied, true); assert.equal(result.dataValidation.checks[0].reason, 'ARTIFACT_NOT_FOUND');
  result = evaluate(elsewhere, { ...contract, dataValidation: { ...contract.dataValidation, artifactIndex: 1 } });
  assert.equal(result.satisfied, true);
  assert.equal(evaluate(output({ other: true }), contract).dataValidation.checks[0].reason, 'POINTER_NOT_FOUND');
  assert.equal(evaluate(output({ accepted: true }), { ...contract, minimumParts: 2 }).satisfied, false,
    'data checks cannot bypass the independently required part count');
});

test('strict types and own-property pointers never coerce values or read a prototype or getter', () => {
  for (const value of ['7', true, null, [], {}]) {
    const result = evaluate(output({ score: value }), requirement([{ pointer: '/score', operator: 'NUMBER_AT_LEAST', expected: 7 }]));
    assert.equal(result.satisfied, false); assert.equal(result.dataValidation.checks[0].reason, 'TYPE_MISMATCH');
  }
  assert.equal(evaluate(output({ accepted: 'true' }), requirement([equals('/accepted', true)]))
    .dataValidation.checks[0].reason, 'TYPE_MISMATCH');
  for (const pointer of ['/constructor', '/toString', '/__proto__/accepted'])
    assert.equal(evaluate(output({}), requirement([equals(pointer, true)])).dataValidation.checks[0].reason, 'POINTER_NOT_FOUND');
  const ownNames = JSON.parse('{"__proto__":{"accepted":true},"constructor":"own data"}');
  assert.equal(evaluate(output(ownNames), requirement([equals('/__proto__/accepted', true), equals('/constructor', 'own data')])).satisfied, true);
  assert.equal(evaluate(output(['zero', 'one']), requirement([equals('/01', 'one')])).satisfied, false);
  assert.equal(evaluate(output({ '01': 'one' }), requirement([equals('/01', 'one')])).satisfied, true);
  let reads = 0;
  const accessor = Object.defineProperty({}, 'accepted', { enumerable: true, get: () => { reads++; return true; } });
  assert.equal(evaluate(output(accessor), requirement([equals('/accepted', true)])).satisfied, false);
  assert.equal(evaluate(output(Object.create({ accepted: true })), requirement([equals('/accepted', true)])).satisfied, false);
  assert.equal(reads, 0);
});

test('normalization bounds pointers and JSON constants and rejects ambiguous membership lists', () => {
  const valid = requirement([equals(`/${'x'.repeat(511)}`, 'x'.repeat(2046))]);
  assert.deepEqual(normalize(valid), valid, '512-byte pointer and 2048-byte JSON literal are accepted');
  const sixteen = requirement(Array.from({ length: 16 }, (_, index) => equals(`/${index}`, index)));
  assert.equal(normalize(sixteen).dataValidation.checks.length, 16);
  assert.doesNotThrow(() => normalize(requirement([equals('/x'.repeat(16), null)])));
  assert.doesNotThrow(() => normalize(requirement([{ pointer: '', operator: 'IN', expected: [false, 0, '', null, [], {}] }])));
  const invalid = [
    { minimumParts: 0, acceptedPartKinds: ['data'] }, { minimumParts: 17, acceptedPartKinds: ['data'] },
    { minimumParts: 1, acceptedPartKinds: ['data', 'data'] }, { minimumParts: 1, acceptedPartKinds: ['url'] },
    { ...requirement([equals('', 1)]), acceptedPartKinds: ['text'] },
    { ...requirement([equals('', 1)]), extra: true },
    requirement([]), requirement(Array.from({ length: 17 }, () => equals('', true))),
    ...['bare', '/~2', '/~', `/${'x'.repeat(512)}`, `/${'界'.repeat(171)}`, '/x'.repeat(17)].map(pointer => requirement([equals(pointer, true)])),
    requirement([equals('', 'x'.repeat(2047))]), requirement([equals('', undefined)]), requirement([equals('', Number.NaN)]),
    requirement([equals('', Infinity)]), requirement([equals('', new Date(0))]),
    requirement([equals('', 'x'.repeat(2000)), equals('/x', 'x'.repeat(2000)), equals('/y', 'x'.repeat(2000))]),
    ...[[], Array.from({ length: 17 }, (_, index) => index), [true, true], [{ a: 1, b: 2 }, { b: 2, a: 1 }]]
      .map(expected => requirement([{ pointer: '', operator: 'IN', expected }])),
    requirement([{ pointer: '', operator: 'NUMBER_AT_MOST', expected: '7' }]),
    requirement([{ pointer: '', operator: 'CONTAINS', expected: 'value' }]),
    { ...requirement([equals('', true)]), dataValidation: { artifactIndex: 16, partIndex: 0, checks: [equals('', true)] } },
  ];
  for (const value of invalid) assert.throws(() => normalize(value), { code: 'A2A_OUTPUT_REQUIREMENT_INVALID' });
});

test('malformed provider parts fail closed without being counted as delivered bytes', () => {
  const legacy = { minimumParts: 1, acceptedPartKinds: ['text', 'data', 'file'] };
  for (const value of [null, {}, { artifacts: [{}] }, { artifacts: [{ parts: [null, {}, { text: 4 }, { data: undefined },
    { data: true, url: 'https://example.test/reference' }, { raw: 'YQ' }] }] }]) {
    const result = evaluate(value, legacy);
    assert.equal(result.satisfied, false); assert.equal(result.receivedAcceptedParts, 0);
  }
});
