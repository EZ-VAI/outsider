/*
 * California DMV autonomous-vehicle outcome/exposure sensing.
 *
 * DMV-hosted collision forms are manufacturer submissions.  Hosting makes
 * them real regulatory records, but does not turn them into independent
 * observation, causal findings, adjudicated loss, or a complete sampling
 * frame.  The old annual disengagement regime and the 2026 CSV regime are
 * also kept separate.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const CA_DMV_AV_OUTCOME_SENSING_SCHEMA = "outsider/ca-dmv-av-outcome-sensing/v1";
const FROZEN_AT = "2026-08-21T10:30:00.000Z";

export const CA_DMV_AV_FROZEN_SOURCE_20260821 = Object.freeze({
  sourceId: "CALIFORNIA_DMV_AV_OUTCOME_EXPOSURE_AND_REGIME_SNAPSHOT_20260821",
  frozenAt: FROZEN_AT,
  files: Object.freeze([
    Object.freeze({ name: "permit-holders-20260821.html", kind: "PERMIT_SNAPSHOT",
      url: "https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/autonomous-vehicle-testing-permit-holders/",
      bytes: 90_872, sha256: "sha256:c7f4f42359445bbf98a9cd29965125a8790199d9f3b1218aa21b2111d6bbf1c1" }),
    Object.freeze({ name: "regulations-20260821.html", kind: "REGULATIONS_INDEX",
      url: "https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/california-autonomous-vehicle-regulations/",
      bytes: 91_302, sha256: "sha256:bfa3aca6256b095cbcac8c929cb9f00cab78e1c54c3d7aaf62d31bdd2929d0ff" }),
    Object.freeze({ name: "incident-reporting-20260821.html", kind: "INCIDENT_REPORTING_INDEX",
      url: "https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/autonomous-vehicles-incident-reporting/",
      bytes: 79_070, sha256: "sha256:06a4a60f27ee51c9d8260c1107adf01f18c780cec28cc66ab31cfcd909faf2ef" }),
    Object.freeze({ name: "permit-resources-20260821.html", kind: "REPORTING_RESOURCE_INDEX",
      url: "https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/autonomous-vehicles-program-permit-resources/",
      bytes: 81_537, sha256: "sha256:c9e6b44d0e409f9facac3ffd80ff3a837e5131e858800b8a56222c38f0422773" }),
    Object.freeze({ name: "annual-mileage-2023.html", kind: "LEGACY_EXPOSURE_RELEASE_EXACT",
      url: "https://www.dmv.ca.gov/portal/news-and-media/news-releases/autonomous-vehicle-permit-holders-report-a-record-9-million-test-miles-in-california-in-12-months/",
      bytes: 75_087, sha256: "sha256:6577c41b71d11a4d9e5ca0e92ebad1a62898a936c226da4699280a6e097ec7da" }),
    Object.freeze({ name: "annual-mileage-2024.html", kind: "LEGACY_EXPOSURE_RELEASE_EXACT",
      url: "https://www.dmv.ca.gov/portal/news-and-media/over-4-million-test-miles-logged-by-autonomous-vehicle-permit-holders-in-california/",
      bytes: 73_358, sha256: "sha256:fd1c54f8ad614e4e284acf7772b5ce771f5e099c6ff5ff44e0c473cd05796e8e" }),
    Object.freeze({ name: "annual-mileage-2025.html", kind: "LEGACY_EXPOSURE_RELEASE_LOWER_BOUND",
      url: "https://www.dmv.ca.gov/portal/news-and-media/autonomous-vehicle-permit-holders-in-california-logged-more-than-9-million-test-miles-between-december-1-2024-and-november-30-2025/",
      bytes: 88_035, sha256: "sha256:1dfe314f08d5e26687c6f2cb3534ac923ad4677092e8d71fc4712e9f38386b33" }),
    Object.freeze({ name: "avim-2026-001.pdf", kind: "NEW_REGIME_MEMO",
      url: "https://www.dmv.ca.gov/portal/file/avim-2026-001-reporting-requirements-pdf/",
      bytes: 221_264, sha256: "sha256:e10b48066ce9bdf918894f836517149b99c8af39b619b253ff5b812324f91943" }),
    Object.freeze({ name: "collision-reporting-template.pdf", kind: "NEW_REGIME_COLLISION_TEMPLATE",
      url: "https://www.dmv.ca.gov/portal/file/collision-reporting-template-pdf/",
      bytes: 250_462, sha256: "sha256:3532bbc2baf8aa581bc3b1f6829840943375bba7aebf65c5d1a5870c868de989" }),
    Object.freeze({ name: "vmt-reporting-template.pdf", kind: "NEW_REGIME_VMT_TEMPLATE",
      url: "https://www.dmv.ca.gov/portal/file/vehicles-miles-traveled-reporting-template-pdf/",
      bytes: 146_013, sha256: "sha256:484dc2d3bf3538bbc5bd70290db908c55afcf56154de129e5ffcea319ad05e47" }),
    Object.freeze({ name: "case-waymo-2025-05-14.pdf", kind: "LEGACY_COLLISION_FORM_CASE",
      url: "https://www.dmv.ca.gov/portal/file/waymo_05142025-pdf/",
      bytes: 672_031, sha256: "sha256:936029b843083a7081d29a5b35191f0ca2a0b0a92b5f135b76de6f51a2de2b9c",
      reportingEntity: "WAYMO_LLC", reportMonth: "2025-05" }),
    Object.freeze({ name: "case-nuro-2026-04-03.pdf", kind: "LEGACY_COLLISION_FORM_CASE",
      url: "https://www.dmv.ca.gov/portal/file/nuro_040326-pdf/",
      bytes: 793_505, sha256: "sha256:b2def9f994f78f545015fe0b2c8e794bdc192075348f923297621a93159655c7",
      reportingEntity: "NURO_INC", reportMonth: "2026-04" }),
    Object.freeze({ name: "case-zoox-2022-03-29.pdf", kind: "LEGACY_COLLISION_FORM_CASE",
      url: "https://www.dmv.ca.gov/portal/file/zoox_032922-pdf",
      bytes: 513_422, sha256: "sha256:fd05b90d231337e78dbd8410f7dc2addf367afc452783fa11ec7961c95db7993",
      reportingEntity: "ZOOX_INC", reportMonth: "2022-03" }),
    Object.freeze({ name: "case-mercedes-2023-05-30.pdf", kind: "LEGACY_COLLISION_FORM_CASE",
      url: "https://www.dmv.ca.gov/portal/file/mercedes-benz_053023-pdf/",
      bytes: 511_721, sha256: "sha256:ccd169e6d2f92e8ba939a4e8ee2d20d91fb98f49b7788df27ea309fe6c5c7c29",
      reportingEntity: "MERCEDES_BENZ_RESEARCH_AND_DEVELOPMENT_NORTH_AMERICA",
      reportMonth: "2023-05" }),
  ]),
});

const EXPECTED_NAMES = Object.freeze(CA_DMV_AV_FROZEN_SOURCE_20260821.files.map((file) => file.name));
const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function digest(value) { return sha256(canonicalizeStrict(value)); }
function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function canonicalTime(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${code}_INVALID`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${code}_NON_CANONICAL`);
  return normalized;
}

function stableReadSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || !sourceDirectory.trim()) {
    throw new Error("CA_DMV_AV_SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) throw new Error("CA_DMV_AV_SOURCE_DIRECTORY_TOO_BROAD");
  const directoryStat = lstatSync(directory, { bigint: true });
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("CA_DMV_AV_SOURCE_DIRECTORY_UNSAFE");
  }
  if (canonicalizeStrict(readdirSync(directory).sort())
    !== canonicalizeStrict([...EXPECTED_NAMES].sort())) {
    throw new Error("CA_DMV_AV_SOURCE_DIRECTORY_PROFILE_MISMATCH");
  }
  const files = {};
  for (const name of EXPECTED_NAMES) {
    const target = path.join(directory, name);
    const pathBefore = lstatSync(target, { bigint: true });
    if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
      || pathBefore.size <= 0n || pathBefore.size > BigInt(MAX_FILE_BYTES)) {
      throw new Error(`CA_DMV_AV_SOURCE_FILE_UNSAFE:${name}`);
    }
    const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const before = fstatSync(fd, { bigint: true });
      const bytes = readFileSync(fd);
      const after = fstatSync(fd, { bigint: true });
      const pathAfter = lstatSync(target, { bigint: true });
      for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
        if (before[field] !== after[field] || before[field] !== pathBefore[field]
          || before[field] !== pathAfter[field]) {
          throw new Error(`CA_DMV_AV_SOURCE_FILE_CHANGED_DURING_READ:${name}`);
        }
      }
      if (BigInt(bytes.length) !== before.size) throw new Error(`CA_DMV_AV_SOURCE_FILE_SHORT_READ:${name}`);
      files[name] = bytes;
    } finally { closeSync(fd); }
  }
  return files;
}

function officialProfile(files) {
  return CA_DMV_AV_FROZEN_SOURCE_20260821.files.every((expected) => {
    const bytes = files[expected.name];
    return Buffer.isBuffer(bytes) && bytes.length === expected.bytes && sha256(bytes) === expected.sha256;
  });
}

function requireOfficialTextBoundaries(files, official) {
  if (!official) return;
  const permit = files["permit-holders-20260821.html"].toString("utf8");
  const mileage2023 = files["annual-mileage-2023.html"].toString("utf8");
  const mileage2024 = files["annual-mileage-2024.html"].toString("utf8");
  const mileage2025 = files["annual-mileage-2025.html"].toString("utf8");
  const incident = files["incident-reporting-20260821.html"].toString("utf8");
  const resources = files["permit-resources-20260821.html"].toString("utf8");
  const requirements = [
    [permit, "As of August 12, 2026"], [permit, "Updated April 3 2026"],
    [permit, "As of November 21, 2025"], [mileage2023, "9,068,861 miles"],
    [mileage2023, "5,801,069 miles"], [mileage2023, "3,267,792 miles"],
    [mileage2023, "not intended to compare one company with another"],
    [mileage2024, "4,498,066 miles"], [mileage2024, "3,945,171 miles"],
    [mileage2024, "552,895 miles"],
    [mileage2024, "not designed for comparative analysis across different companies"],
    [mileage2025, "more than 9 million miles"],
    [mileage2025, "not designed for comparative analysis across companies"],
    [mileage2025, "Disengagement reporting is not required for AV operations conducted under deployment permits"],
    [incident, "Find collision reports from manufacturers"],
    [resources, "Collision Reporting Template"], [resources, "Vehicles Miles Traveled Reporting Template"],
  ];
  if (requirements.some(([document, phrase]) => !document.includes(phrase))) {
    throw new Error("CA_DMV_AV_OFFICIAL_TEXT_BOUNDARY_MISSING");
  }
  const driveredStart = permit.indexOf("A manufacturer with a permit to test with a safety driver");
  const driverlessStart = permit.indexOf("Permit Holders (Driverless Testing)", driveredStart);
  const deploymentStart = permit.indexOf("Permit Holders (Deployment)", driverlessStart);
  const permitEnd = permit.indexOf("Need something else?", deploymentStart);
  if (driveredStart < 0 || driverlessStart < 0 || deploymentStart < 0 || permitEnd < 0) {
    throw new Error("CA_DMV_AV_PERMIT_SECTION_BOUNDARY_INVALID");
  }
  const driveredSection = permit.slice(driveredStart, driverlessStart);
  const driverlessSection = permit.slice(driverlessStart, deploymentStart);
  const deploymentSection = permit.slice(deploymentStart, permitEnd);
  const expectedDrivered = [
    "AIMOTIVE INC.", "AUDI OF AMERICA", "AURORA OPERATIONS, INC.", "AutoMo USA LLC",
    "BLACK SESAME TECHNOLOGIES INC.", "GATIK AI INC.", "HELM.AI INC.", "IMAGRY INC.",
    "KODIAK AI", "MAY MOBILITY", "MERCEDES-BENZ RESEARCH &amp; DEVELOPMENT NORTH AMERICA",
    "MOIA America", "MOTIONAL", "NISSAN", "NURO, INC.", "NVIDIA CORPORATION",
    "OHMIO INC.", "PLUSAI, INC.", "PONY.AI", "QUALCOMM TECHNOLOGIES, INC.",
    "TELENAV, INC.", "TENSOR AUTO INC.", "TESLA ROBOTAXI LLC",
    "VUERON TECHNOLOGY USA, INC.", "WAYMO LLC", "WeRide AI", "WOVEN BY TOYOTA",
    "ZOOX INC.",
  ];
  const expectedDriverless = [
    "AutoMo USA LLC", "Nuro<br>", "Tensor Auto Inc.",
    "Waymo LLC (Approved Locations, Time of Day Operations, Approved ODD Characteristics)",
    "WeRide AI", "Zoox Inc.",
  ];
  const expectedDeployment = [
    "Mercedes-Benz Research &amp; Development North America", "Nuro Inc.",
    "Waymo LLC (Approved Locations, Time of Day Operations, Approved ODD Characteristics)",
  ];
  if ((driveredSection.match(/<li>/gu) ?? []).length !== expectedDrivered.length
    || (driverlessSection.match(/<tr>/gu) ?? []).length !== expectedDriverless.length + 1
    || (deploymentSection.match(/<tr>/gu) ?? []).length !== expectedDeployment.length + 1
    || expectedDrivered.some((fragment) => !driveredSection.includes(fragment))
    || expectedDriverless.some((fragment) => !driverlessSection.includes(fragment))
    || expectedDeployment.some((fragment) => !deploymentSection.includes(fragment))) {
    throw new Error("CA_DMV_AV_PERMIT_TRANSCRIPTION_SOURCE_MISMATCH");
  }
  for (const name of ["avim-2026-001.pdf", "collision-reporting-template.pdf",
    "vmt-reporting-template.pdf", "case-waymo-2025-05-14.pdf", "case-nuro-2026-04-03.pdf",
    "case-zoox-2022-03-29.pdf", "case-mercedes-2023-05-30.pdf"]) {
    if (!files[name].subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error(`CA_DMV_AV_PDF_MAGIC_INVALID:${name}`);
    }
  }
}

const DRIVERED_PERMIT_HOLDERS = Object.freeze([
  "AIMOTIVE_INC", "AUDI_OF_AMERICA", "AURORA_OPERATIONS_INC", "AUTOMO_USA_LLC",
  "BLACK_SESAME_TECHNOLOGIES_INC", "GATIK_AI_INC", "HELM_AI_INC", "IMAGRY_INC",
  "KODIAK_AI", "MAY_MOBILITY", "MERCEDES_BENZ_RESEARCH_AND_DEVELOPMENT_NORTH_AMERICA",
  "MOIA_AMERICA", "MOTIONAL", "NISSAN", "NURO_INC", "NVIDIA_CORPORATION", "OHMIO_INC",
  "PLUSAI_INC", "PONY_AI", "QUALCOMM_TECHNOLOGIES_INC", "TELENAV_INC", "TENSOR_AUTO_INC",
  "TESLA_ROBOTAXI_LLC", "VUERON_TECHNOLOGY_USA_INC", "WAYMO_LLC", "WERIDE_AI",
  "WOVEN_BY_TOYOTA", "ZOOX_INC",
]);
const DRIVERLESS_PERMIT_HOLDERS = Object.freeze([
  "AUTOMO_USA_LLC", "NURO", "TENSOR_AUTO_INC", "WAYMO_LLC", "WERIDE_AI", "ZOOX_INC",
]);
const DEPLOYMENT_PERMIT_HOLDERS = Object.freeze([
  "MERCEDES_BENZ_RESEARCH_AND_DEVELOPMENT_NORTH_AMERICA", "NURO_INC", "WAYMO_LLC",
]);

function sourceProjection(files, official) {
  return {
    sourceId: official ? CA_DMV_AV_FROZEN_SOURCE_20260821.sourceId : "CALLER_PROVIDED_CA_DMV_SHAPED_FIXTURE",
    publisher: official ? "CALIFORNIA_DEPARTMENT_OF_MOTOR_VEHICLES" : null,
    sourceReality: official ? "REAL_STATE_REGULATORY_DOCUMENTS_AND_MANUFACTURER_SUBMISSIONS" : "FIXTURE_BYTES",
    profileMatchedAtBuild: official,
    capturedAt: official ? FROZEN_AT : null,
    files: EXPECTED_NAMES.map((name) => {
      const expected = CA_DMV_AV_FROZEN_SOURCE_20260821.files.find((file) => file.name === name);
      return { name, kind: expected.kind, bytes: files[name].length, sha256: sha256(files[name]) };
    }),
  };
}

export function buildCaDmvAvOutcomeSensingFromBytes(files, options = {}) {
  if (!exactKeys(files, EXPECTED_NAMES) || !exactKeys(options,
    Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("CA_DMV_AV_BUILD_ARGUMENTS_INVALID");
  }
  for (const name of EXPECTED_NAMES) {
    if (!Buffer.isBuffer(files[name]) || files[name].length <= 0 || files[name].length > MAX_FILE_BYTES) {
      throw new Error(`CA_DMV_AV_SOURCE_BYTES_INVALID:${name}`);
    }
  }
  const generatedAt = canonicalTime(options.generatedAt ?? FROZEN_AT, "CA_DMV_AV_GENERATED_AT");
  const official = officialProfile(files);
  requireOfficialTextBoundaries(files, official);
  const caseSources = CA_DMV_AV_FROZEN_SOURCE_20260821.files.filter((file) => file.kind === "LEGACY_COLLISION_FORM_CASE");
  const artifactWithoutHash = {
    schema: CA_DMV_AV_OUTCOME_SENSING_SCHEMA,
    generatedAt,
    source: sourceProjection(files, official),
    ontology: {
      sourceEnvironmentIsReal: official,
      collisionDocumentUnit: "MANUFACTURER_SUBMITTED_COLLISION_REPORT_HOSTED_BY_CA_DMV",
      collisionDocumentIsIndependentlyObservedOutcome: false,
      collisionDocumentEstablishesCausality: false,
      collisionDocumentEstablishesAdjudicatedLoss: false,
      permitIsExposure: false,
      aggregateMilesAreCaseMatchedExposure: false,
      researchOrShadowIsUseBoundaryNotSourceReality: true,
    },
    regimeRoots: {
      legacyAnnualDisengagement: {
        regimeId: "CA_DMV_LEGACY_ANNUAL_DISENGAGEMENT_REPORTING",
        reportedCoverage: "PUBLIC_ROAD_TESTING_ONLY",
        excludes: ["PRIVATE_ROADS", "OUT_OF_STATE", "BELOW_SAE_LEVEL_3", "SIMULATION", "DEPLOYMENT_DISENGAGEMENTS"],
        companyComparisonPermitted: false,
      },
      enhanced2026: {
        regimeId: "CA_DMV_2026_ENHANCED_CSV_REPORTING_REVISION_12_2025",
        effectiveAt: "2026-04-28",
        collisionReportingBeganImmediately: true,
        monthlyReportingBegins: "2026-08-26",
        firstQuarterlyReportDue: "2026-09-30",
        snapshotDate: "2026-08-21",
        firstMonthlyDueReachedAtSnapshot: false,
        firstQuarterlyDueReachedAtSnapshot: false,
        observedMonthlyCsvRows: 0,
        observedQuarterlyCsvRows: 0,
        noObservationFabricatedBeforeDueDate: true,
        memoProjectionMethod: "HUMAN_REVIEWED_TRANSCRIPTION_BOUND_TO_EXACT_OFFICIAL_PDF_BYTES",
      },
      crossRegimePoolingPermitted: false,
    },
    permitSnapshot: {
      drivered: { asOf: "2026-08-12", count: official ? DRIVERED_PERMIT_HOLDERS.length : 0,
        holders: official ? [...DRIVERED_PERMIT_HOLDERS] : [] },
      driverless: { updatedAt: "2026-04-03", count: official ? DRIVERLESS_PERMIT_HOLDERS.length : 0,
        holders: official ? [...DRIVERLESS_PERMIT_HOLDERS] : [] },
      deployment: { asOf: "2025-11-21", count: official ? DEPLOYMENT_PERMIT_HOLDERS.length : 0,
        holders: official ? [...DEPLOYMENT_PERMIT_HOLDERS] : [] },
      unit: "AUTHORIZED_ENTITY_SNAPSHOT_NOT_ACTIVE_VEHICLE_OR_MILE_DENOMINATOR",
      projectionMethod: "HUMAN_REVIEWED_TRANSCRIPTION_WITH_EACH_HOLDER_FRAGMENT_AND_TABLE_ROW_COUNT_MECHANICALLY_CHECKED_AGAINST_PINNED_HTML",
      publisherHtmlSemanticsIndependentlyAdjudicated: false,
    },
    exposureEvidence: {
      legacy2022_12_01Through2023_11_30: {
        exactTotalAutonomousPublicRoadTestMiles: official ? 9_068_861 : null,
        safetyDriverMiles: official ? 5_801_069 : null,
        driverlessTestingMiles: official ? 3_267_792 : null,
        internallyAddsToTotal: official,
        deploymentMilesIncluded: false,
      },
      legacy2023_12_01Through2024_11_30: {
        exactTotalAutonomousPublicRoadTestMiles: official ? 4_498_066 : null,
        safetyDriverMiles: official ? 3_945_171 : null,
        driverlessTestingMiles: official ? 552_895 : null,
        internallyAddsToTotal: official,
        deploymentMilesIncluded: false,
      },
      legacy2024_12_01Through2025_11_30: {
        reportedExclusiveLowerBoundMiles: official ? 9_000_000 : null,
        exactTotalPublishedInPinnedRelease: false,
        phrase: official ? "MORE_THAN_9_MILLION" : null,
      },
      exposureCohortsPooled: false,
      exposurePairedToCollisionSample: false,
      disengagementRateCalculated: false,
      collisionRateCalculated: false,
    },
    collisionCases: {
      sampleFrame: "CURATOR_FIXED_NONPROBABILITY_SAMPLE_OF_FOUR_OFFICIAL_DMV_HOSTED_PDFS",
      officialCompleteManifestAvailableInPinnedSources: false,
      cases: official ? caseSources.map((file) => ({
        caseFingerprint: digest({ domain: "outsider.ca-dmv-av.case.v1", sha256: file.sha256 }),
        reportingEntity: file.reportingEntity,
        reportMonth: file.reportMonth,
        formRevision: "OL_316_REV_7_2020",
        recordStatus: "MANUFACTURER_SUBMITTED_COLLISION_REPORT",
        hostedByCaDmv: true,
        independentlyObserved: false,
        causalityAdjudicated: false,
        lossAmountObserved: false,
        injurySeverityProjected: false,
        narrativeProjected: false,
        exactLocationProjected: false,
        personOrVehicleIdentifiersProjected: false,
      })) : [],
      sampleSupportsPopulationFrequency: false,
      sampleSupportsManufacturerComparison: false,
      caseDetailsQuarantinedWithoutNeutralMachineParser: true,
    },
    newRegimeTemplates: {
      collision: {
        revision: "12/2025_REGS", dataRowsObserved: 0,
        selectedFieldRoots: ["REPORT_ID", "REPORT_VERSION", "REPORTING_ENTITY", "REPORT_TYPE",
          "VIN", "AUTOMATION_SYSTEM_ENGAGED", "SOURCE_FLAGS", "INCIDENT_DATE",
          "HIGHEST_INJURY_SEVERITY", "DATA_AVAILABILITY", "WITHIN_ODD", "NARRATIVE_CBI"],
      },
      vehicleMilesTraveled: {
        revision: "12/2025_REGS", dataRowsObserved: 0,
        selectedFieldRoots: ["SUBMISSION_DATE", "PERMIT_TYPE", "VIN", "REPORTING_RANGE", "MILEAGE"],
        privatelyOwnedNoncommercialVinMayBeOmitted: true,
      },
      schemasAreRequirementsNotObservations: true,
    },
    missingnessAndBias: {
      manufacturerReportedCases: true,
      independentObservationAbsent: true,
      completeOfficialCollisionManifestAbsent: true,
      collisionReportRevisionAndDuplicateHandlingNotPossibleWithoutFutureManifest: true,
      legacyExposureExcludesMaterialOperatingContexts: true,
      deploymentExposureNotPaired: true,
      currentPermitDoesNotProveActiveOperation: true,
      reportingRegimeShiftBreaksNaiveTimeSeries: true,
      noCausalFrequencySeverityOrCompanyRankPermitted: true,
    },
    privacy: {
      rawOfficialPdfsMayContainPersonVehicleAndLocationFields: true,
      rawPdfsRepublishedInArtifact: false,
      narrativeProjected: false,
      exactLocationProjected: false,
      namesAddressesPhonesProjected: false,
      vinOrPlateProjected: false,
      organizationNamesRetainedAsPublicRegulatedEntities: true,
    },
    rights: {
      officialPublicAccessObserved: official,
      exactOfficialBytesReplayedAtBuild: official,
      rawRedistributionRightConcluded: false,
      commercialUseRightConcluded: false,
      automaticTrainingRightConcluded: false,
      legalConclusionMade: false,
      allowedUse: official ? ["DESCRIPTIVE_SOURCE_REPLAY", "SHADOW_OUTCOME_AND_EXPOSURE_SENSING"] : [],
    },
    stageProgress: {
      stage1_5: { evidenceGained: official ? ["REAL_MANUFACTURER_SUBMITTED_COLLISION_RECORDS",
          "REGIME_AWARE_OUTCOME_SCHEMA"] : [], externalReadinessGapClosed: false },
      stage2: { evidenceGained: official ? ["REAL_AGGREGATE_PUBLIC_ROAD_TEST_MILES",
          "PERMIT_AND_ODD_CORRELATION_ROOTS"] : [], externalReadinessGapClosed: false },
      rateCalibrationAdmitted: false, causalCalibrationAdmitted: false,
      lossCalibrationAdmitted: false, productionReadiness: false,
    },
    snapshotDiffNextActions: [
      { notBefore: "2026-08-26", action: "DISCOVER_AND_PIN_FIRST_OFFICIAL_MONTHLY_CSV_IF_PUBLISHED",
        requiredBeforeAdmission: ["OFFICIAL_MANIFEST", "SCHEMA_HASH", "REPORT_ID_VERSION_DEDUP", "LATE_AND_REVISION_POLICY"] },
      { notBefore: "2026-09-30", action: "DISCOVER_AND_PIN_FIRST_OFFICIAL_QUARTERLY_CSV_IF_PUBLISHED",
        requiredBeforeAdmission: ["PERMIT_TYPE_COHORT", "VMT_DENOMINATOR_SCOPE", "REVISION_CHAIN", "MISSINGNESS"] },
      { notBefore: null, action: "OBTAIN_OFFICIAL_COLLISION_DOCUMENT_MANIFEST_OR_KEEP_NONPROBABILITY_BOUNDARY",
        requiredBeforeAdmission: ["COMPLETE_FRAME", "REPORT_VERSION", "DUPLICATE_LINKAGE", "WITHDRAWAL_OR_CORRECTION_STATUS"] },
    ],
    authority: { PRICE: false, GUARANTEE: false, SETTLE: false, TRAIN: false,
      CLOSE: false, EXECUTE: false },
    admission: official ? "ADMIT_CA_DMV_AV_REGIME_AWARE_SHADOW_SENSING_ONLY"
      : "ABSTAIN_CALLER_PROVIDED_FIXTURE",
  };
  return Object.freeze({ ...artifactWithoutHash, artifactHash: digest(artifactWithoutHash) });
}

export function buildCaDmvAvOutcomeSensingFromSourceDirectory(sourceDirectory, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("CA_DMV_AV_SOURCE_BUILD_OPTIONS_INVALID");
  }
  return buildCaDmvAvOutcomeSensingFromBytes(stableReadSourceDirectory(sourceDirectory), options);
}

function structuralErrors(artifact) {
  const errors = [];
  const keys = ["schema", "generatedAt", "source", "ontology", "regimeRoots", "permitSnapshot",
    "exposureEvidence", "collisionCases", "newRegimeTemplates", "missingnessAndBias", "privacy",
    "rights", "stageProgress", "snapshotDiffNextActions", "authority", "admission", "artifactHash"];
  if (!exactKeys(artifact, keys)) return ["SCHEMA_KEYS_INVALID"];
  if (artifact.schema !== CA_DMV_AV_OUTCOME_SENSING_SCHEMA) errors.push("SCHEMA_INVALID");
  try { canonicalTime(artifact.generatedAt, "CA_DMV_AV_GENERATED_AT"); } catch { errors.push("GENERATED_AT_INVALID"); }
  if (!HASH.test(artifact.artifactHash)) errors.push("ARTIFACT_HASH_FORMAT_INVALID");
  else {
    const { artifactHash, ...withoutHash } = artifact;
    if (digest(withoutHash) !== artifactHash) errors.push("ARTIFACT_HASH_MISMATCH");
  }
  if (!exactKeys(artifact.authority, ["PRICE", "GUARANTEE", "SETTLE", "TRAIN", "CLOSE", "EXECUTE"])
    || Object.values(artifact.authority).some((value) => value !== false)) errors.push("AUTHORITY_INVALID");
  if (artifact.ontology?.collisionDocumentIsIndependentlyObservedOutcome !== false
    || artifact.ontology?.collisionDocumentEstablishesCausality !== false
    || artifact.ontology?.collisionDocumentEstablishesAdjudicatedLoss !== false
    || artifact.ontology?.permitIsExposure !== false
    || artifact.ontology?.aggregateMilesAreCaseMatchedExposure !== false) errors.push("ONTOLOGY_BOUNDARY_INVALID");
  if (artifact.regimeRoots?.crossRegimePoolingPermitted !== false
    || artifact.exposureEvidence?.collisionRateCalculated !== false
    || artifact.exposureEvidence?.disengagementRateCalculated !== false) errors.push("UNIT_POOLING_BOUNDARY_INVALID");
  if (artifact.stageProgress?.rateCalibrationAdmitted !== false
    || artifact.stageProgress?.causalCalibrationAdmitted !== false
    || artifact.stageProgress?.lossCalibrationAdmitted !== false
    || artifact.stageProgress?.productionReadiness !== false) errors.push("READINESS_BOUNDARY_INVALID");
  if (artifact.rights?.rawRedistributionRightConcluded !== false
    || artifact.rights?.automaticTrainingRightConcluded !== false
    || artifact.rights?.legalConclusionMade !== false) errors.push("RIGHTS_BOUNDARY_INVALID");
  return errors;
}

export function verifyCaDmvAvOutcomeSensing(artifact) {
  const errors = structuralErrors(artifact);
  return { ok: errors.length === 0, verificationLevel: "STRUCTURE_ONLY",
    sourceArtifactsReverified: false, decision: null,
    artifactHash: errors.length === 0 ? artifact.artifactHash : null, errors };
}

export function verifyCaDmvAvOutcomeSensingWithSource(artifact, sourceDirectory) {
  const structure = verifyCaDmvAvOutcomeSensing(artifact);
  if (!structure.ok) return { ...structure, verificationLevel: "FULL_SOURCE_REPLAY_FAILED" };
  try {
    const rebuilt = buildCaDmvAvOutcomeSensingFromSourceDirectory(sourceDirectory,
      { generatedAt: artifact.generatedAt });
    const exact = canonicalizeStrict(rebuilt) === canonicalizeStrict(artifact);
    const official = rebuilt.source.profileMatchedAtBuild === true;
    if (!exact || !official) throw new Error(!exact ? "ARTIFACT_REBUILD_MISMATCH" : "OFFICIAL_PROFILE_MISMATCH");
    return { ok: true, verificationLevel: "FULL_OFFICIAL_CA_DMV_AV_SOURCE_REPLAYED",
      sourceArtifactsReverified: true,
      decision: "ADMIT_CA_DMV_AV_REGIME_AWARE_SHADOW_SENSING_ONLY",
      artifactHash: artifact.artifactHash, errors: [] };
  } catch (error) {
    return { ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false, decision: null, artifactHash: null,
      errors: [error instanceof Error ? error.message : String(error)] };
  }
}
