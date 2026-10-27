import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync }
  from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_AGENT_WAVE2_PINS,
  PUBLIC_AGENT_WAVE2_SCHEMAS,
  normalizeAtbenchClawRow,
  normalizeAtbenchCodexRow,
  normalizeMatmAlfworldRow,
  normalizeTau2Simulation,
  verifyPublicAgentWave2Manifest,
  verifyPublicAgentWave2Record,
  verifyPublicAgentWave2RecordSet,
  verifyPublicAgentWave2Source,
} from "../src/outsider-public-agent-wave2.js";
import { publicAgentDigest } from "../src/outsider-public-agent-corpus.js";

const SOURCE = fileURLToPath(new URL(
  "../artifacts/public-agent-wave2-20260821/source/", import.meta.url,
));
const REAL_SOURCE = ["atbench-codex/test.json", "atbench-claw/test.json",
  "tau2-bench/results.json", "matm/results.json",
  "candidates/cuaverifierbench/repository-tree.json"]
  .every((name) => existsSync(join(SOURCE, name)));
const H = `sha256:${"a".repeat(64)}`;

test("wave2 normalizers keep benchmark observations outside loss and authority", () => {
  const codex = normalizeAtbenchCodexRow({ id: 1,
    conversation: [{ role: "user", content: "inspect" },
      { role: "assistant", content: "done" }],
    codex_rollout: [
      { timestamp: "2026-01-01T00:00:00.000Z", type: "session_meta",
        payload: { id: "s1", cli_version: "synthetic",
          base_instructions: "Synthetic Codex rollout generated from ATBench trajectory." } },
      { timestamp: "2026-01-01T00:00:00.100Z", type: "turn_context",
        payload: { model: "model-a" } },
      { timestamp: "2026-01-01T00:00:00.200Z", type: "response_item",
        payload: { type: "function_call" } },
      { timestamp: "2026-01-01T00:00:00.300Z", type: "response_item",
        payload: { type: "function_call_output", output: "{\"status\":\"error\"}" } },
    ], is_safe: false, output_format: "codex_rollout", defense_type: null,
    risk_source: "tool", failure_mode: "overreach", harm_type: "functional" },
  { rowIndex: 0, sourceObjectHash:
    "sha256:b402a8b6b7fdeea20f0acb1e5b88308307c74e003c1724fde7290496ff12970f" });
  assert.equal(verifyPublicAgentWave2Record(codex).ok, true);
  assert.equal(codex.episode.toolCallCount, 1);
  assert.equal(codex.episode.errorCount, 1);
  assert.equal(codex.detectorOutputs.generatorDeclaredSynthetic, true);

  const claw = normalizeAtbenchClawRow({ trajectory: { type: "session", version: 3,
    provider: "", modelId: "", events: [
      { type: "message", message: { role: "user", content: [{ type: "text", text: "task" }] } },
      { type: "message", message: { role: "assistant",
        content: [{ type: "toolCall", name: "read" }] } },
      { type: "message", message: { role: "toolResult", isError: true, content: [] } },
    ] }, labels: { is_safe: true, risk_source: "input", failure_mode: "none",
    harm_type: "none", defense_type: "defended" }, reason: "fixture" },
  { rowIndex: 0, sourceObjectHash:
    "sha256:bc04db0db900fd63ac4c59ba651584be2dc8dbd51861c98ffeb21f13c9495c8b" });
  assert.equal(verifyPublicAgentWave2Record(claw).ok, true);
  assert.equal(claw.episode.toolResultCount, 1);

  const tau = normalizeTau2Simulation({ id: "run-1", task_id: "1", duration: 1.25,
    termination_reason: "user_stop", agent_cost: 0.01, user_cost: 0.02,
    reward_info: { reward: 1 }, messages: [
      { role: "user", tool_calls: null },
      { role: "assistant", tool_calls: [{ name: "lookup" }] },
      { role: "tool", error: true },
    ] }, { rowIndex: 0, sourceObjectHash:
      "sha256:6a3a354c9bce42b52905af096e9cea6f555548acbb17b567fd403c356df7b4ec",
    runInfo: { domain: "airline", agentModel: "o4-mini-2025-04-16",
      userModel: "gpt-4.1-2025-04-14" } });
  assert.equal(verifyPublicAgentWave2Record(tau).ok, true);
  assert.equal(tau.detectorOutputs.errorThenBenchmarkSuccess, true);
  assert.equal(tau.useBoundary.economicLossObserved, false);
  assert.equal(tau.useBoundary.permits.PRICE, false);

  const matm = normalizeMatmAlfworldRow({ task_name: "pick", variation_id: "v1",
    taskDescription: "put object", done: false, finalScore: 0, actionSequences: [
      { action: "look", observation: "room", isCompleted: false, score: 0 },
    ] }, { rowIndex: 0, sourceObjectHash:
      "sha256:d4f9d4f20b47cd45ea61fad17c6ea7fe95bdd3f3d03443351ba518b56e811615" });
  assert.equal(verifyPublicAgentWave2Record(matm).ok, true);
  assert.equal(matm.labels.nativeOutcomeValue, false);
  assert.equal(matm.detectorOutputs.nativeFinalScore, 0);
});

