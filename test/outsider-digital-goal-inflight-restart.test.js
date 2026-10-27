import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assessDigitalObservationInterruption, resolveDigitalNodeInterruptionScope }
  from "../scripts/qualify-digital-goal-inflight-restart.mjs";

const NOW = Date.parse("2026-09-05T19:00:00.000Z");
const copy = value => JSON.parse(JSON.stringify(value));

test("interruption scope selects only an exact multi-task session and records an untouched NEW sibling", t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-inflight-scope-")); chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const active = `task_${"a".repeat(32)}`, sibling = `task_${"b".repeat(32)}`;
  for (const taskId of [active, sibling]) {
    const folder = path.join(directory, "tasks", taskId); mkdirSync(folder, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(folder, "task.json"), JSON.stringify({ schema: "outsider/private-digital-goal-node-task/v1",
      taskId, configHash: "same-configuration", request: { requestId: taskId } }), { mode: 0o600 });
  }
  const args = { serviceConfig: { nodeDirectory: directory },
    sessionDirectory: path.join(directory, "tasks", active, "session"), expectedNewSiblingTaskIds: [sibling] };
  const result = resolveDigitalNodeInterruptionScope(args);
  assert.equal(result.kind, "MULTI_TASK_NODE"); assert.equal(result.taskId, active);
  assert.equal(result.newSiblings[0].state, "NEW");
  assert.throws(() => resolveDigitalNodeInterruptionScope({ ...args,
    sessionDirectory: path.join(directory, "unrelated", active, "session") }), { code: "INFLIGHT_NODE_SCOPE_INVALID" });
  const siblingSession = path.join(directory, "tasks", sibling, "session"); mkdirSync(siblingSession, { mode: 0o700 });
  writeFileSync(path.join(siblingSession, "execution-started.json"), "{}", { mode: 0o600 });
  assert.throws(() => resolveDigitalNodeInterruptionScope(args), { code: "INFLIGHT_SIBLING_NOT_NEW" });
  assert.equal(resolveDigitalNodeInterruptionScope({ serviceConfig: { sessionDirectory: args.sessionDirectory },
    sessionDirectory: args.sessionDirectory }).kind, "SINGLE_SESSION");
});
function fixture() {
  const reservations = ["primary_publication", "recovery_publication", "independent_http_witness"]
    .map((requirementId, index) => ({ eventType: "RESERVATION_CONFIRMED",
      payload: { requirementId, reservation: { reservationId: `reservation_${index}` } } }));
  const completions = [["PRIMARY", "FAILED"], ["RECOVERY", "SUCCEEDED"]]
    .map(([route, status]) => ({ eventType: "NODE_EFFECT_COMPLETED",
      payload: { nodeId: "publish_result", route, operationId: `effect_${route}`, result: { status } } }));
  return [...reservations, ...completions,
    { eventType: "NODE_WITNESS_COMPLETED", payload: { nodeId: "publish_result",
      observation: { status: "SATISFIED" } } },
    { eventType: "NODE_WITNESS_INCONCLUSIVE", eventHash: `sha256:${"a".repeat(64)}`,
      payload: { nodeId: "sustain_and_observe", observation: { status: "INCONCLUSIVE",
        reason: "OBSERVATION_WINDOW_OPEN", windowStartedAt: "2026-09-05T19:00:00.000Z",
        retryAfter: "2026-09-05T19:10:00.000Z", observationWindowMs: 600000 } } },
  ];
}

test("qualifies only the recorded post-recovery observation checkpoint and returns its identities", () => {
  const events = fixture(), original = copy(events);
  const assessed = assessDigitalObservationInterruption(events, NOW);
  assert.equal(assessed.safe, true);
  assert.equal(assessed.eventCount, 7);
  assert.equal(assessed.journalHeadHash, events.at(-1).eventHash);
  assert.deepEqual(assessed.observation, events.at(-1).payload.observation);
  assert.deepEqual(assessed.completedEffectOperationIds, ["effect_PRIMARY", "effect_RECOVERY"]);
  assert.deepEqual(assessed.reservationIds, ["reservation_0", "reservation_1", "reservation_2"]);
  assert.deepEqual(events, original);
});

test("missing or duplicate reservations and execution completions cannot qualify", () => {
  const variants = [
    events => events.splice(0, 1),
    events => events.splice(0, 0, copy(events[0])),
    events => { events[1].payload.requirementId = events[0].payload.requirementId; },
    events => events.splice(3, 1),
    events => events.splice(3, 0, copy(events[3])),
    events => { events[4].payload.route = "PRIMARY"; },
    events => { events[4].payload.result.status = "FAILED"; },
    events => { events[3].payload.result.status = "SUCCEEDED"; },
  ];
  for (const mutate of variants) {
    const events = fixture(); mutate(events);
    const assessed = assessDigitalObservationInterruption(events, NOW);
    assert.equal(assessed.safe, false);
    assert.equal(assessed.observation, null);
  }
});

test("closure, terminal history or an observation horizon at most sixty seconds away cannot qualify", () => {
  for (const eventType of ["CLOSURE_STARTED", "PROGRAM_SUCCEEDED", "PROGRAM_FAILED",
    "PROGRAM_FAILED_CLOSED", "PROGRAM_UNAVAILABLE"]) {
    const events = fixture();
    events.splice(-1, 0, { eventType, payload: {} });
    assert.equal(assessDigitalObservationInterruption(events, NOW).safe, false, eventType);
  }
  for (const retryAfter of [new Date(NOW - 1).toISOString(), new Date(NOW + 60000).toISOString(),
    "not-a-timestamp", null]) {
    const events = fixture(); events.at(-1).payload.observation.retryAfter = retryAfter;
    assert.equal(assessDigitalObservationInterruption(events, NOW).safe, false, String(retryAfter));
  }
  assert.equal(assessDigitalObservationInterruption([], NOW).safe, false);
});

test("missing publication witness or the wrong latest witness phase cannot qualify", () => {
  const variants = [
    events => events.splice(5, 1),
    events => { events[5].payload.observation.status = "INCONCLUSIVE"; },
    events => { events.at(-1).payload.nodeId = "close_episode"; },
    events => { events.at(-1).payload.observation.reason = "CONTINUOUS_WINDOW_NOT_DUE"; },
    events => { events.at(-1).payload.observation.status = "SATISFIED"; },
    events => events.push({ eventType: "NODE_WITNESS_REQUESTED", payload: { nodeId: "sustain_and_observe" } }),
  ];
  for (const mutate of variants) {
    const events = fixture(); mutate(events);
    assert.equal(assessDigitalObservationInterruption(events, NOW).safe, false);
  }
});
