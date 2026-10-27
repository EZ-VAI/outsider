# Unified North Star: delegation radius without authority inflation

Outsider is not a Stage 0.5 monitor. Its unified objective is to expand the
radius over which people can safely delegate work to AI while never expanding
unproven authority, and while keeping evidence and responsibility at least as
wide as every enabled consequence.

The operative invariants are:

```text
C_enabled ⊆ A_proven
Reach_W(C_enabled) ⊆ E_committed
Reach_W(C_enabled) ⊆ R_committed
```

`C` is the capability/delegation surface actually reachable through every
enabled path. `A` is authority derived from a principal or resource owner with
standing and adopted by the real write path. `E` is the prospective evidence
coverage, including the full attempt denominator and missingness. `R` is the
durable responsibility coverage: affected parties, budgets, horizons,
recovery, challenge, reopen, and named responsibility roots.

These are typed sets and graphs, not scores. Physical actuation, file writes,
training, pricing, guarantees, funds movement, delegation, and obligation
closure cannot be traded against one another. A wider scope, longer validity,
new World, new consequence channel, or new affected party is a new expansion
request. A join never grants the expansion.

## Non-convertibility

- Evidence cannot mint authority.
- Authority cannot establish outcome truth.
- Technical capability is not permission.
- A passed test is quality evidence, not deployment authority.
- Price, guarantee, settlement, payment, and closure are separate authorities.
- Success, a signature, payment, or later evidence cannot retroactively widen
  the authority that existed before an action.
- Stage numbers never amplify any radius.

The effective action is the most conservative typed meet of the local
capability ceiling, the exact externally proven authority, and the action
surface whose consequence closure is covered by both evidence and durable
responsibility. Unknown or incomparable dimensions produce `HOLD`, not an
implicit empty risk.

## Agency identity and lineage

There is no natural, permanent AI "individual". An IP address is a network
observation, a computer is a host, and a base model is a reusable component.
None is the subject of a universal reputation account. Outsider instead uses a
typed actor graph:

```text
PrincipalEpoch
  -> DeploymentLineage
  -> exact DeploymentRevision / Way
  -> RuntimeInstance and optional EmbodimentRevision
  -> DelegationEdge
  -> Episode / Attempt
```

The immutable fact is recorded at the exact attempt. End-to-end reliability
may be projected only to the exact deployment revision, Claim family, World,
delegation radius, and observation window. Authorization, recovery, remedy,
and governance performance belong to the responsible principal epoch. Model,
controller, and device components receive only evidence that can be attributed
to that component. Attribution stops at the first unproved edge.

Two content addresses serve different purposes and must never be collapsed:

```text
accountableDeploymentSubjectHash = H(
  principalEpochProjection,
  deploymentLineageProjection,
  deploymentRevision,
  modelRoutePolicyAndProjection
)

attemptActorSubjectHash = H(
  accountableDeploymentSubjectHash,
  actualModelRoute,
  runtimeAndMemoryState,
  embodimentRevision,
  typedDelegationEdges,
  Claim × Way × World × episode × attempt × census × observedAt
)
```

The first is a stable, versioned responsibility account. The second identifies
the exact acting stack for one event. Neither is a global credit score. Facts
remain typed and contextual; there is no implicit inheritance between
principal, deployment, model, runtime, device, or attempt layers.

An exact deployment revision binds the model artifact or opaque model route,
controller and orchestration code, system policy, tool and capability surface,
memory policy and privacy-safe snapshot commitment, runtime environment, and,
for embodied systems, firmware, sensors, actuators, safety controller, and
calibration. A material change creates a new revision. A clone or fork creates
a new lineage edge and does not inherit earned positive history. A control or
owner transfer creates a new principal epoch. Key rotation preserves identity
only through an explicit continuity proof. A new identity with no lineage is
`UNPROVEN`, not zero-risk.

Fine-tuning cannot be inferred from behaviour. When available, a model/agent
bill of materials binds base weights, adapters or deltas, tokenizer,
quantization, trainer code and environment, training-run and dataset-manifest
commitments, and evaluation artifacts. When these facts are unavailable,
model lineage is `OPAQUE/UNKNOWN`: the attempt may still be attributed to a
proved deployment and principal, but model-level attribution and history
inheritance must abstain.

Identity assurance is a vector per edge, never a global `verified` boolean:

```text
CLAIMED -> SOURCE_REPLAYED -> CRYPTOGRAPHICALLY_BOUND
        -> RUNTIME_ATTESTED -> EXTERNALLY_ADOPTED
```

