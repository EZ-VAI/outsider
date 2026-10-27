import assert from "node:assert/strict";
import test from "node:test";

import formationWorker, { FormationJobLedger,
  createUserHeldFormationExecutionSqliteStoreV1 }
  from "../deploy/cloudflare-formation-job-worker/src/worker.mjs";
import { formationJobIdentityV1 }
  from "../src/outsider-formation-job-worker-v1.js";
import { deriveUserHeldFormationExecutorCapabilityHashV1 }
  from "../src/outsider-user-held-formation-executor-protocol-v1.js";

const formationToken = "formation-api-test-bearer-token-000000000000001";
const outcomeToken = "outcome-os-api-test-bearer-token-00000000000001";
const executorToken = "user-held-executor-test-token-000000000000000001";
const otherExecutorToken
  = "other-user-held-executor-test-token-0000000000000001";
const h = (character) => `sha256:${character.repeat(64)}`;

function job() {
  return {
    schema: "outsider/formation-job/v1",
    orderId: `order:uhf:${"d".repeat(64)}`,
    planHash: h("a"),
    adapterBinding: {
      adapterId: "user-held-sparkfun-magento-v1",
      adapterVersion: "1.0.0",
    },
    outcomeProgramHash: h("b"),
    parameterEnvelopeHash: h("c"),
    graphRefs: {
      principalEpochHash: h("1"),
      accountableDeploymentHash: h("2"),
      runtimeOrEmbodimentHash: h("3"),
      delegationHash: h("4"),
      episodeHash: h("5"),
      attemptHash: h("6"),
    },
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function bindingProjection(value = job()) {
  const identity = formationJobIdentityV1(value);
  return {
    schema: "outsider/user-held-formation-private-binding-projection/v1",
    schemaVersion: "1.0.0",
    jobKey: identity.jobKey,
    jobHash: identity.jobHash,
    planCommitmentHash: identity.job.planHash,
    parameterEnvelopeCommitmentHash: identity.job.parameterEnvelopeHash,
    commitmentAlgorithm: "HMAC-SHA-256",
    commitmentScope: "ORDER_SCOPED_PRIVATE_EXECUTOR",
    privatePlanHashProjected: false,
    privateParameterBytesProjected: false,
    privateParameterUnkeyedHashProjected: false,
    providerExchangeBytesProjected: false,
    providerExchangeUnkeyedHashesProjected: false,
    authorityMinted: false,
    capacityEstablished: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  };
}

function executorCapabilityHash(value = job(), token = executorToken) {
  return deriveUserHeldFormationExecutorCapabilityHashV1({
    bearerToken: token,
    jobHash: formationJobIdentityV1(value).jobHash,
  });
}

function publication(overrides = {}) {
  const value = job();
  return {
    schema: "outsider/user-held-formation-execution-publish-request/v1",
    job: value,
    bindingProjection: bindingProjection(value),
    executorCapabilityHash: executorCapabilityHash(value),
    publishedAt: "2026-09-04T21:00:00.000Z",
    ...overrides,
  };
}

function claim(value = job(), overrides = {}) {
  const identity = formationJobIdentityV1(value);
  return {
    schema: "outsider/user-held-formation-execution-claim-request/v1",
    jobKey: identity.jobKey,
    jobHash: identity.jobHash,
    executorCapabilityHash: executorCapabilityHash(value),
    requestedAt: "2026-09-04T21:01:00.000Z",
    ...overrides,
  };
}

function submission(value = job(), overrides = {}) {
  const identity = formationJobIdentityV1(value);
  return {
    schema: "outsider/user-held-formation-execution-result-submission/v1",
    jobKey: identity.jobKey,
    jobHash: identity.jobHash,
    leaseHash: h("0"),
    submittedAt: "2026-09-04T21:02:00.000Z",
    result: {
      state: "HOLD",
      reasonCode: "PREPAYMENT_STATE_CAPTURED",
      resultHash: h("e"),
      sourceOccurrenceHashes: [h("f")],
      externalEffect: "ATTEMPTED",
      retryDisposition: "DO_NOT_RETRY",
    },
    ...overrides,
  };
}

class FakeFormationSqliteStorage {
  constructor(database = { clientRow: null }) {
    this.database = database;
    this.sql = { exec: (statement, ...bindings) =>
      this.#exec(statement, bindings) };
  }

  transactionSync(callback) { return callback(); }

  #cursor(rows = [], rowsWritten = 0) {
    return { rowsWritten, toArray: () => structuredClone(rows) };
  }

  #exec(statement, bindings) {
    const sql = statement.replace(/\s+/gu, " ").trim();
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) return this.#cursor();
    if (sql.startsWith("SELECT job_key, job_hash, job_json,")
      && sql.includes("outsider_user_held_execution_v1")) {
      return this.#cursor(this.database.clientRow === null
        ? [] : [this.database.clientRow]);
    }
    if (sql.startsWith("INSERT INTO outsider_user_held_execution_v1")) {
      assert.equal(this.database.clientRow, null);
      this.database.clientRow = {
        job_key: bindings[0],
        job_hash: bindings[1],
        job_json: bindings[2],
        binding_projection_json: bindings[3],
        executor_capability_hash: bindings[4],
        state: "PUBLISHED",
        published_at: bindings[5],
        claimed_at: null,
        lease_hash: null,
        lease_expires_at: null,
        completion_json: null,
      };
      return this.#cursor([], 1);
    }
    if (sql.startsWith("UPDATE outsider_user_held_execution_v1 SET state = 'CLAIMED'")) {
      assert.equal(this.database.clientRow.state, "PUBLISHED");
      Object.assign(this.database.clientRow, {
        state: "CLAIMED",
        claimed_at: bindings[0],
        lease_hash: bindings[1],
        lease_expires_at: bindings[2],
      });
      return this.#cursor([], 1);
    }
    if (sql.startsWith("UPDATE outsider_user_held_execution_v1 SET state = 'EXPIRED_HOLD'")) {
      assert.equal(this.database.clientRow.state, "CLAIMED");
      this.database.clientRow.state = "EXPIRED_HOLD";
      return this.#cursor([], 1);
    }
    if (sql.startsWith("UPDATE outsider_user_held_execution_v1 SET state = 'COMPLETE'")) {
      assert.equal(["CLAIMED", "EXPIRED_HOLD"].includes(
        this.database.clientRow.state), true);
      Object.assign(this.database.clientRow, {
        state: "COMPLETE",
        completion_json: bindings[0],
      });
      return this.#cursor([], 1);
    }
    if (sql.includes("outsider_formation_job_v1")) return this.#cursor();
    throw new Error(`unhandled fake SQL: ${sql}`);
  }
}

