# DeepSeek Harness × Outsider: first-pass architecture review

Status: official `deepseek-ai/deepseek-harness` documentation, generated persistence catalog,
and source pages reviewed on 2026-08-14 and pinned to commit
`47f943859bef60e4160492346772ded9b24f765a`. A full archive download was unreliable, so the
first integration is deliberately limited to the upstream public durable-event contract rather
than importing internal packages.

## What DeepSeek Harness is

DeepSeek Harness (`dsh`) is a developer-preview agent runtime, not a semantic supervisor or an
independent decision system. Its central decision is “everything is a plugin”: Cordis plugins contribute
services, typed events, and reversible effects to a shared context. Model adapters, tools, the
session log, the agent loop, filesystem and sandbox providers, subagent implementations, hooks,
workflows, jobs, Web UI, and headless runners are all replaceable composition layers.

Primary sources:

- https://github.com/deepseek-ai/deepseek-harness
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md
- https://github.com/deepseek-ai/deepseek-harness/tree/master/packages

Its strongest architectural properties for Outsider are:

1. An append-only session event log is the source of model history. Model-visible input must be
   reconstructable from durable events.
2. `agent/pre-step`, `agent/request`, the LLM stream, tool pre/execute/post, and turn-stopping are
   explicit interception points instead of inferred transcript behavior.
3. Subagents are a capability seam. Providers include in-process children, ACP, Codex,
   Claude Code, and Harness SDK children behind one interface.
4. Claude Code and Codex shell-hook protocols are already translated into the same native typed
   extension surface.
5. Profiles, bundles, and patches make the exact runtime composition inspectable with
   `dsh --profile ... --dump-config`.

## What it is not

The shipped `guard` family currently describes loop hygiene such as repeated-tool reminders and
per-call timeouts. That is useful, but it is not Outsider's independent semantic contract,
correction-authority audit, causal intervention proof, sealed evidence, or ATTEST record.

DeepSeek Harness therefore does not replace Outsider. It is a new **Way/runtime** that gives
Outsider a much cleaner sensor and actuator surface than scraping external host hooks.

## Correct integration boundary

Outsider should be implemented as two pieces:

- a small in-process `dsh` plugin that observes typed events, injects a frozen correction at the
  documented agent/tool seams, and reports bounded acknowledgements;
- the existing out-of-process Outsider controller that owns the contract, independent semantic
  judgment, correction authority, evidence seal, and terminal decision.

The controller must remain external. Harness profiles are patchable and plugins are unloadable;
putting the adjudicator and its evidence root entirely inside the supervised runtime would let
the Way rewrite its own referee.

## Proposed adapter sequence

1. **DSH observation adapter** — implemented in
   `src/outsider-deepseek-harness-adapter.js`. It validates and hashes the pinned v0 durable
   `SessionEvent` envelope, correlates tool and hook pairs, accounts tokens/capacity, refuses
   unknown required event types, and never grants delivery or correction authority. Import a
   JSON/JSONL log with `outsider observe-dsh <events> --out <observation.json>`; verify it with
   `outsider verify <observation.json>`. This is a native observation record, not yet a sealed
   Stage 0.5 run or `supervised-experience/v2` treatment sample.
2. **DSH intervention protocol** — the deterministic boundary is implemented in
   `src/outsider-deepseek-harness-protocol.js` and
   `src/outsider-deepseek-harness-plugin-core.js`: a pinned profile/bundle/plugin/provider closure
   becomes a Way identity; controller and Harness sequence clocks are kept separate; one
   out-of-process audited correction is content-addressed; and one durable in-process
   acknowledgement may establish observation of delivery only. It cannot establish effect,
   outcome, loss, or liability. A source-only Cordis adapter using the documented
   `agent/pre-step`, `createUserMessage`, and `session/event` APIs lives under
   `integrations/deepseek-harness-outsider-plugin/`. It is shipped in the npm release closure.
   The authenticated local gateway and a deterministic real-Cordis protocol canary are now
   implemented. The canary proves exact durable delivery of one audited correction, not effect.
3. **DSH conformance canary** — construct one mechanical-green/semantic-red fixture and require
   the same Stage 0.5 causal chain and evidence verification used for Claude Code.

## Product implication

DeepSeek's architecture supports the Outsider integration thesis: agent execution is becoming a
composable runtime containing many interchangeable models, tools, sandboxes, workflows, and
child-agent providers. The scarce object is no longer “one chatbot answer”; it is a runtime's
permission to spend tool, model, risk, and recovery capacity. Harness supplies the composable
execution plane. Outsider supplies a separate supervision and evidence boundary.

## Claim boundary

This is an architecture and durable-protocol review, not a security audit, performance benchmark,
or proof that the developer preview has stable APIs. The observation adapter is pinned to one
commit and session format version and remains `OBSERVATION_ONLY`. The pinned closure identity,
correction/ack hash protocol, framework-neutral plugin core, authenticated local gateway, and
Cordis adapter are implemented and unit-tested. The deterministic canary runs the real Cordis
waterfall and official message factory against the pinned rc.6 npm package closure without a
model call. The public source tree declares rc.5 and npm metadata exposes no `gitHead`, so
source-to-binary equivalence remains `UNPROVEN`. A real Harness work session with independent
effect and outcome verification is still absent; DeepSeek Harness is a durably observed Way and
correction-delivery surface, not yet a proven Stage 0.5 causal actuation surface.
