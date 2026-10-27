# Browser and agent integration

Outsider lets agents from different providers share a page and coordinate one or multiple goals. The owner controls the browser and the gateway; agents connect using MCP or the HTTP API.

## Run the complete example

```bash
npm ci
npm run demo:browser
npm run test:browser
```

The example opens the same local web application in Chrome and Edge. Three MCP connections, each backed by a separate server process, represent personal and company agents. They complete two goals by writing the heading, summary, footer, and publication status through the actual browser pages. The application synchronizes its state across the browser sessions. The clients are scripted; no model account is needed.

The focused test also connects to an already-open Chrome tab over CDP, creates a goal through the owner gateway, and drives it with an MCP client. The adapter can instead be supplied with any compatible Playwright `Page`; Chromium CDP connections, Playwright server connections, and other supported browser engines use their respective Playwright connection methods. See [Playwright's browser connection documentation](https://playwright.dev/docs/api/class-browsertype).

For an optional live-provider run, sign in to the local Codex and Claude Code CLIs, then run `npm run demo:live-agents`. The agents use separate Chrome and Edge pages, each with an MCP connection, to complete the same goal on the shared demo app. This uses the existing accounts' model usage, with a $0.25 limit on the Claude Code call, and a two-minute timeout per agent. It is not part of the default tests.

## Connect an existing page

The example owner gateway operates on one existing tab shared by its agents. It binds to localhost, authenticates each actor, and uses page criteria supplied by the owner to verify a goal.

1. Create private, distinct credentials for the owner and agents:

   ```bash
   mkdir -p .outsider
   node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; const ids = ["owner", "personal-agent", "company-agent", "coding-agent"]; const access = Object.fromEntries(ids.map(id => [id, randomBytes(32).toString("hex")])); writeFileSync(".outsider/access.json", JSON.stringify(access, null, 2), { mode: 0o600, flag: "wx" });'
   ```

2. Start a Chromium-based browser with a separate profile and CDP enabled, then open the target page. For example, on macOS:

   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9222 \
     --user-data-dir="$PWD/.outsider/browser-profile" \
     https://example.com/
   ```

   Use the page you intend to operate on. CDP provides browser control, so keep the debugging endpoint on the owner's machine or behind an appropriate authenticated boundary.

3. Start the gateway from the repository directory. `OUTSIDER_PAGE_URL` must exactly match an open tab:

   ```bash
   export OUTSIDER_BROWSER_CDP=http://127.0.0.1:9222
   export OUTSIDER_PAGE_URL=https://example.com/
   export OUTSIDER_STATE_DIR="$PWD/.outsider/owner"
   export OUTSIDER_ACCESS_FILE="$PWD/.outsider/access.json"
   export OUTSIDER_GATEWAY_PORT=8787
   npm run browser:owner
   ```

   The gateway prints its origin and exposes the browser as resource `page`. It accepts the identities in the access file. The owner can create and activate goals; the allowed actor IDs on each task determine who can claim it.

4. Create and activate a goal using the owner token. Replace the criteria and task descriptions with those appropriate for the page:

   ```js
   import { readFileSync } from 'node:fs';
   import { createSharedAgentClient } from './src/outsider-shared-agent-client.js';

   const access = JSON.parse(readFileSync(process.env.OUTSIDER_ACCESS_FILE, 'utf8'));
   const owner = createSharedAgentClient({ origin: 'http://127.0.0.1:8787', token: access.owner });
   const definition = {
     goalId: 'publish-page',
     goal: 'Prepare and publish the page together',
     completionDeadline: new Date(Date.now() + 600_000).toISOString(),
     acceptance: [{ selector: '#status', property: 'text', equals: 'Published' }],
     tasks: [
       { taskId: 'draft', title: 'Prepare the draft', dependsOn: [],
         allowedActorIds: ['personal-agent'], resourceIds: ['page'] },
       { taskId: 'review', title: 'Review and publish', dependsOn: ['draft'],
         allowedActorIds: ['company-agent'], resourceIds: ['page'] },
     ],
   };
   const proposed = await owner.createGoal(definition);
   await owner.goal(definition.goalId).activate({ programHash: proposed.programHash });
   ```

   Run the snippet as an ES module from the repository directory with `OUTSIDER_ACCESS_FILE` set. The example owner gateway verifies task submissions with `output.done === true` and evaluates every goal criterion on the browser page. Criteria support `text`, `value`, and `checked`. Replace these callbacks with application-specific verification when needed.

## Connect different agent providers

Configure one MCP server process per agent and goal. Each process needs the gateway origin, that agent's token from the access file, and the goal ID. Give each provider a distinct identity/token; the process retains its current task's claim token locally.

For an MCP host using an `mcpServers` JSON configuration, the entry has this shape:

```json
{
  "mcpServers": {
    "outsider": {
      "command": "node",
      "args": ["/absolute/path/to/outsider/src/outsider-mcp-server.js"],
      "env": {
        "OUTSIDER_COORDINATOR_URL": "http://127.0.0.1:8787",
        "OUTSIDER_AGENT_TOKEN": "<this-agent-token>",
        "OUTSIDER_GOAL_ID": "publish-page"
      }
    }
  }
}
```

For Codex, the equivalent entry in `config.toml` can forward the three variables from the host environment:

```toml
[mcp_servers.outsider]
command = "node"
args = ["/absolute/path/to/outsider/src/outsider-mcp-server.js"]
env_vars = ["OUTSIDER_COORDINATOR_URL", "OUTSIDER_AGENT_TOKEN", "OUTSIDER_GOAL_ID"]
```

See the [official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and the chosen host's own MCP configuration instructions. Keep any configuration containing credentials private. The Node.js HTTP client and the REST endpoints below work for clients that do not use MCP.

### MCP tools

| Tool | Purpose |
| --- | --- |
| `outsider_inspect_goal` | Read the goal and task statuses. |
| `outsider_resume_goal` | Resume the goal and recheck pending verification. |
| `outsider_claim_task` | Claim a ready task and receive accepted dependency outputs and prior effect summaries. |
| `outsider_renew_task` | Renew the claim; the server also renews it while connected. |
| `outsider_observe_page` | Read the page's text, controls, current version, and state hash. |
| `outsider_screenshot_page` | Receive a JPEG viewport image and a page snapshot. |
| `outsider_act_on_page` | Perform an ordered batch using the observed version and state hash. |
| `outsider_reconcile_action` | Resolve an uncertain action using its original step ID. |
| `outsider_complete_task` | Submit `{ submissionId, output }` for task verification. |
| `outsider_handoff_task` | Release the claim so another agent can continue. |

One browser operation contains up to 16 steps. Supported step types are `click`, `fill`, `press`, `select`, `check`, and `uncheck`. Each step has a Playwright selector; `fill`, `press`, and `select` also use a string `value`. An optional `waitFor` checks an element's `text`, `value`, or `checked` after the batch.

```json
{
  "resourceId": "page",
  "stepId": "edit-and-save-1",
  "expectedVersion": 4,
  "expectedStateHash": "sha256:<hash-from-observation>",
  "action": {
    "steps": [
      { "type": "fill", "selector": "#title", "value": "New title" },
      { "type": "click", "selector": "#save" }
    ],
    "waitFor": { "selector": "#status", "property": "text", "equals": "Saved" }
  }
}
```

Use the actual version and hash returned by observation. A whole batch holds the resource access; another agent cannot interleave its own batch. A successful browser action receipt records that the steps ran; the owner verifier determines whether the task and goal are complete.

## Multiple browser sessions

`createPlaywrightBrowserAdapter` can use one `page` for every agent or a `resolvePage` function to select an owner-connected Playwright page per actor:

```js
import { createPlaywrightBrowserAdapter } from './src/outsider-playwright-browser-adapter.js';

const adapter = createPlaywrightBrowserAdapter({
  directory: '/absolute/private/browser-receipts',
  resolvePage: ({ agentId }) => ({
    'personal-agent': personalBrowserPage,
    'company-agent': companyBrowserPage,
  })[agentId],
});
```

`personalBrowserPage` and `companyBrowserPage` are pages connected by the owner. Register the adapter as the same resource ID in `createSharedAgentLayer`. When pages are separate browser sessions, they must observe the same shared application state. If the target application does not synchronize sessions, map all agents to one shared `Page` instead. The default observation includes visible text and controls; the owner may supply `observePage(page)` to select a more stable or narrower state.

## Handoff and recovery

Claims have an expiry and generation. A replacement agent receives accepted dependency outputs and the prior task's effect summaries. Resource writes use a stable `stepId`, a version check, and a monotonic fencing generation.

If a browser action was dispatched but its result cannot be established—for example, the claim expires after a click—the operation remains `RECONCILIATION_REQUIRED`. Repeating the step returns the existing operation rather than clicking again. The owner can provide `reconcileOperation` to consult an authoritative application receipt and return `APPLIED`, `NOT_APPLIED`, or `UNKNOWN`. Until it is resolved, the task cannot complete and other writes to that resource wait.

## HTTP and JavaScript API

`createSharedAgentLayer` exposes an authenticated gateway with these JSON endpoints:

| Endpoint | Operation |
| --- | --- |
| `POST /v1/goals`, `GET /v1/goals` | Create and list goals. |
| `GET /v1/goals/:goalId` | Inspect a goal. |
| `POST /v1/goals/:goalId/activate` | Activate the proposed `programHash`. |
| `POST /v1/goals/:goalId/claim`, `/renew`, `/abandon`, `/complete`, `/resume` | Claim, renew, hand off, complete, or resume work. |
| `POST /v1/goals/:goalId/resources/observe`, `/capture` | Read the page or capture an image with its snapshot. |
| `POST /v1/goals/:goalId/resources/perform`, `/reconcile` | Execute or reconcile a resource step. |

The goal-scoped JavaScript client mirrors these operations. The owner gateway uses one host and local durable storage; remote agents can connect to it over HTTP. Multiple owner hosts need a distributed coordination mechanism. Goal verification records completion at the time of observation; maintaining incompatible goals requires an explicit owner policy.

Key sources: [MCP server](../src/outsider-mcp-server.js), [browser adapter](../src/outsider-playwright-browser-adapter.js), [owner gateway example](../examples/browser-owner.mjs), and [two-browser example](../examples/browser-collaboration.mjs).
