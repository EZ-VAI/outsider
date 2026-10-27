/* Reusable public A2A task connections. The original order owns execution and
 * reconciliation; these are connection records, never reservations or tasks. */
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { readPrivateExecutionBytes } from './outsider-user-held-durable-execution-v2.js';
import { A2A_VERSION, A2A_TERMINAL_STATES, discoverA2AAgentCard, selectA2AInterface } from './outsider-a2a-protocol.js';
import { validateA2AResourceRoute, createA2AResourceRoute } from './outsider-a2a-native-resource.js';
import { A2A_TASK_DISCOVERY_SCHEMA_V2, freezeA2ASkillDiscovery, validateA2ASkillDiscovery } from './outsider-a2a-skill-contract.js';

export const A2A_TASK_RESOURCE_SCHEMA = 'outsider/a2a-task-resource/v1';
export const A2A_TASK_ROUTE_KIND = 'A2A_TASK_EXECUTION_V1';
export const A2A_TASK_DISCOVERY_SCHEMA = 'outsider/a2a-task-resource-discovery/v1';
export { A2A_TASK_DISCOVERY_SCHEMA_V2 };
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u, HASH = /^sha256:[a-f0-9]{64}$/u;
const fail = code => { throw Object.assign(new Error(`A2A_TASK_${code}`), { code: `A2A_TASK_${code}` }); };
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));

function publicAgentUrl(value) {
  let url; try { url = new URL(value); } catch { fail('PUBLIC_ROUTE_FIELDS_INVALID'); }
  const hostname = url.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.href.length > 2048 || !hostname.includes('.') || isIP(hostname)
    || /(?:^|\.)(?:localhost|local|internal|home|lan)$/u.test(hostname)) fail('PUBLIC_ROUTE_FIELDS_INVALID');
  return url;
}

function validateDiscovery(value, route) {
  if (value?.schema === A2A_TASK_DISCOVERY_SCHEMA_V2) { validateA2ASkillDiscovery(value, route); return; }
  if (!exact(value, ['schema', 'agentVersion', 'sourceHash', 'agentCardHash', 'protocolVersion', 'skills',
    'descriptionsAreUntrusted', 'authorityGrantedByDescriptions']) || value.schema !== A2A_TASK_DISCOVERY_SCHEMA
    || value.agentVersion !== null && (typeof value.agentVersion !== 'string' || value.agentVersion.length > 200)
    || value.sourceHash !== route.sourceHash || value.agentCardHash !== route.a2a.agentCardHash
    || value.protocolVersion !== route.a2a.protocolVersion || value.descriptionsAreUntrusted !== true
    || value.authorityGrantedByDescriptions !== false || !Array.isArray(value.skills) || value.skills.length > 64
    || new Set(value.skills.map(skill => skill?.id)).size !== value.skills.length) fail('DISCOVERY_METADATA_INVALID');
  for (const skill of value.skills) {
    if (!plain(skill) || Object.keys(skill).some(key => !['id', 'name', 'description', 'tags'].includes(key))
      || typeof skill.id !== 'string' || !skill.id || skill.id.length > 256
      || typeof skill.name !== 'string' || !skill.name || skill.name.length > 200
      || typeof skill.description !== 'string' || !skill.description || skill.description.length > 4000
      || skill.tags !== undefined && (!Array.isArray(skill.tags) || skill.tags.length > 32
        || skill.tags.some(tag => typeof tag !== 'string' || tag.length > 100))) fail('DISCOVERY_METADATA_INVALID');
  }
}

