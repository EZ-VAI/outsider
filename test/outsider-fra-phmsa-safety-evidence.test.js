import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildFraPhmsaSafetyEvidenceFromBytes, buildFraPhmsaSafetyEvidenceFromSourceDirectory,
  FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821, FRA_PHMSA_FROZEN_SOURCE_20260821,
  verifyFraPhmsaSafetyEvidence,
  verifyFraPhmsaSafetyEvidenceWithSource,
} from "../src/outsider-fra-phmsa-safety-evidence.js";

const sourceDirectory = path.resolve("artifacts/fra-phmsa-safety-20260821/source-v2");
const artifactPath = path.resolve("artifacts/fra-phmsa-safety-20260821/final-v2/evidence.json");

function fixture() {
  return Object.fromEntries(FRA_PHMSA_FROZEN_SOURCE_20260821.files
    .map((file) => [file.name, Buffer.from(`fixture:${file.name}`)]));
}
function officialBytes() {
  return Object.fromEntries(FRA_PHMSA_FROZEN_SOURCE_20260821.files
    .map((file) => [file.name, readFileSync(path.join(sourceDirectory, file.name))]));
}
function reseal(artifact) {
  const { artifactHash: _old, ...withoutHash } = artifact;
  return { ...withoutHash, artifactHash: `sha256:${createHash("sha256")
    .update(canonicalizeStrict(withoutHash)).digest("hex")}` };
}

test("frozen FRA/PHMSA source has exact lane, object, and byte accounting", () => {
  const files = FRA_PHMSA_FROZEN_SOURCE_20260821.files;
  assert.equal(files.length, 12);
  assert.equal(new Set(files.map((file) => file.name)).size, 12);
  assert.equal(files.filter((file) => file.lane === "FRA").length, 11);
  assert.equal(files.filter((file) => file.lane === "PHMSA").length, 1);
  assert.equal(files.reduce((total, file) => total + file.bytes, 0), 2_400_987);
  assert.ok(files.every((file) => file.bytes > 0 && /^sha256:[a-f0-9]{64}$/u.test(file.sha256)));
});

test("seven canonical FRA queries bind dataset, full SoQL, URL, aliases, schema, and response pin", () => {
  const queryFiles = FRA_PHMSA_FROZEN_SOURCE_20260821.files.filter((file) => file.canonicalSoql);
  assert.equal(queryFiles.length, 7);
  assert.equal(Object.keys(FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821).length, 7);
  for (const file of queryFiles) {
    const url = new URL(file.url);
    const clauses = [["SELECT", url.searchParams.get("$select")], ["WHERE", url.searchParams.get("$where")],
      ["GROUP BY", url.searchParams.get("$group")], ["HAVING", url.searchParams.get("$having")],
      ["ORDER BY", url.searchParams.get("$order")], ["LIMIT", url.searchParams.get("$limit")]]
      .filter(([, value]) => value !== null).map(([keyword, value]) => `${keyword} ${value}`).join(" ");
    assert.equal(file.canonicalSoql, clauses);
    assert.equal(file.canonicalSoqlSha256, `sha256:${createHash("sha256")
      .update(Buffer.from(file.canonicalSoql, "utf8")).digest("hex")}`);
    assert.equal(url.pathname, `/resource/${file.datasetId}.json`);
    assert.doesNotMatch(file.url, /bounded-query/u);
    assert.match(file.canonicalSoql, /^SELECT .+ WHERE /u);
    assert.ok(Array.isArray(file.responseSchema) && file.responseSchema.length > 0);
    assert.match(file.sha256, /^sha256:[a-f0-9]{64}$/u);
  }
  const annualQueries = queryFiles.filter((file) => file.kind.includes("ANNUAL"));
  assert.equal(annualQueries.length, 2);
  assert.ok(annualQueries.every((file) => / GROUP BY year ORDER BY year LIMIT 50000$/u.test(file.canonicalSoql)));
  assert.match(FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form54Count.canonicalSoql,
    /count\(distinct incidentkey\).*jointcd='1'/u);
  assert.match(FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form55DuplicateMetrics.canonicalSoql,
    /GROUP BY .*railroadcode.* HAVING count\(\*\) > 1 ORDER BY /u);
  assert.doesNotMatch(FRA_PHMSA_CANONICAL_QUERY_SPECS_20260821.form55DuplicateMetrics.canonicalSoql,
    /railroadcode\s*=/u);
});

