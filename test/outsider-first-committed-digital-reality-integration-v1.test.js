import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createDurableOutcomeProgramOrchestratorV1,
} from "../src/outsider-durable-outcome-program-orchestrator-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { createRouteAwareWitnessAdapterV1 }
  from "../src/outsider-route-aware-witness-adapter-v1.js";

const PRIMARY_URL = "https://primary.injected.example/outcome/episode-001";
const RECOVERY_URL = "https://recovery.injected.example/outcome/episode-001";
const ARTIFACT_BYTES = "outsider:first-committed-digital-reality:v1\n";
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT_BYTES, "utf8").digest("hex")}`;

function outcomeProgram() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "first_committed_reality_integration_001",
    orderId: "order_first_committed_reality_integration_001",
    createdAt: "2026-09-03T12:00:00.000Z",
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash: ARTIFACT_HASH,
    tenderHash: `sha256:${"a".repeat(64)}`,
    observationWindowMs: 600_000,
  });
}

function providerWorld() {
  return {
    routes: new Map([
      [PRIMARY_URL, {
        body: ARTIFACT_BYTES,
        bodyHash: ARTIFACT_HASH,
        staged: false,
        active: false,
        removed: false,
      }],
      [RECOVERY_URL, {
        body: ARTIFACT_BYTES,
        bodyHash: ARTIFACT_HASH,
        staged: false,
        active: false,
        removed: false,
      }],
    ]),
    calls: [],
    discoveryCalls: [],
    staffTouches: 0,
    humanQueueCreated: false,
    witnessInterruptionsRemaining: 1,
  };
}

function effectAdapter(world, { adapterId, providerRef, routeRole, routeUrl }) {
  const route = world.routes.get(routeUrl);
  return Object.freeze({
    adapterId,
    providerRef,

    async reserve({ requirement, operationId }) {
      world.calls.push(["effect-reserve", routeRole, operationId]);
      route.staged = true;
      return {
        status: "RESERVED",
        reservationId: `reservation:${routeRole.toLowerCase()}`,
        validUntil: "2026-09-03T13:00:00.000Z",
        providerReceipt: {
          providerRef,
          staged: true,
          requirementId: requirement.requirementId,
        },
        adapterState: { routeUrl, artifactHash: ARTIFACT_HASH },
      };
    },

    async execute({ node, operationId, primaryFailure, reservation }) {
      world.calls.push(["effect-execute", routeRole, node.nodeId,
        operationId]);
      assert.equal(reservation.adapterState.routeUrl, routeUrl);
      assert.equal(route.staged, true);
      if (routeRole === "PRIMARY") {
        return {
          status: "FAILED",
          receipt: {
            providerRef,
            failureCode: "INJECTED_PRIMARY_ACTIVATION_FAILURE",
          },
        };
      }
      assert.equal(primaryFailure.status, "FAILED");
      route.active = true;
      return {
        status: "SUCCEEDED",
        routeUrl,
        statusCode: 200,
        bodyHash: route.bodyHash,
        providerReceipt: { providerRef, activated: true },
      };
    },

    async closeObligation({ obligation, operationId }) {
      world.calls.push(["effect-obligation", routeRole,
        obligation.obligationId, operationId]);
      assert.equal(obligation.action, "REMOVE_EPHEMERAL_ARTIFACT");
      route.active = false;
      route.removed = true;
      return {
        status: "CLOSED",
        receipt: { providerRef, artifactRemoved: true },
      };
    },

    async release({ operationId, disposition }) {
      world.calls.push(["effect-release", routeRole, operationId,
        disposition]);
      route.staged = false;
      return {
        status: "RELEASED",
        receipt: { providerRef, capacityReleased: true },
      };
    },
  });
}

function routeWitnessChild(world, input) {
  const providerRef = `independent-witness-${input.routeRole.toLowerCase()}`;
  const adapterId = `witness.child.${input.routeRole.toLowerCase()}`;
  if (input.resumeReservation !== null) {
    world.calls.push(["witness-child-rehydrated", input.routeRole,
      input.routeRef, input.resumeReservation.reservationId]);
  }
  return Object.freeze({
    adapterId,
    providerRef,

    async reserve({ operationId, routeRef, routeRole }) {
      world.calls.push(["witness-child-reserve", routeRole, routeRef,
        operationId]);
      return {
        status: "RESERVED",
        reservationId: `witness-reservation:${routeRole.toLowerCase()}`,
        validUntil: "2026-09-03T13:00:00.000Z",
        providerReceipt: { providerRef, target: routeRef },
        adapterState: { target: routeRef, containsCredential: false },
      };
    },

    async observe(context) {
      world.calls.push(["witness-child-observe", input.routeRole,
        input.routeRef, context.node.nodeId, context.operationId]);
      assert.equal(input.routeRole, "RECOVERY",
        "only the effective recovery route may be asked to judge the result");
      if (world.witnessInterruptionsRemaining > 0) {
        world.witnessInterruptionsRemaining -= 1;
        throw new Error("injected witness response interruption");
      }
      const route = world.routes.get(input.routeRef);
      const exactArtifactPresent = route?.active === true
        && route.bodyHash === ARTIFACT_HASH;
      return {
        status: exactArtifactPresent ? "SATISFIED" : "NOT_SATISFIED",
        observationId: `observation:${context.node.nodeId}`,
        providerReceipt: {
          providerRef,
          routeRef: input.routeRef,
          statusCode: exactArtifactPresent ? 200 : 404,
          bodyHash: route?.bodyHash ?? null,
          longitudinalWindowMs: 600_000,
        },
      };
    },

    async closeObligation({ operationId, routeRole }) {
      world.calls.push(["witness-child-obligation", routeRole, operationId]);
      return {
        status: "CLOSED",
        receipt: { providerRef, observationCapacityClosed: true },
      };
    },

    async release({ operationId, routeRole, disposition }) {
      world.calls.push(["witness-child-release", routeRole, operationId,
        disposition]);
      return {
        status: "RELEASED",
        receipt: { providerRef, monitorReleased: true },
      };
    },
  });
}

function adapters(world) {
  const primary = effectAdapter(world, {
    adapterId: "provider.primary.injected",
    providerRef: "primary-publication-provider",
    routeRole: "PRIMARY",
    routeUrl: PRIMARY_URL,
  });
  const recovery = effectAdapter(world, {
    adapterId: "provider.recovery.injected",
    providerRef: "recovery-publication-provider",
    routeRole: "RECOVERY",
    routeUrl: RECOVERY_URL,
  });
  const witness = createRouteAwareWitnessAdapterV1({
    adapterId: "provider.witness.route-aware.injected",
    providerRef: "independent-route-aware-observation-provider",
    routeFromReservation({ dependencyReservation }) {
      return dependencyReservation.adapterState.routeUrl;
    },
    createRouteWitness(input) {
      return routeWitnessChild(world, input);
    },
  });
  return {
    "provider.primary.injected": primary,
    "provider.recovery.injected": recovery,
    "provider.witness.route-aware.injected": witness,
  };
}

function discover(world) {
  const byRequirement = {
    primary_publication: "provider.primary.injected",
    recovery_publication: "provider.recovery.injected",
    independent_http_witness: "provider.witness.route-aware.injected",
  };
  return async ({ requirement, operationId }) => {
    world.discoveryCalls.push([requirement.requirementId, operationId]);
    return {
      adapterId: byRequirement[requirement.requirementId],
      providerRef: `discovered:${requirement.requirementId}`,
    };
  };
}

function orchestrator(directory, world) {
  return createDurableOutcomeProgramOrchestratorV1({
    directory,
    adapters: adapters(world),
    discover: discover(world),
    clock: () => "2026-09-03T12:01:00.000Z",
    measureOperations: async () => ({
      outsiderStaffTouchCount: world.staffTouches,
      humanQueueCreated: world.humanQueueCreated,
      source: "INJECTED_PRODUCTION_EXECUTION_COUNTER",
    }),
  });
}

function parseJournal(bytes) {
  return bytes.trim().split("\n").map((line) => JSON.parse(line));
}

function verifyJournalChain(events) {
  let previousEventHash = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    assert.equal(event.sequence, index + 1);
    assert.equal(event.previousEventHash, previousEventHash);
    const body = { ...event };
    delete body.eventHash;
    const expected = `sha256:${createHash("sha256")
      .update(`${body.schema}\0${canonicalizeStrict(body)}`, "utf8")
      .digest("hex")}`;
    assert.equal(event.eventHash, expected);
    previousEventHash = event.eventHash;
  }
}

test("a dynamically formed temporary network survives restart, recovers the primary failure, independently witnesses the effective route, and closes with zero operations touches",
  async () => {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-first-committed-reality-integration-v1-")));
    try {
      const world = providerWorld();
      const program = outcomeProgram();
      const first = await orchestrator(directory, world).run(program);

      assert.equal(first.state, "PAUSED_RETRYABLE");
      assert.equal(first.retry.phase, "OBSERVE");
      assert.equal(first.committed, true);
      assert.equal(first.nodes.publish_result.primary.status, "FAILED");
      assert.equal(first.nodes.publish_result.recovery.status, "SUCCEEDED");
      assert.equal(first.nodes.publish_result.witness, null);
      assert.deepEqual(world.discoveryCalls.map(([requirementId]) =>
        requirementId).sort(), [
        "independent_http_witness",
        "primary_publication",
        "recovery_publication",
      ]);

      const journalFile = path.join(directory, readdirSync(directory)[0]);
      const prefix = readFileSync(journalFile, "utf8");
      const prefixEvents = parseJournal(prefix);
      verifyJournalChain(prefixEvents);
      const commit = prefixEvents.find((event) =>
        event.eventType === "PROGRAM_COMMITTED");
      const firstExecution = prefixEvents.find((event) =>
        event.eventType === "NODE_EFFECT_REQUESTED");
      const witnessReservation = prefixEvents.find((event) =>
        event.eventType === "RESERVATION_CONFIRMED"
          && event.payload.role === "INDEPENDENT_WITNESS");
      assert.ok(commit.sequence > witnessReservation.sequence);
      assert.ok(firstExecution.sequence > commit.sequence);

      // A fresh orchestrator and fresh route-aware adapter replay the public
      // adapterState. No binding, reservation, or effect is repeated.
      const second = await orchestrator(directory, world)
        .resume(program.programId);
      assert.equal(second.state, "SUCCEEDED");
      assert.equal(second.committed, true);
      assert.equal(second.userOutcomePromiseIssued, true);
      assert.equal(second.telemetry.outsiderStaffTouchCount, 0);
      assert.equal(second.telemetry.zeroInternalOpsObserved, true);
      assert.equal(second.humanQueueCreated, false);
      assert.deepEqual(Object.values(second.nodes).map((node) => ({
        status: node.witness.status,
        route: node.witness.selectedRouteRole,
        routeRef: node.witness.selectedRouteRef,
      })), [
        { status: "SATISFIED", route: "RECOVERY", routeRef: RECOVERY_URL },
        { status: "SATISFIED", route: "RECOVERY", routeRef: RECOVERY_URL },
        { status: "SATISFIED", route: "RECOVERY", routeRef: RECOVERY_URL },
      ]);
      assert.equal(Object.values(second.obligations).every((value) =>
        value.status === "CLOSED"), true);
      assert.equal(Object.values(second.releases).every((value) =>
        ["CLOSED", "RELEASED"].includes(value.status)), true);
      assert.equal(world.routes.get(PRIMARY_URL).removed, true);
      assert.equal(world.routes.get(RECOVERY_URL).removed, true);

      assert.equal(world.discoveryCalls.length, 3,
        "restart must not reform the temporary network");
      assert.equal(world.calls.filter(([kind]) =>
        kind === "effect-reserve").length, 2);
      assert.equal(world.calls.filter(([kind]) =>
        kind === "witness-child-reserve").length, 2);
      assert.equal(world.calls.filter(([kind, role]) =>
        kind === "effect-execute" && role === "PRIMARY").length, 1);
      assert.equal(world.calls.filter(([kind, role]) =>
        kind === "effect-execute" && role === "RECOVERY").length, 1);
      assert.equal(world.calls.filter(([kind, role]) =>
        kind === "witness-child-observe" && role === "PRIMARY").length, 0);
      assert.equal(world.calls.filter(([kind]) =>
        kind === "witness-child-obligation").length, 2);
      assert.equal(world.calls.filter(([kind]) =>
        kind === "witness-child-release").length, 2);
      const publishObservations = world.calls.filter(([kind, role, routeRef,
        nodeId]) => kind === "witness-child-observe" && role === "RECOVERY"
          && routeRef === RECOVERY_URL && nodeId === "publish_result");
      assert.equal(publishObservations.length, 2);
      assert.equal(publishObservations[0][4], publishObservations[1][4],
        "restart must retry the same deterministic witness operation");

      const completed = readFileSync(journalFile, "utf8");
      assert.equal(completed.startsWith(prefix), true,
        "restart may only append to the existing journal");
      const completedEvents = parseJournal(completed);
      verifyJournalChain(completedEvents);
      assert.deepEqual(completedEvents.slice(0, prefixEvents.length),
        prefixEvents);
      assert.equal(completedEvents.at(-1).eventType, "PROGRAM_SUCCEEDED");
      assert.equal(completedEvents.filter((event) =>
        event.eventType === "PROGRAM_COMMITTED").length, 1);
      assert.equal(completedEvents.filter((event) =>
        event.eventType === "ZERO_INTERNAL_OPS_TELEMETRY").length, 1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
