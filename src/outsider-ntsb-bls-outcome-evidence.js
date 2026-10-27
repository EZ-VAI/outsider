/*
 * Official NTSB completed partial-automation cases and BLS IIF 2024
 * outcome/exposure experience.
 *
 * Public origin does not demote real-world evidence to "research only".
 * Nor does Outsider's collection upgrade its authority: NTSB findings
 * remain safety-investigation findings, SOII remains a survey estimate, and
 * CFOI counts remain census counts whose published rates use CPS-estimated
 * exposure.  This adapter preserves those source roles and fails closed on
 * source, parser, denominator, classification, suppression, or revision drift.
 */

import { createHash } from "node:crypto";
import {
  accessSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, openSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const NTSB_BLS_OUTCOME_EVIDENCE_SCHEMA = "outsider/ntsb-bls-real-outcome-evidence/v1";
const FROZEN_AT = "2026-08-21T11:30:00.000Z";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_SOURCE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 128 * 1024 * 1024;
const ACQUISITION_NAME = "acquisition.json";

const NTSB_BASE = "https://www.ntsb.gov";
const BLS_SOII_BASE = "https://www.bls.gov/iif/nonfatal-injuries-and-illnesses-tables";
const BLS_CFOI_BASE = "https://www.bls.gov/iif/fatal-injuries-tables";

const SOURCE_FILES = [
  { name: "partial-automation-index.html", lane: "NTSB", kind: "COMPLETED_AND_ONGOING_INDEX",
    url: `${NTSB_BASE}/Advocacy/SafetyIssues/Pages/Partial%20Automation.aspx`, bytes: 65_994,
    sha256: "sha256:f6c1dabbb71211ebe3ddfb6ed0e692fbb9c57838c90eeab1828767c709ae84fc" },
  { name: "HWY24FH008.html", lane: "NTSB", kind: "COMPLETED_INVESTIGATION_PAGE", caseId: "HWY24FH008",
    url: `${NTSB_BASE}/investigations/Pages/HWY24FH008.aspx`, bytes: 82_374,
    sha256: "sha256:e8b6f64c08efa1296b693ac1337f332212edad0e2f5b6f853334fa41a95f2759" },
  { name: "HWY24FH006.html", lane: "NTSB", kind: "COMPLETED_INVESTIGATION_PAGE", caseId: "HWY24FH006",
    url: `${NTSB_BASE}/investigations/Pages/HWY24FH006.aspx`, bytes: 85_783,
    sha256: "sha256:e5a9e369360d6d8981c04a93d427184ec8f9bce1552b7f5c5e2edb90a05c536c" },
  { name: "HWY19FH008.html", lane: "NTSB", kind: "COMPLETED_INVESTIGATION_PAGE", caseId: "HWY19FH008",
    url: `${NTSB_BASE}/investigations/Pages/HWY19FH008.aspx`, bytes: 73_901,
    sha256: "sha256:8c79266d429d5c57ad57c83a27f7d9280673623653e16ed0d1adafedf2f680e4" },
  { name: "HWY18FH011.html", lane: "NTSB", kind: "COMPLETED_INVESTIGATION_PAGE", caseId: "HWY18FH011",
    url: `${NTSB_BASE}/investigations/Pages/HWY18FH011.aspx`, bytes: 80_849,
    sha256: "sha256:6583915573f7dabab0183a6b58c33851a674fbb6d26891c0ff7482b08e6a47a6" },
  { name: "HWY18FH004.html", lane: "NTSB", kind: "COMPLETED_INVESTIGATION_PAGE", caseId: "HWY18FH004",
    url: `${NTSB_BASE}/investigations/Pages/HWY18FH004.aspx`, bytes: 73_369,
    sha256: "sha256:5dca35fcf5f8c4ccb16bde65eec3cc032f0c65665a80cd6fa85ecfd456719a58" },
  { name: "HWY16FH018.html", lane: "NTSB", kind: "COMPLETED_INVESTIGATION_PAGE", caseId: "HWY16FH018",
    url: `${NTSB_BASE}/investigations/Pages/HWY16FH018.aspx`, bytes: 78_471,
    sha256: "sha256:dfbb42361691751ae4cb1c1b4efb9c83175980aa7af45b617c698a010ef6d9a4" },
  { name: "HIR2602.pdf", lane: "NTSB", kind: "ADOPTED_FINAL_REPORT", reportId: "HIR2602",
    caseIds: ["HWY24FH006", "HWY24FH008"], pages: 128,
    url: `${NTSB_BASE}/investigations/AccidentReports/Reports/HIR2602.pdf`, bytes: 10_061_229,
    sha256: "sha256:e089183c83faed28b6357a6575f7c58dbc298059dfe573b7659086ad67d41992" },
  { name: "HAB2001.pdf", lane: "NTSB", kind: "ADOPTED_FINAL_REPORT", reportId: "HAB2001",
    caseIds: ["HWY19FH008"], pages: 15,
    url: `${NTSB_BASE}/investigations/AccidentReports/Reports/HAB2001.pdf`, bytes: 826_366,
    sha256: "sha256:3157beeb98b18bcdeef6b5af1c63f7321764fbfd4cdf1bd157908568e78226fb" },
  { name: "HAR2001.pdf", lane: "NTSB", kind: "ADOPTED_FINAL_REPORT", reportId: "HAR2001",
    caseIds: ["HWY18FH011"], pages: 96,
    url: `${NTSB_BASE}/investigations/AccidentReports/Reports/HAR2001.pdf`, bytes: 3_374_267,
    sha256: "sha256:3784e2ed8219b52b9e397adba3dec69a7ee040208230581cec90de6ac24b694a" },
  { name: "HAB1907.pdf", lane: "NTSB", kind: "ADOPTED_FINAL_REPORT", reportId: "HAB1907",
    caseIds: ["HWY18FH004"], pages: 14,
    url: `${NTSB_BASE}/investigations/AccidentReports/Reports/HAB1907.pdf`, bytes: 811_788,
    sha256: "sha256:8a6fc9fd6f2fa165bcf494735f2bbc2b6e989e2c7fb17c72f5954e5d98d36c36" },
  { name: "HAR1702.pdf", lane: "NTSB", kind: "ADOPTED_FINAL_REPORT", reportId: "HAR1702",
    caseIds: ["HWY16FH018"], pages: 63,
    url: `${NTSB_BASE}/investigations/AccidentReports/Reports/HAR1702.pdf`, bytes: 3_160_722,
    sha256: "sha256:4fca215cec751ee48701aa3d451477ad539ed4260cfe74662426c7cb61255276" },
  { name: "HWY24FH008-docket.html", lane: "NTSB", kind: "PUBLIC_DOCKET_INDEX", caseId: "HWY24FH008", docketItems: 17,
    url: "https://data.ntsb.gov/Docket/?NTSBNumber=HWY24FH008", bytes: 33_502,
    sha256: "sha256:d50a70e2e96797112ba48203cece8fd96564f22a13e52e2ef893b910109a8476" },
  { name: "HWY24FH006-docket.html", lane: "NTSB", kind: "PUBLIC_DOCKET_INDEX", caseId: "HWY24FH006", docketItems: 22,
    url: "https://data.ntsb.gov/Docket/?NTSBNumber=HWY24FH006", bytes: 37_156,
    sha256: "sha256:3c517b7413858db347fdce3016e4fb3894104f22012378542959566a9255dd91" },
  { name: "HWY19FH008-docket.html", lane: "NTSB", kind: "PUBLIC_DOCKET_INDEX", caseId: "HWY19FH008", docketItems: 40,
    url: "https://data.ntsb.gov/Docket/?NTSBNumber=HWY19FH008", bytes: 47_787,
    sha256: "sha256:324f15a45f081028686e8f72f9819d0d8cf3a5ed574493c8498f38995db313d2" },
  { name: "HWY18FH011-docket.html", lane: "NTSB", kind: "PUBLIC_DOCKET_INDEX", caseId: "HWY18FH011", docketItems: 59,
    url: "https://data.ntsb.gov/Docket/?NTSBNumber=HWY18FH011", bytes: 60_312,
    sha256: "sha256:9ea691f888b9ee618344be48e6f3822a6c13874bc6e52aedf72a17fa9896c826" },
  { name: "HWY18FH004-docket.html", lane: "NTSB", kind: "PUBLIC_DOCKET_INDEX", caseId: "HWY18FH004", docketItems: 15,
    url: "https://data.ntsb.gov/Docket/?NTSBNumber=HWY18FH004", bytes: 32_091,
    sha256: "sha256:92c8d734ca7e74d80fee2e2e18c686ca2468c299bf5910ab1f504ea187749764" },
  { name: "HWY16FH018-docket.html", lane: "NTSB", kind: "PUBLIC_DOCKET_INDEX", caseId: "HWY16FH018", docketItems: 46,
    url: "https://data.ntsb.gov/Docket/?NTSBNumber=HWY16FH018", bytes: 52_985,
    sha256: "sha256:876704fa496ecf6e748132c08140f8ced5e433390baaa4d983ea6032180948fa" },
  { name: "HWY24FH008-vehicle-automation.pdf", lane: "NTSB", kind: "SELECTED_FACTUAL_REPORT", caseId: "HWY24FH008", docketDocumentId: "18833561", pages: 48,
    url: "https://data.ntsb.gov/Docket/Document/docBLOB?FileExtension=pdf&FileName=014+Philadelphia+%E2%80%93+Vehicle+Automation+Factual+Report-Rel.pdf&ID=18833561",
    bytes: 1_571_598, sha256: "sha256:b75369ec4e193fc6934bc37a43d52c96f0a4ce4269a3e4da4472ee76b662c600" },
  { name: "HWY24FH006-vehicle-automation.pdf", lane: "NTSB", kind: "SELECTED_FACTUAL_REPORT", caseId: "HWY24FH006", docketDocumentId: "18854486", pages: 47,
    url: "https://data.ntsb.gov/Docket/Document/docBLOB?FileExtension=pdf&FileName=%21012+San+Antonio+%E2%80%93+Vehicle+Automation+Factual-Rel.pdf&ID=18854486",
    bytes: 1_402_047, sha256: "sha256:4f03b8b12ba143be2e6b40697f439e525296d6e9b597f92eb4b98500db3200c2" },
  { name: "HWY19FH008-video-study.pdf", lane: "NTSB", kind: "SELECTED_FACTUAL_REPORT", caseId: "HWY19FH008", docketDocumentId: "8949318", pages: 4,
    url: "https://data.ntsb.gov/Docket/Document/docBLOB?FileExtension=pdf&FileName=DelrayBeach_Video_Study_final-Rel.pdf&ID=8949318",
    bytes: 281_677, sha256: "sha256:317c124d77f99955dfdccea1b48976e9facf53738f9b7b226def6343d6e7b56c" },
  { name: "HWY18FH011-automation-data-summary.pdf", lane: "NTSB", kind: "SELECTED_FACTUAL_REPORT", caseId: "HWY18FH011", docketDocumentId: "8913994", pages: 24,
    url: "https://data.ntsb.gov/Docket/Document/docBLOB?FileExtension=pdf&FileName=Automation+and+Data+Summary+Report+Final-Rel.pdf&ID=8913994",
    bytes: 953_230, sha256: "sha256:724c52a4fea4a67a226e754da49ce1bf86c6305f5c18c6abc1e9f8c9969fca10" },
  { name: "HWY18FH004-automation-data-summary.pdf", lane: "NTSB", kind: "SELECTED_FACTUAL_REPORT", caseId: "HWY18FH004", docketDocumentId: "8338964", pages: 8,
    url: "https://data.ntsb.gov/Docket/Document/docBLOB?FileExtension=pdf&FileName=Automation+Data+Summary+Report-Rel.pdf&ID=8338964",
    bytes: 755_088, sha256: "sha256:047c87843a23233ab541d31a4eba58d3d19139a0003badcba517e398a007ddde" },
  { name: "HWY16FH018-driver-assistance.pdf", lane: "NTSB", kind: "SELECTED_FACTUAL_REPORT", caseId: "HWY16FH018", docketDocumentId: "40453275", pages: 23,
    url: "https://data.ntsb.gov/Docket/Document/docBLOB?FileExtension=.PDF&FileName=Human+Performance+Supplemental+Report+-+Driver+Assistance+Systems-Master.PDF&ID=40453275",
    bytes: 696_497, sha256: "sha256:1819f89d0700ed637d73859dd6bb40e2a2fd4430b6ef0e676679d6c76e922001" },

  { name: "table-1-injury-and-illness-rates-by-industry-2024-national.xlsx", lane: "BLS", kind: "SOII_RATES",
    url: `${BLS_SOII_BASE}/table-1-injury-and-illness-rates-by-industry-2024-national.xlsx`, bytes: 78_370,
    sha256: "sha256:589396346b87cb9cda5f9708e97d8ff25f53d8dfed52a21ab1e89690e2bca850" },
  { name: "table-a-1-relative-standard-errors-industry-rates-2024-national.xlsx", lane: "BLS", kind: "SOII_RATE_RSE",
    url: `${BLS_SOII_BASE}/table-a-1-relative-standard-errors-industry-rates-2024-national.xlsx`, bytes: 83_121,
    sha256: "sha256:3729b95b420ca95d83b2222747e9ef0411961478add9501388a2915a66373174" },
  { name: "table-2-injury-and-illness-counts-by-industry-2024-national.xlsx", lane: "BLS", kind: "SOII_COUNTS",
    url: `${BLS_SOII_BASE}/table-2-injury-and-illness-counts-by-industry-2024-national.xlsx`, bytes: 83_807,
    sha256: "sha256:c03293edab94d41923d746abb201e37e5f2dd1d7b9898cd9c7c9d7720214ff60" },
  { name: "table-a-2-relative-standard-errors-industry-counts-2024-national.xlsx", lane: "BLS", kind: "SOII_COUNT_RSE",
    url: `${BLS_SOII_BASE}/table-a-2-relative-standard-errors-industry-counts-2024-national.xlsx`, bytes: 87_593,
    sha256: "sha256:a3696b1fdefed2052d7444129fc5c37a3dbe140af3552be60b6fc16ef26da196" },
  { name: "table-3-number-of-hours-worked-by-industry-2024-national.xlsx", lane: "BLS", kind: "SOII_HOURS_AND_RSE",
    url: `${BLS_SOII_BASE}/table-3-number-of-hours-worked-by-industry-2024-national.xlsx`, bytes: 63_247,
    sha256: "sha256:58854b809c98516dc55482a6facd0befce88487c937899454bd8a79c9293e3e2" },
  { name: "fatal-occupational-injuries-table-a-1-2024.xlsx", lane: "BLS", kind: "CFOI_INDUSTRY_EVENT_COUNTS",
    url: `${BLS_CFOI_BASE}/fatal-occupational-injuries-table-a-1-2024.xlsx`, bytes: 56_318,
    sha256: "sha256:d8ced0e02cfee38879cc0e60951332fd5952503b67a87e2b9cac4cb8a694efa1" },
  { name: "fatal-occupational-injuries-table-a-5-2024.xlsx", lane: "BLS", kind: "CFOI_OCCUPATION_EVENT_COUNTS",
    url: `${BLS_CFOI_BASE}/fatal-occupational-injuries-table-a-5-2024.xlsx`, bytes: 34_730,
    sha256: "sha256:a739d000626db48e7c15e710d1c44c5150616ab79f21062f9ce5e27e06e566b1" },
  { name: "fatal-occupational-injuries-table-a-7-2024.xlsx", lane: "BLS", kind: "CFOI_WORKER_EVENT_COUNTS",
    url: `${BLS_CFOI_BASE}/fatal-occupational-injuries-table-a-7-2024.xlsx`, bytes: 12_030,
    sha256: "sha256:1858926e033c878e7891c402c76dd01d9bc13e84d569af658ef6b54cfe5821cf" },
  { name: "fatal-occupational-injuries-table-a-9-2024.xlsx", lane: "BLS", kind: "CFOI_EVENT_INDUSTRY_COUNTS",
    url: `${BLS_CFOI_BASE}/fatal-occupational-injuries-table-a-9-2024.xlsx`, bytes: 25_764,
    sha256: "sha256:8a1db53974d81ec1023ba554eb56681db062fa63a45c22545e0e65a1b96031dc" },
  { name: "fatal-occupational-injuries-hours-based-rates-2024.xlsx", lane: "BLS", kind: "CFOI_HOURS_RATES_MOE",
    url: `${BLS_CFOI_BASE}/fatal-occupational-injuries-hours-based-rates-2024.xlsx`, bytes: 26_466,
    sha256: "sha256:3722c991b2be42e4e85de2d5b3837839c256a0850408cd09e8e7d1fa9b743286" },
  { name: "oiics-manual-version-3-03.xlsx", lane: "BLS", kind: "OIICS_3_03_MANUAL",
    url: "https://www.bls.gov/iif/definitions/oiics-manual-version-3-03.xlsx", bytes: 538_518,
    sha256: "sha256:4f66e19cb45c3e5fee841ea3846d4e44975c6258adcb1344ed0abf29eefbc6d4" },
  { name: "soii-summary-historical-rendered.html", lane: "BLS", kind: "BROWSER_RENDERED_DOM_SNAPSHOT",
    url: `${BLS_SOII_BASE}/soii-summary-historical.htm`, bytes: 200_011,
    sha256: "sha256:e677b9012a3911fafb6406679324d2d77fd0f27fb4158e06018a9060f9314c5e" },
  { name: "cfoi-tables-rendered.html", lane: "BLS", kind: "BROWSER_RENDERED_DOM_SNAPSHOT",
    url: "https://www.bls.gov/iif/fatal-injuries-tables.htm", bytes: 82_353,
    sha256: "sha256:af41e25f862f9c58a7f3da576efa119c1860f154565aded914c9cd4aa17732b5" },
  { name: "oiics-manual-page-rendered.html", lane: "BLS", kind: "BROWSER_RENDERED_DOM_SNAPSHOT",
    url: "https://www.bls.gov/iif/definitions/occupational-injuries-and-illnesses-classification-manual.htm", bytes: 91_297,
    sha256: "sha256:b4671612b7d1d5cd7b0ce35690d3b5ec883058d48908e6da72da4946e23b7a39" },
];

export const NTSB_BLS_FROZEN_SOURCE_20260821 = Object.freeze({
  sourceId: "NTSB_COMPLETED_PARTIAL_AUTOMATION_AND_BLS_IIF_2024_20260821",
  frozenAt: FROZEN_AT,
  files: Object.freeze(SOURCE_FILES.map((file) => Object.freeze({ ...file,
    ...(file.caseIds ? { caseIds: Object.freeze([...file.caseIds]) } : {}),
  }))),
});

const EXPECTED_NAMES = Object.freeze(SOURCE_FILES.map((file) => file.name));
const SOURCE_FILE_BY_NAME = new Map(SOURCE_FILES.map((file) => [file.name, file]));
const NTSB_CASES = Object.freeze([
  Object.freeze({ caseId: "HWY24FH008", eventDate: "2024-03-03", location: "Philadelphia, PA", reportId: "HIR2602",
    finalReport: "HIR2602.pdf", factualReport: "HWY24FH008-vehicle-automation.pdf", factualDocumentId: "18833561", otherCaseId: "HWY24FH006" }),
  Object.freeze({ caseId: "HWY24FH006", eventDate: "2024-02-24", location: "San Antonio, TX", reportId: "HIR2602",
    finalReport: "HIR2602.pdf", factualReport: "HWY24FH006-vehicle-automation.pdf", factualDocumentId: "18854486", otherCaseId: "HWY24FH008" }),
  Object.freeze({ caseId: "HWY19FH008", eventDate: "2019-03-01", location: "Delray Beach, FL", reportId: "HAB2001",
    finalReport: "HAB2001.pdf", factualReport: "HWY19FH008-video-study.pdf", factualDocumentId: "8949318" }),
  Object.freeze({ caseId: "HWY18FH011", eventDate: "2018-03-23", location: "Mountain View, CA", reportId: "HAR2001",
    finalReport: "HAR2001.pdf", factualReport: "HWY18FH011-automation-data-summary.pdf", factualDocumentId: "8913994" }),
  Object.freeze({ caseId: "HWY18FH004", eventDate: "2018-01-22", location: "Culver City, CA", reportId: "HAB1907",
    finalReport: "HAB1907.pdf", factualReport: "HWY18FH004-automation-data-summary.pdf", factualDocumentId: "8338964" }),
  Object.freeze({ caseId: "HWY16FH018", eventDate: "2016-05-07", location: "Williston, FL", reportId: "HAR1702",
    finalReport: "HAR1702.pdf", factualReport: "HWY16FH018-driver-assistance.pdf", factualDocumentId: "40453275" }),
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function digest(value) { return sha256(canonicalizeStrict(value)); }
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

function xmlDecode(value) {
  return String(value).replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos|#58|#160);/giu,
    (match, numeric, named) => {
      if (numeric) {
        const code = numeric[0].toLowerCase() === "x"
          ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10);
        return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return ({ amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", "#58": ":", "#160": " " })[named] ?? match;
    });
}
function htmlText(value) {
  return xmlDecode(String(value).replace(/<script\b[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " "))
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/gu, "").replace(/\s+/gu, " ").trim();
}

function officialProfile(files) {
  return SOURCE_FILES.every((expected) => {
    const bytes = files[expected.name];
    return Buffer.isBuffer(bytes) && bytes.length === expected.bytes && sha256(bytes) === expected.sha256;
  });
}

function expectedManifestProjection() {
  return {
    schema: "outsider/ntsb-bls-source-acquisition/v1",
    sourceId: NTSB_BLS_FROZEN_SOURCE_20260821.sourceId,
    frozenAt: FROZEN_AT,
    sourceCount: SOURCE_FILES.length,
    sourceBytes: SOURCE_FILES.reduce((sum, file) => sum + file.bytes, 0),
    transportAttested: false,
    browserRenderedDomSnapshotsAreOriginalResponseBytes: false,
    files: SOURCE_FILES.map((file) => ({
      name: file.name, lane: file.lane, kind: file.kind, url: file.url,
      bytes: file.bytes, sha256: file.sha256,
      captureRepresentation: file.kind === "BROWSER_RENDERED_DOM_SNAPSHOT"
        ? "BROWSER_RENDERED_DOCUMENT_OUTER_HTML" : "EXACT_PUBLISHER_FILE_BYTES",
    })),
  };
}

function validateManifest(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length <= 0 || bytes.length > 256 * 1024) {
    throw new Error("NTSB_BLS_ACQUISITION_MANIFEST_BYTES_INVALID");
  }
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8")); } catch {
    throw new Error("NTSB_BLS_ACQUISITION_MANIFEST_JSON_INVALID");
  }
  const expected = expectedManifestProjection();
  if (canonicalizeStrict(manifest) !== canonicalizeStrict(expected)) {
    throw new Error("NTSB_BLS_ACQUISITION_MANIFEST_PROFILE_MISMATCH");
  }
  return { manifest, sha256: sha256(bytes) };
}

function stableReadOne(directory, name, maximum) {
  const target = path.join(directory, name);
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
    || pathBefore.size <= 0n || pathBefore.size > BigInt(maximum)) {
    throw new Error(`NTSB_BLS_SOURCE_FILE_UNSAFE:${name}`);
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(target, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) {
        throw new Error(`NTSB_BLS_SOURCE_FILE_CHANGED_DURING_READ:${name}`);
      }
    }
    if (BigInt(bytes.length) !== before.size) throw new Error(`NTSB_BLS_SOURCE_FILE_SHORT_READ:${name}`);
    return { bytes, target };
  } finally { closeSync(fd); }
}

function stableReadSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || !sourceDirectory.trim()) {
    throw new Error("NTSB_BLS_SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) throw new Error("NTSB_BLS_SOURCE_DIRECTORY_TOO_BROAD");
  const rootStat = lstatSync(directory, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("NTSB_BLS_SOURCE_DIRECTORY_UNSAFE");
  }
  const expectedNames = [...EXPECTED_NAMES, ACQUISITION_NAME].sort();
  const actualNames = readdirSync(directory).sort();
  if (canonicalizeStrict(actualNames) !== canonicalizeStrict(expectedNames)) {
    throw new Error("NTSB_BLS_SOURCE_DIRECTORY_PROFILE_MISMATCH");
  }
  const files = {};
  const paths = {};
  for (const expected of SOURCE_FILES) {
    const read = stableReadOne(directory, expected.name, MAX_SOURCE_FILE_BYTES);
    if (read.bytes.length !== expected.bytes || sha256(read.bytes) !== expected.sha256) {
      throw new Error(`NTSB_BLS_SOURCE_PIN_MISMATCH:${expected.name}`);
    }
    files[expected.name] = read.bytes;
    paths[expected.name] = read.target;
  }
  const manifestRead = stableReadOne(directory, ACQUISITION_NAME, 256 * 1024);
  const manifest = validateManifest(manifestRead.bytes);
  return { files, paths, manifestHash: manifest.sha256 };
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
  throw new Error("NTSB_BLS_XLSX_END_NOT_FOUND");
}

function unzipEntries(bytes, sourceName) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`NTSB_BLS_XLSX_BYTES_INVALID:${sourceName}`);
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
    || centralOffset + centralSize > end) {
    throw new Error(`NTSB_BLS_XLSX_CENTRAL_PROFILE_INVALID:${sourceName}`);
  }
  const entries = new Map();
  let central = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (central + 46 > end || bytes.readUInt32LE(central) !== 0x02014b50) {
      throw new Error(`NTSB_BLS_XLSX_CENTRAL_ENTRY_INVALID:${sourceName}`);
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
      || compressedSize > MAX_SOURCE_FILE_BYTES || uncompressedSize > MAX_ZIP_ENTRY_BYTES
      || localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`NTSB_BLS_XLSX_ENTRY_UNSUPPORTED:${sourceName}`);
    }
    const name = bytes.subarray(central + 46, central + 46 + nameLength).toString("utf8");
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")
      || /[\u0000-\u001f\u007f]/u.test(name) || entries.has(name)) {
      throw new Error(`NTSB_BLS_XLSX_ENTRY_NAME_INVALID:${sourceName}`);
    }
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (localName !== name || dataOffset + compressedSize > centralOffset) {
      throw new Error(`NTSB_BLS_XLSX_LOCAL_BINDING_INVALID:${sourceName}`);
    }
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let output;
    try {
      output = method === 0 ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: Math.max(1, uncompressedSize) });
    } catch {
      throw new Error(`NTSB_BLS_XLSX_INFLATE_INVALID:${sourceName}:${name}`);
    }
    if (output.length !== uncompressedSize || crc32(output) !== expectedCrc) {
      throw new Error(`NTSB_BLS_XLSX_ENTRY_INTEGRITY_INVALID:${sourceName}:${name}`);
    }
    totalUncompressed += output.length;
    if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) throw new Error(`NTSB_BLS_XLSX_TOTAL_TOO_LARGE:${sourceName}`);
    entries.set(name, output);
    central = next;
  }
  if (central !== centralOffset + centralSize) throw new Error(`NTSB_BLS_XLSX_CENTRAL_LENGTH_INVALID:${sourceName}`);
  return entries;
}

