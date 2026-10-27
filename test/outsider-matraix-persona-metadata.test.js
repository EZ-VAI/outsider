import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  MATRAIX_PERSONA_METADATA_PROJECTION_SCHEMA,
  buildMatraixPersonaMetadataProjection,
  isMatraixPersonaMetadataStressProjection,
  verifyMatraixPersonaMetadataProjection,
  verifyMatraixPersonaMetadataProjectionWithSource,
} from "../src/outsider-matraix-persona-metadata.js";

const SOURCE_URL = new URL(
  "../references/matraix-persona-maintainer-reviewed-source-manifest.json",
  import.meta.url,
);

function sourceBytes() {
  return readFileSync(SOURCE_URL);
}

function reseal(value) {
  const copy = structuredClone(value);
  delete copy.artifactHash;
  copy.artifactHash = `sha256:${createHash("sha256")
    .update(`${MATRAIX_PERSONA_METADATA_PROJECTION_SCHEMA}\0${canonicalizeStrict(copy)}`,
      "utf8").digest("hex")}`;
  return copy;
}

function changedSource(mutator) {
  const value = JSON.parse(sourceBytes().toString("utf8"));
  mutator(value);
  return Buffer.from(JSON.stringify(value), "utf8");
}

test("maintainer-reviewed manifest pins metadata HEADs without pretending payload replay", () => {
  const bytes = sourceBytes();
  assert.ok(bytes.length < 20_000);
  const source = JSON.parse(bytes.toString("utf8"));
  assert.equal(source.sources.github.revision,
    "39d850270917db25535dac3f7aa2561732050e82");
  assert.equal(source.sources.huggingFace.revision,
    "74f1edf9c9d024e6d3e412c3fda0efccfb2029c7");
  assert.equal(source.sources.huggingFace.payloadTreeRevisionEstablished, false);
  assert.equal(source.sources.huggingFace.sourceBytesDownloaded, false);
  assert.equal(source.sources.huggingFace.parquetShardsDownloaded, 0);
  assert.equal(source.sources.huggingFace.hubCardLicenseTagObserved, null);
  assert.equal(source.sources.huggingFace.datasetOverallLicenseDeclared, null);
  assert.equal(source.sources.huggingFace.sourceLicensesAndTermsContinueToApply, true);
});

test("projection retains the 1,290-dimension topology and exact publisher count accounting",
  () => {
    const artifact = buildMatraixPersonaMetadataProjection(sourceBytes());
    assert.equal(artifact.schemaTopology.dimensionCount, 1290);
    assert.equal(artifact.schemaTopology.groups.reduce(
      (sum, row) => sum + row.dimensions, 0), 1290);
    assert.equal(artifact.schemaTopology.dimensionIdentifiersReplayed, false);
    assert.equal(artifact.schemaTopology.categoricalValueDomainsReplayed, false);
    assert.equal(artifact.composition.sourceCountsClaimed.reduce(
      (sum, row) => sum + row.rows, 0), 999847);
    assert.equal(artifact.composition.humanGroundedRowsClaimed, 599847);
    assert.equal(artifact.composition.syntheticRowsClaimed, 400000);
    assert.equal(artifact.composition.observedRows, 0);
    assert.equal(artifact.composition.rowDenominatorReplayed, false);
  });

test("missingness, calibration, privacy, and representativeness remain explicit holds", () => {
  const artifact = buildMatraixPersonaMetadataProjection(sourceBytes());
  assert.equal(artifact.missingness.publisherClaimsNullBitmap, true);
  assert.equal(artifact.missingness.rowLevelMissingnessReplayed, false);
  assert.equal(artifact.missingness.perDimensionMissingnessRatesReplayed, false);
  assert.equal(artifact.missingness.zeroFillPermitted, false);
  assert.deepEqual(artifact.calibration.publisherClaimedMarginals,
    ["AGE_BRACKET", "REGION", "GENDER_IDENTITY", "URBANICITY"]);
  assert.equal(artifact.calibration.auditBytesReplayed, false);
  assert.equal(artifact.calibration.manifestBytesReplayed, false);
  assert.equal(artifact.calibration.calibrationEstablished, false);
  assert.equal(artifact.calibration.populationRepresentative, false);
  assert.equal(artifact.calibration.jointCoverageOver1290DimensionsRepresentative, false);
  assert.equal(artifact.privacyAndRights.publisherClaimsDirectIdentifiersRemoved, true);
  assert.equal(artifact.privacyAndRights.piiIndependentlyVerified, false);
  assert.equal(artifact.privacyAndRights.privacyReviewComplete, false);
  assert.equal(artifact.privacyAndRights.datasetOverallLicenseDeclared, null);
  assert.equal(artifact.privacyAndRights.perSourceLicensesResolved, false);
  assert.equal(artifact.privacyAndRights.trainingRightsResolved, false);
});

