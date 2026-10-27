import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { discoverMcpRegistryRemoteRoutesV1 }
  from "../src/outsider-mcp-registry-discovery-adapter-v1.js";
import { adaptMcpRegistryDiscoveryProjectionV1 }
  from "../src/outsider-mcp-registry-discovery-federation-node-v1.js";
import {
  OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_BOUNDARY,
  OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_LIMITS,
  observeMcpRemoteInterfacesV1,
} from "../src/outsider-mcp-remote-interface-observer-v1.js";
import {
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  createOrderScopedDiscoveryNodeCapabilityV1,
  runOrderScopedDiscoveryFederationV1,
} from "../src/outsider-order-scoped-discovery-federation-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

function tender(label = "mcp-observer") {
  const evidenceId = alias("evidence", `${label}:evidence`);
  return compileOutsiderOutcomeTenderV1({
    tenderId: alias("tender", label),
    compiledAt: "2099-09-03T12:00:00.000Z",
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h(`${label}:work-order`),
    typedGraph: {
      principalEpoch: { principalRefHash: h(`${label}:principal`),
        epochRefHash: h(`${label}:epoch`),
        principalEpochProjectionHash: h(`${label}:principal-epoch`) },
      accountableDeployment: {
        deploymentLineageRefHash: h(`${label}:lineage`),
        deploymentRevisionHash: h(`${label}:deployment-revision`),
        accountableDeploymentSubjectHash: h(`${label}:deployment-subject`) },
      runtime: { runtimeInstanceRefHash: h(`${label}:runtime-ref`),
        runtimeInstanceHash: h(`${label}:runtime`) },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
        delegationEdgeHash: h(`${label}:delegation-edge`) },
      episode: { episodeHash: h(`${label}:episode`),
        networkCompleteEpisodeJoinHash: h(`${label}:episode-join`) },
      attempt: { attemptHash: h(`${label}:attempt`),
        attemptActorSubjectHash: h(`${label}:attempt-subject`) },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h(`${label}:actor-envelope`),
      delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
      delegationEdgeHash: h(`${label}:delegation-edge`),
      authorityScopeRefHash: h(`${label}:authority-scope`),
      resourceOwnerAuthorizationRefHash: h(`${label}:owner-authorization`),
      rightsPrivacyPolicyRefHash: h(`${label}:rights-policy`),
    },
    exactOutcome: {
      outcomeKindCode: "GENERIC_OUTCOME_ESTABLISHED",
      outcomeSpecRefHash: h(`${label}:outcome-spec`),
      subjectRefHash: h(`${label}:subject`),
      acceptanceCriteriaRefHash: h(`${label}:acceptance-criteria`),
      conditions: [{ conditionId: alias("condition", `${label}:condition`),
        metricCode: "GENERIC_STATE", comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "COMPLETE", unitCode: null },
        observationWindowMs: 0,
        conditionRefHash: h(`${label}:condition-ref`), mandatory: true }],
      deadline: "2099-09-04T12:00:00.000Z",
    },
    formationDeadline: "2099-09-03T12:15:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: alias("resource", `${label}:primary`),
      resourceClassCode: "GENERIC_PRIMARY_RESOURCE",
      capabilityRefHash: h(`${label}:capability`), quantity: 1,
      unitCode: "RESOURCE", regionRefHash: h(`${label}:region`),
      requiredBy: "2099-09-04T10:00:00.000Z", mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "GENERIC_INDEPENDENT_EVIDENCE",
      evidenceRequirementRefHash: h(`${label}:evidence-ref`),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2099-09-04T12:00:00.000Z", mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", `${label}:recovery`),
      triggerRefHash: h(`${label}:trigger`),
      recoveryOutcomeRefHash: h(`${label}:recovery-outcome`),
      resourceClassCode: "GENERIC_RECOVERY_RESOURCE", maximumAttempts: 2,
      completionDeadline: "2099-09-04T12:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED", mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h(`${label}:consequence`),
      consequenceClassCode: "BOUNDED_GENERIC_FAILURE",
      measureCode: "MAXIMUM_DELAY", maximumValue: 120, unitCode: "MINUTE",
      affectedChannelRefHashes: [h(`${label}:channel`)],
      irreversibleHarmAllowed: false, unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  });
}

