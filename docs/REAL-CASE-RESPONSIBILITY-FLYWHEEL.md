# Real-case responsibility flywheel

This flywheel joins the currently frozen public/official real-case lanes without changing what the data are. A real regulatory report remains a real report. A real administrative payment remains a real payment field. A real insurer, receivership, appeal, remedy, or robot/software record remains real experience. Finding those records on the public web does not demote them to synthetic or merely hypothetical data, and collecting a record ourselves would not promote its quality.

In Reality Stewardship, this component is the **external-reality evidence refresh flywheel**: it tracks observations, missingness, and responsibility-case references. It is not the affected resource owner, adjudicator, or closure/reopen authority, and it does not alter the existing stewardship core authority API. That boundary limits what may be done with evidence; it does not downgrade a genuine case or experience because its record was publicly accessible.

The implementation is [`src/outsider-real-case-responsibility-flywheel.js`](../src/outsider-real-case-responsibility-flywheel.js). The command-line entry point is [`scripts/real-case-responsibility-flywheel.mjs`](../scripts/real-case-responsibility-flywheel.mjs).

## What the flywheel binds

The current fixed profile contains sixteen canonical upstream artifacts and twenty-six source-domain lanes:

1. The exact Wave5 source-aware intake snapshot: 49 rows, its manifest and record-set hashes, and the full-source verification commitment over 57 objects.
2. The existing six-lane cross-stage progress artifact: Wave 5 real software, OSHA severe-injury reports selected for robot/AGV language, AIID allowed collections, DOJ/EEOC institutional AI remedies, USDA RMA crop-insurance experience, and CAS Schedule P reserve-development backtests.
3. FDA MAUDE monthly add/change passive-surveillance reports.
4. California DMV AV permits, reporting regimes, selected collision forms, and separately rooted annual test-mile cohorts.
5. FDIC failure and receivership-dividend experience, selected insurer reserve/capital disclosures, Treasury collateral-program structure, and adopted actuarial standards.
6. OpenFEMA NFIP paid-claim transactions, a current exposure snapshot, Public Assistance appeal tracking and selected full decisions, plus the CBCA FEMA arbitration index and selected bodies.
7. CFPB redress allocations/distributions, FTC closed refund programs, and CPSC recall/remedy progress.
8. Six completed NTSB partial-automation investigations with adopted final reports and selected factual docket reports, plus BLS 2024 SOII survey estimates, CFOI census counts and rate exposures, and OIICS 3.03 classifications.
9. Treasury Judgment Fund certification/disbursement process pages and fourteen contiguous 2026 biweekly payment-report workbooks through July 31, plus GAO FY2025 bid-protest annual adjudication aggregates.
10. NCUA 2025 audited Share Insurance Fund experience with a separately labeled preliminary comparator, PBGC 2024 first-installment pension tables plus FY2025 audited program experience, and MSHA reported accident and quarterly employment-exposure exports from 2000 through the frozen 2026 windows.
11. California Department of Insurance filed actuarial exposure/loss experience, rate-filing registry and public-notice records, and a separately framed health-market aggregate; plus NCIGF state/fund/account assessment, refund, statutory calling-capacity, five-year, and inception experience.
12. FRA 2015–2019 Form 54 representative railroad incident reports and separately rooted Form 55 calendar-year operational exposure, replayed through seven byte-pinned canonical query receipts; plus a PHMSA gas-distribution incident archive and schema captured as a real source receipt whose outcome/actuarial use remains machine-deferred.
13. NHTSA post-2010 recall campaigns and manufacturer-reported quarterly/annual remedy-status records, linked by campaign number with right censoring, revisions, population reconciliation differences, and retained source anomalies.
14. BridgeData V2 real Berkeley lab-robot trajectory bytes and publisher TFDS metadata, with exactly one complete decoded record against a published 53,192-example, 1,024-shard train split.
15. Waymo Safety Impact displayed Rider-Only operational exposure, SGO-linked publisher outcome membership and benchmark rows, retained as one non-pooled source-domain reference.
16. ClinicalTrials.gov API v2 registration and posted aggregate-result records for the complete results-first-posted 2026-07-01 query window, retained at NCT study roots without cross-study or cross-term pooling.