function requireZipEntry(entries, name, sourceName) {
  const bytes = entries.get(name);
  if (!bytes) throw new Error(`NTSB_BLS_XLSX_REQUIRED_ENTRY_MISSING:${sourceName}:${name}`);
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
  if (values.length === 0) throw new Error(`NTSB_BLS_XLSX_SHARED_STRINGS_INVALID:${sourceName}`);
  return values;
}

function cellColumn(reference) {
  const match = String(reference).match(/^([A-Z]{1,3})[1-9]\d*$/u);
  if (!match) throw new Error("NTSB_BLS_XLSX_CELL_REFERENCE_INVALID");
  let value = 0;
  for (const character of match[1]) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function parseWorksheet(xml, sharedStrings, sourceName, sheetName) {
  const dimension = xml.match(/<dimension\b[^>]*\bref="([A-Z0-9:]+)"/u)?.[1] ?? null;
  if (!dimension) throw new Error(`NTSB_BLS_XLSX_DIMENSION_MISSING:${sourceName}:${sheetName}`);
  const rows = [];
  const rowNumbers = new Set();
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gu)) {
    const rowNumber = Number(attribute(rowMatch[1], "r"));
    if (!Number.isSafeInteger(rowNumber) || rowNumber <= 0 || rowNumbers.has(rowNumber)) {
      throw new Error(`NTSB_BLS_XLSX_ROW_INVALID:${sourceName}:${sheetName}`);
    }
    rowNumbers.add(rowNumber);
    const cells = [];
    const columns = new Set();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
      const reference = attribute(cellMatch[1], "r");
      const column = cellColumn(reference);
      if (columns.has(column)) throw new Error(`NTSB_BLS_XLSX_DUPLICATE_CELL:${sourceName}:${reference}`);
      columns.add(column);
      const type = attribute(cellMatch[1], "t");
      const body = cellMatch[2] ?? "";
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1] ?? null;
      let value = raw === null ? "" : xmlDecode(raw);
      if (type === "s" && value !== "") {
        const index = Number(value);
        if (!Number.isSafeInteger(index) || index < 0 || index >= sharedStrings.length) {
          throw new Error(`NTSB_BLS_XLSX_SHARED_STRING_INDEX_INVALID:${sourceName}:${reference}`);
        }
        value = sharedStrings[index];
      } else if (type === "inlineStr") {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
          .map((part) => xmlDecode(part[1])).join("");
      }
      cells[column] = value;
    }
    // XLSX omits physically empty cells.  Preserve that meaning as explicit
    // empty strings before the worksheet enters a canonical commitment; sparse
    // JavaScript arrays are representation-dependent and are rejected by the
    // strict canonicalizer.
    const denseCells = [];
    for (let column = 0; column < cells.length; column += 1) {
      denseCells.push(Object.hasOwn(cells, column) ? cells[column] : "");
    }
    rows.push({ rowNumber, cells: denseCells });
  }
  if (rows.length === 0) throw new Error(`NTSB_BLS_XLSX_ROWS_MISSING:${sourceName}:${sheetName}`);
  return { dimension, rows };
}

function parseWorkbook(bytes, sourceName) {
  const entries = unzipEntries(bytes, sourceName);
  const workbookXml = requireZipEntry(entries, "xl/workbook.xml", sourceName);
  const relationshipsXml = requireZipEntry(entries, "xl/_rels/workbook.xml.rels", sourceName);
  const sharedStrings = parseSharedStrings(requireZipEntry(entries, "xl/sharedStrings.xml", sourceName), sourceName);
  const targets = new Map();
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*?)\/>/gu)) {
    const id = attribute(match[1], "Id");
    const target = attribute(match[1], "Target");
    if (id && target) targets.set(id, target.replace(/^\/?xl\//u, ""));
  }
  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/>/gu)) {
    const name = attribute(match[1], "name");
    const relationshipId = attribute(match[1], "r:id");
    const target = targets.get(relationshipId);
    if (!name || !target || target.includes("..")) throw new Error(`NTSB_BLS_XLSX_SHEET_BINDING_INVALID:${sourceName}`);
    const entry = target.startsWith("xl/") ? target : `xl/${target}`;
    sheets.push({ name, ...parseWorksheet(requireZipEntry(entries, entry, sourceName), sharedStrings, sourceName, name) });
  }
  if (sheets.length === 0) throw new Error(`NTSB_BLS_XLSX_WORKBOOK_SHEETS_MISSING:${sourceName}`);
  return { sheets, sharedStrings };
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
      if (stat.isFile()) {
        accessSync(candidate, fsConstants.X_OK);
        return candidate;
      }
    } catch { /* continue */ }
  }
  throw new Error(`NTSB_BLS_REQUIRED_PDF_PARSER_MISSING:${name}`);
}