function binding(record) {
  const section = record.resourceRequirements;
  const requirement = section.items[0];
  return {
    requirementKind: "RESOURCE",
    requirementId: requirement.resourceRequirementId,
    requirementSetHash: section.requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: record.tenderHash,
        requirementKind: "RESOURCE",
        requirementSetHash: section.requirementSetHash,
        requirement,
      }),
  };
}

function registryResponse(remotes) {
  return {
    status: 200,
    headers: { get(name) { return name.toLowerCase() === "content-type"
      ? "application/json" : null; } },
    async text() {
      return JSON.stringify({ servers: [{ server: {
        name: "PRIVATE_SERVER_NAME_CANARY",
        version: "PRIVATE_SERVER_VERSION_CANARY",
        description: "PRIVATE_SERVER_DESCRIPTION_CANARY",
        remotes,
      } }] });
    },
  };
}

async function federation(label = "observer", remotes = [{
  type: "streamable-http", url: "https://mcp.example.test/mcp",
}], options = {}) {
  const record = tender(label);
  const requirement = binding(record);
  const occurrenceId = alias("discovery", `${label}:occurrence`);
  const nodeSlotId = alias("node", `${label}:slot`);
  const plannedJob = {
    occurrenceId, nodeSlotId, nodeKind: "mcp.registry.v01",
    ...requirement,
    expiresAt: "2099-09-03T12:14:00.000Z",
    maximumRuntimeMs: 1_000,
  };
  const privateBindingNonce = options.privateBindingNonce
    ?? h(`${label}:binding`);
  let issuedAdapterResult;
  const capability = createOrderScopedDiscoveryNodeCapabilityV1({
    nodeKind: "mcp.registry.v01",
    async invoke(context) {
      const adapterResult = await discoverMcpRegistryRemoteRoutesV1({
        tender: context.tender,
        requirementKind: context.requirementKind,
        requirementId: context.requirementId,
        discovery: context.nodeInput.discovery,
        asOf: context.asOf,
        expiresAt: context.expiresAt,
        privateBindingNonce: context.privateBindingNonce,
      }, {
        fetchImpl: async () => registryResponse(remotes),
        timeoutMs: 100,
      });
      issuedAdapterResult = adapterResult;
      return {
        publicReceipt: adaptMcpRegistryDiscoveryProjectionV1(
          adapterResult, context),
        privateEphemeral: options.privateResultOverride ?? adapterResult,
      };
    },
  });
  const result = await runOrderScopedDiscoveryFederationV1({
    tender: record,
    asOf: "2099-09-03T12:01:00.000Z",
    publicPlan: {
      schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId: alias("federation", label),
      tenderHash: record.tenderHash,
      workOrderHash: record.workOrderHash,
      typedGraphHash: record.typedGraph.typedGraphHash,
      concurrencyLimit: 1,
      jobs: [plannedJob],
    },
    privateJobs: [{ occurrenceId,
      nodeInput: { discovery: { search: options.search
        ?? "PRIVATE_QUERY_CANARY", limit: 3 } },
      privateBindingNonce }],
    privateProjectionNonce: h(`${label}:projection`),
  }, { capabilityBindings: [{ nodeSlotId, capability }] });
  assert.equal(result.publicProjection.occurrences[0].status, "SUCCEEDED");
  return { record, occurrenceId, result, adapterResult: issuedAdapterResult };
}

