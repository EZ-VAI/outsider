/* Deno's official v2 API; one reusable platform connection, one native app per
 * order. No browser, GitHub installation, shell or deployment CLI per order.
 * https://console.deno.com/api/v2/docs */
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalizeStrict } from './canonical.js';
import { softwareBytesHash as hash } from './outsider-github-public-build.js';
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from './outsider-user-held-durable-execution-v2.js';
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const exec = promisify(execFile);
async function readToken(connection) {
  if (connection.keychain?.service === 'ai.outsider.deno-deploy'
    && /^outsider-deno-[a-z0-9-]{3,90}$/u.test(connection.keychain.account ?? '')) {
    try { return (await exec('/usr/bin/security', ['find-generic-password', '-s', connection.keychain.service,
      '-a', connection.keychain.account, '-w'], { timeout: 15000, maxBuffer: 8192 })).stdout.trim(); }
    catch { throw new Error('DENO_KEYCHAIN_ACCESS_UNAVAILABLE'); }
  }
  // Private-file credentials are supported for non-macOS deployments.
  return read(connection.credentialsFile).apiToken;
}
export async function connectDenoDeployPlatform({ nodeDirectory, input, fetchImpl = fetch }) {
  if (!input || Object.keys(input).sort().join(',') !== 'apiToken,expiresAt,freePlanConfirmed,organizationSlug'
    || typeof input.apiToken !== 'string' || !/^[A-Za-z0-9._~-]{20,2048}$/u.test(input.apiToken)
    || !/^[a-z0-9-]{3,64}$/u.test(input.organizationSlug ?? '') || input.freePlanConfirmed !== true
    || Date.parse(input.expiresAt) <= Date.now() || Date.parse(input.expiresAt) > Date.now() + 7*86400000)
    throw new Error('DENO_CONNECTION_INPUT_INVALID');
  const folder = path.join(nodeDirectory, 'connections'), file = path.join(folder, 'deno-deploy.json');
  if (existsSync(file)) throw new Error('DENO_PLATFORM_ALREADY_CONNECTED');
  const response = await fetchImpl('https://api.deno.com/v2/apps', { headers: { authorization: `Bearer ${input.apiToken}` },
    redirect: 'error', signal: AbortSignal.timeout(20000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200) throw new Error(`DENO_TOKEN_VERIFICATION_HTTP_${response.status}`);
  JSON.parse(bytes);
  const keychain = { service: 'ai.outsider.deno-deploy', account: `outsider-deno-${randomUUID()}` };
  // Interactive stdin keeps the new token out of process arguments and logs.
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/security', ['-i'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let diagnostic = '';
    child.stdout.resume(); child.stderr.on('data', bytes => { diagnostic += bytes.toString(); });
    child.once('error', () => reject(new Error('DENO_KEYCHAIN_SAVE_FAILED')));
    child.once('close', code => code === 0 && !/SecKeychain|Error:|error:/u.test(diagnostic)
      ? resolve() : reject(new Error('DENO_KEYCHAIN_SAVE_FAILED')));
    child.stdin.end(`add-generic-password -a ${keychain.account} -s ${keychain.service} -w "${input.apiToken}"\n`);
  });
  const connection = { schema: 'outsider/deno-deploy-connection/v1', plan: 'FREE', organizationSlug: input.organizationSlug,
    keychain, expiresAt: new Date(input.expiresAt).toISOString(), connectedAt: new Date().toISOString(),
    verification: { method: 'GET', route: '/v2/apps', status: response.status, bodyHash: hash(bytes) },
    billingScope: 'EXISTING_FREE_PLAN_NO_UPGRADE_OR_PAYMENT' };
  if (await readToken(connection) !== input.apiToken) throw new Error('DENO_KEYCHAIN_READBACK_FAILED');
  mkdirSync(folder, { recursive: true, mode: 0o700 }); writeOnce(file, connection);
  return { connected: true, provider: 'deno', plan: 'FREE', organizationSlug: connection.organizationSlug,
    expiresAt: connection.expiresAt, credentialStorage: 'MACOS_KEYCHAIN', paymentPerformed: false };
}
export function loadDenoDeployConnection(nodeDirectory) {
  const file = path.join(nodeDirectory, 'connections', 'deno-deploy.json');
  if (!existsSync(file)) return null;
  const c = read(file);
  if (c.schema !== 'outsider/deno-deploy-connection/v1' || c.plan !== 'FREE'
    || !(path.isAbsolute(c.credentialsFile ?? '') || c.keychain?.service === 'ai.outsider.deno-deploy')
    || !Number.isFinite(Date.parse(c.expiresAt)))
    throw new Error('DENO_DEPLOY_CONNECTION_INVALID');
  return c;
}
export function createDenoDeployRuntime({ directory, connection, packet, sourceHash, namespace, expiresAt,
  fetchImpl = fetch, clock = () => new Date().toISOString(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!connection || connection.plan !== 'FREE' || Date.parse(connection.expiresAt) < Date.parse(expiresAt))
    throw new Error('DENO_FREE_EXECUTION_CONNECTION_REQUIRED');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  const owner = hash(Buffer.from(namespace)).slice(7, 31), slug = `outsider-${owner.slice(0,22)}`;
  const labels = { 'custom.outsider_order': owner, 'custom.source_hash': sourceHash };
  const wrapper = `import app from './${packet.entry}';\nDeno.serve(request=>Date.now()>=${Date.parse(expiresAt)}?Response.json({expired:true},{status:410}):app.fetch(request,{},{}));\n`;
  const config = { runtime: { type: 'dynamic', entrypoint: 'outsider-deno.mjs' }, crons: false };
  async function exchange(method, route, body, name = `source-${randomUUID()}`) {
    const apiToken = await readToken(connection);
    if (typeof apiToken !== 'string' || apiToken.length < 16) throw new Error('DENO_TOKEN_NOT_CONNECTED');
    const response = await fetchImpl(`https://api.deno.com${route}`, { method,
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(25000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 512*1024) throw new Error('DENO_RESPONSE_TOO_LARGE');
    const receipt = { sourceKind: 'DENO_DEPLOY_V2_API', method, route, status: response.status, observedAt: clock(),
      bodyBase64: bytes.toString('base64'), bodyHash: hash(bytes) };
    writeOnce(file(name), receipt);
    let value; try { value = JSON.parse(bytes); } catch {}
    return { status: response.status, value, receiptHash: hash(bytes) };
  }
  const owned = app => app?.slug === slug && Object.entries(labels).every(([k,v]) => app.labels?.[k] === v);
  const access = () => read(file('allocation')).adapterState;
  return { providerRef: 'deno',
    get routeUrl() { return existsSync(file('allocation')) ? access().routeUrl : null; },
    async access() { return access(); },
    async reserve() {
      if (existsSync(file('allocation'))) return read(file('allocation'));
      let app = await exchange('GET', `/v2/apps/${slug}`);
      if (app.status === 404) {
        if (existsSync(file('create-attempt'))) throw new Error('DENO_APP_CREATION_UNRESOLVED');
        writeOnce(file('create-attempt'), { slug, labels, attemptedAt: clock() });
        app = await exchange('POST', '/v2/apps', { slug, labels, config, layers: [], env_vars: [] }, 'create-response');
      }
      if (app.status < 200 || app.status >= 300 || !owned(app.value)) throw new Error(`DENO_APP_NOT_ACCEPTED_${app.status}`);
      writeOnce(file('app'), { id: app.value.id, slug, labels });
      let revision;
      if (existsSync(file('deploy-response'))) {
        revision = JSON.parse(Buffer.from(read(file('deploy-response')).bodyBase64, 'base64'));
      } else {
        if (existsSync(file('deploy-attempt'))) throw new Error('DENO_DEPLOYMENT_UNRESOLVED');
        writeOnce(file('deploy-attempt'), { appId: app.value.id, sourceHash, attemptedAt: clock() });
        const deployed = await exchange('POST', `/v2/apps/${app.value.id}/deploy`, { assets: Object.fromEntries(
          Object.entries({ ...packet.files, 'outsider-deno.mjs': wrapper }).map(([name, content]) => [name, { kind: 'file', encoding: 'utf-8', content }])),
          config, labels, layers: [], env_vars: [], production: true, preview: false }, 'deploy-response');
        if (deployed.status !== 202) throw new Error(`DENO_DEPLOY_NOT_ACCEPTED_${deployed.status}`);
        revision = deployed.value;
      }
      if (typeof revision?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/u.test(revision.id)) throw new Error('DENO_REVISION_ID_MISSING');
      let current;
      for (let n=0; n<20; n++) {
        current = await exchange('GET', `/v2/revisions/${revision.id}`);
        if (current.value?.status === 'succeeded') break;
        if (['failed','skipped'].includes(current.value?.status)) throw new Error('DENO_NATIVE_BUILD_FAILED');
        await wait(2000);
      }
      const hostname = current?.value?.timelines?.filter(t=>t.context === 'Production').flatMap(t=>t.hostnames??[])
        .find(host=>/^[a-z0-9.-]+\.deno\.net$/u.test(host));
      if (current?.value?.status !== 'succeeded' || !hostname) throw new Error('DENO_DEPLOY_STILL_PENDING');
      const result = { status: 'RESERVED', reservationId: `deno:${app.value.id}:${revision.id}`, validUntil: expiresAt,
        providerReceipt: { appId: app.value.id, revisionId: revision.id, buildReadback: current.receiptHash, sourceHash },
        adapterState: { routeUrl: `https://${hostname}/`, invokeUrl: `https://${hostname}/evaluate`, observeUrl: `https://${hostname}/evaluate`,
          allocationBasis: 'PROVISIONED_NATIVE_RUNTIME_NOT_SLA', sourceHash, appId: app.value.id, revisionId: revision.id } };
      writeOnce(file('allocation'), result); return result;
    },
    async exercise() {
      const checks = await Promise.all(packet.checks.map(async test => {
        const response = await fetchImpl(new URL(test.path, access().routeUrl), { method: test.method,
          headers: { 'content-type': 'application/json' }, ...(test.body === null ? {} : { body: test.body }),
          redirect: 'error', signal: AbortSignal.timeout(15000) });
        const bytes = Buffer.from(await response.arrayBuffer()); let value; try { value = JSON.parse(bytes); } catch {}
        const result = { method: test.method, path: test.path, status: response.status, responseHash: hash(bytes),
          matched: response.status === test.expectedStatus && value !== undefined && canonicalizeStrict(value) === canonicalizeStrict(JSON.parse(test.expectedBody)) };
        writeOnce(file(`effect-${randomUUID()}`), { ...result, observedAt: clock(), bodyBase64: bytes.toString('base64') }); return result;
      }));
      return { status: checks.every(c=>c.matched) ? 'SUCCEEDED' : 'FAILED', checks, providerRef: 'deno',
        localExecutionUsed: false, observationIndependentlyOperated: false };
    },
    async release() {
      if (existsSync(file('released'))) return read(file('released'));
      const current = await exchange('GET', `/v2/apps/${slug}`);
      if (current.status !== 404) {
        if (!owned(current.value)) throw new Error('DENO_APP_OWNERSHIP_CHANGED');
        const removed = await exchange('DELETE', `/v2/apps/${current.value.id}`);
        if (![200,202,204,404].includes(removed.status)) throw new Error('DENO_APP_RELEASE_NOT_ACCEPTED');
        const after = await exchange('GET', `/v2/apps/${slug}`);
        if (after.status !== 404) throw new Error('DENO_APP_RELEASE_NOT_CONFIRMED');
      }
      const result = { status: 'CLOSED', receipt: { activeAppRemoved: true, physicalErasureClaimed: false } };
      writeOnce(file('released'), result); return result;
    }
  };
}
