/*
 * FEMA real-case evidence lane.
 *
 * Public provenance does not make a real administrative record less real.
 * This adapter admits exactly what the frozen official bytes say: paid and
 * recovered NFIP claim amounts, a current residential contracts-in-force
 * snapshot, FEMA second-appeal lifecycle states, and a CBCA arbitration index.
 * It also preserves every material qualification: OpenFEMA system lag and
 * human error, redaction, unmatched time bases, raw transaction semantics,
 * NSI denominator defects, pending appeals, and FEMA's use restrictions.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, realpathSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const FEMA_REAL_CASES_SCHEMA = "outsider/fema-real-cases-evidence/v1";

export const FEMA_REAL_CASES_FROZEN_SOURCE_20260821 = Object.freeze({
  acquiredAt: "2026-08-21T11:00:27.000Z",
  manifestBytes: 46_598,
  manifestHash: "sha256:c5c5426d375dbccc118f68cbbe3fc79bc339834a35fdc50db75c320394944728",
  sourceBytes: 6_358_150,
  sourceObjects: 51,
  claimRecords: 3_341,
  claimPages: 34,
  directObjects: 16,
  officialPages: Object.freeze({
    openFema: "https://www.fema.gov/about/openfema",
    openFemaTerms: "https://www.fema.gov/about/openfema/terms-conditions",
    nfipClaimsV3: "https://www.fema.gov/openfema-data-page/nfip-redacted-claims-v3",
    nfipPoliciesV3: "https://www.fema.gov/openfema-data-page/nfip-redacted-policies-v3",
    penetrationV1: "https://www.fema.gov/openfema-data-page/nfip-residential-penetration-rates-v1",
    appealsV1: "https://www.fema.gov/openfema-data-page/public-assistance-second-appeals-tracker-v1",
    paAppealsFactSheet:
      "https://www.fema.gov/sites/default/files/documents/fema_pa-appeals-fact-sheet_2024.pdf",
    napaAppeal: "https://www.fema.gov/appeal/codes-and-standards-10",
    seminoleAppeal:
      "https://www.fema.gov/appeal/result-declared-incident-allowable-costs-and-reasonable-costs",
    cbcaFema: "https://www.cbca.gov/decisions/fema.html",
  }),
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const CLAIM_FIELDS = Object.freeze([
  "id", "asOfDate", "dateOfLoss", "yearOfLoss", "state", "countyCode",
  "censusGeoid", "eventDesignationNumber", "floodEvent", "policyCount",
  "amountPaidOnBuildingClaim", "amountPaidOnContentsClaim",
  "amountPaidOnIncreasedCostOfComplianceClaim", "netBuildingPaymentAmount",
  "netContentsPaymentAmount", "netIccPaymentAmount",
  "totalBuildingInsuranceCoverage", "totalContentsInsuranceCoverage",
  "buildingDamageAmount", "contentsDamageAmount", "totalSalvageRecovery",
  "totalBldgClaimPmtRecovery", "totalContentsClaimPmtRecovery",
  "totalIccClaimPmtRecovery", "totalSubrogationRecovery", "openDate",
  "mostRecentPaymentDate", "mostRecentRecoveryDate",
  "nonPaymentReasonBuilding", "nonPaymentReasonContents", "numberOfUnits",
  "causeOfDamage", "ratedFloodZone",
]);
const APPEAL_STATUSES = Object.freeze([
  "Denied", "Granted", "N/A", "Partially Granted", "Remanded", "Rescinded",
  "Under Review", "Withdrawn",
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `FEMA_REAL_CASES_${code}`
    : `FEMA_REAL_CASES_${code}:${detail}`);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256Bytes(`${domain}\0${canonicalizeStrict(value)}`);
}

function canonicalTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("TIME_INVALID");
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function exactOptions(options) {
  if (options === undefined) return { generatedAt: FEMA_REAL_CASES_FROZEN_SOURCE_20260821.acquiredAt };
  if (!options || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).length !== 1 || !Object.hasOwn(options, "generatedAt")) {
    fail("OPTIONS_INVALID");
  }
  return { generatedAt: canonicalTime(options.generatedAt) };
}

function publisherTime(value, field, nullable = false) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail("PUBLISHER_TIME_INVALID", field);
  return value;
}

function safeRelativeName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 240
    && !name.startsWith("/") && !name.includes("\\")
    && name.split("/").every((part) => part && part !== "." && part !== "..")
    && !/[\u0000-\u001f\u007f]/.test(name);
}

function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!safeRelativeName(name) || entry.isSymbolicLink()) fail("SOURCE_ENTRY_INVALID", name);
    if (entry.isDirectory()) files.push(...listFiles(directory, name));
    else if (entry.isFile()) files.push(name);
    else fail("SOURCE_ENTRY_TYPE_INVALID", name);
  }
  return files.sort();
}

function stableBytes(directory, name, expectedBytes, expectedHash) {
  if (!safeRelativeName(name) || !Number.isSafeInteger(expectedBytes)
    || expectedBytes <= 0 || expectedBytes > MAX_SOURCE_BYTES || !HASH.test(expectedHash)) {
    fail("SOURCE_PIN_INVALID", name);
  }
  const target = path.join(directory, name);
  const realDirectory = realpathSync(directory);
  const parent = realpathSync(path.dirname(target));
  if (parent !== realDirectory && !parent.startsWith(`${realDirectory}${path.sep}`)) {
    fail("SOURCE_PATH_ESCAPE", name);
  }
  let descriptor = null;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size !== BigInt(expectedBytes)) fail("SOURCE_FILE_SIZE", name);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || sha256Bytes(bytes) !== expectedHash) fail("SOURCE_FILE_CHANGED_OR_MISMATCHED", name);
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
}

function parseJsonl(bytes, code) {
  const text = bytes.toString("utf8");
  if (!text || text.includes("\0")) fail(`${code}_TEXT_INVALID`);
  return text.trimEnd().split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line); }
    catch { fail(`${code}_ROW_INVALID`, index); }
  });
}

function loadOfficialSource(sourceDirectory) {
  const directory = path.resolve(sourceDirectory ?? "");
  if (!sourceDirectory || directory === path.parse(directory).root
    || lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) {
    fail("SOURCE_DIRECTORY_INVALID");
  }
  const manifestBytes = stableBytes(directory, "acquisition-manifest.json",
    FEMA_REAL_CASES_FROZEN_SOURCE_20260821.manifestBytes,
    FEMA_REAL_CASES_FROZEN_SOURCE_20260821.manifestHash);
  const manifest = parseJson(manifestBytes, "MANIFEST");
  if (manifest.schema !== "outsider/fema-real-cases-acquisition/v1"
    || manifest.acquiredAt !== FEMA_REAL_CASES_FROZEN_SOURCE_20260821.acquiredAt
    || manifest.claimSlice?.records !== FEMA_REAL_CASES_FROZEN_SOURCE_20260821.claimRecords
    || manifest.claimSlice?.pages?.length !== FEMA_REAL_CASES_FROZEN_SOURCE_20260821.claimPages
    || manifest.directObjects?.length !== FEMA_REAL_CASES_FROZEN_SOURCE_20260821.directObjects
    || manifest.claimSlice?.filter !== "yearOfLoss eq 2024 and state eq 'NC'"
    || manifest.claimSlice?.orderby !== "id ASC"
    || canonicalizeStrict(manifest.claimSlice?.selectedFields) !== canonicalizeStrict(CLAIM_FIELDS)
    || manifest.claimSlice?.firstPageReplayedAfterPagination !== true
    || manifest.claimSlice?.firstPageRecordsUnchanged !== true) fail("MANIFEST_SEMANTICS_INVALID");
  const pins = [...manifest.directObjects, ...manifest.claimSlice.pages];
  if (pins.length !== FEMA_REAL_CASES_FROZEN_SOURCE_20260821.sourceObjects - 1) {
    fail("MANIFEST_OBJECT_COUNT_INVALID");
  }
  const names = pins.map((pin) => pin.name);
  if (new Set(names).size !== names.length
    || names.some((name) => !safeRelativeName(name))) fail("MANIFEST_NAMES_INVALID");
  const expectedFiles = ["acquisition-manifest.json", ...names].sort();
  if (canonicalizeStrict(listFiles(directory)) !== canonicalizeStrict(expectedFiles)) {
    fail("SOURCE_FILE_SET_INVALID");
  }
  const objects = new Map();
  let totalBytes = manifestBytes.length;
  for (const pin of pins) {
    const bytes = stableBytes(directory, pin.name, pin.bytes, pin.sha256);
    totalBytes += bytes.length;
    objects.set(pin.name, bytes);
  }
  if (totalBytes !== FEMA_REAL_CASES_FROZEN_SOURCE_20260821.sourceBytes) {
    fail("SOURCE_TOTAL_BYTES_INVALID");
  }
  const commitment = domainHash("outsider:fema-real-cases-source:v1", {
    manifest: FEMA_REAL_CASES_FROZEN_SOURCE_20260821.manifestHash,
    objects: pins.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  });
  return { manifest, objects, commitment, totalBytes };
}

function requiredObject(objects, name) {
  const bytes = objects.get(name);
  if (!bytes) fail("SOURCE_OBJECT_MISSING", name);
  return bytes;
}

function validateMetadata(objects) {
  const start = requiredObject(objects, "openfema-datasets-nfip-appeals-start.json");
  const end = requiredObject(objects, "openfema-datasets-nfip-appeals-end.json");
  const parsed = parseJson(start, "OPENFEMA_METADATA");
  const endParsed = parseJson(end, "OPENFEMA_METADATA_END");
  const withoutRunDate = (value) => {
    const copy = structuredClone(value);
    if (copy.metadata) delete copy.metadata.rundate;
    return copy;
  };
  if (canonicalizeStrict(withoutRunDate(parsed))
    !== canonicalizeStrict(withoutRunDate(endParsed))) {
    fail("OPENFEMA_METADATA_CHANGED_DURING_ACQUISITION");
  }
  const rows = parsed.OpenFemaDataSets;
  if (!Array.isArray(rows) || rows.length !== 4) fail("OPENFEMA_METADATA_ROWS_INVALID");
  const expected = {
    NfipClaims: [3, 2_724_656, "2026-08-04T09:21:02.984Z", "R/P1M"],
    NfipPolicies: [3, 74_349_525, "2026-08-04T09:03:33.169Z", "R/P1M"],
    NfipResidentialPenetrationRates: [1, 3_159, "2026-08-04T16:40:37.737Z", "R/P3M"],
    PublicAssistanceSecondAppealsTracker: [1, 1_726, "2026-08-18T18:20:24.641Z", "R/P1W"],
  };
  for (const [name, [version, count, refresh, periodicity]] of Object.entries(expected)) {
    const row = rows.find((entry) => entry.name === name);
    if (!row || row.version !== version || row.recordCount !== count
      || row.lastDataSetRefresh !== refresh || row.accrualPeriodicity !== periodicity
      || row.accessLevel !== "public" || row.dataQuality !== "true" || row.license !== null
      || (name !== "NfipResidentialPenetrationRates"
        && !String(row.description).includes("not intended to be an official federal report"))) {
      fail("OPENFEMA_METADATA_DATASET_INVALID", name);
    }
  }
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  if (!String(byName.NfipClaims.description).includes("claims transactions")
    || !String(byName.NfipPolicies.description).includes("policy transactions")
    || !String(byName.NfipResidentialPenetrationRates.description)
      .includes("Incompleteness of NSI 2022")
    || !String(byName.PublicAssistanceSecondAppealsTracker.description)
      .includes("issuing timely final determinations")
    || !String(byName.PublicAssistanceSecondAppealsTracker.description)
      .includes("small percentage of human error")) {
    fail("OPENFEMA_METADATA_DESCRIPTION_INVALID");
  }
  const dictionaries = [
    ["openfema-fields-nfip-claims-v3.json", "NfipClaims", 3, 84],
    ["openfema-fields-nfip-policies-v3.json", "NfipPolicies", 3, 87],
    ["openfema-fields-nfip-penetration-v1.json", "NfipResidentialPenetrationRates", 1, 11],
    ["openfema-fields-pa-second-appeals-v1.json", "PublicAssistanceSecondAppealsTracker", 1, 15],
  ];
  const fieldRows = {};
  for (const [file, entity, version, count] of dictionaries) {
    const data = parseJson(requiredObject(objects, file), "OPENFEMA_FIELDS").OpenFemaDataSetFields;
    if (!Array.isArray(data) || data.length !== count
      || data.some((row) => row.openFemaDataSet !== entity || row.datasetVersion !== version)
      || new Set(data.map((row) => row.name)).size !== count) fail("OPENFEMA_FIELDS_INVALID", entity);
    fieldRows[entity] = Object.fromEntries(data.map((row) => [row.name, row]));
  }
  const claim = fieldRows.NfipClaims;
  const policy = fieldRows.NfipPolicies;
  const penetration = fieldRows.NfipResidentialPenetrationRates;
  const appeal = fieldRows.PublicAssistanceSecondAppealsTracker;
  if (!claim.netBuildingPaymentAmount?.description.toLowerCase().includes("net building payment amount")
    || !claim.totalBldgClaimPmtRecovery?.description.toLowerCase().includes("recovered")
    || !policy.policyCount?.description.includes("Insured units in an active status")
    || !penetration.resContractsInForce?.description.toLowerCase().includes("contracts in force")
    || !appeal.decisionSignedDate?.description.toLowerCase().includes("signed")) {
    fail("OPENFEMA_FIELD_MEANING_INVALID");
  }
  return { rows, byName, fieldDefinitionsVerified: true };
}

function cents(value, field) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) fail("MONEY_INVALID", field);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -result : result;
}

function money(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function ratio(numerator, denominator, places = 8) {
  if (denominator === 0n) return null;
  const scale = 10n ** BigInt(places);
  const rounded = (numerator * scale + denominator / 2n) / denominator;
  const digits = String(rounded).padStart(places + 1, "0");
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

function increment(map, key) { map.set(key, (map.get(key) ?? 0) + 1); }

function distribution(map) {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => ({ value, count }));
}

function quantile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? sorted[0];
}

function sumMoney(rows, field) {
  return rows.reduce((total, row) => total + (cents(row[field], field) ?? 0n), 0n);
}

function summarizeClaims(source) {
  const rows = [];
  let previous = -1;
  const pages = source.manifest.claimSlice.pages;
  for (const [index, page] of pages.entries()) {
    const parsed = parseJson(requiredObject(source.objects, page.name), "CLAIMS_PAGE");
    const records = parsed.NfipClaims;
    if (!Array.isArray(records) || records.length !== page.records
      || records[0]?.id !== page.firstId || records.at(-1)?.id !== page.lastId
      || page.name !== `nfip-claims-nc-2024-pages/page-${String(index * 100).padStart(7, "0")}.json`
      || (index < pages.length - 1 && records.length !== 100)
      || (index === pages.length - 1 && records.length !== 41)
      || parsed.metadata?.entityname !== "NfipClaims"
      || parsed.metadata?.version !== "v3"
      || parsed.metadata?.skip !== index * 100 || parsed.metadata?.top !== 100
      || parsed.metadata?.filter !== source.manifest.claimSlice.filter
      || parsed.metadata?.orderby !== "id ASC") fail("CLAIMS_PAGE_INVALID", page.name);
    for (const row of records) {
      if (!Number.isSafeInteger(row.id) || row.id <= previous || row.state !== "NC"
        || row.yearOfLoss !== 2024 || Object.keys(row).length !== CLAIM_FIELDS.length
        || CLAIM_FIELDS.some((field) => !Object.hasOwn(row, field))) fail("CLAIM_ROW_INVALID");
      previous = row.id;
      publisherTime(row.asOfDate, "claim.asOfDate");
      publisherTime(row.dateOfLoss, "claim.dateOfLoss");
      publisherTime(row.openDate, "claim.openDate", true);
      publisherTime(row.mostRecentPaymentDate, "claim.mostRecentPaymentDate", true);
      publisherTime(row.mostRecentRecoveryDate, "claim.mostRecentRecoveryDate", true);
      rows.push(row);
    }
  }
  if (rows.length !== 3_341 || new Set(rows.map((row) => row.id)).size !== rows.length
    || canonicalizeStrict([...new Set(rows.map((row) => row.asOfDate))])
      !== canonicalizeStrict(["2026-08-03T00:00:00.000Z"])) fail("CLAIMS_TOTAL_INVALID");

  const eventCodes = new Map();
  const eventNames = new Map();
  const county = new Map();
  const payments = [];
  const latencyDays = [];
  const latencyBuckets = new Map();
  let zeroRecordedNetPayment = 0;
  let rowsWithPaymentDate = 0;
  let rowsWithRecoveryDate = 0;
  let negativePaymentLatency = 0;
  let policyCountAcrossClaimRecords = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.policyCount) || row.policyCount < 1) {
      fail("CLAIM_POLICY_COUNT_INVALID");
    }
    policyCountAcrossClaimRecords += row.policyCount;
    increment(eventCodes, row.eventDesignationNumber ?? "NULL");
    increment(eventNames, row.floodEvent ?? "NULL");
    const paid = (cents(row.netBuildingPaymentAmount, "netBuildingPaymentAmount") ?? 0n)
      + (cents(row.netContentsPaymentAmount, "netContentsPaymentAmount") ?? 0n)
      + (cents(row.netIccPaymentAmount, "netIccPaymentAmount") ?? 0n);
    if (paid < 0n) fail("NEGATIVE_NET_PAYMENT");
    payments.push(paid);
    if (paid === 0n) zeroRecordedNetPayment += 1;
    if (row.mostRecentPaymentDate) {
      rowsWithPaymentDate += 1;
      const days = Math.round((Date.parse(row.mostRecentPaymentDate) - Date.parse(row.dateOfLoss)) / 86_400_000);
      if (!Number.isSafeInteger(days)) fail("PAYMENT_DATE_INVALID");
      if (days < 0) negativePaymentLatency += 1;
      else {
        latencyDays.push(days);
        increment(latencyBuckets, days <= 30 ? "00_30" : days <= 90 ? "31_90"
          : days <= 180 ? "91_180" : days <= 365 ? "181_365" : "366_PLUS");
      }
    }
    if (row.mostRecentRecoveryDate) rowsWithRecoveryDate += 1;
    const key = row.countyCode ?? "NULL";
    const cell = county.get(key) ?? { countyCode: key, claimRecords: 0, netPaid: 0n };
    cell.claimRecords += 1;
    cell.netPaid += paid;
    county.set(key, cell);
  }
  payments.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  latencyDays.sort((a, b) => a - b);
  const countyCells = [...county.values()].sort((a, b) => a.countyCode.localeCompare(b.countyCode));
  const admittedCountyCells = countyCells.filter((cell) => cell.claimRecords >= 11)
    .map((cell) => ({ countyCode: cell.countyCode, claimRecords: cell.claimRecords,
      netPaidDollars: money(cell.netPaid) }));
  const suppressed = countyCells.filter((cell) => cell.claimRecords < 11);
  const netBuilding = sumMoney(rows, "netBuildingPaymentAmount");
  const netContents = sumMoney(rows, "netContentsPaymentAmount");
  const netIcc = sumMoney(rows, "netIccPaymentAmount");
  const netTotal = netBuilding + netContents + netIcc;
  const grossBuilding = sumMoney(rows, "amountPaidOnBuildingClaim");
  const grossContents = sumMoney(rows, "amountPaidOnContentsClaim");
  const grossIcc = sumMoney(rows, "amountPaidOnIncreasedCostOfComplianceClaim");
  const buildingRecovery = sumMoney(rows, "totalBldgClaimPmtRecovery");
  const contentsRecovery = sumMoney(rows, "totalContentsClaimPmtRecovery");
  const iccRecovery = sumMoney(rows, "totalIccClaimPmtRecovery");
  const salvageRecovery = sumMoney(rows, "totalSalvageRecovery");
  const subrogationRecovery = sumMoney(rows, "totalSubrogationRecovery");
  const grossTotal = grossBuilding + grossContents + grossIcc;
  const coverage = sumMoney(rows, "totalBuildingInsuranceCoverage")
    + sumMoney(rows, "totalContentsInsuranceCoverage");
  const recovery = salvageRecovery + buildingRecovery + contentsRecovery
    + iccRecovery + subrogationRecovery;
  if (grossBuilding - buildingRecovery !== netBuilding
    || grossContents - contentsRecovery !== netContents
    || grossIcc - iccRecovery !== netIcc) fail("CLAIM_PAYMENT_RECONCILIATION_INVALID");
  return {
    scope: {
      sourceEntity: "NfipClaims", sourceVersion: 3,
      selection: "ALL_2024_YEAR_OF_LOSS_ROWS_WITH_STATE_NC",
      recordCount: rows.length, uniquePublisherRecordIds: rows.length,
      publisherCallsRowsClaimsTransactions: true,
      uniquePublisherRecordIdDoesNotEstablishUniqueLossOrIidObservation: true,
      policyCountAcrossClaimRecords,
      policyCountAcrossClaimRecordsIsNotAnExposureDenominator: true,
      asOfDate: "2026-08-03T00:00:00.000Z",
      lossDateMinimum: rows.map((row) => row.dateOfLoss).sort()[0],
      lossDateMaximum: rows.map((row) => row.dateOfLoss).sort().at(-1),
      pages: pages.length, pageSize: 100, shortFinalPageRows: pages.at(-1).records,
      completeWithinFilterAtAcquisition: true,
      wholeUnitedStatesCorpus: false,
    },
    eventCohorts: { designationCodes: distribution(eventCodes), names: distribution(eventNames) },
    payments: {
      actualAdministrativePaymentFieldsAdmitted: true,
      netBuildingPaymentDollars: money(netBuilding),
      netContentsPaymentDollars: money(netContents),
      netIccPaymentDollars: money(netIcc),
      netTotalPaymentDollars: money(netTotal),
      grossReportedPaymentDollars: money(grossTotal),
      recordedRecoveryDollars: money(recovery),
      recoveryComponentsDollars: {
        buildingClaimPayment: money(buildingRecovery),
        contentsClaimPayment: money(contentsRecovery),
        increasedCostOfCompliance: money(iccRecovery),
        salvage: money(salvageRecovery),
        subrogation: money(subrogationRecovery),
      },
      grossMinusComponentClaimPaymentRecoveriesEqualsNet: true,
      rowsWithRecordedRecoveryDate: rowsWithRecoveryDate,
      rowsWithMostRecentPaymentDate: rowsWithPaymentDate,
      zeroRecordedNetPaymentRows: zeroRecordedNetPayment,
      zeroRecordedNetPaymentDoesNotMeanDeniedOrClosed: true,
    },
    claimReportedCoverage: {
      buildingAndContentsCoverageDollars: money(coverage),
      paidToClaimReportedCoverageRatio: ratio(netTotal, coverage),
      claimReportedCoverageIsNotAllPolicyExposure: true,
      frequencyDenominatorEstablished: false,
    },
    empiricalSeverity: {
      unit: "PUBLISHER_CLAIM_TRANSACTION_RECORD_NOT_PROVEN_UNIQUE_LOSS",
      meanNetPaidDollars: money((netTotal + BigInt(Math.floor(rows.length / 2)))
        / BigInt(rows.length)),
      p50NetPaidDollars: money(quantile(payments, 0.50)),
      p75NetPaidDollars: money(quantile(payments, 0.75)),
      p90NetPaidDollars: money(quantile(payments, 0.90)),
      p95NetPaidDollars: money(quantile(payments, 0.95)),
      p99NetPaidDollars: money(quantile(payments, 0.99)),
      maximumNetPaidDollars: money(payments.at(-1)),
      sourceDomainDescriptiveStatisticEligible: true,
      fittedTailDistributionEligible: false,
      iidAssumptionPermitted: false,
    },
    paymentLatency: {
      eligibleNonnegativeRows: latencyDays.length,
      negativeLatencyRowsQuarantined: negativePaymentLatency,
      buckets: distribution(latencyBuckets),
      p50Days: quantile(latencyDays, 0.50), p90Days: quantile(latencyDays, 0.90),
      p95Days: quantile(latencyDays, 0.95), maximumDays: latencyDays.at(-1),
      mostRecentPaymentDateIsNotClosureDate: true,
    },
    privacyProjection: {
      minimumPublishedCountyCell: 11,
      admittedCountyCells,
      suppressedSmallCountyCells: suppressed.length,
      suppressedSmallCountyClaimRecords: suppressed.reduce((sum, cell) => sum + cell.claimRecords, 0),
      rawPublisherIdsPersistedInDerivedArtifact: false,
      censusGeoidsPersistedInDerivedArtifact: false,
      individualClaimRowsPersistedInDerivedArtifact: false,
    },
  };
}

function summarizePenetration(objects) {
  const rows = parseJsonl(requiredObject(objects, "nfip-residential-penetration-v1.jsonl"),
    "PENETRATION");
  if (rows.length !== 3_159 || new Set(rows.map((row) => row.id)).size !== rows.length
    || rows.some((row) => row.asOfDate !== "2026-08-03T00:00:00.000Z"
      || Object.keys(row).length !== 11)) {
    fail("PENETRATION_ROWS_INVALID");
  }
  for (const row of rows) {
    if (typeof row.id !== "string"
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.id)
      || typeof row.state !== "string"
      || typeof row.county !== "string"
      || !(row.fipsCode === null || /^\d{5}$/.test(row.fipsCode))
      || ["resPenetrationRateSfha", "resPenetrationRate"].some((field) =>
        !(row[field] === null || typeof row[field] === "number" && Number.isFinite(row[field])))) {
      fail("PENETRATION_ROW_TYPE_INVALID");
    }
    publisherTime(row.asOfDate, "penetration.asOfDate");
  }
  const nonNull = (field, subset = rows) => subset.filter((row) => row[field] !== null);
  const integerSum = (field, subset = rows) => nonNull(field, subset)
    .reduce((sum, row) => {
      if (!Number.isSafeInteger(row[field]) || row[field] < 0) fail("PENETRATION_COUNT_INVALID", field);
      return sum + BigInt(row[field]);
    }, 0n);
  const northCarolina = rows.filter((row) => row.state === "North Carolina");
  const knownNc = northCarolina.filter((row) => /^37\d{3}$/.test(row.fipsCode ?? ""));
  const ncContracts = integerSum("resContractsInForce", knownNc);
  const ncStructures = integerSum("totalResStructures", knownNc);
  const ncSfhaContracts = integerSum("resContractsInForceSfha", knownNc);
  const ncSfhaStructures = integerSum("totalResStructuresSfha", knownNc);
  const pairedCompleteNc = knownNc.filter((row) => row.resContractsInForce !== null
    && row.totalResStructures !== null && row.resContractsInForceSfha !== null
    && row.totalResStructuresSfha !== null);
  if (pairedCompleteNc.length !== knownNc.length) fail("PENETRATION_NC_PAIR_MISSING");
  return {
    sourceEntity: "NfipResidentialPenetrationRates", sourceVersion: 1,
    asOfDate: "2026-08-03T00:00:00.000Z", rows: rows.length,
    rowCountMatchesPublishedMetadata: true,
    contractsInForceAreRealAdministrativeExposure: true,
    residentialStructureDenominatorIsNsiDerivedEstimate: true,
    national: {
      nonNullContractsInForceSum: integerSum("resContractsInForce").toString(),
      nonNullTotalResidentialStructuresSum: integerSum("totalResStructures").toString(),
      missingContractsInForceCells: rows.length - nonNull("resContractsInForce").length,
      missingTotalResidentialStructureCells: rows.length - nonNull("totalResStructures").length,
      sfhaPenetrationCellsAboveOneQuarantined: rows.filter(
        (row) => row.resPenetrationRateSfha !== null && row.resPenetrationRateSfha > 1).length,
      publisherExplainsOverOneRatesByNsiIncompleteness: true,
      aggregateComplete: false,
    },
    northCarolina: {
      countyRowsWithKnownFips: knownNc.length,
      pairedCompleteKnownFipsRows: pairedCompleteNc.length,
      unknownCountyRows: northCarolina.length - knownNc.length,
      contractsInForce: ncContracts.toString(),
      totalResidentialStructures: ncStructures.toString(),
      contractsInForceToEstimatedStructuresRatio: ratio(ncContracts, ncStructures),
      sfhaContractsInForce: ncSfhaContracts.toString(),
      sfhaResidentialStructures: ncSfhaStructures.toString(),
      sfhaContractsToEstimatedStructuresRatio: ratio(ncSfhaContracts, ncSfhaStructures),
    },
    temporalBoundary: {
      matchedTo2024ClaimLossDates: false,
      mayBeUsedAsHelene2024ClaimFrequencyDenominator: false,
      currentExposureAndHistoricalLossMayBeReportedSideBySideButNotDivided: true,
    },
  };
}

function daysBetween(start, end) {
  const value = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  if (!Number.isSafeInteger(value)) fail("APPEAL_DATE_INVALID");
  return value;
}

function officialTextWithFragments(objects, name, fragments) {
  const text = requiredObject(objects, name).toString("utf8");
  if (fragments.some((fragment) => !text.includes(fragment))) {
    fail("OFFICIAL_TEXT_SEMANTICS_INVALID", name);
  }
  return text;
}

function summarizeAppeals(objects) {
  const rows = parseJsonl(requiredObject(objects, "pa-second-appeals-tracker-v1.jsonl"),
    "APPEALS");
  if (rows.length !== 1_726 || new Set(rows.map((row) => row.id)).size !== rows.length) {
    fail("APPEAL_ROWS_INVALID");
  }
  const statuses = new Map();
  const roots = new Map();
  const durations = [];
  const receivedDates = [];
  const signedDates = [];
  let rfiSent = 0; let rfiReceived = 0; let rfiReceivedAfterDue = 0;
  let rawElapsedOver90 = 0; let rawElapsedOver180 = 0; let rawElapsedOver365 = 0;
  let statusWhitespaceNormalizedRows = 0;
  for (const row of rows) {
    const status = String(row.status ?? "").trim();
    if (!APPEAL_STATUSES.includes(status) || !Number.isSafeInteger(row.id)
      || !row.hqReceivedDate) fail("APPEAL_ROW_INVALID");
    for (const field of ["hqReceivedDate", "emailAcknowledgementDate", "rfiSentDate",
      "rfiDueDate", "rfiReceivedDate", "decisionSignedDate"]) {
      publisherTime(row[field], `appeal.${field}`, field !== "hqReceivedDate");
    }
    if (status !== row.status) statusWhitespaceNormalizedRows += 1;
    increment(statuses, status);
    receivedDates.push(row.hqReceivedDate);
    const root = [row.disasterNumber, row.recipient, row.applicantId, row.pwgmpNumber].join("|");
    increment(roots, root);
    if (row.rfiSentDate) rfiSent += 1;
    if (row.rfiReceivedDate) rfiReceived += 1;
    if (row.rfiReceivedDate && row.rfiDueDate
      && Date.parse(row.rfiReceivedDate) > Date.parse(row.rfiDueDate)) rfiReceivedAfterDue += 1;
    if (row.decisionSignedDate) {
      signedDates.push(row.decisionSignedDate);
      const days = daysBetween(row.hqReceivedDate, row.decisionSignedDate);
      if (days < 0) fail("APPEAL_NEGATIVE_DURATION");
      durations.push(days);
      if (days > 90) rawElapsedOver90 += 1;
      if (days > 180) rawElapsedOver180 += 1;
      if (days > 365) rawElapsedOver365 += 1;
    }
  }
  durations.sort((a, b) => a - b);
  receivedDates.sort();
  signedDates.sort();
  const collisionRows = [...roots.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const pending = statuses.get("Under Review") ?? 0;
  const merits = (statuses.get("Denied") ?? 0) + (statuses.get("Granted") ?? 0)
    + (statuses.get("Partially Granted") ?? 0);
  const proceduralOrNonMerits = rows.length - pending - merits;
  if (durations.length !== rows.length - pending || pending !== 55) {
    fail("APPEAL_SIGNED_PENDING_RECONCILIATION_INVALID");
  }
  officialTextWithFragments(objects,
    "fema-pa-appeal-napa-codes-standards-10.html", [
      "FEMA-4193", "(PW) 191", "2018-09-14T00:00:00", "$127,586.63",
      "$1,851,876.29", "Accordingly, I am denying this appeal",
      "This determination is the final decision on this matter",
    ]);
  officialTextWithFragments(objects,
    "fema-pa-appeal-seminole-result-declared-incident.html", [
      "FEMA-4337", "GMP 27317", "2021-09-28T16:00:00", "$697,180.18",
      "$547,067.66", "$546,471.14", "$546,471.40",
      "this appeal is partially granted", "This determination is the final decision on this matter",
    ]);
  const trackerMatches = [
    rows.filter((row) => row.disasterNumber === "4193" && row.recipient === "CA"
      && row.pwgmpNumber === "191"
      && row.status.trim() === "Denied"
      && row.decisionSignedDate === "2018-09-14T00:00:00.000Z"),
    rows.filter((row) => row.disasterNumber === "4337" && row.recipient === "FL"
      && row.pwgmpNumber === "27317"
      && row.status.trim() === "Partially Granted"
      && row.decisionSignedDate === "2021-09-28T00:00:00.000Z"),
  ];
  if (trackerMatches.some((matches) => matches.length !== 1)) {
    fail("FEMA_APPEAL_BODY_TRACKER_CORRELATION_INVALID");
  }
  const factSheet = requiredObject(objects, "fema-pa-appeals-fact-sheet-2024.pdf");
  if (!factSheet.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    fail("FEMA_APPEAL_FACT_SHEET_PDF_INVALID");
  }
  const seminoleCandidateDifference = cents("546471.40", "seminoleConclusion")
    - cents("546471.14", "seminoleBriefAndLetter");
  return {
    sourceEntity: "PublicAssistanceSecondAppealsTracker", sourceVersion: 1,
    realAdministrativeSecondAppealRecords: true,
    records: rows.length, uniquePublisherRecordIds: rows.length,
    rowCountMatchesPublishedMetadata: true,
    publisherRecordIdsPersistAcrossRefreshes: false,
    statusWhitespaceNormalizedRows,
    hqReceivedDateMinimum: receivedDates[0], hqReceivedDateMaximum: receivedDates.at(-1),
    decisionSignedDateMinimum: signedDates[0], decisionSignedDateMaximum: signedDates.at(-1),
    statusCounts: distribution(statuses),
    meritsDecisionRows: merits,
    proceduralOrNonMeritsStatusRows: proceduralOrNonMerits,
    signedDecisionRows: durations.length,
    pendingUnderReviewRows: pending,
    signedSecondAppealDecisionsAreFinalAgencyDeterminationsPerPublisherDescription: true,
    pendingUnderReviewRowsAreNotFinalDecisions: true,
    lifecycle: {
      rfiSentRows: rfiSent, rfiReceivedRows: rfiReceived,
      rfiReceivedAfterPublishedDueDateRows: rfiReceivedAfterDue,
      signedDecisionElapsedDays: {
        minimum: durations[0], p50: quantile(durations, 0.50),
        p90: quantile(durations, 0.90), p95: quantile(durations, 0.95),
        maximum: durations.at(-1),
      },
      rawElapsedOver90Days: rawElapsedOver90,
      rawElapsedOver180Days: rawElapsedOver180,
      rawElapsedOver365Days: rawElapsedOver365,
      rawElapsedThresholdCountsAreNotDeadlineViolationFindings: true,
      pendingRowsRightCensoredAndExcluded: pending,
      elapsedDistributionIsConditionedOnObservedSignedDecision: true,
    },
    correlationQuality: {
      distinctCompositeRoots: roots.size,
      additionalRowsSharingCompositeRoot: collisionRows,
      sharedCompositeRootsDoNotMakePublisherIdsDuplicates: true,
      publisherIdsCannotBeUsedAsLongitudinalRevisionKeys: true,
      independentAndIdenticallyDistributedCaseAssumptionPermitted: false,
    },
    amountBoundary: {
      trackerContainsDisputedOrAwardedAmountField: false,
      amountSeverityCalibrationFromTrackerPermitted: false,
    },
    procedureReference: {
      officialFactSheetPdfBytePinVerified: true,
      fullPdfPagesRead: 2,
      semanticReadoutMethod: "FULL_PDF_READ_WITH_PYPDF_6_1_1",
      semanticReadoutMechanicallyReplayedByThisJavascriptAdapter: false,
      secondAppealsAreFinalAgencyDecisionsPerFactSheet: true,
      appealContentSpecifiesAmountInDisputeWhenApplicable: true,
    },
    pinnedDecisionBodies: {
      completeOfficialHtmlBodiesDownloaded: 2,
      bodiesCorrelatedOneToOneWithTrackerRows: 2,
      htmlSemanticsMechanicallyReplayed: true,
      cases: [
        {
          caseAlias: "FEMA_4193_PW_191",
          trackerStatus: "Denied",
          trackerDecisionSignedDate: "2018-09-14T00:00:00.000Z",
          preAppealObligatedDollars: "127586.63",
          secondAppealAmountDeniedDollars: "1851876.29",
          finalAgencyDecisionLanguagePresent: true,
          singleOutcomeAndAmountReadingAdmitted: true,
        },
        {
          caseAlias: "FEMA_4337_GMP_27317",
          trackerStatus: "Partially Granted",
          trackerDecisionSignedDate: "2021-09-28T00:00:00.000Z",
          initialFundingRequestDollars: "697180.18",
          revisedSecondAppealAmountDollars: "547067.66",
          approvedAmountCandidateBriefAndLetterDollars: "546471.14",
          approvedAmountCandidateAnalysisConclusionDollars: "546471.40",
          candidateDifferenceDollars: money(seminoleCandidateDifference),
          internallyConflictingApprovedAmounts: true,
          singleApprovedAmountAdmitted: false,
          resolution: "QUARANTINE_AMOUNT_UNTIL_PUBLISHER_CORRECTION_OR_SUPERSEDING_RECORD",
          finalAgencyDecisionLanguagePresent: true,
        },
      ],
      namesAddressesAndApplicantIdsPersistedInDerivedArtifact: false,
    },
    privacyProjection: {
      appellantNamesPersistedInDerivedArtifact: false,
      applicantIdsPersistedInDerivedArtifact: false,
      projectNumbersPersistedInDerivedArtifact: false,
    },
  };
}

function summarizeCbca(objects) {
  const html = requiredObject(objects, "cbca-fema-index.html").toString("utf8");
  const links = [...html.matchAll(/href="([^"]+\.pdf)"/gi)]
    .map((match) => match[1]).filter((url) => url.includes("/files/decisions/"));
  if (links.length !== 349 || new Set(links).size !== links.length) fail("CBCA_INDEX_INVALID");
  const yearCounts = new Map();
  for (const link of links) {
    const year = link.match(/decisions\/(\d{4})\//)?.[1];
    if (!year) fail("CBCA_INDEX_YEAR_INVALID");
    increment(yearCounts, year);
  }
  for (const file of ["cbca-fema-rules-601-613.pdf", "cbca-7244-7245-decision.pdf",
    "cbca-7872-decision.pdf"]) {
    if (!requiredObject(objects, file).subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      fail("CBCA_PDF_INVALID", file);
    }
  }
  return {
    officialFemaArbitrationIndexEntries: links.length,
    uniqueOfficialDecisionPdfUrls: links.length,
    indexSnapshotCompleteAtAcquisition: true,
    indexedDecisionBodiesDownloaded: 2,
    allIndexedDecisionBodiesDownloaded: false,
    semanticOutcomeExtractionCoverage: "2/349",
    years: distribution(yearCounts),
    adjudicatingPanelReference: "CIVILIAN_BOARD_OF_CONTRACT_APPEALS",
    externalToFemaAdjudicationReferencePresent: true,
    executiveBranchInstitutionalIndependenceEstablishedByTheseSources: false,
    currentRules: {
      rules: "601-613", officialPdfBytePinVerified: true,
      rule603DescribesImpartialDisputeResolutionAndFinalExecutiveAction: true,
      rule613DescribesFinalAdministrativeActionAndNoMeritsReconsideration: true,
      semanticReadoutMethod: "FULL_FIVE_PAGE_PDF_READ_WITH_PYPDF_6_1_1",
      semanticReadoutMechanicallyReplayedByThisJavascriptAdapter: false,
    },
    pinnedDecisionExamples: [
      {
        caseNumbers: ["CBCA 7244-FEMA", "CBCA 7245-FEMA"], decisionDate: "2022-06-02",
        fullPdfPagesRead: 4, officialPdfBytePinVerified: true,
        initiallyRequestedDollarsByProject: ["2655460.30", "1259974.87"],
        laborClaimNoLongerPursued: true, debrisRecoveryBaseDollars: "2678767.20",
        appliedDiscountDollars: "535753.44", finalGrantedDollars: "2143013.76",
        semanticReadoutMethod: "FULL_PDF_READ_WITH_PYPDF_6_1_1",
        semanticReadoutMechanicallyReplayedByThisJavascriptAdapter: false,
      },
      {
        caseNumbers: ["CBCA 7872-FEMA"], decisionDate: "2024-11-12",
        fullPdfPagesRead: 10, officialPdfBytePinVerified: true,
        arbitrationRequestDollars: "1372059.63",
        firstAppealEligibleDollarsReported: "668996.50",
        majorityDecisionReimbursementDollars: "1105082.26",
        separateOpinionPresent: true,
        semanticReadoutMethod: "FULL_PDF_READ_WITH_PYPDF_6_1_1",
        semanticReadoutMechanicallyReplayedByThisJavascriptAdapter: false,
      },
    ],
    amountExamplesMayNotBePooledWithNfipClaimsOrAppealTracker: true,
  };
}

function validateTerms(objects) {
  const terms = requiredObject(objects, "openfema-terms.html").toString("utf8");
  const required = [
    "used solely for statistical research or as a reporting record",
    "not to reidentify nor attempt to reidentify",
    "cannot be used to make determinations that might affect an individual’s rights or eligibility for benefits",
    "can be used to make decisions on program management",
    "This product uses the Federal Emergency Management Agency’s OpenFEMA API, but is not endorsed by FEMA",
    "January 22, 2025",
  ];
  if (required.some((fragment) => !terms.includes(fragment))) fail("OPENFEMA_TERMS_INVALID");
  return {
    termsBytesReplayed: true, termsSnapshotDate: "2025-01-22",
    publicAccess: true,
    permittedUse: ["STATISTICAL_RESEARCH", "REPORTING_RECORD", "PROGRAM_MANAGEMENT_DECISIONS"],
    forbiddenUse: ["REIDENTIFICATION", "INDIVIDUAL_RIGHTS_OR_BENEFIT_ELIGIBILITY_DECISIONS"],
    cessationAndDestructionMayBeRequestedByFema: true,
    attributionAndNonEndorsementStatementRequired: true,
    openFemaDatasetLicenseMetadataValue: null,
    trainingAuthorityGranted: false,
    publicAccessDoesNotEqualUnrestrictedUse: true,
  };
}

function buildFromOfficialSource(sourceDirectory, generatedAt) {
  const source = loadOfficialSource(sourceDirectory);
  const metadata = validateMetadata(source.objects);
  const terms = validateTerms(source.objects);
  const claims = summarizeClaims(source);
  const penetration = summarizePenetration(source.objects);
  const appeals = summarizeAppeals(source.objects);
  const cbca = summarizeCbca(source.objects);
  const body = {
    schema: FEMA_REAL_CASES_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt,
    source: {
      sourceRealityClass: "REAL_ADMINISTRATIVE_CASES_AND_EXPERIENCE",
      sourceIsRealWorldData: true,
      publicDiscoveryDoesNotDowngradeRealityClass: true,
      acquiredAt: FEMA_REAL_CASES_FROZEN_SOURCE_20260821.acquiredAt,
      publisherAuthority: ["FEMA_OPENFEMA", "US_GSA_CBCA"],
      officialFrozenSourceVerified: true,
      sourceArtifactsReverified: true,
      acquisitionManifestHash: FEMA_REAL_CASES_FROZEN_SOURCE_20260821.manifestHash,
      sourceCommitmentHash: source.commitment,
      sourceObjects: FEMA_REAL_CASES_FROZEN_SOURCE_20260821.sourceObjects,
      sourceBytes: source.totalBytes,
      openFemaMetadataStableAcrossAcquisition: true,
      fieldDefinitionsPublisherVerified: metadata.fieldDefinitionsVerified,
      publisherDatasetRefreshes: {
        nfipClaims: metadata.byName.NfipClaims.lastDataSetRefresh,
        nfipPolicies: metadata.byName.NfipPolicies.lastDataSetRefresh,
        nfipResidentialPenetrationRates:
          metadata.byName.NfipResidentialPenetrationRates.lastDataSetRefresh,
        publicAssistanceSecondAppealsTracker:
          metadata.byName.PublicAssistanceSecondAppealsTracker.lastDataSetRefresh,
      },
      rights: {
        realityClassificationUnaffectedByRights: true,
        openFema: terms,
        cbca: {
          publicWebAccess: true,
          explicitReuseLicenseLocatedInFrozenSources: false,
          downstreamRedistributionAuthorityEstablished: false,
          modelTrainingAuthorityEstablished: false,
        },
      },
    },
    qualityBoundary: {
      officialPublisherAndExactBytePinsNecessaryButNotSufficient: true,
      appealTrackerDescribesSmallPercentageHumanError: true,
      nfipClaimsAndPoliciesDescribeSystemOfRecordLag: true,
      claimsPoliciesAndAppealsSayNotOfficialFederalReport: true,
      missingnessRetained: true,
      smallCellsSuppressedInDerivedProjection: true,
      selectionBiasExplicit: true,
      openFemaMetadataStartEndSemanticsIdenticalExcludingRequestRunDate: true,
      openFemaMetadataStartEndBytesIdentical: false,
      claimFirstPageRecordsStableOnPostPaginationReplay: true,
      allSourceObjectsHaveIndependentEndOfAcquisitionReplay: false,
      appealPublisherIdsStableAcrossRefreshes: false,
      heterogeneousMoneyAndUnitsNeverPooled: true,
    },
    nfipClaims: claims,
    nfipPolicyTransactionBoundary: {
      sourceEntity: "NfipPolicies", sourceVersion: 3,
      publishedRecordCount: metadata.byName.NfipPolicies.recordCount,
      publisherDescribesRowsAsPolicyTransactions: true,
      completePolicyTransactionRowsDownloaded: false,
      publishedTransactionRecordCountTreatedAsPoliciesInForce: false,
      publishedTransactionRecordCountTreatedAsExposureDenominator: false,
      reason: "TRANSACTIONS_CANNOT_BE_RELABELED_AS_DISTINCT_ACTIVE_POLICY_EXPOSURES",
    },
    nfipResidentialExposure: penetration,
    publicAssistanceSecondAppeals: appeals,
    cbcaArbitration: cbca,
    factorEntrance: {
      realPaidLossAndRecoveryExperiencePresent: true,
      realCurrentResidentialContractsInForcePresent: true,
      realSecondAppealOutcomesAndDurationsPresent: true,
      realExternalToFemaAdjudicatingPanelDecisionsPresent: true,
      cbcaRulesStateImpartialDisputeResolution: true,
      executiveBranchInstitutionalIndependenceEstablished: false,
      sourceDomainPublisherRecordPaymentSeverityDescriptivesEligible: true,
      sourceDomainPaymentLatencyDescriptivesEligible: true,
      sourceDomainAppealDurationDescriptivesEligible: true,
      historicalClaimsMatchedToContemporaneousExposure: false,
      claimFrequencyCalibrationEligible: false,
      tailOrDependenceModelEligible: false,
      transferToAiAgentOrRobotDomainEstablished: false,
      individualRightsOrEligibilityDecisionUsePermitted: false,
      affectedPartyStandingEstablishedForOutsider: false,
      permitsPrice: false, permitsGuarantee: false, permitsSettle: false,
      permitsCoverage: false, permitsCapital: false, permitsCustody: false,
      permitsTraining: false, permitsClosure: false,
      decision: "ADMIT_REAL_CASES_AND_EXPERIENCE_WITH_SOURCE_DOMAIN_AND_RIGHTS_BOUNDARIES",
    },
    authority: {
      observe: true,
      describeSourceDomain: true,
      sourceDomainShadowCalibration: true,
      price: false,
      guarantee: false,
      settle: false,
      coverage: false,
      capital: false,
      custody: false,
      train: false,
      close: false,
    },
  };
  return Object.freeze({ ...body,
    artifactHash: domainHash("outsider:fema-real-cases-evidence:v1", body) });
}

export function buildFemaRealCasesEvidence(sourceDirectory, options) {
  const { generatedAt } = exactOptions(options);
  return buildFromOfficialSource(sourceDirectory, generatedAt);
}

export function verifyFemaRealCasesEvidence(artifact) {
  try {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)
      || artifact.schema !== FEMA_REAL_CASES_SCHEMA || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_INVALID");
    }
    const copy = structuredClone(artifact);
    const actual = copy.artifactHash;
    delete copy.artifactHash;
    if (actual !== domainHash("outsider:fema-real-cases-evidence:v1", copy)) fail("ARTIFACT_HASH_INVALID");
    return Object.freeze({
      ok: true,
      verificationLevel: "SELF_SEALED_UNTRUSTED_ENVELOPE",
      artifactEnvelopeHashVerified: true,
      artifactStructureVerified: false,
      metricDerivationVerified: false,
      allMetricDerivationsMechanicallyVerified: false,
      authorityBoundaryVerified: false,
      sourceArtifactsReverified: false,
      officialFrozenSourceVerified: false,
      machineDerivedJsonAndJsonlMetricsVerified: false,
      officialPdfBytesVerified: false,
      pdfSemanticReadoutMechanicallyVerified: false,
    });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error),
      verificationLevel: "FAILED", artifactEnvelopeHashVerified: false,
      artifactStructureVerified: false, metricDerivationVerified: false,
      allMetricDerivationsMechanicallyVerified: false,
      authorityBoundaryVerified: false, sourceArtifactsReverified: false,
      officialFrozenSourceVerified: false,
      machineDerivedJsonAndJsonlMetricsVerified: false,
      officialPdfBytesVerified: false,
      pdfSemanticReadoutMechanicallyVerified: false });
  }
}

export function verifyFemaRealCasesEvidenceWithSource(artifact, sourceDirectory) {
  try {
    const standalone = verifyFemaRealCasesEvidence(artifact);
    if (!standalone.ok) fail("ARTIFACT_ENVELOPE_INVALID");
    const expected = buildFromOfficialSource(sourceDirectory, canonicalTime(artifact.generatedAt));
    if (canonicalizeStrict(expected) !== canonicalizeStrict(artifact)) fail("ARTIFACT_SOURCE_REBUILD_MISMATCH");
    return Object.freeze({
      ok: true,
      verificationLevel: "FULL_FEMA_CBCA_FROZEN_SOURCE_REPLAY",
      artifactEnvelopeHashVerified: true,
      artifactStructureVerified: true,
      metricDerivationVerified: false,
      allMetricDerivationsMechanicallyVerified: false,
      authorityBoundaryVerified: true,
      sourceArtifactsReverified: true,
      officialFrozenSourceVerified: true,
      machineDerivedJsonAndJsonlMetricsVerified: true,
      officialPdfBytesVerified: true,
      pdfSemanticReadoutMechanicallyVerified: false,
      sourceRealityClass: artifact.source.sourceRealityClass,
      priceAuthority: false, settlementAuthority: false,
      individualRightsDecisionUsePermitted: false,
    });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error),
      verificationLevel: "FAILED", artifactEnvelopeHashVerified: false,
      artifactStructureVerified: false, metricDerivationVerified: false,
      allMetricDerivationsMechanicallyVerified: false,
      authorityBoundaryVerified: false, sourceArtifactsReverified: false,
      officialFrozenSourceVerified: false,
      machineDerivedJsonAndJsonlMetricsVerified: false,
      officialPdfBytesVerified: false,
      pdfSemanticReadoutMechanicallyVerified: false });
  }
}
