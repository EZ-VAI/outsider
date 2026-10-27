# Governed behavior trainer v2

`trainBehaviorModel` remains available for backward compatibility, but it is a
legacy exploratory trainer.  Its deterministic random row split can place the
same executor, task, controller, world, or other correlation root in both train
and test; its test split can be single-class; its v1 featurizer maps missing cost
to zero and missing cost-vs-peer to one; and it uses completed-run fields such as
final cost and success/test claims.  Its metrics therefore do not establish
pre-action prediction, temporal generalization, calibration, or responsibility
readiness.  The legacy return and serialized model metadata now state this
ceiling without removing or changing the existing forecast API.

`trainGovernedBehaviorModel` is a backward-compatible new path with an explicit
v2 contract:

- a hash-bound preregistration carries a declared time earlier than every
  admitted observation and fixes the signal, split fractions, rare-class floors,
  optimizer, and seed; without an external timestamp this proves deterministic
  chronology consistency, not outcome-blind prospective creation;
- every record must have a canonical observation time, a domain, and explicit
  known correlation roots;
- records sharing any root are unioned transitively and the connected component
  is the indivisible split unit;
- train, calibration, and test component intervals must be strictly ordered in
  time, with zero known-root overlap;
- every test domain must be absent from train and calibration by default;
- train, calibration, and test must each meet the preregistered minimum count of
  positive-bearing and negative-bearing known-root connected components; rows
  inside one component cannot manufacture rare-class support;
- every feature is required. Null cost is not zero, and null cost-vs-peer is not
  one; no implicit missing-value imputation is performed;
- exact duplicate record hashes fail closed instead of silently multiplying a
  row's training weight;
- standardization and logistic fitting use train only, Platt calibration uses
  calibration only, and test is used for neither;
- test AUC, log loss, Brier score, ECE, the train-prevalence baseline, and
  reliability bins are recorded as row-weighted descriptive metrics. The
  connected-component count under the declared known-root partition is shown,
  while the effective independent-component count remains null. Reliability
  bins expose only a naive
  row Wilson interval that explicitly ignores within-component dependence;
  cluster-robust intervals and inference remain null/false;
- the model and training report are independently hash-bound.

`verifyGovernedBehaviorTraining` is intentionally structure/hash-only.  The
structure verifier nevertheless exact-locks every fixed governance boundary:
publicly recomputing both model and report hashes cannot promote source truth,
rights, privacy, preregistration, pre-action timing, calibration, uncertainty,
review, authority, split semantics, intended use, or weighting claims. The
schema is exact-key at every critical nested object; component/root/record
counts, label-bearing support, temporal/domain partitions, baseline comparisons,
and model/calibrator numeric shapes are recomputed for internal consistency.
The standalone forecast path applies the same exact model schema and fixed
temporality/intended-use/authority boundary after checking the model hash, so a
coherently resealed model cannot promote itself to pre-action, PRICE, contract,
underwriting, or responsibility use.
This still does not authenticate data-dependent domain assignments or metric
values: the structure receipt says those are not source-reverified. Only the
strong verifier can establish them by exact record replay and retraining. The
strong verifier, `verifyGovernedBehaviorTrainingAgainstRecords`, revalidates the
preregistration, re-extracts features, rebuilds correlation components, retrains
the model, refits calibration, recomputes holdout metrics, and exact-compares the
entire report.  A self-computed JSON hash is not treated as source authentication.
Neither verifier authenticates the collection as real-world evidence or proves
training/privacy rights unless those separate upstream source contracts exist.

This fixes leakage across splits for declared known correlation roots and
strengthens evaluation architecture, but correlation-root completeness remains
unestablished and the current features do not become pre-action factors. They
describe a completed run. The
model card therefore admits only retrospective shadow diagnostics and sets
contract mutation, PRICE, responsibility, and operational authority to false.
The next empirical requirement is timestamped feature snapshots frozen before
the label horizon, followed by a larger prospective multi-domain holdout,
complete correlation-root attestation, an externally timestamped outcome-blind
preregistration, a label-definition/feature-overlap audit, authenticated source
and rights contracts, cluster-balanced or hierarchical fitting with
cluster-robust evaluation, parameter/model-form uncertainty, preregistered
drift controls, and independent review.

Minimal use:

```js
import {
  buildGovernedBehaviorPreregistration,
  trainGovernedBehaviorModel,
} from "./src/outsider-governed-behavior-model.js";

const preregistration = buildGovernedBehaviorPreregistration({
  registeredAt: "2026-09-01T00:00:00.000Z",
});

// Collect only later records carrying governance.observedAt,
// governance.correlationRoots, governance.domainId, and complete features.
const report = trainGovernedBehaviorModel(records, { preregistration });
```

The preregistration timestamp is a declared part of the evidence claim, not an
external time attestation. Backdating or creating it after outcomes is not a
valid substitute for prospective use.
