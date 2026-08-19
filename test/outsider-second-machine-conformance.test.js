import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  machineIdentity,
  signSecondMachineConformance,
  verifySecondMachineConformance,
} from "../src/outsider-second-machine-conformance.js";

const keys = generateKeyPairSync("ed25519");
const privateKeyPem = keys.privateKey.export({ type: "pkcs8", format: "pem" });
const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" });
const artifactHash = `sha256:${"a".repeat(64)}`;
const evaluatorHashes = { script: `sha256:${"b".repeat(64)}`,
  library: `sha256:${"c".repeat(64)}` };
const checks = Object.fromEntries(["cleanInstall", "version", "help", "doctor", "packageTests",
  "corpus", "projectScopedInstall"].map((name) => [name, { ok: true }]));
checks.version.observedVersion = "1.2.3";

function record() {
  const identity = machineIdentity({ platform: "linux", arch: "arm64",
    release: "host-two", hostname: "second-machine" });
  return signSecondMachineConformance({
    ...identity,
    artifact: { sha256: artifactHash, packageVersion: "1.2.3" },
    evaluatorHashes,
    checks,
  }, privateKeyPem);
}

test("a signed exact-artifact conformance from a distinct host can satisfy the second-machine gate", () => {
  const result = verifySecondMachineConformance(record(), {
    publicKeyPem, expectedArtifactHash: artifactHash, expectedVersion: "1.2.3",
    expectedEvaluatorHashes: evaluatorHashes,
    primaryMachineIdentityHash: machineIdentity({ platform: "darwin", arch: "arm64",
      release: "host-one", hostname: "primary" }).machineIdentityHash,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "PASS");
});

test("same-host, tampered, wrong-artifact and incomplete second-machine claims fail closed", () => {
  const valid = record();
  const secondIdentity = valid.body.machineIdentityHash;
  assert.equal(verifySecondMachineConformance(valid, { publicKeyPem,
    expectedArtifactHash: artifactHash, expectedVersion: "1.2.3",
    expectedEvaluatorHashes: evaluatorHashes,
    primaryMachineIdentityHash: secondIdentity }).ok, false);

  const tampered = structuredClone(valid);
  tampered.body.checks.corpus.ok = false;
  assert.equal(verifySecondMachineConformance(tampered, { publicKeyPem,
    expectedArtifactHash: artifactHash, expectedVersion: "1.2.3",
    expectedEvaluatorHashes: evaluatorHashes,
    primaryMachineIdentityHash: "sha256:primary" }).ok, false);

  assert.equal(verifySecondMachineConformance(valid, { publicKeyPem,
    expectedArtifactHash: `sha256:${"c".repeat(64)}`, expectedVersion: "1.2.3",
    expectedEvaluatorHashes: evaluatorHashes,
    primaryMachineIdentityHash: "sha256:primary" }).ok, false);

  const incompleteBody = structuredClone(valid.body);
  incompleteBody.checks.doctor.ok = false;
  const incomplete = signSecondMachineConformance(incompleteBody, privateKeyPem);
  const incompleteResult = verifySecondMachineConformance(incomplete, { publicKeyPem,
    expectedArtifactHash: artifactHash, expectedVersion: "1.2.3",
    expectedEvaluatorHashes: evaluatorHashes,
    primaryMachineIdentityHash: "sha256:primary" });
  assert.equal(incompleteResult.ok, false);
  assert.ok(incompleteResult.errors.includes("second-machine check did not pass: doctor"));
});
