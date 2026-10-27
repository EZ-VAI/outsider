/*
 * Frozen FRA railroad outcome/exposure experience plus a strictly deferred
 * PHMSA gas-distribution incident receipt.
 *
 * Public origin does not demote real observations. Outsider's collection also
 * does not upgrade operator reports into adjudicated causality, paid loss,
 * target-domain authority, or permission to train/price/guarantee/settle.
 */

import { createHash } from "node:crypto";
import {
  accessSync, closeSync, constants as fsConstants, fstatSync, lstatSync,
  openSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const FRA_PHMSA_SAFETY_EVIDENCE_SCHEMA = "outsider/fra-phmsa-real-safety-evidence/v2";
const FROZEN_AT = "2026-08-21T14:30:00.000Z";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_SOURCE_FILE_BYTES = 4 * 1024 * 1024;
const ACQUISITION_NAME = "acquisition.json";

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }

function canonicalQuerySpec({ datasetId, select, where, groupBy = null, having = null,
  orderBy = null, limit = null, responseSchema }) {
  const clauses = [["$select", select], ["$where", where], ["$group", groupBy],
    ["$having", having], ["$order", orderBy], ["$limit", limit === null ? null : String(limit)]]
    .filter(([, value]) => value !== null);
  const canonicalSoql = [`SELECT ${select}`, `WHERE ${where}`,
    groupBy === null ? null : `GROUP BY ${groupBy}`,
    having === null ? null : `HAVING ${having}`,
    orderBy === null ? null : `ORDER BY ${orderBy}`,
    limit === null ? null : `LIMIT ${limit}`].filter(Boolean).join(" ");
  const parameters = new URLSearchParams(clauses);
  return Object.freeze({ datasetId, canonicalSoql,
    canonicalSoqlSha256: sha256(Buffer.from(canonicalSoql, "utf8")),
    responseSchema: Object.freeze([...responseSchema]),
    url: `https://data.transportation.gov/resource/${datasetId}.json?${parameters.toString()}` });
}

export const FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821 = Object.freeze({
  form54Count: canonicalQuerySpec({
    datasetId: "85tf-25kj",
    select: "count(*) as selected_rows,count(distinct incidentkey) as distinct_incidents,count(jointcd) as jointcd_observed,count(year) as year_observed",
    where: "year between '2015' and '2019' and jointcd='1'",
    responseSchema: ["selected_rows", "distinct_incidents", "jointcd_observed", "year_observed"],
  }),
  form54Annual: canonicalQuerySpec({
    datasetId: "85tf-25kj",
    select: "year as report_year,count(*) as selected_rows,count(distinct incidentkey) as distinct_incidents,count(totaldamagecost) as damage_observed,coalesce(sum(totaldamagecost),0) as total_reported_damage,count(reportingrailroadfatalitiesfor55a) as fatalities_observed,coalesce(sum(reportingrailroadfatalitiesfor55a),0) as official_fatalities,count(reportingrailroadinjuriesfor55a) as injuries_observed,coalesce(sum(reportingrailroadinjuriesfor55a),0) as official_injuries,count(hazmatreleasedcars) as hazmat_releases_observed,coalesce(sum(hazmatreleasedcars),0) as hazmat_released_cars,count(personsevacuated) as evacuated_observed,coalesce(sum(personsevacuated),0) as persons_evacuated",
    where: "year between '2015' and '2019' and jointcd='1'", groupBy: "year", orderBy: "year", limit: 50_000,
    responseSchema: ["report_year", "selected_rows", "distinct_incidents", "damage_observed",
      "total_reported_damage", "fatalities_observed", "official_fatalities", "injuries_observed",
      "official_injuries", "hazmat_releases_observed", "hazmat_released_cars", "evacuated_observed",
      "persons_evacuated"],
  }),
  form54CauseType: canonicalQuerySpec({
    datasetId: "85tf-25kj",
    select: "year as report_year,coalesce(accident_type_code,'UNREPORTED') as accident_type_code,coalesce(accidentcausecode,'UNREPORTED') as accident_cause_code,count(*) as incident_count",
    where: "year between '2015' and '2019' and jointcd='1'",
    groupBy: "year,accident_type_code,accidentcausecode",
    orderBy: "year,accident_type_code,accidentcausecode", limit: 50_000,
    responseSchema: ["report_year", "accident_type_code", "accident_cause_code", "incident_count"],
  }),
  form55Count: canonicalQuerySpec({
    datasetId: "m8i6-zdsy",
    select: "count(*) as published_rows,count(year) as year_observed,count(totalmiles) as totalmiles_observed",
    where: "year between '2015' and '2019'",
    responseSchema: ["published_rows", "year_observed", "totalmiles_observed"],
  }),
  form55Annual: canonicalQuerySpec({
    datasetId: "m8i6-zdsy",
    select: "year as report_year,count(*) as published_rows,count(totalmiles) as totalmiles_observed,coalesce(sum(totalmiles),0) as total_train_miles,count(freighttrainmiles) as freight_observed,coalesce(sum(freighttrainmiles),0) as freight_train_miles,count(passengertrainmiles) as passenger_observed,coalesce(sum(passengertrainmiles),0) as passenger_train_miles,count(yardswitchingmiles) as yard_observed,coalesce(sum(yardswitchingmiles),0) as yard_switching_miles,count(othertrainmiles) as other_observed,coalesce(sum(othertrainmiles),0) as other_train_miles,count(employeemanhours) as hours_observed,coalesce(sum(employeemanhours),0) as employee_hours,count(passengermiles) as passenger_miles_observed,coalesce(sum(passengermiles),0) as passenger_miles,count(passengerstransported) as passengers_observed,coalesce(sum(passengerstransported),0) as passengers_transported",
    where: "year between '2015' and '2019'", groupBy: "year", orderBy: "year", limit: 50_000,
    responseSchema: ["report_year", "published_rows", "totalmiles_observed", "total_train_miles",
      "freight_observed", "freight_train_miles", "passenger_observed", "passenger_train_miles",
      "yard_observed", "yard_switching_miles", "other_observed", "other_train_miles",
      "hours_observed", "employee_hours", "passenger_miles_observed", "passenger_miles",
      "passengers_observed", "passengers_transported"],
  }),
  form55DuplicateGroups: canonicalQuerySpec({
    datasetId: "m8i6-zdsy",
    select: "year as report_year,reportmonth as report_month,railroadcode as railroad_code,count(*) as duplicate_rows",
    where: "year between '2015' and '2019'", groupBy: "year,reportmonth,railroadcode",
    having: "count(*) > 1", orderBy: "year,reportmonth,railroadcode", limit: 50_000,
    responseSchema: ["report_year", "report_month", "railroad_code", "duplicate_rows"],
  }),
  form55DuplicateMetrics: canonicalQuerySpec({
    datasetId: "m8i6-zdsy",
    select: "year as report_year,reportmonth as report_month,count(*) as identical_rows,coalesce(freighttrainmiles,0) as freight_train_miles,coalesce(passengertrainmiles,0) as passenger_train_miles,coalesce(yardswitchingmiles,0) as yard_switching_miles,coalesce(othertrainmiles,0) as other_train_miles,coalesce(totalmiles,0) as total_train_miles,coalesce(employeemanhours,0) as employee_hours,coalesce(passengermiles,0) as passenger_miles,coalesce(passengerstransported,0) as passengers_transported",
    where: "year between '2015' and '2019'",
    groupBy: "year,reportmonth,railroadcode,freighttrainmiles,passengertrainmiles,yardswitchingmiles,othertrainmiles,totalmiles,employeemanhours,passengermiles,passengerstransported",
    having: "count(*) > 1",
    orderBy: "year,reportmonth,railroadcode,freighttrainmiles,passengertrainmiles,yardswitchingmiles,othertrainmiles,totalmiles,employeemanhours,passengermiles,passengerstransported",
    limit: 50_000,
    responseSchema: ["report_year", "report_month", "identical_rows", "freight_train_miles",
      "passenger_train_miles", "yard_switching_miles", "other_train_miles", "total_train_miles",
      "employee_hours", "passenger_miles", "passengers_transported"],
  }),
});

