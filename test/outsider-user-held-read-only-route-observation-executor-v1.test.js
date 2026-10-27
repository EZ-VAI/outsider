import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createMemoryUserHeldFormationLeaseBrokerV1,
  deriveUserHeldFormationExecutorCapabilityHashV1,
} from "../src/outsider-user-held-formation-executor-protocol-v1.js";
import { runUserHeldFormationExecutorOnceV1 }
  from "../src/outsider-user-held-formation-executor-client-v1.js";
import {
  OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_BOUNDARY,
  OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS,
  createUserHeldReadOnlyRouteObservationCompositionV1,
  createUserHeldReadOnlyRouteObservationMachineAdapterV1,
} from "../src/outsider-user-held-read-only-route-observation-executor-v1.js";

const NOW = "2026-09-05T01:00:00.000Z";
const EXPIRES = "2026-09-05T02:00:00.000Z";
const TOKEN = "test-only-neutral-user-held-observer-bearer-0001";
const hashBytes = (value) => `sha256:${createHash("sha256")
  .update(value).digest("hex")}`;
const h = (value) => hashBytes(Buffer.from(value, "utf8"));

function root(t, label) {
  const value = mkdtempSync(path.join(tmpdir(), `outsider-${label}-`));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function refs(label) {
  return {
    principalEpochHash: h(`${label}:principal`),
    accountableDeploymentHash: h(`${label}:deployment`),
    runtimeOrEmbodimentHash: h(`${label}:runtime`),
    delegationHash: h(`${label}:delegation`),
    episodeHash: h(`${label}:episode`),
    attemptHash: h(`${label}:user-held-route-observation-attempt`),
  };
}

function json(value) {
  return new Response(`${canonicalizeStrict(value)}\n`, { status: 200,
    headers: { "content-type": "application/json" } });
}

function centralFetch(broker, token, bodies) {
  return async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://formation.example");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.authorization, `Bearer ${token}`);
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    if (parsed.pathname === "/v1/client-execution-claims") {
      return json(broker.claim(body));
    }
    if (parsed.pathname.startsWith("/v1/client-executions/")
      && parsed.pathname.endsWith("/receipt")) {
      return json(broker.complete(body));
    }
    return new Response("not found", { status: 404 });
  };
}

function readCanonical(file) {
  const bytes = readFileSync(file);
  const value = JSON.parse(bytes.toString("utf8"));
  assert.equal(bytes.toString("utf8"), `${canonicalizeStrict(value)}\n`);
  return value;
}

function assertPrivateTree(runDirectory) {
  assert.equal(statSync(runDirectory).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(runDirectory).sort(), [
    "local-execution-marker.v1.json",
    "result-receipt.v1.json",
    "source-occurrence.v1.json",
    "source.v1.bin",
  ]);
  for (const name of readdirSync(runDirectory)) {
    assert.equal(statSync(path.join(runDirectory, name)).mode & 0o777, 0o600);
  }
}

