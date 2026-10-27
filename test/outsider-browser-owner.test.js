import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createSharedAgentClient } from '../src/outsider-shared-agent-client.js';

const chromePaths = process.platform === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
const chromePath = chromePaths.find(existsSync);

test('an MCP agent connects through the owner gateway to an already open browser tab', async t => {
  if (!chromePath) {
    if (process.env.OUTSIDER_REQUIRE_BROWSERS) throw new Error('CHROME_REQUIRED');
    t.skip('Chrome is required to test connection to an existing browser'); return;
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-browser-owner-'));
  const site = createServer((request, response) => response.writeHead(200, { 'content-type': 'text/html' }).end(
    '<input id="draft"><button id="apply" onclick="document.querySelector(\'#done\').textContent=document.querySelector(\'#draft\').value">Apply</button><p id="done">Waiting</p>'));
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  const pageUrl = `http://127.0.0.1:${site.address().port}/`;
  const profile = path.join(directory, 'profile'), accessFile = path.join(directory, 'access.json');
  writeFileSync(accessFile, JSON.stringify({ owner: 'owner-test-token', 'personal-agent': 'agent-test-token' }), { mode: 0o600 });
  const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-networking', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, pageUrl], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeLog = '';
  chrome.stderr.on('data', chunk => { chromeLog = (chromeLog + chunk.toString()).slice(-4000); });
  let connectedBrowser, gateway, agent;
  t.after(async () => {
    await agent?.close();
    const stop = async child => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      const closed = once(child, 'close'); child.kill('SIGTERM');
      await Promise.race([closed, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await closed; }
    };
    await stop(gateway);
    await connectedBrowser?.close();
    await stop(chrome);
    await new Promise(resolve => site.close(resolve));
    // Chrome helper processes can briefly finish writing after the parent exits.
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const activePort = path.join(profile, 'DevToolsActivePort');
  const startupDeadline = Date.now() + 30_000;
  while (Date.now() < startupDeadline && !existsSync(activePort)) {
    if (chrome.exitCode !== null || chrome.signalCode !== null) throw new Error(`CHROME_EXITED_BEFORE_CDP:${chromeLog}`);
    await delay(50);
  }
  assert.ok(existsSync(activePort), `Chrome must expose its DevTools port: ${chromeLog}`);
  const cdp = `http://127.0.0.1:${readFileSync(activePort, 'utf8').split('\n')[0]}`;
  connectedBrowser = await chromium.connectOverCDP(cdp);
  let page;
  for (let i = 0; i < 200 && !page; i++) {
    page = connectedBrowser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url() === pageUrl);
    if (!page) await delay(50);
  }
  assert.ok(page, 'the target page must already exist in the browser'); await page.waitForLoadState('domcontentloaded');
  gateway = spawn(process.execPath, [fileURLToPath(new URL('../examples/browser-owner.mjs', import.meta.url))], {
    env: { ...process.env, OUTSIDER_BROWSER_CDP: cdp, OUTSIDER_PAGE_URL: pageUrl,
      OUTSIDER_STATE_DIR: path.join(directory, 'state'), OUTSIDER_ACCESS_FILE: accessFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: gateway.stdout });
  const [line] = await Promise.race([once(lines, 'line', { signal: AbortSignal.timeout(15_000) }),
    once(gateway, 'exit').then(([code]) => { throw new Error(`OWNER_GATEWAY_EXITED:${code}`); })]);
  const { origin } = JSON.parse(line); lines.close();
  const owner = createSharedAgentClient({ origin, token: 'owner-test-token' });
  const definition = { goalId: 'existing-tab', goal: 'Show the agreed text on the page',
    completionDeadline: new Date(Date.now() + 60_000).toISOString(),
    acceptance: [{ selector: '#done', property: 'text', equals: 'Ready for approval' }],
    tasks: [{ taskId: 'edit', title: 'Update the page', dependsOn: [],
      allowedActorIds: ['personal-agent'], resourceIds: ['page'] }] };
  const proposed = await owner.createGoal(definition);
  await owner.goal(definition.goalId).activate({ programHash: proposed.programHash });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../src/outsider-mcp-server.js', import.meta.url))], env: {
      OUTSIDER_COORDINATOR_URL: origin, OUTSIDER_AGENT_TOKEN: 'agent-test-token', OUTSIDER_GOAL_ID: definition.goalId,
    } });
  agent = new Client({ name: 'independent-agent', version: '1.0.0' });
  await agent.connect(transport);
  const call = async (name, args = {}) => {
    const result = await agent.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, result.content[0]?.text);
    return JSON.parse(result.content[0].text);
  };
  await call('outsider_claim_task');
  const observed = await call('outsider_observe_page', { resourceId: 'page' });
  const action = await call('outsider_act_on_page', { resourceId: 'page', stepId: 'edit-page',
    expectedVersion: observed.version, expectedStateHash: observed.stateHash,
    action: { steps: [{ type: 'fill', selector: '#draft', value: 'Hello from two providers' },
      { type: 'click', selector: '#apply' }] } });
  assert.equal(action.status, 'APPLIED');
  assert.equal((await call('outsider_complete_task', { submissionId: 'done', output: { done: true } })).accepted, true);
  assert.equal(await page.locator('#done').innerText(), 'Hello from two providers');
  assert.equal((await owner.goal(definition.goalId).inspect()).state, 'ACTIVE');
  await page.locator('#done').evaluate(element => { element.textContent = 'Ready for approval'; });
  assert.equal((await call('outsider_resume_goal')).state, 'SUCCEEDED');
});
