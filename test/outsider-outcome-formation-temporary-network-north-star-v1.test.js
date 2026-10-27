import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY }
  from "../src/outsider-outcome-formation-engine-v1.js";
import {
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_BOUNDARY,
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS,
  createOutcomeFormationTemporaryNetworkNorthStarSourceV1,
  createOutcomeFormationTemporaryNetworkNorthStarV1,
  verifyOutcomeFormationTemporaryNetworkNorthStarV1,
} from "../src/outsider-outcome-formation-temporary-network-north-star-v1.js";
import { OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY }
  from "../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY,
  acceptStandingCapacityGrantV1,
  createOwnerOneUseMandateV1,
  createProviderOneUseAcceptanceV1,
  createStandingCapacityGrantInvitationV1,
  revokeStandingCapacityGrantV1,
  verifyStandingCapacityGrantV1,
} from "../src/outsider-one-use-commitments-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(`temporary-network-north-star:${label}`, "utf8").digest("hex")}`;
const mutable = (value) => JSON.parse(JSON.stringify(value));

function verify(record, source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1(),
  expectedHash = record.northStarInvariantHash) {
  return verifyOutcomeFormationTemporaryNetworkNorthStarV1(record, {
    source,
    expectedNorthStarInvariantHash: expectedHash,
  });
}

function leafPaths(value, prefix = []) {
  const result = [];
  for (const key of Object.keys(value)) {
    const child = value[key];
    const childPath = [...prefix, key];
    if (child !== null && typeof child === "object"
      && !Array.isArray(child)) {
      result.push(...leafPaths(child, childPath));
    } else {
      result.push(childPath);
    }
  }
  return result;
}

function setAt(value, path, replacement) {
  let cursor = value;
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor[path[index]];
  }
  cursor[path[path.length - 1]] = replacement;
}

function mutateLeaf(value) {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value + 1;
  if (typeof value === "string") return `${value}_MUTATED`;
  return "MUTATED";
}

function reseal(record) {
  const body = mutable(record);
  delete body.northStarInvariantHash;
  const hash = createHash("sha256");
  hash.update(`${
    OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS.contract
  }\0${canonicalizeStrict(body)}`, "utf8");
  return {
    ...body,
    northStarInvariantHash: `sha256:${hash.digest("hex")}`,
  };
}

test("seals one immutable canonical North Star and verifies exact source replay",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    const record = createOutcomeFormationTemporaryNetworkNorthStarV1(source);
    const checked = verify(record);

    assert.equal(source.schema,
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS.source);
    assert.equal(record.schema,
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS
        .contract);
    assert.match(record.northStarInvariantHash, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(record.northStarInvariantHash,
      "sha256:514bb4cdef9381838a93afa43ceee160c0221491da9c58ca7cfb37de19e9f8fe");
    assert.equal(checked.ok, true);
    assert.equal(checked.exactSourceVerified, true);
    assert.equal(checked.sourceRebuilt, true);
    assert.equal(checked.derivationVerified, true);
    assert.equal(checked.selfHashVerified, true);
    assert.equal(checked.expectedHashMatched, true);
    assert.equal(checked.permanentInvariantContractVerified, true);
    assert.equal(checked.domainAgnosticCoreContractVerified, true);
    assert.equal(checked.integrationBehaviorVerified, false);
    assert.equal(checked.decisionState, "HOLD");
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
    assert.equal(checked.executable, false);
    assert.equal(checked.cEnabledSubsetAProven, true);
    assert.equal(checked.consequenceReach, "NONE");
    assert.ok(Object.isFrozen(source));
    assert.ok(Object.isFrozen(source.topology));
    assert.ok(Object.isFrozen(record));
    assert.ok(Object.isFrozen(record.zeroInternalOps));
    assert.ok(Object.isFrozen(checked));
    assert.equal(canonicalizeStrict(
      createOutcomeFormationTemporaryNetworkNorthStarV1(mutable(source))),
    canonicalizeStrict(record));
    assert.throws(() => { record.networkClass = "MUTATED"; }, TypeError);
  });

