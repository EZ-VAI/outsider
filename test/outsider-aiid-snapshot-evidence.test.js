import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  AIID_ALLOWED_MEMBERS,
  extractAiidAllowedMembersFromArchiveBytes,
  AIID_SNAPSHOT_EVIDENCE_SCHEMA,
  adaptAiidAllowedSnapshotMembers,
  buildAiidSnapshotEvidenceDiff,
  buildAiidSnapshotEvidenceFromArchive,
  decodeAiidBsonSequence,
  validateAiidTermsSnapshotBytes,
  verifyAiidSnapshotEvidence,
  verifyAiidSnapshotEvidenceDiff,
  verifyAiidSnapshotEvidenceFromArchive,
} from "../src/outsider-aiid-snapshot-evidence.js";

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256(Buffer.from(`${domain}\0${typeof value === "string" ? value
    : canonicalizeStrict(value)}`));
}

function cstring(value) {
  return Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])]);
}

function bsonString(value) {
  const body = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4); length.writeInt32LE(body.length + 1);
  return Buffer.concat([length, body, Buffer.from([0])]);
}

function bsonValue(value) {
  if (value === null) return { type: 0x0a, bytes: Buffer.alloc(0) };
  if (typeof value === "string") return { type: 0x02, bytes: bsonString(value) };
  if (typeof value === "boolean") return { type: 0x08,
    bytes: Buffer.from([value ? 1 : 0]) };
  if (typeof value === "number" && Number.isSafeInteger(value)
    && value >= -2_147_483_648 && value <= 2_147_483_647) {
    const bytes = Buffer.alloc(4); bytes.writeInt32LE(value);
    return { type: 0x10, bytes };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const bytes = Buffer.alloc(8); bytes.writeDoubleLE(value);
    return { type: 0x01, bytes };
  }
  if (Array.isArray(value)) return { type: 0x04,
    bytes: bsonDocument(Object.fromEntries(value.map((item, index) => [String(index), item]))) };
  if (value && typeof value === "object") return { type: 0x03, bytes: bsonDocument(value) };
  throw new TypeError(`unsupported fixture BSON value:${typeof value}`);
}

function bsonDocument(document) {
  const elements = Object.entries(document).map(([key, value]) => {
    const encoded = bsonValue(value);
    return Buffer.concat([Buffer.from([encoded.type]), cstring(key), encoded.bytes]);
  });
  const length = 4 + elements.reduce((total, bytes) => total + bytes.length, 0) + 1;
  const header = Buffer.alloc(4); header.writeInt32LE(length);
  return Buffer.concat([header, ...elements, Buffer.from([0])]);
}

function bsonSequence(documents) {
  return Buffer.concat(documents.map(bsonDocument));
}

function fixtureMembers({ changed = false } = {}) {
  const root = "mongodump_full_snapshot";
  const database = `${root}/aiidprod`;
  const incidents = [{
    _id: "incident-object-secret-1",
    incident_id: 1,
    date: "2024-01-02",
    reports: [101, 102],
    "Alleged deployer of AI system": ["secret-deployer"],
    "Alleged developer of AI system": ["secret-developer"],
    "Alleged harmed or nearly harmed parties": ["secret-affected-party"],
    AllegedDeployerOfAISystem: ["secret-deployer"],
    AllegedDeveloperOfAISystem: [],
    AllegedHarmedOrNearlyHarmedParties: [],
    title: "SECRET INCIDENT TITLE",
    description: changed ? "SECRET CHANGED INCIDENT DESCRIPTION"
      : "SECRET INCIDENT DESCRIPTION",
    editors: ["SECRET EDITOR"],
    editor_notes: "SECRET EDITOR NOTES",
    implicated_systems: ["secret-system"],
  }];
  const taxa = [{
    _id: "taxon-1",
    namespace: "FIXTURE",
    description: "SECRET TAXON DESCRIPTION",
    field_list: [
      { short_name: "Allowed Factor", public: true, mongo_type: "string",
        display_type: "enum", permitted_values: ["PUBLIC-CATEGORY-SECRET"] },
      { short_name: "Lives Lost", public: true, mongo_type: "int", display_type: "int" },
      { short_name: "Annotator", public: false, mongo_type: "string",
        display_type: "string" },
      { short_name: "UNMARKED SECRET FACTOR", mongo_type: "string",
        display_type: "string" },
    ],
  }];
  const classifications = [{
    _id: "classification-1",
    namespace: "FIXTURE",
    incidents: [1],
    reports: [101],
    publish: true,
    notes: "SECRET REVIEWER NOTES",
    attributes: [
      { short_name: "Allowed Factor", value_json: "\"PUBLIC-CATEGORY-SECRET\"" },
      { short_name: "Lives Lost", value_json: "999" },
      { short_name: "Annotator", value_json: "\"SECRET ANNOTATOR\"" },
      { short_name: "UNMARKED SECRET FACTOR", value_json: "\"SECRET VALUE\"" },
    ],
  }, {
    _id: "classification-2",
    namespace: "FIXTURE",
    incidents: [1],
    reports: [],
    publish: false,
    notes: "UNPUBLISHED SECRET NOTE",
    attributes: [{ short_name: "Allowed Factor",
      value_json: "\"UNPUBLISHED SECRET VALUE\"" }],
  }];
  const entities = [{ _id: "entity-1", entity_id: "secret-deployer", name: "Secret Corp" },
    { _id: "entity-2", name: "Secret Person Without ID" }];
  const collectionDocuments = { incidents, taxa, classifications, entities };
  const members = {
    [`${root}/license.txt`]: Buffer.from("Report contents are subject to their own intellectual property rights. Unless otherwise noted, the database is shared under (CC BY-SA 4.0)."),
  };
  for (const [collection, documents] of Object.entries(collectionDocuments)) {
    members[`${database}/${collection}.bson`] = bsonSequence(documents);
    members[`${database}/${collection}.metadata.json`] = Buffer.from(JSON.stringify({
      collectionName: collection, type: "collection", indexes: [],
    }));
  }
  assert.deepEqual(Object.keys(members).sort(), [...AIID_ALLOWED_MEMBERS].sort());
  return members;
}