export function buildA2AExecutionRoute({ card, source, providerRef, allowedOrigins, acceptedOutputModes }) {
  const selected = selectA2AInterface(card, { allowedOrigins });
  const modes = acceptedOutputModes ?? card.defaultOutputModes ?? ['text/plain', 'application/json'];
  const route = { kind: A2A_TASK_ROUTE_KIND,
    protocol: selected.protocolVersion === A2A_VERSION ? 'A2A_1_0_JSONRPC' : 'A2A_0_3_JSONRPC',
    origin: new URL(selected.url).origin, providerRef, sourceUrl: source.url, sourceHash: source.sourceHash,
    a2a: { endpoint: selected.url, protocolVersion: selected.protocolVersion, protocolBinding: 'JSONRPC', agentCardHash: digest(card),
      ...(selected.tenant === undefined ? {} : { tenant: selected.tenant }) },
    execute: { rpcMethod: 'SendMessage', params: { message: { parts: { $ref: '/input/parts' } },
      configuration: { acceptedOutputModes: modes } }, fields: {} },
    status: { rpcMethod: 'GetTask', params: { id: { $ref: '/execution/remoteTaskId' } }, fields: {} },
    release: { rpcMethod: 'CancelTask', params: { id: { $ref: '/execution/remoteTaskId' } }, fields: {} } };
  validateA2AResourceRoute(route, 'execution'); return route;
}

function validateResource(value, draft) {
  if (!plain(value) || value.schema !== A2A_TASK_RESOURCE_SCHEMA || !ID.test(value.id ?? '')
    || Object.keys(value).some(key => !['schema', 'id', 'name', 'description', 'expiresAt', 'authorization', 'route', 'discovery', 'publicOutputPolicy'].includes(key))
    || Object.hasOwn(value, 'publicOutputPolicy') && value.publicOutputPolicy !== 'ARTIFACT_PARTS_ONLY'
    || typeof value.name !== 'string' || !value.name || value.name.length > 200
    || typeof value.description !== 'string' || !value.description || value.description.length > 4000
    || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))
    || (draft ? value.authorization !== undefined : !plain(value.authorization) || value.authorization.publicInputOnly !== true
      || value.authorization.maximumAmountMinor !== '0' || !HASH.test(value.authorization.sourceHash ?? '')
      || Object.keys(value.authorization).some(key => !['publicInputOnly', 'maximumAmountMinor', 'sourceHash',
        'humanContactAuthorized', 'purchasesAuthorized'].includes(key))
      || value.authorization.humanContactAuthorized !== undefined && value.authorization.humanContactAuthorized !== false
      || value.authorization.purchasesAuthorized !== undefined && value.authorization.purchasesAuthorized !== false)
    || value.route?.kind !== A2A_TASK_ROUTE_KIND || value.route.headersFile !== undefined
    || value.route.quote !== undefined || value.route.reserve !== undefined
    || Buffer.byteLength(JSON.stringify(value)) > 24000) fail('RESOURCE_INVALID');
  validateA2AResourceRoute(value.route, 'execution');
  const allowed = ['kind', 'protocol', 'origin', 'providerRef', 'sourceUrl', 'sourceHash', 'a2a', 'execute', 'status', 'release', 'executionNode'];
  if (Object.keys(value.route).some(key => !allowed.includes(key))
    || typeof value.route.providerRef !== 'string' || value.route.providerRef.length > 200
    || Object.keys(value.route.a2a).some(key => !['endpoint', 'protocolVersion', 'protocolBinding', 'agentCardHash', 'tenant'].includes(key)))
    fail('PUBLIC_ROUTE_FIELDS_INVALID');
  for (const endpoint of [value.route.a2a.endpoint, value.route.sourceUrl]) publicAgentUrl(endpoint);
  if (value.route.execute.rpcMethod !== 'SendMessage' || value.route.release.rpcMethod !== 'CancelTask'
    || Object.keys(value.route.execute.fields).length || Object.keys(value.route.status.fields).length
    || Object.keys(value.route.release.fields).length) fail('RESOURCE_OPERATION_INVALID');
  const modes = value.route.execute.params.configuration?.acceptedOutputModes;
  if (!Array.isArray(modes) || !modes.length || modes.length > 16 || modes.some(mode => typeof mode !== 'string' || mode.length > 100)
    || digest(value.route.execute.params) !== digest({ message: { parts: { $ref: '/input/parts' } }, configuration: { acceptedOutputModes: modes } })
    || digest(value.route.status.params) !== digest({ id: { $ref: '/execution/remoteTaskId' } })
    || digest(value.route.release.params) !== digest({ id: { $ref: '/execution/remoteTaskId' } })) fail('RESOURCE_OPERATION_INVALID');
  // A public connection cannot smuggle credentials in its endpoint or header
  // overrides. The resource installation API owns any local Node placement.
  for (const operation of ['execute', 'status', 'release']) {
    if (Object.keys(value.route[operation]).some(key => !['rpcMethod', 'params', 'fields', 'waitForTaskMs'].includes(key)))
      fail('RESOURCE_OPERATION_INVALID');
  }
  if (value.discovery !== undefined) validateDiscovery(value.discovery, value.route);
  digest(value); return structuredClone(value);
}