function pdfByteStructure(bytes, sourceName) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 128 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`NTSB_BLS_PDF_MAGIC_INVALID:${sourceName}`);
  }
  const tail = bytes.subarray(Math.max(0, bytes.length - 8_192)).toString("latin1");
  const matches = [...tail.matchAll(/startxref\s+(\d+)\s+%%EOF/gu)];
  if (matches.length === 0) throw new Error(`NTSB_BLS_PDF_FINAL_EOF_INVALID:${sourceName}`);
  const last = matches.at(-1);
  if (tail.slice((last.index ?? 0) + last[0].length).trim() !== "") {
    throw new Error(`NTSB_BLS_PDF_TRAILING_BYTES_INVALID:${sourceName}`);
  }
  const startXref = Number(last[1]);
  if (!Number.isSafeInteger(startXref) || startXref <= 0 || startXref >= bytes.length) {
    throw new Error(`NTSB_BLS_PDF_STARTXREF_INVALID:${sourceName}`);
  }
  const target = bytes.subarray(startXref, Math.min(bytes.length, startXref + 80)).toString("latin1");
  if (!/^xref\b/u.test(target) && !/^\d+\s+\d+\s+obj\b/u.test(target)) {
    throw new Error(`NTSB_BLS_PDF_XREF_TARGET_INVALID:${sourceName}`);
  }
  return { startXref, eofAtPhysicalTail: true, structuralEnvelopeValidated: true };
}

function parsePdfFully(bytes, expected) {
  const structural = pdfByteStructure(bytes, expected.name);
  const pdfinfo = findExecutable("pdfinfo");
  const pdftotext = findExecutable("pdftotext");
  const infoRun = spawnSync(pdfinfo, ["-"], {
    input: bytes, encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
  });
  if (infoRun.error || infoRun.status !== 0 || infoRun.signal || !infoRun.stdout) {
    throw new Error(`NTSB_BLS_PDFINFO_FAILED:${expected.name}`);
  }
  const pages = Number(infoRun.stdout.match(/^Pages:\s+(\d+)\s*$/mu)?.[1]);
  const version = infoRun.stdout.match(/^PDF version:\s+(.+)$/mu)?.[1]?.trim() ?? null;
  const title = infoRun.stdout.match(/^Title:\s+(.+)$/mu)?.[1]?.trim() ?? "";
  if (pages !== expected.pages || !version
    || (expected.kind === "ADOPTED_FINAL_REPORT" && title.length < 8)) {
    throw new Error(`NTSB_BLS_PDFINFO_SEMANTICS_INVALID:${expected.name}`);
  }
  const textRun = spawnSync(pdftotext, ["-layout", "-", "-"], {
    input: bytes, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (textRun.error || textRun.status !== 0 || textRun.signal || typeof textRun.stdout !== "string") {
    throw new Error(`NTSB_BLS_PDFTEXT_FAILED:${expected.name}`);
  }
  const normalizedText = textRun.stdout.replace(/\s+/gu, " ").trim();
  const formFeeds = (textRun.stdout.match(/\f/gu) ?? []).length;
  if (normalizedText.length < expected.pages * 80 || formFeeds < expected.pages - 1) {
    throw new Error(`NTSB_BLS_PDFTEXT_INCOMPLETE:${expected.name}`);
  }
  return {
    ...structural, pageCount: pages, pdfVersion: version,
    titleHash: title ? sha256(Buffer.from(title)) : null, fullDocumentTextParsed: true,
    fullDocumentTextNonWhitespaceCharacters: normalizedText.replace(/\s/gu, "").length,
    pageBreaksObserved: formFeeds,
    _info: infoRun.stdout.replace(/\s+/gu, " "), _text: normalizedText,
  };
}

function extractSection(html, startMarker, endMarker, code) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`NTSB_BLS_HTML_SECTION_INVALID:${code}`);
  return html.slice(start, end);
}

