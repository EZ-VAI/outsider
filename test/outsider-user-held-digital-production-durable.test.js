import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runUserHeldDigitalProduction, resumeUserHeldDigitalProduction }
  from "../scripts/outsider-user-held-digital-production.mjs";
import { createFirstCommittedDigitalRealityProductionLauncher }
  from "../src/outsider-first-committed-digital-reality-production-launcher.js";
import { createMemoryUserHeldFormationLeaseBrokerV1 }
  from "../src/outsider-user-held-formation-executor-protocol-v1.js";

const NOW = "2026-09-05T12:00:00.000Z";
const h = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function writePrivate(file, value) {
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), { mode: 0o600 });
  chmodSync(file, 0o600);
}
const read = file => JSON.parse(readFileSync(file, "utf8"));
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-digital-entry-durable-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profileDirectory = path.join(root, "profile");
  mkdirSync(profileDirectory, { mode: 0o700 });
  const artifact = "private test artifact for the durable digital entry\n";
  const profileFile = path.join(profileDirectory, "outsider-first-reality-profile-v1.json");
  writePrivate(path.join(profileDirectory, "artifact.txt"), artifact);
  writePrivate(profileFile, {
    schema: "outsider/first-committed-digital-reality-production-profile/v1",
    artifactFile: "artifact.txt", artifactHash: h(artifact), contentType: "text/plain",
    formationLeadMs: 300000, observationWindowMs: 600000, cleanupGraceMs: 600000,
    cloudflare: { accountId: "a".repeat(32), workersDevSubdomain: "outsider-test", controlledFailureStatus: 503 },
    github: { owner: "owner", repository: "public-repository" },
    uptimeRobot: { permissionGrantHash: h("permission"), intervalSeconds: 300,
      timeoutSeconds: 30, successHttpResponseCodes: ["2xx"] },
  });
  writePrivate(path.join(profileDirectory, "outsider-first-reality-credentials-v2.json"), {
    schema: "outsider/first-committed-digital-reality-production-credentials/v2",
    cloudflare: { apiToken: "cloudflare-test-only-token-000001" },
    githubReleaseAsset: { contentsWriteApiToken: "github-test-only-token-000000001",
      administrationReadApiToken: "github-test-only-token-000000001",
      administrationReadCapabilityConfirmed: true },
    uptimeRobot: { apiToken: "uptime-test-only-token", expiresAt: "2026-09-11T00:00:00.000Z" },
  });
  const input = { activationDirectory: path.join(root, "activation"),
    requestFile: path.join(root, "request.json"), profileDirectory,
    runtimeDirectory: path.join(root, "runtime"), privateRoot: path.join(root, "node"),
    ancestryCompositionFile: path.join(root, "ancestry.json"),
    authorizationSourceFile: path.join(root, "authorization.txt"),
    formationDispatchTokenFile: path.join(root, "dispatch-token.secret"),
    centralOrigin: "https://formation.example", expiresAt: "2026-09-05T14:00:00.000Z",
    executionMode: "DURABLE_AUTONOMOUS_V2" };
  writePrivate(input.requestFile, { requestId: "durable_entry_fixture",
    goal: "Publish and independently verify the exact artifact; recover and clean up temporary resources.",
    completionDeadline: "2026-09-05T13:00:00.000Z",
    budget: { currency: "USD", maximumAmountMinor: "0" } });
  writePrivate(input.ancestryCompositionFile, { compositionHash: h("existing-composition"),
    episodeBinding: { principalEpochProjectionHash: h("principal"),
      accountableDeploymentSubjectHash: h("deployment"), runtimeInstanceHash: h("runtime") } });
  writePrivate(input.authorizationSourceFile, "fixture authorization only; no real external resource access");
  writePrivate(input.formationDispatchTokenFile, "fixture-publication-token-not-real-00000001");
  const state = { now: NOW, driverCreations: 0, providerCalls: [], transport: [],
    claims: [], progress: [], waits: [], pauseFirstRun: false };
  const broker = createMemoryUserHeldFormationLeaseBrokerV1({ clock: () => state.now });
  const dependencies = {
    clock: () => state.now,
    createDriver(options) {
      state.driverCreations += 1;
      return createFirstCommittedDigitalRealityProductionLauncher({ ...options,
        async waitUntil() { throw new Error("FIXTURE_DRIVER_PROCESS_INTERRUPTED"); },
        providerIO: {
          async cloudflareFetch() {
            state.providerCalls.push("cloudflare");
            return Response.json({ success: false }, { status: 400 });
          },
          async githubContentsFetch() {
            state.providerCalls.push("github");
            if (state.pauseFirstRun) throw new Error("fixture transient metadata failure");
            return Response.json({ private: true, default_branch: "main" });
          },
          async githubAdministrationFetch() { throw new Error("not reached"); },
          async uptimeRobotRequest() { throw new Error("not reached"); },
          async globalpingFetch() { throw new Error("not reached"); },
        },
      });
    },
    async fetchImpl(url, init) {
      const parsed = new URL(url);
      assert.equal(parsed.origin, input.centralOrigin);
      assert.equal(init.method, "POST");
      const body = JSON.parse(init.body);
      state.transport.push({ route: parsed.pathname, body: String(init.body) });
      if (parsed.pathname === "/v1/client-executions") {
        const published = broker.enqueue(body.job, body.executorCapabilityHash);
        return Response.json({
          schema: "outsider/user-held-formation-execution-publish-response/v1",
          apiVersion: "2.5.0", ok: true, state: "PUBLISHED",
          jobKey: published.jobKey, jobHash: published.jobHash,
          replayed: !published.enqueued, durableStorage: "SQLITE_DURABLE_OBJECT",
          privateParameterBytesStored: false, privateParameterUnkeyedHashStored: false,
          authorityMinted: false, capacityEstablished: false,
          independentOutcomeTruthEstablished: false, outcomeCommitted: false,
        }, { status: 201 });
      }
      if (parsed.pathname === "/v1/client-execution-claims") {
        let claim = broker.claim(body);
        if (state.claims.length && claim.state === "CLAIMED") {
          claim = { ...claim, state: "HOLD", invocation: null };
        }
        state.claims.push(claim);
        return Response.json(claim);
      }
      assert.match(parsed.pathname, /^\/v1\/client-executions\/sha256:[a-f0-9]{64}\/receipt$/u);
      return Response.json(broker.complete(body));
    },
    onProgress: progress => state.progress.push(progress),
    async wait(ms) {
      state.waits.push(ms);
      state.pauseFirstRun = false;
      state.now = new Date(Date.parse(state.now) + ms).toISOString();
    },
  };
  return { root, input, state, dependencies, broker, profileFile,
    activationFile: name => path.join(input.activationDirectory, name) };
}

