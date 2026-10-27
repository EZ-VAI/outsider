/* A connected read-only interface binds its real subject parameters in the
 * request and response. Internal order identities are never source echoes. */
import { canonicalizeStrict } from './canonical.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';

export const NATIVE_OBSERVATION_SUBJECT_SCHEMA = 'outsider/native-observation-subject/v1';
const FIELD = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const metadataFields = new Set(['httpAccepted', 'providerRef', 'observedAt', 'responseHash', 'responseBytes', 'protocolSource']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = reason => { const code = `NATIVE_OBSERVATION_SUBJECT_${reason}`; throw Object.assign(new TypeError(code), { code }); };
function copy(value, reason, maximumBytes = 524288) {
  let encoded;
  try { encoded = canonicalizeStrict(value); } catch { fail(reason); }
  if (Buffer.byteLength(encoded) > maximumBytes) fail(reason);
  return JSON.parse(encoded);
}
function directSourceField(route, field) {
  if (typeof field !== 'string' || !FIELD.test(field) || forbidden.has(field) || metadataFields.has(field)
    || !object(route.observe.fields) || !Object.hasOwn(route.observe.fields, field)) fail('SOURCE_FIELD_NOT_DECLARED');
  const pointer = route.observe.fields[field];
  if (typeof pointer !== 'string' || Buffer.byteLength(pointer) > 512 || pointer && !pointer.startsWith('/')
    || /~(?![01])/u.test(pointer)) fail('SOURCE_FIELD_INVALID');
  const tokens = pointer ? pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~')) : [];
  if (tokens.length > 16 || tokens.some(token => forbidden.has(token))) fail('SOURCE_FIELD_INVALID');
}
function query(route, fields, subject) {
  const names = Object.keys(fields), markers = new Map();
  const values = subject ? Object.values(subject).map(String) : [];
  for (const [index, name] of names.entries()) {
    let marker = `outsider_subject_query_${index}_identity`;
    while (route.observe.path.includes(marker) || values.some(value => value.includes(marker))) marker += '_';
    markers.set(name, marker);
  }
  const used = new Set();
  const marked = route.observe.path.replace(/\{(\/[^}]+)\}/gu, (_, ref) => {
    const match = /^\/subject\/([A-Za-z][A-Za-z0-9_-]{0,63})$/u.exec(ref);
    if (!match || !markers.has(match[1])) fail('QUERY_REFERENCE_NOT_DECLARED');
    used.add(match[1]); return markers.get(match[1]);
  });
  if (/[{}]/u.test(marked) || used.size !== names.length) fail('QUERY_IDENTITY_REQUIRED');
  let markedUrl;
  try { markedUrl = new URL(marked, route.origin); } catch { fail('QUERY_INVALID'); }
  if (markedUrl.origin !== route.origin || markedUrl.username || markedUrl.password || markedUrl.hash) fail('QUERY_ESCAPED_CONNECTION');
  if ([...markers.values()].some(marker => marked.split(marker).length !== `${markedUrl.pathname}${markedUrl.search}`.split(marker).length))
    fail('QUERY_IDENTITY_LOST');
  if (!subject) return null;

  let encodedValues;
  try { encodedValues = Object.fromEntries(Object.entries(subject).map(([key, value]) => [key, encodeURIComponent(String(value))])); }
  catch { fail('INPUT_INVALID'); }
  const boundPath = route.observe.path.replace(/\{(\/[^}]+)\}/gu,
    (_, ref) => encodedValues[ref.slice('/subject/'.length)]);
  const actual = new URL(boundPath, route.origin);
  let expectedPath = markedUrl.pathname, expectedSearch = markedUrl.search;
  for (const [name, marker] of markers) {
    const encoded = encodedValues[name];
    expectedPath = expectedPath.replaceAll(marker, encoded);
    // WHATWG special-URL queries encode the apostrophe; path segments do not.
    expectedSearch = expectedSearch.replaceAll(marker, encoded.replaceAll("'", '%27'));
  }
  // In addition to checking the template, compare its retained positions with
  // the actual encoded values. A subject of '.' or '..' must not erase an ID
  // path segment, even when a second copy survives in the query string.
  if (actual.origin !== route.origin || actual.username || actual.password || actual.hash
    || actual.pathname !== expectedPath || actual.search !== expectedSearch) fail('QUERY_IDENTITY_LOST');
  return actual.href;
}

