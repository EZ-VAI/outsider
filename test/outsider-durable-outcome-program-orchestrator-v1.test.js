import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDurableOutcomeProgramOrchestratorV1,
} from "../src/outsider-durable-outcome-program-orchestrator-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { compileOutcomeProgramV1 }
  from "../src/outsider-outcome-program-v1.js";
import { createTemporalObservationWindowWitnessV1 }
  from "../src/outsider-temporal-observation-window-witness-v1.js";

const HASH = `sha256:${"d".repeat(64)}`;

function program(programId) {
  return createFirstCommittedDigitalRealityProgramV1({
    programId,
    orderId: `order_${programId}`,
    createdAt: "2026-09-03T12:00:00.000Z",
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash: HASH,
    tenderHash: `sha256:${"e".repeat(64)}`,
    observationWindowMs: 600_000,
  });
}

function programWithoutReservationDependencies(programId) {
  const input = structuredClone(program(programId));
  delete input.schema;
  delete input.executionOrder;
  delete input.programHash;
  for (const requirement of input.requirements) {
    requirement.dependsOnRequirementIds = [];
  }
  return compileOutcomeProgramV1(input);
}

function fakeNetwork(options = {}) {
  const calls = [];
  const executeOperationIds = [];
  const witnessReservationDependencies = [];
  let primaryThrowsRemaining = options.primaryThrowsOnce ? 1 : 0;

  function common(adapterId) {
    return {
      async reserve({ requirement, dependencyReservations, operationId }) {
        calls.push(["reserve-start", adapterId, requirement.requirementId,
          operationId]);
        if (requirement.role === "INDEPENDENT_WITNESS") {
          witnessReservationDependencies.push({
            requirementId: requirement.requirementId,
            dependencyReservations,
          });
        }
        await Promise.resolve();
        calls.push(["reserve-finish", adapterId, requirement.requirementId]);
        return {
          status: "RESERVED",
          reservationId: `reservation:${adapterId}`,
          validUntil: "2026-09-03T13:00:00.000Z",
          providerReceipt: { adapterId, accepted: true },
          adapterState: { providerRouteId: `route:${adapterId}` },
        };
      },
      async release({ requirement, operationId, disposition }) {
        calls.push(["release", adapterId, requirement.requirementId,
          operationId, disposition]);
        return {
          status: "RELEASED",
          receipt: { adapterId, lifecycle: "CLOSED" },
        };
      },
      async closeObligation({ obligation, operationId }) {
        calls.push(["obligation", adapterId, obligation.obligationId,
          operationId]);
        return {
          status: "CLOSED",
          receipt: { adapterId, action: obligation.action },
        };
      },
    };
  }

  const primary = {
    ...common("primary.native"),
    async execute({ node, operationId, reservation }) {
      calls.push(["execute", "primary.native", node.nodeId, operationId]);
      assert.equal(reservation.adapterState.providerRouteId,
        "route:primary.native");
      executeOperationIds.push(operationId);
      if (primaryThrowsRemaining > 0) {
        primaryThrowsRemaining -= 1;
        throw new Error("provider response lost after deterministic operation");
      }
      if (options.primaryFails) {
        return {
          status: "FAILED",
          receipt: { failureCode: "INJECTED_PRIMARY_FAILURE" },
        };
      }
      return {
        status: "SUCCEEDED",
        effectRef: "effect:primary:001",
      };
    },
  };
  const recovery = {
    ...common("recovery.native"),
    async execute({ node, operationId, primaryFailure }) {
      calls.push(["execute", "recovery.native", node.nodeId, operationId]);
      return {
        status: "SUCCEEDED",
        effectRef: "effect:recovery:001",
        recoveredFailure: primaryFailure.receipt.failureCode,
      };
    },
  };
  function witness(adapterId) {
    return {
      ...common(adapterId),
      adapterId,
      providerRef: adapterId,
      async observe({ node, effectiveRoute, operationId }) {
        calls.push(["observe", adapterId, node.nodeId,
          effectiveRoute, operationId]);
        return {
          status: "SATISFIED",
          observationRef: `observation:${node.nodeId}`,
          longitudinalWindowProven: node.nodeId === "sustain_and_observe",
        };
      },
    };
  }
  return {
    calls,
    executeOperationIds,
    witnessReservationDependencies,
    adapters: {
      "primary.native": primary,
      "recovery.native": recovery,
      "witness.route-aware": witness("witness.route-aware"),
    },
    bindings: {
      primary_publication: "primary.native",
      recovery_publication: "recovery.native",
      independent_http_witness: "witness.route-aware",
    },
    async discover({ requirement, operationId }) {
      calls.push(["discover", requirement.requirementId, operationId]);
      return {
        adapterId: {
          primary_publication: "primary.native",
          recovery_publication: "recovery.native",
          independent_http_witness: "witness.route-aware",
        }[requirement.requirementId],
        providerRef: `provider:${requirement.requirementId}`,
      };
    },
  };
}

