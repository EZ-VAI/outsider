import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { snapshotWorkspace, RunStore } from "../src/outsider-kernel-store.js";
import { createStage05ControlledWayBinding,
  finalizeStage05Evidence } from "../src/outsider-stage05-evidence.js";
import { freezeContract } from "../src/outsider-work-contract.js";
import { contributionDigest, initializeShareDirectory, sendContributionRevocation,
  sendRunContribution } from "../src/outsider-experience-contribution.js";

function keyPair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function sealedRun(root, name) {
  const cwd = path.join(root, name);
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), `export const value = ${JSON.stringify(name)};\n`);
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({ cwd, ask: `preserve ${name}`, acceptance: "node --test",
    semantic: { objective: `preserve ${name}`, successCriteria: ["tests pass"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] }, uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: contributionDigest(`audit:${name}`) },
    baselineEvidence: baseline });
  const binding = createStage05ControlledWayBinding({ contract,
    workerExecutable: "/test/worker", supervisorCommand: "test supervisor" });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "test supervisor",
    stateRoot: path.join(root, "runs"), binding });
  store.writeJson("baseline.json", baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash });
  store.append("contract_compiled", { objective: `preserve ${name}` });
  store.append("contract_audited", { passed: true });
  store.append("contract_frozen", { acceptance: "node --test" });
  store.append("worker_launch", { executable: "test" });
  store.append("boundary_reached", { boundary: "PreToolUse", tool: "Read" });
  store.append("boundary_reached", { boundary: "PostToolUse", tool: "Read", exit: 0 });
  store.append("acceptance_finished", { phase: "final", ran: true, passed: true, exit: 0,
    finalFingerprint: baseline.fingerprint });
  store.append("outcome_verdict", { phase: "stop", passed: true,
    finalFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
    interventionRequired: false, interventionComplete: false,
    acceptancePassed: true, finalFingerprint: baseline.fingerprint, errors: [] });
  store.saveState({ status: "complete", proof: { complete: true, deliveryComplete: true,
    interventionRequired: false, interventionComplete: false } });
  finalizeStage05Evidence({ directory: store.directory });
  return store.directory;
}

async function waitForWorker(child, endpoint, output) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode != null) throw new Error(`wrangler exited early: ${output()}`);
    try {
      const response = await fetch(`${endpoint}/healthz`);
      if (response.ok) return;
    } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`wrangler did not become ready: ${output()}`);
}

