import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildAffectedPartyRegister,
  createAffectedPartyRegisterSource,
} from "../../src/outsider-affected-party-register.js";
import {
  normalizeDelegationRadius,
} from "../../src/outsider-delegation-radius.js";
import {
  buildEffectConsequenceReviewProjection,
} from "../../src/outsider-effect-consequence-review.js";
import {
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
} from "../../src/outsider-network-intake.js";
import {
  createOutsiderNetworkCompleteEpisodeJoin,
} from "../../src/outsider-network-complete-episode.js";
import {
  listProviderPatternEntities,
} from "../../src/outsider-provider-pattern-registry.js";
import {
  buildRealitySemanticBundle,
  createRealitySemanticObligation,
  createRealitySemanticPlan,
} from "../../src/outsider-reality-semantic-bundle.js";
import {
  buildResponsibilityGraph,
  createResponsibilityGraphSource,
} from "../../src/outsider-responsibility-graph.js";
import {
  listRealitySourceCandidates,
} from "../../src/outsider-reality-source-scout.js";
import {
  createAutonomousWorkOrderProjection,
} from "../../src/outsider-autonomous-work-order.js";
import {
  createAutonomousWorkOrderDeclarationSource,
  createAutonomousWorkOrderSourceReplayReceipt,
} from "../../src/outsider-autonomous-work-order-source-replay.js";
import {
  createStage5CensusAndActor,
  createStage5NodeBundle,
  stage5Digest,
  stage5Hash,
} from "./outsider-network-stage5-fixture.js";

function radius(seed) {
  return normalizeDelegationRadius({
    validity: {
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-30T00:00:00.000Z",
    },
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [stage5Hash(`${seed}:scope`)],
      budget: { unitHash: stage5Hash(`${seed}:unit`), limit: "1" },
    }],
  });
}

function actorPrincipalEpochProjectionHash(prefix) {
  return stage5Digest("outsider/actor-principal-epoch-projection/v1", {
    principalRefHash: stage5Hash(`${prefix}:principal`),
    epochRefHash: stage5Hash(`${prefix}:principal-epoch`),
    trustDomainRefHash: stage5Hash(`${prefix}:trust-domain`),
    controllerKeyRefHash: stage5Hash(`${prefix}:controller-key`),
    credentialRefHash: stage5Hash(`${prefix}:credential`),
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
    assurance: {
      class: "LEGAL_BINDING_REFERENCE",
      evidenceRefHash: stage5Hash(`${prefix}:assurance:principal`),
      effectiveAssurance: "UNVERIFIED_REFERENCE_ONLY",
      externallyEstablished: false,
    },
  });
}

function actorDelegationEdge(prefix, accountableDeploymentSubjectHash) {
  const delegationRadius = radius(`${prefix}:delegation`);
  return {
    parent: {
      kind: "PRINCIPAL_EPOCH",
      refHash: actorPrincipalEpochProjectionHash(prefix),
    },
    child: {
      kind: "ACCOUNTABLE_DEPLOYMENT",
      refHash: accountableDeploymentSubjectHash,
    },
    parentRadius: delegationRadius,
    childRadius: delegationRadius,
    delegationEvidenceRefHash: stage5Hash(`${prefix}:delegation-evidence`),
    assurance: {
      class: "SOURCE_REPLAYED_REFERENCE",
      evidenceRefHash: stage5Hash(`${prefix}:delegation-assurance`),
    },
  };
}

function effectFixture(common) {
  const capabilityRadius = radius("stage1b:capability");
  const effectRadius = capabilityRadius;
  const bindings = {
    claimWayWorld: {
      claimHash: common.claimHash,
      wayHash: common.wayHash,
      worldHash: common.worldHash,
    },
    run: {
      episodeHash: common.episodeHash,
      attemptHash: common.attemptHash,
      censusHash: common.registrationHash,
    },
    action: {
      proposedActionHash: stage5Hash("stage1b:proposed-action"),
      beforeStateHash: stage5Hash("stage1b:before-state"),
      adapterDescriptorHash: stage5Hash("stage1b:adapter"),
      resourceTopologyHash: stage5Hash("stage1b:resource-topology"),
      projectorPolicyHash: stage5Hash("stage1b:projector-policy"),
    },
  };
  const projection = buildEffectConsequenceReviewProjection({
    bindings,
    capabilityRadius,
    effectRadius,
    selectedProviderEntityIds: listProviderPatternEntities(),
    selectedOfficialSourceCandidateIds: listRealitySourceCandidates(),
  });
  return {
    projection,
    context: { capabilityRadius, effectRadius },
  };
}

