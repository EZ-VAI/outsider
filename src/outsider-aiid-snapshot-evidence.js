/*
 * AI Incident Database licensed-collection projection.
 *
 * The official snapshot contains both CC BY-SA collections and explicitly
 * excluded content.  This adapter opens only the allowlisted incidents, taxa,
 * classifications, and entities BSON members.  It never reads reports.bson,
 * submissions.bson, reports.csv, or submissions.csv.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdtempSync,
  openSync, readFileSync, readdirSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { canonicalizePinnedLegacyEvidence } from
  "./outsider-pinned-legacy-evidence-canonical.js";

export const AIID_SNAPSHOT_EVIDENCE_SCHEMA = "outsider/aiid-snapshot-evidence/v1";
export const AIID_SNAPSHOT_DIFF_SCHEMA = "outsider/aiid-snapshot-evidence-diff/v1";

export const AIID_FROZEN_SOURCE_20260817 = Object.freeze({
  sourceId: "AI_INCIDENT_DATABASE_LICENSED_COLLECTIONS",
  snapshotPageUrl: "https://incidentdatabase.ai/research/snapshots/",
  termsUrl: "https://incidentdatabase.ai/terms-of-use/",
  archiveUrl: "https://pub-72b2b2fc36ec423189843747af98f80e.r2.dev/backup-20260817101120.tar.bz2",
  archiveName: "backup-20260817101120.tar.bz2",
  archiveBytes: 108_531_086,
  archiveSha256: "sha256:77d0971443e3e100fc0a79662a57fdf3cfbbd6a4fcea74ee6e6155e0ea4b7913",
  snapshotAt: "2026-08-17T10:11:20.000Z",
  termsSnapshotName: "terms-of-use-20260821.html",
  termsSnapshotBytes: 344_822,
  termsSnapshotSha256: "sha256:661559de6390ffe0103d498ce99cf11bcad456df63c1b972bb917845174dbf92",
  termsCapturedAt: "2026-08-21T00:00:00.000Z",
  termsEffectiveAt: "2025-08-07",
});

export const AIID_ALLOWED_COLLECTIONS = Object.freeze([
  "incidents", "taxa", "classifications", "entities",
]);

const AIID_ARCHIVE_ROOT = "mongodump_full_snapshot";
const AIID_DATABASE_ROOT = `${AIID_ARCHIVE_ROOT}/aiidprod`;

export const AIID_ALLOWED_MEMBERS = Object.freeze([
  `${AIID_ARCHIVE_ROOT}/license.txt`,
  ...AIID_ALLOWED_COLLECTIONS.flatMap((collection) => [
    `${AIID_DATABASE_ROOT}/${collection}.bson`,
    `${AIID_DATABASE_ROOT}/${collection}.metadata.json`,
  ]),
]);

export const AIID_FORBIDDEN_MEMBERS = Object.freeze([
  `${AIID_DATABASE_ROOT}/reports.bson`,
  `${AIID_DATABASE_ROOT}/submissions.bson`,
  `${AIID_ARCHIVE_ROOT}/reports.csv`,
  `${AIID_ARCHIVE_ROOT}/submissions.csv`,
]);

export const AIID_OFFICIAL_ALLOWED_MEMBER_COMMITMENTS_20260817 = Object.freeze({
  [`${AIID_ARCHIVE_ROOT}/license.txt`]: Object.freeze({
    bytes: 193,
    sha256: "sha256:ea4f9baa0524469b56b2b899b58d509d224ff67f00cd6ecaa059b2590def1295",
  }),
  [`${AIID_DATABASE_ROOT}/incidents.bson`]: Object.freeze({
    bytes: 18_660_922,
    sha256: "sha256:cf39eb9c21fabf1943dd790a6c81def607c9e09021adabfd24c0843b3fb9dbc7",
  }),
  [`${AIID_DATABASE_ROOT}/incidents.metadata.json`]: Object.freeze({
    bytes: 543,
    sha256: "sha256:d48b7e41d97f9a5fd18df95b89fa2f0532929257d4055bdbcc7993e4110baee6",
  }),
  [`${AIID_DATABASE_ROOT}/taxa.bson`]: Object.freeze({
    bytes: 302_256,
    sha256: "sha256:cfbd9db41f894405c756447a5f03f0fc07845d22fa94219c397b6329eb9e7ee8",
  }),
  [`${AIID_DATABASE_ROOT}/taxa.metadata.json`]: Object.freeze({
    bytes: 171,
    sha256: "sha256:a9722d0245d4192fea570ca27bae5430de2e9f072169eb74a93d04d0ce03bfb6",
  }),
  [`${AIID_DATABASE_ROOT}/classifications.bson`]: Object.freeze({
    bytes: 7_709_993,
    sha256: "sha256:933383b859d4e00ed3fcff086bac2c1e69650f0cb16bf0c94a3ca33bb7519160",
  }),
  [`${AIID_DATABASE_ROOT}/classifications.metadata.json`]: Object.freeze({
    bytes: 287,
    sha256: "sha256:7ed29d971333cbf673e47b15cff89b41fc362b054682ab2af2fb63efe5deecfb",
  }),
  [`${AIID_DATABASE_ROOT}/entities.bson`]: Object.freeze({
    bytes: 770_265,
    sha256: "sha256:9771cfdbf5f4d21cdf0fe64efb026972c0a3328f129f4e765ca830a8b0b2d6a8",
  }),
  [`${AIID_DATABASE_ROOT}/entities.metadata.json`]: Object.freeze({
    bytes: 277,
    sha256: "sha256:2838ad808b2dce91d24732cde290673ecee7a94a0c25d6409c0f8d2d63e9c387",
  }),
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const OFFICIAL_SOURCE_REPLAY_TOKEN = Symbol("outsider.aiid.official-source-replay");
const MAX_ARCHIVE_BYTES = 192 * 1024 * 1024;
const MAX_BSON_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MAX_BSON_DEPTH = 64;
const AIID_FROZEN_COUNTS_20260817 = Object.freeze({
  incidentDocuments: 1_632, incidentProjections: 1_632, incidentReportReferences: 6_432,
  taxonomyDocuments: 7, taxonomySourceFields: 303, taxonomyExplicitPublicFields: 219,
  taxonomyExplicitPrivateFields: 20, taxonomyUnmarkedFields: 64,
  classificationDocuments: 2_623, publishedClassificationDocuments: 2_307,
  unpublishedClassificationDocuments: 316, admittedClassificationProjections: 2_307,
  admittedPublicClassificationAttributes: 40_319,
  droppedNonPublicClassificationAttributes: 11_732,
  invalidClassificationValueJsonHashed: 0, missingClassificationValueJson: 1_787,
  classificationIncidentReferences: 2_307, classificationIncidentReferencesJoined: 2_307,
  classificationIncidentReferencesUnjoined: 0, entityDocuments: 7_016,
  entityProjections: 7_016, entitiesWithId: 7_015, entitiesWithName: 7_015,
  incidentEntityRoleReferences: 15_316, incidentEntityRoleReferencesJoined: 15_283,
  incidentEntityRoleReferencesUnjoined: 33,
});

function fail(code, detail = null) {
  throw new Error(detail == null ? `AIID_SNAPSHOT_${code}` : `AIID_SNAPSHOT_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256(`${domain}\0${typeof value === "string" ? value
    : canonicalizeStrict(value)}`);
}

/* The frozen 2026-08-17 AIID projection predates the ordinary 65,536-member
 * trust-boundary ceiling and contains more members than that ceiling permits.
 * Keep the compatibility exception confined to the already bounded whole
 * artifact serialization.  Individual caller-controlled records and every
 * new subrecord continue through canonicalizeStrict(). */
function boundedFrozenArtifactHash(domain, value) {
  return sha256(`${domain}\0${typeof value === "string" ? value
    : canonicalizePinnedLegacyEvidence(value)}`);
}

function sameBoundedFrozenArtifact(left, right) {
  return canonicalizePinnedLegacyEvidence(left)
    === canonicalizePinnedLegacyEvidence(right);
}

function ensure(buffer, offset, size, end, code = "BSON_TRUNCATED") {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || size < 0
    || offset < 0 || offset + size > end || offset + size > buffer.length) fail(code);
}

function cstring(buffer, offset, end) {
  const zero = buffer.indexOf(0, offset);
  if (zero < offset || zero >= end) fail("BSON_CSTRING_INVALID");
  return { value: buffer.subarray(offset, zero).toString("utf8"), offset: zero + 1 };
}

function int64(buffer, offset, end) {
  ensure(buffer, offset, 8, end);
  const value = buffer.readBigInt64LE(offset);
  return { value: value <= BigInt(Number.MAX_SAFE_INTEGER)
      && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString(),
    offset: offset + 8 };
}

