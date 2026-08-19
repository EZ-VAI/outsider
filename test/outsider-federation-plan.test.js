import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sha256 } from "../src/canonical.js";
import { createFederatedHandoff, createFederatedWayAttestation,
  createFederationTrustStore, federationKeyId,
  verifyFederatedWayCheckpoint } from "../src/outsider-federation.js";
import { observerFederationObservation,
  wayDescriptor } from "../src/outsider-federation-adapters.js";
import { DurableGlobalOutsiderMonitor } from "../src/outsider-federation-monitor.js";
import { createFederatedTaskPlan, createTaskBoundFederatedCheckpoint,
  verifyFederatedTaskHandoff, verifyFederatedTaskPlan } from
  "../src/outsider-federation-plan.js";

const h = (value) => sha256(String(value));
const keypair = () => generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function fixture() {
  const names = ["codex", "deepseek", "claude", "trae"];
  const profiles = { codex: ["codex", "OBSERVER_ONLY"],
    deepseek: ["deepseek-harness", "DELIVERY_SUPERVISED"],
    claude: ["claude-code", "CONTROLLED"], trae: ["trae", "OBSERVER_ONLY"] };
  const keys = Object.fromEntries(names.map((name) => [name, keypair()]));
  const ids = Object.fromEntries(names.map((name) => [name,
    federationKeyId(keys[name].publicKey)]));
  const instruments = Object.fromEntries(names.map((name) => [name, {
    instrumentHash: h(`instrument:${name}`), instrumentVersionHash: h(`version:${name}`),
    adapterHash: h(`adapter:${name}`), operatorKeyId: ids[name],
    surface: profiles[name][0], controlMode: profiles[name][1] }]));
  const trustStore = createFederationTrustStore({ policyHash: h("policy"),
    operators: names.map((name) => ({ publicKeyPem: keys[name].publicKey,
      tenantHash: h(`tenant:${name}`), governanceRootHash: h(`governance:${name}`),
      operatorKind: "INDEPENDENT_TEST_OPERATOR" })), instruments: Object.values(instruments) });
  const caseRef = { claimHash: h("claim"), claimFamilyHash: h("claim-family"),
    worldHash: h("world"), worldFamilyHash: h("world-family"), policyHash: h("policy") };
  const ways = Object.fromEntries(names.map((name) => [name, wayDescriptor({
    surface: profiles[name][0], adapterHash: instruments[name].adapterHash,
    runtimeClosureHash: h(`runtime:${name}`), providerRootHash: h(`provider:${name}`),
    topologyHash: h(`topology:${name}`) })]));
  const taskIds = Object.fromEntries(names.map((name) => [name, h(`task:${name}`)]));
  const tasks = names.map((name, ordinal) => ({ ordinal, taskId: taskIds[name],
    owner: { operatorKeyId: ids[name], instrumentHash: instruments[name].instrumentHash,
      wayHash: ways[name].wayHash },
    dependencyTaskIds: ordinal === 0 ? [] : [taskIds[names[ordinal - 1]]],
    scopeHash: h(`scope:${name}`), expectedOutcomeHash: h(`outcome:${name}`),
    expectedInputArtifactHashes: ordinal === 0 ? [] : [h(`artifact:${names[ordinal - 1]}`)],
    requiredClaim: name === "claude" ? "OUTCOME"
      : name === "deepseek" ? "DELIVERY" : "OBSERVATION" }));
  const plan = createFederatedTaskPlan({ caseRef, planNonceHash: h("plan-nonce"),
    createdAt: "2026-08-15T06:00:00Z", tasks,
    privateKeyPem: keys.codex.privateKey, trustStore });
  const operator = (name) => ({ tenantHash: h(`tenant:${name}`),
    governanceRootHash: h(`governance:${name}`) });
  const checkpoint = (name, seq, previousCheckpointHash, status, observedAt,
    dependencyCheckpointHashes = []) => createTaskBoundFederatedCheckpoint({ taskPlan: plan,
    taskId: taskIds[name], dependencyCheckpointHashes, trustStore, caseRef,
    operator: operator(name), instrument: instruments[name], wayHash: ways[name].wayHash,
    runRefHash: h(`run:${name}`), checkpointSeq: seq, previousCheckpointHash,
    status, observedAt, progress: { toolBoundaries: seq, agentsObserved: 1,
      openInterventions: 0 }, localEvidenceHash: h(`evidence:${name}:${seq}`),
    outputArtifactHash: status === "DELIVERY_READY" ? h(`artifact:${name}`) : null,
    privateKeyPem: keys[name].privateKey });
  return { names, profiles, keys, ids, instruments, trustStore, caseRef,
    ways, taskIds, tasks, plan, operator, checkpoint };
}

