#!/usr/bin/env node
/* One explicitly scoped fault injection for a qualification, not a scheduler,
 * production retry mechanism or replacement for the original executor.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce }
  from "../src/outsider-user-held-durable-execution-v2.js";

const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const taskIdPattern = /^task_[a-f0-9]{32}$/u;

export function resolveDigitalNodeInterruptionScope({ serviceConfig, sessionDirectory, expectedNewSiblingTaskIds = [] }) {
  if (!Array.isArray(expectedNewSiblingTaskIds)) fail("INFLIGHT_SIBLING_SCOPE_INVALID");
  if (typeof serviceConfig.sessionDirectory === "string") {
    assert.equal(path.resolve(serviceConfig.sessionDirectory), path.resolve(sessionDirectory));
    if (expectedNewSiblingTaskIds.length) fail("INFLIGHT_SIBLING_SCOPE_INVALID");
    return { kind: "SINGLE_SESSION", taskId: null, newSiblings: [] };
  }
  if (typeof serviceConfig.nodeDirectory !== "string" || !path.isAbsolute(serviceConfig.nodeDirectory))
    fail("INFLIGHT_NODE_SCOPE_INVALID");
  const tasksDirectory = path.join(path.resolve(serviceConfig.nodeDirectory), "tasks");
  const session = path.resolve(sessionDirectory), folder = path.dirname(session), taskId = path.basename(folder);
  if (!taskIdPattern.test(taskId) || session !== path.join(tasksDirectory, taskId, "session"))
    fail("INFLIGHT_NODE_SCOPE_INVALID");
  const task = read(path.join(folder, "task.json"));
  if (task.schema !== "outsider/private-digital-goal-node-task/v1" || task.taskId !== taskId
    || typeof task.request?.requestId !== "string") fail("INFLIGHT_NODE_TASK_INVALID");
  const newSiblings = expectedNewSiblingTaskIds.map(siblingId => {
    if (!taskIdPattern.test(siblingId) || siblingId === taskId) fail("INFLIGHT_SIBLING_SCOPE_INVALID");
    const siblingFolder = path.join(tasksDirectory, siblingId), sibling = read(path.join(siblingFolder, "task.json"));
    if (sibling.schema !== "outsider/private-digital-goal-node-task/v1" || sibling.taskId !== siblingId
      || sibling.configHash !== task.configHash || typeof sibling.request?.requestId !== "string")
      fail("INFLIGHT_SIBLING_SCOPE_INVALID");
    if (["preparation.json", "confirmation.json", "execution-started.json", "result.json"]
      .some(file => existsSync(path.join(siblingFolder, "session", file)))
      || existsSync(path.join(siblingFolder, "activation", "activation.json")))
      fail("INFLIGHT_SIBLING_NOT_NEW");
    return { taskId: siblingId, requestId: sibling.request.requestId, state: "NEW", taskRecordHash: hash(Buffer.from(JSON.stringify(sibling))) };
  });
  return { kind: "MULTI_TASK_NODE", taskId, requestId: task.request.requestId, newSiblings };
}

export function assessDigitalObservationInterruption(events, nowMs = Date.now()) {
  const tail = events.at(-1);
  const completions = events.filter(x => x.eventType === "NODE_EFFECT_COMPLETED"
    && x.payload.nodeId === "publish_result");
  const reservations = events.filter(x => x.eventType === "RESERVATION_CONFIRMED");
  const safe = reservations.length === 3
    && new Set(reservations.map(x => x.payload.requirementId)).size === 3
    && completions.length === 2
    && completions.some(x => x.payload.route === "PRIMARY" && x.payload.result.status === "FAILED")
    && completions.some(x => x.payload.route === "RECOVERY" && x.payload.result.status === "SUCCEEDED")
    && events.some(x => x.eventType === "NODE_WITNESS_COMPLETED"
      && x.payload.nodeId === "publish_result" && x.payload.observation.status === "SATISFIED")
    && !events.some(x => ["CLOSURE_STARTED", "PROGRAM_SUCCEEDED", "PROGRAM_UNAVAILABLE", "PROGRAM_FAILED", "PROGRAM_FAILED_CLOSED"]
      .includes(x.eventType))
    && tail?.eventType === "NODE_WITNESS_INCONCLUSIVE"
    && tail.payload.nodeId === "sustain_and_observe"
    && tail.payload.observation.status === "INCONCLUSIVE"
    && tail.payload.observation.reason === "OBSERVATION_WINDOW_OPEN"
    && Date.parse(tail.payload.observation.retryAfter) > nowMs + 60000;
  return { safe: Boolean(safe), eventCount: events.length,
    journalHeadHash: tail?.eventHash ?? null,
    observation: safe ? tail.payload.observation : null,
    completedEffectOperationIds: completions.map(x => x.payload.operationId),
    reservationIds: reservations.map(x => x.payload.reservation.reservationId),
  };
}

export function interruptDigitalNodeAtObservation({ sessionDirectory, stageReportFile, outputFile, expectedNewSiblingTaskIds = [] }) {
  if (existsSync(outputFile)) fail("INFLIGHT_FAULT_ALREADY_RECORDED");
  const p = read(path.join(sessionDirectory, "preparation.json"));
  const confirmation = read(path.join(sessionDirectory, "confirmation.json"));
  const activation = read(path.join(p.productionInput.activationDirectory, "activation.json"));
  const stage = read(stageReportFile), serviceConfig = read(stage.configFile);
  assert.equal(stage.readOnly, false); assert.equal(serviceConfig.resumeConfirmedOnStart, true);
  const serviceScope = resolveDigitalNodeInterruptionScope({ serviceConfig, sessionDirectory, expectedNewSiblingTaskIds });
  assert.equal(confirmation.programHash, p.proposal.programHash);
  assert.equal(confirmation.preparationHash, p.preparationHash);
  assert.equal(confirmation.executionConfirmed, true);
  assert.equal(activation.programHash, p.proposal.programHash);
  assert.equal(activation.executionMode, "DURABLE_AUTONOMOUS_V2");
  assert.match(stage.label, /^ai\.outsider\.digital-goal\.node\.[a-f0-9]+$/u);
  const journal = path.join(p.productionInput.runtimeDirectory, "executions",
    `${createHash("sha256").update(p.proposal.programId).digest("hex")}.events.jsonl`);
  const bytes = readPrivateExecutionBytes(journal);
  if (!bytes.toString().endsWith("\n")) fail("INFLIGHT_JOURNAL_APPEND_IN_PROGRESS");
  const events = bytes.toString().trim().split("\n").map(JSON.parse);
  const assessment = assessDigitalObservationInterruption(events);
  if (!assessment.safe) fail("INFLIGHT_OBSERVATION_POINT_NOT_READY");
  const target = `gui/${process.getuid()}/${stage.label}`;
  const state = spawnSync("/bin/launchctl", ["print", target], { encoding: "utf8", timeout: 5000 });
  const pid = Number(state.stdout?.match(/^\s*pid = (\d+)$/mu)?.[1]);
  if (state.status !== 0 || !Number.isSafeInteger(pid) || pid < 1) fail("INFLIGHT_OWNED_SERVICE_NOT_RUNNING");
  const before = { schema: "outsider/digital-goal-inflight-fault-request/v1",
    recordedAt: new Date().toISOString(), fault: "SIGKILL_OWNED_NODE_DURING_RECONCILED_OBSERVATION",
    label: stage.label, pid, programHash: p.proposal.programHash, preparationHash: p.preparationHash,
    jobHash: activation.jobHash, attemptHash: activation.attemptHash,
    prefix: { bytes: bytes.length, hash: hash(bytes) }, ...assessment, serviceScope,
    qualificationControllerFaultInjection: true, noProviderCommandInjected: true,
    paymentAuthorized: false, duplicateFaultForbidden: true };
  writePrivateExecutionRecordOnce(outputFile, before);
  const killed = spawnSync("/bin/launchctl", ["kill", "SIGKILL", target],
    { encoding: "utf8", timeout: 5000 });
  const receipt = { schema: "outsider/digital-goal-inflight-fault-command/v1",
    recordedAt: new Date().toISOString(), label: stage.label, pid,
    commandExitCode: killed.status, transportStatus: killed.status === 0 ? "ACCEPTED" : "UNKNOWN_DO_NOT_REPEAT",
    automaticallyResumed: null, paymentActions: 0 };
  writePrivateExecutionRecordOnce(`${outputFile}.command.json`, receipt);
  return { before, receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [sessionDirectory, stageReportFile, outputFile, ...extra] = process.argv.slice(2);
    assert.ok(sessionDirectory && stageReportFile && outputFile && !extra.length);
    console.log(JSON.stringify(interruptDigitalNodeAtObservation({ sessionDirectory, stageReportFile, outputFile }), null, 2));
  } catch (error) {
    console.error(/^INFLIGHT_[A-Z_]+$/u.test(error.code ?? "") ? error.code : "INFLIGHT_QUALIFICATION_FAILED");
    process.exitCode = 1;
  }
}