test("caller fixtures and even matching caller bytes cannot self-attest official identity", {
  skip: !existsSync(sourceDirectory),
}, () => {
  const shaped = buildFraPhmsaSafetyEvidenceFromBytes(fixture());
  assert.equal(shaped.source.profileMatchedAtBuild, false);
  assert.equal(shaped.source.sourceReality, "UNATTESTED_FIXTURE_BYTES");
  assert.equal(shaped.admission.realFraOutcomeAndExposureExperienceRecognized, false);
  assert.equal(shaped.admission.realPhmsaSourceReceiptRecognized, false);
  const matching = buildFraPhmsaSafetyEvidenceFromBytes(officialBytes());
  assert.equal(matching.source.callerBytesMatchedFrozenPins, true);
  assert.equal(matching.source.profileMatchedAtBuild, false);
  assert.equal(matching.lanes.fra.annual.length, 0);
  assert.equal(verifyFraPhmsaSafetyEvidenceWithSource(matching, sourceDirectory).ok, false);
});

test("official FRA population binds unique incidents, exposure, exact dedup, and descriptive rates", {
  skip: !existsSync(sourceDirectory),
}, () => {
  const artifact = buildFraPhmsaSafetyEvidenceFromSourceDirectory(sourceDirectory);
  const lane = artifact.lanes.fra;
  assert.equal(lane.realityStatus, "REAL_OPERATOR_REPORTED_AGENCY_PUBLISHED_EXPERIENCE");
  assert.equal(lane.population.form54JointCd1Rows, 10_449);
  assert.equal(lane.population.form54DistinctIncidentKeys, 10_449);
  assert.equal(lane.population.form55PublishedRows, 48_843);
  assert.equal(lane.population.form55DeduplicatedMonthlyRailroadRows, 48_842);
  assert.equal(lane.deduplication.duplicateCompositeKeyGroups, 1);
  assert.equal(lane.deduplication.identicalDuplicateRowsRemoved, 1);
  assert.equal(lane.deduplication.operatorIdentifierEmitted, false);
  assert.equal(lane.annual.length, 5);
  assert.equal(lane.pooled.uniqueReportedIncidents, 10_449);
  assert.equal(lane.pooled.totalReportedDamageDollars, "1573388754");
  assert.equal(lane.pooled.totalTrainMiles, "3529396874");
  assert.equal(lane.pooled.incidentRatePerMillionTrainMiles.value, 2.960562491);
  assert.equal(lane.annual[4].totalTrainMiles, "680816572");
  assert.equal(lane.annual[4].deduplicatedMonthlyRailroadRows, 9841);
  assert.equal(lane.lossBoundary.paidLoss, false);
  assert.equal(lane.lossBoundary.ultimateLoss, false);
  assert.equal(lane.queryChain.canonicalQueryReceiptCount, 7);
  assert.equal(lane.queryChain.allResponseSchemasVerified, true);
  assert.equal(lane.queryChain.officialAggregateApiResponseBytesReaggregatedLocally, true);
  assert.equal(lane.queryChain.rawRowPopulationDownloaded, false);
  assert.equal(lane.queryChain.transportAttested, false);
});

test("FRA source roles do not conflate publication, review, causality, or adjudication", {
  skip: !existsSync(sourceDirectory),
}, () => {
  const lane = buildFraPhmsaSafetyEvidenceFromSourceDirectory(sourceDirectory).lanes.fra;
  assert.equal(lane.reportingRoles.operatorReported, true);
  assert.equal(lane.reportingRoles.agencyPublished, true);
  assert.equal(lane.reportingRoles.agencyReviewedEachUnderlyingFact, false);
  assert.equal(lane.reportingRoles.causalClassificationAdjudicated, false);
  assert.equal(lane.reportingRoles.legalLiabilityAdjudicated, false);
  assert.equal(lane.classification.causeTypeAggregateCells, 2083);
  assert.equal(Object.values(lane.classification.reportedCauseFamilyCounts)
    .reduce((total, count) => total + count, 0), 10_449);
  assert.equal(lane.classification.causalEffectsIdentified, false);
  assert.equal(lane.schema.officialUniqueView.currentlyExecutableAtFreeze, false);
  assert.equal(lane.schema.officialUniqueView.machineStatus, "DEFERRED_UPSTREAM_SCHEMA_DRIFT");
  assert.equal(lane.schema.reportKeyNotUsedForDeduplication, true);
});

