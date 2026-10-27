# Actuarial mechanism shadow research

Use and authority status: shadow analysis only. `PRICE`, coverage, guarantee,
and settlement authority are all false. This is not a statement that the
underlying observations are unreal: the inputs include recorded real-software
agent activity and real-physical robot activity, alongside controlled,
simulated, and generated benchmark data. Source reality, evidence strength,
rights, and permitted inference are separate properties.

## What this slice does

This slice turns the public Agent and robotics corpora into a versioned set of
observable behaviour-mechanism and evidence-reliability measurements. It reports
missingness, disclosed correlation structure, proxy-outcome holdout diagnostics,
fractional-weight sensitivity intervals, and non-monetary proxy event-count tail
sensitivities.

It does **not** turn benchmark success, reward, API spend, robot reward, an anomaly
label, or a failed attempt into economic loss. Without an admissible exposure
denominator and adjudicated monetary severity, frequency × severity, monetary TVaR,
capital, price, and coverage all abstain.

Run the pinned source replay and create the compact receipt with:

```sh
node scripts/stage2-actuarial-mechanism-shadow.mjs
```

The default verified receipt is a mode-`0600`, content-addressed file at
`artifacts/actuarial-mechanism-shadow-20260821/receipts/report-<sha256>.json`.
Directories created below the repository root are mode `0700`; an identical
default replay reuses the immutable receipt without rewriting it. `--output
PATH` (or `--output=PATH`) selects an explicit destination, which must be in a
subdirectory of the current working directory and must not already exist.
Output-directory symlinks and target symlinks are rejected. The compact receipt
binds the full in-memory report and all row/component assignments through hashes
while avoiding a roughly 49 MiB JSON file with repeated factor keys.

## Data used

The current deterministic replay contains 11,017 normalized records:

| Corpus | Rows | Use in this slice |
| --- | ---: | --- |
| Public Agent wave 1 | 9,381 | mechanism counts and native proxy outcomes |
| Public Agent wave 2 | 1,474 | mechanism counts and native benchmark-only outcomes |
| BotFails pilot | 20 | real-physical teleoperation frame structure and manual anomaly labels |
| UR5-Fail execution | 140 | real-physical autonomous-policy execution metadata and source-native manual subtask labels; no trajectory payload |
| DROID first-shard pilot | 2 | real-physical teleoperation action/observation structure; reward is not adjudicated consequence |
| CUAVerifierBench | 0 | explicitly deferred; no factor values invented |
| CUARewardBench wave 3 | 0 | 272 pinned metadata labels / 122 task roots recorded as deferred coverage only; no trace bytes |

Every used corpus is replayed from pinned source bytes by the CLI before modeling.
The exported generic report builder is deliberately measurement-only: a caller
may describe a replay class, but that declaration can never admit a proxy row to
a model. The sole model-admitting entry point accepts known source directories
and re-runs the pinned source verifiers in-process. Persisted report verification
checks sealed structure and zero-authority invariants, but truthfully reports
`sourceArtifactsReverified: false` unless those source directories are replayed
again.
The CLI also invokes the CUARewardBench wave 3 source verifier and binds its
manifest, record-set, summary, and verification hashes into the deferred-source
ledger. That replay proves 272 metadata rows and 122 task-correlation components,
but acquires zero trajectory bytes. Consequently all 272 rows remain outside the
11,017 modeled observations, factor coverage, proxy-outcome cohorts, recovery
evidence, loss data, and training data. Its report entry is
`DEFERRED_METADATA_ONLY_NO_TRACE_BYTES` with `rows: 0` and
`factorCoverage: MISSING_NOT_INGESTED`. CUAVerifierBench remains separately
deferred with no invented factor values.

## Factor dictionary

The dictionary is frozen at version `1.0.0` and includes:

- execution control mode;
- trajectory step count;
- tool-call count and tool-result pairing ratio;
- observed error-event rate;
- agent-turn fraction;
- trajectory duration;
- explicitly exposed post-error recovery;
- action/observation pairing; and
- terminal-boundary presence.

Each value is either `MEASURED`, with its source field and quality, or `MISSING`,
with a reason and null value. There is no imputation.

This dictionary supplements rather than extends the historical 36-factor schema.
It deliberately does not fill privilege, blast radius, reversibility, economic
severity, or other factors that the public projections cannot measure. The schema
hash is emitted in every observation and report.

## Statistical interpretation

### Consequence is not loss

