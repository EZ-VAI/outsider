/*
 * Real California rate-filing and NCIGF guaranty-fund evidence.
 *
 * Every admitted diagnostic is rebuilt from exact frozen publisher bytes.
 * Publisher identity is provenance, never a quality score.  A filing is not
 * an approval or a charged price; assessment capacity is not held capital;
 * and source-domain institutions cannot grant Outsider authority.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";

import { canonicalizeStrict } from "./canonical.js";

export const CDI_NCIGF_RATE_GUARANTY_SCHEMA
  = "outsider/cdi-ncigf-real-rate-guaranty-evidence/v1";
export const CDI_NCIGF_RATE_GUARANTY_FROZEN_AT
  = "2026-08-21T14:30:00.000Z";

const MAX_SOURCE_BYTES = 4_000_000;
const MAX_ZIP_ENTRY_BYTES = 12_000_000;
const MAX_ZIP_TOTAL_BYTES = 40_000_000;
const HASH = /^sha256:[a-f0-9]{64}$/u;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS = deepFreeze([
  {
    path: "cdi-filing-11-5668.pdf", kind: "CDI_COMPLETE_PUBLIC_SERFF_PDF",
    url: "https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/upload/11-5668-dentist-insurance-company.pdf",
    sizeBytes: 2_096_708,
    sha256: "sha256:2912018e82ae222e2f48a0068a67e59bc6c1e895202b6942ca0bf58da7a30ffa",
    independentRedownloadByteStable: null,
  },
  {
    path: "cdi-approvals-2025.xlsx", kind: "CDI_2025_APPROVAL_AND_CLOSED_LIST_XLSX",
    url: "https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0100-rate-filing-lists/rate-filing-approvals/upload/Approval-Closed-List-YTD-12-31-25.xlsx",
    sizeBytes: 352_015,
    sha256: "sha256:0e7f7c9be04219f9df1d8eee48989a4e7775e682aff6e544c4bcc583f78b2358",
    independentRedownloadByteStable: true,
  },
  {
    path: "cdi-public-notice-2024-12-27.xlsx", kind: "CDI_PUBLIC_NOTICE_XLSX",
    url: "https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0100-rate-filing-lists/public-notices/upload/PN122724.xlsx",
    sizeBytes: 241_749,
    sha256: "sha256:f0ee7909d7b3aaed9ce935ef56b3387f432aa7bd65f8cbc657432ce5b3298b2c",
    independentRedownloadByteStable: true,
  },
  {
    path: "cdi-health-anthem-2025-individual.xlsx",
    kind: "CDI_2025_INDIVIDUAL_MARKET_AGGREGATE_XLSX",
    url: "https://www.insurance.ca.gov/01-consumers/110-health/70-rates/upload/Anthem-2025-Individual-Aggregate-Rate-Information.xlsx",
    sizeBytes: 103_949,
    sha256: "sha256:e025b18541c014c41040e4f2391412462b767a53029a9647e0ef460e709ae6db",
    independentRedownloadByteStable: true,
  },
  {
    path: "cdi-health-rate-template.xls", kind: "CDI_HEALTH_RATE_SCHEMA_XLS",
    url: "https://www.insurance.ca.gov/0250-insurers/0500-legal-info/0200-regulations/HealthGuidance/upload/CARateFileSheet.XLS",
    sizeBytes: 14_848,
    sha256: "sha256:1a576246015623b4d928e3e91f31ae50875597bdb56051ab51a5e2961f601c6a",
    independentRedownloadByteStable: true,
  },
  {
    path: "cdi-health-rate-guidance.html", kind: "CDI_HEALTH_RATE_GUIDANCE_HTML",
    url: "https://www.insurance.ca.gov/0250-insurers/0500-legal-info/0200-regulations/HealthGuidance/RateFileFm2.cfm",
    sizeBytes: 53_919,
    sha256: "sha256:0cd70b7513bbeb95b7cff2374495b6cc89f91492641e0f2d2c1f96a40199c3ca",
    independentRedownloadByteStable: false,
  },
  {
    path: "cdi-virtual-viewing-room.html", kind: "CDI_SERFF_ACCESS_BOUNDARY_HTML",
    url: "https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0050-viewing-room/",
    sizeBytes: 47_192,
    sha256: "sha256:d8ef22fb52743fe39387bd28dc03ef666fa2db3bebbf62f57e67e35964b713db",
    independentRedownloadByteStable: false,
  },
  {
    path: "ncigf-assessment-liability-2026q2.xls",
    kind: "NCIGF_2026Q2_ASSESSMENT_LIABILITY_XLS",
    url: "https://www.ncigf.org/assets/assessments/Assessment_Liability_Report-2nd%20Quarter_2026.xls",
    sizeBytes: 312_832,
    sha256: "sha256:dc99aa90252dec8b80ce49791b6ea4160b8c373fcd91f1b45c2cb2e645b4959a",
    independentRedownloadByteStable: true,
  },
  {
    path: "ncigf-five-year-assessments-2025.xls",
    kind: "NCIGF_2021_2025_ASSESSMENT_HISTORY_XLS",
    url: "https://www.ncigf.org/assets/assessments/2025_5_year_History_of_Assessments_5_27_26.xls",
    sizeBytes: 97_280,
    sha256: "sha256:a05bac4b3121f91e7e4bb9fb052c32ead0872eb75a13a5801bb32f8f53277fb4",
    independentRedownloadByteStable: true,
  },
  {
    path: "ncigf-assessments-by-fund-2025.xls",
    kind: "NCIGF_INCEPTION_TO_2025_BY_FUND_XLS",
    url: "https://www.ncigf.org/assets/assessments/Assessment_by_GF-2025.xls",
    sizeBytes: 540_672,
    sha256: "sha256:7a10aa20fe6a7cbdc75c75098dcd987f497fd7f1be0b16798a07761e01b4292f",
    independentRedownloadByteStable: true,
  },
  {
    path: "ncigf-assessments-by-year-2025.xls",
    kind: "NCIGF_INCEPTION_TO_2025_BY_YEAR_XLS",
    url: "https://www.ncigf.org/assets/assessments/Assessment_by_Year-2025.xls",
    sizeBytes: 539_648,
    sha256: "sha256:8ab30e75b8db1335045bbeaf83da34fb7c9647465a7a5a9d1130b65a9a5e9d80",
    independentRedownloadByteStable: true,
  },
  {
    path: "ncigf-assessment-page.html", kind: "NCIGF_ASSESSMENT_PAGE_AND_DISCLAIMER_HTML",
    url: "https://www.ncigf.org/assessment-liability-information",
    sizeBytes: 34_127,
    sha256: "sha256:48e3a6a282a2faa50d4c38d2191e2d49e8f0c05fd600cb91bbc0f6d4c1b5f3ba",
    independentRedownloadByteStable: false,
  },
  {
    path: "ncigf-reporting-guidelines.pdf", kind: "NCIGF_AD_HOC_REPORTING_GUIDELINES_PDF",
    url: "https://www.ncigf.org/assets/docs/Guidelines-Ad-Hoc-Reporting_and_New_Reports-11-3-15-final_11.pdf",
    sizeBytes: 45_516,
    sha256: "sha256:a6a71f6327b8fac8a1a033b8b7281de082e181385f6ebf352a70abeec1ebc668",
    independentRedownloadByteStable: true,
  },
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `CDI_NCIGF_${code}` : `CDI_NCIGF_${code}:${detail}`);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256Bytes(`${domain}\0${canonicalizeStrict(value)}`);
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function stableRead(directory, pin) {
  const root = path.resolve(directory);
  if (root === path.parse(root).root) fail("SOURCE_DIRECTORY_TOO_BROAD");
  const target = path.resolve(root, pin.path);
  if (path.dirname(target) !== root) fail("SOURCE_PATH_ESCAPE", pin.path);
  const before = lstatSync(target);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== pin.sizeBytes
    || before.size > MAX_SOURCE_BYTES) fail("SOURCE_FILE_PROFILE_INVALID", pin.path);
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size) fail("SOURCE_FILE_RACE", pin.path);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || bytes.length !== pin.sizeBytes || sha256Bytes(bytes) !== pin.sha256) {
      fail("SOURCE_FILE_CHANGED_OR_MISMATCHED", pin.path);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readPinnedSource(directory) {
  const files = new Map();
  for (const pin of CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS) {
    files.set(pin.path, stableRead(directory, pin));
  }
  return files;
}

function xmlDecode(value) {
  return String(value).replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|amp|lt|gt|quot|apos);/giu,
    (whole, hex, decimal) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      return ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"",
        "&apos;": "'" })[whole.toLowerCase()] ?? whole;
    });
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
  fail("XLSX_END_NOT_FOUND");
}

function unzipEntries(bytes, sourceName) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > MAX_SOURCE_BYTES) {
    fail("XLSX_BYTES_INVALID", sourceName);
  }
  const end = findZipEnd(bytes);
  const disk = bytes.readUInt16LE(end + 4);
  const centralDisk = bytes.readUInt16LE(end + 6);
  const diskEntries = bytes.readUInt16LE(end + 8);
  const entryCount = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  const commentLength = bytes.readUInt16LE(end + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount
    || entryCount <= 0 || entryCount > 1_000
    || end + 22 + commentLength !== bytes.length
    || centralOffset + centralSize > end) fail("XLSX_CENTRAL_PROFILE_INVALID", sourceName);
  const entries = new Map();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      fail("XLSX_CENTRAL_ENTRY_INVALID", sourceName);
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const itemCommentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + itemCommentLength;
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || next > end
      || compressedSize > MAX_SOURCE_BYTES || uncompressedSize > MAX_ZIP_ENTRY_BYTES
      || localOffset + 30 > centralOffset
      || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      fail("XLSX_ENTRY_UNSUPPORTED", sourceName);
    }
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!name || name.startsWith("/") || name.includes("\\")
      || name.split("/").includes("..") || /[\u0000-\u001f\u007f]/u.test(name)
      || entries.has(name)) fail("XLSX_ENTRY_NAME_INVALID", sourceName);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localName = bytes.subarray(localOffset + 30,
      localOffset + 30 + localNameLength).toString("utf8");
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (localName !== name || dataOffset + compressedSize > centralOffset) {
      fail("XLSX_LOCAL_BINDING_INVALID", sourceName);
    }
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let output;
    try {
      output = method === 0 ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: Math.max(1, uncompressedSize) });
    } catch { fail("XLSX_INFLATE_INVALID", `${sourceName}:${name}`); }
    if (output.length !== uncompressedSize || crc32(output) !== expectedCrc) {
      fail("XLSX_ENTRY_INTEGRITY_INVALID", `${sourceName}:${name}`);
    }
    totalUncompressed += output.length;
    if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) fail("XLSX_TOTAL_TOO_LARGE", sourceName);
    entries.set(name, output);
    cursor = next;
  }
  if (cursor !== centralOffset + centralSize) fail("XLSX_CENTRAL_LENGTH_INVALID", sourceName);
  return entries;
}

function zipText(entries, name, sourceName, optional = false) {
  const bytes = entries.get(name);
  if (!bytes) {
    if (optional) return "";
    fail("XLSX_REQUIRED_ENTRY_MISSING", `${sourceName}:${name}`);
  }
  const text = bytes.toString("utf8");
  if (text.includes("\ufffd")) fail("XLSX_XML_UTF8_INVALID", `${sourceName}:${name}`);
  return text;
}

function xmlAttribute(source, name) {
  const match = String(source).match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u"));
  return match ? xmlDecode(match[1]) : null;
}

function parseSharedStrings(xml, sourceName) {
  if (xml === "") return [];
  const values = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)) {
    values.push([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
      .map((part) => xmlDecode(part[1])).join(""));
  }
  if (values.length === 0) fail("XLSX_SHARED_STRINGS_INVALID", sourceName);
  return values;
}

function cellCoordinates(reference) {
  const match = String(reference).match(/^([A-Z]{1,3})([1-9]\d*)$/u);
  if (!match) fail("XLSX_CELL_REFERENCE_INVALID", reference);
  let column = 0;
  for (const character of match[1]) column = column * 26 + character.charCodeAt(0) - 64;
  return { row: Number(match[2]), column };
}

function parseXlsxWorksheet(xml, sharedStrings, sourceName, sheetName) {
  const dimension = xml.match(/<dimension\b[^>]*\bref="([A-Z0-9:]+)"/u)?.[1] ?? null;
  if (!dimension) fail("XLSX_DIMENSION_MISSING", `${sourceName}:${sheetName}`);
  const cells = new Map();
  let formulaCells = 0;
  for (const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
    const reference = xmlAttribute(match[1], "r");
    const coordinate = cellCoordinates(reference);
    const type = xmlAttribute(match[1], "t");
    const body = match[2] ?? "";
    const formula = body.match(/<f\b[^>]*>([\s\S]*?)<\/f>/u)?.[1] ?? null;
    const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1] ?? null;
    let value = raw === null ? null : xmlDecode(raw);
    if (type === "s" && value !== null) {
      const index = Number(value);
      if (!Number.isSafeInteger(index) || index < 0 || index >= sharedStrings.length) {
        fail("XLSX_SHARED_STRING_INDEX_INVALID", `${sourceName}:${reference}`);
      }
      value = sharedStrings[index];
    } else if (type === "inlineStr") {
      value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
        .map((part) => xmlDecode(part[1])).join("");
    } else if (type === "b" && value !== null) {
      value = value === "1";
    } else if ((type === null || type === "n") && value !== null) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) fail("XLSX_NUMERIC_INVALID", `${sourceName}:${reference}`);
      value = numeric;
    }
    if (formula !== null) formulaCells += 1;
    const key = `${coordinate.row}:${coordinate.column}`;
    if (cells.has(key)) fail("XLSX_DUPLICATE_CELL", `${sourceName}:${reference}`);
    cells.set(key, { value, formula: formula === null ? null : xmlDecode(formula) });
  }
  return { name: sheetName, dimension, cells, formulaCells };
}

function parseXlsx(bytes, sourceName) {
  const entries = unzipEntries(bytes, sourceName);
  const workbook = zipText(entries, "xl/workbook.xml", sourceName);
  const relationships = zipText(entries, "xl/_rels/workbook.xml.rels", sourceName);
  const strings = parseSharedStrings(zipText(entries, "xl/sharedStrings.xml", sourceName, true),
    sourceName);
  const targets = new Map();
  for (const match of relationships.matchAll(/<Relationship\b([^>]*?)\/>/gu)) {
    const id = xmlAttribute(match[1], "Id");
    const target = xmlAttribute(match[1], "Target");
    const mode = xmlAttribute(match[1], "TargetMode");
    if (id && target && mode !== "External") targets.set(id, target.replace(/^\/?xl\//u, ""));
  }
  const sheets = [];
  for (const match of workbook.matchAll(/<sheet\b([^>]*?)(?:\/>|>[\s\S]*?<\/sheet>)/gu)) {
    const name = xmlAttribute(match[1], "name");
    const relationshipId = xmlAttribute(match[1], "r:id");
    const target = targets.get(relationshipId);
    if (!name || !target || target.includes("..")) fail("XLSX_SHEET_BINDING_INVALID", sourceName);
    const member = target.startsWith("xl/") ? target : `xl/${target}`;
    sheets.push(parseXlsxWorksheet(zipText(entries, member, sourceName), strings,
      sourceName, name));
  }
  if (sheets.length === 0) fail("XLSX_SHEETS_MISSING", sourceName);
  return { sheets, sharedStringCount: strings.length };
}

function xlsxCell(sheet, row, column) {
  return sheet.cells.get(`${row}:${column}`)?.value ?? null;
}

const CFB_FREE = 0xffffffff;
const CFB_END = 0xfffffffe;
const CFB_FAT = 0xfffffffd;
const CFB_DIFAT = 0xfffffffc;

function parseCfbWorkbookStream(bytes, sourceName) {
  const signature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 512
    || !bytes.subarray(0, 8).equals(signature)
    || bytes.readUInt16LE(28) !== 0xfffe) fail("XLS_CFB_HEADER_INVALID", sourceName);
  const major = bytes.readUInt16LE(26);
  const sectorSize = 2 ** bytes.readUInt16LE(30);
  const miniSectorSize = 2 ** bytes.readUInt16LE(32);
  const fatSectorCount = bytes.readUInt32LE(44);
  const firstDirectorySector = bytes.readUInt32LE(48);
  const miniCutoff = bytes.readUInt32LE(56);
  const firstMiniFatSector = bytes.readUInt32LE(60);
  const miniFatSectorCount = bytes.readUInt32LE(64);
  const firstDifatSector = bytes.readUInt32LE(68);
  const difatSectorCount = bytes.readUInt32LE(72);
  if (![3, 4].includes(major) || ![512, 4096].includes(sectorSize)
    || miniSectorSize !== 64 || miniCutoff !== 4096
    || fatSectorCount <= 0 || fatSectorCount > 10_000
    || (bytes.length - 512) % sectorSize !== 0) fail("XLS_CFB_PROFILE_INVALID", sourceName);
  const sectorCount = (bytes.length - 512) / sectorSize;
  function sector(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= sectorCount) {
      fail("XLS_CFB_SECTOR_INVALID", `${sourceName}:${index}`);
    }
    const start = 512 + index * sectorSize;
    return bytes.subarray(start, start + sectorSize);
  }
  const difat = [];
  for (let index = 0; index < 109; index += 1) {
    const value = bytes.readUInt32LE(76 + index * 4);
    if (value !== CFB_FREE) difat.push(value);
  }
  let difatSector = firstDifatSector;
  const difatSeen = new Set();
  for (let index = 0; index < difatSectorCount; index += 1) {
    if (difatSeen.has(difatSector)) fail("XLS_CFB_DIFAT_LOOP", sourceName);
    difatSeen.add(difatSector);
    const block = sector(difatSector);
    for (let offset = 0; offset < sectorSize - 4; offset += 4) {
      const value = block.readUInt32LE(offset);
      if (value !== CFB_FREE) difat.push(value);
    }
    difatSector = block.readUInt32LE(sectorSize - 4);
  }
  if (difat.length !== fatSectorCount || (difatSectorCount === 0 && firstDifatSector !== CFB_END)) {
    fail("XLS_CFB_DIFAT_COUNT_INVALID", sourceName);
  }
  const fat = [];
  for (const fatSector of difat) {
    const block = sector(fatSector);
    for (let offset = 0; offset < sectorSize; offset += 4) fat.push(block.readUInt32LE(offset));
  }
  function readChain(first, table, readUnit, maximumUnits, code) {
    if (first === CFB_END) return Buffer.alloc(0);
    const chunks = [];
    const seen = new Set();
    let current = first;
    while (current !== CFB_END) {
      if (!Number.isSafeInteger(current) || current < 0 || current >= table.length
        || [CFB_FREE, CFB_FAT, CFB_DIFAT].includes(current) || seen.has(current)
        || seen.size >= maximumUnits) fail(code, sourceName);
      seen.add(current);
      chunks.push(readUnit(current));
      current = table[current];
    }
    return Buffer.concat(chunks);
  }
  const directoryBytes = readChain(firstDirectorySector, fat, sector,
    sectorCount + 1, "XLS_CFB_DIRECTORY_CHAIN_INVALID");
  if (directoryBytes.length === 0 || directoryBytes.length % 128 !== 0) {
    fail("XLS_CFB_DIRECTORY_INVALID", sourceName);
  }
  const entries = [];
  for (let offset = 0; offset < directoryBytes.length; offset += 128) {
    const nameBytes = directoryBytes.readUInt16LE(offset + 64);
    const type = directoryBytes[offset + 66];
    if (nameBytes < 2 || nameBytes > 64 || nameBytes % 2 !== 0) {
      if (type === 0) continue;
      fail("XLS_CFB_DIRECTORY_NAME_INVALID", sourceName);
    }
    const name = directoryBytes.subarray(offset, offset + nameBytes - 2).toString("utf16le");
    const startSector = directoryBytes.readUInt32LE(offset + 116);
    const size = Number(directoryBytes.readBigUInt64LE(offset + 120));
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_SOURCE_BYTES * 4) {
      fail("XLS_CFB_STREAM_SIZE_INVALID", sourceName);
    }
    entries.push({ name, type, startSector, size });
  }
  const root = entries.find((entry) => entry.type === 5 && entry.name === "Root Entry");
  const workbook = entries.find((entry) => entry.type === 2
    && ["Workbook", "Book"].includes(entry.name));
  if (!root || !workbook || workbook.size === 0) fail("XLS_CFB_WORKBOOK_STREAM_MISSING", sourceName);
  let stream;
  if (workbook.size < miniCutoff) {
    if (miniFatSectorCount <= 0 || firstMiniFatSector === CFB_END) {
      fail("XLS_CFB_MINIFAT_MISSING", sourceName);
    }
    const miniFatBytes = readChain(firstMiniFatSector, fat, sector,
      miniFatSectorCount + 1, "XLS_CFB_MINIFAT_CHAIN_INVALID");
    if (miniFatBytes.length < miniFatSectorCount * sectorSize) {
      fail("XLS_CFB_MINIFAT_LENGTH_INVALID", sourceName);
    }
    const miniFat = [];
    for (let offset = 0; offset < miniFatSectorCount * sectorSize; offset += 4) {
      miniFat.push(miniFatBytes.readUInt32LE(offset));
    }
    const miniStream = readChain(root.startSector, fat, sector,
      sectorCount + 1, "XLS_CFB_MINISTREAM_CHAIN_INVALID").subarray(0, root.size);
    const readMini = (index) => {
      const start = index * miniSectorSize;
      if (start + miniSectorSize > miniStream.length) fail("XLS_CFB_MINISECTOR_INVALID", sourceName);
      return miniStream.subarray(start, start + miniSectorSize);
    };
    stream = readChain(workbook.startSector, miniFat, readMini,
      miniFat.length + 1, "XLS_CFB_WORKBOOK_MINICHAIN_INVALID").subarray(0, workbook.size);
  } else {
    stream = readChain(workbook.startSector, fat, sector,
      sectorCount + 1, "XLS_CFB_WORKBOOK_CHAIN_INVALID").subarray(0, workbook.size);
  }
  if (stream.length !== workbook.size) fail("XLS_CFB_WORKBOOK_LENGTH_INVALID", sourceName);
  return { stream, compound: { majorVersion: major, sectorSize, miniSectorSize,
    directoryEntryCount: entries.length, workbookStreamBytes: stream.length } };
}

function parseBiffRecords(stream, sourceName) {
  const records = [];
  let offset = 0;
  while (offset + 4 <= stream.length) {
    const id = stream.readUInt16LE(offset);
    const length = stream.readUInt16LE(offset + 2);
    const next = offset + 4 + length;
    if (next > stream.length) fail("XLS_BIFF_RECORD_TRUNCATED", sourceName);
    records.push({ id, offset, data: stream.subarray(offset + 4, next) });
    offset = next;
    if (id === 0 && length === 0 && stream.subarray(offset).every((value) => value === 0)) break;
  }
  if (records.length === 0 || records[0].id !== 0x0809) fail("XLS_BIFF_BOF_INVALID", sourceName);
  return records;
}

function parseBiffShortUnicode(data, offset, sourceName) {
  if (offset + 2 > data.length) fail("XLS_BIFF_SHORT_STRING_INVALID", sourceName);
  const count = data[offset];
  const wide = (data[offset + 1] & 1) !== 0;
  const size = count * (wide ? 2 : 1);
  if (offset + 2 + size > data.length) fail("XLS_BIFF_SHORT_STRING_INVALID", sourceName);
  return data.subarray(offset + 2, offset + 2 + size).toString(wide ? "utf16le" : "latin1");
}

class BiffChunkReader {
  constructor(chunks, sourceName) {
    this.chunks = chunks;
    this.sourceName = sourceName;
    this.chunk = 0;
    this.offset = 0;
  }

  atBoundary() { return this.offset === this.chunks[this.chunk]?.length; }

  advance() {
    if (!this.atBoundary() || this.chunk + 1 >= this.chunks.length) {
      fail("XLS_BIFF_SST_TRUNCATED", this.sourceName);
    }
    this.chunk += 1;
    this.offset = 0;
  }

  rawByte() {
    if (this.atBoundary()) this.advance();
    return this.chunks[this.chunk][this.offset++];
  }

  rawUInt16() { return this.rawByte() | (this.rawByte() << 8); }

  rawUInt32() {
    return (this.rawByte() | (this.rawByte() << 8) | (this.rawByte() << 16)
      | (this.rawByte() << 24)) >>> 0;
  }

  rawSkip(count) { for (let index = 0; index < count; index += 1) this.rawByte(); }

  unicodeCharacters(count, wide) {
    let output = "";
    let mode = wide;
    for (let index = 0; index < count; index += 1) {
      if (this.atBoundary()) {
        this.advance();
        mode = (this.rawByte() & 1) !== 0;
      }
      if (mode && this.chunks[this.chunk].length - this.offset < 2) {
        fail("XLS_BIFF_SST_UTF16_BOUNDARY_INVALID", this.sourceName);
      }
      const code = mode ? this.rawUInt16() : this.rawByte();
      output += String.fromCharCode(code);
    }
    return output;
  }
}

function parseBiffSst(records, index, sourceName) {
  const chunks = [records[index].data];
  let cursor = index + 1;
  while (cursor < records.length && records[cursor].id === 0x003c) {
    chunks.push(records[cursor].data);
    cursor += 1;
  }
  const reader = new BiffChunkReader(chunks, sourceName);
  const total = reader.rawUInt32();
  const unique = reader.rawUInt32();
  if (unique > total || unique > 1_000_000) fail("XLS_BIFF_SST_COUNTS_INVALID", sourceName);
  const strings = [];
  for (let stringIndex = 0; stringIndex < unique; stringIndex += 1) {
    const count = reader.rawUInt16();
    const flags = reader.rawByte();
    const richRuns = (flags & 8) !== 0 ? reader.rawUInt16() : 0;
    const extensionBytes = (flags & 4) !== 0 ? reader.rawUInt32() : 0;
    const value = reader.unicodeCharacters(count, (flags & 1) !== 0);
    reader.rawSkip(richRuns * 4 + extensionBytes);
    strings.push(value);
  }
  return { strings, total, unique, nextRecord: cursor };
}

function decodeRk(value) {
  let result;
  if ((value & 2) !== 0) result = value >> 2;
  else {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt32LE(0, 0);
    bytes.writeUInt32LE((value & 0xfffffffc) >>> 0, 4);
    result = bytes.readDoubleLE(0);
  }
  return (value & 1) !== 0 ? result / 100 : result;
}

function biffSetCell(cells, row, column, value, sourceName) {
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column)
    || row < 0 || column < 0 || row > 65_535 || column > 255
    || (typeof value === "number" && !Number.isFinite(value))) {
    fail("XLS_BIFF_CELL_INVALID", sourceName);
  }
  const key = `${row + 1}:${column + 1}`;
  if (cells.has(key)) fail("XLS_BIFF_DUPLICATE_CELL", `${sourceName}:${key}`);
  cells.set(key, value);
}

function parseBiffSheet(stream, offset, strings, name, sourceName) {
  if (offset + 4 > stream.length || stream.readUInt16LE(offset) !== 0x0809) {
    fail("XLS_BIFF_SHEET_BOF_INVALID", `${sourceName}:${name}`);
  }
  const cells = new Map();
  let cursor = offset;
  let formulaCells = 0;
  let recordCount = 0;
  for (;;) {
    if (cursor + 4 > stream.length) fail("XLS_BIFF_SHEET_TRUNCATED", `${sourceName}:${name}`);
    const id = stream.readUInt16LE(cursor);
    const length = stream.readUInt16LE(cursor + 2);
    const data = stream.subarray(cursor + 4, cursor + 4 + length);
    if (data.length !== length) fail("XLS_BIFF_SHEET_RECORD_INVALID", `${sourceName}:${name}`);
    cursor += 4 + length;
    recordCount += 1;
    if (id === 0x000a) break;
    if (id === 0x00fd && length >= 10) {
      const index = data.readUInt32LE(6);
      if (index >= strings.length) fail("XLS_BIFF_LABELSST_INVALID", sourceName);
      biffSetCell(cells, data.readUInt16LE(0), data.readUInt16LE(2), strings[index], sourceName);
    } else if (id === 0x0203 && length === 14) {
      biffSetCell(cells, data.readUInt16LE(0), data.readUInt16LE(2), data.readDoubleLE(6), sourceName);
    } else if (id === 0x027e && length === 10) {
      biffSetCell(cells, data.readUInt16LE(0), data.readUInt16LE(2),
        decodeRk(data.readUInt32LE(6)), sourceName);
    } else if (id === 0x00bd && length >= 12 && (length - 6) % 6 === 0) {
      const row = data.readUInt16LE(0);
      const firstColumn = data.readUInt16LE(2);
      const lastColumn = data.readUInt16LE(length - 2);
      const count = (length - 6) / 6;
      if (lastColumn - firstColumn + 1 !== count) fail("XLS_BIFF_MULRK_INVALID", sourceName);
      for (let index = 0; index < count; index += 1) {
        biffSetCell(cells, row, firstColumn + index,
          decodeRk(data.readUInt32LE(6 + index * 6)), sourceName);
      }
    } else if (id === 0x0006 && length >= 20) {
      formulaCells += 1;
      const special = data.readUInt16LE(12) === 0xffff;
      if (!special) biffSetCell(cells, data.readUInt16LE(0), data.readUInt16LE(2),
        data.readDoubleLE(6), sourceName);
    } else if (id === 0x0205 && length === 8) {
      biffSetCell(cells, data.readUInt16LE(0), data.readUInt16LE(2),
        data[7] === 0 ? data[6] !== 0 : null, sourceName);
    } else if (id === 0x0002 && length === 9) {
      biffSetCell(cells, data.readUInt16LE(0), data.readUInt16LE(2),
        data.readUInt16LE(7), sourceName);
    }
  }
  let maxRow = 0;
  let maxColumn = 0;
  for (const key of cells.keys()) {
    const [row, column] = key.split(":").map(Number);
    maxRow = Math.max(maxRow, row);
    maxColumn = Math.max(maxColumn, column);
  }
  return { name, cells, formulaCells, recordCount, maxRow, maxColumn };
}

function parseXls(bytes, sourceName) {
  const { stream, compound } = parseCfbWorkbookStream(bytes, sourceName);
  const records = parseBiffRecords(stream, sourceName);
  const boundSheets = [];
  let shared = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.id === 0x0085 && record.data.length >= 8) {
      boundSheets.push({ offset: record.data.readUInt32LE(0),
        name: parseBiffShortUnicode(record.data, 6, sourceName) });
    } else if (record.id === 0x00fc) {
      if (shared !== null) fail("XLS_BIFF_MULTIPLE_SST", sourceName);
      shared = parseBiffSst(records, index, sourceName);
      index = shared.nextRecord - 1;
    }
  }
  if (boundSheets.length === 0 || shared === null) fail("XLS_BIFF_GLOBALS_INVALID", sourceName);
  const offsets = new Set();
  const names = new Set();
  const sheets = boundSheets.map((bound) => {
    if (offsets.has(bound.offset) || names.has(bound.name)) fail("XLS_BIFF_SHEET_DUPLICATE", sourceName);
    offsets.add(bound.offset);
    names.add(bound.name);
    return parseBiffSheet(stream, bound.offset, shared.strings, bound.name, sourceName);
  });
  return { compound, sharedStringTotal: shared.total,
    sharedStringUnique: shared.unique, sheets };
}

function xlsCell(sheet, row, column) { return sheet.cells.get(`${row}:${column}`) ?? null; }

function pdfLiteralStrings(text) {
  const output = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "(") continue;
    let cursor = index + 1;
    let depth = 1;
    let value = "";
    while (cursor < text.length && depth > 0) {
      const character = text[cursor++];
      if (character === "\\") {
        if (cursor >= text.length) fail("PDF_LITERAL_ESCAPE_INVALID");
        let escaped = text[cursor++];
        if (escaped === "\r") {
          if (text[cursor] === "\n") cursor += 1;
          continue;
        }
        if (escaped === "\n") continue;
        if (/[0-7]/u.test(escaped)) {
          let octal = escaped;
          for (let count = 0; count < 2 && /[0-7]/u.test(text[cursor] ?? ""); count += 1) {
            octal += text[cursor++];
          }
          value += String.fromCharCode(Number.parseInt(octal, 8));
        } else {
          value += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[escaped] ?? escaped;
        }
      } else if (character === "(") {
        depth += 1;
        value += character;
      } else if (character === ")") {
        depth -= 1;
        if (depth > 0) value += character;
      } else value += character;
    }
    if (depth !== 0) fail("PDF_LITERAL_UNTERMINATED");
    output.push(value);
    index = cursor - 1;
  }
  return output;
}

function parsePdfTextProfile(bytes, sourceName) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1_024
    || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) fail("PDF_MAGIC_INVALID", sourceName);
  const tailStart = Math.max(0, bytes.length - 8_192);
  const tail = bytes.subarray(tailStart).toString("latin1");
  const matches = [...tail.matchAll(/startxref\s+(\d+)\s+%%EOF/gu)];
  if (matches.length === 0) fail("PDF_FINAL_EOF_INVALID", sourceName);
  const final = matches.at(-1);
  if (tail.slice((final.index ?? 0) + final[0].length).trim() !== "") {
    fail("PDF_TRAILING_BYTES_INVALID", sourceName);
  }
  const startXref = Number(final[1]);
  if (!Number.isSafeInteger(startXref) || startXref <= 0 || startXref >= bytes.length
    || bytes.subarray(startXref, startXref + 4).toString("latin1") !== "xref") {
    fail("PDF_XREF_INVALID", sourceName);
  }
  const xrefText = bytes.subarray(startXref).toString("latin1");
  const offsets = [];
  let cursor = 4;
  const nextLine = () => {
    while (xrefText[cursor] === "\r" || xrefText[cursor] === "\n") cursor += 1;
    const end = xrefText.indexOf("\n", cursor);
    if (end < 0) fail("PDF_XREF_LINE_INVALID", sourceName);
    const line = xrefText.slice(cursor, end).replace(/\r$/u, "");
    cursor = end + 1;
    return line;
  };
  for (;;) {
    const line = nextLine();
    if (line === "trailer") break;
    const section = line.match(/^(\d+)\s+(\d+)$/u);
    if (!section) fail("PDF_XREF_SECTION_INVALID", sourceName);
    const first = Number(section[1]);
    const count = Number(section[2]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(count) || count <= 0
      || count > 100_000) fail("PDF_XREF_SECTION_INVALID", sourceName);
    for (let index = 0; index < count; index += 1) {
      const entry = nextLine().match(/^(\d{10})\s+(\d{5})\s+([fn])\s*$/u);
      if (!entry) fail("PDF_XREF_ENTRY_INVALID", sourceName);
      if (entry[3] === "n") offsets.push({ objectNumber: first + index, offset: Number(entry[1]) });
    }
  }
  offsets.sort((left, right) => left.offset - right.offset);
  if (offsets.length < 10 || new Set(offsets.map((item) => item.offset)).size !== offsets.length) {
    fail("PDF_XREF_OBJECTS_INVALID", sourceName);
  }
  const operands = [];
  let streamCount = 0;
  let flateStreamCount = 0;
  let textBearingStreams = 0;
  let skippedImageStreams = 0;
  let pageObjects = 0;
  for (let index = 0; index < offsets.length; index += 1) {
    const current = offsets[index];
    if (current.offset <= 0 || current.offset >= startXref) fail("PDF_OBJECT_OFFSET_INVALID", sourceName);
    const end = index + 1 < offsets.length ? offsets[index + 1].offset : startXref;
    const object = bytes.subarray(current.offset, end);
    const prefix = object.subarray(0, Math.min(80, object.length)).toString("latin1");
    if (!new RegExp(`^${current.objectNumber}\\s+\\d+\\s+obj\\b`, "u").test(prefix)) {
      fail("PDF_OBJECT_BINDING_INVALID", `${sourceName}:${current.objectNumber}`);
    }
    const ascii = object.toString("latin1");
    if (/\/Type\s*\/Page(?!s)\b/u.test(ascii)) pageObjects += 1;
    const marker = ascii.indexOf("stream");
    if (marker < 0) continue;
    let dataStart = marker + 6;
    if (ascii[dataStart] === "\r") dataStart += 1;
    if (ascii[dataStart] === "\n") dataStart += 1;
    const dictionary = ascii.slice(0, marker);
    const lengthToken = dictionary.match(/\/Length\s+(\d+)(?:\s+(\d+)\s+R)?\b/u);
    if (lengthToken?.[2] !== undefined) fail("PDF_INDIRECT_STREAM_LENGTH_UNSUPPORTED", sourceName);
    const directLength = Number(lengthToken?.[1]);
    if (!Number.isSafeInteger(directLength) || directLength < 0
      || dataStart + directLength > object.length) fail("PDF_STREAM_LENGTH_INVALID", sourceName);
    const raw = object.subarray(dataStart, dataStart + directLength);
    streamCount += 1;
    if (/\/(?:DCTDecode|CCITTFaxDecode|JPXDecode)\b/u.test(dictionary)) {
      skippedImageStreams += 1;
      continue;
    }
    let decoded;
    if (/\/FlateDecode\b/u.test(dictionary)) {
      try { decoded = inflateSync(raw); } catch { fail("PDF_FLATE_INVALID", sourceName); }
      flateStreamCount += 1;
    } else decoded = raw;
    const text = decoded.toString("latin1");
    if (/\bBT\b/u.test(text) && /\bET\b/u.test(text)) {
      const strings = pdfLiteralStrings(text);
      operands.push(...strings);
      textBearingStreams += 1;
    }
  }
  if (operands.length < 1_000) fail("PDF_TEXT_OPERANDS_INCOMPLETE", sourceName);
  return {
    pageObjects, xrefInUseObjects: offsets.length, streamCount, flateStreamCount,
    textBearingStreams, skippedImageStreams, textOperandCount: operands.length,
    textOperandHash: domainHash("outsider:cdi-pdf-text-operands:v1", operands),
    text: operands.join(" | "),
  };
}

function normalizedHtml(bytes, sourceName) {
  const raw = bytes.toString("utf8");
  if (raw.includes("\ufffd") || !/<(?:!doctype\s+html|html)\b/iu.test(raw)) {
    fail("HTML_PROFILE_INVALID", sourceName);
  }
  return xmlDecode(raw.replace(/<script\b[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")).replace(/\u00a0/gu, " ").replace(/\s+/gu, " ").trim();
}

function requiredText(text, markers, code) {
  for (const marker of markers) {
    if (!text.includes(marker)) fail(code, marker);
  }
}

function numberFromCell(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(code);
  return value;
}

function stringFromCell(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  return value.trim();
}

function money(value) {
  const normalized = String(value).replace(/[$,\s]/gu, "");
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) fail("MONEY_INVALID", value);
  return normalized;
}

function fixed(value, digits) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("NUMBER_INVALID");
  return value.toFixed(digits);
}

function parseCdiCompleteFiling(bytes) {
  const parsed = parsePdfTextProfile(bytes, "cdi-filing-11-5668.pdf");
  if (parsed.pageObjects !== 129) fail("CDI_FILING_PAGE_COUNT_INVALID");
  const text = parsed.text.replace(/\s+/gu, " ");
  requiredText(text, [
    "PDF Pipeline for SERFF Tracking Number DENT-127302198",
    "State Status: Accepted", "Disposition Status:",
    "Proposed Overall Rate Change", "Rate Template Calculations",
    "Losses incurred as a percentage of premiums earned - including IBNR",
  ], "CDI_FILING_MARKER_MISSING");
  const status = text.match(/SERFF Status:\s*([^|]+?)\s*\|[\s\S]*?State Status:\s*([^|]+?)\s*\|/u);
  const submitted = text.match(/Date Submitted:\s*(\d{2}\/\d{2}\/\d{4})\s*\|/u);
  const effective = text.match(/Effective Date Requested \(New\):\s*(\d{2}\/\d{2}\/\d{4})\s*\|/u);
  const proposed = text.match(/TOTAL:\s*\|\s*(-?\d+\.\d+%) to (-?\d+\.\d+%)\s*\|\s*(-?\d+\.\d+%)/u);
  const premium = text.match(/ADJUSTED PROJECTED\s*\|\s*Medical Malpractice\s*\|\s*([\d,]+)\s*\|(?:\s*\|)*\s*([\d,]+)/u);
  const statutory = text.match(/Year\s*\|\s*2010\s*\|\s*1\.\s*\|\s*Number of claims outstanding at beginning of year\s*\|\s*(\d+)\s*\|\s*2\.\s*\|\s*(\d+)\s*\|\s*3\.\s*\|\s*(\d+)\s*\|\s*4\.\s*\|[\s\S]*?\|\s*(\d+)\s*\|\s*5\.\s*\|\s*([\d,]+)\s*\|\s*6\.\s*\|\s*([\d,]+)\s*\|\s*7\.\s*\|[\s\S]*?\|\s*([\d,]+)\s*\|\s*8\.\s*\|\s*([\d,]+)\s*\|\s*9\.\s*\|[\s\S]*?\|\s*(\d+\.\d+%)/u);
  if (!status || !submitted || !effective || !proposed || !premium || !statutory) {
    fail("CDI_FILING_SEMANTIC_PARSE_INVALID");
  }
  const start = text.indexOf("Rate Template Calculations");
  const end = text.indexOf("CDI Parameters", start);
  if (start < 0 || end < 0 || end <= start) fail("CDI_FILING_EXPERIENCE_SECTION_INVALID");
  const table = text.slice(start, end);
  const totalMarker = table.indexOf("| Total |");
  if (totalMarker < 0) fail("CDI_FILING_EXPERIENCE_TOTAL_INVALID");
  const rowTable = table.slice(0, totalMarker);
  const rows = [];
  for (const match of rowTable.matchAll(/\b(200[1-9]|2010)\s*\|\s*([\d,]+)\s*\|\s*\$?([\d,]+)\s*\|\s*\$?([\d,]+)\s*\|\s*\$?([\d,.]+)\s*\|\s*\$?([\d,.]+)\s*\|\s*(\d+\.\d+)%/gu)) {
    rows.push({
      year: Number(match[1]), earnedExposures: Number(money(match[2])),
      adjustedPremiumUsd: money(match[3]), trendedLossAndDcceUsd: money(match[4]),
      currentRateLevelPremiumPerExposureUsd: money(match[5]),
      lossAndDccePerExposureUsd: money(match[6]), lossAndDcceRatioPct: match[7],
    });
  }
  if (rows.length !== 10 || rows.some((row, index) => row.year !== 2001 + index)) {
    fail("CDI_FILING_EXPERIENCE_ROWS_INVALID", rows.map((row) => row.year).join(","));
  }
  const total = table.match(/Total\s*\|\s*([\d,]+)\s*\|\s*\$?([\d,]+)\s*\|\s*\$?([\d,]+)\s*\|\s*\$?([\d,.]+)\s*\|\s*\$?([\d,.]+)\s*\|\s*(\d+\.\d+)%/u);
  if (!total) fail("CDI_FILING_EXPERIENCE_TOTAL_INVALID");
  const sumExposures = rows.reduce((sum, row) => sum + row.earnedExposures, 0);
  const sumPremium = rows.reduce((sum, row) => sum + Number(row.adjustedPremiumUsd), 0);
  const sumLoss = rows.reduce((sum, row) => sum + Number(row.trendedLossAndDcceUsd), 0);
  const publishedLossTotal = Number(money(total[3]));
  if (sumExposures !== Number(money(total[1]))
    || sumPremium !== Number(money(total[2])) || sumLoss - publishedLossTotal !== 1) {
    fail("CDI_FILING_EXPERIENCE_PROFILE_DRIFT");
  }
  const actuarialCertificationObserved = /(?:actuarial certification|statement of actuarial opinion|\bFCAS\b|\bACAS\b|\bMAAA\b)/iu.test(text);
  return {
    sourceReality: "REAL_FILED_ACTUARIAL_EXPERIENCE_AND_PROPOSED_RATE",
    documentProfile: {
      pageCount: parsed.pageObjects, xrefInUseObjects: parsed.xrefInUseObjects,
      streamCount: parsed.streamCount, flateStreamCount: parsed.flateStreamCount,
      textBearingStreams: parsed.textBearingStreams,
      skippedImageStreams: parsed.skippedImageStreams,
      textOperandCount: parsed.textOperandCount, textOperandHash: parsed.textOperandHash,
      rawTextRetainedInArtifact: false, personalContactFieldsProjected: false,
    },
    filingIdentity: {
      publisher: "CALIFORNIA_DEPARTMENT_OF_INSURANCE",
      stateTrackingNumber: "11-5668", serffTrackingNumber: "DENT-127302198",
      filingCompany: "THE_DENTISTS_INSURANCE_COMPANY",
      line: "MEDICAL_MALPRACTICE", filingType: "RATE",
    },
    filingState: {
      serffStatus: status[1].trim().toUpperCase(), stateStatus: status[2].trim().toUpperCase(),
      submittedOn: submitted[1], requestedEffectiveDate: effective[1],
      dispositionStatus: null, dispositionDate: null,
      acceptedMeansApproved: false, approvedRateObserved: false,
      chargedPolicyPriceObserved: false,
    },
    requestedRate: {
      indicatedLowPct: proposed[1], indicatedHighPct: proposed[2],
      proposedOverallChangePct: proposed[3],
      proposedEarnedPremiumPerExposureUsd: "2042.81",
      adjustedEarnedPremiumUsd: money(premium[1]), projectedEarnedPremiumUsd: money(premium[2]),
      proposedIsApprovedOrChargedPrice: false,
    },
    statutory2010: {
      claimsOutstandingAtStart: Number(statutory[1]), claimsDuringYear: Number(statutory[2]),
      claimsClosedDuringYear: Number(statutory[3]), claimsOutstandingAtEnd: Number(statutory[4]),
      unearnedPremiumUsd: money(statutory[5]), claimsPaidUsd: money(statutory[6]),
      outstandingClaimReserveExcludingIbnrUsd: money(statutory[7]),
      ibnrReserveUsd: money(statutory[8]), incurredLossToEarnedPremiumPct: statutory[9],
      claimsIdentityOrPolicyLevelJoinObserved: false,
    },
    experience2001To2010: {
      rows, total: { earnedExposures: Number(money(total[1])),
        adjustedPremiumUsd: money(total[2]), trendedLossAndDcceUsd: money(total[3]),
        currentRateLevelPremiumPerExposureUsd: money(total[4]),
        lossAndDccePerExposureUsd: money(total[5]), lossAndDcceRatioPct: total[6] },
      rowSumReconciliation: { exposuresExact: true, adjustedPremiumExact: true,
        trendedLossAndDcceExact: false, publishedLossTotalShortByUsd: "1",
        discrepancyPreservedAndNotSilentlyCorrected: true },
      calendarYearsAreCorrelatedAndNotIid: true,
      filedExperienceDoesNotEstablishProspectiveCalibration: true,
    },
    actuarialCertification: {
      requiredBySeparateHealthGuidance: true,
      actualCertificationInThisFilingObserved: actuarialCertificationObserved,
      certificationSignerOrIdentityRetained: false,
      absentCertificationCannotBeImputed: true,
    },
  };
}

function nonemptyXlsxRows(sheet, columns) {
  const rows = [];
  const end = Number(sheet.dimension.match(/[A-Z]+(\d+)$/u)?.[1]);
  if (!Number.isSafeInteger(end)) fail("XLSX_DIMENSION_END_INVALID", sheet.name);
  for (let row = 2; row <= end; row += 1) {
    const values = Array.from({ length: columns }, (_, index) => xlsxCell(sheet, row, index + 1));
    if (values.some((value) => value !== null && value !== "")) rows.push(values);
  }
  return rows;
}

function optionalPercent(value) {
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(number)) fail("PERCENT_CELL_INVALID");
  return number;
}

function parseCdiRegistry(approvalsBytes, noticeBytes) {
  const approvals = parseXlsx(approvalsBytes, "cdi-approvals-2025.xlsx");
  if (canonicalizeStrict(approvals.sheets.map((sheet) => sheet.name))
    !== canonicalizeStrict(["Sheet1", "Sheet2", "Sheet3"])) fail("CDI_APPROVAL_SHEETS_INVALID");
  const sheet = approvals.sheets[0];
  const expectedHeader = ["FILE", "NAME", "GRP #", "NAIC #", "LINE TYPE", "LINE CODE",
    "PROGRAM", "FILING TYPE", "% RATE CHNG REQ", "% RATE CHNG APPVD", "STATUS", "CLOSED DATE"];
  for (let column = 1; column <= expectedHeader.length; column += 1) {
    if (xlsxCell(sheet, 1, column) !== expectedHeader[column - 1]) fail("CDI_APPROVAL_HEADER_INVALID");
  }
  const rows = nonemptyXlsxRows(sheet, 12);
  const statuses = new Map();
  let requestedNumericRows = 0;
  let approvedNumericRows = 0;
  let pairedNumericRows = 0;
  let changedFromRequestedRows = 0;
  let requestedMin = Infinity;
  let requestedMax = -Infinity;
  let approvedMin = Infinity;
  let approvedMax = -Infinity;
  const byFile = new Map();
  for (const row of rows) {
    const file = stringFromCell(row[0], "CDI_APPROVAL_FILE_INVALID");
    if (byFile.has(file)) fail("CDI_APPROVAL_FILE_DUPLICATE", file);
    const status = stringFromCell(row[10], "CDI_APPROVAL_STATUS_INVALID");
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    const requested = optionalPercent(row[8]);
    const approved = optionalPercent(row[9]);
    if (requested !== null) {
      requestedNumericRows += 1;
      requestedMin = Math.min(requestedMin, requested);
      requestedMax = Math.max(requestedMax, requested);
    }
    if (approved !== null) {
      approvedNumericRows += 1;
      approvedMin = Math.min(approvedMin, approved);
      approvedMax = Math.max(approvedMax, approved);
    }
    if (requested !== null && approved !== null) {
      pairedNumericRows += 1;
      if (requested !== approved) changedFromRequestedRows += 1;
    }
    byFile.set(file, { status, requested, approved });
  }
  if (canonicalizeStrict(Object.fromEntries([...statuses].sort()))
    !== canonicalizeStrict({ APPROVED: 2484, CLOSED: 660 })) fail("CDI_APPROVAL_STATUS_COUNTS_INVALID");

  const notice = parseXlsx(noticeBytes, "cdi-public-notice-2024-12-27.xlsx");
  if (canonicalizeStrict(notice.sheets.map((item) => item.name))
    !== canonicalizeStrict(["Cover Sheet", "PN Report", "Errata"])) fail("CDI_NOTICE_SHEETS_INVALID");
  const noticeSheet = notice.sheets[1];
  const noticeHeader = ["File #", "Grp #", "Company Name", "Line Type", "Line Description",
    "File Type", "Program", "Variance", "Overall Rate %", "SERFF #"];
  for (let column = 1; column <= noticeHeader.length; column += 1) {
    if (xlsxCell(noticeSheet, 1, column) !== noticeHeader[column - 1]) fail("CDI_NOTICE_HEADER_INVALID");
  }
  const noticeRows = nonemptyXlsxRows(noticeSheet, 10);
  let rateNumericRows = 0;
  let joined = 0;
  let joinedApproved = 0;
  let joinedClosed = 0;
  let joinedRatePairs = 0;
  for (const row of noticeRows) {
    const rate = optionalPercent(row[8]);
    if (rate !== null) rateNumericRows += 1;
    const filing = byFile.get(stringFromCell(row[0], "CDI_NOTICE_FILE_INVALID"));
    if (!filing) continue;
    joined += 1;
    if (filing.status === "APPROVED") joinedApproved += 1;
    else if (filing.status === "CLOSED") joinedClosed += 1;
    if (rate !== null && filing.approved !== null) joinedRatePairs += 1;
  }
  return {
    sourceReality: "REAL_FILING_REGISTRY_AND_DISPOSITION_LISTS",
    approvalAndClosed2025: {
      sheetDimension: sheet.dimension, publishedRows: rows.length,
      statuses: Object.fromEntries([...statuses].sort()),
      requestedRateChangeNumericRows: requestedNumericRows,
      approvedRateChangeNumericRows: approvedNumericRows,
      pairedRequestedApprovedRows: pairedNumericRows,
      requestedApprovedDifferentRows: changedFromRequestedRows,
      requestedRateChangeRangePct: [fixed(requestedMin, 1), fixed(requestedMax, 1)],
      approvedRateChangeRangePct: [fixed(approvedMin, 1), fixed(approvedMax, 1)],
      rowMeansPolicyOrPrice: false, approvedRateChangeMeansChargedPrice: false,
    },
    publicNotice20241227: {
      sheetDimension: noticeSheet.dimension, publishedRows: noticeRows.length,
      proposedRateNumericRows: rateNumericRows,
      joinedTo2025DispositionByStateFileNumber: joined,
      joinedStatuses: { APPROVED: joinedApproved, CLOSED: joinedClosed },
      joinedRowsWithNoticeAndApprovedRateNumber: joinedRatePairs,
      unjoinedRows: noticeRows.length - joined,
      joinIsAdministrativeIdentityNotCausalOrPolicyLevel: true,
    },
    corpusBoundary: {
      approvalsAreYearToDateClosedListNotAllOpenFilings: true,
      noticeIsOneWeeklyListNotProbabilitySample: true,
      apexInteractiveSessionSnapshotAdmitted: false,
      completeSerffCorpusAdmitted: false,
    },
  };
}

function parseCdiHealthAggregate(bytes) {
  const workbook = parseXlsx(bytes, "cdi-health-anthem-2025-individual.xlsx");
  const expectedSheets = ["Index", "General_Info", "(1) Premium", "(2a) Cost Sharing",
    "(2b) Cost Sharing", "(3) Benefit", "(4) Benefit Design ", "(5a) Enrollment",
    "(5b) Enrollment", "(5c) Enrollment", "(6) Trend", "(7) CA Aggregate Form",
    "Explanation", "Glossary"];
  if (canonicalizeStrict(workbook.sheets.map((sheet) => sheet.name))
    !== canonicalizeStrict(expectedSheets)) fail("CDI_HEALTH_SHEETS_INVALID");
  const byName = new Map(workbook.sheets.map((sheet) => [sheet.name, sheet]));
  const info = byName.get("General_Info");
  const aggregate = byName.get("(7) CA Aggregate Form");
  const enrollment = byName.get("(5a) Enrollment");
  const trend = byName.get("(6) Trend");
  if (String(xlsxCell(info, 10, 3)) !== "2025"
    || xlsxCell(info, 13, 3) !== "Individual") fail("CDI_HEALTH_SCOPE_INVALID");
  const filings = numberFromCell(xlsxCell(aggregate, 7, 3), "CDI_HEALTH_FILINGS_INVALID");
  const subscribers = numberFromCell(xlsxCell(aggregate, 8, 3), "CDI_HEALTH_SUBSCRIBERS_INVALID");
  const coveredLives = numberFromCell(xlsxCell(aggregate, 9, 3), "CDI_HEALTH_LIVES_INVALID");
  const rate = numberFromCell(xlsxCell(aggregate, 10, 3), "CDI_HEALTH_RATE_INVALID");
  const offExchangeLives = numberFromCell(xlsxCell(enrollment, 25, 18), "CDI_HEALTH_ENROLLMENT_INVALID");
  const pmpm = numberFromCell(xlsxCell(enrollment, 25, 19), "CDI_HEALTH_PMPM_INVALID");
  const offExchangeRate = numberFromCell(xlsxCell(enrollment, 25, 20), "CDI_HEALTH_RATE_INVALID");
  const trendDollars = numberFromCell(xlsxCell(trend, 17, 3), "CDI_HEALTH_TREND_INVALID");
  const overallTrend = numberFromCell(xlsxCell(trend, 17, 7), "CDI_HEALTH_TREND_INVALID");
  if (coveredLives !== offExchangeLives || rate !== offExchangeRate) {
    fail("CDI_HEALTH_RECONCILIATION_INVALID");
  }
  return {
    sourceReality: "REAL_COMPANY_AGGREGATE_MARKET_EXPERIENCE",
    reportingYear: 2025, market: "CALIFORNIA_INDIVIDUAL",
    insurer: "ANTHEM_BLUE_CROSS_LIFE_AND_HEALTH_INSURANCE_COMPANY",
    workbookProfile: { sheetCount: workbook.sheets.length,
      sheetNamesHash: domainHash("outsider:cdi-health-sheet-names:v1", expectedSheets),
      formulaCells: workbook.sheets.reduce((sum, sheet) => sum + sheet.formulaCells, 0),
      cachedFormulaValuesUsed: true, formulasRecalculatedByOutsider: false },
    reported: {
      individualFilingsEffectiveInReportingYear: filings,
      subscribers, coveredLives, averageRateChangePct: fixed(rate * 100, 4),
      grandfatheredOffExchangeCoveredLives: offExchangeLives,
      grandfatheredOffExchangeAveragePremiumPmpmUsd: fixed(pmpm, 6),
      grandfatheredOffExchangeWeightedRateChangePct: fixed(offExchangeRate * 100, 4),
      aggregateDollarsPmpm: fixed(trendDollars, 6),
      overallTrendPct: fixed(overallTrend * 100, 6),
      zeroReportedFilingsWithExistingCoveredLives: filings === 0 && coveredLives > 0,
    },
    boundaries: {
      noEarnedPremiumOrIncurredClaimsInThisWorkbook: true,
      zeroRateChangeIsNotZeroPremium: true,
      publisherFormulaCachesAreReportedValuesNotIndependentRecalculation: true,
      companyAggregateIsNotPolicyOrClaimLevel: true,
    },
  };
}

function pdfEnvelope(bytes, sourceName) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1_024
    || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) fail("PDF_MAGIC_INVALID", sourceName);
  const tail = bytes.subarray(Math.max(0, bytes.length - 8_192)).toString("latin1");
  const endings = [...tail.matchAll(/startxref\s+(\d+)\s+%%EOF/gu)];
  if (endings.length === 0) fail("PDF_FINAL_EOF_INVALID", sourceName);
  const last = endings.at(-1);
  if (tail.slice((last.index ?? 0) + last[0].length).trim() !== "") {
    fail("PDF_TRAILING_BYTES_INVALID", sourceName);
  }
  const startXref = Number(last[1]);
  if (!Number.isSafeInteger(startXref) || startXref <= 0 || startXref >= bytes.length) {
    fail("PDF_XREF_INVALID", sourceName);
  }
  const xrefToken = bytes.subarray(startXref, startXref + 4).toString("latin1");
  if (xrefToken !== "xref" && !/^\d+\s+\d+\s+obj\b/u.test(
    bytes.subarray(startXref, startXref + 48).toString("latin1"))) {
    fail("PDF_XREF_INVALID", sourceName);
  }
  const pageObjects = [...bytes.toString("latin1").matchAll(/\/Type\s*\/Page(?!s)\b/gu)].length;
  return { pageObjects, startXrefKind: xrefToken === "xref" ? "CLASSIC_XREF" : "XREF_STREAM",
    finalEofBound: true };
}

function parseCdiInstitutionalBoundary(templateBytes, guidanceBytes, viewingBytes) {
  const workbook = parseXls(templateBytes, "cdi-health-rate-template.xls");
  if (canonicalizeStrict(workbook.sheets.map((sheet) => sheet.name))
    !== canonicalizeStrict(["Sheet1", "Sheet2", "Sheet3"])) fail("CDI_TEMPLATE_SHEETS_INVALID");
  const sheet = workbook.sheets[0];
  const headers = ["Policy Form Number", "Product Name", "Open or closed?", "Enrollment",
    "Insured months in each policy form", "Experience Period on Which Rates are Based",
    "Period for which rates are to be effective",
    "Total premium earned during the experience period on which the rates are based",
    "Total dollar amount of claims incurred during the experience period on which the rates are based",
    "Average rate increase (weighted average)", "Comments"];
  if (sheet.maxRow !== 5 || sheet.maxColumn !== 11) fail("CDI_TEMPLATE_DIMENSIONS_INVALID");
  for (let column = 1; column <= headers.length; column += 1) {
    if (xlsCell(sheet, 5, column) !== headers[column - 1]) fail("CDI_TEMPLATE_HEADER_INVALID");
  }
  const guidance = normalizedHtml(guidanceBytes, "cdi-health-rate-guidance.html");
  requiredText(guidance.toLowerCase(), ["a california rate filing spreadsheet.", "an actuarial certification.",
    "total earned premium", "total dollar amount of incurred claims",
    "average rate increase initially requested", "weighted average of the proposed rate increases"],
  "CDI_GUIDANCE_MARKER_MISSING");
  const viewing = normalizedHtml(viewingBytes, "cdi-virtual-viewing-room.html");
  requiredText(viewing, ["public access via the NAIC SERFF", "available at no cost",
    "Accept or Decline terms of service", "Filings download in PDF Format"],
  "CDI_VIEWING_MARKER_MISSING");
  return {
    sourceReality: "REAL_REGULATORY_FILING_SCHEMA_AND_PUBLIC_ACCESS_PROCESS",
    healthRateSchema: { workbookStreamBytes: workbook.compound.workbookStreamBytes,
      sheetCount: workbook.sheets.length, populatedSheetRows: sheet.maxRow,
      publishedFieldCount: headers.length,
      fieldNamesHash: domainHash("outsider:cdi-health-rate-schema-fields:v1", headers),
      earnedPremiumFieldPresent: true, incurredClaimsFieldPresent: true,
      weightedAverageRequestedRateFieldPresent: true, schemaContainsNoFiledExperienceRows: true },
    guidance: { actualRateFilingFormRequired: true, californiaSpreadsheetRequired: true,
      actuarialCertificationRequired: true, currentAndProposedRateInformationRequired: true,
      healthGuidanceRequirementDoesNotProveCertificationInOtherLinesOrFilings: true },
    serffAccess: { publicAccessObserved: true, noCostAccessObserved: true,
      termsAcceptanceStepObserved: true, downloadablePdfWorkflowObserved: true,
      staticCompleteCorpusSnapshotFrozen: false, interactiveApexSessionPinned: false,
      machineDeferred: ["INTERACTIVE_SERFF_CORPUS", "APEX_SESSION_RESULTS"] },
  };
}

function numericXls(sheet, row, column, code) {
  return numberFromCell(xlsCell(sheet, row, column), code);
}

function integerMoney(value, code) {
  if (!Number.isSafeInteger(value)) fail(code);
  return String(value);
}

function parseNcigfQuarter(bytes) {
  const workbook = parseXls(bytes, "ncigf-assessment-liability-2026q2.xls");
  if (workbook.sheets.length !== 1 || workbook.sheets[0].name !== "Assessment Liability Report") {
    fail("NCIGF_QUARTER_SHEET_INVALID");
  }
  const sheet = workbook.sheets[0];
  const headerChecks = [[1, 1, "State"], [1, 2, "Account"],
    [1, 15, "Net Assessable Premium 2024"],
    [1, 17, "Maximum Assessment (Capacity) - 2025  (See Note 2 below)"],
    [1, 18, "Net Assessable Premium 2025"],
    [1, 20, "Maximum Assessment (Capacity) - 2026  (See Note 2 below)"],
    [1, 26, "Net Assessments Authorized - 2026 (Column X-Y)"]];
  for (const [row, column, expected] of headerChecks) {
    if (xlsCell(sheet, row, column) !== expected) fail("NCIGF_QUARTER_HEADER_INVALID");
  }
  if (xlsCell(sheet, 185, 1) !== "Grand Total") fail("NCIGF_QUARTER_TOTAL_ROW_INVALID");
  const total = {
    netAssessablePremium2024Usd: integerMoney(numericXls(sheet, 185, 15,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    maximumAssessmentCapacity2025Usd: fixed(numericXls(sheet, 185, 17,
      "NCIGF_QUARTER_TOTAL_INVALID"), 2),
    netAssessablePremium2025ReportedToDateUsd: integerMoney(numericXls(sheet, 185, 18,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    maximumAssessmentCapacity2026ReportedToDateUsd: fixed(numericXls(sheet, 185, 20,
      "NCIGF_QUARTER_TOTAL_INVALID"), 2),
    priorYearAssessmentsCalledIn2026Usd: integerMoney(numericXls(sheet, 185, 21,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    authorizedNotCalled2026Usd: integerMoney(numericXls(sheet, 185, 22,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    authorizedAndCalled2026Usd: integerMoney(numericXls(sheet, 185, 23,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    totalAuthorized2026Usd: integerMoney(numericXls(sheet, 185, 24,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    refundsAuthorized2026Usd: integerMoney(numericXls(sheet, 185, 25,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    netAssessmentsAuthorized2026Usd: integerMoney(numericXls(sheet, 185, 26,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    assessmentsAuthorizedPriorTo2026NotCalledUsd: integerMoney(numericXls(sheet, 185, 28,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
    totalProjectedAuthorizedAssessments2026Usd: integerMoney(numericXls(sheet, 185, 29,
      "NCIGF_QUARTER_TOTAL_INVALID"), "NCIGF_QUARTER_TOTAL_INVALID"),
  };
  if (Number(total.authorizedNotCalled2026Usd) + Number(total.authorizedAndCalled2026Usd)
      !== Number(total.totalAuthorized2026Usd)
    || Number(total.totalAuthorized2026Usd) - Number(total.refundsAuthorized2026Usd)
      !== Number(total.netAssessmentsAuthorized2026Usd)) {
    fail("NCIGF_QUARTER_ARITHMETIC_INVALID");
  }
  const note2 = stringFromCell(xlsCell(sheet, 193, 3), "NCIGF_QUARTER_NOTE_INVALID");
  const disclaimer = stringFromCell(xlsCell(sheet, 195, 3), "NCIGF_QUARTER_DISCLAIMER_INVALID");
  requiredText(note2, ["would exceed Total shown", "there is no Maximum Assessment"],
    "NCIGF_QUARTER_NOTE_INVALID");
  requiredText(disclaimer, ["provided by third parties", "not made any effort to independently verify",
    "estimates", "sole purpose", "should not be used for any other purpose"],
  "NCIGF_QUARTER_DISCLAIMER_INVALID");
  let unavailable2025PremiumRows = 0;
  let reportingRows = 0;
  for (let row = 2; row < 185; row += 1) {
    const state = xlsCell(sheet, row, 1);
    const account = xlsCell(sheet, row, 2);
    if (typeof state === "string" && state.trim() && typeof account === "string" && account.trim()) {
      reportingRows += 1;
      if (xlsCell(sheet, row, 18) === "Not Available Yet") unavailable2025PremiumRows += 1;
    }
  }
  return { sourceReality: "REAL_PUBLISHER_COMPILED_ASSESSMENT_EXPERIENCE_AND_CAPACITY_REPORT",
    workbookProfile: { sheetCount: 1, reportingRows, unavailable2025PremiumRows,
      formulaCells: sheet.formulaCells, publisherFormulaCachesUsed: true,
      outsiderRecalculatedPublisherFormulas: false },
    reportedGrandTotal: total,
    reportLimitations: { quarter: "2026_Q2", reportingYearIsPartial: true,
      capacityTotalKnownToUnderstateUnlimitedOrPrefundedFunds: true,
      maximumAssessmentCapacityIsStatutoryCallingCapacityNotCashHeld: true,
      authorizedNotCalledIsNotTransferredCapital: true,
      calledOrAuthorizedIsNotOutsiderCapitalOrCustody: true,
      stateFundAccountRowsAreCorrelatedNotIid: true },
    publisherQualification: { compiledFromThirdPartyData: true,
      independentlyVerifiedByNcigf: false, estimatesMayBePresent: true,
      ncigfDisclaimsAccuracyResponsibility: true,
      workbookStatesSoleAccountingLiabilityPurpose: true,
      useOutsideStatedPurposePermittedByEvidence: false,
      disclaimerHash: domainHash("outsider:ncigf-q2-disclaimer:v1", disclaimer) } };
}

function parseNcigfFiveYear(bytes) {
  const workbook = parseXls(bytes, "ncigf-five-year-assessments-2025.xls");
  if (workbook.sheets.length !== 1 || workbook.sheets[0].name !== "5 yrs Historical Data") {
    fail("NCIGF_FIVE_YEAR_SHEET_INVALID");
  }
  const sheet = workbook.sheets[0];
  const yearColumns = [5, 9, 13, 17, 21];
  const years = yearColumns.map((column) => numericXls(sheet, 1, column,
    "NCIGF_FIVE_YEAR_HEADER_INVALID"));
  if (canonicalizeStrict(years) !== canonicalizeStrict([2021, 2022, 2023, 2024, 2025])) {
    fail("NCIGF_FIVE_YEAR_HEADER_INVALID");
  }
  if (xlsCell(sheet, 127, 1) !== "2006 Total") fail("NCIGF_FIVE_YEAR_STALE_LABEL_MISSING");
  const valueColumns = [[4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
    [16, 17, 18, 19], [20, 21, 22, 23]];
  const totals = Object.fromEntries(years.map((year, index) => {
    const values = valueColumns[index].map((column) => numericXls(sheet, 127, column,
      "NCIGF_FIVE_YEAR_TOTAL_INVALID"));
    if (values[0] - values[1] !== values[2]) fail("NCIGF_FIVE_YEAR_ARITHMETIC_INVALID");
    return [String(year), { assessmentsAuthorizedUsd: integerMoney(values[0],
      "NCIGF_FIVE_YEAR_TOTAL_INVALID"), refundsAuthorizedUsd: integerMoney(values[1],
      "NCIGF_FIVE_YEAR_TOTAL_INVALID"), netAssessmentsUsd: integerMoney(values[2],
      "NCIGF_FIVE_YEAR_TOTAL_INVALID"), abatementsUsd: integerMoney(values[3],
      "NCIGF_FIVE_YEAR_TOTAL_INVALID") }];
  }));
  const accounts = numericXls(sheet, 131, 28, "NCIGF_FIVE_YEAR_PROFILE_INVALID");
  const yearCount = numericXls(sheet, 132, 28, "NCIGF_FIVE_YEAR_PROFILE_INVALID");
  const accountYears = numericXls(sheet, 133, 28, "NCIGF_FIVE_YEAR_PROFILE_INVALID");
  const positiveAccountYears = numericXls(sheet, 134, 28, "NCIGF_FIVE_YEAR_PROFILE_INVALID");
  const publisherRatio = numericXls(sheet, 135, 28, "NCIGF_FIVE_YEAR_PROFILE_INVALID");
  if (accounts * yearCount !== accountYears || positiveAccountYears / accountYears !== publisherRatio) {
    fail("NCIGF_FIVE_YEAR_PROFILE_RECONCILIATION_INVALID");
  }
  const staleRangeLabels = [xlsCell(sheet, 132, 29), xlsCell(sheet, 133, 29)];
  if (!staleRangeLabels.every((value) => typeof value === "string" && value.includes("2020-2024"))) {
    fail("NCIGF_FIVE_YEAR_STALE_RANGE_LABEL_MISSING");
  }
  return { sourceReality: "REAL_REPORTED_FIVE_YEAR_ASSESSMENT_AND_REFUND_EXPERIENCE",
    headerYears: years, reportedTotals: totals,
    accountYearProfile: { accounts, years: yearCount, accountYears, positiveAccountYears,
      positiveAccountYearFraction: fixed(publisherRatio, 12),
      publisherLabelSaysAccountsButArithmeticUsesAccountYears: true },
    internalLabelDrift: { totalRowLabel: "2006 Total", totalRowDoesNotMatchHeaderYears: true,
      bottomRangeLabel: "2020-2024", bottomRangeDoesNotMatchHeaderYears: true,
      staleLabelsPreservedAndNotSilentlyCorrected: true },
    boundaries: { historyIsStateFundAccountExperienceNotOutsiderExperience: true,
      reportingSelectionAndRevisionMayBeCorrelated: true, independentAuditObserved: false } };
}

function ncigfInceptionView(bytes, sourceName) {
  const workbook = parseXls(bytes, sourceName);
  if (workbook.sheets.length !== 1 || workbook.sheets[0].name !== "By Year") {
    fail("NCIGF_INCEPTION_SHEET_INVALID", sourceName);
  }
  const sheet = workbook.sheets[0];
  const expected = ["Year", "State", "Account", "Assessments Authorized", "Refunds Authorized",
    "Net Assessments ", "Abatements (5)"];
  for (let index = 0; index < expected.length; index += 1) {
    if (xlsCell(sheet, 1, index + 2) !== expected[index]) fail("NCIGF_INCEPTION_HEADER_INVALID");
  }
  const rows = [];
  let positiveNetRows = 0;
  let negativeNetRows = 0;
  let zeroNetRows = 0;
  for (let row = 2; row <= sheet.maxRow; row += 1) {
    const rawYear = xlsCell(sheet, row, 2);
    const state = xlsCell(sheet, row, 3);
    if (!((rawYear === "Pre-1978" || (typeof rawYear === "number" && Number.isInteger(rawYear)))
      && typeof state === "string" && state.trim() !== "")) continue;
    const accountValue = xlsCell(sheet, row, 4);
    const account = typeof accountValue === "string" ? accountValue.trim() : "";
    const values = [5, 6, 7, 8].map((column) => {
      const value = xlsCell(sheet, row, column);
      if (value === null || value === "") return 0;
      return numberFromCell(value, "NCIGF_INCEPTION_NUMBER_INVALID");
    });
    if (values[2] > 0) positiveNetRows += 1;
    else if (values[2] < 0) negativeNetRows += 1;
    else zeroNetRows += 1;
    rows.push({ tuple: [String(rawYear), state.trim(), account, ...values.map((value) => fixed(value, 3))],
      values, nonzero: values.some((value) => value !== 0) });
  }
  const totalRow = Array.from({ length: sheet.maxRow }, (_, index) => index + 1).find((row) =>
    xlsCell(sheet, row, 2) === "Grand Total" || xlsCell(sheet, row, 3) === "Grand Total");
  if (!totalRow) fail("NCIGF_INCEPTION_TOTAL_ROW_MISSING", sourceName);
  const workbookTotals = [5, 6, 7, 8].map((column) => numericXls(sheet, totalRow, column,
    "NCIGF_INCEPTION_TOTAL_INVALID"));
  const sums = [0, 1, 2, 3].map((index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  if (sums.some((value, index) => Math.abs(value - workbookTotals[index]) > 0.01)) {
    fail("NCIGF_INCEPTION_TOTAL_RECONCILIATION_INVALID", sourceName);
  }
  const nonzero = rows.filter((row) => row.nonzero).map((row) => row.tuple)
    .sort((left, right) => canonicalizeStrict(left).localeCompare(canonicalizeStrict(right)));
  const noteText = Array.from({ length: sheet.maxRow }, (_, index) => xlsCell(sheet, index + 1, 3))
    .filter((value) => typeof value === "string").join(" ");
  requiredText(noteText, ["not made any effort to independently verify", "Puerto Rico has not reported",
    "NY and NY WC", "Arizona WC started reporting", '"DNR" = Did Not Report'],
  "NCIGF_INCEPTION_NOTES_INVALID");
  return { rawRows: rows.length, nonzeroRows: nonzero.length, positiveNetRows, negativeNetRows,
    zeroNetRows, nonzeroTupleHash: domainHash("outsider:ncigf-inception-nonzero-tuples:v1", nonzero),
    nonzero, totals: { assessmentsAuthorizedUsd: fixed(workbookTotals[0], 3),
      refundsAuthorizedUsd: fixed(workbookTotals[1], 3),
      netAssessmentsUsd: fixed(workbookTotals[2], 3), abatementsUsd: fixed(workbookTotals[3], 3) } };
}

function parseNcigfInception(byFundBytes, byYearBytes) {
  const byFund = ncigfInceptionView(byFundBytes, "ncigf-assessments-by-fund-2025.xls");
  const byYear = ncigfInceptionView(byYearBytes, "ncigf-assessments-by-year-2025.xls");
  if (byFund.rawRows !== 4013 || byYear.rawRows !== 4017
    || byFund.nonzeroRows !== 1514 || byYear.nonzeroRows !== 1514
    || canonicalizeStrict(byFund.nonzero) !== canonicalizeStrict(byYear.nonzero)
    || canonicalizeStrict(byFund.totals) !== canonicalizeStrict(byYear.totals)) {
    fail("NCIGF_INCEPTION_CROSS_VIEW_INVALID");
  }
  return { sourceReality: "REAL_REPORTED_INCEPTION_TO_2025_ASSESSMENT_REFUND_EXPERIENCE",
    byFund: { rawRows: byFund.rawRows, nonzeroRows: byFund.nonzeroRows,
      positiveNetRows: byFund.positiveNetRows, negativeNetRows: byFund.negativeNetRows,
      zeroNetRows: byFund.zeroNetRows, nonzeroTupleHash: byFund.nonzeroTupleHash,
      totals: byFund.totals },
    byYear: { rawRows: byYear.rawRows, nonzeroRows: byYear.nonzeroRows,
      positiveNetRows: byYear.positiveNetRows, negativeNetRows: byYear.negativeNetRows,
      zeroNetRows: byYear.zeroNetRows, nonzeroTupleHash: byYear.nonzeroTupleHash,
      totals: byYear.totals },
    crossView: { rawViewsDiffer: true, additionalAllZeroRowsInByYear: 4,
      blankNumericCellsNormalizedToZeroForComparison: true,
      nonzeroRowMultisetExactlyMatches: true, grandTotalsExactlyMatch: true },
    coverageAndDependence: { nyAndNyWorkersCompOnly2006To2008: true,
      arizonaWorkersCompReportingStarts2012: true, puertoRico2010To2018Missing: true,
      didNotReportMarkerDefined: true, stateAccountYearRowsAreCorrelatedNotIid: true,
      missingnessIsNotAssumedRandom: true, tailOrDependenceModelFitted: false },
    publisherQualification: { thirdPartyDataOrDerivedCompilation: true,
      independentlyVerifiedByNcigf: false, estimatesMayBePresent: true,
      accuracyResponsibilityDisclaimed: true } };
}

function parseNcigfInstitutionalBoundary(pageBytes, guidelinesBytes) {
  const page = normalizedHtml(pageBytes, "ncigf-assessment-page.html");
  requiredText(page, ["Guaranty Fund Assessment Liability Information",
    "provided by or derived from data and information provided by third parties",
    "not made any effort to independently verify such data", "estimates developed by either NCIGF",
    "Assessment Liability Report 2nd Quarter 2026", "Inception-to-Date (through 2025)"],
  "NCIGF_PAGE_MARKER_MISSING");
  const envelope = pdfEnvelope(guidelinesBytes, "ncigf-reporting-guidelines.pdf");
  if (envelope.pageObjects !== 2) fail("NCIGF_GUIDELINES_PAGE_COUNT_INVALID");
  return { sourceReality: "REAL_PUBLISHER_SCOPE_DISCLAIMER_AND_REPORTING_PROCESS",
    assessmentPage: { quarterlyLiabilityReportDescribed: true,
      fiveYearHistoryDescribed: true, inceptionViewsDescribed: true,
      thirdPartyCompilationDisclosed: true, independentVerificationDisclaimed: true,
      estimatesMayBePresent: true },
    reportingGuidelines: { exactOfficialBytesFrozen: true, pageCount: envelope.pageObjects,
      pdfEnvelopeVerified: true, semanticExtractionStatus: "MACHINE_DEFERRED",
      reason: "NO_PORTABLE_SOURCE_AWARE_SEMANTIC_PARSER_ADMITTED_FOR_THIS_TWO_PAGE_PDF" },
    institutionalBoundary: { ncigfReportIsNotIndependentAudit: true,
      guarantyFundCapacityIsNotOutsiderCapital: true,
      assessmentAuthorizationIsNotCapitalTransferToOutsider: true,
      reportDoesNotConferLicensureCustodyCoverageSettlementOrGuaranteeAuthority: true } };
}

function generatedAt(value) {
  const candidate = value ?? CDI_NCIGF_RATE_GUARANTY_FROZEN_AT;
  if (typeof candidate !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(candidate)
    || new Date(candidate).toISOString() !== candidate) fail("GENERATED_AT_INVALID");
  return candidate;
}

function sourceProjection(official, files = null, callerFiles = null) {
  if (!official) {
    if (callerFiles === null || typeof callerFiles !== "object" || Array.isArray(callerFiles)) {
      fail("CALLER_FILES_INVALID");
    }
    const entries = Object.entries(callerFiles).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length > 32 || entries.some(([name, bytes]) => typeof name !== "string" || !name
      || !Buffer.isBuffer(bytes) || bytes.length > MAX_SOURCE_BYTES)) fail("CALLER_FILES_INVALID");
    return { profileMatchedAtBuild: false, publisherIdentityAdmitted: false,
      callerFixture: true, suppliedObjectCount: entries.length,
      suppliedBytes: entries.reduce((sum, [, bytes]) => sum + bytes.length, 0),
      callerByteSetHash: domainHash("outsider:cdi-ncigf-caller-fixture-bytes:v1",
        entries.map(([name, bytes]) => ({ name, sizeBytes: bytes.length, sha256: sha256Bytes(bytes) }))),
      officialObjects: [], officialSourceSetHash: null };
  }
  const objects = CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.map((pin) => ({
    path: pin.path, kind: pin.kind, url: pin.url, sizeBytes: pin.sizeBytes, sha256: pin.sha256,
    independentRedownloadByteStable: pin.independentRedownloadByteStable,
    exactBytesVerifiedAtBuild: files.get(pin.path).length === pin.sizeBytes,
  }));
  return { profileMatchedAtBuild: true, publisherIdentityAdmitted: true,
    callerFixture: false, suppliedObjectCount: objects.length,
    suppliedBytes: objects.reduce((sum, item) => sum + item.sizeBytes, 0),
    callerByteSetHash: null, officialObjects: objects,
    officialSourceSetHash: domainHash("outsider:cdi-ncigf-official-source-set:v1", objects) };
}

function fixtureLanes() {
  return { cdi: { admitted: false, reason: "CALLER_FIXTURE_HAS_NO_OFFICIAL_IDENTITY",
    filing: null, registry: null, healthAggregate: null, institutionalBoundary: null },
  ncigf: { admitted: false, reason: "CALLER_FIXTURE_HAS_NO_OFFICIAL_IDENTITY",
    quarterlyAssessmentLiability: null, fiveYearHistory: null, inceptionHistory: null,
    institutionalBoundary: null } };
}

function officialLanes(files) {
  return { cdi: { admitted: true,
    filing: parseCdiCompleteFiling(files.get("cdi-filing-11-5668.pdf")),
    registry: parseCdiRegistry(files.get("cdi-approvals-2025.xlsx"),
      files.get("cdi-public-notice-2024-12-27.xlsx")),
    healthAggregate: parseCdiHealthAggregate(files.get("cdi-health-anthem-2025-individual.xlsx")),
    institutionalBoundary: parseCdiInstitutionalBoundary(files.get("cdi-health-rate-template.xls"),
      files.get("cdi-health-rate-guidance.html"), files.get("cdi-virtual-viewing-room.html")) },
  ncigf: { admitted: true,
    quarterlyAssessmentLiability: parseNcigfQuarter(files.get("ncigf-assessment-liability-2026q2.xls")),
    fiveYearHistory: parseNcigfFiveYear(files.get("ncigf-five-year-assessments-2025.xls")),
    inceptionHistory: parseNcigfInception(files.get("ncigf-assessments-by-fund-2025.xls"),
      files.get("ncigf-assessments-by-year-2025.xls")),
    institutionalBoundary: parseNcigfInstitutionalBoundary(files.get("ncigf-assessment-page.html"),
      files.get("ncigf-reporting-guidelines.pdf")) } };
}

function buildArtifact({ official, files = null, callerFiles = null, options = {} }) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    fail("OPTIONS_INVALID");
  }
  const source = sourceProjection(official, files, callerFiles);
  const lanes = official ? officialLanes(files) : fixtureLanes();
  const body = {
    schema: CDI_NCIGF_RATE_GUARANTY_SCHEMA, generatedAt: generatedAt(options.generatedAt),
    epistemicPolicy: { publicOriginDoesNotDemoteRealWorldEvidence: true,
      outsiderCollectionDoesNotUpgradeSourceAuthority: true,
      qualityAuthorityReliabilityRightsAndCoverageFitEvaluatedDirectly: true,
      publisherCompilationIsRealReportedExperienceNotIndependentWorldTruth: true },
    source, lanes,
    crossLaneBoundary: { cdiRateFilingAndNcigfAssessmentDataAreSeparateEstimands: true,
      filingProposedRateMeansApprovedRate: false, approvedRateMeansChargedPolicyPrice: false,
      assessmentCapacityMeansOutsiderCapital: false, assessmentAuthorizationMeansCapitalTransfer: false,
      crossLanePoolingPerformed: false, targetDomainTransferPerformed: false,
      causalIdentificationPerformed: false, prospectiveHoldoutPerformed: false,
      tailOrDependenceModelFitted: false },
    rights: { officialPublicAccessObserved: official, legalConclusionMade: false,
      rawRedistributionRightConcluded: false, commercialUseRightConcluded: false,
      modelTrainingRightConcluded: false, personalDataReuseRightConcluded: false,
      ncigfWorkbookStatedPurposeRestrictsAdmittedUse: official,
      sourceAccessDoesNotEqualReusePermission: true },
    verificationRequirement: { standaloneVerificationLevel: "STRUCTURE_ONLY",
      admissionVerificationLevel: "FULL_EXACT_OFFICIAL_SOURCE_REPLAYED",
      exactBytesSchemaAndFullRebuildRequired: true,
      semanticMachineDeferralCannotBePromotedByCaller: true },
    authority: { TRAIN: false, PRICE: false, GUARANTEE: false, COVER: false, CAPITAL: false,
      CUSTODY: false, SETTLE: false, CLOSE: false, PAY: false, ISSUE: false,
      APPROVE_RATE: false, DETERMINE_LEGAL_LIABILITY: false },
    progress: { realFiledExposureLossExperience: official,
      realRateRegistryAndAggregatePremiumExperience: official,
      realGuarantyFundAssessmentAndCapacityExperience: official,
      independentOutcomeSensing: false, independentActuarialAudit: false,
      outsiderCapitalOrCustodyObserved: false, readyToPrice: false,
      readyToGuarantee: false, readyToCover: false, readyToSettle: false },
    admission: { requiresFullSourceReplay: true,
      realSourceDomainDescriptiveExperienceRecognized: official,
      officialPublisherRecordStatusRecognized: official,
      independentlyVerifiedUnderlyingWorldTruth: false,
      outsiderAuthorityOrCapitalRecognized: false, training: false, pricing: false,
      guarantee: false, coverage: false, capital: false, custody: false, settlement: false },
  };
  return { ...body, artifactHash: domainHash("outsider:cdi-ncigf-rate-guaranty-artifact:v1", body) };
}

export function buildCdiNcigfRateGuarantyEvidenceFromBytes(callerFiles, options = {}) {
  return buildArtifact({ official: false, callerFiles, options });
}

export function buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(sourceDirectory, options = {}) {
  const files = readPinnedSource(sourceDirectory);
  return buildArtifact({ official: true, files, options });
}

function structureErrors(artifact) {
  const errors = [];
  if (!exactKeys(artifact, ["schema", "generatedAt", "epistemicPolicy", "source", "lanes",
    "crossLaneBoundary", "rights", "verificationRequirement", "authority", "progress",
    "admission", "artifactHash"])) return ["TOP_LEVEL_STRUCTURE_INVALID"];
  if (artifact.schema !== CDI_NCIGF_RATE_GUARANTY_SCHEMA) errors.push("SCHEMA_INVALID");
  try { generatedAt(artifact.generatedAt); } catch { errors.push("GENERATED_AT_INVALID"); }
  if (!HASH.test(artifact.artifactHash ?? "")) errors.push("ARTIFACT_HASH_FORMAT_INVALID");
  else {
    const { artifactHash: ignored, ...body } = artifact;
    if (domainHash("outsider:cdi-ncigf-rate-guaranty-artifact:v1", body) !== artifact.artifactHash) {
      errors.push("ARTIFACT_HASH_MISMATCH");
    }
  }
  const expectedEpistemic = { publicOriginDoesNotDemoteRealWorldEvidence: true,
    outsiderCollectionDoesNotUpgradeSourceAuthority: true,
    qualityAuthorityReliabilityRightsAndCoverageFitEvaluatedDirectly: true,
    publisherCompilationIsRealReportedExperienceNotIndependentWorldTruth: true };
  if (canonicalizeStrict(artifact.epistemicPolicy) !== canonicalizeStrict(expectedEpistemic)) {
    errors.push("EPISTEMIC_POLICY_INVALID");
  }
  const expectedCrossLane = { cdiRateFilingAndNcigfAssessmentDataAreSeparateEstimands: true,
    filingProposedRateMeansApprovedRate: false, approvedRateMeansChargedPolicyPrice: false,
    assessmentCapacityMeansOutsiderCapital: false, assessmentAuthorizationMeansCapitalTransfer: false,
    crossLanePoolingPerformed: false, targetDomainTransferPerformed: false,
    causalIdentificationPerformed: false, prospectiveHoldoutPerformed: false,
    tailOrDependenceModelFitted: false };
  if (canonicalizeStrict(artifact.crossLaneBoundary) !== canonicalizeStrict(expectedCrossLane)) {
    errors.push("SEMANTIC_BOUNDARY_INVALID");
  }
  const falseAuthority = { TRAIN: false, PRICE: false, GUARANTEE: false, COVER: false,
    CAPITAL: false, CUSTODY: false, SETTLE: false, CLOSE: false, PAY: false, ISSUE: false,
    APPROVE_RATE: false, DETERMINE_LEGAL_LIABILITY: false };
  if (canonicalizeStrict(artifact.authority) !== canonicalizeStrict(falseAuthority)) {
    errors.push("AUTHORITY_BOUNDARY_INVALID");
  }
  const official = artifact.source?.profileMatchedAtBuild === true;
  const expectedRights = { officialPublicAccessObserved: official, legalConclusionMade: false,
    rawRedistributionRightConcluded: false, commercialUseRightConcluded: false,
    modelTrainingRightConcluded: false, personalDataReuseRightConcluded: false,
    ncigfWorkbookStatedPurposeRestrictsAdmittedUse: official,
    sourceAccessDoesNotEqualReusePermission: true };
  if (canonicalizeStrict(artifact.rights) !== canonicalizeStrict(expectedRights)) {
    errors.push("RIGHTS_BOUNDARY_INVALID");
  }
  const expectedVerification = { standaloneVerificationLevel: "STRUCTURE_ONLY",
    admissionVerificationLevel: "FULL_EXACT_OFFICIAL_SOURCE_REPLAYED",
    exactBytesSchemaAndFullRebuildRequired: true,
    semanticMachineDeferralCannotBePromotedByCaller: true };
  if (canonicalizeStrict(artifact.verificationRequirement)
    !== canonicalizeStrict(expectedVerification)) errors.push("VERIFICATION_REQUIREMENT_INVALID");
  const expectedProgress = { realFiledExposureLossExperience: official,
    realRateRegistryAndAggregatePremiumExperience: official,
    realGuarantyFundAssessmentAndCapacityExperience: official,
    independentOutcomeSensing: false, independentActuarialAudit: false,
    outsiderCapitalOrCustodyObserved: false, readyToPrice: false,
    readyToGuarantee: false, readyToCover: false, readyToSettle: false };
  if (canonicalizeStrict(artifact.progress) !== canonicalizeStrict(expectedProgress)) {
    errors.push("PROGRESS_BOUNDARY_INVALID");
  }
  const expectedAdmission = { requiresFullSourceReplay: true,
    realSourceDomainDescriptiveExperienceRecognized: official,
    officialPublisherRecordStatusRecognized: official,
    independentlyVerifiedUnderlyingWorldTruth: false,
    outsiderAuthorityOrCapitalRecognized: false, training: false, pricing: false,
    guarantee: false, coverage: false, capital: false, custody: false, settlement: false };
  if (canonicalizeStrict(artifact.admission) !== canonicalizeStrict(expectedAdmission)) {
    errors.push("ADMISSION_BOUNDARY_INVALID");
  }
  if (!official) {
    if (!exactKeys(artifact.source, ["profileMatchedAtBuild", "publisherIdentityAdmitted",
      "callerFixture", "suppliedObjectCount", "suppliedBytes", "callerByteSetHash",
      "officialObjects", "officialSourceSetHash"])
      || artifact.source.publisherIdentityAdmitted !== false
      || artifact.source.callerFixture !== true
      || !Number.isSafeInteger(artifact.source.suppliedObjectCount)
      || !Number.isSafeInteger(artifact.source.suppliedBytes)
      || !HASH.test(artifact.source.callerByteSetHash ?? "")
      || canonicalizeStrict(artifact.source.officialObjects) !== "[]"
      || artifact.source.officialSourceSetHash !== null
      || canonicalizeStrict(artifact.lanes) !== canonicalizeStrict(fixtureLanes())) {
      errors.push("CALLER_FIXTURE_INHERITED_OFFICIAL_REALITY");
    }
  } else {
    const expectedObjects = CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.map((pin) => ({
      path: pin.path, kind: pin.kind, url: pin.url, sizeBytes: pin.sizeBytes,
      sha256: pin.sha256, independentRedownloadByteStable: pin.independentRedownloadByteStable,
      exactBytesVerifiedAtBuild: true }));
    const expectedSourceSetHash = domainHash("outsider:cdi-ncigf-official-source-set:v1",
      expectedObjects);
    if (!exactKeys(artifact.source, ["profileMatchedAtBuild", "publisherIdentityAdmitted",
      "callerFixture", "suppliedObjectCount", "suppliedBytes", "callerByteSetHash",
      "officialObjects", "officialSourceSetHash"])
      || artifact.source.publisherIdentityAdmitted !== true
      || artifact.source.callerFixture !== false
      || artifact.source.suppliedObjectCount !== expectedObjects.length
      || artifact.source.suppliedBytes !== expectedObjects.reduce((sum, row) => sum + row.sizeBytes, 0)
      || artifact.source.callerByteSetHash !== null
      || canonicalizeStrict(artifact.source.officialObjects) !== canonicalizeStrict(expectedObjects)
      || artifact.source.officialSourceSetHash !== expectedSourceSetHash) {
      errors.push("OFFICIAL_SOURCE_PROFILE_INVALID");
    }
    if (artifact.lanes?.cdi?.admitted !== true || artifact.lanes?.ncigf?.admitted !== true
      || artifact.lanes.cdi.filing?.filingState?.serffStatus !== "ASSIGNED"
      || artifact.lanes.cdi.filing?.filingState?.stateStatus !== "ACCEPTED"
      || artifact.lanes.cdi.filing?.filingState?.dispositionStatus !== null
      || artifact.lanes.cdi.filing?.filingState?.acceptedMeansApproved !== false
      || artifact.lanes.cdi.filing?.filingState?.approvedRateObserved !== false
      || artifact.lanes.cdi.filing?.filingState?.chargedPolicyPriceObserved !== false
      || artifact.lanes.cdi.filing?.requestedRate?.proposedIsApprovedOrChargedPrice !== false
      || artifact.lanes.cdi.registry?.approvalAndClosed2025?.approvedRateChangeMeansChargedPrice
        !== false
      || artifact.lanes.cdi.institutionalBoundary?.serffAccess?.staticCompleteCorpusSnapshotFrozen
        !== false
      || artifact.lanes.ncigf.quarterlyAssessmentLiability?.publisherQualification
        ?.independentlyVerifiedByNcigf !== false
      || artifact.lanes.ncigf.quarterlyAssessmentLiability?.publisherQualification
        ?.useOutsideStatedPurposePermittedByEvidence !== false
      || artifact.lanes.ncigf.quarterlyAssessmentLiability?.reportLimitations
        ?.maximumAssessmentCapacityIsStatutoryCallingCapacityNotCashHeld !== true
      || artifact.lanes.ncigf.fiveYearHistory?.boundaries?.independentAuditObserved !== false
      || artifact.lanes.ncigf.inceptionHistory?.publisherQualification
        ?.independentlyVerifiedByNcigf !== false
      || artifact.lanes.ncigf.institutionalBoundary?.reportingGuidelines
        ?.semanticExtractionStatus !== "MACHINE_DEFERRED"
      || artifact.lanes.ncigf.institutionalBoundary?.institutionalBoundary
        ?.guarantyFundCapacityIsNotOutsiderCapital !== true) {
      errors.push("OFFICIAL_BOUNDARY_OR_PROFILE_INVALID");
    }
  }
  return errors;
}

export function verifyCdiNcigfRateGuarantyEvidence(artifact) {
  let errors;
  try { errors = structureErrors(artifact); } catch (error) {
    errors = [error instanceof Error ? error.message : "STRUCTURE_CHECK_FAILED"];
  }
  return { ok: errors.length === 0, verificationLevel: "STRUCTURE_ONLY",
    sourceArtifactsReverified: false, exactOfficialBytesReplayed: false,
    candidateArtifactExactlyRebuilt: false, publisherRecordStatusReproduced: false,
    underlyingWorldTruthIndependentlyEstablished: false, outsiderAuthorityEstablished: false,
    outsiderCapitalCustodyOrCoverageEstablished: false,
    realSourceDomainExperienceAdmissionEstablished: false, decision: null, errors,
    artifactHash: errors.length === 0 ? artifact.artifactHash : null,
    sourceSetHash: errors.length === 0 ? artifact.source?.officialSourceSetHash ?? null : null };
}

export function verifyCdiNcigfRateGuarantyEvidenceWithSource(artifact, sourceDirectory) {
  const standalone = verifyCdiNcigfRateGuarantyEvidence(artifact);
  if (!standalone.ok) return { ...standalone, verificationLevel: "FULL_SOURCE_REPLAY_FAILED" };
  try {
    const rebuilt = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(sourceDirectory,
      { generatedAt: artifact.generatedAt });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(artifact)) {
      return { ...standalone, ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
        exactOfficialBytesReplayed: true, candidateArtifactExactlyRebuilt: false,
        publisherRecordStatusReproduced: true, errors: ["EXACT_REBUILD_MISMATCH"],
        sourceSetHash: rebuilt.source.officialSourceSetHash };
    }
    return { ok: true, verificationLevel: "FULL_EXACT_OFFICIAL_SOURCE_REPLAYED",
      sourceArtifactsReverified: true, exactOfficialBytesReplayed: true,
      candidateArtifactExactlyRebuilt: true, publisherRecordStatusReproduced: true,
      underlyingWorldTruthIndependentlyEstablished: false, outsiderAuthorityEstablished: false,
      outsiderCapitalCustodyOrCoverageEstablished: false,
      realSourceDomainExperienceAdmissionEstablished: true,
      decision: "ADMIT_REAL_SOURCE_DOMAIN_RATE_FILING_AND_GUARANTY_FUND_DESCRIPTIVE_EXPERIENCE",
      errors: [], artifactHash: artifact.artifactHash,
      sourceSetHash: rebuilt.source.officialSourceSetHash };
  } catch (error) {
    return { ...standalone, ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      errors: [error instanceof Error ? error.message : "SOURCE_REPLAY_FAILED"],
      sourceArtifactsReverified: false, exactOfficialBytesReplayed: false,
      candidateArtifactExactlyRebuilt: false, publisherRecordStatusReproduced: false,
      realSourceDomainExperienceAdmissionEstablished: false, decision: null, sourceSetHash: null };
  }
}
