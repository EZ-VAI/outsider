import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY,
  OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_ENDPOINT,
  OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_SCHEMAS,
  OUTSIDER_BRAVE_WEB_SEARCH_COUNTRIES_V1,
  claimBraveSearchCandidateForSellerObservationV1,
  discoverBraveSearchRoutesV1,
} from "../src/outsider-brave-search-route-discovery-adapter-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;

function tender(label = "brave") {
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
    query: {
      text: "official same-day provider booking Cambridge Massachusetts",
      country: "US",
      searchLang: "en",
      count: 3,
      expiresAt: "2026-09-03T12:14:00.000Z",
    },
    asOf: "2026-09-03T12:01:00.000Z",
    privateBindingNonce: h("private-binding-nonce"),
    ...overrides,
  };
}

function response(status, body) {
  return {
    status,
    headers: { get() { return null; } },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

function successfulBody(urls = ["https://seller.example/book"]) {
  return {
    type: "search",
    query: { original: "PRIVATE_QUERY_CANARY" },
    web: {
      type: "search",
      results: urls.map((url, index) => ({
        title: `RAW_TITLE_CANARY_${index}`,
        url,
        description: `RAW_SNIPPET_CANARY_${index}`,
        contact: `RAW_CONTACT_CANARY_${index}`,
        location: { name: `RAW_POI_CANARY_${index}` },
      })),
    },
  };
}

function assertHeld(projection) {
  assert.equal(projection.externalInfrastructureNetworkIoAttempted, true);
  assert.equal(projection.braveCredentialPresented, true);
  assert.equal(projection.billableRequestPossible, true);
  assert.equal(projection.productionExecutionAuthorityReplayed, false);
  assert.equal(projection.outOfBandPilotAuthorizationRequired, true);
  assert.equal(projection.providerOwnershipEstablished, false);
  assert.equal(projection.downstreamSellerPageReachabilityEstablished, false);
  assert.equal(projection.providerContactPerformed, false);
  assert.equal(projection.tenderDelivered, false);
  assert.equal(projection.providerAcceptanceEstablished, false);
  assert.equal(projection.resourceOwnerAuthorityEstablished, false);
  assert.equal(projection.capacityEstablished, false);
  assert.equal(projection.capacityReserved, false);
  assert.equal(projection.priceEstablished, false);
  assert.equal(projection.economicsEstablished, false);
  assert.equal(projection.guaranteeEstablished, false);
  assert.equal(projection.settlementPermitted, false);
  assert.equal(projection.enabledCapabilityCount, 0);
  assert.equal(projection.enabledCapabilityCountScope,
    "TASK_PROVIDER_ACTION_ONLY");
  assert.equal(projection.provenAuthorityCount, 0);
  assert.equal(projection.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(projection.consequenceReach, "NONE");
  assert.equal(projection.consequenceReachScope, "TASK_PROVIDER_ACTION_ONLY");
  assert.equal(projection.infrastructureConsequenceReach,
    "ONE_BOUNDED_BRAVE_SEARCH_REQUEST");
  assert.equal(projection.decisionState, "HOLD");
  assert.equal(projection.authority, "NONE");
  assert.equal(projection.actionReady, false);
  assert.equal(projection.executable, false);
}

test("one fixed Brave GET yields only private ephemeral seller routes", async () => {
  const record = tender();
  const token = "SECRET_TOKEN_CANARY";
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    return response(200, successfulBody([
      "https://seller.example/book#slot",
      "https://seller.example/book#duplicate",
      "http://insecure.example/contact",
    ]));
  };
  const result = await discoverBraveSearchRoutesV1(input(record), {
    fetchImpl, apiToken: token, timeoutMs: 100,
  });

  assert.equal(calls.length, 1);
  const [rawUrl, options] = calls[0];
  const url = new URL(rawUrl);
  assert.equal(url.origin,
    OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_ENDPOINT.origin);
  assert.equal(url.pathname,
    OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_ENDPOINT.path);
  assert.equal(options.method, "GET");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers["X-Subscription-Token"], token);
  assert.equal(url.searchParams.get("result_filter"), "web");
  assert.equal(url.searchParams.get("safesearch"), "strict");
  assert.equal(url.searchParams.get("enable_rich_callback"), "false");
  assert.equal(url.searchParams.get("include_fetch_metadata"), "false");
  assert.equal(url.searchParams.get("summary"), "false");
  assert.equal(url.searchParams.get("operators"), "false");

  assert.deepEqual(Object.keys(result), ["publicProjection"]);
  assert.equal(Object.prototype.propertyIsEnumerable.call(result,
    "privateEphemeral"), false);
  assert.equal(result.privateEphemeral.candidateLeaseCount, 1);
  const candidate = claimBraveSearchCandidateForSellerObservationV1(result, 0);
  assert.deepEqual(candidate, {
    routeKind: "PROVIDER_OWNED_PUBLIC_ENTRY",
    routeKindEstablished: false,
    sellerUrl: "https://seller.example/book",
    transactionSurfaceRefHash:
      candidate.transactionSurfaceRefHash,
    providerOwnershipEstablished: false,
    downstreamSellerPageReachability: "UNTESTED",
    contactabilityEstablished: false,
  });
  assert.match(candidate
    .transactionSurfaceRefHash, /^sha256:[a-f0-9]{64}$/u);
  assert.throws(() => claimBraveSearchCandidateForSellerObservationV1(
    result, 0), /CANDIDATE_ALREADY_CONSUMED/u);
  assert.throws(() => claimBraveSearchCandidateForSellerObservationV1(
    JSON.parse(JSON.stringify(result)), 0),
  /EPHEMERAL_ENVELOPE_NOT_MODULE_ISSUED/u);
  assert.equal(result.privateEphemeral.rawResponseRetained, false);
  assert.equal(result.privateEphemeral.rawResultFieldsRetained, false);
  assert.equal(result.privateEphemeral.apiTokenRetained, false);

  const durable = JSON.stringify(result);
  for (const canary of [token, "seller.example", "PRIVATE_QUERY_CANARY",
    "official same-day", "RAW_TITLE_CANARY", "RAW_SNIPPET_CANARY",
    "RAW_CONTACT_CANARY", "RAW_POI_CANARY"]) {
    assert.equal(durable.includes(canary), false, canary);
  }
  assert.equal(Object.hasOwn(result.publicProjection, "candidateCount"), false);
  assert.equal(result.publicProjection.resultDerivedCountProjected, false);
  assert.equal(result.publicProjection.storageRightsEstablished, false);
  assert.equal(result.publicProjection.durableCollectorAdmissionPermitted, false);
  assert.equal(result.publicProjection
    .freshSellerOwnedSourceRequiredForDurableCollectorAdmission, true);
  assert.equal(result.publicProjection.status, "SUCCEEDED");
  assert.equal(result.publicProjection.braveDiscoverySucceeded, true);
  assert.equal(result.publicProjection.failureCode, null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.privateEphemeral), true);
  assert.equal(Object.isFrozen(result.publicProjection), true);
  assertHeld(result.publicProjection);
});

