import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalizeStrict } from '../src/canonical.js';
import { publishPrivateExecutionBytes } from '../src/outsider-user-held-durable-execution-v2.js';
import { createSharedAgentLayer } from '../src/outsider-shared-agent-layer.js';
import { createSharedAgentClient, runSharedGoalWorker } from '../src/outsider-shared-agent-client.js';

const digest = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;
const visible = page => ({ heading: page.heading, price: page.price, published: page.published, footer: page.footer });
const escape = value => String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** Actual HTTP and file-backed page; scripted workers stand in for providers.
 * Replace executeDemoTask with an agent/tool loop, and the page adapter with the
 * owner's browser/device integration. Neither side needs the other's model SDK.
 */
export async function startSharedGoalsPage({ directory = mkdtempSync(path.join(tmpdir(), 'outsider-mutual-layer-')) } = {}) {
  const pageFile = path.join(directory, 'page.json');
  const save = page => publishPrivateExecutionBytes(pageFile, Buffer.from(canonicalizeStrict(page)), { replace: true });
  if (!existsSync(pageFile)) save({ heading: 'Waiting for the agents', price: null, published: false, footer: '',
    highestFence: 0, operations: {}, replyLostOnce: false });
  const read = () => JSON.parse(readFileSync(pageFile, 'utf8'));
  const actors = Object.fromEntries(['owner', 'personal-agent', 'company-agent', 'coding-agent']
    .map(actor => [actor, randomBytes(24).toString('hex')]));
  let reconciliations = 0;
  const layer = createSharedAgentLayer({ directory: path.join(directory, 'layer'),
    authorize: ({ actorId, operation }) => ['CREATE_GOAL', 'ACTIVATE_GOAL'].includes(operation)
      ? actorId === 'owner' : Object.hasOwn(actors, actorId),
    resources: { page: { adapter: {
      async observe() { return visible(read()); },
      async execute({ action, operationId, fencingToken, expectedStateHash }) {
        const page = read();
        if (Object.hasOwn(page.operations, operationId)) return page.operations[operationId];
        if (fencingToken < page.highestFence || expectedStateHash !== digest(visible(page))) return { status: 'NOT_APPLIED' };
        const patch = action?.patch;
        if (!patch || !Object.keys(patch).length || Object.entries(patch).some(([key, value]) =>
          !['heading', 'price', 'published', 'footer'].includes(key) || (key === 'price' ? !Number.isSafeInteger(value) || value < 0
            : key === 'published' ? typeof value !== 'boolean'
              : typeof value !== 'string' || value.length > 200))) return { status: 'NOT_APPLIED', reason: 'PATCH_INVALID' };
        Object.assign(page, patch); page.highestFence = fencingToken;
        const result = { status: 'APPLIED', operationId }; page.operations[operationId] = result;
        const loseReply = !page.replyLostOnce; page.replyLostOnce = true; save(page);
        if (loseReply) throw new Error('Demonstration: effect committed, provider response lost');
        return result;
      },
      async reconcile({ operationId }) { reconciliations++; return read().operations[operationId] ?? { status: 'NOT_APPLIED' }; },
    } } },
    verifyTask: async ({ task, output, inputs, effects }) => {
      const page = read(), applied = Object.values(effects).some(effect => effect.status === 'APPLIED');
      const accepted = task.taskId === 'copy' ? applied && typeof output.heading === 'string' && page.heading === output.heading
        : task.taskId === 'terms' ? applied && Number.isSafeInteger(output.price) && output.price > 0 && page.price === output.price
          : task.taskId === 'publish' ? applied && output.published === true && page.published
            && page.heading === inputs.copy.output.heading && page.price === inputs.terms.output.price
            : task.taskId === 'brand' && applied && output.branded === true && page.footer === 'Personal + company + coding agents';
      return { accepted, reason: accepted ? null : 'CONTRIBUTION_DOES_NOT_MATCH_PAGE' };
    },
    verifyGoal: async ({ goal, outputs }) => {
      const page = read();
      return { accepted: goal.goalId === 'launch' ? page.published && page.heading === outputs.copy.output.heading && page.price === outputs.terms.output.price
        : goal.goalId === 'branding' && page.footer === 'Personal + company + coding agents' };
    },
  });
  const api = layer.handler({ authenticate: request => Object.keys(actors)
    .find(actor => request.headers.authorization === `Bearer ${actors[actor]}`) });
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/') { void api(request, response); return; }
    const page = read(); response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(`<!doctype html><meta charset="utf-8"><title>Outsider mutual agent layer</title><main><h1>${escape(page.heading)}</h1><p>Price: ${escape(page.price ?? 'pending')}</p><p>${page.published ? 'Published' : 'In progress'}</p><footer>${escape(page.footer)}</footer></main>`);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, directory, actors,
    get page() { return visible(read()); }, get writes() { return Object.keys(read().operations).length; },
    get reconciliations() { return reconciliations; },
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

export async function executeDemoTask({ task, inputs, effects, resource, signal }) {
  const patch = task.taskId === 'copy' ? { heading: 'Built together, with Outsider' }
    : task.taskId === 'terms' ? { price: 49 }
      : task.taskId === 'publish' ? { published: true } : { footer: 'Personal + company + coding agents' };
  const output = task.taskId === 'brand' ? { branded: true } : patch;
  // Reconcile inherited effects before deciding whether another write is needed.
  for (const effect of Object.values(effects)) {
    const receipt = effect.status === 'RECONCILIATION_REQUIRED'
      ? await resource.reconcile({ resourceId: 'page', stepId: effect.stepId }) : effect;
    if (receipt.status === 'RECONCILIATION_REQUIRED') throw new Error('ORIGINAL_OPERATION_STILL_UNCERTAIN');
    if (receipt.status === 'APPLIED') return output;
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const observed = await resource.observe({ resourceId: 'page' });
    const stepId = `patch-${Object.keys(effects).length + attempt}`;
    let receipt = await resource.perform({ resourceId: 'page', stepId, action: { patch },
      expectedVersion: observed.version, expectedStateHash: observed.stateHash });
    if (receipt.status === 'RECONCILIATION_REQUIRED') receipt = await resource.reconcile({ resourceId: 'page', stepId });
    if (receipt.status === 'APPLIED') return output;
    if (receipt.status === 'RECONCILIATION_REQUIRED') throw new Error('ORIGINAL_OPERATION_STILL_UNCERTAIN');
    // A fresh attempt follows only a known non-effect, with a fresh observation.
    await delay(25, undefined, { signal });
  }
  throw new Error('PAGE_REMAINS_BUSY');
}

export async function runSharedGoalsDemo(runtime) {
  const owner = createSharedAgentClient({ origin: runtime.origin, token: runtime.actors.owner });
  const deadline = new Date(Date.now() + 300_000).toISOString();
  const definitions = [
    { goalId: 'launch', goal: 'Publish a page using the personal brief and company terms', completionDeadline: deadline, tasks: [
      { taskId: 'copy', title: 'Write the personal brief', dependsOn: [], allowedActorIds: ['personal-agent'], resourceIds: ['page'] },
      { taskId: 'terms', title: 'Provide the company price', dependsOn: [], allowedActorIds: ['company-agent'], resourceIds: ['page'] },
      { taskId: 'publish', title: 'Publish the combined result', dependsOn: ['copy', 'terms'], allowedActorIds: ['coding-agent'], resourceIds: ['page'] },
    ] },
    { goalId: 'branding', goal: 'Apply a shared footer on the same page', completionDeadline: deadline, tasks: [
      { taskId: 'brand', title: 'Apply the footer', dependsOn: [], allowedActorIds: ['company-agent'], resourceIds: ['page'] },
    ] },
  ];
  for (const definition of definitions) {
    const proposed = await owner.createGoal(definition);
    await owner.goal(definition.goalId).activate({ programHash: proposed.programHash });
  }
  const children = [];
  const worker = (actor, goalId) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker'], { env: { ...process.env,
      OUTSIDER_DEMO_ORIGIN: runtime.origin, OUTSIDER_DEMO_GOAL: goalId, OUTSIDER_DEMO_AGENT_TOKEN: runtime.actors[actor] },
    stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject); child.once('close', code => {
      if (code !== 0) { reject(new Error(`DEMO_WORKER_FAILED: ${stderr}`)); return; }
      try { resolve({ actor, goalId, ...JSON.parse(stdout) }); } catch (error) { reject(error); }
    });
  });
  let workers;
  try { workers = await Promise.all([worker('personal-agent', 'launch'), worker('company-agent', 'launch'),
    worker('coding-agent', 'launch'), worker('company-agent', 'branding')]); }
  catch (error) { for (const child of children) child.kill('SIGTERM'); throw error; }
  const goals = (await owner.listGoals()).goals.map(({ goalId, state }) => ({ goalId, state }));
  if (goals.some(goal => goal.state !== 'SUCCEEDED') || runtime.writes !== 4 || runtime.reconciliations < 1) throw new Error('DEMO_NOT_COMPLETE');
  return { workers, goals, page: runtime.page, writes: runtime.writes, reconciliations: runtime.reconciliations,
    origin: runtime.origin, directory: runtime.directory };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--worker')) {
    const client = createSharedAgentClient({ origin: process.env.OUTSIDER_DEMO_ORIGIN, token: process.env.OUTSIDER_DEMO_AGENT_TOKEN });
    const result = await runSharedGoalWorker({ goal: client.goal(process.env.OUTSIDER_DEMO_GOAL), executeTask: executeDemoTask,
      signal: AbortSignal.timeout(30_000) });
    console.log(JSON.stringify({ state: result.state }));
  } else {
    const runtime = await startSharedGoalsPage();
    try {
      console.log(JSON.stringify(await runSharedGoalsDemo(runtime), null, 2));
      if (process.argv.includes('--serve')) {
        const stop = () => { void runtime.close(); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
      } else await runtime.close();
    } catch (error) { await runtime.close(); throw error; }
  }
}
