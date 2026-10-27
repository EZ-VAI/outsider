import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS,
  createAutonomousWorkOrderDeclarationSource,
  createAutonomousWorkOrderSourceReplayReceipt,
  verifyAutonomousWorkOrderDeclarationSource,
  verifyAutonomousWorkOrderSourceReplayReceipt,
} from "../src/outsider-autonomous-work-order-source-replay.js";
import {
  createAutonomousWorkOrderSourceReplayFixture,
} from "./helpers/outsider-autonomous-work-order-source-replay-fixture.js";
import {
  stage5Hash,
} from "./helpers/outsider-network-stage5-fixture.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;

function projectionInput() {
  const provider = h("stage1b-provider");
  return {
    orderId: "awo_11111111111111111111111111111111",
    recordedAt: "2026-09-01T00:00:00.000Z",
    appendOnlyLineage: {
      revision: 0,
      predecessorProjectionHash: null,
      supersedesProjectionHash: null,
    },
    typedGraph: {
      principalEpoch: {
        principalRefHash: h("stage1b-principal"),
        epochRefHash: h("stage1b-principal-epoch"),
        principalEpochProjectionHash: h("stage1b-principal-epoch-projection"),
      },
      accountableDeployment: {
        deploymentLineageRefHash: h("stage1b-deployment-lineage"),
        deploymentRevisionHash: h("stage1b-deployment-revision"),
        accountableDeploymentSubjectHash: h("stage1b-deployment-subject"),
      },
      runtime: {
        runtimeInstanceRefHash: h("stage1b-runtime-ref"),
        runtimeInstanceHash: h("stage1b-runtime"),
      },
      embodiment: {
        present: false,
        deviceLineageRefHash: null,
        embodimentRevisionHash: null,
      },
      delegation: {
        delegationEvidenceRefHash: h("stage1b-delegation-evidence"),
        delegationEdgeHash: h("stage1b-delegation-edge"),
      },
      episode: {
        episodeHash: h("stage1b-episode"),
        networkCompleteEpisodeJoinHash: h("stage1b-complete-episode-join"),
      },
      attempt: {
        attemptHash: h("stage1b-attempt"),
        attemptActorSubjectHash: h("stage1b-attempt-actor"),
      },
    },
    contractReferences: {
      actorIdentityEnvelopeHash: h("stage1b-actor-envelope"),
      realitySemanticBundleHash: h("stage1b-semantic-bundle"),
      realityObligationGenesisHash: h("stage1b-obligation-genesis"),
      realityObligationStateHash: h("stage1b-obligation-state"),
      affectedPartyRootHash: h("stage1b-affected-party-root"),
      outcomeWitnessEnvelopeHash: null,
    },
    resourceOwner: {
      resourceOwnerRefHash: h("stage1b-resource-owner"),
      ownerAdoptionEvidenceRefHash: null,
      externalAdoptionEstablished: false,
    },
    promisedOutcome: {
      promisedOutcomeRefHash: h("stage1b-promised-outcome"),
      acceptanceCriteriaHash: h("stage1b-acceptance"),
      outcomeWitnessRequirementHash: h("stage1b-witness-requirement"),
      consequenceChannelHashes: [h("stage1b-channel-a"), h("stage1b-channel-b")],
    },
    observationHorizons: [{
      horizonId: "immediate",
      dueAfterMs: 0,
      observationRequirementHash: h("stage1b-observe-immediate"),
      mandatory: true,
    }, {
      horizonId: "delayed",
      dueAfterMs: 86_400_000,
      observationRequirementHash: h("stage1b-observe-delayed"),
      mandatory: true,
    }],
    obligors: [{
      obligorRefHash: provider,
      role: "PRIMARY_PERFORMANCE",
      obligationRefHash: h("stage1b-performance-obligation"),
    }, {
      obligorRefHash: provider,
      role: "RECOVERY",
      obligationRefHash: h("stage1b-recovery-obligation"),
    }],
    remedyMenu: [{
      remedyId: "reperform",
      kind: "REPERFORM",
      remedyTermsHash: h("stage1b-reperform-terms"),
      obligorRefHashes: [provider],
    }],
    protectionFunding: { status: "NONE" },
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
      roleScopedProofPolicyHash: h("stage1b-proof-policy"),
      redactionPolicyHash: h("stage1b-redaction-policy"),
    },
  };
}

