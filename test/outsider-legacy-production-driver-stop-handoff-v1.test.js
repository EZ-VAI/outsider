import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { classifyLegacyProductionDriverCommandLineV1,
  createLegacyProductionDriverStopHandoffV1 }
  from "../src/outsider-legacy-production-driver-stop-handoff-v1.js";

const PROGRAM_HASH = `sha256:${"1".repeat(64)}`;
const HEAD_1 = `sha256:${"2".repeat(64)}`;
const HEAD_2 = `sha256:${"3".repeat(64)}`;
const COMMAND_HASH = `sha256:${"4".repeat(64)}`;
const AUTH_HASH = `sha256:${"5".repeat(64)}`;
const CLOCK = "2026-09-04T12:10:00.000Z";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-stop-handoff-v1-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const state = {
    active: true,
    pausedBeforeUserCode: true,
    projection: {
      programId: "program_stop_001",
      programHash: PROGRAM_HASH,
      committed: true,
      state: "PAUSED_RETRYABLE",
      eventCount: 20,
      journalHeadHash: HEAD_1,
    },
  };
  const handoff = createLegacyProductionDriverStopHandoffV1({
    directory: path.join(root, "handoff"),
    profileDirectory: root,
    runtimeDirectory: path.join(root, "runtime"),
    clock: () => CLOCK,
    async processScan() {
      return state.active ? [{
        pid: 43210,
        commandLineHash: COMMAND_HASH,
        commandKind: "resume",
        launcherVersion: "v2",
        exactMigrationInvocation: true,
        pausedBeforeUserCode: state.pausedBeforeUserCode,
      }] : [];
    },
    async inspectProgram() { return state.projection; },
  });
  return { root, state, handoff };
}

function observationInput() {
  return {
    observationId: "observation_stop_001",
    requestId: "request_stop_001",
    programId: "program_stop_001",
    programHash: PROGRAM_HASH,
    driverPid: 43210,
  };
}

test("migration command classification requires exact v2 argv and inspector position",
  () => {
    const expected = {
      requestId: "request_stop_001",
      profileDirectory: "/private/profile",
      runtimeDirectory: "/private/runtime",
    };
    const prefix = "node --inspect-brk=127.0.0.1:0 "
      + "scripts/outsider-first-committed-reality-production-v2.mjs ";
    const suffix = "resume --request-id request_stop_001 "
      + "--profile-dir /private/profile --runtime-dir /private/runtime";
    const exact = classifyLegacyProductionDriverCommandLineV1(
      `${prefix}${suffix}`, expected);
    assert.equal(exact.exactMigrationInvocation, true);
    assert.equal(exact.pausedBeforeUserCode, true);
    assert.equal(exact.launcherVersion, "v2");

    const inspectorAfterScript = classifyLegacyProductionDriverCommandLineV1(
      "node scripts/outsider-first-committed-reality-production-v2.mjs "
        + `--inspect-brk=127.0.0.1:0 ${suffix}`, expected);
    assert.equal(inspectorAfterScript.exactMigrationInvocation, false);
    assert.equal(inspectorAfterScript.pausedBeforeUserCode, false);

    const wrongVersion = classifyLegacyProductionDriverCommandLineV1(
      `${prefix.replace("-v2.mjs", "-v1.mjs")}${suffix}`, expected);
    assert.equal(wrongVersion.exactMigrationInvocation, false);

    const wrongOrder = classifyLegacyProductionDriverCommandLineV1(
      `${prefix}resume --profile-dir /private/profile `
        + "--request-id request_stop_001 --runtime-dir /private/runtime",
      expected);
    assert.equal(wrongOrder.exactMigrationInvocation, false);
  });

