#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const BASE = "https://www.fema.gov";
const CBCA = "https://www.cbca.gov";
const CLAIM_ENTITY = "NfipClaims";
const CLAIM_PAGE_SIZE = 100;
const CLAIM_FILTER = "yearOfLoss eq 2024 and state eq 'NC'";
const CLAIM_ORDER = "id";
const OFFICIAL_HOSTS = new Set(["www.fema.gov", "www.cbca.gov"]);
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
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

const DIRECT_OBJECTS = Object.freeze([
  Object.freeze({
    name: "openfema-datasets-nfip-appeals-start.json",
    url: `${BASE}/api/open/v1/OpenFemaDataSets?%24filter=name%20eq%20%27NfipClaims%27%20or%20name%20eq%20%27NfipPolicies%27%20or%20name%20eq%20%27NfipResidentialPenetrationRates%27%20or%20name%20eq%20%27PublicAssistanceSecondAppealsTracker%27&%24top=10`,
  }),
  Object.freeze({
    name: "openfema-fields-nfip-claims-v3.json",
    url: `${BASE}/api/open/v1/OpenFemaDataSetFields?%24filter=openFemaDataSet%20eq%20%27NfipClaims%27%20and%20datasetVersion%20eq%203&%24top=200&%24orderby=sortOrder`,
  }),
  Object.freeze({
    name: "openfema-fields-nfip-policies-v3.json",
    url: `${BASE}/api/open/v1/OpenFemaDataSetFields?%24filter=openFemaDataSet%20eq%20%27NfipPolicies%27%20and%20datasetVersion%20eq%203&%24top=200&%24orderby=sortOrder`,
  }),
  Object.freeze({
    name: "openfema-fields-nfip-penetration-v1.json",
    url: `${BASE}/api/open/v1/OpenFemaDataSetFields?%24filter=openFemaDataSet%20eq%20%27NfipResidentialPenetrationRates%27%20and%20datasetVersion%20eq%201&%24top=200&%24orderby=sortOrder`,
  }),
  Object.freeze({
    name: "openfema-fields-pa-second-appeals-v1.json",
    url: `${BASE}/api/open/v1/OpenFemaDataSetFields?%24filter=openFemaDataSet%20eq%20%27PublicAssistanceSecondAppealsTracker%27%20and%20datasetVersion%20eq%201&%24top=200&%24orderby=sortOrder`,
  }),
  Object.freeze({
    name: "nfip-residential-penetration-v1.jsonl",
    url: `${BASE}/api/open/v1/NfipResidentialPenetrationRates.jsonl`,
  }),
  Object.freeze({
    name: "pa-second-appeals-tracker-v1.jsonl",
    url: `${BASE}/api/open/v1/PublicAssistanceSecondAppealsTracker.jsonl`,
  }),
  Object.freeze({
    name: "openfema-terms.html",
    url: `${BASE}/about/openfema/terms-conditions`,
  }),
  Object.freeze({
    name: "fema-pa-appeals-fact-sheet-2024.pdf",
    url: `${BASE}/sites/default/files/documents/fema_pa-appeals-fact-sheet_2024.pdf`,
  }),
  Object.freeze({
    name: "fema-pa-appeal-napa-codes-standards-10.html",
    url: `${BASE}/appeal/codes-and-standards-10`,
  }),
  Object.freeze({
    name: "fema-pa-appeal-seminole-result-declared-incident.html",
    url: `${BASE}/appeal/result-declared-incident-allowable-costs-and-reasonable-costs`,
  }),
  Object.freeze({
    name: "cbca-fema-index.html",
    url: `${CBCA}/decisions/fema.html`,
  }),
  Object.freeze({
    name: "cbca-fema-rules-601-613.pdf",
    url: `${CBCA}/howto/rules/CBCA%20Rules%20of%20Procedure%20-%20FEMA%20Arbitrations%20Under%2042%20U.S.C.%205189a(d).pdf`,
  }),
  Object.freeze({
    name: "cbca-7244-7245-decision.pdf",
    url: `${CBCA}/files/decisions/2022/KULLBERG_06-02-22_7244-FEMA__CONSOLIDATED_NORTH_COUNTY_LEVEE_DISTRICT%20(Decision).pdf`,
  }),
  Object.freeze({
    name: "cbca-7872-decision.pdf",
    url: `${CBCA}/files/decisions/2024/SULLIVAN_11-12-24_7872-FEMA__SCHOOL_BOARD_OF_BAY_COUNTY_FLORIDA%20(DECISION).pdf`,
  }),
]);

