import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createDeterministicBuyerNativeStagePlanV1,
  executeDeterministicBuyerNativeStagePlanV1,
  OUTSIDER_DETERMINISTIC_BUYER_NATIVE_PLAN_RUNTIME_V1_BOUNDARY,
} from "../src/outsider-deterministic-buyer-native-plan-runtime-v1.js";

const PRECOMMIT = Object.freeze(["QUOTE", "HOLD", "STATUS"]);
const NOW = "2026-09-04T12:00:00.000Z";
const SOURCE_EXPIRY = "2026-09-04T13:00:00.000Z";
const OPERATION_EXPIRY = "2026-09-04T13:30:00.000Z";
const FORMATION_EXPIRY = "2026-09-04T14:00:00.000Z";
const CAPABILITY_EXPIRY = "2026-09-04T15:00:00.000Z";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function privateDirectory(t, label) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    `outsider-deterministic-plan-${label}-`)));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function response(operation) {
  const table = {
    QUOTE: ["QUOTE_AVAILABLE", "PUBLISHED_INVENTORY"],
    HOLD: ["HOLD_ACKNOWLEDGED", "HOLD_RECEIPT"],
    RESERVE: ["RESERVATION_ACKNOWLEDGED", "RESERVATION_RECEIPT"],
    COMMIT: ["COMMIT_ACKNOWLEDGED", "COMMIT_RECEIPT"],
    STATUS: ["IN_PROGRESS", "STATUS_RECEIPT"],
    CANCEL: ["CANCELLATION_ACKNOWLEDGED", "CANCELLATION_RECEIPT"],
    RECOVER: ["RECOVERY_COMMIT_ACKNOWLEDGED", "RECOVERY_RECEIPT"],
  };
  return {
    sourceBytes: Buffer.from(`source:${operation}`, "utf8"),
    sourceState: table[operation][0],
    sourceExpiresAt: ["QUOTE", "HOLD", "RESERVE"].includes(operation)
      ? SOURCE_EXPIRY : null,
    sourceRecordClass: table[operation][1],
  };
}

function issueCapability(label, supportedOperations, calls) {
  const metadata = {
    capabilityRefHash: h(`${label}:capability`),
    accountRefHash: h(`${label}:account`),
    nodeRefHash: h(`${label}:node`),
    issuedAt: "2026-09-04T11:00:00.000Z",
    expiresAt: CAPABILITY_EXPIRY,
    supportedOperations,
  };
  return issueBuyerNativeTransactionAccountCapabilityV1(metadata, {
    async requestImpl(request) {
      calls.push(request);
      return response(request.operation);
    },
    async revalidateImpl(input) {
      return {
        active: true,
        capabilityRefHash: metadata.capabilityRefHash,
        accountRefHash: metadata.accountRefHash,
        observedAt: input.observedAt,
        expiresAt: metadata.expiresAt,
      };
    },
  });
}

function plan(label, role, operations, capability) {
  return createDeterministicBuyerNativeStagePlanV1({
    planRefHash: h(`${label}:plan-ref`),
    transactionRefHash: h(`${label}:transaction`),
    outcomeIntentRefHash: h(`${label}:outcome`),
    capability,
    capabilityBindingHash: capability.capabilityBindingHash,
    routeRole: role,
    formationExpiresAt: FORMATION_EXPIRY,
    stages: operations.map((entry, index) => {
      const operation = typeof entry === "string" ? entry : entry.operation;
      return {
        stageId: `${String(index + 1).padStart(2, "0")}-${operation.toLowerCase()}`,
        operation,
        operationNonce: `${label}-${operation.toLowerCase()}-${index}-nonce-0001`,
        requestBytes: Buffer.from(`request:${label}:${operation}:${index}`,
          "utf8"),
        expiresAt: OPERATION_EXPIRY,
        triggerOccurrenceHash: typeof entry === "string"
          ? null : entry.triggerOccurrenceHash,
      };
    }),
  });
}

function monotonicClock(step = 2) {
  let value = 0;
  return () => {
    const current = value;
    value += step;
    return current;
  };
}

