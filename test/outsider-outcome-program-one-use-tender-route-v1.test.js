import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_SCHEMA,
  runBraveOneUseTenderProductionProbeV1,
} from "../src/outsider-brave-one-use-tender-production-probe-v1.js";
import {
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  runOrderScopedDiscoveryFederationV1,
} from "../src/outsider-order-scoped-discovery-federation-v1.js";
import {
  OUTSIDER_OUTCOME_PROGRAM_ONE_USE_TENDER_ROUTE_V1_BOUNDARY,
  createOrderScopedSellerOriginDiscoveryNodeV1,
  dispatchOutcomeProgramOneUseTenderV1,
} from "../src/outsider-outcome-program-one-use-tender-route-v1.js";
import { compileOutcomeProgramV1 }
  from "../src/outsider-outcome-program-v1.js";
import { createSellerOwnedDurableCapacityEmitterAdapterV2 }
  from "../src/outsider-seller-owned-durable-one-use-capacity-emitter-v2.js";
import {
  createSellerOwnedHttpOneUseTenderEndpointV1,
  handleSellerOwnedHttpOneUseTenderRequestV1,
} from "../src/outsider-seller-owned-http-one-use-tender-endpoint-v1.js";
import { createSellerOwnedOneUseCapacityEmitterV1 }
  from "../src/outsider-seller-owned-one-use-capacity-emitter-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";
import { main as runProductionProbeCli }
  from "../scripts/outsider-brave-one-use-tender-production-probe-v1.mjs";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const digest = (domain, value) => h(
  `${domain}\0${canonicalizeStrict(value)}`);
const PUBLIC_V4 = "93.184.216.34";
const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "outcome-program-live-one-use-route",
});
const resourceSlot = fixture.slots.find((item) =>
  item.requirementKind === "RESOURCE");
const responseReplay = resourceSlot.mailbox.source.oneUseResponseReplay;
const initialResponse = responseReplay.responses[0];
const external = resourceSlot.mailbox.ownerStanding.source.externalStandingReplay;
const witnessRoute = fixture.routeDiscovery.byKind.EVIDENCE;

function privateDirectory(t, label) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), label)));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function arbitraryProgram(tenderHash) {
  return compileOutcomeProgramV1({
    programId: "program_any_domain_001",
    orderId: "order_any_domain_001",
    createdAt: "2026-09-02T12:00:00.000Z",
    formationDeadline: "2026-09-02T14:00:00.000Z",
    completionDeadline: "2026-09-02T18:00:00.000Z",
    tenderHash,
    outcome: {
      statement: "Deliver one bounded outcome in an unspecified domain.",
      acceptance: [{
        criterionId: "exact_result",
        comparator: "SOURCE_SPECIFIC",
        subject: "the compiled outcome",
        expected: { state: "DELIVERED" },
      }],
      budget: { currency: "USD", maximumAmountMinor: "0" },
    },
    requirements: [
      {
        requirementId: "primary_any",
        role: "PRIMARY",
        capability: "DOMAIN_DECLARED_PRIMARY_CAPABILITY",
        constraints: { source: "OUTCOME_PROGRAM" },
        minimumReservationMs: 1,
        dependsOnRequirementIds: [],
      },
      {
        requirementId: "recovery_any",
        role: "RECOVERY",
        capability: "DOMAIN_DECLARED_RECOVERY_CAPABILITY",
        constraints: { source: "OUTCOME_PROGRAM" },
        minimumReservationMs: 1,
        dependsOnRequirementIds: [],
      },
      {
        requirementId: "witness_any",
        role: "INDEPENDENT_WITNESS",
        capability: "DOMAIN_DECLARED_WITNESS_CAPABILITY",
        constraints: { source: "OUTCOME_PROGRAM" },
        minimumReservationMs: 1,
        dependsOnRequirementIds: ["primary_any", "recovery_any"],
      },
    ],
    nodes: [{
      nodeId: "deliver_any",
      kind: "EFFECT",
      dependsOn: [],
      primaryRequirementId: "primary_any",
      recoveryRequirementId: "recovery_any",
      witnessRequirementId: "witness_any",
      input: {},
      acceptance: ["exact_result"],
    }],
    obligations: [{
      obligationId: "release_any",
      trigger: "ALWAYS",
      targetRequirementId: "primary_any",
      nodeId: "deliver_any",
      action: "RELEASE_EPHEMERAL_CAPACITY",
      input: {},
      deadline: "2026-09-02T18:30:00.000Z",
    }],
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false },
  });
}

