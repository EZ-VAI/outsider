# Stage 0.5 engineering delivery boundary

This repository is the authoritative Stage 0.5 product root. Normal user-facing operation is transparent attached mode: UserPromptSubmit
persists the verbatim operator ledger and the first synchronous tool boundary freezes the audited contract before any tool action executes.
`outsider run` remains the owned-process CI/headless path. The historical
`Outsiderf` tree remains a protocol and actuarial reference; it is not silently
linked into the runtime and its old hook CLI is not shipped as the controller.

## Frozen baseline

- Baseline date: 2026-08-10 (Asia/Shanghai).
- Deterministic protocol suite before this change: 113/113.
- Gate corpus before this change: 125/125, zero false interruptions, zero slips.
- Current controlled protocol: Claude Code native hooks; Desktop Cowork is conditional on a recorded plugin-hook conformance run.
- Existing persistent controller semantics, lease recovery, task graph, patrol,
  acceptance and causal-proof rules are regression boundaries.

## Gate 1 — canonical evidence ingress

Every new controlled run freezes `stage05-binding.json` before the first world action. Owned-process mode also freezes it before worker
launch; attached mode truthfully records `createdBeforeWorker:false` and `createdBeforeFirstAction:true` because the host has already asked
the model for a tool call when the synchronous PreToolUse boundary arrives.
It binds the product implementation, composed Way, frozen contract and evidence
policy. The default admission is observation-only/research. Claim, World,
standing and authority are never inferred from filesystem or process identity.
Explicit Claim/Way/World hashes are reference bindings, not a locally reverified
V35.4/V36 ClaimWayCase or constitutional clearance.

Each v2 event commits to the previous event hash. Completion emits a private
evidence manifest, a hash-only public derivative and a canonical projection.
Old v1 runs remain recoverable but are not eligible for cryptographic ATTEST v2.

## Gate 2 — ATTEST v2

ATTEST v2 accepts only independently verifiable Stage 0.5 run directories. It:

- rejects broken binding, raw evidence or event-chain commitments;
- deduplicates copied run IDs and rejects conflicting copies;
- rejects mixed extractor/product/controller/host/Way evidence domains;
- records correlation instead of claiming component independence;
- distinguishes safe delivery, conservative stop and unfinalized runs;
- never claims generalization beyond included evidence;
- supports an external Ed25519 signer and keyless third-party verification.

Raw prompts, paths, outputs and credentials remain local-private. Public
derivatives contain commitments and terminal classifications only.

## Gate 3 — one truthful product

`outsider` is the single user entry with `run`, `evidence`, `attest` and
`verify`, plus product operations `doctor`, `runs` and `show`. The old positional run syntax remains compatible. `outsider-hook`
is explicitly a host sensor/RPC client, not a second product or autonomous
controller. A release artifact is built only after the full suite, corpus,
fresh extraction, CLI smoke test and the same tests inside the extracted package.
Private run evidence persists in the user's state directory rather than `/tmp`.

## Claims deliberately not made

This delivery does not claim Codex/Trae lifecycle control, owner standing,
WorldConstitution enforcement, pricing, guarantee, insurance payout, real
multi-hour reliability, or universal semantic correctness. Those need later
steps and independent evidence; adding fields here would not create them.
