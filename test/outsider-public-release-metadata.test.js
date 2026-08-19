import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  PUBLIC_DETERMINISTIC_CHECKS,
  PUBLIC_FIELD_GATES,
  PUBLIC_CLAIM_BOUNDARIES,
  sha256Bytes,
  writePublicReleaseMetadata,
} from "../src/outsider-public-release-metadata.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function exactCertificate({ artifactBytes, version = pkg.version,
  artifactHash = sha256Bytes(artifactBytes), claimBoundary } = {}) {
  const checks = Object.fromEntries(PUBLIC_DETERMINISTIC_CHECKS.map((name) => [name, {
    ok: true,
    stdoutTail: `private stdout for ${name} /Users/alice/work`,
    stderrTail: "secret stderr",
  }]));
  const fieldEvidence = Object.fromEntries(PUBLIC_FIELD_GATES.map((name, index) => [name, {
    status: index < 8 ? "PASS" : "NOT_RUN",
    rawPath: `/Users/alice/private/${name}`,
    account: "alice@example.com",
  }]));
  return {
    schema: "outsider/stage05-release-certificate/v1",
    product: { name: pkg.name, version },
    artifact: { file: `${pkg.name}-${version}.tgz`, sha256: artifactHash },
    environment: {
      hostname: "alice-mbp",
      home: "/Users/alice",
      accountIdentity: "alice@example.com",
    },
    checks,
    fieldEvidence,
    releaseDecision: "PRIVATE_BETA_READY",
    stablePublicReleaseReady: false,
    claimBoundary: claimBoundary ?? [...PUBLIC_CLAIM_BOUNDARIES],
  };
}

function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-public-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("exact npm archive bytes");
  const pluginBytes = Buffer.from("exact plugin archive bytes");
  const certificate = exactCertificate({ artifactBytes, ...options });
  const certificatePath = path.join(root, `release-certificate-${certificate.product.version}.json`);
  const npmArtifactPath = path.join(root,
    `${pkg.name}-${certificate.product.version}.tgz`);
  const pluginArtifactPath = path.join(root,
    `${pkg.name}-${certificate.product.version}-claude.plugin.zip`);
  const certificateBytes = Buffer.from(`${JSON.stringify(certificate, null, 2)}\n`);
  writeFileSync(certificatePath, certificateBytes);
  writeFileSync(npmArtifactPath, artifactBytes);
  writeFileSync(pluginArtifactPath, pluginBytes);
  return {
    root, certificate, certificateBytes, certificatePath,
    artifactBytes, npmArtifactPath, pluginBytes, pluginArtifactPath,
  };
}

function checksum(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("public release metadata binds exact private certificate and all downloadable assets without leaking private fields", (t) => {
  const value = fixture(t);
  const first = writePublicReleaseMetadata({
    certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath,
    pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root,
    expectedProduct: { name: pkg.name, version: pkg.version },
  });
  const firstBytes = readFileSync(first.publicCertificate);
  const publicCertificate = JSON.parse(firstBytes);
  assert.equal(publicCertificate.sourceCertificateCommitment.sha256,
    sha256Bytes(value.certificateBytes));
  assert.equal(publicCertificate.assets.npm.sha256, sha256Bytes(value.artifactBytes));
  assert.equal(publicCertificate.assets.coworkPlugin.sha256, sha256Bytes(value.pluginBytes));
  assert.deepEqual(Object.keys(publicCertificate.fieldGateStatuses), PUBLIC_FIELD_GATES);
  assert.deepEqual(Object.keys(publicCertificate.deterministicChecks),
    PUBLIC_DETERMINISTIC_CHECKS);
  assert.equal(publicCertificate.releaseDecision, "PRIVATE_BETA_READY");
  assert.equal(publicCertificate.stablePublicReleaseReady, false);
  assert.deepEqual(publicCertificate.claimBoundary, value.certificate.claimBoundary);

  const serialized = firstBytes.toString("utf8");
  for (const privateValue of ["/Users/alice", "alice@example.com", "alice-mbp",
    "private stdout", "secret stderr", "rawPath", "accountIdentity"]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }

  const sums = readFileSync(first.sha256Sums, "utf8").trim().split("\n");
  const expected = new Map([
    [path.basename(value.npmArtifactPath), checksum(value.artifactBytes)],
    [path.basename(value.pluginArtifactPath), checksum(value.pluginBytes)],
    [path.basename(first.publicCertificate), checksum(firstBytes)],
  ]);
  assert.equal(sums.length, expected.size);
  for (const line of sums) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    assert.ok(match, line);
    assert.equal(match[1], expected.get(match[2]), match[2]);
    expected.delete(match[2]);
  }
  assert.equal(expected.size, 0);

  const second = writePublicReleaseMetadata({
    certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath,
    pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root,
    expectedProduct: { name: pkg.name, version: pkg.version },
  });
  assert.deepEqual(readFileSync(second.publicCertificate), firstBytes);
});

test("public release metadata rejects an npm archive that does not match the exact certificate", (t) => {
  const value = fixture(t, { artifactHash: `sha256:${"0".repeat(64)}` });
  assert.throws(() => writePublicReleaseMetadata({
    certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath,
    pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root,
  }), /PUBLIC_RELEASE_NPM_ARTIFACT_HASH_MISMATCH/);
});

test("public release metadata rejects unreviewed claim-boundary text instead of copying it", (t) => {
  const value = fixture(t, { claimBoundary: ["contact alice@example.com for the private path"] });
  assert.throws(() => writePublicReleaseMetadata({
    certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath,
    pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root,
  }), /PUBLIC_RELEASE_CLAIM_BOUNDARY_INVALID/);
});

test("the release metadata CLI writes the same constrained public artifacts", (t) => {
  const value = fixture(t);
  const result = spawnSync(process.execPath, [
    "scripts/stage05-public-release-metadata.mjs",
    "--certificate", value.certificatePath,
    "--artifact", value.npmArtifactPath,
    "--plugin", value.pluginArtifactPath,
    "--out-dir", value.root,
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.releaseDecision, "PRIVATE_BETA_READY");
  assert.equal(output.stablePublicReleaseReady, false);
  assert.equal(path.dirname(output.publicCertificate), value.root);
  assert.equal(path.dirname(output.sha256Sums), value.root);
});
