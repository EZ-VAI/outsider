# Global Outsider federation (research preview)

Global Outsider is the provider-neutral observation and coordination plane above
provider-local controllers. It lets a Codex run hand an artifact to a DeepSeek
Harness run, then to Claude and Trae, while preserving which operator, exact
instrument version, runtime closure and correlation roots produced every step.
The signed task-plan layer additionally freezes task ownership, dependency
order, scope and the maximum claim each provider surface may make.

It does **not** turn one global service into a universal root shell. Claude,
DeepSeek, Codex and Trae retain their own local permissions. The global plane
can observe signed checkpoints, report stale or blocked work, verify bilateral
handoffs and accumulate research evidence. It cannot execute supervisor prose,
grant a tool, declare a semantic outcome on an observer-only host, establish
institutional independence, price risk, issue coverage or move money.

## Current capability ceilings

| Surface | Maximum claim |
|---|---|
| Claude Code / conformant Cowork | `CONTROLLED` local Stage 0.5 evidence |
| DeepSeek Harness pinned adapter | `DELIVERY_SUPERVISED`; durable delivery and bounded effect, no semantic outcome |
| Codex | `OBSERVER_ONLY` |
| Trae | `OBSERVER_ONLY` |
| Deterministic program / durable workflow | `CONTROLLED` only when its deterministic adapter establishes it |

A surface label cannot raise these ceilings. Verifiers recompute them from the
trusted instrument registry.

## Trust and private-key boundary

Each operator generates and retains its own Ed25519 private key. The public
trust store contains only public keys and governance commitments. A handoff is
two separate operations:

1. The sender signs an offer on the sender's machine.
2. The receiver verifies the offer and source attestation, then signs a receipt
   on the receiver's machine.

The registry never needs both private keys. Two or more public keys prove only
that multiple keys signed; they do not prove independent companies. Until
external governance evidence is admitted, every report says
`NOT_ESTABLISHED_BY_KEYS_OR_CONFIGURATION`.

## Live monitoring

An operator may publish a privacy-safe signed checkpoint with one status:
`STARTED`, `ACTIVE`, `BLOCKED`, `DELIVERY_READY` or `TERMINATED`. Checkpoints
form a per-run hash chain and carry only counters and content commitments. The
durable monitor rejects forks, rollback, post-terminal writes, tampering and
instrument substitution. It reports stale providers and reported blockers;
local controllers decide and execute corrections.

When a monitor is opened with a signed task plan, it also rejects:

- a provider starting before every dependency has a signed `DELIVERY_READY`
  checkpoint and output commitment;
- one planned task being split across two run identities;
- a task being executed by a different operator, instrument or Way;
- a dependency checkpoint or expected input artifact being substituted;
- a task-bound handoff that does not correspond to the frozen graph edge.

The coordinator's signature is a proposal, not authority over another company.
An assigned operator accepts only by signing its own task-bound checkpoint.
Neither the coordinator nor the global monitor receives another operator's
private key or local tool capability.

```sh
# Coordinator: freeze the provider-neutral DAG.
outsider federation-plan task-plan-spec.json \
  --trust-store trust.json --signing-key coordinator-private.pem \
  --out plan.json
outsider federation-plan-verify plan.json --trust-store trust.json

# Each operator signs only its own checkpoint. Root tasks use an empty
# dependencyCheckpointHashes array; downstream tasks bind the exact upstream
# DELIVERY_READY checkpoint hashes.
outsider federation-checkpoint checkpoint-spec.json \
  --task-plan plan.json --trust-store trust.json \
  --signing-key operator-private.pem --out checkpoint.json

outsider federation-monitor-ingest checkpoint.json \
  --task-plan plan.json --trust-store trust.json --state-root ./global-monitor
```

```sh
outsider federation-checkpoint checkpoint-spec.json \
  --signing-key operator-private.pem --out checkpoint.json

outsider federation-monitor-ingest checkpoint.json \
  --trust-store trust.json --state-root ./global-monitor

outsider federation-monitor-status \
  --trust-store trust.json --state-root ./global-monitor
```

## Bilateral handoff and final evidence packet

```sh
# Sender machine
outsider federation-offer source-attestation.json offer-spec.json \
  --task-plan plan.json --trust-store trust.json \
  --signing-key sender-private.pem --out offer.json

# Receiver machine
outsider federation-accept offer.json source-attestation.json \
  --task-plan plan.json --trust-store trust.json --signing-key receiver-private.pem \
  --received-at 2026-08-15T08:00:00Z --out handoff.json

outsider federation-task-handoff-verify handoff.json source-attestation.json \
  --task-plan plan.json --trust-store trust.json

# Assemble and verify the whole graph. packet-spec arrays may contain inline
# records or paths relative to packet-spec.json.
outsider federation-pack packet-spec.json \
  --trust-store trust.json --out packet.json
outsider federation-verify packet.json --trust-store trust.json

# Persist packet, replay protection and research-only supervision record.
outsider federation-ingest packet.json \
  --trust-store trust.json --state-root ./global-registry
outsider federation-status \
  --trust-store trust.json --state-root ./global-registry
```

`federation-sign-way` signs a provider's final Way attestation from a JSON spec.
Raw prompts, source, stdout, stderr, credentials, email and private keys are
forbidden from the public projection.

## What reaches the learning and clearing pipeline

Every verified packet creates one `outsider/federated-supervision/v1` record.
Every plan-aware monitor snapshot also creates one
`outsider/federated-task-supervision/v1` record with task status, dependency
waiting, blockers, staleness and operator count. The packet record is admitted
to the existing Stage 1 routing-research path; the new task record is an
explicit, content-addressed input for the next routing/liveness corpus adapter.
Neither is silently fed into the local causal-effect behavior model. Both are
excluded from:

- causal-effect learning;
- independent reliability denominators;
- incident frequency or loss severity;
- PRICE, GUARANTEE and SETTLE.

This keeps useful operational data without laundering correlated development
runs into insurance evidence. Production promotion still requires unrelated
external operators, adjudicated loss-bearing windows, complete exposure
denominators, fraud review and independent frozen holdouts.

## Evidence boundary

The current implementation and 385 deterministic product tests establish
protocol behavior, including a four-operator Codex → DeepSeek → Claude → Trae
graph fixture. That fixture uses independent keys and exact surface ceilings,
but it is not a four-company field run.
They do not establish that Codex, DeepSeek, Claude and Trae from four independent
companies have completed a real field chain. That needs four separately governed
operators, a frozen case, real provider runs, independently exchanged signatures
and the immutable R1–R5 field gates for the packaged Outsider version.
