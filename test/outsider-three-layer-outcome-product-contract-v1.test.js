import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import {
  OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY,
  OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS,
  OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_MANIFEST,
  classifyOutcomeCommitReadinessV1,
  importOutcomeProgramToOutcomeOsV1,
  prepareFormationRecoveryOptionsV1,
  prepareOutcomeOsV1,
  verifyThreeLayerOutcomeProductArtifactV1,
} from "../src/outsider-three-layer-outcome-product-contract-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function graph() {
  return {
    principalEpochRefHash: h("principal-epoch"),
    accountableDeploymentRefHash: h("accountable-deployment"),
    runtimeRefHash: h("runtime"),
    embodimentRefHash: null,
    delegationRefHash: h("delegation"),
    episodeRefHash: h("episode"),
    attemptRefHash: h("attempt"),
  };
}

function outcomeOs(overrides = {}) {
  return prepareOutcomeOsV1({
    requestIdHash: h("request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("outcome-definition"),
    acceptancePredicateHash: h("acceptance-predicate"),
    formationDeadline: "2026-09-04T12:30:00.000Z",
    completionDeadline: "2026-09-04T13:00:00.000Z",
    maximumLossConstraintHash: h("maximum-loss"),
    typedGraphRefs: graph(),
    ...overrides,
  });
}

function option(role, label, overrides = {}) {
  return {
    optionRefHash: h(`option:${label}`),
    role,
    providerRefHash: h(`provider:${label}`),
    controllerRefHash: h(`controller:${label}`),
    failureDomainRefHash: h(`failure-domain:${label}`),
    capabilityRefHash: h(`capability:${label}`),
    reservationRefHash: null,
    reservationLifecycleHeadRefHash: null,
    serviceWindowRefHash: h(`service-window:${label}`),
    validFrom: "2026-09-04T12:00:00.000Z",
    validUntil: "2026-09-04T13:30:00.000Z",
    ...overrides,
  };
}

function reservedOption(role, label, overrides = {}) {
  return option(role, label, {
    reservationRefHash: h(`reservation:${label}`),
    reservationLifecycleHeadRefHash: h(`reservation-head:${label}`),
    ...overrides,
  });
}

function formation(routeOptions, overrides = {}) {
  return prepareFormationRecoveryOptionsV1({
    outcomeOs: outcomeOs(),
    observedAt: "2026-09-04T12:10:00.000Z",
    recoveryTriggerPolicyRefHash: h("recovery-trigger-policy"),
    routeOptions,
    ...overrides,
  });
}

function emptyCommitReferences() {
  return {
    outcomeProgramVerificationRefHash: null,
    authorityAdmissionRefHash: null,
    primaryCapacityAdmissionRefHash: null,
    recoveryCapacityAdmissionRefHash: null,
    independentWitnessAdmissionRefHash: null,
    obligationAcceptanceRefHash: null,
    rightsPrivacyDecisionRefHash: null,
    maximumLossCapitalReservationRefHash: null,
    custodyPaymentAuthorityRefHash: null,
    adjudicationAuthorityRefHash: null,
    externalTrustPolicyRefHash: null,
    executionAdmissionRefHash: null,
  };
}

function fullCommitReferences() {
  return Object.fromEntries(Object.keys(emptyCommitReferences())
    .map((field) => [field, h(`commit:${field}`)]));
}

test("manifest freezes the three products and keeps positive COMMIT external",
  () => {
    assert.deepEqual(OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_MANIFEST
      .layers, {
      outcomeOs: "OUTCOME_OS",
      formationRecoveryOptions: "FORMATION_RECOVERY_OPTIONS",
      outcomeCommit: "OUTCOME_COMMIT",
    });
    assert.equal(OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_MANIFEST
      .positiveCommitEmitted, false);
    assert.equal(OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY
      .structuralConformanceMintsAuthority, false);
  });

test("Layer 1 is route-free, deterministic, PII-free, and not a guarantee",
  () => {
    const left = outcomeOs();
    const right = outcomeOs();
    assert.deepEqual(left, right);
    assert.equal(left.productLayer,
      OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs);
    assert.equal(left.executionRoutesRequired, false);
    assert.equal(left.recoveryRoutesRequired, false);
    assert.equal(left.witnessRoutesRequired, false);
    assert.equal(left.guaranteeCreated, false);
    assert.equal(left.outcomePromiseIssued, false);
    assert.equal(left.authority, "NONE");
    assert.equal(Object.isFrozen(left.typedGraphRefs), true);
    const replayed = verifyThreeLayerOutcomeProductArtifactV1(
      JSON.parse(JSON.stringify(left)));
    assert.equal(replayed.artifactHash, left.artifactHash);
    assert.equal(Object.isFrozen(replayed), true);
    assert.equal(Object.isFrozen(replayed.typedGraphRefs), true);
    assert.equal(JSON.stringify(left).includes("goal"), false);
  });

test("Layer 1 rejects natural-language or other undeclared public fields", () => {
  assert.throws(() => prepareOutcomeOsV1({
    requestIdHash: h("request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("outcome"),
    acceptancePredicateHash: h("acceptance"),
    formationDeadline: "2026-09-04T12:30:00.000Z",
    completionDeadline: "2026-09-04T13:00:00.000Z",
    maximumLossConstraintHash: h("loss"),
    typedGraphRefs: graph(),
    goal: "this field must never enter the public contract",
  }), /OUTCOME_OS_INPUT_FIELDS_INVALID/);
});

test("existing OutcomeProgram imports through replay without projecting text",
  () => {
    const privateStatement = "Private goal for person@example.test at 1 Main St";
    const program = createFirstCommittedDigitalRealityProgramV1({
      programId: "program_import_001",
      orderId: "order_import_001",
      createdAt: "2026-09-04T12:00:00.000Z",
      formationDeadline: "2026-09-04T12:30:00.000Z",
      completionDeadline: "2026-09-04T13:00:00.000Z",
      cleanupDeadline: "2026-09-04T14:00:00.000Z",
      artifactHash: h("artifact"),
      statement: privateStatement,
    });
    const artifact = importOutcomeProgramToOutcomeOsV1({
      requestIdHash: h("import-request"),
      outcomeProgram: program,
      maximumLossConstraintHash: h("loss"),
      typedGraphRefs: graph(),
    });
    assert.equal(artifact.sourceProgramReplayPerformed, true);
    assert.equal(artifact.sourceVerification,
      "OUTCOME_PROGRAM_V1_SOURCE_REPLAYED");
    assert.equal(artifact.outcomeProgramHash, program.programHash);
    assert.equal(JSON.stringify(artifact).includes(privateStatement), false);
    assert.equal(JSON.stringify(artifact).includes("person@example.test"),
      false);
  });

test("Layer 2 accepts a partial portfolio and reports missing role coverage",
  () => {
    const artifact = formation([option("PRIMARY", "primary")]);
    assert.equal(artifact.optionCount, 1);
    assert.deepEqual(artifact.roleCoverage, {
      PRIMARY: 1,
      RECOVERY: 0,
      INDEPENDENT_WITNESS: 0,
    });
    assert.equal(artifact.declaredRecoveryOptionReferenceCurrent, false);
    assert.equal(artifact.recoveryOptionHeld, false);
    assert.equal(artifact.layerTwoPromotionPermitted, false);
    assert.equal(artifact.attainedServiceProfile, "OUTCOME_OS");
    assert.equal(artifact.partialPortfolioPermitted, true);
    assert.equal(artifact.guaranteeCreated, false);
    assert.equal(artifact.outcomePromiseIssued, false);
    assert.equal(verifyThreeLayerOutcomeProductArtifactV1(
      JSON.parse(JSON.stringify(artifact))).artifactHash, artifact.artifactHash);
  });

test("Layer 2 deterministically recognizes a current recovery option reference",
  () => {
    const primary = option("PRIMARY", "primary");
    const recovery = option("RECOVERY", "recovery");
    const left = formation([primary, recovery]);
    const right = formation([recovery, primary]);
    assert.deepEqual(left, right);
    assert.equal(left.declaredRecoveryOptionReferenceCurrent, true);
    assert.equal(left.declaredRecoveryOptionReferenceBasis,
      "CALLER_DECLARED_CURRENT_RECOVERY_REFERENCE_COVERS_OUTCOME_DEADLINE");
    assert.equal(left.recoveryOptionHeld, false);
    assert.equal(left.layerTwoPromotionPermitted, false);
    assert.equal(left.allReservationReferencePairsPresent, false);
    assert.equal(left.authority, "NONE");
  });

test("an expired recovery reference remains recorded but is not ready", () => {
  const artifact = formation([option("RECOVERY", "expired", {
    validFrom: "2026-09-04T11:00:00.000Z",
    validUntil: "2026-09-04T12:05:00.000Z",
  })]);
  assert.equal(artifact.roleCoverage.RECOVERY, 1);
  assert.equal(artifact.currentRoleCoverage.RECOVERY, 0);
  assert.equal(artifact.declaredRecoveryOptionReferenceCurrent, false);
});

test("Layer 3 reports exact missing slots and never launders them into COMMIT",
  () => {
    const primary = option("PRIMARY", "primary");
    const options = formation([primary]);
    const result = classifyOutcomeCommitReadinessV1({
      formationRecoveryOptions: options,
      observedAt: "2026-09-04T12:20:00.000Z",
      selectedOptions: {
        primaryOptionRefHash: primary.optionRefHash,
        recoveryOptionRefHash: null,
        independentWitnessOptionRefHash: null,
      },
      commitReferences: emptyCommitReferences(),
    });
    assert.equal(result.referenceSlotsComplete, false);
    assert.ok(result.prerequisiteGapCodes.includes(
      "RECOVERY_OPTION_SELECTION_MISSING"));
    assert.ok(result.prerequisiteGapCodes.includes(
      "INDEPENDENT_WITNESS_OPTION_SELECTION_MISSING"));
    assert.equal(result.highestAvailableLayer,
      OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs);
    assert.equal(result.layerThreePromotionPermitted, false);
    assert.equal(result.outcomeCommitIssued, false);
    assert.equal(result.outcomePromiseIssued, false);
    assert.equal(result.authority, "NONE");
  });

test("even complete hash slots remain HOLD pending external source replay",
  () => {
    const primary = reservedOption("PRIMARY", "primary");
    const recovery = reservedOption("RECOVERY", "recovery");
    const witness = reservedOption("INDEPENDENT_WITNESS", "witness");
    const result = classifyOutcomeCommitReadinessV1({
      formationRecoveryOptions: formation([primary, recovery, witness], {
        outcomeOs: outcomeOs({ outcomeProgramHash: h("outcome-program") }),
      }),
      observedAt: "2026-09-04T12:20:00.000Z",
      selectedOptions: {
        primaryOptionRefHash: primary.optionRefHash,
        recoveryOptionRefHash: recovery.optionRefHash,
        independentWitnessOptionRefHash: witness.optionRefHash,
      },
      commitReferences: fullCommitReferences(),
    });
    assert.equal(result.referenceSlotsComplete, true);
    assert.deepEqual(result.prerequisiteGapCodes, []);
    assert.equal(result.readinessState,
      "REFERENCE_SLOTS_COMPLETE_EXTERNAL_SOURCE_REPLAY_REQUIRED_HOLD");
    assert.ok(result.externalVerificationGapCodes.length >= 6);
    assert.equal(result.layerThreePromotionPermitted, false);
    assert.equal(result.outcomeCommitIssued, false);
    assert.equal(result.callerHashesAcceptedAsAuthority, false);
    assert.equal(result.structuralConformanceMintsAuthority, false);
    assert.equal(verifyThreeLayerOutcomeProductArtifactV1(
      JSON.parse(JSON.stringify(result))).artifactHash, result.artifactHash);
  });

test("same failure domain blocks Layer-3 structural completeness", () => {
  const primary = reservedOption("PRIMARY", "primary");
  const recovery = reservedOption("RECOVERY", "recovery", {
    failureDomainRefHash: primary.failureDomainRefHash,
  });
  const witness = reservedOption("INDEPENDENT_WITNESS", "witness");
  const result = classifyOutcomeCommitReadinessV1({
    formationRecoveryOptions: formation([primary, recovery, witness], {
      outcomeOs: outcomeOs({ outcomeProgramHash: h("outcome-program") }),
    }),
    observedAt: "2026-09-04T12:20:00.000Z",
    selectedOptions: {
      primaryOptionRefHash: primary.optionRefHash,
      recoveryOptionRefHash: recovery.optionRefHash,
      independentWitnessOptionRefHash: witness.optionRefHash,
    },
    commitReferences: fullCommitReferences(),
  });
  assert.equal(result.referenceSlotsComplete, false);
  assert.ok(result.prerequisiteGapCodes.includes(
    "PRIMARY_RECOVERY_FAILURE_DOMAIN_SEPARATION_UNESTABLISHED"));
});

test("artifact tampering is detected after JSON transport", () => {
  const artifact = JSON.parse(JSON.stringify(outcomeOs()));
  artifact.outcomeDefinitionHash = h("tampered");
  assert.throws(() => verifyThreeLayerOutcomeProductArtifactV1(artifact),
    /OUTCOME_OS_HASH_MISMATCH/);
});