function exactResourceBinding() {
  const section = fixture.tender.resourceRequirements;
  const requirement = section.items[0];
  return {
    requirementKind: "RESOURCE",
    requirementId: requirement.resourceRequirementId,
    requirementSetHash: section.requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: fixture.tender.tenderHash,
        requirementKind: "RESOURCE",
        requirementSetHash: section.requirementSetHash,
        requirement,
      }),
  };
}

async function liveCandidateFederation(nodeKind, seen) {
  const requirement = exactResourceBinding();
  const occurrenceId = "discovery_1234567890abcdef1234567890abcdef";
  const nodeSlotId = "node_1234567890abcdef1234567890abcdef";
  const expiresAt = "2026-09-02T14:00:00.000Z";
  const capability = createOrderScopedSellerOriginDiscoveryNodeV1({
    nodeKind,
    async discoverSellerOrigin(invocation) {
      seen.push({
        nodeKind: invocation.nodeKind,
        tenderHash: invocation.tender.tenderHash,
        requirementId: invocation.requirementId,
      });
      return {
        sellerOrigin: "https://seller.example",
        externalInfrastructureNetworkIoAttempted: true,
      };
    },
  });
  const result = await runOrderScopedDiscoveryFederationV1({
    tender: fixture.tender,
    asOf: "2026-09-02T12:30:00.000Z",
    publicPlan: {
      schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId: "federation_1234567890abcdef1234567890abcdef",
      tenderHash: fixture.tender.tenderHash,
      workOrderHash: fixture.tender.workOrderHash,
      typedGraphHash: fixture.tender.typedGraph.typedGraphHash,
      concurrencyLimit: 1,
      jobs: [{
        occurrenceId,
        nodeSlotId,
        nodeKind,
        ...requirement,
        expiresAt,
        maximumRuntimeMs: 1_000,
      }],
    },
    privateJobs: [{
      occurrenceId,
      nodeInput: {},
      privateBindingNonce: h("private-discovery-binding"),
    }],
    privateProjectionNonce: h("private-federation-projection"),
  }, {
    capabilityBindings: [{ nodeSlotId, capability }],
  });
  return { result, occurrenceId, expiresAt };
}

