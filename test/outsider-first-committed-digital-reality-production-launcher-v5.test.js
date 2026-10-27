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
  createFirstCommittedDigitalRealityProductionLauncherV5,
  OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V5,
} from "../src/outsider-first-committed-digital-reality-production-launcher-v5.js";
import { OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v1.js";

const CLOCK = "2026-09-04T12:00:00.000Z";
const ARTIFACT = Buffer.from("outsider release route v2\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT).digest("hex")}`;
const PERMISSION_HASH = `sha256:${"9".repeat(64)}`;
const CF_TOKEN = "cloudflare-private-token-v2-000001";
const GH_TOKEN = "github-same-contents-admin-token-v2-000001";
const UR_TOKEN = "uptimerobot-private-token-v2-000001";

function privateWrite(file, value) {
  writeFileSync(file, Buffer.isBuffer(value) ? value
    : Buffer.from(`${JSON.stringify(value)}\n`, "utf8"), { mode: 0o600 });
  chmodSync(file, 0o600);
}

function fixture(t, { withCredentials = false,
  administrationToken = GH_TOKEN } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-reality-v2-"));
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
  if (withCredentials) {
    privateWrite(path.join(profileDirectory,
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V5), {
      schema:
        "outsider/first-committed-digital-reality-production-credentials/v2",
      cloudflare: { apiToken: CF_TOKEN },
      githubReleaseAsset: {
        contentsWriteApiToken: GH_TOKEN,
        administrationReadApiToken: administrationToken,
        administrationReadCapabilityConfirmed: true,
      },
      uptimeRobot: {
        apiToken: UR_TOKEN,
        expiresAt: "2026-09-04T14:00:00.000Z",
      },
    });
  }
  return { root, profileDirectory, runtimeDirectory };
}

function goal(requestId) {
  return {
    requestId,
    goal: "Publish one exact result, recover through a second provider, independently observe it, then remove every active route.",
    completionDeadline: "2026-09-04T12:30:00.000Z",
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

test("v5 goal/proposal and wrong confirmation need no credentials or network",
  async (t) => {
    const state = fixture(t);
    let calls = 0;
    const forbidden = async () => { calls += 1; throw new Error("network"); };
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV5({
      profileDirectory: state.profileDirectory,
      runtimeDirectory: state.runtimeDirectory,
      clock: () => CLOCK,
      providerIO: {
        cloudflareFetch: forbidden,
        githubContentsFetch: forbidden,
        githubAdministrationFetch: forbidden,
        uptimeRobotRequest: forbidden,
        globalpingFetch: forbidden,
      },
    });
    const proposal = await launcher.requestOutcome(goal("reality_v5_goal_001"));
    assert.equal(proposal.nextAction, "CONFIRM_ONCE");
    assert.equal(proposal.outsiderStaffTouchLimit, 0);
    assert.equal(launcher.proposal("reality_v5_goal_001").programHash,
      proposal.programHash);
    assert.throws(() => launcher.confirmOutcome({
      requestId: "reality_v5_goal_001",
      programHash: `sha256:${"1".repeat(64)}`,
    }), /CONFIRMATION_PROGRAM_MISMATCH/u);
    assert.equal(calls, 0);
    assert.equal(readdirSync(state.profileDirectory).includes(
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V5), false);
  });

test("v5 exact confirm-and-drive selects Release Asset recovery and retains zero-touch telemetry",
  async (t) => {
    const state = fixture(t, { withCredentials: true });
    const calls = [];
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV5({
      profileDirectory: state.profileDirectory,
      runtimeDirectory: state.runtimeDirectory,
      clock: () => CLOCK,
      providerIO: {
        async cloudflareFetch(url, options) {
          calls.push(["cloudflare", options.method, url,
            options.headers.get("authorization")]);
          return Response.json({ success: false, errors: [] }, { status: 403 });
        },
        async githubContentsFetch(url, options) {
          calls.push(["github-contents", options.method ?? "GET", url,
            options.headers.get("authorization")]);
          return Response.json({ private: true, default_branch: "main" });
        },
        async githubAdministrationFetch() {
          calls.push(["github-administration"]);
          throw new Error("private repository must fail before policy probe");
        },
        async uptimeRobotRequest() {
          calls.push(["uptimerobot"]);
          throw new Error("witness must not form");
        },
        async globalpingFetch() {
          calls.push(["globalping"]);
          throw new Error("witness must not observe");
        },
      },
    });
    const proposal = await launcher.requestOutcome(goal("reality_v5_drive_001"));
    const result = await launcher.confirmAndDrive({
      requestId: "reality_v5_drive_001",
      programHash: proposal.programHash,
    });
    assert.equal(result.state, "UNAVAILABLE");
    assert.equal(result.telemetry.outsiderStaffTouchCount, 0);
    assert.equal(result.telemetry.humanQueueCreated, false);
    assert.equal(result.telemetry.zeroInternalOpsObserved, true);
    assert.equal(result.telemetry.source,
      "FIRST_REALITY_IN_PROCESS_CONFIRM_AND_DRIVE_LEASE_V1");
    assert.deepEqual(calls.map((item) => item[0]).sort(),
      ["cloudflare", "github-contents"]);
    assert.equal(calls.find((item) => item[0] === "github-contents")[2],
      "https://api.github.com/repos/owner/public-repository");
    assert.equal(calls.find((item) => item[0] === "github-contents")[3],
      `Bearer ${GH_TOKEN}`);
    const callsAfterFirstRun = calls.length;
    await assert.rejects(launcher.confirmAndDrive({
      requestId: "reality_v5_drive_001",
      programHash: proposal.programHash,
    }), /AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME/u);
    assert.equal(calls.length, callsAfterFirstRun,
      "a repeated public entry cannot reclaim zero-touch or call a provider");
    const stored = runtimeMaterial(state.runtimeDirectory);
    for (const token of [CF_TOKEN, GH_TOKEN, UR_TOKEN]) {
      assert.equal(stored.includes(token), false);
    }
  });

test("v5 admin preflight denial pauses before immutable-policy or release mutation",
  async (t) => {
    const state = fixture(t, { withCredentials: true });
    const githubCalls = [];
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV5({
      profileDirectory: state.profileDirectory,
      runtimeDirectory: state.runtimeDirectory,
      clock: () => CLOCK,
      providerIO: {
        async cloudflareFetch() {
          return Response.json({ success: false, errors: [] }, { status: 403 });
        },
        async githubContentsFetch(url, options) {
          githubCalls.push(["contents", options.method ?? "GET", url]);
          return Response.json({ private: false, default_branch: "main" });
        },
        async githubAdministrationFetch(url, options) {
          githubCalls.push(["administration", options.method ?? "GET", url]);
          return Response.json({ message: "Forbidden" }, { status: 403 });
        },
        async uptimeRobotRequest() { throw new Error("not reached"); },
        async globalpingFetch() { throw new Error("not reached"); },
      },
    });
    const proposal = await launcher.requestOutcome(goal("reality_v5_admin_001"));
    const result = await launcher.confirmOutcome({
      requestId: "reality_v5_admin_001",
      programHash: proposal.programHash,
    });
    assert.equal(result.state, "PAUSED_RETRYABLE");
    assert.deepEqual(githubCalls.map(([capability, method]) =>
      [capability, method]), [
      ["contents", "GET"],
      ["administration", "GET"],
    ]);
    assert.equal(githubCalls[1][2].endsWith("/actions/permissions"), true);
    assert.equal(githubCalls.some(([, method]) => method !== "GET"), false);
    assert.equal(githubCalls.some(([, , url]) =>
      url.includes("/immutable-releases")), false);
  });

test("v5 refuses split GitHub tokens before provider construction", async (t) => {
  const state = fixture(t, { withCredentials: true,
    administrationToken: `${GH_TOKEN}-different` });
  let calls = 0;
  const launcher = createFirstCommittedDigitalRealityProductionLauncherV5({
    profileDirectory: state.profileDirectory,
    runtimeDirectory: state.runtimeDirectory,
    clock: () => CLOCK,
    providerIO: {
      cloudflareFetch: async () => { calls += 1; },
      githubContentsFetch: async () => { calls += 1; },
      githubAdministrationFetch: async () => { calls += 1; },
      uptimeRobotRequest: async () => { calls += 1; },
      globalpingFetch: async () => { calls += 1; },
    },
  });
  const proposal = await launcher.requestOutcome(goal("reality_v5_token_001"));
  assert.throws(() => launcher.confirmOutcome({
    requestId: "reality_v5_token_001",
    programHash: proposal.programHash,
  }), /CREDENTIALS_INVALID/u);
  assert.equal(calls, 0);
});

test("dedicated v5 CLI proposes without credentials or secret flags", (t) => {
  const state = fixture(t);
  const requestFile = path.join(state.root, "goal.json");
  privateWrite(requestFile, {
    ...goal("reality_v5_cli_001"),
    completionDeadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  const script = path.resolve(
    "scripts/outsider-first-committed-reality-production-v5.mjs");
  const common = ["--profile-dir", state.profileDirectory,
    "--runtime-dir", state.runtimeDirectory];
  const proposed = spawnSync(process.execPath, [script, "goal",
    "--request", requestFile, ...common], {
    cwd: path.resolve("."), encoding: "utf8",
  });
  assert.equal(proposed.status, 0, proposed.stderr);
  const proposal = JSON.parse(proposed.stdout);
  assert.equal(proposal.nextAction, "CONFIRM_ONCE");

  const wrong = spawnSync(process.execPath, [script, "confirm",
    "--request-id", "reality_v5_cli_001",
    "--program-hash", `sha256:${"2".repeat(64)}`, ...common], {
    cwd: path.resolve("."), encoding: "utf8",
  });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /CONFIRMATION_PROGRAM_MISMATCH/u);
  assert.doesNotMatch(wrong.stderr, /CREDENTIALS_FILE_MISSING/u);

  const secretFlag = spawnSync(process.execPath, [script, "proposal",
    "--request-id", "reality_v5_cli_001", ...common,
    "--api-token", GH_TOKEN], {
    cwd: path.resolve("."), encoding: "utf8",
  });
  assert.equal(secretFlag.status, 1);
  assert.equal(secretFlag.stderr.includes(GH_TOKEN), false);
});


