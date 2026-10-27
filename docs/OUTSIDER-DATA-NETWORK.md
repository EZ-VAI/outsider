# Outsider Data Network: three lanes, two denominators, no automatic promotion

## Purpose

The network exists to widen Outsider's evidence and responsibility radius
without widening unproved authority. It is not a telemetry vacuum, a global AI
credit bureau, or an automatic training pipe. Its first implemented boundary is
a quarantine edge with structural privacy guards; it is not yet safe for public
deployment.

If Outsider could receive only three classes of data, they would be:

1. `DELEGATION_RESPONSIBILITY`: the pre-action mandate and obligation packet;
2. `ACTION_OUTCOME`: the exact action episode plus immediate and delayed
   observed consequences; and
3. `PROSPECTIVE_CENSUS`: the complete, prospectively frozen opportunity and
   attempt denominator.

Actor identity is a cross-cutting binding, not a fourth lane. An IP address,
host, transport key, model name, or base-model hash is not the credited actor.
Where an actor is already materialized, records bind hashes that a later
source-aware verifier must rederive from the ActorIdentityEnvelope account and
attempt subjects. Intake does not perform that replay. A transport signer only
proves possession of a network submission key and can never become the principal,
resource owner, agent identity, authority issuer, or outcome adjudicator.

## Lane contracts

### Delegation and responsibility

This lane records, before an action:

- Claim, Way, World, episode, attempt, and prospective census identity;
- accountable principal epoch and exact acting-stack identity;
- requested and enabled capability radius;
- externally sourced authority references, scope, purpose, validity, and
  revocation references;
- affected-party, consequence-channel, budget, monitoring, recovery,
  challenge, reopen, and immediate/delayed horizon commitments; and
- the owner-gate and actual-write-path slots.

Receiving the packet proves neither standing nor authority. A self-signed or
locally rehashed packet remains quarantined until a named source-specific
verifier and the actual resource-owner write gate replay it.

### Action and outcome

This lane records every refused, started, interrupted, failed, timed-out,
aborted, recovered, or completed action, including:

- the exact attempt actor, deployment revision, delegation edge, before state,
  command/action commitment, observations, interventions, and terminal state;
- source-native acknowledgments separately from independent outcome evidence;
- immediate and delayed consequence reports, missing observations, affected
  parties, recovery, challenge, and reopening; and
- a distinction between self-report, instrument observation, affected-party
  report, and independent adjudication.

A successful tool result, model self-critique, reviewer model, user click, or
server receipt does not by itself establish reality outcome, causality, or
closure.

### Prospective census

This lane begins before outcomes are known. It freezes:

- eligible population and exclusion rule;
- Claim/World/radius/policy/window profile;
- every scheduled opportunity and reserved slot;
- treatment or supervision assignment, when applicable;
- started, never-started, refused, rejected, cancelled, missing, failed,
  timed-out, retried, abandoned, and completed terminal states; and
- correlation roots and cohort lineage.

Payload deduplication must never delete occurrences from this denominator.
Unfilled and rejected slots are observations, not garbage.

## Two denominators

The platform keeps two append-only logical ledgers:

1. the **network intake denominator**, beginning when possession of a transport
   submission key is verified and a reservation occurrence is durably recorded;
   and
2. the **scientific attempt denominator**, beginning when a prospective cohort
   slot is registered before the action or outcome.

They are related but not interchangeable. A reservation can fail before it is a
scientific attempt; an offline scientific attempt can exist before upload. A
content-addressed object may be stored once and referenced by many occurrences.
The network reports both occurrence count and unique-object count.

Until an independently anchored head exists, the server's SQLite event chain is
described as logically append-only and tamper-evident, not as infrastructure
WORM.

## Quarantine ingress

The initial network enforces an exact version allowlist for every lane. The
delegation and census lanes currently admit one schema each; the action/outcome
lane admits its original immediate projection plus one append-only delayed
witness successor:

- `outsider/network-delegation-responsibility-projection/v1`;
- `outsider/network-action-outcome-projection/v1`;
- `outsider/network-action-outcome-projection/v2`; and
- `outsider/network-prospective-census-projection/v1`.