function parseBsonValue(type, buffer, offset, end, depth) {
  if (depth > MAX_BSON_DEPTH) fail("BSON_DEPTH_INVALID");
  if (type === 0x01) { ensure(buffer, offset, 8, end); return {
    value: buffer.readDoubleLE(offset), offset: offset + 8 }; }
  if ([0x02, 0x0d, 0x0e].includes(type)) {
    ensure(buffer, offset, 4, end); const length = buffer.readInt32LE(offset);
    if (length < 1) fail("BSON_STRING_LENGTH_INVALID");
    ensure(buffer, offset + 4, length, end);
    if (buffer[offset + 3 + length] !== 0) fail("BSON_STRING_TERMINATOR_INVALID");
    return { value: buffer.subarray(offset + 4, offset + 3 + length).toString("utf8"),
      offset: offset + 4 + length };
  }
  if (type === 0x03 || type === 0x04) {
    const parsed = parseBsonDocument(buffer, offset, end, depth + 1, type === 0x04);
    return { value: parsed.value, offset: parsed.offset };
  }
  if (type === 0x05) {
    ensure(buffer, offset, 5, end); const length = buffer.readInt32LE(offset);
    if (length < 0) fail("BSON_BINARY_LENGTH_INVALID");
    ensure(buffer, offset + 5, length, end);
    return { value: { $binary: buffer.subarray(offset + 5, offset + 5 + length).toString("base64"),
      subtype: buffer[offset + 4] }, offset: offset + 5 + length };
  }
  if (type === 0x06) return { value: { $undefined: true }, offset };
  if (type === 0x07) { ensure(buffer, offset, 12, end); return {
    value: { $oid: buffer.subarray(offset, offset + 12).toString("hex") }, offset: offset + 12 }; }
  if (type === 0x08) { ensure(buffer, offset, 1, end); if (![0, 1].includes(buffer[offset])) {
    fail("BSON_BOOLEAN_INVALID");
  } return { value: buffer[offset] === 1, offset: offset + 1 }; }
  if (type === 0x09) {
    const parsed = int64(buffer, offset, end);
    const millis = typeof parsed.value === "number" ? parsed.value : Number(parsed.value);
    if (!Number.isFinite(millis)) fail("BSON_DATE_INVALID");
    const date = new Date(millis);
    if (!Number.isFinite(date.getTime())) fail("BSON_DATE_INVALID");
    return { value: { $date: date.toISOString() }, offset: parsed.offset };
  }
  if (type === 0x0a) return { value: null, offset };
  if (type === 0x0b) {
    const pattern = cstring(buffer, offset, end); const options = cstring(buffer, pattern.offset, end);
    return { value: { $regex: pattern.value, $options: options.value }, offset: options.offset };
  }
  if (type === 0x0c) {
    const namespace = parseBsonValue(0x02, buffer, offset, end, depth);
    ensure(buffer, namespace.offset, 12, end);
    return { value: { $dbPointer: { namespace: namespace.value,
      id: buffer.subarray(namespace.offset, namespace.offset + 12).toString("hex") } },
      offset: namespace.offset + 12 };
  }
  if (type === 0x0f) {
    ensure(buffer, offset, 4, end); const total = buffer.readInt32LE(offset);
    if (total < 14) fail("BSON_CODE_SCOPE_INVALID"); ensure(buffer, offset, total, end);
    const code = parseBsonValue(0x02, buffer, offset + 4, offset + total, depth);
    const scope = parseBsonDocument(buffer, code.offset, offset + total, depth + 1, false);
    if (scope.offset !== offset + total) fail("BSON_CODE_SCOPE_INVALID");
    return { value: { $code: code.value, $scope: scope.value }, offset: offset + total };
  }
  if (type === 0x10) { ensure(buffer, offset, 4, end); return {
    value: buffer.readInt32LE(offset), offset: offset + 4 }; }
  if (type === 0x11) { ensure(buffer, offset, 8, end); return {
    value: { $timestamp: { increment: buffer.readUInt32LE(offset),
      seconds: buffer.readUInt32LE(offset + 4) } }, offset: offset + 8 }; }
  if (type === 0x12) return int64(buffer, offset, end);
  if (type === 0x13) { ensure(buffer, offset, 16, end); return {
    value: { $decimal128: buffer.subarray(offset, offset + 16).toString("hex") },
    offset: offset + 16 }; }
  if (type === 0x7f) return { value: { $maxKey: 1 }, offset };
  if (type === 0xff) return { value: { $minKey: 1 }, offset };
  fail("BSON_TYPE_UNSUPPORTED", `0x${type.toString(16)}`);
}

function parseBsonDocument(buffer, offset, outerEnd, depth = 0, array = false) {
  ensure(buffer, offset, 4, outerEnd); const length = buffer.readInt32LE(offset);
  if (length < 5 || length > MAX_BSON_DOCUMENT_BYTES) fail("BSON_DOCUMENT_LENGTH_INVALID");
  const end = offset + length; ensure(buffer, offset, length, outerEnd);
  if (buffer[end - 1] !== 0) fail("BSON_DOCUMENT_TERMINATOR_INVALID");
  const object = {}; let cursor = offset + 4;
  while (cursor < end - 1) {
    const type = buffer[cursor]; cursor += 1;
    const key = cstring(buffer, cursor, end - 1); cursor = key.offset;
    if (Object.prototype.hasOwnProperty.call(object, key.value)) fail("BSON_KEY_DUPLICATE");
    const parsed = parseBsonValue(type, buffer, cursor, end - 1, depth);
    object[key.value] = parsed.value; cursor = parsed.offset;
  }
  if (cursor !== end - 1) fail("BSON_DOCUMENT_BOUNDARY_INVALID");
  if (!array) return { value: object, offset: end };
  const keys = Object.keys(object);
  if (keys.some((key, index) => key !== String(index))) fail("BSON_ARRAY_INDEX_INVALID");
  return { value: keys.map((key) => object[key]), offset: end };
}

export function decodeAiidBsonSequence(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? "");
  const documents = []; let offset = 0;
  while (offset < buffer.length) {
    const parsed = parseBsonDocument(buffer, offset, buffer.length, 0, false);
    documents.push(parsed.value); offset = parsed.offset;
  }
  if (offset !== buffer.length) fail("BSON_SEQUENCE_BOUNDARY_INVALID");
  return documents;
}

export function inspectAiidAllowedCollectionBytes(bytes) {
  const documents = decodeAiidBsonSequence(bytes);
  return Object.freeze({ count: documents.length,
    topLevelKeys: [...new Set(documents.flatMap((document) => Object.keys(document)))].sort(),
    sourceHash: sha256(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? "")),
    documents });
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

function boundedString(value, maximum = 512, { empty = false } = {}) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > maximum) fail("FIELD_TOO_LARGE");
  if (!empty && normalized.length === 0) return null;
  return normalized;
}

function sourceArray(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail("SOURCE_ARRAY_INVALID", field);
  return value;
}

function sourceObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("SOURCE_OBJECT_INVALID", field);
  }
  return value;
}

function countBy(rows, getter) {
  const counts = new Map();
  for (const row of rows) {
    const value = getter(row) ?? "UNREPORTED";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) =>
    String(left).localeCompare(String(right))));
}

function sum(rows, getter) {
  return rows.reduce((total, row) => total + getter(row), 0);
}

function incidentCorrelationKeyHash(value) {
  if (!(typeof value === "string" || (Number.isSafeInteger(value) && value >= 0))) {
    fail("INCIDENT_ID_INVALID");
  }
  return domainHash("outsider/aiid/incident-correlation-key/v1", value);
}

function entityIdHash(value) {
  const normalized = boundedString(value, 512);
  return normalized == null ? null : domainHash("outsider/aiid/entity-id/v1", normalized);
}

function hashedReferenceSet(domain, values) {
  const hashes = values.map((value) => domainHash(domain, value)).sort();
  return {
    count: values.length,
    uniqueCount: new Set(hashes).size,
    setHash: domainHash(`${domain}/set/v1`, hashes),
  };
}

function allegedRoleHashes(document, legacyKey, compactKey) {
  const values = [
    ...sourceArray(document[legacyKey], legacyKey),
    ...sourceArray(document[compactKey], compactKey),
  ];
  const hashes = values.map((value) => entityIdHash(value));
  if (hashes.some((value) => value == null)) fail("INCIDENT_ROLE_ID_INVALID", legacyKey);
  return [...new Set(hashes)].sort();
}

function incidentMonth(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    fail("INCIDENT_DATE_INVALID");
  }
  return value.slice(0, 7);
}

function projectIncidents(documents, { officialFrozenSourceVerified = false } = {}) {
  const projections = documents.map((document) => {
    sourceObject(document, "incident");
    const correlationKeyHash = incidentCorrelationKeyHash(document.incident_id);
    const reportReferences = sourceArray(document.reports, "incident.reports");
    const implicatedSystemHashes = sourceArray(document.implicated_systems,
      "incident.implicated_systems").map((value) => entityIdHash(value));
    if (implicatedSystemHashes.some((value) => value == null)) {
      fail("INCIDENT_SYSTEM_ID_INVALID");
    }
    const title = boundedString(document.title, 32_768);
    const description = boundedString(document.description, 256_000);
    const body = {
      incidentCorrelationKeyHash: correlationKeyHash,
      incidentMonth: incidentMonth(document.date),
      allegedEntityRoleHashes: {
        deployer: allegedRoleHashes(document, "Alleged deployer of AI system",
          "AllegedDeployerOfAISystem"),
        developer: allegedRoleHashes(document, "Alleged developer of AI system",
          "AllegedDeveloperOfAISystem"),
        harmedOrNearlyHarmedParty: allegedRoleHashes(document,
          "Alleged harmed or nearly harmed parties", "AllegedHarmedOrNearlyHarmedParties"),
      },
      implicatedSystemEntityIdHashes: [...new Set(implicatedSystemHashes)].sort(),
      reportReferenceCount: reportReferences.length,
      reportReferenceSetHash: hashedReferenceSet("outsider/aiid/report-reference/v1",
        reportReferences).setHash,
      publisherTextCommitments: {
        titlePresent: title != null,
        titleHash: title == null ? null : domainHash("outsider/aiid/incident-title/v1", title),
        descriptionPresent: description != null,
        descriptionHash: description == null ? null
          : domainHash("outsider/aiid/incident-description/v1", description),
      },
      semantics: {
        publisherCuratedAllegedIncident: officialFrozenSourceVerified,
        independentObservation: false,
        independentAdjudication: false,
        causalAttributionEstablished: false,
        affectedPartyDirectReport: false,
        economicLossObserved: false,
        recoveryOrLongTermOutcomeObserved: false,
      },
    };
    return Object.freeze({ ...body,
      projectionHash: domainHash("outsider/aiid/incident-projection/v1", body) });
  }).sort((left, right) => left.incidentCorrelationKeyHash
    .localeCompare(right.incidentCorrelationKeyHash));
  if (new Set(projections.map((row) => row.incidentCorrelationKeyHash)).size
    !== projections.length) fail("INCIDENT_ID_DUPLICATE");
  return projections;
}