function coverageSubject(seed, partyClass, channelIds) {
  const hasStandingReview = partyClass === "DIRECT_AFFECTED_PARTY"
    || partyClass === "INDIRECT_AFFECTED_PARTY";
  return {
    coverageSubjectRefHash: stage5Hash(`${seed}:coverage-subject`),
    partyClass,
    standingBasisReviewRefHash: hasStandingReview
      ? stage5Hash(`${seed}:standing-review`) : null,
    channelIds,
  };
}

function dutyFor(kind, subjectRefHash, channelHash, horizonHash) {
  const key = `${kind}:${subjectRefHash}:${channelHash}:${horizonHash}`;
  return {
    dutyRefHash: stage5Hash(`stage1b:duty:${key}`),
    dutyKind: "PRESERVE_EVIDENCE",
    responsiblePartyRefHash: stage5Hash(`stage1b:responsible:${key}`),
    coverageSubjectKind: kind,
    coverageSubjectRefHash: subjectRefHash,
    channelHash,
    horizonHash,
    dutySourceRefHash: stage5Hash(`stage1b:duty-source:${key}`),
    policyRefHash: stage5Hash(`stage1b:policy:${key}`),
    budgetRefHash: stage5Hash(`stage1b:budget:${key}`),
    recoveryRefHash: stage5Hash(`stage1b:recovery:${key}`),
    challengeRefHash: stage5Hash(`stage1b:challenge:${key}`),
  };
}

function canonicalDuties(register) {
  const duties = [];
  for (const channel of register.coverageRows) {
    for (const subject of channel.partyCandidateRefHashes) {
      for (const horizon of register.mandatoryHorizonRows) {
        duties.push(dutyFor("PARTY", subject, channel.channelHash,
          horizon.horizonHash));
      }
    }
    for (const subject of channel.unresolvedClassRefHashes) {
      for (const horizon of register.mandatoryHorizonRows) {
        duties.push(dutyFor("UNRESOLVED_CLASS", subject, channel.channelHash,
          horizon.horizonHash));
      }
    }
  }
  return duties;
}

function semanticFixture(t, common, { identityHorizonIds = false } = {}) {
  const effect = effectFixture(common);
  const channelIds = effect.projection.channelHypotheses;
  const subjectBindings = {
    claimHash: common.claimHash,
    wayHash: common.wayHash,
    worldHash: common.worldHash,
    episodeHash: common.episodeHash,
    attemptHash: common.attemptHash,
    censusHash: common.registrationHash,
  };
  const affectedPartyRegisterSource = createAffectedPartyRegisterSource({
    subjectBindings,
    beforeStateHash: effect.projection.bindings.action.beforeStateHash,
    effectConsequenceReviewProjection: effect.projection,
    effectReviewContext: effect.context,
    matraixReviewRefs: [{
      sourceId: "MATRAIX_PERSONA_REVIEW",
      projectionHash: stage5Hash("stage1b:matraix-review"),
    }],
    coverageSubjects: [
      coverageSubject("stage1b:owner", "DIRECT_AFFECTED_PARTY", channelIds),
      coverageSubject("stage1b:unknown", "UNKNOWN_AFFECTED_CLASS", channelIds),
    ],
  });
  const affectedPartyRegister = buildAffectedPartyRegister(
    affectedPartyRegisterSource);
  const responsibilityGraphSource = createResponsibilityGraphSource({
    affectedPartyRegisterSourceHash: affectedPartyRegisterSource.sourceHash,
    affectedPartyRootHash: affectedPartyRegister.affectedPartyRootHash,
    effectConsequenceReviewProjectionHash:
      affectedPartyRegister.effectConsequenceReviewProjectionHash,
    beforeStateHash: affectedPartyRegister.beforeStateHash,
    subjectBindings: affectedPartyRegister.subjectBindings,
    reviewRefs: affectedPartyRegister.reviewRefs,
    duties: canonicalDuties(affectedPartyRegister),
  });
  const responsibilityGraph = buildResponsibilityGraph({
    source: responsibilityGraphSource,
    affectedPartyRegister,
    affectedPartyRegisterSource,
  });
  const horizonCrosswalk = affectedPartyRegister.mandatoryHorizonRows.map(
    (review, index) => ({
      reviewHorizonId: review.horizonId,
      reviewHorizonHash: review.horizonHash,
      obligation: {
        horizonId: identityHorizonIds
          ? review.horizonId
          : `stage1b-horizon-${String(index).padStart(2, "0")}`,
        dueAfterMs: index === 0 ? 0 : index * 60_000,
        observationRequirementHash:
          stage5Hash(`stage1b:observation:${review.horizonId}`),
        mandatory: true,
      },
    }));
  const source = {
    effectConsequenceReviewProjection: effect.projection,
    effectReviewContext: effect.context,
    affectedPartyRegisterSource,
    affectedPartyRegister,
    responsibilityGraphSource,
    responsibilityGraph,
    obligation: {
      obligationId: "stage1b-semantic-obligation",
      budgetCommitmentHash: stage5Hash("stage1b:budget-commitment"),
      recoveryPolicyHash: stage5Hash("stage1b:recovery-policy"),
      challengePolicyHash: stage5Hash("stage1b:challenge-policy"),
      createdAt: "2026-08-28T00:00:00.000Z",
      horizonCrosswalk,
    },
  };
  const plan = createRealitySemanticPlan(source);
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "outsider-stage1b-e2e-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const directory = path.join(temporaryRoot, "obligation");
  const snapshot = createRealitySemanticObligation({
    semanticPlan: plan,
    semanticPlanSource: source,
    directory,
  });
  const bundle = buildRealitySemanticBundle({
    semanticPlan: plan,
    semanticPlanSource: source,
    obligationDirectory: directory,
  });
  return { source, plan, directory, snapshot, bundle };
}

