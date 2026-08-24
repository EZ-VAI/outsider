# Worker Adapter v1

Stage 0.5 has a provider-neutral evidence boundary. It does **not** claim that
every AI worker or every tool path is controllable. Each adapter declares three
independent capabilities:

- `OBSERVE`: structured behavior the adapter can actually see;
- `INTERVENE`: a native boundary that can change or refuse behavior before it
  happens;
- `VERIFY`: exact facts that can be replayed, such as source bytes,
  call/result pairing, or durable correction delivery.

Missing capabilities are explicit. A generic or unsupported provider adapter
cannot promote caller-supplied data into authenticated host control. Replaying
bytes proves integrity; provider authenticity, controller attribution, delivery,
and semantic recovery require their own evidence.

## Current support matrix

| Surface | Observe | Intervene | Verify | Honest product level |
|---|---|---|---|---|
| Claude Code native attached hooks | Structured session, actions, lifecycle, and task tree | Pre-tool deny/rewrite/context plus Stop/SubagentStop | Existing Stage 0.5 run/evidence closure and independent acceptance | **Controlled when installed runtime conformance is present** |
| Claude Desktop Cowork | Plugin events on a local-helper-reachable session | Same controller after the real session/helper handshake | Existing Cowork runtime evidence | **Controlled only for a conformed local session**; remote/helper-inaccessible sessions fail visibly |
| Codex CLI/Desktop/IDE shared runtime | Native rollout plus ten required core hook events; best-effort advisory `SessionEnd` when exposed | Synchronous attached-controller decisions at supported local function-tool and Stop boundaries | Canonical hook sources, signed controller receipts, Stage 0.5 run directory; optional stricter binary/schema/`hooks/list`/app-server source replay | **Consequential closed loop demonstrated for one bounded project-local live task**. Exact app-server item cross-binding and complete tool-path coverage remain separate, unestablished claims |
| DeepSeek Harness / Cordis | Pinned v0 session events and tool pairing | Audited correction at `agent/pre-step` through the pinned plugin | Durable message ack and preregistered behavioral effect can be replayed | **Delivery-supervised cooperative research adapter**; never malicious-worker/OS attestation, semantic outcome, loss, pricing, or guarantee |
| Trae / CodeBuddy legacy paths | Trajectory parsing or wrapper-dependent observation where available | Not proven by Worker Adapter v1 | No provider-specific source-replay adapter yet | **Observer/unsupported**, reported visibly |
| OpenHands and other providers | No runtime adapter in v1 | No | No | **Unsupported** |

## Codex: installed inventory, live closure, and strict proof

The Codex adapter keeps three states separate.

First, capability metadata establishes what the current binary and configuration
declare. `hooks/list` can prove that an exact hook command is discovered,
enabled, and trusted; generated schema proves which event and output shapes the
engine understands. Neither fact proves that the hook fired.

Second, a verified attached Stage 0.5 run establishes what happened in the
controller loop. In the bounded project-local live task, a red first `Stop` was
blocked, a fact-audited correction was emitted and observed, the permitted
repair made acceptance green, a fresh approval audit passed, the repaired Stop
continued, and the `SAFE_DELIVERY` evidence chain verified. This is why the
product doctor can report a consequential closed-loop run rather than the old
observation-only status.

Third, the strict source-bound assessment asks whether the native app-server
item and the Outsider decision can be cross-bound from independent sources. It
replays the exact binary/schema/`hooks/list`, signed app-server stream, canonical
hook payload/result sources, and trusted controller receipts. This stricter
assessment is intentionally not inferred from the product doctor's run-ledger
fields. See `CODEX-STAGE05-CONTROL.md`.

The runtime installs all eleven event names in the current official hook
contract. Ten are required for the Stage 0.5 core inventory:
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`,
`PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, and
`Stop`. `SessionEnd` is an eleventh best-effort advisory event. Its absence is
reported but cannot invalidate a consequential control loop already closed by
`Stop`, because `SessionEnd` output cannot steer Codex or keep a thread open.

