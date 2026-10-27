import assert from "node:assert/strict";
import test from "node:test";

import {
  compileOutcomeProgramV1,
  verifyOutcomeProgramV1,
} from "../src/outsider-outcome-program-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";

const HASH = `sha256:${"a".repeat(64)}`;

function milestone(overrides = {}) {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "program_first_reality_001",
    orderId: "order_first_reality_001",
    createdAt: "2026-09-03T12:00:00.000Z",
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash: HASH,
    tenderHash: `sha256:${"b".repeat(64)}`,
    observationWindowMs: 600_000,
    ...overrides,
  });
}

test("first milestone is a provider-neutral, three-role executable DAG", () => {
  const program = milestone();
  assert.equal(verifyOutcomeProgramV1(program).programHash,
    program.programHash);
  assert.deepEqual(program.executionOrder,
    ["publish_result", "sustain_and_observe", "close_episode"]);
  assert.deepEqual(new Set(program.requirements.map((item) => item.role)),
    new Set(["PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS"]));
  assert.equal(program.requirements.length, 3);
  assert.deepEqual(program.requirements[2].dependsOnRequirementIds,
    ["primary_publication", "recovery_publication"]);
  assert.equal(JSON.stringify(program).includes("Cloudflare"), false);
  assert.equal(JSON.stringify(program).includes("GitHub"), false);
  assert.equal(JSON.stringify(program).includes("UptimeRobot"), false);
});

test("same input produces the same sealed program", () => {
  assert.deepEqual(milestone(), milestone());
});

test("tampering with an acceptance target invalidates replay", () => {
  const program = structuredClone(milestone());
  program.outcome.acceptance[0].expected = 204;
  assert.throws(() => verifyOutcomeProgramV1(program),
    /PROGRAM_HASH_OR_CONTENT_INVALID/);
});

test("program rejects a dependency cycle", () => {
  const program = milestone();
  const input = structuredClone(program);
  delete input.schema;
  delete input.executionOrder;
  delete input.programHash;
  input.nodes[0].dependsOn = ["close_episode"];
  assert.throws(() => compileOutcomeProgramV1(input), /NODE_GRAPH_CYCLIC/);
});

test("program requires no staff queue", () => {
  const program = milestone();
  const input = structuredClone(program);
  delete input.schema;
  delete input.executionOrder;
  delete input.programHash;
  input.zeroInternalOps.humanQueueFallback = true;
  assert.throws(() => compileOutcomeProgramV1(input),
    /ZERO_INTERNAL_OPS_REQUIRED/);
});
