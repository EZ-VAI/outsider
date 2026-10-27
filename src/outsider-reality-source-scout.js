/*
 * Reliable-source scout for real-world consequence and authority vocabulary.
 *
 * "Reliable source" here means an official publisher location with a stable
 * edition, revision, file, or cutoff that can be revisited.  It does not mean
 * the reported events are true, complete, causal, representative, licensed for
 * training, or sufficient to allocate responsibility.  This catalog ingests
 * no source payload and grants nothing.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

export const REALITY_SOURCE_SCOUT_SCHEMA = "outsider/reality-source-scout/v1";
export const REALITY_SOURCE_REVIEW_SCHEMA
  = "outsider/reality-source-review-projection/v1";

const REVIEWED_AT = "2026-08-27T08:30:00.000Z";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const StructuredClone = globalThis.structuredClone;
const ArrayIsArray = Array.isArray;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const ObjectFreeze = Object.freeze;
const ObjectIsFrozen = Object.isFrozen;
const ObjectValues = Object.values;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const children = ObjectValues(value);
  for (let index = 0; index < children.length; index += 1) {
    deepFreeze(children[index]);
  }
  return ObjectFreeze(value);
}

function commonBoundary() {
  return {
    sourcePayloadDownloaded: false,
    sourceBytesReplayed: false,
    sourceTruthEstablished: false,
    denominatorSourceReplayed: false,
    reportingCompletenessEstablished: false,
    causalityEstablished: false,
    populationRepresentativenessEstablished: false,
    affectedPartyCompletenessEstablished: false,
    responsibilityEstablished: false,
    trainingRightsEstablished: false,
    admittedTrainingRows: 0,
    causalExperienceUnits: 0,
    authorityEstablished: false,
    actionReady: false,
  };
}

function entry(input) {
  return { id: input.id, sourceClass: input.sourceClass,
    officialUrl: input.officialUrl, sourceLocator: input.sourceLocator,
    denominator: input.denominator, publisherLimitations: input.publisherLimitations,
    rightsAndPrivacy: input.rightsAndPrivacy,
    candidateUse: input.candidateUse, channelHypotheses: input.channelHypotheses,
    nextGate: input.nextGate, boundary: commonBoundary() };
}

const SOURCES = deepFreeze(ArraySort([
  entry({
    id: "AAIB_UAS_RECORD_ONLY_2026_02_03",
    sourceClass: "OFFICIAL_RECORD_ONLY_UAS_OCCURRENCE_PUBLICATION",
    officialUrl: "https://www.gov.uk/government/publications/aaib-record-only-uas-investigations-reviewed-february-march-2026/aaib-record-only-uas-investigations-reviewed-february-march-2026",
    sourceLocator: { kind: "OFFICIAL_DATED_PUBLICATION_OBSERVATION",
      value: "REVIEWED_2026-02_TO_2026-03", publishedAt: "2026-05-14",
      observedAt: REVIEWED_AT, stable: false, contentHashEstablished: false },
    denominator: { unit: "RECORD_ONLY_UAS_OCCURRENCES_IN_DATED_PUBLICATION",
      count: 3, exactForObservedPage: true, widerOccurrencePopulationKnown: false },
    publisherLimitations: ["RECORD_ONLY_NOT_FIELD_OR_FULL_CORRESPONDENCE_INVESTIGATION",
      "WHOLLY_OR_LARGELY_AIRCRAFT_COMMANDER_REPORTED",
      "PUBLISHER_STATES_ACCURACY_CANNOT_BE_ASSURED",
      "THREE_RECORD_PUBLICATION_IS_NOT_AN_OCCURRENCE_CENSUS",
      "NO_EXPOSURE_DENOMINATOR"],
    rightsAndPrivacy: { publicationLicenseClaim: "OGL-3.0",
      thirdPartyRightsResolved: false, reportTextRightsResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false },
    candidateUse: "UAS_COMMAND_LOSS_BYSTANDER_ABORT_AND_SAFETY_CORDON_TAXONOMY_ONLY",
    channelHypotheses: ["REMOTE_COMMAND_LOSS", "HUMAN_ABORT_OR_LANDING_ATTEMPT",
      "BYSTANDER_OR_PROPERTY_EXPOSURE", "SAFETY_CORDON", "RECOVERY_OR_ABORT"],
    nextGate: "HASH_DATED_PUBLICATION_BYTES_REVIEW_THIRD_PARTY_RIGHTS_AND_PROJECT_ONLY_MINIMIZED_EVENT_TAXONOMY",
  }),
  entry({
    id: "AI_INCIDENT_DATABASE_2026_MAY_JULY",
    sourceClass: "CURATED_PUBLIC_AI_INCIDENT_ALLEGATION_INDEX",
    officialUrl: "https://incidentdatabase.ai/blog/incident-report-2026-may-june-july/",
    sourceLocator: { kind: "EDITORIAL_BATCH", value: "2026-05_TO_2026-07",
      publishedAt: "2026-08-11", firstIncidentId: 1471, lastIncidentId: 1618 },
    denominator: { unit: "NEW_INCIDENT_IDS_IN_EDITORIAL_BATCH", count: 148,
      arithmeticReconciled: 1618 - 1471 + 1 === 148 },
    publisherLimitations: ["PUBLIC_REPORT_AND_NEWS_SELECTION",
      "NOT_COMPULSORY_REPORTING", "NOTORIETY_AND_UNDERREPORTING_BIAS",
      "ALLEGATIONS_NOT_INDEPENDENTLY_ESTABLISHED_BY_THIS_MODULE",
      "REPOSITORY_DATABASE_DOCUMENTATION_SELF_IDENTIFIES_AS_OUTDATED"],
    rightsAndPrivacy: { codeLicense: "MIT", reportTextRightsResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false },
    candidateUse: "STRUCTURED_ID_AND_AFFECTED_PARTY_ROLE_TAXONOMY_ONLY",
    channelHypotheses: ["ALLEGED_HARM", "NEAR_MISS", "DEVELOPER",
      "DEPLOYER", "AFFECTED_PARTY"],
    nextGate: "FREEZE_OFFICIAL_LIVE_SCHEMA_OR_SNAPSHOT_AND_INGEST_IDS_WITHOUT_ARTICLE_TEXT",
  }),
  entry({
    id: "CALIFORNIA_DMV_AV_DISENGAGEMENT_2023_12_2024_11",
    sourceClass: "REGULATORY_AUTONOMOUS_VEHICLE_TESTING_EXPOSURE_AND_DISENGAGEMENT_COHORT",
    officialUrl: "https://www.dmv.ca.gov/portal/news-and-media/over-4-million-test-miles-logged-by-autonomous-vehicle-permit-holders-in-california/",
    sourceLocator: { kind: "OFFICIAL_DATED_COHORT_OBSERVATION",
      value: "2023-12-01_TO_2024-11-30", publishedAt: "2025-01-31",
      observedAt: REVIEWED_AT, stable: false, contentHashEstablished: false,
      manufacturerReportBytesReplayed: false },
    denominator: { unit: "PUBLIC_ROAD_AUTONOMOUS_TEST_MILES",
      count: 4_498_066, safetyDriverMiles: 3_945_171,
      fullyAutonomousMiles: 552_895, arithmeticReconciled: true,
      noPublicRoadTestingPermitHoldersClaimed: 20,
      ceasedTestingAndWithdrawnPermitHoldersClaimed: 9,
      disengagementRowsReplayed: false },
    publisherLimitations: ["PUBLIC_ROAD_TESTING_ONLY",
      "PRIVATE_ROAD_OUT_OF_STATE_BELOW_SAE_LEVEL3_AND_SIMULATION_EXCLUDED",
      "DEPLOYMENT_PERMIT_OPERATIONS_EXCLUDED",
      "PUBLISHER_STATES_NOT_FOR_CROSS_COMPANY_COMPARISON",
      "DISENGAGEMENT_DEFINITION_AND_TEST_DIFFICULTY_ARE_NOT_NORMALIZED",
      "LEGACY_METRIC_LATER_REPLACED_BY_UPDATED_REPORTING_RULES"],
    rightsAndPrivacy: { codeLicense: null, reportTextRightsResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false,
      manufacturerNarrativeIngested: false },
    candidateUse: "FROZEN_REGULATORY_EXPOSURE_AND_HUMAN_TAKEOVER_SCHEMA_METADATA_ONLY",
    channelHypotheses: ["HUMAN_TAKEOVER", "REMOTE_OPERATOR_INTERVENTION",
      "TECHNOLOGY_FAILURE", "SAFETY_CONCERN", "PUBLIC_ROAD_EXPOSURE"],
    nextGate: "HASH_EACH_MANUFACTURER_REPORT_REPLAY_MILEAGE_AND_DISENGAGEMENT_ROWS_AND_FREEZE_DEFINITION_VERSION",
  }),
  entry({
    id: "CEDAR_EXAMPLE_USE_CASES_4_12",
    sourceClass: "SYNTHETIC_AUTHORIZATION_POLICY_AND_REQUEST_CORPUS",
    officialUrl: "https://github.com/cedar-policy/cedar-examples",
    sourceLocator: { kind: "GITHUB_COMMIT",
      value: "c251f7d1ad171bd12dee5d1d7a1cceaec994518f",
      path: "cedar-example-use-cases", releaseBranchObserved: "release/4.12.x" },
    denominator: { unit: "README_CLAIMED_APPLICATIONS", count: 6,
      observedDirectoryCountClaimedByReview: 7, mismatchRequiresSourceReplay: true },
    publisherLimitations: ["SYNTHETIC_EXAMPLES", "NO_LIVE_OWNER_IDENTITY",
      "NO_LIVE_REVOCATION_OR_RESOURCE_STATE", "POLICY_DECISION_IS_NOT_EFFECT_CONTAINMENT"],
    rightsAndPrivacy: { codeLicense: "Apache-2.0", reportTextRightsResolved: true,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: true },
    candidateUse: "AUTHORITY_SCHEMA_AND_DEFAULT_DENY_CONFORMANCE_FIXTURES",
    channelHypotheses: ["PRINCIPAL", "ACTION", "RESOURCE", "CONTEXT",
      "CONSENT", "EXPIRY", "DENY"],
    nextGate: "SOURCE_REPLAY_COMMIT_AND_RECONCILE_SIX_VS_SEVEN_USE_CASE_DENOMINATOR",
  }),
  entry({
    id: "FDA_MAUDE_THRU_2025",
    sourceClass: "PASSIVE_MEDICAL_DEVICE_ADVERSE_EVENT_REPORTS",
    officialUrl: "https://www.fda.gov/medical-devices/medical-device-reporting-mdr-how-report-medical-device-problems/mdr-data-files",
    sourceLocator: { kind: "OFFICIAL_YEAR_CUTOFF_FILESET_OBSERVATION",
      value: "THRU_2025", observedAt: REVIEWED_AT, stable: false,
      contentHashEstablished: false, masterFile: "mdrfoithru2025.zip",
      deviceProblemCodeFile: "deviceproblemcodes2025.zip",
      patientProblemCodeFile: "patientproblemcodes2025.zip" },
    denominator: { unit: "MASTER_RECORDS_IN_THRU_2025_FILE", count: 23_636_521,
      deviceProblemCodes: 885, patientProblemCodes: 1_144,
      exposureDenominatorAvailable: false },
    publisherLimitations: ["PASSIVE_REPORTING", "UNDERREPORTING", "DUPLICATES",
      "INACCURATE_OR_INCOMPLETE_REPORTS", "NO_EXPOSURE_DENOMINATOR",
      "NO_VERIFIED_CAUSALITY"],
    rightsAndPrivacy: { codeLicense: null, reportTextRightsResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false,
      foiaDirectReporterAndFacilityIdentifiersRemoved: true,
      quasiIdentifierRiskRemains: true },
    candidateUse: "DEVICE_AND_PATIENT_PROBLEM_CODE_DICTIONARY_METADATA_ONLY",
    channelHypotheses: ["DEVICE_FAILURE", "PATIENT_HARM", "MALFUNCTION",
      "ADVERSE_EVENT", "REPORTING_DELAY"],
    nextGate: "PIN_EACH_FILE_URL_SHA256_AND_RECORD_COUNT_THEN_DEFINE_PRIVACY_MINIMIZED_DEVICE_FILTER",
  }),
  entry({
    id: "NASA_ASRS_UAS_UPDATE_23",
    sourceClass: "VOLUNTARY_ANONYMIZED_UAS_SAFETY_REPORT_SET",
    officialUrl: "https://asrs.arc.nasa.gov/docs/rpsts/uas.pdf",
    sourceLocator: { kind: "MUTABLE_OFFICIAL_URL_OBSERVATION", value: "UPDATE_23",
      publishedAt: "2026-07-15", observedAt: REVIEWED_AT, stable: false,
      contentHashEstablished: false },
    denominator: { unit: "SCREENED_RECORDS_IN_REPORT_SET", count: 50,
      parentSearchExportCap: 10_000 },
    publisherLimitations: ["VOLUNTARY_REPORTING", "ANONYMIZED",
      "NASA_DOES_NOT_VERIFY_OR_CORROBORATE", "NO_PREVALENCE_INFERENCE",
      "ACCIDENTS_AND_CRIMINAL_ACTS_OUTSIDE_CHANNEL"],
    rightsAndPrivacy: { codeLicense: null, reportTextRightsResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false },
    candidateUse: "NEAR_MISS_AND_HUMAN_RECOVERY_TAXONOMY_ONLY",
    channelHypotheses: ["NEAR_MISS", "DETECTION", "HUMAN_INTERVENTION",
      "RECOVERY", "AIRSPACE_CONSEQUENCE"],
    nextGate: "ACQUIRE_AND_PIN_UPDATE_23_PDF_BYTES_THEN_INGEST_ONLY_PRIVACY_MINIMIZED_STRUCTURED_TAXONOMY",
  }),
  entry({
    id: "NHTSA_SGO_THIRD_AMENDMENT_2026_07_15",
    sourceClass: "MANDATORY_ADS_AND_LEVEL2_ADAS_CRASH_REPORTING_FEED",
    officialUrl: "https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting",
    sourceLocator: { kind: "MUTABLE_MONTHLY_OFFICIAL_FILESET_OBSERVATION",
      value: "THIRD_AMENDMENT_DATA_THROUGH_2026-07-15",
      amendmentIssuedAt: "2025-04-24", amendmentEffectiveAt: "2025-06-16",
      observedAt: REVIEWED_AT, stable: false, contentHashEstablished: false,
      csvClasses: ["ADS", "LEVEL2_ADAS", "OTHER"],
      dataDictionaryObserved: true },
    denominator: { unit: "PUBLIC_SUMMARY_INCIDENT_REPORT_ROWS",
      count: null, reportingWindowStart: "2025-06-16",
      reportingWindowEndObserved: "2026-07-15", monthlyUpdates: true,
      exposureDenominatorAvailable: false, reportVersionsAndDuplicatesPossible: true },
    publisherLimitations: ["REPORTING_DEPENDS_ON_ENTITY_NOTICE_AND_TELEMETRY",
      "INITIAL_REPORTS_MAY_BE INCOMPLETE_OR_UNKNOWN",
      "MULTIPLE_REPORTS_OR_ENTITIES_MAY_DESCRIBE_ONE_CRASH",
      "ADS_AND_LEVEL2_REPORTING_THRESHOLDS_DIFFER",
      "NO_VEHICLE_OR_MILES_EXPOSURE_DENOMINATOR",
      "NOT_STATISTICALLY_REPRESENTATIVE_AND_NOT_CAUSAL_ADJUDICATION"],
    rightsAndPrivacy: { codeLicense: null, reportTextRightsResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false,
      publisherStatesPiiAndConfidentialBusinessInformationRedacted: true,
      residualVehicleAndNarrativePrivacyReviewRequired: true },
    candidateUse: "CRASH_REPORT_VERSION_MISSINGNESS_AND_VULNERABLE_ROAD_USER_SCHEMA_METADATA_ONLY",
    channelHypotheses: ["CRASH", "VULNERABLE_ROAD_USER", "HOSPITAL_TRANSPORT",
      "PROPERTY_DAMAGE", "REPORT_VERSION", "PRE_CRASH", "POST_CRASH"],
    nextGate: "PIN_THREE_CSV_AND_DICTIONARY_BYTES_RECONCILE_REPORT_VERSIONS_AND_KEEP_NO_EXPOSURE_RATE_BOUNDARY",
  }),
  entry({
    id: "OECD_AIM_2026_08_13",
    sourceClass: "DYNAMIC_AI_INCIDENT_AND_HAZARD_AGGREGATOR",
    officialUrl: "https://oecd.ai/en/incidents",
    sourceLocator: { kind: "QUERY_CUTOFF", value: "2026-08-13",
      stable: false, snapshotEstablished: false,
      query: "from_date=1900-08-13&to_date=2026-08-13",
      methodologyUrl: "https://oecd.ai/en/incidents-methodology" },
    denominator: { unit: "DISPLAYED_INCIDENTS_AND_HAZARDS_APPROXIMATE",
      count: 16_968, exact: false, dynamicSource: true },
    publisherLimitations: ["DYNAMIC_DAILY_INGEST", "LLM_CLASSIFICATION_AND_SUMMARY",
      "NOT_INDEPENDENTLY_VERIFIED", "THIRD_PARTY_NEWS_SELECTION_AND_RIGHTS",
      "NO_COMPLETE_EVENT_POPULATION"],
    rightsAndPrivacy: { codeLicense: null, reportTextRightsResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false },
    candidateUse: "CUTOFF_BOUND_HARM_AND_AFFECTED_STAKEHOLDER_TAXONOMY_ONLY",
    channelHypotheses: ["HARM_TYPE", "SEVERITY_CLAIM", "AFFECTED_STAKEHOLDER",
      "HAZARD", "GEOGRAPHY"],
    nextGate: "FREEZE_CUTOFF_METADATA_WITHOUT_NEWS_TEXT_AND_REPLAY_METHODOLOGY_VERSION",
  }),
  entry({
    id: "OPENID_SHARED_SIGNALS_FINAL_1_0",
    sourceClass: "FINAL_CONTINUOUS_ACCESS_AND_RISK_SIGNAL_SPECIFICATION_SET",
    officialUrl: "https://openid.net/three-shared-signals-final-specifications-approved/",
    sourceLocator: { kind: "FINAL_SPECIFICATION_SET",
      value: "SSF_CAEP_RISC_1.0_FINAL", approvedAt: "2025-09-02",
      stable: true, contentHashEstablished: false,
      specificationUrls: [
        "https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html",
        "https://openid.net/specs/openid-caep-1_0-final.html",
        "https://openid.net/specs/openid-risc-1_0-final.html",
      ] },
    denominator: { unit: "OPENID_FINAL_SPECIFICATIONS_IN_APPROVED_SET",
      count: 3, finalAndNotSubjectToFurtherRevisionClaimedByPublisher: true },
    publisherLimitations: ["SIGNAL_TRANSMISSION_IS_NOT_RESOURCE_OWNER_STANDING",
      "RECEIVER_ACTION_IS_NOT_ESTABLISHED_BY_A_SIGNAL",
      "TRANSMITTER_TRUST_AND_SUBJECT_BINDING_REQUIRE_EXTERNAL_VERIFICATION",
      "REVOCATION_EVENT_DELIVERY_IS_NOT_EXCLUSIVE_WRITE_PATH_PROOF",
      "SPECIFICATION_CONFORMANCE_IS_NOT_LIVE_AUTHORITY"],
    rightsAndPrivacy: { specificationTextLicense: null,
      implementerIpProtectionClaimedByPublisher: true,
      reportTextRightsResolved: false, sourceUrlOnlyProjection: true,
      personalDataReviewComplete: true },
    candidateUse: "REVOCATION_ATTENUATION_AND_RECOVERY_EVENT_VOCABULARY_ONLY",
    channelHypotheses: ["SESSION_REVOKED", "CREDENTIAL_CHANGE",
      "ASSURANCE_LEVEL_CHANGE", "DEVICE_COMPLIANCE_CHANGE",
      "ACCOUNT_DISABLED", "RECOVERY_ACTIVATED"],
    nextGate: "HASH_FINAL_SPEC_BYTES_AND_IMPLEMENT_MAINTAINER_PINNED_TRANSMITTER_SUBJECT_AND_DELIVERY_VERIFIER",
  }),
  entry({
    id: "OSHA_FEDERAL_SEVERE_INJURY_2024",
    sourceClass: "MANDATORY_FEDERAL_JURISDICTION_SEVERE_WORKPLACE_INJURY_REPORTS",
    officialUrl: "https://www.osha.gov/sites/default/files/2024_Annual_Report_of_Fed_OSHA_SIRs.pdf",
    sourceLocator: { kind: "OFFICIAL_ANNUAL_REPORT_OBSERVATION",
      value: "CALENDAR_2024", observedAt: REVIEWED_AT,
      stable: false, contentHashEstablished: false,
      underlyingDatasetContinuouslyUpdated: true },
    denominator: { unit: "SEVERE_INJURY_REPORTS_SUBMITTED_TO_FEDERAL_OSHA",
      count: 9_034, inpatientHospitalizations: 7_327, amputations: 2_426,
      eyeLosses: 2, categoriesMayOverlap: true,
      approximateShareOfUsWorkersCovered: 0.5, coverageApproximate: true },
    publisherLimitations: ["FEDERAL_OSHA_JURISDICTION_ONLY",
      "STATE_PLAN_JURISDICTIONS_EXCLUDED", "FATALITIES_AND_CATASTROPHES_EXCLUDED",
      "REPORTING_THRESHOLD_LIMITED_TO_HOSPITALIZATION_AMPUTATION_OR_EYE_LOSS",
      "EMPLOYER_REPORTED_NOT_INDEPENDENT_CAUSAL_ADJUDICATION",
      "NO_ROBOT_SPECIFIC_EXPOSURE_DENOMINATOR"],
    rightsAndPrivacy: { codeLicense: null, reportTextRightsResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false,
      aggregateOnlyUntilPrivacyAndRightsReview: true },
    candidateUse: "WORKER_HARM_MACHINE_INVOLVEMENT_AND_REPORTING_DUTY_TAXONOMY_ONLY",
    channelHypotheses: ["WORKER_HARM", "HOSPITALIZATION", "AMPUTATION",
      "EYE_LOSS", "MACHINE_OR_ROBOT_INVOLVEMENT", "EMPLOYER_REPORT"],
    nextGate: "HASH_ANNUAL_PDF_AND_FROZEN_DATA_EXPORT_THEN_DEFINE_PRIVACY_MINIMIZED_ROBOT_OIICS_FILTER",
  }),
  entry({
    id: "REBOOT26_SAMPLE_RECOVERY_DEMONSTRATION",
    sourceClass: "REAL_ROBOT_OFF_NOMINAL_AND_RECOVERY_SAMPLE",
    officialUrl: "https://huggingface.co/datasets/REBOOT26/sample_recovery-demonstration",
    sourceLocator: { kind: "HUGGING_FACE_DATASET_COMMIT",
      value: "0633573d0438be1185bddebdf1a2c8f5505f7b2a",
      projectUrl: "https://nanayawoa.github.io/REBOOT/" },
    denominator: { unit: "SAMPLE_EPISODES", count: 60, episodeIndexFirst: 0,
      episodeIndexLast: 59, sampleFrameRowsClaimed: 53_886,
      publisherDisplayedApproximateBytes: 2_840_000_000,
      fullProjectClaimedTrajectories: 2_160, fullProjectClaimedTasks: 18 },
    publisherLimitations: ["SAMPLE_NOT_FULL_38_REPOSITORY_PROJECT",
      "OFF_NOMINAL_AND_RECOVERY_PHASE_LABELS_NOT_CAUSAL_ADJUDICATION",
      "NO_CROSS_HARDWARE_TRANSFER", "NO_RESPONSIBILITY_CLOSURE"],
    rightsAndPrivacy: { projectPageLicenseClaim: "CC-BY-4.0",
      datasetCardLicenseClaim: "Apache-2.0", licenseConflictResolved: false,
      sourceUrlOnlyProjection: true, personalDataReviewComplete: false,
      rgbdPrivacyReviewRequired: true },
    candidateUse: "METADATA_SCHEMA_AND_FAILURE_RECOVERY_BOUNDARY_ONLY",
    channelHypotheses: ["OFF_NOMINAL_STATE", "RECOVERY_ATTEMPT",
      "RECOVERY_DEMONSTRATION", "ROBOT_TELEMETRY", "TASK_PHASE"],
    nextGate: "REPLAY_60_EPISODE_MANIFEST_RESOLVE_LICENSE_CONFLICT_AND_SCAN_RGBD_PRIVACY",
  }),
], (left, right) => left.id < right.id ? -1 : 1));

function findById(records, id) {
  for (let index = 0; index < records.length; index += 1) {
    if (records[index].id === id) return records[index];
  }
  return null;
}

function body() {
  return {
    schema: REALITY_SOURCE_SCOUT_SCHEMA,
    reviewedAt: REVIEWED_AT,
    reviewMode: "OFFICIAL_SOURCE_METADATA_ONLY_NO_PAYLOAD_DOWNLOAD_OR_SOURCE_REPLAY",
    sources: StructuredClone(SOURCES),
    accounting: { sources: SOURCES.length, payloadsDownloaded: 0,
      sourceBytesReplayed: 0, admittedTrainingRows: 0,
      causalExperienceUnits: 0, authorityGrants: 0 },
    northStarBoundary: {
      mayExpandFailureAndConsequenceVocabulary: true,
      mayExpandEvidenceOrResponsibilityCoverageClaims: false,
      mayExpandAuthority: false,
      mayEstablishCausalityOrPrevalence: false,
      mayCloseObligation: false,
      actionReady: false,
    },
  };
}

export function buildRealitySourceScout() {
  const value = body();
  return deepFreeze({ ...value,
    catalogHash: digest(REALITY_SOURCE_SCOUT_SCHEMA, value) });
}

export function verifyRealitySourceScout(record) {
  try {
    if (!record || typeof record !== "object" || ArrayIsArray(record)) {
      return { ok: false, error: "REALITY_SOURCE_SCOUT_INVALID" };
    }
    const actualCanonical = canonicalizeStrict(record);
    const expected = buildRealitySourceScout();
    if (!RegExpTest(HASH, record.catalogHash ?? "")
      || actualCanonical !== canonicalizeStrict(expected)) {
      return { ok: false, error: "REALITY_SOURCE_SCOUT_INVALID" };
    }
    return { ok: true, catalogHash: expected.catalogHash,
      authorityEstablished: false, actionReady: false };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message
      : "REALITY_SOURCE_SCOUT_INVALID" };
  }
}

export function listRealitySourceCandidates() {
  const ids = [];
  for (let index = 0; index < SOURCES.length; index += 1) ids[index] = SOURCES[index].id;
  return ids;
}

export function realitySourceCandidate(id) {
  const found = findById(SOURCES, id);
  if (!found) throw new Error("REALITY_SOURCE_SCOUT_SOURCE_UNKNOWN");
  return deepFreeze(StructuredClone(found));
}

export function buildRealitySourceReviewProjection(id) {
  const record = realitySourceCandidate(id);
  const body = {
    schema: REALITY_SOURCE_REVIEW_SCHEMA,
    catalogHash: buildRealitySourceScout().catalogHash,
    sourceId: record.id,
    sourceClass: record.sourceClass,
    sourceLocator: record.sourceLocator,
    candidateUse: record.candidateUse,
    channelHypotheses: record.channelHypotheses,
    requiredHoldGates: [record.nextGate, "SOURCE_BYTES_NOT_REPLAYED",
      "RIGHTS_PRIVACY_NOT_ADMITTED", "NO_PROSPECTIVE_TARGET_DENOMINATOR",
      "NO_EXTERNAL_AUTHORITY_OR_OWNER_ADOPTION"],
    interpretation: "SOURCE_DISCOVERY_REVIEW_ONLY_NOT_EVIDENCE_COVERAGE",
    sourceTruthEstablished: false,
    evidenceCoverageEstablished: false,
    responsibilityCoverageEstablished: false,
    causalityEstablished: false,
    authorityEstablished: false,
    actionReady: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
  };
  return deepFreeze({ ...body,
    projectionHash: digest(REALITY_SOURCE_REVIEW_SCHEMA, body) });
}

export function verifyRealitySourceReviewProjection(record) {
  try {
    if (!record || typeof record !== "object" || ArrayIsArray(record)) {
      return { ok: false, error: "REALITY_SOURCE_REVIEW_INVALID" };
    }
    const actualCanonical = canonicalizeStrict(record);
    if (typeof record.sourceId !== "string"
      || !RegExpTest(HASH, record.projectionHash ?? "")) {
      return { ok: false, error: "REALITY_SOURCE_REVIEW_INVALID" };
    }
    const expected = buildRealitySourceReviewProjection(record.sourceId);
    if (actualCanonical !== canonicalizeStrict(expected)) {
      return { ok: false, error: "REALITY_SOURCE_REVIEW_INVALID" };
    }
    return { ok: true, projectionHash: expected.projectionHash,
      authorityEstablished: false, actionReady: false };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message
      : "REALITY_SOURCE_REVIEW_INVALID" };
  }
}