function harness(database = { clientRow: null }) {
  let ledger = new FormationJobLedger({
    storage: new FakeFormationSqliteStorage(database),
  }, {});
  const namespace = {
    idFromName: (name) => name,
    get: () => ({ fetch: (request) => ledger.fetch(request) }),
  };
  const env = {
    FORMATION_JOBS: namespace,
    FORMATION_DISPATCH_BEARER_TOKEN: formationToken,
    OUTCOME_OS_API_BEARER_TOKEN: outcomeToken,
    FORMATION_EXECUTOR_ALLOWLIST_JSON: "[]",
  };
  async function request(path, body, token = formationToken) {
    const response = await formationWorker.fetch(new Request(
      `https://formation.example${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? { authorization: `Bearer ${token}` } : {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), env);
    return { response, value: await response.json() };
  }
  return { database, request,
    restart() {
      ledger = new FormationJobLedger({
        storage: new FakeFormationSqliteStorage(database),
      }, {});
    } };
}

test("durable user-held claim is one-shot, cold replay holds, and exact receipt replays",
  async () => {
    const { database, request, restart } = harness();
    const value = job();
    const identity = formationJobIdentityV1(value);
    const created = await request("/v1/client-executions", publication());
    assert.equal(created.response.status, 201);
    assert.equal(created.value.state, "PUBLISHED");
    assert.equal(created.value.replayed, false);
    assert.equal(created.value.privateParameterBytesStored, false);
    assert.equal(created.value.authorityMinted, false);
    assert.equal(created.value.outcomeCommitted, false);

    const executionModeConflict = await request("/v1/formation-jobs", value);
    assert.equal(executionModeConflict.response.status, 409);
    assert.equal(executionModeConflict.value.error, "EXECUTION_MODE_CONFLICT");

    const publishReplay = await request("/v1/client-executions", publication());
    assert.equal(publishReplay.response.status, 200);
    assert.equal(publishReplay.value.replayed, true);

    const claimed = await request("/v1/client-execution-claims", claim(value),
      executorToken);
    assert.equal(claimed.response.status, 200);
    assert.equal(claimed.value.state, "CLAIMED");
    assert.deepEqual(claimed.value.invocation.job, value);
    assert.equal(claimed.value.completion, null);
    const leaseHash = claimed.value.leaseHash;

    const duplicate = await request("/v1/client-execution-claims", claim(value),
      executorToken);
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.value.state, "HOLD");
    assert.equal(duplicate.value.invocation, null);
    assert.equal(duplicate.value.leaseHash, leaseHash);

    restart();
    const coldReplay = await request("/v1/client-execution-claims", claim(value),
      executorToken);
    assert.equal(coldReplay.value.state, "HOLD");
    assert.equal(coldReplay.value.invocation, null);

    const pending = await request(`/v1/client-executions/${identity.jobKey}`);
    assert.equal(pending.response.status, 202);
    assert.equal(pending.value.state, "CLAIMED");
    assert.equal(pending.value.executionDisposition,
      "EFFECT_UNKNOWN_AWAITING_HASH_ONLY_RECEIPT");
    assert.equal(pending.value.automaticRetry, false);
    assert.equal(pending.value.automaticReassignment, false);

    const result = submission(value, { leaseHash });
    const completed = await request(
      `/v1/client-executions/${identity.jobKey}/receipt`, result,
      executorToken);
    assert.equal(completed.response.status, 200);
    assert.equal(completed.value.state, "COMPLETE");
    assert.equal(completed.value.independentOutcomeTruthEstablished, false);
    assert.equal(completed.value.authorityMinted, false);
    assert.equal(completed.value.outcomeCommitted, false);

    const receiptReplay = await request(
      `/v1/client-executions/${identity.jobKey}/receipt`, result,
      executorToken);
    assert.deepEqual(receiptReplay.value, completed.value);

    restart();
    const completeClaim = await request("/v1/client-execution-claims",
      claim(value), executorToken);
    assert.equal(completeClaim.value.state, "COMPLETE");
    assert.equal(completeClaim.value.invocation, null);
    assert.deepEqual(completeClaim.value.completion, completed.value);
    assert.equal(database.clientRow.state, "COMPLETE");
  });

test("publication binds a capability, rejects PII-shaped additions, and never elevates a receipt",
  async () => {
    const { request } = harness();
    const value = job();
    const identity = formationJobIdentityV1(value);
    const unauthorized = await request("/v1/client-executions", publication(),
      outcomeToken);
    assert.equal(unauthorized.response.status, 401);

    const withPrivateBytes = await request("/v1/client-executions", {
      ...publication(), privateParameterBytes: "private-address",
    });
    assert.equal(withPrivateBytes.response.status, 400);
    assert.equal(withPrivateBytes.value.error, "API_REQUEST_FIELDS_INVALID");

    const falseProjection = await request("/v1/client-executions", {
      ...publication(), bindingProjection: {
        ...bindingProjection(value), privateParameterBytesProjected: true,
      },
    });
    assert.equal(falseProjection.response.status, 400);
    assert.equal(falseProjection.value.error, "CLIENT_BINDING_PROJECTION_INVALID");

    const privateOrderJob = { ...value,
      orderId: "order:user-held-private-0001" };
    const privateOrder = await request("/v1/client-executions", {
      ...publication(),
      job: privateOrderJob,
      bindingProjection: bindingProjection(privateOrderJob),
      executorCapabilityHash: executorCapabilityHash(privateOrderJob),
    });
    assert.equal(privateOrder.response.status, 400);
    assert.equal(privateOrder.value.error, "CLIENT_PRIVATE_ORDER_ID_INVALID");

    assert.equal((await request("/v1/client-executions", publication()))
      .response.status, 201);
    const wrongCapability = await request("/v1/client-execution-claims",
      claim(value, { executorCapabilityHash: h("9") }), executorToken);
    assert.equal(wrongCapability.response.status, 401);
    assert.equal(wrongCapability.value.error, "UNAUTHORIZED");
    const wrongExecutorClaim = await request("/v1/client-execution-claims",
      claim(value, { executorCapabilityHash:
        executorCapabilityHash(value, otherExecutorToken) }),
    otherExecutorToken);
    assert.equal(wrongExecutorClaim.response.status, 401);
    assert.equal(wrongExecutorClaim.value.error, "UNAUTHORIZED");

    const claimed = await request("/v1/client-execution-claims", claim(value),
      executorToken);
    const wrongPath = await request(
      `/v1/client-executions/${h("9")}/receipt`,
      submission(value, { leaseHash: claimed.value.leaseHash }), executorToken);
    assert.equal(wrongPath.response.status, 400);
    assert.equal(wrongPath.value.error, "CLIENT_RESULT_PATH_MISMATCH");

    const wrongExecutor = await request(
      `/v1/client-executions/${identity.jobKey}/receipt`,
      submission(value, { leaseHash: claimed.value.leaseHash }),
      otherExecutorToken);
    assert.equal(wrongExecutor.response.status, 401);
    assert.equal(wrongExecutor.value.error, "UNAUTHORIZED");

    const completed = await request(
      `/v1/client-executions/${identity.jobKey}/receipt`,
      submission(value, { leaseHash: claimed.value.leaseHash }), executorToken);
    const conflict = await request(
      `/v1/client-executions/${identity.jobKey}/receipt`,
      submission(value, { leaseHash: claimed.value.leaseHash,
        result: { ...submission(value).result, resultHash: h("7") } }),
      executorToken);
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.value.error, "CLIENT_RESULT_REPLAY_CONFLICT");
    assert.equal(completed.value.independentOutcomeTruthEstablished, false);
  });

test("expired leases enter a durable hold and late receipts remain hash-only evidence",
  () => {
    let observedAt = "2026-09-04T21:00:00.000Z";
    const storage = new FakeFormationSqliteStorage();
    const store = createUserHeldFormationExecutionSqliteStoreV1({
      storage,
      clock: () => observedAt,
    });
    const value = { ...job(), expiresAt: "2026-09-04T21:02:00.000Z" };
    const identity = formationJobIdentityV1(value);
    const capabilityHash = executorCapabilityHash(value);
    store.publish({
      identity,
      bindingProjection: bindingProjection(value),
      executorCapabilityHash: capabilityHash,
      publishedAt: observedAt,
    });
    const claimed = store.claim(claim(value));
    assert.equal(claimed.state, "CLAIMED");

    observedAt = value.expiresAt;
    const expired = store.read(identity.jobKey);
    assert.equal(expired.state, "EXPIRED_HOLD");
    assert.equal(store.claim(claim(value)).state, "HOLD");
    assert.equal(storage.database.clientRow.state, "EXPIRED_HOLD");

    const lateSubmission = submission(value, {
      leaseHash: claimed.leaseHash,
      submittedAt: "2026-09-04T21:01:30.000Z",
    });
    const completed = store.complete(lateSubmission, capabilityHash);
    assert.equal(completed.state, "COMPLETE");
    assert.equal(completed.leaseExpiredBeforeReceipt, true);
    assert.equal(completed.authorityMinted, false);
    assert.equal(completed.independentOutcomeTruthEstablished, false);
    assert.equal(completed.outcomeCommitted, false);
    assert.deepEqual(store.complete(lateSubmission, capabilityHash), completed);
  });

test("manifest exposes the PII-local transport and its non-authoritative boundary",
  async () => {
    const { request } = harness();
    const capabilities = await request("/v1/outcomes/capabilities", undefined,
      outcomeToken);
    assert.equal(capabilities.response.status, 200);
    assert.equal(capabilities.value.apiVersion, "2.5.0");
    assert.deepEqual(capabilities.value.userHeldExecutorContract.durableStates,
      ["PUBLISHED", "CLAIMED", "EXPIRED_HOLD", "COMPLETE"]);
    assert.equal(capabilities.value.userHeldExecutorContract
      .expiredEffectfulLeaseDisposition,
    "EXPIRED_HOLD_NEW_VERSIONED_ATTEMPT_REQUIRED");
    assert.equal(capabilities.value.userHeldExecutorContract
      .repeatedUnclosedClaimReturnsHold, true);
    assert.equal(capabilities.value.userHeldExecutorContract.boundary
      .centralPrivateParameterBytes, false);
    assert.equal(capabilities.value.userHeldExecutorContract.boundary
      .centralPrivateOrderId, false);
    assert.equal(capabilities.value.userHeldExecutorContract.boundary
      .centralOrderIdIsKeyedCommitment, true);
    assert.equal(capabilities.value.boundary
      .clientExecutorReceiptAcceptedAsIndependentOutcomeTruth, false);
    assert.equal(capabilities.value.routes.some((route) =>
      route.path === "/v1/client-execution-claims"
      && route.effect === "DURABLE_ONE_TIME_CLAIM"), true);
  });
