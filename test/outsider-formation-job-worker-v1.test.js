import assert from "node:assert/strict";
import test from "node:test";

import {
  createFormationJobWorkerV1,
  createMemoryFormationJobStoreV1,
  formationJobIdentityV1,
  OUTSIDER_FORMATION_JOB_WORKER_V1_BOUNDARY,
} from "../src/outsider-formation-job-worker-v1.js";

const hash = (character) => `sha256:${character.repeat(64)}`;

function job(overrides = {}) {
  return {
    schema: "outsider/formation-job/v1",
    orderId: "order:00000001",
    planHash: hash("1"),
    adapterBinding: {
      adapterId: "merchant-buyer-native-v1",
      adapterVersion: "1.0.0",
    },
    outcomeProgramHash: hash("2"),
    parameterEnvelopeHash: hash("3"),
    graphRefs: {
      principalEpochHash: hash("4"),
      accountableDeploymentHash: hash("5"),
      runtimeOrEmbodimentHash: hash("6"),
      delegationHash: hash("7"),
      episodeHash: hash("8"),
      attemptHash: hash("9"),
    },
    issuedAt: "2098-01-01T00:00:00.000Z",
    expiresAt: "2100-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function completedResult() {
  return {
    state: "HOLD",
    reasonCode: "CAPACITY_NOT_RESERVED",
    resultHash: hash("a"),
    sourceOccurrenceHashes: [hash("b")],
    externalEffect: "READ_ONLY",
    retryDisposition: "DO_NOT_RETRY",
  };
}

test("one durable claim invokes the deterministic executor once and exact replay is free",
  async () => {
    const store = createMemoryFormationJobStoreV1();
    let calls = 0;
    let entered;
    const enteredPromise = new Promise((resolve) => { entered = resolve; });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const worker = createFormationJobWorkerV1({
      store,
      clock: () => "2099-01-01T00:00:00.000Z",
      executorResolver: async (binding) => {
        assert.deepEqual(binding, {
          adapterId: "merchant-buyer-native-v1",
          adapterVersion: "1.0.0",
          planHash: hash("1"),
        });
        return {
          async executeFrozenPlan(input) {
            calls += 1;
            assert.equal(input.job.parameterEnvelopeHash, hash("3"));
            entered();
            await gate;
            return completedResult();
          },
        };
      },
    });

    const firstPromise = worker.dispatch(job());
    await enteredPromise;
    const concurrent = await worker.dispatch(job());
    assert.deepEqual(concurrent, {
      statusCode: 202,
      replayed: false,
      state: "RUNNING_HOLD",
      receipt: null,
    });
    release();
    const first = await firstPromise;
    assert.equal(first.statusCode, 200);
    assert.equal(first.replayed, false);
    assert.equal(first.receipt.state, "HOLD");
    assert.equal(first.receipt.reasonCode, "CAPACITY_NOT_RESERVED");
    assert.deepEqual(first.receipt.counters, {
      modelCalls: 0,
      browserClicks: 0,
      employeeTouches: 0,
      userBabysitting: 0,
      manualQueueEnqueues: 0,
      executorInvocations: 1,
    });
    assert.equal(first.receipt.manualQueue, null);
    assert.equal(first.receipt.independentOutcomeTruthEstablished, false);
    assert.equal(first.receipt.authorityMinted, false);

    const replay = await worker.dispatch(job());
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.receipt, first.receipt);
    assert.equal(calls, 1);
    const serialized = JSON.stringify(replay);
    for (const forbidden of ["prompt", "instructions", "credential", "payment"]) {
      assert.equal(serialized.includes(`\"${forbidden}\"`), false);
    }
  });

