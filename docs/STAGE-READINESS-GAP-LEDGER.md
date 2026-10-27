# Outsider stage-readiness and gap ledger

Status: local engineering/readiness audit and fail-closed interface. It grants no execution,
pricing, guarantee, settlement, custody, payment or closure authority.

## Why the old readiness shape is unsafe

The historical Outsiderf ladder correctly separated MEASURE, ATTEST, CURATE,
PRICE, GUARANTEE and SETTLE, but its executable readiness interface compressed
external facts into caller booleans such as `actuaryReviewed`, `jurisdiction`,
`standingIssuer`, `custody`, `guaranteeEligible` and
`independentAdjudication`. Those fields are useful checklist labels, but a
caller setting one to `true` cannot prove an actuary reviewed the exact model,
a legal entity has standing, capital exists, a custodian controls it, or an
adjudicator is institutionally independent.

The old Stage 3/4 prototype has the same boundary problem in executable form:

- `priceGuarantee` accepts an arbitrary object containing premium and capital;
- a jurisdiction string and a key in a local registry look like standing;
- different key strings look like independent organizations;
- custody is considered attested by a local signature over an amount;
- a claim can self-label its provenance as `bound` without source replay;
- the same claim/adjudication can be replayed, and aggregate reserve is not
  atomically consumed;
- a learning-diet change can void coverage without preserving harmed-party
  recovery; and
- payment is treated as the end of the lifecycle even though restoration,
  delayed consequence and reopening are separate facts.

Those modules are valuable protocol sketches. They are not safe production
bridges and must not be copied into the current evidence tree as authority.

## Four non-interchangeable gap classes

`src/outsider-readiness-gap-ledger.js` records every gap under exactly one
class:

| Class | Meaning | Can local code close it? |
| --- | --- | --- |
| `INTERNAL_ENGINEERING` | A parser, verifier, state machine, adapter, model harness or source-binding seam is missing | Yes, with implementation plus source-aware tests |
| `EXTERNAL_PLATFORM_CAPABILITY` | A worker, device or host does not expose the authenticated native control/identity surface the protocol needs | No; Outsider cannot manufacture a vendor or device capability |
| `EXTERNAL_EVIDENCE` | A target-bound real run, device execution, exposure window, loss, holdout, claim, payment or consequence observation is missing | Not by code alone. Source-aware official data can satisfy source-domain empirical subclaims; the exact Outsider target link remains open until observed. |
| `EXTERNAL_INSTITUTION_AUTHORITY` | Standing, owner adoption, rights, licence, actuarial review, issuer, custodian, adjudicator, challenge or closure authority is missing | Public records can establish real institutional precedent and performance. They cannot appoint that institution to an Outsider obligation. |

“External” therefore does not mean “less real,” “unusable,” or “only
research.” It means the fact is not manufactured by the local state machine.
Real public cases and experience must be admitted at their measured quality and
kept in their source domain; public origin does not lower them, and Outsider
collection does not raise them. The companion real-case catalog and
source-aware flywheel progressively fill each gap's observable components while
leaving only the exact target adoption, execution, or authority fact open.

The generic ledger accepts only hash-only external submissions. Every one is
stored as `SUBMITTED_UNVERIFIED` with `closureCredit:false`; it cannot change a
gap from `BLOCKED_EXTERNAL`. There is no `trusted:true`, `licensed:true`,
`independent:true` or `reviewed:true` input.

A future external closure requires a named provider-specific verifier that:

1. reads the underlying source, not just a JSON claim;
2. binds the exact subject/model/policy/contract and validity interval;
3. verifies an externally pinned governance policy and key history;
4. separates cryptographic validity from institutional standing;
5. exposes conflicts, revocation, appeal and scope; and
6. has its own adversarial tests.

No generic hash-only external submission earns closure credit, so every target
gap remains blocked until its named verifier runs. This does not erase the
source-domain facts established by source-replayed official evidence. Platform
gaps additionally require the upstream host or device to expose the missing
authenticated surface; a local adapter cannot substitute for it.

## Current capability and gaps by stage

### Stage 0.5 — MEASURE

Implemented internally:

- Claude Code/Cowork attached lifecycle control, frozen contract, event chain,
  intervention/effect/acceptance evidence and fail-closed recovery;
- a privacy-minimized, explicitly consented contribution path; and
- a provider-neutral capability/evidence protocol with fail-visible unsupported
  routing;
- a Codex hook-readiness verifier and production receipt emitter; and
- bounded source-replayed Codex and DeepSeek evidence adapters.

External platform gaps:

- Codex 0.144.5 does not expose the exact native item identity needed to bind a
  hook receipt to one app-server action, and it does not provide an
  authenticated model-visible correction channel;
- Trae, CodeBuddy, OpenHands and other workers still need provider-native
  authenticated pre-action and lifecycle surfaces for controlled parity.

External evidence gaps:

- fresh R1-R5 evidence for one current immutable artifact;
- unrelated repositories, operators and second machines;
- field correction/compliance effect and false-interruption rates.

The honest ceiling is the current public Claude/Cowork beta. On the audited
machine all six installed Codex hooks remain untrusted, so Codex is still
`UNCONTROLLED`; the new machinery proves readiness and receipt provenance, not
Claude parity.

### Stage 1 — ATTEST

Implemented internally:

- ATTEST v2 source verification, D1 duplicate disclosure and exact D2 grouping;
- append-only signed Evidence/Corpus registries; and
- full-source public-corpus replay plus consented Stage 0.5 projection intake;
- a lifecycle provider interface for revocation, timestamp, membership,
  retention and key rotation; and
- privacy-preserving operator-side replay receipts that reverify the original
  sealed Stage 0.5 run at intake.

External evidence gaps:

- the live corpus contains no real user contribution artifact set;
- no unrelated party has supplied an externally governed chain-verification
  receipt.

External institution gaps:

- governed signer membership, timestamp, revocation and rights policy.

The local provider interface is complete; no external transparency/timestamp/
revocation institution has been adopted, so the corresponding facts remain
blocked rather than caller-configurable.

### Stage 1.5 — CURATE

Implemented internally:

- a seven-set registry containing 12,370 full-source evidence identities and
  a separate 272-row metadata-only CUARewardBench quarantine;
- source-bound DROID, BotFails and UR5 adapters;
- episode/clearance/checkpoint/Merkle machinery; and
- a complete synthetic prospective protocol-conformance graph;
- a signed CEU dedup/reuse ledger and local model-update candidate ingress; and
- a preregistered causal-hypothesis survival instrument whose formal pilot has
  zero authoritative measured denominator; and
- a format-neutral device-stream/physics frontier with DROID retrospective
  full-source conformance, explicit sensor missingness, units, limits, timing
  and fusion checks.

The satisfied `S15_DEVICE_STREAM_AND_PHYSICS_FRONTIER` v1 scope is exactly the
format-neutral contract plus DROID retrospective adapter conformance. Concrete
ROSBAG2/MCAP parsers are explicitly unimplemented, separate future adapters
outside that v1 definition of done; no parser completion is claimed. A live
prospective stream is also absent. DROID proves retrospective adapter
conformance, not live control. Likewise, the local reuse gate does not itself
train or update a model and is not yet adopted by a production trainer.

External evidence gaps:

- zero real prospective device/control executions;
- zero independently sensed robot outcomes;
- no engineer-reviewed physical parameter set;
- no externally verified experience-creation/reuse rights.
- no real, independently adjudicated causal-hypothesis survival observations.

External institution gaps:

- an externally administered device/acquisition root;
- resource-owner and affected-party experiment governance;
- an institution able to enforce reuse limits and revocation.

Several public corpora are empirical records from real software or real
physical environments; others are controlled, simulated, generated, or
metadata-only. The word “research” in a branch or analysis name describes the
current permitted inference and authority, not whether the source observation
was real. These corpora improve parsers, failure taxonomies and missingness
maps. They do not by themselves create a CEU or permission to expose reality
to another experiment.

### Stage 2 — PRICE

Implemented internally:

- a strict loss/exposure quarantine requiring complete-window structure,
  separate operator/adjudicator/fraud roots and closed appeals;