test("private commitment binds exact tender, requirement, and query", async () => {
  const record = tender("binding");
  const run = (value) => discoverBraveSearchRoutesV1(value, {
    fetchImpl: async () => response(200, successfulBody()),
    apiToken: "token",
    timeoutMs: 100,
  });
  const base = input(record);
  const same = await run(base);
  const sameAgain = await run(base);
  const changedQuery = await run(input(record, {
    query: { ...base.query, text: `${base.query.text} changed` },
  }));
  const evidence = await run(input(record, {
    requirementKind: "EVIDENCE",
    requirementId: record.evidenceRequirements.items[0].evidenceRequirementId,
  }));
  const otherTender = tender("binding-other");
  const changedTender = await run(input(otherTender));
  const path = (value) => value.privateEphemeral.binding
    .exactTenderRequirementQueryBindingHash;

  assert.equal(path(same), path(sameAgain));
  assert.notEqual(path(same), path(changedQuery));
  assert.notEqual(path(same), path(evidence));
  assert.notEqual(path(same), path(changedTender));
  assert.equal(same.privateEphemeral.binding.tenderHash, record.tenderHash);
  assert.equal(same.privateEphemeral.binding.requirementId,
    record.resourceRequirements.items[0].resourceRequirementId);
  assert.match(same.privateEphemeral.binding.requirementObjectHash,
    /^sha256:[a-f0-9]{64}$/u);
  assert.match(same.privateEphemeral.binding.queryHash,
    /^sha256:[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(same.publicProjection)
    .includes(path(same)), false);
  assert.equal(JSON.stringify(same.publicProjection)
    .includes(same.privateEphemeral.binding.queryHash), false);
});

test("unsupported Brave country fails locally while null supports text location",
  async () => {
    const record = tender("country");
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return response(200, successfulBody());
    };
    assert.equal(OUTSIDER_BRAVE_WEB_SEARCH_COUNTRIES_V1.includes("US"), true);
    assert.equal(OUTSIDER_BRAVE_WEB_SEARCH_COUNTRIES_V1.includes("JP"), true);
    assert.equal(OUTSIDER_BRAVE_WEB_SEARCH_COUNTRIES_V1.includes("KE"), false);
    await assert.rejects(discoverBraveSearchRoutesV1(input(record, {
      query: { ...input(record).query, text: "provider Nairobi Kenya",
        country: "KE" },
    }), { fetchImpl, apiToken: "token", timeoutMs: 100 }),
    /QUERY_COUNTRY_UNSUPPORTED/u);
    assert.equal(calls, 0);

    const result = await discoverBraveSearchRoutesV1(input(record, {
      query: { ...input(record).query, text: "provider Nairobi Kenya",
        country: null },
    }), { fetchImpl, apiToken: "token", timeoutMs: 100 });
    assert.equal(calls, 1);
    assert.equal(result.publicProjection.status, "SUCCEEDED");
  });

