import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "scripts", "real-case-gap-evidence-catalog.mjs");

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("catalog CLI builds no-clobber and verifies the 36-gap snapshot", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-real-case-gap-"));
  const artifact = path.join(directory, "catalog.json");
  const built = run(["build", "--out", artifact]);
  assert.equal(built.status, 0, built.stderr);
  const buildReceipt = JSON.parse(built.stdout);
  assert.equal(buildReceipt.gaps, 36);
  assert.equal(buildReceipt.sourceArtifactsReverified, false);
  assert.equal(buildReceipt.webCompletenessEstablished, false);

  const catalog = JSON.parse(readFileSync(artifact, "utf8"));
  assert.equal(catalog.evidencePrinciple.publicOriginAutomaticallyDowngrades, false);
  const verified = run(["verify", "--artifact", artifact]);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).ok, true);

  const clobber = run(["build", "--out", artifact]);
  assert.notEqual(clobber.status, 0);
});
