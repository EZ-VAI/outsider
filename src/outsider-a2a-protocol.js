/* A2A JSON-RPC wire support. Transport and task reports are not resource
 * authority, capacity acceptance, or independent outcome evidence.
 * Normative sources: https://a2a-protocol.org/v1.0.0/specification/
 * and https://a2a-protocol.org/v0.3.0/specification/ */
import { randomUUID } from 'node:crypto';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';

export const A2A_VERSION = '1.0';
export const A2A_LEGACY_VERSION = '0.3.0';
export const A2A_SUPPORTED_VERSIONS = Object.freeze([A2A_VERSION, A2A_LEGACY_VERSION]);
export const A2A_TASK_STATES = Object.freeze(['TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING',
  'TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED',
  'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED', 'TASK_STATE_UNSPECIFIED']);
export const A2A_TERMINAL_STATES = Object.freeze(A2A_TASK_STATES.slice(2, 6));
export const A2A_SPECIFICATION_URL = 'https://a2a-protocol.org/v1.0.0/specification/';
const fail = code => { throw Object.assign(new Error(code), { code }); };
export const a2aId = value => typeof value === 'string' && value.length > 0 && value.length <= 256
  && !/[\u0000-\u001f\u007f]/u.test(value);
export function validateA2AParts(parts) {
  if (!Array.isArray(parts) || !parts.length || parts.length > 64) fail('A2A_PARTS_INVALID');
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)
      || ['text', 'data', 'raw', 'url'].filter(key => Object.hasOwn(part, key)).length !== 1
      || Object.hasOwn(part, 'text') && typeof part.text !== 'string'
      || Object.hasOwn(part, 'url') && typeof part.url !== 'string'
      || Object.hasOwn(part, 'raw') && typeof part.raw !== 'string') fail('A2A_PART_INVALID');
  }
  return parts;
}
export function validateA2ATask(task, expectedId) {
  if (!task || !a2aId(task.id) || expectedId && task.id !== expectedId
    || !A2A_TASK_STATES.includes(task.status?.state)
    || task.contextId !== undefined && !a2aId(task.contextId)) fail('A2A_TASK_INVALID');
  if (task.status.message) validateA2AParts(task.status.message.parts);
  if (task.artifacts !== undefined) {
    if (!Array.isArray(task.artifacts) || task.artifacts.length > 64) fail('A2A_ARTIFACTS_INVALID');
    const ids = new Set();
    for (const artifact of task.artifacts) {
      if (!a2aId(artifact?.artifactId) || ids.has(artifact.artifactId)) fail('A2A_ARTIFACT_INVALID');
      ids.add(artifact.artifactId); validateA2AParts(artifact.parts);
    }
  }
  return task;
}
function httpsUrl(value) {
  let url; try { url = new URL(value); } catch { fail('A2A_ENDPOINT_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail('A2A_ENDPOINT_INVALID');
  return url;
}
export function selectA2AInterface(card, { allowedOrigins } = {}) {
  if (!card || typeof card.name !== 'string'
    || card.supportedInterfaces !== undefined && !Array.isArray(card.supportedInterfaces)
    || !Array.isArray(card.skills)) fail('A2A_AGENT_CARD_INVALID');
  let selected = card.supportedInterfaces?.find(item => item.protocolVersion === A2A_VERSION
    && item.protocolBinding === 'JSONRPC');
  // Select only a card-declared binding. An error response never triggers a
  // version downgrade or a second submission to a guessed endpoint.
  if (!selected && card.protocolVersion === A2A_LEGACY_VERSION) {
    const legacy = card.preferredTransport === 'JSONRPC' ? { url: card.url }
      : card.additionalInterfaces?.find(item => item.transport === 'JSONRPC');
    if (legacy) selected = { url: legacy.url, protocolVersion: A2A_LEGACY_VERSION, protocolBinding: 'JSONRPC' };
  }
  if (!selected) fail('A2A_VERSION_OR_BINDING_UNSUPPORTED');
  const url = httpsUrl(selected.url);
  if (allowedOrigins && !allowedOrigins.includes(url.origin)) fail('A2A_CARD_ENDPOINT_NOT_APPROVED');
  if (selected.tenant !== undefined && !a2aId(selected.tenant)) fail('A2A_TENANT_INVALID');
  return { url: url.href, protocolVersion: selected.protocolVersion, protocolBinding: 'JSONRPC',
    ...(selected.tenant === undefined ? {} : { tenant: selected.tenant }) };
}
async function responseBytes(response, maximumBytes) {
  if (response.redirected || !response.body) fail('A2A_RESPONSE_INVALID');
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maximumBytes) fail('A2A_RESPONSE_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export async function discoverA2AAgentCard({ url, fetchImpl = fetch, allowedOrigins }) {
  const source = httpsUrl(url);
  const response = await fetchImpl(source.href, { headers: { accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(15000) });
  const bytes = await responseBytes(response, 250000);
  if (response.status !== 200) fail('A2A_AGENT_CARD_UNAVAILABLE');
  let card; try { card = JSON.parse(bytes); } catch { fail('A2A_AGENT_CARD_INVALID'); }
  const selectedInterface = selectA2AInterface(card, { allowedOrigins: allowedOrigins ?? [source.origin] });
  return { card, selectedInterface, source: { url: source.href, sourceHash: digest(bytes.toString('base64')),
    bytes: bytes.length }, authenticationRequired: ((selectedInterface.protocolVersion === A2A_VERSION
      ? card.securityRequirements : card.security)?.length ?? 0) > 0,
    capacityAccepted: false, responsibilityAccepted: false, independentIdentityProven: false };
}

// Keep the existing native-resource projection in the v1 shape. Only the wire
// codec changes; legacy Messages do not acquire an invented task or acceptance.
const legacyMethods = Object.freeze({ SendMessage: 'message/send', GetTask: 'tasks/get', CancelTask: 'tasks/cancel' });
const legacyStates = Object.freeze({ submitted: 'TASK_STATE_SUBMITTED', working: 'TASK_STATE_WORKING',
  completed: 'TASK_STATE_COMPLETED', failed: 'TASK_STATE_FAILED', canceled: 'TASK_STATE_CANCELED',
  rejected: 'TASK_STATE_REJECTED', 'input-required': 'TASK_STATE_INPUT_REQUIRED',
  'auth-required': 'TASK_STATE_AUTH_REQUIRED', unknown: 'TASK_STATE_UNSPECIFIED' });
function legacySendParams(params) {
  const { message, configuration = {}, ...rest } = params;
  if (!message || !a2aId(message.messageId) || !['ROLE_USER', 'ROLE_AGENT'].includes(message.role)) fail('A2A_MESSAGE_INVALID');
  if (Object.keys(configuration).some(key => !['acceptedOutputModes', 'historyLength', 'returnImmediately'].includes(key)))
    fail('A2A_LEGACY_CONFIGURATION_UNSUPPORTED');
  if (configuration.returnImmediately !== undefined && typeof configuration.returnImmediately !== 'boolean') fail('A2A_CONFIGURATION_INVALID');
  const parts = validateA2AParts(message.parts).map(part => {
    if (Object.hasOwn(part, 'text')) return { ...part, kind: 'text' };
    if (Object.hasOwn(part, 'data')) return { ...part, kind: 'data' };
    const { raw, url, filename, mediaType, ...extra } = part;
    return { ...extra, kind: 'file', file: { ...(raw === undefined ? { uri: url } : { bytes: raw }),
      ...(filename === undefined ? {} : { name: filename }), ...(mediaType === undefined ? {} : { mimeType: mediaType }) } };
  });
  const { returnImmediately = false, ...options } = configuration;
  return { ...rest, message: { ...message, kind: 'message', role: message.role === 'ROLE_USER' ? 'user' : 'agent', parts },
    configuration: { ...options, blocking: !returnImmediately } };
}
function normalizeLegacyParts(parts) {
  if (!Array.isArray(parts) || !parts.length || parts.length > 64) fail('A2A_PARTS_INVALID');
  return validateA2AParts(parts.map(part => {
    if (!part || typeof part !== 'object' || Array.isArray(part)
      || ['text', 'data', 'file'].filter(key => Object.hasOwn(part, key)).length !== 1) fail('A2A_PART_INVALID');
    const { kind, file, ...extra } = part;
    if (['text', 'data'].includes(kind) && Object.hasOwn(part, kind)) return extra;
    if (kind !== 'file' || !file || typeof file !== 'object'
      || Object.hasOwn(file, 'bytes') === Object.hasOwn(file, 'uri')) fail('A2A_PART_INVALID');
    return { ...extra, ...(Object.hasOwn(file, 'bytes') ? { raw: file.bytes } : { url: file.uri }),
      ...(file.name === undefined ? {} : { filename: file.name }),
      ...(file.mimeType === undefined ? {} : { mediaType: file.mimeType }) };
  }));
}
function normalizeLegacyMessage(message) {
  if (!message || message.kind !== 'message' || !a2aId(message.messageId)
    || !['user', 'agent'].includes(message.role)
    || message.taskId !== undefined && !a2aId(message.taskId)
    || message.contextId !== undefined && !a2aId(message.contextId)) fail('A2A_MESSAGE_INVALID');
  const { kind, ...value } = message;
  return { ...value, role: message.role === 'user' ? 'ROLE_USER' : 'ROLE_AGENT', parts: normalizeLegacyParts(message.parts) };
}
function normalizeLegacyTask(task) {
  if (!task || task.kind !== 'task' || !Object.hasOwn(legacyStates, task.status?.state)) fail('A2A_TASK_INVALID');
  const { kind, ...value } = task;
  value.status = { ...task.status, state: legacyStates[task.status.state],
    ...(task.status.message === undefined ? {} : { message: normalizeLegacyMessage(task.status.message) }) };
  if (task.artifacts !== undefined) {
    if (!Array.isArray(task.artifacts) || task.artifacts.length > 64) fail('A2A_ARTIFACTS_INVALID');
    value.artifacts = task.artifacts.map(artifact => ({ ...artifact, parts: normalizeLegacyParts(artifact?.parts) }));
  }
  if (task.history !== undefined) {
    if (!Array.isArray(task.history)) fail('A2A_TASK_INVALID');
    value.history = task.history.map(normalizeLegacyMessage);
  }
  return value;
}
function normalizeLegacyResult(method, result) {
  if (method !== 'SendMessage') return normalizeLegacyTask(result);
  if (result?.kind === 'task') return { task: normalizeLegacyTask(result) };
  if (result?.kind === 'message') return { message: normalizeLegacyMessage(result) };
  fail('A2A_SEND_RESPONSE_INVALID');
}
export function createA2AJsonRpcClient({ agentInterface, fetchImpl = fetch,
  headersProvider = () => ({}), maximumBytes = 250000, timeoutMs = 20000 }) {
  const endpoint = httpsUrl(agentInterface?.url);
  if (!A2A_SUPPORTED_VERSIONS.includes(agentInterface.protocolVersion) || agentInterface.protocolBinding !== 'JSONRPC')
    fail('A2A_VERSION_OR_BINDING_UNSUPPORTED');
  const legacy = agentInterface.protocolVersion === A2A_LEGACY_VERSION;
  if (legacy && agentInterface.tenant !== undefined) fail('A2A_LEGACY_TENANT_UNSUPPORTED');
  return Object.freeze({ async call(method, params, { requestId = randomUUID(), signal } = {}) {
    if (!['SendMessage', 'GetTask', 'CancelTask', 'ListTasks'].includes(method)
      || legacy && !Object.hasOwn(legacyMethods, method)) fail('A2A_METHOD_UNSUPPORTED');
    if (legacy && params.tenant !== undefined) fail('A2A_LEGACY_TENANT_UNSUPPORTED');
    const request = { jsonrpc: '2.0', id: requestId, method: legacy ? legacyMethods[method] : method,
      params: { ...(legacy && method === 'SendMessage' ? legacySendParams(params) : params),
      ...(agentInterface.tenant === undefined ? {} : { tenant: agentInterface.tenant }) } };
    if (Buffer.byteLength(JSON.stringify(request)) > 128000) fail('A2A_REQUEST_TOO_LARGE');
    const response = await fetchImpl(endpoint.href, { method: 'POST', redirect: 'error',
      headers: { ...await headersProvider(), accept: 'application/json', 'content-type': 'application/json',
        'a2a-version': agentInterface.protocolVersion }, body: JSON.stringify(request),
      signal: signal ?? AbortSignal.timeout(timeoutMs) });
    const bytes = await responseBytes(response, maximumBytes);
    const receipt = { httpStatus: response.status, responseBytes: bytes.length,
      responseHash: digest(bytes.toString('base64')), bodyBase64: bytes.toString('base64') };
    if ([401, 403].includes(response.status)) return { ...receipt, ok: false,
      authorizationRequired: true, error: { code: 'A2A_REMOTE_AUTH_REQUIRED' } };
    let value; try { value = JSON.parse(bytes); } catch { fail('A2A_RESPONSE_INVALID'); }
    if (value?.jsonrpc !== '2.0' || value.id !== requestId
      || Object.hasOwn(value, 'result') === Object.hasOwn(value, 'error')) fail('A2A_RPC_BINDING_INVALID');
    if (!response.ok || value.error) return { ...receipt, ok: false,
      error: { code: value.error?.code ?? 'A2A_REMOTE_HTTP_ERROR' } };
    const result = legacy ? normalizeLegacyResult(method, value.result) : value.result;
    if (method === 'SendMessage') {
      if (!result || Object.hasOwn(result, 'task') === Object.hasOwn(result, 'message')) fail('A2A_SEND_RESPONSE_INVALID');
      if (result.task) validateA2ATask(result.task, params.message?.taskId);
      else if (result.message?.role !== 'ROLE_AGENT' || !a2aId(result.message.messageId)) fail('A2A_MESSAGE_INVALID');
      else validateA2AParts(result.message.parts);
    } else if (['GetTask', 'CancelTask'].includes(method)) validateA2ATask(result, params.id);
    return { ...receipt, ok: true, result };
  } });
}