const FILES = [
  {
    name: "fra54-metadata.json", lane: "FRA", kind: "SOCRATA_DATASET_METADATA",
    url: "https://data.transportation.gov/api/views/85tf-25kj", bytes: 243_307,
    sha256: "sha256:533359b59a675a0dd9fc4e9539108bd002b459abb9fe21138df84b15964f9ae5",
  },
  {
    name: "fra54-unique-metadata.json", lane: "FRA", kind: "SOCRATA_UNIQUE_VIEW_METADATA",
    url: "https://data.transportation.gov/api/views/p3vu-f6gp", bytes: 257_639,
    sha256: "sha256:7cee82ed3dd66344cfbe4dc14bf82ad68ae2b715b1c3842701d4b3c31f9da4fa",
  },
  {
    name: "p3vu-error.json", lane: "FRA", kind: "SOCRATA_UNIQUE_VIEW_ERROR_BODY_HTTP_400",
    url: "https://data.transportation.gov/resource/p3vu-f6gp.json?%24limit=1", bytes: 26_549,
    sha256: "sha256:27762b6fe528671efab88c404637d18bea64e9ede6c1efb67385a83ac558c45b",
  },
  { name: "fra54-canonical-count.json", lane: "FRA", kind: "FORM54_CANONICAL_COUNT_API_RESPONSE",
    ...FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form54Count, bytes: 108,
    sha256: "sha256:c27468f57769dfbf176de1ab0b4ff2a69999dddb98fd287f6cc79c63111c4a24" },
  { name: "fra54-canonical-annual.json", lane: "FRA", kind: "FORM54_CANONICAL_ANNUAL_API_RESPONSE",
    ...FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form54Annual, bytes: 1_811,
    sha256: "sha256:0fd370d867693d734b9c5d6198f67b064ee5461094664f5d0da9f60520a12696" },
  { name: "fra54-canonical-cause-type.json", lane: "FRA", kind: "FORM54_CANONICAL_CAUSE_TYPE_API_RESPONSE",
    ...FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form54CauseType, bytes: 208_555,
    sha256: "sha256:fb570a47ca3f476c21755cd8ba504af1ac757f5cd8bb058af771e74b1f7ad760" },
  {
    name: "fra55-metadata.json", lane: "FRA", kind: "SOCRATA_DATASET_METADATA",
    url: "https://data.transportation.gov/api/views/m8i6-zdsy", bytes: 60_301,
    sha256: "sha256:84b10c3c8762a8fc019d5d5beb7d4cb4c1fab70e3d4df706529a7ebe07eb01ba",
  },
  { name: "fra55-canonical-count.json", lane: "FRA", kind: "FORM55_CANONICAL_COUNT_API_RESPONSE",
    ...FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form55Count, bytes: 83,
    sha256: "sha256:6360b17d2f198520e682a4031671eeefbd7fa02cf590728fd0cd3dcd62b6f271" },
  { name: "fra55-canonical-annual.json", lane: "FRA", kind: "FORM55_CANONICAL_ANNUAL_API_RESPONSE",
    ...FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form55Annual, bytes: 2_646,
    sha256: "sha256:f363f7b6166584fd3da201b3d6d9e0956328938671c27cab9ed91eedb515236c" },
  { name: "fra55-canonical-duplicate-groups.json", lane: "FRA",
    kind: "FORM55_CANONICAL_COMPOSITE_KEY_DUPLICATE_API_RESPONSE",
    ...FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form55DuplicateGroups, bytes: 87,
    sha256: "sha256:ec2778e75840937f6bd736fa563acc4591a697a8ae283762061499c07f49f205" },
  { name: "fra55-canonical-duplicate-metrics.json", lane: "FRA",
    kind: "FORM55_CANONICAL_PRIVACY_SAFE_DUPLICATE_METRICS_API_RESPONSE",
    ...FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form55DuplicateMetrics, bytes: 282,
    sha256: "sha256:012b35722e51703fc8cea32e4d7369055eeaa65ce54f6ad24d51b56c1dd39a11" },
  {
    name: "incident_gas_distribution_jan2010_present.zip", lane: "PHMSA",
    kind: "OPERATOR_SUBMITTED_INCIDENT_ZIP_WITH_SCHEMA",
    url: "https://www.phmsa.dot.gov/sites/phmsa.dot.gov/files/data_statistics/pipeline/incident_gas_distribution_jan2010_present.zip",
    bytes: 1_599_619, sha256: "sha256:5850554f7498e5fb6faf97274416f06c8305a48e0689845ae29b898a7e747426",
  },
];

export const FRA_PHMSA_FROZEN_SOURCE_20260821 = Object.freeze({
  sourceId: "FRA_FORM54_FORM55_QUERY_BOUND_2015_2019_AND_PHMSA_GD_INCIDENT_RECEIPT_20260821_V2",
  frozenAt: FROZEN_AT,
  files: Object.freeze(FILES.map((file) => Object.freeze({ ...file,
    ...(file.responseSchema ? { responseSchema: Object.freeze([...file.responseSchema]) } : {}) }))),
});

const EXPECTED_NAMES = Object.freeze(FILES.map((file) => file.name));
const PHMSA_DATA_MEMBER = "incident_gas_distribution_jan2010_present.txt";
const PHMSA_SCHEMA_MEMBER = "Gas Distribution Incident Form - PHMSA F 7100.1 Rev 9-2023 Data fields.pdf";
const PHMSA_DATA_HASH = "sha256:6f1f3bb7fa4502c93ae66855d2ea11fbcd38edf06abde3172ae3a518cd95404f";
const PHMSA_SCHEMA_HASH = "sha256:706c2a603e435d530ebb2ebaee7d566b9fae6e89607794a06a7b4afce2f8160d";
const PHMSA_HEADER_HASH = "sha256:2c04994e67fdc28e72b49038186de3118b8b5bb02037b7210265b9eaf4ae07e5";

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
function json(bytes, name) {
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`FRA_PHMSA_JSON_INVALID:${name}`); }
}
function integer(value, code) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) throw new Error(code);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(code);
  return number;
}
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function ratio(numerator, denominator, scale) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("FRA_PHMSA_RATIO_INPUT_INVALID");
  }
  return { numerator: String(numerator), denominator: String(denominator), scale,
    value: Number(((numerator * scale) / denominator).toFixed(9)) };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
