import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  AUTONOMOUS_WORK_ORDER_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_PROTECTION_FUNDING_STATUSES,
  AUTONOMOUS_WORK_ORDER_SCHEMAS,
  createAutonomousWorkOrderProjection,
  verifyAutonomousWorkOrderProjection,
} from "../src/outsider-autonomous-work-order.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;

function input(overrides = {}) {
  const provider = h("provider");
  const base = {
    orderId: "awo_0123456789abcdef0123456789abcdef",
    recordedAt: "2026-09-01T00:00:00.000Z",
    appendOnlyLineage: {
      revision: 0,
      predecessorProjectionHash: null,
      supersedesProjectionHash: null,
    },
    typedGraph: {
      principalEpoch: {
        principalRefHash: h("principal"),
        epochRefHash: h("principal-epoch"),
        principalEpochProjectionHash: h("principal-epoch-projection"),
      },
      accountableDeployment: {
        deploymentLineageRefHash: h("deployment-lineage"),
        deploymentRevisionHash: h("deployment-revision"),
        accountableDeploymentSubjectHash: h("accountable-deployment-subject"),
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
        networkCompleteEpisodeJoinHash: h("network-complete-episode-join"),
      },
      attempt: {
        attemptHash: h("attempt"),
        attemptActorSubjectHash: h("attempt-actor-subject"),
      },
    },
    contractReferences: {
      actorIdentityEnvelopeHash: h("actor-identity-envelope"),
      realitySemanticBundleHash: h("reality-semantic-bundle"),
      realityObligationGenesisHash: h("obligation-genesis"),
      realityObligationStateHash: h("obligation-state"),
      affectedPartyRootHash: h("affected-party-root"),
      outcomeWitnessEnvelopeHash: null,
    },
    resourceOwner: {
      resourceOwnerRefHash: h("resource-owner"),
      ownerAdoptionEvidenceRefHash: null,
      externalAdoptionEstablished: false,
    },
    promisedOutcome: {
      promisedOutcomeRefHash: h("promised-outcome"),
      acceptanceCriteriaHash: h("acceptance-criteria"),
      outcomeWitnessRequirementHash: h("outcome-witness-requirement"),
      consequenceChannelHashes: [h("channel-b"), h("channel-a")],
    },
    observationHorizons: [
      {
        horizonId: "delayed",
        dueAfterMs: 86_400_000,
        observationRequirementHash: h("observe-delayed"),
        mandatory: true,
      },
      {
        horizonId: "immediate",
        dueAfterMs: 0,
        observationRequirementHash: h("observe-immediate"),
        mandatory: true,
      },
    ],
    obligors: [
      {
        obligorRefHash: provider,
        role: "RECOVERY",
        obligationRefHash: h("recovery-obligation"),
      },
      {
        obligorRefHash: provider,
        role: "PRIMARY_PERFORMANCE",
        obligationRefHash: h("performance-obligation"),
      },
    ],
    remedyMenu: [
      {
        remedyId: "reperform",
        kind: "REPERFORM",
        remedyTermsHash: h("reperform-terms"),
        obligorRefHashes: [provider],
      },
      {
        remedyId: "rollback",
        kind: "ROLLBACK",
        remedyTermsHash: h("rollback-terms"),
        obligorRefHashes: [provider],
      },
    ],
    protectionFunding: {
      status: "NONE",
    },
    orderStatus: "STRUCTURAL_PRECOMMITMENT_HOLD",
    challenge: {
      opened: false,
      challengeRefHash: null,
      standingExternallyVerified: false,
    },
    closure: {
      closed: false,
      closureRefHash: null,
      externalClosureVerified: false,
    },
    proofAccessPolicy: {
      roleScopedProofPolicyHash: h("role-scoped-proof-policy"),
      redactionPolicyHash: h("redaction-policy"),
    },
  };
  return { ...base, ...overrides };
}

function mutable(value) {
  return JSON.parse(JSON.stringify(value));
}

function verify(record, expectedWorkOrderHash = record.workOrderHash) {
  return verifyAutonomousWorkOrderProjection(record, { expectedWorkOrderHash });
}

function assertHeld(result) {
  assert.equal(result.decisionState, "HOLD");
  assert.equal(result.authority, "NONE");
  assert.equal(result.actionReady, false);
  assert.equal(result.executable, false);
  assert.equal(result.moneyMovementEnabled, false);
  assert.equal(result.guaranteeEstablished, false);
  assert.equal(result.insuranceEstablished, false);
  assert.equal(result.settlementEnabled, false);
}

