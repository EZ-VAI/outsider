import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync }
  from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CUAREWARDBENCH_WAVE3_PIN,
  PUBLIC_AGENT_WAVE3_SCHEMAS,
  buildPublicAgentWave3CandidateDecision,
  verifyPublicAgentWave3Manifest,
  verifyPublicAgentWave3MetadataRecord,
  verifyPublicAgentWave3RecordSet,
  verifyPublicAgentWave3Source,
} from "../src/outsider-public-agent-wave3.js";
import {
  DurableStage1CurateCorpusRegistry,
  verifyCorpusArtifactSet,
} from "../src/outsider-corpus-registry.js";
import {
  buildPublicAgentWave3MetadataCorpusArtifactSetFromSource,
  verifyPublicAgentWave3MetadataCorpusRegistrySource,
} from "../src/outsider-corpus-registry-intake.js";

const SOURCE = fileURLToPath(new URL(
  "../artifacts/public-agent-wave3-20260821/source/cuarewardbench/", import.meta.url,
));
const REAL_SOURCE = existsSync(path.join(SOURCE, "annotations.json"))
  && existsSync(path.join(SOURCE, "trajectory-manifest.jsonl"));
const T0 = new Date("2037-01-01T00:00:00.000Z");
function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

test("CUARewardBench metadata scope freezes 272 labels and 122 correlated tasks without traces",
  { skip: !REAL_SOURCE }, () => {
    const result = verifyPublicAgentWave3Source(SOURCE);
    assert.equal(verifyPublicAgentWave3Manifest(result.manifest).ok, true);
    assert.equal(verifyPublicAgentWave3RecordSet(result.records,
      { manifest: result.manifest }).ok, true);
    assert.equal(result.records.every((record) =>
      verifyPublicAgentWave3MetadataRecord(record).ok), true);
    assert.equal(result.records.length, 272);
    assert.equal(result.summary.counts.uniqueNormalizedUnits, 272);
    assert.equal(result.summary.counts.taskCorrelationComponents, 122);
    assert.equal(new Set(result.records.map((record) => record.identity.taskRoot)).size, 122);
    assert.equal(result.summary.counts.modelSettingComponents, 10);
    assert.equal(result.summary.counts.taskTypeComponents, 10);
    assert.equal(result.summary.counts.benchmarkSuccessRows, 139);
    assert.equal(result.summary.counts.benchmarkFailureRows, 133);
    assert.equal(result.summary.counts.processLabelItems, 346);
    assert.equal(result.summary.counts.recoveryLabelItems, 26);
    assert.equal(result.summary.counts.referencedScreenshotObjects, 3_016);
    assert.equal(result.summary.counts.referencedScreenshotBytes, 1_275_029_276);
    assert.equal(result.summary.counts.referencedTrajectoryObjects, 341);
    assert.equal(result.summary.counts.referencedTrajectoryBytes, 3_064_960);
    assert.equal(result.verification.acquiredObjects, 11);
    assert.equal(result.verification.acquiredBytes, 797_816);
    assert.equal(result.verification.traceBytesAcquired, 0);
    assert.equal(result.verification.sourceCompleteness, "QUARANTINED_NO_TRACE_BYTES");
    assert.equal(result.verification.trust.traceObjectBytesVerified, false);
    assert.equal(result.verification.trust.upstreamTrajectoryRightsClaimed, false);
    assert.equal(result.summary.counts.trajectoryTruthUsableRows, 0);
    assert.equal(result.summary.counts.causalExperienceUnits, 0);
    assert.equal(result.summary.counts.economicLossRows, 0);
    assert.equal(result.summary.counts.pricingEligibleRows, 0);
    assert.equal(result.summary.interpretation.automaticTraining, false);
    assert.equal(result.records.every((record) =>
      record.sourceBinding.traceBytesAcquired === 0
      && record.sourceBinding.traceObjectHashesVerifiedAgainstBytes === false
      && record.labels.recoveryEstablishedFromTrace === false
      && Object.values(record.useBoundary.permits).every((value) => value === false)), true);
  });

test("metadata record verification rejects recovery, loss, authority and trace promotion",
  { skip: !REAL_SOURCE }, () => {
    const record = verifyPublicAgentWave3Source(SOURCE).records[0];
    for (const mutate of [
      (value) => { value.labels.recoveryEstablishedFromTrace = true; },
      (value) => { value.labels.economicLossObserved = true; },
      (value) => { value.sourceBinding.traceBytesAcquired = 1; },
      (value) => { value.sourceBinding.traceObjectHashesVerifiedAgainstBytes = true; },
      (value) => { value.useBoundary.automaticTraining = true; },
      (value) => { value.useBoundary.permits.FULL_SOURCE = true; },
      (value) => { value.useBoundary.permits.CEU = true; },
      (value) => { value.useBoundary.permits.PRICE = true; },
    ]) {
      const tampered = structuredClone(record);
      mutate(tampered);
      assert.equal(verifyPublicAgentWave3MetadataRecord(tampered).ok, false);
    }
  });

