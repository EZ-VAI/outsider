# Outsider three-layer Outcome architecture

Status: approved architecture descendant, 2026-09-04. This document adds a
product-layer model above the frozen Outsider network and authority contracts.
It does not rewrite an existing artifact, grant authority, establish capacity,
authorize payment, create a guarantee, or prove an Outcome.

## Decision

Outsider is not another general agent. General agents are replaceable clients,
route proposers, executors, and observers. Outsider is the agent-neutral fabric
that gives an Outcome a durable definition, forms recoverability around it,
and, only when every external gate is current, clears a binding commitment.

The product has three independently useful layers:

```text
any user / Codex / Gemini / Claude / local agent / application
                              |
                              v
L1  OUTCOME OS
    define, observe, coordinate, and replay an Outcome
    no mandatory primary/recovery/witness topology
    no result promise
                              |
                              | append-only promotion receipt
                              v
L2  FORMATION + RECOVERY OPTIONS
    bind a real primary capability
    plus an executable contingency or externally held option
    plus trigger, exercise, expiry, and loss bounds
    no guarantee claim
                              |
                              | append-only promotion receipt
                              v
L3  OUTCOME COMMIT
    current primary reservation
    plus current recovery reservation
    plus current independent-witness reservation
    plus authority, funding, lawful paths, and adjudication
    COMMIT or UNAVAILABLE
```

All three layers use the same durable network substrate. A higher layer adds
external obligations and evidence; it does not mutate the underlying Outcome
or reinterpret a lower-layer receipt.

## Market and competitive position

Models, search, browser control, MCP, UCP, A2A, provider APIs, payment mandates,
and merchant order events are transport and execution liquidity. Outsider uses
them; it does not treat them as a defensible product boundary.

The layers support different markets without conflating their promises:

| Layer | User value | Economic surface | Promise |
| --- | --- | --- | --- |
| Outcome OS | One stable definition, status, evidence plan, and replay across agents | open/low-cost protocol and workflow surface | none |
| Formation + Recovery Options | A pre-formed alternative can be exercised before the deadline | formation fee, option fee, capacity spread | recoverability only to the exact acquired strength |
| Outcome COMMIT | Multiple independent parties and capital stand behind the accepted result | clearing fee, assurance premium, capital/claims economics | exact bounded Outcome commitment |

Low-loss tasks may use only L1. Medium-loss or deadline-sensitive tasks can buy
L2 recoverability without buying insurance. Only cohorts for which avoided
residual loss exceeds premium and residual committed loss should enter L3.

The commercial admission inequality is:

```text
expected residual loss without Outsider
  - (Outsider price + expected residual loss with Outsider) > 0
```

Failure of that inequality means the cohort is not an assurance product. It
does not prevent use of L1 or an honestly scoped L2 service.

## Permanent substrate

The frozen individual/event graph remains:

```text
PrincipalEpoch
  -> AccountableDeployment
  -> Runtime / Embodiment
  -> Delegation
  -> Episode
  -> Attempt
```

No layer may use IP address, device, base model, agent brand, transport key, or
global score as network-person identity. Changing Codex to another agent must
not change the Outcome, owner authority, Episode identity, reservation,
obligation, or witness truth.

The permanent safety relations remain:

```text
C_enabled subset_of A_proven
Reach(C_enabled) subset_of E_committed
Reach(C_enabled) subset_of R_committed
```

Structural conformance, a signature, a provider acknowledgement, a model
score, a server receipt, or an agent self-report never mints authority or
independent Outcome truth.

## Canonical records

### Outcome Contract

`OutcomeContractV1` is immutable and provider/agent neutral. It contains or
binds:

- the acceptance predicates and their units/comparators;
- completion deadline and any latest-safe recovery trigger;
- budget ceiling and maximum consequence envelope;
- evidence policy and observation window;
- privacy-preserving context references;
- the frozen typed graph and order/Episode references;
- revision, predecessor, and supersession links;
- a content address.

L1 does not require primary, recovery, or witness routes. Provider URLs,
credentials, payment material, capacity assertions, or model-created authority
are forbidden in the public contract. Raw natural-language goals and secrets
remain private. A public projection must not expose raw PII or a stable naked
hash derived from low-entropy PII.

