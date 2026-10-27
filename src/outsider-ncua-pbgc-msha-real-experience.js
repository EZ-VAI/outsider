/*
 * Source-aware real institutional and reported-experience intake for:
 *   - NCUA's 2025 Share Insurance Fund audited financial statements,
 *   - PBGC's current pension-insurance operational data and FY2025 report,
 *   - MSHA's accident/injury/illness and employment/exposure exports.
 *
 * Public origin neither demotes reality nor manufactures authority.  Audit
 * scope, publisher/self-report status, population frame, revision, privacy,
 * rights, transfer and operational authority remain separate dimensions.
 */

import { createHash } from "node:crypto";
import {
  accessSync, closeSync, constants as fsConstants, fstatSync, lstatSync,
  openSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

import { canonicalizeStrict } from "./canonical.js";

export const NCUA_PBGC_MSHA_REAL_EXPERIENCE_SCHEMA
  = "outsider/ncua-pbgc-msha-real-experience/v1";
export const NCUA_PBGC_MSHA_REAL_EXPERIENCE_FROZEN_AT = "2026-08-21T13:30:00.000Z";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const ACQUISITION_NAME = "acquisition.json";
const MAX_SMALL_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_XLSX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_XLSX_TOTAL_BYTES = 16 * 1024 * 1024;
const STREAM_PARSER = fileURLToPath(new URL("../scripts/ncua-pbgc-msha-msha-stream.mjs", import.meta.url));

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const NCUA_PBGC_MSHA_SOURCE_PINS_20260821 = deepFreeze([
  { name: "ncua-annual-report-2025.pdf", lane: "NCUA", kind: "AUDITED_ANNUAL_REPORT_PDF",
    url: "https://ncua.gov/files/annual-reports/annual-report-2025.pdf", bytes: 2_411_372,
    sha256: "sha256:96525a998e26871aaf3da4e5ac0c3b26d1c79783a21ba76e795959a5803338df", pages: 194 },
  { name: "ncua-december-2025-share-insurance-highlights.html", lane: "NCUA",
    kind: "PRELIMINARY_UNAUDITED_FINANCIAL_HIGHLIGHTS_HTML",
    url: "https://ncua.gov/news/publication-search/share-insurance-fund/december-2025-share-insurance-fund-financial-highlights",
    bytes: 61_781, sha256: "sha256:5ae2b8fb38b9ceeab91e91dc96486fa6c1bdca508de18c4dd72192f476e7991a" },
  { name: "pbgc-pension-insurance-data.html", lane: "PBGC", kind: "DATA_INDEX_AND_AVAILABILITY_HTML",
    url: "https://www.pbgc.gov/about/reports/pension-insurance-data", bytes: 83_504,
    sha256: "sha256:ba3e2807cc97ae353ab7bec50941e7e7e480c2c6b80e46fd83046e8ef482cd9d" },
  { name: "pbgc-2024-pension-data-tables.pdf", lane: "PBGC", kind: "PENSION_DATA_TABLES_FIRST_INSTALLMENT_PDF",
    url: "https://www.pbgc.gov/sites/default/files/documents/2024-pension-data-tables.pdf", bytes: 2_850_162,
    sha256: "sha256:1ece72d658056b7310883a7bc75d2dbabd13aef7ac3acac0415d2d6137804d51", pages: 37 },
  { name: "pbgc-2024-pension-data-tables.xlsx", lane: "PBGC", kind: "PENSION_DATA_TABLES_FIRST_INSTALLMENT_XLSX",
    url: "https://www.pbgc.gov/sites/default/files/documents/2024-pension-data-tables.xlsx", bytes: 1_282_942,
    sha256: "sha256:a4d2a029de3e69a5e43c928beea77c943108683dc2129a63775f889c5608ca01" },
  { name: "pbgc-annual-report-2025.pdf", lane: "PBGC", kind: "AUDITED_ANNUAL_REPORT_PDF",
    url: "https://www.pbgc.gov/sites/default/files/documents/pbgc-annual-report-2025.pdf", bytes: 3_511_185,
    sha256: "sha256:9c81c3dc011665db740331b6157188526a7a44f091bcc4e61f2abb20513170da", pages: 149 },
  { name: "msha-open-government-data.html", lane: "MSHA", kind: "DATASET_INDEX_AND_REFRESH_PROFILE_HTML",
    url: "https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA.asp", bytes: 30_491,
    sha256: "sha256:8e0c198aeba3f688c0928df5fecdf3c890db1ca113ee2427d0a1330a35dc159b" },
  { name: "msha-accidents.zip", lane: "MSHA", kind: "OPERATOR_CONTRACTOR_REPORTED_ACCIDENTS_ZIP",
    url: "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Accidents.zip", bytes: 52_121_983,
    sha256: "sha256:6241a7db7119dd64fe70d661a47689eee523d59885caa99969d5ca6d278ae366",
    streamKind: "ACCIDENTS" },
  { name: "msha-accidents-definitions.txt", lane: "MSHA", kind: "ACCIDENT_FIELD_DICTIONARY_TXT",
    url: "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Accidents_Definition_File.txt", bytes: 10_214,
    sha256: "sha256:c7681808dd372b6c5bd95fdf70b01e856e0d2501b7e5d7cc9185f4c4e1f876e5" },
  { name: "msha-mines-prod-quarterly.zip", lane: "MSHA", kind: "MINE_QUARTERLY_EMPLOYMENT_EXPOSURE_ZIP",
    url: "https://arlweb.msha.gov/OpenGovernmentData/DataSets/MinesProdQuarterly.zip", bytes: 53_931_298,
    sha256: "sha256:29af7b8d15562d352f2260c251bc0785450f0937ac5dea823367bb43000ced85",
    streamKind: "MINE_EMPLOYMENT" },
  { name: "msha-mines-prod-quarterly-definitions.txt", lane: "MSHA", kind: "MINE_EMPLOYMENT_FIELD_DICTIONARY_TXT",
    url: "https://arlweb.msha.gov/OpenGovernmentData/DataSets/MineSProdQuarterly_Definition_File.txt", bytes: 2_055,
    sha256: "sha256:9177770776652a8f3c3a120ab973799a69d333c5f0aa7b5eb51b5150d08e19f3" },
  { name: "msha-contractor-prod-quarterly.zip", lane: "MSHA", kind: "CONTRACTOR_QUARTERLY_EMPLOYMENT_EXPOSURE_ZIP",
    url: "https://arlweb.msha.gov/OpenGovernmentData/DataSets/ContractorProdQuarterly.zip", bytes: 9_525_950,
    sha256: "sha256:e26fa0f7c6551d41e69fa55527b6427b38d722dbc0b53482e80e771096eefa6d",
    streamKind: "CONTRACTOR_EMPLOYMENT" },
  { name: "msha-contractor-prod-quarterly-definitions.txt", lane: "MSHA",
    kind: "CONTRACTOR_EMPLOYMENT_FIELD_DICTIONARY_TXT",
    url: "https://arlweb.msha.gov/OpenGovernmentData/DataSets/ContractorProdQuarterly_Definition_File.txt", bytes: 1_983,
    sha256: "sha256:cd5cc19bd91c48ea9d35969817c18e402dfe3e7954f498edd53231861bdd8391" },
  { name: "msha-part50-yellow-jacket.pdf", lane: "MSHA", kind: "PART_50_REPORTING_HANDBOOK_PDF",
    url: "https://arlweb.msha.gov/stats/part50/rptonpart50.pdf", bytes: 3_585_200,
    sha256: "sha256:640699fcf0e2e3ce60a92272fe830e44d1d84a5d8f13ca3ee6bd8e846fa9c69c", pages: 52 },
  { name: "msha-source-scope.html", lane: "MSHA", kind: "SOURCE_SCOPE_AND_RATE_DEFINITION_HTML",
    url: "https://arlweb.msha.gov/STATS/STATSCR1.HTM", bytes: 12_168,
    sha256: "sha256:87792da2eded71aaa5e2f4474cd8472edbfcffd9ea3920a36b6437d3b2acc6fd" },
]);

const PIN_BY_NAME = new Map(NCUA_PBGC_MSHA_SOURCE_PINS_20260821.map((pin) => [pin.name, pin]));
const EXPECTED_NAMES = NCUA_PBGC_MSHA_SOURCE_PINS_20260821.map((pin) => pin.name).sort();

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function domainHash(domain, value) { return sha256(`${domain}\0${canonicalizeStrict(value)}`); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function canonicalTime(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${code}_INVALID`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${code}_NOT_CANONICAL`);
  return normalized;
}
function xmlDecode(value) {
  return String(value).replace(/&#x([0-9a-f]+);/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");
}

function expectedManifestProjection() {
  const files = NCUA_PBGC_MSHA_SOURCE_PINS_20260821.map((pin) => ({
    name: pin.name, lane: pin.lane, kind: pin.kind, url: pin.url,
    bytes: pin.bytes, sha256: pin.sha256,
    captureRepresentation: "EXACT_PUBLISHER_FILE_BYTES",
  }));
  return { schema: "outsider/ncua-pbgc-msha-source-acquisition/v1",
    sourceId: "NCUA_PBGC_MSHA_20260821", frozenAt: NCUA_PBGC_MSHA_REAL_EXPERIENCE_FROZEN_AT,
    sourceCount: files.length, sourceBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    transportAttested: false, files };
}

function stableReadOne(directory, name, maximum = MAX_SMALL_SOURCE_BYTES) {
  const target = path.join(directory, name);
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.size <= 0n
    || pathBefore.size > BigInt(maximum)) throw new Error(`NCUA_PBGC_MSHA_SOURCE_FILE_UNSAFE:${name}`);
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(target, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) throw new Error(`NCUA_PBGC_MSHA_SOURCE_CHANGED:${name}`);
    }
    if (BigInt(bytes.length) !== before.size) throw new Error(`NCUA_PBGC_MSHA_SOURCE_SHORT_READ:${name}`);
    return { bytes, target };
  } finally { closeSync(fd); }
}

