# Empirical Factor Ledger

The empirical factor ledger v2 lets public agent, robot, and incident-report
evidence improve Outsider's taxonomy and factor vocabulary without pretending
that every public row is an independent event, a population exposure, a causal
effect, a financial loss, or a model row. NHTSA reports are real-world empirical
records. Their isolated descriptive authority is a claim boundary, not a claim
that the underlying environment or data is unreal or synthetic.

It is independent of the historical 36-factor risk schema. It binds the public
evidence ontology by hash, replays each selected source, emits source-scoped
factor rows, preserves source-native mechanism categories, and records
consequence proxies without promoting them to harm, loss, liability, price, or
coverage authority. A sixth, isolated `incidentTaxonomyObservations` lane holds
NHTSA reporting-entity submissions and cannot enter the factor, mechanism, or
consequence-truth lanes.

## Three independent axes

Every source profile keeps these questions separate:

1. `sourceReality`: where the observation came from and which payloads were
   actually acquired or decoded.
2. `evidenceAuthority`: which claims are supported by byte identity, source
   replay, publisher annotation, human review, or adjudication.
3. `usePermission`: the declared license scope and the uses allowed by policy.

`SHADOW_RESEARCH` is a permitted use, not an environment class. Likewise,
`REAL_PHYSICAL` does not imply causality or loss, and a permissive license does
not grant evidentiary authority.

The machine gate is a capability vector rather than one `MODEL` boolean. Each
source receives a separate decision for taxonomy update, factor schema and
coverage, descriptive composition and association, discrimination, frequency,
causality, economic severity, price, coverage, guarantee, settlement, and
automatic deployment.

## Current source admission

| Source | Source reality | What enters the ledger | What remains closed |
| --- | --- | --- | --- |
| CUARewardBench Wave 3 | controlled real-app metadata; no trace bytes | process-label topology, declared step count, annotation density, referenced-object coverage, source-native benchmark outcome metadata | trace mechanisms, observed recovery, discrimination, frequency, causality, loss |
| AgentRx Wave 4 | structured API simulation; full selected failed traces | all 39 publisher-annotated failure events, 29 designated roots, trace-shape factors, conditional composition inside the selected failed split | nonfailure comparison, population failure rate, causal root cause, real-world consequence, loss |
| BotFails | real-robot teleoperation; selected Parquet and manual label bytes; sensor payload not decoded | physical context and within-episode manual anomaly morphology for 10 labeled anomaly episodes | treating 10 `normal_train` rows as success, anomaly incidence, sensor-derived mechanism, harm or loss |
| UR5 FailCoT | real autonomous robot execution; 140 selected metadata rows; images not acquired | platform/policy/reference coverage and 71 source-native failed-subtask category events | independent-exposure counts, trace/perception mechanisms, population frequency, harm or loss |
| DROID first shard | real physical historical dataset; exact shard and two numeric episode projections replayed | action/observation coverage and source-scoped numeric kinematic factors | reward as adjudicated outcome, cross-platform pooling, tracking-error claims, frequency, harm or loss |
| NHTSA SGO ADS crash reports | organic real-world physical incident reports; exact official CSV and data-dictionary PDF source replayed | 1,324 latest-version publisher-reported/alleged incident-taxonomy observations, isolated from truth lanes | independent-event counting, predictor factors, causal mechanisms, consequence truth, exposure, frequency, loss, model/training, price, and reuse-rights claims |

The resulting frozen accounting is 463 factor rows, 110 mechanism events, 453
source-native consequence observations, and 1,324 isolated incident-taxonomy
observations. The NHTSA source discloses 1,365 raw report versions, 41
superseded-or-duplicate versions, 1,324 latest identities, and 16
reporting-entity correlation roots. The ledger contains zero independent
incident units, zero admitted economic-loss rows, zero frequency denominators,
zero model or automatic-training rows, zero pricing-eligible rows, and zero
automatic-deployment rows.

## NHTSA incident-taxonomy isolation

The NHTSA lane is reconstructed only after calling the existing CURATE
source-aware replay against the exact official CSV, the exact data-dictionary
PDF, and the operator-signed registry claim. That replay must reproduce the
canonical artifact body and report `sourceArtifactsReverified: true`.

Each latest-version observation binds its privacy-projected source record and
preserves three distinct correlation roots: dataset revision, reporting entity,
and reporting regime. Every observation says that it is publisher-reported and
alleged, not independently adjudicated, and not an independent event unit. The
source profile records `realPhysicalIncidentReportRecorded:true` while fixing
`underlyingExecutionIndependentlyObserved:false`; replay of an official report
is not direct observation of the underlying execution. Its
only admitted evidence capabilities are:

- `TAXONOMY_UPDATE`;
- `FACTOR_SCHEMA_UPDATE`; and
- `DESCRIPTIVE_COMPOSITION` within the frozen reported-incident set.

