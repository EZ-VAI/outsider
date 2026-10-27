import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createFormationPreflightReadinessObserver }
  from "../src/outsider-formation-preflight-readiness-observer.js";

function setup(t, callback, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-preflight-readiness-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let now = Date.parse("2026-09-05T12:00:00.000Z");
  const calls = [];
  const input = { directory, formationDeadline: "2026-09-05T12:05:00.000Z",
    clock: () => new Date(now).toISOString(), wait: async ms => { now += ms; },
    observer: { providerRef: "test-independent-observer",
      async observe(command) { calls.push(command); return callback(calls.length, command); } },
    ...options };
  return { input, calls, directory, observer: createFormationPreflightReadinessObserver(input) };
}
const command = { operationId: "test-reserve:EXACT_PREFLIGHT", targetUrl: "https://test.invalid/" };
function unavailable(code = "EXACT_FINAL_BODY_UNAVAILABLE") {
  const error = new Error(code); error.outsiderCode = code; throw error;
}

test("two rejected independent reads lead to a third exact observation and retained occurrence denominator", async t => {
  const receipt = { status: 200, bodyHash: "sha256:exact" };
  const state = setup(t, ordinal => ordinal < 3 ? unavailable() : receipt);
  assert.deepEqual(await state.observer.observe(command), receipt);
  assert.equal(new Set(state.calls.map(x => x.operationId)).size, 3);
  const records = readdirSync(state.directory).map(x => JSON.parse(readFileSync(path.join(state.directory, x))));
  assert.equal(records.filter(x => x.disposition === "REJECTED_SOURCE_OBSERVATION").length, 2);
  assert.equal(records.filter(x => x.disposition === "SOURCE_OBSERVED").length, 1);
  const cold = createFormationPreflightReadinessObserver({ ...state.input,
    observer: { providerRef: "test-independent-observer", async observe(value) {
      assert.equal(value.operationId, state.calls[2].operationId); return receipt;
    } } });
  assert.deepEqual(await cold.observe(command), receipt);
});

test("source-read budget and original formation deadline both stop new observations", async t => {
  const budget = setup(t, () => unavailable());
  await assert.rejects(budget.observer.observe(command), /EXACT_FINAL_BODY_UNAVAILABLE/u);
  assert.equal(budget.calls.length, 3);
  const deadline = setup(t, () => unavailable(), { formationDeadline: "2026-09-05T12:00:04.000Z" });
  await assert.rejects(deadline.observer.observe(command), /EXACT_FINAL_BODY_UNAVAILABLE/u);
  assert.equal(deadline.calls.length, 1);
});

test("ambiguous measurement creation is not retried, and post-formation outcome observations keep original identity", async t => {
  const state = setup(t, () => unavailable("MEASUREMENT_CREATE_TIMEOUT"));
  await assert.rejects(state.observer.observe(command), /MEASUREMENT_CREATE_TIMEOUT/u);
  assert.equal(state.calls.length, 1);
  const original = { operationId: "test:OUTCOME_OBSERVATION", targetUrl: command.targetUrl };
  await assert.rejects(state.observer.observe(original), /MEASUREMENT_CREATE_TIMEOUT/u);
  assert.deepEqual(state.calls[1], original);
});