function parseDocket(html, descriptor, expectedFile) {
  const declared = Number(html.match(/Docket Items:\s*(\d+)/u)?.[1]);
  const ids = [...html.matchAll(/Document\/docBLOB\?[^"']*\bID=(\d+)|Document\/docBLOB\?ID=(\d+)/gu)]
    .map((match) => match[1] ?? match[2]);
  const uniqueIds = [...new Set(ids)];
  if (!html.includes(descriptor.caseId)
    || declared !== expectedFile.docketItems || ids.length !== declared || uniqueIds.length !== declared
    || !uniqueIds.includes(descriptor.factualDocumentId)) {
    throw new Error(`NTSB_BLS_DOCKET_BINDING_INVALID:${descriptor.caseId}`);
  }
  const normalizedDocket = html.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (!normalizedDocket.includes(descriptor.reportId)) {
    throw new Error(`NTSB_BLS_DOCKET_FINAL_REPORT_MISSING:${descriptor.caseId}`);
  }
  return { declaredDocumentCount: declared, uniqueDocumentLinks: uniqueIds.length,
    completeDocumentBytesCaptured: false, exactIndexSnapshotOnly: true,
    selectedFactualDocumentId: descriptor.factualDocumentId,
    documentIdSetHash: digest(uniqueIds.slice().sort((a, b) => Number(a) - Number(b))),
  };
}

function parseNtsb(files) {
  const index = files["partial-automation-index.html"].toString("utf8");
  if (!index.includes("completed and ongoing investigations")
    || !index.includes("state the probable cause")
    || NTSB_CASES.some((descriptor) => !index.includes(descriptor.caseId))) {
    throw new Error("NTSB_BLS_NTSB_INDEX_SEMANTICS_INVALID");
  }
  const pdfDiagnostics = new Map();
  for (const expected of SOURCE_FILES.filter((file) => file.lane === "NTSB" && file.name.endsWith(".pdf"))) {
    pdfDiagnostics.set(expected.name, parsePdfFully(files[expected.name], expected));
  }
  const hir = pdfDiagnostics.get("HIR2602.pdf");
  if (!hir._info.includes("San Antonio") || !hir._info.includes("Philadelphia")
    || !hir._info.includes("HWY24FH006") || !hir._info.includes("HWY24FH008")
    || !hir._text.includes("HWY24FH006 and HWYFH008")
    || !hir._text.includes("does not assign fault or blame")
    || !hir._text.includes("49 United States Code section 1154(b)")) {
    throw new Error("NTSB_BLS_HIR2602_MULTIROOT_OR_LEGAL_BOUNDARY_INVALID");
  }
  const cases = [];
  let docketDocumentLinks = 0;
  for (const descriptor of NTSB_CASES) {
    const page = files[`${descriptor.caseId}.html`].toString("utf8");
    const docketExpected = SOURCE_FILE_BY_NAME.get(`${descriptor.caseId}-docket.html`);
    const docket = files[docketExpected.name].toString("utf8");
    const [year, month, day] = descriptor.eventDate.split("-").map(Number);
    const publisherDate = `<p>${month}/${day}/${year}</p>`;
    if (!page.includes(`<p>${descriptor.caseId}</p>`) || !page.includes("<b>Status:</b> Completed")
      || !page.includes(descriptor.location) || !page.includes(publisherDate)) {
      throw new Error(`NTSB_BLS_CASE_PAGE_IDENTITY_INVALID:${descriptor.caseId}`);
    }
    const titleSection = extractSection(page, "<!-- ! Page Title -->", "<!-- <h3>What Happened", `${descriptor.caseId}:title`);
    const title = htmlText(titleSection.match(/<h1>([\s\S]*?)<\/h1>/u)?.[1] ?? "");
    const foundSection = extractSection(page, "RichHtmlField7__ControlWrapper_RichHtmlField", "<!-- <h3>What We Recommended", `${descriptor.caseId}:found`);
    const foundText = htmlText(foundSection);
    if (title.length < 20 || !/probable cause/iu.test(foundText)) {
      throw new Error(`NTSB_BLS_CASE_FINDING_INVALID:${descriptor.caseId}`);
    }
    if (!page.includes(`/Reports/${descriptor.finalReport}`)) {
      throw new Error(`NTSB_BLS_CASE_REPORT_HREF_INVALID:${descriptor.caseId}`);
    }
    if (descriptor.otherCaseId && !page.includes(descriptor.otherCaseId)) {
      throw new Error(`NTSB_BLS_CASE_CROSSROOT_INVALID:${descriptor.caseId}`);
    }
    const docketProjection = parseDocket(docket, descriptor, docketExpected);
    docketDocumentLinks += docketProjection.declaredDocumentCount;
    const reportPdf = pdfDiagnostics.get(descriptor.finalReport);
    const factualPdf = pdfDiagnostics.get(descriptor.factualReport);
    cases.push({
      caseId: descriptor.caseId, eventDate: descriptor.eventDate, location: descriptor.location,
      investigationStatus: "COMPLETED", realCaseRecorded: true,
      pageTitleHash: sha256(Buffer.from(title)), probableCauseAndFindingTextHash: sha256(Buffer.from(foundText)),
      probableCauseAndFindingTextCharacters: foundText.length,
      finalReport: { reportId: descriptor.reportId, file: descriptor.finalReport,
        sourceSha256: SOURCE_FILE_BY_NAME.get(descriptor.finalReport).sha256,
        pageCount: reportPdf.pageCount, adoptedFinalReport: true },
      selectedFactualReport: { file: descriptor.factualReport,
        sourceSha256: SOURCE_FILE_BY_NAME.get(descriptor.factualReport).sha256,
        pageCount: factualPdf.pageCount, docketDocumentId: descriptor.factualDocumentId,
        isCompleteDocket: false },
      docket: docketProjection,
    });
  }
  return {
    laneId: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    realityStatus: "REAL_COMPLETED_INVESTIGATED_CASES",
    selection: { completedCasesAtFrozenIndex: 6, selectedCases: 6,
      isStatisticalPopulation: false, isRepresentativeSample: false,
      ongoingCasesIncluded: 0, caseIds: NTSB_CASES.map((entry) => entry.caseId) },
    sourceAccounting: { indexPages: 1, investigationPages: 6, finalReportFiles: 5,
      finalReportCaseCoverage: 6, selectedFactualReportFiles: 6, docketIndexPages: 6,
      docketDocumentLinks, completeDocketDocumentBytesCaptured: false,
      allElevenPdfsByteCompleteAndFullyParsed: true },
    multiRootBinding: { reportId: "HIR2602", caseIds: ["HWY24FH006", "HWY24FH008"],
      bindingRoots: ["OFFICIAL_INDEX", "TWO_CASE_PAGES", "TWO_DOCKET_INDEXES", "PDF_TITLE_AND_KEYWORDS"],
      officialDefectsQuarantined: [
        { source: "HWY24FH008_CASE_PAGE_VISIBLE_LABEL", observed: "Final Report HWY2602",
          correctedByCrossRootBindingTo: "HIR2602", labelUsedAsIdentifier: false },
        { source: "HIR2602_PAGE_128_CAROL_INSTRUCTION", observed: "HWY24FH006 and HWYFH008",
          correctedByCrossRootBindingTo: "HWY24FH006 and HWY24FH008", footerUsedAsSoleIdentifierRoot: false },
      ] },
    cases,
    findingBoundary: { probableCauseAndFindingsAreFinalNtsbSafetyInvestigationFindings: true,
      assignsFaultOrBlame: false, determinesRightsOrLiabilities: false,
      civilDamagesEvidenceUseRestrictedBy49USC1154b: true,
      recommendationsAreSafetyRecommendationsNotSettlementOrders: true,
      laterRecommendationStatusAndPostFreezeRevisionObserved: false },
    revisionBoundary: { snapshotFrozenAt: FROZEN_AT, finalReportsAdoptedAtSnapshot: true,
      laterCorrectionsOrSupersessionNotAutomaticallyObserved: true,
      liveRecommendationStatusNotCaptured: true,
      revalidationAgainstPublisherRequiredForPostFreezeUse: true },
    inferenceBoundary: { causalGeneralizationBeyondInvestigatedCases: false,
      frequencyOrSeverityRateCalculated: false, economicLossObserved: false,
      targetDomainTransferPermitted: false, sixCaseSelectionPoolableWithBlsPopulationEstimates: false },
  };
}

function rowValue(row, column) { return row?.cells?.[column] ?? ""; }
function normalizedLabel(value) {
  return String(value ?? "").replace(/[\u200b-\u200f\ufeff]/gu, "")
    .replace(/\(\d+\)/gu, "").replace(/\s+/gu, " ").trim()
    .replace(/\d+(?:,\d+)*$/u, "").trim();
}
function numberFromCell(value, code) {
  const normalized = String(value ?? "").replace(/,/gu, "").trim();
  const number = Number(normalized);
  if (!normalized || !Number.isFinite(number)) throw new Error(`NTSB_BLS_NUMERIC_CELL_INVALID:${code}`);
  return number;
}
function suppressionCounts(sheet) {
  let enDash = 0;
  let doubleHyphen = 0;
  let singleHyphen = 0;
  for (const row of sheet.rows) {
    for (const value of row.cells) {
      if (String(value).trim() === "–") enDash += 1;
      if (String(value).trim() === "--") doubleHyphen += 1;
      if (String(value).trim() === "-") singleHyphen += 1;
    }
  }
  return { enDash, doubleHyphen, singleHyphen, total: enDash + doubleHyphen + singleHyphen,
    symbolsCoercedToZero: false, blankCellsCoercedToZero: false };
}
function firstFootnoteRow(sheet) {
  return sheet.rows.find((row) => /^(Footnotes:|\(?1\)?\s+CFOI|\(?1\)?\s+Workers under)/iu
    .test(String(rowValue(row, 0)).trim()))?.rowNumber ?? Number.POSITIVE_INFINITY;
}
function dataRows(sheet, firstRow, valueStart, valueEnd) {
  const footnote = firstFootnoteRow(sheet);
  return sheet.rows.filter((row) => row.rowNumber >= firstRow && row.rowNumber < footnote
    && normalizedLabel(rowValue(row, 0)) !== ""
    && Array.from({ length: valueEnd - valueStart + 1 }, (_unused, index) => rowValue(row, valueStart + index))
      .some((value) => String(value).trim() !== ""));
}
function rowKey(row) {
  return [normalizedLabel(rowValue(row, 0)).toLowerCase(),
    String(rowValue(row, 1)).replace(/\s+/gu, " ").trim().toLowerCase()];
}
function findRow(sheet, label, code) {
  const match = sheet.rows.find((row) => normalizedLabel(rowValue(row, 0)).toLowerCase() === label.toLowerCase());
  if (!match) throw new Error(`NTSB_BLS_BLS_ROW_MISSING:${code}`);
  return match;
}
function displayOneDecimal(value) { return Number(numberFromCell(value, "one-decimal").toFixed(1)); }

const SOII_SPECS = Object.freeze([
  Object.freeze({ name: "table-1-injury-and-illness-rates-by-industry-2024-national.xlsx", id: "TABLE_1_RATES",
    dimension: "A1:G1090", dataRows: 1070, firstRow: 6, valueStart: 2, valueEnd: 6, suppressionEnDash: 228 }),
  Object.freeze({ name: "table-a-1-relative-standard-errors-industry-rates-2024-national.xlsx", id: "TABLE_A1_RATE_RSE",
    dimension: "A1:G1090", dataRows: 1070, firstRow: 6, valueStart: 2, valueEnd: 6, suppressionEnDash: 170 }),
  Object.freeze({ name: "table-2-injury-and-illness-counts-by-industry-2024-national.xlsx", id: "TABLE_2_COUNTS",
    dimension: "A1:G1089", dataRows: 1070, firstRow: 6, valueStart: 2, valueEnd: 6, suppressionEnDash: 228 }),
  Object.freeze({ name: "table-a-2-relative-standard-errors-industry-counts-2024-national.xlsx", id: "TABLE_A2_COUNT_RSE",
    dimension: "A1:G1090", dataRows: 1070, firstRow: 6, valueStart: 2, valueEnd: 6, suppressionEnDash: 170 }),
  Object.freeze({ name: "table-3-number-of-hours-worked-by-industry-2024-national.xlsx", id: "TABLE_3_HOURS_RSE",
    dimension: "A1:D1077", dataRows: 1062, firstRow: 5, valueStart: 2, valueEnd: 3,
    suppressionEnDash: 0, suppressionSingleHyphen: 14 }),
]);

function parseSoii(files) {
  const parsed = new Map();
  const tables = [];
  for (const spec of SOII_SPECS) {
    const workbook = parseWorkbook(files[spec.name], spec.name);
    if (workbook.sheets.length !== 1 || workbook.sheets[0].name !== "2024") {
      throw new Error(`NTSB_BLS_SOII_SHEET_PROFILE_INVALID:${spec.id}`);
    }
    const sheet = workbook.sheets[0];
    const rows = dataRows(sheet, spec.firstRow, spec.valueStart, spec.valueEnd);
    const suppressions = suppressionCounts(sheet);
    if (sheet.dimension !== spec.dimension || rows.length !== spec.dataRows
      || suppressions.enDash !== spec.suppressionEnDash || suppressions.doubleHyphen !== 0
      || suppressions.singleHyphen !== (spec.suppressionSingleHyphen ?? 0)) {
      throw new Error(`NTSB_BLS_SOII_TABLE_PROFILE_INVALID:${spec.id}:${sheet.dimension}:${rows.length}:${suppressions.enDash}:${suppressions.doubleHyphen}`);
    }
    const keys = rows.map(rowKey);
    const serialized = keys.map((key) => canonicalizeStrict(key));
    tables.push({ tableId: spec.id, file: spec.name, dimension: sheet.dimension,
      dataRowCount: rows.length, rowSequenceHash: digest(keys), uniqueNormalizedRowKeys: new Set(serialized).size,
      repeatedNormalizedRowKeysPreserved: rows.length - new Set(serialized).size,
      suppression: suppressions });
    parsed.set(spec.id, { sheet, rows, keys });
  }
  const baseSequence = canonicalizeStrict(parsed.get("TABLE_1_RATES").keys);
  for (const id of ["TABLE_A1_RATE_RSE", "TABLE_2_COUNTS", "TABLE_A2_COUNT_RSE"]) {
    if (canonicalizeStrict(parsed.get(id).keys) !== baseSequence) {
      throw new Error(`NTSB_BLS_SOII_CORRELATED_ROW_SEQUENCE_INVALID:${id}`);
    }
  }
  const mainUnique = new Set(parsed.get("TABLE_1_RATES").keys.map((key) => canonicalizeStrict(key)));
  const hoursUnique = new Set(parsed.get("TABLE_3_HOURS_RSE").keys.map((key) => canonicalizeStrict(key)));
  const overlap = [...hoursUnique].filter((key) => mainUnique.has(key)).length;
  if (mainUnique.size !== 1047 || hoursUnique.size !== 1034 || overlap !== 1026) {
    throw new Error("NTSB_BLS_SOII_HOURS_JOIN_SCOPE_INVALID");
  }
  const rates = findRow(parsed.get("TABLE_1_RATES").sheet, "Private industry", "SOII_PRIVATE_RATES");
  const counts = findRow(parsed.get("TABLE_2_COUNTS").sheet, "Private industry", "SOII_PRIVATE_COUNTS");
  const rateRse = findRow(parsed.get("TABLE_A1_RATE_RSE").sheet, "Private industry", "SOII_PRIVATE_RATE_RSE");
  const countRse = findRow(parsed.get("TABLE_A2_COUNT_RSE").sheet, "Private industry", "SOII_PRIVATE_COUNT_RSE");
  const hours = findRow(parsed.get("TABLE_3_HOURS_RSE").sheet, "Private industry", "SOII_PRIVATE_HOURS");
  const privatePublished = {
    totalRecordableRatePer100Fte: displayOneDecimal(rowValue(rates, 2)),
    dartRatePer100Fte: displayOneDecimal(rowValue(rates, 3)),
    daysAwayRatePer100Fte: displayOneDecimal(rowValue(rates, 4)),
    transferRestrictionRatePer100Fte: displayOneDecimal(rowValue(rates, 5)),
    otherRecordableRatePer100Fte: displayOneDecimal(rowValue(rates, 6)),
    totalRecordableCasesThousands: displayOneDecimal(rowValue(counts, 2)),
    dartCasesThousands: displayOneDecimal(rowValue(counts, 3)),
    daysAwayCasesThousands: displayOneDecimal(rowValue(counts, 4)),
    transferRestrictionCasesThousands: displayOneDecimal(rowValue(counts, 5)),
    otherRecordableCasesThousands: displayOneDecimal(rowValue(counts, 6)),
    totalRecordableRateRsePercent: displayOneDecimal(rowValue(rateRse, 2)),
    totalRecordableCountRsePercent: displayOneDecimal(rowValue(countRse, 2)),
    employeeHoursThousands: numberFromCell(rowValue(hours, 2), "SOII_PRIVATE_HOURS"),
    employeeHoursRsePercent: displayOneDecimal(rowValue(hours, 3)),
  };
  const derivedRate = privatePublished.totalRecordableCasesThousands * 1_000 * 200_000
    / (privatePublished.employeeHoursThousands * 1_000);
  if (Number(derivedRate.toFixed(1)) !== privatePublished.totalRecordableRatePer100Fte) {
    throw new Error("NTSB_BLS_SOII_PRIVATE_RATE_DENOMINATOR_INVALID");
  }
  return {
    program: "SURVEY_OF_OCCUPATIONAL_INJURIES_AND_ILLNESSES",
    referenceYear: 2024, evidenceType: "REAL_EMPLOYER_REPORTED_SURVEY_ESTIMATES",
    populationScope: "UNITED_STATES_PRIVATE_INDUSTRY_STATE_GOVERNMENT_LOCAL_GOVERNMENT_AS_TABLE_SPECIFIED",
    tables,
    crossTableCorrelation: { ratesCountsAndTheirRseRowSequenceExactlyAligned: true,
      alignedRows: 1070, normalizedUniqueKeys: 1047, repeatedRowsPreservedNotDeduplicated: 23,
      hoursRowsAreSeparateDenominatorFrame: true, hoursUniqueKeys: 1034,
      uniqueKeyOverlapWithMainFrame: 1026, mainOnlyUniqueKeys: 21, hoursOnlyUniqueKeys: 8,
      positionalJoinOfHoursToMainFramePermitted: false },
    privateIndustryPublished: privatePublished,
    denominator: { publishedRateUnit: "CASES_PER_100_FULL_TIME_EQUIVALENT_WORKERS",
      formula: "INCIDENCE_RATE=(NUMBER_OF_CASES*200000)/EMPLOYEE_HOURS_WORKED",
      countsUnit: "THOUSANDS_OF_CASES", hoursUnit: "THOUSANDS_OF_EMPLOYEE_HOURS",
      derivedPrivateTotalRecordableRateSixDecimals: Number(derivedRate.toFixed(6)),
      agreementScope: "PUBLISHED_ONE_DECIMAL_ROUNDING_ONLY", hoursAreSurveyEstimate: true },
    uncertainty: { rseMeaning: "PERCENT_RELATIVE_STANDARD_ERROR_MEASURES_SAMPLING_ERROR",
      rseMeasuresAllError: false, suppressionPreserved: true, suppressionMeansZero: false,
      correlationAcrossColumnsOrRowsEstimated: false, covarianceMatrixAvailableHere: false },
    revisionBoundary: { releaseStatusAtCapturedIndex: "FIRST_RELEASE_OF_2024_SURVEY_DATA",
      laterRevisionNotAutomaticallyObserved: true, frozenSnapshotMustNotBeSilentlyReplaced: true },
  };
}

const CFOI_SPECS = Object.freeze([
  Object.freeze({ name: "fatal-occupational-injuries-table-a-1-2024.xlsx", id: "TABLE_A1_INDUSTRY_EVENT",
    dimension: "A1:I802", worksheetRows: 802, enDash: 3713, doubleHyphen: 0, singleHyphen: 0 }),
  Object.freeze({ name: "fatal-occupational-injuries-table-a-5-2024.xlsx", id: "TABLE_A5_OCCUPATION_EVENT",
    dimension: "A1:H456", worksheetRows: 456, enDash: 0, doubleHyphen: 2073, singleHyphen: 0 }),
  Object.freeze({ name: "fatal-occupational-injuries-table-a-7-2024.xlsx", id: "TABLE_A7_WORKER_EVENT",
    dimension: "A1:H43", worksheetRows: 39, enDash: 19, doubleHyphen: 0, singleHyphen: 0 }),
  Object.freeze({ name: "fatal-occupational-injuries-table-a-9-2024.xlsx", id: "TABLE_A9_EVENT_INDUSTRY",
    dimension: "A1:O187", worksheetRows: 187, enDash: 1692, doubleHyphen: 0, singleHyphen: 0 }),
  Object.freeze({ name: "fatal-occupational-injuries-hours-based-rates-2024.xlsx", id: "HOURS_BASED_RATES",
    dimension: "A1:M226", worksheetRows: 226, enDash: 0, doubleHyphen: 0, singleHyphen: 9 }),
]);

function parseCfoi(files) {
  const parsed = new Map();
  const tables = [];
  for (const spec of CFOI_SPECS) {
    const workbook = parseWorkbook(files[spec.name], spec.name);
    if (workbook.sheets.length !== 1 || workbook.sheets[0].name !== "2024"
      || workbook.sheets[0].dimension !== spec.dimension) {
      throw new Error(`NTSB_BLS_CFOI_SHEET_PROFILE_INVALID:${spec.id}`);
    }
    const sheet = workbook.sheets[0];
    const suppressions = suppressionCounts(sheet);
    if (sheet.rows.length !== spec.worksheetRows || suppressions.enDash !== spec.enDash
      || suppressions.doubleHyphen !== spec.doubleHyphen
      || suppressions.singleHyphen !== spec.singleHyphen) {
      throw new Error(`NTSB_BLS_CFOI_TABLE_PROFILE_INVALID:${spec.id}`);
    }
    tables.push({ tableId: spec.id, file: spec.name, dimension: sheet.dimension,
      worksheetRowCount: sheet.rows.length, worksheetHash: digest(sheet.rows.map((row) => [row.rowNumber, row.cells])),
      suppression: suppressions });
    parsed.set(spec.id, sheet);
  }
  const a1Total = numberFromCell(rowValue(findRow(parsed.get("TABLE_A1_INDUSTRY_EVENT"), "Total", "CFOI_A1_TOTAL"), 2), "CFOI_A1_TOTAL");
  const a5Total = numberFromCell(rowValue(findRow(parsed.get("TABLE_A5_OCCUPATION_EVENT"), "Total", "CFOI_A5_TOTAL"), 1), "CFOI_A5_TOTAL");
  const a7Total = numberFromCell(rowValue(findRow(parsed.get("TABLE_A7_WORKER_EVENT"), "Total", "CFOI_A7_TOTAL"), 1), "CFOI_A7_TOTAL");
  const a9Total = numberFromCell(rowValue(findRow(parsed.get("TABLE_A9_EVENT_INDUSTRY"), "Total", "CFOI_A9_TOTAL"), 2), "CFOI_A9_TOTAL");
  if (new Set([a1Total, a5Total, a7Total, a9Total]).size !== 1 || a1Total !== 5070) {
    throw new Error("NTSB_BLS_CFOI_CROSS_TABLE_TOTAL_INVALID");
  }
  const a1Private = numberFromCell(rowValue(findRow(parsed.get("TABLE_A1_INDUSTRY_EVENT"), "Private industry", "CFOI_PRIVATE"), 2), "CFOI_PRIVATE");
  if (a1Private !== 4616) throw new Error("NTSB_BLS_CFOI_PRIVATE_TOTAL_INVALID");
  const rates = parsed.get("HOURS_BASED_RATES");
  const totalRate = findRow(rates, "Total", "CFOI_TOTAL_RATE");
  const privateRate = findRow(rates, "Private industry", "CFOI_PRIVATE_RATE");
  const allRateText = rates.rows.map((row) => row.cells.join(" ")).join(" ").replace(/\s+/gu, " ");
  for (const marker of ["Workers under the age of 16 years", "volunteer workers", "resident military",
    "not included in rate calculations", "total fatal injuries column represents total published fatal injuries before the exclusions",
    "Current Population Survey", "(N/EH) x 200,000,000", "MOE measures the variance in the employment calculations",
    "small fatal injury counts can vary substantially from year to year",
    "40 million or more work hours", "5 or more reported fatal work injuries"]) {
    if (!allRateText.includes(marker)) throw new Error(`NTSB_BLS_CFOI_RATE_FOOTNOTE_MISSING:${marker}`);
  }
  return {
    program: "CENSUS_OF_FATAL_OCCUPATIONAL_INJURIES", referenceYear: 2024,
    evidenceType: "REAL_FATAL_OCCUPATIONAL_INJURY_CENSUS_COUNTS_WITH_ESTIMATED_RATE_EXPOSURE",
    populationScope: "UNITED_STATES_FATAL_OCCUPATIONAL_INJURIES_AS_CFOI_DEFINED",
    tables,
    publishedCounts: { allFatalOccupationalInjuries: a1Total, privateIndustry: a1Private,
      nationalTotalAgreementAcrossA1A5A7A9: true, countsAreCensusCounts: true,
      illnessRelatedDeathsExcludedUnlessPrecipitatedByInjuryEvent: true },
    publishedRates: {
      total: { hoursWorkedMillions: numberFromCell(rowValue(totalRate, 2), "CFOI_TOTAL_HOURS"),
        fatalInjuryRatePer100000Fte: numberFromCell(rowValue(totalRate, 3), "CFOI_TOTAL_RATE"),
        employmentVarianceMarginOfError: numberFromCell(rowValue(totalRate, 4), "CFOI_TOTAL_MOE") },
      privateIndustry: { hoursWorkedMillions: numberFromCell(rowValue(privateRate, 2), "CFOI_PRIVATE_HOURS"),
        fatalInjuryRatePer100000Fte: numberFromCell(rowValue(privateRate, 3), "CFOI_PRIVATE_RATE"),
        employmentVarianceMarginOfError: numberFromCell(rowValue(privateRate, 4), "CFOI_PRIVATE_MOE") },
    },
    denominator: { formula: "RATE=(N/EH)*200000000", rateUnit: "FATAL_INJURIES_PER_100000_FULL_TIME_EQUIVALENT_WORKERS",
      exposureUnit: "MILLIONS_OF_HOURS_WORKED", exposureSource: "CURRENT_POPULATION_SURVEY_2024_SAMPLE_ESTIMATE",
      excludedFromRateNumeratorAndExposureForCpsConsistency: ["WORKERS_UNDER_AGE_16", "VOLUNTEER_WORKERS", "RESIDENT_MILITARY"],
      displayedTotalFatalInjuryCountIsBeforeThoseRateExclusions: true,
      dividePublished5070ByPublishedTotalHoursToRecalculateRatePermitted: false,
      publicationThreshold: { minimumReportedFatalWorkInjuries: 5, minimumWorkHours: 40_000_000 },
      rateDashMeaning: "NO_DATA_REPORTED_OR_DOES_NOT_MEET_PUBLICATION_CRITERIA" },
    uncertainty: { hoursAreCpsSampleEstimates: true,
      marginOfErrorMeasures: "EMPLOYMENT_VARIANCE_ONLY", marginOfErrorMeasuresFatalCountVariation: false,
      smallFatalCountsCanHaveSubstantialYearToYearFluctuation: true,
      suppressedCellsPreserved: true, suppressedCellsAreZero: false,
      dashConflatesNoDataAndPublicationCriteriaFailure: true,
      countDependenceOrCrossCellCovarianceEstimated: false },
    classification: { fatalIndustryCounts: "CFOI_NAICS_AS_2024_TABLE_DEFINED",
      fatalRateIndustryNumerator: "NAICS_2022", rateExposureIndustry: "NAICS_2017_CPS",
      crosswalkBoundary: "ONLY_COMPARABLE_2017_TO_2022_NAICS_INDUSTRIES_PUBLISHED",
      occupation: "SOC_2018", eventAndExposure: "OIICS_3_03_FOR_REFERENCE_YEAR_2024" },
    revisionBoundary: { capturedTablesDescribeDataAsRevisedAndFinal: true,
      laterPublisherCorrectionNotAutomaticallyObserved: true,
      frozenSnapshotMustNotBeSilentlyReplaced: true },
  };
}

function parseOiics(files) {
  const workbookName = "oiics-manual-version-3-03.xlsx";
  const workbook = parseWorkbook(files[workbookName], workbookName);
  const expectedSheets = ["Title", "1. Intro", "2.a. Nature Rules", "2.b. Nature Codes",
    "3.a. Part Rules", "3.b. Part Codes", "4.a. Event Rules", "4.b. Event Codes",
    "5.a. Source Rules", "5.b. Source Codes", "6.a. WA and location rules",
    "6.b. WA Codes", "6.c. Location Codes"];
  if (canonicalizeStrict(workbook.sheets.map((sheet) => sheet.name)) !== canonicalizeStrict(expectedSheets)) {
    throw new Error("NTSB_BLS_OIICS_SHEET_PROFILE_INVALID");
  }
  const shared = workbook.sharedStrings.join(" ").replace(/\s+/gu, " ");
  if (!shared.includes("Version 3.03") || !shared.includes("May 2026")) {
    throw new Error("NTSB_BLS_OIICS_WORKBOOK_VERSION_INVALID");
  }
  const page = files["oiics-manual-page-rendered.html"].toString("utf8");
  for (const marker of ["OIICS 3.03 (May 2026)", "Beginning with reference year 2024 OIICS 3.03",
    "No major changes to the taxonomy", "break in series with data for prior years", "issued in May, 2026"]) {
    if (!page.includes(marker)) throw new Error(`NTSB_BLS_OIICS_PAGE_BOUNDARY_MISSING:${marker}`);
  }
  return { classificationSystem: "OCCUPATIONAL_INJURY_AND_ILLNESS_CLASSIFICATION_SYSTEM",
    version: "3.03", issued: "2026-05", implementedReferenceYear: 2024,
    appliesTo: ["SOII", "CFOI"], workbookSheetCount: workbook.sheets.length,
    workbookSheetNames: expectedSheets,
    workbookSheetRowCounts: workbook.sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length })),
    workbookSemanticHash: digest(workbook.sheets.map((sheet) => [sheet.name, sheet.dimension,
      sheet.rows.map((row) => [row.rowNumber, row.cells])])),
    revisionBoundary: { referenceYear2023WasSeriesBreakFromPriorYears: true,
      version303IsMinorMaintenanceForReferenceYear2024: true,
      majorCodeTitleOrDefinitionTaxonomyChangeIn303: false,
      crossSeriesPoolingWithoutVersionHandlingPermitted: false },
  };
}