function taxonomyFieldProjection(namespace, field, fieldIndex) {
  sourceObject(field, `taxon.field_list.${fieldIndex}`);
  if (field.public !== true) return null;
  const shortName = boundedString(field.short_name, 512);
  if (!shortName) fail("TAXON_PUBLIC_FIELD_NAME_INVALID", namespace);
  const permittedValues = field.permitted_values == null ? []
    : sourceArray(field.permitted_values, `taxon.${namespace}.${shortName}.permitted_values`);
  const permittedValueHashes = permittedValues.map((value) =>
    domainHash("outsider/aiid/taxonomy-permitted-value/v1", value)).sort();
  const body = {
    fieldKeyHash: domainHash("outsider/aiid/taxonomy-field-key/v1", {
      namespace, fieldIndex, shortName,
    }),
    shortName,
    shortNameHash: domainHash("outsider/aiid/taxonomy-field-name/v1", {
      namespace, shortName,
    }),
    mongoType: boundedString(field.mongo_type, 128),
    displayType: boundedString(field.display_type, 128),
    permittedValueCount: permittedValues.length,
    permittedValueHashes,
    explicitPublicFlag: true,
    descriptionsOrNotesPersisted: false,
  };
  return Object.freeze({ ...body,
    fieldSchemaHash: domainHash("outsider/aiid/taxonomy-field-schema/v1", body) });
}

function projectTaxa(documents) {
  const publicNamesByNamespace = new Map();
  const projections = documents.map((document, index) => {
    sourceObject(document, `taxon.${index}`);
    const namespace = boundedString(document.namespace, 256);
    if (!namespace) fail("TAXON_NAMESPACE_INVALID");
    const fields = sourceArray(document.field_list, `taxon.${namespace}.field_list`);
    const publicFields = fields.map((field, fieldIndex) =>
      taxonomyFieldProjection(namespace, field, fieldIndex)).filter(Boolean)
      .sort((left, right) => left.fieldKeyHash.localeCompare(right.fieldKeyHash));
    const names = publicNamesByNamespace.get(namespace) ?? new Set();
    for (const field of publicFields) names.add(field.shortName);
    publicNamesByNamespace.set(namespace, names);
    const body = {
      namespace,
      namespaceHash: domainHash("outsider/aiid/taxonomy-namespace/v1", namespace),
      sourceCorrelationKeyHash: domainHash("outsider/aiid/taxonomy-correlation-key/v1",
        document._id ?? { namespace }),
      sourceFieldCount: fields.length,
      explicitPublicFieldCount: publicFields.length,
      explicitPrivateFieldCount: fields.filter((field) => field?.public === false).length,
      unmarkedFieldCount: fields.filter((field) => field?.public == null).length,
      publicFields,
      descriptionsOrNotesPersisted: false,
    };
    return Object.freeze({ ...body,
      projectionHash: domainHash("outsider/aiid/taxonomy-projection/v1", body) });
  }).sort((left, right) => left.namespaceHash.localeCompare(right.namespaceHash));
  if (new Set(projections.map((row) => row.sourceCorrelationKeyHash)).size
    !== projections.length) fail("TAXON_ID_DUPLICATE");
  return { projections, publicNamesByNamespace };
}

function jsonValueShape(value) {
  if (value === null) return "NULL";
  if (Array.isArray(value)) return "ARRAY";
  if (typeof value === "number") return Number.isInteger(value) ? "INTEGER" : "NUMBER";
  if (typeof value === "object") return "OBJECT";
  return typeof value === "string" ? "STRING" : typeof value === "boolean" ? "BOOLEAN"
    : "UNSUPPORTED";
}

function valueIsEmpty(value) {
  return value == null || value === ""
    || (Array.isArray(value) && value.length === 0)
    || (typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === 0);
}

function projectClassifications(documents, publicNamesByNamespace) {
  let droppedNonPublicAttributeCount = 0;
  let invalidValueJsonCount = 0;
  let missingValueJsonCount = 0;
  const projections = [];
  for (const [index, document] of documents.entries()) {
    sourceObject(document, `classification.${index}`);
    if (typeof document.publish !== "boolean") fail("CLASSIFICATION_PUBLISH_INVALID");
    const namespace = boundedString(document.namespace, 256);
    if (!namespace) fail("CLASSIFICATION_NAMESPACE_INVALID");
    if (document.publish !== true) continue;
    const allowedNames = publicNamesByNamespace.get(namespace) ?? new Set();
    const safeAttributes = [];
    for (const [attributeIndex, attribute] of sourceArray(document.attributes,
      `classification.${namespace}.attributes`).entries()) {
      sourceObject(attribute, `classification.${namespace}.attribute.${attributeIndex}`);
      const shortName = boundedString(attribute.short_name, 512);
      if (!shortName || !allowedNames.has(shortName)) {
        droppedNonPublicAttributeCount += 1;
        continue;
      }
      const raw = boundedString(attribute.value_json, 2 * 1024 * 1024, { empty: true });
      let value; let parseStatus;
      if (raw == null) {
        value = { $missingValueJson: true }; parseStatus = "MISSING";
        missingValueJsonCount += 1;
      } else {
        parseStatus = "VALID_JSON";
        try { value = JSON.parse(raw); } catch { value = raw; parseStatus = "INVALID_JSON_HASHED";
          invalidValueJsonCount += 1; }
      }
      const body = {
        fieldName: shortName,
        fieldNameHash: domainHash("outsider/aiid/taxonomy-field-name/v1", {
          namespace, shortName,
        }),
        valueShape: parseStatus === "VALID_JSON" ? jsonValueShape(value) : parseStatus,
        valuePresent: parseStatus === "VALID_JSON" ? !valueIsEmpty(value)
          : parseStatus === "INVALID_JSON_HASHED" && raw.length > 0,
        valueHash: domainHash("outsider/aiid/classification-value/v1", {
          namespace, shortName, value,
        }),
        parseStatus,
        rawValuePersisted: false,
      };
      safeAttributes.push(Object.freeze({ ...body,
        attributeProjectionHash: domainHash("outsider/aiid/classification-attribute/v1", body),
      }));
    }
    safeAttributes.sort((left, right) => left.attributeProjectionHash
      .localeCompare(right.attributeProjectionHash));
    const incidentReferences = sourceArray(document.incidents,
      `classification.${namespace}.incidents`);
    const incidentCorrelationKeyHashes = incidentReferences.map(incidentCorrelationKeyHash).sort();
    const reportReferences = sourceArray(document.reports,
      `classification.${namespace}.reports`);
    const body = {
      classificationCorrelationKeyHash: domainHash(
        "outsider/aiid/classification-correlation-key/v1", document._id ?? {
          namespace, index, incidentCorrelationKeyHashes,
        }),
      namespace,
      namespaceHash: domainHash("outsider/aiid/taxonomy-namespace/v1", namespace),
      incidentCorrelationKeyHashes,
      reportReferenceCount: reportReferences.length,
      reportReferenceSetHash: hashedReferenceSet("outsider/aiid/report-reference/v1",
        reportReferences).setHash,
      publicAttributes: safeAttributes,
      sourcePublishFlag: true,
      sourceNotesPresent: boundedString(document.notes, 2 * 1024 * 1024) != null,
      sourceNotesPersisted: false,
      reviewerClassificationNotAdjudication: true,
    };
    projections.push(Object.freeze({ ...body,
      projectionHash: domainHash("outsider/aiid/classification-projection/v1", body) }));
  }
  projections.sort((left, right) => left.classificationCorrelationKeyHash
    .localeCompare(right.classificationCorrelationKeyHash));
  if (new Set(projections.map((row) => row.classificationCorrelationKeyHash)).size
    !== projections.length) fail("CLASSIFICATION_ID_DUPLICATE");
  return { projections, droppedNonPublicAttributeCount, invalidValueJsonCount,
    missingValueJsonCount };
}

function projectEntities(documents) {
  const projections = documents.map((document, index) => {
    sourceObject(document, `entity.${index}`);
    const normalizedId = boundedString(document.entity_id, 512);
    const normalizedName = boundedString(document.name, 4096);
    const body = {
      sourceCorrelationKeyHash: domainHash("outsider/aiid/entity-correlation-key/v1",
        document._id ?? { index, entityId: normalizedId }),
      entityIdPresent: normalizedId != null,
      entityIdHash: normalizedId == null ? null : entityIdHash(normalizedId),
      entityNamePresent: normalizedName != null,
      entityNameHash: normalizedName == null ? null
        : domainHash("outsider/aiid/entity-name/v1", normalizedName),
      entityIdOrNamePersisted: false,
    };
    return Object.freeze({ ...body,
      projectionHash: domainHash("outsider/aiid/entity-projection/v1", body) });
  }).sort((left, right) => left.sourceCorrelationKeyHash
    .localeCompare(right.sourceCorrelationKeyHash));
  if (new Set(projections.map((row) => row.sourceCorrelationKeyHash)).size
    !== projections.length) fail("ENTITY_ID_DUPLICATE");
  return projections;
}

function fixedBoundary() {
  return {
    authority: "none",
    independentIncidentUnits: 0,
    independentAffectedPartyObservations: 0,
    prospectiveOutsiderObservations: 0,
    causalExperienceUnits: 0,
    admittedExposureRows: 0,
    admittedEconomicLossRows: 0,
    recoveryVerifiedRows: 0,
    closureVerifiedRows: 0,
    frequencyCalibrationEligible: false,
    causalEffectEligible: false,
    economicSeverityEligible: false,
    automaticTraining: false,
    productionModelUpdate: false,
    permitsPrice: false,
    permitsGuarantee: false,
    permitsSettle: false,
    movesFunds: false,
  };
}

function normalizeAllowedMembers(input) {
  const entries = input instanceof Map ? [...input.entries()] : Object.entries(input ?? {});
  const names = entries.map(([name]) => name).sort();
  const expected = [...AIID_ALLOWED_MEMBERS].sort();
  if (!same(names, expected)) fail("ALLOWED_MEMBER_SET_INVALID");
  const members = new Map();
  for (const [name, value] of entries) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");
    if (bytes.length < 1 || bytes.length > MAX_BSON_DOCUMENT_BYTES) {
      fail("ALLOWED_MEMBER_SIZE_INVALID", name);
    }
    members.set(name, bytes);
  }
  return members;
}

function validateMetadata(bytes, collection) {
  if (bytes.length > 1024 * 1024) fail("METADATA_SIZE_INVALID", collection);
  let metadata;
  try { metadata = JSON.parse(bytes.toString("utf8")); } catch {
    fail("METADATA_JSON_INVALID", collection);
  }
  if (metadata?.collectionName !== collection || metadata?.type !== "collection") {
    fail("METADATA_COLLECTION_INVALID", collection);
  }
}

