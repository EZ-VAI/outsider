import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync,
  rmSync, symlinkSync, writeFileSync,
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

test("random exclusive output temps ignore the old predictable temp symlink", (t) => {
  const value = fixture(t);
  const publicFile = path.join(value.root,
    `release-certificate-public-${value.certificate.product.version}.json`);
  const predictable = `${publicFile}.tmp-${process.pid}`;
  const victim = path.join(value.root, "predictable-temp-victim");
  writeFileSync(victim, "PREDICTABLE-VICTIM-MUST-STAY\n");
  symlinkSync(victim, predictable);

  writePublicReleaseMetadata({ certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root });

  assert.equal(readFileSync(victim, "utf8"), "PREDICTABLE-VICTIM-MUST-STAY\n");
  assert.equal(lstatSync(predictable).isSymbolicLink(), true);
  assert.equal(existsSync(publicFile), true);
});

test("final output symlink is refused without touching its victim", (t) => {
  const value = fixture(t);
  const publicFile = path.join(value.root,
    `release-certificate-public-${value.certificate.product.version}.json`);
  const victim = path.join(value.root, "final-output-victim");
  writeFileSync(victim, "FINAL-VICTIM-MUST-STAY\n");
  symlinkSync(victim, publicFile);

  assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root }), /PUBLIC_RELEASE_OUTPUT_SYMLINK_REFUSED/);
  assert.equal(readFileSync(victim, "utf8"), "FINAL-VICTIM-MUST-STAY\n");
  assert.equal(lstatSync(publicFile).isSymbolicLink(), true);
});

test("intermediate output symlink below the trusted root is refused", (t) => {
  const value = fixture(t);
  const victim = path.join(value.root, "intermediate-victim");
  const first = path.join(value.root, "output");
  mkdirSync(victim);
  mkdirSync(first);
  writeFileSync(path.join(victim, "keep"), "INTERMEDIATE-VICTIM\n");
  symlinkSync(victim, path.join(first, "redirect"));

  assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: path.join(first, "redirect", "nested"), trustedOutputRoot: value.root }),
  /PUBLIC_RELEASE_OUTPUT_SYMLINK_REFUSED/);
  assert.deepEqual(readdirSync(victim), ["keep"]);
});

test("output parent substitution after durable temp fails before publication", (t) => {
  const value = fixture(t);
  const output = path.join(value.root, "output");
  const displaced = path.join(value.root, "output-displaced");
  mkdirSync(output);
  let swapped = false;
  assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: output, trustedOutputRoot: value.root,
    testOnlyWriteObserver: (event) => {
      if (!swapped && event.phase === "output-temp-durable") {
        renameSync(output, displaced);
        mkdirSync(output);
        swapped = true;
      }
    } }), /PUBLIC_RELEASE_OUTPUT_PARENT_IDENTITY_CHANGED/);
  assert.equal(swapped, true);
  assert.deepEqual(readdirSync(output), []);
  assert.equal(readdirSync(displaced).some((name) => name.endsWith(".tmp")), true,
    "the displaced owned temp is preserved rather than deleting through a substituted path");
});

test("all three release inputs refuse symlinks and stable-read identity drift", async (t) => {
  await t.test("input symlink", () => {
    const value = fixture(t);
    const link = path.join(value.root, "certificate-link.json");
    symlinkSync(value.certificatePath, link);
    assert.throws(() => writePublicReleaseMetadata({ certificatePath: link,
      npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
      outputDirectory: value.root }), /PUBLIC_RELEASE_INPUT_SYMLINK_REFUSED/);
  });
  await t.test("in-place mutation after read", () => {
    const value = fixture(t);
    let mutated = false;
    assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
      npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
      outputDirectory: value.root, testOnlyReadObserver: (event) => {
        if (!mutated && event.phase === "input-read" && event.file === value.certificatePath) {
          writeFileSync(value.certificatePath, "MUTATED-DURING-STABLE-READ\n");
          mutated = true;
        }
      } }), /PUBLIC_RELEASE_INPUT_IDENTITY_CHANGED/);
  });
  await t.test("pathname replacement after descriptor open", () => {
    const value = fixture(t);
    const displaced = `${value.certificatePath}.displaced`;
    let replaced = false;
    assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
      npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
      outputDirectory: value.root, testOnlyReadObserver: (event) => {
        if (!replaced && event.phase === "input-opened" && event.file === value.certificatePath) {
          renameSync(value.certificatePath, displaced);
          writeFileSync(value.certificatePath, "REPLACEMENT\n");
          replaced = true;
        }
      } }), /PUBLIC_RELEASE_INPUT_IDENTITY_CHANGED/);
  });
});

