/*
 * USDA RMA crop-insurance experience calibration lane.
 *
 * The official State/County/Crop/Coverage Summary of Business snapshot has a
 * real source-domain exposure denominator and publisher-recorded indemnity.
 * It is therefore more than an incident benchmark.  It is still aggregate,
 * mutable administrative experience from crop insurance, not an individual
 * claim ledger and not evidence about AI-agent or robot risk.  This adapter
 * keeps those two facts true at the same time.
 */

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";
import { canonicalizePinnedLegacyEvidence } from
  "./outsider-pinned-legacy-evidence-canonical.js";

export const RMA_CROP_INSURANCE_EXPERIENCE_SCHEMA
  = "outsider/rma-crop-insurance-experience/v1";

export const RMA_SOB_COVERAGE_FROZEN_SOURCE_2024 = Object.freeze({
  datasetId: "USDA_RMA_SOB_STATE_COUNTY_CROP_COVERAGE_2024",
  commodityYear: 2024,
  sourceUrl: "https://pubfs-rma.fpac.usda.gov/pub/Web_Data_Files/Summary_of_Business/state_county_crop/sobcov_2024.zip",
  recordLayoutUrl: "https://pubfs-rma.fpac.usda.gov/pub/Web_Data_Files/Summary_of_Business/state_county_crop/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf",
  sourceObjectHash: "sha256:5731366e8e50abb6af977dc2eeabda2900659e07542ba2a78de9d81c293e3e05",
  sourceObjectBytes: 3_119_562,
  recordLayoutHash: "sha256:fd62972c8219e1e6cb90c4b1ae2f7ad3ada3e759c12c007b2b379da55e606307",
  recordLayoutBytes: 84_719,
  frozenAt: "2026-08-21T07:30:00.000Z",
});

