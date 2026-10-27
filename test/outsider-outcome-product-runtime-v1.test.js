import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { createOutsiderOutcomeProductRuntimeV1 }
  from "../src/outsider-outcome-product-runtime-v1.js";

const ARTIFACT_HASH = `sha256:${"a".repeat(64)}`;

test("one goal and one confirmation reach the durable orchestrator", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-product-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const orchestrator = {
    async run(program, runOptions) {
      calls.push({ kind: "run", program, runOptions });
      return { state: "SUCCEEDED", programHash: program.programHash };
    },
    async resume(programId) {
      calls.push({ kind: "resume", programId });
      return { state: "SUCCEEDED", programId };
    },
  };
  const runtime = createOutsiderOutcomeProductRuntimeV1({
    directory,
    orchestrator,
    clock: () => "2026-09-03T12:00:00.000Z",
    compileGoal(request) {
      return createFirstCommittedDigitalRealityProgramV1({
        programId: `program_${request.requestId}`,
        orderId: request.requestId,
        createdAt: request.requestedAt,
        formationDeadline: "2026-09-03T12:10:00.000Z",
        completionDeadline: request.completionDeadline,
        cleanupDeadline: "2026-09-03T12:40:00.000Z",
        artifactHash: ARTIFACT_HASH,
        currency: request.budget.currency,
        maximumAmountMinor: request.budget.maximumAmountMinor,
        statement: request.goal,
      });
    },
  });

  const request = {
    requestId: "first_real_order",
    goal: "Publish the exact artifact for ten minutes, with recovery.",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    budget: { currency: "USD", maximumAmountMinor: "0" },
  };
  const proposal = await runtime.requestOutcome(request);
  assert.equal(proposal.nextAction, "CONFIRM_ONCE");
  assert.equal(proposal.resourceRoles.length, 3);
  assert.equal(calls.length, 0);

  const result = await runtime.confirmOutcome({
    requestId: request.requestId,
    programHash: proposal.programHash,
  }, { bindings: { primary_publication: "cloudflare" } });
  assert.equal(result.state, "SUCCEEDED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].program.programHash, proposal.programHash);

  const replay = await runtime.confirmOutcome({
    requestId: request.requestId,
    programHash: proposal.programHash,
  });
  assert.equal(replay.state, "SUCCEEDED");
  assert.equal(calls.length, 2);
  const privateFiles = (await import("node:fs")).readdirSync(directory);
  assert.equal(privateFiles.length, 2);
  for (const file of privateFiles) {
    assert.equal(statSync(path.join(directory, file)).mode & 0o777, 0o600);
  }
  assert.equal(readFileSync(path.join(directory, privateFiles[0]), "utf8")
    .includes(request.goal) || readFileSync(
      path.join(directory, privateFiles[1]), "utf8").includes(request.goal), true);
});

test("a changed goal cannot reuse a durable request id", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-product-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const runtime = createOutsiderOutcomeProductRuntimeV1({
    directory,
    orchestrator: { run() {}, resume() {} },
    clock: () => "2026-09-03T12:00:00.000Z",
    compileGoal(request) {
      return createFirstCommittedDigitalRealityProgramV1({
        programId: `program_${request.requestId}`,
        orderId: request.requestId,
        createdAt: request.requestedAt,
        formationDeadline: "2026-09-03T12:10:00.000Z",
        completionDeadline: request.completionDeadline,
        cleanupDeadline: "2026-09-03T12:40:00.000Z",
        artifactHash: ARTIFACT_HASH,
        statement: request.goal,
      });
    },
  });
  const base = { requestId: "same_order", goal: "goal one",
    completionDeadline: "2026-09-03T12:30:00.000Z" };
  await runtime.requestOutcome(base);
  await assert.rejects(runtime.requestOutcome({ ...base, goal: "goal two" }),
    /REQUEST_ID_REUSED/);
});