A signature proves control of a key, not legal identity, permission, safe
behaviour, or outcome truth. Identity evidence therefore cannot mint authority
or widen a delegation radius. Public views use domain-specific pseudonyms and
commitments; raw IP addresses, device serials, prompts, memories, training rows,
and personal identity mappings remain outside the public reputation layer.

Operational batch numbers are not identity or denominators. A comparable
cohort must be frozen prospectively:

```text
cohortHash = H(
  subjectType,
  exactDeploymentRevision,
  claimFamily,
  worldFamily,
  delegationAndEffectRadius,
  policyVersion,
  observationWindow,
  prospectiveCensusPrefix
)
```

A changed revision, World, radius, policy, or window starts a new cohort. Old
history may remain linked through the lineage graph, but is not pooled by
default. The public product must not collapse these typed records into a global
person, device, model, or agent score.

## Network-first engineering order: 0 through 8

Outsider does not compete with agent and robot vendors on their native safety
stack. A vendor may already provide excellent sandboxing, collision avoidance,
policy enforcement, E-stop, controller validation, or model guardrails. Those
controls and their native receipts are evidence inputs. Outsider's product is
the cross-provider identity, delegation, census, evidence, outcome,
responsibility, challenge, and typed-history network that remains meaningful
when the vendor, model, runtime, body, owner, or World changes.

The implementation order is therefore:

0. **Repair the evidence base before extending it.** Current code, source
   bytes, frozen artifacts, registries, and every transitive descendant must
   replay together. A hardening change creates a new versioned artifact chain;
   it never justifies overwriting history or silently keeping stale claims.
1. **Freeze the network individual and event unit.** The subject is the typed
   graph `PrincipalEpoch -> AccountableDeployment -> Runtime/Embodiment ->
   Delegation -> Episode -> Attempt`, not an IP address, host, base model, or
   global score. The atomic observation is a prospectively registered
   occurrence, including refusals, missingness, retries, and non-actions.
2. **Ship the Outsider Node SDK and conformance boundary.** A node maps its
   native identity, safety controls, delegation, census, command/effect,
   outcome, and obligation records into existing Outsider contracts. Passing
   conformance establishes compatibility only; vendor evidence never mints
   Outsider authority, independent outcome truth, or actor credit.
3. **Make the quarantine network platform the core product.** Keep occurrence
   census separate from object deduplication; add durable lifecycle,
   revocation, source-aware rights/privacy replay, independently anchored
   heads, replayable exports, and operator tooling before public promotion.
4. **Recruit anchor reporting nodes rather than maximize row count.** The
   highest-value nodes are agent runtimes, robot/embodiment platforms, resource
   owners with an actual write gate, and independent outcome/recovery
   witnesses. One well-joined node can be more valuable than millions of
   retrospective traces.
5. **Use the First Governed Reality Episode to certify the network path.** It is
   a low-impact, owner-scoped, reversible proof that identity, authority,
   census, actual effect, delayed outcome, recovery, challenge, and reopen join
   end to end. It is not an attempt to build a safer agent or robot than the
   vendor.
6. **Build the complete-episode data flywheel.** Acquisition is driven by the
   missing segment: pre-action delegation/census, command-to-effect trace, or
   independent longitudinal outcome/recovery. Source-native reward, vendor
   success, and pseudo-labels may rank review candidates but cannot fill an
   independent-outcome slot.
7. **Expose typed, contextual history products.** Queries and later credit
   projections remain scoped to the proved principal, deployment revision,
   Claim, World, radius, and observation window. There is no universal agent,
   model, device, or person score and no implicit inheritance across layers.
8. **Enter PRICE, GUARANTEE, and SETTLE only after the network facts exist.**
   Real target denominators, owner adoption, adjudicated severity, longitudinal
   recovery, issuer authority, capital/custody, appeals, and payment authority
   are prerequisites. Local schemas or simulations do not substitute for them.

Every step retains the same stop conditions: unknown identity limits
attribution; unknown authority produces `HOLD`; an unregistered opportunity is
not a denominator; an unobserved consequence is `UNKNOWN`; and an open duty
cannot disappear because a process, vendor, or episode ended.

Stage 0.5 measures execution. Stage 1 attests source-bound evidence. Stage 1.5
curates experience for one explicitly permitted use. Stage 2 estimates only
where its evidence contract permits. Stage 3 allocates capital or guarantee
authority only through a real issuer. Stage 4 handles claims, restoration,
challenge, and closure only through the proper custodians and adjudicators.
Reality Stewardship is the constitutional spine through all of them, not a
later Stage 5.

