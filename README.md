# Outsider Stage 0.5

[English](README.md) | [简体中文](README.zh-CN.md)

> **Open-source beta.** Outsider is a local lifecycle controller and evidence
> system for long-running agent work. It is not an operating-system sandbox,
> does not make a model universally correct, and only claims control on a host
> surface after that exact surface passes runtime conformance.

[Releases](https://github.com/EZ-VAI/outsider/releases) ·
[Security](SECURITY.md) · [Privacy](PRIVACY.md) ·
[Contributing](CONTRIBUTING.md)

Outsider freezes the operator's acceptance criteria before the first tool
action, watches long and multi-agent trajectories for drift and repeated waste,
delivers bounded corrections at synchronous lifecycle boundaries, and
independently verifies the result before the run is allowed to finish.

An ordinary install is **local-only and read-only by default**. It does not
start an external model and does not send workspace evidence to a third-party
process. Semantic supervision is enabled only when the operator provides both a
supervisor command and separate external-disclosure consent.

## What it does

- Preserves the user's objective verbatim and seals an operator contract before
  the first tool action.
- Discovers repository-owned acceptance commands or reads an explicit
  `.outsider.json` contract.
- Separates sessions, tool calls, test results, edits, subagent graphs, and
  controller generations.
- Detects long-horizon drift, constraint loss, repeated no-progress work,
  cross-agent conflicts, and stale or false-green validation.
- Can deny a supported pre-tool call or continue a stopped turn when the exact
  host hook and controller boundary are available.
- Verifies mechanical acceptance, semantic completion, and an adversarial review
  before recording a terminal result.
- Produces hash-chained events, an evidence manifest, and a separately
  verifiable terminal state.

Outsider does not execute model-generated commands on the model's behalf. It
also does not treat a correct final answer as proof that Outsider caused the
correction.

## Supported surfaces

Installation, hook configuration, hook trust, runtime observation, and
**controlled** are different states. `outsider doctor --json` reports them
separately for local diagnosis. That raw report contains local filesystem
paths; use `outsider doctor --share-json` if the report will be pasted into a
chat or sent to another person.

| Surface | Current boundary |
| --- | --- |
| Claude Code CLI (macOS/Linux) | Companion runtime and native hooks are installable. Default is local-only/read-only; controlled status still requires a real conformance receipt. |
| Claude Desktop Code tab | Uses the same Claude Code hooks and the same two-part supervisor consent. |
| Claude Desktop Cowork (macOS) | Requires the release plugin archive plus the local helper and a real helper/plugin handshake. |
| Remote Cowork | Supported only when that remote session can actually reach the helper and emits a conformance record. |
| Ordinary Claude Chat | Unsupported; it does not run the required hooks. |
| Codex CLI/Desktop/IDE | The universal plugin and companion runtime are installable. The operator must review the exact hook hash in `/hooks`; full control requires a real source-bound conformance receipt. Codex hooks are a guardrail, not complete tool coverage. |
| ChatGPT Chat/Work | The package is structurally eligible for accounts/workspaces that expose local plugin sources; a live ChatGPT Desktop install has not yet been exercised. Ordinary ChatGPT conversations do not expose a universal pre-tool/post-tool/stop lifecycle, so this surface is **not** globally controlled Stage 0.5. |
| DeepSeek Harness | Research-grade cooperative delivery adapter only; no production semantic-effect or adversarial-host claim. |
| Trae / CodeBuddy | Observer or wrapper only; no repository-authored command authority and no controlled-loop claim. |

Codex currently exposes synchronous hooks for shell/exec, `apply_patch`, MCP
calls, and most local function tools. Hosted tools such as web search and some
specialized paths may bypass that hook path; `write_stdin`/polling on an
existing unified exec session does not run `PreToolUse` again. Those exceptions are part of the
published boundary.

## Install the Stage 0.5 runtime

Requires Node.js 20 or newer. **After the reviewed v1.3.98 release has actually
been published**, download these files from that **same** GitHub release. Until
then, use the local source-checkout flow below and do not treat the `latest`
release page as a v1.3.98 installer:

- `outsider-guard-1.3.98.tgz`
- `SHA256SUMS`
- `outsider-guard-1.3.98-claude.plugin.zip` for Cowork

Verify the archive from an independent terminal, then install:

```bash
shasum -a 256 outsider-guard-1.3.98.tgz
npm install -g ./outsider-guard-1.3.98.tgz
outsider install --scope user
# Restart the host and start a real session, then:
outsider doctor --json
```

Do not use `sudo` for a global npm install. If the default prefix is not
writable, use a user-owned prefix:

```bash
npm install -g --prefix "$HOME/.local" ./outsider-guard-1.3.98.tgz
export PATH="$HOME/.local/bin:$PATH"
outsider install --scope user
```

Project scope is available for Claude Code:

```bash
cd your-project
outsider install --scope project
claude
```

The source checkout includes development tests and operator release tooling, so
it intentionally refuses direct `npm pack` or `npm install -g .`. After the
reviewed tag exists, source users must bind the checkout to that tag before
staging the reviewed public Stage 0.5 import closure. Before the tag exists, use
only an existing reviewed local checkout; do not treat mutable remote `main` as
v1.3.98:

```bash
git clone --branch v1.3.98 --depth 1 https://github.com/EZ-VAI/outsider.git
cd outsider
npm ci
npm test
npm run test:corpus
node scripts/stage05-public-package.mjs --out /tmp/outsider-stage05-public-1.3.98
npm install -g /tmp/outsider-stage05-public-1.3.98
outsider install --scope user
```

## Install the ChatGPT/Codex universal plugin

The repository now contains a validated universal plugin manifest at
`plugins/outsider-stage05/` and a repo marketplace at
`.agents/plugins/marketplace.json`.

### Codex CLI, Desktop, and IDE

For a local checkout (the path is the repository root), register the marketplace
and install the plugin with the Codex CLI:

```bash
codex plugin marketplace add /path/to/outsider
codex plugin add outsider-stage05@outsider
```

After the reviewed `v1.3.98` Git tag has actually been published:

```bash
codex plugin marketplace add EZ-VAI/outsider --ref v1.3.98
codex plugin add outsider-stage05@outsider
```

Restart Codex after installation. Open `/hooks`, inspect the source and exact
command hash, and trust only the reviewed definition. Then start a real session
and run:

```bash
outsider doctor --json
codex plugin list
codex plugin marketplace list
```

### Eligible ChatGPT Desktop accounts and workspaces

The Codex CLI command above can register the reviewed repo marketplace, but
ChatGPT plugin installation and testing happen in the ChatGPT Desktop UI:

1. Make the reviewed `v1.3.98` checkout the active repository, or register its
   marketplace with `codex plugin marketplace add EZ-VAI/outsider --ref v1.3.98`.
2. Restart ChatGPT Desktop.
3. Open the Plugins Directory, choose the **Outsider** marketplace source, and
   install **Outsider Stage 0.5**.
4. Start a new conversation with the plugin enabled and test direct, indirect,
   follow-up, negative, and intentional-boundary prompts.

The Plugins Directory and local marketplace controls are available only on
eligible accounts/workspaces and may be disabled by workspace policy. Installing
the ChatGPT plugin exposes the Outsider skill; it does not install the companion
runtime or create a global lifecycle interceptor.

The plugin package is structurally ready for repo/local marketplace installation
on Codex and on eligible ChatGPT accounts/workspaces that expose local plugin
sources. Codex installation has been exercised in isolation; a live ChatGPT
Desktop install and new-chat evaluation are not yet established. Surface
availability is controlled by the host account and workspace policy. A
listing in the public universal Plugins Directory is a separate OpenAI
submission and review step and is **not** claimed until it has actually been
published there.

On ChatGPT, the plugin provides the Outsider install and evidence-verification
skill. It does not install a hidden global interceptor. On Codex, the bundled
hook is a boundary notice; the companion runtime owns the actual Stage 0.5 hook
and controller path. Plugin visibility alone is never a controlled receipt.

## Optional external supervisor: explicit two-part consent

Full semantic supervision requires both a command and separate consent.
Omitting either keeps Outsider local-only/read-only and fail-closed for
potential world changes.

```bash
outsider install --scope user \
  --supervisor-argv '["claude","-p"]' \
  --allow-external-supervisor
```

The installer accepts only executable/argument identity. Inline tokens,
passwords, private-key material, and credential-bearing query URLs are refused;
authenticate the selected supervisor through its own protected credential
store. Existing Claude/Codex settings fail closed if they are malformed,
symlinked, or change during the update; the installer preserves the original
and writes a unique mode-`0600` backup before the atomic replacement.

In CLI environments without the system helper, both gates must be present in
the environment that launches the host:

```bash
export OUTSIDER_SUPERVISOR_ARGV='["claude","-p"]'
export OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR=1
claude
```

The selected command receives a recursively minimized and redacted packet.
Sensitive-file evidence units, binary/non-plain objects, common credential
blocks, authorization values, and URL queries are removed. The packet may still
contain the non-sensitive source excerpts, task prompt, tool summaries, and
acceptance output needed for review. Redaction is defense in depth, not a proof
that every future secret format is recognizable. Read [PRIVACY.md](PRIVACY.md)
before opting in.

Standalone/legacy CodeBuddy and Trae adapters never obtain command authority
from repository-writable `.outsider/run.json` or `.outsider/contract.json`.
Only the authenticated controller/RunStore path may execute acceptance or
supervisor commands; those adapters remain observer/unsupported surfaces.

Headless runs enforce the same two gates:

```bash
outsider run "Complete this task" --accept "npm test" --max-budget-usd 20 \
  --supervisor-argv '["claude","-p"]' --allow-external-supervisor
```

## Claude Desktop / Cowork

Claude Desktop's Code tab uses the native Claude Code hooks.

Cowork additionally requires:

1. `outsider install --scope user` to register the private local helper.
2. Uploading `outsider-guard-1.3.98-claude.plugin.zip` from the same release.
3. A new Cowork session and a real runtime handshake.

The plugin is a thin client; controller state remains outside the hosted
sandbox. If the helper is unavailable, Outsider reports the surface as
unsupported rather than pretending it is controlled.

## Contracts and verification

Outsider discovers repository-owned acceptance in this order:

1. `.outsider.json` `acceptance`
2. `package.json` `test`, then `check`, `verify`, or `ci`
3. Conventional Python, Cargo, Go, or Make entrypoints

Example:

```json
{
  "acceptance": "npm run test:sealed"
}
```

Without executable acceptance, Outsider reports observer-only. Knowledge work
and non-code tasks need artifact-specific acceptance for a full terminal proof.

Inspect local runs:

```bash
outsider runs
outsider show <run-id>
outsider verify /absolute/path/to/run
```

Attached state defaults to `~/.outsider/attached/`, headless state to
`~/.outsider/runs/`; directories are mode `0700` and evidence files mode
`0600`.

## Optional experience contribution

Telemetry and external contribution are off by default. Supervisor consent and
contribution consent are separate boundaries.

```bash
outsider share preview <run-id>
outsider share enable \
  --endpoint <endpoint-from-the-same-reviewed-release> \
  --server-public-key ./outsider-server-public-key.pem \
  --accept-policy
outsider share send <run-id>
outsider share status
outsider share disable
outsider share revoke --send --reason USER_REQUEST
```

`preview` is offline. Each run requires an explicit send. The allowlisted
projection excludes raw source, prompts, transcripts, paths, command output,
credentials, and raw events. Contributions enter quarantine and cannot
automatically become PRICE, GUARANTEE, or SETTLE evidence.

See [Experience Contributions](docs/EXPERIENCE-CONTRIBUTIONS.md) and
[Privacy Policy](PRIVACY.md).

## Demo and deterministic checks

The [Stage 0.5 demo](deploy/cloudflare-product-demo/) is a fixed replay of a
privacy-projected Claude Agent Team canary. It verifies the public artifact hash
and ordered evidence chain; it is not a live agent execution or customer
production record.

```bash
npm run demo:serve
npm test
npm run test:corpus
```

Release reproduction is documented in
[Public release procedure](docs/PUBLIC-RELEASE.md).

## Known beta limits

- Only exact host surfaces with runtime conformance can be called controlled.
- Outsider is not an OS/process sandbox.
- A canary or fixture is evidence only for its exact version, environment, and
  instrumentation.
- Synchronous controller timeouts can pause a tool call for up to the configured
  budget before returning an explicit denial.
- ChatGPT plugin installation does not create a universal ChatGPT lifecycle
  interceptor.
- Codex plugin installation does not automatically trust hooks and does not
  cover hosted or opt-out tool paths.