function networkFixture(common, foundation, semantic) {
  const actor = foundation.actorEnvelope;
  const subject = {
    claimHash: common.claimHash,
    wayHash: common.wayHash,
    worldHash: common.worldHash,
    episodeHash: common.episodeHash,
    attemptHash: common.attemptHash,
    actorIdentityEnvelopeHash: actor.actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash: actor.actorSubjectHash,
    attemptActorSubjectHash: actor.attemptActorSubjectHash,
    cohortHash: common.cohortHash,
    censusSlotHash: common.slotHash,
  };
  const censusSubject = structuredClone(
    foundation.censusProjection.networkProjection.subject);
  const censusPayload = structuredClone(
    foundation.censusProjection.networkProjection.payload);
  const delegationPayload = {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.DELEGATION_RESPONSIBILITY,
    accountableDeploymentSubjectHash: actor.actorSubjectHash,
    delegationEnvelopeHash: stage5Hash("stage1b:delegation-envelope"),
    capabilityRadiusHash: stage5Hash("stage1b:capability-radius"),
    authorityRadiusHash: stage5Hash("stage1b:authority-radius"),
    evidenceRadiusHash: stage5Hash("stage1b:evidence-radius"),
    responsibilityRadiusHash: stage5Hash("stage1b:responsibility-radius"),
    responsibilityCommitmentHash:
      stage5Hash("stage1b:responsibility-commitment"),
    ownerWriteGateConformanceHash: null,
    authorityEstablished: false,
    responsibilityCoverageEstablished: false,
  };
  const actionPayload = {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
    attemptRecordHash: common.attemptHash,
    executionEvidenceHash: stage5Hash("stage1b:execution-evidence"),
    outcomeEvidenceHash: stage5Hash("stage1b:outcome-evidence"),
    obligationStateHash: semantic.snapshot.stateHash,
    sourceArtifactHash: stage5Hash("stage1b:source-artifact"),
    sourceReplayReferenceHash: stage5Hash("stage1b:source-replay-reference"),
    externalOutcomeVerified: false,
    causalAttributionEstablished: false,
    obligationClosed: false,
  };
  const adapterConformanceEvidenceTargets = {
    ACTOR_IDENTITY: actor.actorIdentityEnvelopeHash,
    COMMAND_EFFECT: actionPayload.executionEvidenceHash,
    DELEGATION_RESPONSIBILITY: delegationPayload.delegationEnvelopeHash,
    OBLIGATION_LIFECYCLE: semantic.snapshot.stateHash,
    OUTCOME_RECOVERY: actionPayload.outcomeEvidenceHash,
    PROSPECTIVE_CENSUS: foundation.censusProjection.projectionHash,
  };
  const rows = [
    createStage5NodeBundle({
      lane: "PROSPECTIVE_CENSUS",
      subject: censusSubject,
      payload: censusPayload,
      source: {
        sourceManifestHash: stage5Hash("stage1b:census-source"),
        instrumentHash: stage5Hash("stage1b:census-instrument"),
        rightsReviewHash: stage5Hash("stage1b:census-rights"),
        privacyReviewHash: stage5Hash("stage1b:census-privacy"),
      },
      clientSubmissionId: "stage1b_census_e2e",
      createdAt: "2026-08-28T00:00:00.000Z",
      ordinal: 1,
      adapterConformanceEvidenceTargets,
    }),
    createStage5NodeBundle({
      lane: "DELEGATION_RESPONSIBILITY",
      subject,
      payload: delegationPayload,
      source: {
        sourceManifestHash: stage5Hash("stage1b:delegation-source"),
        instrumentHash: stage5Hash("stage1b:delegation-instrument"),
        rightsReviewHash: stage5Hash("stage1b:delegation-rights"),
        privacyReviewHash: stage5Hash("stage1b:delegation-privacy"),
      },
      clientSubmissionId: "stage1b_delegation_e2e",
      createdAt: "2026-08-28T00:00:00.000Z",
      ordinal: 2,
      adapterConformanceEvidenceTargets,
    }),
    createStage5NodeBundle({
      lane: "ACTION_OUTCOME",
      subject,
      payload: actionPayload,
      source: {
        sourceManifestHash: stage5Hash("stage1b:action-source"),
        instrumentHash: stage5Hash("stage1b:action-instrument"),
        rightsReviewHash: stage5Hash("stage1b:action-rights"),
        privacyReviewHash: stage5Hash("stage1b:action-privacy"),
      },
      clientSubmissionId: "stage1b_action_e2e",
      createdAt: "2026-08-28T00:00:00.000Z",
      ordinal: 3,
      adapterConformanceEvidenceTargets,
    }),
  ];
  const input = {
    prospectiveCensus: {
      source: foundation.censusSource,
      projection: foundation.censusProjection,
    },
    actorIdentity: {
      source: foundation.actorSource,
      envelope: foundation.actorEnvelope,
    },
    laneBundles: rows.map(({ bundle }) => bundle),
    obligationPrefix: {
      directory: semantic.directory,
      expectedRevision: semantic.snapshot.revision,
      expectedStateHash: semantic.snapshot.stateHash,
      expectedGenesisHash: semantic.snapshot.genesis.genesisHash,
    },
  };
  const laneTrust = rows.map(({ trustRow }) => trustRow);
  const join = createOutsiderNetworkCompleteEpisodeJoin(input, { laneTrust });
  return { subject, rows, input, laneTrust, join };
}