test("Cloudflare quarantine export is bearer-only, paginated and excludes revoked payloads",
  { timeout: 30_000 }, async (t) => {
    const wrangler = path.resolve("node_modules/.bin/wrangler");
    if (!existsSync(wrangler)) {
      t.skip("Wrangler is a source-tree development dependency, not a runtime dependency");
      return;
    }
    const root = mkdtempSync(path.join(tmpdir(), "outsider-gateway-"));
    const server = keyPair();
    const adminToken = "test-admin-token-0123456789abcdef-0123456789";
    const port = 20_000 + process.pid % 10_000;
    const endpoint = `http://127.0.0.1:${port}`;
    const args = ["dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--inspector-port", "0", "--log-level", "error", "--config",
      "deploy/cloudflare-experience-gateway/wrangler.jsonc", "--persist-to",
      path.join(root, "worker-state"), "--var", `SERVER_PRIVATE_KEY_PEM:${server.privateKey}`,
      "--var", `ADMIN_BEARER_TOKEN:${adminToken}`, "--var", "REGISTRY_ID:test-registry",
      "--var", "ACCEPTED_INSTRUMENT_HASHES:", "--var", `PUBLIC_AUDIENCE:${endpoint}`];
    const child = spawn(wrangler, args, {
      cwd: path.resolve("."), env: { ...process.env, WRANGLER_WRITE_LOGS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout.on("data", (chunk) => { logs += chunk; });
    child.stderr.on("data", (chunk) => { logs += chunk; });
    try {
      await waitForWorker(child, endpoint, () => logs);
      const exportUrl = `${endpoint}/internal/quarantine/export?limit=1`;
      for (const headers of [{}, { authorization: "Bearer wrong-token-value-that-is-long-enough" }]) {
        const denied = await fetch(exportUrl, { headers });
        assert.equal(denied.status, 401);
        assert.equal(denied.headers.get("cache-control"), "no-store");
        assert.equal((await denied.json()).error, "CONTRIBUTION_ADMIN_UNAUTHORIZED");
      }

      const runA = sealedRun(root, "run-a");
      const runB = sealedRun(root, "run-b");
      const shareA = initializeShareDirectory({ directory: path.join(root, "share-a"), endpoint,
        serverPublicKeyPem: server.publicKey, retentionDays: 30 });
      const shareB = initializeShareDirectory({ directory: path.join(root, "share-b"), endpoint,
        serverPublicKeyPem: server.publicKey, retentionDays: 30 });
      const checkedFetch = async (...args) => {
        const response = await fetch(...args);
        if (!response.ok) throw new Error(`gateway ${response.status}: ${await response.text()}`);
        return response;
      };
      const sentA = await sendRunContribution({ runDirectory: runA,
        shareDirectory: shareA.directory, fetchImpl: checkedFetch });
      const sentB = await sendRunContribution({ runDirectory: runB,
        shareDirectory: shareB.directory, fetchImpl: checkedFetch });
      const adminHeaders = { authorization: `Bearer ${adminToken}` };
      const firstResponse = await fetch(exportUrl, { headers: adminHeaders });
      assert.equal(firstResponse.status, 200);
      const first = await firstResponse.json();
      assert.equal(first.schema, "outsider/quarantine-export/v1");
      assert.equal(first.count, 1);
      assert.equal(first.useBoundary.automaticTraining, false);
      assert.equal(first.useBoundary.permitsCuratePromotion, false);
      assert.equal(first.items[0].receipt.disposition, "QUARANTINED");
      assert.deepEqual(Object.keys(first.items[0]).sort(),
        ["contributionRecord", "receipt", "registry"]);
      assert.doesNotMatch(JSON.stringify(first.items[0]), /attestation|value\.js|preserve run/);
      assert.equal(typeof first.nextCursor, "string");

      const secondResponse = await fetch(`${exportUrl}&cursor=${first.nextCursor}`,
        { headers: adminHeaders });
      assert.equal(secondResponse.status, 200);
      const second = await secondResponse.json();
      assert.equal(second.count, 1);
      assert.equal(second.nextCursor, null);
      assert.notEqual(second.items[0].registry.recordHash, first.items[0].registry.recordHash);
      assert.deepEqual(new Set([first.items[0].registry.recordHash,
        second.items[0].registry.recordHash]),
      new Set([sentA.contributionRecordHash, sentB.contributionRecordHash]));

      assert.equal((await fetch(`${endpoint}/internal/quarantine/export?limit=101`,
        { headers: adminHeaders })).status, 400);
      assert.equal((await fetch(`${endpoint}/internal/quarantine/export?cursor=not-a-cursor`,
        { headers: adminHeaders })).status, 400);

      const revoked = await sendContributionRevocation({ shareDirectory: shareA.directory,
        reason: "USER_REQUEST", fetchImpl: checkedFetch });
      assert.equal(revoked.acknowledgment.futureUseBlocked, true);
      const after = await (await fetch(`${endpoint}/internal/quarantine/export?limit=100`,
        { headers: adminHeaders })).json();
      assert.equal(after.count, 1);
      assert.equal(after.items[0].registry.recordHash, sentB.contributionRecordHash);
      assert.notEqual(after.items[0].registry.contributorKeyId,
        revoked.revocation.contributorKeyId);
    } finally {
      if (child.exitCode == null) child.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  });
