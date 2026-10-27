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

import { createFirstCommittedDigitalRealityProductionCompositionV6 }
  from "../src/outsider-first-committed-digital-reality-production-composition-v6.js";
import {
  createFirstCommittedDigitalRealityProductionLauncherV6,
  OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V6,
} from "../src/outsider-first-committed-digital-reality-production-launcher-v6.js";
import { OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";

const CLOCK = "2026-09-04T21:20:00.000Z";
const ARTIFACT = Buffer.from("outsider production composition v6\n", "utf8");
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
  const root = mkdtempSync(path.join(tmpdir(), "outsider-reality-v6-"));
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
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V6), {
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

async function assertV3Upload(options) {
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

test("v6 composes only the Cloudflare v3 primary and exercises its reversible lifecycle",
  async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-composition-v6-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const calls = [];
    let deleted = false;
    const formed = createFirstCommittedDigitalRealityProductionCompositionV6({
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
            await assertV3Upload(options);
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
      "cloudflare-worker-preactivated-production-v3",
      "first-committed-reality-route-witness-v6",
      "github-release-asset-production-recovery-v2",
    ]);
    const primary = formed.adapters[
      "cloudflare-worker-preactivated-production-v3"];
    assert.equal(primary.uploadProtocol.protocol.mainModuleFilename,
      "worker.js");
    const program = createFirstCommittedDigitalRealityProgramV1({
      programId: "first_production_composition_v6_test",
      orderId: "order_first_production_composition_v6_test",
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
      operationId: "reserve_primary_v6" });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.formationRoutePreactivated, true);
    const released = await primary.release({ reservation,
      operationId: "release_primary_v6" });
    assert.equal(released.status, "RELEASED");
    assert.deepEqual(calls, ["PUT", "POST", "GET", "DELETE", "GET"]);
  });

test("v6 launcher preserves v13 proposal semantics and delays credentials/I-O until exact confirmation",
  async (t) => {
    const state = fixture(t);
    let calls = 0;
    const forbidden = async () => { calls += 1; throw new Error("network"); };
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV6({
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
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V6), false);
  });

test("v6 launcher confirmation reaches Cloudflare through the v3 multipart seam",
  async (t) => {
    const state = fixture(t, true);
    let sawV3Upload = false;
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV6({
      profileDirectory: state.profileDirectory,
      runtimeDirectory: state.runtimeDirectory,
      clock: () => CLOCK,
      providerIO: {
        async cloudflareFetch(_url, options) {
          assert.equal(options.method, "PUT");
          await assertV3Upload(options);
          sawV3Upload = true;
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
    assert.equal(sawV3Upload, true);
    const stored = readdirSync(state.runtimeDirectory, { recursive: true })
      .map((entry) => path.join(state.runtimeDirectory, entry.toString()))
      .filter((file) => statSync(file).isFile())
      .map((file) => readFileSync(file, "utf8")).join("\n");
    for (const token of [CF_TOKEN, GH_TOKEN, UR_TOKEN]) {
      assert.equal(stored.includes(token), false);
    }
  });

test("dedicated v6 CLI accepts a v13 successor request without credentials",
  (t) => {
    const state = fixture(t);
    const requestFile = path.join(state.root, "first-real-goal-v13.json");
    privateWrite(requestFile, {...goal(),completionDeadline:new Date(Date.now()+86400000).toISOString()});
    const script = path.resolve(
      "scripts/outsider-first-committed-reality-production-v6.mjs");
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