- public-source adapters that refuse incident-only or incompatible
  denominators;
- a ten-factor source-bound mechanism shadow; and
- one retrospective source-specific proxy model. Only one of nine cohorts is
  evaluable, and its case-control outcome cannot estimate prevalence;
- a six-source empirical ledger whose isolated NHTSA lane contributes 1,324
  alleged incident-taxonomy observations but zero predictor, mechanism-causal,
  consequence-truth, frequency, loss or model rows;
- a versioned pre-action factor policy with temporal validation and explicit
  missing masks;
- dependence/drift/model admission interfaces that abstain when validation is
  absent; and
- one exact source-replayed ATTEST/CURATE/Reality/loss/model non-binding quote
  bridge, now retained as a historical diagnostic frontier; and
- a pinned RMA `final-v2` source-domain historical loss-cost receipt plus one
  unified typed progress projection.

The progress projection reports these facts as different types rather than
overloading `PRICE` as both a number and a permission:

```text
sourceDomainHistoricalLossCostIndication = NONZERO
targetTechnicalPremium                  = null
targetQuotedPrice                       = null
pricePermission                         = false
targetPriceState                        = NULL_NOT_ZERO
```

The nonzero number is a 2024 USDA RMA historical source-domain loss cost based
on publisher-recorded indemnity and matched exposure. It is not cash-paid or
independently adjudicated target loss, a prospective premium, an individual
policy quote, or an AI-agent/robot price. Existing RMA/CAS real-loss and
reserve-development diagnostics are referenced for method and missingness
design only. Their numeric amounts are not pooled across source domains and do
not enter the target quote.

Internal boundary:

- no additional local bridge may turn the nonzero source-domain indication or
  missing target inputs into a target premium or quote; the remaining target
  model work is evidence-contingent, not a boolean switch.

External evidence gaps:

- complete zero-loss denominator windows;
- independently adjudicated economic severity;
- temporal/customer/operator holdouts and correlation validation.
- a complete prospectively timestamped pre-action factor stream.

External institution gaps:

- qualified actuarial review of the exact data/model/code chain;
- externally governed adjudication and fraud review;
- jurisdiction-specific legal classification.

Therefore Outsider now has a reproducible nonzero historical loss-cost
prototype in one real insurance source domain. It still cannot estimate a
deployable AI-agent/robot incident probability, target monetary loss
distribution, target technical premium, quoted price or capital requirement.
The target price is absent (`null`), not numeric zero.

### Stage 3 — GUARANTEE

The current tree now has a source-replayed candidate bridge plus a durable local
request/capability gate. It provides CAS, aggregate and per-candidate reference
accounting, expiry, revocation, rotation, before-state binding, one-use
presentation and recovery-continuity invariants. It does **not** establish a
reserve, custody, issuer standing, coverage, owner adoption or a real resource
write. Its decision is permanently:

```text
HOLD_EXTERNAL_ISSUER_OWNER_CAPITAL_AND_EVIDENCE
```

That value belongs only to the generic readiness-ledger Stage 3 bridge. The
separate full-source authority frontier uses
`HOLD_EXTERNAL_ISSUER_OWNER_CAPITAL_CONTRACT_AND_EVIDENCE`; the durable local
gate fixes its `decision` to
`HOLD_NO_ISSUER_OWNER_CUSTODY_RESERVE_COVERAGE_OR_EXECUTION_AUTHORITY` and has
additional command-specific `HOLD_*` outcomes. These enums describe different
artifact layers and are not aliases or evidence of promotion.

It cannot emit a binding guarantee, coverage or execution authority. A safe
Stage 3 connection requires all of the following:

1. source replay of exact ATTEST, Claim, Way, World, Policy, stewardship and
   PRICE inputs;
2. a PRICE artifact based on admissible external evidence and review;
3. externally complete owner ledger, affected-party process and hard
   constraints;
4. a real issuer with jurisdiction-specific standing and policy wording;
5. atomic funded reserve and authorized custody under aggregate limits;
6. resource-owner adoption of the one-use capability as the real write path;
7. responsibility and recovery that survive provider or coverage changes; and
8. live bypass/revocation/concurrency/failure conformance.

