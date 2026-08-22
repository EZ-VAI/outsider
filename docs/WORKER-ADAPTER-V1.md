# Worker Adapter v1

Stage 0.5 now has a provider-neutral evidence boundary. It does **not** claim
that every AI worker is controllable. Every session emits three independent
capabilities:

- `OBSERVE`: structured behavior that the adapter can actually see.
- `INTERVENE`: a native boundary that can change or refuse behavior before it
  happens.
- `VERIFY`: the exact facts that can be replayed, such as source bytes,
  call/result pairing, or durable correction delivery.

Missing capabilities are explicit and always use `FAIL_VISIBLE_CONTINUE`.
An unsupported or unreachable controller produces `CONTINUE_UNSUPERVISED`; it
must never freeze the host merely because a plugin was installed.

The generic handshake separates `declaredControlLevel` from
`claimableControlLevel`. Generic records are `SELF_ASSERTED`, so they are
claimable at most as `OBSERVATION_ONLY`. Replaying caller-provided bytes proves
integrity, not provider authenticity. A provider verifier must replay its own
runtime/ack/effect chain before it can return a higher verified level.

## Current support matrix

| Surface | Observe | Intervene | Verify | Honest product level |
|---|---|---|---|---|
| Claude Code native attached hooks | Structured session, actions, lifecycle and task tree | Pre-tool deny/rewrite/context plus Stop/SubagentStop | Existing Stage 0.5 run/evidence closure and independent acceptance | **Controlled**, when the installed runtime conformance is present |
| Claude Desktop Cowork | Plugin events on a local helper-reachable session | Same controller only after the real session/helper handshake | Existing Cowork runtime evidence | **Controlled only for a conformed local session**; remote/helper-inaccessible sessions must fail visibly |
| Codex CLI/Desktop/IDE shared runtime | Rollout JSONL with real `call_id` action/result pairing | Native 0.144.5 hooks plus the attached controller; all six installed candidates on the audited machine remain `untrusted` | Exact rollout bytes; local binary/schema/`hooks/list`; signed canonical app-server trace; private-source-replayed controller receipts | **Observation only on the audited machine**. Payload capture and Outsider attribution are implemented, but 0.144.5 app-server cannot exact-item-bind hook delivery; only the source-bound DoD in `CODEX-STAGE05-CONTROL.md` can promote a future run |
| DeepSeek Harness / Cordis | Pinned v0 session events and tool pairing | Audited correction at `agent/pre-step` through the pinned plugin | Durable message ack and preregistered behavioral effect can be replayed | **Delivery-supervised cooperative research adapter**; never malicious-worker/OS attestation, semantic outcome, loss, pricing, or guarantee |
| Trae / CodeBuddy legacy paths | Trajectory parsing or wrapper-dependent observation where available | Not proven by Worker Adapter v1 | No provider-specific source-replay adapter yet | **Observer/unsupported**, reported visibly |
| OpenHands and other providers | No runtime adapter in v1 | No | No | **Unsupported**, host continues unsupervised |

The Codex distinction is deliberate. `codex app-server hooks/list` proves that a
hook is discovered and reports its trust status. Generated JSON schema proves
what the engine understands. Neither proves that the hook ran, changed an
action, or reached the model. `--dangerously-bypass-hook-trust` is never used.

Codex trust is a manual user decision: after installing, open Codex, run
`/hooks`, inspect the exact Outsider command and hash for every registered
lifecycle event, and choose trust only if they are correct. Then run the
source-bound conformance described in `CODEX-STAGE05-CONTROL.md`. Outsider will
not automate that consent or bypass it. The current installation has not
completed those steps and therefore remains observation-only.

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

The probe writes the content-addressed record, schema, hooks-list, and a
machine-readable control-readiness sidecar. Even a fully replayed metadata probe
remains `OBSERVATION_ONLY` until a signed app-server source trace and trusted
controller receipts bind the same binary, schema, hook hash, session, turn, and
item IDs.

When the production hook actually runs, it now writes a mode-0600 canonical
payload/result source and a hash-only Ed25519 receipt. This proves payload
capture and Outsider decision attribution. It does not prove that Codex
delivered that result to the same action, or that the action semantically
recovered; those are separate machine fields and remain false without their own
native evidence.

Inspect raw DeepSeek Harness v0 events or an existing Harness observation:

```sh
outsider worker inspect deepseek-harness session-events.json \
  --session-id SESSION_ID --out deepseek-worker-observation.json
outsider worker verify deepseek-worker-observation.json \
  --source session-events.json --session-id SESSION_ID
```

The optional `--runtime-handshake`, `--correction`, `--correction-ack`, and
`--effect-evidence` files declare only their matching scopes at inspection. Pass
the same full chain to `worker verify` to obtain
`FULL_PROVIDER_SOURCE_REPLAY`; source bytes alone cannot authenticate delivery
or effect.

DeepSeek protocol replay proves a cooperative pinned-host chain. Its handshake
and ack are content-addressed, not independently signed by a trusted controller
or hardware/OS attestor. Therefore verified correction effects are machine-marked
`QUARANTINE_SHADOW_ONLY` and remain ineligible for production correction-effect
learning until a sealed controller run or trusted ingress policy accepts them.
Unknown providers return a machine-readable refusal with
`hostDisposition: "CONTINUE_UNSUPERVISED"` and `blocksHost: false`.

## Adapter SDK contract

A new provider adapter can join without changing controller semantics:

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

Worker Adapter v1 measures process behavior. It never establishes a semantic
outcome, economic loss, a price, a guarantee, execution authority, or settlement.
Those remain separate stages and cannot be inferred from a successful parse or
an intervention delivery receipt.