function withDirectory(fn) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-production-orchestrator-v1-")));
  return Promise.resolve().then(() => fn(directory)).finally(() => {
    rmSync(directory, { recursive: true, force: true });
  });
}

function factory(directory, network, clock = () =>
  "2026-09-03T12:01:00.000Z") {
  return createDurableOutcomeProgramOrchestratorV1({
    directory,
    adapters: network.adapters,
    discover: network.discover,
    clock,
    measureOperations: async () => ({
      outsiderStaffTouchCount: 0,
      humanQueueCreated: false,
      source: "TEST_RUNTIME_COUNTER",
    }),
  });
}

test('waiting local step does not stall independent cloud successors in the same order', () => withDirectory(async directory => {
  const base = structuredClone(program('independent_while_local_offline'));
  delete base.schema; delete base.programHash; delete base.executionOrder;
  const original = base.nodes.find(row => row.nodeId === 'publish_result');
  base.nodes.push({ ...original, nodeId: 'local_step', dependsOn: [] });
  base.nodes.push({ ...original, nodeId: 'after_local', dependsOn: ['local_step'] });
  const p = compileOutcomeProgramV1(base), network = fakeNetwork();
  const originalExecute = network.adapters['primary.native'].execute;
  let localOnline = false, localAttempts = 0;
  network.adapters['primary.native'].execute = async context => {
    if (context.node.nodeId === 'local_step') { localAttempts++;
      if (!localOnline) throw new Error('NODE_STEP_WAITING_FOR_NODE'); }
    return originalExecute(context);
  };
  const first = await factory(directory, network).run(p);
  assert.equal(first.state, 'PAUSED_RETRYABLE');
  assert.equal(first.nodes.close_episode.witness.status, 'SATISFIED');
  assert.equal(network.calls.some(row => row[0] === 'execute' && row[2] === 'after_local'), false);
  assert.equal(localAttempts, 1);
  const cloudCalls = network.calls.filter(row => row[0] === 'execute' && row[2] === 'publish_result').length;
  localOnline = true;
  const resumed = await factory(directory, network).resume(p.programId);
  assert.equal(resumed.state, 'SUCCEEDED');
  assert.equal(resumed.programHash, p.programHash);
  assert.equal(network.calls.filter(row => row[0] === 'execute' && row[2] === 'publish_result').length, cloudCalls);
  assert.equal(network.calls.filter(row => row[0] === 'execute' && row[2] === 'after_local').length, 1);
}));

test("prepared capacity survives restart without executing and requires exact confirmation", () => withDirectory(async directory => {
  const network = fakeNetwork(), p = program("prepared_001");
  const first = await factory(directory, network).prepare(p);
  assert.equal(first.state, "RESOURCES_RESERVED_AWAITING_CONFIRMATION");
  assert.equal(first.committed, false); assert.equal(first.userOutcomePromiseIssued, false);
  assert.equal(network.calls.filter(c => c[0] === "execute").length, 0);
  const restarted = factory(directory, network);
  assert.equal((await restarted.resume(p.programId)).state, first.state);
  assert.equal(network.calls.filter(c => c[0] === "reserve-start").length, 3);
  await assert.rejects(restarted.confirmPrepared(p.programId, HASH), /CONFIRMATION_HASH_MISMATCH/u);
  assert.equal(network.calls.filter(c => c[0] === "execute").length, 0);
  assert.equal((await restarted.confirmPrepared(p.programId, p.programHash)).state, "SUCCEEDED");
}));
test("prepared program past its formation deadline releases capacity without executing", () => withDirectory(async directory => {
  const network = fakeNetwork(), p = program("prepared_expired_001");
  await factory(directory, network).prepare(p);
  const result = await factory(directory, network, () => "2026-09-03T12:11:00.000Z").confirmPrepared(p.programId, p.programHash);
  assert.equal(result.state, "UNAVAILABLE"); assert.equal(result.committed, false);
  assert.equal(network.calls.filter(c => c[0] === "execute").length, 0);
  assert.equal(network.calls.filter(c => c[0] === "release").length, 3);
}));