function protocolTransport(options = {}) {
  const calls = [];
  const lookups = [];
  const address = options.address ?? "93.184.216.34";
  const lookupRows = options.lookupRows ?? [{ address, family: 4 }];
  const requestImpl = async (request) => {
    calls.push(request);
    const message = JSON.parse(request.body.toString("utf8"));
    if (options.responseOverride) return options.responseOverride(request,
      message, calls.length);
    if (message.method === "initialize") {
      return transportResponse(200, {
        jsonrpc: "2.0", id: 1, result: {
          protocolVersion: options.protocolVersion ?? "2025-11-25",
          capabilities: {},
          serverInfo: { name: "PRIVATE_SERVER_CANARY", version: "9.9.9" },
        },
      }, address, { "mcp-session-id": "PRIVATE_SESSION_CANARY" });
    }
    if (message.method === "notifications/initialized") {
      return transportResponse(202, "", address, {});
    }
    if (message.method === "tools/list") {
      return transportResponse(200, {
        jsonrpc: "2.0", id: 2, result: { tools: [{
          name: "PRIVATE_TOOL_NAME_CANARY",
          description: "PRIVATE_TOOL_DESCRIPTION_CANARY",
          inputSchema: { type: "object", properties: {
            PRIVATE_SCHEMA_CANARY: { type: "string" },
          } },
        }] },
      }, address);
    }
    throw new Error(`forbidden method ${message.method}`);
  };
  return {
    calls, lookups,
    dependencies: {
      async lookupImpl(hostname) {
        lookups.push(hostname);
        return lookupRows;
      },
      requestImpl,
      perCandidateTimeoutMs: options.perCandidateTimeoutMs ?? 500,
      totalTimeoutMs: options.totalTimeoutMs ?? 1_500,
    },
  };
}

function transportResponse(status, value, remoteAddress,
  extraHeaders = { "content-type": "application/json" }) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return {
    status,
    headers: { "content-type": typeof value === "string" && value === ""
      ? null : "application/json", ...extraHeaders },
    body,
    remoteAddress,
    remoteFamily: 4,
    tlsAuthorized: true,
  };
}

function observerInput(fixture, overrides = {}) {
  return {
    federationResult: fixture.result,
    expectedTenderHash: fixture.record.tenderHash,
    occurrenceId: fixture.occurrenceId,
    candidateIndexes: [0],
    ...overrides,
  };
}

function assertHold(projection) {
  assert.equal(projection.providerIdentityEstablished, false);
  assert.equal(projection.providerOwnershipEstablished, false);
  assert.equal(projection.resourceOwnerAuthorityEstablished, false);
  assert.equal(projection.providerOfferEstablished, false);
  assert.equal(projection.providerAcceptanceEstablished, false);
  assert.equal(projection.capacityEstablished, false);
  assert.equal(projection.capacityReserved, false);
  assert.equal(projection.productionExecutionPermitted, false);
  assert.equal(projection.decisionState, "HOLD");
  assert.equal(projection.authority, "NONE");
  assert.equal(projection.actionReady, false);
  assert.equal(projection.executable, false);
}

test("module-issued occurrence performs only credential-free MCP shape observation",
  async () => {
    const fixture = await federation("happy");
    const transport = protocolTransport();
    const projection = await observeMcpRemoteInterfacesV1(
      observerInput(fixture), transport.dependencies);

    assert.equal(transport.lookups.length, 1);
    assert.equal(transport.calls.length, 3);
    assert.deepEqual(transport.calls.map((call) =>
      JSON.parse(call.body.toString("utf8")).method), [
      "initialize", "notifications/initialized", "tools/list",
    ]);
    for (const call of transport.calls) {
      assert.equal(call.method, "POST");
      assert.equal(call.address, "93.184.216.34");
      assert.equal(call.family, 4);
      assert.equal(call.headers.Authorization, undefined);
      assert.equal(call.headers.Cookie, undefined);
    }
    assert.equal(projection.status, "SUCCEEDED");
    assert.equal(projection.attempts[0].initializeJsonRpcShapeObserved, true);
    assert.equal(projection.attempts[0]
      .initializedLifecycleStepCompleted, true);
    assert.equal(projection.attempts[0].toolsListJsonRpcShapeObserved, true);
    assert.equal(projection.totalHttpRequestAttemptCount, 3);
    assert.equal(projection.redirectsFollowed, 0);
    assert.equal(projection.retriesPerformed, 0);
    assert.equal(projection.preexistingAuthorizationCredentialPresented,
      false);
    assert.equal(projection.serverIssuedSessionStatePresented, true);
    assert.equal(projection.toolsCallPerformed, false);
    assert.equal(projection.enabledCapabilitiesSubsetOfProvenAuthority, true);
    assertHold(projection);

    const durable = JSON.stringify(projection);
    for (const canary of ["mcp.example.test", "PRIVATE_QUERY_CANARY",
      "PRIVATE_SERVER_NAME_CANARY", "PRIVATE_SERVER_CANARY",
      "PRIVATE_TOOL_NAME_CANARY", "PRIVATE_TOOL_DESCRIPTION_CANARY",
      "PRIVATE_SCHEMA_CANARY", "PRIVATE_SESSION_CANARY", "9.9.9"]) {
      assert.equal(durable.includes(canary), false, canary);
    }
  });