test("signed global task plan enforces provider ownership, DAG order and surface ceilings", () => {
  const f = fixture(), checked = verifyFederatedTaskPlan(f.plan, f.trustStore);
  assert.equal(checked.ok, true);
  assert.equal(checked.payload.tasks.length, 4);
  assert.equal(checked.payload.authority.executionAuthority, false);
  assert.equal(checked.payload.claimBoundary.taskOwnerAcceptsOnlyBySignedCheckpoint, true);
  assert.throws(() => createFederatedTaskPlan({ caseRef: f.caseRef,
    planNonceHash: h("bad-plan"), createdAt: "2026-08-15T06:00:00Z",
    tasks: [{ ...f.tasks[0], requiredClaim: "OUTCOME" }],
    privateKeyPem: f.keys.codex.privateKey, trustStore: f.trustStore }),
  /TASK_PLAN_SURFACE_OVERCLAIM/);
  assert.throws(() => createFederatedTaskPlan({ caseRef: f.caseRef,
    planNonceHash: h("cycle-plan"), createdAt: "2026-08-15T06:00:00Z",
    tasks: [{ ...f.tasks[0], dependencyTaskIds: [f.taskIds.codex] }],
    privateKeyPem: f.keys.codex.privateKey, trustStore: f.trustStore }),
  /TASK_PLAN_DEPENDENCY_INVALID/);
});

test("plan-aware monitor blocks premature cross-company work and task-run forks", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "global-plan-"));
  const monitor = new DurableGlobalOutsiderMonitor({ directory,
    trustStore: f.trustStore, taskPlan: f.plan, maxSilenceMs: 60_000 });
  const codex0 = f.checkpoint("codex", 0, null, "STARTED",
    "2026-08-15T06:00:01Z");
  assert.equal(verifyFederatedWayCheckpoint(codex0, f.trustStore).ok, true);
  monitor.append(codex0);
  const premature = f.checkpoint("deepseek", 0, null, "STARTED",
    "2026-08-15T06:00:02Z", [codex0.recordHash]);
  assert.throws(() => monitor.append(premature), /TASK_DEPENDENCIES_UNSATISFIED/);
  const codex1 = f.checkpoint("codex", 1, codex0.recordHash, "DELIVERY_READY",
    "2026-08-15T06:00:03Z");
  monitor.append(codex1);
  const deepseek0 = f.checkpoint("deepseek", 0, null, "STARTED",
    "2026-08-15T06:00:04Z", [codex1.recordHash]);
  monitor.append(deepseek0);
  const snapshot = monitor.snapshot({ now: "2026-08-15T06:00:05Z" });
  assert.equal(snapshot.taskPlanHash, f.plan.recordHash);
  assert.equal(snapshot.summary.plannedTasks, 4);
  assert.equal(snapshot.tasks.find((task) => task.taskId === f.taskIds.deepseek).status,
    "STARTED");
  assert.equal(snapshot.tasks.find((task) => task.taskId === f.taskIds.claude).coordination,
    "WAITING_FOR_DEPENDENCIES");
  assert.equal(monitor.verify().ok, true);
  const fork = createTaskBoundFederatedCheckpoint({ taskPlan: f.plan,
    taskId: f.taskIds.deepseek, dependencyCheckpointHashes: [codex1.recordHash],
    trustStore: f.trustStore, caseRef: f.caseRef, operator: f.operator("deepseek"),
    instrument: f.instruments.deepseek, wayHash: f.ways.deepseek.wayHash,
    runRefHash: h("other-run"), checkpointSeq: 0, previousCheckpointHash: null,
    status: "STARTED", observedAt: "2026-08-15T06:00:05Z",
    privateKeyPem: f.keys.deepseek.privateKey });
  assert.throws(() => monitor.append(fork), /TASK_RUN_FORK/);
});

