import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  certifyAgentTeamEvidence,
  certifyCoworkEvidence,
  certifyR1RepeatabilityEvidence,
  certifyR4CrashRecoveryEvidence,
} from "../src/outsider-field-evidence.js";
import { freezeReleaseArtifact } from "../scripts/stage05-release-artifact-binding.mjs";

function temporaryEvidence() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-field-evidence-"));
  return { root, write(name, value) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  }, close() { rmSync(root, { recursive: true, force: true }); } };
}

test("R2/R3 evidence without an exact frozen release artifact can never become PASS", () => {
  const fixture = temporaryEvidence();
  try {
    fixture.write("result.json", {
      schema: "outsider/stage05-agent-team-probe-result/v1",
      ok: true, protocolOk: true, deliveryProofOk: true,
      evidenceBoundBeforeFinish: true, sourceHashesStable: true,
      sourceHashesStableAfterFinish: true, hostEnvelopeSourceStable: true,
      recorderStable: true, workerExit: { code: 0, signal: null },
      conformance: { ok: true }, crossLedger: { ok: true },
      proof: { complete: true }, evidence: { ok: true }, runId: "forged",
    });
    fixture.write("preregistration.json", {
      schema: "outsider/stage05-agent-team-probe/v1",
      r3IntegrationCorrection: false,
    });
    const result = certifyAgentTeamEvidence(fixture.root, {
      expectedArtifactHash: `sha256:${"a".repeat(64)}`,
      expectedVersion: "9.9.9",
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("R2 is not bound to the exact release artifact"));
  } finally { fixture.close(); }
});

test("Cowork field evidence cannot be promoted from a missing or unsealed local run", () => {
  const fixture = temporaryEvidence();
  try {
    const result = certifyCoworkEvidence({ stateRoot: fixture.root,
      workspace: path.join(fixture.root, "workspace") }, {
      expectedVersion: "9.9.9", expectedRuntimeHashes: {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "FAIL");
    assert.ok(result.errors.some((error) => /Cowork/.test(error)));
  } finally { fixture.close(); }
});

test("a handwritten R1 tally cannot replace five sealed stable runs", () => {
  const fixture = temporaryEvidence();
  try {
    fixture.write("experiment.json", {
      schema: "outsider/stage05-r1-repeatability-experiment/v1",
      design: { schedule: [] }, preregistration: { artifact: { path: "artifact.tgz" } },
    });
    fixture.write("tally.json", {
      schema: "outsider/stage05-r1-repeatability-tally/v1", ok: true,
      summary: { scheduled: 5, terminalProofComplete: 5, independentlyExact: 5,
        falseGreen: 0, unfinalized: 0, conservativeStops: 0,
        infrastructureFailures: 0, supervisedExperiencePresent: 5,
        perRunAttestationPresent: 5 }, rows: [],
    });
    const result = certifyR1RepeatabilityEvidence(fixture.root, {
      expectedArtifactHash: `sha256:${"b".repeat(64)}`, expectedVersion: "9.9.9",
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /exactly five/.test(error)));
  } finally { fixture.close(); }
});

test("R4 requires the exact artifact and all five sealed recovery lanes", () => {
  const fixture = temporaryEvidence();
  try {
    fixture.write("result.json", {
      schema: "outsider/stage05-r4-batch-result/v1", ok: true,
      artifactHash: `sha256:${"c".repeat(64)}`, recoveryWindowMs: 120000,
      sourceHashes: {}, results: [],
    });
    fixture.write("preregistration.json", {
      schema: "outsider/stage05-r4-preregistration/v1",
      artifactHash: `sha256:${"c".repeat(64)}`, recoveryWindowMs: 120000,
      sourceHashes: {},
    });
    const result = certifyR4CrashRecoveryEvidence(fixture.root, {
      expectedArtifactHash: `sha256:${"d".repeat(64)}`, expectedVersion: "9.9.9",
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("R4 artifact differs from the release artifact"));
    assert.ok(result.errors.includes("R4 does not contain exactly the five required lanes"));
  } finally { fixture.close(); }
});

test("formal gates freeze a complete package and reject checkout drift before worker launch", () => {
  const fixture = temporaryEvidence();
  try {
    const runtime = path.join(fixture.root, "runtime");
    const packageRoot = path.join(fixture.root, "packing", "package");
    mkdirSync(runtime, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    const pkg = { name: "outsider-test", version: "1.0.0" };
    writeFileSync(path.join(runtime, "package.json"), JSON.stringify(pkg));
    writeFileSync(path.join(runtime, "value.js"), "export const value = 1;\n");
    writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify(pkg));
    writeFileSync(path.join(packageRoot, "value.js"), "export const value = 1;\n");
    const artifact = path.join(fixture.root, "release.tgz");
    const packed = spawnSync("tar", ["-czf", artifact, "-C",
      path.dirname(packageRoot), "package"], { encoding: "utf8" });
    assert.equal(packed.status, 0, packed.stderr);
    const frozen = freezeReleaseArtifact({ artifact, runtimeRoot: runtime,
      outputRoot: path.join(fixture.root, "evidence"), gate: "TEST" });
    assert.equal(frozen.packageVersion, "1.0.0");
    assert.equal(frozen.fileCount, 2);
    writeFileSync(path.join(runtime, "value.js"), "export const value = 2;\n");
    assert.throws(() => freezeReleaseArtifact({ artifact, runtimeRoot: runtime,
      outputRoot: path.join(fixture.root, "drift"), gate: "TEST" }),
    /TEST_RUNTIME_ARTIFACT_MISMATCH:value\.js/);
  } finally { fixture.close(); }
});