Changing a predicate, deadline, budget ceiling, or maximum consequence creates
a new versioned Outcome Contract with an explicit supersession link. It never
edits the old contract.

### Product Profile Receipt

The contract does not contain a mutable service tier. An append-only
`OutcomeProfileReceiptV1` records a transition and its proof bindings:

```text
OUTCOME_OS
FORMATION_READY
CONTINGENCY_READY
RECOVERY_OPTION_HELD
COMMIT_READY
COMMITTED
```

Each receipt binds the Outcome contract, previous profile receipt, source
state, target bundle, proof references, effective/expiry instants, revision,
and receipt hash. A promotion receipt proves only the facts its verifier
actually replayed. It never creates owner authority, capacity, funding, or
Outcome truth.

Only `L1 -> L2 -> L3` promotion is allowed. Expiry or revocation appends a new
lifecycle event and closes current effective capability without deleting the
historical promotion. After `COMMIT`, lost capacity is a breach that must enter
recovery, remedy, claim, or challenge; it is not a silent downgrade.

### Formation and Recovery Package

`RecoveryPackageV1` binds:

- a real primary capability and its exact transaction state;
- a separately executable contingency capability or external option lease;
- distinct failure-domain references;
- trigger predicate and latest-safe trigger instant;
- exercise mandate and idempotency identity;
- validity, expiry, revocation, cancel, and compensation semantics;
- combined cost ceiling and maximum consequence;
- current evidence coverage;
- a package content address.

Option strength is explicit:

```text
DISCOVERED_ROUTE
EXECUTABLE_CONTINGENCY
CAPACITY_OPTION_HELD
CAPITAL_BACKED_OPTION
```

A search result, product page, quote, cart, availability string, or agent plan
cannot be labelled `CAPACITY_OPTION_HELD`. L2 may retain partial formation
records, but profile promotion requires a real primary executable capability
and a distinct executable contingency or externally held option, along with
exercise authority, a trigger policy, bounded cost, and remaining deadline
feasibility.

### Outcome Commitment Bundle

L3 composes rather than replaces the existing strict contracts. The bundle
binds:

- strict Outcome Tender and Outcome Program hashes;
- current resource-owner authority;
- current primary and recovery reservations;
- current independent-witness reservation and independence proof;
- maximum-loss and consequence envelope;
- callable recovery or funding capacity;
- lawful transaction and payment paths;
- trusted time and external lifecycle heads;
- zero-Outsider-staff-touch proof;
- external adjudication and challenge paths.

Existing `OutcomeProgramV1` and the product foundation composition correctly
require `PRIMARY`, `RECOVERY`, and `INDEPENDENT_WITNESS`. They remain strict L3
preparation contracts and must not be weakened to make L1 easier.

## Layer state machines

### L1 — Outcome OS

```text
RECEIVED
  -> COMPILED
  -> OPEN
  -> ATTEMPTING
  -> EVIDENCE_PENDING
  -> OBSERVED_SATISFIED
     | OBSERVED_NOT_SATISFIED
     | INCONCLUSIVE
     | EXPIRED
```

An agent self-report enters an `AGENT_REPORTED` evidence class only. It cannot
alone produce `OBSERVED_SATISFIED`.

### L2 — Formation and Recovery Options

```text
FORMATION_REQUESTED
  -> CANDIDATES_DISCOVERED
  -> PRIMARY_CAPABILITY_BOUND
  -> CONTINGENCY_CAPABILITY_BOUND
  -> RECOVERY_OPTION_HELD
  -> RECOVERABLE_ACTIVE
  -> PRIMARY_ATTEMPTING
  -> RECOVERY_TRIGGERED
  -> RECOVERED
     | OBSERVED_SATISFIED
     | FAILED
     | RECOVERY_COVERAGE_LOST
```

The final evidence class remains explicit when L2 has no independent witness.
L2 is a claim about acquired recoverability, never an Outcome guarantee.

### L3 — Outcome COMMIT