function sellerEndpoint(t, directory) {
  return createSellerOwnedHttpOneUseTenderEndpointV1({
    sellerEmitterCapability: createSellerOwnedOneUseCapacityEmitterV1({
      verifierContext: external.verifierContext,
      expectedVerifierContextHash: external.expectedVerifierContextHash,
      sellerPrivateKeyPem: resourceSlot.mailbox.standingKey.privateKeyPem,
    }),
    durableEmitterAdapter: createSellerOwnedDurableCapacityEmitterAdapterV2({
      directory,
      ledgerId: "ledger_1234567890abcdef1234567890abcdef",
      adapterInstanceRefHash: h("seller-adapter"),
      sellerEmissionPolicyRefHash: h("seller-emission-policy"),
    }),
    expectedTenderHash: fixture.tender.tenderHash,
    expectedInitialResponseHash: initialResponse.responseHash,
    expectedProviderRefHash: initialResponse.providerRefHash,
    expectedScopeHash: initialResponse.scopeHash,
    expectedResponseNonceHash: initialResponse.responseNonceHash,
    expectedResponseExpiresAt: initialResponse.expiresAt,
    expectedHttpRequestNonceHash: h("http-request-nonce"),
    validFrom: "2026-09-02T15:00:00.000Z",
    validUntil: "2026-09-02T16:30:00.000Z",
    emissionObservedAt: "2026-09-02T15:30:00.000Z",
    sellerEmissionTerms: {
      sourceEvidence: {
        semanticsEvidenceRefHash: h("semantics"),
        resourceOwnerRefHash:
          resourceSlot.mailbox.owner.envelope.principalEpochProjectionHash,
        standingEvidenceRefHash: h("standing"),
        semanticsValidFrom: "2026-09-02T00:00:00.000Z",
        semanticsValidUntil: "2026-09-03T00:00:00.000Z",
        semanticsIssuedAt: "2026-09-02T00:00:00.000Z",
        standingValidFrom: "2026-09-02T12:00:00.000Z",
        standingValidUntil: "2026-09-02T17:00:00.000Z",
        standingIssuedAt: "2026-09-02T11:59:00.000Z",
      },
      reservation: {
        sourceReceiptId: "reservation.outcome-program-route.1",
        lifecycleStreamId: "reservation-stream.outcome-program-route.1",
        reservedFrom: "2026-09-02T15:00:00.000Z",
        reservedUntil: "2026-09-02T16:00:00.000Z",
        receiptIssuedAt: "2026-09-02T12:10:00.000Z",
        eventOccurredAt: "2026-09-02T12:11:00.000Z",
        occurrenceIdentityHash: h("seller-reservation-occurrence"),
        lifecycleHeadObservedAt: "2026-09-02T15:29:00.000Z",
      },
      witnessRequest: {
        witnessRouteObjectHash: witnessRoute.object.routeObjectHash,
        witnessCandidateHash: witnessRoute.candidate.candidateHash,
        witnessRequirementRefHash:
          fixture.tender.evidenceRequirements.requirementSetHash,
        witnessControllerSeparationPolicyRefHash: h("witness-separation"),
        requestedAt: "2026-09-02T15:29:10.000Z",
        observationDeadline: "2026-09-02T17:30:00.000Z",
      },
    },
  });
}

function requestBody() {
  return Buffer.from(canonicalizeStrict({
    schema: "outsider/seller-owned-http-one-use-tender-request/v1",
    schemaVersion: "1.0.0",
    requestClass: "EXACT_ONE_USE_TENDER_RESPONSE_REQUEST",
    httpRequestNonceHash: h("http-request-nonce"),
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    responses: responseReplay.responses,
    responseOccurrences: responseReplay.occurrences,
    expectedResponseOccurrenceCount: responseReplay.expectedOccurrenceCount,
    expectedResponseLifecycleHeadHash: responseReplay.expectedLifecycleHeadHash,
  }), "utf8");
}

function dispatchInput(program, federation, ledgerDirectory) {
  return {
    program,
    tender: fixture.tender,
    programRequirementId: "primary_any",
    tenderRequirement: {
      kind: "RESOURCE",
      requirementId:
        fixture.tender.resourceRequirements.items[0].resourceRequirementId,
    },
    discovery: {
      federationResult: federation.result,
      occurrenceId: federation.occurrenceId,
      asOf: "2026-09-02T12:40:00.000Z",
      privateBindingNonce: h("descriptor-private-binding"),
    },
    contact: {
      bodyBytes: requestBody(),
      requesterContactAuthorityRefHash: h("requester-contact-authority"),
      oneUseNonceHash: h("outbound-one-use-nonce"),
      idempotencyKeyHash: h("outbound-idempotency-key"),
      effectDeadline: "2026-09-02T13:30:00.000Z",
    },
    ledger: {
      directory: ledgerDirectory,
      ledgerId: "ledger_abcdef1234567890abcdef1234567890",
      adapterInstanceRefHash: h("outbound-adapter-instance"),
    },
    verifier: {
      context: external.verifierContext,
      expectedContextHash: external.expectedVerifierContextHash,
      observedAt: "2026-09-02T15:30:00.000Z",
    },
    lifecycle: {
      admittedAt: "2026-09-02T13:00:00.000Z",
      reservedAt: "2026-09-02T13:01:00.000Z",
      attemptedAt: "2026-09-02T13:02:00.000Z",
      reconciledAt: "2026-09-02T13:03:00.000Z",
    },
  };
}

