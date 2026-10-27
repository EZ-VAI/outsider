/*
 * Institutional AI remedy evidence.
 *
 * This lane records what official source bytes establish about real software
 * systems, allegations, institutional resolutions, remedy obligations, and
 * continuing review.  It deliberately keeps those concepts separate:
 * complaint != adjudication, order != performance, monetary remedy != loss,
 * reviewer report != affected-party closure, and public bytes != authority to
 * price, guarantee, settle, train, or execute.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, openSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const INSTITUTIONAL_AI_REMEDY_SCHEMAS = Object.freeze({
  book: "outsider/institutional-ai-remedy-evidence-book/v1",
  caseRecord: "outsider/institutional-ai-remedy-case/v1",
  obligation: "outsider/institutional-ai-remedy-obligation/v1",
  monitoringRecord: "outsider/institutional-ai-remedy-monitoring-record/v1",
  flywheel: "outsider/institutional-ai-remedy-flywheel/v1",
});

export const INSTITUTIONAL_AI_REMEDY_SOURCE_PINS = Object.freeze([
  Object.freeze({ path: "meta-case.html", kind: "OFFICIAL_CASE_PAGE_HTML",
    url: "https://www.justice.gov/crt/case/united-states-v-meta-platforms-inc-fka-facebook-inc-sdny",
    sizeBytes: 93_150,
    sha256: "sha256:c99f5e29b5a073c1b8932a8413b2a7e691aa9cb49b476f1118b44d762f0d9ba3" }),
  Object.freeze({ path: "meta-complaint.pdf", kind: "GOVERNMENT_COMPLAINT_PDF",
    url: "https://www.justice.gov/crt/case-document/file/1514111/dl",
    sizeBytes: 929_201,
    sha256: "sha256:2139a8a394656da3e08b0e3204eb0998b4a93f643f346f2923904e95f1ebfb16" }),
  Object.freeze({ path: "meta-settlement-final-judgment.pdf",
    kind: "COURT_ENTERED_SETTLEMENT_FINAL_JUDGMENT_PDF",
    url: "https://www.justice.gov/crt/case-document/file/1516666/dl",
    sizeBytes: 3_968_040,
    sha256: "sha256:2819774c04b3d2c7b3828e07076eeb9406d375d853109cac8d78b20d9ca2f7ec" }),
  Object.freeze({ path: "meta-vrs-review-2023-06.pdf", kind: "THIRD_PARTY_REVIEW_PDF",
    url: "https://www.justice.gov/crt/media/1306541/dl", sizeBytes: 918_688,
    sha256: "sha256:8884b53a6b64fb334dd690ccfbafde5195f47190d455dc35065bc5a6f98b5341" }),
  Object.freeze({ path: "meta-vrs-review-2023-10.pdf", kind: "THIRD_PARTY_REVIEW_PDF",
    url: "https://www.justice.gov/crt/media/1328211/dl", sizeBytes: 998_205,
    sha256: "sha256:353dcf08f0c8f51035f1d138c6f0853e3800c383f204e64e9702a1e77d37d3b2" }),
  Object.freeze({ path: "meta-vrs-review-2024-03.pdf", kind: "THIRD_PARTY_REVIEW_PDF",
    url: "https://www.justice.gov/crt/media/1345261/dl", sizeBytes: 1_149_021,
    sha256: "sha256:36847e938e1d139014a163013730d87f4c38b74ee4eeb48e9d0a4b4b1cf5800d" }),
  Object.freeze({ path: "meta-vrs-review-2024-06.pdf", kind: "THIRD_PARTY_REVIEW_PDF",
    url: "https://www.justice.gov/crt/media/1362086/dl", sizeBytes: 1_195_799,
    sha256: "sha256:d72759a5a375e361a7179c9c08e538f5022dbb9e3c58e67460bfd137b2210ac5" }),
  Object.freeze({ path: "meta-vrs-review-2024-10-updated-2024-12.pdf",
    kind: "THIRD_PARTY_REVIEW_PDF",
    url: "https://www.justice.gov/crt/media/1385866/dl", sizeBytes: 13_973_861,
    sha256: "sha256:6c6aad4fcb45a43e68adf461657f27c22bb7c740b728bc3c3d976133ef6bc645" }),
  Object.freeze({ path: "itutorgroup-eeoc-release.html",
    kind: "ENFORCEMENT_AGENCY_RESOLUTION_RELEASE_HTML",
    url: "https://www.eeoc.gov/newsroom/itutorgroup-pay-365000-settle-eeoc-discriminatory-hiring-suit",
    sizeBytes: 68_431,
    sha256: "sha256:67303ec7180a73872c3b9a6dd0f081ee59bdb34655ff548f23080ee19de98730" }),
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const CREATED_AT_DEFAULT = "2026-08-21T12:00:00.000Z";
const EXPECTED_SOURCE_FILES = Object.freeze([
  "acquisition.json", ...INSTITUTIONAL_AI_REMEDY_SOURCE_PINS.map((entry) => entry.path),
].sort());

function fail(code, detail = null) {
  throw new Error(detail == null ? `INSTITUTIONAL_AI_REMEDY_${code}`
    : `INSTITUTIONAL_AI_REMEDY_${code}:${detail}`);
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256Bytes(`${domain}\0${canonicalizeStrict(value)}`);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function canonicalTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("TIME_INVALID");
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function stablePinnedBytes(file, pin, maximumBytes = 20 * 1024 * 1024) {
  let descriptor = null;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size !== BigInt(pin.sizeBytes)
      || before.size > BigInt(maximumBytes)) fail("SOURCE_FILE_INVALID", pin.path);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || sha256Bytes(bytes) !== pin.sha256) fail("SOURCE_FILE_CHANGED_OR_MISMATCHED", pin.path);
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function sourceObjects() {
  return INSTITUTIONAL_AI_REMEDY_SOURCE_PINS.map((pin) => Object.freeze({
    path: pin.path, kind: pin.kind, url: pin.url, sizeBytes: pin.sizeBytes,
    sha256: pin.sha256,
  }));
}

function sealObligation(caseId, code, remedyClass, evidenceObjectHashes, fields = {}) {
  const body = {
    schema: INSTITUTIONAL_AI_REMEDY_SCHEMAS.obligation,
    schemaVersion: "1.0.0", caseId, code, remedyClass,
    evidenceObjectHashes: [...evidenceObjectHashes],
    obligationObservedInOfficialSource: true,
    performanceVerified: false,
    affectedPartyAcceptanceVerified: false,
    recoveryCompletedVerified: false,
    closureEstablished: false,
    ...fields,
  };
  return Object.freeze({ ...body,
    obligationHash: domainHash("outsider:institutional-remedy-obligation:v1", body) });
}

function sealMonitoring(caseId, ordinal, observedDate, sourceObjectHash) {
  const body = {
    schema: INSTITUTIONAL_AI_REMEDY_SCHEMAS.monitoringRecord,
    schemaVersion: "1.0.0", caseId, ordinal, observedDate, sourceObjectHash,
    publisherDescribesReviewerAsThirdParty: true,
    reportBytePinDeclared: true,
    reportBytesSourceReplayedByBook: false,
    reportConclusionMachineParsed: false,
    reviewerInstitutionalIndependenceExternallyEstablishedByOutsider: false,
    affectedPartyParticipationEstablished: false,
    remedyPerformanceVerifiedByOutsider: false,
    externalClosureEstablished: false,
  };
  return Object.freeze({ ...body,
    monitoringRecordHash: domainHash("outsider:institutional-remedy-monitoring:v1", body) });
}

function buildProjection(createdAt = CREATED_AT_DEFAULT) {
  const normalizedCreatedAt = canonicalTime(createdAt);
  const hashes = Object.fromEntries(INSTITUTIONAL_AI_REMEDY_SOURCE_PINS
    .map((pin) => [pin.path, pin.sha256]));
  const metaEvidence = [hashes["meta-case.html"], hashes["meta-complaint.pdf"],
    hashes["meta-settlement-final-judgment.pdf"]];
  const itutorEvidence = [hashes["itutorgroup-eeoc-release.html"]];

  const metaObligations = [
    sealObligation("US_V_META_PLATFORMS_SDNY_1_22_CV_05187", "CIVIL_PENALTY_115054_USD",
      "MONETARY_CIVIL_PENALTY", metaEvidence, {
        currency: "USD", amountMinorUnits: 11_505_400,
        paymentExecutionVerified: false, amountIsEconomicLoss: false,
      }),
    sealObligation("US_V_META_PLATFORMS_SDNY_1_22_CV_05187", "STOP_SPECIAL_AD_AUDIENCE",
      "SYSTEM_USE_RESTRICTION", metaEvidence),
    sealObligation("US_V_META_PLATFORMS_SDNY_1_22_CV_05187", "DEVELOP_VARIANCE_REDUCTION_SYSTEM",
      "SYSTEM_REDESIGN", metaEvidence),
    sealObligation("US_V_META_PLATFORMS_SDNY_1_22_CV_05187",
      "PROTECTED_CHARACTERISTIC_TARGETING_RESTRICTION", "SYSTEM_USE_RESTRICTION", metaEvidence),
    sealObligation("US_V_META_PLATFORMS_SDNY_1_22_CV_05187", "VRS_COMPLIANCE_TARGETS",
      "MEASUREMENT_STANDARD", metaEvidence),
    sealObligation("US_V_META_PLATFORMS_SDNY_1_22_CV_05187", "THIRD_PARTY_VRS_REVIEW",
      "ONGOING_MONITORING", [hashes["meta-case.html"],
        hashes["meta-vrs-review-2023-06.pdf"], hashes["meta-vrs-review-2023-10.pdf"],
        hashes["meta-vrs-review-2024-03.pdf"], hashes["meta-vrs-review-2024-06.pdf"],
        hashes["meta-vrs-review-2024-10-updated-2024-12.pdf"]]),
  ];
  const metaMonitoring = [
    [1, "2023-06-29", "meta-vrs-review-2023-06.pdf"],
    [2, "2023-10-30", "meta-vrs-review-2023-10.pdf"],
    [3, "2024-03-01", "meta-vrs-review-2024-03.pdf"],
    [4, "2024-06-28", "meta-vrs-review-2024-06.pdf"],
    [5, "2024-10-30", "meta-vrs-review-2024-10-updated-2024-12.pdf"],
  ].map(([ordinal, date, file]) => sealMonitoring(
    "US_V_META_PLATFORMS_SDNY_1_22_CV_05187", ordinal, date, hashes[file]));

  const itutorObligations = [
    sealObligation("EEOC_V_ITUTORGROUP_EDNY_1_22_CV_02565", "APPLICANT_DISTRIBUTION_365000_USD",
      "MONETARY_AFFECTED_APPLICANT_DISTRIBUTION", itutorEvidence, {
        currency: "USD", amountMinorUnits: 36_500_000,
        paymentExecutionVerified: false, amountIsEconomicLoss: false,
      }),
    sealObligation("EEOC_V_ITUTORGROUP_EDNY_1_22_CV_02565", "HIRING_TRAINING",
      "ORGANIZATIONAL_TRAINING", itutorEvidence),
    sealObligation("EEOC_V_ITUTORGROUP_EDNY_1_22_CV_02565", "ANTI_DISCRIMINATION_POLICY",
      "POLICY_CHANGE", itutorEvidence),
    sealObligation("EEOC_V_ITUTORGROUP_EDNY_1_22_CV_02565", "AGE_SEX_HIRING_INJUNCTION",
      "CONDUCT_INJUNCTION", itutorEvidence),
    sealObligation("EEOC_V_ITUTORGROUP_EDNY_1_22_CV_02565", "BIRTH_DATE_REQUEST_RESTRICTION",
      "DATA_COLLECTION_RESTRICTION", itutorEvidence),
    sealObligation("EEOC_V_ITUTORGROUP_EDNY_1_22_CV_02565", "EEOC_MONITORING_AT_LEAST_FIVE_YEARS",
      "ONGOING_MONITORING", itutorEvidence, { minimumDurationYearsReported: 5 }),
    sealObligation("EEOC_V_ITUTORGROUP_EDNY_1_22_CV_02565",
      "RESUMED_US_OPERATIONS_NOTICE_AND_INTERVIEW", "AFFECTED_APPLICANT_RECONSIDERATION",
      itutorEvidence, { conditionalOnResumedUsOperations: true }),
  ];

  const caseBodies = [
    {
      schema: INSTITUTIONAL_AI_REMEDY_SCHEMAS.caseRecord,
      schemaVersion: "1.0.0", caseId: "US_V_META_PLATFORMS_SDNY_1_22_CV_05187",
      title: "United States v. Meta Platforms, Inc.",
      environmentReality: ["ORGANIC", "REAL_SOFTWARE"],
      deploymentContext: "PRODUCTION_HOUSING_AD_DELIVERY",
      allegationSource: "UNITED_STATES_COMPLAINT_AFTER_HUD_INVESTIGATION_AND_CHARGE",
      allegedHarmClass: "ALGORITHMIC_HOUSING_AD_DISCRIMINATION",
      resolutionClass: "COURT_ENTERED_SETTLEMENT_FINAL_JUDGMENT",
      complaintAllegationsAdjudicatedOnMerits: false,
      liabilityAdmissionEstablished: false,
      institutionalResolutionObserved: true,
      courtEnteredDispositionObserved: true,
      affectedPartyDirectEvidenceAcquired: false,
      affectedPopulationDenominatorObserved: false,
      economicLossObserved: false,
      remedyAmountsAreInsuranceLoss: false,
      obligations: metaObligations,
      monitoringRecords: metaMonitoring,
      sourceObjectHashes: [...new Set([...metaEvidence,
        ...metaMonitoring.map((row) => row.sourceObjectHash)])].sort(),
    },
    {
      schema: INSTITUTIONAL_AI_REMEDY_SCHEMAS.caseRecord,
      schemaVersion: "1.0.0", caseId: "EEOC_V_ITUTORGROUP_EDNY_1_22_CV_02565",
      title: "EEOC v. iTutorGroup, Inc., et al.",
      environmentReality: ["ORGANIC", "REAL_SOFTWARE"],
      deploymentContext: "PRODUCTION_AUTOMATED_HIRING_SCREENING",
      allegationSource: "EEOC_LAWSUIT_AS_DESCRIBED_IN_ENFORCEMENT_AGENCY_RELEASE",
      allegedHarmClass: "AUTOMATED_AGE_BASED_APPLICANT_REJECTION",
      resolutionClass: "EEOC_REPORTED_CONSENT_DECREE",
      complaintAllegationsAdjudicatedOnMerits: false,
      liabilityAdmissionEstablished: false,
      institutionalResolutionObserved: true,
      courtEnteredDispositionObserved: false,
      affectedPartyDirectEvidenceAcquired: false,
      affectedPopulationDenominatorObserved: false,
      reportedRejectedApplicantsLowerBoundExclusive: 200,
      economicLossObserved: false,
      remedyAmountsAreInsuranceLoss: false,
      decreeBytesAcquired: false,
      obligations: itutorObligations,
      monitoringRecords: [],
      sourceObjectHashes: itutorEvidence,
    },
  ];
  const cases = caseBodies.map((body) => Object.freeze({ ...body,
    caseHash: domainHash("outsider:institutional-remedy-case:v1", body) }));
  const allObligations = cases.flatMap((record) => record.obligations);
  const monitoringRecords = cases.flatMap((record) => record.monitoringRecords);

  const summary = Object.freeze({
    cases: cases.length, realSoftwareCases: 2,
    caseAllegationStreams: 2, institutionalResolutionsObserved: 2,
    courtEnteredDispositionsObserved: 1,
    obligations: allObligations.length,
    remedyClassCounts: Object.fromEntries([...new Set(allObligations
      .map((row) => row.remedyClass))].sort().map((kind) => [kind,
      allObligations.filter((row) => row.remedyClass === kind).length])),
    monitoringDocuments: monitoringRecords.length,
    affectedPartyDirectEvidenceRows: 0,
    paymentExecutionVerifiedRows: 0,
    remedyPerformanceVerifiedRows: 0,
    recoveryCompletedVerifiedRows: 0,
    closureEstablishedRows: 0,
    monetaryObligations: Object.freeze({
      civilPenaltyUsdMinorUnits: 11_505_400,
      affectedApplicantDistributionUsdMinorUnits: 36_500_000,
      amountsNotAggregatedAcrossRemedyKinds: true,
      economicLossAmountDerived: false,
    }),
    sourceObjects: INSTITUTIONAL_AI_REMEDY_SOURCE_PINS.length,
    sourceBytes: INSTITUTIONAL_AI_REMEDY_SOURCE_PINS
      .reduce((sum, entry) => sum + entry.sizeBytes, 0),
  });

  const flywheelBody = {
    schema: INSTITUTIONAL_AI_REMEDY_SCHEMAS.flywheel,
    schemaVersion: "1.0.0",
    stages: [
      "ALLEGATION_OR_REGULATORY_CHARGE",
      "INSTITUTIONAL_RESOLUTION",
      "REMEDY_OBLIGATION",
      "IMPLEMENTATION_EVIDENCE",
      "MONITORING_DOCUMENT_PUBLICATION",
      "INDEPENDENT_OR_AFFECTED_PARTY_REVIEW",
      "DELAYED_CONSEQUENCE_MONITORING",
      "RECOVERY_AND_CLOSURE_REVIEW",
    ],
    observedStageCounts: {
      allegationOrRegulatoryCharge: 2,
      institutionalResolution: 2,
      remedyObligation: allObligations.length,
      implementationEvidence: 0,
      monitoringDocumentPublication: monitoringRecords.length,
      independentOrAffectedPartyReview: 0,
      delayedConsequenceMonitoring: 0,
      recoveryAndClosureReview: 0,
    },
    quantitativeBoundary: {
      selectedCaseSamplingFrameComplete: false,
      stageTransitionProbabilityEstimated: false,
      remedyPerformanceRateEstimated: false,
      timeToRecoveryEstimated: false,
      recurrenceRateEstimated: false,
      rightCensoringPresent: true,
      publishedDocumentCountsAreCompositionOnly: true,
    },
    nextEvidenceRequests: [
      "AFFECTED_PARTY_DIRECT_REPORTS_WITH_STANDING",
      "PAYMENT_OR_DISTRIBUTION_EXECUTION_RECEIPTS",
      "REMEDY_IMPLEMENTATION_SOURCE_BYTES",
      "INDEPENDENT_REVIEWER_AUTHORITY_AND_CONFLICT_DISCLOSURES",
      "LONGITUDINAL_OUTCOME_AND_RECURRENCE_MEASUREMENTS",
      "RECOVERY_STANDARD_AND_AFFECTED_PARTY_ACCEPTANCE",
      "EXTERNAL_CLOSURE_OR_REOPENING_DECISION",
    ],
    decision: "HOLD_EXTERNAL_GOVERNANCE_AND_COMPLETENESS",
    ownerGateInputEligible: false,
    permitsExecution: false,
    permitsPrice: false,
    permitsGuarantee: false,
    permitsSettlement: false,
    permitsAutomaticTraining: false,
    permitsClosure: false,
  };
  const flywheel = Object.freeze({ ...flywheelBody,
    flywheelHash: domainHash("outsider:institutional-remedy-flywheel:v1", flywheelBody) });

  const body = {
    schema: INSTITUTIONAL_AI_REMEDY_SCHEMAS.book,
    schemaVersion: "1.0.0", createdAt: normalizedCreatedAt,
    createdAtTrust: "SELF_ASSERTED_LOCAL_TIME",
    sourceManifest: {
      sourceObjects: sourceObjects(),
      sourceObjectSetHash: domainHash("outsider:institutional-remedy-source-set:v1",
        sourceObjects()),
      officialDocumentBytePinsDeclared: true,
      sourceArtifactsReverifiedByBook: false,
      officialPageProjectionReparsedByBook: false,
      pdfLegalTextMachineParsed: false,
      legalMeaningIndependentlyReviewed: false,
      collectionTimeExternallyAttested: false,
      rights: {
        publicAccessObserved: true,
        legalReuseRightsVerifiedForTraining: false,
        thirdPartyReviewReportRightsResolved: false,
        adapterGrantsAdditionalRights: false,
        rawSourceDistributionByPackage: false,
      },
    },
    cases,
    summary,
    flywheel,
    evidenceInterpretation: {
      realEnvironmentEvidence: true,
      privateResearchOnlySourceRealityClaimed: false,
      allegationIsAdjudication: false,
      orderIsPerformance: false,
      monetaryRemedyIsEconomicLoss: false,
      monitoringReportIsAffectedPartyClosure: false,
    },
    authority: {
      economicLossEvidenceEligible: false,
      incidentFrequencyEligible: false,
      causalLiabilityAdjudicated: false,
      productionModelEligible: false,
      automaticTrainingEligible: false,
      PRICE: false, GUARANTEE: false, SETTLE: false, CONTROL: false,
      ownerGateInputEligible: false,
    },
  };
  return Object.freeze({ ...body,
    bookHash: domainHash("outsider:institutional-remedy-book:v1", body) });
}

function validateSourceSnapshot(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length < 1) {
    fail("SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  const entries = readdirSync(directory).sort();
  if (!same(entries, EXPECTED_SOURCE_FILES)) fail("SOURCE_FILE_SET_INVALID");
  const snapshots = new Map();
  for (const pin of INSTITUTIONAL_AI_REMEDY_SOURCE_PINS) {
    snapshots.set(pin.path, stablePinnedBytes(path.join(directory, pin.path), pin));
  }
  const expectedAcquisition = {
    schema: "outsider/institutional-ai-remedy-acquisition/v1",
    acquiredAt: "SELF_ASSERTED_LOCAL_TIME",
    objects: INSTITUTIONAL_AI_REMEDY_SOURCE_PINS.map((pin) => ({
      path: pin.path, url: pin.url, finalUrl: pin.url,
      sizeBytes: pin.sizeBytes, sha256: pin.sha256,
    })),
  };
  const expectedAcquisitionBytes = Buffer.from(`${JSON.stringify(expectedAcquisition)}\n`);
  const acquisitionBytes = stablePinnedBytes(path.join(directory, "acquisition.json"), {
    path: "acquisition.json", sizeBytes: expectedAcquisitionBytes.length,
    sha256: sha256Bytes(expectedAcquisitionBytes),
  }, 128 * 1024);
  let acquisition;
  try { acquisition = JSON.parse(acquisitionBytes.toString("utf8")); }
  catch { fail("ACQUISITION_INVALID"); }
  if (!same(acquisition, expectedAcquisition)) fail("ACQUISITION_INVALID");
  const meta = snapshots.get("meta-case.html").toString("utf8");
  for (const phrase of [
    "settlement agreement and entered a final judgment",
    "complaint</a>, which was filed on June 21, 2022, alleged",
    "Variance Reduction System (VRS)",
    "civil penalty of $115,054",
    "third-party reviewer, Guidehouse Inc., issued its first report",
    "issued its fifth report",
  ]) if (!meta.includes(phrase)) fail("META_PAGE_PROJECTION_INVALID", phrase);
  const itutor = snapshots.get("itutorgroup-eeoc-release.html").toString("utf8");
  for (const phrase of [
    "Automatically Reject More Than 200 Older Applicants",
    "provides $365,000 to be distributed to applicants",
    "extensive and continuing training",
    "robust new anti-discrimination policy",
    "at least the next five years",
    "must notify and interview those applicants allegedly rejected because of age",
  ]) if (!itutor.toLowerCase().includes(phrase.toLowerCase())) {
    fail("ITUTOR_PAGE_PROJECTION_INVALID", phrase);
  }
  for (const pin of INSTITUTIONAL_AI_REMEDY_SOURCE_PINS.filter((row) => row.path.endsWith(".pdf"))) {
    if (!snapshots.get(pin.path).subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      fail("SOURCE_PDF_MAGIC_INVALID", pin.path);
    }
  }
  return Object.freeze({ snapshots,
    sourceObjectSetHash: domainHash("outsider:institutional-remedy-source-set:v1",
      sourceObjects()) });
}

export function buildInstitutionalAiRemedyEvidenceProjection({
  createdAt = CREATED_AT_DEFAULT,
} = {}) {
  return buildProjection(createdAt);
}

export function buildInstitutionalAiRemedyEvidenceFromSource({
  sourceDirectory, createdAt = CREATED_AT_DEFAULT,
} = {}) {
  const snapshot = validateSourceSnapshot(sourceDirectory);
  const book = buildProjection(createdAt);
  return Object.freeze({ book, sourceReplay: Object.freeze({
    verificationLevel: "FULL_OFFICIAL_DOCUMENT_SET_REPRODUCED",
    sourceArtifactsReverified: true,
    sourceObjectSetHash: snapshot.sourceObjectSetHash,
    documentBytesSourceReplayed: true,
    officialPageProjectionReparsed: true,
    legalMeaningIndependentlyReviewed: false,
    paymentExecutionVerified: false,
    remedyPerformanceExternallyVerified: false,
    affectedPartyReportsExternallyVerified: false,
  }) });
}

export function verifyInstitutionalAiRemedyEvidence(book) {
  try {
    if (book == null || typeof book !== "object" || Array.isArray(book)
      || book.schema !== INSTITUTIONAL_AI_REMEDY_SCHEMAS.book
      || !HASH.test(book.bookHash ?? "")) fail("BOOK_INVALID");
    const expected = buildProjection(book.createdAt);
    if (!same(book, expected)) fail("BOOK_FIXED_PROJECTION_MISMATCH");
    return Object.freeze({ ok: true,
      verificationLevel: "SELF_SEALED_FIXED_PROJECTION_ONLY",
      bookHashVerified: true, sourceArtifactsReverified: false,
      officialPageProjectionReparsed: false,
      legalMeaningIndependentlyReviewed: false,
      authorityBoundaryVerified: true });
  } catch (error) {
    return Object.freeze({ ok: false,
      verificationLevel: "SELF_SEALED_FIXED_PROJECTION_ONLY",
      sourceArtifactsReverified: false,
      authorityBoundaryVerified: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyInstitutionalAiRemedyEvidenceAgainstSource(book, {
  sourceDirectory,
} = {}) {
  try {
    const rebuilt = buildInstitutionalAiRemedyEvidenceFromSource({
      sourceDirectory, createdAt: book?.createdAt,
    });
    if (!same(book, rebuilt.book)) fail("BOOK_SOURCE_REPLAY_MISMATCH");
    return Object.freeze({ ok: true,
      verificationLevel: "FULL_OFFICIAL_DOCUMENT_SET_AND_PROJECTION_REPRODUCED",
      bookHashVerified: true, sourceArtifactsReverified: true,
      officialPageProjectionReparsed: true,
      legalMeaningIndependentlyReviewed: false,
      authorityBoundaryVerified: true,
      sourceObjectSetHash: rebuilt.sourceReplay.sourceObjectSetHash,
      bookHash: book.bookHash });
  } catch (error) {
    return Object.freeze({ ok: false,
      verificationLevel: "FULL_OFFICIAL_DOCUMENT_SET_AND_PROJECTION_REPRODUCED",
      sourceArtifactsReverified: false,
      authorityBoundaryVerified: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}