function zipEntries(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error("FRA_PHMSA_ZIP_END_MISSING");
  const entryCount = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0
    || bytes.readUInt16LE(end + 8) !== entryCount || entryCount !== 2
    || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
    || centralOffset + centralSize > end) throw new Error("FRA_PHMSA_ZIP_PROFILE_INVALID");
  const entries = new Map();
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("FRA_PHMSA_ZIP_CENTRAL_INVALID");
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || next > end
      || uncompressedSize > 8 * 1024 * 1024 || localOffset + 30 > centralOffset
      || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("FRA_PHMSA_ZIP_ENTRY_UNSUPPORTED");
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!name || name.startsWith("/") || name.includes("\\") || name.includes("..") || entries.has(name)) {
      throw new Error("FRA_PHMSA_ZIP_ENTRY_NAME_INVALID");
    }
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (localName !== name || dataOffset + compressedSize > centralOffset) {
      throw new Error("FRA_PHMSA_ZIP_LOCAL_BINDING_INVALID");
    }
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let output;
    try { output = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed,
      { maxOutputLength: Math.max(1, uncompressedSize) }); } catch {
      throw new Error("FRA_PHMSA_ZIP_INFLATE_INVALID");
    }
    if (output.length !== uncompressedSize || crc32(output) !== expectedCrc) {
      throw new Error("FRA_PHMSA_ZIP_ENTRY_INTEGRITY_INVALID");
    }
    total += output.length;
    if (total > 12 * 1024 * 1024) throw new Error("FRA_PHMSA_ZIP_TOTAL_TOO_LARGE");
    entries.set(name, output);
    cursor = next;
  }
  if (cursor !== centralOffset + centralSize) throw new Error("FRA_PHMSA_ZIP_CENTRAL_LENGTH_INVALID");
  return entries;
}

function fileProjection(file, actualBytes = file.bytes, actualHash = file.sha256) {
  return { name: file.name, lane: file.lane, kind: file.kind, url: file.url,
    bytes: actualBytes, sha256: actualHash,
    captureRepresentation: file.lane === "PHMSA"
      ? "BROWSER_DOWNLOADED_PUBLISHER_FILE_BYTES" : "EXACT_OFFICIAL_API_RESPONSE_BYTES",
    ...(file.canonicalSoql ? { datasetId: file.datasetId, canonicalSoql: file.canonicalSoql,
      canonicalSoqlSha256: file.canonicalSoqlSha256, responseSchema: [...file.responseSchema] } : {}) };
}

function expectedManifest() {
  const files = FILES.map((file) => fileProjection(file));
  return { schema: "outsider/fra-phmsa-safety-source-acquisition/v2",
    sourceId: FRA_PHMSA_FROZEN_SOURCE_20260821.sourceId, frozenAt: FROZEN_AT,
    sourceCount: files.length, sourceBytes: files.reduce((total, file) => total + file.bytes, 0),
    canonicalQueryReceiptCount: files.filter((file) => file.canonicalSoql).length,
    allCanonicalQueriesBoundToResponsePins: true, transportAttested: false, files };
}

function officialProfile(files) {
  return FILES.every((expected) => Buffer.isBuffer(files[expected.name])
    && files[expected.name].length === expected.bytes && sha256(files[expected.name]) === expected.sha256);
}

function stableReadFile(target, expectedName) {
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.size <= 0n
    || pathBefore.size > BigInt(MAX_SOURCE_FILE_BYTES)) throw new Error(`FRA_PHMSA_SOURCE_FILE_UNSAFE:${expectedName}`);
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]) {
        throw new Error(`FRA_PHMSA_SOURCE_FILE_CHANGED:${expectedName}`);
      }
    }
    return bytes;
  } finally { closeSync(fd); }
}

