import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DurableStage1CurateCorpusRegistry,
  createCorpusArtifactSet, verifyCorpusArtifactSet } from
  "../src/outsider-corpus-registry.js";
import {
  buildPublicAgentCorpusArtifactSetFromSource,
  buildPublicAgentWave2CorpusArtifactSetFromSource,
  buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource,
  buildDroid100CorpusArtifactSetFromSource,
  buildPublicRoboticsCorpusArtifactSetFromSource,
  verifyKnownPublicCorpusRegistrySources,
} from "../src/outsider-corpus-registry-intake.js";

const AGENT = path.resolve("artifacts/public-agent-corpus-20260820");
const ROBOT = path.resolve("artifacts/curate-public-robotics-20260820/source");
const AGENT_WAVE2 = path.resolve("artifacts/public-agent-wave2-20260821/source");
const AGENT_WAVE4 = path.resolve(
  "artifacts/public-agent-wave4-20260821/source/agentrx-tau",
);
const DROID_ARTIFACT = path.resolve(
  "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay",
);
const DROID_SOURCE = path.resolve("artifacts/curate-droid100-20260819/source");
const REAL_SOURCE_AVAILABLE = existsSync(path.join(AGENT, "source"))
  && existsSync(path.join(ROBOT, "botfails"))
  && existsSync(path.join(ROBOT, "ur5fail-execution"))
  && existsSync(path.join(AGENT_WAVE2, "atbench-codex", "test.json"))
  && existsSync(path.join(AGENT_WAVE4, "linked-dataset-card.md"))
  && existsSync(path.join(DROID_ARTIFACT, "report.json"))
  && existsSync(path.join(DROID_SOURCE, "r2d2_faceblur-train.tfrecord-00000-of-00031"));
const T0 = new Date("2036-01-01T00:00:00.000Z");
const hash = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