function validateManifest(bytes) {
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("NCUA_PBGC_MSHA_ACQUISITION_MANIFEST_JSON_INVALID"); }
  if (canonicalizeStrict(manifest) !== canonicalizeStrict(expectedManifestProjection())) {
    throw new Error("NCUA_PBGC_MSHA_ACQUISITION_MANIFEST_PROFILE_MISMATCH");
  }
  return { manifest, sha256: sha256(bytes) };
}

function stableReadSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || !sourceDirectory.trim()) {
    throw new Error("NCUA_PBGC_MSHA_SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) throw new Error("NCUA_PBGC_MSHA_SOURCE_DIRECTORY_TOO_BROAD");
  const root = lstatSync(directory, { bigint: true });
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("NCUA_PBGC_MSHA_SOURCE_DIRECTORY_UNSAFE");
  const expected = [...EXPECTED_NAMES, ACQUISITION_NAME].sort();
  if (canonicalizeStrict(readdirSync(directory).sort()) !== canonicalizeStrict(expected)) {
    throw new Error("NCUA_PBGC_MSHA_SOURCE_DIRECTORY_PROFILE_MISMATCH");
  }
  const files = {};
  const paths = {};
  for (const pin of NCUA_PBGC_MSHA_SOURCE_PINS_20260821) {
    if (pin.streamKind) {
      const target = path.join(directory, pin.name);
      const stat = lstatSync(target, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== BigInt(pin.bytes)) {
        throw new Error(`NCUA_PBGC_MSHA_SOURCE_FILE_UNSAFE:${pin.name}`);
      }
      paths[pin.name] = target;
    } else {
      const read = stableReadOne(directory, pin.name);
      if (read.bytes.length !== pin.bytes || sha256(read.bytes) !== pin.sha256) {
        throw new Error(`NCUA_PBGC_MSHA_SOURCE_PIN_MISMATCH:${pin.name}`);
      }
      files[pin.name] = read.bytes;
      paths[pin.name] = read.target;
    }
  }
  const manifestRead = stableReadOne(directory, ACQUISITION_NAME, 256 * 1024);
  const manifest = validateManifest(manifestRead.bytes);
  return { directory, files, paths, manifestHash: manifest.sha256 };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function findZipEnd(bytes) {
  const floor = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= floor; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("NCUA_PBGC_MSHA_XLSX_END_NOT_FOUND");
}
function unzipEntries(bytes, sourceName) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > MAX_SMALL_SOURCE_BYTES) {
    throw new Error(`NCUA_PBGC_MSHA_XLSX_BYTES_INVALID:${sourceName}`);
  }
  const end = findZipEnd(bytes);
  const disk = bytes.readUInt16LE(end + 4);
  const centralDisk = bytes.readUInt16LE(end + 6);
  const diskEntries = bytes.readUInt16LE(end + 8);
  const entryCount = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  const commentLength = bytes.readUInt16LE(end + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount || entryCount <= 0
    || entryCount > 1_000 || end + 22 + commentLength !== bytes.length
    || centralOffset + centralSize > end) throw new Error(`NCUA_PBGC_MSHA_XLSX_CENTRAL_INVALID:${sourceName}`);
  const entries = new Map();
  let central = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (central + 46 > end || bytes.readUInt32LE(central) !== 0x02014b50) {
      throw new Error(`NCUA_PBGC_MSHA_XLSX_CENTRAL_ENTRY_INVALID:${sourceName}`);
    }
    const flags = bytes.readUInt16LE(central + 8);
    const method = bytes.readUInt16LE(central + 10);
    const expectedCrc = bytes.readUInt32LE(central + 16);
    const compressedSize = bytes.readUInt32LE(central + 20);
    const uncompressedSize = bytes.readUInt32LE(central + 24);
    const nameLength = bytes.readUInt16LE(central + 28);
    const extraLength = bytes.readUInt16LE(central + 30);
    const itemCommentLength = bytes.readUInt16LE(central + 32);
    const localOffset = bytes.readUInt32LE(central + 42);
    const next = central + 46 + nameLength + extraLength + itemCommentLength;
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || next > end
      || uncompressedSize > MAX_XLSX_ENTRY_BYTES || localOffset + 30 > centralOffset
      || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`NCUA_PBGC_MSHA_XLSX_ENTRY_UNSUPPORTED:${sourceName}`);
    }
    const name = bytes.subarray(central + 46, central + 46 + nameLength).toString("utf8");
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")
      || /[\u0000-\u001f\u007f]/u.test(name) || entries.has(name)) {
      throw new Error(`NCUA_PBGC_MSHA_XLSX_ENTRY_NAME_INVALID:${sourceName}`);
    }
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (localName !== name || dataOffset + compressedSize > centralOffset) {
      throw new Error(`NCUA_PBGC_MSHA_XLSX_LOCAL_BINDING_INVALID:${sourceName}`);
    }
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let output;
    try { output = method === 0 ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: Math.max(1, uncompressedSize) }); }
    catch { throw new Error(`NCUA_PBGC_MSHA_XLSX_INFLATE_INVALID:${sourceName}:${name}`); }
    if (output.length !== uncompressedSize || crc32(output) !== expectedCrc) {
      throw new Error(`NCUA_PBGC_MSHA_XLSX_ENTRY_INTEGRITY_INVALID:${sourceName}:${name}`);
    }
    totalUncompressed += output.length;
    if (totalUncompressed > MAX_XLSX_TOTAL_BYTES) throw new Error(`NCUA_PBGC_MSHA_XLSX_TOTAL_TOO_LARGE:${sourceName}`);
    entries.set(name, output);
    central = next;
  }
  if (central !== centralOffset + centralSize) throw new Error(`NCUA_PBGC_MSHA_XLSX_CENTRAL_LENGTH_INVALID:${sourceName}`);
  return entries;
}
function requireZipEntry(entries, name, sourceName) {
  const bytes = entries.get(name);
  if (!bytes) throw new Error(`NCUA_PBGC_MSHA_XLSX_ENTRY_MISSING:${sourceName}:${name}`);
  return bytes.toString("utf8");
}
function attribute(source, name) {
  const match = String(source).match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u"));
  return match ? xmlDecode(match[1]) : null;
}
function parseSharedStrings(xml, sourceName) {
  const values = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)) {
    values.push([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
      .map((part) => xmlDecode(part[1])).join(""));
  }
  if (values.length === 0) throw new Error(`NCUA_PBGC_MSHA_XLSX_SHARED_STRINGS_INVALID:${sourceName}`);
  return values;
}
function cellColumn(reference) {
  const match = String(reference).match(/^([A-Z]{1,3})[1-9]\d*$/u);
  if (!match) throw new Error("NCUA_PBGC_MSHA_XLSX_CELL_REFERENCE_INVALID");
  let value = 0;
  for (const character of match[1]) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}
function parseWorksheet(xml, sharedStrings, sourceName, sheetName) {
  const dimension = xml.match(/<dimension\b[^>]*\bref="([A-Z0-9:]+)"/u)?.[1] ?? null;
  if (!dimension) throw new Error(`NCUA_PBGC_MSHA_XLSX_DIMENSION_MISSING:${sourceName}:${sheetName}`);
  const rows = [];
  const rowNumbers = new Set();
  const formulaReferences = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/gu)) {
    const rowNumber = Number(attribute(rowMatch[1], "r"));
    if (!Number.isSafeInteger(rowNumber) || rowNumber <= 0 || rowNumbers.has(rowNumber)) {
      throw new Error(`NCUA_PBGC_MSHA_XLSX_ROW_INVALID:${sourceName}:${sheetName}`);
    }
    rowNumbers.add(rowNumber);
    const cells = [];
    const columns = new Set();
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
      const reference = attribute(cellMatch[1], "r");
      const column = cellColumn(reference);
      if (columns.has(column)) throw new Error(`NCUA_PBGC_MSHA_XLSX_DUPLICATE_CELL:${sourceName}:${reference}`);
      columns.add(column);
      const type = attribute(cellMatch[1], "t");
      const body = cellMatch[2] ?? "";
      if (/<f\b/u.test(body)) formulaReferences.push(reference);
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1] ?? null;
      let value = raw === null ? "" : xmlDecode(raw);
      if (type === "s" && value !== "") {
        const index = Number(value);
        if (!Number.isSafeInteger(index) || index < 0 || index >= sharedStrings.length) {
          throw new Error(`NCUA_PBGC_MSHA_XLSX_SHARED_INDEX_INVALID:${sourceName}:${reference}`);
        }
        value = sharedStrings[index];
      } else if (type === "inlineStr") {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
          .map((part) => xmlDecode(part[1])).join("");
      }
      cells[column] = value;
    }
    rows.push({ rowNumber, cells });
  }
  if (rows.length === 0) throw new Error(`NCUA_PBGC_MSHA_XLSX_ROWS_MISSING:${sourceName}:${sheetName}`);
  return { dimension, rows, formulaReferences };
}

