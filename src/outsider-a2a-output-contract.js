/* Checks only provider-returned parts. A matching JSON value is not an
 * independent observation or proof that a real-world outcome occurred. */
import { isProxy } from 'node:util/types';
import { canonicalizeStrict } from './canonical.js';

const OPERATORS = ['EQUALS', 'IN', 'NUMBER_AT_LEAST', 'NUMBER_AT_MOST'];
const KINDS = ['text', 'data', 'file'];
const fail = () => { throw Object.assign(new Error('A2A_OUTPUT_REQUIREMENT_INVALID'), { code: 'A2A_OUTPUT_REQUIREMENT_INVALID' }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, expected) => object(value) && Object.keys(value).sort().join(',') === expected;
const index = value => Number.isInteger(value) && value >= 0 && value <= 15;
const json = value => { try { return canonicalizeStrict(value); } catch { return null; } };
const literal = value => { const encoded = json(value); return encoded !== null && Buffer.byteLength(encoded, 'utf8') <= 2048; };

export const A2A_OUTPUT_REQUIREMENT_SCHEMA = { type: 'object', additionalProperties: false,
  description: 'Declare whether delivery only requires artifact bytes or exact returned-data conditions. A data goal must name dataValidation checks; an arbitrary reply cannot satisfy those checks. Neither mode proves general business success.',
  required: ['minimumParts', 'acceptedPartKinds'], properties: {
    minimumParts: { type: 'integer', minimum: 1, maximum: 16 },
    acceptedPartKinds: { type: 'array', minItems: 1, maxItems: 3, uniqueItems: true,
      items: { enum: KINDS }, description: 'Actual nonempty text, JSON data or inline file bytes; file URLs never count as delivered bytes.' },
    dataValidation: { type: 'object', additionalProperties: false, required: ['artifactIndex', 'partIndex', 'checks'],
      description: 'Exact conditions on the selected artifact data part. Text replies, refusal messages, and matching values in other parts cannot replace that data. Define the required fields and values explicitly.', properties: {
      artifactIndex: { type: 'integer', minimum: 0, maximum: 15 }, partIndex: { type: 'integer', minimum: 0, maximum: 15 },
      checks: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'object', additionalProperties: false,
        required: ['pointer', 'operator', 'expected'], properties: {
          pointer: { type: 'string', maxLength: 512, description: 'RFC 6901 pointer relative to the selected data value; at most 512 UTF-8 bytes and 16 segments. Empty selects that entire value.' },
          operator: { enum: OPERATORS }, expected: { description: 'EQUALS: a finite JSON constant, at most 2048 UTF-8 bytes. IN: 1–16 unique such constants. Numeric operators: a finite JSON number. The complete task input remains limited to 6000 bytes.' },
        } } },
    } },
  } };

function pointerParts(pointer) {
  if (typeof pointer !== 'string' || Buffer.byteLength(pointer, 'utf8') > 512
    || pointer !== '' && !pointer.startsWith('/') || /~(?![01])/u.test(pointer)) fail();
  const parts = pointer === '' ? [] : pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (parts.length > 16) fail();
  return parts;
}