test("bilateral handoff is cryptographically bound to the planned task edge", () => {
  const f = fixture();
  const observation = observerFederationObservation({ evidenceRecordHash: h("codex-evidence"),
    runRefHash: h("codex-run"), sourceSchema: "codex/observation/v1",
    observedAt: "2026-08-15T06:01:00Z", surface: "codex" });
  const source = createFederatedWayAttestation({ caseRef: f.caseRef,
    operator: f.operator("codex"), instrument: f.instruments.codex,
    way: f.ways.codex, observation, outputArtifactHash: h("artifact:codex"),
    privateKeyPem: f.keys.codex.privateKey });
  const handoff = createFederatedHandoff({ sourceAttestation: source,
    destination: { operatorKeyId: f.ids.deepseek, wayHash: f.ways.deepseek.wayHash,
      instrumentHash: f.instruments.deepseek.instrumentHash },
    artifactHash: h("artifact:codex"), scopeHash: h("scope:deepseek"),
    expectedOutcomeHash: h("outcome:deepseek"), nonceHash: h("handoff-nonce"),
    offeredAt: "2026-08-15T06:02:00Z", receivedAt: "2026-08-15T06:03:00Z",
    taskBinding: { planHash: f.plan.recordHash, fromTaskId: f.taskIds.codex,
      toTaskId: f.taskIds.deepseek }, senderPrivateKeyPem: f.keys.codex.privateKey,
    receiverPrivateKeyPem: f.keys.deepseek.privateKey, trustStore: f.trustStore });
  assert.equal(verifyFederatedTaskHandoff({ taskPlan: f.plan,
    fromTaskId: f.taskIds.codex, toTaskId: f.taskIds.deepseek, handoff,
    trustStore: f.trustStore, sourceAttestation: source }).ok, true);
  const wrong = verifyFederatedTaskHandoff({ taskPlan: f.plan,
    fromTaskId: f.taskIds.codex, toTaskId: f.taskIds.claude, handoff,
    trustStore: f.trustStore, sourceAttestation: source });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.failures.includes("TASK_HANDOFF_EDGE_INVALID"));
});

test("CLI signs, verifies and monitors a task-bound provider checkpoint", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "global-plan-cli-"));
  const trustFile = path.join(directory, "trust.json");
  const keyFile = path.join(directory, "codex-key.pem");
  const planSpecFile = path.join(directory, "plan-spec.json");
  const planFile = path.join(directory, "plan.json");
  const checkpointSpecFile = path.join(directory, "checkpoint-spec.json");
  const checkpointFile = path.join(directory, "checkpoint.json");
  writeFileSync(trustFile, JSON.stringify(f.trustStore));
  writeFileSync(keyFile, f.keys.codex.privateKey);
  writeFileSync(planSpecFile, JSON.stringify({ caseRef: f.caseRef,
    planNonceHash: h("cli-plan"), createdAt: "2026-08-15T06:00:00Z", tasks: f.tasks }));
  const signed = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-plan",
    planSpecFile, "--trust-store", trustFile, "--signing-key", keyFile,
    "--out", planFile], { encoding: "utf8" });
  assert.equal(signed.status, 0, signed.stderr);
  assert.equal(readFileSync(planFile, "utf8").includes("PRIVATE KEY"), false);
  const verified = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-plan-verify", planFile, "--trust-store", trustFile],
  { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  writeFileSync(checkpointSpecFile, JSON.stringify({ taskId: f.taskIds.codex,
    dependencyCheckpointHashes: [], caseRef: f.caseRef, operator: f.operator("codex"),
    instrument: f.instruments.codex, wayHash: f.ways.codex.wayHash,
    runRefHash: h("cli-run"), checkpointSeq: 0, previousCheckpointHash: null,
    status: "STARTED", observedAt: "2026-08-15T06:00:01Z" }));
  const checkpoint = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-checkpoint", checkpointSpecFile, "--task-plan", planFile,
    "--trust-store", trustFile, "--signing-key", keyFile, "--out", checkpointFile],
  { encoding: "utf8" });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  const stateRoot = path.join(directory, "monitor");
  const ingested = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-monitor-ingest", checkpointFile, "--task-plan", planFile,
    "--trust-store", trustFile, "--state-root", stateRoot,
    "--now", "2026-08-15T06:00:02Z"], { encoding: "utf8" });
  assert.equal(ingested.status, 0, ingested.stderr);
  const report = JSON.parse(ingested.stdout);
  assert.equal(report.snapshot.taskPlanHash, plan.recordHash);
  assert.equal(report.snapshot.summary.plannedTasks, 4);
  assert.equal(report.supervision.learning.eligibleForRoutingResearch, true);
  assert.equal(report.supervision.learning.eligibleForGlobalCausalEffectLearning, false);
  assert.equal(report.supervision.learning.eligibleForPricing, false);
  assert.equal(report.supervision.authority.executionAuthority, false);
});

