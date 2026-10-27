import test from "node:test";
import assert from "node:assert/strict";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import readline from "node:readline";
import {
  PUBLIC_AGENT_PINS,
  PUBLIC_AGENT_SCHEMAS,
  buildPublicAgentAcquisitionManifest,
  buildPublicAgentProvenanceProof,
  normalizeComputerAgentArenaRow,
  normalizeNebiusOpenHandsRow,
  normalizeOpenHandsFeedbackRow,
  normalizeTraceLabSession,
  parseComputerAgentArenaSessionsCsv,
  publicAgentDigest,
  summarizePublicAgentRecords,
  traceLabUserTurnCount,
  verifyPublicAgentAcquisitionManifest,
  verifyPublicAgentRecord,
  verifyPublicAgentRecordSet,
} from "../src/outsider-public-agent-corpus.js";

const H = (value) => publicAgentDigest(value, "test/object/v1");
const proof = (pin, path) => buildPublicAgentProvenanceProof({ datasetId: pin.id,
  byteObjectPaths: [path], revisionObjectPaths: [path], licenseObjectPaths: [path] });

test("four public-agent adapters retain native labels behind a zero-loss boundary", () => {
  const openhands = normalizeOpenHandsFeedbackRow({ feedback: "negative",
    permissions: "public", timestamp: "2024-10-06T12:25:18", trajectory: [
      { source: "user", action: "message", content: "task" },
      { source: "agent", action: "run", observation: "error: failed" },
    ] }, { rowIndex: 0, sourceObjectHash: H("oh") });
  const arena = normalizeComputerAgentArenaRow({ task_id: "task-1", model: "agent-a",
    human_eval_correctness: 0, traj: [
      { image: "1.png", value: { thought: "try", code: "click()" } },
      { image: "2.png", value: { thought: "error: failed", code: "done()" } },
    ] },
  { rowIndex: 0, sourceObjectHash: H("caa") });
  const nebius = normalizeNebiusOpenHandsRow({ trajectory_id: "trajectory-1",
    instance_id: "org__repo-1", repo: "org/repo", resolved: 1,
    gen_tests_correct: 1, pred_passes_gen_tests: 1, trajectory: [
      { role: "user", content: "issue" },
      { role: "assistant", tool_calls: [{ id: "x" }] },
      { role: "tool", tool_call_id: "x", content: "ok" },
    ] }, { rowIndex: 0, sourceObjectHash: H("nebius") });
  const trace = normalizeTraceLabSession({ sessionId: "session-1", userId: "user-1",
    roundCount: 4, toolCallCount: 3, toolResultCount: 3, errorCount: 1,
    userTurnCount: 2, inputTokens: 100, outputTokens: 20, cachedInputTokens: 50,
    providers: ["codex"] }, { sourceObjectHash: H("trace") });

  assert.equal(openhands.labels.preferenceOnly, true);
  assert.equal(arena.labels.nativeOutcomeValue, false);
  assert.equal(arena.episode.toolCallCount, 2);
  assert.equal(arena.episode.errorCount, 1);
  assert.equal(nebius.labels.benchmarkResolvedOnly, true);
  assert.equal(trace.labels.nativeOutcomeValue, null);
  for (const record of [openhands, arena, nebius, trace]) {
    assert.deepEqual(verifyPublicAgentRecord(record), { ok: true });
    assert.equal(record.labels.economicLossObserved, false);
    assert.equal(record.labels.lossMinorUnits, null);
    assert.equal(record.useBoundary.permits.PRICE, false);
  }
});

