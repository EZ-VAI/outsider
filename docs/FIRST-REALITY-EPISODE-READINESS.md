# First Reality Episode Readiness

Status: engineering program and non-authoritative partner-intake scaffold.

This document defines the engineering objective before Outsider receives a
prospective physical-device stream or a larger body of prospective remote-action
data. It does not authorize an action, certify a device, establish an independent
organization, create a causal experience unit (CEU), price risk, issue coverage,
or close a consequence obligation.

## Objective

The target is not another locally complete Stage. It is this property:

> When the first real remote action or physical execution arrives, Outsider can
> preserve it without changing the core ontology after the fact, losing an
> attempted-run denominator, inventing a missing measurement, or promoting a
> producer assertion into an independent outcome.

The canonical North Star remains Claim / Way / World / Experience. A remote API
operation, a robot action and a coding-agent tool call should normalize through
the same execution-trace clearing object while retaining profile-specific facts.
Measurement generalizes; a judgement from one World does not.

For `REMOTE_ACTION`, the only declared ingress is an immutable raw-source
reference opened by an adapter registered with `registerAdapter`, followed by
`normalizeExecution`. A worksheet must not mimic the argument object accepted by
`makeExecutionTrace`; that constructor is an adapter implementation detail, not
a partner or evidence ingress.

“First Reality Episode” is the name of this readiness program. It is not a new
protocol schema. The partner kit under `examples/first-reality-episode/` is a
non-protocol worksheet that points to existing constructors and schemas.

## Permanent semantic rules

1. **`null` means absent.** No source value or admissible measurement has been
   supplied. It is not zero, false, success or failure.
2. **`UNKNOWN` means unresolved.** The question is represented, but the available
   evidence cannot decide it.
3. **`HOLD_*` is a disposition.** A required fact is absent, stale, unverified or
   outside local authority, so promotion stops.
4. **Raw data stays out of partner projections.** Raw logs, images, video, joint
   streams, prompts, credentials and response bodies remain in an access-governed
   source store. Protocol artifacts carry immutable object references, byte
   lengths and domain-separated commitments after those facts are known.
5. **No retroactive completion.** Claim, Way, World, cohort slot, outcome rule,
   stopping rule, monitoring regime and Stewardship inputs must be frozen before
   the first action when the prospective design requires them.
6. **No self-issued independence.** A distinct key, process, model or JSON label
   does not establish organizational independence, owner adoption, standing or
   adjudication authority.
7. **No silent denominator loss.** Refused, never-started, timed-out, aborted,
   intervened, handed-off, missing-outcome, reverted and reopened attempts remain
   represented.
8. **Source class is preserved.** Retrospective physical data remains empirical
   retrospective evidence; simulation remains simulation. Neither becomes a
   prospective causal result through replay.

## Existing primitives to reuse

| Need | Existing primitive | Present ceiling |
|---|---|---|
| Universal machine trace ingress | `registerAdapter` → `normalizeExecution` in `src/outsider-execution-trace.js`; an adapter may internally use `makeExecutionTrace` | Source-normalized measurement object; no institutional authority |
| Physical platform parameters | `createDevicePlatformParameterManifest` in `src/outsider-device-stream-physics-frontier.js` | Local dimensional/geometric declaration; `physicsTruthExternallyVerified:false` |
| Immutable physical replay | `DeviceStreamAdapterRegistry.replay` and the DROID replay path | Source and conformance replay; no prospective or independent outcome claim |
| Stage 0.5 evidence | `src/outsider-stage05-evidence.js` | Locally source-replayed MEASURE evidence |
| ATTEST lifecycle | `src/outsider-stage1-lifecycle-frontier.js` | Integrity and lifecycle interface; no external trust institution |
| Reality boundary and claim | `createRealityBoundary` and `createStewardshipClaim` | Self-checking advisory artifacts |
| Source-bound Stewardship join | `src/outsider-reality-stewardship-integration.js` | Permanent no-authority advisory envelope |
| Prospective protocol conformance | `src/outsider-prospective-physical-simulation.js` | Synthetic protocol test; zero real executions and zero CEUs |
| Physical action envelope | `src/outsider-physical-delegation.js` | Closed action/safety/retry boundary; no device authority |
| Calibrated telemetry assessment | `src/outsider-physical-telemetry.js` | Missing measurements remain `UNKNOWN`; no host/device I/O |
| Retrospective real-robot ingress | `src/outsider-real-robot-ingress.js` | Exact BridgeData byte replay; target outcomes remain zero |
| Public simulator ingress | `src/outsider-libero-ingress.js` | Exact LIBERO task/state denominator; every task remains `NOT_RUN` |
| Synthetic physical fault lanes | `src/outsider-physical-simulation-phase2.js` and `src/outsider-physical-simulation-phase3.js` | Protocol/census conformance only; no real rates or safety claim |
| Public evidence policy | `src/outsider-public-reality-evidence.js` | Source/claim-role registry; no outcome or pricing promotion |
| Local attempt census | `src/outsider-run-census.js` joined by `RunStore` and Stage 0.5 sealing | Durable accounting from structurally valid intake to open/exact terminal state; no external authority |
| Network prospective-census producer | `src/outsider-prospective-episode-census.js` | Source-replayed C/W/W, cohort/slot and plan commitments; local ordering only, actor null, HOLD/CEU=0 |

