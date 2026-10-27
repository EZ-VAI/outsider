import assert from "node:assert/strict";
import {
  createHash,
  sign as cryptoSign,
} from "node:crypto";
import { readdirSync } from "node:fs";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildAffectedPartyRegister,
  createAffectedPartyRegisterSource,
} from "../src/outsider-affected-party-register.js";
import {
  normalizeDelegationRadius,
} from "../src/outsider-delegation-radius.js";
import {
  buildEffectConsequenceReviewProjection,
} from "../src/outsider-effect-consequence-review.js";
import {
  NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS,
  networkIntakeDigest,
} from "../src/outsider-network-intake.js";
import {
  OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_BOUNDARY,
  OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS,
  createOutsiderFirstGovernedRealityEpisodeCertificate,
  verifyOutsiderFirstGovernedRealityEpisodeCertificate,
} from "../src/outsider-network-first-governed-reality-episode.js";
import {
  OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS,
  OutsiderOutcomeWitnessAdapterRegistry,
  createOutsiderOutcomeWitnessAdapterDescriptor,
  createOutsiderOutcomeWitnessEnvelope,
  createOutsiderOutcomeWitnessSourceManifest,
} from "../src/outsider-network-outcome-witness.js";
import {
  listProviderPatternEntities,
} from "../src/outsider-provider-pattern-registry.js";
import {
  listRealitySourceCandidates,
} from "../src/outsider-reality-source-scout.js";
import {
  createConsequenceReport,
  createRealityBoundary,
  createRealityExecutionReceipt,
  createStewardshipClaim,
} from "../src/outsider-reality-stewardship.js";
import {
  createStage5BaseEpisode,
  createStage5CensusAndActor,
  createStage5NodeBundle,
  stage5Digest,
  stage5Hash as h,
  stage5KeyEpoch,
  stage5KeyId,
  stage5Pair,
} from "./helpers/outsider-network-stage5-fixture.js";

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