test("correlation roots group repeated tasks and repositories conservatively", () => {
  const one = normalizeComputerAgentArenaRow({ task_id: "same-task", model: "a",
    human_eval_correctness: 1, traj: [{ image: "1" }, { image: "2" }] },
  { rowIndex: 1, sourceObjectHash: H("caa") });
  const two = normalizeComputerAgentArenaRow({ task_id: "same-task", model: "b",
    human_eval_correctness: 0, traj: [{ image: "1" }, { image: "2" }] },
  { rowIndex: 2, sourceObjectHash: H("caa") });
  assert.equal(one.roots.taskRoot, two.roots.taskRoot);
  assert.ok(one.roots.correlationRoots.includes(one.roots.taskRoot));
  assert.ok(two.roots.correlationRoots.includes(one.roots.taskRoot));

  const input = (trajectoryId, instanceId) => ({ trajectory_id: trajectoryId,
    instance_id: instanceId, repo: "same/repo", resolved: 0,
    trajectory: [{ role: "user" }, { role: "assistant" }] });
  const a = normalizeNebiusOpenHandsRow(input("t1", "i1"),
    { rowIndex: 1, sourceObjectHash: H("n") });
  const b = normalizeNebiusOpenHandsRow(input("t2", "i2"),
    { rowIndex: 2, sourceObjectHash: H("n") });
  assert.equal(a.roots.repositoryRoot, b.roots.repositoryRoot);
  assert.notEqual(a.roots.taskRoot, b.roots.taskRoot);
});

test("manifest binds acquired hashes, pins and license declarations", () => {
  const sources = Object.values(PUBLIC_AGENT_PINS).map((pin) => ({
    id: pin.id, revision: pin.revision, sourceClass: pin.sourceClass,
    upstreamObject: pin.upstreamObject,
    license: { identifier: pin.licenseId, declarationUrl: pin.licenseDeclarationUrl,
      adapterGrantsRights: false, attributionRequired: pin.licenseId === "CC-BY-4.0" },
    sampling: { kind: "test-fixture" },
    correlationPolicy: "source-specific-conservative-roots",
    provenanceProof: proof(pin, pin.upstreamObject.path),
    acquiredObjects: [{ path: pin.upstreamObject.path, sizeBytes: 10,
      sha256: H(pin.id) }],
  }));
  const manifest = buildPublicAgentAcquisitionManifest({
    generatedAt: "2026-08-20T00:00:00.000Z", sources,
  });
  assert.deepEqual(verifyPublicAgentAcquisitionManifest(manifest), {
    ok: true, manifestHash: manifest.manifestHash,
  });
  assert.deepEqual(manifest.generatedAtEvidence,
    { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false });
  const tampered = structuredClone(manifest);
  tampered.sources[0].acquiredObjects[0].sizeBytes += 1;
  assert.equal(verifyPublicAgentAcquisitionManifest(tampered).ok, false);

  const caa = normalizeComputerAgentArenaRow({ task_id: "bound", model: "agent",
    human_eval_correctness: 1, traj: [{ image: "1" }, { image: "2" }] },
  { rowIndex: 0, sourceObjectHash: H(PUBLIC_AGENT_PINS.computerAgentArena.id) });
  assert.equal(verifyPublicAgentRecord(caa, { manifest }).ok, true);
  const setProof = verifyPublicAgentRecordSet([caa], { manifest });
  assert.equal(setProof.ok, true);
  assert.match(setProof.recordSetHash, /^sha256:[a-f0-9]{64}$/);
});