function transports(endpoint, calls) {
  const descriptor = JSON.stringify({
    schema: "https://outsider.network/schemas/transaction-interface/v1",
    version: "1.0.0",
    expiresAt: "2026-09-02T13:45:00.000Z",
    machineUse: true,
    oneUseTender: {
      accepted: true,
      endpoint:
        "https://seller.example/outsider/v1/one-use-tender-responses",
      method: "POST",
      contentType: "application/json",
    },
  });
  return {
    descriptorTransportConfig: {
      lookupImpl: async () => [{ address: PUBLIC_V4, family: 4 }],
      requestImpl: async () => {
        calls.push("DESCRIPTOR_GET");
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: descriptor,
          remoteAddress: PUBLIC_V4,
          remoteFamily: 4,
          tlsAuthorized: true,
          tlsServernameVerified: true,
          tlsCertificateHostnameVerified: true,
        };
      },
    },
    descriptorTimeoutMs: 1_000,
    tenderTransportConfig: {
      lookupImpl: async () => [{ address: PUBLIC_V4, family: 4 }],
      requestImpl: async (request) => {
        calls.push("TENDER_POST");
        const result = handleSellerOwnedHttpOneUseTenderRequestV1(endpoint, {
          method: "POST",
          path: "/outsider/v1/one-use-tender-responses",
          contentType: "application/json",
          bodyBytes: request.body,
          receivedAt: "2026-09-02T15:30:10.000Z",
        });
        return {
          status: result.statusCode,
          headers: result.headers,
          body: result.bodyBytes,
          remoteAddress: PUBLIC_V4,
          remoteFamily: 4,
          tlsAuthorized: true,
          tlsServernameVerified: true,
          tlsCertificateHostnameVerified: true,
        };
      },
    },
    signal: new AbortController().signal,
  };
}

function productionProbeInput() {
  return {
    schema: OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_SCHEMA,
    schemaVersion: "1.0.0",
    mode: "PROBE_ONLY_NO_TENDER_POST",
    program: arbitraryProgram(fixture.tender.tenderHash),
    tender: fixture.tender,
    programRequirementId: "primary_any",
    tenderRequirement: {
      kind: "RESOURCE",
      requirementId:
        fixture.tender.resourceRequirements.items[0].resourceRequirementId,
    },
    query: {
      text: "generic bounded outcome supplier",
      country: "ALL",
      searchLang: "en",
      count: 1,
      expiresAt: "2026-09-02T14:00:00.000Z",
    },
    asOf: "2026-09-02T12:30:00.000Z",
    descriptorAsOf: "2026-09-02T12:40:00.000Z",
    identifiers: {
      federationId: "federation_abcdef1234567890abcdef1234567890",
      occurrenceId: "discovery_abcdef1234567890abcdef1234567890",
      nodeSlotId: "node_abcdef1234567890abcdef1234567890",
    },
    nonces: {
      discoveryPrivateBindingNonce: h("probe-discovery-private"),
      privateProjectionNonce: h("probe-projection-private"),
      descriptorPrivateBindingNonce: h("probe-descriptor-private"),
    },
    maximumRuntimeMs: 1_000,
    exactCallerContactAuthorityRefHash: null,
  };
}