export function inspectPbgcWorkbookShape(bytes) {
  const sourceName = "pbgc-2024-pension-data-tables.xlsx";
  const entries = unzipEntries(bytes, sourceName);
  const workbookXml = requireZipEntry(entries, "xl/workbook.xml", sourceName);
  const rels = requireZipEntry(entries, "xl/_rels/workbook.xml.rels", sourceName);
  const shared = parseSharedStrings(requireZipEntry(entries, "xl/sharedStrings.xml", sourceName), sourceName);
  const targets = new Map();
  for (const match of rels.matchAll(/<Relationship\b([^>]*?)\/>/gu)) {
    const id = attribute(match[1], "Id");
    const target = attribute(match[1], "Target");
    if (id && target) targets.set(id, target.replace(/^\/?xl\//u, ""));
  }
  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/>/gu)) {
    const name = attribute(match[1], "name");
    const relationshipId = attribute(match[1], "r:id");
    const target = targets.get(relationshipId);
    if (!name || !target || target.includes("..")) throw new Error("NCUA_PBGC_MSHA_XLSX_SHEET_BINDING_INVALID");
    const entry = target.startsWith("xl/") ? target : `xl/${target}`;
    sheets.push({ name, ...parseWorksheet(requireZipEntry(entries, entry, sourceName), shared, sourceName, name) });
  }
  if (sheets.length === 0) throw new Error("NCUA_PBGC_MSHA_XLSX_SHEETS_MISSING");
  return { sheets, sharedStringCount: shared.length,
    formulaCellCount: [...entries.entries()].filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name))
      .reduce((sum, [, entry]) => sum + (entry.toString("utf8").match(/<f\b/gu) ?? []).length, 0) };
}