test("CLI refuses either party signing a task handoff without the frozen plan", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "global-handoff-cli-"));
  const trustFile = path.join(directory, "trust.json"), planFile = path.join(directory, "plan.json");
  const senderKey = path.join(directory, "sender.pem"), receiverKey = path.join(directory, "receiver.pem");
  const sourceFile = path.join(directory, "source.json"), specFile = path.join(directory, "offer-spec.json");
  const offerFile = path.join(directory, "offer.json"), handoffFile = path.join(directory, "handoff.json");
  const source = createFederatedWayAttestation({ caseRef: f.caseRef,
    operator: f.operator("codex"), instrument: f.instruments.codex, way: f.ways.codex,
    observation: observerFederationObservation({ evidenceRecordHash: h("cli-source"),
      runRefHash: h("cli-run"), sourceSchema: "codex/observation/v1",
      observedAt: "2026-08-15T06:01:00Z", surface: "codex" }),
    outputArtifactHash: h("artifact:codex"), privateKeyPem: f.keys.codex.privateKey });
  writeFileSync(trustFile, JSON.stringify(f.trustStore));
  writeFileSync(planFile, JSON.stringify(f.plan));
  writeFileSync(senderKey, f.keys.codex.privateKey);
  writeFileSync(receiverKey, f.keys.deepseek.privateKey);
  writeFileSync(sourceFile, JSON.stringify(source));
  writeFileSync(specFile, JSON.stringify({ destination: { operatorKeyId: f.ids.deepseek,
    wayHash: f.ways.deepseek.wayHash, instrumentHash: f.instruments.deepseek.instrumentHash },
  artifactHash: h("artifact:codex"), scopeHash: h("scope:deepseek"),
  expectedOutcomeHash: h("outcome:deepseek"), nonceHash: h("cli-handoff"),
  offeredAt: "2026-08-15T06:02:00Z", taskBinding: { planHash: f.plan.recordHash,
    fromTaskId: f.taskIds.codex, toTaskId: f.taskIds.deepseek } }));
  const withoutPlan = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-offer",
    sourceFile, specFile, "--trust-store", trustFile, "--signing-key", senderKey,
    "--out", offerFile], { encoding: "utf8" });
  assert.equal(withoutPlan.status, 1);
  assert.match(withoutPlan.stderr, /FEDERATION_TASK_PLAN_REQUIRED/);
  const offered = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-offer",
    sourceFile, specFile, "--task-plan", planFile, "--trust-store", trustFile,
    "--signing-key", senderKey, "--out", offerFile], { encoding: "utf8" });
  assert.equal(offered.status, 0, offered.stderr);
  const acceptWithoutPlan = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-accept", offerFile, sourceFile, "--trust-store", trustFile,
    "--signing-key", receiverKey, "--received-at", "2026-08-15T06:03:00Z",
    "--out", handoffFile], { encoding: "utf8" });
  assert.equal(acceptWithoutPlan.status, 1);
  assert.match(acceptWithoutPlan.stderr, /FEDERATION_TASK_PLAN_REQUIRED/);
  const accepted = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-accept", offerFile, sourceFile, "--task-plan", planFile,
    "--trust-store", trustFile, "--signing-key", receiverKey,
    "--received-at", "2026-08-15T06:03:00Z", "--out", handoffFile],
  { encoding: "utf8" });
  assert.equal(accepted.status, 0, accepted.stderr);
  const verified = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-task-handoff-verify", handoffFile, sourceFile,
    "--task-plan", planFile, "--trust-store", trustFile], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).ok, true);
});
