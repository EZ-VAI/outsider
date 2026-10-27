/*
 * Real U.S. Treasury Judgment Fund payment-report experience and GAO bid-
 * protest institutional outcome experience.
 *
 * Public origin neither demotes nor upgrades these observations.  The real
 * status comes from exact official source bytes and source-aware replay.  The
 * permitted inference remains narrower: payment is not recovery, GAO relief
 * is not implementation, and neither institution delegates authority to
 * Outsider.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const JUDGMENT_FUND_GAO_REAL_CASES_SCHEMA =
  "outsider/judgment-fund-gao-real-institutional-cases/v1";
export const JUDGMENT_FUND_GAO_ACQUISITION_SCHEMA =
  "outsider/judgment-fund-gao-official-source-acquisition/v1";

const DEFAULT_GENERATED_AT = "2026-08-21T12:30:00.000Z";
const FREEZE_OBSERVED_AT = "2026-08-21T12:20:00.000Z";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const ACQUISITION_FILE = "acquisition.json";

const REPORTS = [
  ["01-01", "01-15", "/system/files/files/judgment-fund/2026/", 50_735,
    "4cee678baa6ef6169d8d863ce7ee66b09ebeb899ecf0e0cf56d1467a07cde92a"],
  ["01-16", "01-31", "/system/files/files/judgment-fund/2026/", 45_327,
    "7a0fdba623ef24999a2267d9f135d2055b5c5f6626da7de0e92bc2de165d9d33"],
  ["02-01", "02-15", "/system/files/2026-03/", 267_118,
    "3d7cd670f64a7e3ff7648edfd6a5193bbbec12305a39e4ee60a743181cd2dec8"],
  ["02-16", "02-28", "/system/files/2026-03/", 52_763,
    "9e96c05662ba5e86099fbd8377dc3977bad5de7ad938732b7c68888f695a45d8"],
  ["03-01", "03-15", "/system/files/2026-03/", 175_164,
    "ec82f82057f688bd80a0850df795cbfbb0df4a309c45fe76372b36a73cd14c05"],
  ["03-16", "03-31", "/system/files/2026-04/", 50_243,
    "8822e4ce2ccf31fb2418660065f129c2bf87279b8f6ac23d83b8fb5c88a018b7"],
  ["04-01", "04-15", "/system/files/2026-04/", 51_877,
    "019d5d8d231dab32ded968d1fcaab2cf9ea2111c78237157bccea057abf4f703"],
  ["04-16", "04-30", "/system/files/2026-05/", 63_859,
    "7774f11d23afb1cfcd4585489e0bb3c8610f6e5b7f2891da0e2f536850890732"],
  ["05-01", "05-15", "/system/files/2026-05/", 65_876,
    "37f6e10077ed74eaab2a206644d6e7b9ca1c687b949b29c5df0855041de76eea"],
  ["05-16", "05-31", "/system/files/2026-06/", 53_273,
    "2fc1d9bf7fec2a3d2e031a91594830d1ed5c6c4da862d0473400b414cc3df15a"],
  ["06-01", "06-15", "/system/files/2026-06/", 58_586,
    "a576d68c5eb64e644cf6dc8205797054269abcc450fe5fb90ea19d8a8b1643a8"],
  ["06-16", "06-30", "/system/files/2026-07/", 81_000,
    "e4fd53631ae43dd6045c82c46f5609b0ae383d934930f954ae6d43f01a4711b2"],
  ["07-01", "07-15", "/system/files/2026-07/", 875_368,
    "cc1d40f9b1381370426e7ee900d6a4f0079cd966da55ad940d8ee877285e4262"],
  ["07-16", "07-31", "/system/files/2026-08/", 864_817,
    "36a76299f4b001190e9f5cd4db5e68bc692a8d0fb241ea453a62ce18c462002f"],
].map(([start, end, prefix, sizeBytes, hex]) => {
  const pathName = `payment-report-${start}-26-thru-${end}-26.xlsx`;
  return Object.freeze({
    path: pathName,
    lane: "TREASURY_JUDGMENT_FUND",
    kind: "OFFICIAL_BIWEEKLY_PAYMENT_REPORT_XLSX",
    url: `https://fiscal.treasury.gov${prefix}${pathName}`,
    interval: Object.freeze({ start: `2026-${start}`, end: `2026-${end}` }),
    captureRepresentation: "EXACT_PUBLISHER_FILE_BYTES",
    independentRedownloadByteStabilityEstablishedAtFreeze: true,
    sizeBytes,
    sha256: `sha256:${hex}`,
  });
});

const SUPPORT = [
  ["31cfr256.pdf", "OFFICIAL_JUDGMENT_FUND_REGULATION_PDF",
    "https://fiscal.treasury.gov/system/files/files/judgment-fund/31cfr256.pdf", 65_251,
    "460ea381b7bc3896e78d854db45e7473bd229378c93a8f1969d65cd4fcde53ba", "EXACT_PUBLISHER_FILE_BYTES"],
  ["31cfr256.txt", "OFFICIAL_JUDGMENT_FUND_REGULATION_TEXT",
    "https://fiscal.treasury.gov/system/files/files/judgment-fund/31cfr256.txt", 23_265,
    "f5d4775fba83e38914bcd200a972b2f81023f9049ec17e8f9bb4130d02ba1c48", "EXACT_PUBLISHER_FILE_BYTES"],
  ["form-197.pdf", "OFFICIAL_CURRENT_VOUCHER_FOR_PAYMENT_PDF",
    "https://fiscal.treasury.gov/system/files/files/judgment-fund/form-197.pdf", 234_626,
    "4e6dbf571d84532b61c27fd2308d27485ecdf93894f22388c10d85f86003e0ca", "EXACT_PUBLISHER_FILE_BYTES"],
  ["treasury-award-payment-process.html", "OFFICIAL_AWARD_PAYMENT_PROCESS_HTML",
    "https://fiscal.treasury.gov/payments-from-government/judgment-fund/award-payment-process", 116_289,
    "53f440dc0f810d477e93fd522f5ffa7e8da3dc1b431993c62891d13babf21d28", "EXACT_HTTP_RESPONSE_BODY_BYTES"],
  ["treasury-biweekly-index.html", "OFFICIAL_BIWEEKLY_REPORT_INDEX_HTML",
    "https://fiscal.treasury.gov/payments-from-government/judgment-fund/bi-weekly-payment-report", 260_899,
    "dd56667fea268d2646cb6f21ac1f56175ac33e3bda5e357753828f78d4aa8e7e", "EXACT_HTTP_RESPONSE_BODY_BYTES"],
  ["treasury-faq.html", "OFFICIAL_JUDGMENT_FUND_FAQ_HTML",
    "https://fiscal.treasury.gov/payments-from-government/judgment-fund/faqs", 129_696,
    "87248d8f091f2f789cf0d1b0f6f2f22d7e96ee573ff2c296aa7784ae247b044f", "EXACT_HTTP_RESPONSE_BODY_BYTES"],
  ["treasury-forms.html", "OFFICIAL_ELECTRONIC_FILING_AND_FORM_INDEX_HTML",
    "https://fiscal.treasury.gov/payments-from-government/judgment-fund/forms", 115_804,
    "655083fffed2269d2888ddd19dd2c13d3f1446f8b1d02bff59e1acd8ffddbbcc", "EXACT_HTTP_RESPONSE_BODY_BYTES"],
  ["treasury-judgment-fund-home.html", "OFFICIAL_JUDGMENT_FUND_HOME_HTML",
    "https://fiscal.treasury.gov/payments-from-government/judgment-fund", 118_178,
    "61b73b5331261038f4afeeee922ac51bca6af34dc38b5eafab957f1e38d69b69", "EXACT_HTTP_RESPONSE_BODY_BYTES"],
  ["treasury-offsets.html", "OFFICIAL_JUDGMENT_FUND_OFFSETS_HTML",
    "https://fiscal.treasury.gov/payments-from-government/judgment-fund/offsets", 120_818,
    "a17bc8328525076547dd665bf921a77667241f001e393b6742bb83dfb58fd449", "EXACT_HTTP_RESPONSE_BODY_BYTES"],
  ["treasury-regulations.html", "OFFICIAL_REGULATION_AND_GUIDANCE_HTML",
    "https://fiscal.treasury.gov/payments-from-government/judgment-fund/regulations", 124_123,
    "145cb75769e2c61c8c2062f400f3ec64e414c95bea390d8b4dca57826c809506", "EXACT_HTTP_RESPONSE_BODY_BYTES"],
  ["treasury-tfm-6-3100.html", "OFFICIAL_TREASURY_FINANCIAL_MANUAL_HTML",
    "https://tfx.treasury.gov/tfm/volume1/part6/chapter-3100-certifying-payments-and-recording-corresponding-intragovernmental", 87_927,
    "ef8ef247d963b78ac54ae470cadf65b1de0870b9ff67163fcded78b76f66b481", "EXACT_HTTP_RESPONSE_BODY_BYTES"],
  ["gao-copyright-rendered.html", "OFFICIAL_GAO_COPYRIGHT_TERMS_RENDERED_DOM",
    "https://www.gao.gov/copyright", 35_717,
    "65f7f0cbb47014ae486736214b052b055d2af5984b3c096356bb75c1ddd1467d", "BROWSER_RENDERED_DOCUMENT_OUTER_HTML"],
  ["gao-faq-rendered.html", "OFFICIAL_GAO_BID_PROTEST_FAQ_RENDERED_DOM",
    "https://www.gao.gov/legal/bid-protests/faqs", 70_374,
    "7fafa113f8f1b05f8bf5376fdf77d1ec6f067de234736ba1d5d2fc3ded713f9c", "BROWSER_RENDERED_DOCUMENT_OUTER_HTML"],
  ["gao-file-process-rendered.html", "OFFICIAL_GAO_FILING_PROCESS_RENDERED_DOM",
    "https://www.gao.gov/legal/bid-protests/file-a-bid-protest", 41_653,
    "9a5dcc6c149e1ffcae6ab0b3a43b0c4eabbd3de4963ea13cbf828f1c00d68c5f", "BROWSER_RENDERED_DOCUMENT_OUTER_HTML"],
  ["gao-fy2025-annual-report-rendered.html", "OFFICIAL_GAO_FY2025_ANNUAL_REPORT_RENDERED_DOM",
    "https://www.gao.gov/products/gao-26-900695", 82_276,
    "ef74426cd4d5bb5a04f2dfd5a44e2f25ba852985df0ec7f588dff8df2c4f5972", "BROWSER_RENDERED_DOCUMENT_OUTER_HTML"],
  ["gao-fy2025-annual-report.pdf", "OFFICIAL_GAO_FY2025_ANNUAL_REPORT_PDF",
    "https://www.gao.gov/assets/890/882727.pdf", 216_237,
    "66cd0b0b545d34c0c7b5aeef99c000bdfb1d3f16e9dc2d3ca1bc871cd66c6ee2", "BROWSER_DOWNLOAD_EXACT_FILE_BYTES"],
  ["gao-reference-materials-rendered.html", "OFFICIAL_GAO_REGULATIONS_AND_REFERENCE_RENDERED_DOM",
    "https://www.gao.gov/legal/bid-protests/reference-materials", 104_261,
    "5ff7eae5cf66fc19be42f27129eefe1f4e367d9e6e7b2e48a0447fffebcea371", "BROWSER_RENDERED_DOCUMENT_OUTER_HTML"],
].map(([filePath, kind, url, sizeBytes, hex, captureRepresentation]) => Object.freeze({
  path: filePath,
  lane: filePath.startsWith("gao-") ? "GAO_BID_PROTEST" : "TREASURY_JUDGMENT_FUND",
  kind, url, captureRepresentation,
  independentRedownloadByteStabilityEstablishedAtFreeze: false,
  sizeBytes,
  sha256: `sha256:${hex}`,
}));

export const JUDGMENT_FUND_GAO_SOURCE_PINS = Object.freeze(
  [...REPORTS, ...SUPPORT].map((pin) => Object.freeze({ ...pin })),
);

const EXPECTED_SOURCE_NAMES = Object.freeze(
  [ACQUISITION_FILE, ...JUDGMENT_FUND_GAO_SOURCE_PINS.map((pin) => pin.path)].sort(),
);

const EXPECTED_HEADERS = Object.freeze([
  "Responsible Agency Name", "*Claimant Name", "*Claimant Counsel",
  "Submitting Agency Name", "Principal Amount", "Principal Citation Code",
  "Principal Citation Code Description", "Attorney Fees Amount",
  "Attorney Fees Citation Code", "Attorney Fees Citation Code Description",
  "Cost Amount", "Cost Citation Code", "Cost Citation Code Description",
  "Interest Amount", "Interest Citation Code", "Interest Citation Code Description",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `JUDGMENT_FUND_GAO_${code}`
    : `JUDGMENT_FUND_GAO_${code}:${detail}`);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256Bytes(`${domain}\0${canonicalizeStrict(value)}`);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalTime(value) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    fail("TIME_INVALID");
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function sourcePinProjection(pin) {
  return {
    path: pin.path, lane: pin.lane, kind: pin.kind, url: pin.url,
    ...(pin.interval ? { interval: pin.interval } : {}),
    captureRepresentation: pin.captureRepresentation,
    independentRedownloadByteStabilityEstablishedAtFreeze:
      pin.independentRedownloadByteStabilityEstablishedAtFreeze,
    sizeBytes: pin.sizeBytes, sha256: pin.sha256,
  };
}

export function createJudgmentFundGaoAcquisitionManifest() {
  const objects = JUDGMENT_FUND_GAO_SOURCE_PINS.map(sourcePinProjection);
  return Object.freeze({
    schema: JUDGMENT_FUND_GAO_ACQUISITION_SCHEMA,
    sourceId: "TREASURY_JUDGMENT_FUND_2026_THROUGH_0731_AND_GAO_FY2025_20260821",
    freezeObservedAt: FREEZE_OBSERVED_AT,
    searchScope: "SYSTEMATIC_PRIMARY_SOURCE_WEB_AND_OPEN_DATA_PORTAL_SEARCH_NOT_LITERAL_EXHAUSTIVE_INTERNET",
    reportCoverage: Object.freeze({
      start: "2026-01-01", end: "2026-07-31", intervalCount: 14,
      contiguousWithoutGapOrOverlap: true,
      latestIntervalListedOnPublisherPageAsOfFreeze: true,
      publisherPageLastUpdated: "2026-08-13",
      augustFirstHalfReportPublishedByFreeze: false,
    }),
    sourceCount: objects.length,
    sourceBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
    independentRedownloadByteStabilityEstablishedObjectCount:
      objects.filter((object) => object.independentRedownloadByteStabilityEstablishedAtFreeze)
        .length,
    independentRedownloadByteStabilityNotEstablishedObjectCount:
      objects.filter((object) => !object.independentRedownloadByteStabilityEstablishedAtFreeze)
        .length,
    transportAttested: false,
    renderedDomSnapshotsAreOriginalHttpResponseBytes: false,
    rawPaymentSourcesAreGitignoredAndNotPackageDistributed: true,
    objects,
  });
}

export function serializeJudgmentFundGaoAcquisitionManifest() {
  return Buffer.from(`${JSON.stringify(createJudgmentFundGaoAcquisitionManifest())}\n`);
}

function stablePinnedRead(target, pin, maximumBytes = MAX_SOURCE_BYTES) {
  const beforePath = lstatSync(target, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink()
    || beforePath.size !== BigInt(pin.sizeBytes) || beforePath.size < 1n
    || beforePath.size > BigInt(maximumBytes)) fail("SOURCE_FILE_UNSAFE", pin.path);
  const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== beforePath[field]) {
        fail("SOURCE_FILE_CHANGED", pin.path);
      }
    }
    if (bytes.length !== pin.sizeBytes || sha256Bytes(bytes) !== pin.sha256) {
      fail("SOURCE_PIN_MISMATCH", pin.path);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
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

function readZipMembers(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? "");
  if (bytes.length < 22 || bytes.length > MAX_SOURCE_BYTES) fail("XLSX_BYTES_INVALID");
  let eocd = -1;
  const lower = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= lower; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) fail("XLSX_EOCD_MISSING");
  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const commentLength = bytes.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || entryCount !== diskEntries
    || entryCount < 8 || entryCount > 128 || eocd + 22 + commentLength !== bytes.length
    || centralOffset + centralSize !== eocd) fail("XLSX_CENTRAL_LAYOUT_INVALID");
  const members = new Map();
  let totalOutput = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      fail("XLSX_CENTRAL_ENTRY_INVALID", index);
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const outputSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const entryCommentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || diskStart !== 0
      || nameLength < 1 || next > eocd || outputSize > MAX_ZIP_ENTRY_BYTES
      || compressedSize > bytes.length) fail("XLSX_ENTRY_METADATA_INVALID", index);
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString("utf8");
    if (name.includes("\ufffd") || name.startsWith("/") || name.includes("\\")
      || name.split("/").includes("..") || name.includes("\0") || members.has(name)) {
      fail("XLSX_ENTRY_NAME_INVALID", index);
    }
    totalOutput += outputSize;
    if (totalOutput > MAX_ZIP_TOTAL_BYTES || localOffset + 30 > centralOffset
      || bytes.readUInt32LE(localOffset) !== 0x04034b50) fail("XLSX_ENTRY_BOUNDS_INVALID", name);
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localName = bytes.subarray(localOffset + 30,
      localOffset + 30 + localNameLength).toString("utf8");
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (localFlags !== flags || localMethod !== method || localName !== name
      || dataOffset + compressedSize > centralOffset) fail("XLSX_LOCAL_ENTRY_INVALID", name);
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const output = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, {
      maxOutputLength: MAX_ZIP_ENTRY_BYTES,
    });
    if (output.length !== outputSize || crc32(output) !== expectedCrc) {
      fail("XLSX_ENTRY_INTEGRITY_INVALID", name);
    }
    members.set(name, output);
    cursor = next;
  }
  if (cursor !== eocd) fail("XLSX_CENTRAL_TRAILING_BYTES");
  return members;
}

function decodeXml(value) {
  return String(value).replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|lt|gt|quot|apos);/giu,
    (token, numeric, named) => {
      if (numeric) {
        const code = numeric[0].toLowerCase() === "x"
          ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10);
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) fail("XML_ENTITY_INVALID");
        return String.fromCodePoint(code);
      }
      return ({ amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" })[named.toLowerCase()];
    });
}

function parseXmlAttributes(value) {
  const attributes = {};
  let consumed = "";
  for (const match of String(value).matchAll(/\s+([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/gu)) {
    if (Object.hasOwn(attributes, match[1])) fail("XML_ATTRIBUTE_DUPLICATE", match[1]);
    attributes[match[1]] = decodeXml(match[2]);
    consumed += match[0];
  }
  if (String(value).replace(consumed, "").trim() !== "") fail("XML_ATTRIBUTE_INVALID");
  return attributes;
}

function xmlString(bytes, code) {
  const text = Buffer.from(bytes ?? "").toString("utf8");
  if (text.includes("\ufffd") || text.includes("\0") || !text.startsWith("<?xml")) fail(code);
  return text;
}

function sharedStrings(xmlBytes) {
  const xml = xmlString(xmlBytes, "SHARED_STRINGS_XML_INVALID");
  const values = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)) {
    values.push([...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)]
      .map((part) => decodeXml(part[1])).join(""));
  }
  if (values.length < EXPECTED_HEADERS.length) fail("SHARED_STRINGS_EMPTY");
  return values;
}

function columnNumber(reference) {
  let number = 0;
  for (const character of reference) number = number * 26 + character.charCodeAt(0) - 64;
  return number;
}

function resolveWorksheet(members) {
  const workbook = xmlString(members.get("xl/workbook.xml"), "WORKBOOK_XML_INVALID");
  const relationships = xmlString(members.get("xl/_rels/workbook.xml.rels"),
    "WORKBOOK_RELATIONSHIPS_XML_INVALID");
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*?)(?:\/>|>[\s\S]*?<\/sheet>)/gu)]
    .map((match) => parseXmlAttributes(match[1]));
  if (sheets.length !== 1) fail("WORKBOOK_SHEET_COUNT_INVALID");
  const sheet = sheets[0];
  if (typeof sheet.name !== "string" || sheet.name.length < 1
    || !/^rId[1-9][0-9]*$/u.test(sheet["r:id"] ?? "")
    || (sheet.state !== undefined && sheet.state !== "visible")) fail("WORKBOOK_SHEET_INVALID");
  const rels = [...relationships.matchAll(
    /<Relationship\b([^>]*?)(?:\/>|>[\s\S]*?<\/Relationship>)/gu)]
    .map((match) => parseXmlAttributes(match[1]))
    .filter((attributes) => attributes.Id === sheet["r:id"]);
  if (rels.length !== 1 || !/\/relationships\/worksheet$/u.test(rels[0].Type ?? "")
    || rels[0].TargetMode !== undefined || typeof rels[0].Target !== "string") {
    fail("WORKBOOK_SHEET_RELATIONSHIP_INVALID");
  }
  const normalizedTarget = rels[0].Target.replaceAll("\\", "/");
  const member = path.posix.normalize(path.posix.join("xl", normalizedTarget));
  if (!/^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/u.test(member)
    || member.includes("../") || !members.has(member)) fail("WORKBOOK_SHEET_TARGET_INVALID");
  const filter = /<definedName name="_xlnm\._FilterDatabase"[^>]*>([^<]+)<\/definedName>/u
    .exec(workbook)?.[1] ?? null;
  const filterEnd = filter === null ? null
    : Number.parseInt(/\$[A-Z]+\$([0-9]+)$/u.exec(decodeXml(filter))?.[1] ?? "", 10);
  return { name: sheet.name, member, filterEnd: Number.isInteger(filterEnd) ? filterEnd : null };
}

function parseWorksheet(xmlBytes, strings) {
  const xml = xmlString(xmlBytes, "WORKSHEET_XML_INVALID");
  const formulaCellCount = (xml.match(/<f(?:\s|>)/gu) ?? []).length;
  const rows = [];
  let previousRow = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gu)) {
    const rowAttributes = parseXmlAttributes(rowMatch[1]);
    const rowNumber = Number.parseInt(rowAttributes.r ?? "", 10);
    if (!Number.isInteger(rowNumber) || rowNumber <= previousRow || rowNumber > 1_048_576) {
      fail("WORKSHEET_ROW_INVALID");
    }
    previousRow = rowNumber;
    const cells = new Map();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
      const attributes = parseXmlAttributes(cellMatch[1]);
      const referenceMatch = /^([A-Z]+)([1-9][0-9]*)$/u.exec(attributes.r ?? "");
      if (!referenceMatch || Number(referenceMatch[2]) !== rowNumber) fail("CELL_REFERENCE_INVALID");
      const column = columnNumber(referenceMatch[1]);
      if (column < 1 || column > 18 || cells.has(column)) fail("CELL_COLUMN_INVALID");
      const body = cellMatch[2] ?? "";
      const formulaMatches = [...body.matchAll(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>|<f(?:\s[^>]*)?\/>/gu)];
      if (formulaMatches.length > 0) fail("FORMULA_CELL_PROHIBITED");
      const valueMatches = [...body.matchAll(/<v>([\s\S]*?)<\/v>/gu)];
      if (valueMatches.length > 1 || body.includes("<is>")) fail("CELL_VALUE_SHAPE_INVALID");
      const raw = valueMatches.length === 0 ? null : decodeXml(valueMatches[0][1]);
      const type = attributes.t ?? null;
      let value = null;
      if (raw !== null) {
        if (type === "s") {
          if (!/^(0|[1-9][0-9]*)$/u.test(raw)) fail("SHARED_STRING_INDEX_INVALID");
          const index = Number(raw);
          if (!Number.isSafeInteger(index) || index >= strings.length) fail("SHARED_STRING_INDEX_INVALID");
          value = strings[index];
        } else if (type === null || type === "n") {
          if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[Ee][+-]?[0-9]+)?$/u.test(raw)) {
            fail("NUMERIC_CELL_INVALID");
          }
          const numeric = Number(raw);
          if (!Number.isFinite(numeric)) fail("NUMERIC_CELL_INVALID");
          value = Object.freeze({ numeric, raw });
        } else fail("CELL_TYPE_UNSUPPORTED", type);
      } else if (type !== null && type !== "s" && type !== "n") {
        fail("BLANK_CELL_TYPE_UNSUPPORTED", type);
      }
      cells.set(column, { value, type, raw });
    }
    rows.push({ rowNumber, cells });
  }
  return { rows, formulaCellCount };
}

function cellValue(row, column) {
  return row.cells.get(column)?.value ?? null;
}

function textCell(row, column, required = false) {
  const value = cellValue(row, column);
  if (value === null && !required) return null;
  if (typeof value !== "string" || (required && value.trim().length < 1)) {
    fail("TEXT_CELL_INVALID", `${row.rowNumber}:${column}`);
  }
  return value;
}

function moneyCell(row, column) {
  const value = cellValue(row, column);
  if (value === null || typeof value !== "object" || !Number.isFinite(value.numeric)
    || value.numeric < 0 || value.numeric > 99_999_999.99 + 1e-6) {
    fail("MONEY_CELL_INVALID", `${row.rowNumber}:${column}`);
  }
  const cents = Math.round(value.numeric * 100);
  const distance = Math.abs(value.numeric - cents / 100);
  if (!Number.isSafeInteger(cents) || distance > 1e-7) {
    fail("MONEY_CELL_NOT_CENT_RECONCILABLE", `${row.rowNumber}:${column}`);
  }
  return { cents, publisherRawNumeric: value.raw,
    publisherRawHasMoreThanTwoDecimalPlaces: /\.[0-9]{3,}/u.test(value.raw) };
}

function dateFromUs(value) {
  const match = /^(\d{1,2})\/(\d{2})\/(2026)$/u.exec(value);
  if (!match) fail("REPORT_DATE_INVALID", value);
  const result = `${match[3]}-${match[1].padStart(2, "0")}-${match[2]}`;
  if (new Date(`${result}T00:00:00.000Z`).toISOString().slice(0, 10) !== result) {
    fail("REPORT_DATE_INVALID", value);
  }
  return result;
}

function incrementAggregate(map, key, amounts) {
  const name = key === null || key.trim() === "" ? "[MISSING]" : key;
  const row = map.get(name) ?? { name, paymentComponentRows: 0,
    principalAmountCents: 0, attorneyFeesAmountCents: 0,
    costAmountCents: 0, interestAmountCents: 0, totalPublishedAmountCents: 0 };
  row.paymentComponentRows += 1;
  row.principalAmountCents += amounts.principalAmountCents;
  row.attorneyFeesAmountCents += amounts.attorneyFeesAmountCents;
  row.costAmountCents += amounts.costAmountCents;
  row.interestAmountCents += amounts.interestAmountCents;
  row.totalPublishedAmountCents += amounts.totalPublishedAmountCents;
  map.set(name, row);
}

function sortedAggregates(map) {
  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name, "en"));
}

function projectWorkbook(bytes, expectedInterval = null) {
  const members = readZipMembers(bytes);
  for (const required of ["xl/workbook.xml", "xl/_rels/workbook.xml.rels",
    "xl/sharedStrings.xml"]) if (!members.has(required)) fail("XLSX_MEMBER_MISSING", required);
  if ([...members.keys()].some((name) => /(?:vbaProject|externalLinks|connections\.xml)/iu.test(name))) {
    fail("XLSX_ACTIVE_OR_EXTERNAL_CONTENT_PROHIBITED");
  }
  const worksheet = resolveWorksheet(members);
  const strings = sharedStrings(members.get("xl/sharedStrings.xml"));
  const parsed = parseWorksheet(members.get(worksheet.member), strings);
  if (parsed.formulaCellCount !== 0) fail("FORMULA_CELL_PROHIBITED");
  const headerRow = parsed.rows.find((row) => row.rowNumber === 5);
  if (!headerRow || !same(EXPECTED_HEADERS,
    EXPECTED_HEADERS.map((unused, index) => textCell(headerRow, index + 1, true)))) {
    fail("WORKBOOK_HEADERS_INVALID");
  }
  const rangeStrings = strings.filter((value) => value.includes("Date Range:"));
  const createdStrings = strings.filter((value) => value.includes("Report Created on:"));
  if (rangeStrings.length !== 1 || createdStrings.length !== 1) fail("REPORT_SCOPE_STRING_INVALID");
  const rangeMatch = /Date Range:\s*(\d{1,2}\/\d{2}\/2026)\s+to\s+(\d{1,2}\/\d{2}\/2026)/u
    .exec(rangeStrings[0]);
  const createdMatch = /Report Created on:\s*(\d{1,2}\/\d{1,2}\/2026)/u.exec(createdStrings[0]);
  if (!rangeMatch || !createdMatch) fail("REPORT_SCOPE_STRING_INVALID");
  const interval = { start: dateFromUs(rangeMatch[1]), end: dateFromUs(rangeMatch[2]) };
  const createdOnParts = /^(\d{1,2})\/(\d{1,2})\/(2026)$/u.exec(createdMatch[1]);
  const reportCreatedOn = `${createdOnParts[3]}-${createdOnParts[1].padStart(2, "0")}-${createdOnParts[2].padStart(2, "0")}`;
  if (new Date(`${reportCreatedOn}T00:00:00.000Z`).toISOString().slice(0, 10)
    !== reportCreatedOn || (expectedInterval && !same(interval, expectedInterval))) {
    fail("REPORT_SCOPE_MISMATCH");
  }
  const candidateRows = [];
  let publisherPrivacyFootnoteRows = 0;
  const privacyFootnote = "*Please note: Individual names have been redacted pursuant to the Privacy Act, 5 USC 552a";
  for (const row of parsed.rows.filter((candidate) => candidate.rowNumber >= 6)) {
    const populatedColumns = [...row.cells.entries()]
      .filter((entry) => entry[1].value !== null).map((entry) => entry[0]);
    if (populatedColumns.length === 0) continue;
    if (textCell(row, 1, false) === privacyFootnote
      && populatedColumns.every((column) => column === 1)) {
      publisherPrivacyFootnoteRows += 1;
      continue;
    }
    textCell(row, 1, true);
    textCell(row, 4, true);
    if (![5, 8, 11, 14].every((column) => cellValue(row, column) !== null)) {
      fail("INCOMPLETE_PAYMENT_ROW", row.rowNumber);
    }
    candidateRows.push(row);
  }
  if (publisherPrivacyFootnoteRows !== 1) fail("PRIVACY_FOOTNOTE_COUNT_INVALID");
  if (candidateRows.length < 1) fail("PAYMENT_ROWS_EMPTY");
  const responsible = new Map();
  const submitting = new Map();
  const principalCitations = new Map();
  const fullRowCounts = new Map();
  let principalAmountCents = 0;
  let attorneyFeesAmountCents = 0;
  let costAmountCents = 0;
  let interestAmountCents = 0;
  let zeroTotalRows = 0;
  let rawPrecisionAnomalyCells = 0;
  let rowsOutsideWorkbookFilter = 0;
  for (const row of candidateRows) {
    for (let column = 17; column <= 18; column += 1) {
      if (cellValue(row, column) !== null) fail("NON_SEMANTIC_COLUMN_VALUE_PRESENT");
    }
    const principal = moneyCell(row, 5);
    const attorney = moneyCell(row, 8);
    const cost = moneyCell(row, 11);
    const interest = moneyCell(row, 14);
    const amounts = {
      principalAmountCents: principal.cents,
      attorneyFeesAmountCents: attorney.cents,
      costAmountCents: cost.cents,
      interestAmountCents: interest.cents,
      totalPublishedAmountCents: principal.cents + attorney.cents + cost.cents + interest.cents,
    };
    if (!Number.isSafeInteger(amounts.totalPublishedAmountCents)) fail("ROW_TOTAL_UNSAFE");
    principalAmountCents += principal.cents;
    attorneyFeesAmountCents += attorney.cents;
    costAmountCents += cost.cents;
    interestAmountCents += interest.cents;
    if (amounts.totalPublishedAmountCents === 0) zeroTotalRows += 1;
    rawPrecisionAnomalyCells += [principal, attorney, cost, interest]
      .filter((value) => value.publisherRawHasMoreThanTwoDecimalPlaces).length;
    if (worksheet.filterEnd !== null && row.rowNumber > worksheet.filterEnd) {
      rowsOutsideWorkbookFilter += 1;
    }
    incrementAggregate(responsible, textCell(row, 1, true), amounts);
    incrementAggregate(submitting, textCell(row, 4, true), amounts);
    const citationCode = textCell(row, 6, false) ?? "[MISSING]";
    const citationDescription = textCell(row, 7, false) ?? "[MISSING]";
    incrementAggregate(principalCitations, `${citationCode} | ${citationDescription}`, amounts);
    const fullRawRow = [];
    for (let column = 1; column <= 16; column += 1) {
      const value = cellValue(row, column);
      fullRawRow.push(value && typeof value === "object" ? value.raw : value);
    }
    const rawKey = canonicalizeStrict(fullRawRow);
    fullRowCounts.set(rawKey, (fullRowCounts.get(rawKey) ?? 0) + 1);
  }
  const totalPublishedAmountCents = principalAmountCents + attorneyFeesAmountCents
    + costAmountCents + interestAmountCents;
  for (const value of [principalAmountCents, attorneyFeesAmountCents, costAmountCents,
    interestAmountCents, totalPublishedAmountCents]) {
    if (!Number.isSafeInteger(value)) fail("AGGREGATE_TOTAL_UNSAFE");
  }
  return {
    worksheetName: worksheet.name,
    worksheetMember: worksheet.member,
    reportInterval: interval,
    reportCreatedOn,
    workbookFilterLastRow: worksheet.filterEnd,
    lastParsedPaymentRow: candidateRows.at(-1).rowNumber,
    paymentComponentRows: candidateRows.length,
    rowsOutsideWorkbookFilter,
    zeroTotalPublishedAmountRows: zeroTotalRows,
    rawNumericCellsWithMoreThanTwoDecimalPlaces: rawPrecisionAnomalyCells,
    formulaCellCount: parsed.formulaCellCount,
    formulaCachedValueUsed: false,
    unsupportedTypedCellCount: 0,
    amounts: { currency: "USD", principalAmountCents, attorneyFeesAmountCents,
      costAmountCents, interestAmountCents, totalPublishedAmountCents },
    responsibleAgencyAggregates: sortedAggregates(responsible),
    submittingAgencyAggregates: sortedAggregates(submitting),
    principalCitationAggregates: sortedAggregates(principalCitations),
    exactFullRawRowsRepeatedOccurrences: [...fullRowCounts.values()]
      .reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    privacyProjection: {
      claimantNamesPersisted: false,
      claimantCounselPersisted: false,
      factNarrativesPersisted: false,
      claimantOrCounselFingerprintsPersisted: false,
      rawRowsOrRawRowFingerprintsPersisted: false,
    },
  };
}

/**
 * Parse workbook mechanics without recognizing a publisher, a real payment,
 * legal rights, or official provenance.  Official recognition requires the
 * complete pinned directory and acquisition manifest.
 */
