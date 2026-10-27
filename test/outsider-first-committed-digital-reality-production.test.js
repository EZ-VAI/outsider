import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

import { createFirstCommittedDigitalRealityProductionComposition }
  from "../src/outsider-first-committed-digital-reality-production-composition.js";
import {
  createFirstCommittedDigitalRealityProductionLauncher,
  OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE,
} from "../src/outsider-first-committed-digital-reality-production-launcher.js";
import { OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { createFirstCommittedDigitalRealityProductionLauncherV6 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v6.js";

const CLOCK = "2026-09-04T21:20:00.000Z";
const ARTIFACT = Buffer.from("outsider production composition current\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT).digest("hex")}`;
const PERMISSION_HASH = `sha256:${"9".repeat(64)}`;
const CF_TOKEN = "cloudflare-private-token-v3-000001";
const GH_TOKEN = "github-same-contents-admin-token-v2-000001";
const UR_TOKEN = "uptimerobot-private-token-v2-000001";

function privateWrite(file, value) {
  writeFileSync(file, Buffer.isBuffer(value) ? value
    : Buffer.from(`${JSON.stringify(value)}\n`, "utf8"), { mode: 0o600 });
  chmodSync(file, 0o600);
}

function fixture(t, withCredentials = false) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-reality-current-"));
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
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE), {
      schema:
        "outsider/first-committed-digital-reality-production-credentials/v2",
      cloudflare: { apiToken: CF_TOKEN },
      githubReleaseAsset: {
        contentsWriteApiToken: GH_TOKEN,
        administrationReadApiToken: GH_TOKEN,
        administrationReadCapabilityConfirmed: true,
      },
      uptimeRobot: {
        apiToken: UR_TOKEN,
        expiresAt: "2026-09-11T00:00:00.000Z",
      },
    });
  }
  return { root, profileDirectory, runtimeDirectory };
}

function goal(requestId = "first_committed_reality_20260904_013") {
  return {
    requestId,
    goal: "Publish the exact artifact through a temporary cross-provider network, recover, independently observe, and remove every temporary resource.",
    completionDeadline: "2026-09-05T12:00:00.000Z",
    budget: { currency: "USD", maximumAmountMinor: "0" },
  };
}

async function assertDirectUpload(options) {
  assert.equal(options.body instanceof FormData, true);
  assert.equal(new Headers(options.headers).has("content-type"), false);
  assert.deepEqual([...options.body.keys()], ["metadata", "worker.js"]);
  const metadata = JSON.parse(options.body.get("metadata"));
  assert.equal(metadata.main_module, "worker.js");
  const module = options.body.get("worker.js");
  assert.equal(module.name, "worker.js");
  assert.equal(module.type, "application/javascript+module");
  assert.equal((await module.text()).includes("export default"), true);
  assert.equal(options.body.has("worker.mjs"), false);
}

test("current composition connects the maintained Cloudflare primary and exercises its reversible lifecycle",
  async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-composition-current-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const calls = [];
    let deleted = false;
    const formed = createFirstCommittedDigitalRealityProductionComposition({
      directory: root,
      cloudflare: {
        apiToken: CF_TOKEN,
        accountId: "a".repeat(32),
        workersDevSubdomain: "outsider-test",
        artifactBytes: ARTIFACT,
        visibilityPollIntervalMs: 1,
        visibilityMaxWaitMs: 2,
        cleanupVerificationPollIntervalMs: 1,
        cleanupVerificationMaxWaitMs: 2,
        wait: async () => {},
        async fetchImpl(url, options) {
          calls.push(options.method);
          if (options.method === "PUT") {
            await assertDirectUpload(options);
            return Response.json({ success: true });
          }
          if (options.method === "POST") {
            return Response.json({ success: true, result: { enabled: true } });
          }
          if (options.method === "DELETE") {
            deleted = true;
            return Response.json({ success: true });
          }
          if (options.method === "GET") {
            if (deleted
              && new URL(url).searchParams.has("outsider_cleanup_probe")) {
              return new Response(null, { status: 404 });
            }
            return new Response(ARTIFACT, { status: 200 });
          }
          throw new Error("unexpected Cloudflare method");
        },
      },
      githubReleaseAsset: {
        contentsWriteApiToken: GH_TOKEN,
        administrationReadApiToken: GH_TOKEN,
        administrationReadCapabilityConfirmed: true,
        owner: "owner",
        repository: "repository",
        artifactBytes: ARTIFACT,
        async contentsFetchImpl() { throw new Error("not reached"); },
        async administrationFetchImpl() { throw new Error("not reached"); },
      },
      uptimeRobot: {
        apiToken: UR_TOKEN,
        expiresAt: "2026-09-11T00:00:00.000Z",
        permissionGrantHash: PERMISSION_HASH,
        intervalSeconds: 300,
        timeoutSeconds: 30,
        successHttpResponseCodes: ["2xx"],
        async requestImpl() { throw new Error("not reached"); },
        clock: () => CLOCK,
      },
      globalping: {
        async fetchImpl() { throw new Error("not reached"); },
        clock: () => CLOCK,
      },
    });
    assert.deepEqual(calls, [], "composition must perform no provider I/O");
    assert.deepEqual(Object.keys(formed.adapters).sort(), [
      "cloudflare-worker-preactivated-production",
      "first-committed-reality-route-witness",
      "github-release-asset-production-recovery-v2",
    ]);
    const primary = formed.adapters[
      "cloudflare-worker-preactivated-production"];
    assert.equal(primary.uploadProtocol.protocol.mainModuleFilename,
      "worker.js");
    const program = createFirstCommittedDigitalRealityProgramV1({
      programId: "first_production_composition_current_test",
      orderId: "order_first_production_composition_current_test",
      createdAt: CLOCK,
      formationDeadline: "2026-09-04T21:25:00.000Z",
      completionDeadline: "2026-09-04T22:00:00.000Z",
      cleanupDeadline: "2026-09-04T22:10:00.000Z",
      artifactHash: ARTIFACT_HASH,
      observationWindowMs: 600_000,
    });
    const requirement = program.requirements.find((item) =>
      item.role === "PRIMARY");
    const reservation = await primary.reserve({ program, requirement,
      operationId: "reserve_primary_current" });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.formationRoutePreactivated, true);
    const released = await primary.release({ reservation,
      operationId: "release_primary_current" });
    assert.equal(released.status, "RELEASED");
    assert.deepEqual(calls, ["PUT", "POST", "GET", "DELETE", "GET"]);
  });

