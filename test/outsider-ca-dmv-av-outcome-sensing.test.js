import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCaDmvAvOutcomeSensingFromBytes,
  buildCaDmvAvOutcomeSensingFromSourceDirectory,
  CA_DMV_AV_FROZEN_SOURCE_20260821,
  verifyCaDmvAvOutcomeSensing,
  verifyCaDmvAvOutcomeSensingWithSource,
} from "../src/outsider-ca-dmv-av-outcome-sensing.js";

function fixture() {
  return Object.fromEntries(CA_DMV_AV_FROZEN_SOURCE_20260821.files.map((file) => [
    file.name, Buffer.from(file.name.endsWith(".pdf") ? "%PDF-fixture" : `<html>${file.kind}</html>`),
  ]));
}
function reseal(artifact) {
  const { artifactHash: _old, ...withoutHash } = artifact;
  return { ...withoutHash, artifactHash: `sha256:${createHash("sha256")
    .update(canonicalizeStrict(withoutHash)).digest("hex")}` };
}
function writeFixture(files) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-ca-dmv-av-"));
  for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(directory, name), bytes);
  return directory;
}

test("CA DMV fixture preserves regime and outcome boundaries", () => {
  const artifact = buildCaDmvAvOutcomeSensingFromBytes(fixture());
  assert.equal(artifact.source.profileMatchedAtBuild, false);
  assert.equal(artifact.regimeRoots.enhanced2026.observedMonthlyCsvRows, 0);
  assert.equal(artifact.regimeRoots.enhanced2026.noObservationFabricatedBeforeDueDate, true);
  assert.equal(artifact.regimeRoots.crossRegimePoolingPermitted, false);
  assert.equal(artifact.ontology.collisionDocumentIsIndependentlyObservedOutcome, false);
  assert.equal(artifact.exposureEvidence.collisionRateCalculated, false);
  assert.equal(artifact.collisionCases.cases.length, 0);
});

test("CA DMV standalone verification never re-verifies sources or returns admission", () => {
  const artifact = buildCaDmvAvOutcomeSensingFromBytes(fixture());
  const forged = reseal({ ...artifact, source: { ...artifact.source, profileMatchedAtBuild: true,
    publisher: "CALIFORNIA_DEPARTMENT_OF_MOTOR_VEHICLES" },
    admission: "ADMIT_CA_DMV_AV_REGIME_AWARE_SHADOW_SENSING_ONLY" });
  const checked = verifyCaDmvAvOutcomeSensing(forged);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "STRUCTURE_ONLY");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.decision, null);
});

test("CA DMV full verifier exact-rebuilds and rejects nonofficial fixture bytes", () => {
  const directory = writeFixture(fixture());
  const artifact = buildCaDmvAvOutcomeSensingFromSourceDirectory(directory);
  const checked = verifyCaDmvAvOutcomeSensingWithSource(artifact, directory);
  assert.equal(checked.ok, false);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REPLAY_FAILED");
  assert.equal(checked.sourceArtifactsReverified, false);
});

test("CA DMV rejects caller source claims, authority mutation, and extra source files", () => {
  assert.throws(() => buildCaDmvAvOutcomeSensingFromBytes(fixture(),
    { official: true }), /BUILD_ARGUMENTS_INVALID/);
  const artifact = buildCaDmvAvOutcomeSensingFromBytes(fixture());
  const forgedAuthority = reseal({ ...artifact, authority: { ...artifact.authority, SETTLE: true } });
  assert.equal(verifyCaDmvAvOutcomeSensing(forgedAuthority).ok, false);
  const directory = writeFixture(fixture());
  writeFileSync(path.join(directory, "caller-proof.json"), "true");
  assert.throws(() => buildCaDmvAvOutcomeSensingFromSourceDirectory(directory),
    /SOURCE_DIRECTORY_PROFILE_MISMATCH/);
});

test("CA DMV frozen pins cover official cases, regime roots, and exposure sources", () => {
  const files = CA_DMV_AV_FROZEN_SOURCE_20260821.files;
  assert.equal(new Set(files.map((file) => file.name)).size, files.length);
  assert.equal(files.filter((file) => file.kind === "LEGACY_COLLISION_FORM_CASE").length, 4);
  assert.ok(files.some((file) => file.kind === "NEW_REGIME_MEMO"));
  assert.ok(files.some((file) => file.kind === "LEGACY_EXPOSURE_RELEASE_EXACT"));
  assert.ok(files.every((file) => /^sha256:[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0));
});

test("CA DMV directory replay rejects a symlinked source member", () => {
  const directory = writeFixture(fixture());
  const target = path.join(directory, "permit-holders-20260821.html");
  unlinkSync(target); symlinkSync(path.join(directory, "regulations-20260821.html"), target);
  assert.throws(() => buildCaDmvAvOutcomeSensingFromSourceDirectory(directory), /SOURCE_FILE_UNSAFE/);
});

const officialSource = path.resolve("artifacts/ca-dmv-av-outcome-sensing-20260821/source");
const officialArtifact = path.resolve("artifacts/ca-dmv-av-outcome-sensing-20260821/final-v3/outcome-sensing.json");
test("CA DMV canonical local artifact fully replays when ignored sources are present",
  { skip: !(existsSync(officialSource) && existsSync(officialArtifact)) }, () => {
    const artifact = JSON.parse(readFileSync(officialArtifact, "utf8"));
    const checked = verifyCaDmvAvOutcomeSensingWithSource(artifact, officialSource);
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceArtifactsReverified, true);
    assert.equal(checked.verificationLevel, "FULL_OFFICIAL_CA_DMV_AV_SOURCE_REPLAYED");
    assert.match(artifact.permitSnapshot.projectionMethod,
      /EACH_HOLDER_FRAGMENT_AND_TABLE_ROW_COUNT_MECHANICALLY_CHECKED/u);
    assert.equal(artifact.permitSnapshot.publisherHtmlSemanticsIndependentlyAdjudicated, false);
    assert.equal(checked.artifactHash,
      "sha256:1894ff1026062b9459cd532a3f75c49c8544d8e87c7aec3e76cfb01389e79138");
  });
