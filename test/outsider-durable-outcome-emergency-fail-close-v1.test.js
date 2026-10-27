import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { createDurableOutcomeEmergencyFailCloseV1,
  OUTSIDER_DURABLE_OUTCOME_EMERGENCY_FAIL_CLOSE_V1_SCHEMA }
  from "../src/outsider-durable-outcome-emergency-fail-close-v1.js";
import { createDurableOutcomeProgramOrchestratorV1 }
  from "../src/outsider-durable-outcome-program-orchestrator-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";

const CLOCK = "2026-09-04T12:01:00.000Z";
const HASH = `sha256:${"a".repeat(64)}`;

function eventHash(body) {
  return `sha256:${createHash("sha256")
    .update(`${body.schema}\0${canonicalizeStrict(body)}`, "utf8")
    .digest("hex")}`;
}

function program(programId) {
  return createFirstCommittedDigitalRealityProgramV1({
    programId,
    orderId: `order_${programId}`,
    createdAt: "2026-09-04T12:00:00.000Z",
    formationDeadline: "2026-09-04T12:10:00.000Z",
    completionDeadline: "2026-09-04T12:30:00.000Z",
    cleanupDeadline: "2026-09-04T12:40:00.000Z",
    artifactHash: HASH,
    tenderHash: `sha256:${"b".repeat(64)}`,
    observationWindowMs: 600_000,
  });
}

function fixture(t, { failReleaseOnce = false } = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-emergency-fail-close-v1-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [];
  let releasesToFail = failReleaseOnce ? 1 : 0;

  function common(adapterId) {
    return {
      adapterId,
      providerRef: adapterId,
      async reserve({ requirement, operationId }) {
        calls.push(["reserve", adapterId, requirement.requirementId,
          operationId]);
        return {
          status: "RESERVED",
          reservationId: `reservation:${adapterId}`,
          validUntil: "2026-09-04T13:00:00.000Z",
          providerReceipt: { adapterId, accepted: true },
          adapterState: { route: `route:${adapterId}` },
        };
      },
      async closeObligation({ obligation, operationId }) {
        calls.push(["close", adapterId, obligation.obligationId,
          operationId]);
        return { status: "CLOSED", receipt: { adapterId } };
      },
      async release({ requirement, operationId, disposition }) {
        calls.push(["release", adapterId, requirement.requirementId,
          operationId, disposition]);
        if (adapterId === "primary.fake" && releasesToFail > 0) {
          releasesToFail -= 1;
          throw new Error("ambiguous provider acknowledgement");
        }
        return { status: "RELEASED", receipt: { adapterId } };
      },
    };
  }

  const primary = {
    ...common("primary.fake"),
    async execute({ operationId }) {
      calls.push(["execute", "primary.fake", operationId]);
      return { status: "FAILED", receipt: { reason: "CONTROLLED" } };
    },
  };
  const recovery = {
    ...common("recovery.fake"),
    async execute({ operationId }) {
      calls.push(["execute", "recovery.fake", operationId]);
      return { status: "SUCCEEDED", effectRef: "recovery-effect" };
    },
  };
  const witness = {
    ...common("witness.fake"),
    async observe({ node, operationId, observationOccurrence }) {
      calls.push(["observe", "witness.fake", node.nodeId, operationId,
        observationOccurrence]);
      return {
        status: "INCONCLUSIVE",
        reason: "DETERMINISTIC_REDIRECT_INCOMPATIBILITY",
      };
    },
  };
  const adapters = {
    "primary.fake": primary,
    "recovery.fake": recovery,
    "witness.fake": witness,
  };
  const orchestrator = createDurableOutcomeProgramOrchestratorV1({
    directory: root,
    adapters,
    clock: () => CLOCK,
    async discover({ requirement }) {
      return {
        adapterId: {
          primary_publication: "primary.fake",
          recovery_publication: "recovery.fake",
          independent_http_witness: "witness.fake",
        }[requirement.requirementId],
      };
    },
    measureOperations: async () => ({
      outsiderStaffTouchCount: 0,
      humanQueueCreated: false,
      source: "AUTONOMOUS_TEST_DRIVER",
    }),
  });
  return { root, calls, orchestrator };
}

