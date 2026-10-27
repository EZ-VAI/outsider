# Stage 2 pre-action/model/quote frontier

Status: source-replayed engineering frontier; every current quote decision is
`NON_BINDING_ABSTAIN`.

The frontier does not treat recorded data as unreal merely because its current
permitted use is descriptive or shadow analysis. Agent traces recorded in a
software environment, physical robot observations, and signed loss/exposure
windows remain empirical observations of their stated environments. Separate
fields answer separate questions:

- what environment produced an observation;
- what the evidence establishes;
- whether the source bytes and derived facts may be used for a purpose;
- whether any institution has granted pricing, coverage, capital, guarantee,
  settlement, or funds-movement authority.

The last three questions cannot be answered by calling the data “real,” by
resealing a hash, or by adding a caller boolean.

## What the module adds

[`src/outsider-stage2-quote-frontier.js`](../src/outsider-stage2-quote-frontier.js)
contains three linked but independently checked boundaries.

### Pre-action factor policy

`outsider/stage2-pre-action-factor-policy/v1` imports the current empirical
agent and physical factor dictionaries and records, for every factor:

- source temporality;
- whether its source definition says it can exist before action;
- whether it is outcome- or publisher-label-derived;
- its unit and value type;
- its pre-action admission state.

An admitted value would need a source-replayed prospective receipt with an
observation timestamp strictly before the proposed action. No current public
artifact provides that receipt for the exact proposed Claim/Way/World. The
frontier therefore emits no factor values, explicitly masks every otherwise
eligible factor, never zero-imputes missing values, and returns
`ABSTAIN_NO_SOURCE_REPLAYED_PROSPECTIVE_FACTOR_RECEIPT`.

Full-trajectory values, failure labels, publisher-designated root causes, and
other post-outcome fields remain useful descriptive evidence. They are not
pre-action predictors.

### Model admission pipeline

The model interface preserves separate gates for:

- frequency and the complete exposure denominator, including zero-loss
  windows;
- adjudicated monetary severity;
- censoring and delayed-reporting maturity;
- dependence roots and connected-component partitioning;
- drift and an external temporal holdout;
- currency, exposure unit, and unit-definition domains.

The local loss/exposure book can contain signed closed windows, zero-loss
windows, and adjudicated monetary observations. Those observations are real
records within their stated provenance. They remain locally governed rows,
not externally governed L3/L4 model rows, and the current corpus has no
external holdout. Consequently the interface computes no posterior,
frequency, severity distribution, premium, price, capital, or coverage.

Multiple currencies or exposure-unit definitions are kept in separate model
cells. The frontier performs no implicit currency or unit conversion and
permits no cross-cell pooling.

### Exact quote candidate

`outsider/stage2-non-binding-quote-candidate/v1` binds one candidate to:

- exact Claim, Way, and World hashes;
- the replayed CURATE checkpoint/registry and clearance;
- the source-bound Reality envelope and evidence anchor;
- the empirical ledger and loss/exposure book;
- the factor policy, model domain, and validity domain;
- the declared rights reference and its unverified external status;
- the complete sorted evidence-hash set.

The quote identity is replay-protected against a local prior-candidate prefix.
All financial outputs are `null`; `PRICE`, `COVERAGE`, `GUARANTEE`, `SETTLE`,
funds movement, automatic training, and automatic deployment remain `false`.

## Source replay

A full verification does not trust a persisted `sourceReplay: true` claim. It
reopens and replays:

1. Stage 0.5 run bytes and the single-run signed ATTEST derivation;
2. the CURATE episode, clearance, checkpoint, and inclusion proof;
3. the exact source-bound Reality graph;
4. all six empirical sources, including exact DROID bytes and the NHTSA
   registry/official CSV/data-dictionary source-aware replay;
5. the loss/exposure quarantine, complete lineage, signatures, fraud reviews,
   adjudications, correlation structure, and shadow-book derivation.

`verifyStage2QuoteFrontierStructure` is intentionally only a structural
self-check. Use `verifyStage2QuoteFrontier` before relying on source bindings.
Likewise, use `verifyStage2QuoteCandidate`, not only its structural verifier,
when source replay is required.

The two structural verifiers always return `sourceReverified: false`. The two
full verifiers return `sourceReverified: true` only after exact rebuilding and
canonical comparison, together with stable `bindingHashes`. A frontier receipt
contains the frontier, Claim, Way, World, registry, Reality, factor-policy,
model-domain, validity-domain, rights, evidence-set, empirical-ledger, and
loss/exposure-book hashes. A quote receipt additionally contains the candidate
and quote-identity hashes. This is the source-bound interface for Stage 3/4;
Stage 3/4 must not substitute a structurally valid legacy factor report.

## CLI

The offline CLI is [`scripts/stage2-quote-frontier.mjs`](../scripts/stage2-quote-frontier.mjs):

