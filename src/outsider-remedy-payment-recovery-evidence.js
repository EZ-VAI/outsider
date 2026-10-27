/*
 * Real remedy, payment, recovery, and program-closure evidence.
 *
 * The public origin of these records neither lowers nor raises their reality
 * status. Admission is controlled by exact source bytes, publisher authority,
 * table completeness, native identifiers, revision/missingness handling, and
 * explicit limits on what each reported amount or status means.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, openSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const REMEDY_PAYMENT_RECOVERY_SCHEMAS = Object.freeze({
  book: "outsider/remedy-payment-recovery-evidence-book/v1",
  event: "outsider/remedy-payment-recovery-event/v1",
  cpscCaseProjection: "outsider/cpsc-remedy-progress-case-projection/v1",
  cpscCase: "outsider/cpsc-remedy-progress-case/v1",
});

export const REMEDY_PAYMENT_RECOVERY_SOURCE_PINS = Object.freeze([
  Object.freeze({
    path: "cfpb-fy2025-cpf-bar.pdf",
    kind: "OFFICIAL_CFPB_CIVIL_PENALTY_FUND_AND_REDRESS_ANNUAL_REPORT_PDF",
    url: "https://files.consumerfinance.gov/f/documents/cfpb_fy2025-cpf-bar-annual-report_2026-03.pdf",
    sizeBytes: 213_295,
    sha256: "sha256:4f1c870f694db3c2fb8111e081aaa9caee5d6ecab7e6ca4f5330a957bdc48ef2",
  }),
  Object.freeze({
    path: "ftc-refunds-2024.pdf",
    kind: "OFFICIAL_FTC_REFUNDS_ANNUAL_REPORT_PDF",
    url: "https://search.ftc.gov/system/files/ftc_gov/pdf/ftc-refunds-consumers-2024.pdf",
    canonicalPublisherUrl: "https://www.ftc.gov/system/files/ftc_gov/pdf/ftc-refunds-consumers-2024.pdf",
    sizeBytes: 660_571,
    sha256: "sha256:14cb059063eda15e5de03cb651a340296a9a20ae2ac4aa31b2c1a342e67fea84",
  }),
  Object.freeze({
    path: "cpsc-mpr-20260713.xlsx",
    kind: "OFFICIAL_CPSC_MONTHLY_PROGRESS_REPORT_WORKBOOK_XLSX",
    url: "https://www.cpsc.gov/s3fs-public/Monthly-Progress-Report-July-Update_0.xlsx?VersionId=FZ8nxfpaovYtDsnRUO.TWxLEeUGfKLCd",
    sizeBytes: 129_631,
    sha256: "sha256:29be30d806f82fb4fcd41fd7ca74ad4711882741694cdc34534244cbf02f9808",
  }),
  Object.freeze({
    path: "cpsc-recalls-20220801-20260713.json",
    kind: "OFFICIAL_CPSC_RECALL_API_COMPLETE_DECLARED_DATE_SLICE_JSON",
    url: "https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=2022-08-01&RecallDateEnd=2026-07-13",
    sizeBytes: 4_727_858,
    sha256: "sha256:c140f33584499674626bd3d2c067343339fd3daf5313498bcfe340b7fbf39a14",
  }),
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const CREATED_AT_DEFAULT = "2026-08-21T12:00:00.000Z";
const MAX_XLSX_ENTRY_BYTES = 8 * 1024 * 1024;
const EXPECTED_SOURCE_FILES = Object.freeze([
  "acquisition.json", ...REMEDY_PAYMENT_RECOVERY_SOURCE_PINS.map((row) => row.path),
].sort());

function fail(code, detail = null) {
  throw new Error(detail == null ? `REMEDY_PAYMENT_RECOVERY_${code}`
    : `REMEDY_PAYMENT_RECOVERY_${code}:${detail}`);
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

function sourceObjects() {
  return REMEDY_PAYMENT_RECOVERY_SOURCE_PINS.map((pin) => ({
    path: pin.path, kind: pin.kind, url: pin.url,
    ...(pin.canonicalPublisherUrl ? { canonicalPublisherUrl: pin.canonicalPublisherUrl } : {}),
    sizeBytes: pin.sizeBytes, sha256: pin.sha256,
  }));
}

function stablePinnedBytes(file, pin, maximumBytes) {
  let descriptor = null;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size !== BigInt(pin.sizeBytes)
      || before.size < 1n || before.size > BigInt(maximumBytes)) {
      fail("SOURCE_FILE_INVALID", pin.path);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || sha256Bytes(bytes) !== pin.sha256) {
      fail("SOURCE_FILE_CHANGED_OR_MISMATCHED", pin.path);
    }
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
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

/** Read one exact entry from a bounded, non-ZIP64 XLSX archive. */
export function extractXlsxEntry(xlsxBytes, wantedName) {
  const bytes = Buffer.isBuffer(xlsxBytes) ? xlsxBytes : Buffer.from(xlsxBytes ?? "");
  if (bytes.length < 22 || bytes.length > 4 * 1024 * 1024
    || !(new Set(["xl/sharedStrings.xml", "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels"]).has(wantedName)
      || /^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(wantedName))) {
    fail("XLSX_INPUT_INVALID");
  }
  const lower = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= lower; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) fail("XLSX_EOCD_MISSING");
  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const entriesDisk = bytes.readUInt16LE(eocd + 8);
  const entries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || entries < 1 || entries !== entriesDisk
    || entries > 512 || centralOffset + centralSize > eocd) fail("XLSX_LAYOUT_INVALID");
  let offset = centralOffset;
  for (let ordinal = 0; ordinal < entries; ordinal += 1) {
    if (offset + 46 > centralOffset + centralSize
      || bytes.readUInt32LE(offset) !== 0x02014b50) fail("XLSX_CENTRAL_INVALID");
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const expectedCrc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || nameLength < 1
      || next > centralOffset + centralSize) fail("XLSX_ENTRY_INVALID");
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name === wantedName) {
      if (uncompressedSize < 1 || uncompressedSize > MAX_XLSX_ENTRY_BYTES
        || bytes.readUInt32LE(localOffset) !== 0x04034b50) fail("XLSX_ENTRY_INVALID");
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const localName = bytes.subarray(localOffset + 30,
        localOffset + 30 + localNameLength).toString("utf8");
      if (localName !== name) fail("XLSX_ENTRY_NAME_MISMATCH");
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (dataOffset + compressedSize > centralOffset) fail("XLSX_ENTRY_BOUNDS_INVALID");
      const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
      const result = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, {
        maxOutputLength: MAX_XLSX_ENTRY_BYTES,
      });
      if (result.length !== uncompressedSize || crc32(result) !== expectedCrc) {
        fail("XLSX_ENTRY_INTEGRITY_INVALID");
      }
      return result;
    }
    offset = next;
  }
  fail("XLSX_ENTRY_MISSING", wantedName);
}