function executableCandidates(name) {
  const candidates = [];
  for (const directory of String(process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(directory, name));
    if (name === "pdftotext") {
      candidates.push(path.resolve(directory, "../../native/poppler/bin/pdftotext"));
      candidates.push(path.resolve(directory, "../../native/poppler/poppler/bin/pdftotext"));
    }
  }
  return [...new Set(candidates)];
}
function findExecutable(name) {
  for (const candidate of executableCandidates(name)) {
    try {
      const stat = lstatSync(candidate);
      if (stat.isFile()) { accessSync(candidate, fsConstants.X_OK); return candidate; }
    } catch { /* continue */ }
  }
  throw new Error(`NCUA_PBGC_MSHA_REQUIRED_PDF_PARSER_MISSING:${name}`);
}
function pdfByteStructure(bytes, sourceName) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 128 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`NCUA_PBGC_MSHA_PDF_MAGIC_INVALID:${sourceName}`);
  }
  const tail = bytes.subarray(Math.max(0, bytes.length - 8_192)).toString("latin1");
  const matches = [...tail.matchAll(/startxref\s+(\d+)\s+%%EOF/gu)];
  if (matches.length === 0) throw new Error(`NCUA_PBGC_MSHA_PDF_FINAL_EOF_INVALID:${sourceName}`);
  const last = matches.at(-1);
  if (tail.slice((last.index ?? 0) + last[0].length).trim() !== "") {
    throw new Error(`NCUA_PBGC_MSHA_PDF_TRAILING_BYTES_INVALID:${sourceName}`);
  }
  const startXref = Number(last[1]);
  if (!Number.isSafeInteger(startXref) || startXref <= 0 || startXref >= bytes.length) {
    throw new Error(`NCUA_PBGC_MSHA_PDF_STARTXREF_INVALID:${sourceName}`);
  }
  return { startXref, eofAtPhysicalTail: true, structuralEnvelopeValidated: true };
}
function parsePdfFully(bytes, expected) {
  const structural = pdfByteStructure(bytes, expected.name);
  const infoRun = spawnSync(findExecutable("pdfinfo"), ["-"], {
    input: bytes, encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  if (infoRun.error || infoRun.status !== 0 || infoRun.signal || !infoRun.stdout) {
    throw new Error(`NCUA_PBGC_MSHA_PDFINFO_FAILED:${expected.name}`);
  }
  const pages = Number(infoRun.stdout.match(/^Pages:\s+(\d+)\s*$/mu)?.[1]);
  const version = infoRun.stdout.match(/^PDF version:\s+(.+)$/mu)?.[1]?.trim() ?? null;
  const title = infoRun.stdout.match(/^Title:\s+(.+)$/mu)?.[1]?.trim() ?? "";
  if (pages !== expected.pages || !version || title.length < 8) {
    throw new Error(`NCUA_PBGC_MSHA_PDFINFO_PROFILE_INVALID:${expected.name}`);
  }
  const textRun = spawnSync(findExecutable("pdftotext"), ["-layout", "-", "-"], {
    input: bytes, encoding: "utf8", timeout: 60_000, maxBuffer: 12 * 1024 * 1024 });
  if (textRun.error || textRun.status !== 0 || textRun.signal || typeof textRun.stdout !== "string") {
    throw new Error(`NCUA_PBGC_MSHA_PDFTEXT_FAILED:${expected.name}`);
  }
  const normalized = textRun.stdout.replace(/\s+/gu, " ").trim();
  const pageBreaks = (textRun.stdout.match(/\f/gu) ?? []).length;
  if (normalized.length < expected.pages * 50 || pageBreaks < expected.pages - 1) {
    throw new Error(`NCUA_PBGC_MSHA_PDFTEXT_INCOMPLETE:${expected.name}`);
  }
  return { ...structural, pageCount: pages, pdfVersion: version, titleHash: sha256(title),
    fullDocumentTextParsed: true, fullDocumentTextNonWhitespaceCharacters: normalized.replace(/\s/gu, "").length,
    pageBreaksObserved: pageBreaks, _text: normalized };
}

function pin(name) {
  const value = PIN_BY_NAME.get(name);
  if (!value) throw new Error(`NCUA_PBGC_MSHA_INTERNAL_PIN_MISSING:${name}`);
  return value;
}
function htmlText(bytes) {
  return xmlDecode(bytes.toString("utf8").replace(/<script\b[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " "))
    .replace(/\s+/gu, " ").trim();
}
function requireIncludes(text, values, code) {
  for (const value of values) if (!text.includes(value)) throw new Error(`${code}:${value}`);
}
function integerValue(value, code) {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(String(value))) throw new Error(`${code}_INVALID`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${code}_NONFINITE`);
  return parsed;
}
function sheet(workbook, name) {
  const value = workbook.sheets.find((candidate) => candidate.name === name);
  if (!value) throw new Error(`NCUA_PBGC_MSHA_PBGC_SHEET_MISSING:${name}`);
  return value;
}
function row(workbook, sheetName, rowNumber, expectedFirst) {
  const value = sheet(workbook, sheetName).rows.find((candidate) => candidate.rowNumber === rowNumber);
  if (!value || String(value.cells[0] ?? "") !== expectedFirst) {
    throw new Error(`NCUA_PBGC_MSHA_PBGC_ROW_BINDING_INVALID:${sheetName}:${rowNumber}`);
  }
  return value.cells;
}
function assertRow(values, expected, code) {
  for (let index = 0; index < expected.length; index += 1) {
    if (String(values[index] ?? "") !== String(expected[index])) throw new Error(`${code}:${index}`);
  }
}

export const PBGC_XLSX_PDF_KEY_METRIC_BINDINGS = deepFreeze([
  { id: "GLANCE_NET_FINANCIAL_POSITION", row: 4,
    xlsxLabel: "Net Financial Position", pdfLabel: "Net Financial Position",
    cells: [[1, "CURRENCY_NEAREST_WHOLE_MILLION"], [2, "CURRENCY_NEAREST_WHOLE_MILLION"],
      [3, "CURRENCY_NEAREST_WHOLE_MILLION"]] },
  { id: "GLANCE_TOTAL_ASSETS", row: 5, xlsxLabel: "Total Assets", pdfLabel: "Total Assets",
    cells: [[1, "CURRENCY_NEAREST_WHOLE_MILLION"], [2, "CURRENCY_NEAREST_WHOLE_MILLION"],
      [3, "CURRENCY_NEAREST_WHOLE_MILLION"]] },
  { id: "GLANCE_TOTAL_LIABILITIES", row: 6, xlsxLabel: "Total Liabilities", pdfLabel: "Total Liabilities",
    cells: [[1, "CURRENCY_NEAREST_WHOLE_MILLION"], [2, "CURRENCY_NEAREST_WHOLE_MILLION"],
      [3, "CURRENCY_NEAREST_WHOLE_MILLION"]] },
  { id: "GLANCE_INSURED_PLANS", row: 10, xlsxLabel: "Number of Insured Plans",
    pdfLabel: "Number of Insured Plans", cells: [[1, "COUNT"], [2, "COUNT"], [3, "COUNT"]] },
  { id: "GLANCE_INSURED_PARTICIPANTS", row: 11, xlsxLabel: "Number of Insured Participants",
    pdfLabel: "Number of Insured Participants", cells: [[1, "LITERAL"], [2, "LITERAL"], [3, "LITERAL"]] },
  { id: "GLANCE_CHANGE_IN_CLAIMS", row: 14, xlsxLabel: "Change in Claims 2",
    pdfLabel: "Change in Claims", cells: [[1, "CURRENCY_NEAREST_WHOLE_MILLION"],
      [2, "LITERAL"], [3, "CURRENCY_NEAREST_WHOLE_MILLION"]] },
  { id: "GLANCE_DIRECT_PAYEES", row: 17, xlsxLabel: "Paid Directly", pdfLabel: "Paid Directly",
    cells: [[1, "COUNT"], [2, "LITERAL"], [3, "COUNT"]] },
  { id: "GLANCE_TRADITIONAL_ASSISTANCE_PAYEES", row: 18,
    xlsxLabel: "Paid Indirectly Through Traditional Financial Assistance",
    pdfLabel: "Paid Indirectly Through Traditional Financial Assistance",
    cells: [[1, "LITERAL"], [2, "COUNT"], [3, "COUNT"]] },
  { id: "GLANCE_SFA_PLAN_PARTICIPANTS", row: 19,
    xlsxLabel: "Paid Indirectly Through Special Financial Assistance",
    pdfLabel: "Paid Indirectly Through Special Financial Assistance",
    cells: [[1, "LITERAL"], [2, "COUNT_DROP_XLSX_FOOTNOTE"], [3, "COUNT"]] },
  { id: "GLANCE_DIRECT_BENEFIT_PAYMENTS", row: 22, xlsxLabel: "Paid Directly to Payees",
    pdfLabel: "Paid Directly to Payees", cells: [[1, "CURRENCY_NEAREST_WHOLE_MILLION"],
      [2, "LITERAL"], [3, "CURRENCY_NEAREST_WHOLE_MILLION"]] },
  { id: "GLANCE_TRADITIONAL_ASSISTANCE_GRANTED", row: 23,
    xlsxLabel: "Traditional Financial Assistance Granted", pdfLabel: "Traditional Financial Assistance Granted",
    cells: [[1, "LITERAL"], [2, "CURRENCY_NEAREST_WHOLE_MILLION"],
      [3, "CURRENCY_NEAREST_WHOLE_MILLION"]] },
  { id: "GLANCE_SFA_GRANTED", row: 24, xlsxLabel: "Special Financial Assistance Granted",
    pdfLabel: "Special Financial Assistance Granted", cells: [[1, "LITERAL"],
      [2, "CURRENCY_NEAREST_WHOLE_MILLION"], [3, "CURRENCY_NEAREST_WHOLE_MILLION"]] },
]);

function commaInteger(value, code) {
  const digits = String(value).replace(/,/gu, "");
  if (!/^\d+$/u.test(digits)) throw new Error(`${code}_INTEGER_INVALID`);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}
function pbgcPdfDisplay(value, rule, code) {
  const normalized = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (rule === "LITERAL") {
    if (!normalized) throw new Error(`${code}_LITERAL_EMPTY`);
    return normalized;
  }
  if (rule === "COUNT" || rule === "COUNT_DROP_XLSX_FOOTNOTE") {
    const match = normalized.match(rule === "COUNT"
      ? /^(\d+(?:,\d{3})*)$/u : /^(\d+(?:,\d{3})*)(?: \d+)$/u);
    if (!match) throw new Error(`${code}_COUNT_INVALID`);
    return commaInteger(match[1], code);
  }
  if (rule === "CURRENCY_NEAREST_WHOLE_MILLION") {
    if (!/^\d+(?:\.\d+)?$/u.test(normalized)) throw new Error(`${code}_CURRENCY_INVALID`);
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`${code}_CURRENCY_NONFINITE`);
    return `$${commaInteger(String(Math.floor(numeric + 0.5)), code)}`;
  }
  throw new Error(`${code}_RULE_INVALID`);
}
function worksheetHasFormulaOnRow(worksheet, rowNumber) {
  return worksheet.formulaReferences.some((reference) =>
    Number(reference.match(/(\d+)$/u)?.[1]) === rowNumber);
}
function bindPbgcXlsxPdfKeyMetrics(workbook, pdfText) {
  if (!workbook || typeof workbook !== "object" || !Array.isArray(workbook.sheets)
    || typeof pdfText !== "string" || !pdfText.trim()) {
    throw new Error("NCUA_PBGC_MSHA_PBGC_CROSS_REPRESENTATION_INPUT_INVALID");
  }
  const normalizedPdf = pdfText.replace(/\s+/gu, " ").trim();
  const glanceSheet = sheet(workbook, "GLANCE");
  const bindings = PBGC_XLSX_PDF_KEY_METRIC_BINDINGS.map((binding) => {
    const values = row(workbook, "GLANCE", binding.row, binding.xlsxLabel);
    if (worksheetHasFormulaOnRow(glanceSheet, binding.row)) {
      throw new Error(`NCUA_PBGC_MSHA_PBGC_CROSS_REPRESENTATION_FORMULA_FORBIDDEN:${binding.id}`);
    }
    const xlsxCellValues = binding.cells.map(([column]) => String(values[column] ?? ""));
    const pdfDisplayedValues = binding.cells.map(([column, rule]) =>
      pbgcPdfDisplay(values[column], rule, `NCUA_PBGC_MSHA_PBGC_CROSS_REPRESENTATION:${binding.id}:${column}`));
    const expectedSegment = `${binding.pdfLabel} ${pdfDisplayedValues.join(" ")}`;
    if (!normalizedPdf.includes(expectedSegment)) {
      throw new Error(`NCUA_PBGC_MSHA_PBGC_CROSS_REPRESENTATION_MISMATCH:${binding.id}`);
    }
    return { id: binding.id, worksheet: "GLANCE", row: binding.row,
      xlsxLabel: binding.xlsxLabel, pdfLabel: binding.pdfLabel,
      xlsxCellValues, pdfDisplayedValues,
      xlsxCellsAreNonFormula: true,
      transformations: binding.cells.map(([, rule]) => rule),
      matchedPdfSegmentHash: sha256(expectedSegment) };
  });
  return { established: true, bindingCount: bindings.length,
    bindingSetHash: domainHash("outsider/pbgc-xlsx-pdf-key-metric-bindings/v1", bindings),
    numericPolicy: "XLSX_EXACT_VALUES_TO_PDF_NEAREST_WHOLE_MILLION_WHERE_CURRENCY_RULE_DECLARED",
    labelAndDisplayedValueSequenceRequired: true, bindings };
}

export function verifyPbgcWorkbookPdfKeyMetricBindings(workbook, pdfBytes) {
  if (!Buffer.isBuffer(pdfBytes)) throw new Error("NCUA_PBGC_MSHA_PBGC_CROSS_REPRESENTATION_PDF_INVALID");
  const parsed = parsePdfFully(pdfBytes, pin("pbgc-2024-pension-data-tables.pdf"));
  return bindPbgcXlsxPdfKeyMetrics(workbook, parsed._text);
}

function parseNcua(files) {
  const report = parsePdfFully(files["ncua-annual-report-2025.pdf"], pin("ncua-annual-report-2025.pdf"));
  const text = report._text;
  requireIncludes(text, [
    "We have audited the financial statements of National Credit Union Share Insurance Fund",
    "present fairly, in all material respects, the financial position of the National Credit Union Share Insurance Fund as of December 31, 2025",
    "Reasonable assurance is a high level of assurance but is not absolute assurance and therefore is not a guarantee",
    "Required Supplementary Information",
    "We do not express an opinion or provide any assurance on the information",
    "TOTAL ASSETS $ 24,105,761",
    "Insurance and Guarantee Program Liabilities (Note 5) 234,026",
    "Total Net Position 23,863,991",
    "Total Provision for Insurance Losses 4,888",
    "Insured Shares $1.9 trillion",
    "Equity Ratio 1.30%",
  ], "NCUA_PBGC_MSHA_NCUA_AUDIT_SEMANTICS_MISSING");
  const preliminary = htmlText(files["ncua-december-2025-share-insurance-highlights.html"]);
  requireIncludes(preliminary, ["December 2025 Share Insurance Fund Financial Highlights",
    "The balances in the statement above are preliminary and unaudited.",
    "Insurance and Guarantee Program Liabilities related to Reserves are $234.0 million",
    "insurance loss reduction of $14.1 million during the month of December 2025"],
  "NCUA_PBGC_MSHA_NCUA_PRELIMINARY_SEMANTICS_MISSING");
  const { _text, ...documentReceipt } = report;
  return {
    realityStatus: "REAL_INSTITUTIONAL_OPERATION_AND_AUDITED_FINANCIAL_EXPERIENCE",
    publisher: "UNITED_STATES_NATIONAL_CREDIT_UNION_ADMINISTRATION",
    accountingPeriodEnd: "2025-12-31", unit: "THOUSANDS_USD",
    auditedFinancialStatement: {
      auditor: "KPMG_LLP", opinion: "UNMODIFIED_PRESENTS_FAIRLY_IN_ALL_MATERIAL_RESPECTS",
      scope: "NCUSIF_BALANCE_SHEET_NET_COST_CHANGES_IN_NET_POSITION_AND_BUDGETARY_RESOURCES_FOR_2025",
      totalAssetsThousandsUsd: 24_105_761, totalLiabilitiesThousandsUsd: 241_770,
      netPositionThousandsUsd: 23_863_991, insuranceAndGuaranteeProgramLiabilitiesThousandsUsd: 234_026,
      provisionForInsuranceLossesThousandsUsd: 4_888,
      assuranceIsAbsolute: false, opinionExtendsToAllSupplementaryInformation: false,
    },
    exposureFrame: {
      publishedInsuredSharesRounded: "$1.9_TRILLION", publishedEquityRatio: "1.30%",
      equityRatioDefinition: "ONE_PERCENT_CONTRIBUTED_CAPITAL_PLUS_CUMULATIVE_RESULTS_EXCLUDING_NET_UNREALIZED_INVESTMENT_GAINS_LOSSES_DIVIDED_BY_AGGREGATE_INSURED_SHARES",
      individualAccountCoverageCapUsd: 250_000,
    },
    preliminaryComparator: {
      status: "REAL_PUBLISHER_FINANCIAL_RECORD_PRELIMINARY_UNAUDITED",
      sameDateAsAuditedStatement: true, admittedAsAuditedInput: false,
      reserveHeadlineMillionsUsd: 234.0, decemberMonthlyInsuranceLossReductionMillionsUsd: 14.1,
      monthlyReductionEqualsAnnualProvision: false,
    },
    auditBoundary: {
      auditedAmountsAreSourceDomainFinancialStatementFacts: true,
      auditIsGuarantee: false, auditEstablishesUnderlyingEveryEventTruth: false,
      reserveEqualsPaidClaimLoss: false, fundAssetsAreOutsiderCustody: false,
      creditUnionPopulationTransfersToOutsider: false,
    },
    sourceDocuments: [documentReceipt,
      { name: "ncua-december-2025-share-insurance-highlights.html", fullyParsed: true }],
  };
}

function parsePbgc(files) {
  const dataPdf = parsePdfFully(files["pbgc-2024-pension-data-tables.pdf"], pin("pbgc-2024-pension-data-tables.pdf"));
  const annualPdf = parsePdfFully(files["pbgc-annual-report-2025.pdf"], pin("pbgc-annual-report-2025.pdf"));
  const workbook = inspectPbgcWorkbookShape(files["pbgc-2024-pension-data-tables.xlsx"]);
  const expectedSheets = ["Cover Page", "DATA BOOK LISTING", "Overview", "GLANCE",
    ...Array.from({ length: 21 }, (_, index) => `S-${index + 1}`), "S-29", "S-43",
    "M-1", "M-2", "M-3", "M-4", "M-5", "M-14", "M-15", "M-20", "M-21"];
  if (canonicalizeStrict(workbook.sheets.map((item) => item.name)) !== canonicalizeStrict(expectedSheets)
    || workbook.sharedStringCount !== 594 || workbook.formulaCellCount !== 5) {
    throw new Error("NCUA_PBGC_MSHA_PBGC_WORKBOOK_PROFILE_INVALID");
  }
  const glance = new Map(sheet(workbook, "GLANCE").rows.map((item) => [item.rowNumber, item.cells]));
  const expectedGlance = [
    [4, ["Net Financial Position", "62213", "2648", "64861"]],
    [5, ["Total Assets", "152262", "4949", "157211"]],
    [6, ["Total Liabilities", "90049", "2301", "92350"]],
    [10, ["Number of Insured Plans", "22196", "1304", "23500"]],
    [11, ["Number of Insured Participants", "18.4 M", "11.1 M", "29.5 M"]],
    [14, ["Change in Claims 2", "593.23", "N/A ", "593.23"]],
    [17, ["Paid Directly", "911776", "--- 3", "911776"]],
    [18, ["Paid Indirectly Through Traditional Financial Assistance", "N/A ", "60244", "60244"]],
    [19, ["Paid Indirectly Through Special Financial Assistance", "N/A ", "444,902 4", "444902"]],
    [22, ["Paid Directly to Payees", "6426.16", "--- 3", "6426.16"]],
    [23, ["Traditional Financial Assistance Granted", "N/A ", "169", "169"]],
    [24, ["Special Financial Assistance Granted", "N/A ", "6151.99", "6151.99"]],
    [38, ["2 For purposes of this chart, claims are defined to include the excess of liabilities over assets without regard to recoveries from plan sponsors."]],
  ];
  for (const [number, expected] of expectedGlance) assertRow(glance.get(number) ?? [], expected,
    `NCUA_PBGC_MSHA_PBGC_GLANCE_INVALID:${number}`);
  const selectedRows = [
    ["S-1", 36, ["2025", "152262", "90049", "62213"]],
    ["S-2", 36, ["2025", "4130", "6426", "583"]],
    ["S-3", 34, ["2025", "2121", "11", "421.34", "863.97", "442.63", "24.75", "417.88"]],
    ["S-14", 37, ["2025", "6258.56", "908.22", "551.05999999999995", "295.87", "167.6", "39", "4250.04", "6426.16", "911.78", "379"]],
    ["S-20", 36, ["2025", "18366"]], ["S-21", 36, ["2025", "22196"]],
    ["M-1", 36, ["2025", "4949", "2301", "2648"]],
    ["M-2", 37, ["2025", "426", "6175", "169", "6152"]],
    ["M-3", 35, ["2025", "100", "169", "0", "0", "100", "169", "1", "14", "", "48", "6152"]],
    ["M-4", 37, ["2025", "11112"]], ["M-5", 36, ["2025", "1304"]],
  ];
  for (const [sheetName, number, expected] of selectedRows) {
    assertRow(row(workbook, sheetName, number, "2025"), expected,
      `NCUA_PBGC_MSHA_PBGC_SELECTED_ROW_INVALID:${sheetName}`);
    if (worksheetHasFormulaOnRow(sheet(workbook, sheetName), number)) {
      throw new Error(`NCUA_PBGC_MSHA_PBGC_SELECTED_ROW_FORMULA_CACHE_FORBIDDEN:${sheetName}`);
    }
  }
  const xlsxPdfKeyMetricBindings = bindPbgcXlsxPdfKeyMetrics(workbook, dataPdf._text);
  requireIncludes(dataPdf._text, ["2024 Data Tables - 1st Installment",
    "each data table may have different end years", "Form 5500 filings", "PBGC Premium filings",
    "PBGC operational data", "claims are defined to include the excess of liabilities over assets without regard to recoveries from plan sponsors"],
  "NCUA_PBGC_MSHA_PBGC_DATA_PDF_SEMANTICS_MISSING");
  requireIncludes(annualPdf._text, ["In our opinion, the accompanying financial statements present fairly, in all material respects",
    "Single-Employer and Multiemployer Program Funds of PBGC as of September 30, 2025",
    "Reasonable assurance is a high level of assurance but is not absolute assurance and therefore is not a guarantee",
    "provided $168.5 million in traditional financial assistance to multiemployer plans covering 60,244 participants",
    "made SFA payments of $6.2 billion", "All 60 plans have made the required repayments of SFA, which totaled $119.5 million"],
  "NCUA_PBGC_MSHA_PBGC_ANNUAL_PDF_SEMANTICS_MISSING");
  const indexText = htmlText(files["pbgc-pension-insurance-data.html"]);
  requireIncludes(indexText, ["2024 Pension Insurance Data Tables (1st Installment)",
    "each data table may have a different end year", "Form 5500 filings", "PBGC Premium filings",
    "PBGC operational data"], "NCUA_PBGC_MSHA_PBGC_INDEX_SEMANTICS_MISSING");
  const stripText = ({ _text, ...receipt }) => receipt;
  return {
    realityStatus: "REAL_INSTITUTIONAL_OPERATION_AND_PENSION_INSURANCE_EXPERIENCE",
    publisher: "UNITED_STATES_PENSION_BENEFIT_GUARANTY_CORPORATION",
    workbook: { edition: 2024, installment: "FIRST", sheetCount: workbook.sheets.length,
      sheetNames: workbook.sheets.map((item) => item.name), sharedStringCount: workbook.sharedStringCount,
      formulaCellCount: workbook.formulaCellCount, selectedMetricsUseFormulaCache: false,
      xlsxPdfKeyMetricsCrossRepresentationBound: xlsxPdfKeyMetricBindings.established,
      xlsxPdfKeyMetricBindingCount: xlsxPdfKeyMetricBindings.bindingCount,
      xlsxPdfKeyMetricBindingSetHash: xlsxPdfKeyMetricBindings.bindingSetHash,
      xlsxPdfKeyMetricNumericPolicy: xlsxPdfKeyMetricBindings.numericPolicy,
      xlsxPdfKeyMetricBindings: xlsxPdfKeyMetricBindings.bindings },
    availabilityFrame: {
      form5500PlanYear: 2023, premiumFilingPlanYear: 2024, operationalFiscalYear: 2025,
      fiscalYearEnd: "SEPTEMBER_30", tableEndYearsAreHeterogeneous: true,
      laterInstallmentsExpected: true, firstInstallmentIsCompleteEdition: false,
    },
    fiscal2025: {
      singleEmployer: { netPositionMillionsUsd: integerValue(glance.get(4)[1], "PBGC_SE_NET"),
        assetsMillionsUsd: integerValue(glance.get(5)[1], "PBGC_SE_ASSETS"),
        liabilitiesMillionsUsd: integerValue(glance.get(6)[1], "PBGC_SE_LIABILITIES"),
        insuredPlans: integerValue(glance.get(10)[1], "PBGC_SE_PLANS"),
        insuredParticipantsMillions: 18.4, changeInClaimsMillionsUsd: integerValue(glance.get(14)[1], "PBGC_SE_CLAIMS"),
        directPayees: integerValue(glance.get(17)[1], "PBGC_SE_PAYEES"),
        directBenefitPaymentsMillionsUsd: integerValue(glance.get(22)[1], "PBGC_SE_PAYMENTS") },
      multiemployer: { netPositionMillionsUsd: integerValue(glance.get(4)[2], "PBGC_ME_NET"),
        assetsMillionsUsd: integerValue(glance.get(5)[2], "PBGC_ME_ASSETS"),
        liabilitiesMillionsUsd: integerValue(glance.get(6)[2], "PBGC_ME_LIABILITIES"),
        insuredPlans: integerValue(glance.get(10)[2], "PBGC_ME_PLANS"), insuredParticipantsMillions: 11.1,
        traditionalAssistancePayees: integerValue(glance.get(18)[2], "PBGC_ME_TRAD_PAYEES"),
        sfaPlanParticipantsNotRetirees: 444_902,
        traditionalFinancialAssistanceMillionsUsd: integerValue(glance.get(23)[2], "PBGC_ME_TRAD_PAY"),
        specialFinancialAssistanceMillionsUsd: integerValue(glance.get(24)[2], "PBGC_ME_SFA_PAY") },
    },
    paymentAndRecoveryExperience: {
      directBenefitsTraditionalAssistanceAndSfaRemainSeparate: true,
      annualReportTraditionalAssistanceMillionsUsdMorePrecise: 168.5,
      sfaRetrospectiveDeathAuditRepaymentsMillionsUsd: 119.5,
      sfaRepaymentIsNotOrdinaryClaimRecovery: true,
    },
    auditBoundary: { auditor: "KPMG_LLP", opinion: "UNMODIFIED_PRESENTS_FAIRLY_IN_ALL_MATERIAL_RESPECTS",
      scope: "SINGLE_EMPLOYER_AND_MULTIEMPLOYER_PROGRAM_FUNDS_FINANCIAL_STATEMENTS_AND_INTERNAL_CONTROL_OVER_FINANCIAL_REPORTING",
      auditIsGuarantee: false, claimsDefinitionIsPaidClaimSeverity: false,
      financialAssistanceEqualsIndividualBenefitReceipt: false, pbgcAssetsAreOutsiderCustody: false,
      pensionPopulationTransfersToOutsider: false },
    sourceDocuments: [stripText(dataPdf), stripText(annualPdf),
      { name: "pbgc-2024-pension-data-tables.xlsx", fullyParsed: true },
      { name: "pbgc-pension-insurance-data.html", fullyParsed: true }],
  };
}

function runMshaStream(pinValue, target) {
  const run = spawnSync(process.execPath, [STREAM_PARSER, "--kind", pinValue.streamKind,
    "--archive", target, "--sha256", pinValue.sha256, "--bytes", String(pinValue.bytes)], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (run.error || run.status !== 0 || run.signal || !run.stdout) {
    throw new Error(`NCUA_PBGC_MSHA_STREAM_PARSER_FAILED:${pinValue.name}:${run.stderr?.trim() ?? ""}`);
  }
  let value;
  try { value = JSON.parse(run.stdout); } catch { throw new Error(`NCUA_PBGC_MSHA_STREAM_JSON_INVALID:${pinValue.name}`); }
  if (value.kind !== pinValue.streamKind || value.archiveBytes !== pinValue.bytes
    || value.archiveSha256 !== pinValue.sha256 || value.pinReverified !== true
    || value.fullEntryStreamParsed !== true || value.decompressedBytes !== value.zipEntry.uncompressedBytes) {
    throw new Error(`NCUA_PBGC_MSHA_STREAM_RECEIPT_INVALID:${pinValue.name}`);
  }
  return value;
}

function parseMsha(read) {
  const portal = htmlText(read.files["msha-open-government-data.html"]);
  const scope = htmlText(read.files["msha-source-scope.html"]);
  const accidentDefinitions = read.files["msha-accidents-definitions.txt"].toString("utf8");
  const mineDefinitions = read.files["msha-mines-prod-quarterly-definitions.txt"].toString("utf8");
  const contractorDefinitions = read.files["msha-contractor-prod-quarterly-definitions.txt"].toString("utf8");
  const handbook = parsePdfFully(read.files["msha-part50-yellow-jacket.pdf"], pin("msha-part50-yellow-jacket.pdf"));
  requireIncludes(portal, ["These files are updated every Friday afternoon", "all accidents, injuries and illnesses reported by mine operators and contractors beginning on 1/1/2000",
    "Document number is the unique key", "employment and coal production reported by contractors for each quarter",
    "employment and coal production reported by mine operators for each quarter"],
  "NCUA_PBGC_MSHA_MSHA_PORTAL_SEMANTICS_MISSING");
  requireIncludes(scope, ["Incidence rates", "number of injuries in a category times 200,000 divided by the number of employee-hours worked"],
    "NCUA_PBGC_MSHA_MSHA_SCOPE_SEMANTICS_MISSING");
  requireIncludes(accidentDefinitions, ["ACCIDENTS|DOCUMENT_NO", "Document number assigned to the accident/injury form",
    "ACCIDENTS|NARRATIVE", "Use mine_id and cal_yr to join"], "NCUA_PBGC_MSHA_MSHA_ACCIDENT_DICTIONARY_MISSING");
  requireIncludes(mineDefinitions, ["QRTLY EMPLOY/PROD|HOURS_WORKED", "Can be zero"],
    "NCUA_PBGC_MSHA_MSHA_MINE_DICTIONARY_MISSING");
  requireIncludes(contractorDefinitions, ["QRTLY CONTRACTOR EMPLOY/PROD|HOURS_WORKED", "May be zero"],
    "NCUA_PBGC_MSHA_MSHA_CONTRACTOR_DICTIONARY_MISSING");
  // The official scan's OCR corrupts several occurrences of "CFR" and "Form";
  // pinning plus full-document parsing makes the stable form identifiers the
  // safer semantic sentinels than an aspirational clean transcription.
  requireIncludes(handbook._text, ["Part 50", "Form 7000-1", "7000-2"],
    "NCUA_PBGC_MSHA_MSHA_HANDBOOK_SEMANTICS_MISSING");
  const accidents = runMshaStream(pin("msha-accidents.zip"), read.paths["msha-accidents.zip"]);
  const mine = runMshaStream(pin("msha-mines-prod-quarterly.zip"), read.paths["msha-mines-prod-quarterly.zip"]);
  const contractor = runMshaStream(pin("msha-contractor-prod-quarterly.zip"), read.paths["msha-contractor-prod-quarterly.zip"]);
  const expected = [
    [accidents, 274_448, 228_135_802, 0, 2026, 3],
    [mine, 2_761_063, 261_750_290, 0, 2026, 2],
    [contractor, 1_361_755, 126_293_295, 3, 2026, 2],
  ];
  for (const [receipt, rows, uncompressed, malformed, year, quarter] of expected) {
    if (receipt.diagnostics.rowCount !== rows || receipt.decompressedBytes !== uncompressed
      || receipt.diagnostics.malformedRowCount !== malformed
      || receipt.diagnostics.latestCalendarYear !== year || receipt.diagnostics.latestCalendarQuarter !== quarter) {
      throw new Error(`NCUA_PBGC_MSHA_MSHA_SEMANTIC_PROFILE_INVALID:${receipt.kind}`);
    }
  }
  if (accidents.diagnostics.uniqueDocumentNumberCount !== 274_448
    || accidents.diagnostics.duplicateOrMissingDocumentNumberRows !== 0
    || accidents.diagnostics.latestAccidentDate !== "2026-08-19"
    || mine.diagnostics.invalidHoursRows !== 4 || contractor.diagnostics.invalidHoursRows !== 11) {
    throw new Error("NCUA_PBGC_MSHA_MSHA_QUALITY_PROFILE_INVALID");
  }
  const compactEmployment = (receipt) => ({
    rowCount: receipt.diagnostics.rowCount,
    distinctReportingIdentifierCount: receipt.diagnostics.distinctReportingIdentifierCount,
    earliestCalendarYear: receipt.diagnostics.earliestCalendarYear,
    latestCalendarYear: receipt.diagnostics.latestCalendarYear,
    latestCalendarQuarter: receipt.diagnostics.latestCalendarQuarter,
    rowsByCalendarYear: receipt.diagnostics.rowsByCalendarYear,
    hoursWorkedByCalendarYear: receipt.diagnostics.hoursWorkedByCalendarYear,
    zeroHoursRows: receipt.diagnostics.zeroHoursRows,
    positiveHoursRows: receipt.diagnostics.positiveHoursRows,
    invalidHoursRows: receipt.diagnostics.invalidHoursRows,
    malformedRowCount: receipt.diagnostics.malformedRowCount,
  });
  const { _text, ...handbookReceipt } = handbook;
  return {
    realityStatus: "REAL_OPERATOR_AND_CONTRACTOR_REPORTED_CASES_AND_EXPOSURE",
    publisher: "UNITED_STATES_MINE_SAFETY_AND_HEALTH_ADMINISTRATION",
    sourceRefresh: { statedCadence: "EVERY_FRIDAY_AFTERNOON_UNLESS_NOTED",
      frozenSnapshotDate: "2026-08-21", historicalRecordsCanBeRevised: true,
      latestAccidentDate: "2026-08-19", accidentCurrentQuarterRightCensored: true,
      employmentCurrentQuarterAbsent: true },
    accidents: {
      rowCount: accidents.diagnostics.rowCount,
      uniqueDocumentNumberCount: accidents.diagnostics.uniqueDocumentNumberCount,
      duplicateOrMissingDocumentNumberRows: accidents.diagnostics.duplicateOrMissingDocumentNumberRows,
      earliestCalendarYear: accidents.diagnostics.earliestCalendarYear,
      latestCalendarYear: accidents.diagnostics.latestCalendarYear,
      latestCalendarQuarter: accidents.diagnostics.latestCalendarQuarter,
      rowsByCalendarYear: accidents.diagnostics.rowsByCalendarYear,
      rowsByDegreeInjuryCode: accidents.diagnostics.rowsByDegreeInjuryCode,
      mineLinkedRows: accidents.diagnostics.mineLinkedRows,
      contractorLinkedRows: accidents.diagnostics.contractorLinkedRows,
      zeroReportedInjuriesRows: accidents.diagnostics.zeroReportedInjuriesRows,
      positiveReportedInjuriesRows: accidents.diagnostics.positiveReportedInjuriesRows,
      narrativePresentRows: accidents.diagnostics.narrativePresentRows,
      closedDocumentPresentRows: accidents.diagnostics.closedDocumentPresentRows,
    },
    mineQuarterlyExposure: compactEmployment(mine),
    contractorQuarterlyExposure: compactEmployment(contractor),
    sourceAccounting: {
      allThreeArchivesPinReverified: true, allThreeSingleEntriesFullyStreamParsed: true,
      compressedArchiveBytes: accidents.archiveBytes + mine.archiveBytes + contractor.archiveBytes,
      decompressedDataBytes: accidents.decompressedBytes + mine.decompressedBytes + contractor.decompressedBytes,
      physicalDataRows: accidents.diagnostics.rowCount + mine.diagnostics.rowCount + contractor.diagnostics.rowCount,
      archiveReceipts: [accidents, mine, contractor].map((receipt) => ({ kind: receipt.kind,
        archiveBytes: receipt.archiveBytes, archiveSha256: receipt.archiveSha256,
        zipEntryName: receipt.zipEntry.name, compressedBytes: receipt.zipEntry.compressedBytes,
        decompressedBytes: receipt.decompressedBytes, fullEntryStreamParsed: receipt.fullEntryStreamParsed })),
    },
    correlationBoundary: {
      accidentAndMineEmploymentShareMineIdAndCalendarYearRoots: true,
      accidentAndContractorEmploymentShareContractorIdAndCalendarYearRoots: true,
      rowLevelOneToOneLinkEstablished: false,
      currentAccidentAndExposureWindowsAligned: false,
      publishedIncidenceFormulaObserved: "INJURY_CATEGORY_COUNT_TIMES_200000_DIVIDED_BY_EMPLOYEE_HOURS",
      derivedIncidenceRateEmitted: null,
      reason: "CURRENT_Q3_ACCIDENTS_OUTRUN_Q2_EXPOSURE; REPORTABILITY_CLASS_AND_OPERATOR_CONTRACTOR_FRAMES_REQUIRE_EXPLICIT_COHORT_RULES",
    },
    publisherBoundary: {
      reportingIsMandatoryUnderPart50: true, recordsAreOperatorOrContractorReported: true,
      sourceIsIndependentSensor: false, sourceIsCausalAdjudication: false,
      documentNumberUniquenessDoesNotProveUnderlyingEventCompleteness: true,
      zeroHoursAreRealPublishedValuesNotAutomaticZeroExposureProof: true,
    },
    privacyBoundary: {
      rawAccidentDataContainsNarrativeOccupationExperienceInjuryAndReturnToWorkFields: true,
      artifactPublishesRowLevelNarratives: false, artifactPublishesPersonLinkedRows: false,
      aggregateOnly: true,
    },
    sourceDocuments: [handbookReceipt,
      { name: "msha-open-government-data.html", fullyParsed: true },
      { name: "msha-source-scope.html", fullyParsed: true },
      { name: "msha-accidents-definitions.txt", fullyParsed: true },
      { name: "msha-mines-prod-quarterly-definitions.txt", fullyParsed: true },
      { name: "msha-contractor-prod-quarterly-definitions.txt", fullyParsed: true }],
  };
}

function sourceProjection() {
  return NCUA_PBGC_MSHA_SOURCE_PINS_20260821.map(({ pages: _pages, streamKind: _streamKind, ...value }) => value);
}
function seal(artifact) {
  const withoutHash = clone(artifact);
  delete withoutHash.artifactHash;
  return { ...withoutHash,
    artifactHash: domainHash("outsider/ncua-pbgc-msha-real-experience/artifact/v1", withoutHash) };
}
function buildArtifact({ generatedAt, official, callerBytesMatchedFrozenPins = false,
  manifestHash = null, ncua = null, pbgc = null, msha = null }) {
  const sourceBytes = NCUA_PBGC_MSHA_SOURCE_PINS_20260821.reduce((sum, value) => sum + value.bytes, 0);
  return seal({
    schema: NCUA_PBGC_MSHA_REAL_EXPERIENCE_SCHEMA,
    version: "1.0.0", generatedAt,
    source: {
      sourceId: "NCUA_PBGC_MSHA_20260821", frozenAt: NCUA_PBGC_MSHA_REAL_EXPERIENCE_FROZEN_AT,
      profileMatchedAtBuild: official,
      sourceReality: official
        ? "REAL_OFFICIAL_INSTITUTIONAL_AND_REPORTED_EXPERIENCE"
        : "UNATTESTED_CALLER_BYTES",
      publishers: official ? ["UNITED_STATES_NATIONAL_CREDIT_UNION_ADMINISTRATION",
        "UNITED_STATES_PENSION_BENEFIT_GUARANTY_CORPORATION",
        "UNITED_STATES_MINE_SAFETY_AND_HEALTH_ADMINISTRATION"] : [],
      sourceCount: NCUA_PBGC_MSHA_SOURCE_PINS_20260821.length,
      sourceBytes: official ? sourceBytes : null,
      sourceSetHash: official ? domainHash("outsider/ncua-pbgc-msha/source-set/v1", sourceProjection()) : null,
      acquisitionManifestHash: official ? manifestHash : null,
      callerBytesMatchedFrozenPins,
      objects: sourceProjection(),
    },
    qualityModel: {
      collectorIdentityChangesEvidenceGrade: false,
      publicOriginAutomaticallyDowngradesReality: false,
      selfMeasurementAutomaticallyUpgradesReality: false,
      dimensionsKeptSeparate: ["SOURCE_REALITY", "PUBLISHER_ROLE", "AUDIT_SCOPE",
        "COVERAGE_FRAME", "DENOMINATOR", "REVISION", "CORRELATION", "PRIVACY",
        "RIGHTS", "TARGET_TRANSFER", "OPERATIONAL_AUTHORITY"],
      admissionRule: "EXACT_PIN_PLUS_FULL_SOURCE_REPLAY_PLUS_SOURCE_SPECIFIC_SEMANTIC_GATES",
    },
    lanes: { ncua, pbgc, msha },
    crossLaneBoundary: {
      pooledGlobalRiskRateEmitted: false, pooledLossSeverityEmitted: false,
      pooledCapitalAdequacyScoreEmitted: false,
      ncuaDepositInsurancePbgcPensionInsuranceAndMshaMineReportingAreDistinctPopulationFrames: true,
      sourceDomainFactsMayInformFactorDesign: official,
      targetDomainTransferValidated: false,
    },
    rights: {
      officialPublicAccessObserved: official,
      exactReuseLicenseConcluded: false, affectedPersonConsentEstablished: false,
      privacyReviewCompleteForModelTraining: false, modelTrainingRightConcluded: false,
      rawRowLevelMshaNarrativesAdmittedForTraining: false,
    },
    authority: {
      PRICE: false, GUARANTEE: false, SETTLE: false, TRAIN: false,
      ADJUDICATE: false, PAY: false, CUSTODY: false, CLOSE: false, REOPEN: false,
    },
    admission: {
      realNcuaInstitutionalExperienceRecognized: official,
      realPbgcInstitutionalExperienceRecognized: official,
      realMshaReportedCasesAndExposureRecognized: official,
      sourceDomainDescriptiveUseOnly: official,
      entersTargetPricingModel: false, entersTargetGuaranteeModel: false,
      entersTrainingCorpus: false, closesOutsiderReadinessGap: false,
    },
    machineDeferrals: {
      ncua: ["AUDIT_DOES_NOT_GUARANTEE_ALL_UNDERLYING_EVENTS", "RESERVE_IS_NOT_PAID_CLAIM_LOSS",
        "CREDIT_UNION_POPULATION_TRANSFER_NOT_ESTABLISHED", "OUTSIDER_CAPITAL_OR_CUSTODY_NOT_ESTABLISHED"],
      pbgc: ["FIRST_INSTALLMENT_AND_TABLE_END_YEAR_HETEROGENEITY", "CLAIMS_ARE_EXCESS_LIABILITIES_OVER_ASSETS_NOT_PAID_CLAIM_SEVERITY",
        "DIRECT_BENEFITS_TRADITIONAL_ASSISTANCE_AND_SFA_NOT_POOLABLE", "OUTSIDER_TRANSFER_NOT_ESTABLISHED"],
      msha: ["OPERATOR_CONTRACTOR_SELF_REPORT_NOT_INDEPENDENT_SENSOR", "2026_ACCIDENT_Q3_RIGHT_CENSOR_AND_EMPLOYMENT_ONLY_THROUGH_Q2",
        "REPORTABILITY_AND_COHORT_RULES_NOT_FROZEN_FOR_DERIVED_INCIDENCE", "ROW_LEVEL_SENSITIVE_FIELDS_EXCLUDED",
        "CAUSAL_ADJUDICATION_NOT_ESTABLISHED"],
      operations: ["NO_OUTSIDER_PRICE", "NO_OUTSIDER_GUARANTEE", "NO_OUTSIDER_SETTLEMENT",
        "NO_OUTSIDER_TRAINING_RIGHT", "NO_OUTSIDER_AUTHORITY"],
    },
    progress: {
      sourceObjectsExactPinned: official,
      sourceArtifactsFullyReplayed: official,
      realInstitutionalCapitalReserveAndPaymentFactorsAvailable: official,
      realAccidentAndExposureFactorsAvailable: official,
      sourceDomainQualityAnomaliesPreserved: official,
      globalModelWeightsUpdated: false, targetLossPriceProduced: false,
      operationalReadinessCredit: 0,
    },
  });
}

function normalizeBuildOptions(options) {
  if (options === undefined) return { generatedAt: NCUA_PBGC_MSHA_REAL_EXPERIENCE_FROZEN_AT };
  if (!exactKeys(options, ["generatedAt"])) throw new Error("NCUA_PBGC_MSHA_BUILD_OPTIONS_INVALID");
  return { generatedAt: canonicalTime(options.generatedAt, "NCUA_PBGC_MSHA_GENERATED_AT") };
}

export function buildNcuaPbgcMshaRealExperienceFromBytes(sourceBytes, options) {
  const { generatedAt } = normalizeBuildOptions(options);
  if (!sourceBytes || typeof sourceBytes !== "object" || Array.isArray(sourceBytes)) {
    throw new Error("NCUA_PBGC_MSHA_BUILD_BYTES_INVALID");
  }
  const names = Object.keys(sourceBytes).sort();
  if (canonicalizeStrict(names) !== canonicalizeStrict(EXPECTED_NAMES)
    || names.some((name) => !Buffer.isBuffer(sourceBytes[name]) || sourceBytes[name].length <= 0)) {
    throw new Error("NCUA_PBGC_MSHA_BUILD_BYTES_PROFILE_INVALID");
  }
  const matched = NCUA_PBGC_MSHA_SOURCE_PINS_20260821.every((value) =>
    sourceBytes[value.name].length === value.bytes && sha256(sourceBytes[value.name]) === value.sha256);
  return buildArtifact({ generatedAt, official: false, callerBytesMatchedFrozenPins: matched });
}

export function buildNcuaPbgcMshaRealExperienceFromSourceDirectory(sourceDirectory, options) {
  const { generatedAt } = normalizeBuildOptions(options);
  const read = stableReadSourceDirectory(sourceDirectory);
  const ncua = parseNcua(read.files);
  const pbgc = parsePbgc(read.files);
  const msha = parseMsha(read);
  return buildArtifact({ generatedAt, official: true, callerBytesMatchedFrozenPins: true,
    manifestHash: read.manifestHash, ncua, pbgc, msha });
}

function validateArtifactShape(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)
    || artifact.schema !== NCUA_PBGC_MSHA_REAL_EXPERIENCE_SCHEMA
    || artifact.version !== "1.0.0" || !HASH.test(artifact.artifactHash ?? "")) {
    throw new Error("NCUA_PBGC_MSHA_ARTIFACT_SHAPE_INVALID");
  }
  canonicalTime(artifact.generatedAt, "NCUA_PBGC_MSHA_ARTIFACT_GENERATED_AT");
  const expectedAuthority = ["PRICE", "GUARANTEE", "SETTLE", "TRAIN", "ADJUDICATE", "PAY", "CUSTODY", "CLOSE", "REOPEN"];
  if (!exactKeys(artifact.authority, expectedAuthority)
    || expectedAuthority.some((name) => artifact.authority[name] !== false)) {
    throw new Error("NCUA_PBGC_MSHA_ARTIFACT_AUTHORITY_ESCALATION");
  }
  if (artifact.rights.exactReuseLicenseConcluded !== false
    || artifact.rights.affectedPersonConsentEstablished !== false
    || artifact.rights.privacyReviewCompleteForModelTraining !== false
    || artifact.rights.modelTrainingRightConcluded !== false
    || artifact.rights.rawRowLevelMshaNarrativesAdmittedForTraining !== false
    || artifact.admission.entersTrainingCorpus !== false
    || artifact.admission.entersTargetPricingModel !== false
    || artifact.admission.entersTargetGuaranteeModel !== false
    || artifact.admission.closesOutsiderReadinessGap !== false
    || artifact.crossLaneBoundary.pooledGlobalRiskRateEmitted !== false
    || artifact.crossLaneBoundary.pooledLossSeverityEmitted !== false
    || artifact.crossLaneBoundary.pooledCapitalAdequacyScoreEmitted !== false
    || artifact.crossLaneBoundary.targetDomainTransferValidated !== false
    || artifact.progress.globalModelWeightsUpdated !== false
    || artifact.progress.targetLossPriceProduced !== false
    || artifact.progress.operationalReadinessCredit !== 0) {
    throw new Error("NCUA_PBGC_MSHA_ARTIFACT_BOUNDARY_ESCALATION");
  }
  if (artifact.lanes?.msha !== null && artifact.lanes?.msha !== undefined
    && (artifact.lanes.msha.correlationBoundary?.derivedIncidenceRateEmitted !== null
      || artifact.lanes.msha.correlationBoundary?.rowLevelOneToOneLinkEstablished !== false
      || artifact.lanes.msha.privacyBoundary?.artifactPublishesRowLevelNarratives !== false
      || artifact.lanes.msha.privacyBoundary?.artifactPublishesPersonLinkedRows !== false
      || artifact.lanes.msha.privacyBoundary?.aggregateOnly !== true)) {
    throw new Error("NCUA_PBGC_MSHA_ARTIFACT_MSHA_BOUNDARY_ESCALATION");
  }
  const { artifactHash, ...withoutHash } = artifact;
  const expectedHash = domainHash("outsider/ncua-pbgc-msha-real-experience/artifact/v1", withoutHash);
  if (artifactHash !== expectedHash) throw new Error("NCUA_PBGC_MSHA_ARTIFACT_HASH_MISMATCH");
  return artifact;
}

export function verifyNcuaPbgcMshaRealExperience(artifact) {
  try {
    const valid = validateArtifactShape(artifact);
    return { ok: true, schema: valid.schema, artifactHash: valid.artifactHash,
      verificationLevel: "STRUCTURE_ONLY", sourceArtifactsReverified: false,
      frozenPublisherRecordRealityEstablished: false,
      sourceTruthEstablished: false, underlyingEventTruthEstablished: false,
      publisherAuthorityEstablished: false,
      operationalAuthorityEstablished: false, officialSourceProfileReproduced: false,
      candidateArtifactExactlyRebuilt: false, realCaseOrExperienceAdmissionEstablished: false,
      decision: null };
  } catch (error) {
    return { ok: false, schema: NCUA_PBGC_MSHA_REAL_EXPERIENCE_SCHEMA,
      artifactHash: artifact?.artifactHash ?? null, verificationLevel: "STRUCTURE_ONLY_FAILED",
      sourceArtifactsReverified: false, frozenPublisherRecordRealityEstablished: false,
      sourceTruthEstablished: false, underlyingEventTruthEstablished: false,
      publisherAuthorityEstablished: false, operationalAuthorityEstablished: false,
      officialSourceProfileReproduced: false, candidateArtifactExactlyRebuilt: false,
      realCaseOrExperienceAdmissionEstablished: false,
      error: error instanceof Error ? error.message : String(error), decision: null };
  }
}

export function verifyNcuaPbgcMshaRealExperienceWithSource(artifact, sourceDirectory) {
  const standalone = verifyNcuaPbgcMshaRealExperience(artifact);
  if (!standalone.ok) return { ...standalone, verificationLevel: "FULL_SOURCE_REPLAY_FAILED" };
  let rebuilt;
  try {
    rebuilt = buildNcuaPbgcMshaRealExperienceFromSourceDirectory(sourceDirectory,
      { generatedAt: artifact.generatedAt });
    const exact = canonicalizeStrict(rebuilt) === canonicalizeStrict(artifact);
    if (!exact) {
      return { ok: false, schema: artifact.schema, artifactHash: artifact.artifactHash,
        verificationLevel: "FULL_SOURCE_REPLAY_CANDIDATE_MISMATCH",
        sourceArtifactsReverified: true, frozenPublisherRecordRealityEstablished: true,
        sourceTruthEstablished: false, underlyingEventTruthEstablished: false,
        publisherAuthorityEstablished: false, operationalAuthorityEstablished: false,
        officialSourceProfileReproduced: true, candidateArtifactExactlyRebuilt: false,
        realCaseOrExperienceAdmissionEstablished: false,
        sourceSetHash: rebuilt.source.sourceSetHash,
        error: "NCUA_PBGC_MSHA_CANDIDATE_ARTIFACT_NOT_EXACT_REBUILD", decision: null };
    }
    return { ok: true, schema: artifact.schema, artifactHash: artifact.artifactHash,
      verificationLevel: "FULL_PINNED_NCUA_PBGC_MSHA_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE",
      sourceArtifactsReverified: true, frozenPublisherRecordRealityEstablished: true,
      sourceTruthEstablished: false, underlyingEventTruthEstablished: false,
      publisherAuthorityEstablished: false, operationalAuthorityEstablished: false,
      officialSourceProfileReproduced: true, candidateArtifactExactlyRebuilt: true,
      realCaseOrExperienceAdmissionEstablished: true,
      sourceSetHash: artifact.source.sourceSetHash,
      decision: { sourceDomainEvidenceAdmitted: true, targetUseAuthorized: false,
        modelTrainingAuthorized: false, operationalReadinessCredit: 0 } };
  } catch (error) {
    return { ok: false, schema: artifact.schema, artifactHash: artifact.artifactHash,
      verificationLevel: "FULL_SOURCE_REPLAY_FAILED", sourceArtifactsReverified: false,
      frozenPublisherRecordRealityEstablished: false,
      sourceTruthEstablished: false, underlyingEventTruthEstablished: false,
      publisherAuthorityEstablished: false,
      operationalAuthorityEstablished: false, officialSourceProfileReproduced: false,
      candidateArtifactExactlyRebuilt: false, realCaseOrExperienceAdmissionEstablished: false,
      error: error instanceof Error ? error.message : String(error), decision: null };
  }
}
