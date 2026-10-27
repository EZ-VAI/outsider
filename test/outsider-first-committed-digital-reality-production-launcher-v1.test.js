import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createFirstCommittedDigitalRealityProductionLauncherV1,
  driveConfirmedProductionOutcomeV1,
  OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V1,
  OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1,
} from "../src/outsider-first-committed-digital-reality-production-launcher-v1.js";
import { publicOutcomeRunViewV1 }
  from "../src/outsider-production-outcome-runner-v1.js";

const CLOCK = "2026-09-03T12:00:00.000Z";
const ARTIFACT = Buffer.from("outsider exact public result v1\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT).digest("hex")}`;
const PERMISSION_HASH = `sha256:${"9".repeat(64)}`;
const CF_TOKEN = "cloudflare-private-token-00000001";
const GH_TOKEN = "github-private-token-000000000001";
const UR_TOKEN = "uptimerobot-private-token-000001";

function privateWrite(file, value) {
  writeFileSync(file, Buffer.isBuffer(value) ? value
    : Buffer.from(`${JSON.stringify(value)}\n`, "utf8"), { mode: 0o600 });
  chmodSync(file, 0o600);
}

function profileFixture(t, { withCredentials = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-reality-launcher-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profileDirectory = path.join(root, "profile");
  const runtimeDirectory = path.join(root, "runtime");
  mkdirSync(profileDirectory, { mode: 0o700 });
  mkdirSync(runtimeDirectory, { mode: 0o700 });
  privateWrite(path.join(profileDirectory, "artifact.txt"), ARTIFACT);
  privateWrite(path.join(profileDirectory,
    OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1), {
    schema:
      "outsider/first-committed-digital-reality-production-profile/v1",
    artifactFile: "artifact.txt",
    artifactHash: ARTIFACT_HASH,
    contentType: "text/plain; charset=utf-8",
    formationLeadMs: 300_000,
    observationWindowMs: 600_000,
    cleanupGraceMs: 600_000,
    cloudflare: {
      accountId: "a".repeat(32),
      workersDevSubdomain: "outsider-test",
      controlledFailureStatus: 503,
    },
    github: { owner: "owner", repository: "public-repository" },
    uptimeRobot: {
      permissionGrantHash: PERMISSION_HASH,
      intervalSeconds: 300,
      timeoutSeconds: 30,
      successHttpResponseCodes: ["2xx"],
    },
  });
  if (withCredentials) writeCredentials(profileDirectory);
  return { root, profileDirectory, runtimeDirectory };
}

function writeCredentials(profileDirectory) {
  privateWrite(path.join(profileDirectory,
    OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V1), {
    schema:
      "outsider/first-committed-digital-reality-production-credentials/v1",
    cloudflare: { apiToken: CF_TOKEN },
    github: { apiToken: GH_TOKEN },
    uptimeRobot: {
      apiToken: UR_TOKEN,
      expiresAt: "2026-09-03T14:00:00.000Z",
    },
  });
}

function goal(requestId) {
  return {
    requestId,
    goal: "Publish this exact artifact, survive primary failure, independently observe it, then close every temporary resource.",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    budget: { currency: "USD", maximumAmountMinor: "0" },
  };
}

function runtimeMaterial(directory) {
  return readdirSync(directory, { recursive: true })
    .map((entry) => path.join(directory, entry.toString()))
    .filter((file) => statSync(file).isFile())
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

test("goal and proposal need no credential file and make no provider call",
  async (t) => {
    const fixture = profileFixture(t);
    let calls = 0;
    const forbidden = async () => { calls += 1; throw new Error("network"); };
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV1({
      profileDirectory: fixture.profileDirectory,
      runtimeDirectory: fixture.runtimeDirectory,
      clock: () => CLOCK,
      providerIO: {
        cloudflareFetch: forbidden,
        githubFetch: forbidden,
        uptimeRobotRequest: forbidden,
        globalpingFetch: forbidden,
      },
    });
    const proposal = await launcher.requestOutcome(goal("reality_goal_001"));
    assert.equal(proposal.nextAction, "CONFIRM_ONCE");
    assert.equal(proposal.outsiderStaffTouchLimit, 0);
    assert.equal(proposal.resourceRoles.length, 3);
    assert.equal(calls, 0);
    assert.equal(launcher.proposal("reality_goal_001").programHash,
      proposal.programHash);
    assert.throws(() => launcher.confirmOutcome({
      requestId: "reality_goal_001",
      programHash: `sha256:${"1".repeat(64)}`,
    }), /CONFIRMATION_PROGRAM_MISMATCH/u);
    assert.equal(calls, 0);
    assert.equal(readdirSync(fixture.profileDirectory).includes(
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V1), false,
    "wrong confirmation must be rejected before credentials are requested");
    for (const name of readdirSync(path.join(fixture.runtimeDirectory,
      "requests"))) {
      assert.equal(statSync(path.join(fixture.runtimeDirectory, "requests",
        name)).mode & 0o777, 0o600);
    }
  });

test("exact confirmation lazily invokes the concrete provider composition and resume needs no new confirmation",
  async (t) => {
    const fixture = profileFixture(t, { withCredentials: true });
    const calls = [];
    const providerIO = {
      async cloudflareFetch(_url, options) {
        calls.push(["cloudflare", options.method,
          options.headers.get("authorization") === `Bearer ${CF_TOKEN}`,
          Buffer.from(options.body).includes(Buffer.from("status:503"))]);
        return new Response(JSON.stringify({ success: false, errors: [] }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      },
      async githubFetch(_url, options) {
        calls.push(["github", options.method ?? "GET",
          options.headers.get("authorization") === `Bearer ${GH_TOKEN}`]);
        return new Response(JSON.stringify({
          private: true,
          default_branch: "main",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      async uptimeRobotRequest() {
        calls.push(["uptimerobot"]);
        throw new Error("witness cannot form without both effect routes");
      },
      async globalpingFetch() {
        calls.push(["globalping"]);
        throw new Error("witness cannot observe an unformed route");
      },
    };
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV1({
      profileDirectory: fixture.profileDirectory,
      runtimeDirectory: fixture.runtimeDirectory,
      clock: () => CLOCK,
      providerIO,
    });
    const proposal = await launcher.requestOutcome(goal("reality_goal_002"));
    assert.equal(calls.length, 0);
    const result = await launcher.confirmOutcome({
      requestId: "reality_goal_002",
      programHash: proposal.programHash,
    });
    assert.equal(result.state, "UNAVAILABLE");
    assert.equal(result.committed, false);
    assert.equal(result.telemetry.outsiderStaffTouchCount, 1);
    assert.equal(result.telemetry.zeroInternalOpsObserved, false);
    assert.equal(result.telemetry.source,
      "FIRST_REALITY_PUBLIC_OR_REPEATED_ENTRY_V1");
    assert.deepEqual(calls.map((item) => item[0]).sort(),
      ["cloudflare", "github"]);
    assert.equal(calls.every((item) => item[2] === true), true);
    assert.equal(calls.find((item) => item[0] === "cloudflare")[3], true,
      "profile-controlled fault status must reach the staged Worker source");
    const resumed = await launcher.resumeConfirmed("reality_goal_002");
    assert.equal(resumed.state, "UNAVAILABLE");
    assert.equal(calls.length, 2,
      "terminal formation failure replays without a second provider effect");
    await assert.rejects(launcher.confirmAndDrive({
      requestId: "reality_goal_002",
      programHash: proposal.programHash,
    }), /AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME/u,
    "an existing confirmation/history can never be relabelled first run");

    const publicView = publicOutcomeRunViewV1(result);
    assert.equal(JSON.stringify(publicView).includes(CF_TOKEN), false);
    assert.equal(JSON.stringify(publicView).includes(GH_TOKEN), false);
    assert.equal(JSON.stringify(publicView).includes(UR_TOKEN), false);
    const stored = runtimeMaterial(fixture.runtimeDirectory);
    assert.equal(stored.includes(CF_TOKEN), false);
    assert.equal(stored.includes(GH_TOKEN), false);
    assert.equal(stored.includes(UR_TOKEN), false);
  });

test("only the first durable confirm-and-drive launch can claim measured zero internal touches",
  async (t) => {
    const fixture = profileFixture(t, { withCredentials: true });
    let providerCalls = 0;
    const providerIO = {
      async cloudflareFetch() {
        providerCalls += 1;
        return new Response(JSON.stringify({ success: false, errors: [] }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      },
      async githubFetch() {
        providerCalls += 1;
        return new Response(JSON.stringify({
          private: true,
          default_branch: "main",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      async uptimeRobotRequest() {
        throw new Error("witness must not form");
      },
      async globalpingFetch() {
        throw new Error("witness must not observe");
      },
    };
    const makeLauncher = () =>
      createFirstCommittedDigitalRealityProductionLauncherV1({
        profileDirectory: fixture.profileDirectory,
        runtimeDirectory: fixture.runtimeDirectory,
        clock: () => CLOCK,
        providerIO,
      });
    const launcher = makeLauncher();
    const proposal = await launcher.requestOutcome(goal("reality_drive_001"));
    const confirmation = {
      requestId: "reality_drive_001",
      programHash: proposal.programHash,
    };
    const result = await launcher.confirmAndDrive(confirmation);
    assert.equal(result.state, "UNAVAILABLE");
    assert.equal(result.telemetry.outsiderStaffTouchCount, 0);
    assert.equal(result.telemetry.humanQueueCreated, false);
    assert.equal(result.telemetry.measurementObserved, true);
    assert.equal(result.telemetry.zeroInternalOpsObserved, true);
    assert.equal(result.telemetry.source,
      "FIRST_REALITY_IN_PROCESS_CONFIRM_AND_DRIVE_LEASE_V1");

    const controlDirectory = path.join(fixture.runtimeDirectory,
      "execution-control");
    const markers = readdirSync(controlDirectory);
    assert.equal(markers.length, 1);
    assert.equal(statSync(path.join(controlDirectory, markers[0])).mode & 0o777,
      0o600);
    const callsAfterFirstRun = providerCalls;
    await assert.rejects(makeLauncher().confirmAndDrive(confirmation),
      /AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME/u);
    assert.equal(providerCalls, callsAfterFirstRun,
      "a second process cannot turn itself into the original autonomous run");
  });

test("public paused result exposes retryAfter for autonomous resume scheduling",
  () => {
    const view = publicOutcomeRunViewV1({
      programId: "program_retryable",
      programHash: ARTIFACT_HASH,
      state: "PAUSED_RETRYABLE",
      committed: true,
      bindings: {},
      reservations: {},
      releases: {},
      nodes: {},
      obligations: {},
      retry: {
        phase: "OBSERVE",
        subjectId: "sustain_and_observe",
        operationId: "observe:2",
        observationOccurrence: 2,
        observationStatus: "INCONCLUSIVE",
        reason: "OBSERVATION_WINDOW_OPEN",
        retryAfter: "2026-09-03T12:15:00.000Z",
      },
      eventCount: 20,
      journalHeadHash: ARTIFACT_HASH,
    });
    assert.deepEqual(view.retry, {
      phase: "OBSERVE",
      subjectId: "sustain_and_observe",
      operationId: "observe:2",
      observationOccurrence: 2,
      observationStatus: "INCONCLUSIVE",
      reason: "OBSERVATION_WINDOW_OPEN",
      retryAfter: "2026-09-03T12:15:00.000Z",
    });
  });

test("autonomous driver waits for retryAfter and resumes without confirmation or polling",
  async () => {
    let currentTime = "2026-09-03T12:05:00.000Z";
    const waits = [];
    let resumes = 0;
    const terminal = await driveConfirmedProductionOutcomeV1({
      projection: {
        state: "PAUSED_RETRYABLE",
        retry: { retryAfter: "2026-09-03T12:15:00.000Z" },
      },
      clock: () => currentTime,
      async waitUntil(target, context) {
        waits.push([target, context.maximumTimerSliceMs]);
        currentTime = target;
      },
      async resume() {
        resumes += 1;
        return { state: "SUCCEEDED", retry: null };
      },
    });
    assert.equal(terminal.state, "SUCCEEDED");
    assert.equal(resumes, 1);
    assert.deepEqual(waits, [["2026-09-03T12:15:00.000Z", 30_000]]);
  });

test("autonomous driver retries an unscheduled transient pause with bounded increasing backoff",
  async () => {
    let now = "2026-09-03T12:05:00.000Z";
    let resumes = 0;
    const waits = [];
    const recovered = await driveConfirmedProductionOutcomeV1({
      projection: { state: "PAUSED_RETRYABLE", retry: { retryAfter: null } },
      clock: () => now,
      async waitUntil(target, context) {
        waits.push([target, context.backoffAttempt, context.backoffMs,
          context.retryAfter, context.maximumTimerSliceMs]);
        now = target;
      },
      async resume() {
        resumes += 1;
        return resumes === 7
          ? { state: "SUCCEEDED", retry: null }
          : { state: "PAUSED_RETRYABLE", retry: { retryAfter: null } };
      },
    });
    assert.equal(recovered.state, "SUCCEEDED");
    assert.equal(resumes, 7);
    assert.deepEqual(waits, [
      ["2026-09-03T12:05:01.000Z", 1, 1_000, null, 30_000],
      ["2026-09-03T12:05:03.000Z", 2, 2_000, null, 30_000],
      ["2026-09-03T12:05:07.000Z", 3, 4_000, null, 30_000],
      ["2026-09-03T12:05:15.000Z", 4, 8_000, null, 30_000],
      ["2026-09-03T12:05:31.000Z", 5, 16_000, null, 30_000],
      ["2026-09-03T12:06:01.000Z", 6, 30_000, null, 30_000],
      ["2026-09-03T12:06:31.000Z", 7, 30_000, null, 30_000],
    ]);
  });

test("autonomous driver preserves overdue retryAfter semantics and rejects an early wait",
  async () => {
    let now = "2026-09-03T12:05:00.000Z";
    const targets = [];
    const recovered = await driveConfirmedProductionOutcomeV1({
      projection: {
        state: "PAUSED_RETRYABLE",
        retry: { retryAfter: "2026-09-03T12:04:00.000Z" },
      },
      clock: () => now,
      async waitUntil(target) { targets.push(target); now = target; },
      async resume() { return { state: "FAILED_CLOSED", retry: null }; },
    });
    assert.equal(recovered.state, "FAILED_CLOSED");
    assert.deepEqual(targets, ["2026-09-03T12:05:01.000Z"],
      "an overdue retry must not turn into a busy loop");

    let resumes = 0;
    await assert.rejects(driveConfirmedProductionOutcomeV1({
      projection: {
        state: "PAUSED_RETRYABLE",
        retry: { retryAfter: null },
      },
      clock: () => "2026-09-03T12:05:00.000Z",
      waitUntil: async () => {},
      resume: async () => { resumes += 1; },
    }), /DRIVER_WAIT_RETURNED_EARLY/u);
    assert.equal(resumes, 0,
      "an early wait must never advance the provider state machine");
  });

test("dedicated CLI emits a proposal without credentials or secret flags",
  (t) => {
    const fixture = profileFixture(t);
    const requestFile = path.join(fixture.root, "goal.json");
    privateWrite(requestFile, {
      ...goal("reality_cli_001"),
      completionDeadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    const script = path.resolve(
      "scripts/outsider-first-committed-reality-production-v1.mjs");
    const common = ["--profile-dir", fixture.profileDirectory,
      "--runtime-dir", fixture.runtimeDirectory];
    const proposed = spawnSync(process.execPath, [script, "goal",
      "--request", requestFile, ...common], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(proposed.status, 0, proposed.stderr);
    const proposal = JSON.parse(proposed.stdout);
    assert.equal(proposal.nextAction, "CONFIRM_ONCE");

    const recalled = spawnSync(process.execPath, [script, "proposal",
      "--request-id", "reality_cli_001", ...common], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(recalled.status, 0, recalled.stderr);
    assert.equal(JSON.parse(recalled.stdout).programHash, proposal.programHash);

    const wrong = spawnSync(process.execPath, [script, "confirm",
      "--request-id", "reality_cli_001",
      "--program-hash", `sha256:${"2".repeat(64)}`, ...common], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /CONFIRMATION_PROGRAM_MISMATCH/u);
    assert.doesNotMatch(wrong.stderr, /CREDENTIALS_FILE_MISSING/u);

    const wrongDriven = spawnSync(process.execPath, [script,
      "confirm-and-drive", "--request-id", "reality_cli_001",
      "--program-hash", `sha256:${"3".repeat(64)}`, ...common], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(wrongDriven.status, 1);
    assert.match(wrongDriven.stderr, /CONFIRMATION_PROGRAM_MISMATCH/u);
    assert.doesNotMatch(wrongDriven.stderr, /CREDENTIALS_FILE_MISSING/u);

    const secretFlag = spawnSync(process.execPath, [script, "proposal",
      "--request-id", "reality_cli_001", ...common,
      "--api-token", CF_TOKEN], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(secretFlag.status, 1);
    assert.equal(secretFlag.stderr.includes(CF_TOKEN), false);
  });

test("profile, artifact, and credential files must remain local 0600 files",
  async (t) => {
    const fixture = profileFixture(t, { withCredentials: true });
    const profileFile = path.join(fixture.profileDirectory,
      OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1);
    chmodSync(profileFile, 0o644);
    assert.throws(() =>
      createFirstCommittedDigitalRealityProductionLauncherV1({
        profileDirectory: fixture.profileDirectory,
        runtimeDirectory: fixture.runtimeDirectory,
        clock: () => CLOCK,
      }), /PROFILE_FILE_NOT_PRIVATE_REGULAR_FILE/u);
    chmodSync(profileFile, 0o600);
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV1({
      profileDirectory: fixture.profileDirectory,
      runtimeDirectory: fixture.runtimeDirectory,
      clock: () => CLOCK,
    });
    const proposal = await launcher.requestOutcome(goal("reality_mode_001"));
    chmodSync(path.join(fixture.profileDirectory,
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V1), 0o644);
    assert.throws(() => launcher.confirmOutcome({
      requestId: "reality_mode_001",
      programHash: proposal.programHash,
    }), /CREDENTIALS_FILE_NOT_PRIVATE_REGULAR_FILE/u);
  });
