import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { main as actuarialMain } from
  "../scripts/stage2-actuarial-mechanism-shadow.mjs";
import { main as factorMain } from
  "../scripts/stage2-factor-predictive-shadow.mjs";
import { publishPrivateArtifact } from
  "../src/outsider-private-artifact-publication.js";

const mode = (target) => lstatSync(target).mode & 0o777;

test("shadow publisher creates private directories and a private no-clobber file", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-shadow-private-"));
  chmodSync(root, 0o755);
  const output = path.join(root, "receipt", "report.json");
  const bytes = Buffer.from('{"ok":true}\n', "utf8");

  const first = publishPrivateArtifact(output, bytes, { trustedRoot: root });
  assert.equal(first.created, true);
  assert.deepEqual(readFileSync(output), bytes);
  assert.equal(mode(path.dirname(output)), 0o700);
  assert.equal(mode(output), 0o600);

  const statBefore = lstatSync(output, { bigint: true });
  const repeated = publishPrivateArtifact(output, bytes,
    { trustedRoot: root, allowExistingIdentical: true });
  const statAfter = lstatSync(output, { bigint: true });
  assert.equal(repeated.reusedIdentical, true);
  assert.equal(statAfter.ino, statBefore.ino);
  assert.equal(statAfter.mtimeNs, statBefore.mtimeNs);
});

test("shadow publisher refuses a pre-existing target without changing it", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-shadow-existing-"));
  const directory = path.join(root, "receipt");
  mkdirSync(directory, { mode: 0o700 });
  const output = path.join(directory, "report.json");
  writeFileSync(output, "DO_NOT_REPLACE", { mode: 0o600 });

  assert.throws(() => publishPrivateArtifact(output, "replacement", { trustedRoot: root }),
    /PRIVATE_ARTIFACT_PUBLICATION_TARGET_EXISTS/u);
  assert.equal(readFileSync(output, "utf8"), "DO_NOT_REPLACE");
  assert.throws(() => publishPrivateArtifact(output, "replacement",
    { trustedRoot: root, allowExistingIdentical: true }),
  /PRIVATE_ARTIFACT_PUBLICATION_TARGET_CONTENT_CONFLICT/u);
  assert.equal(readFileSync(output, "utf8"), "DO_NOT_REPLACE");
});

test("shadow publisher rejects target and ancestor symlinks without touching victims", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-shadow-symlink-"));
  const directory = path.join(root, "receipt");
  mkdirSync(directory, { mode: 0o700 });
  const victim = path.join(root, "victim.json");
  writeFileSync(victim, "VICTIM", { mode: 0o600 });
  const linkedOutput = path.join(directory, "report.json");
  symlinkSync(victim, linkedOutput);

  assert.throws(() => publishPrivateArtifact(linkedOutput, "attack", { trustedRoot: root }),
    /PRIVATE_ARTIFACT_PUBLICATION_TARGET_UNSAFE/u);
  assert.equal(readFileSync(victim, "utf8"), "VICTIM");

  const external = mkdtempSync(path.join(os.tmpdir(), "outsider-shadow-external-"));
  chmodSync(external, 0o755);
  symlinkSync(external, path.join(root, "redirect"));
  assert.throws(() => publishPrivateArtifact(
    path.join(root, "redirect", "nested", "report.json"), "attack", { trustedRoot: root }),
  /PRIVATE_ARTIFACT_PUBLICATION_DIRECTORY_UNSAFE/u);
  assert.equal(mode(external), 0o755, "a rejected external directory must not be chmodded");
});

test("shadow publisher uses randomized temporaries and ignores a legacy partial symlink", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-shadow-partial-"));
  const directory = path.join(root, "receipt");
  mkdirSync(directory, { mode: 0o700 });
  const victim = path.join(root, "victim.txt");
  writeFileSync(victim, "VICTIM", { mode: 0o600 });
  const output = path.join(directory, "report.json");
  symlinkSync(victim, `${output}.partial`);

  publishPrivateArtifact(output, "SAFE", { trustedRoot: root });
  assert.equal(readFileSync(output, "utf8"), "SAFE");
  assert.equal(readFileSync(victim, "utf8"), "VICTIM");
});

test("both shadow CLIs expose side-effect-free private-publication help", async () => {
  for (const main of [factorMain, actuarialMain]) {
    let output = "";
    assert.equal(await main(["--help"], { stdout: { write: (value) => { output += value; } } }),
      0);
    assert.match(output, /content-addressed receipt/u);
    assert.match(output, /must not already exist/u);
  }
});