function parseBls(files) {
  const soiiPage = files["soii-summary-historical-rendered.html"].toString("utf8");
  const cfoiPage = files["cfoi-tables-rendered.html"].toString("utf8");
  for (const marker of ["first release of survey data", "percent relative standard errors",
    "measure of sampling error", "table-3-number-of-hours-worked-by-industry-2024-national.xlsx"]) {
    if (!soiiPage.includes(marker)) throw new Error(`NTSB_BLS_SOII_PAGE_BOUNDARY_MISSING:${marker}`);
  }
  for (const marker of ["Census of Fatal Occupational Injuries", "2024 Census of Fatal Occupational Injuries",
    "fatal-occupational-injuries-hours-based-rates-2024.xlsx"]) {
    if (!cfoiPage.includes(marker)) throw new Error(`NTSB_BLS_CFOI_PAGE_BOUNDARY_MISSING:${marker}`);
  }
  return {
    laneId: "BLS_IIF_2024_SOII_CFOI_OIICS", realityStatus: "REAL_OCCUPATIONAL_OUTCOME_AND_EXPOSURE_EXPERIENCE",
    captureRepresentation: { xlsxFiles: "EXACT_PUBLISHER_FILE_BYTES",
      renderedPages: "BROWSER_RENDERED_DOCUMENT_OUTER_HTML",
      renderedPagesAreOriginalHttpResponseBytes: false, transportAttested: false },
    soii: parseSoii(files), cfoi: parseCfoi(files), oiics: parseOiics(files),
    inferenceBoundary: { sourceDomainDescriptiveCalibrationOnly: true,
      targetDomainTransferPermitted: false, causalEffectIdentified: false,
      economicLossObserved: false, lossSeverityObserved: false,
      pricingUsePermitted: false, guaranteeUsePermitted: false, settlementUsePermitted: false },
  };
}