test("default scanner preserves exact no-space argv boundaries from ps",
  async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-real-scan-v1-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const profileDirectory = path.join(root, "profile");
    const runtimeDirectory = path.join(root, "runtime");
    const handoffDirectory = path.join(root, "handoff");
    for (const directory of [profileDirectory, runtimeDirectory]) {
      mkdirSync(directory, { recursive: true });
    }
    const inertScript = path.join(root,
      "outsider-first-committed-reality-production-v2.mjs");
    writeFileSync(inertScript, "setInterval(() => {}, 1000);\n");
    const requestId = "request_real_scan_001";
    const child = spawn(process.execPath, [
      "--inspect-brk=127.0.0.1:0",
      inertScript,
      "resume", "--request-id", requestId,
      "--profile-dir", profileDirectory,
      "--runtime-dir", runtimeDirectory,
    ], { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe"] });
    t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(
        "inspector sentinel did not become observable")), 5_000);
      child.stderr.on("data", (bytes) => {
        if (/Debugger listening|Starting inspector/u.test(
          bytes.toString("utf8"))) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("error", reject);
    });
    const handoff = createLegacyProductionDriverStopHandoffV1({
      directory: handoffDirectory,
      profileDirectory,
      runtimeDirectory,
      clock: () => CLOCK,
      async inspectProgram() {
        return {
          programId: "program_real_scan_001",
          programHash: PROGRAM_HASH,
          committed: true,
          state: "PAUSED_RETRYABLE",
          eventCount: 20,
          journalHeadHash: HEAD_1,
        };
      },
    });
    const observation = await handoff.observeLiveDriver({
      observationId: "observation_real_scan_001",
      requestId,
      programId: "program_real_scan_001",
      programHash: PROGRAM_HASH,
      driverPid: child.pid,
    });
    assert.equal(observation.driverPid, child.pid);
    const exited = once(child, "exit");
    child.kill("SIGINT");
    await exited;
    const lease = await handoff.finalizeStoppedDriver({
      observationId: observation.observationId,
      stopAuthorizationEvidenceHash: AUTH_HASH,
    });
    assert.equal(lease.productionExecutionClaimed, false);
  });

test("stop handoff observes the exact live legacy driver then issues a head-bound stopped lease",
  async (t) => {
    const { state, handoff } = fixture(t);
    const observation = await handoff.observeLiveDriver(observationInput());
    assert.equal(observation.driverPid, 43210);
    assert.equal(observation.commandLineHash, COMMAND_HASH);
    assert.equal(observation.evidenceMode,
      "MIGRATION_ONLY_PAUSED_BEFORE_USER_CODE_V1");
    assert.equal(Object.hasOwn(observation, "commandLine"), false);

    state.active = false;
    state.projection = { ...state.projection,
      eventCount: 21, journalHeadHash: HEAD_2 };
    const lease = await handoff.finalizeStoppedDriver({
      observationId: observation.observationId,
      stopAuthorizationEvidenceHash: AUTH_HASH,
    });
    assert.equal(lease.moduleIssued, true);
    assert.equal(lease.stopped, true);
    assert.equal(lease.journalEventCount, 21);
    assert.equal(lease.journalHeadHash, HEAD_2);
    assert.equal(lease.productionExecutionClaimed, false);
    assert.equal(lease.providerOperationClaimed, false);

    const replay = await handoff.replayStoppedDriverLease({
      leaseHash: lease.leaseHash,
      requestId: lease.requestId,
      programId: lease.programId,
      programHash: lease.programHash,
      journalEventCount: lease.journalEventCount,
      journalHeadHash: lease.journalHeadHash,
      interventionStarted: false,
    });
    assert.equal(replay.leaseHash, lease.leaseHash);
  });

test("stop handoff refuses finalization while the observed driver remains live",
  async (t) => {
    const { handoff } = fixture(t);
    await handoff.observeLiveDriver(observationInput());
    await assert.rejects(handoff.finalizeStoppedDriver({
      observationId: "observation_stop_001",
      stopAuthorizationEvidenceHash: AUTH_HASH,
    }), /LEGACY_DRIVER_STILL_ACTIVE/u);
  });

test("migration observation refuses a resume process that is not paused before user code",
  async (t) => {
    const { state, handoff } = fixture(t);
    state.pausedBeforeUserCode = false;
    await assert.rejects(handoff.observeLiveDriver(observationInput()),
      /EXACT_LIVE_DRIVER_NOT_ESTABLISHED/u);
  });

test("stopped lease replay refuses a restarted driver or moved journal",
  async (t) => {
    const { state, handoff } = fixture(t);
    await handoff.observeLiveDriver(observationInput());
    state.active = false;
    const lease = await handoff.finalizeStoppedDriver({
      observationId: "observation_stop_001",
      stopAuthorizationEvidenceHash: AUTH_HASH,
    });
    const expected = {
      leaseHash: lease.leaseHash,
      requestId: lease.requestId,
      programId: lease.programId,
      programHash: lease.programHash,
      journalEventCount: lease.journalEventCount,
      journalHeadHash: lease.journalHeadHash,
      interventionStarted: false,
    };
    state.active = true;
    await assert.rejects(handoff.replayStoppedDriverLease(expected),
      /LEGACY_DRIVER_RESTARTED/u);
    state.active = false;
    state.projection = { ...state.projection,
      eventCount: 22, journalHeadHash: HEAD_2 };
    await assert.rejects(handoff.replayStoppedDriverLease(expected),
      /STOPPED_DRIVER_LEASE_JOURNAL_MOVED/u);
  });