export function normalizeA2AOutputRequirement(value) {
  // Validate canonical JSON before accessing caller properties. This also
  // rejects accessors, cycles, sparse arrays and non-finite numeric literals.
  const encoded = json(value);
  if (encoded === null || Buffer.byteLength(encoded, 'utf8') > 6000
    || !['acceptedPartKinds,minimumParts', 'acceptedPartKinds,dataValidation,minimumParts']
      .some(keys => fields(value, keys))
    || !Number.isInteger(value.minimumParts) || value.minimumParts < 1 || value.minimumParts > 16
    || !Array.isArray(value.acceptedPartKinds) || value.acceptedPartKinds.length < 1 || value.acceptedPartKinds.length > 3
    || value.acceptedPartKinds.some(kind => !KINDS.includes(kind))
    || new Set(value.acceptedPartKinds).size !== value.acceptedPartKinds.length) fail();
  if (Object.hasOwn(value, 'dataValidation')) {
    const validation = value.dataValidation;
    if (!value.acceptedPartKinds.includes('data') || !fields(validation, 'artifactIndex,checks,partIndex')
      || !index(validation.artifactIndex) || !index(validation.partIndex)
      || !Array.isArray(validation.checks) || validation.checks.length < 1 || validation.checks.length > 16) fail();
    for (const check of validation.checks) {
      if (!fields(check, 'expected,operator,pointer') || !OPERATORS.includes(check.operator)) fail();
      pointerParts(check.pointer);
      if (check.operator === 'EQUALS' && !literal(check.expected)) fail();
      if (check.operator === 'IN' && (!Array.isArray(check.expected) || check.expected.length < 1 || check.expected.length > 16
        || !check.expected.every(literal) || new Set(check.expected.map(json)).size !== check.expected.length)) fail();
      if (check.operator.startsWith('NUMBER_') && (typeof check.expected !== 'number' || !Number.isFinite(check.expected))) fail();
    }
  }
  // Keep the old two-field requirement and its insertion order unchanged.
  return structuredClone(value);
}

const absent = Object.freeze({ found: false });
function own(value, key) {
  if (value === null || typeof value !== 'object' || isProxy(value)) return absent;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable && Object.hasOwn(descriptor, 'value') ? { found: true, value: descriptor.value } : absent;
}
const array = value => !isProxy(value) && Array.isArray(value);
function arrayValues(value) {
  if (!array(value)) return [];
  return Array.from({ length: Math.min(value.length, 64) }, (_, position) => own(value, String(position)))
    .filter(entry => entry.found).map(entry => entry.value);
}
function partKind(part) {
  const present = ['text', 'data', 'raw', 'url'].filter(key => own(part, key).found);
  if (present.length !== 1) return null;
  const kind = present[0], value = own(part, kind).value;
  if (kind === 'text') return typeof value === 'string' && value.trim().length > 0 ? 'text' : null;
  if (kind === 'data') return json(value) !== null ? 'data' : null;
  if (kind === 'raw') return typeof value === 'string' && /^[A-Za-z0-9+/]+={0,2}$/u.test(value)
    && Buffer.from(value, 'base64').toString('base64') === value ? 'file' : null;
  return null;
}
function matchesSelectedMode(part, selectedOutputModes) {
  if (!selectedOutputModes) return true;
  const kind = partKind(part), mode = kind === 'text' ? 'text/plain' : kind === 'data' ? 'application/json' : null;
  const declared = own(part, 'mediaType');
  return mode !== null && selectedOutputModes.includes(mode) && (!declared.found || declared.value === mode);
}
function selectedData(output, validation, selectedOutputModes) {
  const artifacts = own(output, 'artifacts').value;
  const artifact = array(artifacts) ? own(artifacts, String(validation.artifactIndex)) : absent;
  if (!artifact.found) return { reason: 'ARTIFACT_NOT_FOUND' };
  const parts = own(artifact.value, 'parts').value;
  const part = array(parts) ? own(parts, String(validation.partIndex)) : absent;
  if (!part.found) return { reason: 'PART_NOT_FOUND' };
  return partKind(part.value) === 'data' && matchesSelectedMode(part.value, selectedOutputModes)
    ? { value: own(part.value, 'data').value } : { reason: 'DATA_PART_REQUIRED' };
}
function valueAt(data, parts) {
  let value = data;
  for (const key of parts) {
    // JSON Pointer array indices have no leading zero or append token.
    if (array(value) && !/^(?:0|[1-9][0-9]*)$/u.test(key)) return absent;
    const next = own(value, key);
    if (!next.found) return absent;
    value = next.value;
  }
  return { found: true, value };
}
const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
function checkValue(value, check) {
  if (check.operator.startsWith('NUMBER_')) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'TYPE_MISMATCH';
    return (check.operator === 'NUMBER_AT_LEAST' ? value >= check.expected : value <= check.expected) ? 'SATISFIED' : 'VALUE_MISMATCH';
  }
  const expected = check.operator === 'IN' ? check.expected : [check.expected];
  if (!expected.some(item => type(item) === type(value))) return 'TYPE_MISMATCH';
  const encoded = json(value);
  return encoded !== null && expected.some(item => json(item) === encoded) ? 'SATISFIED' : 'VALUE_MISMATCH';
}

