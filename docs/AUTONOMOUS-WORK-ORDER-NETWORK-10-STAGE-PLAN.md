# Autonomous Work Order Network: ten-stage product and engineering plan

Status: staged product and engineering plan. The repository is currently at
**Stage 1**. Nothing in this document grants production authority, establishes
capital or custody, creates insurance, moves funds, or closes a real-world
obligation.

## Product thesis

Outsider's user-facing object is an order, not a safety dashboard, certificate,
agent score, or permission product:

> Every consequential job performed by an agent, robot, or autonomous machine
> remains an open work order until its promised result, actual effect, affected
> parties, recovery, and durable responsibility have been resolved.

The executor may change. The vendor may disappear. A runtime may be destroyed.
None of those events may erase the order, an attempt, a challenge, or an
outstanding duty.

An Outsider work order is a **product projection over the existing typed
graph**, not a replacement ontology:

```text
PrincipalEpoch
  -> AccountableDeployment
  -> Runtime / Embodiment
  -> Delegation
  -> Episode (the work-order episode)
  -> Attempt (every start, refusal, retry, abort, failure, recovery, and completion)
```

The commercial unit is exactly **one prospectively defined promised result or
one consequence-bearing commit**. Tool calls, frames, commands, retries, and
recovery operations are nested Attempts; they can never be counted as extra
orders to manufacture volume. A broad session containing several independently
accepted consequential commits must be split into separately scoped orders.

Agent and robot vendors remain responsible for their native sandboxes, policy
engines, tool controls, collision avoidance, safety PLCs, E-stops, controller
validation, and safety cases. Outsider consumes references and observations
from those controls. Structural conformance never mints authority and never
overrides a native veto.

## Permanent invariants

All stages preserve:

```text
C_enabled ⊆ A_proven
Reach_W(C_enabled) ⊆ E_committed
Reach_W(C_enabled) ⊆ R_committed
```

`C_enabled`, `A_proven`, `E_committed`, and `R_committed` are typed sets and
graphs, never scalar scores. Authority, capability, evidence, outcome truth,
standing, obligation closure, price, capital, custody, guarantee, and payment
authority are non-convertible:

- evidence cannot mint authority;
- a signature proves control of a key, not legal identity or standing;
- a vendor success bit, server acknowledgement, model reward, or pseudo-label
  is not independent outcome truth;
- payment does not prove recovery and cannot close a reality obligation;
- a later success cannot retroactively authorize an earlier action;
- occurrence census and content deduplication remain separate;
- unknown or incomparable scope produces `HOLD`, never silent permission;
- raw prompts, transcripts, credentials, media, device identifiers, and direct
  personal identifiers never enter a public or network order projection; and
- every material schema or policy change creates an append-only, versioned
  descendant with explicit supersession links. Frozen artifacts are not
  overwritten.

For a physical execution, the local condition is additionally conjunctive:

```text
C_enabled ⊆ A_proven
and
nativeSafetyState == READY
```

`nativeSafetyState != READY` is always a veto. Outsider authorization can never
turn it into `READY`.

## What an order may visibly promise

The customer-facing promise must equal the strongest externally established
layer for that exact order. The product must never collapse these terms:

| Term | Meaning | What it is not |
| --- | --- | --- |
| **Provider commitment** | A named provider accepts a versioned duty to repair, redo, restore, or otherwise perform a defined remedy. | Cash, collateral, an Outsider guarantee, or proof the provider can perform. |
| **Provider reserve** | A bounded portion of provider funds is restricted under an externally enforceable arrangement and held or controlled through a licensed custodian/payment partner. | A database number, Outsider capital, pooled insurance, or proof of sufficient tail capital. |
| **Provider deposit** | Provider-prefunded collateral dedicated under explicit release, return, priority, and shortfall terms. | Revenue recognition, an internal accounting hold, customer money owned by Outsider, or insurance. |
| **Outsider capital** | Outsider's own documented balance-sheet capital, allocated under board-approved per-order and aggregate limits to a defined advance-remedy program. | Provider funds, custody, unlimited protection, or an insurance policy. |
| **Licensed insurer** | A licensed carrier issues the policy, bears the covered risk, and controls or delegates claims under applicable law. | Outsider calling a software feature insurance, a reserve, or a guarantee. |

Every funding layer must expose one exact `remedyFundingSourceKind`:

```text
NONE
PROVIDER_COMMITMENT_ONLY
PROVIDER_RESERVE_LICENSED_CUSTODY
PROVIDER_DEPOSIT_LICENSED_CUSTODY
OUTSIDER_CAPITAL_LIMITED_ADVANCE
LICENSED_INSURER_POLICY
```

Stage 9 v1 permits exactly one active funded layer for an order. A future
multi-source stack requires a versioned descendant in which every layer keeps
its own exact kind, amount, currency, priority, exclusions, expiry,
issuer/custodian identity, governing terms, claim state, and receipt chain; no
stack may be collapsed into one promoted kind. `Outsider protected`,
`guaranteed`, `insured`, and similar undifferentiated labels are forbidden.

## Sequence and dependency rule

Stages 1–7 are cumulative and must be promoted in order. Stage 8 is a physical
domain profile that branches from the completed Stage 1–7 path; it is required
for a physical-machine order class but is not a prerequisite for funding a
software-agent order class. Stage 9 is likewise promoted per exact order class
and may not borrow evidence from another domain. Stage 10 federates only the
paths that passed their own prior gates. No later stage may paper over a failed
earlier or domain-specific stage.

Every promotion has two necessary gates: an engineering replay/conformance gate
and the stated external-fact gate. Public datasets, fixtures, simulations,
signatures from locally configured keys, and successful tests may satisfy only
the former. They never substitute for a real buyer, provider, resource owner,
witness, resolver, custodian, capital provider, or affected party adopting the
relevant role. If the external-fact gate fails, stop expanding infrastructure
for that stage and return to product discovery.

| Stage | Product milestone | Financial authority |
| --- | --- | --- |
| 1 | HOLD-only order projection, then source-bound replay | None |
| 2 | Familiar non-financial order experience | None |
| 3 | Real provider commitment | None |
| 4 | External resource-owner adoption | None |
| 5 | Independently observed outcome and real recovery | None |
| 6 | Standing, challenge, and accepted adjudication | None |
| 7 | Cross-provider portability | None |
| 8 | Robot and physical-action profile | None |
| 9A | Provider reserve/deposit through licensed custody | Explicitly bounded provider funds only |
| 9B | Limited Outsider-capital advance remedy | Explicitly bounded Outsider capital only |
| 9C | Licensed-insurer policy | Carrier-issued coverage only |
| 10 | Federated network scale and governance | No automatic expansion |

## Stage 1 — HOLD-only work-order projection and source-bound replay

**Implementation checkpoint (2026-08-31):** six engineering slices now exist:

- `src/outsider-autonomous-work-order.js` validates the exact HOLD-only product
  projection and a caller-supplied expected hash;
- `src/outsider-episode-attempt-set-composition.js` separates Attempt rows,
  report occurrences, and supplied network-object-hash equality without
  claiming a durable head, full ancestry, object-byte replay, or global
  completeness;
- `src/outsider-autonomous-work-order-source-replay.js` canonically replays the
  actor, prospective census, three existing network lanes, semantic bundle,
  and revision-zero obligation under caller-supplied pins, while explicitly
  reporting that external pin provenance, the actor-edge-to-network-delegation
  crosswalk, product-term source coverage, and aggregate source replay remain
  unestablished; and
- `src/outsider-autonomous-work-order-private-bundle.js` publishes a private,
  no-clobber, five-file pending bundle with a receipt written last. Its
  structure verifier never upgrades the pending source-bound envelope, and its
  trusted entry point refuses to invent missing integration;
- `src/outsider-autonomous-work-order-dispute-review.js` records a HOLD-only,
  hash-only direct-participant review **candidate** ledger. It keeps invitations,
  responses, timeouts, withdrawals, retractions, and correction successors as
  occurrence denominators independent of supplied-object-hash equality. Its
  trusted entry point is structurally incapable of PASS until a future private
  source bundle replays the historical case, external account/channel
  continuity, direct participation, current rights/privacy state, and a durable
  lifecycle head; and
- `src/outsider-autonomous-work-order-dispute-review-source-bundle.js` adds a
  private, no-clobber ten-file companion for seven role-separated opaque source
  byte objects, a private commitment key, a network-safe projection, and a
  receipt written last. It preserves occurrence census independently of object
  equality, binds invitation and response separately, rejects raw-byte
  projection and terminal-state resurrection, and keeps the trusted verifier
  permanently `NOT_INTEGRATED` until fixed external adapters, independently
  sourced trust pins, full lifecycle ancestry, and a durable external head
  exist.

The six-slice focused suite passes 58/58 in 11.709 seconds and the adjacent
contract suite passes 193/193 in 102.386 seconds. The review-ledger focused
slice separately passes 10/10 in 0.114 seconds, and its private source-bundle
slice passes 9/9 in 1.675 seconds. Every result remains `HOLD`, `NONE`,
non-executable, non-financial, and ineligible for training or actor credit. No
private case artifact was emitted: without an actual participant-controlled
source bundle, publishing a fixture would launder a structural test into
product evidence.

