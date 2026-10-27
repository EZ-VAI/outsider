# Outsider Formation Job Worker — three-layer HTTP API + v1 executor seam

This Worker is the production seam between an already compiled outcome order
and a deterministic, version-pinned executor. It is not a model endpoint and it
does not accept natural-language instructions, arbitrary URLs, credentials, or
payment material.

## Routes

- `GET /healthz` — executor readiness and zero-human hot-path boundary. This
  does not claim Outcome COMMIT readiness.
- `GET /v1/outcomes/capabilities` — public, machine-readable agent-neutral
  three-layer manifest.
- `POST /v1/outcomes/prepare` — Outcome-API-authenticated, stateless Outcome OS reference
  projection. It accepts only content hashes, deadlines, and typed graph refs;
  natural-language goals remain at the client/compiler node.
- `POST /v1/outcome-os-lifecycles` — Outcome-API-authenticated append-only lifecycle
  genesis for one hash-only Outcome OS contract.
- `GET /v1/outcome-os-lifecycles/{contractId}` — replay-verified durable head
  and latest receipt without projecting raw events.
- `POST /v1/outcome-os-lifecycles/{contractId}/events` — compare-and-append one
  exact lifecycle successor. A new operation requires the current head hash;
  an identical idempotency-key replay returns the original receipt.
- `GET /v1/outcome-os-lifecycles/{contractId}/replay` — replay every persisted
  event and return the verification projection, not the raw history.
- `POST /v1/outcomes/{contractId}/route-proposals` — append one agent-neutral,
  hash-only proposal occurrence to the exact Outcome contract. It requires the
  current registry head and an idempotency hash; a proposal is not selection,
  execution, capacity, authority, or Outcome truth.
- `GET /v1/outcomes/{contractId}/route-proposals` — replay-verified proposal
  registry head and occurrence counts without projecting its raw events.
- `POST /v1/recovery-options/prepare` — Outcome-API-authenticated, stateless primary,
  recovery, and witness option-portfolio projection. Caller hash references are
  reported as declared coverage only; they never establish option readiness or
  permit Layer-2 promotion.
- `POST /v1/recovery-option-portfolios/prepare` — Outcome-API-authenticated,
  stateless typed Layer-2 portfolio preparation. It requires one primary and at
  least one recovery reference, explicit recovery mechanism, latest-safe
  exercise time, exercise/cancellation references, single-writer
  primary-XOR-recovery semantics, and typed failure-domain references. This
  structure does not prove external capacity or a held option.
- `POST /v1/standard-bindings/create` — Outcome-API-authenticated, stateless,
  version-pinned hash binding between one canonical Outcome/lifecycle and a
  UCP, AP2, or A2A source report. It neither implements those standards nor
  treats their status, mandate, acknowledgement, or receipt as Outcome truth,
  authority, capacity, or `COMMIT`.
- `POST /v1/commit-readiness/evaluate` — Outcome-API-authenticated, hash-only readiness
  classification. This endpoint cannot issue `COMMIT`; complete caller-supplied
  reference slots still require source replay and external verification.
- `GET /v1/outcomes/{jobKey}/status` — formation-dispatch-authenticated
  three-layer status view of
  a legacy formation job. A machine executor receipt remains an execution
  receipt, not Outcome truth.
- `POST /v1/formation-jobs` — formation-dispatch-authenticated, hash-only
  compiled job.
- `GET /v1/formation-jobs/{jobKey}` — formation-dispatch-authenticated durable state or the
  exact completed machine receipt.
- `POST /v1/client-executions` — formation-dispatch-authenticated publication
  of one user-held, hash-only execution job. The request must include the
  order-scoped HMAC binding projection and the exact executor capability hash;
  private parameters and their unkeyed hashes are not accepted.
- `POST /v1/client-execution-claims` — atomically claims one published job for
  its pre-bound user-held executor. This route requires that order's executor
  bearer, not the Formation dispatch bearer. Only the first claim returns an
  invocation.
- `POST /v1/client-executions/{jobKey}/receipt` — records the executor's keyed,
  hash-only result using the same order-scoped executor bearer. This
  self-report is never independent Outcome truth.
