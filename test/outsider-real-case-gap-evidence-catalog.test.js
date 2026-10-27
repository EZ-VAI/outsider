import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildRealCaseGapEvidenceCatalog,
  REAL_CASE_GAP_CATALOG_MINIMUM_AS_OF,
  verifyRealCaseGapEvidenceCatalog,
} from "../src/outsider-real-case-gap-evidence-catalog.js";

const ROOT = path.resolve(import.meta.dirname, "..");

test("all 36 non-local readiness gaps receive an explicit web-evidence treatment", () => {
  const catalog = buildRealCaseGapEvidenceCatalog();
  assert.equal(catalog.asOf, REAL_CASE_GAP_CATALOG_MINIMUM_AS_OF);
  assert.throws(() => buildRealCaseGapEvidenceCatalog({
    asOf: "2026-08-22T00:14:59.999Z",
  }), /REAL_CASE_GAP_AS_OF_PREDATES_ADMITTED_SOURCE/);
  assert.equal(catalog.counts.sources, 45);
  assert.equal(catalog.counts.adapterSourceReplayedLocal, 39);
  assert.equal(catalog.counts.officialBrowsableIdentified, 6);
  assert.equal(catalog.counts.gaps, 36);
  assert.equal(new Set(catalog.gaps.map((row) => row.gapId)).size, 36);
  assert.equal(catalog.gaps.every((row) => typeof row.publicEvidenceCanEstablish === "string"), true);
  assert.equal(catalog.gaps.every((row) => typeof row.targetSpecificRemainder === "string"), true);
});

test("real cases are not downgraded by public origin and do not grant authority", () => {
  const catalog = buildRealCaseGapEvidenceCatalog();
  assert.equal(catalog.evidencePrinciple.realCasesRemainRealCases, true);
  assert.equal(catalog.evidencePrinciple.realExperienceRemainsRealExperience, true);
  assert.equal(catalog.evidencePrinciple.publicOriginAutomaticallyDowngrades, false);
  assert.equal(catalog.evidencePrinciple.outsiderOriginAutomaticallyUpgrades, false);
  assert.equal(catalog.counts.institutionalAuthorityGapsClosed, 0);
  assert.equal(catalog.temporalAuthenticityBoundary.auditCanonicalRelease, "final-v2");
  assert.equal(catalog.temporalAuthenticityBoundary.auditManifestHash,
    "sha256:9ab9517173af2b49f58dddd51a59d3b71ec76bfa6acb10cd5a84c4a426dcd453");
  assert.equal(catalog.temporalAuthenticityBoundary.auditArtifactFileHash,
    "sha256:7a67d1474f67a8fe3c668f78d89096ccd69215aa89e7b782519737353585a44c");
  assert.equal(catalog.temporalAuthenticityBoundary.auditArtifactFileBytes, 50283);
  assert.equal(catalog.temporalAuthenticityBoundary.pinnedTemporalQuarantineReceiptCount, 7);
  assert.equal(catalog.temporalAuthenticityBoundary
    .pinnedTemporallyOrderedCurrentReceiptCount, 9);
  assert.equal(catalog.temporalAuthenticityBoundary
    .temporalQuarantineReceiptsCountedAsCurrentCoverage, false);
  assert.equal(catalog.temporalAuthenticityBoundary
    .catalogReferenceEvidenceCoverageIsCurrentCoverage, false);
  assert.equal(catalog.verificationBoundary.currentCoverageReceiptCountClaimedByCatalogAlone,
    0);
  for (const source of catalog.sources) {
    if (source.state === "ADAPTER_SOURCE_REPLAYED_LOCAL") {
      assert.match(source.localArtifactHash, /^sha256:[a-f0-9]{64}$/);
      assert.equal(typeof source.localArtifactHashKind, "string");
    } else {
      assert.equal(source.localArtifactHash, null);
      assert.equal(source.localArtifactHashKind, null);
    }
  }
});

