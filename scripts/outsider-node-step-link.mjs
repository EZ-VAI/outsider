#!/usr/bin/env node
/* One-time operator setup for an existing local Node and hosted coordinator.
 * The request file selects local routes and an explicit grant. It is never
 * supplied by an order, and no provider secret is uploaded to the coordinator. */
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from '../src/outsider-user-held-durable-execution-v2.js';
import { NODE_STEP_GRANT_SCHEMA, NODE_STEP_OWNER_PATH, nodeResourceRouteHash, validateNodeStepGrant }
  from '../src/outsider-node-step-relay.js';

export async function connectNodeStepWorker(request, { fetchImpl = fetch } = {}) {
  for (const field of ['nodeDirectory', 'ownerCredentialFile', 'authorizationSourceFile'])
    if (!path.isAbsolute(request?.[field] ?? '')) throw new Error('NODE_STEP_SETUP_PATH_INVALID');
  const origin = new URL(request.coordinatorOrigin);
  if (origin.protocol !== 'https:' || origin.href !== `${origin.origin}/` || origin.username || origin.password)
    throw new Error('NODE_STEP_SETUP_ORIGIN_INVALID');
  if (!Array.isArray(request.connections) || request.connections.some(row => !row.route || row.route.executionNode))
    throw new Error('NODE_STEP_SETUP_CONNECTION_INVALID');
  const authorization = JSON.parse(readPrivateExecutionBytes(request.authorizationSourceFile));
  const grant = validateNodeStepGrant({ schema: NODE_STEP_GRANT_SCHEMA, nodeId: request.nodeId,
    expiresAt: request.expiresAt, maximumOperations: request.maximumOperations,
    publicInputOnly: true, maximumAmountMinor: '0', authorizationSourceHash: digest(authorization),
    connections: request.connections.map(row => ({ connectionId: row.connectionId, providerRef: row.route.providerRef,
      routeHash: nodeResourceRouteHash(row.route), phases: row.phases })) });
  const connectionsRoot = path.join(request.nodeDirectory, 'connections');
  const workerFile = path.join(connectionsRoot, 'node-step-worker.json');
  if (existsSync(workerFile)) throw new Error('NODE_STEP_SETUP_WORKER_ALREADY_CONFIGURED');
  mkdirSync(connectionsRoot, { recursive: true, mode: 0o700 });
  const credentialFile = path.join(connectionsRoot, `node-step-${grant.nodeId}-token.txt`);
  if (existsSync(credentialFile)) throw new Error('NODE_STEP_SETUP_CREDENTIAL_ALREADY_EXISTS');
  const owner = readPrivateExecutionBytes(request.ownerCredentialFile).toString('utf8').trim();
  const response = await fetchImpl(`${origin.origin}${NODE_STEP_OWNER_PATH}`, { method: 'POST',
    headers: { authorization: `Bearer ${owner}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'REGISTER', grant }), redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (response.status !== 201) throw new Error('NODE_STEP_SETUP_REGISTRATION_FAILED');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 12000) throw new Error('NODE_STEP_SETUP_RESPONSE_TOO_LARGE');
  const result = JSON.parse(bytes.toString('utf8'));
  if (result.nodeId !== grant.nodeId || result.grantHash !== digest(grant)
    || !/^[A-Za-z0-9_-]{43}$/u.test(result.credential ?? '')) throw new Error('NODE_STEP_SETUP_BINDING_MISMATCH');
  writeFileSync(credentialFile, `${result.credential}\n`, { mode: 0o600, flag: 'wx' });
  writeOnce(workerFile, { schema: 'outsider/node-step-worker/v1', coordinatorOrigin: origin.origin, grant,
    credentialFile, connections: request.connections.map(({ connectionId, route }) => ({ connectionId, route })) });
  return { nodeId: grant.nodeId, grantHash: result.grantHash, workerFile, expiresAt: grant.expiresAt,
    connectionCount: grant.connections.length, restartLocalNodeRequired: true, providerCredentialsTransferred: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3 || !path.isAbsolute(process.argv[2])) throw new Error('NODE_STEP_SETUP_REQUEST_FILE_REQUIRED');
    const result = await connectNodeStepWorker(JSON.parse(readPrivateExecutionBytes(process.argv[2])));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${/^NODE_STEP_[A-Z_]+$/u.test(error?.message ?? '') ? error.message : 'NODE_STEP_SETUP_FAILED'}\n`);
    process.exitCode = 1;
  }
}
