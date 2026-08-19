import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sha256 } from "../src/canonical.js";
import { createFederatedWayCheckpoint, createFederationTrustStore,
  federationKeyId, verifyFederatedWayCheckpoint } from "../src/outsider-federation.js";
import { DurableGlobalOutsiderMonitor } from "../src/outsider-federation-monitor.js";

const h = (value) => sha256(String(value));

function fixture() {
  const names = ["codex", "deepseek", "claude", "trae"];
  const keys = Object.fromEntries(names.map((name) => [name,
    generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" } })]));
  const profiles = { codex: ["codex", "OBSERVER_ONLY"],
    deepseek: ["deepseek-harness", "DELIVERY_SUPERVISED"],
    claude: ["claude-code", "CONTROLLED"], trae: ["trae", "OBSERVER_ONLY"] };
  const instruments = Object.fromEntries(names.map((name) => [name, {
    instrumentHash: h(`instrument:${name}`), instrumentVersionHash: h(`version:${name}`),
    adapterHash: h(`adapter:${name}`), operatorKeyId: federationKeyId(keys[name].publicKey),
    surface: profiles[name][0], controlMode: profiles[name][1] }]));
  const trustStore = createFederationTrustStore({ policyHash: h("policy"),
    operators: names.map((name) => ({ publicKeyPem: keys[name].publicKey,
      tenantHash: h(`tenant:${name}`), governanceRootHash: h(`governance:${name}`),
      operatorKind: "TEST_OPERATOR" })), instruments: Object.values(instruments) });
  const caseRef = { claimHash: h("claim"), claimFamilyHash: h("claim-family"),
    worldHash: h("world"), worldFamilyHash: h("world-family"), policyHash: h("policy") };
  const checkpoint = (name, seq, previousCheckpointHash, status, observedAt,
    progress = {}) => createFederatedWayCheckpoint({ caseRef,
    operator: { tenantHash: h(`tenant:${name}`), governanceRootHash: h(`governance:${name}`) },
    instrument: instruments[name], wayHash: h(`way:${name}`), runRefHash: h(`run:${name}`),
    checkpointSeq: seq, previousCheckpointHash, status, observedAt,
    progress, outputArtifactHash: status === "DELIVERY_READY" ? h(`artifact:${name}`) : null,
    privateKeyPem: keys[name].privateKey });
  return { names, keys, instruments, trustStore, caseRef, checkpoint };
}

test("global monitor tracks four providers without taking local execution authority", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "outsider-monitor-"));
  const monitor = new DurableGlobalOutsiderMonitor({ directory,
    trustStore: f.trustStore, maxSilenceMs: 60_000 });
  const c0 = f.checkpoint("codex", 0, null, "STARTED", "2026-08-15T00:00:00Z",
    { toolBoundaries: 0, agentsObserved: 1 });
  const c1 = f.checkpoint("codex", 1, c0.recordHash, "DELIVERY_READY",
    "2026-08-15T00:00:30Z", { toolBoundaries: 3, agentsObserved: 1 });
  const d0 = f.checkpoint("deepseek", 0, null, "BLOCKED", "2026-08-15T00:00:20Z",
    { toolBoundaries: 2, agentsObserved: 2, openInterventions: 1 });
  const a0 = f.checkpoint("claude", 0, null, "ACTIVE", "2026-08-15T00:00:00Z",
    { toolBoundaries: 1, agentsObserved: 1 });
  const t0 = f.checkpoint("trae", 0, null, "TERMINATED", "2026-08-15T00:00:40Z");
  for (const checkpoint of [c0, c1, d0, a0, t0]) {
    assert.equal(verifyFederatedWayCheckpoint(checkpoint, f.trustStore).ok, true);
    assert.equal(monitor.append(checkpoint).appended, true);
  }
  const snapshot = monitor.snapshot({ now: "2026-08-15T00:02:00Z" });
  assert.deepEqual(snapshot.summary,
    { ways: 4, blocked: 1, stale: 1, deliveryReady: 1, terminated: 1 });
  assert.equal(snapshot.claimBoundary.globalExecutionOrCorrectionAuthority, false);
  assert.equal(snapshot.claimBoundary.providerLocalControllersRetainAuthority, true);
  assert.equal(snapshot.authority.movesFunds, false);
  assert.equal(monitor.verify().ok, true);
  const reopened = new DurableGlobalOutsiderMonitor({ directory,
    trustStore: f.trustStore, maxSilenceMs: 60_000 });
  assert.equal(reopened.snapshot({ now: "2026-08-15T00:02:00Z" }).recordHash,
    snapshot.recordHash);
});