function sourceProjection(files, official, manifestHash) {
  const projections = SOURCE_FILES.map((expected) => ({
    name: expected.name, lane: expected.lane, kind: expected.kind, url: expected.url,
    captureRepresentation: expected.kind === "BROWSER_RENDERED_DOM_SNAPSHOT"
      ? "BROWSER_RENDERED_DOCUMENT_OUTER_HTML" : "EXACT_PUBLISHER_FILE_BYTES",
    bytes: files[expected.name].length, sha256: sha256(files[expected.name]),
  }));
  const ntsb = projections.filter((file) => file.lane === "NTSB");
  const bls = projections.filter((file) => file.lane === "BLS");
  return {
    sourceId: official ? NTSB_BLS_FROZEN_SOURCE_20260821.sourceId : "CALLER_PROVIDED_NTSB_BLS_SHAPED_FIXTURE",
    publishers: official ? ["NATIONAL_TRANSPORTATION_SAFETY_BOARD", "UNITED_STATES_BUREAU_OF_LABOR_STATISTICS"] : [],
    profileMatchedAtBuild: official, callerBytesMatchedFrozenPins: official ? true : officialProfile(files),
    sourceReality: official ? "REAL_OFFICIAL_CASE_AND_OCCUPATIONAL_EXPERIENCE" : "UNATTESTED_FIXTURE_BYTES",
    frozenAt: official ? FROZEN_AT : null,
    objectCount: projections.length, sourceBytes: projections.reduce((sum, file) => sum + file.bytes, 0),
    ntsbObjectCount: ntsb.length, blsObjectCount: bls.length,
    acquisitionManifestHash: official ? manifestHash : null,
    sourceSetHash: digest(projections.map((file) => [file.name, file.url, file.bytes, file.sha256, file.captureRepresentation])),
    ntsbSourceSetHash: digest(ntsb.map((file) => [file.name, file.url, file.bytes, file.sha256])),
    blsSourceSetHash: digest(bls.map((file) => [file.name, file.url, file.bytes, file.sha256, file.captureRepresentation])),
    allObjectsBytePinned: official,
    allNtsbPdfsHavePhysicalEofStartxrefFullPageAndTextParserGate: official,
    pdfParserRuntimeCryptographicallyPinned: false,
    renderedDomSnapshotsAreOriginalResponseBytes: false,
    transportAttested: false,
    files: projections,
  };
}

function fixtureNtsbLane() {
  return { laneId: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    realityStatus: "UNATTESTED_FIXTURE", selection: { completedCasesAtFrozenIndex: 0, selectedCases: 0,
      isStatisticalPopulation: false, isRepresentativeSample: false, ongoingCasesIncluded: 0, caseIds: [] },
    sourceAccounting: { indexPages: 0, investigationPages: 0, finalReportFiles: 0,
      finalReportCaseCoverage: 0, selectedFactualReportFiles: 0, docketIndexPages: 0,
      docketDocumentLinks: 0, completeDocketDocumentBytesCaptured: false,
      allElevenPdfsByteCompleteAndFullyParsed: false },
    multiRootBinding: null, cases: [],
    findingBoundary: { probableCauseAndFindingsAreFinalNtsbSafetyInvestigationFindings: false,
      assignsFaultOrBlame: false, determinesRightsOrLiabilities: false,
      civilDamagesEvidenceUseRestrictedBy49USC1154b: null,
      recommendationsAreSafetyRecommendationsNotSettlementOrders: true,
      laterRecommendationStatusAndPostFreezeRevisionObserved: false },
    inferenceBoundary: { causalGeneralizationBeyondInvestigatedCases: false,
      frequencyOrSeverityRateCalculated: false, economicLossObserved: false,
      targetDomainTransferPermitted: false, sixCaseSelectionPoolableWithBlsPopulationEstimates: false } };
}

function fixtureBlsLane() {
  return { laneId: "BLS_IIF_2024_SOII_CFOI_OIICS", realityStatus: "UNATTESTED_FIXTURE",
    captureRepresentation: { xlsxFiles: "UNATTESTED_FIXTURE_BYTES", renderedPages: "UNATTESTED_FIXTURE_BYTES",
      renderedPagesAreOriginalHttpResponseBytes: false, transportAttested: false },
    soii: null, cfoi: null, oiics: null,
    inferenceBoundary: { sourceDomainDescriptiveCalibrationOnly: false,
      targetDomainTransferPermitted: false, causalEffectIdentified: false,
      economicLossObserved: false, lossSeverityObserved: false,
      pricingUsePermitted: false, guaranteeUsePermitted: false, settlementUsePermitted: false } };
}

