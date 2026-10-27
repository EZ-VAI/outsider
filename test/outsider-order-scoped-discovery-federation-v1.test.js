import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  claimBraveSearchCandidateForSellerObservationV1,
  discoverBraveSearchRoutesV1,
} from "../src/outsider-brave-search-route-discovery-adapter-v1.js";
import {
  OUTSIDER_BRAVE_SEARCH_DISCOVERY_FEDERATION_NODE_V1_BOUNDARY,
  adaptBraveSearchDiscoveryProjectionV1,
}
  from "../src/outsider-brave-search-discovery-federation-node-v1.js";
import {
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_BOUNDARY,
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_LIMITS,
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  claimOrderScopedDiscoveryNodeResultV1,
  createOrderScopedDiscoveryNodeCapabilityV1,
  createOrderScopedDiscoveryNodeReceiptV1,
  runOrderScopedDiscoveryFederationV1,
} from "../src/outsider-order-scoped-discovery-federation-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

function tender(label = "federation") {
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

function requirementBinding(record, kind = "RESOURCE") {
  const section = kind === "RESOURCE" ? record.resourceRequirements
    : kind === "EVIDENCE" ? record.evidenceRequirements
      : record.recoveryRequirements;
  const idField = kind === "RESOURCE" ? "resourceRequirementId"
    : kind === "EVIDENCE" ? "evidenceRequirementId"
      : "recoveryRequirementId";
  const row = section.items[0];
  return {
    requirementKind: kind,
    requirementId: row[idField],
    requirementSetHash: section.requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: record.tenderHash,
        requirementKind: kind,
        requirementSetHash: section.requirementSetHash,
        requirement: row,
      }),
  };
}

function job(record, index, nodeSlotId, nodeKind, kind = "RESOURCE") {
  return {
    occurrenceId: alias("discovery", `occurrence:${index}`),
    nodeSlotId,
    nodeKind,
    ...requirementBinding(record, kind),
    expiresAt: "2099-09-03T12:14:00.000Z",
    maximumRuntimeMs: 1_000,
  };
}

function federationInput(record, jobs, privateInputs) {
  return {
    tender: record,
    asOf: "2099-09-03T12:01:00.000Z",
    publicPlan: {
      schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId: alias("federation", "test-federation"),
      tenderHash: record.tenderHash,
      workOrderHash: record.workOrderHash,
      typedGraphHash: record.typedGraph.typedGraphHash,
      concurrencyLimit: 2,
      jobs,
    },
    privateJobs: jobs.map((row, index) => ({
      occurrenceId: row.occurrenceId,
      nodeInput: privateInputs[index],
      privateBindingNonce: h(`private-binding:${index}`),
    })),
    privateProjectionNonce: h("private-projection"),
  };
}

function successReceipt(invocation, networkIo = false) {
  return createOrderScopedDiscoveryNodeReceiptV1(invocation, {
    status: "SUCCEEDED",
    failureCode: null,
    externalInfrastructureNetworkIoAttempted: networkIo,
  });
}