Compatible source-native labels are normalized only into named binary **proxy**
targets such as `TASK_FAILURE_PROXY`, `EXECUTION_ANOMALY_PROXY`, or
`USER_DISSATISFACTION_PROXY`. The original label kind, value, provenance, and lack
of independent adjudication remain attached. BotFails nominal-directory membership
is not treated as success. DROID reward is not treated as outcome or loss.

### Correlation

Rows sharing any disclosed correlation root are connected into a component. The
shadow sensitivity calculation gives each *disclosed* component one total weight.
This is an audit sensitivity, not an effective-exposure bound: missing roots do
not prove that two components are independent, and the actual effective sample
size could be as low as one for an entire cohort. The report therefore fixes
`correlationRootCompletenessEstablished: false`,
`unobservedCrossComponentDependenceModeled: false`, and
`effectiveExposureBoundClaimed: false`. It does not call the component count a
worst case, lower bound, or correlation discount.

The current adapters hash the dataset identity into Agent and public-robotics
correlation roots. Those roots are therefore dataset-local and cannot identify a
provider, model, operator, or infrastructure dependency shared across datasets.
The report explicitly says `crossDatasetCorrelationStatus:
NOT_IDENTIFIED_ADAPTER_ROOTS_ARE_DATASET_SCOPED` and makes no cross-dataset
independence claim. A future globally scoped root must carry an explicit root
domain and be unioned across datasets.

Likewise, the event fraction contributed by each disclosed component is only a
declared-root weighting sensitivity. It is not a worst-case dependence scenario
or an estimate of real-world event frequency.

### Holdout diagnostics and quasi-likelihood sensitivity

Only proxy rows replayed from `FULL_SOURCE_REPRODUCED` artifacts may enter these
calculations. Self-declared or artifact-graph-only rows remain visible as factor
measurements but are counted as excluded and create no consequence model. The
model correlation graph is rebuilt from admitted rows only, so an excluded row
cannot bridge two trusted components and change their weights.

For each compatible full-source dataset/target cohort, the slice reports:

- a Jeffreys-shaped Beta **power-likelihood sensitivity**, not a conjugate
  posterior, because one component may contribute a fractional event weight;
- a 95% sensitivity interval, not a credible interval;
- a Beta-Binomial-shaped quasi-predictive event-count sensitivity for a declared
  horizon, not a validated predictive distribution;
- proxy event-count VaR/TVaR sensitivities, never dollars;
- leave-one-correlation-component-out Brier score, log loss, and ten-bin ECE when
  at least two components and both classes exist; and
- raw per-component counts and proxy fractions for future Bühlmann–Straub work;
  the estimator, VHM, K, and credibility outputs are absent because
  within-component independence is not established.

Most corpora collapse to one disclosed component under the roots currently
available and therefore
abstain even from holdout diagnostics. Nebius has enough disclosed component
separation for a descriptive holdout sensitivity, but not enough evidence to turn
the fractional-weight calculation into a probability posterior or to validate a
Bühlmann–Straub estimator. That is an identification boundary, not a numerical
error.

## What was retained and corrected from the older model

The older `Outsiderf` work contains valuable architecture: frequency and severity
are separated; Bühlmann–Straub credibility reduces small-cell overconfidence;
Beta-Binomial prediction exposes parameter uncertainty; TVaR measures tails; and
portfolio capital must account for correlation.

This slice corrects four unsafe extrapolations:

1. A failed benchmark attempt plus API spend may support a narrowly defined
   “wasted-spend” contract, but it is not evidence of consequential economic harm.
2. Bühlmann–Straub shrinkage can share the same posterior-mean algebra as a Beta
   prior with strength `K`; that does not make the nonparametric credibility model
   “exactly” a full Beta-Binomial distribution.
3. Multiplying proxy failures by an assumed `capitalAtRiskUsd` creates scenario
   dollars, not observed severity or a production price.
4. A common-factor or conditional-independence portfolio model is not validated
   merely because correlation roots exist. Roots identify dependence boundaries;
   they do not estimate dependence strength.

The compact receipt is generated only after the full report hash, every
observation hash, zero-authority boundary, no-loss boundary, correlation claim
boundary, and source-admission mode are checked. Its own verifier can bind back to
the full report. Neither verifier claims to have reopened or authenticated the
underlying source bytes.

The dormant production heads remain architecturally useful, but they cannot be
trained or activated from these public corpora. Required blockers remain: complete
production exposure windows, independently adjudicated economic loss severity,
temporal/customer holdouts and drift tests, independent correlation validation,
licensed actuarial sign-off, and real capital/coverage authority.
