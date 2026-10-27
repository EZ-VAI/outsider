# Public Evidence Ontology

This ontology prevents a recurring category error: **where an observation came
from is not what that observation is allowed to prove**. A source can contain a
real robot action and still be usable only for descriptive research. A source
can contain an empirically recorded agent execution inside a simulator without
becoming either synthetic content or a real-world consequence. A public license
declaration does not create causal, loss, pricing, control, or legal authority.

`src/outsider-public-evidence-ontology.js` freezes three independent evidence
axes plus an independent rights boundary for every public source currently
admitted by the agent, robotics, DROID, and NHTSA adapters.

## The axes do not imply one another

1. `environmentReality` describes the action substrate:
   `ORGANIC`, `REAL_PHYSICAL`, `REAL_SOFTWARE`, `CONTROLLED_REAL_APP`,
   `SIMULATION`, or `SYNTHETIC`.
2. `evidenceAuthority` describes how far the evidence has been checked:
   `SELF_REPORTED`, `PUBLISHER_DECLARED`, `HUMAN_REVIEWED`,
   `SOURCE_REPLAYED`, `PROSPECTIVE`, or `ADJUDICATED`.
3. `permittedUse` says what Outsider permits the source to support:
   `DESCRIPTIVE`, `SHADOW_RESEARCH`, `CAUSAL`, `LOSS`, `PRICE`,
   `PRODUCTION_MODEL`, `AUTOMATIC_TRAINING`, `CONTROL`, `GUARANTEE`, or
   `SETTLE`.
4. `rightsBoundary` independently records the source's license declaration,
   the basis for treating selected bytes as covered, collection/consent
   authority, reuse or training rights, whether the adapter grants rights, and
   whether Outsider makes a legal conclusion.

Two fields within `environmentReality` preserve an additional distinction:

- `observationOrigin` says whether the object is a recorded execution,
  interaction, physical observation, publisher incident report, metadata-only
  object, or generated benchmark.
- `empiricalStatus` says whether the object is an empirical record, publisher
  metadata only, or generated synthetic content.

The core invariant is machine-enforced:

> `SHADOW_RESEARCH` is a permitted use, not a source-reality class.

The same is true of the word “research” generally. Distribution or permitted
use never downgrades a real physical observation to synthetic, and physical
reality never upgrades an observation to causal or actuarial evidence.

## Frozen source audit

