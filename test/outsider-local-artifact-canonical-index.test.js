import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildLocalArtifactCanonicalIndex, verifyLocalArtifactCanonicalIndex,
  verifyLocalArtifactIndexSupersessionV3, verifyLocalArtifactIndexSupersessionV4,
} from "../scripts/local-artifact-canonical-index.mjs";

const temp = () => mkdtempSync(path.join(tmpdir(), "outsider-local-index-"));
const artifact = (hash) => JSON.stringify({ artifactHash: hash });
const H1 = `sha256:${"1".repeat(64)}`, H2 = `sha256:${"2".repeat(64)}`;
const H3 = `sha256:${"3".repeat(64)}`;
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const tagged = (domain, value) => sha256(Buffer.from(
  `${domain}\0${canonicalizeStrict(value)}`, "utf8",
));
const EXACT_LINEAGE_SCHEMA = "outsider/exact-artifact-lineage-supersession/v1";

function exactLineageMarker({ sourceFamily, sourceRelease, sourceFile,
  sourceSemanticField = "artifactHash", sourceHash, sourceBytes,
  targetFamily, targetRelease, targetFile, targetSemanticField = "artifactHash",
  targetHash, targetBytes, sourceTime = null, targetTime = null }) {
  const body = {
    schema: EXACT_LINEAGE_SCHEMA,
    schemaVersion: "1.0.0",
    status: "SUPERSEDED_EXACT_BYTES_PRESERVED",
    lineageScope: sourceFamily === targetFamily
      ? "SAME_DECLARED_FAMILY_EXACT_SUCCESSOR"
      : "DECLARATION_AUTHORIZED_EXACT_CROSS_FAMILY_SUCCESSOR",
    supersededFamily: sourceFamily,
    supersededRelease: sourceRelease,
    supersededArtifactPath: `artifacts/${sourceFamily}/${sourceRelease}/${sourceFile}`,
    supersededSemanticHashField: sourceSemanticField,
    supersededArtifactHash: sourceHash,
    supersededArtifactFileHash: sha256(sourceBytes),
    supersededArtifactFileBytes: sourceBytes.length,
    supersededArtifactBytesPreserved: true,
    successorFamily: targetFamily,
    supersededByRelease: targetRelease,
    currentCanonicalPath: `artifacts/${targetFamily}/${targetRelease}/${targetFile}`,
    currentSemanticHashField: targetSemanticField,
    currentArtifactHash: targetHash,
    currentArtifactFileHash: sha256(targetBytes),
    currentArtifactFileBytes: targetBytes.length,
    previousDeclaredTimeField: sourceTime === null ? null : "generatedAt",
    previousDeclaredAt: sourceTime,
    currentDeclaredTimeField: targetTime === null ? null : "generatedAt",
    currentDeclaredAt: targetTime,
    temporalOrderingStatus: sourceTime !== null && targetTime !== null
      ? "DECLARED_ARTIFACT_TIMES_NONDECREASING_LOCAL_BYTES_ONLY"
      : "DECLARED_ARTIFACT_TIME_UNAVAILABLE_NO_TEMPORAL_AUTHENTICITY_CLAIM",
    reason: "EXACT_BYTE_LINEAGE_TEST_SUCCESSOR",
    selectionAuthority: "CODE_FIXED_EXACT_BYTE_LINEAGE_ROUTE_NOT_EVIDENCE_CURRENTNESS",
    sourceArtifactsReverifiedByMarker: false,
    sourceTruthEstablishedByMarker: false,
    closureCredit: 0,
    causalExperienceUnits: 0,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
  };
  return { ...body, markerHash: tagged(EXACT_LINEAGE_SCHEMA, body) };
}

function fixture() {
  const root = temp();
  const family = path.join(root, "lane-a");
  mkdirSync(path.join(family, "final-v1"), { recursive: true });
  mkdirSync(path.join(family, "final-v2"));
  writeFileSync(path.join(family, "final-v1", "evidence.json"), artifact(H1));
  writeFileSync(path.join(family, "final-v1", "superseded-by.json"),
    JSON.stringify({ schema: "outsider/artifact-supersession/v1",
      supersededBy: "../final-v2/evidence.json" }));
  writeFileSync(path.join(family, "final-v2", "evidence.json"), artifact(H2));
  const declaration = {
    schema: "outsider/local-artifact-canonical-declaration/v2",
    indexedAt: "2026-08-22T18:00:00.000Z",
    entries: [{ family: "lane-a", currentRelease: "final-v2",
      canonicalFile: "evidence.json", semanticHashField: "artifactHash" }],
    crossFamilyLineages: [],
  };
  return { root, declaration };
}

