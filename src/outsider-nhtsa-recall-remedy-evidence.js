/*
 * NHTSA recall and remedy-status evidence.
 *
 * This module replays an exact official publication snapshot.  It recognizes
 * real manufacturer recall/status reports and NHTSA's publication/management
 * record, while refusing to turn those records into independent causality,
 * consumer receipt, completed repair, loss, pricing, or Outsider authority.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const NHTSA_RECALL_REMEDY_EVIDENCE_SCHEMA =
  "outsider/nhtsa-recall-remedy-evidence/v1";

const FROZEN_AT = "2026-08-21T15:30:00.000Z";
export const NHTSA_RECALL_REMEDY_CANONICAL_GENERATED_AT = "2026-08-21T15:45:00.000Z";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;

export const NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821 = Object.freeze({
  sourceId: "NHTSA_RECALL_REMEDY_STATUS_2026_08_21",
  frozenAt: FROZEN_AT,
  publisher: "UNITED_STATES_NATIONAL_HIGHWAY_TRAFFIC_SAFETY_ADMINISTRATION",
  officialIndexUrl: "https://www.nhtsa.gov/nhtsa-datasets-and-apis",
  programUrl: "https://www.nhtsa.gov/recalls",
  files: Object.freeze([
    Object.freeze({
      name: "RCL.txt",
      kind: "OFFICIAL_RECALL_DATA_DICTIONARY",
      url: "https://static.nhtsa.gov/odi/ffdd/rcl/RCL.txt",
      bytes: 3_053,
      sha256: "sha256:3438cc7e4131efa401dfe6437dbe035607e092c129155dfb411d459d58802203",
    }),
    Object.freeze({
      name: "RCL_Qtrly_Rpts.txt",
      kind: "OFFICIAL_QUARTERLY_STATUS_DATA_DICTIONARY",
      url: "https://static.nhtsa.gov/odi/ffdd/rcl/RCL_Qtrly_Rpts.txt",
      bytes: 1_244,
      sha256: "sha256:b76ab35073e3585a56912f058aa0a53dc865de68c8ea12b687faa32f3952c8bf",
    }),
    Object.freeze({
      name: "RCL_Annual_Rpts.txt",
      kind: "OFFICIAL_ANNUAL_STATUS_DATA_DICTIONARY",
      url: "https://static.nhtsa.gov/odi/ffdd/rcl/RCL_Annual_Rpts.txt",
      bytes: 1_635,
      sha256: "sha256:ff45c24d4474d5b2d9bc6b93f96fef1b0d227d5b2ca71f79c7980956fea4219a",
    }),
    Object.freeze({
      name: "FLAT_RCL_POST_2010.zip",
      kind: "OFFICIAL_POST_2010_RECALL_FLAT_FILE_ZIP",
      url: "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip",
      bytes: 14_795_029,
      sha256: "sha256:a4dda749c0038988fe6569be4f61b926bf5ff85bdd28587cb89318f58dc4d2f1",
      entryName: "FLAT_RCL_POST_2010.txt",
      entryBytes: 309_897_727,
      entrySha256: "sha256:1f6e1a9dc80a291c02edafa9bf33ba695b6a2ac25cc6f095c8b7c209bb989456",
      columns: 29,
      maximumLineBytes: 20_000,
    }),
    Object.freeze({
      name: "FLAT_RCL_Qrtly_Rpts.zip",
      kind: "OFFICIAL_QUARTERLY_RECALL_STATUS_FLAT_FILE_ZIP",
      url: "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_Qrtly_Rpts.zip",
      bytes: 1_477_488,
      sha256: "sha256:36d2d7a568851bf83da8d399ca7fcfb655e36f2752512b82640a68fffb68b278",
      entryName: "FLAT_RCL_Qrtly_Rpts.txt",
      entryBytes: 9_300_641,
      entrySha256: "sha256:1aeaa5d8350826ac2df642ffa81b2fef0789752cfbd7d1e846f427cfc79d7e18",
      columns: 13,
      maximumLineBytes: 512,
    }),
    Object.freeze({
      name: "FLAT_RCL_Annual_Rpts.zip",
      kind: "OFFICIAL_ANNUAL_RECALL_STATUS_FLAT_FILE_ZIP",
      url: "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_Annual_Rpts.zip",
      bytes: 174_304,
      sha256: "sha256:8590c600ca34a5d9a3310942061b5c654fe960bcad2c3f8997b9dd68c463716a",
      entryName: "FLAT_RCL_Annual_Rpts.txt",
      entryBytes: 779_691,
      entrySha256: "sha256:14c08720150517cafb8b258fc78cefa6884b2ee062f94f68bf1bda22a7dcdef4",
      columns: 13,
      maximumLineBytes: 512,
    }),
  ]),
});

const SOURCE_FILES = NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.files;
const EXPECTED_SOURCE_NAMES = Object.freeze([
  "acquisition.json", ...SOURCE_FILES.map((file) => file.name),
].sort());

function fail(code, detail = null) {
  throw new Error(detail === null ? `NHTSA_RECALL_REMEDY_${code}`
    : `NHTSA_RECALL_REMEDY_${code}:${detail}`);
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digest(value) {
  return sha256Bytes(canonicalizeStrict(value));
}

function domainHash(domain, value) {
  return sha256Bytes(`${domain}\0${value}`);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalTime(value, code = "TIME") {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    fail(`${code}_INVALID`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail(`${code}_NON_CANONICAL`);
  return normalized;
}

function sourceProjection() {
  return SOURCE_FILES.map((file) => ({
    name: file.name,
    kind: file.kind,
    url: file.url,
    bytes: file.bytes,
    sha256: file.sha256,
    entryName: file.entryName ?? null,
    entryBytes: file.entryBytes ?? null,
    entrySha256: file.entrySha256 ?? null,
    columns: file.columns ?? null,
  }));
}

export function nhtsaRecallRemedyExpectedAcquisitionManifest() {
  return {
    schema: "outsider/nhtsa-recall-remedy-acquisition/v1",
    capturedAt: FROZEN_AT,
    sourceId: NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.sourceId,
    publisher: NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.publisher,
    method: "EXACT_HTTPS_CAPTURE_IMPORTED_AFTER_LOCAL_PIN_VERIFICATION",
    transportAttested: false,
    objects: SOURCE_FILES.map((file) => ({
      name: file.name,
      url: file.url,
      bytes: file.bytes,
      sha256: file.sha256,
      status: "EXACT_PIN_IMPORTED",
    })),
  };
}

function stableReadSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || !sourceDirectory.trim()) {
    fail("SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) fail("SOURCE_DIRECTORY_TOO_BROAD");
  const root = lstatSync(directory, { bigint: true });
  if (!root.isDirectory() || root.isSymbolicLink()) fail("SOURCE_DIRECTORY_UNSAFE");
  const names = readdirSync(directory).sort();
  if (!same(names, EXPECTED_SOURCE_NAMES)) fail("SOURCE_DIRECTORY_PROFILE_MISMATCH");
  const output = {};
  for (const name of EXPECTED_SOURCE_NAMES) {
    const target = path.join(directory, name);
    const pathBefore = lstatSync(target, { bigint: true });
    const maximum = name === "acquisition.json" ? 128 * 1024 : MAX_SOURCE_BYTES;
    if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
      || pathBefore.size < 1n || pathBefore.size > BigInt(maximum)) {
      fail("SOURCE_FILE_UNSAFE", name);
    }
    const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const before = fstatSync(descriptor, { bigint: true });
      const bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor, { bigint: true });
      const pathAfter = lstatSync(target, { bigint: true });
      for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
        if (before[field] !== after[field] || before[field] !== pathBefore[field]
          || before[field] !== pathAfter[field]) fail("SOURCE_FILE_CHANGED_DURING_READ", name);
      }
      if (BigInt(bytes.length) !== before.size) fail("SOURCE_FILE_SHORT_READ", name);
      output[name] = bytes;
    } finally {
      closeSync(descriptor);
    }
  }
  let manifest;
  try {
    manifest = JSON.parse(output["acquisition.json"].toString("utf8"));
  } catch {
    fail("ACQUISITION_MANIFEST_JSON_INVALID");
  }
  if (!same(manifest, nhtsaRecallRemedyExpectedAcquisitionManifest())) {
    fail("ACQUISITION_MANIFEST_MISMATCH");
  }
  for (const pin of SOURCE_FILES) {
    const bytes = output[pin.name];
    if (bytes.length !== pin.bytes || sha256Bytes(bytes) !== pin.sha256) {
      fail("SOURCE_PIN_MISMATCH", pin.name);
    }
  }
  return output;
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

function crc32Update(current, bytes) {
  let value = current;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function findZipEnd(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  fail("ZIP_END_NOT_FOUND");
}

function exactSingleZipEntry(bytes, pin) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== pin.bytes || bytes.length < 22) {
    fail("ZIP_SIZE_INVALID", pin.name);
  }
  const end = findZipEnd(bytes);
  const diskEntries = bytes.readUInt16LE(end + 8);
  const entries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  const zipCommentLength = bytes.readUInt16LE(end + 20);
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0
    || diskEntries !== 1 || entries !== 1 || end + 22 + zipCommentLength !== bytes.length
    || centralOffset + centralSize !== end || centralSize < 46
    || bytes.readUInt32LE(centralOffset) !== 0x02014b50) {
    fail("ZIP_PROFILE_INVALID", pin.name);
  }
  const flags = bytes.readUInt16LE(centralOffset + 8);
  const method = bytes.readUInt16LE(centralOffset + 10);
  const expectedCrc = bytes.readUInt32LE(centralOffset + 16);
  const compressedSize = bytes.readUInt32LE(centralOffset + 20);
  const uncompressedSize = bytes.readUInt32LE(centralOffset + 24);
  const nameLength = bytes.readUInt16LE(centralOffset + 28);
  const extraLength = bytes.readUInt16LE(centralOffset + 30);
  const commentLength = bytes.readUInt16LE(centralOffset + 32);
  const localOffset = bytes.readUInt32LE(centralOffset + 42);
  const centralEnd = centralOffset + 46 + nameLength + extraLength + commentLength;
  if ((flags & ~0x0808) !== 0 || (flags & 1) !== 0 || ![0, 8].includes(method)
    || compressedSize < 1 || compressedSize > pin.bytes
    || uncompressedSize !== pin.entryBytes || centralEnd !== end
    || localOffset + 30 > centralOffset
    || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
    fail("ZIP_ENTRY_PROFILE_INVALID", pin.name);
  }
  const entryName = bytes.subarray(centralOffset + 46,
    centralOffset + 46 + nameLength).toString("utf8");
  if (entryName !== pin.entryName || entryName.includes("/") || entryName.includes("\\")) {
    fail("ZIP_ENTRY_NAME_INVALID", pin.name);
  }
  const localFlags = bytes.readUInt16LE(localOffset + 6);
  const localMethod = bytes.readUInt16LE(localOffset + 8);
  const localNameLength = bytes.readUInt16LE(localOffset + 26);
  const localExtraLength = bytes.readUInt16LE(localOffset + 28);
  const localName = bytes.subarray(localOffset + 30,
    localOffset + 30 + localNameLength).toString("utf8");
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  if (localFlags !== flags || localMethod !== method || localName !== entryName
    || dataOffset + compressedSize > centralOffset) fail("ZIP_LOCAL_BINDING_INVALID", pin.name);
  return {
    method, expectedCrc, compressedSize, uncompressedSize,
    compressed: bytes.subarray(dataOffset, dataOffset + compressedSize),
  };
}

async function scanPinnedZipRows(zipBytes, pin, onRow) {
  const entry = exactSingleZipEntry(zipBytes, pin);
  const source = Readable.from([entry.compressed]);
  const stream = entry.method === 0 ? source : source.pipe(createInflateRaw());
  const hash = createHash("sha256");
  let crc = 0xffffffff;
  let totalBytes = 0;
  let pending = Buffer.alloc(0);
  let rowCount = 0;
  let blankLines = 0;
  const columnWidths = {};
  for await (const rawChunk of stream) {
    const chunk = Buffer.from(rawChunk);
    totalBytes += chunk.length;
    if (totalBytes > pin.entryBytes) fail("ZIP_ENTRY_EXPANSION_EXCEEDED", pin.name);
    hash.update(chunk);
    crc = crc32Update(crc, chunk);
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    let start = 0;
    for (let index = 0; index < pending.length; index += 1) {
      if (pending[index] !== 0x0a) continue;
      let line = pending.subarray(start, index);
      if (line.length > 0 && line[line.length - 1] === 0x0d) line = line.subarray(0, -1);
      if (line.length === 0) blankLines += 1;
      else {
        if (line.length > pin.maximumLineBytes) fail("ROW_TOO_LONG", pin.name);
        const fields = [];
        let fieldStart = 0;
        for (let cursor = 0; cursor <= line.length; cursor += 1) {
          if (cursor === line.length || line[cursor] === 0x09) {
            fields.push(line.subarray(fieldStart, cursor));
            fieldStart = cursor + 1;
          }
        }
        columnWidths[fields.length] = (columnWidths[fields.length] ?? 0) + 1;
        rowCount += 1;
        onRow(fields, line, rowCount);
      }
      start = index + 1;
    }
    pending = pending.subarray(start);
    if (pending.length > pin.maximumLineBytes) fail("ROW_TOO_LONG", pin.name);
  }
  if (pending.length > 0) {
    let line = pending;
    if (line[line.length - 1] === 0x0d) line = line.subarray(0, -1);
    if (line.length > 0) {
      const fields = [];
      let fieldStart = 0;
      for (let cursor = 0; cursor <= line.length; cursor += 1) {
        if (cursor === line.length || line[cursor] === 0x09) {
          fields.push(line.subarray(fieldStart, cursor));
          fieldStart = cursor + 1;
        }
      }
      columnWidths[fields.length] = (columnWidths[fields.length] ?? 0) + 1;
      rowCount += 1;
      onRow(fields, line, rowCount);
    }
  }
  const entryHash = `sha256:${hash.digest("hex")}`;
  const actualCrc = (crc ^ 0xffffffff) >>> 0;
  if (totalBytes !== pin.entryBytes || totalBytes !== entry.uncompressedSize
    || entryHash !== pin.entrySha256 || actualCrc !== entry.expectedCrc) {
    fail("ZIP_ENTRY_INTEGRITY_MISMATCH", pin.name);
  }
  return { rows: rowCount, blankLines, columnWidths, entryBytes: totalBytes,
    entrySha256: entryHash, compressedBytes: entry.compressedSize };
}

function asciiField(bytes, maximum = 128) {
  if (!Buffer.isBuffer(bytes) || bytes.length > maximum) return null;
  for (const byte of bytes) {
    if (byte > 0x7f || byte === 0x00 || byte === 0x0a || byte === 0x0d || byte === 0x09) {
      return null;
    }
  }
  return bytes.toString("ascii").trim();
}

function nonblank(bytes) {
  for (const byte of bytes) if (![0x20, 0x09, 0x0d, 0x0a].includes(byte)) return true;
  return false;
}

function unsignedDecimal(bytes) {
  const value = asciiField(bytes, 24);
  if (value === null || !/^\d+$/u.test(value)) return null;
  try {
    const number = BigInt(value);
    return number >= 0n ? number : null;
  } catch {
    return null;
  }
}

function validYmd(value) {
  if (typeof value !== "string" || !/^\d{8}$/u.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function bump(object, key) {
  object[key] = (object[key] ?? 0) + 1;
}

function sortedCounts(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

function minValue(current, value) {
  return current === null || value < current ? value : current;
}

function maxValue(current, value) {
  return current === null || value > current ? value : current;
}

function fixedRatio(numerator, denominator) {
  if (denominator === 0n) return null;
  return Number((Number(numerator) / Number(denominator)).toFixed(12));
}

async function parseRecallPopulation(zipBytes, pin) {
  const recordIds = new Set();
  const campaigns = new Map();
  const rowProductTypes = {};
  let schemaMismatchRows = 0;
  let invalidRecordIds = 0;
  let duplicateRecordIds = 0;
  let invalidCampaignIds = 0;
  let invalidPopulationRows = 0;
  let invalidReceivedDateRows = 0;
  let invalidRecordCreationDateRows = 0;
  let missingCorrectiveActionRows = 0;
  let receivedDateMin = null;
  let receivedDateMax = null;
  let creationDateMin = null;
  let creationDateMax = null;
  const scan = await scanPinnedZipRows(zipBytes, pin, (fields) => {
    if (fields.length !== pin.columns) { schemaMismatchRows += 1; return; }
    const recordId = asciiField(fields[0], 16);
    const campaignId = asciiField(fields[1], 12);
    const type = asciiField(fields[10], 8);
    const population = unsignedDecimal(fields[11]);
    const ownerNotification = asciiField(fields[12], 8);
    const receivedDate = asciiField(fields[15], 8);
    const creationDate = asciiField(fields[16], 8);
    const doNotDrive = asciiField(fields[27], 8);
    const parkOutside = asciiField(fields[28], 8);
    if (recordId === null || !/^\d+$/u.test(recordId)) invalidRecordIds += 1;
    else {
      if (recordIds.has(recordId)) duplicateRecordIds += 1;
      recordIds.add(recordId);
    }
    if (!campaignId) { invalidCampaignIds += 1; return; }
    if (population === null) invalidPopulationRows += 1;
    if (!validYmd(receivedDate)) invalidReceivedDateRows += 1;
    else {
      receivedDateMin = minValue(receivedDateMin, receivedDate);
      receivedDateMax = maxValue(receivedDateMax, receivedDate);
    }
    if (!validYmd(creationDate)) invalidRecordCreationDateRows += 1;
    else {
      creationDateMin = minValue(creationDateMin, creationDate);
      creationDateMax = maxValue(creationDateMax, creationDate);
    }
    if (!nonblank(fields[21])) missingCorrectiveActionRows += 1;
    bump(rowProductTypes, type || "__MISSING__");
    if (!campaigns.has(campaignId)) {
      campaigns.set(campaignId, {
        rows: 0, populations: new Set(), receivedDates: new Set(), types: new Set(),
        ownerNotificationObserved: false, correctiveActionObserved: false,
        doNotDriveValues: new Set(), parkOutsideValues: new Set(),
      });
    }
    const campaign = campaigns.get(campaignId);
    campaign.rows += 1;
    if (population !== null) campaign.populations.add(population.toString());
    if (validYmd(receivedDate)) campaign.receivedDates.add(receivedDate);
    if (type) campaign.types.add(type);
    if (validYmd(ownerNotification)) campaign.ownerNotificationObserved = true;
    if (nonblank(fields[21])) campaign.correctiveActionObserved = true;
    if (doNotDrive) campaign.doNotDriveValues.add(doNotDrive);
    if (parkOutside) campaign.parkOutsideValues.add(parkOutside);
  });

  let singlePopulationCampaigns = 0;
  let conflictingPopulationCampaigns = 0;
  let missingPopulationCampaigns = 0;
  let zeroPopulationCampaigns = 0;
  let totalPotentialAffected = 0n;
  let conflictingReceivedDateCampaigns = 0;
  let conflictingProductTypeCampaigns = 0;
  let ownerNotificationObservedCampaigns = 0;
  let correctiveActionObservedCampaigns = 0;
  let doNotDriveYesCampaigns = 0;
  let parkOutsideYesCampaigns = 0;
  const campaignTypes = {};
  const campaignsByReceivedYear = {};
  const campaignPopulations = new Map();
  for (const [campaignId, campaign] of campaigns) {
    if (campaign.populations.size === 0) missingPopulationCampaigns += 1;
    else if (campaign.populations.size > 1) conflictingPopulationCampaigns += 1;
    else {
      singlePopulationCampaigns += 1;
      const population = BigInt([...campaign.populations][0]);
      campaignPopulations.set(campaignId, population);
      totalPotentialAffected += population;
      if (population === 0n) zeroPopulationCampaigns += 1;
    }
    if (campaign.receivedDates.size > 1) conflictingReceivedDateCampaigns += 1;
    if (campaign.types.size > 1) conflictingProductTypeCampaigns += 1;
    if (campaign.ownerNotificationObserved) ownerNotificationObservedCampaigns += 1;
    if (campaign.correctiveActionObserved) correctiveActionObservedCampaigns += 1;
    if ([...campaign.doNotDriveValues].some((value) => value.toLowerCase() === "yes")) {
      doNotDriveYesCampaigns += 1;
    }
    if ([...campaign.parkOutsideValues].some((value) => value.toLowerCase() === "yes")) {
      parkOutsideYesCampaigns += 1;
    }
    const typeKey = campaign.types.size === 1 ? [...campaign.types][0]
      : campaign.types.size === 0 ? "__MISSING__" : "__MULTIPLE__";
    bump(campaignTypes, typeKey);
    const yearKey = campaign.receivedDates.size === 1
      ? [...campaign.receivedDates][0].slice(0, 4)
      : campaign.receivedDates.size === 0 ? "__MISSING__" : "__MULTIPLE__";
    bump(campaignsByReceivedYear, yearKey);
  }
  return {
    campaignIds: new Set(campaigns.keys()),
    campaignPopulations,
    projection: {
      sourceUnit: "RECALL_FLAT_FILE_RECORD_WITH_CAMPAIGN_LEVEL_DEDUPLICATION",
      rows: scan.rows,
      expectedColumns: pin.columns,
      observedColumnWidths: sortedCounts(scan.columnWidths),
      blankLines: scan.blankLines,
      schemaMismatchRows,
      uniqueRecordIds: recordIds.size,
      duplicateRecordIds,
      invalidRecordIds,
      uniqueCampaigns: campaigns.size,
      invalidCampaignIds,
      receivedDateRange: { minimum: receivedDateMin, maximum: receivedDateMax },
      recordCreationDateRange: { minimum: creationDateMin, maximum: creationDateMax },
      rowProductTypeCounts: sortedCounts(rowProductTypes),
      campaignProductTypeCounts: sortedCounts(campaignTypes),
      campaignsByPart573ReceivedYear: sortedCounts(campaignsByReceivedYear),
      affectedPopulation: {
        singlePopulationCampaigns,
        conflictingPopulationCampaigns,
        missingPopulationCampaigns,
        zeroPopulationCampaigns,
        totalPotentialAffectedAcrossSinglePopulationCampaigns: totalPotentialAffected.toString(),
        summedOncePerCampaign: true,
        actualExposureOrUniqueVehiclesOnRoadEstablished: false,
      },
      remedyPublication: {
        campaignsWithCorrectiveActionText: correctiveActionObservedCampaigns,
        rowsMissingCorrectiveActionText: missingCorrectiveActionRows,
        campaignsWithOwnerNotificationBeginDate: ownerNotificationObservedCampaigns,
        campaignsMarkedDoNotDriveYes: doNotDriveYesCampaigns,
        campaignsMarkedParkOutsideYes: parkOutsideYesCampaigns,
        correctiveActionTextEstablishesRepairCompleted: false,
        ownerNotificationDateEstablishesConsumerReceipt: false,
      },
      conflictsAndInvalidity: {
        invalidPopulationRows,
        invalidReceivedDateRows,
        invalidRecordCreationDateRows,
        conflictingReceivedDateCampaigns,
        conflictingProductTypeCampaigns,
      },
      entrySha256: scan.entrySha256,
    },
  };
}

function statusPeriodValid(value, kind) {
  return kind === "QUARTERLY" ? /^\d{4}-[1-4]$/u.test(value)
    : /^\d{4}-[1-4] to \d{4}-[1-4]$/u.test(value);
}

function statusCandidateLater(left, right) {
  if (left.submissionDate !== right.submissionDate) return left.submissionDate > right.submissionDate;
  if (left.reportNumber !== right.reportNumber) return left.reportNumber > right.reportNumber;
  if (left.period !== right.period) return left.period > right.period;
  return left.rowHash > right.rowHash;
}

async function parseStatusPopulation(zipBytes, pin, kind, recallCampaignIds) {
  const rowHashes = new Set();
  const logicalKeys = new Map();
  const latest = new Map();
  const selectionAmbiguous = new Set();
  const campaignIds = new Set();
  const invalidPeriodExamples = [];
  const arithmeticAnomalyExamples = [];
  let schemaMismatchRows = 0;
  let exactDuplicateRows = 0;
  let conflictingLogicalKeyRows = 0;
  let invalidCampaignRows = 0;
  let invalidPeriodRows = 0;
  let invalidSubmissionDateRows = 0;
  let invalidReportNumberRows = 0;
  let invalidNumericRows = 0;
  let zeroInvolvedRows = 0;
  let componentSumExceedsInvolvedRows = 0;
  let rowsLinkedToPost2010Recall = 0;
  let submissionDateMin = null;
  let submissionDateMax = null;
  let validPeriodMin = null;
  let validPeriodMax = null;
  const scan = await scanPinnedZipRows(zipBytes, pin, (fields, line) => {
    if (fields.length !== pin.columns) { schemaMismatchRows += 1; return; }
    const rowHash = sha256Bytes(line);
    if (rowHashes.has(rowHash)) exactDuplicateRows += 1;
    rowHashes.add(rowHash);
    const campaignId = asciiField(fields[1], 12);
    const reportNumberBig = unsignedDecimal(fields[6]);
    const period = asciiField(fields[7], 32);
    const submissionDate = asciiField(fields[12], 8);
    const involved = unsignedDecimal(fields[8]);
    const remedied = unsignedDecimal(fields[9]);
    const unreachable = unsignedDecimal(fields[10]);
    const removed = unsignedDecimal(fields[11]);
    const periodValid = statusPeriodValid(period, kind);
    const submissionValid = validYmd(submissionDate);
    const numericValid = [involved, remedied, unreachable, removed]
      .every((value) => value !== null);
    const reportNumberValid = reportNumberBig !== null
      && reportNumberBig <= BigInt(Number.MAX_SAFE_INTEGER);
    if (!campaignId) { invalidCampaignRows += 1; return; }
    campaignIds.add(campaignId);
    if (recallCampaignIds.has(campaignId)) rowsLinkedToPost2010Recall += 1;
    if (!periodValid) {
      invalidPeriodRows += 1;
      if (invalidPeriodExamples.length < 8) invalidPeriodExamples.push({
        rowHash, campaignFingerprint: domainHash("NHTSA_CAMPAIGN", campaignId),
        observedPeriod: period,
      });
    } else {
      validPeriodMin = minValue(validPeriodMin, period);
      validPeriodMax = maxValue(validPeriodMax, period);
    }
    if (!submissionValid) invalidSubmissionDateRows += 1;
    else {
      submissionDateMin = minValue(submissionDateMin, submissionDate);
      submissionDateMax = maxValue(submissionDateMax, submissionDate);
    }
    if (!reportNumberValid) invalidReportNumberRows += 1;
    if (!numericValid) invalidNumericRows += 1;
    if (involved === 0n) zeroInvolvedRows += 1;
    const arithmeticInvalid = numericValid
      && remedied + unreachable + removed > involved;
    if (arithmeticInvalid) {
      componentSumExceedsInvolvedRows += 1;
      if (arithmeticAnomalyExamples.length < 8) arithmeticAnomalyExamples.push({
        rowHash, campaignFingerprint: domainHash("NHTSA_CAMPAIGN", campaignId),
        period, involved: involved.toString(), remedied: remedied.toString(),
        unreachable: unreachable.toString(), removed: removed.toString(),
      });
    }
    const logicalKey = `${campaignId}\0${period}\0${reportNumberBig?.toString() ?? "INVALID"}\0${submissionDate}`;
    if (logicalKeys.has(logicalKey) && logicalKeys.get(logicalKey) !== rowHash) {
      conflictingLogicalKeyRows += 1;
      selectionAmbiguous.add(campaignId);
    } else logicalKeys.set(logicalKey, rowHash);
    const candidate = {
      campaignId, rowHash, period, periodValid, submissionDate, submissionValid,
      reportNumber: reportNumberValid ? Number(reportNumberBig) : -1,
      reportNumberValid, involved, remedied, unreachable, removed, numericValid,
      arithmeticInvalid,
    };
    if (!latest.has(campaignId) || statusCandidateLater(candidate, latest.get(campaignId))) {
      latest.set(campaignId, candidate);
    }
  });

  let selectedCampaigns = 0;
  let deferredLatestCampaigns = 0;
  const deferReasons = {};
  let totalInvolved = 0n;
  let totalRemedied = 0n;
  let totalUnreachable = 0n;
  let totalRemoved = 0n;
  let selectedLinkedToPost2010Recall = 0;
  const selectedInvolvedByCampaign = new Map();
  for (const [campaignId, row] of latest) {
    const reasons = [];
    if (selectionAmbiguous.has(campaignId)) reasons.push("AMBIGUOUS_LATEST_LOGICAL_KEY");
    if (!row.submissionValid) reasons.push("LATEST_SUBMISSION_DATE_INVALID");
    if (!row.reportNumberValid) reasons.push("LATEST_REPORT_NUMBER_INVALID");
    if (!row.periodValid) reasons.push("LATEST_PERIOD_INVALID");
    if (!row.numericValid) reasons.push("LATEST_NUMERIC_FIELDS_INVALID");
    if (row.involved === 0n) reasons.push("LATEST_INVOLVED_ZERO");
    if (row.arithmeticInvalid) reasons.push("LATEST_COMPONENT_SUM_EXCEEDS_INVOLVED");
    if (reasons.length > 0) {
      deferredLatestCampaigns += 1;
      for (const reason of reasons) bump(deferReasons, reason);
      continue;
    }
    selectedCampaigns += 1;
    if (recallCampaignIds.has(campaignId)) selectedLinkedToPost2010Recall += 1;
    totalInvolved += row.involved;
    totalRemedied += row.remedied;
    totalUnreachable += row.unreachable;
    totalRemoved += row.removed;
    selectedInvolvedByCampaign.set(campaignId, row.involved);
  }
  let campaignsLinkedToPost2010Recall = 0;
  for (const campaignId of campaignIds) {
    if (recallCampaignIds.has(campaignId)) campaignsLinkedToPost2010Recall += 1;
  }
  return {
    campaignIds,
    selectedInvolvedByCampaign,
    projection: {
      sourceUnit: `${kind}_MANUFACTURER_RECALL_STATUS_REPORT_ROW`,
      rows: scan.rows,
      expectedColumns: pin.columns,
      observedColumnWidths: sortedCounts(scan.columnWidths),
      blankLines: scan.blankLines,
      schemaMismatchRows,
      uniqueRowHashes: rowHashes.size,
      exactDuplicateRows,
      uniqueCampaigns: campaignIds.size,
      invalidCampaignRows,
      submissionDateRange: { minimum: submissionDateMin, maximum: submissionDateMax },
      validReportingPeriodRange: { minimum: validPeriodMin, maximum: validPeriodMax },
      sourceQualityAnomalies: {
        invalidPeriodRows,
        invalidSubmissionDateRows,
        invalidReportNumberRows,
        invalidNumericRows,
        zeroInvolvedRows,
        componentSumExceedsInvolvedRows,
        conflictingLogicalKeyRows,
        invalidPeriodExamples,
        arithmeticAnomalyExamples,
        anomaliesRetainedNotRepaired: true,
      },
      latestObservedCampaignSnapshot: {
        selectionRule: "MAX_SUBMISSION_DATE_THEN_REPORT_NUMBER_THEN_PERIOD_THEN_ROW_HASH_PER_CAMPAIGN",
        latestRowsAreNotReplacedByEarlierValidRows: true,
        selectedCampaigns,
        deferredLatestCampaigns,
        deferReasons: sortedCounts(deferReasons),
        selectedCampaignsLinkedToPost2010Recall: selectedLinkedToPost2010Recall,
        involved: totalInvolved.toString(),
        remedied: totalRemedied.toString(),
        unreachable: totalUnreachable.toString(),
        removed: totalRemoved.toString(),
        remediedToInvolvedRatio: fixedRatio(totalRemedied, totalInvolved),
        ratioIsDescriptivePublisherStatusSnapshot: true,
        ratioIsNotUniqueRepairReceiptOrActuarialRate: true,
      },
      post2010RecallLinkage: {
        rowsLinked: rowsLinkedToPost2010Recall,
        campaignsLinked: campaignsLinkedToPost2010Recall,
        campaignsOutsideCapturedPost2010RecallSlice: campaignIds.size - campaignsLinkedToPost2010Recall,
        missingLinkDoesNotImplyInvalidStatusRecord: true,
      },
      entrySha256: scan.entrySha256,
    },
  };
}

function reconcileCampaignPopulations(recallPopulations, statusInvolved) {
  let statusCampaignsWithRecallPopulation = 0;
  let exactMatches = 0;
  let statusInvolvedGreater = 0;
  let recallPotentialAffectedGreater = 0;
  let totalAbsoluteDifference = 0n;
  for (const [campaignId, involved] of statusInvolved) {
    if (!recallPopulations.has(campaignId)) continue;
    statusCampaignsWithRecallPopulation += 1;
    const potentialAffected = recallPopulations.get(campaignId);
    if (involved === potentialAffected) exactMatches += 1;
    else if (involved > potentialAffected) statusInvolvedGreater += 1;
    else recallPotentialAffectedGreater += 1;
    totalAbsoluteDifference += involved > potentialAffected
      ? involved - potentialAffected : potentialAffected - involved;
  }
  return {
    selectedStatusCampaigns: statusInvolved.size,
    statusCampaignsWithRecallPopulation,
    statusCampaignsOutsideCapturedRecallPopulation:
      statusInvolved.size - statusCampaignsWithRecallPopulation,
    exactMatches,
    statusInvolvedGreater,
    recallPotentialAffectedGreater,
    totalAbsoluteDifference: totalAbsoluteDifference.toString(),
    reconciliationDifferenceRetainedNotAdjusted: true,
    eitherFieldIsCurrentInServiceExposureEstablished: false,
  };
}

function validateDocumentation(files) {
  const recall = files["RCL.txt"].toString("latin1");
  const quarterly = files["RCL_Qtrly_Rpts.txt"].toString("latin1");
  const annual = files["RCL_Annual_Rpts.txt"].toString("latin1");
  const checks = {
    recallCampaignDefinitionPinned: recall.includes("contains all NHTSA safety-related defect and compliance")
      && recall.includes("POTAFF") && recall.includes("CORRECTIVE_ACTION"),
    quarterlyCumulativeFieldsPinned: quarterly.includes("Year 2015 Quarter 1")
      && quarterly.includes("TTLREMEDIED") && quarterly.includes("TTLUNREACH")
      && quarterly.includes("TTLREMOVED"),
    annualEligibilityBoundaryPinned: annual.includes("at least 8 successfully submitted quarterly reports")
      && annual.includes("12 months must have occurred") && annual.includes("RPT_PERIOD"),
  };
  if (Object.values(checks).some((value) => value !== true)) fail("DOCUMENTATION_SEMANTICS_MISMATCH");
  return checks;
}

export async function buildNhtsaRecallRemedyEvidenceFromSourceDirectory(sourceDirectory, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    fail("BUILD_OPTIONS_INVALID");
  }
  if (Object.hasOwn(options, "generatedAt")
    && options.generatedAt !== NHTSA_RECALL_REMEDY_CANONICAL_GENERATED_AT) {
    fail("GENERATED_AT_NOT_CANONICAL_FROZEN_VALUE");
  }
  const generatedAt = NHTSA_RECALL_REMEDY_CANONICAL_GENERATED_AT;
  const files = stableReadSourceDirectory(sourceDirectory);
  const documentation = validateDocumentation(files);
  const recallPin = SOURCE_FILES.find((file) => file.name === "FLAT_RCL_POST_2010.zip");
  const quarterlyPin = SOURCE_FILES.find((file) => file.name === "FLAT_RCL_Qrtly_Rpts.zip");
  const annualPin = SOURCE_FILES.find((file) => file.name === "FLAT_RCL_Annual_Rpts.zip");
  const recalls = await parseRecallPopulation(files[recallPin.name], recallPin);
  const quarterly = await parseStatusPopulation(files[quarterlyPin.name], quarterlyPin,
    "QUARTERLY", recalls.campaignIds);
  const annual = await parseStatusPopulation(files[annualPin.name], annualPin,
    "ANNUAL", recalls.campaignIds);
  let recallCampaignsWithQuarterly = 0;
  let recallCampaignsWithAnnual = 0;
  let recallCampaignsWithBoth = 0;
  for (const campaignId of recalls.campaignIds) {
    const hasQuarterly = quarterly.campaignIds.has(campaignId);
    const hasAnnual = annual.campaignIds.has(campaignId);
    if (hasQuarterly) recallCampaignsWithQuarterly += 1;
    if (hasAnnual) recallCampaignsWithAnnual += 1;
    if (hasQuarterly && hasAnnual) recallCampaignsWithBoth += 1;
  }
  const filesProjection = sourceProjection().map((file) => {
    if (file.name === recallPin.name) return { ...file, rows: recalls.projection.rows };
    if (file.name === quarterlyPin.name) return { ...file, rows: quarterly.projection.rows };
    if (file.name === annualPin.name) return { ...file, rows: annual.projection.rows };
    return { ...file, rows: null };
  });
  const sourceSetHash = digest({
    sourceId: NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.sourceId,
    files: filesProjection.map(({ rows: _rows, ...file }) => file),
  });
  const withoutHash = {
    schema: NHTSA_RECALL_REMEDY_EVIDENCE_SCHEMA,
    generatedAt,
    source: {
      sourceId: NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.sourceId,
      publisher: NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.publisher,
      frozenAt: FROZEN_AT,
      officialIndexUrl: NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.officialIndexUrl,
      programUrl: NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.programUrl,
      sourceReality: "REAL_MANUFACTURER_RECALL_AND_STATUS_REPORTS_AGENCY_PUBLISHED",
      profileMatchedAtBuild: true,
      sourceSetHash,
      acquisitionManifestSha256: sha256Bytes(files["acquisition.json"]),
      files: filesProjection,
      documentation,
      publisherChecksumObserved: false,
      localExactSha256IsNotPublisherChecksum: true,
      transportAttested: false,
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
      publicOriginNeitherDowngradesNorUpgradesDataReality: true,
      researchOrShadowIsInferenceAndAuthorityBoundaryNotSourceReality: true,
    },
    recallPopulation: recalls.projection,
    quarterlyStatus: quarterly.projection,
    annualStatus: annual.projection,
    lifecycleLinkage: {
      post2010RecallCampaigns: recalls.campaignIds.size,
      withQuarterlyStatus: recallCampaignsWithQuarterly,
      withAnnualStatus: recallCampaignsWithAnnual,
      withBothQuarterlyAndAnnualStatus: recallCampaignsWithBoth,
      linkKey: "NHTSA_CAMPAIGN_NUMBER",
      quarterlyPopulationReconciliation: reconcileCampaignPopulations(
        recalls.campaignPopulations, quarterly.selectedInvolvedByCampaign),
      annualPopulationReconciliation: reconcileCampaignPopulations(
        recalls.campaignPopulations, annual.selectedInvolvedByCampaign),
      linkageIsPublisherRecordAssociationNotCausalOrConsumerReceiptProof: true,
      completeRepairChainEstablished: false,
      paymentRecoveryReopeningClosureChainEstablished: false,
    },
    qualityAndMissingness: {
      exactCompressedAndUncompressedBytesReplayed: true,
      canonicalGeneratedAtLockedToFrozenBuildContract: true,
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
    privacy: {
      rawSourcePersonalDataAbsenceConcluded: false,
      rawNarrativeOrContactFieldsEmitted: false,
      manufacturerNamesEmitted: false,
      campaignIdentifiersEmitted: false,
      anomalyCampaignIdentifiersDomainHashed: true,
      outputIsAggregateAndDeterministicallyMinimized: true,
      trainingAdmitted: false,
    },
    rights: {
      officialPublicDownloadObserved: true,
      exactPublicBytesReplayed: true,
      rawRedistributionRightConcluded: false,
      commercialUseRightConcluded: false,
      modelTrainingRightConcluded: false,
      legalConclusionMade: false,
      allowedUse: ["DESCRIPTIVE_SOURCE_REPLAY", "SHADOW_REMEDY_STATUS_SENSING"],
    },
    progress: {
      stage1_5: ["REAL_RECALL_CASE_IDENTITIES", "REAL_REMEDY_STATUS_REPORTING_CHANNEL"],
      stage2: ["CAMPAIGN_TO_QUARTERLY_AND_ANNUAL_STATUS_LINKAGE",
        "QUALITY_GATED_DESCRIPTIVE_COMPLETION_REFERENCE"],
      stage3: [],
      stage4: [],
      sourceDomainOutcomeSensing: true,
      sourceDomainRemedyStatusSensing: true,
      affectedPartyReceiptSensing: false,
      actuarialLossCalibration: false,
      targetTransferAdmitted: false,
      priceInputAdmitted: false,
      productionReadiness: false,
    },
    authority: {
      PRICE: false, GUARANTEE: false, SETTLE: false, TRAIN: false,
      CLOSE: false, EXECUTE: false,
    },
    admission: "ADMIT_REAL_NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE_ONLY",
  };
  return Object.freeze({ ...withoutHash, artifactHash: digest(withoutHash) });
}

function structuralErrors(artifact) {
  const errors = [];
  const top = ["schema", "generatedAt", "source", "ontology", "recallPopulation",
    "quarterlyStatus", "annualStatus", "lifecycleLinkage", "qualityAndMissingness",
    "privacy", "rights", "progress", "authority", "admission", "artifactHash"];
  if (!exactKeys(artifact, top)) return ["SCHEMA_KEYS_INVALID"];
  if (artifact.schema !== NHTSA_RECALL_REMEDY_EVIDENCE_SCHEMA) errors.push("SCHEMA_INVALID");
  try { canonicalTime(artifact.generatedAt, "GENERATED_AT"); } catch { errors.push("GENERATED_AT_INVALID"); }
  if (artifact.generatedAt !== NHTSA_RECALL_REMEDY_CANONICAL_GENERATED_AT) {
    errors.push("GENERATED_AT_NOT_CANONICAL_FROZEN_VALUE");
  }
  if (!HASH.test(artifact.artifactHash)) errors.push("ARTIFACT_HASH_FORMAT_INVALID");
  else {
    const { artifactHash, ...withoutHash } = artifact;
    if (digest(withoutHash) !== artifactHash) errors.push("ARTIFACT_HASH_MISMATCH");
  }
  const expectedFiles = sourceProjection();
  if (artifact.source?.sourceId !== NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.sourceId
    || artifact.source?.profileMatchedAtBuild !== true
    || artifact.source?.sourceReality
      !== "REAL_MANUFACTURER_RECALL_AND_STATUS_REPORTS_AGENCY_PUBLISHED"
    || !Array.isArray(artifact.source?.files)
    || !same(artifact.source.files.map(({ rows: _rows, ...file }) => file), expectedFiles)) {
    errors.push("SOURCE_BINDING_INVALID");
  }
  if (artifact.ontology?.officialRecordAutomaticallyEqualsUnderlyingWorldTruth !== false
    || artifact.ontology?.recallEstablishesIndependentCausality !== false
    || artifact.ontology?.statusRowEstablishesAffectedPartyReceipt !== false
    || artifact.ontology?.remediedCountEstablishesIndividuallyVerifiedCompleteRepair !== false
    || artifact.ontology?.affectedPopulationEstablishesCurrentExposure !== false
    || artifact.ontology?.statusCountsEstablishPaidIncurredOrUltimateLoss !== false
    || artifact.ontology?.recallManagementRecordIsEnforcementOrder !== false) {
    errors.push("ONTOLOGY_BOUNDARY_INVALID");
  }
  if (!exactKeys(artifact.authority,
    ["PRICE", "GUARANTEE", "SETTLE", "TRAIN", "CLOSE", "EXECUTE"])
    || Object.values(artifact.authority).some((value) => value !== false)) {
    errors.push("AUTHORITY_INVALID");
  }
  if (artifact.rights?.rawRedistributionRightConcluded !== false
    || artifact.rights?.commercialUseRightConcluded !== false
    || artifact.rights?.modelTrainingRightConcluded !== false
    || artifact.rights?.legalConclusionMade !== false) errors.push("RIGHTS_BOUNDARY_INVALID");
  if (artifact.privacy?.trainingAdmitted !== false
    || artifact.progress?.affectedPartyReceiptSensing !== false
    || artifact.progress?.actuarialLossCalibration !== false
    || artifact.progress?.targetTransferAdmitted !== false
    || artifact.progress?.priceInputAdmitted !== false
    || artifact.progress?.productionReadiness !== false) errors.push("ADMISSION_BOUNDARY_INVALID");
  if (artifact.qualityAndMissingness?.canonicalGeneratedAtLockedToFrozenBuildContract !== true) {
    errors.push("GENERATED_AT_LOCK_BOUNDARY_INVALID");
  }
  if (artifact.lifecycleLinkage?.completeRepairChainEstablished !== false
    || artifact.lifecycleLinkage?.paymentRecoveryReopeningClosureChainEstablished !== false) {
    errors.push("LIFECYCLE_BOUNDARY_INVALID");
  }
  if (artifact.quarterlyStatus?.sourceQualityAnomalies?.anomaliesRetainedNotRepaired !== true
    || artifact.quarterlyStatus?.latestObservedCampaignSnapshot
      ?.latestRowsAreNotReplacedByEarlierValidRows !== true) {
    errors.push("SOURCE_ANOMALY_BOUNDARY_INVALID");
  }
  return errors;
}

export function verifyNhtsaRecallRemedyEvidence(artifact) {
  const errors = structuralErrors(artifact);
  return {
    ok: errors.length === 0,
    verificationLevel: "STRUCTURE_ONLY",
    sourceArtifactsReverified: false,
    officialSourceProfileReproduced: false,
    candidateArtifactExactlyRebuilt: false,
    realInstitutionalRecordAdmissionEstablished: false,
    underlyingWorldTruthEstablished: false,
    affectedPartyReceiptEstablished: false,
    institutionalAuthorityEstablished: false,
    decision: null,
    artifactHash: errors.length === 0 ? artifact.artifactHash : null,
    errors,
  };
}

export async function verifyNhtsaRecallRemedyEvidenceWithSource(artifact, sourceDirectory) {
  const structure = verifyNhtsaRecallRemedyEvidence(artifact);
  if (!structure.ok) return { ...structure, verificationLevel: "FULL_SOURCE_REPLAY_FAILED" };
  try {
    const rebuilt = await buildNhtsaRecallRemedyEvidenceFromSourceDirectory(sourceDirectory);
    const exact = same(rebuilt, artifact);
    if (!exact) fail("EXACT_REBUILD_MISMATCH");
    return {
      ok: true,
      verificationLevel: "FULL_PINNED_NHTSA_RECALL_REMEDY_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE",
      sourceArtifactsReverified: true,
      officialSourceProfileReproduced: true,
      candidateArtifactExactlyRebuilt: true,
      canonicalGeneratedAtReproduced: true,
      realInstitutionalRecordAdmissionEstablished: true,
      underlyingWorldTruthEstablished: false,
      independentCausalityEstablished: false,
      affectedPartyReceiptEstablished: false,
      completeRepairEstablished: false,
      lossCalibrationEstablished: false,
      institutionalAuthorityEstablished: false,
      decision: "ADMIT_REAL_NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE_ONLY",
      artifactHash: artifact.artifactHash,
      errors: [],
    };
  } catch (error) {
    return {
      ...structure,
      ok: false,
      verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false,
      officialSourceProfileReproduced: false,
      candidateArtifactExactlyRebuilt: false,
      artifactHash: null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export const NHTSA_RECALL_REMEDY_MAX_ARTIFACT_BYTES = MAX_ARTIFACT_BYTES;