Accepted payloads contain only fixed schema/state literals, content hashes,
nullable hash references, and literal `false` boundary facts. Free text,
arrays, counters, URLs, media, prompts, transcripts, source code, command
output, credentials, direct identifiers, and caller-positive authority,
causality, closure, or census claims are not schema fields. The generic
canonical transport ceiling remains 2 MiB, but these projections are
deliberately small. Raw evidence remains in access-governed source storage and
is joined later by content hash.

The exact v1 projections are:

- `DELEGATION_RESPONSIBILITY`: the accountable-deployment subject, delegation
  envelope, C/A/E/R radii, responsibility commitment, optional owner-gate
  conformance commitment, and two fixed-false authority/coverage facts. The
  accountable-deployment hash must equal the manifest subject; the same
  responsibility account may be referenced by more than one attempt, but a
  payload cannot be replayed under another account.
- `ACTION_OUTCOME`: the manifest attempt hash, execution/outcome/obligation and
  source-artifact commitments, an optional source-replay reference, and three
  fixed-false outcome/causality/closure facts. Its attempt hash must equal the
  manifest subject.
- `PROSPECTIVE_CENSUS`: cohort and slot commitments, eligibility, assignment,
  instrument and pre-action-registration commitments, an optional external
  anchor, and two fixed-false prospectivity/completeness facts. Its cohort and
  slot hashes must equal the manifest subject.

`ACTION_OUTCOME/v2` does not replace or rewrite v1 and does not create a fourth
lane. It is a later occurrence that binds the original v1 manifest, submission
bundle and occurrence, the same attempt and execution evidence, a second
source-replayed witness identity, a delayed observation horizon, affected-party
and consequence commitments, and a later immutable obligation prefix. Missing,
refused, unavailable and censored observations remain explicit terminal
states. An `OBSERVED` record still does not establish organizational
independence, causality, closure or outcome truth: the current witness adapter
replays a restricted declarative projection specification but not its code
closure, the relationship-review source is not byte-replayed, and the current
fixture leaves consequence channels outside the declared Reality boundary.
The resulting Stage 5 certificate is therefore
`PARTIAL_WITNESS_PATH_REPLAYED_HOLD`, with path-complete, authority, action,
training, CEU, pricing, guarantee and settlement fields fixed false or zero.

`src/outsider-prospective-episode-census.js` is the first source-replayed
producer for the census lane. It freezes exact Claim x Way x World, cohort and
slot, the local pre-action window, and the eligibility, assignment, instrument,
outcome, stopping, monitoring and Stewardship plans before producing the
hash-only network projection. A canonical local timestamp order is not an
external timestamp attestation: the producer and network receipt both remain
`HOLD`, the actor fields remain null until a later exact episode binding, and
prospectivity/completeness stay false at the network edge.

This closes the generic-payload blocker. It does not establish that transport
metadata, opaque referenced source material, or the upstream source contains
no PII. Source-aware privacy and rights replay is still required before any
promotion, and the server therefore continues to report
`noPiiGuaranteed:false` and `publicDeploymentReady:false`.

The protocol separates:

```text
authenticated reservation occurrence
  -> immutable occurrence/event row
  -> canonical payload verification
  -> content-addressed object (deduplicated)
  -> signed QUARANTINED receipt
```

The same transport signer and client-submission id with the same manifest
returns the same reservation. The same pair with a different manifest is a
conflict. Two
different reservations containing the same object add two occurrences and one
unique object. Authenticated rejection, expiry, and purge append terminal
events; malformed traffic that has not proved possession cannot cancel another
party's reservation and instead leaves it to expire. Retention purge removes
uniquely referenced projection bytes and designated redundant index copies,
not the immutable hash-bound challenge, reservation, receipt, revocation,
acknowledgment, event, denominator, or tombstone history. Signed network
revocation is now connected for one deliberately narrow case: the transport
key that signed an exact reservation may withdraw that exact submission. It
does not revoke the actor, principal, robot, delegation, authority, evidence,
or responsibility account. A revoked occurrence is hidden from projection
export and cannot settle later, while its historical occurrence and denominator
remain. Shared content-addressed payload is removed only after the last live
reference is gone.

Every accepted record remains:

```text
disposition = QUARANTINED
automaticTraining = false
permitsCuratePromotion = false
authority = NONE
actionReady = false
executable = false
causalExperienceUnits = 0
```

