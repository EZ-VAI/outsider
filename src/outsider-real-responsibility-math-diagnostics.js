/*
 * Source-domain responsibility math over source-replayed real cases and real
 * experience.
 *
 * This module intentionally does not produce a global score, a target-domain
 * loss estimate, or a price.  Its full API first stable-reads the frozen
 * responsibility-flywheel canonical, authenticates its semantic and serialized
 * hashes, and then obtains a same-invocation full-source receipt that exactly
 * rebuilds that canonical.  Only then does it read the exact artifacts pinned
 * by the flywheel and recompute source-domain diagnostics.  The JSON artifact
 * alone remains structure-only.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  buildRealCaseResponsibilityFlywheelProjection,
  REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT,
  verifyRealCaseResponsibilityFlywheel,
  verifyRealCaseResponsibilityFlywheelAgainstSources,
} from "./outsider-real-case-responsibility-flywheel.js";
import {
  buildRealCaseGapEvidenceCatalog,
  verifyRealCaseGapEvidenceCatalog,
} from "./outsider-real-case-gap-evidence-catalog.js";

export const REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_SCHEMA
  = "outsider/real-responsibility-math-diagnostics/v1";
export const REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_GENERATED_AT
  = "2026-08-28T09:03:30.091Z";

export const REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG = Object.freeze({
  repositoryRelativePath:
    "artifacts/real-case-gap-evidence-catalog-20260828/final-v18/catalog.json",
  artifactPathRole: "FROZEN_CANONICAL_REAL_CASE_GAP_EVIDENCE_CATALOG_JSON",
  asOf: "2026-08-28T08:23:57.560Z",
  catalogHash: "sha256:b690ddeb4a9a01b94938f6558dfe565e4f6703d16eb22e0b05fb88d9c32d6f66",
  artifactFileHash: "sha256:cce91100a329ad2d8687945d48e3c8774aa6f9a4ed6ccdc077fe5b9b9fc20eb0",
  artifactFileBytes: 69059,
});

export const REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL = Object.freeze({
  repositoryRelativePath:
    "artifacts/real-case-responsibility-flywheel-20260828/final-v16/flywheel.json",
  artifactPathRole: "FROZEN_CANONICAL_REAL_CASE_RESPONSIBILITY_FLYWHEEL_JSON",
  generatedAt: REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT,
  artifactHash: "sha256:0a80bf8bd7ad41fa49423a01ec2af3667510b2fa7dcb0f72a234adf1451fcd77",
  artifactFileHash: "sha256:18655bfce66c23d12c300fc7a9bc88a618bb240b0fcf07ca85a634a1aa358f68",
  artifactFileBytes: 644539,
});

export const REAL_RESPONSIBILITY_FACTOR_CATEGORIES = Object.freeze([
  "OUTCOME_SENSING", "REVISION", "MISSINGNESS", "EXPOSURE", "PAYMENT",
  "RECOVERY", "ADJUDICATION", "CAPITAL", "CUSTODY",
]);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const FULL_FLYWHEEL_LEVEL
  = "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE";

function fail(code, detail = null) {
  throw new Error(detail === null ? `REAL_RESPONSIBILITY_MATH_${code}`
    : `REAL_RESPONSIBILITY_MATH_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function firstDifference(left, right, prefix = "facts") {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return `${prefix}.length`;
    for (let index = 0; index < left.length; index += 1) {
      const found = firstDifference(left[index], right[index], `${prefix}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (plain(left) && plain(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) return `${prefix}.${key}`;
      const found = firstDifference(left[key], right[key], `${prefix}.${key}`);
      if (found) return found;
    }
    return null;
  }
  return prefix;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function canonicalTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("TIME_INVALID");
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function fixedDiagnosticsTime(value) {
  const normalized = canonicalTime(value);
  if (normalized !== REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_GENERATED_AT) {
    fail("GENERATED_AT_NOT_CANONICAL_FIXED_VALUE");
  }
  return normalized;
}

function requiredPath(value, code) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail("PATH_INVALID", code);
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) fail("PATH_TOO_BROAD", code);
  return resolved;
}

function stableReadJson(filePath, code) {
  const resolved = requiredPath(filePath, code);
  let descriptor;
  try {
    descriptor = openSync(resolved, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 2n || before.size > BigInt(MAX_ARTIFACT_BYTES)) {
      fail("ARTIFACT_FILE_INVALID", code);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || bytes.length !== Number(before.size)) {
      fail("ARTIFACT_FILE_CHANGED", code);
    }
    try {
      return { value: JSON.parse(bytes.toString("utf8")), fileBytes: bytes.length,
        fileHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
    }
    catch { fail("ARTIFACT_JSON_INVALID", code); }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

const FLYWHEEL_SOURCE_PROFILE_KEYS = Object.freeze([
  "temporalAudit", "progress", "wave5Intake", "fdaMaude", "caDmvAv", "institutionalCapitalClaims",
  "femaRealCases", "remedyPaymentRecovery", "ntsbBlsOutcome", "judgmentFundGao",
  "ncuaPbgcMsha", "cdiNcigf", "fraPhmsa", "nhtsaRecallRemedy",
  "bridgeDataV2", "waymoSafetyImpact", "clinicalTrials",
]);

const TEMPORAL_QUARANTINE_RECEIPT_IDS = Object.freeze([
  "CROSS_STAGE_SIX_LANE_PROGRESS",
  "INSTITUTIONAL_CAPITAL_CLAIMS",
  "REMEDY_PAYMENT_RECOVERY",
  "CDI_NCIGF_REAL_RATE_GUARANTY",
  "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE",
  "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE",
  "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
]);
const TEMPORAL_QUARANTINE_RECEIPT_ID_SET
  = new Set(TEMPORAL_QUARANTINE_RECEIPT_IDS);

function containsPositiveCurrentToken(value) {
  if (typeof value === "string") return /(^|_)CURRENT(_|$)/u.test(value);
  if (Array.isArray(value)) return value.some(containsPositiveCurrentToken);
  if (plain(value)) return Object.values(value).some(containsPositiveCurrentToken);
  return false;
}

function mathSourcePathProfile(value) {
  if (!plain(value)
    || !exactKeys(value, ["responsibilityFlywheel", ...FLYWHEEL_SOURCE_PROFILE_KEYS])
    || !exactKeys(value.responsibilityFlywheel, ["artifactPath", "catalogArtifactPath"])) {
    fail("SOURCE_PATH_PROFILE_INVALID");
  }
  const flywheelSources = {};
  for (const key of FLYWHEEL_SOURCE_PROFILE_KEYS) flywheelSources[key] = value[key];
  return {
    frozenFlywheelArtifactPath: requiredPath(value.responsibilityFlywheel.artifactPath,
      "FROZEN_FLYWHEEL_ARTIFACT"),
    frozenCatalogArtifactPath: requiredPath(
      value.responsibilityFlywheel.catalogArtifactPath,
      "FROZEN_CATALOG_ARTIFACT"),
    flywheelSources,
  };
}

function frozenCatalogProjection() {
  const catalog = buildRealCaseGapEvidenceCatalog({
    asOf: REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG.asOf,
  });
  if (catalog.catalogHash !== REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG.catalogHash) {
    fail("FROZEN_CATALOG_CODE_PROJECTION_MISMATCH");
  }
  return catalog;
}

function readFrozenCatalogCanonical(filePath) {
  const loaded = stableReadJson(filePath, "FROZEN_CATALOG_CANONICAL");
  const catalog = loaded.value;
  if (!plain(catalog)
    || catalog.asOf !== REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG.asOf
    || catalog.catalogHash !== REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG.catalogHash
    || loaded.fileHash !== REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG.artifactFileHash
    || loaded.fileBytes !== REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG.artifactFileBytes) {
    fail("FROZEN_CATALOG_CANONICAL_HASH_MISMATCH");
  }
  const standalone = verifyRealCaseGapEvidenceCatalog(catalog);
  if (!standalone.ok || standalone.sourceArtifactsReverified !== false
    || standalone.catalogHash !== REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG.catalogHash
    || !same(catalog, frozenCatalogProjection())) {
    fail("FROZEN_CATALOG_CANONICAL_STRUCTURE_MISMATCH",
      standalone.error ?? standalone.verificationLevel);
  }
  return catalog;
}

function frozenFlywheelProjection() {
  const flywheel = buildRealCaseResponsibilityFlywheelProjection({
    generatedAt: REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.generatedAt,
  });
  if (flywheel.artifactHash !== REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.artifactHash) {
    fail("FROZEN_FLYWHEEL_CODE_PROJECTION_MISMATCH");
  }
  return flywheel;
}

function readFrozenFlywheelCanonical(filePath) {
  const loaded = stableReadJson(filePath, "FROZEN_FLYWHEEL_CANONICAL");
  const artifact = loaded.value;
  if (!plain(artifact)
    || artifact.generatedAt !== REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.generatedAt
    || artifact.artifactHash !== REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.artifactHash
    || loaded.fileHash !== REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.artifactFileHash
    || loaded.fileBytes !== REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.artifactFileBytes) {
    fail("FROZEN_FLYWHEEL_CANONICAL_HASH_MISMATCH");
  }
  const standalone = verifyRealCaseResponsibilityFlywheel(artifact);
  if (!standalone.ok || standalone.sourceArtifactsReverified !== false
    || standalone.artifactHash !== REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.artifactHash
    || !same(artifact, frozenFlywheelProjection())) {
    fail("FROZEN_FLYWHEEL_CANONICAL_STRUCTURE_MISMATCH",
      standalone.error ?? standalone.verificationLevel);
  }
  return artifact;
}

function ratioFixed(numerator, denominator, scale = 8) {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (n < 0n || d <= 0n || !Number.isSafeInteger(scale) || scale < 0 || scale > 12) {
    fail("RATIO_INPUT_INVALID");
  }
  const factor = 10n ** BigInt(scale);
  const rounded = (n * factor + d / 2n) / d;
  if (scale === 0) return rounded.toString();
  const digits = rounded.toString().padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function decimalToInteger(value, scale) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/u.test(value)) {
    fail("DECIMAL_INPUT_INVALID");
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) fail("DECIMAL_SCALE_INVALID");
  return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
}

function decimalRatioFixed(numerator, denominator, inputScale = 2, outputScale = 8) {
  return ratioFixed(decimalToInteger(numerator, inputScale),
    decimalToInteger(denominator, inputScale), outputScale);
}

const QUALITY_DIMENSIONS = new Set([
  "byteIdentity", "sourceProvenance", "realityLink", "populationFrame",
  "recordCompleteness", "revisionAndDedup", "measurementDefinition",
  "temporalOrdering", "exposureDenominator", "outcomeSensing",
  "independentOutcomeReview", "economicAmount", "adjudicationFinality",
  "dependenceStructure", "causalDesign", "capitalMeasurement", "custodyExecution",
  "institutionalAuthority", "affectedPartyStanding", "rightsAndConsent",
  "targetDomainTransfer", "privacyProjection", "longitudinalMaturity",
]);

function prerequisite(dimension, minimumStatus = "VERIFIED") {
  if (!QUALITY_DIMENSIONS.has(dimension)
    || !new Set(["VERIFIED", "PARTIAL"]).has(minimumStatus)) {
    fail("FACTOR_PREREQUISITE_INVALID", dimension);
  }
  return { dimension, minimumStatus };
}

const BASE_PREREQUISITES = Object.freeze([
  prerequisite("byteIdentity"), prerequisite("sourceProvenance"),
  prerequisite("realityLink"), prerequisite("measurementDefinition", "PARTIAL"),
]);

function factor({ factorId, category, sourceDomain, sourceLaneId, valueType, unit,
  measurementScope, temporality, outcomeDerived, preActionAvailable = false,
  prerequisites = [], admittedUse = "SOURCE_DOMAIN_RETROSPECTIVE_DIAGNOSTIC",
  missingnessPolicy = "PRESERVE_NULL_OR_EXPLICIT_UNESTABLISHED_NEVER_ZERO_FILL",
  interpretationBoundary }) {
  if (!REAL_RESPONSIBILITY_FACTOR_CATEGORIES.includes(category)) {
    fail("FACTOR_CATEGORY_INVALID", factorId);
  }
  const textFields = { factorId, sourceDomain, sourceLaneId, valueType, unit,
    measurementScope, temporality, admittedUse, missingnessPolicy, interpretationBoundary };
  if (Object.values(textFields).some((value) => typeof value !== "string" || value.length === 0)
    || typeof outcomeDerived !== "boolean" || typeof preActionAvailable !== "boolean"
    || outcomeDerived && preActionAvailable) {
    fail("FACTOR_DEFINITION_INVALID", factorId);
  }
  const prerequisiteByDimension = new Map();
  const statusRank = { PARTIAL: 1, VERIFIED: 2 };
  for (const gate of [...BASE_PREREQUISITES, ...prerequisites]) {
    if (!plain(gate) || !QUALITY_DIMENSIONS.has(gate.dimension)
      || !Object.hasOwn(statusRank, gate.minimumStatus)) {
      fail("FACTOR_PREREQUISITE_INVALID", factorId);
    }
    const prior = prerequisiteByDimension.get(gate.dimension);
    if (!prior || statusRank[gate.minimumStatus] > statusRank[prior.minimumStatus]) {
      prerequisiteByDimension.set(gate.dimension, clone(gate));
    }
  }
  return {
    factorId, category, sourceDomain, sourceLaneId, valueType, unit,
    measurementScope, temporality, retrospective: true, outcomeDerived,
    preActionAvailable, qualityPrerequisites: [...prerequisiteByDimension.values()],
    admittedUse, missingnessPolicy, interpretationBoundary,
    targetDomainTransferEstablished: false,
    targetPredictorEligible: false,
    targetPriceEligible: false,
    crossDomainPoolingPermitted: false,
  };
}

const FACTORS = deepFreeze([
  factor({ factorId: "wave5_trace_session_shape_profile", category: "MISSINGNESS",
    sourceDomain: "WAVE5_REAL_SOFTWARE_SOURCE_AWARE_TAXONOMY",
    sourceLaneId: "WAVE5_REAL_SOFTWARE",
    valueType: "COUNT_AND_COVERAGE_PROFILE", unit: "PINNED_ORGANIC_SESSION_PROJECTION",
    measurementScope: "THREE_OUTCOME_BLIND_SELECTED_TRACE_COMMONS_SESSIONS",
    temporality: "POST_SESSION_SOURCE_REPLAY", outcomeDerived: false,
    preActionAvailable: false,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("privacyProjection", "PARTIAL")],
    admittedUse: "SOURCE_DOMAIN_RETROSPECTIVE_CANDIDATE_QUALITY_DIAGNOSTIC",
    interpretationBoundary: "WHOLE_SESSION_TOOL_CALL_ERROR_AND_EVIDENCE_COVERAGE_COUNTS_ARE_POST_SESSION_SHAPES_NOT_PREACTION_FEATURES_SUCCESS_RECOVERY_RATES_OR_TRAINER_ROWS" }),
  factor({ factorId: "wave5_ros_bug_fix_mechanism_taxonomy_profile",
    category: "MISSINGNESS",
    sourceDomain: "WAVE5_REAL_SOFTWARE_SOURCE_AWARE_TAXONOMY",
    sourceLaneId: "WAVE5_REAL_SOFTWARE",
    valueType: "TAXONOMY_AND_REFERENCE_MISSINGNESS_PROFILE",
    unit: "PINNED_ROS_BUG_FIX_METADATA_ROW",
    measurementScope: "FORTY_SIX_ORGANIC_MOTOMAN_AND_UNIVERSAL_ROBOT_BUG_RECORDS",
    temporality: "POST_ISSUE_AND_FIX_SOURCE_REPLAY", outcomeDerived: false,
    preActionAvailable: false,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL")],
    admittedUse: "SOURCE_DOMAIN_RETROSPECTIVE_MECHANISM_TAXONOMY_DIAGNOSTIC",
    interpretationBoundary: "FAULT_FAILURE_PHASE_AND_REFERENCE_COUNTS_DESCRIBE_RETROSPECTIVE_BUG_FIX_METADATA_NOT_PHYSICAL_EXECUTION_CAUSAL_EFFECT_POPULATION_FREQUENCY_SEVERITY_LOSS_OR_TARGET_PREDICTION" }),
  factor({ factorId: "wave5_rights_preaction_and_trainer_admission_gap",
    category: "MISSINGNESS",
    sourceDomain: "WAVE5_REAL_SOFTWARE_SOURCE_AWARE_TAXONOMY",
    sourceLaneId: "WAVE5_REAL_SOFTWARE",
    valueType: "BOOLEAN_GATE_VECTOR", unit: "ROW_ADMISSION_GATE",
    measurementScope: "RIGHTS_PREACTION_OUTCOME_EXPOSURE_TARGET_AND_TRAINER_GATES",
    temporality: "POST_SOURCE_RIGHTS_AND_INFERENCE_REVIEW", outcomeDerived: false,
    preActionAvailable: false,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL")],
    admittedUse: "SOURCE_DOMAIN_ADMISSION_GAP_DIAGNOSTIC_ONLY",
    interpretationBoundary: "TRACE_COMPILATION_LICENSE_DOES_NOT_CURE_EMBEDDED_RIGHTS_AND_ROBUST_HAS_NO_DETECTED_ROOT_LICENSE; ALL_49_ROWS_LACK_PREACTION_OUTCOME_EXPOSURE_TARGET_TRANSFER_AND_TRAINER_ADMISSION; ZERO_TRAIN_PRICE_OR_AUTHORITY" }),
  factor({ factorId: "maude_reported_event_type_composition", category: "OUTCOME_SENSING",
    sourceDomain: "FDA_MAUDE_PASSIVE_SURVEILLANCE", sourceLaneId: "FDA_MAUDE_PASSIVE_REPORTS",
    valueType: "CATEGORICAL_COUNT_VECTOR", unit: "PUBLISHER_REPORT_ROWS",
    measurementScope: "EFFECTIVE_MDR_REPORT_KEY_SNAPSHOT", temporality: "POST_REPORT",
    outcomeDerived: true, prerequisites: [prerequisite("outcomeSensing", "PARTIAL")],
    interpretationBoundary: "REPORT_TYPE_COMPOSITION_NOT_INCIDENT_FREQUENCY_CAUSALITY_OR_SEVERITY" }),
  factor({ factorId: "dmv_selected_collision_report_presence", category: "OUTCOME_SENSING",
    sourceDomain: "CA_DMV_AV_REPORTING", sourceLaneId: "CA_DMV_AV_PERMIT_COLLISION_EXPOSURE",
    valueType: "INTEGER", unit: "CURATOR_SELECTED_MANUFACTURER_FORMS",
    measurementScope: "NONPROBABILITY_FOUR_PDF_SAMPLE", temporality: "POST_COLLISION_REPORT",
    outcomeDerived: true, prerequisites: [prerequisite("outcomeSensing", "PARTIAL")],
    interpretationBoundary: "SELECTED_FORMS_NOT_COMPLETE_MANIFEST_NOT_RATE_NUMERATOR" }),
  factor({ factorId: "gao_recommendation_nonimplementation_counterexample",
    category: "OUTCOME_SENSING", sourceDomain: "GAO_BID_PROTEST_FY2025",
    sourceLaneId: "GAO_BID_PROTEST", valueType: "INTEGER",
    unit: "PUBLISHER_REPORTED_NONIMPLEMENTATION_INSTANCES",
    measurementScope: "FY2025_ANNUAL_REPORT", temporality: "POST_RECOMMENDATION_REPORTING",
    outcomeDerived: true, prerequisites: [prerequisite("outcomeSensing"),
      prerequisite("independentOutcomeReview")],
    interpretationBoundary: "REAL_COUNTEREXAMPLE_TO_RECOMMENDATION_EQUALING_IMPLEMENTATION_NOT_A_POPULATION_IMPLEMENTATION_RATE_OR_FULL_CONSEQUENCE_CHAIN" }),
  factor({ factorId: "maude_change_stream_precedence", category: "REVISION",
    sourceDomain: "FDA_MAUDE_PASSIVE_SURVEILLANCE", sourceLaneId: "FDA_MAUDE_PASSIVE_REPORTS",
    valueType: "CATEGORICAL_RULE", unit: "PRIMARY_KEY_PRECEDENCE_RULE",
    measurementScope: "MONTHLY_BASE_ADD_CHANGE_STREAMS", temporality: "POST_REPORT_REVISION",
    outcomeDerived: true, prerequisites: [prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "CHANGE_PRECEDENCE_DOES_NOT_RESOLVE_MULTIPLE_REPORTER_DUPLICATION" }),
  factor({ factorId: "maude_followup_evidence_flag", category: "REVISION",
    sourceDomain: "FDA_MAUDE_PASSIVE_SURVEILLANCE", sourceLaneId: "FDA_MAUDE_PASSIVE_REPORTS",
    valueType: "BOOLEAN", unit: "REPORT_KEY_FLAG", measurementScope: "EFFECTIVE_REPORT_KEY",
    temporality: "POST_REPORT_REVISION", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "FOLLOWUP_EVIDENCE_NOT_INDEPENDENT_OUTCOME_OR_CLOSURE" }),
  factor({ factorId: "fdic_downward_cumulative_dividend_revision", category: "REVISION",
    sourceDomain: "US_BANK_RECEIVERSHIP", sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
    valueType: "BOOLEAN", unit: "FUND_PRIORITY_SEQUENCE_FLAG",
    measurementScope: "TRIMMED_FUND_AND_NORMALIZED_PRIORITY", temporality: "POST_PAYMENT_REVISION",
    outcomeDerived: true, prerequisites: [prerequisite("revisionAndDedup")],
    interpretationBoundary: "PUBLISHED_CUMULATIVE_SEQUENCE_REVISION_NOT_NEGATIVE_RECOVERY" }),
  factor({ factorId: "cpsc_historical_revision_chain_observed", category: "REVISION",
    sourceDomain: "CPSC_RECALL_MPR", sourceLaneId: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
    valueType: "BOOLEAN", unit: "SNAPSHOT_PROPERTY", measurementScope: "CURRENT_VISIBLE_MPR_SHEET",
    temporality: "POST_REMEDY_REPORT_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "FALSE_MEANS_NO_LONGITUDINAL_REVISION_CHAIN_NOT_NO_REVISION" }),
  factor({ factorId: "dmv_enhanced_reporting_regime_transition", category: "REVISION",
    sourceDomain: "CA_DMV_AV_REPORTING", sourceLaneId: "CA_DMV_AV_PERMIT_COLLISION_EXPOSURE",
    valueType: "DATE_PAIR", unit: "REGULATORY_DUE_DATES",
    measurementScope: "ENHANCED_2026_MONTHLY_AND_QUARTERLY_REPORTING_REGIME",
    temporality: "REGULATORY_REGIME_TRANSITION", outcomeDerived: false,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL"),
      prerequisite("temporalOrdering")],
    interpretationBoundary: "PRE_DUE_DATE_ZERO_ROWS_ARE_NOT_ZERO_COLLISIONS_AND_LEGACY_AND_ENHANCED_REGIMES_ARE_NOT_SILENTLY_POOLED" }),
  factor({ factorId: "judgment_fund_current_snapshot_revision_state", category: "REVISION",
    sourceDomain: "TREASURY_JUDGMENT_FUND_2026_PAYMENT_REPORTS",
    sourceLaneId: "TREASURY_JUDGMENT_FUND", valueType: "CATEGORICAL_FLAGS",
    unit: "PUBLISHER_SNAPSHOT_PROPERTY", measurementScope: "FOURTEEN_BIWEEKLY_WORKBOOKS",
    temporality: "POST_PUBLICATION_FROZEN_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "BYTE_STABILITY_AT_FREEZE_WITHOUT_PUBLISHER_VERSION_IDS_OR_REVISION_HISTORY_DOES_NOT_ESTABLISH_LONGITUDINAL_FINALITY" }),
  factor({ factorId: "maude_event_date_missing", category: "MISSINGNESS",
    sourceDomain: "FDA_MAUDE_PASSIVE_SURVEILLANCE", sourceLaneId: "FDA_MAUDE_PASSIVE_REPORTS",
    valueType: "BOOLEAN", unit: "REPORT_KEY_FLAG", measurementScope: "EFFECTIVE_REPORT_KEY",
    temporality: "POST_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL")],
    interpretationBoundary: "MISSING_EVENT_DATE_IS_NOT_ZERO_LATENCY_OR_NO_EVENT" }),
  factor({ factorId: "cpsc_core_remedy_field_missing", category: "MISSINGNESS",
    sourceDomain: "CPSC_RECALL_MPR", sourceLaneId: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
    valueType: "BOOLEAN", unit: "CORRELATED_RECALL_CASE_FLAG",
    measurementScope: "CURRENT_VISIBLE_MPR_CASE", temporality: "POST_REMEDY_REPORT_SNAPSHOT",
    outcomeDerived: true, prerequisites: [prerequisite("recordCompleteness", "PARTIAL")],
    interpretationBoundary: "BLANK_MAY_REFLECT_MULTIPLE_PUBLISHER_REASONS_AND_IS_NEVER_ZERO_FILLED" }),
  factor({ factorId: "nfip_unique_loss_identity_unobserved", category: "MISSINGNESS",
    sourceDomain: "NFIP_NC_2024_CLAIM_TRANSACTIONS", sourceLaneId: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    valueType: "BOOLEAN", unit: "DATASET_SCOPE_PROPERTY", measurementScope: "SELECTED_CLAIM_TRANSACTION_SLICE",
    temporality: "POST_PAYMENT_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "UNIQUE_PUBLISHER_RECORD_ID_DOES_NOT_ESTABLISH_UNIQUE_LOSS_OR_IID_UNIT" }),
  factor({ factorId: "rma_zero_reported_loss_exposure_cell", category: "MISSINGNESS",
    sourceDomain: "USDA_RMA_CROP_INSURANCE_2024", sourceLaneId: "USDA_RMA_CROP_INSURANCE_EXPERIENCE",
    valueType: "CATEGORICAL_COUNT", unit: "STATE_COUNTY_CROP_COVERAGE_CELLS",
    measurementScope: "CELLS_WITH_RECORDED_EXPOSURE_AND_ZERO_REPORTED_LOSS",
    temporality: "RETROSPECTIVE_COVERAGE_YEAR_PUBLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("exposureDenominator", "PARTIAL")],
    interpretationBoundary: "ZERO_REPORTED_LOSS_IS_NOT_PROOF_OF_ZERO_REALIZED_LOSS_AND_IS_NOT_FREQUENCY_WITHOUT_A_VALID_CLAIM_UNIT" }),
  factor({ factorId: "cas_triangle_maturity_and_tail_missingness", category: "MISSINGNESS",
    sourceDomain: "CAS_SCHEDULE_P", sourceLaneId: "CAS_SCHEDULE_P_RESERVE_BACKTEST",
    valueType: "COUNT_AND_MISSINGNESS_FLAGS", unit: "COMPANY_LINE_TRIANGLES",
    measurementScope: "TEN_BY_TEN_SOURCE_TRIANGLE_GROUPS_AND_POST_LAG10_DEVELOPMENT",
    temporality: "POST_DEVELOPMENT_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("dependenceStructure", "PARTIAL")],
    interpretationBoundary: "INCOMPLETE_TRIANGLES_ABSENT_POST_LAG10_TAIL_AND_UNOBSERVED_CROSS_ENTITY_DEPENDENCE_ARE_PRESERVED_NOT_IMPUTED" }),
  factor({ factorId: "fdic_resolution_cost_missing", category: "MISSINGNESS",
    sourceDomain: "US_BANK_RESOLUTION", sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
    valueType: "BOOLEAN", unit: "FAILED_OR_ASSISTED_INSTITUTION_ROW",
    measurementScope: "PUBLISHED_FAILURE_TABLE_COST_FIELD", temporality: "POST_FAILURE_SNAPSHOT",
    outcomeDerived: true, prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("capitalMeasurement", "PARTIAL")],
    interpretationBoundary: "MISSING_ESTIMATED_COST_IS_NOT_ZERO_COST_AND_FAILED_INSTITUTIONS_ARE_NOT_AN_ACTIVE_INSTITUTION_EXPOSURE_FRAME" }),
  factor({ factorId: "fdic_dividend_final_event_censoring", category: "MISSINGNESS",
    sourceDomain: "US_BANK_RECEIVERSHIP", sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
    valueType: "BOOLEAN", unit: "FUND_PRIORITY_GROUP",
    measurementScope: "PUBLISHED_RECEIVERSHIP_DIVIDEND_SEQUENCE",
    temporality: "POST_RECEIVERSHIP_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("longitudinalMaturity", "PARTIAL")],
    interpretationBoundary: "NO_PUBLISHED_FINAL_EVENT_IS_RIGHT_CENSORING_NOT_ZERO_RECOVERY_OR_CLOSURE" }),
  factor({ factorId: "judgment_fund_claim_linkage_unobserved", category: "MISSINGNESS",
    sourceDomain: "TREASURY_JUDGMENT_FUND_2026_PAYMENT_REPORTS",
    sourceLaneId: "TREASURY_JUDGMENT_FUND", valueType: "BOOLEAN",
    unit: "DATASET_SCOPE_PROPERTY", measurementScope: "PUBLISHED_PAYMENT_COMPONENT_ROWS",
    temporality: "POST_PUBLICATION_FROZEN_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "ABSENT_CONTROL_NUMBER_AND_CROSS_INTERVAL_LINKAGE_QUARANTINE_CLAIM_COUNT_FREQUENCY_DEDUP_AND_INDIVIDUAL_SEVERITY" }),
  factor({ factorId: "judgment_fund_event_to_payment_latency_unobserved",
    category: "MISSINGNESS", sourceDomain: "TREASURY_JUDGMENT_FUND_2026_PAYMENT_REPORTS",
    sourceLaneId: "TREASURY_JUDGMENT_FUND", valueType: "NULL",
    unit: "DAYS", measurementScope: "REQUEST_CERTIFICATION_DISBURSEMENT_AND_RECIPIENT_SETTLEMENT",
    temporality: "POST_PUBLICATION_FROZEN_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("temporalOrdering"),
      prerequisite("recordCompleteness", "PARTIAL")],
    interpretationBoundary: "REPORT_END_TO_CREATED_DATE_IS_PUBLICATION_TIMING_NOT_EVENT_TO_PAYMENT_OR_RECIPIENT_SETTLEMENT_LATENCY" }),
  factor({ factorId: "gao_public_decision_corpus_completeness", category: "MISSINGNESS",
    sourceDomain: "GAO_BID_PROTEST_FY2025", sourceLaneId: "GAO_BID_PROTEST",
    valueType: "BOOLEAN", unit: "ANNUAL_CORPUS_PROPERTY",
    measurementScope: "FY2025_CASE_CLOSURES_AND_PUBLIC_DECISIONS",
    temporality: "POST_FISCAL_YEAR_PUBLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "ROUTINE_DISMISSALS_NOT_PUBLIC_AND_NO_OUTCOME_NEUTRAL_COMPLETE_DECISION_SAMPLE_SO_CASE_LEVEL_MODELING_IS_QUARANTINED" }),
  factor({ factorId: "gao_published_rate_operand_missingness", category: "MISSINGNESS",
    sourceDomain: "GAO_BID_PROTEST_FY2025", sourceLaneId: "GAO_BID_PROTEST",
    valueType: "CATEGORICAL_MISSINGNESS_VECTOR", unit: "PUBLISHER_RATE_OPERANDS",
    measurementScope: "EFFECTIVENESS_ADR_SUCCESS_AND_HEARING_PERCENTAGES",
    temporality: "POST_FISCAL_YEAR_PUBLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("measurementDefinition")],
    interpretationBoundary: "MISSING_NUMERATORS_OR_DENOMINATOR_ARE_NOT_BACK_SOLVED_FROM_ROUNDED_PUBLISHER_PERCENTAGES" }),
  factor({ factorId: "rma_earning_policy_cell_count", category: "EXPOSURE",
    sourceDomain: "USDA_RMA_CROP_INSURANCE_2024", sourceLaneId: "USDA_RMA_CROP_INSURANCE_EXPERIENCE",
    valueType: "INTEGER", unit: "CELL_RECORDED_POLICY_COUNT", measurementScope: "STATE_COUNTY_CROP_COVERAGE_CELL",
    temporality: "RETROSPECTIVE_COVERAGE_YEAR", outcomeDerived: false,
    prerequisites: [prerequisite("exposureDenominator", "PARTIAL")],
    interpretationBoundary: "CELL_NUMERATOR_ANOMALIES_AND_NONUNIQUE_POLICYHOLDERS_QUARANTINE_FREQUENCY" }),
  factor({ factorId: "dmv_legacy_public_road_test_miles", category: "EXPOSURE",
    sourceDomain: "CA_DMV_LEGACY_AV_TESTING", sourceLaneId: "CA_DMV_AV_PERMIT_COLLISION_EXPOSURE",
    valueType: "INTEGER", unit: "AUTONOMOUS_PUBLIC_ROAD_TEST_MILES",
    measurementScope: "LEGACY_ANNUAL_REPORTING_COHORT", temporality: "RETROSPECTIVE_REPORTING_PERIOD",
    outcomeDerived: false, prerequisites: [prerequisite("exposureDenominator", "PARTIAL")],
    interpretationBoundary: "EXCLUDES_DEPLOYMENT_AND_OTHER_CONTEXTS_AND_IS_NOT_PAIRED_TO_SELECTED_COLLISION_FORMS" }),
  factor({ factorId: "nfip_current_contracts_in_force", category: "EXPOSURE",
    sourceDomain: "NFIP_RESIDENTIAL_PENETRATION_2026", sourceLaneId: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    valueType: "INTEGER", unit: "CONTRACTS_IN_FORCE", measurementScope: "CURRENT_NORTH_CAROLINA_SNAPSHOT",
    temporality: "POST_LOSS_CURRENT_SNAPSHOT", outcomeDerived: false,
    prerequisites: [prerequisite("exposureDenominator", "PARTIAL")],
    interpretationBoundary: "CURRENT_2026_EXPOSURE_MUST_NOT_DENOMINATE_2024_LOSS_TRANSACTIONS" }),
  factor({ factorId: "nfip_net_payment_per_publisher_record", category: "PAYMENT",
    sourceDomain: "NFIP_NC_2024_CLAIM_TRANSACTIONS", sourceLaneId: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    valueType: "DECIMAL", unit: "USD", measurementScope: "PUBLISHER_CLAIM_TRANSACTION_RECORD",
    temporality: "POST_PAYMENT", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount")],
    interpretationBoundary: "PUBLISHER_RECORD_NOT_PROVEN_UNIQUE_LOSS_AND_PAYMENT_NOT_CLOSURE" }),
  factor({ factorId: "nfip_most_recent_payment_latency_days", category: "PAYMENT",
    sourceDomain: "NFIP_NC_2024_CLAIM_TRANSACTIONS", sourceLaneId: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    valueType: "INTEGER", unit: "DAYS", measurementScope: "ELIGIBLE_PUBLISHER_RECORD",
    temporality: "POST_PAYMENT", outcomeDerived: true,
    prerequisites: [prerequisite("temporalOrdering")],
    interpretationBoundary: "MOST_RECENT_PAYMENT_DATE_NOT_CLAIM_CLOSURE_OR_FULL_RECOVERY_DATE" }),
  factor({ factorId: "cas_cumulative_paid_lag10_backtest_error", category: "PAYMENT",
    sourceDomain: "CAS_SCHEDULE_P", sourceLaneId: "CAS_SCHEDULE_P_RESERVE_BACKTEST",
    valueType: "DECIMAL", unit: "RATIO", measurementScope: "COMPANY_LINE_ACCIDENT_YEAR_COHORT",
    temporality: "OUT_OF_TIME_POST_DEVELOPMENT", outcomeDerived: true,
    prerequisites: [prerequisite("temporalOrdering"), prerequisite("dependenceStructure", "PARTIAL")],
    interpretationBoundary: "HISTORICAL_SOURCE_DOMAIN_BACKTEST_NOT_TARGET_RESERVE_FACTOR_OR_ULTIMATE_TAIL" }),
  factor({ factorId: "rma_aggregate_reported_indemnity", category: "PAYMENT",
    sourceDomain: "USDA_RMA_CROP_INSURANCE_2024", sourceLaneId: "USDA_RMA_CROP_INSURANCE_EXPERIENCE",
    valueType: "INTEGER", unit: "USD", measurementScope: "PUBLISHED_COVERAGE_YEAR_AGGREGATE",
    temporality: "RETROSPECTIVE_COVERAGE_YEAR_PUBLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount", "PARTIAL"),
      prerequisite("exposureDenominator", "PARTIAL")],
    interpretationBoundary: "PUBLISHED_AGGREGATE_INDEMNITY_IS_NOT_AN_INDIVIDUAL_CASH_RECEIPT_OR_UNIQUE_CLAIM_SEVERITY" }),
  factor({ factorId: "judgment_fund_published_payment_component_amount", category: "PAYMENT",
    sourceDomain: "TREASURY_JUDGMENT_FUND_2026_PAYMENT_REPORTS",
    sourceLaneId: "TREASURY_JUDGMENT_FUND", valueType: "INTEGER",
    unit: "USD_CENTS", measurementScope: "PUBLISHED_PAYMENT_COMPONENT_ROW",
    temporality: "POST_PAYMENT_REPORT_PUBLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"), prerequisite("outcomeSensing")],
    interpretationBoundary: "COMPONENT_AMOUNT_NOT_UNIQUE_CLAIM_INDIVIDUAL_LOSS_RECIPIENT_BANK_RECEIPT_ACCEPTANCE_COMPLETE_RECOVERY_OR_OUTSIDER_FUNDS" }),
  factor({ factorId: "cfpb_publisher_distributed_amount", category: "PAYMENT",
    sourceDomain: "CFPB_CIVIL_PENALTY_FUND", sourceLaneId: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
    valueType: "INTEGER", unit: "USD_CENTS", measurementScope: "PUBLISHER_TABLE_EVENT_TYPE",
    temporality: "POST_DISTRIBUTION_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount", "PARTIAL")],
    interpretationBoundary: "MAILED_OR_MADE_AMOUNT_NOT_INDIVIDUAL_BANK_SETTLEMENT" }),
  factor({ factorId: "ftc_consumers_sent_payment", category: "PAYMENT",
    sourceDomain: "FTC_CLOSED_REFUND_PROGRAMS_2024", sourceLaneId: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
    valueType: "INTEGER", unit: "CONSUMERS_SENT_PAYMENT", measurementScope: "CLOSED_PROGRAM_CASE",
    temporality: "POST_DISTRIBUTION", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL")],
    interpretationBoundary: "SENT_PAYMENT_NOT_CASHED_PAYMENT_OR_COMPLETE_AFFECTED_POPULATION" }),
  factor({ factorId: "nfip_recorded_claim_payment_recovery", category: "RECOVERY",
    sourceDomain: "NFIP_NC_2024_CLAIM_TRANSACTIONS", sourceLaneId: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    valueType: "DECIMAL", unit: "USD", measurementScope: "SELECTED_CLAIM_TRANSACTION_SLICE",
    temporality: "POST_RECOVERY", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"), prerequisite("longitudinalMaturity", "PARTIAL")],
    interpretationBoundary: "RECORDED_PAYMENT_RECOVERY_NOT_HARM_REVERSAL_OR_REALITY_RESTORATION" }),
  factor({ factorId: "fdic_cumulative_dividend_percent", category: "RECOVERY",
    sourceDomain: "US_BANK_RECEIVERSHIP", sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
    valueType: "DECIMAL", unit: "PERCENT", measurementScope: "FUND_AND_NORMALIZED_PRIORITY_SEQUENCE",
    temporality: "POST_DIVIDEND_EVENT", outcomeDerived: true,
    prerequisites: [prerequisite("longitudinalMaturity", "PARTIAL")],
    interpretationBoundary: "FINAL_DIVIDEND_EVENT_NOT_FULL_CLAIM_RECOVERY_OR_REALITY_RESTORATION" }),
  factor({ factorId: "fdic_closure_to_dividend_latency_days", category: "RECOVERY",
    sourceDomain: "US_BANK_RECEIVERSHIP", sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
    valueType: "INTEGER", unit: "DAYS", measurementScope: "PUBLISHED_DIVIDEND_EVENT_ROW",
    temporality: "POST_DIVIDEND_EVENT", outcomeDerived: true,
    prerequisites: [prerequisite("temporalOrdering"),
      prerequisite("longitudinalMaturity", "PARTIAL")],
    interpretationBoundary: "PUBLISHED_CLOSURE_TO_PAYMENT_INTERVAL_IS_NOT_TIME_TO_FULL_RECOVERY_AND_CENSORED_GROUPS_REMAIN_OPEN" }),
  factor({ factorId: "ftc_consumer_cashed_at_least_one_payment", category: "RECOVERY",
    sourceDomain: "FTC_CLOSED_REFUND_PROGRAMS_2024", sourceLaneId: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
    valueType: "INTEGER", unit: "CONSUMERS", measurementScope: "CLOSED_PROGRAM_CASE",
    temporality: "POST_CASHING", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL")],
    interpretationBoundary: "PROGRAM_SUMMED_AT_LEAST_ONE_CASHED_PAYMENT_COUNTS_NOT_UNIQUE_NATURAL_PERSONS_OR_FULL_INDIVIDUAL_COMPENSATION" }),
  factor({ factorId: "cpsc_publisher_reported_correction_count", category: "RECOVERY",
    sourceDomain: "CPSC_RECALL_MPR", sourceLaneId: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
    valueType: "NULLABLE_INTEGER", unit: "CORRECTIONS", measurementScope: "CORRELATED_RECALL_CASE",
    temporality: "POST_REMEDY_REPORT_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"), prerequisite("independentOutcomeReview", "PARTIAL")],
    interpretationBoundary: "FIRM_SUBMITTED_CORRECTION_NOT_INDEPENDENTLY_VERIFIED_FULL_RECOVERY" }),
  factor({ factorId: "fema_second_appeal_status", category: "ADJUDICATION",
    sourceDomain: "FEMA_PUBLIC_ASSISTANCE_SECOND_APPEALS", sourceLaneId: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    valueType: "CATEGORY", unit: "APPEAL_ROWS", measurementScope: "PUBLISHER_APPEAL_RECORD",
    temporality: "POST_ADJUDICATION_OR_PENDING", outcomeDerived: true,
    prerequisites: [prerequisite("adjudicationFinality", "PARTIAL")],
    interpretationBoundary: "PENDING_ROWS_RIGHT_CENSORED_AND_PROCEDURAL_STATUSES_NOT_MERITS_OUTCOMES" }),
  factor({ factorId: "fema_signed_second_appeal_elapsed_days", category: "ADJUDICATION",
    sourceDomain: "FEMA_PUBLIC_ASSISTANCE_SECOND_APPEALS", sourceLaneId: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    valueType: "INTEGER", unit: "DAYS", measurementScope: "SIGNED_DECISION_ROW",
    temporality: "POST_ADJUDICATION", outcomeDerived: true,
    prerequisites: [prerequisite("temporalOrdering"), prerequisite("adjudicationFinality", "PARTIAL")],
    interpretationBoundary: "DISTRIBUTION_CONDITIONED_ON_SIGNED_DECISIONS_EXCLUDES_RIGHT_CENSORED_PENDING_ROWS" }),
  factor({ factorId: "gao_sustain_merit_decision_composition", category: "ADJUDICATION",
    sourceDomain: "GAO_BID_PROTEST_FY2025", sourceLaneId: "GAO_BID_PROTEST",
    valueType: "BINOMIAL_COMPOSITION", unit: "SUSTAINS_PER_MERIT_DECISION",
    measurementScope: "FY2025_ANNUAL_AGGREGATE", temporality: "POST_FISCAL_YEAR_PUBLICATION",
    outcomeDerived: true, prerequisites: [prerequisite("outcomeSensing"),
      prerequisite("independentOutcomeReview"),
      prerequisite("adjudicationFinality", "PARTIAL")],
    interpretationBoundary: "53_OVER_380_SUPPORTS_BOUNDED_MERITS_COMPOSITION_NOT_FILED_OR_CLOSED_CASE_SUCCESS_JUDICIAL_FINALITY_OR_SELF_EXECUTING_RELIEF" }),
  factor({ factorId: "gao_hundred_day_aggregate", category: "ADJUDICATION",
    sourceDomain: "GAO_BID_PROTEST_FY2025", sourceLaneId: "GAO_BID_PROTEST",
    valueType: "INTEGER", unit: "FINAL_DECISIONS_OVER_100_DAYS",
    measurementScope: "FY2025_ANNUAL_AGGREGATE", temporality: "POST_FISCAL_YEAR_PUBLICATION",
    outcomeDerived: true, prerequisites: [prerequisite("temporalOrdering"),
      prerequisite("adjudicationFinality", "PARTIAL")],
    interpretationBoundary: "ZERO_OVER_100_DAYS_WITHOUT_ELIGIBLE_DECISION_DENOMINATOR_OR_CASE_DURATIONS_IS_NOT_A_LATENCY_DISTRIBUTION_OR_ZERO_DURATION" }),
  factor({ factorId: "fdic_estimated_resolution_cost_to_deposits", category: "CAPITAL",
    sourceDomain: "US_BANK_RESOLUTION", sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
    valueType: "DECIMAL", unit: "RATIO", measurementScope: "FAILED_OR_ASSISTED_INSTITUTION_ROW",
    temporality: "POST_FAILURE_REVISED_ESTIMATE", outcomeDerived: true,
    prerequisites: [prerequisite("capitalMeasurement", "PARTIAL")],
    interpretationBoundary: "FAILED_INSTITUTIONS_ONLY_REVISED_DIF_COST_ESTIMATE_NOT_FAILURE_RATE_OR_TARGET_CAPITAL_FACTOR" }),
  factor({ factorId: "sec_unpaid_claim_liability_reconciliation", category: "CAPITAL",
    sourceDomain: "SELECTED_PUBLIC_PROPERTY_CASUALTY_INSURER_FILING",
    sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE", valueType: "DECIMAL_IDENTITY",
    unit: "USD", measurementScope: "SAME_CURRENT_CONSOLIDATED_XBRL_CONTEXT",
    temporality: "REPORTING_PERIOD_END", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"), prerequisite("capitalMeasurement", "PARTIAL")],
    interpretationBoundary: "ISSUER_REPORTED_GAAP_LIABILITY_NOT_OUTSIDER_RESERVE" }),
  factor({ factorId: "sec_statutory_capital_scope", category: "CAPITAL",
    sourceDomain: "SELECTED_PUBLIC_PROPERTY_CASUALTY_INSURER_FILING",
    sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE", valueType: "INTEGER",
    unit: "USD", measurementScope: "DISCLOSED_ENTITY_SCOPE",
    temporality: "REPORTING_PERIOD_END", outcomeDerived: false,
    prerequisites: [prerequisite("capitalMeasurement", "PARTIAL")],
    interpretationBoundary: "AGGREGATE_SURPLUS_AND_PRINCIPAL_COMPANY_ACL_RBC_HAVE_DIFFERENT_ENTITY_SCOPE_NO_RATIO" }),
  factor({ factorId: "treasury_collateral_custody_role_structure", category: "CUSTODY",
    sourceDomain: "US_PUBLIC_FUNDS_COLLATERAL", sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
    valueType: "CATEGORICAL_STRUCTURE", unit: "INSTITUTIONAL_ROLE_GRAPH",
    measurementScope: "TREASURY_TCMM_PROGRAM_REFERENCE", temporality: "INSTITUTIONAL_CONTEXT",
    outcomeDerived: false,
    interpretationBoundary: "PUBLISHED_ROLE_STRUCTURE_WITHOUT_OUTSIDER_AGREEMENT_LEDGER_RECEIPT_OR_AUTHORITY" }),
  factor({ factorId: "sec_restricted_regulatory_deposit", category: "CUSTODY",
    sourceDomain: "SELECTED_PUBLIC_PROPERTY_CASUALTY_INSURER_FILING",
    sourceLaneId: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE", valueType: "INTEGER",
    unit: "USD", measurementScope: "CURRENT_CONSOLIDATED_XBRL_CONTEXT",
    temporality: "REPORTING_PERIOD_END", outcomeDerived: false,
    prerequisites: [prerequisite("economicAmount")],
    interpretationBoundary: "REAL_RESTRICTION_NOT_TRANSACTION_RECEIPT_NOT_OUTSIDER_CUSTODY" }),
  factor({ factorId: "cfpb_fiduciary_fund_description", category: "CUSTODY",
    sourceDomain: "CFPB_BUREAU_ADMINISTERED_REDRESS", sourceLaneId: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
    valueType: "CATEGORICAL_STRUCTURE", unit: "INSTITUTIONAL_FUND_DESCRIPTION",
    measurementScope: "FY2025_ANNUAL_REPORT", temporality: "INSTITUTIONAL_CONTEXT",
    outcomeDerived: false,
    interpretationBoundary: "CFPB_FUND_OPERATION_IS_NOT_OUTSIDER_CUSTODY_AUTHORITY" }),
  factor({ factorId: "judgment_fund_certification_offset_disbursement_roles",
    category: "CUSTODY", sourceDomain: "TREASURY_JUDGMENT_FUND_PROCESS",
    sourceLaneId: "TREASURY_JUDGMENT_FUND", valueType: "CATEGORICAL_STRUCTURE",
    unit: "INSTITUTIONAL_ROLE_AND_STATE_GRAPH",
    measurementScope: "CERTIFICATION_DEBT_SETOFF_DISBURSING_OFFSET_AND_PAYMENT_PROCESS",
    temporality: "INSTITUTIONAL_CONTEXT", outcomeDerived: false,
    prerequisites: [prerequisite("custodyExecution", "PARTIAL"),
      prerequisite("institutionalAuthority")],
    interpretationBoundary: "CERTIFICATION_IS_NOT_DISBURSEMENT_AND_POST_CERTIFICATION_OFFSET_IS_SEPARATE; OBSERVED_TREASURY_PROCESS_IS_NOT_OUTSIDER_CUSTODY_OR_PAYMENT_AUTHORITY" }),
  factor({ factorId: "ntsb_probable_cause_and_finding_text", category: "OUTCOME_SENSING",
    sourceDomain: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    sourceLaneId: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    valueType: "HASHED_TEXT_PRESENCE", unit: "COMPLETED_INVESTIGATED_CASE",
    measurementScope: "SIX_FROZEN_NTSB_CASES", temporality: "POST_INVESTIGATION_ADOPTION",
    outcomeDerived: true, prerequisites: [prerequisite("outcomeSensing"),
      prerequisite("independentOutcomeReview")],
    interpretationBoundary: "FINAL_SAFETY_FINDING_FOR_INVESTIGATED_CASE_NOT_GENERAL_CAUSAL_EFFECT_FAULT_OR_LIABILITY" }),
  factor({ factorId: "ntsb_adopted_final_report_binding", category: "ADJUDICATION",
    sourceDomain: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    sourceLaneId: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    valueType: "BOOLEAN", unit: "CASE_REPORT_BINDING",
    measurementScope: "COMPLETED_INVESTIGATION_CASE", temporality: "POST_INVESTIGATION_ADOPTION",
    outcomeDerived: true, prerequisites: [prerequisite("adjudicationFinality", "PARTIAL")],
    interpretationBoundary: "NTSB_FINALITY_IS_SAFETY_INVESTIGATION_FINALITY_NOT_RIGHTS_LIABILITY_OR_SETTLEMENT_FINALITY" }),
  factor({ factorId: "ntsb_complete_docket_bytes_captured", category: "MISSINGNESS",
    sourceDomain: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    sourceLaneId: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    valueType: "BOOLEAN", unit: "SELECTED_CASE_SET_PROPERTY",
    measurementScope: "SIX_DOCKET_INDEX_SNAPSHOTS", temporality: "POST_INVESTIGATION_SNAPSHOT",
    outcomeDerived: true, prerequisites: [prerequisite("recordCompleteness", "PARTIAL")],
    interpretationBoundary: "FALSE_MEANS_SELECTED_FACTUAL_REPORTS_PLUS_INDEXES_NOT_COMPLETE_DOCKET_CORPUS" }),
  factor({ factorId: "ntsb_postfreeze_revision_observed", category: "REVISION",
    sourceDomain: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    sourceLaneId: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    valueType: "BOOLEAN", unit: "FROZEN_SNAPSHOT_PROPERTY",
    measurementScope: "FINAL_REPORT_AND_RECOMMENDATION_STATE", temporality: "POST_FREEZE_REVISION",
    outcomeDerived: true, prerequisites: [prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "FALSE_MEANS_LATER_CORRECTIONS_AND_RECOMMENDATION_STATUS_REQUIRE_REVALIDATION" }),
  factor({ factorId: "bls_soii_private_total_recordable_rate", category: "OUTCOME_SENSING",
    sourceDomain: "BLS_SOII_2024_PRIVATE_INDUSTRY", sourceLaneId: "BLS_IIF_2024_SOII_CFOI_OIICS",
    valueType: "DECIMAL", unit: "CASES_PER_100_FTE",
    measurementScope: "PUBLISHED_PRIVATE_INDUSTRY_SURVEY_ESTIMATE", temporality: "REFERENCE_YEAR_2024",
    outcomeDerived: true, prerequisites: [prerequisite("outcomeSensing"),
      prerequisite("exposureDenominator")],
    interpretationBoundary: "SURVEY_ESTIMATE_WITH_RSE_NOT_AI_WORKER_RATE_AND_NOT_CFOI_RATE" }),
  factor({ factorId: "bls_soii_private_employee_hours", category: "EXPOSURE",
    sourceDomain: "BLS_SOII_2024_PRIVATE_INDUSTRY", sourceLaneId: "BLS_IIF_2024_SOII_CFOI_OIICS",
    valueType: "INTEGER", unit: "THOUSANDS_OF_EMPLOYEE_HOURS",
    measurementScope: "PUBLISHED_PRIVATE_INDUSTRY_SURVEY_ESTIMATE", temporality: "REFERENCE_YEAR_2024",
    outcomeDerived: false, prerequisites: [prerequisite("exposureDenominator")],
    interpretationBoundary: "SURVEY_ESTIMATED_HOURS_ONLY_JOINED_WITH_MATCHING_SOII_FRAME_NOT_NTSB_CASES" }),
  factor({ factorId: "bls_soii_relative_standard_error", category: "MISSINGNESS",
    sourceDomain: "BLS_SOII_2024_PRIVATE_INDUSTRY", sourceLaneId: "BLS_IIF_2024_SOII_CFOI_OIICS",
    valueType: "DECIMAL", unit: "PERCENT_RSE", measurementScope: "PUBLISHED_SURVEY_ESTIMATE",
    temporality: "REFERENCE_YEAR_2024_PUBLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness"), prerequisite("measurementDefinition")],
    interpretationBoundary: "RSE_MEASURES_SAMPLING_ERROR_NOT_ALL_ERROR_AND_IS_NOT_ARBITRARY_QUALITY_WEIGHT" }),
  factor({ factorId: "bls_cfoi_fatal_occupational_injury_count", category: "OUTCOME_SENSING",
    sourceDomain: "BLS_CFOI_2024", sourceLaneId: "BLS_IIF_2024_SOII_CFOI_OIICS",
    valueType: "INTEGER", unit: "FATAL_OCCUPATIONAL_INJURIES",
    measurementScope: "CFOI_DEFINED_NATIONAL_COUNT", temporality: "REFERENCE_YEAR_2024",
    outcomeDerived: true, prerequisites: [prerequisite("outcomeSensing"),
      prerequisite("populationFrame")],
    interpretationBoundary: "DISPLAYED_COUNT_PRECEDES_RATE_EXCLUSIONS_AND_MUST_NOT_BE_DIVIDED_BY_PUBLISHED_RATE_HOURS" }),
  factor({ factorId: "bls_cfoi_hours_based_rate", category: "EXPOSURE",
    sourceDomain: "BLS_CFOI_2024", sourceLaneId: "BLS_IIF_2024_SOII_CFOI_OIICS",
    valueType: "DECIMAL", unit: "FATAL_INJURIES_PER_100000_FTE",
    measurementScope: "PUBLISHED_CPS_EXPOSURE_RATE_FRAME", temporality: "REFERENCE_YEAR_2024",
    outcomeDerived: true, prerequisites: [prerequisite("exposureDenominator")],
    interpretationBoundary: "CPS_HOURS_ARE_ESTIMATED_AND_PUBLISHED_RATE_USES_EXCLUSIONS_NOT_APPLIED_TO_DISPLAYED_TOTAL_COUNT" }),
  factor({ factorId: "bls_suppression_marker", category: "MISSINGNESS",
    sourceDomain: "BLS_IIF_2024_TABLES", sourceLaneId: "BLS_IIF_2024_SOII_CFOI_OIICS",
    valueType: "CATEGORY", unit: "TABLE_CELL_MARKER", measurementScope: "PINNED_SOII_OR_CFOI_TABLE",
    temporality: "REFERENCE_YEAR_2024_PUBLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness")],
    interpretationBoundary: "SUPPRESSION_OR_PUBLICATION_THRESHOLD_MARKER_IS_NEVER_ZERO_FILLED" }),
  factor({ factorId: "bls_oiics_version", category: "REVISION",
    sourceDomain: "BLS_IIF_CLASSIFICATION", sourceLaneId: "BLS_IIF_2024_SOII_CFOI_OIICS",
    valueType: "VERSION", unit: "OIICS_VERSION", measurementScope: "SOII_AND_CFOI_REFERENCE_YEAR",
    temporality: "CLASSIFICATION_CONTEXT", outcomeDerived: false,
    prerequisites: [prerequisite("revisionAndDedup"), prerequisite("measurementDefinition")],
    interpretationBoundary: "CROSS_SERIES_POOLING_REQUIRES_EXPLICIT_VERSION_AND_BREAK_HANDLING" }),
  factor({ factorId: "ncua_audited_ncusif_financial_position", category: "CAPITAL",
    sourceDomain: "NCUA_NCUSIF_2025_FINANCIAL_STATEMENTS",
    sourceLaneId: "NCUA_NCUSIF_2025_AUDITED_EXPERIENCE",
    valueType: "DECIMAL_IDENTITY", unit: "THOUSANDS_USD",
    measurementScope: "AUDITED_NCUSIF_2025_BALANCE_SHEET",
    temporality: "REPORTING_PERIOD_END_2025_12_31", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"), prerequisite("capitalMeasurement")],
    interpretationBoundary: "ASSETS_MINUS_LIABILITIES_EQUALS_SOURCE_DOMAIN_NET_POSITION_NOT_OUTSIDER_AVAILABLE_CAPITAL_OR_CUSTODY" }),
  factor({ factorId: "ncua_insurance_liability_and_loss_provision", category: "CAPITAL",
    sourceDomain: "NCUA_NCUSIF_2025_FINANCIAL_STATEMENTS",
    sourceLaneId: "NCUA_NCUSIF_2025_AUDITED_EXPERIENCE",
    valueType: "DECIMAL_PAIR", unit: "THOUSANDS_USD",
    measurementScope: "AUDITED_INSURANCE_PROGRAM_LIABILITY_AND_ANNUAL_LOSS_PROVISION",
    temporality: "REPORTING_PERIOD_END_2025_12_31", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"), prerequisite("capitalMeasurement")],
    interpretationBoundary: "LIABILITY_AND_PROVISION_ARE_DIFFERENT_ACCOUNTING_MEASURES_AND_NEITHER_IS_PAID_CLAIM_LOSS_OR_TARGET_RESERVE" }),
  factor({ factorId: "ncua_preliminary_audited_scope_boundary", category: "REVISION",
    sourceDomain: "NCUA_NCUSIF_2025_FINANCIAL_STATEMENTS",
    sourceLaneId: "NCUA_NCUSIF_2025_AUDITED_EXPERIENCE",
    valueType: "CATEGORICAL_SCOPE_COMPARISON", unit: "PUBLISHER_FINANCIAL_RECORD",
    measurementScope: "SAME_DATE_AUDITED_STATEMENT_AND_PRELIMINARY_UNAUDITED_HEADLINES",
    temporality: "POST_PERIOD_PUBLICATION_COMPARISON", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup"),
      prerequisite("independentOutcomeReview")],
    interpretationBoundary: "PRELIMINARY_RESERVE_HEADLINE_IS_NOT_ADMITTED_AS_AUDITED_AND_MONTHLY_LOSS_REDUCTION_IS_NOT_ANNUAL_PROVISION" }),
  factor({ factorId: "pbgc_heterogeneous_availability_frames", category: "MISSINGNESS",
    sourceDomain: "PBGC_PENSION_INSURANCE_2024_2025",
    sourceLaneId: "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
    valueType: "CATEGORICAL_YEAR_FRAME", unit: "PLAN_YEAR_PREMIUM_YEAR_FISCAL_YEAR",
    measurementScope: "FIRST_INSTALLMENT_2024_TABLES_AND_FY2025_OPERATIONAL_REPORT",
    temporality: "POST_PUBLICATION_AVAILABILITY", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("temporalOrdering", "PARTIAL")],
    interpretationBoundary: "PLAN_YEAR_2023_PREMIUM_YEAR_2024_AND_FISCAL_YEAR_2025_ARE_NOT_A_COMMON_DENOMINATOR_AND_LATER_INSTALLMENTS_REMAIN_MISSING" }),
  factor({ factorId: "pbgc_direct_benefit_payment", category: "PAYMENT",
    sourceDomain: "PBGC_PENSION_INSURANCE_2024_2025",
    sourceLaneId: "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
    valueType: "DECIMAL", unit: "MILLIONS_USD",
    measurementScope: "FY2025_SINGLE_EMPLOYER_DIRECT_BENEFIT_AGGREGATE",
    temporality: "POST_FISCAL_YEAR_PAYMENT_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"), prerequisite("outcomeSensing")],
    interpretationBoundary: "PROGRAM_AGGREGATE_NOT_INDIVIDUAL_RECEIPT_ACCEPTANCE_OR_OUTSIDER_PAID_SEVERITY" }),
  factor({ factorId: "pbgc_traditional_and_sfa_payment_separation", category: "PAYMENT",
    sourceDomain: "PBGC_PENSION_INSURANCE_2024_2025",
    sourceLaneId: "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
    valueType: "DECIMAL_PAIR", unit: "MILLIONS_USD",
    measurementScope: "FY2025_MULTIEMPLOYER_TRADITIONAL_AND_SPECIAL_FINANCIAL_ASSISTANCE",
    temporality: "POST_FISCAL_YEAR_PAYMENT_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"), prerequisite("outcomeSensing")],
    interpretationBoundary: "TRADITIONAL_ASSISTANCE_AND_SFA_HAVE_DIFFERENT_PROGRAM_AND_PARTICIPANT_ROOTS_AND_ARE_NEVER_POOLED" }),
  factor({ factorId: "pbgc_sfa_death_audit_repayment", category: "RECOVERY",
    sourceDomain: "PBGC_PENSION_INSURANCE_2024_2025",
    sourceLaneId: "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
    valueType: "DECIMAL", unit: "MILLIONS_USD",
    measurementScope: "FY2025_SFA_RETROSPECTIVE_DEATH_AUDIT_REPAYMENT",
    temporality: "POST_AUDIT_REPAYMENT_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"),
      prerequisite("longitudinalMaturity", "PARTIAL")],
    interpretationBoundary: "SFA_REPAYMENT_IS_NOT_ORDINARY_CLAIM_RECOVERY_HARM_REVERSAL_OR_TARGET_RECOVERY_FACTOR" }),
  factor({ factorId: "msha_reported_accident_outcome_rows", category: "OUTCOME_SENSING",
    sourceDomain: "MSHA_REPORTED_ACCIDENT_AND_EMPLOYMENT_2000_2026",
    sourceLaneId: "MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026",
    valueType: "COUNT_VECTOR", unit: "REGULATOR_REPORTED_ACCIDENT_DOCUMENT_ROWS",
    measurementScope: "FROZEN_2000_TO_2026_Q3_ACCIDENT_EXPORT",
    temporality: "POST_ACCIDENT_REPORT_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("recordCompleteness", "PARTIAL")],
    interpretationBoundary: "REPORTED_ROWS_AND_INJURY_CODES_ARE_NOT_INDEPENDENT_SENSOR_TRUTH_CAUSAL_ADJUDICATION_OR_TARGET_EVENTS" }),
  factor({ factorId: "msha_quarterly_employment_hours", category: "EXPOSURE",
    sourceDomain: "MSHA_REPORTED_ACCIDENT_AND_EMPLOYMENT_2000_2026",
    sourceLaneId: "MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026",
    valueType: "INTEGER_PAIR", unit: "EMPLOYEE_HOURS",
    measurementScope: "SEPARATE_MINE_AND_CONTRACTOR_QUARTERLY_EXPOSURE_EXPORTS",
    temporality: "RETROSPECTIVE_COMPLETE_THROUGH_2026_Q2", outcomeDerived: false,
    prerequisites: [prerequisite("exposureDenominator", "PARTIAL")],
    interpretationBoundary: "MINE_AND_CONTRACTOR_FRAMES_REMAIN_SEPARATE_AND_INVALID_OR_ZERO_HOUR_ROWS_ARE_NOT_SILENTLY_REPAIRED" }),
  factor({ factorId: "msha_current_window_denominator_mismatch", category: "MISSINGNESS",
    sourceDomain: "MSHA_REPORTED_ACCIDENT_AND_EMPLOYMENT_2000_2026",
    sourceLaneId: "MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026",
    valueType: "QUARTER_PAIR_AND_CENSOR_FLAG", unit: "CALENDAR_QUARTER",
    measurementScope: "CURRENT_ACCIDENT_AND_EMPLOYMENT_WINDOWS",
    temporality: "FROZEN_SNAPSHOT_2026_08_21", outcomeDerived: true,
    prerequisites: [prerequisite("temporalOrdering"),
      prerequisite("exposureDenominator", "PARTIAL")],
    interpretationBoundary: "RIGHT_CENSORED_2026_Q3_ACCIDENTS_CANNOT_BE_DIVIDED_BY_2026_Q2_EXPOSURE_AND_NO_CURRENT_RATE_IS_ADMITTED" }),
  factor({ factorId: "cdi_filing_acceptance_disposition_boundary", category: "ADJUDICATION",
    sourceDomain: "CDI_RATE_FILING_AND_REGISTRY",
    sourceLaneId: "CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE",
    valueType: "CATEGORICAL_STATUS_CHAIN", unit: "REGULATORY_FILING",
    measurementScope: "CDI_FILING_11_5668_AND_2025_CLOSED_REGISTRY",
    temporality: "POST_FILING_ADMINISTRATIVE_STATUS", outcomeDerived: true,
    prerequisites: [prerequisite("adjudicationFinality", "PARTIAL"),
      prerequisite("temporalOrdering")],
    interpretationBoundary: "PROPOSED_AND_ACCEPTED_DO_NOT_MEAN_APPROVED_AND_APPROVED_RATE_CHANGE_DOES_NOT_MEAN_CHARGED_POLICY_PRICE" }),
  factor({ factorId: "cdi_filed_experience_reconciliation", category: "MISSINGNESS",
    sourceDomain: "CDI_RATE_FILING_AND_REGISTRY",
    sourceLaneId: "CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE",
    valueType: "DECIMAL_RECONCILIATION", unit: "USD",
    measurementScope: "TEN_FILED_2001_TO_2010_EXPERIENCE_ROWS_AND_PUBLISHED_TOTAL",
    temporality: "POST_FILING_PUBLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("economicAmount")],
    interpretationBoundary: "THE_PUBLISHED_ONE_DOLLAR_TRENDED_LOSS_TOTAL_DIFFERENCE_IS_PRESERVED_NOT_SILENTLY_CORRECTED_OR_USED_AS_TARGET_LOSS" }),
  factor({ factorId: "cdi_filed_earned_exposure", category: "EXPOSURE",
    sourceDomain: "CDI_RATE_FILING_AND_REGISTRY",
    sourceLaneId: "CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE",
    valueType: "INTEGER", unit: "FILED_EARNED_EXPOSURES",
    measurementScope: "ONE_2001_TO_2010_MEDICAL_MALPRACTICE_FILED_COHORT",
    temporality: "RETROSPECTIVE_FILED_EXPERIENCE", outcomeDerived: false,
    prerequisites: [prerequisite("exposureDenominator", "PARTIAL")],
    interpretationBoundary: "ONE_CORRELATED_FILED_COHORT_NOT_COMPLETE_SERFF_POLICY_OR_TARGET_DOMAIN_EXPOSURE" }),
  factor({ factorId: "ncigf_statutory_assessment_capacity", category: "CAPITAL",
    sourceDomain: "NCIGF_ASSESSMENT_CAPACITY",
    sourceLaneId: "NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE",
    valueType: "DECIMAL", unit: "USD",
    measurementScope: "2026_Q2_STATE_FUND_ACCOUNT_GRAND_TOTAL",
    temporality: "PARTIAL_YEAR_2026_Q2_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("capitalMeasurement", "PARTIAL"),
      prerequisite("economicAmount")],
    interpretationBoundary: "STATUTORY_CALLING_CAPACITY_IS_NOT_CASH_HELD_TRANSFERRED_CAPITAL_OUTSIDER_CAPITAL_OR_CUSTODY" }),
  factor({ factorId: "ncigf_assessment_refund_net_reconciliation", category: "CAPITAL",
    sourceDomain: "NCIGF_ASSESSMENT_CAPACITY",
    sourceLaneId: "NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE",
    valueType: "DECIMAL_IDENTITY", unit: "USD",
    measurementScope: "2026_Q2_AUTHORIZED_ASSESSMENT_AND_REFUND_GRAND_TOTAL",
    temporality: "PARTIAL_YEAR_2026_Q2_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("capitalMeasurement", "PARTIAL"),
      prerequisite("economicAmount")],
    interpretationBoundary: "AUTHORIZED_MINUS_REFUNDS_EQUALS_REPORTED_NET_AUTHORIZATION_NOT_CASH_CALL_TRANSFER_CUSTODY_OR_AVAILABLE_TARGET_CAPITAL" }),
  factor({ factorId: "ncigf_publisher_verification_and_estimate_boundary",
    category: "MISSINGNESS", sourceDomain: "NCIGF_ASSESSMENT_CAPACITY",
    sourceLaneId: "NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE",
    valueType: "CATEGORICAL_QUALIFICATION", unit: "PUBLISHER_REPORT_SCOPE",
    measurementScope: "QUARTERLY_FIVE_YEAR_AND_INCEPTION_COMPILATIONS",
    temporality: "POST_PUBLICATION_QUALIFICATION", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "THIRD_PARTY_DATA_ESTIMATES_AND_NO_INDEPENDENT_NCIGF_VERIFICATION_REMAIN_EXPLICIT_AND_PRECLUDE_AUDIT_OR_AUTHORITY_CLAIMS" }),
  factor({ factorId: "fra_calendar_year_reported_outcomes", category: "OUTCOME_SENSING",
    sourceDomain: "FRA_FORM54_FORM55_2015_2019",
    sourceLaneId: "FRA_FORM54_FORM55_2015_2019",
    valueType: "ANNUAL_COUNT_VECTOR", unit: "OPERATOR_REPORTED_FRA_FORM54_OUTCOME",
    measurementScope: "2015_TO_2019_JOINTCD_ONE_REPRESENTATIVE_INCIDENT_ROWS",
    temporality: "POST_CALENDAR_YEAR_REPORTING", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("populationFrame", "PARTIAL"), prerequisite("temporalOrdering")],
    interpretationBoundary: "REPORTED_INCIDENT_FATALITY_INJURY_HAZMAT_AND_EVACUATION_COUNTS_ARE_SOURCE_DOMAIN_OUTCOMES_NOT_INDEPENDENT_SENSOR_TRUTH_CAUSAL_EFFECTS_OR_TARGET_EVENTS" }),
  factor({ factorId: "fra_calendar_year_operational_exposure", category: "EXPOSURE",
    sourceDomain: "FRA_FORM54_FORM55_2015_2019",
    sourceLaneId: "FRA_FORM54_FORM55_2015_2019",
    valueType: "ANNUAL_INTEGER_VECTOR", unit: "TRAIN_MILE_AND_EMPLOYEE_HOUR",
    measurementScope: "2015_TO_2019_DEDUPLICATED_FORM55_CALENDAR_YEAR_AGGREGATES",
    temporality: "RETROSPECTIVE_MATCHED_CALENDAR_YEAR", outcomeDerived: false,
    prerequisites: [prerequisite("exposureDenominator", "PARTIAL"),
      prerequisite("temporalOrdering"), prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "CALENDAR_YEAR_ALIGNMENT_SUPPORTS_ONLY_FRA_SOURCE_DOMAIN_RATE_DESCRIPTION_AND_IS_NOT_INCIDENT_OPERATOR_OR_TARGET_EXPOSURE_LINKAGE" }),
  factor({ factorId: "fra_calendar_year_rate_diagnostics", category: "OUTCOME_SENSING",
    sourceDomain: "FRA_FORM54_FORM55_2015_2019",
    sourceLaneId: "FRA_FORM54_FORM55_2015_2019",
    valueType: "ANNUAL_AND_POOLED_RATE_VECTOR",
    unit: "REPORTED_OUTCOME_PER_MILLION_TRAIN_MILES",
    measurementScope: "2015_TO_2019_FORM54_OUTCOMES_OVER_MATCHED_YEAR_FORM55_TRAIN_MILES",
    temporality: "POST_OUTCOME_RETROSPECTIVE_RATE", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("exposureDenominator", "PARTIAL"),
      prerequisite("populationFrame", "PARTIAL"), prerequisite("temporalOrdering")],
    interpretationBoundary: "RECOMPUTABLE_SOURCE_DOMAIN_CALENDAR_RATES_NOT_PRE_ACTION_FACTORS_CAUSAL_RATES_TARGET_FREQUENCY_OR_PRICE_INPUTS" }),
  factor({ factorId: "fra_reported_accident_damage_cost", category: "OUTCOME_SENSING",
    sourceDomain: "FRA_FORM54_FORM55_2015_2019",
    sourceLaneId: "FRA_FORM54_FORM55_2015_2019",
    valueType: "ANNUAL_AND_POOLED_DECIMAL_VECTOR",
    unit: "REPORTED_DAMAGE_USD_AND_REPORTED_DAMAGE_USD_PER_TRAIN_MILE",
    measurementScope: "2015_TO_2019_ABOVE_THRESHOLD_FORM54_REPORTED_DAMAGE",
    temporality: "POST_ACCIDENT_OPERATOR_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("economicAmount"),
      prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("populationFrame", "PARTIAL")],
    interpretationBoundary: "REPORTED_ACCIDENT_DAMAGE_COST_IS_STRICTLY_NOT_PAID_LOSS_INCURRED_LOSS_ULTIMATE_LOSS_CLAIM_SETTLEMENT_RECOVERY_OR_TARGET_SEVERITY" }),
  factor({ factorId: "fra_canonical_query_chain", category: "REVISION",
    sourceDomain: "FRA_FORM54_FORM55_2015_2019",
    sourceLaneId: "FRA_FORM54_FORM55_2015_2019",
    valueType: "QUERY_AND_RESPONSE_PIN_PROFILE", unit: "CANONICAL_API_QUERY_RECEIPT",
    measurementScope: "SEVEN_FORM54_FORM55_COUNT_ANNUAL_CAUSE_AND_DUPLICATE_RECEIPTS",
    temporality: "FROZEN_SOURCE_SNAPSHOT_2026_08_21", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL"),
      prerequisite("recordCompleteness", "PARTIAL")],
    interpretationBoundary: "PINNED_QUERY_RESPONSES_AND_SCHEMAS_SUPPORT_REPRODUCTION_BUT_NO_RAW_ROW_POPULATION_TRANSPORT_ATTESTATION_OR_IMMUTABLE_PUBLISHER_VERSION" }),
  factor({ factorId: "fra_threshold_and_population_missingness", category: "MISSINGNESS",
    sourceDomain: "FRA_FORM54_FORM55_2015_2019",
    sourceLaneId: "FRA_FORM54_FORM55_2015_2019",
    valueType: "CATEGORICAL_SCOPE_FLAGS", unit: "FRA_REPORTING_FRAME_PROPERTY",
    measurementScope: "2015_TO_2019_FORM54_SELECTED_POPULATION",
    temporality: "POST_FREEZE_POPULATION_ASSESSMENT", outcomeDerived: true,
    prerequisites: [prerequisite("populationFrame", "PARTIAL"),
      prerequisite("recordCompleteness", "PARTIAL")],
    interpretationBoundary: "ABOVE_THRESHOLD_JOINTCD_ONE_ROWS_EXCLUDE_BELOW_THRESHOLD_ACCOUNTABLE_ACCIDENTS_AND_MUST_NOT_BE_CALLED_ALL_RAILROAD_ACCIDENTS" }),
  factor({ factorId: "fra_deduplication_and_correlation_boundary", category: "REVISION",
    sourceDomain: "FRA_FORM54_FORM55_2015_2019",
    sourceLaneId: "FRA_FORM54_FORM55_2015_2019",
    valueType: "DEDUP_AND_DEPENDENCE_PROFILE", unit: "COMPOSITE_KEY_AND_CALENDAR_ROOT",
    measurementScope: "FORM54_REPRESENTATIVE_ROWS_AND_FORM55_RAILROAD_YEAR_MONTH_ROWS",
    temporality: "POST_FREEZE_DEDUPLICATION", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL"),
      prerequisite("dependenceStructure", "PARTIAL")],
    interpretationBoundary: "ONE_IDENTICAL_FORM55_METRIC_DUPLICATE_IS_REMOVED_BUT_SHARED_OPERATOR_AND_TIME_ROOTS_REMAIN_AND_YEARS_OR_OPERATORS_ARE_NOT_IID" }),
  factor({ factorId: "nhtsa_recall_campaign_identity_and_dedup", category: "REVISION",
    sourceDomain: "NHTSA_RECALL_REMEDY_2026_08_21",
    sourceLaneId: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    valueType: "POPULATION_AND_DEDUP_PROFILE",
    unit: "RECALL_FLAT_FILE_RECORD_AND_RECALL_CAMPAIGN",
    measurementScope: "OFFICIAL_NAMED_POST_2010_RECALL_SLICE",
    temporality: "FROZEN_SOURCE_SNAPSHOT_2026_08_21", outcomeDerived: false,
    prerequisites: [prerequisite("populationFrame", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "PRODUCT_ROWS_ARE_DEDUPLICATED_TO_CAMPAIGN_IDENTITIES_BUT_CAMPAIGNS_ARE_NOT_UNIQUE_VEHICLES_CURRENT_EXPOSURES_CAUSAL_OUTCOMES_OR_TARGET_EVENTS" }),
  factor({ factorId: "nhtsa_quarterly_latest_status_composition",
    category: "OUTCOME_SENSING", sourceDomain: "NHTSA_RECALL_REMEDY_2026_08_21",
    sourceLaneId: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    valueType: "CUMULATIVE_STATUS_COUNT_AND_RATIO_VECTOR",
    unit: "LATEST_SELECTED_QUARTERLY_MANUFACTURER_STATUS_ROW_PER_CAMPAIGN",
    measurementScope: "CAPTURED_QUARTERLY_STATUS_CAMPAIGNS",
    temporality: "LATEST_OBSERVED_AT_FROZEN_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("populationFrame", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL"),
      prerequisite("dependenceStructure", "PARTIAL")],
    interpretationBoundary: "CUMULATIVE_MANUFACTURER_STATUS_COMPOSITION_NOT_UNIQUE_REPAIR_RECEIPTS_COMPLETE_REPAIR_FREQUENCY_SEVERITY_LOSS_OR_TARGET_RATE" }),
  factor({ factorId: "nhtsa_annual_latest_status_composition",
    category: "OUTCOME_SENSING", sourceDomain: "NHTSA_RECALL_REMEDY_2026_08_21",
    sourceLaneId: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    valueType: "CUMULATIVE_STATUS_COUNT_AND_RATIO_VECTOR",
    unit: "LATEST_SELECTED_ANNUAL_MANUFACTURER_STATUS_ROW_PER_CAMPAIGN",
    measurementScope: "PUBLISHER_ELIGIBLE_CAPTURED_ANNUAL_STATUS_CAMPAIGNS",
    temporality: "LATEST_OBSERVED_AT_FROZEN_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("populationFrame", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL"),
      prerequisite("dependenceStructure", "PARTIAL")],
    interpretationBoundary: "ANNUAL_ELIGIBILITY_AND_COHORT_DIFFERENCES_PRECLUDE_COMPARISON_TO_QUARTERLY_RATIO_OR_ANY_COMPLETE_REPAIR_TARGET_RATE" }),
  factor({ factorId: "nhtsa_latest_status_revision_selection", category: "REVISION",
    sourceDomain: "NHTSA_RECALL_REMEDY_2026_08_21",
    sourceLaneId: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    valueType: "DETERMINISTIC_ROW_SELECTION_RULE",
    unit: "CAMPAIGN_STATUS_SNAPSHOT_SELECTION",
    measurementScope: "QUARTERLY_AND_ANNUAL_CUMULATIVE_STATUS_ROWS",
    temporality: "POST_STATUS_REPORT_REVISION_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL"),
      prerequisite("temporalOrdering", "PARTIAL"),
      prerequisite("longitudinalMaturity", "PARTIAL")],
    interpretationBoundary: "LATEST_OBSERVED_SELECTION_IS_REPRODUCIBLE_FOR_FROZEN_BYTES_BUT_NOT_GUARANTEED_LATEST_PUBLISHER_TRUTH_AFTER_FREEZE_OR_FINAL_CLOSURE" }),
  factor({ factorId: "nhtsa_status_right_censoring", category: "MISSINGNESS",
    sourceDomain: "NHTSA_RECALL_REMEDY_2026_08_21",
    sourceLaneId: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    valueType: "CENSOR_AND_REVISION_FLAGS", unit: "FROZEN_PUBLICATION_SNAPSHOT",
    measurementScope: "CURRENT_2026_RECALL_AND_STATUS_PERIODS",
    temporality: "RIGHT_CENSORED_AT_2026_08_21_FREEZE", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("temporalOrdering", "PARTIAL"),
      prerequisite("longitudinalMaturity", "PARTIAL")],
    interpretationBoundary: "CURRENT_PERIOD_AND_POST_FREEZE_REVISIONS_ARE_UNOBSERVED_SO LATEST_STATUS_IS_NOT_CLOSED_COMPLETE_OR_FINAL" }),
  factor({ factorId: "nhtsa_recall_status_population_reconciliation",
    category: "MISSINGNESS", sourceDomain: "NHTSA_RECALL_REMEDY_2026_08_21",
    sourceLaneId: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    valueType: "CAMPAIGN_LEVEL_RECONCILIATION_PROFILE",
    unit: "LINKED_RECALL_CAMPAIGN_AND_STATUS_CAMPAIGN",
    measurementScope: "LATEST_QUARTERLY_AND_ANNUAL_STATUS_TO_POST_2010_RECALL_LINKAGE",
    temporality: "POST_LINKAGE_FROZEN_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("populationFrame", "PARTIAL"),
      prerequisite("exposureDenominator", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "POTENTIALLY_AFFECTED_AND_STATUS_INVOLVED_POPULATIONS_CAN_DIFFER_AND_NEITHER_IS_CURRENT_IN_SERVICE_EXPOSURE_OR_A BORROWABLE_TARGET_DENOMINATOR" }),
  factor({ factorId: "nhtsa_malformed_period_and_component_anomalies",
    category: "MISSINGNESS", sourceDomain: "NHTSA_RECALL_REMEDY_2026_08_21",
    sourceLaneId: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    valueType: "ANOMALY_COUNT_AND_HASHED_EXAMPLE_PROFILE",
    unit: "MANUFACTURER_STATUS_REPORT_ROW",
    measurementScope: "QUARTERLY_AND_ANNUAL_STATUS_SOURCE_ROWS",
    temporality: "POST_SOURCE_QUALITY_REPLAY", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("measurementDefinition"),
      prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "MALFORMED_PERIOD_ZERO_INVOLVED_AND_COMPONENT_SUM_ANOMALIES_ARE RETAINED_NOT_NORMALIZED_IMPUTED_OR_USED_AS_COMPLETE_REPAIR_OR_LOSS_EVIDENCE" }),
  factor({ factorId: "waymo_displayed_rider_only_miles",
    category: "EXPOSURE", sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
    sourceLaneId: "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    valueType: "DECIMAL_DISPLAY_POINT", unit: "RIDER_ONLY_MILES",
    measurementScope: "PUBLISHER_ALL_LOCATIONS_MILEAGE_BLENDED_ROW",
    temporality: "RETROSPECTIVE_RELEASE_THROUGH_2026_03", outcomeDerived: false,
    prerequisites: [prerequisite("exposureDenominator", "PARTIAL"),
      prerequisite("populationFrame", "PARTIAL")],
    interpretationBoundary: "220613000_IS_A_DISPLAYED_ROUNDED_POINT_NOT_EXACT_UNROUNDED_EXPOSURE_AND_OVERLAPPING_COMPOSITE_GEOGRAPHIES_MUST_NOT_BE_SUMMED" }),
  factor({ factorId: "waymo_sgo_row_membership_outcome_composition",
    category: "OUTCOME_SENSING", sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
    sourceLaneId: "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    valueType: "CATEGORICAL_COUNT_VECTOR", unit: "PUBLISHER_CSV_MEMBERSHIP_ROWS",
    measurementScope: "EIGHT_PUBLISHER_OUTCOME_MEMBERSHIP_FLAGS",
    temporality: "POST_SGO_LINKED_PUBLISHER_REPORT", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "ROW_MEMBERSHIP_COUNTS_ARE_NOT_INDEPENDENT_DEDUPLICATED_CRASH_COUNTS_OR_INDEPENDENTLY_ADJUDICATED_OUTCOMES" }),
  factor({ factorId: "waymo_duplicate_sgo_id_version_conflict_profile",
    category: "REVISION", sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
    sourceLaneId: "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    valueType: "CONFLICT_COUNT_PROFILE", unit: "DUPLICATE_SGO_ID_VERSION_PAIR",
    measurementScope: "OUTCOME_FLAGS_AND_PRIVACY_MINIMIZED_LOCATION_COMMITMENTS",
    temporality: "POST_REPORT_DUPLICATE_QUARANTINE", outcomeDerived: true,
    prerequisites: [prerequisite("revisionAndDedup", "PARTIAL"),
      prerequisite("privacyProjection")],
    interpretationBoundary: "THREE_DUPLICATE_PAIRS_INCLUDE_TWO_OUTCOME_CONFLICTS_AND_ONE_LOCATION_TEXT_CONFLICT_AND_ARE_NEITHER_SILENTLY_DEDUPLICATED_NOR_COUNTED_AS_INDEPENDENT_EVENTS" }),
  factor({ factorId: "waymo_published_all_location_benchmark_factor_profile",
    category: "OUTCOME_SENSING", sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
    sourceLaneId: "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    valueType: "RATE_AND_INTERVAL_VECTOR", unit: "PUBLISHER_IPMM_AND_RATE_RATIO",
    measurementScope: "SIXTEEN_ALL_LOCATION_ALL_CRASH_PUBLISHED_FACTOR_ROWS",
    temporality: "RETROSPECTIVE_PUBLISHER_BENCHMARK_RELEASE", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("exposureDenominator", "PARTIAL"),
      prerequisite("dependenceStructure", "PARTIAL")],
    interpretationBoundary: "PUBLISHER_RATE_RATIOS_ARE_BOUND_REFERENCE_FACTORS_NOT_AN_OUTSIDER_RECALIBRATION_INDEPENDENT_METHOD_REVIEW_TARGET_TRANSFER_OR_PRICE" }),
  factor({ factorId: "waymo_published_nonfinite_benchmark_tokens",
    category: "MISSINGNESS", sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
    sourceLaneId: "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    valueType: "FIELD_COUNT_VECTOR", unit: "LITERAL_NONFINITE_CSV_TOKEN",
    measurementScope: "CSV3_NUMERIC_BENCHMARK_FIELDS", temporality: "POST_PUBLICATION_PARSE",
    outcomeDerived: true, prerequisites: [prerequisite("recordCompleteness", "PARTIAL")],
    interpretationBoundary: "164_LITERAL_NAN_TOKENS_ARE_PRESERVED_AS_MISSING_NOT_ZERO_FINITE_OR_DROPPED" }),
  factor({ factorId: "waymo_dynamic_benchmark_duplicate_conflict_profile",
    category: "MISSINGNESS", sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
    sourceLaneId: "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    valueType: "DUPLICATE_AND_CONFLICT_COUNT_PROFILE", unit: "CSV4_COMPOSITE_KEY",
    measurementScope: "SPATIAL_DYNAMIC_BENCHMARK_INPUTS_THROUGH_2025_03",
    temporality: "POST_PUBLICATION_PARSE", outcomeDerived: true,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL"),
      prerequisite("dependenceStructure", "PARTIAL")],
    interpretationBoundary: "544_DUPLICATE_KEYS_AND_489_BENCHMARK_CRASH_COUNT_CONFLICT_KEYS_ARE_PRESERVED_WITHOUT_AGGREGATION_AND_THE_2025_03_WINDOW_IS_NOT_POOLED_WITH_2026_03" }),
  factor({ factorId: "waymo_retrospective_calendar_holdout_candidate",
    category: "REVISION", sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
    sourceLaneId: "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    valueType: "TEMPORAL_SPLIT_PROFILE", unit: "PUBLISHER_CSV_ROW",
    measurementScope: "REFERENCE_THROUGH_2025_12_AND_HOLDOUT_2026_01_TO_2026_03",
    temporality: "DECLARED_AFTER_ALL_SPLIT_OUTCOMES_OCCURRED", outcomeDerived: true,
    prerequisites: [prerequisite("temporalOrdering", "PARTIAL"),
      prerequisite("revisionAndDedup", "PARTIAL")],
    interpretationBoundary: "RETROSPECTIVE_CALENDAR_PARTITION_IS_NOT_A_PROSPECTIVE_PREREGISTERED_OR_EXTERNAL_TARGET_HOLDOUT" }),
  factor({ factorId: "bridgedata_v2_captured_record_coverage",
    category: "MISSINGNESS", sourceDomain: "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORIES",
    sourceLaneId: "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE",
    valueType: "COVERAGE_AND_STRUCTURE_PROFILE", unit: "TFRECORD_TRAJECTORY_RECORD",
    measurementScope: "ONE_COMPLETE_RECORD_FROM_FIRST_TRAIN_SHARD",
    temporality: "POST_CAPTURE_CANDIDATE_QUALITY_REVIEW", outcomeDerived: false,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("populationFrame", "PARTIAL")],
    admittedUse: "SOURCE_DOMAIN_TRAINING_CANDIDATE_QUALITY_DIAGNOSTIC",
    interpretationBoundary: "ONE_OF_53192_TRAIN_RECORDS_AND_ZERO_COMPLETE_SHARDS_ESTABLISH_SAMPLE_STRUCTURE_NOT_FULL_CORPUS_CONFORMANCE_REPRESENTATIVENESS_OR_MODEL_CAPABILITY" }),
  factor({ factorId: "bridgedata_v2_semantic_correlation_and_training_gap_profile",
    category: "MISSINGNESS", sourceDomain: "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORIES",
    sourceLaneId: "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE",
    valueType: "BOOLEAN_GAP_VECTOR", unit: "TRAINING_CANDIDATE_GATE",
    measurementScope: "SEMANTICS_NEGATIVE_LABELS_CORRELATION_RIGHTS_SPLIT_AND_TARGET_TRANSFER",
    temporality: "POST_CAPTURE_CANDIDATE_QUALITY_REVIEW", outcomeDerived: false,
    prerequisites: [prerequisite("recordCompleteness", "PARTIAL"),
      prerequisite("rightsAndConsent", "PARTIAL")],
    admittedUse: "SOURCE_DOMAIN_TRAINING_CANDIDATE_QUALITY_DIAGNOSTIC",
    interpretationBoundary: "TRAINER_ROWS_REMAIN_ZERO_UNTIL_SEMANTIC_CONTENT_CORRELATION_NEGATIVE_LABEL_RIGHTS_AND_TARGET_HOLDOUT_GATES_ARE_RESOLVED" }),
  factor({ factorId: "clinicaltrials_complete_posting_window_profile",
    category: "REVISION", sourceDomain: "CLINICALTRIALS_GOV_POSTED_RESULTS_2026_07_01",
    sourceLaneId: "CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE",
    valueType: "CLOSED_QUERY_POPULATION_PROFILE", unit: "NCT_STUDY_RECORD",
    measurementScope: "ALL_RESULTS_FIRST_POSTED_ON_2026_07_01_AT_FROZEN_DATA_TIMESTAMP",
    temporality: "POST_REGISTRY_PUBLICATION_FROZEN_SNAPSHOT", outcomeDerived: true,
    prerequisites: [prerequisite("populationFrame"), prerequisite("recordCompleteness"),
      prerequisite("revisionAndDedup")],
    interpretationBoundary: "EIGHTEEN_RECORDS_COMPLETE_THE_FROZEN_ONE_DAY_QUERY_WINDOW_NOT_ALL_CLINICAL_STUDIES_A_TARGET_POPULATION_OR_A_FUTURE_REVISION_FREE_CORPUS" }),
  factor({ factorId: "clinicaltrials_posted_aggregate_outcome_profile",
    category: "OUTCOME_SENSING",
    sourceDomain: "CLINICALTRIALS_GOV_POSTED_RESULTS_2026_07_01",
    sourceLaneId: "CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE",
    valueType: "STUDY_AND_ROW_COUNT_PROFILE", unit: "SPONSOR_POSTED_AGGREGATE_ROW",
    measurementScope: "OUTCOME_MEASURES_AND_ADVERSE_EVENTS_WITHIN_EIGHTEEN_NCT_STUDIES",
    temporality: "POST_SPONSOR_OR_INVESTIGATOR_RESULTS_POSTING", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL"),
      prerequisite("dependenceStructure", "PARTIAL")],
    interpretationBoundary: "POSTED_OUTCOME_AND_ADVERSE_EVENT_ROWS_ARE_STUDY_CORRELATED_SPONSOR_OR_INVESTIGATOR_SUPPLIED_AND_NOT_INDEPENDENT_SCIENTIFIC_ACCURACY_OR_CAUSAL_ADJUDICATION" }),
  factor({ factorId: "clinicaltrials_nonpooling_and_admission_gap_profile",
    category: "MISSINGNESS",
    sourceDomain: "CLINICALTRIALS_GOV_POSTED_RESULTS_2026_07_01",
    sourceLaneId: "CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE",
    valueType: "BOOLEAN_GAP_VECTOR", unit: "STUDY_LEVEL_ADMISSION_GATE",
    measurementScope: "CROSS_STUDY_POOLING_CAUSALITY_RIGHTS_TARGET_TRANSFER_TRAINING_AND_PRICE",
    temporality: "POST_SOURCE_QUALITY_AND_RIGHTS_REVIEW", outcomeDerived: true,
    prerequisites: [prerequisite("outcomeSensing", "PARTIAL")],
    interpretationBoundary: "DERIVED_RECORDS_STRIP_SPONSOR_PERSON_NAMES_AND_RAW_RECORD_NAME_COMMITMENTS; TERMS_AND_DISCLAIMER_URLS_ARE_NOT_REPLAYED_SO_RIGHTS_ARE_NOT_ESTABLISHED; NO_STUDY_TERM_GROUP_OR_RATE_POOLING_AND_ZERO_TRAINING_ROWS_PRICE_OR_AUTHORITY_UNTIL_INDEPENDENT_LABEL_CAUSAL_TARGET_RIGHTS_AND_PROSPECTIVE_HOLDOUT_CONTRACTS_EXIST" }),
]);

function dictionary() {
  const body = {
    schema: "outsider/real-responsibility-factor-dictionary/v1",
    version: "1.6.0",
    dictionaryType:
      "TYPED_RETROSPECTIVE_SOURCE_DOMAIN_FACTORS_AND_NON_MODEL_CANDIDATE_QUALITY_FACTORS",
    categories: [...REAL_RESPONSIBILITY_FACTOR_CATEGORIES],
    factors: clone(FACTORS),
    policy: {
      allFactorsRetrospective: true,
      outcomeDerivedFactorsCannotMasqueradeAsPreActionFactors: true,
      targetTransferEstablishedForAnyFactor: false,
      automaticTargetPredictorEligibilityGranted: false,
      targetPriceEligibilityGranted: false,
      globalQualityWeightAssigned: false,
      factorAdmissionIsClaimSpecificAndPrerequisiteBased: true,
    },
  };
  return deepFreeze({ ...body,
    dictionaryHash: digest("outsider/real-responsibility-factor-dictionary/v1", body) });
}

export const REAL_RESPONSIBILITY_FACTOR_DICTIONARY = dictionary();

const QUALITY_STATUS_RANK = Object.freeze({
  CONTRADICTED: 0, UNESTABLISHED: 0, NOT_APPLICABLE: 0,
  PARTIAL: 1, VERIFIED: 2,
});

function factorAdmissionDiagnostics(flywheel) {
  const assessments = new Map(flywheel.qualityAssessments.map((row) => [row.sourceId, row]));
  const laneArtifacts = new Map(flywheel.lanes.map(
    ({ laneId, artifactId }) => [laneId, artifactId]));
  const artifactReceipts = new Map(flywheel.artifactReceipts.map(
    (row) => [row.artifactId, row]));
  const rows = REAL_RESPONSIBILITY_FACTOR_DICTIONARY.factors.map((definition) => {
    const assessment = assessments.get(definition.sourceLaneId);
    if (!assessment || !HASH.test(assessment.assessmentHash ?? "")) {
      fail("FACTOR_QUALITY_ASSESSMENT_MISSING", definition.factorId);
    }
    const upstreamArtifactId = laneArtifacts.get(definition.sourceLaneId);
    const upstreamReceipt = artifactReceipts.get(upstreamArtifactId);
    if (!upstreamReceipt
      || typeof upstreamReceipt.temporalStatus !== "string"
      || typeof upstreamReceipt.temporalAuthenticityEstablished !== "boolean") {
      fail("FACTOR_TEMPORAL_RECEIPT_MISSING", definition.factorId);
    }
    const prerequisiteChecks = definition.qualityPrerequisites.map((requirement) => {
      const observedStatus = assessment.dimensions?.[requirement.dimension]?.status;
      if (!Object.hasOwn(QUALITY_STATUS_RANK, observedStatus)
        || !Object.hasOwn(QUALITY_STATUS_RANK, requirement.minimumStatus)) {
        fail("FACTOR_QUALITY_STATUS_INVALID", definition.factorId);
      }
      return { dimension: requirement.dimension,
        minimumStatus: requirement.minimumStatus, observedStatus,
        satisfied: QUALITY_STATUS_RANK[observedStatus]
          >= QUALITY_STATUS_RANK[requirement.minimumStatus] };
    });
    const prerequisitesSatisfied = prerequisiteChecks.every((row) => row.satisfied);
    return {
      factorId: definition.factorId, sourceDomain: definition.sourceDomain,
      sourceLaneId: definition.sourceLaneId, admittedUse: definition.admittedUse,
      upstreamArtifactId,
      temporalStatus: upstreamReceipt.temporalStatus,
      temporalAuthenticityEstablished:
        upstreamReceipt.temporalAuthenticityEstablished,
      temporalQuarantineReferenceOnly:
        upstreamReceipt.temporalAuthenticityEstablished === false,
      currentCoverageAdmitted: false,
      currentRoutingAdmitted: false,
      qualityAssessmentHash: assessment.assessmentHash,
      prerequisiteChecks, prerequisitesSatisfied,
      admittedForStatedSourceDomainRetrospectiveUse: prerequisitesSatisfied,
      quarantinedForStatedUse: !prerequisitesSatisfied,
      targetDomainUseAdmitted: false, targetTransferEstablished: false,
      arbitraryNumericQualityWeight: null,
    };
  });
  const sourceDomainAdmission = [...new Set(rows.map((row) => row.sourceDomain))]
    .sort().map((sourceDomain) => {
      const domainRows = rows.filter((row) => row.sourceDomain === sourceDomain);
      return {
        sourceDomain,
        factorDefinitions: domainRows.length,
        admittedForStatedSourceDomainRetrospectiveUse:
          domainRows.filter((row) => row.admittedForStatedSourceDomainRetrospectiveUse).length,
        quarantinedForStatedUse:
          domainRows.filter((row) => row.quarantinedForStatedUse).length,
        admittedForTargetDomainUse:
          domainRows.filter((row) => row.targetDomainUseAdmitted).length,
        targetDomainTransferEstablished: false,
      };
    });
  return {
    evaluationType: "CLAIM_SPECIFIC_MINIMUM_STATUS_GATES_NOT_A_QUALITY_SCORE",
    factorCount: rows.length,
    admittedForStatedSourceDomainRetrospectiveUse:
      rows.filter((row) => row.admittedForStatedSourceDomainRetrospectiveUse).length,
    quarantinedForStatedUse: rows.filter((row) => row.quarantinedForStatedUse).length,
    temporalQuarantineReferenceFactorCount:
      rows.filter((row) => row.temporalQuarantineReferenceOnly).length,
    temporallyOrderedReceiptReferenceFactorCount:
      rows.filter((row) => !row.temporalQuarantineReferenceOnly).length,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    collectorRelationshipUsedAsAdmissionWeight: false,
    publicOriginUsedAsDowngrade: false,
    outsiderCollectionUsedAsUpgrade: false,
    globalQualityScore: null,
    sourceDomainAdmission,
    rows,
  };
}

/*
 * A deliberately small, immutable projection of the fields used by this
 * diagnostic layer.  Full construction re-extracts these fields after the
 * flywheel has replayed every source and rejects any mismatch.
 */
const PINNED_FACTS = deepFreeze({
  wave5: {
    snapshotHash:
      "sha256:2d40c4e44a7d9edb37ce15b526c8aa07bdca694db7cece8e9b3437c8307192ad",
    sourceVerificationHash:
      "sha256:60849386032e4a10c8c1327188d4a154356dc0526388d10c2bde304f10005f48",
    sourceNativeRows: 49, organicAgentSessionShapeRows: 3,
    rosBugFixMechanismTaxonomyRows: 46, uniqueD1IdentityRoots: 49,
    conservativeD2CorrelationGroups: 3, traceToolCalls: 61,
    traceSourceNativeToolErrors: 6, robustIssueReferenceMissing: 12,
    robustPullRequestReferenceMissing: 5, robustFixCommitMissing: 1,
    robustSystemsProfileHash:
      "sha256:5a7a2eff06fc6d64cb470d498553140d3db0a7c8279ed7040f2b6f00490dd792",
    robustPhasesProfileHash:
      "sha256:ff7c3674455888dd2b3db2a1fb307b2bcaa811dcde97431ab8d4e0c1e8fc98e4",
    robustFaultCodesProfileHash:
      "sha256:0b81c0c3b0c32c039671352684b74c23d435bed79bcbbaa1d796684614fc769b",
    robustFailureCodesProfileHash:
      "sha256:51893e001213b63b5dfa59a3a72a8346dc6b6d3249bc74ac84425eb891166562",
    traceHarnessesProfileHash:
      "sha256:0b969bec67470f1752bd4fc92252db1de3d55ba955c0a004968059d77def5ed7",
    traceToolEvidenceCoverageProfileHash:
      "sha256:860e378c240e020313566cbec9f30394463612331378ca5293c41a4090415393",
    rowsMissingIndependentOutcome: 49, rowsMissingExposureDenominator: 49,
    rowsWithEconomicLoss: 0, sourceHumanReviewDeclaredRows: 49,
    outsiderProjectionReviewedRows: 0, downstreamHumanReviewRequiredRows: 49,
    traceCompilationLicenseId: "CC-BY-4.0",
    traceCompilationPublisherPermitsTrainingWithAttribution: true,
    traceEmbeddedMaterialLicensesUniformlyVerified: false,
    robustRootLicenseOrCopyingFileDetectedAtPinnedTree: false,
    preActionAvailableRows: 0, targetPredictorEligibleRows: 0,
    trainerRowsEnqueued: 0, automaticTraining: false,
    pricingEligibleRows: 0, causalExperienceUnits: 0,
    targetTransferEstablished: false, authority: "none",
  },
  nfip: {
    claimTransactionRows: 3341, grossPaymentUsd: "260522191.98",
    actualAdministrativePaymentFieldsAdmitted: true,
    recordedRecoveryUsd: "94087.26", netPaymentUsd: "260428104.72",
    zeroNetPaymentRows: 526, paymentDateRows: 3191,
    severity: { mean: "77949.15", p50: "25280.15", p75: "98395.88",
      p90: "222833.94", p95: "311296.41", p99: "560390.08", maximum: "1000000.00" },
    paymentLatency: { eligibleRows: 3191, p50Days: 110, p90Days: 300,
      p95Days: 388, maximumDays: 870 },
    currentNcContractsInForce: "106560", currentExposureAsOf: "2026-08-03T00:00:00.000Z",
    lossYear: 2024, claimReportedCoverageUsd: "1070871600.00",
  },
  appeals: {
    records: 1726, signedDecisionRows: 1671, pendingUnderReviewRows: 55,
    meritsDecisionRows: 1629, proceduralOrNonMeritsRows: 42,
    statusCounts: { Denied: 1355, Granted: 146, "N/A": 2,
      "Partially Granted": 128, Remanded: 17, Rescinded: 7,
      "Under Review": 55, Withdrawn: 16 },
    signedElapsedDays: { minimum: 5, p50: 87, p90: 271, p95: 432, maximum: 938 },
    distinctCompositeRoots: 1714, additionalRowsSharingCompositeRoot: 12,
  },
  rma: {
    sourceRows: 152383, exposureCells: 97782, zeroReportedLossExposureCells: 41792,
    noExposureNoReportedLossCells: 54421, policyNumeratorExceedsDenominatorCells: 265,
    unitNumeratorExceedsDenominatorCells: 28, liabilityUsd: "158673917761",
    totalPremiumUsd: "15882764266", indemnityUsd: "15163448979",
  },
  cas: {
    sourceRows: 71650, fullTenByTenTriangles: 665, incompleteTenByTenTriangles: 107,
    paid: { evaluatedCohorts: 6304, lag10BiasRatio: "-0.00752258",
      lag10WeightedAbsoluteErrorRatio: "0.04003796" },
    incurred: { evaluatedCohorts: 6321, lag10BiasRatio: "0.01319465",
      lag10WeightedAbsoluteErrorRatio: "0.03183432" },
    outputAmountUnit: "SOURCE_AMOUNT_UNIT_SCALE_NOT_DECLARED_ON_CAS_PAGE",
  },
  maude: {
    baseAddRows: 344157, baseChangeRows: 771511, baseOverlap: 336371,
    overlapChangedContent: 38, effectiveReportRows: 779297,
    eventTypeCounts: { D: 3405, IN: 222744, M: 552845, O: 303 },
    reportsWithFollowupEvidence: 231310, missingEventDate: 41813,
    missingReportDate: 46816, eventKeyMissing: 779297,
    reportsWithoutDeviceRows: 3, reportsWithMultipleDeviceRows: 336400,
    numberDevicesMissing: 779297, numberPatientsMissing: 779297,
  },
  dmv: {
    driveredPermitHolders: 28, driverlessPermitHolders: 6, deploymentPermitHolders: 3,
    legacy2023Miles: 9068861, legacy2023SafetyDriverMiles: 5801069,
    legacy2023DriverlessMiles: 3267792, legacy2024Miles: 4498066,
    legacy2024SafetyDriverMiles: 3945171, legacy2024DriverlessMiles: 552895,
    selectedCollisionPdfs: 4, observed2026MonthlyRows: 0, observed2026QuarterlyRows: 0,
    enhancedSnapshotDate: "2026-08-21", firstMonthlyDueReachedAtSnapshot: false,
    firstQuarterlyDueReachedAtSnapshot: false, noObservationFabricatedBeforeDueDate: true,
    firstMonthlyDue: "2026-08-26", firstQuarterlyDue: "2026-09-30",
  },
  fdic: {
    failureRows: 4115, costMissingRows: 638, costNegativeRows: 12,
    costRatioEligibleRows: 3475, costRatioOverOneRows: 51,
    costToDeposit: { minimum: "-1.49631870", p50: "0.21118274",
      p90: "0.49181455", p95: "0.65415888", p99: "1.08887550",
      maximum: "3.63480114" },
    dividendRows: 2385, distinctDividendRows: 2382, exactDuplicateExtraRows: 3,
    dividendGroups: 578, groupsWithDownwardRevision: 5, finalEventRows: 496,
    finalEventRowsBelow100: 492, groupsWithFinalEvent: 494,
    finalDividendPercent: { minimum: "18.347", p50: "74.098", p90: "91.102", maximum: "100.000" },
    dividendLatencyDays: { minimum: 0, p50: 1336, p90: 3758,
      p95: 4375, p99: 5260, maximum: 7014 },
  },
  sec: {
    grossClaimLiabilityUsd: "2886819000", reinsuranceRecoverableUsd: "746798000",
    netUnpaidClaimLiabilityUsd: "2140021000", reconciliationDifferenceUsd: "0",
    aggregateInsuranceSubsidiarySurplusUsd: "1846615000",
    principalCompanyAuthorizedControlLevelRbcUsd: "306000000",
    exactCapitalFactsSameEntityScope: false, restrictedRegulatoryDepositUsd: "107000000",
    filingTextDescribesDepositWithRegulatoryAuthoritiesRequiredByLaw: true,
    custodianIdentityObserved: false, transactionReceiptObserved: false,
    outsiderCustodyEstablished: false,
  },
  treasury: {
    publicMoneyCollateralRequirementDescribed: true,
    federalReserveCustodyForIndividualSuretyAssetsDescribed: true,
    tcmmAcceptabilityAndValuationRoleDescribed: true,
    tcmmPossessionRoleDescribed: true,
    depositInsuranceLimitContextDescribed: true,
    rolesSeparatedAcrossDepositoryCustodianProgramAndContractingOfficer: true,
    transactionPopulationObserved: false, pledgedAssetLedgerObserved: false,
    custodianAgreementForOutsiderObserved: false, paymentRailObserved: false,
    outsiderCanTakePossession: false, outsiderCustodyAuthorityEstablished: false,
  },
  actuarial: {
    standards: [
      { asopNumber: 23, title: "Data Quality", documentNumber: "185",
        lastRevised: "December 2016", effectiveDate: "April 30, 2017", status: "ADOPTED",
        requiredTopicsPinned: ["Selection of Data", "Review of Data", "Use of Data",
          "Reliance on Data Supplied by Others", "Communications and Disclosures"] },
      { asopNumber: 36,
        title: "Statements of Actuarial Opinion Regarding Property/Casualty Loss, Loss Adjustment Expense, or Other Reserves",
        documentNumber: "213", lastRevised: "March 2024",
        effectiveDate: "October 01, 2024", status: "ADOPTED",
        requiredTopicsPinned: ["Types of Opinions", "Qualified Opinion", "No Opinion",
          "Material Adverse Deviation", "Adequacy of Assets Supporting Reserves"] },
      { asopNumber: 53,
        title: "Estimating Future Costs for Prospective Property/Casualty Risk Transfer and Risk Retention",
        documentNumber: "190", lastRevised: "December 2017",
        effectiveDate: "August 01, 2018", status: "ADOPTED",
        requiredTopicsPinned: ["Exposure Base", "Use of Historical Data", "Credibility",
          "Treatment of Catastrophes",
          "Profit and Contingency Provisions and the Cost of Capital"] },
      { asopNumber: 55, title: "Capital Adequacy Assessment", documentNumber: "194",
        lastRevised: "June 2019", effectiveDate: "November 01, 2019",
        status: "ADOPTED", requiredTopicsPinned: ["Scenario Tests and Stress Tests",
          "Incorporating Management Actions", "Risk Capital Target or Risk Capital Threshold",
          "Reliance on Data or Other Information Supplied by Others",
          "Communications and Disclosures"] },
    ],
    standardsAreObservedInstitutionalPracticeRequirements: true,
    standardsAreEmpiricalOutcomeData: false, asop23PerformsAuditOfThisArtifact: false,
    asop36IsReserveOpinionForOutsider: false, asop53ApprovesFinalOutsiderPrice: false,
    asop55CertifiesOutsiderCapitalAdequacy: false,
    independentActuaryAssignedToOutsider: false,
    professionalReviewOfExactOutsiderModelCompleted: false,
  },
  remedy: {
    cfpb: { allocationEvents: 8, initiatedRows: 7,
      initiatedAllocatedUsdCents: "219575214000", initiatedDistributedUsdCents: "206005493700",
      initiatedReportedPayments: 4581067, concludedRows: 6,
      concludedAllocatedUsdCents: "8028882700", concludedDistributedUsdCents: "3580507600",
      concludedReportedPayments: 71727, bureauRedressInitiatedRows: 2,
      bureauRedressDistributedUsdCents: "6150500" },
    ftc: { closedPrograms: 25, totalFundUsdCents: "16386633826",
      returnedToConsumersUsdCents: "14833747249", adminCostsUsdCents: "672865708",
      leftoverFundsUsdCents: "880020869", consumersSentPayment: 1770214,
      consumersCashedAtLeastOnePayment: 1162743,
      caseCashedPercent: [37.9, 43.9, 48.2, 49.3, 52.9, 53.8, 54, 56.9, 66.5,
        69.1, 71.1, 72.2, 73.3, 76.5, 78.1, 80.9, 81.7, 81.9, 82.9, 88,
        90, 90.6, 91.3, 91.4, 97.1] },
    cpsc: { mprRows: 38, recallApiRows: 1492, canonicalUrlRows: 1490,
      completeCorrectionComponentRows: 17, missingCoreFieldRows: 21,
      arithmeticAgreementRows: 17, historicalRevisionChainReconstructed: false },
  },
  ntsbBls: {
    ntsb: {
      completedCasesAtFrozenIndex: 6, selectedCases: 6,
      finalReportFiles: 5, finalReportCaseCoverage: 6,
      selectedFactualReportFiles: 6, docketIndexPages: 6, docketDocumentLinks: 199,
      completeDocketDocumentBytesCaptured: false,
      allElevenPdfsByteCompleteAndFullyParsed: true,
      probableCauseAndFindingsAreFinalSafetyFindings: true,
      assignsFaultOrBlame: false, determinesRightsOrLiabilities: false,
      civilDamagesEvidenceUseRestricted: true,
      laterRecommendationStatusAndPostFreezeRevisionObserved: false,
    },
    soii: {
      referenceYear: 2024, alignedRows: 1070, normalizedUniqueKeys: 1047,
      repeatedRowsPreserved: 23, hoursRows: 1062, hoursUniqueKeys: 1034,
      hoursOverlapWithMainFrame: 1026, totalSuppressionMarkers: 810,
      privateTotalRecordableRatePer100Fte: "2.3",
      privateTotalRecordableCasesThousands: "2488.4",
      privateEmployeeHoursThousands: "213077936",
      derivedPrivateRateSixDecimals: "2.335671",
      privateRateRsePercent: "0.4", privateCountRsePercent: "0.5",
      privateHoursRsePercent: "0.2",
    },
    cfoi: {
      referenceYear: 2024, allFatalOccupationalInjuries: 5070,
      privateIndustryFatalInjuries: 4616, nationalTotalCrossTableAgreement: true,
      totalHoursWorkedMillions: 297600, totalPublishedRatePer100000Fte: 3.3,
      totalEmploymentVarianceMarginOfError: 0.01,
      privateHoursWorkedMillions: 257200,
      privatePublishedRatePer100000Fte: 3.6,
      privateEmploymentVarianceMarginOfError: 0.02,
      totalSuppressionMarkers: 7506, rateExposureSource: "CURRENT_POPULATION_SURVEY_2024_SAMPLE_ESTIMATE",
      displayedCountBeforeRateExclusions: true,
    },
    oiics: { version: "3.03", issued: "2026-05", implementedReferenceYear: 2024,
      workbookSheetCount: 13, referenceYear2023SeriesBreak: true,
      crossSeriesPoolingWithoutVersionHandlingPermitted: false },
  },
  judgmentGao: {
    treasury: {
      snapshot: { start: "2026-01-01", end: "2026-07-31", reportIntervals: 14,
        latestFullyPublishedIntervalAtFreeze: true, rightCensoredAfter: "2026-07-31" },
      reports: [
        { start: "2026-01-01", end: "2026-01-15", created: "2026-01-20", rows: 496,
          outside: 65, zero: 189, rawPrecision: 14, principal: "4346358384",
          fees: "18878875", cost: "23468513", interest: "13468", total: "4388719240" },
        { start: "2026-01-16", end: "2026-01-31", created: "2026-02-04", rows: 383,
          outside: 0, zero: 88, rawPrecision: 12, principal: "4727988238",
          fees: "50857364", cost: "4222026", interest: "162493827", total: "4945561455" },
        { start: "2026-02-01", end: "2026-02-15", created: "2026-02-19", rows: 4117,
          outside: 0, zero: 3835, rawPrecision: 14, principal: "5454000080",
          fees: "237246251", cost: "7247082", interest: "2705992", total: "5701199405" },
        { start: "2026-02-16", end: "2026-02-28", created: "2026-03-04", rows: 586,
          outside: 0, zero: 313, rawPrecision: 13, principal: "3559497003",
          fees: "60369551", cost: "3409200", interest: "4382097", total: "3627657851" },
        { start: "2026-03-01", end: "2026-03-15", created: "2026-03-18", rows: 2704,
          outside: 0, zero: 2378, rawPrecision: 37, principal: "56852981520",
          fees: "173282226", cost: "5116977", interest: "357516397", total: "57388897120" },
        { start: "2026-03-16", end: "2026-03-31", created: "2026-04-03", rows: 488,
          outside: 0, zero: 102, rawPrecision: 11, principal: "8322409609",
          fees: "15348424", cost: "4309256", interest: "577082", total: "8342644371" },
        { start: "2026-04-01", end: "2026-04-15", created: "2026-04-20", rows: 524,
          outside: 0, zero: 120, rawPrecision: 15, principal: "12722027599",
          fees: "111835883", cost: "3598595", interest: "49892836", total: "12887354913" },
        { start: "2026-04-16", end: "2026-04-30", created: "2026-05-05", rows: 658,
          outside: 0, zero: 160, rawPrecision: 20, principal: "125813271135",
          fees: "29241746", cost: "4304176", interest: "68164", total: "125846885221" },
        { start: "2026-05-01", end: "2026-05-15", created: "2026-05-19", rows: 691,
          outside: 0, zero: 177, rawPrecision: 17, principal: "15354647806",
          fees: "200745662", cost: "4135734", interest: "1288536", total: "15560817738" },
        { start: "2026-05-16", end: "2026-05-31", created: "2026-06-04", rows: 540,
          outside: 0, zero: 188, rawPrecision: 14, principal: "9559757405",
          fees: "38064132", cost: "3219200", interest: "94488580", total: "9695529317" },
        { start: "2026-06-01", end: "2026-06-15", created: "2026-06-18", rows: 630,
          outside: 0, zero: 230, rawPrecision: 14, principal: "9739525681",
          fees: "149154030", cost: "3735796", interest: "6243845", total: "9898659352" },
        { start: "2026-06-16", end: "2026-06-30", created: "2026-07-08", rows: 1080,
          outside: 450, zero: 771, rawPrecision: 14, principal: "8214795278",
          fees: "57480412", cost: "3045980", interest: "15866691", total: "8291188361" },
        { start: "2026-07-01", end: "2026-07-15", created: "2026-07-17", rows: 1972,
          outside: 1972, zero: 1570, rawPrecision: 10, principal: "31335677621",
          fees: "113038269", cost: "4042773", interest: "20723519", total: "31473482182" },
        { start: "2026-07-16", end: "2026-07-31", created: "2026-08-10", rows: 1285,
          outside: 0, zero: 845, rawPrecision: 9, principal: "18628684925",
          fees: "28248521", cost: "7362091", interest: "780174671", total: "19444470208" },
      ],
      totals: { paymentComponentRows: 16154, zeroTotalPublishedAmountRows: 10966,
        rowsOutsideWorkbookFilter: 2487, rawNumericCellsWithMoreThanTwoDecimalPlaces: 214,
        exactFullRawRowsRepeatedOccurrencesWithinReports: 10927,
        principalAmountCents: "314631622284", attorneyFeesAmountCents: "1283791346",
        costAmountCents: "81217399", interestAmountCents: "1496435705",
        totalPublishedAmountCents: "317493066734" },
      aggregateCounts: { responsibleAgencies: 93, submittingAgencies: 49,
        principalCitations: 52 },
      amountAndUnitBoundary: {
        workbookRowsArePublishedPaymentComponentsNotUniqueClaims: true,
        claimsAtOrAboveOneHundredMillionMayBeSplitAcrossComponents: true,
        controlNumberNeededToRecombineButAbsentFromWorkbookProjection: true,
        paymentComponentRowCountIsClaimCount: false,
        paymentComponentRowCountIsAffectedPopulationExposure: false,
        publishedAmountsAreIndividualEconomicLoss: false,
        publishedAmountsNetOfAllOffsetsIdentifiablePerRow: false,
        recipientBankSettlementObservedPerRow: false,
        claimantAcceptanceObservedPerRow: false,
        completeRecoveryObservedPerRow: false,
      },
      certificationBoundary: {
        judgmentOrSettlementMustBeFinalForCertification: true,
        fiscalServiceAdministersFundButDoesNotReviewOrEvaluateMerits: true,
        judgmentFundSectionChecksProperFundingSourceAndCertifiesVoucher: true,
        judgmentDebtSetoffOccursAtCertificationLevel: true,
        administrativeOffsetOccursAtDisbursingLevelAfterCertification: true,
        disbursingOfficialPaysAccordingToCertifiedVoucher: true,
        certificationIsDisbursement: false,
        disbursementIsRecipientRecoveryOrAcceptance: false,
        thisProcessIsOutsiderCustodyOrPaymentRail: false,
      },
      revisionBoundary: {
        currentPublisherSnapshotOnly: true,
        allFourteenWorkbooksByteStableAcrossIndependentRedownloadAtFreeze: true,
        publisherRevisionHistoryAvailable: false, publisherVersionIdentifiersAvailable: false,
        exactRepeatedRawRowsCountedButNotPersistedOrDeduplicated: true,
        repeatedRowsMayRepresentDistinctComponentsOrPayees: true,
        recordsDeduplicated: 0, crossIntervalClaimLinkageAttempted: false,
        workbookFilterRangeTreatedAsCompletenessBoundary: false,
        semanticPaymentRowsOutsidePublisherFilterIncludedAndCounted: true,
      },
    },
    gao: {
      fiscalYear: 2025,
      annualAggregate: { casesFiled: 1688, protestsFiled: 1617, costClaimsFiled: 24,
        reconsiderationRequestsFiled: 47, casesClosed: 1737, protestsClosed: 1676,
        costClaimsClosed: 20, reconsiderationRequestsClosed: 41,
        taskOrderCasesClosed: 359, meritDecisions: 380, sustains: 53,
        recomputedSustainRatePercent: "13.94736842105263",
        publisherRoundedSustainRatePercent: 14,
        publisherEffectivenessRatePercent: 52, adrCasesUsed: 53,
        publisherRoundedAdrSuccessRatePercent: 91, hearings: 3,
        publisherRoundedHearingsPercentOfFullyDevelopedCases: "0.5",
        finalDecisionsOverOneHundredDays: 0,
        agencyNonimplementationInstancesReported: 1 },
      denominatorBoundary: {
        casesAreDocketNumbersNotUniqueProcurements: true,
        casesIncludeProtestsCostClaimsAndReconsiderationRequests: true,
        filedAndClosedCohortsNeedNotBeSameCases: true,
        effectivenessRateMeansSomeReliefReportedToGaoFromCorrectiveActionOrSustain: true,
        effectivenessRateNumeratorNotPublishedInAnnualTable: true,
        adrSuccessNumeratorNotPublishedInAnnualTable: true,
        hearingDenominatorNotPublishedInAnnualTable: true,
        routineDismissalsNotMadePublic: true,
        agencyCorrectiveActionReasonsNeedNotBeReported: true,
        publicDecisionCorpusCompleteForAllClosures: false,
      },
      consequenceBoundary: {
        gaoForumIndependentFromProcuringAgency: true, gaoIsArticleThreeJudiciary: false,
        gaoDecisionIsJudicialFinality: false, sustainRecommendationIsSelfExecuting: false,
        agencyMustAdviseWhetherItWillComply: true,
        realNonimplementationCounterexampleObservedInAnnualReport: true,
        recommendationEqualsImplementation: false, reliefEqualsFullEconomicRecovery: false,
        gaoAuthorityIsOutsiderAuthority: false,
      },
      decisionSample: { included: false,
        reason: "NO_BOUNDED_OUTCOME_NEUTRAL_COMPLETE_PUBLIC_DECISION_SAMPLE; ROUTINE_DISMISSALS_ARE_NOT_PUBLIC_AND_ANNUAL_REPORT_EXEMPLARS_ARE_SUSTAIN_SELECTED",
        outcomeLeakageAvoided: true },
    },
  },
  ncuaPbgcMsha: {
    ncua: {
      accountingPeriodEnd: "2025-12-31", unit: "THOUSANDS_USD",
      totalAssetsThousandsUsd: 24105761, totalLiabilitiesThousandsUsd: 241770,
      netPositionThousandsUsd: 23863991,
      insuranceProgramLiabilityThousandsUsd: 234026,
      provisionForInsuranceLossesThousandsUsd: 4888,
      auditedOpinion: "UNMODIFIED_PRESENTS_FAIRLY_IN_ALL_MATERIAL_RESPECTS",
      auditedScope:
        "NCUSIF_BALANCE_SHEET_NET_COST_CHANGES_IN_NET_POSITION_AND_BUDGETARY_RESOURCES_FOR_2025",
      preliminarySameDate: true, preliminaryAdmittedAsAuditedInput: false,
      preliminaryReserveHeadlineMillionsUsd: 234,
      preliminaryDecemberLossReductionMillionsUsd: 14.1,
      preliminaryMonthlyReductionEqualsAnnualProvision: false,
      reserveEqualsPaidClaimLoss: false, fundAssetsAreOutsiderCustody: false,
      populationTransfersToOutsider: false,
    },
    pbgc: {
      workbookEdition: 2024, workbookInstallment: "FIRST", workbookSheetCount: 36,
      crossRepresentationBindingCount: 12, form5500PlanYear: 2023,
      premiumFilingPlanYear: 2024, operationalFiscalYear: 2025,
      heterogeneousTableEndYears: true, laterInstallmentsExpected: true,
      firstInstallmentCompleteEdition: false,
      directPayees: 911776, directBenefitPaymentsMillionsUsd: 6426.16,
      traditionalAssistancePayees: 60244, sfaPlanParticipants: 444902,
      traditionalAssistanceMillionsUsd: 169,
      traditionalAssistanceMorePreciseMillionsUsd: 168.5,
      specialFinancialAssistanceMillionsUsd: 6151.99,
      sfaDeathAuditRepaymentsMillionsUsd: 119.5,
      paymentProgramsRemainSeparate: true, sfaRepaymentIsOrdinaryClaimRecovery: false,
      financialAssistanceEqualsIndividualBenefitReceipt: false,
      claimsDefinitionIsPaidClaimSeverity: false, assetsAreOutsiderCustody: false,
      populationTransfersToOutsider: false,
    },
    msha: {
      frozenSnapshotDate: "2026-08-21", latestAccidentDate: "2026-08-19",
      historicalRecordsCanBeRevised: true, accidentCurrentQuarterRightCensored: true,
      employmentCurrentQuarterAbsent: true, accidentRows: 274448,
      uniqueDocumentNumbers: 274448, duplicateOrMissingDocumentNumberRows: 0,
      currentAccidentYearRows: 3394, accidentLatestQuarter: 3,
      zeroReportedInjuryRows: 30535, positiveReportedInjuryRows: 243913,
      mineExposureRows: 2761063, mineLatestQuarter: 2,
      mine2026Hours: "218379301", mineZeroHoursRows: 481859,
      mineInvalidHoursRows: 4, contractorExposureRows: 1361755,
      contractorLatestQuarter: 2, contractor2026Hours: "55442432",
      contractorZeroHoursRows: 557995, contractorInvalidHoursRows: 11,
      derivedCurrentIncidenceRate: null,
    },
  },
  cdiNcigf: {
    cdi: {
      filingStateTrackingNumber: "11-5668", filingSerffTrackingNumber: "DENT-127302198",
      stateStatus: "ACCEPTED", dispositionStatus: null, dispositionDate: null,
      acceptedMeansApproved: false, approvedRateObserved: false,
      chargedPolicyPriceObserved: false, proposedOverallChangePct: "-7.70%",
      proposedIsApprovedOrChargedPrice: false, filedExperienceYears: 10,
      filedEarnedExposures: 111547, filedAdjustedPremiumUsd: "214901630",
      filedTrendedLossAndDcceUsd: "183934789",
      rowSumExposuresExact: true, rowSumAdjustedPremiumExact: true,
      rowSumTrendedLossExact: false, publishedLossTotalShortByUsd: "1",
      discrepancyPreserved: true, registryPublishedRows: 3144,
      registryApprovedRows: 2484, registryClosedRows: 660,
      pairedRequestedApprovedRows: 1277, requestedApprovedDifferentRows: 234,
      registryRowMeansPolicyOrPrice: false,
      approvedRateChangeMeansChargedPrice: false,
      completeSerffCorpusAdmitted: false,
    },
    ncigf: {
      quarter: "2026_Q2", reportingRows: 126, unavailable2025PremiumRows: 85,
      reportingYearIsPartial: true,
      netAssessablePremium2024Usd: "860257065514",
      maximumAssessmentCapacity2025Usd: "16959476645.26",
      netAssessablePremium2025ReportedToDateUsd: "421399702134",
      maximumAssessmentCapacity2026ReportedToDateUsd: "7600879728.72",
      priorYearAssessmentsCalledIn2026Usd: "147845729",
      authorizedNotCalled2026Usd: "750000", authorizedAndCalled2026Usd: "37000000",
      totalAuthorized2026Usd: "37750000", refundsAuthorized2026Usd: "16637677",
      netAssessmentsAuthorized2026Usd: "21112323",
      totalProjectedAuthorizedAssessments2026Usd: "91626787",
      capacityUnderstatesUnlimitedOrPrefundedFunds: true,
      capacityIsStatutoryCallingCapacityNotCashHeld: true,
      authorizedNotCalledIsNotTransferredCapital: true,
      calledOrAuthorizedIsNotOutsiderCapitalOrCustody: true,
      compiledFromThirdPartyData: true, independentlyVerifiedByNcigf: false,
      estimatesMayBePresent: true, accuracyResponsibilityDisclaimed: true,
      workbookStatesSoleAccountingLiabilityPurpose: true,
      fiveYearPositiveAccountYearFraction: "0.145161290323",
      fiveYearIndependentAuditObserved: false,
      inceptionAssessmentsAuthorizedUsd: "23471640910.761",
      inceptionRefundsAuthorizedUsd: "2578384077.060",
      inceptionNetAssessmentsUsd: "20893256833.701",
      inceptionNonzeroTupleViewsMatch: true,
      missingnessAssumedRandom: false, tailOrDependenceModelFitted: false,
    },
  },
  fraPhmsa: {
    fra: {
      datasetIds: ["85tf-25kj", "m8i6-zdsy"], canonicalQueryReceiptCount: 7,
      allResponseSchemasVerified: true, allResponsePinsBoundToCanonicalQueries: true,
      officialAggregateApiResponseBytesReaggregatedLocally: true,
      rawRowPopulationDownloaded: false,
      countAnnualCauseDuplicateAndRateReconciliationsPerformed: true,
      transportAttested: false,
      form54RowsUpdatedAt: "2026-08-21T06:19:00.000Z",
      form54SchemaHash:
        "sha256:21e2bd902db3b82fd0f111599aaf85db2f872140398c4f00839f3bbfa821141f",
      form55RowsUpdatedAt: "2026-08-21T06:29:45.000Z",
      form55SchemaHash:
        "sha256:20e55d5161b4783cad48da0f862661280cb63c3f9a4618645612fb0a8f75f87c",
      officialUniqueViewCurrentlyExecutableAtFreeze: false,
      officialUniqueViewMachineStatus: "DEFERRED_UPSTREAM_SCHEMA_DRIFT",
      reportKeySemanticUniquenessObserved: false,
      startYear: 2015, endYear: 2019, form54JointCd1Rows: 10449,
      form54DistinctIncidentKeys: 10449, form55PublishedRows: 48843,
      form55DeduplicatedMonthlyRailroadRows: 48842,
      reportableAboveAnnualDamageThresholdOnly: true,
      belowThresholdAccountableAccidentsIncluded: false,
      calendarYearAlignmentNotIncidentToExposureRowLinkage: true,
      byteFrozenAsCaptured: true, publisherVersionedStaticRelease: false,
      historicalPeriodOutsideStatedFiveYearRoutineEditWindowAtFreeze: true,
      retroactiveCorrectionImpossible: false, rebuildMustUseExactPinnedBytes: true,
      form54RepresentativeRowsSelectedByJointCd1: true,
      form54IncidentKeyOneToOneVerified: true,
      form55CompositeKey: "RAILROAD_CODE_YEAR_REPORT_MONTH",
      duplicateCompositeKeyGroups: 1, identicalMetricProjectionRowsInDuplicateGroup: 2,
      identicalDuplicateRowsRemoved: 1, operatorIdentifierEmitted: false,
      annual: [
        { year: "2015", uniqueReportedIncidents: 2116,
          totalReportedDamageDollars: "368971545", officialFatalities: 36,
          officialInjuries: 815, hazmatReleasedCars: 62, personsEvacuated: 6816,
          totalTrainMiles: "738315727", employeeHours: "478130710",
          deduplicatedMonthlyRailroadRows: 9643,
          incidentRatePerMillionTrainMiles: "2.865982564",
          fatalityRatePerMillionTrainMiles: "0.048759628",
          injuryRatePerMillionTrainMiles: "1.103863795",
          reportedDamageDollarsPerTrainMile: "0.499747644" },
        { year: "2016", uniqueReportedIncidents: 1917,
          totalReportedDamageDollars: "267364307", officialFatalities: 46,
          officialInjuries: 590, hazmatReleasedCars: 19, personsEvacuated: 2452,
          totalTrainMiles: "689636111", employeeHours: "437138392",
          deduplicatedMonthlyRailroadRows: 9748,
          incidentRatePerMillionTrainMiles: "2.779726829",
          fatalityRatePerMillionTrainMiles: "0.066701844",
          injuryRatePerMillionTrainMiles: "0.855523646",
          reportedDamageDollarsPerTrainMile: "0.387688961" },
        { year: "2017", uniqueReportedIncidents: 1976,
          totalReportedDamageDollars: "286277551", officialFatalities: 36,
          officialInjuries: 357, hazmatReleasedCars: 38, personsEvacuated: 1785,
          totalTrainMiles: "705746026", employeeHours: "433408399",
          deduplicatedMonthlyRailroadRows: 9814,
          incidentRatePerMillionTrainMiles: "2.799874073",
          fatalityRatePerMillionTrainMiles: "0.051009852",
          injuryRatePerMillionTrainMiles: "0.505847694",
          reportedDamageDollarsPerTrainMile: "0.405638205" },
        { year: "2018", uniqueReportedIncidents: 2215,
          totalReportedDamageDollars: "310624837", officialFatalities: 46,
          officialInjuries: 318, hazmatReleasedCars: 34, personsEvacuated: 2389,
          totalTrainMiles: "714882438", employeeHours: "438512999",
          deduplicatedMonthlyRailroadRows: 9796,
          incidentRatePerMillionTrainMiles: "3.098411546",
          fatalityRatePerMillionTrainMiles: "0.064346244",
          injuryRatePerMillionTrainMiles: "0.444828384",
          reportedDamageDollarsPerTrainMile: "0.434511775" },
        { year: "2019", uniqueReportedIncidents: 2225,
          totalReportedDamageDollars: "340150514", officialFatalities: 49,
          officialInjuries: 197, hazmatReleasedCars: 25, personsEvacuated: 4450,
          totalTrainMiles: "680816572", employeeHours: "420336221",
          deduplicatedMonthlyRailroadRows: 9841,
          incidentRatePerMillionTrainMiles: "3.268134313",
          fatalityRatePerMillionTrainMiles: "0.071972396",
          injuryRatePerMillionTrainMiles: "0.289358409",
          reportedDamageDollarsPerTrainMile: "0.499621378" },
      ],
      pooled: { years: 5, uniqueReportedIncidents: 10449,
        totalReportedDamageDollars: "1573388754", officialFatalities: 213,
        officialInjuries: 2277, totalTrainMiles: "3529396874",
        employeeHours: "2207526721",
        incidentRatePerMillionTrainMiles: "2.960562491",
        reportedDamageDollarsPerTrainMile: "0.445795361" },
      causeTypeAggregateCells: 2083,
      reportedCauseFamilyCounts: { E: 1339, H: 3665, M: 2575, S: 244, T: 2626 },
      accidentTypeCodeCounts: { "11": 303, "12": 997, "13": 687, "01": 6559,
        "02": 23, "03": 58, "04": 276, "05": 138, "06": 15, "07": 1010,
        "08": 4, "09": 379 },
      causeCodesAreOperatorReportedRepresentativeRecordClassifications: true,
      causalEffectsIdentified: false, independentCausalAdjudicationObserved: false,
      totalDamageIsReportedAccidentDamageCost: true, paidLoss: false,
      incurredLoss: false, ultimateLoss: false, recoveryOrSalvageObserved: false,
      claimSettlementObserved: false, inflationOrThresholdNormalizationPerformed: false,
      sourceDomainCalendarYearRateDiagnosticsPermitted: true,
      targetDomainTransferPermitted: false, pricingUsePermitted: false,
      guaranteeUsePermitted: false, settlementUsePermitted: false,
      tailOrDependenceModelFitted: false,
    },
    phmsa: {
      zipBytes: 1599619,
      zipHash: "sha256:5850554f7498e5fb6faf97274416f06c8305a48e0689845ae29b898a7e747426",
      memberCount: 2, schemaPdfBytes: 477717,
      schemaPdfHash:
        "sha256:706c2a603e435d530ebb2ebaee7d566b9fae6e89607794a06a7b4afce2f8160d",
      formRevision: "9-2023", dataBytes: 4395199,
      dataHash: "sha256:6f1f3bb7fa4502c93ae66855d2ea11fbcd38edf06abde3172ae3a518cd95404f",
      headerColumns: 468,
      headerHash: "sha256:2c04994e67fdc28e72b49038186de3118b8b5bb02037b7210265b9eaf4ae07e5",
      reportedRows: 1589,
      observedYearCounts: { "2010": 120, "2011": 116, "2012": 88, "2013": 104,
        "2014": 106, "2015": 101, "2016": 115, "2017": 103, "2018": 108,
        "2019": 139, "2020": 106, "2021": 87, "2022": 60, "2023": 71,
        "2024": 62, "2025": 61, "2026": 42 },
      reportTypeCounts: { ORIGINAL: 127, "ORIGINAL FINAL": 438,
        SUPPLEMENTAL: 53, "SUPPLEMENTAL FINAL": 971 },
      originalAndSupplementalStatusPreserved: true, endpointIsMutablePresentFile: true,
      publisherVersionIdPinned: false, byteFrozenAsCaptured: true,
      latestPopulationCompletenessEstablished: false,
      matchingAnnualReportZipCaptured: false, mileageExposureCaptured: false,
      incidentToExposureLinkEstablished: false, frequencyOrSeverityRateCalculated: false,
      officialPublicDownloadObserved: true,
      publicDomainOrReuseLicenseBytePinned: false,
      redistributionUseConcluded: false, modelTrainingUseConcluded: false,
      realIncidentSourceReceiptRecognized: true,
      outcomeOrActuarialModelInputAdmitted: false,
      machineStatus:
        "DEFERRED_MISSING_MATCHED_ANNUAL_EXPOSURE_RIGHTS_AND_VERSION_BINDING",
    },
  },
  nhtsaRecallRemedy: {
    sourceId: "NHTSA_RECALL_REMEDY_STATUS_2026_08_21",
    frozenAt: "2026-08-21T15:30:00.000Z",
    sourceSetHash:
      "sha256:b4552ffd3ebb2bc1d05b368c0bca3d6ccd42ac97d21f360b7eef63c3bfea5bb1",
    acquisitionManifestHash:
      "sha256:b20bc43b921c08db9b7d646e591e69f53e3db05ee99c9946093fac89a1237d82",
    recallPopulation: {
      sourceUnit: "RECALL_FLAT_FILE_RECORD_WITH_CAMPAIGN_LEVEL_DEDUPLICATION",
      rows: 244499, expectedColumns: 29, observedWidthRows: 244499,
      blankLines: 0, schemaMismatchRows: 0,
      uniqueRecordIds: 244499, duplicateRecordIds: 0, invalidRecordIds: 0,
      uniqueCampaigns: 15197, invalidCampaignIds: 0,
      receivedDateMinimum: "20100101", receivedDateMaximum: "20260814",
      recordCreationDateMinimum: "20100104", recordCreationDateMaximum: "20260817",
      singlePopulationCampaigns: 15197, conflictingPopulationCampaigns: 0,
      missingPopulationCampaigns: 0, zeroPopulationCampaigns: 7,
      totalPotentialAffectedAcrossSinglePopulationCampaigns: "699086836",
      summedOncePerCampaign: true,
      actualExposureOrUniqueVehiclesOnRoadEstablished: false,
      campaignsWithCorrectiveActionText: 15197,
      correctiveActionTextEstablishesRepairCompleted: false,
      ownerNotificationDateEstablishesConsumerReceipt: false,
      entryHash:
        "sha256:1f6e1a9dc80a291c02edafa9bf33ba695b6a2ac25cc6f095c8b7c209bb989456",
    },
    quarterlyStatus: {
      sourceUnit: "QUARTERLY_MANUFACTURER_RECALL_STATUS_REPORT_ROW",
      rows: 75624, expectedColumns: 13, observedWidthRows: 75624,
      blankLines: 0, schemaMismatchRows: 0,
      uniqueRowHashes: 75624, exactDuplicateRows: 0, uniqueCampaigns: 11834,
      invalidCampaignRows: 0, submissionDateMinimum: "20141202",
      submissionDateMaximum: "20260817", validPeriodMinimum: "2015-1",
      validPeriodMaximum: "2026-2",
      anomalies: {
        invalidPeriodRows: 2, invalidSubmissionDateRows: 0,
        invalidReportNumberRows: 0, invalidNumericRows: 0,
        zeroInvolvedRows: 1, componentSumExceedsInvolvedRows: 1,
        conflictingLogicalKeyRows: 0,
        invalidPeriodExamples: [
          { rowHash: "sha256:9ef18f18639856528f26eb0dfea9fd10c858dbdf166a1e2dbf9ac230cc888c21",
            campaignFingerprint:
              "sha256:62ad36773ff9e5e9f6fd106cee23b2f7ed722b5ee8164fc6ad765a6d39c1d453",
            observedPeriod: "2099-" },
          { rowHash: "sha256:39a1075ec9e440a79ac99cd30a96c41ca07ce20d811e88ad9a70c25e70e2cb84",
            campaignFingerprint:
              "sha256:9aa6c919d3cb12538cbe5864ee55a8705a5eaf0296243a9959c76b2b6103d802",
            observedPeriod: "2022" },
        ],
        arithmeticAnomalyExamples: [
          { rowHash: "sha256:9337b350c60bc75030ff8e8f4c42821159f87403f6bc37767548b14e28ac6b5a",
            campaignFingerprint:
              "sha256:3bab9c0d70b100d838adfa31a2ef0ddb85c667827206d96baaf2ae6b71f83bbb",
            period: "2016-4", involved: "0", remedied: "22",
            unreachable: "0", removed: "584" },
        ],
        anomaliesRetainedNotRepaired: true,
      },
      latest: {
        selectionRule:
          "MAX_SUBMISSION_DATE_THEN_REPORT_NUMBER_THEN_PERIOD_THEN_ROW_HASH_PER_CAMPAIGN",
        latestRowsAreNotReplacedByEarlierValidRows: true,
        selectedCampaigns: 11834, deferredLatestCampaigns: 0, deferReasons: {},
        selectedCampaignsLinkedToPost2010Recall: 11833,
        involved: "487232535", remedied: "295629360",
        unreachable: "11450565", removed: "17965750",
        remediedToInvolvedRatio: "0.606752092202",
        ratioIsDescriptivePublisherStatusSnapshot: true,
        ratioIsNotUniqueRepairReceiptOrActuarialRate: true,
      },
      linkage: { rowsLinked: 75616, campaignsLinked: 11833,
        campaignsOutsideCapturedPost2010RecallSlice: 1,
        missingLinkDoesNotImplyInvalidStatusRecord: true },
      entryHash:
        "sha256:1aeaa5d8350826ac2df642ffa81b2fef0789752cfbd7d1e846f427cfc79d7e18",
    },
    annualStatus: {
      sourceUnit: "ANNUAL_MANUFACTURER_RECALL_STATUS_REPORT_ROW",
      rows: 5875, expectedColumns: 13, observedWidthRows: 5875,
      blankLines: 0, schemaMismatchRows: 0,
      uniqueRowHashes: 5875, exactDuplicateRows: 0, uniqueCampaigns: 2796,
      invalidCampaignRows: 0, submissionDateMinimum: "20230403",
      submissionDateMaximum: "20260818",
      validPeriodMinimum: "2022-1 to 2022-4",
      validPeriodMaximum: "2025-3 to 2026-2",
      anomalies: { invalidPeriodRows: 0, invalidSubmissionDateRows: 0,
        invalidReportNumberRows: 0, invalidNumericRows: 0,
        zeroInvolvedRows: 0, componentSumExceedsInvolvedRows: 0,
        conflictingLogicalKeyRows: 0, invalidPeriodExamples: [],
        arithmeticAnomalyExamples: [], anomaliesRetainedNotRepaired: true },
      latest: {
        selectionRule:
          "MAX_SUBMISSION_DATE_THEN_REPORT_NUMBER_THEN_PERIOD_THEN_ROW_HASH_PER_CAMPAIGN",
        latestRowsAreNotReplacedByEarlierValidRows: true,
        selectedCampaigns: 2796, deferredLatestCampaigns: 0, deferReasons: {},
        selectedCampaignsLinkedToPost2010Recall: 2796,
        involved: "108749786", remedied: "72493743",
        unreachable: "2286543", removed: "4348768",
        remediedToInvolvedRatio: "0.666610442801",
        ratioIsDescriptivePublisherStatusSnapshot: true,
        ratioIsNotUniqueRepairReceiptOrActuarialRate: true,
      },
      linkage: { rowsLinked: 5875, campaignsLinked: 2796,
        campaignsOutsideCapturedPost2010RecallSlice: 0,
        missingLinkDoesNotImplyInvalidStatusRecord: true },
      entryHash:
        "sha256:14c08720150517cafb8b258fc78cefa6884b2ee062f94f68bf1bda22a7dcdef4",
    },
    lifecycleLinkage: {
      post2010RecallCampaigns: 15197, withQuarterlyStatus: 11833,
      withAnnualStatus: 2796, withBothQuarterlyAndAnnualStatus: 2796,
      linkKey: "NHTSA_CAMPAIGN_NUMBER",
      quarterlyPopulationReconciliation: {
        selectedStatusCampaigns: 11834, statusCampaignsWithRecallPopulation: 11833,
        statusCampaignsOutsideCapturedRecallPopulation: 1, exactMatches: 11780,
        statusInvolvedGreater: 17, recallPotentialAffectedGreater: 36,
        totalAbsoluteDifference: "316960",
        reconciliationDifferenceRetainedNotAdjusted: true,
        eitherFieldIsCurrentInServiceExposureEstablished: false,
      },
      annualPopulationReconciliation: {
        selectedStatusCampaigns: 2796, statusCampaignsWithRecallPopulation: 2796,
        statusCampaignsOutsideCapturedRecallPopulation: 0, exactMatches: 2796,
        statusInvolvedGreater: 0, recallPotentialAffectedGreater: 0,
        totalAbsoluteDifference: "0",
        reconciliationDifferenceRetainedNotAdjusted: true,
        eitherFieldIsCurrentInServiceExposureEstablished: false,
      },
      linkageIsPublisherRecordAssociationNotCausalOrConsumerReceiptProof: true,
      completeRepairChainEstablished: false,
      paymentRecoveryReopeningClosureChainEstablished: false,
    },
    ontology: {
      recallCampaignIsRealInstitutionalRecord: true,
      manufacturerStatusReportIsRealInstitutionalRecord: true,
      officialRecordAutomaticallyEqualsUnderlyingWorldTruth: false,
      recallEstablishesIndependentCausality: false,
      statusRowEstablishesAffectedPartyReceipt: false,
      remediedCountEstablishesIndividuallyVerifiedCompleteRepair: false,
      affectedPopulationEstablishesCurrentExposure: false,
      statusCountsEstablishPaidIncurredOrUltimateLoss: false,
      recallManagementRecordIsEnforcementOrder: false,
    },
    qualityAndMissingness: {
      officialNamedPost2010SliceNotAllHistoricalCampaigns: true,
      current2026PeriodIncompleteAtFreeze: true,
      quarterlyRowsAreRepeatedCumulativeStatusNotIndependentExposures: true,
      annualRowsHavePublisherEligibilitySelection: true,
      manufacturerStatusRowsAreNotIndependentRepairAudits: true,
      completionStatusesMayBeRevisedAfterFreeze: true,
      latestObservedIsNotGuaranteedLatestPublisherTruthAfterFreeze: true,
      campaignPopulationMayDifferFromStatusInvolvedPopulation: true,
      campaignPotentialAffectedCrossCampaignVehicleOverlapUnresolved: true,
      quarterlyAndAnnualRatiosNotComparableWithoutCohortAlignment: true,
      noVehicleInServiceExposureDenominator: true,
      noIndependentRepairAuditPopulation: true,
      knownSourceAnomaliesMachineDeferredNotNormalized: true,
      enforcementActionOrConsentOrderBodiesCaptured: false,
    },
    rights: {
      officialPublicDownloadObserved: true, exactPublicBytesReplayed: true,
      rawRedistributionRightConcluded: false, commercialUseRightConcluded: false,
      modelTrainingRightConcluded: false, legalConclusionMade: false,
    },
    trainingAdmitted: false, targetTransferAdmitted: false,
    priceInputAdmitted: false, actuarialLossCalibration: false,
    productionReadiness: false,
  },
  bridgeDataV2: {
    sourceId: "BERKELEY_RAIL_BRIDGEDATA_V2_TFDS_1_0_0_MINIMAL_RECORD_20260822",
    projectClaimedTrajectories: 60096, tfdsTotalExamples: 60064,
    projectMinusTfdsExamples: 32, tfdsCountDifferenceResolved: false,
    trainExamples: 53192, trainShards: 1024, validationExamples: 6872,
    validationShards: 128, capturedWholeRecords: 1,
    capturedWholeTrainShards: 0, capturedValidationRecords: 0,
    knownRecordsInParentShard: 52, sampleTimesteps: 28,
    sampleFeatureKeysExactlyMatchTfdsSchema: true,
    actualRecordBytesCrcValidated: true,
    fullCorpusSchemaConformanceEstablished: false,
    fullSchemaAndSemanticContractEstablished: false,
    sampleSelectionRandomOrRepresentativeEstablished: false,
    trainValidationSplitTemporalOrProspectiveEstablished: false,
    trajectoryCorrelationClustersMaterialized: false,
    perRecordOutcomeOrFailureLabelPresent: false,
    actionShapeDescriptionMismatch: true, stateShapeDescriptionMismatch: true,
    license: "CC_BY_4_0_WITH_ATTRIBUTION_AND_CHANGE_NOTICE",
    licenseStatementBytePinned: true, legalReviewCompleted: false,
    recordLevelThirdPartyContentReviewCompleted: false,
    productionTrainingRightFinallyAdjudicated: false,
    candidateDecision: "HOLD_FOR_SEMANTIC_CONTENT_AND_GOVERNANCE_REVIEW",
    candidateWholeRecords: 1, trainerRowsEnqueued: 0, automaticTraining: false,
    requiredBeforeTrainerAdmission: [
      "RESOLVE_PROJECT_VS_TFDS_32_TRAJECTORY_COUNT_DIFFERENCE",
      "RESOLVE_ACTION_AND_STATE_SHAPE_DESCRIPTION_MISMATCHES",
      "DECODE_AND_AUDIT_RECORD_LEVEL_MISSINGNESS_AND_CONTENT",
      "MATERIALIZE_TRAJECTORY_ENVIRONMENT_OBJECT_AND_COLLECTION_CORRELATION_GROUPS",
      "SEPARATE_TELEOPERATED_AND_SCRIPTED_PROVENANCE_AT_RECORD_LEVEL",
      "ESTABLISH_NON_SUCCESS_FAILURE_AND_NEGATIVE_EXAMPLE_POLICY",
      "COMPLETE_ATTRIBUTION_CHANGE_NOTICE_AND_THIRD_PARTY_CONTENT_REVIEW",
      "CREATE_TARGET_ROBOT_HOLDOUT_AND_TRANSFER_GATE",
    ],
    statisticalModelCapabilityImprovementEstablished: false,
    targetRobotTransferEstablished: false, targetDomainFactorAdmission: false,
    frequencyEligible: false, severityEligible: false, lossEligible: false,
    prospectiveHoldoutEligible: false, trainingAuthority: false,
    priceAuthority: false,
  },
  waymoSafetyImpact: {
    sourceId: "WAYMO_SAFETY_IMPACT_DATA_HUB_20260624_CAPTURED_20260822",
    publisherReleaseDate: "2026-06-24", csv1ToCsv3DataThrough: "2026-03",
    csv4DataThrough: "2025-03", livingDatasetSubjectToRevision: true,
    displayedRoundedRiderOnlyMiles: "220613000",
    displayedExposureIsExactUnroundedMiles: false,
    displayedLeafPointTotalReconciled: true,
    overlappingCompositeRowsNotDoubleCounted: true,
    publisherMeasuredMilesIndependentlyAudited: false,
    outcomeRows: 1664, sgoLinkedRows: 1662, uniqueSgoReportIds: 1659,
    duplicateSgoIdVersionPairs: 3, duplicatePairRows: 6,
    duplicatePairExtraRows: 3, duplicatePairsWithOutcomeFlagConflicts: 2,
    duplicatePairsWithSuppressedLocationTextConflicts: 1,
    duplicatePairsCountedAsIndependentCrashUnits: false,
    duplicatePairsAutomaticallyDeduplicatedOrAdjudicated: false,
    rowMembershipOutcomeTrueCounts: {
      "Is Any Fatal Injury": 2, "Is Any Vehicle Airbag Deployment": 69,
      "Is Any-Injury-Reported": 157, "Is Ego Vehicle Airbag Deployment": 13,
      "Is NHTSA Reportable In-Transport": 1560,
      "Is NHTSA Reportable In-Transport Delta-V Less than 1 MPH": 636,
      "Is Police-Reported": 351, "Is Suspected Serious Injury+": 3,
    },
    rowMembershipOutcomeUnknownCounts: {
      "Is Any Fatal Injury": 0, "Is Any Vehicle Airbag Deployment": 0,
      "Is Any-Injury-Reported": 0, "Is Ego Vehicle Airbag Deployment": 0,
      "Is NHTSA Reportable In-Transport": 0,
      "Is NHTSA Reportable In-Transport Delta-V Less than 1 MPH": 0,
      "Is Police-Reported": 0, "Is Suspected Serious Injury+": 2,
    },
    independentCrashOutcomeCountsAfterDuplicateResolution: null,
    temporalSplit: {
      kind: "RETROSPECTIVE_CALENDAR_HOLDOUT_CANDIDATE_NOT_PROSPECTIVE",
      referenceThrough: "2025-12", holdoutFrom: "2026-01",
      holdoutThrough: "2026-03", referenceRows: 1390, holdoutRows: 274,
      outsideOrInvalidRows: 0,
      splitDeclaredBeforeThisArtifactButAfterOutcomesOccurred: true,
    },
    benchmarkRows: 2078, allLocationPublishedFactorRows: 16,
    allLocationPublishedFactorProfileHash:
      "sha256:00e046fc16401d157bcdfbe2b5476ca5f13eb9f87ccd3f316e52a65b5ed4cf47",
    allLocationPublishedRateRatioMinimum: 0.053179884719415545,
    allLocationPublishedRateRatioMaximum: 0.7327934808893718,
    literalNonfiniteTokens: 164, waymoCiOrderViolations: 0,
    benchmarkCiOrderViolations: 0,
    naiveCountOverCsv1MilesDifferenceRows: 1022,
    dynamicRows: 17176, dynamicDistinctCells: 2079,
    dynamicDistinctCompositeKeys: 16632, dynamicDuplicateCompositeKeys: 544,
    dynamicDuplicateRows: 544, dynamicBenchmarkCrashCountConflictKeys: 489,
    dynamicDuplicateRowsRetainedWithoutDeduplication: true,
    dynamicBenchmarkCrashCountsAggregatedAcrossDuplicateKeys: false,
    dynamicAlignedWithCsv1ToCsv3Through202603: false,
    matchedNhtsaSgoReportsIndependentlyReplayed: false,
    independentCrashFactAdjudicationEstablished: false,
    faultOrCausalityEstablished: false, economicLossObserved: false,
    affectedPartyReceiptOrRecoveryObserved: false,
    crossManufacturerComparabilityEstablished: false,
    temporalHoldoutIsRetrospectiveNotProspective: true,
    calibrationDecision: "ADMIT_BOUNDED_WAYMO_PUBLISHED_REFERENCE_ONLY",
    targetTransfer: false, actualOutsiderModelCalibrated: false,
    statisticalCapabilityImprovementEstablished: false,
    candidateDecision:
      "NOT_FOR_BEHAVIOR_MODEL_TRAINING_RIGHTS_AND_TARGET_TRANSFER_UNESTABLISHED",
    candidateRows: 0, trainerRowsEnqueued: 0, automaticTraining: false,
    frequencyModelEligible: false, severityModelEligible: false,
    targetHoldoutEligible: false, trainingAuthority: false, priceAuthority: false,
  },
  clinicalTrials: {
    sourceId: "CLINICALTRIALS_GOV_API_V2_RESULTS_FIRST_POSTED_20260701_CAPTURE_20260822",
    apiVersion: "2.0.5", dataTimestamp: "2026-08-21T09:00:05",
    sourceSetHash: "sha256:34199d825412cb9931378ebed6146a003e04e5788a492f8df3041a46d4fe6910",
    expectedTotalCount: 18, observedStudyRecords: 18, uniqueNctIds: 18,
    completeClosedQueryWindow: true, allHavePostedResultsFlag: true,
    studiesWithPostedOutcomeMeasures: 18, studiesWithPostedAdverseEvents: 18,
    totalPostedOutcomeMeasureRows: 242,
    totalPostedSeriousAdverseEventTermRows: 409,
    totalPostedOtherAdverseEventTermRows: 514,
    crossStudyAffectedCountsPooled: false, crossStudyRatesCalculated: false,
    sponsorOrInvestigatorIsResponsibleForSubmittedAccuracy: true,
    nlmQcEstablishesScientificAccuracy: false,
    resultRecordsMayBeUpdatedAfterInitialPosting: true,
    sponsorNamesPersistedInDerivedArtifact: false,
    personNamesPersistedInDerivedArtifact: false,
    rightsTermsSourceReplayed: false,
    rightsDetermination: "NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED",
    independentAdjudicationEstablished: false, causalEffectEstablished: false,
    targetDomainTransferEstablished: false,
    automaticBehaviorModelTrainingRightConcluded: false,
    admittedTrainingRows: 0, automaticTraining: false,
    trainingAuthority: false, priceAuthority: false,
  },
});

function lane(progress, laneId) {
  const found = progress?.lanes?.find((item) => item.laneId === laneId);
  if (!found) fail("PROGRESS_LANE_MISSING", laneId);
  return found;
}

function statusObject(rows) {
  return Object.fromEntries(rows.map(({ value, count }) => [value, count]));
}

function extractFacts({ progress, wave5Intake, fema, capital, remedy, maude, dmv, ntsbBls,
  judgmentGao, ncuaPbgcMsha, cdiNcigf, fraPhmsa, nhtsaRecallRemedy,
  bridgeDataV2, waymoSafetyImpact, clinicalTrials }) {
  const rma = lane(progress, "USDA_RMA_CROP_INSURANCE_EXPERIENCE").observations;
  const cas = lane(progress, "CAS_SCHEDULE_P_RESERVE_BACKTEST").observations;
  const claims = fema.nfipClaims;
  const appeals = fema.publicAssistanceSecondAppeals;
  const fdicFailures = capital.diagnostics.fdicFailures;
  const dividends = capital.diagnostics.fdicReceivershipDividends;
  const sec = capital.diagnostics.secInsurerDisclosure;
  const treasury = capital.diagnostics.treasuryCustodyStructure;
  const actuarial = capital.diagnostics.actuarialStandards;
  const ntsb = ntsbBls.lanes.ntsb;
  const soii = ntsbBls.lanes.bls.soii;
  const cfoi = ntsbBls.lanes.bls.cfoi;
  const oiics = ntsbBls.lanes.bls.oiics;
  const judgment = judgmentGao.treasuryJudgmentFund;
  const gao = judgmentGao.gaoBidProtest;
  const ncua = ncuaPbgcMsha.lanes.ncua;
  const pbgc = ncuaPbgcMsha.lanes.pbgc;
  const msha = ncuaPbgcMsha.lanes.msha;
  const cdi = cdiNcigf.lanes.cdi;
  const ncigf = cdiNcigf.lanes.ncigf;
  const fra = fraPhmsa.lanes.fra;
  const phmsa = fraPhmsa.lanes.phmsa;
  const nhtsa = nhtsaRecallRemedy;
  const bridge = bridgeDataV2;
  const waymo = waymoSafetyImpact;
  const clinical = clinicalTrials;
  const wave5Trace = wave5Intake.sources.find((source) =>
    source.sourceKind === "TRACE_COMMONS_ORGANIC_AGENT_SESSION_SAMPLE");
  const wave5Robust = wave5Intake.sources.find((source) =>
    source.sourceKind === "ROBUST_ORGANIC_ROS_BUG_FIX_TAXONOMY");
  if (!wave5Trace || !wave5Robust) fail("WAVE5_SOURCE_DESCRIPTOR_MISSING");
  return {
    wave5: {
      snapshotHash: wave5Intake.snapshotHash,
      sourceVerificationHash: wave5Intake.sourceVerification.wave5VerificationHash,
      sourceNativeRows: wave5Intake.sourceVerification.sourceNativeRowsReparsed,
      organicAgentSessionShapeRows:
        wave5Intake.summary.organicAgentSessionShapeRows,
      rosBugFixMechanismTaxonomyRows:
        wave5Intake.summary.rosBugFixMechanismTaxonomyRows,
      uniqueD1IdentityRoots: wave5Intake.summary.uniqueD1IdentityRoots,
      conservativeD2CorrelationGroups:
        wave5Intake.summary.conservativeD2CorrelationGroups,
      traceToolCalls: wave5Intake.summary.traceToolCalls,
      traceSourceNativeToolErrors:
        wave5Intake.summary.traceSourceNativeToolErrors,
      robustIssueReferenceMissing:
        wave5Intake.summary.robustIssueReferenceMissing,
      robustPullRequestReferenceMissing:
        wave5Intake.summary.robustPullRequestReferenceMissing,
      robustFixCommitMissing: wave5Intake.summary.robustFixCommitMissing,
      robustSystemsProfileHash: digest(
        "outsider/real-responsibility-math/wave5-summary-profile/v1",
        wave5Intake.summary.robustSystems),
      robustPhasesProfileHash: digest(
        "outsider/real-responsibility-math/wave5-summary-profile/v1",
        wave5Intake.summary.robustPhases),
      robustFaultCodesProfileHash: digest(
        "outsider/real-responsibility-math/wave5-summary-profile/v1",
        wave5Intake.summary.robustFaultCodes),
      robustFailureCodesProfileHash: digest(
        "outsider/real-responsibility-math/wave5-summary-profile/v1",
        wave5Intake.summary.robustFailureCodes),
      traceHarnessesProfileHash: digest(
        "outsider/real-responsibility-math/wave5-summary-profile/v1",
        wave5Intake.summary.traceHarnesses),
      traceToolEvidenceCoverageProfileHash: digest(
        "outsider/real-responsibility-math/wave5-summary-profile/v1",
        wave5Intake.summary.traceToolEvidenceCoverage),
      rowsMissingIndependentOutcome:
        wave5Intake.summary.rowsMissingIndependentOutcome,
      rowsMissingExposureDenominator:
        wave5Intake.summary.rowsMissingExposureDenominator,
      rowsWithEconomicLoss: wave5Intake.summary.rowsWithEconomicLoss,
      sourceHumanReviewDeclaredRows:
        wave5Intake.summary.sourceHumanReviewDeclaredRows,
      outsiderProjectionReviewedRows:
        wave5Intake.summary.outsiderProjectionReviewedRows,
      downstreamHumanReviewRequiredRows:
        wave5Intake.summary.downstreamHumanReviewRequiredRows,
      traceCompilationLicenseId: wave5Trace.rights.compilationLicenseId,
      traceCompilationPublisherPermitsTrainingWithAttribution:
        wave5Trace.rights.compilationPublisherPermitsTrainingWithAttribution,
      traceEmbeddedMaterialLicensesUniformlyVerified:
        wave5Trace.rights.embeddedMaterialLicensesUniformlyVerified,
      robustRootLicenseOrCopyingFileDetectedAtPinnedTree:
        wave5Robust.rights.rootLicenseOrCopyingFileDetectedAtPinnedTree,
      preActionAvailableRows: 0,
      targetPredictorEligibleRows: 0,
      trainerRowsEnqueued: 0,
      automaticTraining: wave5Intake.summary.automaticTrainingRows !== 0,
      pricingEligibleRows: wave5Intake.summary.pricingEligibleRows,
      causalExperienceUnits: wave5Intake.summary.causalExperienceUnits,
      targetTransferEstablished: false,
      authority: wave5Intake.provider.authority === "NONE" ? "none"
        : wave5Intake.provider.authority,
    },
    nfip: {
      claimTransactionRows: claims.scope.recordCount,
      actualAdministrativePaymentFieldsAdmitted:
        claims.payments.actualAdministrativePaymentFieldsAdmitted,
      grossPaymentUsd: claims.payments.grossReportedPaymentDollars,
      recordedRecoveryUsd: claims.payments.recordedRecoveryDollars,
      netPaymentUsd: claims.payments.netTotalPaymentDollars,
      zeroNetPaymentRows: claims.payments.zeroRecordedNetPaymentRows,
      paymentDateRows: claims.payments.rowsWithMostRecentPaymentDate,
      severity: { mean: claims.empiricalSeverity.meanNetPaidDollars,
        p50: claims.empiricalSeverity.p50NetPaidDollars,
        p75: claims.empiricalSeverity.p75NetPaidDollars,
        p90: claims.empiricalSeverity.p90NetPaidDollars,
        p95: claims.empiricalSeverity.p95NetPaidDollars,
        p99: claims.empiricalSeverity.p99NetPaidDollars,
        maximum: claims.empiricalSeverity.maximumNetPaidDollars },
      paymentLatency: { eligibleRows: claims.paymentLatency.eligibleNonnegativeRows,
        p50Days: claims.paymentLatency.p50Days, p90Days: claims.paymentLatency.p90Days,
        p95Days: claims.paymentLatency.p95Days, maximumDays: claims.paymentLatency.maximumDays },
      currentNcContractsInForce: fema.nfipResidentialExposure.northCarolina.contractsInForce,
      currentExposureAsOf: fema.nfipResidentialExposure.asOfDate,
      lossYear: 2024,
      claimReportedCoverageUsd: claims.claimReportedCoverage.buildingAndContentsCoverageDollars,
    },
    appeals: {
      records: appeals.records, signedDecisionRows: appeals.signedDecisionRows,
      pendingUnderReviewRows: appeals.pendingUnderReviewRows,
      meritsDecisionRows: appeals.meritsDecisionRows,
      proceduralOrNonMeritsRows: appeals.proceduralOrNonMeritsStatusRows,
      statusCounts: statusObject(appeals.statusCounts),
      signedElapsedDays: { minimum: appeals.lifecycle.signedDecisionElapsedDays.minimum,
        p50: appeals.lifecycle.signedDecisionElapsedDays.p50,
        p90: appeals.lifecycle.signedDecisionElapsedDays.p90,
        p95: appeals.lifecycle.signedDecisionElapsedDays.p95,
        maximum: appeals.lifecycle.signedDecisionElapsedDays.maximum },
      distinctCompositeRoots: appeals.correlationQuality.distinctCompositeRoots,
      additionalRowsSharingCompositeRoot:
        appeals.correlationQuality.additionalRowsSharingCompositeRoot,
    },
    rma: {
      sourceRows: rma.sourceRows, exposureCells: rma.exposureCells,
      zeroReportedLossExposureCells: rma.zeroReportedLossExposureCells,
      noExposureNoReportedLossCells: rma.noExposureNoReportedLossCells,
      policyNumeratorExceedsDenominatorCells: rma.policyNumeratorExceedsDenominatorCells,
      unitNumeratorExceedsDenominatorCells: rma.unitNumeratorExceedsDenominatorCells,
      liabilityUsd: rma.liabilityDollars, totalPremiumUsd: rma.totalPremiumDollars,
      indemnityUsd: rma.indemnityDollars,
    },
    cas: {
      sourceRows: cas.sourceRows, fullTenByTenTriangles: cas.fullTenByTenGroupTriangles,
      incompleteTenByTenTriangles: cas.incompleteTenByTenGroupTriangles,
      paid: { evaluatedCohorts: cas.cumulativePaidEvaluatedCohorts,
        lag10BiasRatio: cas.cumulativePaidLag10BiasRatio,
        lag10WeightedAbsoluteErrorRatio: cas.cumulativePaidLag10WeightedAbsoluteErrorRatio },
      incurred: { evaluatedCohorts: cas.incurredEvaluatedCohorts,
        lag10BiasRatio: cas.incurredLag10BiasRatio,
        lag10WeightedAbsoluteErrorRatio: cas.incurredLag10WeightedAbsoluteErrorRatio },
      outputAmountUnit: cas.outputAmountUnit,
    },
    maude: {
      baseAddRows: maude.revisionAccounting.baseAdd.rows,
      baseChangeRows: maude.revisionAccounting.baseChange.rows,
      baseOverlap: maude.revisionAccounting.baseCrossStreamOverlap,
      overlapChangedContent: maude.revisionAccounting.baseCrossStreamChangedContent,
      effectiveReportRows: maude.revisionAccounting.effectiveMdrReportKeys,
      eventTypeCounts: clone(maude.outcomeSensing.reportedEventTypeCounts),
      reportsWithFollowupEvidence: maude.revisionAccounting.reportsWithFollowupEvidence,
      missingEventDate: maude.outcomeSensing.missingEventDate,
      missingReportDate: maude.outcomeSensing.missingReportDate,
      eventKeyMissing: maude.outcomeSensing.eventKeyMissing,
      reportsWithoutDeviceRows: maude.deviceCorrelation.reportsWithoutDeviceRows,
      reportsWithMultipleDeviceRows: maude.deviceCorrelation.reportsWithMultipleDeviceRows,
      numberDevicesMissing: maude.outcomeSensing.fieldQuality.numberDevicesMissing,
      numberPatientsMissing: maude.outcomeSensing.fieldQuality.numberPatientsMissing,
    },
    dmv: {
      driveredPermitHolders: dmv.permitSnapshot.drivered.count,
      driverlessPermitHolders: dmv.permitSnapshot.driverless.count,
      deploymentPermitHolders: dmv.permitSnapshot.deployment.count,
      legacy2023Miles:
        dmv.exposureEvidence.legacy2022_12_01Through2023_11_30.exactTotalAutonomousPublicRoadTestMiles,
      legacy2023SafetyDriverMiles:
        dmv.exposureEvidence.legacy2022_12_01Through2023_11_30.safetyDriverMiles,
      legacy2023DriverlessMiles:
        dmv.exposureEvidence.legacy2022_12_01Through2023_11_30.driverlessTestingMiles,
      legacy2024Miles:
        dmv.exposureEvidence.legacy2023_12_01Through2024_11_30.exactTotalAutonomousPublicRoadTestMiles,
      legacy2024SafetyDriverMiles:
        dmv.exposureEvidence.legacy2023_12_01Through2024_11_30.safetyDriverMiles,
      legacy2024DriverlessMiles:
        dmv.exposureEvidence.legacy2023_12_01Through2024_11_30.driverlessTestingMiles,
      selectedCollisionPdfs: dmv.collisionCases.cases.length,
      observed2026MonthlyRows: dmv.regimeRoots.enhanced2026.observedMonthlyCsvRows,
      observed2026QuarterlyRows: dmv.regimeRoots.enhanced2026.observedQuarterlyCsvRows,
      enhancedSnapshotDate: dmv.regimeRoots.enhanced2026.snapshotDate,
      firstMonthlyDueReachedAtSnapshot:
        dmv.regimeRoots.enhanced2026.firstMonthlyDueReachedAtSnapshot,
      firstQuarterlyDueReachedAtSnapshot:
        dmv.regimeRoots.enhanced2026.firstQuarterlyDueReachedAtSnapshot,
      noObservationFabricatedBeforeDueDate:
        dmv.regimeRoots.enhanced2026.noObservationFabricatedBeforeDueDate,
      firstMonthlyDue: dmv.regimeRoots.enhanced2026.monthlyReportingBegins,
      firstQuarterlyDue: dmv.regimeRoots.enhanced2026.firstQuarterlyReportDue,
    },
    fdic: {
      failureRows: fdicFailures.endpointAccounting.publishedRows,
      costMissingRows: fdicFailures.missingnessAndRevision.costMissingRows,
      costNegativeRows: fdicFailures.missingnessAndRevision.costNegativeRows,
      costRatioEligibleRows: fdicFailures.ratioDiagnostics.costToPreFailureDeposits.eligibleRows,
      costRatioOverOneRows: fdicFailures.ratioDiagnostics.costToPreFailureDeposits.overOneRows,
      costToDeposit: {
        minimum: fdicFailures.ratioDiagnostics.costToPreFailureDeposits.minimum,
        p50: fdicFailures.ratioDiagnostics.costToPreFailureDeposits.p50NearestRank,
        p90: fdicFailures.ratioDiagnostics.costToPreFailureDeposits.p90NearestRank,
        p95: fdicFailures.ratioDiagnostics.costToPreFailureDeposits.p95NearestRank,
        p99: fdicFailures.ratioDiagnostics.costToPreFailureDeposits.p99NearestRank,
        maximum: fdicFailures.ratioDiagnostics.costToPreFailureDeposits.maximum,
      },
      dividendRows: dividends.endpointAccounting.publishedRows,
      distinctDividendRows: dividends.endpointAccounting.distinctPublishedRows,
      exactDuplicateExtraRows: dividends.endpointAccounting.exactDuplicateExtraRows,
      dividendGroups: dividends.groupedCumulativeDiagnostics.groups,
      groupsWithDownwardRevision:
        dividends.groupedCumulativeDiagnostics.groupsWithDownwardCumulativeRevision,
      finalEventRows: dividends.finalDividendDiagnostics.finalEventRows,
      finalEventRowsBelow100: dividends.finalDividendDiagnostics.finalEventRowsBelow100Percent,
      groupsWithFinalEvent: dividends.finalDividendDiagnostics.groupsWithFinalEvent,
      finalDividendPercent: { minimum: dividends.finalDividendDiagnostics.minimumTotalPaidPercent,
        p50: dividends.finalDividendDiagnostics.p50TotalPaidPercent,
        p90: dividends.finalDividendDiagnostics.p90TotalPaidPercent,
        maximum: dividends.finalDividendDiagnostics.maximumTotalPaidPercent },
      dividendLatencyDays: { minimum: dividends.closureToPaymentLatencyDays.minimum,
        p50: dividends.closureToPaymentLatencyDays.p50,
        p90: dividends.closureToPaymentLatencyDays.p90,
        p95: dividends.closureToPaymentLatencyDays.p95,
        p99: dividends.closureToPaymentLatencyDays.p99,
        maximum: dividends.closureToPaymentLatencyDays.maximum },
    },
    sec: {
      grossClaimLiabilityUsd:
        sec.reserveReconciliation.grossClaimsAndClaimAdjustmentLiability.valueUsd,
      reinsuranceRecoverableUsd:
        sec.reserveReconciliation.reinsuranceRecoverableForUnpaidClaims.valueUsd,
      netUnpaidClaimLiabilityUsd:
        sec.reserveReconciliation.netUnpaidClaimsAndClaimAdjustmentLiability.valueUsd,
      reconciliationDifferenceUsd: sec.reserveReconciliation.reconciliationDifferenceUsd,
      aggregateInsuranceSubsidiarySurplusUsd:
        sec.statutoryCapital.exactAggregateInsuranceSubsidiaryStatutoryCapitalAndSurplus.valueUsd,
      principalCompanyAuthorizedControlLevelRbcUsd:
        sec.statutoryCapital.principalInsuranceCompanyAuthorizedControlLevelRbc.valueUsd,
      exactCapitalFactsSameEntityScope: sec.statutoryCapital.exactFactsHaveSameEntityScope,
      restrictedRegulatoryDepositUsd:
        sec.restrictedRegulatoryDeposit.restrictedInvestments.valueUsd,
      filingTextDescribesDepositWithRegulatoryAuthoritiesRequiredByLaw:
        sec.restrictedRegulatoryDeposit
          .filingTextDescribesDepositWithRegulatoryAuthoritiesRequiredByLaw,
      custodianIdentityObserved:
        sec.restrictedRegulatoryDeposit.custodianIdentityInProjectedFactObserved,
      transactionReceiptObserved:
        sec.restrictedRegulatoryDeposit.transactionReceiptObserved,
      outsiderCustodyEstablished:
        sec.restrictedRegulatoryDeposit.outsiderCustodyEstablished,
    },
    treasury: {
      publicMoneyCollateralRequirementDescribed:
        treasury.observedStructure.publicMoneyCollateralRequirementDescribed,
      federalReserveCustodyForIndividualSuretyAssetsDescribed:
        treasury.observedStructure.federalReserveCustodyForIndividualSuretyAssetsDescribed,
      tcmmAcceptabilityAndValuationRoleDescribed:
        treasury.observedStructure.tcmmAcceptabilityAndValuationRoleDescribed,
      tcmmPossessionRoleDescribed: treasury.observedStructure.tcmmPossessionRoleDescribed,
      depositInsuranceLimitContextDescribed:
        treasury.observedStructure.depositInsuranceLimitContextDescribed,
      rolesSeparatedAcrossDepositoryCustodianProgramAndContractingOfficer:
        treasury.observedStructure.rolesSeparatedAcrossDepositoryCustodianProgramAndContractingOfficer,
      transactionPopulationObserved: treasury.boundary.transactionPopulationObserved,
      pledgedAssetLedgerObserved: treasury.boundary.pledgedAssetLedgerObserved,
      custodianAgreementForOutsiderObserved:
        treasury.boundary.custodianAgreementForOutsiderObserved,
      paymentRailObserved: treasury.boundary.paymentRailObserved,
      outsiderCanTakePossession: treasury.boundary.outsiderCanTakePossession,
      outsiderCustodyAuthorityEstablished:
        treasury.boundary.outsiderCustodyAuthorityEstablished,
    },
    actuarial: {
      standards: clone(actuarial.standards),
      standardsAreObservedInstitutionalPracticeRequirements:
        actuarial.boundary.standardsAreObservedInstitutionalPracticeRequirements,
      standardsAreEmpiricalOutcomeData:
        actuarial.boundary.standardsAreEmpiricalOutcomeData,
      asop23PerformsAuditOfThisArtifact:
        actuarial.boundary.asop23PerformsAuditOfThisArtifact,
      asop36IsReserveOpinionForOutsider:
        actuarial.boundary.asop36IsReserveOpinionForOutsider,
      asop53ApprovesFinalOutsiderPrice:
        actuarial.boundary.asop53ApprovesFinalOutsiderPrice,
      asop55CertifiesOutsiderCapitalAdequacy:
        actuarial.boundary.asop55CertifiesOutsiderCapitalAdequacy,
      independentActuaryAssignedToOutsider:
        actuarial.boundary.independentActuaryAssignedToOutsider,
      professionalReviewOfExactOutsiderModelCompleted:
        actuarial.boundary.professionalReviewOfExactOutsiderModelCompleted,
    },
    remedy: {
      cfpb: {
        allocationEvents: remedy.cfpb.civilPenaltyFund.summary.allocationEvents,
        initiatedRows: remedy.cfpb.civilPenaltyFund.summary.initiatedCaseRows,
        initiatedAllocatedUsdCents:
          String(remedy.cfpb.civilPenaltyFund.summary.initiatedAllocatedUsdCents),
        initiatedDistributedUsdCents:
          String(remedy.cfpb.civilPenaltyFund.summary.initiatedDistributedUsdCents),
        initiatedReportedPayments:
          remedy.cfpb.civilPenaltyFund.summary.initiatedReportedPaymentsMade,
        concludedRows: remedy.cfpb.civilPenaltyFund.summary.concludedCaseRows,
        concludedAllocatedUsdCents:
          String(remedy.cfpb.civilPenaltyFund.summary.concludedAllocatedUsdCents),
        concludedDistributedUsdCents:
          String(remedy.cfpb.civilPenaltyFund.summary.concludedDistributedUsdCents),
        concludedReportedPayments:
          remedy.cfpb.civilPenaltyFund.summary.concludedReportedPaymentsMade,
        bureauRedressInitiatedRows:
          remedy.cfpb.bureauAdministeredRedress.summary.initiatedCaseRows,
        bureauRedressDistributedUsdCents:
          String(remedy.cfpb.bureauAdministeredRedress.summary.distributedUsdCents),
      },
      ftc: {
        closedPrograms: remedy.ftc.closedProgramsSummary.caseRows,
        totalFundUsdCents: String(remedy.ftc.closedProgramsSummary.totalFundUsdCents),
        returnedToConsumersUsdCents:
          String(remedy.ftc.closedProgramsSummary.returnedToConsumersUsdCents),
        adminCostsUsdCents: String(remedy.ftc.closedProgramsSummary.adminCostsUsdCents),
        leftoverFundsUsdCents: String(remedy.ftc.closedProgramsSummary.leftoverFundsUsdCents),
        consumersSentPayment: remedy.ftc.closedProgramsSummary.consumersSentPayment,
        consumersCashedAtLeastOnePayment:
          remedy.ftc.closedProgramsSummary.consumersCashedAtLeastOnePayment,
        caseCashedPercent: remedy.ftc.closedPrograms
          .map((row) => row.cashedConsumerPercent).sort((left, right) => left - right),
      },
      cpsc: {
        mprRows: remedy.cpsc.summary.mprRows,
        recallApiRows: remedy.cpsc.summary.recallApiRows,
        canonicalUrlRows: remedy.cpsc.summary.recallApiRowsWithCanonicalCpscHttpsUrl,
        completeCorrectionComponentRows:
          remedy.cpsc.summary.rowsWithCompleteCorrectionComponents,
        missingCoreFieldRows: remedy.cpsc.summary.rowsWithAnyMissingCoreMprField,
        arithmeticAgreementRows: remedy.cpsc.summary.arithmeticAgreementCases,
        historicalRevisionChainReconstructed:
          remedy.cpsc.revisionAndDedupPolicy.historicalRevisionChainReconstructed,
      },
    },
    ntsbBls: {
      ntsb: {
        completedCasesAtFrozenIndex: ntsb.selection.completedCasesAtFrozenIndex,
        selectedCases: ntsb.selection.selectedCases,
        finalReportFiles: ntsb.sourceAccounting.finalReportFiles,
        finalReportCaseCoverage: ntsb.sourceAccounting.finalReportCaseCoverage,
        selectedFactualReportFiles: ntsb.sourceAccounting.selectedFactualReportFiles,
        docketIndexPages: ntsb.sourceAccounting.docketIndexPages,
        docketDocumentLinks: ntsb.sourceAccounting.docketDocumentLinks,
        completeDocketDocumentBytesCaptured:
          ntsb.sourceAccounting.completeDocketDocumentBytesCaptured,
        allElevenPdfsByteCompleteAndFullyParsed:
          ntsb.sourceAccounting.allElevenPdfsByteCompleteAndFullyParsed,
        probableCauseAndFindingsAreFinalSafetyFindings:
          ntsb.findingBoundary.probableCauseAndFindingsAreFinalNtsbSafetyInvestigationFindings,
        assignsFaultOrBlame: ntsb.findingBoundary.assignsFaultOrBlame,
        determinesRightsOrLiabilities: ntsb.findingBoundary.determinesRightsOrLiabilities,
        civilDamagesEvidenceUseRestricted:
          ntsb.findingBoundary.civilDamagesEvidenceUseRestrictedBy49USC1154b,
        laterRecommendationStatusAndPostFreezeRevisionObserved:
          ntsb.findingBoundary.laterRecommendationStatusAndPostFreezeRevisionObserved,
      },
      soii: {
        referenceYear: soii.referenceYear,
        alignedRows: soii.crossTableCorrelation.alignedRows,
        normalizedUniqueKeys: soii.crossTableCorrelation.normalizedUniqueKeys,
        repeatedRowsPreserved: soii.crossTableCorrelation.repeatedRowsPreservedNotDeduplicated,
        hoursRows: soii.tables.find((row) => row.tableId === "TABLE_3_HOURS_RSE").dataRowCount,
        hoursUniqueKeys: soii.crossTableCorrelation.hoursUniqueKeys,
        hoursOverlapWithMainFrame: soii.crossTableCorrelation.uniqueKeyOverlapWithMainFrame,
        totalSuppressionMarkers: soii.tables.reduce((sum, row) => sum + row.suppression.total, 0),
        privateTotalRecordableRatePer100Fte:
          String(soii.privateIndustryPublished.totalRecordableRatePer100Fte),
        privateTotalRecordableCasesThousands:
          String(soii.privateIndustryPublished.totalRecordableCasesThousands),
        privateEmployeeHoursThousands:
          String(soii.privateIndustryPublished.employeeHoursThousands),
        derivedPrivateRateSixDecimals:
          String(soii.denominator.derivedPrivateTotalRecordableRateSixDecimals),
        privateRateRsePercent:
          String(soii.privateIndustryPublished.totalRecordableRateRsePercent),
        privateCountRsePercent:
          String(soii.privateIndustryPublished.totalRecordableCountRsePercent),
        privateHoursRsePercent:
          String(soii.privateIndustryPublished.employeeHoursRsePercent),
      },
      cfoi: {
        referenceYear: cfoi.referenceYear,
        allFatalOccupationalInjuries: cfoi.publishedCounts.allFatalOccupationalInjuries,
        privateIndustryFatalInjuries: cfoi.publishedCounts.privateIndustry,
        nationalTotalCrossTableAgreement:
          cfoi.publishedCounts.nationalTotalAgreementAcrossA1A5A7A9,
        totalHoursWorkedMillions: cfoi.publishedRates.total.hoursWorkedMillions,
        totalPublishedRatePer100000Fte:
          cfoi.publishedRates.total.fatalInjuryRatePer100000Fte,
        totalEmploymentVarianceMarginOfError:
          cfoi.publishedRates.total.employmentVarianceMarginOfError,
        privateHoursWorkedMillions: cfoi.publishedRates.privateIndustry.hoursWorkedMillions,
        privatePublishedRatePer100000Fte:
          cfoi.publishedRates.privateIndustry.fatalInjuryRatePer100000Fte,
        privateEmploymentVarianceMarginOfError:
          cfoi.publishedRates.privateIndustry.employmentVarianceMarginOfError,
        totalSuppressionMarkers: cfoi.tables.reduce((sum, row) => sum + row.suppression.total, 0),
        rateExposureSource: cfoi.denominator.exposureSource,
        displayedCountBeforeRateExclusions:
          cfoi.denominator.displayedTotalFatalInjuryCountIsBeforeThoseRateExclusions,
      },
      oiics: {
        version: oiics.version, issued: oiics.issued,
        implementedReferenceYear: oiics.implementedReferenceYear,
        workbookSheetCount: oiics.workbookSheetCount,
        referenceYear2023SeriesBreak:
          oiics.revisionBoundary.referenceYear2023WasSeriesBreakFromPriorYears,
        crossSeriesPoolingWithoutVersionHandlingPermitted:
          oiics.revisionBoundary.crossSeriesPoolingWithoutVersionHandlingPermitted,
      },
    },
    judgmentGao: {
      treasury: {
        snapshot: clone(judgment.snapshot),
        reports: judgment.reports.map((row) => ({
          start: row.reportInterval.start, end: row.reportInterval.end,
          created: row.reportCreatedOn, rows: row.paymentComponentRows,
          outside: row.rowsOutsideWorkbookFilter,
          zero: row.zeroTotalPublishedAmountRows,
          rawPrecision: row.rawNumericCellsWithMoreThanTwoDecimalPlaces,
          principal: String(row.amounts.principalAmountCents),
          fees: String(row.amounts.attorneyFeesAmountCents),
          cost: String(row.amounts.costAmountCents),
          interest: String(row.amounts.interestAmountCents),
          total: String(row.amounts.totalPublishedAmountCents),
        })),
        totals: {
          paymentComponentRows: judgment.totals.paymentComponentRows,
          zeroTotalPublishedAmountRows: judgment.totals.zeroTotalPublishedAmountRows,
          rowsOutsideWorkbookFilter: judgment.totals.rowsOutsideWorkbookFilter,
          rawNumericCellsWithMoreThanTwoDecimalPlaces:
            judgment.totals.rawNumericCellsWithMoreThanTwoDecimalPlaces,
          exactFullRawRowsRepeatedOccurrencesWithinReports:
            judgment.totals.exactFullRawRowsRepeatedOccurrencesWithinReports,
          principalAmountCents: String(judgment.totals.amounts.principalAmountCents),
          attorneyFeesAmountCents:
            String(judgment.totals.amounts.attorneyFeesAmountCents),
          costAmountCents: String(judgment.totals.amounts.costAmountCents),
          interestAmountCents: String(judgment.totals.amounts.interestAmountCents),
          totalPublishedAmountCents:
            String(judgment.totals.amounts.totalPublishedAmountCents),
        },
        aggregateCounts: {
          responsibleAgencies: judgment.responsibleAgencyAggregates.length,
          submittingAgencies: judgment.submittingAgencyAggregates.length,
          principalCitations: judgment.principalCitationAggregates.length,
        },
        amountAndUnitBoundary: clone(judgment.amountAndUnitBoundary),
        certificationBoundary: clone(judgment.certificationCustodyAndDisbursementBoundary),
        revisionBoundary: clone(judgment.revisionAndDedupBoundary),
      },
      gao: {
        fiscalYear: gao.fiscalYear,
        annualAggregate: {
          ...clone(gao.annualAggregate),
          recomputedSustainRatePercent:
            String(gao.annualAggregate.recomputedSustainRatePercent),
          publisherRoundedHearingsPercentOfFullyDevelopedCases:
            String(gao.annualAggregate.publisherRoundedHearingsPercentOfFullyDevelopedCases),
        },
        denominatorBoundary: clone(gao.denominatorAndOutcomeBoundary),
        consequenceBoundary: clone(gao.adjudicationAndConsequenceBoundary),
        decisionSample: clone(gao.decisionSample),
      },
    },
    ncuaPbgcMsha: {
      ncua: {
        accountingPeriodEnd: ncua.accountingPeriodEnd, unit: ncua.unit,
        totalAssetsThousandsUsd: ncua.auditedFinancialStatement.totalAssetsThousandsUsd,
        totalLiabilitiesThousandsUsd:
          ncua.auditedFinancialStatement.totalLiabilitiesThousandsUsd,
        netPositionThousandsUsd: ncua.auditedFinancialStatement.netPositionThousandsUsd,
        insuranceProgramLiabilityThousandsUsd:
          ncua.auditedFinancialStatement.insuranceAndGuaranteeProgramLiabilitiesThousandsUsd,
        provisionForInsuranceLossesThousandsUsd:
          ncua.auditedFinancialStatement.provisionForInsuranceLossesThousandsUsd,
        auditedOpinion: ncua.auditedFinancialStatement.opinion,
        auditedScope: ncua.auditedFinancialStatement.scope,
        preliminarySameDate: ncua.preliminaryComparator.sameDateAsAuditedStatement,
        preliminaryAdmittedAsAuditedInput:
          ncua.preliminaryComparator.admittedAsAuditedInput,
        preliminaryReserveHeadlineMillionsUsd:
          ncua.preliminaryComparator.reserveHeadlineMillionsUsd,
        preliminaryDecemberLossReductionMillionsUsd:
          ncua.preliminaryComparator.decemberMonthlyInsuranceLossReductionMillionsUsd,
        preliminaryMonthlyReductionEqualsAnnualProvision:
          ncua.preliminaryComparator.monthlyReductionEqualsAnnualProvision,
        reserveEqualsPaidClaimLoss: ncua.auditBoundary.reserveEqualsPaidClaimLoss,
        fundAssetsAreOutsiderCustody: ncua.auditBoundary.fundAssetsAreOutsiderCustody,
        populationTransfersToOutsider:
          ncua.auditBoundary.creditUnionPopulationTransfersToOutsider,
      },
      pbgc: {
        workbookEdition: pbgc.workbook.edition,
        workbookInstallment: pbgc.workbook.installment,
        workbookSheetCount: pbgc.workbook.sheetCount,
        crossRepresentationBindingCount: pbgc.workbook.xlsxPdfKeyMetricBindingCount,
        form5500PlanYear: pbgc.availabilityFrame.form5500PlanYear,
        premiumFilingPlanYear: pbgc.availabilityFrame.premiumFilingPlanYear,
        operationalFiscalYear: pbgc.availabilityFrame.operationalFiscalYear,
        heterogeneousTableEndYears: pbgc.availabilityFrame.tableEndYearsAreHeterogeneous,
        laterInstallmentsExpected: pbgc.availabilityFrame.laterInstallmentsExpected,
        firstInstallmentCompleteEdition:
          pbgc.availabilityFrame.firstInstallmentIsCompleteEdition,
        directPayees: pbgc.fiscal2025.singleEmployer.directPayees,
        directBenefitPaymentsMillionsUsd:
          pbgc.fiscal2025.singleEmployer.directBenefitPaymentsMillionsUsd,
        traditionalAssistancePayees:
          pbgc.fiscal2025.multiemployer.traditionalAssistancePayees,
        sfaPlanParticipants: pbgc.fiscal2025.multiemployer.sfaPlanParticipantsNotRetirees,
        traditionalAssistanceMillionsUsd:
          pbgc.fiscal2025.multiemployer.traditionalFinancialAssistanceMillionsUsd,
        traditionalAssistanceMorePreciseMillionsUsd:
          pbgc.paymentAndRecoveryExperience.annualReportTraditionalAssistanceMillionsUsdMorePrecise,
        specialFinancialAssistanceMillionsUsd:
          pbgc.fiscal2025.multiemployer.specialFinancialAssistanceMillionsUsd,
        sfaDeathAuditRepaymentsMillionsUsd:
          pbgc.paymentAndRecoveryExperience.sfaRetrospectiveDeathAuditRepaymentsMillionsUsd,
        paymentProgramsRemainSeparate:
          pbgc.paymentAndRecoveryExperience
            .directBenefitsTraditionalAssistanceAndSfaRemainSeparate,
        sfaRepaymentIsOrdinaryClaimRecovery:
          !pbgc.paymentAndRecoveryExperience.sfaRepaymentIsNotOrdinaryClaimRecovery,
        financialAssistanceEqualsIndividualBenefitReceipt:
          pbgc.auditBoundary.financialAssistanceEqualsIndividualBenefitReceipt,
        claimsDefinitionIsPaidClaimSeverity:
          pbgc.auditBoundary.claimsDefinitionIsPaidClaimSeverity,
        assetsAreOutsiderCustody: pbgc.auditBoundary.pbgcAssetsAreOutsiderCustody,
        populationTransfersToOutsider:
          pbgc.auditBoundary.pensionPopulationTransfersToOutsider,
      },
      msha: {
        frozenSnapshotDate: msha.sourceRefresh.frozenSnapshotDate,
        latestAccidentDate: msha.sourceRefresh.latestAccidentDate,
        historicalRecordsCanBeRevised: msha.sourceRefresh.historicalRecordsCanBeRevised,
        accidentCurrentQuarterRightCensored:
          msha.sourceRefresh.accidentCurrentQuarterRightCensored,
        employmentCurrentQuarterAbsent: msha.sourceRefresh.employmentCurrentQuarterAbsent,
        accidentRows: msha.accidents.rowCount,
        uniqueDocumentNumbers: msha.accidents.uniqueDocumentNumberCount,
        duplicateOrMissingDocumentNumberRows:
          msha.accidents.duplicateOrMissingDocumentNumberRows,
        currentAccidentYearRows: msha.accidents.rowsByCalendarYear["2026"],
        accidentLatestQuarter: msha.accidents.latestCalendarQuarter,
        zeroReportedInjuryRows: msha.accidents.zeroReportedInjuriesRows,
        positiveReportedInjuryRows: msha.accidents.positiveReportedInjuriesRows,
        mineExposureRows: msha.mineQuarterlyExposure.rowCount,
        mineLatestQuarter: msha.mineQuarterlyExposure.latestCalendarQuarter,
        mine2026Hours: msha.mineQuarterlyExposure.hoursWorkedByCalendarYear["2026"],
        mineZeroHoursRows: msha.mineQuarterlyExposure.zeroHoursRows,
        mineInvalidHoursRows: msha.mineQuarterlyExposure.invalidHoursRows,
        contractorExposureRows: msha.contractorQuarterlyExposure.rowCount,
        contractorLatestQuarter: msha.contractorQuarterlyExposure.latestCalendarQuarter,
        contractor2026Hours:
          msha.contractorQuarterlyExposure.hoursWorkedByCalendarYear["2026"],
        contractorZeroHoursRows: msha.contractorQuarterlyExposure.zeroHoursRows,
        contractorInvalidHoursRows: msha.contractorQuarterlyExposure.invalidHoursRows,
        derivedCurrentIncidenceRate: null,
      },
    },
    cdiNcigf: {
      cdi: {
        filingStateTrackingNumber: cdi.filing.filingIdentity.stateTrackingNumber,
        filingSerffTrackingNumber: cdi.filing.filingIdentity.serffTrackingNumber,
        stateStatus: cdi.filing.filingState.stateStatus,
        dispositionStatus: cdi.filing.filingState.dispositionStatus,
        dispositionDate: cdi.filing.filingState.dispositionDate,
        acceptedMeansApproved: cdi.filing.filingState.acceptedMeansApproved,
        approvedRateObserved: cdi.filing.filingState.approvedRateObserved,
        chargedPolicyPriceObserved: cdi.filing.filingState.chargedPolicyPriceObserved,
        proposedOverallChangePct: cdi.filing.requestedRate.proposedOverallChangePct,
        proposedIsApprovedOrChargedPrice:
          cdi.filing.requestedRate.proposedIsApprovedOrChargedPrice,
        filedExperienceYears: cdi.filing.experience2001To2010.rows.length,
        filedEarnedExposures: cdi.filing.experience2001To2010.total.earnedExposures,
        filedAdjustedPremiumUsd: cdi.filing.experience2001To2010.total.adjustedPremiumUsd,
        filedTrendedLossAndDcceUsd:
          cdi.filing.experience2001To2010.total.trendedLossAndDcceUsd,
        rowSumExposuresExact:
          cdi.filing.experience2001To2010.rowSumReconciliation.exposuresExact,
        rowSumAdjustedPremiumExact:
          cdi.filing.experience2001To2010.rowSumReconciliation.adjustedPremiumExact,
        rowSumTrendedLossExact:
          cdi.filing.experience2001To2010.rowSumReconciliation.trendedLossAndDcceExact,
        publishedLossTotalShortByUsd:
          cdi.filing.experience2001To2010.rowSumReconciliation.publishedLossTotalShortByUsd,
        discrepancyPreserved:
          cdi.filing.experience2001To2010.rowSumReconciliation
            .discrepancyPreservedAndNotSilentlyCorrected,
        registryPublishedRows: cdi.registry.approvalAndClosed2025.publishedRows,
        registryApprovedRows: cdi.registry.approvalAndClosed2025.statuses.APPROVED,
        registryClosedRows: cdi.registry.approvalAndClosed2025.statuses.CLOSED,
        pairedRequestedApprovedRows:
          cdi.registry.approvalAndClosed2025.pairedRequestedApprovedRows,
        requestedApprovedDifferentRows:
          cdi.registry.approvalAndClosed2025.requestedApprovedDifferentRows,
        registryRowMeansPolicyOrPrice:
          cdi.registry.approvalAndClosed2025.rowMeansPolicyOrPrice,
        approvedRateChangeMeansChargedPrice:
          cdi.registry.approvalAndClosed2025.approvedRateChangeMeansChargedPrice,
        completeSerffCorpusAdmitted: cdi.registry.corpusBoundary.completeSerffCorpusAdmitted,
      },
      ncigf: {
        quarter: ncigf.quarterlyAssessmentLiability.reportLimitations.quarter,
        reportingRows: ncigf.quarterlyAssessmentLiability.workbookProfile.reportingRows,
        unavailable2025PremiumRows:
          ncigf.quarterlyAssessmentLiability.workbookProfile.unavailable2025PremiumRows,
        reportingYearIsPartial:
          ncigf.quarterlyAssessmentLiability.reportLimitations.reportingYearIsPartial,
        netAssessablePremium2024Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal.netAssessablePremium2024Usd,
        maximumAssessmentCapacity2025Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal
            .maximumAssessmentCapacity2025Usd,
        netAssessablePremium2025ReportedToDateUsd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal
            .netAssessablePremium2025ReportedToDateUsd,
        maximumAssessmentCapacity2026ReportedToDateUsd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal
            .maximumAssessmentCapacity2026ReportedToDateUsd,
        priorYearAssessmentsCalledIn2026Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal
            .priorYearAssessmentsCalledIn2026Usd,
        authorizedNotCalled2026Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal.authorizedNotCalled2026Usd,
        authorizedAndCalled2026Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal.authorizedAndCalled2026Usd,
        totalAuthorized2026Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal.totalAuthorized2026Usd,
        refundsAuthorized2026Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal.refundsAuthorized2026Usd,
        netAssessmentsAuthorized2026Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal
            .netAssessmentsAuthorized2026Usd,
        totalProjectedAuthorizedAssessments2026Usd:
          ncigf.quarterlyAssessmentLiability.reportedGrandTotal
            .totalProjectedAuthorizedAssessments2026Usd,
        capacityUnderstatesUnlimitedOrPrefundedFunds:
          ncigf.quarterlyAssessmentLiability.reportLimitations
            .capacityTotalKnownToUnderstateUnlimitedOrPrefundedFunds,
        capacityIsStatutoryCallingCapacityNotCashHeld:
          ncigf.quarterlyAssessmentLiability.reportLimitations
            .maximumAssessmentCapacityIsStatutoryCallingCapacityNotCashHeld,
        authorizedNotCalledIsNotTransferredCapital:
          ncigf.quarterlyAssessmentLiability.reportLimitations
            .authorizedNotCalledIsNotTransferredCapital,
        calledOrAuthorizedIsNotOutsiderCapitalOrCustody:
          ncigf.quarterlyAssessmentLiability.reportLimitations
            .calledOrAuthorizedIsNotOutsiderCapitalOrCustody,
        compiledFromThirdPartyData:
          ncigf.quarterlyAssessmentLiability.publisherQualification.compiledFromThirdPartyData,
        independentlyVerifiedByNcigf:
          ncigf.quarterlyAssessmentLiability.publisherQualification
            .independentlyVerifiedByNcigf,
        estimatesMayBePresent:
          ncigf.quarterlyAssessmentLiability.publisherQualification.estimatesMayBePresent,
        accuracyResponsibilityDisclaimed:
          ncigf.quarterlyAssessmentLiability.publisherQualification
            .ncigfDisclaimsAccuracyResponsibility,
        workbookStatesSoleAccountingLiabilityPurpose:
          ncigf.quarterlyAssessmentLiability.publisherQualification
            .workbookStatesSoleAccountingLiabilityPurpose,
        fiveYearPositiveAccountYearFraction:
          ncigf.fiveYearHistory.accountYearProfile.positiveAccountYearFraction,
        fiveYearIndependentAuditObserved:
          ncigf.fiveYearHistory.boundaries.independentAuditObserved,
        inceptionAssessmentsAuthorizedUsd:
          ncigf.inceptionHistory.byFund.totals.assessmentsAuthorizedUsd,
        inceptionRefundsAuthorizedUsd:
          ncigf.inceptionHistory.byFund.totals.refundsAuthorizedUsd,
        inceptionNetAssessmentsUsd:
          ncigf.inceptionHistory.byFund.totals.netAssessmentsUsd,
        inceptionNonzeroTupleViewsMatch:
          ncigf.inceptionHistory.crossView.nonzeroRowMultisetExactlyMatches,
        missingnessAssumedRandom: !ncigf.inceptionHistory.coverageAndDependence
          .missingnessIsNotAssumedRandom,
        tailOrDependenceModelFitted:
          ncigf.inceptionHistory.coverageAndDependence.tailOrDependenceModelFitted,
      },
    },
    fraPhmsa: {
      fra: {
        datasetIds: clone(fra.queryChain.datasetIds),
        canonicalQueryReceiptCount: fra.queryChain.canonicalQueryReceiptCount,
        allResponseSchemasVerified: fra.queryChain.allResponseSchemasVerified,
        allResponsePinsBoundToCanonicalQueries:
          fra.queryChain.allResponsePinsBoundToCanonicalQueries,
        officialAggregateApiResponseBytesReaggregatedLocally:
          fra.queryChain.officialAggregateApiResponseBytesReaggregatedLocally,
        rawRowPopulationDownloaded: fra.queryChain.rawRowPopulationDownloaded,
        countAnnualCauseDuplicateAndRateReconciliationsPerformed:
          fra.queryChain.countAnnualCauseDuplicateAndRateReconciliationsPerformed,
        transportAttested: fra.queryChain.transportAttested,
        form54RowsUpdatedAt: fra.schema.form54.rowsUpdatedAt,
        form54SchemaHash: fra.schema.form54.schemaHash,
        form55RowsUpdatedAt: fra.schema.form55.rowsUpdatedAt,
        form55SchemaHash: fra.schema.form55.schemaHash,
        officialUniqueViewCurrentlyExecutableAtFreeze:
          fra.schema.officialUniqueView.currentlyExecutableAtFreeze,
        officialUniqueViewMachineStatus: fra.schema.officialUniqueView.machineStatus,
        reportKeySemanticUniquenessObserved:
          fra.schema.reportKeySemanticUniquenessObserved,
        startYear: fra.population.startYear, endYear: fra.population.endYear,
        form54JointCd1Rows: fra.population.form54JointCd1Rows,
        form54DistinctIncidentKeys: fra.population.form54DistinctIncidentKeys,
        form55PublishedRows: fra.population.form55PublishedRows,
        form55DeduplicatedMonthlyRailroadRows:
          fra.population.form55DeduplicatedMonthlyRailroadRows,
        reportableAboveAnnualDamageThresholdOnly:
          fra.population.reportableAboveAnnualDamageThresholdOnly,
        belowThresholdAccountableAccidentsIncluded:
          fra.population.belowThresholdAccountableAccidentsIncluded,
        calendarYearAlignmentNotIncidentToExposureRowLinkage:
          fra.population.calendarYearAlignmentNotIncidentToExposureRowLinkage,
        byteFrozenAsCaptured: fra.revision.byteFrozenAsCaptured,
        publisherVersionedStaticRelease: fra.revision.publisherVersionedStaticRelease,
        historicalPeriodOutsideStatedFiveYearRoutineEditWindowAtFreeze:
          fra.revision.historicalPeriodOutsideStatedFiveYearRoutineEditWindowAtFreeze,
        retroactiveCorrectionImpossible: fra.revision.retroactiveCorrectionImpossible,
        rebuildMustUseExactPinnedBytes: fra.revision.rebuildMustUseExactPinnedBytes,
        form54RepresentativeRowsSelectedByJointCd1:
          fra.deduplication.form54RepresentativeRowsSelectedByJointCd1,
        form54IncidentKeyOneToOneVerified:
          fra.deduplication.form54IncidentKeyOneToOneVerified,
        form55CompositeKey: fra.deduplication.form55CompositeKey,
        duplicateCompositeKeyGroups: fra.deduplication.duplicateCompositeKeyGroups,
        identicalMetricProjectionRowsInDuplicateGroup:
          fra.deduplication.identicalMetricProjectionRowsInDuplicateGroup,
        identicalDuplicateRowsRemoved:
          fra.deduplication.identicalDuplicateRowsRemoved,
        operatorIdentifierEmitted: fra.deduplication.operatorIdentifierEmitted,
        annual: fra.annual.map((row) => ({
          year: row.year, uniqueReportedIncidents: row.uniqueReportedIncidents,
          totalReportedDamageDollars: row.totalReportedDamageDollars,
          officialFatalities: row.officialFatalities,
          officialInjuries: row.officialInjuries,
          hazmatReleasedCars: row.hazmatReleasedCars,
          personsEvacuated: row.personsEvacuated,
          totalTrainMiles: row.totalTrainMiles, employeeHours: row.employeeHours,
          deduplicatedMonthlyRailroadRows: row.deduplicatedMonthlyRailroadRows,
          incidentRatePerMillionTrainMiles:
            String(row.incidentRatePerMillionTrainMiles.value),
          fatalityRatePerMillionTrainMiles:
            String(row.fatalityRatePerMillionTrainMiles.value),
          injuryRatePerMillionTrainMiles:
            String(row.injuryRatePerMillionTrainMiles.value),
          reportedDamageDollarsPerTrainMile:
            String(row.reportedDamageDollarsPerTrainMile.value),
        })),
        pooled: {
          years: fra.pooled.years,
          uniqueReportedIncidents: fra.pooled.uniqueReportedIncidents,
          totalReportedDamageDollars: fra.pooled.totalReportedDamageDollars,
          officialFatalities: fra.pooled.officialFatalities,
          officialInjuries: fra.pooled.officialInjuries,
          totalTrainMiles: fra.pooled.totalTrainMiles,
          employeeHours: fra.pooled.employeeHours,
          incidentRatePerMillionTrainMiles:
            String(fra.pooled.incidentRatePerMillionTrainMiles.value),
          reportedDamageDollarsPerTrainMile:
            String(fra.pooled.reportedDamageDollarsPerTrainMile.value),
        },
        causeTypeAggregateCells: fra.classification.causeTypeAggregateCells,
        reportedCauseFamilyCounts: clone(fra.classification.reportedCauseFamilyCounts),
        accidentTypeCodeCounts: clone(fra.classification.accidentTypeCodeCounts),
        causeCodesAreOperatorReportedRepresentativeRecordClassifications:
          fra.classification.causeCodesAreOperatorReportedRepresentativeRecordClassifications,
        causalEffectsIdentified: fra.classification.causalEffectsIdentified,
        independentCausalAdjudicationObserved:
          fra.classification.independentCausalAdjudicationObserved,
        totalDamageIsReportedAccidentDamageCost:
          fra.lossBoundary.totalDamageIsReportedAccidentDamageCost,
        paidLoss: fra.lossBoundary.paidLoss,
        incurredLoss: fra.lossBoundary.incurredLoss,
        ultimateLoss: fra.lossBoundary.ultimateLoss,
        recoveryOrSalvageObserved: fra.lossBoundary.recoveryOrSalvageObserved,
        claimSettlementObserved: fra.lossBoundary.claimSettlementObserved,
        inflationOrThresholdNormalizationPerformed:
          fra.lossBoundary.inflationOrThresholdNormalizationPerformed,
        sourceDomainCalendarYearRateDiagnosticsPermitted:
          fra.inferenceBoundary.sourceDomainCalendarYearRateDiagnosticsPermitted,
        targetDomainTransferPermitted:
          fra.inferenceBoundary.targetDomainTransferPermitted,
        pricingUsePermitted: fra.inferenceBoundary.pricingUsePermitted,
        guaranteeUsePermitted: fra.inferenceBoundary.guaranteeUsePermitted,
        settlementUsePermitted: fra.inferenceBoundary.settlementUsePermitted,
        tailOrDependenceModelFitted:
          fra.inferenceBoundary.tailOrDependenceModelFitted,
      },
      phmsa: {
        zipBytes: phmsa.sourceReceipt.zipBytes,
        zipHash: phmsa.sourceReceipt.zipHash,
        memberCount: phmsa.sourceReceipt.memberCount,
        schemaPdfBytes: phmsa.sourceReceipt.schemaPdfBytes,
        schemaPdfHash: phmsa.sourceReceipt.schemaPdfHash,
        formRevision: phmsa.sourceReceipt.formRevision,
        dataBytes: phmsa.sourceReceipt.dataBytes,
        dataHash: phmsa.sourceReceipt.dataHash,
        headerColumns: phmsa.sourceReceipt.headerColumns,
        headerHash: phmsa.sourceReceipt.headerHash,
        reportedRows: phmsa.sourceReceipt.reportedRows,
        observedYearCounts: clone(phmsa.sourceReceipt.observedYearCounts),
        reportTypeCounts: clone(phmsa.sourceReceipt.reportTypeCounts),
        originalAndSupplementalStatusPreserved:
          phmsa.revision.originalAndSupplementalStatusPreserved,
        endpointIsMutablePresentFile: phmsa.revision.endpointIsMutablePresentFile,
        publisherVersionIdPinned: phmsa.revision.publisherVersionIdPinned,
        byteFrozenAsCaptured: phmsa.revision.byteFrozenAsCaptured,
        latestPopulationCompletenessEstablished:
          phmsa.revision.latestPopulationCompletenessEstablished,
        matchingAnnualReportZipCaptured:
          phmsa.denominatorBoundary.matchingAnnualReportZipCaptured,
        mileageExposureCaptured: phmsa.denominatorBoundary.mileageExposureCaptured,
        incidentToExposureLinkEstablished:
          phmsa.denominatorBoundary.incidentToExposureLinkEstablished,
        frequencyOrSeverityRateCalculated:
          phmsa.denominatorBoundary.frequencyOrSeverityRateCalculated,
        officialPublicDownloadObserved:
          phmsa.rightsBoundary.officialPublicDownloadObserved,
        publicDomainOrReuseLicenseBytePinned:
          phmsa.rightsBoundary.publicDomainOrReuseLicenseBytePinned,
        redistributionUseConcluded: phmsa.rightsBoundary.redistributionUseConcluded,
        modelTrainingUseConcluded: phmsa.rightsBoundary.modelTrainingUseConcluded,
        realIncidentSourceReceiptRecognized:
          phmsa.admission.realIncidentSourceReceiptRecognized,
        outcomeOrActuarialModelInputAdmitted:
          phmsa.admission.outcomeOrActuarialModelInputAdmitted,
        machineStatus: phmsa.admission.machineStatus,
      },
    },
    nhtsaRecallRemedy: {
      sourceId: nhtsa.source.sourceId,
      frozenAt: nhtsa.source.frozenAt,
      sourceSetHash: nhtsa.source.sourceSetHash,
      acquisitionManifestHash: nhtsa.source.acquisitionManifestSha256,
      recallPopulation: {
        sourceUnit: nhtsa.recallPopulation.sourceUnit,
        rows: nhtsa.recallPopulation.rows,
        expectedColumns: nhtsa.recallPopulation.expectedColumns,
        observedWidthRows:
          nhtsa.recallPopulation.observedColumnWidths[String(
            nhtsa.recallPopulation.expectedColumns)],
        blankLines: nhtsa.recallPopulation.blankLines,
        schemaMismatchRows: nhtsa.recallPopulation.schemaMismatchRows,
        uniqueRecordIds: nhtsa.recallPopulation.uniqueRecordIds,
        duplicateRecordIds: nhtsa.recallPopulation.duplicateRecordIds,
        invalidRecordIds: nhtsa.recallPopulation.invalidRecordIds,
        uniqueCampaigns: nhtsa.recallPopulation.uniqueCampaigns,
        invalidCampaignIds: nhtsa.recallPopulation.invalidCampaignIds,
        receivedDateMinimum: nhtsa.recallPopulation.receivedDateRange.minimum,
        receivedDateMaximum: nhtsa.recallPopulation.receivedDateRange.maximum,
        recordCreationDateMinimum:
          nhtsa.recallPopulation.recordCreationDateRange.minimum,
        recordCreationDateMaximum:
          nhtsa.recallPopulation.recordCreationDateRange.maximum,
        singlePopulationCampaigns:
          nhtsa.recallPopulation.affectedPopulation.singlePopulationCampaigns,
        conflictingPopulationCampaigns:
          nhtsa.recallPopulation.affectedPopulation.conflictingPopulationCampaigns,
        missingPopulationCampaigns:
          nhtsa.recallPopulation.affectedPopulation.missingPopulationCampaigns,
        zeroPopulationCampaigns:
          nhtsa.recallPopulation.affectedPopulation.zeroPopulationCampaigns,
        totalPotentialAffectedAcrossSinglePopulationCampaigns:
          nhtsa.recallPopulation.affectedPopulation
            .totalPotentialAffectedAcrossSinglePopulationCampaigns,
        summedOncePerCampaign:
          nhtsa.recallPopulation.affectedPopulation.summedOncePerCampaign,
        actualExposureOrUniqueVehiclesOnRoadEstablished:
          nhtsa.recallPopulation.affectedPopulation
            .actualExposureOrUniqueVehiclesOnRoadEstablished,
        campaignsWithCorrectiveActionText:
          nhtsa.recallPopulation.remedyPublication.campaignsWithCorrectiveActionText,
        correctiveActionTextEstablishesRepairCompleted:
          nhtsa.recallPopulation.remedyPublication
            .correctiveActionTextEstablishesRepairCompleted,
        ownerNotificationDateEstablishesConsumerReceipt:
          nhtsa.recallPopulation.remedyPublication
            .ownerNotificationDateEstablishesConsumerReceipt,
        entryHash: nhtsa.recallPopulation.entrySha256,
      },
      quarterlyStatus: {
        sourceUnit: nhtsa.quarterlyStatus.sourceUnit,
        rows: nhtsa.quarterlyStatus.rows,
        expectedColumns: nhtsa.quarterlyStatus.expectedColumns,
        observedWidthRows:
          nhtsa.quarterlyStatus.observedColumnWidths[String(
            nhtsa.quarterlyStatus.expectedColumns)],
        blankLines: nhtsa.quarterlyStatus.blankLines,
        schemaMismatchRows: nhtsa.quarterlyStatus.schemaMismatchRows,
        uniqueRowHashes: nhtsa.quarterlyStatus.uniqueRowHashes,
        exactDuplicateRows: nhtsa.quarterlyStatus.exactDuplicateRows,
        uniqueCampaigns: nhtsa.quarterlyStatus.uniqueCampaigns,
        invalidCampaignRows: nhtsa.quarterlyStatus.invalidCampaignRows,
        submissionDateMinimum: nhtsa.quarterlyStatus.submissionDateRange.minimum,
        submissionDateMaximum: nhtsa.quarterlyStatus.submissionDateRange.maximum,
        validPeriodMinimum: nhtsa.quarterlyStatus.validReportingPeriodRange.minimum,
        validPeriodMaximum: nhtsa.quarterlyStatus.validReportingPeriodRange.maximum,
        anomalies: clone(nhtsa.quarterlyStatus.sourceQualityAnomalies),
        latest: {
          selectionRule:
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot.selectionRule,
          latestRowsAreNotReplacedByEarlierValidRows:
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot
              .latestRowsAreNotReplacedByEarlierValidRows,
          selectedCampaigns:
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot.selectedCampaigns,
          deferredLatestCampaigns:
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot.deferredLatestCampaigns,
          deferReasons: clone(
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot.deferReasons),
          selectedCampaignsLinkedToPost2010Recall:
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot
              .selectedCampaignsLinkedToPost2010Recall,
          involved: nhtsa.quarterlyStatus.latestObservedCampaignSnapshot.involved,
          remedied: nhtsa.quarterlyStatus.latestObservedCampaignSnapshot.remedied,
          unreachable: nhtsa.quarterlyStatus.latestObservedCampaignSnapshot.unreachable,
          removed: nhtsa.quarterlyStatus.latestObservedCampaignSnapshot.removed,
          remediedToInvolvedRatio: String(
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot
              .remediedToInvolvedRatio),
          ratioIsDescriptivePublisherStatusSnapshot:
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot
              .ratioIsDescriptivePublisherStatusSnapshot,
          ratioIsNotUniqueRepairReceiptOrActuarialRate:
            nhtsa.quarterlyStatus.latestObservedCampaignSnapshot
              .ratioIsNotUniqueRepairReceiptOrActuarialRate,
        },
        linkage: clone(nhtsa.quarterlyStatus.post2010RecallLinkage),
        entryHash: nhtsa.quarterlyStatus.entrySha256,
      },
      annualStatus: {
        sourceUnit: nhtsa.annualStatus.sourceUnit,
        rows: nhtsa.annualStatus.rows,
        expectedColumns: nhtsa.annualStatus.expectedColumns,
        observedWidthRows:
          nhtsa.annualStatus.observedColumnWidths[String(
            nhtsa.annualStatus.expectedColumns)],
        blankLines: nhtsa.annualStatus.blankLines,
        schemaMismatchRows: nhtsa.annualStatus.schemaMismatchRows,
        uniqueRowHashes: nhtsa.annualStatus.uniqueRowHashes,
        exactDuplicateRows: nhtsa.annualStatus.exactDuplicateRows,
        uniqueCampaigns: nhtsa.annualStatus.uniqueCampaigns,
        invalidCampaignRows: nhtsa.annualStatus.invalidCampaignRows,
        submissionDateMinimum: nhtsa.annualStatus.submissionDateRange.minimum,
        submissionDateMaximum: nhtsa.annualStatus.submissionDateRange.maximum,
        validPeriodMinimum: nhtsa.annualStatus.validReportingPeriodRange.minimum,
        validPeriodMaximum: nhtsa.annualStatus.validReportingPeriodRange.maximum,
        anomalies: clone(nhtsa.annualStatus.sourceQualityAnomalies),
        latest: {
          selectionRule: nhtsa.annualStatus.latestObservedCampaignSnapshot.selectionRule,
          latestRowsAreNotReplacedByEarlierValidRows:
            nhtsa.annualStatus.latestObservedCampaignSnapshot
              .latestRowsAreNotReplacedByEarlierValidRows,
          selectedCampaigns:
            nhtsa.annualStatus.latestObservedCampaignSnapshot.selectedCampaigns,
          deferredLatestCampaigns:
            nhtsa.annualStatus.latestObservedCampaignSnapshot.deferredLatestCampaigns,
          deferReasons: clone(nhtsa.annualStatus.latestObservedCampaignSnapshot.deferReasons),
          selectedCampaignsLinkedToPost2010Recall:
            nhtsa.annualStatus.latestObservedCampaignSnapshot
              .selectedCampaignsLinkedToPost2010Recall,
          involved: nhtsa.annualStatus.latestObservedCampaignSnapshot.involved,
          remedied: nhtsa.annualStatus.latestObservedCampaignSnapshot.remedied,
          unreachable: nhtsa.annualStatus.latestObservedCampaignSnapshot.unreachable,
          removed: nhtsa.annualStatus.latestObservedCampaignSnapshot.removed,
          remediedToInvolvedRatio: String(
            nhtsa.annualStatus.latestObservedCampaignSnapshot.remediedToInvolvedRatio),
          ratioIsDescriptivePublisherStatusSnapshot:
            nhtsa.annualStatus.latestObservedCampaignSnapshot
              .ratioIsDescriptivePublisherStatusSnapshot,
          ratioIsNotUniqueRepairReceiptOrActuarialRate:
            nhtsa.annualStatus.latestObservedCampaignSnapshot
              .ratioIsNotUniqueRepairReceiptOrActuarialRate,
        },
        linkage: clone(nhtsa.annualStatus.post2010RecallLinkage),
        entryHash: nhtsa.annualStatus.entrySha256,
      },
      lifecycleLinkage: clone(nhtsa.lifecycleLinkage),
      ontology: {
        recallCampaignIsRealInstitutionalRecord:
          nhtsa.ontology.recallCampaignIsRealInstitutionalRecord,
        manufacturerStatusReportIsRealInstitutionalRecord:
          nhtsa.ontology.manufacturerStatusReportIsRealInstitutionalRecord,
        officialRecordAutomaticallyEqualsUnderlyingWorldTruth:
          nhtsa.ontology.officialRecordAutomaticallyEqualsUnderlyingWorldTruth,
        recallEstablishesIndependentCausality:
          nhtsa.ontology.recallEstablishesIndependentCausality,
        statusRowEstablishesAffectedPartyReceipt:
          nhtsa.ontology.statusRowEstablishesAffectedPartyReceipt,
        remediedCountEstablishesIndividuallyVerifiedCompleteRepair:
          nhtsa.ontology.remediedCountEstablishesIndividuallyVerifiedCompleteRepair,
        affectedPopulationEstablishesCurrentExposure:
          nhtsa.ontology.affectedPopulationEstablishesCurrentExposure,
        statusCountsEstablishPaidIncurredOrUltimateLoss:
          nhtsa.ontology.statusCountsEstablishPaidIncurredOrUltimateLoss,
        recallManagementRecordIsEnforcementOrder:
          nhtsa.ontology.recallManagementRecordIsEnforcementOrder,
      },
      qualityAndMissingness: {
        officialNamedPost2010SliceNotAllHistoricalCampaigns:
          nhtsa.qualityAndMissingness.officialNamedPost2010SliceNotAllHistoricalCampaigns,
        current2026PeriodIncompleteAtFreeze:
          nhtsa.qualityAndMissingness.current2026PeriodIncompleteAtFreeze,
        quarterlyRowsAreRepeatedCumulativeStatusNotIndependentExposures:
          nhtsa.qualityAndMissingness
            .quarterlyRowsAreRepeatedCumulativeStatusNotIndependentExposures,
        annualRowsHavePublisherEligibilitySelection:
          nhtsa.qualityAndMissingness.annualRowsHavePublisherEligibilitySelection,
        manufacturerStatusRowsAreNotIndependentRepairAudits:
          nhtsa.qualityAndMissingness.manufacturerStatusRowsAreNotIndependentRepairAudits,
        completionStatusesMayBeRevisedAfterFreeze:
          nhtsa.qualityAndMissingness.completionStatusesMayBeRevisedAfterFreeze,
        latestObservedIsNotGuaranteedLatestPublisherTruthAfterFreeze:
          nhtsa.qualityAndMissingness
            .latestObservedIsNotGuaranteedLatestPublisherTruthAfterFreeze,
        campaignPopulationMayDifferFromStatusInvolvedPopulation:
          nhtsa.qualityAndMissingness
            .campaignPopulationMayDifferFromStatusInvolvedPopulation,
        campaignPotentialAffectedCrossCampaignVehicleOverlapUnresolved:
          nhtsa.qualityAndMissingness
            .campaignPotentialAffectedCrossCampaignVehicleOverlapUnresolved,
        quarterlyAndAnnualRatiosNotComparableWithoutCohortAlignment:
          nhtsa.qualityAndMissingness
            .quarterlyAndAnnualRatiosNotComparableWithoutCohortAlignment,
        noVehicleInServiceExposureDenominator:
          nhtsa.qualityAndMissingness.noVehicleInServiceExposureDenominator,
        noIndependentRepairAuditPopulation:
          nhtsa.qualityAndMissingness.noIndependentRepairAuditPopulation,
        knownSourceAnomaliesMachineDeferredNotNormalized:
          nhtsa.qualityAndMissingness.knownSourceAnomaliesMachineDeferredNotNormalized,
        enforcementActionOrConsentOrderBodiesCaptured:
          nhtsa.qualityAndMissingness.enforcementActionOrConsentOrderBodiesCaptured,
      },
      rights: {
        officialPublicDownloadObserved: nhtsa.rights.officialPublicDownloadObserved,
        exactPublicBytesReplayed: nhtsa.rights.exactPublicBytesReplayed,
        rawRedistributionRightConcluded: nhtsa.rights.rawRedistributionRightConcluded,
        commercialUseRightConcluded: nhtsa.rights.commercialUseRightConcluded,
        modelTrainingRightConcluded: nhtsa.rights.modelTrainingRightConcluded,
        legalConclusionMade: nhtsa.rights.legalConclusionMade,
      },
      trainingAdmitted: nhtsa.privacy.trainingAdmitted,
      targetTransferAdmitted: nhtsa.progress.targetTransferAdmitted,
      priceInputAdmitted: nhtsa.progress.priceInputAdmitted,
      actuarialLossCalibration: nhtsa.progress.actuarialLossCalibration,
      productionReadiness: nhtsa.progress.productionReadiness,
    },
    bridgeDataV2: {
      sourceId: bridge.source.sourceId,
      projectClaimedTrajectories: bridge.dataset.projectClaimedTrajectories,
      tfdsTotalExamples: bridge.dataset.tfds.totalExamples,
      projectMinusTfdsExamples: bridge.dataset.reconciliation.projectMinusTfdsExamples,
      tfdsCountDifferenceResolved: bridge.dataset.reconciliation.countsExactlyReconciled,
      trainExamples: bridge.dataset.tfds.splits.find(({ name }) => name === "train").examples,
      trainShards: bridge.dataset.tfds.splits.find(({ name }) => name === "train").shards,
      validationExamples: bridge.dataset.tfds.splits.find(({ name }) => name === "val").examples,
      validationShards: bridge.dataset.tfds.splits.find(({ name }) => name === "val").shards,
      capturedWholeRecords: bridge.sample.capturedWholeRecords,
      capturedWholeTrainShards: bridge.sample.capturedTrainShards,
      capturedValidationRecords: bridge.trainingCandidate.selectionCoverage
        .validationRecordsCaptured,
      knownRecordsInParentShard: bridge.sample.knownRecordsInParentShard,
      sampleTimesteps: bridge.sample.dimensionChecks.timesteps,
      sampleFeatureKeysExactlyMatchTfdsSchema:
        bridge.sample.featureKeysExactlyMatchTfdsSchema,
      actualRecordBytesCrcValidated: bridge.quality.actualRecordBytesCrcValidated,
      fullCorpusSchemaConformanceEstablished:
        bridge.quality.fullCorpusSchemaConformanceEstablished,
      fullSchemaAndSemanticContractEstablished:
        bridge.quality.fullSchemaAndSemanticContractEstablished,
      sampleSelectionRandomOrRepresentativeEstablished:
        bridge.quality.sampleSelectionRandomOrRepresentativeEstablished,
      trainValidationSplitTemporalOrProspectiveEstablished:
        bridge.quality.trainValidationSplitTemporalOrProspectiveEstablished,
      trajectoryCorrelationClustersMaterialized:
        bridge.quality.trajectoryCorrelationClustersMaterialized,
      perRecordOutcomeOrFailureLabelPresent:
        bridge.quality.perRecordOutcomeOrFailureLabelPresent,
      actionShapeDescriptionMismatch: bridge.quality.actionShapeDescriptionMismatch,
      stateShapeDescriptionMismatch: bridge.quality.stateShapeDescriptionMismatch,
      license: bridge.trainingCandidate.license,
      licenseStatementBytePinned: bridge.rights.licenseStatementBytePinned,
      legalReviewCompleted: bridge.rights.legalReviewCompleted,
      recordLevelThirdPartyContentReviewCompleted:
        bridge.rights.recordLevelThirdPartyContentReviewCompleted,
      productionTrainingRightFinallyAdjudicated:
        bridge.rights.productionTrainingRightFinallyAdjudicated,
      candidateDecision: bridge.trainingCandidate.decision,
      candidateWholeRecords: bridge.trainingCandidate.candidateWholeRecords,
      trainerRowsEnqueued: bridge.trainingCandidate.trainerRowsEnqueued,
      automaticTraining: bridge.trainingCandidate.automaticTraining,
      requiredBeforeTrainerAdmission:
        clone(bridge.trainingCandidate.requiredBeforeTrainerAdmission),
      statisticalModelCapabilityImprovementEstablished:
        bridge.stage15Evidence.statisticalModelCapabilityImprovementEstablished,
      targetRobotTransferEstablished: bridge.stage15Evidence.targetRobotTransferEstablished,
      targetDomainFactorAdmission: bridge.modelEntrance.targetDomainFactorAdmission,
      frequencyEligible: bridge.modelEntrance.frequencyEligible,
      severityEligible: bridge.modelEntrance.severityEligible,
      lossEligible: bridge.modelEntrance.lossEligible,
      prospectiveHoldoutEligible: bridge.modelEntrance.prospectiveHoldoutEligible,
      trainingAuthority: bridge.authority.TRAIN,
      priceAuthority: bridge.authority.PRICE,
    },
    waymoSafetyImpact: {
      sourceId: waymo.source.sourceId,
      publisherReleaseDate: waymo.release.publisherReleaseDate,
      csv1ToCsv3DataThrough: waymo.release.csv1ToCsv3DataThrough,
      csv4DataThrough: waymo.release.csv4SpatialBenchmarkInputsThrough,
      livingDatasetSubjectToRevision: waymo.release.livingDatasetSubjectToRevision,
      displayedRoundedRiderOnlyMiles:
        waymo.exposure.displayedRoundedTotalRiderOnlyMiles,
      displayedExposureIsExactUnroundedMiles:
        waymo.exposure.displayedExposureIsExactUnroundedMiles,
      displayedLeafPointTotalReconciled:
        waymo.exposure.displayedLeafPointTotalReconciled,
      overlappingCompositeRowsNotDoubleCounted:
        waymo.exposure.overlappingCompositeRowsNotDoubleCounted,
      publisherMeasuredMilesIndependentlyAudited:
        waymo.exposure.publisherMeasuredMilesIndependentlyAudited,
      outcomeRows: waymo.outcomes.rows,
      sgoLinkedRows: waymo.outcomes.sgoLinkedRows,
      uniqueSgoReportIds: waymo.outcomes.uniqueSgoReportIds,
      duplicateSgoIdVersionPairs: waymo.outcomes.duplicateSgoIdVersionPairs,
      duplicatePairRows: waymo.outcomes.duplicatePairQuarantine.rows,
      duplicatePairExtraRows:
        waymo.outcomes.duplicatePairQuarantine.extraRowsBeyondOnePerPair,
      duplicatePairsWithOutcomeFlagConflicts:
        waymo.outcomes.duplicatePairQuarantine.pairsWithOutcomeFlagConflicts,
      duplicatePairsWithSuppressedLocationTextConflicts:
        waymo.outcomes.duplicatePairQuarantine
          .pairsWithSuppressedLocationTextConflicts,
      duplicatePairsCountedAsIndependentCrashUnits:
        waymo.outcomes.duplicatePairQuarantine.countedAsIndependentCrashUnits,
      duplicatePairsAutomaticallyDeduplicatedOrAdjudicated:
        waymo.outcomes.duplicatePairQuarantine.automaticallyDeduplicatedOrAdjudicated,
      rowMembershipOutcomeTrueCounts:
        clone(waymo.outcomes.rowMembershipOutcomeTrueCounts),
      rowMembershipOutcomeUnknownCounts:
        clone(waymo.outcomes.rowMembershipOutcomeUnknownCounts),
      independentCrashOutcomeCountsAfterDuplicateResolution:
        waymo.outcomes.independentCrashOutcomeCountsAfterDuplicateResolution,
      temporalSplit: clone(waymo.outcomes.temporalSplitCandidate),
      benchmarkRows: waymo.benchmarkComparisons.rows,
      allLocationPublishedFactorRows:
        waymo.benchmarkComparisons.allLocationAllCrashPublishedFactors.length,
      allLocationPublishedFactorProfileHash: digest(
        "outsider/waymo/all-location-published-factors/v1",
        waymo.benchmarkComparisons.allLocationAllCrashPublishedFactors),
      allLocationPublishedRateRatioMinimum: Math.min(
        ...waymo.benchmarkComparisons.allLocationAllCrashPublishedFactors
          .map(({ rateRatio }) => rateRatio)),
      allLocationPublishedRateRatioMaximum: Math.max(
        ...waymo.benchmarkComparisons.allLocationAllCrashPublishedFactors
          .map(({ rateRatio }) => rateRatio)),
      literalNonfiniteTokens: Object.values(
        waymo.benchmarkComparisons.publishedNonfiniteNumericTokens)
        .reduce((sum, count) => sum + count, 0),
      waymoCiOrderViolations:
        waymo.benchmarkComparisons.qualityChecks.waymoCiOrderViolations,
      benchmarkCiOrderViolations:
        waymo.benchmarkComparisons.qualityChecks.benchmarkCiOrderViolations,
      naiveCountOverCsv1MilesDifferenceRows:
        waymo.benchmarkComparisons.qualityChecks.naiveCountOverCsv1MilesDifferenceRows,
      dynamicRows: waymo.dynamicBenchmarkInputs.rows,
      dynamicDistinctCells: waymo.dynamicBenchmarkInputs.distinctS2Cells,
      dynamicDistinctCompositeKeys:
        waymo.dynamicBenchmarkInputs.distinctCompositeKeys,
      dynamicDuplicateCompositeKeys:
        waymo.dynamicBenchmarkInputs.duplicateCompositeKeys,
      dynamicDuplicateRows: waymo.dynamicBenchmarkInputs.duplicateCompositeRows,
      dynamicBenchmarkCrashCountConflictKeys:
        waymo.dynamicBenchmarkInputs.benchmarkCrashCountConflictKeys,
      dynamicDuplicateRowsRetainedWithoutDeduplication:
        waymo.dynamicBenchmarkInputs.duplicateRowsRetainedWithoutDeduplication,
      dynamicBenchmarkCrashCountsAggregatedAcrossDuplicateKeys:
        waymo.dynamicBenchmarkInputs.benchmarkCrashCountsAggregatedAcrossDuplicateKeys,
      dynamicAlignedWithCsv1ToCsv3Through202603:
        waymo.dynamicBenchmarkInputs.alignedWithCsv1ToCsv3Through202603,
      matchedNhtsaSgoReportsIndependentlyReplayed:
        waymo.quality.matchedNhtsaSgoReportsIndependentlyReplayed,
      independentCrashFactAdjudicationEstablished:
        waymo.quality.independentCrashFactAdjudicationEstablished,
      faultOrCausalityEstablished: waymo.quality.faultOrCausalityEstablished,
      economicLossObserved: waymo.quality.economicLossObserved,
      affectedPartyReceiptOrRecoveryObserved:
        waymo.quality.affectedPartyReceiptOrRecoveryObserved,
      crossManufacturerComparabilityEstablished:
        waymo.quality.crossManufacturerComparabilityEstablished,
      temporalHoldoutIsRetrospectiveNotProspective:
        waymo.quality.temporalHoldoutIsRetrospectiveNotProspective,
      calibrationDecision: waymo.calibrationReference.decision,
      targetTransfer: waymo.calibrationReference.targetTransfer,
      actualOutsiderModelCalibrated:
        waymo.calibrationReference.actualOutsiderModelCalibrated,
      statisticalCapabilityImprovementEstablished:
        waymo.calibrationReference.statisticalCapabilityImprovementEstablished,
      candidateDecision: waymo.trainingCandidate.decision,
      candidateRows: waymo.trainingCandidate.candidateRows,
      trainerRowsEnqueued: waymo.trainingCandidate.trainerRowsEnqueued,
      automaticTraining: waymo.trainingCandidate.automaticTraining,
      frequencyModelEligible: waymo.modelEntrance.frequencyModelEligible,
      severityModelEligible: waymo.modelEntrance.severityModelEligible,
      targetHoldoutEligible: waymo.modelEntrance.targetHoldoutEligible,
      trainingAuthority: waymo.authority.TRAIN,
      priceAuthority: waymo.authority.PRICE,
    },
    clinicalTrials: {
      sourceId: clinical.source.sourceId,
      apiVersion: clinical.source.apiVersion,
      dataTimestamp: clinical.source.dataTimestamp,
      sourceSetHash: clinical.source.sourceSetHash,
      expectedTotalCount: clinical.population.expectedTotalCount,
      observedStudyRecords: clinical.population.observedStudyRecords,
      uniqueNctIds: clinical.population.uniqueNctIds,
      completeClosedQueryWindow: clinical.population.completeClosedQueryWindow,
      allHavePostedResultsFlag: clinical.population.allHavePostedResultsFlag,
      studiesWithPostedOutcomeMeasures:
        clinical.realPostedExperience.studiesWithPostedOutcomeMeasures,
      studiesWithPostedAdverseEvents:
        clinical.realPostedExperience.studiesWithPostedAdverseEvents,
      totalPostedOutcomeMeasureRows:
        clinical.realPostedExperience.totalPostedOutcomeMeasureRows,
      totalPostedSeriousAdverseEventTermRows:
        clinical.realPostedExperience.totalPostedSeriousAdverseEventTermRows,
      totalPostedOtherAdverseEventTermRows:
        clinical.realPostedExperience.totalPostedOtherAdverseEventTermRows,
      crossStudyAffectedCountsPooled:
        clinical.realPostedExperience.crossStudyAffectedCountsPooled,
      crossStudyRatesCalculated: clinical.realPostedExperience.crossStudyRatesCalculated,
      sponsorOrInvestigatorIsResponsibleForSubmittedAccuracy:
        clinical.quality.sponsorOrInvestigatorIsResponsibleForSubmittedAccuracy,
      nlmQcEstablishesScientificAccuracy:
        clinical.quality.nlmQcEstablishesScientificAccuracy,
      resultRecordsMayBeUpdatedAfterInitialPosting:
        clinical.quality.resultRecordsMayBeUpdatedAfterInitialPosting,
      sponsorNamesPersistedInDerivedArtifact:
        clinical.quality.sponsorNamesPersistedInDerivedArtifact,
      personNamesPersistedInDerivedArtifact:
        clinical.quality.personNamesPersistedInDerivedArtifact,
      rightsTermsSourceReplayed: clinical.rights.rightsTermsSourceReplayed,
      rightsDetermination: clinical.rights.rightsDetermination,
      independentAdjudicationEstablished:
        clinical.calibrationReference.independentAdjudicationEstablished,
      causalEffectEstablished: clinical.calibrationReference.causalEffectEstablished,
      targetDomainTransferEstablished:
        clinical.calibrationReference.targetDomainTransferEstablished,
      automaticBehaviorModelTrainingRightConcluded:
        clinical.rights.automaticBehaviorModelTrainingRightConcluded,
      admittedTrainingRows: clinical.trainingCandidate.admittedTrainingRows,
      automaticTraining: clinical.trainingCandidate.automaticTraining,
      trainingAuthority: clinical.authority.TRAIN,
      priceAuthority: clinical.authority.PRICE,
    },
  };
}

function nearestRank(values, probability) {
  if (!Array.isArray(values) || values.length === 0 || probability <= 0 || probability > 1
    || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    fail("QUANTILE_INPUT_INVALID");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(probability * sorted.length) - 1];
}

function dateDifferenceDays(later, earlier) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(later) || !/^\d{4}-\d{2}-\d{2}$/u.test(earlier)) {
    fail("DATE_INPUT_INVALID");
  }
  const laterMs = Date.parse(`${later}T00:00:00.000Z`);
  const earlierMs = Date.parse(`${earlier}T00:00:00.000Z`);
  const difference = (laterMs - earlierMs) / 86_400_000;
  if (!Number.isSafeInteger(difference)) fail("DATE_DIFFERENCE_INVALID");
  return difference;
}

function sumBigIntField(rows, key) {
  return rows.reduce((sum, row) => sum + BigInt(row[key]), 0n);
}

function buildDiagnostics(facts) {
  const groupsWithoutFinal = facts.fdic.dividendGroups - facts.fdic.groupsWithFinalEvent;
  const ftcFlowIdentity = BigInt(facts.remedy.ftc.returnedToConsumersUsdCents)
    + BigInt(facts.remedy.ftc.adminCostsUsdCents)
    + BigInt(facts.remedy.ftc.leftoverFundsUsdCents)
    === BigInt(facts.remedy.ftc.totalFundUsdCents);
  const judgment = facts.judgmentGao.treasury;
  const judgmentReportCountSum = judgment.reports
    .reduce((sum, row) => sum + row.rows, 0);
  const judgmentReportZeroSum = judgment.reports
    .reduce((sum, row) => sum + row.zero, 0);
  const judgmentReportOutsideSum = judgment.reports
    .reduce((sum, row) => sum + row.outside, 0);
  const judgmentReportRawPrecisionSum = judgment.reports
    .reduce((sum, row) => sum + row.rawPrecision, 0);
  const judgmentPublicationLags = judgment.reports
    .map((row) => dateDifferenceDays(row.created, row.end));
  const judgmentIntervalsContiguous = judgment.reports.every((row, index, rows) => (
    index === 0 || dateDifferenceDays(row.start, rows[index - 1].end) === 1
  ));
  const judgmentComponentSum = BigInt(judgment.totals.principalAmountCents)
    + BigInt(judgment.totals.attorneyFeesAmountCents)
    + BigInt(judgment.totals.costAmountCents)
    + BigInt(judgment.totals.interestAmountCents);
  const gao = facts.judgmentGao.gao;
  const fra = facts.fraPhmsa.fra;
  const fraAnnualDiagnostics = fra.annual.map((row) => {
    const incidentRate = ratioFixed(BigInt(row.uniqueReportedIncidents) * 1_000_000n,
      row.totalTrainMiles, 9);
    const fatalityRate = ratioFixed(BigInt(row.officialFatalities) * 1_000_000n,
      row.totalTrainMiles, 9);
    const injuryRate = ratioFixed(BigInt(row.officialInjuries) * 1_000_000n,
      row.totalTrainMiles, 9);
    const damageRate = ratioFixed(row.totalReportedDamageDollars,
      row.totalTrainMiles, 9);
    return { ...clone(row),
      incidentRatePerMillionTrainMilesRecomputed: incidentRate,
      incidentRateAgreesWithSourceAdapter: incidentRate
        === row.incidentRatePerMillionTrainMiles,
      fatalityRatePerMillionTrainMilesRecomputed: fatalityRate,
      fatalityRateAgreesWithSourceAdapter: fatalityRate
        === row.fatalityRatePerMillionTrainMiles,
      injuryRatePerMillionTrainMilesRecomputed: injuryRate,
      injuryRateAgreesWithSourceAdapter: injuryRate
        === row.injuryRatePerMillionTrainMiles,
      reportedDamageDollarsPerTrainMileRecomputed: damageRate,
      reportedDamageRateAgreesWithSourceAdapter: damageRate
        === row.reportedDamageDollarsPerTrainMile };
  });
  const fraPooledIncidentRate = ratioFixed(
    BigInt(fra.pooled.uniqueReportedIncidents) * 1_000_000n,
    fra.pooled.totalTrainMiles, 9);
  const fraPooledDamageRate = ratioFixed(fra.pooled.totalReportedDamageDollars,
    fra.pooled.totalTrainMiles, 9);
  const nhtsa = facts.nhtsaRecallRemedy;
  const nhtsaStatusComposition = (status) => {
    const involved = BigInt(status.latest.involved);
    const remedied = BigInt(status.latest.remedied);
    const unreachable = BigInt(status.latest.unreachable);
    const removed = BigInt(status.latest.removed);
    const componentSum = remedied + unreachable + removed;
    return {
      sourceUnit: status.sourceUnit,
      sourceRows: status.rows,
      uniqueRowHashes: status.uniqueRowHashes,
      exactDuplicateRows: status.exactDuplicateRows,
      uniqueCampaigns: status.uniqueCampaigns,
      submissionDateRange: { minimum: status.submissionDateMinimum,
        maximum: status.submissionDateMaximum },
      validReportingPeriodRange: { minimum: status.validPeriodMinimum,
        maximum: status.validPeriodMaximum },
      latestSelectionRule: status.latest.selectionRule,
      latestRowsAreNotReplacedByEarlierValidRows:
        status.latest.latestRowsAreNotReplacedByEarlierValidRows,
      selectedCampaigns: status.latest.selectedCampaigns,
      deferredLatestCampaigns: status.latest.deferredLatestCampaigns,
      deferReasons: clone(status.latest.deferReasons),
      selectedCampaignsLinkedToPost2010Recall:
        status.latest.selectedCampaignsLinkedToPost2010Recall,
      involved: status.latest.involved, remedied: status.latest.remedied,
      unreachable: status.latest.unreachable, removed: status.latest.removed,
      reportedComponentSum: componentSum.toString(),
      componentResidualToInvolved: (involved - componentSum).toString(),
      componentResidualLabeledUnremedied: false,
      componentSumWithinInvolvedForLatestAggregate: componentSum <= involved,
      remediedToInvolvedRatioFromSourceAdapter:
        status.latest.remediedToInvolvedRatio,
      remediedToInvolvedRatioRecomputed: ratioFixed(remedied, involved, 12),
      remediedRatioAgreesWithSourceAdapter:
        ratioFixed(remedied, involved, 12) === status.latest.remediedToInvolvedRatio,
      unreachableToInvolvedRatioRecomputed: ratioFixed(unreachable, involved, 12),
      removedToInvolvedRatioRecomputed: ratioFixed(removed, involved, 12),
      residualToInvolvedRatioRecomputed:
        ratioFixed(involved - componentSum, involved, 12),
      ratioIsDescriptivePublisherStatusSnapshot:
        status.latest.ratioIsDescriptivePublisherStatusSnapshot,
      ratioIsNotUniqueRepairReceiptOrActuarialRate:
        status.latest.ratioIsNotUniqueRepairReceiptOrActuarialRate,
      ratioIsCompleteRepairRate: false,
      ratioIsTargetDomainRate: false,
      ratioIsFrequencyOrSeverityRate: false,
    };
  };
  const diagnostics = {
    wave5SourceAwareTaxonomy: {
      sourceDomain: "WAVE5_REAL_SOFTWARE_SOURCE_AWARE_TAXONOMY",
      exactSourceBinding: {
        snapshotHash: facts.wave5.snapshotHash,
        sourceVerificationHash: facts.wave5.sourceVerificationHash,
        sourceNativeRows: facts.wave5.sourceNativeRows,
        uniqueD1IdentityRoots: facts.wave5.uniqueD1IdentityRoots,
        conservativeD2CorrelationGroups:
          facts.wave5.conservativeD2CorrelationGroups,
      },
      traceSessionShape: {
        rows: facts.wave5.organicAgentSessionShapeRows,
        toolCalls: facts.wave5.traceToolCalls,
        sourceNativeToolErrors: facts.wave5.traceSourceNativeToolErrors,
        harnessProfileHash: facts.wave5.traceHarnessesProfileHash,
        toolEvidenceCoverageProfileHash:
          facts.wave5.traceToolEvidenceCoverageProfileHash,
        wholeSessionProjectionIsPreActionAvailable: false,
        successRecoveryOrErrorRateEstimated: false,
      },
      rosBugFixMechanismTaxonomy: {
        rows: facts.wave5.rosBugFixMechanismTaxonomyRows,
        systemsProfileHash: facts.wave5.robustSystemsProfileHash,
        phasesProfileHash: facts.wave5.robustPhasesProfileHash,
        faultCodesProfileHash: facts.wave5.robustFaultCodesProfileHash,
        failureCodesProfileHash: facts.wave5.robustFailureCodesProfileHash,
        issueReferenceMissingRows: facts.wave5.robustIssueReferenceMissing,
        pullRequestReferenceMissingRows:
          facts.wave5.robustPullRequestReferenceMissing,
        fixCommitMissingRows: facts.wave5.robustFixCommitMissing,
        physicalExecutionOutcomeOrLossEstablished: false,
        populationFrequencyEstimated: false,
      },
      rightsAndAdmissionBoundary: {
        traceCompilationLicenseId: facts.wave5.traceCompilationLicenseId,
        traceCompilationPublisherPermitsTrainingWithAttribution:
          facts.wave5.traceCompilationPublisherPermitsTrainingWithAttribution,
        traceEmbeddedMaterialLicensesUniformlyVerified:
          facts.wave5.traceEmbeddedMaterialLicensesUniformlyVerified,
        robustRootLicenseOrCopyingFileDetectedAtPinnedTree:
          facts.wave5.robustRootLicenseOrCopyingFileDetectedAtPinnedTree,
        rowsMissingIndependentOutcome:
          facts.wave5.rowsMissingIndependentOutcome,
        rowsMissingExposureDenominator:
          facts.wave5.rowsMissingExposureDenominator,
        rowsWithEconomicLoss: facts.wave5.rowsWithEconomicLoss,
        sourceHumanReviewDeclaredRows:
          facts.wave5.sourceHumanReviewDeclaredRows,
        outsiderProjectionReviewedRows:
          facts.wave5.outsiderProjectionReviewedRows,
        downstreamHumanReviewRequiredRows:
          facts.wave5.downstreamHumanReviewRequiredRows,
        preActionAvailableRows: facts.wave5.preActionAvailableRows,
        targetPredictorEligibleRows: facts.wave5.targetPredictorEligibleRows,
        trainerRowsEnqueued: facts.wave5.trainerRowsEnqueued,
        automaticTraining: facts.wave5.automaticTraining,
        pricingEligibleRows: facts.wave5.pricingEligibleRows,
        causalExperienceUnits: facts.wave5.causalExperienceUnits,
        targetTransferEstablished: facts.wave5.targetTransferEstablished,
        authority: facts.wave5.authority,
        targetFrequencyEstimate: null, targetSeverityEstimate: null,
        targetLossEstimate: null, targetPrice: null,
      },
      factorUseBoundary: {
        typedQualityFactorDefinitions: 3,
        behaviorModelRowsAdded: 0, outcomeModelRowsAdded: 0,
        postOutcomeOrWholeRecordProjectionUsedAsPreActionPredictor: false,
        targetTransferOrPoolingPerformed: false,
      },
    },
    nfipPaymentAndExposure: {
      sourceDomain: "NFIP_NC_2024_CLAIM_TRANSACTIONS",
      empiricalSeverity: { statisticType: "EMPIRICAL_NEAREST_RANK_SOURCE_PROJECTION",
        observationUnit: "PUBLISHER_CLAIM_TRANSACTION_RECORD_NOT_PROVEN_UNIQUE_LOSS",
        rows: facts.nfip.claimTransactionRows, ...clone(facts.nfip.severity), iidAssumed: false,
        fittedTailDistribution: null },
      paymentAccounting: { grossReportedPaymentUsd: facts.nfip.grossPaymentUsd,
        actualAdministrativePaymentFieldsAdmitted:
          facts.nfip.actualAdministrativePaymentFieldsAdmitted,
        recordedClaimPaymentRecoveryUsd: facts.nfip.recordedRecoveryUsd,
        netPaymentUsd: facts.nfip.netPaymentUsd,
        grossMinusRecordedRecoveryEqualsNet:
          decimalToInteger(facts.nfip.grossPaymentUsd, 2)
            - decimalToInteger(facts.nfip.recordedRecoveryUsd, 2)
            === decimalToInteger(facts.nfip.netPaymentUsd, 2),
        recordedRecoveryShareOfGross:
          decimalRatioFixed(facts.nfip.recordedRecoveryUsd, facts.nfip.grossPaymentUsd),
        beneficiaryCashReceiptObserved: false,
        recoveryIsRealityRestoration: false },
      zeroAndLatency: { zeroNetPaymentRows: facts.nfip.zeroNetPaymentRows,
        zeroNetPaymentRowFraction: ratioFixed(facts.nfip.zeroNetPaymentRows,
          facts.nfip.claimTransactionRows), zeroMeansDeniedOrClosed: false,
        paymentDateEligibleRows: facts.nfip.paymentDateRows,
        paymentDateMissingRows: facts.nfip.claimTransactionRows - facts.nfip.paymentDateRows,
        paymentDateObservedFraction: ratioFixed(facts.nfip.paymentDateRows,
          facts.nfip.claimTransactionRows), empiricalLatencyDays: clone(facts.nfip.paymentLatency),
        latencyConditionedOnObservedNonnegativeDates: true,
        missingDatesTreatedAsZeroLatency: false, mostRecentPaymentDateMeansClosure: false },
      denominatorBoundary: { lossYear: facts.nfip.lossYear,
        currentExposureAsOf: facts.nfip.currentExposureAsOf,
        currentNcContractsInForce: facts.nfip.currentNcContractsInForce,
        claimReportedCoverageUsd: facts.nfip.claimReportedCoverageUsd,
        claimReportedCoverageIsPortfolioExposure: false,
        currentExposureMatchedToHistoricalLoss: false,
        claimFrequency: null, reportRate: null },
    },
    femaAppealAdjudication: {
      sourceDomain: "FEMA_PUBLIC_ASSISTANCE_SECOND_APPEALS",
      statusComposition: { rows: facts.appeals.records,
        counts: clone(facts.appeals.statusCounts), meritsDecisionRows: facts.appeals.meritsDecisionRows,
        meritsDecisionFraction: ratioFixed(facts.appeals.meritsDecisionRows, facts.appeals.records),
        proceduralOrNonMeritsRows: facts.appeals.proceduralOrNonMeritsRows },
      rightCensoring: { signedDecisionRows: facts.appeals.signedDecisionRows,
        signedDecisionFraction: ratioFixed(facts.appeals.signedDecisionRows, facts.appeals.records),
        pendingRows: facts.appeals.pendingUnderReviewRows,
        pendingRightCensoredFraction: ratioFixed(facts.appeals.pendingUnderReviewRows,
          facts.appeals.records), pendingRowsTreatedAsDenied: false,
        pendingRowsTreatedAsClosed: false, survivalCurveEstimated: false },
      pendingAllocationBounds: {
        boundedStatusSet: ["Granted", "Partially Granted"],
        observedSignedRowsInSet: facts.appeals.statusCounts.Granted
          + facts.appeals.statusCounts["Partially Granted"],
        allPublisherRowFractionLowerIfNoPendingRowJoinsSet: ratioFixed(
          facts.appeals.statusCounts.Granted
            + facts.appeals.statusCounts["Partially Granted"], facts.appeals.records),
        allPublisherRowFractionUpperIfEveryPendingRowJoinsSet: ratioFixed(
          facts.appeals.statusCounts.Granted
            + facts.appeals.statusCounts["Partially Granted"]
            + facts.appeals.pendingUnderReviewRows, facts.appeals.records),
        boundsAreMeritsSuccessRate: false,
        proceduralRowsRetainedInAllPublisherRowDenominator: true,
      },
      signedDecisionLatency: { statisticType: "EMPIRICAL_NEAREST_RANK_CONDITIONED_ON_SIGNED_DECISION",
        ...clone(facts.appeals.signedElapsedDays), pendingRowsExcluded: true,
        deadlineViolationInferred: false },
      dependenceBoundary: { distinctCompositeRoots: facts.appeals.distinctCompositeRoots,
        additionalRowsSharingCompositeRoot: facts.appeals.additionalRowsSharingCompositeRoot,
        publisherRowsAssumedIid: false },
    },
    rmaAggregateIndemnity: {
      sourceDomain: "USDA_RMA_CROP_INSURANCE_2024",
      cells: { sourceRows: facts.rma.sourceRows, exposureCells: facts.rma.exposureCells,
        zeroReportedLossExposureCells: facts.rma.zeroReportedLossExposureCells,
        zeroReportedLossExposureCellFraction: ratioFixed(
          facts.rma.zeroReportedLossExposureCells, facts.rma.exposureCells),
        noExposureNoReportedLossCells: facts.rma.noExposureNoReportedLossCells,
        noExposureNoReportedLossSourceRowFraction: ratioFixed(
          facts.rma.noExposureNoReportedLossCells, facts.rma.sourceRows),
        zeroReportedLossMeansVerifiedZeroRealizedLoss: false,
        noExposureRowsAdmittedToLossFrequencyDenominator: false },
      countQuarantine: {
        policyNumeratorExceedsDenominatorCells:
          facts.rma.policyNumeratorExceedsDenominatorCells,
        policyAnomalyFractionOfExposureCells: ratioFixed(
          facts.rma.policyNumeratorExceedsDenominatorCells, facts.rma.exposureCells),
        unitNumeratorExceedsDenominatorCells: facts.rma.unitNumeratorExceedsDenominatorCells,
        unitAnomalyFractionOfExposureCells: ratioFixed(
          facts.rma.unitNumeratorExceedsDenominatorCells, facts.rma.exposureCells),
        reportedLossFrequency: null, uniquePolicyholderFrequency: null },
      aggregateAmounts: { liabilityUsd: facts.rma.liabilityUsd,
        premiumUsd: facts.rma.totalPremiumUsd, indemnityUsd: facts.rma.indemnityUsd,
        indemnityToPremiumRatio: ratioFixed(facts.rma.indemnityUsd, facts.rma.totalPremiumUsd),
        indemnityToLiabilityRatio: ratioFixed(facts.rma.indemnityUsd, facts.rma.liabilityUsd),
        indemnityIsCashPaid: false, individualSeverityObserved: false },
    },
    casReserveBacktest: {
      sourceDomain: "CAS_SCHEDULE_P",
      accounting: { sourceRows: facts.cas.sourceRows,
        fullTenByTenTriangles: facts.cas.fullTenByTenTriangles,
        incompleteTenByTenTriangles: facts.cas.incompleteTenByTenTriangles,
        triangleGroups: facts.cas.fullTenByTenTriangles + facts.cas.incompleteTenByTenTriangles,
        fullTenByTenTriangleFraction: ratioFixed(facts.cas.fullTenByTenTriangles,
          facts.cas.fullTenByTenTriangles + facts.cas.incompleteTenByTenTriangles),
        incompleteTenByTenTriangleFraction: ratioFixed(facts.cas.incompleteTenByTenTriangles,
          facts.cas.fullTenByTenTriangles + facts.cas.incompleteTenByTenTriangles),
        amountUnit: facts.cas.outputAmountUnit },
      cumulativePaid: { statisticType: "OUT_OF_TIME_LAG10_AGGREGATE_BACKTEST",
        ...clone(facts.cas.paid) },
      incurred: { statisticType: "OUT_OF_TIME_LAG10_AGGREGATE_BACKTEST",
        ...clone(facts.cas.incurred) },
      boundary: { lag10IsUltimateEstablished: false, developmentBeyondLag10Observed: false,
        tailFactorFitted: false, crossEntityDependenceEstimated: false,
        calendarShockIdentifiersObserved: false, sourceAmountScaleDeclared: false,
        incompleteTrianglesImputedAsComplete: false,
        tailAndDependenceMissingnessPreserved: true,
        targetReserveFactor: null },
    },
    maudePassiveOutcomeSensing: {
      sourceDomain: "FDA_MAUDE_PASSIVE_SURVEILLANCE",
      revision: { baseAddRows: facts.maude.baseAddRows,
        baseChangeRows: facts.maude.baseChangeRows, crossStreamOverlap: facts.maude.baseOverlap,
        overlapShareOfBaseAdd: ratioFixed(facts.maude.baseOverlap, facts.maude.baseAddRows),
        overlapRowsWithChangedContent: facts.maude.overlapChangedContent,
        changedContentShareOfOverlap: ratioFixed(facts.maude.overlapChangedContent,
          facts.maude.baseOverlap), precedence: "BASE_CHANGE_SUPERSEDES_BASE_ADD_FOR_EQUAL_KEY" },
      outcomes: { effectiveReportKeys: facts.maude.effectiveReportRows,
        eventTypeReportCounts: clone(facts.maude.eventTypeCounts),
        eventTypeReportFractions: Object.fromEntries(Object.entries(
          facts.maude.eventTypeCounts).map(([eventType, count]) => [eventType,
          ratioFixed(count, facts.maude.effectiveReportRows)])),
        eventTypeCountsEqualEffectiveReportKeys: Object.values(facts.maude.eventTypeCounts)
          .reduce((sum, count) => sum + count, 0) === facts.maude.effectiveReportRows,
        reportsWithFollowupEvidence: facts.maude.reportsWithFollowupEvidence,
        followupEvidenceFraction: ratioFixed(facts.maude.reportsWithFollowupEvidence,
          facts.maude.effectiveReportRows), reportRowsCalledIncidentEvents: false },
      missingness: { missingEventDateRows: facts.maude.missingEventDate,
        missingEventDateFraction: ratioFixed(facts.maude.missingEventDate,
          facts.maude.effectiveReportRows), missingReportDateRows: facts.maude.missingReportDate,
        missingReportDateFraction: ratioFixed(facts.maude.missingReportDate,
          facts.maude.effectiveReportRows), missingEventKeyRows: facts.maude.eventKeyMissing,
        missingEventKeyFraction: ratioFixed(facts.maude.eventKeyMissing,
          facts.maude.effectiveReportRows),
        numberDevicesMissingRows: facts.maude.numberDevicesMissing,
        numberDevicesMissingFraction: ratioFixed(facts.maude.numberDevicesMissing,
          facts.maude.effectiveReportRows),
        numberPatientsMissingRows: facts.maude.numberPatientsMissing,
        numberPatientsMissingFraction: ratioFixed(facts.maude.numberPatientsMissing,
          facts.maude.effectiveReportRows),
        reportsWithoutDeviceRows: facts.maude.reportsWithoutDeviceRows,
        reportsWithMultipleDeviceRows: facts.maude.reportsWithMultipleDeviceRows,
        multipleDeviceRowFraction: ratioFixed(facts.maude.reportsWithMultipleDeviceRows,
          facts.maude.effectiveReportRows) },
      boundary: { deviceUseDenominatorObserved: false, incidenceRate: null,
        crossDeviceRate: null, deviceCausalityEstablished: false,
        passiveUnderreportingResolved: false, independentOutcomeReviewEstablished: false },
    },
    dmvRegimeExposure: {
      sourceDomain: "CA_DMV_AV_REPORTING",
      permitContext: { driveredPermitHolders: facts.dmv.driveredPermitHolders,
        driverlessPermitHolders: facts.dmv.driverlessPermitHolders,
        deploymentPermitHolders: facts.dmv.deploymentPermitHolders,
        permitHolderCountIsActiveVehicleOrMileageExposure: false },
      legacyCohorts: {
        period2022_12_01Through2023_11_30: { totalMiles: facts.dmv.legacy2023Miles,
          safetyDriverMiles: facts.dmv.legacy2023SafetyDriverMiles,
          driverlessMiles: facts.dmv.legacy2023DriverlessMiles,
          componentsEqualTotal: facts.dmv.legacy2023SafetyDriverMiles
            + facts.dmv.legacy2023DriverlessMiles === facts.dmv.legacy2023Miles },
        period2023_12_01Through2024_11_30: { totalMiles: facts.dmv.legacy2024Miles,
          safetyDriverMiles: facts.dmv.legacy2024SafetyDriverMiles,
          driverlessMiles: facts.dmv.legacy2024DriverlessMiles,
          componentsEqualTotal: facts.dmv.legacy2024SafetyDriverMiles
            + facts.dmv.legacy2024DriverlessMiles === facts.dmv.legacy2024Miles },
        laterToEarlierTotalMilesRatio: ratioFixed(facts.dmv.legacy2024Miles,
          facts.dmv.legacy2023Miles), cohortsPooled: false },
      collisionBoundary: { selectedManufacturerReportPdfs: facts.dmv.selectedCollisionPdfs,
        selectedPdfsPairedToLegacyMiles: false, completeCollisionManifestObserved: false,
        collisionRate: null, companyComparison: null },
      enhancedRegime: { observedMonthlyRowsAtSnapshot: facts.dmv.observed2026MonthlyRows,
        observedQuarterlyRowsAtSnapshot: facts.dmv.observed2026QuarterlyRows,
        snapshotDate: facts.dmv.enhancedSnapshotDate,
        firstMonthlyDue: facts.dmv.firstMonthlyDue,
        firstQuarterlyDue: facts.dmv.firstQuarterlyDue,
        firstMonthlyDueReachedAtSnapshot: facts.dmv.firstMonthlyDueReachedAtSnapshot,
        firstQuarterlyDueReachedAtSnapshot: facts.dmv.firstQuarterlyDueReachedAtSnapshot,
        noObservationFabricatedBeforeDueDate: facts.dmv.noObservationFabricatedBeforeDueDate,
        zeroRowsMeansZeroCollisions: false, crossRegimeTimeSeriesPermitted: false },
    },
    ntsbCompletedInvestigationOutcome: {
      sourceDomain: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
      selection: { completedCasesAtFrozenIndex:
          facts.ntsbBls.ntsb.completedCasesAtFrozenIndex,
        selectedCompletedCases: facts.ntsbBls.ntsb.selectedCases,
        selectedSetIsStatisticalPopulation: false,
        selectedSetIsRepresentativeSample: false,
        caseFrequency: null, economicSeverity: null },
      sourceAccounting: { finalReportFiles: facts.ntsbBls.ntsb.finalReportFiles,
        finalReportCaseCoverage: facts.ntsbBls.ntsb.finalReportCaseCoverage,
        selectedFactualReportFiles: facts.ntsbBls.ntsb.selectedFactualReportFiles,
        docketIndexPages: facts.ntsbBls.ntsb.docketIndexPages,
        docketDocumentLinks: facts.ntsbBls.ntsb.docketDocumentLinks,
        completeDocketDocumentBytesCaptured:
          facts.ntsbBls.ntsb.completeDocketDocumentBytesCaptured,
        allElevenSelectedPdfsByteCompleteAndFullyParsed:
          facts.ntsbBls.ntsb.allElevenPdfsByteCompleteAndFullyParsed },
      findingAndFinality: {
        probableCauseAndFindingsAreFinalNtsbSafetyInvestigationFindings:
          facts.ntsbBls.ntsb.probableCauseAndFindingsAreFinalSafetyFindings,
        assignsFaultOrBlame: facts.ntsbBls.ntsb.assignsFaultOrBlame,
        determinesRightsOrLiabilities: facts.ntsbBls.ntsb.determinesRightsOrLiabilities,
        civilDamagesEvidenceUseRestrictedBy49Usc1154b:
          facts.ntsbBls.ntsb.civilDamagesEvidenceUseRestricted,
        recommendationsAreSettlementOrders: false,
        laterRecommendationStatusAndPostFreezeRevisionObserved:
          facts.ntsbBls.ntsb.laterRecommendationStatusAndPostFreezeRevisionObserved },
      inferenceBoundary: { causalMechanismsDescribedForInvestigatedCases: true,
        causalEffectGeneralizedBeyondInvestigatedCases: false,
        selectedCasesDividedByBlsHours: false,
        targetDomainTransferEstablished: false },
    },
    blsOccupationalOutcomeExposure: {
      sourceDomain: "BLS_IIF_2024_SOII_CFOI_OIICS",
      soiiPrivateIndustry: {
        referenceYear: facts.ntsbBls.soii.referenceYear,
        alignedRateCountAndRseRows: facts.ntsbBls.soii.alignedRows,
        normalizedUniqueKeys: facts.ntsbBls.soii.normalizedUniqueKeys,
        repeatedRowsPreservedNotDeduplicated:
          facts.ntsbBls.soii.repeatedRowsPreserved,
        hoursRows: facts.ntsbBls.soii.hoursRows,
        hoursUniqueKeys: facts.ntsbBls.soii.hoursUniqueKeys,
        hoursUniqueKeyOverlapWithMainFrame:
          facts.ntsbBls.soii.hoursOverlapWithMainFrame,
        positionalHoursJoinPermitted: false,
        totalSuppressionMarkers: facts.ntsbBls.soii.totalSuppressionMarkers,
        suppressionMarkersZeroFilled: false,
        publishedTotalRecordableRatePer100Fte:
          facts.ntsbBls.soii.privateTotalRecordableRatePer100Fte,
        publishedTotalRecordableCasesThousands:
          facts.ntsbBls.soii.privateTotalRecordableCasesThousands,
        publishedEmployeeHoursThousands:
          facts.ntsbBls.soii.privateEmployeeHoursThousands,
        independentlyRecomputedRateSixDecimals: ratioFixed(
          decimalToInteger(facts.ntsbBls.soii.privateTotalRecordableCasesThousands, 1)
            * 200_000n,
          decimalToInteger(facts.ntsbBls.soii.privateEmployeeHoursThousands, 0) * 10n,
          6),
        sourceAdapterDerivedRateSixDecimals:
          facts.ntsbBls.soii.derivedPrivateRateSixDecimals,
        agreesAtPublishedOneDecimal: ratioFixed(
          decimalToInteger(facts.ntsbBls.soii.privateTotalRecordableCasesThousands, 1)
            * 200_000n,
          decimalToInteger(facts.ntsbBls.soii.privateEmployeeHoursThousands, 0) * 10n,
          1) === facts.ntsbBls.soii.privateTotalRecordableRatePer100Fte,
        rateRsePercent: facts.ntsbBls.soii.privateRateRsePercent,
        countRsePercent: facts.ntsbBls.soii.privateCountRsePercent,
        hoursRsePercent: facts.ntsbBls.soii.privateHoursRsePercent,
        rseMeasuresAllError: false,
        rseUsedAsArbitraryQualityWeight: false,
      },
      cfoi: {
        referenceYear: facts.ntsbBls.cfoi.referenceYear,
        allFatalOccupationalInjuries:
          facts.ntsbBls.cfoi.allFatalOccupationalInjuries,
        privateIndustryFatalInjuries:
          facts.ntsbBls.cfoi.privateIndustryFatalInjuries,
        nationalTotalAgreementAcrossFourCountTables:
          facts.ntsbBls.cfoi.nationalTotalCrossTableAgreement,
        totalHoursWorkedMillions: facts.ntsbBls.cfoi.totalHoursWorkedMillions,
        publishedTotalRatePer100000Fte:
          facts.ntsbBls.cfoi.totalPublishedRatePer100000Fte,
        totalEmploymentVarianceMarginOfError:
          facts.ntsbBls.cfoi.totalEmploymentVarianceMarginOfError,
        privateHoursWorkedMillions: facts.ntsbBls.cfoi.privateHoursWorkedMillions,
        publishedPrivateRatePer100000Fte:
          facts.ntsbBls.cfoi.privatePublishedRatePer100000Fte,
        privateEmploymentVarianceMarginOfError:
          facts.ntsbBls.cfoi.privateEmploymentVarianceMarginOfError,
        rateExposureSource: facts.ntsbBls.cfoi.rateExposureSource,
        displayedCountBeforeRateExclusions:
          facts.ntsbBls.cfoi.displayedCountBeforeRateExclusions,
        displayed5070DividedByPublishedHoursToRecomputeRate: false,
        totalSuppressionMarkers: facts.ntsbBls.cfoi.totalSuppressionMarkers,
        suppressionMarkersZeroFilled: false,
        marginOfErrorMeasuresFatalCountVariation: false,
      },
      classificationAndRevision: { oiicsVersion: facts.ntsbBls.oiics.version,
        issued: facts.ntsbBls.oiics.issued,
        implementedReferenceYear: facts.ntsbBls.oiics.implementedReferenceYear,
        workbookSheetCount: facts.ntsbBls.oiics.workbookSheetCount,
        referenceYear2023WasSeriesBreak:
          facts.ntsbBls.oiics.referenceYear2023SeriesBreak,
        crossSeriesPoolingWithoutVersionHandlingPermitted:
          facts.ntsbBls.oiics.crossSeriesPoolingWithoutVersionHandlingPermitted },
      inferenceBoundary: { soiiAndCfoiAreSeparatePrograms: true,
        ntsbCasesUsedAsNumerator: false, ntsbCaseFrequency: null,
        economicLossObserved: false, causalEffectIdentified: false,
        targetDomainTransferEstablished: false, targetPrice: null },
    },
    treasuryJudgmentFundPayment: {
      sourceDomain: "TREASURY_JUDGMENT_FUND_2026_PAYMENT_REPORTS",
      snapshotAndCensoring: {
        start: judgment.snapshot.start, end: judgment.snapshot.end,
        reportIntervals: judgment.snapshot.reportIntervals,
        extractedReportIntervals: judgment.reports.length,
        expectedAndExtractedReportCountsAgree:
          judgment.snapshot.reportIntervals === judgment.reports.length,
        firstReportStartsAtSnapshotStart:
          judgment.reports[0].start === judgment.snapshot.start,
        lastReportEndsAtSnapshotEnd:
          judgment.reports.at(-1).end === judgment.snapshot.end,
        reportIntervalsContiguousWithoutOverlap: judgmentIntervalsContiguous,
        latestFullyPublishedIntervalAtFreeze:
          judgment.snapshot.latestFullyPublishedIntervalAtFreeze,
        rightCensoredAfter: judgment.snapshot.rightCensoredAfter,
        postCensorRowsTreatedAsZeroPayments: false,
      },
      publicationTiming: {
        statisticType: "EMPIRICAL_NEAREST_RANK_REPORT_END_TO_WORKBOOK_CREATED_DATE",
        observationUnit: "BIWEEKLY_PUBLISHER_REPORT_INTERVAL",
        eligibleIntervals: judgmentPublicationLags.length,
        minimumDays: nearestRank(judgmentPublicationLags,
          1 / judgmentPublicationLags.length),
        p50Days: nearestRank(judgmentPublicationLags, 0.5),
        p90Days: nearestRank(judgmentPublicationLags, 0.9),
        p95Days: nearestRank(judgmentPublicationLags, 0.95),
        maximumDays: nearestRank(judgmentPublicationLags, 1),
        thisIsEventToPaymentLatency: false,
        requestToCertificationLatencyObserved: false,
        certificationToDisbursementLatencyObserved: false,
        recipientSettlementLatencyObserved: false,
        empiricalPaymentLatency: null,
      },
      componentAccounting: {
        paymentComponentRows: judgment.totals.paymentComponentRows,
        reportRowSumsEqualPublishedTotal:
          judgmentReportCountSum === judgment.totals.paymentComponentRows,
        principalAmountCents: judgment.totals.principalAmountCents,
        attorneyFeesAmountCents: judgment.totals.attorneyFeesAmountCents,
        costAmountCents: judgment.totals.costAmountCents,
        interestAmountCents: judgment.totals.interestAmountCents,
        totalPublishedAmountCents: judgment.totals.totalPublishedAmountCents,
        componentsEqualTotal: judgmentComponentSum
          === BigInt(judgment.totals.totalPublishedAmountCents),
        reportPrincipalSumsEqualTotal: sumBigIntField(judgment.reports, "principal")
          === BigInt(judgment.totals.principalAmountCents),
        reportFeeSumsEqualTotal: sumBigIntField(judgment.reports, "fees")
          === BigInt(judgment.totals.attorneyFeesAmountCents),
        reportCostSumsEqualTotal: sumBigIntField(judgment.reports, "cost")
          === BigInt(judgment.totals.costAmountCents),
        reportInterestSumsEqualTotal: sumBigIntField(judgment.reports, "interest")
          === BigInt(judgment.totals.interestAmountCents),
        reportPublishedAmountSumsEqualTotal: sumBigIntField(judgment.reports, "total")
          === BigInt(judgment.totals.totalPublishedAmountCents),
        observationUnit: "PUBLISHED_PAYMENT_COMPONENT_ROW_NOT_UNIQUE_CLAIM",
        cashReceiptAtRecipientBankObserved: false,
      },
      missingnessRevisionAndDedup: {
        zeroTotalPublishedAmountRows: judgment.totals.zeroTotalPublishedAmountRows,
        zeroTotalPublishedAmountRowFraction: ratioFixed(
          judgment.totals.zeroTotalPublishedAmountRows,
          judgment.totals.paymentComponentRows),
        reportZeroSumsEqualPublishedTotal:
          judgmentReportZeroSum === judgment.totals.zeroTotalPublishedAmountRows,
        rowsOutsideWorkbookFilter: judgment.totals.rowsOutsideWorkbookFilter,
        outsideFilterRowFraction: ratioFixed(judgment.totals.rowsOutsideWorkbookFilter,
          judgment.totals.paymentComponentRows),
        reportOutsideFilterSumsEqualPublishedTotal:
          judgmentReportOutsideSum === judgment.totals.rowsOutsideWorkbookFilter,
        rawNumericCellsWithMoreThanTwoDecimalPlaces:
          judgment.totals.rawNumericCellsWithMoreThanTwoDecimalPlaces,
        rawPrecisionCellFractionOfFourComponentCells: ratioFixed(
          judgment.totals.rawNumericCellsWithMoreThanTwoDecimalPlaces,
          judgment.totals.paymentComponentRows * 4),
        reportRawPrecisionSumsEqualPublishedTotal:
          judgmentReportRawPrecisionSum
            === judgment.totals.rawNumericCellsWithMoreThanTwoDecimalPlaces,
        exactFullRawRowsRepeatedOccurrencesWithinReports:
          judgment.totals.exactFullRawRowsRepeatedOccurrencesWithinReports,
        rawRepeatOccurrenceFractionOfComponentRows: ratioFixed(
          judgment.totals.exactFullRawRowsRepeatedOccurrencesWithinReports,
          judgment.totals.paymentComponentRows),
        responsibleAgencyAggregateRows: judgment.aggregateCounts.responsibleAgencies,
        submittingAgencyAggregateRows: judgment.aggregateCounts.submittingAgencies,
        principalCitationAggregateRows: judgment.aggregateCounts.principalCitations,
        ...clone(judgment.revisionBoundary),
        zeroAmountMeansNoPaymentObligationOrClosure: false,
        rawRepeatedOccurrenceMeansDuplicateClaim: false,
      },
      amountAndDenominatorBoundary: {
        ...clone(judgment.amountAndUnitBoundary),
        uniqueClaimCount: null, affectedPersonCount: null,
        claimFrequency: null, individualLossSeverity: null,
        recoveryRate: null, reserveAdequacy: null,
      },
      certificationCustodyAndConsequenceBoundary: {
        ...clone(judgment.certificationBoundary),
        offsetLayersKeptSeparate: judgment.certificationBoundary
          .judgmentDebtSetoffOccursAtCertificationLevel
          && judgment.certificationBoundary
            .administrativeOffsetOccursAtDisbursingLevelAfterCertification,
        recipientReceiptObserved: false, claimantAcceptanceObserved: false,
        fullRecoveryObserved: false, obligationClosureObserved: false,
        obligationReopeningObserved: false,
      },
    },
    gaoBidProtestAdjudication: {
      sourceDomain: "GAO_BID_PROTEST_FY2025",
      annualAggregate: {
        fiscalYear: gao.fiscalYear,
        casesFiled: gao.annualAggregate.casesFiled,
        protestsFiled: gao.annualAggregate.protestsFiled,
        costClaimsFiled: gao.annualAggregate.costClaimsFiled,
        reconsiderationRequestsFiled: gao.annualAggregate.reconsiderationRequestsFiled,
        casesClosed: gao.annualAggregate.casesClosed,
        protestsClosed: gao.annualAggregate.protestsClosed,
        costClaimsClosed: gao.annualAggregate.costClaimsClosed,
        reconsiderationRequestsClosed: gao.annualAggregate.reconsiderationRequestsClosed,
        taskOrderCasesClosed: gao.annualAggregate.taskOrderCasesClosed,
        filedClosedCohortsTreatedAsIdentical: false,
        closureRate: null,
      },
      meritsComposition: {
        meritDecisions: gao.annualAggregate.meritDecisions,
        sustains: gao.annualAggregate.sustains,
        exactSustainFraction: ratioFixed(gao.annualAggregate.sustains,
          gao.annualAggregate.meritDecisions),
        exactSustainPercent: ratioFixed(gao.annualAggregate.sustains * 100,
          gao.annualAggregate.meritDecisions),
        adapterRecomputedSustainRatePercent:
          gao.annualAggregate.recomputedSustainRatePercent,
        publisherRoundedSustainRatePercent:
          gao.annualAggregate.publisherRoundedSustainRatePercent,
        agreesWithPublisherRoundedWholePercent: ratioFixed(
          gao.annualAggregate.sustains * 100,
          gao.annualAggregate.meritDecisions, 0)
          === String(gao.annualAggregate.publisherRoundedSustainRatePercent),
        denominatorIsMeritDecisionsNotFiledOrClosedCases: true,
        sustainIsJudicialFinalityOrSelfExecutingRelief: false,
      },
      publishedRatesWithUnobservedOperands: {
        publisherEffectivenessRatePercent:
          gao.annualAggregate.publisherEffectivenessRatePercent,
        effectivenessNumerator: null,
        adrCasesUsed: gao.annualAggregate.adrCasesUsed,
        publisherRoundedAdrSuccessRatePercent:
          gao.annualAggregate.publisherRoundedAdrSuccessRatePercent,
        adrSuccessNumerator: null,
        hearings: gao.annualAggregate.hearings,
        publisherRoundedHearingsPercentOfFullyDevelopedCases:
          gao.annualAggregate.publisherRoundedHearingsPercentOfFullyDevelopedCases,
        hearingDenominator: null,
        missingOperandsBackSolvedFromRoundedRates: false,
      },
      timelinessAndCensoring: {
        finalDecisionsOverOneHundredDays:
          gao.annualAggregate.finalDecisionsOverOneHundredDays,
        eligibleDecisionDenominatorPublishedInPinnedAnnualTable: false,
        hundredDayComplianceRate: null, decisionLatencyDistribution: null,
        zeroOverOneHundredDaysMeansZeroCaseDuration: false,
      },
      consequenceAndFinality: {
        agencyNonimplementationInstancesReported:
          gao.annualAggregate.agencyNonimplementationInstancesReported,
        nonimplementationRate: null,
        ...clone(gao.consequenceBoundary),
        counterexampleEstablishesRecommendationCanFailToBecomeImplementation: true,
        counterexampleEstablishesPopulationImplementationRate: false,
      },
      denominatorMissingnessAndSelection: {
        ...clone(gao.denominatorBoundary),
        decisionSampleIncluded: gao.decisionSample.included,
        decisionSampleExclusionReason: gao.decisionSample.reason,
        outcomeLeakageAvoided: gao.decisionSample.outcomeLeakageAvoided,
        publicDecisionRowsImputedForRoutineDismissals: false,
        affectedPartyStandingEstablishedForOutsider: false,
      },
    },
    fdicFailureAndDividend: {
      sourceDomain: "US_BANK_RESOLUTION_AND_RECEIVERSHIP",
      failureCost: { failedOrAssistedRows: facts.fdic.failureRows,
        activeInstitutionExposureObserved: false, failureFrequency: null,
        costMissingRows: facts.fdic.costMissingRows,
        costMissingFraction: ratioFixed(facts.fdic.costMissingRows, facts.fdic.failureRows),
        costToDepositEligibleRows: facts.fdic.costRatioEligibleRows,
        negativeEstimateRows: facts.fdic.costNegativeRows,
        negativeEstimateFractionOfEligible: ratioFixed(facts.fdic.costNegativeRows,
          facts.fdic.costRatioEligibleRows), overOneRows: facts.fdic.costRatioOverOneRows,
        overOneFractionOfEligible: ratioFixed(facts.fdic.costRatioOverOneRows,
          facts.fdic.costRatioEligibleRows), empiricalNearestRank: clone(facts.fdic.costToDeposit),
        estimatedDifCostIsPaymentOrReserve: false },
      dividends: { publishedRows: facts.fdic.dividendRows,
        distinctRows: facts.fdic.distinctDividendRows,
        exactDuplicateExtraRows: facts.fdic.exactDuplicateExtraRows,
        fundPriorityGroups: facts.fdic.dividendGroups,
        groupsWithDownwardCumulativeRevision: facts.fdic.groupsWithDownwardRevision,
        finalEventRows: facts.fdic.finalEventRows,
        finalEventRowsBelow100Percent: facts.fdic.finalEventRowsBelow100,
        below100FractionOfFinalRows: ratioFixed(facts.fdic.finalEventRowsBelow100,
          facts.fdic.finalEventRows), finalDividendPercentNearestRank:
          clone(facts.fdic.finalDividendPercent), closureToPaymentLatencyDaysNearestRank:
          clone(facts.fdic.dividendLatencyDays) },
      censoring: { groupsWithPublishedFinalEvent: facts.fdic.groupsWithFinalEvent,
        groupsWithoutPublishedFinalEvent: groupsWithoutFinal,
        groupsWithoutFinalEventFraction: ratioFixed(groupsWithoutFinal,
          facts.fdic.dividendGroups), groupsWithoutFinalTreatedAsClosed: false,
        finalEventMeansFullRecovery: false, finalEventMeansRealityRestored: false },
    },
    secCapitalReserveAndCustody: {
      sourceDomain: "SELECTED_PUBLIC_PROPERTY_CASUALTY_INSURER_FILING",
      reserveReconciliation: { grossClaimLiabilityUsd: facts.sec.grossClaimLiabilityUsd,
        reinsuranceRecoverableUsd: facts.sec.reinsuranceRecoverableUsd,
        netUnpaidClaimLiabilityUsd: facts.sec.netUnpaidClaimLiabilityUsd,
        reconciliationDifferenceUsd: facts.sec.reconciliationDifferenceUsd,
        grossMinusRecoverableEqualsNet: BigInt(facts.sec.grossClaimLiabilityUsd)
          - BigInt(facts.sec.reinsuranceRecoverableUsd)
          === BigInt(facts.sec.netUnpaidClaimLiabilityUsd),
        recoverableShareOfGross: ratioFixed(facts.sec.reinsuranceRecoverableUsd,
          facts.sec.grossClaimLiabilityUsd), recoverableIsCashCollected: false,
        liabilityIsOutsiderReserve: false },
      capitalScope: { aggregateInsuranceSubsidiarySurplusUsd:
          facts.sec.aggregateInsuranceSubsidiarySurplusUsd,
        principalCompanyAuthorizedControlLevelRbcUsd:
          facts.sec.principalCompanyAuthorizedControlLevelRbcUsd,
        sameEntityScope: facts.sec.exactCapitalFactsSameEntityScope,
        surplusToRbcRatio: null, ratioProhibitedBecauseScopesDiffer: true,
        capitalAvailableToOutsider: false },
      custody: { restrictedRegulatoryDepositUsd: facts.sec.restrictedRegulatoryDepositUsd,
        filingTextDescribesDepositWithRegulatoryAuthoritiesRequiredByLaw:
          facts.sec.filingTextDescribesDepositWithRegulatoryAuthoritiesRequiredByLaw,
        custodianIdentityObserved: facts.sec.custodianIdentityObserved,
        transactionReceiptObserved: facts.sec.transactionReceiptObserved,
        outsiderCustodyEstablished: facts.sec.outsiderCustodyEstablished },
    },
    treasuryCollateralCustody: {
      sourceDomain: "US_PUBLIC_FUNDS_COLLATERAL",
      observedRoleStructure: {
        publicMoneyCollateralRequirementDescribed:
          facts.treasury.publicMoneyCollateralRequirementDescribed,
        federalReserveCustodyForIndividualSuretyAssetsDescribed:
          facts.treasury.federalReserveCustodyForIndividualSuretyAssetsDescribed,
        tcmmAcceptabilityAndValuationRoleDescribed:
          facts.treasury.tcmmAcceptabilityAndValuationRoleDescribed,
        tcmmPossessionRoleDescribed: facts.treasury.tcmmPossessionRoleDescribed,
        depositInsuranceLimitContextDescribed:
          facts.treasury.depositInsuranceLimitContextDescribed,
        rolesSeparatedAcrossDepositoryCustodianProgramAndContractingOfficer:
          facts.treasury.rolesSeparatedAcrossDepositoryCustodianProgramAndContractingOfficer,
      },
      executionBoundary: {
        transactionPopulationObserved: facts.treasury.transactionPopulationObserved,
        pledgedAssetLedgerObserved: facts.treasury.pledgedAssetLedgerObserved,
        custodianAgreementForOutsiderObserved:
          facts.treasury.custodianAgreementForOutsiderObserved,
        paymentRailObserved: facts.treasury.paymentRailObserved,
        outsiderCanTakePossession: facts.treasury.outsiderCanTakePossession,
        outsiderCustodyAuthorityEstablished:
          facts.treasury.outsiderCustodyAuthorityEstablished,
      },
    },
    actuarialPracticeBoundary: {
      sourceDomain: "US_ACTUARIAL_PROFESSIONAL_PRACTICE",
      adoptedStandards: clone(facts.actuarial.standards),
      scope: {
        standardsAreObservedInstitutionalPracticeRequirements:
          facts.actuarial.standardsAreObservedInstitutionalPracticeRequirements,
        standardsAreEmpiricalOutcomeData: facts.actuarial.standardsAreEmpiricalOutcomeData,
        asop23PerformsAuditOfThisArtifact:
          facts.actuarial.asop23PerformsAuditOfThisArtifact,
        asop36IsReserveOpinionForOutsider:
          facts.actuarial.asop36IsReserveOpinionForOutsider,
        asop53ApprovesFinalOutsiderPrice:
          facts.actuarial.asop53ApprovesFinalOutsiderPrice,
        asop55CertifiesOutsiderCapitalAdequacy:
          facts.actuarial.asop55CertifiesOutsiderCapitalAdequacy,
        independentActuaryAssignedToOutsider:
          facts.actuarial.independentActuaryAssignedToOutsider,
        professionalReviewOfExactOutsiderModelCompleted:
          facts.actuarial.professionalReviewOfExactOutsiderModelCompleted,
      },
    },
    cfpbPaymentAllocation: {
      sourceDomain: "CFPB_CIVIL_PENALTY_FUND_AND_BUREAU_REDRESS",
      allocationEvents: facts.remedy.cfpb.allocationEvents,
      initiatedRows: facts.remedy.cfpb.initiatedRows,
      initiatedAllocatedUsdCents: facts.remedy.cfpb.initiatedAllocatedUsdCents,
      initiatedDistributedUsdCents: facts.remedy.cfpb.initiatedDistributedUsdCents,
      initiatedDistributedToAllocatedRatio: ratioFixed(
        facts.remedy.cfpb.initiatedDistributedUsdCents,
        facts.remedy.cfpb.initiatedAllocatedUsdCents),
      initiatedReportedPayments: facts.remedy.cfpb.initiatedReportedPayments,
      concludedRows: facts.remedy.cfpb.concludedRows,
      concludedAllocatedUsdCents: facts.remedy.cfpb.concludedAllocatedUsdCents,
      concludedDistributedUsdCents: facts.remedy.cfpb.concludedDistributedUsdCents,
      concludedDistributedToAllocatedRatio: ratioFixed(
        facts.remedy.cfpb.concludedDistributedUsdCents,
        facts.remedy.cfpb.concludedAllocatedUsdCents),
      concludedReportedPayments: facts.remedy.cfpb.concludedReportedPayments,
      bureauRedressInitiatedRows: facts.remedy.cfpb.bureauRedressInitiatedRows,
      bureauRedressDistributedUsdCents:
        facts.remedy.cfpb.bureauRedressDistributedUsdCents,
      allocationMeansPayment: false, distributedMeansIndividualBankSettlement: false,
      concludedMeansFullRecovery: false, pooledWithFtcOrCpsc: false,
    },
    ftcPaymentRecovery: {
      sourceDomain: "FTC_CLOSED_REFUND_PROGRAMS_2024",
      closedPrograms: facts.remedy.ftc.closedPrograms,
      totalFundUsdCents: facts.remedy.ftc.totalFundUsdCents,
      returnedToConsumersUsdCents: facts.remedy.ftc.returnedToConsumersUsdCents,
      adminCostsUsdCents: facts.remedy.ftc.adminCostsUsdCents,
      leftoverFundsUsdCents: facts.remedy.ftc.leftoverFundsUsdCents,
      fundFlowIdentityVerified: ftcFlowIdentity,
      returnedToConsumersShareOfFund: ratioFixed(
        facts.remedy.ftc.returnedToConsumersUsdCents,
        facts.remedy.ftc.totalFundUsdCents),
      adminCostShareOfFund: ratioFixed(facts.remedy.ftc.adminCostsUsdCents,
        facts.remedy.ftc.totalFundUsdCents),
      leftoverShareOfFund: ratioFixed(facts.remedy.ftc.leftoverFundsUsdCents,
        facts.remedy.ftc.totalFundUsdCents),
      consumersSentPayment: facts.remedy.ftc.consumersSentPayment,
      consumersCashedAtLeastOnePayment: facts.remedy.ftc.consumersCashedAtLeastOnePayment,
      aggregateCashedToSentRatio: ratioFixed(
        facts.remedy.ftc.consumersCashedAtLeastOnePayment,
        facts.remedy.ftc.consumersSentPayment),
      summedProgramConsumerCountsAreUniqueNaturalPersons: false,
      caseCashedPercentNearestRank: { minimum: nearestRank(
        facts.remedy.ftc.caseCashedPercent, 1 / facts.remedy.ftc.caseCashedPercent.length),
      p10: nearestRank(facts.remedy.ftc.caseCashedPercent, 0.1),
      p50: nearestRank(facts.remedy.ftc.caseCashedPercent, 0.5),
      p90: nearestRank(facts.remedy.ftc.caseCashedPercent, 0.9),
      maximum: nearestRank(facts.remedy.ftc.caseCashedPercent, 1) },
      cashedMeansFullCompensation: false, closedMeansEveryAffectedPersonPaid: false,
      pooledWithCfpbOrCpsc: false,
    },
    ncuaAuditedCapitalAndLossBoundary: {
      sourceDomain: "NCUA_NCUSIF_2025_FINANCIAL_STATEMENTS",
      auditedFinancialPosition: {
        accountingPeriodEnd: facts.ncuaPbgcMsha.ncua.accountingPeriodEnd,
        unit: facts.ncuaPbgcMsha.ncua.unit,
        totalAssetsThousandsUsd: facts.ncuaPbgcMsha.ncua.totalAssetsThousandsUsd,
        totalLiabilitiesThousandsUsd: facts.ncuaPbgcMsha.ncua.totalLiabilitiesThousandsUsd,
        netPositionThousandsUsd: facts.ncuaPbgcMsha.ncua.netPositionThousandsUsd,
        assetsMinusLiabilitiesEqualsNetPosition:
          BigInt(facts.ncuaPbgcMsha.ncua.totalAssetsThousandsUsd)
            - BigInt(facts.ncuaPbgcMsha.ncua.totalLiabilitiesThousandsUsd)
            === BigInt(facts.ncuaPbgcMsha.ncua.netPositionThousandsUsd),
        auditOpinion: facts.ncuaPbgcMsha.ncua.auditedOpinion,
        auditScope: facts.ncuaPbgcMsha.ncua.auditedScope,
        auditIsAbsoluteAssurance: false,
      },
      reserveAndLossAccounting: {
        insuranceAndGuaranteeProgramLiabilityThousandsUsd:
          facts.ncuaPbgcMsha.ncua.insuranceProgramLiabilityThousandsUsd,
        provisionForInsuranceLossesThousandsUsd:
          facts.ncuaPbgcMsha.ncua.provisionForInsuranceLossesThousandsUsd,
        liabilityEqualsAnnualProvision: false,
        reserveEqualsPaidClaimLoss: facts.ncuaPbgcMsha.ncua.reserveEqualsPaidClaimLoss,
        transactionLevelClaimsObserved: false,
        individualPaidLossSeverity: null,
      },
      preliminaryComparator: {
        sameAccountingDateAsAuditedStatement:
          facts.ncuaPbgcMsha.ncua.preliminarySameDate,
        admittedAsAuditedInput:
          facts.ncuaPbgcMsha.ncua.preliminaryAdmittedAsAuditedInput,
        preliminaryReserveHeadlineMillionsUsd:
          facts.ncuaPbgcMsha.ncua.preliminaryReserveHeadlineMillionsUsd,
        preliminaryDecemberMonthlyInsuranceLossReductionMillionsUsd:
          facts.ncuaPbgcMsha.ncua.preliminaryDecemberLossReductionMillionsUsd,
        monthlyReductionEqualsAnnualProvision:
          facts.ncuaPbgcMsha.ncua.preliminaryMonthlyReductionEqualsAnnualProvision,
        directUnroundedDifferenceFromAuditedLiabilityComputed: false,
        preliminaryAndAuditedMeasuresPooled: false,
      },
      capitalAndTransferBoundary: {
        auditedFundNetPositionIsOutsiderAvailableCapital: false,
        fundAssetsAreOutsiderCustody:
          facts.ncuaPbgcMsha.ncua.fundAssetsAreOutsiderCustody,
        creditUnionPopulationTransfersToOutsider:
          facts.ncuaPbgcMsha.ncua.populationTransfersToOutsider,
        targetCapitalFactor: null,
      },
    },
    pbgcPaymentAndDenominatorBoundary: {
      sourceDomain: "PBGC_PENSION_INSURANCE_2024_2025",
      availabilityFrame: {
        workbookEdition: facts.ncuaPbgcMsha.pbgc.workbookEdition,
        workbookInstallment: facts.ncuaPbgcMsha.pbgc.workbookInstallment,
        workbookSheetCount: facts.ncuaPbgcMsha.pbgc.workbookSheetCount,
        xlsxPdfCrossRepresentationBindingCount:
          facts.ncuaPbgcMsha.pbgc.crossRepresentationBindingCount,
        form5500PlanYear: facts.ncuaPbgcMsha.pbgc.form5500PlanYear,
        premiumFilingPlanYear: facts.ncuaPbgcMsha.pbgc.premiumFilingPlanYear,
        operationalFiscalYear: facts.ncuaPbgcMsha.pbgc.operationalFiscalYear,
        tableEndYearsAreHeterogeneous:
          facts.ncuaPbgcMsha.pbgc.heterogeneousTableEndYears,
        laterInstallmentsExpected: facts.ncuaPbgcMsha.pbgc.laterInstallmentsExpected,
        firstInstallmentIsCompleteEdition:
          facts.ncuaPbgcMsha.pbgc.firstInstallmentCompleteEdition,
        commonCrossYearDenominatorAdmitted: false,
      },
      directBenefitExperience: {
        directPayees: facts.ncuaPbgcMsha.pbgc.directPayees,
        directBenefitPaymentsMillionsUsd:
          facts.ncuaPbgcMsha.pbgc.directBenefitPaymentsMillionsUsd,
        individualReceiptOrAcceptanceObserved:
          facts.ncuaPbgcMsha.pbgc.financialAssistanceEqualsIndividualBenefitReceipt,
        programAggregateIsIndividualPaidSeverity: false,
      },
      multiemployerProgramSeparation: {
        traditionalAssistancePayees:
          facts.ncuaPbgcMsha.pbgc.traditionalAssistancePayees,
        traditionalFinancialAssistanceMillionsUsd:
          facts.ncuaPbgcMsha.pbgc.traditionalAssistanceMillionsUsd,
        annualReportMorePreciseTraditionalAssistanceMillionsUsd:
          facts.ncuaPbgcMsha.pbgc.traditionalAssistanceMorePreciseMillionsUsd,
        sfaPlanParticipantsNotRetirees:
          facts.ncuaPbgcMsha.pbgc.sfaPlanParticipants,
        specialFinancialAssistanceMillionsUsd:
          facts.ncuaPbgcMsha.pbgc.specialFinancialAssistanceMillionsUsd,
        directBenefitsTraditionalAssistanceAndSfaRemainSeparate:
          facts.ncuaPbgcMsha.pbgc.paymentProgramsRemainSeparate,
        pooledPaymentAmount: null,
        pooledParticipantDenominator: null,
      },
      recoveryBoundary: {
        sfaRetrospectiveDeathAuditRepaymentsMillionsUsd:
          facts.ncuaPbgcMsha.pbgc.sfaDeathAuditRepaymentsMillionsUsd,
        sfaRepaymentIsOrdinaryClaimRecovery:
          facts.ncuaPbgcMsha.pbgc.sfaRepaymentIsOrdinaryClaimRecovery,
        claimsDefinitionIsPaidClaimSeverity:
          facts.ncuaPbgcMsha.pbgc.claimsDefinitionIsPaidClaimSeverity,
        economicHarmRecoveryEstablished: false,
        assetsAreOutsiderCustody: facts.ncuaPbgcMsha.pbgc.assetsAreOutsiderCustody,
        pensionPopulationTransfersToOutsider:
          facts.ncuaPbgcMsha.pbgc.populationTransfersToOutsider,
      },
    },
    mshaOutcomeExposureMismatch: {
      sourceDomain: "MSHA_REPORTED_ACCIDENT_AND_EMPLOYMENT_2000_2026",
      outcomeSnapshot: {
        frozenSnapshotDate: facts.ncuaPbgcMsha.msha.frozenSnapshotDate,
        latestAccidentDate: facts.ncuaPbgcMsha.msha.latestAccidentDate,
        accidentRows: facts.ncuaPbgcMsha.msha.accidentRows,
        uniqueDocumentNumbers: facts.ncuaPbgcMsha.msha.uniqueDocumentNumbers,
        duplicateOrMissingDocumentNumberRows:
          facts.ncuaPbgcMsha.msha.duplicateOrMissingDocumentNumberRows,
        current2026AccidentRows: facts.ncuaPbgcMsha.msha.currentAccidentYearRows,
        latestAccidentQuarter: facts.ncuaPbgcMsha.msha.accidentLatestQuarter,
        zeroReportedInjuryRows: facts.ncuaPbgcMsha.msha.zeroReportedInjuryRows,
        positiveReportedInjuryRows: facts.ncuaPbgcMsha.msha.positiveReportedInjuryRows,
        independentSensorObservation: false,
        causalAdjudication: false,
      },
      exposureSnapshot: {
        mineQuarterlyRows: facts.ncuaPbgcMsha.msha.mineExposureRows,
        mineLatestQuarter: facts.ncuaPbgcMsha.msha.mineLatestQuarter,
        mine2026HoursWorked: facts.ncuaPbgcMsha.msha.mine2026Hours,
        mineZeroHoursRows: facts.ncuaPbgcMsha.msha.mineZeroHoursRows,
        mineInvalidHoursRows: facts.ncuaPbgcMsha.msha.mineInvalidHoursRows,
        contractorQuarterlyRows: facts.ncuaPbgcMsha.msha.contractorExposureRows,
        contractorLatestQuarter: facts.ncuaPbgcMsha.msha.contractorLatestQuarter,
        contractor2026HoursWorked: facts.ncuaPbgcMsha.msha.contractor2026Hours,
        contractorZeroHoursRows: facts.ncuaPbgcMsha.msha.contractorZeroHoursRows,
        contractorInvalidHoursRows: facts.ncuaPbgcMsha.msha.contractorInvalidHoursRows,
        mineAndContractorFramesPooled: false,
      },
      temporalAndDenominatorBoundary: {
        historicalRecordsCanBeRevised:
          facts.ncuaPbgcMsha.msha.historicalRecordsCanBeRevised,
        accidentCurrentQuarterRightCensored:
          facts.ncuaPbgcMsha.msha.accidentCurrentQuarterRightCensored,
        employmentCurrentQuarterAbsent:
          facts.ncuaPbgcMsha.msha.employmentCurrentQuarterAbsent,
        outcomeQuarter: "2026_Q3_RIGHT_CENSORED",
        exposureQuarter: "2026_Q2",
        currentWindowsAligned: false,
        q3OutcomesDividedByQ2Exposure: false,
        derivedCurrentIncidenceRate:
          facts.ncuaPbgcMsha.msha.derivedCurrentIncidenceRate,
        targetRate: null,
      },
    },
    cdiRateFilingStatusAndReconciliation: {
      sourceDomain: "CDI_RATE_FILING_AND_REGISTRY",
      filingStatusChain: {
        stateTrackingNumber: facts.cdiNcigf.cdi.filingStateTrackingNumber,
        serffTrackingNumber: facts.cdiNcigf.cdi.filingSerffTrackingNumber,
        stateStatus: facts.cdiNcigf.cdi.stateStatus,
        dispositionStatus: facts.cdiNcigf.cdi.dispositionStatus,
        dispositionDate: facts.cdiNcigf.cdi.dispositionDate,
        proposedOverallChangePct: facts.cdiNcigf.cdi.proposedOverallChangePct,
        proposedIsApprovedOrChargedPrice:
          facts.cdiNcigf.cdi.proposedIsApprovedOrChargedPrice,
        acceptedMeansApproved: facts.cdiNcigf.cdi.acceptedMeansApproved,
        approvedRateObserved: facts.cdiNcigf.cdi.approvedRateObserved,
        chargedPolicyPriceObserved: facts.cdiNcigf.cdi.chargedPolicyPriceObserved,
        targetPrice: null,
      },
      filedExperienceReconciliation: {
        filedExperienceYears: facts.cdiNcigf.cdi.filedExperienceYears,
        filedEarnedExposures: facts.cdiNcigf.cdi.filedEarnedExposures,
        publishedAdjustedPremiumUsd: facts.cdiNcigf.cdi.filedAdjustedPremiumUsd,
        publishedTrendedLossAndDcceUsd:
          facts.cdiNcigf.cdi.filedTrendedLossAndDcceUsd,
        rowSumTrendedLossAndDcceUsd: (BigInt(
          facts.cdiNcigf.cdi.filedTrendedLossAndDcceUsd)
          + BigInt(facts.cdiNcigf.cdi.publishedLossTotalShortByUsd)).toString(),
        rowSumExposuresExact: facts.cdiNcigf.cdi.rowSumExposuresExact,
        rowSumAdjustedPremiumExact: facts.cdiNcigf.cdi.rowSumAdjustedPremiumExact,
        rowSumTrendedLossAndDcceExact: facts.cdiNcigf.cdi.rowSumTrendedLossExact,
        publishedLossTotalShortByUsd:
          facts.cdiNcigf.cdi.publishedLossTotalShortByUsd,
        discrepancyPreservedAndNotSilentlyCorrected:
          facts.cdiNcigf.cdi.discrepancyPreserved,
        filedCohortIsProspectiveTargetCalibration: false,
      },
      registryBoundary: {
        publishedApprovalOrClosedRows: facts.cdiNcigf.cdi.registryPublishedRows,
        approvedRows: facts.cdiNcigf.cdi.registryApprovedRows,
        closedRows: facts.cdiNcigf.cdi.registryClosedRows,
        pairedRequestedApprovedRows:
          facts.cdiNcigf.cdi.pairedRequestedApprovedRows,
        requestedApprovedDifferentRows:
          facts.cdiNcigf.cdi.requestedApprovedDifferentRows,
        registryRowMeansPolicyOrPrice:
          facts.cdiNcigf.cdi.registryRowMeansPolicyOrPrice,
        approvedRateChangeMeansChargedPrice:
          facts.cdiNcigf.cdi.approvedRateChangeMeansChargedPrice,
        completeSerffCorpusAdmitted:
          facts.cdiNcigf.cdi.completeSerffCorpusAdmitted,
        registryAndFilingPooled: false,
      },
    },
    ncigfAssessmentCapacityBoundary: {
      sourceDomain: "NCIGF_ASSESSMENT_CAPACITY",
      quarterlyCapacity: {
        quarter: facts.cdiNcigf.ncigf.quarter,
        reportingRows: facts.cdiNcigf.ncigf.reportingRows,
        unavailable2025PremiumRows: facts.cdiNcigf.ncigf.unavailable2025PremiumRows,
        unavailable2025PremiumRowFraction: ratioFixed(
          facts.cdiNcigf.ncigf.unavailable2025PremiumRows,
          facts.cdiNcigf.ncigf.reportingRows),
        reportingYearIsPartial: facts.cdiNcigf.ncigf.reportingYearIsPartial,
        netAssessablePremium2024Usd:
          facts.cdiNcigf.ncigf.netAssessablePremium2024Usd,
        maximumAssessmentCapacity2025Usd:
          facts.cdiNcigf.ncigf.maximumAssessmentCapacity2025Usd,
        netAssessablePremium2025ReportedToDateUsd:
          facts.cdiNcigf.ncigf.netAssessablePremium2025ReportedToDateUsd,
        maximumAssessmentCapacity2026ReportedToDateUsd:
          facts.cdiNcigf.ncigf.maximumAssessmentCapacity2026ReportedToDateUsd,
        capacityUnderstatesUnlimitedOrPrefundedFunds:
          facts.cdiNcigf.ncigf.capacityUnderstatesUnlimitedOrPrefundedFunds,
        maximumAssessmentCapacityIsStatutoryCallingCapacityNotCashHeld:
          facts.cdiNcigf.ncigf.capacityIsStatutoryCallingCapacityNotCashHeld,
        capacityIsOutsiderCapital: false,
      },
      assessmentReconciliation: {
        priorYearAssessmentsCalledIn2026Usd:
          facts.cdiNcigf.ncigf.priorYearAssessmentsCalledIn2026Usd,
        authorizedNotCalled2026Usd:
          facts.cdiNcigf.ncigf.authorizedNotCalled2026Usd,
        authorizedAndCalled2026Usd:
          facts.cdiNcigf.ncigf.authorizedAndCalled2026Usd,
        totalAuthorized2026Usd: facts.cdiNcigf.ncigf.totalAuthorized2026Usd,
        authorizationComponentsEqualTotal:
          BigInt(facts.cdiNcigf.ncigf.authorizedNotCalled2026Usd)
            + BigInt(facts.cdiNcigf.ncigf.authorizedAndCalled2026Usd)
            === BigInt(facts.cdiNcigf.ncigf.totalAuthorized2026Usd),
        refundsAuthorized2026Usd: facts.cdiNcigf.ncigf.refundsAuthorized2026Usd,
        netAssessmentsAuthorized2026Usd:
          facts.cdiNcigf.ncigf.netAssessmentsAuthorized2026Usd,
        authorizedMinusRefundsEqualsNet:
          BigInt(facts.cdiNcigf.ncigf.totalAuthorized2026Usd)
            - BigInt(facts.cdiNcigf.ncigf.refundsAuthorized2026Usd)
            === BigInt(facts.cdiNcigf.ncigf.netAssessmentsAuthorized2026Usd),
        totalProjectedAuthorizedAssessments2026Usd:
          facts.cdiNcigf.ncigf.totalProjectedAuthorizedAssessments2026Usd,
        authorizedNotCalledIsNotTransferredCapital:
          facts.cdiNcigf.ncigf.authorizedNotCalledIsNotTransferredCapital,
        calledOrAuthorizedIsNotOutsiderCapitalOrCustody:
          facts.cdiNcigf.ncigf.calledOrAuthorizedIsNotOutsiderCapitalOrCustody,
      },
      publisherQualification: {
        compiledFromThirdPartyData: facts.cdiNcigf.ncigf.compiledFromThirdPartyData,
        independentlyVerifiedByNcigf:
          facts.cdiNcigf.ncigf.independentlyVerifiedByNcigf,
        estimatesMayBePresent: facts.cdiNcigf.ncigf.estimatesMayBePresent,
        accuracyResponsibilityDisclaimed:
          facts.cdiNcigf.ncigf.accuracyResponsibilityDisclaimed,
        workbookStatesSoleAccountingLiabilityPurpose:
          facts.cdiNcigf.ncigf.workbookStatesSoleAccountingLiabilityPurpose,
        fiveYearIndependentAuditObserved:
          facts.cdiNcigf.ncigf.fiveYearIndependentAuditObserved,
        admissionAsIndependentAudit: false,
      },
      historicalBoundary: {
        fiveYearPositiveAccountYearFraction:
          facts.cdiNcigf.ncigf.fiveYearPositiveAccountYearFraction,
        inceptionAssessmentsAuthorizedUsd:
          facts.cdiNcigf.ncigf.inceptionAssessmentsAuthorizedUsd,
        inceptionRefundsAuthorizedUsd:
          facts.cdiNcigf.ncigf.inceptionRefundsAuthorizedUsd,
        inceptionNetAssessmentsUsd:
          facts.cdiNcigf.ncigf.inceptionNetAssessmentsUsd,
        inceptionAuthorizedMinusRefundsEqualsNet:
          decimalToInteger(facts.cdiNcigf.ncigf.inceptionAssessmentsAuthorizedUsd, 3)
            - decimalToInteger(facts.cdiNcigf.ncigf.inceptionRefundsAuthorizedUsd, 3)
            === decimalToInteger(facts.cdiNcigf.ncigf.inceptionNetAssessmentsUsd, 3),
        inceptionNonzeroTupleViewsMatch:
          facts.cdiNcigf.ncigf.inceptionNonzeroTupleViewsMatch,
        missingnessAssumedRandom: facts.cdiNcigf.ncigf.missingnessAssumedRandom,
        tailOrDependenceModelFitted:
          facts.cdiNcigf.ncigf.tailOrDependenceModelFitted,
        fiveYearQuarterlyAndInceptionFramesPooled: false,
      },
    },
    fraCalendarOutcomeExposureRates: {
      sourceDomain: "FRA_FORM54_FORM55_2015_2019",
      queryChainAndSchema: {
        datasetIds: clone(fra.datasetIds),
        canonicalQueryReceiptCount: fra.canonicalQueryReceiptCount,
        allResponseSchemasVerified: fra.allResponseSchemasVerified,
        allResponsePinsBoundToCanonicalQueries:
          fra.allResponsePinsBoundToCanonicalQueries,
        officialAggregateApiResponseBytesReaggregatedLocally:
          fra.officialAggregateApiResponseBytesReaggregatedLocally,
        rawRowPopulationDownloaded: fra.rawRowPopulationDownloaded,
        countAnnualCauseDuplicateAndRateReconciliationsPerformed:
          fra.countAnnualCauseDuplicateAndRateReconciliationsPerformed,
        transportAttested: fra.transportAttested,
        form54RowsUpdatedAt: fra.form54RowsUpdatedAt,
        form54SchemaHash: fra.form54SchemaHash,
        form55RowsUpdatedAt: fra.form55RowsUpdatedAt,
        form55SchemaHash: fra.form55SchemaHash,
        officialUniqueViewCurrentlyExecutableAtFreeze:
          fra.officialUniqueViewCurrentlyExecutableAtFreeze,
        officialUniqueViewMachineStatus:
          fra.officialUniqueViewMachineStatus,
        reportKeySemanticUniquenessObserved:
          fra.reportKeySemanticUniquenessObserved,
      },
      populationThresholdAndCalendarFrame: {
        startYear: fra.startYear, endYear: fra.endYear,
        form54JointCd1Rows: fra.form54JointCd1Rows,
        form54DistinctIncidentKeys: fra.form54DistinctIncidentKeys,
        jointCdOneRowsEqualDistinctIncidentKeys:
          fra.form54JointCd1Rows === fra.form54DistinctIncidentKeys,
        form55PublishedRows: fra.form55PublishedRows,
        form55DeduplicatedMonthlyRailroadRows:
          fra.form55DeduplicatedMonthlyRailroadRows,
        reportableAboveAnnualDamageThresholdOnly:
          fra.reportableAboveAnnualDamageThresholdOnly,
        belowThresholdAccountableAccidentsIncluded:
          fra.belowThresholdAccountableAccidentsIncluded,
        reportedPopulationMeansAllRailroadAccidents: false,
        calendarYearAlignmentNotIncidentToExposureRowLinkage:
          fra.calendarYearAlignmentNotIncidentToExposureRowLinkage,
        calendarYearFrameIsTargetDomainExposure: false,
      },
      annual: fraAnnualDiagnostics,
      pooled: {
        years: fra.pooled.years,
        uniqueReportedIncidents: fra.pooled.uniqueReportedIncidents,
        annualIncidentCountsEqualPooled: sumBigIntField(
          fra.annual, "uniqueReportedIncidents")
          === BigInt(fra.pooled.uniqueReportedIncidents),
        totalReportedDamageDollars: fra.pooled.totalReportedDamageDollars,
        annualDamageEqualsPooled: sumBigIntField(
          fra.annual, "totalReportedDamageDollars")
          === BigInt(fra.pooled.totalReportedDamageDollars),
        officialFatalities: fra.pooled.officialFatalities,
        annualFatalitiesEqualPooled: sumBigIntField(fra.annual, "officialFatalities")
          === BigInt(fra.pooled.officialFatalities),
        officialInjuries: fra.pooled.officialInjuries,
        annualInjuriesEqualPooled: sumBigIntField(fra.annual, "officialInjuries")
          === BigInt(fra.pooled.officialInjuries),
        totalTrainMiles: fra.pooled.totalTrainMiles,
        annualTrainMilesEqualPooled: sumBigIntField(fra.annual, "totalTrainMiles")
          === BigInt(fra.pooled.totalTrainMiles),
        employeeHours: fra.pooled.employeeHours,
        annualEmployeeHoursEqualPooled: sumBigIntField(fra.annual, "employeeHours")
          === BigInt(fra.pooled.employeeHours),
        incidentRatePerMillionTrainMilesFromSourceAdapter:
          fra.pooled.incidentRatePerMillionTrainMiles,
        incidentRatePerMillionTrainMilesRecomputed: fraPooledIncidentRate,
        incidentRateAgreesWithSourceAdapter:
          fraPooledIncidentRate === fra.pooled.incidentRatePerMillionTrainMiles,
        fatalityRatePerMillionTrainMilesRecomputed: ratioFixed(
          BigInt(fra.pooled.officialFatalities) * 1_000_000n,
          fra.pooled.totalTrainMiles, 9),
        injuryRatePerMillionTrainMilesRecomputed: ratioFixed(
          BigInt(fra.pooled.officialInjuries) * 1_000_000n,
          fra.pooled.totalTrainMiles, 9),
        reportedDamageDollarsPerTrainMileFromSourceAdapter:
          fra.pooled.reportedDamageDollarsPerTrainMile,
        reportedDamageDollarsPerTrainMileRecomputed: fraPooledDamageRate,
        reportedDamageRateAgreesWithSourceAdapter:
          fraPooledDamageRate === fra.pooled.reportedDamageDollarsPerTrainMile,
        pooledAcrossOnlyTheExactFiveCalendarYears: true,
        crossLaneRatePoolingPerformed: false,
      },
      revisionDedupAndDependence: {
        byteFrozenAsCaptured: fra.byteFrozenAsCaptured,
        publisherVersionedStaticRelease: fra.publisherVersionedStaticRelease,
        historicalPeriodOutsideStatedFiveYearRoutineEditWindowAtFreeze:
          fra.historicalPeriodOutsideStatedFiveYearRoutineEditWindowAtFreeze,
        retroactiveCorrectionImpossible: fra.retroactiveCorrectionImpossible,
        rebuildMustUseExactPinnedBytes: fra.rebuildMustUseExactPinnedBytes,
        form54RepresentativeRowsSelectedByJointCd1:
          fra.form54RepresentativeRowsSelectedByJointCd1,
        form54IncidentKeyOneToOneVerified:
          fra.form54IncidentKeyOneToOneVerified,
        form55CompositeKey: fra.form55CompositeKey,
        duplicateCompositeKeyGroups: fra.duplicateCompositeKeyGroups,
        identicalMetricProjectionRowsInDuplicateGroup:
          fra.identicalMetricProjectionRowsInDuplicateGroup,
        identicalDuplicateRowsRemoved: fra.identicalDuplicateRowsRemoved,
        deduplicatedRowArithmeticMatchesPublishedMinusRemoved:
          fra.form55PublishedRows - fra.identicalDuplicateRowsRemoved
            === fra.form55DeduplicatedMonthlyRailroadRows,
        operatorIdentifierEmitted: fra.operatorIdentifierEmitted,
        yearsAndOperatorsAssumedIid: false,
        calendarAlignmentMeansRowLinkage: false,
        tailOrDependenceModelFitted: fra.tailOrDependenceModelFitted,
      },
      classificationBoundary: {
        causeTypeAggregateCells: fra.causeTypeAggregateCells,
        reportedCauseFamilyCounts: clone(fra.reportedCauseFamilyCounts),
        reportedCauseFamilyCountsEqualIncidentRows:
          Object.values(fra.reportedCauseFamilyCounts)
            .reduce((sum, value) => sum + value, 0) === fra.form54JointCd1Rows,
        accidentTypeCodeCounts: clone(fra.accidentTypeCodeCounts),
        accidentTypeCountsEqualIncidentRows:
          Object.values(fra.accidentTypeCodeCounts)
            .reduce((sum, value) => sum + value, 0) === fra.form54JointCd1Rows,
        causeCodesAreOperatorReportedRepresentativeRecordClassifications:
          fra.causeCodesAreOperatorReportedRepresentativeRecordClassifications,
        causalEffectsIdentified: fra.causalEffectsIdentified,
        independentCausalAdjudicationObserved:
          fra.independentCausalAdjudicationObserved,
      },
      reportedDamageAndLossBoundary: {
        totalDamageIsReportedAccidentDamageCost:
          fra.totalDamageIsReportedAccidentDamageCost,
        paidLoss: fra.paidLoss, incurredLoss: fra.incurredLoss,
        ultimateLoss: fra.ultimateLoss,
        recoveryOrSalvageObserved: fra.recoveryOrSalvageObserved,
        claimSettlementObserved: fra.claimSettlementObserved,
        inflationOrThresholdNormalizationPerformed:
          fra.inflationOrThresholdNormalizationPerformed,
        addedToSourceDomainLossFragments: false,
        targetSeverityEstimate: null,
      },
      inferenceBoundary: {
        sourceDomainCalendarYearRateDiagnosticsPermitted:
          fra.sourceDomainCalendarYearRateDiagnosticsPermitted,
        targetDomainTransferPermitted: fra.targetDomainTransferPermitted,
        pricingUsePermitted: fra.pricingUsePermitted,
        guaranteeUsePermitted: fra.guaranteeUsePermitted,
        settlementUsePermitted: fra.settlementUsePermitted,
        targetFrequencyEstimate: null, targetPrice: null,
      },
    },
    phmsaCapturedSourceReceiptDeferral: {
      sourceDomain: "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE",
      sourceReceiptOnly: true,
      captureIdentity: {
        zipBytes: facts.fraPhmsa.phmsa.zipBytes,
        zipHash: facts.fraPhmsa.phmsa.zipHash,
        archiveMemberCount: facts.fraPhmsa.phmsa.memberCount,
        schemaPdfBytes: facts.fraPhmsa.phmsa.schemaPdfBytes,
        schemaPdfHash: facts.fraPhmsa.phmsa.schemaPdfHash,
        formRevision: facts.fraPhmsa.phmsa.formRevision,
        dataBytes: facts.fraPhmsa.phmsa.dataBytes,
        dataHash: facts.fraPhmsa.phmsa.dataHash,
        headerColumns: facts.fraPhmsa.phmsa.headerColumns,
        headerHash: facts.fraPhmsa.phmsa.headerHash,
        realCapturedSourceReceiptRecognized:
          facts.fraPhmsa.phmsa.realIncidentSourceReceiptRecognized,
      },
      capturedRowProfileNotOutcomeModel: {
        capturedRows: facts.fraPhmsa.phmsa.reportedRows,
        observedYearCounts: clone(facts.fraPhmsa.phmsa.observedYearCounts),
        reportTypeCounts: clone(facts.fraPhmsa.phmsa.reportTypeCounts),
        capturedRowsAreUniqueIncidents: false,
        capturedRowsAdmittedAsOutcomeFactor: false,
        capturedRowsAdmittedAsModelInput: false,
      },
      revisionAndPopulationMissingness: {
        originalAndSupplementalStatusPreserved:
          facts.fraPhmsa.phmsa.originalAndSupplementalStatusPreserved,
        endpointIsMutablePresentFile:
          facts.fraPhmsa.phmsa.endpointIsMutablePresentFile,
        publisherVersionIdPinned:
          facts.fraPhmsa.phmsa.publisherVersionIdPinned,
        byteFrozenAsCaptured: facts.fraPhmsa.phmsa.byteFrozenAsCaptured,
        latestPopulationCompletenessEstablished:
          facts.fraPhmsa.phmsa.latestPopulationCompletenessEstablished,
        stableIncidentIdentityAndDeduplicationEstablished: false,
        originalAndSupplementalRowsAssumedIid: false,
      },
      denominatorAndRightsBoundary: {
        matchingAnnualReportZipCaptured:
          facts.fraPhmsa.phmsa.matchingAnnualReportZipCaptured,
        mileageExposureCaptured:
          facts.fraPhmsa.phmsa.mileageExposureCaptured,
        incidentToExposureLinkEstablished:
          facts.fraPhmsa.phmsa.incidentToExposureLinkEstablished,
        officialPublicDownloadObserved:
          facts.fraPhmsa.phmsa.officialPublicDownloadObserved,
        publicDomainOrReuseLicenseBytePinned:
          facts.fraPhmsa.phmsa.publicDomainOrReuseLicenseBytePinned,
        redistributionUseConcluded:
          facts.fraPhmsa.phmsa.redistributionUseConcluded,
        modelTrainingUseConcluded:
          facts.fraPhmsa.phmsa.modelTrainingUseConcluded,
      },
      zeroAdmissionBoundary: {
        machineStatus: facts.fraPhmsa.phmsa.machineStatus,
        typedFactorDefinitions: 0,
        outcomeOrActuarialModelInputAdmitted:
          facts.fraPhmsa.phmsa.outcomeOrActuarialModelInputAdmitted,
        frequencyOrSeverityRateCalculated:
          facts.fraPhmsa.phmsa.frequencyOrSeverityRateCalculated,
        frequencyEstimate: null, severityEstimate: null,
        sourceDomainLossFragmentAdmitted: false,
        crossLaneFraExposureBorrowed: false,
        targetDomainTransferEstablished: false,
        trainingAdmission: false, pricingAdmission: false, targetPrice: null,
      },
    },
    nhtsaRecallRemedyStatusReference: {
      sourceDomain: "NHTSA_RECALL_REMEDY_2026_08_21",
      sourceIdentity: {
        sourceId: nhtsa.sourceId, frozenAt: nhtsa.frozenAt,
        sourceSetHash: nhtsa.sourceSetHash,
        acquisitionManifestHash: nhtsa.acquisitionManifestHash,
        exactOfficialPublicBytesReplayed: nhtsa.rights.exactPublicBytesReplayed,
        officialPublicDownloadObserved: nhtsa.rights.officialPublicDownloadObserved,
      },
      campaignIdentityAndDedup: {
        sourceUnit: nhtsa.recallPopulation.sourceUnit,
        sourceRows: nhtsa.recallPopulation.rows,
        expectedColumns: nhtsa.recallPopulation.expectedColumns,
        observedWidthRows: nhtsa.recallPopulation.observedWidthRows,
        blankLines: nhtsa.recallPopulation.blankLines,
        schemaMismatchRows: nhtsa.recallPopulation.schemaMismatchRows,
        uniqueRecordIds: nhtsa.recallPopulation.uniqueRecordIds,
        duplicateRecordIds: nhtsa.recallPopulation.duplicateRecordIds,
        invalidRecordIds: nhtsa.recallPopulation.invalidRecordIds,
        sourceRowsEqualUniqueRecordIds:
          nhtsa.recallPopulation.rows === nhtsa.recallPopulation.uniqueRecordIds,
        uniqueCampaigns: nhtsa.recallPopulation.uniqueCampaigns,
        invalidCampaignIds: nhtsa.recallPopulation.invalidCampaignIds,
        productRowsDeduplicatedToCampaignIdentities: true,
        sourceRowCountTreatedAsCampaignCount: false,
        campaignCountTreatedAsUniqueVehicleCount: false,
        officialNamedPost2010SliceNotAllHistoricalCampaigns:
          nhtsa.qualityAndMissingness.officialNamedPost2010SliceNotAllHistoricalCampaigns,
        receivedDateRange: { minimum: nhtsa.recallPopulation.receivedDateMinimum,
          maximum: nhtsa.recallPopulation.receivedDateMaximum },
        recordCreationDateRange: {
          minimum: nhtsa.recallPopulation.recordCreationDateMinimum,
          maximum: nhtsa.recallPopulation.recordCreationDateMaximum,
        },
        singlePopulationCampaigns:
          nhtsa.recallPopulation.singlePopulationCampaigns,
        conflictingPopulationCampaigns:
          nhtsa.recallPopulation.conflictingPopulationCampaigns,
        missingPopulationCampaigns:
          nhtsa.recallPopulation.missingPopulationCampaigns,
        zeroPopulationCampaigns: nhtsa.recallPopulation.zeroPopulationCampaigns,
        totalPotentialAffectedSummedOncePerCampaign:
          nhtsa.recallPopulation.totalPotentialAffectedAcrossSinglePopulationCampaigns,
        populationSummedOncePerCampaign:
          nhtsa.recallPopulation.summedOncePerCampaign,
        actualExposureOrUniqueVehiclesOnRoadEstablished:
          nhtsa.recallPopulation.actualExposureOrUniqueVehiclesOnRoadEstablished,
        entryHash: nhtsa.recallPopulation.entryHash,
      },
      latestQuarterlyStatusComposition:
        nhtsaStatusComposition(nhtsa.quarterlyStatus),
      latestAnnualStatusComposition:
        nhtsaStatusComposition(nhtsa.annualStatus),
      rightCensoringAndRevision: {
        current2026PeriodIncompleteAtFreeze:
          nhtsa.qualityAndMissingness.current2026PeriodIncompleteAtFreeze,
        rightCensoredAt: nhtsa.frozenAt,
        quarterlyRowsAreRepeatedCumulativeStatusNotIndependentExposures:
          nhtsa.qualityAndMissingness
            .quarterlyRowsAreRepeatedCumulativeStatusNotIndependentExposures,
        annualRowsHavePublisherEligibilitySelection:
          nhtsa.qualityAndMissingness.annualRowsHavePublisherEligibilitySelection,
        manufacturerStatusRowsAreNotIndependentRepairAudits:
          nhtsa.qualityAndMissingness.manufacturerStatusRowsAreNotIndependentRepairAudits,
        completionStatusesMayBeRevisedAfterFreeze:
          nhtsa.qualityAndMissingness.completionStatusesMayBeRevisedAfterFreeze,
        latestObservedIsNotGuaranteedLatestPublisherTruthAfterFreeze:
          nhtsa.qualityAndMissingness
            .latestObservedIsNotGuaranteedLatestPublisherTruthAfterFreeze,
        latestSelectedStatusMeansFinalClosure: false,
        censoredCampaignsTreatedAsComplete: false,
      },
      populationReconciliation: {
        post2010RecallCampaigns: nhtsa.lifecycleLinkage.post2010RecallCampaigns,
        withQuarterlyStatus: nhtsa.lifecycleLinkage.withQuarterlyStatus,
        withAnnualStatus: nhtsa.lifecycleLinkage.withAnnualStatus,
        withBothQuarterlyAndAnnualStatus:
          nhtsa.lifecycleLinkage.withBothQuarterlyAndAnnualStatus,
        linkKey: nhtsa.lifecycleLinkage.linkKey,
        quarterly: clone(
          nhtsa.lifecycleLinkage.quarterlyPopulationReconciliation),
        quarterlySelectedEqualsLinkedPlusOutside:
          nhtsa.lifecycleLinkage.quarterlyPopulationReconciliation
            .selectedStatusCampaigns
          === nhtsa.lifecycleLinkage.quarterlyPopulationReconciliation
            .statusCampaignsWithRecallPopulation
            + nhtsa.lifecycleLinkage.quarterlyPopulationReconciliation
              .statusCampaignsOutsideCapturedRecallPopulation,
        quarterlyLinkedEqualsExactPlusTwoMismatchDirections:
          nhtsa.lifecycleLinkage.quarterlyPopulationReconciliation
            .statusCampaignsWithRecallPopulation
          === nhtsa.lifecycleLinkage.quarterlyPopulationReconciliation.exactMatches
            + nhtsa.lifecycleLinkage.quarterlyPopulationReconciliation
              .statusInvolvedGreater
            + nhtsa.lifecycleLinkage.quarterlyPopulationReconciliation
              .recallPotentialAffectedGreater,
        annual: clone(nhtsa.lifecycleLinkage.annualPopulationReconciliation),
        annualSelectedEqualsLinkedPlusOutside:
          nhtsa.lifecycleLinkage.annualPopulationReconciliation.selectedStatusCampaigns
          === nhtsa.lifecycleLinkage.annualPopulationReconciliation
            .statusCampaignsWithRecallPopulation
            + nhtsa.lifecycleLinkage.annualPopulationReconciliation
              .statusCampaignsOutsideCapturedRecallPopulation,
        annualLinkedEqualsExactPlusTwoMismatchDirections:
          nhtsa.lifecycleLinkage.annualPopulationReconciliation
            .statusCampaignsWithRecallPopulation
          === nhtsa.lifecycleLinkage.annualPopulationReconciliation.exactMatches
            + nhtsa.lifecycleLinkage.annualPopulationReconciliation.statusInvolvedGreater
            + nhtsa.lifecycleLinkage.annualPopulationReconciliation
              .recallPotentialAffectedGreater,
        reconciliationDifferenceRetainedNotAdjusted: true,
        campaignPopulationMayDifferFromStatusInvolvedPopulation:
          nhtsa.qualityAndMissingness
            .campaignPopulationMayDifferFromStatusInvolvedPopulation,
        campaignPotentialAffectedCrossCampaignVehicleOverlapUnresolved:
          nhtsa.qualityAndMissingness
            .campaignPotentialAffectedCrossCampaignVehicleOverlapUnresolved,
        noVehicleInServiceExposureDenominator:
          nhtsa.qualityAndMissingness.noVehicleInServiceExposureDenominator,
        quarterlyAndAnnualRatiosComparedAsCommonCohort: false,
        crossCampaignAffectedPopulationUsedAsUniqueVehicleExposure: false,
        targetOrCrossLaneExposureDenominatorBorrowed: false,
      },
      malformedPeriodAndComponentAnomalies: {
        quarterly: clone(nhtsa.quarterlyStatus.anomalies),
        annual: clone(nhtsa.annualStatus.anomalies),
        knownSourceAnomaliesMachineDeferredNotNormalized:
          nhtsa.qualityAndMissingness
            .knownSourceAnomaliesMachineDeferredNotNormalized,
        malformedRowsBackfilledWithEarlierValidRows: false,
        malformedRowsTreatedAsCompleteRepairEvidence: false,
        malformedRowsTreatedAsLossEvidence: false,
      },
      realityReceiptRepairLossAndEnforcementBoundary: {
        recallCampaignIsRealInstitutionalRecord:
          nhtsa.ontology.recallCampaignIsRealInstitutionalRecord,
        manufacturerStatusReportIsRealInstitutionalRecord:
          nhtsa.ontology.manufacturerStatusReportIsRealInstitutionalRecord,
        officialRecordAutomaticallyEqualsUnderlyingWorldTruth:
          nhtsa.ontology.officialRecordAutomaticallyEqualsUnderlyingWorldTruth,
        recallEstablishesIndependentCausality:
          nhtsa.ontology.recallEstablishesIndependentCausality,
        statusRowEstablishesAffectedPartyReceipt:
          nhtsa.ontology.statusRowEstablishesAffectedPartyReceipt,
        remediedCountEstablishesIndividuallyVerifiedCompleteRepair:
          nhtsa.ontology.remediedCountEstablishesIndividuallyVerifiedCompleteRepair,
        affectedPopulationEstablishesCurrentExposure:
          nhtsa.ontology.affectedPopulationEstablishesCurrentExposure,
        statusCountsEstablishPaidIncurredOrUltimateLoss:
          nhtsa.ontology.statusCountsEstablishPaidIncurredOrUltimateLoss,
        recallManagementRecordIsEnforcementOrder:
          nhtsa.ontology.recallManagementRecordIsEnforcementOrder,
        campaignsWithCorrectiveActionText:
          nhtsa.recallPopulation.campaignsWithCorrectiveActionText,
        correctiveActionTextEstablishesRepairCompleted:
          nhtsa.recallPopulation.correctiveActionTextEstablishesRepairCompleted,
        ownerNotificationDateEstablishesConsumerReceipt:
          nhtsa.recallPopulation.ownerNotificationDateEstablishesConsumerReceipt,
        linkageIsPublisherRecordAssociationNotCausalOrConsumerReceiptProof:
          nhtsa.lifecycleLinkage
            .linkageIsPublisherRecordAssociationNotCausalOrConsumerReceiptProof,
        completeRepairChainEstablished:
          nhtsa.lifecycleLinkage.completeRepairChainEstablished,
        paymentRecoveryReopeningClosureChainEstablished:
          nhtsa.lifecycleLinkage.paymentRecoveryReopeningClosureChainEstablished,
        enforcementActionOrConsentOrderBodiesCaptured:
          nhtsa.qualityAndMissingness.enforcementActionOrConsentOrderBodiesCaptured,
        sourceDomainLossFragmentAdmitted: false,
      },
      rightsAndInferenceBoundary: {
        rawRedistributionRightConcluded:
          nhtsa.rights.rawRedistributionRightConcluded,
        commercialUseRightConcluded: nhtsa.rights.commercialUseRightConcluded,
        modelTrainingRightConcluded: nhtsa.rights.modelTrainingRightConcluded,
        legalConclusionMade: nhtsa.rights.legalConclusionMade,
        trainingAdmitted: nhtsa.trainingAdmitted,
        targetTransferAdmitted: nhtsa.targetTransferAdmitted,
        priceInputAdmitted: nhtsa.priceInputAdmitted,
        actuarialLossCalibration: nhtsa.actuarialLossCalibration,
        productionReadiness: nhtsa.productionReadiness,
        targetPredictorAdmitted: false, frequencyEstimate: null,
        severityEstimate: null, lossEstimate: null, targetPrice: null,
        operationalAuthorityGranted: false,
      },
    },
    bridgeDataV2TrainingCandidateQuality: {
      sourceDomain: "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORIES",
      realityAndSampleAccounting: {
        sourceId: facts.bridgeDataV2.sourceId,
        exactPublisherRobotTrajectoryRecordObserved: true,
        realPublishedRobotExperienceReferenceObserved: true,
        independentExperimentalTruthEstablished: false,
        underlyingWorldTruthEstablished: false,
        projectClaimedTrajectories: facts.bridgeDataV2.projectClaimedTrajectories,
        tfdsTotalExamples: facts.bridgeDataV2.tfdsTotalExamples,
        projectMinusTfdsExamples: facts.bridgeDataV2.projectMinusTfdsExamples,
        tfdsCountDifferenceResolved: facts.bridgeDataV2.tfdsCountDifferenceResolved,
        trainExamples: facts.bridgeDataV2.trainExamples,
        trainShards: facts.bridgeDataV2.trainShards,
        validationExamples: facts.bridgeDataV2.validationExamples,
        validationShards: facts.bridgeDataV2.validationShards,
        capturedWholeRecords: facts.bridgeDataV2.capturedWholeRecords,
        capturedWholeTrainShards: facts.bridgeDataV2.capturedWholeTrainShards,
        capturedValidationRecords: facts.bridgeDataV2.capturedValidationRecords,
        knownRecordsInParentShard: facts.bridgeDataV2.knownRecordsInParentShard,
        capturedRecordFractionOfParentShard: ratioFixed(
          facts.bridgeDataV2.capturedWholeRecords,
          facts.bridgeDataV2.knownRecordsInParentShard, 12),
        capturedRecordFractionOfTrainSplit: ratioFixed(
          facts.bridgeDataV2.capturedWholeRecords,
          facts.bridgeDataV2.trainExamples, 12),
        fullCorpusOrCompleteShardCaptured: false,
        sampleRandomOrRepresentative:
          facts.bridgeDataV2.sampleSelectionRandomOrRepresentativeEstablished,
      },
      structuralAndSemanticBoundary: {
        sampleTimesteps: facts.bridgeDataV2.sampleTimesteps,
        sampleFeatureKeysExactlyMatchTfdsSchema:
          facts.bridgeDataV2.sampleFeatureKeysExactlyMatchTfdsSchema,
        actualRecordBytesCrcValidated:
          facts.bridgeDataV2.actualRecordBytesCrcValidated,
        fullCorpusSchemaConformanceEstablished:
          facts.bridgeDataV2.fullCorpusSchemaConformanceEstablished,
        fullSchemaAndSemanticContractEstablished:
          facts.bridgeDataV2.fullSchemaAndSemanticContractEstablished,
        actionShapeDescriptionMismatch:
          facts.bridgeDataV2.actionShapeDescriptionMismatch,
        stateShapeDescriptionMismatch:
          facts.bridgeDataV2.stateShapeDescriptionMismatch,
        perRecordOutcomeOrFailureLabelPresent:
          facts.bridgeDataV2.perRecordOutcomeOrFailureLabelPresent,
        trajectoryCorrelationClustersMaterialized:
          facts.bridgeDataV2.trajectoryCorrelationClustersMaterialized,
        trainValidationSplitTemporalOrProspectiveEstablished:
          facts.bridgeDataV2.trainValidationSplitTemporalOrProspectiveEstablished,
      },
      rightsAndTrainerAdmission: {
        license: facts.bridgeDataV2.license,
        licenseStatementBytePinned: facts.bridgeDataV2.licenseStatementBytePinned,
        legalReviewCompleted: facts.bridgeDataV2.legalReviewCompleted,
        recordLevelThirdPartyContentReviewCompleted:
          facts.bridgeDataV2.recordLevelThirdPartyContentReviewCompleted,
        productionTrainingRightFinallyAdjudicated:
          facts.bridgeDataV2.productionTrainingRightFinallyAdjudicated,
        decision: facts.bridgeDataV2.candidateDecision,
        candidateWholeRecords: facts.bridgeDataV2.candidateWholeRecords,
        trainerRowsEnqueued: facts.bridgeDataV2.trainerRowsEnqueued,
        automaticTraining: facts.bridgeDataV2.automaticTraining,
        requiredBeforeTrainerAdmission:
          clone(facts.bridgeDataV2.requiredBeforeTrainerAdmission),
        statisticalModelCapabilityImprovementEstablished:
          facts.bridgeDataV2.statisticalModelCapabilityImprovementEstablished,
        targetRobotTransferEstablished:
          facts.bridgeDataV2.targetRobotTransferEstablished,
        targetDomainFactorAdmission: facts.bridgeDataV2.targetDomainFactorAdmission,
        frequencyEligible: facts.bridgeDataV2.frequencyEligible,
        severityEligible: facts.bridgeDataV2.severityEligible,
        lossEligible: facts.bridgeDataV2.lossEligible,
        prospectiveHoldoutEligible: facts.bridgeDataV2.prospectiveHoldoutEligible,
        trainingAuthority: facts.bridgeDataV2.trainingAuthority,
        priceAuthority: facts.bridgeDataV2.priceAuthority,
        targetPrice: null,
      },
      factorUseBoundary: {
        typedQualityFactorDefinitions: 2,
        factorKind: "NON_MODEL_TRAINING_CANDIDATE_QUALITY_ONLY",
        behaviorModelRowsAdded: 0,
        outcomeModelRowsAdded: 0,
        sourceDomainOutcomeRateProduced: false,
        targetTransferOrPoolingPerformed: false,
      },
    },
    waymoPublishedOutcomeExposureReference: {
      sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
      releaseAndExposure: {
        sourceId: facts.waymoSafetyImpact.sourceId,
        publisherReleaseDate: facts.waymoSafetyImpact.publisherReleaseDate,
        csv1ToCsv3DataThrough: facts.waymoSafetyImpact.csv1ToCsv3DataThrough,
        csv4DataThrough: facts.waymoSafetyImpact.csv4DataThrough,
        livingDatasetSubjectToRevision:
          facts.waymoSafetyImpact.livingDatasetSubjectToRevision,
        displayedRoundedRiderOnlyMiles:
          facts.waymoSafetyImpact.displayedRoundedRiderOnlyMiles,
        displayedExposureIsExactUnroundedMiles:
          facts.waymoSafetyImpact.displayedExposureIsExactUnroundedMiles,
        displayedLeafPointTotalReconciled:
          facts.waymoSafetyImpact.displayedLeafPointTotalReconciled,
        overlappingCompositeRowsNotDoubleCounted:
          facts.waymoSafetyImpact.overlappingCompositeRowsNotDoubleCounted,
        publisherMeasuredMilesIndependentlyAudited:
          facts.waymoSafetyImpact.publisherMeasuredMilesIndependentlyAudited,
        exactUnroundedExposure: null,
      },
      sgoMembershipAndDuplicateBoundary: {
        publisherRows: facts.waymoSafetyImpact.outcomeRows,
        sgoLinkedRows: facts.waymoSafetyImpact.sgoLinkedRows,
        uniqueSgoReportIds: facts.waymoSafetyImpact.uniqueSgoReportIds,
        duplicateSgoIdVersionPairs:
          facts.waymoSafetyImpact.duplicateSgoIdVersionPairs,
        duplicatePairRows: facts.waymoSafetyImpact.duplicatePairRows,
        duplicatePairExtraRows: facts.waymoSafetyImpact.duplicatePairExtraRows,
        duplicatePairsWithOutcomeFlagConflicts:
          facts.waymoSafetyImpact.duplicatePairsWithOutcomeFlagConflicts,
        duplicatePairsWithSuppressedLocationTextConflicts:
          facts.waymoSafetyImpact
            .duplicatePairsWithSuppressedLocationTextConflicts,
        duplicatePairsCountedAsIndependentCrashUnits:
          facts.waymoSafetyImpact.duplicatePairsCountedAsIndependentCrashUnits,
        duplicatePairsAutomaticallyDeduplicatedOrAdjudicated:
          facts.waymoSafetyImpact
            .duplicatePairsAutomaticallyDeduplicatedOrAdjudicated,
        rowMembershipOutcomeTrueCounts:
          clone(facts.waymoSafetyImpact.rowMembershipOutcomeTrueCounts),
        rowMembershipOutcomeUnknownCounts:
          clone(facts.waymoSafetyImpact.rowMembershipOutcomeUnknownCounts),
        independentCrashOutcomeCountsAfterDuplicateResolution:
          facts.waymoSafetyImpact.independentCrashOutcomeCountsAfterDuplicateResolution,
        rowMembershipCountsTreatedAsIndependentCrashCounts: false,
        naiveRowCountDividedByDisplayedMilesRate: null,
      },
      publishedBenchmarkFactorProfile: {
        benchmarkRows: facts.waymoSafetyImpact.benchmarkRows,
        allLocationPublishedFactorRows:
          facts.waymoSafetyImpact.allLocationPublishedFactorRows,
        allLocationPublishedFactorProfileHash:
          facts.waymoSafetyImpact.allLocationPublishedFactorProfileHash,
        publishedRateRatioMinimum:
          facts.waymoSafetyImpact.allLocationPublishedRateRatioMinimum,
        publishedRateRatioMaximum:
          facts.waymoSafetyImpact.allLocationPublishedRateRatioMaximum,
        literalNonfiniteTokens: facts.waymoSafetyImpact.literalNonfiniteTokens,
        waymoCiOrderViolations: facts.waymoSafetyImpact.waymoCiOrderViolations,
        benchmarkCiOrderViolations:
          facts.waymoSafetyImpact.benchmarkCiOrderViolations,
        naiveCountOverCsv1MilesDifferenceRows:
          facts.waymoSafetyImpact.naiveCountOverCsv1MilesDifferenceRows,
        nonfiniteTokensZeroFilled: false,
        publisherFactorsIndependentlyRecomputedByThisMathLayer: false,
        publisherFactorsTreatedAsOutsiderCalibration: false,
      },
      dynamicBenchmarkConflictAndWindowBoundary: {
        rows: facts.waymoSafetyImpact.dynamicRows,
        distinctCells: facts.waymoSafetyImpact.dynamicDistinctCells,
        distinctCompositeKeys:
          facts.waymoSafetyImpact.dynamicDistinctCompositeKeys,
        duplicateCompositeKeys:
          facts.waymoSafetyImpact.dynamicDuplicateCompositeKeys,
        duplicateRows: facts.waymoSafetyImpact.dynamicDuplicateRows,
        benchmarkCrashCountConflictKeys:
          facts.waymoSafetyImpact.dynamicBenchmarkCrashCountConflictKeys,
        duplicateRowsRetainedWithoutDeduplication:
          facts.waymoSafetyImpact.dynamicDuplicateRowsRetainedWithoutDeduplication,
        benchmarkCrashCountsAggregatedAcrossDuplicateKeys:
          facts.waymoSafetyImpact
            .dynamicBenchmarkCrashCountsAggregatedAcrossDuplicateKeys,
        alignedWithCsv1ToCsv3Through202603:
          facts.waymoSafetyImpact.dynamicAlignedWithCsv1ToCsv3Through202603,
        crossWindowPoolingPerformed: false,
      },
      temporalSplitBoundary: {
        ...clone(facts.waymoSafetyImpact.temporalSplit),
        temporalHoldoutIsRetrospectiveNotProspective:
          facts.waymoSafetyImpact.temporalHoldoutIsRetrospectiveNotProspective,
        treatedAsProspectivePreregisteredHoldout: false,
        treatedAsExternalTargetHoldout: false,
      },
      independentReviewLossAndTransferBoundary: {
        matchedNhtsaSgoReportsIndependentlyReplayed:
          facts.waymoSafetyImpact.matchedNhtsaSgoReportsIndependentlyReplayed,
        independentCrashFactAdjudicationEstablished:
          facts.waymoSafetyImpact.independentCrashFactAdjudicationEstablished,
        faultOrCausalityEstablished:
          facts.waymoSafetyImpact.faultOrCausalityEstablished,
        economicLossObserved: facts.waymoSafetyImpact.economicLossObserved,
        affectedPartyReceiptOrRecoveryObserved:
          facts.waymoSafetyImpact.affectedPartyReceiptOrRecoveryObserved,
        crossManufacturerComparabilityEstablished:
          facts.waymoSafetyImpact.crossManufacturerComparabilityEstablished,
        calibrationDecision: facts.waymoSafetyImpact.calibrationDecision,
        targetTransfer: facts.waymoSafetyImpact.targetTransfer,
        actualOutsiderModelCalibrated:
          facts.waymoSafetyImpact.actualOutsiderModelCalibrated,
        statisticalCapabilityImprovementEstablished:
          facts.waymoSafetyImpact.statisticalCapabilityImprovementEstablished,
        trainingCandidateDecision: facts.waymoSafetyImpact.candidateDecision,
        candidateRows: facts.waymoSafetyImpact.candidateRows,
        trainerRowsEnqueued: facts.waymoSafetyImpact.trainerRowsEnqueued,
        automaticTraining: facts.waymoSafetyImpact.automaticTraining,
        frequencyModelEligible: facts.waymoSafetyImpact.frequencyModelEligible,
        severityModelEligible: facts.waymoSafetyImpact.severityModelEligible,
        targetHoldoutEligible: facts.waymoSafetyImpact.targetHoldoutEligible,
        trainingAuthority: facts.waymoSafetyImpact.trainingAuthority,
        priceAuthority: facts.waymoSafetyImpact.priceAuthority,
        sourceDomainFrequencyEstimateProducedByOutsider: null,
        sourceDomainSeverityEstimate: null,
        targetLossEstimate: null,
        targetPrice: null,
      },
    },
    clinicalTrialsPostedResults: {
      sourceDomain: "CLINICALTRIALS_GOV_POSTED_RESULTS_2026_07_01",
      sourceId: facts.clinicalTrials.sourceId,
      apiVersion: facts.clinicalTrials.apiVersion,
      dataTimestamp: facts.clinicalTrials.dataTimestamp,
      sourceSetHash: facts.clinicalTrials.sourceSetHash,
      frozenQueryPopulation: {
        expectedTotalCount: facts.clinicalTrials.expectedTotalCount,
        observedStudyRecords: facts.clinicalTrials.observedStudyRecords,
        uniqueNctIds: facts.clinicalTrials.uniqueNctIds,
        completeClosedQueryWindow: facts.clinicalTrials.completeClosedQueryWindow,
        allHavePostedResultsFlag: facts.clinicalTrials.allHavePostedResultsFlag,
      },
      postedAggregateRows: {
        studiesWithPostedOutcomeMeasures:
          facts.clinicalTrials.studiesWithPostedOutcomeMeasures,
        studiesWithPostedAdverseEvents:
          facts.clinicalTrials.studiesWithPostedAdverseEvents,
        totalPostedOutcomeMeasureRows:
          facts.clinicalTrials.totalPostedOutcomeMeasureRows,
        totalPostedSeriousAdverseEventTermRows:
          facts.clinicalTrials.totalPostedSeriousAdverseEventTermRows,
        totalPostedOtherAdverseEventTermRows:
          facts.clinicalTrials.totalPostedOtherAdverseEventTermRows,
      },
      nonPoolingAndInferenceBoundary: {
        crossStudyAffectedCountsPooled:
          facts.clinicalTrials.crossStudyAffectedCountsPooled,
        crossStudyRatesCalculated: facts.clinicalTrials.crossStudyRatesCalculated,
        sponsorOrInvestigatorIsResponsibleForSubmittedAccuracy:
          facts.clinicalTrials.sponsorOrInvestigatorIsResponsibleForSubmittedAccuracy,
        nlmQcEstablishesScientificAccuracy:
          facts.clinicalTrials.nlmQcEstablishesScientificAccuracy,
        resultRecordsMayBeUpdatedAfterInitialPosting:
          facts.clinicalTrials.resultRecordsMayBeUpdatedAfterInitialPosting,
        sponsorNamesPersistedInDerivedArtifact:
          facts.clinicalTrials.sponsorNamesPersistedInDerivedArtifact,
        personNamesPersistedInDerivedArtifact:
          facts.clinicalTrials.personNamesPersistedInDerivedArtifact,
        rightsTermsSourceReplayed: facts.clinicalTrials.rightsTermsSourceReplayed,
        rightsDetermination: facts.clinicalTrials.rightsDetermination,
        independentAdjudicationEstablished:
          facts.clinicalTrials.independentAdjudicationEstablished,
        causalEffectEstablished: facts.clinicalTrials.causalEffectEstablished,
        targetDomainTransferEstablished:
          facts.clinicalTrials.targetDomainTransferEstablished,
        automaticBehaviorModelTrainingRightConcluded:
          facts.clinicalTrials.automaticBehaviorModelTrainingRightConcluded,
        admittedTrainingRows: facts.clinicalTrials.admittedTrainingRows,
        automaticTraining: facts.clinicalTrials.automaticTraining,
        trainingAuthority: facts.clinicalTrials.trainingAuthority,
        priceAuthority: facts.clinicalTrials.priceAuthority,
        sourceDomainCrossStudyEstimate: null,
        targetLossEstimate: null,
        targetPrice: null,
      },
    },
    cpscRemedyMissingness: {
      sourceDomain: "CPSC_RECALL_MPR",
      mprRows: facts.remedy.cpsc.mprRows,
      recallApiRows: facts.remedy.cpsc.recallApiRows,
      canonicalPublisherUrlRows: facts.remedy.cpsc.canonicalUrlRows,
      canonicalUrlFraction: ratioFixed(facts.remedy.cpsc.canonicalUrlRows,
        facts.remedy.cpsc.recallApiRows),
      completeCorrectionComponentRows: facts.remedy.cpsc.completeCorrectionComponentRows,
      completeCorrectionComponentFraction: ratioFixed(
        facts.remedy.cpsc.completeCorrectionComponentRows, facts.remedy.cpsc.mprRows),
      missingCoreFieldRows: facts.remedy.cpsc.missingCoreFieldRows,
      missingCoreFieldFraction: ratioFixed(facts.remedy.cpsc.missingCoreFieldRows,
        facts.remedy.cpsc.mprRows),
      arithmeticAgreementRows: facts.remedy.cpsc.arithmeticAgreementRows,
      arithmeticAgreementFractionAmongCompleteComponentRows: ratioFixed(
        facts.remedy.cpsc.arithmeticAgreementRows,
        facts.remedy.cpsc.completeCorrectionComponentRows),
      historicalRevisionChainReconstructed:
        facts.remedy.cpsc.historicalRevisionChainReconstructed,
      nullFilledAsZero: false, firmReportIsIndependentVerification: false,
      correctionMeansFullRecovery: false, pooledWithCfpbOrFtc: false,
    },
  };
  return Object.fromEntries(Object.entries(diagnostics).map(([diagnosticId, value]) => [
    diagnosticId,
    { ...value, sourceDomainUseBoundary: {
      admittedForBoundedRetrospectiveDescription: value.sourceReceiptOnly !== true,
      admittedForReceiptIdentityAndDeferralOnly: value.sourceReceiptOnly === true,
      crossDomainPoolingPermitted: false,
      crossPublisherPoolingPermitted: false,
      modelInputAdmitted: false,
      causalEffectBeyondStatedSourceDiagnosticEstablished: false,
      targetDomainTransferEstablished: false,
      targetPredictorEligibilityGranted: false,
      targetPriceEligibilityGranted: false,
      operationalAuthorityGranted: false,
    } },
  ]));
}

function sourceDomainLossFragments(facts) {
  const ftcFundDifference = BigInt(facts.remedy.ftc.totalFundUsdCents)
    - BigInt(facts.remedy.ftc.returnedToConsumersUsdCents)
    - BigInt(facts.remedy.ftc.adminCostsUsdCents)
    - BigInt(facts.remedy.ftc.leftoverFundsUsdCents);
  return [
    { fragmentId: "NFIP_PAYMENT_NET_OF_RECORDED_RECOVERY",
      sourceDomain: "NFIP_NC_2024_CLAIM_TRANSACTIONS",
      equation: "NET_RECORDED_PAYMENT=GROSS_REPORTED_PAYMENT-RECORDED_CLAIM_PAYMENT_RECOVERY",
      operands: { grossUsd: facts.nfip.grossPaymentUsd,
        recordedRecoveryUsd: facts.nfip.recordedRecoveryUsd },
      result: { netUsd: facts.nfip.netPaymentUsd },
      identityVerified: decimalToInteger(facts.nfip.grossPaymentUsd, 2)
        - decimalToInteger(facts.nfip.recordedRecoveryUsd, 2)
        === decimalToInteger(facts.nfip.netPaymentUsd, 2),
      administrativePaymentFieldObserved:
        facts.nfip.actualAdministrativePaymentFieldsAdmitted,
      beneficiaryCashReceiptObserved: false, economicHarmObserved: false,
      targetTransferEstablished: false },
    { fragmentId: "RMA_AGGREGATE_INDEMNITY_RATIO",
      sourceDomain: "USDA_RMA_CROP_INSURANCE_2024",
      equation: "PUBLISHED_AGGREGATE_INDEMNITY/PUBLISHED_AGGREGATE_PREMIUM",
      operands: { indemnityUsd: facts.rma.indemnityUsd,
        premiumUsd: facts.rma.totalPremiumUsd },
      result: { ratio: ratioFixed(facts.rma.indemnityUsd, facts.rma.totalPremiumUsd) },
      ratioRecomputedFromBoundOperands: true, cashPaymentObserved: false,
      individualSeverityObserved: false,
      targetTransferEstablished: false },
    { fragmentId: "CAS_PAID_AND_INCURRED_LAG10_BACKTEST",
      sourceDomain: "CAS_SCHEDULE_P",
      equation: "WEIGHTED_ABSOLUTE_ERROR_AT_LAG10/SUM_ABSOLUTE_ACTUAL_LAG10",
      operands: { paidCohorts: facts.cas.paid.evaluatedCohorts,
        incurredCohorts: facts.cas.incurred.evaluatedCohorts },
      result: { paidRatio: facts.cas.paid.lag10WeightedAbsoluteErrorRatio,
        incurredRatio: facts.cas.incurred.lag10WeightedAbsoluteErrorRatio },
      sourceAdapterBacktestStatisticsBoundAfterFullReplay: true,
      lag10UltimateEstablished: false,
      targetTransferEstablished: false },
    { fragmentId: "TREASURY_JUDGMENT_FUND_PUBLISHED_COMPONENT_TOTAL",
      sourceDomain: "TREASURY_JUDGMENT_FUND_2026_PAYMENT_REPORTS",
      equation: "TOTAL_PUBLISHED_AMOUNT=PRINCIPAL+ATTORNEY_FEES+COST+INTEREST",
      operands: {
        principalAmountCents: facts.judgmentGao.treasury.totals.principalAmountCents,
        attorneyFeesAmountCents:
          facts.judgmentGao.treasury.totals.attorneyFeesAmountCents,
        costAmountCents: facts.judgmentGao.treasury.totals.costAmountCents,
        interestAmountCents: facts.judgmentGao.treasury.totals.interestAmountCents,
      },
      result: { totalPublishedAmountCents:
          facts.judgmentGao.treasury.totals.totalPublishedAmountCents },
      identityVerified: BigInt(facts.judgmentGao.treasury.totals.principalAmountCents)
        + BigInt(facts.judgmentGao.treasury.totals.attorneyFeesAmountCents)
        + BigInt(facts.judgmentGao.treasury.totals.costAmountCents)
        + BigInt(facts.judgmentGao.treasury.totals.interestAmountCents)
        === BigInt(facts.judgmentGao.treasury.totals.totalPublishedAmountCents),
      observationUnitIsUniqueClaim: false, recipientCashReceiptObserved: false,
      fullRecoveryEstablished: false, targetTransferEstablished: false },
    { fragmentId: "SEC_NET_UNPAID_CLAIM_LIABILITY",
      sourceDomain: "SELECTED_PUBLIC_PROPERTY_CASUALTY_INSURER_FILING",
      equation: "NET_UNPAID_LIABILITY=GROSS_CLAIM_LIABILITY-REINSURANCE_RECOVERABLE",
      operands: { grossUsd: facts.sec.grossClaimLiabilityUsd,
        recoverableUsd: facts.sec.reinsuranceRecoverableUsd },
      result: { netUsd: facts.sec.netUnpaidClaimLiabilityUsd },
      identityVerified: BigInt(facts.sec.grossClaimLiabilityUsd)
        - BigInt(facts.sec.reinsuranceRecoverableUsd)
        === BigInt(facts.sec.netUnpaidClaimLiabilityUsd),
      recoverableIsCashCollected: false, targetTransferEstablished: false },
    { fragmentId: "FTC_CLOSED_PROGRAM_FUND_FLOW",
      sourceDomain: "FTC_CLOSED_REFUND_PROGRAMS_2024",
      equation: "TOTAL_FUND=RETURNED_TO_CONSUMERS+ADMIN_COSTS+LEFTOVER_FUNDS",
      operands: { totalFundUsdCents: facts.remedy.ftc.totalFundUsdCents,
        returnedUsdCents: facts.remedy.ftc.returnedToConsumersUsdCents,
        adminUsdCents: facts.remedy.ftc.adminCostsUsdCents,
        leftoverUsdCents: facts.remedy.ftc.leftoverFundsUsdCents },
      result: { differenceUsdCents: ftcFundDifference.toString() },
      identityVerified: ftcFundDifference === 0n,
      fullHarmRecoveryEstablished: false, targetTransferEstablished: false },
  ];
}

const AUTHORITY = deepFreeze({
  TRAIN: false, PRICE: false, COVER: false, GUARANTEE: false, CAPITAL: false,
  CUSTODY: false, MOVE_FUNDS: false, PAY: false, SETTLE: false, EXECUTE: false,
  CLOSE: false, REOPEN: false, ASSUME_LIABILITY: false,
  readyToBearResponsibility: false,
});

function flywheelReceiptProjection(flywheel) {
  return {
    schema: flywheel.schema,
    artifactHash: flywheel.artifactHash,
    frozenCatalog: clone(REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG),
    frozenCanonical: clone(REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL),
    requiredArtifacts: flywheel.artifactReceipts.map((row) => ({
      artifactId: row.artifactId, artifactPathRole: row.artifactPathRole,
      sourcePathRole: row.sourcePathRole, artifactHash: row.artifactHash,
      artifactFileHash: row.artifactFileHash, artifactFileBytes: row.artifactFileBytes,
      hashField: row.hashField, sourceCommitment: row.sourceCommitment,
      sourceCommitmentMeaning: row.sourceCommitmentMeaning,
      verifierLevel: row.verifierLevel, containedLaneIds: clone(row.containedLaneIds),
      upstreamArtifactHashes: clone(row.upstreamArtifactHashes),
      upstreamBindingHashes: clone(row.upstreamBindingHashes),
      sourceBytesReplayed: row.sourceBytesReplayed,
      sourceBytesReplayedClaimBasis: row.sourceBytesReplayedClaimBasis,
      temporalAuthenticityEstablished: row.temporalAuthenticityEstablished,
      temporalStatus: row.temporalStatus,
      currentRoutingEligible: row.currentRoutingEligible,
      currentCoverage: row.currentCoverage,
      currentTruth: row.currentTruth,
      currentTruthMeaning: row.currentTruthMeaning,
      closureCredit: row.closureCredit,
      causalExperienceUnits: row.causalExperienceUnits,
      trainingAdmission: row.trainingAdmission,
      pricingAdmission: row.pricingAdmission,
      operationalAuthorityGranted: row.operationalAuthorityGranted,
      sourceReplayClaimedByArtifactAlone: row.sourceReplayClaimedByArtifactAlone,
      exactArtifactComparedByArtifactAlone: row.exactArtifactComparedByArtifactAlone,
      ...(row.acquisitionManifestHash === undefined ? {}
        : { acquisitionManifestHash: row.acquisitionManifestHash }),
    })),
    temporalAuthenticityBoundary: clone(flywheel.temporalAuthenticityBoundary),
    temporalAuditBinding: clone(flywheel.gapReferences.temporalAuditBinding),
    temporalRoutingSummary: {
      status: flywheel.readiness.status,
      pinnedReceiptCount: flywheel.readiness.pinnedReceiptCount,
      temporallyOrderedCurrentReceiptCount:
        flywheel.readiness.temporallyOrderedCurrentReceiptCount,
      temporalQuarantineReceiptCount:
        flywheel.readiness.temporalQuarantineReceiptCount,
      currentCoverageReceiptCount:
        flywheel.temporalAuthenticityBoundary.currentCoverageReceiptCount,
      allPinnedReceiptsTemporallyCurrent:
        flywheel.readiness.allPinnedReceiptsTemporallyCurrent,
      temporalQuarantineClosureCredit:
        flywheel.temporalAuthenticityBoundary.temporalQuarantineClosureCredit,
      temporalQuarantineCausalExperienceUnits:
        flywheel.temporalAuthenticityBoundary.temporalQuarantineCausalExperienceUnits,
      temporalQuarantineTrainingAdmission:
        flywheel.temporalAuthenticityBoundary.temporalQuarantineTrainingAdmission,
      temporalQuarantinePricingAdmission:
        flywheel.temporalAuthenticityBoundary.temporalQuarantinePricingAdmission,
      temporalQuarantineOperationalAuthority:
        flywheel.temporalAuthenticityBoundary.temporalQuarantineOperationalAuthority,
    },
    frozenCanonicalStableReadByThisDiagnosticsArtifactAlone: false,
    frozenCanonicalFileHashVerifiedByThisDiagnosticsArtifactAlone: false,
    frozenCanonicalExactlyRebuiltFromSourcesByThisDiagnosticsArtifactAlone: false,
    frozenCatalogStableReadByThisDiagnosticsArtifactAlone: false,
    frozenCatalogFileHashVerifiedByThisDiagnosticsArtifactAlone: false,
    frozenCatalogCodeProjectionMatchedByThisDiagnosticsArtifactAlone: false,
    sourceArtifactsReverifiedByThisDiagnosticsArtifactAlone: false,
    exactArtifactsComparedByThisDiagnosticsArtifactAlone: false,
    sameCallFullSourceReceiptRequiredForFullVerification: true,
  };
}

function projectionAt(generatedAt) {
  const asOf = canonicalTime(generatedAt);
  if (Date.parse(asOf) < Date.parse(REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.generatedAt)) {
    fail("GENERATED_AT_PRECEDES_FROZEN_FLYWHEEL");
  }
  const flywheel = frozenFlywheelProjection();
  const diagnostics = buildDiagnostics(PINNED_FACTS);
  const body = {
    schema: REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_SCHEMA,
    schemaVersion: "1.13.0",
    generatedAt: asOf,
    generatedAtTrust: "CODE_FIXED_CANONICAL_TIME_NOT_EXTERNAL_ATTESTATION",
    artifactLifecycle: {
      canonicalRelease: "final-v14",
      canonicalRepositoryRelativePath:
        "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json",
      supersedes: {
        repositoryRelativePath:
          "artifacts/real-responsibility-math-diagnostics-20260828/final-v13/diagnostics.json",
        artifactHash:
          "sha256:a4e0a8a34ddaff32d32445dd03330a7dc2319c37a26491313b7978148f6f1b31",
        artifactFileHash:
          "sha256:7bce06a14e6aa8350e4cbe0f3744d918bc58f4bc28cff7ebbcea32cebe7a1fa4",
        artifactFileBytes: 488665,
        reason:
          "SUPERSEDED_BY_FINAL_V14_BINDING_CATALOG_V18_AND_FLYWHEEL_V16_WITH_EXACT_STAGE0_TEMPORAL_AUDIT_FINAL_V2_AND_SEVEN_QUARANTINED_RECEIPTS; SOURCE_DOMAIN_REFERENCE_MATH_REMAINS_ZERO_TARGET_TRANSFER_ZERO_PRICE_AND_ZERO_AUTHORITY",
      },
      supersededArtifactRemainsSourceTruthForItsOwnFrozenProjection: true,
      supersededArtifactIsCurrentCanonical: false,
    },
    epistemicPolicy: {
      realCasesRemainRealCases: true,
      realExperienceRemainsRealExperience: true,
      publicOriginAutomaticallyDowngradesEvidence: false,
      outsiderCollectionAutomaticallyUpgradesEvidence: false,
      qualityAdmissionIsClaimSpecificNotCollectorPrestige: true,
      rightsOrConsentChangeWhetherRecordedEventWasReal: false,
      rightsAndConsentCanRestrictReuseTrainingAndOperationalAdmission: true,
      sourceReplayAuthenticatesPublisherBytesAndAdapterProjectionNotAllUnderlyingWorldTruth: true,
    },
    upstreamFlywheelReceipt: flywheelReceiptProjection(flywheel),
    factorDictionary: clone(REAL_RESPONSIBILITY_FACTOR_DICTIONARY),
    factorAdmissionDiagnostics: factorAdmissionDiagnostics(flywheel),
    sourceDomainDiagnostics: diagnostics,
    sourceDomainLossFragments: sourceDomainLossFragments(PINNED_FACTS),
    mathematicalBoundary: {
      globalWeightedScore: null,
      arbitraryDataQualityWeightingApplied: false,
      heterogeneousSourceDomainsPooled: false,
      crossPublisherProgramsPooled: false,
      crossLaneDollarsPooled: false,
      crossLaneCountsPooled: false,
      crossLaneRatesPooled: false,
      crossLaneExposureDenominatorsBorrowed: false,
      postOutcomeFactorsUsedAsPreActionPredictors: false,
      wave5WholeSessionOrBugFixRowsUsedAsPreActionPredictors: false,
      wave5TrainerRowsEnqueued: 0,
      wave5TargetTransferOrPricingAdmitted: false,
      missingValuesZeroFilled: false,
      censoredRowsTreatedAsClosed: false,
      selfReportedOutcomesTreatedAsIndependentReview: false,
      fraReportedDamageTreatedAsPaidIncurredOrUltimateLoss: false,
      phmsaCapturedRowsUsedAsOutcomeOrActuarialModelInput: false,
      phmsaCapturedRowsUsedWithFraExposure: false,
      phmsaFrequencyOrSeverityRateProduced: false,
      nhtsaManufacturerStatusTreatedAsIndependentRepairAudit: false,
      nhtsaRemediedCountTreatedAsCompleteRepair: false,
      nhtsaAffectedPopulationTreatedAsUniqueVehicleOrTargetExposure: false,
      nhtsaQuarterlyAndAnnualCohortsPooled: false,
      nhtsaDescriptiveStatusRatiosUsedAsTargetRates: false,
      nhtsaStatusCountsTreatedAsPaidIncurredOrUltimateLoss: false,
      nhtsaRecallRecordTreatedAsEnforcementOrder: false,
      nhtsaTrainingAdmitted: false,
      waymoDisplayedMilesTreatedAsExactUnroundedExposure: false,
      waymoSgoRowsTreatedAsIndependentCrashCounts: false,
      waymoPublisherFactorsRecalibratedByOutsider: false,
      waymoRetrospectiveSplitTreatedAsProspectiveHoldout: false,
      waymoCsv4AndCsv1ToCsv3WindowsPooled: false,
      bridgeDataCandidateTrainerRowsEnqueued: 0,
      bridgeDataCandidateAdmittedAsModelInput: false,
      bridgeDataTargetTransferPerformed: false,
      bridgeDataAndWaymoPooled: false,
      clinicalTrialsStudiesTermsGroupsOrRatesPooled: false,
      clinicalTrialsPostingTreatedAsIndependentAdjudication: false,
      clinicalTrialsPostingTreatedAsCausalEffect: false,
      clinicalTrialsTrainingOrPriceAdmitted: false,
      targetDomainLossEstimate: null,
      targetDomainFrequencyEstimate: null,
      targetDomainSeverityEstimate: null,
      targetDomainTailEstimate: null,
      targetDomainDependenceEstimate: null,
      targetDomainPrice: null,
    },
    sourceVerificationBoundary: {
      standaloneVerificationLevel: "STRUCTURE_ONLY_FIXED_PROJECTION_NO_SOURCE_AUTHENTICATION",
      standaloneSourceArtifactsReverified: false,
      embeddedFlywheelReceiptIsSourceProof: false,
      embeddedFrozenFlywheelHashesAreSourceProof: false,
      factorAdmissionsUseFixedFlywheelQualityProjectionInStandaloneMode: true,
      mathGeneratedAtIsIndependentOfFrozenFlywheelGeneratedAt: true,
      mathGeneratedAtIsCodeFixedCanonicalValue: true,
      callerSelectedGeneratedAtAccepted: false,
      fullVerificationRequiresFrozenFlywheelCanonicalStableRead: true,
      fullVerificationRequiresFrozenCatalogCanonicalStableRead: true,
      fullVerificationRequiresExactFrozenCatalogSemanticHash: true,
      fullVerificationRequiresExactFrozenCatalogSerializedHashAndBytes: true,
      fullVerificationRequiresExactFrozenFlywheelSemanticHash: true,
      fullVerificationRequiresExactFrozenFlywheelSerializedHashAndBytes: true,
      fullVerificationRequiresSameInvocationFlywheelFullSourceReceipt: true,
      fullVerificationRequiresSameInvocationReplayToExactlyMatchFrozenFlywheel: true,
      fullVerificationBindsFactorAdmissionsToSourceReplayedFlywheelQuality: true,
      fullVerificationReextractsPinnedArtifactFacts: true,
      fullVerificationRecomputesEveryDiagnosticAndLossFragment: true,
      callerVerificationBooleanAccepted: false,
      callerVerificationResultAccepted: false,
      callerVerificationCallbackAccepted: false,
      staleOrSupersededArtifactAccepted: false,
      browsableOnlyReferencesWithoutSourceAwareAdapterAdmittedIntoMath: false,
      phmsaReceiptIdentityTreatedAsFactorOrModelAdmission: false,
      nhtsaSourceReplayTreatedAsIndependentRepairReceiptLossOrAuthorityProof: false,
      bridgeDataSourceReplayTreatedAsTrainerAdmissionOrCapabilityImprovement: false,
      waymoSourceReplayTreatedAsIndependentOutcomeTruthTargetTransferOrPrice: false,
      clinicalTrialsSourceReplayTreatedAsIndependentOutcomeCausalityTrainingOrPrice: false,
      fullVerificationRequiresExactStage0TemporalAuditReplay: true,
      sourceReplayedTemporallyQuarantinedReceiptsTreatedAsCurrentCoverage: false,
      temporalQuarantineTreatedAsClosureCreditOrCausalExperience: false,
      allPinnedReceiptsTemporallyCurrent: false,
    },
    readiness: {
      status: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
      pinnedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      currentCoverageReceiptCount: 9,
      allPinnedReceiptsTemporallyCurrent: false,
      temporalQuarantineClosureCredit: 0,
      temporalQuarantineCausalExperienceUnits: 0,
      temporalQuarantineTrainingAdmission: 0,
      temporalQuarantinePricingAdmission: 0,
      temporalQuarantineOperationalAuthority: 0,
      sourceDomainRetrospectiveFactorDetailAdvanced: true,
      sourceDomainDescriptiveLossMathAdvanced: true,
      fraSourceDomainCalendarRateDiagnosticsAdvanced: true,
      phmsaModelAdmissionDeferredPendingExposureRightsAndVersionBinding: true,
      nhtsaSourceDomainRecallAndRemedyStatusDiagnosticsAdvanced: true,
      nhtsaTargetModelLossPriceAndTrainingAdmission: false,
      waymoSourceDomainOutcomeExposureDiagnosticsAdvanced: true,
      waymoIndependentOutcomeTargetTransferAndPriceAdmission: false,
      bridgeDataSourceDomainCandidateQualityDiagnosticsAdvanced: true,
      bridgeDataTrainerRowsEnqueued: 0,
      bridgeDataModelCapabilityImprovementEstablished: false,
      clinicalTrialsSourceDomainPostedResultsDiagnosticsAdvanced: true,
      clinicalTrialsTargetTrainingPriceAndAuthorityAdmission: false,
      wave5SourceAwareTaxonomyDiagnosticsAdvanced: true,
      wave5PreActionTrainerTargetAndPriceAdmission: false,
      targetDomainTransferEstablished: false,
      prospectiveTargetHoldoutCompleted: false,
      independentTargetActuarialReviewCompleted: false,
      targetCapitalAndCustodyExecutionObserved: false,
      readyToPrice: false,
      readyToGuarantee: false,
      readyToSettle: false,
      readyToBearResponsibility: false,
    },
    authority: clone(AUTHORITY),
  };
  return deepFreeze({ ...body,
    artifactHash: digest(REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_SCHEMA, body) });
}

function projection() {
  return projectionAt(fixedDiagnosticsTime(
    REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_GENERATED_AT));
}

function canonicalReceiptPath(value, code) {
  const resolved = requiredPath(value, code);
  if (resolved !== value || !path.isAbsolute(value)) fail("RECEIPT_PATH_NON_CANONICAL", code);
  return resolved;
}

function requireReceiptSourceProfile(profile, artifactId) {
  const leaf = (value, code) => canonicalReceiptPath(value, `${artifactId}_${code}`);
  if (artifactId === "CROSS_STAGE_SIX_LANE_PROGRESS") {
    if (!exactKeys(profile, ["wave5", "osha", "aiid", "institutionalRemedies", "rma", "cas"])
      || !exactKeys(profile.wave5, ["traceCommonsDirectory", "robustRosDirectory"])
      || !exactKeys(profile.osha, ["archivePath"])
      || !exactKeys(profile.aiid, ["archivePath", "termsSnapshotPath"])
      || !exactKeys(profile.institutionalRemedies, ["sourceDirectory"])
      || !exactKeys(profile.rma, ["archivePath", "recordLayoutPath"])
      || !exactKeys(profile.cas, ["sourceDirectory", "sourcePagePath"])) {
      fail("RECEIPT_SOURCE_PROFILE_INVALID", artifactId);
    }
    leaf(profile.wave5.traceCommonsDirectory, "TRACE_COMMONS");
    leaf(profile.wave5.robustRosDirectory, "ROBUST_ROS");
    leaf(profile.osha.archivePath, "OSHA");
    leaf(profile.aiid.archivePath, "AIID_ARCHIVE");
    leaf(profile.aiid.termsSnapshotPath, "AIID_TERMS");
    leaf(profile.institutionalRemedies.sourceDirectory, "INSTITUTIONAL_REMEDIES");
    leaf(profile.rma.archivePath, "RMA_ARCHIVE");
    leaf(profile.rma.recordLayoutPath, "RMA_LAYOUT");
    leaf(profile.cas.sourceDirectory, "CAS_DIRECTORY");
    leaf(profile.cas.sourcePagePath, "CAS_PAGE");
    return;
  }
  if (!exactKeys(profile, ["sourceDirectory"])) {
    fail("RECEIPT_SOURCE_PROFILE_INVALID", artifactId);
  }
  leaf(profile.sourceDirectory, "SOURCE_DIRECTORY");
}

function requireFullFlywheelReceipt(receipt, expectedFlywheel) {
  const receiptKeys = [
    "ok", "verificationLevel", "artifactStructureVerified", "qualityPolicyReproduced",
    "allThirtySixGapMappingsReproduced", "sourceArtifactsReverified",
    "upstreamArtifactsExactCompared", "fullLaneSourceReplayCompleted",
    "replayedArtifactIds", "replayedLaneIds", "replayedReceipts", "catalogBinding",
    "temporalAuditBinding", "sourceDomainReferenceEvidenceBound",
    "underlyingWorldTruthBeyondPublisherSourcesAuthenticated",
    "targetDomainTransferEstablished", "targetSpecificGapClosureCredit",
    "allPinnedReceiptsTemporallyCurrent", "currentCoverageReceiptCount",
    "temporalQuarantineReceiptCount", "operationalAuthorityGranted",
    "callerVerificationAccepted", "artifactHash",
  ];
  const expectedCatalogBinding = {
    catalogHash: expectedFlywheel.gapReferences.catalogHash,
    catalogArtifactFileHash: expectedFlywheel.gapReferences.catalogArtifactFileHash,
    catalogArtifactFileBytes: expectedFlywheel.gapReferences.catalogArtifactFileBytes,
    verificationLevel: expectedFlywheel.gapReferences.catalogVerificationLevel,
    codeFixedCatalogProjectionReproducedInThisCall: true,
    catalogSourceArtifactsReverifiedByCatalogAlone: false,
    catalogLocalArtifactHashesMatchedToFlywheelReceipts: true,
    catalogTemporalQuarantineRowsExcludedFromCurrentCoverage: true,
  };
  const expectedAudit = expectedFlywheel.gapReferences.temporalAuditBinding;
  const expectedTemporalAuditBinding = {
    verificationLevel: FULL_FLYWHEEL_LEVEL,
    canonicalRelease: expectedAudit.canonicalRelease,
    repositoryRelativePath: expectedAudit.repositoryRelativePath,
    manifestHash: expectedAudit.manifestHash,
    artifactFileHash: expectedAudit.artifactFileHash,
    artifactFileBytes: expectedAudit.artifactFileBytes,
    sourceArtifactsReverifiedInThisCall: true,
    pinnedReceiptCount: 16,
    sourceReplayedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    temporalQuarantineCurrentCoverage: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
  };
  if (!plain(receipt) || !exactKeys(receipt, receiptKeys) || receipt.ok !== true
    || receipt.verificationLevel !== FULL_FLYWHEEL_LEVEL
    || receipt.artifactStructureVerified !== true
    || receipt.qualityPolicyReproduced !== true
    || receipt.allThirtySixGapMappingsReproduced !== true
    || receipt.sourceArtifactsReverified !== true
    || receipt.upstreamArtifactsExactCompared !== true
    || receipt.fullLaneSourceReplayCompleted !== true
    || receipt.sourceDomainReferenceEvidenceBound !== true
    || receipt.underlyingWorldTruthBeyondPublisherSourcesAuthenticated !== false
    || receipt.targetDomainTransferEstablished !== false
    || receipt.targetSpecificGapClosureCredit !== 0
    || receipt.allPinnedReceiptsTemporallyCurrent !== false
    || receipt.currentCoverageReceiptCount !== 9
    || receipt.temporalQuarantineReceiptCount !== 7
    || receipt.operationalAuthorityGranted !== false
    || receipt.callerVerificationAccepted !== false
    || receipt.artifactHash !== expectedFlywheel.artifactHash
    || !Array.isArray(receipt.replayedReceipts)
    || receipt.replayedReceipts.length !== expectedFlywheel.artifactReceipts.length
    || !same(receipt.replayedArtifactIds,
      expectedFlywheel.artifactReceipts.map(({ artifactId }) => artifactId))
    || !same(receipt.replayedLaneIds,
      expectedFlywheel.lanes.map(({ laneId }) => laneId))
    || !same(receipt.catalogBinding, expectedCatalogBinding)
    || !same(receipt.temporalAuditBinding, expectedTemporalAuditBinding)) {
    fail("FULL_FLYWHEEL_RECEIPT_INVALID",
      receipt?.error ?? receipt?.verificationLevel ?? "UNKNOWN_RECEIPT");
  }
  const replayed = new Map(receipt.replayedReceipts.map((row) => [row.artifactId, row]));
  if (replayed.size !== expectedFlywheel.artifactReceipts.length) {
    fail("FULL_FLYWHEEL_REPLAYED_RECEIPTS_INVALID");
  }
  for (const expected of expectedFlywheel.artifactReceipts) {
    const actual = replayed.get(expected.artifactId);
    const replayedReceiptKeys = [
      "artifactId", "containedLaneIds", "artifactPathRole", "sourcePathRole",
      "artifactPath", "sourceProfile", "artifactFileHash", "artifactFileBytes",
      "artifactHash", "sourceCommitment", "sourceBytesReplayed",
      "temporalAuthenticityEstablished", "temporalStatus", "currentRoutingEligible",
      "currentCoverage", "currentTruth", "currentTruthMeaning", "closureCredit",
      "causalExperienceUnits", "trainingAdmission", "pricingAdmission",
      "operationalAuthorityGranted", "verificationLevel", "sourcePathProfileExactMatched",
      "sourceArtifactsReverified", "canonicalArtifactBytesMatched",
      "candidateArtifactExactlyRebuilt",
      ...(expected.acquisitionManifestHash === undefined
        ? [] : ["acquisitionManifestHash"]),
    ];
    if (!actual || !exactKeys(actual, replayedReceiptKeys)
      || actual.artifactPathRole !== expected.artifactPathRole
      || actual.sourcePathRole !== expected.sourcePathRole
      || !same(actual.containedLaneIds, expected.containedLaneIds)
      || actual.artifactFileHash !== expected.artifactFileHash
      || actual.artifactFileBytes !== expected.artifactFileBytes
      || actual.artifactHash !== expected.artifactHash
      || actual.sourceCommitment !== expected.sourceCommitment
      || actual.acquisitionManifestHash !== expected.acquisitionManifestHash
      || actual.verificationLevel !== expected.verifierLevel
      || actual.sourceBytesReplayed !== true
      || actual.temporalAuthenticityEstablished
        !== expected.temporalAuthenticityEstablished
      || actual.temporalStatus !== expected.temporalStatus
      || actual.currentRoutingEligible !== expected.currentRoutingEligible
      || actual.currentCoverage !== expected.currentCoverage
      || actual.currentTruth !== expected.currentTruth
      || actual.currentTruthMeaning !== expected.currentTruthMeaning
      || actual.closureCredit !== false
      || actual.causalExperienceUnits !== 0
      || actual.trainingAdmission !== false
      || actual.pricingAdmission !== false
      || actual.operationalAuthorityGranted !== false
      || actual.sourcePathProfileExactMatched !== true
      || actual.sourceArtifactsReverified !== true
      || actual.canonicalArtifactBytesMatched !== true
      || actual.candidateArtifactExactlyRebuilt !== true) {
      fail("FULL_FLYWHEEL_REPLAYED_RECEIPT_MISMATCH", expected.artifactId);
    }
    const quarantined = TEMPORAL_QUARANTINE_RECEIPT_ID_SET.has(expected.artifactId);
    if (quarantined !== (actual.temporalAuthenticityEstablished === false)
      || quarantined !== (actual.currentRoutingEligible === false)
      || quarantined !== (actual.currentCoverage === false)
      || quarantined !== (actual.currentTruth === false)
      || quarantined && containsPositiveCurrentToken({
        artifactPathRole: actual.artifactPathRole,
        sourcePathRole: actual.sourcePathRole,
        temporalStatus: actual.temporalStatus,
        currentTruthMeaning: actual.currentTruthMeaning,
      })) {
      fail("FULL_FLYWHEEL_TEMPORAL_CLASSIFICATION_MISMATCH", expected.artifactId);
    }
    canonicalReceiptPath(actual.artifactPath, `${expected.artifactId}_ARTIFACT`);
    requireReceiptSourceProfile(actual.sourceProfile, expected.artifactId);
  }
  return replayed;
}

function receiptById(flywheel, artifactId) {
  const receipt = flywheel.artifactReceipts.find((row) => row.artifactId === artifactId);
  if (!receipt || !HASH.test(receipt.artifactHash) || typeof receipt.hashField !== "string") {
    fail("UPSTREAM_RECEIPT_MISSING", artifactId);
  }
  return receipt;
}

function readBoundArtifact(filePath, flywheel, artifactId) {
  const receipt = receiptById(flywheel, artifactId);
  const loaded = stableReadJson(filePath, artifactId);
  const artifact = loaded.value;
  if (artifact[receipt.hashField] !== receipt.artifactHash
    || loaded.fileHash !== receipt.artifactFileHash
    || loaded.fileBytes !== receipt.artifactFileBytes) {
    fail("UPSTREAM_ARTIFACT_HASH_MISMATCH", artifactId);
  }
  return artifact;
}

function readPinnedReferenceArtifacts(replayedReceipts, flywheel) {
  const artifactPath = (artifactId) => {
    const replayed = replayedReceipts.get(artifactId);
    if (!replayed) fail("REPLAYED_ARTIFACT_PATH_MISSING", artifactId);
    return replayed.artifactPath;
  };
  return {
    wave5Intake: readBoundArtifact(
      artifactPath("WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY"), flywheel,
      "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY"),
    progress: readBoundArtifact(artifactPath("CROSS_STAGE_SIX_LANE_PROGRESS"), flywheel,
      "CROSS_STAGE_SIX_LANE_PROGRESS"),
    maude: readBoundArtifact(artifactPath("FDA_MAUDE_OUTCOME_SENSING"), flywheel,
      "FDA_MAUDE_OUTCOME_SENSING"),
    dmv: readBoundArtifact(artifactPath("CA_DMV_AV_OUTCOME_SENSING"), flywheel,
      "CA_DMV_AV_OUTCOME_SENSING"),
    capital: readBoundArtifact(artifactPath("INSTITUTIONAL_CAPITAL_CLAIMS"), flywheel,
      "INSTITUTIONAL_CAPITAL_CLAIMS"),
    fema: readBoundArtifact(artifactPath("FEMA_REAL_CASES"), flywheel,
      "FEMA_REAL_CASES"),
    remedy: readBoundArtifact(artifactPath("REMEDY_PAYMENT_RECOVERY"), flywheel,
      "REMEDY_PAYMENT_RECOVERY"),
    ntsbBls: readBoundArtifact(artifactPath("NTSB_BLS_REAL_OUTCOME_EXPERIENCE"), flywheel,
      "NTSB_BLS_REAL_OUTCOME_EXPERIENCE"),
    judgmentGao: readBoundArtifact(artifactPath("JUDGMENT_FUND_GAO_REAL_CASES"), flywheel,
      "JUDGMENT_FUND_GAO_REAL_CASES"),
    ncuaPbgcMsha: readBoundArtifact(artifactPath("NCUA_PBGC_MSHA_REAL_EXPERIENCE"),
      flywheel, "NCUA_PBGC_MSHA_REAL_EXPERIENCE"),
    cdiNcigf: readBoundArtifact(artifactPath("CDI_NCIGF_REAL_RATE_GUARANTY"), flywheel,
      "CDI_NCIGF_REAL_RATE_GUARANTY"),
    fraPhmsa: readBoundArtifact(artifactPath("FRA_PHMSA_REAL_SAFETY_EVIDENCE"), flywheel,
      "FRA_PHMSA_REAL_SAFETY_EVIDENCE"),
    nhtsaRecallRemedy: readBoundArtifact(
      artifactPath("NHTSA_RECALL_REMEDY_STATUS_EVIDENCE"), flywheel,
      "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE"),
    bridgeDataV2: readBoundArtifact(
      artifactPath("BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE"), flywheel,
      "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE"),
    waymoSafetyImpact: readBoundArtifact(
      artifactPath("WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE"), flywheel,
      "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE"),
    clinicalTrials: readBoundArtifact(
      artifactPath("CLINICALTRIALS_POSTED_RESULTS_EVIDENCE"), flywheel,
      "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE"),
  };
}

export function buildRealResponsibilityMathDiagnosticsProjection(options = {}) {
  const keys = Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [];
  if (!exactKeys(options, keys)) fail("PROJECTION_OPTIONS_INVALID");
  if (Object.hasOwn(options, "generatedAt")) fixedDiagnosticsTime(options.generatedAt);
  return projection();
}

/**
 * Full construction accepts paths only.  It does not accept a caller receipt,
 * trust boolean, verifier result, callback, or pre-built flywheel.  The source
 * profile must name the frozen flywheel canonical as well as its underlying
 * source profile; the canonical is authenticated before expensive replay.
 */
async function buildFromSourcesAt(sources, generatedAt) {
  const normalizedGeneratedAt = canonicalTime(generatedAt);
  if (Date.parse(normalizedGeneratedAt)
    < Date.parse(REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.generatedAt)) {
    fail("GENERATED_AT_PRECEDES_FROZEN_FLYWHEEL");
  }
  const paths = mathSourcePathProfile(sources);
  const catalog = readFrozenCatalogCanonical(paths.frozenCatalogArtifactPath);
  const flywheel = readFrozenFlywheelCanonical(paths.frozenFlywheelArtifactPath);
  if (flywheel.gapReferences?.catalogAsOf !== catalog.asOf
    || flywheel.gapReferences?.catalogHash !== catalog.catalogHash
    || flywheel.gapReferences?.catalogVerificationLevel
      !== "CODE_FIXED_CATALOG_WITH_PINNED_TEMPORAL_AUDIT_REFERENCE_STRUCTURE_ONLY"
    || flywheel.gapReferences?.catalogSourceArtifactsReverifiedByCatalogAlone !== false
    || flywheel.temporalAuthenticityBoundary?.status !== FULL_FLYWHEEL_LEVEL
    || flywheel.temporalAuthenticityBoundary?.pinnedReceiptCount !== 16
    || flywheel.temporalAuthenticityBoundary?.temporallyOrderedCurrentReceiptCount !== 9
    || flywheel.temporalAuthenticityBoundary?.temporalQuarantineReceiptCount !== 7
    || flywheel.temporalAuthenticityBoundary?.currentCoverageReceiptCount !== 9
    || flywheel.temporalAuthenticityBoundary?.allPinnedReceiptsTemporallyCurrent !== false
    || flywheel.temporalAuthenticityBoundary?.temporalQuarantineClosureCredit !== 0
    || flywheel.temporalAuthenticityBoundary?.temporalQuarantineCausalExperienceUnits !== 0
    || flywheel.temporalAuthenticityBoundary?.temporalQuarantineTrainingAdmission !== 0
    || flywheel.temporalAuthenticityBoundary?.temporalQuarantinePricingAdmission !== 0
    || flywheel.temporalAuthenticityBoundary?.temporalQuarantineOperationalAuthority !== 0) {
    fail("FROZEN_CATALOG_FLYWHEEL_BINDING_MISMATCH");
  }
  const receipt = await verifyRealCaseResponsibilityFlywheelAgainstSources(flywheel,
    { sources: paths.flywheelSources });
  const replayedReceipts = requireFullFlywheelReceipt(receipt, flywheel);
  const artifacts = readPinnedReferenceArtifacts(replayedReceipts, flywheel);
  const facts = extractFacts(artifacts);
  if (!same(facts, PINNED_FACTS)) {
    fail("PINNED_SOURCE_FACT_PROFILE_MISMATCH", firstDifference(facts, PINNED_FACTS));
  }
  return projectionAt(normalizedGeneratedAt);
}

export async function buildRealResponsibilityMathDiagnosticsFromSources(options = {}) {
  const keys = Object.hasOwn(options, "generatedAt")
    ? ["sources", "generatedAt"] : ["sources"];
  if (!exactKeys(options, keys)) fail("SOURCE_BUILD_OPTIONS_INVALID");
  const generatedAt = fixedDiagnosticsTime(
    options.generatedAt ?? REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_GENERATED_AT);
  return buildFromSourcesAt(options.sources, generatedAt);
}

/**
 * No-clobber release construction boundary. The build-entry timestamp is
 * sampled by the CLI, source replayed in the same invocation, and is not
 * canonical until the fixed projection is rebound to the resulting bytes.
 */
export async function buildRealResponsibilityMathDiagnosticsCandidateFromSources(
  options = {}) {
  if (!exactKeys(options, ["sources", "generatedAt"])) {
    fail("CANDIDATE_SOURCE_BUILD_OPTIONS_INVALID");
  }
  const generatedAt = canonicalTime(options.generatedAt);
  if (Date.parse(generatedAt) > Date.now()) fail("CANDIDATE_TIME_IN_FUTURE");
  return buildFromSourcesAt(options.sources, generatedAt);
}

export function verifyRealResponsibilityMathDiagnostics(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_SCHEMA
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_INVALID");
    fixedDiagnosticsTime(artifact.generatedAt);
    const expected = projection();
    if (!same(artifact, expected)) fail("FIXED_PROJECTION_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel: "STRUCTURE_ONLY_FIXED_PROJECTION_NO_SOURCE_AUTHENTICATION",
      artifactStructureVerified: true,
      factorDictionaryReproduced: true,
      factorAdmissionsRecomputedFromFixedFlywheelProjection: true,
      sourceDomainDiagnosticsRecomputedFromFixedProjection: true,
      mathematicalBoundariesReproduced: true,
      requiredUpstreamArtifactCount: expected.upstreamFlywheelReceipt.requiredArtifacts.length,
      typedFactorCount: expected.factorDictionary.factors.length,
      sourceDomainDiagnosticCount: Object.keys(expected.sourceDomainDiagnostics).length,
      sourceDomainRetrospectiveFactorsAdmitted:
        expected.factorAdmissionDiagnostics.admittedForStatedSourceDomainRetrospectiveUse,
      targetDomainFactorsAdmitted: 0,
      sourceArtifactsReverified: false,
      frozenCatalogCanonicalStableRead: false,
      frozenCatalogCanonicalFileHashVerified: false,
      frozenCatalogCodeProjectionMatched: false,
      frozenFlywheelCanonicalStableRead: false,
      frozenFlywheelCanonicalFileHashVerified: false,
      frozenFlywheelExactlyRebuiltFromSources: false,
      sameCallFlywheelFullSourceReceiptVerified: false,
      pinnedArtifactFactsReextracted: false,
      targetDomainTransferEstablished: false,
      operationalAuthorityGranted: false,
      artifactHash: artifact.artifactHash,
    });
  } catch (error) {
    return deepFreeze({
      ok: false, verificationLevel: "INVALID", artifactStructureVerified: false,
      factorDictionaryReproduced: false,
      factorAdmissionsRecomputedFromFixedFlywheelProjection: false,
      sourceDomainDiagnosticsRecomputedFromFixedProjection: false,
      mathematicalBoundariesReproduced: false, sourceArtifactsReverified: false,
      frozenCatalogCanonicalStableRead: false,
      frozenCatalogCanonicalFileHashVerified: false,
      frozenCatalogCodeProjectionMatched: false,
      frozenFlywheelCanonicalStableRead: false,
      frozenFlywheelCanonicalFileHashVerified: false,
      frozenFlywheelExactlyRebuiltFromSources: false,
      sameCallFlywheelFullSourceReceiptVerified: false,
      pinnedArtifactFactsReextracted: false, targetDomainTransferEstablished: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function verifyRealResponsibilityMathDiagnosticsAgainstSources(
  artifact, options = {}) {
  const standalone = verifyRealResponsibilityMathDiagnostics(artifact);
  if (!standalone.ok) return standalone;
  try {
    if (!exactKeys(options, ["sources"])) fail("SOURCE_VERIFY_OPTIONS_INVALID");
    const rebuilt = await buildRealResponsibilityMathDiagnosticsFromSources({
      sources: options.sources, generatedAt: artifact.generatedAt,
    });
    if (!same(artifact, rebuilt)) fail("FULL_SOURCE_REBUILD_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel:
        "FULL_SOURCE_DOMAIN_MATH_WITH_SAME_CALL_FLYWHEEL_REPLAY_AND_TEMPORAL_QUARANTINE_HOLD",
      artifactStructureVerified: true,
      factorDictionaryReproduced: true,
      factorAdmissionsBoundToSourceReplayedFlywheelQuality: true,
      sourceDomainDiagnosticsRecomputed: true,
      lossFragmentsRecomputed: true,
      mathematicalBoundariesReproduced: true,
      requiredUpstreamArtifactCount: artifact.upstreamFlywheelReceipt.requiredArtifacts.length,
      typedFactorCount: artifact.factorDictionary.factors.length,
      sourceDomainDiagnosticCount: Object.keys(artifact.sourceDomainDiagnostics).length,
      sourceDomainRetrospectiveFactorsAdmitted:
        artifact.factorAdmissionDiagnostics.admittedForStatedSourceDomainRetrospectiveUse,
      targetDomainFactorsAdmitted: 0,
      sourceArtifactsReverified: true,
      frozenCatalogCanonicalStableRead: true,
      frozenCatalogCanonicalFileHashVerified: true,
      frozenCatalogCodeProjectionMatched: true,
      frozenFlywheelCanonicalStableRead: true,
      frozenFlywheelCanonicalFileHashVerified: true,
      frozenFlywheelExactlyRebuiltFromSources: true,
      sameCallFlywheelFullSourceReceiptVerified: true,
      pinnedArtifactFactsReextracted: true,
      temporalAuditReplayedInSameCall: true,
      pinnedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      currentCoverageReceiptCount: 9,
      allPinnedReceiptsTemporallyCurrent: false,
      readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
      temporalQuarantineClosureCredit: 0,
      temporalQuarantineCausalExperienceUnits: 0,
      temporalQuarantineTrainingAdmission: 0,
      temporalQuarantinePricingAdmission: 0,
      temporalQuarantineOperationalAuthority: 0,
      staleOrSupersededArtifactsAccepted: false,
      globalWeightedScoreProduced: false,
      crossDomainPoolingPerformed: false,
      targetDomainTransferEstablished: false,
      operationalAuthorityGranted: false,
      callerVerificationAccepted: false,
      artifactHash: artifact.artifactHash,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "FULL_SOURCE_DOMAIN_MATH_REPLAY_FAILED",
      artifactStructureVerified: true,
      factorDictionaryReproduced: true,
      factorAdmissionsBoundToSourceReplayedFlywheelQuality: false,
      sourceDomainDiagnosticsRecomputed: false,
      lossFragmentsRecomputed: false,
      mathematicalBoundariesReproduced: true,
      sourceArtifactsReverified: false,
      frozenCatalogCanonicalStableRead: false,
      frozenCatalogCanonicalFileHashVerified: false,
      frozenCatalogCodeProjectionMatched: false,
      frozenFlywheelCanonicalStableRead: false,
      frozenFlywheelCanonicalFileHashVerified: false,
      frozenFlywheelExactlyRebuiltFromSources: false,
      sameCallFlywheelFullSourceReceiptVerified: false,
      pinnedArtifactFactsReextracted: false,
      staleOrSupersededArtifactsAccepted: false,
      globalWeightedScoreProduced: false,
      crossDomainPoolingPerformed: false,
      targetDomainTransferEstablished: false,
      operationalAuthorityGranted: false,
      callerVerificationAccepted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const REAL_RESPONSIBILITY_MATH_PINNED_FACTS = PINNED_FACTS;
