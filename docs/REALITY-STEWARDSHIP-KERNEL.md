# Reality Stewardship kernel

## The missing part of Outsider

The current ladder is necessary but not sufficient:

```text
MEASURE -> ATTEST -> PRICE -> GUARANTEE -> SETTLE
                  ^
               CURATE
```

Those stages mostly describe or settle a bounded case. Shared reality is not a
bounded transaction. It is persistent, path-dependent and shared by parties
who may never have chosen the machine. A run can finish successfully while:

- several individually acceptable experiments exceed one cumulative ecological,
  social or operational limit;
- a delayed consequence has not appeared yet;
- a non-failing set of components creates an unsafe interaction;
- the affected party is absent from the contract;
- compensation is offered for something that was never permissible to buy;
- a model reuses one risky experience in many later Worlds;
- a provider, model or company disappears while the obligation remains; or
- the action closes options that money cannot restore.

This is why finishing all six stages would still not by itself ensure that
reality is not treated as a disposable training environment.

The missing object is **Reality Stewardship**: a continuous constitutional and
control spine around every stage.

```text
Claim legitimacy and standing
-> affected-party representation
-> exact Way / World / owner boundary
-> non-fungible constraints and cumulative reality budget
-> adopted resource-owner gate
-> execution and multi-horizon consequence observation
-> challenge, recovery and obligation continuity
-> externally governed closure or reopening
-> bounded experience reuse
```

It is not a final Stage 5. It changes the conditions under which every existing
stage is allowed to make a claim.

## Why causality alone is not the answer

Causal analysis is one missing component, but not the whole missing layer.
Even perfect causal attribution would not answer:

- whether the experiment had legitimate standing;
- whether an affected party consented or was represented;
- whether the action consumed a scarce or non-renewable option;
- whether the total across many actors exceeded a shared limit;
- whether the harm was legally or morally non-compensable;
- who must continue monitoring and recovery after the executor disappears; or
- whether the learned result may be reused in another World.

Conversely, responsibility may remain even when causal identification is only
partial. `UNKNOWN`, `PARTIALLY_IDENTIFIED` and disputed consequence are states
to govern, not excuses to erase an obligation.

## The seven missing spines

1. **Ex-ante legitimacy.** A useful or learnable action is not automatically an
   action anyone has standing to impose on shared reality.
2. **Affected-party standing.** The bilateral operator-agent contract omits
   people, institutions, future interests and environments that bear effects.
3. **Cumulative reality capacity.** Per-run risk does not capture repeated small
   actions, shared dependencies, saturation, irreversibility or option loss.
4. **Open-world consequence accounting.** Consequences may be delayed,
   distributed, interacting and amended after the nominal run terminal.
5. **Responsibility and recovery continuity.** Fork, deletion, provider swap or
   corporate dissolution cannot close an obligation.
6. **Experience rights.** Data quality is not permission to create, learn from,
   resell or replay an experience.
7. **Adopted enforcement and plural challenge.** Outsider prose, hashes and risk
   models are not authority. The actual resource owner must enforce the gate,
   and affected parties need challenge, appeal and reopening paths.

The distinction between component failure and unsafe system interaction is
also central. MIT's STPA/STAMP work treats safety as a control problem in a
dynamic system: accidents can arise from unsafe interactions even when no
component failed. NIST's AI RMF similarly calls for deployment-context
measurement, affected-community feedback, appeal, override, recovery,
decommissioning and post-deployment monitoring. These are useful external
checks on the architecture; Outsider's implementation remains its own protocol.

- NIST AI RMF Core: <https://airc.nist.gov/airmf-resources/airmf/5-sec-core/>
- NIST post-deployment monitoring report: <https://www.nist.gov/news-events/news/2026/03/new-report-challenges-monitoring-deployed-ai-systems>
- MIT STPA Handbook: <https://psas.scripts.mit.edu/home/get_file.php?name=STPA_handbook.pdf>

## What each existing Stage lacks

| Stage | What it does | What stewardship adds |
|---|---|---|
| MEASURE | Records behavior and outcome evidence | Legitimacy before action, affected parties, cumulative budget, delayed horizons |
| ATTEST | Commits evidence and provenance | Standing, consent, truth beyond committed bytes, later amendments |
| CURATE | Labels experience quality and causal eligibility | Right to create/reuse experience, validity-domain enforcement, reuse externality |
| PRICE | Estimates a monetary risk object | Permission is not purchasable; non-monetary, irreversible and unknown harm remain separate |
| GUARANTEE | Allocates eligible residual risk | Actual owner authority, non-waivable constraints, executable recovery and responsibility continuity |
| SETTLE | Routes an adjudicated obligation | Payment is not restoration; delayed effects, appeal, reopening and systemic closure remain |

No scalar risk score is allowed to trade one of these dimensions against
another.

## Implemented research protocol

`src/outsider-reality-stewardship.js` adds the first deterministic vertical
slice.

`src/outsider-reality-stewardship-integration.js` now connects that kernel to
the implemented Stage 0.5 -> signed ATTEST -> CURATE path. It requires a
pre-committed CURATE evidence intent inside the exact Stewardship Claim,
replays the sealed Stage 0.5 and CURATE sources, binds every affected party,
constraint, budget reservation, responsibility root and delayed horizon, and
still emits only a fail-closed advisory envelope. See
`docs/REALITY-STEWARDSHIP-INTEGRATION.md` for the protocol and CLI.