```text
COMMITMENT_FORMING
  -> STRICT_PROGRAM_COMPILED
  -> REQUIRED_RESERVATIONS_CURRENT
  -> COMMITMENT_PROPOSAL_READY
  -> PRINCIPAL_AUTHORIZED
  -> ATOMIC_COMMIT
  -> EXECUTING
  -> OUTCOME_VERIFIED
     | RECOVERY_ACTIVE -> RECOVERED
     | REMEDY_OR_CLAIM_OPEN
     | CHALLENGED
  -> CLOSED
```

Failure to close all gates by the formation deadline produces `UNAVAILABLE`,
not a partial promise or employee queue.

## Component boundaries

| Component | Owns | Must not own |
| --- | --- | --- |
| Outcome Compiler | predicates, deadline, dependencies, evidence plan | authority, provider choice, capacity |
| Agent Gateway | replaceable route proposals and agent Attempts | COMMIT or agent self-verification |
| Formation Broker | discovery, quotes, capability binding | calling a candidate an option |
| Recovery Option Manager | lease, trigger, exercise, expiry, revocation | Outcome truth or guarantee |
| Commitment Clearing | strict L3 conjunction and atomic decision | generic browsing or seller search |
| Edge Execution Node | local credential, native effect, reconciliation | centrally minted authority |
| Witness Node | reservation, observation, challenge | executor self-attestation |
| Episode/Data Plane | every Attempt/occurrence, source replay, lifecycle | deleting occurrences through object dedup |
| Risk Engine | deadline survival, dependence, recovery effect, CVaR | binding price before evidence gates |
| Capital/Claims Plane | funding, remedy, claims, adjudication | ordinary L1/L2 execution |

Outsider staff do not appear as a fallback component. External humans can be
purchased resources, owners, witnesses, or adjudicators. Any normal-order
Outsider employee touch is a product failure.

## Agent and node APIs

The target product API is:

```http
POST /v1/outcomes
GET  /v1/outcomes/{outcomeId}
POST /v1/outcomes/{outcomeId}/route-proposals
POST /v1/outcomes/{outcomeId}/observations

POST /v1/outcomes/{outcomeId}/formations
GET  /v1/formations/{formationId}
POST /v1/formations/{formationId}/authorizations
POST /v1/formations/{formationId}/recovery-exercises

POST /v1/formations/{formationId}/commitment-proposals
POST /v1/commitment-proposals/{proposalId}/authorizations
GET  /v1/commitments/{commitmentId}

GET  /v1/episodes/{episodeId}
```

The production transition API first exposes hash-only preparation and
classification endpoints. It does not accept natural-language goals,
credentials, PII, arbitrary URLs, payment material, or executable code.

The existing `POST /v1/formation-jobs` remains an internal deterministic
execution seam. It is not converted into a central store for user secrets.

Every mutating endpoint requires a durable intent written before effect,
idempotency identity, exact capability and typed-graph binding, expiry, and a
reconciliation path.

## Existing foundation map

| Capability | Existing implementation to reuse |
| --- | --- |
| strict Tender | `src/outsider-outcome-tender-v1.js` |
| strict three-role Program | `src/outsider-outcome-program-v1.js` |
| private goal compilation | `src/outsider-outcome-product-foundation-composition-v1.js` |
| L3 prepare/confirm seam | `src/outsider-outcome-product-runtime-v2.js` |
| durable program/recovery DAG | `src/outsider-durable-outcome-program-orchestrator-v1.js` |
| hash-only production dispatch | `src/outsider-formation-job-worker-v1.js` |
| Cloudflare durable job store | `src/outsider-cloudflare-sqlite-do-formation-job-store-v1.js` |
| local deterministic effect | `src/outsider-node-deterministic-executor-service-v1.js` |
| transaction adapter contract | `src/outsider-transaction-surface-adapter-contract-v1.js` |
| authority admission | `src/outsider-action-admission.js` |
| one-use mandate/acceptance | `src/outsider-one-use-commitments-v1.js` |
| external reservation lifecycle | `src/outsider-external-capacity-reservation-protocol-v1.js` |
| witness lifecycle | `src/outsider-independent-outcome-witness-lifecycle-v1.js` |
| durable obligation | `src/outsider-reality-obligation-store.js` |
| occurrence/Attempt denominator | `src/outsider-episode-attempt-set-composition.js` |
| product-to-data bridge | `src/outsider-outcome-product-episode-data-bridge-v1.js` |
| Node SDK/conformance | `src/outsider-network-node-sdk.js` and `src/outsider-network-node-contract-conformance.js` |
| candidate search ordering | `src/outsider-formation-candidate-ranking-bridge-v1.js` |
| data queues | `src/outsider-episode-data-engine.js` |
| actuarial/causal foundation | `src/outsider-actuarial-model-evolution.js` and `src/outsider-stage2-rma-shadow-pricing.js` |