function executionInput(stagePlan, directory, journalId) {
  return { plan: stagePlan, expectedPlanHash: stagePlan.planHash,
    journalDirectory: directory, journalId };
}

test("a finite precommit plan runs through the existing transaction runtime with no model, UI, or staff path",
  async (t) => {
    const calls = [];
    const capability = issueCapability("primary", PRECOMMIT, calls);
    const stagePlan = plan("primary", "PRIMARY",
      ["QUOTE", "HOLD", "STATUS"],
      capability);
    const result = await executeDeterministicBuyerNativeStagePlanV1(
      executionInput(stagePlan, privateDirectory(t, "primary"),
        "transaction_00000000000000000000000000000011"), {
        capability,
        clock: () => NOW,
        monotonicClock: monotonicClock(),
      });

    assert.equal(Object.isFrozen(stagePlan), true);
    assert.equal(Object.isFrozen(stagePlan.stages), true);
    assert.equal(stagePlan.requestBytesProjected, false);
    assert.deepEqual(calls.map(({ operation }) => operation),
      ["QUOTE", "HOLD", "STATUS"]);
    for (let index = 1; index < calls.length; index += 1) {
      assert.equal(calls[index].expectedPreviousOccurrenceHash,
        result.publicProjection.stages[index - 1].result.sourceOccurrenceHash);
    }
    assert.equal(result.publicProjection.executionState, "COMPLETED");
    assert.equal(result.publicProjection.finalRuntimeState,
      "PRIMARY_IN_PROGRESS");
    assert.deepEqual(result.publicProjection.stages.map(({ latencyMs }) =>
      latencyMs), [2, 2, 2]);
    assert.deepEqual(result.publicProjection.counters, {
      modelCalls: 0,
      interactiveBrowserActions: 0,
      employeeTouches: 0,
      userBabysittingActions: 0,
      manualQueueEnqueues: 0,
      plannedStages: 3,
      executedStages: 3,
      replayedStages: 0,
      nonReplayStageResults: 3,
    });
    assert.equal(OUTSIDER_DETERMINISTIC_BUYER_NATIVE_PLAN_RUNTIME_V1_BOUNDARY
      .transactionStateMachineReused, true);
    const quoteClaim = claimBuyerNativeTransactionSourceOccurrenceV1(
      result.stageResults[0].operationResult);
    assert.equal(quoteClaim.sourceBytes.toString("utf8"), "source:QUOTE");
  });

test("reserve, commit, cancel, and recover remain exclusive to the authority-bearing atomic coordinator",
  () => {
    for (const operation of ["RESERVE", "COMMIT", "CANCEL", "RECOVER"]) {
      const capability = issueCapability(`consequential-${operation}`,
        [operation], []);
      assert.throws(() => plan(`consequential-${operation.toLowerCase()}`,
        "PRIMARY", [operation], capability),
      /CONSEQUENTIAL_OPERATION_REQUIRES_ATOMIC_COORDINATOR/u);
    }
  });

test("an unknown operation is rejected while compiling the finite plan",
  () => {
    const capability = issueCapability("unknown", PRECOMMIT, []);
    assert.throws(() => plan("unknown", "PRIMARY", ["QUOTE", "PAY"],
      capability),
      /UNKNOWN_OPERATION/u);
  });

test("a capability mismatch fails before any external operation",
  async (t) => {
    const calls = [];
    const capability = issueCapability("mismatch", ["QUOTE"], calls);
    const stagePlan = plan("mismatch", "PRIMARY", ["QUOTE", "HOLD"],
      capability);
    await assert.rejects(() => executeDeterministicBuyerNativeStagePlanV1(
      executionInput(stagePlan, privateDirectory(t, "mismatch"),
        "transaction_00000000000000000000000000000013"), {
        capability,
        clock: () => NOW,
        monotonicClock: monotonicClock(),
      }), /PLAN_OPERATION_NOT_SUPPORTED_BY_CAPABILITY/u);
    assert.equal(calls.length, 0);
  });

