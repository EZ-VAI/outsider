import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runWorldStateGoalCli } from "../scripts/outsider-world-state-plan.mjs";
import { createObservationCapabilityCatalog } from "../src/outsider-observation-capability-catalog.js";

const NOW = "2026-09-05T12:00:00.000Z";
const MATCHED = { status: "MATCHED", targetIds: ["calcom_availability_report"],
  missingInformation: [], unsupportedOutcomes: [], summary: "Produce an availability report only." };
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-goal-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = { requestId: "goal_cli_fixture", goal: "Produce a timestamped Cal.com sandbox availability report.",
    completionDeadline: "2026-09-05T12:02:00.000Z", budget: { currency: "USD", maximumAmountMinor: "0" } };
  // A test-only source hash; these tests do not claim a real external observation.
  const catalog = createObservationCapabilityCatalog({ observedAt: NOW, expiresAt: "2026-09-05T12:05:00Z",
    calcom: { eventTypeId: 6, start: "2026-09-08T00:00:00Z", end: "2026-09-09T00:00:00Z",
      source: { sourceHash: `sha256:${"c".repeat(64)}`,
        sourceClass: "CALCOM_PUBLIC_SANDBOX_AVAILABILITY", observedAt: NOW } } });
  function write(name, value) {
    const file = path.join(root, name);
    writeFileSync(file, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    return file;
  }
  const requestFile = write("request.json", request), catalogFile = write("catalog.json", catalog);
  function args(outputName, overrides = {}) {
    return ["--goal-input", overrides.requestFile ?? requestFile,
      "--catalog", overrides.catalogFile ?? catalogFile,
      "--runtime", path.join(root, "runtime"), "--output", path.join(root, outputName)];
  }
  return { root, request, catalog, write, args };
}
const read = file => JSON.parse(readFileSync(file, "utf8"));

test("CLI persists the private proposal and a cold invocation replays without calling the model", async t => {
  const fx = fixture(t);
  let calls = 0;
  const first = await runWorldStateGoalCli(fx.args("first.json"), {
    clock: () => NOW, interpretGoal: async () => { calls += 1; return MATCHED; },
  });
  assert.equal(first.status, "PROPOSED");
  assert.equal(first.modelInvocations, 1);
  assert.equal(first.executionReady, false);
  const second = await runWorldStateGoalCli(fx.args("cold.json"), {
    clock: () => NOW, interpretGoal: async () => { throw new Error("must not call model during cold replay"); },
  });
  assert.equal(second.modelInvocations, 0);
  assert.equal(second.programHash, first.programHash);
  assert.equal(second.proposalId, first.proposalId);
  assert.equal(calls, 1);
  const initial = read(first.output), replay = read(second.output);
  assert.deepEqual(replay.compilationRecord, initial.compilationRecord);
  assert.equal(initial.providerEffectsPerformed, 0);
  assert.equal(initial.executionAuthorized, false);
  assert.equal(initial.guaranteeCreated, false);
  assert.equal(initial.paymentAuthorized, false);
  assert.equal(statSync(first.output).mode & 0o777, 0o600);
  const recordDirectory = path.join(fx.root, "runtime", "goal-compilations");
  assert.equal(readdirSync(recordDirectory).length, 1);
  assert.equal(statSync(path.join(recordDirectory, readdirSync(recordDirectory)[0])).mode & 0o777, 0o600);
});

test("same request identity cannot replay with changed request facts or source catalog", async t => {
  const fx = fixture(t);
  const dependencies = { clock: () => NOW, interpretGoal: async () => MATCHED };
  await runWorldStateGoalCli(fx.args("first.json"), dependencies);
  const requestFile = fx.write("changed-request.json", { ...fx.request, goal: "Also reserve a meeting room." });
  await assert.rejects(runWorldStateGoalCli(fx.args("changed-request-result.json", { requestFile }), dependencies),
    /WORLD_STATE_GOAL_REPLAY_MISMATCH/);
  const changedCatalog = structuredClone(fx.catalog);
  changedCatalog.sourceReferences[0].sourceHash = `sha256:${"d".repeat(64)}`;
  const catalogFile = fx.write("changed-catalog.json", changedCatalog);
  await assert.rejects(runWorldStateGoalCli(fx.args("changed-catalog-result.json", { catalogFile }), dependencies),
    /WORLD_STATE_GOAL_REPLAY_MISMATCH/);
});

test("CLI unsupported decision is persistent and cold replay cannot manufacture a proposal", async t => {
  const fx = fixture(t);
  const first = await runWorldStateGoalCli(fx.args("unsupported.json"), { clock: () => NOW,
    interpretGoal: async () => ({ status: "UNSUPPORTED", targetIds: [], missingInformation: [],
      unsupportedOutcomes: ["Book an actual meeting"], summary: "Availability report capability cannot make a booking." }),
  });
  assert.equal(first.status, "UNSUPPORTED");
  assert.equal(first.programHash, null);
  assert.equal(first.nextAction, "NO_MATCHING_CAPABILITY");
  const second = await runWorldStateGoalCli(fx.args("unsupported-cold.json"), { clock: () => NOW,
    interpretGoal: async () => { throw new Error("must not retry unsupported goal during replay"); } });
  assert.equal(second.status, "UNSUPPORTED");
  assert.equal(second.modelInvocations, 0);
  assert.equal(read(second.output).proposal, null);
  assert.equal(read(second.output).compilationRecord.programHash, null);
});

test("automatic observation discovery feeds the runner proposal once and cold replay acquires nothing", async t => {
  const fx = fixture(t), calls = [];
  const discoveryDirectory = path.join(fx.root, "discovered-sources");
  const dependencyDirectory = path.join(fx.root, "fixture-opcua-dependencies");
  function args(outputName) {
    const values = fx.args(outputName);
    const index = values.indexOf("--catalog");
    values.splice(index, 2, "--discover-observations", discoveryDirectory,
      "--opcua-dependencies", dependencyDirectory);
    return values;
  }
  const first = await runWorldStateGoalCli(args("discovered-proposal.json"), {
    clock: () => NOW,
    async discoverCatalog(input) {
      calls.push("DISCOVER");
      assert.deepEqual(input, { directory: discoveryDirectory,
        opcuaDependencyDirectory: dependencyDirectory });
      mkdirSync(input.directory, { mode: 0o700 });
      writeFileSync(path.join(input.directory, "catalog.json"), JSON.stringify(fx.catalog),
        { mode: 0o600, flag: "wx" });
    },
    async interpretGoal(packet) {
      calls.push("INTERPRET");
      assert.deepEqual(packet.capabilityCatalog.sourceReferences, fx.catalog.sourceReferences);
      return MATCHED;
    },
  });
  assert.deepEqual(calls, ["DISCOVER", "INTERPRET"]);
  assert.equal(first.status, "PROPOSED");
  assert.equal(first.discoveryPerformed, true);
  assert.equal(first.modelInvocations, 1);
  assert.equal(read(first.output).proposal.confirmationRequired, true);
  const cold = await runWorldStateGoalCli(args("discovered-cold.json"), {
    clock: () => NOW,
    async discoverCatalog() { throw new Error("cold replay must not acquire sources"); },
    async interpretGoal() { throw new Error("cold replay must not call model"); },
  });
  assert.equal(cold.discoveryPerformed, false);
  assert.equal(cold.modelInvocations, 0);
  assert.equal(cold.programHash, first.programHash);
  assert.equal(cold.proposalId, first.proposalId);
  assert.deepEqual(read(cold.output).compilationRecord, read(first.output).compilationRecord);
  assert.equal(cold.providerEffectsPerformed, 0);
});