test("real PHMSA incident receipt remains machine-deferred without matched annual exposure and rights", {
  skip: !existsSync(sourceDirectory),
}, () => {
  const lane = buildFraPhmsaSafetyEvidenceFromSourceDirectory(sourceDirectory).lanes.phmsa;
  assert.equal(lane.realityStatus, "REAL_OPERATOR_SUBMITTED_AGENCY_PUBLISHED_INCIDENT_RECORD_SNAPSHOT");
  assert.equal(lane.sourceReceipt.reportedRows, 1589);
  assert.equal(lane.sourceReceipt.headerColumns, 468);
  assert.equal(lane.sourceReceipt.formRevision, "9-2023");
  assert.equal(Object.values(lane.sourceReceipt.observedYearCounts)
    .reduce((total, count) => total + count, 0), 1589);
  assert.equal(lane.denominatorBoundary.matchingAnnualReportZipCaptured, false);
  assert.equal(lane.denominatorBoundary.frequencyOrSeverityRateCalculated, false);
  assert.equal(lane.admission.realIncidentSourceReceiptRecognized, true);
  assert.equal(lane.admission.outcomeOrActuarialModelInputAdmitted, false);
  assert.equal(lane.admission.machineStatus,
    "DEFERRED_MISSING_MATCHED_ANNUAL_EXPOSURE_RIGHTS_AND_VERSION_BINDING");
  assert.equal(lane.authority.TRAIN, false);
});

test("standalone verification is structure-only and rejects authority or rights escalation", () => {
  const artifact = buildFraPhmsaSafetyEvidenceFromBytes(fixture());
  const checked = verifyFraPhmsaSafetyEvidence(artifact);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "STRUCTURE_ONLY");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.realCaseOrExperienceAdmissionEstablished, false);
  const authority = reseal({ ...artifact, authority: { ...artifact.authority, PRICE: true } });
  assert.equal(verifyFraPhmsaSafetyEvidence(authority).ok, false);
  const rights = reseal({ ...artifact, rights: { ...artifact.rights, modelTrainingRightConcluded: true } });
  assert.equal(verifyFraPhmsaSafetyEvidence(rights).ok, false);
});

test("resealed derivation changes fail exact source replay", { skip: !existsSync(sourceDirectory) }, () => {
  const artifact = buildFraPhmsaSafetyEvidenceFromSourceDirectory(sourceDirectory);
  const attacked = reseal({ ...artifact, progress: { ...artifact.progress, causalModel: "ASSERTED" } });
  assert.equal(verifyFraPhmsaSafetyEvidence(attacked).ok, true);
  const checked = verifyFraPhmsaSafetyEvidenceWithSource(attacked, sourceDirectory);
  assert.equal(checked.ok, false);
  assert.equal(checked.officialSourceProfileReproduced, true);
  assert.equal(checked.candidateArtifactExactlyRebuilt, false);
  assert.equal(checked.sourceTruthEstablished, false);
});

test("missing or changed canonical query bindings fail even after artifact resealing", {
  skip: !existsSync(sourceDirectory),
}, () => {
  const artifact = buildFraPhmsaSafetyEvidenceFromSourceDirectory(sourceDirectory);
  const missingFiles = artifact.source.files.map((file, index) => {
    if (index !== 3) return file;
    const { canonicalSoql: _missing, ...withoutQuery } = file;
    return withoutQuery;
  });
  const missing = reseal({ ...artifact, source: { ...artifact.source, files: missingFiles } });
  const missingCheck = verifyFraPhmsaSafetyEvidence(missing);
  assert.equal(missingCheck.ok, false);
  assert.ok(missingCheck.errors.some((error) => error.startsWith("SOURCE_CANONICAL_QUERY_BINDING_INVALID")));

  const changedFiles = artifact.source.files.map((file, index) => index === 4
    ? { ...file, canonicalSoql: `${file.canonicalSoql} LIMIT 1`,
      canonicalSoqlSha256: `sha256:${createHash("sha256")
        .update(Buffer.from(`${file.canonicalSoql} LIMIT 1`, "utf8")).digest("hex")}` }
    : file);
  const changed = reseal({ ...artifact, source: { ...artifact.source, files: changedFiles } });
  const changedCheck = verifyFraPhmsaSafetyEvidence(changed);
  assert.equal(changedCheck.ok, false);
  assert.ok(changedCheck.errors.some((error) => error.startsWith("SOURCE_CANONICAL_QUERY_BINDING_INVALID")));
});

