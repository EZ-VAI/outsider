import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createSharedAgentLayer } from '../src/outsider-shared-agent-layer.js';
import { createPlaywrightBrowserAdapter } from '../src/outsider-playwright-browser-adapter.js';

// Run with an explicitly opened CDP browser and an owner-provided access file.
const { OUTSIDER_BROWSER_CDP, OUTSIDER_PAGE_URL, OUTSIDER_STATE_DIR, OUTSIDER_ACCESS_FILE } = process.env;
if (!OUTSIDER_BROWSER_CDP || !OUTSIDER_PAGE_URL || !path.isAbsolute(OUTSIDER_STATE_DIR ?? '')
  || !path.isAbsolute(OUTSIDER_ACCESS_FILE ?? '')) throw new Error('BROWSER_OWNER_CONFIGURATION_REQUIRED');
const actors = JSON.parse(readFileSync(OUTSIDER_ACCESS_FILE, 'utf8'));
const entries = Object.entries(actors);
if (!Object.hasOwn(actors, 'owner') || entries.some(([, token]) => typeof token !== 'string' || !token)
  || new Set(entries.map(([, token]) => token)).size !== entries.length) throw new Error('BROWSER_OWNER_ACCESS_INVALID');
const browser = await chromium.connectOverCDP(OUTSIDER_BROWSER_CDP);
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url() === OUTSIDER_PAGE_URL);
if (!page) { await browser.close(); throw new Error('BROWSER_OWNER_PAGE_NOT_FOUND'); }
const adapter = createPlaywrightBrowserAdapter({ directory: path.join(OUTSIDER_STATE_DIR, 'browser'), page });
const layer = createSharedAgentLayer({ directory: path.join(OUTSIDER_STATE_DIR, 'layer'), resources: { page: { adapter } },
  authorize: ({ actorId, operation }) => ['CREATE_GOAL', 'ACTIVATE_GOAL'].includes(operation)
    ? actorId === 'owner' : Object.hasOwn(actors, actorId),
  verifyTask: async ({ output }) => ({ accepted: output?.done === true }),
  verifyGoal: async ({ goal }) => {
    if (!Array.isArray(goal.acceptance) || !goal.acceptance.length) return { accepted: false, reason: 'ACCEPTANCE_REQUIRED' };
    for (const criterion of goal.acceptance) {
      if (typeof criterion?.selector !== 'string' || !['text', 'value', 'checked'].includes(criterion.property)
        || typeof criterion.equals !== (criterion.property === 'checked' ? 'boolean' : 'string'))
        return { accepted: false, reason: 'ACCEPTANCE_INVALID' };
      const locator = page.locator(criterion.selector);
      if (await locator.count() !== 1) return { accepted: false, reason: 'ACCEPTANCE_NOT_YET_MET' };
      const actual = criterion.property === 'text' ? (await locator.textContent())?.trim()
        : criterion.property === 'value' ? await locator.inputValue() : await locator.isChecked();
      if (actual !== criterion.equals) return { accepted: false, reason: 'ACCEPTANCE_NOT_YET_MET' };
    }
    return { accepted: true };
  },
});
const server = createServer(layer.handler({ authenticate: request => entries
  .find(([, token]) => request.headers.authorization === `Bearer ${token}`)?.[0] }));
const port = Number(process.env.OUTSIDER_GATEWAY_PORT ?? 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('BROWSER_OWNER_PORT_INVALID');
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.address().port}`, resourceId: 'page' }));
const stop = async () => { await new Promise(resolve => server.close(resolve)); await browser.close(); };
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
