import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { compileOutsiderOutcomeTenderV1 } from "../src/outsider-outcome-tender-v1.js";
import { OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  createOrderScopedDiscoveryNodeCapabilityV1,
  runOrderScopedDiscoveryFederationV1,
  claimOrderScopedDiscoveryNodeResultV1 } from "../src/outsider-order-scoped-discovery-federation-v1.js";
import { createOrderScopedSellerOriginIssuerV1,
  sealSellerOriginFromDiscoveryInvocationV1,
  claimOrderScopedSellerOriginV1 } from "../src/outsider-order-scoped-seller-origin-lease-v1.js";

const h = (x) => `sha256:${createHash("sha256").update(x).digest("hex")}`;
const id = (p, x) => `${p}_${h(x).slice(7, 39)}`;
const dg = (d, v) => h(`${d}\0${canonicalizeStrict(v)}`);
function tender(label) {
  const evidence = id("evidence", label);
  return compileOutsiderOutcomeTenderV1({ tenderId: id("tender", label), compiledAt: "2099-01-01T00:00:00.000Z", lineage: { revision: 0, predecessorTenderHash: null, supersedesTenderHash: null }, workOrderHash: h(`${label}:work`), typedGraph: { principalEpoch: { principalRefHash: h(`${label}:p`), epochRefHash: h(`${label}:e`), principalEpochProjectionHash: h(`${label}:pe`) }, accountableDeployment: { deploymentLineageRefHash: h(`${label}:dl`), deploymentRevisionHash: h(`${label}:dr`), accountableDeploymentSubjectHash: h(`${label}:ds`) }, runtime: { runtimeInstanceRefHash: h(`${label}:rr`), runtimeInstanceHash: h(`${label}:ri`) }, embodiment: { present: false, deviceLineageRefHash: null, embodimentRevisionHash: null }, delegation: { delegationEvidenceRefHash: h(`${label}:de`), delegationEdgeHash: h(`${label}:ded`) }, episode: { episodeHash: h(`${label}:ep`), networkCompleteEpisodeJoinHash: h(`${label}:ej`) }, attempt: { attemptHash: h(`${label}:a`), attemptActorSubjectHash: h(`${label}:as`) } }, authorizationBinding: { actorIdentityEnvelopeHash: h(`${label}:ai`), delegationEvidenceRefHash: h(`${label}:de`), delegationEdgeHash: h(`${label}:ded`), authorityScopeRefHash: h(`${label}:au`), resourceOwnerAuthorizationRefHash: h(`${label}:ro`), rightsPrivacyPolicyRefHash: h(`${label}:rp`) }, exactOutcome: { outcomeKindCode: "GENERIC_OUTCOME_ESTABLISHED", outcomeSpecRefHash: h(`${label}:os`), subjectRefHash: h(`${label}:s`), acceptanceCriteriaRefHash: h(`${label}:ac`), conditions: [{ conditionId: id("condition", label), metricCode: "GENERIC_STATE", comparator: "EQUAL", target: { valueKind: "STATE_CODE", booleanValue: null, integerValue: null, stateCode: "COMPLETE", unitCode: null }, observationWindowMs: 0, conditionRefHash: h(`${label}:cr`), mandatory: true }], deadline: "2099-01-02T00:00:00.000Z" }, formationDeadline: "2099-01-01T00:10:00.000Z", resourceRequirements: [{ resourceRequirementId: id("resource", label), resourceClassCode: "GENERIC_RESOURCE", capabilityRefHash: h(`${label}:c`), quantity: 1, unitCode: "RESOURCE", regionRefHash: h(`${label}:g`), requiredBy: "2099-01-01T00:11:00.000Z", mandatory: true }], evidenceRequirements: [{ evidenceRequirementId: evidence, evidenceClassCode: "INDEPENDENT_EXTERNAL_OUTCOME_EVIDENCE", evidenceRequirementRefHash: h(`${label}:er`), sourceControl: "INDEPENDENT_OF_PROVIDER", observationMode: "AT_COMPLETION", dueBy: "2099-01-02T00:00:00.000Z", mandatory: true }], recoveryRequirements: [{ recoveryRequirementId: id("recovery", label), triggerRefHash: h(`${label}:t`), recoveryOutcomeRefHash: h(`${label}:r`), resourceClassCode: "GENERIC_RECOVERY_RESOURCE", maximumAttempts: 1, completionDeadline: "2099-01-02T00:00:00.000Z", recoveryEvidenceRequirementId: evidence, routePolicy: "ALTERNATE_RESOURCE_REQUIRED", mandatory: true }], maximumConsequence: { consequenceEnvelopeRefHash: h(`${label}:ce`), consequenceClassCode: "BOUNDED_GENERIC_FAILURE", measureCode: "MAXIMUM_DELAY", maximumValue: 1, unitCode: "MINUTE", affectedChannelRefHashes: [h(`${label}:ch`)], irreversibleHarmAllowed: false, unboundedConsequenceAllowed: false }, zeroInternalOps: { outsiderStaffInterventionsAllowed: 0, internalManualSourcingAllowed: false, internalManualCoordinationAllowed: false, internalManualVerificationAllowed: false, internalManualRecoveryAllowed: false, humanQueueFallbackAllowed: false, failureDisposition: "DECLINE_NOT_HUMAN_QUEUE" } });
}