function frozenMemberManifestMatched(manifest) {
  return AIID_ALLOWED_MEMBERS.every((member) => {
    const expected = AIID_OFFICIAL_ALLOWED_MEMBER_COMMITMENTS_20260817[member];
    const actual = manifest.find((entry) => entry.member === member);
    return expected && actual?.bytes === expected.bytes && actual?.sha256 === expected.sha256;
  });
}

export function validateAiidTermsSnapshotBytes(termsSnapshotBytes) {
  const bytes = Buffer.isBuffer(termsSnapshotBytes) ? termsSnapshotBytes
    : Buffer.from(termsSnapshotBytes ?? "");
  if (bytes.length < 1 || bytes.length > 2 * 1024 * 1024) fail("TERMS_SIZE_INVALID");
  const text = bytes.toString("utf8");
  const required = [
    '<h2 id="datalicense">Data License</h2>',
    'href="https://creativecommons.org/licenses/by-sa/4.0/"',
    "<li>incidents: this is the main incident collection",
    "<li>taxa: Metadata describing the taxonomies",
    "<li>classifications: All the taxonomic classifications",
    "<li>entities: The organizations and individuals related to incidents.</li>",
    '<h3 id="exclusions">Exclusions</h3>',
    "<li>submissions: Prospective reports before they are rotated into the reports collection.</li>",
    "The text field of the reports collection stored in the field named &quot;text&quot;.",
    "not contained within the database snapshots",
    "Effective as of August 7, 2025.",
    "no third party content should be construed to be owned by RAIC, factually correct",
  ];
  if (required.some((value) => !text.includes(value))) fail("TERMS_POLICY_MARKER_MISSING");
  return Object.freeze({
    termsSnapshotHash: sha256(bytes),
    termsSnapshotBytes: bytes.length,
    termsEffectiveAt: AIID_FROZEN_SOURCE_20260817.termsEffectiveAt,
    allowedCollectionsConfirmed: [...AIID_ALLOWED_COLLECTIONS],
    submissionsExcluded: true,
    reportsTextExcluded: true,
    externalSnapshotContentExcluded: true,
    thirdPartyFactualCorrectnessNotGuaranteed: true,
  });
}

/**
 * Build from an already-separated exact allowlist.  The adapter rejects both
 * missing and additional members, so excluded collections cannot be passed to
 * the projection accidentally.
 */
export function adaptAiidAllowedSnapshotMembers(memberBytes, {
  sourceArchiveHash,
  sourceArchiveBytes,
  termsSnapshotBytes,
  generatedAt = AIID_FROZEN_SOURCE_20260817.snapshotAt,
  _sourceReplayToken = null,
} = {}) {
  if (!HASH.test(String(sourceArchiveHash ?? ""))
    || !Number.isSafeInteger(sourceArchiveBytes) || sourceArchiveBytes < 1
    || sourceArchiveBytes > MAX_ARCHIVE_BYTES) fail("SOURCE_ARCHIVE_COMMITMENT_INVALID");
  const members = normalizeAllowedMembers(memberBytes);
  const terms = validateAiidTermsSnapshotBytes(termsSnapshotBytes);
  const licenseBytes = members.get(`${AIID_ARCHIVE_ROOT}/license.txt`);
  const licenseText = licenseBytes.toString("utf8");
  if (!licenseText.includes("CC BY-SA 4.0")
    || !licenseText.includes("Report contents are subject to their own intellectual property rights")) {
    fail("SNAPSHOT_LICENSE_NOTICE_INVALID");
  }
  const collections = {};
  for (const collection of AIID_ALLOWED_COLLECTIONS) {
    const bsonPath = `${AIID_DATABASE_ROOT}/${collection}.bson`;
    const metadataPath = `${AIID_DATABASE_ROOT}/${collection}.metadata.json`;
    validateMetadata(members.get(metadataPath), collection);
    collections[collection] = decodeAiidBsonSequence(members.get(bsonPath));
  }
  const memberManifest = [...members.entries()].map(([member, bytes]) => ({
    member, bytes: bytes.length, sha256: sha256(bytes),
  })).sort((left, right) => left.member.localeCompare(right.member));
  const frozenProfileMatched = _sourceReplayToken === OFFICIAL_SOURCE_REPLAY_TOKEN
    && sourceArchiveHash
      === AIID_FROZEN_SOURCE_20260817.archiveSha256
    && sourceArchiveBytes === AIID_FROZEN_SOURCE_20260817.archiveBytes
    && frozenMemberManifestMatched(memberManifest)
    && terms.termsSnapshotHash === AIID_FROZEN_SOURCE_20260817.termsSnapshotSha256
    && terms.termsSnapshotBytes === AIID_FROZEN_SOURCE_20260817.termsSnapshotBytes;

  const incidents = projectIncidents(collections.incidents, {
    officialFrozenSourceVerified: frozenProfileMatched,
  });
  const taxonomy = projectTaxa(collections.taxa);
  const classification = projectClassifications(collections.classifications,
    taxonomy.publicNamesByNamespace);
  const entities = projectEntities(collections.entities);
  const incidentKeys = new Set(incidents.map((row) => row.incidentCorrelationKeyHash));
  const knownEntityIds = new Set(entities.map((row) => row.entityIdHash).filter(Boolean));
  const roleReferences = incidents.flatMap((row) => [
    ...row.allegedEntityRoleHashes.deployer,
    ...row.allegedEntityRoleHashes.developer,
    ...row.allegedEntityRoleHashes.harmedOrNearlyHarmedParty,
    ...row.implicatedSystemEntityIdHashes,
  ]);
  const classificationIncidentReferences = classification.projections.flatMap((row) =>
    row.incidentCorrelationKeyHashes);
  const publicAttributeRows = classification.projections.flatMap((row) =>
    row.publicAttributes.map((attribute) => ({ namespace: row.namespace, attribute })));
  const rawPublishedClassificationCount = collections.classifications.filter((row) =>
    row.publish === true).length;
  const body = {
    schema: AIID_SNAPSHOT_EVIDENCE_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: canonicalTime(generatedAt),
    source: {
      sourceId: frozenProfileMatched ? AIID_FROZEN_SOURCE_20260817.sourceId
        : "CALLER_ASSERTED_SHAPED_FIXTURE",
      sourceTrustClass: frozenProfileMatched ? "OFFICIAL_AIID_FROZEN_SOURCE_REPLAY"
        : "CALLER_ASSERTED_SHAPED_FIXTURE",
      snapshotPageUrl: frozenProfileMatched ? AIID_FROZEN_SOURCE_20260817.snapshotPageUrl : null,
      termsUrl: frozenProfileMatched ? AIID_FROZEN_SOURCE_20260817.termsUrl : null,
      archiveUrl: frozenProfileMatched ? AIID_FROZEN_SOURCE_20260817.archiveUrl : null,
      archiveName: frozenProfileMatched ? AIID_FROZEN_SOURCE_20260817.archiveName : null,
      snapshotAt: frozenProfileMatched ? AIID_FROZEN_SOURCE_20260817.snapshotAt : null,
      termsCapturedAt: frozenProfileMatched ? AIID_FROZEN_SOURCE_20260817.termsCapturedAt : null,
      termsEffectiveAt: frozenProfileMatched ? terms.termsEffectiveAt : null,
      archiveHash: sourceArchiveHash,
      archiveBytes: sourceArchiveBytes,
      termsSnapshotHash: terms.termsSnapshotHash,
      termsSnapshotBytes: terms.termsSnapshotBytes,
      termsPolicyMarkersReplayed: frozenProfileMatched,
      allowedMemberManifest: memberManifest,
      allowedCollections: [...AIID_ALLOWED_COLLECTIONS],
      extractionAllowlist: [...AIID_ALLOWED_MEMBERS],
      explicitlyExcludedMembers: [...AIID_FORBIDDEN_MEMBERS],
      forbiddenMembersExtractedOrParsed: false,
      forbiddenMemberAccessesByAdapter: 0,
      frozenProfileMatched,
      officialFrozenSourceVerified: frozenProfileMatched,
      sourceArtifactsReverified: frozenProfileMatched,
      publisher: frozenProfileMatched
        ? "RESPONSIBLE_AI_COLLABORATIVE_AI_INCIDENT_DATABASE" : null,
      publisherVeracityGuaranteeRecorded: frozenProfileMatched ? false : null,
    },
    evidenceOntology: {
      environmentReality: frozenProfileMatched
        ? ["ORGANIC", "REAL_SOFTWARE", "REAL_PHYSICAL_MIXED_UNKNOWN_PER_ROW"]
        : ["UNVERIFIED_FIXTURE"],
      empiricalStatus: frozenProfileMatched ? "PUBLISHER_CURATED_ALLEGED_INCIDENT_CATALOG"
        : "CALLER_ASSERTED_SHAPED_FIXTURE",
      observationOrigin: frozenProfileMatched
        ? "PUBLISHER_SUMMARIES_AND_REVIEWER_CLASSIFICATIONS"
        : "CALLER_ASSERTED_SHAPED_FIXTURE",
      authorityLevels: frozenProfileMatched ? ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"]
        : ["CALLER_ASSERTED"],
      affectedPartyReportClass: frozenProfileMatched
        ? "NOT_DIRECTLY_OBSERVED_IN_ALLOWED_COLLECTIONS" : "NOT_ESTABLISHED",
      sourceReportClass: frozenProfileMatched
        ? "THIRD_PARTY_REPORT_REFERENCES_WITH_TEXT_EXCLUDED" : "NOT_ESTABLISHED",
      independentObservationEstablished: false,
      formalAdjudicationEstablished: false,
      causalAttributionEstablished: false,
    },
    rightsBoundary: {
      sourceBytesAccess: frozenProfileMatched ? "OFFICIAL_PUBLIC_SNAPSHOT_DOWNLOAD"
        : "CALLER_PROVIDED_FIXTURE_BYTES",
      licensedCollections: frozenProfileMatched ? [...AIID_ALLOWED_COLLECTIONS] : [],
      licensedCollectionDeclaration: frozenProfileMatched
        ? "CC_BY_SA_4_0_AS_STATED_BY_PUBLISHER_TERMS" : "NOT_ESTABLISHED",
      attributionRequired: frozenProfileMatched,
      shareAlikeRequired: frozenProfileMatched,
      reportsText: frozenProfileMatched ? "EXCLUDED_NOT_EXTRACTED_NOT_PARSED_NOT_RETAINED"
        : "NOT_PROVIDED_TO_ADAPTER_RIGHTS_NOT_ESTABLISHED",
      submissions: frozenProfileMatched ? "EXCLUDED_NOT_EXTRACTED_NOT_PARSED_NOT_RETAINED"
        : "NOT_PROVIDED_TO_ADAPTER_RIGHTS_NOT_ESTABLISHED",
      externalImagesVideosAndLinkedContent: "NOT_INCLUDED_RIGHTS_NOT_INFERRED",
      reportReferenceIds: "COUNTS_AND_SET_COMMITMENTS_ONLY",
      adapterGrantsAdditionalRights: false,
      legalConclusion: false,
      automaticTrainingAuthorizedByThisArtifact: false,
      licenseNoticeHash: sha256(licenseBytes),
      termsSnapshotHash: terms.termsSnapshotHash,
    },
    projectionPolicy: {
      incidentTitleOrDescriptionPersisted: false,
      entityNamesOrIdsPersisted: false,
      classificationRawValuesOrNotesPersisted: false,
      reportReferenceIdsPersisted: false,
      onlyExplicitPublicTaxonomyFieldsAdmitted: true,
      unpublishedClassificationsAdmitted: false,
      publisherClassificationsTreatedAsAdjudication: false,
      hashedValuesStillRequireSourceTermsCompliance: true,
    },
    counts: {
      incidentDocuments: collections.incidents.length,
      incidentProjections: incidents.length,
      incidentReportReferences: sum(incidents, (row) => row.reportReferenceCount),
      taxonomyDocuments: collections.taxa.length,
      taxonomySourceFields: sum(taxonomy.projections, (row) => row.sourceFieldCount),
      taxonomyExplicitPublicFields: sum(taxonomy.projections,
        (row) => row.explicitPublicFieldCount),
      taxonomyExplicitPrivateFields: sum(taxonomy.projections,
        (row) => row.explicitPrivateFieldCount),
      taxonomyUnmarkedFields: sum(taxonomy.projections, (row) => row.unmarkedFieldCount),
      classificationDocuments: collections.classifications.length,
      publishedClassificationDocuments: rawPublishedClassificationCount,
      unpublishedClassificationDocuments: collections.classifications.length
        - rawPublishedClassificationCount,
      admittedClassificationProjections: classification.projections.length,
      admittedPublicClassificationAttributes: publicAttributeRows.length,
      droppedNonPublicClassificationAttributes: classification.droppedNonPublicAttributeCount,
      invalidClassificationValueJsonHashed: classification.invalidValueJsonCount,
      missingClassificationValueJson: classification.missingValueJsonCount,
      classificationIncidentReferences: classificationIncidentReferences.length,
      classificationIncidentReferencesJoined: classificationIncidentReferences.filter((value) =>
        incidentKeys.has(value)).length,
      classificationIncidentReferencesUnjoined: classificationIncidentReferences.filter((value) =>
        !incidentKeys.has(value)).length,
      entityDocuments: collections.entities.length,
      entityProjections: entities.length,
      entitiesWithId: entities.filter((row) => row.entityIdPresent).length,
      entitiesWithName: entities.filter((row) => row.entityNamePresent).length,
      incidentEntityRoleReferences: roleReferences.length,
      incidentEntityRoleReferencesJoined: roleReferences.filter((value) =>
        knownEntityIds.has(value)).length,
      incidentEntityRoleReferencesUnjoined: roleReferences.filter((value) =>
        !knownEntityIds.has(value)).length,
    },
    descriptiveComposition: {
      allegedIncidentMonth: countBy(incidents, (row) => row.incidentMonth),
      taxonomyDocumentsByNamespace: countBy(taxonomy.projections, (row) => row.namespace),
      explicitPublicTaxonomyFieldsByNamespace: countBy(taxonomy.projections.flatMap((row) =>
        row.publicFields.map(() => ({ namespace: row.namespace }))), (row) => row.namespace),
      admittedClassificationsByNamespace: countBy(classification.projections,
        (row) => row.namespace),
      admittedPublicAttributesByNamespaceAndField: countBy(publicAttributeRows,
        (row) => `${row.namespace}::${row.attribute.fieldName}`),
    },
    projections: {
      incidents,
      taxonomies: taxonomy.projections,
      classifications: classification.projections,
      entities,
    },
    stewardshipUse: {
      admitted: frozenProfileMatched ? ["DESCRIPTIVE_CATALOG_COMPOSITION", "FACTOR_SCHEMA_CANDIDATES",
        "CONSEQUENCE_CHANNEL_DISCOVERY", "AFFECTED_PARTY_CLASS_DISCOVERY",
        "SOURCE_SNAPSHOT_CHANGE_REVIEW"] : ["PARSER_AND_SCHEMA_TEST_ONLY"],
      denied: ["EXPOSURE_DENOMINATOR", "FREQUENCY", "CAUSAL_ATTRIBUTION",
        "ECONOMIC_LOSS", "PRICE", "GUARANTEE", "SETTLE", "AUTOMATIC_TRAINING",
        "RECOVERY", "CLOSURE"],
      longitudinalConsequenceCoverage: "ABSENT",
      affectedPartyStandingCoverage: "ABSENT",
      nextObservationNeed: frozenProfileMatched
        ? "OWNER_BOUND_RUN_PLUS_AFFECTED_PARTY_REPORT_PLUS_RECOVERY_CHECK"
        : "PROVIDE_EXACT_FROZEN_OFFICIAL_SOURCE_AND_TERMS_BYTES",
    },
    boundary: fixedBoundary(),
    sourceCommitmentHash: domainHash("outsider/aiid/allowed-snapshot-source/v1", {
      sourceArchiveHash,
      sourceArchiveBytes,
      termsSnapshotHash: terms.termsSnapshotHash,
      termsSnapshotBytes: terms.termsSnapshotBytes,
      allowedMemberManifest: memberManifest,
      projectionHashes: {
        incidents: incidents.map((row) => row.projectionHash),
        taxonomies: taxonomy.projections.map((row) => row.projectionHash),
        classifications: classification.projections.map((row) => row.projectionHash),
        entities: entities.map((row) => row.projectionHash),
      },
    }),
  };
  const artifactHasher = frozenProfileMatched
    ? boundedFrozenArtifactHash : domainHash;
  return Object.freeze({ ...body,
    artifactHash: artifactHasher(AIID_SNAPSHOT_EVIDENCE_SCHEMA, body) });
}