function stableReadSourceDirectory(directory) {
  const root = path.resolve(directory);
  const stat = lstatSync(root, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("FRA_PHMSA_SOURCE_DIRECTORY_UNSAFE");
  accessSync(root, fsConstants.R_OK);
  const actual = readdirSync(root).sort();
  const expected = [...EXPECTED_NAMES, ACQUISITION_NAME].sort();
  if (canonicalizeStrict(actual) !== canonicalizeStrict(expected)) {
    throw new Error("FRA_PHMSA_SOURCE_DIRECTORY_PROFILE_MISMATCH");
  }
  const files = {};
  for (const expectedFile of FILES) {
    const bytes = stableReadFile(path.join(root, expectedFile.name), expectedFile.name);
    if (bytes.length !== expectedFile.bytes || sha256(bytes) !== expectedFile.sha256) {
      throw new Error(`FRA_PHMSA_SOURCE_PIN_MISMATCH:${expectedFile.name}`);
    }
    files[expectedFile.name] = bytes;
  }
  const manifestBytes = stableReadFile(path.join(root, ACQUISITION_NAME), ACQUISITION_NAME);
  const manifest = json(manifestBytes, ACQUISITION_NAME);
  if (canonicalizeStrict(manifest) !== canonicalizeStrict(expectedManifest())) {
    throw new Error("FRA_PHMSA_ACQUISITION_MANIFEST_MISMATCH");
  }
  return { files, manifestHash: sha256(manifestBytes) };
}

function parseMetadata(bytes, id, requiredFields) {
  const value = json(bytes, `${id}-metadata`);
  if (value.id !== id || !Array.isArray(value.columns)) throw new Error(`FRA_PHMSA_METADATA_ID_INVALID:${id}`);
  const columns = new Map(value.columns.map((column) => [column.fieldName, column]));
  for (const field of requiredFields) if (!columns.has(field)) throw new Error(`FRA_PHMSA_METADATA_FIELD_MISSING:${id}:${field}`);
  const common = value.metadata?.custom_fields?.["Common Core"] ?? {};
  if (common.License !== "http://www.usa.gov/publicdomain/label/1.0/") {
    throw new Error(`FRA_PHMSA_METADATA_LICENSE_INVALID:${id}`);
  }
  return { datasetId: id, name: value.name, assetType: value.assetType,
    rowsUpdatedAt: new Date(value.rowsUpdatedAt * 1000).toISOString(), columnCount: value.columns.length,
    schemaHash: digest(value.columns.map((column) => [column.position, column.fieldName,
      column.dataTypeName, column.description ?? null])), publicDomainLicenseDeclared: true,
    publisher: common.Publisher ?? "FEDERAL_RAILROAD_ADMINISTRATION" };
}

const FORM54_ANNUAL_FIELDS = FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form54Annual.responseSchema;
const FORM55_ANNUAL_FIELDS = FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form55Annual.responseSchema;
const FORM55_METRICS = [
  ["totalmiles_observed", "total_train_miles"], ["freight_observed", "freight_train_miles"],
  ["passenger_observed", "passenger_train_miles"], ["yard_observed", "yard_switching_miles"],
  ["other_observed", "other_train_miles"], ["hours_observed", "employee_hours"],
  ["passenger_miles_observed", "passenger_miles"], ["passengers_observed", "passengers_transported"],
];

function queryRows(files, name) {
  const receipt = FILES.find((file) => file.name === name);
  if (!receipt?.canonicalSoql || sha256(Buffer.from(receipt.canonicalSoql, "utf8"))
    !== receipt.canonicalSoqlSha256) throw new Error(`FRA_PHMSA_QUERY_BINDING_INVALID:${name}`);
  const rows = json(files[name], name);
  if (!Array.isArray(rows) || rows.some((row) => !exactKeys(row, receipt.responseSchema))) {
    throw new Error(`FRA_PHMSA_QUERY_RESPONSE_SCHEMA_INVALID:${name}`);
  }
  return rows;
}

function parseFra(files) {
  const form54Metadata = parseMetadata(files["fra54-metadata.json"], "85tf-25kj",
    ["year", "incidentkey", "reportkey", "jointcd", "totaldamagecost", "accidentcausecode",
      "reportingrailroadfatalitiesfor55a", "reportingrailroadinjuriesfor55a"]);
  const form55Metadata = parseMetadata(files["fra55-metadata.json"], "m8i6-zdsy",
    ["railroadcode", "year", "reportmonth", "totalmiles", "employeemanhours", "reportkey"]);
  const uniqueMetadata = json(files["fra54-unique-metadata.json"], "fra54-unique-metadata.json");
  const uniqueError = json(files["p3vu-error.json"], "p3vu-error.json");
  if (uniqueMetadata.id !== "p3vu-f6gp" || uniqueMetadata.assetType !== "filter"
    || typeof uniqueError.message !== "string"
    || !uniqueError.message.includes("No such column: reporting_railroad_company_grouping")) {
    throw new Error("FRA_PHMSA_UNIQUE_VIEW_DRIFT_RECEIPT_INVALID");
  }
  const count54 = queryRows(files, "fra54-canonical-count.json");
  const count55 = queryRows(files, "fra55-canonical-count.json");
  if (count54.length !== 1 || integer(count54[0].selected_rows, "FRA54_COUNT_INVALID") !== 10_449
    || integer(count54[0].distinct_incidents, "FRA54_DISTINCT_INVALID") !== 10_449
    || integer(count54[0].jointcd_observed, "FRA54_JOINTCD_COMPLETENESS_INVALID") !== 10_449
    || integer(count54[0].year_observed, "FRA54_YEAR_COMPLETENESS_INVALID") !== 10_449
    || count55.length !== 1 || integer(count55[0].published_rows, "FRA55_COUNT_INVALID") !== 48_843
    || integer(count55[0].year_observed, "FRA55_YEAR_COMPLETENESS_INVALID") !== 48_843
    || integer(count55[0].totalmiles_observed, "FRA55_MILES_COMPLETENESS_INVALID") !== 48_843) {
    throw new Error("FRA_PHMSA_BOUNDED_COUNTS_INVALID");
  }
  const annual54Raw = queryRows(files, "fra54-canonical-annual.json");
  if (annual54Raw.length !== 5) throw new Error("FRA54_ANNUAL_SHAPE_INVALID");
  const annual54 = annual54Raw.map((row, index) => {
    if (row.report_year !== String(2015 + index)) {
      throw new Error("FRA54_ANNUAL_ROW_INVALID");
    }
    const values = Object.fromEntries(FORM54_ANNUAL_FIELDS.slice(1).map((field) => [field, integer(row[field], `FRA54_${field}_INVALID`)]));
    if (values.selected_rows !== values.distinct_incidents
      || [values.damage_observed, values.fatalities_observed, values.injuries_observed,
        values.hazmat_releases_observed, values.evacuated_observed].some((value) => value !== values.selected_rows)) {
      throw new Error("FRA54_COMPLETENESS_INVALID");
    }
    return { year: row.report_year, unique_incidents: values.selected_rows, ...values };
  });
  if (sum(annual54.map((row) => row.unique_incidents)) !== 10_449) throw new Error("FRA54_ANNUAL_COUNT_MISMATCH");

  const causeRows = queryRows(files, "fra54-canonical-cause-type.json");
  if (causeRows.length !== 2_083) throw new Error("FRA54_CAUSE_ROWS_INVALID");
  const causeFamilies = new Map();
  const accidentTypes = new Map();
  const causeYears = new Map();
  let causeTotal = 0;
  for (const row of causeRows) {
    if (!/^(?:2015|2016|2017|2018|2019)$/u.test(row.report_year)) throw new Error("FRA54_CAUSE_ROW_INVALID");
    const count = integer(row.incident_count, "FRA54_CAUSE_COUNT_INVALID");
    causeTotal += count;
    if (typeof row.accident_cause_code !== "string" || row.accident_cause_code.length === 0
      || typeof row.accident_type_code !== "string" || row.accident_type_code.length === 0) {
      throw new Error("FRA54_CAUSE_CODE_INVALID");
    }
    const family = row.accident_cause_code === "UNREPORTED" ? "UNREPORTED" : row.accident_cause_code[0];
    const type = row.accident_type_code;
    causeYears.set(row.report_year, (causeYears.get(row.report_year) ?? 0) + count);
    causeFamilies.set(family, (causeFamilies.get(family) ?? 0) + count);
    accidentTypes.set(type, (accidentTypes.get(type) ?? 0) + count);
  }
  if (causeTotal !== 10_449 || annual54.some((row) => causeYears.get(row.year) !== row.unique_incidents)) {
    throw new Error("FRA54_CAUSE_TOTAL_MISMATCH");
  }

  const annual55Raw = queryRows(files, "fra55-canonical-annual.json");
  if (annual55Raw.length !== 5) throw new Error("FRA55_ANNUAL_SHAPE_INVALID");
  const annual55 = annual55Raw.map((row, index) => {
    if (row.report_year !== String(2015 + index)) {
      throw new Error("FRA55_ANNUAL_ROW_INVALID");
    }
    const values = Object.fromEntries(FORM55_ANNUAL_FIELDS.slice(1).map((field) => [field, integer(row[field], `FRA55_${field}_INVALID`)]));
    for (const [observed] of FORM55_METRICS) if (values[observed] !== values.published_rows) {
      throw new Error("FRA55_METRIC_MISSINGNESS_INVALID");
    }
    if (values.total_train_miles !== values.freight_train_miles + values.passenger_train_miles
      + values.yard_switching_miles + values.other_train_miles) throw new Error("FRA55_COMPONENT_RECONCILIATION_INVALID");
    return { year: row.report_year, report_rows: values.published_rows, ...values };
  });
  if (sum(annual55.map((row) => row.report_rows)) !== 48_843) throw new Error("FRA55_ANNUAL_COUNT_MISMATCH");

  const duplicateGroups = queryRows(files, "fra55-canonical-duplicate-groups.json");
  const duplicateMetrics = queryRows(files, "fra55-canonical-duplicate-metrics.json");
  if (duplicateGroups.length !== 1 || duplicateMetrics.length !== 1
    || duplicateGroups[0].report_year !== "2019" || duplicateGroups[0].report_month !== "12"
    || typeof duplicateGroups[0].railroad_code !== "string" || duplicateGroups[0].railroad_code.length === 0
    || integer(duplicateGroups[0].duplicate_rows, "FRA55_DUPLICATE_ROWS_INVALID") !== 2
    || duplicateMetrics[0].report_year !== duplicateGroups[0].report_year
    || duplicateMetrics[0].report_month !== duplicateGroups[0].report_month
    || integer(duplicateMetrics[0].identical_rows, "FRA55_IDENTICAL_ROWS_INVALID") !== 2) {
    throw new Error("FRA55_DUPLICATE_PROJECTION_INVALID");
  }
  const detail = duplicateMetrics[0];
  const corrected55 = annual55.map((row) => {
    if (row.year !== "2019") return { ...row, deduplicatedMonthlyRailroadRows: row.report_rows };
    const corrected = { ...row, report_rows: row.report_rows - 1, deduplicatedMonthlyRailroadRows: row.report_rows - 1 };
    for (const [observed, metric] of FORM55_METRICS) {
      corrected[observed] -= 1;
      corrected[metric] -= integer(detail[metric], `FRA55_DUPLICATE_${metric}_INVALID`);
    }
    if (corrected.total_train_miles !== corrected.freight_train_miles + corrected.passenger_train_miles
      + corrected.yard_switching_miles + corrected.other_train_miles) throw new Error("FRA55_DEDUP_RECONCILIATION_INVALID");
    return corrected;
  });

  const annual = annual54.map((outcome, index) => {
    const exposure = corrected55[index];
    return { year: outcome.year, uniqueReportedIncidents: outcome.unique_incidents,
      totalReportedDamageDollars: String(outcome.total_reported_damage), officialFatalities: outcome.official_fatalities,
      officialInjuries: outcome.official_injuries, hazmatReleasedCars: outcome.hazmat_released_cars,
      personsEvacuated: outcome.persons_evacuated, totalTrainMiles: String(exposure.total_train_miles),
      employeeHours: String(exposure.employee_hours), deduplicatedMonthlyRailroadRows: exposure.deduplicatedMonthlyRailroadRows,
      incidentRatePerMillionTrainMiles: ratio(outcome.unique_incidents, exposure.total_train_miles, 1_000_000),
      fatalityRatePerMillionTrainMiles: ratio(outcome.official_fatalities, exposure.total_train_miles, 1_000_000),
      injuryRatePerMillionTrainMiles: ratio(outcome.official_injuries, exposure.total_train_miles, 1_000_000),
      reportedDamageDollarsPerTrainMile: ratio(outcome.total_reported_damage, exposure.total_train_miles, 1) };
  });
  const pooled = { incidents: sum(annual54.map((row) => row.unique_incidents)),
    damage: sum(annual54.map((row) => row.total_reported_damage)),
    fatalities: sum(annual54.map((row) => row.official_fatalities)),
    injuries: sum(annual54.map((row) => row.official_injuries)),
    miles: sum(corrected55.map((row) => row.total_train_miles)),
    hours: sum(corrected55.map((row) => row.employee_hours)) };
  return {
    laneId: "FRA_FORM54_FORM55_2015_2019", realityStatus: "REAL_OPERATOR_REPORTED_AGENCY_PUBLISHED_EXPERIENCE",
    reportingRoles: { operatorReported: true, agencyPublished: true, agencyReviewedEachUnderlyingFact: false,
      causalClassificationAdjudicated: false, legalLiabilityAdjudicated: false },
    queryChain: { datasetIds: ["85tf-25kj", "m8i6-zdsy"], canonicalQueryReceiptCount: 7,
      allResponseSchemasVerified: true, allResponsePinsBoundToCanonicalQueries: true,
      officialAggregateApiResponseBytesReaggregatedLocally: true, rawRowPopulationDownloaded: false,
      countAnnualCauseDuplicateAndRateReconciliationsPerformed: true, transportAttested: false },
    schema: { form54: form54Metadata, form55: form55Metadata,
      officialUniqueView: { datasetId: "p3vu-f6gp", currentlyExecutableAtFreeze: false,
        machineStatus: "DEFERRED_UPSTREAM_SCHEMA_DRIFT", missingColumnErrorBytePinned: true },
      reportKeySemanticUniquenessObserved: false, reportKeyNotUsedForDeduplication: true },
    population: { startYear: 2015, endYear: 2019, form54JointCd1Rows: 10_449,
      form54DistinctIncidentKeys: 10_449, form55PublishedRows: 48_843,
      form55DeduplicatedMonthlyRailroadRows: 48_842, reportableAboveAnnualDamageThresholdOnly: true,
      belowThresholdAccountableAccidentsIncluded: false, calendarYearAlignmentNotIncidentToExposureRowLinkage: true },
    revision: { byteFrozenAsCaptured: true, publisherVersionedStaticRelease: false,
      historicalPeriodOutsideStatedFiveYearRoutineEditWindowAtFreeze: true,
      retroactiveCorrectionImpossible: false, rebuildMustUseExactPinnedBytes: true },
    deduplication: { form54RepresentativeRowsSelectedByJointCd1: true,
      form54IncidentKeyOneToOneVerified: true, form55CompositeKey: "RAILROAD_CODE_YEAR_REPORT_MONTH",
      duplicateCompositeKeyGroups: 1, identicalMetricProjectionRowsInDuplicateGroup: 2,
      identicalDuplicateRowsRemoved: 1, operatorIdentifierEmitted: false },
    annual, pooled: { years: 5, uniqueReportedIncidents: pooled.incidents,
      totalReportedDamageDollars: String(pooled.damage), officialFatalities: pooled.fatalities,
      officialInjuries: pooled.injuries, totalTrainMiles: String(pooled.miles), employeeHours: String(pooled.hours),
      incidentRatePerMillionTrainMiles: ratio(pooled.incidents, pooled.miles, 1_000_000),
      reportedDamageDollarsPerTrainMile: ratio(pooled.damage, pooled.miles, 1) },
    classification: { causeTypeAggregateCells: causeRows.length,
      reportedCauseFamilyCounts: Object.fromEntries([...causeFamilies].sort(([a], [b]) => a.localeCompare(b))),
      accidentTypeCodeCounts: Object.fromEntries([...accidentTypes].sort(([a], [b]) => a.localeCompare(b))),
      causeCodesAreOperatorReportedRepresentativeRecordClassifications: true,
      causalEffectsIdentified: false, independentCausalAdjudicationObserved: false },
    lossBoundary: { totalDamageIsReportedAccidentDamageCost: true, paidLoss: false, incurredLoss: false,
      ultimateLoss: false, recoveryOrSalvageObserved: false, claimSettlementObserved: false,
      inflationOrThresholdNormalizationPerformed: false },
    inferenceBoundary: { sourceDomainCalendarYearRateDiagnosticsPermitted: true,
      targetDomainTransferPermitted: false, pricingUsePermitted: false, guaranteeUsePermitted: false,
      settlementUsePermitted: false, tailOrDependenceModelFitted: false },
  };
}

function parsePhmsa(files) {
  const entries = zipEntries(files["incident_gas_distribution_jan2010_present.zip"]);
  if (entries.size !== 2 || !entries.has(PHMSA_DATA_MEMBER) || !entries.has(PHMSA_SCHEMA_MEMBER)) {
    throw new Error("FRA_PHMSA_ZIP_MEMBERS_INVALID");
  }
  const data = entries.get(PHMSA_DATA_MEMBER);
  const schema = entries.get(PHMSA_SCHEMA_MEMBER);
  if (data.length !== 4_395_199 || sha256(data) !== PHMSA_DATA_HASH || schema.length !== 477_717
    || sha256(schema) !== PHMSA_SCHEMA_HASH || !schema.subarray(0, 5).equals(Buffer.from("%PDF-"))
    || !schema.subarray(Math.max(0, schema.length - 1_024)).includes(Buffer.from("%%EOF"))) {
    throw new Error("FRA_PHMSA_ZIP_MEMBER_PIN_INVALID");
  }
  const firstLf = data.indexOf(0x0a);
  if (firstLf < 0 || sha256(data.subarray(0, firstLf + 1)) !== PHMSA_HEADER_HASH) {
    throw new Error("FRA_PHMSA_TSV_HEADER_PIN_INVALID");
  }
  const lines = data.toString("utf8").split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  const header = lines[0].split("\t");
  const required = { REPORT_RECEIVED_DATE: 0, IYEAR: 1, REPORT_NUMBER: 2, SUPPLEMENTAL_NUMBER: 3,
    REPORT_TYPE: 4, OPERATOR_ID: 5, FATAL: 43, INJURE: 50, NUM_PUB_EVACUATED: 57,
    EST_COST_OPER_PAID: 118, EST_COST_PROP_DAMAGE: 119, EST_COST_EMERGENCY: 120,
    EST_COST_OTHER: 121, CAUSE: 172 };
  if (header.length !== 468 || Object.entries(required).some(([name, index]) => header[index] !== name)) {
    throw new Error("FRA_PHMSA_TSV_SCHEMA_INVALID");
  }
  const yearCounts = new Map();
  const reportTypes = new Map();
  for (const line of lines.slice(1)) {
    const fields = line.split("\t");
    if (fields.length !== 468) throw new Error("FRA_PHMSA_TSV_ROW_WIDTH_INVALID");
    const year = fields[1];
    if (!/^(?:201\d|202[0-6])$/u.test(year)) throw new Error("FRA_PHMSA_TSV_YEAR_INVALID");
    yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
    reportTypes.set(fields[4], (reportTypes.get(fields[4]) ?? 0) + 1);
  }
  if (lines.length !== 1_590 || canonicalizeStrict(Object.fromEntries([...reportTypes].sort()))
    !== canonicalizeStrict({ ORIGINAL: 127, "ORIGINAL FINAL": 438, SUPPLEMENTAL: 53,
      "SUPPLEMENTAL FINAL": 971 })) throw new Error("FRA_PHMSA_TSV_POPULATION_INVALID");
  return { laneId: "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE",
    realityStatus: "REAL_OPERATOR_SUBMITTED_AGENCY_PUBLISHED_INCIDENT_RECORD_SNAPSHOT",
    sourceReceipt: { zipBytes: 1_599_619, zipHash: FILES.at(-1).sha256, memberCount: 2,
      schemaPdfBytes: schema.length, schemaPdfHash: PHMSA_SCHEMA_HASH, formRevision: "9-2023",
      dataBytes: data.length, dataHash: PHMSA_DATA_HASH, headerColumns: header.length,
      headerHash: PHMSA_HEADER_HASH, reportedRows: lines.length - 1,
      observedYearCounts: Object.fromEntries([...yearCounts].sort(([a], [b]) => a.localeCompare(b))),
      reportTypeCounts: Object.fromEntries([...reportTypes].sort(([a], [b]) => a.localeCompare(b))) },
    reportingRoles: { operatorReported: true, agencyPublished: true, agencyReviewedEachUnderlyingFact: false,
      causalClassificationAdjudicated: false, legalLiabilityAdjudicated: false },
    revision: { originalAndSupplementalStatusPreserved: true, endpointIsMutablePresentFile: true,
      publisherVersionIdPinned: false, byteFrozenAsCaptured: true, latestPopulationCompletenessEstablished: false },
    denominatorBoundary: { matchingAnnualReportZipCaptured: false, mileageExposureCaptured: false,
      incidentToExposureLinkEstablished: false, frequencyOrSeverityRateCalculated: false },
    rightsBoundary: { officialPublicDownloadObserved: true, publicDomainOrReuseLicenseBytePinned: false,
      redistributionUseConcluded: false, modelTrainingUseConcluded: false },
    admission: { realIncidentSourceReceiptRecognized: true,
      outcomeOrActuarialModelInputAdmitted: false,
      machineStatus: "DEFERRED_MISSING_MATCHED_ANNUAL_EXPOSURE_RIGHTS_AND_VERSION_BINDING" },
    authority: { TARGET_TRANSFER: false, TRAIN: false, PRICE: false, GUARANTEE: false, SETTLE: false } };
}

function sourceProjection(files, official, manifestHash) {
  const projections = FILES.map((expected) => fileProjection(expected, files[expected.name].length,
    sha256(files[expected.name])));
  return { sourceId: official ? FRA_PHMSA_FROZEN_SOURCE_20260821.sourceId : "CALLER_PROVIDED_FRA_PHMSA_SHAPED_FIXTURE",
    publishers: official ? ["FEDERAL_RAILROAD_ADMINISTRATION", "PIPELINE_AND_HAZARDOUS_MATERIALS_SAFETY_ADMINISTRATION"] : [],
    profileMatchedAtBuild: official, callerBytesMatchedFrozenPins: official ? true : officialProfile(files),
    sourceReality: official ? "REAL_OPERATOR_REPORTED_AGENCY_PUBLISHED_EXPERIENCE" : "UNATTESTED_FIXTURE_BYTES",
    frozenAt: official ? FROZEN_AT : null, objectCount: projections.length,
    sourceBytes: projections.reduce((total, file) => total + file.bytes, 0),
    acquisitionManifestHash: official ? manifestHash : null,
    sourceSetHash: digest(projections), canonicalQueryReceiptCount: 7,
    allCanonicalQueriesBoundToResponsePins: true,
    allCanonicalResponseSchemasVerified: official,
    officialAggregateApiResponsesReaggregatedLocally: official,
    rawFraRowPopulationDownloaded: false,
    allObjectsBytePinned: official, allSchemasPinned: official,
    transportAttested: false, files: projections };
}

function fixtureFra() {
  return { laneId: "FRA_FORM54_FORM55_2015_2019", realityStatus: "UNATTESTED_FIXTURE",
    annual: [], pooled: null, inferenceBoundary: { sourceDomainCalendarYearRateDiagnosticsPermitted: false,
      targetDomainTransferPermitted: false, pricingUsePermitted: false, guaranteeUsePermitted: false,
      settlementUsePermitted: false, tailOrDependenceModelFitted: false } };
}
function fixturePhmsa() {
  return { laneId: "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE",
    realityStatus: "UNATTESTED_FIXTURE", sourceReceipt: null,
    admission: { realIncidentSourceReceiptRecognized: false, outcomeOrActuarialModelInputAdmitted: false,
      machineStatus: "NO_OFFICIAL_SOURCE_REPLAY" },
    authority: { TARGET_TRANSFER: false, TRAIN: false, PRICE: false, GUARANTEE: false, SETTLE: false } };
}

function buildInternal(files, options, official, manifestHash = null) {
  if (!exactKeys(files, EXPECTED_NAMES)
    || !exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("FRA_PHMSA_BUILD_ARGUMENTS_INVALID");
  }
  for (const name of EXPECTED_NAMES) {
    if (!Buffer.isBuffer(files[name]) || files[name].length <= 0 || files[name].length > MAX_SOURCE_FILE_BYTES) {
      throw new Error(`FRA_PHMSA_SOURCE_BYTES_INVALID:${name}`);
    }
  }
  if (official && (!officialProfile(files) || !HASH.test(manifestHash ?? ""))) {
    throw new Error("FRA_PHMSA_OFFICIAL_PROFILE_INVALID");
  }
  const generatedAt = canonicalTime(options.generatedAt ?? FROZEN_AT, "FRA_PHMSA_GENERATED_AT");
  const source = sourceProjection(files, official, manifestHash);
  const fra = official ? parseFra(files) : fixtureFra();
  const phmsa = official ? parsePhmsa(files) : fixturePhmsa();
  const withoutHash = { schema: FRA_PHMSA_SAFETY_EVIDENCE_SCHEMA, generatedAt,
    epistemicPolicy: { publicOriginDoesNotDemoteRealWorldEvidence: true,
      outsiderCollectionDoesNotUpgradeSourceAuthority: true,
      dataQualityAuthorityReliabilityPopulationAndRevisionAreEvaluatedDirectly: true,
      operatorReportingAgencyPublicationAgencyReviewCausalityAndAdjudicationAreSeparate: true },
    source, lanes: { fra, phmsa },
    crossLaneBoundary: { fraOutcomeExposureCalendarYearDiagnosticsPerformed: official,
      fraAndPhmsaPoolingPerformed: false, phmsaIncidentZipUsedWithoutExposure: false,
      reportedDamageTreatedAsPaidLoss: false, causalIdentificationPerformed: false,
      targetDomainTransferPerformed: false, tailOrDependenceModelFitted: false },
    rights: { fraMetadataPublicDomainDeclarationObserved: official,
      phmsaReuseLicenseBytePinned: false, legalConclusionMade: false,
      rawRedistributionRightConcluded: false, commercialUseRightConcluded: false,
      modelTrainingRightConcluded: false, personalDataReuseRightConcluded: false },
    verificationRequirement: { standaloneVerificationLevel: "STRUCTURE_ONLY",
      admissionVerificationLevel: "FULL_OFFICIAL_FRA_PHMSA_SOURCE_REPLAYED",
      exactSourceAwareRebuildRequired: true },
    authority: { TARGET_TRANSFER: false, TRAIN: false, PRICE: false, GUARANTEE: false,
      SETTLE: false, CLOSE: false, EXECUTE: false, ASSUME_LIABILITY: false, CAPITAL_CUSTODY: false },
    progress: { outcomeSensing: official ? "REAL_FRA_OUTCOME_EXPERIENCE_ADDED" : "NO_REAL_EVIDENCE_ADMITTED",
      actuarialExposure: official ? "REAL_FRA_CALENDAR_YEAR_DENOMINATOR_ADDED" : "NO_DENOMINATOR_ADMITTED",
      phmsa: official ? "REAL_SOURCE_RECEIPT_MACHINE_DEFERRED_PENDING_MATCHED_EXPOSURE_RIGHTS_VERSION"
        : "NO_OFFICIAL_SOURCE_REPLAY", economicLossModel: "REPORTED_DAMAGE_NOT_PAID_OR_ULTIMATE_LOSS",
      causalModel: "NOT_IDENTIFIED", readyToPrice: false, readyToGuarantee: false,
      readyToSettle: false, readyToAssumeLiability: false },
    admission: { requiresFullSourceReplay: true, realFraOutcomeAndExposureExperienceRecognized: official,
      fraSourceDomainDescriptiveUseOnly: official, realPhmsaSourceReceiptRecognized: official,
      phmsaOutcomeOrActuarialModelInputAdmitted: false, targetTransfer: false,
      training: false, pricing: false, guarantee: false, settlement: false } };
  return { ...withoutHash, artifactHash: digest(withoutHash) };
}

export function buildFraPhmsaSafetyEvidenceFromBytes(files, options = {}) {
  return buildInternal(files, options, false, null);
}
export function buildFraPhmsaSafetyEvidenceFromSourceDirectory(sourceDirectory, options = {}) {
  const source = stableReadSourceDirectory(sourceDirectory);
  return buildInternal(source.files, options, true, source.manifestHash);
}

function structureErrors(artifact) {
  const errors = [];
  if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) return ["ARTIFACT_NOT_OBJECT"];
  if (artifact.schema !== FRA_PHMSA_SAFETY_EVIDENCE_SCHEMA) errors.push("SCHEMA_INVALID");
  try { canonicalTime(artifact.generatedAt, "ARTIFACT_GENERATED_AT"); } catch (error) {
    errors.push(error instanceof Error ? error.message : "GENERATED_AT_INVALID");
  }
  if (!HASH.test(artifact.artifactHash ?? "")) errors.push("ARTIFACT_HASH_FORMAT_INVALID");
  else {
    const { artifactHash: _hash, ...withoutHash } = artifact;
    try { if (digest(withoutHash) !== artifact.artifactHash) errors.push("ARTIFACT_HASH_MISMATCH"); }
    catch { errors.push("ARTIFACT_CANONICALIZATION_INVALID"); }
  }
  const authority = { TARGET_TRANSFER: false, TRAIN: false, PRICE: false, GUARANTEE: false,
    SETTLE: false, CLOSE: false, EXECUTE: false, ASSUME_LIABILITY: false, CAPITAL_CUSTODY: false };
  if (canonicalizeStrict(artifact.authority ?? null) !== canonicalizeStrict(authority)) errors.push("AUTHORITY_INVALID");
  if (artifact.crossLaneBoundary?.fraAndPhmsaPoolingPerformed !== false
    || artifact.crossLaneBoundary?.phmsaIncidentZipUsedWithoutExposure !== false
    || artifact.crossLaneBoundary?.reportedDamageTreatedAsPaidLoss !== false
    || artifact.admission?.phmsaOutcomeOrActuarialModelInputAdmitted !== false) errors.push("CROSS_LANE_BOUNDARY_INVALID");
  if (artifact.rights?.modelTrainingRightConcluded !== false
    || artifact.rights?.rawRedistributionRightConcluded !== false
    || artifact.rights?.legalConclusionMade !== false) errors.push("RIGHTS_BOUNDARY_INVALID");
  if (artifact.source?.profileMatchedAtBuild === false
    && (artifact.admission?.realFraOutcomeAndExposureExperienceRecognized !== false
      || artifact.admission?.realPhmsaSourceReceiptRecognized !== false
      || artifact.rights?.fraMetadataPublicDomainDeclarationObserved !== false)) {
    errors.push("FIXTURE_INHERITED_REALITY_OR_RIGHTS");
  }
  if (!Array.isArray(artifact.source?.files) || artifact.source.files.length !== FILES.length
    || artifact.source?.canonicalQueryReceiptCount !== 7
    || artifact.source?.allCanonicalQueriesBoundToResponsePins !== true
    || artifact.source?.transportAttested !== false) errors.push("SOURCE_QUERY_CHAIN_SHAPE_INVALID");
  else {
    if (!HASH.test(artifact.source?.sourceSetHash ?? "")
      || digest(artifact.source.files) !== artifact.source.sourceSetHash
      || artifact.source.objectCount !== artifact.source.files.length
      || artifact.source.sourceBytes !== artifact.source.files.reduce((total, file) => total + file.bytes, 0)) {
      errors.push("SOURCE_SET_BINDING_INVALID");
    }
    for (let index = 0; index < FILES.length; index += 1) {
      const expected = FILES[index];
      const actual = artifact.source.files[index];
      if (actual?.name !== expected.name || actual?.lane !== expected.lane || actual?.kind !== expected.kind
        || actual?.url !== expected.url || actual?.captureRepresentation !== (expected.lane === "PHMSA"
          ? "BROWSER_DOWNLOADED_PUBLISHER_FILE_BYTES" : "EXACT_OFFICIAL_API_RESPONSE_BYTES")) {
        errors.push(`SOURCE_FILE_DESCRIPTOR_INVALID:${expected.name}`);
      }
      if (expected.canonicalSoql && (actual?.datasetId !== expected.datasetId
        || actual?.canonicalSoql !== expected.canonicalSoql
        || actual?.canonicalSoqlSha256 !== expected.canonicalSoqlSha256
        || canonicalizeStrict(actual?.responseSchema ?? null)
          !== canonicalizeStrict(expected.responseSchema))) {
        errors.push(`SOURCE_CANONICAL_QUERY_BINDING_INVALID:${expected.name}`);
      }
    }
  }
  if (artifact.source?.profileMatchedAtBuild === true
    && (artifact.source?.sourceId !== FRA_PHMSA_FROZEN_SOURCE_20260821.sourceId
      || !HASH.test(artifact.source?.acquisitionManifestHash ?? "")
      || artifact.source?.allObjectsBytePinned !== true || artifact.source?.allSchemasPinned !== true
      || artifact.source.files.some((file, index) => file.bytes !== FILES[index].bytes
        || file.sha256 !== FILES[index].sha256)
      || artifact.source?.allCanonicalResponseSchemasVerified !== true
      || artifact.source?.officialAggregateApiResponsesReaggregatedLocally !== true
      || artifact.source?.rawFraRowPopulationDownloaded !== false
      || artifact.lanes?.fra?.queryChain?.canonicalQueryReceiptCount !== 7
      || artifact.lanes?.fra?.queryChain?.allResponseSchemasVerified !== true
      || artifact.lanes?.fra?.queryChain?.allResponsePinsBoundToCanonicalQueries !== true
      || artifact.lanes?.fra?.queryChain?.officialAggregateApiResponseBytesReaggregatedLocally !== true
      || artifact.lanes?.fra?.queryChain?.rawRowPopulationDownloaded !== false
      || artifact.lanes?.fra?.queryChain?.transportAttested !== false)) {
    errors.push("OFFICIAL_QUERY_RECONSTRUCTION_BOUNDARY_INVALID");
  }
  return errors;
}

