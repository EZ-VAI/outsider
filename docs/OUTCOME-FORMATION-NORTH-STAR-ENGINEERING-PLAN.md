# Outcome Formation North Star engineering plan

> **继续工程先读：** [当前工程入口](OUTSIDER-CURRENT-ENGINEERING.md)。它汇总活跃
> 产品链、下一增量和最新事实；不需要每次重读本文全部历史 checkpoint。

> **当前执行入口 · 2026-09-05：** 先执行
> [工程改良前序](OUTCOME-ENGINEERING-IMPROVEMENTS-20260905.md)，随后继续本文
> 0–8 主线。前序将供给动作、恢复成本和可维护实现接入现有工程，不以销售
> 试验作为启动条件；也不重写历史订单、授权或已封存运行。前序对当前研发
> 方式的解释优先于下方旧 checkpoint；各历史事实保留原样。
>
> **本轮完成：** 路线下一动作与恢复成本已进入现有 decision/continuation；
> 当前数字履约入口直接使用可维护的 Cloudflare adapter。Adafruit v10 已
> 通过两次只读 GET 取得 step4，并从保存的响应追加得到 USD 13.95 完整
> 含税总价；下一步为结构化 ETA 及主/备容量。74 项聚焦测试通过。

Status: normative, operational engineering plan for the Outcome Formation
Engine. Current repository baseline: `1.3.98` on 2026-09-03. This document
does not grant authority, establish capacity, authorize action, create a price
or guarantee, move money, or prove a real-world outcome.

## Executive summary

Outsider is not a provider marketplace, an agent with a larger tool belt, or a
technology-enabled services company. Its product is an outcome order. For each
order, Outsider must form a temporary network from resources that are already
available in the world, obtain explicit one-use acceptances, reserve a primary
path, a recovery path, and independent evidence, and make a result commitment
only after every required fact is externally established. The network then
dissolves when the order closes, while the Episode, every Attempt, evidence,
challenges, recovery, and unresolved responsibility remain durable.

The hard operating constraint is **zero Outsider staff touches per order**.
People may perform purchased work as external resources, but Outsider staff may
not manually discover, contact, coordinate, verify, or recover an order. An
unsupported or incomplete order is declined at its formation deadline; it is
never routed to an operations queue. Early automatic commitment coverage may
therefore be low. That is an honest product boundary, not a reason to hide
manual services behind the interface.

Work proceeds in the network-first order `0 → 8`. Every gate has two distinct
completion definitions: code-complete (`C_i`) and real-world-complete (`R_i`).
Tests can satisfy only `C_i`. The corresponding live capability may be enabled
only when `C_i ∧ R_i` is true and the established authority covers that exact
capability. PRICE, GUARANTEE, and SETTLE remain last.

## Frozen product and network invariants

This section is normative. The v1 invariant contract in
`src/outsider-outcome-formation-temporary-network-north-star-v1.js` is the
frozen minimum. The current coordinator adds stricter fail-safe operational
premises without weakening that minimum. A normative frozen change requires a
versioned descendant and explicit supersession link; it must never be
introduced by silently editing this plan, a frozen artifact, or append-only
history.

### One tender, one temporary external-resource network

- The network class is `PER_ORDER_EPHEMERAL_EXTERNAL_RESOURCE_NETWORK`.
- The formation unit is `ONE_TENDER_ONE_NETWORK`.
- Scope is bound to the tender, owner mandate, provider one-use acceptances,
  Episode, and Attempts.
- One or more resources may be composed, but only as required by that tender.
- Resources are externally available and externally controlled. Outsider owns
  no provider inventory and requires no exclusive provider pool.
- Registration is not required for a one-use tender. A resource owner retains
  control before, during, and after the order.
- The temporary network cannot be reused across tenders and does not persist
  after order closure.
- Dissolution never erases Episode or Attempt history, evidence, challenges,
  recovery, responsibility, or open obligations.

### Frozen typed graph

All identity, delegation, execution, evidence, and responsibility bind to this
typed graph:

```text
PrincipalEpoch
  → AccountableDeployment
  → Runtime / Embodiment
  → Delegation
  → Episode
  → Attempt
```

IP addresses, devices, base models, and global scores are not network-person
identity. No row count, model identity, transport key, or content hash may be
promoted into a graph role.

### Explicit one-use consent and separate standing

- The default engagement is explicit one-use consent.
- An explicit resource-owner mandate and an explicit provider acceptance are
  both required. Silence is never consent.
- Every acceptance requires a one-use nonce and exact tender binding.
- Completion does not create standing capacity and auto-enrollment is
  forbidden.
- A post-fulfillment invitation may be automated, but the invitation itself
  creates nothing.
- Standing requires a separate explicit opt-in. It is revocable, expiring, and
  bound to scope, region, time, capacity, responsibility, and commercial terms.
- Standing participation never transfers ownership or control to Outsider.

### Zero internal operations

- `outsiderStaffTouchesAllowed = 0` for every order.
- Manual discovery, contact, coordination, verification, and recovery by
  Outsider staff are forbidden.
- A human operations or customer-service fallback queue is forbidden.
- Any Outsider staff touch is a formation failure and must be recorded against
  the tender.
- The unsupported or unformed disposition is
  `DECLINE_NOT_HUMAN_QUEUE`.
- A technician, courier, professor, facility operator, or other external human
  performing or accepting purchased work is a resource, not Outsider staff.

### Atomic commitment and authority boundary

Outsider may show an outcome commitment only when all mandatory gates for that
exact tender are simultaneously current:

```text
ATOMIC_COMMIT =
  resource-owner authority
  ∧ every mandatory primary-execution capacity reservation
  ∧ every mandatory recovery-capacity reservation
  ∧ every mandatory independent-witness capacity reservation
  ∧ witness independence
  ∧ a bounded maximum loss and consequence envelope
  ∧ sufficient funding or capital for every promised financial remedy
  ∧ a lawful transaction path
  ∧ a lawful payment path
  ∧ trusted time
  ∧ externally established occurrence non-omission
  ∧ externally established non-equivocation
  ∧ externally complete proof of zero Outsider staff touches
```

There is no partial promise and no manual override. Before the formation
deadline the engine may continue automated formation. At the deadline it must
decline if the conjunction is not satisfied.

Structural conformance establishes only structural compatibility. It never
mints legal identity, owner authority, provider capacity, action permission,
outcome truth, money movement, or obligation closure. Vendor-native safety and
logs are inputs and veto sources, not facts Outsider may replace. A vendor
claim, server acknowledgement, model reward, pseudo-label, delivery receipt,
or transport signature is never authority or independent outcome truth.

The permanent safety relations are:

```text
C_enabled ⊆ A_proven
Reach(C_enabled) ⊆ E_committed
Reach(C_enabled) ⊆ R_committed
```

`C_enabled`, `A_proven`, `E_committed`, and `R_committed` are typed sets and
graphs, not scalar scores. Consequence reach must remain inside committed
evidence and durable responsibility.

### Domain-agnostic formation core

The core uses controlled outcome-kind and resource-class codes. Domain meaning
belongs in typed contracts and source-specific adapters. Domain-specific
branches and human workflows in the formation core are forbidden.

**User-held email is only the first horizontal transaction substrate.** It is
not a meeting scheduler, a professor-contact product, or a meeting-domain
choice. Where an official API is absent, a future separately admitted,
source-specific email driver may deliver one-use tenders and receive replies
for many outcome families, such as appointments, local services, equipment
procurement, and property coordination. The current artifact only replays
caller-retained exact RFC822 and related source bytes; it has no mailbox login,
secret broker, sender, poller, DNS lookup, or network I/O. A future user must
own the account and exact authority used by that driver. Credentials and
individual recipient, message, thread, source-system, key, and source handles
must remain outside network projections; the current public projection exposes
only typed facts and a nonce-salted aggregate private-source commitment.
Server delivery, read receipts, and strict replies remain transport or source
declarations. Even a grammar-valid reply only corroborates a supplied,
source-declared response; it is not capacity, owner authority, or outcome
truth.

## Two completion definitions

For each gate `i`:

- `C_i` means **code-complete**: required structures, state machines,
  source replay, failure boundaries, privacy behavior, and adversarial tests
  exist and pass. Synthetic fixtures and injected transports may satisfy this
  definition.
- `R_i` means **real-world-complete**: the required external parties, rights,
  authority, current capacity, transaction surfaces, independent observations,
  recovery, and durable heads actually exist and are acquired and replayed
  from their sources.

The enablement rule is:

```text
ENABLE_i only if C_i ∧ R_i ∧ requested_capability ⊆ A_proven
```

Code tests must never set an external-fact Boolean to true. A locally generated
signature proves control of a configured key, not the signer's legal identity
or standing. Public data, simulations, and vendor documentation can establish
adapter behavior or research evidence, but not adoption, current reservation,
authority, outcome truth, or closure.

Engineering may continue on later HOLD-only structures while an earlier `R_i`
is missing. Live enablement may not skip the missing gate or borrow reality
facts from another domain, owner, resource, time window, or order.

## Target order state machine

```text
USER_GOAL
  → NORMALIZED_TENDER_HOLD
  → CONTINUE_AUTOMATED_FORMATION_HOLD
  → ONE_USE_TENDERED
  → OFFERS_REPLAYED
  → PRIMARY + RECOVERY + WITNESS RESERVED
  → AUTHORITY_ADMITTED
  → ATOMIC_COMMIT or DECLINE_NOT_HUMAN_QUEUE
  → EXECUTION_ATTEMPTS
  → OUTCOME / RECOVERY WITNESS
  → OBLIGATION_CLOSURE
  → TEMPORARY_NETWORK_DISSOLVED
      (Episode, Attempts, evidence, and obligations persist)
  → OPTIONAL_SEPARATE_STANDING_INVITATION
```

Every transition is append-only, source-bound, deadline-aware, idempotent, and
replayable. A late reply cannot resurrect an expired tender. Revocation can
only shrink available authority or capacity. Object deduplication never removes
an occurrence from the census.

## Current position

The repository has extensive HOLD-only foundations. It does not yet have a
real external resource network or a live outcome commitment path.

| Area | Code present now | Missing external or integration fact |
| --- | --- | --- |
| Typed graph and tender | Strict HOLD compiler, actor/delegation envelopes, responsibility graph, and temporary-network invariant contract | Externally proven legal identity, owner mandate, and usable authority for an exact tender |
| Node SDK and quarantine | SDK, conformance, client, intake lanes, lifecycle structures, and source review | Adopted external anchor-node operators and their independently controlled keys/endpoints |
| Route discovery | Deterministic route snapshot/lifecycle replay, transaction-surface contract, and privacy-closed collector source replay | Separately admitted, source-specific discovery, quote, and eligibility I/O from permitted transaction surfaces |
| Shadow and controlled transport | Module-private mailbox shadow, signed expiring one-use endpoint consent, a local durable one-use effect ledger, a fixed `127.0.0.1` outbox, one no-retry external public-sandbox pilot, and one authenticated Cloudflare KV create/write/read/delete lifecycle | A task-specific permitted seller surface, trusted time, independently controlled endpoint authority, and any real tender delivery or supplier acceptance |
| Shadow formation run | Exact three-slot coordinator/control replay, pre-effect bijection and one-use checks, plus explicit partial shadow-effect accounting | Atomic external effects, durable restart/control, trusted endpoint authority, and any real provider delivery or reservation |
| One-use response | Response, occurrence census, source replay, nonce, and lifecycle structures | A real supplier-response network whose acceptances bind the exact tender and current owner |
| External reservation | Exact offer-bound owner-signed reservation request/receipt/lifecycle plus fsync/CAS one-use producer | Independently established owner identity, authority, and current physical/service capacity; signed source declarations alone remain untrusted |
| Owner standing | Owner identity, registry, adoption-review, and lifecycle replay | An independent owner trust root and actual external owner adoption |
| Temporary network | Route, response, receipt, lifecycle, permissioned-transaction, owner-standing, formation-control, and exact multi-slot coordination source replay | Every live external fact remains absent; atomic success is fixed false |
| Action | HOLD-only admission and owner write-gate conformance | Production authority, exclusive write path, bypass exclusion, and real revocation freshness |
| Outcome and recovery | Witness, Attempt-set, obligation, challenge, complete-episode structures, and exact witness-owned reservation/result/revocation replay attached to formation HOLD | Independent witness ownership/control, independent outcome truth, real recovery, complete Attempt denominator, and accepted closure |
| External heads | Local/offline Rekor and external-anchor structures; one frozen public Rekor v1 submit occurrence is `COMMIT_UNKNOWN`; the production TUF-selected Rekor v2 route is now externally observed | No verified inclusion for the attempted commitment, no safely searchable exact v1 proposal, and no independently monitored non-equivocating head |
| Economics | Quote-frontier and actuarial shadow structures | Complete longitudinal episodes, pricing authority, capital, custody, policy, claims, and adjudication |

The active sub-seam remains inside Gate 4; neither `C_4` nor `R_4` is met. The
pure multi-slot coordinator, transaction-surface contract, privacy-closed
route-collector replay, first module-private shadow mailbox driver, and exact
three-branch shadow formation runner now exist. The runner binds one distinct
`RESOURCE`, `RECOVERY`, and `EVIDENCE` shadow branch to the exact coordinator
and control-ledger sources before any module-private append. It never turns
those shadow effects into an external commitment, and a later append failure
is preserved as partial shadow history rather than rewritten as atomic success.
The separately admitted controlled-endpoint seam now performs one bounded
process-external HTTP effect against a fixed consenting `127.0.0.1`
`TEST_OR_RESEARCH` endpoint. Its signed one-use consent and durable local effect
ledger ensure that a submit is recorded as attempted before the POST and that a
dropped response is recovered after restart by status-only reconciliation,
never by a second POST. This is not a real provider contact, acceptance,
reservation, or external resource network. The next product seam is the first
user-controlled, permitted transaction-surface adapter. It must reuse this
outbox without creating a provider registry and still requires separately
replayed permission, credential lease, rights/privacy decision, nonce, trusted
time, action admission, and endpoint consent. The collector itself never
invokes an injected callback or performs network I/O. A real driver may later
discover through an allowed surface only after its exact enabled capability is
proven to be a subset of current authority; it must preserve every observation
and attempted side effect and feed exact raw sources into the existing replay
path. The caller must never be required or allowed to supply a naked trust
Boolean. External owner trust remains false until its exact source graph is
independently established.

The first bounded public-internet effect has also now occurred. A one-shot
`TEST_OR_RESEARCH` pilot sent a synthetic, non-PII object to the independently
operated Restful Booker public API, received an externally assigned object ID,
and read the same state back through that API. The durable ledger recorded the
submit attempt before the network call; the run performed one POST, no
automatic retry, and one exact-ID GET. This proves that the current path can
cross an actual internet boundary and reconcile third-party mutable sandbox
state. It does **not** prove that a supplier was contacted, that a resource
owner consented to a real task, or that any offer, capacity, authority, price,
promise, guarantee, or settlement exists. The sandbox is a transition test,
not a substitute for the next user-held transaction-surface adapter.

The first authenticated real-provider resource lifecycle has now also
completed through a user-held Cloudflare account. Outsider created one isolated
Workers KV namespace, wrote one synthetic value with a 600-second TTL, read it
back byte-for-byte, deleted the namespace, and verified its exact name was
absent. This is a real provider-native control-plane operation and a real
external resource lifecycle, not another loopback or public echo. It proves an
account-scoped provider interface can be exercised without a founder-supplied
provider contact. It is still not a task-specific one-use tender, provider
acceptance, capacity reservation, or outcome commitment.

### Implementation checkpoint — 2026-09-03

The current declared Gate 0 code/replay test surface is green again without
changing frozen evidence bytes; this does not establish `R_0`. Oversized
official-frozen AIID, RMA, and CAS evidence projections use a narrowly scoped,
bounded legacy serializer; the ordinary canonical member limit was not widened.
The current Stage 0 manifest remains the same append-only `final-v4` artifact.
The filesystem snapshot verifier also distinguishes real source-root mutation
from unrelated sibling churn above that root while retaining root, descendant,
symlink, and namespace-ABA checks.

The Gate 4 code seam now includes a bounded controlled-endpoint effect, but it
is not a real external resource network and it cannot issue an outcome promise:

- `outsider-permissioned-transaction-interface-source-replay-v1.js` replays a
  permission-scoped, one-use, strict challenge/reply mailbox transcript without
  performing mail or network I/O. Delivery acknowledgements, DKIM/ARC/SPF,
  autoreplies, quoted text, natural language, vendor claims, and model outputs
  remain non-authoritative.
- `outsider-outcome-formation-temporary-network-v2.js` replays the complete v1
  temporary-network source, one transaction-interface source, and the exact
  resource-owner standing source. It cross-binds the tender, full typed graph,
  Episode, Attempt, requirement, route, candidate, provider, response, and
  occurrence denominators. It currently represents one normalized transaction
  slot; multi-slot mandatory-route coverage belongs to the coordinator.
- `outsider-formation-control-ledger-v1.js` replays the per-tender deadline,
  nonce reservation/consumption, idempotency, cancellation, revocation, and
  Outsider-staff-touch occurrence stream from an exact caller-pinned source.
  Cancellation, revocation, deadline expiry, or any recorded staff touch
  cannot be overridden into commitment. It is not yet a durable service: the
  global nonce denominator, trusted clock, external non-omission,
  non-equivocation, and proof that no staff event was omitted remain false.
- `outsider-outcome-formation-temporary-network-coordinator-v1.js` requires an
  exact bijection between every mandatory `RESOURCE`, `EVIDENCE`, and
  `RECOVERY` requirement and one source-replayed v2 transaction slot, with a
  shared tender, typed graph, Episode, Attempt, and exact control-ledger head.
  Missing or duplicated slots, source splices, terminal control events, and
  deadline expiry cannot be converted into a partial promise or human queue.
- `outsider-transaction-surface-adapter-contract-v1.js` freezes the structural
  boundary for source-specific discovery, quote, tender, response,
  reservation, cancellation, and revocation adapters. It requires exact
  implementation/package pins, allowlisted transport profiles, one-use
  controls, finite side-effect cardinality, and permission/credential/rights/
  privacy input contracts; conformance itself enables none of those facts.
- `outsider-route-discovery-collector-v1.js` rebuilds caller-retained discovery
  transcripts into the existing deterministic route snapshot while preserving
  occurrence census separately from object deduplication. Its runner does not
  inspect or invoke an injected capability, and all apparent successes remain
  explicitly source-declared. The public projection contains no raw source,
  permission, credential, rights/privacy, route-system, observation, or
  unsalted provenance handle; actual callback, network, trust, capacity, and
  action facts remain false. This non-invocation is not proof of zero internal
  operations, and accepted apparent successes remain externally untrusted
  source declarations.
- `outsider-user-held-mailbox-shadow-driver-v1.js` adds the first actual but
  non-external effect boundary. A module-issued bearer can append one exact,
  already replay-valid mailbox lifecycle to a module-private in-memory spool.
  It imports no filesystem, network, DNS, browser, OS-mail, callback, path, or
  ambient-credential surface. Its sole enabled and proven capability is
  `SHADOW_SPOOL_APPEND`; consequence reach is that private spool. One-use and
  idempotency are only module-instance-local, not process-wide or durable.
  Staff occurrence completeness is absent, so staff count is `null` and zero
  internal operations remains unestablished. Public output contains one salted
  aggregate private binding and no stable route, candidate, adapter-source,
  mailbox, message, permission, or replay handle.
- `outsider-outcome-formation-shadow-runner-v1.js` composes exactly one
  `RESOURCE`, one `RECOVERY`, and one `EVIDENCE` branch from raw coordinator,
  control-ledger, adapter-contract, permissioned-transaction, and shadow-driver
  inputs. Before the first append it rejects duplicate requirements, raw slots,
  adapter instances/source pins, one-use permission identities/genesis pins,
  nonces, idempotency keys, or capabilities. It also requires the coordinator
  aggregate and every exact slot to remain source-declared current at the
  coordinator observation time; a known route or owner revocation blocks the
  run before any bearer is probed. Source-declared currentness still establishes
  no real owner authority, capacity, or action permission. It separately reports bearers
  validated before effects, historical append occurrences, and bearers that
  remain enabled afterward. The three module-private appends are deliberately
  not described as an atomic transaction: a later rejection leaves earlier
  append occurrences visible in an explicit partial-HOLD result. Its public
  projection retains only typed summaries, complete aggregate occurrence/byte
  counts, and one nonce-salted private bundle commitment.
- `outsider-controlled-endpoint-consent-grant-v1.js` verifies an exact signed,
  expiring one-use grant bound to the tender, typed graph, Episode, Attempt,
  slot, frozen lane profile, provider, body commitment, nonce, and idempotency
  key. The outbox separately requires a signed construction-time binding for
  the exact loopback port, adapter instance, provider, and controller key, then
  cross-binds the grant to it before any effect. The controller key remains a
  test-lane pin; neither statement establishes resource-owner authority or
  provider capacity.
- `outsider-durable-one-use-endpoint-effect-ledger-v1.js` adds an append-only
  local effect lifecycle from admitted intent through submit reservation,
  durable submit attempt, and observed endpoint receipt. It preserves nonce
  and idempotency uniqueness across restart and forbids a second submit after
  `SUBMIT_ATTEMPTED`. It is not an external non-equivocating head and does not
  establish trusted time or complete external occurrence truth.
- `outsider-controlled-consenting-endpoint-outbox-v1.js` admits only a
  construction-time signed endpoint/adapter/provider/key binding and a
  module-issued lane capability. It can POST only to the fixed loopback tender
  path, then query only the fixed status path. Per-order URLs, paths, methods,
  callbacks, browser sessions, ambient credentials, and provider registries are
  absent. Its signed receipt means only
  `RECEIVED_FOR_COUNTERPARTY_REVIEW`; it is not acceptance, capacity, authority,
  reservation, commitment, or economic truth.
- `scripts/run-outsider-external-resource-sandbox-pilot.mjs` exercises the
  next narrow boundary against one fixed public test API. It accepts no caller
  endpoint, credential, callback, recipient, or real tender content; writes the
  durable attempted-submit event before the request; performs exactly one
  create request with no automatic retry; validates one exact-ID read-back;
  and records all raw request/response evidence privately. Its successful
  result is only `PUBLIC_TEST_SANDBOX_EXTERNAL_EFFECT` and remains `HOLD`.
- The next code artifact is the first user-controlled, permitted
  transaction-surface adapter reusing this one-use outbox. Later real drivers
  must produce existing route and transport source records without embedding
  arbitrary URLs, ambient credentials, a generic browser, a provider registry,
  or an Outsider operations fallback.

The frozen runner checkpoint is 68,410 bytes with SHA-256
`b0b0b17e8707539d901f4d8ecedda3387b9204342587dd4f504240e9c146d962`;
its focused test is 33,046 bytes with SHA-256
`4c1f5fa73b96072296ceaa065ff879111addd17ec20cb317b6718aeee7bdc79b`.
The exact focused suite passes 12/12, the control/coordinator/driver adjacency
passes 51/51, and the full current formation chain passes 213/213. These are
code-path and shadow-effect facts only, not external-network certification.

The controlled-endpoint consent source is 27,095 bytes with SHA-256
`e96b775b86bed963434b398eaa64ec165ed76fcdd5cac50c4d2b2e2b2990be9a`;
its 11,694-byte focused test has SHA-256
`f59306bb911c0035c819599e18ade3f4322324b2c2763f72842fdc214940312b`
and passes 7/7. The durable one-use effect-ledger source is 41,366 bytes with
SHA-256
`daf88c0d6898a77d844632f99950a51792f5c602fcf8f0ef13bb330946f8b27e`;
its 14,087-byte focused test has SHA-256
`e5d3b8e67aac2824ba909f75b5871cb41e22f899265f90a97fd235701de862f0`
and passes 7/7. The controlled outbox source is 25,226 bytes with SHA-256
`ad9ac29a68a0fa6f3c2d801cc8eebc38a862c0f15b0b7c8a2f54ec1c5610ebbf`;
its 16,703-byte focused test has SHA-256
`fc597977043110f8301eb14b91846fbccf35b9bbf59b13b220bd90b0a59009dd`
and passes 4/4. The crash-reconciliation acceptance test observes exactly one
POST, one accepted endpoint object, and one status read: after the endpoint
commits and drops the response, a new outbox instance reconciles by status only,
including after consent expiry, and never resubmits. Revocation before submit
causes zero network effects. These are controlled loopback code facts only;
real provider, owner-authority, capacity, promise, and economic facts remain
false.

The external public-sandbox pilot ran once at
`2026-09-03T12:32:46.535Z`–`2026-09-03T12:32:47.165Z`. The third-party API
assigned synthetic object ID `1009`; the POST returned `200`, the exact-ID GET
returned `200`, and the returned synthetic body matched. Counts were exactly
one POST attempt, zero automatic POST retries, one read-back, and four durable
ledger occurrences. The 15,878-byte runner has SHA-256
`2385af4c3766d8ac06076d8b812bfd6e67ba74947a5667caa9f4fa9049a6915f`.
Its manifest semantic hash is
`sha256:dc616f46f62db173b6fec713ecfdbc95fc6f0cfd1e570b88727e9fa06bfe41a2`;
the 2,667-byte manifest file SHA-256 is
`bff5651664b3ef3719b2a840fa71d32137745902313e350ded07e956a0f5d2b1`.
The 207-byte request, 236-byte POST response, and 207-byte GET response are
mode `0600`, with SHA-256 values
`53804253e2cd2ecd8a07f28f8cb64a213c8ec64c0bd61417b96229b833dead07`,
`fea9dcfdb9e683d0a83b2f8743702216fc28f7862617c1a7f8ffb44af929bae4`,
and `3aa405e4e1b6c093428120b7398ee1266c8a62b7015d0a9e4559638b20554244`.
The fixed run directory refuses re-execution before network access, so this
evidence cannot silently become a second POST. `realCounterpartyContacted`,
`realSupplierResourceEstablished`, `providerAcceptance`, `capacityReserved`,
and `userOutcomePromiseIssued` all remain false.

The authenticated Cloudflare Workers KV pilot reconciled its unique namespace
at `2026-09-03T13:57:08.203Z`, acknowledged one write at
`2026-09-03T13:57:26.412Z`, read the exact 127-byte synthetic value once at
`2026-09-03T13:57:40.478Z`, acknowledged one namespace deletion at
`2026-09-03T13:58:24.304Z`, and verified remote absence at
`2026-09-03T13:58:37.866Z`. Counts were one create attempt, zero create retries,
one exact-name reconciliation, one PUT, one GET, one DELETE, and one cleanup
check. The opaque namespace ID was not projected; its SHA-256 commitment is
`be18fb5ad2b9e3d7e0b9054b5537cff829aab2aa7db063fe0122b596ad90e2d6`.
The exact value SHA-256 is
`fd7cdc1de368246ea5d05620f2f4773c602adb25dc792809b306aef99f0a4a31`.
The manifest explicitly records that raw CLI receipt bytes were not retained
and therefore cannot support independent receipt replay. It proves only
`realExternalProviderResourceLifecycleExercised=true`; task-supplier,
tender-acceptance, capacity, promise, economics, trusted-time, and zero-ops
facts remain false. The manifest is 2,908 bytes, mode `0600`, with SHA-256
`9bad04799a8c8451e51bfebc2fe2e94d4723ed28f8ce6f9375b51666ed1be2de`.

These artifacts preserve source-replay and conformance boundaries; the
controlled outbox adds only its exact loopback delivery/status capability. A
pre-deadline `CONTINUE_AUTOMATED_FORMATION_HOLD` is a deterministic disposition,
not evidence that a scheduler is running; at or after the caller-declared
deadline they deterministically yield `DECLINE_NOT_HUMAN_QUEUE`. They have no
real transaction-surface credential broker or live provider driver,
independently trusted owner root, external non-equivocating head, proven
capacity, action authority, price, guarantee, custody, settlement path, trusted
time, independent non-omission, maximum-loss proof, funding/capital proof,
lawful transaction/payment proof, or complete zero-staff denominator. All money
movement, `PRICE`, `GUARANTEE`, and `SETTLE` facts remain false. Supplier
commercial terms, when replayed, remain supplier or source declarations and
never become an Outsider price.

## Production checkpoint — 2026-09-04

This checkpoint does not change the North Star. Outsider still forms one
temporary external-resource network for one order from independently available
interfaces; it does not turn search results into a provider registry, does not
equate delivery with capacity, and does not route incomplete formation to
Outsider staff. A discovery candidate is only a transient route hypothesis.
Only externally replayed acceptance, reservation, execution, witness, and
lifecycle facts may advance their corresponding gates.

The first corrected-telemetry, single-process, zero-internal-touch production
episode is `first_committed_reality_20260904_008`, with program ID
`reality_c9445053ba752ec0eff27878ef1c262d41c90c81` and program hash
`sha256:52afdced7293a5b4fc402db954f438211b09d21c58856366d567058d087df33c`.
Its append-only journal contains 42 events and replays to `SUCCEEDED` with
`committed=true`, `zeroInternalOpsObserved=true`,
`humanQueueCreated=false`, and `userOutcomePromiseIssued=true`. The primary
publication attempt failed; the recovery publication succeeded 475 ms later;
the immediate, longitudinal, and closure witness decisions were all
`SATISFIED`. Acceptance to atomic commitment took 4.894 seconds. Acceptance to
final success took 14 minutes 48.460 seconds, including the deliberately
observed service window. Closure took 4.661 seconds.

The 64,639-byte mode-`0600` journal has file SHA-256
`e2d7cadfb6ec8fc5a52f72468c1301db109475e73801caba6a4197786b839225`
and append-only head
`sha256:23bcbad5aea70a7505fced5cb55f06ef46e540376d734428dad651ea30165fa5`.
The independent Globalping witness retained two 2,195-byte journals, four
frames each, with file SHA-256 values
`0ec173f68dd89634eab82fc003359281dd470e8edfc58403e9a5b13800902a8d`
and
`7bf8801912e04525621acd10c055ebed55af8f6501ef3eb6935f8838674d3eaa`.
The durable UptimeRobot witness ledger contains 16 occurrences: eight for the
primary path and eight for the recovery path.

Post-closure read-only checks observed the Cloudflare Worker route, GitHub
recovery branch and raw branch URL, and both UptimeRobot monitor IDs as absent.
The GitHub v1 commit object remains publicly readable, however, at commit
`6298a743bf6cf0fd9fe8006895e5a9a6d3ecad56`: its exact 141 bytes have SHA-256
`2bd80fa925fdc00a0b767b7c9a154f5e389b4a3c5ea1633e004e1e303e539ba9`.
Accordingly, `remove_recovery_artifact=CLOSED` means that the active recovery
route and ref were removed; it does **not** claim irreversible erasure of every
external byte. The versioned GitHub Release Asset v2 recovery path exists to
replace this lifecycle without rewriting the v1 episode or its history.

A separate live, read-only Brave occurrence exercised the public-index route
for request `global_supplier_route_probe_20260904_002`. It made exactly one
Brave request, selected one transient candidate, and made one seller-owned
`/.well-known/outsider` GET. The seller did not expose a compatible descriptor,
so the result was `SELLER_INTERFACE_NOT_DESCRIBED / HOLD`: zero tender POSTs,
zero payments, zero acceptances, and zero capacity reservations. The 2,450-byte
mode-`0600` transcript has one occurrence and file SHA-256
`c95fa0d7a1b5e930061843a123640230f0825e76cf09eceb0a0aa6fe3532c058`.
This proves real public-index and seller-origin I/O, not a supplier network.

The immediate production frontier is therefore narrow and concrete:

1. after a seller lacks an Outsider descriptor, inspect the seller's own public
   HTML form, `mailto`, and schema.org `EntryPoint` surfaces without persisting
   raw targets in a public projection;
2. turn an exact owner-authorized observed surface into one bounded one-use
   tender delivery and replay the real counterparty response lifecycle;
3. feed independently replayed acceptance and current reservation into the
   same primary/recovery/witness coordinator used by episode `_008`;
4. run the next versioned episode with a recovery carrier whose active bytes
   can be deleted, while retaining truthful immutable evidence of what
   occurred.

Until steps 2 and 3 happen for an exact order, generic seller-network `R_4`
remains incomplete even though the first digital production path has been
certified. Payment remains disabled and must not be inferred from discovery,
supplier terms, or a transport acknowledgement.

## Gate map

| Gate | Milestone | Code state at entry | Live state at entry |
| --- | --- | --- | --- |
| 0 | Source replay and version lineage | Substantial foundations | Incomplete external head/provenance |
| 1 | Goal to decidable tender | HOLD compiler exists | No real owner mandate |
| 2 | Anchor Node SDK and reporting | Research preview exists | No adopted anchor nodes |
| 3 | Quarantine and external heads | Local replay exists | No live independent durable head |
| 4 | Zero-human one-use network formation | Pure replay slices exist | No real automated resource formation |
| 5 | Authorized execution and first complete reality episode | HOLD gates exist | No certified end-to-end path |
| 6 | Order-produced network growth | Standing primitives exist | No verified standing-capacity network |
| 7 | Research-only acquisition ranking | Data-engine pilots exist | No authority consequence by design |
| 8 | PRICE, GUARANTEE, SETTLE | Shadow/frontier structures only | Explicitly deferred |

## Gate 0 — Source replay, provenance, and version lineage

### Objective

No new capability may build on broken provenance. Every material input must be
traceable from an exact source and revision pin through rights/privacy review,
canonical record, verification, lifecycle, and any public projection.

### Existing modules and artifacts

- `src/canonical.js`
- `src/outsider-network-quarantine-source-review.js`
- `src/outsider-release-certification.js`
- `src/outsider-public-release-metadata.js`
- `scripts/local-artifact-canonical-index.mjs`
- existing frozen artifacts, release descendants, and supersession records

### Engineering deliverables

- A complete `source → pin → record → verification → projection` dependency
  graph for every artifact used by Gates 1–8.
- An automated pre-build provenance audit that blocks on missing pins, broken
  ancestry, altered bytes, unresolved supersession, or rights/privacy gaps.
- No-clobber descendant creation and explicit supersession for any change to a
  frozen schema, policy, source record, or release artifact.
- Private raw acquisition with mode `0600`, bounded byte counts, and no raw
  bytes, source URLs, credentials, contact data, or identity preimages in
  network projections.
- Durable recording of exact source, revision, acquired byte count, capture
  time source, rights/privacy disposition, admission decision, and hash.

### User-visible behavior

The user sees a stable order history with explicit versions and correction
lineage. The product never presents a mutable snapshot as fresh, complete, or
externally anchored when it is not.

### Code exit `C_0`

- One hundred percent of declared build and replay dependencies rederive from
  their pinned inputs.
- Hash drift, in-place frozen mutation, and append-only history rewrites are
  zero.
- Mutation after validation, self-rehashing, wrong-pin substitution, proxies,
  accessors, symlink escape, path races, and partial-write crashes fail closed.
- Rights withdrawal and source revocation deterministically shrink or remove
  downstream projections without rewriting history.

### Reality exit `R_0`

- Exact external revisions, byte counts, source owners, rights/privacy reviews,
  and independently sourced time facts have been acquired for the inputs used
  in a live candidate path.
- At least one lifecycle head receipt has been acquired from an independently
  controlled external anchoring or witnessing service and replayed locally.

### Metrics

- Source-replay coverage by artifact and dependency edge.
- Count and age of unresolved provenance, rights, and lifecycle gaps.
- Frozen-artifact mutation count; target `0`.
- External-head acquisition and replay latency.

### Stop conditions

- Stop all downstream promotion on any replay break, unknown source pin,
  rights/privacy regression, or frozen-artifact mutation.
- Never alter history merely to make newer code pass.

### Dependencies

None. Every later gate depends on `C_0`; every live path depends on the relevant
portion of `R_0`.

## Gate 1 — Goal to decidable, bounded tender

### Objective

Compile one plain-language desired result into an exact, private, bounded,
source-replayable tender without manufacturing authority, truth, price, or
consent.

### Existing modules

- `src/outsider-actor-identity-envelope.js`
- `src/outsider-delegation-radius.js`
- `src/outsider-outcome-tender-v1.js`
- `src/outsider-outcome-formation-temporary-network-north-star-v1.js`
- `src/outsider-autonomous-work-order.js`
- `src/outsider-responsibility-graph.js`

### Engineering deliverables

- `outsider-outcome-intent-normalizer-v1`: map private natural language into a
  controlled outcome taxonomy and explicit unknowns.
- `outsider-outcome-decidability-plan-v1`: define measurable result criteria,
  deadline, mandatory resources, independent evidence, recovery, affected
  parties, and maximum consequence.
- `outsider-private-tender-confirmation-v1`: present only material choices and
  bind the user's explicit confirmation to the exact tender hash.
- `outsider-tender-supersession-v2`: create append-only descendants for every
  confirmed change; never mutate an accepted tender.
- A strict separation between private working material and network-safe typed
  codes, hashes, scopes, and source references.
- A model-proposal boundary: a model may suggest a classification or question,
  but cannot set authority, outcome truth, price, provider capacity, consent,
  or closure.

### User-visible behavior

The user states the result once. Within seconds, the product shows what will be
true, by when, how it will be independently verified, what may be changed, and
the maximum allowed consequence. Critical ambiguity triggers one explicit
confirmation; noncritical defaults are visible and versioned.

### Code exit `C_1`

- Mandatory tender slots are structurally complete in `100%` of sendable test
  cases.
- Public or network projections contain zero free-text goals, direct personal
  identifiers, exact addresses, contacts, credentials, payment instruments, or
  raw prompts.
- Compilation latency target: P95 at or below five seconds under the fixed
  benchmark.
- At least three unrelated outcome domains use the same core state machine with
  no domain-specific core branch.
- Unknown, inconsistent, unbounded, and incomparable scopes deterministically
  produce `HOLD`.

### Reality exit `R_1`

- The real user or resource owner controls the authorization source used for
  the candidate tender.
- The result and failure criteria are actually measurable by the named evidence
  sources within the deadline.
- Consequences are finite, lawful, reversible where required, and acceptable to
  the affected owner.

### Metrics

- Goal-to-tender compilation latency.
- Ambiguity and user-confirmation rate.
- Tender supersession rate before and after delivery.
- Structural HOLD and decline reasons by controlled code.

### Stop conditions

An undecidable result, unbounded consequence, unknown affected party, missing
owner authority, or unavailable independent verification makes the tender
unsendable. It must not be repaired by human interpretation in an operations
queue.

### Dependencies

Gate 0.

## Gate 2 — Anchor Node SDK and reporting network

### Objective

Make four high-value external roles able to emit source-bound, structurally
conformant reports without requiring Outsider to own their controls or treating
conformance as authority.

### Existing modules

- `src/outsider-network-node-sdk.js`
- `src/outsider-network-node-contract-conformance.js`
- `src/outsider-network-node-client.js`
- `src/outsider-network-intake.js`
- `src/outsider-federation.js` and related federation modules

Existing adapter kinds include `ACTOR_IDENTITY`, `COMMAND_EFFECT`,
`DELEGATION_RESPONSIBILITY`, `OBLIGATION_LIFECYCLE`, `OUTCOME_RECOVERY`, and
`PROSPECTIVE_CENSUS`.

### Priority anchor operators

1. Agent runtime or robot/embodiment platform.
2. External resource owner.
3. Independent outcome witness.
4. Independent recovery witness or affected owner.

The optimization unit is adopted anchor operators and complete role coverage,
not random row volume.

### Engineering deliverables

- Four role-specific conformance profiles, fixture kits, and source-binding
  examples.
- Implementation-closure and code-closure replay for each distributable SDK
  artifact.
- Key lifecycle, rotation, revocation, and release-attestation contracts.
- A distinct owner-standing prospective intake lane. Existing occurrence census
  must not be confused with owner standing or current capacity.
- An external pin-provenance contract that distinguishes provider-declared,
  observer-acquired, and independently witnessed facts.
- A no-registration one-use response envelope that can be transported through
  a provider's existing surface.

### User-visible behavior

A supplier or witness can accept or report through its existing API, account,
or one-time response page. The user never sees or configures an SDK. Every
status label says what the source established and what remains unproven.

### Code exit `C_2`

- Positive and adversarial fixtures pass for all four anchor profiles.
- All network references have exact, replayable source bindings.
- Signer, transport, owner, executor, and witness role collapse is detected;
  unreported collapse count target is `0`.
- Raw secrets, URLs, prompts, and direct personal identifiers in public/network
  outputs remain `0`.
- Content deduplication never reduces the occurrence census.

### Reality exit `R_2`

- External operators, not Outsider fixtures, control the relevant endpoints and
  keys and explicitly adopt the applicable reporting contract.
- Revocation and lifecycle status can be checked from a source independent of
  the report payload.
- Vendor-native logs remain inputs; they are not relabeled as independent
  adoption, authority, or outcome truth.

### Metrics

- Count of adopted anchor operators by role and outcome family.
- Conformance, source-replay, signature, and lifecycle-pass rates.
- Revocation detection and propagation latency.
- Occurrence completeness versus object-dedup counts.

### Stop conditions

- Vendor documentation, self-report, a local test key, or a high row count does
  not satisfy `R_2`.
- Structural conformance must never enable action.

### Dependencies

Gates 0–1.

## Gate 3 — Quarantine, lifecycle, exports, and external heads

### Objective

Operate a no-action, no-secret reporting network that retains every occurrence,
separates it from object identity, replays rights and revocation, and exposes
durable externally observed lifecycle heads.

### Existing modules

- `src/outsider-network-intake.js`
- `src/outsider-network-node-client.js`
- `src/outsider-network-quarantine-source-review.js`
- `src/outsider-network-lifecycle-head-checkpoint.js`
- `src/outsider-network-lifecycle-rekor-anchor.js`
- `src/outsider-external-anchor.js`
- federation store and monitor modules

### Engineering deliverables

- A quarantine registry service with separate occurrence and canonical-object
  stores.
- A source-aware rights/privacy replay worker and deterministic projection
  shrinkage after revocation, expiry, withdrawal, or purge.
- Crash-safe lifecycle, revocation, purge, outbox, and retry state machines.
- Real external-head outbox submission with receipts; local pinning must be
  labeled local.
- Multi-observer checkpoint comparison, split-view detection, and durable/WORM
  retention appropriate to the selected external service.
- Operator export and replay tooling that proves completeness, ordering, and
  source lineage without exporting private raw material.
- No live action, secrets, credential custody, or money movement in this gate.

### User-visible behavior

The order shows a factual, source-qualified timeline such as discovered,
quoted, accepted, revoked, expired, or verifying. A server ACK is displayed as
an ACK, never as success, capacity, authorization, or closure.

### Code exit `C_3`

- Every admitted report occurrence appears in the occurrence denominator,
  including duplicates that reference the same canonical object.
- Exports have zero silent omission, duplication, or reordering.
- Crash states replay deterministically or remain explicitly `UNKNOWN`; they do
  not promote themselves.
- Rights withdrawal and revocation shrink eligible projections on replay.
- Anchor submission failure, stale heads, inconsistent observers, and split
  views are explicit fail-closed states.

### Reality exit `R_3`

- At least one external transparency or witness receipt is independently
  acquired and replayed, not merely generated by local test infrastructure.
- Real operator identity, retention terms, source rights, and privacy basis are
  reviewed for the selected path.
- Two independently controlled observers can detect and report inconsistent
  lifecycle heads.

### Metrics

- Occurrence-denominator completeness.
- External-anchor cadence and lag.
- Split-view and stale-head detections.
- Lifecycle, rights, revocation, and export replay latency.
- Privacy or projection-policy violations; target `0`.

### Stop conditions

- Stop if a local pin or transport ACK is represented as external durability.
- Stop on any missing occurrence or projection that remains eligible after its
  rights or authority source has been revoked.

### Dependencies

Gates 0–2.

## Gate 4 — Zero-human one-use temporary-network formation

### Objective

For one exact tender, automatically discover and contact existing external
resources, replay their one-use responses, and reserve primary, recovery, and
independent-evidence capacity before the deadline, with no Outsider staff.

### Existing modules

- `src/outsider-outcome-formation-engine-v1.js`
- `src/outsider-outcome-formation-foundation-replay-v1.js`
- `src/outsider-outcome-resource-route-discovery-v1.js`
- `src/outsider-one-use-commitments-v1.js`
- `src/outsider-one-use-tender-response-lifecycle-v1.js`
- `src/outsider-resource-owner-standing-trust-replay-v1.js`
- `src/outsider-outcome-formation-temporary-network-v1.js`
- `src/outsider-permissioned-transaction-interface-source-replay-v1.js`
- `src/outsider-outcome-formation-temporary-network-v2.js`
- `src/outsider-formation-control-ledger-v1.js`
- `src/outsider-outcome-formation-temporary-network-coordinator-v1.js`
- `src/outsider-transaction-surface-adapter-contract-v1.js`
- `src/outsider-route-discovery-collector-v1.js`
- `src/outsider-user-held-mailbox-shadow-driver-v1.js`
- `src/outsider-outcome-formation-shadow-runner-v1.js`
- `src/outsider-controlled-endpoint-consent-grant-v1.js`
- `src/outsider-durable-one-use-endpoint-effect-ledger-v1.js`
- `src/outsider-controlled-consenting-endpoint-outbox-v1.js`
- `src/outsider-external-capacity-reservation-protocol-v1.js`
- `src/outsider-seller-owned-durable-capacity-reservation-producer-v1.js`
- `src/outsider-independent-outcome-witness-lifecycle-v1.js`
- `src/outsider-independent-witness-formation-hold-gate-v1.js`
- `src/outsider-reserved-temporary-network-formation-slice-v2.js`
- `scripts/run-outsider-external-resource-sandbox-pilot.mjs`

These modules already separate occurrence census from object deduplication and
model one-use acceptance, external standing, reservation receipts, lifecycle,
owner identity, owner registry, adoption reviews, and exact source replay. The
v2 temporary-network composition now consumes the exact owner replay and the
multi-slot coordinator binds one such replay to every mandatory route. They
correctly leave owner trust, current capacity, authority, and atomic success
false.

### Engineering deliverables

1. **IMPLEMENTED_SOURCE_REPLAY_ONLY:** each v2 transaction slot requires an
   exact owner-replay source-and-pin input. It never accepts a caller-derived
   trust record or naked Boolean; absence cannot produce a valid slot.
2. **IMPLEMENTED_SOURCE_REPLAY_ONLY:** cross-bind exact one-use response bytes,
   standing bytes and context, owner identity and registry record, tender,
   typed graph, Episode, and Attempt.
3. **IMPLEMENTED_CONFORMANCE_ONLY:** add
   `transaction-surface-adapter-contract-v1` to describe permitted search,
   quote, tender-delivery, reply, reservation, cancellation, and revocation
   semantics for each source-specific surface.
4. **IMPLEMENTED_SOURCE_REPLAY_ONLY:** add
   `route-discovery-collector-v1`; keep the existing route snapshot and
   collector pure and deterministic. The v1 runner always records
   `NOT_INVOKED`, never touches its injected argument, and cannot prove zero
   internal operations. External I/O belongs only to a separate,
   source-specific driver after permission, credential lease, rights/privacy,
   nonce, deadline, and action admission are independently replayed.
5. **PARTIAL_CONTROLLED_TEST_ENDPOINT_ONLY:** the fixed loopback outbox produces
   a signed, source-qualified `RECEIVED_FOR_COUNTERPARTY_REVIEW` receipt. A real
   transaction-surface delivery/response adapter remains to be implemented;
   delivery alone establishes no acceptance.
6. **IMPLEMENTED_PURE_COMPOSITION_ONLY:** the temporary-network coordinator
   proves an exact mandatory-requirement-to-selected-row-to-v2-slot bijection
   and atomically evaluates fixed-false commitment premises. It does not search,
   invoke, or run branches in parallel.
7. **PARTIAL_DURABLE_LOCAL_ONLY:** the formation-control ledger still replays
   caller-retained nonces, idempotency, deadline, expiry, cancellation, and
   revocation. The separate endpoint-effect ledger durably prevents a second
   POST after an attempted submit and supports restart reconciliation, but it
   does not prove trusted time, global freshness, external non-equivocation, or
   complete external occurrence truth.
8. **IMPLEMENTED_CALLER_SOURCE_REPLAY_ONLY:** the same control ledger makes a
   recorded staff touch terminal for commitment; it cannot prove an omitted
   staff touch did not occur.
9. **REMAINING:** add `standing-capacity-invitation-delivery-v1` as a separate post-fulfillment
   flow. Invitation, reply, grant, revocation, and expiry remain distinct.
10. **PARTIAL_CONTROLLED_ENDPOINT_ONLY:** the user-held mailbox shadow driver
    and formation shadow runner retain their bounded three-branch behavior. A
    separate signed consent grant, durable one-use effect ledger, and fixed
    loopback outbox now prove attempted-before-POST durability, no-resubmit
    restart behavior, and status-only crash reconciliation for one controlled
    test lane. **REMAINING:** connect the same boundary to separately admitted,
    user-controlled source-specific drivers and failure simulators for API,
    marketplace, reservation surface, one-time response page, and user-held
    email without embedding domain semantics in the coordinator or building a
    provider registry.
11. **IMPLEMENTED_EXTERNAL_SANDBOX_EFFECT_ONLY:** one fixed, documented public
    test API accepted one synthetic create request and returned the same object
    on exact-ID read-back. The request was durably marked attempted before
    network I/O and was never automatically retried. This establishes a real
    third-party HTTP state transition only; it establishes no real resource,
    counterparty, provider acceptance, capacity, standing, authority, or
    outcome promise. **REMAINING:** perform the same bounded one-use path through
    a user-controlled transaction account toward one explicitly permitted real
    counterparty or resource interface.

12. **IMPLEMENTED_ACCOUNT_SCOPED_PROVIDER_RESOURCE_PILOT:** a user-held
    Cloudflare account created an isolated Workers KV namespace, wrote and
    exactly read one expiring synthetic value, deleted the namespace, and
    verified cleanup. This is a real provider-native resource lifecycle and
    proves the external account/control-plane seam. It is not a supplier tender
    or capacity reservation. **REMAINING:** discover and transact with the
    task-specific seller surface selected from the open internet, without a
    founder-provided contact or persistent provider catalog.
13. **IMPLEMENTED_PROTOCOL_AND_DURABILITY_ONLY:** the exact signed offer now
    feeds a distinct owner-signed capacity reservation request, receipt, and
    append-only lifecycle, and the seller-side producer consumes its one-use
    release through the durable effect ledger before returning bytes. The
    verified output remains a source declaration until the owner identity,
    authority, and real current resource capacity are independently established.
14. **IMPLEMENTED_WITNESS_SOURCE_REPLAY_ONLY:** an exact independent-witness
    reservation/result/revocation lifecycle is bound to the tender, primary
    Attempt, acceptance criteria, observation window, witness owner and
    evidence/recovery requirement. Receipt presence can now be represented in
    the formation HOLD gate. Independent control and outcome truth remain
    false; a provider self-report, server acknowledgement, or model reward is
    never admitted as witness evidence.
15. **IMPLEMENTED_COMBINED_GATE4_SOURCE_REPLAY_ONLY:** the additive v2
    composition can prove only source-declared structural closure of the exact
    `PRIMARY / RECOVERY / INDEPENDENT_WITNESS` three-slot bijection. Real current
    capacity, owner authority, witness independence, outcome truth, atomic
    `COMMIT`, and any user promise remain false. An incomplete, revoked, or
    expired source keeps the order on automated `HOLD` before its formation
    deadline and produces `DECLINE_NOT_HUMAN_QUEUE` at or after that deadline.

### Global resource-interface federation

The founder supplies shared infrastructure accounts, not supplier
relationships. No order may require the founder to find, pre-approve, or
introduce a provider. For each tender, Outsider derives bounded geography,
language, resource class, timing, and transaction requirements and discovers
candidate surfaces afresh from the internet.

The discovery stack is intentionally federated:

1. query global place and web indices for the compiled resource class;
2. resolve only seller-published domains and public contact/transaction links;
3. inspect seller-source `LocalBusiness`, `Offer`, `potentialAction`,
   `Action.target`, and `EntryPoint` semantics plus visible booking, RFQ,
   checkout, API, form, `mailto:`, and telephone routes;
4. classify each route as `DISCOVERY_ONLY`, `PUBLIC_CONTACT`, `PUBLIC_RFQ`,
   `PUBLIC_BOOKING`, `PUBLIC_CHECKOUT`, or `OFFICIAL_API`;
5. admit only the exact route whose terms, rights/privacy boundary, buyer
   authority, nonce, deadline, and consequence reach are satisfied for this
   tender; and
6. discard the order-scoped candidate set after closure except for the exact
   evidence and any separately accepted, revocable, expiring standing grant.

This is not a global provider database. Global coverage comes from querying
the current internet for every order. A public acquisition page is a discovery
and possible transaction surface; it is not necessarily an unauthenticated
API, and public visibility alone does not authorize bulk automation or prove
acceptance. Seller-owned content is the semantic source of truth.

A first credentialless [Nominatim](https://nominatim.org/release-docs/latest/api/Search/)
reconnaissance query, bounded to five results and operated below its
[public one-request-per-second policy](https://operations.osmfoundation.org/policies/nominatim/),
returned five real
businesses; two published seller websites and one additionally published a
telephone route plus `reservation=yes`. No business was contacted and the raw
response was not admitted as replay evidence. Nominatim is suitable for
bounded bootstrap discovery, not systematic production crawling. The selected
first production discovery account is
[Brave Search API](https://brave.com/search/api/) because one account can cover
both global Web Search and global Place Search. Its
[default result license](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service)
(page marked updated `2026-09-01`) does not authorize append-only storage, so
production v1 must either
obtain separately documented storage rights or use results only inside the
single transient discovery operation. Under the default license, v1 does not
persist a Brave-returned URL, title, snippet, POI identifier, contact field,
ranking, raw response, or response-derived fingerprint. It may follow a
candidate URL in memory and then acquire a fresh route and evidence directly
from the seller-owned response, subject to that seller source's own rights and
privacy review. Whether even this seller-source continuation is outside
Brave's derivative-work restriction needs written confirmation before
production retention; until then, the durable network projection records only
transport/admission facts and no Brave-returned value.

On 2026-09-03 the founder-provided shared discovery account was connected
without any founder-provided supplier relationship. The existing key named
`Outsider` is stored only in the local macOS Keychain service
`outsider-brave-search-api`; it is absent from the repository, process output,
and durable pilot records. The dashboard showed a shared Search usage limit of
`$25.00/mo`. Brave's current
[billing FAQ](https://api-dashboard.search.brave.com/documentation/resources/help-feedback)
says this configured limit is added to the monthly `$5` Search credit, so it
normally permits about `$30` of total
monthly API use; prepaid balance remains a separate availability gate.

The same session exercised real Brave Web Search in Tokyo, Cambridge, and
Nairobi through the official
[Web Search endpoint](https://api-dashboard.search.brave.com/api-reference/web/search/get)
and real Brave Place Search in Cambridge through the official
[Place Search service](https://api-dashboard.search.brave.com/documentation/services/place-search).
Eight bounded API attempts
produced seven `200` responses and one request-validation `422`: `country=KE`
was not accepted by the Web endpoint, while a new bounded Nairobi query with
the country omitted and geography retained in the query succeeded. This is a
real interoperability finding, so v1 must not equate ISO-3166 membership with
Brave's supported country enum. Seven transient candidate follows returned
five `200` pages and two managed `403` pages; four seller/marketplace HTML
responses contained transaction-language signals. In an explicit fallback
probe, the first candidate returned `403`, the second returned `200` without a
transaction signal, and the third returned `200` with a transaction signal, so
the order-local route loop selected the third candidate without human rescue.
No raw Brave response, result field, candidate URL, title,
snippet, contact, POI identifier, or hash was persisted or printed. These
calls establish only global discovery transport and transient route
resolution; owner authority, contactability, tender delivery, provider
acceptance, capacity, price, recovery, and commitment all remain false.

The final successful call used the implemented order-scoped adapter itself,
not an ad hoc transport probe. It bound a compiled tender, one exact resource
requirement, a private expiring query, and a private nonce; performed one fixed
Brave GET with no retry and a 2 MiB pre-parse response limit; issued candidate
access only through a module-owned one-consumption ephemeral lease; and
serialized only privacy-closed projection
`sha256:01f36d065b3fd9cc24747df2904d263448fac955e145b88f6841bcf796e19cad`.
The serialized projection contains no query, token, raw response, result field,
result-derived count, candidate URL, or private binding. Default-license
storage rights and durable collector admission both remain explicitly false;
a freshly fetched seller-owned source is the next admission boundary. The
projection also reports the real infrastructure consequence honestly: one
bounded, potentially billable Brave request occurred under out-of-band pilot
authorization, while task-provider action reach remains `NONE`.

The next bridge consumes that module-issued candidate lease exactly once; it
must not accept a caller-supplied arbitrary URL. It performs one non-redirecting
HTTPS GET after resolving both A and AAAA answers, rejecting every private,
loopback, link-local, reserved, mapped-private, or mixed answer, pinning the
accepted address into the TLS connection, and rechecking the connected remote
address. The seller hostname remains the TLS SNI and certificate identity.
Only a bounded `200 text/html` response may be parsed, and only a
seller-published absolute HTTPS canonical plus seller-published booking, RFQ,
checkout, contact, form, API, `Offer`, or `potentialAction` route can form a
new seller-source observation. A redirect is a separate route attempt, not an
implicit follow.

No durable collector observation is currently permitted from this bridge.
Before that gate opens, Outsider needs both (a) written clarity or contractual
rights that a freshly re-fetched seller source is not prohibited as a Brave
derivative and (b) exact current seller-source rights/privacy receipts. The
invariant test for the future bridge is that two different Brave queries or
candidates yielding identical seller response bytes produce identical seller
source hashes: no Brave query, rank, URL, candidate ordinal, hostname, or DNS
answer may enter any durable hash preimage.

The first seller-owned route resolution also completed without a founder
contact. One candidate from that exact five-result Nominatim response resolved
to [The Friendly Toast Cambridge](https://www.thefriendlytoast.com/cambridge-ma),
whose own location page visibly publishes reservation, waitlist, online-order,
telephone, and address routes. The reservation anchor resolves to a
location-specific Toast booking page, so the candidate is classified
`PUBLIC_BOOKING` plus `PUBLIC_CONTACT`; the online-order route currently reports
no menu and is not classified as available checkout. Both seller-domain
`robots.txt` attempts returned a managed `403` challenge, and no seller- or
Toast-published guest automation API permission was established. The system
therefore stops at read-only discovery: no crawl, hidden-endpoint call,
reservation, waitlist join, order, message, or capacity claim. This restaurant
is only a transport-class test observation and adds no restaurant-specific
branch to the core engine.

### Order-scoped Discovery Federation — no founder credential root

This section supersedes any interpretation above that the selected Brave
account is Outsider's global entry point. Brave is one replaceable bootstrap
discovery node. A founder-held search credential, machine, network location, or
supplier relationship is never a control-plane dependency, trust root, or
coverage boundary.

The precise North Star is:

> Outsider's discoverable ingress-node set is open-ended at the protocol layer;
> the reach, authority, capacity, and commitment of every real order remain
> finite and must be proved for that order.

“Open-ended” does not mean unbounded crawling or fan-out. The federation may
admit new node implementations and independent operators without a central
enumeration ceiling, while each tender fixes its maximum node attempts,
concurrency, time, network consequence, privacy disclosure, and spend. A node
failure is data for the order's occurrence census; it never enters an Outsider
staff queue.

The evidence for this direction is large but must not be overstated:

- ITU estimates that 6.0 billion people, 74% of the world, used the internet in
  2025, while 2.2 billion remained offline. Its 2025 mobile-coverage estimate
  reports 96% coverage by 3G-or-better networks. These are official estimates
  assembled from national, operator, survey, and model inputs rather than a
  census of live endpoints.
- GSMA estimates that 4.7 billion people, 58% of the world, used mobile
  internet on their own or primary device at the end of 2024, while roughly
  3.1 billion people lived under mobile-broadband coverage but did not use it.
  Network presence therefore cannot be treated as access, consent, or a
  transaction surface.
- The World Bank's 2025 Global Findex, based on nationally representative 2024
  surveys of about 148,000 adults in 141 economies, reports that 86% of adults
  owned a phone, 68% owned a smartphone, and 42% of adults in low- and
  middle-income economies made a digital merchant payment in 2024, up from 35%
  in 2021. Edge devices are already transaction endpoints, not merely search
  screens, but 1.3 billion adults still lacked a financial account.
- Cloudflare observed mobile devices producing 43% of 2025 traffic on its own
  network, with mobile exceeding half of requests in 117 countries or regions.
  This is a large operational sample, not a measurement of the whole internet,
  and it proves neither seller permission nor transaction availability.
- Apple App Intents and Android AppFunctions expose application actions to
  system agents at or near the device. Android currently labels AppFunctions
  experimental and limited-preview. These interfaces establish a platform
  direction, not universal adoption.
- Existing standards already supply complementary federation pieces: DNS-SD
  enumerates services in a named domain; WebFinger resolves internet entities
  to typed links; `/.well-known/` reserves application-defined origin metadata;
  Schema.org describes seller-published offers and entry points; OpenAPI
  describes HTTP interfaces; ActivityPub provides decentralized client/server
  and server/server delivery; and MCP composes independently operated servers.
  None of these standards, on its own, proves resource-owner identity,
  delegation, willingness, capacity, price, or outcome.

The federation therefore accepts heterogeneous, independently operated
discovery nodes behind one narrow internal envelope:

1. `EDGE_LOCAL`: device-local OS intents, app functions, local-network service
   discovery, and private context that must remain on the device;
2. `BUYER_HELD_ACCOUNT`: the user's browser, mail, calendar, procurement,
   marketplace, reservation, cloud, property, or other already-authorized
   account;
3. `SELLER_DOMAIN`: seller-owned HTML/JSON-LD, registered well-known metadata,
   WebFinger links, OpenAPI descriptions, booking, RFQ, checkout, and contact
   surfaces;
4. `PROTOCOL_OR_REGISTRY`: multiple DNS domains, MCP registries and
   subregistries, ActivityPub actors, operator API federations, and future
   independently operated directories;
5. `PUBLIC_INDEX`: Brave, other web/place indices, and bounded public datasets;
6. `STANDING_CAPACITY`: revocable, expiring grants created only after an owner
   has separately opted in following a completed order.

Node kinds are versioned strings, not a closed central enum. A node runs where
its credential and private context already live. It emits only a short-lived,
source-bound receipt and a module-private one-use candidate lease; secrets,
queries, candidate URLs, ranks, contacts, and raw responses do not enter the
public federation projection. The central coordinator is not entitled to copy
an edge credential merely because it can consume that node's receipt.

Every node starts at the same non-authorizing evidence ladder:

```text
DISCOVERY_OCCURRENCE
  -> SELLER_SOURCE_RESOLVED
  -> INTERFACE_DESCRIBED
  -> ACCESS_AUTHENTICATED
  -> PROVIDER_SIGNED_OFFER
  -> EXTERNAL_CAPACITY_RESERVED
  -> COMMAND_TO_EFFECT_OBSERVED
  -> OUTCOME_INDEPENDENTLY_WITNESSED
```

DNS, search, WebFinger, Schema.org, `tools/list`, OpenAPI, an OAuth success, an
HTTP `200`, and an ActivityPub `Accept` may contribute evidence at their exact
layer; none may skip a layer or mint authority. Commitment still requires the
intersection of current user delegation, endpoint credential scope, provider
acceptance, capacity reservation, payment/legal route, independent witness,
recovery route, and bounded loss. Thus `C_enabled ⊆ A_proven` remains unchanged.

The implementation order from this correction is:

1. add a versioned order-scoped Discovery Federation contract above all
   adapters, with an open node-kind namespace and strict per-tender limits;
2. connect the existing Brave adapter as an ordinary `PUBLIC_INDEX` node and
   prove that its removal does not invalidate the plan or tender;
3. run at least one credentialless non-Brave protocol node against a real
   public endpoint and retain only its bounded status/shape/hash receipt;
4. add seller-owned structured-data and OpenAPI resolvers, then MCP registry
   and remote-server discovery, without building a provider registry;
5. add edge-issued nodes whose local broker retains device/account secrets and
   sends only minimal candidate evidence;
6. feed freshly resolved seller-source observations into the existing route
   collector, one-use tender lifecycle, temporary-network coordinator, and
   owner/witness/recovery gates;
7. test formation with the founder search credential unavailable. Success is
   a complete, zero-staff temporary network through other nodes, or an honest
   deadline decline—not manual rescue.

The coverage equation is now explicitly:

```text
candidate reach = independently routable discovery nodes
                × compatible protocol adapters
                × order-local reachability

committable reach = candidate reach
                  ∩ user delegation
                  ∩ seller acceptance
                  ∩ reserved primary + recovery + witness capacity
                  ∩ legal payment path
                  ∩ bounded consequence
```

The operating dashboard must add: formation rate without founder credentials;
independent ingress trust roots and regions; edge-issued candidate share;
survival when every central search credential is unavailable; secrets leaving
their home node (target `0`); and Outsider staff touches per order (target `0`).
Random node count is not a success metric.

The first non-Brave live node was exercised on 2026-09-03 through the official
public MCP Registry: one credentialless, read-only
`GET https://registry.modelcontextprotocol.io/v0.1/servers?limit=5` completed in
approximately 375 ms with HTTP `200`, `application/json`, and 3,197 received
bytes. The in-memory response hash was
`sha256:0c2bfe77ca14ec70646ba9f853e2dd1cb897d68f83814c6fd646c565422ad39e`;
JSON parsing found top-level `metadata` and `servers`, five occurrence rows, a
next cursor, five rows with remote metadata, and none with package metadata.
Four rows named different versions of the same published server, directly
confirming that occurrence census cannot be reported as unique provider count.
No raw response was printed or retained. This proves only that an independent,
machine-readable discovery node was reachable at that instant. Registry
preview status, remote availability, publisher ownership, safety, transaction
authority, capacity, price, and outcome truth remain unproved.

The source-specific MCP Registry adapter then exercised the same independent
node through its implemented contract. One sandbox-contained invocation
closed as `SOURCE_TRANSPORT_UNAVAILABLE` before usable internet egress; the
approved external invocation performed one fixed, credentialless GET with no
redirect or retry and returned `SUCCEEDED`. Its privacy-closed projection is
`sha256:7096eae1ed3239b6a7512a3fda3be2f0157f5e7b56a126e55f44b483a9967753`.
The projection contains no query, name, version, description, remote URL, raw
response, result count, or result-derived fingerprint. It keeps provider
identity, ownership, safety, authority, capacity, and execution false.

Implementation status on 2026-09-03: the generic federation is now a bounded
orchestrator rather than a trusted adapter wrapper. Every job declares a
maximum runtime of at most 30 seconds. The module issues the exact invocation
before calling a node, accepts at most one receipt bound to that invocation and
its private input commitment, and consumes the receipt once. A receipt cannot
cross tenders, occurrences, queries, nonces, or invocations. Each injected node
receives an `AbortSignal`, but the public boundary says explicitly that an
arbitrary node may ignore it and that post-timeout side effects are not proved
absent. Therefore generic provider contact, tender delivery, and consequence
reach are `NOT_INDEPENDENTLY_ESTABLISHED`, never silently `false` or `NONE`.
The core itself still performs no network I/O and hard-gate admission remains
false. The generic federation contains no Brave import; Brave and MCP Registry
are peer source-specific nodes.

The next ladder step, `INTERFACE_DESCRIBED`, is now implemented for one narrow
credential-free MCP path. The observer accepts only a complete module-issued
federation result, an exact MCP Registry occurrence, and one-use private
candidate indices; it never accepts a caller-supplied URL. The bridge records a
process-local WeakMap provenance binding through the exact private-input hash,
which prevents a same-tender result from a different query or nonce being
substituted. Before network I/O, the observer checks local-wall-clock expiry,
caps the run to three candidates, eight seconds per candidate, twenty seconds
total, three requests per candidate, and two MiB of request-plus-response
bodies. It rejects credentials, redirects, retries, userinfo, non-HTTPS or
non-443 endpoints, IP literals, local hostnames, and any DNS answer set
containing loopback, private, link-local, documentation, reserved, multicast,
or other non-public addresses. The connection is pinned to a validated answer
while retaining the candidate hostname for TLS verification, and the actual
TLS remote address is replay-checked. Only `initialize`,
`notifications/initialized`, and `tools/list` can be sent; `tools/call` and
arbitrary JSON-RPC methods are structurally absent. The server can still
observe transport metadata. A server-issued session identifier may be echoed
transiently, but is neither projected nor retained. The observer requests MCP
`2025-11-25` and accepts only the frozen official compatibility set
`{2025-11-25, 2025-06-18}`.

The first formal live observer occurrence reached the selected public remote
through pinned DNS and TLS, sent one 176-byte `initialize`, and received 299
bytes, but correctly stopped at `MCP_INITIALIZE_SHAPE_INVALID` because the
initial implementation accepted only `2025-11-25`. Its privacy-closed
observation projection was
`sha256:efa021c387ba07def0429b5f3ce1b46c654adccc1161e617f8c1cf014217b8e7`.
This failed occurrence remains part of the engineering history. The observer
artifact was reissued as a descendant: current 39,192-byte source
`sha256:12e3a08580e8a538a1e21e1521a3c1ee30e9e27aa647891897068bec86256e9e`
supersedes the pre-negotiation 38,626-byte source
`sha256:08867e023d4a34a7f5a06c462404eb20c4449308be29398f5ad96f8cf6b2314d`
for protocol negotiation behavior; no failed occurrence was overwritten.

A fresh post-repair occurrence then completed the real path without Brave, a
founder credential, a provider database, or staff intervention. The official
Registry node performed one GET, returned HTTP `200` and 2,032 decoded bytes,
and emitted projection
`sha256:7096eae1ed3239b6a7512a3fda3be2f0157f5e7b56a126e55f44b483a9967753`.
The generic federation ran only `mcp.registry.v01`: one occurrence planned,
invoked, and succeeded, with plan hash
`sha256:0d3e70c1b0580047db3aee78125d777fdb6c7f0f03aa12aa7b5801d3f5b225b6`.
The one-use remote observer verified a wholly public DNS answer set and the TLS
remote address, then completed `initialize -> initialized -> tools/list` in
exactly three POSTs: 300 request-body bytes and 8,270 response-body bytes. The
whole Registry-to-interface run took 1,413,297,458 ns. Its privacy-closed
projection was
`sha256:49830887bf7f1f967ec1271145256925899eed1ccd718583cdfa1d290b92b308`.
No raw response, query, candidate URL, server or tool name, description, input
schema, session identifier, or result count was retained in that projection.
No credential, redirect, retry, tender material, `tools/call`, provider claim,
owner claim, offer, reservation, capacity, or authority was created. The
result is `INTERFACE_DESCRIBED / HOLD`, not a transaction commitment.

This closes implementation-order items 1--3 and the MCP Registry/remote-server
subset of item 4 for one independent protocol path, but not the seller-owned
structured-data/OpenAPI resolvers and not the product promise. The immediate
next gate is not another central search account. It is a seller- or
resource-owner-controlled transaction surface with explicit machine-use
permission that can receive one structured, one-use tender and return an
independently replayable signed offer, followed by a separate external capacity
reservation. Primary, recovery, and witness routes must then be discovered
independently for the same order. If those external facts do not close by the
formation deadline, the result remains `DECLINE_NOT_HUMAN_QUEUE`; an MCP
Registry row or `tools/list` response can never be promoted into owner authority
or capacity.

### First real reversible external-effect path — 2026-09-03

One bounded Cloudflare Workers episode completed the real provider-control-plane
path through a user-held account: preflight, one randomly named Worker upload,
workers.dev enablement, exact public-body observation, exact Worker deletion,
and public absence observation. It produced three submit attempts, three
provider receipts, and twelve append-only durable occurrences; cleanup completed
and the seven-day least-privilege token was then revoked. Incremental price was
USD 0 and no payment was attempted. The durable ledger is frozen under
`artifacts/cloudflare-ephemeral-worker-reality-episode-20260903-v1/` with head
`sha256:2508c55aaf2c3b141f6b41b2e02dcbc3667c56aabedabeb734cf11da4fb34934`.

This is a path certification, not a result commitment. The public observer was
still reading provider-hosted infrastructure; no independent outcome truth,
seller acceptance, resource-owner authority, capacity reservation, recovery
supplier, price, guarantee, or settlement path was established. A first
preflight occurrence failed closed before any write because an account-owned
token was checked at the user-token verification route. The adapter descendant
now selects the account-token route for `cfat_` tokens; the failed occurrence was
not rewritten. Runner revision 1 did not durably save its full privacy-closed
stdout projection transcript, so the artifact explicitly distinguishes the
source-replayable local effect ledger from hashes captured after the run. The
versioned `run-cloudflare-ephemeral-worker-episode-v2.mjs` descendant now opens
a private `0600` JSONL transcript before the first emitted phase and fsyncs
every privacy-closed projection. It explicitly supersedes frozen v1 source
`sha256:0ec4c85ed32d516632ac794273308f1bb124b0d07a2919f65909bba59d16487a`.
The 17,519-byte v2 source is
`sha256:e63c564e155cec562cbf35d34a2d9b8f0c8cce3e109c3a8253d4f5a1d9cf0f4a`.
A complete nine-phase mock replay verified the repair; it will apply to the
next live effect episode without rewriting the first-live artifact.

### Seller-owned discovery and response production seams — 2026-09-03

`outsider-woocommerce-products-discovery-adapter-v1.js` adds the first
distributed seller-owned transaction-surface reader. It consumes an opaque,
one-use seller-origin lease from the order-scoped federation, performs at most
`HEAD seller origin -> GET WordPress API index -> GET Woo Store Products`, and
retains seller, query, product, stock and price material only in module-private
ephemeral state. Redirects, credentials, retries, cart, checkout, order and
payment are absent. A seller-published price or `is_in_stock` flag remains a
discovery fact, never a binding offer or reservation. The 24,655-byte source is
`sha256:82134fbe9769af7e458151bd46e831cf54a416a4be14b0e34a6b76af9e9c9c1a`;
its focused suite passes 4/4.
`outsider-public-https-read-only-fetch-transport-v1.js` supplies its live
transport boundary: all DNS answers must be public, one address is pinned into
the TLS lookup, certificate/servername and socket remote address are replayed,
and only bounded `HEAD`/`GET` without credentials, redirects, retries or cookies
can return. The 20,422-byte source is
`sha256:18f5bd916542dc84b1923e7784eeddd57c1d688ecc3f1818783b8d54d7a26466`;
its focused suite passes 5/5.

`outsider-seller-owned-one-use-capacity-emitter-v1.js` adds the corresponding
producer-side seam. A seller-held Ed25519 key emits the existing verifier's
five signed source documents for one exact `OFFERED` response and a challenge
bound to a separately discovered witness route. It does not introduce a second
verifier and it explicitly keeps capacity, authority and outcome truth false.
The 23,181-byte source is
`sha256:dc4d6231d6500cca19f9473cf52fa7ea67977b763078563ff65643e559e96365`;
its focused suite passes 3/3 and the reused lifecycle suite passes 19/19.
`outsider-seller-owned-durable-one-use-capacity-emitter-v2.js` then composes
that frozen emitter with the existing durable effect ledger instead of adding
another filesystem history. It binds the exact response nonce, tender, typed
graph, Episode, Attempt, provider, scope and five-source manifest, and releases
source bytes only after a fsync-backed `SUBMIT_ATTEMPTED`. A crash after that
append makes every restarted release refuse; a crash before it may resume from
the exact prepared input. The 17,006-byte adapter is
`sha256:db9c7500bd6c8531f044d773a594eb9827edf5b633b1bda1caad6bd96dd613c0`;
its focused restart suite passes 3/3 and the reused ledger suite passes 7/7.
The remaining producer gap is a public seller endpoint, an external head that
excludes filesystem-owner rollback, and an independent witness receipt.

The first live WooCommerce occurrence is frozen under
`artifacts/woocommerce-products-discovery-reality-episode-20260903-v1/`.
One Brave discovery occurrence succeeded and the selected seller root answered,
but the run failed closed at `WORDPRESS_API_INDEX` after two seller-surface read
attempts. A later diagnostic measured the known official WooCommerce root index
at 2,196,879 bytes, above both the adapter and runner bounds; because the private
candidate and transport error were intentionally not persisted, that measurement
is a repair hypothesis rather than a retroactive claim about the occurrence.

The versioned v2 descendant leaves that failure intact and narrows the discovered
same-origin API root to the exact `wc/store/v1` namespace index. Its adapter is
7,194 bytes,
`sha256:78892fa70c4c0860500ea7aa182e4fc01b3bfc9d763cee61e038d7808b270e31`;
its runner is 13,472 bytes,
`sha256:6a709eef2be046105da3a02d1e33973c696a281f0f0968a5cd568b3eaf831da8`.
Fifteen focused and adjacent tests pass. The second live occurrence is frozen
under `artifacts/woocommerce-products-discovery-reality-episode-20260903-v2/`.
It completed exactly one Brave federation occurrence and three bounded seller
reads (`HEAD -> namespace index -> products`) with no retry, redirect, seller
credential, cart, checkout, order, or payment. The Woo privacy-closed projection
is
`sha256:6076f7767fd5e79ef9e6606d2ec5a7e38acb88f2a7f28ade4da2fc7df477c310`.
This proves the real `PUBLIC_INDEX -> seller-owned native read interface` path,
not seller acceptance, reserved capacity, authority, price commitment, or an
outcome promise; the decision remains `HOLD / NONE`.

`outsider-seller-owned-http-one-use-tender-endpoint-v1.js` now exposes the
producer seam as a generic injected HTTP handler at the fixed protocol path
`POST /outsider/v1/one-use-tender-responses`. It pins one exact tender,
response, provider, scope, two nonces and expiry; seller terms and the private
key remain in the endpoint capability instead of the request. Only after the
existing durable ledger records `SUBMIT_ATTEMPTED` can it return the existing
five signed lifecycle source documents. A restart replays that ledger and
refuses a second byte release with `409`. Its 17,661-byte source is
`sha256:ca20884c20523117bc13dca0c6a4c323552aa2f9720a20c685bfa74698113883`;
25 focused and adjacent lifecycle tests pass. It is deployable handler logic,
not evidence that an external seller has adopted or answered it.

`outsider-durable-effect-ledger-external-head-publication-v1.js` adds a separate
commitment-only publication seam for the durable ledger. It fresh-replays the
local head and entry-set root, calls one injected transport without retry, and
requires the receipt to echo the exact request, commitment, policy, sequence and
predecessor. A stale head or cross-commitment receipt fails closed. Its
17,793-byte source is
`sha256:90d730f7c1879f1e2c246b621b7d69b4a53a0a6fc42b26ca4d00d5c5532da566`;
eleven focused and adjacent ledger tests pass. A provider `APPENDED` response
is still only a persistence receipt: it does not prove provider identity,
non-equivocation, owner authority, capacity, or outcome truth.

`outsider-order-scoped-seller-origin-lease-v1.js` removes the remaining
founder-account coupling from the seller-origin bridge. A process-local issuer
is created for one federation job and pins tender, work order, typed graph,
occurrence, node slot and kind, requirement set/object, expiry and a private
nonce. A node may seal a same-origin HTTPS seller origin only while presenting
the current module-issued federation invocation receipt; the origin remains in
a `WeakMap`, and the lease can be consumed once. Two unrelated test node kinds
produce the same generic contract, while fabrication, cross-order use and replay
fail closed. Its 6,704-byte source is
`sha256:469fb787a0a738f8e2c570e52c898d7673924b03b49bd5ae27f0668cece7f99b`.
The 6,388-byte
`outsider-seller-transaction-interface-discovery-adapter-v2.js`
(`sha256:e60f2266aebb98ee00661b14569df83ed15c98256ac5cc25e30b9afaeec71b87`)
consumes that generic lease, rather than importing Brave. It reads exactly
`/.well-known/outsider` through the pinned public HTTPS transport and can only
produce an opaque, non-invocable `INTERFACE_DESCRIBED / HOLD` lease. Thus Brave,
a device-local index, a seller directory, or a future protocol node can all be
replaceable entry nodes without becoming Outsider's authority root.

`outsider-injected-temporary-network-formation-slice-v1.js` now wires the
frozen tender and coordinator into three concurrently invoked seller HTTP
capabilities for `PRIMARY`, `RECOVERY`, and `INDEPENDENT_WITNESS`, decodes every
returned five-source bundle, and replays it through the existing lifecycle
verifier. It cross-binds requirement, provider, route and candidate slots and
records three distinct structural owners, keys and routes without claiming that
hash inequality proves independent control. Even when all three seller source
declarations replay, the result remains non-committing because external owner
trust, capacity and a witness result receipt are absent. Missing slots and nonce
splices hold before the deadline and become `DECLINE_NOT_HUMAN_QUEUE` at it;
restart replay returns `409` and re-emits no source documents. Its 17,817-byte
source is
`sha256:9ab6607cd0d5a41456f75eecf8ce85ee3107466a2f5d2d82168dbfdd07824f58`;
its three focused end-to-end cases pass.

`outsider-external-capacity-reservation-protocol-v1.js` now adds the
transaction that must follow a signed offer instead of relabeling the offer as
capacity. A buyer request binds the exact tender, typed graph, Episode, Attempt,
offer/head/nonce, provider, resource-owner source and key, mandatory slot and
object, quantity/unit, service window, reservation nonce, and expiry. The
owner-key source emits a complete signed `CAPACITY_RESERVED` lifecycle with
append-only `REVOKED` and `EXPIRED` descendants. The separate
`outsider-seller-owned-durable-capacity-reservation-producer-v1.js` consumes the
nonce through the existing fsync/CAS effect ledger before releasing any bytes,
so restart after `SUBMIT_ATTEMPTED` cannot release a second reservation. The
53,136-byte protocol source is
`sha256:735eda4dbe9e19f18f914ea63693525b735d39d5bf46483cd8bbfdd9fec67eb0`;
the 13,918-byte durable producer is
`sha256:5a571c222d33cc7956a068af2e9759c68d598133ec28c023d6719c9c204df1e0`.
Thirty-three focused and adjacent cases pass. A verified record may say only
`sourceDeclaredCapacityReservationCurrent=true`; because a self-signed owner
source is not independently established owner authority or capacity truth,
`externalCapacityEstablished`, `capacityReserved`, and authority remain false.

`outsider-independent-outcome-witness-lifecycle-v1.js` adds the distinct
witness-owned `reservation -> result receipt -> revocation` source lifecycle.
It binds the exact tender outcome and acceptance criteria, primary Attempt,
primary and witness providers/controllers, witness owner, observation window,
evidence/recovery requirement, nonce, and expiry. The additive
`outsider-independent-witness-formation-hold-gate-v1.js` can therefore establish
that an exact signed witness receipt is present without claiming that its owner
or operational control is independent or that the reported outcome is true.
Provider self-report, server acknowledgement, and model reward are rejected as
witness evidence. The 41,659-byte lifecycle source is
`sha256:714aadb496255542e696720cf4821eda50dde6c17aec576cd6a4822b996b0ae8`;
the 11,110-byte HOLD gate is
`sha256:772869131753cd56c2d7239e919028ff408f0075a8b4506eda4ca2915252827c`.
Its focused and formation-adjacent set passes 32/32. Neither source enables
live I/O, payment, capacity, action, outcome truth, or atomic commitment.

`outsider-reserved-temporary-network-formation-slice-v2.js` now composes those
two new source families instead of leaving them as parallel primitives. It
fresh-rebuilds the frozen v1 injected formation, requires an exact three-role
`PRIMARY / RECOVERY / INDEPENDENT_WITNESS` bijection at one observation instant,
replays each capacity source, and cross-binds every tender/graph/Episode/Attempt,
provider, offer, owner, requirement, quantity, window, nonce, and expiry. It
then rebuilds the witness HOLD gate and separately binds the witness owner,
evidence slot, primary provider, and result receipt. Complete source-declared
three-slot structural closure is now representable; that closure is the only
positive Gate 4 fact. The 23,079-byte descendant
(`sha256:2e47db2a19c491bfc2a21cf8bb264ffcbe27368879a31f4941b76db9c473f05e`)
keeps real current capacity, owner authority, witness independence, outcome
truth, atomic `COMMIT`, and every user promise false. Sixteen focused and
adjacent cases pass. Missing, revoked, or expired sources continue automated
formation before the deadline and produce `DECLINE_NOT_HUMAN_QUEUE` at it.

`outsider-cloudflare-workers-kv-external-head-transport-v1.js` implements one
real-provider-shaped persistence transport for the publication seam. It seals
one account, namespace, binding and versioned key, performs at most one exact
PUT and one exact-byte GET, and exposes none of those identifiers in its public
result. Its 17,880-byte source is
`sha256:3a424c2059459e4e4348970ba5f8fb8c54c8de480164099ea46d8bee1201a1f7`;
nine focused and adjacent tests pass. It is deliberately not promoted to an
external anchor: Workers KV lacks create-if-absent/CAS, is eventually
consistent, and cannot exclude cross-process overwrite, parallel genesis,
non-omission or non-equivocation. The preferred real anchor target is therefore
a publicly verifiable append-only transparency log, not a stronger-sounding
label on mutable storage.

`outsider-rekor-durable-effect-head-transport-v1.js` now supplies that stricter
transport shape for one digest-only effect-head commitment. It uses one
caller-pinned Rekor v1 origin and log-key epoch, a caller-managed ephemeral
P-256 key, and exactly one `hashedrekord/0.0.1` POST. The shared strict verifier
checks the exact proposal body, operator signature, signed entry timestamp,
RFC 6962 inclusion path, entry UUID/leaf binding, signed checkpoint, log-key
epoch and chronology, then captures a bundle for offline replay. The 30,277-byte
source is
`sha256:562385466c8928a2f09d95a7b0106c2ecc1ff77cd89fc27c28cbff1933fa1d85`;
its four focused cases and the eleven existing Rekor cases pass. The shared
Rekor v1 source was restored byte-for-byte after an additive-export provenance
break was detected: the 52,389-byte frozen source is
`sha256:e1594a7ba04ef4ecb55a0b65ecbfafb764ad959baa93c5d38360a324532b627f`
again. The strict primitive surface was reissued as the explicitly linked
61,510-byte `outsider-network-lifecycle-rekor-anchor-v2.js` descendant,
`sha256:d573b64d4cc2d61a763a42c0933d60bdaafcfb52bf70a14076ba1a5c8f71d5f8`;
the effect-head transport imports that descendant. No frozen v1 bytes or prior
occurrence were rewritten.
Even a verified inclusion remains `HOLD`: without checkpoint consistency and
independent monitors it does not establish non-omission, non-equivocation,
durable append-only history, authority, or outcome truth. The exact v1 public
write was subsequently authorized for the Cloudflare episode commitment
`sha256:45f4f3587174189ed41a2a8506b0c0e4fbb391d44f24103e713db18c44fef26f`.
The runner made exactly one POST with no automatic retry, then returned a
transport-failed-or-timed-out result. The occurrence is frozen as
`COMMIT_UNKNOWN / HOLD`: it is neither counted as an inclusion nor treated as
safe to resubmit. The v1 runner had failed to durably publish the exact proposal,
signature, and public key before the network effect and collapsed the inner
failure class at its outer boundary. Consequently the retained public key and
commitment are insufficient to prove that an exact v1 search result is the
attempted entry. The failed occurrence must not be repaired in place or retried
blindly; reconciliation and forward publication are versioned descendants.

The live occurrence is retained under
`artifacts/rekor-durable-effect-head-reality-episode-20260903-v1/`. Its private
`episode-evidence.json` is 3,431 bytes, mode `0600`, SHA-256
`1dbab37d7255990b913cfed39eb99bdacb9dee7b046883a9267b6eff05d9a88a`;
the 267-byte privacy-closed replay line is mode `0600`, SHA-256
`cb22f928bef100dd7d2ea07ad6d7e76f76023e7dff4d21ba0912ad3b6774705f`;
and the retained 178-byte public key is mode `0600`, SHA-256
`dce5ef715502ec9f3cdfd11f8cc384b31a6141023d3e7595e9908a81cb6241bd`.
No external head, inclusion proof, capacity, authority, outcome truth, price,
guarantee, settlement, or payment was established.

Read-only production-source work then followed the protocol rather than a
hard-coded replacement. Sigstore's production TUF chain observed on
2026-09-03 was timestamp v773 -> snapshot v165 -> targets v14. The targets role
binds `signing_config_rekor_v2.v0.2.json` to exactly 1,230 bytes and SHA-256
`0f5f38554e29e770d4d5d6f0e1b51fcbf84f61dc6934530a09b7a901eaad5bee`.
That config selects `https://log2025-1.rekor.sigstore.dev`, Rekor major API v2,
operator `sigstore.dev`, active from 2026-01-01, under selector `ANY`, with the
legacy v1 service second. The exact official `@sigstore/tuf` 4.0.2 client is now
version-pinned so the forward bridge can refresh and authenticate those targets
from its embedded bootstrap rather than copying a founder-supplied endpoint.
A read-only GET to the selected `/api/v2/log/entries` surface reached the live
service and returned `501`, consistent with that surface being write-only; it
did not create an entry. Forward publication must use the v2
`hashedRekordRequestV002` protocol, at least a 20-second create timeout, a
write-ahead fsynced request/proposal/key/trust record, and synchronous durable
capture of the returned canonical body, inclusion proof, and checkpoint bundle.
This TUF route fact is infrastructure provenance only. It creates no permission
to publish a different payload and no authority, capacity, or outcome truth.

The frozen `outsider-sigstore-tuf-rekor-v2-route-acquisition-v1.js`
acquisition retained the two target files but not the exact bootstrap and
root/timestamp/snapshot/targets bytes needed to replay its role-chain claim
offline. That acquisition-provenance gap cannot be repaired by editing the v1
source, manifest, or prior append-only history in place. The explicit
`outsider-sigstore-tuf-rekor-v2-route-acquisition-v2.js` descendant therefore
preserves v1 and records the supersession. Its private artifact is retained at
`artifacts/sigstore-tuf-rekor-v2-route-acquisition-20260903-v2/`; it replays the
exact bootstrap root v14 -> root v15, timestamp v773, snapshot v165, targets
v14, and exactly two target files. The selected route hash is
`sha256:3a8345b9bf79b6981be3f60b05f5f2b35a34a9d2c7c1370227eb5bd37e517c2f`,
the role-chain verification hash is
`sha256:4fbf59dc8edfe36cfb69b874ee6c31a88fc78adfddba1f651e42fa3319e8f5b9`,
and the `manifest.json` file hash is
`sha256:c38940264ba78ad923a54d872bb10d86974ea286aa82dd58508f820e6822fc4c`.
Every retained file is mode `0600` and every artifact directory is mode `0700`.
A separately run focused subset passed 11/11; this was not the full test suite.
The offline replay is isolated from live client and cache state, but it uses the
same `tuf-js@4.1.0` cryptographic implementation, not an independent crypto
implementation. No Rekor POST or payment occurred.

`outsider-rekor-durable-effect-head-transport-v2.js` is the versioned forward
repair, superseding but not modifying the frozen v1 transport. It consumes
caller-pinned exact SigningConfig and TrustedRoot bytes plus a separately
cryptographically verified production-TUF selection report; accepts arbitrary
target names; selects an active highest-supported API-v2 service under the
published selector; and cross-binds the production v0.1 TrustedRoot Ed25519
checkpoint key and full C2SP key identifier. Before its single POST it fsyncs
the exact publication request, signed proposal, canonical log entry/leaf,
operator public key, target pins, selected service, and TUF role-chain
verification hash. It then fsyncs the response and verified inclusion/checkpoint
bundle before acknowledging. A timeout or lost body becomes `COMMIT_UNKNOWN`
and can never trigger a second POST. Because Rekor v2 has no online search API,
the journal emits an exact leaf/tile-monitor query and accepts only a separately
obtained matching TransparencyLogEntry for offline reconciliation; absence from
a bounded scan proves nothing. The 41,619-byte source is
`sha256:0da21534434245b8ef6a6aee057963b9e7ac0a32571b9458bb5e8a7b76bf8ab1`.
The 9,804-byte `run-rekor-durable-effect-head-publication-v2.mjs` runner is
`sha256:1f61ac03f380aaeb8f4918d0e035e54e6e400d454dd1dd1295bfb09a0a9bafb5`
and fails before journal creation or network access when the exact production
TUF report is absent. Twenty focused and v1-adjacent cases pass. No v2 live
write has occurred, and no retry of the ambiguous v1 occurrence is permitted.

`outsider-pinned-public-https-one-use-post-transport-v1.js` adds the missing
write-side network primitive without weakening the frozen read transport. Its
8,305-byte source is
`sha256:c620e94a72f64f4b583123153269da0266efedcdb62ba8e0654c7e35dff55e5c`.
The capability is consumed before validation or I/O, permits one POST of exact
canonical JSON bytes, sends no credential/cookie, follows no redirect, retries
nothing, bounds both directions, validates every DNS answer as public, pins one
answer into TLS, and replays the certificate hostname and socket address. Its
three focused cases pass.

The first generic Globalping witness-node occurrence now reaches a real external
execution interface without creating a service-company fallback. The frozen v1
candidate sent exactly one unauthenticated one-probe POST, but serialized the
optional `measurementOptions.request.query` as an empty string. Globalping
returned HTTP 400 with the source-declared error that this field may not be
empty. That occurrence remains frozen under
`artifacts/globalping-http-witness-live-candidate-20260904-v1/`: its source is
`sha256:7f3c56970f997133f5acf43250672b9ffead832b34e6dc085eabfee0f76ebf7d`,
input is
`sha256:cdd547d55a060e104c1c5aab0da65cb8e601ae2db89d891e78d0fb9763aeb921`,
internal manifest is
`sha256:04c1ffcf8577b76f3e5f0b173bcfa4f8ed854d5d897180e809b7b067e655fe45`,
and the 337-byte response body is
`sha256:84d0b6c00b56df6af538b1fd15f4f1936cb01e62591a5eb4f6d7108939500be6`.
It was not retried or rewritten. The additive v2 source omits the query member
for a no-query URL and carries explicit v1 source/input/manifest/response
lineage; the separate 2,616-byte supersession record is mode `0600`, SHA-256
`8c5eff80f03ff48ad20e288c6ff1dbc9740f3a439fe318ccd43aea28bb088956`.

The v2 candidate then made exactly one POST and received HTTP 202, consumed one
anonymous free-quota unit and zero paid credits, followed the returned exact ID
with exactly two GETs, and observed one finished probe reporting HTTP 200, TLS
authorization, and 493 ms total time. Its final disposition is
`SOURCE_DECLARED_REQUIREMENT_MATCH_HOLD`. The 5,648-byte manifest has internal
hash
`sha256:c1e938de2531d63de1d2ea29bdad09a00e9a88a7672553ffe38ccc7f7c332b3e`
and file hash
`sha256:533cd871caddee663f50da603f8dc832f4ed0a8d0fb18c830055497e0075b4b2`;
the 6,409-byte projection has internal hash
`sha256:d541275a11a0892c9cefc70186416949b7c8e048e1f5f09e1fb8f5043aef81b1`
and file hash
`sha256:b130418587575dbdbca63c146f555052329a06e46ff4fa2e053dc4563b814488`.
The replayed private journal contains 13 records and 21,098 bytes with head
`sha256:056107d72ec3b807fcd92f6b5ee602947aedd377c5f370b9dd9c5c65f3afcd12`;
the replayed one-use ledger contains four entries and 8,579 bytes with head
`sha256:5ee0ca09c6f89ce56cf6925bec37072a0778117d713115285e1a83aae8a792af`.

This is only a
`THIRD_PARTY_SOURCE_DECLARED_HTTP_OBSERVATION_OCCURRENCE`. It establishes no
witness-owner independence, outcome truth, authority, capacity, or `COMMIT`, and
cannot be relabelled as an independent instrument result after the fact. The
next gate is prospective: bind an exact typed Tender and Attempt, then obtain a
witness-owner reservation before action, followed by its signed result and
relationship/lifecycle replay. Until those sources exist, any future bridge
must remain hash-only, privacy-safe, and `UNBOUND_SOURCE_DECLARATION_HOLD`.

That minimal bridge now exists without modifying the frozen Globalping run.
`outsider-globalping-witness-observation-bridge-v1.js` is 38,983 bytes,
`sha256:597ecf8b0ba6d60e666b0a5275a98fbcff9129c5c9ef51cc6df39c6516297515`;
its 9,725-byte source test is
`sha256:2de522dbecec3ba9d8f1c1e3a420ad3d83feb26df73390601e1a52553d30bd4e`,
the 4,046-byte runner test is
`sha256:ad60cce19139d2335d46cd1064e2462974a6b2ecb9cefd6bd93744ec70fee7a1`,
and the 9,391-byte runner is
`sha256:16d9c109977caf161666c21c173c1cc0d392aa9949bca77412de15d967c9fe0f`.
Its focused set passes 6/6. The private artifact directory and publication
directory are mode `0700`; the 1,245-byte `config.json` is mode `0600`, SHA-256
`ceda98fa992cf114daea2dca9ea83e193b6dc788bc1f524a7a976b69eff4fbd6`,
and the 6,558-byte `published/bridge.json` is mode `0600`, SHA-256
`4527cc5e56cb231325223834798972f857e7234aa3fd2c69f671858f385db6af`.
The bridge replays the exact source files, journal and ledger without network
I/O; its internal `sourceBindingHash` is
`sha256:6ed763f71d24c46ec34815ea03fe36cff9df5b6707023f682ed726bdc858b4a3`
and `bridgeHash` is
`sha256:a60614fd6392c8a7a0929c598c487aaef88506e05113bfea3bcb29206fb2972e`.
The source measurement ID remains only in the original `0600` raw journal and
does not leak into config or bridge projection. The record is strictly
`EXTERNAL_OBSERVATION_SOURCE_CANDIDATE_HOLD` with disposition
`CONTINUE_AUTOMATED_FORMATION_HOLD`, `C_enabled=0`, proven authority count `0`,
and no owner mandate, Tender binding, witness-owner signature, or prospective
witness reservation. It therefore closes only the hash-bound source-candidate
seam, not independence, truth, authority, capacity, or commitment.

The full wiring test first froze the precise remaining seam instead of bypassing
it: two unrelated node kinds issued generic opaque origin leases and read a
pinned `/.well-known/outsider` descriptor, while the resulting v2 endpoint lease
correctly said `invocationPermittedByThisLease:false`. The new 10,687-byte
`outsider-opaque-order-scoped-one-use-tender-invocation-v1.js`
(`sha256:7b0a3d066457ae3b950b28c7d69498d09dd8cb051703e67b1c48874520ee0fdf`)
now closes that software seam without materializing the URL into the coordinator.
It consumes the module-issued endpoint internally, requires a separate exact
order/body-bound requester contact/delegation capability, appends durable
`INTENT_ADMITTED -> SUBMIT_RESERVED -> SUBMIT_ATTEMPTED` before network I/O,
then uses the one-use POST transport. A 2xx response must contain the existing
five-source seller lifecycle bundle and survive the existing external lifecycle
verifier before the receipt is appended. A fresh process pointed at the same
durable history performs zero second POSTs. Seven focused and adjacent cases,
including the complete generic-origin -> well-known -> contact grant -> durable
POST -> seller endpoint/emitter -> five-source replay path, pass. The descriptor
and requester contact grant still do not create seller authority, real capacity,
or outcome truth; the result remains `HOLD / NONE`.

The next paired gates are therefore deliberately external and architectural:

1. Discover a seller-controlled machine-use declaration from the seller's own
   origin, then deliver one exact one-use tender to its declared endpoint. A
   directory result, product listing, email delivery or HTTP acknowledgement is
   insufficient.
2. Replay a signed external `OFFERED` lifecycle through the current verifier and
   obtain a separate source for resource-owner authority plus a real reservation.
3. Form primary, recovery and independent-witness routes for the same tender;
   close them atomically or return `DECLINE_NOT_HUMAN_QUEUE` at the formation
   deadline.
4. Publish every local durable head to an independently operated, append-only,
   non-equivocating external log. Until such a log and its identity policy are
   real, local filesystem rollback and parallel-genesis risk remain explicit.
5. Inject those exact adapters into the common coordinator and run the same
   state machine over at least three unrelated outcome domains. Domain-specific
   code may compile contracts and interfaces, but may not decide authority or
   commitment.

Primary references: [ITU Facts and Figures 2025](https://www.itu.int/itu-d/reports/statistics/2025/10/15/ff25-internet-use/),
[ITU methodology](https://www.itu.int/itu-d/reports/statistics/2025/10/15/ff25-methodology/),
[GSMA State of Mobile Internet Connectivity 2025](https://www.gsma.com/somic/overview-report/),
[World Bank Global Findex 2025](https://www.worldbank.org/en/publication/globalfindex/report),
[Cloudflare Radar 2025](https://blog.cloudflare.com/radar-2025-year-in-review/),
[Apple App Intents](https://developer.apple.com/documentation/appintents),
[Android AppFunctions](https://developer.android.com/ai/appfunctions),
[DNS-SD RFC 6763](https://www.rfc-editor.org/info/rfc6763/),
[WebFinger RFC 7033](https://www.rfc-editor.org/info/rfc7033/),
[Well-Known URIs RFC 8615](https://www.rfc-editor.org/info/rfc8615/),
[OpenAPI 3.2.0](https://spec.openapis.org/oas/v3.2.0.html),
[ActivityPub](https://www.w3.org/TR/activitypub/), and
[MCP architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture),
the [MCP Registry aggregator API](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/registry-aggregators.mdx),
[WordPress distributed REST API](https://developer.wordpress.org/rest-api/reference/),
[WordPress API discovery](https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/),
[WooCommerce Store API](https://developer.woocommerce.com/docs/apis/store-api/),
and [WooCommerce Products API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products/).

### Horizontal fallback transaction substrate: user-held email

Email is selected only as the first broadly available transport for resources
whose ordinary transaction surface has no suitable official API. It must be
implemented as an adapter, not as core logic and not as a meeting-specific
workflow.

- The user must control the sending account and the authority to use it.
- OAuth tokens and message bodies must remain in a user-controlled broker or
  private execution boundary. Network projections contain typed facts and a
  context-salted aggregate commitment, not individual recipient, thread,
  message, source-system, key, or source-reference handles.
- The adapter binds exact tender hash, recipient resource identity, owner
  mandate, nonce, expiry, requested acceptance fields, and reply source.
- A delivery status, read receipt, autoreply, quoted text, or unstructured
  positive language does not equal acceptance.
- A future externally valid response must explicitly accept the bound work,
  time, scope, responsibility, commercial terms, and capacity and must survive
  lifecycle and owner replay. The current strict grammar only corroborates a
  supplied source declaration and establishes none of those external facts.
- The same adapter can support unrelated order families. No schema field may
  encode professor, meeting, calendar, or room-booking assumptions.

### Target user-visible behavior after `C_4 ∧ R_4`

After confirming the tender, the user can leave. Outsider searches permitted
surfaces in parallel and reports source-qualified progress. The user does not
watch provider outreach or coordinate replies. Before the deadline an
incomplete order is `CONTINUE_AUTOMATED_FORMATION_HOLD`; at the deadline it
becomes either `ATOMIC_COMMIT` or `DECLINE_NOT_HUMAN_QUEUE`.
There is no partial promise, human escalation, or manual override.

Current code does not yet search for or contact a real task supplier, reserve,
schedule, or commit. It can deliver one tender body to one fixed consenting loopback test
endpoint, recover a dropped response after restart by status-only
reconciliation, and create/read back one synthetic object at a fixed
independently operated public test API. It has also completed one authenticated
Cloudflare Workers KV create/write/read/delete lifecycle through a user-held
account. That proves a real provider control-plane path but is not a
task-supplier transaction. `C_4` remains unmet because there is no admitted
user-controlled real transaction-surface driver, trusted time, independently
complete occurrence/staff denominator, or three-domain injected end-to-end
state machine. `R_4` remains unmet because no real owner authority, provider
capacity, independent witness/recovery capacity, lawful transaction/payment
path, or external trust head has been established.

### Code exit `C_4`

- The full state machine passes through injected transports, durable restarts,
  and deterministic replay.
- Adversarial coverage includes source splicing, owner mismatch, standing-byte
  mismatch, typed-graph mismatch, replay, nonce collision, concurrent replies,
  duplicate occurrences, late acceptance, cancellation, revocation, primary
  failure, witness collapse, and recovery exhaustion.
- At least three unrelated outcome domains use the same coordinator and differ
  only through typed contracts and adapters.
- Outsider staff touches in all successful cases equal exactly `0`.
- No test fixture, caller Boolean, server ACK, or vendor claim can make external
  trust, authority, current capacity, or outcome truth true.

### Reality exit `R_4`

- Selected transaction surfaces contractually and technically permit the
  automated use performed by the adapter.
- A real provider gives a source-replayable one-use acceptance for the exact
  tender.
- The actual external owner source establishes current authority and identity
  for that resource and tender.
- Primary, recovery, and independent-witness reservations are real, current,
  mutually compatible, and valid through the required windows.
- Contact lists, scraped directories, vendor marketing claims, and caller
  declarations do not count.

### Metrics

- Goal-to-tender compilation time.
- Time to first valid response and time to atomic formation.
- One-use acceptance, reservation, and complete-formation rates.
- Formation-deadline decline rate and reason distribution.
- Outsider staff touches per order; hard target `0`.
- False outcome promises; hard target `0`.

### Stop conditions

- Decline if any mandatory primary, recovery, witness, owner, legal, or
  consequence gate is absent or stale.
- Decline if any essential fact is only a claim, caller Boolean, or local
  fixture.
- Fail the formation if Outsider staff touches the order.
- Ignore or record, but never resurrect from, a response received after the
  deadline or revocation.

### Dependencies

Gates 0–3.

## Gate 5 — Authorized execution and a first complete reality episode

### Objective

Admit an action only through independently proven authority and an exclusive
write path, bind every command to its effect and Attempt, automatically recover
inside the committed envelope, and close the order only from independent
evidence and accepted obligation resolution.

### Existing modules

- `src/outsider-action-admission.js`
- `src/outsider-action-obligation-hold-composition.js`
- `src/outsider-owner-write-gate-conformance.js`
- `src/outsider-autonomous-work-order-lifecycle-broker-contract-v1.js`
- `src/outsider-network-outcome-witness.js`
- `src/outsider-network-complete-episode.js`
- Episode/Attempt-set replay and external-head modules
- `src/outsider-network-first-governed-reality-episode-v2.js`

### Engineering deliverables

- An independent authority verifier with owner identity, delegation scope,
  expiry, revocation freshness, and affected-party checks.
- A production owner write gate that is the exclusive path for the exact
  capability, plus evidence that bypass routes are excluded.
- An operating-system or platform lifecycle broker for pause, resume, cancel,
  revoke, and crash recovery.
- A user-controlled secret broker, adapter sandbox, and least-privilege one-use
  action tokens.
- Command-to-effect receipts bound to Episode and exact Attempt.
- Automated recovery triggers, route switching, reauthorization on scope
  expansion, and bounded termination.
- Independent measurement whose controller and incentives do not collapse into
  the executor or vendor claim source.
- A complete Attempt denominator covering starts, refusals, retries, aborts,
  failures, recoveries, and completions, committed to an external durable head.
- External obligation closure, challenge, correction, and adjudication replay.

### User-visible behavior

The product says `COMMITTED` only after the entire Gate 4 conjunction and live
authority pass. It requests reauthorization only when scope expands. It pauses,
revokes, or activates recovery automatically; it never sends the user to an
Outsider service queue. After valid closure the temporary resource network
dissolves, but the order history and any open duties remain.

### Code exit `C_5`

- Each action token is single-use, exact-scope, expiring, and revoked within the
  specified SLO.
- Known bypass paths are blocked and continuously tested; successful bypass
  count target `0`.
- Every action command has an exact effect or explicit no-effect observation and
  an Attempt binding; completeness target `100%`.
- Property and adversarial tests preserve `C_enabled ⊆ A_proven` and both
  consequence-reach relations.
- Network dissolution cannot remove open obligations, evidence, challenges, or
  Attempt history.

### Reality exit `R_5`

- Real owners, authority sources, executors, independent witnesses, and
  recovery resources adopt the exact candidate path.
- The owner actually makes the governed write gate exclusive and revocation is
  externally observable within the required window.
- A real effect is attempted and independently observed.
- A real recovery path is either exercised or remains verifiably reserved
  through valid completion, according to preregistered criteria.
- Every Attempt is durably externally headed and all obligations receive valid
  external closure or remain visibly open.

### First Governed Reality Episode rule

The first complete episode certifies only the network path used for that exact
episode. It is not the product, broad outcome coverage, a reliability rate, an
insurance basis, or evidence that other domains are enabled.

Select the first episode by machine-accessible transaction and authority
surfaces, reversible and bounded consequence, independent measurability, and an
automatic recovery path. Do not hardcode a meeting, Wi-Fi installation, or any
other example domain into the platform.

### Metrics

- Wrongful external effects and successful bypasses; hard targets `0`.
- Outsider staff touches per order; hard target `0`.
- Command-to-effect and Attempt-denominator completeness.
- Revocation latency and stale-authority rejection.
- Recovery trigger latency, recovery success, and bounded termination.
- Independent-evidence coverage through obligation closure.

### Stop conditions

- Vendor claims, model rewards, transport acknowledgements, or the executing
  controller's own success bit cannot close the result.
- A nominally separate witness under the same controller does not satisfy
  independence.
- Any omitted Attempt, bypass, stale authority, consequence-envelope expansion,
  or Outsider staff touch blocks certification.

### Dependencies

Gates 0–4.

## Gate 6 — Order-produced network growth and source discovery

### Objective

Make network coverage a byproduct of successfully formed orders, not the output
of a business-development team. Reuse verified transaction routes and accept
separate standing grants without owning or silently enrolling resources.

### Existing modules and systems

- Standing invitation, grant, expiry, and revocation primitives in
  `src/outsider-one-use-commitments-v1.js`
- `src/outsider-resource-owner-standing-trust-replay-v1.js`
- `src/outsider-episode-data-engine.js`
- `src/outsider-episode-data-source-ledger.js`
- `src/outsider-episode-data-public-source-catalog.js`
- `src/outsider-episode-data-engine-public-source-binding.js`
- `src/outsider-reality-source-scout.js`

### Growth paths

1. For a first order, acquire resources through permitted transaction surfaces
   that already accept business from the resource owner or public.
2. After valid fulfillment, automatically ask whether the resource owner wants
   to expose bounded future capacity.
3. Only a separate explicit acceptance creates a revocable, expiring standing
   grant with exact scope, capacity, responsibility, and commercial terms.
4. Later orders may reuse the verified route or standing capacity while still
   creating a new one-tender/one-network composition.

### Engineering deliverables

- A strict standing lifecycle separated from invitation and prior completion.
- Route-quality memory based on source-replayed facts, never a global provider
  score or opaque identity inference.
- Discovery adapters routed through Episode Data Engine semantics when public
  official sources are used.
- Admission only for revision-pinned, rights/privacy-reviewed bounded slices.
- Private raw files mode `0600`; raw data never enters network projections.
- Adapter deduplication by source semantics and revision, while occurrence
  census remains complete.
- Anchor-node and outcome-family coverage reporting instead of row-volume
  targets.

### User-visible behavior

The first order in a route family may form more slowly. Repeated orders can form
faster as verified routes and explicit standing grants accumulate. The user
never sees a provider-onboarding marketplace, and a provider can continue to
accept one-use work without joining anything.

### Code exit `C_6`

- Invitation, opt-in, grant, use, revoke, expire, and re-invite are distinct,
  replayable events.
- Completion cannot auto-enroll a resource or imply acceptance.
- Revocation removes standing eligibility without erasing prior order history.
- Public-source acquisition is bounded, revision-pinned, rights/privacy gated,
  no-clobber, and excluded from action promotion.
- Route reuse never creates cross-tender network persistence.

### Reality exit `R_6`

- At least one real external owner independently opts into bounded standing
  after a completed order and can revoke it through the supported path.
- Formation latency improves on later eligible orders without Outsider outreach
  or staff involvement.
- Source rights and provider transaction terms permit the continuing use.

### Metrics

- First-use versus standing-capacity formation ratio.
- Standing invitation, explicit opt-in, expiration, and revocation rates.
- Revocation propagation latency.
- Formation-latency change for verified repeat routes.
- Adopted owners and anchor nodes by outcome family and region.
- Outsider manual outreach contribution to resource-supply coverage; hard
  target `0` for both per-order formation and product coverage growth. Track
  separately any human work needed to establish shared anchor infrastructure or
  operator adoption; it never counts as available resource coverage.

### Stop conditions

- An invitation is never an acceptance; fulfillment is never auto-enrollment.
- Stop if any Outsider manual outreach is needed to claim resource-supply
  coverage. Manually established anchor infrastructure may test conformance but
  may not masquerade as discovered resource availability.
- Public metadata, provider popularity, or a route history never mints current
  authority or capacity.

### Dependencies

A real Gate 5 path is required before post-fulfillment standing can be proven.
Episode Data Engine research may proceed earlier, but it cannot enable action.

## Gate 7 — Source-replayed offline acquisition ranking

### Objective

Use research only to rank which missing evidence, review, or recovery source to
acquire next. The research path must remain outcome-blind where required and
must never become an authority or action path.

### Existing modules and pilots

- `src/outsider-episode-data-engine.js`
- `src/outsider-stale-constraint-episodes.js`
- `src/outsider-cua-verifier-bench.js`
- `src/outsider-reboot-recovery-pilot.js`
- source-specific acquisition and replay adapters

### Engineering deliverables

- Source-replayed offline episodes only; no live-order experimentation through
  the research path.
- A fixed, group-disjoint holdout with published split-root hashes.
- An explicit baseline and preregistered promotion thresholds.
- A separately sampled, outcome-blind random audit reserve.
- Rankings limited to gap acquisition, review acquisition, and recovery-source
  acquisition.
- Exact reporting of source revisions, bytes, Episode and frame counts, split
  roots, baseline/candidate metrics, admissions, rejections, and hashes.

### User-visible behavior

None directly. This gate may improve which evidence route the formation engine
tries first, but it cannot change a user's authority, promise, price, credit,
or action permissions.

### Code exit `C_7`

- Group-disjoint split construction and split-root replay pass deterministically.
- Baseline and candidate are evaluated on the same frozen holdout.
- The random audit reserve remains unavailable to acquisition scoring.
- Leakage, pseudo-label, vendor-claim, and model-reward promotion tests fail
  closed.
- Every output remains research-only and ineligible for governed training,
  deployment, actor credit, CEU, pricing, guarantee, settlement, or action.

### Reality exit `R_7`

There is intentionally no live-authority exit. A research promotion requires a
preregistered, statistically and operationally meaningful improvement on real,
source-replayed held-out episodes, plus acceptable random-audit behavior. This
establishes only acquisition-ranking usefulness.

### Metrics

- Preregistered improvement over the fixed baseline.
- Group leakage count; target `0`.
- Random-audit capture and false-green rates.
- Calibration, review yield, and recovery-source acquisition yield.
- Exact episode, frame, group, and source denominators.

### Stop conditions

- If the experiment is infeasible or does not improve, return
  `KEEP_BASELINE`.
- Pseudo-labels, vendor claims, model rewards, and server acknowledgements are
  forbidden as independent outcome labels.
- Research promotion never authorizes governed training, deployment, actor
  credit, CEU, PRICE, GUARANTEE, SETTLE, or action.

### Dependencies

Gates 0 and 3 plus source-replayed episode data. Gate 7 is not a dependency that
can replace Gate 4 or Gate 5 reality facts.

## Gate 8 — PRICE, GUARANTEE, and SETTLE, last

### Objective

Add binding economics only after real complete episodes, external owner
adoption, legal authority, capital or custody, adjudication, and longitudinal
evidence exist for the exact order class.

### Existing HOLD-only and shadow modules

- `src/outsider-stage2-quote-frontier.js`
- `src/outsider-stage2-current-chain-admission.js`
- `src/outsider-actuarial-mechanism-shadow.js`
- `src/outsider-actuarial-model-evolution.js`
- `src/outsider-stage3-guarantee-gate.js`
- `src/outsider-stage34-authority-frontier.js`
- `src/outsider-stage4-claims-lifecycle-frontier.js`

These structures are not evidence that Outsider can quote, guarantee, insure,
hold funds, adjudicate, or settle a live order.

### Required order

1. **PRICE** requires real, target-domain, pre-action, longitudinally complete
   episodes; preregistered calibration; an external holdout; and legal pricing
   authority.
2. **GUARANTEE** requires an enforceable owner or issuer contract, bounded
   liability, verified capital or reserve, exclusions, expiry, and applicable
   regulatory authority.
3. **SETTLE** requires lawful custody and payment rails, an accepted adjudicator,
   challenge and claims procedures, recovery evidence, and valid obligation
   closure.

### Engineering deliverables

- Exact typed separation of provider commercial terms, Outsider price, provider
  commitment, provider reserve/deposit, Outsider capital, and licensed-insurer
  coverage.
- Per-order and aggregate exposure limits with no promoted global score.
- Source-replayed capital, custody, policy, claim, adjudication, and settlement
  receipts.
- Challenge, correction, appeal, shortfall, and unresolved-obligation states.
- Labels that remain `NON_BINDING_ABSTAIN` or `HOLD` until every applicable
  external gate passes.

### User-visible behavior

Before Gate 8 completion, the product shows no binding Outsider price,
compensation promise, guarantee, insurance claim, custody claim, or settlement.
Any supplier-provided commercial term is labeled as that supplier's term, not
an Outsider promise.

### Code exit `C_8`

- Price, capital, custody, issuer, claim, adjudication, and settlement authority
  are non-convertible typed facts.
- Missing, expired, disputed, or incomparable facts produce abstention.
- Aggregate and per-order bounds survive concurrency, cancellation, recovery,
  and claim replay.
- No payment or provider success report can close a reality obligation by
  itself.

### Reality exit `R_8`

- Sufficient real complete episodes exist for the exact priced outcome class
  and pass preregistered longitudinal calibration and external holdout review.
- The relevant owners and issuers have adopted enforceable contracts.
- Capital or reserve is verified and legally available for the exact promise.
- Licensed custody/payment rails and accepted adjudication exist where required.
- Claims, challenge, recovery, and settlement can be independently replayed to
  valid closure.

### Metrics

- Calibration error, coverage, and held-out credibility by exact outcome class.
- Per-order and aggregate capital coverage.
- Claim incidence, challenge, adjudication, recovery, and settlement integrity.
- Shortfall, stale-authority, and unresolved-obligation rates.

### Stop conditions

Missing real episodes, external owner adoption, pricing or issuer authority,
capital, custody, adjudication, or longitudinal evidence requires
`NON_BINDING_ABSTAIN` or `HOLD`. No earlier gate, high model confidence, or
commercial pressure may bypass this rule.

### Dependencies

All relevant `C_0…C_7` and `R_0…R_6` gates, longitudinal real evidence, and the
additional economic authorities in this section.

## Cross-gate dependency and enablement ledger

| Capability | Minimum code exits | Minimum reality exits | Default before both |
| --- | --- | --- | --- |
| Show normalized result specification | `C_0`, `C_1` | User confirmation for exact private tender | `HOLD` |
| Accept quarantined external reports | `C_0…C_3` | Source rights and adopted reporting endpoint | `QUARANTINED` |
| Form a temporary resource network | `C_0…C_4` | `R_0…R_4` for exact tender | `CONTINUE_AUTOMATED_FORMATION_HOLD`, then `DECLINE_NOT_HUMAN_QUEUE` at the deadline |
| Enable one exact external action | `C_0…C_5` | `R_0…R_5` for exact capability and time | `HOLD` |
| Reuse explicit standing capacity | `C_0…C_6` | Real grant, current capacity, and fresh authority | One-use discovery only |
| Promote acquisition ranking | `C_0`, `C_3`, `C_7` | Held-out research improvement only | `KEEP_BASELINE` |
| Bind PRICE | `C_0…C_8` | Exact-class pricing evidence and authority | `NON_BINDING_ABSTAIN` |
| Bind GUARANTEE | `C_0…C_8` | Enforceable issuer, bounded liability, verified capital | `HOLD` |
| SETTLE | `C_0…C_8` | Lawful custody, adjudication, claims, and valid closure | `HOLD` |

## Ninety-day execution sequence

The sequence advances code while keeping live capabilities HOLD-only until their
external exits are satisfied. Day numbers are elapsed project days, not promises
of real-world completion.

### Days 0–15 — Repair and freeze the foundation

Primary gates: 0–1, plus the narrow Gate 4 owner-replay seam.

Deliverables:

- Run the full source/provenance audit before modifying formation code; issue
  descendants and supersession links for any broken frozen dependency.
- Publish the machine-readable invariant source as the sole normative input to
  conformance tests; assert this document does not diverge from it.
- Inventory every current formation source, schema, pin, lifecycle, test, and
  external-fact gap.
- **IMPLEMENTED_SOURCE_REPLAY_ONLY:** require an exact owner-standing
  `source + expectedPin` for every v2 transaction slot and cross-bind it to the
  full graph. An absent source cannot form that slot and cannot commit.
- Specify intent normalization, decidability, private confirmation, and tender
  supersession artifacts.
- Define threat models for source splicing, late reply, owner mismatch, nonce
  reuse, secret leakage, staff intervention, and transport spoofing.
- Define user-held email as a horizontal transport adapter and secret-boundary
  candidate; perform no live sending in this interval.

Decision review on Day 15:

- Proceed only if provenance is replayable, frozen artifacts are intact, the
  typed graph is unchanged, and no proposed interface can mint trust from a
  caller record.
- Otherwise remain at Gate 0 and publish exact blockers.

### Days 16–30 — Complete contracts and injected coordination

Primary gates: 1–4 code paths.

Deliverables:

- Implement the four anchor-node conformance profiles and exact external-pin
  provenance types.
- **IMPLEMENTED_CONFORMANCE_OR_REPLAY_ONLY:** transaction-surface adapter
  contract and pure route-collector boundary.
- **IMPLEMENTED_PURE_COMPOSITION_ONLY:** temporary-network coordinator with an
  exact primary/recovery/independent-witness slot bijection; no branch is
  invoked by current code.
- **IMPLEMENTED_CALLER_SOURCE_REPLAY_ONLY:** nonce, idempotency, deadline,
  expiry, cancellation, revocation, and terminal staff-touch state. Durable
  storage, trusted time, and external completeness remain missing.
- **IMPLEMENTED_SOURCE_REPLAY_ONLY:** owner-replay bridge and exact
  response/standing/owner/tender/graph cross-bindings.
- Add positive and adversarial fixtures for at least three unrelated domains.

Decision review on Day 30:

- `C_1`, relevant `C_2`, and the pure coordinator portion of `C_4` must pass.
- All external trust, capacity, authority, action, and money flags remain false.

### Days 31–45 — Exercise transaction surfaces in bounded shadow mode

Primary gates: 2–4. No outcome promise, real provider contact, or outcome
action exists in this shadow-and-controlled-test slice. One fixed public test
API has now been mutated and read back with synthetic data; it is not a provider
or owner surface. Any real transaction-surface effect still requires every
separately listed admission gate below.

Deliverables:

- **PARTIAL_SHADOW_ONLY:** the first user-held email driver can append one
  replay-valid lifecycle to a module-private in-memory spool under a
  module-issued capability. It accepts no credentials, paths, arbitrary URLs,
  generic browser session, callback, or provider-contact surface. The shadow
  formation runner now composes primary, recovery, and independent-witness
  branches with exact pre-effect replay, one-use uniqueness, complete aggregate
  occurrence accounting, and explicit non-atomic partial-effect history.
  **PARTIAL_CONTROLLED_TEST_ENDPOINT_ONLY:** a signed consent grant, durable
  one-use effect ledger, and fixed loopback outbox now add one bounded HTTP
  delivery with attempted-before-POST persistence and status-only crash
  reconciliation. A fixed public-sandbox pilot additionally proves one actual
  third-party internet create/read-back with no retry and no real tender data.
  Bodies and credentials remain outside projections.
  **REMAINING:** connect the boundary to the first user-controlled, permitted
  transaction surface and then additional official API, marketplace,
  reservation, one-time response-page, and user-held email adapters. No step
  creates a provider registry or an Outsider human fallback queue.
- Implement at least one non-email official API or marketplace adapter to prove
  transport independence.
- Exercise delivery, reply parsing, explicit acceptance fields, cancellation,
  deadline, and revocation with consenting test counterparties or controlled
  endpoints.
- Stand up quarantine occurrence/object separation, lifecycle replay, operator
  export, and an external-head outbox in non-authorizing mode.
- Measure formation timing and decline behavior with injected and permitted
  shadow transports.

Any later bounded external I/O requires exact user-held authorization, a
source-specific endpoint and terms revision, a current credential lease,
rights/privacy clearance, one-use nonce, trusted time and action admission, a
complete retained occurrence census, and a consenting endpoint. Sending even a
tender email is an external effect; calling it “shadow” never waives these
gates.

Decision review on Day 45:

- Email-specific fields in core formation schemas must be `0`.
- Delivery or reply transport facts must not promote capacity or authority.
- Any need for Outsider staff to rescue a simulated order is recorded as a
  failed formation design and fixed before proceeding.

### Days 46–60 — Establish external owner, witness, and recovery pilots

Primary gates: 2–4 reality acquisition and Gate 3 external operation.

Deliverables:

- Obtain explicit pilot adoption from independently controlled resource-owner,
  executor, witness, and recovery endpoints.
- Acquire and replay real owner identity, registry, authority, lifecycle, and
  revocation sources for bounded candidate resources.
- Acquire exact one-use acceptances and reservation receipts through permitted
  transaction surfaces without Outsider manual intervention in the order.
- Operate quarantine export, rights/privacy replay, external-head submission,
  and two-observer consistency checks.
- Verify that the primary, recovery, and witness windows can coexist for at
  least one bounded candidate tender.

Manually recruited or controlled pilots can exercise code-level conformance,
but they do not satisfy `R_4` discovery or product coverage. `R_4` requires the
order itself to find resources through already-available, permitted transaction
surfaces with zero Outsider staff participation.

Decision review on Day 60:

- If `R_2`, `R_3`, or the relevant `R_4` facts are absent, do not manufacture a
  demo success. Keep it at `CONTINUE_AUTOMATED_FORMATION_HOLD` before the
  formation deadline, then emit `DECLINE_NOT_HUMAN_QUEUE` and report exact
  missing roles and sources.

### Days 61–75 — Prepare the exclusive governed action path

Primary gate: 5, code first and reality only if independently available.

Deliverables:

- Implement independent authority verification, production-grade one-use
  tokens, the owner write gate, bypass tests, lifecycle broker, and secret
  broker boundary.
- Implement command-to-effect receipts and complete Attempt census.
- Implement automatic pause, revoke, bounded recovery, route switching, and
  scope-expansion reauthorization.
- Integrate independent outcome/recovery witnesses and obligation closure with
  an externally durable head.
- Preregister the exact First Governed Reality Episode criteria, failure
  conditions, affected-party boundary, and recovery plan without selecting a
  domain for marketing convenience.

Decision review on Day 75:

- No real action unless `C_0…C_5` and the exact candidate's `R_0…R_4` are
  current and the prospective Gate 5 facts are independently observable.
- A bypass, stale revocation source, witness role collapse, or staff touch ends
  the candidate run.

### Days 76–90 — Attempt one bounded complete path or decline honestly

Primary gates: 5–6; Gate 7 may run offline. Gate 8 remains untouched.

Deliverables:

- If every prerequisite is current, attempt one bounded, reversible First
  Governed Reality Episode through the exact state machine.
- Record every start, refusal, retry, abort, failure, recovery, and completion
  as an Attempt; acquire independent outcome and recovery evidence.
- Close obligations only through the accepted source path, dissolve the
  temporary network, and retain the full durable history.
- Only after valid fulfillment, deliver a separate optional standing invitation
  and observe opt-in, no-response, revocation, or expiry without promotion.
- If any prerequisite is missing, remain
  `CONTINUE_AUTOMATED_FORMATION_HOLD` before the deadline and produce
  `DECLINE_NOT_HUMAN_QUEUE` at the deadline; publish the exact code/reality
  blocker ledger instead of adding staff.
- Admit only bounded, revision-pinned, rights/privacy-reviewed research slices
  to Episode Data Engine queues. Run Gate 7 only with a frozen group-disjoint
  holdout, explicit baseline, and outcome-blind random audit reserve.
- Do not implement or announce binding PRICE, GUARANTEE, or SETTLE.

Day 90 evidence package:

- Exact source URLs or source identifiers, revisions, acquired bytes, rights
  and privacy disposition, external operator roles, and lifecycle receipts.
- Episode, Attempt, occurrence, object, frame, and research-row denominators.
- Split roots and baseline/candidate metrics for any Gate 7 run.
- Admissions, rejections, deadlines, revocations, staff touches, and decline
  reasons.
- Canonical hashes, external-head receipts, open obligations, and supersession
  links.
- A gate ledger showing `C_i` and `R_i` separately. Unknown is not PASS.

## Operating metrics dashboard

The program should report these metrics without compressing them into a global
score:

| Metric family | Required measures | Hard boundary |
| --- | --- | --- |
| Formation | Compile P50/P95, first-response time, atomic-formation time, deadline declines | No manual rescue |
| Resource network | Primary/recovery/witness closure, one-use acceptance, standing opt-in/revoke | No owned or auto-enrolled supply |
| Human effort | Outsider discovery/contact/coordination/verification/recovery touches per order | Exactly `0` for a valid formation |
| Authority | Current owner mandates, scope matches, revocation freshness, bypass attempts | `C_enabled ⊆ A_proven` |
| Evidence | Command/effect bindings, Attempt and occurrence denominators, independent coverage | No omitted Attempt or ACK-as-truth |
| Recovery | Trigger latency, route-switch latency, success, bounded termination, open duties | Within committed consequence envelope |
| Provenance | Source/revision/bytes/hash coverage, rights state, supersession, anchor lag | No frozen overwrite |
| Network quality | Adopted anchor operators and complete role sets by outcome family | Never optimize random rows |
| Research | Frozen split roots, baseline delta, leakage, random-audit behavior | `KEEP_BASELINE` if no improvement |
| Economics | Real complete episodes, calibration, authority, capital, custody, adjudication | Deferred until Gate 8 reality exits |

## Program-level stop rules

The following conditions stop promotion immediately:

- A source-replay or provenance break.
- A silent edit to a frozen artifact or append-only record.
- Any attempt to identify a network individual by IP, device, base model, or a
  global score rather than the typed graph.
- A structural test, signature, vendor claim, model reward, pseudo-label, or
  server acknowledgement treated as authority or independent outcome truth.
- Occurrence loss caused by object deduplication.
- A current capacity, owner authority, or standing fact supplied only by the
  caller rather than replayed from the exact external source.
- An Outsider employee manually discovering, contacting, coordinating,
  verifying, or recovering a live order.
- An incomplete atomic commitment represented as a promise.
- A user-held email prototype becoming a meeting-specific product branch.
- A First Governed Reality Episode represented as broad product certification.
- A research result used to enable action, governed training, actor credit,
  CEU, pricing, guarantee, or settlement.
- PRICE, GUARANTEE, or SETTLE expansion without real complete episodes,
  external owner adoption, authority, capital or custody, adjudication, and
  longitudinal evidence.

## Definition of North Star completion

The North Star is not complete when a demo successfully sends messages, when a
provider replies, or when one task happens to finish. It is complete for one
exact order class only when a user can state and confirm a result, leave, and
the system—without Outsider staff—can form a temporary external-resource
network, obtain all one-use authority and reservations, either atomically
commit or decline by deadline, execute only inside proven authority, capture
every Attempt and command-to-effect transition, independently establish the
outcome or recovery, close or preserve every obligation, dissolve the temporary
network, and optionally invite a separate revocable standing grant.

That completion remains scoped to its exact external owners, resource classes,
authority, region, time, consequence envelope, evidence instruments, recovery
path, and order class. Expansion is earned by repeating the same two-gate proof
(`C_i ∧ R_i`), never by extrapolation, staffing, or rhetoric.

## Production checkpoint — 2026-09-04 v2

This descendant checkpoint preserves the preceding checkpoint and records the
next three live attempts without rewriting their frozen evidence. The product
direction is unchanged: an order must assemble its own temporary network from
native external interfaces. Search results are transient candidates, transport
receipts are not acceptance, and an incomplete formation is unavailable rather
than an Outsider operations ticket.

### Failed-closed predecessors and the defect they exposed

Episode `first_committed_reality_20260904_009`, program
`reality_48d4e67b13680ccfd382c1ef26113a9c730cf528`, was deliberately closed as
`FAILED_CLOSED`. Its 97-event journal ended at
`sha256:26a666b51a3d118cbec0dedfcde138bad747644e0f15b29a7c0536e21ceb7a12`;
all acquired resources were released, all obligations were closed, and no
human queue was created.

Episode `first_committed_reality_20260904_010`, program
`reality_9e767fcb729b698f84de1d9b8e2a44a9c3a36098`, program hash
`sha256:d5bb4f85ccf4cea9e24eec662a213cc17340a806d9f3399499646670f91f5a16`,
reached a real commitment, observed the controlled primary failure, activated
the GitHub recovery route, and passed its immediate independent observation.
It then truthfully ended `FAILED_CLOSED` when the longitudinal witness did not
establish the required window. Its 65,948-byte, 40-event journal has file
SHA-256
`51976f0d9de90be591c89afb7cea2c1ebdf49ca321128173eb192424f63aab39`
and append-only head
`sha256:7ad30402a468058ae2437197fa65577e1285c914d0e3a9548dfc30d19489c345`.
All three reservations were released and all obligations were closed.

The failure was not a recovery-route failure. Independent Globalping replay
proved the route's `302 → release asset → 200` chain twice. The frozen Uptime
adapter had created that monitor with redirect following disabled, treated its
create-time `STARTED` value as usable state, allowed commitment before a fresh
provider check, and did not propagate refreshed child state or exact-range
metrics through the composed adapter. The frozen v1/v4 artifacts remain
unchanged; the repair is a set of versioned descendants.

### Versioned production witness repair

The v5 production path now binds redirect behavior to the independently
enforced Globalping policy, requires a fresh UptimeRobot `UP` read before
capacity can close, anchors the longitudinal interval at the latest of witness
readiness, service start, and post-effect evidence, and propagates fresh child
state plus sanitized exact metrics. A shared rolling limiter admits at most ten
UptimeRobot calls per 60 seconds while reserving two slots for cleanup. A
rate-limited DELETE becomes a new durable, cold-resumable cleanup generation;
it never retries the same one-use mutation.

CREATE ambiguity is also cold-resumable. After `SUBMIT_ATTEMPTED` is fsynced
but before provider contact, the adapter publishes a secret-free, mode-`0600`,
content-addressed handle and fsyncs its directory. A successful create response
publishes a monitor-known descendant before the receipt append. A restarted v5
composition can discover only the exact plan/ledger/operation-bound handle,
perform LIST reconciliation, obtain a fresh `UP`, and release the monitor
without a second POST. The focused hard-exit test uses a separate child process
and passes no in-memory adapter state to the recovering process.

The principal code descendants and their file SHA-256 values are:

- `outsider-uptimerobot-http-witness-adapter-v2.js` — 74,536 bytes,
  `dff00445b7f34a50cfd643e0b60202a1b7f5e8819ff1aab48b48288eedae5987`;
- `outsider-uptimerobot-account-rate-limiter-v1.js` — 5,473 bytes,
  `7cc9bb6e0b6a159e37f62bb444ed890128cab213bd502e41928da4686c7d5214`;
- `outsider-readiness-gated-longitudinal-witness-adapter-v1.js` — 26,259
  bytes, `4b82ae97d890e99540e80be74e1bcfaed1d3ced7e7cafb1d26b2994c4c1b2754`;
- `outsider-composed-http-outcome-witness-adapter-v2.js` — 22,937 bytes,
  `75bfd35b99453d6b5591aae8c8ad2273b8816194dfc460439415d1aae1d1c89f`;
- `outsider-route-aware-witness-adapter-v2.js` — 23,104 bytes,
  `1f76f8ce253678b558c8537fc86374e7f4e30ecdf777f8a85024c04ae344f6b6`;
- `outsider-first-committed-digital-reality-production-composition-v5.js` —
  14,216 bytes,
  `a84141c8432187e3b1d6adc49b559c8bf2f2ed8226edefc10c2e0d6122bfc111`.

Focused and adjacent verification passed 23/23 production-witness tests and
24/24 transaction-surface/ledger tests. Syntax checks passed for every v5
production source and launcher. These tests establish code behavior only; the
live episode below supplies the corresponding reality facts.

### Live v5 temporary network

Episode `first_committed_reality_20260904_011`, program
`reality_020bdc6562465cc132aa97bafe0c0cb33a814e02`, program hash
`sha256:13f2e08e17f12145e59cdaf18c77492db7d77c7f0c812c054689e512961ab765`,
ran against Cloudflare, GitHub, Globalping, and UptimeRobot with a maximum
budget of USD 0. It began at `2026-09-04T07:23:03.159Z`, closed all formation
roles and committed at `07:24:16.987Z`, and reached `PROGRAM_SUCCEEDED` at
`07:37:54.318Z`. The primary effect produced the preregistered controlled
failure, the recovery effect succeeded, and the immediate recovery-route
observation was `SATISFIED`.

The prospective longitudinal witness then measured the exact interval
`07:27:43.654Z` through `07:37:43.654Z`: uptime 100%, total downtime 0 seconds,
and incident count 0. An independent Globalping horizon observation also
matched HTTP 200 and the exact frozen artifact body hash. Two earlier
`INCONCLUSIVE` occurrences (`OBSERVATION_WINDOW_OPEN` and
`CONTINUOUS_WINDOW_NOT_DUE`) remain in the journal; they were not overwritten
or collapsed into the eventual success.

The mode-`0600` journal contains 42 events and 92,282 bytes. Its file SHA-256 is
`e54c67d3d64ab4b6906d3fdc9b777d2272fa049ab7ea73c55e2b037bd1bcb4ab`;
its append-only terminal head is
`sha256:3c8913297ef6933cc599ffec6e9664e6d8981a135b9d8e0505a514da2ebb57bf`.
The complete chain was independently recomputed from the canonical,
domain-separated event hash rule. Three reservations were confirmed and all
three were released. Three obligations were requested and all three were
closed. Both Uptime effect ledgers contain exactly eight entries: one complete
CREATE and one complete DELETE lifecycle, with no ambiguous or pending
mutation. There was no payment, charge, settlement, retry pause, open
obligation, or human queue. Measured Outsider staff touches were exactly zero.

The private Globalping evidence consists of four mode-`0600` journals: one
primary-route journal with 5 occurrences, 3,979 bytes, and file SHA-256
`b006c806465922bc2eca562456b57e7a214548916889fbfaacd7992778e8439a`;
and three recovery-route journals with 8 occurrences and 6,125 bytes each,
whose file SHA-256 values are
`33071e9f3ab0d0b3327b423690788759f92804e7bee3b6ad902c73a173fad82a`,
`f4b4c46ddab4505f6a3742dc0626715d14191fd3989922457882c4c4a7ab62d4`,
and
`37fe129c1d0dced9ab0a19d9856a2b315a8917ce28170d35c8bf90e4101ed51a`.
That is 29 retained provider-event occurrences and 22,354 bytes. The primary
and recovery UptimeRobot effect ledgers contain eight mode-`0600` entries and
17,158 bytes each, with verified heads
`sha256:dbbd2142384f5c0fbfd72c6e04edc9d333486c9e19af8f5bd3abc8315a454856`
and
`sha256:8189ab0e831757326f57b37630fc4447d0d4c52a587af07deeecab931af3caf3`.
Cloudflare and GitHub lifecycle receipts are retained in the main journal
rather than duplicated into provider-specific occurrence files.

This is one scoped, real digital temporary resource network. It is not proof of
generic seller formation, geographic coverage, or a provider marketplace.

### Generic transaction-surface execution seam and current frontier

`outsider-transaction-surface-one-use-route-runtime-v1.js` is the transport-
neutral production seam between transient discovery and a one-use tender. It
accepts source-specific private claimant/adapter closures rather than provider
records or domain branches, persists `INTENT → RESERVED → ATTEMPTED` before
contact, keeps route, credential, and raw receipt bytes private, preserves
every receipt occurrence, and never promotes delivery, response, or a
reservation receipt into acceptance, capacity, or outcome truth. The runtime
is 31,414 bytes with SHA-256
`f753a4d22f6bb7bd6ee536770051539801a5a8e2c6355583415fe1e7290797ff`;
its 17,729-byte test has SHA-256
`5a854160588eefb01502b3840f306232fd737d9486f335e9f4f9f1a561353438`.

The first discovery-to-runtime transport binding now exists as
`outsider-web-native-mailto-transaction-surface-route-adapter-v1.js` (16,521
bytes, SHA-256
`0239d64be03bf8697736d065f8bf2fbbc8fab1b3c6500d02481922b2b582d424`).
It consumes one private seller-origin probe claim, selects one exact observed
`MAILTO_LINK`, invokes one injected account-native mailbox closure, and feeds
the resulting delivery/response/reservation occurrences into the generic
one-use runtime. It neither accepts ambient credentials nor creates a mail-
specific core branch. A real-module chain from one Brave search through
descriptor and seller-document reads into this adapter passed 26/26 tests;
the mailbox edge in that test was injected and no real message was sent.

The latest public-index probe,
`global_supplier_route_probe_20260904_008`, made one Brave request, selected
one transient candidate, observed a descriptor 404 followed by one 200 seller
document, and retained three distinct HTML-form occurrences that referred to
the same object. It found no compatible invocable interface and therefore made
zero tender POSTs, payments, acceptances, or capacity reservations; its state
remains `HOLD / DECLINE_NOT_HUMAN_QUEUE`.

The next reality gate is not more internal policy machinery. It is one
account-native outbound transport whose actual send and receive receipts can
be replayed, connected to this generic seam, followed by one real unknown-
seller tender whose explicit reply and capacity lifecycle feed the same
primary/recovery/witness coordinator. Until that happens, Outsider has a real
cross-provider digital execution episode and a generic execution foundation,
but not yet the full internet-scale seller network.

## Production checkpoint — 2026-09-04 v3

### Account-native outbound transport

`outsider-gmail-account-native-mailbox-transport-v1.js` is now the first real-
provider outbound implementation behind the generic web-native mailto route.
It uses separate finite and revocable `gmail.send` and optional
`gmail.readonly` capabilities, emits one exact single-recipient readable RFC
5322 tender, fsyncs `SEND_ATTEMPTED` before the Gmail POST, and fsyncs the exact
HTTP response handle before parsing it. A hard-exit test stopped the sending
process after the response handle was durable but before `SEND_COMPLETED`; a
fresh process recovered the Gmail message/thread acknowledgement without a
second POST. The rebuilt generic mailbox child recorded `sendExact=0` and
`receiveExact=1`. Bounded reply observation retains exact list/get/raw source
occurrences and keeps both delivery ACK and reply at `HOLD`; neither creates
acceptance, capacity, authority, price, payment, or outcome truth.

The module is 57,902 bytes with SHA-256
`c7fec04e969e2b8b0f9852ab88d06a4903926b9868277fbad0e62af9f7886ca7`.
Its 20,967-byte focused test has SHA-256
`400a3578998694c274f8df128b2639352e44210642b0affc2a485e0e4e0a4a1a`.
Focused plus adjacent verification passed 27/27. No live Gmail call has been
made: a user-issued Google OAuth capability remains an external prerequisite,
and no credential is stored in the repository.

### Registration-free one-use seller response edge

A deployable Cloudflare Worker now provides the missing counterparty response
surface. An unknown seller can open one bearer link without registration, read
the exact frozen outcome summary and responsibility terms, and submit exactly
one `DECLINE` or structured `OFFER`. An OFFER binds currency, quote minor units,
future service-window start/end, expiry, notes, and the displayed
responsibility-terms hash. One SQLite Durable Object owns each link and performs
the response compare-and-append synchronously; concurrent submissions have one
winner. Workers KV is not the consume-once authority.

The routing token is 32 bytes of caller-provided secure entropy plus a
32-byte HMAC-SHA-256 tag. The edge validates that tag before Durable Object
lookup, preventing arbitrary anonymous URLs from allocating storage. Request
bodies are streaming-capped at 64 KiB. Raw response bytes stay private and can
be replayed after isolate/process restart through authenticated source routes,
including by token hash after a signing key leaves the overlap keyring. Public
projections omit token, raw response, seller route, and order body, and remain
`HOLD`. Worker invocation observability is disabled so the bearer token is not
intentionally copied into request logs.

The frozen deployment slice is:

- `outsider-one-use-tender-response-link-handler-v1.js` — 31,990 bytes,
  SHA-256
  `025784afd31abcb734cbec75e5a81aa0418da2c4495c38e3c5066449654db4d6`;
- `outsider-cloudflare-sqlite-do-one-use-tender-response-store-v1.js` —
  8,642 bytes, SHA-256
  `b2ebd9b2a0bef6e371dfbcd37399ffd4913bfd30c16f60dd48175e0d6c0e9fde`;
- `outsider-cloudflare-one-use-tender-response-token-v1.js` — 2,690 bytes,
  SHA-256
  `414e3fcc79733eaa7f005f9fe19fe45f6930e7d69e20423ab13e08860454d0cd`;
- Cloudflare Worker — 11,783 bytes, SHA-256
  `14a21fbe958f73c89ce8ba00a1db8d08017e1d4cbd0b68790e08f756ad56be24`;
- Wrangler configuration — 608 bytes, SHA-256
  `f09001543454beca081c09afb76d8754528d41d4769a96e2dd3324e4698d74f1`;
- deployment README — 2,839 bytes, SHA-256
  `9e004ffd9cfa0b68ddf65a113bc72bb6d9282574f322951cd2342031a1f1a8dc`;
- focused test — 21,053 bytes, SHA-256
  `83c9e6f57eec3c615912a927daa0c41d7c59dee65013e482eaf05d1779ea2af8`.

Focused verification passed 7/7 and adjacent verification passed 39/39.
Wrangler 4.124.0 produced a successful deployment dry-run of 65.26 KiB raw and
14.74 KiB gzip. This edge is not yet deployed. Deployment requires two runtime
secrets (`ADMIN_BEARER_TOKEN` and
`RESPONSE_LINK_TOKEN_MAC_KEYRING_JSON`) plus a time-limited Cloudflare API token
with Workers write authority. No seller was contacted and no payment was made.
The next live gate is to deploy this edge, bind one initialized response link
into an exact Gmail tender, retrieve a real counterparty OFFER/DECLINE source,
and pass that occurrence through owner-trust and lifecycle replay into the same
primary/recovery/witness formation coordinator.

### Production response-link account client

`outsider-cloudflare-one-use-tender-response-link-account-native-client-v1.js`
now closes the local-to-edge production seam without making Cloudflare a core
dependency. It accepts an injected HTTPS request closure, creates one HMAC
token with caller-supplied cryptographic entropy, initializes the exact frozen
definition, returns the seller bearer URL only through a private method, and
can compose that URL into the readable Gmail tender body. It retrieves seller
source material through the authenticated token-hash route, so historical
source replay remains possible after the corresponding MAC key leaves the
public routing keyring. It also exposes an exact-bound revocation operation.

Every external operation is written and fsynced to a mode-`0600` append-only
journal before I/O. Exact HTTP response bytes are independently fsynced to a
response handle before interpretation and then incorporated into the journal.
Cold restart recovers completed HTTP responses without another request.
Ambiguous initialize or revoke attempts and HTTP 429 mutations remain durable
no-retry `HOLD` states. OFFER and DECLINE source bytes can be claimed once for
the source-specific lifecycle interpreter; the client itself does not mint
identity, authority, acceptance, capacity, price, or outcome truth.

The client is 42,111 bytes with SHA-256
`13a0b35bb573848c54af84380eca4d2ccaf2a7f8e1286a5c3e9a4559796a9461`.
Its 12,371-byte focused test has SHA-256
`4a6b7d1d8bebb2feb4aedbd59040471fa4cd534bfc3266f79fd21199f48451b0`.
The client, frozen response server/Worker, and Gmail transport passed a combined
16/16 production-seam test run. This is still replayed local I/O: actual
deployment and a real external counterparty response remain the next reality
facts to acquire.

## Production checkpoint — 2026-09-04 v4

### Live registration-free response edge

The response edge is now a real Cloudflare deployment at
`https://outsider-one-use-tender-response-link.outsider-guard.workers.dev`.
Cloudflare accepted Worker version
`f92c2b1c-e692-4acd-ad50-0da56300f283`; the upload was 65.26 KiB raw and
14.74 KiB gzip, with a reported startup time of 13 ms. Both required bindings,
`ADMIN_BEARER_TOKEN` and `RESPONSE_LINK_TOKEN_MAC_KEYRING_JSON`, are confirmed
by Wrangler as `secret_text`. The account deployment token expires after 30
days and is scoped to Workers Scripts Write plus Account Settings Read; it has
no billing permission. Deployment, admin, and MAC credentials are retained in
macOS Keychain only. The exact temporary mode-`0600` credential directory used
for first deployment was deleted, and the browser left the one-time token
display page.

An unauthenticated public read of `/healthz` returned HTTP 200 with
`service=outsider-one-use-tender-response-link`, `version=1.0.0`, and
`mode=HOLD`. No secret, token, order, seller route, or Durable Object was read
by that endpoint.

### Live controlled channel lifecycle

`run-cloudflare-one-use-tender-response-link-production-smoke-v1.mjs`
(12,914 bytes, SHA-256
`bc97ad8ebdaf7090144c6fca2ac716b17c31c7cd81b000287e4fc346118e6eb7`)
then exercised one real, explicitly labelled
`CONTROLLED_CHANNEL_READINESS` lifecycle at USD 0. It initialized a fresh
HMAC-bound link (`201 / LINK_INITIALIZED_HOLD`), anonymously opened the public
seller page (`200`), authenticated the token-hash source route and observed
`202 / AWAITING_RESPONSE_HOLD`, revoked the link (`200 /
LINK_REVOKED_HOLD`), and verified that the same public route then returned
`410`. It did not submit an OFFER or DECLINE, contact a seller, create a
payment, establish capacity, or claim an outcome.

The privacy-closed run summary hash is
`sha256:ba65b6538d9676f3861efb40e766fe4593e5fd9b25818b4f349db888ec4deff6`.
The client journal contains 10 mode-`0600` events and 13,038 bytes; its file
SHA-256 is
`0fc05f38b817d088684d107bc4ea80493fa4a22bff4901b2e0c7c6d376eedb4f`
and terminal event head is
`sha256:fb86164cbad4837a0426ae024aa201367356fc5fba8676defd98c465bccc3a4f`.
Its three exact authenticated HTTP statuses are 201, 202, and 200. The two
anonymous public-page occurrences occupy 3,880 bytes in a separate
mode-`0600` evidence chain with file SHA-256
`32a5e15051a8b1ba5b6b693f25a4b141b0109360df9a0e3361c9eee930cf6fb7`
and head
`sha256:1d710f28e88a2ae592dfa14f781fb1841a3a478f4a0c9bc5a50acfbfffeac5e2`.
The pre-revocation page was 2,196 bytes with SHA-256
`1e44c2e33a67546a8c23c50cabbc322eccbaf1594d8438ff56c7226c882846a2`;
the terminal 410 body was 13 bytes with SHA-256
`0bdffa40e52cfe9c97d3cb224bf79499c9ad8a064aa373dbaf186a66e57456d1`.

### Independent public reachability occurrence

One unauthenticated Globalping probe independently performed a read-only GET
against the live health endpoint. It made exactly one create POST and one
exact-ID status GET, used no API credential or paid credit, resolved four
public target addresses, and returned one finished source-declared result that
matched the frozen status/TLS/timing requirements. The disposition remains
`SOURCE_DECLARED_REQUIREMENT_MATCH_HOLD`: this is a real outside-network
occurrence, but not legal independence or longitudinal outcome truth.

The Globalping raw journal contains 11 mode-`0600` records and 20,206 bytes,
with head
`sha256:99eb14d366703bb31998b2845a98134700922457ee2a2e45277ef26a041e6692`.
Its one-use effect-ledger head is
`sha256:5cfe656f42d35e504288a253d0d74c732b6ba141cbf34b37317324c4972ddbab`.
The 5,648-byte durable manifest has file SHA-256
`56ea992d8076336f5fe254564498efa9d20dd98e072cb67e0c2ab0c41c3d631a`
and semantic manifest hash
`sha256:27f73699109f3da5a0ee4484a5f4f4719cca3be415d4c4898b3f172fba86a0e6`.
The 6,409-byte public projection has file SHA-256
`f49ae70b7b6cbdf180d9590445af33f3568719e2a1510f2ca56d1bd2ae4f8750`.

This closes the deployment and response-channel production-readiness gate. It
does not close generic seller formation. The next reality fact must be a real
user-authorized outcome tender sent through an account-native external route
to a naturally discovered seller, followed by an explicit seller response,
owner-trust/lifecycle replay, and simultaneous primary, recovery, and witness
reservations. The system must still return `UNAVAILABLE` rather than create an
Outsider operations queue when those commitments do not close.

### Account-native outbound provider setup frontier

A separate Google Cloud project, `outsider-formation-20260904` (display name
`Outsider`), now exists so the first Gmail transport capability is isolated
from the pre-existing unrelated project. The Gmail API is enabled. No billing
action was taken, no OAuth client or client secret has been created, and no
mailbox grant exists yet. The Google Auth Platform setup is prepared with app
name `Outsider`, External audience, and the signed-in account as support and
project-contact recipient. It is intentionally paused before accepting the
Google API Services User Data Policy and before the final create action; those
legal/credential actions require immediate principal confirmation. After that
confirmation, the remaining production path is to configure only the
`gmail.send` scope first, create a Desktop OAuth client, run the account-owner
grant, persist the refresh capability outside the repository, and execute one
user-authorized real tender. Restricted `gmail.readonly` remains a separate,
optional grant and must not be bundled merely for convenience.

## Production checkpoint — 2026-09-04 v5

The principal accepted the Google API Services User Data Policy and completed
the pending Auth Platform create action. This supersedes, without rewriting,
the v4 OAuth setup pause. The `Outsider` app is now External with publishing
status `Testing`; the signed-in owner account is its sole test user. Data Access
contains exactly the sensitive scope
`https://www.googleapis.com/auth/gmail.send`. The restricted
`https://www.googleapis.com/auth/gmail.readonly` scope is absent.

A new Desktop-app client form is prepared with the name
`Outsider Node Gmail Send v1`, but the final credential-creation action has not
been taken and no client ID or client secret exists yet. That final action is
an always-confirmed credential creation. Once confirmed, the client material
must be captured once into macOS Keychain, omitted from repository and public
projections, and used only to request an owner-mediated `gmail.send` grant.

## Production checkpoint — 2026-09-04 v6

### Buyer-native execution supersedes email as the production mainline

The v3-v5 Gmail and one-use response-link artifacts remain valid frozen
descendants for asynchronous discovery and future capacity learning. They are
no longer the next production gate. A seller reply is not capacity, and a
system whose success depends on a seller answering email is a mail agent, not
an Outcome Formation Engine. The production critical path is now exclusively
an existing buyer-native transaction surface: public or account-held APIs,
MCP, carts, booking/reservation interfaces, checkout surfaces, device nodes,
and explicit standing capacity. Provider enrollment and Outsider staff
outreach remain unnecessary.

The durable invariant for this line is:

```text
one goal
  -> compile outcome, evidence and recovery requirements
  -> discover machine-purchasable PRIMARY + RECOVERY + WITNESS routes
  -> quote and test readiness in parallel
  -> ask once for exact total/deadline/address/payment/loss authority
  -> reserve all three routes atomically
  -> commit PRIMARY
  -> recover only after an exact PRIMARY failure occurrence
  -> declare success only after independent outcome observation
```

A cart, inventory statement, checkout page, seller acknowledgement, or carrier
service name is still only a source occurrence. It does not establish capacity,
authority, delivery, ETA, or the promised future state.

### Generic product and atomic transaction path

The provider-neutral buyer-native capability now exposes one order-scoped
`QUOTE / HOLD / RESERVE / COMMIT / STATUS / CANCEL / RECOVER` vocabulary. It
retains exact provider bytes privately, fsyncs the attempt before an external
effect, supports cold replay, and leaves ambiguous effects in a no-retry hold.
The implementation is 36,225 bytes with SHA-256
`8e0d33676654b5bc55f58281ab024c05d0e2af161910aaeb54beb0e4fb6f0889`.

The 30,556-byte atomic coordinator, SHA-256
`e0bf1bef1346e12f028ace393070df26e77bc0389c136525830d2e107f36f9f8`,
composes `PRIMARY`, `RECOVERY`, and `INDEPENDENT_WITNESS`. Preparation performs
parallel quote/readiness work only. `CART_READY` is a separate state and emits
`NEEDS_ADDRESS_AND_PAYMENT`; it is never treated as a hold or reservation. A
factory-issued, one-use principal approval binds the address reference,
payment-method reference, exact amount, and maximum loss. Only three exact
`RESERVATION_ACKNOWLEDGED` states permit the primary commit. Partial reservation
causes cancellation of all live slots. Ambiguity does not activate recovery;
only an exact primary `FAILED` occurrence does. Provider-declared fulfillment
still stops at `AWAITING_INDEPENDENT_WITNESS`.

The 26,750-byte Outcome Product Runtime v2, SHA-256
`b6ffa7d0b6cba860842ad5add096f71e56ab94fa6770e31474f382dfff723f72`,
corrects the v1 interaction order without modifying v1. One goal plus
formation-only authority now produces only `BACKGROUND_FORMING`,
`NEEDS_DESTINATION`, `UNAVAILABLE`, or an exact
`COMMITMENT_PROPOSAL_READY`. The exact proposal must bind the program,
coordinator, all three route-readiness occurrences, total price, maximum loss,
completion deadline, and expiry. Only then can a separate factory-issued
payment/loss/address authorization call the atomic coordinator. No state creates
an employee queue or an outcome promise.

### Real seller adapters and production transport

Two source-specific adapters now issue the same generic capability:

- Adafruit guest shopper: 15,871 bytes, SHA-256
  `e928bd07b4efa74c387c60c348c27af2624159a5c8434f1d3d0b2d8bd29329aa`;
- SparkFun Magento guest cart: 21,394 bytes, SHA-256
  `08301d85acb393c864c43fad4eea515ca2de7490376c3dac50e0be79565d07c4`.

Both implement exact catalog, isolated guest-cart, fresh status, and cart
cancellation paths. Their capability allowlists contain only
`QUOTE / HOLD / STATUS / CANCEL`; attempts to reserve, commit, recover, pay, or
submit an order are impossible through these adapters. Adafruit binds the
product form and private cookie/CSRF session. SparkFun binds the Magento product,
masked guest-cart identifier, exact SKU and item identifier. The common private
receipt support layer is 8,811 bytes with SHA-256
`41ff167ec33516647d7529a0e474f12741d68dba264a57bcf0bbb1e5363f0b72`.

The new order-scoped HTTPS transport is 27,233 bytes with SHA-256
`39dd9a71f07e71f59bcc4f6bdefbb351872aeb5b0f158f5eb8d9b99ebbd88c04`.
It performs exact GET/POST/DELETE requests against a finite per-order origin
set, returns exact status/headers/final URL/body bytes, never follows redirects,
and refuses cross-origin `Location`. Its Adafruit cookie jar is serialized,
restartable, fsynced, and stored under a mode-0700 directory in a mode-0600
file. Cookie, CSRF, masked cart identifiers, addresses, and payment material are
never public projections.

### Real buyer-native source occurrences

The first bounded live preflight reached four unrelated seller-owned transaction
surfaces without enrollment or seller replies. EnergyX WooCommerce and The Hard
Hat Shop Shopify both accepted and then cleared an anonymous cart. The selected
physical-outcome candidates are one new USB-A male to USB-C male data and 5V
power cable, approximately one metre long: Adafruit PID 4474 as primary at
USD 4.95 and SparkFun CAB-14743 as recovery at USD 7.95. Both produced real
anonymous cart-ready occurrences. Across the slice there were four cart adds,
two explicit cart cancellations, zero seller messages, zero seller replies,
zero addresses, zero checkout submissions, zero payments, and zero orders.

The immutable private capture contains 50 mode-0600 raw files and 2,795,469
bytes. Its 12,612-byte manifest has file SHA-256
`68e6464c25952926a2b80d9e6978428f4a7e399713b4b7c3fba6ee3578379c0a`
and semantic SHA-256
`42e8bea39d75413911367775a78d022c6e20f374e25f3ba9bd61b1ad7df61209`.

After the production transport was implemented, the 9,451-byte live quote
probe, SHA-256
`93663fcdc11a0392c26c2eea4ddeb6cbd882b9c0b8aedfa3fa7d49d3346915a5`,
performed exactly two concurrent public GETs through the complete
transport-to-adapter-to-runtime path. At `2026-09-04T13:31:16.462Z`, both
routes returned `QUOTE_AVAILABLE`: Adafruit USD 4.95 and SparkFun USD 7.95.
The primary private receipt was 119,011 bytes with SHA-256
`a6237aa6d16a2afc6e3fab341779617ce43659f245a3101ba532450fb76f595c`;
the recovery receipt was 766,589 bytes with SHA-256
`5f82c0522665f39587ecc15de1c8ecd6375b5a2bb79a92ad0353e8790f1ffe73`.
The 2,101-byte manifest has file SHA-256
`2f2046c27b8936622a3130d614bf03c39ce48e1c74b59d30f1c97301f6ce7027`
and semantic manifest hash
`sha256:875314a91046ad4ce70879f14b433d09d91981255a92a0a60fa7b62f2eebc4dc`.
This probe made zero cart mutations, messages, address submissions, payments,
orders, or capacity claims.

The first sandboxed invocation durably recorded two
`AMBIGUOUS_NO_RETRY_HOLD` attempts before the reporter discovered that no source
bytes existed to claim. Those journals were not edited or deleted. A new
1,602-byte recovery manifest, SHA-256
`c05bfd4e07618ee5c1e127cdb7a2d0bfdd675c62ea16c861d2f73843ef7d53b2`,
pins both original event files and explicitly supersedes the incomplete run with
the successful versioned probe above.

### Destination quote frontier

SparkFun's deployed Magento surface now has a destination-quote adapter (27,304
bytes, SHA-256
`59fc0da0d6d3a702a32284a2c870d65d1edcb133f18aae078786f0b0095f963e`).
An expiring private destination grant can provide country plus postal code, with
optional region and city, then drive exact
`estimate-shipping-methods -> totals-information` requests against the existing
cart. The second request must descend from the exact first quote occurrence.
It can establish available shipping methods and a non-final landed-total/tax
estimate, but not final deliverability, ETA, capacity, or a delivery deadline.
The deployed Magento shipping response has no structured ETA field.

Adafruit's captured checkout is only step 1. Its documented sequence requires
contact email, then full shipping and billing address, then shipping options.
No stable step-2 rate endpoint has yet been observed, so the 1,683-byte readiness
record, SHA-256
`f75ef766798b5b8cca72f9acdf2c287f311500f208e3fa274c1c4a4f0e5851dc`,
explicitly blocks rather than guessing the form.

Focused verification for the capability, atomic coordinator, two seller
adapters, production HTTPS transport, product runtime v2, and destination quote
stage passed 22/22. The next real input is not a seller reply or founder API
account: it is the principal's delivery country and postal code (region/city if
available), followed later by the full address/contact details where required.
Payment remains a distinct, explicit authorization after total price and route
readiness are known. A live independent physical-delivery/outcome witness and
actual reservable main/recovery checkout paths remain unclosed, so the current
network state is `NEEDS_DESTINATION`, not a result commitment.

## Production checkpoint — 2026-09-04 v7

### The old model, compute, and data foundations are now in the product path

This checkpoint supersedes the v6 separation between a buyer-native execution
prototype and Outsider's earlier evidence foundations. One physical-outcome
request now traverses one continuous path:

```text
private natural-language goal
  -> closed-shape model draft
  -> frozen Outcome
  -> exact existing Autonomous Work Order typed graph
  -> verified Outcome Tender and OutcomeProgram
  -> atomic PRIMARY / RECOVERY / INDEPENDENT_WITNESS formation
  -> buyer-native seller transactions
  -> the existing Episode / Attempt occurrence and Episode Data Engine path
```

The 39,473-byte foundation composition, SHA-256
`7761925b5db3d95606673c34fbc17bcdf4c953f8fe4c5938608c8b6768341060`,
now resolves the Work Order only after the model draft has produced the exact
frozen Outcome. This removes the former circularity in which the Work Order was
expected to bind an Outcome hash that did not yet exist. Model output remains a
provider-neutral proposal. It cannot supply endpoints, credentials, authority,
payment, capacity, or outcome truth. Existing retrospective/logistic machinery
may only shadow-order already discovered probes; invalid output is
`KEEP_BASELINE` and admits or rejects zero candidates.

The 33,005-byte Episode data bridge, SHA-256
`8b9fe8084279794595186005ce15b809542783dfb5d5fd21b4058d45b838a497`,
maps every formation snapshot and buyer-native receipt into the existing
`PrincipalEpoch -> AccountableDeployment -> Runtime/Embodiment -> Delegation
-> Episode -> Attempt` graph. Occurrence census stays separate from private
source-object equality. Raw bytes remain mode 0600 and are omitted from public
projections. Seller states and formation states remain `UNKNOWN/MISSING` for
independent outcome purposes. The bridge maps this first slice to the one
existing Work Order Attempt and does not invent a recovery Attempt identity.

The 48,336-byte physical composition, SHA-256
`1b2961e32ecd1f061b4a37dc81965b450f52316ba8e566e992c33d56715600df`,
and the 16,392-byte unified product, SHA-256
`e4a8c544e90ebc9d8672609ec4cd1967d979d8d420fac72096f8ffee73c52dbd`,
join those foundations to the real Adafruit primary route, SparkFun recovery
route, and an explicitly candidate-only witness seam. A single mode-0600
write-once binding contains the complete verified compilation plus the exact
Work Order. Therefore a crash after that record but before the physical runtime
persists its own copy replays the same program without calling the model or
foundation resolver again. A schema-valid but wrong physical route is rejected
before it can poison the request identifier.

### Source replay repair and versioned large-response descendant

The first authorized-network run exposed a real persistence defect: a large
SparkFun source receipt was base64-embedded a second time inside the private
response handle and exceeded the canonical single-string budget. The earlier
v1 format and all artifacts that use it were retained unchanged. New writes use
`outsider/buyer-native-transaction-private-response-handle/v2`: the exact source
bytes are a separate mode-0600 object, while the canonical handle binds its
domain-separated hash, byte length, transaction, effect, role, operation and
source metadata. Reads verify regular-file/no-symlink status, mode, size and
hash. The legacy v1 inline format remains readable on cold replay.

The resulting generic capability is 43,806 bytes with SHA-256
`6f5b1732a0bdb6e33033a5272ca09a276b90f810e6f6b5d496fac064fd556751`.
A 300,000-byte source receipt now survives write and cold replay, and a
synthetic legacy-v1 handle also cold-replays without another driver effect.

### First unified live buyer-native formation

At `2026-09-04T14:27:26.417Z`, the versioned live runner executed the complete
unified path for the fixed first milestone: one new USB-A male to USB-C male,
0.9-1.1 metre data and 5 V cable. It made 13 real seller HTTP requests:

- Adafruit: five GETs and one POST;
- SparkFun: five GETs and two POSTs;
- three non-GET requests in total, all limited to anonymous guest-cart
  formation.

Both order-scoped seller routes reached
`QUOTE -> CART_READY -> STATUS:CART_READY`. The existing data path retained
eight buyer-native transaction occurrences plus one formation occurrence, with
1,251,016 exact private source bytes. There were zero seller messages, seller
replies, submitted addresses, payment attempts, checkout submissions, orders,
capacity reservations, independent outcome observations, employee touches, or
outcome promises. Consequently the honest product state is
`NEEDS_DESTINATION`, not `COMMITMENT_PROPOSAL_READY`.

The immutable live run is
`.outsider/private/first-physical-unified-preflight-20260904-QVlQAw`.
Its evidence payload contains 54 files and 2,813,371 bytes, with set hash
`sha256:107cfe5226a7005b91b3263598cbd874b57f5494ee6484d34abf90a8ec945d6f`.
The source public summary is 3,157 bytes, file SHA-256
`e83cf15d573ae642abbc4a21ff4502e6e9a39e91bdf375d47e384f9e7f2aaf61`,
and projection hash
`sha256:1a1885baf3d653489be5fee0fb3a164c7589ede5e7e51a4baa2bb5f716a2e0b7`.

One CLI-supplied supersession token in that otherwise valid live summary was
mistyped by joining fragments of two real hashes. The source summary was not
edited. A no-network, no-cart-mutation descendant was appended at
`.outsider/private/first-physical-unified-lineage-correction-20260904-qKsh0o`.
It contains two mode-0600 files and 5,773 bytes, set hash
`sha256:aa6b59604c5ef2fb1a738444663935915717ced721e06753602eb68d18d00da5`.
Its correction hash is
`sha256:6bfe01a066226a6003f10a0905a7c2b6ea31c00edd6d9ae84b4cb3470019d820`.
The corrected 3,613-byte summary has file SHA-256
`e30a1f7d8cf9e6ee953f594e6f20d622b92a8468d530e0f1d9b0d43169d54c46`
and current projection hash
`sha256:7f6759bfc2e41f880da03ae4500b239e253167dfd181393bc9e77437ee5da6b4`.
It explicitly rejects the erroneous token and accurately links both earlier
failed holds and the successful live summary. No frozen artifact was
overwritten or deleted.

Focused verification for the model/compute compiler, unified crash replay,
wrong-draft non-poisoning, Product Runtime v2, Episode data bridge, generic
capability v1/v2 replay, atomic coordinator, both seller adapters, destination
quote stage, physical composition, and live runner passed 36/36.
`git diff --check` is clean.

The next reality input is an authorized delivery country and postal code, with
region/city if available. That permits a live SparkFun shipping/tax quote and
advances the same preserved network toward full-address deliverability and ETA.
It still will not establish capacity. After that remain three actual
reservations, a genuinely independent delivery/item witness, bounded loss and
exact total, a separate payment authorization, idempotent order submission,
status/recovery, and longitudinal outcome closure. Until all of those close,
`C_enabled` remains a subset of proven authority and the product must not issue
the promised future state.

## Production checkpoint — 2026-09-04 v8

### A real destination-bound formation, still short of an order

This checkpoint appends to v7; it does not rewrite or weaken any v7 artifact.
The principal supplied a real private destination-v2 input containing the
country/postal/region/city scope, a USD 20 maximum, and a September 10 delivery
deadline. No street address is reproduced here. The 369-byte write-once input
is
`.outsider/private/first-physical-destination-formation-request-20260904.v2.json`,
SHA-256
`06e9e6c83702fd460892214dbac980d9aea08b5e5bf07aab3ceefad27f811dba`.
It explicitly records both `paymentAuthorized: false` and
`orderAuthorized: false`.

That input traversed the same unified product path established in v7. Model
compilation froze the requested physical result; the compute layer compared
real buyer-native candidates against that frozen acceptance shape; and every
formation/source occurrence continued into the existing Episode/Attempt data
bridge. In the latest Target-bearing unified run, the public summary explicitly
reports `modelComputeFoundationConnected: true`,
`buyerNativeExecutionConnected: true`, and the frozen
`PrincipalEpoch -> AccountableDeployment -> Runtime/Embodiment -> Delegation
-> Episode -> Attempt` path. The 7,064-byte summary at
`.outsider/private/first-physical-unified-preflight-20260904-dwlyy2/public-summary.json`
has file SHA-256
`cd3817c1444130660e054e67ead30ba8107d5586de8877c2d204092e9eb56081`
and projection hash
`sha256:1b0082e1f2eada2bfa8ac55e6ebea8005f93c491aaa7df41513a6b2bb5e0d4df`.
Its evidence payload retains 79 files and 2,954,406 bytes with set hash
`sha256:b35af1f58b0c0b241ce66aa43fc419cc23401cb430fd312ec46fbc2f99978e13`.

### Real route results, including automatic rejection

SparkFun returned nine real postal shipping methods. The selected postal-only
estimate was USD 7.95 merchandise, USD 10.22 UPS Ground shipping, and USD 0.50
estimated tax, for USD 18.67 total. It is within the USD 20 ceiling, but the
deployed Magento response contains no structured ETA and the postal-only quote
does not prove full-address deliverability. It therefore remains
`NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA`, not a route commitment. The live
run at
`.outsider/private/first-physical-unified-preflight-20260904-pX8LIR`
retains 66 evidence files and 2,888,789 bytes with set hash
`sha256:b183dd5a95331576060abe7d5c187eb6111942a96050b7cd3d32c69200fa26cb`.
Its 3,302-byte public summary has file SHA-256
`c78b8123b4ffc7b8d8d95aebb99cce5b9d9a27aa9d1d6a7628ab697ed04c5dc6`
and projection hash
`sha256:8a5cb22e598a396f278ce7d38e853acbfe1971f406215455936a1c475f068f52`.

Target was automatically rejected from atomic selection. Its official source
showed a product and a postal delivery estimate, but not an explicit seller 5 V
statement; the anonymous standard-shipping path imposed a USD 35 merchandise
minimum, and the displayed same-day path required Target-account authority.
Neither ATP nor the displayed date was treated as reserved capacity or a
binding delivery commitment. The original candidate projection was left
untouched. The 1,089-byte append-only public correction at
`.outsider/private/target-buyer-native-route-correction-20260904-155858Z/public-projection.v2.json`
has SHA-256
`c4e52ae1689829d918c7cbb6e6faba6978ba37cc22f47f987fa17909f4feea11`
and supersedes the original projection hash
`9c686832a939ff384add58765a331ca7f38000111c2fb277d58cfdba02e725a6`.
Its 2,074-byte private correction manifest has SHA-256
`9c812c3e307a87ad97a2c4179254fd7a6eb2a47808ee0fb8fbb0c981daa89f7d`.

Best Buy exposed the strongest conditional path observed in this slice. The
AnkerDirect SKU 12150546 anonymous cart showed USD 8.99 merchandise, USD 0
shipping, USD 0.56 estimated tax, USD 9.55 displayed total, a source ETA of
September 10, and a guest-checkout continuation without an account. The seller
also explicitly states the required connectors, length, data support, and 5 V.
However, the sold package contains two cables while the frozen Outcome requires
quantity one. It is therefore
`REJECT_EXACT_QUANTITY_SURPLUS_AUTHORIZATION_REQUIRED`: a conditional candidate,
not an admitted route, unless the principal separately authorizes the surplus
cable. A cart-line quantity of one means one two-cable pack and is not a
capacity reservation. The corrected 3,528-byte projection at
`.outsider/private/bestbuy-buyer-native-route-20260904-wXBrsw/public-summary.v2.json`
has file SHA-256
`9fcf2cbea280f7fd723bf1f63c6e464fd896c0433e16a9e4a061a29819168498`
and projection hash
`sha256:e512fe6524ae242d65dbfdba04acbe8a256f1c142fd01720b356d94417103666`.

Walmart was also rejected rather than admitted on suggestive page text. Its
official response remained localized to the server-default postal area instead
of the requested postal scope, so neither the destination-specific ETA nor the
exact all-in total was proven. The product page also lacked an explicit 5 V
statement. The 1,061-byte public rejection at
`.outsider/private/walmart-buyer-native-route-rejected-20260904-161044Z/public-projection.json`
has SHA-256
`afdb0be85413da14bf3052ef8d8c4d0f029bec055a59fc20d93bbb3f2b34171f`;
the 4,170-byte private manifest has SHA-256
`c9ec8137e15726a3afa90c301a8a1337a55e32451ef952a5aeb2b0fa043d62e0`.

### Honest production boundary

The system has now performed destination-bound multi-provider discovery,
product acceptance comparison, anonymous cart formation, postal price/tax
formation, deadline comparison, guest-checkout-path discovery, automatic route
rejection, and exact-source Episode/Attempt retention. It has not completed a
purchase-and-delivery order. Across these artifacts there is zero payment,
zero submitted order, zero capacity reservation, zero independent witness,
zero employee touch, and zero outcome promise. Full-address deliverability,
contact-bound checkout, an exact accepted quantity, a reservable primary and
recovery path, a genuinely independent witness, and separate payment/order
authority remain open. Until they close atomically, the correct state is HOLD;
`C_enabled` remains a subset of proven authority.

## Product execution plan — 2026-09-04 v10

### What this descendant changes

This section is an append-only successor to the earlier gate plan. It does not
rewrite the v1-v9 checkpoints, frozen artifacts, source occurrences, typed
identity graph, or authority rules. It changes the active engineering priority:
research, provenance, and review machinery remain a foundation, but they are no
longer allowed to consume the critical path while the production execution
network is missing.

The product is not a browser operator, an email agent, a provider marketplace,
or a service team with software around it. The product accepts an Outcome,
forms an order-scoped temporary supply network from whatever authorized rails
already exist on the internet, commits only after the network closes, and then
owns the machine-readable lifecycle through outcome or recovery.

The steady-state order path is:

```text
Outcome
  -> compile constraints, evidence, authority and maximum loss
  -> DISCOVER candidate transaction surfaces in parallel
  -> QUOTE -> HOLD -> RESERVE primary, recovery and witness routes
  -> ask for one exact principal authorization when required
  -> COMMIT through a deterministic machine interface
  -> STATUS events -> independent outcome observation
  -> CANCEL or RECOVER when the committed path fails
```

Normal per-order execution has four hard zeroes:

```text
model page decisions       = 0
interactive browser clicks = 0
Outsider employee touches  = 0
user babysitting actions   = 0
```

Models remain useful on the cold path for Outcome compilation, first-time
interface understanding, adapter generation, drift repair, and acquisition
ranking. A model-produced adapter is never self-authorizing: it must become a
version-pinned, bounded, deterministic executable before entering the hot path.

### Three engineering layers

Every phase below has separate completion criteria for three layers. A phase is
not complete merely because its code exists.

| Layer | Meaning | Invalid substitute |
| --- | --- | --- |
| **Code engineering** | Reusable contracts, deterministic runtimes, adapters, state machines, SDKs, and tests. | A bespoke script that works for one SKU or one founder account. |
| **Production execution** | A continuously addressable service or edge node with durable jobs, idempotency, secrets isolation, restart recovery, metrics, and versioned rollout. | Codex running a CLI or clicking a signed-in page. |
| **Real-world closure** | External parties and systems actually quote, reserve, transact, fulfill, witness, and recover under the frozen Outcome. | A fixture, seller page claim, cart, server acknowledgement, or simulated outcome. |

The three layers advance in parallel, but authority is monotone:

```text
C_enabled is always a subset of A_proven
consequence reach never exceeds committed evidence and durable responsibility
```

### Rail strategy: global reach without waiting for global MCP adoption

Outsider normalizes many rails into one internal transaction vocabulary. MCP
is one possible transport, not a prerequisite and not an authority source.
The resolver tries rails in this order while remaining free to run them in
parallel when latency or recovery requires it:

1. already verified, revocable standing capacity;
2. UCP or another explicit commerce protocol over REST, MCP, or A2A;
3. official provider or marketplace API;
4. buyer-held OAuth, API, procurement, or application account at an Edge Node;
5. platform-family buyer-native protocol such as Shopify, Magento, or
   WooCommerce;
6. a version-pinned protocol compiled from an authorized network trace;
7. deterministic browser-session execution for steps that cannot leave a
   browser origin;
8. booking, RFQ, or one-use tender that returns an explicit signed offer and
   capacity acceptance;
9. `UNAVAILABLE` when none can prove the required transaction state.

Search, Cloudflare, a founder-held API key, and a central browser are replaceable
nodes. None is the trust root or the coverage boundary. The internet defines
the discovery horizon; proven interface semantics, authority, capacity, loss,
and witness availability define the commitment horizon.

### Phase 0 — Freeze execution truth and capability inventory

**Code engineering**

- Emit a machine-readable map of every existing adapter and the strongest
  transaction state it can honestly prove: discovery-only, replay-only, live
  quote, hold, reserve, commit, status, cancel, recover, or witness.
- Keep the typed graph frozen as `PrincipalEpoch -> AccountableDeployment ->
  Runtime/Embodiment -> Delegation -> Episode -> Attempt`.
- Keep exact-byte object retention separate from occurrence census and keep all
  old artifacts immutable.

**Production execution**

- Label every invoked route `LIVE_DIRECT`, `LIVE_EDGE_SESSION`,
  `SOURCE_PINNED_REPLAY`, or `SIMULATION` in machine output.
- Refuse to report a captured webpage or local fixture as a live provider
  interaction.

**Real-world closure**

- Replay the current physical formation and reproduce its honest `HOLD` without
  transmitting payment or manufacturing a reservation.
- Preserve the known fact that Adafruit, SparkFun, and Target discovery use
  direct HTTP while the present Best Buy path is source-pinned replay.

**Exit gate**

- A cold process produces the same capability map and source-bound decision.
- No unresolved source-replay/provenance break exists on the active path.

**Current status:** substantially complete. This is now a maintenance gate, not
the main staffing destination.

### Phase 1 — Remove Codex and the model from the transaction hot path

**Code engineering**

- Add a deterministic, finite, version-pinned execution-plan runtime above the
  existing buyer-native transaction capability.
- Accept only compiled precommit operations `QUOTE`, `HOLD`, and `STATUS` in
  the standalone plan runtime. Keep `RESERVE`, `COMMIT`, `CANCEL`, and
  `RECOVER` exclusive to the existing authority-bearing atomic coordinator.
- Reuse the existing pre-effect durable Attempt, idempotency, occurrence,
  ambiguity, and cold-replay semantics instead of rebuilding them.
- Fail closed on unknown stages, adapter-version mismatch, or unsupported
  capability; never create a human operations queue.
- Emit stage latency plus explicit zero counters for model calls, interactive
  browser actions, employee touches, and user babysitting.

**Production execution**

- Wrap the runtime in an addressable Formation Worker interface rather than a
  one-off founder-operated CLI.
- Receive an already compiled order job, bind one versioned adapter capability,
  persist before every possible external effect, and return a machine receipt.
- Restart from durable state without duplicating an external effect.

**Real-world closure**

- Run the currently known direct HTTP seller paths from a cold process with no
  page clicks and no per-stage model calls.
- Run the Best Buy evidence path only as replay until a live adapter is proven;
  its output must remain distinguishable from live network traffic.

**Exit gate**

- One frozen Outcome reaches the strongest authorized pre-payment state with
  all four hot-path counters at zero.
- Repeating the same job does not duplicate an external effect.
- Target performance after warm discovery: pre-payment formation P95 under
  15 seconds for already supported rails.

**Current status:** in progress. The first deterministic runtime slice begins in
this checkpoint.

### Phase 2 — Canonical transaction IR and platform-family live adapters

**Code engineering**

- Finish a transport-neutral IR for `CapabilityManifest`,
  `CandidateOccurrence`, `Quote`, `SignedOffer`, `CapacityLease`,
  `CommitCommand`, `ProviderReceipt`, `LifecycleEvent`, `WitnessClaim`, and
  `RecoveryObligation`.
- Extend the bounded HTTP transport in a versioned descendant to support the
  exact methods, headers, redirects, CSRF bindings, OAuth handles, and
  reconciliation calls needed by a specific adapter. Secrets remain in an
  injected closure or edge vault and never enter public projections.
- Build protocol-family adapters before seller-specific adapters: UCP, ACP,
  OpenAPI/GraphQL provider APIs, Shopify, Magento, WooCommerce, MCP/A2A, and
  WebMCP where actually advertised.
- Require provider-native client references or a deterministic reconciliation
  query for every non-read-only effect.

**Production execution**

- Operate a Surface Resolver that discovers a capability manifest, pins its
  revision, performs a fresh price/inventory check, and binds the selected
  adapter to one order-scoped capability.
- Cache interface structure, never stale price, inventory, deadline, or
  destination conclusions.
- Quarantine a drifted adapter immediately and route to another proven rail.

**Real-world closure**

- Given a seller domain and product constraints that were not hard-coded in the
  milestone runner, discover a platform rail and reach address-bound
  checkout-ready state through direct machine calls.
- Demonstrate at least two seller bindings that share one platform-family
  adapter.

**Exit gate**

- Adding a seller on a supported platform requires a binding/configuration, not
  bespoke transaction code.
- Shutting off the founder's search credential still leaves at least one
  independently discovered and executable route.

### Phase 3 — Protocol Trace Compiler and deterministic browser fallback

**Code engineering**

- Convert an authorized HAR/CDP/WebDriver-BiDi trace into a bounded dependency
  graph of session creation, product lookup, address quote, cart, checkout,
  order status, and cleanup operations.
- Identify variable inputs, response-derived tokens, CSRF/session state,
  origin/method limits, irreversible boundaries, and safe compensation.
- Generate a content-addressed adapter that can execute without a model and
  cannot access undeclared origins, fields, or operations.
- Give adapters the lifecycle `DISCOVERED -> GENERATED_UNTRUSTED ->
  READ_ONLY_CANARY -> CONFORMANT -> ACTIVE -> DRIFT_DETECTED -> QUARANTINED ->
  VERSIONED_REISSUE`.

**Production execution**

- Run generated adapters in an isolated edge/browser session with bounded
  requests, time, privacy disclosure, and no payment permission during canary.
- Use browser execution only where origin-bound JavaScript, CAPTCHA, OAuth,
  3DS, or platform policy makes direct HTTP impossible. The browser executes a
  compiled recipe; it does not ask a model what to click on each order.

**Real-world closure**

- Upgrade the present Best Buy path from source replay to either a live direct
  protocol adapter or an edge-session adapter.
- Repeat product, cart, full-address total, and ETA formation in three fresh
  sessions with consistent source-bound results and cleanup.

**Exit gate**

- One first-time authorized trace produces an adapter reusable on later orders;
  no later order replays human or Codex mouse actions.
- The adapter cannot reach `COMMIT` until payment/order fields receive a
  separately proven capability.

### Phase 4 — Decentralized Edge Transaction Nodes and production fabric

**Code engineering**

- Extend the non-executable Node SDK with a separate executable runtime:
  credential broker, order-scoped capability handles, adapter sandbox,
  signed occurrence receipts, revocation, lease expiry, and reconnect.
- Keep account cookies, OAuth refresh tokens, wallets, local device rights, and
  robot authority on the node that owns them.
- Define one job protocol that can travel over HTTPS, WebSocket, MCP, A2A, or a
  queue without changing transaction meaning.

**Production execution**

- Deploy a portable coordinator plus durable job/event storage. Cloudflare
  Workers, Queues, Durable Objects, and browser execution may be one operator;
  they must not be the only possible operator.
- Add leases, bounded concurrency, event wakeups, dead-node recovery,
  deployment pinning, and metrics for queue latency, seller latency, drift, and
  ambiguous effects.
- Support user-device/local-daemon, browser-extension, merchant-server,
  marketplace, robot/embodiment, resource-owner, and witness node classes.

**Real-world closure**

- A second device or independently operated process claims an order-scoped job,
  uses a locally held account/session, and returns a signed replayable receipt.
- Turn off the founder machine and central account credentials; the route still
  completes or honestly returns `UNAVAILABLE`.

**Exit gate**

- Secret material transmitted to the central coordinator is zero.
- A node can disappear and reconnect without duplicate effects or lost order
  state.
- At least two independently administered execution nodes pass conformance.

### Phase 5 — General Formation Engine and commit-ready temporary networks

**Code engineering**

- Replace milestone-specific SKU and locality wiring with Outcome IR -> query
  plan -> candidate scoring -> capability binding.
- Connect the existing bounded discovery worker pool to remote/edge nodes and
  all supported rails.
- Fan out candidate quotes and prepare `PRIMARY`, `RECOVERY`, and
  `INDEPENDENT_WITNESS` slots in parallel through the existing atomic
  coordinator.
- Model lease TTL, price expiry, cancellation/compensation, evidence coverage,
  payment route, maximum loss, and formation deadline explicitly.

**Production execution**

- Keep formation alive in the background through durable events rather than a
  terminal process or user-held browser.
- Present exactly one authorization proposal containing the chosen outcome,
  all-in ceiling, deadline, address/scope, material substitutions, and maximum
  loss.
- If all required slots do not close by the formation deadline, continue only
  under an authorized background search policy or return `UNAVAILABLE`; never
  route to Outsider operations staff.

**Real-world closure**

- From an empty Outsider provider database, form a real three-role network for
  the first physical milestone using public/buyer-native rails and external
  witnesses.
- The simple item must exercise the same modules needed by later complex work:
  multiple candidates, destination-bound total and ETA, authority, primary,
  recovery, independent witness, payment route, lifecycle, and recovery.

**Exit gate**

- `READY_FOR_PRINCIPAL_AUTHORIZATION` is emitted only when all non-payment
  commitment prerequisites have real leases or explicitly bounded semantics.
- No seller page, cart, ATP response, model score, or server acknowledgement is
  mislabeled as reserved capacity or independent truth.

### Phase 6 — Payment mandate, idempotent commit, and first real order

**Code engineering**

- Introduce a separate `PaymentMandate`/payment capability whose scope, amount,
  payee, expiry, and reuse rules cannot be inferred from formation authority.
- Support standards such as AP2/UCP where adopted, merchant-hosted checkout
  handoff, wallet-token flows, or a compliant PSP without making Outsider a
  general custodian.
- Implement idempotent place-order, provider-native client reference,
  timeout reconciliation, receipt parsing, and safe cancel paths.

**Production execution**

- Ask the user once for the exact transaction authorization. Payment remains a
  hard external gate in this project unless separately approved.
- Persist the intended commit before sending it and reconcile ambiguity before
  any retry.
- Return merchant order identity and lifecycle subscription, not a screenshot
  of a confirmation page.

**Real-world closure**

- Complete one low-loss physical purchase and delivery request through a
  machine rail with zero Outsider employee touches.
- Obtain a genuine merchant order ID and provider receipt. A cart or checkout
  URL is not completion.

**Exit gate**

- A repeated commit command cannot create a duplicate order or charge.
- The address-bound all-in amount and delivery window were refreshed before
  authorization.
- The order is still only an execution fact, not yet a verified outcome.

### Phase 7 — Longitudinal outcome, independent witness, and automatic recovery

**Code engineering**

- Ingest merchant, carrier, device, owner, and independent witness events into
  the same Episode/Attempt graph with exact source and occurrence semantics.
- Add deadline timers, missing-event detection, adapter drift quarantine,
  primary failure activation, recovery obligations, compensating cancellation,
  return/refund, challenge, and external adjudication routes.
- Keep vendor-native safety and logs as inputs; Outsider never replaces robot,
  vehicle, appliance, or platform-native safety controls.

**Production execution**

- Run event-driven lifecycle workers across process restarts and multi-day
  fulfillment.
- Use a witness independent of the primary seller's self-report for the frozen
  acceptance test.
- Activate the already reserved recovery path automatically when the relevant
  failure predicate becomes true.

**Real-world closure**

- Complete and independently verify the first delivered Outcome.
- Run one bounded failure exercise proving cancellation/recovery without an
  employee entering the order path.

**Exit gate**

- The Episode closes as `OUTCOME_VERIFIED`, `RECOVERED`, or an honestly scoped
  unresolved challenge based on external evidence.
- Every lifecycle event binds to a prior command/occurrence and survives cold
  replay.
- First Governed Reality Episode certifies the network path; it is not treated
  as the whole product.

### Phase 8 — Federated global expansion and order-produced capacity

**Code engineering**

- Publish the Node SDK/conformance suite, signed adapter distribution,
  revocation feeds, portable registries, and multi-operator routing.
- Add more vertical IR profiles only where they preserve the same lifecycle:
  goods, booking, human services, cloud resources, property access,
  transport/logistics, and embodied work.
- After successful fulfillment, let a resource owner optionally issue an
  expiring, revocable Capacity Grant scoped by task, geography, price, time,
  quantity, evidence, and liability boundary.

**Production execution**

- Route by protocol family, capability, and live evidence rather than an
  Outsider BD list.
- Operate multiple independent discovery indexes, clouds, edge operators,
  account nodes, and witnesses so no founder credential is a single point of
  reach or control.
- Measure coverage by outcomes that can be formed and committed, not provider
  row count.

**Real-world closure**

- Complete full temporary networks in at least two geographies, on two
  independently operated node sets, across at least two verticals.
- Demonstrate that disabling one search provider, one cloud, and all founder
  accounts still yields a successful route or an honest `UNAVAILABLE` result.
- Demonstrate the flywheel: first order uses public rails, a later order reuses
  a verified route, and an optional later order uses standing capacity.

**Exit gate**

- New coverage is created by protocols, platform-family adapters, Edge Nodes,
  and order-produced Capacity Grants, not employee outreach throughput.
- No single central terminal, search account, or cloud defines the network.
- Expansion of `PRICE`, `GUARANTEE`, or `SETTLE` remains deferred until real
  complete episodes, external owner adoption, explicit authority,
  capital/custody/adjudication, and longitudinal evidence exist.

### Cross-phase release gates

No phase may bypass these gates:

| Gate | Required evidence |
| --- | --- |
| Authority | The principal/resource owner granted the exact scoped action; structural conformance never mints authority. |
| Transaction state | The provider operation proves exactly the state claimed; quote, cart, ATP, hold, reserve, and order remain distinct. |
| Idempotency | The provider effect has a native client reference or deterministic reconciliation before retry. |
| Privacy | Raw sources and secrets remain private with mode `0600`; public projections are minimized. |
| Provenance | Exact bytes, source revision, time, occurrence, and adapter version are replayable; old history is never edited. |
| Recovery | Consequence reach is bounded by a funded/authorized recovery route or the product declines the commitment. |
| Outcome | Independent evidence satisfies the frozen acceptance test; provider claims and model reward are not independent truth. |
| Labor | Any Outsider employee touching a normal order is counted as a product failure, not hidden as operational success. |

### Program sequence and concrete milestones

The phases overlap; the critical dependency order is:

```text
0 truth map
  -> 1 deterministic hot path
  -> 2 reusable live rails
  -> 3 trace-to-adapter compiler
  -> 4 decentralized production nodes
  -> 5 complete commit-ready formation
  -> 6 payment and first real order
  -> 7 verified outcome and recovery
  -> 8 federated multi-vertical expansion
```

Near-term milestones are intentionally end-to-end rather than feature-count
milestones:

1. **Machine formation:** current physical Outcome reaches its strongest honest
   pre-payment state from one command, with no model/browser/operator hot-path
   work.
2. **New-seller generalization:** an unhardcoded seller on a supported platform
   reaches address-bound checkout readiness through a reusable adapter family.
3. **Edge independence:** a second independently administered node executes the
   order-scoped capability while secrets remain local.
4. **First order:** one authorized low-loss order produces a merchant ID and a
   durable lifecycle without employee intervention.
5. **First verified network Outcome:** primary, recovery, and independent witness
   close a complete Episode, including one bounded recovery exercise.
6. **Federated proof:** a second geography and vertical succeed without any
   founder-held discovery, cloud, account, or browser dependency.

The first physical item is useful only because it can exercise the entire
future architecture at low loss. Delivering the item through bespoke automation
would fail the milestone even if the parcel arrives.

## Production checkpoint — 2026-09-04 v9

### Best Buy source replay enters the unified production path

This checkpoint appends to v8. It does not mutate v8 or any earlier live-run
artifact. Two immediate descendants first ended honestly as
`SOURCE_UNAVAILABLE_HOLD`: the run at
`.outsider/private/first-physical-unified-preflight-20260904-8AeKeU` observed at
`2026-09-04T16:20:45.001Z`, projection hash
`sha256:1c79b12b2abf16c61b89b17a29787d1b39e44e4bdbaed5e116f52d647d041826`,
and the run at
`.outsider/private/first-physical-unified-preflight-20260904-WoluMX` observed at
`2026-09-04T16:21:01.245Z`, projection hash
`sha256:d39f1b7b9d331e6418ddaeab2de1f99e2af5a32ea5676f878a9faa5f68c7ab91`.
Both failed descendants remain frozen. The successful third descendant
explicitly supersedes the second projection and does not erase either failed
occurrence.

At `2026-09-04T16:22:18.787Z`, the unified live runner completed that third
descendant at
`.outsider/private/first-physical-unified-preflight-20260904-srycpy`. It made
19 real seller HTTP requests: two Target GETs, five Adafruit GETs and one
Adafruit POST, plus seven SparkFun GETs and four SparkFun POSTs. Five requests
were non-GET. The unified occurrence census retained 15 buyer-native
transaction occurrences plus one product-formation occurrence, separately
from object deduplication, and bound 1,766,437 exact private source bytes.

Best Buy is no longer merely a detached candidate report. Three source-pinned
exact-byte occurrences entered this same model/compute, physical product, typed
`PrincipalEpoch -> AccountableDeployment -> Runtime/Embodiment -> Delegation
-> Episode -> Attempt`, and Episode Data Engine path. They are the 200,171-byte
product source, SHA-256
`cdec98899a7eddbc333b4391498bd8470f6daeccf597e382ece13dace2ce5529`;
the 200,135-byte anonymous-cart source, SHA-256
`9733f734f213b6569e5abda97d3a4bd181df681f10b73318141bdd55662f81ba`;
and the 73,336-byte guest-checkout source, SHA-256
`507f12553be14314c8c58d09dd847ac24f2a933fd1bf82471bdac5f79922697b`.
Their 473,642 bytes are stored as three private raw objects and remain three
occurrences; exact-byte object retention does not collapse the event census.
The source-pinned replay is an unselected parallel candidate and does not
silently alter the atomic primary, recovery, or witness slots.

The evidence payload contains 96 files and 4,129,068 bytes, with set hash
`sha256:75d8da628f1fead9c6fe50bf367e96414ca55a4e85a023eed151bd4c8287f4a2`.
Its 27,018-byte evidence inventory has file SHA-256
`b9f78a71afbce66eacfb4d92108ae74bd679b988a68409c2e1bd25d0c468b4b3`.
The 11,338-byte public summary has file SHA-256
`d9b86e4e21834ccfe23487f808160f2c00f07136ea74c916bd59a1c0f7068a3e`
and projection hash
`sha256:201a84b1a3471ddafcca91c0fded6ad1d91ea9e1c5dbfc5a88399ca248c04730`.

The run remains `COMPLETED_HOLD`, with decision state `HOLD` and workflow state
`NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA`. No street address or contact data
was transmitted, checkout was not started, and no payment, order, capacity
reservation, external witness request, independent outcome, or outcome promise
was issued. Best Buy remains unselected because the observed item is a
two-cable pack while the frozen Outcome requests one cable, the cart is not a
capacity reservation, and its displayed ETA is not binding before order. The
next transition therefore still requires explicit surplus authorization or an
exact single-unit route, followed by authorized full-address/contact formation;
it cannot be promoted to a purchase-and-delivery commitment by source replay
alone. `C_enabled` remains a subset of proven authority.

## Product execution activation — 2026-09-04 v11

This append-only checkpoint activates the complete v10 phase plan as the
current engineering plan after v9. It does not rewrite any earlier checkpoint
or frozen occurrence. Work proceeds on code engineering, production execution,
and real-world closure in parallel; a green code test never substitutes for an
external transaction or independently verified Outcome.

### Current position across the complete plan

| Phase | Code engineering | Production execution | Real-world closure |
| --- | --- | --- | --- |
| 0. execution truth | Active path distinguishes live, replay, and simulation; frozen typed graph and source pins retained. | Machine outputs carry the execution class and no staff queue exists. | Existing seller observations replay honestly as `HOLD`; this remains a maintenance gate. |
| 1. deterministic hot path | Finite hash-pinned `QUOTE/HOLD/STATUS` runtime implemented; all consequential operations remain in the atomic coordinator. | Formation Job Worker, SQLite Durable Object store, and Node executor compose into one hash-only job path. | Best Buy frozen bytes run with zero model/UI/staff actions and never claim live freshness. |
| 2. canonical IR and family adapters | Magento/SparkFun full-address pre-payment stage implemented; broader transaction IR and second seller binding remain. | Exact adapter/version and private parameter bindings are loaded from a trusted executor registry. | A 12-request no-payment route reaches address-bound totals in fixture E2E; authorized live full-address execution remains pending. |
| 3. trace compiler | Not started beyond existing bounded transports and manually authored adapter patterns. | No production trace-to-adapter canary service yet. | Best Buy remains source replay, not a live compiled protocol. |
| 4. Edge Nodes | Hash-only remote job protocol and private Node executor are the first executable-node slice. | One Cloudflare Worker/DO bundle and one local Node service exist; portable multi-operator deployment and signed adapter distribution remain. | No independently administered second node has completed an external transaction. |
| 5. general formation | Existing Outcome compiler, discovery pool, atomic primary/recovery/witness coordinator, and new worker are not yet unified behind one general service. | Durable background job primitive exists; complete three-slot formation service remains. | No real primary + recovery + independent-witness network is yet commit-ready. |
| 6. payment and first order | Payment mandate and idempotent commit are deliberately outside the precommit runtime. | No payment credential or order authority has been installed. | Zero order submissions and zero payments in this checkpoint. |
| 7. lifecycle and recovery | Existing Episode/Attempt, witness, obligation, challenge, and recovery contracts remain the foundation. | They are not yet connected to a live merchant/carrier lifecycle worker. | No delivered Outcome or real recovery exercise yet. |
| 8. federated expansion | Node SDK/conformance and standing-capacity contracts exist as foundation, not as completed global execution fabric. | No multi-operator, multi-cloud production routing yet. | No two-geography/two-vertical federation proof yet. |

### Code-engineering descendant now implemented

`src/outsider-deterministic-buyer-native-plan-runtime-v1.js` now compiles a
finite plan whose request bytes remain private and whose public plan pins every
request hash, adapter capability binding, formation expiry, operation expiry,
route role, transaction, and Outcome. It accepts no prompt or arbitrary URL.
Its hot path reports zero model calls, interactive browser actions, employee
touches, user-babysitting actions, and manual queue enqueues.

The runtime now rejects `RESERVE`, `COMMIT`, `CANCEL`, and `RECOVER`; those
remain exclusive to the authority-bearing atomic coordinator. It also requires
the exact factory-issued capability object and preflights the capability,
formation, and every stage expiry before the first possible provider effect.
This prevents an already-expired later stage from stranding an earlier live
hold. The current runtime SHA-256 is
`f8de96047ed8f013cc7004516cb8c1764e5e792ef2928bc2edbe2a8fd2c57bd5`.

### Production-execution descendant now implemented

The production slice consists of:

- `src/outsider-formation-job-worker-v1.js`, SHA-256
  `6fa97b1b67e1123f8640d9f84e0d1c9462b5b56c03614cfec52e263cf6fb9aaa`;
- `src/outsider-cloudflare-sqlite-do-formation-job-store-v1.js`, SHA-256
  `209728a260544af8ab27156c661a124421e5f2982872dc4900f4c4869f869a8b`;
- `deploy/cloudflare-formation-job-worker/src/worker.mjs`, SHA-256
  `12e897a5277fc13cacb89b0d0364d100dbdde987525908598631bbbaebe16c71`;
- `src/outsider-node-deterministic-executor-service-v1.js`, SHA-256
  `c6af2274be51c80d82a366d750596481ca9f77d4e041fda0a094b52ec1fe67ba`.

The public network job contains only hashes and version identifiers. The
Formation Worker derives a Durable Object identity from `orderId + planHash`,
claims before invocation, and exact-replays its receipt. The Node executor
loads an immutable private adapter/plan/capability/parameter registry at
startup; a network caller cannot inject code, URLs, credentials, or a new plan.
It derives its transaction journal identity from the same order and plan.

The local end-to-end proof executes Formation Worker -> Node executor ->
buyer-native transaction runtime. The first request invokes the provider once;
same-store receipt replay remains at one provider call, and a fresh Formation
store still replays the transaction journal without another provider call.
Mismatched parameter, graph, capability, or invocation hashes fail while
provider calls remain zero. The Cloudflare bundle dry-run is 39.79 KiB, 9.96
KiB gzip, with the Formation Durable Object binding. It has not been publicly
deployed and holds no live provider secret. A single deployment now has a
unique durable claim, but global multi-operator lease ownership and generic
signed adapter rehydration remain Phase 4 work.

### Real-interface descendant now implemented

`src/outsider-sparkfun-magento-full-address-prepayment-stage-v1.js`, SHA-256
`f89ec42207bb1e4b7988ec760d14973d543515820feb0c766ce65e2069f75fb4`,
and `scripts/outsider-sparkfun-full-address-prepayment-live-runner-v1.mjs`,
SHA-256
`d8ace630fd3eceb134de21d643c48589e6d9edb1caf54ca860fd749b77045977`,
implement the current Magento-family machine route:

```text
0600 private Outcome input
  -> live catalog
  -> isolated guest cart
  -> full-address shipping-rate request
  -> deterministic all-in budget selection
  -> shipping-information
  -> cart and total reconciliation
  -> READY_FOR_PAYMENT_AUTHORIZATION or honest HOLD
```

The runner exposes only `--live-no-payment`. Its complete fixture E2E issues 12
HTTP requests, seven GET and five POST, and reaches 1,983 cents under a 2,000
cent ceiling. Payment endpoint attempts and order endpoint attempts are both
zero. The route's honest terminal state is
`READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD`: Magento returns the
address-bound total but no structured delivery-date proof. No real
full-address request was sent in this descendant because authorized recipient
first name, last name, email, and phone are not present; these values will not
be fabricated. The already supplied street/city/state/postal/deadline/budget
remain the intended Outcome inputs.

### Corrected frozen-source replay descendant

The current Best Buy deterministic replay uses the immutable capture at
`2026-09-04T16:09:59.684Z` and pins three files totaling 473,642 bytes. It does
not renew their validity at replay time. The v2 pair at
`.outsider/private/bestbuy-deterministic-hot-path-replay-20260904-fedcba9876543210fedcba9876543210`
used plan hash
`sha256:324e9dd1ce8e3af3d12a17c782c6baef8dbbe096a63f754da9142eed60167082`.
The first pass read three frozen sources and produced projection hash
`sha256:2c2f000e46f6c7808e420b1b312c44f85f1bc58e51c3933c928c8d7896dfe92c`;
the second pass read zero sources, journal-replayed all three stages, and
produced projection hash
`sha256:3ba716e9c4d5bcd6e08b6cad01b48779aa93b346055a45bcd861a4e6dead9cd5`.
Both explicitly report historical source, zero live HTTP calls, and
`sourceValidAtReplay: false`.

### Verification and immediate execution order

One focused run covered the deterministic runtime, Formation Worker, Durable
Object composition, Node executor, buyer-native transport, Best Buy source
adapter, SparkFun full-address stage/runner, and atomic temporary-network
coordinator: 35 tests passed, zero failed or skipped, in 2.594 seconds.

The immediate build order is now:

1. run the authorized SparkFun full-address no-payment route from a 0600 local
   input and capture exact live responses;
2. obtain a machine-readable delivery-date route or reject SparkFun for the
   deadline-constrained slot rather than interpreting prose;
3. bind this live adapter to the deployed Formation Worker and Node executor,
   then prove restart-safe execution on an independently administered node;
4. generalize the Magento binding to a second seller and begin the Protocol
   Trace Compiler for a seller without a stable direct API;
5. form real primary, recovery, and independent-witness leases before asking
   once for a separately scoped payment mandate;
6. place the first low-loss order only after that mandate, reconcile a genuine
   merchant order ID, follow lifecycle events, verify delivery independently,
   and exercise bounded recovery;
7. repeat without founder credentials in another geography and vertical, then
   admit optional expiring Capacity Grants produced by completed orders.

No cart, seller acknowledgement, fixture, model score, or historical replay in
this checkpoint is labeled a capacity reservation, order, or verified Outcome.
There is no `SEND_TO_OPERATIONS` fallback. `C_enabled` remains a subset of
proven authority.

## Formation-to-real-interface bridge — 2026-09-04 v12

This append-only descendant advances the first immediate v11 integration step.
`src/outsider-sparkfun-magento-formation-node-composition-v1.js` now binds one
canonical 0600 private Outcome input to one hash-only Formation Job and a
factory-issued SparkFun/Magento executor. Its SHA-256 is
`e3168aadcf5feb62f0970935a8242564be9fd87901d4b781f94c0428a784f813`
for 13,207 bytes. Raw address, contact, cart/session state, credentials,
arbitrary URLs, payment material, and executable code do not cross the job
boundary.

The stable runner nonce is derived from `jobKey`. On execution, the node
revalidates the complete job identity, actual current time against the issued
and expiry window, and the current private-input bytes against the pinned
parameter-envelope hash before calling the provider route. The actual clock
instant, not job issuance time, becomes the source observation time. On process
restart the node locates exactly one matching execution directory, verifies the
projection and manifest hashes, input binding, observation window, and
no-payment/no-order boundary, and returns the existing result. Zero matching
directories permits the first execution; a partial directory returns
`UNKNOWN / DO_NOT_RETRY`; multiple matching executions fail closed.

The focused end-to-end test performs:

```text
hash-only Formation Job
  -> durable Formation Worker claim
  -> factory-issued node executor
  -> existing four-stage SparkFun machine runner
  -> four source-occurrence hashes
  -> machine receipt
```

Its injected Magento transport sees 12 requests. The first run ends honestly
as `HOLD / READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN / CONFIRMED`; payment
and order endpoints remain zero. Same-store replay and a newly constructed
composition with a fresh Formation store both remain at 12 requests and return
the same occurrence lineage, proving no duplicate cart/checkout-preparation
effect in this tested restart path. The public job, composition projection,
and receipt contain none of the fixture street, email, phone, postal code, or
masked cart ID. The new 8-test focused set passes with zero failures; its test
file SHA-256 is
`268d2b6f2f1fe07c97bd97cd67fe5e56ca4b6d41a5f509b9891a6efc55b70ab1`.

This is a real production composition path over an injected transport, not a
claim of a new live seller interaction. The next real transition remains one
authorized 0600 recipient/contact envelope and a fresh no-payment invocation,
followed by a separate machine-readable ETA route. It still cannot emit
capacity, payment authorization, an order, a verified Outcome, or a user
commitment. `C_enabled` remains a subset of proven authority.

## First full-address machine formation — 2026-09-04 v13

This append-only descendant records the first real execution of the v12 bridge.
It reused the existing frozen physical Outcome Program and the existing typed
`PrincipalEpoch -> AccountableDeployment -> Runtime/Embodiment -> Delegation
-> Episode -> Attempt` lineage. No new identity was inferred from an IP,
device, base model, or global score.

At `2026-09-04T17:38:52.434Z`, a local Formation Worker claimed one hash-only
job and invoked the factory-issued SparkFun/Magento executor. The executor used
the host's real HTTPS implementation and performed 12 provider requests: seven
GET and five POST. Because the HTTPS function entered through the executor's
injected dependency boundary, the frozen projection conservatively records
`INJECTED_HTTPS_TRANSPORT`; this label is not upgraded after the fact even
though the calls reached the live SparkFun origin.

The real provider sequence loaded the product, created an isolated guest cart,
added one item, submitted the authorized full delivery/contact profile for
shipping calculation, received nine applicable carrier methods, selected UPS
Ground deterministically, submitted the selected method, and reread the cart
and totals. The product subtotal was USD 7.95, selected shipping was USD 10.22,
tax returned as USD 0.00, and the address-bound total was USD 18.17 under the
USD 20.00 ceiling. SparkFun accepted the address and selected shipping method
and returned three payment-method types, but no payment material was supplied
or selected.

The result contains four exact source occurrences and ends at
`READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN`. Model calls, interactive
browser actions, Outsider employee touches, user-babysitting actions, payment
endpoint attempts, order endpoint attempts, payments, and order submissions
are all zero. All 14 files are mode 0600 and all seven directories are mode
0700. To avoid turning user-related data into linkable public pseudonyms, the
private input, exact response hashes, destination commitment, run identifier,
and raw artifact-set hash remain in the private manifest and are intentionally
not copied into this repository plan.

A separate cold process then rebuilt the same composition with a fresh
Formation store and a transport that would fail if invoked. It found and
verified the one completed execution directory, returned the same four-source
lineage, and made zero fetch calls. This proves restart-safe non-duplication for
the observed cart and checkout-preparation path.

The live source offered UPS Ground, UPS 2nd Day Air, FedEx Ground/Economy/2Day/
Overnight, and USPS Ground Advantage/Priority. Only UPS Ground and USPS Ground
Advantage kept the current item below the USD 20 ceiling. Neither source
response contained a structured arrival date. SparkFun's published policy says
in-stock qualifying paid orders before its cutoff may receive same-day
shipment, while UPS Ground is estimated at one to five business days after
shipment. Therefore the machine formation may continue automatically, but it
does not yet convert the September 10 deadline into a guarantee. Payment and
order authority remain absent.

## Machine federation, foundation ranking, and edge execution — 2026-09-04 v14

This append-only descendant records the transition from a single live seller
probe to a multi-source, machine-operated formation product state. It does not
change the north star: every Outcome creates its own temporary network; the
network is not prebuilt by staff outreach, and no seller acknowledgement or
ranking score is promoted into authority, capacity, or independent Outcome
truth.

### Existing model, actuarial, data, and causal foundations enter search order

`src/outsider-formation-candidate-ranking-bridge-v1.js`, 18,852 bytes and
SHA-256 `86e88be26bdade0009793af78988bd05e94bfbca6780a7341947733b30029926`,
now reuses the existing Outsider foundations in the real formation path:

- correlated observations collapse under outcome-blind predictive group
  roots before they can contribute evidence;
- candidate success is represented by the five-percent lower quantile of a
  Jeffreys Beta posterior rather than a raw success fraction;
- causal claims must pass the existing causal-proof validator;
- recovery and witness routes are penalized when they share a failure domain
  with the primary route;
- a predictive model contributes zero unless a fixed group-disjoint holdout,
  excluded audit reserve, AUC improvement, log-loss, and calibration gate all
  pass. Even after promotion its maximum contribution is 0.15 and its effect is
  `FORMATION_SEARCH_ORDER_ONLY`.

The concrete v1 materializer is 18,109 bytes with SHA-256
`babc5def873adb02ac34743d5c28d4047cd2b61def0c36fb71a818c29c94080c`.
Against the actual frozen physical Episode and SparkFun seller projection it
read 13 report occurrences, zero complete candidate-bound independent Outcome
observations, zero causal proofs, and therefore emitted `KEEP_BASELINE`. This
is an intentional zero, not missing instrumentation: a cart or provider quote
is not counted as completed delivery evidence.

### Low-risk formation continues without a human HOLD

`scripts/outsider-first-physical-formation-decision-runner-v1.mjs`, 10,407
bytes and SHA-256
`9d5c783c68a4c92adb95774b1cb79802cd4073b20d23304c451b6dab01e36f64`,
turns the materialization into a write-once 0600 product state. It separates
three concepts that must not be conflated:

```text
formationOperationalState = CONTINUE_AUTONOMOUSLY
outcomePromiseState       = NOT_COMMITTED
paymentState              = AUTHORIZATION_REQUIRED
```

The actual SparkFun state contains the USD 18.17 address-bound total and the
USD 10.22 UPS Ground method, reports `userActionRequiredNow=false`, creates no
human queue, and cold-replays the same 3,236-byte state without a provider
request. `HOLD` is absent from the persisted product state. The missing
structured delivery date remains a commitment blocker, but it does not pause
safe machine discovery.

### Second live seller source and multi-source product state

Target's public RedSky interface had drifted from the frozen v1 adapter: a bare
JSON request received 403, while the seller's current public web request
profile requires browser-equivalent `User-Agent`, `Origin`, and `Referer`
headers. The frozen v1 was not edited. The v2 descendant is
`src/outsider-target-redsky-candidate-route-v2.js`, 14,431 bytes and SHA-256
`808450518d4c3b11e11d4e5cef1055223ea0e3d6ca0ce325556ae5a6c99eed54`.
It permits only the two pinned RedSky GET paths and carries any seller-issued
session cookie only inside the 0600 order scope.

At `2026-09-04T18:04:33.694Z`, the v2 runner performed two real HTTPS GETs in
approximately 0.507 seconds of process wall time. The PDP occurrence contained
11,684 source bytes with SHA-256
`e019dc7c763619cbc0f4484f676d6f83e767da738d046ecd64d088106085c28d`;
the fulfillment occurrence contained 1,436 source bytes with SHA-256
`e20c198078307ed593e51ee1aa070d0666099632bc10f8474d250b8cb31a277d`.
The current seller facts were USD 5.99, `IN_STOCK`, available-to-promise ten,
and a source delivery date of September 6. The standard-shipping threshold was
USD 35.00, and scheduled delivery was USD 9.99 before tax.

Target remains observation-only because the seller source does not explicitly
state 5 V, account authority is absent, and neither a full-address all-in total
nor capacity is established. This is a hard product rejection before ranking;
no model score can override it.

`src/outsider-first-physical-formation-ranking-materializer-v2.js` and
`scripts/outsider-first-physical-formation-decision-runner-v2.mjs`, with
SHA-256 values
`4cd8b315171b8e760edd7644d35edb68c9b79bec50dc006cf77796eaab8c0da0`
and
`25e2e36c38106319caf61e995a43ccfe19bfb7935f47bddfae0a26ee42e68478`,
consume SparkFun and Target as two independent frozen seller inputs. The real
multi-source product state has hash
`sha256:174adf82205ee1a6c40a19ff3e4647dd52ec56b59959128db736ef01b05ebc00`,
continues autonomously, and projects neither destination/contact data nor
source, candidate, location, or PII-derived hashes.

### Deployable edge executor removes the workstation from the hot path

`src/outsider-cloudflare-sparkfun-executor-v1.js`, 43,757 bytes and SHA-256
`3b6186bba2c0fafdb5b6bbb8afe5b0f1b067c61917591b6c20f3350633b36c34`,
and `deploy/cloudflare-sparkfun-executor-v1/` implement the same finite
12-request Magento path as a Cloudflare service-bound deterministic executor.
It accepts only an exact hash-only Formation Job and the frozen typed graph. A
provider-specific private envelope is supplied only through a Worker secret,
is byte-bound before the first effect, and is retained with exact provider
exchanges in a job-keyed SQLite Durable Object with no read route. The attempt
is claimed before the first request; a completed job cold-replays with zero
provider calls, while an orphaned attempt is never retried.

The Worker contains no prompt, model, browser, arbitrary URL, payment endpoint,
or order endpoint. The Formation Worker service-binding contract passes end to
end. A focused review found no remaining P0/P1 issue after correcting the new
Durable Object migration to `new_sqlite_classes` and making `/healthz` validate
the complete registration-secret binding. Wrangler 4.124.0 produced a clean
68.77 KiB upload, 16.59 KiB gzip, in dry-run mode.

The final focused and adjacent run covered the edge executor, Formation
Worker, local SparkFun executor, both product-state descendants, Target v1/v2,
the foundation ranking bridge, and the Adafruit contact-capture seam: 32 tests
passed, zero failed, skipped, or cancelled. `git diff --check` was clean.

### Current reality boundary and immediate activation order

No payment was attempted and no order was submitted. The current real network
therefore contains two independent seller observations, one address-bound
prepayment route, zero reserved primary/recovery capacity, and zero independent
delivery witness. It is a real machine formation, not yet a completed Outcome.

The next order is:

1. receive provider-specific consent to send the private contact/address fields
   to Adafruit solely for a no-payment shipping quote, then execute the already
   built second-seller route;
2. compile a fresh, short-lived SparkFun edge registration, set the private
   envelope as a Cloudflare secret, deploy the executor, and bind the exact
   plan triple to the Formation Worker;
3. dispatch the same typed Episode through that hosted path and verify an
   external cold replay with zero duplicate seller effects;
4. acquire a deadline-bearing primary, an independent recovery route, and an
   independent delivery witness; only after all non-payment gates close should
   the product request one separate payment mandate;
5. after payment authorization, execute exactly one idempotent order, reconcile
   the merchant order identity, observe delivery independently, and exercise
   recovery if the accepted Outcome is not achieved.

Raw private-envelope hashes stay service-private. Before broad federation they
must become order-secret keyed commitments so a public projection cannot act
as a stable pseudonymous identifier. No existing artifact is rewritten to make
that future improvement appear retroactive.

## Hosted formation activation and superagent boundary — 2026-09-04 v15

This append-only descendant records the first production deployment of the
finite machine formation path and makes the product boundary against a general
agent falsifiable. It supersedes neither v14 nor any frozen Episode artifact.

### Production activation without pretending readiness

The service-only SparkFun executor is deployed as Cloudflare Worker version
`b72fc09b-14f7-45ee-a7b7-75cf18a9b37e`. It has no public target. The public
Formation Worker is deployed at
`https://outsider-formation-job-worker.outsider-guard.workers.dev` as version
`d8639d00-4b51-417a-b811-43b28f2a5cc7` and reaches the executor only through
an exact Cloudflare service binding. The registration, one-entry adapter
allowlist, and dispatch bearer are secrets rather than source variables.

The live health result reports one registered plan and a present service
binding, while `executorConfigurationReady=false` and
`productionExecutionReady=false`. This is correct: the private provider
envelope was not uploaded because destination-specific consent for storing the
contact/address fields in that Worker secret was not established. No dispatch,
seller effect, payment, or order occurred. Code deployment cannot promote
itself into action authority or Outcome readiness.

The new hosted execution is represented as a new content-addressed Attempt,
ordinal 2 and relation `RETRY`, under the existing Episode. It does not reuse
the previous Attempt and call a new external effect a replay. The descendant
Attempt-set composition revision 16 verifies while preserving the existing
PrincipalEpoch, AccountableDeployment, Runtime, Delegation, and Episode
ancestors.

Relevant implementation artifacts are:

- `src/outsider-formation-transport-validation-attempt-v1.js`, 8,319 bytes,
  SHA-256 `44f35a292c8b5f0703d743c62f293db04eb7ece5cc561fb89d67d644419eddaf`;
- `scripts/outsider-cloudflare-sparkfun-activation-v1.mjs`, 5,812 bytes,
  SHA-256 `c76856387d7f6836764e324325a9697c098e440dbaae8fcbf5d7d8f7aa72e352`;
- the Formation Worker entry point, 10,119 bytes, SHA-256
  `0a36f698632d4c11176e9415378f3935d9ad6a974729ec9089dde8ada9eb80f0`;
- the service-only executor entry point, 8,400 bytes, SHA-256
  `36580c2d4927baa50da292b0fe08c7b68766086babd775ff89269359da34393b`.

The deployed executor bundle is 68.77 KiB, 16.59 KiB gzip, with 21 ms startup;
the Formation Worker bundle is 40.83 KiB, 10.10 KiB gzip, with 13 ms startup.
The focused Cloudflare contract and activation suite passed 10/10; an adjacent
set covering the live-quote seam, Target, ranking, and product state passed
14/14. Both dry builds and scoped diff checks were clean.

### General agents are execution clients, not the product

Outsider has no defensible product if it is merely a model plus search,
connectors, browser control, planning, checkout, and receipts. Those functions
belong to interchangeable agent clients and commerce protocols. Current
primary-source evidence already shows the direction:

- ChatGPT full MCP apps support write/modify actions and multi-app complex
  orchestration:
  https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta
- OpenAI and Instacart connect intent, cart construction, checkout, payment,
  and doorstep fulfillment:
  https://openai.com/index/instacart-partnership/
- UCP standardizes capability discovery, checkout, order lifecycle,
  fulfillment extensions, and REST/MCP/A2A transport:
  https://github.com/Universal-Commerce-Protocol/ucp
- AP2 specifies signed mandates and receipts but leaves operational dispute
  resolution, retention, and retrieval outside its current scope:
  https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md
- Visa Trusted Agent Protocol standardizes recognizable signed agent requests:
  https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications/
- W3C Verifiable Credentials standardizes verifiable claims while leaving
  application-specific validation and trust policy to verifiers:
  https://www.w3.org/TR/vc-data-model-2.0/

Accordingly, connector count, generic planning quality, browser automation,
payment mandates, cryptographic receipts, and an append-only graph are inputs,
not a moat. Outsider's irreducible role is an agent-neutral Outcome clearing
and assurance network. It must turn reach into a pre-action conjunction of:

```text
signed owner authority
and primary capacity reserved for the exact Outcome and deadline
and recovery capacity reserved in an independent failure domain
and an independent witness committed to the acceptance predicate
and bounded loss backed by callable recovery or capital
and an external adjudication path
```

It returns either that resourced `COMMIT` or an honest `UNAVAILABLE`. A strong
agent may propose, discover, negotiate, execute, or observe, but its confidence
and self-report cannot satisfy any missing conjunct.

### The substitutability and economic tests

Every future product increment must pass the following architecture test:

> Replace the planner/executor with Codex, Gemini, Claude, a local model, or a
> deterministic program. Do the signed authority, reservations, witness,
> recovery obligation, capital, and adjudication remain valid and executable?

If not, that increment is a superagent wrapper and must not be counted as
Outsider progress. Two independent agent clients must eventually produce the
same valid Outcome contract without becoming identities in the network graph.

There is no claim of a natural moat. If a model vendor builds the same external
obligation, reservation, independent-witness, recovery, capital, and
adjudication network, it is a direct competitor. The race Outsider chooses is
therefore external adoption and accumulated responsibility, not model quality:

1. an open Outcome Contract adopted across agent vendors;
2. resource-owner one-use obligations and revocable standing capacity;
3. rights-cleared, independent, longitudinal primary/recovery/witness Episodes;
4. calibrated deadline survival, correlated failure, causal recovery effect,
   tail loss, and reserve estimates from those Episodes;
5. callable recovery capacity, capital, claims, and arbitration history;
6. neutral governance that survives replacement of every agent and provider.

The existing mathematical, actuarial, data, and causal layers serve this
network by estimating deadline survival, failure-domain dependence,
`P(Y | do(recovery))`, residual-loss distributions, CVaR, and required reserves.
The formulas alone are not defensible. The potential compounding asset is the
rights-cleared cross-provider record of independently observed failures,
recoveries, and realized losses, coupled to actual capacity and capital.

For each cohort, the commercial gate is:

```text
expected residual loss without Outsider
  - (Outsider premium + expected residual loss with Outsider) > 0
```

The controlled comparison uses equal goal, authority, budget, deadline, and
available interfaces. It reports independent on-time Outcome rate, false
`COMMIT`, user/staff intervention minutes, recovery latency and success,
CVaR95 residual loss, and all-in premium on group-disjoint Episodes with an
outcome-blind audit reserve. If the inequality or reliability gates fail for a
cohort, Outsider does not sell assurance for that cohort.

### First milestone remains structurally complete

The cable task is not accepted as complete when a cart, order, or seller
delivery acknowledgement exists. Its target is: by the deadline the location
possesses a compatible cable, an independent witness verifies data transfer
and 5 V delivery, an independently reserved recovery route closes a primary
failure, and user loss remains under the explicit maximum. It must demonstrate
two replaceable agent clients, two seller failure domains, one independent
witness, one injected primary failure, automatic recovery, zero Outsider staff
touches, and exact cold replay without duplicate effects.

Until those conditions exist, the current work is truthfully a hosted commerce
formation path and test fixture, not an Outcome commitment and not a product
moat.

## Three-layer Outcome product architecture — 2026-09-04 v16

This append-only descendant broadens the product surface without weakening the
v1 temporary-network contract, the frozen typed graph, v15, or any prior
Episode, Attempt, source occurrence, reservation, witness, or obligation. It
supersedes the earlier assumption that every useful Outsider request must wait
for a complete Outcome commitment before the product can provide value. It
does not supersede the strict rules governing the word `COMMIT`.

The product now has three independently useful layers:

```text
any user, agent, application, or robot runtime
  -> Layer 1: Outcome OS
       define, coordinate, observe, and replay an Outcome
       no primary/recovery/witness route required; no result promise
  -> versioned promotion receipt
  -> Layer 2: Formation + Recovery Options
       real primary capability
       plus a separately executable contingency capability or held option
       plus an explicit trigger and exercise policy; no guarantee
  -> versioned promotion receipt
  -> Layer 3: Outcome COMMIT
       strict primary + recovery + independent-witness reservations
       plus authority, bounded loss, callable remedy backing, lawful paths,
       trusted lifecycle, and external responsibility
       -> COMMIT or UNAVAILABLE
```

General agents are clients, route proposers, executors, and possible evidence
sources. They are replaceable and do not become network-person identity. A
stronger Codex, Gemini, Claude, local model, or deterministic program expands
the routes available to Layers 1 and 2; it cannot self-issue a Layer 3
commitment or independently verify its own effects.

### Contract separation and immutable promotion

The following objects have separate ownership and lifecycles:

1. An `OutcomeContract` freezes the provider-neutral acceptance predicates,
   completion deadline, budget ceiling, maximum-consequence boundary, evidence
   policy, privacy/context references, and existing typed graph binding.
2. A service-profile record reports the strongest product layer currently
   supported by replayed facts. It is not embedded as a mutable field in the
   Outcome contract.
3. A formation or execution program describes one possible order-scoped
   network. It cannot change the Outcome definition it serves.
4. A promotion receipt binds the predecessor layer, successor layer, exact
   Outcome hash, supporting source/lifecycle heads, validity interval, and
   predecessor receipt. It is an append-only descendant, not an edit.

`src/outsider-outcome-product-foundation-composition-v1.js` and
`src/outsider-outcome-program-v1.js` intentionally require exactly
`PRIMARY`, `RECOVERY`, and `INDEPENDENT_WITNESS`. They remain the strict Layer 3
program path. They must not be loosened in place to serve Layer 1. Layer 1 uses
a separate agent-neutral Outcome contract; Layer 2 produces a separate
formation/recovery package; promotion to Layer 3 compiles or binds those facts
into the existing strict Tender and Program.

Promotion is monotone:

```text
OUTCOME_OS
  -> FORMATION_READY
  -> CONTINGENCY_READY or RECOVERY_OPTION_HELD
  -> COMMIT_READY
  -> COMMITTED
```

A changed acceptance predicate, deadline, maximum loss, or authority scope
requires a versioned Outcome-contract descendant with explicit predecessor and
supersession links. Expiry or revocation of a Layer 2 capability appends a
`RECOVERY_COVERAGE_LOST` lifecycle event; it does not delete the former option
or rewrite the promotion receipt. Before COMMIT, the effective service profile
may fall back to Outcome OS or automated re-formation within an existing
mandate. After COMMIT, a lost reservation is a breach or recovery/claim
trigger. It cannot downgrade or erase the already accepted responsibility.

### Layer 1 — Outcome OS

Layer 1 is the broad product surface. It accepts a frozen outcome definition,
tracks all execution Attempts and observations, and presents an evidence-
qualified lifecycle. It does not require a provider, primary route, recovery
route, independent witness, payment, or guarantee.

Its lifecycle is:

```text
RECEIVED -> COMPILED -> OPEN -> ATTEMPTING -> EVIDENCE_PENDING
  -> OBSERVED_SATISFIED
   | OBSERVED_NOT_SATISFIED
   | INCONCLUSIVE
   | EXPIRED
```

An agent or provider self-report is retained as its actual source class. It is
not independently observed Outcome truth. Layer 1 is allowed to coordinate
best-effort work and report progress, but every response must retain
`outcomePromiseIssued=false` and must not use `COMMIT`, `GUARANTEED`, or a
capacity label.

The initial code contract is
`src/outsider-three-layer-outcome-product-contract-v1.js`. Its Layer 1 record
is hash-only and agent-neutral, requires no execution/recovery/witness route,
contains the complete frozen
`PrincipalEpoch -> AccountableDeployment -> Runtime/Embodiment -> Delegation
-> Episode -> Attempt` references, and accepts no natural-language goal,
provider name, address, credential, payment instrument, or raw source bytes.
Where an existing strict `OutcomeProgramV1` already exists, the importer
replays and verifies it; an Outcome OS record does not require one.

### Layer 2 — Formation and Recovery Options

Layer 2 is not limited to catastrophic-loss tasks. It provides pre-formed
recoverability for ordinary and medium-value Outcomes. It may combine a
machine-executable primary route with a separately executable contingency, a
cancellable reservation, an inventory or appointment hold, a capacity lease,
or another source-defined option. The strength of the option must remain
explicit:

```text
DISCOVERED_ROUTE
EXECUTABLE_CONTINGENCY
CAPACITY_OPTION_HELD
CAPITAL_BACKED_OPTION
```

The first state is only formation evidence. It is not a recovery option.
Layer 2 may report `CONTINGENCY_READY` only when a real primary capability and
a separate currently executable contingency capability are within the exact
authority, budget, time, and consequence envelope. It may report
`RECOVERY_OPTION_HELD` only when an externally replayed current reservation or
equivalent option lifecycle establishes the hold.

The Layer 2 gate is:

```text
real primary executable capability
and (
  separately executable contingency capability
  or externally held recovery option
)
and an exact recovery trigger
and current exercise authority
and total possible spend within the mandate
and recovery completion remains feasible after the latest safe trigger
and failure-domain overlap is disclosed and within policy
```

Its lifecycle is:

```text
FORMATION_REQUESTED
  -> CANDIDATES_DISCOVERED
  -> PRIMARY_CAPABILITY_BOUND
  -> CONTINGENCY_CAPABILITY_BOUND
  -> RECOVERY_OPTION_HELD, when externally established
  -> RECOVERABLE_ACTIVE
  -> PRIMARY_ATTEMPTING
  -> RECOVERY_TRIGGERED
  -> RECOVERED | OBSERVED_SATISFIED | FAILED | RECOVERY_COVERAGE_LOST
```

Layer 2 never claims guarantee, capital coverage, independent Outcome truth, or
COMMIT. Provider-native status may trigger an authorized recovery action, but
its evidence class remains provider-native unless an independent observation
also exists.

The initial Layer 2 public contract accepts a non-empty portfolio and reports
role coverage, current validity, outcome-deadline coverage, reservation-
reference pairs, and failure-domain references. Caller-supplied hashes cannot
establish external capacity, so the current implementation correctly keeps
`externalCapacityEstablished=false`, `recoveryOptionHeld=false`, and
`layerTwoPromotionPermitted=false`. A later promotion receipt must consume
source-replayed capacity and authority admissions rather than change those
facts with a Boolean.

### Layer 3 — Outcome COMMIT

Layer 3 preserves the strict v1 North Star. Its user-visible positive gate is:

```text
current owner authority
and primary capacity reserved
and recovery capacity reserved in an admitted failure domain
and independent witness capacity reserved
and witness independence established
and maximum loss bounded
and every promised financial remedy backed by callable funds or capital
and lawful transaction and payment paths
and trusted time and current revocation state
and external occurrence non-omission and non-equivocation
and zero Outsider staff touches externally accounted
```

`src/outsider-outcome-tender-v1.js`,
`src/outsider-outcome-program-v1.js`,
`src/outsider-outcome-product-runtime-v2.js`, and
`src/outsider-durable-outcome-program-orchestrator-v1.js` remain the strict
program and durable execution foundation. The orchestrator's internal
`PROGRAM_COMMITTED` event is not by itself a user-visible Outcome COMMIT.
`src/outsider-outcome-product-runtime-v2.js` correctly retains
`outcomePromiseIssued=false` until a later externally admitted commitment
composition exists.

The initial Layer 3 classification API reports exact missing selection and
reference slots, failure-domain separation gaps, and the highest honestly
available lower layer. It never converts complete caller-supplied hashes into
authority and never emits a positive commitment.

### Component ownership and existing foundations

| Component | Owns | Reuses |
| --- | --- | --- |
| Outcome compiler | Acceptance predicates, deadlines, dependency/evidence plan | `outsider-outcome-product-foundation-composition-v1.js`, `outsider-outcome-tender-v1.js` at strict promotion only |
| Agent gateway | Agent-neutral route proposals and Attempt binding | frozen typed graph, `outsider-episode-attempt-set-composition.js` |
| Formation broker | Discovery, quote comparison, capability binding | `outsider-transaction-surface-adapter-contract-v1.js`, route discovery and buyer-native adapters |
| Recovery option manager | Option strength, lease, trigger, exercise, expiry and revocation | `outsider-external-capacity-reservation-protocol-v1.js`, `outsider-one-use-commitments-v1.js` |
| Commitment clearing | Strict Layer 3 conjunction | Outcome Tender/Program, action admission, atomic coordinator |
| Edge execution node | Local credential, provider-native effect, idempotency and reconciliation | `outsider-formation-job-worker-v1.js`, Cloudflare SQLite store, Node deterministic executor |
| Witness node | Observation reservation, result, revocation and challenge | `outsider-independent-outcome-witness-lifecycle-v1.js`, network outcome witness |
| Episode/data plane | Attempt and occurrence census, exact private source replay | `outsider-outcome-product-episode-data-bridge-v1.js`, `outsider-episode-data-engine.js` |
| Risk engine | Deadline survival, failure dependence, causal recovery effect, residual loss and CVaR | candidate-ranking bridge, actuarial, model and causal foundations |
| Capital/claims plane | Funding, remedy, claim and adjudication | reality obligation store and existing claims/economic HOLD structures |

Credentials, cookies, wallets, device rights, and robot authority remain on the
node that owns them. The central plane receives order-scoped capability and
hash references, not reusable account secrets. `C_enabled` remains a subset of
`A_proven` in all three layers.

### Initial agent-facing API

The versioned Cloudflare Formation Worker source now exposes the first bounded
three-layer API surface:

```text
GET  /v1/outcomes/capabilities
POST /v1/outcomes/prepare
POST /v1/recovery-options/prepare
POST /v1/commit-readiness/evaluate
GET  /v1/outcomes/{jobKey}/status
```

The existing `POST /v1/formation-jobs` and exact job-status route remain the
internal deterministic execution seam. The new preparation/evaluation routes
perform no external effect and accept only closed, hash-based contracts. They
do not accept arbitrary prompts, URLs, credentials, source bytes, payment
material, or direct PII. Future APIs may add agent route proposals,
observations, formation authorization, recovery exercise, and commitment
authorization as distinct resources; they must not collapse those effects
into the structural preparation endpoints.

Every future mutating endpoint requires a deterministic identity, prior
durable intent, exact capability and Attempt binding, expiry, bounded authority,
and provider reconciliation before retry. No endpoint may accept a naked trust
Boolean.

### C/P/R completion definitions and current truth

This descendant separates three completion claims:

- `C_i`: the contracts, verifiers, state transitions, privacy behavior, and
  focused adversarial tests exist.
- `P_i`: the same code is deployed as an addressable durable production
  service with secret isolation, idempotency, restart recovery, telemetry, and
  a verified public version.
- `R_i`: the required external authority, executable capabilities, options,
  reservations, witnesses, outcomes, recovery, and responsibility actually
  exist and replay from their sources.

The enablement rule is:

```text
ENABLE_i only if C_i and P_i and R_i
  and requested capability is a subset of proven authority
```

Current status at this checkpoint is:

| Claim | Status | Exact boundary |
| --- | --- | --- |
| Three-layer public contract code | `C_COMPLETE` | Layer 1, partial Layer 2 portfolio, and Layer 3 readiness classification compile and verify without emitting COMMIT. |
| Three-layer Worker API code | `C_COMPLETE` | The local deployment source reports API version `2.0.0` and the five bounded routes above. |
| Public production deployment | `P0_NOT_MET` | The deployment/control-plane source contains the new version, but the public health endpoint still reports the previously deployed API version. Source and public runtime are not yet the same verified version. |
| Real Layer 1 adoption | `R1_NOT_MET` | No two independently operated agent clients have yet submitted and followed the same Outcome contract through a live Episode. |
| Real Layer 2 recoverability | `R2_NOT_MET` | There is no externally established primary plus separately executable contingency or held option package. |
| Real Layer 3 commitment | `R3_NOT_MET` | Primary/recovery/witness reservations, independent Outcome truth, capital/remedy backing, and accepted responsibility are absent. |

No source code, local test, deployment configuration, Cloudflare version
metadata, seller page, quote, cart, or server acknowledgement closes an `R`
gate. The public/source version mismatch keeps `P0` false even though the
contract and API code gates are complete.

### Revised 0 -> 8 execution plan

#### Phase 0 — Three-layer truth and production-version closure

**Code (`C0`)**

- Freeze the layer vocabulary, negative claims, and public manifest.
- Preserve all earlier strict contracts and append-only artifacts.
- Add a capability projection that reports each layer separately.

**Production (`P0`)**

- Deploy the versioned API source and verify the public health/API manifest
  returns the exact deployed code version and contract hash.
- Preserve the existing Formation Job API and durable state during rollout.

**Reality (`R0`)**

- Map all current SparkFun, Target, Best Buy, and Adafruit facts to their exact
  quote/HOLD states. None is Layer 2 or Layer 3 reality.

**Exit gate:** source, deployment version, and public response agree; false
layer labels are zero. `C0` is complete; `P0` and `R0` remain open here.

#### Phase 1 — Provider-neutral Outcome Contract and promotion ledger

**Code (`C1`)**

- Extract a provider-neutral, agent-neutral Outcome contract that does not
  require three routes.
- Add append-only service-profile and promotion receipts with predecessor,
  expiry, loss-of-coverage, and supersession rules.
- Bind all execution/observation events to the frozen graph and an Attempt.

**Production (`P1`)**

- Persist private Outcome input separately from minimized public projection.
- Add durable create, inspect, resume, and lifecycle APIs with idempotent
  request identities.

**Reality (`R1`)**

- Have two replaceable agent clients submit conformant proposals for the same
  real Outcome without becoming graph identities or changing its contract.

**Exit gate:** replacing the agent preserves the Outcome hash, authority,
Episode, and acceptance predicates; Layer 1 still requires no three-role
network.

#### Phase 2 — Outcome OS multi-agent Attempts and observations

**Code (`C2`)**

- Add agent route-proposal, Attempt, observation, deadline, and evidence-state
  ingestion without inventing a second ontology.
- Keep agent/provider self-reports explicitly source-qualified.

**Production (`P2`)**

- Run the Outcome lifecycle through durable events and timers across restarts.
- Allow agent reconnect and replacement without duplicate effects.

**Reality (`R2`)**

- Exercise at least three Outcome families through the same core without a
  domain-specific branch, including at least one real external Attempt.

**Exit gate:** duplicate effects and employee touches are zero; a self-report
never becomes independent Outcome truth.

#### Phase 3 — Formation and Recovery Package

**Code (`C3`)**

- Add option-strength, failure-domain, trigger, exercise, spend-envelope,
  validity, and cancellation semantics.
- Add the Layer 1-to-Layer 2 promotion gate from replayed admissions.

**Production (`P3`)**

- Connect candidate fan-out, the deployed Formation Worker, Edge Nodes, and
  option lifecycle into a durable background formation service.

**Reality (`R3`)**

- Acquire one real primary executable capability and either a separately
  executable contingency or an externally held recovery option in a distinct
  or explicitly admitted failure domain.

**Exit gate:** no candidate, availability page, cart, or caller hash is labeled
`RECOVERY_OPTION_HELD`.

#### Phase 4 — Federated transaction nodes and reusable rails

**Code (`C4`)**

- Extend the non-executable Node SDK with a separate executable descendant for
  local credentials, adapter sandboxing, order capabilities, signed
  occurrences, revocation, and reconnect.
- Continue platform-family adapters and deterministic trace-to-adapter work
  instead of seller-by-seller scripts.

**Production (`P4`)**

- Operate at least two independently administered execution nodes with leases,
  dead-node recovery, adapter quarantine, and deployment pinning.

**Reality (`R4`)**

- Turn off the founder machine and founder search/account credentials; a route
  still executes or honestly returns unavailable.

**Exit gate:** reusable secret material reaching the central coordinator is
zero; cold replay creates no duplicate provider effect.

#### Phase 5 — First real automatic recovery Outcome

**Code (`C5`)**

- Add latest-safe-trigger timers, recovery exercise, primary cancellation or
  compensation, recovery Attempt descendants, and evidence closure.

**Production (`P5`)**

- Run the lifecycle worker across process restarts and multi-day fulfillment;
  repeated recovery commands reconcile rather than duplicate effects.

**Reality (`R5`)**

- Inject one real primary failure and exercise the admitted contingency with
  zero Outsider staff touches.

**Exit gate:** one complete `PRIMARY Attempt -> RECOVERY Attempt -> evidence ->
closure` Episode exists. This is the first Layer 2 product proof and must not
wait for a general insurance/capital product.

#### Phase 6 — Strict Outcome COMMIT

**Code (`C6`)**

- Compose the existing strict Tender, Program, reservation, witness, authority,
  maximum-loss, obligation, and action-admission contracts behind a Layer 3
  promotion verifier.
- Keep payment authority separate from formation authority.

**Production (`P6`)**

- Deploy an atomic clearing and commit path with durable ambiguity
  reconciliation and no human override.

**Reality (`R6`)**

- Simultaneously establish real owner authority, primary/recovery/witness
  reservations, witness independence, bounded loss, callable remedy backing,
  lawful paths, and a complete independently observed Outcome.

**Exit gate:** false COMMIT is zero; missing conjunctions produce
`UNAVAILABLE`, never an operations queue.

#### Phase 7 — Outcome data, causal recovery, pricing, capital, and claims

**Code (`C7`)**

- Estimate deadline survival, correlated failure domains,
  `P(Y | do(recovery))`, residual-loss distribution, CVaR, and reserve needs
  separately by product layer and exact Outcome cohort.
- Retain fixed group-disjoint holdout, explicit baseline, and outcome-blind
  audit reserve.

**Production (`P7`)**

- Permit admitted estimates to affect search order and option sizing only
  within their evidence scope. Binding price remains a separate authority.

**Reality (`R7`)**

- Acquire complete, rights-cleared, independently observed failure, recovery,
  loss, claim, and adjudication Episodes plus applicable capital and legal
  authority.

**Exit gate:** otherwise `KEEP_BASELINE` and `NON_BINDING_ABSTAIN`; no PRICE,
GUARANTEE, or SETTLE expansion.

#### Phase 8 — Global federation and adoption flywheel

**Code (`C8`)**

- Publish agent-client and Node SDKs, signed adapter distribution, revocation
  feeds, portable registries, and optional standing-capacity descendants.

**Production (`P8`)**

- Operate multiple clouds, discovery indexes, account/Edge Nodes, resource-
  owner nodes, and witness operators.

**Reality (`R8`)**

- Complete Outcomes in two geographies, two verticals, and two independently
  operated node sets; disable one cloud, one search provider, and all founder
  accounts without losing honest termination.

**Exit gate:** coverage grows through agent clients, open protocols, reusable
platform adapters, Edge Nodes, and order-produced capacity, never employee
outreach throughput.

### First milestone across all three layers

The cable milestone remains low-loss but must exercise the future architecture:

- **Layer 1:** freeze “the destination possesses one compatible cable by the
  deadline, with data transfer and 5 V acceptance predicates”; two replaceable
  agents may propose routes without changing this contract.
- **Layer 2:** bind a real primary seller capability, a different seller or
  fulfillment failure-domain contingency, a latest-safe trigger, exercise
  mandate, and exact option-strength label; inject primary failure and recover
  automatically.
- **Layer 3:** before COMMIT, add current primary/recovery/witness reservations,
  owner and payment authority, maximum loss and remedy backing; independently
  observe possession, data transfer, and 5 V, then close every obligation.

A purchase, shipment, delivery acknowledgement, or successful mouse-driven
checkout is not the milestone. The first decisive product gate is the Layer 2
recovery exercise; the strict Layer 3 proof follows without narrowing all of
Outsider to high-loss insurance use cases.

### Immediate implementation order and deprioritization

The immediate order after this checkpoint is:

```text
close the public API version mismatch
  -> provider-neutral Outcome Contract
  -> durable profile/promotion receipts
  -> agent-neutral Layer 1 lifecycle
  -> source-replayed Recovery Package admissions
  -> first real Layer 2 contingency exercise
  -> strict Layer 3 composition
```

The critical path explicitly deprioritizes a home-grown general chat agent,
connector-count races, seller-specific one-off scripts, model-driven page
clicking, provider outreach marketplaces, additional synthetic corpus volume,
and new audit machinery unrelated to an active source-replay break. Existing
provenance, privacy, authority, data, causal, actuarial, and responsibility
foundations remain mandatory inputs, but maintenance of those foundations may
not displace production Outcome OS, real recovery formation, and external
Episode closure.

## Public three-layer surface convergence — 2026-09-04 v17

This append-only operational correction supersedes exactly one time-bound
statement in v16: the claim that the public Worker still exposed the previous
API version and that `P0` was unmet because the deployment source and public
runtime disagreed. It does not edit v16, supersede any three-layer contract or
phase gate, or establish a durable Outcome lifecycle, executor readiness,
authority, recovery option, reservation, witness, Outcome truth, guarantee,
payment, or COMMIT.

After the v16 observation, the deployment converged completely. The Cloudflare
control plane reported the deployment whose identifier begins `8bb49ac4` at
100 percent, with Worker revision 5 whose ETag begins `f67a65`. Three
consecutive reads of each public route below returned HTTP 200 and API version
`2.0.0`:

```text
GET /healthz
GET /v1/outcomes/capabilities
```

The public capability manifest now exposes the same three truthful surfaces as
the deployed source: `OUTCOME_OS`, `FORMATION_RECOVERY_OPTIONS`, and
`OUTCOME_COMMIT`. Its Layer 3 surface remains a negative readiness evaluator,
not an endpoint that issues COMMIT.

The corrected current C/P/R truth is:

| Claim | Corrected status | Exact boundary |
| --- | --- | --- |
| Three-layer contract and API code | `C_COMPLETE` | The hash-only contracts and five bounded routes remain code-complete. |
| Public truthful three-layer surface | `P0_PASSED` | Source, active deployment, public version `2.0.0`, and public capability manifest agree over three consecutive observations. |
| Durable Layer 1 lifecycle | `P1_NOT_MET` | The public manifest reports `durableLifecycle=false`; preparation is structural and stateless. |
| Configured deterministic executor | `P_EXECUTOR_NOT_READY` | Public health reports `executorConfigurationReady=false`. |
| Production external execution | `P_EXTERNAL_EXECUTION_NOT_READY` | Public health reports `productionExecutionReady=false`; no live provider effect follows from API convergence. |
| Real Layer 1 adoption | `R1_NOT_MET` | No two independently operated agent clients have completed one live Outcome lifecycle. |
| Real Layer 2 recoverability | `R2_NOT_MET` | No real primary plus separately executable contingency or held recovery option has been established. |
| Real Layer 3 commitment | `R3_NOT_MET` | The strict reservation, witness, responsibility, loss-backing, and Outcome gates remain open. |

Thus v17 closes only the public-version/capability-surface portion of Phase 0.
It advances the immediate critical path to the provider-neutral durable Outcome
Contract and promotion ledger. API reachability is not execution readiness,
and `P0_PASSED` cannot be reused as evidence for any `R` gate.

## Durable Outcome OS lifecycle and authority split — 2026-09-04 v18

This append-only implementation checkpoint follows v17 without editing or
superseding v16 or v17. It records the first live, durable Layer 1 lifecycle
and the subsequent separation of Outcome OS API authority from formation-job
dispatch authority. It advances only the hash-only lifecycle portion of
`C1/P1`; it establishes no agent adoption, seller route, order, payment,
direct PII transmission, recovery option, witness, or Outcome commitment.

### Worker v2.1 durable lifecycle occurrence

Worker API version `2.1.0`, in the deployment whose identifier begins
`b515695a`, introduced a SQLite Durable Object lifecycle for one hash-only
Outcome OS contract. A purely synthetic contract whose identifier begins
`contract_a260` produced the following live HTTP sequence:

```text
Outcome OS structural prepare       200
lifecycle create                     201
OPEN event append                    201
duplicate OPEN append                200, idempotent=true
lifecycle read                       200
full lifecycle replay                200
```

The durable read and replay both reported `eventCount=2` and state `OPEN`.
The current lifecycle-head hash begins `994153`; the replay artifact hash
begins `268d6f`. The duplicate request did not create a third event. The two
events are the contract lifecycle genesis and its transition to `OPEN`, not
two Outcome Attempts or two external effects.

This occurrence proves that the Layer 1 hash-only lifecycle survives separate
requests and can be exactly read and replayed with operation idempotency. The
input was synthetic. It did not name or contact a seller, create a provider
effect, submit an order, move money, or transmit address, contact, or other
direct PII.

### Worker v2.2 split authority occurrence

Worker API version `2.2.0`, in the deployment whose identifier begins
`2d82a7cc`, split two previously adjacent capabilities:

```text
OUTCOME_OS_API_BEARER_TOKEN
  -> structural Outcome preparation, recovery/readiness evaluation,
     and Outcome OS lifecycle create/append/read/replay

FORMATION_DISPATCH_BEARER_TOKEN
  -> deterministic formation-job dispatch and formation-job status only
```

Presenting either bearer to the other's protected route returned HTTP 401 in
both directions. The already-created v2.1 lifecycle remained readable under
the Outcome OS authority after the v2.2 deployment, returned HTTP 200, and
still contained exactly two events. The public health response reported both
authorities configured and `durableLifecycle=true`.

This is capability separation, not evidence that the bearers identify a legal
principal or resource owner. Neither bearer can mint authority outside its
configured route family, and neither authorizes seller contact, payment,
ordering, L2 promotion, or L3 COMMIT.

### Corrected C/P/R position after v2.2

| Claim | Status | Exact boundary |
| --- | --- | --- |
| Layer 1 lifecycle contract and verifier | `C1_PASSED_WITHIN_HASH_ONLY_SCOPE` | Canonical event chain, legal transitions, deterministic operation identity, duplicate replay, read, and full replay are implemented. |
| Layer 1 durable production lifecycle | `P1_PASSED_WITHIN_HASH_ONLY_SCOPE` | The public v2.2 Worker exposes the Durable Object lifecycle, reports both scoped authorities configured and `durableLifecycle=true`, and preserves the existing two-event lifecycle across deployment. |
| Layer 1 external adoption and real Outcome | `R1_NOT_MET` | The live lifecycle is synthetic; two independently operated agent clients and a real Outcome lifecycle are still absent. |
| Layer 2 real formation and recoverability | `R2_NOT_MET` | No real primary capability plus separately executable contingency or held option has been admitted. |
| Layer 3 real commitment | `R3_NOT_MET` | No strict primary/recovery/witness reservation conjunction, independent Outcome, or accepted loss responsibility exists. |
| External execution | `NOT_ESTABLISHED_BY_THIS_CHECKPOINT` | The lifecycle and authority-separation probes performed no seller, order, payment, or direct-PII effect. |

The `P1` statement is deliberately narrow. A durable hash-only state machine
is now live, but Layer 1 as a product is not real-world complete until external
agent clients submit proposals and Attempts, evidence arrives from its actual
source, and one real Outcome is followed to an honest terminal state.

### Immediate next gate

The next code and production seam is an agent-client SDK plus closed-shape
ingestion for:

```text
agent route proposal
  -> frozen typed-graph Attempt binding
  -> source-qualified observation
  -> durable Outcome OS lifecycle transition
```

It must preserve agent substitutability, existing Episode/Attempt and
occurrence-census semantics, exact idempotency, and the separation between an
agent/provider report and independent Outcome truth. After that seam is live,
the next reality gate is not more lifecycle scaffolding: it is one real Layer 2
package containing a machine-executable primary route and a separately
executable contingency or externally held recovery option, followed by an
authorized failure-trigger exercise with zero Outsider staff touches.

## Agent-neutral proposals and first real Episode import — 2026-09-04 v19

This append-only implementation checkpoint follows v18 and does not edit or
supersede v16-v18. It records two Layer 1 code advances and the first production
import of an existing real physical Episode into the durable Outcome OS
lifecycle. The import replays prior sources; it does not contact a seller,
execute a new transaction, complete an Outcome, create a recovery option, or
advance Layer 3.

### Agent-neutral ingestion and proposal-occurrence registry

`src/outsider-agent-neutral-outcome-os-ingestion-v1.js` now compiles a closed,
hash-only request into the exact Outcome OS lifecycle operations required for
contract creation, opening, and Attempt-evidence ingestion. It binds the
existing typed graph and does not introduce a second actor, delegation,
Episode, or Attempt ontology.

`src/outsider-agent-neutral-route-proposal-registry-v1.js` now preserves any
number of proposal occurrences for one Outcome. Its occurrence census is
separate from its proposal-object deduplication view:

```text
proposal occurrence count       = every accepted submission occurrence
unique proposal object count    = distinct proposal content objects
duplicate proposal object count = repeated content in distinct occurrences
```

Equal proposal objects from different or repeated invocations therefore do
not erase occurrences or shrink the denominator. The registry remains
append-only and replays its exact predecessor chain.

Both modules reject agent or provider identity, provider URLs, direct PII,
credentials, cookies, tokens, payment material, and arbitrary executable
instructions. An accepted proposal is only an agent-neutral route proposal.
It never establishes route selection, owner authority, executable capability,
capacity, Outcome truth, recovery readiness, guarantee, or COMMIT. An
`ATTEMPT_EVIDENCE` event is evidence attached to an existing Attempt; it is not
independent Outcome truth.

The proposal registry is currently a pure local contract/runtime. It has not
yet been connected to a Durable Object or deployed API. Its code cannot be
counted as `P2`.

### First-physical foundation-to-lifecycle bridge

`src/outsider-first-physical-outcome-os-lifecycle-bridge-v1.js` and
`scripts/outsider-first-physical-outcome-os-lifecycle-bridge-v1.mjs` replay the
existing private first-physical foundation, Work Order, unified formation
result, and product-state artifacts into one minimized Outcome OS lifecycle
input. The bridge projects hashes and typed graph references only. It does not
project raw lifecycle events, private source bytes, seller details, address,
contact fields, or stable direct-PII derivatives.

The production import used contract
`contract_eb17007dce08d9359f95e8f24fda59d7` and returned:

```text
lifecycle create                  HTTP 201
CONTRACT_OPENED append            HTTP 201
ATTEMPT_EVIDENCE append           HTTP 201
current state                     OPEN
event count                       3
Attempt-evidence event count      1
lifecycle head                    sha256:c5e2e69e5c2b23cde0e2d34c385c524127c67ca6ff91d54f2328d83e495ca040
replay artifact                   sha256:25ac7db24035e60194d73c5c3d4da103ec7cdcca8a060f2193a6e8f1b778fb2b
raw events projected              false
```

This is the first use of the durable Layer 1 service with a pre-existing real
Episode source chain rather than a wholly synthetic Outcome. Its honest state
is still `OPEN`. The imported product state and Attempt evidence do not prove
delivery, acceptance-predicate satisfaction, independent observation, or
Outcome closure.

No new seller request, order, payment, credential use, direct-PII
transmission, or provider-side effect occurred in either this import or the
proposal-registry work.

### Verification and exact C/P/R truth

The focused suite covering the three-layer contract, Outcome OS lifecycle,
Cloudflare API composition, agent-neutral ingestion, multi-proposal registry,
and first-physical bridge passed 49/49 with zero failures.

| Claim | Status | Exact boundary |
| --- | --- | --- |
| Agent-neutral proposal and Attempt-evidence code | `C2_ADVANCED_PARTIAL` | Closed ingestion and occurrence-preserving multi-proposal replay exist; production proposal/observation ingestion and agent-client SDK remain. |
| Durable Outcome OS lifecycle | `P1_PASSED_WITHIN_HASH_ONLY_SCOPE` | The existing production lifecycle accepted and replayed the three-event first-physical import. |
| Durable proposal-occurrence registry | `P2_NOT_MET` | The registry remains local and has no deployed durable backing or production endpoint. |
| Layer 1 real-world adoption | `R1_PARTIAL_NOT_MET` | One pre-existing real Episode was imported, but no two independently operated agent clients participated and no real Outcome reached an evidence-qualified terminal state. |
| Layer 2 real recoverability | `R2_NOT_MET` | No real primary executable capability plus distinct contingency or external option has been admitted or exercised. |
| Layer 3 real commitment | `R3_NOT_MET` | No strict reservation/witness/loss-responsibility conjunction or COMMIT exists. |

Occurrence-preserving code, a production HTTP 201, a durable lifecycle head,
and a real source lineage do not by themselves close `R1`. `R1` requires
actual replaceable client participation and an honestly observed Outcome
lifecycle.

### Next gate is external Layer 2 formation

The next critical gate is one real Layer 2 package:

```text
machine-executable primary capability
  + distinct failure-domain contingency capability or external option
  + exact trigger and exercise authority
  + Attempt and observation flow through two replaceable agent clients
```

The deployed proposal/Attempt/observation seam should be finished only to the
extent required to carry that live package and preserve its occurrences. More
generic internal hardening, new audit frameworks, synthetic corpus expansion,
or additional HOLD-only abstractions are explicitly forbidden from delaying
the primary-plus-contingency reality gate. An active source-replay or
provenance break must still be repaired first, but maintenance without such a
break is not the production critical path.

## Durable multi-proposal production registry — 2026-09-04 v20

This append-only production checkpoint follows v19 and does not modify or
supersede v19 or any earlier checkpoint. It records the deployment and live
verification of the agent-neutral route-proposal occurrence registry. The
verified scope is durable hash-only proposal accounting against an existing
Outcome OS lifecycle. It is not agent adoption, route execution, capacity,
authority, independent evidence, recovery readiness, or COMMIT.

### Formation Worker v2.3 deployment

Formation Worker API version `2.3.0` was deployed at 100 percent as Cloudflare
Worker version `b0c746ae-c441-4a6b-850f-45ae4a5a1233`, created at
`2026-09-04T20:23:40.650Z`. The upload was 164.42 KiB, 30.17 KiB gzip, with a
16 ms startup time.

The deployment retains the deterministic executor service binding and now has
three separate SQLite Durable Object responsibilities:

```text
Outcome OS lifecycle events
agent-neutral route-proposal occurrences
deterministic formation jobs
```

The proposal ledger does not share its occurrence counter with lifecycle
events or formation jobs. It preserves the v19 distinction between proposal
occurrence census and proposal-object deduplication.

### Live proposal occurrences on the existing real Episode lifecycle

The production check used the existing contract
`contract_eb17007dce08d9359f95e8f24fda59d7`, whose Outcome lifecycle was
previously imported from the real first-physical source chain. The two new
proposal bodies were explicitly synthetic, hash-only test proposals. They did
not originate from two independently operated external agents and contained no
seller route or executable capability.

The live sequence returned:

```text
initial proposal-registry GET       HTTP 200, occurrenceCount=0
proposal occurrence 1 POST          HTTP 201, occurrenceCount=1
proposal occurrence 2 POST          HTTP 201, occurrenceCount=2
                                             distinctObjectCount=2
exact proposal-1 replay POST         HTTP 200, idempotent=true
                                             eventAppended=false
                                             occurrenceCount=2
final proposal-registry GET         HTTP 200
rawEventsProjected                  false
registry head                       sha256:8aabc11b976a2300e667fef5202ac8e9620c34390a6c4c0c08aa37246f7b2c93
registry replay                     sha256:9591e1f469ab37b8e0f9a5f793f30a48500da71281652cd43c0fd1d10021bbd2
```

This establishes that production storage retains two distinct proposal
occurrences and exact replay does not create a third occurrence. The HTTP 201
receipts establish accepted registry writes only. Route selection, provider
identity, seller reachability, transaction authority, executable capability,
capacity, evidence independence, Outcome truth, recovery readiness,
guarantee, and COMMIT all remain false.

The immediate deployment-focused suite passed 28/28 with zero failures. A
broader final run was still pending at this checkpoint and is not implied by
that count.

### Private executor activation remains blocked before contact data

A fresh private executor activation descendant was generated with expiry
`2026-09-04T21:12:56.323Z`, and the non-PII executor registration secret was
updated. The separate private address/contact envelope was not uploaded: the
platform security review blocked that operation. No workaround was attempted.

Accordingly, public health continued to report
`productionExecutionReady=false`. The activation preparation and proposal
registry probe caused no seller contact, provider transaction, order, payment,
or PII effect. No account identity or secret value belongs in this plan or any
public projection.

### Corrected C/P/R position after v2.3

| Claim | Status | Exact boundary |
| --- | --- | --- |
| Agent-neutral proposal registry code | `C2_PASSED_FOR_PROPOSAL_OCCURRENCE_SCOPE` | Append, exact replay, conflict handling, occurrence census, and object-dedup separation exist. |
| Durable production proposal registry | `P2_PASSED_FOR_PROPOSAL_OCCURRENCE_SCOPE` | The v2.3 Worker and SQLite Durable Object retained and replayed two proposal occurrences on the existing contract. |
| Complete Layer 2 production path | `P2_NOT_COMPLETE` | Attempt/observation ingestion, real agent clients, real executable routes, and recovery exercise remain absent. |
| Real Layer 1 adoption | `R1_PARTIAL_NOT_MET` | The underlying Episode is real, but both live proposal occurrences are synthetic and no completed Outcome or two external clients exist. |
| Real Layer 2 recoverability | `R2_NOT_MET` | No primary executable capability plus distinct contingency or external option exists. |
| Real Layer 3 commitment | `R3_NOT_MET` | Selection, capacity, authority, independent truth, bounded loss responsibility, and COMMIT remain false. |

`P2_PASSED_FOR_PROPOSAL_OCCURRENCE_SCOPE` must not be shortened to a claim that
Layer 2 is production-ready. It closes one storage/transport seam only.

### Immediate next gate remains reality, not more registries

The next mandatory product gate remains:

```text
real machine-executable primary capability
  + distinct failure-domain contingency capability or external option
  + exact trigger and exercise authority
  + proposal, Attempt, and observation flow through replaceable clients
```

The missing Attempt/observation endpoint and minimal agent-client SDK should be
built only as the transport needed for that real package. Additional generic
registries, review layers, audit frameworks, or synthetic proposal volume must
not displace the live primary-plus-contingency acquisition. If the private
executor envelope remains blocked, engineering must use another authorized,
non-payment machine interface or honestly return unavailable; it must not
circumvent the platform review or create a human operations path.

## First live executable-contingency closure and three-layer production surface — 2026-09-04 v21

This append-only checkpoint follows v20. It does not rewrite any earlier
artifact, adapter, Episode, lifecycle event, proposal occurrence, or production
revision. It records a source-compatible Cloudflare adapter descendant, the
production deployment of the typed Layer-2 and standards-compatibility surface,
and a fresh zero-payment cross-provider Episode. The Episode certifies one
network path; it is not a claim that the general Outcome COMMIT product or a
commercial guarantee is complete.

### Architecture correction adopted without changing the product entry point

The canonical architecture remains user-Outcome-first:

```text
Layer 1  Outcome OS
Layer 2  Formation + recovery mechanisms
Layer 3  Outcome COMMIT
```

Resource-side admission is an optional evidence and route-local veto node. It
is not the product entry point, a mandatory bot gateway, a global agent score,
or an authority mint. The architecture now names three recovery mechanisms:
`ROUTE_SUBSTITUTION`, `STATE_ROLLBACK`, and `COMPENSATING_ACTION`. It also
requires explicit latest-safe exercise, exercise/cancellation references,
single-writer primary-XOR-recovery semantics, and typed failure-domain status:
`PROVEN_DISTINCT`, `KNOWN_SHARED`, or `UNKNOWN`. Shared and unknown failure
domains cannot promote a portfolio; distinct reference sets still do not prove
external capacity.

UCP, AP2, A2A, and provider-native protocols remain version-pinned
compatibility/source-report planes below the canonical Outcome model. A
successful structural binding does not make an external status true, turn a
mandate into Outsider authority, establish capacity, or issue COMMIT. The full
correction is appended to
`docs/OUTSIDER-THREE-LAYER-OUTCOME-ARCHITECTURE.md`; that file is 25,860 bytes
with SHA-256
`5827829341097a523ec27b9156327adc8001889185bb192c6dd3dfd4fca809d6`.

### Code descendants and exact boundaries

The following new code is now present:

| Artifact | Bytes | SHA-256 | Exact role |
| --- | ---: | --- | --- |
| `src/outsider-recovery-option-portfolio-v2.js` | 7,989 | `1fa7f6dfcb744db67896fa5de02559bd9bee7cdd19cd09e50ac47d828a95ec74` | Typed recovery mechanism, exercise, cancellation, exclusivity, and failure-domain structure; always leaves external capacity and Layer-2 promotion false. |
| `src/outsider-outcome-standard-binding-v1.js` | 10,204 | `f0c34a71f76477ccbfefca054e8e2218370b90aeb8a290b89b2f61d02c29ba26` | Hash-only, revision-pinned UCP/AP2/A2A compatibility receipt; source report only. |
| `src/outsider-resource-admission-observer-v1.js` | 12,596 | `205799a63a3eb2f9cece6535ccb9cb1abef2a595a8bfe8c1bcb942d85284f257` | Optional resource-side admit/queue/throttle/reject evidence; a verified negative may veto its route, while a positive never establishes authority, capacity, truth, or COMMIT. |
| `src/outsider-cloudflare-worker-production-adapter-v3.js` | 8,346 | `249adff1c638f1759891fcde2eeb6cc2ee6fabec29218995d7ce0eb0ed03fee8` | Versioned upload descendant using native `FormData` and one exact `worker.js` metadata/part/filename tuple. |
| `src/outsider-first-committed-digital-reality-production-composition-v6.js` | 14,224 | `84b602cc9224256d021f2c8122742f6448a64c160ad1ea4f2810b9c99f263fff` | V5 composition with only the Cloudflare primary moved to the v3 transport. |
| `src/outsider-first-committed-digital-reality-production-launcher-v6.js` | 18,895 | `9298fb1953870607f31abc1dd65cd34f3c9c805445ab6817def176a9979eaa46` | Exact-confirm, private-credential, durable zero-touch v6 launcher. |
| `scripts/outsider-first-committed-reality-production-v6.mjs` | 5,611 | `023290ef618c4fd75b367f34ac009c14a5928015e099d98ca47643a3ba1b5ee9` | Dedicated v6 machine runner; no browser path. |

The relevant focused suites passed 29/29 for the three-layer production API and
local resource observer, and 16/16 for the v3/v5/v6 adapter and composition
lineage. These counts are scoped regressions, not evidence of a real provider
effect by themselves.

### Source break, versioned repair, and live protocol verification

The fresh v12 Episode failed honestly during primary reservation. Its 14-event,
13,382-byte journal ended in `PROGRAM_UNAVAILABLE` with no COMMIT. Raw journal
SHA-256 is
`2fb03a0e706431cc4f3135852d8788fbe6a138af7eb55c9515379fb70f71d1c7`;
the final event/head is
`sha256:2e3be7883dfcd97b09d432999d6b641624aaa8f300bd83618459e10aa5cd1b8d`.
GitHub recovery was created, reconciled, and released; no human queue was
created. A bounded diagnostic reproduced Cloudflare validation error 10021,
`No such module`. The `.mjs` extension alone was not proven invalid.

Frozen v1/v2 were not edited. V3 replaces their hand-authored multipart upload
at the exact initial Script PUT seam with current native `FormData`, setting
`metadata.main_module`, multipart part name, and filename to `worker.js`, while
leaving activation, observation, controlled-failure, and cleanup semantics in
their predecessors. Its protocol hash is
`sha256:632b9f23fc93bab438a858f8dc4e14a3c910fb3ea972ee98204e2e5d41340ff5`.
A real no-PII smoke then completed `RESERVED -> preactivated -> RELEASED`, and
verified the route absent after release. The official current source surfaces
used for the repair were Cloudflare's multipart metadata and Scripts upload
documentation:

- <https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/>
- <https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/>

### Formation Worker v2.4 production deployment

`deploy/cloudflare-formation-job-worker/src/worker.mjs`, 54,740 bytes and
SHA-256
`43c06608819127ca5af0a4ebc849aa2788fcad6336a4c4f25c322fa33dc3a4a7`,
was deployed at 100 percent to the existing production service. The upload was
186.15 KiB, 33.71 KiB gzip, with 24 ms startup time. Cloudflare version number
10 is `ceeaef83-4e4b-44ef-b6b7-e65b0e7c8347`, created at
`2026-09-04T21:14:11.225184Z`. The public capability response reports API
`2.4.0` and has response-byte SHA-256
`bdb5e3d65c60d43593d31e3fb1dc51cd04822cabbee0118f44102cab4da99ce9`.

The two new authenticated, stateless routes are:

```text
POST /v1/recovery-option-portfolios/prepare
POST /v1/standard-bindings/create
```

Both reject raw source payloads, arbitrary URLs, PII, credentials, and payment
material. Both fix authority, capacity, Outcome truth, guarantee, and COMMIT to
false. Existing lifecycle, proposal, formation-job, secrets, bindings, and
Durable Object history were retained.

### Fresh live v13 temporary-network Episode

The v13 request is a 957-byte mode-0600 descendant with SHA-256
`d5ddadca173ead3a7412cd1913bd9d8b8c8b6f6879ed44b769ab2323e44601b7`.
It had a zero-dollar budget and compiled to program
`reality_4932ff68b45b49ab80534cc556146d33ae600f16`, hash
`sha256:bbe31210d21a9ecb3592d35c353793e74977ae1b54a900ecf4104fa64b023406`.

The real machine path was:

```text
Cloudflare Worker primary created and preactivated
  + GitHub Release Asset recovery created
  + UptimeRobot longitudinal monitors made freshly ready
  + Globalping exact status/body preflight for both routes
  -> PROGRAM_COMMITTED after 69.391 seconds
  -> externally observed controlled primary 503
  -> automatic GitHub recovery success
  -> exact-response plus continuous-window witness satisfied
  -> three obligations closed
  -> all three reservations released
  -> PROGRAM_SUCCEEDED
```

The run began at `2026-09-04T21:24:47.558Z`, committed at
`2026-09-04T21:25:56.956Z`, and succeeded at
`2026-09-04T21:39:42.411Z`. It retained two inconclusive witness occurrences
before the source's complete longitudinal range became due; both remained the
same durable transaction and did not issue another provider effect or require
human intervention.

The final private journal contains 42 events and 92,278 bytes. Raw journal
SHA-256 is
`28f8f7163475c1a9d0da94bf1bfc52a9189aa40a32b66821b6dbe94049dcf7ca`;
the replay head is
`sha256:ea8b582ca2794a3b5a238995e749da18a0b8a48d0c1ff4a7659c18c0d08c9950`.
The route-specific witness tree contains 24 files and 60,372 bytes; its
path-and-content file-set digest is
`c0ebaff55eda12489fe520acc1c37b0cbedfa76e0c15585a0e1d7ecfb1995119`.
All evidence files are mode 0600 and all evidence directories are mode 0700.
No frame corpus was created: frame count is zero.

Final source-side cleanup checks returned HTTP 404 for the exact Cloudflare
script, GitHub release tag, and both UptimeRobot monitor IDs. The public result
reported:

```text
state                       SUCCEEDED
program committed           true
primary effect              FAILED / controlled 503 observed
recovery effect             SUCCEEDED
publish witness             SATISFIED
longitudinal witness        SATISFIED
closure witness             SATISFIED
closed obligations          3 / 3
released reservations       3 / 3
zero internal ops observed  true
human queue created         false
payment performed           false
```

This is real `ROUTE_SUBSTITUTION` and establishes one exercised executable
contingency path. The records called `RESERVATION_CONFIRMED` are reversible
deployed capabilities plus monitors; their `validUntil` values are derived from
the Outcome obligation horizon, not provider-issued capacity leases. Therefore
this Episode must not be relabeled `CAPACITY_OPTION_HELD`.

### Physical edge executor and privacy boundary

A new first-physical activation Attempt was issued locally as ordinal 2, reusing
the frozen PrincipalEpoch through Episode ancestry and creating a new Attempt.
It contains nine private files, 38,314 bytes, all mode 0600, with path-and-content
file-set digest
`62837e23a5a8d470cc04ed2b7a7ffdc67019c07ad6c50f64a06fe4f61ef16e24`.
The authority is explicitly `paymentAuthorized=false` and
`orderAuthorized=false`.

Uploading its full address/contact envelope to the central Cloudflare executor
was denied at the sensitive-data egress gate. No workaround occurred and none
of those bytes left the local machine. The Cloudflare SparkFun executor remains
`productionExecutionReady=false`; no cart, quote, order, or payment was created
by this activation.

The preferred next production design is now an attached/user-side Node
executor: personal data and account sessions remain on the user or resource
owner node; the central Outcome OS sees only the frozen job, typed-graph refs,
parameter-envelope hash, source receipts, and lifecycle heads. This is both the
privacy repair and the correct unlimited-entry architecture. A founder-owned
central credential account may remain one optional node, never the unique
network ingress.

### Corrected C/P/R position

| Claim | Status | Exact boundary |
| --- | --- | --- |
| Three-layer contracts and typed recovery code | `C2_ADVANCED` | Outcome OS, typed recovery mechanisms/failure domains, source-only standards binding, and optional resource observation exist; no generic externally verified promotion materializer yet exists. |
| Three-layer public production surface | `P2_ADVANCED_STRUCTURAL` | API v2.4 is live and durable L1 history remains; typed L2 and standards routes are stateless structural reports only. |
| Real executable contingency | `R2_EXECUTABLE_CONTINGENCY_MET_FOR_ONE_DIGITAL_EPISODE` | Cloudflare primary failed under an observed controlled 503 and GitHub recovery executed successfully under independent longitudinal observation. |
| Provider-held recovery capacity | `R2_CAPACITY_OPTION_NOT_MET` | No provider issued a separately enforceable capacity lease or option; `validUntil` remains Outsider-derived. |
| General Outcome COMMIT / guarantee | `R3_NOT_MET` | The internal zero-dollar program COMMIT is not accepted loss responsibility, capital/custody, adjudication, pricing, or a general commercial promise. |
| Physical production execution | `P_PHYSICAL_EDGE_NOT_READY` | The Cloudflare executor is not configured with private destination data; the PII-local attached executor path remains to be connected. |

### Next gates, in order

1. Connect the existing Node deterministic executor as a PII-local attached
   resource node. Add the smallest authenticated claim/result transport needed
   for the Formation Worker to dispatch a hash-only frozen job to it; do not add
   another generic marketplace or staff queue.
2. Execute the existing zero-payment SparkFun prepayment plan through that
   attached node, preserving its real source bytes privately and returning only
   bounded receipts. This should prove cart plus destination-specific shipping
   quote/ETA formation; it still must not be called capacity or delivery.
3. Add a second independently executable physical transaction route and an
   independent acceptance witness, then exercise substitution before any user
   promise. Carts and quotes remain candidates until a source-native hold,
   reservation, cancellable order, or other enforceable commitment exists.
4. Bind completed executable-contingency Episodes back into the typed Layer-2
   lifecycle and Episode Data Engine so actuarial/causal ranking can learn from
   source-replayed attempts. Promotion remains group-disjoint, baseline-gated,
   outcome-blind-audited research and cannot authorize action or COMMIT.
5. Defer PRICE, GUARANTEE, and SETTLE until provider-held capacity, external
   owner adoption, capital/custody, adjudication, and longitudinal loss evidence
   exist.

## User-held physical execution and real second-seller rejection — 2026-09-04 v22

This append-only checkpoint follows v21. It does not rewrite the frozen
first-physical request, private address/contact envelope, typed graph, Episode,
earlier Attempts, provider source bytes, lifecycle events, or route-proposal
occurrences. It records the first physical seller path executed by a
user-held outbound machine node, its durable no-repeat reconciliation after a
receipt transport failure, and a real second-seller candidate which was
rejected against the same frozen acceptance predicates.

The product invariant remains:

```text
one user Outcome
  -> temporary multi-resource formation
  -> exact primary + recovery + witness evidence
  -> COMMIT only after every external conjunction closes
```

Neither a cart, a seller acknowledgement, a central receipt, an inventory
count, nor a delivery estimate is independent Outcome truth.

### Unlimited ingress now has a deployed user-held execution path

`docs/OUTSIDER-THREE-LAYER-OUTCOME-ARCHITECTURE.md` now explicitly fixes the
unlimited-ingress design: any authorized user, agent runtime, resource owner,
merchant connector, or appliance may run an outbound-only Edge Node. Private
parameters and provider-native exchanges remain at that node; the central
Formation plane sees order-scoped keyed commitments and a bounded execution
receipt. A founder-controlled credential account remains one optional node and
cannot become the network's unique ingress. The updated architecture document
is 28,618 bytes with SHA-256
`6162b28f7bcdebd488c03ef8a9f2fd3cb44e8304f2285f9e40bf788e6227d41e`.

The initial protocol uses an order-scoped HMAC commitment and a pre-bound
capability hash behind the Formation bearer. This removes PII and naked
PII-derived hashes from the central plane, but it is an intermediate trust
mechanism. Multi-owner federation still requires expiring order-scoped public
key proofs and revocation.

The new implementation artifacts are:

| Artifact | Bytes | SHA-256 | Exact role |
| --- | ---: | --- | --- |
| `src/outsider-user-held-formation-executor-protocol-v1.js` | 22,375 | `e6f53c393b6eafe927826bfa53968e833c911f9ebb711d48707c1c26469f779d` | HMAC job/result commitments and one-use `PUBLISHED -> CLAIMED -> COMPLETE` reference state. |
| `src/outsider-user-held-formation-executor-client-v1.js` | 11,283 | `7c1acd4b0a872802c2299e91f50b297f7a9672801bde10152b884fa05fa23e1b` | Outbound publish/claim/receipt client plus durable local-result reconciliation. |
| `scripts/outsider-user-held-sparkfun-formation-executor-v1.mjs` | 21,207 | `9916feec7c7af8d7acd227754401995fbff8655bfaf2cfdc40eedd10f95afbbf` | Mode-0600 local activation, provider-native machine execution, safe projection, and `--reconcile-only` mode. |
| `scripts/outsider-user-held-sparkfun-activation-v1.mjs` | 19,319 | `df578ac5d2f0f8c11e9c109f7f435a6c3427d1fa3185653a06ca1a068758eb70` | Fresh private-input descendant and ordinal-3 Attempt activation without copying the central credential. |

The activation contains ten static private files and 38,490 bytes. Every file
is mode 0600 and every directory is mode 0700. It creates a new ordinal-3
Attempt under the existing PrincipalEpoch, AccountableDeployment, Runtime,
Delegation, and Episode; it does not create a parallel identity model. The
activation was issued at `2026-09-04T22:18:40.519Z` and expires at
`2026-09-05T02:18:40.519Z`. Payment and order authority are both false.

### Formation Worker v2.5 and durable one-use claims

The Formation Worker was deployed as API `2.5.0` at 100 percent. Cloudflare
version number 11 is
`4c2dcbdc-3acc-4671-abf5-f3a2c62ac5d2`, created at
`2026-09-04T22:08:46.438581Z`. The upload was 216.13 KiB, 38.92 KiB gzip, with
a 14 ms startup time. The deployed source is 77,176 bytes with SHA-256
`5cd52a3a2584fc27a9958673adc1cd43e10557c519d3028f952c44df9087f4da`.

The new authenticated routes are:

```text
POST /v1/client-executions
POST /v1/client-execution-claims
POST /v1/client-executions/{jobKey}/receipt
GET  /v1/client-executions/{jobKey}
```

They are backed by a separate SQLite Durable Object state machine. The first
eligible claim receives the immutable invocation. A duplicate unclosed claim
receives `HOLD` with no invocation. The service never automatically reassigns
an effect after claim; exact receipt replay is idempotent. The public health
response is 1,950 bytes with SHA-256
`9cc493491690b48c972e632faddd379cbb0b1ecaaca81ef970965bd147b87818`.
It reports durable publication and outbound claim available, central private
parameter and unkeyed-private-hash storage false, duplicate invocation false,
automatic reassignment false, and executor receipt as independent Outcome
truth false.

A no-provider synthetic control-plane smoke returned:

```text
publish                              HTTP 201
first claim                          CLAIMED, invocation=true
duplicate unclosed claim             HOLD, invocation=false
receipt                              COMPLETE
exact receipt replay                 idempotent=true
claim after completion               COMPLETE, invocation=false
provider requests                    0
payment/order effects                0
```

The synthetic job key was
`sha256:400a05831296599115b0ba4ce194f1ca1713cb3864f995990a07939bc39e8737`;
its final receipt hash was
`sha256:3cae8d70471e579dcc6067ef759883b0b5bcf5be342089cbf1db226709fb36f7`.
This verifies durable dispatch behavior only.

### First real user-held physical seller execution

The Edge Node published and claimed a keyed job while keeping the full
destination and contact envelope local. It then executed the existing
SparkFun Magento guest transaction path as native HTTPS, not browser or model
interaction:

```text
catalog quote
  -> isolated guest cart
  -> full-address shipping-method quote
  -> apply selected shipping method and recompute total
```

The provider path made 12 real HTTPS requests: seven GET and five POST. It
made zero browser actions, model calls, employee touches, payment-endpoint
attempts, and order-endpoint attempts. A provider-side guest cart and shipping
selection were created. No payment method was selected, no payment was
performed, and no order was submitted.

The seller returned a final total of USD 18.17, within the USD 20.00 ceiling,
and accepted the full-address shipping method. It did not return a structured
delivery date, and the tax quote was not treated as final. The honest result
therefore remains:

```text
READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD
capacityReserved                     false
deliveryDeadlineProven               false
independentOutcomeTruthEstablished   false
outcomeCommitted                     false
next gate                            structured ETA + separate payment authority
```

The job key is
`sha256:cf65f2fe138a7c5f59a6ed450bd484d0a86515bad4d6e8419b48a826fb25bf54`;
the central completion receipt is
`sha256:72afe2c25a1f8d8cd79ae225c8feebbbf91072a4186542d9e524571cedb5f601`.
The private runtime contains 14 files and 817,818 bytes with path-and-content
file-set digest
`c56ae8aa49ec17b9362d560e131e7a3cf77e88d0baf6e01da904dde60173627e`.

Two defects were exposed by the live path rather than hidden by mocks. The
first publish correctly returned HTTP 201, which the initial runner rejected;
this happened before claim and before provider I/O. After that repair, the
provider execution completed locally, but the receipt client URL-encoded the
colon in the SHA-256 job key and received HTTP 404. The Durable Object retained
`CLAIMED`, emitted no second invocation, and did not reassign the effect. A
fresh process then used `--reconcile-only`: provider network access was
mechanically disabled, the exact durable local result was replayed, and the
receipt reached `COMPLETE` with zero additional provider calls. A subsequent
cold replay left the 14-file tree and digest unchanged. Missing or partial
local state remains `EFFECT_UNKNOWN / DO_NOT_RETRY`; it is not retried.

The same real Episode's Outcome OS lifecycle accepted the ordinal-3 Attempt
evidence as revision 3. The lifecycle now has four events, two
Attempt-evidence events, and head
`sha256:401c3744bd5b836dfa3c08f98e43089a6b6b4d3b9bf28655ac9d5b90031a215a`.
It remains `OPEN`; raw events are not projected and neither Outcome truth nor
COMMIT exists.

### Real second-seller observation and exact rejection

The Target RedSky descendant bound the same frozen acceptance predicates:

```text
condition NEW
USB-A male -> USB-C male
data transfer required
explicit 5 V evidence required
length 900-1100 mm
quantity 1
maximum total USD 20.00
delivery on or before 2026-09-10
```

It made exactly two public machine GETs: one product occurrence and one
destination-specific fulfillment occurrence. It made zero account-only
same-day, cart, checkout, payment, and order calls. Target reported `IN_STOCK`,
available-to-promise quantity 10, a standard two-day service with source date
`2026-09-06`, and item plus scheduled-delivery fee before tax of USD 15.98.

The route was nevertheless rejected as
`TARGET_EXACT_PRODUCT_REQUIREMENTS_UNPROVEN`: the source did not provide the
required explicit 5 V statement for this item, an all-in post-tax total was
not proven, and no capacity was reserved. The projection is
`sha256:a36884155a14f778c679742ed040399043293409ea4ad4ad0270990bcaa89b50`.
Its successful private source tree contains eight files and 26,859 bytes, all
mode 0600 under mode-0700 directories. A separate interrupted one-file,
2,289-byte run remains preserved as failed append-only evidence and was not
deleted or rewritten.

The production route-proposal registry then accepted the real Target
observation as one hash-only proposal occurrence at
`2026-09-04T22:49:09.815Z`:

```text
append                               HTTP 201
proposal occurrences                3
distinct proposal objects           3
registry revision                   2
registry head event                 sha256:39c9d66e9cefa8e50a50199fadb26492f074c1b8dffe82f9e1e6459d2fbabcb9
route selected                       false
executable capability               false
capacity                             false
authority                            NONE
Outcome truth / COMMIT               false / false
raw events projected                 false
```

The first two occurrences were earlier synthetic control-plane records; only
the third is this real seller observation. Recording a rejected real
candidate prevents repeated rediscovery and preserves the true formation
denominator. It does not turn that candidate into a network member or recovery
option.

The Target implementation artifacts are:

| Artifact | Bytes | SHA-256 | Exact role |
| --- | ---: | --- | --- |
| `scripts/outsider-target-redsky-read-only-live-v3.mjs` | 11,564 | `3591f35f3bf4a40fddf4b7554120acfae1d3bcf35f04aa4ffeb2a87427c7ab57` | Real two-GET product/fulfillment observation against the frozen acceptance state. |
| `src/outsider-target-redsky-formation-node-composition-v1.js` | 13,573 | `aa289f7a09393eb25f4d9be04bd8fb73ab34b570ad8bdd0cce23b5c181c8f5e5` | User-held keyed claim/receipt composition for this route; it does not elevate a rejected observation. |
| `test/outsider-target-redsky-user-held-formation-e2e-v1.test.js` | 12,222 | `09e30ecf222403e9aa7683856feb8cc30aa3ee09df68f1596ccbec578a452697` | Exact requirement-gap, PII-boundary, and no-capacity regression. |

The successful live Target observation itself ran directly on the local
user-held node. The composition is tested against the central claim seam, but
that exact live Target occurrence was not dispatched by the production
Durable Object and must not be described as if it were.

### Focused verification and corrected product position

The final focused suite covering the deployed Worker semantics, three layers,
durable route registry, user-held protocol/client, activation, SparkFun
execution/reconciliation, and Target composition passed 29/29 with zero
failures.

| Claim | Status | Exact boundary |
| --- | --- | --- |
| User-held unlimited ingress | `P2_FIRST_NODE_LIVE` | One outbound local node completed one real seller transaction path while central storage remained keyed/hash-only. Multi-owner public-key enrollment is still absent. |
| Physical primary route | `REAL_QUOTE_AND_CART_HOLD` | Exact product, full-address route, and USD 18.17 total exist; structured ETA, capacity, order, delivery, and independent acceptance do not. |
| Physical recovery route | `REAL_CANDIDATE_REJECTED` | Target inventory/date were observed but the exact product and all-in/capacity conjunction failed. No recovery option is held. |
| Temporary physical supply network | `PARTIAL_NOT_COMMITTABLE` | Two real seller interfaces were contacted by machine, but only one exact-product route passed the product gate and neither exposes an enforceable reservation. |
| Outcome OS lifecycle | `OPEN_REVISION_3` | The real user-held Attempt is attached to the original Episode. No independent delivery fact or terminal Outcome exists. |
| Payment and order | `NOT_AUTHORIZED_NOT_PERFORMED` | No payment or order endpoint was invoked. |
| Commercial Outcome COMMIT | `R3_NOT_MET` | Recovery capacity, independent acceptance witness, loss backing, payment mandate, and delivered Outcome remain open. |

### Immediate next gate

The next work is not another safety registry or browser macro. It is to acquire
one independently executable seller/fulfillment route that simultaneously
proves the frozen product predicates, post-tax all-in total, structured
deadline, and source-native cancellable reservation or equivalent option.
Adafruit product 4474 is a strong current candidate because its seller source
explicitly states approximately one metre, data conductors, and fixed 5 V;
its destination-specific machine quote and ETA still have to be obtained.

Once a second exact route exists, the portfolio admission bridge must preserve
both seller failure domains, exercise trigger, latest-safe time, cancellation,
and single-writer semantics. Only then should an injected primary failure
exercise physical route substitution. Delivery acceptance must come from an
independent owner/device/carrier witness and must test the frozen connector,
data-transfer, and 5 V predicates. Payment remains a separate user authority
gate and cannot be inferred from formation progress.

## Real-evidence recovery admission and SparkFun proposal lineage — 2026-09-04 v23

This append-only checkpoint follows v22 and corrects one intentionally later
production fact without editing v22: after the Target occurrence was recorded,
the already-completed SparkFun user-held route was also appended to the same
production proposal registry. No seller request, cart mutation, address
transmission, payment, or order occurred during this hash-only append.

The production append at `2026-09-04T23:00:04.920Z` returned HTTP 201. It bound
SparkFun projection
`sha256:f5d0ba7cf6602ffe10b95fcc488446d342fe10304e5a01221e0397f4b29892a1`
to occurrence
`sha256:91fdab89149d73e3193ee8617c2d47774f1a76438d937e04999158d55265e634`.
The registry is now revision 3 with four occurrences and four distinct
proposal objects. Its head event is
`sha256:e3d2967facdaa3f646e47921da2d44ee2dcb8bfb1bbd86be6dde0f9b1491e08e`
and its head hash is
`sha256:6a3b69e828ae47b85286c1c1c09f9c2085c06aae6adcc3afb074f6144511af7c`.
The first two occurrences remain synthetic control-plane records; the third is
the real rejected Target observation; the fourth is the real executed
SparkFun route. Selection, executable capability, capacity, authority,
Outcome truth, and COMMIT remain false.

### Hard admission gate between real evidence and recovery planning

`src/outsider-recovery-portfolio-admission-gate-v1.js` closes the missing
decision seam between occurrence storage, search/ranking, and the existing
typed recovery portfolio. A candidate can enter recovery planning only when
all four source-bound gates are true:

```text
frozen specification match
  AND complete item + tax + shipping + fees total within budget
  AND structured ETA within the frozen completion deadline
  AND current resource-owner capacity lifecycle covering the Outcome
```

The gate fully replays the Outcome lifecycle, route-proposal registry, and an
append-only candidate-evidence hash chain. A proposal without a real registry
occurrence is rejected. A seller claim, ATP value, generic server
acknowledgement, ready-for-payment state, search rank, model score, actuarial
score, or source-replay-receipt reference cannot substitute for the four
gates. Among multiple fully qualified candidates, deterministic planning order
is lowest all-in total, earliest ETA, then hash. This ordering selects a plan;
it does not itself reserve capacity or authorize execution.

The real-projection bridge recomputes and verifies the exact SparkFun v1 and
Target v3 projection hashes on the user-held node, maps only bounded facts and
hash references into four evidence events per candidate, and drops provider
identity, product identifiers, destination metadata, private-input metadata,
and raw response bytes from its output.

The current two-real-route result is:

```text
candidate count                       2
admitted candidate count              0
rejected candidate count              2
portfolio planning selection          false
decision                              UNAVAILABLE_RECOVERY_ROUTE

SparkFun specification                pass
SparkFun all-in USD 18.17 <= 20.00     pass
SparkFun structured ETA               unproven
SparkFun owner capacity lifecycle      unreserved

Target frozen specification           mismatch
Target USD 15.98 partial amount        incomplete all-in total
Target structured ETA                 within deadline
Target owner capacity lifecycle        unreserved
```

Therefore the math/data foundation is now operating on the real seller
observations, but it correctly produces zero recovery admissions. This is not
a model-performance failure; it is the measured external-state gap the
formation engine must close.

| Artifact | Bytes | SHA-256 | Exact role |
| --- | ---: | --- | --- |
| `src/outsider-recovery-portfolio-admission-gate-v1.js` | 28,144 | `84b88fd29ba8d59d2de9176faa439b0e36911448baacee1b78f3216c1e0f91d6` | Source-replayed four-gate recovery planning admission and deterministic economic tie-break. |
| `test/outsider-recovery-portfolio-admission-gate-v1.test.js` | 15,463 | `834c9421f5e358c3cc545755fc66f9a681a8826471eae71a8b7e7fdb2af33662` | Missing/mutated occurrence, pricing, ETA, capacity, seller-ack, and ordering regressions. |
| `src/outsider-real-route-projection-admission-bridge-v1.js` | 29,215 | `4307cf522f10c4077fd7f66c47d4a219c4ea50f6819f63d2b68e7889c7aa7283` | PII-local mapping from the two content-addressed real projections into bounded admission evidence. |
| `test/outsider-real-route-projection-admission-bridge-v1.test.js` | 10,847 | `7cb2a50788c7cfdbd60874267bb9aecf3b9084d65ec6c18fba5207cd9fb81c92` | Direct real-artifact hash replay, exact gap classification, and closed-shape privacy regression. |

The gate and bridge remain local/user-held code in this checkpoint. Their test
registry is constructed with the exact production route and occurrence
references, but production raw registry events were not exported and are not
claimed to have been replayed outside the Durable Object. A future deployed
admission operation should run beside that durable event store or consume a
verifiable membership proof; it must not weaken the no-raw-event projection
boundary merely to move the calculation centrally.

## Seller-neutral evidence, third real route, and exact quote executor — 2026-09-04 v24

This append-only checkpoint follows v23. It does not edit the earlier physical
Episode, rewrite either seller observation, or claim that a quote/cart is
capacity. It moves the product from seller-specific experiments toward the
same Internet-scale formation path for every buyer-native node.

### Fresh public machine observations

A first sandboxed, read-only probe at `2026-09-04T23:22:10.285Z` reached
neither seller and closed both Attempts as `AMBIGUOUS_NO_RETRY_HOLD`. It
performed no retry, cart mutation, address disclosure, payment, or order. Its
private tree is preserved as three mode-0600 files, 6,186 bytes, with relative
path-and-content digest
`sha256:968a3689f54db3f472fa58d3809085fffb7f31e015a718eec53dacee5630d787`.

A new Attempt outside the restricted network sandbox at
`2026-09-04T23:22:51.471Z` then issued exactly two public machine GETs in
parallel and observed two current catalog occurrences:

| Route | Current source observation | Occurrence | Private receipt |
| --- | --- | --- | --- |
| Adafruit native resource 4474 | USD 4.95, `InStock`; official source text binds USB Type A to Type C, data/power, forced 5 V, and about one metre / three feet | `sha256:9f888a34f6b120240cf565808d7492573ad1e1d04baafff37e058c1d61849b1d` | 119,071 bytes; `sha256:0eaa7876c6c042771188f09015521c9aaae46088297d86cadc837be77946bfba` |
| SparkFun native resource 4636 | USD 7.95, current catalog `InStock` | `sha256:01e9c3a9163cbb2e63ebfc400c034448fbe1516306c06cb38f9443aef948c083` | 765,897 bytes; `sha256:32f40a090fd685aa7298d1831359734ff1424ff2a6b24cc85333c85831041b6d` |

The successful manifest is 2,101 bytes, file hash
`sha256:4e11fe83af40ea32b16de4eb7f6fead14d102a0e73975798bc14dd3ff277d9ff`,
and semantic manifest hash
`sha256:52eae670e7e9108a3fcec63c93be50015bf930eaa441cacf20880d0b7a806501`.
Its private tree contains eight files and 895,223 bytes, all mode 0600 below
mode-0700 directories, with relative path-and-content digest
`sha256:0fb60a3be6c51a538d0faaab2afac753f0cfa7768865f1b6f7a4db661fb7ad62`.
There were zero browser actions, seller messages, cart mutations, address
submissions, payment attempts, orders, or capacity reservations.

### Reusable production proposal ingress

`scripts/outsider-production-route-proposal-append-v1.mjs` replaces the
one-off registry command. Any user-held node can read the current production
registry head and compare-and-append exactly one route-proposal and occurrence
hash. The credential must be a mode-0600 local file and is never projected;
the client accepts no provider identity/URL, raw response, PII, credential
payload, or payment material.

The client was used against the deployed Worker to append the real Adafruit
catalog observation. The append returned HTTP 201 with idempotency hash
`sha256:163dfe83ee8c438c08e08bd2f63732448d6ffa77cae41848e91f4863d6fed66b`.
The production registry is now revision 4 with five occurrences and five
distinct proposal objects. Its head event is
`sha256:d78f28a74aef7b98fbf3c4135a03b2728fa916e4473b18d52bcce4c941212588`
and head hash is
`sha256:3f55eba7e67b1e33a54c3c1ac11703544fe6803510a906964ca5a4a6ee32f90d`.
The current Outcome lifecycle head remains
`sha256:401c3744bd5b836dfa3c08f98e43089a6b6b4d3b9bf28655ac9d5b90031a215a`.
Route selection, executable capability, capacity, authority, Outcome truth,
and COMMIT remain false.

| Artifact | Bytes | SHA-256 | Exact role |
| --- | ---: | --- | --- |
| `scripts/outsider-production-route-proposal-append-v1.mjs` | 8,656 | `a468e562594f0841acc3406ff5b5f4d9988450f41bb90a02039a3e8b40e55a5d` | Reusable production GET-head then CAS-append client. |
| `test/outsider-production-route-proposal-append-v1.test.js` | 4,957 | `d2adfafa076f60f972d358bd02261a93b6bef82ceb49f8d4ebff4226861b098e` | Exact payload, local credential, no-PII, and no-promotion regressions. |

### One seller-neutral evidence seam

`src/outsider-buyer-native-route-evidence-v1.js` removes the need for the
recovery math to understand every seller projection. Each Edge Node emits only
content references and normalized `SPECIFICATION`, `ALL_IN_PRICE`, `ETA`, and
`CAPACITY` facts. Negative and unproven states survive unchanged, and the
object maps directly into the existing admission gate rather than creating a
new registry.

The same contract consumed current real facts from all three routes:

```text
SparkFun  spec MATCH, USD 18.17 COMPLETE, ETA UNAVAILABLE, capacity UNRESERVED
Target    spec MISMATCH, USD 15.98 PARTIAL, ETA STRUCTURED, capacity UNRESERVED
Adafruit  spec MATCH, USD 4.95 PARTIAL, ETA UNAVAILABLE, capacity UNRESERVED
```

All remain rejected. In particular, relabelling Target ATP or a seller
acknowledgement as `RESERVED` is rejected because owner-lifecycle source replay
is absent. Model, causal, ranking, and actuarial outputs may prioritize which
missing fact to acquire next; none may override these four observed gates.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/outsider-buyer-native-route-evidence-v1.js` | 11,400 | `0b4b3f61f7bde375ad4f00badbddabe1954a6478b22851024b6a9aa2575a1fc7` |
| `test/outsider-buyer-native-route-evidence-v1.test.js` | 16,025 | `63982124d313c535bd1df034833dd370e3e647608c79f590a16abad768b368b5` |

### Exact Adafruit destination-quote execution path

The earlier v4 private pair incorrectly reused the SparkFun product schema.
Those three v4 artifacts remain frozen and are marked semantically rejected;
they were not rewritten. A v5 reissue created a provider-neutral Outcome
specification plus a separately selected seller-native route:

| Private descendant | Bytes | SHA-256 |
| --- | ---: | --- |
| provider-neutral v5 input | 1,070 | `f8984005ffaf3611db8415951500a01fe4d161c5fb36d39e50411057dd4fb57c` |
| purpose-bound one-use v5 grant | 664 | `c3760d723d035f7beb152bee9e95f218bbb7441a94423c757f6b0e6f0310497f` |
| v4-to-v5 supersession lineage | 1,294 | `e2233a0f97f4ccb91c0f891f792531b39cebca0fe24ff430390103f7d68778bb` |

All three are mode 0600. Private values were not printed or projected.

The v5 one-process executor compiles native resource 4474, source-replays its
catalog bytes against the exact connector/data/power/5 V/length predicates,
then reuses one anonymous cookie session through product, isolated cart,
contact, address, and destination shipping quote. Its maximum path is 13
machine HTTPS calls: ten GETs and three POSTs, with only `add_product`,
`save_one`, and `save_two` mutations. It has no shipping-method apply,
payment, order, or marketing operation. Request bodies are represented only by
hash in durable artifacts; raw responses remain private 0600 files.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `scripts/outsider-adafruit-full-address-shipping-quote-live-runner-v5.mjs` | 45,389 | `84115b7785f8afe0d993f93154b1be3cc6c389eaaf3205d7b473696837fb2519` |
| `scripts/outsider-adafruit-private-route-quote-reissue-v5.mjs` | 12,859 | `8c1881409baf311ffa157bfbdda8eb7206772c3dae7ca6312de5add756d43606` |
| `src/outsider-adafruit-full-address-shipping-quote-stage-v2.js` | 25,234 | `f61cec62931d5c34b45683c1f52338cbf590ee7e3850fe35bada755e3ac7821b` |
| `test/outsider-adafruit-full-address-shipping-quote-live-runner-v5.test.js` | 18,974 | `c83b34cd2f44bd5e1bdd53748c8b5712e18b55c688a4dfeb321d423cd0976878` |
| `test/outsider-adafruit-full-address-shipping-quote-stage-v2.test.js` | 9,714 | `67a885e780facc5463c762b4c77c5e423c10a798eb9c627914bfb8ee13ecf0ee` |

The live v5 executor has deliberately not run. The destination-specific POST
would disclose the authorized contact and destination to Adafruit; generic
repository permission is not being interpreted as destination-specific PII
transmission consent. No such PII left the user-held node in this checkpoint.
Once that exact one-use disclosure is authorized, the next operation is the
machine-only product-to-destination-quote path, still with zero payment and
zero order calls. A successful quote can close the Adafruit specification,
all-in, and ETA facts, but it still cannot establish owner-lifecycle capacity,
delivery, independent acceptance, or COMMIT.

## Quote-to-admission composition and physical acceptance bridge — 2026-09-04 v25

This append-only checkpoint follows v24 and corrects three artifact hashes
which advanced after v24 was written. The prior text is retained rather than
silently rewritten. The v5 runner, its test, and the production append client
were extended in the same engineering turn to close the route-evidence
composition; their current descendants are:

| Artifact | Current bytes | Current SHA-256 | Supersedes v24 role by adding |
| --- | ---: | --- | --- |
| `scripts/outsider-adafruit-full-address-shipping-quote-live-runner-v5.mjs` | 48,980 | `23a5932708a692f6f374f31a04d422bcfd57c788375a6e86cfe9cc5ec5366766` | Durable `route-evidence.v1.json` emission and reconcile binding. |
| `scripts/outsider-production-route-proposal-append-v1.mjs` | 10,336 | `7ff14b668338d2e6001ed7347a3daf00a86afc566f9fa93fd29f58f95999a2b8` | Verify a full user-held route-evidence object, then transmit only proposal and occurrence hashes. |
| `test/outsider-adafruit-full-address-shipping-quote-live-runner-v5.test.js` | 23,750 | `2dc474d7a168736cff0a0f1eca55ac4f92ca9878e334375ad3a1f74b17d9ab68` | Quote-to-evidence-to-production-append composition regression. |

On a successful destination quote, the v5 node now emits one provider-free
route-evidence artifact. It preserves `MATCH` specification, complete all-in
minor units, structured ETA, and `UNRESERVED / SELLER_SERVER_ACK_ONLY`
capacity exactly. The production wrapper fully verifies that object locally,
but the central request still carries only its route-proposal and occurrence
hashes. The evidence hash, fact payloads, seller/product identifiers, raw
source, and private inputs do not cross the central interface.

The already appended real Adafruit catalog occurrence was then replayed once
through the current production client. It returned HTTP 200,
`idempotentReplay=true`, and `eventAppended=false`; the production registry
remained revision 4 with five occurrences and five distinct proposals. This
verifies restart-safe central reconciliation without inflating the network
denominator.

### Provider-neutral physical delivery acceptance

`src/outsider-physical-delivery-acceptance-bridge-v1.js` closes the code seam
after a future order and delivery. It combines two independently
content-addressed inputs bound to the same frozen Outcome, exact acceptance
criteria, Episode, Attempt, and product state:

1. a carrier delivery occurrence; and
2. a signed independent recipient/instrument inspection referenced by the
   existing witness lifecycle.

The physical inspection evaluates connector A, connector B, data transfer,
nominal 5 V, quantity, and condition. `DELIVERED` alone never satisfies the
Outcome. A witness sharing the delivery executor's provider or controller is
not accepted as independent, and provider self-report/server acknowledgement
cannot become physical truth. Failure of any one frozen predicate keeps the
Outcome open.

The bridge can now construct a complete, cross-bound evidence package, but the
existing witness lifecycle intentionally remains caller-pinned and HOLD-only.
Therefore even the complete structural package reports
`deliveryAcceptanceEvidenceComplete=true` while
`deliveryAcceptanceEstablished=false`, `authority=NONE`, and no COMMIT. The
remaining real gate is an externally established independent witness owner and
control root, followed by an actual post-delivery inspection occurrence.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/outsider-physical-delivery-acceptance-bridge-v1.js` | 23,752 | `c3f14ade9e630c2de4be6ab9354e7900d6bae4687f461c6f0521dd52f0e13bc5` |
| `test/outsider-physical-delivery-acceptance-bridge-v1.test.js` | 10,998 | `29db915b2b42dfc1b60ccf42c8528e875a207501c6207e98f4e37d1ce3e11970` |

The final focused integration set in this checkpoint covers deployed Worker
semantics, durable Outcome/registry state, user-held execution and
reconciliation, three seller routes, seller-neutral evidence, recovery
admission, the exact Adafruit quote path, independent witness lifecycle, and
physical acceptance. It passed 73/73 with zero failures in 6.29 seconds.

## Machine-native transaction recovery and real Edge source execution — 2026-09-05 v26

This append-only checkpoint follows v25. It does not rewrite v24's then-true
statement that the Adafruit v5 path had not run, nor v25's conditional
description of what a successful complete quote could emit. Later live effects
and descendants are recorded here. No payment or order operation occurred.

### The checkout is now a source lifecycle, not one retryable script

The real Adafruit path reached the seller through its native HTTPS transaction
surface. Contact and destination effects each occurred exactly once under
separate one-use grants. When the response after the destination submission was
ambiguous, the process stopped; it did not restart checkout or repeat either
effect. A versioned read-only descendant then reconciled the seller's current
step. The first parser descendant, v7, encountered a real sibling input/label
DOM shape and remained frozen as failed evidence. The v8 descendant corrected
that parser without changing the v7 tree and made exactly two GETs and zero
POSTs.

The v8 seller receipt proves the frozen product predicates and exposes seven
shipping choices. The provider-selected route shows subtotal USD 4.95,
shipping USD 8.69 and destination tax USD 0.31. Their component sum is USD
13.95, but the source did not display a final total and supplied no structured
delivery date. Therefore the facts are deliberately:

```text
SPECIFICATION  MATCH
ALL_IN_PRICE   PARTIAL_COMPONENT_SUM / USD 13.95
ETA            UNAVAILABLE
CAPACITY       UNRESERVED / SELLER_SERVER_ACK_ONLY
COMMIT         false
```

The address-resume v6 tree contains four files and 146,522 bytes. The frozen
v7 failure contains one 582-byte file. The v8 tree contains nine files and
98,012 bytes. Every file is mode 0600 under mode-0700 directories; no previous
tree was mutated. Contact, destination, cookie and raw seller bytes remain
local and private.

Target closes a different subset of the same route requirements. Its exact
specification descendant proves a new Philips USB-A-male to USB-C-male cable,
480 Mbps data, 5 V / 3 A / 15 W, and six-foot length. The destination-bound
source reports `IN_STOCK`, ATP 10 and delivery on 2026-09-06, but only an item
plus delivery amount before tax. It therefore remains `MATCH / PARTIAL /
STRUCTURED / UNRESERVED`. The seller-neutral recovery bridge rejects it with
`UNAVAILABLE_RECOVERY_ROUTE`; missing facts are the complete all-in amount and
a source-replayed resource-owner capacity lifecycle. ATP is not reservation.

### Reusable seller-neutral user-held execution rail

The code foundation now has a public adapter binding which is identical across
sellers: `user-held-read-only-route-observation@1.0.0`. A new typed-graph
Attempt is issued as `USER_HELD_ROUTE_OBSERVATION /
READ_ONLY_SOURCE_OBSERVATION`. Provider URL, destination, credentials, exact
response bytes, PII and unkeyed local hashes remain at the user-held Edge Node.
The central broker receives only order-scoped keyed job, occurrence and result
commitments. The node writes the exact source bytes as a 0600 artifact before
constructing the occurrence and result receipt; a cold replay returns that
sealed result without provider I/O.

The generic one-use production runner accepts one to four explicit HTTPS GETs.
It rejects authentication headers, write methods and cart, checkout, payment,
order, contact or address routes. Redirects and non-2xx responses are
incomplete observations with no automatic retry and no fabricated occurrence.
This is a transport boundary, not a claim that future real transactions must
remain read-only: each later mutating source lifecycle transition instead needs
its own explicit, purpose-bound one-use instruction and durable reconciliation.

The first Target job through the production broker proved publication, one-use
claim and central receipt persistence, but its seller request ended locally as
`READ_ONLY_ROUTE_OBSERVATION_LOCAL_EVIDENCE_INCOMPLETE`. Its broker record is
`COMPLETE` while the formation result is `HOLD` with zero source occurrences.
The immutable identifiers are:

```text
Attempt       sha256:e01f57b88c75f9e7d847e98cec517c7355c805c10a7203d8d392ef00b87a27ba
composition   sha256:4352a354c4c5a6efa9b4ce6b253698473789b9c414983e793b7b6ea6f97c4c70
job key       sha256:c7bb9970b3bec2e3718926e78fb0d0ff35e681cc24c5684ea69fff0562507b56
job hash      sha256:6264190db257b492ae5c52454d269785d3ae3d2579486dba67d06e88f4ceec50
receipt       sha256:1a8b50889e957af751e39b9a19a3fea8ee28621ad9bc700043b68a255d41379a
```

That broker record must never enter the route occurrence denominator. Broker
completion means receipt persistence, not seller-source completion.

At `2026-09-05T01:16:07Z`, a versioned descendant then executed a real Adafruit
public product GET through the same deployed broker and user-held Edge rail.
This was machine-to-machine execution, not browser or mouse control. The
production path completed `PUBLISHED -> CLAIMED -> COMPLETE`; the local
formation result remained the honest `HOLD /
READ_ONLY_ROUTE_OBSERVATION_RECORDED`, and it contains exactly one real source
occurrence. Central readback returned `HASH_ONLY_RECEIPT_RECORDED` and the same
single occurrence count.

```text
Attempt       sha256:2107b6e16b3d859636cff9d6578fae435a2a8d4b9f4c82966e7ee97fd5edf0a3
composition   sha256:c7ce76c0113a7747eb73c346badb43c087dd9c1a18993f2b3c2a8343acec094f
job key       sha256:55ae2024944c58e5dbd8082c14e954dace0ecc8a4314489f72b1519756208182
job hash      sha256:640d22393a679806701b08da513785382e97501cb25f56798377d69fed1c8e49
receipt       sha256:b996358df444f7745a3f4975f9b127ddc72062383d78e25916a095fbd8593707
broker        COMPLETE / HASH_ONLY_RECEIPT_RECORDED
formation     HOLD / READ_ONLY_ROUTE_OBSERVATION_RECORDED
occurrences   1
effects       one HTTPS GET; payment/order/cart/contact/address = 0
```

The exact local source bundle is 87,918 bytes. Together with its marker,
source occurrence and result receipt, the private execution tree contains four
files and 90,451 bytes; all are mode 0600 under a mode-0700 directory. The
public source supplied HTTP 200 and current seller-declared product, USD 4.95
and `InStock` facts. These remain source observations, not reserved capacity or
independent Outcome truth.

### Existing foundations now act on real facts but do not mint authority

The seller-neutral evidence seam feeds the frozen specification, price, ETA
and capacity facts into the existing causal/recovery and actuarial planning
layers. Those layers can rank which missing fact is worth acquiring and which
route has lower expected loss, but the hard recovery admission gate still
returns zero admitted routes. A new owner-capacity admission module accepts
only a current, source-replayed, signed owner lifecycle bound to the exact
route, quantity, window, Episode and Attempt with expiry and release/revocation
semantics. Inventory, ATP, quote, cart and broker acknowledgement are rejected.

The deployed Worker remains version 2.5.0, version ID
`0a35e6f2-26ae-4cfa-8008-fc518307ac5b2`. The live route-proposal registry is
revision 9 with ten occurrence records and nine distinct proposal objects:

```text
eventSetRoot       sha256:dc84f47b5c8d0b11b2e3fea44c556732d9d00a0e1f8aed687fa02f1694d7d486
headEventHash      sha256:dc6c7871dfe45b5ce4fa9c3285134a777df6b20eec168ad7ef2f0c4672b42cd2
headHash           sha256:5a8c60f240bf88c1de1fd43e37d5544c2424847843a909d7ae65ee005be51e01
Outcome head       sha256:401c3744bd5b836dfa3c08f98e43089a6b6b4d3b9bf28655ac9d5b90031a215a
route/capacity/authority/truth/COMMIT  false/false/NONE/false/false
```

The new generic source occurrence is not appended merely because transport
succeeded. A source-bound normalized route-evidence object must first exist;
registry counting and route admission remain separate.

### Current product position and next production gate

```text
Outcome specification                    frozen and replayable
seller-neutral production Edge transport live with one real occurrence
Adafruit exact product                    proven
Adafruit displayed complete total         unproven
Adafruit structured ETA                   unproven
Target exact product                       proven
Target structured ETA                      proven
Target complete all-in                     unproven
primary / recovery owner capacity          unreserved / unreserved
payment / order / delivery                  not performed
independent acceptance                      absent
temporary supply network                    candidates observed, not formed
user Outcome / COMMIT                       absent / false
```

The next production action is a source-native prepayment summary or equivalent
destination quote that displays the final all-in amount and structured ETA,
followed by a resource-owner one-use reservation with an expiring lifecycle.
The same conjunction must be established in an independent failure domain for
recovery. Only after those facts close should the user be asked for a payment
mandate; order placement remains a separate single-write transition, and
delivery still requires independent physical acceptance evidence. No employee
outreach or operations queue is introduced.

Key v26 implementation artifacts are:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/outsider-user-held-read-only-route-observation-executor-v1.js` | 26,023 | `4db1c1b4e5c3ab82ebcc1e27294abf5661051fe9c2350061ac31992870bfcf31` |
| `src/outsider-user-held-route-observation-attempt-v1.js` | 6,696 | `9f4d033a86116c58397834ede1e2e68a9274eacc95463998e06d007736af393a` |
| `scripts/outsider-user-held-one-use-read-only-production-v1.mjs` | 12,047 | `ddff5dea85d10417ac852a6d5a6405adedfb39d45c1260552f2a862b4ce36bfa` |
| `scripts/outsider-target-user-held-route-observation-production-v1.mjs` | 11,871 | `51d30ac86087b9dc3db4dccb909a50ffcee2ab29d378df734f1f35a7ac0e76c5` |
| `src/outsider-owner-lifecycle-capacity-admission-v1.js` | 12,141 | `79f7a8b2ad888cdf1d78048d8c9bd6a7016146395339f64b383113842043a8e4` |
| `scripts/outsider-target-v2-buyer-native-recovery-bridge-v1.mjs` | 10,788 | `af9b34b1980dcdff437b58ca5890f56354f34d9a25a32df8eef8ab719cc1eff1` |