test("a different capability binding is rejected before journal creation or any external operation",
  async (t) => {
    const calls = [];
    const expectedCapability = issueCapability("binding-expected", PRECOMMIT,
      []);
    const actualCapability = issueCapability("binding-actual", PRECOMMIT,
      calls);
    const stagePlan = plan("binding-mismatch", "PRIMARY", ["QUOTE"],
      expectedCapability);
    await assert.rejects(() => executeDeterministicBuyerNativeStagePlanV1(
      executionInput(stagePlan, privateDirectory(t, "binding-mismatch"),
        "transaction_00000000000000000000000000000015"), {
        capability: actualCapability,
        clock: () => NOW,
        monotonicClock: monotonicClock(),
      }), /CAPABILITY_BINDING_MISMATCH/u);
    assert.equal(calls.length, 0);
  });

test("an expired later stage rejects the complete plan before the first external operation",
  async (t) => {
    const calls = [];
    const capability = issueCapability("preflight-expiry", PRECOMMIT, calls);
    const stagePlan = createDeterministicBuyerNativeStagePlanV1({
      planRefHash: h("preflight-expiry:plan-ref"),
      transactionRefHash: h("preflight-expiry:transaction"),
      outcomeIntentRefHash: h("preflight-expiry:outcome"),
      capability,
      capabilityBindingHash: capability.capabilityBindingHash,
      routeRole: "PRIMARY",
      formationExpiresAt: FORMATION_EXPIRY,
      stages: [{
        stageId: "01-quote",
        operation: "QUOTE",
        operationNonce: "preflight-expiry-quote-nonce-0001",
        requestBytes: Buffer.from("request:preflight-expiry:QUOTE", "utf8"),
        expiresAt: OPERATION_EXPIRY,
        triggerOccurrenceHash: null,
      }, {
        stageId: "02-hold",
        operation: "HOLD",
        operationNonce: "preflight-expiry-hold-nonce-0002",
        requestBytes: Buffer.from("request:preflight-expiry:HOLD", "utf8"),
        expiresAt: "2026-09-04T11:59:59.999Z",
        triggerOccurrenceHash: null,
      }],
    });
    await assert.rejects(() => executeDeterministicBuyerNativeStagePlanV1(
      executionInput(stagePlan, privateDirectory(t, "preflight-expiry"),
        "transaction_00000000000000000000000000000016"), {
        capability,
        clock: () => NOW,
        monotonicClock: monotonicClock(),
      }), /PLAN_EXPIRED_BEFORE_EXECUTION/u);
    assert.equal(calls.length, 0);
  });

test("journal replay of the same factory plan delegates idempotency to the durable transaction journal and makes no duplicate request",
  async (t) => {
    const calls = [];
    const directory = privateDirectory(t, "cold-replay");
    const capability = issueCapability("cold", PRECOMMIT, calls);
    const stagePlan = plan("cold", "PRIMARY", ["QUOTE", "HOLD"],
      capability);
    const input = executionInput(stagePlan, directory,
      "transaction_00000000000000000000000000000014");
    const first = await executeDeterministicBuyerNativeStagePlanV1(input, {
      capability,
      clock: () => NOW,
      monotonicClock: monotonicClock(),
    });
    assert.equal(calls.length, 2);
    assert.equal(first.publicProjection.counters.replayedStages, 0);

    const replayed = await executeDeterministicBuyerNativeStagePlanV1(input, {
      capability,
      clock: () => NOW,
      monotonicClock: monotonicClock(),
    });
    assert.equal(calls.length, 2);
    assert.equal(replayed.publicProjection.executionState, "COMPLETED");
    assert.equal(replayed.publicProjection.counters.replayedStages, 2);
    assert.equal(replayed.publicProjection.counters.nonReplayStageResults, 0);
    assert.equal(replayed.publicProjection.stages.every(({ result }) =>
      result.replayed === true), true);
    assert.equal(replayed.publicProjection.latestSourceOccurrenceHash,
      first.publicProjection.latestSourceOccurrenceHash);
  });