Most importantly, a diet or warranty breach may suspend future actions, raise
reserve or trigger adjudication. It must not automatically erase recovery owed
to a harmed party.

Outsider can produce an eligibility/reference artifact. Only the external
contract and standing counterparty can create the guarantee.

### Stage 4 — SETTLE

The current tree now also has a signed append-only local claims lifecycle:
claim identity/dedup, configured-screening and appeal states, local aggregate
accounting, one-use instruction candidates, amendments/reopening, and strict
payment/recovery/restoration/closure separation. None of these local records is
an independent adjudication, reserve, custodian acknowledgement or payment.
The decision remains permanently held:

```text
HOLD_EXTERNAL_BINDING_ADJUDICATION_CUSTODY_AND_CONSEQUENCES
```

That value belongs only to the generic readiness-ledger Stage 4 bridge. The
separate full-source authority frontier uses
`HOLD_EXTERNAL_CONTRACT_CLAIM_ADJUDICATION_RESERVE_CUSTODY_AND_RECOVERY`. The
durable claims lifecycle uses artifact-specific `HOLD_*` decisions and fixes
its registry index to `HOLD_ZERO_SETTLEMENT_AUTHORITY`. These enums describe
different artifact layers and must not be compared as one shared state enum.

The minimum safe connection requires:

1. an externally binding Stage 3 contract, not a local
   `BINDING_ELIGIBLE` label;
2. source-replayed execution, trigger, economic fact and unique claim identity;
3. coverage/limit/reserve checks performed atomically;
4. institutionally independent adjudication, fraud and conflict review;
5. notice, challenge and appeal finality;
6. one-use settlement instructions and source-replayed custodian
   acknowledgements;
7. separate payment, recovery, restoration and closure states; and
8. mandatory delayed consequence horizons and reopening.

Payment can satisfy one financial obligation. It cannot prove the World was
restored or close an affected party's future challenge. Outsider never holds
or moves funds and never declares external closure.

## Executable closure order

The ledger exports six dependency-aware waves:

1. **Freeze interfaces.** Finish the exact quote seam and source-replayed
   Stage 3/4 gates while every authority bit remains false.
2. **Create live evidence flow.** Get unrelated user runs and one real-device
   prospective stream; connect them through Stage 1.
3. **Build admissible loss/model evidence.** Collect complete denominators and
   adjudicated severity; freeze pre-action factors and external holdouts.
4. **Obtain real review and counterparties.** Actuary, counsel, issuer,
   resource owner, custodian and affected-party process bind one policy.
5. **Run one funded guarantee pilot.** Exercise reserve, owner gate,
   revocation, bypass and responsibility continuity without Outsider claiming
   issuer authority.
6. **Settle one real claim without closing reality.** Produce one idempotent
   externally executed instruction while recovery and delayed horizons remain
   separately open and reopenable.

Engineering in waves 1–3 can proceed while counterparties are recruited, but
Stage 3 cannot bind before wave 4 and Stage 4 cannot settle before wave 5.

## API

```js
import {
  createReadinessGapLedger,
  buildStage3GuaranteeBridgeCandidate,
  buildStage4SettlementBridgeCandidate,
} from "./src/outsider-readiness-gap-ledger.js";

const ledger = createReadinessGapLedger({
  asOf: "2026-08-22T09:00:00.000Z",
  externalSubmissions: [{
    schema: "outsider/readiness-external-submission/v1",
    gapId: "S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY",
    artifactHash: "sha256:...",
    sourceKind: "counsel-and-issuer-package",
    submittedAt: "2026-08-21T00:00:00.000Z",
  }],
});
```

That submission remains unverified and closes nothing.

`buildStage3GuaranteeBridgeCandidate` requires only exact hash bindings and the
ledger. `buildStage4SettlementBridgeCandidate` additionally binds the Stage 3
candidate, execution, claim, consequence and recovery states. Both emit
content-addressed, self-checking HOLD artifacts with every authority field
fixed false.

The bridge skeleton intentionally has no generic `bind`, `settle`, `pay`,
`trusted`, `licensed`, `independent` or `reviewed` parameter.