Each receipt fixes an artifact role, canonical file byte count and SHA-256, internal artifact hash, source-profile commitment, expected source-aware verification level, and contained lane IDs. A successful full receipt additionally returns the exact resolved artifact path and source path profile used in that invocation; those values are derived from the strictly validated source profile, never from caller verification results. The call first reads and authenticates every required current artifact. It then invokes every upstream source-aware verifier. Those verifiers rebuild their artifacts from the pinned bytes and exact-compare the results. Even a semantically equivalent but byte-different artifact file is not accepted in place of the canonical file. A missing artifact, old/superseded artifact hash, changed source, unknown input field, caller `true` flag, caller result object, callback, or extension fails closed.

The full receipt also binds the code-fixed catalog hash reproduced in the same call and checks that every catalog row counted as locally replayed names an artifact hash admitted by a current flywheel receipt. This authenticates the mapping and local hash linkage, not the browsable-only catalog sources.

The standalone verifier does none of that. It only reproduces the code-fixed structure, quality policy, and 36-gap reference mapping. Its `sourceArtifactsReverified` value is always `false`.

The BridgeData and Waymo upstream standalone verifiers likewise report `FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION`: they accept only their fixed canonical semantic projections and reject unknown nested fields, but still do not authenticate sources. Only their `FULL_SOURCE_REPLAY` calls read the exact source directories and rebuild the canonical artifacts.

## Quality, not collector prestige

Every lane receives the same 23-dimension source-neutral quality assessment used by the real-case quality gate. The dimensions include byte identity, provenance, reality link, population frame, completeness, revision/deduplication, measurement definition, time ordering, exposure denominator, outcome sensing, independent review, economic amount, finality, dependence, causal design, capital measurement, custody execution, standing, rights/consent, target transfer, privacy, and longitudinal maturity.

These are capability-specific vectors, not a publisher prestige score and not a single weighted quality number. For example:

- Wave5 contributes source-replayed session-shape and ROS bug/fix taxonomy
  structure with exact rights and missingness boundaries. All 49 rows are
  retrospective, unavailable pre-action, and ineligible for trainer, target,
  PRICE, or authority use.
