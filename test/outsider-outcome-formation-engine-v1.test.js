import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY,
  OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_SCHEMAS,
  OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES,
  createOutcomeFormationEvaluationV1,
  evaluateOutcomeFormationV1,
  verifyOutcomeFormationEvaluationV1,
} from "../src/outsider-outcome-formation-engine-v1.js";
import {
  createExternalCapacityReservationReceiptBindingV1,
  createOwnerOneUseMandateV1,
  createProviderOneUseAcceptanceV1,
} from "../src/outsider-one-use-commitments-v1.js";
import { compileOutcomeTenderV1 } from "../src/outsider-outcome-tender-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function id(prefix, label) {
  return `${prefix}_${h(label).slice(7, 39)}`;
}

function mutable(value) {
  return JSON.parse(JSON.stringify(value));
}

function resealEvaluation(value) {
  const body = mutable(value);
  delete body.formationEvaluationHash;
  const state = createHash("sha256");
  state.update(`${OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_SCHEMAS.evaluation}\0${
    canonicalizeStrict(body)}`, "utf8");
  return {
    ...body,
    formationEvaluationHash: `sha256:${state.digest("hex")}`,
  };
}

function tenderInput() {
  const independentEvidenceId = id("evidence", "formation-independent");
  return {
    tenderId: id("tender", "formation-engine"),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: {
      revision: 0,
      predecessorTenderHash: null,
      supersedesTenderHash: null,
    },
    workOrderHash: h("autonomous-work-order"),
    typedGraph: {
      principalEpoch: {
        principalRefHash: h("principal"),
        epochRefHash: h("epoch"),
        principalEpochProjectionHash: h("principal-epoch-projection"),
      },
      accountableDeployment: {
        deploymentLineageRefHash: h("deployment-lineage"),
        deploymentRevisionHash: h("deployment-revision"),
        accountableDeploymentSubjectHash: h("accountable-deployment"),
      },
      runtime: {
        runtimeInstanceRefHash: h("runtime-ref"),
        runtimeInstanceHash: h("runtime"),
      },
      embodiment: {
        present: false,
        deviceLineageRefHash: null,
        embodimentRevisionHash: null,
      },
      delegation: {
        delegationEvidenceRefHash: h("delegation-evidence"),
        delegationEdgeHash: h("delegation-edge"),
      },
      episode: {
        episodeHash: h("episode"),
        networkCompleteEpisodeJoinHash: h("complete-episode"),
      },
      attempt: {
        attemptHash: h("attempt"),
        attemptActorSubjectHash: h("attempt-actor"),
      },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h("actor-identity-envelope"),
      delegationEvidenceRefHash: h("delegation-evidence"),
      delegationEdgeHash: h("delegation-edge"),
      authorityScopeRefHash: h("authority-scope"),
      resourceOwnerAuthorizationRefHash: h("resource-owner-authorization"),
      rightsPrivacyPolicyRefHash: h("rights-privacy-policy"),
    },
    exactOutcome: {
      outcomeKindCode: "NETWORK_CONNECTIVITY_RESTORED",
      outcomeSpecRefHash: h("outcome-spec"),
      subjectRefHash: h("private-subject"),
      acceptanceCriteriaRefHash: h("acceptance-criteria"),
      conditions: [{
        conditionId: id("condition", "connected"),
        metricCode: "CONNECTIVITY_STATE",
        comparator: "EQUAL",
        target: {
          valueKind: "STATE_CODE",
          booleanValue: null,
          integerValue: null,
          stateCode: "CONNECTED",
          unitCode: null,
        },
        observationWindowMs: 0,
        conditionRefHash: h("connected-condition"),
        mandatory: true,
      }],
      deadline: "2026-09-03T12:00:00.000Z",
    },
    formationDeadline: "2026-09-02T12:15:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: id("resource", "technician"),
      resourceClassCode: "LOCAL_NETWORK_TECHNICIAN",
      capabilityRefHash: h("technician-capability"),
      quantity: 1,
      unitCode: "PERSON_VISIT",
      regionRefHash: h("private-region"),
      requiredBy: "2026-09-03T08:00:00.000Z",
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: independentEvidenceId,
      evidenceClassCode: "INDEPENDENT_NETWORK_PROBE",
      evidenceRequirementRefHash: h("independent-probe-requirement"),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "LONGITUDINAL",
      dueBy: "2026-09-03T12:00:00.000Z",
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: id("recovery", "alternate-route"),
      triggerRefHash: h("recovery-trigger"),
      recoveryOutcomeRefHash: h("recovery-outcome"),
      resourceClassCode: "ALTERNATE_NETWORK_TECHNICIAN",
      maximumAttempts: 2,
      completionDeadline: "2026-09-03T12:00:00.000Z",
      recoveryEvidenceRequirementId: independentEvidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h("maximum-consequence"),
      consequenceClassCode: "BOUNDED_SERVICE_INTERRUPTION",
      measureCode: "MAXIMUM_INTERRUPTION_MINUTES",
      maximumValue: 240,
      unitCode: "MINUTE",
      affectedChannelRefHashes: [h("affected-channel")],
      irreversibleHarmAllowed: false,
      unboundedConsequenceAllowed: false,
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
  };
}

