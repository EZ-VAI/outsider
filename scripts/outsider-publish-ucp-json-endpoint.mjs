// UCP businesses require application/json, which raw GitHub serves as text/plain.
// Publish a new immutable protocol-only endpoint in the existing Workers scope.
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writePrivateExecutionRecordOnce as writeOnce } from '../src/outsider-user-held-durable-execution-v2.js';
const [profileFile, outputDirectory] = process.argv.slice(2);
const config = JSON.parse(readFileSync(profileFile)).cloudflare;
const token = JSON.parse(readFileSync(config.workersCredentialsFile)).cloudflare.apiToken;
const bytes = readFileSync(new URL('../public/outsider-ucp-profile-2026-08-25.json', import.meta.url));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const name = `outsider-ucp-${sha256.slice(0, 16)}`;
const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${name}`;
const headers = { Authorization: `Bearer ${token}` };
const prior = await fetch(base, { headers, signal: AbortSignal.timeout(20000) });
if (prior.status !== 404) throw new Error(`UCP_ENDPOINT_ALREADY_EXISTS_OR_UNAVAILABLE_${prior.status}`);
const source = `const body=${JSON.stringify(bytes.toString('utf8'))};export default {async fetch(req){const u=new URL(req.url);if(req.method!=='GET'||u.pathname!=='/.well-known/ucp')return new Response('Not found',{status:404});return new Response(body,{headers:{'content-type':'application/json','cache-control':'public,max-age=3600'}});}};`;
const form = new FormData();
form.set('metadata', new Blob([JSON.stringify({ main_module: 'worker.mjs', compatibility_date: '2026-09-06' })], { type: 'application/json' }));
form.set('worker.mjs', new Blob([source], { type: 'application/javascript+module' }), 'worker.mjs');
for (const [url, method, body] of [[base, 'PUT', form], [`${base}/subdomain`, 'POST', JSON.stringify({ enabled: true, previews_enabled: false })]]) {
  const r = await fetch(url, { method, headers: { ...headers, ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) }, body, signal: AbortSignal.timeout(25000) });
  const d = await r.json(); if (!r.ok || !d.success) throw new Error(`UCP_ENDPOINT_DEPLOY_HTTP_${r.status}`);
}
const profileUrl = `https://${name}.${config.workersDevSubdomain}.workers.dev/.well-known/ucp`;
const check = await fetch(profileUrl, { signal: AbortSignal.timeout(20000) });
const observed = Buffer.from(await check.arrayBuffer());
if (check.status !== 200 || !observed.equals(bytes) || !check.headers.get('content-type')?.startsWith('application/json')) throw new Error('UCP_ENDPOINT_READBACK_MISMATCH');
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const result = { profileUrl, sha256, bytes: bytes.length, scriptName: name, readbackMatched: true, paymentAuthority: false };
writeOnce(path.join(outputDirectory, 'ucp-json-endpoint.json'), result);
console.log(JSON.stringify(result));