test("arbitrary nodes form a bounded per-order federation without dedup",
  async () => {
    const record = tender();
    const slotA = alias("node", "slot-a");
    const slotB = alias("node", "slot-b");
    const jobs = [
      job(record, 0, slotA, "local.directory.v1"),
      job(record, 1, slotA, "local.directory.v1"),
      job(record, 2, slotB, "remote.marketplace.v3", "EVIDENCE"),
    ];
    let inFlight = 0;
    let peak = 0;
    const calls = [];
    const makeCapability = (nodeKind) =>
      createOrderScopedDiscoveryNodeCapabilityV1({
        nodeKind,
        async invoke(context) {
          calls.push(context.occurrenceId);
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setImmediate(resolve));
          inFlight -= 1;
          assert.equal(Object.isFrozen(context), true);
          assert.equal(context.tender.tenderHash, record.tenderHash);
          assert.match(context.exactPrivateBindingHash,
            /^sha256:[a-f0-9]{64}$/u);
          return { publicReceipt: successReceipt(context,
            nodeKind.startsWith("remote")),
            privateEphemeral: { privateCanary: context.nodeInput.canary } };
        },
      });
    const result = await runOrderScopedDiscoveryFederationV1(
      federationInput(record, jobs, [
        { canary: "PRIVATE_QUERY_ALPHA" },
        { canary: "PRIVATE_QUERY_ALPHA" },
        { canary: "PRIVATE_QUERY_BETA" },
      ]), {
        capabilityBindings: [
          { nodeSlotId: slotA,
            capability: makeCapability("local.directory.v1") },
          { nodeSlotId: slotB,
            capability: makeCapability("remote.marketplace.v3") },
        ],
      });

    assert.equal(calls.length, 3);
    assert.equal(peak, 2);
    assert.deepEqual(result.publicProjection.occurrences.map(
      (row) => row.occurrenceId), jobs.map((row) => row.occurrenceId));
    assert.equal(result.publicProjection.occurrenceCensus
      .plannedOccurrenceCount, 3);
    assert.equal(result.publicProjection.occurrenceCensus
      .invokedOccurrenceCount, 3);
    assert.equal(result.publicProjection.occurrenceCensus
      .providerObjectDedupPerformed, false);
    assert.equal(result.publicProjection.occurrenceCensus.providerCount, null);
    assert.equal(result.publicProjection.providerRegistryCreated, false);
    assert.equal(result.publicProjection.decisionState, "HOLD");
    assert.equal(result.publicProjection.authority, "NONE");
    assert.equal(result.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(result.publicProjection.providerContactPerformed,
      "NOT_INDEPENDENTLY_ESTABLISHED");
    assert.equal(result.publicProjection.capacityEstablished, false);
    assert.equal(result.publicProjection.capacityReserved, false);
    assert.equal(result.publicProjection.priceEstablished, false);
    assert.equal(result.publicProjection.economicsEstablished, false);
    assert.equal(result.publicProjection.enabledCapabilityCount, 0);
    assert.equal(result.publicProjection
      .enabledCapabilitiesSubsetOfProvenAuthority, true);
    assert.equal(result.publicProjection.consequenceReach,
      "NOT_INDEPENDENTLY_ESTABLISHED");
    assert.equal(result.publicProjection.hardGateAdmissionPermitted, false);

    assert.deepEqual(Object.keys(result), ["publicProjection"]);
    assert.equal(Object.prototype.propertyIsEnumerable.call(result,
      "privateEphemeral"), false);
    const durable = JSON.stringify(result);
    assert.equal(durable.includes("PRIVATE_QUERY_ALPHA"), false);
    assert.equal(durable.includes("PRIVATE_QUERY_BETA"), false);
    assert.equal(Object.hasOwn(result.publicProjection, "projectionHash"),
      false);
    assert.match(result.publicProjection.planHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.equal(result.publicProjection.resultDerivedCountProjected, false);
    assert.equal(result.publicProjection.resultRankingProjected, false);
    assert.equal(result.publicProjection.resultDerivedFingerprintProjected,
      false);

    assert.deepEqual(claimOrderScopedDiscoveryNodeResultV1(result,
      jobs[0].occurrenceId), { privateCanary: "PRIVATE_QUERY_ALPHA" });
    assert.throws(() => claimOrderScopedDiscoveryNodeResultV1(result,
      jobs[0].occurrenceId), /PRIVATE_NODE_RESULT_ALREADY_CONSUMED/u);
    assert.throws(() => claimOrderScopedDiscoveryNodeResultV1(
      JSON.parse(JSON.stringify(result)), jobs[1].occurrenceId),
    /FEDERATION_RESULT_NOT_MODULE_ISSUED/u);
  });

test("full plan and all bindings fail before the first node call", async () => {
  const record = tender("preflight");
  const slot = alias("node", "preflight-slot");
  const jobs = [
    job(record, 10, slot, "open.discovery.v1"),
    job(record, 11, slot, "open.discovery.v1"),
  ];
  let calls = 0;
  const capability = createOrderScopedDiscoveryNodeCapabilityV1({
    nodeKind: "open.discovery.v1",
    invoke: async (context) => {
      calls += 1;
      return { publicReceipt: successReceipt(context), privateEphemeral: null };
    },
  });
  const forged = structuredClone(federationInput(record, jobs, [{}, {}]));
  forged.publicPlan.jobs[1].requirementObjectHash = h("forged");
  await assert.rejects(runOrderScopedDiscoveryFederationV1(forged, {
    capabilityBindings: [{ nodeSlotId: slot, capability }],
  }), /JOB_REQUIREMENT_BINDING_MISMATCH/u);
  assert.equal(calls, 0);

  const missingBinding = federationInput(record, jobs, [{}, {}]);
  await assert.rejects(runOrderScopedDiscoveryFederationV1(missingBinding, {
    capabilityBindings: [],
  }), /CAPABILITY_BINDINGS_INVALID|CAPABILITY_BINDING_BIJECTION_INVALID/u);
  assert.equal(calls, 0);
});

test("each job is attempted once; thrown and malformed results are sanitized",
  async () => {
    const record = tender("failure");
    const throwSlot = alias("node", "throw-slot");
    const malformedSlot = alias("node", "malformed-slot");
    const jobs = [
      job(record, 20, throwSlot, "remote.throwing.v1"),
      job(record, 21, malformedSlot, "local.malformed.v1"),
    ];
    let thrownCalls = 0;
    let malformedCalls = 0;
    const thrown = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "remote.throwing.v1",
      invoke: async () => {
        thrownCalls += 1;
        throw new Error("SECRET_ERROR_STACK_CANARY");
      },
    });
    const malformed = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "local.malformed.v1",
      invoke: async () => {
        malformedCalls += 1;
        return { publicReceipt: { status: "SUCCEEDED" },
          privateEphemeral: "SECRET_RESULT_CANARY" };
      },
    });
    const result = await runOrderScopedDiscoveryFederationV1(
      federationInput(record, jobs, [{}, {}]), {
        capabilityBindings: [
          { nodeSlotId: throwSlot, capability: thrown },
          { nodeSlotId: malformedSlot, capability: malformed },
        ],
      });
    assert.equal(thrownCalls, 1);
    assert.equal(malformedCalls, 1);
    assert.deepEqual(result.publicProjection.occurrences.map(
      (row) => row.failureCode), [
      "NODE_INVOCATION_FAILED", "NODE_RESULT_MALFORMED",
    ]);
    assert.equal(result.publicProjection.occurrences.every(
      (row) => row.federationRetryCount === 0), true);
    const durable = JSON.stringify(result);
    assert.equal(durable.includes("SECRET_ERROR_STACK_CANARY"), false);
    assert.equal(durable.includes("SECRET_RESULT_CANARY"), false);
  });