Codex trust remains a manual user decision. After installing, open `/hooks`,
inspect the exact Outsider command and hash for each core event, and trust only
the definitions you reviewed. Outsider never automates that consent or invokes
`--dangerously-bypass-hook-trust`.

## Codex tool-path boundary

The local tool-hook path covers shell calls, unified `exec_command`,
`apply_patch`, MCP tools, and most local function tools. The adapter does not
turn that path into a universal enforcement claim:

- hosted tools do not traverse the local function-tool hook path;
- specialized tools can opt out;
- `write_stdin` on an existing unified-exec session does not trigger another
  `PreToolUse`, although final completion can carry the original command's
  `PostToolUse`;
- a hook cannot establish operating-system containment or defeat a malicious
  same-UID process that can read user-private state.

## CLI

Inspect a Codex rollout without starting a model:

```sh
outsider worker inspect codex ~/.codex/sessions/.../rollout.jsonl \
  --out codex-worker-observation.json
outsider worker verify codex-worker-observation.json \
  --source ~/.codex/sessions/.../rollout.jsonl
```

Probe the installed Codex binary, generated schema, and `hooks/list` metadata
without sending a prompt:

```sh
npm run canary:codex:probe
```

The probe writes a content-addressed record and a machine-readable readiness
sidecar. Even complete metadata replay remains capability evidence until a real
hook run supplies its own canonical controller source and receipt. Likewise, a
verified Stage 0.5 run does not silently become the stricter app-server
item-cross-binding assessment.

When the production hook runs, it writes a mode-0600 canonical payload/result
source and a hash-only Ed25519 receipt. This establishes payload capture and
controller-decision attribution after source replay. Semantic recovery still
comes from the separate Stage 0.5 outcome and causal evidence; it is not a
self-asserted receipt flag.

Inspect raw DeepSeek Harness v0 events or an existing Harness observation:

```sh
outsider worker inspect deepseek-harness session-events.json \
  --session-id SESSION_ID --out deepseek-worker-observation.json
outsider worker verify deepseek-worker-observation.json \
  --source session-events.json --session-id SESSION_ID
```

The optional `--runtime-handshake`, `--correction`, `--correction-ack`, and
`--effect-evidence` files declare only their matching scopes at inspection.
Pass the same full chain to `worker verify` to obtain
`FULL_PROVIDER_SOURCE_REPLAY`; source bytes alone cannot authenticate delivery
or effect.

DeepSeek protocol replay proves a cooperative pinned-host chain. Its handshake
and ack are content-addressed, not independently signed by a trusted controller
or hardware/OS attestor. Verified correction effects are therefore marked
`QUARANTINE_SHADOW_ONLY` unless a sealed controller run or trusted ingress
policy accepts them.

## Adapter SDK contract

A provider adapter can join without changing controller semantics:

1. Snapshot one immutable source artifact. Hash raw bytes; do not embed prompts,
   commands, tool results, session IDs, or secrets.
2. Create a `worker-capability-handshake/v1`. Unsupported scopes carry a stable
   reason code and no scopes. Static documentation or schema metadata is never
   live delivery evidence.
3. Normalize only bounded event labels into `worker-event/v1`. Pair each
   `ACTION_PROPOSED` and `ACTION_RESULT` with a provider-derived call reference.
4. Emit `worker-observation/v1`. Native type counts must equal the declared
   native event count. Unknown schema values become hashed gap codes; raw parser
   errors never enter the record.
5. Provide a provider-specific verifier that replays the exact source and any
   intervention chain. A content hash or caller-constructed event list alone is
   self-check evidence, not authority.
6. Add attacks for capability escalation, source mutation, orphan/duplicate
   actions, secret smuggling, controller outage, and unsupported-host behavior.

The reusable constructors and verifiers live in
`src/outsider-worker-adapter.js`. Codex and DeepSeek reference implementations
are in `src/outsider-codex-worker-adapter.js` and
`src/outsider-deepseek-worker-adapter.js`.

## Evidence boundary

Worker Adapter v1 measures process behavior. It never establishes universal
semantic correctness, economic loss, a price, a guarantee, execution authority,
or settlement. Those are separate stages and cannot be inferred from a
successful parse, a configured hook, or one bounded intervention chain.
