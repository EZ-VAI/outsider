import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createA2AJsonRpcClient, selectA2AInterface, discoverA2AAgentCard } from '../src/outsider-a2a-protocol.js';
import { buildA2AResourceRoute, createA2AResourceRoute, isPendingA2AResourceTask } from '../src/outsider-a2a-native-resource.js';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';

const legacyCard = { name: 'Declared legacy agent', skills: [], protocolVersion: '0.3.0',
  preferredTransport: 'JSONRPC', url: 'https://provider.example/a2a' };
const source = { url: 'https://provider.example/.well-known/agent-card.json', sourceHash: digest(legacyCard) };
const root = t => { const directory = mkdtempSync(path.join(tmpdir(), 'outsider-a2a-compat-'));
  t.after(() => rmSync(directory, { recursive: true, force: true })); return directory; };
const send = { rpcMethod: 'SendMessage', params: { message: { parts: [{ data: { input: { $ref: '/input' } } }] } },
  fields: { accepted: '/task/artifacts/0/parts/0/data/accepted', answer: '/message/parts/1/data',
    sourceFile: '/task/artifacts/1/parts/0/url' } };
const phases = { quote: send, reserve: send, execute: send, release: send, ready: send, observe: send,
  status: { rpcMethod: 'GetTask', params: { id: { $ref: '/execution/remoteTaskId' } }, fields: send.fields } };

test('declared 0.3 JSON-RPC supports an operator-style direct Message without inventing a task', async () => {
  const selected = selectA2AInterface(legacyCard);
  assert.equal(selected.protocolVersion, '0.3.0');
  assert.throws(() => selectA2AInterface({ ...legacyCard, protocolVersion: '0.2.6' }), /UNSUPPORTED/u);
  assert.throws(() => selectA2AInterface(legacyCard, { allowedOrigins: ['https://other.example'] }), /NOT_APPROVED/u);
  assert.equal(selectA2AInterface({ ...legacyCard, supportedInterfaces: [
    { url: 'https://provider.example/v1', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }] }).protocolVersion, '1.0');
  assert.equal(selectA2AInterface({ ...legacyCard, preferredTransport: 'GRPC', additionalInterfaces: [
    { url: 'https://provider.example/jsonrpc', transport: 'JSONRPC' }] }).url, 'https://provider.example/jsonrpc');
  const discovered = await discoverA2AAgentCard({ url: source.url, fetchImpl: async () => Response.json({ ...legacyCard,
    security: [{ providerKey: [] }] }) });
  assert.equal(discovered.authenticationRequired, true); assert.equal(discovered.capacityAccepted, false);
  let sends = 0;
  const client = createA2AJsonRpcClient({ agentInterface: selected, fetchImpl: async (_url, options) => {
    sends++; const request = JSON.parse(options.body);
    assert.equal(options.headers['a2a-version'], '0.3.0');
    assert.equal(request.method, 'message/send'); assert.equal(request.params.message.kind, 'message');
    assert.equal(request.params.message.role, 'user'); assert.equal(request.params.configuration.blocking, false);
    assert.equal(Object.hasOwn(request.params.configuration, 'returnImmediately'), false);
    assert.deepEqual(request.params.message.parts, [{ kind: 'data', data: { skill: 'calculator', input: { publicValue: 4 } } }]);
    return Response.json({ jsonrpc: '2.0', id: request.id, result: { kind: 'message', role: 'agent',
      messageId: 'operator-reply', parts: [{ kind: 'text', text: 'Computed result' }, { kind: 'data', data: { answer: 8 } }] } });
  } });
  const receipt = await client.call('SendMessage', { message: { messageId: 'calculation-1', role: 'ROLE_USER',
    parts: [{ data: { skill: 'calculator', input: { publicValue: 4 } } }] }, configuration: { returnImmediately: true } });
  assert.equal(receipt.ok, true); assert.equal(receipt.result.message.role, 'ROLE_AGENT');
  assert.deepEqual(receipt.result.message.parts[1], { data: { answer: 8 } });
  assert.equal(receipt.result.task, undefined);
  assert.equal(JSON.parse(Buffer.from(receipt.bodyBase64, 'base64')).result.kind, 'message', 'raw operator response is retained');
  await assert.rejects(client.call('ListTasks', {}), /METHOD_UNSUPPORTED/u);
  assert.equal(sends, 1, 'unsupported legacy method does not guess or retry a wire method');
});