test("monitor refuses forks, rollback, post-terminal writes and checkpoint tampering", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "outsider-monitor-"));
  const monitor = new DurableGlobalOutsiderMonitor({ directory,
    trustStore: f.trustStore, maxSilenceMs: 60_000 });
  const first = f.checkpoint("codex", 0, null, "STARTED", "2026-08-15T00:00:00Z");
  monitor.append(first);
  assert.throws(() => monitor.append(f.checkpoint("codex", 2, first.recordHash,
    "ACTIVE", "2026-08-15T00:00:01Z")), /CHAIN_TRANSITION_INVALID/);
  const terminated = f.checkpoint("codex", 1, first.recordHash, "TERMINATED",
    "2026-08-15T00:00:02Z");
  monitor.append(terminated);
  assert.throws(() => monitor.append(f.checkpoint("codex", 2, terminated.recordHash,
    "ACTIVE", "2026-08-15T00:00:03Z")), /CHAIN_TRANSITION_INVALID/);
  const tampered = structuredClone(first);
  tampered.signedCheckpoint.payload.status = "DELIVERY_READY";
  assert.equal(verifyFederatedWayCheckpoint(tampered, f.trustStore).ok, false);
});

test("CLI signs and ingests provider checkpoints without receiving provider credentials", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "outsider-monitor-cli-"));
  const specFile = path.join(directory, "spec.json"), keyFile = path.join(directory, "key.pem");
  const trustFile = path.join(directory, "trust.json"), checkpointFile = path.join(directory,
    "checkpoint.json"), stateRoot = path.join(directory, "state");
  writeFileSync(specFile, JSON.stringify({ caseRef: f.caseRef,
    operator: { tenantHash: h("tenant:codex"), governanceRootHash: h("governance:codex") },
    instrument: f.instruments.codex, wayHash: h("way:codex"), runRefHash: h("run:codex"),
    checkpointSeq: 0, previousCheckpointHash: null, status: "ACTIVE",
    observedAt: "2026-08-15T00:00:00Z", progress: { toolBoundaries: 1,
      agentsObserved: 1, openInterventions: 0 } }));
  writeFileSync(keyFile, f.keys.codex.privateKey);
  writeFileSync(trustFile, JSON.stringify(f.trustStore));
  const signed = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-checkpoint",
    specFile, "--signing-key", keyFile, "--out", checkpointFile], { encoding: "utf8" });
  assert.equal(signed.status, 0, signed.stderr);
  assert.equal(readFileSync(checkpointFile, "utf8").includes("PRIVATE KEY"), false);
  const ingested = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-monitor-ingest", checkpointFile, "--trust-store", trustFile,
    "--state-root", stateRoot, "--max-silence-ms", "60000",
    "--now", "2026-08-15T00:00:30Z"], { encoding: "utf8" });
  assert.equal(ingested.status, 0, ingested.stderr);
  assert.equal(JSON.parse(ingested.stdout).snapshot.summary.ways, 1);
  const status = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-monitor-status", "--trust-store", trustFile,
    "--state-root", stateRoot, "--max-silence-ms", "60000",
    "--now", "2026-08-15T00:02:00Z"], { encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).summary.stale, 1);
});
