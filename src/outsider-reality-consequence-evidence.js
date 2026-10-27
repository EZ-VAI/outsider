/*
 * Source-replayed real-consequence evidence for Reality Stewardship.
 *
 * This first lane projects OSHA Severe Injury Reports that explicitly mention
 * a robot/robotic system or an automated/automatic/autonomous guided vehicle.
 * The records are empirical reports from real workplaces.  They remain
 * employer-reported regulatory records: neither source replay nor publication
 * establishes causality, independent adjudication, exposure denominators,
 * economic loss, affected-party standing, recovery, closure, or reuse rights.
 */

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const REALITY_CONSEQUENCE_EVIDENCE_SCHEMA
  = "outsider/reality-consequence-evidence-book/v1";
export const REALITY_CONSEQUENCE_EVIDENCE_DIFF_SCHEMA
  = "outsider/reality-consequence-evidence-diff/v1";

export const OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821 = Object.freeze({
  sourceId: "OSHA_SEVERE_INJURY_REPORTS_ROBOT_MENTION",
  officialPageUrl: "https://www.osha.gov/severe-injury-reports",
  sourceUrl: "https://www.osha.gov/sites/default/files/January2015toNovember2025.zip",
  archiveName: "January2015toNovember2025.zip",
  archiveSha256: "sha256:a3f7f434e200fb956131f12277378e592993a25db3f328716fbece106f846bb0",
  archiveBytes: 16_224_511,
  csvName: "January2015toNovember2025.csv",
  csvSha256: "sha256:406ffe7bc0758a447ad1650171b9c3f6990f901e8b73f167dad7cf60a97f13cd",
  csvBytes: 57_403_269,
  dashboardCoverage: Object.freeze({ from: "2015-01-01", through: "2025-11-30" }),
  pinnedAt: "2026-08-21T00:00:00.000Z",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const OFFICIAL_ARCHIVE_REPLAY_TOKEN = Symbol("outsider.osha.official-archive-replay");
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_CSV_BYTES = 96 * 1024 * 1024;
const REQUIRED_COLUMNS = Object.freeze([
  "ID", "UPA", "EventDate", "Employer", "Address1", "Address2", "City", "State",
  "Zip", "Latitude", "Longitude", "Primary NAICS", "Hospitalized", "Amputation",
  "Loss of Eye", "Inspection", "Final Narrative", "Nature", "NatureTitle",
  "Part of Body", "Part of Body Title", "Event", "EventTitle", "Source",
  "SourceTitle", "Secondary Source", "Secondary Source Title", "FederalState",
]);

const ROBOT_TOKEN = /\brobot(?:ic|ics)?\b/i;
const ROBOT_COUPE = /\brobot\s+coupe\b/gi;
const GUIDED_VEHICLE = /\b(?:automated|automatic|autonomous)\s+guided\s+vehicle\b|\bAGV\b/i;
const CONTEXT_TAGS = Object.freeze([
  ["ENERGY_ISOLATION_OR_LOCKOUT_MENTION",
    /\b(?:lock(?:ed)?\s*out|lockout|tagged\s*out|tagout|de-energized|energized)\b/i],
  ["MAINTENANCE_OR_TROUBLESHOOTING_MENTION",
    /\b(?:maintenance|maintain|repair|servic(?:e|ing)|troubleshoot(?:ing)?)\b/i],
  ["MANUAL_INTERVENTION_OR_JAM_CLEARING_MENTION",
    /\b(?:jam|jammed|unjam|clear(?:ing|ed)?\s+(?:a\s+)?jam)\b/i],
  ["ROBOT_CELL_OR_GUARDED_AREA_MENTION",
    /\b(?:robot(?:ic|ics)?\s+(?:cell|area|workspace)|weld(?:ing)?\s+robot\s+cell|safety\s+(?:cell|cage)|guard(?:ed|ing)?)\b/i],
  ["ROBOT_MOTION_OR_CONTACT_OUTCOME_MENTION",
    /\b(?:struck|hit|pin(?:ned)?|caught|crush(?:ed|ing)|contact(?:ed)?|amputat(?:ed|ion)|fractur(?:ed|e))\b/i],
  ["TRAINING_SETUP_OR_INSTALLATION_MENTION",
    /\b(?:train(?:ing|ed)?|setup|set-up|install(?:ing|ed|ation)?)\b/i],
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `REALITY_CONSEQUENCE_${code}`
    : `REALITY_CONSEQUENCE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256(`${domain}\0${typeof value === "string" ? value
    : canonicalizeStrict(value)}`);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function canonicalTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("TIME_INVALID");
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function bounded(value, maximum = 256) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length > maximum) fail("FIELD_TOO_LARGE");
  return normalized || null;
}

function reportedCount(value, field) {
  const normalized = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.0+)?$/.test(normalized)) fail("COUNT_INVALID", field);
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < 0 || number > 10_000) {
    fail("COUNT_INVALID", field);
  }
  return number;
}

function eventMonth(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value ?? "").trim());
  if (!match) fail("EVENT_DATE_INVALID");
  const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) fail("EVENT_DATE_INVALID");
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
}

function parseCsv(bytes) {
  const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? "");
  if (source.length < 1 || source.length > MAX_CSV_BYTES) fail("CSV_SIZE_INVALID");
  const text = source.toString("utf8").replace(/^\uFEFF/, "");
  const matrix = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      matrix.push(row); row = []; field = "";
    } else field += character;
  }
  if (quoted) fail("CSV_UNTERMINATED_QUOTE");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, "")); matrix.push(row);
  }
  if (matrix.length < 2) fail("CSV_EMPTY");
  const headers = matrix.shift().map((header) => header.trim());
  if (!same(headers, REQUIRED_COLUMNS)) fail("CSV_HEADER_INVALID");
  return matrix.filter((values) => values.some((value) => value !== ""))
    .map((values, index) => {
      if (values.length !== headers.length) fail("CSV_ROW_WIDTH_INVALID", index);
      return Object.fromEntries(headers.map((header, offset) => [header, values[offset]]));
    });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Extract an exactly-one-file CSV ZIP using its central directory. */
export function extractSingleCsvFromZip(zipBytes) {
  const bytes = Buffer.isBuffer(zipBytes) ? zipBytes : Buffer.from(zipBytes ?? "");
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES) fail("ZIP_SIZE_INVALID");
  const lower = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= lower; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) fail("ZIP_EOCD_MISSING");
  const disk = bytes.readUInt16LE(eocd + 4), centralDisk = bytes.readUInt16LE(eocd + 6);
  const entriesDisk = bytes.readUInt16LE(eocd + 8), entries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || entries !== 1 || entriesDisk !== 1
    || centralOffset + centralSize > eocd) fail("ZIP_LAYOUT_INVALID");
  const offset = centralOffset;
  if (bytes.readUInt32LE(offset) !== 0x02014b50) fail("ZIP_CENTRAL_INVALID");
  const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
  const expectedCrc = bytes.readUInt32LE(offset + 16);
  const compressedSize = bytes.readUInt32LE(offset + 20);
  const uncompressedSize = bytes.readUInt32LE(offset + 24);
  const nameLength = bytes.readUInt16LE(offset + 28);
  const extraLength = bytes.readUInt16LE(offset + 30);
  const commentLength = bytes.readUInt16LE(offset + 32);
  const localOffset = bytes.readUInt32LE(offset + 42);
  if ((flags & 1) !== 0 || ![0, 8].includes(method)
    || uncompressedSize < 1 || uncompressedSize > MAX_CSV_BYTES
    || compressedSize < 1 || offset + 46 + nameLength + extraLength + commentLength
      !== centralOffset + centralSize) fail("ZIP_ENTRY_INVALID");
  const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
  if (!/^[A-Za-z0-9._-]+\.csv$/i.test(name)) fail("ZIP_ENTRY_NAME_INVALID");
  if (bytes.readUInt32LE(localOffset) !== 0x04034b50) fail("ZIP_LOCAL_INVALID");
  const localNameLength = bytes.readUInt16LE(localOffset + 26);
  const localExtraLength = bytes.readUInt16LE(localOffset + 28);
  const localName = bytes.subarray(localOffset + 30,
    localOffset + 30 + localNameLength).toString("utf8");
  if (localName !== name) fail("ZIP_ENTRY_NAME_MISMATCH");
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  if (dataOffset + compressedSize > centralOffset) fail("ZIP_ENTRY_BOUNDS_INVALID");
  const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
  const csvBytes = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, {
    maxOutputLength: MAX_CSV_BYTES,
  });
  if (csvBytes.length !== uncompressedSize || crc32(csvBytes) !== expectedCrc) {
    fail("ZIP_ENTRY_INTEGRITY_INVALID");
  }
  return Object.freeze({ name, csvBytes });
}

function selectionFor(narrative) {
  const withoutExcludedBrand = narrative.replace(ROBOT_COUPE, "");
  const matches = [];
  if (ROBOT_TOKEN.test(withoutExcludedBrand)) matches.push("EXPLICIT_ROBOT_TOKEN");
  if (GUIDED_VEHICLE.test(narrative)) matches.push("GUIDED_VEHICLE_TOKEN");
  return matches.sort();
}

function contextTagsFor(narrative, selectionMatches) {
  const values = CONTEXT_TAGS.filter(([, expression]) => expression.test(narrative))
    .map(([name]) => name);
  if (selectionMatches.includes("GUIDED_VEHICLE_TOKEN")) values.push("MOBILE_ROBOT_OR_AGV_MENTION");
  return [...new Set(values)].sort();
}

function projection(row, { officialFrozenSourceVerified = false } = {}) {
  const id = bounded(row.ID, 64);
  const narrative = String(row["Final Narrative"] ?? "").trim();
  if (!id || narrative.length < 1 || narrative.length > 32_768) fail("ROW_REQUIRED_FIELD_INVALID");
  const selectionMatches = selectionFor(narrative);
  if (selectionMatches.length === 0) return null;
  const hospitalizedReportedCount = reportedCount(row.Hospitalized, "Hospitalized");
  const amputationReportedCount = reportedCount(row.Amputation, "Amputation");
  const eyeLossReportedCount = reportedCount(row["Loss of Eye"], "Loss of Eye");
  const naics = bounded(row["Primary NAICS"], 16);
  const naics2 = /^\d{2}/.exec(naics ?? "")?.[0] ?? null;
  const sourceRowHash = domainHash("outsider/osha-sir/source-row/v1", row);
  const nativeId = { nativeId: id, upa: bounded(row.UPA, 64) };
  const body = {
    reportIdHash: domainHash("outsider/osha-sir/report-identity/v1", {
      ...nativeId, eventDate: bounded(row.EventDate, 32),
      sourceRowHash,
    }),
    nativeReportIdHash: domainHash("outsider/osha-sir/native-report-id/v1", id),
    sourceCorrelationKeyHash: domainHash("outsider/osha-sir/source-correlation-key/v1",
      nativeId),
    sourceRowHash,
    narrativeHash: domainHash("outsider/osha-sir/narrative/v1", narrative),
    reportingEstablishmentHash: domainHash("outsider/osha-sir/reporting-establishment/v1", {
      upa: bounded(row.UPA, 64), employer: bounded(row.Employer, 512),
    }),
    eventMonth: eventMonth(row.EventDate),
    naics2,
    federalJurisdictionFlag: bounded(row.FederalState, 8),
    inspectionReferencePresent: Boolean(bounded(row.Inspection, 64)),
    selectionMatches,
    contextTags: contextTagsFor(narrative, selectionMatches),
    sourceNativeTaxonomy: {
      natureCode: bounded(row.Nature, 32), natureTitle: bounded(row.NatureTitle),
      bodyPartCode: bounded(row["Part of Body"], 32),
      bodyPartTitle: bounded(row["Part of Body Title"]),
      eventCode: bounded(row.Event, 32), eventTitle: bounded(row.EventTitle),
      sourceCode: bounded(row.Source, 32), sourceTitle: bounded(row.SourceTitle),
      secondarySourceCode: bounded(row["Secondary Source"], 32),
      secondarySourceTitle: bounded(row["Secondary Source Title"]),
    },
    reportedConsequences: {
      hospitalizedReportedCount, amputationReportedCount, eyeLossReportedCount,
      reportingBasis: officialFrozenSourceVerified
        ? "EMPLOYER_SUBMISSION_PUBLISHED_BY_OSHA" : "CALLER_ASSERTED_SHAPED_FIXTURE",
      affectedPartyClass: officialFrozenSourceVerified ? "WORKER" : "NOT_ESTABLISHED",
      directlyReportedByAffectedParty: false,
      independentlyObserved: false,
      independentlyAdjudicated: false,
      economicLossObserved: false,
      recoveryOrLongTermOutcomeObserved: false,
    },
    privacyProjection: {
      narrativePersisted: false, employerNamePersisted: false, upaPersisted: false,
      addressPersisted: false, cityStateZipPersisted: false, coordinatesPersisted: false,
      exactEventDatePersisted: false, inspectionIdentifierPersisted: false,
    },
  };
  return Object.freeze({ ...body,
    projectionHash: domainHash("outsider/osha-sir/robot-consequence-projection/v1", body) });
}

function countBy(rows, getter) {
  const counts = new Map();
  for (const row of rows) {
    const value = getter(row) ?? "UNREPORTED";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function sum(rows, getter) { return rows.reduce((total, row) => total + getter(row), 0); }

function fixedBoundary() {
  return {
    authority: "none",
    independentIncidentUnits: 0,
    independentAffectedPartyObservations: 0,
    prospectiveOutsiderObservations: 0,
    causalExperienceUnits: 0,
    admittedExposureRows: 0,
    admittedEconomicLossRows: 0,
    recoveryVerifiedRows: 0,
    closureVerifiedRows: 0,
    frequencyCalibrationEligible: false,
    causalEffectEligible: false,
    economicSeverityEligible: false,
    automaticTraining: false,
    productionModelUpdate: false,
    permitsPrice: false,
    permitsGuarantee: false,
    permitsSettle: false,
    movesFunds: false,
  };
}

const OSHA_SOURCE_KEYS = Object.freeze(["sourceId", "officialPageUrl", "sourceUrl",
  "archiveHash", "archiveBytes", "csvHash", "csvBytes", "csvName",
  "frozenProfileMatched", "officialFrozenSourceVerified", "sourceArtifactsReverified",
  "sourceTrustClass", "dashboardCoverage", "publisher", "reportingBasis", "coverageBoundary"]);
const OSHA_FROZEN_COUNTS = Object.freeze({
  sourceReportRows: 105_996,
  uniqueNativeReportIds: 105_991,
  reusedNativeReportIdRows: 5,
  selectedReportRows: 116,
  explicitRobotTokenRows: 104,
  guidedVehicleTokenRows: 12,
  inspectionReferencePresentRows: 64,
  reportsWithHospitalization: 77,
  reportedHospitalizations: 79,
  reportsWithAmputation: 46,
  reportedAmputations: 46,
  reportsWithEyeLoss: 0,
  reportedEyeLosses: 0,
});

function exactKeys(object, keys) {
  return object && typeof object === "object" && !Array.isArray(object)
    && same(Object.keys(object).sort(), [...keys].sort());
}

export function adaptOshaSirRobotConsequenceCsv(csvBytes, {
  sourceArchiveHash, sourceArchiveBytes, generatedAt = OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.pinnedAt,
  _archiveReplayToken = null,
} = {}) {
  const bytes = Buffer.isBuffer(csvBytes) ? csvBytes : Buffer.from(csvBytes ?? "");
  if (!HASH.test(String(sourceArchiveHash ?? ""))
    || !Number.isSafeInteger(sourceArchiveBytes) || sourceArchiveBytes <= 0) {
    fail("SOURCE_ARCHIVE_COMMITMENT_INVALID");
  }
  const rows = parseCsv(bytes);
  const nativeReportIds = new Set(rows.map((row) => row.ID));
  const csvHash = sha256(bytes);
  const frozenProfileMatched = _archiveReplayToken === OFFICIAL_ARCHIVE_REPLAY_TOKEN
    && sourceArchiveHash
      === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveSha256
    && sourceArchiveBytes === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveBytes
    && csvHash === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvSha256
    && bytes.length === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvBytes;
  const projections = rows.map((row) => projection(row, {
    officialFrozenSourceVerified: frozenProfileMatched,
  })).filter(Boolean).sort((left, right) => left.reportIdHash.localeCompare(right.reportIdHash));
  const source = {
    sourceId: frozenProfileMatched ? OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.sourceId
      : "CALLER_ASSERTED_SHAPED_FIXTURE",
    sourceTrustClass: frozenProfileMatched ? "OFFICIAL_OSHA_FROZEN_SOURCE_REPLAY"
      : "CALLER_ASSERTED_SHAPED_FIXTURE",
    officialPageUrl: frozenProfileMatched
      ? OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.officialPageUrl : null,
    sourceUrl: frozenProfileMatched ? OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.sourceUrl : null,
    archiveHash: sourceArchiveHash,
    archiveBytes: sourceArchiveBytes,
    csvHash,
    csvBytes: bytes.length,
    csvName: frozenProfileMatched ? OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvName : null,
    frozenProfileMatched,
    officialFrozenSourceVerified: frozenProfileMatched,
    sourceArtifactsReverified: frozenProfileMatched,
    dashboardCoverage: frozenProfileMatched
      ? OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.dashboardCoverage : { from: null, through: null },
    publisher: frozenProfileMatched ? "US_OCCUPATIONAL_SAFETY_AND_HEALTH_ADMINISTRATION" : null,
    reportingBasis: frozenProfileMatched
      ? "EMPLOYER_SEVERE_INJURY_REPORTS_UNDER_29_CFR_1904_39"
      : "CALLER_ASSERTED_SHAPED_FIXTURE",
    coverageBoundary: frozenProfileMatched
      ? "FEDERAL_OSHA_JURISDICTION_NO_FATALITIES_STATE_PLAN_STATES_EXCLUDED"
      : "NOT_ESTABLISHED",
  };
  const counts = {
    sourceReportRows: rows.length,
    uniqueNativeReportIds: nativeReportIds.size,
    reusedNativeReportIdRows: rows.length - nativeReportIds.size,
    selectedReportRows: projections.length,
    explicitRobotTokenRows: projections.filter((row) =>
      row.selectionMatches.includes("EXPLICIT_ROBOT_TOKEN")).length,
    guidedVehicleTokenRows: projections.filter((row) =>
      row.selectionMatches.includes("GUIDED_VEHICLE_TOKEN")).length,
    inspectionReferencePresentRows: projections.filter((row) =>
      row.inspectionReferencePresent).length,
    reportsWithHospitalization: projections.filter((row) =>
      row.reportedConsequences.hospitalizedReportedCount > 0).length,
    reportedHospitalizations: sum(projections, (row) =>
      row.reportedConsequences.hospitalizedReportedCount),
    reportsWithAmputation: projections.filter((row) =>
      row.reportedConsequences.amputationReportedCount > 0).length,
    reportedAmputations: sum(projections, (row) =>
      row.reportedConsequences.amputationReportedCount),
    reportsWithEyeLoss: projections.filter((row) =>
      row.reportedConsequences.eyeLossReportedCount > 0).length,
    reportedEyeLosses: sum(projections, (row) =>
      row.reportedConsequences.eyeLossReportedCount),
  };
  const taxonomyCandidateCounts = {
    eventMonth: countBy(projections, (row) => row.eventMonth),
    naics2: countBy(projections, (row) => row.naics2),
    natureCode: countBy(projections, (row) => row.sourceNativeTaxonomy.natureCode),
    bodyPartCode: countBy(projections, (row) => row.sourceNativeTaxonomy.bodyPartCode),
    eventCode: countBy(projections, (row) => row.sourceNativeTaxonomy.eventCode),
    sourceCode: countBy(projections, (row) => row.sourceNativeTaxonomy.sourceCode),
    contextTag: countBy(projections.flatMap((row) => row.contextTags.map((tag) => ({ tag }))),
      (row) => row.tag),
  };
  const body = {
    schema: REALITY_CONSEQUENCE_EVIDENCE_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: canonicalTime(generatedAt),
    source,
    evidenceOntology: {
      environmentReality: frozenProfileMatched ? ["ORGANIC", "REAL_PHYSICAL"]
        : ["UNVERIFIED_FIXTURE"],
      empiricalStatus: frozenProfileMatched ? "EMPIRICAL_RECORDED"
        : "CALLER_ASSERTED_SHAPED_FIXTURE",
      observationOrigin: frozenProfileMatched ? "PUBLISHER_REGULATORY_INCIDENT_REPORT"
        : "CALLER_ASSERTED_SHAPED_FIXTURE",
      affectedPartyReportClass: frozenProfileMatched
        ? "EMPLOYER_REPORT_ABOUT_AFFECTED_WORKER" : "NOT_ESTABLISHED",
      authorityLevels: frozenProfileMatched
        ? ["SELF_REPORTED", "PUBLISHER_DECLARED", "SOURCE_REPLAYED"] : ["CALLER_ASSERTED"],
      humanReviewEstablished: false,
      independentObservationEstablished: false,
      formalAdjudicationEstablished: false,
    },
    rightsBoundary: {
      sourceBytesAccess: frozenProfileMatched ? "OFFICIAL_PUBLIC_DOWNLOAD"
        : "CALLER_PROVIDED_FIXTURE_BYTES",
      datasetLicenseDeclaration: "NO_DATASET_LICENSE_ESTABLISHED",
      reportTextRights: frozenProfileMatched
        ? "NOT_RETAINED_IN_DERIVED_ARTIFACT_RIGHTS_NOT_GRANTED_BY_ADAPTER"
        : "CALLER_ASSERTED_FIXTURE_RIGHTS_NOT_ESTABLISHED",
      consentOrCollectionAuthority: frozenProfileMatched
        ? "REGULATORY_REPORTING_BASIS_RECORDED_NOT_AFFECTED_PARTY_CONSENT"
        : "NOT_ESTABLISHED",
      reuseOrTrainingRights: "NOT_ESTABLISHED",
      adapterGrantsRights: false,
      legalConclusion: false,
    },
    selection: {
      unit: "SOURCE_REPORT_ROW_NOT_INDEPENDENT_INCIDENT_OR_PERSON",
      exactRule: "EXPLICIT_ROBOT_TOKEN_EXCLUDING_ROBOT_COUPE_OR_GUIDED_VEHICLE_TOKEN_IN_FINAL_NARRATIVE",
      postOutcomeSelection: true,
      machineAssociationNotCausation: true,
      falsePositiveAndFalseNegativeReviewRequired: true,
    },
    counts,
    taxonomyCandidateCounts,
    projections,
    sourceCommitmentHash: domainHash("outsider/osha-sir/robot-consequence-source/v1", {
      source, counts, taxonomyCandidateCounts,
      projectionHashes: projections.map((row) => row.projectionHash),
    }),
    stewardshipUse: {
      admitted: frozenProfileMatched ? ["DESCRIPTIVE_COMPOSITION", "FACTOR_SCHEMA_CANDIDATES",
        "CONSEQUENCE_CHANNEL_DISCOVERY", "AFFECTED_PARTY_CLASS_DISCOVERY"]
        : ["PARSER_AND_SCHEMA_TEST_ONLY"],
      denied: ["FREQUENCY", "CAUSAL_ATTRIBUTION", "ECONOMIC_LOSS", "PRICE",
        "GUARANTEE", "SETTLE", "AUTOMATIC_TRAINING", "RECOVERY", "CLOSURE"],
      longitudinalConsequenceCoverage: "ABSENT",
      affectedPartyStandingCoverage: "ABSENT",
      nextObservationNeed: frozenProfileMatched
        ? "PROSPECTIVE_OWNER_BOUND_RUN_PLUS_AFFECTED_PARTY_REPORT_PLUS_DELAYED_RECOVERY_CHECK"
        : "PROVIDE_EXACT_FROZEN_OFFICIAL_SOURCE_BYTES",
    },
    boundary: fixedBoundary(),
  };
  return Object.freeze({ ...body,
    artifactHash: domainHash(REALITY_CONSEQUENCE_EVIDENCE_SCHEMA, body) });
}

export function buildOshaSirRobotConsequenceBookFromZip(zipBytes, options = {}) {
  if (options == null || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).some((key) => key !== "generatedAt")) {
    fail("BUILD_OPTIONS_INVALID");
  }
  const archive = Buffer.isBuffer(zipBytes) ? zipBytes : Buffer.from(zipBytes ?? "");
  const extracted = extractSingleCsvFromZip(archive);
  if (extracted.name !== OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvName
    && sha256(archive) === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveSha256) {
    fail("FROZEN_ZIP_ENTRY_NAME_INVALID");
  }
  return adaptOshaSirRobotConsequenceCsv(extracted.csvBytes, {
    sourceArchiveHash: sha256(archive), sourceArchiveBytes: archive.length,
    generatedAt: options.generatedAt,
    _archiveReplayToken: OFFICIAL_ARCHIVE_REPLAY_TOKEN,
  });
}

function structuralBoundaryValid(artifact) {
  const rootKeys = ["schema", "schemaVersion", "generatedAt", "source", "evidenceOntology",
    "rightsBoundary", "selection", "counts", "taxonomyCandidateCounts", "projections",
    "sourceCommitmentHash", "stewardshipUse", "boundary", "artifactHash"];
  const source = artifact?.source ?? {};
  const pinnedSourceBytes = source.archiveHash
      === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveSha256
    && source.archiveBytes === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveBytes
    && source.csvHash === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvSha256
    && source.csvBytes === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvBytes;
  const officialProfile = pinnedSourceBytes && source.frozenProfileMatched === true
    && source.officialFrozenSourceVerified === true
    && source.sourceArtifactsReverified === true;
  const fixtureProfile = source.frozenProfileMatched === false
    && source.officialFrozenSourceVerified === false
    && source.sourceArtifactsReverified === false;
  const evidenceOntology = {
    environmentReality: officialProfile ? ["ORGANIC", "REAL_PHYSICAL"]
      : ["UNVERIFIED_FIXTURE"],
    empiricalStatus: officialProfile ? "EMPIRICAL_RECORDED" : "CALLER_ASSERTED_SHAPED_FIXTURE",
    observationOrigin: officialProfile ? "PUBLISHER_REGULATORY_INCIDENT_REPORT"
      : "CALLER_ASSERTED_SHAPED_FIXTURE",
    affectedPartyReportClass: officialProfile ? "EMPLOYER_REPORT_ABOUT_AFFECTED_WORKER"
      : "NOT_ESTABLISHED",
    authorityLevels: officialProfile
      ? ["SELF_REPORTED", "PUBLISHER_DECLARED", "SOURCE_REPLAYED"] : ["CALLER_ASSERTED"],
    humanReviewEstablished: false,
    independentObservationEstablished: false,
    formalAdjudicationEstablished: false,
  };
  const rightsBoundary = {
    sourceBytesAccess: officialProfile ? "OFFICIAL_PUBLIC_DOWNLOAD"
      : "CALLER_PROVIDED_FIXTURE_BYTES",
    datasetLicenseDeclaration: "NO_DATASET_LICENSE_ESTABLISHED",
    reportTextRights: officialProfile
      ? "NOT_RETAINED_IN_DERIVED_ARTIFACT_RIGHTS_NOT_GRANTED_BY_ADAPTER"
      : "CALLER_ASSERTED_FIXTURE_RIGHTS_NOT_ESTABLISHED",
    consentOrCollectionAuthority: officialProfile
      ? "REGULATORY_REPORTING_BASIS_RECORDED_NOT_AFFECTED_PARTY_CONSENT" : "NOT_ESTABLISHED",
    reuseOrTrainingRights: "NOT_ESTABLISHED",
    adapterGrantsRights: false,
    legalConclusion: false,
  };
  const selection = {
    unit: "SOURCE_REPORT_ROW_NOT_INDEPENDENT_INCIDENT_OR_PERSON",
    exactRule: "EXPLICIT_ROBOT_TOKEN_EXCLUDING_ROBOT_COUPE_OR_GUIDED_VEHICLE_TOKEN_IN_FINAL_NARRATIVE",
    postOutcomeSelection: true,
    machineAssociationNotCausation: true,
    falsePositiveAndFalseNegativeReviewRequired: true,
  };
  const stewardshipUse = {
    admitted: officialProfile ? ["DESCRIPTIVE_COMPOSITION", "FACTOR_SCHEMA_CANDIDATES",
      "CONSEQUENCE_CHANNEL_DISCOVERY", "AFFECTED_PARTY_CLASS_DISCOVERY"]
      : ["PARSER_AND_SCHEMA_TEST_ONLY"],
    denied: ["FREQUENCY", "CAUSAL_ATTRIBUTION", "ECONOMIC_LOSS", "PRICE",
      "GUARANTEE", "SETTLE", "AUTOMATIC_TRAINING", "RECOVERY", "CLOSURE"],
    longitudinalConsequenceCoverage: "ABSENT",
    affectedPartyStandingCoverage: "ABSENT",
    nextObservationNeed: officialProfile
      ? "PROSPECTIVE_OWNER_BOUND_RUN_PLUS_AFFECTED_PARTY_REPORT_PLUS_DELAYED_RECOVERY_CHECK"
      : "PROVIDE_EXACT_FROZEN_OFFICIAL_SOURCE_BYTES",
  };
  const denied = ["FREQUENCY", "CAUSAL_ATTRIBUTION", "ECONOMIC_LOSS", "PRICE",
    "GUARANTEE", "SETTLE", "AUTOMATIC_TRAINING", "RECOVERY", "CLOSURE"];
  const projections = artifact?.projections ?? [];
  const counts = artifact?.counts ?? {};
  const projectionHashesValid = projections.every((row) => {
    const { projectionHash, ...body } = row;
    const reported = row?.reportedConsequences;
    const privacy = row?.privacyProjection;
    const taxonomy = row?.sourceNativeTaxonomy;
    const selectionMatches = row?.selectionMatches ?? [];
    const contextTags = row?.contextTags ?? [];
    return exactKeys(row, ["reportIdHash", "nativeReportIdHash", "sourceCorrelationKeyHash",
      "sourceRowHash", "narrativeHash", "reportingEstablishmentHash", "eventMonth", "naics2",
      "federalJurisdictionFlag", "inspectionReferencePresent", "selectionMatches", "contextTags",
      "sourceNativeTaxonomy", "reportedConsequences", "privacyProjection", "projectionHash"])
      && exactKeys(reported, ["hospitalizedReportedCount", "amputationReportedCount",
        "eyeLossReportedCount", "reportingBasis", "affectedPartyClass",
        "directlyReportedByAffectedParty", "independentlyObserved", "independentlyAdjudicated",
        "economicLossObserved", "recoveryOrLongTermOutcomeObserved"])
      && exactKeys(privacy, ["narrativePersisted", "employerNamePersisted", "upaPersisted",
        "addressPersisted", "cityStateZipPersisted", "coordinatesPersisted",
        "exactEventDatePersisted", "inspectionIdentifierPersisted"])
      && exactKeys(taxonomy, ["natureCode", "natureTitle", "bodyPartCode", "bodyPartTitle",
        "eventCode", "eventTitle", "sourceCode", "sourceTitle", "secondarySourceCode",
        "secondarySourceTitle"])
      && HASH.test(String(projectionHash ?? ""))
      && projectionHash === domainHash("outsider/osha-sir/robot-consequence-projection/v1", body)
      && [row.reportIdHash, row.nativeReportIdHash, row.sourceCorrelationKeyHash,
        row.sourceRowHash, row.narrativeHash, row.reportingEstablishmentHash]
        .every((value) => HASH.test(String(value ?? "")))
      && /^\d{4}-\d{2}$/.test(String(row.eventMonth ?? ""))
      && (row.naics2 == null || /^\d{2}$/.test(row.naics2))
      && (row.federalJurisdictionFlag == null
        || typeof row.federalJurisdictionFlag === "string")
      && typeof row.inspectionReferencePresent === "boolean"
      && Array.isArray(selectionMatches) && selectionMatches.length > 0
      && same(selectionMatches, [...new Set(selectionMatches)].sort())
      && selectionMatches.every((value) => ["EXPLICIT_ROBOT_TOKEN",
        "GUIDED_VEHICLE_TOKEN"].includes(value))
      && Array.isArray(contextTags) && same(contextTags, [...new Set(contextTags)].sort())
      && contextTags.every((value) => CONTEXT_TAGS.some(([name]) => name === value)
        || value === "MOBILE_ROBOT_OR_AGV_MENTION")
      && [reported.hospitalizedReportedCount, reported.amputationReportedCount,
        reported.eyeLossReportedCount].every((value) => Number.isSafeInteger(value)
          && value >= 0 && value <= 10_000)
      && reported.reportingBasis === (officialProfile
        ? "EMPLOYER_SUBMISSION_PUBLISHED_BY_OSHA" : "CALLER_ASSERTED_SHAPED_FIXTURE")
      && reported.affectedPartyClass === (officialProfile ? "WORKER" : "NOT_ESTABLISHED")
      && reported.directlyReportedByAffectedParty === false
      && reported.independentlyObserved === false
      && reported.independentlyAdjudicated === false
      && reported.economicLossObserved === false
      && reported.recoveryOrLongTermOutcomeObserved === false
      && Object.values(privacy).every((value) => value === false)
      && Object.values(taxonomy).every((value) => value == null || typeof value === "string");
  });
  const expectedTaxonomy = {
    eventMonth: countBy(projections, (row) => row.eventMonth),
    naics2: countBy(projections, (row) => row.naics2),
    natureCode: countBy(projections, (row) => row.sourceNativeTaxonomy.natureCode),
    bodyPartCode: countBy(projections, (row) => row.sourceNativeTaxonomy.bodyPartCode),
    eventCode: countBy(projections, (row) => row.sourceNativeTaxonomy.eventCode),
    sourceCode: countBy(projections, (row) => row.sourceNativeTaxonomy.sourceCode),
    contextTag: countBy(projections.flatMap((row) => row.contextTags.map((tag) => ({ tag }))),
      (row) => row.tag),
  };
  const expectedSourceCommitment = domainHash("outsider/osha-sir/robot-consequence-source/v1", {
    source: artifact?.source,
    counts,
    taxonomyCandidateCounts: artifact?.taxonomyCandidateCounts,
    projectionHashes: projections.map((row) => row.projectionHash),
  });
  return exactKeys(artifact, rootKeys)
    && artifact?.schema === REALITY_CONSEQUENCE_EVIDENCE_SCHEMA
    && artifact?.schemaVersion === "1.0.0"
    && canonicalTime(artifact?.generatedAt) === artifact.generatedAt
    && exactKeys(artifact?.source, OSHA_SOURCE_KEYS)
    && exactKeys(artifact?.source?.dashboardCoverage, ["from", "through"])
    && (officialProfile || fixtureProfile)
    && (officialProfile ? source.sourceId === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.sourceId
      && source.sourceTrustClass === "OFFICIAL_OSHA_FROZEN_SOURCE_REPLAY"
      && source.officialPageUrl === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.officialPageUrl
      && source.sourceUrl === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.sourceUrl
      && source.csvName === OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.csvName
      && same(source.dashboardCoverage, OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.dashboardCoverage)
      && source.publisher === "US_OCCUPATIONAL_SAFETY_AND_HEALTH_ADMINISTRATION"
      && source.reportingBasis === "EMPLOYER_SEVERE_INJURY_REPORTS_UNDER_29_CFR_1904_39"
      && source.coverageBoundary
        === "FEDERAL_OSHA_JURISDICTION_NO_FATALITIES_STATE_PLAN_STATES_EXCLUDED"
      : source.sourceId === "CALLER_ASSERTED_SHAPED_FIXTURE"
        && source.sourceTrustClass === "CALLER_ASSERTED_SHAPED_FIXTURE"
        && source.officialPageUrl === null && source.sourceUrl === null
        && source.csvName === null && same(source.dashboardCoverage, { from: null, through: null })
        && source.publisher === null && source.reportingBasis === "CALLER_ASSERTED_SHAPED_FIXTURE"
        && source.coverageBoundary === "NOT_ESTABLISHED")
    && HASH.test(String(artifact?.source?.archiveHash ?? ""))
    && HASH.test(String(artifact?.source?.csvHash ?? ""))
    && Number.isSafeInteger(artifact?.source?.archiveBytes) && artifact.source.archiveBytes > 0
    && Number.isSafeInteger(artifact?.source?.csvBytes) && artifact.source.csvBytes > 0
    && same(artifact?.evidenceOntology, evidenceOntology)
    && same(artifact?.rightsBoundary, rightsBoundary)
    && same(artifact?.selection, selection)
    && same(artifact?.stewardshipUse, stewardshipUse)
    && exactKeys(counts, Object.keys(OSHA_FROZEN_COUNTS))
    && Object.values(counts).every((value) => Number.isSafeInteger(value) && value >= 0)
    && counts.uniqueNativeReportIds + counts.reusedNativeReportIdRows === counts.sourceReportRows
    && counts.selectedReportRows <= counts.sourceReportRows
    && same(artifact?.stewardshipUse?.denied, denied)
    && same(artifact?.boundary, fixedBoundary())
    && projectionHashesValid
    && new Set(projections.map((row) => row.projectionHash)).size === projections.length
    && new Set(projections.map((row) => row.sourceCorrelationKeyHash)).size === projections.length
    && projections.length === counts.selectedReportRows
    && counts.explicitRobotTokenRows === projections.filter((row) =>
      row.selectionMatches.includes("EXPLICIT_ROBOT_TOKEN")).length
    && counts.guidedVehicleTokenRows === projections.filter((row) =>
      row.selectionMatches.includes("GUIDED_VEHICLE_TOKEN")).length
    && counts.inspectionReferencePresentRows === projections.filter((row) =>
      row.inspectionReferencePresent).length
    && counts.reportsWithHospitalization === projections.filter((row) =>
      row.reportedConsequences.hospitalizedReportedCount > 0).length
    && counts.reportedHospitalizations === sum(projections, (row) =>
      row.reportedConsequences.hospitalizedReportedCount)
    && counts.reportsWithAmputation === projections.filter((row) =>
      row.reportedConsequences.amputationReportedCount > 0).length
    && counts.reportedAmputations === sum(projections, (row) =>
      row.reportedConsequences.amputationReportedCount)
    && counts.reportsWithEyeLoss === projections.filter((row) =>
      row.reportedConsequences.eyeLossReportedCount > 0).length
    && counts.reportedEyeLosses === sum(projections, (row) =>
      row.reportedConsequences.eyeLossReportedCount)
    && same(artifact?.taxonomyCandidateCounts, expectedTaxonomy)
    && (!officialProfile || same(counts, OSHA_FROZEN_COUNTS))
    && artifact?.sourceCommitmentHash === expectedSourceCommitment;
}

export function verifyOshaSirRobotConsequenceBook(artifact) {
  try {
    const { artifactHash, ...body } = artifact ?? {};
    const ok = HASH.test(String(artifactHash ?? ""))
      && artifactHash === domainHash(REALITY_CONSEQUENCE_EVIDENCE_SCHEMA, body)
      && structuralBoundaryValid(artifact);
    return Object.freeze({ ok, verificationLevel: "SELF_SEALED_STRUCTURE_ONLY",
      sourceArtifactsReverified: false, officialFrozenSourceReproduced: false,
      artifactHash: artifactHash ?? null });
  } catch (error) {
    return Object.freeze({ ok: false, verificationLevel: "FAILED",
      sourceArtifactsReverified: false, officialFrozenSourceReproduced: false,
      error: String(error?.message ?? error) });
  }
}

export function verifyOshaSirRobotConsequenceBookFromZip(artifact, zipBytes) {
  try {
    const rebuilt = buildOshaSirRobotConsequenceBookFromZip(zipBytes, {
      generatedAt: artifact?.generatedAt,
    });
    const ok = same(artifact, rebuilt) && structuralBoundaryValid(rebuilt);
    const official = ok && rebuilt.source.officialFrozenSourceVerified === true;
    return Object.freeze({ ok, verificationLevel: !ok ? "FAILED"
      : official ? "FULL_OFFICIAL_OSHA_SOURCE_REPRODUCED"
        : "CALLER_ASSERTED_FIXTURE_BYTES_REPRODUCED",
      inputBytesReproduced: ok,
      sourceArtifactsReverified: official,
      officialFrozenSourceReproduced: official,
      sourceReportRows: ok ? rebuilt.counts.sourceReportRows : 0,
      selectedReportRows: ok ? rebuilt.counts.selectedReportRows : 0,
      artifactHash: artifact?.artifactHash ?? null });
  } catch (error) {
    return Object.freeze({ ok: false, verificationLevel: "FAILED",
      inputBytesReproduced: false, sourceArtifactsReverified: false,
      officialFrozenSourceReproduced: false,
      error: String(error?.message ?? error) });
  }
}

/**
 * Content-addressed snapshot delta for the ingestion flywheel.  A delta is a
 * discovery instrument only.  Added/removed/changed publisher rows must still
 * pass the same source and authority boundaries before any downstream use.
 */
export function buildRealityConsequenceEvidenceDiff(previous, current, {
  generatedAt = current?.generatedAt,
} = {}) {
  if (!verifyOshaSirRobotConsequenceBook(previous).ok
    || !verifyOshaSirRobotConsequenceBook(current).ok
    || previous.source.sourceId !== current.source.sourceId
    || previous.sourceCommitmentHash === current.sourceCommitmentHash) {
    fail("DIFF_INPUT_INVALID");
  }
  const before = new Map(previous.projections.map((row) => [row.sourceCorrelationKeyHash, row]));
  const after = new Map(current.projections.map((row) => [row.sourceCorrelationKeyHash, row]));
  if (before.size !== previous.projections.length || after.size !== current.projections.length) {
    fail("DIFF_CORRELATION_KEY_DUPLICATE");
  }
  const added = [...after.keys()].filter((key) => !before.has(key)).sort();
  const removed = [...before.keys()].filter((key) => !after.has(key)).sort();
  const changed = [...after.keys()].filter((key) => before.has(key)
    && before.get(key).projectionHash !== after.get(key).projectionHash).sort();
  const unchanged = [...after.keys()].filter((key) => before.has(key)
    && before.get(key).projectionHash === after.get(key).projectionHash).sort();
  const body = {
    schema: REALITY_CONSEQUENCE_EVIDENCE_DIFF_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: canonicalTime(generatedAt),
    sourceId: current.source.sourceId,
    previous: { artifactHash: previous.artifactHash,
      sourceCommitmentHash: previous.sourceCommitmentHash,
      selectedReportRows: previous.counts.selectedReportRows },
    current: { artifactHash: current.artifactHash,
      sourceCommitmentHash: current.sourceCommitmentHash,
      selectedReportRows: current.counts.selectedReportRows },
    changes: {
      addedCorrelationKeyHashes: added,
      removedCorrelationKeyHashes: removed,
      changedCorrelationKeyHashes: changed,
      unchangedCorrelationKeyHashes: unchanged,
      counts: { added: added.length, removed: removed.length,
        changed: changed.length, unchanged: unchanged.length },
    },
    disposition: "SOURCE_DISCOVERY_AND_TAXONOMY_REVIEW_ONLY",
    automaticPromotion: false,
    boundary: fixedBoundary(),
  };
  return Object.freeze({ ...body,
    diffHash: domainHash(REALITY_CONSEQUENCE_EVIDENCE_DIFF_SCHEMA, body) });
}

export function verifyRealityConsequenceEvidenceDiff(diff, previous, current) {
  try {
    const expected = buildRealityConsequenceEvidenceDiff(previous, current, {
      generatedAt: diff?.generatedAt,
    });
    return Object.freeze({ ok: same(diff, expected),
      verificationLevel: "BOTH_SOURCE_BOOKS_REQUIRED",
      sourceArtifactsReverified: false,
      permitsAutomaticPromotion: false,
      diffHash: diff?.diffHash ?? null });
  } catch (error) {
    return Object.freeze({ ok: false, verificationLevel: "FAILED",
      sourceArtifactsReverified: false, permitsAutomaticPromotion: false,
      error: String(error?.message ?? error) });
  }
}
