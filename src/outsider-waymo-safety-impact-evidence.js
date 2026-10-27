/*
 * Waymo Safety Impact source-aware outcome/exposure calibration evidence.
 *
 * The source contains real Rider-Only mileage and SGO-linked crash outcomes,
 * plus Waymo-published human benchmark calculations.  It is useful as a
 * bounded calibration/reference lane, not as independent adjudication,
 * liability/loss truth, behavior-model training permission, or authority.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const WAYMO_SAFETY_IMPACT_EVIDENCE_SCHEMA
  = "outsider/waymo-safety-impact-evidence/v1";
const FROZEN_AT = "2026-08-22T00:15:00.000Z";
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const CANONICAL_ARTIFACT_HASH
  = "sha256:edccce782d93f0f8f6f01c14f427d44e4137d0b1cf5c040a0c84d0ada9da0a7a";
const ARTIFACT_STRUCTURAL_SHAPE_HASH
  = "sha256:de2d92f2194af6094bfdf09cf92da1e56d14ac5a33df9aacd10039ff3f56f68e";

export const WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822 = Object.freeze({
  sourceId: "WAYMO_SAFETY_IMPACT_DATA_HUB_20260624_CAPTURED_20260822",
  frozenAt: FROZEN_AT,
  files: Object.freeze([
    Object.freeze({ name: "waymo-safety-impact-page-20260822.html", kind: "PUBLISHER_DATA_HUB_PAGE",
      url: "https://waymo.com/safety/impact/", bytes: 387_280,
      sha256: "sha256:9e89cc7915e77b9768224fe4bd95843eefb389c3dab84dd60f76360d5a0a2875" }),
    Object.freeze({ name: "waymo-csv1-ro-miles-20260624.csv", kind: "CSV1_RIDER_ONLY_MILES",
      url: "https://storage.googleapis.com/waymo-uploads/files/documents/safety/safety-impact-data/CSV1%20-%20RO%20Miles%20per%20Location%20202009-202603-2022benchmark.csv",
      bytes: 256, sha256: "sha256:9e8d9c44ebd4458b5baece901e40bb9d62b00921535c0109780d80fbcb78e12b" }),
    Object.freeze({ name: "waymo-csv2-sgo-crashes-20260624.csv", kind: "CSV2_SGO_CASE_OUTCOME_MEMBERSHIP",
      url: "https://storage.googleapis.com/waymo-uploads/files/documents/safety/safety-impact-data/CSV2%20-%20Crashes%20with%20SGO%20ID%20and%20Group%20Membership%20202009-202603-2022benchmark.csv",
      bytes: 304_031, sha256: "sha256:868671a6dc6a377ffcb9d1d3caa058f0e7722ee14ef6a2e396f018676c6ce019" }),
    Object.freeze({ name: "waymo-csv3-benchmark-comparisons-20260624.csv", kind: "CSV3_OUTCOME_BENCHMARK_COMPARISONS",
      url: "https://storage.googleapis.com/waymo-uploads/files/documents/safety/safety-impact-data/CSV3%20-%20Collision%20Counts%20and%20Comparison%20to%20Benchmarks%20202009-202603-2022benchmark.csv",
      bytes: 680_328, sha256: "sha256:1c57f43ee074fc06242cf6483a5dc027b708ce6cfdb48dfc8c11e72bb0de82d7" }),
    Object.freeze({ name: "waymo-csv4-dynamic-benchmark-20260624.csv", kind: "CSV4_S2_DYNAMIC_BENCHMARK_INPUTS",
      url: "https://storage.googleapis.com/waymo-uploads/files/documents/safety/safety-impact-data/CSV4%20-%20Miles%20and%20Benchmark%20Crashes%20for%20Dynamic%20Benchmark%20202009-202603-2022benchmark.csv",
      bytes: 1_675_670, sha256: "sha256:5b92f6d1fbfd9e69e51425722aaa4d0eb2238db0058a427e7bc5e0b842e01c15" }),
    Object.freeze({ name: "waymo-release-notes-20260624.pdf", kind: "RELEASE_NOTES_AND_DATA_DICTIONARY",
      url: "https://storage.googleapis.com/waymo-uploads/files/documents/safety/safety-impact-data/Waymo_Safety_Impact_Data_Hub_Release_Notes_20260624.pdf",
      bytes: 261_542, sha256: "sha256:b02ca7ff46957bdba79c30478e31540c12386fc4ccd62b1c36da97b29b6b10fd" }),
  ]),
});

const EXPECTED_NAMES = Object.freeze(WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.files.map((file) => file.name));
const EXPECTED_DIRECTORY_NAMES = Object.freeze([...EXPECTED_NAMES, "acquisition.json"].sort());
const CSV1_HEADERS = Object.freeze(["County Name", "Waymo RO Miles (Millions)"]);
const CSV2_HEADERS = Object.freeze([
  "SGO Report ID", "SGO Report Version", "SGO Amendment", "Year Month", "State", "County",
  "Road Type", "Crash Type", "Is NHTSA Reportable In-Transport",
  "Is NHTSA Reportable In-Transport Delta-V Less than 1 MPH", "Is Police-Reported",
  "Is Any-Injury-Reported", "Is Any Vehicle Airbag Deployment", "Is Ego Vehicle Airbag Deployment",
  "Is Suspected Serious Injury+", "Is Any Fatal Injury", "Incident Date",
  "Location Address / Description", "Zip Code",
]);
const CSV3_HEADERS = Object.freeze([
  "Outcome", "Benchmark Comparison", "County Name", "Grouping Type", "Conflict Partner Type Group",
  "Waymo Count", "Delta V Less Than 1 Mph Percent", "Waymo IPMM", "Waymo IPMM CI Lower",
  "Waymo IPMM CI Upper", "Benchmark IPMM", "Benchmark IPMM CI Lower", "Benchmark IPMM CI Upper",
  "Predicted Benchmark Count", "Waymo Count Reduction", "Waymo Percent Reduction",
  "Waymo Percent Reduction CI Lower", "Waymo Percent Reduction CI Upper", "Waymo Rate Ratio",
  "Waymo Rate Ratio CI Lower", "Waymo Rate Ratio CI Upper",
]);
const CSV4_HEADERS = Object.freeze([
  "state_name", "county_name", "S2 Cell", "Outcome", "Benchmark Crash Count",
  "HPMS Yearly Vehicle Miles Traveled", "Waymo RO Miles",
]);
const CSV2_BOOLEAN_HEADERS = Object.freeze([
  "Is NHTSA Reportable In-Transport", "Is NHTSA Reportable In-Transport Delta-V Less than 1 MPH",
  "Is Police-Reported", "Is Any-Injury-Reported", "Is Any Vehicle Airbag Deployment",
  "Is Ego Vehicle Airbag Deployment", "Is Suspected Serious Injury+", "Is Any Fatal Injury",
]);

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function digest(value) { return sha256(Buffer.from(canonicalizeStrict(value))); }
function artifactDigest(value) { return digest({ domain: WAYMO_SAFETY_IMPACT_EVIDENCE_SCHEMA, value }); }
function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function structuralShape(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const memberShapes = [...new Set(value.map((item) => canonicalizeStrict(structuralShape(item))))]
      .sort().map((item) => JSON.parse(item));
    return { type: "array", memberShapes };
  }
  if (typeof value === "object") {
    return {
      type: "object",
      fields: Object.fromEntries(Object.keys(value).sort()
        .map((key) => [key, structuralShape(value[key])])),
    };
  }
  return typeof value;
}
function structuralShapeHash(value) {
  return digest({
    domain: `${WAYMO_SAFETY_IMPACT_EVIDENCE_SCHEMA}/structural-shape/v1`,
    value: structuralShape(value),
  });
}
function canonicalTime(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${code}_INVALID`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${code}_NON_CANONICAL`);
  if (normalized !== FROZEN_AT) throw new Error(`${code}_NOT_FROZEN_SNAPSHOT`);
  return normalized;
}
function sortedCounts(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
function round(value, digits = 12) {
  if (!Number.isFinite(value)) throw new Error("WAYMO_ROUND_NONFINITE");
  return Number(value.toFixed(digits));
}

export function waymoSafetyImpactExpectedAcquisitionManifest() {
  return {
    schema: "outsider/waymo-safety-impact-acquisition-manifest/v1",
    sourceId: WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.sourceId,
    capturedAt: FROZEN_AT,
    transportAttested: false,
    objects: WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.files.map((file) => ({
      name: file.name, kind: file.kind, url: file.url, bytes: file.bytes, sha256: file.sha256,
      acquisition: "EXACT_HTTPS_CAPTURE_IMPORT",
    })),
  };
}

function stableReadExactManifest(directory, expectedBytes) {
  const target = path.join(directory, "acquisition.json");
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
    || pathBefore.size !== BigInt(expectedBytes.length)) {
    throw new Error("WAYMO_ACQUISITION_MANIFEST_UNSAFE");
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(target, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) throw new Error("WAYMO_ACQUISITION_MANIFEST_CHANGED");
    }
    if (!bytes.equals(expectedBytes)) throw new Error("WAYMO_ACQUISITION_MANIFEST_MISMATCH");
    return bytes;
  } finally { closeSync(fd); }
}

function stableReadSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || !sourceDirectory.trim()) throw new Error("WAYMO_SOURCE_DIRECTORY_INVALID");
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) throw new Error("WAYMO_SOURCE_DIRECTORY_TOO_BROAD");
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("WAYMO_SOURCE_DIRECTORY_UNSAFE");
  if (canonicalizeStrict(readdirSync(directory).sort()) !== canonicalizeStrict(EXPECTED_DIRECTORY_NAMES)) {
    throw new Error("WAYMO_SOURCE_DIRECTORY_PROFILE_MISMATCH");
  }
  const files = {};
  for (const expected of WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.files) {
    const target = path.join(directory, expected.name);
    const pathBefore = lstatSync(target, { bigint: true });
    if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.size !== BigInt(expected.bytes)
      || pathBefore.size > BigInt(MAX_FILE_BYTES)) throw new Error(`WAYMO_SOURCE_FILE_UNSAFE:${expected.name}`);
    const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const before = fstatSync(fd, { bigint: true });
      const bytes = readFileSync(fd);
      const after = fstatSync(fd, { bigint: true });
      const pathAfter = lstatSync(target, { bigint: true });
      for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
        if (before[field] !== after[field] || before[field] !== pathBefore[field]
          || before[field] !== pathAfter[field]) throw new Error(`WAYMO_SOURCE_FILE_CHANGED:${expected.name}`);
      }
      if (sha256(bytes) !== expected.sha256) throw new Error(`WAYMO_SOURCE_PIN_MISMATCH:${expected.name}`);
      files[expected.name] = bytes;
    } finally { closeSync(fd); }
  }
  const expectedManifest = Buffer.from(`${JSON.stringify(waymoSafetyImpactExpectedAcquisitionManifest(), null, 2)}\n`);
  stableReadExactManifest(directory, expectedManifest);
  return files;
}

function assertInputFiles(files) {
  if (!exactKeys(files, EXPECTED_NAMES)) throw new Error("WAYMO_INPUT_FILE_SET_INVALID");
  for (const name of EXPECTED_NAMES) {
    if (!Buffer.isBuffer(files[name]) || files[name].length <= 0 || files[name].length > MAX_FILE_BYTES) {
      throw new Error(`WAYMO_INPUT_FILE_INVALID:${name}`);
    }
  }
}
function officialPinsMatch(files) {
  return WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.files.every((expected) => (
    files[expected.name].length === expected.bytes && sha256(files[expected.name]) === expected.sha256
  ));
}

function parseCsv(bytes, code) {
  let text = bytes.toString("utf8");
  if (text.startsWith("\ufeff")) text = text.slice(1);
  const rawRows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      if (field.length !== 0) throw new Error(`${code}_QUOTE_INVALID`);
      quoted = true;
    } else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field); field = "";
      if (!(row.length === 1 && row[0] === "")) rawRows.push(row);
      row = [];
    } else field += char;
    if (field.length > 256 * 1024) throw new Error(`${code}_FIELD_TOO_LARGE`);
  }
  if (quoted) throw new Error(`${code}_UNCLOSED_QUOTE`);
  if (field.length > 0 || row.length > 0) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rawRows.push(row); }
  if (rawRows.length < 2) throw new Error(`${code}_NO_DATA`);
  const headers = rawRows[0];
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) throw new Error(`${code}_HEADER_INVALID`);
  const rows = rawRows.slice(1);
  if (rows.some((value) => value.length !== headers.length)) throw new Error(`${code}_ROW_WIDTH_INVALID`);
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  return { headers, rows, index };
}
function requireHeaders(table, expected, code) {
  if (canonicalizeStrict(table.headers) !== canonicalizeStrict(expected)) throw new Error(`${code}_SCHEMA_INVALID`);
}
function value(table, row, header) { return row[table.index[header]]; }
function numberValue(text, code, { blank = false } = {}) {
  if (text === "" && blank) return null;
  if (text.trim() !== text || text === "" || !Number.isFinite(Number(text))) {
    throw new Error(`${code}_NUMBER_INVALID:${JSON.stringify(text).slice(0, 80)}`);
  }
  return Number(text);
}
function booleanValue(text, code) {
  if (text === "TRUE") return true;
  if (text === "FALSE") return false;
  if (text === "Unknown") return "UNKNOWN";
  if (text === "") return null;
  throw new Error(`${code}_BOOLEAN_INVALID:${JSON.stringify(text).slice(0, 48)}`);
}
function millionMilesToIntegerString(text) {
  if (!/^\d+(?:\.\d{1,6})?$/u.test(text)) throw new Error("WAYMO_MILES_DECIMAL_INVALID");
  const [whole, fraction = ""] = text.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}

function millionMilesDisplayProfile(text) {
  const fractionDigits = text.includes(".") ? text.split(".")[1].length : 0;
  return {
    displayedPointMiles: millionMilesToIntegerString(text),
    displayedDecimalPlaces: fractionDigits,
    displayResolutionMiles: (10n ** BigInt(6 - fractionDigits)).toString(),
    displayedValueMayBeRounded: true,
  };
}

function milesEvidence(table) {
  requireHeaders(table, CSV1_HEADERS, "WAYMO_CSV1");
  const rows = table.rows.map((row) => {
    const published = value(table, row, "Waymo RO Miles (Millions)");
    return { geography: value(table, row, "County Name"),
      publishedMillions: numberValue(published, "WAYMO_CSV1_MILES"),
      publishedMillionsText: published,
      ...millionMilesDisplayProfile(published) };
  });
  if (new Set(rows.map((row) => row.geography)).size !== rows.length) throw new Error("WAYMO_CSV1_GEOGRAPHY_DUPLICATE");
  const map = new Map(rows.map((row) => [row.geography, row]));
  const leafNames = ["San Francisco", "San Mateo", "Santa Clara", "DeKalb", "Travis", "Fulton", "Los Angeles", "Maricopa"];
  const total = map.get("All Locations (mileage blended)");
  if (!total || leafNames.some((name) => !map.has(name))) throw new Error("WAYMO_CSV1_REQUIRED_GEOGRAPHY_MISSING");
  const leafMiles = leafNames.reduce((sum, name) => sum + BigInt(map.get(name).displayedPointMiles), 0n);
  if (leafMiles !== BigInt(total.displayedPointMiles)) throw new Error("WAYMO_CSV1_LEAF_TOTAL_MISMATCH");
  if (BigInt(map.get("San Francisco").displayedPointMiles) + BigInt(map.get("San Mateo").displayedPointMiles)
      + BigInt(map.get("Santa Clara").displayedPointMiles)
        !== BigInt(map.get("San Francisco Bay Area").displayedPointMiles)
    || BigInt(map.get("DeKalb").displayedPointMiles) + BigInt(map.get("Fulton").displayedPointMiles)
        !== BigInt(map.get("Atlanta Area").displayedPointMiles)) {
    throw new Error("WAYMO_CSV1_COMPOSITE_TOTAL_MISMATCH");
  }
  return { rows, map, displayedRoundedTotalRiderOnlyMiles: total.displayedPointMiles,
    displayedTotalRiderOnlyMilesMillions: total.publishedMillions,
    displayedExposureIsExactUnroundedMiles: false,
    leafGeographies: leafNames, displayedLeafPointTotalReconciled: true,
    overlappingCompositeRowsNotDoubleCounted: true };
}

function crashEvidence(table) {
  requireHeaders(table, CSV2_HEADERS, "WAYMO_CSV2");
  const reportIds = [], reportPairs = [], amendments = [], yearMonths = [], states = [], counties = [], roadTypes = [], crashTypes = [];
  const linkedPairRows = new Map();
  const minimizedRowCommitments = [];
  const flags = Object.fromEntries(CSV2_BOOLEAN_HEADERS.map((header) => (
    [header, { true: 0, false: 0, unknown: 0, missing: 0 }]
  )));
  let referenceRows = 0, holdoutRows = 0, outsideRows = 0, unlinkedSgoRows = 0;
  for (const row of table.rows) {
    const id = value(table, row, "SGO Report ID"), version = value(table, row, "SGO Report Version");
    const amendment = value(table, row, "SGO Amendment"), yearMonth = value(table, row, "Year Month");
    const linked = /^\d+-\d+$/u.test(id) && /^\d+$/u.test(version);
    const explicitlyUnlinked = id === "N/A" && version === "#N/A";
    if ((!linked && !explicitlyUnlinked) || !/^\d{6}$/u.test(yearMonth)) {
      throw new Error(`WAYMO_CSV2_ID_OR_PERIOD_INVALID:${JSON.stringify([id, version, yearMonth]).slice(0, 120)}`);
    }
    const numericMonth = Number(yearMonth);
    const month = numericMonth % 100;
    if (month < 1 || month > 12) throw new Error("WAYMO_CSV2_PERIOD_INVALID");
    const pair = `${id}|${version}`;
    if (linked) { reportIds.push(id); reportPairs.push(pair); }
    else unlinkedSgoRows += 1;
    amendments.push(amendment); yearMonths.push(yearMonth);
    const state = value(table, row, "State"), county = value(table, row, "County");
    const roadType = value(table, row, "Road Type"), crashType = value(table, row, "Crash Type");
    states.push(state); counties.push(county); roadTypes.push(roadType); crashTypes.push(crashType);
    const parsedFlags = {};
    for (const header of CSV2_BOOLEAN_HEADERS) {
      const parsed = booleanValue(value(table, row, header), "WAYMO_CSV2");
      parsedFlags[header] = parsed;
      flags[header][parsed === true ? "true" : parsed === false ? "false"
        : parsed === "UNKNOWN" ? "unknown" : "missing"] += 1;
    }
    const suppressed = {
      incidentDate: value(table, row, "Incident Date"),
      locationText: value(table, row, "Location Address / Description"),
      zipCode: value(table, row, "Zip Code"),
    };
    const minimized = { identityFingerprint: digest({ id, version }), amendment, yearMonth,
      state, county, roadType, crashType, outcomeFlags: parsedFlags,
      suppressedFieldFingerprints: {
        incidentDate: digest(suppressed.incidentDate),
        locationText: digest(suppressed.locationText),
        zipCode: digest(suppressed.zipCode),
      } };
    minimizedRowCommitments.push(minimized);
    if (linked) {
      const rows = linkedPairRows.get(pair) ?? [];
      rows.push({ outcomeFlags: parsedFlags, suppressed });
      linkedPairRows.set(pair, rows);
    }
    if (numericMonth <= 202512) referenceRows += 1;
    else if (numericMonth >= 202601 && numericMonth <= 202603) holdoutRows += 1;
    else outsideRows += 1;
  }
  const idCounts = sortedCounts(reportIds);
  const duplicateIds = Object.entries(idCounts).filter(([, count]) => count > 1);
  const duplicatePairRows = [...linkedPairRows.values()].filter((rows) => rows.length > 1);
  const duplicateIdVersionExtraRows = duplicatePairRows
    .reduce((total, rows) => total + rows.length - 1, 0);
  const duplicatePairsWithOutcomeFlagConflicts = duplicatePairRows.filter((rows) => (
    new Set(rows.map((item) => canonicalizeStrict(item.outcomeFlags))).size > 1
  )).length;
  const duplicatePairsWithSuppressedLocationTextConflicts = duplicatePairRows.filter((rows) => (
    new Set(rows.map((item) => item.suppressed.locationText)).size > 1
  )).length;
  const duplicatePairsWithSuppressedIncidentDateConflicts = duplicatePairRows.filter((rows) => (
    new Set(rows.map((item) => item.suppressed.incidentDate)).size > 1
  )).length;
  const duplicatePairsWithSuppressedZipCodeConflicts = duplicatePairRows.filter((rows) => (
    new Set(rows.map((item) => item.suppressed.zipCode)).size > 1
  )).length;
  const uniqueIds = Object.keys(idCounts).length;
  return {
    rows: table.rows.length, sgoLinkedRows: reportIds.length, unlinkedPreSgoOrUnavailableRows: unlinkedSgoRows,
    uniqueSgoReportIds: uniqueIds,
    duplicateSgoReportIds: duplicateIds.length,
    duplicateSgoIdVersionPairs: duplicatePairRows.length,
    duplicateIdVersionExtraRows,
    duplicatePairQuarantine: {
      pairs: duplicatePairRows.length,
      rows: duplicatePairRows.reduce((total, rows) => total + rows.length, 0),
      extraRowsBeyondOnePerPair: duplicateIdVersionExtraRows,
      pairsWithOutcomeFlagConflicts: duplicatePairsWithOutcomeFlagConflicts,
      pairsWithSuppressedLocationTextConflicts: duplicatePairsWithSuppressedLocationTextConflicts,
      pairsWithSuppressedIncidentDateConflicts: duplicatePairsWithSuppressedIncidentDateConflicts,
      pairsWithSuppressedZipCodeConflicts: duplicatePairsWithSuppressedZipCodeConflicts,
      rawIdentifiersPersisted: false,
      countedAsIndependentCrashUnits: false,
      automaticallyDeduplicatedOrAdjudicated: false,
    },
    excessRowsOverUniqueSgoIds: table.rows.length - uniqueIds,
    uniqueSgoIdVersionPairs: new Set(reportPairs).size,
    amendments: sortedCounts(amendments), period: { minimumYearMonth: [...yearMonths].sort()[0],
      maximumYearMonth: [...yearMonths].sort().at(-1) },
    states: sortedCounts(states), counties: sortedCounts(counties),
    roadTypes: sortedCounts(roadTypes), crashTypes: sortedCounts(crashTypes),
    rowMembershipOutcomeTrueCounts: Object.fromEntries(Object.entries(flags).sort(([left], [right]) => left.localeCompare(right))
      .map(([header, counts]) => [header, counts.true])),
    rowMembershipOutcomeFalseCounts: Object.fromEntries(Object.entries(flags).sort(([left], [right]) => left.localeCompare(right))
      .map(([header, counts]) => [header, counts.false])),
    rowMembershipOutcomeMissingCounts: Object.fromEntries(Object.entries(flags).sort(([left], [right]) => left.localeCompare(right))
      .map(([header, counts]) => [header, counts.missing])),
    rowMembershipOutcomeUnknownCounts: Object.fromEntries(Object.entries(flags).sort(([left], [right]) => left.localeCompare(right))
      .map(([header, counts]) => [header, counts.unknown])),
    independentCrashOutcomeCountsAfterDuplicateResolution: null,
    temporalSplitCandidate: {
      kind: "RETROSPECTIVE_CALENDAR_HOLDOUT_CANDIDATE_NOT_PROSPECTIVE",
      referenceThrough: "2025-12", holdoutFrom: "2026-01", holdoutThrough: "2026-03",
      referenceRows, holdoutRows, outsideOrInvalidRows: outsideRows,
      splitDeclaredBeforeThisArtifactButAfterOutcomesOccurred: true,
    },
    minimizedRowSemanticCommitmentHash: digest({ rows: minimizedRowCommitments
      .sort((left, right) => canonicalizeStrict(left).localeCompare(canonicalizeStrict(right))) }),
    minimizedRowSemanticCommitmentCovers: [
      "HASHED_ID_AND_VERSION", "AMENDMENT", "YEAR_MONTH", "STATE", "COUNTY",
      "ROAD_TYPE", "CRASH_TYPE", "ALL_EIGHT_OUTCOME_FLAGS",
      "HASHED_INCIDENT_DATE", "HASHED_LOCATION_TEXT", "HASHED_ZIP_CODE",
    ],
    rawSgoIdentifiersPersistedInArtifact: false,
    exactDatesAddressesAndZipCodesPersistedInArtifact: false,
  };
}

function benchmarkEvidence(table, miles) {
  requireHeaders(table, CSV3_HEADERS, "WAYMO_CSV3");
  const numericHeaders = CSV3_HEADERS.slice(5);
  const outcomes = [], comparisons = [], groupingTypes = [], partnerGroups = [];
  const missing = Object.fromEntries(numericHeaders.map((header) => [header, 0]));
  const blankMissing = Object.fromEntries(numericHeaders.map((header) => [header, 0]));
  const nonfiniteTokens = Object.fromEntries(numericHeaders.map((header) => [header, 0]));
  let negativeCountOrRateRows = 0, waymoCiOrderViolations = 0, benchmarkCiOrderViolations = 0;
  let naiveCountOverCsv1MilesEligibleRows = 0, naiveCountOverCsv1MilesDifferenceRows = 0;
  let maxNaiveCountOverCsv1MilesAbsoluteDifference = 0;
  let allLocationAllCrashDisplayedPointRateDifferenceRows = 0;
  let allLocationAllCrashImpliedExposureEligibleRows = 0;
  let allLocationAllCrashImpliedExposureWithinHalfDisplayUnitRows = 0;
  const allLocationFactors = [];
  for (const row of table.rows) {
    const outcome = value(table, row, "Outcome"), comparison = value(table, row, "Benchmark Comparison");
    const geography = value(table, row, "County Name"), grouping = value(table, row, "Grouping Type");
    const partner = value(table, row, "Conflict Partner Type Group");
    outcomes.push(outcome); comparisons.push(comparison); groupingTypes.push(grouping); partnerGroups.push(partner);
    const numbers = {};
    for (const header of numericHeaders) {
      const raw = value(table, row, header);
      // This release publishes the literal token `NaN` in two upper-bound
      // columns. Preserve that known source condition as null plus a separate
      // non-finite count; arbitrary non-finite spellings remain invalid input.
      if (raw === "NaN") {
        numbers[header] = null;
        nonfiniteTokens[header] += 1;
      } else {
        numbers[header] = numberValue(raw, `WAYMO_CSV3_${header}`, { blank: true });
        if (raw === "") blankMissing[header] += 1;
      }
      if (numbers[header] === null) missing[header] += 1;
    }
    if (["Waymo Count", "Waymo IPMM", "Benchmark IPMM", "Predicted Benchmark Count", "Waymo Rate Ratio"]
      .some((header) => numbers[header] !== null && numbers[header] < 0)) negativeCountOrRateRows += 1;
    if ([numbers["Waymo IPMM CI Lower"], numbers["Waymo IPMM"], numbers["Waymo IPMM CI Upper"]].every((item) => item !== null)
      && !(numbers["Waymo IPMM CI Lower"] <= numbers["Waymo IPMM"]
        && numbers["Waymo IPMM"] <= numbers["Waymo IPMM CI Upper"])) waymoCiOrderViolations += 1;
    if ([numbers["Benchmark IPMM CI Lower"], numbers["Benchmark IPMM"], numbers["Benchmark IPMM CI Upper"]].every((item) => item !== null)
      && !(numbers["Benchmark IPMM CI Lower"] <= numbers["Benchmark IPMM"]
        && numbers["Benchmark IPMM"] <= numbers["Benchmark IPMM CI Upper"])) benchmarkCiOrderViolations += 1;
    const exposureRow = miles.map.get(geography);
    const exposure = exposureRow?.publishedMillions;
    if (exposure && numbers["Waymo Count"] !== null && numbers["Waymo IPMM"] !== null) {
      naiveCountOverCsv1MilesEligibleRows += 1;
      const error = Math.abs(numbers["Waymo Count"] / exposure - numbers["Waymo IPMM"]);
      maxNaiveCountOverCsv1MilesAbsoluteDifference = Math.max(maxNaiveCountOverCsv1MilesAbsoluteDifference, error);
      if (error > 1e-12) naiveCountOverCsv1MilesDifferenceRows += 1;
      if (geography === "All Locations (mileage blended)" && grouping === "All Crashes" && partner === "All Crashes") {
        if (error > 1e-12) allLocationAllCrashDisplayedPointRateDifferenceRows += 1;
        if (numbers["Waymo Count"] > 0 && numbers["Waymo IPMM"] > 0) {
          allLocationAllCrashImpliedExposureEligibleRows += 1;
          const impliedExposureMillions = numbers["Waymo Count"] / numbers["Waymo IPMM"];
          const halfDisplayUnitMillions = Number(exposureRow.displayResolutionMiles) / 2 / 1_000_000;
          if (Math.abs(impliedExposureMillions - exposure) <= halfDisplayUnitMillions) {
            allLocationAllCrashImpliedExposureWithinHalfDisplayUnitRows += 1;
          }
        }
      }
    }
    if (geography === "All Locations (mileage blended)" && grouping === "All Crashes" && partner === "All Crashes") {
      allLocationFactors.push({ outcome, benchmarkComparison: comparison,
        waymoCount: numbers["Waymo Count"], waymoIPMM: numbers["Waymo IPMM"],
        waymoIPMMLower: numbers["Waymo IPMM CI Lower"], waymoIPMMUpper: numbers["Waymo IPMM CI Upper"],
        benchmarkIPMM: numbers["Benchmark IPMM"], benchmarkIPMMLower: numbers["Benchmark IPMM CI Lower"],
        benchmarkIPMMUpper: numbers["Benchmark IPMM CI Upper"], rateRatio: numbers["Waymo Rate Ratio"],
        rateRatioLower: numbers["Waymo Rate Ratio CI Lower"], rateRatioUpper: numbers["Waymo Rate Ratio CI Upper"] });
    }
  }
  return { rows: table.rows.length, outcomes: sortedCounts(outcomes), benchmarkComparisons: sortedCounts(comparisons),
    groupingTypes: sortedCounts(groupingTypes), conflictPartnerGroups: sortedCounts(partnerGroups),
    numericMissingness: Object.fromEntries(Object.entries(missing).sort(([left], [right]) => left.localeCompare(right))),
    blankNumericMissingness: Object.fromEntries(Object.entries(blankMissing)
      .sort(([left], [right]) => left.localeCompare(right))),
    publishedNonfiniteNumericTokens: Object.fromEntries(Object.entries(nonfiniteTokens)
      .sort(([left], [right]) => left.localeCompare(right))),
    qualityChecks: { negativeCountOrRateRows, waymoCiOrderViolations, benchmarkCiOrderViolations,
      naiveCountOverCsv1MilesEligibleRows, naiveCountOverCsv1MilesDifferenceRows,
      maxNaiveCountOverCsv1MilesAbsoluteDifference: round(maxNaiveCountOverCsv1MilesAbsoluteDifference, 15),
      naiveRowLevelIdentityIsNotAssumedByAdapter: true,
      allLocationAllCrashDisplayedPointRateDifferenceRows,
      allLocationAllCrashImpliedExposureEligibleRows,
      allLocationAllCrashImpliedExposureWithinHalfDisplayUnitRows,
      nearestRoundingSensitivityIsDiagnosticNotPublisherMethodClaim: true },
    allLocationAllCrashPublishedFactors: allLocationFactors.sort((left, right) => (
      `${left.outcome}|${left.benchmarkComparison}`.localeCompare(`${right.outcome}|${right.benchmarkComparison}`)
    )),
  };
}

function dynamicBenchmarkEvidence(table) {
  requireHeaders(table, CSV4_HEADERS, "WAYMO_CSV4");
  const outcomes = [], states = [], counties = [], composites = new Map(), cells = new Map();
  let negativeNumericRows = 0, missingBenchmarkCrashCountRows = 0;
  for (const row of table.rows) {
    const state = value(table, row, "state_name"), county = value(table, row, "county_name");
    const cell = value(table, row, "S2 Cell"), outcome = value(table, row, "Outcome");
    if (!/^\d+$/u.test(cell)) throw new Error("WAYMO_CSV4_S2_CELL_INVALID");
    const benchmark = numberValue(value(table, row, "Benchmark Crash Count"), "WAYMO_CSV4_BENCHMARK", { blank: true });
    const hpms = numberValue(value(table, row, "HPMS Yearly Vehicle Miles Traveled"), "WAYMO_CSV4_HPMS");
    const waymo = numberValue(value(table, row, "Waymo RO Miles"), "WAYMO_CSV4_WAYMO_MILES");
    if (benchmark === null) missingBenchmarkCrashCountRows += 1;
    if ((benchmark !== null && benchmark < 0) || hpms < 0 || waymo < 0) negativeNumericRows += 1;
    const composite = `${state}|${county}|${cell}|${outcome}`;
    const compositeState = composites.get(composite) ?? { rows: 0, benchmarkValues: new Set(),
      hpmsValues: new Set(), waymoValues: new Set() };
    compositeState.rows += 1;
    compositeState.benchmarkValues.add(benchmark === null ? "NULL" : String(benchmark));
    compositeState.hpmsValues.add(String(hpms));
    compositeState.waymoValues.add(String(waymo));
    composites.set(composite, compositeState);
    const cellKey = `${state}|${county}|${cell}`;
    const cellState = cells.get(cellKey) ?? { hpmsValues: new Set(), waymoValues: new Set(),
      firstHpms: hpms, firstWaymo: waymo };
    cellState.hpmsValues.add(String(hpms));
    cellState.waymoValues.add(String(waymo));
    cells.set(cellKey, cellState);
    outcomes.push(outcome); states.push(state); counties.push(county);
  }
  const duplicateComposites = [...composites.values()].filter((item) => item.rows > 1);
  const duplicateCompositeRows = duplicateComposites
    .reduce((total, item) => total + item.rows - 1, 0);
  const benchmarkConflictComposites = duplicateComposites
    .filter((item) => item.benchmarkValues.size > 1);
  const exposureConflictCells = [...cells.values()].filter((item) => (
    item.hpmsValues.size > 1 || item.waymoValues.size > 1
  ));
  return { rows: table.rows.length, distinctS2Cells: cells.size, outcomes: sortedCounts(outcomes),
    states: sortedCounts(states), counties: sortedCounts(counties),
    distinctCompositeKeys: composites.size,
    duplicateCompositeKeys: duplicateComposites.length,
    duplicateCompositeRows,
    benchmarkCrashCountConflictKeys: benchmarkConflictComposites.length,
    benchmarkCrashCountVariantExcess: benchmarkConflictComposites.reduce((total, item) => (
      total + item.benchmarkValues.size - 1
    ), 0),
    duplicateKeysWithoutBenchmarkCrashCountConflict:
      duplicateComposites.length - benchmarkConflictComposites.length,
    maximumBenchmarkCrashCountVariantsPerKey: Math.max(...duplicateComposites
      .map((item) => item.benchmarkValues.size)),
    duplicateRowsRetainedWithoutDeduplication: true,
    benchmarkCrashCountsAggregatedAcrossDuplicateKeys: false,
    negativeNumericRows, missingBenchmarkCrashCountRows,
    exposureValueConflictCellKeys: exposureConflictCells.length,
    exposureValueConflictsAcrossOutcomes: exposureConflictCells.length,
    distinctCellWaymoMiles: round([...cells.values()]
      .reduce((total, cell) => total + cell.firstWaymo, 0), 6),
    distinctCellHpmsYearlyVmt: round([...cells.values()]
      .reduce((total, cell) => total + cell.firstHpms, 0), 6),
    dataWindowThrough: "2025-03", alignedWithCsv1ToCsv3Through202603: false,
  };
}

function buildInternal(files, official) {
  assertInputFiles(files);
  const pinsMatch = officialPinsMatch(files);
  if (official && !pinsMatch) throw new Error("WAYMO_OFFICIAL_PROFILE_PIN_MISMATCH");
  const page = files["waymo-safety-impact-page-20260822.html"].toString("utf8").replace(/\s+/gu, " ");
  if (official) {
    const phrases = ["RO Miles through March 2026", "Total miles driven in each location (through March 2026)",
      "A list of cases with outcome group and other relevant collision information (through March 2026)",
      "Aggregated by outcome and location (through March 2026)",
      "Waymo RO miles reported by S2 cell through March 2025"];
    if (phrases.some((phrase) => !page.includes(phrase))) throw new Error("WAYMO_DATA_HUB_BOUNDARY_MISSING");
    if (!files["waymo-release-notes-20260624.pdf"].subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("WAYMO_RELEASE_NOTES_PDF_MAGIC_INVALID");
    }
  }
  const csv1 = parseCsv(files["waymo-csv1-ro-miles-20260624.csv"], "WAYMO_CSV1");
  const csv2 = parseCsv(files["waymo-csv2-sgo-crashes-20260624.csv"], "WAYMO_CSV2");
  const csv3 = parseCsv(files["waymo-csv3-benchmark-comparisons-20260624.csv"], "WAYMO_CSV3");
  const csv4 = parseCsv(files["waymo-csv4-dynamic-benchmark-20260624.csv"], "WAYMO_CSV4");
  const miles = milesEvidence(csv1), crashes = crashEvidence(csv2);
  const benchmarks = benchmarkEvidence(csv3, miles), dynamic = dynamicBenchmarkEvidence(csv4);
  const source = {
    sourceId: official ? WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.sourceId : "CALLER_PROVIDED_WAYMO_SHAPED_FIXTURE",
    publisher: official ? "WAYMO_LLC" : null,
    sourceReality: official ? "REAL_RIDER_ONLY_OPERATIONS_AND_SGO_LINKED_PUBLISHER_OUTCOME_EXPERIENCE" : "UNATTESTED_FIXTURE_BYTES",
    profileMatchedAtBuild: official,
    callerBytesMatchedFrozenPins: pinsMatch,
    capturedAt: official ? FROZEN_AT : null,
    files: EXPECTED_NAMES.map((name) => {
      const pin = WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.files.find((file) => file.name === name);
      return { name, kind: pin.kind, url: pin.url, bytes: files[name].length, sha256: sha256(files[name]) };
    }),
  };
  source.sourceSetHash = digest({ files: source.files });
  const body = {
    schema: WAYMO_SAFETY_IMPACT_EVIDENCE_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: FROZEN_AT,
    source,
    release: {
      publisherReleaseDate: "2026-06-24",
      csv1ToCsv3DataThrough: "2026-03",
      csv4SpatialBenchmarkInputsThrough: "2025-03",
      releaseNotesBytePinned: official,
      releaseNotesMachineTextParsed: false,
      livingDatasetSubjectToRevision: true,
    },
    exposure: {
      csvRows: miles.rows.length,
      displayedRoundedTotalRiderOnlyMiles: miles.displayedRoundedTotalRiderOnlyMiles,
      displayedTotalRiderOnlyMilesMillions: miles.displayedTotalRiderOnlyMilesMillions,
      displayedExposureIsExactUnroundedMiles: miles.displayedExposureIsExactUnroundedMiles,
      byPublishedGeography: miles.rows,
      leafGeographies: miles.leafGeographies,
      displayedLeafPointTotalReconciled: miles.displayedLeafPointTotalReconciled,
      overlappingCompositeRowsNotDoubleCounted: miles.overlappingCompositeRowsNotDoubleCounted,
      publisherMeasuredMilesIndependentlyAudited: false,
    },
    outcomes: crashes,
    benchmarkComparisons: benchmarks,
    dynamicBenchmarkInputs: dynamic,
    quality: {
      realRobotOperationsNotDowngradedForBeingPublisherData: official,
      byteIdentityAndCsvSchemasVerified: true,
      displayedExposureLeafAndCompositePointArithmeticReconciled: true,
      duplicateSgoIdentifiersPreserved: crashes.duplicateSgoReportIds > 0,
      duplicateSgoIdVersionPairsPreserved: crashes.duplicateSgoIdVersionPairs,
      duplicateSgoPairsWithOutcomeConflictsPreserved:
        crashes.duplicatePairQuarantine.pairsWithOutcomeFlagConflicts,
      duplicateSgoPairsWithSuppressedLocationTextConflictsPreserved:
        crashes.duplicatePairQuarantine.pairsWithSuppressedLocationTextConflicts,
      sgoRowsTreatedAsIndependentCrashCount: false,
      rowMembershipOutcomeFlagsTreatedAsDeduplicatedEventCounts: false,
      exactLocationAndDateSuppressedFromArtifact: true,
      outcomeMembershipPublisherDerived: true,
      publisherCsvReferencesNhtsaSgoReportIds: true,
      matchedNhtsaSgoReportsIndependentlyReplayed: false,
      independentCrashFactAdjudicationEstablished: false,
      faultOrCausalityEstablished: false,
      economicLossObserved: false,
      affectedPartyReceiptOrRecoveryObserved: false,
      crossManufacturerComparabilityEstablished: false,
      csv4WindowMismatchPreserved: dynamic.alignedWithCsv1ToCsv3Through202603 === false,
      naiveCountOverCsv1MilesDifferenceRows: benchmarks.qualityChecks.naiveCountOverCsv1MilesDifferenceRows,
      naiveRowLevelRateIdentityTreatedAsRequired: false,
      allLocationAllCrashDisplayedPointRateDifferenceRows:
        benchmarks.qualityChecks.allLocationAllCrashDisplayedPointRateDifferenceRows,
      allLocationAllCrashImpliedExposureWithinHalfDisplayUnitRows:
        benchmarks.qualityChecks.allLocationAllCrashImpliedExposureWithinHalfDisplayUnitRows,
      waymoCiOrderViolations: benchmarks.qualityChecks.waymoCiOrderViolations,
      benchmarkCiOrderViolations: benchmarks.qualityChecks.benchmarkCiOrderViolations,
      publishedLiteralNonfiniteTokens: Object.values(benchmarks.publishedNonfiniteNumericTokens)
        .reduce((total, count) => total + count, 0),
      csv4DuplicateCompositeRowsPreserved: dynamic.duplicateCompositeRows,
      csv4DuplicateCompositeKeysPreserved: dynamic.duplicateCompositeKeys,
      csv4BenchmarkCrashCountConflictKeysPreserved: dynamic.benchmarkCrashCountConflictKeys,
      csv4DuplicateRowsDeduplicatedOrAggregated: false,
      temporalHoldoutIsRetrospectiveNotProspective: true,
    },
    calibrationReference: {
      contract: "outsider/source-domain-outcome-exposure-reference/v1",
      decision: official ? "ADMIT_BOUNDED_WAYMO_PUBLISHED_REFERENCE_ONLY" : "REJECT_UNATTESTED_FIXTURE",
      sourceDomain: "WAYMO_RIDER_ONLY_ROAD_OPERATIONS",
      exposureDisplayedPointMiles: official ? miles.displayedRoundedTotalRiderOnlyMiles : null,
      exposureExactUnroundedMiles: null,
      sgoOutcomeRows: official ? crashes.rows : 0,
      uniqueSgoIdentifiers: official ? crashes.uniqueSgoReportIds : 0,
      allLocationPublishedFactorRows: official ? benchmarks.allLocationAllCrashPublishedFactors.length : 0,
      targetTransfer: false,
      actualOutsiderModelCalibrated: false,
      statisticalCapabilityImprovementEstablished: false,
      requiredBeforeTargetUse: [
        "PIN_AND_REPLAY_MATCHED_NHTSA_SGO_VERSIONS_WITHOUT_ASSUMING_PUBLISHER_GROUP_MEMBERSHIP_IS_INDEPENDENT",
        "RESOLVE_DUPLICATE_SGO_IDENTIFIER_EVENT_UNIT",
        "KEEP_CSV4_202503_WINDOW_SEPARATE_FROM_CSV1_TO_CSV3_202603",
        "INDEPENDENTLY_REVIEW_BENCHMARK_METHOD_AND_LOCATION_ADJUSTMENT",
        "ESTABLISH_TARGET_PLATFORM_ODD_SYSTEM_VERSION_AND_REPORTING_REGIME_MATCH",
        "OBTAIN_LOSS_CAUSALITY_AFFECTED_PARTY_AND_ADJUDICATION_FIELDS",
        "ESTABLISH_REUSE_AND_MODEL_TRAINING_RIGHTS_SEPARATELY",
      ],
    },
    trainingCandidate: {
      contract: "outsider/source-domain-training-candidate/v1",
      decision: "NOT_FOR_BEHAVIOR_MODEL_TRAINING_RIGHTS_AND_TARGET_TRANSFER_UNESTABLISHED",
      candidateRows: 0,
      trainerRowsEnqueued: 0,
      automaticTraining: false,
      sourceDomainCalibrationReferenceOnly: official,
      publicDownloadDoesNotEqualTrainingGrant: true,
    },
    modelEntrance: {
      TRAIN: false, PRICE: false, CAPITAL: false, COVERAGE: false, SETTLE: false,
      sourceDomainCalibrationReferenceOnly: official,
      frequencyModelEligible: false,
      severityModelEligible: false,
      targetHoldoutEligible: false,
    },
    authority: { mode: "none", TRAIN: false, PRICE: false, CAPITAL: false,
      COVERAGE: false, SETTLE: false, movesFunds: false },
  };
  return Object.freeze({ ...body, artifactHash: artifactDigest(body) });
}

export function buildWaymoSafetyImpactEvidenceFromBytes(files, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("WAYMO_BUILD_OPTIONS_INVALID");
  }
  canonicalTime(options.generatedAt ?? FROZEN_AT, "WAYMO_GENERATED_AT");
  return buildInternal(files, false);
}
export function buildWaymoSafetyImpactEvidenceFromSourceDirectory(sourceDirectory, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("WAYMO_BUILD_OPTIONS_INVALID");
  }
  canonicalTime(options.generatedAt ?? FROZEN_AT, "WAYMO_GENERATED_AT");
  return buildInternal(stableReadSourceDirectory(sourceDirectory), true);
}

function structuralErrors(artifact) {
  const errors = [];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return ["ARTIFACT_INVALID"];
  const { artifactHash, ...body } = artifact;
  if (artifact.schema !== WAYMO_SAFETY_IMPACT_EVIDENCE_SCHEMA) errors.push("SCHEMA_INVALID");
  if (artifact.generatedAt !== FROZEN_AT) errors.push("GENERATED_AT_INVALID");
  if (structuralShapeHash(artifact) !== ARTIFACT_STRUCTURAL_SHAPE_HASH) {
    errors.push("ARTIFACT_STRUCTURAL_SHAPE_INVALID");
  }
  if (artifactHash !== artifactDigest(body)) errors.push("ARTIFACT_HASH_INVALID");
  if (artifactHash !== CANONICAL_ARTIFACT_HASH) errors.push("FIXED_CANONICAL_PROJECTION_INVALID");
  if (artifact.exposure?.overlappingCompositeRowsNotDoubleCounted !== true
    || artifact.exposure?.displayedExposureIsExactUnroundedMiles !== false
    || artifact.quality?.sgoRowsTreatedAsIndependentCrashCount !== false
    || artifact.quality?.csv4WindowMismatchPreserved !== true
    || artifact.outcomes?.duplicatePairQuarantine?.countedAsIndependentCrashUnits !== false
    || artifact.outcomes?.duplicatePairQuarantine?.automaticallyDeduplicatedOrAdjudicated !== false
    || artifact.quality?.rowMembershipOutcomeFlagsTreatedAsDeduplicatedEventCounts !== false
    || artifact.quality?.publisherCsvReferencesNhtsaSgoReportIds !== true
    || artifact.quality?.matchedNhtsaSgoReportsIndependentlyReplayed !== false
    || artifact.dynamicBenchmarkInputs?.duplicateRowsRetainedWithoutDeduplication !== true
    || artifact.dynamicBenchmarkInputs?.benchmarkCrashCountsAggregatedAcrossDuplicateKeys !== false
    || artifact.quality?.csv4DuplicateRowsDeduplicatedOrAggregated !== false
    || artifact.quality?.independentCrashFactAdjudicationEstablished !== false
    || artifact.quality?.faultOrCausalityEstablished !== false
    || artifact.quality?.economicLossObserved !== false
    || artifact.quality?.affectedPartyReceiptOrRecoveryObserved !== false
    || artifact.outcomes?.temporalSplitCandidate?.kind !== "RETROSPECTIVE_CALENDAR_HOLDOUT_CANDIDATE_NOT_PROSPECTIVE") {
    errors.push("QUALITY_BOUNDARY_INVALID");
  }
  if (artifact.trainingCandidate?.automaticTraining !== false || artifact.trainingCandidate?.trainerRowsEnqueued !== 0
    || artifact.calibrationReference?.targetTransfer !== false
    || artifact.calibrationReference?.actualOutsiderModelCalibrated !== false
    || artifact.calibrationReference?.statisticalCapabilityImprovementEstablished !== false
    || artifact.trainingCandidate?.candidateRows !== 0
    || artifact.trainingCandidate?.publicDownloadDoesNotEqualTrainingGrant !== true
    || artifact.modelEntrance?.TRAIN !== false || artifact.modelEntrance?.PRICE !== false
    || artifact.modelEntrance?.CAPITAL !== false || artifact.modelEntrance?.COVERAGE !== false
    || artifact.modelEntrance?.SETTLE !== false || artifact.authority?.mode !== "none"
    || ["TRAIN", "PRICE", "CAPITAL", "COVERAGE", "SETTLE", "movesFunds"]
      .some((key) => artifact.authority?.[key] !== false)) errors.push("AUTHORITY_BOUNDARY_INVALID");
  return [...new Set(errors)];
}
export function verifyWaymoSafetyImpactEvidence(artifact) {
  const errors = structuralErrors(artifact);
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors),
    verificationLevel: "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION",
    sourceArtifactsReverified: false,
    realCaseOrExperienceAdmissionEstablished: false, calibrationEstablished: false,
    trainingAdmissionEstablished: false, authorityEstablished: false });
}
export function verifyWaymoSafetyImpactEvidenceWithSource(artifact, sourceDirectory) {
  const errors = structuralErrors(artifact);
  let sourceProfileReproduced = false, candidateArtifactExactlyRebuilt = false;
  try {
    const rebuilt = buildWaymoSafetyImpactEvidenceFromSourceDirectory(sourceDirectory,
      { generatedAt: artifact?.generatedAt });
    sourceProfileReproduced = true;
    candidateArtifactExactlyRebuilt = canonicalizeStrict(rebuilt) === canonicalizeStrict(artifact);
    if (!candidateArtifactExactlyRebuilt) errors.push("EXACT_REBUILD_MISMATCH");
  } catch (error) { errors.push(`SOURCE_REPLAY_FAILED:${error.message}`); }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]),
    verificationLevel: "FULL_SOURCE_REPLAY", sourceArtifactsReverified: sourceProfileReproduced,
    sourceProfileReproduced, candidateArtifactExactlyRebuilt,
    exactPublisherSourceReplayEstablished: sourceProfileReproduced && candidateArtifactExactlyRebuilt,
    realCaseOrExperienceAdmissionEstablished: sourceProfileReproduced && candidateArtifactExactlyRebuilt,
    realPublishedOperationalExperienceAdmissionEstablished:
      sourceProfileReproduced && candidateArtifactExactlyRebuilt,
    independentOutcomeTruthEstablished: false,
    underlyingWorldTruthEstablished: false,
    calibrationEstablished: false, trainingAdmissionEstablished: false, authorityEstablished: false });
}