function journal(root) {
  const file = readdirSync(root).map((name) => path.join(root, name))
    .find((name) => name.endsWith(".events.jsonl"));
  return readFileSync(file, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line));
}

function requestFor(projection, overrides = {}) {
  return {
    schema: OUTSIDER_DURABLE_OUTCOME_EMERGENCY_FAIL_CLOSE_V1_SCHEMA,
    schemaVersion: "1.0.0",
    interventionId: `intervention_${projection.programId}`,
    requestId: `order_${projection.programId}`,
    programId: projection.programId,
    programHash: projection.programHash,
    expectedEventCount: projection.eventCount,
    expectedJournalHeadHash: projection.journalHeadHash,
    blockedNodeId: projection.retry.subjectId,
    blockedOperationId: projection.retry.operationId,
    blockedObservationOccurrence: projection.retry.observationOccurrence,
    blockedReason: projection.retry.reason,
    productDefectCode: "GLOBALPING_REDIRECT_ADAPTER_INCOMPATIBLE",
    diagnosisEvidenceHash: `sha256:${"c".repeat(64)}`,
    stoppedDriverLeaseHash: `sha256:${"e".repeat(64)}`,
    ...overrides,
  };
}

function controller(state, overrides = {}) {
  return createDurableOutcomeEmergencyFailCloseV1({
    directory: state.root,
    clock: () => CLOCK,
    async outcomeConfirmationReplay(input) {
      return { confirmed: true, ...input };
    },
    async stoppedDriverLeaseReplay(input) {
      return {
        stopped: true,
        moduleIssued: true,
        ...input,
        driverIdentityHash: `sha256:${"6".repeat(64)}`,
        stoppedObservedAt: CLOCK,
      };
    },
    async writerExclusionReplay() {
      return { legacyWriterProcessesAbsent: true };
    },
    async emergencyAuthorizationReplay(input) {
      const body = {
        authorized: true,
        moduleIssued: true,
        ...input,
        authorizationEvidenceHash: `sha256:${"7".repeat(64)}`,
        authorizedAt: CLOCK,
      };
      return { ...body,
        authorizationHash: `sha256:${"8".repeat(64)}` };
    },
    async resumeProgram({ programId }) {
      return state.orchestrator.resume(programId);
    },
    ...overrides,
  });
}

test("committed inconclusive episode fail-closes without forging witness success and releases every reservation",
  async (t) => {
    const state = fixture(t);
    const initial = await state.orchestrator.run(program("program_fc_001"));
    assert.equal(initial.state, "PAUSED_RETRYABLE");
    assert.equal(initial.committed, true);
    assert.equal(initial.retry.reason,
      "DETERMINISTIC_REDIRECT_INCOMPATIBILITY");
    const before = journal(state.root);

    const result = await controller(state).failClose(requestFor(initial));

    assert.equal(result.state, "FAILED_CLOSED");
    assert.equal(result.telemetry.outsiderStaffTouchCount, null);
    assert.equal(result.telemetry.zeroInternalOpsObserved, false);
    assert.equal(result.humanQueueCreated, false);
    assert.equal(result.nodes.publish_result.witness, null,
      "fail-close must not synthesize a witness completion");
    assert.equal(result.nodes.publish_result.latestInconclusive.status,
      "INCONCLUSIVE");
    assert.deepEqual(Object.values(result.obligations)
      .map((value) => value.status), ["CLOSED", "CLOSED", "CLOSED"]);
    assert.equal(Object.values(result.releases)
      .every((value) => value.status === "RELEASED"), true);

    const after = journal(state.root);
    assert.equal(after.slice(0, before.length).every((event, index) =>
      event.eventHash === before[index].eventHash), true,
    "the frozen prefix must remain byte-for-byte replayable");
    const intervention = after.find((event) =>
      event.eventType === "EMERGENCY_FAIL_CLOSE_REQUESTED_V1");
    assert.equal(intervention.payload.truthBoundary.witnessSuccessAsserted,
      false);
    assert.equal(intervention.payload.operatorIntervention
      .zeroTouchMilestoneFailed, true);
    const telemetry = after.find((event) =>
      event.eventType === "ZERO_INTERNAL_OPS_TELEMETRY");
    assert.equal(telemetry.payload.minimumOutsiderStaffTouchCount, 1);
    assert.equal(telemetry.payload.exactOutsiderStaffTouchCountKnown, false);
    assert.equal(telemetry.payload.measurementObserved, false);
    assert.equal(after.some((event) => event.eventType
      === "NODE_WITNESS_COMPLETED"), false);
    assert.equal(after.at(-1).eventType, "PROGRAM_FAILED_CLOSED");
  });

