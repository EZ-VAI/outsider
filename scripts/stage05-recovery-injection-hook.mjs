#!/usr/bin/env node
/*
 * Evaluation-only Stop fault injector.
 *
 * The production hook remains the authority.  This wrapper creates one
 * controller-external regression at the first Stop boundary, records exactly
 * what it changed, then delegates the unmodified payload to the shipped hook.
 * It makes a repair opportunity structural instead of depending on a worker
 * choosing to drift.  The injected change models a late conflicting agent or
 * stale generator overwriting a correct file at integration time.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  injectReleaseGateFault, releaseGateFixture,
} from "./stage05-release-gate-fixtures.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const inputBytes = Buffer.concat(chunks);
let input = null;
try { input = JSON.parse(inputBytes.toString("utf8") || "{}"); } catch { /* real hook reports it */ }

const realHook = process.env.OUTSIDER_RECOVERY_REAL_HOOK;
const workspace = process.env.OUTSIDER_RECOVERY_WORKSPACE;
const marker = process.env.OUTSIDER_RECOVERY_INJECTION_MARKER;
const fixtureId = process.env.OUTSIDER_RECOVERY_FIXTURE;
if (!realHook || !workspace || !marker || !fixtureId) {
  process.stderr.write("RECOVERY_INJECTOR_CONFIGURATION_MISSING\n");
  process.exit(1);
}

if (input?.hook_event_name === "Stop" && !existsSync(marker)) {
  const fixture = releaseGateFixture(fixtureId);
  const targets = (fixture.contract?.scope?.in ?? []).filter((relative) => relative in fixture.files);
  const before = targets.map((relative) => {
    const target = path.join(workspace, relative);
    return { path: relative, status: existsSync(target) ? "present" : "missing",
      sha256: existsSync(target)
        ? createHash("sha256").update(readFileSync(target)).digest("hex") : null };
  });
  const injected = injectReleaseGateFault(workspace, fixture);
  const after = injected.map((relative) => ({ path: relative,
    sha256: createHash("sha256").update(readFileSync(path.join(workspace, relative))).digest("hex") }));
  mkdirSync(path.dirname(marker), { recursive: true });
  writeFileSync(marker, JSON.stringify({
    schema: "outsider/stage05-recovery-fault/v1",
    injectedAt: new Date().toISOString(), fixtureId, boundary: "Stop", before, after,
  }, null, 2));
}

const delegated = spawnSync(process.execPath, [realHook, "claude-code"], {
  input: inputBytes,
  env: process.env,
  encoding: null,
  maxBuffer: 8 * 1024 * 1024,
});
if (delegated.stdout) process.stdout.write(delegated.stdout);
if (delegated.stderr) process.stderr.write(delegated.stderr);
if (delegated.error) {
  process.stderr.write(`${delegated.error.message}\n`);
  process.exit(1);
}
process.exit(delegated.status ?? 1);
