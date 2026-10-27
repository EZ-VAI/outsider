import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runWorldStatePlanCli } from "../scripts/outsider-world-state-plan.mjs";
import { createWorldStateResourceNetworkExample } from "../examples/world-state-resource-network.mjs";
import { compileWorldStateResourcePlan } from "../src/outsider-world-state-program-compiler.js";
import { verifyOutcomeProgramV1 } from "../src/outsider-outcome-program-v1.js";

test("one command compiles the synthetic multiresource example without provider I/O or artifact overwrite", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-world-state-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "program.json");
  const args = ["--example", "--compile", "--output", file];
  const result = runWorldStatePlanCli(args);
  assert.equal(result.externalEffectsPerformed, 0);
  assert.equal(result.syntheticExample, true);
  const compiled = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(compiled.program.nodes.length, 8);
  assert.equal(compiled.program.requirements.length, 22);
  assert.equal(compiled.planningResult.plans.length, 4);
  assert.equal(compiled.planningResult.plans[0].makespanMs, 15 * 60_000);
  assert.equal(compiled.planningResult.plans[0].totalCostMinor, "93500");
  assert.equal(compiled.planningResult.recoveryScenarios[0].status, "FEASIBLE");
  assert.equal(verifyOutcomeProgramV1(compiled.program).programHash, result.programHash);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const original = readFileSync(file);
  assert.throws(() => runWorldStatePlanCli(args), /EEXIST/u);
  assert.deepEqual(readFileSync(file), original);
});

test("compilation may not silently relax the declared planning deadline", () => {
  const input = createWorldStateResourceNetworkExample();
  input.programInput.completionDeadline = new Date(
    Date.parse(input.programInput.completionDeadline) + 1).toISOString();
  assert.throws(() => compileWorldStateResourcePlan(input), /PROGRAM_WINDOW_RELAXES_PLANNED_DEADLINE/u);
});
