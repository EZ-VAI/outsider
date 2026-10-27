import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DurableStage1CurateCorpusRegistry,
  verifyCorpusArtifactSet,
} from "../src/outsider-corpus-registry.js";
import {
  PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND,
  buildPublicEvidenceWave5CorpusArtifactSetFromSource,
  verifyPublicEvidenceWave5CorpusRegistrySource,
} from "../src/outsider-corpus-registry-intake.js";
import {
  STAGE1_CORPUS_PROFILE_IDS,
  stage1ExactCorpusProfile,
  verifyStage1ExactCorpusProfile,
} from "../src/outsider-stage1-lifecycle-frontier.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "artifacts/public-evidence-wave5-20260821/source");
const T0 = "2036-01-01T00:00:00.000Z";

function keyPair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

test("all 49 Wave5 rows enter Stage1 as source-replayed hash-only taxonomy candidates",
  { timeout: 30_000 }, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-wave5-stage1-"));
    const signer = keyPair();
    try {
      const registry = new DurableStage1CurateCorpusRegistry({ directory,
        privateKeyPem: signer.privateKey, createdAt: T0,
        registryId: "wave5-source-aware-stage1" });
      const artifactSet = buildPublicEvidenceWave5CorpusArtifactSetFromSource({
        sourceRoot: SOURCE, privateKeyPem: signer.privateKey, createdAt: T0,
      });
      assert.equal(verifyCorpusArtifactSet(artifactSet).ok, true);
      assert.equal(artifactSet.sourceProof.sourceKind,
        PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND);
      assert.equal(artifactSet.stage, "CURATE");
      assert.equal(artifactSet.stream, "BACKWARD_EXPERIENCE_EVIDENCE");
      assert.equal(artifactSet.counts.candidates, 49);
      assert.equal(artifactSet.rightsBasis.class,
        "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY");
      assert.equal(artifactSet.rightsBasis.registryGrantsRights, false);
      assert.equal(artifactSet.instrument.featureSchemaHash.startsWith("sha256:"), true);
      assert.equal(artifactSet.boundary.causalExperienceUnits, 0);
      assert.equal(artifactSet.boundary.lossEvidenceUnits, 0);
      assert.equal(artifactSet.boundary.economicLossRows, 0);
      assert.equal(artifactSet.boundary.automaticTraining, false);
      assert.equal(artifactSet.boundary.pricingEligible, false);
      assert.equal(artifactSet.boundary.permitsPrice, false);
      assert.equal(artifactSet.boundary.permitsGuarantee, false);
      assert.equal(artifactSet.boundary.permitsSettle, false);
      registry.appendArtifactSet(artifactSet, { recordedAt: T0 });
      const replay = verifyPublicEvidenceWave5CorpusRegistrySource({
        directory, sourceRoot: SOURCE, now: T0,
      });
      assert.equal(replay.ok, true, replay.error);
      assert.equal(replay.sourceArtifactsReverified, true);
      assert.equal(replay.canonicalBodyExact, true);
      assert.equal(replay.candidates, 49);
      assert.equal(replay.preActionAvailableRows, 0);
      assert.equal(replay.trainerRowsEnqueued, 0);
      assert.equal(replay.targetPredictorEligibleRows, 0);
      assert.equal(replay.boundary.automaticTraining, false);
      assert.equal(replay.boundary.pricingEligible, false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

test("the additive eight-set lifecycle profile preserves prior profiles and freezes Wave5 rights",
  () => {
    const prior = stage1ExactCorpusProfile(STAGE1_CORPUS_PROFILE_IDS.SEVEN_SET_NHTSA_V2);
    const current = stage1ExactCorpusProfile(
      STAGE1_CORPUS_PROFILE_IDS.EIGHT_SET_NHTSA_WAVE5_V3);
    assert.equal(verifyStage1ExactCorpusProfile(prior).ok, true);
    assert.equal(verifyStage1ExactCorpusProfile(current).ok, true);
    assert.equal(prior.expected.counts.artifactSets, 7);
    assert.equal(current.expected.counts.artifactSets, 8);
    assert.equal(current.expected.counts.candidates,
      prior.expected.counts.candidates + 49);
    const wave5 = current.expected.sourceKinds.find((source) =>
      source.sourceKind === PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND);
    assert.equal(wave5.candidates, 49);
    assert.equal(wave5.sourceCompleteness, "FULL_DECLARED_SOURCE_SCOPE");
    assert.equal(wave5.rightsBasisClass, "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY");
    assert.equal(wave5.registryGrantsRights, false);
    assert.equal(current.expected.authorityBoundary.automaticTraining, false);
    assert.equal(current.expected.authorityBoundary.pricingEligible, false);
  });