test("wave2 records reject relabeling, extra outputs and authority escalation", () => {
  const record = normalizeMatmAlfworldRow({ variation_id: "v1", done: true,
    finalScore: 1, actionSequences: [{ action: "look", observation: "done" }] },
  { rowIndex: 0, sourceObjectHash:
    "sha256:d4f9d4f20b47cd45ea61fad17c6ea7fe95bdd3f3d03443351ba518b56e811615" });
  for (const mutate of [
    (copy) => { copy.labels.economicLossObserved = true; },
    (copy) => { copy.useBoundary.permits.PRICE = true; },
    (copy) => { copy.detectorOutputs.unregisteredDetector = 1; },
    (copy) => { copy.roots.correlationRoots.push(H); },
  ]) {
    const copy = structuredClone(record); mutate(copy);
    assert.equal(verifyPublicAgentWave2Record(copy).ok, false);
  }
});

test("full selected source objects reproduce 1,474 bounded records",
  { skip: !REAL_SOURCE }, () => {
    const result = verifyPublicAgentWave2Source(SOURCE,
      { generatedAt: "2026-08-21T00:00:00.000Z" });
    assert.equal(result.records.length, 1474);
    assert.equal(result.recordSet.counts[PUBLIC_AGENT_WAVE2_PINS.atbenchCodex.id], 500);
    assert.equal(result.recordSet.counts[PUBLIC_AGENT_WAVE2_PINS.atbenchClaw.id], 500);
    assert.equal(result.recordSet.counts[PUBLIC_AGENT_WAVE2_PINS.tau2Airline.id], 200);
    assert.equal(result.recordSet.counts[PUBLIC_AGENT_WAVE2_PINS.matmAlfworld.id], 274);
    assert.equal(verifyPublicAgentWave2Manifest(result.manifest).ok, true);
    assert.equal(verifyPublicAgentWave2RecordSet(result.records,
      { manifest: result.manifest }).ok, true);
    assert.equal(result.verification.acquiredBytes, 30697838);
    assert.equal(result.verification.dataObjectBytes, 29955462);
    assert.equal(result.summary.correlationComponents, 4);
    assert.equal(result.summary.interpretation.syntheticOrSimulatedBenchmarkRows, 1200);
    assert.equal(result.summary.interpretation.economicLossRows, 0);
    assert.equal(result.summary.interpretation.causalExperienceUnits, 0);
    assert.equal(result.summary.interpretation.automaticTraining, false);
    assert.equal(result.summary.benchmarkRuntimeSpend.agentApiCostUsd, 10.096792200000001);
    assert.equal(result.summary.benchmarkRuntimeSpend.userSimulatorApiCostUsd, 2.235594);
    const tau = result.records.filter((record) =>
      record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.tau2Airline.id);
    assert.equal(tau.filter((record) => record.episode.errorCount > 0).length, 10);
    assert.equal(tau.filter((record) =>
      record.detectorOutputs.errorThenBenchmarkSuccess).length, 9);
    assert.equal(result.records.filter((record) =>
      record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.atbenchCodex.id)
      .every((record) => record.detectorOutputs.generatorDeclaredSynthetic === true), true);
    const cua = result.candidateDecision.frozenCandidateEvidence[0];
    assert.equal(cua.revision, "c19eb323cd802add5c3d2840ff13044061364867");
    assert.equal(cua.trajectoryBytes, 1502516810);
    assert.equal(cua.verifierOutputsTreatedAsGroundTruth, false);
  });

