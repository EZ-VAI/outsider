import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY,
  OUTSIDER_OUTCOME_TENDER_V1_LIMITS,
  OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS,
  compileOutcomeTenderV1,
  compileOutsiderOutcomeTenderV1,
  verifyOutcomeTenderV1,
  verifyOutsiderOutcomeTenderV1,
} from "../src/outsider-outcome-tender-v1.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;

function input(overrides = {}) {
  const evidenceId = alias("evidence", "independent");
  const base = {
    tenderId: alias("tender", "alpha"),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: {
      revision: 0,
      predecessorTenderHash: null,
      supersedesTenderHash: null,
    },
    workOrderHash: h("work-order"),
    typedGraph: {
      principalEpoch: {
        principalRefHash: h("principal"),
        epochRefHash: h("principal-epoch"),
        principalEpochProjectionHash: h("principal-epoch-projection"),
      },
      accountableDeployment: {
        deploymentLineageRefHash: h("deployment-lineage"),
        deploymentRevisionHash: h("deployment-revision"),
        accountableDeploymentSubjectHash: h("deployment-subject"),
      },
      runtime: {
        runtimeInstanceRefHash: h("runtime-ref"),
        runtimeInstanceHash: h("runtime"),
      },
      embodiment: {
        present: true,
        deviceLineageRefHash: h("device-lineage"),
        embodimentRevisionHash: h("embodiment-revision"),
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
      actorIdentityEnvelopeHash: h("actor-envelope"),
      delegationEvidenceRefHash: h("delegation-evidence"),
      delegationEdgeHash: h("delegation-edge"),
      authorityScopeRefHash: h("authority-scope"),
      resourceOwnerAuthorizationRefHash: h("owner-authorization"),
      rightsPrivacyPolicyRefHash: h("rights-privacy-policy"),
    },
    exactOutcome: {
      outcomeKindCode: "NETWORK_CONNECTIVITY_RESTORED",
      outcomeSpecRefHash: h("outcome-spec"),
      subjectRefHash: h("private-subject"),
      acceptanceCriteriaRefHash: h("acceptance-criteria"),
      conditions: [
        {
          conditionId: alias("condition", "latency"),
          metricCode: "LATENCY_MILLISECONDS",
          comparator: "LESS_THAN_OR_EQUAL",
          target: {
            valueKind: "INTEGER",
            booleanValue: null,
            integerValue: 50,
            stateCode: null,
            unitCode: "MILLISECOND",
          },
          observationWindowMs: 3_600_000,
          conditionRefHash: h("latency-condition"),
          mandatory: true,
        },
        {
          conditionId: alias("condition", "state"),
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
          conditionRefHash: h("state-condition"),
          mandatory: true,
        },
      ],
      deadline: "2026-09-03T12:00:00.000Z",
    },
    formationDeadline: "2026-09-02T12:15:00.000Z",
    resourceRequirements: [
      {
        resourceRequirementId: alias("resource", "technician"),
        resourceClassCode: "LOCAL_NETWORK_TECHNICIAN",
        capabilityRefHash: h("technician-capability"),
        quantity: 1,
        unitCode: "PERSON_VISIT",
        regionRefHash: h("private-region"),
        requiredBy: "2026-09-03T08:00:00.000Z",
        mandatory: true,
      },
      {
        resourceRequirementId: alias("resource", "router"),
        resourceClassCode: "NETWORK_ROUTER",
        capabilityRefHash: h("router-capability"),
        quantity: 1,
        unitCode: "DEVICE",
        regionRefHash: h("private-region"),
        requiredBy: "2026-09-03T08:00:00.000Z",
        mandatory: true,
      },
    ],
    evidenceRequirements: [
      {
        evidenceRequirementId: alias("evidence", "vendor-log"),
        evidenceClassCode: "VENDOR_DEVICE_LOG",
        evidenceRequirementRefHash: h("vendor-log-requirement"),
        sourceControl: "VENDOR_NATIVE_AUXILIARY_ONLY",
        observationMode: "AT_COMPLETION",
        dueBy: "2026-09-03T11:00:00.000Z",
        mandatory: false,
      },
      {
        evidenceRequirementId: evidenceId,
        evidenceClassCode: "INDEPENDENT_NETWORK_PROBE",
        evidenceRequirementRefHash: h("independent-evidence-requirement"),
        sourceControl: "INDEPENDENT_OF_PROVIDER",
        observationMode: "LONGITUDINAL",
        dueBy: "2026-09-03T12:00:00.000Z",
        mandatory: true,
      },
    ],
    recoveryRequirements: [
      {
        recoveryRequirementId: alias("recovery", "alternate"),
        triggerRefHash: h("recovery-trigger"),
        recoveryOutcomeRefHash: h("recovery-outcome"),
        resourceClassCode: "ALTERNATE_NETWORK_TECHNICIAN",
        maximumAttempts: 2,
        completionDeadline: "2026-09-03T12:00:00.000Z",
        recoveryEvidenceRequirementId: evidenceId,
        routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
        mandatory: true,
      },
    ],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h("consequence-envelope"),
      consequenceClassCode: "BOUNDED_SERVICE_INTERRUPTION",
      measureCode: "MAXIMUM_INTERRUPTION_MINUTES",
      maximumValue: 240,
      unitCode: "MINUTE",
      affectedChannelRefHashes: [h("channel-b"), h("channel-a")],
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
  return { ...base, ...overrides };
}

function mutable(value) {
  return JSON.parse(JSON.stringify(value));
}

function verify(tender, expectedTenderHash = tender.tenderHash) {
  return verifyOutsiderOutcomeTenderV1(tender, { expectedTenderHash });
}

function assertHeld(value) {
  assert.equal(value.authorizationEstablished, false);
  assert.equal(value.sendableTenderEstablished, false);
  assert.equal(value.providerDiscoveryPerformed, false);
  assert.equal(value.providerContactPerformed, false);
  assert.equal(value.pricePresent, false);
  assert.equal(value.pricingPermitted, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.settlementPermitted, false);
  assert.equal(value.decisionState, "HOLD");
  assert.equal(value.authority, "NONE");
  assert.equal(value.actionReady, false);
  assert.equal(value.executable, false);
  assert.equal(value.enabledCapabilityCount, 0);
  assert.equal(value.provenAuthorityCount, 0);
  assert.equal(value.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(value.consequenceReach, "NONE");
}

test("compiles one immutable public authorization-scoped tender over the frozen graph",
  () => {
    const source = input();
    const tender = compileOutsiderOutcomeTenderV1(source);
    const checked = verify(tender);

    assert.equal(tender.schema, OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.tender);
    assert.equal(tender.tenderClass,
      "PUBLIC_AUTHORIZATION_SCOPED_OUTCOME_TENDER_HOLD_ONLY");
    assert.equal(tender.typedGraph.graphPath,
      "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT");
    for (const node of ["principalEpoch", "accountableDeployment", "runtime",
      "embodiment", "delegation", "episode", "attempt"]) {
      assert.deepEqual(tender.typedGraph[node], source.typedGraph[node], node);
    }
    assert.equal(tender.typedGraph.ipAddressAcceptedAsIdentity, false);
    assert.equal(tender.typedGraph.deviceAddressAcceptedAsIdentity, false);
    assert.equal(tender.typedGraph.baseModelAcceptedAsIdentity, false);
    assert.equal(tender.typedGraph.globalScoreCreated, false);
    assert.equal(tender.authorizationBinding.exactDelegationReferencesMatchTypedGraph,
      true);
    assert.equal(tender.authorizationBinding.authorityEstablished, false);
    assert.equal(tender.exactOutcome.deadline, source.exactOutcome.deadline);
    assert.equal(tender.exactOutcome.conditions.length, 2);
    assert.match(tender.exactOutcome.exactOutcomeHash, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(tender.formationWindowMs, 15 * 60 * 1_000);
    assert.equal(tender.resourceRequirements.items.length, 2);
    assert.equal(tender.evidenceRequirements.mandatoryIndependentRequirementCount, 1);
    assert.equal(tender.evidenceRequirements.items.find((row) => (
      row.sourceControl === "INDEPENDENT_OF_PROVIDER"
    )).requiredAsIndependentOutcomeEvidence, true);
    assert.equal(tender.evidenceRequirements.items.find((row) => (
      row.sourceControl === "INDEPENDENT_OF_PROVIDER"
    )).evidenceObserved, false);
    assert.equal(tender.evidenceRequirements.items.find((row) => (
      row.sourceControl === "INDEPENDENT_OF_PROVIDER"
    )).acceptedAsIndependentOutcomeTruth, false);
    assert.equal(tender.evidenceRequirements
      .vendorNativeEvidenceAcceptedAsIndependentOutcomeTruth, false);
    assert.equal(tender.recoveryRequirements.items.length, 1);
    assert.equal(tender.maximumConsequence.maximumValue, 240);
    assert.equal(tender.maximumConsequence.ceilingIsMaximumConsequenceNotPrice,
      true);
    assert.deepEqual(tender.maximumConsequence.affectedChannelRefHashes,
      [h("channel-a"), h("channel-b")]);
    assert.equal(tender.zeroInternalOps.outsiderStaffInterventionsAllowed, 0);
    assert.equal(tender.zeroInternalOps.invariantSatisfied, true);
    assert.equal(tender.formationState.unformedDisposition,
      "DECLINE_NOT_HUMAN_QUEUE");
    assert.deepEqual(tender.boundary, OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY);
    assert.equal(Object.isFrozen(tender), true);
    assert.equal(Object.isFrozen(tender.exactOutcome.conditions), true);
    assert.equal(Object.isFrozen(tender.resourceRequirements.items), true);

    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.structuralTenderVerified, true);
    assert.equal(checked.exactSchemaVerified, true);
    assert.equal(checked.derivationVerified, true);
    assert.equal(checked.selfHashVerified, true);
    assert.equal(checked.expectedHashMatched, true);
    assert.equal(checked.publicProjectionSafeByClosedShape, true);
    assert.equal(checked.typedGraphReferencesPreserved, true);
    assert.equal(checked.zeroInternalOpsVerified, true);
    assertHeld(checked);
  });

test("short formation-engine aliases are exact API aliases", () => {
  assert.equal(compileOutcomeTenderV1, compileOutsiderOutcomeTenderV1);
  assert.equal(verifyOutcomeTenderV1, verifyOutsiderOutcomeTenderV1);
});

test("canonical ordering makes normalized tender hashes independent of input order",
  () => {
    const left = input();
    const right = input();
    right.exactOutcome.conditions.reverse();
    right.resourceRequirements.reverse();
    right.evidenceRequirements.reverse();
    right.maximumConsequence.affectedChannelRefHashes.reverse();
    const a = compileOutsiderOutcomeTenderV1(left);
    const b = compileOutsiderOutcomeTenderV1(right);
    assert.equal(a.tenderHash, b.tenderHash);
    assert.equal(canonicalizeStrict(a), canonicalizeStrict(b));
  });

test("closed public shape rejects PII, secrets, free text, contacts, pricing, and payments",
  () => {
    const topLevelFields = ["email", "phone", "address", "secret", "prompt",
      "contactTarget", "price", "paymentInstruction", "callback", "url"];
    for (const field of topLevelFields) {
      const value = input();
      value[field] = "customer@example.com";
      assert.throws(() => compileOutsiderOutcomeTenderV1(value),
        /COMPILE_INPUT_FIELDS_INVALID/u, field);
    }

    const nestedPrice = input();
    nestedPrice.resourceRequirements[0].price = 100;
    assert.throws(() => compileOutsiderOutcomeTenderV1(nestedPrice),
      /RESOURCE_REQUIREMENT_FIELDS_INVALID/u);

    const emailAsCode = input();
    emailAsCode.exactOutcome.outcomeKindCode = "customer@example.com";
    assert.throws(() => compileOutsiderOutcomeTenderV1(emailAsCode),
      /OUTCOME_KIND_CODE_INVALID/u);

    for (const forbidden of ["SECRET", "EMAIL", "PHONE", "PASSWORD", "TOKEN"] ) {
      const value = input();
      value.exactOutcome.outcomeKindCode = forbidden;
      assert.throws(() => compileOutsiderOutcomeTenderV1(value),
        /PRIVATE_SEMANTIC_FORBIDDEN/u, forbidden);
    }

    const semanticTenderId = input();
    semanticTenderId.tenderId = "customer@example.com";
    assert.throws(() => compileOutsiderOutcomeTenderV1(semanticTenderId),
      /TENDER_ID_INVALID/u);
  });

test("authorization refs must exactly reuse the typed graph delegation refs", () => {
  for (const field of ["delegationEvidenceRefHash", "delegationEdgeHash"]) {
    const value = input();
    value.authorizationBinding[field] = h(`other-${field}`);
    assert.throws(() => compileOutsiderOutcomeTenderV1(value),
      /AUTHORIZATION_DELEGATION_TYPED_GRAPH_MISMATCH/u, field);
  }

  const ipIdentity = input();
  ipIdentity.typedGraph.principalEpoch.ipAddress = "192.0.2.1";
  assert.throws(() => compileOutsiderOutcomeTenderV1(ipIdentity),
    /PRINCIPAL_EPOCH_FIELDS_INVALID/u);
});

test("formation deadline is bounded, prompt, and strictly before outcome", () => {
  const sameTime = input();
  sameTime.formationDeadline = sameTime.compiledAt;
  assert.throws(() => compileOutsiderOutcomeTenderV1(sameTime),
    /FORMATION_DEADLINE_WINDOW_INVALID/u);

  const tooLate = input();
  tooLate.formationDeadline = "2026-09-03T12:00:00.001Z";
  assert.throws(() => compileOutsiderOutcomeTenderV1(tooLate),
    /FORMATION_DEADLINE_WINDOW_INVALID/u);

  const atOutcome = input();
  atOutcome.formationDeadline = atOutcome.exactOutcome.deadline;
  assert.throws(() => compileOutsiderOutcomeTenderV1(atOutcome),
    /FORMATION_DEADLINE_MUST_PRECEDE_OUTCOME_DEADLINE/u);

  assert.equal(OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumFormationWindowMs,
    86_400_000);
});

test("resource, evidence, and recovery deadlines stay inside the committed window",
  () => {
    const resource = input();
    resource.resourceRequirements[0].requiredBy = "2026-09-02T12:14:59.999Z";
    assert.throws(() => compileOutsiderOutcomeTenderV1(resource),
      /RESOURCE_REQUIRED_BY_OUTSIDE_FORMATION_OUTCOME_WINDOW/u);

    const evidence = input();
    evidence.evidenceRequirements[0].dueBy = "2026-09-04T00:00:00.000Z";
    assert.throws(() => compileOutsiderOutcomeTenderV1(evidence),
      /EVIDENCE_DUE_BY_OUTSIDE_FORMATION_OUTCOME_WINDOW/u);

    const recovery = input();
    recovery.recoveryRequirements[0].completionDeadline
      = "2026-09-04T00:00:00.000Z";
    assert.throws(() => compileOutsiderOutcomeTenderV1(recovery),
      /RECOVERY_DEADLINE_OUTSIDE_FORMATION_OUTCOME_WINDOW/u);
  });

test("a mandatory independent outcome witness and a bounded recovery route are required",
  () => {
    const noIndependent = input();
    noIndependent.evidenceRequirements = [noIndependent.evidenceRequirements[0]];
    assert.throws(() => compileOutsiderOutcomeTenderV1(noIndependent),
      /MANDATORY_INDEPENDENT_OUTCOME_EVIDENCE_REQUIRED/u);

    const vendorAsTruth = input();
    vendorAsTruth.evidenceRequirements[0].mandatory = true;
    assert.throws(() => compileOutsiderOutcomeTenderV1(vendorAsTruth),
      /VENDOR_NATIVE_EVIDENCE_CANNOT_BE_MANDATORY_OUTCOME_TRUTH/u);

    const missingRecovery = input();
    missingRecovery.recoveryRequirements = [];
    assert.throws(() => compileOutsiderOutcomeTenderV1(missingRecovery),
      /RECOVERY_REQUIREMENTS_DENSE_ARRAY_REQUIRED/u);

    const unknownWitness = input();
    unknownWitness.recoveryRequirements[0].recoveryEvidenceRequirementId
      = alias("evidence", "unknown");
    assert.throws(() => compileOutsiderOutcomeTenderV1(unknownWitness),
      /RECOVERY_REQUIRES_MANDATORY_INDEPENDENT_EVIDENCE/u);

    const vendorRecoveryWitness = input();
    vendorRecoveryWitness.recoveryRequirements[0].recoveryEvidenceRequirementId
      = vendorRecoveryWitness.evidenceRequirements[0].evidenceRequirementId;
    assert.throws(() => compileOutsiderOutcomeTenderV1(vendorRecoveryWitness),
      /RECOVERY_REQUIRES_MANDATORY_INDEPENDENT_EVIDENCE/u);

    const unbounded = input();
    unbounded.maximumConsequence.unboundedConsequenceAllowed = true;
    assert.throws(() => compileOutsiderOutcomeTenderV1(unbounded),
      /MAXIMUM_CONSEQUENCE_MUST_BE_BOUNDED_AND_REVERSIBLE/u);
  });

test("any internal operator or human-queue fallback invalidates the tender", () => {
  const mutations = [
    (value) => { value.zeroInternalOps.outsiderStaffInterventionsAllowed = 1; },
    (value) => { value.zeroInternalOps.internalManualSourcingAllowed = true; },
    (value) => { value.zeroInternalOps.internalManualCoordinationAllowed = true; },
    (value) => { value.zeroInternalOps.internalManualVerificationAllowed = true; },
    (value) => { value.zeroInternalOps.internalManualRecoveryAllowed = true; },
    (value) => { value.zeroInternalOps.humanQueueFallbackAllowed = true; },
    (value) => { value.zeroInternalOps.failureDisposition = "SEND_TO_OPERATIONS"; },
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    const value = input();
    mutations[index](value);
    assert.throws(() => compileOutsiderOutcomeTenderV1(value),
      /ZERO_INTERNAL_OPS_INVARIANT_REQUIRED/u, String(index));
  }
});

test("append-only descendants require one exact predecessor supersession link", () => {
  const genesis = compileOutsiderOutcomeTenderV1(input());
  const descendantInput = input({
    lineage: {
      revision: 1,
      predecessorTenderHash: genesis.tenderHash,
      supersedesTenderHash: genesis.tenderHash,
    },
  });
  const descendant = compileOutsiderOutcomeTenderV1(descendantInput);
  assert.equal(descendant.lineage.appendOnlyDeclaration, true);
  assert.equal(descendant.lineage.inPlaceMutationAllowed, false);
  assert.equal(descendant.lineage.predecessorSourceReplayVerified, false);
  assert.notEqual(descendant.tenderHash, genesis.tenderHash);

  descendantInput.lineage.supersedesTenderHash = h("different-parent");
  assert.throws(() => compileOutsiderOutcomeTenderV1(descendantInput),
    /DESCENDANT_REQUIRES_EXACT_PREDECESSOR_SUPERSESSION_LINK/u);
});

test("verifier fails closed for every unsealed mutation and a wrong caller pin", () => {
  const tender = compileOutsiderOutcomeTenderV1(input());
  const mutations = [
    (value) => { value.exactOutcome.conditions[0].target.integerValue = 51; },
    (value) => { value.typedGraph.attempt.attemptHash = h("other-attempt"); },
    (value) => { value.authorizationBinding.authorityEstablished = true; },
    (value) => { value.maximumConsequence.maximumValue = 241; },
    (value) => { value.zeroInternalOps.outsiderStaffInterventionsAllowed = 1; },
    (value) => { value.publicProjection.piiIncluded = true; },
    (value) => { value.economicBoundary.pricePresent = true; },
    (value) => { value.formationState.state = "FORMING"; },
    (value) => { value.tenderHash = h("forged-tender"); },
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    const value = mutable(tender);
    mutations[index](value);
    const checked = verify(value, tender.tenderHash);
    assert.equal(checked.ok, false, String(index));
    assertHeld(checked);
  }

  const wrongPin = verify(tender, h("wrong-pin"));
  assert.equal(wrongPin.ok, false);
  assert.match(wrongPin.error, /EXPECTED_TENDER_HASH_MISMATCH/u);
  assertHeld(wrongPin);
});

test("verifier rejects unknown projection fields without exposing live capability", () => {
  const tender = compileOutsiderOutcomeTenderV1(input());
  const value = mutable(tender);
  value.price = 100;
  const checked = verify(value, tender.tenderHash);
  assert.equal(checked.ok, false);
  assert.match(checked.error, /TENDER_FIELDS_INVALID/u);
  assertHeld(checked);
});

test("accessors, proxies, sparse arrays, shared objects, and invalid dates fail closed",
  () => {
    const accessor = input();
    Object.defineProperty(accessor, "workOrderHash", {
      enumerable: true,
      get() { throw new Error("must not execute"); },
    });
    assert.throws(() => compileOutsiderOutcomeTenderV1(accessor),
      /ACCESSOR_FORBIDDEN/u);

    const proxied = input();
    proxied.maximumConsequence = new Proxy(proxied.maximumConsequence, {});
    assert.throws(() => compileOutsiderOutcomeTenderV1(proxied), /PROXY_FORBIDDEN/u);

    const sparse = input();
    sparse.resourceRequirements = new Array(1);
    assert.throws(() => compileOutsiderOutcomeTenderV1(sparse),
      /dense and undecorated|DENSE_ARRAY_REQUIRED/u);

    const shared = input();
    shared.resourceRequirements.push(shared.resourceRequirements[0]);
    assert.throws(() => compileOutsiderOutcomeTenderV1(shared),
      /RESOURCE_REQUIREMENT_ID_DUPLICATE/u);

    const cyclic = input();
    cyclic.resourceRequirements[0].cycle = cyclic;
    assert.throws(() => compileOutsiderOutcomeTenderV1(cyclic),
      /SHARED_OR_CYCLIC_OBJECT_FORBIDDEN/u);

    const invalidDate = input();
    invalidDate.compiledAt = "2026-02-31T12:00:00.000Z";
    assert.throws(() => compileOutsiderOutcomeTenderV1(invalidDate),
      /COMPILED_AT_INVALID/u);
  });

test("captured hashing intrinsics prevent post-import tender-hash substitution", () => {
  const source = input();
  const expected = compileOutsiderOutcomeTenderV1(source);
  const prototype = Object.getPrototypeOf(createHash("sha256"));
  const originalUpdate = prototype.update;
  const originalDigest = prototype.digest;
  try {
    prototype.update = function poisonedUpdate() { throw new Error("poisoned"); };
    prototype.digest = function forgedDigest() { return "0".repeat(64); };
    const rebuilt = compileOutsiderOutcomeTenderV1(source);
    assert.equal(rebuilt.tenderHash, expected.tenderHash);
    assert.equal(verify(rebuilt, expected.tenderHash).ok, true);
  } finally {
    prototype.update = originalUpdate;
    prototype.digest = originalDigest;
  }
});
