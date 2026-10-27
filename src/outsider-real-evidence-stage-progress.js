/*
 * Cross-stage, source-aware real-evidence progress projection.
 *
 * The six inputs below are observations from real software, physical,
 * regulatory, institutional, and insurance environments.  Their reality is
 * preserved without converting publication into causality, loss authority,
 * rights, pricing authority, or responsibility-bearing readiness.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT,
  PUBLIC_EVIDENCE_WAVE5_SOURCE_OBJECT_PINS,
  ROBUST_ROS_WAVE5_PIN,
  TRACE_COMMONS_WAVE5_PIN,
  verifyPublicEvidenceWave5Result,
  verifyPublicEvidenceWave5Source,
} from "./outsider-public-evidence-wave5.js";
import {
  buildOshaSirRobotConsequenceBookFromZip,
  OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821,
  verifyOshaSirRobotConsequenceBookFromZip,
} from "./outsider-reality-consequence-evidence.js";
import {
  AIID_FROZEN_SOURCE_20260817,
  buildAiidSnapshotEvidenceFromArchive,
  verifyAiidSnapshotEvidenceFromArchive,
} from "./outsider-aiid-snapshot-evidence.js";
import {
  buildInstitutionalAiRemedyEvidenceFromSource,
  verifyInstitutionalAiRemedyEvidenceAgainstSource,
} from "./outsider-institutional-ai-remedy-evidence.js";
import {
  buildRmaCropInsuranceExperience,
  RMA_SOB_COVERAGE_FROZEN_SOURCE_2024,
  verifyRmaCropInsuranceExperienceWithSource,
} from "./outsider-rma-crop-insurance-experience.js";
import {
  buildCasSchedulePReserveCalibration,
  CAS_SCHEDULE_P_FROZEN_FILES,
  CAS_SCHEDULE_P_SOURCE_PAGE,
  verifyCasSchedulePReserveCalibrationWithSource,
} from "./outsider-cas-schedule-p-reserve-calibration.js";

export const REAL_EVIDENCE_STAGE_PROGRESS_SCHEMA
  = "outsider/real-evidence-stage-progress/v1";
export const REAL_EVIDENCE_STAGE_PROGRESS_GENERATED_AT
  = "2026-08-21T13:00:00.000Z";

const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_OSHA_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_RMA_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_LAYOUT_OR_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_CAS_FILE_BYTES = 32 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail == null ? `REAL_EVIDENCE_PROGRESS_${code}`
    : `REAL_EVIDENCE_PROGRESS_${code}:${detail}`);
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256").update(
    `${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("TIME_INVALID");
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function freezeJson(value) {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freezeJson(item);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requiredPath(value, code) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail("SOURCE_PATH_INVALID", code);
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) fail("SOURCE_PATH_TOO_BROAD", code);
  return resolved;
}

function stableRead(filePath, maximumBytes, code) {
  const resolved = requiredPath(filePath, code);
  let descriptor;
  try {
    descriptor = openSync(resolved, fsConstants.O_RDONLY
      | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(maximumBytes)) {
      fail("SOURCE_FILE_INVALID", code);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || bytes.length !== Number(before.size)) fail("SOURCE_FILE_CHANGED", code);
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sourcePaths(value) {
  const top = ["wave5", "osha", "aiid", "institutionalRemedies", "rma", "cas"];
  if (!exactKeys(value, top)
    || !exactKeys(value.wave5, ["traceCommonsDirectory", "robustRosDirectory"])
    || !exactKeys(value.osha, ["archivePath"])
    || !exactKeys(value.aiid, ["archivePath", "termsSnapshotPath"])
    || !exactKeys(value.institutionalRemedies, ["sourceDirectory"])
    || !exactKeys(value.rma, ["archivePath", "recordLayoutPath"])
    || !exactKeys(value.cas, ["sourceDirectory", "sourcePagePath"])) {
    fail("SOURCE_PATH_PROFILE_INVALID");
  }
  return Object.freeze({
    wave5: Object.freeze({
      traceCommonsDirectory: requiredPath(value.wave5.traceCommonsDirectory,
        "WAVE5_TRACE_DIRECTORY"),
      robustRosDirectory: requiredPath(value.wave5.robustRosDirectory,
        "WAVE5_ROBUST_DIRECTORY"),
    }),
    osha: Object.freeze({ archivePath: requiredPath(value.osha.archivePath,
      "OSHA_ARCHIVE") }),
    aiid: Object.freeze({
      archivePath: requiredPath(value.aiid.archivePath, "AIID_ARCHIVE"),
      termsSnapshotPath: requiredPath(value.aiid.termsSnapshotPath, "AIID_TERMS"),
    }),
    institutionalRemedies: Object.freeze({
      sourceDirectory: requiredPath(value.institutionalRemedies.sourceDirectory,
        "INSTITUTIONAL_REMEDY_DIRECTORY"),
    }),
    rma: Object.freeze({
      archivePath: requiredPath(value.rma.archivePath, "RMA_ARCHIVE"),
      recordLayoutPath: requiredPath(value.rma.recordLayoutPath, "RMA_LAYOUT"),
    }),
    cas: Object.freeze({
      sourceDirectory: requiredPath(value.cas.sourceDirectory, "CAS_DIRECTORY"),
      sourcePagePath: requiredPath(value.cas.sourcePagePath, "CAS_PAGE"),
    }),
  });
}

const WAVE5_SOURCE_PIN_SET_HASH = domainHash(
  "outsider/real-evidence-stage-progress/wave5-source-pins/v1",
  PUBLIC_EVIDENCE_WAVE5_SOURCE_OBJECT_PINS);

const FROZEN_LANES = freezeJson([
  {
    laneId: "WAVE5_REAL_SOFTWARE",
    sourceReality: ["ORGANIC", "REAL_SOFTWARE"],
    sourceProfile: {
      traceCommonsRevision: TRACE_COMMONS_WAVE5_PIN.revision,
      robustRosRevision: ROBUST_ROS_WAVE5_PIN.revision,
      robustRosTree: ROBUST_ROS_WAVE5_PIN.tree,
      sourcePinSetHash: WAVE5_SOURCE_PIN_SET_HASH,
      manifestHash: "sha256:358724f389a6746e599deec9705c376aa946e228e77a7777fc91ebf30d82dcce",
      recordSetHash: "sha256:c9ac0aebbf70429db0d4a07c94c3b7dd1833faa2a7df72470e6fb08c3a9c4939",
      summaryHash: "sha256:c6f40d7d9433c656dc9b9e4cb15fc4b420fbfdd1043cf9356223b32dc43b9b2c",
      verificationHash: "sha256:60849386032e4a10c8c1327188d4a154356dc0526388d10c2bde304f10005f48",
      sourceObjects: 57,
      sourceBytes: 576_071,
    },
    observations: {
      sourceNativeRows: 49,
      organicAgentSessions: 3,
      robotSoftwareBugFixRecords: 46,
      agentSourceEvents: 116,
      agentToolCalls: 61,
      agentToolResultsPreserved: 27,
      agentNativeToolErrors: 6,
      agentWriteLikeToolCalls: 8,
      agentHumanFollowupPrompts: 4,
      publisherPhysicalContextMarkers: 12,
    },
    units: ["RECORDED_AGENT_SESSION_STRUCTURE", "ROBOT_SOFTWARE_BUG_FIX_METADATA"],
    rights: {
      traceCompilationLicense: "CC-BY-4.0",
      traceEmbeddedRightsUniformlyVerified: false,
      robustRootLicenseDetected: false,
      automaticTrainingAuthorized: false,
      adapterGrantsAdditionalRights: false,
    },
    missingness: [
      "OUTCOME_INDEPENDENTLY_ADJUDICATED",
      "EXPOSURE_DENOMINATOR",
      "PHYSICAL_EXECUTION_STREAM",
      "ECONOMIC_LOSS",
      "UNIFORM_EMBEDDED_RIGHTS",
    ],
    admittedUse: ["DESCRIPTIVE_SOURCE_REPLAY", "FACTOR_TAXONOMY_CANDIDATES"],
  },
  {
    laneId: "OSHA_ROBOT_SEVERE_INJURY_REPORTS",
    sourceReality: ["ORGANIC", "REAL_PHYSICAL"],
    sourceProfile: {
      sourceId: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.sourceId,
      archiveHash: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveSha256,
      archiveBytes: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveBytes,
      csvHash: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvSha256,
      csvBytes: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvBytes,
      coverage: clone(OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.dashboardCoverage),
      sourceCommitmentHash: "sha256:0e3a4b6a28a8306f91ac2e132561b4675713d64427aa6ba0e8a3708db81c65df",
      artifactHash: "sha256:93b030c608f0534b5a655bc784d67b63b975755b122f64c4571bb7ab8127c3c0",
    },
    observations: {
      sourceReportRows: 105_996,
      uniqueNativeReportIds: 105_991,
      selectedRobotOrAgvRows: 116,
      explicitRobotRows: 104,
      guidedVehicleRows: 12,
      reportsWithHospitalization: 77,
      reportedHospitalizations: 79,
      reportsWithAmputation: 46,
      reportedAmputations: 46,
    },
    units: ["EMPLOYER_REPORTED_REGULATORY_ROW", "REPORTED_AFFECTED_WORKER_COUNT"],
    rights: {
      publicDownloadObserved: true,
      datasetLicenseEstablished: false,
      reportTextRetained: false,
      reuseOrTrainingRightsEstablished: false,
      adapterGrantsAdditionalRights: false,
    },
    missingness: [
      "STATE_PLAN_STATE_REPORTS",
      "FATALITIES",
      "EXPOSURE_DENOMINATOR",
      "INDEPENDENT_ADJUDICATION",
      "CAUSAL_ATTRIBUTION",
      "ECONOMIC_LOSS",
      "RECOVERY_AND_CLOSURE",
    ],
    admittedUse: ["CONSEQUENCE_CHANNEL_DISCOVERY", "FACTOR_TAXONOMY_CANDIDATES"],
  },
  {
    laneId: "AIID_LICENSED_INCIDENT_TAXONOMY",
    sourceReality: ["ORGANIC", "REAL_SOFTWARE", "REAL_PHYSICAL_MIXED_UNKNOWN_PER_ROW"],
    sourceProfile: {
      sourceId: AIID_FROZEN_SOURCE_20260817.sourceId,
      archiveHash: AIID_FROZEN_SOURCE_20260817.archiveSha256,
      archiveBytes: AIID_FROZEN_SOURCE_20260817.archiveBytes,
      termsSnapshotHash: AIID_FROZEN_SOURCE_20260817.termsSnapshotSha256,
      termsSnapshotBytes: AIID_FROZEN_SOURCE_20260817.termsSnapshotBytes,
      allowedCollections: ["incidents", "taxa", "classifications", "entities"],
      allowedSourceMembers: 9,
      sourceCommitmentHash: "sha256:f297fa30a8cf01cb04a9965e920d1f0c8f345504e4eb859ec8d283dc7ff2db27",
      artifactHash: "sha256:0d884cc2ecd2838424f38e7ab28f3107d82ef5bdcf5152acfb7392327563c304",
    },
    observations: {
      incidentDocuments: 1_632,
      incidentReportReferences: 6_432,
      taxonomyDocuments: 7,
      explicitPublicTaxonomyFields: 219,
      classificationDocuments: 2_623,
      admittedPublishedClassifications: 2_307,
      admittedPublicClassificationAttributes: 40_319,
      entityDocuments: 7_016,
      unjoinedIncidentEntityRoleReferences: 33,
    },
    units: ["PUBLISHER_CURATED_INCIDENT", "PUBLIC_TAXONOMY_CLASSIFICATION", "ENTITY_PROJECTION"],
    rights: {
      licensedCollectionsDeclaration: "CC-BY-SA-4.0_AS_STATED_BY_PUBLISHER_TERMS",
      attributionRequired: true,
      shareAlikeRequired: true,
      reportsAndSubmissionsParsed: false,
      externalLinkedContentRightsInferred: false,
      automaticTrainingAuthorizedByArtifact: false,
    },
    missingness: [
      "DIRECT_AFFECTED_PARTY_REPORT",
      "EXPOSURE_DENOMINATOR",
      "INDEPENDENT_ADJUDICATION",
      "CAUSAL_ATTRIBUTION",
      "ECONOMIC_LOSS",
      "LONGITUDINAL_RECOVERY_AND_CLOSURE",
    ],
    admittedUse: ["INCIDENT_COMPOSITION", "CONSEQUENCE_AND_FACTOR_TAXONOMY_CANDIDATES"],
  },
  {
    laneId: "INSTITUTIONAL_AI_REMEDIES",
    sourceReality: ["ORGANIC", "REAL_SOFTWARE", "REAL_INSTITUTIONAL_RESPONSE"],
    sourceProfile: {
      publishers: ["US_DEPARTMENT_OF_JUSTICE", "US_EQUAL_EMPLOYMENT_OPPORTUNITY_COMMISSION"],
      sourceObjectSetHash: "sha256:8249ffda270c90635d718190d0302436264cf9ef00d583d535126da1e3679c45",
      sourceObjects: 9,
      sourceBytes: 23_294_396,
      bookHash: "sha256:9d8692811ef20225d31503c9c2c6c2d37d8925b47ac78882bc4b09d442096c1b",
    },
    observations: {
      cases: 2,
      institutionalResolutions: 2,
      remedyObligations: 13,
      publishedMonitoringDocuments: 5,
      implementationEvidenceRows: 0,
      affectedPartyDirectEvidenceRows: 0,
      paymentExecutionVerifiedRows: 0,
      recoveryCompletedVerifiedRows: 0,
      closureEstablishedRows: 0,
    },
    units: ["INSTITUTIONAL_CASE", "REMEDY_OBLIGATION", "PUBLISHED_MONITORING_DOCUMENT"],
    rights: {
      publicAccessObserved: true,
      trainingReuseRightsVerified: false,
      thirdPartyReviewReportRightsResolved: false,
      rawSourceDistributionByPackage: false,
      adapterGrantsAdditionalRights: false,
    },
    missingness: [
      "MERITS_ADJUDICATION_OR_ADMISSION",
      "PAYMENT_EXECUTION_RECEIPT",
      "REMEDY_IMPLEMENTATION_EVIDENCE",
      "AFFECTED_PARTY_ACCEPTANCE",
      "DELAYED_CONSEQUENCE_AND_RECURRENCE",
      "EXTERNAL_CLOSURE_OR_REOPENING_DECISION",
    ],
    admittedUse: ["REMEDY_OBLIGATION_SCHEMA", "INSTITUTIONAL_LIFECYCLE_SCHEMA"],
  },
  {
    laneId: "USDA_RMA_CROP_INSURANCE_EXPERIENCE",
    sourceReality: ["ORGANIC", "REAL_PHYSICAL", "REAL_ADMINISTRATIVE_INSURANCE_EXPERIENCE"],
    sourceProfile: {
      sourceId: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.datasetId,
      commodityYear: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.commodityYear,
      archiveHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash,
      archiveBytes: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectBytes,
      recordLayoutHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash,
      recordLayoutBytes: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutBytes,
      extractedDataHash: "sha256:a644df069daf0a1f4db50bedd65a07de7b715edc83d12a6fb4ed12a9404833da",
      extractedDataBytes: 27_991_663,
      artifactHash: "sha256:5ed89ea0108b403095dd1a8ca609fe6d2fb7c505a0d8865adef73f8de5446dce",
    },
    observations: {
      sourceRows: 152_383,
      exposureCells: 97_782,
      zeroReportedLossExposureCells: 41_792,
      noExposureNoReportedLossCells: 54_421,
      policyNumeratorExceedsDenominatorCells: 265,
      unitNumeratorExceedsDenominatorCells: 28,
      liabilityDollars: "158673917761",
      totalPremiumDollars: "15882764266",
      indemnityDollars: "15163448979",
      monetaryUnit: "PUBLISHER_RECORDED_DOLLARS",
    },
    units: ["STATE_COUNTY_CROP_COVERAGE_CELL", "PUBLISHER_RECORDED_DOLLAR"],
    rights: {
      publicAccessObserved: true,
      webPolicyDistributionClaimSourceReplayed: false,
      modelTrainingRightsLegallyConcluded: false,
      adapterGrantsAdditionalRights: false,
    },
    missingness: [
      "UNIQUE_POLICYHOLDER_DENOMINATOR",
      "INDIVIDUAL_CLAIM_IDENTITY_AND_SEVERITY",
      "PAID_CASE_RESERVE_AND_RECOVERY",
      "ADJUDICATION_APPEAL_AND_FRAUD_STATUS",
      "AI_AGENT_OR_ROBOT_DOMAIN_LINKAGE",
    ],
    admittedUse: ["SOURCE_DOMAIN_AGGREGATE_INDEMNITY_ACCOUNTING", "STRUCTURAL_MATH_FIXTURE"],
  },
  {
    laneId: "CAS_SCHEDULE_P_RESERVE_BACKTEST",
    sourceReality: ["ORGANIC", "REAL_INSURANCE_RESERVE_DEVELOPMENT"],
    sourceProfile: {
      sourcePageHash: CAS_SCHEDULE_P_SOURCE_PAGE.hash,
      sourcePageBytes: CAS_SCHEDULE_P_SOURCE_PAGE.bytes,
      sourceFiles: CAS_SCHEDULE_P_FROZEN_FILES.map(({ lineCode, hash, bytes }) => ({
        lineCode, hash, bytes,
      })),
      artifactHash: "sha256:649653b6b901ed29247d99194b1efcfd141f144adf462574ababd56c71023a38",
    },
    observations: {
      sourceRows: 71_650,
      upperTriangleCells: 40_445,
      lowerTriangleCells: 31_205,
      fullTenByTenGroupTriangles: 665,
      incompleteTenByTenGroupTriangles: 107,
      cumulativePaidEvaluatedCohorts: 6_304,
      cumulativePaidLag10BiasRatio: "-0.00752258",
      cumulativePaidLag10WeightedAbsoluteErrorRatio: "0.04003796",
      incurredEvaluatedCohorts: 6_321,
      incurredLag10BiasRatio: "0.01319465",
      incurredLag10WeightedAbsoluteErrorRatio: "0.03183432",
      outputAmountUnit: "SOURCE_AMOUNT_UNIT_SCALE_NOT_DECLARED_ON_CAS_PAGE",
    },
    units: ["COMPANY_LINE_ACCIDENT_YEAR_DEVELOPMENT_CELL", "UNSCALED_SOURCE_AMOUNT_UNIT"],
    rights: {
      publicDirectDownloadObserved: true,
      researchUseInvitedByPage: true,
      publicationAcknowledgementRequested: true,
      rawRedistributionRightsConcluded: false,
      commercialUseRightsConcluded: false,
      automaticTrainingAuthorized: false,
    },
    missingness: [
      "DEVELOPMENT_BEYOND_LAG_10",
      "VALIDATED_TAIL_FACTOR",
      "POSTED_RESERVE_SCOPE_RECONCILIATION",
      "CROSS_ENTITY_CORRELATION_AND_CALENDAR_SHOCK",
      "CLAIM_LEVEL_ADJUDICATION_AND_RECOVERY",
      "AI_AGENT_OR_ROBOT_DOMAIN_LINKAGE",
    ],
    admittedUse: ["HISTORICAL_SOURCE_DOMAIN_RESERVE_BACKTEST", "STRUCTURAL_RESERVE_MATH_FIXTURE"],
  },
]);

const ONTOLOGY = freezeJson({
  sourceRealityIsIndependentAxis: true,
  realEnvironmentDoesNotImply: [
    "CAUSAL_ATTRIBUTION", "INDEPENDENT_ADJUDICATION", "EXPOSURE_DENOMINATOR",
    "ECONOMIC_LOSS", "RIGHTS_FOR_TRAINING", "PRICING_AUTHORITY",
    "EXECUTION_AUTHORITY", "RECOVERY", "CLOSURE",
  ],
  researchOrShadowMeaning: "PERMITTED_USE_AND_INFERENCE_BOUNDARY_NOT_SOURCE_REALITY_CLASS",
  privateResearchOnlySourceRealityClaimed: false,
  publishedDoesNotMeanVerified: true,
  institutionalOrderDoesNotMeanPerformance: true,
  monetaryRemedyDoesNotMeanEconomicLoss: true,
  sourceReplayDoesNotMeanLegalOrCausalAuthority: true,
});

const QUANTITATIVE_BOUNDARY = freezeJson({
  heterogeneousLanesPooled: false,
  laneLocalUnitsPreserved: true,
  crossLaneRecordTotal: null,
  crossLaneDollarTotal: null,
  crossLaneRate: null,
  crossDomainTransferCoefficient: null,
  reason: "SESSIONS_REPORT_ROWS_DOCUMENTS_INSURANCE_CELLS_DOLLARS_AND_UNSCALED_TRIANGLE_AMOUNTS_ARE_NOT_COMMENSURATE",
  frequencyEstimatedForOutsiderTargetDomain: false,
  severityEstimatedForOutsiderTargetDomain: false,
  stageTransitionProbabilityEstimated: false,
  causalEffectEstimated: false,
});

const STAGE_PROGRESS = freezeJson([
  {
    stage: "STAGE1",
    evidenceGained: [
      "REAL_AI_WORKER_SESSION_STRUCTURE_ACROSS_CLAUDE_CODE_CURSOR_AND_OPENCODE",
      "REAL_ROBOT_SOFTWARE_FAILURE_TAXONOMY",
      "REAL_PHYSICAL_WORKPLACE_CONSEQUENCE_CHANNELS",
      "REAL_AI_INCIDENT_AND_AFFECTED_ENTITY_TAXONOMY",
    ],
    capabilityAdvanced: "FACTOR_AND_CONSEQUENCE_SCHEMA_GROUNDED_IN_MULTIPLE_REAL_ENVIRONMENTS",
    externalReadinessGapsClosed: false,
    stillRequired: [
      "PROSPECTIVE_OUTSIDER_LINKED_RUNS", "INDEPENDENT_OUTCOME_ADJUDICATION",
      "AFFECTED_PARTY_STANDING", "CAUSAL_IDENTIFICATION", "RIGHTS_CLEARED_USE",
    ],
  },
  {
    stage: "STAGE1.5",
    evidenceGained: [
      "PINNED_SOURCE_REPLAY_AND_SAFE_PROJECTION", "CROSS_SOURCE_MISSINGNESS_ONTOLOGY",
      "SNAPSHOT_DIFF_FRONTIER", "OUTCOME_BLIND_SOURCE_SELECTION_FOR_WAVE5",
    ],
    capabilityAdvanced: "SOURCE_AWARE_INTAKE_AND_HUMAN_REVIEW_QUEUE_CAN_BE_EXPANDED_WITHOUT_REALITY_LAUNDERING",
    externalReadinessGapsClosed: false,
    stillRequired: [
      "CONSENT_OR_APPLICABLE_REUSE_RIGHTS", "CEU_LINKAGE", "LONGITUDINAL_OUTCOMES",
      "INDEPENDENT_REVIEW_AND_CONFLICT_DISCLOSURE", "PROSPECTIVE_HOLDOUT",
    ],
  },
  {
    stage: "STAGE2",
    evidenceGained: [
      "REAL_SOURCE_DOMAIN_EXPOSURE_ZERO_LOSS_AND_INDEMNITY_ACCOUNTING",
      "REAL_OUT_OF_TIME_RESERVE_DEVELOPMENT_BACKTEST",
      "NUMERATOR_DENOMINATOR_ANOMALY_QUARANTINE",
      "NEGATIVE_DEVELOPMENT_ADJUSTMENT_PRESERVATION",
    ],
    capabilityAdvanced: "LOSS_EXPOSURE_AND_RESERVE_MATH_HAVE_EMPIRICAL_OUT_OF_DOMAIN_TESTS",
    externalReadinessGapsClosed: false,
    stillRequired: [
      "TARGET_DOMAIN_EXPOSURE_LOSS_LINKAGE", "TARGET_DOMAIN_FREQUENCY_AND_SEVERITY",
      "VALIDATED_TAIL_AND_CORRELATION", "PROSPECTIVE_TEMPORAL_VALIDATION",
      "INDEPENDENT_ACTUARIAL_REVIEW",
    ],
  },
  {
    stage: "STAGE3",
    evidenceGained: [
      "REAL_REMEDY_OBLIGATION_CLASSES", "MONETARY_REMEDY_TYPES_KEPT_SEPARATE",
      "REAL_INSURANCE_LIABILITY_PREMIUM_INDEMNITY_ACCOUNTING",
      "REAL_RESERVE_DEVELOPMENT_BACKTEST_ERROR_MEASURES",
    ],
    capabilityAdvanced: "GUARANTEE_AND_RESERVE_BOUNDARIES_NOW_REFERENCE_REAL_INSTITUTIONAL_AND_INSURANCE_STRUCTURES",
    externalReadinessGapsClosed: false,
    stillRequired: [
      "LICENSED_ISSUER", "FUNDED_CAPITAL", "AUTHORIZED_CUSTODY", "DEFINED_COVERAGE",
      "APPROVED_PRICE", "INDEPENDENT_LEGAL_AND_ACTUARIAL_SIGNOFF",
    ],
  },
  {
    stage: "STAGE4",
    evidenceGained: [
      "REAL_INSTITUTIONAL_RESOLUTION_TO_OBLIGATION_LIFECYCLE",
      "PUBLISHED_MONITORING_DOCUMENT_STAGE", "REAL_AFFECTED_WORKER_CONSEQUENCE_CLASS",
      "EXPLICIT_RIGHT_CENSORING_AND_CLOSURE_MISSINGNESS",
    ],
    capabilityAdvanced: "CLAIMS_AND_REMEDY_STATE_MACHINE_HAS_REAL_WORLD_STATES_AND_MISSING_EVIDENCE_REQUESTS",
    externalReadinessGapsClosed: false,
    stillRequired: [
      "PAYMENT_EXECUTION", "REMEDY_PERFORMANCE", "AFFECTED_PARTY_ACCEPTANCE",
      "DELAYED_CONSEQUENCE_AND_RECURRENCE", "RECOVERY", "AUTHORIZED_CLOSURE_OR_REOPENING",
    ],
  },
]);

const AUTHORITY = freezeJson({
  PRICE: false,
  GUARANTEE: false,
  SETTLE: false,
  TRAIN: false,
  CLOSE: false,
  EXECUTE: false,
  COVER: false,
  CAPITAL: false,
  CUSTODY: false,
  CONTROL: false,
  ownerGateInputEligible: false,
  readyToBearResponsibility: false,
});

const FLYWHEEL = freezeJson({
  disposition: "SOURCE_REPLAY_TO_SAFE_PROJECTION_TO_HUMAN_REVIEW_ONLY",
  automaticPromotion: false,
  automaticTraining: false,
  steps: [
    "FREEZE_OFFICIAL_OR_PINNED_SOURCE_BYTES_AND_RIGHTS_SNAPSHOT",
    "REPLAY_LANE_ADAPTER_WITH_EXACT_SOURCE_PROFILE",
    "PROJECT_ONLY_RIGHTS_COMPATIBLE_FIELDS_AND_EXPLICIT_MISSINGNESS",
    "DIFF_BY_LANE_NATIVE_STABLE_KEYS_WITHOUT_CROSS_LANE_POOLING",
    "QUEUE_ADDED_REMOVED_OR_CHANGED_ROWS_FOR_HUMAN_AND_DOMAIN_REVIEW",
    "REQUEST_PROSPECTIVE_OWNER_BOUND_AND_AFFECTED_PARTY_EVIDENCE",
    "RECALCULATE_ONLY_WITHIN_ADMITTED_LANE_AND_PRESERVE_HOLDOUTS",
    "REQUIRE_EXTERNAL_AUTHORITY_BEFORE_ANY_RESPONSIBILITY_BEARING_ACTION",
  ],
  nextSnapshotDiffs: [
    {
      laneId: "WAVE5_REAL_SOFTWARE",
      action: "PIN_NEXT_REVISIONS_REPLAY_OUTCOME_BLIND_SELECTION_AND_DIFF_RECORD_HASHES",
    },
    {
      laneId: "OSHA_ROBOT_SEVERE_INJURY_REPORTS",
      action: "PIN_NEXT_OFFICIAL_ZIP_AND_DIFF_SOURCE_ID_PLUS_UPA_CORRELATION_KEYS",
    },
    {
      laneId: "AIID_LICENSED_INCIDENT_TAXONOMY",
      action: "PIN_NEXT_SNAPSHOT_AND_TERMS_THEN_ALLOWLIST_DIFF_SAFE_PROJECTIONS",
    },
    {
      laneId: "INSTITUTIONAL_AI_REMEDIES",
      action: "REPLAY_NEW_OFFICIAL_DOCUMENTS_AND_REQUEST_EXECUTION_PERFORMANCE_RECOVERY_AND_CLOSURE_EVIDENCE",
    },
    {
      laneId: "USDA_RMA_CROP_INSURANCE_EXPERIENCE",
      action: "PIN_NEXT_COMMODITY_YEAR_OR_MUTABLE_REFRESH_AND_DIFF_SEMANTIC_CELLS",
    },
    {
      laneId: "CAS_SCHEDULE_P_RESERVE_BACKTEST",
      action: "PIN_ANY_PUBLISHER_REFRESH_AND_RUN_TEMPORALLY_SEPARATE_SOURCE_DOMAIN_HOLDOUT",
    },
  ],
  progressDoesNotCloseExternalReadiness: true,
});

const SOURCE_VERIFICATION_BOUNDARY = freezeJson({
  sourceArtifactsReverifiedByArtifactAlone: false,
  embeddedConstructionReceiptIsSourceProof: false,
  standaloneVerificationLevel: "ARTIFACT_STRUCTURE_AND_FIXED_PROFILE_ONLY",
  fullVerificationRequiresAllSixFrozenSourceSets: true,
  fullVerificationMustInternallyRebuildEveryLane: true,
  acceptsCallerVerificationBoolean: false,
  acceptsCallerResultObject: false,
  acceptsVerificationCallback: false,
});

function profileById(id) {
  return FROZEN_LANES.find((lane) => lane.laneId === id);
}

function requireExact(value, expected, code) {
  if (!same(value, expected)) fail("FROZEN_LANE_PROFILE_MISMATCH", code);
}

function replayWave5(paths) {
  const result = verifyPublicEvidenceWave5Source({
    traceCommonsDirectory: paths.wave5.traceCommonsDirectory,
    robustRosDirectory: paths.wave5.robustRosDirectory,
    generatedAt: PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT,
  });
  const structural = verifyPublicEvidenceWave5Result(result);
  if (!structural.ok || structural.sourceArtifactsReverified !== false
    || result.verification.sourceArtifactsReverified !== true) fail("WAVE5_REPLAY_FAILED");
  const expected = profileById("WAVE5_REAL_SOFTWARE");
  requireExact({
    manifestHash: result.manifest.manifestHash,
    recordSetHash: result.recordSet.recordSetHash,
    summaryHash: result.summary.summaryHash,
    verificationHash: result.verification.verificationHash,
    sourceObjects: result.verification.selectedSourceObjectsReverified,
    sourceBytes: result.verification.selectedSourceBytesReverified,
  }, {
    manifestHash: expected.sourceProfile.manifestHash,
    recordSetHash: expected.sourceProfile.recordSetHash,
    summaryHash: expected.sourceProfile.summaryHash,
    verificationHash: expected.sourceProfile.verificationHash,
    sourceObjects: expected.sourceProfile.sourceObjects,
    sourceBytes: expected.sourceProfile.sourceBytes,
  }, "WAVE5_SOURCE");
  requireExact({
    sourceNativeRows: result.verification.sourceNativeRowsReparsed,
    organicAgentSessions: result.summary.counts.organicAgentSessions,
    robotSoftwareBugFixRecords: result.summary.counts.robustRobotSoftwareBugs,
    agentSourceEvents: result.summary.counts.agentSourceEvents,
    agentToolCalls: result.summary.counts.agentToolCalls,
    agentToolResultsPreserved: result.summary.counts.agentToolResultsPreserved,
    agentNativeToolErrors: result.summary.counts.agentSourceNativeToolErrors,
    agentWriteLikeToolCalls: result.summary.counts.agentWriteLikeToolCalls,
    agentHumanFollowupPrompts: result.summary.counts.agentHumanFollowupPrompts,
    publisherPhysicalContextMarkers: result.summary.counts.robustPublisherPhysicalMarkers,
  }, expected.observations, "WAVE5_COUNTS");
}

function replayOsha(paths) {
  const archive = stableRead(paths.osha.archivePath, MAX_OSHA_ARCHIVE_BYTES,
    "OSHA_ARCHIVE");
  const artifact = buildOshaSirRobotConsequenceBookFromZip(archive, {
    generatedAt: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.pinnedAt,
  });
  const checked = verifyOshaSirRobotConsequenceBookFromZip(artifact, archive);
  if (!checked.ok || !checked.sourceArtifactsReverified
    || !checked.officialFrozenSourceReproduced
    || checked.verificationLevel !== "FULL_OFFICIAL_OSHA_SOURCE_REPRODUCED") {
    fail("OSHA_REPLAY_FAILED");
  }
  const expected = profileById("OSHA_ROBOT_SEVERE_INJURY_REPORTS");
  requireExact({
    sourceId: artifact.source.sourceId,
    archiveHash: artifact.source.archiveHash,
    archiveBytes: artifact.source.archiveBytes,
    csvHash: artifact.source.csvHash,
    csvBytes: artifact.source.csvBytes,
    coverage: artifact.source.dashboardCoverage,
    sourceCommitmentHash: artifact.sourceCommitmentHash,
    artifactHash: artifact.artifactHash,
  }, expected.sourceProfile, "OSHA_SOURCE");
  requireExact({
    sourceReportRows: artifact.counts.sourceReportRows,
    uniqueNativeReportIds: artifact.counts.uniqueNativeReportIds,
    selectedRobotOrAgvRows: artifact.counts.selectedReportRows,
    explicitRobotRows: artifact.counts.explicitRobotTokenRows,
    guidedVehicleRows: artifact.counts.guidedVehicleTokenRows,
    reportsWithHospitalization: artifact.counts.reportsWithHospitalization,
    reportedHospitalizations: artifact.counts.reportedHospitalizations,
    reportsWithAmputation: artifact.counts.reportsWithAmputation,
    reportedAmputations: artifact.counts.reportedAmputations,
  }, expected.observations, "OSHA_COUNTS");
}

function replayAiid(paths) {
  const artifact = buildAiidSnapshotEvidenceFromArchive(paths.aiid.archivePath, {
    termsSnapshotPath: paths.aiid.termsSnapshotPath,
    generatedAt: AIID_FROZEN_SOURCE_20260817.snapshotAt,
  });
  const checked = verifyAiidSnapshotEvidenceFromArchive(artifact,
    paths.aiid.archivePath, paths.aiid.termsSnapshotPath);
  if (!checked.ok || !checked.sourceArtifactsReverified
    || !checked.officialFrozenSourceReproduced
    || checked.forbiddenMembersExtractedOrParsed !== false
    || checked.verificationLevel
      !== "FULL_OFFICIAL_AIID_SOURCE_AND_TERMS_REPRODUCED_ALLOWLIST_ONLY") {
    fail("AIID_REPLAY_FAILED");
  }
  const expected = profileById("AIID_LICENSED_INCIDENT_TAXONOMY");
  requireExact({
    sourceId: artifact.source.sourceId,
    archiveHash: artifact.source.archiveHash,
    archiveBytes: artifact.source.archiveBytes,
    termsSnapshotHash: artifact.source.termsSnapshotHash,
    termsSnapshotBytes: artifact.source.termsSnapshotBytes,
    allowedCollections: artifact.source.allowedCollections,
    allowedSourceMembers: artifact.source.allowedMemberManifest.length,
    sourceCommitmentHash: artifact.sourceCommitmentHash,
    artifactHash: artifact.artifactHash,
  }, expected.sourceProfile, "AIID_SOURCE");
  requireExact({
    incidentDocuments: artifact.counts.incidentDocuments,
    incidentReportReferences: artifact.counts.incidentReportReferences,
    taxonomyDocuments: artifact.counts.taxonomyDocuments,
    explicitPublicTaxonomyFields: artifact.counts.taxonomyExplicitPublicFields,
    classificationDocuments: artifact.counts.classificationDocuments,
    admittedPublishedClassifications: artifact.counts.admittedClassificationProjections,
    admittedPublicClassificationAttributes:
      artifact.counts.admittedPublicClassificationAttributes,
    entityDocuments: artifact.counts.entityDocuments,
    unjoinedIncidentEntityRoleReferences:
      artifact.counts.incidentEntityRoleReferencesUnjoined,
  }, expected.observations, "AIID_COUNTS");
}

function replayInstitutionalRemedies(paths) {
  const rebuilt = buildInstitutionalAiRemedyEvidenceFromSource({
    sourceDirectory: paths.institutionalRemedies.sourceDirectory,
  });
  const checked = verifyInstitutionalAiRemedyEvidenceAgainstSource(rebuilt.book, {
    sourceDirectory: paths.institutionalRemedies.sourceDirectory,
  });
  if (!checked.ok || !checked.sourceArtifactsReverified
    || checked.legalMeaningIndependentlyReviewed !== false
    || checked.verificationLevel
      !== "FULL_OFFICIAL_DOCUMENT_SET_AND_PROJECTION_REPRODUCED") {
    fail("INSTITUTIONAL_REMEDY_REPLAY_FAILED");
  }
  const book = rebuilt.book;
  const expected = profileById("INSTITUTIONAL_AI_REMEDIES");
  requireExact({
    publishers: expected.sourceProfile.publishers,
    sourceObjectSetHash: book.sourceManifest.sourceObjectSetHash,
    sourceObjects: book.summary.sourceObjects,
    sourceBytes: book.summary.sourceBytes,
    bookHash: book.bookHash,
  }, expected.sourceProfile, "INSTITUTIONAL_REMEDY_SOURCE");
  requireExact({
    cases: book.summary.cases,
    institutionalResolutions: book.summary.institutionalResolutionsObserved,
    remedyObligations: book.summary.obligations,
    publishedMonitoringDocuments: book.summary.monitoringDocuments,
    implementationEvidenceRows: book.flywheel.observedStageCounts.implementationEvidence,
    affectedPartyDirectEvidenceRows: book.summary.affectedPartyDirectEvidenceRows,
    paymentExecutionVerifiedRows: book.summary.paymentExecutionVerifiedRows,
    recoveryCompletedVerifiedRows: book.summary.recoveryCompletedVerifiedRows,
    closureEstablishedRows: book.summary.closureEstablishedRows,
  }, expected.observations, "INSTITUTIONAL_REMEDY_COUNTS");
}

function replayRma(paths) {
  const archive = stableRead(paths.rma.archivePath, MAX_RMA_ARCHIVE_BYTES,
    "RMA_ARCHIVE");
  const layout = stableRead(paths.rma.recordLayoutPath, MAX_LAYOUT_OR_PAGE_BYTES,
    "RMA_LAYOUT");
  const artifact = buildRmaCropInsuranceExperience(archive, layout, {
    sourceObjectHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash,
    recordLayoutHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash,
    generatedAt: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.frozenAt,
  });
  const checked = verifyRmaCropInsuranceExperienceWithSource(artifact, archive, layout);
  if (!checked.ok || !checked.sourceArtifactsReverified
    || !checked.officialFrozenSourceVerified
    || checked.verificationLevel !== "FULL_OFFICIAL_USDA_RMA_SOURCE_REPLAYED") {
    fail("RMA_REPLAY_FAILED");
  }
  const expected = profileById("USDA_RMA_CROP_INSURANCE_EXPERIENCE");
  requireExact({
    sourceId: artifact.source.datasetId,
    commodityYear: artifact.source.commodityYear,
    archiveHash: artifact.source.sourceObjectHash,
    archiveBytes: artifact.source.sourceObjectBytes,
    recordLayoutHash: artifact.source.recordLayoutHash,
    recordLayoutBytes: artifact.source.recordLayoutBytes,
    extractedDataHash: artifact.source.extractedObjectHash,
    extractedDataBytes: artifact.source.extractedObjectBytes,
    artifactHash: artifact.artifactHash,
  }, expected.sourceProfile, "RMA_SOURCE");
  requireExact({
    sourceRows: artifact.accounting.sourceRows,
    exposureCells: artifact.national.exposureCells,
    zeroReportedLossExposureCells: artifact.national.zeroReportedLossExposureCells,
    noExposureNoReportedLossCells: artifact.national.noExposureNoReportedLossCells,
    policyNumeratorExceedsDenominatorCells:
      artifact.national.policyLossCountExceedsExposureCells,
    unitNumeratorExceedsDenominatorCells:
      artifact.national.unitLossCountExceedsExposureCells,
    liabilityDollars: artifact.national.liabilityDollars,
    totalPremiumDollars: artifact.national.totalPremiumDollars,
    indemnityDollars: artifact.national.indemnityDollars,
    monetaryUnit: "PUBLISHER_RECORDED_DOLLARS",
  }, expected.observations, "RMA_COUNTS");
  if (artifact.sourceDomainCalibration.reportedLossFrequencyDescriptiveStatisticEligible
    || artifact.evidenceClassification.transferToAiAgentOrRobotDomainEstablished) {
    fail("RMA_TRANSFER_BOUNDARY_INVALID");
  }
}

function replayCas(paths) {
  const page = stableRead(paths.cas.sourcePagePath, MAX_LAYOUT_OR_PAGE_BYTES,
    "CAS_PAGE");
  const files = Object.fromEntries(CAS_SCHEDULE_P_FROZEN_FILES.map((source) => [
    source.fileName,
    stableRead(path.join(paths.cas.sourceDirectory, source.fileName),
      MAX_CAS_FILE_BYTES, `CAS_${source.lineCode}`),
  ]));
  const artifact = buildCasSchedulePReserveCalibration(files, page, {
    generatedAt: CAS_SCHEDULE_P_SOURCE_PAGE.accessedAt,
  });
  const checked = verifyCasSchedulePReserveCalibrationWithSource(artifact, files, page);
  if (!checked.ok || !checked.sourceArtifactsReverified
    || !checked.officialFrozenSourceVerified
    || checked.verificationLevel !== "FULL_OFFICIAL_CAS_SCHEDULE_P_SOURCE_REPLAYED") {
    fail("CAS_REPLAY_FAILED");
  }
  const expected = profileById("CAS_SCHEDULE_P_RESERVE_BACKTEST");
  requireExact({
    sourcePageHash: artifact.source.sourcePage.hash,
    sourcePageBytes: artifact.source.sourcePage.bytes,
    sourceFiles: artifact.source.files.map(({ lineCode, hash, bytes }) => ({
      lineCode, hash, bytes,
    })),
    artifactHash: artifact.artifactHash,
  }, expected.sourceProfile, "CAS_SOURCE");
  requireExact({
    sourceRows: artifact.accounting.sourceRows,
    upperTriangleCells: artifact.accounting.upperTriangleCells,
    lowerTriangleCells: artifact.accounting.lowerTriangleCells,
    fullTenByTenGroupTriangles: artifact.accounting.fullTenByTenGroupTriangles,
    incompleteTenByTenGroupTriangles: artifact.accounting.incompleteTenByTenGroupTriangles,
    cumulativePaidEvaluatedCohorts:
      artifact.aggregateHoldoutBacktest.cumulativePaid.evaluatedCohorts,
    cumulativePaidLag10BiasRatio:
      artifact.aggregateHoldoutBacktest.cumulativePaid.lag10AggregateBiasRatio,
    cumulativePaidLag10WeightedAbsoluteErrorRatio:
      artifact.aggregateHoldoutBacktest.cumulativePaid.lag10WeightedAbsoluteErrorRatio,
    incurredEvaluatedCohorts: artifact.aggregateHoldoutBacktest.incurred.evaluatedCohorts,
    incurredLag10BiasRatio: artifact.aggregateHoldoutBacktest.incurred.lag10AggregateBiasRatio,
    incurredLag10WeightedAbsoluteErrorRatio:
      artifact.aggregateHoldoutBacktest.incurred.lag10WeightedAbsoluteErrorRatio,
    outputAmountUnit: "SOURCE_AMOUNT_UNIT_SCALE_NOT_DECLARED_ON_CAS_PAGE",
  }, expected.observations, "CAS_COUNTS");
  if (artifact.sourceDomainCalibration.productionReserveModelEligible
    || artifact.outsiderModelEntrance.transferToAiAgentOrRobotDomainEstablished) {
    fail("CAS_TRANSFER_BOUNDARY_INVALID");
  }
}

function replayAllSources(rawPaths) {
  const paths = sourcePaths(rawPaths);
  replayWave5(paths);
  replayOsha(paths);
  replayAiid(paths);
  replayInstitutionalRemedies(paths);
  replayRma(paths);
  replayCas(paths);
}

function projection(generatedAt = REAL_EVIDENCE_STAGE_PROGRESS_GENERATED_AT) {
  const body = {
    schema: REAL_EVIDENCE_STAGE_PROGRESS_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: canonicalTime(generatedAt),
    generatedAtTrust: "CALLER_PROVIDED_CANONICAL_TIME_NOT_EXTERNAL_ATTESTATION",
    lanes: clone(FROZEN_LANES),
    ontology: clone(ONTOLOGY),
    quantitativeBoundary: clone(QUANTITATIVE_BOUNDARY),
    stageProgress: clone(STAGE_PROGRESS),
    readiness: {
      currentUseBoundary: "PRIVATE_RESEARCH_AND_SHADOW_INFERENCE",
      sourceRealityClass: "MULTIPLE_REAL_ENVIRONMENTS",
      privateResearchIsSourceRealityClass: false,
      externalReadinessGapsClosedByThisArtifact: false,
      stageTransitionAuthorized: false,
      readyToBearResponsibility: false,
      readyForRealPricing: false,
    },
    authority: clone(AUTHORITY),
    flywheel: clone(FLYWHEEL),
    sourceVerificationBoundary: clone(SOURCE_VERIFICATION_BOUNDARY),
  };
  return freezeJson({ ...body,
    artifactHash: domainHash(REAL_EVIDENCE_STAGE_PROGRESS_SCHEMA, body) });
}

/**
 * A source-agnostic fixed projection for inspection and structural tests.
 * It never claims source replay.  Use buildRealEvidenceStageProgressFromSources
 * or verifyRealEvidenceStageProgressAgainstSources for source-aware work.
 */