| Source | Environment and observation | Evidence authority | Permitted use | Rights boundary headline |
| --- | --- | --- | --- | --- |
| [OpenHands feedback](https://huggingface.co/datasets/OpenHands/openhands-feedback) | `ORGANIC + REAL_SOFTWARE`; recorded interaction; empirical | self-reported, publisher-declared, selected logical replay | descriptive + shadow | pinned MIT declaration; review scope/attribution before reuse |
| [Computer Agent Arena](https://huggingface.co/datasets/xlangai/computer-agent-arena) | `REAL_SOFTWARE + CONTROLLED_REAL_APP`; recorded execution; empirical | publisher-declared, human-reviewed labels, full selected source replay | descriptive + shadow | pinned CC-BY-4.0 declaration |
| [TraceLab](https://github.com/uw-syfi/TraceLab) | `ORGANIC + REAL_SOFTWARE`; recorded interaction; empirical | publisher-declared, full selected source replay | descriptive + shadow | pinned CC-BY-4.0 dataset declaration |
| [SWE-rebench OpenHands](https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories) | `REAL_SOFTWARE + CONTROLLED_REAL_APP`; recorded execution; empirical | publisher-declared, selected logical replay | descriptive + shadow | pinned CC-BY-4.0 declaration |
| [ATBench-Codex](https://huggingface.co/datasets/AI45Research/ATBench-Codex) | `SYNTHETIC`; generated benchmark | publisher-declared, full selected source replay | descriptive + shadow | pinned Apache-2.0 declaration |
| [ATBench-Claw](https://huggingface.co/datasets/AI45Research/ATBench-Claw) | `SYNTHETIC`; generated benchmark | publisher-declared, full selected source replay | descriptive + shadow | pinned Apache-2.0 declaration |
| [tau2-bench](https://github.com/sierra-research/tau2-bench) | `SIMULATION`; recorded execution; empirical | publisher-declared, full selected source replay | descriptive + shadow | pinned MIT declaration |
| [MATM / ALFWorld](https://github.com/kimdanny/matm) | `SIMULATION`; recorded execution; empirical | publisher-declared, full selected source replay | descriptive + shadow | pinned Apache-2.0 declaration |
| [CUARewardBench](https://github.com/Tencent/CUARewardBench) | `REAL_SOFTWARE + CONTROLLED_REAL_APP`; metadata only | publisher-declared, human-reviewed metadata, metadata replay only | descriptive + metadata-only shadow audit | Apache-2.0 metadata/annotation declaration; upstream trajectory rights not claimed |
| [AgentRx τ-retail](https://github.com/microsoft/AgentRx) | `SIMULATION`; recorded execution; empirical | publisher-declared, human-reviewed failure labels, full selected source replay | descriptive + shadow | GitHub MIT declaration and HF CC-BY-4.0 card recorded separately; byte equivalence not established |
| [BotFails](https://huggingface.co/datasets/kantine/BotFails) | `REAL_PHYSICAL`; recorded physical observation; empirical | publisher-declared, human-reviewed frame labels, full selected source replay | descriptive + shadow | pinned Apache-2.0 declarations agree |
| [Guardian/UR5-Fail](https://huggingface.co/datasets/paulpacaud/Guardian-FailCoT-OOD-datasets) | `REAL_PHYSICAL`; recorded physical observation; empirical | publisher-declared, human-reviewed subtask labels, full selected source replay | descriptive + shadow | pinned Apache-2.0 declarations agree |
| [DROID 100](https://arxiv.org/html/2403.12945) | `REAL_PHYSICAL`; recorded physical observation; empirical | publisher-declared, pinned shard/episode derivation | descriptive + shadow | paper declares CC-BY-4.0; GCS object metadata has no license field; scope requires review |
| [NHTSA SGO ADS crash reports](https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting) | `ORGANIC + REAL_PHYSICAL`; publisher incident report; empirical record | self-reported by reporting entities, publisher-declared, official CSV replay | **descriptive incident taxonomy/source discovery only** | no dataset license established; public access is not a reuse/training grant |

All revisions are exact source commits, dataset revisions, or frozen object
hashes. The catalog contains 14 sources and has hash
`sha256:4117c1f3ab69f71b902c91e17c8c283d3087be90e08bcbd61ad3c64f0364ff99`.

## Audit results and hard boundaries

### Real environment is not causal authority

Nine sources have a live software or physical action substrate. None is
admitted for causal effects, loss, pricing, a production model, automatic
training, control, a guarantee, or settlement. Real observations improve
descriptive relevance; they do not supply counterfactual identification,
exposure denominators, independent loss adjudication, or deployment authority.

### Recorded simulation is empirical, not synthetic

tau2, MATM/ALFWorld, and AgentRx contain executions actually recorded from
their declared simulators. They are classified as:

```text
environmentReality.classes = ["SIMULATION"]
observationOrigin = "RECORDED_EXECUTION"
empiricalStatus = "EMPIRICAL_RECORDED"
```

They are not fabricated benchmark rows, but their simulated consequences are
not external real-world side effects. ATBench-Codex and ATBench-Claw are the
only two sources classified as generated synthetic benchmarks.

The historical Wave 2 summary field
`syntheticOrSimulatedBenchmarkRows = 1200` covered the two 500-row ATBench
objects and the 200-row tau2 object but omitted 274 MATM/ALFWorld rows from that
legacy aggregate. The ontology corrects the source-level classification:
MATM/ALFWorld is also simulation. It does not rewrite the frozen historical
artifact or reinterpret any benchmark reward as loss.

### Human-reviewed is not adjudicated

Computer Agent Arena, CUARewardBench, AgentRx, BotFails, and Guardian/UR5 have
publisher-declared human review. None has formal independent adjudication.
CUARewardBench is especially narrow: Outsider has 272 annotation rows covering
122 task components, but zero trajectory bytes, zero trace records, and zero
model/loss/price entrance. AgentRx has complete selected traces and manual
failure labels, but it is failed-only and supplies no failure-rate denominator.

### Source replay is not source truth

Every catalog entry is bound to a replayed selected source object or a pinned
derivation. Replay establishes the declared byte/derivation scope. It does not
prove that publisher labels are correct, that reported incidents are complete,
that a physical collector is authentic, or that the source represents a target
deployment population.

For example, DROID supplies two real-physical episodes from a pinned first RLDS
shard, but no device signature or trusted collection-time attestation.
BotFails supplies 20 selected real-robot episodes and Guardian/UR5 supplies 140
subtask rows; both remain descriptive correlated samples with zero causal or
economic authority.

### NHTSA is consequence evidence without actuarial entrance

The frozen official CSV has SHA-256
`7ed5b160593b1eca85a199a0ae31cd694c952b5adfb99ba9692769d1596e114c`.
Its quarantine contains 1,365 report-version rows and 1,324 unique report IDs
from 16 reporting entities. It is the catalog's closest current source to
organic real-world consequence, but the reports are reporting-entity
submissions, not independently adjudicated claims. The source has no comparable
vehicle/mileage exposure denominator, no observed monetary-loss field, zero
admitted exposure rows, zero admitted loss rows, and no established record-level
training rights. It is therefore descriptive incident taxonomy and source
discovery only—not a frequency, severity, causal, loss, or pricing source.

### Rights are a separate machine field

Every classification has the same explicit top-level shape:

```json
{
  "rightsBoundary": {
    "licenseDeclaration": "...",
    "sourceBytesRightsBasis": "...",
    "consentOrCollectionAuthority": "...",
    "reuseOrTrainingRights": "...",
    "adapterGrantsRights": false,
    "legalConclusion": false
  }
}
```

The adapter never grants rights and never makes a legal conclusion. A public
URL, an official publisher, a human label, a real robot, or a pinned license
declaration cannot promote another axis.

## API and verification

The stable exports are:

```js
import {
  buildPublicEvidenceOntologyCatalog,
  buildPublicEvidenceOntologyClassification,
  listPublicEvidenceOntologySources,
  publicEvidenceOntologyReference,
  verifyPublicEvidenceOntologyCatalog,
  verifyPublicEvidenceOntologyClassification,
  verifyPublicEvidenceOntologyReference,
} from "./src/outsider-public-evidence-ontology.js";
```

`publicEvidenceOntologyReference(sourceId)` returns a compact, hash-bound
reference containing the exact source revision, classification hash, reality
classes, observation origin, empirical status, authority levels, rights hash,
and allowed uses. AgentRx Wave4 embeds this reference in every normalized row,
its manifest, summary, verification, and candidate decision.

Verifiers rebuild the frozen classification instead of accepting a caller's
self-consistent declaration. Re-sealing a row after promoting a real source to
causal/loss authority, promoting a human-reviewed source to adjudicated,
changing simulation to synthetic/real, or claiming rights from the adapter is
rejected.

No actuarial, factor, pricing, training, control, guarantee, or settlement
module is changed by this ontology. Consumers may use it to enforce a stricter
entrance boundary; they may not infer authorization from a reality class.