test("receipts are exact-invocation-bound, one-issued, and one-consumed",
  async () => {
    assert.throws(() => successReceipt({}),
      /INVOCATION_NOT_CURRENTLY_MODULE_ISSUED/u);
    const record = tender("receipt-binding");
    const slot = alias("node", "receipt-binding-slot");
    const jobs = [
      job(record, 25, slot, "local.receipt-binding.v1"),
      job(record, 26, slot, "local.receipt-binding.v1"),
    ];
    let firstReceipt;
    let calls = 0;
    const capability = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "local.receipt-binding.v1",
      async invoke(context) {
        calls += 1;
        if (calls === 1) {
          firstReceipt = successReceipt(context);
          assert.throws(() => successReceipt(context),
            /INVOCATION_RECEIPT_ALREADY_ISSUED/u);
          return { publicReceipt: firstReceipt, privateEphemeral: null };
        }
        return { publicReceipt: firstReceipt, privateEphemeral: null };
      },
    });
    const result = await runOrderScopedDiscoveryFederationV1(
      federationInput(record, jobs, [{}, {}]), {
        capabilityBindings: [{ nodeSlotId: slot, capability }],
      });
    assert.deepEqual(result.publicProjection.occurrences.map(
      (row) => [row.status, row.failureCode]), [
      ["SUCCEEDED", null],
      ["FAILED", "NODE_RESULT_MALFORMED"],
    ]);
  });