function regularFileBytesNoFollow(filePath, maximum) {
  const beforePath = lstatSync(filePath);
  if (!beforePath.isFile() || beforePath.isSymbolicLink()
    || beforePath.size < 1 || beforePath.size > maximum) fail("SOURCE_FILE_INVALID");
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const descriptor = openSync(filePath, flags);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size !== beforePath.size) fail("SOURCE_FILE_CHANGED");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || bytes.length !== before.size) fail("SOURCE_FILE_CHANGED");
    return bytes;
  } finally { closeSync(descriptor); }
}

function tarBinary() {
  for (const candidate of ["/usr/bin/tar", "/bin/tar"]) {
    if (existsSync(candidate)) return candidate;
  }
  fail("TAR_BINARY_MISSING");
}

function recursivelyListRegularFiles(root, directory = root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail("EXTRACTED_SYMLINK_INVALID", relative);
    if (stat.isDirectory()) recursivelyListRegularFiles(root, absolute, files);
    else if (stat.isFile()) files.push(relative);
    else fail("EXTRACTED_ENTRY_TYPE_INVALID", relative);
  }
  return files;
}

// One content-addressed extraction, bounded to the most recent archive. Every
// call still hashes all archive bytes; callers receive copies, never cached buffers.
let lastAllowedExtraction = null;
const copyAllowedMembers = members => Object.freeze(Object.fromEntries(
  Object.entries(members).map(([name, bytes]) => [name, Buffer.from(bytes)])));

/** Extract exactly the licensed allowlist; report/submission members are never requested. */
export function extractAiidAllowedMembersFromArchiveBytes(archiveBytes) {
  const bytes = Buffer.isBuffer(archiveBytes) ? archiveBytes : Buffer.from(archiveBytes ?? "");
  if (bytes.length < 1 || bytes.length > MAX_ARCHIVE_BYTES) fail("ARCHIVE_SIZE_INVALID");
  const archiveHash = sha256(bytes);
  if (lastAllowedExtraction?.archiveHash === archiveHash) return copyAllowedMembers(lastAllowedExtraction.members);
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "outsider-aiid-allowed-"));
  try {
    const result = spawnSync(tarBinary(), ["-xjf", "-", "-C", temporaryDirectory,
      ...AIID_ALLOWED_MEMBERS], {
      input: bytes,
      encoding: "buffer",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
    });
    if (result.error || result.signal || result.status !== 0) {
      fail("ARCHIVE_ALLOWLIST_EXTRACTION_FAILED",
        result.error?.code ?? result.signal ?? result.status ?? "unknown");
    }
    const files = recursivelyListRegularFiles(temporaryDirectory).sort();
    if (!same(files, [...AIID_ALLOWED_MEMBERS].sort())) fail("EXTRACTED_MEMBER_SET_INVALID");
    const members = Object.freeze(Object.fromEntries(AIID_ALLOWED_MEMBERS.map((member) => [
      member, regularFileBytesNoFollow(path.join(temporaryDirectory, ...member.split("/")),
        MAX_BSON_DOCUMENT_BYTES),
    ])));
    lastAllowedExtraction = {archiveHash, members};
    return copyAllowedMembers(members);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function buildAiidSnapshotEvidenceFromArchive(archivePath, options = {}) {
  if (typeof archivePath !== "string" || archivePath.length < 1) fail("ARCHIVE_PATH_INVALID");
  if (options == null || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).some((key) => !["termsSnapshotPath", "generatedAt"].includes(key))) {
    fail("BUILD_OPTIONS_INVALID");
  }
  const { termsSnapshotPath, generatedAt } = options;
  if (typeof termsSnapshotPath !== "string" || termsSnapshotPath.length < 1) {
    fail("TERMS_PATH_INVALID");
  }
  const archiveBytes = regularFileBytesNoFollow(path.resolve(archivePath), MAX_ARCHIVE_BYTES);
  const termsSnapshotBytes = regularFileBytesNoFollow(path.resolve(termsSnapshotPath),
    2 * 1024 * 1024);
  const allowedMembers = extractAiidAllowedMembersFromArchiveBytes(archiveBytes);
  return adaptAiidAllowedSnapshotMembers(allowedMembers, {
    sourceArchiveHash: sha256(archiveBytes),
    sourceArchiveBytes: archiveBytes.length,
    termsSnapshotBytes,
    generatedAt,
    _sourceReplayToken: OFFICIAL_SOURCE_REPLAY_TOKEN,
  });
}

