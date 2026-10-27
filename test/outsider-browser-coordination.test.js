import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonicalizeStrict } from '../src/canonical.js';
import { createPlaywrightBrowserAdapter } from '../src/outsider-playwright-browser-adapter.js';
import { startBrowserCollaboration, runBrowserCollaborationDemo } from '../examples/browser-collaboration.mjs';

const digest = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;

test('MCP agents on Chrome and Edge complete two goals on the same actual page and reconcile interrupted actions', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-browser-integration-'));
  let runtime;
  try { runtime = await startBrowserCollaboration({ directory }); }
  catch (error) {
    rmSync(directory, { recursive: true, force: true });
    if (!process.env.OUTSIDER_REQUIRE_BROWSERS && /executable doesn't exist|executable.*not found/i.test(error.message)) {
      t.skip('Install Chrome and Edge, or set OUTSIDER_REQUIRE_BROWSERS=1 to require this integration'); return;
    }
    throw error;
  }
  t.after(async () => { await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const result = await runBrowserCollaborationDemo(runtime);
  assert.equal(result.agents, 2); assert.equal(result.mcpClients, 3);
  assert.deepEqual(result.browsers, ['Chrome', 'Edge']);
  assert.ok(result.goals.every(goal => goal.state === 'SUCCEEDED'));
  assert.deepEqual(result.page, { heading: 'Built together', summary: 'One page, multiple agents',
    footer: 'Personal and company agents', published: true, revision: 4 });
  for (const page of Object.values(runtime.pages)) {
    assert.equal(await page.locator('#heading').inputValue(), 'Built together');
    assert.equal(await page.locator('#summary').inputValue(), 'One page, multiple agents');
    assert.equal(await page.locator('#footer').inputValue(), 'Personal and company agents');
    assert.equal(await page.locator('#published').innerText(), 'Published');
  }

  // A click may land before the worker loses its claim. Its original identity is
  // retained across adapter reconstruction and cannot be clicked a second time.
  const page = runtime.pages['personal-agent'];
  await page.setContent('<button id="click" onclick="document.querySelector(\'#count\').textContent++">Increment</button><p id="count">0</p>');
  const adapterDirectory = path.join(directory, 'interrupted-browser');
  const adapter = createPlaywrightBrowserAdapter({ directory: adapterDirectory, page });
  const initial = await adapter.observe({ agentId: 'personal-agent' });
  let checks = 0;
  const input = { operationId: 'increment-once', fencingToken: 1, expectedStateHash: digest(initial),
    action: { steps: [{ type: 'click', selector: '#click' }] },
    assertCurrentClaim: () => { if (++checks === 3) throw new Error('claim expired after dispatch'); } };
  assert.equal((await adapter.execute(input)).status, 'UNKNOWN');
  assert.equal(await page.locator('#count').innerText(), '1');
  assert.equal((await adapter.reconcile({ operationId: input.operationId })).status, 'UNKNOWN');
  const restarted = createPlaywrightBrowserAdapter({ directory: adapterDirectory, page,
    reconcileOperation: async () => ({ status: 'APPLIED' }) });
  assert.equal((await restarted.reconcile({ operationId: input.operationId })).status, 'APPLIED');
  assert.equal((await restarted.execute(input)).status, 'APPLIED');
  assert.equal(await page.locator('#count').innerText(), '1');
});