const COMMERCIAL_TERM = Object.freeze({
  quoteRefHash: h("caller-supplied-quote"),
  currency: "USD",
  amountMinor: "12500",
});

function oneUseRecords(tender, overrides = {}) {
  const scopeHash = overrides.scopeHash ?? tender.exactOutcome.exactOutcomeHash;
  const evidencePlanHash = overrides.evidencePlanHash
    ?? tender.evidenceRequirements.requirementSetHash;
  const remedyPlanHash = overrides.remedyPlanHash
    ?? tender.recoveryRequirements.requirementSetHash;
  const ownerMandate = createOwnerOneUseMandateV1({
    tenderHash: tender.tenderHash,
    scopeHash,
    ownerPrincipalRefHash: h("owner-principal"),
    delegationEnvelopeHash: h("owner-delegation"),
    evidencePlanHash,
    remedyPlanHash,
    commercialTerm: { ...COMMERCIAL_TERM },
    issuedAt: "2026-09-02T12:01:00.000Z",
    expiresAt: "2026-09-02T12:30:00.000Z",
    oneUseNonceHash: h("owner-one-use-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("owner-signature-ref"),
  });
  const providerAcceptance = createProviderOneUseAcceptanceV1({
    tenderHash: tender.tenderHash,
    scopeHash,
    providerRefHash: h("provider"),
    evidencePlanHash,
    remedyPlanHash,
    commercialTerm: { ...COMMERCIAL_TERM },
    acceptedAt: "2026-09-02T12:02:00.000Z",
    expiresAt: "2026-09-02T12:30:00.000Z",
    oneUseNonceHash: h("provider-one-use-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("provider-signature-ref"),
  });
  const capacityReservationReceipt
    = createExternalCapacityReservationReceiptBindingV1({
      tenderHash: tender.tenderHash,
      scopeHash,
      providerAcceptanceHash: providerAcceptance.providerAcceptanceHash,
      commercialTermHash:
        providerAcceptance.commercialTerm.commercialTermHash,
      externalSystemRefHash: h("external-capacity-system"),
      externalReservationRefHash: h("external-capacity-reservation"),
      externalReceiptArtifactHash: h("external-capacity-receipt-artifact"),
      issuedAt: "2026-09-02T12:03:00.000Z",
      reservedFrom: "2026-09-02T12:03:00.000Z",
      reservedUntil: "2026-09-03T13:00:00.000Z",
      status: "RESERVED",
      signatureRefHash: h("capacity-receipt-signature-ref"),
    });
  return { ownerMandate, providerAcceptance, capacityReservationReceipt };
}

function fullFoundation(tender) {
  return {
    autonomousWorkOrderHash: tender.workOrderHash,
    actionAdmissionHash: h("action-admission"),
    attemptSetCompositionHash: h("attempt-set-composition"),
    networkOutcomeWitnessHash: h("network-outcome-witness"),
    realityObligationHash: h("reality-obligation"),
    recoveryCapacityReservationHash: h("recovery-capacity-reservation"),
    rightsPrivacyDecisionHash: h("rights-privacy-decision"),
    riskCapitalReservationHash: h("risk-capital-reservation"),
    custodyAuthorityHash: h("custody-authority"),
    adjudicationAuthorityHash: h("adjudication-authority"),
    externalTrustPolicyHash: h("external-trust-policy"),
  };
}

function callerAssertions(value = false) {
  return {
    capacityReceiptAuthentic: value,
    externalTrustEstablished: value,
    authorityEstablished: value,
    riskCapitalEstablished: value,
    custodyEstablished: value,
    adjudicationEstablished: value,
    independentWitnessEstablished: value,
    rightsPrivacyCleared: value,
    actionReady: value,
    priceAuthorityEstablished: value,
    guaranteeAuthorityEstablished: value,
    settlementAuthorityEstablished: value,
  };
}

function scenario(overrides = {}) {
  const tender = overrides.tender ?? compileOutcomeTenderV1(tenderInput());
  const records = overrides.records ?? oneUseRecords(tender,
    overrides.oneUseOverrides);
  return {
    formationId: id("formation", "engine-evaluation"),
    evaluatedAt: "2026-09-02T12:05:00.000Z",
    expectedTenderHash: tender.tenderHash,
    tender,
    ownerMandate: records.ownerMandate,
    providerAcceptance: records.providerAcceptance,
    capacityReservationReceipt: records.capacityReservationReceipt,
    consumedNonceHashes: [],
    foundationBindings: fullFoundation(tender),
    untrustedCallerAssertions: callerAssertions(false),
    ...overrides.input,
  };
}

function assertAlwaysHeld(evaluation) {
  assert.equal(evaluation.decisionState, "HOLD");
  assert.equal(evaluation.authority, "NONE");
  assert.equal(evaluation.actionReady, false);
  assert.equal(evaluation.executable, false);
  assert.equal(evaluation.consequenceReach, "NONE");
  assert.deepEqual(evaluation.authorityBoundary.enabledCapabilities, []);
  assert.deepEqual(evaluation.authorityBoundary.provenAuthorities, []);
  assert.equal(evaluation.authorityBoundary.cEnabledSubsetAProven, true);
  assert.equal(evaluation.economicBoundary.price, null);
  assert.equal(evaluation.economicBoundary.priceEstablished, false);
  assert.equal(evaluation.economicBoundary.pricingPermitted, false);
  assert.equal(evaluation.economicBoundary.guarantee, null);
  assert.equal(evaluation.economicBoundary.guaranteeCreated, false);
  assert.equal(evaluation.economicBoundary.settlement, null);
  assert.equal(evaluation.economicBoundary.settlementPermitted, false);
  assert.equal(evaluation.economicBoundary.moneyMovementEnabled, false);
}

test("strongest v1 result is immutable structural reference-slot coverage, never COMMIT",
  () => {
    const input = scenario();
    const evaluation = createOutcomeFormationEvaluationV1(input);
    const replay = evaluateOutcomeFormationV1(input);
    const verified = verifyOutcomeFormationEvaluationV1(evaluation, {
      expectedFormationEvaluationHash: evaluation.formationEvaluationHash,
      source: input,
    });

    assert.equal(evaluation.schema,
      OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_SCHEMAS.evaluation);
    assert.equal(evaluation.primaryState,
      OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.strongest);
    assert.equal(evaluation.strongestStateReached, true);
    assert.equal(evaluation.foundationCoverage
      .allRequiredFoundationReferenceSlotsPresent, true);
    assert.equal(evaluation.oneUseAssessment.capacityReceiptState,
      "STRUCTURALLY_PRESENT_AUTHENTICITY_UNKNOWN");
    assert.equal(evaluation.oneUseAssessment.capacityActuallyProven, false);
    assert.equal(evaluation.oneUseAssessment
      .capacityReservationIntervalCoverageEstablished, false);
    assert.equal(evaluation.oneUseAssessment.lifecycleNonRevocationSourceReplayed,
      false);
    assert.equal(evaluation.tenderAssessment.outcomeDecidabilityEstablished,
      false);
    assert.equal(evaluation.tenderAssessment.mandatoryResourceCoverageEstablished,
      false);
    assert.ok(evaluation.gapCodes.includes("CAPACITY_RECEIPT_AUTHENTICITY_UNKNOWN"));
    assert.ok(evaluation.gapCodes.includes("OUTCOME_DECIDABILITY_UNPROVEN"));
    assert.ok(evaluation.gapCodes.includes("TRUSTED_CLOCK_UNPROVEN"));
    assert.equal(evaluation.operationalBoundary.outsiderStaffInterventionsAllowed,
      0);
    assert.equal(evaluation.operationalBoundary.humanQueueFallbackAllowed, false);
    assert.equal(evaluation.operationalBoundary.failureDisposition,
      "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(evaluation.operationalBoundary
      .externalRouteZeroInternalOpsEstablished, false);
    assertAlwaysHeld(evaluation);
    assert.equal(verified.ok, true);
    assert.equal(verified.holdBoundaryVerified, true);
    assert.equal(verified.evaluatorZeroInternalOpsVerified, true);
    assert.deepEqual(replay, evaluation);
    assert.ok(Object.isFrozen(evaluation));
    assert.ok(Object.isFrozen(evaluation.foundationBindings));
    assert.ok(Object.isFrozen(evaluation.gapCodes));
    assert.match(evaluation.formationEvaluationHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.equal(canonicalizeStrict(replay), canonicalizeStrict(evaluation));
  });

test("invalid tender and caller hash-pin mismatch classify fail closed", () => {
  const good = scenario();
  const invalidTender = mutable(good.tender);
  invalidTender.actionReady = true;
  const evaluation = evaluateOutcomeFormationV1({
    ...good,
    tender: invalidTender,
  });

  assert.equal(evaluation.primaryState,
    OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.invalidTender);
  assert.equal(evaluation.tenderAssessment.structuralVerificationOk, false);
  assert.ok(evaluation.gapCodes.includes("TENDER_INVALID"));
  assertAlwaysHeld(evaluation);

  const wrongPin = evaluateOutcomeFormationV1({
    ...good,
    expectedTenderHash: h("wrong-tender-pin"),
  });
  assert.equal(wrongPin.primaryState,
    OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.invalidTender);
  assert.equal(wrongPin.tenderAssessment.expectedHashMatched, false);
  assertAlwaysHeld(wrongPin);
});

test("formation deadline is evaluated against the explicit replay timestamp", () => {
  const evaluation = evaluateOutcomeFormationV1(scenario({ input: {
    evaluatedAt: "2026-09-02T12:15:00.000Z",
  } }));
  assert.equal(evaluation.primaryState,
    OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.formationDeadlineExpired);
  assert.equal(evaluation.tenderAssessment.formationDeadlineExpired, true);
  assert.equal(evaluation.tenderAssessment.trustedClockEstablished, false);
  assert.ok(evaluation.gapCodes.includes("FORMATION_DEADLINE_EXPIRED"));
  assertAlwaysHeld(evaluation);
});

test("missing, mismatched, and cross-tender one-use bindings are distinct HOLD gaps",
  async (t) => {
    const base = scenario();
    await t.test("missing", () => {
      const evaluation = evaluateOutcomeFormationV1({
        ...base,
        ownerMandate: null,
      });
      assert.equal(evaluation.primaryState,
        OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.oneUseBindingsMissing);
      assert.ok(evaluation.gapCodes.includes("ONE_USE_BINDINGS_MISSING"));
      assertAlwaysHeld(evaluation);
    });

    await t.test("records mismatch each other", () => {
      const mismatchedProvider = createProviderOneUseAcceptanceV1({
        tenderHash: base.tender.tenderHash,
        scopeHash: h("different-scope"),
        providerRefHash: h("provider"),
        evidencePlanHash: base.tender.evidenceRequirements.requirementSetHash,
        remedyPlanHash: base.tender.recoveryRequirements.requirementSetHash,
        commercialTerm: { ...COMMERCIAL_TERM },
        acceptedAt: "2026-09-02T12:02:00.000Z",
        expiresAt: "2026-09-02T12:30:00.000Z",
        oneUseNonceHash: h("provider-one-use-nonce"),
        response: "ACCEPT",
        signatureRefHash: h("provider-signature-ref"),
      });
      const evaluation = evaluateOutcomeFormationV1({
        ...base,
        providerAcceptance: mismatchedProvider,
        capacityReservationReceipt: null,
      });
      assert.equal(evaluation.primaryState,
        OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.oneUseBindingsMismatched);
      assert.ok(evaluation.gapCodes.includes(
        "ONE_USE_BINDINGS_MISMATCHED_OR_INVALID"));
      assertAlwaysHeld(evaluation);
    });

    await t.test("pair matches internally but not the tender", () => {
      const records = oneUseRecords(base.tender, {
        scopeHash: h("internally-matched-wrong-scope"),
      });
      const evaluation = evaluateOutcomeFormationV1({
        ...base,
        ...records,
      });
      assert.equal(evaluation.oneUseAssessment.structuralVerificationOk, true);
      assert.equal(evaluation.oneUseAssessment.crossBoundToTender, false);
      assert.equal(evaluation.primaryState,
        OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.oneUseBindingsMismatched);
      assertAlwaysHeld(evaluation);
    });
  });

test("provider acceptance alone never becomes reserved capacity", () => {
  const evaluation = evaluateOutcomeFormationV1(scenario({ input: {
    capacityReservationReceipt: null,
  } }));
  assert.equal(evaluation.primaryState,
    OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.capacityReceiptAbsent);
  assert.equal(evaluation.oneUseAssessment.capacityReceiptState, "ABSENT");
  assert.equal(evaluation.oneUseAssessment.capacityActuallyProven, false);
  assert.ok(evaluation.gapCodes.includes("CAPACITY_RECEIPT_ABSENT"));
  assertAlwaysHeld(evaluation);
});

test("evidence, witness, recovery, rights, and risk reference gaps classify in order",
  async (t) => {
    const cases = [
      ["evidence", "actionAdmissionHash", "EVIDENCE_PATH_BINDINGS_GAP_HOLD",
        "EVIDENCE_PATH_BINDINGS_MISSING_OR_MISMATCHED"],
      ["witness", "networkOutcomeWitnessHash",
        "INDEPENDENT_WITNESS_BINDING_GAP_HOLD",
        "INDEPENDENT_WITNESS_BINDING_MISSING"],
      ["recovery", "recoveryCapacityReservationHash",
        "RECOVERY_PATH_BINDINGS_GAP_HOLD", "RECOVERY_PATH_BINDINGS_MISSING"],
      ["rights", "rightsPrivacyDecisionHash",
        "RIGHTS_PRIVACY_BINDING_GAP_HOLD", "RIGHTS_PRIVACY_BINDING_MISSING"],
      ["risk", "riskCapitalReservationHash",
        "RISK_CAPITAL_CUSTODY_ADJUDICATION_BINDINGS_GAP_HOLD",
        "RISK_CAPITAL_BINDING_MISSING"],
    ];
    for (const [name, field, expectedState, expectedGap] of cases) {
      await t.test(name, () => {
        const base = scenario();
        const foundationBindings = { ...base.foundationBindings, [field]: null };
        const evaluation = evaluateOutcomeFormationV1({
          ...base,
          foundationBindings,
        });
        assert.equal(evaluation.primaryState, expectedState);
        assert.ok(evaluation.gapCodes.includes(expectedGap));
        assertAlwaysHeld(evaluation);
      });
    }
  });

test("all-true caller claims cannot mint authority, trust, price, guarantee, or settle",
  () => {
    const evaluation = evaluateOutcomeFormationV1(scenario({ input: {
      untrustedCallerAssertions: callerAssertions(true),
    } }));
    assert.deepEqual(evaluation.untrustedCallerAssertions,
      callerAssertions(true));
    assert.equal(evaluation.callerAssertionsIgnoredForAuthority, true);
    assert.equal(evaluation.authorityBoundary
      .callerAssertionsAcceptedAsAuthority, false);
    assert.equal(evaluation.boundary.callerBooleansAcceptedAsAuthority, false);
    assert.equal(evaluation.primaryState,
      OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.strongest);
    assertAlwaysHeld(evaluation);
  });

test("tamper, wrong evaluation pin, and open shapes fail verification", () => {
  const source = scenario();
  const evaluation = evaluateOutcomeFormationV1(source);
  const tampered = mutable(evaluation);
  tampered.authority = "CALLER_CLAIMED";
  const tamperResult = verifyOutcomeFormationEvaluationV1(tampered, {
    expectedFormationEvaluationHash: evaluation.formationEvaluationHash,
    source,
  });
  assert.equal(tamperResult.ok, false);
  assert.equal(tamperResult.authority, "NONE");
  assert.equal(tamperResult.executable, false);

  const wrongPin = verifyOutcomeFormationEvaluationV1(evaluation, {
    expectedFormationEvaluationHash: h("wrong-evaluation-pin"),
    source,
  });
  assert.equal(wrongPin.ok, false);
  assert.match(wrongPin.error, /EXPECTED_FORMATION_EVALUATION_HASH_MISMATCH/u);

  assert.throws(() => evaluateOutcomeFormationV1({
    ...scenario(),
    manualFallback: true,
  }), /EVALUATE_INPUT_FIELDS_INVALID/u);
});

test("a rehashed evaluation cannot promote any externally unproven one-use fact",
  async (t) => {
    const fields = [
      "nonceGlobalFreshnessEstablished",
      "nonceConsumptionPersisted",
      "externalCapacityReceiptAuthenticityEstablished",
      "capacityReservationIntervalCoverageEstablished",
      "capacityActuallyProven",
      "lifecycleNonRevocationSourceReplayed",
      "authorityEstablished",
    ];
    for (const field of fields) {
      await t.test(field, () => {
        const source = scenario();
        const original = evaluateOutcomeFormationV1(source);
        const tampered = mutable(original);
        tampered.oneUseAssessment[field] = true;
        const resealed = resealEvaluation(tampered);
        const result = verifyOutcomeFormationEvaluationV1(resealed, {
          expectedFormationEvaluationHash: resealed.formationEvaluationHash,
          source,
        });
        assert.equal(result.ok, false);
        assert.match(result.error, /ONE_USE_EXTERNAL_FACT_OVERCLAIMED/u);
        assert.equal(result.authority, "NONE");
        assert.equal(result.actionReady, false);
        assert.equal(result.executable, false);
      });
    }
  });

test("rehashed tender and one-use assessment poisoning fails exact source replay",
  async (t) => {
    const cases = [
      ["unrelated observed tender hash with a claimed pin match", (value) => {
        value.tenderAssessment.observedTenderHash = h("unrelated-tender");
        value.tenderAssessment.expectedHashMatched = true;
      }],
      ["unrelated one-use crosswalk hashes with a claimed cross-binding", (value) => {
        value.oneUseAssessment.scopeHash = h("unrelated-scope");
        value.oneUseAssessment.evidencePlanHash = h("unrelated-evidence-plan");
        value.oneUseAssessment.remedyPlanHash = h("unrelated-remedy-plan");
        value.oneUseAssessment.crossBoundToTender = true;
      }],
    ];
    for (const [name, poison] of cases) {
      await t.test(name, () => {
        const source = scenario();
        const original = evaluateOutcomeFormationV1(source);
        const poisoned = mutable(original);
        poison(poisoned);
        const resealed = resealEvaluation(poisoned);
        const checked = verifyOutcomeFormationEvaluationV1(resealed, {
          expectedFormationEvaluationHash: resealed.formationEvaluationHash,
          source,
        });
        assert.equal(checked.ok, false);
        assert.match(checked.error, /SOURCE_REPLAY_MISMATCH/u);
        assert.equal(checked.dependencyRecordsReverified, false);
        assert.equal(checked.authority, "NONE");
        assert.equal(checked.executable, false);
      });
    }
  });

test("legacy output-only verification fails closed without exact source input", () => {
  const source = scenario();
  const evaluation = evaluateOutcomeFormationV1(source);
  const checked = verifyOutcomeFormationEvaluationV1(evaluation, {
    expectedFormationEvaluationHash: evaluation.formationEvaluationHash,
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.sourceReplayPerformed, false);
  assert.equal(checked.dependencyRecordsReverified, false);
  assert.match(checked.error, /VERIFY_OPTIONS_FIELDS_INVALID/u);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.executable, false);
});

test("exported boundary makes unsupported human fallback and real commerce impossible",
  () => {
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .humanQueueFallbackAllowed, false);
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .unsupportedOrUnformedDisposition, "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .realCommitStateAvailableInV1, false);
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .capacityActuallyProven, false);
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .outcomeDecidabilityEstablished, false);
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .price, null);
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .guarantee, null);
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .settlement, null);
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .cEnabledSubsetAProven, true);
    assert.equal(OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY
      .consequenceReach, "NONE");
  });