test("a durable pending intent repairs only its exact partial event prefix",
  async (t) => {
    const state = fixture(t);
    const initial = await state.orchestrator.run(program("program_fc_partial"));
    const request = requestFor(initial, {
      interventionId: "intervention_fc_partial",
    });
    let interruptOnce = true;
    const emergency = controller(state, {
      writeJournalChunk(descriptor, bytes, offset, length) {
        if (interruptOnce) {
          interruptOnce = false;
          const written = writeSync(descriptor, bytes, offset,
            Math.min(37, length));
          assert.ok(written > 0);
          throw new Error("SIMULATED_PROCESS_DEATH_AFTER_PARTIAL_APPEND");
        }
        return writeSync(descriptor, bytes, offset, length);
      },
    });
    await assert.rejects(emergency.failClose(request),
      /SIMULATED_PROCESS_DEATH_AFTER_PARTIAL_APPEND/u);
    const journalFile = readdirSync(state.root)
      .find((name) => name.endsWith(".events.jsonl"));
    assert.notEqual(readFileSync(path.join(state.root, journalFile)).at(-1),
      0x0a, "fixture must leave a real partial JSONL tail");

    const recovered = await emergency.failClose(request);
    assert.equal(recovered.state, "FAILED_CLOSED");
    assert.equal(readFileSync(path.join(state.root, journalFile)).at(-1), 0x0a);
    assert.equal(journal(state.root).filter((event) =>
      event.eventType === "EMERGENCY_FAIL_CLOSE_REQUESTED_V1").length, 1);
  });

test("a durable pending intent resumes a zero-byte journal append",
  async (t) => {
    const state = fixture(t);
    const initial = await state.orchestrator.run(program("program_fc_zero"));
    const request = requestFor(initial, {
      interventionId: "intervention_fc_zero",
    });
    let interruptOnce = true;
    const emergency = controller(state, {
      writeJournalChunk(descriptor, bytes, offset, length) {
        if (interruptOnce) {
          interruptOnce = false;
          throw new Error("SIMULATED_DEATH_BEFORE_FIRST_JOURNAL_BYTE");
        }
        return writeSync(descriptor, bytes, offset, length);
      },
    });
    const before = readFileSync(path.join(state.root, readdirSync(state.root)
      .find((name) => name.endsWith(".events.jsonl"))));
    await assert.rejects(emergency.failClose(request),
      /SIMULATED_DEATH_BEFORE_FIRST_JOURNAL_BYTE/u);
    const afterCrash = readFileSync(path.join(state.root,
      readdirSync(state.root).find((name) => name.endsWith(".events.jsonl"))));
    assert.equal(afterCrash.equals(before), true);
    assert.equal((await emergency.failClose(request)).state, "FAILED_CLOSED");
  });