export function evaluateA2AOutputRequirement(output, requirement, options = {}) {
  const normalized = normalizeA2AOutputRequirement(requirement);
  if (json(options) === null || !fields(options, '') && !fields(options, 'selectedOutputModes')) fail();
  const selectedOutputModes = options.selectedOutputModes;
  if (Object.hasOwn(options, 'selectedOutputModes') && (!Array.isArray(selectedOutputModes) || !selectedOutputModes.length
    || selectedOutputModes.length > 2 || new Set(selectedOutputModes).size !== selectedOutputModes.length
    || selectedOutputModes.some(mode => !['text/plain', 'application/json'].includes(mode)
      || !normalized.acceptedPartKinds.includes(mode === 'text/plain' ? 'text' : 'data'))
    || normalized.dataValidation && !selectedOutputModes.includes('application/json'))) fail();
  const artifacts = arrayValues(own(output, 'artifacts').value);
  const parts = [...artifacts.flatMap(artifact => arrayValues(own(artifact, 'parts').value)),
    ...arrayValues(own(own(output, 'message').value, 'parts').value)];
  const receivedAcceptedParts = parts.filter(part => normalized.acceptedPartKinds.includes(partKind(part))
    && matchesSelectedMode(part, selectedOutputModes)).length;
  const minimumPartsSatisfied = receivedAcceptedParts >= normalized.minimumParts;
  let dataValidation = null;
  if (normalized.dataValidation) {
    const validation = normalized.dataValidation, selected = selectedData(output, validation, selectedOutputModes);
    const checks = validation.checks.map(check => {
      const actual = selected.reason ? absent : valueAt(selected.value, pointerParts(check.pointer));
      const reason = selected.reason ?? (!actual.found ? 'POINTER_NOT_FOUND' : checkValue(actual.value, check));
      return { pointer: check.pointer, operator: check.operator, satisfied: reason === 'SATISFIED', reason };
    });
    dataValidation = { satisfied: checks.every(check => check.satisfied), artifactIndex: validation.artifactIndex,
      partIndex: validation.partIndex, checks };
  }
  return { satisfied: minimumPartsSatisfied && (dataValidation?.satisfied ?? true), minimumPartsSatisfied,
    receivedAcceptedParts, dataValidation, scope: 'PROVIDER_RETURNED_PARTS_ONLY',
    ...(selectedOutputModes ? { selectedOutputModes: structuredClone(selectedOutputModes) } : {}) };
}

// A separate projection for new invocation contracts. Do not add these fields
// to old evaluator results: those results are already frozen in V2 evidence.
export function summarizeA2AOutputAcceptance(output, requirement, options = {}) {
  const normalized = normalizeA2AOutputRequirement(requirement), evaluation = evaluateA2AOutputRequirement(output, normalized, options);
  const bytes = evaluateA2AOutputRequirement(output, { minimumParts: 1, acceptedPartKinds: KINDS });
  return { schema: 'outsider/a2a-output-acceptance-summary/v1',
    acceptanceScope: normalized.dataValidation ? 'PROVIDER_RETURNED_DATA_CONDITIONS' : 'PROVIDER_RETURNED_ARTIFACT_BYTES',
    artifactBytesAvailable: bytes.minimumPartsSatisfied,
    declaredDataConditionsSatisfied: evaluation.dataValidation?.satisfied ?? null,
    returnedOutputContractSatisfied: evaluation.satisfied,
    semanticOutcomeSatisfied: false, independentOutcomeEvidence: false };
}