export const validateA2ATaskResource = value => validateResource(value, false);
export const validateA2ATaskResourceDraft = value => validateResource(value, true);

export function loadA2ATaskResourceCatalog(nodeDirectory) {
  const directory = path.join(nodeDirectory, 'connections', 'a2a-task-resources');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => /^[A-Za-z][A-Za-z0-9_-]{0,63}\.json$/u.test(name)).sort().map(name => {
    const resource = validateA2ATaskResource(read(path.join(directory, name)));
    if (name !== `${resource.id}.json`) fail('RESOURCE_ID_CHANGED');
    return resource;
  });
}

export async function discoverA2AExecutionResource({ id, url, providerRef, expiresAt, authorization, description,
  allowedOrigins, fetchImpl = fetch, previewOnly = false }) {
  const cardUrl = publicAgentUrl(url);
  const observed = await discoverA2AAgentCard({ url: cardUrl.href, allowedOrigins, fetchImpl });
  if (observed.authenticationRequired) fail('PUBLIC_RESOURCE_REQUIRES_AUTHENTICATION');
  const publicOutputPolicy = 'ARTIFACT_PARTS_ONLY';
  const discovery = freezeA2ASkillDiscovery(observed);
  const declaredOutputSets = [discovery.defaultOutputModes ?? [], ...discovery.skills.map(skill => skill.outputModes ?? [])];
  if (declaredOutputSets.some(modes => !Array.isArray(modes))) fail('DISCOVERY_METADATA_INVALID');
  const acceptedOutputModes = [...new Set(declaredOutputSets.flat())];
  if (!acceptedOutputModes.length || acceptedOutputModes.length > 16) fail('DECLARED_OUTPUT_MODES_UNAVAILABLE');
  const draft = validateA2ATaskResourceDraft({ schema: A2A_TASK_RESOURCE_SCHEMA,
    id: id ?? `a2a_${digest({ source: observed.source, agentCardHash: digest(observed.card), publicOutputPolicy,
      discoverySchema: A2A_TASK_DISCOVERY_SCHEMA_V2 }).slice(7, 39)}`,
    name: observed.card.name, description: description ?? observed.card.description, expiresAt,
    // This local publication policy is frozen into owner review, independent
    // of card descriptions. Existing records without it keep their contract.
    publicOutputPolicy,
    discovery,
    route: buildA2AExecutionRoute({ card: observed.card, source: observed.source,
      // This explicit v2 union only declares acceptable response media types;
      // it does not add a provider-side skill selector or change older routes.
      providerRef: providerRef ?? `a2a_agent_${digest({ agentCardUrl: cardUrl.href }).slice(7, 39)}`, allowedOrigins, acceptedOutputModes }) });
  const result = { source: observed.source, supportedSkills: draft.discovery.skills,
    accessPriceVerifiedByCard: false, sourceIsSupplierAcceptance: false, capacityReserved: false,
    independentIdentityProven: false, taskSubmissionCalls: 0, graphCapabilitiesChanged: false };
  if (previewOnly) {
    if (authorization !== undefined) fail('PREVIEW_CANNOT_AUTHORIZE');
    return { ...result, resourceDraft: draft, resourceDraftHash: digest(draft), installed: false };
  }
  const resource = validateA2ATaskResource({ ...draft, authorization });
  return { ...result, resource, connectionHash: digest(resource) };
}

