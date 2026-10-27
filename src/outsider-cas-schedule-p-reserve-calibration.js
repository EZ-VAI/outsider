/*
 * CAS-hosted, S&P-compiled NAIC Schedule P reserve-development calibration.
 *
 * This lane replays six public CSVs whose upper triangles are observations
 * available at year-end 2007 and whose lower triangles are later outcomes.
 * It is a real U.S. P&C reserving backtest, not evidence about AI-agent or
 * robot losses and not authority to quote, issue coverage, hold funds, or pay.
 */

import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { canonicalizeStrict } from "./canonical.js";
import { canonicalizePinnedLegacyEvidence } from
  "./outsider-pinned-legacy-evidence-canonical.js";

export const CAS_SCHEDULE_P_RESERVE_CALIBRATION_SCHEMA
  = "outsider/cas-schedule-p-reserve-calibration/v1";

export const CAS_SCHEDULE_P_SOURCE_PAGE = Object.freeze({
  url: "https://www.casact.org/publications-research/research/research-resources/loss-reserving-data-pulled-naic-schedule-p",
  hash: "sha256:dbf2c60c79b9422f814b4a049ed9b427c64562b41e2bff6310a618ae9ab64e72",
  bytes: 153_047,
  accessedAt: "2026-08-21T07:54:00.000Z",
  publisher: "CASUALTY_ACTUARIAL_SOCIETY",
  compiler: "SP_GLOBAL_MARKET_INTELLIGENCE_FOR_CAS",
  underlyingRegulatorySource: "NAIC_SCHEDULE_P",
  pageReleaseLabel: "UPDATED_DECEMBER_2025",
  pageRequestsResearchPublicationAcknowledgement: true,
});

export const CAS_SCHEDULE_P_FROZEN_FILES = Object.freeze([
  Object.freeze({
    lineId: "PRIVATE_PASSENGER_AUTO_LIABILITY_MEDICAL",
    lineCode: "B",
    fileName: "ppauto.csv",
    url: "https://www.casact.org/sites/default/files/2026-03/ppauto_pos98-07%20%281%29.csv",
    hash: "sha256:6e838f1e44c67218133ef1c8e28ca2b34b9f21ba4ee94de408c412638f798d96",
    bytes: 1_026_762,
    coverageBasis: "CAS_PAGE_DOES_NOT_SEPARATELY_LABEL_CLAIMS_MADE",
  }),
  Object.freeze({
    lineId: "WORKERS_COMPENSATION",
    lineCode: "D",
    fileName: "wkcomp.csv",
    url: "https://www.casact.org/sites/default/files/2026-03/wkcomp_pos_98-07.csv",
    hash: "sha256:8d0b02bed0939e932f9078f65266e9a398f580f90e5227cde053dd5b520affef",
    bytes: 907_835,
    coverageBasis: "CAS_PAGE_DOES_NOT_SEPARATELY_LABEL_CLAIMS_MADE",
  }),
  Object.freeze({
    lineId: "COMMERCIAL_AUTO_TRUCK_LIABILITY_MEDICAL",
    lineCode: "C",
    fileName: "comauto.csv",
    url: "https://www.casact.org/sites/default/files/2026-03/comauto_pos_98-07.csv",
    hash: "sha256:5012bd4c9048e300669e2f4fc915850449099e159481b4c3349b574f6f00afe1",
    bytes: 1_097_152,
    coverageBasis: "CAS_PAGE_DOES_NOT_SEPARATELY_LABEL_CLAIMS_MADE",
  }),
  Object.freeze({
    lineId: "MEDICAL_MALPRACTICE_CLAIMS_MADE",
    lineCode: "F2",
    fileName: "medmal.csv",
    url: "https://www.casact.org/sites/default/files/2026-03/medmal_pos_98-07.csv",
    hash: "sha256:50ea237914797562661b82996765e40b1fd09784a63130463bbd4972f74dbba3",
    bytes: 246_302,
    coverageBasis: "CLAIMS_MADE",
  }),
  Object.freeze({
    lineId: "PRODUCT_LIABILITY_OCCURRENCE",
    lineCode: "R1",
    fileName: "prodliab.csv",
    url: "https://www.casact.org/sites/default/files/2026-03/prodliab_pos_98-07.csv",
    hash: "sha256:f1070b5a95658bfeb6719fdf4ffdabc8b7e3f97771cdb4b3f503eb7d6e486f01",
    bytes: 430_765,
    coverageBasis: "OCCURRENCE",
  }),
  Object.freeze({
    lineId: "OTHER_LIABILITY_OCCURRENCE",
    lineCode: "H1",
    fileName: "othliab.csv",
    url: "https://www.casact.org/sites/default/files/2026-03/othliab_pos_98-07.csv",
    hash: "sha256:f514136de4be7b5ac114346709c309cd2464861e9fbb683051849f9fa6eadc50",
    bytes: 1_609_342,
    coverageBasis: "OCCURRENCE",
  }),
]);

const HEADER = Object.freeze([
  "GRCODE", "GRNAME", "AccidentYear", "DevelopmentYear", "DevelopmentLag",
  "IncurredLosses", "CumPaidLoss", "BulkLoss", "EarnedPremDIR",
  "EarnedPremCeded", "EarnedPremNet", "Single", "PostedReserves2007",
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const INTEGER = /^-?(?:0|[1-9]\d{0,17})$/;
const UNSIGNED = /^(?:0|[1-9]\d{0,17})$/;
const FIXED_THREE = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,3})?$/;
const FROZEN_VALUATION_YEAR = 2007;
const FIRST_ACCIDENT_YEAR = 1998;
const LAST_ACCIDENT_YEAR = 2007;
const MAX_DEVELOPMENT_LAG = 10;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
}

function domainHash(domain, value) { return digest({ domain, value }); }

/* Compatibility for the exact frozen official Schedule P row commitment set.
 * The general serializer remains at its ordinary trust-boundary limits. */
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
  const canonical = new Date(value).toISOString();
  if (canonical !== value) throw new Error(`${code}_NOT_CANONICAL`);
  return canonical;
}

function decodeUtf8(bytes, code) {
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? "");
  if (value.length === 0 || value.length > MAX_SOURCE_BYTES) {
    throw new Error(`${code}_SIZE_INVALID`);
  }
  let text;
  try { text = UTF8.decode(value); } catch { throw new Error(`${code}_UTF8_INVALID`); }
  if (text.includes("\u0000")) throw new Error(`${code}_NUL_INVALID`);
  return { bytes: value, text };
}

function integer(value, code) {
  if (!INTEGER.test(value)) throw new Error(`${code}_INVALID`);
  return BigInt(value);
}

