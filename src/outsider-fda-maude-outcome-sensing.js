/*
 * FDA MAUDE passive-surveillance outcome sensing.
 *
 * This lane deliberately projects reports, not incidents, causes, claims, or
 * rates.  FDA says the same MDR can receive supplements, multiple reporters
 * can describe one event, and MAUDE has neither a device-use denominator nor
 * verified causality.  Those limits are enforced below rather than left to a
 * downstream caller.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable, Transform } from "node:stream";
import { createInflateRaw } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const FDA_MAUDE_OUTCOME_SENSING_SCHEMA = "outsider/fda-maude-outcome-sensing/v1";

export const FDA_MAUDE_BASE_COLUMNS = Object.freeze([
  "MDR_REPORT_KEY", "EVENT_KEY", "REPORT_NUMBER", "REPORT_SOURCE_CODE",
  "MANUFACTURER_LINK_FLAG_", "NUMBER_DEVICES_IN_EVENT", "NUMBER_PATIENTS_IN_EVENT",
  "DATE_RECEIVED", "ADVERSE_EVENT_FLAG", "PRODUCT_PROBLEM_FLAG", "DATE_REPORT",
  "DATE_OF_EVENT", "REPROCESSED_AND_REUSED_FLAG", "REPORTER_OCCUPATION_CODE",
  "HEALTH_PROFESSIONAL", "INITIAL_REPORT_TO_FDA", "DATE_FACILITY_AWARE",
  "REPORT_DATE", "REPORT_TO_FDA", "DATE_REPORT_TO_FDA", "EVENT_LOCATION",
  "DATE_REPORT_TO_MANUFACTURER", "MANUFACTURER_CONTACT_T_NAME",
  "MANUFACTURER_CONTACT_F_NAME", "MANUFACTURER_CONTACT_L_NAME",
  "MANUFACTURER_CONTACT_STREET_1", "MANUFACTURER_CONTACT_STREET_2",
  "MANUFACTURER_CONTACT_CITY", "MANUFACTURER_CONTACT_STATE",
  "MANUFACTURER_CONTACT_ZIP_CODE", "MANUFACTURER_CONTACT_ZIP_EXT",
  "MANUFACTURER_CONTACT_COUNTRY", "MANUFACTURER_CONTACT_POSTAL",
  "MANUFACTURER_CONTACT_AREA_CODE", "MANUFACTURER_CONTACT_EXCHANGE",
  "MANUFACTURER_CONTACT_PHONE_NO", "MANUFACTURER_CONTACT_EXTENSION",
  "MANUFACTURER_CONTACT_PCOUNTRY", "MANUFACTURER_CONTACT_PCITY",
  "MANUFACTURER_CONTACT_PLOCAL", "MANUFACTURER_G1_NAME", "MANUFACTURER_G1_STREET_1",
  "MANUFACTURER_G1_STREET_2", "MANUFACTURER_G1_CITY", "MANUFACTURER_G1_STATE_CODE",
  "MANUFACTURER_G1_ZIP_CODE", "MANUFACTURER_G1_ZIP_CODE_EXT",
  "MANUFACTURER_G1_COUNTRY_CODE", "MANUFACTURER_G1_POSTAL_CODE",
  "DATE_MANUFACTURER_RECEIVED", "MFR_REPORT_TYPE", "DEVICE_DATE_OF_MANUFACTURE",
  "SINGLE_USE_FLAG", "REMEDIAL_ACTION", "PREVIOUS_USE_CODE",
  "REMOVAL_CORRECTION_NUMBER", "EVENT_TYPE", "DISTRIBUTOR_NAME",
  "DISTRIBUTOR_ADDRESS_1", "DISTRIBUTOR_ADDRESS_2", "DISTRIBUTOR_CITY",
  "DISTRIBUTOR_STATE_CODE", "DISTRIBUTOR_ZIP_CODE", "DISTRIBUTOR_ZIP_CODE_EXT",
  "REPORT_TO_MANUFACTURER", "MANUFACTURER_NAME", "MANUFACTURER_ADDRESS_1",
  "MANUFACTURER_ADDRESS_2", "MANUFACTURER_CITY", "MANUFACTURER_STATE_CODE",
  "MANUFACTURER_ZIP_CODE", "MANUFACTURER_ZIP_CODE_EXT", "MANUFACTURER_COUNTRY_CODE",
  "MANUFACTURER_POSTAL_CODE", "TYPE_OF_REPORT", "SOURCE_TYPE", "DATE_ADDED",
  "DATE_CHANGED", "REPORTER_STATE_CODE", "REPORTER_COUNTRY_CODE", "PMA_PMN_NUM",
  "EXEMPTION_NUMBER", "SUMMARY_REPORT", "NOE_SUMMARIZED",
  "SUPPL_DATES_FDA_RECEIVED", "SUPPL_DATES_MFR_RECEIVED",
]);

export const FDA_MAUDE_DEVICE_COLUMNS = Object.freeze([
  "MDR_REPORT_KEY", "DEVICE_EVENT_KEY", "IMPLANT_FLAG", "DATE_REMOVED_FLAG",
  "DEVICE_SEQUENCE_NO", "IMPLANT_DATE_YEAR", "DATE_REMOVED_YEAR",
  "SERVICED_BY_3RD_PARTY_FLAG", "DATE_RECEIVED", "BRAND_NAME", "GENERIC_NAME",
  "MANUFACTURER_D_NAME", "MANUFACTURER_D_ADDRESS_1", "MANUFACTURER_D_ADDRESS_2",
  "MANUFACTURER_D_CITY", "MANUFACTURER_D_STATE_CODE", "MANUFACTURER_D_ZIP_CODE",
  "MANUFACTURER_D_ZIP_CODE_EXT", "MANUFACTURER_D_COUNTRY_CODE",
  "MANUFACTURER_D_POSTAL_CODE", "DEVICE_OPERATOR", "EXPIRATION_DATE_OF_DEVICE",
  "MODEL_NUMBER", "CATALOG_NUMBER", "LOT_NUMBER", "OTHER_ID_NUMBER",
  "DEVICE_AVAILABILITY", "DATE_RETURNED_TO_MANUFACTURER",
  "DEVICE_REPORT_PRODUCT_CODE", "DEVICE_AGE_TEXT", "DEVICE_EVALUATED_BY_MANUFACTUR",
  "COMBINATION_PRODUCT_FLAG", "UDI-DI", "UDI-PUBLIC",
]);

const FROZEN_AT = "2026-08-21T10:30:00.000Z";

export const FDA_MAUDE_FROZEN_SOURCE_20260821 = Object.freeze({
  sourceId: "FDA_MAUDE_MONTHLY_ADD_AND_CHANGE_2026_08",
  frozenAt: FROZEN_AT,
  dataIndexUrl: "https://www.fda.gov/medical-devices/medical-device-reporting-mdr-how-report-medical-device-problems/mdr-data-files",
  limitationsUrl: "https://www.fda.gov/medical-devices/mandatory-reporting-requirements-manufacturers-importers-and-device-user-facilities/about-manufacturer-and-user-facility-device-experience-maude-database",
  files: Object.freeze([
    Object.freeze({ name: "mdr-data-files-20260821.html", kind: "DATA_INDEX_HTML",
      url: "https://www.fda.gov/medical-devices/medical-device-reporting-mdr-how-report-medical-device-problems/mdr-data-files",
      bytes: 86_238, sha256: "sha256:d398fd3db492484ae5c126fba1586a17ed951e7e2230778a9cdcee45707e5d8c" }),
    Object.freeze({ name: "maude-about-20260821.html", kind: "LIMITATIONS_HTML",
      url: "https://www.fda.gov/medical-devices/mandatory-reporting-requirements-manufacturers-importers-and-device-user-facilities/about-manufacturer-and-user-facility-device-experience-maude-database",
      bytes: 56_703, sha256: "sha256:0b7c74c3926e2dd557095a8eb4bd1aaa91ca310d933584a0af45dfff75ebcee4" }),
    Object.freeze({ name: "mdrfoiadd.zip", kind: "BASE_ADD",
      url: "https://www.accessdata.fda.gov/MAUDE/ftparea/mdrfoiadd.zip",
      bytes: 11_548_269, sha256: "sha256:1f0525ac706e741e5951948e9ca5946829d7c5ac66321a4588f541b02c9325fb",
      entryName: "mdrfoiAdd.txt", entryBytes: 119_622_110 }),
    Object.freeze({ name: "mdrfoichange.zip", kind: "BASE_CHANGE",
      url: "https://www.accessdata.fda.gov/MAUDE/ftparea/mdrfoichange.zip",
      bytes: 30_078_879, sha256: "sha256:6e3657c226494941f76bbea76a82ed3a71bd7aaf3fd5b8cd1c4bdb1686ef07e0",
      entryName: "mdrfoiChange.txt", entryBytes: 276_342_476 }),
    Object.freeze({ name: "deviceadd.zip", kind: "DEVICE_ADD",
      url: "https://www.accessdata.fda.gov/MAUDE/ftparea/deviceadd.zip",
      bytes: 11_624_514, sha256: "sha256:c5f2e20160e3362589f05b0cc51d21d6c117e4e3c5b9801197934348e08b8a51",
      entryName: "DEVICEAdd.txt", entryBytes: 84_010_636 }),
    Object.freeze({ name: "devicechange.zip", kind: "DEVICE_CHANGE",
      url: "https://www.accessdata.fda.gov/MAUDE/ftparea/devicechange.zip",
      bytes: 29_192_523, sha256: "sha256:b50911a00c2efa9ad16aefc5096b6de422dcce99b8f7d25df559bb1872976fbd",
      entryName: "DEVICEChange.txt", entryBytes: 193_875_416 }),
  ]),
});

const EXPECTED_NAMES = Object.freeze(FDA_MAUDE_FROZEN_SOURCE_20260821.files.map((file) => file.name));
const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_SOURCE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;
const SAMPLE_SIZE = 32;

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(value) { return sha256(canonicalizeStrict(value)); }
function domainHash(domain, value) { return sha256(`${domain}\0${value}`); }

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

function normalizedCode(value, maximum = 80) {
  const text = String(value ?? "").trim();
  if (text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)) return "__INVALID__";
  return text || "__MISSING__";
}

function stableReadSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || !sourceDirectory.trim()) {
    throw new Error("FDA_MAUDE_SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) throw new Error("FDA_MAUDE_SOURCE_DIRECTORY_TOO_BROAD");
  const rootStat = lstatSync(directory, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("FDA_MAUDE_SOURCE_DIRECTORY_UNSAFE");
  }
  const names = readdirSync(directory).sort();
  if (canonicalizeStrict(names) !== canonicalizeStrict([...EXPECTED_NAMES].sort())) {
    throw new Error("FDA_MAUDE_SOURCE_DIRECTORY_PROFILE_MISMATCH");
  }
  const files = {};
  for (const name of EXPECTED_NAMES) {
    const target = path.join(directory, name);
    const pathBefore = lstatSync(target, { bigint: true });
    if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
      || pathBefore.size <= 0n || pathBefore.size > BigInt(MAX_SOURCE_FILE_BYTES)) {
      throw new Error(`FDA_MAUDE_SOURCE_FILE_UNSAFE:${name}`);
    }
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    const fd = openSync(target, fsConstants.O_RDONLY | noFollow);
    try {
      const before = fstatSync(fd, { bigint: true });
      const bytes = readFileSync(fd);
      const after = fstatSync(fd, { bigint: true });
      const pathAfter = lstatSync(target, { bigint: true });
      for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
        if (before[field] !== after[field] || before[field] !== pathBefore[field]
          || before[field] !== pathAfter[field]) {
          throw new Error(`FDA_MAUDE_SOURCE_FILE_CHANGED_DURING_READ:${name}`);
        }
      }
      if (BigInt(bytes.length) !== before.size) {
        throw new Error(`FDA_MAUDE_SOURCE_FILE_SHORT_READ:${name}`);
      }
      files[name] = bytes;
    } finally { closeSync(fd); }
  }
  return files;
}

function findZipEnd(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_END) return offset;
  }
  throw new Error("FDA_MAUDE_ZIP_END_NOT_FOUND");
}

function zipEntry(bytes, expectedName = null) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > MAX_SOURCE_FILE_BYTES) {
    throw new Error("FDA_MAUDE_ZIP_SIZE_INVALID");
  }
  const end = findZipEnd(bytes);
  const diskEntries = bytes.readUInt16LE(end + 8);
  const entries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  const comment = bytes.readUInt16LE(end + 20);
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0
    || diskEntries !== 1 || entries !== 1 || end + 22 + comment !== bytes.length
    || centralOffset + centralSize > end || centralSize < 46
    || bytes.readUInt32LE(centralOffset) !== ZIP_CENTRAL) {
    throw new Error("FDA_MAUDE_ZIP_PROFILE_INVALID");
  }
  const flags = bytes.readUInt16LE(centralOffset + 8);
  const method = bytes.readUInt16LE(centralOffset + 10);
  const crc = bytes.readUInt32LE(centralOffset + 16);
  const compressedSize = bytes.readUInt32LE(centralOffset + 20);
  const uncompressedSize = bytes.readUInt32LE(centralOffset + 24);
  const nameLength = bytes.readUInt16LE(centralOffset + 28);
  const extraLength = bytes.readUInt16LE(centralOffset + 30);
  const commentLength = bytes.readUInt16LE(centralOffset + 32);
  const localOffset = bytes.readUInt32LE(centralOffset + 42);
  if (flags & 1 || ![0, 8].includes(method) || compressedSize > MAX_SOURCE_FILE_BYTES
    || uncompressedSize <= 0 || uncompressedSize > MAX_ENTRY_BYTES
    || centralOffset + 46 + nameLength + extraLength + commentLength !== centralOffset + centralSize) {
    throw new Error("FDA_MAUDE_ZIP_ENTRY_UNSUPPORTED");
  }
  const name = bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");
  if (!name || name.includes("/") || name.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(name) || expectedName !== null && name !== expectedName) {
    throw new Error("FDA_MAUDE_ZIP_ENTRY_NAME_INVALID");
  }
  if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== ZIP_LOCAL) {
    throw new Error("FDA_MAUDE_ZIP_LOCAL_HEADER_INVALID");
  }
  const localNameLength = bytes.readUInt16LE(localOffset + 26);
  const localExtraLength = bytes.readUInt16LE(localOffset + 28);
  const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  if (localName !== name || dataOffset + compressedSize > centralOffset) {
    throw new Error("FDA_MAUDE_ZIP_LOCAL_BINDING_INVALID");
  }
  return { name, method, crc, compressedSize, uncompressedSize,
    compressed: bytes.subarray(dataOffset, dataOffset + compressedSize) };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function entryTextStream(entry) {
  let crc = 0xffffffff;
  let size = 0;
  const accounting = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      for (let index = 0; index < chunk.length; index += 1) {
        crc = CRC_TABLE[(crc ^ chunk[index]) & 0xff] ^ (crc >>> 8);
      }
      callback(null, chunk);
    },
    flush(callback) {
      if (size !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) {
        callback(new Error("FDA_MAUDE_ZIP_ENTRY_INTEGRITY_INVALID"));
      } else callback();
    },
  });
  const source = Readable.from([entry.compressed]);
  const content = entry.method === 8 ? source.pipe(createInflateRaw()) : source;
  const stream = content.pipe(accounting);
  stream.setEncoding("latin1");
  return stream;
}

const BASE_INDEX = Object.freeze(Object.fromEntries(FDA_MAUDE_BASE_COLUMNS.map((name, index) => [name, index])));
const DEVICE_INDEX = Object.freeze(Object.fromEntries(FDA_MAUDE_DEVICE_COLUMNS.map((name, index) => [name, index])));

function baseRecord(fields, row) {
  const value = (name) => fields[BASE_INDEX[name]].trim();
  return {
    key: value("MDR_REPORT_KEY"), eventKey: value("EVENT_KEY"),
    reportNumber: value("REPORT_NUMBER"), reportSource: value("REPORT_SOURCE_CODE"),
    manufacturerLink: value("MANUFACTURER_LINK_FLAG_"),
    numberDevices: value("NUMBER_DEVICES_IN_EVENT"), numberPatients: value("NUMBER_PATIENTS_IN_EVENT"),
    dateReceived: value("DATE_RECEIVED"), adverse: value("ADVERSE_EVENT_FLAG"),
    productProblem: value("PRODUCT_PROBLEM_FLAG"), dateReport: value("DATE_REPORT"),
    dateEvent: value("DATE_OF_EVENT"), eventType: value("EVENT_TYPE"),
    typeOfReport: value("TYPE_OF_REPORT"), sourceType: value("SOURCE_TYPE"),
    dateAdded: value("DATE_ADDED"), dateChanged: value("DATE_CHANGED"),
    pmaPmn: value("PMA_PMN_NUM"), exemption: value("EXEMPTION_NUMBER"),
    summaryReport: value("SUMMARY_REPORT"), numberEventsSummarized: value("NOE_SUMMARIZED"),
    supplementDatesFda: value("SUPPL_DATES_FDA_RECEIVED"),
    supplementDatesManufacturer: value("SUPPL_DATES_MFR_RECEIVED"),
    rowHash: sha256(row),
  };
}

function deviceRecord(fields, row) {
  const value = (name) => fields[DEVICE_INDEX[name]].trim();
  return {
    mdrKey: value("MDR_REPORT_KEY"), deviceEventKey: value("DEVICE_EVENT_KEY"),
    sequence: value("DEVICE_SEQUENCE_NO"), productCode: value("DEVICE_REPORT_PRODUCT_CODE"),
    udiDiPresent: value("UDI-DI") !== "", udiPublicPresent: value("UDI-PUBLIC") !== "",
    evaluated: value("DEVICE_EVALUATED_BY_MANUFACTUR"),
    combination: value("COMBINATION_PRODUCT_FLAG"), rowHash: sha256(row),
  };
}

function revisionRank(record) {
  const date = /^\d{2}\/\d{2}\/\d{4}$/.test(record.dateChanged)
    ? `${record.dateChanged.slice(6)}${record.dateChanged.slice(0, 2)}${record.dateChanged.slice(3, 5)}` : "00000000";
  const supplements = record.typeOfReport.split(",").filter((value) => value.trim()).length;
  return `${date}|${String(supplements).padStart(6, "0")}|${record.rowHash}`;
}

async function parsePipeZip(zipBytes, columns, kind, expectedEntryName) {
  const entry = zipEntry(zipBytes, expectedEntryName);
  const records = new Map();
  let rows = 0; let missingPrimaryKeyRows = 0; let duplicatePrimaryKeyRows = 0;
  let duplicateRowsWithDifferentContent = 0;
  const lines = createInterface({ input: entryTextStream(entry), crlfDelay: Infinity });
  let headerSeen = false; let pending = "";
  for await (const input of lines) {
    const line = input.endsWith("\r") ? input.slice(0, -1) : input;
    if (!headerSeen) {
      headerSeen = true;
      if (line !== columns.join("|")) throw new Error(`FDA_MAUDE_${kind}_HEADER_INVALID`);
      continue;
    }
    if (line === "" && pending === "") continue;
    pending = pending === "" ? line : `${pending}\n${line}`;
    let delimiters = 0;
    for (let index = 0; index < pending.length; index += 1) {
      if (pending.charCodeAt(index) === 124) delimiters += 1;
    }
    if (delimiters < columns.length - 1) continue;
    if (delimiters > columns.length - 1) {
      throw new Error(`FDA_MAUDE_${kind}_FIELD_COUNT_INVALID:${rows + 1}`);
    }
    rows += 1;
    const row = pending; pending = "";
    const fields = row.split("|");
    if (fields.length !== columns.length) throw new Error(`FDA_MAUDE_${kind}_FIELD_COUNT_INVALID:${rows}`);
    const record = columns === FDA_MAUDE_BASE_COLUMNS ? baseRecord(fields, row) : deviceRecord(fields, row);
    const primary = columns === FDA_MAUDE_BASE_COLUMNS ? record.key
      : `${record.mdrKey}|${record.deviceEventKey || "_"}|${record.sequence || "_"}`;
    if (!/^[0-9]+$/.test(columns === FDA_MAUDE_BASE_COLUMNS ? primary : record.mdrKey)) {
      missingPrimaryKeyRows += 1; continue;
    }
    const prior = records.get(primary);
    if (prior) {
      duplicatePrimaryKeyRows += 1;
      if (prior.rowHash !== record.rowHash) duplicateRowsWithDifferentContent += 1;
      const chooseNew = columns === FDA_MAUDE_BASE_COLUMNS
        ? revisionRank(record) > revisionRank(prior) : record.rowHash > prior.rowHash;
      if (chooseNew) records.set(primary, record);
    } else records.set(primary, record);
  }
  if (!headerSeen) throw new Error(`FDA_MAUDE_${kind}_EMPTY`);
  if (pending !== "") throw new Error(`FDA_MAUDE_${kind}_TRUNCATED_LOGICAL_ROW`);
  return { entry, records, accounting: { rows, uniquePrimaryKeys: records.size,
    missingPrimaryKeyRows, duplicatePrimaryKeyRows, duplicateRowsWithDifferentContent } };
}

function increment(target, key) { target[key] = (target[key] ?? 0) + 1; }
function sortedCounts(value) { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))); }

function numericField(value) {
  if (value === "") return { missing: true, valid: false, value: null };
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return { missing: false, valid: false, value: null };
  }
  return { missing: false, valid: true, value: Number(value) };
}

function sampleInsert(sample, record) {
  const fingerprint = domainHash("outsider.fda-maude.case.v1", record.key);
  const projected = { fingerprint, reportedMonth: /^\d{2}\/\d{2}\/\d{4}$/.test(record.dateReport)
      ? `${record.dateReport.slice(6)}-${record.dateReport.slice(0, 2)}` : null,
    reporterSourceCode: normalizedCode(record.reportSource),
    reportedEventType: normalizedCode(record.eventType),
    manufacturerLinkFlag: normalizedCode(record.manufacturerLink),
    summaryReportFlag: normalizedCode(record.summaryReport),
    productCodes: [], deviceRecordCount: 0, hasUdiDi: false };
  if (sample.length < SAMPLE_SIZE) sample.push(projected);
  else {
    let maximum = 0;
    for (let index = 1; index < sample.length; index += 1) {
      if (sample[index].fingerprint > sample[maximum].fingerprint) maximum = index;
    }
    if (fingerprint < sample[maximum].fingerprint) sample[maximum] = projected;
  }
}

function officialProfile(files) {
  return FDA_MAUDE_FROZEN_SOURCE_20260821.files.every((expected) => {
    const bytes = files[expected.name];
    return Buffer.isBuffer(bytes) && bytes.length === expected.bytes && sha256(bytes) === expected.sha256;
  });
}

function validateDocumentation(files, official) {
  const index = files["mdr-data-files-20260821.html"].toString("utf8");
  const about = files["maude-about-20260821.html"].toString("utf8");
  const requirements = [
    [index, "All record types are linked by the MDR REPORT KEY"],
    [index, "MANUFACTURER LINK FLAG"],
    [index, "New MAUDE Base records for the current month"],
    [index, "Base data updates: changes to existing Base data"],
    [about, "not intended to be used either to evaluate rates of adverse events"],
    [about, "lack of information about frequency of device use"],
    [about, "does not necessarily demonstrate that the device caused"],
  ];
  if (requirements.some(([document, phrase]) => !document.includes(phrase))) {
    throw new Error("FDA_MAUDE_DOCUMENTATION_BOUNDARY_MISSING");
  }
  return { limitationsTextPinned: official, downloadableFileIndexPinned: official };
}

function sourceProjection(files, official, parsed) {
  return {
    sourceId: official ? FDA_MAUDE_FROZEN_SOURCE_20260821.sourceId : "CALLER_PROVIDED_MAUDE_SHAPED_FIXTURE",
    publisher: official ? "UNITED_STATES_FOOD_AND_DRUG_ADMINISTRATION" : null,
    sourceReality: official ? "REAL_REGULATORY_PASSIVE_SURVEILLANCE_REPORT_STREAM" : "FIXTURE_BYTES",
    profileMatchedAtBuild: official,
    captureKind: "MONTHLY_ADD_AND_CHANGE_STREAMS_NOT_FULL_POPULATION",
    capturedThrough: official ? "2026-07-31" : null,
    files: EXPECTED_NAMES.map((name) => {
      const bytes = files[name];
      const expected = FDA_MAUDE_FROZEN_SOURCE_20260821.files.find((file) => file.name === name);
      const stream = parsed[name];
      return { name, kind: expected.kind, bytes: bytes.length, sha256: sha256(bytes),
        entryName: stream?.entry.name ?? null,
        entryBytes: stream?.entry.uncompressedSize ?? null,
        rows: stream?.accounting.rows ?? null };
    }),
  };
}

export async function buildFdaMaudeOutcomeSensingFromBytes(files, options = {}) {
  if (!exactKeys(files, EXPECTED_NAMES) || !exactKeys(options, Object.hasOwn(options, "generatedAt")
    ? ["generatedAt"] : [])) throw new Error("FDA_MAUDE_BUILD_ARGUMENTS_INVALID");
  for (const name of EXPECTED_NAMES) {
    if (!Buffer.isBuffer(files[name]) || files[name].length <= 0 || files[name].length > MAX_SOURCE_FILE_BYTES) {
      throw new Error(`FDA_MAUDE_SOURCE_BYTES_INVALID:${name}`);
    }
  }
  const generatedAt = canonicalTime(options.generatedAt ?? FROZEN_AT, "FDA_MAUDE_GENERATED_AT");
  const official = officialProfile(files);
  const documentation = validateDocumentation(files, official);
  const expectedFor = (name) => official
    ? FDA_MAUDE_FROZEN_SOURCE_20260821.files.find((file) => file.name === name).entryName : null;
  const baseAdd = await parsePipeZip(files["mdrfoiadd.zip"], FDA_MAUDE_BASE_COLUMNS,
    "BASE_ADD", expectedFor("mdrfoiadd.zip"));
  const baseChange = await parsePipeZip(files["mdrfoichange.zip"], FDA_MAUDE_BASE_COLUMNS,
    "BASE_CHANGE", expectedFor("mdrfoichange.zip"));
  const deviceAdd = await parsePipeZip(files["deviceadd.zip"], FDA_MAUDE_DEVICE_COLUMNS,
    "DEVICE_ADD", expectedFor("deviceadd.zip"));
  const deviceChange = await parsePipeZip(files["devicechange.zip"], FDA_MAUDE_DEVICE_COLUMNS,
    "DEVICE_CHANGE", expectedFor("devicechange.zip"));
  if (official) {
    for (const [name, parsed] of [["mdrfoiadd.zip", baseAdd], ["mdrfoichange.zip", baseChange],
      ["deviceadd.zip", deviceAdd], ["devicechange.zip", deviceChange]]) {
      const expected = FDA_MAUDE_FROZEN_SOURCE_20260821.files.find((file) => file.name === name);
      if (parsed.entry.uncompressedSize !== expected.entryBytes) {
        throw new Error(`FDA_MAUDE_OFFICIAL_ENTRY_SIZE_MISMATCH:${name}`);
      }
    }
  }

  const effectiveBase = new Map(baseAdd.records);
  let baseCrossStreamOverlap = 0; let baseCrossStreamChangedContent = 0;
  for (const [key, record] of baseChange.records) {
    const prior = effectiveBase.get(key);
    if (prior) { baseCrossStreamOverlap += 1; if (prior.rowHash !== record.rowHash) baseCrossStreamChangedContent += 1; }
    effectiveBase.set(key, record);
  }
  const eventTypes = {}; const reporterSources = {}; const sourceTypes = {};
  const eventKeys = new Set(); const repeatedEventKeys = new Set();
  const reportNumbers = new Set(); const repeatedReportNumbers = new Set();
  let missingEventKey = 0; let missingReportNumber = 0; let manufacturerLinkedReports = 0;
  let reportsWithFollowupEvidence = 0; let reportsWithSupplementDateEvidence = 0;
  let summaryReports = 0; let summaryEventCountPresent = 0; let summaryEventCountMissing = 0;
  let missingEventDate = 0; let missingReportDate = 0; let adverseFlagged = 0; let productProblemFlagged = 0;
  let pmaPmnPresent = 0; let exemptionPresent = 0;
  const fieldQuality = { numberDevicesMissing: 0, numberDevicesInvalid: 0,
    numberPatientsMissing: 0, numberPatientsInvalid: 0 };
  const sample = [];
  for (const record of effectiveBase.values()) {
    increment(eventTypes, normalizedCode(record.eventType));
    increment(reporterSources, normalizedCode(record.reportSource));
    for (const code of record.sourceType.split(",").map((value) => value.trim()).filter(Boolean)) {
      increment(sourceTypes, normalizedCode(code));
    }
    if (!record.eventKey) missingEventKey += 1;
    else { if (eventKeys.has(record.eventKey)) repeatedEventKeys.add(record.eventKey); eventKeys.add(record.eventKey); }
    if (!record.reportNumber) missingReportNumber += 1;
    else { if (reportNumbers.has(record.reportNumber)) repeatedReportNumbers.add(record.reportNumber);
      reportNumbers.add(record.reportNumber); }
    if (record.manufacturerLink === "Y") manufacturerLinkedReports += 1;
    const typeTokens = record.typeOfReport.split(",").map((value) => value.trim()).filter(Boolean);
    if (typeTokens.length > 1 || typeTokens.some((value) => value !== "I")) reportsWithFollowupEvidence += 1;
    if (record.supplementDatesFda || record.supplementDatesManufacturer) reportsWithSupplementDateEvidence += 1;
    if (record.summaryReport === "Y") {
      summaryReports += 1;
      const count = numericField(record.numberEventsSummarized);
      if (count.valid) summaryEventCountPresent += 1; else summaryEventCountMissing += 1;
    }
    if (!record.dateEvent) missingEventDate += 1;
    if (!record.dateReport) missingReportDate += 1;
    if (record.adverse === "Y") adverseFlagged += 1;
    if (record.productProblem === "Y") productProblemFlagged += 1;
    if (record.pmaPmn) pmaPmnPresent += 1;
    if (record.exemption) exemptionPresent += 1;
    const devices = numericField(record.numberDevices);
    if (devices.missing) fieldQuality.numberDevicesMissing += 1;
    else if (!devices.valid) fieldQuality.numberDevicesInvalid += 1;
    const patients = numericField(record.numberPatients);
    if (patients.missing) fieldQuality.numberPatientsMissing += 1;
    else if (!patients.valid) fieldQuality.numberPatientsInvalid += 1;
    sampleInsert(sample, record);
  }
  sample.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  const sampleByFingerprint = new Map(sample.map((item) => [item.fingerprint, item]));
  const sampleKeyToFingerprint = new Map();
  for (const key of effectiveBase.keys()) {
    const fingerprint = domainHash("outsider.fda-maude.case.v1", key);
    if (sampleByFingerprint.has(fingerprint)) sampleKeyToFingerprint.set(key, fingerprint);
  }

  const effectiveDevice = new Map(deviceAdd.records);
  let deviceCrossStreamOverlap = 0; let deviceCrossStreamChangedContent = 0;
  for (const [key, record] of deviceChange.records) {
    const prior = effectiveDevice.get(key);
    if (prior) { deviceCrossStreamOverlap += 1;
      if (prior.rowHash !== record.rowHash) deviceCrossStreamChangedContent += 1; }
    effectiveDevice.set(key, record);
  }
  const deviceCountsByReport = new Map();
  let deviceRowsJoinedToEffectiveBase = 0; let deviceRowsOutsideEffectiveBase = 0;
  let productCodePresent = 0; let udiDiPresent = 0; let udiPublicPresent = 0;
  let evaluatedYes = 0; let evaluatedNo = 0; let evaluatedMissingOrOther = 0;
  const sampleProducts = new Map();
  for (const record of effectiveDevice.values()) {
    if (record.productCode) productCodePresent += 1;
    if (record.udiDiPresent) udiDiPresent += 1;
    if (record.udiPublicPresent) udiPublicPresent += 1;
    if (record.evaluated === "Y") evaluatedYes += 1;
    else if (record.evaluated === "N") evaluatedNo += 1;
    else evaluatedMissingOrOther += 1;
    if (effectiveBase.has(record.mdrKey)) {
      deviceRowsJoinedToEffectiveBase += 1;
      deviceCountsByReport.set(record.mdrKey, (deviceCountsByReport.get(record.mdrKey) ?? 0) + 1);
      const fingerprint = sampleKeyToFingerprint.get(record.mdrKey);
      if (fingerprint) {
        if (!sampleProducts.has(fingerprint)) sampleProducts.set(fingerprint, new Set());
        if (record.productCode) sampleProducts.get(fingerprint).add(normalizedCode(record.productCode));
        const item = sampleByFingerprint.get(fingerprint);
        item.deviceRecordCount += 1; item.hasUdiDi ||= record.udiDiPresent;
      }
    } else deviceRowsOutsideEffectiveBase += 1;
  }
  for (const item of sample) item.productCodes = [...(sampleProducts.get(item.fingerprint) ?? [])].sort().slice(0, 8);
  let reportsWithDeviceRows = 0; let reportsWithMultipleDeviceRows = 0;
  for (const count of deviceCountsByReport.values()) {
    reportsWithDeviceRows += 1; if (count > 1) reportsWithMultipleDeviceRows += 1;
  }

  const parsedByName = { "mdrfoiadd.zip": baseAdd, "mdrfoichange.zip": baseChange,
    "deviceadd.zip": deviceAdd, "devicechange.zip": deviceChange };
  const artifactWithoutHash = {
    schema: FDA_MAUDE_OUTCOME_SENSING_SCHEMA,
    generatedAt,
    source: sourceProjection(files, official, parsedByName),
    ontology: {
      unit: "MDR_MASTER_REPORT_AFTER_PUBLISHER_CHANGE_STREAM_PRECEDENCE",
      sourceEnvironmentIsReal: official,
      reportIsIncident: false,
      reportIsIndependentlyObservedOutcome: false,
      reportEstablishesDeviceCausality: false,
      reportEstablishesAdjudicatedLoss: false,
      reportEstablishesExposure: false,
      researchOrShadowIsUseBoundaryNotSourceReality: true,
    },
    revisionAccounting: {
      baseAdd: baseAdd.accounting, baseChange: baseChange.accounting,
      baseCrossStreamOverlap, baseCrossStreamChangedContent,
      effectiveMdrReportKeys: effectiveBase.size,
      changeStreamPrecedence: "BASE_CHANGE_SUPERSEDES_BASE_ADD_FOR_EQUAL_MDR_REPORT_KEY",
      numericVersionColumnPresent: false,
      versionEvidenceUsed: ["TYPE_OF_REPORT", "SUPPL_DATES_FDA_RECEIVED", "SUPPL_DATES_MFR_RECEIVED", "DATE_CHANGED"],
      reportsWithFollowupEvidence, reportsWithSupplementDateEvidence,
      multipleReporterDuplicateRiskRetained: true,
      rowCountMustNotBeCalledEventCount: true,
    },
    outcomeSensing: {
      effectiveReportRows: effectiveBase.size,
      reportedEventTypeCounts: sortedCounts(eventTypes),
      reporterSourceCodeCounts: sortedCounts(reporterSources),
      reportSourceTypeCounts: sortedCounts(sourceTypes),
      adverseEventFlaggedReports: adverseFlagged,
      productProblemFlaggedReports: productProblemFlagged,
      manufacturerLinkedReports,
      eventKeyPresent: effectiveBase.size - missingEventKey,
      distinctNonmissingEventKeys: eventKeys.size,
      repeatedNonmissingEventKeys: repeatedEventKeys.size,
      eventKeyMissing: missingEventKey,
      reportNumberPresent: effectiveBase.size - missingReportNumber,
      distinctNonmissingReportNumbers: reportNumbers.size,
      repeatedNonmissingReportNumbers: repeatedReportNumbers.size,
      reportNumberMissing: missingReportNumber,
      summaryReports, summaryEventCountPresent, summaryEventCountMissing,
      missingEventDate, missingReportDate, pmaPmnPresent, exemptionPresent,
      fieldQuality,
      deterministicPrivacyMinimizedCases: sample,
    },
    deviceCorrelation: {
      deviceAdd: deviceAdd.accounting, deviceChange: deviceChange.accounting,
      deviceCrossStreamOverlap, deviceCrossStreamChangedContent,
      effectiveDeviceRows: effectiveDevice.size,
      deviceRowsJoinedToEffectiveBase, deviceRowsOutsideEffectiveBase,
      reportsWithDeviceRows, reportsWithoutDeviceRows: effectiveBase.size - reportsWithDeviceRows,
      reportsWithMultipleDeviceRows, productCodePresent, udiDiPresent, udiPublicPresent,
      evaluatedByManufacturer: { yes: evaluatedYes, no: evaluatedNo, missingOrOther: evaluatedMissingOrOther },
      accessGudidFullReleaseReplayed: false,
      accessGudidDailyDeltaTreatedAsPopulation: false,
      deviceIdentityIndependentlyResolved: false,
    },
    missingnessAndBias: {
      passiveSurveillanceUnderreportingUnresolved: true,
      reportInaccuracyUnresolved: true,
      deviceCausalityUnverified: true,
      deviceUseDenominatorAbsent: true,
      reportingProcessChangeCanMoveCounts: true,
      followupAndMultipleReporterDuplicationUnresolvedBeyondAvailableKeys: true,
      currentMonthlyStreamsAreNotFullHistoricalPopulation: true,
      noIncidencePrevalenceTrendOrCrossDeviceRatePermitted: true,
    },
    privacy: {
      officialPageStatesFoaAndPrivacyRedactions: official,
      narrativesAcquired: false,
      patientTableAcquired: false,
      namesAddressesPhonesProjected: false,
      rawReportKeysProjected: false,
      deterministicCaseFingerprintsArePseudonymousAndPotentiallyLinkable: true,
      deterministicCaseFingerprintsAreIrreversiblyAnonymous: false,
      linkageRiskBasis: "KNOWN_DOMAIN_AND_LOW_ENTROPY_SEQUENTIAL_MDR_KEYS_MAY_BE_ENUMERATED_OFFLINE",
    },
    rights: {
      officialPublicDownloadObserved: official,
      officialBytesAndLimitationsReplayed: documentation.limitationsTextPinned
        && documentation.downloadableFileIndexPinned,
      rawRedistributionRightConcluded: false,
      commercialUseRightConcluded: false,
      automaticTrainingRightConcluded: false,
      legalConclusionMade: false,
      allowedUse: official ? ["DESCRIPTIVE_SOURCE_REPLAY", "SHADOW_OUTCOME_SENSING"] : [],
    },
    stageProgress: {
      stage1_5: { evidenceGained: official ? ["REAL_PASSIVE_SURVEILLANCE_REPORTS", "REVISION_AND_LINKAGE_SENSING"] : [],
        externalReadinessGapClosed: false },
      stage2: { evidenceGained: official ? ["REPORTED_CONSEQUENCE_CATEGORIES", "DEVICE_CORRELATION_ROOTS"] : [],
        externalReadinessGapClosed: false },
      rateCalibrationAdmitted: false, causalCalibrationAdmitted: false,
      lossCalibrationAdmitted: false, productionReadiness: false,
    },
    authority: { PRICE: false, GUARANTEE: false, SETTLE: false, TRAIN: false,
      CLOSE: false, EXECUTE: false },
    admission: official ? "ADMIT_FDA_MAUDE_PASSIVE_REPORT_OUTCOME_SENSING_ONLY"
      : "ABSTAIN_CALLER_PROVIDED_FIXTURE",
  };
  return Object.freeze({ ...artifactWithoutHash, artifactHash: digest(artifactWithoutHash) });
}

export async function buildFdaMaudeOutcomeSensingFromSourceDirectory(sourceDirectory, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("FDA_MAUDE_SOURCE_BUILD_OPTIONS_INVALID");
  }
  return buildFdaMaudeOutcomeSensingFromBytes(stableReadSourceDirectory(sourceDirectory), options);
}

function structuralErrors(artifact) {
  const errors = [];
  const top = ["schema", "generatedAt", "source", "ontology", "revisionAccounting",
    "outcomeSensing", "deviceCorrelation", "missingnessAndBias", "privacy", "rights",
    "stageProgress", "authority", "admission", "artifactHash"];
  if (!exactKeys(artifact, top)) return ["SCHEMA_KEYS_INVALID"];
  if (artifact.schema !== FDA_MAUDE_OUTCOME_SENSING_SCHEMA) errors.push("SCHEMA_INVALID");
  try { canonicalTime(artifact.generatedAt, "FDA_MAUDE_GENERATED_AT"); } catch { errors.push("GENERATED_AT_INVALID"); }
  if (!HASH.test(artifact.artifactHash)) errors.push("ARTIFACT_HASH_FORMAT_INVALID");
  else {
    const { artifactHash, ...withoutHash } = artifact;
    if (digest(withoutHash) !== artifactHash) errors.push("ARTIFACT_HASH_MISMATCH");
  }
  if (!exactKeys(artifact.authority, ["PRICE", "GUARANTEE", "SETTLE", "TRAIN", "CLOSE", "EXECUTE"])
    || Object.values(artifact.authority).some((value) => value !== false)) errors.push("AUTHORITY_INVALID");
  if (artifact.ontology?.reportIsIncident !== false
    || artifact.ontology?.reportIsIndependentlyObservedOutcome !== false
    || artifact.ontology?.reportEstablishesDeviceCausality !== false
    || artifact.ontology?.reportEstablishesAdjudicatedLoss !== false
    || artifact.ontology?.reportEstablishesExposure !== false) errors.push("ONTOLOGY_BOUNDARY_INVALID");
  if (artifact.stageProgress?.rateCalibrationAdmitted !== false
    || artifact.stageProgress?.causalCalibrationAdmitted !== false
    || artifact.stageProgress?.lossCalibrationAdmitted !== false
    || artifact.stageProgress?.productionReadiness !== false) errors.push("READINESS_BOUNDARY_INVALID");
  if (artifact.rights?.rawRedistributionRightConcluded !== false
    || artifact.rights?.automaticTrainingRightConcluded !== false
    || artifact.rights?.legalConclusionMade !== false) errors.push("RIGHTS_BOUNDARY_INVALID");
  return errors;
}

export function verifyFdaMaudeOutcomeSensing(artifact) {
  const errors = structuralErrors(artifact);
  return { ok: errors.length === 0, verificationLevel: "STRUCTURE_ONLY",
    sourceArtifactsReverified: false, decision: null,
    artifactHash: errors.length === 0 ? artifact.artifactHash : null, errors };
}

export async function verifyFdaMaudeOutcomeSensingWithSource(artifact, sourceDirectory) {
  const structure = verifyFdaMaudeOutcomeSensing(artifact);
  if (!structure.ok) return { ...structure, verificationLevel: "FULL_SOURCE_REPLAY_FAILED" };
  try {
    const rebuilt = await buildFdaMaudeOutcomeSensingFromSourceDirectory(sourceDirectory,
      { generatedAt: artifact.generatedAt });
    const exact = canonicalizeStrict(rebuilt) === canonicalizeStrict(artifact);
    const official = rebuilt.source.profileMatchedAtBuild === true;
    if (!exact || !official) throw new Error(!exact ? "ARTIFACT_REBUILD_MISMATCH" : "OFFICIAL_PROFILE_MISMATCH");
    return { ok: true, verificationLevel: "FULL_OFFICIAL_FDA_MAUDE_SOURCE_REPLAYED",
      sourceArtifactsReverified: true,
      decision: "ADMIT_FDA_MAUDE_PASSIVE_REPORT_OUTCOME_SENSING_ONLY",
      artifactHash: artifact.artifactHash, errors: [] };
  } catch (error) {
    return { ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false, decision: null, artifactHash: null,
      errors: [error instanceof Error ? error.message : String(error)] };
  }
}
