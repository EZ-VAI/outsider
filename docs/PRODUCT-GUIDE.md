# Outsider Stage 0.5 product guide

## Install once; external control remains an explicit choice

Use the commands below only after the matching reviewed `v1.3.99` tag and
release assets have actually been published.

```bash
npm install -g ./outsider-guard-1.3.99.tgz
outsider install --scope user
outsider doctor
```

Then use `claude` or Claude Desktop Code exactly as before. Native Claude Code lazily starts an authenticated local sidecar. On macOS,
the same installer registers a user LaunchAgent for Cowork because Hosted Plugin sandboxes cannot read the user's Claude credentials.
The default is deliberately `local-only/no-external`: it sends no supervisor packet and permits only bounded read-only diagnosis. There
is no `outsider run` wrapper in the normal workflow, but full semantic control is not implied by installation alone.

To enable an operator-selected external supervisor, both the command and a
separate consent flag are required. User-scope install persists both gates in
the Claude/Codex hook and, on macOS, the Cowork helper:

```bash
outsider install --scope user \
  --supervisor-argv '["claude","-p"]' \
  --allow-external-supervisor
```

For a CLI-owned sidecar without that helper, set `OUTSIDER_SUPERVISOR` or
`OUTSIDER_SUPERVISOR_ARGV` together with
`OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR=1` in the environment that launches the
host. The selected command receives only the bounded supervisor projection, but
that projection can contain non-sensitive source excerpts, the prompt and tool
or acceptance summaries. Provider handling is outside Outsider; see
`PRIVACY.md` before opting in.

The installer accepts only supervisor executable/argv identity. It refuses
inline credentials, private-key material and query-bearing URLs; use the
supervisor's protected login store. Malformed, symlinked, non-regular or
concurrently changed settings fail closed without being replaced. A successful
merge preserves the prior bytes in a unique hidden mode-`0600` backup.

User scope writes `~/.claude/settings.json` and affects every Claude project on the machine. Install from a separate terminal, not from
the Claude/Cowork session you currently depend on. For a one-repository trial, run `outsider install --scope project` from that repository;
it writes only `.claude/settings.json` there.

For Cowork, upload `outsider-guard-1.3.99-claude.plugin.zip` once in Desktop Plugins/Customize. The plugin is a thin authenticated client
to the explicit system helper and never launches a misleading supervisor inside the hosted sandbox. Ordinary Claude Chat does not
execute plugin hooks and is therefore not a controlled surface.

For ChatGPT and Codex, the same Git repository exposes the validated
`outsider-stage05` universal plugin through `.agents/plugins/marketplace.json`:

```bash
codex plugin marketplace add EZ-VAI/outsider --ref v1.3.99
codex plugin add outsider-stage05@outsider
```

Restart the desktop app after installation. In Codex, `/hooks` must be used to
review and trust the exact current hook definition. Plugin discovery, companion
runtime installation, hook configuration, hook trust, runtime observation and
controlled status are distinct. The universal plugin gives ChatGPT the
installation/evidence skill, not a hidden global lifecycle interceptor. The
Codex plugin hook is a boundary notice; actual Stage 0.5 control remains in the
companion runtime and requires a real conformance receipt. Hosted tools and
specialized paths may not traverse Codex tool hooks.

## What happens per task

1. SessionStart registers a collision-resistant session identity.
2. UserPromptSubmit stores the operator text verbatim without charging a model call for read-only chat.
3. At the first tool boundary, before the action executes, Outsider discovers acceptance and freezes the operator's bytes directly.
   `.outsider.json#acceptance` is authoritative; semantic judgment happens against real trajectory/outcome evidence, not a pre-work
   chain of LLM contract paraphrases.
4. Pre/PostToolUse and agent/team lifecycle events feed the recoverable controller.
5. When the external dual gate is enabled, quiet drift is checked periodically by the selected isolated semantic supervisor.
6. The controller projects diagnosis into a minimal correction authority. Narrative telemetry cannot steer the worker; arbitrary model
   commands are never executed by the controller. One canonical authority hash binds factual audit, delivery, observation, effect and resolution.
7. Stop is blocked only while a live controller can still diagnose and resume work. A finalized run exits visibly as SAFE delivery,
   verified-but-unattributed delivery, or conservative red stop; it never becomes a permanent block with no executor.

Healthy controlled calls are silent. Missing external consent is a local-only state that blocks mutations before acceptance discovery.
A configured controller outage fails closed for mutations and Stop. If bootstrap itself is temporarily unavailable,
Outsider allows only named read-only diagnostic tools, records the degraded state, and retries with bounded exponential backoff; it does
not trap every Read/Glob/Grep call in the same permanent error loop. Only after the external dual gate is enabled, a project with no
acceptance can run observer-only; neither state is labeled as a complete Stage 0.5 delivery.

