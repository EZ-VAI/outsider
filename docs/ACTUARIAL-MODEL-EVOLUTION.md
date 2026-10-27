# Stage 2 actuarial model evolution

This layer corrects a structural ambiguity in the prior Stage 2 diagnostics.
The 102 entries in the real-responsibility factor dictionary are real,
source-replayed evidence and useful retrospective diagnostics, but they are not
102 target-model predictors. Eighty-one are post-outcome or post-publication
labels/diagnostics, eight are source-domain exposure descriptors, three are
regime/identity controls, five are responsibility/governance constraints, and
five are source-domain quality/missingness controls: two BridgeData profiles and
three Wave5 session-shape, bug/fix-taxonomy and rights/pre-action profiles.
None is currently an admitted target-domain pre-action predictor.  Data remains
what it is; the restriction is on the proposed use, not on the reality or
collector origin of the data.

`src/outsider-actuarial-model-evolution.js` replaces a flat readiness list with
an executable 59-node estimand-first DAG: 23 core architecture nodes plus 36
gap-specific external-evidence/platform/institutional contract nodes.

1. target observation, pre-action feature, dependence-root, economic-loss, and
   multi-clock data contracts, plus an independent target data-rights, privacy,
   lawful-basis/consent, retention/deletion, and reuse-license gate, an
   independent outcome-sensing/adjudication gate, and a source provenance,
   identity, external-time, version, and revision trust root;
2. blocked candidate frequency, severity, delay/survival, reserve, tail, and
   dependence model nodes;
3. a joint predictive distribution;
4. prospective validation, drift/recalibration, independent actuarial review,
   legal/capital/custody/claims authority, a price/coverage/contract decision,
   actually funded capital-adequacy/custody, and a separate Reality Stewardship
   obligation contract;
5. only then, a responsibility-bearing decision.

The graph is a dependency contract, not a score.  Adding more unrelated source
rows or factors cannot advance a blocked downstream node.

The data-rights gate precedes every target frequency, severity, delay,
reserving, tail, and dependence fit—not merely the joint distribution or final
decision—so processing cannot begin and then seek lawful basis retroactively.
The provenance gate likewise precedes all six target component models,
validation, and final responsibility; schema conformance alone cannot turn a
self-report or post-hoc rewrite into source-aware, externally timed evidence.
The independent outcome/adjudication gate binds target outcome IDs, sensor
provenance and coverage, revision/deduplication, causal attribution or an
explicit non-causal obligation basis, appeal finality, and affected-party
evidence before frequency, severity, delay, validation, or final responsibility.

`promotionProtocol.currentOpenPrerequisites` is an explicitly selected list of
open target-data, data-rights, validation, drift, review, legal-authority,
price/contract, funded-capital, and Reality Stewardship prerequisites.
It is not called a graph root, a cut set, or a minimal set: several entries have
incoming DAG edges, and this module performs no graph-theoretic cut-set or
minimality computation.

The 36-item readiness catalog is executable rather than a loose checklist.
Each gap is joined to its exact frozen readiness-ledger title, closure evidence,
registered source-aware verification interface, readiness category, and
external owner class. That tuple receives a contract hash and its own `MISSING`
DAG node. Each contract node is an incoming prerequisite of one or more core
gates, and node completion uses all-incoming-prerequisites semantics. The
verifier requires all 36 exact IDs, contract nodes, semantic mappings, and paths
to final responsibility. This mapping closes zero gaps and grants no authority.
It preserves, among other exact requirements, immutable-package R1–R5 evidence,
unrelated operators/repositories plus a second machine, engineer-reviewed
platform bounds, jurisdiction-specific exact-product legal classification, a
policy-triggered execution/loss/claim identity, and an idempotently acknowledged
one-use custodian payment rail.

Actuarial and financial readiness cannot bypass Reality Stewardship. The final
responsibility node also requires owner adoption, affected-party standing and
challenge, non-compensable constraints and cumulative budgets, causal
attribution or an explicit non-causal obligation basis, obligation continuity,
and recovery/reopen/closure evidence.