const outputPhase = output => {
  const parts = [...(output?.artifacts ?? []).flatMap(artifact => artifact.parts), ...(output?.message?.parts ?? [])];
  if (parts.some(part => typeof part.text === 'string' && part.text.trim().length
    || Object.hasOwn(part, 'data') || typeof part.raw === 'string' && /^[A-Za-z0-9+/]+={0,2}$/u.test(part.raw)
      && Buffer.from(part.raw, 'base64').toString('base64') === part.raw)) return 'ARTIFACT_AVAILABLE';
  return parts.some(part => Object.hasOwn(part, 'url')) ? 'FILE_REFERENCE_AVAILABLE' : 'COMPLETED_WITHOUT_ARTIFACT';
};
const phaseFor = receipt => receipt.authorizationRequired ? 'AUTH_REQUIRED' : receipt.inputRequired ? 'INPUT_REQUIRED'
  : receipt.httpAccepted !== true ? 'RECONCILIATION_REQUIRED'
    : receipt.remoteTaskState === 'TASK_STATE_COMPLETED' || receipt.providerOutput?.message ? outputPhase(receipt.providerOutput)
      : receipt.remoteTaskState === 'TASK_STATE_FAILED' ? 'FAILED'
        : receipt.remoteTaskState === 'TASK_STATE_CANCELED' ? 'CANCELED'
          : receipt.remoteTaskState === 'TASK_STATE_REJECTED' ? 'REJECTED' : 'RUNNING';

// Same call/inspect facade as a native route, so a named private Node can run
// this operation without becoming another order coordinator. release is only
// best-effort task cancellation; no seller reservation is invented or released.
export function createA2ATaskRoute(options) {
  if (options.route?.kind !== A2A_TASK_ROUTE_KIND) fail('ROUTE_INVALID');
  const native = createA2AResourceRoute(options);
  return Object.freeze({ inspect: native.inspect, async call(phase, context, operation = {}) {
    if (!['execute', 'status', 'release'].includes(phase)) fail('PHASE_UNSUPPORTED');
    if (phase === 'release') {
      const execution = context.execution;
      if (context.executionStarted === false || execution?.providerOutput?.message
        || A2A_TERMINAL_STATES.includes(execution?.remoteTaskState)) return {
        httpAccepted: true, closureStatus: 'CLOSED', requestNotSent: context.executionStarted === false,
        remoteTaskId: execution?.remoteTaskId ?? null, remoteTaskState: execution?.remoteTaskState ?? null,
        providerRef: options.route.providerRef, capacityReserved: false, reservationReleasePerformed: false,
        providerTaskCanceled: false, independentOutcomeEvidence: false };
      if (!execution?.remoteTaskId) fail('RESPONSE_UNRESOLVED_RECONCILIATION_REQUIRED');
    }
    const receipt = await native.call(phase, context, operation);
    return { ...receipt, taskPhase: phaseFor(receipt), capacityReserved: false,
      reservationReleasePerformed: false, acceptanceStatus: 'NOT_EVALUATED', semanticOutcomeSatisfied: false,
      independentOutcomeEvidence: false,
      ...(phase === 'release' ? { closureStatus: receipt.httpAccepted && A2A_TERMINAL_STATES.includes(receipt.remoteTaskState) ? 'CLOSED' : 'OPEN',
        providerTaskCanceled: receipt.httpAccepted && receipt.remoteTaskState === 'TASK_STATE_CANCELED' } : {}) };
  } });
}