test("projects one exact append-only work order over the frozen typed graph", () => {
  const order = createAutonomousWorkOrderProjection(input());
  const result = verify(order);

  assert.equal(order.schema, AUTONOMOUS_WORK_ORDER_SCHEMAS.projection);
  assert.equal(order.projectionClass,
    "APPEND_ONLY_AUTONOMOUS_WORK_ORDER_PRODUCT_PROJECTION_HOLD_ONLY");
  assert.equal(order.typedGraph.graphPath,
    "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT");
  assert.equal(order.typedGraph.ipAddressAcceptedAsIdentity, false);
  assert.equal(order.typedGraph.deviceAddressAcceptedAsIdentity, false);
  assert.equal(order.typedGraph.baseModelAcceptedAsIdentity, false);
  assert.equal(order.typedGraph.globalScoreCreated, false);
  assert.deepEqual(order.promisedOutcome.consequenceChannelHashes,
    [h("channel-a"), h("channel-b")]);
  assert.equal(order.observationPlan.horizons[0].horizonId, "immediate");
  assert.equal(order.observationPlan.horizons[1].horizonId, "delayed");
  assert.equal(order.resourceOwner.externalAdoptionEstablished, false);
  assert.equal(order.episodeAlias.orderIdentityHash,
    order.typedGraph.episode.episodeHash);
  assert.equal(order.episodeAlias.newEpisodeOrOrderOntologyCreated, false);
  assert.deepEqual(order.orderAliasBoundary, {
    privateDisplayAliasOnly: true,
    randomnessEstablished: false,
    acceptedAsIdentity: false,
    networkProjectionEligible: false,
  });
  assert.equal(order.attemptScope.representedAttemptCount, 1);
  assert.equal(order.attemptScope.representedAttemptHash,
    order.typedGraph.attempt.attemptHash);
  assert.equal(order.attemptScope.multiAttemptCompositionEstablished, false);
  assert.equal(order.attemptScope.retryPolicyEnforcedByThisProjection, false);
  assert.equal(order.proofAccessPolicy.roleScopedProofAccessOnly, true);
  assert.equal(order.proofAccessPolicy.redactionRequired, true);
  assert.equal(order.nativeSafetyBoundary.nativeSafetyUnconditionalVetoPreserved, true);
  assert.equal(order.nativeSafetyBoundary.outsiderCanOverrideNativeSafetyVeto, false);
  assert.equal(order.challenge.opened, false);
  assert.equal(order.closure.closed, false);
  assert.equal(order.protectionFunding.status, "NONE");
  assert.equal(order.protectionFunding.custodyEstablished, false);
  assert.equal(order.protectionFunding.platformAdvanceEnabled, false);
  assert.equal(order.protectionFunding.guaranteeEstablished, false);
  assert.equal(order.protectionFunding.insuranceEstablished, false);
  assert.equal(order.protectionFunding.settlementEnabled, false);
  assert.deepEqual(order.boundary, AUTONOMOUS_WORK_ORDER_BOUNDARY);
  assert.equal(Object.isFrozen(order), true);
  assert.equal(Object.isFrozen(order.remedyMenu.items), true);

  assert.equal(result.ok, true);
  assert.equal(result.structuralProjectionVerified, true);
  assert.equal(result.exactSchemaVerified, true);
  assert.equal(result.selfHashVerified, true);
  assert.equal(result.expectedHashMatched, true);
  assert.equal(result.sourceReplayPerformedByThisProjection, false);
  assert.equal(result.sourceReplayVerified, false);
  assert.equal(result.networkOrderEstablished, false);
  assertHeld(result);
});

test("supports software-only runtime without minting an embodiment identity", () => {
  const value = input();
  value.typedGraph.embodiment = {
    present: false,
    deviceLineageRefHash: null,
    embodimentRevisionHash: null,
  };
  value.protectionFunding = {
    status: "NONE",
  };
  const order = createAutonomousWorkOrderProjection(value);
  assert.equal(order.typedGraph.embodiment.present, false);
  assert.equal(order.protectionFunding.status, "NONE");
  assert.equal(verify(order).ok, true);
});

