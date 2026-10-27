import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { createPrimaryRecoveryWitnessCompositionV1,
  createProductionOutcomeRunnerV1 }
  from "../src/outsider-production-outcome-runner-v1.js";
import { createUserHeldOutcomeProgramComposition }
  from "../src/outsider-user-held-outcome-program-composition.js";

const CLOCK = "2026-09-05T12:00:00.000Z";
const hash = text => `sha256:${createHash("sha256").update(text).digest("hex")}`;

async function fixture(t, { recoveryFails = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-program-node-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [];
  function adapter(role) {
    return {
      adapterId: `test-${role}`, providerRef: role,
      async reserve() { calls.push(`${role}:reserve`); return {
        status: "RESERVED", reservationId: `reserved:${role}`,
        validUntil: "2026-09-05T13:00:00.000Z",
        providerReceipt: { test: true }, adapterState: { private: "local-secret" },
      }; },
      async execute() { calls.push(`${role}:execute`); return role === "primary" || recoveryFails
        ? { status: "FAILED", reason: "TEST_CONTROLLED_FAILURE" }
        : { status: "SUCCEEDED", routeUrl: "https://test.invalid/recovery" }; },
      async observe() { calls.push(`${role}:observe`); return {
        status: "SATISFIED", observationId: "test-observation",
      }; },
      async closeObligation() { calls.push(`${role}:close`);
        return { status: "CLOSED", receipt: "test-closed" }; },
      async release() { calls.push(`${role}:release`);
        return { status: "RELEASED", receipt: "test-released" }; },
    };
  }
  const composition = createPrimaryRecoveryWitnessCompositionV1({
    primaryAdapter: adapter("primary"), recoveryAdapter: adapter("recovery"),
    witnessAdapter: adapter("witness"),
  });
  const runner = createProductionOutcomeRunnerV1({
    directory: path.join(root, "runtime"), composition, clock: () => CLOCK,
    measureOperations: async () => ({ outsiderStaffTouchCount: 0,
      humanQueueCreated: false, source: "TEST_EXPLICIT_COUNTER" }),
  });
  const program = createFirstCommittedDigitalRealityProgramV1({
    programId: "test_program_node", orderId: "test_order_node", createdAt: CLOCK,
    formationDeadline: "2026-09-05T12:05:00.000Z",
    completionDeadline: "2026-09-05T12:20:00.000Z",
    cleanupDeadline: "2026-09-05T12:30:00.000Z",
    artifactHash: hash("artifact"), observationWindowMs: 60_000,
  });
  const proposal = await runner.proposeProgram(program);
  let confirms = 0;
  const driver = { proposal: runner.proposal, inspectProgram: runner.inspectProgram,
    async confirmAndDrive(value) { confirms += 1; return runner.confirmOutcome(value); } };
  const input = { requestId: proposal.requestId,
    outcomeProgramHash: proposal.programHash,
    graphRefs: Object.fromEntries(["principalEpochHash", "accountableDeploymentHash",
      "runtimeOrEmbodimentHash", "delegationHash", "episodeHash", "attemptHash"]
      .map(key => [key, hash(key)])),
    privateEnvelopeBytes: Buffer.from("local-secret profile and artifact"),
    privateRoot: root, issuedAt: CLOCK, expiresAt: "2026-09-05T13:00:00.000Z" };
  return { calls, driver, input, confirms: () => confirms };
}
function invoke(composition) {
  return composition.executor.executeFrozenPlan({ job: composition.job,
    jobHash: composition.localProjection.jobHash,
    jobKey: composition.localProjection.jobKey });
}

test("whole durable primary failure, recovery, witness and cleanup execute through the generic node binding", async t => {
  const setup = await fixture(t);
  const node = createUserHeldOutcomeProgramComposition(setup.input, { driver: setup.driver });
  const [result, parallel] = await Promise.all([invoke(node), invoke(node)]);
  assert.deepEqual(result, parallel);
  assert.equal(result.state, "COMPLETED");
  assert.equal(result.reasonCode, "DURABLE_OUTCOME_PROGRAM_SUCCEEDED");
  assert.equal(setup.confirms(), 1);
  assert.equal(setup.calls.filter(x => x === "primary:execute").length, 1);
  assert.equal(setup.calls.filter(x => x === "recovery:execute").length, 1);
  const view = node.inspectLocalProgram();
  assert.equal(view.nodes.publish_result.primary, "FAILED");
  assert.equal(view.nodes.publish_result.recovery, "SUCCEEDED");
  assert.equal(view.nodes.sustain_and_observe.witness, "SATISFIED");
  assert.equal(Object.values(view.obligations).every(x => x === "CLOSED"), true);
  assert.equal(Object.values(view.formation).every(x => x.released), true);
  const binding = node.createUserHeldBinding(Buffer.alloc(32, 7));
  const wire = JSON.stringify({ job: binding.job, projection: binding.publicProjection });
  for (const privateValue of ["local-secret", setup.input.requestId,
    "test_program_node"]) {
    assert.equal(wire.includes(privateValue), false);
  }
  assert.equal(node.localProjection.providerIssuedCapacityEstablished, false);
  assert.equal(node.localProjection.commercialCommitmentIssued, false);
});

test("cold terminal replay uses the original durable journal with no provider effect", async t => {
  const setup = await fixture(t);
  const first = createUserHeldOutcomeProgramComposition(setup.input, { driver: setup.driver });
  const expected = await invoke(first);
  const count = setup.calls.length;
  const cold = createUserHeldOutcomeProgramComposition(setup.input, { driver: {
    ...setup.driver, async confirmAndDrive() { throw new Error("must not execute"); },
  } });
  assert.deepEqual(await invoke(cold), expected);
  assert.equal(setup.calls.length, count);
});

test("a lost final return reconciles the completed program instead of rerunning it", async t => {
  const setup = await fixture(t);
  const lost = createUserHeldOutcomeProgramComposition(setup.input, { driver: {
    ...setup.driver, async confirmAndDrive(value) {
      await setup.driver.confirmAndDrive(value); throw new Error("simulated process loss");
    },
  } });
  await assert.rejects(invoke(lost), /simulated process loss/u);
  const count = setup.calls.length;
  const recovered = createUserHeldOutcomeProgramComposition(setup.input, { driver: {
    ...setup.driver, async confirmAndDrive() { throw new Error("no second effect"); },
  } });
  assert.equal((await invoke(recovered)).state, "COMPLETED");
  assert.equal(setup.calls.length, count);
  assert.equal(setup.confirms(), 1);
});

test("a failed and fully closed program is terminal after a lost return, not a local-resume request", async t => {
  const setup = await fixture(t, { recoveryFails: true });
  const first = createUserHeldOutcomeProgramComposition(setup.input, { driver: {
    ...setup.driver, async confirmAndDrive(value) {
      await setup.driver.confirmAndDrive(value); throw new Error("lost closed failure");
    },
  } });
  await assert.rejects(invoke(first), /lost closed failure/u);
  const count = setup.calls.length;
  const cold = createUserHeldOutcomeProgramComposition(setup.input, { driver: {
    ...setup.driver, async confirmAndDrive() { throw new Error("no repeated effects"); },
  } });
  const result = await invoke(cold);
  assert.equal(result.reasonCode, "DURABLE_OUTCOME_PROGRAM_FAILED_CLOSED");
  assert.equal(result.state, "RECOVERY_REQUIRED");
  assert.equal(cold.inspectLocalProgram().state, "FAILED_CLOSED");
  assert.equal(Object.values(cold.inspectLocalProgram().formation).every(x => x.released), true);
  assert.deepEqual(await invoke(cold), result);
  assert.equal(setup.calls.length, count);
});

test("v2 lost terminal return replays without reopening provider credentials", async t => {
  const setup = await fixture(t);
  const input = { ...setup.input, executionMode: "DURABLE_AUTONOMOUS_V2" };
  const driver = { ...setup.driver, prepareDurableExecution() {},
    async confirmAndDriveDurably(value) {
      await setup.driver.confirmAndDrive(value);
      throw new Error("fixture lost final return");
    },
    async resumeAndDrive() { throw new Error("fixture credentials no longer available"); },
  };
  const first = createUserHeldOutcomeProgramComposition(input, { driver });
  await assert.rejects(invoke(first), /lost final return/u);
  const calls = setup.calls.length;
  const cold = createUserHeldOutcomeProgramComposition(input, { driver });
  assert.equal((await invoke(cold)).state, "COMPLETED");
  assert.equal(setup.calls.length, calls);
  assert.equal(first.job.adapterBinding.adapterVersion, "2.0.0");
});