function decodeXmlText(value) {
  return value.replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|lt|gt|quot|apos);/gi,
    (token, numeric, named) => {
      if (numeric) {
        const code = numeric[0].toLowerCase() === "x"
          ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10);
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) fail("XML_ENTITY_INVALID");
        return String.fromCodePoint(code);
      }
      return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[named.toLowerCase()];
    });
}

function parseXmlAttributes(value) {
  const output = {};
  let consumed = "";
  for (const match of value.matchAll(/\s+([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g)) {
    if (Object.hasOwn(output, match[1])) fail("XML_ATTRIBUTE_DUPLICATE", match[1]);
    output[match[1]] = decodeXmlText(match[2]);
    consumed += match[0];
  }
  if (value.replace(consumed, "").trim() !== "") fail("XML_ATTRIBUTE_INVALID");
  return output;
}

/** Resolve an OOXML sheet name through workbook r:id and package relationships. */
export function resolveWorkbookWorksheetMember(workbookXmlBytes, relationshipsXmlBytes,
  sheetName = "MPR") {
  const workbook = Buffer.from(workbookXmlBytes ?? "").toString("utf8");
  const relationships = Buffer.from(relationshipsXmlBytes ?? "").toString("utf8");
  if (workbook.includes("\ufffd") || relationships.includes("\ufffd")
    || !workbook.startsWith("<?xml") || !relationships.startsWith("<?xml")
    || typeof sheetName !== "string" || sheetName.length < 1 || sheetName.length > 128) {
    fail("WORKBOOK_RELATIONSHIP_INPUT_INVALID");
  }
  const sheetMatches = [...workbook.matchAll(/<sheet\b([^>]*?)(?:\/>|>[\s\S]*?<\/sheet>)/g)]
    .map((match) => parseXmlAttributes(match[1]))
    .filter((attributes) => attributes.name === sheetName);
  if (sheetMatches.length !== 1) fail("WORKBOOK_SHEET_NAME_INVALID", sheetName);
  const sheet = sheetMatches[0];
  if (!/^rId[1-9][0-9]*$/.test(sheet["r:id"] ?? "")
    || (sheet.state != null && sheet.state !== "visible")) {
    fail("WORKBOOK_SHEET_BINDING_INVALID", sheetName);
  }
  const relationshipMatches = [...relationships.matchAll(
    /<Relationship\b([^>]*?)(?:\/>|>[\s\S]*?<\/Relationship>)/g)]
    .map((match) => parseXmlAttributes(match[1]))
    .filter((attributes) => attributes.Id === sheet["r:id"]);
  if (relationshipMatches.length !== 1) fail("WORKBOOK_RELATIONSHIP_ID_INVALID", sheet["r:id"]);
  const relationship = relationshipMatches[0];
  if (!/\/relationships\/worksheet$/.test(relationship.Type ?? "")
    || relationship.TargetMode != null || typeof relationship.Target !== "string") {
    fail("WORKBOOK_RELATIONSHIP_TARGET_INVALID", sheet["r:id"]);
  }
  const target = relationship.Target.replaceAll("\\", "/");
  if (target.startsWith("/") || target.includes("\0")) {
    fail("WORKBOOK_RELATIONSHIP_TARGET_INVALID", sheet["r:id"]);
  }
  const member = path.posix.normalize(path.posix.join("xl", target));
  if (!/^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(member)
    || member.includes("../")) fail("WORKBOOK_RELATIONSHIP_TARGET_INVALID", sheet["r:id"]);
  return Object.freeze({ sheetName, relationshipId: sheet["r:id"], member });
}

function parseSharedStrings(xmlBytes) {
  const xml = xmlBytes.toString("utf8");
  if (xml.includes("\ufffd") || !xml.startsWith("<?xml")) fail("XLSX_SHARED_STRINGS_INVALID");
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => (
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXmlText(part[1])).join("")
  ));
}

function parseSheetRows(xmlBytes, sharedStrings) {
  const xml = xmlBytes.toString("utf8");
  if (xml.includes("\ufffd") || !xml.startsWith("<?xml")) fail("XLSX_SHEET_INVALID");
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number.parseInt(/\br="([0-9]+)"/.exec(rowMatch[1])?.[1] ?? "", 10);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) fail("XLSX_ROW_INVALID");
    const cells = {};
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const reference = /\br="([A-Z]+)[0-9]+"/.exec(attributes);
      if (!reference) fail("XLSX_CELL_REFERENCE_INVALID");
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1] ?? null;
      const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(cellMatch[2] ?? "");
      let value = valueMatch ? decodeXmlText(valueMatch[1]) : "";
      if (type === "s" && value !== "") {
        const index = Number.parseInt(value, 10);
        if (!Number.isInteger(index) || index < 0 || index >= sharedStrings.length) {
          fail("XLSX_SHARED_STRING_REFERENCE_INVALID");
        }
        value = sharedStrings[index];
      } else if (type !== null && type !== "s") fail("XLSX_CELL_TYPE_UNSUPPORTED", type);
      cells[reference[1]] = value;
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function integerCell(value, field) {
  if (value === "" || value == null) return null;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) fail("MPR_INTEGER_INVALID", field);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail("MPR_INTEGER_INVALID", field);
  return number;
}

function decimalCell(value, field) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) fail("MPR_DECIMAL_INVALID", field);
  return Object.freeze({ sourceCell: value, numericValue: number });
}

function excelDate(value) {
  if (/^(0|[1-9][0-9]*)(?:\.5)?$/.test(value)) {
    const serial = Number(value);
    const milliseconds = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) fail("MPR_DATE_INVALID", value);
  const normalized = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  if (new Date(`${normalized}T00:00:00.000Z`).toISOString().slice(0, 10) !== normalized) {
    fail("MPR_DATE_INVALID", value);
  }
  return normalized;
}