test("public hash re-sealing cannot authorize use, widen privacy, or change pinned rights", () => {
  const record = normalizeComputerAgentArenaRow({ task_id: "task", instruction: "same task",
    model: "agent", human_eval_correctness: 1,
    traj: [{ image: "1", value: { code: "click()" } },
      { image: "2", value: { code: "done()" } }] },
  { rowIndex: 0, sourceObjectHash: H("caa") });
  const forged = structuredClone(record);
  forged.useBoundary.disposition = "PRODUCTION_AUTHORIZED";
  forged.useBoundary.automaticTraining = true;
  forged.useBoundary.permits = { PRICE: true, GUARANTEE: true, SETTLE: true };
  forged.privacy.rawContentIncluded = true;
  const { recordHash: ignored, ...body } = forged;
  forged.recordHash = publicAgentDigest(body, PUBLIC_AGENT_SCHEMAS.record);
  assert.equal(verifyPublicAgentRecord(forged).ok, false);
  assert.throws(() => summarizePublicAgentRecords([forged],
    { manifestHash: H("manifest") }), /PUBLIC_AGENT_RECORD_BOUNDARY_INVALID/);

  const sources = Object.values(PUBLIC_AGENT_PINS).map((pin) => ({ id: pin.id,
    revision: pin.revision, sourceClass: pin.sourceClass, upstreamObject: pin.upstreamObject,
    license: { identifier: pin.licenseId, declarationUrl: pin.licenseDeclarationUrl,
      adapterGrantsRights: false, attributionRequired: pin.licenseId === "CC-BY-4.0" },
    sampling: { kind: "test" }, correlationPolicy: "fixed",
    provenanceProof: proof(pin, `${pin.id.replace("/", "-")}.json`),
    acquiredObjects: [{ path: `${pin.id.replace("/", "-")}.json`, sizeBytes: 1,
      sha256: H(pin.id) }],
  }));
  const manifest = buildPublicAgentAcquisitionManifest({
    generatedAt: "2026-08-20T00:00:00.000Z", sources });
  const rightsForgery = structuredClone(manifest);
  rightsForgery.sources[0].license.adapterGrantsRights = true;
  rightsForgery.sources[0].license.identifier = "UNLIMITED";
  const { manifestHash: oldHash, ...manifestBody } = rightsForgery;
  rightsForgery.manifestHash = publicAgentDigest(manifestBody, PUBLIC_AGENT_SCHEMAS.manifest);
  assert.equal(verifyPublicAgentAcquisitionManifest(rightsForgery).ok, false);

  const proofForgery = structuredClone(manifest);
  proofForgery.sources[0].provenanceProof.revisionBinding.cryptographicInclusionProof = true;
  const { manifestHash: ignoredProofHash, ...proofBody } = proofForgery;
  proofForgery.manifestHash = publicAgentDigest(proofBody, PUBLIC_AGENT_SCHEMAS.manifest);
  assert.equal(verifyPublicAgentAcquisitionManifest(proofForgery).ok, false);
});

test("unknown feedback is hash-only and binary labels reject coercion", () => {
  const unknown = normalizeOpenHandsFeedbackRow({ feedback: "private-free-form-label",
    permissions: "public", trajectory: [{ source: "user" }, { source: "agent" }] },
  { rowIndex: 3, sourceObjectHash: H("oh") });
  assert.equal(unknown.labels.nativeOutcomeValue, null);
  assert.match(unknown.detectorOutputs.unrecognizedNativeLabelHash,
    /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(unknown), /private-free-form-label/);
  assert.throws(() => normalizeOpenHandsFeedbackRow({ feedback: "positive",
    permissions: "private", trajectory: [{}, {}] },
  { rowIndex: 4, sourceObjectHash: H("oh") }), /OPENHANDS_NOT_PUBLIC/);
  assert.throws(() => normalizeComputerAgentArenaRow({ task_id: "x", model: "m",
    human_eval_correctness: "not-a-bit", traj: [{}, {}] },
  { rowIndex: 0, sourceObjectHash: H("c") }), /CAA_LABEL_INVALID/);
  assert.throws(() => normalizeNebiusOpenHandsRow({ trajectory_id: "x", instance_id: "i",
    repo: "o/r", resolved: 2, trajectory: [{}, {}] },
  { rowIndex: 0, sourceObjectHash: H("n") }), /NEBIUS_LABEL_INVALID/);
});