function declaration() {
  return createAutonomousWorkOrderDeclarationSource({
    projectionInput: projectionInput(),
    sourceReferences: {
      declarationObjectHash: h("stage1b-declaration-object"),
      rightsReviewHash: h("stage1b-rights-review"),
      privacyReviewHash: h("stage1b-privacy-review"),
    },
  });
}

test("replays the exact declaration without treating its hash as external acceptance", () => {
  const source = declaration();
  const checked = verifyAutonomousWorkOrderDeclarationSource(source, {
    expectedSourceHash: source.declarationSourceHash,
    expectedWorkOrderHash: source.derivedWorkOrderHash,
  });
  assert.equal(source.schema,
    AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.declarationSource);
  assert.equal(checked.ok, true);
  assert.equal(checked.canonicalDeclarationDerivationVerified, true);
  assert.equal(checked.exactSourceBytesReplayed, false);
  assert.equal(checked.externalContractAcceptanceEstablished, false);
  assert.equal(checked.sourceReplayVerified, false);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.equal(checked.executable, false);
  assert.deepEqual(checked.boundary,
    AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY);
});

test("caller-supplied source and work-order pins cannot be replaced by self hashes", () => {
  const source = declaration();
  const wrongSource = verifyAutonomousWorkOrderDeclarationSource(source, {
    expectedSourceHash: h("stage1b-wrong-declaration-source"),
    expectedWorkOrderHash: source.derivedWorkOrderHash,
  });
  const wrongOrder = verifyAutonomousWorkOrderDeclarationSource(source, {
    expectedSourceHash: source.declarationSourceHash,
    expectedWorkOrderHash: h("stage1b-wrong-work-order"),
  });
  assert.equal(wrongSource.ok, false);
  assert.equal(wrongOrder.ok, false);
  assert.equal(wrongSource.sourceReplayVerified, false);
  assert.equal(wrongOrder.sourceReplayVerified, false);
});

test("the v1 receipt refuses a materialized outcome witness before any child replay", () => {
  assert.throws(() => createAutonomousWorkOrderSourceReplayReceipt({
    declarationSource: {},
    workOrder: {},
    completeEpisode: { join: {}, input: {} },
    semantic: { bundle: {}, semanticPlan: {}, semanticPlanSource: {} },
    outcomeWitness: { envelopeHash: h("stage1b-forbidden-witness") },
  }, {}), /V1_OUTCOME_WITNESS_MUST_REMAIN_ABSENT/u);
});

test("the declaration input stays exact and cannot smuggle caller authority", () => {
  const input = {
    projectionInput: projectionInput(),
    sourceReferences: {
      declarationObjectHash: h("stage1b-declaration-object"),
      rightsReviewHash: h("stage1b-rights-review"),
      privacyReviewHash: h("stage1b-privacy-review"),
      authority: true,
    },
  };
  assert.throws(() => createAutonomousWorkOrderDeclarationSource(input),
    /DECLARATION_SOURCE_REFERENCES_FIELDS_INVALID/u);
});

test("replays the actor, census, three lanes and semantic rev0 without promoting the order", (t) => {
  const fixture = createAutonomousWorkOrderSourceReplayFixture(t);
  const checked = verifyAutonomousWorkOrderSourceReplayReceipt(fixture.receipt, {
    input: fixture.input,
    context: fixture.context,
    expectedReceiptHash: fixture.receipt.sourceReplayReceiptHash,
  });

  assert.equal(checked.ok, true);
  assert.equal(checked.receiptDerivationVerified, true);
  assert.equal(checked.networkCoreCanonicalReplayVerified, true);
  assert.equal(checked.networkCoreSourceReplayVerified, false);
  assert.equal(checked.trustPolicyExternalPinProvenanceEstablished, false);
  assert.equal(checked.sourceReplayVerified, false);
  assert.equal(checked.networkOrderEstablished, false);
  assert.equal(checked.independentOutcomeEstablished, false);
  assert.equal(checked.decisionState, "HOLD");
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.equal(checked.executable, false);
});