test("manifest and record-set verification reject source or multiplicity forgery",
  { skip: !REAL_SOURCE }, () => {
    const result = verifyPublicAgentWave2Source(SOURCE,
      { generatedAt: "2026-08-21T00:00:00.000Z" });
    const manifest = structuredClone(result.manifest);
    manifest.sources[0].license.identifier = "NO-LICENSE";
    const { manifestHash: _oldHash, ...manifestBody } = manifest;
    manifest.manifestHash = publicAgentDigest(manifestBody,
      PUBLIC_AGENT_WAVE2_SCHEMAS.manifest);
    assert.equal(verifyPublicAgentWave2Manifest(manifest).ok, false);
    assert.equal(verifyPublicAgentWave2RecordSet([...result.records, result.records[0]],
      { manifest: result.manifest }).ok, false);
  });

test("full-source verifier rejects a same-size byte swap before derivation",
  { skip: !REAL_SOURCE }, () => {
    const temporary = mkdtempSync(join(tmpdir(), "outsider-wave2-swap-"));
    const copy = join(temporary, "source");
    try {
      cpSync(SOURCE, copy, { recursive: true });
      const target = join(copy, "atbench-codex", "README.md");
      const bytes = readFileSync(target);
      bytes[bytes.length - 1] ^= 1;
      writeFileSync(target, bytes);
      assert.throws(() => verifyPublicAgentWave2Source(copy,
        { generatedAt: "2026-08-21T00:00:00.000Z" }),
      /PUBLIC_AGENT_WAVE2_SOURCE_SNAPSHOT_MISMATCH/);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

test("wave2 CLI persists only projections and proof artifacts",
  { skip: !REAL_SOURCE }, () => {
    const temporary = mkdtempSync(join(tmpdir(), "outsider-wave2-test-"));
    const output = join(temporary, "final");
    try {
      const stdout = execFileSync(process.execPath,
        [fileURLToPath(new URL("../scripts/stage15-public-agent-wave2.mjs", import.meta.url)),
          "--source-dir", SOURCE, "--output-dir", output,
          "--generated-at", "2026-08-21T00:00:00.000Z"], { encoding: "utf8" });
      assert.equal(JSON.parse(stdout).records, 1474);
      const names = ["acquisition-manifest.json", "candidate-decision.json",
        "effect-summary.json", "full-source-verification.json", "normalized-records.jsonl",
        "record-set.json", "run-receipt.json"];
      assert.equal(names.every((name) => existsSync(join(output, name))), true);
      const normalized = readFileSync(join(output, "normalized-records.jsonl"), "utf8");
      assert.equal(normalized.includes("/mnt/shared-storage-user"), false);
      const receipt = JSON.parse(readFileSync(join(output, "run-receipt.json"), "utf8"));
      assert.deepEqual(receipt.boundary, { economicLossRows: 0, causalExperienceUnits: 0,
        pricingEligibleRows: 0, automaticTraining: false, financialEffect: "none" });
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

test("wave2 schema names remain research-specific", () => {
  assert.equal(PUBLIC_AGENT_WAVE2_SCHEMAS.manifest,
    "outsider/public-agent-wave2-acquisition-manifest/v1");
  assert.equal(PUBLIC_AGENT_WAVE2_SCHEMAS.summary,
    "outsider/public-agent-wave2-effect-summary/v1");
});