**Public-candidate safety checkpoint (2026-09-01):** a seventh, isolated
HOLD-only slice now exists for the selected GitHub discovery candidate:
`src/outsider-autonomous-work-order-github-discovery-snapshot.js`, its focused
test, a GET-only acquisition draft, and a non-executable purge draft. The
profile is fixed to API version `2026-03-10` and classifies the source only as a
`PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT`. Its private observation pins
are 10,175 issue bytes at
`sha256:e429691ddcf684248168c8333942b6a3d6bba74085aab669da25748ce207dbe5`
and 16,132 comment bytes at
`sha256:0a9515e8edf2bd829cf11ea659f7d4b260650fc6386eaeac29cde5549d0750aa`
with six currently visible comment objects; the five-slot bracket would contain
62,789 raw bytes. These are mutable-snapshot equality pins, not provider
revisions, independent provenance, incident truth, participant identity, or
rights/privacy clearance.

Because durable retention/purge and descendant-cascade semantics are not
integrated, every production raw derive/load/publish/verify path and the live
acquisition path fails before raw reads, buffer copies, output-directory
creation, or network access. The purge file is explicitly a non-executable
draft and fails before argument or filesystem inspection. No formal capture,
network projection, contact, invitation, response, or purge was performed;
formal newly acquired bytes and external response occurrences are both `0`.
The focused safety suite passes 17/17 in 0.100 seconds, including runtime
side-effect sentinels for live acquisition, injected transport, and purge. The
adjacent dispute
ledger, private source-bundle, private publication, and discovery-ledger suite
passes 21/21 in 1.725 seconds. This closes a fail-closed engineering boundary,
not the Stage 1 source-replay or external-fact gate.

**Stage 1 engineering-integration checkpoint (2026-09-01):** the versioned
source-reference closure, one-directory local Attempt head, role-aware governed
certificate v2, lifecycle/outcome replay v3, and a final HOLD-only integration
receipt now rederive together without changing any frozen parent protocol. The
integration receipt proves membership for the three base Network Intake
occurrences plus the delayed `ACTION_OUTCOME/v2` witness and its distinct
source-review occurrence: five report occurrences and four supplied object
identity hashes. The v2 pair remains two denominator occurrences referencing
one object; object equality never reduces the occurrence denominator.

The integration source is 50,350 bytes at
`sha256:a9d1016ff5b136a35626d8da1898f3f1f64ef18763cdd07a7b213e1eec7b7f97`;
its synthetic fixture is 13,184 bytes at
`sha256:5ac17f61049f279427b05180157ce863ca00ef03f475a0f08280fde51f883aa1`;
and its focused test is 16,443 bytes at
`sha256:0290c66a956720006452bfa3e9abe9d1463a0e7eeb7450f6ea9f3e5bcf9d7e0f`.
The final focused run passed 9/9 in 113.957 seconds. Two adjacent runs passed
84/84 in 31.587 seconds and 137/137 in 26.113 seconds, for 230/230 tests in
this checkpoint with zero failures. Hash-bound read-only red-team review found
no remaining P0 or P1 issue in these exact bytes. A separate order-specific
invocation spanning the projection, private bundle, dispute ledger, public
candidate fail-closed adapter, source closure, lifecycle v2/v3, and integration
receipt passed 94/94 in 113.765 seconds; it overlaps the focused/adjacent sets
and is therefore reported as a separate invocation rather than added to the
230-test count.

This remains a Stage 1 engineering checkpoint, not either promotion gate. Its
Attempt head is a two-pass stable replay in one observed local directory, not
an independently witnessed or externally durable head. Caller expected hashes
remain caller pins, source-review receipt provenance remains unverified, the
global Attempt/report denominator remains incomplete, and original rights and
privacy source bytes have not been adjudicated. Independent pin provenance, an
external durable head, rights/privacy adjudication, and the real
direct-participant dispute replay below therefore remain open. The receipt
fixes `stage1EngineeringGatePassed:false`, `stage1ExternalFactGatePassed:false`,
`stage1Complete:false`, and `stage2Permitted:false`. No Stage 2 work starts
before both gates pass.

**Stage 1 remaining-prerequisite checkpoint (2026-09-01):** three additional
HOLD-only artifacts now make the unresolved external work explicit without
pretending to satisfy it:

- `src/outsider-episode-attempt-set-external-head-candidate-v1.js` freshly
  replays the one-directory local Attempt head and can construct a private,
  caller-supplied opaque candidate around only the head subject digest. It has
  no transport or trust-policy input, removes registry-derived identifiers and
  local census counts from the request, and marks the request, candidate, and
  verification as not publication-safe. Caller bytes, caller time, and caller
  pins establish no provider response, external provenance, durability,
  non-omission, non-equivocation, or independent head. The source is 40,507
  bytes at
  `sha256:115fcc8154a3639cf58f26e1404009796e77ac0b68480caa520fddfafd344bfb`;
  its 16,435-byte focused test is at
  `sha256:cd1ffc42bd72e568171e70baccada701c8a0eb0b9678df8fb155195dd001fa2a`
  and passes 12/12.
- `src/outsider-autonomous-work-order-github-discovery-lifecycle-prerequisite-v2.js`
  is a pure, zero-I/O protocol receipt. It specifies a fixed ignored root, a
  lifecycle tombstone durable before any raw stat/open/read/copy, an explicit
  finite acquisition/publication descendant census, resumable no-clobber
  lifecycle state, and exact non-recursive unlink targets. It does not rehash
  current parent files, write a tombstone, perform purge, adjudicate rights or
  privacy, prove secure/remote erasure, or establish the required independent
  lifecycle registry head. Missing, unavailable, rolled-back, or unknown
  lifecycle state remains `HOLD`; every live/raw acquisition and publication
  kill gate remains active. The source is 24,039 bytes at
  `sha256:35888cdae61ca42a7b31e830ee1ca2d47ee15c271a8c549ffdc8447312b5749e`;
  its 19,837-byte focused test is at
  `sha256:ca56ee88b9afe5d6a2919a9fad1dd87b1fef9d889f4b9b82a2e48fabd3e4b32a`
  and passes 14/14.
- `src/outsider-autonomous-work-order-direct-participant-invitation-packet-v1.js`
  freezes a synthetic-only, private pre-contact question shape: exact decision
  point, before and changed references, triggering reconstruction components,
  kind-specific evidence or disposition reference, and neutral
  `YES/NO/UNSURE/DECLINE` response semantics. Its only active constructor is a
  pure in-memory derivation. Raw publication fails before input or path access;
  raw verification returns a fixed `HOLD` before input or path access. The
  derivation does not return or persist source bytes, nonce, projection key,
  public key, or signature; it has no transport target and is ineligible for
  contact. Work-order, Episode, Attempt, participant alias, and case bindings
  remain caller-only; the Stage 1 integration receipt, rights/privacy
  adjudication, direct participation, source replay, network order, delivery,
  response, and external fact are all explicitly unestablished. The source is
  64,665 bytes at
  `sha256:ebc6aea9f28d0c2d8eba0d793bab0ab2aa213feb471efdcdc3011595b67d82cd`;
  its 21,994-byte focused test is at
  `sha256:9d62897cabf66b8d54662629616777d4358c2df4fb77a85d884bd2b425a08024`
  and passes 10/10.

Across these three focused suites, 36/36 tests pass. No network request,
contact, invitation delivery, raw publication, purge, external anchor, or
Stage 2 action occurred. These artifacts reduce ambiguity around the next
safe operations; they do not reduce the real evidence denominator. Stage 1
still requires an independently acquired and subject-bound external head,
independent lifecycle durability/non-equivocation, current source-specific
rights/privacy authority, and one replayable direct participant confirmation
that identifies a specific evidence-request or dispute-disposition change.

**Stage 1 invitation-binding and external-witness checkpoint (2026-09-01):**
two versioned descendants now bind the preceding engineering receipts without
turning local or caller-selected evidence into an external fact:

- `src/outsider-autonomous-work-order-direct-participant-invitation-packet-v2.js`
  freshly replays the Stage 1 integration receipt, its two-pass local Attempt
  head, the lifecycle prerequisite, and the v1 in-memory question derivation.
  It crosswalks the exact work order, Episode, Attempt, current composition,
  reconstruction, review packet, purpose, audience, question, and retention
  bindings. The operation performs read-only parent replay but no write,
  network request, contact, delivery, or send. It returns no source bytes,
  prompt, alias, nonce, key, signature, path, URL, or target. The source is
  25,298 bytes at
  `sha256:69f7d22e49729a05f4acb1b916165f7bdf23d8d5725b999acc01157d7cbac818`;
  its 21,433-byte focused test is at
  `sha256:27ad456c49e7d3743b7858d4b30991973fbedbaa5d0c2f984be673957b0a98bc`
  and passes 9/9 in 60.367 seconds.
