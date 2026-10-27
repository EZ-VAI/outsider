# Stage 3 guarantee/reserve gate frontier

Status: local engineering frontier; every decision is `HOLD`.

This frontier closes local durability and fail-closed engineering seams without
claiming that Outsider is an insurer, issuer, custodian, reserve provider,
resource owner, or adjudicator. It accepts only the exact Stage 3/4 frontier
after `FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED` verification and
the exact Stage 2 `NON_BINDING_ABSTAIN` quote after full source and prefix
replay. A structurally valid or re-sealed object is not an accepted substitute.
That transitive Stage 2 replay must contain the exact
`empiricalSixSourceLedgerReplayed:true` receipt; the legacy five-source key is
rejected before the gate can initialize.

## What is bound

The genesis record binds the exact world policy, boundary, claim, way, world,
Reality envelope, Reality execution, consequence-obligation set, recovery plan,
recovery standard, Stage 2 frontier, Stage 2 quote identity and candidate, and
Stage 3/4 frontier hashes. The quote validity window caps the gate and every
capability candidate.

The durable state then provides:

- an Ed25519-signed state envelope rooted in a signed genesis record;
- an atomic lock plus revision-and-state-hash compare-and-swap on every write;
- idempotent command identifiers and a hash-chained event history;
- a content-addressed, active-signer checkpoint that callers can retain outside
  the gate directory as a rollback watermark;
- dual-signature signer rotation (old-key authorization and new-key possession);
- expiry, candidate revocation, and whole-gate revocation;
- aggregate and per-candidate request accounting; and
- required local bypass-audit hooks that fail closed if missing, throwing, or
  reporting an alternate path.

The lock has no automatic stale-lock takeover. A crashed writer can therefore
leave the gate unavailable until an operator inspects it. That is intentional:
availability does not outrank protection against concurrent double-accounting.

Atomic CAS prevents two cooperating writers from committing against the same
head. By itself it does **not** detect replacement of the entire current-state
file with an older, still-valid signed file. Whole-file rollback resistance is
established only when verification receives a previously retained
`requiredCheckpoint`. The checkpoint binds the gate, genesis, source anchor,
state hash, revision, event head, creation time, and signer. A current state
must equal that head or prove it as an ancestor through the next event's
`previousStateHash`. A checkpoint created after key rotation is signed by the
new active key, while older valid checkpoints remain verifiable through the
rotation chain.

## “Reserve request” does not mean reserve

The accounting policy uses an opaque `planningUnitHash` and decimal integer
reference units. Those units have no currency or asset equivalence. The state
records the active, released, and total-ever requests and enforces local
aggregate and per-candidate ceilings with atomic CAS. It always records:

- `actualReserveUnits: null`
- `currency: null`
- `reserveEstablished: false`
- `custody: false`
- `capital: false`

This is request-pressure and concurrency accounting. It is not evidence that
money, assets, capital, or a custodial balance exists. A stale balance snapshot,
caller boolean, or unrelated external hash cannot override the local CAS state.

## One-use capability candidate

A candidate is bound to a caller-committed before-state hash, an exact
capability-scope hash, the source graph above, an expiry, and one reference-unit
request. It can be presented once. Presentation consumes the local candidate
even though the result remains `HOLD`.

Every candidate fixes these boundaries:

- `ownerAdoptionVerified: false`
- `ownerGateActualWritePathVerified: false`
- `alternateWritePathsExcluded: false`
- `executionAuthorized: false`
- `actualResourceWrite: false`

The module exposes no resource-write callback. A successful local bypass audit
means only that the configured diagnostic hooks did not observe a bypass in
that cycle; it does not establish owner adoption or exhaustively exclude other
write paths.

## External receipts and authority

Reserve-provider, custodian, issuer, and resource-owner receipts may be stored
as forensic references. A signature can establish only cryptographic validity
under the key carried by that receipt. Until a provider-specific verifier and
external trust root exist, each receipt remains
`UNVERIFIED_NO_PROVIDER_SPECIFIC_VERIFIER`.

Even a cryptographically valid receipt always has zero effect here on issuer
standing, custody, reserve, owner adoption, coverage, guarantee, execution, or
fund movement. Those institutional facts are separate from local signature
validity. This version intentionally has no provider-specific promotion path.

## Responsibility and recovery

The source-bound responsibility roots, recovery plan, and recovery standard
remain nonwaivable and open. They survive:

- provider replacement;
- a coverage dispute or purported void;
- a learning-diet or warranty breach;
- gate or candidate expiry; and
- institution dissolution.

Payment, technical recovery, world restoration, and obligation closure remain
different states. This gate performs none of them. No coverage event, expiry,
provider event, or `VOID` label can erase the recovery obligation.

## Verification levels

`verifyStage3GuaranteeGateDirectory()` checks the source-anchor hash, signed
genesis, signer-rotation chain, signed current state, request conservation,
lifecycle rules, audit chain, and fixed authority boundary. It explicitly
reports `sourceArtifactsReverified: false` and
`genesisSignerExternallyTrusted: false`; the self-contained local key chain is
an integrity mechanism, not an external trust anchor.

Without a caller-held checkpoint it reports exactly `CURRENT_STATE_CHAIN_ONLY`
and `rollbackResistanceEstablished: false`. This is an explicit admission that
a self-consistent historical `state.json` cannot be distinguished from the
latest file using only material inside the same directory.

With `requiredCheckpoint`, verification authenticates the checkpoint under the
signer active at its revision and proves that the current event chain contains
that exact state head. It then reports
`CURRENT_STATE_CHAIN_WITH_REQUIRED_CHECKPOINT_ANCESTRY` and
`rollbackResistanceEstablished: true`, together with checkpoint revision lag.
An older checkpoint remains a valid lower bound but protects only back to its
own revision; callers should persist newer checkpoints as the state advances.
The verifier reports `checkpointIndependentRetentionVerified: false` because
it cannot prove where the caller stored the supplied file; rollback resistance
is explicitly relative to that supplied checkpoint.

`verifyStage3GuaranteeGateFull()` additionally reopens the complete Stage 3/4
and Stage 2 source context and byte-compares the resulting bindings. It still
reports no institutional standing, custody, reserve, coverage, guarantee,
execution authority, resource write, or funds movement.

## API sketch

```js
const policy = createStage3LocalRequestPolicy({
  policyIdHash,
  planningUnitHash,
  aggregateRequestCeilingUnits: "100",
  perCandidateRequestCeilingUnits: "60",
  requiredAuditHookIds: ["alternate-write-path", "owner-entrypoint"],
  createdAt,
});

const store = await Stage3GuaranteeGateStore.create({
  directory,
  stage34Frontier,
  stage34Context,
  stage2QuoteCandidate,
  localRequestPolicy: policy,
  createdAt,
  expiresAt,
  signerPrivateKeyPem,
});

const snapshot = await store.snapshot();
const checkpoint = await store.createCheckpoint({
  expectedRevision: snapshot.envelope.state.revision,
  expectedStateHash: snapshot.envelope.stateHash,
  createdAt: checkpointedAt,
}, signerPrivateKeyPem);

// Persist `checkpoint` outside the gate directory, then require it on reopen.
const guarded = await Stage3GuaranteeGateStore.open(directory, {
  requiredCheckpoint: checkpoint,
});
```

Initialization is API-only because full replay includes typed source bytes and
local source directories. The offline CLI can inspect and locally verify an
initialized directory and can submit CAS-bound request, presentation,
revocation, expiry, receipt, adversity, and key-rotation commands:

```sh
node scripts/stage3-guarantee-gate.mjs verify --dir <gate-dir>
node scripts/stage3-guarantee-gate.mjs verify --dir <gate-dir> \
  --required-checkpoint <caller-held-checkpoint.json>
node scripts/stage3-guarantee-gate.mjs status --dir <gate-dir> \
  --required-checkpoint <caller-held-checkpoint.json>
node scripts/stage3-guarantee-gate.mjs checkpoint --dir <gate-dir> \
  --command <checkpoint-cas.json> --key <local-key.pem> \
  --required-checkpoint <prior-checkpoint.json> --out <new-checkpoint.json>
```

CLI verification is deliberately local-only. It cannot promote the gate or an
external receipt.

## Readiness interpretation

Suggested readiness changes, after the implementation and attack suite pass:

- locally closable: durable local aggregate/per-candidate request accounting;
- locally closable: atomic CAS, concurrency, idempotency, expiry, revocation,
  signer rotation, and caller-held checkpoint rollback detection;
- locally closable: source-bound one-use candidate and fail-closed bypass-audit
  interface;
- still external: standing issuer and legal authority;
- still external: real reserve/capital existence and authorized custody;
- still external: resource-owner adoption of the actual write path;
- still external: binding contract, coverage, and enforceable guarantee.

No readiness ledger is edited by this module.