test("ephemeral formation never erases durable responsibility and promise formation is atomic",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    const record = createOutcomeFormationTemporaryNetworkNorthStarV1(source);

    assert.equal(record.topology.networkPersistsAfterOrderClosure, false);
    assert.equal(record.topology.networkDissolutionErasesEpisodeAttemptHistory,
      false);
    assert.equal(record.topology.networkDissolutionErasesOpenObligations, false);
    assert.equal(record.topology
      .evidenceChallengeRecoveryAndResponsibilityPersistUntilValidClosure, true);
    assert.equal(record.supplyOwnership
      .providerRegistrationRequiredForOneUseTender, false);
    assert.equal(record.zeroInternalOps.anyOutsiderStaffTouchIsFormationFailure,
      true);
    assert.equal(record.zeroInternalOps.staffTouchFailureMustBeRecordedAgainstTender,
      true);
    assert.equal(record.commitmentGate.userOutcomePromiseFormationMode,
      "ATOMIC_ALL_REQUIRED_GATES");
    assert.equal(record.commitmentGate.partialPromiseOnIncompleteFormationAllowed,
      false);
    assert.equal(record.commitmentGate.manualOverrideAllowed, false);
    assert.equal(record.commitmentGate.atFormationDeadlineDisposition,
      "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(record.consentLifecycle
      .postFulfillmentStandingInvitationMayBeAutomated, true);
    assert.equal(record.consentLifecycle.invitationAloneCreatesStandingCapacity,
      false);
    assert.equal(record.consentLifecycle.standingGrantValidityWindowRequired,
      true);
    assert.equal(record.consentLifecycle
      .standingGrantScopeRegionTimeCapacityResponsibilityBound, true);
    assert.equal(record.consentLifecycle.standingGrantCommercialTermsBound,
      true);
  });

test("every source leaf is an exact invariant, not caller-selectable policy",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    const paths = leafPaths(source);
    assert.ok(paths.length >= 50);
    for (const path of paths) {
      const candidate = mutable(source);
      let original = candidate;
      for (const part of path) original = original[part];
      setAt(candidate, path, mutateLeaf(original));
      assert.throws(
        () => createOutcomeFormationTemporaryNetworkNorthStarV1(candidate),
        /SOURCE_INVARIANT_MISMATCH/u,
        path.join("."),
      );
    }
  });

test("owned inventory, persistent order networks, staff fallback, and core domain branching fail",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    const mutations = [
      ["supplyOwnership", "outsiderOwnedProviderInventoryAllowed", true],
      ["supplyOwnership", "outsiderExclusiveProviderPoolRequired", true],
      ["supplyOwnership", "externalResourceOwnerRetainsControl", false],
      ["topology", "crossTenderReuseAllowed", true],
      ["topology", "networkPersistsAfterOrderClosure", true],
      ["topology", "networkDissolutionErasesEpisodeAttemptHistory", true],
      ["topology", "networkDissolutionErasesOpenObligations", true],
      ["topology",
        "evidenceChallengeRecoveryAndResponsibilityPersistUntilValidClosure",
        false],
      ["supplyOwnership", "providerRegistrationRequiredForOneUseTender", true],
      ["consentLifecycle", "autoEnrollmentAllowed", true],
      ["consentLifecycle", "completionCreatesStandingCapacity", true],
      ["consentLifecycle", "postFulfillmentStandingInvitationMayBeAutomated",
        false],
      ["consentLifecycle", "invitationAloneCreatesStandingCapacity", true],
      ["consentLifecycle", "separateStandingOptInRequired", false],
      ["consentLifecycle", "standingGrantValidityWindowRequired", false],
      ["consentLifecycle",
        "standingGrantScopeRegionTimeCapacityResponsibilityBound", false],
      ["consentLifecycle", "standingGrantCommercialTermsBound", false],
      ["zeroInternalOps", "outsiderStaffTouchesAllowed", 1],
      ["zeroInternalOps", "manualDiscoveryAllowed", true],
      ["zeroInternalOps", "manualContactAllowed", true],
      ["zeroInternalOps", "manualCoordinationAllowed", true],
      ["zeroInternalOps", "manualVerificationAllowed", true],
      ["zeroInternalOps", "manualRecoveryAllowed", true],
      ["zeroInternalOps", "humanQueueFallbackAllowed", true],
      ["zeroInternalOps", "anyOutsiderStaffTouchIsFormationFailure", false],
      ["zeroInternalOps", "staffTouchFailureMustBeRecordedAgainstTender", false],
      ["zeroInternalOps", "unsupportedOrUnformedDisposition", "HUMAN_QUEUE"],
      ["commitmentGate", "userOutcomePromiseFormationMode", "PARTIAL"],
      ["commitmentGate", "explicitResourceOwnerAuthorityRequired", false],
      ["commitmentGate", "everyMandatoryPrimaryResourceCapacityRequired", false],
      ["commitmentGate", "everyMandatoryRecoveryResourceCapacityRequired", false],
      ["commitmentGate",
        "everyMandatoryIndependentEvidenceResourceCapacityRequired", false],
      ["commitmentGate", "maximumConsequenceAndLiabilityEnvelopeRequired",
        false],
      ["commitmentGate", "promisedFinancialRemedyRequiresProvenFundingCapacity",
        false],
      ["commitmentGate", "lawfulTransactionPathRequired", false],
      ["commitmentGate", "externalRouteZeroInternalOpsRequired", false],
      ["commitmentGate", "partialPromiseOnIncompleteFormationAllowed", true],
      ["commitmentGate", "manualOverrideAllowed", true],
      ["commitmentGate", "beforeFormationDeadlineDisposition", "HUMAN_QUEUE"],
      ["commitmentGate", "atFormationDeadlineDisposition", "HUMAN_QUEUE"],
      ["domainBoundary", "domainSpecificCoreFormationBranchingAllowed", true],
      ["domainBoundary", "domainSpecificHumanWorkflowAllowed", true],
    ];
    for (const mutation of mutations) {
      const candidate = mutable(source);
      setAt(candidate, mutation.slice(0, -1), mutation.at(-1));
      assert.throws(
        () => createOutcomeFormationTemporaryNetworkNorthStarV1(candidate),
        /SOURCE_INVARIANT_MISMATCH/u,
        mutation.slice(0, -1).join("."),
      );
    }
  });