export function inspectGenericJudgmentFundWorkbookShape(workbookBytes) {
  const projection = projectWorkbook(workbookBytes);
  return Object.freeze({
    workbookShapeParsed: true,
    worksheetName: projection.worksheetName,
    paymentLikeRows: projection.paymentComponentRows,
    formulaCellCount: projection.formulaCellCount,
    publisherIdentityEstablished: false,
    officialSourceByteIdentityEstablished: false,
    realPaymentStatusEstablished: false,
    finalityEstablished: false,
    rightsEstablished: false,
    trainingPermissionEstablished: false,
    outsiderAuthorityEstablished: false,
  });
}

function validateOfficialPages(source) {
  const text = (name) => source.get(name).toString("utf8");
  const requireAll = (name, needles) => {
    const value = text(name);
    if (value.includes("\ufffd") || needles.some((needle) => !value.includes(needle))) {
      fail("OFFICIAL_PAGE_SEMANTICS_MISSING", name);
    }
  };
  requireAll("treasury-biweekly-index.html", [
    "Range: 01/01/2026 - 01/15/2026", "Range: 07/16/2026 - 07/31/2026",
    "Last Updated:", "August 13, 2026", "Individual names have been redacted",
  ]);
  for (const report of REPORTS) {
    if (!text("treasury-biweekly-index.html").includes(new URL(report.url).pathname)) {
      fail("REPORT_NOT_LISTED_ON_INDEX", report.path);
    }
  }
  requireAll("treasury-award-payment-process.html", [
    "only administers the Fund, it does not review or evaluate the merits",
    "the judgment or settlement is final", "certified payment voucher to the disbursing official",
    "The disbursing official pays the money according to the voucher",
  ]);
  requireAll("treasury-faq.html", [
    "Awards or settlements are final", "same control number",
    "offsets Judgment Fund payments", "usually processed in two weeks",
  ]);
  requireAll("treasury-offsets.html", [
    "Setoff Against Judgment", "Administrative Offset", "certifying official",
    "disbursing official level, after a payment has been certified",
  ]);
  requireAll("treasury-forms.html", [
    "The Judgment Fund accepts Form 197", "All older versions of Form 197 and any other forms are no longer being used",
    "Only an authorized official may ask that the Judgment Fund pay",
  ]);
  requireAll("treasury-regulations.html", ["31 CFR Part 256", "currently Form 196",
    "must provide the TIN(s) of the person(s) legally entitled to the payment from the Judgment Fund on Form 197"]);
  requireAll("gao-fy2025-annual-report-rendered.html", [
    "GAO-26-900695", "During the 2025 fiscal year, we received 1,688 cases",
    "We closed 1,737 cases", "sustained 14 percent", "one federal agency declined to implement",
    "issued final decisions within 100 days for all protests filed with GAO",
  ]);
  requireAll("gao-faq-rendered.html", [
    "We do not make public routine dismissals of protests",
    "Corrective action is an agency’s voluntary decision",
    "The agency must then advise us whether it will comply with the recommendation",
  ]);
  requireAll("gao-reference-materials-rendered.html", ["Bid Protest Regulations",
    "Interested party", "Distribution of decisions"]);
  requireAll("gao-file-process-rendered.html", ["Electronic Protest Docketing System", "$500"]);
  requireAll("gao-copyright-rendered.html", [
    "not protected by copyright law in the United States",
    "may contain copyrighted images or other material",
  ]);
  for (const name of ["31cfr256.pdf", "form-197.pdf",
    "gao-fy2025-annual-report.pdf"]) {
    if (!source.get(name).subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      fail("PDF_MAGIC_INVALID", name);
    }
  }
}

function validateSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length < 1) {
    fail("SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) fail("SOURCE_DIRECTORY_TOO_BROAD");
  const directoryBefore = lstatSync(directory, { bigint: true });
  if (!directoryBefore.isDirectory() || directoryBefore.isSymbolicLink()) {
    fail("SOURCE_DIRECTORY_UNSAFE");
  }
  const beforeNames = readdirSync(directory).sort();
  if (!same(beforeNames, EXPECTED_SOURCE_NAMES)) fail("SOURCE_FILE_SET_INVALID");
  const source = new Map();
  for (const pin of JUDGMENT_FUND_GAO_SOURCE_PINS) {
    source.set(pin.path, stablePinnedRead(path.join(directory, pin.path), pin));
  }
  const expectedAcquisitionBytes = serializeJudgmentFundGaoAcquisitionManifest();
  const acquisitionBytes = stablePinnedRead(path.join(directory, ACQUISITION_FILE), {
    path: ACQUISITION_FILE,
    sizeBytes: expectedAcquisitionBytes.length,
    sha256: sha256Bytes(expectedAcquisitionBytes),
  }, 512 * 1024);
  if (!acquisitionBytes.equals(expectedAcquisitionBytes)) fail("ACQUISITION_MANIFEST_INVALID");
  const afterNames = readdirSync(directory).sort();
  const directoryAfter = lstatSync(directory, { bigint: true });
  if (!same(afterNames, EXPECTED_SOURCE_NAMES)
    || directoryBefore.dev !== directoryAfter.dev || directoryBefore.ino !== directoryAfter.ino) {
    fail("SOURCE_DIRECTORY_CHANGED");
  }
  validateOfficialPages(source);
  return { source, acquisitionBytes };
}

function renderedHtmlText(fragment) {
  return String(fragment).replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/giu, " ")
    .replace(/&amp;/giu, "&").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, "\"").replace(/&apos;/giu, "'")
    .replace(/\s+/gu, " ").trim();
}