test("final-v17 temporal candidate remains byte-preserved after its stale capital pin", () => {
  const artifactPath = path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260828/final-v17/catalog.json");
  const bytes = readFileSync(artifactPath);
  const artifact = JSON.parse(bytes);
  assert.equal(bytes.length, 69059);
  assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    "sha256:f5973cd5f94c51d953a38c1d1887fdb21ce41230219c22d468cb937c30e1a56a");
  assert.equal(artifact.catalogHash,
    "sha256:193fb512bfe01422e29a1b375464fac1f12cadfaf4c15876a04ad89eec98ad35");
  const checked = verifyRealCaseGapEvidenceCatalog(artifact);
  assert.equal(checked.ok, false);
});

test("final-v18 binds temporal audit and latest-content quarantined capital v4", () => {
  const artifactPath = path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260828/final-v18/catalog.json");
  const bytes = readFileSync(artifactPath);
  const artifact = JSON.parse(bytes);
  assert.equal(bytes.length, 69059);
  assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    "sha256:cce91100a329ad2d8687945d48e3c8774aa6f9a4ed6ccdc077fe5b9b9fc20eb0");
  assert.equal(artifact.catalogHash,
    "sha256:b690ddeb4a9a01b94938f6558dfe565e4f6703d16eb22e0b05fb88d9c32d6f66");
  for (const sourceId of ["ASB_ASOPS", "SEC_EDGAR_INSURER_XBRL",
    "FDIC_FAILURES_AND_RECEIVERSHIP_DIVIDENDS", "TREASURY_TCMM_COLLATERAL"]) {
    assert.equal(artifact.sources.find((row) => row.sourceId === sourceId).localArtifactHash,
      "sha256:43028caffe868adf1a6019a47ca99513bb964f632de761bb9e64ebe5c3447c7c");
  }
  const checked = verifyRealCaseGapEvidenceCatalog(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "CODE_FIXED_CATALOG_WITH_PINNED_TEMPORAL_AUDIT_REFERENCE_STRUCTURE_ONLY");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.temporalAuditReverified, false);
  assert.equal(checked.currentCoverageReceiptCountClaimedByCatalogAlone, 0);
});