function fixtureTerms() {
  return Buffer.from(`
<h2 id="datalicense">Data License</h2>
<a href="https://creativecommons.org/licenses/by-sa/4.0/">license</a>
<li>incidents: this is the main incident collection</li>
<li>taxa: Metadata describing the taxonomies</li>
<li>classifications: All the taxonomic classifications</li>
<li>entities: The organizations and individuals related to incidents.</li>
<h3 id="exclusions">Exclusions</h3>
<li>submissions: Prospective reports before they are rotated into the reports collection.</li>
The text field of the reports collection stored in the field named &quot;text&quot;.
not contained within the database snapshots
Effective as of August 7, 2025.
no third party content should be construed to be owned by RAIC, factually correct
`);
}

function fixtureArtifact(options = {}) {
  const members = fixtureMembers(options);
  const archiveCommitment = Buffer.from(options.changed ? "fixture archive after"
    : "fixture archive before");
  return adaptAiidAllowedSnapshotMembers(members, {
    sourceArchiveHash: sha256(archiveCommitment),
    sourceArchiveBytes: archiveCommitment.length,
    termsSnapshotBytes: fixtureTerms(),
    generatedAt: options.changed ? "2026-08-18T00:00:00.000Z"
      : "2026-08-17T00:00:00.000Z",
  });
}

function resealArtifact(artifact) {
  artifact.sourceCommitmentHash = domainHash("outsider/aiid/allowed-snapshot-source/v1", {
    sourceArchiveHash: artifact.source.archiveHash,
    sourceArchiveBytes: artifact.source.archiveBytes,
    termsSnapshotHash: artifact.source.termsSnapshotHash,
    termsSnapshotBytes: artifact.source.termsSnapshotBytes,
    allowedMemberManifest: artifact.source.allowedMemberManifest,
    projectionHashes: {
      incidents: artifact.projections.incidents.map((row) => row.projectionHash),
      taxonomies: artifact.projections.taxonomies.map((row) => row.projectionHash),
      classifications: artifact.projections.classifications.map((row) => row.projectionHash),
      entities: artifact.projections.entities.map((row) => row.projectionHash),
    },
  });
  const { artifactHash: ignored, ...body } = artifact;
  artifact.artifactHash = domainHash(AIID_SNAPSHOT_EVIDENCE_SCHEMA, body);
  return artifact;
}

function tarBinary() {
  return ["/usr/bin/tar", "/bin/tar"].find(existsSync);
}