function normalizedTitle(value) {
  return value.replace(/ \| CPSC\.gov$/, "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCpscMprRows(workbookBytes) {
  const workbook = extractXlsxEntry(workbookBytes, "xl/workbook.xml");
  const relationships = extractXlsxEntry(workbookBytes, "xl/_rels/workbook.xml.rels");
  const binding = resolveWorkbookWorksheetMember(workbook, relationships, "MPR");
  const shared = parseSharedStrings(extractXlsxEntry(workbookBytes, "xl/sharedStrings.xml"));
  const rows = parseSheetRows(extractXlsxEntry(workbookBytes, binding.member), shared);
  if (rows.length !== 41) fail("MPR_ROW_COUNT_INVALID");
  const note = rows[0]?.cells?.A ?? "";
  const missingness = rows[1]?.cells?.A ?? "";
  if (!note.includes("MOST UP-TO-DATE DATA AS OF July 13, 2026")
    || !missingness.includes("Information is unavailable for the blank fields")
    || !missingness.includes("has not yet been provided by the firm")
    || !missingness.includes("is barred from disclosure")) fail("MPR_SCOPE_NOTE_INVALID");
  const expectedHeaders = {
    A: "PRESS RELEASE NUMBER", C: "PRESS RELEASE LINK", D: "PRESS RELEASE DATE",
    E: "NUMBER OF PRODUCTS RECALLED",
    F: "NUMBER OF PRODUCTS CORRECTED MANUFACTURER LEVEL",
    G: "NUMBER OF PRODUCTS CORRECTED DISTRIBUTOR LEVEL",
    H: "NUMBER OF PRODUCTS CORRECTED RETAILER LEVEL",
    I: "NUMBER OF PRODUCTS CORRECTED CONSUMER  LEVEL",
    J: "TOTAL  CORRECTED", K: "PERCENT OF PRODUCTS CORRECTED CONSUMER LEVEL*",
    L: "TOTAL PERCENT CORRECTED**",
  };
  if (!same(Object.fromEntries(Object.keys(expectedHeaders).map((key) =>
    [key, rows[2]?.cells?.[key] ?? ""])), expectedHeaders)) fail("MPR_HEADER_INVALID");
  const output = rows.slice(3).map(({ rowNumber, cells }) => {
    const recallNumber = cells.A ?? "";
    if (!/^\d{2}-\d{3}$/.test(recallNumber)) fail("MPR_RECALL_NUMBER_INVALID", rowNumber);
    const corrections = {
      manufacturer: integerCell(cells.F, `F${rowNumber}`),
      distributor: integerCell(cells.G, `G${rowNumber}`),
      retailer: integerCell(cells.H, `H${rowNumber}`),
      consumer: integerCell(cells.I, `I${rowNumber}`),
      total: integerCell(cells.J, `J${rowNumber}`),
    };
    const components = [corrections.manufacturer, corrections.distributor,
      corrections.retailer, corrections.consumer];
    const arithmeticEligible = components.every((value) => value !== null)
      && corrections.total !== null;
    return {
      workbookRow: rowNumber,
      recallNumber, normalizedRecallNumber: recallNumber.replace("-", ""),
      workbookTitle: cells.C ?? "",
      recallDate: excelDate(cells.D ?? ""),
      recalledUnits: integerCell(cells.E, `E${rowNumber}`),
      corrections,
      publisherPercentages: {
        consumerLevel: decimalCell(cells.K, `K${rowNumber}`),
        total: decimalCell(cells.L, `L${rowNumber}`),
      },
      arithmeticCheck: {
        totalComponentsEligible: arithmeticEligible,
        totalComponentsAgree: arithmeticEligible
          ? components.reduce((sum, value) => sum + value, 0) === corrections.total : null,
        publisherPercentagesRecomputed: false,
        reasonNotRecomputed: "PUBLISHER_NOTE_USES_CONSUMER_POSSESSION_AND_AFFECTED_RECALL_DENOMINATORS_NOT_FULLY_EXPOSED_PER_ROW",
      },
    };
  });
  if (output.length !== 38 || new Set(output.map((row) => row.recallNumber)).size !== 38) {
    fail("MPR_CASE_SET_INVALID");
  }
  return output;
}

function parseCpscRecallSlice(jsonBytes) {
  const text = jsonBytes.toString("utf8");
  if (text.includes("\ufffd")) fail("CPSC_API_UTF8_INVALID");
  let records;
  try { records = JSON.parse(text); } catch { fail("CPSC_API_JSON_INVALID"); }
  if (!Array.isArray(records) || records.length !== 1_492) fail("CPSC_API_ROW_COUNT_INVALID");
  const ids = new Set(), numbers = new Set();
  for (const [index, record] of records.entries()) {
    if (record == null || typeof record !== "object" || Array.isArray(record)
      || !Number.isSafeInteger(record.RecallID) || record.RecallID < 1
      || !/^\d{5}$/.test(record.RecallNumber ?? "")
      || !/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(record.RecallDate ?? "")
      || typeof record.Title !== "string" || record.Title.length < 1
      || typeof record.URL !== "string" || record.URL.length < 1 || record.URL.length > 4_096) {
      fail("CPSC_API_ROW_INVALID", index);
    }
    const date = record.RecallDate.slice(0, 10);
    if (date < "2022-08-01" || date > "2026-07-13") fail("CPSC_API_DATE_SCOPE_INVALID", index);
    if (ids.has(record.RecallID) || numbers.has(record.RecallNumber)) {
      fail("CPSC_API_DUPLICATE_NATIVE_KEY", index);
    }
    ids.add(record.RecallID); numbers.add(record.RecallNumber);
  }
  return records;
}

function sealEvent(publisher, eventType, body) {
  const value = {
    schema: REMEDY_PAYMENT_RECOVERY_SCHEMAS.event,
    schemaVersion: "1.0.0", publisher, eventType, ...body,
  };
  return Object.freeze({ ...value,
    eventHash: domainHash("outsider:remedy-payment-recovery-event:v1", value) });
}

const CFPB_ALLOCATIONS = Object.freeze([
  ["PERIOD_24", "BloomTech Inc.", 5_807_587_500],
  ["PERIOD_24", "Western Benefits Group", 97_459_000],
  ["PERIOD_24", "Lexington Law - Class A", 4_902_149_400],
  ["PERIOD_25", "USASF Servicing, LLC", 3_262_768_900],
  ["PERIOD_25", "Climb Credit", 661_800_000],
  ["PERIOD_25", "Performant Recovery, Inc.", 1_404_620_700],
  ["PERIOD_25", "Integrity Advance, et al.", 3_137_375_900],
  ["PERIOD_25", "Lexington Law - Class A", 6_803_718_900],
].map(([period, caseName, allocatedUsdCents]) => sealEvent("CFPB", "CPF_ALLOCATION", {
  period, caseName, currency: "USD", allocatedUsdCents,
  allocationMeansFundsSetAside: true, distributionStartedByAllocation: false,
  recipientReceiptEstablishedByAllocation: false,
})));

const CFPB_INITIATED = Object.freeze([
  ["Tempoe, LLC", "22", 19_225_961_600, 19_190_938_200, 263_703, "FY25_Q1"],
  ["Lexington Law - Class A", "22-25", 194_748_889_700, 183_043_021_400, 4_205_877, "FY25_Q1"],
  ["Lexington Law - Class B", "22", 1_900_000_000, 1_900_000_000, 108_044, "FY25_Q2"],
  ["Driver Loan, LLC", "22", 286_364_800, 175_326_200, 93, "FY25_Q2"],
  ["Access Funding, et al.", "19", 2_840_995_700, 1_220_356_600, 93, "FY25_Q2"],
  ["Prehired, LLC, et al.", "23", 424_824_900, 419_784_200, 645, "FY25_Q3"],
  ["BounceBack, Inc.", "20", 148_177_300, 56_067_100, 2_612, "FY25_Q4"],
].map(([caseName, allocationPeriod, allocatedUsdCents, distributedUsdCents,
  reportedPaymentsMade, initialDistributionQuarter]) => sealEvent("CFPB",
  "CPF_DISTRIBUTION_INITIATED", {
    caseName, allocationPeriod, currency: "USD", allocatedUsdCents,
    distributedUsdCents, reportedPaymentsMade, initialDistributionQuarter,
    publisherDefinesDistributedAsPaymentsMailedOrMadeThroughFiscalYearEnd: true,
    recipientBankSettlementIndividuallyObserved: false,
  })));

const CFPB_CONCLUDED = Object.freeze([
  ["Commercial Credit Consultants, et al.", 3_065_000_200, 1_524_187_900, 37_313, 63, "FY25_Q1"],
  ["Prime Marketing Holdings, LLC", 2_060_044_100, 1_363_581_600, 32_125, 46, "FY25_Q1"],
  ["Siringoringo", 2_082_500_000, 232_962_200, 718, 99, "FY25_Q2"],
  ["Certified Forensic Loan Auditors, LLC, et al.", 300_000_000, 17_441_700, 108, 99, "FY25_Q2"],
  ["Frank Ronald Gebase, Jr.", 24_099_500, 24_099_400, 845, 61, "FY25_Q3"],
  ["Federal Debt Assistance Association, LLC, et al.", 497_238_900, 418_234_800, 618, 85, "FY25_Q4"],
].map(([caseName, allocatedUsdCents, distributedUsdCents, reportedPaymentsMade,
  distributedFundsClaimedPercent, conclusionQuarter]) => sealEvent("CFPB",
  "CPF_DISTRIBUTION_CONCLUDED", {
    caseName, currency: "USD", allocatedUsdCents, distributedUsdCents,
    reportedPaymentsMade, distributedFundsClaimedPercent, conclusionQuarter,
    publisherProgramConclusionObserved: true,
    conclusionDoesNotEstablishFullRecovery: true,
    conclusionDoesNotEstablishAffectedPartyAcceptance: true,
  })));

const CFPB_BAR_INITIATED = Object.freeze([
  ["Lexington Law - Class A", "FY25_Q2", 5_000_000, 6],
  ["Universal Debt & Payment Solutions, LLC, et al.", "FY25_Q3", 1_150_500, 60],
].map(([caseName, initialDistributionQuarter, distributedUsdCents,
  reportedPaymentsMade]) => sealEvent("CFPB", "BUREAU_ADMINISTERED_REDRESS_INITIATED", {
    caseName, initialDistributionQuarter, currency: "USD", distributedUsdCents,
    reportedPaymentsMade, recipientBankSettlementIndividuallyObserved: false,
  })));

const FTC_CLOSED_CASES = Object.freeze([
  ["A.S. Research", 82_100_000, 70_278_045, 9_615_563, 2_206_392, 13_221, 10_833, 81.9],
  ["Age of Learning (ABCmouse)", 1_000_000_000, 929_421_382, 49_494_945, 21_083_673, 206_814, 137_591, 66.5],
  ["Alliance Document Preparation (EZ Doc Preps)", 565_204_824, 526_406_941, 18_941_216, 19_856_667, 39_734, 32_452, 81.7],
  ["Avant Inc", 385_000_000, 373_698_988, 11_234_382, 66_630, 17_367, 15_872, 91.4],
  ["BlueHippo Funding", 13_060_332, 7_941_840, 4_531_168, 587_324, 4_505, 2_222, 49.3],
  ["Digital Income System", 58_636_694, 55_520_335, 2_966_037, 150_322, 1_064, 971, 91.3],
  ["Educare Centre Services", 231_670_154, 220_075_440, 7_852_792, 3_741_922, 7_786, 5_959, 76.5],
  ["Elite IT Partners", 35_513_880, 21_840_645, 11_498_584, 2_174_651, 31_075, 16_432, 52.9],
  ["Fortune Hi-Tech Marketing", 526_090_356, 447_422_517, 63_221_397, 15_446_442, 285_369, 137_670, 48.2],
  ["GAFS Group", 58_568_750, 55_710_304, 2_858_446, 0, 1_966, 1_062, 54.0],
  ["Health Formulas (Simple Pure)", 1_002_197_106, 956_215_648, 37_609_587, 8_371_871, 227_764, 164_458, 72.2],
  ["Hylan Asset Management", 85_251_647, 80_551_109, 3_660_950, 1_039_588, 1_432, 1_049, 73.3],
  ["Kushly", 3_058_314, 1_639_794, 1_404_972, 13_548, 576, 253, 43.9],
  ["LendingClub Corporation", 1_800_000_000, 1_754_311_263, 45_487_970, 200_767, 77_738, 69_966, 90.0],
  ["NetSpend", 1_275_909_927, 420_867_257, 111_162_839, 743_879_831, 279_557, 150_467, 53.8],
  ["Neurometrix", 400_000_000, 367_818_628, 29_319_612, 2_861_760, 70_142, 61_743, 88.0],
  ["OTA Franchise (Online Trading Academy)", 559_757_935, 536_739_734, 20_550_240, 2_467_961, 31_160, 25_831, 82.9],
  ["Physician's Technology, LLC (Willow Curve)", 40_000_000, 24_246_860, 5_720_612, 10_032_528, 22_869, 15_796, 69.1],
  ["Reckitt Benckiser/Indivior (Suboxone)", 6_007_837_525, 5_878_553_967, 125_633_373, 3_650_185, 54_658, 53_080, 97.1],
  ["Seed Consulting", 210_000_000, 199_959_180, 8_474_102, 1_566_718, 8_956, 8_115, 90.6],
  ["SLAC Inc.", 35_000_000, 27_112_050, 6_307_309, 1_580_641, 10_689, 6_083, 56.9],
  ["Strategic Student Solutions", 317_056_884, 297_447_650, 16_260_518, 3_348_716, 20_989, 16_389, 78.1],
  ["Triangle Media", 907_719_487, 845_546_693, 43_664_121, 18_508_673, 187_425, 151_691, 80.9],
  ["Vast Tech", 722_000_011, 693_118_247, 27_412_765, 1_468_999, 127_129, 48_155, 37.9],
  ["Wellco, Inc.", 65_000_000, 41_302_732, 7_982_208, 15_715_060, 40_229, 28_603, 71.1],
].map(([caseName, totalFundUsdCents, returnedToConsumersUsdCents,
  adminCostsUsdCents, leftoverFundsUsdCents, consumersSentPayment,
  consumersCashedAtLeastOnePayment, cashedConsumerPercent]) => sealEvent("FTC",
  "REFUND_PROGRAM_CLOSED_IN_2024", {
    caseName, currency: "USD", totalFundUsdCents, returnedToConsumersUsdCents,
    adminCostsUsdCents, leftoverFundsUsdCents, consumersSentPayment,
    consumersCashedAtLeastOnePayment, cashedConsumerPercent,
    publisherProgramClosureObserved: true,
    paymentCashedObservedAtAggregateCaseLevel: true,
    fullIndividualRecoveryEstablished: false,
  })));

function sum(rows, field) { return rows.reduce((total, row) => total + row[field], 0); }

function cfpbProjection() {
  return {
    publisher: "Consumer Financial Protection Bureau",
    report: "Civil Penalty Fund and Bureau-Administered Redress Annual Report FY2025",
    reportPeriod: { start: "2024-10-01", end: "2025-09-30" },
    pdfTableProjectionMethod: "MANUAL_TRANSCRIPTION_FROM_PINNED_OFFICIAL_TABLES_WITH_TOTAL_CONSTRAINTS",
    pdfTablesMachineParsed: false,
    independentSecondTranscriberVerified: false,
    civilPenaltyFund: {
      fiscalYearCollectionsUsdCents: 17_573_104_600,
      allocations: CFPB_ALLOCATIONS,
      distributionsInitiated: CFPB_INITIATED,
      distributionsConcluded: CFPB_CONCLUDED,
      summary: {
        allocationEvents: 8,
        allocatedUsdCents: 26_077_480_300,
        initiatedCaseRows: 7,
        initiatedAllocatedUsdCents: 219_575_214_000,
        initiatedDistributedUsdCents: 206_005_493_700,
        initiatedReportedPaymentsMade: 4_581_067,
        concludedCaseRows: 6,
        concludedAllocatedUsdCents: 8_028_882_700,
        concludedDistributedUsdCents: 3_580_507_600,
        concludedReportedPaymentsMade: 71_727,
      },
    },
    bureauAdministeredRedress: {
      fiscalYearCollectionsUsdCents: 525_258_300,
      distributionsInitiated: CFPB_BAR_INITIATED,
      distributionsConcludedCount: 0,
      summary: { initiatedCaseRows: 2, distributedUsdCents: 6_150_500,
        reportedPaymentsMade: 66 },
      custodyDescription: "RELIEF_FUNDS_TREATED_AS_FIDUCIARY_FUNDS_IN_US_TREASURY_LEGAL_OR_EQUITABLE_RELIEF_FUND",
    },
    semanticBoundary: {
      allocationIsDistribution: false,
      amountDistributedMeansRecipientBankSettlement: false,
      reportedPaymentsMadeIsCompleteAffectedPopulationDenominator: false,
      distributionConclusionMeansFullRecovery: false,
      distributionConclusionMeansAffectedPartyAcceptance: false,
      fundOperationIsOutsiderCustody: false,
    },
  };
}

function ftcProjection() {
  return {
    publisher: "Federal Trade Commission",
    report: "2024 FTC Annual Report on Refunds to Consumers",
    reportPeriod: { start: "2024-01-01", end: "2024-12-31" },
    pdfTableProjectionMethod: "MANUAL_TRANSCRIPTION_FROM_PINNED_OFFICIAL_TABLES_WITH_TOTAL_CONSTRAINTS",
    pdfTablesMachineParsed: false,
    independentSecondTranscriberVerified: false,
    firstDistributionsAggregate: {
      caseRows: 33, sentUsdCents: 31_483_756_191, eligibleConsumers: 4_350_411,
      consumersCashedToDate: 2_794_012, asOfDate: "2024-12-31",
      rightCensoredAtAsOfDate: true,
    },
    additionalDistributionsAggregate: {
      caseRows: 22, recentDistributionConsumers: 153_205,
      recentDistributionSentUsdCents: 1_063_282_700,
      priorDistributionsReturnedUsdCents: 11_942_380_181,
      consumersCashedAtLeastOnePayment: 834_425,
    },
    closedPrograms: FTC_CLOSED_CASES,
    closedProgramsSummary: {
      caseRows: 25, totalFundUsdCents: 16_386_633_826,
      returnedToConsumersUsdCents: 14_833_747_249,
      adminCostsUsdCents: 672_865_708, leftoverFundsUsdCents: 880_020_869,
      consumersSentPayment: 1_770_214, consumersCashedAtLeastOnePayment: 1_162_743,
    },
    processEvidence: {
      courtOrSettlementFinalBeforeProgramPlanning: true,
      defendantMoneyCollectedBeforeDistributionPlanning: true,
      eligibilityAndAllocationStepObserved: true,
      sendAndResendStepsObserved: true,
      additionalDistributionReviewObserved: true,
      unusedFundsDispositionToTreasuryOrCoPlaintiffsObserved: true,
      agencySaysRecipientListsAndDistributionsAreReviewedAndAudited: true,
      outsiderIndependentlyReperformedPaymentAudit: false,
    },
    semanticBoundary: {
      refundProgramIsCompleteIndividualRecovery: false,
      closedProgramImpliesEveryAffectedPersonWasPaid: false,
      closedProgramTableCompleteForPublisherDefined2024ClosureSlice: true,
      completeAffectedPopulationDenominatorEstablished: false,
      sentPaymentIsCashedPayment: false,
      cashedPaymentIsFullCompensation: false,
      ftcProgramAuthorityIsOutsiderAuthority: false,
    },
  };
}

function validateStaticTableTotals(cfpb, ftc) {
  const c = cfpb.civilPenaltyFund;
  if (sum(CFPB_ALLOCATIONS, "allocatedUsdCents") !== c.summary.allocatedUsdCents
    || sum(CFPB_INITIATED, "allocatedUsdCents") !== c.summary.initiatedAllocatedUsdCents
    || sum(CFPB_INITIATED, "distributedUsdCents") !== c.summary.initiatedDistributedUsdCents
    || sum(CFPB_INITIATED, "reportedPaymentsMade") !== c.summary.initiatedReportedPaymentsMade
    || sum(CFPB_CONCLUDED, "allocatedUsdCents") !== c.summary.concludedAllocatedUsdCents
    || sum(CFPB_CONCLUDED, "distributedUsdCents") !== c.summary.concludedDistributedUsdCents
    || sum(CFPB_CONCLUDED, "reportedPaymentsMade") !== c.summary.concludedReportedPaymentsMade
    || sum(CFPB_BAR_INITIATED, "distributedUsdCents")
      !== cfpb.bureauAdministeredRedress.summary.distributedUsdCents
    || sum(CFPB_BAR_INITIATED, "reportedPaymentsMade")
      !== cfpb.bureauAdministeredRedress.summary.reportedPaymentsMade) {
    fail("CFPB_TABLE_TOTAL_INVALID");
  }
  const f = ftc.closedProgramsSummary;
  for (const field of ["totalFundUsdCents", "returnedToConsumersUsdCents",
    "adminCostsUsdCents", "leftoverFundsUsdCents", "consumersSentPayment",
    "consumersCashedAtLeastOnePayment"]) {
    if (sum(FTC_CLOSED_CASES, field) !== f[field]) fail("FTC_TABLE_TOTAL_INVALID", field);
  }
  if (f.totalFundUsdCents !== f.returnedToConsumersUsdCents + f.adminCostsUsdCents
    + f.leftoverFundsUsdCents) fail("FTC_FUND_RECONCILIATION_INVALID");
}

function emptyCpscProjection() {
  const body = {
    schema: REMEDY_PAYMENT_RECOVERY_SCHEMAS.cpscCaseProjection,
    schemaVersion: "1.0.0", projectionKind: "EMPTY_WITHOUT_SOURCE_DIRECTORY",
    sourceArtifactsReverifiedByProjection: false, asOfDate: "2026-07-13",
    recallApiDateSlice: { start: "2022-08-01", end: "2026-07-13" },
    cases: [],
    summary: {
      mprRows: 0, recallApiRows: 0, correlatedCases: 0,
      recallApiRowsWithCanonicalCpscHttpsUrl: 0,
      recallApiRowsWithPublisherUrlAnomaly: 0,
      correlatedCasesWithCanonicalCpscHttpsUrl: 0,
      exactTitleAgreementCases: 0, normalizedTitleAgreementCases: 0,
      exactRecallDateAgreementCases: 0, rowsWithRecalledUnits: 0,
      rowsWithConsumerCorrectionCount: 0, rowsWithTotalCorrectionCount: 0,
      rowsWithCompleteCorrectionComponents: 0, arithmeticAgreementCases: 0,
      rowsWithAnyMissingCoreMprField: 0,
    },
    missingnessPolicy: "NOT_APPLICABLE_WITHOUT_SOURCE_REPLAY",
  };
  return { ...body,
    projectionHash: domainHash("outsider:cpsc-remedy-progress-projection:v1", body) };
}

function buildCpscProjection(workbookBytes, recallApiBytes) {
  const mprRows = parseCpscMprRows(workbookBytes);
  const recalls = parseCpscRecallSlice(recallApiBytes);
  const byNumber = new Map(recalls.map((record) => [record.RecallNumber, record]));
  const cases = mprRows.map((mpr) => {
    const recall = byNumber.get(mpr.normalizedRecallNumber);
    if (!recall) fail("MPR_RECALL_CORRELATION_MISSING", mpr.recallNumber);
    const apiDate = recall.RecallDate.slice(0, 10);
    if (apiDate !== mpr.recallDate) fail("MPR_RECALL_DATE_MISMATCH", mpr.recallNumber);
    const remedyOptions = Array.isArray(recall.RemedyOptions)
      ? [...new Set(recall.RemedyOptions.map((row) => row?.Option)
        .filter((value) => typeof value === "string" && value.length > 0))].sort() : [];
    const missingCoreFields = [];
    if (mpr.recalledUnits === null) missingCoreFields.push("RECALLED_UNITS");
    for (const [key, value] of Object.entries(mpr.corrections)) {
      if (value === null) missingCoreFields.push(`CORRECTIONS_${key.toUpperCase()}`);
    }
    for (const [key, value] of Object.entries(mpr.publisherPercentages)) {
      if (value === null) missingCoreFields.push(`PUBLISHER_PERCENT_${key.toUpperCase()}`);
    }
    const body = {
      schema: REMEDY_PAYMENT_RECOVERY_SCHEMAS.cpscCase,
      schemaVersion: "1.0.0", caseId: `CPSC_RECALL_${mpr.normalizedRecallNumber}`,
      nativeKeys: { mprPressReleaseNumber: mpr.recallNumber,
        apiRecallNumber: recall.RecallNumber, apiRecallId: recall.RecallID },
      correlation: {
        normalizedRecallNumberAgreement: true,
        exactRecallDateAgreement: true,
        exactTitleAgreement: mpr.workbookTitle.replace(/ \| CPSC\.gov$/, "") === recall.Title,
        normalizedTitleAgreement: normalizedTitle(mpr.workbookTitle) === normalizedTitle(recall.Title),
      },
      recall: {
        title: recall.Title, url: recall.URL,
        urlCanonicalCpscHttps: recall.URL.startsWith("https://www.cpsc.gov/Recalls/"),
        recallDate: apiDate,
        lastPublishDate: typeof recall.LastPublishDate === "string"
          ? recall.LastPublishDate.slice(0, 10) : null,
        remedyOptions,
        injuryNarrativesPersisted: false, hazardNarrativesPersisted: false,
      },
      mpr: {
        workbookRow: mpr.workbookRow, recalledUnits: mpr.recalledUnits,
        corrections: mpr.corrections,
        publisherPercentages: mpr.publisherPercentages,
        arithmeticCheck: mpr.arithmeticCheck,
      },
      missingness: {
        missingCoreFields,
        blankMeansZero: false,
        publisherReasonsAreMixedAndNotRowResolved: true,
        possiblePublisherReasons: [
          "NOT_YET_DUE_FROM_FIRM", "NOT_YET_PROVIDED_BY_FIRM",
          "BEING_PROCESSED_BY_CPSC", "BARRED_FROM_DISCLOSURE",
        ],
      },
      qualityBoundary: {
        realRecallAndRemedyProgressCase: true,
        mprSubmittedByRecallingFirm: true,
        mprCorrectionsIndependentlyVerifiedByOutsider: false,
        recallApiPublisherIsCpsc: true,
        recalledUnitsAreRecallScopeNotPopulationAtRisk: true,
        correctionIsNotCompleteRecovery: true,
        remedyOptionIsNotRemedyPerformance: true,
      },
    };
    return { ...body, caseHash: domainHash("outsider:cpsc-remedy-progress-case:v1", body) };
  });
  const summary = {
    mprRows: mprRows.length, recallApiRows: recalls.length, correlatedCases: cases.length,
    recallApiRowsWithCanonicalCpscHttpsUrl: recalls.filter((row) =>
      row.URL.startsWith("https://www.cpsc.gov/Recalls/")).length,
    recallApiRowsWithPublisherUrlAnomaly: recalls.filter((row) =>
      !row.URL.startsWith("https://www.cpsc.gov/Recalls/")).length,
    correlatedCasesWithCanonicalCpscHttpsUrl: cases.filter((row) =>
      row.recall.urlCanonicalCpscHttps).length,
    exactTitleAgreementCases: cases.filter((row) => row.correlation.exactTitleAgreement).length,
    normalizedTitleAgreementCases: cases.filter((row) =>
      row.correlation.normalizedTitleAgreement).length,
    exactRecallDateAgreementCases: cases.filter((row) =>
      row.correlation.exactRecallDateAgreement).length,
    rowsWithRecalledUnits: cases.filter((row) => row.mpr.recalledUnits !== null).length,
    rowsWithConsumerCorrectionCount: cases.filter((row) =>
      row.mpr.corrections.consumer !== null).length,
    rowsWithTotalCorrectionCount: cases.filter((row) =>
      row.mpr.corrections.total !== null).length,
    rowsWithCompleteCorrectionComponents: cases.filter((row) =>
      row.mpr.arithmeticCheck.totalComponentsEligible).length,
    arithmeticAgreementCases: cases.filter((row) =>
      row.mpr.arithmeticCheck.totalComponentsAgree === true).length,
    rowsWithAnyMissingCoreMprField: cases.filter((row) =>
      row.missingness.missingCoreFields.length > 0).length,
  };
  const body = {
    schema: REMEDY_PAYMENT_RECOVERY_SCHEMAS.cpscCaseProjection,
    schemaVersion: "1.0.0", projectionKind: "PINNED_SOURCE_SHAPED_ROWS",
    sourceArtifactsReverifiedByProjection: false, asOfDate: "2026-07-13",
    recallApiDateSlice: { start: "2022-08-01", end: "2026-07-13" },
    sourceBytes: {
      workbookSha256: sha256Bytes(workbookBytes), recallApiSha256: sha256Bytes(recallApiBytes),
    },
    cases, summary,
    missingnessPolicy: "PRESERVE_NULL_AND_PUBLISHER_MIXED_REASON_SET; NEVER_ZERO_FILL",
    revisionAndDedupPolicy: {
      mprRowsUniqueByPressReleaseNumber: true,
      recallApiRowsUniqueByRecallIdAndRecallNumber: true,
      publisherLastPublishDatePreservedPerCorrelatedCase: true,
      historicalRevisionChainReconstructed: false,
      snapshotRightCensoredAtAsOfDate: true,
    },
  };
  return { ...body,
    projectionHash: domainHash("outsider:cpsc-remedy-progress-projection:v1", body) };
}

function buildBook({ createdAt = CREATED_AT_DEFAULT, cpsc = emptyCpscProjection() } = {}) {
  const normalizedCreatedAt = canonicalTime(createdAt);
  const cfpb = cfpbProjection();
  const ftc = ftcProjection();
  validateStaticTableTotals(cfpb, ftc);
  const body = {
    schema: REMEDY_PAYMENT_RECOVERY_SCHEMAS.book,
    schemaVersion: "1.0.0", createdAt: normalizedCreatedAt,
    createdAtTrust: "SELF_ASSERTED_LOCAL_TIME",
    sourceManifest: {
      sourceObjects: sourceObjects(),
      sourceObjectSetHash: domainHash("outsider:remedy-payment-recovery-source-set:v1",
        sourceObjects()),
      officialSourceBytePinsDeclared: true,
      sourceArtifactsReverifiedByBook: false,
      pdfTablesMachineParsed: false,
      cpscStructuredProjectionPresent: cpsc.cases.length > 0,
      cpscStructuredSourcesMachineParsedByBook: false,
      collectionTimeExternallyAttested: false,
      rights: {
        publicAccessObserved: true,
        officialUSGovernmentPublishers: true,
        evidenceUseInThisProjectionReviewed: true,
        legalReuseRightsVerifiedForAutomaticTraining: false,
        adapterGrantsAdditionalRights: false,
        rawSourceDistributionByPackage: false,
      },
    },
    cfpb, ftc, cpsc,
    evidenceInterpretation: {
      publicDataRemainRealCasesAndRealInstitutionalExperience: true,
      publicOriginAutomaticallyDowngradesEvidence: false,
      outsiderCollectionAutomaticallyUpgradesEvidence: false,
      admissionDependsOnQualityAuthorityReliabilityAndCompleteness: true,
      cfpbAllocationIsRecipientPayment: false,
      sentOrDistributedIsIndividualBankSettlement: false,
      refundProgramClosureIsCompleteRecovery: false,
      firmMprIsIndependentOutcomeVerification: false,
      recallCorrectionIsEconomicLoss: false,
    },
    stageContribution: {
      stage3: {
        realInstitutionalFundCollectionAllocationCustodyAndDistributionReference: true,
        outsiderCapitalCustodyEstablished: false,
        outsiderPaymentRailEstablished: false,
      },
      stage4: {
        realPaymentAndCashParticipationReference: true,
        realProgramClosureReference: true,
        realFirmReportedRemedyProgressReferenceDeclared: cpsc.cases.length > 0,
        declaredReferenceRequiresSourceVerification: true,
        outsiderClaimSettlementAuthorityEstablished: false,
        outsiderClosureOrReopeningAuthorityEstablished: false,
      },
    },
    qualityBoundary: {
      cfpbAndFtcCompleteDeclaredAnnualReportTables: true,
      cfpbAndFtcManualTranscriptionRequiresPinnedPdfAndTotalReconciliation: true,
      cpscVisibleCurrentMprSheetOnly: true,
      cpscHiddenStaleWorksheetsExcluded: true,
      cpscMprRowsCorrelatedToCompleteDeclaredRecallApiDateSlice:
        cpsc.cases.length > 0,
      cpscCorrelationRequiresSourceVerification: true,
      sameNamedCasesAcrossDifferentEventTypesNotCollapsed: true,
      pdfCaseCorrelationUsesPublisherCaseNameAndTableContext: true,
      longitudinalPublisherRevisionHistoryComplete: false,
      activeDistributionRowsRightCensored: true,
      crossPublisherCasesAutomaticallyLinked: false,
      exposureFrequencyEligible: false,
      economicLossSeverityEligible: false,
      causalEffectEligible: false,
      fullRecoveryRateEligible: false,
      targetDomainPriceEligible: false,
    },
    authority: {
      automaticTrainingEligible: false,
      PRICE: false, GUARANTEE: false, SETTLE: false, CONTROL: false,
      CUSTODY: false, PAY: false, CLOSE: false, REOPEN: false,
      ownerGateInputEligible: false,
    },
  };
  return Object.freeze({ ...body,
    bookHash: domainHash("outsider:remedy-payment-recovery-book:v1", body) });
}

function validateSourceSnapshot(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length < 1) {
    fail("SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  const entries = readdirSync(directory).sort();
  if (!same(entries, EXPECTED_SOURCE_FILES)) fail("SOURCE_FILE_SET_INVALID");
  const snapshots = new Map();
  for (const pin of REMEDY_PAYMENT_RECOVERY_SOURCE_PINS) {
    const maximum = pin.path.endsWith(".json") ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
    snapshots.set(pin.path, stablePinnedBytes(path.join(directory, pin.path), pin, maximum));
  }
  const expectedAcquisition = {
    schema: "outsider/remedy-payment-recovery-acquisition/v1",
    acquiredAt: "SELF_ASSERTED_LOCAL_TIME",
    declaredSnapshot: {
      cfpbFiscalYear: 2025, ftcCalendarYear: 2024,
      cpscMprAsOfDate: "2026-07-13",
      cpscRecallDateSlice: { start: "2022-08-01", end: "2026-07-13" },
    },
    objects: REMEDY_PAYMENT_RECOVERY_SOURCE_PINS.map((pin) => ({
      path: pin.path, url: pin.url, finalUrl: pin.url,
      sizeBytes: pin.sizeBytes, sha256: pin.sha256,
    })),
  };
  const expectedBytes = Buffer.from(`${JSON.stringify(expectedAcquisition)}\n`);
  const acquisitionBytes = stablePinnedBytes(path.join(directory, "acquisition.json"), {
    path: "acquisition.json", sizeBytes: expectedBytes.length, sha256: sha256Bytes(expectedBytes),
  }, 128 * 1024);
  let acquisition;
  try { acquisition = JSON.parse(acquisitionBytes.toString("utf8")); }
  catch { fail("ACQUISITION_INVALID"); }
  if (!same(acquisition, expectedAcquisition)) fail("ACQUISITION_INVALID");
  for (const name of ["cfpb-fy2025-cpf-bar.pdf", "ftc-refunds-2024.pdf"]) {
    if (!snapshots.get(name).subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      fail("SOURCE_PDF_MAGIC_INVALID", name);
    }
  }
  if (!snapshots.get("cpsc-mpr-20260713.xlsx").subarray(0, 2).equals(Buffer.from("PK"))) {
    fail("SOURCE_XLSX_MAGIC_INVALID");
  }
  return { snapshots, expectedAcquisition };
}

export function buildRemedyPaymentRecoveryEvidenceProjection({
  createdAt = CREATED_AT_DEFAULT,
} = {}) {
  return buildBook({ createdAt });
}

export function buildRemedyPaymentRecoveryEvidenceFromSource({
  sourceDirectory, createdAt = CREATED_AT_DEFAULT,
} = {}) {
  const snapshot = validateSourceSnapshot(sourceDirectory);
  const cpsc = buildCpscProjection(snapshot.snapshots.get("cpsc-mpr-20260713.xlsx"),
    snapshot.snapshots.get("cpsc-recalls-20220801-20260713.json"));
  const book = buildBook({ createdAt, cpsc });
  return Object.freeze({ book, sourceReplay: Object.freeze({
    verificationLevel: "FULL_PINNED_OFFICIAL_SOURCE_SET_REPRODUCED",
    sourceArtifactsReverified: true,
    pdfByteIdentityReverified: true,
    pdfTableValuesMachineReparsed: false,
    pdfTableProjectionCodeAndTotalsReverified: true,
    cpscWorkbookAndApiMachineParsed: true,
    cpscCaseProjectionHash: cpsc.projectionHash,
    sourceObjectSetHash: book.sourceManifest.sourceObjectSetHash,
    legalMeaningIndependentlyReviewed: false,
    outsiderCustodyOrSettlementAuthorityGranted: false,
  }) });
}

function validateCpscProjection(cpsc) {
  if (cpsc == null || typeof cpsc !== "object" || Array.isArray(cpsc)
    || cpsc.schema !== REMEDY_PAYMENT_RECOVERY_SCHEMAS.cpscCaseProjection
    || !HASH.test(cpsc.projectionHash ?? "")) fail("CPSC_PROJECTION_INVALID");
  const { projectionHash, ...body } = cpsc;
  if (projectionHash !== domainHash("outsider:cpsc-remedy-progress-projection:v1", body)) {
    fail("CPSC_PROJECTION_HASH_INVALID");
  }
  if (cpsc.projectionKind === "EMPTY_WITHOUT_SOURCE_DIRECTORY") {
    if (!same(cpsc, emptyCpscProjection())) fail("CPSC_EMPTY_PROJECTION_INVALID");
    return;
  }
  if (cpsc.projectionKind !== "PINNED_SOURCE_SHAPED_ROWS"
    || cpsc.sourceArtifactsReverifiedByProjection !== false || cpsc.cases.length !== 38
    || cpsc.summary.mprRows !== 38 || cpsc.summary.recallApiRows !== 1_492
    || cpsc.summary.correlatedCases !== 38) fail("CPSC_PROJECTION_COUNTS_INVALID");
  const ids = new Set();
  for (const record of cpsc.cases) {
    if (record.schema !== REMEDY_PAYMENT_RECOVERY_SCHEMAS.cpscCase
      || !HASH.test(record.caseHash ?? "") || ids.has(record.caseId)
      || record.qualityBoundary.mprCorrectionsIndependentlyVerifiedByOutsider !== false
      || record.missingness.blankMeansZero !== false) fail("CPSC_CASE_INVALID");
    const { caseHash, ...caseBody } = record;
    if (caseHash !== domainHash("outsider:cpsc-remedy-progress-case:v1", caseBody)) {
      fail("CPSC_CASE_HASH_INVALID");
    }
    ids.add(record.caseId);
  }
}

export function verifyRemedyPaymentRecoveryEvidence(book) {
  try {
    if (book == null || typeof book !== "object" || Array.isArray(book)
      || book.schema !== REMEDY_PAYMENT_RECOVERY_SCHEMAS.book
      || !HASH.test(book.bookHash ?? "")) fail("BOOK_INVALID");
    canonicalTime(book.createdAt);
    validateCpscProjection(book.cpsc);
    const expected = buildBook({ createdAt: book.createdAt, cpsc: book.cpsc });
    if (!same(book, expected)) fail("BOOK_FIXED_FIELDS_OR_AUTHORITY_MISMATCH");
    return Object.freeze({ ok: true,
      verificationLevel: "SELF_SEALED_STRUCTURE_AND_FIXED_TABLE_PROJECTION_ONLY",
      bookHashVerified: true, sourceArtifactsReverified: false,
      pdfTableProjectionCodeAndTotalsReverified: true,
      cpscStructureVerified: true, authorityBoundaryVerified: true });
  } catch (error) {
    return Object.freeze({ ok: false,
      verificationLevel: "SELF_SEALED_STRUCTURE_AND_FIXED_TABLE_PROJECTION_ONLY",
      sourceArtifactsReverified: false, authorityBoundaryVerified: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyRemedyPaymentRecoveryEvidenceAgainstSource(book, {
  sourceDirectory,
} = {}) {
  try {
    const rebuilt = buildRemedyPaymentRecoveryEvidenceFromSource({
      sourceDirectory, createdAt: book?.createdAt,
    });
    if (!same(book, rebuilt.book)) fail("BOOK_SOURCE_REPLAY_MISMATCH");
    return Object.freeze({ ok: true,
      verificationLevel: "FULL_PINNED_OFFICIAL_SOURCE_SET_AND_PROJECTION_REPRODUCED",
      bookHashVerified: true, sourceArtifactsReverified: true,
      pdfByteIdentityReverified: true, pdfTableValuesMachineReparsed: false,
      cpscWorkbookAndApiMachineParsed: true,
      cpscCaseProjectionHash: rebuilt.sourceReplay.cpscCaseProjectionHash,
      sourceObjectSetHash: rebuilt.sourceReplay.sourceObjectSetHash,
      authorityBoundaryVerified: true, bookHash: book.bookHash });
  } catch (error) {
    return Object.freeze({ ok: false,
      verificationLevel: "FULL_PINNED_OFFICIAL_SOURCE_SET_AND_PROJECTION_REPRODUCED",
      sourceArtifactsReverified: false, authorityBoundaryVerified: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}
