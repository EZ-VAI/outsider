import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const tool = fileURLToPath(new URL(
  "../tools/outsider-physical-simulation-phase2.mjs", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [tool, ...args], {
    cwd: dirname(tool),
    encoding: "utf8",
    timeout: 15_000,
  });
}

test("Phase 2 CLI emits a bounded summary and a no-clobber 0600 report", (t) => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "outsider-physical-phase2."));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const defaultRun = run([]);
  assert.equal(defaultRun.status, 0, defaultRun.stderr);
  const summary = JSON.parse(defaultRun.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.artifactClass, "SYNTHETIC_CONFORMANCE_FIXTURE_ONLY");
  assert.equal(summary.frozenRolloutSlots, 20);
  assert.equal(summary.materializedRolloutRows, 20);
  assert.deepEqual(summary.cohort, {
    accepted: 16,
    rejected: 3,
    missing: 1,
    retriesInCanonicallyAdmittedTraces: 1,
    terminalFailuresInCanonicallyAdmittedTraces: 1,
    abandonedInCanonicallyAdmittedTraces: 1,
    budgetExhaustedInCanonicallyAdmittedTraces: 1,
    unresolvedRows: 6,
    rejectedOrMissingAttemptCountsKnownComplete: false,
  });
  assert.deepEqual(summary.injectedFaults, {
    total: 11,
    detectedRejected: 8,
    detectedQuarantined: 2,
    notObservableWithCurrentTrace: 1,
  });
  assert.deepEqual(summary.releaseSignals, {
    definedSyntheticDeclaredPins: 6,
    syntheticDeclaredPinMismatchesDetected: 6,
    independentReleasePrecommitEstablished: false,
    runtimeReleaseAttestationEstablished: false,
  });
  assert.equal(summary.physicalFaultRatesEstablished, false);
  assert.equal(summary.physicalSafetyEstablished, false);
  assert.equal(summary.successClaimAuthorized, false);

  const output = join(root, "phase2-report.json");
  const written = run(["--output", output]);
  assert.equal(written.status, 0, written.stderr);
  const writtenSummary = JSON.parse(written.stdout);
  assert.equal(writtenSummary.outputPath, output);
  assert.match(writtenSummary.fileSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  const report = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(report.reportHash, summary.reportHash);
  assert.equal(report.authority.devicesAccessed, false);

  const before = readFileSync(output);
  const duplicate = run(["--output", output]);
  assert.equal(duplicate.status, 2);
  assert.equal(duplicate.stdout, "");
  assert.match(duplicate.stderr, /EEXIST/);
  assert.deepEqual(readFileSync(output), before);

  const full = run(["--report"]);
  assert.equal(full.status, 0, full.stderr);
  assert.equal(JSON.parse(full.stdout).reportHash, summary.reportHash);
  assert.equal(basename(output), "phase2-report.json");
});

test("Phase 2 CLI rejects unknown flags and relative output paths", () => {
  for (const args of [["--unknown"], ["--output", "relative.json"]]) {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /PHYSICAL_SIMULATION_PHASE2_CLI_/);
  }
});
