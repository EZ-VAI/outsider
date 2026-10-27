import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  AGENTRX_TAU_WAVE4_PIN,
  AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE,
  PUBLIC_AGENT_WAVE4_SCHEMAS,
  buildPublicAgentWave4CandidateDecision,
  normalizeAgentRxTauFailureTrace,
  verifyPublicAgentWave4Manifest,
  verifyPublicAgentWave4Record,
  verifyPublicAgentWave4RecordSet,
  verifyPublicAgentWave4Source,
} from "../src/outsider-public-agent-wave4.js";
import {
  DurableStage1CurateCorpusRegistry,
  verifyCorpusArtifactSet,
} from "../src/outsider-corpus-registry.js";
import {
  buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource,
  verifyPublicAgentWave4FailureTraceCorpusRegistrySource,
} from "../src/outsider-corpus-registry-intake.js";

const SOURCE = fileURLToPath(new URL(
  "../artifacts/public-agent-wave4-20260821/source/agentrx-tau/", import.meta.url,
));
const REAL_SOURCE = existsSync(path.join(SOURCE, "failure-trajectories.json"))
  && existsSync(path.join(SOURCE, "ground-truth.json"))
  && existsSync(path.join(SOURCE, "linked-dataset-card.md"));
const T0 = new Date("2038-01-01T00:00:00.000Z");

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function reseal(value, hashField, schema) {
  const copy = structuredClone(value);
  delete copy[hashField];
  copy[hashField] = `sha256:${createHash("sha256").update(`${schema}\0`)
    .update(canonicalizeStrict(copy)).digest("hex")}`;
  return copy;
}

test("AgentRx Wave4 reproduces the complete selected failed split and manual label join",
  { skip: !REAL_SOURCE }, () => {
    const result = verifyPublicAgentWave4Source(SOURCE);
    assert.equal(verifyPublicAgentWave4Manifest(result.manifest).ok, true);
    assert.equal(verifyPublicAgentWave4RecordSet(result.records,
      { manifest: result.manifest }).ok, true);
    assert.equal(result.records.every((record) => verifyPublicAgentWave4Record(record).ok), true);
    assert.equal(result.records.length, 29);
    assert.equal(result.recordSet.uniqueIdentities, 29);
    assert.equal(result.recordSet.uniqueTaskCorrelationComponents, 29);
    assert.equal(result.recordSet.uniqueNativeSourceCorrelationComponents, 3);
    assert.equal(new Set(result.records.map((record) => record.identity.sourceRoot)).size, 3);
    assert.equal(result.summary.counts.turns, 1_064);
    assert.equal(result.summary.counts.toolCalls, 284);
    assert.equal(result.summary.counts.writeLikeToolCalls, 62);
    assert.equal(result.summary.counts.annotatedFailureEvents, 39);
    assert.equal(result.summary.counts.multiFailureRows, 7);
    assert.equal(result.summary.counts.rootCauseAfterFirstFailureRows, 2);
    assert.deepEqual(result.summary.counts.rootCauseFailedAgents, { ASSISTANT: 21, USER: 8 });
    assert.equal(result.verification.acquiredObjects, 9);
    assert.equal(result.verification.acquiredBytes, 1_025_707);
    assert.equal(result.verification.traceContainerBytesAcquired, 900_014);
    assert.equal(result.verification.trust.linkedDatasetCardBytesVerified, true);
    assert.equal(result.verification.trust.sourceByteEquivalenceToGatedDatasetEstablished, false);
    assert.equal(result.verification.trust.manualAnnotatorIdentityIndependentlyVerified, false);
    assert.equal(result.verification.trust.actualSandboxExecutionIndependentlyReplayed, false);
    assert.equal(result.summary.counts.trajectoryEvidenceUsableRows, 29);
    assert.equal(result.summary.interpretation.failureRateEstimableFromSelectedScope, false);
    assert.equal(result.summary.counts.causalExperienceUnits, 0);
    assert.equal(result.summary.counts.economicLossRows, 0);
    assert.equal(result.summary.counts.pricingEligibleRows, 0);
    assert.equal(result.summary.counts.productionModelEligibleRows, 0);
    assert.equal(result.summary.interpretation.automaticTraining, false);
    assert.deepEqual(result.manifest.evidenceOntology, AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE);
    assert.deepEqual(result.summary.evidenceOntology, AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE);
    assert.deepEqual(result.verification.evidenceOntology,
      AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE);
    assert.deepEqual(result.records[0].evidenceOntology,
      AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE);
    assert.deepEqual(result.records[0].evidenceOntology.environmentRealityClasses,
      ["SIMULATION"]);
    assert.equal(result.records[0].evidenceOntology.observationOrigin,
      "RECORDED_EXECUTION");
    assert.equal(result.records[0].evidenceOntology.empiricalStatus,
      "EMPIRICAL_RECORDED");
    assert.deepEqual(result.records[0].evidenceOntology.permittedUses,
      ["DESCRIPTIVE", "SHADOW_RESEARCH"]);
    assert.equal(result.records.every((record) => record.labels.benchmarkReward === 0
      && record.labels.economicLossObserved === false
      && record.labels.terminalRecoveryEstablished === false
      && Object.values(record.useBoundary.permits).every((permission) => permission === false)), true);
  });