test("append-only descendants require an exact predecessor supersession link", () => {
  const prior = createAutonomousWorkOrderProjection(input());
  const descendantInput = input({
    appendOnlyLineage: {
      revision: 1,
      predecessorProjectionHash: prior.workOrderHash,
      supersedesProjectionHash: prior.workOrderHash,
    },
  });
  const descendant = createAutonomousWorkOrderProjection(descendantInput);
  assert.equal(descendant.appendOnlyLineage.appendOnlyDeclaration, true);
  assert.equal(descendant.appendOnlyLineage.predecessorSourceReplayVerified, false);
  assert.equal(descendant.appendOnlyLineage.inPlaceMutationAllowed, false);
  assert.equal(descendant.appendOnlyLineage.supersedesProjectionHash,
    prior.workOrderHash);
  assert.notEqual(descendant.workOrderHash, prior.workOrderHash);

  descendantInput.appendOnlyLineage.supersedesProjectionHash = h("different-prior");
  assert.throws(() => createAutonomousWorkOrderProjection(descendantInput),
    /DESCENDANT_REQUIRES_EXACT_PREDECESSOR_SUPERSESSION_LINK/u);
});

test("phase 1 rejects funding, adoption, challenge, closure, and outcome escalation", () => {
  for (const status of ["PROVIDER_COMMITMENT_ONLY", "OUTSIDER_CAPITAL",
    "GUARANTEE", "INSURANCE", "SETTLED"] ) {
    const value = input();
    value.protectionFunding.status = status;
    assert.throws(() => createAutonomousWorkOrderProjection(value),
      /PROTECTION_FUNDING_STATUS_INVALID/u, status);
  }
  assert.deepEqual(AUTONOMOUS_WORK_ORDER_PROTECTION_FUNDING_STATUSES,
    ["NONE"]);

  const adoption = input();
  adoption.resourceOwner.externalAdoptionEstablished = true;
  assert.throws(() => createAutonomousWorkOrderProjection(adoption),
    /EXTERNAL_ADOPTION_MUST_REMAIN_FALSE/u);

  const challenge = input();
  challenge.challenge.opened = true;
  assert.throws(() => createAutonomousWorkOrderProjection(challenge),
    /CHALLENGE_MUST_REMAIN_UNOPENED/u);

  const closure = input();
  closure.closure.closed = true;
  assert.throws(() => createAutonomousWorkOrderProjection(closure),
    /CLOSURE_MUST_REMAIN_OPEN/u);

  const witness = input();
  witness.contractReferences.outcomeWitnessEnvelopeHash = h("witness");
  assert.throws(() => createAutonomousWorkOrderProjection(witness),
    /OUTCOME_WITNESS_MUST_REMAIN_UNMATERIALIZED/u);
});

test("strict schema excludes callbacks, raw source, secrets, and payment instructions", () => {
  for (const field of ["callback", "rawSource", "secret", "paymentInstruction"] ) {
    const value = input();
    value[field] = h(field);
    assert.throws(() => createAutonomousWorkOrderProjection(value),
      /CREATE_INPUT_FIELDS_INVALID/u, field);
  }
  const nested = input();
  nested.protectionFunding.amount = "100";
  assert.throws(() => createAutonomousWorkOrderProjection(nested),
    /PROTECTION_FUNDING_FIELDS_INVALID/u);

  const semanticOrderId = input();
  semanticOrderId.orderId = "customer@example.com";
  assert.throws(() => createAutonomousWorkOrderProjection(semanticOrderId),
    /ORDER_ID_PRIVATE_ALIAS_INVALID/u);

  const invalidCalendarDate = input();
  invalidCalendarDate.recordedAt = "2026-02-31T00:00:00.000Z";
  assert.throws(() => createAutonomousWorkOrderProjection(invalidCalendarDate),
    /RECORDED_AT_INVALID/u);
});

test("named remedies cannot reference unknown obligors and funding has no phase-1 fields", () => {
  const remedy = input();
  remedy.remedyMenu[0].obligorRefHashes = [h("unknown-obligor")];
  assert.throws(() => createAutonomousWorkOrderProjection(remedy),
    /REMEDY_NAMES_UNKNOWN_OBLIGOR/u);

  const funding = input();
  funding.protectionFunding.providerCommitmentRefHash = h("unverified-commitment");
  assert.throws(() => createAutonomousWorkOrderProjection(funding),
    /PROTECTION_FUNDING_FIELDS_INVALID/u);

  const repeatedRole = input();
  repeatedRole.obligors.push({
    obligorRefHash: repeatedRole.obligors[0].obligorRefHash,
    role: repeatedRole.obligors[0].role,
    obligationRefHash: h("second-recovery-duty"),
  });
  assert.equal(createAutonomousWorkOrderProjection(repeatedRole)
    .obligorSet.items.length, 3);

  const duplicateDuty = input();
  duplicateDuty.obligors.push(structuredClone(duplicateDuty.obligors[0]));
  assert.throws(() => createAutonomousWorkOrderProjection(duplicateDuty),
    /OBLIGOR_DUTY_OCCURRENCE_DUPLICATE/u);
});