function crossFamilyFixture() {
  const root = temp();
  const oldFamily = "model-old", newFamily = "model-new";
  const oldRelease = path.join(root, oldFamily, "final-v1");
  const newV2 = path.join(root, newFamily, "final-v2");
  const newV3 = path.join(root, newFamily, "final-v3");
  mkdirSync(oldRelease, { recursive: true });
  mkdirSync(newV2, { recursive: true });
  mkdirSync(newV3);
  const oldArtifact = Buffer.from(JSON.stringify({ artifactHash: H1,
    generatedAt: "2026-08-22T01:00:00.000Z" }));
  const entryArtifact = Buffer.from(JSON.stringify({ artifactHash: H2,
    generatedAt: "2026-08-28T02:00:00.000Z" }));
  const currentArtifact = Buffer.from(JSON.stringify({ artifactHash: H3,
    generatedAt: "2026-08-28T03:00:00.000Z" }));
  writeFileSync(path.join(oldRelease, "architecture.json"), oldArtifact);
  writeFileSync(path.join(newV2, "architecture.json"), entryArtifact);
  writeFileSync(path.join(newV3, "architecture.json"), currentArtifact);
  writeFileSync(path.join(newV2, "SUPERSEDED.json"), JSON.stringify({
    schema: "outsider/artifact-supersession/v1",
    supersededBy: "../final-v3/architecture.json",
  }));
  const markerBody = {
    schema: "outsider/actuarial-model-evolution-supersession/v1",
    schemaVersion: "1.0.0",
    status: "SUPERSEDED",
    supersededRelease: "final-v1",
    supersededArtifactPath:
      "artifacts/model-old/final-v1/architecture.json",
    supersededArtifactHash: H1,
    supersededArtifactFileHash: sha256(oldArtifact),
    supersededArtifactFileBytes: oldArtifact.length,
    supersededArtifactBytesPreserved: true,
    supersededByRelease: "final-v2",
    currentCanonicalPath:
      "artifacts/model-new/final-v2/architecture.json",
    reason: "EXACT_DECLARATION_AUTHORIZED_CROSS_FAMILY_SUCCESSOR",
    previousGeneratedAt: "2026-08-22T01:00:00.000Z",
    currentSnapshotAsOf: "2026-08-28T02:00:00.000Z",
    previousFrozenMathRelease: "final-v1",
    currentFrozenMathRelease: "final-v2",
    currentFrozenMathArtifactHash: H2,
    targetPreActionPredictorsAdmitted: 0,
    targetPrice: null,
    targetDomainTransferEstablished: false,
    operationalAuthorityGranted: false,
    selectionAuthority:
      "CODE_FIXED_CANONICAL_RELEASE_SELECTION_NOT_EVIDENCE_TEMPORAL_CURRENTNESS",
  };
  const marker = { ...markerBody, markerHash: tagged(markerBody.schema, markerBody) };
  const markerBytes = Buffer.from(JSON.stringify(marker));
  writeFileSync(path.join(oldRelease, "SUPERSEDED.json"), markerBytes);
  const declaration = {
    schema: "outsider/local-artifact-canonical-declaration/v2",
    indexedAt: "2026-08-28T04:00:00.000Z",
    entries: [
      { family: newFamily, currentRelease: "final-v3",
        canonicalFile: "architecture.json", semanticHashField: "artifactHash" },
      { family: oldFamily, currentRelease: "final-v1",
        canonicalFile: "architecture.json", semanticHashField: "artifactHash",
        selectionStatus: "ARCHIVED_CROSS_FAMILY_PREDECESSOR_ONLY" },
    ],
    crossFamilyLineages: [{
      predecessorFamily: oldFamily,
      predecessorTerminalRelease: "final-v1",
      predecessorArtifactHash: H1,
      predecessorArtifactFileHash: sha256(oldArtifact),
      predecessorArtifactFileBytes: oldArtifact.length,
      predecessorMarkerRepositoryRelativePath:
        "artifacts/model-old/final-v1/SUPERSEDED.json",
      predecessorMarkerSchema: marker.schema,
      predecessorMarkerHash: marker.markerHash,
      predecessorMarkerFileHash: sha256(markerBytes),
      predecessorMarkerFileBytes: markerBytes.length,
      successorFamily: newFamily,
      successorEntryRelease: "final-v2",
      successorArtifactHash: H2,
      successorArtifactFileHash: sha256(entryArtifact),
      successorArtifactFileBytes: entryArtifact.length,
    }],
  };
  return { root, declaration, markerPath: path.join(oldRelease, "SUPERSEDED.json") };
}