- MAUDE supplies real passive-surveillance reports and explicit revision information, but reports are not incidents, the use denominator is absent, underreporting and duplicate risk remain, and deterministic fingerprints remain pseudonymous and potentially linkable.
- DMV supplies real regulated documents and exact legacy mile cohorts, but four selected collision PDFs are not a probability sample, miles are not paired to those cases, permits are not active-vehicle exposure, and the 2026 reporting regime is not pooled with legacy reports.
- NFIP supplies real paid transaction amounts and recovery fields, but the 2026 exposure snapshot cannot be divided into 2024 loss rows, a transaction row is not a proven unique loss, and policy-transaction totals are not policies in force.
- Institutional capital evidence supplies real failure, dividend, reserve, capital, restricted-deposit, collateral-policy, and professional-standard facts. None is Outsider capital, a transaction-level custody acknowledgement, or a professional review of Outsider's exact model.
- CFPB/FTC/CPSC supply real allocation, distribution, cashed-payment, recall, and firm progress fields. Allocation is not recipient receipt, sent is not cashed, program closure is not full recovery, and a firm progress report is not independent outcome sensing.
- NTSB supplies real, completed safety-investigation cases and adopted findings. The six frozen cases are not a statistical population, one final report binds two cases, complete docket bytes are absent, findings do not decide civil liability, and 49 U.S.C. 1154(b) limits civil-damages use.
- BLS supplies real occupational survey estimates, census counts, rate exposures, sampling-error measures, suppression markers, and classification structure. Survey RSE does not measure all error, CFOI counts and CPS rate exposure have different exclusions, repeated rows are not deduplicated, hours use a separate join frame, covariance is absent, and rendered DOM snapshots are not original response bytes.
- Treasury supplies real payment-component amounts and real certification, offset, and disbursement process facts. A component row is not a unique claim or exposure; certification is not disbursement; a published payment is not recipient-bank settlement, claimant acceptance, or complete recovery; exact repeats are retained because they may be separate components or payees.
- GAO supplies real FY2025 administrative adjudication aggregates, including a reported nonimplementation consequence. Filed and closed dockets are different cohorts, routine dismissals are not public, the effectiveness and ADR numerators are absent, no outcome-neutral decision sample is admitted, GAO is external to the procuring agency but is not Article III judicial finality, and a recommendation is not implementation or recovery.
- NCUA supplies real audited source-domain assets, liabilities, net position, reserves, provision, and exposure headlines. Audit scope does not guarantee every underlying event; preliminary monthly highlights remain separate; a reserve is not paid claim loss; and fund assets are not Outsider capital or custody.
- PBGC supplies real plan, participant, financial, benefit, assistance, and repayment aggregates. Plan year, premium year, and fiscal year frames differ; the 2024 workbook is only a first installment; direct benefits, traditional assistance, and special financial assistance are not pooled; and PBGC's claims definition is not target claim severity.
- MSHA supplies real operator/contractor-reported accident cases and employment hours. Accidents extend into 2026 Q3 while exposure ends at Q2, so no current incidence rate is emitted; shared mine/contractor roots do not establish a one-to-one join; self-report is not independent sensing; and sensitive raw narratives remain excluded.
- CDI supplies a real filed medical-malpractice exposure, premium, loss/DCCE, reserve, and proposed-rate record together with real 2025 registry/public-notice records and a separately framed health aggregate. `ASSIGNED`/`ACCEPTED` with no disposition is not approval, proposed or approved change is not charged policy price, the 2001–2010 years are correlated, the registry is not the complete open-filing population, publisher formula caches were not independently recalculated, and the source's one-dollar loss-total reconciliation difference is preserved rather than corrected.
- NCIGF supplies real published guaranty-fund assessment, refund, account-year, and statutory capacity experience. The 2026 Q2 report is partial and has 85 unavailable 2025-premium rows; unlimited or prefunded funds make the reported capacity total incomplete; capacity, authorization, or calling is not cash held or transferred; state/fund/account/year rows are correlated; known coverage gaps are not random; and NCIGF states third-party compilation, estimates, no independent verification, an accuracy disclaimer, and a limited accounting-liability purpose.
- FRA supplies real operator-reported, agency-published source-domain outcome and exposure experience. The admitted incident frame contains 10,449 `JOINTCD=1` representative Form 54 rows for 2015–2019 and excludes below-threshold accountable accidents; Form 55 supplies year-aligned train-mile exposure but not incident-to-exposure row linkage. One identical metric duplicate is removed by the pinned projection. Reported damage is not paid, incurred, or ultimate loss; causes are not independently adjudicated; and the five-year source-domain rates do not transfer to Outsider.
- PHMSA supplies a real captured receipt for a 1,589-row by 468-column operator-submitted gas-distribution incident snapshot and its schema. Original and supplemental rows are not assumed to be unique events. The endpoint is mutable, no publisher version is pinned, latest-population completeness is unestablished, matched annual exposure is absent, and no reuse-license byte is pinned. Consequently, the lane admits receipt description and missingness refinement only: outcome/actuarial model input, frequency, severity, and price admission are all exactly zero/false.
- NHTSA supplies real recall campaigns and real manufacturer remedy-status reports managed and published through an official institutional channel. The status is manufacturer-reported and 2026 is right-censored. Product rows share campaigns, cumulative reports are not independent repairs, potential affected population is not current in-service exposure, and quarterly/annual ratios use different selected cohorts. Population differences and the literal `2099-`, `2022`, and involved/remedied/removed `0/22/584` anomalies remain quarantined and visible. A status row is not affected-party receipt, a remedied count is not an independently verified complete repair, corrective-action text is not execution, and this corpus establishes neither independent cause/loss nor an enforcement/consent order or Outsider remedy.
- BridgeData V2 supplies one real lab-robot trajectory record whose TFRecord CRC, structural fields, shapes, finite floats, booleans, UTF-8 and JPEG headers are checked against pinned publisher metadata. The published 53,192 train examples and 1,024 shards describe the corpus; they are not captured records or trainer rows. The full corpus, record semantics, correlation roots, failures/outcomes, target transfer and production-training right remain unestablished. The training candidate stays on `HOLD` and exactly zero rows enter training.
- Waymo supplies 220.613 million displayed rounded Rider-Only miles, 1,664 publisher SGO-linked outcome-membership rows and benchmark comparisons. It remains separate from every other exposure/outcome lane. The adapter retains three duplicate ID/version pairs, two outcome conflicts, one suppressed-location conflict, 164 literal `NaN` tokens, 544 duplicate dynamic-benchmark rows and 489 benchmark-count conflict keys. CSV4 ends in 2025-03 while the other files end in 2026-03, and the calendar split is retrospective—not prospective or an external target holdout. Publisher replay is real source evidence, not underlying truth, independent adjudication, target transfer, training permission or price.
- ClinicalTrials.gov supplies 18 real sponsor- or investigator-posted study records, all with posted outcome and adverse-event modules, from one complete frozen query window. The 242 outcome rows and 409/514 adverse-event term rows retain NCT study roots and are never pooled across studies, terms, groups, or at-risk periods. The derived artifact strips sponsor/person names and raw-record name commitments. Terms and disclaimer pages are not in the frozen replay, so rights remain `NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED`. NLM quality control is not scientific-accuracy adjudication; posting does not establish intervention causality, target transfer, training permission, price, or authority.

