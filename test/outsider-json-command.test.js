import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectJsonResponse,
  runFreshJsonCommand,
} from "../src/outsider-json-command.js";

const requiredName = (value) => typeof value?.name === "string";
const explainName = (value) => typeof value?.name === "string"
  ? [] : ["name must be a string"];

test("JSON transport distinguishes syntax failure from parsed schema failure", () => {
  const malformed = runFreshJsonCommand({
    cmd: ["fake"], input: "prompt", validate: requiredName,
    describeValidationErrors: explainName,
    execute: () => "not JSON at all",
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.failure.kind, "invalid-json");
  assert.deepEqual(malformed.failure.schemaViolations, []);

  const wrongShape = runFreshJsonCommand({
    cmd: ["fake"], input: "original sealed prompt", validate: requiredName,
    describeValidationErrors: explainName,
    execute: () => JSON.stringify({ name: 42 }),
  });
  assert.equal(wrongShape.ok, false);
  assert.equal(wrongShape.failure.kind, "schema-invalid");
  assert.deepEqual(wrongShape.failure.schemaViolations, ["name must be a string"]);
  assert.match(wrongShape.error, /name must be a string/);
  assert.match(wrongShape.retryInput, /original sealed prompt/);
  assert.match(wrongShape.retryInput, /name must be a string/);
});

test("an invalid outer wrapper cannot authorize a valid nested object", () => {
  const response = inspectJsonResponse(JSON.stringify({
    wrapper: { name: "nested-pass" },
  }), requiredName, explainName);
  assert.equal(response.kind, "schema-invalid");
  assert.deepEqual(response.violations, ["name must be a string"]);
});

test("an invalid top-level array cannot authorize its valid nested object", () => {
  const response = inspectJsonResponse(JSON.stringify([{ name: "nested-pass" }]),
    requiredName, explainName);
  assert.equal(response.kind, "schema-invalid");
  assert.deepEqual(response.violations, ["name must be a string"]);
});

test("nested array/object wrappers cannot expose a deeply nested valid authority", () => {
  for (const wrapped of [
    { envelope: [{ name: "nested-pass" }] },
    [{ envelope: { name: "nested-pass" } }],
    [[{ name: "nested-pass" }]],
  ]) {
    const response = inspectJsonResponse(`status\n${JSON.stringify(wrapped)}\n`,
      requiredName, explainName);
    assert.equal(response.kind, "schema-invalid", JSON.stringify(wrapped));
    assert.deepEqual(response.violations, ["name must be a string"]);
  }
});

test("status prose and a single top-level valid JSON object remain supported", () => {
  const response = inspectJsonResponse("finished audit\n```json\n{\"name\":\"verdict\"}\n```",
    requiredName, explainName);
  assert.equal(response.kind, "valid");
  assert.equal(response.value.name, "verdict");
});

test("multiple top-level authority objects are rejected as ambiguous", () => {
  for (const output of [
    '{"name":"first"}\n{"name":"second"}',
    '{"name":42}\n{"name":"second"}',
    '{"name":"first"}\n{"name":42}',
    '{"wrapper":{"name":"nested-pass"}}\n{"name":"second"}',
  ]) {
    const response = inspectJsonResponse(output, requiredName, explainName);
    assert.equal(response.kind, "schema-invalid", output);
    assert.match(response.violations[0], /multiple top-level JSON objects/);
  }
});

test("a malformed top-level wrapper cannot expose an inner or later PASS", () => {
  for (const output of [
    '{malformed\n{"name":"PASS"}',
    '[ broken {"name":"PASS"}',
    '{"name":42\n{"name":"PASS"}',
    '{"name":"PASS"}\n}',
  ]) {
    const response = inspectJsonResponse(output, requiredName, explainName);
    assert.equal(response.kind, "invalid-json", output);
  }
});

test("a first-party 403 after a valid preflight is classified as transient control-plane capacity", () => {
  const denied = new Error("Command failed: claude -p");
  denied.status = 1;
  denied.stderr = "Failed to authenticate. API Error: 403 Request not allowed\n";
  const result = runFreshJsonCommand({
    cmd: ["claude", "-p"], input: "sealed packet", validate: requiredName,
    execute: () => { throw denied; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.retryable, true);
  assert.equal(result.failure.category, "control-plane-capacity");
  assert.equal(result.failure.timedOut, false);
});

test("an evaluation credit guard exhaustion is permanent for that run and is never retried", () => {
  const exhausted = new Error("Command failed: claude -p");
  exhausted.status = 1;
  exhausted.stderr = "CLAUDE_BUDGET_GUARD_INVOCATION_LIMIT:20\n";
  const result = runFreshJsonCommand({
    cmd: ["claude", "-p"], input: "sealed packet", validate: requiredName,
    execute: () => { throw exhausted; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.retryable, false);
  assert.equal(result.failure.category, "evaluation-budget");
});

test("direct argv owns the judge process and returns within its hard timeout", () => {
  const startedAt = Date.now();
  const result = runFreshJsonCommand({
    cmd: [process.execPath, "-e", "setTimeout(() => {}, 10_000)"],
    input: "sealed packet",
    validate: requiredName,
    timeoutMs: 50,
  });
  const elapsedMs = Date.now() - startedAt;
  assert.equal(result.ok, false);
  assert.equal(result.failure.timedOut, true);
  assert.equal(result.failure.category, "control-plane-capacity");
  assert.ok(elapsedMs < 2_000, `hard timeout returned after ${elapsedMs}ms`);
});

test("hard timeout kills a descendant that inherits the judge output pipe", () => {
  const grandchild = `const { spawn } = require("node:child_process");
    spawn(process.execPath, ["-e", "setInterval(() => {}, 10000)"], {
      stdio: ["ignore", "inherit", "inherit"]
    });
    setInterval(() => {}, 10000);`;
  const startedAt = Date.now();
  const result = runFreshJsonCommand({
    cmd: [process.execPath, "-e", grandchild],
    input: "sealed packet",
    validate: requiredName,
    timeoutMs: 100,
  });
  const elapsedMs = Date.now() - startedAt;
  assert.equal(result.ok, false);
  assert.equal(result.failure.timedOut, true);
  assert.equal(result.failure.category, "control-plane-capacity");
  assert.ok(elapsedMs < 2_000, `process-group timeout returned after ${elapsedMs}ms`);
});