test("401, 403, 422, and 429 fail closed after exactly one attempt", async () => {
  const record = tender("status");
  for (const [status, failureCode] of [
    [401, "SOURCE_PERMISSION_DENIED"],
    [403, "SOURCE_PERMISSION_DENIED"],
    [422, "SOURCE_MALFORMED"],
    [429, "SOURCE_RATE_LIMITED"],
  ]) {
    let calls = 0;
    const result = await discoverBraveSearchRoutesV1(input(record), {
      fetchImpl: async () => {
        calls += 1;
        return response(status, { error: "RAW_ERROR_CANARY" });
      },
      apiToken: "SECRET_STATUS_TOKEN",
      timeoutMs: 100,
    });
    assert.equal(calls, 1);
    assert.equal(result.publicProjection.status, "FAILED");
    assert.equal(result.publicProjection.failureCode, failureCode);
    assert.equal(result.publicProjection.braveRequestAttemptCount, 1);
    assert.equal(result.publicProjection.retryCount, 0);
    assert.equal(result.privateEphemeral.candidateLeaseCount, 0);
    assert.equal(JSON.stringify(result).includes("RAW_ERROR_CANARY"), false);
    assertHeld(result.publicProjection);
  }
});

test("malformed JSON/schema and transport errors fail closed without leakage",
  async () => {
    const record = tender("malformed");
    const token = "SECRET_MALFORMED_TOKEN";
    const cases = [
      async () => ({ status: 200, headers: { get() { return null; } },
        async text() {
        throw new Error("RAW_PARSE_ERROR_CANARY");
      } }),
      async () => response(200, { type: "search", web: {} }),
      async () => response(200, { type: "search",
        web: { results: [{ title: "RAW_TITLE", url: 7 }] } }),
      async () => { throw new Error(`transport leaked ${token}`); },
    ];
    for (let index = 0; index < cases.length; index += 1) {
      let calls = 0;
      const result = await discoverBraveSearchRoutesV1(input(record), {
        fetchImpl: async (...args) => {
          calls += 1;
          return cases[index](...args);
        },
        apiToken: token,
        timeoutMs: 100,
      });
      assert.equal(calls, 1);
      assert.equal(result.publicProjection.status, "FAILED");
      assert.equal(result.publicProjection.failureCode,
        index === cases.length - 1
          ? "SOURCE_TRANSPORT_UNAVAILABLE" : "SOURCE_MALFORMED");
      assert.equal(result.privateEphemeral.candidateLeaseCount, 0);
      const bytes = JSON.stringify(result);
      for (const canary of [token, "RAW_PARSE_ERROR_CANARY", "RAW_TITLE",
        "transport leaked"]) assert.equal(bytes.includes(canary), false);
      assertHeld(result.publicProjection);
    }
  });