test("Wave4 semantic verifiers reject re-sealed loss, recovery, replay and authority promotion",
  { skip: !REAL_SOURCE }, () => {
    const result = verifyPublicAgentWave4Source(SOURCE);
    for (const mutate of [
      (value) => { value.labels.economicLossObserved = true; },
      (value) => { value.labels.terminalRecoveryEstablished = true; },
      (value) => { value.labels.actualExecutionOutcomeIndependentlyReplayed = true; },
      (value) => { value.labels.independentAnnotatorIdentityVerified = true; },
      (value) => { value.labels.benchmarkReward = -100; },
      (value) => { value.useBoundary.automaticTraining = true; },
      (value) => { value.useBoundary.permits.CEU = true; },
      (value) => { value.useBoundary.permits.MODEL = true; },
      (value) => { value.useBoundary.permits.LOSS = true; },
      (value) => { value.useBoundary.permits.PRICE = true; },
    ]) {
      const tampered = structuredClone(result.records[0]);
      mutate(tampered);
      const resealed = reseal(tampered, "recordHash", PUBLIC_AGENT_WAVE4_SCHEMAS.record);
      assert.equal(verifyPublicAgentWave4Record(resealed).ok, false);
    }
    const manifest = structuredClone(result.manifest);
    manifest.source.license.linkedDatasetIdentifier = "PROPRIETARY";
    assert.equal(verifyPublicAgentWave4Manifest(reseal(manifest, "manifestHash",
      PUBLIC_AGENT_WAVE4_SCHEMAS.manifest)).ok, false);
    const promotedReality = structuredClone(result.records[0]);
    promotedReality.evidenceOntology.environmentRealityClasses = ["REAL_SOFTWARE"];
    assert.equal(verifyPublicAgentWave4Record(reseal(promotedReality, "recordHash",
      PUBLIC_AGENT_WAVE4_SCHEMAS.record)).ok, false);
  });

test("Wave4 normalizer requires the exact task-to-annotation join",
  { skip: !REAL_SOURCE }, () => {
    const trajectories = JSON.parse(readFileSync(path.join(SOURCE,
      "failure-trajectories.json"), "utf8"));
    const annotations = JSON.parse(readFileSync(path.join(SOURCE, "ground-truth.json"), "utf8"));
    assert.notEqual(trajectories[0].task_id, annotations[1].trajectory_id);
    assert.throws(() => normalizeAgentRxTauFailureTrace(trajectories[0], annotations[1], {
      trajectoryContainerHash:
        "sha256:17f8b3356d1124274cc7ed0215b5ff696970073dbed57394c60e775d5f85d717",
      annotationContainerHash:
        "sha256:58067689b2ec42f9cbfec2a84ec08d39cea4d8270617b55d0185862753642d16",
    }), /PUBLIC_AGENT_WAVE4_ANNOTATION_SHAPE_INVALID/);
  });