test("open shapes, accessors, proxies, sparse values, shared nodes, and cycles fail closed",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1({
      ...mutable(source),
      providerInventory: [],
    }), /SOURCE_INVARIANT_MISMATCH/u);
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1({
      ...mutable(source),
      fallbackAssignee: h("staff"),
    }), /SOURCE_INVARIANT_MISMATCH/u);
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1({
      ...mutable(source),
      domainWorkflow: "NETWORK_INSTALLATION",
    }), /SOURCE_INVARIANT_MISMATCH/u);

    const missing = mutable(source);
    delete missing.zeroInternalOps.manualRecoveryAllowed;
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1(
      missing), /SOURCE_INVARIANT_MISMATCH/u);

    const nestedExtra = mutable(source);
    nestedExtra.supplyOwnership.providerIds = [];
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1(
      nestedExtra), /SOURCE_INVARIANT_MISMATCH/u);

    const accessor = mutable(source);
    Object.defineProperty(accessor, "networkClass", {
      enumerable: true,
      get() { return "PER_ORDER_EPHEMERAL_EXTERNAL_RESOURCE_NETWORK"; },
    });
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1(
      accessor), /ACCESSOR_FORBIDDEN/u);
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1(
      new Proxy(mutable(source), {})), /PROXY_FORBIDDEN/u);

    const sparse = mutable(source);
    sparse.domainBoundary = new Array(2);
    sparse.domainBoundary[1] = "DOMAIN_AGNOSTIC_TYPED_CONTRACT_CORE";
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1(
      sparse));

    const shared = mutable(source);
    shared.supplyOwnership = shared.topology;
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1(
      shared), /SHARED_OR_CYCLIC_OBJECT_FORBIDDEN/u);

    const cyclic = mutable(source);
    cyclic.self = cyclic;
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1(
      cyclic), /SHARED_OR_CYCLIC_OBJECT_FORBIDDEN/u);

    const wrongPrototype = mutable(source);
    Object.setPrototypeOf(wrongPrototype, { poisoned: true });
    assert.throws(() => createOutcomeFormationTemporaryNetworkNorthStarV1(
      wrongPrototype));
  });

test("naked hashes and rehashed output poisoning cannot replace full source replay",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    const record = createOutcomeFormationTemporaryNetworkNorthStarV1(source);

    for (const options of [
      { expectedNorthStarInvariantHash: record.northStarInvariantHash },
      { source },
      record.northStarInvariantHash,
      null,
    ]) {
      const checked = verifyOutcomeFormationTemporaryNetworkNorthStarV1(
        record, options);
      assert.equal(checked.ok, false);
      assert.equal(checked.sourceRebuilt, false);
      assert.equal(checked.decisionState, "HOLD");
      assert.equal(checked.authority, "NONE");
      assert.equal(checked.actionReady, false);
      assert.equal(checked.executable, false);
    }

    const poisoned = mutable(record);
    poisoned.authorityBoundary.structuralConformanceEnablesAction = true;
    const forged = reseal(poisoned);
    const checked = verifyOutcomeFormationTemporaryNetworkNorthStarV1(
      forged, {
        source,
        expectedNorthStarInvariantHash: forged.northStarInvariantHash,
      });
    assert.equal(checked.ok, false);
    assert.equal(checked.structuralConformanceEnablesAction, false);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
  });

