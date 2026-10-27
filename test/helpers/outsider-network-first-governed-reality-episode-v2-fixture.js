import assert from "node:assert/strict";
import {
  createHash,
  sign as cryptoSign,
} from "node:crypto";

import { canonicalizeStrict } from "../../src/canonical.js";
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
  NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS,
  networkIntakeDigest,
} from "../../src/outsider-network-intake.js";
import {
  OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS,
} from "../../src/outsider-network-first-governed-reality-episode-v2.js";
import {
  OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS,
  OutsiderOutcomeWitnessAdapterRegistry,
  createOutsiderOutcomeWitnessAdapterDescriptor,
  createOutsiderOutcomeWitnessEnvelope,
  createOutsiderOutcomeWitnessSourceManifest,
} from "../../src/outsider-network-outcome-witness.js";
import {
  listProviderPatternEntities,
} from "../../src/outsider-provider-pattern-registry.js";
import {
  listRealitySourceCandidates,
} from "../../src/outsider-reality-source-scout.js";
import {
  createConsequenceReport,
  createRealityBoundary,
  createRealityExecutionReceipt,
  createStewardshipClaim,
} from "../../src/outsider-reality-stewardship.js";
import {
  createStage5BaseEpisode,
  createStage5CensusAndActor,
  createStage5NodeBundle,
  stage5Digest,
  stage5Hash as h,
  stage5KeyEpoch,
  stage5KeyId,
  stage5Pair,
} from "./outsider-network-stage5-fixture.js";