test("one generic user-held adapter executes BestBuy, Target, and arbitrary seller observations without central private data",
  async (t) => {
    const sellers = [
      { label: "bestbuy", origin: "https://www.bestbuy.com",
        product: "bestbuy-private-sku", declaration: "ATP" },
      { label: "target", origin: "https://redsky.target.com",
        product: "target-private-tcin", declaration: "ACK" },
      { label: "independent", origin: "https://seller.example.invalid",
        product: "independent-private-resource", declaration: "RECEIPT" },
    ];
    const publicAdapterBindings = [];
    for (const seller of sellers) {
      const privateRoot = root(t, seller.label);
      const postalCode = `private-postal-${seller.label}`;
      const privateEnvelopeBytes = Buffer.from(canonicalizeStrict({
        sellerOrigin: seller.origin,
        routeUrl: `${seller.origin}/private-observation-route`,
        providerResourceId: seller.product,
        destinationPostalCode: postalCode,
        contact: `${seller.label}@private.example.invalid`,
      }), "utf8");
      const rawSourceBytes = Buffer.from(
        `raw-${seller.label}-source-${seller.product}-${postalCode}`, "utf8");
      let machineCalls = 0;
      const adapterInstanceRefHash = h(`${seller.label}:local-adapter`);
      const machineAdapter
        = createUserHeldReadOnlyRouteObservationMachineAdapterV1({
          adapterInstanceRefHash,
          async observeReadOnly(command) {
            machineCalls += 1;
            assert.equal(command.operation, "READ_ONLY_SOURCE_OBSERVATION");
            assert.equal(command.executionClass,
              "READ_ONLY_SOURCE_OBSERVATION");
            assert.deepEqual(command.privateEnvelopeBytes,
              privateEnvelopeBytes);
            return {
              rawSourceBytes,
              sourceState: "OBSERVED",
              sourceDeclarationClass: seller.declaration,
              sourceExpiresAt: "2026-09-05T01:30:00.000Z",
            };
          },
        });
      const composition = createUserHeldReadOnlyRouteObservationCompositionV1({
        orderId: `order:neutral-observation-${seller.label}`,
        outcomeProgramHash: h("shared-outcome-program"),
        graphRefs: refs(seller.label),
        privateEnvelopeBytes,
        privateRoot,
        issuedAt: "2026-09-05T00:30:00.000Z",
        expiresAt: EXPIRES,
      }, { machineAdapter, clock: () => NOW });
      const binding = composition.createUserHeldBinding(
        Buffer.alloc(32, seller.label.charCodeAt(0)));
      publicAdapterBindings.push(binding.job.adapterBinding);
      const broker = createMemoryUserHeldFormationLeaseBrokerV1({
        clock: () => NOW,
      });
      const capabilityHash = deriveUserHeldFormationExecutorCapabilityHashV1({
        bearerToken: TOKEN,
        jobHash: binding.jobHash,
      });
      broker.enqueue(binding.job, capabilityHash);
      const centralBodies = [];
      const run = () => runUserHeldFormationExecutorOnceV1({
        centralOrigin: "https://formation.example",
        bearerToken: TOKEN,
        executorCapabilityHash: capabilityHash,
        binding,
      }, { fetchImpl: centralFetch(broker, TOKEN, centralBodies),
        clock: () => NOW });
      const first = await run();
      assert.equal(first.state, "COMPLETE");
      assert.equal(first.executionPerformed, true);
      assert.equal(machineCalls, 1);
      const brokerState = broker.read(binding.jobKey);
      assert.equal(brokerState.completion.result.state, "HOLD");
      assert.equal(brokerState.completion.result.externalEffect, "READ_ONLY");
      assert.equal(brokerState.completion.result.reasonCode,
        "READ_ONLY_ROUTE_OBSERVATION_RECORDED");
      assert.equal(brokerState.completion.authorityMinted, false);
      assert.equal(brokerState.completion.independentOutcomeTruthEstablished,
        false);
      assert.equal(brokerState.completion.outcomeCommitted, false);

      const runDirectory = path.join(privateRoot,
        "user-held-read-only-route-observation-v1",
        composition.localProjection.jobHash.slice(7));
      assertPrivateTree(runDirectory);
      const rawFile = path.join(runDirectory, "source.v1.bin");
      assert.deepEqual(readFileSync(rawFile), rawSourceBytes);
      const occurrence = readCanonical(path.join(runDirectory,
        "source-occurrence.v1.json"));
      const receipt = readCanonical(path.join(runDirectory,
        "result-receipt.v1.json"));
      assert.equal(occurrence.schema,
        OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_SCHEMAS
          .sourceOccurrence);
      assert.equal(occurrence.adapterInstanceRefHash, adapterInstanceRefHash);
      assert.equal(occurrence.sourceBytesHash, hashBytes(rawSourceBytes));
      assert.equal(occurrence.sourceDeclarationClass, seller.declaration);
      assert.equal(occurrence.externalEffect, "READ_ONLY");
      assert.equal(occurrence.capacityReserved, false);
      assert.equal(receipt.sourceOccurrenceHash, occurrence.occurrenceHash);
      assert.equal(receipt.capacityReserved, false);
      assert.equal(receipt.authorityMinted, false);
      assert.equal(receipt.independentOutcomeTruthEstablished, false);
      assert.equal(receipt.outcomeCommitted, false);

      const centralText = canonicalizeStrict({ bodies: centralBodies,
        brokerState, publicBinding: binding.publicProjection,
        enqueuedJob: binding.job });
      for (const privateValue of [seller.origin, seller.product, postalCode,
        `${seller.label}@private.example.invalid`, rawSourceBytes.toString(),
        adapterInstanceRefHash, occurrence.sourceBytesHash,
        occurrence.occurrenceHash, receipt.receiptHash,
        composition.job.orderId, composition.job.planHash,
        composition.job.parameterEnvelopeHash,
        composition.localProjection.jobHash]) {
        assert.equal(centralText.includes(privateValue), false,
          `central projection leaked ${privateValue}`);
      }
      assert.equal(binding.publicProjection.providerExchangeBytesProjected,
        false);
      assert.equal(
        binding.publicProjection.providerExchangeUnkeyedHashesProjected, false);
      const replay = await run();
      assert.equal(replay.replayed, true);
      assert.equal(replay.executionPerformed, false);
      assert.equal(replay.resultHash, first.resultHash);
      assert.equal(machineCalls, 1);

      let coldMachineCalls = 0;
      const coldAdapter
        = createUserHeldReadOnlyRouteObservationMachineAdapterV1({
          adapterInstanceRefHash,
          async observeReadOnly() {
            coldMachineCalls += 1;
            throw new Error("durable replay must not observe again");
          },
        });
      const coldComposition
        = createUserHeldReadOnlyRouteObservationCompositionV1({
          orderId: `order:neutral-observation-${seller.label}`,
          outcomeProgramHash: h("shared-outcome-program"),
          graphRefs: refs(seller.label), privateEnvelopeBytes, privateRoot,
          issuedAt: "2026-09-05T00:30:00.000Z", expiresAt: EXPIRES,
        }, { machineAdapter: coldAdapter, clock: () => NOW });
      const coldResult = await coldComposition.executor.executeFrozenPlan({
        job: coldComposition.job,
        jobHash: coldComposition.localProjection.jobHash,
        jobKey: coldComposition.localProjection.jobKey,
      });
      assert.equal(coldResult.resultHash, receipt.receiptHash);
      assert.equal(coldResult.externalEffect, "READ_ONLY");
      assert.equal(coldMachineCalls, 0);
    }
    assert.deepEqual(publicAdapterBindings, publicAdapterBindings.map(() => ({
      adapterId: "user-held-read-only-route-observation",
      adapterVersion: "1.0.0",
    })));
    assert.equal(
      OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_BOUNDARY
        .sellerSpecificCentralLogic, false);
    assert.equal(
      OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_BOUNDARY
        .typedGraphAttemptIssuedByThisModule, false);
  });