test("parallel three-role formation commits before primary execution and closes the full lifecycle",
  () => withDirectory(async (directory) => {
    const network = fakeNetwork();
    const orchestrator = factory(directory, network);
    const result = await orchestrator.run(program("program_happy_001"));

    assert.equal(result.state, "SUCCEEDED");
    assert.equal(result.committed, true);
    assert.equal(result.userOutcomePromiseIssued, true);
    assert.equal(result.telemetry.zeroInternalOpsObserved, true);
    assert.equal(result.humanQueueCreated, false);
    assert.deepEqual(Object.values(result.nodes).map((node) =>
      node.witness.status), ["SATISFIED", "SATISFIED", "SATISFIED"]);
    assert.equal(network.calls.filter((call) =>
      call[0] === "execute" && call[1] === "primary.native").length, 1);
    assert.equal(network.calls.filter((call) =>
      call[0] === "execute" && call[1] === "recovery.native").length, 0);
    assert.equal(network.calls.filter((call) =>
      call[0] === "reserve-start").length, 3);
    assert.equal(network.calls.filter((call) => call[0] === "discover").length,
      3);
    assert.equal(network.calls.filter((call) => call[0] === "release").length,
      3);
    assert.equal(network.calls.filter((call) =>
      call[0] === "obligation").length, 3);
    assert.equal(network.witnessReservationDependencies.length, 1);
    for (const item of network.witnessReservationDependencies) {
      assert.deepEqual(Object.keys(item.dependencyReservations),
        ["primary_publication", "recovery_publication"]);
      assert.equal(item.dependencyReservations.primary_publication
        .adapterState.providerRouteId, "route:primary.native");
      assert.equal(item.dependencyReservations.recovery_publication
        .adapterState.providerRouteId, "route:recovery.native");
    }
    const journalFile = path.join(directory, readdirSync(directory)[0]);
    const journal = readFileSync(journalFile, "utf8").trim().split("\n")
      .map((line) => JSON.parse(line));
    const witnessConfirmedSequence = Math.max(...journal
      .filter((event) => event.eventType === "RESERVATION_CONFIRMED"
        && event.payload.role === "INDEPENDENT_WITNESS")
      .map((event) => event.sequence));
    const commitSequence = journal.find((event) =>
      event.eventType === "PROGRAM_COMMITTED").sequence;
    assert.ok(commitSequence > witnessConfirmedSequence,
      "COMMIT must follow route-aware witness reservations");
    assert.equal(orchestrator.inspect("program_happy_001").journalHeadHash,
      result.journalHeadHash);
  }));

test("an absent operations measurement stays unknown and cannot mint terminal success",
  () => withDirectory(async (directory) => {
    const network = fakeNetwork();
    const orchestrator = createDurableOutcomeProgramOrchestratorV1({
      directory,
      adapters: network.adapters,
      discover: network.discover,
      clock: () => "2026-09-03T12:01:00.000Z",
    });
    const result = await orchestrator.run(program("program_unmeasured_001"));

    assert.equal(result.nodes.publish_result.witness.status, "SATISFIED",
      "the real outcome result remains distinct from operations telemetry");
    assert.equal(result.state, "FAILED_CLOSED");
    assert.equal(result.telemetry.outsiderStaffTouchCount, null);
    assert.equal(result.telemetry.humanQueueCreated, null);
    assert.equal(result.telemetry.measurementObserved, false);
    assert.equal(result.telemetry.zeroInternalOpsObserved, false);
    assert.equal(result.telemetry.source,
      "UNOBSERVED_NO_MEASUREMENT_SOURCE");
    assert.equal(result.humanQueueCreated, null);
  }));

