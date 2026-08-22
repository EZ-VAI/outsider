# Codex Stage 0.5 control boundary

## Current, claimable state

Codex CLI 0.144.5 exposes the protocol pieces needed for a controlled candidate.
The machine audited on 2026-08-21 has six enabled Outsider entries
(`sessionStart`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `preCompact`,
and `stop`), but Codex reports every entry as `untrusted`. Therefore none fires
and the current machine is **UNCONTROLLED / observation-only**. A schema, an
installed file, or a caller-written Pre/Post/Stop array does not change that.

The repository now installs an opt-in authenticated path for future Codex
sessions. It registers `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PreCompact`, and `Stop` with the same command ending in
`--attached-control`. The flag routes the hook through Outsider's authenticated
local sidecar. The kernel uses the measured Codex rollout parser, rather than
silently parsing Codex JSONL as Claude JSONL. This is implementation readiness,
not a claim that a live host has already delivered every boundary.

## Verifiable definition of done

| Requirement | Evidence accepted | Evidence not accepted |
|---|---|---|
| Session/context identity | app-server `thread/started` with thread, session, parent, and cwd identities, cross-bound to controller receipts | cwd or session supplied only by the caller |
| Pre-action capture | trusted `preToolUse` hook completion carrying the same host item ID before that item starts, plus a signed controller receipt for the exact thread/turn/item | temporal adjacency inside a multi-item turn, a normalized `PreToolUse` object, or hook configuration alone |
| Controller decision and intervention | host-recorded approval decline/cancel for the exact item, cross-bound to a trusted controller DENY/BLOCK receipt | an Outsider decision object with no host receipt |
| Post/outcome | app-server item start/completion and `postToolUse` completion, cross-bound to an exact-item controller receipt | assistant prose saying the command ran |
| Stop/finalization | host `stop` hook completion and turn completion, cross-bound to a controller Stop receipt | a process exit or final answer by itself |
| Availability | each controller boundary records either an authenticated response or an explicit fail-visible outage; Pre/Stop in installed attached mode fail closed | timeout/nonzero/malformed hook output interpreted as success |

`LIFECYCLE_CONTROLLED` requires every row. `ACTION_CONTROLLED_PARTIAL` requires
an exact native decline/cancel cross-bound to a trusted Outsider controller
DENY/BLOCK receipt; a user decline or an unrelated hook block is not credited
to Outsider. Everything else is `UNCONTROLLED`.

## Source-bound evidence

`src/outsider-codex-control-evidence.js` separates three authorities:

1. the exact binary, generated schema, and `hooks/list` response are replayed;
2. canonical app-server JSONL is projected hash-only and signed by an allow-listed
   recorder, then replayed byte-for-byte during verification;
3. controller receipts are independently Ed25519-signed and bind hashed
   session/thread/turn/item identities, hook hash, input, decision, output, and
   outcome.

The signed trace intentionally contains no command, prompt, cwd, or output text.
Those bytes remain in the local mode-0600 source trace and are required only for
source replay. A random caller can sign its own trace, but verification rejects
the signer unless its key ID is in the recorder trust store. Mutating the trace,
reordering frames, crossing turns, substituting a controller key, omitting
Post/Stop, or changing hook trust all fail closed or downgrade the status.

The 0.144.5 app-server `HookRunSummary` does not expose an exact tool item ID.
Consequently ordering a hook before/after an item inside the same turn cannot
close Pre/Post identity, and the current host cannot reach
`LIFECYCLE_CONTROLLED` through this interface. Approval RPC is an exact
pre-execution gate, but Codex emits an approval request for only some actions.
Neither limitation is papered over with a caller claim.

The packaged attached hook now persists a controller receipt for each real
Codex invocation. The private canonical source contains the exact hook payload
and controller result; it is mode 0600, content-addressed, chained to the prior
receipt, and replayed before the Ed25519 receipt is accepted. The public receipt
is hash-only. A PreToolUse or Stop action fails closed if this evidence cannot
be persisted. Other lifecycle hooks fail visibly so their app-server trace is
red rather than silently complete.

