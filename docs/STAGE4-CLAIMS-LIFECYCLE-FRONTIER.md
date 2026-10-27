# Stage 4 durable claims-lifecycle frontier

Status: local source-bound engineering frontier. Every decision is `HOLD`.
Nothing in this module establishes insurance coverage, adjudication authority,
capital, custody, payment authority, restoration or obligation closure.

The evidence entering this frontier can include observations recorded in real
software and real physical environments. Those observations are empirical;
calling this branch a frontier, shadow workflow or research use does not make
the underlying environment unreal. The limitation is what the evidence is
authorized to prove and what Outsider is permitted to do with it.

## Exact input boundary

`registerVerifiedClaim` accepts a Stage 4 candidate only after two independent
local checks succeed:

1. `verifyStage34AuthorityFrontier` must replay the exact Stage 2 frontier,
   Stage 2 quote, empirical/loss/Reality sources and current Stage 3/4 frontier,
   returning
   `FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED`; and
2. `verifyStage4SettlementInstructionCandidate` must rebuild the candidate
   against the exact readiness ledger and prior-candidate prefix, returning
   `FRONTIER_LEDGER_AND_LOCAL_PREFIX_REPLAYED`.

The transitive Stage 2 frontier must carry the exact
`empiricalSixSourceLedgerReplayed:true` receipt. A legacy or additional
`empiricalFiveSourceLedgerReplayed` field is schema-invalid, so it cannot enter
the claims lifecycle through a re-sealed Stage 3/4 candidate.

The persisted claim identity comes from the Stage 3/4 candidate's exact
Reality envelope, execution and consequence-obligation bindings. A second
candidate with the same identity but a different candidate hash is a conflict,
not another claim. Exact retry is idempotent.

The configured `policyId`, `policyVersion`, policy hash and coverage hash are
references only. The config and every claim fix all of these facts false:

- coverage established;
- issuer standing verified;
- contract binding verified; and
- a coverage change may erase recovery.

## Durable registry

`DurableStage4ClaimsLifecycleFrontier` stores:

```text
config.json       signed immutable configuration and local reference catalogs
events.jsonl      append-only, monotonically numbered, signed hash chain
index.json        signed deterministic replay index
artifacts/*.json  content-addressed claims, amendments, receipts, reserves and instructions
```

Writes use an exclusive single-writer lock. Artifact bytes and the event log
are fsynced before the signed index is replaced atomically. A valid signed event
suffix can repair a stale signed index after an interrupted write. Exact
artifacts are idempotent; reused identities with different bytes fail closed.

The registry uses a global identity namespace, but a local copy cannot prove
that it has seen every claim everywhere. `globalCompletenessEstablished` is
therefore always false. A signed checkpoint held outside the registry detects
whole-directory rollback and proves that a later log contains the checkpointed
prefix. It does not create an external transparency network.

## Receipt and authority boundary

External lifecycle receipts are signed JSON assertions. They are always
preserved, but an unregistered source is recorded as:

```text
SUBMITTED_UNVERIFIED_SOURCE_NOT_REGISTERED
```

A matching source-verifier ID, allowed receipt kind, key and valid signature
changes only the local disposition to:

```text
CONFIGURED_SOURCE_SIGNATURE_VALID_AUTHORITY_UNVERIFIED
```

That means “this configured key signed these exact bytes.” It does not mean
the key belongs to an independent adjudicator, insurer, affected-party body or
custodian. Configuring a key cannot self-create institutional standing,
independence or external adoption.

Every receipt also binds the current `claimStateHeadHash`. Receipt subjects are
exact: ordinary workflow receipts bind that current head; coverage receipts
bind the configured coverage reference while still carrying the current head;
recovery, restoration, delayed-consequence and closure receipts bind the exact
Reality consequence-obligation set while still carrying the current head; and
payment reports bind an existing current-head payment instruction hash. A
receipt for any older claim-state head is retained in history but cannot be
registered again or affect the active workflow.

## Candidate lifecycle

Configured-source receipts drive only a local candidate state machine:

1. fraud and conflict screening;
2. adjudication;
3. notice;
4. challenge-window maturity or an open challenge;
5. appeal when challenged;
6. coverage-reference and learning-diet status;
7. versioned claim amendment while preserving the original claim;
8. reserve accounting and a held instruction candidate;
9. technical recovery and world restoration;
10. delayed consequence horizons; and
11. a closure candidate that always leaves the obligation open.

An appeal cannot be skipped. A payment instruction candidate requires clear
fraud/conflict candidate states, payment-eligible adjudication, delivered
notice, either a matured no-challenge window or an upheld appeal, coverage
state exactly `REFERENCED_CANDIDATE`, and learning-diet state exactly
`COMPLIANT_CANDIDATE`. Missing coverage/diet receipts, coverage `VOID` or
`DISPUTED`, and diet `BREACH` all fail closed. If coverage or diet becomes
ineligible after an instruction candidate was recorded, a later payment-
execution receipt is rejected.
Finalized screening, adjudication, challenge and appeal cells cannot simply be
flipped by a later receipt.

An amendment is not a reset counter or an unstructured receipt. It is a
content-addressed artifact with an immutable original `claimRecordHash`, exact
`amendmentVersion`, `previousAmendmentHash`,
`previousClaimStateHeadHash`, amended-content hash, evidence hash and derived
new `claimStateHeadHash`. Versions must be contiguous and the hash/head links
must match the current tip. The signed event chain makes the sequence
append-only. Reordering, truncation against an external checkpoint, or
content-resealing under a different hash fails replay.