export function verifyFraPhmsaSafetyEvidence(artifact) {
  let errors;
  try { errors = structureErrors(artifact); } catch (error) {
    errors = [error instanceof Error ? error.message : "STRUCTURE_CHECK_FAILED"];
  }
  return { ok: errors.length === 0, verificationLevel: "STRUCTURE_ONLY",
    sourceArtifactsReverified: false, sourceTruthEstablished: false,
    canonicalQueryChainReproduced: false, transportAttested: false,
    officialSourceProfileReproduced: false, candidateArtifactExactlyRebuilt: false,
    institutionalAuthorityEstablished: false, realCaseOrExperienceAdmissionEstablished: false,
    decision: null, errors, artifactHash: errors.length === 0 ? artifact.artifactHash : null,
    sourceSetHash: errors.length === 0 ? artifact.source?.sourceSetHash ?? null : null };
}

export function verifyFraPhmsaSafetyEvidenceWithSource(artifact, sourceDirectory) {
  const structure = verifyFraPhmsaSafetyEvidence(artifact);
  if (!structure.ok) return { ...structure, verificationLevel: "FULL_SOURCE_REPLAY_FAILED" };
  try {
    const rebuilt = buildFraPhmsaSafetyEvidenceFromSourceDirectory(sourceDirectory,
      { generatedAt: artifact.generatedAt });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(artifact)) {
      return { ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
        sourceArtifactsReverified: false, sourceTruthEstablished: false,
        canonicalQueryChainReproduced: true, transportAttested: false,
        officialSourceProfileReproduced: true, candidateArtifactExactlyRebuilt: false,
        institutionalAuthorityEstablished: false, realCaseOrExperienceAdmissionEstablished: false,
        decision: null, errors: ["EXACT_REBUILD_MISMATCH"], artifactHash: artifact.artifactHash,
        sourceSetHash: rebuilt.source.sourceSetHash };
    }
    return { ok: true, verificationLevel: "FULL_OFFICIAL_FRA_PHMSA_SOURCE_REPLAYED",
      sourceArtifactsReverified: true, sourceTruthEstablished: false,
      canonicalQueryChainReproduced: true, transportAttested: false,
      officialSourceProfileReproduced: true, candidateArtifactExactlyRebuilt: true,
      institutionalAuthorityEstablished: false, realCaseOrExperienceAdmissionEstablished: true,
      decision: "ADMIT_REAL_FRA_SOURCE_DOMAIN_OUTCOME_EXPOSURE_DIAGNOSTICS_AND_DEFER_PHMSA_MODEL_INPUT",
      errors: [], artifactHash: artifact.artifactHash, sourceSetHash: rebuilt.source.sourceSetHash,
      acquisitionManifestHash: rebuilt.source.acquisitionManifestHash };
  } catch (error) {
    return { ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false, sourceTruthEstablished: false,
      canonicalQueryChainReproduced: false, transportAttested: false,
      officialSourceProfileReproduced: false, candidateArtifactExactlyRebuilt: false,
      institutionalAuthorityEstablished: false, realCaseOrExperienceAdmissionEstablished: false,
      decision: null, errors: [error instanceof Error ? error.message : "SOURCE_REPLAY_FAILED"],
      artifactHash: artifact.artifactHash, sourceSetHash: null };
  }
}

export function fraPhmsaExpectedAcquisitionManifest() { return expectedManifest(); }