```text
node scripts/stage2-quote-frontier.mjs build --spec stage2-spec.json --out frontier.json
node scripts/stage2-quote-frontier.mjs verify --spec stage2-spec.json --frontier frontier.json
node scripts/stage2-quote-frontier.mjs quote --spec stage2-spec.json --frontier frontier.json --out quote.json
node scripts/stage2-quote-frontier.mjs verify-quote --spec stage2-spec.json --frontier frontier.json --quote quote.json
```

The Stage 2 spec schema is
`outsider/stage2-model-quote-input-spec/v1`. It contains exactly:

```json
{
  "schema": "outsider/stage2-model-quote-input-spec/v1",
  "createdAt": "2026-08-21T00:00:20.000Z",
  "reality": {
    "envelopeFile": "reality-envelope.json",
    "sourceSpecFile": "reality-source-spec.json"
  },
  "empirical": {
    "ledgerFile": "empirical-ledger.json",
    "wave3SourceDirectory": "public-agent-wave3/source/cuarewardbench",
    "wave4SourceDirectory": "public-agent-wave4/source/agentrx-tau",
    "botFailsSourceDirectory": "public-robotics/source/botfails",
    "ur5SourceDirectory": "public-robotics/source/ur5fail-execution",
    "droidArtifactDirectory": "droid/verified-artifacts",
    "droidSourceDirectory": "droid/source",
    "nhtsaRegistryDirectory": "stage1-registry-all-evidence-v2-nhtsa",
    "nhtsaCsvPath": "nhtsa/nhtsa-sgo-ads.csv",
    "nhtsaDataDictionaryPath": "nhtsa/nhtsa-sgo-data-dictionary.pdf",
    "nhtsaReplayAt": "2026-08-21T11:00:08.000Z"
  },
  "lossExposure": {
    "bookFile": "loss-book.json",
    "quarantineFile": "loss-quarantine.json",
    "quarantineLineageFiles": [],
    "adjudicationFiles": ["loss-adjudication-1.json"],
    "trustStoreFile": "loss-public-trust-store.json",
    "now": "2026-08-21T00:00:00.000Z"
  },
  "quote": {
    "requestedAt": "2026-08-21T00:00:21.000Z",
    "validFrom": "2026-08-21T00:00:22.000Z",
    "validUntil": "2026-08-21T00:00:30.000Z",
    "priorCandidateFiles": []
  }
}
```

Paths are resolved relative to the Stage 2 spec, except paths inside the
Reality source spec, which are resolved relative to that spec. Output files
use no-clobber creation with mode `0600`.

The empirical gate accepts only `FULL_SIX_SOURCE_REPRODUCED` with both source
artifact and empirical-value replay flags true. A five-source ledger, a missing
NHTSA source option, or an NHTSA operator claim without exact CSV/PDF replay
fails closed. NHTSA remains an isolated real-world incident-taxonomy lane and
does not supply a pre-action predictor, event denominator, loss row, model row,
training permission, or price authority. Every quote therefore remains
`NON_BINDING_ABSTAIN`.

The frontier's exact replay receipt records
`empiricalSixSourceLedgerReplayed:true`. The legacy
`empiricalFiveSourceLedgerReplayed` key is not an alias: replacing the six-source
key with it, or adding it as an extra field, fails exact schema verification.

The CLI has no `trusted`, `reviewed`, `FULL_SOURCE`, price, loss, denominator,
holdout, coverage, or authority switches. Unknown fields and arguments fail.

## Adversarial coverage

The tests cover:

- post-outcome and publisher-label leakage into a pre-action vector;
- deletion of explicit missing masks and zero-imputation attempts;
- fake externally governed denominators and economic-loss samples;
- fake holdouts, pricing numbers, capital, and authority;
- a coherent outer-hash reseal over a swapped empirical ledger hash;
- omitted correlation components;
- rewritten currency and exposure-unit domains;
- unknown quote fields and caller trust flags;
- repeated quote identities;
- PRICE/coverage/guarantee/settlement promotion.

Self-consistent reseals that can pass a structural check still fail full source
replay.

## Current source-chain admission

The historical quote frontier above remains byte- and schema-compatible. A
separate interface in
[`src/outsider-stage2-current-chain-admission.js`](../src/outsider-stage2-current-chain-admission.js)
closes its earlier isolation from the current research chain. The interface
requires both the frontier's original full source set and stable, exact-byte
reads of the pinned responsibility-math and actuarial-architecture canonicals.
The architecture verifier then rebuilds responsibility math from its complete
source profile in the same call. That replay transitively authenticates the
frozen catalog and flywheel and replays every flywheel lane, including the six
official ClinicalTrials.gov API objects behind the current ClinicalTrials
artifact.

Stage 2's selected-wave pins and the exact top-level canonicals are concentrated
in `STAGE2_CURRENT_CHAIN_PINS`. The full flywheel has sixteen required artifact
receipts, not only the two newly reviewed leaves; the Stage 2 pin set binds
their count and a canonical hash over the complete receipt commitment set. The
individual upstream pins remain owned and verified by the flywheel, math, and
architecture modules rather than being misleadingly duplicated here. The
presently tested selected subgraph is:

```text
ClinicalTrials final-v3 ─┬─> catalog final-v18 ─> flywheel final-v16 ─┐
                         └─────────────────────────────────────────────┤
Wave5 intake final-v3 ───┬─> catalog final-v18 ─> flywheel final-v16 ─┤
                         └─────────────────────────────────────────────┘
                         temporal audit final-v2 ─┤
                                flywheel ─> math final-v14 ─> architecture final-v11
                                                   └─> Stage 2 admission contract
```

These are the two selected current-wave leaves, not the complete evidence
universe. They are not presented as a false linear chain. The pin contract
carries typed subgraph edges: the catalog binds their semantic hashes,
the flywheel carries and fully replays their exact artifact receipts, math
stable-reads and exactly rebuilds the flywheel, and architecture stable-reads
and exactly rebuilds math. The selected temporal-audit chain is math final-v14
and architecture final-v11. It carries 16 pinned receipts (9 temporally
ordered, 7 temporal-quarantine), 40 quarantine-reference factors and 62
ordered-receipt reference factors, with zero current-factor, target-training,
pricing, transfer, or authority admission.

The pin object is one reviewed contract. The source-only contract is frozen
no-clobber at
`artifacts/stage2-current-chain-admission-20260828/final-v4/contract.json`;
historical artifacts are not rewritten. Its semantic `contractHash` is
`sha256:f132e191a2e53b87f677983b85dadb25c3f9c4693254e4e8e4c24856caeb0a33`.
Its exact serialized file is 19,833 bytes with SHA-256
`sha256:17b2ff445dd7042f59700a599a4b8a368c53a1bb6e9213ac55135278b68c093a`.
Readiness is `HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY`. The old 20260822
final-v1 is an archived predecessor and exact-routes only to 20260828 final-v2,
whose same-family markers then reach final-v4; that routing grants no admission.

The canonicalizable object is
`outsider/stage2-current-source-chain-admission-contract/v1`, built by
`buildStage2CurrentChainAdmissionContract`. It binds the exact current source
chain and the fixed zero-output boundary but contains no Claim, Way, World, or
quote. This is intentional: the repository currently has no durable persisted
Stage 2 quote-frontier source bundle. A random, temporary protocol test fixture
must not be presented as a real quote. The contract is structurally checked by
`verifyStage2CurrentChainAdmissionContractStructure` and fully replayed by
`verifyStage2CurrentChainAdmissionContractAgainstSources`.
`verifyStage2CurrentChainAdmissionCanonicalStructure` additionally enforces the
one physical repository path and exact canonical bytes but still claims no
source replay. `verifyStage2CurrentChainAdmissionCanonicalAgainstSources`
combines that stable read with a same-call full source replay. The freeze CLI
is `node scripts/stage2-current-chain-admission.mjs freeze-contract`; rerunning
it refuses to overwrite final-v4 before any replay or write.

`buildStage2CurrentChainAdmission` accepts exactly the Stage 2 frontier and its
sources, the math and architecture artifact paths, and the math source profile.
It accepts no caller receipt, trust flag, readiness flag, or promotion switch.
`verifyStage2CurrentChainAdmissionStructure` checks only the deterministic seal
and fixed zero-authority boundary and explicitly reports no source
authentication. Persisted objects encode replay *requirements*, never a
self-asserted `sourcesReplayed:true`; only the same-call full verifiers return a
positive replay result.

The current quote-specific schema is explicitly
`outsider/stage2-ephemeral-current-source-chain-admission/v1`. Tests may build it
from a temporary protocol fixture, but its lifecycle fixes
`canonicalEligible:false` and a null durable-bundle manifest. It cannot be the
canonical artifact described above. A future quote-specific canonical requires
a new schema bound to a durable replayable Stage 2 source-bundle manifest. The
test fixture is never canonical evidence.

Admission means only that the current real source-domain diagnostics and model
architecture may inform factor-role audit and missing-prerequisite design. It
admits zero target pre-action rows, zero target predictors, zero target training
or loss rows, and zero fitted target components. Frequency, severity, target
risk, premium, `price`, `PRICE`, capital, coverage, guarantee, settlement, and
responsibility outputs remain `null`; readiness, training, deployment, pricing,
capital, settlement, and operational authority remain `false`. ClinicalTrials
source bytes are replayed, but rights terms are not frozen, so that lane grants
no training or pricing right.

## Readiness boundary

The implementation supplies a locally testable policy, admission pipeline, and
exact cross-stage abstaining bridge. It does not supply the external evidence
or authority named by these readiness gaps:

- `S2_COMPLETE_ZERO_LOSS_EXPOSURE_WINDOWS`
- `S2_ADJUDICATED_ECONOMIC_LOSS_SEVERITY`
- `S2_EXTERNAL_HOLDOUT_AND_CORRELATION_VALIDATION`
- `S2_INDEPENDENT_ACTUARIAL_REVIEW`
- `S2_EXTERNAL_ADJUDICATION_FRAUD_TRUST`
- `S2_LEGAL_PRODUCT_CLASSIFICATION`

Those gaps must remain externally blocked until their actual institutions and
source evidence exist.
