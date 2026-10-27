import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = path.resolve("scripts/stage1-curate-corpus-registry.mjs");
const ROBOT = path.resolve("artifacts/curate-public-robotics-20260820/source");
const WAVE2 = path.resolve("artifacts/public-agent-wave2-20260821/source");

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

test("corpus registry CLI initializes, full-source ingests robotics, and verifies", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-corpus-cli-"));
  const registry = path.join(root, "registry");
  const keyFile = path.join(root, "private.pem");
  const pair = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(keyFile, pair.privateKey, { mode: 0o600 });
  try {
    let result = run(["init", "--dir", registry, "--signing-key", keyFile,
      "--registry-id", "cli-test", "--at", "2036-01-01T00:00:00.000Z"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
    result = run(["ingest-public-robotics", "--dir", registry, "--signing-key", keyFile,
      "--source-root", ROBOT, "--at", "2036-01-01T00:00:01.000Z"]);
    assert.equal(result.status, 0, result.stderr);
    const ingested = JSON.parse(result.stdout);
    assert.equal(ingested.candidates, 160);
    assert.equal(ingested.boundary.pricingEligible, false);
    result = run(["ingest-public-agent-wave2", "--dir", registry,
      "--signing-key", keyFile, "--source-root", WAVE2,
      "--at", "2036-01-01T00:00:02.000Z"]);
    assert.equal(result.status, 0, result.stderr);
    const wave2 = JSON.parse(result.stdout);
    assert.equal(wave2.candidates, 1_474);
    assert.equal(wave2.boundary.causalExperienceUnits, 0);
    result = run(["verify", "--dir", registry, "--now", "2036-01-01T00:00:03.000Z"]);
    assert.equal(result.status, 0, result.stderr);
    const verified = JSON.parse(result.stdout);
    assert.equal(verified.ok, true);
    assert.equal(verified.counts.activeArtifactSets, 2);
    assert.equal(verified.counts.candidates, 1_634);
    assert.equal(verified.counts.d2Groups, 2);
    assert.equal(verified.counts.operatorSignedFullSourceClaims, 2);
    assert.equal(verified.sourceArtifactsReverified, false);
    assert.equal(verified.fullSourceArtifactSetsReverified, 0);
    result = run(["verify-sources", "--dir", registry,
      "--agent-artifact-dir", path.resolve("artifacts/public-agent-corpus-20260820"),
      "--wave2-source-root", WAVE2, "--robotics-source-root", ROBOT,
      "--droid-artifact-dir", path.resolve(
        "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay"),
      "--droid-source-root", path.resolve("artifacts/curate-droid100-20260819/source"),
      "--now", "2036-01-01T00:00:03.000Z"]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /KNOWN_FULL_SOURCE_KIND_MISSING:PUBLIC_AGENT_CORPUS/);
    assert.equal(JSON.parse(result.stdout).sourceArtifactsReverified, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