test("copied, cross-tender, and reused federation envelopes fail before I/O",
  async () => {
    const copiedFixture = await federation("copied");
    const copiedTransport = protocolTransport();
    await assert.rejects(() => observeMcpRemoteInterfacesV1({
      ...observerInput(copiedFixture),
      federationResult: { ...copiedFixture.result },
    }, copiedTransport.dependencies), /FEDERATION_RESULT_NOT_MODULE_ISSUED/u);
    assert.equal(copiedTransport.lookups.length, 0);
    assert.equal(copiedTransport.calls.length, 0);

    const crossFixture = await federation("cross");
    const crossTransport = protocolTransport();
    await assert.rejects(() => observeMcpRemoteInterfacesV1(
      observerInput(crossFixture, { expectedTenderHash: h("other-tender") }),
      crossTransport.dependencies), /EXPECTED_TENDER_HASH_MISMATCH/u);
    assert.equal(crossTransport.lookups.length, 0);
    assert.equal(crossTransport.calls.length, 0);
    // Mismatch did not consume the valid lease.
    await observeMcpRemoteInterfacesV1(observerInput(crossFixture),
      crossTransport.dependencies);
    assert.equal(crossTransport.calls.length, 3);

    const reusedFixture = await federation("reused");
    const reusedTransport = protocolTransport();
    await observeMcpRemoteInterfacesV1(observerInput(reusedFixture),
      reusedTransport.dependencies);
    const beforeLookups = reusedTransport.lookups.length;
    const beforeCalls = reusedTransport.calls.length;
    await assert.rejects(() => observeMcpRemoteInterfacesV1(
      observerInput(reusedFixture), reusedTransport.dependencies),
    /PRIVATE_NODE_RESULT_ALREADY_CONSUMED/u);
    assert.equal(reusedTransport.lookups.length, beforeLookups);
    assert.equal(reusedTransport.calls.length, beforeCalls);
  });

test("protocol negotiation accepts only the frozen official allowlist",
  async () => {
    const compatibleFixture = await federation("protocol-compatible");
    const compatibleTransport = protocolTransport({
      protocolVersion: "2025-06-18",
    });
    const compatible = await observeMcpRemoteInterfacesV1(
      observerInput(compatibleFixture), compatibleTransport.dependencies);
    assert.equal(compatible.status, "SUCCEEDED");
    assert.equal(compatibleTransport.calls.length, 3);
    assert.equal(compatibleTransport.calls[1].headers["MCP-Protocol-Version"],
      "2025-06-18");
    assert.equal(compatibleTransport.calls[2].headers["MCP-Protocol-Version"],
      "2025-06-18");

    const refusedFixture = await federation("protocol-refused");
    const refusedTransport = protocolTransport({
      protocolVersion: "2025-09-17",
    });
    const refused = await observeMcpRemoteInterfacesV1(
      observerInput(refusedFixture), refusedTransport.dependencies);
    assert.equal(refused.status, "FAILED");
    assert.equal(refused.attempts[0].failureCode,
      "MCP_PROTOCOL_VERSION_REFUSED");
    assert.equal(refusedTransport.calls.length, 1);
    assert.deepEqual(refusedTransport.calls.map((request) =>
      JSON.parse(request.body.toString("utf8")).method), ["initialize"]);
  });

