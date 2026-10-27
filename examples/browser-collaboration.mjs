import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createSharedAgentLayer } from '../src/outsider-shared-agent-layer.js';
import { createSharedAgentClient } from '../src/outsider-shared-agent-client.js';
import { createPlaywrightBrowserAdapter } from '../src/outsider-playwright-browser-adapter.js';

const html = `<!doctype html><meta charset="utf-8"><title>Shared workspace</title>
<main><h1>Shared workspace</h1><form id="form">
<label>Heading <input id="heading" /></label>
<label>Summary <input id="summary" /></label>
<label>Footer <input id="footer" /></label>
<button id="save">Save</button></form>
<button id="publish">Publish</button><p id="published">Draft</p><p id="status">Loading</p><p>Revision <span id="revision">0</span></p></main>
<script>
const fields = ['heading', 'summary', 'footer'], dirty = new Set();
let saving = false, syncing = false, seenRevision = 0;
for (const field of fields) document.getElementById(field).addEventListener('input', () => dirty.add(field));
async function sync() {
  if (syncing) return; syncing = true;
  try {
    const state = await (await fetch('/state', { cache: 'no-store' })).json();
    if (state.revision < seenRevision) return;
    seenRevision = state.revision;
    for (const field of fields) if (!dirty.has(field)) document.getElementById(field).value = state[field];
    document.getElementById('published').textContent = state.published ? 'Published' : 'Draft';
    document.getElementById('revision').textContent = state.revision;
    if (!saving) document.getElementById('status').textContent = 'Saved';
    window.initialized = true;
  } finally { syncing = false; }
}
async function submit(publish = false) {
  saving = true; document.getElementById('status').textContent = 'Saving';
  const patch = Object.fromEntries([...dirty].map(field => [field, document.getElementById(field).value]));
  if (publish) patch.published = true;
  const response = await fetch('/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  if (!response.ok) { document.getElementById('status').textContent = 'Error'; saving = false; return; }
  seenRevision = Math.max(seenRevision, (await response.json()).revision);
  dirty.clear(); saving = false; await sync();
}
document.getElementById('form').addEventListener('submit', event => { event.preventDefault(); void submit(); });
document.getElementById('publish').addEventListener('click', () => { void submit(true); });
void sync(); setInterval(() => { void sync(); }, 100);
</script>`;

/** An actual shared web app opened in two independently launched browsers.
 * The browser adapter routes each authenticated agent to its own browser Page. */
export async function startBrowserCollaboration({ directory = mkdtempSync(path.join(tmpdir(), 'outsider-browser-demo-')),
  personalBrowser = 'chrome', companyBrowser = 'msedge' } = {}) {
  const state = { heading: 'Draft', summary: '', footer: '', published: false, revision: 0 };
  const actors = Object.fromEntries(['owner', 'personal-agent', 'company-agent'].map(actor => [actor, randomBytes(24).toString('hex')]));
  let api, chrome, edge;
  const server = createServer(async (request, response) => {
    if (request.url === '/' && request.method === 'GET') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html); return; }
    if (request.url === '/state') {
      if (request.method === 'POST') {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const patch = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        for (const key of ['heading', 'summary', 'footer', 'published']) if (Object.hasOwn(patch, key)) state[key] = patch[key];
        state.revision++;
      }
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(state)); return;
    }
    if (api) await api(request, response); else response.writeHead(503).end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    chrome = await chromium.launch({ channel: personalBrowser, headless: true });
    edge = await chromium.launch({ channel: companyBrowser, headless: true });
    const pages = { 'personal-agent': await chrome.newPage(), 'company-agent': await edge.newPage() };
    await Promise.all(Object.values(pages).map(async page => { await page.goto(origin); await page.waitForFunction(() => window.initialized === true); }));
    const adapter = createPlaywrightBrowserAdapter({ directory: path.join(directory, 'browser'),
      resolvePage: ({ agentId }) => pages[agentId] });
    const layer = createSharedAgentLayer({ directory: path.join(directory, 'layer'), resources: { page: { adapter } },
      authorize: ({ actorId, operation }) => ['CREATE_GOAL', 'ACTIVATE_GOAL'].includes(operation)
        ? actorId === 'owner' : Object.hasOwn(actors, actorId),
      verifyTask: async ({ task, output, effects }) => {
        const applied = Object.values(effects).some(effect => effect.status === 'APPLIED');
        const accepted = applied && output.done === true && (task.taskId === 'heading' ? state.heading === 'Built together'
          : task.taskId === 'summary' ? state.summary === 'One page, multiple agents'
            : task.taskId === 'publish' ? state.published : state.footer === 'Personal and company agents');
        return { accepted };
      },
      verifyGoal: async ({ goal }) => ({ accepted: goal.goalId === 'launch'
        ? state.heading === 'Built together' && state.summary === 'One page, multiple agents' && state.published
        : state.footer === 'Personal and company agents' }),
    });
    api = layer.handler({ authenticate: request => Object.keys(actors)
      .find(actor => request.headers.authorization === `Bearer ${actors[actor]}`) });
    return { origin, directory, actors, pages, layer, get state() { return { ...state }; },
      async close() { await Promise.all([chrome.close(), edge.close()]); await new Promise(resolve => server.close(resolve)); } };
  } catch (error) {
    await Promise.allSettled([chrome?.close(), edge?.close()]);
    await new Promise(resolve => server.close(resolve)); throw error;
  }
}