test("an arbitrary OutcomeProgram requirement reaches one discovered seller without a provider registry",
  async (t) => {
    t.mock.method(Date, "now", () =>
      Date.parse("2026-09-02T12:30:00.000Z"));
    const candidateCalls = [];
    const federation = await liveCandidateFederation(
      "public_index.edge.v1", candidateCalls);
    const endpoint = sellerEndpoint(t,
      path.join(privateDirectory(t, "outsider-route-seller-"), "ledger"));
    const calls = [];
    const result = await dispatchOutcomeProgramOneUseTenderV1(
      dispatchInput(arbitraryProgram(fixture.tender.tenderHash), federation,
        path.join(privateDirectory(t, "outsider-route-buyer-"), "ledger")),
      transports(endpoint, calls));

    assert.equal(result.programCapability,
      "DOMAIN_DECLARED_PRIMARY_CAPABILITY");
    assert.equal(result.sellerInterfaceDescribed, true);
    assert.equal(result.exactTenderDelivered, true);
    assert.equal(result.sellerFiveSourceLifecycleVerified, true);
    assert.equal(result.providerRegistrationRequired, false);
    assert.equal(result.capacityReserved, false);
    assert.equal(result.outcomeEstablished, false);
    assert.equal(result.paymentPerformed, false);
    assert.equal(result.decisionState, "HOLD");
    assert.deepEqual(calls, ["DESCRIPTOR_GET", "TENDER_POST"]);
    assert.deepEqual(candidateCalls, [{
      nodeKind: "public_index.edge.v1",
      tenderHash: fixture.tender.tenderHash,
      requirementId:
        fixture.tender.resourceRequirements.items[0].resourceRequirementId,
    }]);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("seller.example"), false);
    assert.equal(serialized.includes("providerRegistry"), false);
    assert.equal(
      OUTSIDER_OUTCOME_PROGRAM_ONE_USE_TENDER_ROUTE_V1_BOUNDARY
        .discoveryNodeKindHardcoded,
      false);
  });

test("program/tender mismatch fails before descriptor or tender I/O",
  async (t) => {
    t.mock.method(Date, "now", () =>
      Date.parse("2026-09-02T12:30:00.000Z"));
    const federation = await liveCandidateFederation(
      "device_local.app_intent.v1", []);
    const endpoint = sellerEndpoint(t,
      path.join(privateDirectory(t, "outsider-route-noio-seller-"), "ledger"));
    const calls = [];
    await assert.rejects(() => dispatchOutcomeProgramOneUseTenderV1(
      dispatchInput(arbitraryProgram(null), federation,
        path.join(privateDirectory(t, "outsider-route-noio-buyer-"), "ledger")),
      transports(endpoint, calls)), /PROGRAM_TENDER_MISMATCH/u);
    assert.deepEqual(calls, []);
  });

test("the Brave production probe makes one search and one descriptor GET but zero tender POSTs",
  async (t) => {
    t.mock.method(Date, "now", () =>
      Date.parse("2026-09-02T12:30:00.000Z"));
    const calls = [];
    const descriptor = JSON.stringify({
      schema: "https://outsider.network/schemas/transaction-interface/v1",
      version: "1.0.0",
      expiresAt: "2026-09-02T13:45:00.000Z",
      machineUse: true,
      oneUseTender: {
        accepted: true,
        endpoint:
          "https://seller.example/outsider/v1/one-use-tender-responses",
        method: "POST",
        contentType: "application/json",
      },
    });
    const result = await runBraveOneUseTenderProductionProbeV1(
      productionProbeInput(), {
      apiToken: "test-token-never-projected",
      braveFetchImpl: async () => {
        calls.push("BRAVE_GET");
        return {
          status: 200,
          headers: { get() { return null; } },
          async text() {
            return JSON.stringify({
              type: "search",
              web: { results: [{ url: "https://seller.example/catalog" }] },
            });
          },
        };
      },
      braveTimeoutMs: 1_000,
      descriptorTransportConfig: {
        lookupImpl: async () => [{ address: PUBLIC_V4, family: 4 }],
        requestImpl: async () => {
          calls.push("DESCRIPTOR_GET");
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: descriptor,
            remoteAddress: PUBLIC_V4,
            remoteFamily: 4,
            tlsAuthorized: true,
            tlsServernameVerified: true,
            tlsCertificateHostnameVerified: true,
          };
        },
      },
      descriptorTimeoutMs: 1_000,
      });

    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET"]);
    assert.equal(result.status, "SELLER_INTERFACE_DESCRIBED_POST_DISABLED");
    assert.equal(result.braveRequestAttemptCount, 1);
    assert.equal(result.selectedCandidateCount, 1);
    assert.equal(result.sellerDescriptorProbeInvocationCount, 1);
    assert.equal(result.tenderPostAttemptCount, 0);
    assert.equal(result.paymentAttemptCount, 0);
    assert.equal(result.outsiderStaffTouchCount, null);
    assert.equal(result.outsiderStaffTouchMeasurementObserved, false);
    assert.equal(result.oneUseTenderPostPermitted, false);
    assert.equal(result.formationDisposition, "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(result.humanQueueCreated, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("test-token-never-projected"), false);
    assert.equal(serialized.includes("seller.example"), false);
    assert.equal(serialized.includes("generic bounded outcome supplier"), false);
  });