- `src/outsider-episode-attempt-set-external-witness-v2.js` binds a private
  witness request to a fresh local-head replay, including the complete entry
  byte-commitment vector and head composition. It replays a Rekor-v2-shaped
  inclusion and signed-checkpoint proof only under caller-supplied trust and
  transport policy. The caller bootstrap, keys, proof bytes, and one
  checkpoint establish neither independent acquisition nor operator/witness
  independence, issuer signature, TUF `TrustedRoot`/`SigningConfig`, live
  provider interoperability, cross-checkpoint consistency, non-equivocation,
  or an external durable head. The source is at
  `sha256:1a5ce12d35b594e82b8c32b8e9c32e81b16ce2630850c7b20ddb0a74ecbdf024`;
  its focused test is at
  `sha256:1d64e0759e4ecaaa93974dc878e553b0adba122808365f176f4374f63ee5e8e4`
  and passes 13/13 in 5.655 seconds.

These exact bytes received hash-bound read-only red-team verdicts of zero
remaining P0/P1 findings. The two suites pass 22/22 in this independent
checkpoint. Both descendants remain `HOLD`; the invitation is `NOT_SENT`, the
witness is private and caller-policy-scoped, and
`stage1EngineeringGatePassed`, `stage1ExternalFactGatePassed`,
`stage1Complete`, and `stage2Permitted` remain `false`. No external submission,
contact, or Stage 2 work occurred.

**Stage 1 TUF/Sigstore trust-material checkpoint (2026-09-01):** a third
versioned HOLD-only descendant now makes the caller-policy trust assumptions
behind the Attempt witness explicit. The source
`src/outsider-episode-attempt-set-external-witness-trust-material-v3.js`
replays a caller-pinned TUF root sequence with predecessor and successor root
thresholds, then replays timestamp, snapshot, targets, exact target bytes, a
strict selected `TrustedRoot` v0.2 / `SigningConfig` v0.2 profile, and a local
M-of-N witness-key policy. TUF signatures count distinct authorized key IDs;
they do not establish distinct physical keys or independent operators. The
module has no network or filesystem transport and treats the bootstrap, replay
time, pins, source bytes, provider mapping, and witness policy as caller
material only.

The source is 99,162 bytes at
`sha256:bf2eb0dacb6f505d3682c8a96b85d62bfe3fd47e27c6d87aec4e9348066d24f8`;
its 61,062-byte focused test is at
`sha256:5a5e178c8fc3b9ace35e26becd198c6dbc69241eaee46fafc2ee90ec0e3c2f84`.
The shared strict canonicalizer was hardened against proxy/accessor and
post-import prototype dispatch, with fixed depth, member, string, and
canonical-work budgets; its source is 12,582 bytes at
`sha256:d659dc66cbe1473b36f675e27aa3490ad93dde8a016c3cc235546c01dd05617b`
and its 11,143-byte test is at
`sha256:cbd296b9a16871fc7f9e69beb4694d934e370cdeee577d101ff95720959895cb`.
The final focused run passes 29/29, and the canonicalizer, external-anchor,
external-witness-v2, and trust-material-v3 adjacent run passes 56/56. Two
independent hash-bound read-only reviews found zero remaining P0 or P1 issues
in these exact bytes.

Every expensive operation is bounded before execution: a replay permits at
most 16 root rotations, 48 signature verifications, 16 MiB of cumulatively
verified messages, 128 public-key parses, 64 X.509 parses over 2 MiB of DER,
and 32 MiB of TUF canonical work. These limits are fail-closed engineering
constraints, not freshness, rollback protection, or an external time source.
There is no prior trusted timestamp/snapshot/targets state, latest-root
discovery, cross-checkpoint consistency, split-view exclusion, independent
bootstrap acquisition, live provider response, or durable external head.

The current public Sigstore bytes do not satisfy this strict success profile:
the published snapshot contains some metadata descriptions with both SHA-256
and SHA-512 while this profile intentionally accepts only an exact SHA-256
description; the published `trusted_root.json` remains v0.1 rather than v0.2;
and the default `signing_config.v0.2.json` still selects Rekor v1. A separate
Rekor-v2 signing configuration exists, but that does not turn the current
default target or any locally supplied bytes into independently acquired
evidence. Consequently `officialSourceBytesEstablished`,
`actualPublishedSigstoreTargetBytesReplayed`, rollback/latest-root facts,
independent witness facts, non-equivocation, external/durable head, both Stage
1 gates, and Stage 2 permission all remain `false`/`HOLD`.

**Stage 1 Attempt/trust binding checkpoint (2026-09-01):** the HOLD-only v4
composite now freshly replays both the complete local-Attempt external-witness
v2 candidate and the caller-bootstrap trust-material v3 record in one call.
It binds the exact endpoint, `POST /api/v2/log/entries`, redirect policy,
selected P-256 SPKI DER commitment, checkpoint origin, provider/operator
mapping assertion, and ordered local witness-key policy. The provider/operator
mapping remains a caller assertion and the exact SPKI DER hash is not a
canonical identity for the underlying mathematical key.

The v2 context is copied, field by field, into one bounded internal snapshot
before either parent call. Every caller-derived leaf must already be the
expected primitive type; Proxy, boxed, or wide-object leaves are rejected
without traps, enumeration, or caller-object freezing. That same frozen
snapshot is passed to the v2 parent and consumed by the v4 crosswalk, closing
the earlier A/B splice in which a delegated parent prototype hook could mutate
the original context after parent normalization. The aggregate operation
budget includes the nested v3 witness-policy replay: with `W` witnesses it
counts `1 + 2W` public-key parses, reaching 33 at the fixed maximum of 16.

The production source
`src/outsider-episode-attempt-set-external-witness-trust-bound-v4.js` is
63,741 bytes at
`sha256:73e03ff34111357daffee322ffb58ed1ea0bb6af3cf701abdd169ea956965cc0`;
the 19,239-byte synthetic helper is at
`sha256:57abcfd4117f6d924133dcec15f7f1ccb3a4fae5f3bbf9c3c01d75a470078443`;
and the 38,827-byte focused test is at
`sha256:afaaf4b47bcb93034f9dbe2b47b4212964701798060baf38352a34019b39234d`.
The final focused run passes 22/22, and the strict canonicalizer, local-head
v2, external anchor, external-witness v2, trust-material v3, and trust-bound
v4 adjacent run passes 84/84. A hash-bound read-only review found no remaining
P0 or P1 issue in these exact bytes.

The v2 parent necessarily performs its fresh local-head filesystem read and
has not established post-import `KeyObject` or `Buffer` prototype isolation;
v4 reports those composite limitations explicitly and sanitizes their failure
paths. It adds no filesystem write, transport, publication, or network action.
`sourceReplayVerified`, direct-participant confirmation, rights/privacy
adjudication, network order, independent outcome truth, causality, recovery,
closure, independent bootstrap/source/transport/witness facts,
cross-checkpoint consistency, non-equivocation, durable external head, both
Stage 1 gates, and Stage 2 permission remain `false`/`HOLD`. The native-safety
veto remains unconditional and cannot be overridden by this composite.

**Stage 1 lifecycle-registry safety checkpoint (2026-09-01):** the attempted
filesystem-backed lifecycle executor was rejected after review found that an
exported synthetic harness still exposed path-based `unlink`/`rmdir` behavior
without a directory-handle boundary. Hiding a temporary root and retaining a
process-local capability did not prevent a same-user ancestor replacement
race, so its implementation and test result are not evidence and are not
retained as an executable path.

The replacement
`src/outsider-autonomous-work-order-github-discovery-lifecycle-registry-v3.js`
is deliberately a capability-free contract scaffold. It has no imports and no
filesystem, path, process, network, registry, purge, or deletion calls. Each of
its ten callable exports takes no parameters and has exactly one behavior: it
throws the fixed typed `HOLD` error. It preserves only frozen schemas, a proof
matrix whose rows are all unestablished, and the required future order
`REGISTER_CAPTURE -> DRAIN_BARRIER -> zero durable reader leases -> verified
eligibility -> PURGE_INTENT -> finite descendant cascade -> exact
non-recursive deletion -> receipt`. The source is 10,030 bytes at
`sha256:d5a7c2dbf2bf82616c00a79243ed0fdbc4b7d586d8109056d021ea7a2b90055f`;
its 11,014-byte focused test is at
`sha256:cf2ddc22af79e267de6b8985e88ffb1af5a18f3e77b7123d9e86afb665797297`
and passes 7/7. Hash-bound read-only red-team review found zero remaining P0 or
P1 issues in those exact bytes.

This checkpoint proves only that the unsafe executor is unreachable and that
the intended lifecycle protocol is explicit. It does not create a registry,
reader lease, tombstone, purge, secure erasure, rights/privacy decision,
external head, or engineering-gate success. All existing acquisition,
projection, publication, verification, and purge kill gates remain closed.