test("runtime timeout aborts and an expired queued job is never invoked",
  async (t) => {
    const record = tender("runtime-bound");
    const slot = alias("node", "runtime-bound-slot");
    const jobs = [
      { ...job(record, 27, slot, "remote.runtime-bound.v1"),
        maximumRuntimeMs: 5 },
      { ...job(record, 28, slot, "remote.runtime-bound.v1"),
        maximumRuntimeMs: 5 },
    ];
    const beforeExpiry = Date.parse("2099-09-03T12:01:01.000Z");
    const afterExpiry = Date.parse("2099-09-03T12:14:01.000Z");
    let clockReads = 0;
    t.mock.method(Date, "now", () => {
      clockReads += 1;
      return clockReads === 1 ? beforeExpiry : afterExpiry;
    });
    let calls = 0;
    let signal;
    const capability = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "remote.runtime-bound.v1",
      async invoke(context) {
        calls += 1;
        signal = context.abortSignal;
        return new Promise(() => {});
      },
    });
    const result = await runOrderScopedDiscoveryFederationV1(
      federationInput(record, jobs, [{}, {}]), {
        capabilityBindings: [{ nodeSlotId: slot, capability }],
      });
    assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
    assert.deepEqual(result.publicProjection.occurrences.map(
      (row) => [row.failureCode, row.federationInvocationAttemptCount]), [
      ["NODE_INVOCATION_TIMEOUT", 1],
      ["NODE_EXPIRED_BEFORE_INVOCATION", 0],
    ]);
    assert.equal(result.publicProjection.occurrenceCensus
      .invokedOccurrenceCount, 1);
    assert.equal(result.publicProjection.postTimeoutSideEffectsPrevented,
      false);
  });

test("Brave public projection adapts as one ordinary private-capability node",
  async () => {
    const record = tender("brave-federated");
    const slot = alias("node", "brave-slot");
    const plannedJob = job(record, 30, slot, "brave.web_search.v1");
    const token = "SECRET_BRAVE_TOKEN_CANARY";
    let fetchCalls = 0;
    const braveCapability = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "brave.web_search.v1",
      async invoke(context) {
        const braveResult = await discoverBraveSearchRoutesV1({
          tender: context.tender,
          requirementKind: context.requirementKind,
          requirementId: context.requirementId,
          query: context.nodeInput.query,
          asOf: context.asOf,
          privateBindingNonce: context.privateBindingNonce,
        }, {
          apiToken: token,
          timeoutMs: 100,
          fetchImpl: async () => {
            fetchCalls += 1;
            return {
              status: 200,
              headers: { get() { return null; } },
              async text() {
                return JSON.stringify({
                  type: "search",
                  query: { original: "RAW_QUERY_CANARY" },
                  web: { type: "search", results: [{
                    title: "RAW_TITLE_CANARY",
                    description: "RAW_SNIPPET_CANARY",
                    url: "https://seller.example/private-booking",
                    contact: "RAW_CONTACT_CANARY",
                    location: { name: "RAW_POI_CANARY" },
                  }] },
                });
              },
            };
          },
        });
        return {
          publicReceipt: adaptBraveSearchDiscoveryProjectionV1(
            braveResult, context),
          privateEphemeral: braveResult,
        };
      },
    });
    const queryText = "SECRET_EXACT_QUERY_CANARY provider Cambridge";
    const result = await runOrderScopedDiscoveryFederationV1(
      federationInput(record, [plannedJob], [{ query: {
        text: queryText, country: "US", searchLang: "en", count: 3,
        expiresAt: plannedJob.expiresAt,
      } }]), {
        capabilityBindings: [{ nodeSlotId: slot,
          capability: braveCapability }],
      });
    assert.equal(fetchCalls, 1);
    assert.equal(result.publicProjection.occurrences[0].status, "SUCCEEDED");
    assert.equal(result.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(result.publicProjection.capacityReserved, false);
    const durable = JSON.stringify(result);
    for (const canary of [token, queryText, "seller.example",
      "RAW_QUERY_CANARY", "RAW_TITLE_CANARY", "RAW_SNIPPET_CANARY",
      "RAW_CONTACT_CANARY", "RAW_POI_CANARY", "private-booking"]) {
      assert.equal(durable.includes(canary), false, canary);
    }
    const braveResult = claimOrderScopedDiscoveryNodeResultV1(result,
      plannedJob.occurrenceId);
    const candidate = claimBraveSearchCandidateForSellerObservationV1(
      braveResult, 0);
    assert.equal(candidate.sellerUrl,
      "https://seller.example/private-booking");
    assert.equal(candidate.routeKind, "PROVIDER_OWNED_PUBLIC_ENTRY");
    assert.equal(candidate.routeKindEstablished, false);
    assert.equal(candidate.providerOwnershipEstablished, false);
    assert.equal(candidate.downstreamSellerPageReachability, "UNTESTED");
  });

