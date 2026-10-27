import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createFirstCommittedDigitalRealityProductionLauncher as createLauncher,
  OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE as credentialsFile }
  from "../src/outsider-first-committed-digital-reality-production-launcher.js";
import { OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1 as profileFile }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v1.js";

const CLOCK = "2026-09-05T12:00:00.000Z";
const h = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function writePrivate(file, value) {
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), { mode: 0o600 });
  chmodSync(file, 0o600);
}
function fixture(t, credentials = true) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-current-resume-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profileDirectory = path.join(root, "profile");
  const runtimeDirectory = path.join(root, "runtime");
  mkdirSync(profileDirectory, { mode: 0o700 });
  mkdirSync(runtimeDirectory, { mode: 0o700 });
  const artifact = "outsider durable restart fixture\n";
  writePrivate(path.join(profileDirectory, "artifact.txt"), artifact);
  writePrivate(path.join(profileDirectory, profileFile), {
    schema: "outsider/first-committed-digital-reality-production-profile/v1",
    artifactFile: "artifact.txt", artifactHash: h(artifact), contentType: "text/plain",
    formationLeadMs: 300000, observationWindowMs: 600000, cleanupGraceMs: 600000,
    cloudflare: { accountId: "a".repeat(32), workersDevSubdomain: "outsider-test", controlledFailureStatus: 503 },
    github: { owner: "owner", repository: "public-repository" },
    uptimeRobot: { permissionGrantHash: h("permission"), intervalSeconds: 300,
      timeoutSeconds: 30, successHttpResponseCodes: ["2xx"] },
  });
  if (credentials) writePrivate(path.join(profileDirectory, credentialsFile), {
    schema: "outsider/first-committed-digital-reality-production-credentials/v2",
    cloudflare: { apiToken: "cloudflare-test-token-0000000001" },
    githubReleaseAsset: { contentsWriteApiToken: "github-test-token-00000000000001",
      administrationReadApiToken: "github-test-token-00000000000001",
      administrationReadCapabilityConfirmed: true },
    uptimeRobot: { apiToken: "uptime-test-token", expiresAt: "2026-09-11T00:00:00.000Z" },
  });
  return { root, profileDirectory, runtimeDirectory };
}
const goal = (requestId) => ({ requestId,
  goal: "Publish, independently observe, recover and remove the exact digital artifact.",
  completionDeadline: "2026-09-05T13:00:00.000Z",
  budget: { currency: "USD", maximumAmountMinor: "0" } });
function io(calls = []) {
  return {
    async cloudflareFetch() { calls.push("cloudflare"); return Response.json({ success: false }, { status: 400 }); },
    async githubContentsFetch() { calls.push("github"); return Response.json({ private: true, default_branch: "main" }); },
    async githubAdministrationFetch() { throw new Error("not reached"); },
    async uptimeRobotRequest() { throw new Error("not reached"); },
    async globalpingFetch() { throw new Error("not reached"); },
  };
}
function launcher(state, overrides = {}) {
  return createLauncher({ ...state, clock: () => CLOCK, providerIO: io(), ...overrides });
}
async function confirmation(instance, requestId) {
  const proposal = await instance.requestOutcome(goal(requestId));
  return { requestId, programHash: proposal.programHash,
    autonomousResumeBindingHash: h(`node-job:${requestId}`) };
}
const controlFile = (state, requestId, suffix) => path.join(state.runtimeDirectory,
  "execution-control", `${h(requestId).slice(7)}.${suffix}.json`);
function journal(state) {
  const directory = path.join(state.runtimeDirectory, "executions");
  return readdirSync(directory).filter((file) => file.endsWith(".events.jsonl"))
    .flatMap((file) => readFileSync(path.join(directory, file), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse));
}

test("preparation is explicit, credential-free, private and idempotent before execution", async (t) => {
  const state = fixture(t, false);
  const instance = launcher(state);
  const input = await confirmation(instance, "durable_prepare");
  assert.equal(instance.prepareDurableExecution(input).prepared, true);
  const file = controlFile(state, input.requestId, "autonomous-resume-grant");
  const before = readFileSync(file);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(launcher(state).prepareDurableExecution(input).prepared, true);
  assert.deepEqual(readFileSync(file), before);
  assert.equal(existsSync(controlFile(state, input.requestId, "first-autonomous-launch")), false);
  assert.equal(existsSync(path.join(state.profileDirectory, credentialsFile)), false);
  assert.throws(() => instance.prepareDurableExecution({ ...input,
    autonomousResumeBindingHash: h("other-job") }), /GRANT_MISMATCH/);
});