test("resealed rate mismatch fails exact source-aware reconstruction", {
  skip: !existsSync(sourceDirectory),
}, () => {
  const artifact = buildFraPhmsaSafetyEvidenceFromSourceDirectory(sourceDirectory);
  const annual = artifact.lanes.fra.annual.map((row, index) => index === 0
    ? { ...row, incidentRatePerMillionTrainMiles: { ...row.incidentRatePerMillionTrainMiles,
      value: row.incidentRatePerMillionTrainMiles.value + 0.000000001 } }
    : row);
  const attacked = reseal({ ...artifact, lanes: { ...artifact.lanes,
    fra: { ...artifact.lanes.fra, annual } } });
  assert.equal(verifyFraPhmsaSafetyEvidence(attacked).ok, true);
  const checked = verifyFraPhmsaSafetyEvidenceWithSource(attacked, sourceDirectory);
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.errors, ["EXACT_REBUILD_MISMATCH"]);
});

test("source directory rejects extra and symlinked members", () => {
  const extra = mkdtempSync(path.join(tmpdir(), "outsider-fra-phmsa-extra-"));
  writeFileSync(path.join(extra, "unexpected"), "x");
  assert.throws(() => buildFraPhmsaSafetyEvidenceFromSourceDirectory(extra),
    /SOURCE_DIRECTORY_PROFILE_MISMATCH/u);
  const linked = mkdtempSync(path.join(tmpdir(), "outsider-fra-phmsa-linked-"));
  for (const file of FRA_PHMSA_FROZEN_SOURCE_20260821.files) writeFileSync(path.join(linked, file.name), "x");
  writeFileSync(path.join(linked, "acquisition.json"), "x");
  const first = path.join(linked, FRA_PHMSA_FROZEN_SOURCE_20260821.files[0].name);
  unlinkSync(first);
  symlinkSync(path.join(linked, FRA_PHMSA_FROZEN_SOURCE_20260821.files[1].name), first);
  assert.throws(() => buildFraPhmsaSafetyEvidenceFromSourceDirectory(linked), /SOURCE_FILE_UNSAFE/u);
});

test("canonical artifact performs full exact source-aware replay", {
  skip: !(existsSync(sourceDirectory) && existsSync(artifactPath)),
}, () => {
  const serialized = readFileSync(artifactPath);
  const artifact = JSON.parse(serialized.toString("utf8"));
  const checked = verifyFraPhmsaSafetyEvidenceWithSource(artifact, sourceDirectory);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_OFFICIAL_FRA_PHMSA_SOURCE_REPLAYED");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.candidateArtifactExactlyRebuilt, true);
  assert.equal(checked.sourceTruthEstablished, false);
  assert.equal(checked.institutionalAuthorityEstablished, false);
  assert.equal(checked.canonicalQueryChainReproduced, true);
  assert.equal(checked.transportAttested, false);
  assert.equal(artifact.artifactHash,
    "sha256:faf6c83de86433ad2e97abfb63fca2a1b6045692acd39a8ff56916fcd9082836");
  assert.equal(`sha256:${createHash("sha256").update(serialized).digest("hex")}`,
    "sha256:97326061fffefe20cb06c6640ea0f1c28e55a2edc2cd8a211ecb8dd1db4ba7ff");
});

test("FRA/PHMSA CLIs expose exact acquisition and structure/source verification", {
  skip: !existsSync(artifactPath),
}, () => {
  const help = spawnSync(process.execPath, ["scripts/acquire-fra-phmsa-safety-evidence.mjs", "--help"],
    { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--phmsa-dir/u);
  const structure = spawnSync(process.execPath, ["scripts/fra-phmsa-safety-evidence.mjs", "verify",
    "--artifact", artifactPath], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(structure.status, 0, structure.stderr);
  assert.equal(JSON.parse(structure.stdout).verificationLevel, "STRUCTURE_ONLY");
  const full = spawnSync(process.execPath, ["scripts/fra-phmsa-safety-evidence.mjs", "verify-source",
    "--artifact", artifactPath, "--source", sourceDirectory],
  { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(full.status, 0, full.stderr);
  assert.equal(JSON.parse(full.stdout).candidateArtifactExactlyRebuilt, true);
});