test("the CLI reads only 0600 inputs and appends a 0600 privacy-closed transcript",
  async (t) => {
    t.mock.method(Date, "now", () =>
      Date.parse("2026-09-02T12:30:00.000Z"));
    const root = privateDirectory(t, "outsider-route-cli-");
    const inputFile = path.join(root, "probe-input-v1.json");
    const capabilityFile = path.join(root, "brave-capability.json");
    const transcriptFile = path.join(root, "probe-transcript.jsonl");
    writeFileSync(inputFile, `${canonicalizeStrict(productionProbeInput())}\n`,
      { mode: 0o600 });
    writeFileSync(capabilityFile, `${canonicalizeStrict({
      schema: "outsider/brave-search-api-capability/v1",
      schemaVersion: "1.0.0",
      apiToken: "cli-test-token-never-projected",
    })}\n`, { mode: 0o600 });
    const calls = [];
    const output = [];
    await runProductionProbeCli([
      "probe", "--input", inputFile, "--capability", capabilityFile,
      "--transcript", transcriptFile,
    ], {
      braveFetchImpl: async () => {
        calls.push("BRAVE_GET");
        return {
          status: 200,
          headers: { get() { return null; } },
          async text() {
            return JSON.stringify({
              type: "search",
              web: { results: [{ url: "https://seller.example/catalog" }] },
            });
          },
        };
      },
      braveTimeoutMs: 1_000,
      descriptorTransportConfig: {
        lookupImpl: async () => [{ address: PUBLIC_V4, family: 4 }],
        requestImpl: async () => {
          calls.push("DESCRIPTOR_GET");
          const body = JSON.stringify({
            schema: "https://outsider.network/schemas/transaction-interface/v1",
            version: "1.0.0",
            expiresAt: "2026-09-02T13:45:00.000Z",
            machineUse: true,
            oneUseTender: {
              accepted: true,
              endpoint:
                "https://seller.example/outsider/v1/one-use-tender-responses",
              method: "POST",
              contentType: "application/json",
            },
          });
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body,
            remoteAddress: PUBLIC_V4,
            remoteFamily: 4,
            tlsAuthorized: true,
            tlsServernameVerified: true,
            tlsCertificateHostnameVerified: true,
          };
        },
      },
      descriptorTimeoutMs: 1_000,
      writeOutput: (text) => output.push(text),
      writeError: () => assert.fail("CLI should not write stderr"),
    });
    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET"]);
    assert.equal(statSync(transcriptFile).mode & 0o777, 0o600);
    const stored = readFileSync(transcriptFile, "utf8");
    assert.equal(stored, output.join(""));
    assert.equal(stored.includes("cli-test-token-never-projected"), false);
    assert.equal(stored.includes("seller.example"), false);
    assert.equal(stored.includes("generic bounded outcome supplier"), false);
    assert.equal(JSON.parse(stored).tenderPostAttemptCount, 0);
  });