test("durable entry binds economic draft/Attempt privately, brokers one program and cold-replays without provider I/O", async (t) => {
  const f = fixture(t);
  const result = await runUserHeldDigitalProduction(f.input, f.dependencies);
  assert.equal(result.schema, "outsider/user-held-digital-production-result/v2");
  assert.equal(result.brokerState, "COMPLETE");
  assert.equal(result.program.state, "UNAVAILABLE");
  assert.equal(result.program.zeroInternalOpsObserved, true);
  const activation = read(f.activationFile("activation.json"));
  const draft = read(f.activationFile("economic-contract-draft.json"));
  const lineage = read(f.activationFile("program-lineage.json"));
  const records = read(f.activationFile("economic-records.json"));
  assert.equal(activation.executionMode, "DURABLE_AUTONOMOUS_V2");
  assert.equal(draft.outcomeProgramHash, result.program.programHash);
  assert.equal(draft.episodeRefHash, lineage.graphRefs.episodeHash);
  assert.equal(draft.status, "DRAFT_NOT_ACCEPTED");
  assert.equal(draft.capitalSupport, "NOT_BOUND");
  assert.deepEqual(draft.compensationTerms, []);
  assert.equal(records.contractHash, draft.contractHash);
  assert.deepEqual([records.predictedLosses, records.observedLosses, records.transactions], [[], [], []]);
  assert.equal(result.attemptHash, lineage.graphRefs.attemptHash);
  assert.equal(result.paymentActions, 0);
  for (const name of readdirSync(f.input.activationDirectory)) {
    const file = f.activationFile(name);
    if (statSync(file).isFile()) assert.equal(statSync(file).mode & 0o777, 0o600);
  }
  const wire = f.state.transport.map(entry => entry.body).join("\n");
  // Existing protocol deliberately retains typed graph/Outcome hash refs;
  // the private envelope, economic draft and credentials must stay local.
  for (const privateValue of [draft.contractHash, f.root,
    "fixture authorization only", "cloudflare-test-only-token-000001"]) {
    assert.equal(wire.includes(privateValue), false);
  }
  assert.equal(wire.includes(lineage.graphRefs.attemptHash), true);
  assert.equal(wire.includes(result.program.programHash), true);
  const providerCalls = [...f.state.providerCalls];
  const lineageBefore = readFileSync(f.activationFile("program-lineage.json"));
  const restarted = await resumeUserHeldDigitalProduction(f.input.activationDirectory, f.dependencies);
  assert.deepEqual(restarted, result);
  assert.deepEqual(f.state.providerCalls, providerCalls);
  assert.deepEqual(readFileSync(f.activationFile("program-lineage.json")), lineageBefore);
  assert.equal(f.state.claims.at(-1).state, "COMPLETE");
  assert.equal(f.state.transport.filter(entry => entry.route.endsWith("/receipt")).length, 1);
});

