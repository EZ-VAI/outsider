import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalizeStrict } from '../src/canonical.js';
import { publishPrivateExecutionBytes } from '../src/outsider-user-held-durable-execution-v2.js';
import { createSharedResourceCoordinator } from '../src/outsider-shared-resource-coordinator.js';

const digest = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;
const escape = value => value.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** An owner-managed webpage, two authenticated agents, one actual write path.
 * The page and provider operation receipts commit in the same atomic file.
 * Replace this adapter with a real owner integration to coordinate another resource.
 */
export async function startSharedPage({ directory = mkdtempSync(path.join(tmpdir(), 'outsider-shared-page-')) } = {}) {
  const file = path.join(directory, 'page.json');
  const save = value => publishPrivateExecutionBytes(file, Buffer.from(canonicalizeStrict(value)), { replace: true });
  if (!existsSync(file)) save({ heading: 'A page shared by two agents', highestFence: 0, operations: {} });
  const read = () => JSON.parse(readFileSync(file, 'utf8'));
  const actors = Object.fromEntries(['personal-agent', 'company-agent'].map(actor => [actor, randomBytes(24).toString('hex')]));
  const coordinator = createSharedResourceCoordinator({ directory, resourceId: 'shared-page',
    authorize: ({ actorId }) => Object.hasOwn(actors, actorId),
    adapter: {
      async observe() { return { heading: read().heading }; },
      async execute({ operationId, action, fencingToken, expectedStateHash }) {
        if (typeof action?.heading !== 'string' || action.heading.length < 1 || action.heading.length > 200) throw new Error('INVALID_HEADING');
        const page = read();
        if (page.operations[operationId]) return page.operations[operationId];
        if (fencingToken < page.highestFence || digest({ heading: page.heading }) !== expectedStateHash) return { status: 'NOT_APPLIED' };
        page.highestFence = fencingToken; page.heading = action.heading;
        const result = { status: 'APPLIED', operationId };
        page.operations[operationId] = result; save(page);
        return result;
      },
      async reconcile({ operationId }) { return read().operations[operationId] ?? { status: 'NOT_APPLIED' }; },
    } });
  const methods = new Set(['observe', 'acquire', 'renew', 'execute', 'reconcile', 'release', 'inspect']);
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta charset="utf-8"><title>Outsider shared page</title><main><h1>${escape(read().heading)}</h1><p>Writes are coordinated through the owner's authenticated gateway.</p></main>`);
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    const actorId = Object.keys(actors).find(actor => request.headers.authorization === `Bearer ${actors[actor]}`);
    if (!actorId) { response.writeHead(401).end(JSON.stringify({ error: 'AUTHENTICATION_REQUIRED' })); return; }
    const method = request.url?.replace(/^\/v1\//u, '');
    if (request.method !== 'POST' || !methods.has(method)) { response.writeHead(404).end('{}'); return; }
    try {
      let bytes = 0; const chunks = [];
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 16_384) throw new Error('REQUEST_TOO_LARGE'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const result = await coordinator[method]({ ...input, actorId });
      response.end(JSON.stringify(result));
    } catch (error) { response.writeHead(409).end(JSON.stringify({ error: error.code ?? 'REQUEST_FAILED' })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, actors, directory,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const runtime = await startSharedPage();
  if (process.argv.includes('--once')) {
    const call = async (actor, method, input = {}) => {
      const response = await fetch(`${runtime.origin}/v1/${method}`, { method: 'POST',
        headers: { authorization: `Bearer ${runtime.actors[actor]}`, 'content-type': 'application/json' }, body: JSON.stringify(input) });
      return { status: response.status, result: await response.json() };
    };
    try {
      const personal = (await call('personal-agent', 'acquire')).result;
      const conflict = await call('company-agent', 'acquire');
      const write = (lease, operationId, heading) => ({ leaseId: lease.leaseId, fencingToken: lease.fencingToken,
        operationId, action: { heading }, expectedVersion: lease.snapshot.version, expectedStateHash: lease.snapshot.stateHash });
      const first = await call('personal-agent', 'execute', write(personal, 'personal-edit', 'Personal agent drafted the page'));
      await call('personal-agent', 'release', personal);
      const company = (await call('company-agent', 'acquire')).result;
      const second = await call('company-agent', 'execute', write(company, 'company-edit', 'Personal draft + company review'));
      await call('company-agent', 'release', company);
      if (conflict.result.error !== 'SHARED_RESOURCE_BUSY' || first.result.status !== 'APPLIED' || second.result.status !== 'APPLIED') throw new Error('DEMO_FAILED');
      console.log(JSON.stringify({ conflict: conflict.result.error, first: first.result.status, second: second.result.status,
        finalPage: await (await fetch(runtime.origin)).text(), directory: runtime.directory }, null, 2));
    } finally { await runtime.close(); }
  } else {
    console.log(JSON.stringify({ ...runtime, close: undefined }, null, 2));
    const stop = () => { void runtime.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }
}
