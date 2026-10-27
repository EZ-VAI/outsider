import test from "node:test";
import assert from "node:assert/strict";
import { createWorldStateGoalCommandInterpreter } from "../src/outsider-world-state-goal-model.js";

const packet = () => ({
  schema: "outsider/world-state-goal-interpretation-packet/v1",
  goal: "Make the report available until tomorrow.",
  catalog: { semanticTargets: [{ targetId: "report_available", authorityMinted: false }] },
  responseSchema: { type: "object", required: ["status", "targetIds"] },
});
const response = { status: "MATCHED", targetIds: ["report_available"],
  missingInformation: [], unsupportedOutcomes: [], summary: "Publish the report." };
const validateResponse = value => value?.status === "MATCHED"
  && Array.isArray(value.targetIds) && value.targetIds.length > 0
  && value.targetIds.every(targetId => targetId === "report_available")
  && Array.isArray(value.missingInformation) && value.missingInformation.length === 0
  && Array.isArray(value.unsupportedOutcomes) && value.unsupportedOutcomes.length === 0
  && typeof value.summary === "string";
const factory = options => createWorldStateGoalCommandInterpreter({
  command: ["configured-model", "--json"], validateResponse, ...options,
});

test("configured argv gets one typed packet and returns one validated response", async () => {
  const calls = [];
  const command = ["configured-model", "--json"];
  const interpret = factory({ command, execute: (...args) => {
    calls.push(args);
    return `model finished\n${JSON.stringify(response)}`;
  } });
  command[0] = "different-command";
  assert.deepEqual(await interpret(packet()), response);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "configured-model");
  assert.deepEqual(calls[0][1], ["--json"]);
  assert.deepEqual(JSON.parse(calls[0][2].input), packet());
  assert.equal(calls[0][2].timeout, 60_000);
});

test("schema failure does not retry or leak model content into errors", async () => {
  let calls = 0;
  const interpret = factory({ execute: () => {
    calls += 1;
    return JSON.stringify({ privateData: "private-response-content" });
  } });
  await assert.rejects(interpret(packet()), error => {
    assert.equal(error.code, "OUTSIDER_WORLD_STATE_GOAL_MODEL_SCHEMA_INVALID");
    assert.equal(error.failure.kind, "schema-invalid");
    assert.equal(error.failure.retryable, true);
    assert.equal(JSON.stringify(error).includes("private-response-content"), false);
    assert.equal(error.message.includes(packet().goal), false);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(calls, 1);
});

test("malformed and multiple authority objects are rejected without repair calls", async () => {
  for (const output of ["not-json", `${JSON.stringify(response)}\n${JSON.stringify(response)}`]) {
    let calls = 0;
    const interpret = factory({ execute: () => { calls += 1; return output; } });
    await assert.rejects(interpret(packet()), /OUTSIDER_WORLD_STATE_GOAL_MODEL_(INVALID_JSON|SCHEMA_INVALID)/);
    assert.equal(calls, 1);
  }
});

test("process timeout retains retry facts without exposing stderr or command details", async () => {
  const interpret = factory({ execute: () => {
    const error = new Error("private command timed out");
    error.code = "ETIMEDOUT";
    error.status = null;
    error.signal = "SIGTERM";
    error.stderr = "private stderr";
    error.stdout = "private stdout";
    throw error;
  } });
  await assert.rejects(interpret(packet()), error => {
    assert.deepEqual(error.failure, {
      kind: "process", category: "control-plane-capacity", timedOut: true,
      retryable: true, status: null, signal: "SIGTERM",
    });
    assert.equal(JSON.stringify(error).includes("private"), false);
    return true;
  });
});

test("invalid configuration and non-JSON or oversized packet never start a process", async () => {
  let calls = 0;
  const execute = () => { calls += 1; return JSON.stringify(response); };
  assert.throws(() => factory({ command: "model --json" }), /ARGV_REQUIRED/);
  assert.throws(() => factory({ command: [] }), /ARGV_REQUIRED/);
  assert.throws(() => factory({ timeoutMs: 120_001 }), /TIMEOUT_OUT_OF_RANGE/);
  assert.throws(() => factory({ validateResponse: undefined }), /RESPONSE_VALIDATOR_REQUIRED/);
  const interpret = factory({ execute });
  const cyclic = {}; cyclic.self = cyclic;
  for (const value of [cyclic, { goal: undefined }, { goal: "x".repeat(256 * 1024) }]) {
    await assert.rejects(interpret(value), /PACKET_(NOT_STRICT_JSON|TOO_LARGE)/);
  }
  await assert.rejects(interpret([]), /PACKET_OBJECT_REQUIRED/);
  assert.equal(calls, 0);
});

test("existing managed command runner works without any model provider dependency", async () => {
  const interpret = factory({
    command: [process.execPath, "-e", `let input = "";
      process.stdin.on("data", chunk => { input += chunk; });
      process.stdin.on("end", () => {
        const packet = JSON.parse(input);
        process.stdout.write(JSON.stringify({ status: "MATCHED",
          targetIds: [packet.catalog.semanticTargets[0].targetId],
          missingInformation: [], unsupportedOutcomes: [], summary: "Publish the report." }));
      });`],
    timeoutMs: 1000,
  });
  assert.deepEqual(await interpret(packet()), response);
});