test("query expiry and formation window fail closed before network I/O",
  async () => {
    const record = tender("expiry");
    let calls = 0;
    const deps = { fetchImpl: async () => {
      calls += 1;
      return response(200, successfulBody());
    }, apiToken: "token", timeoutMs: 100 };
    await assert.rejects(discoverBraveSearchRoutesV1(input(record, {
      asOf: record.formationDeadline,
    }), deps), /QUERY_TIME_WINDOW_INVALID/u);
    await assert.rejects(discoverBraveSearchRoutesV1(input(record, {
      query: { ...input(record).query,
        expiresAt: "2026-09-03T12:01:00.000Z" },
    }), deps), /QUERY_TIME_WINDOW_INVALID/u);
    assert.equal(calls, 0);
  });

test("oversized response is aborted before JSON parsing and retained nowhere",
  async () => {
    const record = tender("oversized");
    let signal;
    const result = await discoverBraveSearchRoutesV1(input(record), {
      fetchImpl: async (_url, options) => {
        signal = options.signal;
        return response(200, `{"type":"search","padding":"${"x".repeat(
          2 * 1024 * 1024)}"}`);
      },
      apiToken: "SECRET_OVERSIZED_TOKEN",
      timeoutMs: 100,
    });
    assert.equal(signal.aborted, true);
    assert.equal(result.publicProjection.status, "FAILED");
    assert.equal(result.publicProjection.failureCode, "SOURCE_MALFORMED");
    assert.equal(JSON.stringify(result).includes("padding"), false);
    assert.equal(JSON.stringify(result).includes("SECRET_OVERSIZED_TOKEN"),
      false);
    assertHeld(result.publicProjection);
  });

test("timeout aborts the sole request and never retries", async () => {
  const record = tender("timeout");
  let calls = 0;
  let signal;
  const result = await discoverBraveSearchRoutesV1(input(record), {
    fetchImpl: async (_url, options) => {
      calls += 1;
      signal = options.signal;
      return new Promise(() => {});
    },
    apiToken: "SECRET_TIMEOUT_TOKEN",
    timeoutMs: 5,
  });
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.equal(result.publicProjection.status, "FAILED");
  assert.equal(result.publicProjection.failureCode, "SOURCE_TIMEOUT");
  assert.equal(result.publicProjection.retryCount, 0);
  assert.equal(result.privateEphemeral.candidateLeaseCount, 0);
  assertHeld(result.publicProjection);
});

test("Brave success is distinct from untested downstream seller reachability",
  async () => {
    const record = tender("downstream");
    const calls = [];
    const result = await discoverBraveSearchRoutesV1(input(record), {
      fetchImpl: async (url) => {
        calls.push(url);
        return response(200,
          successfulBody(["https://seller-that-may-return-403.example/book"]));
      },
      apiToken: "token",
      timeoutMs: 100,
    });
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0]).origin, "https://api.search.brave.com");
    assert.equal(result.publicProjection.braveDiscoverySucceeded, true);
    assert.equal(result.publicProjection
      .downstreamSellerPageReachabilityEstablished, false);
    const candidate = claimBraveSearchCandidateForSellerObservationV1(
      result, 0);
    assert.equal(candidate
      .downstreamSellerPageReachability, "UNTESTED");
    assert.equal(candidate
      .providerOwnershipEstablished, false);
    assert.equal(result.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(result.publicProjection.capacityReserved, false);
  });

test("boundary is fixed, privacy closed, and economically inert", () => {
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_ENDPOINT.origin,
    "https://api.search.brave.com");
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_ENDPOINT.path,
    "/res/v1/web/search");
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .maximumRequestAttempts, 1);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .retryPermitted, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .externalInfrastructureNetworkIoPossible, true);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .singleBillableBraveRequestPossible, true);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .productionExecutionAuthorityReplayed, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .productionExecutionPermitted, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .maximumResponseBytes, 2 * 1024 * 1024);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .responseBodyLimitEnforcedBeforeJsonParsing, true);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .exactQueryExpiryRequired, true);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .rawResponseProjected, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .candidateSellerUrlProjectedDurably, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .storageRightsEstablished, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .durableCollectorAdmissionPermitted, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .capacityReserved, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .economicsEstablished, false);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
    .enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_SCHEMAS
    .privateEphemeral,
  "outsider/brave-search-caller-private-ephemeral-route-discovery/v1");
});
