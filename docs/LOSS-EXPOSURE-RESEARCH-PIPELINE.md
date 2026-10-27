# Loss / Exposure Research Pipeline

## Status

This is a **local shadow evidence intake**, not PRICE and not an insurance
product. “Shadow” describes its current authority and permitted use, not the
reality of a source. It can preserve empirical real-world incident reports and
signed partner observations while refusing unsupported actuarial inferences.
It can begin accumulating signed partner observations
without silently converting Stage 0.5 benchmark cost, failed-attempt cost,
model-token spend, robot reward, estimated damage, DROID, or another historical
robot corpus into an insurance loss.

The code is intentionally not wired into the public Stage 0.5 package surface
or README. It grants no authority and emits no price, premium, capital,
coverage, payout, guarantee, or settlement.

## What was retained from the Outsiderf mathematical work

The audit covered the Stage 2 external-evidence and actuarial bridge in
`Outsiderf/bridge/src/stage2/external-risk-evidence.js`,
`Outsiderf/bridge/src/model/frontier-actuarial.js`, the V40 audit, and the risk
data/training playbook.

The new boundary retains the useful structure:

- frequency requires a complete exposure denominator, including zero-loss
  windows;
- severity requires observed economic loss, currency, and non-estimated
  accounting/claim/invoice/ledger evidence;
- Beta-Binomial receives window/incident sufficient statistics;
- Gamma-Poisson receives incident count and exposure quantity;
- Bühlmann–Straub receives correlation-component weights and loss numerators;
- TVaR receives currency-isolated, adjudicated severity samples;
- operator, adjudicator, control, domain, system, population, claim, incident,
  and declared dependence roots form connected components before any future
  train/calibration/holdout split;
- the prior research floor of 200 windows, three domains, and 100 components is
  reported, but meeting it does not promote or price anything.

The following old shortcuts were not retained:

- `external`, `L3`, `L4`, founder independence, licence, or training rights
  cannot become true because a row says so;
- two different keys are not treated as two independent entities when they
  share a control root;
- `recordHash` dedup alone is insufficient;
- changing the observing operator cannot change the identity of the observed
  window or economic fact;
- a local allowlist cannot manufacture externally governed evidence.

## Artifacts and flow

Implementation: `src/outsider-loss-exposure-evidence.js`.

1. `signLossExposureObservation` signs one complete exposure window. The
   window contains its population and population-manifest commitments, unit
   definition, positive safe-integer microunits, reporting currency, and zero
   or more observed economic incidents. Zero loss is an empty incident array.
2. `buildLossExposureQuarantine` creates generation 1. It verifies the operator
   signature and trust-policy validity interval, then applies signature-free
   semantic window, overlap, claim, and incident dedup.
3. `appendLossExposureQuarantine` replays the complete prior state before every
   append. It seals an append-only generation and `previousQuarantineHash`, and
   prevents cross-batch resealing, overlapping-window, and repeated-fact
   attacks.
4. `signLossExposureFraudReview` and `signLossExposureAdjudication` bind the
   exact policy, claim set, window commitment, observation, and quarantine
   entry. Operator, adjudicator, and fraud reviewer must have different keys,
   control roots, and domain roots.
5. `buildLossExposureShadowBook` admits only final, closed, exposure-verified,
   population-complete, fraud-clear, appeal-closed research rows. Conflicting
   adjudications exclude the window. It builds correlation components and
   mathematical sufficient statistics, then returns
   `ABSTAIN_NO_EXTERNALLY_GOVERNED_L3_L4`.

Trust stores contain public keys only. Every entry also binds
`policyVersionHash`, `validFrom`, `validUntil`, and `revokedAt`; signature use is
checked at the observation/review/adjudication event time. All current trust
entries are explicitly `conformanceOnly:true`, so even a fully valid local
three-party chain remains L2 local-policy conformance and produces zero L3/L4
rows.

Those event times are signed declarations, not independent timestamps. Until
an external timestamp or membership-authenticated append-only ingest registry
exists, validity/revocation checks provide local policy conformance but cannot
prevent a compromised key from backdating a newly fabricated record.

## Public source boundary

Implementation: `src/outsider-public-risk-source-adapters.js`.

The source catalog encodes three distinct, non-joinable dispositions:

- NHTSA SGO ADS reports: `INCIDENT_ONLY_NO_DENOMINATOR`;
- California DMV disengagement reports:
  `LIMITED_EXPOSURE_WINDOW_NOT_LOSS`;
- OECD AI Incident Monitor: `SOURCE_DISCOVERY_ONLY`.

None may automatically enter the loss/exposure book. NHTSA reporting-entity
submissions do not supply a complete vehicle/mileage denominator, observed
monetary loss, or independent adjudication. California DMV exposure has a
different geography, permit population, ODD, system level, and reporting
regime. The two sources must not be joined unless entity, system, time window,
ODD, and reporting regimes are proven comparable.

### Frozen NHTSA smoke, 2026-08-20

- official CSV bytes: `2,374,527`;
- source SHA-256:
  `sha256:7ed5b160593b1eca85a199a0ae31cd694c952b5adfb99ba9692769d1596e114c`;
- data dictionary SHA-256:
  `sha256:1dd54d93302e8f022e4f703fc902c6ceb9450a6748bf0e4ade9cc1f8cced6da7`;
- raw rows: `1,365`;
- latest unique Report IDs: `1,324`;
- historical/duplicate versions disclosed: `41`;
- reporting entities: `16`;
- derived artifact hash:
  `sha256:2075ed1852f18655fa1e7d956c346e2129bfda395629cae9694f2fe9a98b99d2`;
- source commitment:
  `sha256:8cd43361d77d43503273b3c31e577094b75cac1887640ab38aace28b0323be0a`;
- admitted exposure rows: `0`;
- admitted loss rows: `0`;
- decision: `ABSTAIN_INCIDENT_ONLY_NO_DENOMINATOR`.

The projection retains hashes and bounded categorical incident fields. It does
not persist VIN, serial number, narrative, coordinates, address,
city/state/ZIP, or exact incident time.

## Real public insurance-experience calibration

The separate USDA RMA lane in
`docs/STAGE234-RMA-REAL-INSURANCE-EXPERIENCE.md` adds a materially different
kind of evidence: a source-replayed complete published snapshot with real
policies/units earning premium, zero-reported-loss cells, reported-loss counts,
liability, premium, and publisher-recorded indemnity. It may calibrate
exposure/loss accounting invariants and aggregate amount ratios inside the
U.S. crop-insurance source domain. Its published loss-count rates remain
diagnostics only: numerator-above-denominator cells quarantine frequency
calibration in the frozen 2024 snapshot.

That evidence is empirical administrative insurance experience, not synthetic
research. Its current `ABSTAIN` limits transfer and authority: the aggregate
source has no individual claim identity, paid/reserve/recovery split,
independent adjudication, agent/robot domain linkage, issuer standing, capital,
custody, or settlement authority. It therefore cannot be admitted to the
signed partner loss/exposure book or used as an Outsider price.

## What a future design partner must provide

For every denominator window, including windows with no incident:

- stable source-system, population, window, unit, instrument, and policy
  commitments;
- complete start/end/assignment chronology and a population manifest;
- a positive exposure quantity;
- an operator signature under a time-valid public-key policy;
- rights/licence evidence permitting research use;
- for every alleged loss, a stable incident and claim identity, currency,
  positive gross minor units, bounded recovery, actual economic-loss basis,
  and evidence commitments;
- an independent adjudicator and independent fraud reviewer, with closed
  appeals and distinct control/domain roots.

The first partner batch should be appended, not rebuilt as an unrelated book,
so semantic facts remain deduplicated across time.

## Remaining promotion gates

The pipeline deliberately cannot clear these gates itself:

1. a pinned, externally governed identity/trust registry and revocation feed;
2. an external timestamp or membership-authenticated append-only ingest log;
3. real prospective partner windows with demonstrably complete zero-loss
   denominators;
4. independent adjudication and fraud-review institutions;
5. a correlation-component-safe prospective temporal holdout;
6. sufficient external L3/L4 rows across independent domains;
7. independent actuarial review of Beta-Binomial/Bühlmann–Straub/TVaR
   derivations and tail calibration;
8. legal authority, approved capital custody, policy wording, and settlement
   governance.

Until those exist, the correct output is source-classified empirical/shadow
evidence plus an explicit `ABSTAIN`, not a price. `ABSTAIN` limits the
permitted inference; it does not claim that a real incident record is unreal.