test("mandatory observation plan requires exact immediate and delayed horizons", () => {
  const noImmediate = input();
  noImmediate.observationHorizons[1].dueAfterMs = 1000;
  assert.throws(() => createAutonomousWorkOrderProjection(noImmediate),
    /IMMEDIATE_AND_DELAYED_HORIZONS_REQUIRED/u);

  const duplicate = input();
  duplicate.observationHorizons[0].horizonId = "immediate";
  assert.throws(() => createAutonomousWorkOrderProjection(duplicate),
    /OBSERVATION_HORIZON_ID_DUPLICATE/u);

  const separatedDuplicate = input();
  separatedDuplicate.observationHorizons = [
    separatedDuplicate.observationHorizons[1],
    {
      horizonId: "middle",
      dueAfterMs: 1_000,
      observationRequirementHash: h("observe-middle"),
      mandatory: true,
    },
    {
      horizonId: "immediate",
      dueAfterMs: 2_000,
      observationRequirementHash: h("observe-duplicate-immediate"),
      mandatory: true,
    },
  ];
  assert.throws(() => createAutonomousWorkOrderProjection(separatedDuplicate),
    /OBSERVATION_HORIZON_ID_DUPLICATE/u);
});

test("self-hash and caller-supplied expected hash reject every unsealed mutation", () => {
  const order = createAutonomousWorkOrderProjection(input());
  const mutations = [
    (record) => { record.typedGraph.attempt.attemptHash = h("other-attempt"); },
    (record) => { record.resourceOwner.resourceOwnerRefHash = h("other-owner"); },
    (record) => { record.promisedOutcome.acceptanceCriteriaHash = h("other-criteria"); },
    (record) => { record.remedyMenu.items[0].remedyTermsHash = h("other-remedy"); },
    (record) => { record.protectionFunding.status = "GUARANTEE"; },
    (record) => { record.orderStatus = "OPEN_AWAITING_EXTERNAL_ADOPTION"; },
    (record) => { record.challenge.opened = true; },
    (record) => { record.closure.closed = true; },
    (record) => { record.workOrderHash = h("forged-self-hash"); },
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    const record = mutable(order);
    mutations[index](record);
    const result = verify(record, order.workOrderHash);
    assert.equal(result.ok, false, String(index));
    assert.equal(result.selfHashVerified, false, String(index));
    assertHeld(result);
  }

  const wrongPin = verify(order, h("wrong-external-pin"));
  assert.equal(wrongPin.ok, false);
  assert.match(wrongPin.error, /EXPECTED_WORK_ORDER_HASH_MISMATCH/u);
  assertHeld(wrongPin);
});

test("verifier rejects unknown projection fields even when the original stays frozen", () => {
  const order = createAutonomousWorkOrderProjection(input());
  const record = mutable(order);
  record.liveExecutionCallback = "https://invalid.example/callback";
  const result = verify(record, order.workOrderHash);
  assert.equal(result.ok, false);
  assert.match(result.error, /PROJECTION_FIELDS_INVALID/u);
  assertHeld(result);
  assert.equal(Object.hasOwn(order, "liveExecutionCallback"), false);
});

test("captured hash intrinsics prevent post-import self-hash substitution", () => {
  const value = input();
  const expected = createAutonomousWorkOrderProjection(value);
  const prototype = Object.getPrototypeOf(createHash("sha256"));
  const originalUpdate = prototype.update;
  const originalDigest = prototype.digest;
  try {
    prototype.update = function forgedUpdate() { throw new Error("poisoned update"); };
    prototype.digest = function forgedDigest() { return "0".repeat(64); };
    const rebuilt = createAutonomousWorkOrderProjection(value);
    assert.equal(rebuilt.workOrderHash, expected.workOrderHash);
    assert.equal(verify(rebuilt, expected.workOrderHash).ok, true);
  } finally {
    prototype.update = originalUpdate;
    prototype.digest = originalDigest;
  }
});
