# Stage 1.5 CEU and experience-reuse frontier

Status: local engineering gate, source-bound and externally anchorable. It has
no claimed external adoption or institutional authority. It never performs a
model update and never enables automatic training, PRICE, GUARANTEE or SETTLE.

## Evidence reality and evidence authority are separate

An observation can come from a real software or physical environment and still
be insufficient for a causal-experience-unit (CEU). The gate does not call real
observations synthetic merely because their permitted use is descriptive,
shadow or research. It asks a separate question: was this exact experience
created under a prospective controlled design, completely executed, and then
adjudicated by an independent governed role?

The current source paths are replayed as follows:

| Existing path | Replayed verifier | Source character retained | CEU result |
| --- | --- | --- | --- |
| CURATE historical episode | `verifyCurateEpisode` | empirical source projection; it may describe a real environment | always 0: no verified prospective controlled design and independent adjudication |
| Stage 1 corpus artifact set | `verifyCorpusArtifactSet` | full-source retrospective evidence or publisher metadata, as declared by its verified adapter | always 0; metadata-only inputs are separately identified |
| Stage 0.5 contribution record | `verifyContributionRecord` | empirical recorded software-run projection | always 0: retrospective/self-attested contribution is not prospective causal evidence |
| Prospective simulation pilot | `verifyProspectiveSimulationPilot` | an actually executed trace in a simulated environment | always 0: protocol conformance is not real prospective execution |

`assessExistingSourceForCeu` produces a content-addressed zero-CEU assessment
for these verified sources. Historical, metadata and simulated artifacts have
no caller-controlled promotion route.

The existing `outsider-experience.js` behavior estimator/trainer and
`outsider-supervised-experience.js` model-input projection predate this gate.
They are useful local Stage 0.5 engineering paths, but they do not consume CEUs
and are not evidence that a reuse policy was enforced. The new frontier does
not silently relabel their historical inputs or claim to govern every direct
library call. Any future production update path must adopt the durable ingress
decision as a mandatory precondition; that adoption has not happened here.

## Prospective evidence chain

A policy-conformance CEU candidate requires all of the following:

1. a governance policy signed by a separately supplied, pinned Ed25519 root;
2. distinct policy-pinned keys and organization hashes for design registration,
   execution attestation and independent adjudication;
3. a preregistered controlled design created before its execution window;
4. a complete execution receipt binding the exact result dataset hash and
   source checkpoint hash;
5. an admissible adjudication after execution, binding the same design,
   execution, dataset, checkpoint and validity domain; and
6. successful replay of every signature, hash and time ordering rule.

The ledger calls any resulting unit a **configured-policy conformance unit**.
Its fixed boundary says that it is not a globally authoritative CEU and that
external governance adoption is not established. Supplying locally generated
test keys can demonstrate protocol closure, but cannot establish the truth of a
real execution, rights or institutional independence.

## Global discovery, confirmation and reuse accounting

The durable ledger compares each admissible evidence bundle against all prior
admissible bundles:

- the same claim identity or any shared correlation root is correlated reuse;
- the same semantic claim with disjoint identities and roots is confirmation;
- only a new semantic claim with a new identity and disjoint roots is discovery;
- an exact evidence hash is idempotent; and
- the same design, dataset or checkpoint bound to a different evidence bundle
  is a conflict and is refused.

The default signed policy assigns one unit to the first discovery and zero to
confirmation and reuse. A different confirmation or reuse value is accepted
only when it is inside the signed policy whose governance root was explicitly
pinned when the ledger was opened. Rejected adjudications receive zero and do
not preempt a later admissible discovery.

Hash equality is not a universal semantic oracle. The claim semantic hash and
correlation roots must come from the governed preregistration process. External
normalization, dispute resolution and institutional adoption remain external
gaps.

## Rights and model-update ingress

An admissible causal record does not itself permit learning. Before the local
ingress can return `ADMIT_MANUAL_UPDATE_CANDIDATE`, it replays:

- a signed learning diet bound to the evidence, dataset, source checkpoint,
  validity domain and original learning-diet intent;
- exact allowlists for model hash, base checkpoint hash and candidate
  checkpoint hash;
- a signed rights grant bound to the same artifacts and Reality boundary;
- the policy, diet and grant validity windows;
- every signed revocation effective at the request time;
- the grant's maximum admission and distinct-model budgets; and
- candidate-checkpoint uniqueness across prior admitted requests.

Every ingress decision is content-addressed. It issues and consumes zero CEUs,
performs no update, disables automatic training and authorizes no deployment or
financial stage. Replaying an already recorded request returns a HOLD with no
new update authority, even when its historical decision was an admission.

Revocation blocks future ingress but does not erase historical evidence or its
credit record. Reports distinguish historically admitted candidates from
candidates whose grant is still active and unrevoked at the requested `asOf`
time.

## Durability and conflicts

`DurableCeuReuseFrontier` stores canonical artifacts, an Ed25519-signed
append-only event chain and a signed materialized index. A single-writer `wx`
lock prevents concurrent mutation. Artifact files are written exclusively,
events are fsynced before index replacement, and a writer can recover only a
valid signed event suffix from a previously verified signed index prefix.

The implementation and adversarial tests cover:

- exact append idempotency;
- semantic, identity and correlation-root deduplication;
- design/dataset/checkpoint conflicts;
- request-ID and candidate-checkpoint conflicts;
- write-lock exclusion and no event mutation on lock failure;
- signed-index recovery after a committed event suffix;
- source, model, checkpoint, validity-domain and learning-diet substitution;
- reuse-budget exhaustion; and
- signed revocation before a later ingress attempt.

## Verification CLI

The verifier needs no ledger operator private key. It does require the external
trust decision to be explicit by supplying the governance policy and at least
one pinned governance root key ID:

```sh
node scripts/stage15-ceu-reuse-frontier.mjs \
  --directory /path/to/ceu-ledger \
  --governance-policy /path/to/governance-policy.json \
  --pinned-governance-key-id ed25519:sha256:... \
  --as-of 2031-01-03T00:00:00.000Z
```

`--out FILE` writes canonical JSON with no clobber. The report binds the policy,
config, signed index and event-chain head and repeats the fixed authority
boundary.

## What remains external

This closes the locally implementable duplicate/reuse ledger and enforcement
interface. It does not establish:

- that a governance root is adopted by an independent institution;
- that role organizations are independent in fact rather than in the signed
  registry;
- a real prospective device/control run;
- externally verified rights to create and reuse the experience;
- live upstream revocation or institutional enforcement; or
- production model integration.

Those facts must arrive as externally governed evidence. Caller booleans,
self-generated keys and public availability cannot close them.