test("fail-close replay reuses the original release operation id after an ambiguous provider result",
  async (t) => {
    const state = fixture(t, { failReleaseOnce: true });
    const initial = await state.orchestrator.run(program("program_fc_002"));
    const request = requestFor(initial);
    const first = await controller(state).failClose(request);
    assert.equal(first.state, "PAUSED_RETRYABLE");
    assert.equal(first.retry.phase, "RELEASE");

    const second = await controller(state).failClose(request);
    assert.equal(second.state, "FAILED_CLOSED");
    const attempts = state.calls.filter((call) => call[0] === "release"
      && call[1] === "primary.fake");
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0][3], attempts[1][3],
      "the v1 orchestrator must replay the same provider operation id");
    const events = journal(state.root);
    assert.equal(events.filter((event) => event.eventType
      === "EMERGENCY_FAIL_CLOSE_REQUESTED_V1").length, 1);
    assert.equal(events.filter((event) => event.eventType
      === "CLOSURE_STARTED").length, 1);
    assert.equal(events.filter((event) => event.eventType
      === "ZERO_INTERNAL_OPS_TELEMETRY").length, 1);
  });

test("replay rejects a valid-hash non-emergency event after intervention",
  async (t) => {
    const state = fixture(t, { failReleaseOnce: true });
    const initial = await state.orchestrator.run(program("program_fc_rogue"));
    const request = requestFor(initial, {
      interventionId: "intervention_fc_rogue",
    });
    const emergency = controller(state);
    const first = await emergency.failClose(request);
    assert.equal(first.state, "PAUSED_RETRYABLE");
    const events = journal(state.root);
    const body = {
      schema: events.at(-1).schema,
      schemaVersion: "1.0.0",
      sequence: events.length + 1,
      previousEventHash: events.at(-1).eventHash,
      recordedAt: CLOCK,
      eventType: "NODE_WITNESS_COMPLETED",
      payload: { nodeId: request.blockedNodeId, forgedByFixture: true },
    };
    const rogue = { ...body, eventHash: eventHash(body) };
    const journalFile = readdirSync(state.root)
      .find((name) => name.endsWith(".events.jsonl"));
    appendFileSync(path.join(state.root, journalFile),
      `${canonicalizeStrict(rogue)}\n`);
    await assert.rejects(emergency.failClose(request),
      /INTERVENTION_DESCENDANT_EVENT_FORBIDDEN/u);
  });

test("fail-close refuses a stale journal head before appending",
  async (t) => {
    const state = fixture(t);
    const initial = await state.orchestrator.run(program("program_fc_003"));
    const count = journal(state.root).length;
    await assert.rejects(controller(state).failClose(requestFor(initial, {
      expectedJournalHeadHash: `sha256:${"f".repeat(64)}`,
    })), /JOURNAL_PRECONDITION_MISMATCH/u);
    assert.equal(journal(state.root).length, count);
  });

test("fail-close requires a replayed confirmation bound to the exact request and program",
  async (t) => {
    const state = fixture(t);
    const initial = await state.orchestrator.run(program("program_fc_004"));
    const emergency = createDurableOutcomeEmergencyFailCloseV1({
      directory: state.root,
      clock: () => CLOCK,
      async outcomeConfirmationReplay(input) {
        return { confirmed: false, ...input };
      },
      async stoppedDriverLeaseReplay() {
        throw new Error("must not replay stop lease");
      },
      async writerExclusionReplay() {
        throw new Error("must not replay writer exclusion");
      },
      async emergencyAuthorizationReplay() {
        throw new Error("must not replay authorization");
      },
      async resumeProgram() { throw new Error("must not resume"); },
    });
    const count = journal(state.root).length;
    await assert.rejects(emergency.failClose(requestFor(initial)),
      /CONFIRMATION_REPLAY_MISMATCH/u);
    assert.equal(journal(state.root).length, count);
  });

test("journal naming remains the v1 sha256 program-id derivation", () => {
  const expected = createHash("sha256").update("program_fc_001", "utf8")
    .digest("hex");
  assert.equal(expected.length, 64);
});
