import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  claimMcpRegistryRemoteCandidateForObservationV1,
  discoverMcpRegistryRemoteRoutesV1,
} from "../src/outsider-mcp-registry-discovery-adapter-v1.js";
import {
  OUTSIDER_MCP_REGISTRY_DISCOVERY_FEDERATION_NODE_V1_BOUNDARY,
  adaptMcpRegistryDiscoveryProjectionV1,
} from "../src/outsider-mcp-registry-discovery-federation-node-v1.js";
import {
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  claimOrderScopedDiscoveryNodeResultV1,
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

function tender(label = "mcp-federation") {
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

function requirementBinding(record) {
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

function federationInput(record, plannedJob, nodeInput) {
  return {
    tender: record,
    asOf: "2099-09-03T12:01:00.000Z",
    publicPlan: {
      schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId: alias("federation", "mcp-only"),
      tenderHash: record.tenderHash,
      workOrderHash: record.workOrderHash,
      typedGraphHash: record.typedGraph.typedGraphHash,
      concurrencyLimit: 1,
      jobs: [plannedJob],
    },
    privateJobs: [{
      occurrenceId: plannedJob.occurrenceId,
      nodeInput,
      privateBindingNonce: h("mcp-private-binding"),
    }],
    privateProjectionNonce: h("mcp-private-projection"),
  };
}

function response(body) {
  return {
    status: 200,
    headers: { get(name) { return name.toLowerCase() === "content-type"
      ? "application/json" : null; } },
    async text() { return JSON.stringify(body); },
  };
}

async function adapterResult(record, body = { servers: [] }) {
  return discoverMcpRegistryRemoteRoutesV1({
    tender: record,
    requirementKind: "RESOURCE",
    requirementId: record.resourceRequirements.items[0].resourceRequirementId,
    discovery: { search: "PRIVATE_SEARCH_QUERY_CANARY", limit: 4 },
    asOf: "2099-09-03T12:01:00.000Z",
    expiresAt: "2099-09-03T12:14:00.000Z",
    privateBindingNonce: h("mcp-private-binding"),
  }, { fetchImpl: async () => response(body), timeoutMs: 100 });
}

test("bridge refuses a receipt outside a module-issued live invocation", async () => {
  const result = await adapterResult(tender("bridge"));
  assert.throws(() => adaptMcpRegistryDiscoveryProjectionV1(result, {}),
    /FEDERATION_INVOCATION_INVALID/u);
});

test("bridge rejects extra fields and semantically forged rehashed projection",
  async () => {
    const issued = await adapterResult(tender("replay"));
    const original = issued.publicProjection;
    assert.throws(() => adaptMcpRegistryDiscoveryProjectionV1({
      publicProjection: { ...original, raw: "PRIVATE_RAW_CANARY" },
    }, {}), /FEDERATION_ENVELOPE_NOT_MODULE_ISSUED/u);

    const body = { ...original, providerOwnershipEstablished: true };
    delete body.projectionHash;
    const forged = { ...body, projectionHash: digest(original.schema, body) };
    assert.throws(() => adaptMcpRegistryDiscoveryProjectionV1({
      publicProjection: forged,
    }, {}), /FEDERATION_ENVELOPE_NOT_MODULE_ISSUED/u);
  });

test("MCP Registry enters the federation as one ordinary privacy-closed node",
  async () => {
    const record = tender("mcp-only-node");
    const slot = alias("node", "mcp-registry-slot");
    const plannedJob = {
      occurrenceId: alias("discovery", "mcp-registry-occurrence"),
      nodeSlotId: slot,
      nodeKind: "mcp.registry.v01",
      ...requirementBinding(record),
      expiresAt: "2099-09-03T12:14:00.000Z",
      maximumRuntimeMs: 1_000,
    };
    let calls = 0;
    const capability = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "mcp.registry.v01",
      async invoke(context) {
        const result = await discoverMcpRegistryRemoteRoutesV1({
          tender: context.tender,
          requirementKind: context.requirementKind,
          requirementId: context.requirementId,
          discovery: context.nodeInput.discovery,
          asOf: context.asOf,
          expiresAt: context.expiresAt,
          privateBindingNonce: context.privateBindingNonce,
        }, {
          fetchImpl: async () => {
            calls += 1;
            return response({
              servers: [{ server: {
                name: "PRIVATE_SERVER_NAME_CANARY",
                version: "PRIVATE_SERVER_VERSION_CANARY",
                description: "PRIVATE_DESCRIPTION_CANARY",
                remotes: [{ type: "streamable-http",
                  url: "https://private-remote.example/mcp" }],
              } }],
              metadata: { count: 947135,
                nextCursor: "PRIVATE_CURSOR_CANARY" },
            });
          },
          timeoutMs: 100,
        });
        return {
          publicReceipt: adaptMcpRegistryDiscoveryProjectionV1(
            result, context),
          privateEphemeral: result,
        };
      },
    });
    const result = await runOrderScopedDiscoveryFederationV1(
      federationInput(record, plannedJob, {
        discovery: { search: "PRIVATE_SEARCH_QUERY_CANARY", limit: 4 },
      }), {
        capabilityBindings: [{ nodeSlotId: slot, capability }],
      });

    assert.equal(calls, 1);
    assert.equal(result.publicProjection.occurrences.length, 1);
    assert.equal(result.publicProjection.occurrences[0].nodeKind,
      "mcp.registry.v01");
    assert.equal(result.publicProjection.occurrences[0].status, "SUCCEEDED");
    assert.equal(result.publicProjection.occurrenceCensus.providerCount, null);
    assert.equal(result.publicProjection.resultDerivedCountProjected, false);
    assert.equal(result.publicProjection.providerRegistryCreated, false);
    assert.equal(result.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(result.publicProjection.capacityEstablished, false);
    assert.equal(result.publicProjection.authority, "NONE");

    const durable = JSON.stringify(result);
    for (const canary of ["PRIVATE_SEARCH_QUERY_CANARY",
      "PRIVATE_SERVER_NAME_CANARY", "PRIVATE_SERVER_VERSION_CANARY",
      "PRIVATE_DESCRIPTION_CANARY", "private-remote.example",
      "PRIVATE_CURSOR_CANARY", "947135"]) {
      assert.equal(durable.includes(canary), false, canary);
    }
    const privateResult = claimOrderScopedDiscoveryNodeResultV1(result,
      plannedJob.occurrenceId);
    const candidate = claimMcpRegistryRemoteCandidateForObservationV1(
      privateResult, 0);
    assert.equal(candidate.remoteTransportUrl,
      "https://private-remote.example/mcp");
    assert.equal(candidate.providerOwnershipEstablished, false);
    assert.equal(candidate.resourceOwnerAuthorityEstablished, false);
    assert.equal(candidate.safetyEstablished, false);
    assert.equal(candidate.capacityEstablished, false);
  });

test("MCP bridge and generic federation have no Brave module import", async () => {
  const [bridgeSource, federationSource] = await Promise.all([
    readFile(new URL(
      "../src/outsider-mcp-registry-discovery-federation-node-v1.js",
      import.meta.url), "utf8"),
    readFile(new URL(
      "../src/outsider-order-scoped-discovery-federation-v1.js",
      import.meta.url), "utf8"),
  ]);
  const braveImport = /from\s+["'][^"']*outsider-brave/iu;
  assert.equal(braveImport.test(bridgeSource), false);
  assert.equal(braveImport.test(federationSource), false);
  assert.equal(OUTSIDER_MCP_REGISTRY_DISCOVERY_FEDERATION_NODE_V1_BOUNDARY
    .genericFederationDependsOnBrave, false);
  assert.equal(OUTSIDER_MCP_REGISTRY_DISCOVERY_FEDERATION_NODE_V1_BOUNDARY
    .braveModuleImported, false);
  assert.equal(OUTSIDER_MCP_REGISTRY_DISCOVERY_FEDERATION_NODE_V1_BOUNDARY
    .mcpRegistryReceivesNoPrivilegedNodeRole, true);
});

test("an MCP envelope cannot cross tenders or bridge twice", async () => {
  const sourceTender = tender("mcp-envelope-source");
  const otherTender = tender("mcp-envelope-other");
  let registryCalls = 0;
  const issued = await discoverMcpRegistryRemoteRoutesV1({
    tender: sourceTender,
    requirementKind: "RESOURCE",
    requirementId:
      sourceTender.resourceRequirements.items[0].resourceRequirementId,
    discovery: { search: "PRIVATE_SEARCH_QUERY_CANARY", limit: 4 },
    asOf: "2099-09-03T12:01:00.000Z",
    expiresAt: "2099-09-03T12:14:00.000Z",
    privateBindingNonce: h("mcp-private-binding"),
  }, {
    fetchImpl: async () => {
      registryCalls += 1;
      return response({ servers: [] });
    },
    timeoutMs: 100,
  });

  const runWith = async (record, label) => {
    const slot = alias("node", `${label}:slot`);
    const plannedJob = {
      occurrenceId: alias("discovery", `${label}:occurrence`),
      nodeSlotId: slot,
      nodeKind: "mcp.registry.v01",
      ...requirementBinding(record),
      expiresAt: "2099-09-03T12:14:00.000Z",
      maximumRuntimeMs: 1_000,
    };
    const capability = createOrderScopedDiscoveryNodeCapabilityV1({
      nodeKind: "mcp.registry.v01",
      async invoke(context) {
        return {
          publicReceipt: adaptMcpRegistryDiscoveryProjectionV1(
            issued, context),
          privateEphemeral: issued,
        };
      },
    });
    return runOrderScopedDiscoveryFederationV1(federationInput(
      record, plannedJob, {
        discovery: { search: "PRIVATE_SEARCH_QUERY_CANARY", limit: 4 },
      }), {
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
  assert.equal(registryCalls, 1);
});