That closes `LIVE_CONTROLLER_RECEIPTS_MISSING` when hooks actually fire; it does
not close the 0.144.5 host-delivery gap. Hook stdin includes the exact
`session_id` (the Rust `ThreadId`), `turn_id`, and `tool_use_id`, so the receipt
can prove which payload Outsider evaluated. However, 0.144.5's app-server
`HookRunSummary` omits `tool_use_id`, so the host trace cannot cross-bind that
receipt to the same item. The receipt therefore permanently says
`hostDeliveryObserved:false`. It also says
`semanticRecoveryEstablished:false`: completion correctness and recovery remain
separate Stage 0.5 evidence, not something a hook response can self-assert.

The machine-readable assessment keeps four claims separate:

1. `payload.canonicalHookSourceReplayed`: Outsider replayed the private hook
   payload and response;
2. `hostDelivery.exactActionCrossBinding`: Codex exposed enough native identity
   to prove delivery to that action;
3. `outsiderAttribution.trustedSignedReceipt`: the allow/block/observe decision
   came from the trusted Outsider key;
4. `semanticRecovery.established`: a separate causal/outcome proof exists.

On 0.144.5, (1) and (3) can be true while (2) and (4) remain false. That is a
real improvement in evidence capture, not Claude parity.

For clients that already speak app-server JSON-RPC, the packaged
`outsider-codex-app-server` executable is a transparent stdio bridge. It injects
one `hooks/list` request after the client's `initialized` notification, on the
same connection, proxies every other message unchanged, and seals the duplex
source at exit:

```sh
outsider-codex-app-server \
  --source ./private/codex-duplex.jsonl \
  --trace ./codex-control-trace.json \
  --signing-key ./private/recorder-ed25519.pem \
  --probe ./codex-worker-capability-probe.json \
  --native-binary /exact/path/to/native/codex \
  --schema ./codex-worker-capability-probe.json.schema.json \
  --app-server-schema ./codex-worker-capability-probe.json.app-server-schema.json
```

The bridge refuses to seal if the binary/schema/hook-list replay differs from
the probe, if the same-connection hook list is missing, or if any output path
already exists. Alongside the requested trace it writes
`<trace>.readiness.json` (or `--assessment <path>`). On the same initialized
connection it writes a private hook-metadata snapshot for the attached hook
process, pins the separate local controller public key before starting Codex,
and loads only source-replayed receipts for thread IDs
observed in that trace. The recorder private key is never inherited by Codex or
model-launched tools. Missing runtime receipts and host identity fields remain
machine-visible. It never adds
`--dangerously-bypass-hook-trust`. It also never
starts a thread or model itself; the connected client owns any such request.
Desktop/CLI sessions not launched through this bridge may not expose equivalent
raw app-server frames, so they remain below full parity unless another official
source provides the same evidence.

## Zero-model audit

Run:

```sh
npm run canary:codex:probe
```

The probe hashes the installed native binary, generates the experimental
app-server schema, calls `hooks/list`, replays all three sources, and writes a
machine-readable `.control-readiness.json`. It does not start a thread, submit a
prompt, invoke a model, or pass `--dangerously-bypass-hook-trust`.

A live conformance run is still required after reinstalling and trusting every
Outsider lifecycle entry in `/hooks`. Until a signed, source-replayed trace meets
the definition above, README/release claims must continue to exclude Codex from
the Stage 0.5 controlled-product promise.

## Known host limitations

- Hook trust is a user decision and changes when the command hash changes.
- A trusted/discovered hook is not proof that it fired.
- Codex does not currently provide a real `ask` permission decision through the
  hook output; it must not be described as human escalation.
- Context or input-rewrite delivery is not credited without a host-recorded
  canary.
- The local controller key is mode 0600 and pinned before a bridged run, but it
  is not hardware/OS attestation against a malicious same-UID process. A worker
  that can read arbitrary user-private files is outside this receipt's trust
  boundary and must not be described as contained by it.
- An app-server approval decline is real intervention, but it does not cover
  actions for which Codex never asks approval.
- This verifier proves control delivery and lifecycle closure. It does not prove
  semantic correctness, causal improvement, economic loss, PRICE, GUARANTEE, or
  SETTLE.