test("the entry supervisor cold-rehydrates a paused node under the same broker lease and Attempt", async (t) => {
  const f = fixture(t);
  f.state.pauseFirstRun = true;
  const result = await runUserHeldDigitalProduction(f.input, f.dependencies);
  assert.equal(result.program.state, "UNAVAILABLE");
  assert.equal(result.program.zeroInternalOpsObserved, true);
  assert.equal(f.state.waits.length, 1);
  assert.equal(f.state.driverCreations, 3);
  assert.deepEqual(f.state.claims.map(claim => claim.state), ["CLAIMED", "HOLD"]);
  assert.equal(f.state.claims[0].leaseHash, f.state.claims[1].leaseHash);
  assert.equal(f.state.claims[0].jobHash, f.state.claims[1].jobHash);
  assert.equal(f.state.progress.filter(event => event.stage === "AUTOMATIC_NODE_CONTINUATION").length, 1);
  assert.equal(f.state.transport.filter(entry => entry.route.endsWith("/receipt")).length, 1);
  assert.equal(read(f.activationFile("program-lineage.json")).graphRefs.attemptHash, result.attemptHash);
});

test("changed private profile or activation job fails before broker/provider operations", async (t) => {
  const f = fixture(t);
  await runUserHeldDigitalProduction(f.input, f.dependencies);
  const profileBefore = readFileSync(f.profileFile, "utf8");
  const callsBefore = [...f.state.providerCalls];
  const transportBefore = f.state.transport.length;
  const driversBefore = f.state.driverCreations;
  writePrivate(f.profileFile, `${profileBefore}\n`);
  await assert.rejects(resumeUserHeldDigitalProduction(f.input.activationDirectory, f.dependencies),
    /PROFILE_CHANGED_REQUIRES_NEW_ACTIVATION/);
  assert.equal(f.state.driverCreations, driversBefore);
  writePrivate(f.profileFile, profileBefore);
  const activation = read(f.activationFile("activation.json"));
  writePrivate(f.activationFile("activation.json"), { ...activation, jobHash: h("another-job") });
  await assert.rejects(resumeUserHeldDigitalProduction(f.input.activationDirectory, f.dependencies), /JOB_REPLAY_MISMATCH/);
  assert.deepEqual(f.state.providerCalls, callsBefore);
  assert.equal(f.state.transport.length, transportBefore);
});

test("a legacy activation is not silently upgraded to autonomous resume", async (t) => {
  const f = fixture(t);
  mkdirSync(f.input.activationDirectory, { mode: 0o700 });
  writePrivate(f.activationFile("activation.json"), {
    schema: "outsider/private-user-held-digital-activation/v1", executionMode: "DURABLE_AUTONOMOUS_V2",
  });
  await assert.rejects(resumeUserHeldDigitalProduction(f.input.activationDirectory, f.dependencies), /DURABLE_ACTIVATION_REQUIRED/);
  assert.equal(f.state.driverCreations, 0);
  assert.equal(f.state.transport.length, 0);
  assert.equal(f.state.providerCalls.length, 0);
});

test("a transient publication outage continues the saved activation without a fresh order", async t => {
  const f = fixture(t);
  const fetch = f.dependencies.fetchImpl;
  let publications = 0;
  f.dependencies.fetchImpl = async (url, init) => {
    if (new URL(url).pathname === "/v1/client-executions" && publications++ === 0) {
      return Response.json({ error: "fixture unavailable" }, { status: 503 });
    }
    return fetch(url, init);
  };
  const result = await runUserHeldDigitalProduction(f.input, f.dependencies);
  assert.equal(result.brokerState, "COMPLETE");
  assert.equal(publications, 2);
  assert.equal(f.state.waits.length, 1);
  assert.equal(f.state.claims.length, 1);
  assert.equal(f.state.progress.some(x => x.reasonCode === "PUBLISH_HTTP_503"), true);
  assert.equal(read(f.activationFile("program-lineage.json")).graphRefs.attemptHash, result.attemptHash);
});