test("source verifier rejects same-size object swaps and license relabels",
  { skip: !REAL_SOURCE }, () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "outsider-wave3-source-"));
    try {
      cpSync(SOURCE, temporary, { recursive: true });
      const annotationPath = path.join(temporary, "annotations.json");
      const bytes = readFileSync(annotationPath);
      bytes[100] ^= 1;
      writeFileSync(annotationPath, bytes);
      assert.throws(() => verifyPublicAgentWave3Source(temporary),
        /PUBLIC_AGENT_WAVE3_SOURCE_SNAPSHOT_MISMATCH/);
      cpSync(path.join(SOURCE, "annotations.json"), annotationPath);
      const licensePath = path.join(temporary, "LICENSE");
      const license = readFileSync(licensePath);
      const offset = license.indexOf(Buffer.from("Apache"));
      assert.notEqual(offset, -1);
      Buffer.from("ApachX").copy(license, offset);
      writeFileSync(licensePath, license);
      assert.throws(() => verifyPublicAgentWave3Source(temporary),
        /PUBLIC_AGENT_WAVE3_SOURCE_SNAPSHOT_MISMATCH/);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

test("Wave3 CLI emits only bounded metadata projections and deterministic proof artifacts",
  { skip: !REAL_SOURCE }, () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "outsider-wave3-cli-"));
    const output = path.join(temporary, "final");
    try {
      const stdout = execFileSync(process.execPath,
        [fileURLToPath(new URL("../scripts/stage15-public-agent-wave3.mjs", import.meta.url)),
          "--source-dir", SOURCE, "--output-dir", output],
        { encoding: "utf8" });
      const receipt = JSON.parse(stdout);
      assert.equal(receipt.ok, true);
      assert.equal(receipt.records, 272);
      assert.equal(receipt.taskCorrelationComponents, 122);
      assert.equal(receipt.sourceCompleteness, "QUARANTINED_NO_TRACE_BYTES");
      assert.equal(receipt.traceBytesAcquired, 0);
      assert.equal(receipt.trajectoryTruthUsableRows, 0);
      assert.equal(receipt.causalExperienceUnits, 0);
      assert.equal(receipt.economicLossRows, 0);
      assert.equal(receipt.pricingEligibleRows, 0);
      assert.equal(receipt.automaticTraining, false);
      const persisted = readFileSync(path.join(output, "normalized-labels.jsonl"), "utf8");
      assert.equal(persisted.includes("Please help me open the autosave"), false);
      assert.equal(persisted.includes("/Users/haojialin"), false);
      assert.equal(persisted.includes("instructionCommitment"), true);
      assert.equal(persisted.includes("traceObjectHashesVerifiedAgainstBytes\":false"), true);
      assert.equal(existsSync(path.join(output, "metadata-verification.json")), true);
      assert.equal(existsSync(path.join(output, "candidate-decision.json")), true);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

test("Wave3 metadata enters CURATE registry as an independent D2 group and replays exactly",
  { skip: !REAL_SOURCE }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-wave3-registry-"));
    const signer = keys();
    try {
      const registry = new DurableStage1CurateCorpusRegistry({ directory: root,
        privateKeyPem: signer.privateKey, createdAt: T0, registryId: "wave3-metadata-test" });
      const artifact = buildPublicAgentWave3MetadataCorpusArtifactSetFromSource({
        sourceRoot: SOURCE, privateKeyPem: signer.privateKey, createdAt: T0 });
      assert.equal(verifyCorpusArtifactSet(artifact).ok, true);
      assert.equal(artifact.stage, "CURATE");
      assert.equal(artifact.stream, "BACKWARD_EXPERIENCE_EVIDENCE");
      assert.equal(artifact.counts.candidates, 272);
      assert.equal(artifact.sourceProof.sourceKind,
        CUAREWARDBENCH_WAVE3_PIN.sourceKind);
      assert.equal(artifact.sourceProof.verificationLevel,
        "PINNED_METADATA_ONLY_REPRODUCED");
      assert.equal(artifact.sourceProof.sourceCompleteness,
        "QUARANTINED_NO_TRACE_BYTES");
      assert.equal(artifact.sourceProof.migration.method,
        "PINNED_METADATA_REVERIFY_NOT_TRACE_REPLAY");
      registry.appendArtifactSet(artifact, { recordedAt: new Date(T0.getTime() + 1_000) });
      const status = registry.status({ now: new Date(T0.getTime() + 2_000) });
      assert.equal(status.ok, true, status.error);
      assert.equal(status.counts.candidates, 272);
      assert.equal(status.counts.d2Groups, 1);
      assert.equal(status.counts.operatorSignedFullSourceClaims, 0);
      assert.equal(status.counts.operatorSignedPrivacyProjectionClaims, 0);
      const claims = registry.operatorSignedClaimSnapshot({
        now: new Date(T0.getTime() + 2_000),
      });
      assert.equal(claims.ok, true, claims.error);
      assert.equal(claims.operatorSignedClaims[0].artifactSet.sourceProof.sourceCompleteness,
        "QUARANTINED_NO_TRACE_BYTES");
      const replay = verifyPublicAgentWave3MetadataCorpusRegistrySource({ directory: root,
        sourceRoot: SOURCE, now: new Date(T0.getTime() + 2_000) });
      assert.equal(replay.ok, true, replay.error);
      assert.equal(replay.sourceArtifactsReverified, true);
      assert.equal(replay.canonicalBodyExact, true);
      assert.equal(replay.candidates, 272);
      assert.equal(replay.boundary.traceBytesAcquired, 0);
      assert.equal(replay.boundary.trajectoryTruthUsableRows, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("durable registry CLI ingests and source-replays the Wave3 metadata group",
  { skip: !REAL_SOURCE }, () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "outsider-wave3-registry-cli-"));
    const registry = path.join(temporary, "registry");
    const keyFile = path.join(temporary, "signer.pem");
    const signer = keys();
    const cli = fileURLToPath(new URL(
      "../scripts/stage1-curate-corpus-registry.mjs", import.meta.url,
    ));
    try {
      writeFileSync(keyFile, signer.privateKey, { mode: 0o600 });
      const init = JSON.parse(execFileSync(process.execPath,
        [cli, "init", "--dir", registry, "--signing-key", keyFile,
          "--registry-id", "wave3-cli", "--at", T0.toISOString()], { encoding: "utf8" }));
      assert.equal(init.ok, true);
      const ingest = JSON.parse(execFileSync(process.execPath,
        [cli, "ingest-public-agent-wave3-metadata", "--dir", registry,
          "--signing-key", keyFile, "--source-root", SOURCE,
          "--at", new Date(T0.getTime() + 1_000).toISOString()], { encoding: "utf8" }));
      assert.equal(ingest.ok, true);
      assert.equal(ingest.candidates, 272);
      assert.equal(ingest.sourceCompleteness, "QUARANTINED_NO_TRACE_BYTES");
      const replay = JSON.parse(execFileSync(process.execPath,
        [cli, "verify-wave3-metadata-source", "--dir", registry,
          "--source-root", SOURCE,
          "--now", new Date(T0.getTime() + 2_000).toISOString()], { encoding: "utf8" }));
      assert.equal(replay.ok, true, replay.error);
      assert.equal(replay.candidates, 272);
      assert.equal(replay.sourceArtifactsReverified, true);
      assert.equal(replay.boundary.trajectoryTruthUsableRows, 0);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

test("Wave3 candidate decisions defer consequence sources that lack rights or full provenance", () => {
  const decision = buildPublicAgentWave3CandidateDecision();
  assert.equal(decision.schema, PUBLIC_AGENT_WAVE3_SCHEMAS.candidateDecision);
  assert.equal(decision.selected[0].decision,
    "INGEST_METADATA_ONLY_QUARANTINED_NO_TRACE_BYTES");
  assert.equal(decision.deferred.length, 4);
  assert.equal(decision.deferred.find((source) =>
    source.id === "NHTSA_SGO_ADS_CRASH_REPORTS").decision,
  "DEFER_EXISTING_INCIDENT_QUARANTINE");
  assert.equal(decision.boundary.deferredSourcesAdmitted, 0);
  assert.equal(decision.boundary.automaticTraining, false);
  assert.equal(decision.boundary.economicLossRows, 0);
});

test("Wave3 schema names remain metadata-specific", () => {
  assert.equal(PUBLIC_AGENT_WAVE3_SCHEMAS.manifest,
    "outsider/public-agent-wave3-metadata-manifest/v1");
  assert.equal(PUBLIC_AGENT_WAVE3_SCHEMAS.record,
    "outsider/public-agent-wave3-metadata-label/v1");
  assert.equal(CUAREWARDBENCH_WAVE3_PIN.annotationRows, 272);
  assert.equal(createHash("sha256").update("metadata-only").digest("hex").length, 64);
});