The production executor feasibility review also found that the supported Node
filesystem API has no `openat`/`unlinkat` interface and that a same-UID native
addon or helper cannot exclude a cooperating process from replacing a leaf
between validation and deletion. The minimum production boundary is therefore
an independently provisioned lifecycle service plus a long-running native
broker under a dedicated OS identity that exclusively owns the raw root, keeps
stable directory descriptors, accepts fixed capture/role identifiers rather
than paths, and performs `openat`/`fstatat`/`unlinkat` with external
drain-barrier, lease, census, intent, tombstone, and commit-unknown receipts.
That service and provisioning do not exist in this workspace. Per-capture AEAD
envelopes could move confidentiality from ciphertext unlink to independently
verified key destruction, but would still require zero durable key leases, a
non-rollback key-version head, and a separate terminal state for retained
ciphertext; they would not prove physical deletion, backup deletion, custody,
rights/privacy clearance, or either Stage 1 gate.

### Product promise

The current structural slice may promise only:

“The shape of this proposed order was recorded and pinned; its referenced
sources have not yet been replayed and no network order has been established.”

After the full Stage 1 replay gate passes, the stronger promise becomes:

“This order is a source-bound, tamper-evident reconstruction of declared
identity, delegation, attempts, evidence, outcome slots, and outstanding
obligations.”

It must also say: “No action, outcome, recovery, guarantee, payment, or closure
has been authorized or independently established.”

### Engineering scope

- Add one read-only order projection over existing contracts; do not add a
  second actor, delegation, episode, attempt, outcome, or obligation ontology.
- Alias the order identity to the existing Episode. `orderId` is display text
  and the work-order projection hash is a record root, not a fourth identity.
  Bind the exact `PrincipalEpoch`, `AccountableDeployment`, owner/resource,
  Claim/Way/World, Episode, and prospective-census commitments. Attempts remain
  child occurrences.
- Replay the three Network Intake lanes and the immutable Reality-obligation
  prefix. Preserve `ACTION_OUTCOME/v2` as a later occurrence in the same lane.
- Emit a deterministic customer-safe state, missing-field ledger, source class,
  and remedy-funding state fixed to `NONE`.
- Keep the projection `QUARANTINED`, `HOLD`, non-executable, non-financial, and
  ineligible for automatic training or actor credit.
- The initial structural descendant represents exactly one preallocated
  Attempt because the current Reality-obligation genesis binds one exact
  `attemptHash`. It does not enforce a runtime retry policy and cannot represent
  a retrying order. Before Stage 1 promotion, add an append-only Episode-level
  Attempt-set composition that preserves every refusal, abort, timeout,
  missing attempt, retry, and recovery without letting later success erase an
  earlier consequence.
- Add versioned descendants only. Never edit previously frozen artifacts or
  append-only event history.

### Exact inputs

- verified `outsider/actor-identity-envelope/v1` and its principal,
  accountable-deployment, runtime/embodiment, delegation, Episode, and Attempt
  bindings;
- verified `outsider/network-prospective-census-projection/v1`;
- externally pinned Network Node submission bundles for exactly the existing
  `DELEGATION_RESPONSIBILITY`, `ACTION_OUTCOME`, and `PROSPECTIVE_CENSUS`
  lanes;
- `outsider/network-action-outcome-projection/v1` and, when present, an
  append-only `v2` delayed-witness successor;
- a caller-pinned immutable `RealityObligationStore` state prefix;
- source, audience-registry, server-key-epoch, lifecycle, rights, privacy, and
  external-head checkpoint pins; and
- explicit `null`/`UNKNOWN`/`HOLD` for every absent fact.

### Exact outputs

- `outsider/autonomous-work-order-product-projection/v1` with only content
  hashes, typed state, missingness, ordering, and fixed-negative
  authority/economic facts;
- `outsider/autonomous-work-order-verification/v1`, which either rederives the
  exact projection or returns a typed failure;
- `orderIdentityHash` equal to the existing `episodeHash`, plus a distinct
  `workOrderHash` that addresses only this projection record;
- an ordered occurrence view that preserves every attempt and never uses object
  deduplication as the attempt denominator;
- `remedyFundingSourceKind: NONE`, `authority: NONE`, `status: HOLD`,
  `actionReady:false`, `executable:false`, `permitsGuarantee:false`, and
  `permitsSettlement:false`; and
- no-clobber, mode-`0600` local artifacts when the projection is materialized.

For the structural slice, `ok:true` means only canonical structure,
derivation, self-hash, and caller expected-hash agreement. It must always be
accompanied by `sourceReplayVerified:false`,
`appendOnlyPredecessorSourceReplayVerified:false`, and
`networkOrderEstablished:false`. It is forbidden to present that result as
traceability, provider acceptance, or a live order.

### Proof and promotion gate

Promote to Stage 2 only when focused and adjacent tests prove:

1. exact replay of all input hashes and immutable prefixes;
2. deterministic output across process restarts and input ordering;
3. rejected cross-subject, stale-head, lane-substitution, dropped-attempt,
   replayed-nonce, proxy/accessor, caller-boolean, and post-import-mutation
   attacks;
4. every output remains `HOLD` with zero authority, CEU, action, training,
   pricing, guarantee, settlement, and capital permissions; and
5. no frozen byte changes and every successor carries explicit predecessor and
   supersession references.

The non-authoritative external-fact gate is one already-occurred agent or
machine work dispute reconstructed from the original parties' available
records. At least one **direct participant** must confirm through a replayable
protocol that the reconstruction of what was promised, attempted, observed,
and left unresolved would have materially changed one specific evidence
request or dispute disposition in that case. Generic praise, fixture review,
or a hypothetical willingness to use it does not pass. This confirmation is
product evidence only: it establishes no standing, fault, independent outcome,
duty, remedy, or authority.