export function buildRealEvidenceStageProgressProjection(options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    fail("PROJECTION_ARGUMENT_INVALID");
  }
  return projection(options.generatedAt ?? REAL_EVIDENCE_STAGE_PROGRESS_GENERATED_AT);
}

/** Rebuild every frozen lane from actual source paths before minting the projection. */
export function buildRealEvidenceStageProgressFromSources(options = {}) {
  const expectedKeys = Object.hasOwn(options, "generatedAt")
    ? ["sources", "generatedAt"] : ["sources"];
  if (!exactKeys(options, expectedKeys)) fail("SOURCE_BUILD_ARGUMENT_INVALID");
  replayAllSources(options.sources);
  return projection(options.generatedAt ?? REAL_EVIDENCE_STAGE_PROGRESS_GENERATED_AT);
}

export function verifyRealEvidenceStageProgress(artifact) {
  try {
    if (artifact == null || typeof artifact !== "object" || Array.isArray(artifact)
      || artifact.schema !== REAL_EVIDENCE_STAGE_PROGRESS_SCHEMA
      || !HASH.test(String(artifact.artifactHash ?? ""))) fail("ARTIFACT_INVALID");
    const expected = projection(artifact.generatedAt);
    if (!same(artifact, expected)) fail("FIXED_PROFILE_OR_BOUNDARY_MISMATCH");
    return Object.freeze({
      ok: true,
      verificationLevel: "ARTIFACT_STRUCTURE_AND_FIXED_PROFILE_ONLY",
      artifactStructureVerified: true,
      fixedSourceProfileCommitmentsVerified: true,
      sourceArtifactsReverified: false,
      fullLaneSourceReplayCompleted: false,
      externalReadinessGapsClosed: false,
      artifactHash: artifact.artifactHash,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      verificationLevel: "INVALID",
      artifactStructureVerified: false,
      fixedSourceProfileCommitmentsVerified: false,
      sourceArtifactsReverified: false,
      fullLaneSourceReplayCompleted: false,
      externalReadinessGapsClosed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function verifyRealEvidenceStageProgressAgainstSources(artifact, options = {}) {
  const structural = verifyRealEvidenceStageProgress(artifact);
  if (!structural.ok) return structural;
  try {
    if (!exactKeys(options, ["sources"])) fail("SOURCE_VERIFY_ARGUMENT_INVALID");
    const rebuilt = buildRealEvidenceStageProgressFromSources({
      sources: options.sources, generatedAt: artifact.generatedAt,
    });
    if (!same(artifact, rebuilt)) fail("FULL_SOURCE_REPLAY_ARTIFACT_MISMATCH");
    return Object.freeze({
      ok: true,
      verificationLevel: "FULL_SIX_LANE_FROZEN_SOURCE_REPLAY",
      artifactStructureVerified: true,
      fixedSourceProfileCommitmentsVerified: true,
      sourceArtifactsReverified: true,
      fullLaneSourceReplayCompleted: true,
      replayedLanes: Object.freeze(FROZEN_LANES.map(({ laneId }) => laneId)),
      callerVerificationAccepted: false,
      externalReadinessGapsClosed: false,
      responsibilityBearingAuthorityGranted: false,
      artifactHash: artifact.artifactHash,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      verificationLevel: "FULL_SIX_LANE_SOURCE_REPLAY_FAILED",
      artifactStructureVerified: true,
      fixedSourceProfileCommitmentsVerified: true,
      sourceArtifactsReverified: false,
      fullLaneSourceReplayCompleted: false,
      externalReadinessGapsClosed: false,
      responsibilityBearingAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const REAL_EVIDENCE_STAGE_PROGRESS_FROZEN_LANES = FROZEN_LANES;