- `GET /v1/client-executions/{jobKey}` — reads the durable
  `PUBLISHED → CLAIMED → COMPLETE` or
  `PUBLISHED → CLAIMED → EXPIRED_HOLD → COMPLETE` projection. A claimed job
  without a receipt is conservatively reported as effect-unknown and is never
  retried or reassigned automatically; expiry requires a successor job with a
  new Attempt.

The five preparation/evaluation/binding endpoints are deliberately stateless and have
no external effect. Every response fixes `authorityMinted=false` and
`outcomePromiseIssued=false`. They accept no prompt, prose instructions,
arbitrary URL, personal data, credential, or payment material. The full
Outcome definition is compiled locally and only its bounded references cross
this HTTP boundary, so Codex, Gemini, Claude, deterministic clients, and
resource-owner nodes use the same protocol.

The Outcome OS lifecycle routes use a separate SQLite Durable Object binding,
`OUTCOME_OS_LIFECYCLES`, with one object per opaque `contractId`. Revision 0 and
every successor are canonical, immutable rows. Successors bind the exact prior
event as both predecessor and superseded head; supersession changes the current
head without deleting history. The `v2` Worker migration adds
`OutcomeOsLifecycleLedger` without modifying the existing
`FormationJobLedger` namespace or table.

Route proposals use another SQLite Durable Object binding,
`OUTCOME_ROUTE_PROPOSALS`, with one object per Outcome `contractId`. The `v3`
migration adds `OutcomeRouteProposalLedger` as an append-only descendant; it
does not modify either prior Durable Object class or table. Before every
proposal append or read, this object obtains the full lifecycle event chain
directly from the internal `OUTCOME_OS_LIFECYCLES` object and source-replays
it. Raw lifecycle and proposal events remain internal: public responses expose
only replay heads, counts, and the append receipt, with
`rawEventsProjected=false`.

The proposal request contains exactly `schema`, `recordedAt`,
`idempotencyKeyHash`, `expectedRegistryHeadHash`, `routeProposalRefHash`, and
`occurrenceRefHash`. Agent/client brand or identity, provider name or URL,
personal data, credentials, and payment material are rejected before durable
write. Distinct occurrences may reference the same proposal object so multiple
agents are not collapsed by object deduplication; an occurrence itself can be
recorded only once.

Lifecycle events are limited to contract creation/opening, hash-only Attempt
evidence references, caller-reported observed closure, expiry, and versioned
contract supersession. None establishes independent Outcome truth, authority,
recovery capacity, guarantee, COMMIT, payment, or execution permission. Invalid
or stale CAS requests are not persisted, and raw personal fields are rejected
by the exact event schemas.

The product layers are:

1. **Outcome OS** — route-free goal/acceptance/deadline/loss references.
2. **Formation + recovery options** — a typed portfolio that truthfully reports
   declared primary, recovery, and independent-witness references. External
   source replay must establish authority and current capacity before this
   becomes an attained product profile.
3. **Outcome COMMIT** — a negative/blocker classifier at this HTTP seam. Positive
   issuance remains owned by the source-replayed authority, reservation,
   witness, obligation, capital/custody, adjudication, trust, and execution
   admission runtime.

The v2.5 API retains the v2.4 typed Layer-2 endpoint as a strict descendant of the original
`/v1/recovery-options/prepare` compatibility route; the original route remains
available unchanged. The typed portfolio compares declared failure-domain
reference sets and reports `PROVEN_DISTINCT`, `KNOWN_SHARED`, or `UNKNOWN`. Even
`PROVEN_DISTINCT` means only that the typed reference sets are disjoint and
have evidence references. External source replay must still prove that the
primary is executable, the recovery option is held, exercise authority is
current, and the option remains exercisable before the latest-safe time.

The v2.5 API retains the v2.4 standard-binding endpoint, which accepts only an exact standard name,
standard version, specification revision hash, source-payload hash, canonical
Outsider Outcome artifact hash, lifecycle-head hash, and binding kind. Its
deterministic structural receipt is content-addressed but is not a
cryptographic signature. Floating versions, unknown standards, raw protocol
payloads, URLs, personal data, credentials, and payment material fail closed.
UCP, AP2, and A2A remain compatibility-only transport/source-report inputs;
their native state machines and trust decisions stay with their owners.