function gaoInteger(value, code) {
  const match = /^([0-9][0-9,]*)/u.exec(value);
  if (!match) fail(code);
  const number = Number(match[1].replaceAll(",", ""));
  if (!Number.isSafeInteger(number) || number < 0) fail(code);
  return number;
}

function parseGaoAnnualAggregate(htmlBytes) {
  const html = Buffer.from(htmlBytes).toString("utf8");
  if (html.includes("\ufffd")) fail("GAO_ANNUAL_HTML_INVALID");
  const text = renderedHtmlText(html);
  const filing = /During the 2025 fiscal year, we received ([0-9,]+) cases: ([0-9,]+) protests, ([0-9,]+) cost claims, and ([0-9,]+) requests for reconsideration\. We closed ([0-9,]+) cases during the fiscal year: ([0-9,]+) protests, ([0-9,]+) cost claims, and ([0-9,]+) requests for reconsideration\. Of the [0-9,]+ cases closed, ([0-9,]+) were attributable to GAO's bid protest jurisdiction over task orders\./u.exec(text);
  if (!filing) fail("GAO_FILING_AGGREGATE_PARSE_INVALID");
  const values = filing.slice(1).map((value) => gaoInteger(value,
    "GAO_FILING_AGGREGATE_PARSE_INVALID"));
  const [casesFiled, protestsFiled, costClaimsFiled, reconsiderationRequestsFiled,
    casesClosed, protestsClosed, costClaimsClosed, reconsiderationRequestsClosed,
    taskOrderCasesClosed] = values;
  if (casesFiled !== protestsFiled + costClaimsFiled + reconsiderationRequestsFiled
    || casesClosed !== protestsClosed + costClaimsClosed + reconsiderationRequestsClosed) {
    fail("GAO_FILING_AGGREGATE_ARITHMETIC_INVALID");
  }
  const tableMatch = /<h2[^>]*>Bid Protest Statistics for Fiscal Years 2021-2025<\/h2>\s*(<table>[\s\S]*?<\/table>)/u.exec(html);
  if (!tableMatch) fail("GAO_STATISTICS_TABLE_MISSING");
  const firstCells = new Map();
  for (const rowMatch of tableMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gu)) {
    const cells = [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gu)]
      .map((match) => renderedHtmlText(match[1]));
    if (cells.length >= 2 && cells[0].length > 0) firstCells.set(cells[0], cells[1]);
  }
  const cell = (prefix) => {
    const matches = [...firstCells].filter(([label]) => label.startsWith(prefix));
    if (matches.length !== 1) fail("GAO_STATISTICS_ROW_INVALID", prefix);
    return matches[0][1];
  };
  const tableCasesFiled = gaoInteger(cell("Cases Filed"), "GAO_CASES_FILED_INVALID");
  const tableCasesClosed = gaoInteger(cell("Cases Closed"), "GAO_CASES_CLOSED_INVALID");
  const meritDecisions = gaoInteger(cell("Merit (Sustain + Deny) Decisions"),
    "GAO_MERIT_DECISIONS_INVALID");
  const sustains = gaoInteger(cell("Number of Sustains"), "GAO_SUSTAINS_INVALID");
  const percent = (prefix, code) => {
    const match = /^([0-9]*\.?[0-9]+)%/u.exec(cell(prefix));
    if (!match || !Number.isFinite(Number(match[1]))) fail(code);
    return Number(match[1]);
  };
  const publisherRoundedSustainRatePercent = percent("Sustain Rate",
    "GAO_SUSTAIN_RATE_INVALID");
  const publisherEffectivenessRatePercent = percent("Effectiveness Rate",
    "GAO_EFFECTIVENESS_RATE_INVALID");
  const adrCasesUsed = gaoInteger(cell("ADR [8] (cases used)"), "GAO_ADR_CASES_INVALID");
  const publisherRoundedAdrSuccessRatePercent = percent("ADR Success Rate",
    "GAO_ADR_SUCCESS_RATE_INVALID");
  const hearingCell = cell("Hearings");
  const hearingPercentMatch = /^([0-9]*\.?[0-9]+)%/u.exec(hearingCell);
  const hearingCountMatch = /\(([0-9,]+) cases?\)/u.exec(hearingCell);
  const publisherRoundedHearingsPercentOfFullyDevelopedCases = Number(
    hearingPercentMatch?.[1]);
  const hearings = hearingCountMatch === null ? Number.NaN
    : Number(hearingCountMatch[1].replaceAll(",", ""));
  if (!Number.isFinite(publisherRoundedHearingsPercentOfFullyDevelopedCases)
    || !Number.isSafeInteger(hearings) || hearings < 0 || tableCasesFiled !== casesFiled
    || tableCasesClosed !== casesClosed
    || !text.includes("During fiscal year 2025, we issued final decisions within 100 days for all protests filed with GAO.")
    || !text.includes("For fiscal year 2025, one federal agency declined to implement the recommendations")) {
    fail("GAO_ANNUAL_AGGREGATE_CROSSCHECK_INVALID");
  }
  return {
    casesFiled, protestsFiled, costClaimsFiled, reconsiderationRequestsFiled,
    casesClosed, protestsClosed, costClaimsClosed, reconsiderationRequestsClosed,
    taskOrderCasesClosed, meritDecisions, sustains,
    recomputedSustainRatePercent: sustains / meritDecisions * 100,
    publisherRoundedSustainRatePercent,
    publisherEffectivenessRatePercent,
    adrCasesUsed, publisherRoundedAdrSuccessRatePercent,
    hearings, publisherRoundedHearingsPercentOfFullyDevelopedCases,
    finalDecisionsOverOneHundredDays: 0,
    agencyNonimplementationInstancesReported: 1,
  };
}