test("global input snapshot rejects early asset drift during later reads and output publication",
  async (t) => {
    await t.test("early npm changes while plugin is read", () => {
      const value = fixture(t);
      let mutated = false;
      assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
        npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
        outputDirectory: value.root, testOnlyReadObserver: (event) => {
          if (!mutated && event.phase === "input-opened" && event.file === value.pluginArtifactPath) {
            const bytes = readFileSync(value.npmArtifactPath);
            bytes[0] ^= 1;
            writeFileSync(value.npmArtifactPath, bytes);
            mutated = true;
          }
        } }), /PUBLIC_RELEASE_INPUT_IDENTITY_CHANGED/);
    });
    await t.test("npm changes while an output temp is durable", () => {
      const value = fixture(t);
      let mutated = false;
      assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
        npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
        outputDirectory: value.root, testOnlyWriteObserver: (event) => {
          if (!mutated && event.phase === "output-temp-durable") {
            const bytes = readFileSync(value.npmArtifactPath);
            bytes[0] ^= 1;
            writeFileSync(value.npmArtifactPath, bytes);
            mutated = true;
          }
        } }), /PUBLIC_RELEASE_INPUT_IDENTITY_CHANGED/);
    });
  });

test("same-length durable output-temp mutation is detected and never published", (t) => {
  const value = fixture(t);
  let mutated = false;
  assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root, testOnlyWriteObserver: (event) => {
      if (!mutated && event.phase === "output-temp-durable") {
        const bytes = readFileSync(event.temporary);
        bytes.fill(bytes[0] ^ 1);
        writeFileSync(event.temporary, bytes);
        mutated = true;
      }
    } }), /PUBLIC_RELEASE_TEMP_IDENTITY_CHANGED/);
  assert.equal(existsSync(path.join(value.root,
    `release-certificate-public-${value.certificate.product.version}.json`)), false);
});

test("output modes are exact 0644 even under umask 077", (t) => {
  const value = fixture(t);
  const prior = process.umask(0o077);
  try {
    const result = writePublicReleaseMetadata({ certificatePath: value.certificatePath,
      npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
      outputDirectory: value.root });
    assert.equal(lstatSync(result.publicCertificate).mode & 0o777, 0o644);
    assert.equal(lstatSync(result.sha256Sums).mode & 0o777, 0o644);
  } finally {
    process.umask(prior);
  }
});

test("second-output failure rolls the first output back to the prior generation", (t) => {
  const value = fixture(t);
  const publicFile = path.join(value.root,
    `release-certificate-public-${value.certificate.product.version}.json`);
  const sumsFile = path.join(value.root, "SHA256SUMS");
  const oldPublic = Buffer.from("OLD-PUBLIC-GENERATION\n");
  const oldSums = Buffer.from("OLD-SUMS-GENERATION\n");
  writeFileSync(publicFile, oldPublic, { mode: 0o644 });
  writeFileSync(sumsFile, oldSums, { mode: 0o644 });
  assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root, testOnlyWriteObserver: (event) => {
      if (path.basename(event.file) === "SHA256SUMS") throw new Error("SECOND_OUTPUT_FAILED");
    } }), /SECOND_OUTPUT_FAILED/);
  assert.deepEqual(readFileSync(publicFile), oldPublic);
  assert.deepEqual(readFileSync(sumsFile), oldSums);
});

test("joint output revalidation rejects cert mutation during sums staging and rolls back", (t) => {
  const value = fixture(t);
  const publicFile = path.join(value.root,
    `release-certificate-public-${value.certificate.product.version}.json`);
  const sumsFile = path.join(value.root, "SHA256SUMS");
  let mutated = false;
  assert.throws(() => writePublicReleaseMetadata({ certificatePath: value.certificatePath,
    npmArtifactPath: value.npmArtifactPath, pluginArtifactPath: value.pluginArtifactPath,
    outputDirectory: value.root, testOnlyWriteObserver: (event) => {
      if (!mutated && event.phase === "output-temp-durable"
        && path.basename(event.file) === "SHA256SUMS") {
        const bytes = readFileSync(publicFile);
        bytes.fill(bytes[0] ^ 1);
        writeFileSync(publicFile, bytes);
        mutated = true;
      }
    } }), /PUBLIC_RELEASE_OUTPUT_IDENTITY_CHANGED/);
  assert.equal(mutated, true);
  assert.equal(existsSync(publicFile), false,
    "the owned mutated generation is rolled back rather than returned as success");
  assert.equal(existsSync(sumsFile), false);
});