test("an explicit primary failure activates reserved recovery before independent observation",
  () => withDirectory(async (directory) => {
    const network = fakeNetwork({ primaryFails: true });
    const result = await factory(directory, network).run(
      program("program_recovery_001"), { bindings: network.bindings });

    assert.equal(result.state, "SUCCEEDED");
    assert.equal(result.nodes.publish_result.primary.status, "FAILED");
    assert.equal(result.nodes.publish_result.recovery.status, "SUCCEEDED");
    assert.equal(result.nodes.publish_result.witness.status, "SATISFIED");
    const publishObservation = network.calls.find((call) =>
      call[0] === "observe" && call[2] === "publish_result");
    assert.equal(publishObservation[3], "RECOVERY");
    assert.equal(network.calls.filter((call) =>
      call[0] === "execute" && call[1] === "recovery.native").length, 1);
    assert.equal(result.telemetry.outsiderStaffTouchCount, 0);
  }));

test("requirements without reservation dependencies remain one parallel formation wave",
  () => withDirectory(async (directory) => {
    const network = fakeNetwork();
    const result = await factory(directory, network).run(
      programWithoutReservationDependencies("program_parallel_001"), {
        bindings: network.bindings,
      });
    assert.equal(result.state, "SUCCEEDED");
    const reservationEvents = network.calls.filter((call) =>
      call[0] === "reserve-start" || call[0] === "reserve-finish");
    assert.deepEqual(reservationEvents.slice(0, 3).map((call) => call[0]),
      ["reserve-start", "reserve-start", "reserve-start"]);
    assert.equal(network.witnessReservationDependencies.every((item) =>
      Object.keys(item.dependencyReservations).length === 0), true);
  }));

test("a restart resumes the same deterministic provider operation without reforming the network",
  () => withDirectory(async (directory) => {
    const network = fakeNetwork({ primaryThrowsOnce: true });
    const first = await factory(directory, network).run(
      program("program_restart_001"), { bindings: network.bindings });
    assert.equal(first.state, "PAUSED_RETRYABLE");
    assert.equal(first.committed, true);
    assert.equal(first.retry.phase, "EXECUTE_PRIMARY");

    const second = await factory(directory, network)
      .resume("program_restart_001");
    assert.equal(second.state, "SUCCEEDED");
    assert.equal(network.executeOperationIds.length, 2);
    assert.equal(network.executeOperationIds[0], network.executeOperationIds[1]);
    assert.equal(network.calls.filter((call) =>
      call[0] === "reserve-start").length, 3,
    "restart must reuse the already-reserved temporary network");
  }));

