import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { connectShipmentTrackingPlatform, create17TrackShipmentAdapter, shipmentConnectionFile,
  shipmentConnectionStatus } from '../src/outsider-17track-shipment.js';
import { writePrivateExecutionRecordOnce as writeOnce } from '../src/outsider-user-held-durable-execution-v2.js';

const NOW = '2026-09-08T08:00:00.000Z', EXPIRES = '2026-09-09T08:00:00.000Z';
const TOKEN = 'fixture-17track-not-a-real-token';
const validInput = () => ({ apiToken: TOKEN, freeQuotaConfirmed: true, expiresAt: EXPIRES });
const read = file => JSON.parse(readFileSync(file));
const bytesHash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function fixture(t) {
  const nodeDirectory = realpathSync(mkdtempSync(path.join(tmpdir(), 'outsider-shipment-platform-')));
  t.after(() => rmSync(nodeDirectory, { recursive: true, force: true }));
  return { nodeDirectory, file: shipmentConnectionFile(nodeDirectory), folder: path.join(nodeDirectory, 'connections'), clock: () => NOW };
}

test('shipment platform connects after one quota read and the original adapter immediately reuses its private raw token', async t => {
  const f = fixture(t), calls = [], responseBytes = Buffer.from('{"code":0,"data":{"quota_remain":37,"quota_used":3}}');
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    assert.equal(url, 'https://api.17track.net/track/v2.4/getquota');
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.equal(init.body, '[]');
    assert.equal(init.headers['17token'], TOKEN);
    if (calls.length === 1) assert.equal(existsSync(f.folder), false, 'No credential is saved before successful verification');
    return new Response(responseBytes, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await connectShipmentTrackingPlatform({ ...f, input: validInput(), fetchImpl });
  assert.equal(result.state, 'CONNECTED'); assert.equal(result.connection.connected, true);
  assert.deepEqual(result.quota, { remaining: 37, used: 3, observedAt: NOW });
  assert.equal(result.shipmentRegistered, false); assert.equal(result.paymentPerformed, false);
  const profile = read(f.file);
  assert.equal(profile.provider, '17TRACK'); assert.equal(profile.freeQuotaApproved, true);
  assert.equal(profile.maximumChargeMinor, '0'); assert.equal(profile.expiresAt, EXPIRES);
  assert.equal(profile.freeQuotaScopeSource, 'EXPLICIT_OWNER_CONFIRMATION');
  assert.equal(profile.verification.bodyHash, bytesHash(responseBytes));
  assert.equal(statSync(f.file).mode & 0o777, 0o600); assert.equal(statSync(profile.apiKeyFile).mode & 0o777, 0o600);
  assert.equal(statSync(f.folder).mode & 0o777, 0o700);
  assert.equal(readFileSync(profile.apiKeyFile, 'utf8'), `${TOKEN}\n`, 'The existing adapter reads raw bytes, not a JSON string');
  const original = create17TrackShipmentAdapter({ nodeDirectory: f.nodeDirectory, directory: path.join(f.nodeDirectory, 'original-runtime'),
    fetchImpl, clock: f.clock });
  assert.equal((await original.quota()).remaining, 37);
  assert.deepEqual(calls.map(row => new URL(row.url).pathname.split('/').at(-1)), ['getquota', 'getquota']);
  const publicText = JSON.stringify({ result, status: shipmentConnectionStatus(f.nodeDirectory, f.clock) });
  assert.doesNotMatch(publicText, /fixture-17track-not-a-real-token|apiKeyFile|shipment-tracking-key|original-runtime/);
  assert.equal(publicText.includes(f.nodeDirectory), false);
});

test('shipment platform rejects missing free-quota consent and malformed input before any verification or private write', async t => {
  const f = fixture(t); let requests = 0;
  const fetchImpl = async () => { requests++; throw new Error('UNEXPECTED_REQUEST'); };
  const invalid = [null, [], {}, { ...validInput(), freeQuotaConfirmed: false }, { ...validInput(), freeQuotaConfirmed: 'true' },
    { ...validInput(), apiToken: '' }, { ...validInput(), apiToken: 'token\r\n17token: injected' },
    { ...validInput(), apiToken: 'x'.repeat(2049) }, { ...validInput(), expiresAt: NOW },
    { ...validInput(), expiresAt: 'not-a-date' }, { ...validInput(), expiresAt: '2026-09-09T08:00:00Z' },
    { ...validInput(), purchaseQuota: true }, { ...validInput(), endpoint: 'https://unrelated.example/' }];
  for (const input of invalid) await assert.rejects(connectShipmentTrackingPlatform({ ...f, input, fetchImpl }),
    { code: 'SHIPMENT_CONNECTION_INPUT_INVALID' });
  assert.equal(requests, 0); assert.deepEqual(readdirSync(f.nodeDirectory), []);
  assert.deepEqual(shipmentConnectionStatus(f.nodeDirectory, f.clock), { connected: false, reason: 'SHIPMENT_API_CONNECTION_REQUIRED' });
});

test('shipment platform refuses rejected, ambiguous, malformed or exhausted quota without retaining credentials', async t => {
  const cases = [
    [() => Response.json({ code: -1, message: TOKEN }), 'SHIPMENT_API_REJECTED'],
    [() => Response.json({ code: 0, data: { quota_remain: 0 } }), 'SHIPMENT_FREE_QUOTA_EXHAUSTED'],
    [() => Response.json({ code: 0, data: { quota_remain: -1 } }), 'SHIPMENT_API_QUOTA_INVALID'],
    [() => Response.json({ code: 0, data: { quota_remain: '10' } }), 'SHIPMENT_API_QUOTA_INVALID'],
    [() => Response.json({ code: 0, data: { quota_remain: 10, quota_used: -1 } }), 'SHIPMENT_API_QUOTA_INVALID'],
    [() => new Response('not-json'), 'SHIPMENT_API_RESPONSE_INVALID'],
    [() => new Response(TOKEN, { status: 401 }), 'SHIPMENT_TOKEN_VERIFICATION_HTTP_401'],
    [() => new Response('x'.repeat(65537)), 'SHIPMENT_API_RESPONSE_TOO_LARGE'],
    [() => { throw new Error(`Interrupted request using ${TOKEN}`); }, 'SHIPMENT_TOKEN_VERIFICATION_UNAVAILABLE'],
  ];
  for (const [response, code] of cases) {
    const f = fixture(t); let calls = 0;
    await assert.rejects(connectShipmentTrackingPlatform({ ...f, input: validInput(), fetchImpl: async (url, init) => {
      calls++; assert.equal(url, 'https://api.17track.net/track/v2.4/getquota'); assert.equal(init.body, '[]'); return response();
    } }), error => { assert.equal(error.code, code); assert.equal(error.message, code); assert.equal(error.message.includes(TOKEN), false); return true; });
    assert.equal(calls, 1); assert.deepEqual(readdirSync(f.nodeDirectory), []);
    assert.equal(shipmentConnectionStatus(f.nodeDirectory, f.clock).connected, false);
  }
});

test('shipment platform never replaces an existing historical profile or key, including after its original expiry', async t => {
  const f = fixture(t); mkdirSync(f.folder, { mode: 0o700 });
  const keyFile = path.join(f.folder, 'historical-key.txt'); writeFileSync(keyFile, 'historical-fixture-token\n', { mode: 0o600 });
  const oldProfile = { provider: '17TRACK', apiKeyFile: keyFile, freeQuotaApproved: true, maximumChargeMinor: '0', expiresAt: EXPIRES };
  writeOnce(f.file, oldProfile);
  const before = [readFileSync(f.file), readFileSync(keyFile)], fetchImpl = async () => assert.fail('Existing connections must not send a new credential');
  const unchanged = await connectShipmentTrackingPlatform({ ...f, input: validInput(), fetchImpl });
  assert.equal(unchanged.state, 'ALREADY_CONNECTED'); assert.equal(unchanged.connection.connected, true);
  const expired = await connectShipmentTrackingPlatform({ ...f, clock: () => '2026-09-10T08:00:00.000Z',
    input: { ...validInput(), expiresAt: '2026-09-11T08:00:00.000Z' }, fetchImpl });
  assert.equal(expired.state, 'ALREADY_CONNECTED'); assert.equal(expired.connection.connected, false);
  assert.deepEqual([readFileSync(f.file), readFileSync(keyFile)], before);
  assert.deepEqual(readdirSync(f.folder).sort(), ['historical-key.txt', 'shipment-tracking.json']);
});

test('shipment platform freezes the verified credential and expiry across the quota await and refuses a verification finishing too late', async t => {
  const f = fixture(t), input = validInput();
  const connected = await connectShipmentTrackingPlatform({ ...f, input, fetchImpl: async (url, init) => {
    assert.equal(init.headers['17token'], TOKEN);
    input.apiToken = 'changed-after-request'; input.expiresAt = '2027-09-09T08:00:00.000Z';
    return Response.json({ code: 0, data: { quota_remain: 1 } });
  } });
  assert.equal(connected.connection.connected, true);
  const profile = read(f.file);
  assert.equal(readFileSync(profile.apiKeyFile, 'utf8').trim(), TOKEN); assert.equal(profile.expiresAt, EXPIRES);
  const late = fixture(t); let now = NOW;
  await assert.rejects(connectShipmentTrackingPlatform({ ...late, input: validInput(), clock: () => now,
    fetchImpl: async () => { now = EXPIRES; return Response.json({ code: 0, data: { quota_remain: 10 } }); } }),
  { code: 'SHIPMENT_CONNECTION_VERIFICATION_EXPIRED' });
  assert.deepEqual(readdirSync(late.nodeDirectory), []);
});