function usage() {
  return [
    "Usage:",
    "  node scripts/acquire-fema-real-cases.mjs --out <new-source-dir> --acquired-at <canonical-ISO>",
    "",
    "Downloads only official FEMA/OpenFEMA and CBCA sources. The output directory must not exist.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.includes("--help")) return { help: true };
  const allowed = new Set(["--out", "--acquired-at"]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(`FEMA_ACQUIRE_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    if (Object.hasOwn(values, key)) throw new Error(`FEMA_ACQUIRE_ARGUMENT_DUPLICATE:${key}`);
    values[key] = value;
  }
  if (!values["--out"]) throw new Error("FEMA_ACQUIRE_ARGUMENT_REQUIRED:--out");
  if (!values["--acquired-at"]) throw new Error("FEMA_ACQUIRE_ARGUMENT_REQUIRED:--acquired-at");
  const acquiredAt = new Date(values["--acquired-at"]).toISOString();
  if (acquiredAt !== values["--acquired-at"]) {
    throw new Error("FEMA_ACQUIRE_TIME_NON_CANONICAL");
  }
  if (Math.abs(Date.now() - Date.parse(acquiredAt)) > 5 * 60_000) {
    throw new Error("FEMA_ACQUIRE_TIME_NOT_CURRENT");
  }
  return { output: path.resolve(values["--out"]), acquiredAt };
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchBytes(url, attempts = 8) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "*/*",
          "user-agent": "Outsider-FEMA-real-cases-acquisition/1.0",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const finalUrl = new URL(response.url);
      if (finalUrl.protocol !== "https:" || !OFFICIAL_HOSTS.has(finalUrl.hostname)) {
        throw new Error(`NON_OFFICIAL_REDIRECT:${response.url}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_DOWNLOAD_BYTES) {
        throw new Error(`DOWNLOAD_SIZE_INVALID:${bytes.length}`);
      }
      return bytes;
    } catch (error) {
      last = error;
      if (attempt < attempts) await sleep(Math.min(15_000, 750 * (2 ** (attempt - 1))));
    }
  }
  throw new Error(`FEMA_ACQUIRE_FETCH_FAILED:${url}:${last instanceof Error ? last.message : String(last)}`);
}