test("local artifact index binds current bytes and supersession chains", () => {
  const { root, declaration } = fixture();
  try {
    const index = buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot: root,
      now: "2026-08-22T18:01:00.000Z" });
    assert.equal(index.versionedFamilyCount, 1);
    assert.equal(index.entries[0].semanticHash, H2);
    assert.equal(index.entries[0].supersededReleaseCount, 1);
    assert.equal(index.entries[0].supersededReleaseHistory[0].resolvedTargetRelease,
      "final-v2");
    assert.equal(index.entries[0].supersessionChainEstablished, true);
    assert.equal(verifyLocalArtifactCanonicalIndex({ declaration, artifact: index,
      artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }).ok, true);
    const changed = structuredClone(index);
    changed.entries[0].semanticHash = H1;
    assert.equal(verifyLocalArtifactCanonicalIndex({ declaration, artifact: changed,
      artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("exact lineage markers bind same-family source and successor bytes", () => {
  const { root, declaration } = fixture();
  try {
    const sourcePath = path.join(root, "lane-a", "final-v1", "evidence.json");
    const targetPath = path.join(root, "lane-a", "final-v2", "evidence.json");
    const markerPath = path.join(root, "lane-a", "final-v1", "superseded-by.json");
    const sourceBytes = readFileSync(sourcePath), targetBytes = readFileSync(targetPath);
    const marker = exactLineageMarker({ sourceFamily: "lane-a",
      sourceRelease: "final-v1", sourceFile: "evidence.json", sourceHash: H1,
      sourceBytes, targetFamily: "lane-a", targetRelease: "final-v2",
      targetFile: "evidence.json", targetHash: H2, targetBytes });
    writeFileSync(markerPath, JSON.stringify(marker));
    const index = buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot: root,
      now: "2026-08-22T18:01:00.000Z" });
    assert.equal(index.entries[0].supersededReleaseHistory[0]
      .exactLineageMarkerArtifactIdentityVerified, true);

    const changedBody = { ...marker, currentArtifactHash: H3 };
    delete changedBody.markerHash;
    const changed = { ...changedBody,
      markerHash: tagged(EXACT_LINEAGE_SCHEMA, changedBody) };
    writeFileSync(markerPath, JSON.stringify(changed));
    assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
      artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }),
    /EXACT_LINEAGE_MARKER_ARTIFACT_BINDING_INVALID/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("declaration v2 binds an exact cross-family predecessor into one current lineage", () => {
  const { root, declaration } = crossFamilyFixture();
  try {
    const index = buildLocalArtifactCanonicalIndex({ declaration,
      artifactsRoot: root, now: "2026-08-28T04:01:00.000Z" });
    const oldEntry = index.entries.find((entry) => entry.family === "model-old");
    const newEntry = index.entries.find((entry) => entry.family === "model-new");
    const bridge = index.crossFamilyLineageReceipts[0];
    assert.equal(index.schema, "outsider/local-artifact-canonical-index/v4");
    assert.equal(index.crossFamilyLineageCount, 1);
    assert.equal(oldEntry.familySelectionStatus,
      "ARCHIVED_CROSS_FAMILY_PREDECESSOR_ONLY");
    assert.equal(oldEntry.currentRelease, null);
    assert.equal(oldEntry.archivedTerminalRelease, "final-v1");
    assert.equal(newEntry.familySelectionStatus,
      "CURRENT_CANONICAL_WITHIN_DECLARED_LINEAGE");
    assert.equal(newEntry.currentRelease, "final-v3");
    assert.deepEqual(newEntry.supersededReleaseHistory.map((release) =>
      [release.release, release.resolvedTargetRelease]),
    [["final-v2", "final-v3"]]);
    assert.equal(bridge.predecessorMarkerExactBytesVerified, true);
    assert.equal(bridge.predecessorMarkerSchemaVerified, true);
    assert.equal(bridge.predecessorMarkerTargetExactPathVerified, true);
    assert.equal(bridge.sameFamilySuccessorChainToCurrentEstablished, true);
    assert.equal(bridge.sourceTruthEstablished, false);
    assert.equal(bridge.targetTrainingOrPricingAuthorityGranted, false);
    assert.equal(verifyLocalArtifactCanonicalIndex({ declaration,
      artifact: index, artifactsRoot: root,
      now: "2026-08-28T04:01:00.000Z" }).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("declaration v2 accepts only exact-bound generic cross-family lineage markers", () => {
  const { root, declaration, markerPath } = crossFamilyFixture();
  try {
    const sourcePath = path.join(root, "model-old", "final-v1", "architecture.json");
    const targetPath = path.join(root, "model-new", "final-v2", "architecture.json");
    const sourceBytes = readFileSync(sourcePath), targetBytes = readFileSync(targetPath);
    const marker = exactLineageMarker({ sourceFamily: "model-old",
      sourceRelease: "final-v1", sourceFile: "architecture.json", sourceHash: H1,
      sourceBytes, targetFamily: "model-new", targetRelease: "final-v2",
      targetFile: "architecture.json", targetHash: H2, targetBytes,
      sourceTime: "2026-08-22T01:00:00.000Z",
      targetTime: "2026-08-28T02:00:00.000Z" });
    const markerBytes = Buffer.from(JSON.stringify(marker));
    writeFileSync(markerPath, markerBytes);
    const lineage = declaration.crossFamilyLineages[0];
    lineage.predecessorMarkerSchema = marker.schema;
    lineage.predecessorMarkerHash = marker.markerHash;
    lineage.predecessorMarkerFileHash = sha256(markerBytes);
    lineage.predecessorMarkerFileBytes = markerBytes.length;
    const index = buildLocalArtifactCanonicalIndex({ declaration,
      artifactsRoot: root, now: "2026-08-28T04:00:00.000Z" });
    assert.equal(index.crossFamilyLineageCount, 1);
    assert.equal(index.crossFamilyLineageReceipts[0]
      .predecessorMarkerExactBytesVerified, true);
    assert.equal(index.entries.find((entry) => entry.family === "model-old")
      .currentRelease, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("frozen index v11 preserves exact history while later artifacts remain quarantined",
  { timeout: 180_000 }, () => {
    const declaration = JSON.parse(readFileSync("local-canonical-artifacts.json", "utf8"));
    const historicalV9Path =
      "artifact-index/local-canonical-index-20260822/final-v9/index.json";
    const historicalV10Path =
      "artifact-index/local-canonical-index-20260822/final-v10/index.json";
    const currentV11Path =
      "artifact-index/local-canonical-index-20260822/final-v11/index.json";
    const historicalV8 = verifyLocalArtifactIndexSupersessionV3({
      markerPath: "artifact-index/local-canonical-index-20260822/final-v7/superseded-by.json",
      predecessorPath: "artifact-index/local-canonical-index-20260822/final-v7/index.json",
      successorPath: "artifact-index/local-canonical-index-20260822/final-v8/index.json",
      declaration, artifactsRoot: "artifacts",
    });
    assert.equal(historicalV8.ok, true, historicalV8.error);
    assert.equal(historicalV8.successorHistoricalSelfHashVerified, true);
    assert.equal(historicalV8.successorExactRebuildVerified, false);
    assert.equal(historicalV8.successorCurrentSelectionVerified, false);
    const historicalReceipts = [
      ["artifact-index/local-canonical-index-20260822/final-v8/superseded-by.json",
        "artifact-index/local-canonical-index-20260822/final-v8/index.json",
        "SAME_FAMILY_EXACT_SUCCESSOR"],
      ["artifact-index/local-canonical-index-20260828/final-v8/superseded-by.json",
        "artifact-index/local-canonical-index-20260828/final-v8/index.json",
        "DECLARATION_AUTHORIZED_EXACT_CROSS_FAMILY_REJECTION_SUCCESSOR"],
    ];
    for (const [markerPath, predecessorPath, lineageScope] of historicalReceipts) {
      const verified = verifyLocalArtifactIndexSupersessionV4({ markerPath,
        predecessorPath, successorPath: historicalV9Path, declaration,
        artifactsRoot: "artifacts", requireSuccessorExactRebuild: false });
      assert.equal(verified.ok, true, verified.error);
      assert.equal(verified.lineageScope, lineageScope);
      assert.equal(verified.successorExactBytesVerified, true);
      assert.equal(verified.successorHistoricalSelfHashVerified, true);
      assert.equal(verified.successorExactRebuildVerified, false);
      assert.equal(verified.successorCurrentSelectionVerified, false);
      assert.equal(verified.sourceTruthEstablishedByMarker, false);
      assert.equal(verified.trainingAdmission, false);
      assert.equal(verified.pricingAdmission, false);
      assert.equal(verified.operationalAuthorityGranted, false);
    }
    assert.equal(sha256(readFileSync(historicalV9Path)),
      "sha256:f97dfdb6885166b1046a6613d7b89c80d67b25b977818a324d92a60b660f17e8");
    const historicalV10 = verifyLocalArtifactIndexSupersessionV4({
      markerPath:
        "artifact-index/local-canonical-index-20260822/final-v9/superseded-by.json",
      predecessorPath: historicalV9Path, successorPath: historicalV10Path,
      declaration, artifactsRoot: "artifacts",
      requireSuccessorExactRebuild: false,
    });
    assert.equal(historicalV10.ok, true, historicalV10.error);
    assert.equal(historicalV10.successorHistoricalSelfHashVerified, true);
    assert.equal(historicalV10.successorExactRebuildVerified, false);
    assert.equal(historicalV10.successorCurrentSelectionVerified, false);

    const current = verifyLocalArtifactIndexSupersessionV4({
      markerPath:
        "artifact-index/local-canonical-index-20260822/final-v10/superseded-by.json",
      predecessorPath: historicalV10Path, successorPath: currentV11Path,
      declaration, artifactsRoot: "artifacts", requireSuccessorExactRebuild: false,
    });
    assert.equal(current.ok, true, current.error);
    assert.equal(current.lineageScope, "SAME_FAMILY_EXACT_SUCCESSOR");
    assert.equal(current.successorHistoricalSelfHashVerified, true);
    assert.equal(current.successorExactRebuildVerified, false);
    assert.equal(current.successorCurrentSelectionVerified, false);
    assert.equal(current.sourceArtifactsReverifiedByMarker, false);
    assert.equal(current.sourceTruthEstablishedByMarker, false);
    assert.equal(current.closureCredit, 0);
    assert.equal(current.causalExperienceUnits, 0);
    assert.equal(current.trainingAdmission, false);
    assert.equal(current.pricingAdmission, false);
    assert.equal(current.operationalAuthorityGranted, false);

    const v11 = JSON.parse(readFileSync(currentV11Path, "utf8"));
    // v11 commits the entire September 2 directory. Later unversioned output
    // must not rewrite it or acquire authority simply by existing on disk.
    const live = buildLocalArtifactCanonicalIndex({declaration, artifactsRoot: "artifacts"});
    assert.deepEqual(live.entries, v11.entries);
    assert.deepEqual(live.crossFamilyLineageReceipts, v11.crossFamilyLineageReceipts);
    assert.deepEqual(live.artifactsRootEntries, v11.artifactsRootEntries);
    const priorFamilies = new Set(v11.unversionedQuarantine.map(row => row.family));
    assert.deepEqual(live.unversionedQuarantine.filter(row => priorFamilies.has(row.family)), v11.unversionedQuarantine);
    const added = live.unversionedQuarantine.filter(row => !priorFamilies.has(row.family));
    assert.ok(added.length > 0);
    assert.ok(added.every(row => row.selectedAsCanonical === false
      && row.status === 'UNVERSIONED_OR_NONCANONICAL_BYTE_BOUND_QUARANTINE'));
    assert.notEqual(live.indexHash, v11.indexHash);
    assert.equal(v11.indexedAt, declaration.indexedAt);
    assert.equal(v11.versionedFamilyCount, 34);
    assert.equal(v11.crossFamilyLineageCount, 6);
    assert.equal(v11.unversionedQuarantineCount, 451);
    assert.equal(v11.indexReplaysArtifactSources, false);
    assert.equal(v11.crossFamilyLineageGrantsSourceTruthTrainingPricingOrAuthority,
      false);
    const quarantined = new Set(v11.unversionedQuarantine
      .filter((entry) => entry.selectedAsCanonical === false
        && entry.status === "UNVERSIONED_OR_NONCANONICAL_BYTE_BOUND_QUARANTINE")
      .map((entry) => entry.family));
    const newlyBound = [
      "outsider-agent-trajectory-sentinel-quarantine-20260828-v1",
      "outsider-agent-trajectory-sentinel-quarantine-20260829-v2",
      "outsider-episode-data-engine-20260829-heartbeat-v3",
      "outsider-stale-constraint-episodes-20260828-v1",
      "outsider-stale-constraint-episodes-20260828-v2",
    ];
    assert.equal(newlyBound.every((family) => quarantined.has(family)), true);

    const archivedStage0 = v11.entries.find((entry) =>
      entry.family === "stage0-evidence-chain-current-20260828");
    const currentStage0 = v11.entries.find((entry) =>
      entry.family === "stage0-evidence-chain-current-20260902");
    const stage0Lineage = v11.crossFamilyLineageReceipts.find((receipt) =>
      receipt.predecessorFamily === "stage0-evidence-chain-current-20260828");
    assert.equal(archivedStage0.familySelectionStatus,
      "ARCHIVED_CROSS_FAMILY_PREDECESSOR_ONLY");
    assert.equal(archivedStage0.currentRelease, null);
    assert.equal(currentStage0.currentRelease, "final-v4");
    assert.equal(currentStage0.semanticHash,
      "sha256:2596aa2c3d8beafeff6fb6dd0bf624c659e71350887cfcb2c0d5340df61c0641");
    assert.deepEqual(currentStage0.supersededReleaseHistory.map((release) =>
      [release.release, release.resolvedTargetRelease]),
    [["final-v2", "final-v3"], ["final-v3", "final-v4"]]);
    assert.equal(stage0Lineage.successorEntryRelease, "final-v2");
    assert.equal(stage0Lineage.sameFamilySuccessorChainToCurrentEstablished, true);
    assert.equal(stage0Lineage.sourceTruthEstablished, false);

    let newestObservedMtime = 0;
    const pending = newlyBound.map((family) => path.join("artifacts", family));
    while (pending.length > 0) {
      const candidate = pending.pop();
      const stat = lstatSync(candidate);
      if (stat.isDirectory()) {
        pending.push(...readdirSync(candidate).map((name) => path.join(candidate, name)));
      } else if (stat.isFile()) newestObservedMtime = Math.max(
        newestObservedMtime, stat.mtimeMs);
    }
    assert.equal(Date.parse(declaration.indexedAt) >= newestObservedMtime, true);
    assert.equal(lstatSync(currentV11Path).mtimeMs >= Date.parse(declaration.indexedAt),
      true);
  });

test("cross-family authority fails closed on pin, schema, origin, and time drift", () => {
  const mutations = [
    (declaration) => { declaration.crossFamilyLineages[0]
      .predecessorArtifactHash = H2; },
    (declaration) => { declaration.crossFamilyLineages[0]
      .predecessorMarkerHash = H2; },
    (declaration) => { declaration.crossFamilyLineages[0]
      .predecessorMarkerFileHash = H2; },
    (declaration) => { declaration.crossFamilyLineages[0]
      .predecessorMarkerSchema = "outsider/artifact-supersession/v1"; },
    (declaration) => { declaration.crossFamilyLineages[0]
      .successorArtifactHash = H3; },
    (declaration) => { declaration.crossFamilyLineages[0]
      .successorArtifactFileHash = H3; },
    (declaration) => { declaration.crossFamilyLineages[0]
      .successorEntryRelease = "final-v3"; },
    (declaration) => { declaration.indexedAt = "2026-08-28T01:30:00.000Z"; },
  ];
  for (const mutate of mutations) {
    const { root, declaration } = crossFamilyFixture();
    try {
      mutate(declaration);
      assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
        artifactsRoot: root, now: "2026-08-28T04:01:00.000Z" }),
      /LOCAL_ARTIFACT_INDEX_/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("cross-family target symlinks are rejected before target bytes are trusted", () => {
  const { root, declaration } = crossFamilyFixture();
  try {
    const target = path.join(root, "model-new", "final-v2", "architecture.json");
    const source = path.join(root, "model-old", "final-v1", "architecture.json");
    rmSync(target);
    symlinkSync(source, target);
    assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
      artifactsRoot: root, now: "2026-08-28T04:01:00.000Z" }),
    /LOCAL_ARTIFACT_INDEX_SYMLINK_REJECTED/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Finder metadata is forbidden anywhere under the artifact root", () => {
  for (const relative of [".DS_Store", "lane-a/final-v2/.DS_Store",
    "legacy-unversioned/nested/.DS_Store"]) {
    const { root, declaration } = fixture();
    try {
      const target = path.join(root, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, "finder metadata must never enter a canonical commitment");
      assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
        artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }),
      /LOCAL_ARTIFACT_INDEX_FINDER_METADATA_FORBIDDEN/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("all noncanonical and root artifact bytes are quarantine-bound", () => {
  for (const mutation of ["family-source", "unversioned", "root-file"]) {
    const { root, declaration } = fixture();
    try {
      mkdirSync(path.join(root, "lane-a", "source-v1"));
      writeFileSync(path.join(root, "lane-a", "source-v1", "raw.bin"), "source-a");
      mkdirSync(path.join(root, "legacy-unversioned"));
      writeFileSync(path.join(root, "legacy-unversioned", "legacy.bin"), "legacy-a");
      writeFileSync(path.join(root, "README.local"), "root-a");
      const index = buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot: root,
        now: "2026-08-22T18:01:00.000Z" });
      assert.equal(index.everyRegularArtifactByteIsCommittedOrBuildFails, true);
      assert.equal(index.entries[0].nonReleaseQuarantineCount, 1);
      assert.equal(index.unversionedQuarantine[0].directoryFileCount, 1);
      assert.equal(index.artifactsRootFileCount, 1);
      assert.equal(index.artifactsRootEntryCount, 1);
      if (mutation === "family-source") {
        writeFileSync(path.join(root, "lane-a", "source-v1", "raw.bin"), "source-b");
      } else if (mutation === "unversioned") {
        writeFileSync(path.join(root, "legacy-unversioned", "legacy.bin"), "legacy-b");
      } else writeFileSync(path.join(root, "README.local"), "root-b");
      assert.equal(verifyLocalArtifactCanonicalIndex({ declaration, artifact: index,
        artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }).ok, false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("supersession authority is schema-bound and marker bytes are committed", () => {
  for (const mutation of ["narrative-only", "unknown-field", "marker-drift"]) {
    const { root, declaration } = fixture();
    try {
      const marker = path.join(root, "lane-a", "final-v1", "superseded-by.json");
      if (mutation === "narrative-only") {
        writeFileSync(marker, JSON.stringify({ schema: "outsider/artifact-supersession/v1",
          reason: "see final-v2" }));
        assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
          artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }),
        /SUPERSESSION_TARGET_MISSING/u);
      } else if (mutation === "unknown-field") {
        writeFileSync(marker, JSON.stringify({ schema: "outsider/artifact-supersession/v1",
          supersededBy: "../final-v2/evidence.json", narrativeAuthority: true }));
        assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
          artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }),
        /SUPERSESSION_MARKER_SCHEMA_INVALID/u);
      } else {
        const index = buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot: root,
          now: "2026-08-22T18:01:00.000Z" });
        writeFileSync(marker, JSON.stringify({ schema: "outsider/artifact-supersession/v1",
          supersededBy: "../final-v2/evidence.json", reason: "bytes changed" }));
        assert.equal(verifyLocalArtifactCanonicalIndex({ declaration, artifact: index,
          artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }).ok, false);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("supersession targets cannot escape the declared family or canonical file", () => {
  for (const target of [
    "artifacts/lane-b/final-v2/evidence.json",
    "../final-v2/not-the-canonical.json",
    "/tmp/lane-a/final-v2/evidence.json",
    "../../lane-b/final-v2/evidence.json",
  ]) {
    const { root, declaration } = fixture();
    try {
      writeFileSync(path.join(root, "lane-a", "final-v1", "superseded-by.json"),
        JSON.stringify({ schema: "outsider/artifact-supersession/v1",
          supersededBy: target }));
      assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
        artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }),
      /SUPERSESSION_TARGET_/u, target);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("every supported marker target adapter is subject to the same-family resolver", () => {
  const foreign = "artifacts/lane-b/final-v2/evidence.json";
  const markers = [
    { schema: "outsider/actuarial-model-evolution-supersession/v1",
      status: "SUPERSEDED", supersededRelease: "final-v1",
      supersededByRelease: foreign },
    { schema: "outsider/artifact-supersession-marker/v1",
      currentArtifact: { path: foreign } },
    { schema: "outsider/artifact-supersession/v1", supersededBy: foreign },
    { schema: "outsider/directory-artifact-supersession/v1", supersededBy: foreign },
    { schema: "outsider/local-artifact-supersession-pointer/v1",
      canonical: { path: foreign } },
    { schema: "outsider/real-case-responsibility-flywheel-supersession/v1",
      successor: { path: foreign } },
    { schema: "outsider/superseded-artifact/v1", canonical: foreign },
  ];
  for (const marker of markers) {
    const { root, declaration } = fixture();
    try {
      writeFileSync(path.join(root, "lane-a", "final-v1", "superseded-by.json"),
        JSON.stringify(marker));
      assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
        artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }),
      /SUPERSESSION_TARGET_FOREIGN_FAMILY/u, marker.schema);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("missing marker, unlisted versioned family and max-version guessing fail closed", () => {
  for (const mutation of ["missing-marker", "unlisted-family", "newer-release"]) {
    const { root, declaration } = fixture();
    try {
      if (mutation === "missing-marker") {
        rmSync(path.join(root, "lane-a", "final-v1", "superseded-by.json"));
      } else if (mutation === "unlisted-family") {
        mkdirSync(path.join(root, "lane-b", "final-v1"), { recursive: true });
        writeFileSync(path.join(root, "lane-b", "final-v1", "evidence.json"), artifact(H1));
      } else {
        mkdirSync(path.join(root, "lane-a", "final-v3"));
        writeFileSync(path.join(root, "lane-a", "final-v3", "evidence.json"), artifact(H1));
      }
      assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration,
        artifactsRoot: root, now: "2026-08-22T18:01:00.000Z" }),
      /LOCAL_ARTIFACT_INDEX_/u, mutation);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("an index declaration cannot time-seal future canonical bytes", () => {
  const { root, declaration } = fixture();
  try {
    assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot: root,
      now: "2026-08-22T17:59:59.000Z" }), /DECLARATION_TIME_IN_FUTURE/u);
    const canonical = path.join(root, "lane-a", "final-v2", "evidence.json");
    writeFileSync(canonical, JSON.stringify({ artifactHash: H2,
      generatedAt: "2026-08-22T18:00:01.000Z" }));
    assert.throws(() => buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot: root,
      now: "2026-08-22T18:01:00.000Z" }), /CANONICAL_TIME_AFTER_INDEX/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the generated index cannot be written inside the root it indexes", () => {
  const { root, declaration } = fixture();
  try {
    declaration.indexedAt = "2026-08-22T00:00:00.000Z";
    const declarationPath = path.join(root, "declaration.json");
    writeFileSync(declarationPath, JSON.stringify(declaration));
    const result = spawnSync(process.execPath,
      ["scripts/local-artifact-canonical-index.mjs", "build",
        "--declaration", declarationPath, "--artifacts-root", root,
        "--out", path.join(root, "index", "final-v1", "index.json")],
      { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /INDEX_OUTPUT_MUST_BE_OUTSIDE_INDEXED_ROOT/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("index publication is no-clobber and never follows an output symlink", () => {
  for (const kind of ["regular", "symlink"]) {
    const { root, declaration } = fixture();
    const outRoot = temp();
    try {
      declaration.indexedAt = "2026-08-22T00:00:00.000Z";
      const declarationPath = path.join(outRoot, "declaration.json");
      writeFileSync(declarationPath, JSON.stringify(declaration));
      const output = path.join(outRoot, "final-v1", "index.json");
      mkdirSync(path.dirname(output));
      const victim = path.join(outRoot, "victim.txt");
      writeFileSync(victim, "neutral-victim");
      if (kind === "regular") writeFileSync(output, "existing-output");
      else symlinkSync(victim, output);
      const result = spawnSync(process.execPath,
        [path.resolve(import.meta.dirname, "../scripts/local-artifact-canonical-index.mjs"), "build",
          "--declaration", declarationPath, "--artifacts-root", root,
          "--out", path.relative(outRoot, output)],
        { cwd: outRoot, encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /OUTPUT_EXISTS/u);
      assert.equal(readFileSync(victim, "utf8"), "neutral-victim");
      if (kind === "regular") assert.equal(readFileSync(output, "utf8"),
        "existing-output");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outRoot, { recursive: true, force: true });
    }
  }
});

test("index publication rejects an existing leaf reached through an ancestor symlink", () => {
  const { root, declaration } = fixture();
  const outRoot = temp();
  try {
    declaration.indexedAt = "2026-08-22T00:00:00.000Z";
    const declarationPath = path.join(outRoot, "declaration.json");
    writeFileSync(declarationPath, JSON.stringify(declaration));
    const external = path.join(outRoot, "external");
    mkdirSync(path.join(external, "leaf"), { recursive: true });
    symlinkSync(external, path.join(outRoot, "redirect"));
    const output = path.join(outRoot, "redirect", "leaf", "index.json");
    const result = spawnSync(process.execPath,
      [path.resolve(import.meta.dirname, "../scripts/local-artifact-canonical-index.mjs"),
        "build", "--declaration", declarationPath, "--artifacts-root", root,
        "--out", path.relative(outRoot, output)], { cwd: outRoot, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OUTPUT_PARENT_UNSAFE/u);
    assert.throws(() => readFileSync(output));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outRoot, { recursive: true, force: true });
  }
});