function mergeAggregateRows(projections, field) {
  const output = new Map();
  for (const projection of projections) {
    for (const row of projection[field]) {
      const current = output.get(row.name) ?? { name: row.name, paymentComponentRows: 0,
        principalAmountCents: 0, attorneyFeesAmountCents: 0,
        costAmountCents: 0, interestAmountCents: 0, totalPublishedAmountCents: 0 };
      for (const key of ["paymentComponentRows", "principalAmountCents",
        "attorneyFeesAmountCents", "costAmountCents", "interestAmountCents",
        "totalPublishedAmountCents"]) current[key] += row[key];
      output.set(row.name, current);
    }
  }
  return sortedAggregates(output);
}

function buildArtifact(sourceDirectory, generatedAt) {
  const snapshot = validateSourceDirectory(sourceDirectory);
  const reportProjections = REPORTS.map((report) => ({
    report,
    projection: projectWorkbook(snapshot.source.get(report.path), report.interval),
  }));
  for (let index = 1; index < reportProjections.length; index += 1) {
    const prior = new Date(`${reportProjections[index - 1].projection.reportInterval.end}T00:00:00.000Z`);
    prior.setUTCDate(prior.getUTCDate() + 1);
    if (prior.toISOString().slice(0, 10) !== reportProjections[index].projection.reportInterval.start) {
      fail("REPORT_INTERVAL_GAP_OR_OVERLAP");
    }
  }
  const projections = reportProjections.map((row) => row.projection);
  const totals = projections.reduce((result, projection) => {
    result.paymentComponentRows += projection.paymentComponentRows;
    result.zeroTotalPublishedAmountRows += projection.zeroTotalPublishedAmountRows;
    result.rowsOutsideWorkbookFilter += projection.rowsOutsideWorkbookFilter;
    result.rawNumericCellsWithMoreThanTwoDecimalPlaces +=
      projection.rawNumericCellsWithMoreThanTwoDecimalPlaces;
    result.exactFullRawRowsRepeatedOccurrencesWithinReports +=
      projection.exactFullRawRowsRepeatedOccurrences;
    for (const key of ["principalAmountCents", "attorneyFeesAmountCents",
      "costAmountCents", "interestAmountCents", "totalPublishedAmountCents"]) {
      result.amounts[key] += projection.amounts[key];
    }
    return result;
  }, {
    paymentComponentRows: 0, zeroTotalPublishedAmountRows: 0,
    rowsOutsideWorkbookFilter: 0, rawNumericCellsWithMoreThanTwoDecimalPlaces: 0,
    exactFullRawRowsRepeatedOccurrencesWithinReports: 0,
    amounts: { currency: "USD", principalAmountCents: 0, attorneyFeesAmountCents: 0,
      costAmountCents: 0, interestAmountCents: 0, totalPublishedAmountCents: 0 },
  });
  const manifest = createJudgmentFundGaoAcquisitionManifest();
  const sourceObjects = JUDGMENT_FUND_GAO_SOURCE_PINS.map(sourcePinProjection);
  const gaoAnnualAggregate = parseGaoAnnualAggregate(
    snapshot.source.get("gao-fy2025-annual-report-rendered.html"));
  const body = {
    schema: JUDGMENT_FUND_GAO_REAL_CASES_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: canonicalTime(generatedAt),
    generatedAtTrust: "SELF_ASSERTED_LOCAL_TIME",
    sourceBinding: {
      sourceId: manifest.sourceId,
      sourceObjects,
      sourceObjectSetHash: domainHash("outsider:judgment-fund-gao-source-set:v1", sourceObjects),
      acquisitionManifestSha256: sha256Bytes(snapshot.acquisitionBytes),
      independentRedownloadByteStabilityEstablishedObjectCount: 14,
      independentRedownloadByteStabilityNotEstablishedObjectCount:
        sourceObjects.length - 14,
      sourceArtifactsReverifiedByStandaloneArtifact: false,
      officialPublisherIdentityRequiresFullSourceReplay: true,
      collectionTransportAttested: false,
    },
    treasuryJudgmentFund: {
      realityStatus: "REAL_INSTITUTIONAL_PAYMENT_OPERATION",
      publisher: "U.S. Department of the Treasury, Bureau of the Fiscal Service",
      snapshot: { start: "2026-01-01", end: "2026-07-31", reportIntervals: 14,
        latestFullyPublishedIntervalAtFreeze: true, rightCensoredAfter: "2026-07-31" },
      reports: reportProjections.map(({ report, projection }) => ({
        sourcePath: report.path, sourceSha256: report.sha256,
        worksheetName: projection.worksheetName, worksheetMember: projection.worksheetMember,
        reportInterval: projection.reportInterval, reportCreatedOn: projection.reportCreatedOn,
        workbookFilterLastRow: projection.workbookFilterLastRow,
        lastParsedPaymentRow: projection.lastParsedPaymentRow,
        paymentComponentRows: projection.paymentComponentRows,
        rowsOutsideWorkbookFilter: projection.rowsOutsideWorkbookFilter,
        zeroTotalPublishedAmountRows: projection.zeroTotalPublishedAmountRows,
        rawNumericCellsWithMoreThanTwoDecimalPlaces:
          projection.rawNumericCellsWithMoreThanTwoDecimalPlaces,
        formulaCellCount: projection.formulaCellCount,
        formulaCachedValueUsed: projection.formulaCachedValueUsed,
        unsupportedTypedCellCount: projection.unsupportedTypedCellCount,
        amounts: projection.amounts,
      })),
      totals,
      responsibleAgencyAggregates: mergeAggregateRows(projections,
        "responsibleAgencyAggregates"),
      submittingAgencyAggregates: mergeAggregateRows(projections,
        "submittingAgencyAggregates"),
      principalCitationAggregates: mergeAggregateRows(projections,
        "principalCitationAggregates"),
      amountAndUnitBoundary: {
        workbookRowsArePublishedPaymentComponentsNotUniqueClaims: true,
        claimsAtOrAboveOneHundredMillionMayBeSplitAcrossComponents: true,
        controlNumberNeededToRecombineButAbsentFromWorkbookProjection: true,
        paymentComponentRowCountIsClaimCount: false,
        paymentComponentRowCountIsAffectedPopulationExposure: false,
        publishedAmountsAreIndividualEconomicLoss: false,
        publishedAmountsNetOfAllOffsetsIdentifiablePerRow: false,
        recipientBankSettlementObservedPerRow: false,
        claimantAcceptanceObservedPerRow: false,
        completeRecoveryObservedPerRow: false,
      },
      certificationCustodyAndDisbursementBoundary: {
        judgmentOrSettlementMustBeFinalForCertification: true,
        fiscalServiceAdministersFundButDoesNotReviewOrEvaluateMerits: true,
        judgmentFundSectionChecksProperFundingSourceAndCertifiesVoucher: true,
        judgmentDebtSetoffOccursAtCertificationLevel: true,
        administrativeOffsetOccursAtDisbursingLevelAfterCertification: true,
        disbursingOfficialPaysAccordingToCertifiedVoucher: true,
        certificationIsDisbursement: false,
        disbursementIsRecipientRecoveryOrAcceptance: false,
        thisProcessIsOutsiderCustodyOrPaymentRail: false,
      },
      privacyProjection: {
        rawReportsContainClaimantAndCounselColumns: true,
        publisherStatesIndividualNamesRedactedUnderPrivacyAct: true,
        entityAndCounselNamesCanRemainInRawReports: true,
        rawReportFilesRemainGitignored: true,
        claimantNamesPersistedInArtifact: false,
        claimantCounselPersistedInArtifact: false,
        factNarrativesPersistedInArtifact: false,
        claimantCounselOrRawRowFingerprintsPersistedInArtifact: false,
        deterministicPseudonymousCaseLinksCreated: false,
      },
      revisionAndDedupBoundary: {
        currentPublisherSnapshotOnly: true,
        allFourteenWorkbooksByteStableAcrossIndependentRedownloadAtFreeze: true,
        publisherRevisionHistoryAvailable: false,
        publisherVersionIdentifiersAvailable: false,
        exactRepeatedRawRowsCountedButNotPersistedOrDeduplicated: true,
        repeatedRowsMayRepresentDistinctComponentsOrPayees: true,
        recordsDeduplicated: 0,
        crossIntervalClaimLinkageAttempted: false,
        workbookFilterRangeTreatedAsCompletenessBoundary: false,
        semanticPaymentRowsOutsidePublisherFilterIncludedAndCounted: true,
      },
    },
    gaoBidProtest: {
      realityStatus: "REAL_INSTITUTIONAL_ADJUDICATION_EXPERIENCE_AGGREGATE",
      publisher: "U.S. Government Accountability Office",
      fiscalYear: 2025,
      annualAggregate: gaoAnnualAggregate,
      denominatorAndOutcomeBoundary: {
        casesAreDocketNumbersNotUniqueProcurements: true,
        casesIncludeProtestsCostClaimsAndReconsiderationRequests: true,
        filedAndClosedCohortsNeedNotBeSameCases: true,
        effectivenessRateMeansSomeReliefReportedToGaoFromCorrectiveActionOrSustain: true,
        effectivenessRateNumeratorNotPublishedInAnnualTable: true,
        adrSuccessNumeratorNotPublishedInAnnualTable: true,
        hearingDenominatorNotPublishedInAnnualTable: true,
        routineDismissalsNotMadePublic: true,
        agencyCorrectiveActionReasonsNeedNotBeReported: true,
        publicDecisionCorpusCompleteForAllClosures: false,
      },
      adjudicationAndConsequenceBoundary: {
        gaoForumIndependentFromProcuringAgency: true,
        gaoIsArticleThreeJudiciary: false,
        gaoDecisionIsJudicialFinality: false,
        sustainRecommendationIsSelfExecuting: false,
        agencyMustAdviseWhetherItWillComply: true,
        realNonimplementationCounterexampleObservedInAnnualReport: true,
        recommendationEqualsImplementation: false,
        reliefEqualsFullEconomicRecovery: false,
        gaoAuthorityIsOutsiderAuthority: false,
      },
      decisionSample: {
        included: false,
        reason: "NO_BOUNDED_OUTCOME_NEUTRAL_COMPLETE_PUBLIC_DECISION_SAMPLE; ROUTINE_DISMISSALS_ARE_NOT_PUBLIC_AND_ANNUAL_REPORT_EXEMPLARS_ARE_SUSTAIN_SELECTED",
        outcomeLeakageAvoided: true,
      },
    },
    qualityAndRightsBoundary: {
      publicOriginAutomaticallyDowngradesReality: false,
      outsiderCollectionAutomaticallyUpgradesReality: false,
      sourceByteIdentityAndPublisherSemanticsReplayedByFullVerifier: true,
      gaoRenderedDomSnapshotsAreOriginalHttpResponseBytes: false,
      gaoPdfAndTreasuryFilesHaveExactBytePins: true,
      treasuryDisclosureMandatedByPublicLawReferencedOnPublisherPage: true,
      gaoProductsNotProtectedByUsCopyrightSubjectToThirdPartyMaterialCaveat: true,
      publicAccessIsAutomaticTrainingPermission: false,
      legalReuseRightsForAutomaticTrainingEstablished: false,
      rawSourceRedistributionByPackageAuthorized: false,
      targetDomainTransferEstablished: false,
    },
    stageContribution: {
      stage3: {
        realPublicCapitalDisbursementAndOffsetProcessReference: true,
        realPaymentAmountComponentExperienceReference: true,
        outsiderCapitalAdequacyEstablished: false,
        outsiderCustodyOrLicensedPaymentRailEstablished: false,
      },
      stage4: {
        realExternalToProcuringAgencyAdministrativeReviewReference: true,
        realRecommendationNonimplementationConsequenceReference: true,
        outsiderStandingAdjudicationSettlementOrClosureAuthorityEstablished: false,
      },
    },
    authority: {
      automaticTrainingEligible: false,
      PRICE: false, GUARANTEE: false, CAPITALIZE: false, CUSTODY: false,
      PAY: false, SETTLE: false, CLOSE: false, REOPEN: false,
      affectedPartyStandingGranted: false,
      ownerGateInputEligible: false,
    },
  };
  return Object.freeze({ ...body,
    artifactHash: domainHash("outsider:judgment-fund-gao-real-cases:v1", body) });
}