test("only simulated schema, missingness, composition, and coverage stress tests are admitted", () => {
  const artifact = buildMatraixPersonaMetadataProjection(sourceBytes());
  assert.equal(isMatraixPersonaMetadataStressProjection(artifact), true);
  assert.equal(artifact.realityClass, "SIMULATED_DERIVED_METADATA");
  assert.equal(artifact.stressTestUse.affectedPartyCoverageHypothesisStressTest, true);
  assert.equal(artifact.stressTestUse.effectChannelCoverageHypothesisStressTest, true);
  assert.equal(artifact.stressTestUse.realAffectedPartyRegister, false);
  assert.equal(artifact.stressTestUse.realEffectGroundTruth, false);
  assert.equal(artifact.stressTestUse.realityCensus, false);
  assert.equal(artifact.stressTestUse.governedTraining, false);
  assert.equal(artifact.authority.trainingRows, 0);
  assert.equal(artifact.authority.causalExperienceUnits, 0);
  assert.equal(artifact.authority.authorityUnits, 0);
  assert.equal(artifact.authority.actionAuthority, false);
  assert.equal(artifact.authority.actionReady, false);
  assert.equal(artifact.authority.realityCensusEligible, false);
});

test("standalone verification never claims source replay; local manifest rebuild remains metadata-only",
  () => {
    const bytes = sourceBytes();
    const artifact = buildMatraixPersonaMetadataProjection(bytes);
    const standalone = verifyMatraixPersonaMetadataProjection(artifact);
    assert.equal(standalone.ok, true);
    assert.equal(standalone.sourceReplay.localMaintainerManifestReplayed, false);
    assert.equal(standalone.sourceReplay.upstreamSourceBytesReplayed, false);
    const replay = verifyMatraixPersonaMetadataProjectionWithSource(artifact, bytes);
    assert.equal(replay.ok, true);
    assert.equal(replay.sourceReplay.localMaintainerManifestReplayed, true);
    assert.equal(replay.sourceReplay.upstreamSourceBytesReplayed, false);
    assert.equal(replay.sourceReplay.personaRowsReplayed, 0);
    assert.equal(replay.trainingRows, 0);
    assert.equal(replay.actionAuthority, false);
  });

test("a byte-distinct local manifest cannot verify an artifact built from the reviewed file", () => {
  const bytes = sourceBytes();
  const artifact = buildMatraixPersonaMetadataProjection(bytes);
  const byteDistinct = Buffer.concat([bytes, Buffer.from("\n", "utf8")]);
  const replay = verifyMatraixPersonaMetadataProjectionWithSource(artifact, byteDistinct);
  assert.equal(replay.ok, false);
  assert.ok(replay.failures.includes("LOCAL_SOURCE_MANIFEST_REBUILD_MISMATCH"));
});

test("source drift cannot promote a directory commit, license tag, or publisher PII claim", () => {
  assert.throws(() => buildMatraixPersonaMetadataProjection(changedSource((value) => {
    value.sources.huggingFace.revision
      = "2946d338f808cab92be34866045f6081f3d16057";
  })), /MATRAIX_HF_REVISION_INVALID/u);
  assert.throws(() => buildMatraixPersonaMetadataProjection(changedSource((value) => {
    value.sources.huggingFace.datasetOverallLicenseDeclared = "MIT";
  })), /MATRAIX_DATASET_LICENSE_MUST_REMAIN_UNDECLARED/u);
  assert.throws(() => buildMatraixPersonaMetadataProjection(changedSource((value) => {
    value.sources.huggingFace.hubCardLicenseTagObserved = "mit";
  })), /MATRAIX_HF_LICENSE_TAG_INVALID/u);
  assert.throws(() => buildMatraixPersonaMetadataProjection(changedSource((value) => {
    value.publisherMetadata.privacy.independentlyVerified = true;
  })), /MATRAIX_PII_VERIFICATION_BOUNDARY_INVALID/u);
  assert.throws(() => buildMatraixPersonaMetadataProjection(changedSource((value) => {
    value.publisherMetadata.calibration.auditBytesReplayed = true;
  })), /MATRAIX_CALIBRATION_auditBytesReplayed_INVALID/u);
});

test("self-consistent rehashing cannot grant training, census, rights, PII, or action authority",
  () => {
    const artifact = buildMatraixPersonaMetadataProjection(sourceBytes());
    const mutators = [
      (value) => { value.authority.trainingRows = 1; },
      (value) => { value.authority.actionAuthority = true; },
      (value) => { value.authority.realityCensusEligible = true; },
      (value) => { value.privacyAndRights.datasetOverallLicenseDeclared = "MIT"; },
      (value) => { value.privacyAndRights.piiIndependentlyVerified = true; },
      (value) => { value.calibration.populationRepresentative = true; },
      (value) => { value.source.upstreamSourceBytesReplayed = true; },
      (value) => { value.stressTestUse.governedTraining = true; },
    ];
    for (const mutate of mutators) {
      const changed = structuredClone(artifact);
      mutate(changed);
      const checked = verifyMatraixPersonaMetadataProjection(reseal(changed));
      assert.equal(checked.ok, false);
    }
  });

test("non-JSON and extra-field semantics are rejected", () => {
  const artifact = structuredClone(buildMatraixPersonaMetadataProjection(sourceBytes()));
  Object.defineProperty(artifact.authority, "hiddenGrant", { value: true });
  assert.equal(verifyMatraixPersonaMetadataProjection(artifact).ok, false);

  const extra = structuredClone(buildMatraixPersonaMetadataProjection(sourceBytes()));
  extra.stressTestUse.realWorldUse = true;
  assert.equal(verifyMatraixPersonaMetadataProjection(reseal(extra)).ok, false);
});