Nor can responsibility bypass data rights or solvency. The target data gate
requires notice, lawful basis, consent, withdrawal and objection where
applicable, minimization, security, purpose limitation, retention/deletion, and
a valid reuse license. A separate price/coverage/contract node must turn the
verified predictive loss distribution into explicit limits, attachment,
retention, coverage, expenses, taxes, risk margin, and contract price. A
price decision cannot precede prospective validation, independent review, or
drift/change governance. A further capital node depends on the validated and
reviewed predictive, reserve, tail, dependence, price/contract, and
legal-authority evidence, and requires both a stated adequacy/stress method and
capital actually funded into segregated custody. A license or custodian alone
does not establish an adequate amount or funding.
Reality Stewardship is also an input to the price/coverage/contract node, so
limits and price cannot be formed first and reconciled with affected-party
standing, non-compensable constraints, cumulative budgets, or obligation terms
only at the final step.

This module is an upstream diagnostic boundary and is not wired into the Stage
2 quote frontier as a rate, relativities table, premium multiplier, capital
input, or approval.  That frontier therefore cannot consume the 102-factor count
or this benchmark as `PRICE` evidence.

Except for the explicitly bounded FRA intercept-only source-domain adequacy
diagnostic below, Outsider has not fitted or validated any target GLM/GAM,
severity, credibility/hierarchical, survival, reserve, tail, dependence, or
joint predictive model.  The seven families are comparison requirements, not
implemented production models.

The benchmark also makes two mathematical assumptions explicit. The exposure
offset form is `log(E[N_i|x_i]) = ... + log(exposure_i)` and is tied to the log
link; it is not a generic-link identity. For compound loss, the product
`E[S|x] = E[N|x]E[Y|x]` is allowed only when claim severities are conditionally
iid and mean-independent of frequency given `x`. Otherwise the architecture
uses the general identity
`sum_n P(N=n|x) sum_{j=1}^n E[Y_j|N=n,x]`. It reduces to
`sum_n P(N=n|x)nE[Y|N=n,x]` only under conditional identical means or
exchangeability. Merely testing dependence does not license either reduction.

## Modern typed contracts

The architecture carries a machine-verifiable `TARGET_SHIFT_AND_OVERLAP`
estimand contract with four distinct evaluation strata: a dependence-root-
disjoint random target row, an observed known component, a new component, and
a new domain. It assumes neither covariate shift, label shift, concept
invariance, overlap, nor transportability. With zero qualified target records,
every stratum estimand, overlap diagnostic, effective sample size, and target
estimate is null.

Calibration uses four non-interchangeable segments: train, probability
calibration, risk-control calibration, and a one-way final test. The contract
also requires an append-only externally sequenced anytime-valid monitor;
target causal/off-policy identification; Aalen–Johansen multi-state and
competing-risk inputs; peaks-over-threshold GPD threshold, declustering, and
tail-dependence diagnostics; distributionally robust sensitivity analysis; and
a typed decomposition of aleatoric, parameter, model-form, measurement,
transfer, causal, and tail/dependence uncertainty. These are gates, not fitted
models. Risk bounds, causal/OPE values, transition and cumulative-incidence
estimates, GPD/tail estimates, DRO bounds, uncertainty totals, target model,
`PRICE`, responsibility, and authority remain null or false.

## Laboratory and professional benchmark

The benchmark is grounded in primary professional standards and original or
professional-primary research:

- [ASOP 23, Data Quality](https://www.actuarialstandardsboard.org/asops/data-quality/)
  informs data selection, review, limitations, and disclosure.
- [ASOP 25, Credibility Procedures](https://www.actuarialstandardsboard.org/asops/credibility-procedures/)
  requires attention to relevant experience and homogeneity before blending.
- [ASOP 43, Property/Casualty Unpaid Claim Estimates](https://www.actuarialstandardsboard.org/asops/propertycasualty-unpaid-claim-estimates/)
  informs reserve method, data, recoverable, and external-condition boundaries.
- [ASOP 53, Estimating Future Costs](https://www.actuarialstandardsboard.org/asops/estimating-future-costs-prospective-propertycasualty-risk-transfer-risk-retention/)
  distinguishes prospective cost estimation from a generic historical ratio.
- [ASOP 56, Modeling](https://www.actuarialstandardsboard.org/asops/modeling-3/)
  informs intended purpose, model risk, holdout validation, governance, and
  controls.
- [CAS Monograph 5 and stochastic-reserving monographs](https://www.casact.org/publications-research/publications/flagship-publications/cas-monographs)
  supply the GLM, ODP bootstrap, reserving GLM, Mack, Bayesian, diagnostic, and
  predictive-testing comparison families.
- [CAS Monograph 16](https://www.casact.org/publications-research/publications/flagship-publications/cas-monographs/monograph-no-16)
  makes nonlinearities, high-cardinality effects, correlated predictors,
  overfitting, and validation explicit.
- Original methods are linked by DOI for
  [Mack prediction error](https://doi.org/10.2143/AST.23.2.2005092),
  [Bühlmann credibility](https://doi.org/10.1017/S0515036100008989),
  [GAM REML](https://doi.org/10.1111/j.1467-9868.2010.00749.x),
  [Kaplan–Meier censoring](https://doi.org/10.1080/01621459.1958.10501452),
  and [strictly proper scoring rules](https://doi.org/10.1198/016214506000001437).

These browsed documents are architecture references, not byte-replayed
empirical training rows.  Citing them does not claim professional conformance,
independent actuarial review, or current operational authority.  Any eventual
operational use must re-check the then-current standards.

## New bounded model-adequacy result

The frozen FRA lane has five matched calendar-year aggregates (2015–2019):
10,449 reported above-threshold incidents and 3,529,396,874 train miles.  The
module fits no target model, but recomputes an intercept-only Poisson exposure-
offset diagnostic:

`N_y ~ Poisson(mu_y); log(mu_y) = beta_0 + log(train_miles_y)`

The Pearson statistic is `42.346533703` on four nominal residual degrees of
freedom, giving a descriptive dispersion ratio of `10.586633426`; the Poisson
deviance is `41.859068457`.  This is a model-misspecification warning, not a
p-value or a claim that negative-binomial, trend, or target-domain parameters
have been identified.  Only five correlated calendar roots are present; the
population is operator-reported and thresholded; no operator-level pre-action
matrix or prospective root-disjoint holdout exists.  The p-value, target
frequency, and price therefore remain null.

## What evolved and what remains

The architecture now prevents factor-count inflation, post-outcome leakage,
silent Poisson adequacy claims, implicit model-family promotion, and evidence-
to-authority jumps.  It gives each source lane a precise contribution: FRA
advances a source-domain rate adequacy diagnostic; CAS advances reserve
backtesting; RMA advances exposure/aggregate-loss contracts; NFIP advances
payment/severity contracts; FEMA advances censoring/latency contracts; NHTSA,
MAUDE, and DMV advance longitudinal status, outcome-sensing, anomaly, and robot
exposure regime contracts.
Wave5 advances only a source taxonomy and missingness-contract reference; its
49 retrospective rows add no target predictor, trainer row, price, or authority.

The exact target observation and pre-action feature contracts, unique
adjudicated loss, multi-clock closure/reopen data, complete dependence roots,
prospective holdout, calibration/drift, qualified independent review, and
lawful target-data use, licensed claims execution, explicit price/coverage/
contract logic, capital adequacy, and actual funded custody remain absent.
Consequently all
target estimates, premium, price, capital, coverage, and authority outputs are
null. The selected final-v11 top-level `generatedAt` is code-fixed build
metadata, not a process-completion time or an external time attestation.
Final-v7 is an archived predecessor and its embedded timestamp is historical,
not current-selection authority.

The canonical local artifact is generated only after authenticating the frozen
real-responsibility math canonical and rebuilding that exact math artifact from
all its sources in the same invocation.  Standalone verification is explicitly
structure-only.

The selected no-clobber local architecture is
`artifacts/actuarial-model-evolution-20260828/final-v11/architecture.json`. It is
bound to responsibility-math final-v14 under the temporal-quarantine HOLD and was rebuilt
and independently verified by full same-call source replay. Its semantic hash
is `sha256:8be9fc278e5efdd02800063f89b4564445feded7ed009340872ebc3f74059f47`;
its file hash is
`sha256:e3f83304edca352befaf689769f3cd79c4ffd8118e54ae00eeed484cc351c53c`
over 253,171 bytes. Its code-fixed `generatedAt` is
`2026-08-28T09:23:48.582Z`. The publisher also
forces the containing directory to `0700` and artifact files to `0600`;
post-build permission hardening does not alter canonical bytes.

The 20260822 final-v1 through final-v7 bytes remain unchanged. An exact
declaration-authorized bridge routes archived final-v7 to 20260828 final-v8;
adjacent same-family markers then reach final-v11. The selected artifact keeps
40 temporal-quarantine reference factors and 62 temporally ordered reference
factors while admitting zero current factors, target predictors, fitted target
models, transfer, pricing, or authority. The code-fixed selector and verifier
therefore reject an old embedded lifecycle claim as current.