test("full-source public agent and robotics corpora enter the signed two-chain registry safely",
  { skip: !REAL_SOURCE_AVAILABLE, timeout: 120_000 }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-real-corpus-registry-"));
    const signer = keys();
    try {
      const registry = new DurableStage1CurateCorpusRegistry({ directory: root,
        privateKeyPem: signer.privateKey, createdAt: T0, registryId: "real-public-corpora" });
      const agent = await buildPublicAgentCorpusArtifactSetFromSource({
        artifactDirectory: AGENT, privateKeyPem: signer.privateKey, createdAt: T0,
      });
      const robot = buildPublicRoboticsCorpusArtifactSetFromSource({ sourceRoot: ROBOT,
        privateKeyPem: signer.privateKey, createdAt: T0,
      });
      const wave2 = buildPublicAgentWave2CorpusArtifactSetFromSource({ sourceRoot: AGENT_WAVE2,
        privateKeyPem: signer.privateKey, createdAt: T0,
      });
      const droid = buildDroid100CorpusArtifactSetFromSource({
        artifactDirectory: DROID_ARTIFACT, sourceRoot: DROID_SOURCE,
        privateKeyPem: signer.privateKey, createdAt: T0,
      });
      const wave4 = buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource({
        sourceRoot: AGENT_WAVE4, privateKeyPem: signer.privateKey, createdAt: T0,
      });
      assert.equal(verifyCorpusArtifactSet(agent).ok, true);
      assert.equal(verifyCorpusArtifactSet(wave2).ok, true);
      assert.equal(verifyCorpusArtifactSet(robot).ok, true);
      assert.equal(verifyCorpusArtifactSet(wave4).ok, true);
      assert.equal(agent.stage, "ATTEST");
      assert.equal(agent.stream, "FORWARD_ACTION_EVIDENCE");
      assert.equal(agent.counts.candidates, 9_381);
      assert.equal(robot.stage, "CURATE");
      assert.equal(robot.stream, "BACKWARD_EXPERIENCE_EVIDENCE");
      assert.equal(robot.counts.candidates, 160);
      assert.equal(wave2.stage, "ATTEST");
      assert.equal(wave2.stream, "FORWARD_ACTION_EVIDENCE");
      assert.equal(wave2.counts.candidates, 1_474);
      assert.equal(droid.stage, "CURATE");
      assert.equal(droid.counts.candidates, 2);
      assert.equal(wave4.stage, "CURATE");
      assert.equal(wave4.stream, "BACKWARD_EXPERIENCE_EVIDENCE");
      assert.equal(wave4.counts.candidates, 29);
      for (const set of [agent, wave2, robot, droid, wave4]) {
        assert.equal(set.sourceProof.migration.method,
          "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST");
        assert.equal(set.sourceProof.sourceArtifactHashes.length > 0, true);
        assert.equal(set.boundary.causalExperienceUnits, 0);
        assert.equal(set.boundary.lossEvidenceUnits, 0);
        assert.equal(set.boundary.economicLossRows, 0);
        assert.equal(set.boundary.pricingEligible, false);
        assert.equal(set.boundary.permitsPrice, false);
        assert.equal(set.boundary.permitsGuarantee, false);
        assert.equal(set.boundary.permitsSettle, false);
      }
      registry.appendArtifactSet(agent, { recordedAt: new Date(T0.getTime() + 1_000) });
      registry.appendArtifactSet(wave2, { recordedAt: new Date(T0.getTime() + 2_000) });
      registry.appendArtifactSet(robot, { recordedAt: new Date(T0.getTime() + 3_000) });
      registry.appendArtifactSet(droid, { recordedAt: new Date(T0.getTime() + 4_000) });
      registry.appendArtifactSet(wave4, { recordedAt: new Date(T0.getTime() + 5_000) });
      const status = registry.status({ now: new Date(T0.getTime() + 6_000) });
      assert.equal(status.ok, true, status.error);
      assert.equal(status.counts.activeArtifactSets, 5);
      assert.equal(status.counts.candidates, 11_046);
      assert.equal(status.counts.d2Groups, 5);
      assert.equal(status.counts.operatorSignedFullSourceClaims, 5);
      assert.equal(status.sourceArtifactsReverified, false);
      assert.equal(status.fullSourceArtifactSetsReverified, 0);
      assert.equal(status.d1.conflicts, 0);
      const sourceReplay = await verifyKnownPublicCorpusRegistrySources({ directory: root,
        agentArtifactDirectory: AGENT, wave2SourceRoot: AGENT_WAVE2,
        roboticsSourceRoot: ROBOT, droidArtifactDirectory: DROID_ARTIFACT,
        droidSourceRoot: DROID_SOURCE, wave4SourceRoot: AGENT_WAVE4,
        now: new Date(T0.getTime() + 6_000) });
      assert.equal(sourceReplay.ok, true, sourceReplay.error);
      assert.equal(sourceReplay.sourceArtifactsReverified, true);
      assert.equal(sourceReplay.allOperatorSignedFullSourceClaimsReverified, true);
      assert.equal(sourceReplay.fullSourceArtifactSetsReverified, 5);
      assert.equal(sourceReplay.fullSourceCandidatesReverified, 11_046);
      assert.equal(sourceReplay.artifacts.every((artifact) =>
        artifact.canonicalBodyExact && artifact.storedSignatureVerifiedByRegistry), true);

      const fake = createCorpusArtifactSet({
        artifactSetId: "fake-resealed-full-source",
        stage: "ATTEST", stream: "FORWARD_ACTION_EVIDENCE",
        createdAt: new Date(T0.getTime() + 6_000),
        instrument: { instrumentId: "fake-resealed-intake", instrumentVersion: "1.0.0",
          implementationHash: hash("fake-implementation"),
          featureSchemaHash: hash("fake-feature-schema") },
        datasetIds: ["fake/source"], licenseIds: ["FAKE"],
        rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
          sourceCommitmentHashes: [hash("fake-rights")], registryGrantsRights: false },
        sourceProof: { sourceKind: "FAKE_FULL_SOURCE",
          verificationLevel: "FULL_SOURCE_REPRODUCED",
          sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
          verifierImplementationHash: hash("fake-verifier"),
          verificationHash: hash("fake-verification"),
          manifestHashes: [hash("fake-manifest")],
          sourceArtifactHashes: [hash("fake-source-object")],
          migration: { method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
            legacySchemas: ["fake/source/v1"] } },
        units: [{ identityHash: hash("fake-identity"), recordHash: hash("fake-record"),
          datasetRoot: hash("fake-dataset-root"),
          correlationRoots: [hash("fake-dataset-root")] }],
        retention: { mode: "NO_AUTOMATIC_EXPIRY_PUBLIC_SOURCE", retainUntil: null,
          storedPayloadClass: "HASHES_AND_BOUNDED_METADATA_ONLY",
          sourcePayloadManaged: false, expiryDisposition: "NOT_APPLICABLE",
          liveRevocationChecked: false },
      }, { privateKeyPem: signer.privateKey });
      registry.appendArtifactSet(fake, { recordedAt: new Date(T0.getTime() + 7_000) });
      const rejectedFake = await verifyKnownPublicCorpusRegistrySources({ directory: root,
        agentArtifactDirectory: AGENT, wave2SourceRoot: AGENT_WAVE2,
        roboticsSourceRoot: ROBOT, droidArtifactDirectory: DROID_ARTIFACT,
        droidSourceRoot: DROID_SOURCE, wave4SourceRoot: AGENT_WAVE4,
        now: new Date(T0.getTime() + 8_000) });
      assert.equal(rejectedFake.ok, false);
      assert.equal(rejectedFake.sourceArtifactsReverified, false);
      assert.match(rejectedFake.error, /UNKNOWN_FULL_SOURCE_KIND:FAKE_FULL_SOURCE/);
      const stored = readFileSync(path.join(root, "index.json"), "utf8")
        + readFileSync(path.join(root, "artifact-sets",
          `${agent.artifactSetHash.slice(7)}.json`), "utf8")
        + readFileSync(path.join(root, "artifact-sets",
          `${wave2.artifactSetHash.slice(7)}.json`), "utf8")
        + readFileSync(path.join(root, "artifact-sets",
          `${robot.artifactSetHash.slice(7)}.json`), "utf8")
        + readFileSync(path.join(root, "artifact-sets",
          `${droid.artifactSetHash.slice(7)}.json`), "utf8");
      const storedWithWave4 = stored + readFileSync(path.join(root, "artifact-sets",
        `${wave4.artifactSetHash.slice(7)}.json`), "utf8");
      assert.equal(storedWithWave4.includes("task_instruction"), false);
      assert.equal(storedWithWave4.includes("failure_reason"), false);
      assert.equal(storedWithWave4.includes("rawContent"), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