export function buildAiidSnapshotEvidenceFromSources({
  archivePath, termsSnapshotPath,
} = {}, options = {}) {
  return buildAiidSnapshotEvidenceFromArchive(archivePath, {
    termsSnapshotPath, ...options,
  });
}

function projectionHashValid(row, domain) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const { projectionHash, ...body } = row;
  return HASH.test(String(projectionHash ?? ""))
    && projectionHash === domainHash(domain, body);
}

function exactKeys(object, keys) {
  return object && typeof object === "object" && !Array.isArray(object)
    && same(Object.keys(object).sort(), [...keys].sort());
}

function expectedSourceCommitment(artifact) {
  return domainHash("outsider/aiid/allowed-snapshot-source/v1", {
    sourceArchiveHash: artifact?.source?.archiveHash,
    sourceArchiveBytes: artifact?.source?.archiveBytes,
    termsSnapshotHash: artifact?.source?.termsSnapshotHash,
    termsSnapshotBytes: artifact?.source?.termsSnapshotBytes,
    allowedMemberManifest: artifact?.source?.allowedMemberManifest,
    projectionHashes: {
      incidents: artifact?.projections?.incidents?.map((row) => row.projectionHash) ?? [],
      taxonomies: artifact?.projections?.taxonomies?.map((row) => row.projectionHash) ?? [],
      classifications: artifact?.projections?.classifications?.map((row) => row.projectionHash) ?? [],
      entities: artifact?.projections?.entities?.map((row) => row.projectionHash) ?? [],
    },
  });
}

