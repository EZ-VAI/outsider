import { spawn } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBrowserCollaboration } from './browser-collaboration.mjs';
import { createSharedAgentClient } from '../src/outsider-shared-agent-client.js';

// Explicit live demo: these clients use the user's existing provider sessions.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(path.join(tmpdir(), 'outsider-live-providers-'));
let runtime;
try {
  runtime = await startBrowserCollaboration({ directory: path.join(directory, 'runtime') });
  const mcpEntry = path.join(root, 'src/outsider-mcp-server.js'), goalId = 'branding';
  const owner = createSharedAgentClient({ origin: runtime.origin, token: runtime.actors.owner });
  const definition = { goalId, goal: 'Together update the heading and footer of the shared demo page',
    completionDeadline: new Date(Date.now() + 600_000).toISOString(), tasks: [
      { taskId: 'heading', title: 'Set the heading', dependsOn: [], allowedActorIds: ['personal-agent'], resourceIds: ['page'] },
      { taskId: 'footer', title: 'Set the footer', dependsOn: [], allowedActorIds: ['company-agent'], resourceIds: ['page'] },
    ] };
  const proposed = await owner.createGoal(definition);
  await owner.goal(goalId).activate({ programHash: proposed.programHash });
  const toolNames = ['outsider_claim_task', 'outsider_observe_page', 'outsider_screenshot_page', 'outsider_act_on_page',
    'outsider_reconcile_action', 'outsider_complete_task', 'outsider_inspect_goal'];
  const common = 'This is an isolated local integration test with invented data. Use only the Outsider MCP tools, not shell or other tools. '
    + 'Claim your assigned task, observe resource page, then perform one action with the current version and state hash. '
    + 'The action contains steps fill the assigned selector with the assigned value and click #save, '
    + 'and waitFor {selector:"#status",property:"text",equals:"Saved"}. '
    + 'If the action is NOT_DISPATCHED or NOT_APPLIED, observe again and retry using a new stepId. '
    + 'If RECONCILIATION_REQUIRED, reconcile the original step before doing anything else. '
    + 'When the action is APPLIED, call outsider_complete_task with a unique submissionId and output {"done":true}. Stop after your task is accepted.';
  const personalPrompt = `${common} Your taskId is heading, your selector is #heading, and your value is Built together.`;
  const companyPrompt = `${common} Your taskId is footer, your selector is #footer, and your value is Personal and company agents.`;
  const codexOptions = {
    'mcp_servers.outsider.command': process.execPath,
    'mcp_servers.outsider.args': [mcpEntry],
    'mcp_servers.outsider.env.OUTSIDER_COORDINATOR_URL': runtime.origin,
    'mcp_servers.outsider.env.OUTSIDER_AGENT_TOKEN': runtime.actors['personal-agent'],
    'mcp_servers.outsider.env.OUTSIDER_GOAL_ID': goalId,
    'mcp_servers.outsider.default_tools_approval_mode': 'approve',
    'mcp_servers.outsider.enabled_tools': toolNames,
  };
  const codexArgs = ['-a', 'never', 'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
    '-s', 'read-only', '-C', directory, '--json'];
  // spawn() receives an argv array, so these values are never interpreted by a shell.
  for (const [key, value] of Object.entries(codexOptions)) codexArgs.push('-c', `${key}=${JSON.stringify(value)}`);
  codexArgs.push(personalPrompt);
  const claudeConfig = path.join(directory, 'claude-mcp.json');
  writeFileSync(claudeConfig, JSON.stringify({ mcpServers: { outsider: { command: process.execPath, args: [mcpEntry], env: {
    OUTSIDER_COORDINATOR_URL: runtime.origin, OUTSIDER_AGENT_TOKEN: runtime.actors['company-agent'], OUTSIDER_GOAL_ID: goalId,
  } } } }), { mode: 0o600 });
  const claudeArgs = ['--print', '--no-session-persistence', '--strict-mcp-config', '--restricted', '--no-chrome',
    '--tools', '', '--mcp-config', claudeConfig, '--allowedTools', toolNames.map(name => `mcp__outsider__${name}`).join(','),
    '--permission-mode', 'dontAsk', '--max-budget-usd', '0.25', '--output-format', 'json', '--', companyPrompt];
  const run = (command, args, log) => new Promise(resolve => {
    const fd = openSync(log, 'wx', 0o600), child = spawn(command, args, { cwd: directory, stdio: ['ignore', fd, fd] });
    let timedOut = false, settled = false, forceKill;
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); forceKill = setTimeout(() => child.kill('SIGKILL'), 5000); }, 120_000);
    const finish = result => {
      if (settled) return; settled = true; clearTimeout(timeout); clearTimeout(forceKill); closeSync(fd); resolve({ ...result, timedOut });
    };
    child.once('error', error => finish({ error: error.code }));
    child.once('close', (code, signal) => finish({ code, signal }));
  });
  const [codex, claude] = await Promise.all([
    run('codex', codexArgs, path.join(directory, 'codex.log')),
    run('claude', claudeArgs, path.join(directory, 'claude.log')),
  ]);
  const result = await owner.goal(goalId).inspect();
  const summary = { codex, claude, goal: result.state,
    tasks: result.tasks.map(({ taskId, status }) => ({ taskId, status })), page: runtime.state, browsers: ['Chrome', 'Edge'] };
  console.log(JSON.stringify(summary, null, 2));
  if (codex.code !== 0 || claude.code !== 0 || result.state !== 'SUCCEEDED'
    || result.tasks.some(task => task.status !== 'ACCEPTED') || runtime.state.revision !== 2) process.exitCode = 1;
} finally {
  await runtime?.close();
  rmSync(directory, { recursive: true, force: true });
}
