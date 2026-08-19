#!/usr/bin/env node
/*
 * Execute controller-owned acceptance evidence only when both this runner and
 * the evidence still match the hashes sealed into the acceptance command.
 * The worker can neither edit the hidden probe nor silently swap the runner.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sha256(pathname) {
  return createHash("sha256").update(readFileSync(pathname)).digest("hex");
}

const [expectedRunnerHash, probePath, expectedProbeHash, workspace] = process.argv.slice(2);
if (!expectedRunnerHash || !probePath || !expectedProbeHash || !workspace) {
  console.error("usage: run-sealed-acceptance <runner-sha256> <probe> <probe-sha256> <workspace>");
  process.exit(64);
}

const runnerPath = fileURLToPath(import.meta.url);
if (sha256(runnerPath) !== expectedRunnerHash) {
  console.error("SEALED_ACCEPTANCE_RUNNER_CHANGED");
  process.exit(65);
}
if (sha256(probePath) !== expectedProbeHash) {
  console.error("SEALED_ACCEPTANCE_EVIDENCE_CHANGED");
  process.exit(66);
}

const result = spawnSync(process.execPath, [probePath, workspace], {
  cwd: workspace,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 60_000,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) {
  console.error(result.error.message);
  process.exit(67);
}
process.exit(result.status ?? 68);