function structuralBoundaryValid(artifact) {
  const incidents = artifact?.projections?.incidents ?? [];
  const taxonomies = artifact?.projections?.taxonomies ?? [];
  const classifications = artifact?.projections?.classifications ?? [];
  const entities = artifact?.projections?.entities ?? [];
  const manifest = artifact?.source?.allowedMemberManifest ?? [];
  const incidentKeys = new Set(incidents.map((row) => row.incidentCorrelationKeyHash));
  const entityIds = new Set(entities.map((row) => row.entityIdHash).filter(Boolean));
  const roleReferences = incidents.flatMap((row) => [
    ...(row.allegedEntityRoleHashes?.deployer ?? []),
    ...(row.allegedEntityRoleHashes?.developer ?? []),
    ...(row.allegedEntityRoleHashes?.harmedOrNearlyHarmedParty ?? []),
    ...(row.implicatedSystemEntityIdHashes ?? []),
  ]);
  const classificationRefs = classifications.flatMap((row) =>
    row.incidentCorrelationKeyHashes ?? []);
  const attributes = classifications.flatMap((row) => row.publicAttributes ?? []);
  const publicAttributeRows = classifications.flatMap((row) =>
    (row.publicAttributes ?? []).map((attribute) => ({ namespace: row.namespace, attribute })));
  const manifestNames = manifest.map((entry) => entry.member).sort();
  const pinnedSourceBytes = artifact?.source?.archiveHash
      === AIID_FROZEN_SOURCE_20260817.archiveSha256
    && artifact?.source?.archiveBytes === AIID_FROZEN_SOURCE_20260817.archiveBytes
    && frozenMemberManifestMatched(manifest)
    && artifact?.source?.termsSnapshotHash
      === AIID_FROZEN_SOURCE_20260817.termsSnapshotSha256
    && artifact?.source?.termsSnapshotBytes
      === AIID_FROZEN_SOURCE_20260817.termsSnapshotBytes;
  const officialProfile = pinnedSourceBytes && artifact?.source?.frozenProfileMatched === true
    && artifact?.source?.officialFrozenSourceVerified === true
    && artifact?.source?.sourceArtifactsReverified === true;
  const fixtureProfile = artifact?.source?.frozenProfileMatched === false
    && artifact?.source?.officialFrozenSourceVerified === false
    && artifact?.source?.sourceArtifactsReverified === false;
  const expectedEvidenceOntology = {
    environmentReality: officialProfile
      ? ["ORGANIC", "REAL_SOFTWARE", "REAL_PHYSICAL_MIXED_UNKNOWN_PER_ROW"]
      : ["UNVERIFIED_FIXTURE"],
    empiricalStatus: officialProfile ? "PUBLISHER_CURATED_ALLEGED_INCIDENT_CATALOG"
      : "CALLER_ASSERTED_SHAPED_FIXTURE",
    observationOrigin: officialProfile ? "PUBLISHER_SUMMARIES_AND_REVIEWER_CLASSIFICATIONS"
      : "CALLER_ASSERTED_SHAPED_FIXTURE",
    authorityLevels: officialProfile ? ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"]
      : ["CALLER_ASSERTED"],
    affectedPartyReportClass: officialProfile
      ? "NOT_DIRECTLY_OBSERVED_IN_ALLOWED_COLLECTIONS" : "NOT_ESTABLISHED",
    sourceReportClass: officialProfile
      ? "THIRD_PARTY_REPORT_REFERENCES_WITH_TEXT_EXCLUDED" : "NOT_ESTABLISHED",
    independentObservationEstablished: false,
    formalAdjudicationEstablished: false,
    causalAttributionEstablished: false,
  };
  const expectedRightsBoundary = {
    sourceBytesAccess: officialProfile ? "OFFICIAL_PUBLIC_SNAPSHOT_DOWNLOAD"
      : "CALLER_PROVIDED_FIXTURE_BYTES",
    licensedCollections: officialProfile ? [...AIID_ALLOWED_COLLECTIONS] : [],
    licensedCollectionDeclaration: officialProfile
      ? "CC_BY_SA_4_0_AS_STATED_BY_PUBLISHER_TERMS" : "NOT_ESTABLISHED",
    attributionRequired: officialProfile,
    shareAlikeRequired: officialProfile,
    reportsText: officialProfile ? "EXCLUDED_NOT_EXTRACTED_NOT_PARSED_NOT_RETAINED"
      : "NOT_PROVIDED_TO_ADAPTER_RIGHTS_NOT_ESTABLISHED",
    submissions: officialProfile ? "EXCLUDED_NOT_EXTRACTED_NOT_PARSED_NOT_RETAINED"
      : "NOT_PROVIDED_TO_ADAPTER_RIGHTS_NOT_ESTABLISHED",
    externalImagesVideosAndLinkedContent: "NOT_INCLUDED_RIGHTS_NOT_INFERRED",
    reportReferenceIds: "COUNTS_AND_SET_COMMITMENTS_ONLY",
    adapterGrantsAdditionalRights: false,
    legalConclusion: false,
    automaticTrainingAuthorizedByThisArtifact: false,
    licenseNoticeHash: artifact?.rightsBoundary?.licenseNoticeHash,
    termsSnapshotHash: artifact?.source?.termsSnapshotHash,
  };
  const expectedStewardshipUse = {
    admitted: officialProfile ? ["DESCRIPTIVE_CATALOG_COMPOSITION", "FACTOR_SCHEMA_CANDIDATES",
      "CONSEQUENCE_CHANNEL_DISCOVERY", "AFFECTED_PARTY_CLASS_DISCOVERY",
      "SOURCE_SNAPSHOT_CHANGE_REVIEW"] : ["PARSER_AND_SCHEMA_TEST_ONLY"],
    denied: ["EXPOSURE_DENOMINATOR", "FREQUENCY", "CAUSAL_ATTRIBUTION",
      "ECONOMIC_LOSS", "PRICE", "GUARANTEE", "SETTLE", "AUTOMATIC_TRAINING",
      "RECOVERY", "CLOSURE"],
    longitudinalConsequenceCoverage: "ABSENT",
    affectedPartyStandingCoverage: "ABSENT",
    nextObservationNeed: officialProfile
      ? "OWNER_BOUND_RUN_PLUS_AFFECTED_PARTY_REPORT_PLUS_RECOVERY_CHECK"
      : "PROVIDE_EXACT_FROZEN_OFFICIAL_SOURCE_AND_TERMS_BYTES",
  };
  const validIncidents = incidents.every((row) =>
    exactKeys(row, ["incidentCorrelationKeyHash", "incidentMonth", "allegedEntityRoleHashes",
      "implicatedSystemEntityIdHashes", "reportReferenceCount", "reportReferenceSetHash",
      "publisherTextCommitments", "semantics", "projectionHash"])
    && exactKeys(row.allegedEntityRoleHashes,
      ["deployer", "developer", "harmedOrNearlyHarmedParty"])
    && exactKeys(row.publisherTextCommitments,
      ["titlePresent", "titleHash", "descriptionPresent", "descriptionHash"])
    && exactKeys(row.semantics, ["publisherCuratedAllegedIncident", "independentObservation",
      "independentAdjudication", "causalAttributionEstablished", "affectedPartyDirectReport",
      "economicLossObserved", "recoveryOrLongTermOutcomeObserved"])
    && projectionHashValid(row, "outsider/aiid/incident-projection/v1")
    && HASH.test(String(row.incidentCorrelationKeyHash ?? ""))
    && HASH.test(String(row.reportReferenceSetHash ?? ""))
    && Object.values(row.allegedEntityRoleHashes ?? {}).flat().every((value) => HASH.test(value))
    && (row.implicatedSystemEntityIdHashes ?? []).every((value) => HASH.test(value))
    && Object.values(row.semantics ?? {}).every((value) => value === false
      || value === true)
    && row.semantics?.publisherCuratedAllegedIncident === officialProfile
    && row.semantics?.independentObservation === false
    && row.semantics?.independentAdjudication === false
    && row.semantics?.causalAttributionEstablished === false
    && row.semantics?.economicLossObserved === false);
  const validTaxonomies = taxonomies.every((row) =>
    exactKeys(row, ["namespace", "namespaceHash", "sourceCorrelationKeyHash",
      "sourceFieldCount", "explicitPublicFieldCount", "explicitPrivateFieldCount",
      "unmarkedFieldCount", "publicFields", "descriptionsOrNotesPersisted", "projectionHash"])
    && projectionHashValid(row, "outsider/aiid/taxonomy-projection/v1")
    && row.descriptionsOrNotesPersisted === false
    && row.explicitPublicFieldCount === row.publicFields?.length
    && (row.publicFields ?? []).every((field) => {
      const { fieldSchemaHash, ...body } = field;
      return exactKeys(field, ["fieldKeyHash", "shortName", "shortNameHash", "mongoType",
        "displayType", "permittedValueCount", "permittedValueHashes", "explicitPublicFlag",
        "descriptionsOrNotesPersisted", "fieldSchemaHash"])
        && HASH.test(String(fieldSchemaHash ?? ""))
        && fieldSchemaHash === domainHash("outsider/aiid/taxonomy-field-schema/v1", body)
        && field.explicitPublicFlag === true
        && field.descriptionsOrNotesPersisted === false
        && (field.permittedValueHashes ?? []).every((value) => HASH.test(value));
    }));
  const validClassifications = classifications.every((row) =>
    exactKeys(row, ["classificationCorrelationKeyHash", "namespace", "namespaceHash",
      "incidentCorrelationKeyHashes", "reportReferenceCount", "reportReferenceSetHash",
      "publicAttributes", "sourcePublishFlag", "sourceNotesPresent", "sourceNotesPersisted",
      "reviewerClassificationNotAdjudication", "projectionHash"])
    && projectionHashValid(row, "outsider/aiid/classification-projection/v1")
    && row.sourcePublishFlag === true
    && row.sourceNotesPersisted === false
    && row.reviewerClassificationNotAdjudication === true
    && HASH.test(String(row.reportReferenceSetHash ?? ""))
    && (row.incidentCorrelationKeyHashes ?? []).every((value) => HASH.test(value))
    && (row.publicAttributes ?? []).every((attribute) => {
      const { attributeProjectionHash, ...body } = attribute;
      return exactKeys(attribute, ["fieldName", "fieldNameHash", "valueShape", "valuePresent",
        "valueHash", "parseStatus", "rawValuePersisted", "attributeProjectionHash"])
        && HASH.test(String(attributeProjectionHash ?? ""))
        && attributeProjectionHash
          === domainHash("outsider/aiid/classification-attribute/v1", body)
        && attribute.rawValuePersisted === false
        && HASH.test(String(attribute.valueHash ?? ""));
    }));
  const validEntities = entities.every((row) =>
    exactKeys(row, ["sourceCorrelationKeyHash", "entityIdPresent", "entityIdHash",
      "entityNamePresent", "entityNameHash", "entityIdOrNamePersisted", "projectionHash"])
    && projectionHashValid(row, "outsider/aiid/entity-projection/v1")
    && row.entityIdOrNamePersisted === false
    && (row.entityIdHash == null || HASH.test(row.entityIdHash))
    && (row.entityNameHash == null || HASH.test(row.entityNameHash)));
  const expectedComposition = {
    allegedIncidentMonth: countBy(incidents, (row) => row.incidentMonth),
    taxonomyDocumentsByNamespace: countBy(taxonomies, (row) => row.namespace),
    explicitPublicTaxonomyFieldsByNamespace: countBy(taxonomies.flatMap((row) =>
      row.publicFields.map(() => ({ namespace: row.namespace }))), (row) => row.namespace),
    admittedClassificationsByNamespace: countBy(classifications, (row) => row.namespace),
    admittedPublicAttributesByNamespaceAndField: countBy(publicAttributeRows,
      (row) => `${row.namespace}::${row.attribute.fieldName}`),
  };
  return exactKeys(artifact, ["schema", "schemaVersion", "generatedAt", "source",
    "evidenceOntology", "rightsBoundary", "projectionPolicy", "counts",
    "descriptiveComposition", "projections", "stewardshipUse", "boundary",
    "sourceCommitmentHash", "artifactHash"])
    && artifact?.schema === AIID_SNAPSHOT_EVIDENCE_SCHEMA
    && artifact?.schemaVersion === "1.0.0"
    && canonicalTime(artifact?.generatedAt) === artifact.generatedAt
    && exactKeys(artifact?.source, ["sourceId", "sourceTrustClass", "snapshotPageUrl",
      "termsUrl", "archiveUrl",
      "archiveName", "snapshotAt", "termsCapturedAt", "termsEffectiveAt", "archiveHash",
      "archiveBytes", "termsSnapshotHash", "termsSnapshotBytes", "termsPolicyMarkersReplayed",
      "allowedMemberManifest", "allowedCollections", "extractionAllowlist",
      "explicitlyExcludedMembers", "forbiddenMembersExtractedOrParsed",
      "forbiddenMemberAccessesByAdapter", "frozenProfileMatched",
      "officialFrozenSourceVerified", "sourceArtifactsReverified", "publisher",
      "publisherVeracityGuaranteeRecorded"])
    && exactKeys(artifact?.rightsBoundary, ["sourceBytesAccess", "licensedCollections",
      "licensedCollectionDeclaration", "attributionRequired", "shareAlikeRequired",
      "reportsText", "submissions", "externalImagesVideosAndLinkedContent",
      "reportReferenceIds", "adapterGrantsAdditionalRights", "legalConclusion",
      "automaticTrainingAuthorizedByThisArtifact", "licenseNoticeHash", "termsSnapshotHash"])
    && exactKeys(artifact?.projectionPolicy, ["incidentTitleOrDescriptionPersisted",
      "entityNamesOrIdsPersisted", "classificationRawValuesOrNotesPersisted",
      "reportReferenceIdsPersisted", "onlyExplicitPublicTaxonomyFieldsAdmitted",
      "unpublishedClassificationsAdmitted", "publisherClassificationsTreatedAsAdjudication",
      "hashedValuesStillRequireSourceTermsCompliance"])
    && exactKeys(artifact?.projections,
      ["incidents", "taxonomies", "classifications", "entities"])
    && exactKeys(artifact?.descriptiveComposition, Object.keys(expectedComposition))
    && exactKeys(artifact?.counts, Object.keys(AIID_FROZEN_COUNTS_20260817))
    && Object.values(artifact?.counts ?? {}).every((value) =>
      Number.isSafeInteger(value) && value >= 0)
    && (officialProfile || fixtureProfile)
    && (officialProfile ? artifact.source.sourceId === AIID_FROZEN_SOURCE_20260817.sourceId
      && artifact.source.sourceTrustClass === "OFFICIAL_AIID_FROZEN_SOURCE_REPLAY"
      && artifact.source.snapshotPageUrl === AIID_FROZEN_SOURCE_20260817.snapshotPageUrl
      && artifact.source.termsUrl === AIID_FROZEN_SOURCE_20260817.termsUrl
      && artifact.source.archiveUrl === AIID_FROZEN_SOURCE_20260817.archiveUrl
      && artifact.source.archiveName === AIID_FROZEN_SOURCE_20260817.archiveName
      && artifact.source.snapshotAt === AIID_FROZEN_SOURCE_20260817.snapshotAt
      && artifact.source.termsCapturedAt === AIID_FROZEN_SOURCE_20260817.termsCapturedAt
      && artifact.source.termsEffectiveAt === AIID_FROZEN_SOURCE_20260817.termsEffectiveAt
      && artifact.source.publisher === "RESPONSIBLE_AI_COLLABORATIVE_AI_INCIDENT_DATABASE"
      && artifact.source.publisherVeracityGuaranteeRecorded === false
      && artifact.source.termsPolicyMarkersReplayed === true
      : artifact.source.sourceId === "CALLER_ASSERTED_SHAPED_FIXTURE"
        && artifact.source.sourceTrustClass === "CALLER_ASSERTED_SHAPED_FIXTURE"
        && artifact.source.snapshotPageUrl === null && artifact.source.termsUrl === null
        && artifact.source.archiveUrl === null && artifact.source.archiveName === null
        && artifact.source.snapshotAt === null && artifact.source.termsCapturedAt === null
        && artifact.source.termsEffectiveAt === null && artifact.source.publisher === null
        && artifact.source.publisherVeracityGuaranteeRecorded === null
        && artifact.source.termsPolicyMarkersReplayed === false)
    && HASH.test(String(artifact?.source?.archiveHash ?? ""))
    && HASH.test(String(artifact?.source?.termsSnapshotHash ?? ""))
    && Number.isSafeInteger(artifact?.source?.termsSnapshotBytes)
    && artifact.source.termsSnapshotBytes > 0
    && same(manifestNames, [...AIID_ALLOWED_MEMBERS].sort())
    && manifest.every((entry) => exactKeys(entry, ["member", "bytes", "sha256"])
      && Number.isSafeInteger(entry.bytes) && entry.bytes > 0
      && HASH.test(String(entry.sha256 ?? "")))
    && same(artifact?.source?.allowedCollections, AIID_ALLOWED_COLLECTIONS)
    && same(artifact?.source?.extractionAllowlist, AIID_ALLOWED_MEMBERS)
    && same(artifact?.source?.explicitlyExcludedMembers, AIID_FORBIDDEN_MEMBERS)
    && artifact?.source?.forbiddenMembersExtractedOrParsed === false
    && artifact?.source?.forbiddenMemberAccessesByAdapter === 0
    && artifact?.source?.frozenProfileMatched === officialProfile
    && (!officialProfile || same(artifact?.counts, AIID_FROZEN_COUNTS_20260817))
    && same(artifact?.evidenceOntology, expectedEvidenceOntology)
    && same(artifact?.rightsBoundary, expectedRightsBoundary)
    && same(artifact?.stewardshipUse, expectedStewardshipUse)
    && HASH.test(String(artifact?.rightsBoundary?.licenseNoticeHash ?? ""))
    && artifact?.rightsBoundary?.adapterGrantsAdditionalRights === false
    && artifact?.rightsBoundary?.automaticTrainingAuthorizedByThisArtifact === false
    && artifact?.rightsBoundary?.termsSnapshotHash === artifact?.source?.termsSnapshotHash
    && artifact?.projectionPolicy?.onlyExplicitPublicTaxonomyFieldsAdmitted === true
    && artifact?.projectionPolicy?.unpublishedClassificationsAdmitted === false
    && artifact?.projectionPolicy?.publisherClassificationsTreatedAsAdjudication === false
    && same(artifact?.boundary, fixedBoundary())
    && validIncidents && validTaxonomies && validClassifications && validEntities
    && new Set(incidents.map((row) => row.incidentCorrelationKeyHash)).size === incidents.length
    && new Set(taxonomies.map((row) => row.sourceCorrelationKeyHash)).size === taxonomies.length
    && new Set(classifications.map((row) => row.classificationCorrelationKeyHash)).size
      === classifications.length
    && new Set(entities.map((row) => row.sourceCorrelationKeyHash)).size === entities.length
    && artifact?.counts?.incidentProjections === incidents.length
    && artifact?.counts?.incidentDocuments === incidents.length
    && artifact?.counts?.incidentReportReferences === sum(incidents,
      (row) => row.reportReferenceCount)
    && artifact?.counts?.taxonomyDocuments === taxonomies.length
    && artifact?.counts?.taxonomySourceFields === sum(taxonomies,
      (row) => row.sourceFieldCount)
    && artifact?.counts?.taxonomyExplicitPublicFields === sum(taxonomies,
      (row) => row.explicitPublicFieldCount)
    && artifact?.counts?.taxonomyExplicitPrivateFields === sum(taxonomies,
      (row) => row.explicitPrivateFieldCount)
    && artifact?.counts?.taxonomyUnmarkedFields === sum(taxonomies,
      (row) => row.unmarkedFieldCount)
    && artifact?.counts?.admittedClassificationProjections === classifications.length
    && artifact?.counts?.admittedPublicClassificationAttributes === attributes.length
    && artifact?.counts?.classificationIncidentReferences === classificationRefs.length
    && artifact?.counts?.classificationIncidentReferencesJoined
      === classificationRefs.filter((value) => incidentKeys.has(value)).length
    && artifact?.counts?.classificationIncidentReferencesUnjoined
      === classificationRefs.filter((value) => !incidentKeys.has(value)).length
    && artifact?.counts?.classificationDocuments
      === artifact?.counts?.publishedClassificationDocuments
        + artifact?.counts?.unpublishedClassificationDocuments
    && artifact?.counts?.publishedClassificationDocuments === classifications.length
    && artifact?.counts?.entityDocuments === entities.length
    && artifact?.counts?.entityProjections === entities.length
    && artifact?.counts?.entitiesWithId === entities.filter((row) => row.entityIdPresent).length
    && artifact?.counts?.entitiesWithName === entities.filter((row) => row.entityNamePresent).length
    && artifact?.counts?.incidentEntityRoleReferences === roleReferences.length
    && artifact?.counts?.incidentEntityRoleReferencesJoined
      === roleReferences.filter((value) => entityIds.has(value)).length
    && artifact?.counts?.incidentEntityRoleReferencesUnjoined
      === roleReferences.filter((value) => !entityIds.has(value)).length
    && same(artifact?.descriptiveComposition, expectedComposition)
    && artifact?.sourceCommitmentHash === expectedSourceCommitment(artifact);
}