function safeWrite(directory, name, bytes) {
  const target = path.join(directory, name);
  const relative = path.relative(directory, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("FEMA_ACQUIRE_OUTPUT_PATH_INVALID");
  }
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  return {
    name,
    url: null,
    bytes: statSync(target).size,
    sha256: sha256(readFileSync(target)),
  };
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${code}_JSON_INVALID`);
  }
}

function stableMetadataProjection(bytes, code) {
  const parsed = parseJson(bytes, code);
  if (!Array.isArray(parsed.OpenFemaDataSets) || !parsed.metadata) {
    throw new Error(`${code}_SHAPE_INVALID`);
  }
  const { rundate: _requestRunDate, ...request } = parsed.metadata;
  return { request, records: parsed.OpenFemaDataSets };
}

function claimPageUrl(skip) {
  const url = new URL(`${BASE}/api/open/v3/${CLAIM_ENTITY}`);
  url.searchParams.set("$filter", CLAIM_FILTER);
  url.searchParams.set("$top", String(CLAIM_PAGE_SIZE));
  url.searchParams.set("$skip", String(skip));
  url.searchParams.set("$orderby", CLAIM_ORDER);
  url.searchParams.set("$select", CLAIM_FIELDS.join(","));
  return url.toString();
}

function checkClaimPage(value, skip, previousId) {
  if (!value || typeof value !== "object" || !Array.isArray(value[CLAIM_ENTITY])) {
    throw new Error("FEMA_CLAIM_PAGE_SHAPE_INVALID");
  }
  const metadata = value.metadata;
  if (!metadata || metadata.entityname !== CLAIM_ENTITY || metadata.version !== "v3"
    || metadata.skip !== skip || metadata.top !== CLAIM_PAGE_SIZE
    || metadata.filter !== CLAIM_FILTER || metadata.orderby !== `${CLAIM_ORDER} ASC`) {
    throw new Error("FEMA_CLAIM_PAGE_METADATA_INVALID");
  }
  const records = value[CLAIM_ENTITY];
  if (records.length > CLAIM_PAGE_SIZE) throw new Error("FEMA_CLAIM_PAGE_OVERFLOW");
  let last = previousId;
  for (const record of records) {
    if (!record || typeof record !== "object" || !Number.isSafeInteger(record.id)
      || record.id <= last || record.state !== "NC" || record.yearOfLoss !== 2024) {
      throw new Error("FEMA_CLAIM_PAGE_RECORD_INVALID");
    }
    const keys = Object.keys(record).sort();
    if (keys.length !== CLAIM_FIELDS.length
      || !CLAIM_FIELDS.every((field) => Object.hasOwn(record, field))) {
      throw new Error("FEMA_CLAIM_PAGE_FIELD_SET_INVALID");
    }
    last = record.id;
  }
  return { records, last };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.output === path.parse(options.output).root) {
    throw new Error("FEMA_ACQUIRE_OUTPUT_TOO_BROAD");
  }
  mkdirSync(options.output, { recursive: false, mode: 0o700 });
  const objects = [];
  for (const source of DIRECT_OBJECTS) {
    const bytes = await fetchBytes(source.url);
    const object = safeWrite(options.output, source.name, bytes);
    object.url = source.url;
    objects.push(object);
  }

  const pages = [];
  let skip = 0;
  let previousId = -1;
  let firstRecords = null;
  while (true) {
    const url = claimPageUrl(skip);
    const bytes = await fetchBytes(url);
    const parsed = parseJson(bytes, "FEMA_CLAIM_PAGE");
    const checked = checkClaimPage(parsed, skip, previousId);
    if (checked.records.length === 0) break;
    if (firstRecords === null) firstRecords = checked.records;
    const name = `nfip-claims-nc-2024-pages/page-${String(skip).padStart(7, "0")}.json`;
    const object = safeWrite(options.output, name, bytes);
    object.url = url;
    object.records = checked.records.length;
    object.firstId = checked.records[0].id;
    object.lastId = checked.records.at(-1).id;
    pages.push(object);
    previousId = checked.last;
    skip += checked.records.length;
    if (checked.records.length < CLAIM_PAGE_SIZE) break;
  }
  if (pages.length === 0 || firstRecords === null) {
    throw new Error("FEMA_CLAIM_SLICE_EMPTY");
  }
  const replayBytes = await fetchBytes(claimPageUrl(0));
  const replay = checkClaimPage(parseJson(replayBytes, "FEMA_CLAIM_REPLAY"), 0, -1);
  if (JSON.stringify(replay.records) !== JSON.stringify(firstRecords)) {
    throw new Error("FEMA_CLAIM_TOCTOU_FIRST_PAGE_CHANGED");
  }

  const endMetadataUrl = DIRECT_OBJECTS[0].url;
  const endMetadataBytes = await fetchBytes(endMetadataUrl);
  const endMetadata = safeWrite(options.output,
    "openfema-datasets-nfip-appeals-end.json", endMetadataBytes);
  endMetadata.url = endMetadataUrl;
  objects.push(endMetadata);
  const startMetadataBytes = readFileSync(path.join(options.output,
    "openfema-datasets-nfip-appeals-start.json"));
  if (JSON.stringify(stableMetadataProjection(startMetadataBytes, "FEMA_METADATA_START"))
    !== JSON.stringify(stableMetadataProjection(endMetadataBytes, "FEMA_METADATA_END"))) {
    throw new Error("FEMA_METADATA_CHANGED_DURING_ACQUISITION");
  }

  const manifest = {
    schema: "outsider/fema-real-cases-acquisition/v1",
    acquiredAt: options.acquiredAt,
    officialHosts: [...OFFICIAL_HOSTS],
    openFemaApiRequiresRegistration: false,
    claimSlice: {
      entity: CLAIM_ENTITY,
      version: 3,
      filter: CLAIM_FILTER,
      orderby: `${CLAIM_ORDER} ASC`,
      selectedFields: CLAIM_FIELDS,
      pageSize: CLAIM_PAGE_SIZE,
      pages,
      records: pages.reduce((total, page) => total + page.records, 0),
      firstPageReplayedAfterPagination: true,
      firstPageRecordsUnchanged: true,
      sourceSelectionMeaning: "ALL_OPENFEMA_NFIP_V3_CLAIM_TRANSACTIONS_WITH_YEAR_OF_LOSS_2024_AND_STATE_NC_AT_ACQUISITION",
    },
    directObjects: objects,
    boundaries: {
      sourceDataAreRealAdministrativeRecords: true,
      publicSourceDoesNotReduceRealityClass: true,
      officialPublisherDoesNotRemoveDocumentedHumanErrorOrSystemLag: true,
      claimSliceIsNotAllUnitedStatesClaims: true,
      penetrationSnapshotIsNotHistoricalHeleneExposure: true,
      policyTransactionsAreNotAssumedIndependentPolicies: true,
      appealTrackerDoesNotContainDisputedOrAwardedAmounts: true,
      cbcaIndexDoesNotByItselfEstablishDecisionOutcomeOrAmount: true,
      noOutsiderPricingGuaranteeSettlementCapitalCustodyOrLegalAuthority: true,
    },
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestObject = safeWrite(options.output, "acquisition-manifest.json", manifestBytes);
  process.stdout.write(`${JSON.stringify({ ok: true, output: options.output,
    manifest: manifestObject, claimRecords: manifest.claimSlice.records,
    claimPages: pages.length, directObjects: objects.length }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