### Reality boundary

It binds:

- exact World, policy and resource-owner roots;
- affected-party roots;
- hard prohibitions and cumulative externality caps;
- units and explicit `INCREMENTAL_SUM` or `CUMULATIVE_MAX` aggregation semantics
  for each consequence channel;
- mandatory immediate and delayed observation horizons;
- challenge policy and recovery standard; and
- validity time.

Every constraint is `nonCompensable:true`. A compensation proposal cannot make
a prohibited or over-cap action eligible.

### Stewardship claim

It binds:

- claimant standing;
- exact Way and operations;
- represented affected parties;
- requested load on every reality channel;
- alternative Ways considered;
- option-preservation evidence;
- recovery and responsibility roots; and
- for an Experience Claim, why reality is required, a causal design and
  experience-rights commitment.

### Cumulative budget assessment

Prior content-addressed commitments are summed per shared channel. This proves
the important anti-demo property: two actions can each fit under a cap in
isolation while the second is refused after the first consumes capacity.
Every Claim must explicitly include every boundary channel, including a zero
request for a hard prohibition; omission cannot make a constraint disappear.
Every prior commitment is replayed with the exact Claim that created it, so a
caller cannot reduce six consumed units to zero by merely recomputing a hash.

The current completeness class is deliberately
`OPERATOR_OBSERVED_NOT_EXTERNALLY_COMPLETE`. The result can become
`STRUCTURALLY_READY_PENDING_EXTERNAL_LEDGER_AND_OWNER_GATE`; it is not yet an
eligible owner-gate packet and can never authorize execution itself. The
affected-party register is likewise explicitly
`SELF_ASSERTED_NOT_EXTERNALLY_COMPLETE` until an external standing process
confirms who is represented.

### Consequence state

An immediate `SUCCESS` does not close the case. The state remains open until:

- every mandatory consequence horizon is reported;
- overdue observations are supplied;
- recovery is complete;
- affected-party challenges are resolved; and
- an external institution accepts closure.

Even then the local artifact says
`STRUCTURALLY_READY_PENDING_EXTERNAL_CLOSURE`, while `canClose:false`,
`externalClosureRequired:true`, `externalClosureEligibilityVerified:false` and
`obligationOpen:true` remain fixed in every state. A separate
`externalClosureReviewReady` bit becomes true only after the local structural
conditions are satisfied. A positive impact cannot use `NOT_REQUIRED` recovery; a claimed
`COMPLETE` recovery remains `RECOVERY_EXTERNAL_VERIFICATION_REQUIRED` until an
external party checks restoration against the World. A caller-provided
`CAUSAL_CLAIM` still creates zero CEUs without a separately verified prospective
causal chain.

Every affected-party root in the boundary must have an explicitly bound report
or `NO_REPORTED_IMPACT` statement at every horizon. These are still declarations,
not proof that the register was complete or that the party had valid standing.
Every consequence report must also contain a measured row for every boundary
channel, including an explicit zero with its evidence hash. An omitted channel
is missing observation, never zero impact. Opaque evidence and report hashes do
not prove the measurements or party reports behind them: consequence reports,
assessments and aggregate states therefore keep
`measurementTruthExternallyVerified:false` and
`affectedPartyReportsExternallyVerified:false` as fixed machine-readable
boundaries.

Standalone verification checks only canonical shape, fixed zero-authority
boundaries and content hashes. Assessment and consequence-state semantics are
reported as `SELF_CHECK_ONLY`. Replaying every protocol input can produce only
`STRUCTURAL_INPUTS_REDERIVED` with `protocolInputsReplayed:true`; it always keeps
`sourceReverified:false`. This means the deterministic schema derivation was
repeated, not that the opaque evidence bytes, measurements or party statements
were independently checked. Structural replay does not establish external ledger
completeness, affected-party standing, measurement truth, recovery or closure
authority.

### Responsibility continuity

Execution evidence must preserve every responsibility root named by the Claim.
A replacement provider may be added, but cannot delete the original principal
or provider obligation.

## Demonstrated anti-narrative facts

The focused tests establish that:

- a complete local case is only structurally ready for an external ledger and
  owner review, never authority;
- cumulative use refuses a second individually acceptable experiment;
- money cannot override consent or representation;
- an Experience Claim without causal design and rights stays on hold;
- successful delivery cannot close a delayed consequence horizon;
- recovery and challenge keep the obligation open;
- a causal-looking label does not mint a CEU; and
- provider replacement cannot erase responsibility.

## Honest boundary and next gates

This is a research/advisory kernel. It does not prove:

- an external resource owner adopted the gate;
- the affected-party register is complete;
- the declared cumulative ledger contains every real-world action;
- the consequence measurements are true;
- any causal claim is valid;
- recovery restored the affected World;
- a legal obligation, insurer, capital or payout exists; or
- an external institution accepted closure.

The next material progress is not another schema. It is to connect this kernel
to one real enforcement point and one real longitudinal consequence stream:

1. a resource owner refuses a consequential action unless the exact
   stewardship packet is accepted;
2. a real affected party or representative can file a challenge;
3. an obligation remains open across at least one delayed observation horizon;
4. recovery is independently checked against the World, not merely paid; and
5. an Experience reuse gate refuses a model update outside the original rights
   and validity domain.

That external adoption is the point where Outsider begins protecting reality,
instead of only describing how well machines acted inside it.