function buildInternal(files, options, official, manifestHash = null) {
  if (!exactKeys(files, EXPECTED_NAMES)
    || !exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("NTSB_BLS_BUILD_ARGUMENTS_INVALID");
  }
  for (const name of EXPECTED_NAMES) {
    if (!Buffer.isBuffer(files[name]) || files[name].length <= 0 || files[name].length > MAX_SOURCE_FILE_BYTES) {
      throw new Error(`NTSB_BLS_SOURCE_BYTES_INVALID:${name}`);
    }
  }
  if (official && (!officialProfile(files) || !HASH.test(manifestHash ?? ""))) {
    throw new Error("NTSB_BLS_OFFICIAL_PROFILE_INVALID");
  }
  const generatedAt = canonicalTime(options.generatedAt ?? FROZEN_AT, "NTSB_BLS_GENERATED_AT");
  const source = sourceProjection(files, official, manifestHash);
  const ntsb = official ? parseNtsb(files) : fixtureNtsbLane();
  const bls = official ? parseBls(files) : fixtureBlsLane();
  const artifactWithoutHash = {
    schema: NTSB_BLS_OUTCOME_EVIDENCE_SCHEMA, generatedAt,
    epistemicPolicy: { publicOriginDoesNotDemoteRealWorldEvidence: true,
      outsiderCollectionDoesNotUpgradeSourceAuthority: true,
      dataQualityAuthorityReliabilityAndPopulationFitAreEvaluatedDirectly: true,
      externalHumanMeasurementAndOutsiderMeasurementHaveNoAutomaticRankOrdering: true },
    source,
    lanes: { ntsb, bls },
    crossLaneBoundary: {
      ntsbInvestigatedCasesAndBlsPopulationExperienceAreSeparateEstimands: true,
      ntsbCaseCountMayBeUsedAsBlsRateNumerator: false,
      blsHoursMayBeUsedAsNtsbCaseExposure: false,
      crossLanePoolingOrFrequencyCalculationPerformed: false,
      causalIdentificationPerformed: false, dependenceOrTailModelFitted: false,
      targetDomainTransferPerformed: false, economicLossOrPaymentObserved: false,
    },
    rights: { officialPublicAccessObserved: official, legalConclusionMade: false,
      rawRedistributionRightConcluded: false, commercialUseRightConcluded: false,
      modelTrainingRightConcluded: false, personalDataReuseRightConcluded: false,
      sourceAccessDoesNotEqualReusePermission: true },
    verificationRequirement: { standaloneVerificationLevel: "STRUCTURE_ONLY",
      admissionVerificationLevel: "FULL_OFFICIAL_NTSB_BLS_SOURCE_REPLAYED",
      sourceAwareExactRebuildRequiredForRealCaseOrExperienceAdmission: true,
      localPdfParserRuntimeCryptographicallyPinned: false },
    authority: { TRAIN: false, PRICE: false, GUARANTEE: false, SETTLE: false,
      CLOSE: false, EXECUTE: false, ASSIGN_FAULT: false, DETERMINE_LEGAL_LIABILITY: false },
    progress: { outcomeSensing: official ? "REAL_CASE_AND_POPULATION_EXPERIENCE_ADDED" : "NO_REAL_EVIDENCE_ADMITTED",
      actuarialExposure: official ? "SOURCE_DOMAIN_DENOMINATORS_WITH_UNCERTAINTY_ADDED" : "NO_DENOMINATOR_ADMITTED",
      causalModel: "NOT_IDENTIFIED_BY_THIS_WAVE", economicLossModel: "NOT_OBSERVED_BY_THIS_WAVE",
      readyToPrice: false, readyToGuarantee: false, readyToSettle: false, readyToAssumeLiability: false },
    admission: { requiresFullSourceReplay: true,
      realNtsbCasesRecognized: official, realBlsExperienceRecognized: official,
      sourceDomainDescriptiveUseOnly: official, targetTransfer: false,
      training: false, pricing: false, guarantee: false, settlement: false },
  };
  return { ...artifactWithoutHash, artifactHash: digest(artifactWithoutHash) };
}

export function buildNtsbBlsOutcomeEvidenceFromBytes(files, options = {}) {
  return buildInternal(files, options, false, null);
}

export function buildNtsbBlsOutcomeEvidenceFromSourceDirectory(sourceDirectory, options = {}) {
  const source = stableReadSourceDirectory(sourceDirectory);
  return buildInternal(source.files, options, true, source.manifestHash);
}

function structureErrors(artifact) {
  const errors = [];
  if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
    return ["ARTIFACT_NOT_OBJECT"];
  }
  if (artifact.schema !== NTSB_BLS_OUTCOME_EVIDENCE_SCHEMA) errors.push("SCHEMA_INVALID");
  try { canonicalTime(artifact.generatedAt, "ARTIFACT_GENERATED_AT"); } catch (error) {
    errors.push(error instanceof Error ? error.message : "GENERATED_AT_INVALID");
  }
  if (!HASH.test(artifact.artifactHash ?? "")) errors.push("ARTIFACT_HASH_FORMAT_INVALID");
  else {
    const { artifactHash: _hash, ...withoutHash } = artifact;
    try {
      if (digest(withoutHash) !== artifact.artifactHash) errors.push("ARTIFACT_HASH_MISMATCH");
    } catch { errors.push("ARTIFACT_CANONICALIZATION_INVALID"); }
  }
  const expectedAuthority = { TRAIN: false, PRICE: false, GUARANTEE: false, SETTLE: false,
    CLOSE: false, EXECUTE: false, ASSIGN_FAULT: false, DETERMINE_LEGAL_LIABILITY: false };
  if (canonicalizeStrict(artifact.authority ?? null) !== canonicalizeStrict(expectedAuthority)) {
    errors.push("AUTHORITY_BOUNDARY_INVALID");
  }
  if (artifact.crossLaneBoundary?.crossLanePoolingOrFrequencyCalculationPerformed !== false
    || artifact.crossLaneBoundary?.targetDomainTransferPerformed !== false
    || artifact.crossLaneBoundary?.economicLossOrPaymentObserved !== false) {
    errors.push("CROSS_LANE_BOUNDARY_INVALID");
  }
  if (artifact.source?.profileMatchedAtBuild === false
    && (artifact.admission?.realNtsbCasesRecognized !== false
      || artifact.admission?.realBlsExperienceRecognized !== false
      || artifact.rights?.officialPublicAccessObserved !== false)) {
    errors.push("FIXTURE_INHERITED_REALITY_OR_RIGHTS");
  }
  if (artifact.rights?.rawRedistributionRightConcluded !== false
    || artifact.rights?.modelTrainingRightConcluded !== false
    || artifact.rights?.legalConclusionMade !== false) {
    errors.push("RIGHTS_BOUNDARY_INVALID");
  }
  return errors;
}

export function verifyNtsbBlsOutcomeEvidence(artifact) {
  let errors;
  try { errors = structureErrors(artifact); } catch (error) {
    errors = [error instanceof Error ? error.message : "STRUCTURE_CHECK_FAILED"];
  }
  return {
    ok: errors.length === 0, verificationLevel: "STRUCTURE_ONLY",
    sourceArtifactsReverified: false, sourceTruthEstablished: false,
    publisherAuthorityEstablished: false, officialSourceProfileReproduced: false,
    publisherRecordStatusReproduced: false, candidateArtifactExactlyRebuilt: false,
    underlyingWorldTruthEstablished: false, institutionalAuthorityEstablished: false,
    realCaseOrExperienceAdmissionEstablished: false,
    decision: null, errors,
    artifactHash: errors.length === 0 ? artifact.artifactHash : null,
    sourceSetHash: errors.length === 0 ? artifact.source?.sourceSetHash ?? null : null,
  };
}

export function verifyNtsbBlsOutcomeEvidenceWithSource(artifact, sourceDirectory) {
  const structure = verifyNtsbBlsOutcomeEvidence(artifact);
  if (!structure.ok) return { ...structure, verificationLevel: "FULL_SOURCE_REPLAY_FAILED" };
  try {
    const rebuilt = buildNtsbBlsOutcomeEvidenceFromSourceDirectory(sourceDirectory,
      { generatedAt: artifact.generatedAt });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(artifact)) {
      return { ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
        sourceArtifactsReverified: false, sourceTruthEstablished: false,
        publisherAuthorityEstablished: false, officialSourceProfileReproduced: true,
        publisherRecordStatusReproduced: true, candidateArtifactExactlyRebuilt: false,
        underlyingWorldTruthEstablished: false, institutionalAuthorityEstablished: false,
        realCaseOrExperienceAdmissionEstablished: false,
        decision: null, errors: ["EXACT_REBUILD_MISMATCH"], artifactHash: artifact.artifactHash,
        sourceSetHash: rebuilt.source.sourceSetHash };
    }
    return { ok: true, verificationLevel: "FULL_OFFICIAL_NTSB_BLS_SOURCE_REPLAYED",
      sourceArtifactsReverified: true, sourceTruthEstablished: false,
      publisherAuthorityEstablished: false, officialSourceProfileReproduced: true,
      publisherRecordStatusReproduced: true, candidateArtifactExactlyRebuilt: true,
      underlyingWorldTruthEstablished: false, institutionalAuthorityEstablished: false,
      realCaseOrExperienceAdmissionEstablished: true,
      decision: "ADMIT_REAL_SOURCE_DOMAIN_DESCRIPTIVE_OUTCOME_AND_EXPOSURE_EXPERIENCE",
      errors: [], artifactHash: artifact.artifactHash, sourceSetHash: rebuilt.source.sourceSetHash,
      ntsbSourceSetHash: rebuilt.source.ntsbSourceSetHash, blsSourceSetHash: rebuilt.source.blsSourceSetHash,
      acquisitionManifestHash: rebuilt.source.acquisitionManifestHash };
  } catch (error) {
    return { ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false, sourceTruthEstablished: false,
      publisherAuthorityEstablished: false, officialSourceProfileReproduced: false,
      publisherRecordStatusReproduced: false, candidateArtifactExactlyRebuilt: false,
      underlyingWorldTruthEstablished: false, institutionalAuthorityEstablished: false,
      realCaseOrExperienceAdmissionEstablished: false,
      decision: null, errors: [error instanceof Error ? error.message : "SOURCE_REPLAY_FAILED"],
      artifactHash: artifact.artifactHash, sourceSetHash: null };
  }
}