test("all candidate leases are claimed before any DNS or HTTP", async () => {
  const fixture = await federation("atomic-claim", [
    { type: "streamable-http", url: "https://one.example.test/mcp" },
  ]);
  const transport = protocolTransport();
  await assert.rejects(() => observeMcpRemoteInterfacesV1(
    observerInput(fixture, { candidateIndexes: [0, 1] }),
    transport.dependencies), /CANDIDATE_INDEX_INVALID/u);
  assert.equal(transport.lookups.length, 0);
  assert.equal(transport.calls.length, 0);
});

test("bridge brand rejects same-occurrence private-envelope substitution",
  async () => {
    const first = await federation("substitution");
    const substituted = await federation("substitution", [{
      type: "streamable-http", url: "https://other.example.test/mcp",
    }], {
      search: "DIFFERENT_PRIVATE_QUERY_CANARY",
      privateBindingNonce: h("substitution:different-binding"),
      privateResultOverride: first.adapterResult,
    });
    const transport = protocolTransport();
    await assert.rejects(() => observeMcpRemoteInterfacesV1(
      observerInput(substituted), transport.dependencies),
    /OBSERVATION_BINDING_MISMATCH/u);
    assert.equal(transport.lookups.length, 0);
    assert.equal(transport.calls.length, 0);
  });

test("expired occurrence is refused before DNS and HTTP", async () => {
  const fixture = await federation("expired");
  const transport = protocolTransport();
  const originalNow = Date.now;
  Date.now = () => Date.parse("2100-01-01T00:00:00.000Z");
  try {
    await assert.rejects(() => observeMcpRemoteInterfacesV1(
      observerInput(fixture), transport.dependencies),
    /OCCURRENCE_EXPIRED_BEFORE_OBSERVATION/u);
  } finally {
    Date.now = originalNow;
  }
  assert.equal(transport.lookups.length, 0);
  assert.equal(transport.calls.length, 0);
});

test("private, reserved, mixed, and TLS-mismatched addresses never reach MCP",
  async () => {
    for (const [label, lookupRows, expected] of [
      ["loopback", [{ address: "127.0.0.1", family: 4 }],
        "DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED"],
      ["link-local", [{ address: "169.254.4.2", family: 4 }],
        "DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED"],
      ["documentation-v6", [{ address: "2001:db8::1", family: 6 }],
        "DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED"],
      ["mixed", [{ address: "93.184.216.34", family: 4 },
        { address: "10.0.0.7", family: 4 }],
      "DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED"],
    ]) {
      const fixture = await federation(label);
      const transport = protocolTransport({ lookupRows });
      const projection = await observeMcpRemoteInterfacesV1(
        observerInput(fixture), transport.dependencies);
      assert.equal(projection.attempts[0].failureCode, expected);
      assert.equal(transport.calls.length, 0);
      assertHold(projection);
    }

    const fixture = await federation("tls-mismatch");
    const transport = protocolTransport({
      responseOverride() {
        return transportResponse(200, {}, "8.8.8.8");
      },
    });
    const projection = await observeMcpRemoteInterfacesV1(
      observerInput(fixture), transport.dependencies);
    assert.equal(projection.attempts[0].failureCode,
      "TLS_REMOTE_ADDRESS_MISMATCH");
    assert.equal(transport.calls.length, 1);

    for (const [label, url] of [
      ["bracket-loopback", "https://[::1]/mcp"],
      ["bracket-private", "https://[fc00::1]/mcp"],
      ["trailing-localhost", "https://localhost./mcp"],
      ["trailing-local", "https://host.local./mcp"],
    ]) {
      const blockedFixture = await federation(label, [{
        type: "streamable-http", url,
      }]);
      const blockedTransport = protocolTransport();
      const blocked = await observeMcpRemoteInterfacesV1(
        observerInput(blockedFixture), blockedTransport.dependencies);
      assert.equal(blocked.attempts[0].failureCode,
        "CANDIDATE_ENDPOINT_REFUSED");
      assert.equal(blockedTransport.lookups.length, 0);
      assert.equal(blockedTransport.calls.length, 0);
    }
  });

