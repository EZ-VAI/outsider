# Outsider Stage 0.5 product guide

## Install once, keep using Claude normally

```bash
npm install -g ./outsider-guard-1.3.97.tgz
outsider install --scope user
outsider doctor
```

Then use `claude` or Claude Desktop Code exactly as before. Native Claude Code lazily starts an authenticated local sidecar. On macOS,
the same installer registers a user LaunchAgent for Cowork because Hosted Plugin sandboxes cannot read the user's Claude credentials.
There is no `outsider run` wrapper in the normal workflow.

User scope writes `~/.claude/settings.json` and affects every Claude project on the machine. Install from a separate terminal, not from
the Claude/Cowork session you currently depend on. For a one-repository trial, run `outsider install --scope project` from that repository;
it writes only `.claude/settings.json` there.

For Cowork, upload `outsider-guard-1.3.97-claude.plugin.zip` once in Desktop Plugins/Customize. The plugin is a thin authenticated client
to the explicit system helper and never launches a misleading supervisor inside the hosted sandbox. Ordinary Claude Chat does not
execute plugin hooks and is therefore not a controlled surface.

## What happens per task

1. SessionStart registers a collision-resistant session identity.
2. UserPromptSubmit stores the operator text verbatim without charging a model call for read-only chat.
3. At the first tool boundary, before the action executes, Outsider discovers acceptance and freezes the operator's bytes directly.
   `.outsider.json#acceptance` is authoritative; semantic judgment happens against real trajectory/outcome evidence, not a pre-work
   chain of LLM contract paraphrases.
4. Pre/PostToolUse and agent/team lifecycle events feed the recoverable controller.
5. Quiet drift is checked periodically by an isolated semantic supervisor.
6. The controller projects diagnosis into a minimal correction authority. Narrative telemetry cannot steer the worker; arbitrary model
   commands are never executed by the controller. One canonical authority hash binds factual audit, delivery, observation, effect and resolution.
7. Stop is blocked only while a live controller can still diagnose and resume work. A finalized run exits visibly as SAFE delivery,
   verified-but-unattributed delivery, or conservative red stop; it never becomes a permanent block with no executor.

Healthy calls are silent. A controller outage fails closed for mutations and Stop. If bootstrap itself is temporarily unavailable,
Outsider allows only named read-only diagnostic tools, records the degraded state, and retries with bounded exponential backoff; it does
not trap every Read/Glob/Grep call in the same permanent error loop. A project with no acceptance runs observer-only and
is never labeled as a complete Stage 0.5 delivery.

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
outsider run "<operator words>" --accept "npm test" --max-budget-usd 20 --cwd /absolute/repo
```

## Stable-release field evidence

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
| Codex / Trae | legacy observer only | Not Stage 0.5 |

The distinction between “packaged”, “installed”, and “observed at runtime” is intentional. A file on disk is not proof that a host loaded it.
Evidence likewise separates `SAFE_DELIVERY`, `VERIFIED_DELIVERY_UNATTRIBUTED`, `CONTROL_BOUNDARY_CONTAINMENT`, and `CONSERVATIVE_STOP`.
Only the first is a completed Stage 0.5 causal claim; a correct artifact without attribution and a blocked seeded false green remain useful,
attestable evidence without being relabeled as closure.

## Cross-provider use

Global Outsider adds a separate research-preview plane for signed task plans,
task-bound checkpoints, bilateral artifact handoffs and content-addressed
evidence packets across Claude, DeepSeek Harness, Codex, Trae and deterministic
workflows. The plan freezes operator/instrument/Way ownership and dependencies;
an operator accepts only by signing its own checkpoint. It does not
raise the Stage 0.5 row in the table above: provider-local capability ceilings
remain authoritative. See [GLOBAL-OUTSIDER.md](GLOBAL-OUTSIDER.md) for the key
boundary, command sequence, durable registry and learning-data restrictions.