An internal `PROGRAM_COMMITTED` state is not automatically a user-visible L3
commitment. Only the complete external composition can issue that meaning.

## Engineering program: 0 through 8

Each phase has three separate exits:

- `C_i`: reusable code and contract complete;
- `P_i`: durable production service complete;
- `R_i`: external reality complete.

No product claim is enabled until:

```text
C_i and P_i and R_i and requested_capability subset_of A_proven
```

### Phase 0 — Truthful three-layer split

**Code (`C_0`)**

- Add the three-layer contract/profile vocabulary as a versioned descendant.
- Preserve all frozen strict modules.
- Add no-promotion and no-authority boundary checks.

**Production (`P_0`)**

- Report L1, L2, and L3 readiness independently in the production capability
  manifest and health surface.
- Preserve legacy formation-job routes.

**Reality (`R_0`)**

- Reclassify current SparkFun, Target, Best Buy, and Adafruit facts at their
  actual quote/HOLD strength. None is L2 or L3 merely because code exists.

**Exit:** zero incorrectly promoted external facts.

### Phase 1 — Outcome Contract and L1 kernel

**Code (`C_1`)**

- Implement provider-neutral Outcome Contract, verification, supersession,
  profile receipt, and L1 lifecycle.
- Do not require three resource roles.

**Production (`P_1`)**

- Add a durable Outcome API with private-input/public-projection separation.
- Accept replaceable agent clients without making agent brand an identity.

**Reality (`R_1`)**

- Two different agent clients submit conformant proposals for one real goal
  into the same Episode.

**Exit:** replacing the agent changes neither Outcome identity nor authority.

### Phase 2 — Multi-agent execution and observation

**Code (`C_2`)**

- Add route-proposal, Attempt, and observation ingestion contracts.
- Bind every action to the frozen graph and occurrence census.

**Production (`P_2`)**

- Run event-driven status/timer workers with reconnect and cold replay.
- Keep hot-path model/browser/staff/user-babysitting counters at zero.

**Reality (`R_2`)**

- Run at least three Outcome families through the same core with no vertical
  branch; at least one produces a real external Attempt.

**Exit:** duplicate effects zero; agent self-report never becomes Outcome truth.

### Phase 3 — L2 Formation and Recovery Package

**Code (`C_3`)**

- Implement Recovery Package, option strength, trigger, exercise,
  failure-domain separation, and L1-to-L2 promotion.
- Reuse current candidate ranking only for search order.

**Production (`P_3`)**

- Connect candidate fan-out and option lifecycle to the Formation Worker as a
  durable background service.
- Keep option expiry and revocation live.

**Reality (`R_3`)**

- One Outcome obtains a real primary executable capability and a distinct
  executable contingency or externally held recovery option.

**Exit:** a quote, cart, or availability claim can never produce
`RECOVERY_OPTION_HELD`.

### Phase 4 — Edge nodes and replaceable reality interfaces

**Code (`C_4`)**

- Add an executable Node SDK descendant with local credential brokerage,
  order-scoped capabilities, revocation, and reconciliation.

**Production (`P_4`)**

- Operate at least two independently administered node operators with leases,
  dead-node recovery, and deployment pins.

**Reality (`R_4`)**

- Turn off the founder machine and founder search credential. The task still
  executes or honestly returns `UNAVAILABLE`.