test("one-use is default and standing participation stays separate, explicit, and revocable",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    assert.equal(source.consentLifecycle.defaultEngagement,
      "EXPLICIT_ONE_USE");
    assert.equal(source.consentLifecycle.silenceAcceptedAsConsent, false);
    assert.equal(source.consentLifecycle.completionCreatesStandingCapacity,
      false);
    assert.equal(source.consentLifecycle.autoEnrollmentAllowed, false);
    assert.equal(source.consentLifecycle.separateStandingOptInRequired, true);
    assert.equal(source.consentLifecycle.standingGrantRevocable, true);

    const commercialTerm = {
      quoteRefHash: h("quote"),
      currency: "USD",
      amountMinor: "12500",
    };
    const owner = createOwnerOneUseMandateV1({
      tenderHash: h("tender"),
      scopeHash: h("scope"),
      ownerPrincipalRefHash: h("owner"),
      delegationEnvelopeHash: h("delegation"),
      evidencePlanHash: h("evidence"),
      remedyPlanHash: h("remedy"),
      commercialTerm,
      issuedAt: "2026-09-02T12:00:00.000Z",
      expiresAt: "2026-09-02T13:00:00.000Z",
      oneUseNonceHash: h("owner-nonce"),
      response: "ACCEPT",
      signatureRefHash: h("owner-signature"),
    });
    const provider = createProviderOneUseAcceptanceV1({
      tenderHash: h("tender"),
      scopeHash: h("scope"),
      providerRefHash: h("provider"),
      evidencePlanHash: h("evidence"),
      remedyPlanHash: h("remedy"),
      commercialTerm,
      acceptedAt: "2026-09-02T12:01:00.000Z",
      expiresAt: "2026-09-02T13:00:00.000Z",
      oneUseNonceHash: h("provider-nonce"),
      response: "ACCEPT",
      signatureRefHash: h("provider-signature"),
    });
    assert.equal(owner.oneUseOnly, true);
    assert.equal(owner.autoEnrollStandingCapacity, false);
    assert.equal(provider.oneUseOnly, true);
    assert.equal(provider.createsStandingCapacity, false);
    assert.equal(provider.autoEnrollStandingCapacity, false);

    const invitation = createStandingCapacityGrantInvitationV1({
      sourceTenderHash: h("tender"),
      sourceProviderAcceptanceHash: provider.providerAcceptanceHash,
      inviterRefHash: h("inviter"),
      providerRefHash: h("provider"),
      scopeHash: h("standing-scope"),
      capacityTermsHash: h("capacity-terms"),
      safetyEnvelopeHash: h("safety-envelope"),
      evidencePlanHash: h("standing-evidence"),
      remedyPlanHash: h("standing-remedy"),
      validFrom: "2026-09-02T13:00:00.000Z",
      validUntil: "2026-10-02T13:00:00.000Z",
      issuedAt: "2026-09-02T12:05:00.000Z",
      expiresAt: "2026-09-02T12:30:00.000Z",
      invitationNonceHash: h("invitation-nonce"),
    });
    const invitedOnly = verifyStandingCapacityGrantV1({
      expectedScopeHash: invitation.scopeHash,
      invitation,
      capacityGrant: null,
      revocation: null,
      observedAt: "2026-09-02T12:10:00.000Z",
    });
    assert.equal(invitedOnly.separateExplicitOptInVerified, false);
    assert.equal(invitedOnly.standingCapacityEstablished, false);

    const grant = acceptStandingCapacityGrantV1({
      invitation,
      acceptedAt: "2026-09-02T12:10:00.000Z",
      grantNonceHash: h("grant-nonce"),
      response: "ACCEPT",
      signatureRefHash: h("grant-signature"),
    });
    assert.equal(grant.explicitSeparateOptInObserved, true);
    assert.equal(grant.completionAutoEnrollmentUsed, false);
    assert.equal(grant.standingCapacityEstablished, false);

    const revocation = revokeStandingCapacityGrantV1({
      capacityGrant: grant,
      invitation,
      revokedAt: "2026-09-03T12:00:00.000Z",
      reasonCode: "PROVIDER_REQUEST",
      revocationNonceHash: h("revocation-nonce"),
      response: "REVOKE",
      signatureRefHash: h("revocation-signature"),
    });
    const revoked = verifyStandingCapacityGrantV1({
      expectedScopeHash: invitation.scopeHash,
      invitation,
      capacityGrant: grant,
      revocation,
      observedAt: "2026-09-03T12:01:00.000Z",
    });
    assert.equal(revoked.separateExplicitOptInVerified, true);
    assert.equal(revoked.standingCapacityState, "REVOKED");
    assert.equal(revoked.standingCapacityActive, false);
    assert.equal(revoked.authorityEstablished, false);
  });