export function buildJudgmentFundGaoRealCasesFromSourceDirectory(sourceDirectory, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    fail("BUILD_OPTIONS_INVALID");
  }
  return buildArtifact(sourceDirectory, options.generatedAt ?? DEFAULT_GENERATED_AT);
}

function validateAggregateRow(row) {
  if (!exactKeys(row, ["name", "paymentComponentRows", "principalAmountCents",
    "attorneyFeesAmountCents", "costAmountCents", "interestAmountCents",
    "totalPublishedAmountCents"]) || typeof row.name !== "string" || row.name.length < 1
    || row.name.length > 1_024) fail("AGGREGATE_ROW_SHAPE_INVALID");
  for (const key of ["paymentComponentRows", "principalAmountCents",
    "attorneyFeesAmountCents", "costAmountCents", "interestAmountCents",
    "totalPublishedAmountCents"]) {
    if (!Number.isSafeInteger(row[key]) || row[key] < 0) fail("AGGREGATE_ROW_VALUE_INVALID");
  }
  if (row.totalPublishedAmountCents !== row.principalAmountCents
    + row.attorneyFeesAmountCents + row.costAmountCents + row.interestAmountCents) {
    fail("AGGREGATE_ROW_ARITHMETIC_INVALID");
  }
}

function requireExact(value, expected, code) {
  if (!same(value, expected)) fail(code);
}

const AMOUNT_KEYS = Object.freeze(["currency", "principalAmountCents",
  "attorneyFeesAmountCents", "costAmountCents", "interestAmountCents",
  "totalPublishedAmountCents"]);

function validateAmounts(amounts, code = "AMOUNTS_INVALID") {
  if (!exactKeys(amounts, AMOUNT_KEYS) || amounts.currency !== "USD") fail(code);
  for (const key of AMOUNT_KEYS.slice(1)) {
    if (!Number.isSafeInteger(amounts[key]) || amounts[key] < 0) fail(code);
  }
  if (amounts.totalPublishedAmountCents !== amounts.principalAmountCents
    + amounts.attorneyFeesAmountCents + amounts.costAmountCents
    + amounts.interestAmountCents) fail(code);
}

function validateDateOnly(value, code) {
  if (typeof value !== "string" || !/^2026-[0-1][0-9]-[0-3][0-9]$/u.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) fail(code);
}

function validateAggregateArray(rows, expectedTotals, code) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 1_000) fail(code);
  const sums = { paymentComponentRows: 0, principalAmountCents: 0,
    attorneyFeesAmountCents: 0, costAmountCents: 0, interestAmountCents: 0,
    totalPublishedAmountCents: 0 };
  let previousName = null;
  for (const row of rows) {
    validateAggregateRow(row);
    if (previousName !== null && previousName.localeCompare(row.name, "en") >= 0) fail(code);
    previousName = row.name;
    for (const key of Object.keys(sums)) {
      sums[key] += row[key];
      if (!Number.isSafeInteger(sums[key])) fail(code);
    }
  }
  requireExact(sums, {
    paymentComponentRows: expectedTotals.paymentComponentRows,
    principalAmountCents: expectedTotals.amounts.principalAmountCents,
    attorneyFeesAmountCents: expectedTotals.amounts.attorneyFeesAmountCents,
    costAmountCents: expectedTotals.amounts.costAmountCents,
    interestAmountCents: expectedTotals.amounts.interestAmountCents,
    totalPublishedAmountCents: expectedTotals.amounts.totalPublishedAmountCents,
  }, code);
}

