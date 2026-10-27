# Factor predictive shadow

Use and authority status: source-specific proxy shadow analysis only. This
label limits the inference and product action; it does not relabel recorded
real-software or real-physical observations as synthetic. It has no economic-loss, pricing,
coverage, guarantee, settlement, training, or deployment authority.

This slice is the first place where an explicitly eligible subset of the ten
versioned mechanism/reliability factors is used jointly rather than reported
only as coverage and missingness. It asks a narrow **retrospective** question:
inside one dataset and one compatible native proxy outcome, do end-of-trajectory
structural factors improve an internal group-held-out score over a
Jeffreys-smoothed training-fold prevalence baseline? It is not an ex-ante risk
prediction claim.

Run the five-source replay with:

```sh
node scripts/stage2-factor-predictive-shadow.mjs
```

By default the verified JSON is published as a mode-`0600`, content-addressed
receipt below
`artifacts/factor-predictive-shadow-20260821/receipts/report-<sha256>.json`;
directories created below the repository root are mode `0700`. An identical
default replay reuses the immutable receipt without rewriting it. `--output
PATH` (or `--output=PATH`) selects an explicit destination, which must be in a
subdirectory of the current working directory and must not already exist.
Output-directory symlinks and target symlinks are rejected.

The production entry point accepts source directories and internally reruns the
same pinned Wave 1, Wave 2, BotFails, UR5, and DROID verifiers used by the
actuarial shadow. CUARewardBench Wave 3 remains metadata-only and contributes no
factor or outcome rows. There is no generic caller-record entry point that can
self-declare `FULL_SOURCE_REPRODUCED` and obtain a model. The persisted report
also binds the evaluator, canonicalizer, predictor policy, and exact Node/V8
numeric runtime; changing model code, factor eligibility, or floating-point
runtime changes its D2 instrument identity and requires a fresh replay. The
ordinary persisted verifier checks only sealed
structure and fixed zero-authority fields. The CLI additionally invokes the
source-aware verifier, reopens all five sources, rebuilds every fold and metric,
and requires an exact report match.

## Method

- Cohorts never cross a dataset or native proxy target.
- Predictor eligibility is a separate hashed policy. The outcome-derived
  `post_error_recovery_observed` field and terminal-boundary completion marker
  are permanently excluded. Missing factors are not imputed.
- Each training fold selects only eligible factors that are complete and
  nonconstant in that training fold; test-fold values never select features.
- Disclosed correlation components, not rows, are assigned deterministically to
  five folds. Component/fold identity uses only dataset-scoped disclosed roots,
  never outcomes, factor values, observation hashes, or source-record bytes.
- Each training fold fits an L2-regularized logistic model after training-fold
  standardization. Test rows receive only out-of-fold predictions.
- The comparison is a Jeffreys-smoothed training-fold prevalence baseline.
  Reported AUC, sample Brier score, sample log loss, and balanced accuracy are
  descriptive. Every fit records convergence diagnostics; a singular or
  nonconverged fold forces ABSTAIN.
- Coefficients are fold-standardized associations, not causal effects or global
feature importance.

All currently eligible factors are available only after the trajectory has
finished. They may describe historical executions, but they are not available
before an action begins and cannot drive an admission gate without a separate,
prospectively frozen pre-action feature instrument and temporal validation.

The evaluator abstains with fewer than 40 rows, fewer disclosed components than
folds, one-class truth, or no fully observed nonconstant numeric factor. Because
the disclosed root set is not known complete, even a successful internal group
holdout is not independent external validation. It does not estimate real-world
frequency or calibration. Every cohort is marked population-prevalence and
calibration ineligible. In particular, the Nebius slice was deliberately sampled
as 100 resolved and 100 unresolved trajectories; its AUC and sample Brier score
can describe that slice, but its 50% event fraction cannot estimate deployment
prevalence.

## Loss boundary

All targets remain source-native proxies such as task failure, user
dissatisfaction, or execution anomaly. None is economic loss. The report keeps
`PRICE`, coverage, `GUARANTEE`, `SETTLE`, automatic training, model deployment,
monetary severity, insurance risk, and production readiness false. Real loss
modeling still requires complete exposure windows, zero-loss windows,
independently adjudicated economic severity, correlation-safe temporal/customer
holdouts, and external model review.
