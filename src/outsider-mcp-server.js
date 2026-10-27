import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createSharedAgentClient } from './outsider-shared-agent-client.js';

/** One MCP process represents one authenticated agent working on one goal.
 * Claim tokens stay in this process; provider hosts only see task and receipts. */
export function createOutsiderMcpServer({ origin, token, goalId }) {
  const goal = createSharedAgentClient({ origin, token }).goal(goalId);
  if (typeof goalId !== 'string' || !goalId) throw new Error('OUTSIDER_MCP_GOAL_REQUIRED');
  const server = new McpServer({ name: 'outsider-mutual-layer', version: '1.0.0' });
  let held = null, timer = null, queue = Promise.resolve();
  const stop = () => { clearInterval(timer); timer = null; held = null; };
  const identity = () => {
    if (!held) throw Object.assign(new Error('OUTSIDER_MCP_CLAIM_REQUIRED'), { code: 'OUTSIDER_MCP_CLAIM_REQUIRED' });
    if (held.renewalError) throw Object.assign(new Error('OUTSIDER_MCP_RENEWAL_REQUIRED'), { code: 'OUTSIDER_MCP_RENEWAL_REQUIRED' });
    return { taskId: held.claim.task.taskId, leaseId: held.claim.leaseId, generation: held.claim.generation };
  };
  const scheduleRenewal = () => {
    clearInterval(timer);
    timer = setInterval(async () => {
      const current = held;
      if (!current || current.renewing) return;
      current.renewing = true;
      try {
        await goal.renew({ taskId: current.claim.task.taskId, leaseId: current.claim.leaseId,
          generation: current.claim.generation, ttlMs: current.ttlMs });
        if (held === current) current.renewalError = false;
      } catch { if (held === current) current.renewalError = true; }
      finally { current.renewing = false; }
    }, Math.floor(held.ttlMs / 3));
    timer.unref();
  };
  const tool = (name, description, inputSchema, operation, includeImage = false) => server.registerTool(name, { description, inputSchema }, (args, extra) => {
    // Provider hosts may issue parallel calls; keep one local claim's tool calls ordered.
    const run = queue.then(async () => {
      try {
        const result = await operation(args, extra.signal);
        return { content: includeImage ? [{ type: 'text', text: JSON.stringify(result.snapshot) },
          { type: 'image', data: result.image.data, mimeType: result.image.mimeType }] : [{ type: 'text', text: JSON.stringify(result) }] };
      }
      catch (error) {
        const code = typeof error.code === 'string' && /^(SHARED_|OUTSIDER_MCP_|NODE_)/u.test(error.code)
          ? error.code : 'OUTSIDER_MCP_REQUEST_FAILED';
        return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: code }) }] };
      }
    });
    queue = run.catch(() => {}); return run;
  });
  const resourceId = z.string().min(1).max(101);
  const step = z.object({ type: z.enum(['click', 'fill', 'press', 'select', 'check', 'uncheck']),
    selector: z.string().min(1).max(512), value: z.string().max(10_000).optional() });
  const action = z.object({ steps: z.array(step).min(1).max(16), waitFor: z.object({
    selector: z.string().min(1).max(512), property: z.enum(['text', 'value', 'checked']),
    equals: z.union([z.string(), z.boolean()]),
  }).optional() });
  tool('outsider_inspect_goal', 'Read this shared goal, task status, and recorded operation summaries.', {},
    (_, signal) => goal.inspect({ signal }));
  tool('outsider_resume_goal', 'Resume the goal and recheck any pending goal verification.', {},
    (_, signal) => goal.resume({}, { signal }));
  tool('outsider_claim_task', 'Claim one ready task. Accepted dependency outputs and any unresolved inherited actions are returned.', {
    taskId: z.string().max(101).optional(), ttlMs: z.number().int().min(300).max(300_000).optional(),
  }, async ({ taskId, ttlMs = 120_000 }, signal) => {
    if (held) throw Object.assign(new Error('OUTSIDER_MCP_CLAIM_EXISTS'), { code: 'OUTSIDER_MCP_CLAIM_EXISTS' });
    const result = await goal.claim({ taskId: taskId ?? null, ttlMs }, { signal });
    if (result.claim) {
      held = { claim: result.claim, ttlMs, renewing: false, renewalError: false }; scheduleRenewal();
      const { leaseId, ...publicClaim } = result.claim;
      return { ...result, claim: publicClaim };
    }
    return result;
  });
  tool('outsider_renew_task', 'Renew the current task claim; automatic renewal also runs while the agent is connected.', {
    ttlMs: z.number().int().min(300).max(300_000).optional(),
  }, async ({ ttlMs }, signal) => {
    if (!held) throw Object.assign(new Error('OUTSIDER_MCP_CLAIM_REQUIRED'), { code: 'OUTSIDER_MCP_CLAIM_REQUIRED' });
    const current = held;
    const result = await goal.renew({ taskId: current.claim.task.taskId, leaseId: current.claim.leaseId,
      generation: current.claim.generation, ttlMs: ttlMs ?? current.ttlMs }, { signal });
    if (held === current) { current.renewalError = false; current.ttlMs = ttlMs ?? current.ttlMs; scheduleRenewal(); }
    return { actorId: result.actorId, generation: result.generation, expiresAt: result.expiresAt };
  });
  tool('outsider_observe_page', 'Read the shared page and its current version and state hash before proposing an action.', { resourceId },
    ({ resourceId }, signal) => goal.observeResource({ resourceId, ...identity() }, { signal }));
  tool('outsider_screenshot_page', 'See the shared browser viewport and receive the current page snapshot and version.', { resourceId },
    ({ resourceId }, signal) => goal.captureResource({ resourceId, ...identity() }, { signal }), true);
  tool('outsider_act_on_page', 'Perform an ordered batch of browser actions. Use the version and state hash from the latest observation. Never repeat an uncertain step; reconcile it first.', {
    resourceId, stepId: z.string().min(1).max(101), action,
    expectedVersion: z.number().int().nonnegative(), expectedStateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  }, (input, signal) => goal.performResource({ ...input, ...identity() }, { signal }));
  tool('outsider_reconcile_action', 'Resolve an inherited or uncertain browser action by its original step ID.', {
    resourceId, stepId: z.string().min(1).max(101),
  }, (input, signal) => goal.reconcileResource({ ...input, ...identity() }, { signal }));
  tool('outsider_complete_task', 'Submit a task output for owner verification. Rejected outputs can be corrected with a new submission ID.', {
    submissionId: z.string().min(1).max(101), output: z.record(z.string(), z.unknown()),
  }, async (input, signal) => {
    const result = await goal.complete({ ...input, ...identity() }, { signal });
    if (result.accepted) stop();
    return result;
  });
  tool('outsider_handoff_task', 'Release this task claim so another agent can continue from its receipts.', {}, async (_, signal) => {
    const result = await goal.abandon(identity(), { signal }); stop(); return result;
  });
  server.server.onclose = stop;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = createOutsiderMcpServer({ origin: process.env.OUTSIDER_COORDINATOR_URL,
    token: process.env.OUTSIDER_AGENT_TOKEN, goalId: process.env.OUTSIDER_GOAL_ID });
  await server.connect(new StdioServerTransport());
}