function validateArtifactShape(artifact) {
  if (!exactKeys(artifact, ["schema", "schemaVersion", "generatedAt", "generatedAtTrust",
    "sourceBinding", "treasuryJudgmentFund", "gaoBidProtest", "qualityAndRightsBoundary",
    "stageContribution", "authority", "artifactHash"])) fail("ARTIFACT_KEYS_INVALID");
  if (artifact.schema !== JUDGMENT_FUND_GAO_REAL_CASES_SCHEMA
    || artifact.schemaVersion !== "1.0.0" || !HASH.test(artifact.artifactHash ?? "")) {
    fail("ARTIFACT_IDENTITY_INVALID");
  }
  canonicalTime(artifact.generatedAt);
  const { artifactHash, ...body } = artifact;
  if (artifactHash !== domainHash("outsider:judgment-fund-gao-real-cases:v1", body)) {
    fail("ARTIFACT_HASH_INVALID");
  }
  if (artifact.generatedAtTrust !== "SELF_ASSERTED_LOCAL_TIME") fail("TIME_TRUST_INVALID");
  if (!exactKeys(artifact.sourceBinding, ["sourceId", "sourceObjects",
    "sourceObjectSetHash", "acquisitionManifestSha256",
    "independentRedownloadByteStabilityEstablishedObjectCount",
    "independentRedownloadByteStabilityNotEstablishedObjectCount",
    "sourceArtifactsReverifiedByStandaloneArtifact",
    "officialPublisherIdentityRequiresFullSourceReplay", "collectionTransportAttested"])) {
    fail("SOURCE_BINDING_KEYS_INVALID");
  }
  const expectedSourceObjects = JUDGMENT_FUND_GAO_SOURCE_PINS.map(sourcePinProjection);
  requireExact(artifact.sourceBinding.sourceObjects, expectedSourceObjects,
    "SOURCE_OBJECTS_INVALID");
  requireExact(artifact.sourceBinding, {
    sourceId: "TREASURY_JUDGMENT_FUND_2026_THROUGH_0731_AND_GAO_FY2025_20260821",
    sourceObjects: expectedSourceObjects,
    sourceObjectSetHash: domainHash("outsider:judgment-fund-gao-source-set:v1",
      expectedSourceObjects),
    acquisitionManifestSha256: sha256Bytes(serializeJudgmentFundGaoAcquisitionManifest()),
    independentRedownloadByteStabilityEstablishedObjectCount: 14,
    independentRedownloadByteStabilityNotEstablishedObjectCount:
      expectedSourceObjects.length - 14,
    sourceArtifactsReverifiedByStandaloneArtifact: false,
    officialPublisherIdentityRequiresFullSourceReplay: true,
    collectionTransportAttested: false,
  }, "SOURCE_BINDING_INVALID");

  const treasury = artifact.treasuryJudgmentFund;
  if (!exactKeys(treasury, ["realityStatus", "publisher", "snapshot", "reports", "totals",
    "responsibleAgencyAggregates", "submittingAgencyAggregates",
    "principalCitationAggregates", "amountAndUnitBoundary",
    "certificationCustodyAndDisbursementBoundary", "privacyProjection",
    "revisionAndDedupBoundary"])) fail("TREASURY_KEYS_INVALID");
  if (treasury.realityStatus !== "REAL_INSTITUTIONAL_PAYMENT_OPERATION"
    || treasury.publisher !== "U.S. Department of the Treasury, Bureau of the Fiscal Service") {
    fail("TREASURY_IDENTITY_INVALID");
  }
  requireExact(treasury.snapshot, { start: "2026-01-01", end: "2026-07-31",
    reportIntervals: 14, latestFullyPublishedIntervalAtFreeze: true,
    rightCensoredAfter: "2026-07-31" }, "TREASURY_SNAPSHOT_INVALID");
  if (!Array.isArray(treasury.reports) || treasury.reports.length !== REPORTS.length) {
    fail("REPORT_ARRAY_INVALID");
  }
  const reportTotals = { paymentComponentRows: 0, zeroTotalPublishedAmountRows: 0,
    rowsOutsideWorkbookFilter: 0, rawNumericCellsWithMoreThanTwoDecimalPlaces: 0,
    amounts: { currency: "USD", principalAmountCents: 0, attorneyFeesAmountCents: 0,
      costAmountCents: 0, interestAmountCents: 0, totalPublishedAmountCents: 0 } };
  for (let index = 0; index < treasury.reports.length; index += 1) {
    const report = treasury.reports[index];
    const pin = REPORTS[index];
    if (!exactKeys(report, ["sourcePath", "sourceSha256", "worksheetName",
      "worksheetMember", "reportInterval", "reportCreatedOn", "workbookFilterLastRow",
      "lastParsedPaymentRow", "paymentComponentRows", "rowsOutsideWorkbookFilter",
      "zeroTotalPublishedAmountRows", "rawNumericCellsWithMoreThanTwoDecimalPlaces",
      "formulaCellCount", "formulaCachedValueUsed", "unsupportedTypedCellCount", "amounts"])) {
      fail("REPORT_KEYS_INVALID");
    }
    if (report.sourcePath !== pin.path || report.sourceSha256 !== pin.sha256
      || !same(report.reportInterval, pin.interval)
      || report.worksheetName !== `${new Date(`${pin.interval.start}T00:00:00.000Z`)
        .toLocaleString("en-US", { month: "long", timeZone: "UTC" })} 2026`
      || report.worksheetMember !== "xl/worksheets/sheet1.xml") fail("REPORT_IDENTITY_INVALID");
    validateDateOnly(report.reportCreatedOn, "REPORT_CREATED_DATE_INVALID");
    if (report.reportCreatedOn < report.reportInterval.end
      || !Number.isSafeInteger(report.workbookFilterLastRow)
      || report.workbookFilterLastRow < 5
      || !Number.isSafeInteger(report.lastParsedPaymentRow)
      || report.lastParsedPaymentRow < 6
      || !Number.isSafeInteger(report.paymentComponentRows)
      || report.paymentComponentRows !== report.lastParsedPaymentRow - 5
      || !Number.isSafeInteger(report.rowsOutsideWorkbookFilter)
      || report.rowsOutsideWorkbookFilter !== Math.max(0,
        report.lastParsedPaymentRow - report.workbookFilterLastRow)
      || !Number.isSafeInteger(report.zeroTotalPublishedAmountRows)
      || report.zeroTotalPublishedAmountRows < 0
      || report.zeroTotalPublishedAmountRows > report.paymentComponentRows
      || !Number.isSafeInteger(report.rawNumericCellsWithMoreThanTwoDecimalPlaces)
      || report.rawNumericCellsWithMoreThanTwoDecimalPlaces < 0
      || report.rawNumericCellsWithMoreThanTwoDecimalPlaces > report.paymentComponentRows * 4
      || report.formulaCellCount !== 0 || report.formulaCachedValueUsed !== false
      || report.unsupportedTypedCellCount !== 0) fail("REPORT_VALUES_INVALID");
    validateAmounts(report.amounts, "REPORT_AMOUNTS_INVALID");
    for (const key of ["paymentComponentRows", "zeroTotalPublishedAmountRows",
      "rowsOutsideWorkbookFilter", "rawNumericCellsWithMoreThanTwoDecimalPlaces"]) {
      reportTotals[key] += report[key];
    }
    for (const key of AMOUNT_KEYS.slice(1)) reportTotals.amounts[key] += report.amounts[key];
  }
  if (!exactKeys(treasury.totals, ["paymentComponentRows", "zeroTotalPublishedAmountRows",
    "rowsOutsideWorkbookFilter", "rawNumericCellsWithMoreThanTwoDecimalPlaces",
    "exactFullRawRowsRepeatedOccurrencesWithinReports", "amounts"])) {
    fail("TOTAL_KEYS_INVALID");
  }
  validateAmounts(treasury.totals.amounts, "TOTAL_AMOUNTS_INVALID");
  for (const key of ["paymentComponentRows", "zeroTotalPublishedAmountRows",
    "rowsOutsideWorkbookFilter", "rawNumericCellsWithMoreThanTwoDecimalPlaces",
    "exactFullRawRowsRepeatedOccurrencesWithinReports"]) {
    if (!Number.isSafeInteger(treasury.totals[key]) || treasury.totals[key] < 0) {
      fail("TOTAL_VALUE_INVALID");
    }
  }
  if (treasury.totals.exactFullRawRowsRepeatedOccurrencesWithinReports
    > treasury.totals.paymentComponentRows) fail("TOTAL_VALUE_INVALID");
  requireExact({
    paymentComponentRows: treasury.totals.paymentComponentRows,
    zeroTotalPublishedAmountRows: treasury.totals.zeroTotalPublishedAmountRows,
    rowsOutsideWorkbookFilter: treasury.totals.rowsOutsideWorkbookFilter,
    rawNumericCellsWithMoreThanTwoDecimalPlaces:
      treasury.totals.rawNumericCellsWithMoreThanTwoDecimalPlaces,
    amounts: treasury.totals.amounts,
  }, reportTotals, "REPORT_TOTAL_RECONCILIATION_INVALID");
  for (const key of ["responsibleAgencyAggregates", "submittingAgencyAggregates",
    "principalCitationAggregates"]) {
    validateAggregateArray(treasury[key], treasury.totals, "AGGREGATE_ARRAY_INVALID");
  }
  requireExact(treasury.amountAndUnitBoundary, {
    workbookRowsArePublishedPaymentComponentsNotUniqueClaims: true,
    claimsAtOrAboveOneHundredMillionMayBeSplitAcrossComponents: true,
    controlNumberNeededToRecombineButAbsentFromWorkbookProjection: true,
    paymentComponentRowCountIsClaimCount: false,
    paymentComponentRowCountIsAffectedPopulationExposure: false,
    publishedAmountsAreIndividualEconomicLoss: false,
    publishedAmountsNetOfAllOffsetsIdentifiablePerRow: false,
    recipientBankSettlementObservedPerRow: false,
    claimantAcceptanceObservedPerRow: false,
    completeRecoveryObservedPerRow: false,
  }, "AMOUNT_UNIT_BOUNDARY_INVALID");
  requireExact(treasury.certificationCustodyAndDisbursementBoundary, {
    judgmentOrSettlementMustBeFinalForCertification: true,
    fiscalServiceAdministersFundButDoesNotReviewOrEvaluateMerits: true,
    judgmentFundSectionChecksProperFundingSourceAndCertifiesVoucher: true,
    judgmentDebtSetoffOccursAtCertificationLevel: true,
    administrativeOffsetOccursAtDisbursingLevelAfterCertification: true,
    disbursingOfficialPaysAccordingToCertifiedVoucher: true,
    certificationIsDisbursement: false,
    disbursementIsRecipientRecoveryOrAcceptance: false,
    thisProcessIsOutsiderCustodyOrPaymentRail: false,
  }, "CERTIFICATION_DISBURSEMENT_BOUNDARY_INVALID");
  requireExact(treasury.privacyProjection, {
    rawReportsContainClaimantAndCounselColumns: true,
    publisherStatesIndividualNamesRedactedUnderPrivacyAct: true,
    entityAndCounselNamesCanRemainInRawReports: true,
    rawReportFilesRemainGitignored: true,
    claimantNamesPersistedInArtifact: false,
    claimantCounselPersistedInArtifact: false,
    factNarrativesPersistedInArtifact: false,
    claimantCounselOrRawRowFingerprintsPersistedInArtifact: false,
    deterministicPseudonymousCaseLinksCreated: false,
  }, "PRIVACY_BOUNDARY_INVALID");
  requireExact(treasury.revisionAndDedupBoundary, {
    currentPublisherSnapshotOnly: true,
    allFourteenWorkbooksByteStableAcrossIndependentRedownloadAtFreeze: true,
    publisherRevisionHistoryAvailable: false,
    publisherVersionIdentifiersAvailable: false,
    exactRepeatedRawRowsCountedButNotPersistedOrDeduplicated: true,
    repeatedRowsMayRepresentDistinctComponentsOrPayees: true,
    recordsDeduplicated: 0,
    crossIntervalClaimLinkageAttempted: false,
    workbookFilterRangeTreatedAsCompletenessBoundary: false,
    semanticPaymentRowsOutsidePublisherFilterIncludedAndCounted: true,
  }, "REVISION_DEDUP_BOUNDARY_INVALID");

  const gao = artifact.gaoBidProtest;
  if (!exactKeys(gao, ["realityStatus", "publisher", "fiscalYear", "annualAggregate",
    "denominatorAndOutcomeBoundary", "adjudicationAndConsequenceBoundary",
    "decisionSample"]) || gao.realityStatus
      !== "REAL_INSTITUTIONAL_ADJUDICATION_EXPERIENCE_AGGREGATE"
    || gao.publisher !== "U.S. Government Accountability Office" || gao.fiscalYear !== 2025) {
    fail("GAO_IDENTITY_INVALID");
  }
  requireExact(gao.annualAggregate, {
    casesFiled: 1_688, protestsFiled: 1_617, costClaimsFiled: 24,
    reconsiderationRequestsFiled: 47, casesClosed: 1_737,
    protestsClosed: 1_676, costClaimsClosed: 20,
    reconsiderationRequestsClosed: 41, taskOrderCasesClosed: 359,
    meritDecisions: 380, sustains: 53,
    recomputedSustainRatePercent: 53 / 380 * 100,
    publisherRoundedSustainRatePercent: 14,
    publisherEffectivenessRatePercent: 52,
    adrCasesUsed: 53, publisherRoundedAdrSuccessRatePercent: 91,
    hearings: 3, publisherRoundedHearingsPercentOfFullyDevelopedCases: 0.5,
    finalDecisionsOverOneHundredDays: 0,
    agencyNonimplementationInstancesReported: 1,
  }, "GAO_ANNUAL_AGGREGATE_INVALID");
  requireExact(gao.denominatorAndOutcomeBoundary, {
    casesAreDocketNumbersNotUniqueProcurements: true,
    casesIncludeProtestsCostClaimsAndReconsiderationRequests: true,
    filedAndClosedCohortsNeedNotBeSameCases: true,
    effectivenessRateMeansSomeReliefReportedToGaoFromCorrectiveActionOrSustain: true,
    effectivenessRateNumeratorNotPublishedInAnnualTable: true,
    adrSuccessNumeratorNotPublishedInAnnualTable: true,
    hearingDenominatorNotPublishedInAnnualTable: true,
    routineDismissalsNotMadePublic: true,
    agencyCorrectiveActionReasonsNeedNotBeReported: true,
    publicDecisionCorpusCompleteForAllClosures: false,
  }, "GAO_DENOMINATOR_BOUNDARY_INVALID");
  requireExact(gao.adjudicationAndConsequenceBoundary, {
    gaoForumIndependentFromProcuringAgency: true,
    gaoIsArticleThreeJudiciary: false,
    gaoDecisionIsJudicialFinality: false,
    sustainRecommendationIsSelfExecuting: false,
    agencyMustAdviseWhetherItWillComply: true,
    realNonimplementationCounterexampleObservedInAnnualReport: true,
    recommendationEqualsImplementation: false,
    reliefEqualsFullEconomicRecovery: false,
    gaoAuthorityIsOutsiderAuthority: false,
  }, "GAO_ADJUDICATION_BOUNDARY_INVALID");
  requireExact(gao.decisionSample, { included: false,
    reason: "NO_BOUNDED_OUTCOME_NEUTRAL_COMPLETE_PUBLIC_DECISION_SAMPLE; ROUTINE_DISMISSALS_ARE_NOT_PUBLIC_AND_ANNUAL_REPORT_EXEMPLARS_ARE_SUSTAIN_SELECTED",
    outcomeLeakageAvoided: true }, "GAO_DECISION_SAMPLE_INVALID");
  requireExact(artifact.qualityAndRightsBoundary, {
    publicOriginAutomaticallyDowngradesReality: false,
    outsiderCollectionAutomaticallyUpgradesReality: false,
    sourceByteIdentityAndPublisherSemanticsReplayedByFullVerifier: true,
    gaoRenderedDomSnapshotsAreOriginalHttpResponseBytes: false,
    gaoPdfAndTreasuryFilesHaveExactBytePins: true,
    treasuryDisclosureMandatedByPublicLawReferencedOnPublisherPage: true,
    gaoProductsNotProtectedByUsCopyrightSubjectToThirdPartyMaterialCaveat: true,
    publicAccessIsAutomaticTrainingPermission: false,
    legalReuseRightsForAutomaticTrainingEstablished: false,
    rawSourceRedistributionByPackageAuthorized: false,
    targetDomainTransferEstablished: false,
  }, "QUALITY_RIGHTS_BOUNDARY_INVALID");
  requireExact(artifact.stageContribution, {
    stage3: { realPublicCapitalDisbursementAndOffsetProcessReference: true,
      realPaymentAmountComponentExperienceReference: true,
      outsiderCapitalAdequacyEstablished: false,
      outsiderCustodyOrLicensedPaymentRailEstablished: false },
    stage4: { realExternalToProcuringAgencyAdministrativeReviewReference: true,
      realRecommendationNonimplementationConsequenceReference: true,
      outsiderStandingAdjudicationSettlementOrClosureAuthorityEstablished: false },
  }, "STAGE_CONTRIBUTION_INVALID");
  requireExact(artifact.authority, {
    automaticTrainingEligible: false,
    PRICE: false, GUARANTEE: false, CAPITALIZE: false, CUSTODY: false,
    PAY: false, SETTLE: false, CLOSE: false, REOPEN: false,
    affectedPartyStandingGranted: false,
    ownerGateInputEligible: false,
  }, "AUTHORITY_BOUNDARY_INVALID");
}