**Exit:** secret bytes delivered to the central coordinator equal zero.

### Phase 5 — First real automatic recovery

**Code (`C_5`)**

- Implement deadline triggers, option exercise, primary compensation/cancel,
  recovery Attempt succession, and evidence closure.

**Production (`P_5`)**

- Run the multi-day lifecycle across restarts. A repeated recovery command
  cannot duplicate an effect.

**Reality (`R_5`)**

- Inject one real bounded primary failure. Activate the contingency inside the
  latest-safe window with zero Outsider employee touches.

**Exit:** one complete primary-failure to recovery to evidence Episode exists.
This is the first product breakthrough and does not wait for L3 insurance.

### Phase 6 — Strict L3 COMMIT

**Code (`C_6`)**

- Compose L2 promotion with the existing strict Tender, Program,
  reservations, witness, authority, loss, and obligation gates.

**Production (`P_6`)**

- Deploy atomic commitment clearing. Payment authorization remains a separate
  exact mandate.

**Reality (`R_6`)**

- Hold current external owner authority, primary/recovery/witness
  reservations, and loss backing simultaneously, then complete an
  independently verified Outcome.

**Exit:** false `COMMIT` equals zero; an incomplete conjunction returns only
`UNAVAILABLE`.

### Phase 7 — Data, causal recovery, actuarial risk, and capital

**Code (`C_7`)**

- Estimate layer-specific deadline survival, failure dependence,
  `P(Y | do(recovery))`, residual loss, option value, CVaR, and reserve needs.

**Production (`P_7`)**

- Let admitted evidence affect search order and option sizing. Binding price
  stays behind its independent authority and evidence gates.

**Reality (`R_7`)**

- Obtain an exact cohort with complete group-disjoint, independently observed
  failure/recovery/loss Episodes plus real capital, claims, and adjudication.

**Exit:** otherwise remain `KEEP_BASELINE` and `NON_BINDING_ABSTAIN`; do not
enable PRICE, GUARANTEE, or SETTLE.

### Phase 8 — Global federation and adoption flywheel

**Code (`C_8`)**

- Publish the Node SDK, agent-client SDK, signed adapter distribution,
  revocation feeds, and standing-capacity protocol.

**Production (`P_8`)**

- Operate multiple clouds, discovery indexes, agent clients, Edge Nodes, and
  witness operators.

**Reality (`R_8`)**

- Complete across two geographies, two verticals, and two independent node
  sets. Removing one cloud, one search provider, and all founder accounts still
  yields success or honest `UNAVAILABLE`.

**Exit:** coverage growth comes from protocols, agent reach, Edge Nodes, and
order-produced capacity, never employee outreach throughput.

## First physical milestone under the new architecture

The cable milestone remains small in financial consequence but must exercise
the general architecture.

**L1:** The Outcome is that, before the deadline, the destination possesses a
compatible cable that passes connector, data-transfer, and 5 V predicates. It
is not “place an order”. Two different agent clients can propose routes without
changing that contract.

**L2:** A real seller capability is primary. A different seller/fulfilment
failure domain is the contingency. The package binds the trigger, latest-safe
exercise time, authority, maximum spend, and exact option strength. A second
web page is not an option. One injected primary failure must activate recovery
automatically.

**L3:** Both routes have current reservations, an independent instrument or
person has a witness reservation, maximum user loss has callable backing, the
exact payment/order mandate is separately authorized, and post-delivery
evidence verifies data and 5 V. A failure enters recovery or claim lifecycle.

The immediate milestone is a real L2 automatic recovery Episode. L3 follows;
it no longer blocks the broad L1 market or the L2 recoverability product.

## Work explicitly deprioritized

- building a generic chat superagent;
- measuring progress by connector or provider row count;
- seller-specific scripts when a platform-family protocol is available;
- interactive browser clicking as a production hot path;
- a provider marketplace without real options or reservations;
- synthetic/auditor expansion unrelated to the live production Episode;
- PRICE/GUARANTEE/SETTLE before Phase 7 reality gates;
- any normal-order Outsider human fallback.

The active implementation order is:

```text
three-layer vocabulary and truthful production manifest
  -> Outcome Contract + Profile Receipt
  -> L1 durable API
  -> Recovery Package and L1-to-L2 promotion
  -> real L2 primary/contingency pilot and failure exercise
  -> L3 strict composition
  -> capital/claims/adjudication
  -> federated adoption
```

## Resource-side admission is not the product entry point

This section is an additive architecture clarification. It does not replace
the three-layer decision above or change the engineering gates. Outsider still
enters through a user's Outcome: L1 defines and observes it, L2 acquires and
operates recoverability, and L3 may issue an Outcome commitment only after the
strict external conjunction closes. A resource-side admission interface is an
optional evidence-producing node at those layers. It is not a new layer, the
default customer journey, or a prerequisite that limits coverage to resources
installed or contacted by Outsider.

A resource owner may expose signed, source-native observations such as quota,
queue position, rejection, maintenance, revocation, capacity pressure, or an
admission decision. Outsider may use a current observation to veto a route or
reduce its evidence coverage. The observation cannot mint delegation,
resource-owner authority, executable capability, reserved capacity, an
independent Outcome fact, or `COMMIT`. Silence is not admission. A resource
observer does not choose the Outcome, globally score an agent, or become a
central traffic-control gate through which every agent must pass. Any future
allocation or congestion policy remains owned by the resource and must arrive
as a typed, time-bounded source fact.

### Recovery mechanisms and failure domains

L2 supports three recovery mechanisms:

- `ROUTE_SUBSTITUTION` moves execution to a distinct resource or transaction
  route.
- `STATE_ROLLBACK` restores a source-bound snapshot or branch before a failed
  state transition proceeds.
- `COMPENSATING_ACTION` applies a separately authorized action that bounds or
  reverses the consequence when substitution or rollback is unavailable.

Every recovery option must bind its mechanism, latest safe exercise time,
exercise and cancellation references, and exclusive-exercise semantics. The
exclusive rule must prevent a primary and recovery path from becoming
simultaneous writers merely because a trigger raced with late primary
progress. These structural bindings describe what would have to be exercised;
they do not show that the resource will honor it.

Primary and recovery options also bind typed failure-domain references and
their source-evidence references. Their relationship is one of:

```text
PROVEN_DISTINCT
KNOWN_SHARED
UNKNOWN
```

`KNOWN_SHARED` and `UNKNOWN` block promotion to a recoverable or held profile.
`PROVEN_DISTINCT` means only that admitted failure-domain evidence supports
the required distinction; it does not prove capacity, eliminate unobserved
common causes, or guarantee recovery. The current v2 portfolio implementation
performs deterministic typed-reference comparison and keeps external capacity,
exercise authority, held-option, and recoverable-active claims false. Real
promotion still requires current source replay from the relevant resource
controllers and lifecycle heads.

### Compatibility below and above the canonical model

Outcome OS remains Outsider's internal canonical state and evidence model. It
is needed for deterministic hashing, append-only replay, cross-provider
comparison, privacy projection, and consistent truth boundaries. It is not a
claim that external agents or resources must abandon their native protocols.

Adapters may map AP2, UCP, A2A, provider-native APIs, MCP tools, or later
standards into and out of the canonical records. Each mapping must bind the
external schema and revision, identify lossy fields, preserve source
provenance, and retain native authority and revocation semantics. Conformance
to a mapping proves structural compatibility only. An external protocol
message, server acknowledgement, or syntactically complete mandate remains
subject to the same source-replay, authority, capacity, evidence, and
commitment gates.

Resource observations, standards mappings, and future calibrated failure
signals therefore strengthen the three layers without replacing their product
center. They are inputs and vetoes for delivering a user's Outcome. Outsider
does not become a resource-owner risk gateway, a bot-ranking service, or a
mandatory installed intermediary, and the current repository does not claim
that a cross-provider congestion market or calibrated failure predictor
already exists.

## User-held execution nodes and unlimited ingress

