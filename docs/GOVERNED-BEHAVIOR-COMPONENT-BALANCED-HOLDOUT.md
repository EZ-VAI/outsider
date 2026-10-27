# Governed behavior holdout estimands

The governed behavior trainer reports two parallel descriptions of its frozen
test split. It does not turn either description into statistical inference,
target-domain transfer, causal evidence, pricing authority, or operational
authority.

## Two observed descriptions and two unestimated targets

`holdout.estimandContract` distinguishes four quantities that must not be conflated:

1. `randomRow` points to the existing row-weighted holdout metrics. A component
   with more rows contributes more weight. These metrics describe only the rows
   in this frozen holdout.
2. `observedKnownCorrelationComponents` points to the component-balanced
   metrics. They are an empirical functional over only the observed frozen-test
   components, aligned with equal marginal row mass from each declared
   known-root connected component.
3. `newKnownCorrelationComponent` has no point estimate. A component sampling
   frame, exchangeability, and generalization to a new component remain
   explicitly unestablished.
4. `newDomain` has no point estimate. Holding out domains during fitting is a
   stress boundary; it does not establish domain exchangeability, transport, or
   target-population performance.

For `K` observed connected components, component `k` containing `n_k` rows gives
each of its rows weight

```text
w_ki = 1 / (K * n_k)
```

Consequently, every observed component has total weight `1 / K`. Log loss and
Brier loss are weighted means under those weights. Ten-bin calibration error
uses the same weights. AUC is the weighted positive-negative concordance
probability, with ties receiving half credit and positive and negative weights
normalized within class. This class-conditional normalization means equal
marginal component mass does not imply equal pairwise AUC contribution from
every component, especially when component class composition differs.

Duplicating an otherwise identical row inside one component changes the legacy
row-weighted description but does not give that component more marginal row mass
in the component-balanced description. This property does not make the
components independent, define a sampling frame, estimate an effective
independent sample size, or turn the empirical functional into expected
performance for a new component.

## No intervals or promotion

Neither metric family produces a confidence interval. The legacy
`naiveRowWilson95IgnoringWithinComponentDependence` key remains present as a
compatibility tombstone but is always `null`; `clusterRobustInterval` is also
`null`. The report keeps all of the following false:

- population inference and exchangeability for a random row;
- population inference or exchangeability for the observed equal-component-mass
  empirical functional;
- a sampling frame, point estimate, exchangeability, or generalization for a new
  known-correlation component;
- target-domain specification, domain exchangeability, transport, and target
  population performance;
- causal interpretation, target transfer, PRICE use, responsibility use, and
  operational authority.

The logistic fit and Platt calibrator remain row-weighted. Component balancing is
only an additional frozen-holdout description; it does not silently change the
training objective or calibration procedure.

## Verification boundary

`verifyGovernedBehaviorTraining` validates the report hash, exact schema,
component support, metric ranges and accounting, weighting declarations, null
intervals, and fixed non-promotion contract. It explicitly does not claim that
metric values were recomputed from source records.

`verifyGovernedBehaviorTrainingAgainstRecords` rebuilds the preregistration,
re-extracts features, reconnects known roots, retrains the model, refits the
calibrator, recomputes both row-weighted and component-balanced metrics, and
requires an exact canonical comparison with the supplied report. A coherently
resealed numeric change can therefore pass the structure-only verifier only when
it remains structurally plausible, but it fails full source replay.

The legacy `trainBehaviorModel` API is unchanged and continues to identify its
random-row validation ceiling. Governed APIs are imported directly from
`src/outsider-governed-behavior-model.js`; they are not re-exported from the
legacy experience barrel.
