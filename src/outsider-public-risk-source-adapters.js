/*
 * Public risk-source discovery adapters.
 *
 * Public incident reports are useful for taxonomy and source discovery, but a
 * crash report without a complete exposure denominator, observed monetary
 * loss, and independent adjudication is not an insurance-loss row.  These
 * adapters therefore terminate in an incident-only quarantine that cannot be
 * passed to the loss/exposure book.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const PUBLIC_RISK_SOURCE_SCHEMA = "outsider/public-risk-source-catalog/v1";
export const NHTSA_SGO_INCIDENT_QUARANTINE_SCHEMA
  = "outsider/nhtsa-sgo-incident-quarantine/v1";

export const PUBLIC_RISK_SOURCE_CATALOG = Object.freeze({
  schema: PUBLIC_RISK_SOURCE_SCHEMA,
  sources: Object.freeze([
    Object.freeze({
      id: "NHTSA_SGO_ADS_CRASH_REPORTS",
      authority: "US_NHTSA",
      officialUrl: "https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting",
      disposition: "INCIDENT_ONLY_NO_DENOMINATOR",
      permitsAutomaticLossAdmission: false,
      permitsAutomaticExposureAdmission: false,
      caveats: Object.freeze([
        "REPORTING_ENTITY_SUBMISSION_NOT_INDEPENDENT_ADJUDICATION",
        "REPORTS_MAY_BE_INCOMPLETE_OR_DUPLICATED",
        "NO_VEHICLE_COUNT_OR_MILEAGE_EXPOSURE_DENOMINATOR",
        "NO_OBSERVED_MONETARY_LOSS_FIELD",
        "NOT_VALID_FOR_CROSS_COMPANY_FREQUENCY_COMPARISON",
      ]),
    }),
    Object.freeze({
      id: "CALIFORNIA_DMV_AV_DISENGAGEMENT_REPORTS",
      authority: "CALIFORNIA_DMV",
      officialUrl: "https://www.dmv.ca.gov/portal/news-and-media/autonomous-vehicle-permit-holders-in-california-logged-more-than-9-million-test-miles-between-december-1-2024-and-november-30-2025/",
      disposition: "LIMITED_EXPOSURE_WINDOW_NOT_LOSS",
      permitsAutomaticLossAdmission: false,
      permitsAutomaticExposureAdmission: false,
      caveats: Object.freeze([
        "SELF_REPORTED_PERMITTED_PUBLIC_ROAD_TESTING_ONLY",
        "EXCLUDES_PRIVATE_ROADS_OTHER_STATES_BELOW_L3_AND_DEPLOYMENT_PERMITS",
        "OFFICIAL_SOURCE_DISCOURAGES_COMPANY_RANKING",
        "NO_OBSERVED_MONETARY_LOSS_FIELD",
        "MUST_NOT_BE_JOINED_TO_NHTSA_WITHOUT_EXACT_ENTITY_SYSTEM_WINDOW_ODD_AND_REPORTING_REGIME_MATCH",
      ]),
    }),
    Object.freeze({
      id: "OECD_AI_INCIDENT_MONITOR",
      authority: "OECD_AI",
      officialUrl: "https://oecd.ai/en/incidents-methodology",
      disposition: "SOURCE_DISCOVERY_ONLY",
      permitsAutomaticLossAdmission: false,
      permitsAutomaticExposureAdmission: false,
      caveats: Object.freeze([
        "NEWS_AGGREGATION_NOT_INDEPENDENT_FACT_ADJUDICATION",
        "NO_EXPOSURE_DENOMINATOR",
        "REUSE_RIGHTS_REQUIRE_RECORD_LEVEL_REVIEW",
      ]),
    }),
  ]),
});

export const NHTSA_SGO_FROZEN_SOURCE_20260820 = Object.freeze({
  csvUrl: "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
  sourceObjectHash: "sha256:7ed5b160593b1eca85a199a0ae31cd694c952b5adfb99ba9692769d1596e114c",
  sourceObjectBytes: 2_374_527,
  dataDictionaryHash: "sha256:1dd54d93302e8f022e4f703fc902c6ceb9450a6748bf0e4ade9cc1f8cced6da7",
  frozenAt: "2026-08-20T00:00:00.000Z",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_COLUMNS = Object.freeze([
  "Report ID", "Report Version", "Reporting Entity", "Report Type",
  "Report Month", "Report Year", "Report Submission Date",
  "Automation System Engaged?", "Engagement Status", "Incident Date",
  "Incident Date - Unknown", "Highest Injury Severity Alleged",
  "Any Air Bags Deployed?", "Was Any Vehicle Towed?", "Crash With",
]);

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
}

function domainHash(domain, value) { return digest({ domain, value }); }

function canonicalTime(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${code}_INVALID`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${code}_NON_CANONICAL`);
  return normalized;
}

function boundedText(value, maximum = 128) {
  const text = String(value ?? "").trim();
  if (text.length > maximum) throw new Error("NHTSA_FIELD_TOO_LARGE");
  return text || null;
}

function parseCsv(text) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 32 * 1024 * 1024) {
    throw new Error("NHTSA_CSV_SIZE_INVALID");
  }
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") {
      row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("NHTSA_CSV_UNTERMINATED_QUOTE");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  if (rows.length < 2) throw new Error("NHTSA_CSV_EMPTY");
  const headers = rows.shift().map((header) => header.trim());
  if (new Set(headers).size !== headers.length
    || REQUIRED_COLUMNS.some((column) => !headers.includes(column))) {
    throw new Error("NHTSA_CSV_HEADER_INVALID");
  }
  const objects = rows.filter((values) => values.some((value) => value !== ""))
    .map((values, index) => {
      if (values.length !== headers.length) throw new Error(`NHTSA_CSV_ROW_WIDTH_INVALID:${index}`);
      return Object.fromEntries(headers.map((header, offset) => [header, values[offset]]));
    });
  return { headers, rows: objects };
}

function numericVersion(row) {
  const value = Number.parseInt(String(row["Report Version"] ?? ""), 10);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("NHTSA_REPORT_VERSION_INVALID");
  return value;
}

function latestReports(rows) {
  const byReport = new Map();
  for (const row of rows) {
    const reportId = boundedText(row["Report ID"]);
    if (!reportId) throw new Error("NHTSA_REPORT_ID_INVALID");
    const version = numericVersion(row);
    const prior = byReport.get(reportId);
    if (!prior || version > prior.version
      || (version === prior.version && canonicalizeStrict(row) > canonicalizeStrict(prior.row))) {
      byReport.set(reportId, { version, row });
    }
  }
  return [...byReport.entries()].map(([reportId, value]) => ({ reportId, ...value }))
    .sort((left, right) => left.reportId.localeCompare(right.reportId));
}

function projectReport({ reportId, version, row }) {
  const sourceRowHash = domainHash("outsider/nhtsa-sgo-source-row/v1", row);
  const projection = {
    reportIdHash: domainHash("outsider/nhtsa-sgo-report-id/v1", reportId),
    reportVersion: version,
    reportingEntityHash: domainHash("outsider/nhtsa-sgo-reporting-entity/v1",
      boundedText(row["Reporting Entity"]) ?? "UNKNOWN"),
    reportType: boundedText(row["Report Type"]),
    reportMonth: boundedText(row["Report Month"]),
    reportYear: boundedText(row["Report Year"]),
    automationSystemEngaged: boundedText(row["Automation System Engaged?"]),
    engagementStatus: boundedText(row["Engagement Status"]),
    incidentDatePresent: Boolean(boundedText(row["Incident Date"])),
    incidentDateMarkedUnknown: String(row["Incident Date - Unknown"] ?? "")
      .trim().toLowerCase() === "yes",
    highestInjurySeverityAlleged: boundedText(row["Highest Injury Severity Alleged"]),
    airbagsDeployed: boundedText(row["Any Air Bags Deployed?"]),
    vehicleTowed: boundedText(row["Was Any Vehicle Towed?"]),
    crashWith: boundedText(row["Crash With"]),
    sourceRowHash,
    privacyProjection: {
      vinPersisted: false,
      serialNumberPersisted: false,
      narrativePersisted: false,
      coordinatesPersisted: false,
      addressPersisted: false,
      cityStateZipPersisted: false,
      exactIncidentTimePersisted: false,
    },
    disposition: "INCIDENT_ONLY_NO_DENOMINATOR",
  };
  return Object.freeze({ ...projection,
    projectionHash: domainHash("outsider/nhtsa-sgo-incident-projection/v1", projection) });
}

export function adaptNhtsaSgoAdsCsv(csvBytes, {
  sourceObjectHash,
  dataDictionaryHash,
  generatedAt = new Date().toISOString(),
  sourceUrl = NHTSA_SGO_FROZEN_SOURCE_20260820.csvUrl,
} = {}) {
  const bytes = Buffer.isBuffer(csvBytes) ? csvBytes : Buffer.from(csvBytes ?? "");
  const at = canonicalTime(generatedAt, "NHTSA_ADAPTER_TIME");
  if (!HASH.test(String(sourceObjectHash ?? "")) || digestBytes(bytes) !== sourceObjectHash) {
    throw new Error("NHTSA_SOURCE_OBJECT_HASH_INVALID");
  }
  if (!HASH.test(String(dataDictionaryHash ?? ""))) {
    throw new Error("NHTSA_DATA_DICTIONARY_HASH_INVALID");
  }
  if (sourceUrl !== NHTSA_SGO_FROZEN_SOURCE_20260820.csvUrl) {
    throw new Error("NHTSA_SOURCE_URL_NOT_OFFICIAL_PIN");
  }
  const parsed = parseCsv(bytes.toString("utf8"));
  const frozenSourceVerified = sourceObjectHash
      === NHTSA_SGO_FROZEN_SOURCE_20260820.sourceObjectHash
    && bytes.length === NHTSA_SGO_FROZEN_SOURCE_20260820.sourceObjectBytes
    && dataDictionaryHash === NHTSA_SGO_FROZEN_SOURCE_20260820.dataDictionaryHash;
  const latest = latestReports(parsed.rows);
  const reports = latest.map(projectReport)
    .sort((left, right) => left.reportIdHash.localeCompare(right.reportIdHash));
  const severityCounts = {};
  for (const report of reports) {
    const key = report.highestInjurySeverityAlleged ?? "UNREPORTED";
    severityCounts[key] = (severityCounts[key] ?? 0) + 1;
  }
  const entityCount = new Set(reports.map((report) => report.reportingEntityHash)).size;
  const body = {
    schema: NHTSA_SGO_INCIDENT_QUARANTINE_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: at,
    source: {
      sourceId: "NHTSA_SGO_ADS_CRASH_REPORTS",
      sourceUrl,
      sourceObjectHash,
      sourceObjectBytes: bytes.length,
      dataDictionaryHash,
      reportingBasis: "REPORTING_ENTITY_SUBMISSIONS",
      independentAdjudication: false,
      reuseRightsVerifiedForTraining: false,
    },
    counts: {
      rawReportRows: parsed.rows.length,
      uniqueReportIds: reports.length,
      historicalOrDuplicateVersions: parsed.rows.length - reports.length,
      reportingEntities: entityCount,
      projectedIncidentRows: reports.length,
      admittedExposureRows: 0,
      admittedLossRows: 0,
      externallyAdjudicatedRows: 0,
    },
    severityAllegationCounts: Object.fromEntries(Object.entries(severityCounts)
      .sort(([left], [right]) => left.localeCompare(right))),
    reports,
    sourceCommitmentHash: domainHash("outsider/nhtsa-sgo-incident-source/v1", {
      sourceObjectHash, dataDictionaryHash,
      reportProjectionHashes: reports.map((report) => report.projectionHash),
    }),
    disposition: {
      status: "QUARANTINED_INCIDENT_DISCOVERY_ONLY",
      sourceClassExternallyVerified: frozenSourceVerified,
      individualReportFactsIndependentlyAdjudicated: false,
      completeExposureDenominatorObserved: false,
      observedEconomicLossAndCurrencyPresent: false,
      automaticJoinWithOtherSources: false,
      allowedUse: "TAXONOMY_AND_SOURCE_DISCOVERY",
    },
    modelEntrance: {
      decision: "ABSTAIN_INCIDENT_ONLY_NO_DENOMINATOR",
      automaticTraining: false,
      frequencyEligible: false,
      severityEligible: false,
      betaBinomialEligible: false,
      buhlmannStraubEligible: false,
      tvarEligible: false,
      price: null,
      capital: null,
      coverage: null,
      missingRequirements: [
        "COMPLETE_COMPARABLE_EXPOSURE_DENOMINATOR",
        "OBSERVED_ECONOMIC_LOSS_WITH_CURRENCY",
        "INDEPENDENT_ADJUDICATION_AND_FRAUD_REVIEW",
        "RECORD_LEVEL_RESEARCH_AND_TRAINING_RIGHTS",
        "ENTITY_SYSTEM_WINDOW_ODD_AND_REPORTING_REGIME_JOIN_KEY",
      ],
    },
    authority: {
      mode: "none",
      permitsPricing: false,
      permitsCoverage: false,
      permitsCapital: false,
      permitsSettlement: false,
      movesFunds: false,
    },
  };
  return Object.freeze({ ...body,
    artifactHash: domainHash(NHTSA_SGO_INCIDENT_QUARANTINE_SCHEMA, body) });
}

export function verifyNhtsaSgoIncidentQuarantine(artifact, csvBytes) {
  const failures = [];
  try {
    const expected = adaptNhtsaSgoAdsCsv(csvBytes, {
      sourceObjectHash: artifact?.source?.sourceObjectHash,
      dataDictionaryHash: artifact?.source?.dataDictionaryHash,
      generatedAt: artifact?.generatedAt,
      sourceUrl: artifact?.source?.sourceUrl,
    });
    if (canonicalizeStrict(expected) !== canonicalizeStrict(artifact)) {
      failures.push("NHTSA_INCIDENT_QUARANTINE_DERIVATION_INVALID");
    }
  } catch (error) { failures.push(`NHTSA_INCIDENT_QUARANTINE_SOURCE_INVALID:${error.message}`); }
  if (artifact?.counts?.admittedExposureRows !== 0
    || artifact?.counts?.admittedLossRows !== 0
    || artifact?.modelEntrance?.decision !== "ABSTAIN_INCIDENT_ONLY_NO_DENOMINATOR"
    || artifact?.modelEntrance?.automaticTraining !== false
    || artifact?.modelEntrance?.price !== null
    || artifact?.modelEntrance?.capital !== null
    || artifact?.modelEntrance?.coverage !== null
    || artifact?.authority?.mode !== "none"
    || ["permitsPricing", "permitsCoverage", "permitsCapital", "permitsSettlement",
      "movesFunds"].some((key) => artifact?.authority?.[key] !== false)) {
    failures.push("NHTSA_INCIDENT_QUARANTINE_AUTHORITY_BOUNDARY_INVALID");
  }
  return Object.freeze({ ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]), sourceReproduced: failures.length === 0,
    admittedExposureRows: 0, admittedLossRows: 0 });
}