export function normalizeNativeObservationSubjectIdentity(route) {
  route = copy(route, 'ROUTE_INVALID');
  if (!object(route)) fail('ROUTE_INVALID');
  if (!Object.hasOwn(route, 'subjectIdentity')) return null;
  const contract = route.subjectIdentity;
  if (!exact(contract, ['schema', 'fields']) || contract.schema !== NATIVE_OBSERVATION_SUBJECT_SCHEMA
    || !object(contract.fields) || Object.keys(contract.fields).length < 1 || Object.keys(contract.fields).length > 16
    || Object.keys(contract.fields).some(field => !FIELD.test(field) || forbidden.has(field))
    || new Set(Object.values(contract.fields)).size !== Object.keys(contract.fields).length) fail('CONTRACT_INVALID');
  let origin;
  try { origin = new URL(route.origin); } catch { fail('ROUTE_INVALID'); }
  const operation = route.observe;
  if (origin.protocol !== 'https:' || origin.origin !== route.origin || origin.username || origin.password
    || typeof route.providerRef !== 'string' || !route.providerRef || !HASH.test(route.sourceHash ?? '')
    || typeof route.sourceUrl !== 'string' || !route.sourceUrl
    || !object(operation) || operation.method !== 'GET' || Object.hasOwn(operation, 'body')
    || typeof operation.path !== 'string' || !operation.path.startsWith('/') || operation.path.startsWith('//')
    || operation.path.includes('#') || operation.path.length > 8192
    || !Array.isArray(operation.httpStatuses) || operation.httpStatuses.length < 1 || operation.httpStatuses.length > 16
    || new Set(operation.httpStatuses).size !== operation.httpStatuses.length
    || operation.httpStatuses.some(status => !Number.isInteger(status) || status < 200 || status > 299)) fail('READ_ONLY_ROUTE_REQUIRED');
  for (const field of Object.values(contract.fields)) directSourceField(route, field);
  if (new Set(Object.values(contract.fields).map(field => route.observe.fields[field])).size !== Object.keys(contract.fields).length)
    fail('SOURCE_FIELDS_AMBIGUOUS');
  query(route, contract.fields);
  return contract;
}

/** The optional receipt is a direct native HTTP projection. Presence and
 * exact JSON type/value equality are required for every source subject field. */
export function assertNativeObservationSubjectBinding({ route, subject, receipt }) {
  const contract = normalizeNativeObservationSubjectIdentity(route);
  if (!contract) fail('NOT_DECLARED');
  const selected = copy(subject, 'INPUT_INVALID', 6000);
  if (!exact(selected, Object.keys(contract.fields)) || Object.values(selected).some(value =>
    typeof value === 'number' ? !Number.isFinite(value) : typeof value !== 'string' || !value
      || Buffer.byteLength(value) > 2048 || /[\u0000-\u001f\u007f]/u.test(value))) fail('INPUT_INVALID');
  const url = query(route, contract.fields, selected);
  if (receipt !== undefined) {
    const source = copy(receipt, 'SOURCE_RECEIPT_INVALID');
    if (!object(source) || Object.entries(contract.fields).some(([name, field]) =>
      !Object.hasOwn(source, field) || source[field] !== selected[name])) fail('SOURCE_IDENTITY_MISMATCH');
  }
  const subjectHash = digest(selected), subjectIdentityHash = digest(contract);
  const requestHash = digest({ method: 'GET', url, body: null });
  return { subjectHash, subjectIdentityHash, requestHash, queryBindingHash: digest({
    schema: 'outsider/native-observation-subject-query/v1', subjectHash, subjectIdentityHash,
    requestHash, providerRef: route.providerRef, sourceHash: route.sourceHash }) };
}