async function mcpClient(runtime, actor, goalId) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../src/outsider-mcp-server.js', import.meta.url))],
    env: { OUTSIDER_COORDINATOR_URL: runtime.origin, OUTSIDER_AGENT_TOKEN: runtime.actors[actor], OUTSIDER_GOAL_ID: goalId } });
  const client = new Client({ name: `${actor}-demo-client`, version: '1.0.0' });
  await client.connect(transport);
  return client;
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const body = JSON.parse(result.content[0].text);
  if (result.isError) throw new Error(body.error);
  return body;
}

async function completeBrowserTask(client, taskId, value) {
  const { claim } = await call(client, 'outsider_claim_task', { taskId });
  if (!claim) throw new Error(`TASK_NOT_READY:${taskId}`);
  if (Object.hasOwn(claim, 'leaseId')) throw new Error('CLAIM_TOKEN_EXPOSED');
  if (taskId === 'heading') {
    const screenshot = await client.callTool({ name: 'outsider_screenshot_page', arguments: { resourceId: 'page' } });
    if (screenshot.isError || !screenshot.content.some(item => item.type === 'image' && item.mimeType === 'image/jpeg'))
      throw new Error('BROWSER_SCREENSHOT_NOT_AVAILABLE');
  }
  const steps = taskId === 'publish' ? [{ type: 'click', selector: '#publish' }]
    : [{ type: 'fill', selector: `#${taskId}`, value }, { type: 'click', selector: '#save' }];
  for (let attempt = 0; attempt < 30; attempt++) {
    const observed = await call(client, 'outsider_observe_page', { resourceId: 'page' });
    const stepId = `${taskId}-${attempt}`;
    let result = await call(client, 'outsider_act_on_page', { resourceId: 'page', stepId,
      action: { steps, waitFor: { selector: '#status', property: 'text', equals: 'Saved' } },
      expectedVersion: observed.version, expectedStateHash: observed.stateHash });
    if (result.status === 'RECONCILIATION_REQUIRED') result = await call(client, 'outsider_reconcile_action', { resourceId: 'page', stepId });
    if (result.status === 'APPLIED') {
      const submission = await call(client, 'outsider_complete_task', { submissionId: `${taskId}-done`, output: { done: true } });
      if (!submission.accepted) throw new Error(`TASK_REJECTED:${taskId}`);
      return result;
    }
    if (result.status === 'RECONCILIATION_REQUIRED') throw new Error(`BROWSER_OPERATION_UNCERTAIN:${stepId}`);
    await delay(100);
  }
  throw new Error(`BROWSER_OPERATION_CONTENDED:${taskId}`);
}

export async function runBrowserCollaborationDemo(runtime) {
  const owner = createSharedAgentClient({ origin: runtime.origin, token: runtime.actors.owner });
  const completionDeadline = new Date(Date.now() + 300_000).toISOString();
  const goals = [
    { goalId: 'launch', goal: 'Create and publish a shared page', completionDeadline, tasks: [
      { taskId: 'heading', title: 'Write the heading', dependsOn: [], allowedActorIds: ['personal-agent'], resourceIds: ['page'] },
      { taskId: 'summary', title: 'Write the summary', dependsOn: [], allowedActorIds: ['company-agent'], resourceIds: ['page'] },
      { taskId: 'publish', title: 'Publish the page', dependsOn: ['heading', 'summary'], allowedActorIds: ['personal-agent'], resourceIds: ['page'] },
    ] },
    { goalId: 'branding', goal: 'Add a shared footer to the same page', completionDeadline, tasks: [
      { taskId: 'footer', title: 'Write the footer', dependsOn: [], allowedActorIds: ['company-agent'], resourceIds: ['page'] },
    ] },
  ];
  for (const definition of goals) {
    const proposed = await owner.createGoal(definition);
    await owner.goal(definition.goalId).activate({ programHash: proposed.programHash });
  }
  const clients = [];
  try {
    const personal = await mcpClient(runtime, 'personal-agent', 'launch'); clients.push(personal);
    const company = await mcpClient(runtime, 'company-agent', 'launch'); clients.push(company);
    const branding = await mcpClient(runtime, 'company-agent', 'branding'); clients.push(branding);
    await Promise.all([
      completeBrowserTask(personal, 'heading', 'Built together'),
      completeBrowserTask(company, 'summary', 'One page, multiple agents'),
      completeBrowserTask(branding, 'footer', 'Personal and company agents'),
    ]);
    await completeBrowserTask(personal, 'publish');
    await Promise.all(Object.values(runtime.pages).map(page => page.waitForFunction(() =>
      document.querySelector('#published').textContent === 'Published'
      && document.querySelector('#footer').value === 'Personal and company agents')));
    const finalGoals = (await owner.listGoals()).goals.map(({ goalId, state }) => ({ goalId, state }));
    if (finalGoals.length !== 2 || finalGoals.some(goal => goal.state !== 'SUCCEEDED') || runtime.state.revision !== 4)
      throw new Error('BROWSER_DEMO_NOT_COMPLETE');
    return { goals: finalGoals, page: runtime.state, browsers: ['Chrome', 'Edge'], agents: 2, mcpClients: clients.length };
  } finally { await Promise.allSettled(clients.map(client => client.close())); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const runtime = await startBrowserCollaboration({ personalBrowser: process.env.OUTSIDER_PERSONAL_BROWSER ?? 'chrome',
    companyBrowser: process.env.OUTSIDER_COMPANY_BROWSER ?? 'msedge' });
  try { console.log(JSON.stringify(await runBrowserCollaborationDemo(runtime), null, 2)); }
  finally { await runtime.close(); }
}