test("orderId plus planHash is the identity key and changed material conflicts",
  async () => {
    const original = formationJobIdentityV1(job());
    const changed = formationJobIdentityV1(job({ parameterEnvelopeHash: hash("c") }));
    assert.equal(changed.jobKey, original.jobKey);
    assert.notEqual(changed.jobHash, original.jobHash);

    const worker = createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      clock: () => "2099-01-01T00:00:00.000Z",
      executorResolver: async () => ({ executeFrozenPlan: async () => completedResult() }),
    });
    assert.equal((await worker.dispatch(job())).statusCode, 200);
    const conflict = await worker.dispatch(job({ parameterEnvelopeHash: hash("c") }));
    assert.deepEqual(conflict, {
      statusCode: 409,
      replayed: false,
      state: "JOB_IDENTITY_CONFLICT",
      receipt: null,
    });
  });

test("unknown adapter/version fails closed durably without an executor or staff queue",
  async () => {
    let resolverCalls = 0;
    const worker = createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      clock: () => "2099-01-01T00:00:00.000Z",
      executorResolver: async () => {
        resolverCalls += 1;
        return null;
      },
    });
    const result = await worker.dispatch(job());
    assert.equal(result.receipt.state, "UNAVAILABLE");
    assert.equal(result.receipt.reasonCode, "UNKNOWN_EXECUTOR_BINDING");
    assert.equal(result.receipt.externalEffect, "NONE");
    assert.equal(result.receipt.retryDisposition, "DO_NOT_RETRY");
    assert.equal(result.receipt.counters.executorInvocations, 0);
    assert.equal(result.receipt.manualQueue, null);
    assert.deepEqual((await worker.dispatch(job())).receipt, result.receipt);
    assert.equal(resolverCalls, 1);
  });

test("expired and interrupted jobs become machine HOLD/UNAVAILABLE receipts without retry",
  async () => {
    let expiredExecutorCalls = 0;
    const expiredWorker = createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      clock: () => "2101-01-01T00:00:00.000Z",
      executorResolver: async () => {
        expiredExecutorCalls += 1;
        return { executeFrozenPlan: async () => completedResult() };
      },
    });
    const expired = await expiredWorker.dispatch(job());
    assert.equal(expired.receipt.state, "UNAVAILABLE");
    assert.equal(expired.receipt.reasonCode, "JOB_EXPIRED_BEFORE_EXECUTION");
    assert.equal(expiredExecutorCalls, 0);

    const interruptedWorker = createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      clock: () => "2099-01-01T00:00:00.000Z",
      executorResolver: async () => ({
        async executeFrozenPlan() { throw new Error("connection dropped"); },
      }),
    });
    const interrupted = await interruptedWorker.dispatch(job());
    assert.equal(interrupted.receipt.state, "HOLD");
    assert.equal(interrupted.receipt.reasonCode,
      "EXECUTION_INTERRUPTED_EFFECT_UNKNOWN");
    assert.equal(interrupted.receipt.externalEffect, "UNKNOWN");
    assert.equal(interrupted.receipt.retryDisposition, "DO_NOT_RETRY");
    assert.equal(interrupted.receipt.counters.executorInvocations, 1);
  });

test("the network job rejects free-form and executable additions before claim", async () => {
  const worker = createFormationJobWorkerV1({
    store: createMemoryFormationJobStoreV1(),
    clock: () => "2099-01-01T00:00:00.000Z",
    executorResolver: async () => null,
  });
  for (const extra of [
    { prompt: "buy something" },
    { instructions: "click the checkout button" },
    { url: "https://merchant.example/" },
    { code: "fetch('/checkout')" },
  ]) {
    await assert.rejects(worker.dispatch({ ...job(), ...extra }),
      /JOB_FIELDS_INVALID/u);
  }
  assert.deepEqual({
    modelCalls: OUTSIDER_FORMATION_JOB_WORKER_V1_BOUNDARY.modelCalls,
    browserClicks: OUTSIDER_FORMATION_JOB_WORKER_V1_BOUNDARY.browserClicks,
    employeeTouches: OUTSIDER_FORMATION_JOB_WORKER_V1_BOUNDARY.employeeTouches,
    userBabysitting: OUTSIDER_FORMATION_JOB_WORKER_V1_BOUNDARY.userBabysitting,
  }, { modelCalls: 0, browserClicks: 0, employeeTouches: 0,
    userBabysitting: 0 });
});