test("Wave4 source verification rejects byte substitution and undeclared objects",
  { skip: !REAL_SOURCE }, () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "outsider-wave4-source-"));
    const copy = path.join(temporary, "source");
    try {
      cpSync(SOURCE, copy, { recursive: true });
      const tracePath = path.join(copy, "failure-trajectories.json");
      const traceBytes = readFileSync(tracePath);
      traceBytes[100] ^= 1;
      writeFileSync(tracePath, traceBytes);
      assert.throws(() => verifyPublicAgentWave4Source(copy),
        /PUBLIC_AGENT_WAVE4_SOURCE_SNAPSHOT_MISMATCH/);
      cpSync(path.join(SOURCE, "failure-trajectories.json"), tracePath);
      const cardPath = path.join(copy, "linked-dataset-card.md");
      const cardBytes = readFileSync(cardPath);
      cardBytes[20] ^= 1;
      writeFileSync(cardPath, cardBytes);
      assert.throws(() => verifyPublicAgentWave4Source(copy),
        /PUBLIC_AGENT_WAVE4_SOURCE_SNAPSHOT_MISMATCH/);
      cpSync(path.join(SOURCE, "linked-dataset-card.md"), cardPath);
      writeFileSync(path.join(copy, "undeclared.txt"), "extra\n");
      assert.throws(() => verifyPublicAgentWave4Source(copy),
        /PUBLIC_AGENT_WAVE4_SOURCE_FILE_SET_MISMATCH/);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

test("Wave4 CLI emits deterministic hash-only projections without raw trace or annotation text",
  { skip: !REAL_SOURCE }, () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "outsider-wave4-cli-"));
    const first = path.join(temporary, "first");
    const second = path.join(temporary, "second");
    const cli = fileURLToPath(new URL("../scripts/stage15-public-agent-wave4.mjs",
      import.meta.url));
    try {
      const firstReceipt = JSON.parse(execFileSync(process.execPath,
        [cli, "--source-dir", SOURCE, "--output-dir", first], { encoding: "utf8" }));
      const secondReceipt = JSON.parse(execFileSync(process.execPath,
        [cli, "--source-dir", SOURCE, "--output-dir", second], { encoding: "utf8" }));
      assert.equal(firstReceipt.records, 29);
      assert.equal(firstReceipt.taskCorrelationComponents, 29);
      assert.equal(firstReceipt.nativeSourceCorrelationComponents, 3);
      assert.equal(firstReceipt.traceContainerBytesAcquired, 900_014);
      assert.equal(firstReceipt.trajectoryEvidenceUsableRows, 29);
      assert.equal(firstReceipt.failureRateEstimableFromSelectedScope, false);
      assert.equal(firstReceipt.causalExperienceUnits, 0);
      assert.equal(firstReceipt.economicLossRows, 0);
      assert.equal(firstReceipt.pricingEligibleRows, 0);
      assert.equal(firstReceipt.productionModelEligibleRows, 0);
      assert.equal(firstReceipt.automaticTraining, false);
      const { outputDirectory: firstOutput, ...firstStable } = firstReceipt;
      const { outputDirectory: secondOutput, ...secondStable } = secondReceipt;
      assert.equal(firstOutput, first);
      assert.equal(secondOutput, second);
      assert.deepEqual(firstStable, secondStable);
      const names = readdirSync(first).sort();
      assert.deepEqual(names, readdirSync(second).sort());
      for (const name of names) {
        assert.deepEqual(readFileSync(path.join(first, name)), readFileSync(path.join(second, name)));
      }
      const rawTrajectories = JSON.parse(readFileSync(path.join(SOURCE,
        "failure-trajectories.json"), "utf8"));
      const rawAnnotations = JSON.parse(readFileSync(path.join(SOURCE,
        "ground-truth.json"), "utf8"));
      const normalized = readFileSync(path.join(first, "normalized-failure-traces.jsonl"), "utf8");
      assert.equal(normalized.includes(rawTrajectories[0].info.task.instruction), false);
      assert.equal(normalized.includes(rawAnnotations[0].failure_summary), false);
      assert.equal(normalized.includes("rawTracePersisted\":false"), true);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

test("Wave4 enters CURATE as a zero-authority full-source group and source-replays exactly",
  { skip: !REAL_SOURCE }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-wave4-registry-"));
    const signer = keys();
    try {
      const registry = new DurableStage1CurateCorpusRegistry({ directory: root,
        privateKeyPem: signer.privateKey, createdAt: T0, registryId: "wave4-test" });
      const artifact = buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource({
        sourceRoot: SOURCE, privateKeyPem: signer.privateKey, createdAt: T0 });
      assert.equal(verifyCorpusArtifactSet(artifact).ok, true);
      assert.equal(artifact.stage, "CURATE");
      assert.equal(artifact.stream, "BACKWARD_EXPERIENCE_EVIDENCE");
      assert.equal(artifact.counts.candidates, 29);
      assert.deepEqual(artifact.licenseIds, ["MIT"]);
      assert.equal(artifact.sourceProof.sourceKind, AGENTRX_TAU_WAVE4_PIN.sourceKind);
      assert.equal(artifact.sourceProof.verificationLevel, "FULL_SOURCE_REPRODUCED");
      assert.equal(artifact.sourceProof.sourceCompleteness, "FULL_DECLARED_SOURCE_SCOPE");
      assert.equal(artifact.sourceProof.sourceArtifactHashes.length, 9);
      assert.equal(artifact.boundary.causalExperienceUnits, 0);
      assert.equal(artifact.boundary.economicLossRows, 0);
      assert.equal(artifact.boundary.pricingEligible, false);
      registry.appendArtifactSet(artifact, { recordedAt: new Date(T0.getTime() + 1_000) });
      const replay = verifyPublicAgentWave4FailureTraceCorpusRegistrySource({ directory: root,
        sourceRoot: SOURCE, now: new Date(T0.getTime() + 2_000) });
      assert.equal(replay.ok, true, replay.error);
      assert.equal(replay.candidates, 29);
      assert.equal(replay.sourceArtifactsReverified, true);
      assert.equal(replay.canonicalBodyExact, true);
      assert.equal(replay.boundary.trajectoryEvidenceUsableRows, 29);
      assert.equal(replay.boundary.failureRateEstimableFromSelectedScope, false);
      assert.equal(replay.boundary.causalExperienceUnits, 0);
      assert.equal(replay.boundary.economicLossRows, 0);
      const raw = JSON.parse(readFileSync(path.join(SOURCE, "failure-trajectories.json"), "utf8"));
      const stored = readFileSync(path.join(root, "artifact-sets",
        `${artifact.artifactSetHash.slice(7)}.json`), "utf8");
      assert.equal(stored.includes(raw[0].info.task.instruction), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("Wave4 registry CLI ingests and independently source-replays the declared selection",
  { skip: !REAL_SOURCE }, () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "outsider-wave4-registry-cli-"));
    const registry = path.join(temporary, "registry");
    const keyFile = path.join(temporary, "signer.pem");
    const signer = keys();
    const cli = fileURLToPath(new URL("../scripts/stage1-curate-corpus-registry.mjs",
      import.meta.url));
    try {
      writeFileSync(keyFile, signer.privateKey, { mode: 0o600 });
      const init = JSON.parse(execFileSync(process.execPath,
        [cli, "init", "--dir", registry, "--signing-key", keyFile,
          "--registry-id", "wave4-cli", "--at", T0.toISOString()], { encoding: "utf8" }));
      assert.equal(init.ok, true);
      const ingest = JSON.parse(execFileSync(process.execPath,
        [cli, "ingest-public-agent-wave4-failure-traces", "--dir", registry,
          "--signing-key", keyFile, "--source-root", SOURCE,
          "--at", new Date(T0.getTime() + 1_000).toISOString()], { encoding: "utf8" }));
      assert.equal(ingest.ok, true);
      assert.equal(ingest.candidates, 29);
      assert.equal(ingest.sourceCompleteness, "FULL_DECLARED_SOURCE_SCOPE");
      const replay = JSON.parse(execFileSync(process.execPath,
        [cli, "verify-wave4-failure-trace-source", "--dir", registry,
          "--source-root", SOURCE,
          "--now", new Date(T0.getTime() + 2_000).toISOString()], { encoding: "utf8" }));
      assert.equal(replay.ok, true, replay.error);
      assert.equal(replay.candidates, 29);
      assert.equal(replay.boundary.trajectoryEvidenceUsableRows, 29);
      assert.equal(replay.boundary.pricingEligibleRows, 0);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

test("Wave4 candidate decision records size, access, license and provenance deferrals", () => {
  const decision = buildPublicAgentWave4CandidateDecision();
  assert.equal(decision.schema, PUBLIC_AGENT_WAVE4_SCHEMAS.candidateDecision);
  assert.equal(decision.selected[0].decision,
    "INGEST_FULL_SELECTED_TRACE_AND_MANUAL_FAILURE_LABELS_QUARANTINED");
  assert.deepEqual(decision.selectedSourceOntology, AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE);
  assert.equal(decision.deferred.length, 4);
  assert.equal(decision.deferred.find((candidate) =>
    candidate.id === "microsoft/CUAVerifierBench").decision,
  "DEFER_TRAJECTORY_OBJECTS_OVER_256_MIB");
  assert.equal(decision.deferred.find((candidate) =>
    candidate.id === "CUADebug/CUAErrorBench").blockers.includes(
    "DATA_LICENSE_NOT_VERIFIED"), true);
  assert.equal(decision.boundary.causalExperienceUnits, 0);
  assert.equal(decision.boundary.failureRateEstimableFromSelectedScope, false);
  assert.equal(decision.boundary.economicLossRows, 0);
  assert.equal(decision.boundary.automaticTraining, false);
});