test("AIID safe projection admits four licensed collections without report text or submissions", () => {
  const artifact = fixtureArtifact();
  assert.equal(verifyAiidSnapshotEvidence(artifact).ok, true);
  assert.deepEqual(artifact.source.allowedCollections,
    ["incidents", "taxa", "classifications", "entities"]);
  assert.equal(artifact.source.sourceId, "CALLER_ASSERTED_SHAPED_FIXTURE");
  assert.equal(artifact.source.sourceTrustClass, "CALLER_ASSERTED_SHAPED_FIXTURE");
  assert.equal(artifact.source.publisher, null);
  assert.equal(artifact.source.snapshotPageUrl, null);
  assert.equal(artifact.source.termsUrl, null);
  assert.equal(artifact.source.sourceArtifactsReverified, false);
  assert.equal(artifact.source.forbiddenMemberAccessesByAdapter, 0);
  assert.equal(artifact.source.forbiddenMembersExtractedOrParsed, false);
  assert.equal(artifact.source.termsPolicyMarkersReplayed, false);
  assert.deepEqual(artifact.evidenceOntology.environmentReality, ["UNVERIFIED_FIXTURE"]);
  assert.deepEqual(artifact.evidenceOntology.authorityLevels, ["CALLER_ASSERTED"]);
  assert.equal(artifact.rightsBoundary.licensedCollectionDeclaration, "NOT_ESTABLISHED");
  assert.deepEqual(artifact.rightsBoundary.licensedCollections, []);
  assert.equal(artifact.rightsBoundary.termsSnapshotHash, artifact.source.termsSnapshotHash);
  assert.equal(artifact.counts.incidentDocuments, 1);
  assert.equal(artifact.counts.taxonomyDocuments, 1);
  assert.equal(artifact.counts.taxonomyExplicitPublicFields, 2);
  assert.equal(artifact.counts.taxonomyExplicitPrivateFields, 1);
  assert.equal(artifact.counts.taxonomyUnmarkedFields, 1);
  assert.equal(artifact.counts.classificationDocuments, 2);
  assert.equal(artifact.counts.publishedClassificationDocuments, 1);
  assert.equal(artifact.counts.unpublishedClassificationDocuments, 1);
  assert.equal(artifact.counts.admittedPublicClassificationAttributes, 2);
  assert.equal(artifact.counts.droppedNonPublicClassificationAttributes, 2);
  assert.equal(artifact.counts.entityDocuments, 2);
  assert.equal(artifact.boundary.admittedEconomicLossRows, 0);
  assert.equal(artifact.boundary.permitsPrice, false);
  assert.equal(artifact.boundary.causalEffectEligible, false);
  assert.equal(artifact.rightsBoundary.automaticTrainingAuthorizedByThisArtifact, false);
  assert.equal(artifact.evidenceOntology.formalAdjudicationEstablished, false);
  const serialized = JSON.stringify(artifact);
  for (const secret of ["SECRET INCIDENT", "SECRET EDITOR", "secret-deployer",
    "secret-developer", "secret-affected-party", "secret-system", "Secret Corp",
    "Secret Person", "SECRET REVIEWER", "SECRET ANNOTATOR", "SECRET VALUE",
    "PUBLIC-CATEGORY-SECRET", "UNPUBLISHED SECRET"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not persist`);
  }
  assert.equal(serialized.includes("UNMARKED SECRET FACTOR"), false);
  assert.equal(serialized.includes("Allowed Factor"), true);
  assert.equal(serialized.includes("Lives Lost"), true);
});

test("AIID archive replay extracts only exact allowed paths even when forbidden members exist", {
  skip: !tarBinary(),
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-aiid-test-"));
  try {
    const members = fixtureMembers();
    for (const [member, bytes] of Object.entries(members)) {
      const target = path.join(root, ...member.split("/"));
      mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes);
    }
    for (const [member, bytes] of [
      ["mongodump_full_snapshot/aiidprod/reports.bson", Buffer.from("FORBIDDEN REPORT TEXT")],
      ["mongodump_full_snapshot/aiidprod/submissions.bson", Buffer.from("FORBIDDEN SUBMISSION")],
      ["mongodump_full_snapshot/reports.csv", Buffer.from("FORBIDDEN REPORT CSV")],
      ["mongodump_full_snapshot/submissions.csv", Buffer.from("FORBIDDEN SUBMISSION CSV")],
    ]) {
      const target = path.join(root, ...member.split("/"));
      mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes);
    }
    const archivePath = path.join(root, "fixture.tar.bz2");
    const termsPath = path.join(root, "terms.html"); writeFileSync(termsPath, fixtureTerms());
    const result = spawnSync(tarBinary(), ["-cjf", archivePath, "mongodump_full_snapshot"], {
      cwd: root, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const archiveBytes = readFileSync(archivePath);
    const extracted = extractAiidAllowedMembersFromArchiveBytes(archiveBytes);
    extracted[AIID_ALLOWED_MEMBERS[0]].fill(0);
    assert.deepEqual(extractAiidAllowedMembersFromArchiveBytes(archiveBytes), members,
      'A caller cannot poison a later replay through returned buffers');
    assert.throws(() => extractAiidAllowedMembersFromArchiveBytes(Buffer.from('different archive')), /EXTRACTION_FAILED/);
    const artifact = buildAiidSnapshotEvidenceFromArchive(archivePath, {
      termsSnapshotPath: termsPath,
      generatedAt: "2026-08-17T00:00:00.000Z",
    });
    const verified = verifyAiidSnapshotEvidenceFromArchive(artifact, archivePath, termsPath);
    assert.equal(verified.ok, true);
    assert.equal(verified.inputBytesReproduced, true);
    assert.equal(verified.termsInputBytesReproduced, true);
    assert.equal(verified.sourceArtifactsReverified, false);
    assert.equal(verified.termsSnapshotReverified, false);
    assert.equal(verified.officialFrozenSourceReproduced, false);
    assert.equal(verified.verificationLevel,
      "CALLER_ASSERTED_FIXTURE_BYTES_REPRODUCED_ALLOWLIST_ONLY");
    assert.equal(verified.forbiddenMembersExtractedOrParsed, false);
    const serialized = JSON.stringify(artifact);
    assert.equal(serialized.includes("FORBIDDEN REPORT TEXT"), false);
    assert.equal(serialized.includes("FORBIDDEN SUBMISSION"), false);
    assert.equal(artifact.source.archiveHash, sha256(readFileSync(archivePath)));
    assert.throws(() => buildAiidSnapshotEvidenceFromArchive(archivePath, {
      termsSnapshotPath: termsPath,
      generatedAt: "2026-08-17T00:00:00.000Z",
      sourceArchiveHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      sourceArchiveBytes: 1,
      termsSnapshotBytes: Buffer.from("caller override"),
    }), /BUILD_OPTIONS_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AIID boundary cannot be resealed into causality, loss pricing, training rights, or raw values", () => {
  const mutations = [
    (copy) => { copy.boundary.causalExperienceUnits = 1; },
    (copy) => { copy.boundary.admittedEconomicLossRows = 1; },
    (copy) => { copy.boundary.permitsPrice = true; },
    (copy) => { copy.rightsBoundary.reportsText = "INGESTED"; },
    (copy) => { copy.rightsBoundary.automaticTrainingAuthorizedByThisArtifact = true; },
    (copy) => { copy.evidenceOntology.formalAdjudicationEstablished = true; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(fixtureArtifact()); mutate(copy); resealArtifact(copy);
    assert.equal(verifyAiidSnapshotEvidence(copy).ok, false);
  }
  const raw = structuredClone(fixtureArtifact());
  raw.projections.classifications[0].rawValue = "LEAKED RAW VALUE";
  const { projectionHash: ignored, ...classificationBody } = raw.projections.classifications[0];
  raw.projections.classifications[0].projectionHash = domainHash(
    "outsider/aiid/classification-projection/v1", classificationBody);
  resealArtifact(raw);
  assert.equal(verifyAiidSnapshotEvidence(raw).ok, false);
});

test("AIID shaped BSON plus copied terms phrases cannot be resealed into official origin or rights", () => {
  const promoted = structuredClone(fixtureArtifact());
  Object.assign(promoted.source, {
    sourceId: "AI_INCIDENT_DATABASE_LICENSED_COLLECTIONS",
    sourceTrustClass: "OFFICIAL_AIID_FROZEN_SOURCE_REPLAY",
    snapshotPageUrl: "https://incidentdatabase.ai/research/snapshots/",
    termsUrl: "https://incidentdatabase.ai/terms-of-use/",
    archiveUrl: "https://pub-72b2b2fc36ec423189843747af98f80e.r2.dev/backup-20260817101120.tar.bz2",
    archiveName: "backup-20260817101120.tar.bz2",
    snapshotAt: "2026-08-17T10:11:20.000Z",
    termsCapturedAt: "2026-08-21T00:00:00.000Z",
    termsEffectiveAt: "2025-08-07",
    termsPolicyMarkersReplayed: true,
    frozenProfileMatched: true,
    officialFrozenSourceVerified: true,
    sourceArtifactsReverified: true,
    publisher: "RESPONSIBLE_AI_COLLABORATIVE_AI_INCIDENT_DATABASE",
    publisherVeracityGuaranteeRecorded: false,
  });
  promoted.evidenceOntology = {
    environmentReality: ["ORGANIC", "REAL_SOFTWARE", "REAL_PHYSICAL_MIXED_UNKNOWN_PER_ROW"],
    empiricalStatus: "PUBLISHER_CURATED_ALLEGED_INCIDENT_CATALOG",
    observationOrigin: "PUBLISHER_SUMMARIES_AND_REVIEWER_CLASSIFICATIONS",
    authorityLevels: ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    affectedPartyReportClass: "NOT_DIRECTLY_OBSERVED_IN_ALLOWED_COLLECTIONS",
    sourceReportClass: "THIRD_PARTY_REPORT_REFERENCES_WITH_TEXT_EXCLUDED",
    independentObservationEstablished: false,
    formalAdjudicationEstablished: false,
    causalAttributionEstablished: false,
  };
  Object.assign(promoted.rightsBoundary, {
    sourceBytesAccess: "OFFICIAL_PUBLIC_SNAPSHOT_DOWNLOAD",
    licensedCollections: ["incidents", "taxa", "classifications", "entities"],
    licensedCollectionDeclaration: "CC_BY_SA_4_0_AS_STATED_BY_PUBLISHER_TERMS",
    attributionRequired: true,
    shareAlikeRequired: true,
    reportsText: "EXCLUDED_NOT_EXTRACTED_NOT_PARSED_NOT_RETAINED",
    submissions: "EXCLUDED_NOT_EXTRACTED_NOT_PARSED_NOT_RETAINED",
  });
  promoted.stewardshipUse.admitted = ["DESCRIPTIVE_CATALOG_COMPOSITION",
    "FACTOR_SCHEMA_CANDIDATES", "CONSEQUENCE_CHANNEL_DISCOVERY",
    "AFFECTED_PARTY_CLASS_DISCOVERY", "SOURCE_SNAPSHOT_CHANGE_REVIEW"];
  promoted.stewardshipUse.nextObservationNeed
    = "OWNER_BOUND_RUN_PLUS_AFFECTED_PARTY_REPORT_PLUS_RECOVERY_CHECK";
  for (const row of promoted.projections.incidents) {
    row.semantics.publisherCuratedAllegedIncident = true;
    const { projectionHash: ignored, ...body } = row;
    row.projectionHash = domainHash("outsider/aiid/incident-projection/v1", body);
  }
  resealArtifact(promoted);
  assert.equal(verifyAiidSnapshotEvidence(promoted).ok, false);
});

test("AIID snapshot diff is discovery-only and correlates stable safe projections", () => {
  const previous = fixtureArtifact();
  const current = fixtureArtifact({ changed: true });
  const diff = buildAiidSnapshotEvidenceDiff(previous, current);
  assert.deepEqual(diff.changes.incidents.counts,
    { added: 0, removed: 0, changed: 1, unchanged: 0 });
  assert.deepEqual(diff.changes.taxonomies.counts,
    { added: 0, removed: 0, changed: 0, unchanged: 1 });
  assert.deepEqual(diff.changes.classifications.counts,
    { added: 0, removed: 0, changed: 0, unchanged: 1 });
  assert.deepEqual(diff.changes.entities.counts,
    { added: 0, removed: 0, changed: 0, unchanged: 2 });
  assert.equal(diff.automaticPromotion, false);
  assert.equal(diff.boundary.automaticTraining, false);
  assert.equal(diff.boundary.permitsPrice, false);
  assert.equal(verifyAiidSnapshotEvidenceDiff(diff, previous, current).ok, true);
});

test("AIID BSON decoder rejects corrupt document boundaries", () => {
  const valid = bsonSequence([{ value: "ok" }]);
  assert.deepEqual(decodeAiidBsonSequence(valid), [{ value: "ok" }]);
  const corrupt = Buffer.from(valid); corrupt.writeInt32LE(valid.length + 1, 0);
  assert.throws(() => decodeAiidBsonSequence(corrupt), /BSON_TRUNCATED/);
});

test("AIID terms replay requires both collection license and explicit exclusions", () => {
  assert.equal(validateAiidTermsSnapshotBytes(fixtureTerms()).reportsTextExcluded, true);
  const missingExclusion = Buffer.from(fixtureTerms().toString("utf8")
    .replace("The text field of the reports collection", "A removed policy marker"));
  assert.throws(() => validateAiidTermsSnapshotBytes(missingExclusion),
    /TERMS_POLICY_MARKER_MISSING/);
});