It contributes zero factor predictors, zero mechanism-occurrence or causal
truth, zero consequence truth, zero exposure denominator, zero frequency, zero
economic loss, zero model or training eligibility, and zero `PRICE` authority.
Public access and source replay do not establish reuse, training, redistribution,
commercial-use, or other record-level rights; those rights remain unresolved.

## AgentRx failed-only semantics

AgentRx is represented as an outcome-conditioned sample:

```json
{
  "design": "OUTCOME_CONDITIONED_FAILED_ONLY",
  "conditionedOutcome": "BENCHMARK_FAILURE",
  "selectedRows": 29,
  "observedNonfailureRows": 0,
  "exposureDenominatorObserved": false,
  "compositionInterpretation": "P_CATEGORY_GIVEN_PUBLISHER_SELECTED_FAILED_SPLIT_ONLY"
}
```

Each of the 39 events preserves the publisher category, actor, step, annotation
ordinal, and whether it is the designated root. `normalizedCategory` stays
`null` and `mappingAuthority` stays `SOURCE_NATIVE_UNMAPPED` until a separately
reviewed, versioned crosswalk exists. Publisher root-cause language is stored as
an annotated failure mechanism, never as an intervention-derived causal effect.

## Physical factor dictionary

Every physical factor declares its value type, unit, measurement scope, source
modalities, minimum evidence, temporality, outcome derivation, pre-action
availability, allowed capabilities, missingness policy, pooling boundary, and
interpretation boundary.

Examples include:

- physical context: execution-control mode, robot platform, policy identity,
  and collection process;
- coverage: steps, declared frames, action/observation pairing, terminal
  boundary, image streams, decoded sensor ratio, image references, and verified
  image-payload ratio;
- manual label morphology: positive-frame fraction, first-onset fraction,
  positive-run count, and label coverage;
- DROID numeric coverage: same-step command/observation deltas, velocity peaks,
  command step deltas, gripper transitions, and index gaps.

DROID timestamps are absent, so control frequency and duration remain missing.
Joint limits, workspace bounds, coordinate frames, and source units are not
verified, so the ledger neither computes proximity factors nor pools numeric
values across platforms. Same-step command/observation deltas are explicitly
not called tracking errors without timing alignment.

## Consequence ladder

Consequences remain at their observed layer:

- benchmark result metadata;
- benchmark failure proxy;
- manual physical-anomaly proxy;
- manual physical-subtask outcome proxy; or
- recorded reward with uninterpreted semantics.

Every consequence record fixes affected-party observation, causal attribution,
counterfactual identification, physical-effect magnitude, economic loss,
currency, and liability adjudication to absent unless separately established.
No automatic upward promotion is permitted.

## Hard gates

Verification fails if any source opens frequency, causality, severity, price,
coverage, guarantee, settlement, or automatic deployment. It also fails if:

- a failed-only, case-control, convenience, or correlated-subtask sample gains
  an exposure denominator;
- Wave 3 referenced objects become acquired trace bytes;
- BotFails nominal-train membership becomes a success/anomaly label;
- a publisher root category becomes a causal or normalized category without a
  reviewed crosswalk;
- DROID reward becomes loss, or numeric source units are treated as compatible;
- missing values are zero-imputed;
- provenance roots are treated as statistical dependence roots; or
- any source-native consequence is promoted to harm, loss, liability, price,
  or coverage;
- an NHTSA report is promoted to an independent event, denominator, loss,
  predictor, causal mechanism, consequence truth, model/training row, or price;
- NHTSA public access is promoted to established reuse or training rights; or
- an NHTSA incident-taxonomy record-set commitment no longer matches its rows.

Ordinary `verifyEmpiricalFactorLedger` is deliberately
`SELF_SEALED_STRUCTURE_ONLY`: it validates schema, hashes, accounting, joins,
and hard boundaries, but reports `sourceArtifactsReverified: false`. A fully
re-sealed value can still be only an operator claim. Source trust requires
`replayEmpiricalFactorLedger`, which rebuilds all six sources; cross-lane
`sourceRecordHash` mismatches between factor, mechanism, and consequence rows
are rejected even by structural verification.

## Reproduction

Build a new ledger from the six exact local source sets:

```sh
node scripts/stage2-empirical-factor-ledger.mjs \
  --output artifacts/empirical-factor-ledger-v2-nhtsa-observation-boundary-20260821/ledger.json
```

The output path is created with exclusive-write semantics; an existing file is
not overwritten. Replay the artifact against every source byte:

```sh
node scripts/stage2-empirical-factor-ledger.mjs \
  --replay artifacts/empirical-factor-ledger-v2-nhtsa-observation-boundary-20260821/ledger.json
```

The NHTSA paths default to the frozen all-evidence-v2 registry and the exact
CSV/PDF under `artifacts/stage2-source-20260820`; CLI flags can override them for
replay tests. The replay must report `FULL_SIX_SOURCE_REPRODUCED`,
`sourceArtifactsReverified: true`, and the same ledger hash.
