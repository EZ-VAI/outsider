import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_BOUNDARY,
  OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_ENDPOINT,
  OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_SCHEMAS,
  claimMcpRegistryRemoteCandidateForObservationV1,
  discoverMcpRegistryRemoteRoutesV1,
} from "../src/outsider-mcp-registry-discovery-adapter-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;

function tender(label = "mcp-registry") {
  const evidenceId = alias("evidence", `${label}:evidence`);
  return compileOutsiderOutcomeTenderV1({
    tenderId: alias("tender", label),
    compiledAt: "2026-09-03T12:00:00.000Z",
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
      deadline: "2026-09-04T12:00:00.000Z",
    },
    formationDeadline: "2026-09-03T12:15:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: alias("resource", `${label}:primary`),
      resourceClassCode: "GENERIC_PRIMARY_RESOURCE",
      capabilityRefHash: h(`${label}:capability`), quantity: 1,
      unitCode: "RESOURCE", regionRefHash: h(`${label}:region`),
      requiredBy: "2026-09-04T10:00:00.000Z", mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "GENERIC_INDEPENDENT_EVIDENCE",
      evidenceRequirementRefHash: h(`${label}:evidence-ref`),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2026-09-04T12:00:00.000Z", mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", `${label}:recovery`),
      triggerRefHash: h(`${label}:trigger`),
      recoveryOutcomeRefHash: h(`${label}:recovery-outcome`),
      resourceClassCode: "GENERIC_RECOVERY_RESOURCE", maximumAttempts: 2,
      completionDeadline: "2026-09-04T12:00:00.000Z",
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

function input(record, overrides = {}) {
  return {
    tender: record,
    requirementKind: "RESOURCE",
    requirementId: record.resourceRequirements.items[0].resourceRequirementId,
    discovery: { search: "calendar coordination & rooms/世界", limit: 4 },
    asOf: "2026-09-03T12:01:00.000Z",
    expiresAt: "2026-09-03T12:14:00.000Z",
    privateBindingNonce: h("mcp-registry-private-binding-nonce"),
    ...overrides,
  };
}

function response(status, body, headers = { "content-type":
  "application/json; charset=utf-8" }) {
  const normalized = new Map(Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status,
    headers: { get(name) { return normalized.get(name.toLowerCase()) ?? null; } },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

function registryBody(remotes = [{ type: "streamable-http",
  url: "https://remote-mcp.example/mcp#fragment" }]) {
  return {
    servers: [
      { server: {
        name: "PRIVATE_SERVER_NAME_CANARY",
        version: "1.0.0-PRIVATE_VERSION_CANARY",
        description: "PRIVATE_DESCRIPTION_CANARY",
        remotes,
      } },
      { server: {
        name: "PRIVATE_SERVER_NAME_CANARY",
        version: "0.9.0-PRIVATE_OLDER_VERSION_CANARY",
        description: "PRIVATE_OLDER_DESCRIPTION_CANARY",
        remotes,
      } },
    ],
    metadata: { count: 2, nextCursor: "PRIVATE_CURSOR_CANARY" },
  };
}

function assertHeld(projection) {
  assert.equal(projection.providerIdentityEstablished, false);
  assert.equal(projection.providerOwnershipEstablished, false);
  assert.equal(projection.resourceOwnerAuthorityEstablished, false);
  assert.equal(projection.safetyEstablished, false);
  assert.equal(projection.capacityEstablished, false);
  assert.equal(projection.productionExecutionAuthorityReplayed, false);
  assert.equal(projection.occurrenceRowsTreatedAsProviders, false);
  assert.equal(projection.decisionState, "HOLD");
  assert.equal(projection.authority, "NONE");
  assert.equal(projection.actionReady, false);
  assert.equal(projection.executable, false);
}

test("one fixed credential-free GET yields one-use private remote leases",
  async () => {
    const record = tender();
    const calls = [];
    const result = await discoverMcpRegistryRemoteRoutesV1(input(record), {
      fetchImpl: async (...args) => {
        calls.push(args);
        return response(200, registryBody([
          { type: "streamable-http",
            url: "https://remote-mcp.example/mcp#fragment" },
          { type: "sse", url: "https://events-mcp.example/sse" },
        ]));
      },
      timeoutMs: 100,
    });

    assert.equal(calls.length, 1);
    const [rawUrl, options] = calls[0];
    const url = new URL(rawUrl);
    assert.equal(url.origin,
      OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_ENDPOINT.origin);
    assert.equal(url.pathname,
      OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_ENDPOINT.path);
    assert.equal(url.searchParams.get("search"),
      "calendar coordination & rooms/世界");
    assert.equal(rawUrl.includes(
      "search=calendar+coordination+%26+rooms%2F%E4%B8%96%E7%95%8C"), true);
    assert.equal(url.searchParams.get("limit"), "4");
    assert.equal(url.searchParams.size, 2);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    for (const forbidden of ["Authorization", "Cookie", "X-Api-Key",
      "X-Subscription-Token"]) {
      assert.equal(Object.hasOwn(options.headers, forbidden), false);
    }

    assert.deepEqual(Object.keys(result), ["publicProjection"]);
    assert.equal(Object.prototype.propertyIsEnumerable.call(result,
      "privateEphemeral"), false);
    assert.equal(result.privateEphemeral.candidateLeaseCount, 2);
    assert.equal(result.privateEphemeral.occurrenceRowsAreNotProviders, true);
    const candidate = claimMcpRegistryRemoteCandidateForObservationV1(
      result, 0);
    assert.deepEqual(candidate, {
      routeKind: "PUBLIC_MCP_REMOTE_TRANSPORT",
      remoteTransportType: "streamable-http",
      remoteTransportUrl: "https://remote-mcp.example/mcp",
      remoteTransportReachabilityEstablished: false,
      serverIdentityEstablished: false,
      providerIdentityEstablished: false,
      providerOwnershipEstablished: false,
      resourceOwnerAuthorityEstablished: false,
      safetyEstablished: false,
      capacityEstablished: false,
      capacityReserved: false,
      actionPermitted: false,
    });
    assert.throws(() => claimMcpRegistryRemoteCandidateForObservationV1(
      result, 0), /CANDIDATE_ALREADY_CONSUMED/u);
    assert.throws(() => claimMcpRegistryRemoteCandidateForObservationV1(
      JSON.parse(JSON.stringify(result)), 0),
    /EPHEMERAL_ENVELOPE_NOT_MODULE_ISSUED/u);
    assert.equal(result.publicProjection.status, "SUCCEEDED");
    assert.equal(result.publicProjection.registryReadSucceeded, true);
    assert.equal(result.publicProjection.credentialPresented, false);
    assertHeld(result.publicProjection);
  });

test("public projection is result-blind and contains no listed metadata",
  async () => {
    const record = tender("privacy");
    const run = (body) => discoverMcpRegistryRemoteRoutesV1(input(record), {
      fetchImpl: async () => response(200, body), timeoutMs: 100,
    });
    const first = await run(registryBody());
    const second = await run({ servers: [{ server: {
      name: "DIFFERENT_PRIVATE_NAME_CANARY",
      version: "99.99.99-PRIVATE",
      description: "DIFFERENT_PRIVATE_DESCRIPTION_CANARY",
      remotes: [{ type: "sse", url: "https://different.example/sse" }],
    } }], metadata: { count: 999, nextCursor: "DIFFERENT_CURSOR" } });
    assert.deepEqual(first.publicProjection, second.publicProjection);

    const durable = JSON.stringify(first);
    for (const canary of ["PRIVATE_SERVER_NAME_CANARY", "PRIVATE_VERSION",
      "PRIVATE_DESCRIPTION", "PRIVATE_CURSOR", "remote-mcp.example",
      "calendar coordination"]) assert.equal(durable.includes(canary), false);
    for (const key of Object.keys(first.publicProjection)) {
      assert.equal(key.toLowerCase().includes("count"), false, key);
    }
    assert.equal(first.publicProjection.serverNameProjected, false);
    assert.equal(first.publicProjection.serverVersionProjected, false);
    assert.equal(first.publicProjection.serverDescriptionProjected, false);
    assert.equal(first.publicProjection.remoteTransportUrlProjected, false);
    assert.equal(first.publicProjection.rawResponseProjected, false);
    assert.equal(first.publicProjection.resultDerivedHashProjected, false);
    assert.match(first.publicProjection.projectionHash,
      /^sha256:[a-f0-9]{64}$/u);
  });

test("exact private commitment binds tender, requirement, search, window, nonce",
  async () => {
    const record = tender("binding");
    const run = (value) => discoverMcpRegistryRemoteRoutesV1(value, {
      fetchImpl: async () => response(200, { servers: [] }), timeoutMs: 100,
    });
    const base = input(record);
    const variants = [
      input(record, { discovery: { search: "room booking", limit: 4 } }),
      input(record, { discovery: { ...base.discovery, limit: 3 } }),
      input(record, { asOf: "2026-09-03T12:02:00.000Z" }),
      input(record, { expiresAt: "2026-09-03T12:13:00.000Z" }),
      input(record, { privateBindingNonce: h("different-nonce") }),
      input(record, { requirementKind: "EVIDENCE",
        requirementId:
          record.evidenceRequirements.items[0].evidenceRequirementId }),
      input(tender("binding-other")),
    ];
    const baseline = await run(base);
    const same = await run(base);
    const binding = (result) => result.privateEphemeral.binding
      .exactTenderRequirementDiscoveryWindowBindingHash;
    assert.equal(binding(baseline), binding(same));
    for (const variant of variants) {
      assert.notEqual(binding(await run(variant)), binding(baseline));
    }
    assert.equal(baseline.privateEphemeral.binding.asOf, base.asOf);
    assert.equal(baseline.privateEphemeral.binding.expiresAt, base.expiresAt);
    assert.match(baseline.privateEphemeral.binding.discoveryHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.equal(JSON.stringify(baseline.publicProjection)
      .includes(binding(baseline)), false);
  });

test("multiple version occurrences deduplicate routes and never become providers",
  async () => {
    const result = await discoverMcpRegistryRemoteRoutesV1(input(tender(
      "occurrences")), {
      fetchImpl: async () => response(200, registryBody()), timeoutMs: 100,
    });
    assert.equal(result.privateEphemeral.candidateLeaseCount, 1);
    assert.equal(result.privateEphemeral.occurrenceRowsAreNotProviders, true);
    assert.equal(result.publicProjection.occurrenceRowsTreatedAsProviders,
      false);
    assert.equal(result.publicProjection.providerIdentityEstablished, false);
    const candidate = claimMcpRegistryRemoteCandidateForObservationV1(
      result, 0);
    assert.equal(Object.hasOwn(candidate, "serverName"), false);
    assert.equal(Object.hasOwn(candidate, "serverVersion"), false);
    assert.equal(Object.hasOwn(candidate, "description"), false);
  });

test("only literal input-free public HTTPS remotes become candidates",
  async () => {
    const remotes = [
      { type: "streamable-http", url: "http://insecure.example/mcp" },
      { type: "streamable-http", url: "https://localhost/mcp" },
      { type: "streamable-http", url: "https://127.0.0.1/mcp" },
      { type: "streamable-http", url: "https://user:pass@example.com/mcp" },
      { type: "streamable-http", url: "https://example.com:8443/mcp" },
      { type: "streamable-http", url: "{baseUrl}/mcp",
        variables: { baseUrl: { isRequired: true } } },
      { type: "streamable-http", url: "https://headers.example/mcp",
        headers: [{ name: "Authorization", isSecret: true }] },
      { type: "stdio", url: "https://not-remote.example/mcp" },
      { type: "sse", url: "https://public.example/sse" },
    ];
    const result = await discoverMcpRegistryRemoteRoutesV1(input(tender(
      "safe-remotes")), {
      fetchImpl: async () => response(200, { servers: [{ server: { remotes } }] }),
      timeoutMs: 100,
    });
    assert.equal(result.privateEphemeral.candidateLeaseCount, 1);
    const candidate = claimMcpRegistryRemoteCandidateForObservationV1(
      result, 0);
    assert.equal(candidate.remoteTransportType, "sse");
    assert.equal(candidate.remoteTransportUrl, "https://public.example/sse");
    assert.equal(candidate.remoteTransportReachabilityEstablished, false);
    assert.equal(candidate.resourceOwnerAuthorityEstablished, false);
    assert.equal(candidate.safetyEstablished, false);
    assert.equal(candidate.capacityEstablished, false);
    assert.equal(candidate.actionPermitted, false);
  });

test("redirect and source failures stop after exactly one attempt", async () => {
  const record = tender("statuses");
  for (const [status, failureCode] of [
    [302, "SOURCE_REDIRECT_REFUSED"],
    [401, "SOURCE_PERMISSION_DENIED"],
    [429, "SOURCE_RATE_LIMITED"],
    [500, "SOURCE_TRANSPORT_UNAVAILABLE"],
  ]) {
    let calls = 0;
    const result = await discoverMcpRegistryRemoteRoutesV1(input(record), {
      fetchImpl: async () => {
        calls += 1;
        return response(status, { error: "PRIVATE_ERROR_CANARY" });
      },
      timeoutMs: 100,
    });
    assert.equal(calls, 1);
    assert.equal(result.publicProjection.status, "FAILED");
    assert.equal(result.publicProjection.failureCode, failureCode);
    assert.equal(result.publicProjection.retryPerformed, false);
    assert.equal(result.publicProjection.redirectFollowed, false);
    assert.equal(result.privateEphemeral.candidateLeaseCount, 0);
    assert.equal(JSON.stringify(result).includes("PRIVATE_ERROR_CANARY"), false);
    assertHeld(result.publicProjection);
  }
});

test("malformed and oversized bodies fail closed before JSON use", async () => {
  const record = tender("bounded");
  const malformed = await discoverMcpRegistryRemoteRoutesV1(input(record), {
    fetchImpl: async () => response(200, { servers: "not-an-array" }),
    timeoutMs: 100,
  });
  assert.equal(malformed.publicProjection.failureCode, "SOURCE_MALFORMED");

  let nonJsonTextCalled = false;
  const nonJson = await discoverMcpRegistryRemoteRoutesV1(input(record), {
    fetchImpl: async () => ({
      status: 200,
      headers: { get(name) { return name.toLowerCase() === "content-type"
        ? "text/html" : null; } },
      async text() { nonJsonTextCalled = true; return "PRIVATE_HTML_CANARY"; },
    }),
    timeoutMs: 100,
  });
  assert.equal(nonJsonTextCalled, false);
  assert.equal(nonJson.publicProjection.failureCode, "SOURCE_MALFORMED");
  assert.equal(JSON.stringify(nonJson).includes("PRIVATE_HTML_CANARY"), false);

  let signal;
  let textCalled = false;
  const oversized = await discoverMcpRegistryRemoteRoutesV1(input(record), {
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return {
        status: 200,
        headers: { get(name) {
          if (name.toLowerCase() === "content-type") return "application/json";
          return name.toLowerCase() === "content-length"
            ? String(2 * 1024 * 1024 + 1) : null;
        } },
        async text() { textCalled = true; return "PRIVATE_RAW_CANARY"; },
      };
    },
    timeoutMs: 100,
  });
  assert.equal(signal.aborted, true);
  assert.equal(textCalled, false);
  assert.equal(oversized.publicProjection.failureCode, "SOURCE_MALFORMED");
  assert.equal(JSON.stringify(oversized).includes("PRIVATE_RAW_CANARY"), false);
});

test("timeout aborts the sole request and limit/window reject before I/O",
  async () => {
    const record = tender("timeout-window");
    let calls = 0;
    let signal;
    const timedOut = await discoverMcpRegistryRemoteRoutesV1(input(record), {
      fetchImpl: async (_url, options) => {
        calls += 1;
        signal = options.signal;
        return new Promise(() => {});
      },
      timeoutMs: 5,
    });
    assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
    assert.equal(timedOut.publicProjection.failureCode, "SOURCE_TIMEOUT");
    assert.equal(timedOut.publicProjection.retryPerformed, false);

    const localDeps = { fetchImpl: async () => {
      calls += 1;
      return response(200, { servers: [] });
    }, timeoutMs: 100 };
    await assert.rejects(discoverMcpRegistryRemoteRoutesV1(input(record, {
      discovery: { search: "too many", limit: 11 },
    }), localDeps), /DISCOVERY_LIMIT_INVALID/u);
    await assert.rejects(discoverMcpRegistryRemoteRoutesV1(input(record, {
      asOf: record.formationDeadline,
    }), localDeps), /DISCOVERY_TIME_WINDOW_INVALID/u);
    await assert.rejects(discoverMcpRegistryRemoteRoutesV1(input(record, {
      expiresAt: input(record).asOf,
    }), localDeps), /DISCOVERY_TIME_WINDOW_INVALID/u);
    assert.equal(calls, 1);
  });

test("credential-bearing dependencies are rejected before network I/O",
  async () => {
    let calls = 0;
    await assert.rejects(discoverMcpRegistryRemoteRoutesV1(input(tender(
      "credential-rejection")), {
      fetchImpl: async () => { calls += 1; return response(200, {}); },
      timeoutMs: 100,
      apiToken: "SECRET_TOKEN_MUST_NOT_BE_ACCEPTED",
    }), /DEPENDENCIES_FIELDS_INVALID/u);
    assert.equal(calls, 0);
  });

test("boundary fixes the official preview registry and remains HOLD", () => {
  assert.deepEqual(OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_ENDPOINT, {
    origin: "https://registry.modelcontextprotocol.io",
    path: "/v0.1/servers",
    apiVersion: "v0.1",
    method: "GET",
  });
  const boundary = OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_BOUNDARY;
  assert.equal(boundary.registryReleaseState, "PREVIEW");
  assert.equal(boundary.unauthenticatedReadOnlyRequest, true);
  assert.equal(boundary.credentialsAccepted, false);
  assert.equal(boundary.maximumRequestAttempts, 1);
  assert.equal(boundary.maximumResultOccurrencesRequested, 10);
  assert.equal(boundary.maximumResponseBytes, 2 * 1024 * 1024);
  assert.equal(boundary.retryPermitted, false);
  assert.equal(boundary.redirectPermitted, false);
  assert.equal(boundary.occurrenceRowsTreatedAsProviders, false);
  assert.equal(boundary.providerRegistryCreated, false);
  assert.equal(boundary.resultDerivedCountProjected, false);
  assert.equal(boundary.resultDerivedHashProjected, false);
  assert.equal(boundary.capacityEstablished, false);
  assert.equal(boundary.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(boundary.decisionState, "HOLD");
  assert.equal(boundary.authority, "NONE");
  assert.equal(boundary.executable, false);
  assert.equal(OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_SCHEMAS
    .publicProjection,
  "outsider/mcp-registry-privacy-closed-transport-summary/v1");
});