function orderProjectionInput(common, foundation, semantic, network) {
  const actor = foundation.actorEnvelope;
  const delegation = actor.delegationEdges[0];
  return {
    orderId: "awo_22222222222222222222222222222222",
    recordedAt: "2026-09-01T00:00:00.000Z",
    appendOnlyLineage: {
      revision: 0,
      predecessorProjectionHash: null,
      supersedesProjectionHash: null,
    },
    typedGraph: {
      principalEpoch: {
        principalRefHash: actor.principalEpoch.principalRefHash,
        epochRefHash: actor.principalEpoch.epochRefHash,
        principalEpochProjectionHash: actor.principalEpochProjectionHash,
      },
      accountableDeployment: {
        deploymentLineageRefHash:
          actor.deploymentLineage.deploymentLineageRefHash,
        deploymentRevisionHash: actor.deploymentRevision.deploymentRevisionHash,
        accountableDeploymentSubjectHash: actor.actorSubjectHash,
      },
      runtime: {
        runtimeInstanceRefHash: actor.runtimeInstance.runtimeInstanceRefHash,
        runtimeInstanceHash: actor.runtimeInstance.runtimeInstanceHash,
      },
      embodiment: {
        present: false,
        deviceLineageRefHash: null,
        embodimentRevisionHash: null,
      },
      delegation: {
        delegationEvidenceRefHash: delegation.delegationEvidenceRefHash,
        delegationEdgeHash: delegation.delegationEdgeHash,
      },
      episode: {
        episodeHash: common.episodeHash,
        networkCompleteEpisodeJoinHash: network.join.joinHash,
      },
      attempt: {
        attemptHash: common.attemptHash,
        attemptActorSubjectHash: actor.attemptActorSubjectHash,
      },
    },
    contractReferences: {
      actorIdentityEnvelopeHash: actor.actorIdentityEnvelopeHash,
      realitySemanticBundleHash: semantic.bundle.bundleHash,
      realityObligationGenesisHash: semantic.snapshot.genesis.genesisHash,
      realityObligationStateHash: semantic.snapshot.stateHash,
      affectedPartyRootHash: semantic.bundle.affectedPartyRootHash,
      outcomeWitnessEnvelopeHash: null,
    },
    resourceOwner: {
      resourceOwnerRefHash: stage5Hash("stage1b:resource-owner"),
      ownerAdoptionEvidenceRefHash: null,
      externalAdoptionEstablished: false,
    },
    promisedOutcome: {
      promisedOutcomeRefHash: stage5Hash("stage1b:promised-outcome"),
      acceptanceCriteriaHash: stage5Hash("stage1b:acceptance-criteria"),
      outcomeWitnessRequirementHash:
        stage5Hash("stage1b:outcome-witness-requirement"),
      consequenceChannelHashes: semantic.bundle.channelCrosswalk.map(
        ({ obligationConsequenceChannelHash }) =>
          obligationConsequenceChannelHash),
    },
    observationHorizons: semantic.bundle.horizonCrosswalk.map(({ obligation }) => ({
      horizonId: obligation.horizonId,
      dueAfterMs: obligation.dueAfterMs,
      observationRequirementHash: obligation.observationRequirementHash,
      mandatory: obligation.mandatory,
    })),
    obligors: [{
      obligorRefHash: stage5Hash("stage1b:performer"),
      role: "PRIMARY_PERFORMANCE",
      obligationRefHash: stage5Hash("stage1b:performance-obligation"),
    }, {
      obligorRefHash: stage5Hash("stage1b:recovery-provider"),
      role: "RECOVERY",
      obligationRefHash: stage5Hash("stage1b:recovery-obligation"),
    }],
    remedyMenu: [{
      remedyId: "reperform",
      kind: "REPERFORM",
      remedyTermsHash: stage5Hash("stage1b:reperform-terms"),
      obligorRefHashes: [stage5Hash("stage1b:recovery-provider")],
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
      roleScopedProofPolicyHash: stage5Hash("stage1b:proof-access-policy"),
      redactionPolicyHash: stage5Hash("stage1b:redaction-policy"),
    },
  };
}

export function createAutonomousWorkOrderSourceReplayFixture(t, {
  commonOverrides = {},
  identityHorizonIds = false,
} = {}) {
  const common = {
    claimHash: stage5Hash("stage1b:claim"),
    wayHash: stage5Hash("stage1b:way"),
    worldHash: stage5Hash("stage1b:world"),
    episodeHash: stage5Hash("stage1b:episode"),
    attemptHash: stage5Hash("stage1b:attempt"),
    cohortHash: stage5Hash("stage1b:cohort"),
    slotHash: stage5Hash("stage1b:census-slot"),
    registrationHash: stage5Hash("stage1b:registration"),
    ...commonOverrides,
  };
  const preliminaryFoundation = createStage5CensusAndActor(common, "stage1b-actor");
  const foundation = createStage5CensusAndActor(common, "stage1b-actor", {
    delegationEdges: [actorDelegationEdge("stage1b-actor",
      preliminaryFoundation.actorEnvelope.actorSubjectHash)],
  });
  const semantic = semanticFixture(t, common, { identityHorizonIds });
  const network = networkFixture(common, foundation, semantic);
  const projectionInput = orderProjectionInput(common, foundation, semantic,
    network);
  const workOrder = createAutonomousWorkOrderProjection(projectionInput);
  const declarationSource = createAutonomousWorkOrderDeclarationSource({
    projectionInput,
    sourceReferences: {
      declarationObjectHash: stage5Hash("stage1b:declaration-object"),
      rightsReviewHash: stage5Hash("stage1b:declaration-rights-review"),
      privacyReviewHash: stage5Hash("stage1b:declaration-privacy-review"),
    },
  });
  const input = {
    declarationSource,
    workOrder,
    completeEpisode: { join: network.join, input: network.input },
    semantic: {
      bundle: semantic.bundle,
      semanticPlan: semantic.plan,
      semanticPlanSource: semantic.source,
    },
    outcomeWitness: null,
  };
  const context = {
    expectedDeclarationSourceHash: declarationSource.declarationSourceHash,
    expectedWorkOrderHash: workOrder.workOrderHash,
    expectedActorSourceHash: foundation.actorSource.sourceHash,
    expectedActorEnvelopeHash: foundation.actorEnvelope.actorIdentityEnvelopeHash,
    expectedCensusSourceHash: foundation.censusSource.sourceHash,
    expectedCensusProjectionHash: foundation.censusProjection.projectionHash,
    expectedCompleteEpisodeJoinHash: network.join.joinHash,
    laneTrust: network.laneTrust,
    semantic: {
      obligationDirectory: semantic.directory,
      expectedSemanticPlanHash: semantic.plan.semanticPlanHash,
      expectedObligationGenesisHash: semantic.snapshot.genesis.genesisHash,
      expectedObligationStateHash: semantic.snapshot.stateHash,
      expectedBundleHash: semantic.bundle.bundleHash,
    },
  };
  const receipt = createAutonomousWorkOrderSourceReplayReceipt(input, context);
  return {
    common,
    foundation,
    semantic,
    network,
    projectionInput,
    declarationSource,
    workOrder,
    input,
    context,
    receipt,
  };
}