The current main line includes the append-only local census in
`src/outsider-run-census.js`. `RunStore` now registers intake before preflight,
binds the frozen contract, retains open or terminal rows, and Stage 0.5 sealing
settles the exact terminal class. This is local tamper-evident coordination, not
same-UID adversary resistance or external authority. It is **not** yet joined to
a remote/physical episode adapter or an external outcome verifier. A reserved
`attemptCensusSlotCommitmentHash` must remain `null` until an implemented
episode path projects a real pre-action registration and contract binding.

## Implemented checkpoint — 2026-08-27

- The recovered physical leaf modules, read-only ingress CLIs, synthetic
  Phase 2/3 lanes, public evidence policy and local research census were
  promoted into the maintained tree without replacing current Stage 0.5 or
  `outsider-kernel-store.js` wholesale.
- BridgeData and LIBERO official pinned bytes replay through the maintained
  modules; these establish source identity and source-scoped physical/simulator
  facts, not a target execution or owner-adopted outcome.
- `RunStore` now creates or accepts an immutable census intake before preflight,
  binds the frozen contract, persists `outsider/kernel-run/v3`, rejects census
  tamper on recovery, and settles the sealed Stage 0.5 terminal class without
  converting `VERIFIED_DELIVERY_UNATTRIBUTED` into `SAFE`.
- `src/outsider-first-reality-episode.js` provides closed `REMOTE_ACTION` and
  `PHYSICAL_ACTION` planning/verification/preflight. Both profiles remain
  `WAITING_FOR_EXTERNAL_EVIDENCE`, CEU=0 and no-authority. Its declarative join
  names the existing physical delegation envelope, primitive attempt, calibrated
  telemetry, monitoring, Stewardship, ATTEST/CURATE, delayed-obligation and
  Stage 2 pre-action surfaces; it does not implement another parser or verifier.
- The old recovered Phase 3 private state root/report is unavailable. No
  Physical Reality Ledger is presented as recovered; the honest state is
  `BLOCKED_MISSING_PHASE3_PRIVATE_REPLAY`. A future rerun must be identified as
  a new execution.

## Engineering program

### P0 — one canonical physical path

- Review recovered or experimental physical modules before importing them.
- Retain one canonical adapter, manifest and replay path in the maintained tree.
- Mark an unavailable private source as unavailable; do not reconstruct it from
  a projection or let a recovery directory grow into a second architecture.

### P1 — freeze the episode boundary

Freeze the smallest set of facts that cannot safely be supplied after action:

- exact Claim, Way, World, cohort and intended attempt;
- operator/provider/device or remote-principal identity commitments;
- model, policy, monitor, instrument and adapter versions;
- monitor disclosure, agent knowledge of monitoring and trace visibility;
- source clock, uncertainty, units, coordinate frames and calibration roots;
- action/request, acknowledgement, observation and external-effect commitments;
- missingness, refusal, timeout, intervention, abort, takeover and recovery;
- owner, affected parties, rights, retention and responsibility roots; and
- immediate, delayed, recovery and reopening consequence horizons.

Use two profiles over the shared core:

- `REMOTE_ACTION` begins from an immutable raw-source object reference plus an
  adapter name hint and descriptor/implementation/source-schema commitments.
  The adapter must be registered before `normalizeExecution` is called. It then
  retains provider-native action identity, idempotency, authenticated principal,
  server acknowledgement, before/after state and rollback/reversal evidence.
- `PHYSICAL_ACTION` retains joint/pose semantics, units, coordinate frames,
  timing, sensors, calibration, force/energy observations, intervention and
  emergency-stop evidence.

The `PHYSICAL_ACTION` adapter join binds, by name and existing schema only:

- `DeviceStreamAdapterRegistry.register` and `.replay`, including the existing
  descriptor, immutable-source, platform-manifest and adapter-output schemas and
  the fixed adapter-output schema hash;
- `createPhysicalDelegationEnvelope` and `createPrimitiveAttempt` from
  `src/outsider-physical-delegation.js`;
- `createPhysicalTelemetryAssessment` from
  `src/outsider-physical-telemetry.js`;
- the frozen monitor-regime slots;
- Reality Stewardship owner/affected-party, experience-rights, cumulative-budget,
  recovery and responsibility artifacts;