function radius() {
  return normalizeDelegationRadius({
    validity: { validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-29T00:00:00.000Z" },
    grants: [{ atom: "OBSERVE", scopeHashes: [h("observe-scope")],
      budget: { unitHash: h("observe-unit"), limit: "1" } }],
  });
}

function effectProjection(common, censusHash) {
  const effectRadius = radius();
  return { projection: buildEffectConsequenceReviewProjection({
    bindings: {
      claimWayWorld: { claimHash: common.claimHash, wayHash: common.wayHash,
        worldHash: common.worldHash },
      run: { episodeHash: common.episodeHash, attemptHash: common.attemptHash,
        censusHash },
      action: { proposedActionHash: h("proposed-action"),
        beforeStateHash: h("before-state"), adapterDescriptorHash: h("effect-adapter"),
        resourceTopologyHash: h("resource-topology"),
        projectorPolicyHash: h("projector-policy") },
    },
    capabilityRadius: effectRadius,
    effectRadius,
    selectedProviderEntityIds: listProviderPatternEntities(),
    selectedOfficialSourceCandidateIds: listRealitySourceCandidates(),
  }), context: { capabilityRadius: effectRadius, effectRadius } };
}

function relationshipRoots(identity) {
  const envelope = identity.envelope;
  return [envelope.actorIdentityEnvelopeHash, envelope.actorSubjectHash,
    envelope.attemptActorSubjectHash, envelope.principalEpochProjectionHash,
    envelope.deploymentLineageProjectionHash,
    envelope.runtimeInstance.runtimeInstanceHash,
    envelope.principalEpoch.controllerKeyRefHash,
    envelope.deploymentRevision.providerRootHash,
    envelope.principalEpoch.trustDomainRefHash].sort();
}

function signRelationshipReview(body, signer) {
  const reviewHash = stage5Digest(
    OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview, body);
  return { ...body, reviewHash,
    signature: { algorithm: "Ed25519", keyId: stage5KeyId(signer.publicKey),
      value: cryptoSign(null, Buffer.from(reviewHash), signer.privateKey)
        .toString("base64") } };
}

function makeTrustPolicy(body) {
  return { ...body, policyHash: stage5Digest(
    OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy, body) };
}

function cas(snapshot, commandId, occurredAt, extra = {}) {
  return { commandId, expectedRevision: snapshot.revision,
    expectedStateHash: snapshot.stateHash, occurredAt, ...extra };
}

export function createFirstGovernedRealityEpisodeV2Fixture(t, {
  executionAt = "2026-08-28T00:00:00.001Z",
} = {}) {
  const preActionCoverageRoots = [h("pre-action-affected-owner"),
    h("pre-action-potential-bystander")].sort();
  const outcomeCoverageRoots = [h("outcome-observed-owner"),
    h("outcome-observed-neighbor-class")].sort();
  const provisional = { claimHash: h("provisional-claim"), wayHash: h("way"),
    worldHash: h("world"), episodeHash: h("episode"), attemptHash: h("attempt"),
    cohortHash: h("cohort"), slotHash: h("slot"),
    registrationHash: h("registration") };
  const preliminaryEffect = effectProjection(provisional, h("provisional-census"));
  const selectedHorizonId = preliminaryEffect.projection.horizonHypotheses[0];
  assert.notEqual(selectedHorizonId, "immediate");
  const channelIds = preliminaryEffect.projection.channelHypotheses;
  /* The existing RealityBoundary protocol admits a bounded declared subset;
     the certificate preserves the remaining effect-review channels as an
     explicit non-closure gap instead of inventing a larger ontology. */
  const boundaryChannelIds = [channelIds[0]];
  const boundary = createRealityBoundary({
    boundaryId: "stage5-shared-reality",
    worldHash: provisional.worldHash,
    policyHash: h("reality-policy"),
    resourceOwnerRootHash: h("resource-owner"),
    affectedPartyRootHashes: preActionCoverageRoots,
    constraints: boundaryChannelIds.map((channelId) => ({ channelId,
      kind: "CUMULATIVE_CAP", unit: "impact-points", cap: 10,
      aggregation: "CUMULATIVE_MAX", nonCompensable: true,
      affectedPartyRootHashes: preActionCoverageRoots })),
    observationHorizons: [{ horizonId: "immediate", closesAfterMs: 0,
      mandatory: true }, { horizonId: selectedHorizonId, closesAfterMs: 1_000,
      mandatory: true }],
    challengePolicyHash: h("challenge-policy"),
    recoveryStandardHash: h("recovery-standard"),
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
  });
  const providerRoot = h("executing-provider");
  const claim = createStewardshipClaim({ boundary,
    claimIdHash: h("stewardship-claim-id"), wayHash: provisional.wayHash,
    claimantRootHash: h("claimant"), standingEvidenceHashes: [h("standing")],
    purpose: "WORK", operationHashes: [h("operation")],
    representedPartyRootHashes: preActionCoverageRoots,
    requestedExternalities: boundary.constraints.map(({ channelId }) => ({
      channelId, amount: 0 })),
    alternativesConsideredHashes: [h("simulation-alternative")],
    optionPreservationEvidenceHashes: [h("option-preservation")],
    recoveryPlanHash: h("recovery-plan"),
    responsibilityRootHashes: [h("accountable-principal"), providerRoot],
    requestedAt: "2026-08-27T12:00:00.000Z",
    expiresAt: "2026-08-29T12:00:00.000Z",
  });
  const common = { ...provisional, claimHash: claim.claimHash };
  const foundation = createStage5CensusAndActor(common, "actor");
  const preActionEffect = effectProjection(common, common.registrationHash);
  const outcomeEffect = effectProjection(common,
    foundation.censusProjection.projectionHash);
  assert.deepEqual(preActionEffect.projection.channelHypotheses, channelIds);
  assert.deepEqual(outcomeEffect.projection.channelHypotheses, channelIds);
  assert.ok(preActionEffect.projection.horizonHypotheses.includes(selectedHorizonId));
  assert.ok(outcomeEffect.projection.horizonHypotheses.includes(selectedHorizonId));
  const preActionAffectedPartyDeclarationSource =
    createAffectedPartyRegisterSource({
    subjectBindings: { claimHash: common.claimHash, wayHash: common.wayHash,
      worldHash: common.worldHash, episodeHash: common.episodeHash,
      attemptHash: common.attemptHash,
      censusHash: common.registrationHash },
    beforeStateHash: preActionEffect.projection.bindings.action.beforeStateHash,
    effectConsequenceReviewProjection: preActionEffect.projection,
    effectReviewContext: preActionEffect.context,
    matraixReviewRefs: [{ sourceId: "MATRAIX_PERSONA_REVIEW",
      projectionHash: h("pre-action-matraix-review") }],
    coverageSubjects: [{ coverageSubjectRefHash: preActionCoverageRoots[0],
      partyClass: "DIRECT_AFFECTED_PARTY",
      standingBasisReviewRefHash: h("pre-action-owner-standing-review"),
      channelIds }, { coverageSubjectRefHash: preActionCoverageRoots[1],
      partyClass: "POTENTIAL_BYSTANDER_CLASS",
      standingBasisReviewRefHash: null, channelIds }],
  });
  const preActionAffectedPartyDeclaration = buildAffectedPartyRegister(
    preActionAffectedPartyDeclarationSource);
  const outcomeAffectedPartyRegisterSource = createAffectedPartyRegisterSource({
    subjectBindings: { claimHash: common.claimHash, wayHash: common.wayHash,
      worldHash: common.worldHash, episodeHash: common.episodeHash,
      attemptHash: common.attemptHash,
      censusHash: foundation.censusProjection.projectionHash },
    beforeStateHash: outcomeEffect.projection.bindings.action.beforeStateHash,
    effectConsequenceReviewProjection: outcomeEffect.projection,
    effectReviewContext: outcomeEffect.context,
    matraixReviewRefs: [{ sourceId: "MATRAIX_PERSONA_REVIEW",
      projectionHash: h("outcome-matraix-review") }],
    coverageSubjects: [{ coverageSubjectRefHash: outcomeCoverageRoots[0],
      partyClass: "DIRECT_AFFECTED_PARTY",
      standingBasisReviewRefHash: h("outcome-owner-standing-review"),
      channelIds }, { coverageSubjectRefHash: outcomeCoverageRoots[1],
      partyClass: "POTENTIAL_BYSTANDER_CLASS",
      standingBasisReviewRefHash: null, channelIds }],
  });
  const outcomeAffectedPartyRegister = buildAffectedPartyRegister(
    outcomeAffectedPartyRegisterSource);
  assert.notEqual(preActionAffectedPartyDeclaration.affectedPartyRootHash,
    outcomeAffectedPartyRegister.affectedPartyRootHash);
  const outcomeAffectedPartyHorizon =
    outcomeAffectedPartyRegister.mandatoryHorizonRows.find(
    ({ horizonId }) => horizonId === selectedHorizonId);
  assert.ok(outcomeAffectedPartyHorizon);
  const executionEvidenceHash = h("execution-evidence");
  const execution = createRealityExecutionReceipt({ boundary, claim,
    ownerGateReceiptHash: h("owner-gate-receipt-reference"), executionEvidenceHash,
    providerRootHash: providerRoot,
    responsibilityRootHashes: [...claim.responsibilityRootHashes,
      h("successor-provider")],
    executedAt: executionAt });
  const base = createStage5BaseEpisode(t, { common, foundation,
    affectedPartyRootHash:
      preActionAffectedPartyDeclaration.affectedPartyRootHash,
    consequenceChannelHashes: preActionAffectedPartyDeclaration.effectChannelRows.map(
      ({ channelHash }) => channelHash),
    horizonId: selectedHorizonId, horizonDueAfterMs: 1_000,
    executionEvidenceHash });
  const report = createConsequenceReport({ boundary, claim, execution,
    horizonId: selectedHorizonId, outcome: "SUCCESS",
    impactMeasurements: boundary.constraints.map(({ channelId }) => ({ channelId,
      amount: 0, measurementEvidenceHash: h(`measurement:${channelId}`) })),
    affectedPartyReports: preActionCoverageRoots.map(
      (affectedPartyRootHash, index) => ({
      affectedPartyRootHash, reportHash: h(`affected-report:${index}`),
      disposition: "NO_REPORTED_IMPACT" })),
    causalStatus: "OBSERVATION", recoveryStatus: "NOT_REQUIRED",
    measurementEvidenceHashes: [h("measurement-evidence-set-member")],
    observedAt: "2026-08-28T00:10:00.000Z" });
  let later = base.store.activate(cas(base.obligation, "activate-stage5-obligation",
    "2026-08-28T00:00:00.000Z"));
  const activated = later;
  later = base.store.recordHorizonReport(cas(later, "record-stage5-delayed-report",
    "2026-08-28T00:10:30.000Z", { horizonId: selectedHorizonId,
      consequenceReportHash: report.consequenceHash }));
  const obligationHorizon = later.state.mandatoryHorizons.find(
    ({ horizonId }) => horizonId === selectedHorizonId);
  const affectedPartyReportSetHash = networkIntakeDigest(
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS.affectedPartyReportSet,
    report.affectedPartyReports);
  const normalizedObservationHash = networkIntakeDigest(
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS.normalizedObservation, {
      consequenceReportHash: report.consequenceHash,
      affectedPartyReportSetHash,
      recoveryEvidenceSetHash: null,
      horizonId: report.horizonId,
      observedAt: report.observedAt,
    });
  const observation = { role: "RESOURCE_OWNER_READBACK",
    observationStatus: "OBSERVED", observedAt: report.observedAt,
    normalizedObservationHash, consequenceReportHash: report.consequenceHash,
    affectedPartyReportSetHash, recoveryEvidenceSetHash: null };
  const sourceObjects = [{ objectId: "resource-owner-readback",
    immutableVersion: "revision-17",
    bytes: Buffer.from(JSON.stringify(observation), "utf8") }];
  const sourceManifest = createOutsiderOutcomeWitnessSourceManifest({
    sourceId: "resource-owner-instrument-feed",
    sourceClass: "RESOURCE_OWNER_READBACK", objects: sourceObjects,
    rightsReviewHash: h("witness-rights-review"),
    privacyReviewHash: h("witness-privacy-review"), retentionDays: 30 });
  const descriptor = createOutsiderOutcomeWitnessAdapterDescriptor({
    adapterId:
      OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS.JSON_OBSERVATION_V1,
    adapterVersion: "1.0.0",
    sourceClass: sourceManifest.sourceClass,
    sourceSchema: { mediaType: "application/json", record: "observation-v1" },
    instrumentHash: h("witness-instrument") });
  const registry = new OutsiderOutcomeWitnessAdapterRegistry();
  registry.register({ descriptor,
    sourceSchema: { mediaType: "application/json", record: "observation-v1" } });
  const witnessFoundation = createStage5CensusAndActor(common, "witness");
  const witnessIdentity = { source: witnessFoundation.actorSource,
    envelope: witnessFoundation.actorEnvelope };
  const actorIdentity = { source: foundation.actorSource,
    envelope: foundation.actorEnvelope };
  const target = { claimHash: common.claimHash, wayHash: common.wayHash,
    worldHash: common.worldHash, episodeHash: common.episodeHash,
    attemptHash: common.attemptHash, executionEvidenceHash };
  const horizon = { horizonId: selectedHorizonId,
    obligationHorizonCommitmentHash: obligationHorizon.horizonCommitmentHash,
    affectedPartyHorizonBindingHash: outcomeAffectedPartyHorizon.horizonHash };
  const replayReceipt = registry.replay({ adapterId: descriptor.adapterId,
    sourceManifest, sourceObjects, target, horizon, witnessIdentity });
  const witnessSigning = stage5Pair();
  const relationshipSigning = stage5Pair();
  const actorRoots = relationshipRoots(actorIdentity);
  const witnessRoots = relationshipRoots(witnessIdentity);
  const reviewBody = {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview,
    schemaVersion: "1.0.0", registryId: "stage5-relationship-registry",
    reviewId: "stage5-actor-witness-review-0001",
    actor: { identityEnvelopeHash: foundation.actorEnvelope.actorIdentityEnvelopeHash,
      subjectHash: foundation.actorEnvelope.actorSubjectHash,
      correlationRootHashes: actorRoots },
    witness: { identityEnvelopeHash:
        witnessFoundation.actorEnvelope.actorIdentityEnvelopeHash,
      subjectHash: witnessFoundation.actorEnvelope.actorSubjectHash,
      correlationRootHashes: witnessRoots },
    relationshipClassesReviewed:
      [...OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES].sort(),
    relationshipEvidenceSetHash: h("relationship-evidence-set"),
    finding: "NO_KNOWN_SHARED_CONTROL_WITHIN_DECLARED_SCOPE",
    issuedAt: "2026-08-28T00:09:00.000Z",
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
    issuerOrganizationHash: h("relationship-review-issuer"),
  };
  const relationshipReview = signRelationshipReview(reviewBody, relationshipSigning);
  const trustPolicy = makeTrustPolicy({
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy,
    expectedWitnessRegistryId: "stage5-witness-registry",
    expectedRelationshipRegistryId: relationshipReview.registryId,
    expectedActorIdentityEnvelopeHash: foundation.actorEnvelope.actorIdentityEnvelopeHash,
    expectedActorSubjectHash: foundation.actorEnvelope.actorSubjectHash,
    expectedActorCorrelationRootSetHash: stage5Digest(
      "outsider/outcome-witness-correlation-root-set/v1", actorRoots),
    expectedWitnessIdentityEnvelopeHash:
      witnessFoundation.actorEnvelope.actorIdentityEnvelopeHash,
    expectedWitnessActorSubjectHash: witnessFoundation.actorEnvelope.actorSubjectHash,
    expectedWitnessPrincipalEpochProjectionHash:
      witnessFoundation.actorEnvelope.principalEpochProjectionHash,
    expectedWitnessCorrelationRootSetHash: stage5Digest(
      "outsider/outcome-witness-correlation-root-set/v1", witnessRoots),
    expectedRelationshipReviewHash: relationshipReview.reviewHash,
    witnessSigningKeyEpochs: [stage5KeyEpoch(witnessSigning)],
    relationshipReviewIssuer: { organizationHash:
        relationshipReview.issuerOrganizationHash,
      keyEpochs: [stage5KeyEpoch(relationshipSigning)] },
    requiredRelationshipClasses:
      [...OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES].sort(),
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
  });
  const envelope = createOutsiderOutcomeWitnessEnvelope({ replayReceipt,
    witnessIdentity, relationshipReviewHash: relationshipReview.reviewHash,
    witnessRegistryId: trustPolicy.expectedWitnessRegistryId,
    signedAt: "2026-08-28T00:10:30.000Z" },
  { witnessPrivateKeyPem: witnessSigning.privateKey });
  const baseActionBundle = base.rows[2].bundle;
  const v2Payload = {
    schema: NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2,
    baseActionOutcomeManifestHash: baseActionBundle.preview.manifest.manifestHash,
    baseActionOutcomeBundleHash: baseActionBundle.bundleHash,
    baseActionOutcomeOccurrenceIdentityHash:
      baseActionBundle.preview.manifest.occurrenceIdentityHash,
    attemptRecordHash: common.attemptHash, executionEvidenceHash,
    observationStatus: "OBSERVED", outcomeWitnessEnvelopeHash: envelope.envelopeHash,
    witnessSourceManifestHash: sourceManifest.sourceManifestHash,
    witnessReplayReceiptHash: replayReceipt.replayReceiptHash,
    witnessRelationshipReviewHash: relationshipReview.reviewHash,
    consequenceReportHash: report.consequenceHash,
    affectedPartyRegisterRootHash:
      outcomeAffectedPartyRegister.affectedPartyRootHash,
    affectedPartyReportSetHash, recoveryEvidenceSetHash: null,
    obligationGenesisHash: later.genesis.genesisHash,
    obligationStateHash: later.stateHash, horizonId: selectedHorizonId,
    obligationHorizonCommitmentHash: obligationHorizon.horizonCommitmentHash,
    affectedPartyHorizonBindingHash: outcomeAffectedPartyHorizon.horizonHash,
    observedAt: report.observedAt, externalOutcomeVerified: false,
    causalAttributionEstablished: false, obligationClosed: false,
  };
  const successorRow = createStage5NodeBundle({ lane: "ACTION_OUTCOME",
    subject: base.materializedSubject, payload: v2Payload,
    source: { sourceManifestHash: sourceManifest.sourceManifestHash,
      instrumentHash: descriptor.instrumentHash,
      rightsReviewHash: sourceManifest.rightsReviewHash,
      privacyReviewHash: sourceManifest.privacyReviewHash },
    clientSubmissionId: "stage5_action_outcome_witness_successor",
    createdAt: "2026-08-28T00:11:00.000Z", ordinal: 4 });
  const input = {
    baseEpisode: { join: base.join, input: base.input },
    outcomeWitness: { nodeSubmissionBundle: successorRow.bundle, witnessIdentity,
      sourceManifest, sourceObjects, relationshipReview, envelope },
    preActionAffectedPartyDeclaration: {
      source: preActionAffectedPartyDeclarationSource,
      register: preActionAffectedPartyDeclaration,
    },
    outcomeAffectedPartyRegister: {
      source: outcomeAffectedPartyRegisterSource,
      register: outcomeAffectedPartyRegister,
    },
    consequence: { boundary, claim, execution, report },
    laterObligationPrefix: { directory: base.directory,
      expectedRevision: later.revision, expectedStateHash: later.stateHash,
      expectedGenesisHash: later.genesis.genesisHash },
  };
  const context = { baseLaneTrust: base.laneTrust,
    expectedBaseJoinHash: base.join.joinHash,
    outcomeWitnessNetworkTrust: { expectedBundleHash: successorRow.bundle.bundleHash,
      trustPolicy: successorRow.trustRow.trustPolicy },
    outcomeWitnessTrustPolicy: trustPolicy,
    outcomeWitnessAdapterRegistry: registry,
    outcomeWitnessAdapterId: descriptor.adapterId };
  return { common, foundation, boundary, claim, execution, report, base,
    activated, later,
    preActionCoverageRoots, outcomeCoverageRoots,
    preActionAffectedPartyDeclarationSource, preActionAffectedPartyDeclaration,
    outcomeAffectedPartyRegisterSource, outcomeAffectedPartyRegister,
    outcomeAffectedPartyHorizon, obligationHorizon,
    sourceObjects, sourceManifest, descriptor, registry, witnessIdentity,
    relationshipReview, trustPolicy, envelope, successorRow, v2Payload, input, context };
}