The ingress never dereferences contributor URLs and never imports a trainer,
ActionAdmission executor, actuator, payment rail, or model runtime.

Current public-deployment blockers are source-aware actor/rights/privacy replay
before promotion, an independently anchored lifecycle-event head, and an
explicit legal/privacy policy for immutable linkable audit metadata that may
outlive projection-payload retention. The current gateway therefore still
reports `noPiiGuaranteed:false` and `publicDeploymentReady:false`.

The local checkpoint slice closes only the preparation step for the event-head
blocker. It replays an unfiltered, same-snapshot export from ordinal 1 through
the reported tail, verifies the pagination and lifecycle hash chain, and emits
a digest-only checkpoint plus outbox request. The outbox contains no event or
object payload. It has not been submitted to a provider and has no provider
receipt, external timestamp, anti-equivocation witness, WORM property or
non-omission proof. Those facts remain fixed false until a separate externally
trusted submission and verification slice exists.

## Outsider Node SDK conformance

`src/outsider-network-node-sdk.js` is the first vendor/node integration
boundary. It does not ask an agent or robot company to replace its native
sandbox, policy engine, controller, collision avoidance, E-stop, or safety
case. A node instead maps references from those systems into the existing
Outsider network contracts.

Every Node SDK source replays one existing Network Intake manifest and its
exact lane payload, then declares exactly one row for each adapter class:

- actor identity;
- delegation and responsibility;
- prospective census;
- command-to-effect evidence;
- outcome and recovery; and
- obligation lifecycle.

A row is either an unverified declared adapter, explicitly unavailable, or
explicitly not applicable to that lane. A required lane adapter cannot be
hidden as not applicable. Vendor-native safety-control references are carried
only as `VENDOR_NATIVE_SAFETY_EVIDENCE_REFERENCE_ONLY`; their presence does not
establish effectiveness, independent outcome truth, Outsider authority, or
complete episode coverage.

A successful conformance verification means only that the node produced a
source-replayed, typed-subject-preserving quarantine projection. The result is
still `HOLD`, with zero training rows and CEU, and with action, pricing,
guarantee, and settlement disabled. Functional adapter testing, source-aware
rights/privacy review, owner adoption, independent outcomes, and longitudinal
responsibility remain separate gates.

## Gap-driven data engine

Mingfu Liang et al.'s CVPR 2024 paper,
[AIDE: An Automatic Data Engine for Object Detection in Autonomous Driving](https://arxiv.org/html/2403.17373),
uses the loop `Issue Finder -> Data Feeder -> Model Updater -> Verification`.
The official [CVPR record](https://openaccess.thecvf.com/content/CVPR2024/html/Liang_AIDE_An_Automatic_Data_Engine_for_Object_Detection_in_Autonomous_CVPR_2024_paper.html)
describes an offline open-world object-detection experiment, not an agent
governance or real-action evidence system.

Outsider reuses only the gap-driven scheduling pattern:

```text
Census Commit
  -> Quarantine Ingest
  -> Gap Finder
  -> Evidence Feeder
  -> Independent Adjudication
  -> Candidate Update
  -> Frozen Prospective Verification
```

An LLM-generated scenario is a retrieval query, not a real scenario. A VLM or
model label is a candidate, not ground truth. Retrieval begins from a frozen
candidate pool and records selection probabilities so that the feeder cannot
silently turn easy-to-find examples into a risk rate. Training, tuning, and
prospective validation cohorts are disjoint; once a failed validation example
is used for training, a new frozen cohort is required.

AIDE's paper explicitly lists VLM/LLM hallucination as a limitation. Its
reported verification diversity is distinct retrieved images, not field
coverage, causality, delegation authority, or independent adjudication. No
official implementation repository is linked from the paper's official CVPR
record, so Outsider does not import or claim a license for AIDE code.

## Promotion boundary

Quarantine reception may create a data-gap hypothesis. Only a separate,
source-aware CURATE process can establish a narrow permitted use after byte,
provenance, denominator, rights, privacy, PII, correlation, and target-leakage
review. Training eligibility and delegation eligibility are different state
machines: neither inherits from the other.

The North Star remains:

```text
C_enabled is a subset of A_proven
Reach_W(C_enabled) is a subset of E_committed
Reach_W(C_enabled) is a subset of R_committed
```

More data may reveal more missing gates. It cannot mint permission.