test("a new process resumes the authorized launch-marker/confirmation crash gap without a new order", async (t) => {
  const state = fixture(t);
  const requestId = "durable_before_confirmation";
  const marker = controlFile(state, requestId, "first-autonomous-launch");
  const instance = launcher(state, { clock() {
    if (existsSync(marker)) throw new Error("SIMULATED_STOP_BEFORE_CONFIRMATION");
    return CLOCK;
  } });
  const input = await confirmation(instance, requestId);
  await assert.rejects(instance.confirmAndDriveDurably(input), /SIMULATED_STOP_BEFORE_CONFIRMATION/);
  const confirmationPath = path.join(state.runtimeDirectory, "requests", `${h(requestId).slice(7)}.confirmation.json`);
  assert.equal(existsSync(marker), true);
  assert.equal(existsSync(confirmationPath), false);
  const grant = readFileSync(controlFile(state, requestId, "autonomous-resume-grant"));
  const moduleUrl = new URL("../src/outsider-first-committed-digital-reality-production-launcher.js", import.meta.url).href;
  const script = `import {createFirstCommittedDigitalRealityProductionLauncher as create} from ${JSON.stringify(moduleUrl)};
    const instance = create({...${JSON.stringify(state)}, clock:()=>${JSON.stringify(CLOCK)}, providerIO: {
      cloudflareFetch:async()=>Response.json({success:false},{status:400}),
      githubContentsFetch:async()=>Response.json({private:true,default_branch:'main'}),
      githubAdministrationFetch:async()=>{throw Error('not reached')},
      uptimeRobotRequest:async()=>{throw Error('not reached')},
      globalpingFetch:async()=>{throw Error('not reached')}
    }});
    process.stdout.write(JSON.stringify(await instance.resumeAndDrive(${JSON.stringify(input)})));`;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.state, "UNAVAILABLE");
  assert.equal(result.telemetry.outsiderStaffTouchCount, 0);
  assert.equal(result.telemetry.source, "FIRST_REALITY_DURABLE_AUTONOMOUS_RESUME_GRANT_V1");
  assert.equal(existsSync(confirmationPath), true);
  assert.deepEqual(readFileSync(controlFile(state, requestId, "autonomous-resume-grant")), grant);
  assert.equal(journal(state).filter((event) => event.eventType === "PROGRAM_ACCEPTED").length, 1);
});

test("prepared job also resumes the earlier grant/launch gap and terminal replay makes no provider call", async (t) => {
  const state = fixture(t);
  const first = launcher(state);
  const input = await confirmation(first, "durable_prepared_restart");
  first.prepareDurableExecution(input);
  const result = await launcher(state).resumeAndDrive(input);
  assert.equal(result.state, "UNAVAILABLE");
  const before = journal(state);
  const calls = [];
  const replayed = await launcher(state, { providerIO: io(calls) }).resumeAndDrive(input);
  assert.equal(replayed.state, "UNAVAILABLE");
  assert.equal(replayed.telemetry.outsiderStaffTouchCount, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(journal(state), before);
});

test("resuming a paused journal keeps existing reservation operation identities and zero-touch closure", async (t) => {
  const state = fixture(t);
  const first = launcher(state, { providerIO: { ...io(),
    async githubContentsFetch() { throw new Error("transient metadata read failure"); },
  }, async waitUntil() { throw new Error("SIMULATED_STOP_WHILE_WAITING"); } });
  const input = await confirmation(first, "durable_paused_restart");
  await assert.rejects(first.confirmAndDriveDurably(input), /SIMULATED_STOP_WHILE_WAITING/);
  const before = journal(state).filter((event) => event.eventType === "RESERVATION_REQUESTED");
  assert.ok(before.length > 0);
  const resumed = await launcher(state).resumeAndDrive(input);
  assert.equal(resumed.state, "UNAVAILABLE");
  assert.equal(resumed.telemetry.outsiderStaffTouchCount, 0);
  assert.deepEqual(journal(state).filter((event) => event.eventType === "RESERVATION_REQUESTED"), before);
  assert.ok(before.every((event) => typeof event.payload.operationId === "string"));
});

test("wrong bindings and runs lacking a pre-execution grant cannot acquire autonomous status", async (t) => {
  const state = fixture(t);
  const first = launcher(state);
  const input = await confirmation(first, "durable_wrong_binding");
  first.prepareDurableExecution(input);
  const calls = [];
  await assert.rejects(launcher(state, { providerIO: io(calls) }).resumeAndDrive({ ...input,
    autonomousResumeBindingHash: h("other-job") }), /GRANT_MISMATCH/);
  assert.deepEqual(calls, []);
  const old = await confirmation(first, "old_current_without_grant");
  await first.confirmAndDrive(old);
  await assert.rejects(launcher(state).resumeAndDrive(old), /AUTONOMOUS_RESUME_GRANT_MISSING/);
  assert.throws(() => launcher(state).prepareDurableExecution(old), /ALREADY_CLAIMED/);
});

test("a public entry is durable taint, not a way to relabel a manual continuation as autonomous", async (t) => {
  const state = fixture(t);
  const first = launcher(state, { providerIO: { ...io(),
    async githubContentsFetch() { throw new Error("transient read failure"); },
  }, async waitUntil() { throw new Error("STOP_FOR_TEST"); } });
  const input = await confirmation(first, "durable_public_resume");
  await assert.rejects(first.confirmAndDriveDurably(input), /STOP_FOR_TEST/);
  const publiclyResumed = await launcher(state).resumeConfirmed(input.requestId);
  assert.equal(publiclyResumed.telemetry.outsiderStaffTouchCount, 1);
  const taint = controlFile(state, input.requestId, "first-public-entry");
  assert.equal(statSync(taint).mode & 0o777, 0o600);
  await assert.rejects(launcher(state).resumeAndDrive(input), /PUBLIC_ENTRY_RECORDED/);
  assert.throws(() => launcher(state).prepareDurableExecution(input), /PUBLIC_ENTRY_RECORDED/);
  await assert.rejects(launcher(state).confirmAndDriveDurably(input), /ALREADY_CLAIMED/);
});