Outsider's production executor is not one founder-controlled terminal and is
not a remote browser operator. Any authorized user, agent runtime, resource
owner, merchant connector, or appliance may run an Edge Node which opens only
outbound machine connections. The central Formation plane publishes an
order-scoped, keyed job; exactly one eligible node claims it; private
parameters and provider-native exchanges remain at that node; the node returns
only a keyed execution receipt. Discovery and proposal submission may enter
from any compatible agent or transaction surface, so network reach is bounded
by interoperable Internet endpoints rather than employee outreach or one
account holder.

```text
Outcome OS + Formation coordinator
  -- keyed public job --> durable one-use claim ledger
  <-- keyed receipt --- user/resource-owned Edge Node
                            |
                            +-- provider-native HTTPS/API/MCP/UCP/AP2/A2A
                            +-- local 0600 parameters and source bytes
                            +-- no inbound port and no browser hot path
```

This split preserves the three-layer product center:

- the coordinator forms the temporary supply network and prevents duplicate
  exercise;
- the Edge Node performs only authority-bounded provider effects and cannot
  mint authority, capacity, or `COMMIT` by claiming a job;
- an independent witness, not the executor's self-report, establishes Outcome
  evidence;
- L2 recovery remains a separately exercisable route with a typed failure
  domain, not another process on the same node presented as independence.

The effect boundary is durable. `PUBLISHED -> CLAIMED -> COMPLETE` permits the
invocation to be delivered once. A second unclosed claim receives no
invocation and cannot reassign the effect. The node must persist its local
result before returning the receipt. If receipt delivery fails after provider
I/O, reconciliation may replay only that durable local result while provider
network access is mechanically disabled. Missing or partial local state stays
`EFFECT_UNKNOWN / DO_NOT_RETRY`; it never causes a second cart, booking,
message, reservation, or order.

The first deployed implementation uses an order-scoped HMAC commitment and a
pre-bound capability hash behind the Formation credential. This is sufficient
to remove PII and naked PII-derived hashes from the central plane, but it is
not the final federation trust mechanism. Multi-owner production nodes should
replace the selector with an expiring order-scoped public-key proof, publish
revocation state, and remain replaceable without changing the Outcome
contract. None of these transport proofs is independent Outcome truth.

## Seller-neutral evidence is the network scaling seam

Unlimited ingress cannot mean teaching the central coordinator every seller's
checkout schema. A source adapter runs beside the relevant buyer/resource
interface and emits one closed, content-addressed route-evidence object. The
central Formation and recovery math receives only the route occurrence and
four normalized facts:

```text
SPECIFICATION  exact frozen predicates: MATCH | MISMATCH | UNPROVEN
ALL_IN_PRICE   item + tax + shipping + fees: COMPLETE | PARTIAL | UNAVAILABLE
ETA            deadline-comparable time: STRUCTURED | UNSTRUCTURED | UNAVAILABLE
CAPACITY       owner lifecycle: RESERVED | UNRESERVED | UNAVAILABLE
```

Provider and product identifiers, raw responses, destination/contact data,
credentials, and payment material stay at the Edge Node. This is a semantic
interface, not a trust shortcut: every fact retains its source-occurrence and
replay references, negative facts survive normalization, and only the existing
recovery admission gate decides whether a route may enter planning. Inventory,
ATP, a cart, a seller acknowledgement, or an executor receipt cannot be
relabeled as owner-lifecycle capacity or independent Outcome truth.

Proposal occurrence storage and evidence admission remain separate. The
production registry counts every real proposal occurrence, including rejected
ones, while object deduplication avoids treating repeated discovery as a new
route. Any agent or user-held node can append the two hash references using the
same compare-and-append protocol. Thus a new Internet entry point expands
coverage by shipping an adapter and producing source-bound evidence; it does
not require founder outreach, a founder-owned account, or a new central
seller-specific code path.

This is also the durable distinction from a superagent. A superagent may find
and execute a route extremely well. Outsider keeps the agent replaceable while
maintaining the cross-agent Outcome contract, occurrence denominator, recovery
portfolio, independent acceptance evidence, and eventually the funded
responsibility that survives any one agent or provider.

## External effects are resumable lifecycle steps, not script retries

