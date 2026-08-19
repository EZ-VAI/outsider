import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  inspectProductRun, listProductRuns, productVersion, runProductDoctor,
} from "../src/outsider-product.js";

test("product doctor proves persistent storage and host capabilities without a model call", () => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-product-doctor-"));
  let preflightCalls = 0;
  const report = runProductDoctor({
    workerExecutable: "/fake/claude",
    stateRoot,
    workerPreflight: (worker) => {
      preflightCalls += 1;
      assert.equal(worker, "/fake/claude");
      return { ok: true, detail: "protocol and auth available" };
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.stateRoot, stateRoot);
  assert.equal(report.existingRuns, 0);
  assert.equal(preflightCalls, 1);
});

test("runs and show expose durable status without treating unsealed evidence as complete", () => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-product-runs-"));
  const directory = path.join(stateRoot, "run-one");
  mkdirSync(directory);
  writeFileSync(path.join(directory, "run.json"), JSON.stringify({
    runId: "run-one", status: "running", host: "claude-code",
    proof: { complete: false }, updatedAt: "2026-08-11T00:00:00.000Z",
  }));
  writeFileSync(path.join(directory, "contract.json"), JSON.stringify({
    ask: "fix the product", acceptance: "npm test", seal: "sha256:contract",
  }));
  const runs = listProductRuns(stateRoot);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].evidence, "not-sealed");
  const detail = inspectProductRun("run-one", stateRoot);
  assert.equal(detail.ok, true);
  assert.equal(detail.proofComplete, false);
  assert.equal(detail.evidenceVerified, false);
  assert.equal(detail.evidenceError, "EVIDENCE_NOT_FINALIZED");
});

test("unified CLI has stable help, version, runs and show product surfaces", () => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-product-cli-"));
  const cli = path.resolve("bin/outsider.mjs");
  const version = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), productVersion());
  const help = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /outsider doctor/);
  assert.match(help.stdout, /outsider runs/);
  const runs = spawnSync(process.execPath,
    [cli, "runs", "--state-root", stateRoot, "--json"], { encoding: "utf8" });
  assert.equal(runs.status, 0);
  assert.deepEqual(JSON.parse(runs.stdout), []);
  const missing = spawnSync(process.execPath,
    [cli, "show", "missing", "--state-root", stateRoot], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).error, "RUN_NOT_FOUND");
});

test("the installed npm-style symlink executes the CLI instead of returning an empty false green", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-product-symlink-"));
  const link = path.join(directory, "outsider");
  symlinkSync(path.resolve("bin/outsider.mjs"), link);
  const result = spawnSync(link, ["--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), productVersion());
});
