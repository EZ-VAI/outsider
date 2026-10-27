/* Confirmed start windows for steps of one original OutcomeProgram. These
 * constrain execution dispatch; authorized formation/reservation and later
 * reconciliation/closure retain their existing separate contracts. */
export const EXECUTION_WINDOW_SCHEMA = 'outsider/execution-start-window/v1';
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const fail = code => { throw new Error(`EXECUTION_WINDOW_${code}`); };
export const EXECUTION_WINDOWS_INPUT_SCHEMA = Object.freeze({ type: 'object', minProperties: 1, maxProperties: 32,
  description: 'Optional confirmed execution start windows keyed by graph requirement id. notBefore prevents early step dispatch; latestStartAt limits the first dispatch of each effect/transaction. Previously started operations may only reconcile afterwards. Formation capacity reservations retain their separately authorized semantics.',
  additionalProperties: { type: 'object', additionalProperties: false, required: ['notBefore'],
    properties: { notBefore: { type: 'string', format: 'date-time' }, latestStartAt: { type: 'string', format: 'date-time' } } } });

function normalizedWindow(window, completionDeadline) {
  if (!plain(window) || !Object.hasOwn(window, 'notBefore')
    || Object.keys(window).some(key => !['notBefore', 'latestStartAt'].includes(key)) || !instant(window.notBefore)
    || window.latestStartAt !== undefined && (!instant(window.latestStartAt)
      || Date.parse(window.latestStartAt) < Date.parse(window.notBefore))) fail('INVALID');
  if (completionDeadline !== undefined && (!instant(completionDeadline)
    || Date.parse(window.notBefore) >= Date.parse(completionDeadline)
    || window.latestStartAt !== undefined && Date.parse(window.latestStartAt) >= Date.parse(completionDeadline)))
    fail('OUTSIDE_COMPLETION_DEADLINE');
  return structuredClone(window);
}

export function normalizeExecutionWindows(value, { requirementIds, completionDeadline } = {}) {
  if (!plain(value) || Object.keys(value).length < 1 || Object.keys(value).length > 32
    || Object.keys(value).some(id => !ID.test(id) || requirementIds && !requirementIds.includes(id))) fail('REQUIREMENT_INVALID');
  return Object.fromEntries(Object.entries(value).map(([id, window]) => [id, normalizedWindow(window, completionDeadline)]));
}

// Store the typed contract in the program's already canonical acceptance
// array. Old program schemas/hashes without this marker retain their meaning.
export function executionWindowAcceptance(requirementId, window) {
  if (!ID.test(requirementId ?? '')) fail('REQUIREMENT_INVALID');
  return { schema: EXECUTION_WINDOW_SCHEMA, requirementId, ...normalizedWindow(window) };
}

export function nodeExecutionWindow(node, completionDeadline) {
  const windows = Array.isArray(node.acceptance)
    ? node.acceptance.filter(value => value?.schema === EXECUTION_WINDOW_SCHEMA) : [];
  if (windows.length > 1) fail('AMBIGUOUS_NODE');
  if (!windows.length) return null;
  const { schema, requirementId, ...window } = windows[0];
  if (!ID.test(requirementId ?? '')) fail('REQUIREMENT_INVALID');
  return { schema, requirementId, ...normalizedWindow(window, completionDeadline) };
}