A temporary supply network cannot treat a multi-party transaction as one
opaque agent run. Each source-native effect is its own durable transition:

```text
OBSERVE_FORM -> CONTACT_SUBMITTED -> ADDRESS_SUBMITTED
             -> QUOTE_OBSERVED -> CAPACITY_RESERVED -> ORDER_SUBMITTED
```

Before an effect, the Edge Node records the exact Attempt, expected source
head, idempotency commitment, authority and expiry. After the effect it records
the source occurrence or, when the response is lost, `EFFECT_UNKNOWN`. A later
continuation first reads the seller/resource lifecycle and resumes after the
latest externally proven transition. It never restarts the whole checkout,
message, booking, reservation, or physical action merely because a response
read or receipt upload failed.

This rule separates machine-speed execution from browser automation. The
normal path is a bounded protocol between computers; a redirect, timeout, or
process restart changes only which source head must be reconciled. Completed
effects are not repeated, and unproven effects remain quarantined until a
read-only source observation resolves them. The central coordinator stores
only keyed commitments and content references; private cookies, contact and
destination values, native request bodies, and raw responses remain at the
authorized Edge Node.

Resumption is intentionally asymmetric. Read-only observations may recover a
missing receipt. Another mutating call requires proof that the earlier effect
did not occur plus a fresh purpose-bound grant. Contact, address, capacity,
payment, order and compensating actions therefore have separate one-use
grants. Broad agent permission cannot collapse them into one retryable script.

The same lifecycle rule applies beyond commerce: room booking, access grants,
technician dispatch, robot work, permits and institutional approvals all have
source-owned intermediate heads. A simple first Episode is useful only if it
exercises this general structure.

Owner capacity is a distinct transition. A quote, inventory flag, anonymous
cart, application server acknowledgement or adapter label remains
`UNRESERVED`. `CAPACITY_RESERVED` requires a current owner-signed hold bound to
the exact route, quantity, service window and typed Episode/Attempt, including
expiry plus release/revocation semantics and a complete lifecycle denominator.
That admitted fact may enter L2 recovery planning; it still cannot mint
delegation, independent Outcome truth, payment authority, an order, or
`COMMIT`.

## Broker completion is not source completion

`COMPLETE` in the durable user-held broker means only that an order-scoped
executor receipt was stored exactly once. The receipt's embedded result remains
authoritative about transport status: `sourceOccurrenceHashes=[]` plus
`READ_ONLY_ROUTE_OBSERVATION_LOCAL_EVIDENCE_INCOMPLETE` is an incomplete seller
observation even though the broker lifecycle itself is complete. Formation may
count the Attempt, but it must not count a route occurrence, select the route,
or advance any price, ETA, capacity, truth, or commitment gate.

This separation lets the coordinator recover without lying. An effectful
Attempt is frozen and reconciled; a later safe read may use a new typed Attempt.
Only a receipt containing a locally replayable, source-bound occurrence can
enter the seller-neutral evidence seam. Transport success, provider response,
capacity reservation, independent acceptance, and Outcome completion are five
different facts.

## The first real seller-neutral occurrence through the generic Edge rail

The generic seller-neutral rail has now transported one real seller
observation end to end.
A new typed Attempt was published to the durable Formation broker, claimed by
the authorized user-held node, executed as one native HTTPS GET, sealed raw
first on that node, and completed centrally with a hash-only receipt. Central
readback records one source occurrence while retaining no provider URL,
destination, raw response or unkeyed local hash. There was no browser or mouse
path and no cart, contact, address, payment or order effect.

This proves the horizontal execution seam, not the user's Outcome. Its correct
state is `HOLD / READ_ONLY_ROUTE_OBSERVATION_RECORDED`: the seller source was
observed, but no owner capacity was reserved, no recovery path was held, no
independent acceptance fact exists and no authority was minted. The next
architectural advance is therefore not a more capable central agent. It is to
carry separately granted source lifecycle transitions—destination quote,
owner reservation, single-write order, recovery exercise and independent
acceptance—over the same seller-neutral rail while keeping every external
effect locally replayable and every resource owner sovereign.