One SQLite Durable Object is addressed by `sha256(orderId + planHash)`. It
claims before invoking an executor, returns `RUNNING_HOLD` to concurrent calls,
and replays the same completed receipt forever. If execution is interrupted,
the receipt is `HOLD / EXECUTION_INTERRUPTED_EFFECT_UNKNOWN / DO_NOT_RETRY`.
There is no staff queue.

The same job-keyed Durable Object now holds a separate v1 table for user-held
execution. Publication stores only the public formation job, its order-scoped
HMAC binding projection, and its pre-bound executor capability hash. It never
stores the HMAC key, private parameter bytes, unkeyed private plan/parameter
hashes, or provider exchange bytes. The first successful claim is a synchronous
SQLite compare-and-set. Once claimed, later claims return `HOLD` without an
invocation—even after a Worker restart—until the exact receipt is durably
recorded. An expired lease becomes durable `EXPIRED_HOLD`; it does not recycle
the invocation, though a late hash-only receipt may still close the evidence
record. This deliberately prefers a visible effect-unknown state over a
duplicate request to a seller. The same job key cannot enter both the legacy
push-executor path and the user-held pull-executor path.

## Executor binding

The checked-in configuration binds the private
`outsider-cloudflare-sparkfun-executor-v1` service. The exact allowlist remains a
Worker secret rather than source configuration. A service binding by itself is
not execution readiness: if the allowlist is empty, the plan triple is unknown,
or the executor's private envelope is absent, `productionExecutionReady` remains
`false` and dispatch fails closed.

To admit a real plan, bind `DETERMINISTIC_EXECUTOR` to a separately deployed
Cloudflare Worker service and store `FORMATION_EXECUTOR_ALLOWLIST_JSON` as a
Worker secret containing an array of exact triples:

```json
[
  {
    "adapterId": "merchant-buyer-native-v1",
    "adapterVersion": "1.0.0",
    "planHash": "sha256:..."
  }
]
```

The Worker has two deliberately non-interchangeable bearer credentials:

- `OUTCOME_OS_API_BEARER_TOKEN` authorizes only Outcome OS preparation and
  lifecycle, route-proposal append/read, recovery-option preparation, and
  typed recovery-portfolio preparation, compatibility-only standard binding,
  and COMMIT-readiness classification. It cannot dispatch or read legacy
  formation jobs.
- `FORMATION_DISPATCH_BEARER_TOKEN` authorizes only legacy formation dispatch,
  job reads, the legacy outcome-status alias, and user-held execution
  publish/read. It cannot claim an invocation, submit a user-held receipt, or
  call the Outcome OS or Layer-2/Layer-3 product API. Publication pre-binds an
  order-scoped executor capability hash. Claim and receipt routes require the
  corresponding per-order executor bearer, whose value is never stored by the
  Worker; neither credential can change the binding after publication.

Both are independent random Worker secrets, each 32–512 characters, configured
outside source with `wrangler secret put`. Never reuse one value for the other.
The public health route reports `outcomeApiAuthConfigured` and
`formationDispatchAuthConfigured` without exposing either credential.
`durableLifecycleAvailable` is true only when both the lifecycle Durable Object
binding and Outcome API authentication are configured; binding presence remains
separately visible as `durableLifecycleBindingAvailable`.

The health route also probes the bound executor's private-configuration
readiness; a service binding plus allowlist alone never reports production
execution ready.

The service binding receives canonical JSON at
`POST /v1/execute-frozen-plan` with `schema`, `job`, `jobHash`, and `jobKey`. It
must return exactly:

```json
{
  "state": "HOLD",
  "reasonCode": "CAPACITY_NOT_RESERVED",
  "resultHash": "sha256:...",
  "sourceOccurrenceHashes": ["sha256:..."],
  "externalEffect": "READ_ONLY",
  "retryDisposition": "DO_NOT_RETRY"
}
```

Accepted states are `COMPLETED`, `HOLD`, `UNAVAILABLE`, and
`RECOVERY_REQUIRED`. An executor response is an effect receipt, never
independent outcome truth and never new authority.

## Execution boundary

The checked-in service binding points at the separately deployed deterministic
executor. Production execution is still fail-closed unless an exact
`{adapterId, adapterVersion, planHash}` triple is allowlisted and that executor
reports its private configuration ready. The three-layer API never treats code
deployment, a binding, a caller declaration, or a merchant/server acknowledgement
as authority, capacity, independent outcome truth, or an Outcome promise.