test("machine adapter contract fails closed before raw persistence and never gains write or commitment semantics",
  async (t) => {
    const privateRoot = root(t, "invalid-neutral-observation");
    assert.throws(() => createUserHeldReadOnlyRouteObservationCompositionV1({
      orderId: "order:neutral-observation-invalid-unbranded",
      outcomeProgramHash: h("outcome"), graphRefs: refs("unbranded"),
      privateEnvelopeBytes: Buffer.from("private", "utf8"), privateRoot,
      issuedAt: "2026-09-05T00:30:00.000Z", expiresAt: EXPIRES,
    }, { machineAdapter: { observeReadOnly() {} }, clock: () => NOW }),
    /DEPENDENCIES_INVALID/u);

    let calls = 0;
    const machineAdapter
      = createUserHeldReadOnlyRouteObservationMachineAdapterV1({
        adapterInstanceRefHash: h("malformed-local-adapter"),
        async observeReadOnly() {
          calls += 1;
          return { rawSourceBytes: Buffer.from("must-not-persist", "utf8"),
            sourceState: "OBSERVED", sourceDeclarationClass: "ATP",
            sourceExpiresAt: "2026-09-05T01:30:00.000Z",
            mutationReceipt: "forbidden-extra-field" };
        },
      });
    const composition = createUserHeldReadOnlyRouteObservationCompositionV1({
      orderId: "order:neutral-observation-invalid-response",
      outcomeProgramHash: h("outcome"), graphRefs: refs("invalid"),
      privateEnvelopeBytes: Buffer.from("private-machine-envelope", "utf8"),
      privateRoot,
      issuedAt: "2026-09-05T00:30:00.000Z", expiresAt: EXPIRES,
    }, { machineAdapter, clock: () => NOW });
    const result = await composition.executor.executeFrozenPlan({
      job: composition.job,
      jobHash: composition.localProjection.jobHash,
      jobKey: composition.localProjection.jobKey,
    });
    assert.equal(calls, 1);
    assert.equal(result.state, "HOLD");
    assert.equal(result.externalEffect, "READ_ONLY");
    assert.equal(result.retryDisposition, "DO_NOT_RETRY");
    assert.equal(result.sourceOccurrenceHashes.length, 0);
    const runDirectory = path.join(privateRoot,
      "user-held-read-only-route-observation-v1",
      composition.localProjection.jobHash.slice(7));
    assert.deepEqual(readdirSync(runDirectory), [
      "local-execution-marker.v1.json",
    ]);
    assert.equal(
      OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_BOUNDARY
        .writeMethodsPermitted, false);
    assert.equal(
      OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_BOUNDARY
        .sellerReceiptEstablishesCapacity, false);
    assert.equal(
      OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_BOUNDARY
        .atpEstablishesCapacity, false);
    assert.equal(
      OUTSIDER_USER_HELD_READ_ONLY_ROUTE_OBSERVATION_EXECUTOR_V1_BOUNDARY
        .outcomeCommitted, false);
  });