test("current launcher preserves current proposal semantics and delays credentials/I-O until exact confirmation",
  async (t) => {
    const state = fixture(t);
    let calls = 0;
    const forbidden = async () => { calls += 1; throw new Error("network"); };
    const launcher = createFirstCommittedDigitalRealityProductionLauncher({
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
    const proposal = await launcher.requestOutcome(goal());
    assert.equal(proposal.nextAction, "CONFIRM_ONCE");
    assert.equal(proposal.outsiderStaffTouchLimit, 0);
    assert.equal(launcher.proposal(goal().requestId).programHash,
      proposal.programHash);
    assert.throws(() => launcher.confirmOutcome({
      requestId: goal().requestId,
      programHash: `sha256:${"1".repeat(64)}`,
    }), /CONFIRMATION_PROGRAM_MISMATCH/u);
    assert.equal(calls, 0);
    assert.equal(readdirSync(state.profileDirectory).includes(
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE), false);
  });

test("current launcher confirmation reaches direct Cloudflare upload without a legacy parser",
  async (t) => {
    const state = fixture(t, true);
    t.mock.method(Response.prototype, "formData", () => {
      throw new Error("the current production path must not parse legacy multipart");
    });
    let sawDirectUpload = false;
    const launcher = createFirstCommittedDigitalRealityProductionLauncher({
      profileDirectory: state.profileDirectory,
      runtimeDirectory: state.runtimeDirectory,
      clock: () => CLOCK,
      providerIO: {
        async cloudflareFetch(_url, options) {
          assert.equal(options.method, "PUT");
          await assertDirectUpload(options);
          sawDirectUpload = true;
          return Response.json({ success: false, errors: [{ code: 10021 }] },
            { status: 400 });
        },
        async githubContentsFetch() {
          return Response.json({ private: true, default_branch: "main" });
        },
        async githubAdministrationFetch() {
          throw new Error("private repository stops before admin preflight");
        },
        async uptimeRobotRequest() { throw new Error("not reached"); },
        async globalpingFetch() { throw new Error("not reached"); },
      },
    });
    const proposal = await launcher.requestOutcome(
      goal("first_committed_reality_20260904_013_launcher"));
    const result = await launcher.confirmOutcome({
      requestId: "first_committed_reality_20260904_013_launcher",
      programHash: proposal.programHash,
    });
    assert.equal(result.state, "UNAVAILABLE");
    assert.equal(sawDirectUpload, true);
    const reopened = createFirstCommittedDigitalRealityProductionLauncher({
      ...state, clock: () => CLOCK,
      providerIO: {
        async cloudflareFetch() { throw new Error("terminal resume needs no upload"); },
        async githubContentsFetch() { throw new Error("terminal resume needs no GitHub read"); },
        async githubAdministrationFetch() { throw new Error("unexpected policy read"); },
        async uptimeRobotRequest() { throw new Error("unexpected monitor request"); },
        async globalpingFetch() { throw new Error("unexpected observation"); },
      },
    });
    assert.equal((await reopened.resumeConfirmed(
      "first_committed_reality_20260904_013_launcher")).state, "UNAVAILABLE");
    const stored = readdirSync(state.runtimeDirectory, { recursive: true })
      .map((entry) => path.join(state.runtimeDirectory, entry.toString()))
      .filter((file) => statSync(file).isFile())
      .map((file) => readFileSync(file, "utf8")).join("\n");
    for (const token of [CF_TOKEN, GH_TOKEN, UR_TOKEN]) {
      assert.equal(stored.includes(token), false);
    }
  });

test("dedicated current CLI accepts a current successor request without credentials",
  (t) => {
    const state = fixture(t);
    const requestFile = path.join(state.root, "first-real-goal-current.json");
    // The CLI uses wall time; the other tests inject CLOCK. Keep this
    // request prospective so this test does not expire on a calendar date.
    privateWrite(requestFile, { ...goal(),
      completionDeadline: new Date(Date.now() + 3_600_000).toISOString() });
    const script = path.resolve(
      "scripts/outsider-first-committed-reality-production.mjs");
    const run = spawnSync(process.execPath, [script, "goal",
      "--request", requestFile,
      "--profile-dir", state.profileDirectory,
      "--runtime-dir", state.runtimeDirectory], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    const proposal = JSON.parse(run.stdout);
    assert.equal(proposal.nextAction, "CONFIRM_ONCE");
    assert.equal(proposal.outsiderStaffTouchLimit, 0);
    assert.equal(run.stderr, "");
  });

test("current CLI help describes the isolated runtime without opening a profile", () => {
  const script = path.resolve(
    "scripts/outsider-first-committed-reality-production.mjs");
  const run = spawnSync(process.execPath, [script, "--help"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Use a new empty --runtime-dir/u);
  assert.match(run.stdout, /resume accepts only current-entrypoint executions/u);
});

test("current launcher leaves an existing v6 runtime untouched", async (t) => {
  const state = fixture(t);
  const frozen = createFirstCommittedDigitalRealityProductionLauncherV6({
    ...state, clock: () => CLOCK,
  });
  const historical = await frozen.requestOutcome(goal("historical_v6_order"));
  const before = readdirSync(state.runtimeDirectory, { recursive: true });
  assert.throws(() => createFirstCommittedDigitalRealityProductionLauncher({
    ...state, clock: () => CLOCK,
  }), { outsiderCode: "HISTORICAL_RUNTIME_REQUIRES_ORIGINAL_ENTRYPOINT" });
  assert.deepEqual(readdirSync(state.runtimeDirectory, { recursive: true }), before);
  assert.equal(frozen.proposal("historical_v6_order").programHash,
    historical.programHash);
});

test("a fresh current launcher reopens its proposals and refuses unstarted resume",
  async (t) => {
    const state = fixture(t);
    const first = createFirstCommittedDigitalRealityProductionLauncher({
      ...state, clock: () => CLOCK,
    });
    const proposal = await first.requestOutcome(goal("current_restart_order"));
    const reopened = createFirstCommittedDigitalRealityProductionLauncher({
      ...state, clock: () => CLOCK,
    });
    assert.equal(reopened.proposal("current_restart_order").programHash,
      proposal.programHash);
    assert.throws(() => reopened.resumeConfirmed("current_restart_order"),
      { outsiderCode: "REQUEST_NOT_OWNED_BY_CURRENT_ENTRYPOINT" });
  });

test("a proposal created by a legacy launcher cannot be adopted within a current runtime",
  async (t) => {
    const state = fixture(t);
    const current = createFirstCommittedDigitalRealityProductionLauncher({
      ...state, clock: () => CLOCK,
    });
    const legacy = createFirstCommittedDigitalRealityProductionLauncherV6({
      ...state, clock: () => CLOCK,
    });
    const proposal = await legacy.requestOutcome(goal("foreign_order"));
    assert.throws(() => current.confirmOutcome({
      requestId: "foreign_order", programHash: proposal.programHash,
    }), { outsiderCode: "REQUEST_NOT_OWNED_BY_CURRENT_ENTRYPOINT" });
    await assert.rejects(current.requestOutcome(goal("foreign_order")),
      { outsiderCode: "REQUEST_NOT_OWNED_BY_CURRENT_ENTRYPOINT" });
  });

test("a current request can finish its ownership record after interrupted proposal persistence",
  async (t) => {
    const state = fixture(t);
    const first = createFirstCommittedDigitalRealityProductionLauncher({
      ...state, clock: () => CLOCK,
    });
    const request = goal("current_interrupted_proposal");
    const proposal = await first.requestOutcome(request);
    const key = createHash("sha256").update(request.requestId).digest("hex");
    // Model an interruption after the stable compiler persisted its proposal
    // but before the current launcher wrote the final ownership binding.
    rmSync(path.join(state.runtimeDirectory, "current-entrypoint",
      `request-${key}.json`));
    const reopened = createFirstCommittedDigitalRealityProductionLauncher({
      ...state, clock: () => CLOCK,
    });
    const retried = await reopened.requestOutcome(request);
    assert.equal(retried.programHash, proposal.programHash);
    assert.equal(reopened.proposal(request.requestId).programHash,
      proposal.programHash);
  });