export const STAGE234_DEFERRED_CALIBRATION_SOURCES = Object.freeze([
  Object.freeze({
    sourceId: "CAS_NAIC_SCHEDULE_P_LOSS_RESERVING_2025_12",
    officialPage: "https://www.casact.org/publications-research/research/research-resources/loss-reserving-data-pulled-naic-schedule-p",
    nextWave: "RESERVE_DEVELOPMENT_AND_OUT_OF_TIME_TRIANGLE_VALIDATION",
    observedFields: Object.freeze([
      "EARNED_PREMIUM", "INCURRED_NET_LOSS", "CUMULATIVE_PAID_LOSS",
      "BULK_AND_IBNR_RESERVE", "POSTED_RESERVE", "DEVELOPMENT_LAG",
    ]),
    publisherChain: "NAIC_SCHEDULE_P_COMPILED_BY_SP_GLOBAL_FOR_CAS",
    pageRequestsPublicationAcknowledgement: true,
    exactFileRightsMustBeFrozenBeforeUse: true,
    sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
    transferToAiAgentOrRobotDomainEstablished: false,
    establishesIssuerCustodyCoverageOrSettlementAuthority: false,
  }),
  Object.freeze({
    sourceId: "OPENFEMA_NFIP_REDACTED_CLAIMS_AND_POLICIES_V3",
    officialPage: "https://www.fema.gov/about/openfema",
    nextWave: "PAID_LOSS_AND_POLICY_EXPOSURE_COHORT_CONSTRUCTION",
    observedFields: Object.freeze([
      "REDACTED_CLAIM_PAYMENT_FIELDS", "COVERAGE_FIELDS",
      "POLICY_EFFECTIVE_AND_TERMINATION_FIELDS",
    ]),
    apiRequiresRegistration: false,
    datasetHasSystemOfRecordLag: true,
    datasetIsOfficialFederalReport: false,
    sourceDomain: "US_NATIONAL_FLOOD_INSURANCE_PROGRAM",
    transferToAiAgentOrRobotDomainEstablished: false,
    establishesIndependentAdjudicationOrReserve: false,
  }),
  Object.freeze({
    sourceId: "FEMA_PUBLIC_ASSISTANCE_SECOND_APPEAL_DECISIONS",
    officialPage: "https://www.fema.gov/assistance/public/appeals",
    nextWave: "REAL_APPEAL_STATE_MACHINE_AND_FINAL_AGENCY_DECISION_TAXONOMY",
    observedFields: Object.freeze([
      "APPEAL_LEVEL", "AMOUNT_IN_DISPUTE_WHEN_PRESENT", "DECISION",
      "SIGNED_DECISION_DATE", "FINAL_AGENCY_DECISION_STATUS",
    ]),
    sourceDomain: "US_FEMA_PUBLIC_ASSISTANCE_ADMINISTRATIVE_APPEALS",
    transferToInsuranceClaimAdjudicationEstablished: false,
    establishesOutsiderSettlementAuthority: false,
  }),
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const ZIP_LOCAL_FILE = 0x04034b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_END = 0x06054b50;
const MAX_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024 * 1024;
const FIELD_COUNT = 28;

const FIELD_NAMES = Object.freeze([
  "commodityYear", "stateCode", "stateAbbreviation", "countyCode",
  "countyName", "commodityCode", "commodityName", "insurancePlanCode",
  "insurancePlanAbbreviation", "coverageCategory", "deliveryType",
  "coverageLevel", "policiesSold", "policiesEarningPremium",
  "policiesIndemnified", "unitsEarningPremium", "unitsIndemnified",
  "quantityType", "netReportedQuantity", "endorsedCompanionAcres",
  "liabilityDollars", "totalPremiumDollars", "subsidyDollars",
  "statePrivateSubsidyDollars", "additionalSubsidyDollars",
  "efaPremiumDiscountDollars", "indemnityDollars", "publishedLossRatio",
]);

const PROJECTED_TOTAL_KEYS = Object.freeze([
  "rows", "exposureCells", "noReportedLossCells",
  "zeroReportedLossExposureCells", "noExposureNoReportedLossCells",
  "negativeIndemnityAdjustmentCells", "missingNetReportedQuantityCells",
  "missingLiabilityCells", "missingPremiumCells",
  "missingPublishedLossRatioCells", "materialMissingMonetaryCells",
  "policyLossCountExceedsExposureCells", "unitLossCountExceedsExposureCells",
  "policiesSold", "policiesEarningPremium", "policiesIndemnified",
  "unitsEarningPremium", "unitsIndemnified", "liabilityDollars",
  "totalPremiumDollars", "indemnityDollars", "reportedLossPolicyCellRate",
  "reportedLossUnitCellRate", "reportedLossPolicyCellRateModelEligible",
  "reportedLossUnitCellRateModelEligible",
  "historicalIndemnityPerEarningPolicyCellDollars",
  "historicalIndemnityPerReportedLossPolicyCellDollars",
  "historicalIndemnityToPremiumRatio", "historicalIndemnityToLiabilityRatio",
  "historicalIndemnityRatioModelEligible",
]);

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

const INTEGER_FIELDS = Object.freeze([
  "commodityYear", "policiesSold", "policiesEarningPremium",
  "policiesIndemnified", "unitsEarningPremium", "unitsIndemnified",
  "endorsedCompanionAcres",
]);

// Older official files contain a small number of zero-exposure rows whose
// optional subsidy/discount cells are blank.  Those fields are not loss or
// exposure denominators; preserving null is stricter than coercing it to zero
// and keeps the common 1989-forward layout usable without weakening the core
// monetary fields below.
const NULLABLE_INTEGER_FIELDS = Object.freeze([
  "subsidyDollars", "statePrivateSubsidyDollars",
  "additionalSubsidyDollars", "efaPremiumDiscountDollars",
]);

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
}

function domainHash(domain, value) { return digest({ domain, value }); }

/* The frozen official RMA source commitment contains one hash per published
 * row and predates the ordinary 65,536-member ceiling. Keep its exact replay
 * on the separately bounded legacy-evidence serializer; individual rows,
 * fixtures, and new protocol records continue through domainHash(). */
function pinnedLegacyEvidenceDomainHash(domain, value) {
  return `sha256:${createHash("sha256").update(
    canonicalizePinnedLegacyEvidence({ domain, value }))
    .digest("hex")}`;
}

function samePinnedLegacyEvidence(left, right) {
  return canonicalizePinnedLegacyEvidence(left)
    === canonicalizePinnedLegacyEvidence(right);
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || value.length > 40
    || !Number.isFinite(Date.parse(value))) throw new Error(`${code}_INVALID`);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${code}_NON_CANONICAL`);
  return normalized;
}

function boundedText(value, name, maximum) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`RMA_${name}_INVALID`);
  }
  return text;
}

function decimalString(value, name, { signed = false } = {}) {
  const text = String(value ?? "").trim();
  const pattern = signed ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(text)) throw new Error(`RMA_${name}_INVALID`);
  const number = BigInt(text);
  if (!signed && number < 0n) throw new Error(`RMA_${name}_NEGATIVE`);
  return number;
}

function safeInteger(value, name) {
  const number = Number(decimalString(value, name));
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`RMA_${name}_NOT_SAFE_INTEGER`);
  }
  return number;
}

function nullableSafeInteger(value, name) {
  if (String(value ?? "").trim() === "") return null;
  return safeInteger(value, name);
}

function decimalRatio(numerator, denominator, places = 8) {
  if (denominator === 0n) return null;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const scale = 10n ** BigInt(places);
  const rounded = (absolute * scale + denominator / 2n) / denominator;
  const digits = rounded.toString().padStart(places + 1, "0");
  const integer = digits.slice(0, -places) || "0";
  const fraction = digits.slice(-places);
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function findZipEnd(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_END) return offset;
  }
  throw new Error("RMA_ZIP_END_NOT_FOUND");
}

function safeZipName(bytes, offset, length) {
  const name = bytes.subarray(offset, offset + length).toString("utf8");
  if (!name || Buffer.from(name, "utf8").length !== length
    || name.includes("\\") || name.startsWith("/") || name.includes("../")
    || name.split("/").includes("..") || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("RMA_ZIP_ENTRY_NAME_INVALID");
  }
  return name;
}

function extractSingleTextEntry(zipBytes) {
  const bytes = Buffer.isBuffer(zipBytes) ? zipBytes : Buffer.from(zipBytes ?? "");
  if (bytes.length < 22 || bytes.length > MAX_ZIP_BYTES) {
    throw new Error("RMA_ZIP_SIZE_INVALID");
  }
  const end = findZipEnd(bytes);
  const disk = bytes.readUInt16LE(end + 4);
  const centralDisk = bytes.readUInt16LE(end + 6);
  const diskEntries = bytes.readUInt16LE(end + 8);
  const totalEntries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  const commentLength = bytes.readUInt16LE(end + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries
    || totalEntries < 1 || totalEntries > 32
    || end + 22 + commentLength !== bytes.length
    || centralOffset + centralSize > end) {
    throw new Error("RMA_ZIP_CENTRAL_DIRECTORY_INVALID");
  }
  const files = [];
  const names = new Set();
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_CENTRAL_FILE) {
      throw new Error("RMA_ZIP_CENTRAL_ENTRY_INVALID");
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const expectedCrc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const entryCommentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const endOffset = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (endOffset > bytes.length || flags & 1 || ![0, 8].includes(method)
      || compressedSize > MAX_ZIP_BYTES || uncompressedSize > MAX_TEXT_BYTES) {
      throw new Error("RMA_ZIP_CENTRAL_ENTRY_UNSUPPORTED");
    }
    const name = safeZipName(bytes, offset + 46, nameLength);
    if (names.has(name)) throw new Error("RMA_ZIP_DUPLICATE_ENTRY_NAME");
    names.add(name);
    if (!name.endsWith("/")) files.push({ name, method, expectedCrc,
      compressedSize, uncompressedSize, localOffset });
    offset = endOffset;
  }
  if (offset !== centralOffset + centralSize) {
    throw new Error("RMA_ZIP_CENTRAL_SIZE_MISMATCH");
  }
  const textFiles = files.filter((entry) => /\.txt$/i.test(entry.name));
  if (files.length !== 1 || textFiles.length !== 1) {
    throw new Error("RMA_ZIP_SINGLE_TEXT_ENTRY_REQUIRED");
  }
  const entry = textFiles[0];
  if (entry.localOffset + 30 > bytes.length
    || bytes.readUInt32LE(entry.localOffset) !== ZIP_LOCAL_FILE) {
    throw new Error("RMA_ZIP_LOCAL_ENTRY_INVALID");
  }
  const localFlags = bytes.readUInt16LE(entry.localOffset + 6);
  const localMethod = bytes.readUInt16LE(entry.localOffset + 8);
  const localNameLength = bytes.readUInt16LE(entry.localOffset + 26);
  const localExtraLength = bytes.readUInt16LE(entry.localOffset + 28);
  const localName = safeZipName(bytes, entry.localOffset + 30, localNameLength);
  const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (localName !== entry.name || localFlags & 1 || localMethod !== entry.method
    || entry.localOffset >= centralOffset || dataEnd > centralOffset) {
    throw new Error("RMA_ZIP_LOCAL_BINDING_INVALID");
  }
  const compressed = bytes.subarray(dataOffset, dataEnd);
  let content;
  try {
    content = entry.method === 0 ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: MAX_TEXT_BYTES });
  } catch { throw new Error("RMA_ZIP_DECOMPRESSION_FAILED"); }
  if (content.length !== entry.uncompressedSize || crc32(content) !== entry.expectedCrc) {
    throw new Error("RMA_ZIP_CONTENT_INTEGRITY_INVALID");
  }
  return Object.freeze({ entryName: entry.name, content });
}

function parseRow(fields, rowNumber, expectedYear) {
  if (fields.length !== FIELD_COUNT) throw new Error(`RMA_ROW_WIDTH_INVALID:${rowNumber}`);
  const raw = Object.fromEntries(FIELD_NAMES.map((name, index) => [name, fields[index].trim()]));
  const row = {};
  for (const name of INTEGER_FIELDS) row[name] = safeInteger(raw[name], name.toUpperCase());
  for (const name of NULLABLE_INTEGER_FIELDS) {
    row[name] = nullableSafeInteger(raw[name], name.toUpperCase());
  }
  row.indemnityDollars = decimalString(raw.indemnityDollars, "INDEMNITY_DOLLARS",
    { signed: true });
  row.stateCode = boundedText(raw.stateCode, "STATE_CODE", 2);
  row.stateAbbreviation = boundedText(raw.stateAbbreviation, "STATE_ABBREVIATION", 2);
  row.countyCode = boundedText(raw.countyCode, "COUNTY_CODE", 3);
  row.countyName = boundedText(raw.countyName, "COUNTY_NAME", 35);
  row.commodityCode = boundedText(raw.commodityCode, "COMMODITY_CODE", 4);
  row.commodityName = boundedText(raw.commodityName, "COMMODITY_NAME", 30);
  row.insurancePlanCode = boundedText(raw.insurancePlanCode, "PLAN_CODE", 2);
  row.insurancePlanAbbreviation = boundedText(raw.insurancePlanAbbreviation,
    "PLAN_ABBREVIATION", 10);
  row.coverageCategory = boundedText(raw.coverageCategory, "COVERAGE_CATEGORY", 5);
  row.deliveryType = boundedText(raw.deliveryType, "DELIVERY_TYPE", 4);
  row.quantityType = boundedText(raw.quantityType, "QUANTITY_TYPE", 25);
  row.netReportedQuantity = nullableSafeInteger(raw.netReportedQuantity,
    "NET_REPORTED_QUANTITY");
  row.liabilityDollars = nullableSafeInteger(raw.liabilityDollars,
    "LIABILITY_DOLLARS");
  row.totalPremiumDollars = nullableSafeInteger(raw.totalPremiumDollars,
    "TOTAL_PREMIUM_DOLLARS");
  if (!/^(?:\d(?:\.\d{1,4})?|\.\d{1,4})$/.test(raw.coverageLevel)) {
    throw new Error(`RMA_COVERAGE_LEVEL_INVALID:${rowNumber}`);
  }
  row.coverageLevel = raw.coverageLevel;
  if (raw.publishedLossRatio !== ""
    && !/^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw.publishedLossRatio)) {
    throw new Error(`RMA_PUBLISHED_LOSS_RATIO_INVALID:${rowNumber}`);
  }
  row.publishedLossRatio = raw.publishedLossRatio || null;
  if (row.commodityYear !== expectedYear) throw new Error(`RMA_YEAR_MISMATCH:${rowNumber}`);
  row.policyLossCountExceedsExposure
    = row.policiesIndemnified > row.policiesEarningPremium;
  row.unitLossCountExceedsExposure = row.unitsIndemnified > row.unitsEarningPremium;
  return row;
}

function parseRows(textBytes, expectedYear) {
  const text = textBytes.toString("utf8");
  if (text.includes("\u0000") || Buffer.from(text, "utf8").length !== textBytes.length) {
    throw new Error("RMA_TEXT_ENCODING_INVALID");
  }
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length || lines.length > 2_000_000) throw new Error("RMA_TEXT_ROW_COUNT_INVALID");
  return lines.map((line, index) => parseRow(line.split("|"), index + 1, expectedYear));
}

function emptyTotals() {
  return {
    rows: 0, exposureCells: 0, noReportedLossCells: 0,
    zeroReportedLossExposureCells: 0, noExposureNoReportedLossCells: 0,
    negativeIndemnityAdjustmentCells: 0, missingNetReportedQuantityCells: 0,
    missingLiabilityCells: 0, missingPremiumCells: 0,
    missingPublishedLossRatioCells: 0, materialMissingMonetaryCells: 0,
    policyLossCountExceedsExposureCells: 0,
    unitLossCountExceedsExposureCells: 0,
    policiesSold: 0n,
    policiesEarningPremium: 0n, policiesIndemnified: 0n,
    unitsEarningPremium: 0n, unitsIndemnified: 0n,
    liabilityDollars: 0n, totalPremiumDollars: 0n, indemnityDollars: 0n,
  };
}

function addRow(totals, row) {
  totals.rows += 1;
  const hasExposure = row.policiesEarningPremium > 0 || row.unitsEarningPremium > 0;
  const noReportedLoss = row.policiesIndemnified === 0 && row.unitsIndemnified === 0
    && row.indemnityDollars === 0n;
  if (hasExposure) totals.exposureCells += 1;
  if (noReportedLoss) totals.noReportedLossCells += 1;
  if (hasExposure && noReportedLoss) totals.zeroReportedLossExposureCells += 1;
  if (!hasExposure && noReportedLoss) totals.noExposureNoReportedLossCells += 1;
  if (row.indemnityDollars < 0n) totals.negativeIndemnityAdjustmentCells += 1;
  if (row.netReportedQuantity === null) totals.missingNetReportedQuantityCells += 1;
  if (row.liabilityDollars === null) totals.missingLiabilityCells += 1;
  if (row.totalPremiumDollars === null) totals.missingPremiumCells += 1;
  if (row.publishedLossRatio === null) totals.missingPublishedLossRatioCells += 1;
  if ((row.liabilityDollars === null || row.totalPremiumDollars === null)
    && (row.policiesEarningPremium > 0 || row.unitsEarningPremium > 0
      || row.indemnityDollars !== 0n)) totals.materialMissingMonetaryCells += 1;
  if (row.policyLossCountExceedsExposure) {
    totals.policyLossCountExceedsExposureCells += 1;
  }
  if (row.unitLossCountExceedsExposure) totals.unitLossCountExceedsExposureCells += 1;
  for (const name of ["policiesSold", "policiesEarningPremium", "policiesIndemnified",
    "unitsEarningPremium", "unitsIndemnified"]) totals[name] += BigInt(row[name]);
  if (row.liabilityDollars !== null) totals.liabilityDollars += BigInt(row.liabilityDollars);
  if (row.totalPremiumDollars !== null) {
    totals.totalPremiumDollars += BigInt(row.totalPremiumDollars);
  }
  totals.indemnityDollars += row.indemnityDollars;
}

function projectTotals(totals) {
  const values = {};
  for (const name of ["rows", "exposureCells", "noReportedLossCells",
    "zeroReportedLossExposureCells", "noExposureNoReportedLossCells",
    "negativeIndemnityAdjustmentCells", "missingNetReportedQuantityCells",
    "missingLiabilityCells", "missingPremiumCells",
    "missingPublishedLossRatioCells", "materialMissingMonetaryCells",
    "policyLossCountExceedsExposureCells",
    "unitLossCountExceedsExposureCells"]) {
    values[name] = totals[name];
  }
  for (const name of ["policiesSold", "policiesEarningPremium", "policiesIndemnified",
    "unitsEarningPremium", "unitsIndemnified", "liabilityDollars",
    "totalPremiumDollars", "indemnityDollars"]) values[name] = totals[name].toString();
  values.reportedLossPolicyCellRate = decimalRatio(totals.policiesIndemnified,
    totals.policiesEarningPremium);
  values.reportedLossUnitCellRate = decimalRatio(totals.unitsIndemnified,
    totals.unitsEarningPremium);
  values.reportedLossPolicyCellRateModelEligible
    = totals.policyLossCountExceedsExposureCells === 0
      && totals.policiesEarningPremium > 0n;
  values.reportedLossUnitCellRateModelEligible
    = totals.unitLossCountExceedsExposureCells === 0
      && totals.unitsEarningPremium > 0n;
  values.historicalIndemnityPerEarningPolicyCellDollars = decimalRatio(
    totals.indemnityDollars, totals.policiesEarningPremium, 2);
  values.historicalIndemnityPerReportedLossPolicyCellDollars = decimalRatio(
    totals.indemnityDollars, totals.policiesIndemnified, 2);
  values.historicalIndemnityToPremiumRatio = decimalRatio(totals.indemnityDollars,
    totals.totalPremiumDollars);
  values.historicalIndemnityToLiabilityRatio = decimalRatio(totals.indemnityDollars,
    totals.liabilityDollars);
  values.historicalIndemnityRatioModelEligible
    = totals.materialMissingMonetaryCells === 0
      && totals.totalPremiumDollars > 0n && totals.liabilityDollars > 0n;
  return Object.freeze(values);
}

function cellKey(row) {
  return [row.commodityYear, row.stateCode, row.countyCode, row.commodityCode,
    row.insurancePlanCode, row.coverageCategory, row.deliveryType,
    row.coverageLevel, row.quantityType].join("\0");
}

function sourceArtifactBody(zipBytes, recordLayoutBytes, options) {
  const bytes = Buffer.isBuffer(zipBytes) ? zipBytes : Buffer.from(zipBytes ?? "");
  const layout = Buffer.isBuffer(recordLayoutBytes) ? recordLayoutBytes
    : Buffer.from(recordLayoutBytes ?? "");
  const generatedAt = canonicalTime(options.generatedAt, "RMA_GENERATED_AT");
  if (!HASH.test(String(options.sourceObjectHash ?? ""))
    || digestBytes(bytes) !== options.sourceObjectHash) {
    throw new Error("RMA_SOURCE_OBJECT_HASH_INVALID");
  }
  if (!HASH.test(String(options.recordLayoutHash ?? ""))
    || digestBytes(layout) !== options.recordLayoutHash
    || layout.length < 4 || layout.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("RMA_RECORD_LAYOUT_HASH_OR_FORMAT_INVALID");
  }
  const expectedYearSourceUrl = RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceUrl
    .replace("sobcov_2024.zip", `sobcov_${options.commodityYear}.zip`);
  if (options.sourceUrl !== expectedYearSourceUrl
    || options.recordLayoutUrl !== RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutUrl) {
    throw new Error("RMA_SOURCE_URL_NOT_OFFICIAL_PIN");
  }
  const extracted = extractSingleTextEntry(bytes);
  const rows = parseRows(extracted.content, options.commodityYear);
  const totals = emptyTotals();
  const states = new Map();
  const plans = new Map();
  const seenCells = new Set();
  let duplicateSemanticCells = 0;
  let clipRowsWithUnavailableCounts = 0;
  const rowCommitments = [];
  for (const row of rows) {
    addRow(totals, row);
    if (!states.has(row.stateAbbreviation)) states.set(row.stateAbbreviation, emptyTotals());
    if (!plans.has(row.insurancePlanAbbreviation)) {
      plans.set(row.insurancePlanAbbreviation, emptyTotals());
    }
    addRow(states.get(row.stateAbbreviation), row);
    addRow(plans.get(row.insurancePlanAbbreviation), row);
    const key = cellKey(row);
    if (seenCells.has(key)) duplicateSemanticCells += 1;
    seenCells.add(key);
    if (row.insurancePlanAbbreviation === "CLIP") clipRowsWithUnavailableCounts += 1;
    rowCommitments.push(domainHash("outsider/rma-sob-coverage-row/v1", {
      ...row, indemnityDollars: row.indemnityDollars.toString(),
    }));
  }
  const officialFrozenSourceVerified = options.sourceObjectHash
      === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash
    && bytes.length === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectBytes
    && options.recordLayoutHash === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash
    && layout.length === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutBytes
    && options.commodityYear === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.commodityYear
    && options.sourceUrl === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceUrl
    && options.recordLayoutUrl === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutUrl;
  const source = {
    datasetId: officialFrozenSourceVerified
      ? RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.datasetId
      : "CALLER_ASSERTED_RMA_SHAPED_FIXTURE",
    sourceTrustClass: officialFrozenSourceVerified
      ? "OFFICIAL_USDA_RMA_FROZEN_SOURCE_REPLAY"
      : "CALLER_ASSERTED_RMA_SHAPED_FIXTURE",
    publisher: officialFrozenSourceVerified ? "USDA_RISK_MANAGEMENT_AGENCY" : null,
    program: officialFrozenSourceVerified ? "FEDERAL_CROP_INSURANCE" : null,
    commodityYear: options.commodityYear,
    sourceUrl: officialFrozenSourceVerified ? options.sourceUrl : null,
    claimedSourceUrlNotVerified: officialFrozenSourceVerified ? null : options.sourceUrl,
    sourceObjectHash: options.sourceObjectHash,
    sourceObjectBytes: bytes.length,
    sourceEntryName: extracted.entryName,
    extractedObjectHash: digestBytes(extracted.content),
    extractedObjectBytes: extracted.content.length,
    recordLayoutUrl: officialFrozenSourceVerified ? options.recordLayoutUrl : null,
    claimedRecordLayoutUrlNotVerified:
      officialFrozenSourceVerified ? null : options.recordLayoutUrl,
    recordLayoutHash: options.recordLayoutHash,
    recordLayoutBytes: layout.length,
    generatedAt,
    officialFrozenSourceVerified,
    sourceArtifactsReverified: officialFrozenSourceVerified,
    snapshotMutability: officialFrozenSourceVerified
      ? "MOST_RECENT_FIVE_YEARS_REFRESHED_WEEKLY_BY_PUBLISHER" : "NOT_ESTABLISHED",
    completeness: officialFrozenSourceVerified
      ? "COMPLETE_PUBLISHED_FILE_SNAPSHOT_NOT_CLAIM_UNIVERSE_OR_ULTIMATE"
      : "CALLER_ASSERTED_SHAPE_ONLY_COMPLETENESS_NOT_ESTABLISHED",
  };
  const national = projectTotals(totals);
  return {
    schema: RMA_CROP_INSURANCE_EXPERIENCE_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt,
    adapter: {
      adapterId: "OUTSIDER_RMA_SOB_COVERAGE_EXPERIENCE",
      adapterVersion: "1.0.0",
      specificationHash: domainHash("outsider/rma-sob-coverage-adapter-spec/v1", {
        fieldNames: FIELD_NAMES,
        expectedFieldCount: FIELD_COUNT,
        zipPolicy: "SINGLE_NON_ENCRYPTED_STORED_OR_DEFLATED_TEXT_ENTRY_WITH_CRC",
        semanticCellFields: ["commodityYear", "stateCode", "countyCode",
          "commodityCode", "insurancePlanCode", "coverageCategory",
          "deliveryType", "coverageLevel", "quantityType"],
        countAnomalyPolicy: "PRESERVE_AND_QUARANTINE_FREQUENCY",
        missingMonetaryPolicy: "PRESERVE_AND_QUARANTINE_IF_MATERIAL",
        arithmetic: "BIGINT_SUM_AND_HALF_UP_FIXED_DECIMAL_RATIO",
      }),
    },
    source,
    sourceCommitmentHash: (officialFrozenSourceVerified
      ? pinnedLegacyEvidenceDomainHash : domainHash)(
      "outsider/rma-sob-coverage-source/v1", {
      sourceObjectHash: options.sourceObjectHash,
      recordLayoutHash: options.recordLayoutHash,
      extractedObjectHash: source.extractedObjectHash,
      rowCommitments,
      }),
    accounting: {
      sourceRows: rows.length,
      semanticCells: seenCells.size,
      duplicateSemanticCells,
      statesOrTerritories: states.size,
      insurancePlans: plans.size,
      clipRowsWithUnavailableCounts,
      zeroReportedLossExposureCellsPreserved: national.zeroReportedLossExposureCells,
      noExposureNoReportedLossCells: national.noExposureNoReportedLossCells,
      rowCommitmentCount: rowCommitments.length,
    },
    national,
    byState: Object.fromEntries([...states.entries()].sort(([left], [right]) => (
      left.localeCompare(right))).map(([name, value]) => [name, projectTotals(value)])),
    byInsurancePlan: Object.fromEntries([...plans.entries()].sort(([left], [right]) => (
      left.localeCompare(right))).map(([name, value]) => [name, projectTotals(value)])),
    evidenceClassification: {
      environmentReality: officialFrozenSourceVerified
        ? ["ORGANIC", "REAL_PHYSICAL"] : ["UNVERIFIED_FIXTURE"],
      empiricalStatus: officialFrozenSourceVerified
        ? "EMPIRICAL_RECORDED_ADMINISTRATIVE_SUMMARY"
        : "CALLER_ASSERTED_RMA_SHAPED_FIXTURE",
      authority: officialFrozenSourceVerified
        ? ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"] : ["CALLER_ASSERTED"],
      rights: {
        publicAccess: officialFrozenSourceVerified,
        publicAccessObservedFromDownloadedObjects: officialFrozenSourceVerified,
        distributionAndCopyingWebPolicyCuratorAssertionNotReplayed:
          officialFrozenSourceVerified,
        webPolicyBytesReplayed: false,
        modelTrainingRightsLegallyConcluded: false,
        adapterGrantsAdditionalRights: false,
      },
      sourceDomain: officialFrozenSourceVerified
        ? "US_FEDERAL_CROP_INSURANCE" : "UNVERIFIED_RMA_SHAPED_FIXTURE",
      transferToAiAgentOrRobotDomainEstablished: false,
    },
    semanticBoundary: {
      fieldDefinitionsPublisherVerified: officialFrozenSourceVerified,
      policiesEarningPremiumMeans: officialFrozenSourceVerified
        ? "POLICIES_FOR_WHICH_ACREAGE_WAS_REPORTED_TO_RMA"
        : "CALLER_ASSERTED_FIELD_SHAPED_LIKE_POLICIES_EARNING_PREMIUM",
      policiesIndemnifiedMeans: officialFrozenSourceVerified
        ? "POLICIES_FOR_WHICH_LOSSES_WERE_REPORTED_TO_RMA"
        : "CALLER_ASSERTED_FIELD_SHAPED_LIKE_POLICIES_INDEMNIFIED",
      liabilityMeans: officialFrozenSourceVerified
        ? "MAXIMUM_DOLLAR_INSURANCE_FOR_CROP_UNIT_LINE_ITEM"
        : "CALLER_ASSERTED_FIELD_SHAPED_LIKE_LIABILITY",
      indemnityMeans: officialFrozenSourceVerified
        ? "PUBLISHER_RECORDED_TOTAL_AMOUNT_OF_LOSS"
        : "CALLER_ASSERTED_FIELD_SHAPED_LIKE_INDEMNITY",
      indemnityIsCashPaid: false,
      indemnityIsCaseReserve: false,
      indemnityIsRecovery: false,
      reportedLossIsIndependentlyAdjudicatedClaim: false,
      policyCountsAreUniquePolicyholdersAcrossCells: false,
      individualClaimSeverityDistributionObserved: false,
      claimIdentityObserved: false,
      appealOrFraudDispositionObserved: false,
    },
    sourceDomainCalibration: {
      decision: !officialFrozenSourceVerified
        ? "QUARANTINE_CALLER_ASSERTED_RMA_SHAPED_FIXTURE"
        : duplicateSemanticCells !== 0 || totals.materialMissingMonetaryCells !== 0
        || totals.policiesEarningPremium === 0n || totals.unitsEarningPremium === 0n
        || totals.totalPremiumDollars === 0n || totals.liabilityDollars === 0n
        ? "QUARANTINE_SOURCE_ACCOUNTING_ANOMALY"
        : totals.policyLossCountExceedsExposureCells !== 0
          || totals.unitLossCountExceedsExposureCells !== 0
          ? "ADMIT_AGGREGATE_INDEMNITY_ONLY_FREQUENCY_QUARANTINED"
          : "ADMIT_DESCRIPTIVE_AGGREGATE_CALIBRATION_ONLY",
      callerAssertedFixture: !officialFrozenSourceVerified,
      completePublishedSnapshotExposureDenominatorObserved:
        officialFrozenSourceVerified && duplicateSemanticCells === 0,
      monetaryAggregatesCompleteForMaterialCells:
        officialFrozenSourceVerified && totals.materialMissingMonetaryCells === 0,
      zeroReportedLossExposureCellsPreserved:
        officialFrozenSourceVerified && totals.zeroReportedLossExposureCells > 0,
      publisherRecordedIndemnityObserved: officialFrozenSourceVerified,
      reportedLossFrequencyDescriptiveStatisticEligible:
        officialFrozenSourceVerified && duplicateSemanticCells === 0
        && totals.policyLossCountExceedsExposureCells === 0
        && totals.unitLossCountExceedsExposureCells === 0
        && totals.policiesEarningPremium > 0n && totals.unitsEarningPremium > 0n,
      aggregateIndemnityRatioDescriptiveStatisticEligible:
        officialFrozenSourceVerified && duplicateSemanticCells === 0
        && totals.materialMissingMonetaryCells === 0
        && totals.totalPremiumDollars > 0n && totals.liabilityDollars > 0n,
      individualSeverityModelEligible: false,
      tailOrTvarModelEligible: false,
      claimsLifecycleModelEligible: false,
      reserveDevelopmentModelEligible: false,
      paidRecoveryModelEligible: false,
    },
    outsiderModelEntrance: {
      decision: officialFrozenSourceVerified
        ? "ABSTAIN_SOURCE_DOMAIN_AGGREGATE_EXPERIENCE_ONLY"
        : "ABSTAIN_CALLER_ASSERTED_RMA_SHAPED_FIXTURE",
      useAsStructuralMathFixture: true,
      useAsOutOfDomainMagnitudePrior: false,
      useAsAgentOrRobotFrequencyPrior: false,
      useAsAgentOrRobotSeverityPrior: false,
      automaticTraining: false,
      permitsPricing: false,
      permitsCoverage: false,
      permitsCapital: false,
      permitsGuarantee: false,
      permitsSettlement: false,
      movesFunds: false,
      price: null,
      reserve: null,
      coverage: null,
      missingRequirements: [
        "AI_AGENT_OR_ROBOT_DOMAIN_EXPOSURE_AND_LOSS_LINKAGE",
        "INDIVIDUAL_CLAIM_AND_SEVERITY_RECORDS",
        "PAID_CASE_RESERVE_RECOVERY_AND_CLAIM_DEVELOPMENT_FIELDS",
        "INDEPENDENT_ADJUDICATION_FRAUD_AND_APPEAL_STATUS",
        "TEMPORAL_HOLDOUT_AND_TAIL_VALIDATION",
        "INDEPENDENT_ACTUARIAL_AND_LEGAL_REVIEW",
        "STANDING_ISSUER_FUNDED_RESERVE_AUTHORIZED_CUSTODY",
      ],
    },
    nextWaveCalibrationSources: STAGE234_DEFERRED_CALIBRATION_SOURCES,
  };
}

export function buildRmaCropInsuranceExperience(zipBytes, recordLayoutBytes, {
  sourceObjectHash = digestBytes(Buffer.isBuffer(zipBytes) ? zipBytes
    : Buffer.from(zipBytes ?? "")),
  recordLayoutHash = digestBytes(Buffer.isBuffer(recordLayoutBytes) ? recordLayoutBytes
    : Buffer.from(recordLayoutBytes ?? "")),
  generatedAt = RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.frozenAt,
  commodityYear = RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.commodityYear,
  sourceUrl = RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceUrl,
  recordLayoutUrl = RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutUrl,
} = {}) {
  const body = sourceArtifactBody(zipBytes, recordLayoutBytes, {
    sourceObjectHash, recordLayoutHash, generatedAt, commodityYear, sourceUrl,
    recordLayoutUrl,
  });
  const artifactHasher = body.source.officialFrozenSourceVerified
    ? pinnedLegacyEvidenceDomainHash : domainHash;
  return Object.freeze({ ...body,
    artifactHash: artifactHasher(RMA_CROP_INSURANCE_EXPERIENCE_SCHEMA,
      body) });
}

function officialClassificationValid(artifact) {
  const source = artifact.source;
  return source.datasetId === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.datasetId
    && source.sourceTrustClass === "OFFICIAL_USDA_RMA_FROZEN_SOURCE_REPLAY"
    && source.publisher === "USDA_RISK_MANAGEMENT_AGENCY"
    && source.program === "FEDERAL_CROP_INSURANCE"
    && source.commodityYear === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.commodityYear
    && source.sourceUrl === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceUrl
    && source.claimedSourceUrlNotVerified === null
    && source.sourceObjectHash === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash
    && source.sourceObjectBytes === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectBytes
    && source.recordLayoutUrl === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutUrl
    && source.claimedRecordLayoutUrlNotVerified === null
    && source.recordLayoutHash === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash
    && source.recordLayoutBytes === RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutBytes
    && source.officialFrozenSourceVerified === true
    && source.sourceArtifactsReverified === true
    && artifact.evidenceClassification.empiricalStatus
      === "EMPIRICAL_RECORDED_ADMINISTRATIVE_SUMMARY"
    && canonicalizeStrict(artifact.evidenceClassification.authority)
      === canonicalizeStrict(["PUBLISHER_DECLARED", "SOURCE_REPLAYED"])
    && artifact.evidenceClassification.rights.publicAccess === true
    && artifact.evidenceClassification.rights
      .publicAccessObservedFromDownloadedObjects === true
    && artifact.evidenceClassification.rights
      .distributionAndCopyingWebPolicyCuratorAssertionNotReplayed === true
    && artifact.evidenceClassification.rights.webPolicyBytesReplayed === false
    && artifact.evidenceClassification.sourceDomain === "US_FEDERAL_CROP_INSURANCE"
    && artifact.semanticBoundary.fieldDefinitionsPublisherVerified === true
    && artifact.sourceDomainCalibration.callerAssertedFixture === false
    && !artifact.sourceDomainCalibration.decision.startsWith("QUARANTINE_CALLER_ASSERTED")
    && artifact.outsiderModelEntrance.decision
      === "ABSTAIN_SOURCE_DOMAIN_AGGREGATE_EXPERIENCE_ONLY";
}

function fixtureClassificationValid(artifact) {
  const source = artifact.source;
  return source.datasetId === "CALLER_ASSERTED_RMA_SHAPED_FIXTURE"
    && source.sourceTrustClass === "CALLER_ASSERTED_RMA_SHAPED_FIXTURE"
    && source.publisher === null && source.program === null
    && source.sourceUrl === null && typeof source.claimedSourceUrlNotVerified === "string"
    && source.recordLayoutUrl === null
    && typeof source.claimedRecordLayoutUrlNotVerified === "string"
    && source.officialFrozenSourceVerified === false
    && source.sourceArtifactsReverified === false
    && source.snapshotMutability === "NOT_ESTABLISHED"
    && source.completeness === "CALLER_ASSERTED_SHAPE_ONLY_COMPLETENESS_NOT_ESTABLISHED"
    && canonicalizeStrict(artifact.evidenceClassification.environmentReality)
      === canonicalizeStrict(["UNVERIFIED_FIXTURE"])
    && artifact.evidenceClassification.empiricalStatus
      === "CALLER_ASSERTED_RMA_SHAPED_FIXTURE"
    && canonicalizeStrict(artifact.evidenceClassification.authority)
      === canonicalizeStrict(["CALLER_ASSERTED"])
    && Object.values(artifact.evidenceClassification.rights).every((value) => value === false)
    && artifact.evidenceClassification.sourceDomain === "UNVERIFIED_RMA_SHAPED_FIXTURE"
    && artifact.semanticBoundary.fieldDefinitionsPublisherVerified === false
    && artifact.sourceDomainCalibration.callerAssertedFixture === true
    && artifact.sourceDomainCalibration.decision
      === "QUARANTINE_CALLER_ASSERTED_RMA_SHAPED_FIXTURE"
    && ["completePublishedSnapshotExposureDenominatorObserved",
      "monetaryAggregatesCompleteForMaterialCells",
      "zeroReportedLossExposureCellsPreserved", "publisherRecordedIndemnityObserved",
      "reportedLossFrequencyDescriptiveStatisticEligible",
      "aggregateIndemnityRatioDescriptiveStatisticEligible", "individualSeverityModelEligible",
      "tailOrTvarModelEligible", "claimsLifecycleModelEligible",
      "reserveDevelopmentModelEligible", "paidRecoveryModelEligible"]
      .every((name) => artifact.sourceDomainCalibration[name] === false)
    && artifact.outsiderModelEntrance.decision
      === "ABSTAIN_CALLER_ASSERTED_RMA_SHAPED_FIXTURE";
}

function rmaArtifactSchemaValid(artifact) {
  const topKeys = ["schema", "schemaVersion", "generatedAt", "adapter", "source",
    "sourceCommitmentHash", "accounting", "national", "byState", "byInsurancePlan",
    "evidenceClassification", "semanticBoundary", "sourceDomainCalibration",
    "outsiderModelEntrance", "nextWaveCalibrationSources", "artifactHash"];
  const sourceKeys = ["datasetId", "sourceTrustClass", "publisher", "program",
    "commodityYear", "sourceUrl", "claimedSourceUrlNotVerified", "sourceObjectHash",
    "sourceObjectBytes", "sourceEntryName", "extractedObjectHash",
    "extractedObjectBytes", "recordLayoutUrl", "claimedRecordLayoutUrlNotVerified",
    "recordLayoutHash", "recordLayoutBytes", "generatedAt", "officialFrozenSourceVerified",
    "sourceArtifactsReverified", "snapshotMutability", "completeness"];
  const accountingKeys = ["sourceRows", "semanticCells", "duplicateSemanticCells",
    "statesOrTerritories", "insurancePlans", "clipRowsWithUnavailableCounts",
    "zeroReportedLossExposureCellsPreserved", "noExposureNoReportedLossCells",
    "rowCommitmentCount"];
  const semanticKeys = ["fieldDefinitionsPublisherVerified",
    "policiesEarningPremiumMeans", "policiesIndemnifiedMeans", "liabilityMeans",
    "indemnityMeans", "indemnityIsCashPaid", "indemnityIsCaseReserve",
    "indemnityIsRecovery", "reportedLossIsIndependentlyAdjudicatedClaim",
    "policyCountsAreUniquePolicyholdersAcrossCells",
    "individualClaimSeverityDistributionObserved", "claimIdentityObserved",
    "appealOrFraudDispositionObserved"];
  const calibrationKeys = ["decision", "callerAssertedFixture",
    "completePublishedSnapshotExposureDenominatorObserved",
    "monetaryAggregatesCompleteForMaterialCells", "zeroReportedLossExposureCellsPreserved",
    "publisherRecordedIndemnityObserved",
    "reportedLossFrequencyDescriptiveStatisticEligible",
    "aggregateIndemnityRatioDescriptiveStatisticEligible", "individualSeverityModelEligible",
    "tailOrTvarModelEligible", "claimsLifecycleModelEligible",
    "reserveDevelopmentModelEligible", "paidRecoveryModelEligible"];
  const outsiderKeys = ["decision", "useAsStructuralMathFixture",
    "useAsOutOfDomainMagnitudePrior", "useAsAgentOrRobotFrequencyPrior",
    "useAsAgentOrRobotSeverityPrior", "automaticTraining", "permitsPricing",
    "permitsCoverage", "permitsCapital", "permitsGuarantee", "permitsSettlement",
    "movesFunds", "price", "reserve", "coverage", "missingRequirements"];
  return exactKeys(artifact, topKeys)
    && artifact.schema === RMA_CROP_INSURANCE_EXPERIENCE_SCHEMA
    && artifact.schemaVersion === "1.0.0"
    && canonicalTime(artifact.generatedAt, "RMA_ARTIFACT_GENERATED_AT")
      === artifact.generatedAt
    && HASH.test(artifact.artifactHash ?? "")
    && HASH.test(artifact.sourceCommitmentHash ?? "")
    && exactKeys(artifact.adapter, ["adapterId", "adapterVersion", "specificationHash"])
    && artifact.adapter.adapterId === "OUTSIDER_RMA_SOB_COVERAGE_EXPERIENCE"
    && artifact.adapter.adapterVersion === "1.0.0"
    && HASH.test(artifact.adapter.specificationHash ?? "")
    && exactKeys(artifact.source, sourceKeys)
    && HASH.test(artifact.source.sourceObjectHash ?? "")
    && HASH.test(artifact.source.extractedObjectHash ?? "")
    && HASH.test(artifact.source.recordLayoutHash ?? "")
    && artifact.source.generatedAt === artifact.generatedAt
    && exactKeys(artifact.accounting, accountingKeys)
    && exactKeys(artifact.national, PROJECTED_TOTAL_KEYS)
    && exactKeys(artifact.byState, Object.keys(artifact.byState))
    && Object.values(artifact.byState).every((value) => exactKeys(value,
      PROJECTED_TOTAL_KEYS))
    && exactKeys(artifact.byInsurancePlan, Object.keys(artifact.byInsurancePlan))
    && Object.values(artifact.byInsurancePlan).every((value) => exactKeys(value,
      PROJECTED_TOTAL_KEYS))
    && exactKeys(artifact.evidenceClassification,
      ["environmentReality", "empiricalStatus", "authority", "rights", "sourceDomain",
        "transferToAiAgentOrRobotDomainEstablished"])
    && exactKeys(artifact.evidenceClassification.rights,
      ["publicAccess", "publicAccessObservedFromDownloadedObjects",
        "distributionAndCopyingWebPolicyCuratorAssertionNotReplayed",
        "webPolicyBytesReplayed",
        "modelTrainingRightsLegallyConcluded", "adapterGrantsAdditionalRights"])
    && exactKeys(artifact.semanticBoundary, semanticKeys)
    && exactKeys(artifact.sourceDomainCalibration, calibrationKeys)
    && exactKeys(artifact.outsiderModelEntrance, outsiderKeys)
    && canonicalizeStrict(artifact.nextWaveCalibrationSources)
      === canonicalizeStrict(STAGE234_DEFERRED_CALIBRATION_SOURCES)
    && (artifact.source.officialFrozenSourceVerified === true
      ? officialClassificationValid(artifact) : fixtureClassificationValid(artifact));
}

function authorityBoundaryValid(artifact) {
  return artifact?.semanticBoundary?.indemnityIsCashPaid === false
    && artifact?.semanticBoundary?.indemnityIsCaseReserve === false
    && artifact?.semanticBoundary?.indemnityIsRecovery === false
    && artifact?.semanticBoundary?.reportedLossIsIndependentlyAdjudicatedClaim === false
    && artifact?.sourceDomainCalibration?.individualSeverityModelEligible === false
    && artifact?.sourceDomainCalibration?.tailOrTvarModelEligible === false
    && artifact?.evidenceClassification?.transferToAiAgentOrRobotDomainEstablished === false
    && ["automaticTraining", "permitsPricing", "permitsCoverage", "permitsCapital",
      "permitsGuarantee", "permitsSettlement", "movesFunds"].every((name) => (
      artifact?.outsiderModelEntrance?.[name] === false))
    && artifact?.outsiderModelEntrance?.price === null
    && artifact?.outsiderModelEntrance?.reserve === null
    && artifact?.outsiderModelEntrance?.coverage === null;
}

export function verifyRmaCropInsuranceExperience(artifact) {
  const failures = [];
  try {
    if (!rmaArtifactSchemaValid(artifact)) failures.push("RMA_EXPERIENCE_SCHEMA_INVALID");
    const { artifactHash, ...body } = artifact;
    const artifactHasher = artifact?.source?.officialFrozenSourceVerified
      ? pinnedLegacyEvidenceDomainHash : domainHash;
    if (artifactHash !== artifactHasher(
      RMA_CROP_INSURANCE_EXPERIENCE_SCHEMA, body)) {
      failures.push("RMA_EXPERIENCE_SELF_HASH_INVALID");
    }
  } catch (error) {
    failures.push(`RMA_EXPERIENCE_STRUCTURE_FAILED:${error instanceof Error
      ? error.message : String(error)}`);
  }
  if (!authorityBoundaryValid(artifact)) {
    failures.push("RMA_EXPERIENCE_AUTHORITY_OR_SEMANTIC_BOUNDARY_INVALID");
  }
  return Object.freeze({
    ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]),
    verificationLevel: failures.length === 0
      ? "SELF_SEALED_UNTRUSTED_ENVELOPE" : "INVALID",
    artifactStructureVerified: false,
    envelopeSchemaSubsetVerified: failures.length === 0,
    envelopeSelfHashVerified: failures.length === 0,
    metricDerivationVerified: false,
    authorityBoundaryVerified: false,
    inputBytesReproduced: false,
    sourceArtifactsReverified: false,
    officialFrozenSourceVerified: false,
    artifactClaimsOfficialFrozenSource:
      artifact?.source?.officialFrozenSourceVerified === true,
    sourceDomainCalibrationDecision: null,
    artifactClaimedSourceDomainCalibrationDecision: failures.length === 0
      ? artifact.sourceDomainCalibration.decision : null,
    outsiderDecision: failures.length === 0
      ? artifact.outsiderModelEntrance.decision : null,
  });
}

export function verifyRmaCropInsuranceExperienceWithSource(artifact, zipBytes,
  recordLayoutBytes) {
  const standalone = verifyRmaCropInsuranceExperience(artifact);
  if (!standalone.ok) return standalone;
  const failures = [];
  let expected = null;
  try {
    expected = buildRmaCropInsuranceExperience(zipBytes, recordLayoutBytes, {
      sourceObjectHash: artifact.source.sourceObjectHash,
      recordLayoutHash: artifact.source.recordLayoutHash,
      generatedAt: artifact.generatedAt,
      commodityYear: artifact.source.commodityYear,
      sourceUrl: artifact.source.sourceUrl ?? artifact.source.claimedSourceUrlNotVerified,
      recordLayoutUrl: artifact.source.recordLayoutUrl
        ?? artifact.source.claimedRecordLayoutUrlNotVerified,
    });
    const exactReplayMatched = expected.source.officialFrozenSourceVerified
      ? samePinnedLegacyEvidence(expected, artifact)
      : canonicalizeStrict(expected) === canonicalizeStrict(artifact);
    if (!exactReplayMatched) {
      failures.push("RMA_EXPERIENCE_DERIVATION_INVALID");
    }
  } catch (error) {
    failures.push(`RMA_EXPERIENCE_SOURCE_REPLAY_FAILED:${error instanceof Error
      ? error.message : String(error)}`);
  }
  const official = failures.length === 0 && expected.source.officialFrozenSourceVerified;
  return Object.freeze({
    ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]),
    verificationLevel: failures.length !== 0 ? "INVALID"
      : official ? "FULL_OFFICIAL_USDA_RMA_SOURCE_REPLAYED"
        : "CALLER_ASSERTED_FIXTURE_BYTES_REPLAYED",
    artifactStructureVerified: true,
    inputBytesReproduced: failures.length === 0,
    sourceArtifactsReverified: official,
    officialFrozenSourceVerified: official,
    artifactClaimsOfficialFrozenSource:
      artifact.source.officialFrozenSourceVerified === true,
    sourceDomainCalibrationDecision: failures.length === 0
      ? expected.sourceDomainCalibration.decision : null,
    artifactClaimedSourceDomainCalibrationDecision: failures.length === 0
      ? artifact.sourceDomainCalibration.decision : null,
    outsiderDecision: failures.length === 0
      ? expected.outsiderModelEntrance.decision : null,
  });
}