export function verifyJudgmentFundGaoRealCasesEvidence(artifact) {
  try {
    validateArtifactShape(artifact);
    return Object.freeze({ ok: true,
      verificationLevel: "STRUCTURE_ONLY_SELF_SEALED_NO_SOURCE_TRUTH",
      artifactHashVerified: true,
      sourceArtifactsReverified: false,
      publisherIdentityReverified: false,
      realityStatusReverified: false,
      rightsReverified: false,
      authorityBoundaryVerified: true,
      authorityEstablished: false });
  } catch (error) {
    return Object.freeze({ ok: false,
      verificationLevel: "STRUCTURE_ONLY_SELF_SEALED_NO_SOURCE_TRUTH",
      sourceArtifactsReverified: false,
      publisherIdentityReverified: false,
      realityStatusReverified: false,
      rightsReverified: false,
      authorityBoundaryVerified: false,
      authorityEstablished: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyJudgmentFundGaoRealCasesEvidenceWithSource(artifact, sourceDirectory) {
  try {
    validateArtifactShape(artifact);
    const rebuilt = buildJudgmentFundGaoRealCasesFromSourceDirectory(sourceDirectory, {
      generatedAt: artifact.generatedAt,
    });
    if (!same(artifact, rebuilt)) fail("ARTIFACT_SOURCE_REPLAY_MISMATCH");
    return Object.freeze({ ok: true,
      verificationLevel: "FULL_PINNED_TREASURY_GAO_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE",
      artifactHashVerified: true,
      sourceArtifactsReverified: true,
      publisherIdentityReverified: true,
      realityStatusReverified: true,
      reportWorkbookRelationshipsAndCellTypesReparsed: true,
      formulaCachesUsed: false,
      gaoAnnualAggregateParsedFromPinnedOfficialPage: true,
      rightsBoundaryReverified: true,
      authorityBoundaryVerified: true,
      authorityEstablished: false,
      sourceObjectSetHash: rebuilt.sourceBinding.sourceObjectSetHash,
      acquisitionManifestSha256: rebuilt.sourceBinding.acquisitionManifestSha256,
      artifactHash: rebuilt.artifactHash });
  } catch (error) {
    return Object.freeze({ ok: false,
      verificationLevel: "FULL_PINNED_TREASURY_GAO_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE",
      sourceArtifactsReverified: false,
      publisherIdentityReverified: false,
      realityStatusReverified: false,
      rightsBoundaryReverified: false,
      authorityBoundaryVerified: false,
      authorityEstablished: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}