test("one domain-agnostic core covers three unrelated controlled-code families",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    const outcomeCode = new RegExp(
      source.domainBoundary.controlledOutcomeKindCodePattern, "u");
    const resourceCode = new RegExp(
      source.domainBoundary.controlledResourceClassCodePattern, "u");
    const families = [{
      outcomeKindCode: "NETWORK_CONNECTIVITY_RESTORED",
      resourceClassCodes: ["LOCAL_NETWORK_TECHNICIAN", "NETWORK_DIAGNOSTIC_PROBE"],
    }, {
      outcomeKindCode: "PHYSICAL_PARCEL_DELIVERED",
      resourceClassCodes: ["LAST_MILE_COURIER", "SECURE_PARCEL_LOCKER"],
    }, {
      outcomeKindCode: "INDUSTRIAL_COMPONENT_INSPECTED",
      resourceClassCodes: ["MACHINE_VISION_CELL", "INDEPENDENT_QUALITY_WITNESS"],
    }];
    const hashes = new Set();
    for (const family of families) {
      assert.match(family.outcomeKindCode, outcomeCode);
      for (const code of family.resourceClassCodes) assert.match(code, resourceCode);
      const record = createOutcomeFormationTemporaryNetworkNorthStarV1(
        mutable(source));
      const checked = verify(record, mutable(source));
      assert.equal(checked.ok, true);
      assert.equal(checked.domainAgnosticCoreContractVerified, true);
      hashes.add(record.northStarInvariantHash);
    }
    assert.equal(hashes.size, 1);
    assert.equal(source.domainBoundary.fixedDomainCatalogRequired, false);
    assert.equal(source.domainBoundary.domainSpecificAdapterAllowed, true);
    assert.equal(source.domainBoundary
      .domainSpecificSemanticsConfinedToTypedContractsAndAdapters, true);
    assert.equal(source.domainBoundary
      .domainSpecificCoreFormationBranchingAllowed, false);
  });

test("North Star aligns with existing zero-ops and one-use boundaries",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    assert.equal(source.zeroInternalOps.outsiderStaffTouchesAllowed,
      OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
        .outsiderStaffInterventionsAllowed);
    assert.equal(source.zeroInternalOps.manualDiscoveryAllowed,
      OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY.providerDiscoveryPerformed);
    assert.equal(source.zeroInternalOps.manualContactAllowed,
      OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY.providerContactPerformed);
    assert.equal(source.zeroInternalOps.humanQueueFallbackAllowed,
      OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY.internalHumanFallbackPermitted);
    assert.equal(source.zeroInternalOps.unsupportedOrUnformedDisposition,
      OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY.unsupportedOrUnformedDisposition);
    assert.equal(source.consentLifecycle.autoEnrollmentAllowed,
      OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY.autoEnrollmentAllowed);
    assert.equal(source.consentLifecycle.separateStandingOptInRequired,
      OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY
        .separateStandingCapacityOptInRequired);
    assert.equal(source.consentLifecycle.standingGrantRevocable,
      OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY.standingCapacityRevocable);
  });

test("structural HOLD does not permanently forbid separately proven future action",
  () => {
    const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
    const record = createOutcomeFormationTemporaryNetworkNorthStarV1(source);
    const checked = verify(record);
    assert.equal(source.authorityBoundary.structuralConformanceEnablesAction,
      false);
    assert.equal(source.authorityBoundary
      .futureSeparatelyProvenAuthorityDecisionOutOfScope, true);
    assert.equal(source.authorityBoundary
      .futureSeparatelyAdmittedActionPermanentlyForbidden, false);
    assert.equal(Object.hasOwn(source.authorityBoundary, "actionReady"), false);
    assert.equal(checked.futureSeparatelyProvenAuthorityDecisionOutOfScope,
      true);
    assert.equal(checked.futureSeparatelyAdmittedActionPermanentlyForbidden,
      false);
    assert.equal(
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_BOUNDARY
        .futureSeparatelyAdmittedActionPathPrecluded,
      false);
    assert.equal(checked.decisionState, "HOLD");
    assert.equal(checked.actionReady, false);
  });