test("an open provider-statistics horizon persists INCONCLUSIVE and a later restart observes a new occurrence",
  () => withDirectory(async (directory) => {
    let currentTime = "2026-09-03T12:01:00.000Z";
    const clock = () => currentTime;
    const network = fakeNetwork();
    network.adapters["witness.route-aware"]
      = createTemporalObservationWindowWitnessV1({
        witnessAdapter: network.adapters["witness.route-aware"],
        clock,
      });

    const first = await factory(directory, network, clock).run(
      program("program_temporal_restart_001"), {
        bindings: network.bindings,
      });
    assert.equal(first.state, "PAUSED_RETRYABLE");
    assert.equal(first.committed, true);
    assert.equal(first.nodes.publish_result.witness.status, "SATISFIED");
    assert.equal(first.nodes.sustain_and_observe.witness, null);
    assert.equal(first.nodes.sustain_and_observe.latestInconclusive.status,
      "INCONCLUSIVE");
    assert.equal(first.nodes.sustain_and_observe.latestInconclusive.reason,
      "OBSERVATION_WINDOW_OPEN");
    assert.equal(first.retry.observationOccurrence, 1);
    assert.equal(first.retry.retryAfter, "2026-09-03T12:11:00.000Z");
    const inspectedPause = factory(directory, network, clock)
      .inspect("program_temporal_restart_001");
    assert.equal(inspectedPause.state, "PAUSED_RETRYABLE");
    assert.equal(inspectedPause.retry.retryAfter,
      "2026-09-03T12:11:00.000Z");
    assert.equal(first.telemetry, null,
      "an open observation horizon must not enter closure");
    assert.equal(network.calls.filter((call) => call[0] === "release").length,
      0);
    assert.deepEqual(network.calls.filter((call) => call[0] === "observe")
      .map((call) => call[2]), ["publish_result"],
    "the wrapper must not poll the provider before the horizon");

    const journalFile = path.join(directory, readdirSync(directory)[0]);
    const firstJournal = readFileSync(journalFile, "utf8").trim().split("\n")
      .map((line) => JSON.parse(line));
    const firstRequests = firstJournal.filter((event) =>
      event.eventType === "NODE_WITNESS_REQUESTED"
        && event.payload.nodeId === "sustain_and_observe");
    assert.equal(firstRequests.length, 1);
    assert.equal(firstJournal.filter((event) =>
      event.eventType === "NODE_WITNESS_INCONCLUSIVE"
        && event.payload.nodeId === "sustain_and_observe").length, 1);

    currentTime = "2026-09-03T12:12:00.000Z";
    const second = await factory(directory, network, clock)
      .resume("program_temporal_restart_001");
    assert.equal(second.state, "SUCCEEDED");
    assert.equal(second.nodes.sustain_and_observe.witness.status, "SATISFIED");
    assert.equal(second.nodes.sustain_and_observe.witness
      .endpointSampledAtOrAfterHorizon, true);
    assert.equal(second.telemetry.zeroInternalOpsObserved, true);
    assert.equal(second.humanQueueCreated, false);
    assert.equal(network.calls.filter((call) => call[0] === "reserve-start")
      .length, 3, "restart must reuse the temporary network");
    assert.equal(network.calls.filter((call) => call[0] === "observe"
      && call[2] === "sustain_and_observe").length, 1);

    const finalJournal = readFileSync(journalFile, "utf8").trim().split("\n")
      .map((line) => JSON.parse(line));
    const requests = finalJournal.filter((event) =>
      event.eventType === "NODE_WITNESS_REQUESTED"
        && event.payload.nodeId === "sustain_and_observe");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map((event) =>
      event.payload.observationOccurrence), [1, 2]);
    assert.notEqual(requests[0].payload.operationId,
      requests[1].payload.operationId,
    "each completed inconclusive read advances to a new operation id");
  }));

test("a thrown witness read retries the same observation occurrence and operation id",
  () => withDirectory(async (directory) => {
    const network = fakeNetwork();
    const sourceWitness = network.adapters["witness.route-aware"];
    const operationIds = [];
    let throwOnce = true;
    network.adapters["witness.route-aware"] = {
      ...sourceWitness,
      async observe(context) {
        if (context.node.nodeId === "publish_result") {
          operationIds.push(context.operationId);
          if (throwOnce) {
            throwOnce = false;
            throw new Error("ambiguous read transport");
          }
        }
        return sourceWitness.observe(context);
      },
    };

    const first = await factory(directory, network).run(
      program("program_witness_throw_restart_001"), {
        bindings: network.bindings,
      });
    assert.equal(first.state, "PAUSED_RETRYABLE");
    assert.equal(first.retry.phase, "OBSERVE");
    assert.equal(first.retry.observationOccurrence, 1);

    const second = await factory(directory, network)
      .resume("program_witness_throw_restart_001");
    assert.equal(second.state, "SUCCEEDED");
    assert.equal(operationIds.length, 2);
    assert.equal(operationIds[0], operationIds[1]);

    const journalFile = path.join(directory, readdirSync(directory)[0]);
    const journal = readFileSync(journalFile, "utf8").trim().split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(journal.filter((event) =>
      event.eventType === "NODE_WITNESS_REQUESTED"
        && event.payload.nodeId === "publish_result").length, 1,
    "an ambiguous occurrence keeps its original durable request");
  }));