**External-fact discovery checkpoint (2026-08-31):** six primary-source
candidates were screened and deduplicated against existing adapters; zero were
admitted and no person or institution was contacted. The highest-fit candidate
is [Claude Code issue #64056](https://github.com/anthropics/claude-code/issues/64056),
where the reporter says a missing subagent transcript changed the initial
attribution of a production-database deletion. Other HOLD-only candidates are
the [Replit/SaaStr database incident](https://replit.com/blog/doubling-down-on-our-commitment-to-secure-vibe-coding),
the [Deloitte/DEWR assurance review](https://www.finance.gov.au/sites/default/files/foi-25-26-084-document-1.pdf),
the Cruise autonomous-vehicle reporting dispute, Moffatt v Air Canada, and
Mata v Avianca. Public narratives and official findings may select whom to ask;
they cannot satisfy the gate. Current direct-participant confirmation is
`0/1`, actual-case admission is `0`, and Stage 2 remains unopened.

### Stop conditions

- Any current source-replay or provenance break is repaired before work-order
  construction continues.
- Stop if order identity requires IP, device, base-model, or global-score
  identity.
- Stop if a user-provided boolean, locally configured key, or self-rehash can
  change `HOLD`.
- Stop if raw evidence or direct identifiers would enter the projection.
- Stop if an order row can erase a distinct attempt occurrence.

### Authority, capital, and privacy boundary

This stage is structural replay only. It creates no customer right, provider
duty, owner authority, outcome truth, closure, capital, custody, guarantee, or
payment instruction. Raw evidence remains in source-controlled stores; the
order contains only minimal hash commitments and redaction-safe typed facts.

### Metrics

- exact projections verified / projections attempted;
- occurrence count versus unique-object count;
- missing, censored, refused, unavailable, and rejected facts preserved;
- stale/cross-subject/replay attacks rejected;
- frozen artifacts changed: exactly `0`;
- positive authority, action, CEU, price, guarantee, settlement, capital, or
  custody claims emitted: exactly `0`.

## Stage 2 — familiar non-financial order experience

### Product promise

“See what was ordered, who declared responsibility, what the machine attempted,
what changed, what remains unknown, and what is still open.”

This is an order and timeline experience, not a safety console and not a funded
warranty.

### Engineering scope

- Build an order-detail read model with familiar states: `REGISTERED`,
  `PROVIDER_SUBMITTED`, `OUTCOME_PENDING`, `ISSUE_REPORTED`, `RECOVERY_OPEN`,
  `READY_FOR_EXTERNAL_CLOSE`, and `REOPENED`.
- Map every visible state to exact immutable source occurrences. Never let a UI
  state mutate the source ledger.
- Produce a privacy-minimized trace package and a separate authorized evidence
  request flow; do not place raw logs behind a shareable URL.
- Add revocation-aware, audience-bound access grants, retention presentation,
  and reason-coded redaction.
- Keep provider claims, owner observations, affected-party reports, instrument
  observations, and independent adjudication visibly distinct.

### Exact inputs

- a verified Stage 1 work-order projection and verification receipt;
- audience and purpose binding, retention class, redaction policy version, and
  rights/privacy review reference;
- current lifecycle/revocation head and externally anchored checkpoint; and
- optional source-controlled evidence objects addressed by hash, never copied
  into the network projection.

### Exact outputs

- a deterministic order-detail view and timeline;
- an audience-specific disclosure manifest listing fields disclosed, redacted,
  unavailable, and expired;
- a trace-package manifest containing immutable references, byte counts, and
  hashes rather than raw secrets or media;
- an access/revocation receipt; and
- fixed display text stating `No funded remedy` and `Not independently closed`
  where applicable.

### Proof and promotion gate

- Two separately authorized audiences receive only their permitted views from
  the same order root.
- Revocation removes future projection access without deleting the occurrence
  denominator or rewriting history.
- UI states and exported trace manifests replay byte-for-byte from source.
- At least five usability sessions can correctly answer: what was promised,
  what was attempted, what is known, what is disputed, who currently owes the
  next step, and whether funds are available—without interpreting a score.
- At least one real piece of work is sent through an existing routine—email,
  Slack, a delivery page, or a marketplace order page—and a real buyer opens
  the order link and uses it to accept, ask a substantive question, or raise a
  challenge. A prototype viewed only inside an Outsider interview is not this
  external-fact gate.

### Stop conditions

- Stop if the primary surface becomes a log viewer, safety dashboard,
  certificate, or provider leaderboard.
- Stop if visibility requires blanket access to prompts, chain-of-thought,
  credentials, personal data, or commercial secrets.
- Stop if “completed” can be rendered from a vendor success flag alone.
- Stop if any wording implies guarantee, insurance, reserve, or advance remedy.
- Stop if adoption requires a standalone Outsider application or user training,
  or if nobody will place the next real delivery into the order experience.

### Authority, capital, and privacy boundary

The experience is read-only and non-financial. Access authorization concerns
data disclosure only; it is not action, owner, adjudication, closure, or payment
authority. `remedyFundingSourceKind` remains `NONE`.

### Metrics

- correct order-state comprehension rate;
- median time to identify the outstanding duty;
- raw-sensitive fields disclosed: exactly `0` outside explicit source access;
- projection/revocation replay success rate;
- false “complete”, “guaranteed”, or “paid” presentations: exactly `0`.

## Stage 3 — real provider commitment

### Product promise

“A named provider has accepted a specific duty to redo, repair, restore, or
otherwise remedy this defined class of work.”

The promise belongs to the provider. Outsider records and preserves it; Outsider
does not yet fund it.

### Engineering scope

- Define a versioned provider-commitment adapter that binds legal/provider
  identity evidence, accountable principal epoch, exact covered order class,
  remedy menu, exclusions, response clock, recovery owner, horizon, challenge
  route, and termination/revocation rules.
- Require provider acceptance before covered work begins. A later commitment
  cannot retroactively cover an earlier attempt.
- Project commitment activation, expiry, withdrawal, supersession, breach, and
  outstanding duty as append-only occurrences.
- Keep commitment capacity and financial backing explicitly unknown unless an
  external source proves them in Stage 9.

### Exact inputs

- verified Stage 2 order experience root;
- provider legal-identity and signer-role references;
- provider commitment document bytes held by an authorized custodian, plus
  exact hash, version, effective interval, jurisdiction, and source verifier;
- typed remedy specification, service clock, covered consequence channels,
  exclusions, and escalation contacts; and
- accountable-deployment and responsibility-graph bindings.

### Exact outputs

- an immutable provider-commitment acceptance record;
- a responsibility edge from provider principal epoch to the exact order class;
- order-visible remedy scope and response deadline;
- future-effective revocation/supersession records that do not erase existing
  duties; and
- `remedyFundingSourceKind: PROVIDER_COMMITMENT_ONLY` with funded amount `null`.

### Proof and promotion gate

- At least one real, non-Outsider provider with authority to bind its service
  accepts the exact commitment terms.
- A source-specific verifier replays the signed/accepted commitment and signer
  role; configuring a public key alone is insufficient.
- Tests prove no retroactive coverage, no withdrawal of an existing duty, no
  cross-principal substitution, and no commitment-to-capital promotion.
- The provider names a human recovery operator and operational response clock.

### Stop conditions

- Stop if the provider refuses to accept a concrete remedy or responsible
  principal.
- Stop if marketing requires calling an unfunded commitment a reserve,
  protection, guarantee, reimbursement, or insurance.
- Stop if the provider can delete the order or unilaterally erase an already
  accepted duty.

### Authority, capital, and privacy boundary

Provider acceptance establishes only the externally verified contractual or
service duty within its terms. It grants no action authority and proves no
capital, custody, solvency, insurance, customer entitlement outside the terms,
or completed recovery. Confidential contract bytes remain outside the public
projection.

### Metrics

- externally verified provider commitments;
- covered order classes and exact effective intervals;
- commitment withdrawals affecting existing duties: exactly `0`;
- acknowledged duties with a named recovery operator;
- median provider acknowledgement latency;
- funded remedy amount: always `null` at this stage.

## Stage 4 — external resource-owner adoption

### Product promise

“The real owner of the affected resource accepted this exact order, and its
existing vendor-native resource gate produced a replayable receipt.”

### Engineering scope

- Add an owner-adoption verifier for the real resource boundary, not an
  Outsider-owned fixture or self-declared owner key. Outsider replays the
  existing owner/vendor-native gate receipt; it does not become, replace, or
  control the resource write path.
- Bind purpose, action class, resource, scope, validity, maximum attempts,
  retry policy, before-state, consequence radius, revocation, and the native
  gate receipt before the first attempt.
- Keep owner acceptance distinct from provider commitment and end-user consent.
- Preserve refused, rejected, expired, cancelled, never-started, aborted, and
  retried occurrences in the prospective census.
- Operate only a reversible, low-impact pilot with no live secrets in network
  artifacts.

### Exact inputs

- Stage 3 provider commitment and responsibility edge;
- exact owner/resource identity and standing evidence;
- pre-action Delegation, prospective-census slot, owner-gate policy/version,
  before-state commitment, allowed attempt count, and expiry;
- native owner-gate acceptance/refusal receipt and revocation source; and
- vendor-native control references as evidence inputs only.

### Exact outputs

- externally verified owner-adoption receipt;
- a typed `A_proven` radius for the exact order, kept separate from
  `C_requested` and local capability;
- ordered gate decisions and attempt occurrences;
- native owner-gate acceptance/refusal evidence; and
- a still-unfunded, still-open external order.

### Proof and promotion gate

- One real external owner, one real provider, and one real owner-controlled
  resource complete a prospectively registered, reversible order.
- Owner acceptance precedes every attempt and the owner's existing gate rejects
  a mismatched subject, stale head, expired scope, extra retry, or revoked grant;
  Outsider only verifies the resulting source receipt.
- Every eligible opportunity and every attempt terminal class is retained.
- `C_enabled ⊆ A_proven`, evidence reach, and responsibility reach replay from
  exact source bytes.

### Stop conditions

- Stop if owner “adoption” is only an Outsider fixture, provider assertion,
  configured key, or UI click unconnected to the resource boundary.
- Stop if the pilot can bypass the owner's native gate, or if success requires
  Outsider to take over that gate or vendor-native safety enforcement.
- Stop on scope, purpose, affected-party, or consequence-channel expansion.
- Stop if a missing occurrence can disappear from the denominator.

### Authority, capital, and privacy boundary

Owner adoption proves only the typed authority the real owner accepted for that
resource and interval. It does not establish safety, success, outcome truth,
recovery, closure, price, reserve, guarantee, or settlement. Resource secrets
and raw operational content remain with the owner.

### Metrics

- real external owners and owner-controlled resources adopted;
- owner-adopted orders and retained attempt denominator;
- actual-write-path mismatch/revocation tests rejected;
- scope-expansion attempts held;
- owner acceptance to first attempt latency;
- orders with any financial promise: exactly `0`.

## Stage 5 — independently observed outcome and real recovery

### Product promise

“If the delivered reality does not match the order, it stays open until the
named provider performs recovery and an accepted external observer confirms the
new state.”

### Engineering scope

- Join command-to-effect evidence to an independently identified outcome and
  recovery witness, including relationship/independence review.
- Record immediate and delayed horizons, affected-party reports, missingness,
  censored outcomes, interventions, recovery attempts, recurrence, and reopen.
- Require recovery evidence and world-restoration evidence separately; neither
  is implied by payment, retry, or provider self-report.
- Keep the accused provider unable to close its own obligation.
- Use the First Governed Reality Episode as certification of this network path,
  not as the product itself.

### Exact inputs

- a Stage 4 owner-adopted order and full occurrence census;
- exact command, acknowledgement, before/after-state, and effect commitments;
- second typed witness identity plus externally replayed relationship review;
- affected-party register and standing slots;
- immediate/delayed horizon commitments;
- immutable Reality-obligation prefix and recovery/challenge/reopen policies;
  and
- recovery action, recovery effect, and subsequent observation sources.

### Exact outputs

- appended `ACTION_OUTCOME/v2` witness occurrence;
- normalized outcome observation with explicit source class and missingness;
- recovery obligation state and recovery-attempt denominator;
- affected-party and recovery-evidence set commitments;
- delayed-horizon observations and reopen events; and
- one complete-episode path certificate whose authority is limited to what the
  source-specific external verifiers actually establish.

### Proof and promotion gate

- At least one real external-owner order includes an observed adverse or
  nonconforming result, a real provider recovery action, and an external
  recovery observation.
- The external owner or an accepted affected-party/witness confirms the
  recovered state; the provider cannot self-close.
- Every attempt and recovery attempt remains in the denominator.
- All committed immediate and delayed horizons are observed, explicitly
  missing/censored, or still open. No horizon silently disappears.
- Later contradictory evidence deterministically reopens the obligation.

### Stop conditions

- Stop if vendor success, user click, model judgement, server acknowledgement,
  or provider self-report is the only outcome source.
- Stop if the witness relationship or source code closure cannot be replayed
  within the claimed scope.
- Stop if “refund paid” or “retry succeeded” is used as world restoration.
- Stop if an affected party with standing has no route to report or reopen.

### Authority, capital, and privacy boundary

Independent observation is evidence, not automatic causality, provider fault,
adjudication, or closure authority. Recovery is non-financial at this stage.
Raw outcome and affected-party data remain source-controlled and purpose-bound.

### Metrics

- orders with complete pre-action-to-delayed-outcome joins;
- independent outcome coverage by committed horizon;
- recovery initiation and external-confirmation latency;
- attempt and recovery-attempt denominator completeness;
- reopened obligations and recurrence rate;
- provider-self-closed orders: exactly `0`.

## Stage 6 — standing, challenge, and accepted adjudication

### Product promise

“A party with standing can challenge the order, both sides receive process, and
a mutually or contractually accepted resolver—not the complained-about
provider—can decide the defined dispute.”

### Engineering scope

- Define role-separated claimant, respondent, affected party, resource owner,
  evidence custodian, resolver/adjudicator, appeal resolver, and recovery owner
  interfaces.
- Bind standing rule, notice, conflict screening, evidence submission,
  response, challenge window, reason codes, remedy catalogue, appeal, delayed
  consequence, reopen, and closure-candidate semantics.
- Preserve the original claim and every versioned amendment; stale-head
  receipts cannot affect the active case.
- Enforce least-privilege case bundles and record withheld/redacted evidence.
- Keep adjudication, remedy performance, recovery observation, payment, and
  obligation closure as distinct states.

### Exact inputs

- Stage 5 complete order/recovery path;
- externally adopted standing, procedure, remedy, and appeal rules;
- source-specific identity and role verification for each participant;
- current claim/order state head, evidence-set commitments, notice receipts,
  conflict disclosures, and challenge submission; and
- exact resolver appointment and scope accepted before the dispute decision.

### Exact outputs

- append-only challenge/case record and immutable original claim;
- standing decision, conflict-screening result, notice and response receipts;
- reasoned adjudication result bound to the current state head;
- appeal or challenge-window-maturity state;
- remedy obligation/amendment and recovery-verification request; and
- closure candidate that remains open until the authorized external closure
  conditions are independently met.

### Proof and promotion gate

- One genuine disputed external order traverses standing, notice, evidence,
  response, conflict screen, adjudication, remedy, recovery observation, and
  accepted resolution.
- The provider cannot act as sole adjudicator or erase adverse evidence.
- The parties accepted the resolver and procedure through a real contract or
  resource-owner rule; key configuration alone does not count.
- An appeal cannot be bypassed where the adopted procedure provides one.
- A stale head, replaced evidence set, or amended order invalidates prior
  instruction candidates without rewriting history.

### Stop conditions

- Stop if no non-provider resolver will accept the role or no party accepts the
  procedure.
- Stop if standing is inferred from possession of a link or signing key.
- Stop if confidential evidence must be exposed network-wide.
- Stop if adjudication is conflated with outcome observation or financial
  settlement.

### Authority, capital, and privacy boundary

Resolver authority is exact to the adopted procedure, parties, jurisdiction,
order class, and remedy scope. No capital, custody, payment, guarantee, or
insurance follows. Case data is compartmentalized by role and purpose; public
projections expose only necessary commitments and procedural state.

### Metrics

- challenges opened by standing class;
- notice, response, and decision latency;
- conflicts disclosed and resolvers recused;
- appealed, upheld, modified, reopened, and unresolved cases;
- unauthorized/stale-head receipts rejected;
- provider-only adjudications counted as valid: exactly `0`.

## Stage 7 — cross-provider portability

### Product promise

“The customer keeps the same order history and enforceable open duties when the
agent, model, runtime, service provider, or operator changes.”

### Engineering scope

- Implement portable, pairwise-pseudonymous principal/account relationships and
  versioned provider/resource bindings without a global person, agent, model,
  device, or credit score.
- Support export/import and source replay across at least two conformant nodes.
- Preserve old provider obligations after handoff. Transfer of a duty requires
  explicit acceptance by the new obligor and the resource owner/affected party
  where required; it is never inferred from task transfer.
- Separate execution-provider change, deployment-revision change, principal
  transfer, witness change, and obligation novation.
- Detect equivocation, double-close, stale export, and split-view histories
  through externally anchored heads.

### Exact inputs

- verified Stage 6 order and case histories;
- two independently operated Node SDK/conformance implementations;
- account/deployment lineage and continuity proofs;
- owner-approved provider handoff or second-provider order;
- externally anchored source heads, lifecycle/revocation state, audience pins,
  and rights/privacy policy; and
- explicit duty-retention or novation receipts.

### Exact outputs

- portable order export with content roots and no raw evidence;
- second-node replay receipt and cross-node consistency report;
- provider-handoff or second-provider relationship edge;
- obligation-retention/novation record;
- equivocation and stale-head alerts; and
- contextual history limited to exact deployment, Claim, World, radius, and
  observation window.

### Proof and promotion gate

- The same external owner uses the order/account relationship with two distinct
  providers or completes a real provider handoff.
- Both nodes independently replay the same occurrence and obligation roots.
- The original provider's open duty survives executor/provider change unless a
  valid, externally accepted novation exists.
- No positive history is inherited by an unproved fork, new principal epoch, or
  material deployment revision.
- Cross-node revocation and later-evidence reopening converge without erasing
  old occurrences.

### Stop conditions

- Stop if portability means copying a provider's proprietary raw logs.
- Stop if a shared account becomes a global reputation score or merges
  incomparable order classes.
- Stop if changing providers can escape an existing duty.
- Stop if one operator is the only source of all external anchors.

### Authority, capital, and privacy boundary

Portability transports source-verifiable facts and accepted obligations, not
authority, safety, credit, solvency, or outcome truth. Pairwise pseudonyms and
purpose-bound disclosure prevent network-wide identity correlation by default.

### Metrics

- orders replayed by two independent nodes;
- owners using two providers;
- provider handoffs preserving all open duties;
- stale-head/equivocation events detected;
- unauthorized cross-context history joins: exactly `0`;
- global scores emitted: exactly `0`.

## Stage 8 — robot and physical-action profile

This is a parallel domain branch after Stage 7. It is mandatory for physical
machine orders and irrelevant to the promotion of a purely digital order class.

### Product promise

“A robot or autonomous machine job appears in the same order and recovery
experience, while its manufacturer and site safety system retain absolute local
control.”

### Engineering scope

- Extend the existing order projection with a profile, not a new ontology, for
  `EmbodimentRevision`, controller/firmware, calibration, zone, payload,
  velocity/force/energy bounds, interaction class, native safety state, E-stop,
  intervention, takeover, physical effect, damage/injury/privacy channels, and
  recovery.
- Accept native safety, fleet, PLC, or OEM receipts only as source-typed evidence
  inputs. Never send low-level actuation or bypass native control.
- Require owner/site authority and `nativeSafetyState == READY` independently.
- Preserve frame/command/attempt occurrence census separately from deduplicated
  telemetry objects.
- Add physical witness and maintenance/recovery adapters with calibrated units,
  coordinate frames, uncertainty, and delayed observation.

### Exact inputs

- Stage 7 portable order contracts;
- exact embodiment/deployment revision and accountable principal epoch;
- site/resource-owner delegation and zone/time/payload/force/speed limits;
- OEM/native-safety reference, controller mode, calibration, E-stop and
  intervention source commitments;
- prospective task/attempt census and immutable raw telemetry references;
- external physical-effect and recovery witnesses; and
- affected-party, maintenance, recovery, challenge, and delayed-horizon plans.

### Exact outputs

- a robot/physical profile bound to the existing work-order subject;
- ordered machine Attempt, intervention, E-stop, takeover, effect, and recovery
  occurrences;
- source-typed native-safety evidence references with effectiveness not inferred;
- calibrated physical observation and missingness projections;
- physical recovery obligation and external outcome observations; and
- no action token, actuator connection, or safety override from the network.

### Proof and promotion gate

- One reversible, low-energy, owner-scoped real physical order is prospectively
  registered and completed with an external outcome/recovery witness.
- Native safety veto is exercised in a test and cannot be overridden by any
  Outsider state or order acceptance.
- Wrong zone, stale calibration, excessive payload/force/speed, extra retry,
  missing safety state, and revoked owner scope all fail closed.
- Every command/attempt/intervention/recovery occurrence and committed horizon
  remains represented.
- Simulation and retrospective robot data remain explicitly separate from the
  real prospective episode.

### Stop conditions

- Stop if integration requires replacing, commanding around, or weakening OEM,
  safety PLC, fleet, E-stop, or site controls.
- Stop if uncalibrated or unit/coordinate-ambiguous data is treated as physical
  truth.
- Stop if the provider's own success label is the only physical outcome.
- Stop if physical action expands before consequence, affected-party, and
  recovery coverage is committed.

### Authority, capital, and privacy boundary

Outsider never becomes the local safety controller or an actuator. Site-owner
authority and native safety readiness are separate conjunctive prerequisites.
Physical telemetry and imagery remain in governed source storage; public
projections contain only necessary commitments. This stage remains
non-financial.

### Metrics

- real prospective physical orders by exact profile;
- native veto and intervention occurrences preserved;
- calibration/unit/frame validation rate;
- physical outcome and recovery horizon completeness;
- attempted safety bypasses rejected;
- simulations counted as real physical orders: exactly `0`.

## Stage 9 — separately gated custody, Outsider capital, and licensed insurance

### Product promise

For explicitly eligible order classes only:

“This order names the actual source and limit of funded remedy. If its adopted
adjudication conditions are met, the eligible customer can receive the stated
capped remedy while technical recovery and responsibility continue.”

Automatic advance remedy is not a universal guarantee. It is a narrowly
contracted, capitalized, source-specific service.

### Prerequisites before engineering may enable funds

All of the following must be true before `PRICE`, `GUARANTEE`, or `SETTLE` can
leave shadow/HOLD mode:

1. Stages 1–7 have passed for the target order class, and Stage 8 has also
   passed when that class involves a robot, vehicle, physical actuator, or
   autonomous machine.
2. At least two external providers and three external resource owners have
   adopted the path.
3. At least 30 prospectively registered real orders retain their complete
   attempt denominators; at least two genuine challenges and one externally
   confirmed recovery have traversed the adopted lifecycle.
4. The target delayed-observation horizon has matured for the pilot cohort;
   unobserved tail exposure remains excluded rather than estimated as zero.
5. A named, accepted adjudicator/resolver and appeal path are operational.
6. Qualified legal, regulatory, accounting, tax, sanctions/KYC, security,
   privacy, and actuarial reviews approve the exact jurisdiction, order class,
   customer class, contract, and funds flow.
7. The exact target track has its own external legal and operational source:
   9A requires an executed licensed-custody/payment-partner arrangement and
   source-specific receipt verifier; 9B requires a licensed payment path plus
   documented Outsider balance-sheet capital, board-approved per-order and
   aggregate limits, liquidity, recourse, wind-down, and insolvency treatment;
   9C requires a carrier-issued policy and a carrier-controlled or formally
   delegated claim path. Outsider database accounting is never custody,
   capital, or insurance.

These are minimum operational-plumbing floors, not proof of a stable loss rate,
tail severity, actuarial price, or permission to expand to another order class.

Stage 9 contains three legally and operationally separate tracks. Evidence may
not promote one into another:

- **9A — provider reserve or deposit:** provider funds are actually restricted
  through a licensed custodian/payment partner under adopted release terms.
- **9B — Outsider limited advance:** documented Outsider balance-sheet capital
  is exposed under independent per-order and aggregate caps, recourse, liquidity,
  wind-down, and insolvency rules.
- **9C — licensed insurance:** a licensed carrier issues the policy and bears
  the covered risk. Neither 9A nor 9B may be described or treated as 9C.

### Engineering scope

- Add a funding-source registry with mutually explicit provider commitment,
  provider reserve, provider deposit, Outsider capital, and licensed-insurer
  instruments.
- Integrate reserve/deposit holds and releases through a licensed custodian or
  payment partner; persist external references and verified receipts, never
  secret keys or raw bank credentials.
- Bind every claim to the current order/claim state head, coverage/terms
  version, adjudication result, payee, amount, currency, priority, one-use
  nonce, funding source, and recovery state.
- Implement a limited advance-remedy policy whose per-order and aggregate
  ceilings are independent hard caps. Exhausted or uncertain capital returns
  `HOLD`, never optimistic approval.
- Keep payment, technical recovery, world restoration, delayed consequences,
  recourse, and obligation closure independent and reopenable.
- Integrate a licensed insurer only as an explicitly external issuer. A policy
  is never synthesized from Outsider history or reserve data.

### Exact inputs

- verified target-class order, outcome, recovery, challenge, adjudication, and
  current claim-state head from Stages 1–7, plus the Stage 8 physical profile
  only when the target class is physical;
- external contracts and verifier profiles for provider commitment, reserve,
  deposit, custodian/payment partner, Outsider advance terms, and/or insurer;
- source-verified account/hold/balance/availability receipts at the decision
  time, without treating a local ledger as funds existence;
- payee identity/standing, amount, currency, priority, exclusions, expiry,
  sanctions/KYC state where legally required, and one-use instruction nonce;
- current per-order, provider, cohort, correlation, and aggregate exposure
  ceilings; and
- board/legal/actuarial approval versions and wind-down rules.

### Exact outputs

- source-specific funding instrument record and visible
  `remedyFundingSourceKind`;
- external reserve/deposit hold or release receipt from the licensed custodian
  for 9A only;
- adjudication-bound, one-use payment/advance instruction for 9A or 9B where
  required by the adopted funds flow;
- licensed payment-rail acceptance/rejection and execution receipt for the
  exact applicable track;
- capital/exposure decrement and immutable recourse obligation for 9B where
  applicable;
- technical recovery and world-restoration states left unchanged by payment;
- customer-visible amount, currency, source, cap, exclusions, expiry, status,
  and appeal path; and
- separately versioned insurer-policy reference only when a licensed insurer
  actually issues it.

### Proof and promotion gate

Promotion is per track and never transferable:

- **9A:** a real provider reserve or deposit is held and released by a licensed
  partner under adopted terms, with external reconciliation. Local accounting
  is never called custody.
- **9B:** Outsider actually makes one capped eligible advance through the
  adopted payment path, within documented available Outsider capital and both
  per-order and aggregate board-approved caps, then reconciles recovery and any
  recourse without double payment.
- **9C:** a licensed carrier issues the exact policy and one real eligible claim
  traverses the carrier-controlled or formally delegated claim path. A 9A hold
  or 9B advance cannot satisfy this gate.
- Every promoted track also requires its own real eligible case to traverse the
  adopted adjudication, one-use instruction where applicable, payment or claim
  execution, recovery, and external reconciliation without double payment.
- Concurrent, stale-head, amended-claim, nonce-reuse, duplicate-payee,
  insufficient-funds, custodian-timeout, reversal, partial-payment, and
  split-brain tests fail closed or reconcile without creating money.
- Customer copy identifies the exact funding source; a provider commitment is
  never displayed as funded, and only an insurer-issued instrument is called
  insurance.

### Stop conditions

- Stop 9A or 9B if its required licensed custody/payment partner or valid
  source verifier does not exist.
- Stop 9B if the company cannot document sufficient capital and a credible
  wind-down for the proposed capped advances.
- Stop 9C if no licensed carrier has issued the exact policy or no
  carrier-controlled/formally delegated claim path can be replayed.
- Stop if data are insufficient to bound the order class, severity, dependence,
  or aggregate exposure; `KEEP_BASELINE/HOLD` is the required result.
- Stop if an advance would depend on a global score, pseudo-label, vendor claim,
  server acknowledgement, or model reward.
- Stop if payment is used to erase recovery, appeal, delayed observation,
  affected-party rights, or provider responsibility.
- Stop expansion immediately on reconciliation drift, unauthorized custody,
  capital-limit breach, sanctions/KYC failure, unbounded tail exposure, or
  repeated adjudication inconsistency.

### Authority, capital, and privacy boundary

- **Provider commitment:** duty only; no funds implied.
- **Provider reserve:** provider funds restricted through licensed custody;
  Outsider records the externally verified state and never re-labels a local
  number as funds.
- **Provider deposit:** provider-prefunded collateral with explicit ownership,
  release, return, priority, and shortfall rules through licensed custody.
- **Outsider capital:** Outsider's own balance-sheet money under explicit hard
  caps; it is not customer custody and not insurance.
- **Licensed insurer:** only the licensed carrier issues coverage and bears the
  insured risk; Outsider may provide evidence or administration only within an
  executed, lawful mandate.

Sensitive financial, identity, and case data stay with the appropriate licensed
or authorized party. Network projections contain minimal commitments and
status facts. No raw credentials or account numbers are stored.

### Metrics

- funded orders and claims by exact funding-source kind;
- available, held, released, paid, reversed, recovered, and outstanding amounts
  reconciled to external sources;
- per-order and aggregate capital utilization;
- advance decision, payment, recovery, and recourse latency;
- duplicate/unauthorized payments: exactly `0`;
- local accounting rows presented as custody: exactly `0`;
- payment-triggered obligation closures: exactly `0`;
- insurer-labelled orders without an insurer-issued policy: exactly `0`.

## Stage 10 — federated network scale and governance

### Product promise

“One portable order and remedy process works across agents, robots, service
providers, resource owners, witnesses, resolvers, custodians, and—where
explicitly issued—insurers, without making any one vendor the judge of its own
work.”

### Engineering scope

- Operate a federated Node SDK and conformance program with version negotiation,
  schema registry, revocation, lifecycle, source-aware rights/privacy replay,
  externally anchored heads, anti-equivocation, disaster recovery, and
  replayable exports.
- Recruit anchor reporting nodes: agent runtimes, robot/embodiment platforms,
  resource owners with real write gates, independent outcome/recovery
  witnesses, accepted resolvers, and licensed custodians. Optimize for joined
  roles, not random row volume.
- Establish multi-stakeholder change control, appeal, incident response,
  transparency, data residency, node suspension, wind-down, and fork/successor
  procedures.
- Maintain typed contextual history by principal epoch, deployment revision,
  Claim, World, consequence radius, and observation window. Never publish a
  global AI, model, robot, provider, device, or human score.
- Keep research acquisition/training source-replayed, offline,
  group-disjoint, outcome-blind in its audit reserve, and unable to authorize
  action, credit, CEU, price, guarantee, or settlement.
- Allow a resource owner or external platform to consume typed contextual
  history as one input to its own policy and then issue a fresh, explicit
  authority decision. The history never grants the authority and Outsider never
  widens the owner's decision.

### Exact inputs

- only the exact Stage 9A, 9B, or 9C order classes and instruments that
  independently passed their own engineering and external-fact gates;
- independent node operators for all four anchor roles, with source-specific
  conformance and legal/privacy mappings;
- external transparency anchors and retained anti-equivocation proofs;
- approved schema/governance proposals with impact analysis and supersession
  plan;
- network incident, revocation, challenge, recovery, financial reconciliation,
  and data-rights evidence; and
- jurisdiction- and domain-specific authority/capital/custody registries.

### Exact outputs

- federated network releases and signed schema registry;
- node/audience/revocation registries with externally anchored state heads;
- portable order, challenge, recovery, and funding-source exports;
- conformance and interoperability receipts that establish compatibility only;
- public transparency reports with privacy-safe aggregate and missingness facts;
- typed, contextual reliability/history queries; and
- versioned incident, suspension, recovery, and network-wind-down artifacts.

### Proof and promotion gate

Stage 10 has no “finished” state. A network release remains production-eligible
only while all of the following hold:

- at least two independent nodes serve each critical anchor role needed by the
  active order class;
- no single provider can erase, close, or rewrite an order, challenge, or
  financial reconciliation history;
- external anchors detect rollback and equivocation within the published SLO;
- portability, revocation, recovery, appeal, financial reconciliation, data
  access, deletion/projection withdrawal, and wind-down drills pass;
- every new domain and financial instrument re-enters its own Stage 1–9 gates;
  and
- at least one external platform or resource owner has voluntarily used an
  Outsider order history to issue a new, independently authorized, typed scope
  decision, with the full decision provenance retained; and
- network consequence reach never exceeds committed evidence and durable
  responsibility reach.

### Stop conditions

- Suspend a node on equivocation, stale-source promotion, rights/privacy breach,
  unauthorized authority/custody claim, denominator deletion, or unresolved
  reconciliation drift.
- Freeze domain growth if external owner, witness, resolver, recovery, or
  capital/custody concentration becomes a single point of control.
- Stop any feature that rewards row volume, positive-outcome selection,
  provider self-report, or score optimization over complete episodes and
  durable recovery.
- Never let a governance vote retroactively authorize an action, erase an
  affected party, or close an outstanding obligation.

### Authority, capital, and privacy boundary

Federation does not make authority global. Every action, disclosure,
adjudication, custody, payment, guarantee, and insurance authority stays typed
to its issuer, subject, resource, purpose, jurisdiction, interval, and
revocation state. Capital pools and insurer instruments remain legally and
operationally separate. Public network views are privacy-minimized and
pairwise-pseudonymous by default.

### Metrics

- complete orders joined across anchor roles, not raw rows;
- independent nodes per required anchor role and concentration share;
- cross-provider reuse and owner-requested portability;
- obligation, recovery, challenge, appeal, reopen, and delayed-horizon
  completeness;
- external-anchor freshness and equivocation-detection latency;
- rights/privacy requests completed within policy;
- reserve/deposit/capital/insurer reconciliation by exact source kind;
- network incidents, suspensions, restorations, and wind-down-drill results;
- global scores, silently dropped attempts, or authority minted by conformance:
  exactly `0`.

## Stage 1 implementation order

The current engineering work must begin at Stage 1 and stay narrow:

1. Audit the current frozen source graph and all transitive descendants. Repair
   any P0/P1 provenance break with a versioned successor before adding the order
   projection.
2. Freeze the Stage 1 work-order projection fields, reuse the existing Episode
   as order identity, and derive a domain-separated projection hash. Reuse
   existing identity, delegation, census, Network Intake, outcome, obligation,
   challenge, lifecycle, and anchoring contracts.
3. Keep the completed structural constructor/verifier explicitly low-trust,
   then implement a separate full source-replay verifier with no callbacks,
   tokens, actions, network dereferencing, pricing, or funds paths.
4. Add adversarial focused tests for subject swapping, lane swapping, stale
   heads, omitted attempts, duplicate content occurrences, fake independence,
   caller-positive facts, proxy/accessor poisoning, and post-import mutation.
5. Add an adjacent replay test over the current complete-episode and delayed
   witness fixtures. Assert exact hashes, bytes, occurrence counts, missingness,
   and the permanent `HOLD`/zero-authority/economic boundary.
6. Emit a no-clobber local artifact only after focused and adjacent tests pass;
   record exact predecessor/supersession links and do not alter frozen history.

Stage 1 is complete only after **both** gates pass. The engineering gate
requires the order projection to make the existing network legible without
making it more powerful, independently sourced pin provenance, durable
Attempt-set head and full-ancestry replay, lifecycle and delayed-witness
integration, preservation of every Attempt occurrence, and the actual
source-bound verifier—not the structural self-hash or current caller-pinned
canonical verifier—to pass. The external-fact gate requires the direct-party
dispute confirmation specified above. Only then may Stage 2 make the projection
usable in an existing routine. Real provider duty begins at Stage 3; real owner
authority at Stage 4; recovery at Stage 5; adjudication at Stage 6; and
portability at Stage 7. Stage 8 adds the physical-machine profile as a
domain-specific branch after Stage 7, not as concurrent promotion. Stage 9 may
add funded remedy only for a target order class that has passed Stages 1–7 and,
when physical, Stage 8; its 9A, 9B, and 9C funding tracks remain separately
gated and non-convertible.

## References to current repository contracts

- [`UNIFIED-NORTH-STAR-DELEGATION-RADIUS.md`](./UNIFIED-NORTH-STAR-DELEGATION-RADIUS.md)
- [`OUTSIDER-DATA-NETWORK.md`](./OUTSIDER-DATA-NETWORK.md)
- [`FIRST-REALITY-EPISODE-READINESS.md`](./FIRST-REALITY-EPISODE-READINESS.md)
- [`NETWORK-NODE-SDK-RESEARCH-PREVIEW.md`](./NETWORK-NODE-SDK-RESEARCH-PREVIEW.md)
- [`STAGE4-CLAIMS-LIFECYCLE-FRONTIER.md`](./STAGE4-CLAIMS-LIFECYCLE-FRONTIER.md)
- `src/outsider-actor-identity-envelope.js`
- `src/outsider-action-admission.js`
- `src/outsider-action-obligation-hold-composition.js`
- `src/outsider-reality-obligation-store.js`
- `src/outsider-responsibility-graph.js`
- `src/outsider-network-intake.js`
- `src/outsider-network-node-sdk.js`
- `src/outsider-network-complete-episode.js`
- `src/outsider-network-outcome-witness.js`
- `src/outsider-network-first-governed-reality-episode.js`
- `src/outsider-network-first-governed-reality-episode-v2.js`
- `src/outsider-autonomous-work-order-source-replay-closure.js`
- `src/outsider-episode-attempt-set-local-head-v2.js`
- `src/outsider-autonomous-work-order-lifecycle-outcome-replay-v3.js`
- `src/outsider-autonomous-work-order-stage1-engineering-integration.js`
- `src/outsider-episode-attempt-set-external-head-candidate-v1.js`
- `src/outsider-autonomous-work-order-github-discovery-lifecycle-prerequisite-v2.js`
- `src/outsider-autonomous-work-order-direct-participant-invitation-packet-v1.js`
- `src/outsider-owner-write-gate-conformance.js`
- `src/outsider-stage4-claims-lifecycle-frontier.js`