test('0.3 pending tasks resume across restart and preserve task identity, artifacts and unknown state', async t => {
  const route = buildA2AResourceRoute({ card: legacyCard, source, providerRef: 'declared-provider', phases });
  assert.equal(route.protocol, 'A2A_0_3_JSONRPC');
  const directory = root(t), requests = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    const task = { kind: 'task', id: 'remote-legacy-task', contextId: 'legacy-context',
      status: { state: requests.length === 1 ? 'unknown' : 'completed' }, artifacts: [
        { artifactId: 'allocation', parts: [{ kind: 'data', data: { accepted: true } }] },
        { artifactId: 'file', parts: [{ kind: 'file', file: { uri: 'https://provider.example/output',
          name: 'output.json', mimeType: 'application/json' } }] }] };
    return Response.json({ jsonrpc: '2.0', id: request.id, result: task });
  };
  const initial = await createA2AResourceRoute({ directory, route, fetchImpl })
    .call('reserve', { input: { publicValue: 4 } }, { effect: true, operationId: 'original-reservation' });
  assert.equal(initial.remoteTaskState, 'TASK_STATE_UNSPECIFIED'); assert.equal(isPendingA2AResourceTask(initial), true);
  assert.equal(initial.protocolMintsCapacity, false);
  const reloaded = createA2AResourceRoute({ directory, route, fetchImpl });
  const final = await reloaded.call('reserve', { input: { publicValue: 4 } }, { effect: true, operationId: 'original-reservation' });
  assert.equal(final.remoteTaskState, 'TASK_STATE_COMPLETED'); assert.equal(final.accepted, true);
  assert.equal(final.sourceFile, 'https://provider.example/output');
  assert.deepEqual(requests.map(r => r.method), ['message/send', 'tasks/get']);
  assert.equal(requests[1].params.id, 'remote-legacy-task');
  await reloaded.call('reserve', { input: { publicValue: 4 } }, { effect: true, operationId: 'original-reservation' });
  assert.equal(requests.length, 2);
  const wrong = createA2AJsonRpcClient({ agentInterface: selectA2AInterface(legacyCard), fetchImpl: async (_url, options) =>
    Response.json({ jsonrpc: '2.0', id: JSON.parse(options.body).id,
      result: { kind: 'task', id: 'another-task', status: { state: 'completed' } } }) });
  await assert.rejects(wrong.call('GetTask', { id: initial.remoteTaskId }), /TASK_INVALID/u);
});

test('quote, readiness and observation SendMessage persist intent before an unknown response and never resend', async t => {
  const route = buildA2AResourceRoute({ card: legacyCard, source, providerRef: 'declared-provider', phases });
  const directory = root(t); let sends = 0;
  const fetchImpl = async () => { sends++; throw new TypeError('Response lost after public query submission'); };
  for (const phase of ['quote', 'ready', 'observe']) {
    const operationId = `original-${phase}`;
    await assert.rejects(createA2AResourceRoute({ directory, route, fetchImpl })
      .call(phase, { input: {} }, { operationId }), TypeError);
    const reloaded = createA2AResourceRoute({ directory, route, fetchImpl });
    assert.deepEqual(reloaded.inspect(phase, { operationId }), { started: true, projection: null });
    await assert.rejects(reloaded.call(phase, { input: {} }, { operationId }), /UNRESOLVED_RECONCILIATION_REQUIRED/u);
  }
  assert.equal(sends, 3);
});