function stage5Fixture(t) {
  const coverageRoots = [h("affected-owner"), h("potential-bystander")].sort();
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
    affectedPartyRootHashes: coverageRoots,
    constraints: boundaryChannelIds.map((channelId) => ({ channelId,
      kind: "CUMULATIVE_CAP", unit: "impact-points", cap: 10,
      aggregation: "CUMULATIVE_MAX", nonCompensable: true,
      affectedPartyRootHashes: coverageRoots })),
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
    representedPartyRootHashes: coverageRoots,
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
  const effect = effectProjection(common, foundation.censusProjection.projectionHash);
  assert.deepEqual(effect.projection.channelHypotheses, channelIds);
  assert.ok(effect.projection.horizonHypotheses.includes(selectedHorizonId));
  const affectedSource = createAffectedPartyRegisterSource({
    subjectBindings: { claimHash: common.claimHash, wayHash: common.wayHash,
      worldHash: common.worldHash, episodeHash: common.episodeHash,
      attemptHash: common.attemptHash,
      censusHash: foundation.censusProjection.projectionHash },
    beforeStateHash: effect.projection.bindings.action.beforeStateHash,
    effectConsequenceReviewProjection: effect.projection,
    effectReviewContext: effect.context,
    matraixReviewRefs: [{ sourceId: "MATRAIX_PERSONA_REVIEW",
      projectionHash: h("matraix-review") }],
    coverageSubjects: [{ coverageSubjectRefHash: coverageRoots[0],
      partyClass: "DIRECT_AFFECTED_PARTY",
      standingBasisReviewRefHash: h("owner-standing-review"),
      channelIds }, { coverageSubjectRefHash: coverageRoots[1],
      partyClass: "POTENTIAL_BYSTANDER_CLASS",
      standingBasisReviewRefHash: null, channelIds }],
  });
  const affectedRegister = buildAffectedPartyRegister(affectedSource);
  const affectedHorizon = affectedRegister.mandatoryHorizonRows.find(
    ({ horizonId }) => horizonId === selectedHorizonId);
  assert.ok(affectedHorizon);
  const executionEvidenceHash = h("execution-evidence");
  const execution = createRealityExecutionReceipt({ boundary, claim,
    ownerGateReceiptHash: h("owner-gate-receipt-reference"), executionEvidenceHash,
    providerRootHash: providerRoot,
    responsibilityRootHashes: [...claim.responsibilityRootHashes,
      h("successor-provider")],
    executedAt: "2026-08-28T00:00:00.000Z" });
  const base = createStage5BaseEpisode(t, { common, foundation,
    affectedPartyRootHash: affectedRegister.affectedPartyRootHash,
    consequenceChannelHashes: affectedRegister.effectChannelRows.map(
      ({ channelHash }) => channelHash),
    horizonId: selectedHorizonId, horizonDueAfterMs: 1_000,
    executionEvidenceHash });
  const report = createConsequenceReport({ boundary, claim, execution,
    horizonId: selectedHorizonId, outcome: "SUCCESS",
    impactMeasurements: boundary.constraints.map(({ channelId }) => ({ channelId,
      amount: 0, measurementEvidenceHash: h(`measurement:${channelId}`) })),
    affectedPartyReports: coverageRoots.map((affectedPartyRootHash, index) => ({
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
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.affectedPartyReportSet,
    report.affectedPartyReports);
  const normalizedObservationHash = networkIntakeDigest(
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.normalizedObservation, {
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
    affectedPartyHorizonBindingHash: affectedHorizon.horizonHash };
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
    affectedPartyRegisterRootHash: affectedRegister.affectedPartyRootHash,
    affectedPartyReportSetHash, recoveryEvidenceSetHash: null,
    obligationGenesisHash: later.genesis.genesisHash,
    obligationStateHash: later.stateHash, horizonId: selectedHorizonId,
    obligationHorizonCommitmentHash: obligationHorizon.horizonCommitmentHash,
    affectedPartyHorizonBindingHash: affectedHorizon.horizonHash,
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
    affectedParty: { source: affectedSource, register: affectedRegister },
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
  return { common, boundary, claim, execution, report, base, activated, later,
    affectedSource, affectedRegister, affectedHorizon, obligationHorizon,
    sourceObjects, sourceManifest, descriptor, registry, witnessIdentity,
    relationshipReview, trustPolicy, envelope, successorRow, v2Payload, input, context };
}

function createCertificate(f) {
  return createOutsiderFirstGovernedRealityEpisodeCertificate(f.input, f.context);
}

function verifyCertificate(certificate, f, input = f.input,
  expectedCertificateHash = certificate.certificateHash) {
  return verifyOutsiderFirstGovernedRealityEpisodeCertificate(certificate, {
    input, expectedCertificateHash,
    ...f.context,
  });
}

test("one delayed v2 witness successor replays only the declared partial path HOLD-only",
  (t) => {
    const f = stage5Fixture(t);
    const beforeMembers = readdirSync(f.base.directory).sort();
    const certificate = createCertificate(f);
    const checked = verifyCertificate(certificate, f);
    assert.equal(checked.ok, true, checked.error);
    assert.equal(certificate.result,
      "PARTIAL_WITNESS_PATH_REPLAYED_HOLD");
    assert.equal(certificate.baseEpisode.actionOutcomeV1JoinPreserved, true);
    assert.equal(certificate.outcomeWitnessSuccessor.lane, "ACTION_OUTCOME");
    assert.equal(certificate.outcomeWitnessSuccessor.sameLaneDelayedSuccessor, true);
    assert.equal(certificate.sourceReplay.exactWitnessSourceBytesReplayed, true);
    assert.equal(
      certificate.sourceReplay.witnessAdapterProjectionSpecificationAndSchemaReplayed,
      true);
    assert.equal(
      certificate.sourceReplay.witnessAdapterImplementationOrCodeClosureReplayed,
      false);
    assert.equal(certificate.sourceReplay.secondActorIdentityEnvelopeSourceReplayed, true);
    assert.equal(certificate.roleSeparation.independencePolicyVerifiedWithinScope, true);
    assert.equal(certificate.roleSeparation.organizationalIndependenceEstablished, false);
    assert.equal(certificate.horizonAndObligationCrosswalk.delayedHorizonMatured, true);
    assert.equal(certificate.horizonAndObligationCrosswalk.obligationOutstanding, true);
    assert.ok(certificate.effectChannelGapCount > 0);
    assert.equal(certificate.effectChannelGapCount,
      certificate.affectedPartyCrosswalk.effectChannelGapCount);
    assert.equal(certificate.structuralResult.observedMatureHorizonPathComplete, false);
    assert.equal(certificate.structuralResult.firstGovernedRealityEpisodeWitnessPathReplayed,
      false);
    assert.equal(checked.effectChannelGapCount, certificate.effectChannelGapCount);
    assert.equal(checked.observedMatureHorizonPathComplete, false);
    assert.equal(checked.firstGovernedRealityEpisodeWitnessPathReplayed, false);
    assert.equal(checked.completeEpisodeTruthEstablished, false);
    assert.equal(checked.independentOutcomeTruthEstablished, false);
    assert.equal(checked.causalAttributionEstablished, false);
    assert.equal(checked.obligationClosureEstablished, false);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.trainingRows, 0);
    assert.equal(checked.causalExperienceUnits, 0);
    assert.equal(checked.actorCredit, false);
    assert.equal(checked.permitsPricing, false);
    assert.deepEqual(checked.boundary,
      OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_BOUNDARY);
    assert.equal(JSON.stringify(certificate).includes("resource-owner-readback"), false);
    assert.deepEqual(readdirSync(f.base.directory).sort(), beforeMembers,
      "certificate creation and verification are read-only");
  });

test("an earlier obligation prefix and a missing witness observation cannot path-complete",
  (t) => {
    const f = stage5Fixture(t);
    const certificate = createCertificate(f);
    const earlyInput = structuredClone(f.input);
    earlyInput.outcomeWitness.sourceObjects = f.sourceObjects;
    earlyInput.laterObligationPrefix = { directory: f.base.directory,
      expectedRevision: f.activated.revision,
      expectedStateHash: f.activated.stateHash,
      expectedGenesisHash: f.activated.genesis.genesisHash };
    const early = verifyCertificate(certificate, f, earlyInput);
    assert.equal(early.ok, false);
    assert.equal(early.observedMatureHorizonPathComplete, false);
    assert.equal(early.firstGovernedRealityEpisodeWitnessPathReplayed, false);
    assert.equal(early.status, "HOLD");
    assert.equal(early.authority, "NONE");

    const missingInput = { ...f.input,
      outcomeWitness: { ...f.input.outcomeWitness,
        envelope: { ...f.envelope, observation: { ...f.envelope.observation,
          observationStatus: "MISSING", consequenceReportHash: null,
          affectedPartyReportSetHash: null, recoveryEvidenceSetHash: null } } } };
    const missing = verifyCertificate(certificate, f, missingInput);
    assert.equal(missing.ok, false);
    assert.equal(missing.observedMatureHorizonPathComplete, false);
    assert.equal(missing.independentOutcomeTruthEstablished, false);
    assert.equal(missing.trainingRows, 0);
  });

test("actor/witness role-root collision and transport substitution fail closed", (t) => {
  const f = stage5Fixture(t);
  const certificate = createCertificate(f);
  const collisionInput = { ...f.input,
    outcomeWitness: { ...f.input.outcomeWitness,
      witnessIdentity: f.base.input.actorIdentity } };
  const collision = verifyCertificate(certificate, f, collisionInput);
  assert.equal(collision.ok, false);
  assert.equal(collision.firstGovernedRealityEpisodeWitnessPathReplayed, false);
  assert.equal(collision.organizationalIndependenceEstablished, undefined);
  assert.equal(collision.authority, "NONE");
  assert.equal(collision.causalExperienceUnits, 0);

  const transportSplice = structuredClone(f.input);
  transportSplice.outcomeWitness.sourceObjects = f.sourceObjects;
  transportSplice.outcomeWitness.nodeSubmissionBundle.receipt.transportSignerKeyId
    = f.envelope.signingKeyId;
  const transport = verifyCertificate(certificate, f, transportSplice);
  assert.equal(transport.ok, false);
  assert.equal(transport.actionReady, false);
  assert.equal(transport.trainingRows, 0);
});

test("certificate self-rehash cannot grant authority, CEU, training, closure or economics",
  (t) => {
    const f = stage5Fixture(t);
    const certificate = createCertificate(f);
    for (const mutate of [
      (value) => { value.structuralResult.independentOutcomeTruthEstablished = true; },
      (value) => { value.structuralResult.obligationClosureEstablished = true; },
      (value) => { value.automaticTraining = true; value.trainingRows = 1; },
      (value) => { value.causalExperienceUnits = 1; },
      (value) => { value.authority = "FULL"; },
      (value) => { value.permitsPricing = true; },
      (value) => {
        value.effectChannelGapCount = 0;
        value.affectedPartyCrosswalk.effectChannelGapCount = 0;
        value.affectedPartyCrosswalk.allEffectChannelsWithinConsequenceBoundary = true;
        value.sourceReplay.witnessAdapterImplementationOrCodeClosureReplayed = true;
        value.structuralResult.observedMatureHorizonPathComplete = true;
        value.structuralResult.firstGovernedRealityEpisodeWitnessPathReplayed = true;
        value.result = "FIRST_GOVERNED_REALITY_EPISODE_WITNESS_PATH_REPLAYED_HOLD";
      },
    ]) {
      const changed = structuredClone(certificate);
      mutate(changed);
      delete changed.certificateHash;
      changed.certificateHash = networkIntakeDigest(
        OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.certificate, changed);
      const checked = verifyCertificate(changed, f, f.input, changed.certificateHash);
      assert.equal(checked.ok, false);
      assert.equal(checked.completeEpisodeTruthEstablished, false);
      assert.equal(checked.causalAttributionEstablished, false);
      assert.equal(checked.obligationClosureEstablished, false);
      assert.equal(checked.authority, "NONE");
      assert.equal(checked.automaticTraining, false);
      assert.equal(checked.trainingRows, 0);
      assert.equal(checked.causalExperienceUnits, 0);
      assert.equal(checked.permitsPricing, false);
    }
  });

test("certificate inputs reject accessors and proxies without accepting callbacks", (t) => {
  const f = stage5Fixture(t);
  const certificate = createCertificate(f);
  let invoked = 0;
  const proxied = new Proxy(f.input.affectedParty, { get() { invoked += 1; } });
  const proxyInput = { ...f.input, affectedParty: proxied };
  const proxyCheck = verifyCertificate(certificate, f, proxyInput);
  assert.equal(proxyCheck.ok, false);
  assert.equal(invoked, 0);
  assert.equal(proxyCheck.authority, "NONE");

  const accessorInput = { ...f.input, affectedParty: { ...f.input.affectedParty } };
  Object.defineProperty(accessorInput.affectedParty, "source", {
    enumerable: true, get() { invoked += 1; return f.affectedSource; },
  });
  const accessorCheck = verifyCertificate(certificate, f, accessorInput);
  assert.equal(accessorCheck.ok, false);
  assert.equal(invoked, 0);
  assert.equal(accessorCheck.trainingRows, 0);
});
