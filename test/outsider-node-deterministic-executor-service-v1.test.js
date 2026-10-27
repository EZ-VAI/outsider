import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import {
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createDeterministicBuyerNativeStagePlanV1,
} from "../src/outsider-deterministic-buyer-native-plan-runtime-v1.js";
import {
  createFormationJobWorkerV1,
  createMemoryFormationJobStoreV1,
  formationJobIdentityV1,
} from "../src/outsider-formation-job-worker-v1.js";
import {
  createNodeDeterministicExecutorHttpHandlerV1,
  createNodeDeterministicExecutorServiceV1,
} from "../src/outsider-node-deterministic-executor-service-v1.js";

const NOW = "2099-01-01T12:00:00.000Z";
const SOURCE_EXPIRY = "2099-01-01T13:00:00.000Z";
const OPERATION_EXPIRY = "2099-01-01T13:30:00.000Z";
const FORMATION_EXPIRY = "2099-01-01T14:00:00.000Z";
const CAPABILITY_EXPIRY = "2099-01-01T15:00:00.000Z";
const TOKEN = "executor-test-bearer-token-0123456789abcdef";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-node-executor-")));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function graphRefs() {
  return {
    principalEpochHash: h("principal"),
    accountableDeploymentHash: h("deployment"),
    runtimeOrEmbodimentHash: h("runtime"),
    delegationHash: h("delegation"),
    episodeHash: h("episode"),
    attemptHash: h("attempt"),
  };
}

function capability(label, calls) {
  const metadata = {
    capabilityRefHash: h(`${label}:capability`),
    accountRefHash: h(`${label}:account`),
    nodeRefHash: h(`${label}:node`),
    issuedAt: "2099-01-01T11:00:00.000Z",
    expiresAt: CAPABILITY_EXPIRY,
    supportedOperations: ["QUOTE"],
  };
  return issueBuyerNativeTransactionAccountCapabilityV1(metadata, {
    async requestImpl(request) {
      calls.push(request);
      return {
        sourceBytes: Buffer.from("real-provider-quote-response", "utf8"),
        sourceState: "QUOTE_AVAILABLE",
        sourceExpiresAt: SOURCE_EXPIRY,
        sourceRecordClass: "QUOTE",
      };
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

function fixture(t) {
  const providerCalls = [];
  const issuedCapability = capability("primary", providerCalls);
  const plan = createDeterministicBuyerNativeStagePlanV1({
    planRefHash: h("plan-ref"),
    transactionRefHash: h("transaction-ref"),
    outcomeIntentRefHash: h("outcome-intent"),
    capability: issuedCapability,
    capabilityBindingHash: issuedCapability.capabilityBindingHash,
    routeRole: "PRIMARY",
    formationExpiresAt: FORMATION_EXPIRY,
    stages: [{
      stageId: "01-quote",
      operation: "QUOTE",
      operationNonce: "node-service-quote-nonce-00000001",
      requestBytes: Buffer.from("exact-provider-quote-request", "utf8"),
      expiresAt: OPERATION_EXPIRY,
      triggerOccurrenceHash: null,
    }],
  });
  const parameterEnvelopeBytes = Buffer.from(
    "private-order-parameters-not-on-network", "utf8");
  const registration = {
    adapterId: "merchant-buyer-native-v1",
    adapterVersion: "1.0.0",
    orderId: "order:executor-e2e-0001",
    outcomeProgramHash: h("outcome-program"),
    graphRefs: graphRefs(),
    parameterEnvelopeBytes,
    plan,
    capability: issuedCapability,
  };
  let monotonic = 0;
  const service = createNodeDeterministicExecutorServiceV1({
    registrations: [registration],
    journalDirectory: privateDirectory(t),
    clock: () => NOW,
    monotonicClock: () => monotonic++,
  });
  const job = {
    schema: "outsider/formation-job/v1",
    orderId: registration.orderId,
    planHash: plan.planHash,
    adapterBinding: { adapterId: registration.adapterId,
      adapterVersion: registration.adapterVersion },
    outcomeProgramHash: registration.outcomeProgramHash,
    parameterEnvelopeHash: bytesHash(parameterEnvelopeBytes),
    graphRefs: registration.graphRefs,
    issuedAt: "2099-01-01T11:30:00.000Z",
    expiresAt: FORMATION_EXPIRY,
  };
  return { service, job, plan, registration, parameterEnvelopeBytes,
    providerCalls };
}

test("Formation Worker through the Node executor performs one provider request and replay performs zero",
  async (t) => {
    const value = fixture(t);
    let resolverCalls = 0;
    const worker = createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      clock: () => NOW,
      executorResolver: async (binding) => {
        resolverCalls += 1;
        assert.deepEqual(binding, {
          adapterId: value.registration.adapterId,
          adapterVersion: value.registration.adapterVersion,
          planHash: value.plan.planHash,
        });
        return value.service;
      },
    });

    const first = await worker.dispatch(value.job);
    assert.equal(first.statusCode, 200);
    assert.equal(first.replayed, false);
    assert.equal(first.receipt.state, "COMPLETED");
    assert.equal(first.receipt.reasonCode, "PLAN_EXECUTED");
    assert.equal(first.receipt.externalEffect, "READ_ONLY");
    assert.equal(first.receipt.sourceOccurrenceHashes.length, 1);
    assert.equal(first.receipt.counters.executorInvocations, 1);
    assert.equal(value.providerCalls.length, 1);

    const replay = await worker.dispatch(value.job);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.receipt, first.receipt);
    assert.equal(value.providerCalls.length, 1);
    assert.equal(resolverCalls, 1);

    const publicRegistry = value.service.describe();
    const publicText = JSON.stringify(publicRegistry);
    assert.equal(publicRegistry.registrationCount, 1);
    assert.equal(publicRegistry.registryMutable, false);
    assert.equal(publicRegistry.privateParameterEnvelopeProjected, false);
    assert.equal(publicText.includes(value.parameterEnvelopeBytes.toString("utf8")), false);
    assert.equal(publicText.includes("exact-provider-quote-request"), false);
  });

test("a fresh Formation ledger cold-replays the same provider occurrence without another request",
  async (t) => {
    const value = fixture(t);
    const worker = () => createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      clock: () => NOW,
      executorResolver: async () => value.service,
    });
    const first = await worker().dispatch(value.job);
    const coldReplay = await worker().dispatch(value.job);
    assert.equal(first.receipt.state, "COMPLETED");
    assert.equal(coldReplay.receipt.state, "COMPLETED");
    assert.equal(value.providerCalls.length, 1);
    assert.deepEqual(coldReplay.receipt.sourceOccurrenceHashes,
      first.receipt.sourceOccurrenceHashes);
  });