test("subject, lane-trust and semantic pins cannot be substituted during receipt replay", (t) => {
  const fixture = createAutonomousWorkOrderSourceReplayFixture(t);

  const subjectInput = structuredClone(fixture.input);
  subjectInput.completeEpisode.input.laneBundles[2].preview.manifest.subject
    .attemptHash = stage5Hash("stage1b:attacked-attempt");
  const subjectAttack = verifyAutonomousWorkOrderSourceReplayReceipt(
    fixture.receipt, {
      input: subjectInput,
      context: fixture.context,
      expectedReceiptHash: fixture.receipt.sourceReplayReceiptHash,
    });

  const laneContext = structuredClone(fixture.context);
  laneContext.laneTrust[0].expectedBundleHash =
    stage5Hash("stage1b:attacked-lane-bundle");
  const laneAttack = verifyAutonomousWorkOrderSourceReplayReceipt(
    fixture.receipt, {
      input: fixture.input,
      context: laneContext,
      expectedReceiptHash: fixture.receipt.sourceReplayReceiptHash,
    });

  const semanticContext = structuredClone(fixture.context);
  semanticContext.semantic.expectedBundleHash =
    stage5Hash("stage1b:attacked-semantic-bundle");
  const semanticAttack = verifyAutonomousWorkOrderSourceReplayReceipt(
    fixture.receipt, {
      input: fixture.input,
      context: semanticContext,
      expectedReceiptHash: fixture.receipt.sourceReplayReceiptHash,
    });

  for (const checked of [subjectAttack, laneAttack, semanticAttack]) {
    assert.equal(checked.ok, false);
    assert.equal(checked.networkCoreSourceReplayVerified, false);
    assert.equal(checked.sourceReplayVerified, false);
    assert.equal(checked.networkOrderEstablished, false);
    assert.equal(checked.independentOutcomeEstablished, false);
    assert.equal(checked.decisionState, "HOLD");
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
    assert.equal(checked.executable, false);
  }
});

test("receipt verification requires a caller-supplied exact receipt pin", (t) => {
  const fixture = createAutonomousWorkOrderSourceReplayFixture(t);
  const checked = verifyAutonomousWorkOrderSourceReplayReceipt(fixture.receipt, {
    input: fixture.input,
    context: fixture.context,
    expectedReceiptHash: stage5Hash("stage1b:wrong-receipt-pin"),
  });

  assert.equal(checked.ok, false);
  assert.equal(checked.receiptDerivationVerified, false);
  assert.equal(checked.networkCoreSourceReplayVerified, false);
  assert.equal(checked.sourceReplayVerified, false);
  assert.equal(checked.networkOrderEstablished, false);
  assert.equal(checked.decisionState, "HOLD");
  assert.match(checked.error, /EXPECTED_SOURCE_REPLAY_RECEIPT_HASH_MISMATCH/u);
});

test("declaration self-hashes remain stable after Hash prototype poisoning", (t) => {
  const fixture = createAutonomousWorkOrderSourceReplayFixture(t);
  const prototype = Object.getPrototypeOf(createHash("sha256"));
  const originalUpdate = prototype.update;
  const originalDigest = prototype.digest;
  try {
    prototype.update = function poisonedUpdate() {
      throw new Error("POISONED_HASH_UPDATE");
    };
    prototype.digest = function poisonedDigest() {
      throw new Error("POISONED_HASH_DIGEST");
    };
    const recreated = createAutonomousWorkOrderDeclarationSource({
      projectionInput: fixture.projectionInput,
      sourceReferences: {
        declarationObjectHash:
          fixture.declarationSource.sourceReferences.declarationObjectHash,
        rightsReviewHash:
          fixture.declarationSource.sourceReferences.rightsReviewHash,
        privacyReviewHash:
          fixture.declarationSource.sourceReferences.privacyReviewHash,
      },
    });
    assert.deepEqual(recreated, fixture.declarationSource);
  } finally {
    prototype.update = originalUpdate;
    prototype.digest = originalDigest;
  }
});