- Stage 1 source replay/lifecycle and Stage 1.5 CURATE clearance/learning decision;
- `createConsequenceReport`, `createStewardshipChallenge` and
  `buildConsequenceState` for delayed and reopened obligations; and
- the existing Stage 2 pre-action factor policy and non-binding frontier.

These are required future promotion joins, not artifacts emitted or accepted by
the readiness plan itself. Their hashes remain absent, every authority bit is
false, CEU remains zero and promotion remains `WAITING_FOR_EXTERNAL_EVIDENCE`.

An absent independent result stays `null` with an `UNKNOWN` classification. A
source-native reward, executor success bit or server acknowledgement is not an
independent consequence.

### P2 — make Stage 0.5 a stable sensor

Prioritize adapter conformance, complete capture, seal/export/replay,
missingness, crash recovery and privacy boundaries. Ordinary new heuristics,
additional LLM judges and provider-specific presentation surfaces are secondary
unless they close an observed reliability or compatibility gap. Stage 0.5 is
the Experience sensor, not the final product boundary.

### P3 — operate three data lanes

1. **Prospective `REMOTE_ACTION`.** Use controlled test tenants or other
   owner-scoped remote Worlds to exercise real external state, acknowledgements,
   reversals, delayed outcomes and full-attempt accounting. Real execution does
   not by itself establish independent outcome, CEU or authority.
2. **Retrospective physical/source data.** DROID and BridgeData may test physical
   parsing and provenance; LIBERO must retain its own source/simulation class.
   All retrospective rows are descriptive and fixed at `causalExperienceUnits:0`.
3. **Synthetic fault injection.** Exercise clock drift, missing sensors,
   duplicate frames, coordinate mistakes, intervention, emergency stop,
   recovery and reopening. This lane proves protocol behavior only and is fixed
   at `causalExperienceUnits:0`.

No cross-lane model is permitted to erase the source-class boundary.

### P4 — join preregistration, census, outcome and Stewardship

Before a qualifying prospective action, bind:

- the attempt slot and inclusion rule;
- the primary outcome and missing-outcome treatment;
- the stopping, censoring and delayed-observation rules;
- resource owner, affected parties and responsibility continuity;
- non-compensable constraints and cumulative reality reservations; and
- recovery, challenge and reopening paths.

The hash-only network census projection now exists, but a real adapter-owned
pre-action slot, its crosswalk to the local run-census registration, and the
cross-protocol promotion verifier remain engineering blockers. Until they exist,
the partner template is preparatory input only, `ledgerClosed:false` is the
only honest interpretation, and no collection may claim denominator
completeness from the template or from an unrelated ledger.

### P5 — freeze the Stage 2 data contract, not a robot price

Preserve exposure units and windows, zero-loss windows, event/loss/claim
identity, pre-action factor receipts, occurrence/report/adjudication/recovery
clocks, censoring, dependence roots, temporal/operator/customer holdouts and the
target monitoring regime. Keep monitored-regime observations separate from the
target deployment estimand.

Until prospective target evidence and independent economic outcomes exist:

```text
targetTechnicalPremium = null
targetQuotedPrice      = null
pricePermission        = false
targetPriceState       = NULL_NOT_ZERO
```

### P6 — maintain Stage 3/4 interfaces without simulated authority

Keep provider-adapter contracts, one-use capability invariants, bypass tests,
payment/recovery separation and reopening semantics. Do not add another local
issuer, custodian, reserve, adjudicator or payment simulation and present it as
external readiness. Every real authority transition remains `HOLD_*` until a
named institution and source-specific verifier exist.

## First-source acceptance gates

A first partner source is ready for bounded ingestion only when:

1. a new adapter/profile can be added without changing Claim / Way / World /
   Experience semantics; a remote source enters only through
   `registerAdapter` → `normalizeExecution`, never through a worksheet-shaped
   `makeExecutionTrace` argument;
2. exact raw source objects can be reopened outside the public projection;
3. scheduled attempts cannot disappear from the denominator;
4. clocks, units, coordinate frames, calibration and missingness are explicit;
5. outcome independence is evidenced or explicitly unresolved;
6. owner, affected-party and cumulative-budget inputs are bound before action;
7. a successful immediate result cannot close delayed consequences or recovery;
8. Stage 2 numeric outputs remain `null` when target inputs are missing; and
9. all local signatures and replays retain `authority:none`.

Failure of any applicable gate produces `HOLD_*`; it does not invite a default,
imputation or narrative override.

## Minimal partner kit

See `examples/first-reality-episode/README.md`. The files are deliberately
incomplete and fail-closed. They contain semantic slots and projection targets,
not an ingestion schema, a signed preregistration, a closed census ledger or an
executable capability. In particular, the remote example contains only a raw
source reference and adapter hint/commitment slots; it is not trace-builder input.
The physical episode join template likewise contains only out-of-band artifact
slots for the existing device replay, delegation, attempt and telemetry records;
it is not constructor input.