export function verifyAiidSnapshotEvidence(artifact) {
  try {
    const { artifactHash, ...body } = artifact ?? {};
    const artifactHasher = artifact?.source?.officialFrozenSourceVerified
      ? boundedFrozenArtifactHash : domainHash;
    const ok = HASH.test(String(artifactHash ?? ""))
      && artifactHash === artifactHasher(AIID_SNAPSHOT_EVIDENCE_SCHEMA, body)
      && structuralBoundaryValid(artifact);
    return Object.freeze({
      ok,
      verificationLevel: ok ? "SELF_SEALED_STRUCTURE_ONLY" : "FAILED",
      sourceArtifactsReverified: false,
      officialFrozenSourceReproduced: false,
      forbiddenMembersExtractedOrParsed: false,
      artifactHash: artifactHash ?? null,
    });
  } catch (error) {
    return Object.freeze({ ok: false, verificationLevel: "FAILED",
      sourceArtifactsReverified: false, officialFrozenSourceReproduced: false,
      forbiddenMembersExtractedOrParsed: false,
      error: String(error?.message ?? error) });
  }
}

export function verifyAiidSnapshotEvidenceFromArchive(artifact, archivePath, termsSnapshotPath) {
  try {
    const rebuilt = buildAiidSnapshotEvidenceFromArchive(archivePath, {
      termsSnapshotPath,
      generatedAt: artifact?.generatedAt,
    });
    const ok = (rebuilt.source.officialFrozenSourceVerified
      ? sameBoundedFrozenArtifact(artifact, rebuilt)
      : same(artifact, rebuilt))
      && structuralBoundaryValid(rebuilt);
    const official = ok && rebuilt.source.officialFrozenSourceVerified === true;
    return Object.freeze({
      ok,
      verificationLevel: !ok ? "FAILED" : official
        ? "FULL_OFFICIAL_AIID_SOURCE_AND_TERMS_REPRODUCED_ALLOWLIST_ONLY"
        : "CALLER_ASSERTED_FIXTURE_BYTES_REPRODUCED_ALLOWLIST_ONLY",
      inputBytesReproduced: ok,
      termsInputBytesReproduced: ok,
      sourceArtifactsReverified: official,
      termsSnapshotReverified: official,
      officialFrozenSourceReproduced: official,
      forbiddenMembersExtractedOrParsed: false,
      collectionCounts: ok ? {
        incidents: rebuilt.counts.incidentDocuments,
        taxa: rebuilt.counts.taxonomyDocuments,
        classifications: rebuilt.counts.classificationDocuments,
        entities: rebuilt.counts.entityDocuments,
      } : null,
      artifactHash: artifact?.artifactHash ?? null,
    });
  } catch (error) {
    return Object.freeze({ ok: false, verificationLevel: "FAILED",
      inputBytesReproduced: false, termsInputBytesReproduced: false,
      sourceArtifactsReverified: false, officialFrozenSourceReproduced: false,
      termsSnapshotReverified: false,
      forbiddenMembersExtractedOrParsed: false,
      error: String(error?.message ?? error) });
  }
}

export function verifyAiidSnapshotEvidenceFromSources(artifact, {
  archivePath, termsSnapshotPath,
} = {}) {
  return verifyAiidSnapshotEvidenceFromArchive(artifact, archivePath, termsSnapshotPath);
}

function collectionDiff(previousRows, currentRows, correlationKey) {
  const before = new Map(previousRows.map((row) => [row[correlationKey], row]));
  const after = new Map(currentRows.map((row) => [row[correlationKey], row]));
  if (before.size !== previousRows.length || after.size !== currentRows.length) {
    fail("DIFF_CORRELATION_KEY_DUPLICATE", correlationKey);
  }
  const added = [...after.keys()].filter((key) => !before.has(key)).sort();
  const removed = [...before.keys()].filter((key) => !after.has(key)).sort();
  const changed = [...after.keys()].filter((key) => before.has(key)
    && before.get(key).projectionHash !== after.get(key).projectionHash).sort();
  const unchanged = [...after.keys()].filter((key) => before.has(key)
    && before.get(key).projectionHash === after.get(key).projectionHash).length;
  return {
    addedCorrelationKeyHashes: added,
    removedCorrelationKeyHashes: removed,
    changedCorrelationKeyHashes: changed,
    counts: { added: added.length, removed: removed.length,
      changed: changed.length, unchanged },
  };
}

export function buildAiidSnapshotEvidenceDiff(previous, current, {
  generatedAt = current?.generatedAt,
} = {}) {
  if (!verifyAiidSnapshotEvidence(previous).ok || !verifyAiidSnapshotEvidence(current).ok
    || previous.source.sourceId !== current.source.sourceId
    || previous.sourceCommitmentHash === current.sourceCommitmentHash) fail("DIFF_INPUT_INVALID");
  const body = {
    schema: AIID_SNAPSHOT_DIFF_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: canonicalTime(generatedAt),
    sourceId: current.source.sourceId,
    previous: { artifactHash: previous.artifactHash,
      sourceCommitmentHash: previous.sourceCommitmentHash },
    current: { artifactHash: current.artifactHash,
      sourceCommitmentHash: current.sourceCommitmentHash },
    changes: {
      incidents: collectionDiff(previous.projections.incidents,
        current.projections.incidents, "incidentCorrelationKeyHash"),
      taxonomies: collectionDiff(previous.projections.taxonomies,
        current.projections.taxonomies, "sourceCorrelationKeyHash"),
      classifications: collectionDiff(previous.projections.classifications,
        current.projections.classifications, "classificationCorrelationKeyHash"),
      entities: collectionDiff(previous.projections.entities,
        current.projections.entities, "sourceCorrelationKeyHash"),
    },
    disposition: "SOURCE_CHANGE_DISCOVERY_AND_HUMAN_TAXONOMY_REVIEW_ONLY",
    automaticPromotion: false,
    forbiddenMembersExtractedOrParsed: false,
    boundary: fixedBoundary(),
  };
  return Object.freeze({ ...body,
    diffHash: domainHash(AIID_SNAPSHOT_DIFF_SCHEMA, body) });
}

export function verifyAiidSnapshotEvidenceDiff(diff, previous, current) {
  try {
    const expected = buildAiidSnapshotEvidenceDiff(previous, current, {
      generatedAt: diff?.generatedAt,
    });
    return Object.freeze({ ok: same(diff, expected),
      verificationLevel: "BOTH_SOURCE_BOOKS_REQUIRED",
      permitsAutomaticPromotion: false,
      forbiddenMembersExtractedOrParsed: false,
      diffHash: diff?.diffHash ?? null });
  } catch (error) {
    return Object.freeze({ ok: false, verificationLevel: "FAILED",
      permitsAutomaticPromotion: false, forbiddenMembersExtractedOrParsed: false,
      error: String(error?.message ?? error) });
  }
}