test("Wave5 ROS taxonomy is cataloged with its retrospective rights and pre-action boundary", () => {
  const catalog = buildRealCaseGapEvidenceCatalog();
  const source = catalog.sources.find((row) =>
    row.sourceId === "ROBUST_ROS_WAVE5_TAXONOMY");
  assert.equal(source.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
  assert.equal(source.localArtifactHash,
    "sha256:2d40c4e44a7d9edb37ce15b526c8aa07bdca694db7cece8e9b3437c8307192ad");
  assert.match(source.qualityBoundary, /ROOT_LICENSE_NOT_DETECTED/);
  assert.match(source.qualityBoundary, /RETROSPECTIVE_NOT_A_PREACTION_TARGET_PREDICTOR/);
  assert.match(source.qualityBoundary, /ZERO_TRAINER_PRICE_OR_AUTHORITY_ADMISSION/);
  const rightsGap = catalog.gaps.find((row) =>
    row.gapId === "S15_DATASET_AND_EXPERIENCE_RIGHTS_EVIDENCE");
  assert(rightsGap.sourceIds.includes("ROBUST_ROS_WAVE5_TAXONOMY"));
  const preActionGap = catalog.gaps.find((row) =>
    row.gapId === "S2_PROSPECTIVE_PREACTION_FACTOR_STREAM");
  assert.equal(preActionGap.sourceIds.includes("ROBUST_ROS_WAVE5_TAXONOMY"), false);
});

test("online evidence fills reference phenomena without pretending to adopt Outsider", () => {
  const catalog = buildRealCaseGapEvidenceCatalog();
  const outcome = catalog.gaps.find((row) => row.gapId ===
    "S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS");
  assert(outcome.sourceIds.includes("FDA_MAUDE"));
  assert(outcome.sourceIds.includes("CA_DMV_AV"));
  assert.equal(outcome.referencePhenomenonEvidencePresent, true);
  assert.equal(outcome.outsiderSpecificGapClosed, false);

  const capital = catalog.gaps.find((row) => row.gapId ===
    "S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES");
  assert(capital.sourceIds.includes("SEC_EDGAR_INSURER_XBRL"));
  assert(capital.sourceIds.includes("FDIC_CALL_REPORTS"));
  assert(capital.sourceIds.includes("NCUA_SHARE_INSURANCE_FUND"));
  assert(capital.sourceIds.includes("PBGC_PENSION_INSURANCE"));
  assert.equal(capital.institutionalAuthorityGranted, false);

  for (const sourceId of ["NCUA_SHARE_INSURANCE_FUND", "PBGC_PENSION_INSURANCE",
    "MSHA_ACCIDENT_INJURY_EMPLOYMENT"]) {
    const source = catalog.sources.find((row) => row.sourceId === sourceId);
    assert.equal(source.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
    assert.equal(source.localArtifactHash,
      "sha256:ddc277d4548b097e7053487ae8572385046e7162246175f2a664d1f87be14973");
    assert.equal(source.localArtifactHashKind,
      "NCUA_PBGC_MSHA_COMBINED_CANONICAL_ARTIFACT_HASH");
  }
  assert(outcome.sourceIds.includes("MSHA_ACCIDENT_INJURY_EMPLOYMENT"));

  for (const sourceId of ["CA_DOI_SERFF_RATE_FILINGS", "NCIGF_ASSESSMENT_LIABILITY"]) {
    const source = catalog.sources.find((row) => row.sourceId === sourceId);
    assert.equal(source.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
    assert.equal(source.localArtifactHash,
      "sha256:2ee3625eac2c35e1be5113a78477ac1128d6a663d2e2ee6c66e53570d09b086a");
    assert.equal(source.localArtifactHashKind,
      "CDI_NCIGF_COMBINED_CANONICAL_ARTIFACT_HASH");
  }

  const codex = catalog.gaps.find((row) => row.gapId ===
    "S05_CODEX_NATIVE_ITEM_BINDING_AND_CORRECTION_DELIVERY");
  assert.deepEqual(codex.sourceIds, ["CODEX_APP_SERVER_LOCAL_PROBE"]);
  assert.equal(codex.referencePhenomenonEvidencePresent, true);
  assert.equal(codex.outsiderSpecificGapClosed, false);

  const deepseek = catalog.gaps.find((row) => row.gapId ===
    "S05_OTHER_WORKER_NATIVE_CONTROL_SURFACES");
  assert.deepEqual(deepseek.sourceIds, ["DEEPSEEK_HARNESS_CORDIS_CANARY"]);
  assert.equal(deepseek.referencePhenomenonEvidencePresent, true);
  assert.equal(deepseek.outsiderSpecificGapClosed, false);

  const cbca = catalog.sources.find((row) => row.sourceId === "CBCA_FEMA_ARBITRATIONS");
  assert.equal(cbca.sourceKind, "EXTERNAL_TO_FEMA_IMPARTIAL_ARBITRATION_PANEL_DECISIONS");
  assert.match(cbca.qualityBoundary, /EXECUTIVE_BRANCH_INSTITUTIONAL_INDEPENDENCE_NOT_ESTABLISHED/);
  const adjudicator = catalog.gaps.find((row) => row.gapId ===
    "S4_INDEPENDENT_CLAIMS_ADJUDICATOR");
  assert.match(adjudicator.publicEvidenceCanEstablish,
    /CROSS_INSTITUTIONAL_INDEPENDENCE_NOT_ESTABLISHED_BY_REFERENCE_DATA/);

  const judgmentPayments = catalog.sources.find((row) =>
    row.sourceId === "TREASURY_JUDGMENT_FUND_BIWEEKLY_PAYMENTS");
  assert.equal(judgmentPayments.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
  assert.equal(judgmentPayments.localArtifactHash,
    "sha256:e10699896cd8e7de3ca420f4f7092d4871324110a0a299e8cd9c07f19263109e");
  assert.match(judgmentPayments.qualityBoundary, /COMPONENTS_ARE_NOT_UNIQUE_CLAIMS/);
  const gao = catalog.sources.find((row) => row.sourceId === "GAO_BID_PROTESTS");
  assert.equal(gao.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
  assert.equal(gao.localArtifactHashKind,
    "JUDGMENT_FUND_GAO_CANONICAL_ARTIFACT_HASH");
  assert.match(gao.qualityBoundary, /NOT_AN_OUTSIDER_CLAIMS_APPOINTMENT/);

  for (const sourceId of ["BLS_IIF", "NTSB_ACCIDENT_INVESTIGATIONS"]) {
    const source = catalog.sources.find((row) => row.sourceId === sourceId);
    assert.equal(source.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
    assert.equal(source.localArtifactHash,
      "sha256:da933b03d6ed8c3c56cc80561373f03bb2060b93adce45995eb88f13c8ff4792");
    assert.equal(source.localArtifactHashKind,
      "NTSB_BLS_COMBINED_CANONICAL_ARTIFACT_HASH");
  }

  for (const sourceId of ["ASB_ASOPS", "SEC_EDGAR_INSURER_XBRL",
    "FDIC_FAILURES_AND_RECEIVERSHIP_DIVIDENDS", "TREASURY_TCMM_COLLATERAL"]) {
    const source = catalog.sources.find((row) => row.sourceId === sourceId);
    assert.equal(source.localArtifactHash,
      "sha256:43028caffe868adf1a6019a47ca99513bb964f632de761bb9e64ebe5c3447c7c");
  }

  assert.equal(catalog.sources.find((row) => row.sourceId === "DROID_REAL_ROBOT")
    .localArtifactHash,
  "sha256:1a50d3abe37ef4efc0ded680c53f9f64680cbaf74d4ad8503de460b4bbf8fd5b");

  const nhtsaSgo = catalog.sources.find((row) => row.sourceId === "NHTSA_SGO_ADS");
  assert.equal(nhtsaSgo.localArtifactHash,
    "sha256:550e0ed06c844335960607b53baa0cd8e7ff2a41b8ede4d4f4acd0046360e585");
  assert.equal(nhtsaSgo.localArtifactHashKind,
    "EMPIRICAL_LEDGER_HASH_CONTAINING_NHTSA_SOURCE_REPLAY_PROFILE");

  for (const sourceId of ["FRA_SAFETY_DATA", "PHMSA_PIPELINE_SAFETY"]) {
    const source = catalog.sources.find((row) => row.sourceId === sourceId);
    assert.equal(source.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
    assert.equal(source.localArtifactHash,
      "sha256:faf6c83de86433ad2e97abfb63fca2a1b6045692acd39a8ff56916fcd9082836");
    assert.equal(source.localArtifactHashKind,
      "FRA_PHMSA_COMBINED_CANONICAL_ARTIFACT_HASH");
  }
  assert.match(catalog.sources.find((row) => row.sourceId === "FRA_SAFETY_DATA").qualityBoundary,
    /REPORTED_DAMAGE_IS_NOT_PAID_INCURRED_OR_ULTIMATE_LOSS/);
  assert.match(catalog.sources.find((row) => row.sourceId === "PHMSA_PIPELINE_SAFETY").qualityBoundary,
    /MODEL_AND_PRICE_INPUTS_ARE_MACHINE_DEFERRED/);

  const nhtsaRecall = catalog.sources.find((row) =>
    row.sourceId === "NHTSA_RECALLS_ENFORCEMENT");
  assert.equal(nhtsaRecall.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
  assert.equal(nhtsaRecall.localArtifactHash,
    "sha256:afad74141571a82e40564f7b43bcacb0ccea2671684f3809e4bf4717af069034");
  assert.equal(nhtsaRecall.localArtifactHashKind,
    "NHTSA_RECALL_REMEDY_CANONICAL_ARTIFACT_HASH");
  assert.equal(nhtsaRecall.sourceKind,
    "VEHICLE_RECALL_AND_MANUFACTURER_REPORTED_REMEDY_STATUS_RECORDS");
  assert.match(nhtsaRecall.qualityBoundary, /NOT_AFFECTED_PARTY_RECEIPT/);
  assert.match(nhtsaRecall.qualityBoundary, /OR_ENFORCEMENT_ORDER/);

  const bridgeSourceId
    = "BERKELEY_RAIL_BRIDGEDATA_V2_TFDS_1_0_0_MINIMAL_RECORD_20260822";
  const bridge = catalog.sources.find((row) => row.sourceId === bridgeSourceId);
  assert.equal(bridge.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
  assert.equal(bridge.realityStatus, "CONTROLLED_REAL_EXECUTION");
  assert.equal(bridge.localArtifactHash,
    "sha256:1db2d9b893cdb6cfc604154a787d70092b5a6c03d2122f2b81f56fa9e79e97c2");
  assert.equal(bridge.localArtifactHashKind,
    "BRIDGEDATA_V2_FINAL_V5_CANONICAL_ARTIFACT_HASH");
  assert.match(bridge.qualityBoundary, /EXACTLY_ONE_COMPLETE_TFRECORD/);
  assert.match(bridge.qualityBoundary, /53192_TRAIN_EXAMPLES_AND_1024_TRAIN_SHARDS/);
  assert.match(bridge.qualityBoundary, /ZERO_TRAINER_ROWS/);
  assert.match(bridge.qualityBoundary,
    /FULL_CORPUS_SCHEMA_SEMANTIC_CORRELATION_TARGET_TRANSFER_AND_TRAINING_ADMISSION_ARE_FALSE/);
  assert.match(bridge.qualityBoundary,
    /NO_OUTCOME_FAILURE_ASSIGNMENT_OR_SURVIVAL_EVIDENCE_IS_ESTABLISHED/);

  const waymoSourceId = "WAYMO_SAFETY_IMPACT_DATA_HUB_20260624_CAPTURED_20260822";
  const waymo = catalog.sources.find((row) => row.sourceId === waymoSourceId);
  assert.equal(waymo.state, "ADAPTER_SOURCE_REPLAYED_LOCAL");
  assert.equal(waymo.localArtifactHash,
    "sha256:edccce782d93f0f8f6f01c14f427d44e4137d0b1cf5c040a0c84d0ada9da0a7a");
  assert.equal(waymo.localArtifactHashKind,
    "WAYMO_SAFETY_IMPACT_FINAL_V5_CANONICAL_ARTIFACT_HASH");
  assert.match(waymo.qualityBoundary, /220613000_DISPLAYED_ROUNDED_RIDER_ONLY_MILES/);
  assert.match(waymo.qualityBoundary, /164_PUBLISHED_NAN_TOKENS/);
  assert.match(waymo.qualityBoundary, /DUPLICATE_OUTCOME_LOCATION_AND_BENCHMARK_CONFLICTS/);
  assert.match(waymo.qualityBoundary,
    /RETROSPECTIVE_CALENDAR_SPLIT_IS_NOT_A_PROSPECTIVE_OR_EXTERNAL_TARGET_HOLDOUT/);
  assert.match(waymo.qualityBoundary, /CSV4_202503_IS_NOT_WINDOW_ALIGNED_WITH_CSV1_TO_CSV3_202603/);
  assert.match(waymo.qualityBoundary,
    /UNDERLYING_TRUTH_INDEPENDENT_ADJUDICATION_TARGET_TRANSFER_TRAINING_PRICE_AND_AUTHORITY_ARE_FALSE/);

  const rights = catalog.gaps.find((row) => row.gapId ===
    "S15_DATASET_AND_EXPERIENCE_RIGHTS_EVIDENCE");
  const holdout = catalog.gaps.find((row) => row.gapId ===
    "S2_EXTERNAL_HOLDOUT_AND_CORRELATION_VALIDATION");
  const maturity = catalog.gaps.find((row) => row.gapId ===
    "S4_LONGITUDINAL_CONSEQUENCE_MATURITY");
  assert(rights.sourceIds.includes(bridgeSourceId));
  assert(outcome.sourceIds.includes(waymoSourceId));
  assert(holdout.sourceIds.includes(waymoSourceId));
  assert(maturity.sourceIds.includes(waymoSourceId));
  assert.match(holdout.publicEvidenceCanEstablish,
    /WAYMO_IS_RETROSPECTIVE_ONLY_NOT_A_PROSPECTIVE_OR_EXTERNAL_TARGET_HOLDOUT/);
  const survival = catalog.gaps.find((row) => row.gapId ===
    "S15_REAL_CAUSAL_JUDGE_SURVIVAL_EVIDENCE");
  assert.match(survival.publicEvidenceCanEstablish,
    /BRIDGEDATA_CONTRIBUTES_ONLY_REAL_EXECUTION_SCHEMA_NOT_OUTCOME_FAILURE_ASSIGNMENT_OR_SURVIVAL/);
  const clinical = catalog.sources.find((row) => row.sourceId === "CLINICALTRIALS_GOV");
  assert.equal(clinical.localArtifactHash,
    "sha256:93ae703761d069b7adbdc8ad781cc2ebb1d91b836aa21e027a5f6657f84840a6");
  assert.equal(clinical.localArtifactHashKind,
    "CLINICALTRIALS_POSTED_RESULTS_FINAL_V3_CANONICAL_ARTIFACT_HASH");
  assert.match(clinical.qualityBoundary, /STRIPS_SPONSOR_PERSON_NAMES/u);
  assert.match(clinical.qualityBoundary, /RIGHTS_REMAIN_NOT_ESTABLISHED/u);
  assert.equal(rights.outsiderSpecificGapClosed, false);
  assert.equal(holdout.outsiderSpecificGapClosed, false);
});

test("Outsider-specific execution gaps explicitly reject web substitution", () => {
  const catalog = buildRealCaseGapEvidenceCatalog();
  const current = catalog.gaps.find((row) => row.gapId ===
    "S05_CURRENT_ARTIFACT_R1_R5_CONFORMANCE");
  assert.equal(current.contributionKind, "OUTSIDER_SPECIFIC_EXECUTION_CANNOT_BE_SUBSTITUTED");
  assert.equal(current.referenceEvidenceCoverage, "NO_WEB_SUBSTITUTE_FOR_TARGET_EXECUTION");
});

test("catalog verification is structure-only and coherent reseals fail", () => {
  const catalog = buildRealCaseGapEvidenceCatalog();
  const verification = verifyRealCaseGapEvidenceCatalog(catalog);
  assert.equal(verification.ok, true);
  assert.equal(verification.sourceArtifactsReverified, false);
  assert.equal(verification.webCompletenessEstablished, false);

  const forged = structuredClone(catalog);
  forged.gaps[0].outsiderSpecificGapClosed = true;
  assert.equal(verifyRealCaseGapEvidenceCatalog(forged).ok, false);

  const unboundReplayClaim = structuredClone(catalog);
  const replayed = unboundReplayClaim.sources.find((row) =>
    row.state === "ADAPTER_SOURCE_REPLAYED_LOCAL");
  replayed.localArtifactHash = null;
  replayed.localArtifactHashKind = null;
  assert.equal(verifyRealCaseGapEvidenceCatalog(unboundReplayClaim).ok, false);
});

test("final-v6 catalog has an exact supersession pointer to final-v7", {
  skip: !existsSync(path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260821/final-v6/superseded-by.json")),
}, () => {
  const marker = JSON.parse(readFileSync(path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260821/final-v6/superseded-by.json")));
  const root = path.join(ROOT, "artifacts/real-case-gap-evidence-catalog-20260821");
  for (const side of ["superseded", "canonical"]) {
    const bytes = readFileSync(path.join(root, marker[side].path));
    const catalog = JSON.parse(bytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].fileSha256);
    assert.equal(catalog.catalogHash, marker[side].artifactHash);
  }
  assert.equal(marker.oldArtifactBytesPreserved, true);
  assert.equal(marker.sourceArtifactsReverifiedByThisMarker, false);
});

test("final-v7 catalog has an exact boundary-hardening supersession pointer to final-v8", {
  skip: !existsSync(path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260821/final-v7/superseded-by.json")),
}, () => {
  const marker = JSON.parse(readFileSync(path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260821/final-v7/superseded-by.json")));
  const root = path.join(ROOT, "artifacts/real-case-gap-evidence-catalog-20260821");
  for (const side of ["superseded", "canonical"]) {
    const bytes = readFileSync(path.join(root, marker[side].path));
    const catalog = JSON.parse(bytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].fileSha256);
    assert.equal(catalog.catalogHash, marker[side].artifactHash);
  }
  assert(marker.superseded.reasonCodes.includes(
    "WAYMO_RETROSPECTIVE_HOLDOUT_AND_WINDOW_MISMATCH_BOUNDARY_HARDENED"));
  assert(marker.superseded.reasonCodes.includes(
    "CATALOG_DEFAULT_AS_OF_ADVANCED_TO_LATEST_ADMITTED_SOURCE_CAPTURE"));
  assert.equal(marker.oldArtifactBytesPreserved, true);
  assert.equal(marker.sourceArtifactsReverifiedByThisMarker, false);
});

test("final-v8 catalog has an exact ClinicalTrials supersession pointer to final-v9", {
  skip: !existsSync(path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260821/final-v8/superseded-by.json")),
}, () => {
  const root = path.join(ROOT, "artifacts/real-case-gap-evidence-catalog-20260821");
  const marker = JSON.parse(readFileSync(path.join(root, "final-v8/superseded-by.json")));
  for (const side of ["superseded", "canonical"]) {
    const bytes = readFileSync(path.join(root, marker[side].path));
    const artifact = JSON.parse(bytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].fileSha256);
    assert.equal(artifact.catalogHash, marker[side].artifactHash);
  }
  assert.equal(marker.oldArtifactBytesPreserved, true);
  assert.equal(marker.sourceArtifactsReverifiedByThisMarker, false);
});

test("final-v9 catalog points exactly to privacy-and-rights-hardened final-v10", {
  skip: !existsSync(path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260821/final-v9/superseded-by.json")),
}, () => {
  const root = path.join(ROOT, "artifacts/real-case-gap-evidence-catalog-20260821");
  const marker = JSON.parse(readFileSync(path.join(root, "final-v9/superseded-by.json")));
  for (const side of ["superseded", "canonical"]) {
    const bytes = readFileSync(path.join(root, marker[side].path));
    const artifact = JSON.parse(bytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].fileSha256);
    assert.equal(artifact.catalogHash, marker[side].artifactHash);
  }
  assert(marker.superseded.reasonCodes.includes(
    "CLINICALTRIALS_DERIVED_SPONSOR_PERSON_NAMES_AND_RAW_RECORD_NAME_COMMITMENTS_REMOVED"));
  assert(marker.superseded.reasonCodes.includes(
    "UNREPLAYED_TERMS_AND_DISCLAIMER_RIGHTS_PROMOTIONS_RETRACTED"));
  assert.equal(marker.oldArtifactBytesPreserved, true);
});

test("final-v10 catalog points exactly to the Wave5-integrated final-v11", {
  skip: !existsSync(path.join(ROOT,
    "artifacts/real-case-gap-evidence-catalog-20260821/final-v10/superseded-by.json")),
}, () => {
  const root = path.join(ROOT, "artifacts/real-case-gap-evidence-catalog-20260821");
  const marker = JSON.parse(readFileSync(path.join(root, "final-v10/superseded-by.json")));
  for (const side of ["superseded", "canonical"]) {
    const bytes = readFileSync(path.join(root, marker[side].path));
    const artifact = JSON.parse(bytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].fileSha256);
    assert.equal(artifact.catalogHash, marker[side].artifactHash);
  }
  assert(marker.superseded.reasonCodes.includes(
    "WAVE5_SOURCE_AWARE_ROS_TAXONOMY_LEFT_ASIDE_SOURCE_ADDED"));
  assert(marker.superseded.reasonCodes.includes(
    "RIGHTS_PREACTION_TRAINER_TARGET_PRICE_AND_AUTHORITY_BOUNDARIES_MADE_EXPLICIT"));
  assert.equal(marker.oldArtifactBytesPreserved, true);
});