test("a Brave envelope cannot cross tenders or bridge twice", async () => {
  const sourceTender = tender("brave-envelope-source");
  const otherTender = tender("brave-envelope-other");
  const query = {
    text: "PRIVATE_EXACT_QUERY_CANARY",
    country: "US",
    searchLang: "en",
    count: 3,
    expiresAt: "2099-09-03T12:14:00.000Z",
  };
  let braveCalls = 0;
  const issued = await discoverBraveSearchRoutesV1({
    tender: sourceTender,
    requirementKind: "RESOURCE",
    requirementId:
      sourceTender.resourceRequirements.items[0].resourceRequirementId,
    query,
    asOf: "2099-09-03T12:01:00.000Z",
    privateBindingNonce: h("private-binding:0"),
  }, {
    apiToken: "SECRET_BRAVE_TOKEN_CANARY",
    timeoutMs: 100,
    fetchImpl: async () => {
      braveCalls += 1;
      return {
        status: 200,
        headers: { get() { return null; } },
        async text() {
          return JSON.stringify({ type: "search", web: {
            type: "search", results: [],
          } });
        },
      };
    },
  });
  const runWith = async (record, label) => {
    const slot = alias("node", `${label}:slot`);
    const plannedJob = job(record, label === "wrong-tender" ? 31
      : label === "exact-tender" ? 32 : 33, slot, "brave.web_search.v1");
    const capability = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "brave.web_search.v1",
      async invoke(context) {
        return {
          publicReceipt: adaptBraveSearchDiscoveryProjectionV1(
            issued, context),
          privateEphemeral: issued,
        };
      },
    });
    return runOrderScopedDiscoveryFederationV1(
      federationInput(record, [plannedJob], [{ query }]), {
        capabilityBindings: [{ nodeSlotId: slot, capability }],
      });
  };

  const crossTender = await runWith(otherTender, "wrong-tender");
  assert.equal(crossTender.publicProjection.occurrences[0].failureCode,
    "NODE_INVOCATION_FAILED");
  const exact = await runWith(sourceTender, "exact-tender");
  assert.equal(exact.publicProjection.occurrences[0].status, "SUCCEEDED");
  const reused = await runWith(sourceTender, "reused-envelope");
  assert.equal(reused.publicProjection.occurrences[0].failureCode,
    "NODE_INVOCATION_FAILED");
  assert.equal(braveCalls, 1);
});

test("there is no global node ceiling, while each order is capped at 64 jobs",
  async () => {
    const capabilities = [];
    for (let index = 0; index < 100; index += 1) {
      capabilities.push(createOrderScopedDiscoveryNodeCapabilityV1({
        nodeKind: `open.node-${index}.v1`,
        invoke: async (context) => ({ publicReceipt: successReceipt(context),
          privateEphemeral: null }),
      }));
    }
    assert.equal(capabilities.length, 100);
    assert.equal(OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_LIMITS
      .maximumGlobalNodeCount, null);
    assert.equal(OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_LIMITS
      .maximumJobsPerOrder, 64);
    assert.equal(OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_LIMITS
      .maximumConcurrencyPerOrder, 8);

    const record = tender("limits");
    const slot = alias("node", "limit-slot");
    const jobs = Array.from({ length: 65 }, (_unused, index) =>
      job(record, 100 + index, slot, "open.node-0.v1"));
    const input = federationInput(record, jobs, jobs.map(() => ({})));
    let calls = 0;
    const capability = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "open.node-0.v1",
      invoke: async (context) => {
        calls += 1;
        return { publicReceipt: successReceipt(context), privateEphemeral: null };
      },
    });
    await assert.rejects(runOrderScopedDiscoveryFederationV1(input, {
      capabilityBindings: [{ nodeSlotId: slot, capability }],
    }), /JOBS_INVALID/u);
    assert.equal(calls, 0);

    assert.equal(OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_BOUNDARY
      .nodeKindVocabularyHardCoded, false);
    assert.equal(OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_BOUNDARY
      .noNamedNodeReceivesPrivilegedRole, true);
    assert.equal(OUTSIDER_BRAVE_SEARCH_DISCOVERY_FEDERATION_NODE_V1_BOUNDARY
      .braveReceivesNoPrivilegedNodeRole, true);
    assert.equal(OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_BOUNDARY
      .federationCoreNetworkIoPerformed, false);
    assert.equal(OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_BOUNDARY
      .decisionState, "HOLD");
  });