Rights and privacy remain separate from reality. Public access does not establish redistribution, commercial, or automatic-training rights. Conversely, an unresolved reuse right does not make a real recorded event synthetic.

## Mathematical boundary

All descriptive math stays in its native lane, unit, cohort, and correlation root. The artifact explicitly prohibits:

- adding dollars across NFIP, RMA, insurer reserves, receiverships, redress funds, and refunds;
- adding heterogeneous document or report counts into a universal event count;
- treating missing values as zero or censored rows as closed;
- dividing current exposure by historical loss;
- treating self-reports as independent outcomes;
- treating documents as independent cases;
- pooling DMV reporting regimes or CAS entities;
- transferring a source-domain statistic into an AI-agent or robot price, loss, reserve, or capital estimate.

The cross-lane dollar total, record total, frequency, target loss estimate, and target price are therefore all `null`. The admitted advance is finer source-domain factor, quality, missingness, revision, finality, dependence, and lifecycle structure—not an automatic target estimate.

## The 36-gap map

The flywheel reproduces all 36 non-local readiness gaps from the readiness ledger and the code-fixed public-source catalog. For every gap it separates:

- reference phenomena replayed by this flywheel;
- other official/browsable references cataloged but not replayed by this flywheel;
- the target-specific remainder;
- closure credit, target transfer, and authority, all of which remain false.

It also emits a Stage 0.5, 1, 1.5, 2, 3, and 4 reference-progress summary. That summary counts where source-replayed real-world references now improve factor and quality understanding, while keeping target-specific gap closure, stage-transition authorization, and responsibility-bearing authority at zero.

Public real-world evidence can substantially fill the phenomenon, measurement, quality, denominator-pattern, revision, tail, payment, appeal, capital-structure, custody-structure, and recovery-lifecycle parts of a gap. It cannot manufacture an exact Outsider execution, adoption by the affected resource owner, a policy-bound target-domain holdout, standing for affected parties, a licensed issuer, funded Outsider capital, an authorized custodian acknowledgement, or an institution empowered to adjudicate and close/reopen an Outsider obligation.

That is a scope boundary, not a demotion of public data.

## Snapshot loop

Every lane has a fixed next-snapshot instruction. Important scheduled boundaries include:

- acquire the first California DMV enhanced monthly release after 2026-08-26 and the first quarterly release after 2026-09-30, without pooling regimes;
- pin the next FDA MAUDE add/change and limitation pages, then diff stable keys and reassess privacy linkage risk;
- refresh OpenFEMA with start/end and pagination stability checks while keeping current exposure separate from historical claims;
- refresh FDIC endpoints, insurer filings, refund reports, recall APIs, and remedy progress while retaining revisions, right censoring, and missing fields;
- pin new OSHA, AIID, RMA, CAS, software, and institutional-remedy snapshots and diff only stable source-domain roots.
- refresh NTSB completion, docket, report, and recommendation-status roots while retaining the one-report/two-case binding and legal-use boundary;
- pin each next BLS SOII, CFOI, and OIICS release while preserving RSE, suppression, separate denominator frames, classification versions, and series breaks.
- pin each next Judgment Fund report and process snapshot while retaining interval, agency, citation, raw-repeat, privacy, component-versus-claim, certification, disbursement, settlement, acceptance, and recovery distinctions;
- mechanically reparse each next GAO annual table and seek a complete outcome-neutral decision/implementation corpus without treating recommendations as self-executing outcomes;
- pin the next NCUA audited report and monthly comparators, PBGC installments and audited report, and each MSHA Friday refresh while preserving audit scope, heterogeneous time frames, reporting classes, entity roots, revisions, privacy, and aligned-window requirements;
- pin each next CDI filing/registry/public-notice/health snapshot and NCIGF quarterly/five-year/inception snapshot while preserving status-versus-disposition, proposed/approved/charged-price, formula-cache, company/line, partial-year, missing-premium, purpose, disclaimer, state/fund/account/year, and cash/capacity boundaries;
- replay the next FRA canonical-query and metadata/schema snapshot while retaining reporting-threshold, revision, duplicate, operator-correlation, calendar-linkage, and damage-versus-loss boundaries;
- refresh the PHMSA archive receipt, schema, report-status composition, and missingness profile, but keep it machine-deferred until a publisher version, matched annual exposure, stable incident/revision identity, and explicit rights are source-bound.
- replay each NHTSA recall and quarterly/annual status release while retaining manufacturer-reporting, cumulative-row dependence, right censoring, revision, population mismatch, anomaly, affected-party receipt, complete-repair, cause/loss, enforcement/consent, and rights boundaries.
- expand BridgeData only through outcome-blind complete-record selection while materializing provenance/correlation roots and auditing semantics, failures and third-party content; keep trainer rows at zero until governance, rights and target-holdout gates pass.
- replay each Waymo release while retaining displayed-versus-exact miles, duplicate SGO versions, outcome/location conflicts, literal `NaN`, dynamic-benchmark conflicts and file-window mismatch; do not pool or transfer its published factors.

The selected projection is `artifacts/real-case-responsibility-flywheel-20260828/final-v16/flywheel.json`. Its semantic hash is `sha256:0a80bf8bd7ad41fa49423a01ec2af3667510b2fa7dcb0f72a234adf1451fcd77`, serialized hash is `sha256:18655bfce66c23d12c300fc7a9bc88a618bb240b0fcf07ca85a634a1aa358f68`, and size is 644,539 bytes. The old 20260821 final-v10 is preserved as an archived cross-family predecessor and exact-routes only to 20260828 final-v11; markers within the new family then reach final-v16. No old artifact is rewritten or silently replaced.

The flywheel timestamp is also part of the local security profile. `generatedAt` is code-fixed to `2026-08-28T08:40:00.720Z`; it is not caller-selected and is not an external time attestation. Full verification binds catalog final-v18 (`sha256:b690ddeb4a9a01b94938f6558dfe565e4f6703d16eb22e0b05fb88d9c32d6f66`) and the Stage0 temporal audit final-v2 in the same call. Its readiness remains `HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY`: 16 source receipts replay, 9 are temporally ordered references, 7 remain temporal-quarantine references, and quarantine closure/CEU/training/pricing/authority are all zero.

Every refresh repeats the full sequence: freeze bytes and terms, rebuild adapters, exact-compare, update claim-specific quality dimensions, quarantine impurities, perform within-lane math, and seek the still-missing target-specific evidence. Nothing automatically enters training or a responsibility-bearing action.

The pre-machine-token artifact is retained under
`superseded-pre-machine-token-fix/` with a machine-readable `SUPERSEDED.json`
pointer to the current canonical file. That pointer is routing metadata only;
it explicitly does not reverify sources and cannot replace full lane replay.

## Authority ceiling

The flywheel grants none of the following: `TRAIN`, `PRICE`, `GUARANTEE`, `COVER`, `CAPITAL`, `CUSTODY`, `PAY`, `SETTLE`, `EXECUTE`, `CONTROL`, `CLOSE`, or `REOPEN`. It cannot move funds, bind a counterparty, become an owner gate, or declare production readiness.

## Verification example

The full command is intentionally explicit because every source role is mandatory:

```sh
node scripts/real-case-responsibility-flywheel.mjs verify \
  --artifact artifacts/real-case-responsibility-flywheel-20260828/final-v16/flywheel.json \
  --catalog-artifact artifacts/real-case-gap-evidence-catalog-20260828/final-v18/catalog.json \
  --temporal-audit-manifest artifacts/stage0-source-temporal-audit-20260828/final-v2/manifest.json \
  --progress-artifact artifacts/real-evidence-stage-progress-20260821/final-v1/progress.json \
  --wave5-intake-artifact artifacts/public-evidence-wave5-intake-20260821/final-v3/snapshot.json \
  --wave5-source-dir artifacts/public-evidence-wave5-20260821/source \
  --osha-zip artifacts/reality-consequence-osha-20260821/January2015toNovember2025.zip \
  --aiid-archive artifacts/reality-consequence-aiid-20260817/backup-20260817101120.tar.bz2 \
  --aiid-terms artifacts/reality-consequence-aiid-20260817/terms-of-use-20260821.html \
  --institutional-remedy-source-dir artifacts/reality-institutional-ai-remedies-20260821/source \
  --rma-zip artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip \
  --rma-layout artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf \
  --cas-source-dir artifacts/stage234-cas-schedule-p-2025/source \
  --maude-artifact artifacts/fda-maude-outcome-sensing-20260821/final-v2/outcome-sensing.json \
  --maude-source-dir artifacts/fda-maude-outcome-sensing-20260821/source \
  --dmv-artifact artifacts/ca-dmv-av-outcome-sensing-20260821/final-v3/outcome-sensing.json \
  --dmv-source-dir artifacts/ca-dmv-av-outcome-sensing-20260821/source \
  --capital-artifact artifacts/institutional-capital-claims-20260828/final-v4/evidence.json \
  --capital-source-dir artifacts/institutional-capital-claims-20260821/source \
  --fema-artifact artifacts/fema-real-cases-20260821/evidence-v1.0.0.json \
  --fema-source-dir artifacts/fema-real-cases-20260821/source-v3 \
  --remedy-artifact artifacts/remedy-payment-recovery-20260821/evidence-book-final-v1/book.json \
  --remedy-source-dir artifacts/remedy-payment-recovery-20260821/source \
  --ntsb-bls-artifact artifacts/ntsb-bls-real-outcome-20260821/final-v2/outcome-evidence.json \
  --ntsb-bls-source-dir artifacts/ntsb-bls-real-outcome-20260821/source \
  --judgment-gao-artifact artifacts/judgment-fund-gao-real-cases-20260821/final-v1/evidence.json \
  --judgment-gao-source-dir artifacts/judgment-fund-gao-real-cases-20260821/source \
  --ncua-pbgc-msha-artifact artifacts/ncua-pbgc-msha-real-experience-20260821/final-v1/evidence.json \
  --ncua-pbgc-msha-source-dir artifacts/ncua-pbgc-msha-real-experience-20260821/source \
  --cdi-ncigf-artifact artifacts/cdi-ncigf-real-rate-guaranty-20260821/final-v1/evidence.json \
  --cdi-ncigf-source-dir artifacts/cdi-ncigf-real-rate-guaranty-20260821/source \
  --fra-phmsa-artifact artifacts/fra-phmsa-safety-20260821/final-v2/evidence.json \
  --fra-phmsa-source-dir artifacts/fra-phmsa-safety-20260821/source-v2 \
  --nhtsa-recall-remedy-artifact artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json \
  --nhtsa-recall-remedy-source-dir artifacts/nhtsa-recall-remedy-evidence-20260821/source \
  --bridgedata-v2-artifact artifacts/bridgedata-v2-training-evidence-20260822/final-v5/evidence.json \
  --bridgedata-v2-source-dir artifacts/bridgedata-v2-training-evidence-20260822/source-v1 \
  --waymo-safety-impact-artifact artifacts/waymo-safety-impact-evidence-20260822/final-v5/evidence.json \
  --waymo-safety-impact-source-dir artifacts/waymo-safety-impact-evidence-20260822/source-v1 \
  --clinicaltrials-artifact artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json \
  --clinicaltrials-source-dir artifacts/clinicaltrials-posted-results-evidence-20260822/source
```

The success level is `FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE`. It binds source-domain reference evidence to the exact frozen inputs while preserving the 7-receipt temporal quarantine and returning zero target-gap closure credit, training/pricing admission, and operational authority.