Standalone and legacy adapters never treat repository-writable
`.outsider/run.json` or `.outsider/contract.json` as acceptance or supervisor
command authority. Only an authenticated controller/RunStore can execute those
commands; the CodeBuddy/Trae paths remain observer/unsupported surfaces.

An inherited host session id observed under a second cwd is an identity conflict: Outsider records it and fails closed instead of merging
the repositories. Start a fresh Claude session or remove the inherited `CLAUDE_CODE_SESSION_ID` from the nested launcher.

The host timeout is 900 seconds and Outsider's internal timeout is 890 seconds. A stuck semantic call therefore returns a visible deny
before the host kills the hook, but one tool boundary can visibly wait for roughly 15 minutes in the worst case.

## Optional commands

```bash
outsider doctor
outsider runs
outsider show <run-id>
outsider verify <run-directory>
outsider attest <run-directory>... --out <attestation.json>
```

Use explicit controlled mode only in CI/headless workflows:

```bash
outsider run "<operator words>" --accept "npm test" --max-budget-usd 20 \
  --supervisor-argv '["claude","-p"]' --allow-external-supervisor \
  --cwd /absolute/repo
```

## Stable-release field evidence

The commands in this section are **source-workspace/operator release tools**.
They are not included in the staged Stage 0.5 runtime npm package. Run them from
an exact tagged source checkout (or a separately reviewed release-operator
bundle); an installed runtime package intentionally cannot execute them.

The release certifier never accepts handwritten PASS flags. A real Cowork run
is supplied by its local state root and exact workspace; the certifier reopens
the sealed run, replays Cowork conformance, and compares its controller/runtime
hashes with the candidate artifact:

```bash
node scripts/stage05-release-certify.mjs \
  --artifact dist/outsider-guard-VERSION.tgz \
  --cowork-state-root "$HOME/.outsider/attached" \
  --cowork-workspace /absolute/cowork-fixture
```

An independent second host generates a signed clean-install record. Generate
the Ed25519 key on that second host; never copy its private key to the primary
machine:

```bash
node scripts/generate-ed25519-keypair.mjs \
  --private-out outsider-second-host.pem \
  --public-out outsider-second-host.pub.pem
node scripts/stage05-second-machine-conformance.mjs \
  --artifact outsider-guard-VERSION.tgz \
  --signing-key outsider-second-host.pem \
  --out second-machine-record.json
```

Copy only the record and public key back. The primary certifier verifies the
signature, exact artifact/evaluator hashes, all clean-install checks, and that
the committed host identity differs from the primary host. This is cooperative
field evidence, not hardware remote attestation.

## Surface matrix

| Surface | Installation | Stage 0.5 status |
|---|---|---|
| Claude Code terminal | `outsider install` | Supported after runtime conformance |
| Claude Desktop Code | same native settings | Supported after runtime conformance |
| Claude Desktop Cowork | user installer + plugin zip | Supported only when helper is running and hooks actually fire locally |
| Claude ordinary Chat | plugin may be visible, hooks do not run | Unsupported |
| remote Cowork without local hook boundary | none | Unsupported |
| ChatGPT desktop / Work with repo plugin access | `outsider-stage05` universal skill plugin | Install and evidence-verification skill only; no universal pre/post/stop interception and therefore not globally controlled Stage 0.5 |
| Codex CLI/Desktop/IDE | companion runtime with ten required core hooks plus best-effort advisory `SessionEnd` | A bounded project-local consequential loop has been verified; strict app-server item cross-binding and complete hosted/specialized tool coverage remain unestablished |
| Trae / CodeBuddy | standalone legacy observer; repository state cannot grant command authority | Not Stage 0.5 |

The distinction between “packaged”, “installed”, and “observed at runtime” is intentional. A file on disk is not proof that a host loaded it.
Evidence likewise separates `SAFE_DELIVERY`, `VERIFIED_DELIVERY_UNATTRIBUTED`, `CONTROL_BOUNDARY_CONTAINMENT`, and `CONSERVATIVE_STOP`.
Only the first is a completed Stage 0.5 causal claim; a correct artifact without attribution and a blocked seeded false green remain useful,
attestable evidence without being relabeled as closure.

## Optional signed exchange

The public runtime also includes an opt-in protocol for signed task plans,
checkpoints, handoffs, and content-addressed evidence packets. It preserves each
provider's local capability ceiling: exchanging a signed packet cannot promote
an observer or unsupported surface into Stage 0.5 control. See
[GLOBAL-OUTSIDER.md](GLOBAL-OUTSIDER.md) for the current protocol and privacy
boundary.