Advancing the amendment head opens a fresh procedural cycle. All older-head
receipts, reserve candidates and payment-instruction candidates remain visible
as immutable audit history but are inactive. Every subsequent screening,
adjudication, reserve, instruction and execution report must bind the newest
head. Exact retry of an amendment is idempotent; an amendment-ID conflict,
skipped version, wrong predecessor or stale head is rejected.

## Reserve and instruction boundary

Reserve accounting is serialized under the registry lock. It enforces one
local reserve candidate per claim-state head, exact pool/currency bindings and
an aggregate accounting limit. An amendment invalidates the old reserve for a
new instruction, but does not pretend that the old accounting commitment was
released: historical amounts remain charged against the conservative local
aggregate until an external capital/custody system supplies a separately
authorized release mechanism. The report exposes the locally accounted and
remaining amounts. It always says:

- `fundsReserved:false`;
- `capitalExistenceVerified:false`; and
- `custodyVerified:false`.

A payment instruction candidate binds the exact original claim record, current
claim-state head, current-head reserve, amount, currency and payee reference.
Its raw one-use nonce is never persisted; only a domain-separated nonce hash
enters the signed artifact. Exact replay is idempotent, while nonce reuse for
different bytes and a second instruction on the same active head are rejected.
Nonce use remains global across amendment heads. The instruction is permanently
`HOLD_NON_EXECUTABLE_PAYMENT_INSTRUCTION_CANDIDATE`.

## Reality cannot be closed by payment

The replay index keeps these cells independent:

| State | What a configured signed receipt may record | What it never proves |
| --- | --- | --- |
| Financial payment | execution reported candidate | money moved or authorized custody |
| Technical recovery | completion candidate | independently verified repair |
| World restoration | restoration candidate | the affected world is restored |
| Delayed consequence | mature observation candidate | every future consequence is known |
| Obligation closure | closure eligibility candidate | legal or institutional closure |

Payment, a coverage `VOID` assertion, or a learning-diet breach never changes
technical recovery, world restoration or the non-waivable recovery rule. Even
after a closure-eligibility receipt, `obligationOpen` remains true. A later
mature delayed-consequence receipt changes the candidate state to
`REOPENED_CANDIDATE`, reopens technical recovery and requires a new world-
restoration assessment.

## Verification and CLI

```bash
node scripts/stage4-claims-lifecycle-frontier.mjs verify \
  --directory /path/to/registry

node scripts/stage4-claims-lifecycle-frontier.mjs verify \
  --directory /path/to/registry \
  --required-checkpoint /path/to/checkpoint.json

node scripts/stage4-claims-lifecycle-frontier.mjs report \
  --directory /path/to/registry --as-of 2026-08-21T00:00:00.000Z

node scripts/stage4-claims-lifecycle-frontier.mjs checkpoint \
  --directory /path/to/registry \
  --operator-private-key /path/to/operator-private.pem
```

CLI output is canonical JSON. `--out` is no-clobber and mode `0600`.

## Red-team coverage

The focused tests cover:

- full-source admission versus a structural or caller-asserted claim;
- exact retry, same-claim/different-candidate conflict and claim replay;
- unregistered fake adjudicator and fake custodian keys;
- fraud/conflict ordering and appeal bypass;
- missing/void/disputed coverage and missing/breached learning-diet instruction
  attacks, including post-instruction invalidation of payment reports;
- versioned amendment linkage, exact retry, skipped/wrong predecessor, stale
  head replay, old reserve/instruction reuse, and global nonce reuse across
  heads;
- amendment reorder, checkpointed truncation and content-reseal attacks;
- concurrent writer lock, per-claim conflict and aggregate reserve exhaustion;
- repeated instruction ID, repeated nonce and second instruction attacks;
- reported payment being promoted to restoration or closure;
- coverage void or diet breach erasing recovery;
- a mature delayed consequence reopening a closure candidate; and
- a whole-ledger rollback checked against an externally held signed checkpoint.

## Suggested readiness-ledger changes

This module intentionally does not edit the canonical readiness ledger. After
integration review, the following *local engineering portions* have executable
implementations and tests and can be considered for `SATISFIED_INTERNAL`:

- `S4_CLAIM_REPLAY_DEDUP_IDEMPOTENCY` — for source-bound identity, append-only
  local replay, idempotency and conflict handling; this does not establish a
  real covered trigger or global ledger completeness;
- `S4_APPEAL_REOPENING_STATE_MACHINE` — for the candidate fraud, conflict,
  notice, challenge, appeal, amendment and reopening state machine;
- `S4_PAYMENT_RESTORATION_SEPARATION` — for non-overlapping payment, technical
  recovery, world restoration, delayed consequence and obligation cells;
- `S4_LOCAL_RESERVE_ACCOUNTING_AND_RECEIPT_FRONTIER` — for the local atomic
  accounting, latest-head/aggregate checks, one-use instruction and
  configured-source receipt-verification interface; capital, custody and an
  authorized acknowledgement remain external; and
- `S4_DELAYED_CONSEQUENCE_RECOVERY_BINDING` — for exact consequence-set
  subject binding and reopenability; actual longitudinal maturity and
  affected-party evidence remain external.

All `S4_*` external-evidence and external-institution-authority gaps remain
open. In particular, this work supplies no real covered claim, independent
final adjudication, payment/recovery evidence, longitudinal maturity,
adjudicator institution, custodian rail, affected-party institution or closure
authority.