async function issue(label, nodeKind) {
  const record = tender(label); const req = record.resourceRequirements.items[0];
  const binding = { tenderHash: record.tenderHash, workOrderHash: record.workOrderHash,
    typedGraphHash: record.typedGraph.typedGraphHash, occurrenceId: id("discovery", label),
    nodeSlotId: id("node", label), nodeKind, requirementKind: "RESOURCE",
    requirementId: req.resourceRequirementId,
    requirementSetHash: record.resourceRequirements.requirementSetHash,
    requirementObjectHash: dg("outsider/outcome-formation-exact-tender-requirement/v1", { tenderHash: record.tenderHash, requirementKind: "RESOURCE", requirementSetHash: record.resourceRequirements.requirementSetHash, requirement: req }),
    expiresAt: "2099-01-01T00:09:00.000Z", privateBindingNonce: h(`${label}:nonce`) };
  const issuer = createOrderScopedSellerOriginIssuerV1(binding);
  const capability = createOrderScopedDiscoveryNodeCapabilityV1({ nodeKind,
    async invoke(invocation) { return sealSellerOriginFromDiscoveryInvocationV1(
      issuer, invocation, { sellerOrigin: `https://${label}.example/catalog`,
        externalInfrastructureNetworkIoAttempted: false }); } });
  const jobBinding = { occurrenceId: binding.occurrenceId,
    nodeSlotId: binding.nodeSlotId, nodeKind: binding.nodeKind,
    requirementKind: binding.requirementKind,
    requirementId: binding.requirementId,
    requirementSetHash: binding.requirementSetHash,
    requirementObjectHash: binding.requirementObjectHash,
    expiresAt: binding.expiresAt };
  const result = await runOrderScopedDiscoveryFederationV1({ tender: record,
    asOf: "2099-01-01T00:01:00.000Z", publicPlan: { schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan, federationId: id("federation", label), tenderHash: record.tenderHash, workOrderHash: record.workOrderHash, typedGraphHash: record.typedGraph.typedGraphHash, concurrencyLimit: 1, jobs: [{ ...jobBinding, maximumRuntimeMs: 1000 }] }, privateJobs: [{ occurrenceId: binding.occurrenceId, nodeInput: {}, privateBindingNonce: binding.privateBindingNonce }], privateProjectionNonce: h(`${label}:projection`) }, { capabilityBindings: [{ nodeSlotId: binding.nodeSlotId, capability }] });
  const lease = claimOrderScopedDiscoveryNodeResultV1(result, binding.occurrenceId);
  const expected = { ...binding }; delete expected.privateBindingNonce;
  return { lease, expected, binding };
}

test("two unrelated node kinds issue the same generic opaque contract", async () => {
  for (const kind of ["directory.edge.v1", "device.local.v1"]) {
    const { lease, expected } = await issue(kind.replaceAll(".", "-"), kind);
    assert.equal(Object.hasOwn(lease, "origin"), false);
    const claimed = claimOrderScopedSellerOriginV1(lease, expected);
    assert.match(claimed.origin, /^https:/u);
    assert.equal(claimed.authorityEstablished, false);
    assert.throws(() => claimOrderScopedSellerOriginV1(lease, expected), /REPLAYED/u);
  }
});

test("fabrication and cross-order binding fail closed", async () => {
  assert.throws(() => claimOrderScopedSellerOriginV1({}, {}), /LEASE_INVALID/u);
  const { lease, expected } = await issue("cross-order", "portal.public.v1");
  assert.throws(() => claimOrderScopedSellerOriginV1(lease,
    { ...expected, tenderHash: h("other") }), /CROSS_ORDER/u);
});