test("redirect is refused without retry and SSE candidates are not contacted",
  async () => {
    const redirectFixture = await federation("redirect");
    const redirectTransport = protocolTransport({
      responseOverride(request) {
        return transportResponse(302, "", request.address,
          { location: "https://10.0.0.1/mcp" });
      },
    });
    const redirected = await observeMcpRemoteInterfacesV1(
      observerInput(redirectFixture), redirectTransport.dependencies);
    assert.equal(redirected.attempts[0].failureCode,
      "SOURCE_REDIRECT_REFUSED");
    assert.equal(redirectTransport.calls.length, 1);
    assert.equal(redirected.redirectsFollowed, 0);
    assert.equal(redirected.retriesPerformed, 0);

    const sseFixture = await federation("sse", [
      { type: "sse", url: "https://events.example.test/sse" },
    ]);
    const sseTransport = protocolTransport();
    const refused = await observeMcpRemoteInterfacesV1(
      observerInput(sseFixture), sseTransport.dependencies);
    assert.equal(refused.attempts[0].failureCode, "UNSUPPORTED_TRANSPORT");
    assert.equal(sseTransport.lookups.length, 0);
    assert.equal(sseTransport.calls.length, 0);
  });

test("timeouts and byte ceilings fail closed without enabling authority",
  async () => {
    const timeoutFixture = await federation("timeout");
    const timeoutTransport = protocolTransport({ perCandidateTimeoutMs: 20,
      totalTimeoutMs: 40 });
    timeoutTransport.dependencies.requestImpl = (request) =>
      new Promise((resolve, reject) => {
        request.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    const timedOut = await observeMcpRemoteInterfacesV1(
      observerInput(timeoutFixture), timeoutTransport.dependencies);
    assert.equal(timedOut.attempts[0].failureCode, "SOURCE_TIMEOUT");
    assertHold(timedOut);

    const bytesFixture = await federation("bytes");
    const bytesTransport = protocolTransport({
      responseOverride(request) {
        return transportResponse(200, "x".repeat(
          OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_LIMITS
            .maximumTotalResponseBytes + 1), request.address);
      },
    });
    const oversized = await observeMcpRemoteInterfacesV1(
      observerInput(bytesFixture), bytesTransport.dependencies);
    assert.equal(oversized.attempts[0].failureCode, "RESPONSE_TOO_LARGE");
    assert.equal(oversized.totalHttpRequestAttemptCount, 1);
    assertHold(oversized);
  });

test("candidate and dependency budgets reject before consuming or I/O",
  async () => {
    const fixture = await federation("limits", [
      { type: "streamable-http", url: "https://one.example.test/mcp" },
      { type: "streamable-http", url: "https://two.example.test/mcp" },
      { type: "streamable-http", url: "https://three.example.test/mcp" },
      { type: "streamable-http", url: "https://four.example.test/mcp" },
    ]);
    const transport = protocolTransport();
    await assert.rejects(() => observeMcpRemoteInterfacesV1(
      observerInput(fixture, { candidateIndexes: [0, 1, 2, 3] }),
      transport.dependencies), /CANDIDATE_INDEXES_INVALID/u);
    assert.equal(transport.lookups.length, 0);
    assert.equal(transport.calls.length, 0);

    await assert.rejects(() => observeMcpRemoteInterfacesV1(
      observerInput(fixture), { ...transport.dependencies,
        perCandidateTimeoutMs: 8_001 }), /PER_CANDIDATE_TIMEOUT_INVALID/u);
    assert.equal(transport.lookups.length, 0);
    assert.equal(transport.calls.length, 0);

    assert.equal(OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_BOUNDARY
      .toolsCallPermitted, false);
    assert.equal(OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_BOUNDARY
      .nakedUrlAccepted, false);
    assert.equal(OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_BOUNDARY
      .resultDerivedCountProjected, false);
  });