## Continuous data and training loop

Discovery is continuous; admission is not automatic:

```text
official discovery
  → immutable revision pin
  → quarantine
  → byte/provenance/denominator replay
  → rights, privacy, PII, and affected-party review
  → correlation-root and target holdout freeze
  → CURATE for one named use
  → governed training only on admitted rows
  → one-shot holdout evaluation
  → promote or reject
```

Public access and a license label do not settle upstream rights. Publisher or
LLM judge labels do not become independent outcomes. Simulation does not become
physical evidence. Retrospective data does not become a prospective census.
Training may expand model capability, but never authority or action readiness.

The receive-side platform is specified in
[`OUTSIDER-DATA-NETWORK.md`](./OUTSIDER-DATA-NETWORK.md). It accepts only three
quarantine lanes: pre-action delegation/responsibility, action/outcome, and the
prospective census. Actor identity is a cross-cutting binding, not a separate
score or lane. Network reservations and scientific cohort slots are two
different denominators, and content deduplication is never allowed to erase an
occurrence. The gap-driven loop may propose what evidence to seek next; it
cannot automatically train, promote, or widen an action radius.

## Current honest boundary

The repository now has the local radius algebra, fail-closed runtime
contraction, a source-replayed ActionAdmission HOLD request, a HOLD-only actor
identity envelope, and an append-only Reality obligation ledger. The identity
envelope binds the principal epoch, lineage projection, exact deployment and
model route, runtime and memory state, optional embodiment, typed delegation
edges, and observed attempt. It emits separate account and attempt subject
hashes, requires every active delegation radius to contain the attempt time,
and fixes a typed-facts/no-global-score policy. It still establishes no legal
identity, history inheritance, model attribution, authority, or action.

The obligation ledger precommits consequence channels, affected-party and
responsibility roots, budgets, recovery/challenge policy, and immediate plus
delayed horizon tuples. A delayed horizon cannot be reported before it is due;
a later fact atomically reopens even the fixture-only closed scenario; a crashed
writer's lock is never stolen by PID/mtime guesswork.

Two composition levels remain deliberately distinct. The older
ActionAdmission-to-obligation reference join proves only exact reference
integrity and remains `ok:false`/`HOLD` because caller-declared semantic sets are
not enough. The newer Reality semantic bundle source-replays the conservative
effect review, affected-party register, responsibility graph, semantic plan,
and production obligation revision zero; it binds exact channel rows and maps
each review horizon to the obligation's real horizon commitment. Its successful
verification means only that this local chain was deterministically rebuilt.
Provider applicability, effect closure, affected-party completeness, standing,
duty acceptance, external authority, admission, and action readiness all remain
false, with zero CEU.

External discovery now feeds this boundary through three non-authorizing lanes:

- `src/outsider-provider-pattern-registry.js` freezes clean-room review patterns
  from the ten reviewed companies plus MatrAIx. These patterns may add evidence,
  privacy, recovery, bystander, horizon, host-effect, and rollback requirements;
  they never establish that those requirements are covered.
- `src/outsider-reality-source-scout.js` freezes eleven official source
  locators for failure, recovery, incident, complaint, adverse-event, and
  authorization vocabulary. Mutable pages remain explicitly mutable, reporting
  and selection bias stays attached, and no record is admitted as causal truth.
- `src/outsider-matraix-persona-metadata.js` replays only a local
  maintainer-reviewed metadata manifest. It exposes schema topology,
  missingness, source composition, and calibration limitations for simulated
  coverage stress tests. It downloads no Persona rows, admits no training rows,
  and contributes no Reality census or CEU.

This is deliberate utilization, not mere bookmarking: every provider pattern
widens the conservative review checklist, and every official-source candidate
adds a potential observation or challenge channel. Until source bytes, rights,
privacy, denominator, standing, and the relevant external verifier are closed,
the new information can only create more `HOLD` reasons, never fewer.

The First Reality Episode artifacts therefore remain intake/conformance plans.
Positive action readiness still requires an external resource owner,
provider-specific authority verification, externally grounded completeness and
standing for the source-replayed affected-party/responsibility artifacts, duty
acceptance, and an adopted exclusive write path. Local hashes, fixtures,
self-keys, caller booleans, or complete rehashes cannot cross that boundary.