test("CAA sessions CSV maps both agent conversations into shared user/session roots", () => {
  const csv = [
    "session_id,user_id,agent0_conversation_id,agent1_conversation_id,task_instruction,setup_description,agent0_model,agent1_model",
    "session-1,user-1,conversation-0,conversation-1,shared instruction,shared setup,model-0,model-1",
  ].join("\n");
  const contexts = parseComputerAgentArenaSessionsCsv(csv);
  assert.equal(contexts.size, 2);
  const first = normalizeComputerAgentArenaRow({ task_id: "conversation-0",
    instruction: "shared instruction", model: "model-0", human_eval_correctness: 1,
    traj: [{ image: "1" }, { image: "2" }] }, { rowIndex: 0,
    sourceObjectHash: H("caa"), correlation: contexts.get("conversation-0") });
  const second = normalizeComputerAgentArenaRow({ task_id: "conversation-1",
    instruction: "shared instruction", model: "model-1", human_eval_correctness: 0,
    traj: [{ image: "1" }, { image: "2" }] }, { rowIndex: 1,
    sourceObjectHash: H("caa"), correlation: contexts.get("conversation-1") });
  assert.equal(first.roots.userRoot, second.roots.userRoot);
  assert.equal(first.roots.sessionRoot, second.roots.sessionRoot);
  assert.equal(first.roots.instructionRoot, second.roots.instructionRoot);
  assert.equal(first.roots.setupRoot, second.roots.setupRoot);
  assert.notEqual(first.roots.modelRoot, second.roots.modelRoot);
});

test("TraceLab native timing_events.event_type counts user messages", () => {
  assert.equal(traceLabUserTurnCount({ timing_events: [
    { event_type: "user_message", timestamp: "2026-01-01T00:00:00Z" },
    { event_type: "tool_call", timestamp: "2026-01-01T00:00:01Z" },
    { event_type: "tool_result", timestamp: "2026-01-01T00:00:02Z" },
    { event_type: "user_message", timestamp: "2026-01-01T00:00:03Z" },
  ] }), 2);
});

const REAL_CAA = "artifacts/public-agent-corpus-20260820/source/computer-agent-arena";
test("real CAA 4,641 trajectories all bind to sessions.csv context", {
  skip: !existsSync(`${REAL_CAA}/agent_arena_data.jsonl`),
}, async () => {
  const contexts = parseComputerAgentArenaSessionsCsv(
    readFileSync(`${REAL_CAA}/sessions.csv`, "utf8"));
  assert.equal(new Set([...contexts.values()].map((context) => context.sessionId)).size, 3635);
  assert.equal(new Set([...contexts.values()].map((context) => context.userId)).size, 1129);
  const input = readline.createInterface({
    input: createReadStream(`${REAL_CAA}/agent_arena_data.jsonl`), crlfDelay: Infinity,
  });
  let rows = 0;
  for await (const line of input) {
    if (!line) continue;
    const row = JSON.parse(line);
    const context = contexts.get(row.task_id);
    assert.ok(context, row.task_id);
    rows += 1;
  }
  assert.equal(rows, 4641);
});

test("summary is descriptive and refuses economic-loss promotion", () => {
  const rows = [0, 1].map((value) => normalizeComputerAgentArenaRow({
    task_id: `task-${value}`, model: "agent", human_eval_correctness: value,
    traj: [{ image: "1", code: "click" }, { image: "2", code: "done" }],
  }, { rowIndex: value, sourceObjectHash: H("caa") }));
  const summary = summarizePublicAgentRecords(rows, { manifestHash: H("manifest") });
  assert.equal(summary.interpretation.design, "descriptive-association-only");
  assert.equal(summary.interpretation.economicLossRows, 0);
  assert.equal(summary.interpretation.pricingEligibleRows, 0);
  assert.equal(summary.datasets[PUBLIC_AGENT_PINS.computerAgentArena.id]
    .nativeOutcomeGroups.true.records, 1);

  const forged = structuredClone(rows[0]);
  forged.labels.economicLossObserved = true;
  assert.throws(() => summarizePublicAgentRecords([forged],
    { manifestHash: H("manifest") }), /PUBLIC_AGENT_RECORD_BOUNDARY_INVALID/);
});