function unsignedInteger(value, code) {
  if (!UNSIGNED.test(value)) throw new Error(`${code}_INVALID`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${code}_UNSAFE`);
  return parsed;
}

function fixedThree(value, code) {
  if (!FIXED_THREE.test(value)) throw new Error(`${code}_INVALID`);
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return negative ? -scaled : scaled;
}

function fixedThreeString(value) {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / 1000n;
  const fraction = String(magnitude % 1000n).padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function decimalRatio(numerator, denominator, scale = 8) {
  if (denominator === 0n) return null;
  const negative = (numerator < 0n) !== (denominator < 0n);
  const left = numerator < 0n ? -numerator : numerator;
  const right = denominator < 0n ? -denominator : denominator;
  const factor = 10n ** BigInt(scale);
  const rounded = (left * factor * 2n + right) / (2n * right);
  const whole = rounded / factor;
  const fraction = String(rounded % factor).padStart(scale, "0");
  return `${negative && rounded !== 0n ? "-" : ""}${whole}.${fraction}`;
}

function roundRatio(numerator, denominator) {
  if (denominator === 0n) return null;
  const negative = (numerator < 0n) !== (denominator < 0n);
  const left = numerator < 0n ? -numerator : numerator;
  const right = denominator < 0n ? -denominator : denominator;
  const rounded = (left * 2n + right) / (2n * right);
  return negative ? -rounded : rounded;
}

function abs(value) { return value < 0n ? -value : value; }

function exactLines(text, code) {
  if (text.includes("\r") && !text.includes("\r\n")) {
    throw new Error(`${code}_LINE_ENDING_INVALID`);
  }
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length < 2 || lines.length > 1_000_000 || lines.some((line) => line === "")) {
    throw new Error(`${code}_ROW_COUNT_OR_BLANK_INVALID`);
  }
  return lines;
}

function parseCsv(bytes, spec) {
  const decoded = decodeUtf8(bytes, `CAS_${spec.lineCode}_CSV`);
  const lines = exactLines(decoded.text, `CAS_${spec.lineCode}_CSV`);
  if (lines[0].split(",").join("\0") !== HEADER.join("\0")) {
    throw new Error(`CAS_${spec.lineCode}_HEADER_INVALID`);
  }
  const rows = [];
  for (let index = 1; index < lines.length; index += 1) {
    const fields = lines[index].split(",");
    if (fields.length !== HEADER.length || fields.some((field) => field.includes('"'))) {
      throw new Error(`CAS_${spec.lineCode}_ROW_WIDTH_OR_QUOTE_INVALID:${index + 1}`);
    }
    const groupCode = unsignedInteger(fields[0], `CAS_${spec.lineCode}_GROUP_CODE`);
    const groupName = fields[1];
    if (!groupName || groupName.length > 160 || groupName !== groupName.trim()
      || /[\u0000-\u001f\u007f]/.test(groupName)) {
      throw new Error(`CAS_${spec.lineCode}_GROUP_NAME_INVALID:${index + 1}`);
    }
    const accidentYear = unsignedInteger(fields[2], `CAS_${spec.lineCode}_ACCIDENT_YEAR`);
    const developmentYear = unsignedInteger(fields[3], `CAS_${spec.lineCode}_DEVELOPMENT_YEAR`);
    const developmentLag = unsignedInteger(fields[4], `CAS_${spec.lineCode}_DEVELOPMENT_LAG`);
    if (accidentYear < FIRST_ACCIDENT_YEAR || accidentYear > LAST_ACCIDENT_YEAR
      || developmentLag < 1 || developmentLag > MAX_DEVELOPMENT_LAG
      || developmentYear !== accidentYear + developmentLag - 1) {
      throw new Error(`CAS_${spec.lineCode}_TRIANGLE_AXIS_INVALID:${index + 1}`);
    }
    const single = unsignedInteger(fields[11], `CAS_${spec.lineCode}_SINGLE`);
    if (single !== 0 && single !== 1) {
      throw new Error(`CAS_${spec.lineCode}_SINGLE_INVALID:${index + 1}`);
    }
    rows.push(Object.freeze({
      lineId: spec.lineId,
      lineCode: spec.lineCode,
      groupCode,
      groupName,
      accidentYear,
      developmentYear,
      developmentLag,
      incurredLosses: integer(fields[5], `CAS_${spec.lineCode}_INCURRED`),
      cumulativePaidLoss: integer(fields[6], `CAS_${spec.lineCode}_PAID`),
      bulkAndIbnr: integer(fields[7], `CAS_${spec.lineCode}_BULK`),
      earnedPremiumDirectAndAssumed: integer(fields[8], `CAS_${spec.lineCode}_PREMIUM_DIR`),
      earnedPremiumCeded: integer(fields[9], `CAS_${spec.lineCode}_PREMIUM_CEDED`),
      earnedPremiumNet: integer(fields[10], `CAS_${spec.lineCode}_PREMIUM_NET`),
      single,
      postedReserve2007MilliSourceUnits: fixedThree(fields[12],
        `CAS_${spec.lineCode}_POSTED_RESERVE`),
    }));
  }
  return Object.freeze({ bytes: decoded.bytes, rows: Object.freeze(rows) });
}

function rowKey(row) {
  return `${row.lineCode}\0${row.groupCode}\0${row.accidentYear}\0${row.developmentLag}`;
}

function cohortKey(row) { return `${row.groupCode}\0${row.accidentYear}`; }

function addBig(target, name, value) { target[name] = (target[name] ?? 0n) + value; }

function axisBucket() {
  return {
    cells: 0, upperTriangleCells: 0, lowerTriangleCells: 0,
    negativeIncurredCells: 0, negativePaidCells: 0, negativeBulkAndIbnrCells: 0,
    incurredLosses: 0n, cumulativePaidLoss: 0n, bulkAndIbnr: 0n,
    incrementalPaidLoss: 0n, negativeIncrementalPaidCells: 0,
    incrementalPaidCells: 0,
  };
}

function addAxisRow(bucket, row, prior) {
  bucket.cells += 1;
  if (row.developmentYear <= FROZEN_VALUATION_YEAR) bucket.upperTriangleCells += 1;
  else bucket.lowerTriangleCells += 1;
  if (row.incurredLosses < 0n) bucket.negativeIncurredCells += 1;
  if (row.cumulativePaidLoss < 0n) bucket.negativePaidCells += 1;
  if (row.bulkAndIbnr < 0n) bucket.negativeBulkAndIbnrCells += 1;
  addBig(bucket, "incurredLosses", row.incurredLosses);
  addBig(bucket, "cumulativePaidLoss", row.cumulativePaidLoss);
  addBig(bucket, "bulkAndIbnr", row.bulkAndIbnr);
  if (row.developmentLag === 1 || prior) {
    const incremental = row.developmentLag === 1
      ? row.cumulativePaidLoss : row.cumulativePaidLoss - prior.cumulativePaidLoss;
    addBig(bucket, "incrementalPaidLoss", incremental);
    bucket.incrementalPaidCells += 1;
    if (incremental < 0n) bucket.negativeIncrementalPaidCells += 1;
  }
}

function projectAxis(bucket) {
  return Object.freeze({
    cells: bucket.cells,
    upperTriangleCells: bucket.upperTriangleCells,
    lowerTriangleCells: bucket.lowerTriangleCells,
    negativeIncurredCells: bucket.negativeIncurredCells,
    negativePaidCells: bucket.negativePaidCells,
    negativeBulkAndIbnrCells: bucket.negativeBulkAndIbnrCells,
    incurredLossesSourceUnits: bucket.incurredLosses.toString(),
    cumulativePaidObservationSumSourceUnits: bucket.cumulativePaidLoss.toString(),
    bulkAndIbnrObservationSumSourceUnits: bucket.bulkAndIbnr.toString(),
    incrementalPaidLossSourceUnits: bucket.incrementalPaidLoss.toString(),
    incrementalPaidCells: bucket.incrementalPaidCells,
    negativeIncrementalPaidCells: bucket.negativeIncrementalPaidCells,
  });
}

function sortedObject(map, projector = (value) => value) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => (
    String(left).localeCompare(String(right), "en", { numeric: true })
  )).map(([key, value]) => [key, projector(value)]));
}

function estimateFactors(cells, field) {
  const factors = [];
  for (let lag = 1; lag < MAX_DEVELOPMENT_LAG; lag += 1) {
    let numerator = 0n;
    let denominator = 0n;
    let pairs = 0;
    let negativeMemberPairs = 0;
    for (const row of cells.values()) {
      if (row.developmentLag !== lag) continue;
      const next = cells.get(`${row.groupCode}\0${row.accidentYear}\0${lag + 1}`);
      if (!next || next.developmentYear > FROZEN_VALUATION_YEAR) continue;
      pairs += 1;
      if (row[field] < 0n || next[field] < 0n) negativeMemberPairs += 1;
      denominator += row[field];
      numerator += next[field];
    }
    factors.push(Object.freeze({
      fromDevelopmentLag: lag,
      toDevelopmentLag: lag + 1,
      trainingPairs: pairs,
      negativeMemberPairs,
      numeratorSourceUnits: numerator.toString(),
      denominatorSourceUnits: denominator.toString(),
      volumeWeightedFactor: denominator > 0n && numerator > 0n
        ? decimalRatio(numerator, denominator) : null,
      modelArithmeticEligible: pairs > 0 && denominator > 0n && numerator > 0n,
      _numerator: numerator,
      _denominator: denominator,
    }));
  }
  return factors;
}

function publicFactors(factors) {
  return Object.freeze(factors.map(({ _numerator, _denominator, ...factor }) => (
    Object.freeze(factor)
  )));
}

function predictFromFactors(base, factors, startLag) {
  let numerator = base;
  let denominator = 1n;
  for (let lag = startLag; lag < MAX_DEVELOPMENT_LAG; lag += 1) {
    const factor = factors[lag - 1];
    if (!factor?.modelArithmeticEligible) return null;
    numerator *= factor._numerator;
    denominator *= factor._denominator;
  }
  return roundRatio(numerator, denominator);
}

function emptyBacktest() {
  return {
    candidateCohorts: 0, evaluatedCohorts: 0, missingEndpointCohorts: 0,
    negativeEndpointCohorts: 0, missingFactorCohorts: 0,
    predictedNegativeFutureDevelopmentCohorts: 0,
    actualNegativeFutureDevelopmentCohorts: 0,
    base: 0n, actualUltimate: 0n, predictedUltimate: 0n,
    actualFutureDevelopment: 0n, predictedFutureDevelopment: 0n,
    absoluteUltimateError: 0n, absoluteActualUltimate: 0n,
    absoluteFutureDevelopmentError: 0n, absoluteActualFutureDevelopment: 0n,
  };
}

function evaluateBacktest(cells, factors, field) {
  const result = emptyBacktest();
  const cohorts = new Set([...cells.values()].map(cohortKey));
  for (const key of cohorts) {
    const [groupCode, accidentYearText] = key.split("\0");
    const accidentYear = Number(accidentYearText);
    if (accidentYear <= FIRST_ACCIDENT_YEAR) continue;
    result.candidateCohorts += 1;
    const baseLag = FROZEN_VALUATION_YEAR - accidentYear + 1;
    const base = cells.get(`${groupCode}\0${accidentYear}\0${baseLag}`);
    const actual = cells.get(`${groupCode}\0${accidentYear}\0${MAX_DEVELOPMENT_LAG}`);
    if (!base || !actual) {
      result.missingEndpointCohorts += 1;
      continue;
    }
    if (base[field] < 0n || actual[field] < 0n) {
      result.negativeEndpointCohorts += 1;
      continue;
    }
    const predicted = predictFromFactors(base[field], factors, baseLag);
    if (predicted === null) {
      result.missingFactorCohorts += 1;
      continue;
    }
    const predictedDevelopment = predicted - base[field];
    const actualDevelopment = actual[field] - base[field];
    result.evaluatedCohorts += 1;
    result.base += base[field];
    result.actualUltimate += actual[field];
    result.predictedUltimate += predicted;
    result.actualFutureDevelopment += actualDevelopment;
    result.predictedFutureDevelopment += predictedDevelopment;
    result.absoluteUltimateError += abs(predicted - actual[field]);
    result.absoluteActualUltimate += abs(actual[field]);
    result.absoluteFutureDevelopmentError += abs(predictedDevelopment - actualDevelopment);
    result.absoluteActualFutureDevelopment += abs(actualDevelopment);
    if (predictedDevelopment < 0n) {
      result.predictedNegativeFutureDevelopmentCohorts += 1;
    }
    if (actualDevelopment < 0n) result.actualNegativeFutureDevelopmentCohorts += 1;
  }
  return result;
}

function combineBacktest(target, source) {
  for (const name of ["candidateCohorts", "evaluatedCohorts", "missingEndpointCohorts",
    "negativeEndpointCohorts", "missingFactorCohorts",
    "predictedNegativeFutureDevelopmentCohorts",
    "actualNegativeFutureDevelopmentCohorts"]) target[name] += source[name];
  for (const name of ["base", "actualUltimate", "predictedUltimate",
    "actualFutureDevelopment", "predictedFutureDevelopment",
    "absoluteUltimateError", "absoluteActualUltimate",
    "absoluteFutureDevelopmentError", "absoluteActualFutureDevelopment"]) {
    target[name] += source[name];
  }
}

function projectBacktest(value) {
  return Object.freeze({
    candidateCohorts: value.candidateCohorts,
    evaluatedCohorts: value.evaluatedCohorts,
    missingEndpointCohorts: value.missingEndpointCohorts,
    negativeEndpointCohorts: value.negativeEndpointCohorts,
    missingFactorCohorts: value.missingFactorCohorts,
    predictedNegativeFutureDevelopmentCohorts:
      value.predictedNegativeFutureDevelopmentCohorts,
    actualNegativeFutureDevelopmentCohorts:
      value.actualNegativeFutureDevelopmentCohorts,
    baseAtYearEnd2007SourceUnits: value.base.toString(),
    actualLag10SourceUnits: value.actualUltimate.toString(),
    predictedLag10SourceUnits: value.predictedUltimate.toString(),
    actualPost2007DevelopmentSourceUnits: value.actualFutureDevelopment.toString(),
    predictedPost2007DevelopmentSourceUnits: value.predictedFutureDevelopment.toString(),
    lag10AggregateBiasRatio: decimalRatio(
      value.predictedUltimate - value.actualUltimate, value.actualUltimate),
    lag10WeightedAbsoluteErrorRatio: decimalRatio(
      value.absoluteUltimateError, value.absoluteActualUltimate),
    futureDevelopmentAggregateBiasRatio: decimalRatio(
      value.predictedFutureDevelopment - value.actualFutureDevelopment,
      value.actualFutureDevelopment),
    futureDevelopmentWeightedAbsoluteErrorRatio: decimalRatio(
      value.absoluteFutureDevelopmentError, value.absoluteActualFutureDevelopment),
    predictionRounding: "PER_COHORT_HALF_UP_TO_WHOLE_SOURCE_AMOUNT_UNIT",
  });
}

function analyzeLine(parsed, spec) {
  const cells = new Map();
  const cohorts = new Map();
  const groups = new Map();
  const byAccidentYear = new Map();
  const byDevelopmentLag = new Map();
  const byCalendarYear = new Map();
  let duplicateSemanticCells = 0;
  let paidDecreaseCells = 0;
  let incurredDecreaseCells = 0;
  let earnedPremiumChangeWithinCohortCells = 0;
  let postedReserveChangeWithinGroupCells = 0;
  let groupNameChangeCells = 0;
  let entityTypeChangeCells = 0;
  let negativePostedReserveCells = 0;
  let negativeEarnedPremiumNetCells = 0;
  const rowCommitments = [];
  for (const row of parsed.rows) {
    const key = `${row.groupCode}\0${row.accidentYear}\0${row.developmentLag}`;
    if (cells.has(key)) duplicateSemanticCells += 1;
    else cells.set(key, row);
    const cohort = cohortKey(row);
    if (!cohorts.has(cohort)) cohorts.set(cohort, []);
    cohorts.get(cohort).push(row);
    if (!groups.has(row.groupCode)) groups.set(row.groupCode, []);
    groups.get(row.groupCode).push(row);
    const prior = cells.get(`${row.groupCode}\0${row.accidentYear}\0${row.developmentLag - 1}`);
    if (prior && row.cumulativePaidLoss < prior.cumulativePaidLoss) paidDecreaseCells += 1;
    if (prior && row.incurredLosses < prior.incurredLosses) incurredDecreaseCells += 1;
    if (prior && (row.earnedPremiumDirectAndAssumed !== prior.earnedPremiumDirectAndAssumed
      || row.earnedPremiumCeded !== prior.earnedPremiumCeded
      || row.earnedPremiumNet !== prior.earnedPremiumNet)) {
      earnedPremiumChangeWithinCohortCells += 1;
    }
    const priorGroup = groups.get(row.groupCode)[0];
    if (priorGroup.postedReserve2007MilliSourceUnits
      !== row.postedReserve2007MilliSourceUnits) postedReserveChangeWithinGroupCells += 1;
    if (priorGroup.groupName !== row.groupName) groupNameChangeCells += 1;
    if (priorGroup.single !== row.single) entityTypeChangeCells += 1;
    if (row.postedReserve2007MilliSourceUnits < 0n) negativePostedReserveCells += 1;
    if (row.earnedPremiumNet < 0n) negativeEarnedPremiumNetCells += 1;
    for (const [map, axis] of [[byAccidentYear, row.accidentYear],
      [byDevelopmentLag, row.developmentLag], [byCalendarYear, row.developmentYear]]) {
      if (!map.has(axis)) map.set(axis, axisBucket());
      addAxisRow(map.get(axis), row, prior);
    }
    rowCommitments.push(domainHash("outsider/cas-schedule-p-row/v1", {
      lineCode: row.lineCode, groupCode: row.groupCode, groupName: row.groupName,
      accidentYear: row.accidentYear, developmentYear: row.developmentYear,
      developmentLag: row.developmentLag,
      incurredLosses: row.incurredLosses.toString(),
      cumulativePaidLoss: row.cumulativePaidLoss.toString(),
      bulkAndIbnr: row.bulkAndIbnr.toString(),
      earnedPremiumDirectAndAssumed: row.earnedPremiumDirectAndAssumed.toString(),
      earnedPremiumCeded: row.earnedPremiumCeded.toString(),
      earnedPremiumNet: row.earnedPremiumNet.toString(), single: row.single,
      postedReserve2007MilliSourceUnits:
        row.postedReserve2007MilliSourceUnits.toString(),
    }));
  }

  let fullDevelopmentCohorts = 0;
  let missingDevelopmentCellsWithinObservedCohorts = 0;
  let fullTenByTenGroupTriangles = 0;
  let earnedPremiumDirectAndAssumed = 0n;
  let earnedPremiumCeded = 0n;
  let earnedPremiumNet = 0n;
  let lag10Incurred = 0n;
  let lag10Paid = 0n;
  let lag10Bulk = 0n;
  for (const rows of cohorts.values()) {
    const lags = new Set(rows.map((row) => row.developmentLag));
    if (lags.size === MAX_DEVELOPMENT_LAG) fullDevelopmentCohorts += 1;
    else missingDevelopmentCellsWithinObservedCohorts += MAX_DEVELOPMENT_LAG - lags.size;
    const first = rows.find((row) => row.developmentLag === 1);
    const last = rows.find((row) => row.developmentLag === MAX_DEVELOPMENT_LAG);
    if (first) {
      earnedPremiumDirectAndAssumed += first.earnedPremiumDirectAndAssumed;
      earnedPremiumCeded += first.earnedPremiumCeded;
      earnedPremiumNet += first.earnedPremiumNet;
    }
    if (last) {
      lag10Incurred += last.incurredLosses;
      lag10Paid += last.cumulativePaidLoss;
      lag10Bulk += last.bulkAndIbnr;
    }
  }
  let postedReserveMilli = 0n;
  for (const rows of groups.values()) {
    const accidentYears = new Set(rows.map((row) => row.accidentYear));
    if (accidentYears.size === 10 && rows.length === 100) fullTenByTenGroupTriangles += 1;
    postedReserveMilli += rows[0].postedReserve2007MilliSourceUnits;
  }

  const paidFactors = estimateFactors(cells, "cumulativePaidLoss");
  const incurredFactors = estimateFactors(cells, "incurredLosses");
  const paidBacktest = evaluateBacktest(cells, paidFactors, "cumulativePaidLoss");
  const incurredBacktest = evaluateBacktest(cells, incurredFactors, "incurredLosses");
  const upperTriangleCells = parsed.rows.filter((row) => (
    row.developmentYear <= FROZEN_VALUATION_YEAR)).length;
  const lowerTriangleCells = parsed.rows.length - upperTriangleCells;
  return Object.freeze({
    lineId: spec.lineId,
    lineCode: spec.lineCode,
    coverageBasis: spec.coverageBasis,
    sourceRows: parsed.rows.length,
    semanticCells: cells.size,
    duplicateSemanticCells,
    insurerGroupsOrSingleEntities: groups.size,
    groupAccidentYearCohorts: cohorts.size,
    fullDevelopmentCohorts,
    missingDevelopmentCellsWithinObservedCohorts,
    fullTenByTenGroupTriangles,
    incompleteTenByTenGroupTriangles: groups.size - fullTenByTenGroupTriangles,
    upperTriangleCells,
    lowerTriangleCells,
    paidDecreaseCells,
    incurredDecreaseCells,
    earnedPremiumChangeWithinCohortCells,
    postedReserveChangeWithinGroupCells,
    groupNameChangeCells,
    entityTypeChangeCells,
    negativePostedReserveCells,
    negativeEarnedPremiumNetCells,
    earnedPremiumDirectAndAssumedSourceUnits:
      earnedPremiumDirectAndAssumed.toString(),
    earnedPremiumCededSourceUnits: earnedPremiumCeded.toString(),
    earnedPremiumNetSourceUnits: earnedPremiumNet.toString(),
    lag10IncurredLossesSourceUnits: lag10Incurred.toString(),
    lag10CumulativePaidLossSourceUnits: lag10Paid.toString(),
    lag10BulkAndIbnrSourceUnits: lag10Bulk.toString(),
    postedReserve2007SourceUnits: fixedThreeString(postedReserveMilli),
    axes: Object.freeze({
      accidentYear: sortedObject(byAccidentYear, projectAxis),
      developmentLag: sortedObject(byDevelopmentLag, projectAxis),
      calendarYear: sortedObject(byCalendarYear, projectAxis),
    }),
    developmentFactors: Object.freeze({
      cumulativePaid: publicFactors(paidFactors),
      incurred: publicFactors(incurredFactors),
      trainingCutoffCalendarYear: FROZEN_VALUATION_YEAR,
      lowerTriangleUsedForFactorFitting: false,
    }),
    holdoutBacktest: Object.freeze({
      cumulativePaid: projectBacktest(paidBacktest),
      incurred: projectBacktest(incurredBacktest),
      lowerTriangleUsedOnlyAsOutcome: true,
      lag10IsUltimateEstablished: false,
    }),
    _paidBacktest: paidBacktest,
    _incurredBacktest: incurredBacktest,
    _groupCodes: new Set(groups.keys()),
    _rowCommitments: rowCommitments,
  });
}

function publicLine(line) {
  const { _paidBacktest, _incurredBacktest, _groupCodes, _rowCommitments, ...value } = line;
  return Object.freeze(value);
}

function overlapMatrix(lines) {
  const results = [];
  const multiLine = new Map();
  for (const line of lines) {
    for (const groupCode of line._groupCodes) {
      if (!multiLine.has(groupCode)) multiLine.set(groupCode, []);
      multiLine.get(groupCode).push(line.lineCode);
    }
  }
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      let overlap = 0;
      for (const code of lines[left]._groupCodes) {
        if (lines[right]._groupCodes.has(code)) overlap += 1;
      }
      results.push(Object.freeze({
        leftLineCode: lines[left].lineCode,
        rightLineCode: lines[right].lineCode,
        sharedGroupCodes: overlap,
      }));
    }
  }
  return Object.freeze({
    groupCodesAppearingInMultipleLines: [...multiLine.values()].filter((value) => (
      value.length > 1)).length,
    pairwise: Object.freeze(results),
  });
}

function sourceArtifactBody(sourceFiles, sourcePageBytes, { generatedAt }) {
  const timestamp = canonicalTime(generatedAt, "CAS_SCHEDULE_P_GENERATED_AT");
  const page = decodeUtf8(sourcePageBytes, "CAS_SCHEDULE_P_SOURCE_PAGE");
  for (const token of ["Loss Reserving Data Pulled from NAIC Schedule P",
    "S&amp;P Global Market Intelligence", "lower triangles",
    "CumPaidLoss_", "PostedReserve2007"]) {
    if (!page.text.includes(token)) throw new Error("CAS_SCHEDULE_P_SOURCE_PAGE_CONTENT_INVALID");
  }
  if (!sourceFiles || typeof sourceFiles !== "object") {
    throw new Error("CAS_SCHEDULE_P_SOURCE_FILES_INVALID");
  }
  const allowed = new Set(CAS_SCHEDULE_P_FROZEN_FILES.map((spec) => spec.fileName));
  const inputNames = Object.keys(sourceFiles);
  if (inputNames.some((name) => !allowed.has(name)) || inputNames.length !== allowed.size) {
    throw new Error("CAS_SCHEDULE_P_SOURCE_FILE_SET_INVALID");
  }
  const parsedFiles = [];
  const sourceManifest = [];
  let officialFrozenSourceVerified = digestBytes(page.bytes) === CAS_SCHEDULE_P_SOURCE_PAGE.hash
    && page.bytes.length === CAS_SCHEDULE_P_SOURCE_PAGE.bytes;
  for (const spec of CAS_SCHEDULE_P_FROZEN_FILES) {
    const parsed = parseCsv(sourceFiles[spec.fileName], spec);
    const hash = digestBytes(parsed.bytes);
    const official = hash === spec.hash && parsed.bytes.length === spec.bytes;
    officialFrozenSourceVerified &&= official;
    parsedFiles.push({ spec, parsed });
    sourceManifest.push(Object.freeze({
      lineId: spec.lineId, lineCode: spec.lineCode, fileName: spec.fileName,
      url: official ? spec.url : null,
      claimedUrlNotVerified: official ? null : spec.url,
      hash, bytes: parsed.bytes.length, officialFrozenFileVerified: official,
    }));
  }
  const lines = parsedFiles.map(({ parsed, spec }) => analyzeLine(parsed, spec));
  const combinedPaid = emptyBacktest();
  const combinedIncurred = emptyBacktest();
  let sourceRows = 0;
  let semanticCells = 0;
  let duplicateSemanticCells = 0;
  let upperTriangleCells = 0;
  let lowerTriangleCells = 0;
  let fullTenByTenGroupTriangles = 0;
  let incompleteTenByTenGroupTriangles = 0;
  for (const line of lines) {
    sourceRows += line.sourceRows;
    semanticCells += line.semanticCells;
    duplicateSemanticCells += line.duplicateSemanticCells;
    upperTriangleCells += line.upperTriangleCells;
    lowerTriangleCells += line.lowerTriangleCells;
    fullTenByTenGroupTriangles += line.fullTenByTenGroupTriangles;
    incompleteTenByTenGroupTriangles += line.incompleteTenByTenGroupTriangles;
    combineBacktest(combinedPaid, line._paidBacktest);
    combineBacktest(combinedIncurred, line._incurredBacktest);
  }
  const axesIntegrity = duplicateSemanticCells === 0
    && lines.every((line) => line.missingDevelopmentCellsWithinObservedCohorts === 0
      && line.earnedPremiumChangeWithinCohortCells === 0
      && line.postedReserveChangeWithinGroupCells === 0
      && line.groupNameChangeCells === 0 && line.entityTypeChangeCells === 0);
  const allFactorsAvailable = lines.every((line) => (
    line.developmentFactors.cumulativePaid.every((factor) => factor.modelArithmeticEligible)
      && line.developmentFactors.incurred.every((factor) => factor.modelArithmeticEligible)
  ));
  const publicLines = Object.fromEntries(lines.map((line) => (
    [line.lineCode, publicLine(line)]
  )));
  const rowCommitments = lines.flatMap((line) => line._rowCommitments);
  return {
    schema: CAS_SCHEDULE_P_RESERVE_CALIBRATION_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: timestamp,
    adapter: Object.freeze({
      adapterId: "OUTSIDER_CAS_NAIC_SCHEDULE_P_RESERVE_CALIBRATION",
      adapterVersion: "1.0.0",
      specificationHash: domainHash("outsider/cas-schedule-p-reserve-adapter-spec/v1", {
        header: HEADER,
        accidentYears: [FIRST_ACCIDENT_YEAR, LAST_ACCIDENT_YEAR],
        developmentLags: [1, MAX_DEVELOPMENT_LAG],
        valuationYear: FROZEN_VALUATION_YEAR,
        trainingRule: "DEVELOPMENT_YEAR_LE_2007_MATCHED_VOLUME_WEIGHTED_LINKS",
        holdoutRule: "DEVELOPMENT_YEAR_GT_2007_LAG10_OUTCOME_ONLY",
        arithmetic: "BIGINT_EXACT_SUM_RATIONAL_FACTOR_HALF_UP_COHORT_PREDICTION",
        amountUnitPolicy: "SOURCE_AMOUNT_UNIT_UNSCALED_BECAUSE_CAS_PAGE_DOES_NOT_DECLARE_SCALE",
      }),
    }),
    source: Object.freeze({
      datasetId: officialFrozenSourceVerified
        ? "CAS_SP_COMPILED_NAIC_SCHEDULE_P_1998_2007_SQUARED_TRIANGLES"
        : "CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE",
      sourceTrustClass: officialFrozenSourceVerified
        ? "OFFICIAL_CAS_HOSTED_SP_COMPILED_NAIC_SCHEDULE_P_REPLAY"
        : "CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE",
      publisher: officialFrozenSourceVerified ? CAS_SCHEDULE_P_SOURCE_PAGE.publisher : null,
      compiler: officialFrozenSourceVerified ? CAS_SCHEDULE_P_SOURCE_PAGE.compiler : null,
      underlyingRegulatorySource: officialFrozenSourceVerified
        ? CAS_SCHEDULE_P_SOURCE_PAGE.underlyingRegulatorySource : null,
      sourcePage: Object.freeze({
        url: officialFrozenSourceVerified ? CAS_SCHEDULE_P_SOURCE_PAGE.url : null,
        claimedUrlNotVerified:
          officialFrozenSourceVerified ? null : CAS_SCHEDULE_P_SOURCE_PAGE.url,
        hash: digestBytes(page.bytes),
        bytes: page.bytes.length,
        accessedAt: CAS_SCHEDULE_P_SOURCE_PAGE.accessedAt,
      }),
      files: Object.freeze(sourceManifest),
      officialFrozenSourceVerified,
      sourceArtifactsReverified: officialFrozenSourceVerified,
      publicDirectDownloadObserved: officialFrozenSourceVerified,
      researchUseInvitedByPage: officialFrozenSourceVerified,
      pageRequestsResearchPublicationAcknowledgement: officialFrozenSourceVerified,
      rawRedistributionRightsConcluded: false,
      commercialUseRightsConcluded: false,
      sourceChain: officialFrozenSourceVerified
        ? "NAIC_SCHEDULE_P_TO_SP_GLOBAL_COMPILATION_FOR_CAS_TO_PUBLIC_CAS_CSV"
        : "CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE",
    }),
    sourceCommitmentHash: (officialFrozenSourceVerified
      ? pinnedLegacyEvidenceDomainHash : domainHash)(
      "outsider/cas-schedule-p-source/v1", {
      sourcePageHash: digestBytes(page.bytes),
      files: sourceManifest.map(({ lineCode, hash, bytes }) => ({ lineCode, hash, bytes })),
      rowCommitments,
      }),
    accounting: Object.freeze({
      sourceFiles: sourceManifest.length,
      sourceRows,
      semanticCells,
      duplicateSemanticCells,
      upperTriangleCells,
      lowerTriangleCells,
      fullTenByTenGroupTriangles,
      incompleteTenByTenGroupTriangles,
      rowCommitmentCount: rowCommitments.length,
      allObservedCohortsHaveTenDevelopmentLags: lines.every((line) => (
        line.missingDevelopmentCellsWithinObservedCohorts === 0)),
      everyGroupHasAllTenAccidentYears: incompleteTenByTenGroupTriangles === 0,
    }),
    axes: Object.freeze({
      accidentYear: Object.freeze({ first: FIRST_ACCIDENT_YEAR,
        last: LAST_ACCIDENT_YEAR, meaning: "YEAR_IN_WHICH_CLAIM_COHORT_INCURRED" }),
      developmentLag: Object.freeze({ first: 1, last: MAX_DEVELOPMENT_LAG,
        meaning: "ONE_BASED_YEAR_END_DEVELOPMENT_AGE" }),
      calendarYear: Object.freeze({
        equation: "ACCIDENT_YEAR_PLUS_DEVELOPMENT_LAG_MINUS_ONE",
        trainingCutoff: FROZEN_VALUATION_YEAR,
        upperTriangleRule: "CALENDAR_YEAR_LE_2007",
        lowerTriangleHoldoutRule: "CALENDAR_YEAR_GT_2007",
      }),
    }),
    byLine: Object.freeze(publicLines),
    aggregateHoldoutBacktest: Object.freeze({
      cumulativePaid: projectBacktest(combinedPaid),
      incurred: projectBacktest(combinedIncurred),
      lineSpecificFactorsUsed: true,
      structuralBacktestArithmeticCompleted: combinedPaid.evaluatedCohorts > 0
        && combinedIncurred.evaluatedCohorts > 0,
      empiricalBacktestCompleted: officialFrozenSourceVerified
        && combinedPaid.evaluatedCohorts > 0 && combinedIncurred.evaluatedCohorts > 0,
    }),
    correlationAndTailBoundary: Object.freeze({
      crossLineEntityOverlap: overlapMatrix(lines),
      calendarYearDiagonalsObserved: true,
      calendarYearShockIdentifiersObserved: false,
      catastropheIdentifiersObserved: false,
      crossCompanyIndependenceEstablished: false,
      crossLineIndependenceEstablished: false,
      triangleCellsIidEstablished: false,
      developmentBeyondLag10Observed: false,
      lag10IsUltimateEstablished: false,
      tailFactorObserved: false,
      tailOrTvarCalibrationEligible: false,
    }),
    semanticBoundary: Object.freeze({
      sourcePageFieldDefinitionsVerified: officialFrozenSourceVerified,
      incurredLossesMeaning: officialFrozenSourceVerified
        ? "NET_INCURRED_LOSSES_AND_ALLOCATED_EXPENSES_REPORTED_AT_YEAR_END"
        : "CALLER_ASSERTED_FIELD_SHAPED_LIKE_INCURRED_LOSSES",
      cumulativePaidLossMeaning: officialFrozenSourceVerified
        ? "NET_CUMULATIVE_PAID_LOSSES_AND_ALLOCATED_EXPENSES_REPORTED_AT_YEAR_END"
        : "CALLER_ASSERTED_FIELD_SHAPED_LIKE_CUMULATIVE_PAID_LOSS",
      bulkAndIbnrMeaning: officialFrozenSourceVerified
        ? "BULK_AND_IBNR_ON_NET_LOSS_AND_DEFENSE_AND_COST_CONTAINMENT_EXPENSE"
        : "CALLER_ASSERTED_FIELD_SHAPED_LIKE_BULK_AND_IBNR",
      postedReserve2007Meaning: officialFrozenSourceVerified
        ? "YEAR_END_2007_UIE_PART_2A_NET_LOSSES_UNPAID_AND_UNPAID_LOSS_ADJUSTMENT_EXPENSE"
        : "CALLER_ASSERTED_FIELD_SHAPED_LIKE_POSTED_RESERVE_2007",
      amountScaleDeclaredOnCasPage: false,
      outputAmountUnit: "SOURCE_AMOUNT_UNIT",
      incurredIsCashPaid: false,
      cumulativePaidIsEconomicLossBeyondRecordedPaymentField: false,
      bulkAndIbnrIsCaseReserve: false,
      paidIsRecovery: false,
      lowerTriangleIsIndependentClaimAdjudication: false,
      postedReserveScopeMatchesOnlyAccidentYears1998To2007: false,
      postedReserveReconciliationEligible: false,
      individualClaimIdentityObserved: false,
      individualClaimSeverityObserved: false,
      appealFraudOrCoverageDispositionObserved: false,
    }),
    sourceDomainCalibration: Object.freeze({
      decision: !officialFrozenSourceVerified
        ? "QUARANTINE_CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE"
        : axesIntegrity && allFactorsAvailable
        ? "ADMIT_SCHEDULE_P_HISTORICAL_RESERVE_BACKTEST_ONLY"
        : "QUARANTINE_SOURCE_INTEGRITY_OR_TRIANGLE_AXIS",
      callerAssertedFixture: !officialFrozenSourceVerified,
      sourceAxesIntegrityVerified: officialFrozenSourceVerified && axesIntegrity,
      historicalDevelopmentFactorsReproduced:
        officialFrozenSourceVerified && allFactorsAvailable,
      lowerTriangleOutOfTimeBacktestCompleted:
        officialFrozenSourceVerified && combinedPaid.evaluatedCohorts > 0
        && combinedIncurred.evaluatedCohorts > 0,
      negativeAdjustmentsPreserved: true,
      productionReserveModelEligible: false,
      postedReserveReconciliationEligible: false,
      tailFactorModelEligible: false,
      correlationModelEligible: false,
      individualClaimModelEligible: false,
    }),
    outsiderModelEntrance: Object.freeze({
      decision: officialFrozenSourceVerified
        ? "ABSTAIN_SCHEDULE_P_DOMAIN_CALIBRATION_ONLY"
        : "ABSTAIN_CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE",
      transferToAiAgentOrRobotDomainEstablished: false,
      useAsStructuralReserveMathFixture: true,
      useAsAgentOrRobotFrequencyPrior: false,
      useAsAgentOrRobotSeverityPrior: false,
      useAsAgentOrRobotReservePrior: false,
      automaticTraining: false,
      permitsPricing: false,
      permitsCoverage: false,
      permitsCapital: false,
      permitsGuarantee: false,
      permitsCustody: false,
      permitsSettlement: false,
      movesFunds: false,
      price: null,
      reserve: null,
      coverage: null,
      missingRequirements: Object.freeze([
        "AI_AGENT_OR_ROBOT_DOMAIN_EXPOSURE_AND_CLAIM_LINKAGE",
        "CLAIM_LEVEL_PAID_CASE_RESERVE_RECOVERY_AND_COVERAGE_STATUS",
        "DEVELOPMENT_BEYOND_LAG10_AND_VALIDATED_TAIL",
        "CALENDAR_SHOCK_AND_CROSS_ENTITY_CORRELATION_MODEL",
        "TEMPORALLY_SEPARATE_PROSPECTIVE_VALIDATION",
        "INDEPENDENT_ACTUARIAL_AND_LEGAL_REVIEW",
        "LICENSED_ISSUER_CAPITAL_AUTHORIZED_CUSTODY_AND_SETTLEMENT",
      ]),
    }),
  };
}

export function buildCasSchedulePReserveCalibration(sourceFiles, sourcePageBytes, {
  generatedAt = CAS_SCHEDULE_P_SOURCE_PAGE.accessedAt,
} = {}) {
  const body = sourceArtifactBody(sourceFiles, sourcePageBytes, { generatedAt });
  const artifactHasher = body.source.officialFrozenSourceVerified
    ? pinnedLegacyEvidenceDomainHash : domainHash;
  return Object.freeze({ ...body, artifactHash: artifactHasher(
    CAS_SCHEDULE_P_RESERVE_CALIBRATION_SCHEMA, body) });
}

function casAuthorityBoundaryValid(artifact) {
  return artifact?.outsiderModelEntrance?.transferToAiAgentOrRobotDomainEstablished === false
    && artifact?.sourceDomainCalibration?.productionReserveModelEligible === false
    && artifact?.sourceDomainCalibration?.tailFactorModelEligible === false
    && artifact?.sourceDomainCalibration?.correlationModelEligible === false
    && artifact?.semanticBoundary?.incurredIsCashPaid === false
    && artifact?.semanticBoundary?.bulkAndIbnrIsCaseReserve === false
    && artifact?.semanticBoundary?.paidIsRecovery === false
    && artifact?.semanticBoundary?.lowerTriangleIsIndependentClaimAdjudication === false
    && artifact?.correlationAndTailBoundary?.lag10IsUltimateEstablished === false
    && ["automaticTraining", "permitsPricing", "permitsCoverage", "permitsCapital",
      "permitsGuarantee", "permitsCustody", "permitsSettlement", "movesFunds"]
      .every((name) => artifact?.outsiderModelEntrance?.[name] === false)
    && artifact?.outsiderModelEntrance?.price === null
    && artifact?.outsiderModelEntrance?.reserve === null
    && artifact?.outsiderModelEntrance?.coverage === null;
}

function casClassificationValid(artifact) {
  const official = artifact.source.officialFrozenSourceVerified === true;
  if (official) {
    return artifact.source.datasetId
        === "CAS_SP_COMPILED_NAIC_SCHEDULE_P_1998_2007_SQUARED_TRIANGLES"
      && artifact.source.sourceTrustClass
        === "OFFICIAL_CAS_HOSTED_SP_COMPILED_NAIC_SCHEDULE_P_REPLAY"
      && artifact.source.publisher === CAS_SCHEDULE_P_SOURCE_PAGE.publisher
      && artifact.source.compiler === CAS_SCHEDULE_P_SOURCE_PAGE.compiler
      && artifact.source.underlyingRegulatorySource
        === CAS_SCHEDULE_P_SOURCE_PAGE.underlyingRegulatorySource
      && artifact.source.sourceArtifactsReverified === true
      && artifact.source.sourcePage.url === CAS_SCHEDULE_P_SOURCE_PAGE.url
      && artifact.source.sourcePage.claimedUrlNotVerified === null
      && artifact.source.sourcePage.hash === CAS_SCHEDULE_P_SOURCE_PAGE.hash
      && artifact.source.sourcePage.bytes === CAS_SCHEDULE_P_SOURCE_PAGE.bytes
      && artifact.source.publicDirectDownloadObserved === true
      && artifact.source.researchUseInvitedByPage === true
      && artifact.source.pageRequestsResearchPublicationAcknowledgement === true
      && artifact.source.files.length === CAS_SCHEDULE_P_FROZEN_FILES.length
      && artifact.source.files.every((file, index) => {
        const spec = CAS_SCHEDULE_P_FROZEN_FILES[index];
        return file.lineId === spec.lineId && file.lineCode === spec.lineCode
          && file.fileName === spec.fileName && file.url === spec.url
          && file.claimedUrlNotVerified === null && file.hash === spec.hash
          && file.bytes === spec.bytes && file.officialFrozenFileVerified === true;
      })
      && artifact.semanticBoundary.sourcePageFieldDefinitionsVerified === true
      && artifact.aggregateHoldoutBacktest.empiricalBacktestCompleted === true
      && artifact.sourceDomainCalibration.callerAssertedFixture === false
      && ["ADMIT_SCHEDULE_P_HISTORICAL_RESERVE_BACKTEST_ONLY",
        "QUARANTINE_SOURCE_INTEGRITY_OR_TRIANGLE_AXIS"]
        .includes(artifact.sourceDomainCalibration.decision)
      && artifact.outsiderModelEntrance.decision
        === "ABSTAIN_SCHEDULE_P_DOMAIN_CALIBRATION_ONLY";
  }
  return artifact.source.datasetId === "CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE"
    && artifact.source.sourceTrustClass === "CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE"
    && artifact.source.publisher === null && artifact.source.compiler === null
    && artifact.source.underlyingRegulatorySource === null
    && artifact.source.sourceArtifactsReverified === false
    && artifact.source.sourcePage.url === null
    && typeof artifact.source.sourcePage.claimedUrlNotVerified === "string"
    && artifact.source.publicDirectDownloadObserved === false
    && artifact.source.researchUseInvitedByPage === false
    && artifact.source.pageRequestsResearchPublicationAcknowledgement === false
    && artifact.semanticBoundary.sourcePageFieldDefinitionsVerified === false
    && artifact.aggregateHoldoutBacktest.empiricalBacktestCompleted === false
    && artifact.sourceDomainCalibration.callerAssertedFixture === true
    && artifact.sourceDomainCalibration.decision
      === "QUARANTINE_CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE"
    && ["sourceAxesIntegrityVerified", "historicalDevelopmentFactorsReproduced",
      "lowerTriangleOutOfTimeBacktestCompleted", "productionReserveModelEligible",
      "postedReserveReconciliationEligible", "tailFactorModelEligible",
      "correlationModelEligible", "individualClaimModelEligible"]
      .every((name) => artifact.sourceDomainCalibration[name] === false)
    && artifact.outsiderModelEntrance.decision
      === "ABSTAIN_CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE";
}

function casArtifactSchemaValid(artifact) {
  const topKeys = ["schema", "schemaVersion", "generatedAt", "adapter", "source",
    "sourceCommitmentHash", "accounting", "axes", "byLine",
    "aggregateHoldoutBacktest", "correlationAndTailBoundary", "semanticBoundary",
    "sourceDomainCalibration", "outsiderModelEntrance", "artifactHash"];
  const sourceKeys = ["datasetId", "sourceTrustClass", "publisher", "compiler",
    "underlyingRegulatorySource", "sourcePage", "files", "officialFrozenSourceVerified",
    "sourceArtifactsReverified", "publicDirectDownloadObserved", "researchUseInvitedByPage",
    "pageRequestsResearchPublicationAcknowledgement", "rawRedistributionRightsConcluded",
    "commercialUseRightsConcluded", "sourceChain"];
  const sourcePageKeys = ["url", "claimedUrlNotVerified", "hash", "bytes", "accessedAt"];
  const sourceFileKeys = ["lineId", "lineCode", "fileName", "url",
    "claimedUrlNotVerified", "hash", "bytes", "officialFrozenFileVerified"];
  const calibrationKeys = ["decision", "callerAssertedFixture",
    "sourceAxesIntegrityVerified", "historicalDevelopmentFactorsReproduced",
    "lowerTriangleOutOfTimeBacktestCompleted", "negativeAdjustmentsPreserved",
    "productionReserveModelEligible", "postedReserveReconciliationEligible",
    "tailFactorModelEligible", "correlationModelEligible", "individualClaimModelEligible"];
  const outsiderKeys = ["decision", "transferToAiAgentOrRobotDomainEstablished",
    "useAsStructuralReserveMathFixture", "useAsAgentOrRobotFrequencyPrior",
    "useAsAgentOrRobotSeverityPrior", "useAsAgentOrRobotReservePrior",
    "automaticTraining", "permitsPricing", "permitsCoverage", "permitsCapital",
    "permitsGuarantee", "permitsCustody", "permitsSettlement", "movesFunds",
    "price", "reserve", "coverage", "missingRequirements"];
  return exactKeys(artifact, topKeys)
    && artifact.schema === CAS_SCHEDULE_P_RESERVE_CALIBRATION_SCHEMA
    && artifact.schemaVersion === "1.0.0"
    && canonicalTime(artifact.generatedAt, "CAS_SCHEDULE_P_ARTIFACT_TIME")
      === artifact.generatedAt
    && HASH.test(artifact.artifactHash ?? "")
    && HASH.test(artifact.sourceCommitmentHash ?? "")
    && exactKeys(artifact.adapter, ["adapterId", "adapterVersion", "specificationHash"])
    && artifact.adapter.adapterId === "OUTSIDER_CAS_NAIC_SCHEDULE_P_RESERVE_CALIBRATION"
    && artifact.adapter.adapterVersion === "1.0.0"
    && HASH.test(artifact.adapter.specificationHash ?? "")
    && exactKeys(artifact.source, sourceKeys)
    && exactKeys(artifact.source.sourcePage, sourcePageKeys)
    && HASH.test(artifact.source.sourcePage.hash ?? "")
    && Array.isArray(artifact.source.files)
    && artifact.source.files.length === CAS_SCHEDULE_P_FROZEN_FILES.length
    && artifact.source.files.every((file) => exactKeys(file, sourceFileKeys)
      && HASH.test(file.hash ?? ""))
    && exactKeys(artifact.sourceDomainCalibration, calibrationKeys)
    && exactKeys(artifact.outsiderModelEntrance, outsiderKeys)
    && casClassificationValid(artifact);
}

export function verifyCasSchedulePReserveCalibration(artifact) {
  const failures = [];
  try {
    if (!casArtifactSchemaValid(artifact)) failures.push("CAS_SCHEDULE_P_SCHEMA_INVALID");
    const { artifactHash, ...body } = artifact;
    const artifactHasher = artifact?.source?.officialFrozenSourceVerified
      ? pinnedLegacyEvidenceDomainHash : domainHash;
    if (artifactHash !== artifactHasher(
      CAS_SCHEDULE_P_RESERVE_CALIBRATION_SCHEMA, body)) {
      failures.push("CAS_SCHEDULE_P_SELF_HASH_INVALID");
    }
  } catch (error) {
    failures.push(`CAS_SCHEDULE_P_STRUCTURE_FAILED:${error instanceof Error
      ? error.message : String(error)}`);
  }
  if (!casAuthorityBoundaryValid(artifact)) {
    failures.push("CAS_SCHEDULE_P_AUTHORITY_OR_SEMANTIC_BOUNDARY_INVALID");
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

export function verifyCasSchedulePReserveCalibrationWithSource(artifact, sourceFiles,
  sourcePageBytes) {
  const standalone = verifyCasSchedulePReserveCalibration(artifact);
  if (!standalone.ok) return standalone;
  const failures = [];
  let expected = null;
  try {
    expected = buildCasSchedulePReserveCalibration(sourceFiles, sourcePageBytes, {
      generatedAt: artifact.generatedAt,
    });
    const exactReplayMatched = expected.source.officialFrozenSourceVerified
      ? samePinnedLegacyEvidence(expected, artifact)
      : canonicalizeStrict(expected) === canonicalizeStrict(artifact);
    if (!exactReplayMatched) {
      failures.push("CAS_SCHEDULE_P_DERIVATION_INVALID");
    }
  } catch (error) {
    failures.push(`CAS_SCHEDULE_P_SOURCE_REPLAY_FAILED:${error instanceof Error
      ? error.message : String(error)}`);
  }
  const official = failures.length === 0 && expected.source.officialFrozenSourceVerified;
  return Object.freeze({
    ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]),
    verificationLevel: failures.length !== 0 ? "INVALID"
      : official ? "FULL_OFFICIAL_CAS_SCHEDULE_P_SOURCE_REPLAYED"
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
