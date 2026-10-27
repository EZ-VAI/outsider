/*
 * ClinicalTrials.gov source-aware posted registry/results evidence.
 *
 * ClinicalTrials.gov contains real study registrations and real aggregate
 * results as posted by sponsors or investigators.  NLM performs a bounded QC
 * review, not scientific validation.  This lane preserves both facts.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { canonicalizeStrict } from "./canonical.js";

export const CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA
  = "outsider/clinicaltrials-posted-results-evidence/v1";

export const CLINICALTRIALS_FROZEN_AT = "2026-08-22T01:20:00.000Z";
export const CLINICALTRIALS_API_VERSION = "2.0.5";
export const CLINICALTRIALS_DATA_TIMESTAMP = "2026-08-21T09:00:05";
export const CLINICALTRIALS_RESULTS_FIRST_POSTED_WINDOW = Object.freeze({
  from: "2026-07-01",
  through: "2026-07-01",
});
export const CLINICALTRIALS_QUERY_TERM
  = "AREA[ResultsFirstPostDate]RANGE[2026-07-01, 2026-07-01]";
export const CLINICALTRIALS_SORT = "StudyFirstPostDate:asc";
export const CLINICALTRIALS_PAGE_SIZE = 7;

// No contact, investigator, location, document, IPD URL, or participant-level
// fields are requested.  Result modules are aggregate summary-result modules.
export const CLINICALTRIALS_FIXED_FIELDS = Object.freeze([
  "NCTId",
  "OverallStatus",
  "StartDate",
  "StartDateType",
  "PrimaryCompletionDate",
  "PrimaryCompletionDateType",
  "CompletionDate",
  "CompletionDateType",
  "StudyFirstPostDate",
  "StudyFirstPostDateType",
  "ResultsFirstPostDate",
  "ResultsFirstPostDateType",
  "LastUpdatePostDate",
  "LastUpdatePostDateType",
  "LeadSponsorName",
  "LeadSponsorClass",
  "Condition",
  "StudyType",
  "Phase",
  "DesignAllocation",
  "DesignInterventionModel",
  "DesignPrimaryPurpose",
  "DesignObservationalModel",
  "DesignTimePerspective",
  "DesignMasking",
  "EnrollmentCount",
  "EnrollmentType",
  "ArmGroupLabel",
  "ArmGroupType",
  "ArmGroupInterventionName",
  "InterventionType",
  "InterventionName",
  "InterventionArmGroupLabel",
  "PrimaryOutcomeMeasure",
  "PrimaryOutcomeTimeFrame",
  "SecondaryOutcomeMeasure",
  "SecondaryOutcomeTimeFrame",
  "Sex",
  "MinimumAge",
  "MaximumAge",
  "StdAge",
  "ParticipantFlowModule",
  "BaselineCharacteristicsModule",
  "OutcomeMeasuresModule",
  "AdverseEventsModule",
  "HasResults",
]);

export function clinicalTrialsInitialRequestUrl() {
  return clinicalTrialsRequestUrl(null);
}

export function clinicalTrialsRequestUrl(pageToken = null) {
  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  url.searchParams.set("format", "json");
  url.searchParams.set("query.term", CLINICALTRIALS_QUERY_TERM);
  url.searchParams.set("fields", CLINICALTRIALS_FIXED_FIELDS.join(","));
  url.searchParams.set("sort", CLINICALTRIALS_SORT);
  url.searchParams.set("pageSize", String(CLINICALTRIALS_PAGE_SIZE));
  url.searchParams.set("countTotal", "true");
  if (pageToken !== null) url.searchParams.set("pageToken", pageToken);
  return url.toString();
}

const PAGE_1_NEXT = "ZVt07cGHkvI2wRk2CJf6_LLtipDWMc8od7KrgP4bmTeSuPw1L3vIFvHRzo5F0iaSbcYAT74";
const PAGE_2_NEXT = "ZVt07cGHkvI2wRk2CJf6_LLtipDWMc8od7KrgP4bmjiSvv00LXvIFvHRzo5F0iiVb8cATb4";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ARRAY_ITEMS = 200_000;
const MAX_STRING_LENGTH = 4 * 1024 * 1024;
const EXPECTED_STUDIES = 18;

const CANONICAL_ARTIFACT_HASH
  = "sha256:93ae703761d069b7adbdc8ad781cc2ebb1d91b836aa21e027a5f6657f84840a6";
const CANONICAL_STRUCTURAL_SHAPE_HASH
  = "sha256:82ec8f904d436ae9f6e1e3c4306a210c9386c9526c40e37f7c5e6274f9ceefa7";

export const CLINICALTRIALS_FROZEN_SOURCE_20260822 = Object.freeze({
  sourceId: "CLINICALTRIALS_GOV_API_V2_RESULTS_FIRST_POSTED_20260701_CAPTURE_20260822",
  frozenAt: CLINICALTRIALS_FROZEN_AT,
  apiVersion: CLINICALTRIALS_API_VERSION,
  dataTimestamp: CLINICALTRIALS_DATA_TIMESTAMP,
  files: Object.freeze([
    Object.freeze({
      name: "api-version.json", kind: "API_VERSION_AND_DATA_TIMESTAMP",
      url: "https://clinicaltrials.gov/api/v2/version", bytes: 71,
      sha256: "sha256:d0ddfdc4b25d6937e2ddd4621afa66c454f512fbe5f5e17ba0d9deaff3d41ab7",
      contentType: "application/json",
    }),
    Object.freeze({
      name: "studies-metadata.json", kind: "OFFICIAL_STUDY_FIELD_METADATA",
      url: "https://clinicaltrials.gov/api/v2/studies/metadata", bytes: 175_633,
      sha256: "sha256:31d2120be5384c2c22bed089191bfeeef675e3960da9432509b564e666b12398",
      contentType: "application/json",
    }),
    Object.freeze({
      name: "studies-search-areas.json", kind: "OFFICIAL_SEARCH_AREA_METADATA",
      url: "https://clinicaltrials.gov/api/v2/studies/search-areas", bytes: 25_359,
      sha256: "sha256:2dce42cda2607994a69fd3ffaafe263746b5e6bf9e87da1eab942b9880fea9a1",
      contentType: "application/json",
    }),
    Object.freeze({
      name: "studies-page-001.json", kind: "FIXED_QUERY_PAGE", page: 1,
      requestPageToken: null, expectedNextPageToken: PAGE_1_NEXT,
      expectedRows: 7, expectedTopLevelKeys: Object.freeze(["totalCount", "studies", "nextPageToken"]),
      url: clinicalTrialsRequestUrl(null), bytes: 1_124_468,
      sha256: "sha256:86b2b9cea09be5d1917c642fd8e82cfda24e6f2e053bb6a1e86c37a51252c2ba",
      contentType: "application/json",
    }),
    Object.freeze({
      name: "studies-page-002.json", kind: "FIXED_QUERY_PAGE", page: 2,
      requestPageToken: PAGE_1_NEXT, expectedNextPageToken: PAGE_2_NEXT,
      expectedRows: 7, expectedTopLevelKeys: Object.freeze(["studies", "nextPageToken"]),
      url: clinicalTrialsRequestUrl(PAGE_1_NEXT), bytes: 606_572,
      sha256: "sha256:f0c9abbeb40293c78ddc39d0757ea6e26e5cffb1215999d38826d0023fb255fe",
      contentType: "application/json",
    }),
    Object.freeze({
      name: "studies-page-003.json", kind: "FIXED_QUERY_PAGE", page: 3,
      requestPageToken: PAGE_2_NEXT, expectedNextPageToken: null,
      expectedRows: 4, expectedTopLevelKeys: Object.freeze(["studies"]),
      url: clinicalTrialsRequestUrl(PAGE_2_NEXT), bytes: 112_443,
      sha256: "sha256:964f2e874d4efef4651fd2bf87b5855d98e6accf83cc346687888c04c2496f66",
      contentType: "application/json",
    }),
  ]),
});

const EXPECTED_NAMES = Object.freeze(CLINICALTRIALS_FROZEN_SOURCE_20260822.files
  .map((file) => file.name));
const EXPECTED_DIRECTORY_NAMES = Object.freeze([...EXPECTED_NAMES, "acquisition.json"].sort());

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function digest(value) { return sha256(Buffer.from(canonicalizeStrict(value))); }
function artifactDigest(value) {
  return digest({ domain: CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA, value });
}
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
  if (normalized !== CLINICALTRIALS_FROZEN_AT) throw new Error(`${code}_NOT_FROZEN_SNAPSHOT`);
  return normalized;
}
function structuralShape(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const members = [...new Set(value.map((item) => canonicalizeStrict(structuralShape(item))))]
      .sort().map((item) => JSON.parse(item));
    return { type: "array", memberShapes: members };
  }
  if (typeof value === "object") {
    return { type: "object", fields: Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, structuralShape(value[key])])) };
  }
  return typeof value;
}
export function clinicalTrialsPostedResultsStructuralShapeHash(value) {
  return digest({ domain: `${CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA}/shape/v1`,
    value: structuralShape(value) });
}

export function clinicalTrialsExpectedAcquisitionManifest() {
  return {
    schema: "outsider/clinicaltrials-posted-results-acquisition-manifest/v1",
    sourceId: CLINICALTRIALS_FROZEN_SOURCE_20260822.sourceId,
    capturedAt: CLINICALTRIALS_FROZEN_AT,
    apiVersion: CLINICALTRIALS_API_VERSION,
    dataTimestamp: CLINICALTRIALS_DATA_TIMESTAMP,
    contentRepresentation: "FETCH_DECODED_HTTP_ENTITY_BODY",
    transportAttested: false,
    query: {
      endpoint: "https://clinicaltrials.gov/api/v2/studies",
      format: "json",
      queryTerm: CLINICALTRIALS_QUERY_TERM,
      fields: [...CLINICALTRIALS_FIXED_FIELDS],
      sort: CLINICALTRIALS_SORT,
      pageSize: CLINICALTRIALS_PAGE_SIZE,
      countTotal: true,
      completeClosedWindow: { ...CLINICALTRIALS_RESULTS_FIRST_POSTED_WINDOW },
    },
    objects: CLINICALTRIALS_FROZEN_SOURCE_20260822.files.map((file) => ({
      name: file.name, kind: file.kind, url: file.url, bytes: file.bytes,
      sha256: file.sha256, contentType: file.contentType,
      page: file.page ?? null, requestPageToken: file.requestPageToken ?? null,
      expectedNextPageToken: file.expectedNextPageToken ?? null,
      acquisition: "EXACT_HTTPS_FETCH_AND_PIN",
    })),
  };
}

function stableReadFile(target, expected, code) {
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
    || pathBefore.size !== BigInt(expected.bytes) || pathBefore.size > BigInt(MAX_FILE_BYTES)) {
    throw new Error(`${code}_UNSAFE:${expected.name}`);
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(target, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) throw new Error(`${code}_CHANGED:${expected.name}`);
    }
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`${code}_PIN_MISMATCH:${expected.name}`);
    }
    return bytes;
  } finally { closeSync(fd); }
}

function stableReadSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || !sourceDirectory.trim()) {
    throw new Error("CLINICALTRIALS_SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) throw new Error("CLINICALTRIALS_SOURCE_DIRECTORY_TOO_BROAD");
  const rootBefore = lstatSync(directory, { bigint: true });
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) {
    throw new Error("CLINICALTRIALS_SOURCE_DIRECTORY_UNSAFE");
  }
  const names = readdirSync(directory).sort();
  if (canonicalizeStrict(names) !== canonicalizeStrict(EXPECTED_DIRECTORY_NAMES)) {
    throw new Error("CLINICALTRIALS_SOURCE_DIRECTORY_PROFILE_MISMATCH");
  }
  const files = {};
  for (const expected of CLINICALTRIALS_FROZEN_SOURCE_20260822.files) {
    files[expected.name] = stableReadFile(path.join(directory, expected.name), expected,
      "CLINICALTRIALS_SOURCE_FILE");
  }
  const manifest = Buffer.from(`${JSON.stringify(clinicalTrialsExpectedAcquisitionManifest(), null, 2)}\n`);
  const manifestBytes = stableReadFile(path.join(directory, "acquisition.json"), {
    name: "acquisition.json", bytes: manifest.length, sha256: sha256(manifest),
  }, "CLINICALTRIALS_ACQUISITION_MANIFEST");
  if (!manifestBytes.equals(manifest)) {
    throw new Error("CLINICALTRIALS_ACQUISITION_MANIFEST_MISMATCH");
  }
  const rootAfter = lstatSync(directory, { bigint: true });
  for (const field of ["dev", "ino", "mtimeNs", "ctimeNs"]) {
    if (rootBefore[field] !== rootAfter[field]) throw new Error("CLINICALTRIALS_SOURCE_DIRECTORY_CHANGED");
  }
  return files;
}

function assertInputFiles(files) {
  if (!exactKeys(files, EXPECTED_NAMES)) throw new Error("CLINICALTRIALS_INPUT_FILE_SET_INVALID");
  for (const name of EXPECTED_NAMES) {
    if (!Buffer.isBuffer(files[name]) || files[name].length <= 0
      || files[name].length > MAX_FILE_BYTES) throw new Error(`CLINICALTRIALS_INPUT_FILE_INVALID:${name}`);
  }
}
function officialPinsMatch(files) {
  return CLINICALTRIALS_FROZEN_SOURCE_20260822.files.every((expected) => (
    files[expected.name].length === expected.bytes
      && sha256(files[expected.name]) === expected.sha256
  ));
}
function parseJson(bytes, code) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error(`${code}_UTF8_INVALID`); }
  if (text.startsWith("\ufeff")) throw new Error(`${code}_BOM_FORBIDDEN`);
  try { return JSON.parse(text); }
  catch { throw new Error(`${code}_JSON_INVALID`); }
}

function metadataKind(node) {
  const array = typeof node.type === "string" && node.type.endsWith("[]");
  if (node.sourceType === "STRUCT") return array ? "OBJECT_ARRAY" : "OBJECT";
  return array ? "PRIMITIVE_ARRAY" : "PRIMITIVE";
}
function indexMetadata(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("CLINICALTRIALS_METADATA_ROOT_INVALID");
  const byPiece = new Map();
  function visit(node, ancestors) {
    if (node === null || typeof node !== "object" || Array.isArray(node)
      || typeof node.name !== "string" || !node.name
      || typeof node.piece !== "string" || !node.piece
      || typeof node.sourceType !== "string" || !node.sourceType
      || typeof node.type !== "string" || !node.type) {
      throw new Error("CLINICALTRIALS_METADATA_NODE_INVALID");
    }
    if (byPiece.has(node.piece)) throw new Error(`CLINICALTRIALS_METADATA_PIECE_DUPLICATE:${node.piece}`);
    const info = { node, path: [...ancestors, node], kind: metadataKind(node) };
    byPiece.set(node.piece, info);
    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) throw new Error(`CLINICALTRIALS_METADATA_CHILDREN_INVALID:${node.piece}`);
      for (const child of node.children) visit(child, [...ancestors, node]);
    }
  }
  for (const node of nodes) visit(node, []);
  return byPiece;
}
function schemaNodeFromMetadata(node) {
  return { name: node.name, kind: metadataKind(node), sourceType: node.sourceType,
    type: node.type, children: new Map() };
}
function projectionSchema(metadata) {
  const byPiece = indexMetadata(metadata);
  const root = { name: "$study", kind: "OBJECT", sourceType: "STRUCT", type: "Study",
    children: new Map() };
  function addPath(pathNodes) {
    let cursor = root;
    for (const metadataNode of pathNodes) {
      const existing = cursor.children.get(metadataNode.name);
      if (existing && (existing.type !== metadataNode.type
        || existing.sourceType !== metadataNode.sourceType)) {
        throw new Error(`CLINICALTRIALS_METADATA_PATH_CONFLICT:${metadataNode.piece}`);
      }
      const child = existing ?? schemaNodeFromMetadata(metadataNode);
      cursor.children.set(metadataNode.name, child);
      cursor = child;
    }
  }
  function addDescendants(info) {
    addPath(info.path);
    const descendants = info.node.children ?? [];
    for (const child of descendants) {
      const childInfo = byPiece.get(child.piece);
      addDescendants(childInfo);
    }
  }
  for (const piece of CLINICALTRIALS_FIXED_FIELDS) {
    const info = byPiece.get(piece);
    if (!info) throw new Error(`CLINICALTRIALS_METADATA_PROJECTED_PIECE_MISSING:${piece}`);
    if (info.kind === "OBJECT" || info.kind === "OBJECT_ARRAY") addDescendants(info);
    else addPath(info.path);
  }
  return root;
}
function validatePrimitive(value, node, code) {
  const scalarType = node.type.endsWith("[]") ? node.type.slice(0, -2) : node.type;
  if (node.sourceType === "BOOLEAN" || node.sourceType.startsWith("FUNC ")
    || scalarType === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${code}_BOOLEAN_INVALID:${node.name}`);
  } else if (node.sourceType === "NUMERIC"
    || ["integer", "number", "float", "double", "long", "short"].includes(scalarType)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${code}_NUMBER_INVALID:${node.name}`);
    }
  } else if (typeof value !== "string" || value.length > MAX_STRING_LENGTH
    || /\u0000/u.test(value)) {
    throw new Error(`${code}_STRING_INVALID:${node.name}`);
  }
}
function validateProjection(value, node, code, depth = 0) {
  if (depth > 64) throw new Error(`${code}_NESTING_TOO_DEEP`);
  if (node.kind === "OBJECT") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${code}_OBJECT_INVALID:${node.name}`);
    }
    for (const key of Object.keys(value)) {
      const child = node.children.get(key);
      if (!child) throw new Error(`${code}_UNKNOWN_FIELD:${key}`);
      validateProjection(value[key], child, code, depth + 1);
    }
    return;
  }
  if (node.kind === "OBJECT_ARRAY") {
    if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) {
      throw new Error(`${code}_OBJECT_ARRAY_INVALID:${node.name}`);
    }
    const itemNode = { ...node, kind: "OBJECT" };
    for (const item of value) validateProjection(item, itemNode, code, depth + 1);
    return;
  }
  if (node.kind === "PRIMITIVE_ARRAY") {
    if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) {
      throw new Error(`${code}_PRIMITIVE_ARRAY_INVALID:${node.name}`);
    }
    for (const item of value) validatePrimitive(item, node, code);
    return;
  }
  validatePrimitive(value, node, code);
}

function assertPrivacyProjection(value, pathParts = [], depth = 0) {
  if (depth > 64) throw new Error("CLINICALTRIALS_PRIVACY_SCAN_NESTING_TOO_DEEP");
  if (Array.isArray(value)) {
    for (const item of value) assertPrivacyProjection(item, pathParts, depth + 1);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:contact|location)|(?:Contact|Location|EMail|Email|Phone|Investigator|OfficialTitle|Document|IPD)/u
        .test(key)) throw new Error(`CLINICALTRIALS_PRIVACY_FIELD_FORBIDDEN:${key}`);
      assertPrivacyProjection(item, [...pathParts, key], depth + 1);
    }
    return;
  }
  if (typeof value === "string"
    && (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(value)
      || /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/u.test(value))) {
    throw new Error(`CLINICALTRIALS_PRIVACY_CONTACT_VALUE_FORBIDDEN:${pathParts.join(".")}`);
  }
}

function pageFiles() {
  return CLINICALTRIALS_FROZEN_SOURCE_20260822.files.filter((file) => file.kind === "FIXED_QUERY_PAGE");
}
function parseSource(files) {
  const version = parseJson(files["api-version.json"], "CLINICALTRIALS_VERSION");
  if (!exactKeys(version, ["apiVersion", "dataTimestamp"])
    || version.apiVersion !== CLINICALTRIALS_API_VERSION
    || version.dataTimestamp !== CLINICALTRIALS_DATA_TIMESTAMP) {
    throw new Error("CLINICALTRIALS_VERSION_PROFILE_INVALID");
  }
  const metadata = parseJson(files["studies-metadata.json"], "CLINICALTRIALS_METADATA");
  const schema = projectionSchema(metadata);
  const searchAreas = parseJson(files["studies-search-areas.json"], "CLINICALTRIALS_SEARCH_AREAS");
  if (!Array.isArray(searchAreas) || searchAreas.length === 0) {
    throw new Error("CLINICALTRIALS_SEARCH_AREAS_PROFILE_INVALID");
  }
  const pages = [];
  for (const expected of pageFiles()) {
    const page = parseJson(files[expected.name], `CLINICALTRIALS_PAGE_${expected.page}`);
    if (!exactKeys(page, expected.expectedTopLevelKeys)
      || !Array.isArray(page.studies) || page.studies.length !== expected.expectedRows) {
      throw new Error(`CLINICALTRIALS_PAGE_PROFILE_INVALID:${expected.page}`);
    }
    if (expected.page === 1 && page.totalCount !== EXPECTED_STUDIES) {
      throw new Error("CLINICALTRIALS_TOTAL_COUNT_INVALID");
    }
    if ((page.nextPageToken ?? null) !== expected.expectedNextPageToken) {
      throw new Error(`CLINICALTRIALS_PAGINATION_TOKEN_INVALID:${expected.page}`);
    }
    for (const study of page.studies) {
      validateProjection(study, schema, "CLINICALTRIALS_STUDY");
      assertPrivacyProjection(study);
    }
    pages.push(page);
  }
  const studies = pages.flatMap((page) => page.studies);
  if (studies.length !== EXPECTED_STUDIES) throw new Error("CLINICALTRIALS_POPULATION_SIZE_INVALID");
  const nctIds = studies.map((study) => study.protocolSection?.identificationModule?.nctId);
  if (nctIds.some((id) => !/^NCT\d{8}$/u.test(id)) || new Set(nctIds).size !== nctIds.length) {
    throw new Error("CLINICALTRIALS_NCT_ID_INVALID");
  }
  const studyFirstPosts = [];
  for (const study of studies) {
    const status = study.protocolSection?.statusModule;
    if (study.hasResults !== true || !study.resultsSection
      || status?.resultsFirstPostDateStruct?.date !== CLINICALTRIALS_RESULTS_FIRST_POSTED_WINDOW.from) {
      throw new Error(`CLINICALTRIALS_POPULATION_MEMBERSHIP_INVALID:${study.protocolSection.identificationModule.nctId}`);
    }
    const firstPost = status.studyFirstPostDateStruct?.date;
    if (typeof firstPost !== "string") throw new Error("CLINICALTRIALS_SORT_KEY_MISSING");
    studyFirstPosts.push(firstPost);
  }
  for (let index = 1; index < studyFirstPosts.length; index += 1) {
    if (studyFirstPosts[index - 1].localeCompare(studyFirstPosts[index]) > 0) {
      throw new Error("CLINICALTRIALS_SORT_ORDER_INVALID");
    }
  }
  return { version, metadata, searchAreas, pages, studies, nctIds, studyFirstPosts };
}

function array(value) { return Array.isArray(value) ? value : []; }
function nonnegativeInteger(value, code) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${code}_INVALID`);
  return value;
}
function dateValue(struct) { return typeof struct?.date === "string" ? struct.date : null; }
function studySummary(study) {
  const protocol = study.protocolSection;
  const status = protocol.statusModule ?? {};
  const design = protocol.designModule ?? {};
  const designInfo = design.designInfo ?? {};
  const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor ?? {};
  const results = study.resultsSection ?? {};
  const flow = results.participantFlowModule;
  const baseline = results.baselineCharacteristicsModule;
  const outcomes = results.outcomeMeasuresModule;
  const adverse = results.adverseEventsModule;
  const eventGroups = array(adverse?.eventGroups).map((group) => ({
    groupId: group.id ?? null,
    title: group.title ?? null,
    deathsNumAffected: nonnegativeInteger(group.deathsNumAffected, "CLINICALTRIALS_DEATHS_AFFECTED"),
    deathsNumAtRisk: nonnegativeInteger(group.deathsNumAtRisk, "CLINICALTRIALS_DEATHS_AT_RISK"),
    seriousNumAffected: nonnegativeInteger(group.seriousNumAffected, "CLINICALTRIALS_SERIOUS_AFFECTED"),
    seriousNumAtRisk: nonnegativeInteger(group.seriousNumAtRisk, "CLINICALTRIALS_SERIOUS_AT_RISK"),
    otherNumAffected: nonnegativeInteger(group.otherNumAffected, "CLINICALTRIALS_OTHER_AFFECTED"),
    otherNumAtRisk: nonnegativeInteger(group.otherNumAtRisk, "CLINICALTRIALS_OTHER_AT_RISK"),
  }));
  const nctId = protocol.identificationModule.nctId;
  // LeadSponsorName remains in the frozen API field list because those exact
  // request URLs and source bytes are already pinned.  It is deliberately not
  // copied, hashed, or otherwise committed into the derived artifact: a lead
  // sponsor can be an individual rather than an organization.
  const privacyMinimizedRecord = {
    postedDates: {
      studyFirstPosted: dateValue(status.studyFirstPostDateStruct),
      resultsFirstPosted: dateValue(status.resultsFirstPostDateStruct),
      lastUpdatePosted: dateValue(status.lastUpdatePostDateStruct),
    },
    registration: {
      overallStatus: status.overallStatus ?? null,
      studyType: design.studyType ?? null,
      phases: array(design.phases),
      conditions: array(protocol.conditionsModule?.conditions),
      leadSponsorClass: sponsor.class ?? null,
      enrollmentCount: nonnegativeInteger(design.enrollmentInfo?.count,
        "CLINICALTRIALS_ENROLLMENT_COUNT"),
      enrollmentType: design.enrollmentInfo?.type ?? null,
      allocation: designInfo.allocation ?? null,
      interventionModel: designInfo.interventionModel ?? null,
      primaryPurpose: designInfo.primaryPurpose ?? null,
      masking: designInfo.maskingInfo?.masking ?? null,
      registeredArmGroups: array(protocol.armsInterventionsModule?.armGroups).length,
      registeredInterventions: array(protocol.armsInterventionsModule?.interventions).length,
      registeredPrimaryOutcomes: array(protocol.outcomesModule?.primaryOutcomes).length,
      registeredSecondaryOutcomes: array(protocol.outcomesModule?.secondaryOutcomes).length,
    },
    postedAggregateResults: {
      participantFlowPresent: Boolean(flow),
      participantFlowGroups: array(flow?.groups).length,
      participantFlowPeriods: array(flow?.periods).length,
      baselineCharacteristicsPresent: Boolean(baseline),
      baselineGroups: array(baseline?.groups).length,
      baselineMeasures: array(baseline?.measures).length,
      outcomeMeasuresPresent: Boolean(outcomes),
      outcomeMeasures: array(outcomes?.outcomeMeasures).length,
      outcomeAnalyses: array(outcomes?.outcomeMeasures)
        .reduce((total, outcome) => total + array(outcome.analyses).length, 0),
      adverseEventsPresent: Boolean(adverse),
      adverseEventGroups: eventGroups,
      seriousAdverseEventTerms: array(adverse?.seriousEvents).length,
      otherAdverseEventTerms: array(adverse?.otherEvents).length,
      adverseEventFrequencyThreshold: adverse?.frequencyThreshold ?? null,
      adverseEventTimeFrame: adverse?.timeFrame ?? null,
    },
    interpretationBoundary: {
      sponsorOrInvestigatorPostedAggregateRecord: true,
      nlmQcIsScientificAccuracyReview: false,
      independentAdjudicationEstablished: false,
      interventionCausalityEstablished: false,
      individualParticipantDataPresent: false,
      economicLossObserved: false,
      targetTransferEstablished: false,
    },
  };
  return {
    nctId,
    studyUrl: `https://clinicaltrials.gov/study/${nctId}`,
    studyRecordSemanticCommitment: digest({
      domain: "clinicaltrials/privacy-minimized-study-record/v1",
      nctId,
      value: privacyMinimizedRecord,
    }),
    ...privacyMinimizedRecord,
  };
}
function sortedCounts(values) {
  const counts = {};
  for (const value of values) counts[value ?? "__MISSING__"] = (counts[value ?? "__MISSING__"] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function buildArtifact(files, { official }) {
  const parsed = parseSource(files);
  const records = parsed.studies.map(studySummary);
  const sourcePinsMatched = officialPinsMatch(files);
  const sourceFileProfile = CLINICALTRIALS_FROZEN_SOURCE_20260822.files.map((expected) => ({
    name: expected.name, kind: expected.kind, url: expected.url,
    bytes: files[expected.name].length, sha256: sha256(files[expected.name]),
  }));
  const withPostedAdverseEvents = records.filter((record) => (
    record.postedAggregateResults.adverseEventsPresent
  )).length;
  const withOutcomeMeasures = records.filter((record) => (
    record.postedAggregateResults.outcomeMeasuresPresent
  )).length;
  const artifact = {
    schema: CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA,
    generatedAt: CLINICALTRIALS_FROZEN_AT,
    source: {
      sourceId: CLINICALTRIALS_FROZEN_SOURCE_20260822.sourceId,
      publisher: "UNITED_STATES_NATIONAL_LIBRARY_OF_MEDICINE_CLINICALTRIALS_GOV",
      capturedAt: official ? CLINICALTRIALS_FROZEN_AT : null,
      apiVersion: parsed.version.apiVersion,
      dataTimestamp: parsed.version.dataTimestamp,
      profileMatchedAtBuild: official && sourcePinsMatched,
      callerBytesMatchedFrozenPins: sourcePinsMatched,
      sourceReality: official && sourcePinsMatched
        ? "REAL_OFFICIAL_CLINICALTRIALS_GOV_EXACT_API_CAPTURE"
        : "UNATTESTED_CALLER_BYTES",
      sourceFiles: sourceFileProfile,
      sourceSetHash: digest({ domain: "clinicaltrials/source-set/v1", files: sourceFileProfile }),
      officialReferences: {
        api: "https://clinicaltrials.gov/data-api/api",
        studyDataStructure: "https://clinicaltrials.gov/data-api/about-api/study-data-structure",
        termsAndConditions: "https://clinicaltrials.gov/about-site/terms-conditions",
        disclaimer: "https://clinicaltrials.gov/about-site/disclaimer",
        resultsDefinitions: "https://clinicaltrials.gov/policy/results-definitions",
      },
      rightsReferenceScope: {
        termsAndConditionsUrlOnlyNotReplayed: true,
        disclaimerUrlOnlyNotReplayed: true,
        rightsTermsSourceReplayed: false,
      },
      documentedOpenApiSpecificationUrl:
        "https://clinicaltrials.gov/api/oas/v2/ctg-oas-v2.yaml",
      documentedOpenApiSpecificationRetrieved: false,
      documentedOpenApiSpecificationCaptureStatus: "HTTP_404_AT_CAPTURE_NOT_USED_AS_SCHEMA_SOURCE",
    },
    query: {
      endpoint: "https://clinicaltrials.gov/api/v2/studies",
      format: "json",
      queryTerm: CLINICALTRIALS_QUERY_TERM,
      resultsFirstPostedWindow: { ...CLINICALTRIALS_RESULTS_FIRST_POSTED_WINDOW },
      fields: [...CLINICALTRIALS_FIXED_FIELDS],
      excludedFieldClasses: [
        "CONTACTS", "INVESTIGATOR_NAMES", "EMAIL", "PHONE", "LOCATIONS",
        "INDIVIDUAL_PARTICIPANT_DATA", "DOCUMENTS", "IPD_SHARING_URL",
      ],
      sort: CLINICALTRIALS_SORT,
      pageSize: CLINICALTRIALS_PAGE_SIZE,
      countTotal: true,
      pageCount: parsed.pages.length,
      pageRows: parsed.pages.map((page) => page.studies.length),
      requestUrls: pageFiles().map((page) => page.url),
      requestPageTokens: pageFiles().map((page) => page.requestPageToken),
      responseNextPageTokens: pageFiles().map((page) => page.expectedNextPageToken),
      paginationChainComplete: true,
    },
    population: {
      unit: "CLINICALTRIALS_GOV_STUDY_RECORD_WITH_POSTED_AGGREGATE_RESULTS",
      selection: "ALL_RECORDS_WITH_RESULTS_FIRST_POSTED_ON_2026_07_01_AT_FROZEN_DATA_TIMESTAMP",
      expectedTotalCount: EXPECTED_STUDIES,
      observedStudyRecords: records.length,
      uniqueNctIds: new Set(records.map((record) => record.nctId)).size,
      completeClosedQueryWindow: true,
      allHavePostedResultsFlag: parsed.studies.every((study) => study.hasResults === true),
      allResultsFirstPostedInsideWindow: records.every((record) => (
        record.postedDates.resultsFirstPosted === CLINICALTRIALS_RESULTS_FIRST_POSTED_WINDOW.from
      )),
      explicitSortVerified: true,
      nctIds: records.map((record) => record.nctId),
      orderedPopulationCommitment: digest(records.map((record) => ({
        nctId: record.nctId, commitment: record.studyRecordSemanticCommitment,
      }))),
    },
    realPostedExperience: {
      records,
      studyTypeCounts: sortedCounts(records.map((record) => record.registration.studyType)),
      overallStatusCounts: sortedCounts(records.map((record) => record.registration.overallStatus)),
      sponsorClassCounts: sortedCounts(records.map((record) => record.registration.leadSponsorClass)),
      studiesWithPostedOutcomeMeasures: withOutcomeMeasures,
      studiesWithPostedAdverseEvents: withPostedAdverseEvents,
      totalPostedOutcomeMeasureRows: records.reduce((total, record) => (
        total + record.postedAggregateResults.outcomeMeasures
      ), 0),
      totalPostedSeriousAdverseEventTermRows: records.reduce((total, record) => (
        total + record.postedAggregateResults.seriousAdverseEventTerms
      ), 0),
      totalPostedOtherAdverseEventTermRows: records.reduce((total, record) => (
        total + record.postedAggregateResults.otherAdverseEventTerms
      ), 0),
      crossStudyAffectedCountsPooled: false,
      crossStudyRatesCalculated: false,
      registrationEnrollmentTreatedAsUniformAdverseEventExposure: false,
    },
    quality: {
      dataAreRealPostedRegistryAndAggregateResultRecords: official && sourcePinsMatched,
      publicAcquisitionDoesNotDowngradeReality: true,
      sponsorOrInvestigatorIsResponsibleForSubmittedAccuracy: true,
      nlmQcChecksApparentValidityMeaningLogicConsistencyAndFormatting: true,
      nlmQcEstablishesScientificAccuracy: false,
      resultRecordsMayBeUpdatedAfterInitialPosting: true,
      frozenTimestampAndExactBytesPreserveHistoricalReproducibility: true,
      completePopulationAtFrozenTimestamp: official && sourcePinsMatched,
      pageTokensAndPageBodiesExactlyPinned: official && sourcePinsMatched,
      officialFieldMetadataExactlyPinned: official && sourcePinsMatched,
      unknownProjectedFieldsRejected: true,
      contactsAndLocationsRequested: false,
      individualParticipantDataRequested: false,
      privacyProjectionValidatedAgainstDirectContactKeysAndValues: true,
      projectedDirectContactLikeValuesDetected: false,
      sponsorNamesPersistedInDerivedArtifact: false,
      personNamesPersistedInDerivedArtifact: false,
      rawSourceMayContainPublicSponsorOrInvestigatorNames: true,
      derivedArtifactNameRiskReviewApplied: true,
      aggregateResultFreeTextRemainsSponsorSupplied: true,
      sourceTransportCryptographicallyAttested: false,
    },
    ontology: {
      recordIsRealClinicalTrialsGovPosting: true,
      postingIsSponsorOrInvestigatorSuppliedAggregateStudyRecord: true,
      postingIsIndependentOutcomeAdjudication: false,
      adverseEventTemporalOccurrenceProvesInterventionCausality: false,
      enrollmentIsTargetSystemExposure: false,
      clinicalOutcomeIsEconomicLoss: false,
      nlmQualityControlIsScientificPeerReview: false,
      nctIdIdentifiesParticipant: false,
    },
    rights: {
      termsAndConditionsUrl: "https://clinicaltrials.gov/about-site/terms-conditions",
      disclaimerUrl: "https://clinicaltrials.gov/about-site/disclaimer",
      rightsTermsSourceReplayed: false,
      rightsDetermination: "NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED",
      dataAvailabilityTermsEstablishedByThisArtifact: false,
      attributionRequirementEstablishedByThisArtifact: false,
      processedDateRequirementEstablishedByThisArtifact: false,
      modificationDisclosureRequirementEstablishedByThisArtifact: false,
      emailMarketingRestrictionEstablishedByThisArtifact: false,
      thirdPartyCopyrightStatusEstablishedByThisArtifact: false,
      requestedEmailAddresses: false,
      automaticBehaviorModelTrainingRightConcluded: false,
      modelTrainingAllowedByThisArtifact: false,
    },
    calibrationReference: {
      decision: official && sourcePinsMatched
        ? "ADMIT_REAL_SPONSOR_POSTED_AGGREGATE_REFERENCE_ONLY"
        : "REJECT_UNATTESTED_FIXTURE",
      admittedStudyRecords: official && sourcePinsMatched ? records.length : 0,
      postedOutcomeSensingReferenceEstablished: official && sourcePinsMatched,
      independentAdjudicationEstablished: false,
      causalEffectEstablished: false,
      affectedPartyReceiptEstablished: false,
      economicLossEstablished: false,
      targetDomainTransferEstablished: false,
      actualOutsiderModelCalibrated: false,
      requiredBeforeTargetUse: [
        "INDEPENDENT_OUTCOME_ADJUDICATION_OR_VALIDATED_LABEL_CONTRACT",
        "TARGET_DOMAIN_AND_REPORTING_REGIME_MATCH",
        "PROSPECTIVE_HOLDOUT_DECLARED_BEFORE_OUTCOMES",
        "TRAINING_AND_REUSE_RIGHTS_CLEARANCE",
        "TARGET_EXPOSURE_LOSS_AND_DEPENDENCE_LINKAGE",
      ],
    },
    trainingCandidate: {
      sourceStudyRecords: official && sourcePinsMatched ? records.length : 0,
      admittedTrainingRows: 0,
      automaticTraining: false,
      reason: "POSTED_AGGREGATE_REFERENCE_NOT_A_CLEARED_TARGET_BEHAVIOR_LABEL_DATASET",
    },
    stageProgress: {
      stage0_5SourceContractAndExactReplayReference: official && sourcePinsMatched,
      stage1RealCaseRegistryReferences: official && sourcePinsMatched ? records.length : 0,
      stage1_5PostedAggregateOutcomeSensingReferences:
        official && sourcePinsMatched ? withOutcomeMeasures : 0,
      stage2PostedAdverseEventReferenceStudies:
        official && sourcePinsMatched ? withPostedAdverseEvents : 0,
      stage2TargetExposureLossPairs: 0,
      stage3GuaranteeCases: 0,
      stage4PaymentRemedyRecoveryCases: 0,
      realityStewardshipTargetControlLoops: 0,
    },
    authority: {
      TRAIN: false,
      PRICE: false,
      UNDERWRITE: false,
      CAPITAL: false,
      COVERAGE: false,
      SETTLE: false,
      GUARANTEE: false,
    },
    readyToTakeResponsibility: false,
  };
  return { ...artifact, artifactHash: artifactDigest(artifact) };
}

function validateOptions(options) {
  if (options === undefined) return;
  if (!exactKeys(options, ["generatedAt"])) throw new Error("CLINICALTRIALS_BUILD_OPTIONS_INVALID");
  canonicalTime(options.generatedAt, "CLINICALTRIALS_GENERATED_AT");
}

export function buildClinicalTrialsPostedResultsEvidenceFromBytes(files, options) {
  validateOptions(options);
  assertInputFiles(files);
  return buildArtifact(files, { official: false });
}

export function buildClinicalTrialsPostedResultsEvidenceFromSourceDirectory(sourceDirectory, options) {
  validateOptions(options);
  const files = stableReadSourceDirectory(sourceDirectory);
  return buildArtifact(files, { official: true });
}

export function verifyClinicalTrialsPostedResultsEvidence(artifact) {
  const errors = [];
  if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { ok: false, verificationLevel: "FIXED_CANONICAL_PROJECTION_FAILED",
      sourceArtifactsReverified: false, errors: ["ARTIFACT_INVALID"] };
  }
  const { artifactHash, ...withoutHash } = artifact;
  let computed = null;
  let shapeHash = null;
  try {
    computed = artifactDigest(withoutHash);
    shapeHash = clinicalTrialsPostedResultsStructuralShapeHash(artifact);
  } catch {
    errors.push("ARTIFACT_CANONICALIZATION_INVALID");
  }
  if (artifact.schema !== CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA) errors.push("SCHEMA_INVALID");
  if (artifactHash !== computed) errors.push("ARTIFACT_HASH_INVALID");
  if (computed !== CANONICAL_ARTIFACT_HASH) errors.push("NOT_CANONICAL_FIXED_PROJECTION");
  if (shapeHash !== CANONICAL_STRUCTURAL_SHAPE_HASH) errors.push("STRUCTURAL_SHAPE_INVALID");
  return {
    ok: errors.length === 0,
    verificationLevel: errors.length === 0
      ? "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION"
      : "FIXED_CANONICAL_PROJECTION_FAILED",
    sourceArtifactsReverified: false,
    artifactHash: errors.length === 0 ? artifactHash : null,
    realPostedExperienceAdmissionEstablished: false,
    independentOutcomeTruthEstablished: false,
    targetTransferEstablished: false,
    trainingAllowed: false,
    authorityEstablished: false,
    errors,
  };
}

export function verifyClinicalTrialsPostedResultsEvidenceWithSource(artifact, sourceDirectory) {
  let rebuilt;
  try { rebuilt = buildClinicalTrialsPostedResultsEvidenceFromSourceDirectory(sourceDirectory); }
  catch (error) {
    return {
      ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false, candidateArtifactExactlyRebuilt: false,
      realPostedExperienceAdmissionEstablished: false,
      independentOutcomeTruthEstablished: false, targetTransferEstablished: false,
      trainingAllowed: false, authorityEstablished: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
  let exact = false;
  try { exact = canonicalizeStrict(artifact) === canonicalizeStrict(rebuilt); }
  catch { exact = false; }
  const fixed = verifyClinicalTrialsPostedResultsEvidence(rebuilt);
  return {
    ok: exact && fixed.ok,
    verificationLevel: exact && fixed.ok
      ? "FULL_EXACT_OFFICIAL_DATA_API_SOURCE_REPLAY_RIGHTS_TERMS_NOT_REPLAYED"
      : "FULL_SOURCE_REPLAY_FAILED",
    sourceArtifactsReverified: true,
    sourceProfileReproduced: true,
    dataApiSourceProfileReproduced: true,
    rightsTermsSourceReplayed: false,
    candidateArtifactExactlyRebuilt: exact,
    artifactHash: exact && fixed.ok ? rebuilt.artifactHash : null,
    realPostedExperienceAdmissionEstablished: exact && fixed.ok,
    independentOutcomeTruthEstablished: false,
    targetTransferEstablished: false,
    trainingAllowed: false,
    authorityEstablished: false,
    errors: exact && fixed.ok ? [] : [exact ? "CANONICAL_PROJECTION_INVALID" : "CANDIDATE_REBUILD_MISMATCH"],
  };
}