test("private parameter, graph, capability, and invocation hash mismatch fail before provider effect",
  async (t) => {
    const value = fixture(t);
    const changedParameter = { ...value.job, parameterEnvelopeHash: h("wrong") };
    const changedIdentity = formationJobIdentityV1(changedParameter);
    const rejected = await value.service.handleInvocation({
      schema: "outsider/formation-executor-invocation/v1",
      job: changedIdentity.job,
      jobHash: changedIdentity.jobHash,
      jobKey: changedIdentity.jobKey,
    });
    assert.equal(rejected.state, "UNAVAILABLE");
    assert.equal(rejected.reasonCode, "JOB_BINDING_MISMATCH");
    assert.equal(rejected.externalEffect, "NONE");
    assert.equal(value.providerCalls.length, 0);

    const identity = formationJobIdentityV1(value.job);
    await assert.rejects(value.service.handleInvocation({
      schema: "outsider/formation-executor-invocation/v1",
      job: identity.job,
      jobHash: h("forged-job-hash"),
      jobKey: identity.jobKey,
    }), /INVOCATION_HASH_MISMATCH/u);
    assert.equal(value.providerCalls.length, 0);

    const wrongCapability = capability("wrong", []);
    assert.throws(() => createNodeDeterministicExecutorServiceV1({
      registrations: [{ ...value.registration, capability: wrongCapability }],
      journalDirectory: privateDirectory(t),
      clock: () => NOW,
      monotonicClock: () => 0,
    }), /CAPABILITY_BINDING_MISMATCH/u);
    assert.equal(value.providerCalls.length, 0);
  });

function invokeHttp(handler, input) {
  return new Promise((resolve, reject) => {
    const request = Readable.from(input.body === undefined
      ? [] : [Buffer.from(input.body, "utf8")]);
    request.method = input.method;
    request.url = input.url;
    request.headers = input.headers ?? {};
    const response = {
      statusCode: null,
      headers: null,
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
      },
      end(bytes) {
        try {
          resolve({ statusCode: this.statusCode, headers: this.headers,
            body: JSON.parse(Buffer.from(bytes).toString("utf8")) });
        } catch (error) { reject(error); }
      },
    };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}

test("Node HTTP entry is bearer-only, bounded, and accepts only the hash-only invocation",
  async (t) => {
    const value = fixture(t);
    const handler = createNodeDeterministicExecutorHttpHandlerV1({
      service: value.service,
      bearerToken: TOKEN,
    });
    const identity = formationJobIdentityV1(value.job);
    const invocation = JSON.stringify({
      schema: "outsider/formation-executor-invocation/v1",
      job: identity.job,
      jobHash: identity.jobHash,
      jobKey: identity.jobKey,
    });
    const unauthorized = await invokeHttp(handler, {
      method: "POST",
      url: "/v1/execute-frozen-plan",
      headers: { authorization: "Bearer wrong", "content-type": "application/json" },
      body: invocation,
    });
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(value.providerCalls.length, 0);

    const oversized = await invokeHttp(handler, {
      method: "POST",
      url: "/v1/execute-frozen-plan",
      headers: { authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json", "content-length": "20000" },
      body: "{}",
    });
    assert.equal(oversized.statusCode, 413);
    assert.equal(value.providerCalls.length, 0);

    const executed = await invokeHttp(handler, {
      method: "POST",
      url: "/v1/execute-frozen-plan",
      headers: { authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(invocation)) },
      body: invocation,
    });
    assert.equal(executed.statusCode, 200);
    assert.equal(executed.body.state, "COMPLETED");
    assert.equal(value.providerCalls.length, 1);

    const injected = JSON.stringify({ ...JSON.parse(invocation),
      prompt: "click checkout" });
    const rejected = await invokeHttp(handler, {
      method: "POST",
      url: "/v1/execute-frozen-plan",
      headers: { authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json" },
      body: injected,
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(value.providerCalls.length, 1);
  });
