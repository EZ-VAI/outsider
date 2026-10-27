import assert from "node:assert/strict";
import { sign as cryptoSign } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
  NETWORK_INTAKE_BOUNDARY,
  networkIntakeDigest,
} from "../../src/outsider-network-intake.js";
import {
  OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS,
  createOutsiderFirstGovernedRealityEpisodeCertificateV2,
} from "../../src/outsider-network-first-governed-reality-episode-v2.js";
import {
  NETWORK_LIFECYCLE_EVENT_GENESIS,
  createNetworkLifecycleAnchorOutboxRequest,
  createNetworkLifecycleHeadCheckpoint,
} from "../../src/outsider-network-lifecycle-head-checkpoint.js";
import {
  OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS,
  OutsiderOutcomeWitnessAdapterRegistry,
  createOutsiderOutcomeWitnessAdapterDescriptor,
  createOutsiderOutcomeWitnessEnvelope,
  createOutsiderOutcomeWitnessSourceManifest,
} from "../../src/outsider-network-outcome-witness.js";
import {
  NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS,
  NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS,
  createNetworkQuarantineSourceReviewExport,
  networkQuarantineSourceArtifactBindingSetRoot,
  networkQuarantineSourceReviewFileHash,
  networkQuarantineSourceReviewSetRoot,
} from "../../src/outsider-network-quarantine-source-review.js";
import { listProviderPatternEntities } from "../../src/outsider-provider-pattern-registry.js";
import { RealityObligationStore } from "../../src/outsider-reality-obligation-store.js";
import {
  createRealitySemanticObligation,
} from "../../src/outsider-reality-semantic-bundle.js";
import { listRealitySourceCandidates } from "../../src/outsider-reality-source-scout.js";
import {
  createConsequenceReport,
  createRealityBoundary,
  createRealityExecutionReceipt,
  createStewardshipClaim,
} from "../../src/outsider-reality-stewardship.js";
import {
  createAutonomousWorkOrderSourceReplayFixture,
} from "./outsider-autonomous-work-order-source-replay-fixture.js";
import {
  createStage5CensusAndActor,
  createStage5NodeBundle,
  stage5Digest,
  stage5Hash as h,
  stage5KeyEpoch,
  stage5KeyId,
  stage5Pair,
} from "./outsider-network-stage5-fixture.js";

const SOURCE_BOUNDARY = {
  ...NETWORK_INTAKE_BOUNDARY,
  disposition: "QUARANTINED",
  automaticTraining: false,
  trainingRows: 0,
  authorityGrants: 0,
  actionAdmissions: 0,
  ceuUnits: 0,
  permitsAuthority: false,
  permitsAction: false,
  permitsCeu: false,
  permitsCuratePromotion: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
};

function radius() {
  return normalizeDelegationRadius({
    validity: { validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-30T00:00:00.000Z" },
    grants: [{ atom: "OBSERVE",
      scopeHashes: [h("stage1b:capability:scope")],
      budget: { unitHash: h("stage1b:capability:unit"), limit: "1" } }],
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
      action: { proposedActionHash: h("stage1b:proposed-action"),
        beforeStateHash: h("stage1b:before-state"),
        adapterDescriptorHash: h("stage1b:adapter"),
        resourceTopologyHash: h("stage1b:resource-topology"),
        projectorPolicyHash: h("stage1b:projector-policy") },
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

function rehashLifecycleEvent(event, previousEventHash, manifest) {
  const { eventHash: ignoredCallerEventHash, ...body } = event;
  const stableOccurrenceSubjectHash = networkIntakeDigest(
    "stable-occurrence-subject", {
      lane: manifest.lane,
      claimHash: manifest.subject.claimHash,
      wayHash: manifest.subject.wayHash,
      worldHash: manifest.subject.worldHash,
      episodeHash: manifest.subject.episodeHash,
      attemptHash: manifest.subject.attemptHash,
      cohortHash: manifest.subject.cohortHash,
      censusSlotHash: manifest.subject.censusSlotHash,
    });
  const finalBody = { ...body, previousEventHash,
    manifestHash: manifest.manifestHash,
    lane: manifest.lane,
    clientSubmissionId: manifest.clientSubmissionId,
    objectIdentityHash: manifest.payload.objectIdentityHash,
    occurrenceIdentityHash: manifest.occurrenceIdentityHash,
    stableOccurrenceSubjectHash,
    semanticSubjectHash: manifest.subject.attemptActorSubjectHash,
    censusSlotHash: manifest.subject.censusSlotHash };
  return { ...finalBody,
    eventHash: networkIntakeDigest("lifecycle-event", finalBody) };
}

function lifecyclePage(row, payload, { reservationEvent, settlementEvent }) {
  const current = (event, object) => ({ event, object,
    derivedState: { reservationStatus: "SETTLED" },
    retention: { retentionUntil: event.retentionUntil,
      payloadTombstoned: false, tombstonedAt: null } });
  return {
    schema: "outsider/network-quarantine-export/v1",
    registryId: row.bundle.receipt.registryId,
    generatedAt: "2026-08-28T00:12:05.000Z",
    lane: null, count: 2,
    items: [current(reservationEvent, null),
      current(settlementEvent, payload)],
    nextCursor: null,
    eventChain: { eventCount: 2, tailHash: settlementEvent.eventHash,
      appendOnlyReplayVerified: true },
    derivedLedgerAudit: { verified: true, retentionSweep: {
      generatedAt: "2026-08-28T00:12:05.000Z", sourceClaimOnly: true } },
    occurrencePolicy:
      "CONTENT_IS_CAS_DEDUPLICATED_OCCURRENCES_ARE_NEVER_DEDUPLICATED",
    useBoundary: SOURCE_BOUNDARY,
  };
}

function bindingRecordBytes(outcomeWitness) {
  const encoded = (value) => Buffer.from(canonicalizeStrict(value), "utf8");
  return {
    sourceManifest: encoded(outcomeWitness.sourceManifest),
    instrument: encoded({ schema:
      "outsider/autonomous-work-order-witness-instrument-reference-binding/v1",
    instrumentHash: outcomeWitness.envelope.instrumentHash,
    implementationOrCodeClosureReplayed: false }),
    rightsReview: encoded({ schema:
      "outsider/autonomous-work-order-witness-rights-review-reference-binding/v1",
    rightsReviewHash: outcomeWitness.sourceManifest.rightsReviewHash,
    reviewSemanticsAdjudicated: false, clearanceEstablished: false }),
    privacyReview: encoded({ schema:
      "outsider/autonomous-work-order-witness-privacy-review-reference-binding/v1",
    privacyReviewHash: outcomeWitness.sourceManifest.privacyReviewHash,
    reviewSemanticsAdjudicated: false, clearanceEstablished: false }),
  };
}

function sourceReviewFixture(t, outcomeWitness, payload, subject) {
  const bytes = bindingRecordBytes(outcomeWitness);
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-stage1d-source-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const files = { sourceManifest: "source-manifest.json",
    instrument: "instrument-reference-binding.json",
    rightsReview: "rights-review-reference-binding.json",
    privacyReview: "privacy-review-reference-binding.json" };
  for (const [role, relative] of Object.entries(files)) {
    const target = path.join(directory, relative);
    writeFileSync(target, bytes[role], { mode: 0o600 });
    chmodSync(target, 0o600);
  }
  const source = {};
  const bindings = [];
  for (const definition of NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS) {
    const value = bytes[definition.inputField];
    const replayedHash = networkQuarantineSourceReviewFileHash(
      definition.kind, value);
    source[definition.manifestField] = replayedHash;
    bindings.push({ kind: definition.kind,
      manifestField: definition.manifestField,
      hashDomain: definition.hashDomain, bytes: value.length,
      replayedHash, expectedHash: replayedHash, matched: true,
      localPathProjected: false, rawBytesProjected: false });
  }
  const row = createStage5NodeBundle({ lane: "ACTION_OUTCOME", subject, payload,
    source,
    clientSubmissionId: "stage1d_action_outcome_source_review_binding",
    createdAt: "2026-08-28T00:12:00.000Z", ordinal: 1,
    previousEventHash: NETWORK_LIFECYCLE_EVENT_GENESIS });
  // The generic Stage 5 fixture intentionally carries its own historical caller-side
  // lifecycle hash domain. A lifecycle-head fixture must instead reconstruct the
  // final chain from the exact event bodies with the authoritative intake digest.
  const manifest = row.bundle.preview.manifest;
  const reservationEvent = rehashLifecycleEvent(
    row.bundle.reservationEvent, NETWORK_LIFECYCLE_EVENT_GENESIS, manifest);
  const settlementEvent = rehashLifecycleEvent(
    row.bundle.settlementEvent, reservationEvent.eventHash, manifest);
  const page = lifecyclePage(row, payload, { reservationEvent, settlementEvent });
  const pageBytes = Buffer.from(`${JSON.stringify(page)}\n`, "utf8");
  const checkpoint = createNetworkLifecycleHeadCheckpoint({
    exportPageBytes: [pageBytes], createdAt: "2026-08-28T00:12:06.000Z" });
  const outboxRequest = createNetworkLifecycleAnchorOutboxRequest({ checkpoint });
  const artifactBindingSetRoot =
    networkQuarantineSourceArtifactBindingSetRoot(bindings);
  const sourceReviewSetRoot = networkQuarantineSourceReviewSetRoot({
    checkpointHash: checkpoint.checkpointHash,
    reservationHash: row.bundle.reservation.reservationHash,
    manifestHash: row.bundle.preview.manifest.manifestHash,
    eventHash: settlementEvent.eventHash,
    artifactBindingSetRoot,
  });
  const input = {
    persistedContract: row.bundle.reservation,
    v1ExportItem: page.items[1],
    sourceReviewDirectory: directory,
    sourceReviewFiles: files,
    sourceReviewSetPin: {
      schema: NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.sourceReviewSetPin,
      checkpointHash: checkpoint.checkpointHash,
      reservationHash: row.bundle.reservation.reservationHash,
      manifestHash: row.bundle.preview.manifest.manifestHash,
      eventHash: settlementEvent.eventHash,
      artifactBindingSetRoot,
      sourceReviewSetRoot,
    },
    reviewedAt: "2026-08-28T00:12:07.000Z",
    externalHeadPin: null,
  };
  const exportRecord = createNetworkQuarantineSourceReviewExport(input);
  return { directory, bytes, row, reservationEvent, settlementEvent,
    page, pageBytes, checkpoint, outboxRequest,
    input, exportRecord, sourceReviewSetRoot };
}

export function createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t) {
  const provisional = {
    claimHash: h("stage1d:provisional-claim"),
    wayHash: h("stage1b:way"), worldHash: h("stage1b:world"),
    episodeHash: h("stage1b:episode"), attemptHash: h("stage1b:attempt"),
    registrationHash: h("stage1b:registration"),
  };
  const preliminaryEffect = effectProjection(provisional,
    provisional.registrationHash);
  const selectedHorizonId = "DELAYED_RECONCILIATION";
  const selectedHorizonIndex = preliminaryEffect.projection.horizonHypotheses
    .indexOf(selectedHorizonId);
  assert.ok(selectedHorizonIndex > 0);
  const selectedHorizonDueAfterMs = selectedHorizonIndex * 60_000;
  const channelIds = preliminaryEffect.projection.channelHypotheses;
  const preActionCoverageRoots = [h("stage1b:owner:coverage-subject"),
    h("stage1b:unknown:coverage-subject")].sort();
  const outcomeCoverageRoots = [h("stage1d:outcome-owner"),
    h("stage1d:outcome-neighbor-class")].sort();
  const boundary = createRealityBoundary({
    boundaryId: "stage1d-shared-reality", worldHash: provisional.worldHash,
    policyHash: h("stage1d:reality-policy"),
    resourceOwnerRootHash: h("stage1d:resource-owner"),
    affectedPartyRootHashes: preActionCoverageRoots,
    constraints: [{ channelId: channelIds[0], kind: "CUMULATIVE_CAP",
      unit: "impact-points", cap: 10, aggregation: "CUMULATIVE_MAX",
      nonCompensable: true,
      affectedPartyRootHashes: preActionCoverageRoots }],
    observationHorizons: [{ horizonId: "IMMEDIATE_TERMINAL", closesAfterMs: 0,
      mandatory: true }, { horizonId: selectedHorizonId,
      closesAfterMs: selectedHorizonDueAfterMs, mandatory: true }],
    challengePolicyHash: h("stage1d:challenge-policy"),
    recoveryStandardHash: h("stage1d:recovery-standard"),
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
  });
  const providerRoot = h("stage1d:executing-provider");
  const claim = createStewardshipClaim({ boundary,
    claimIdHash: h("stage1d:stewardship-claim-id"),
    wayHash: provisional.wayHash, claimantRootHash: h("stage1d:claimant"),
    standingEvidenceHashes: [h("stage1d:standing")], purpose: "WORK",
    operationHashes: [h("stage1d:operation")],
    representedPartyRootHashes: preActionCoverageRoots,
    requestedExternalities: boundary.constraints.map(({ channelId }) => ({
      channelId, amount: 0 })),
    alternativesConsideredHashes: [h("stage1d:simulation-alternative")],
    optionPreservationEvidenceHashes: [h("stage1d:option-preservation")],
    recoveryPlanHash: h("stage1d:recovery-plan"),
    responsibilityRootHashes: [h("stage1d:accountable-principal"), providerRoot],
    requestedAt: "2026-08-27T12:00:00.000Z",
    expiresAt: "2026-08-29T12:00:00.000Z",
  });
  const predecessor = createAutonomousWorkOrderSourceReplayFixture(t, {
    commonOverrides: { claimHash: claim.claimHash }, identityHorizonIds: true });
  // Keep the predecessor's source-replay directory at its immutable revision-zero
  // snapshot.  Build a distinct live-ledger directory from the same exact semantic
  // plan/source before advancing it for the delayed certificate.  The v3 crosswalk
  // admits only content identity at revision zero; it never treats two local paths
  // as durable continuity, uniqueness, or non-equivocation evidence.
  const liveRoot = mkdtempSync(path.join(tmpdir(), "outsider-stage1d-live-"));
  t.after(() => rmSync(liveRoot, { recursive: true, force: true }));
  const liveDirectory = path.join(liveRoot, "obligation");
  const liveBaseSnapshot = createRealitySemanticObligation({
    semanticPlan: predecessor.semantic.plan,
    semanticPlanSource: predecessor.semantic.source,
    directory: liveDirectory,
  });
  assert.notEqual(liveDirectory, predecessor.semantic.directory);
  assert.equal(liveBaseSnapshot.revision, 0);
  assert.equal(liveBaseSnapshot.genesis.genesisHash,
    predecessor.semantic.snapshot.genesis.genesisHash);
  assert.equal(liveBaseSnapshot.stateHash, predecessor.semantic.snapshot.stateHash);
  assert.deepEqual(liveBaseSnapshot.genesis, predecessor.semantic.snapshot.genesis);
  assert.deepEqual(liveBaseSnapshot.state, predecessor.semantic.snapshot.state);
  const liveBaseEpisode = {
    join: predecessor.input.completeEpisode.join,
    input: {
      prospectiveCensus:
        predecessor.input.completeEpisode.input.prospectiveCensus,
      actorIdentity: predecessor.input.completeEpisode.input.actorIdentity,
      laneBundles: predecessor.input.completeEpisode.input.laneBundles,
      obligationPrefix: {
        directory: liveDirectory,
        expectedRevision: liveBaseSnapshot.revision,
        expectedStateHash: liveBaseSnapshot.stateHash,
        expectedGenesisHash: liveBaseSnapshot.genesis.genesisHash,
      },
    },
  };
  const preActionSource = predecessor.semantic.source.affectedPartyRegisterSource;
  const preActionRegister = predecessor.semantic.source.affectedPartyRegister;
  assert.deepEqual(preActionRegister.coverageSubjects.map(
    ({ coverageSubjectRefHash }) => coverageSubjectRefHash).sort(),
  preActionCoverageRoots);
  const outcomeEffect = effectProjection(predecessor.common,
    predecessor.foundation.censusProjection.projectionHash);
  const outcomeSource = createAffectedPartyRegisterSource({
    subjectBindings: { claimHash: predecessor.common.claimHash,
      wayHash: predecessor.common.wayHash, worldHash: predecessor.common.worldHash,
      episodeHash: predecessor.common.episodeHash,
      attemptHash: predecessor.common.attemptHash,
      censusHash: predecessor.foundation.censusProjection.projectionHash },
    beforeStateHash: outcomeEffect.projection.bindings.action.beforeStateHash,
    effectConsequenceReviewProjection: outcomeEffect.projection,
    effectReviewContext: outcomeEffect.context,
    matraixReviewRefs: [{ sourceId: "MATRAIX_PERSONA_REVIEW",
      projectionHash: h("stage1d:outcome-matraix-review") }],
    coverageSubjects: [{ coverageSubjectRefHash: outcomeCoverageRoots[0],
      partyClass: "DIRECT_AFFECTED_PARTY",
      standingBasisReviewRefHash: h("stage1d:outcome-owner-standing"),
      channelIds }, { coverageSubjectRefHash: outcomeCoverageRoots[1],
      partyClass: "POTENTIAL_BYSTANDER_CLASS",
      standingBasisReviewRefHash: null, channelIds }],
  });
  const outcomeRegister = buildAffectedPartyRegister(outcomeSource);
  const outcomeHorizon = outcomeRegister.mandatoryHorizonRows.find(
    ({ horizonId }) => horizonId === selectedHorizonId);
  assert.ok(outcomeHorizon);
  const genesisCreatedAtMs = Date.parse(
    predecessor.semantic.snapshot.genesis.createdAt);
  const executionAt = new Date(genesisCreatedAtMs + 1_000).toISOString();
  const activationAt = new Date(genesisCreatedAtMs + 10_000).toISOString();
  const observedAt = new Date(genesisCreatedAtMs + 10 * 60_000).toISOString();
  const reportedAt = new Date(genesisCreatedAtMs + 10 * 60_000 + 30_000)
    .toISOString();
  const witnessSignedAt = new Date(genesisCreatedAtMs + 10 * 60_000 + 40_000)
    .toISOString();
  const successorCreatedAt = new Date(genesisCreatedAtMs + 11 * 60_000)
    .toISOString();
  const baseActionBundle = predecessor.network.rows[2].bundle;
  const executionEvidenceHash = baseActionBundle.preview.payload.executionEvidenceHash;
  const execution = createRealityExecutionReceipt({ boundary, claim,
    ownerGateReceiptHash: h("stage1d:owner-gate-receipt-reference"),
    executionEvidenceHash, providerRootHash: providerRoot,
    responsibilityRootHashes: [...claim.responsibilityRootHashes,
      h("stage1d:successor-provider")],
    executedAt: executionAt });
  const report = createConsequenceReport({ boundary, claim, execution,
    horizonId: selectedHorizonId, outcome: "SUCCESS",
    impactMeasurements: boundary.constraints.map(({ channelId }) => ({ channelId,
      amount: 0, measurementEvidenceHash: h(`stage1d:measurement:${channelId}`) })),
    affectedPartyReports: preActionCoverageRoots.map(
      (affectedPartyRootHash, index) => ({ affectedPartyRootHash,
        reportHash: h(`stage1d:affected-report:${index}`),
        disposition: "NO_REPORTED_IMPACT" })),
    causalStatus: "OBSERVATION", recoveryStatus: "NOT_REQUIRED",
    measurementEvidenceHashes: [h("stage1d:measurement-evidence-member")],
    observedAt });
  const store = RealityObligationStore.open(liveDirectory);
  let later = store.activate(cas(liveBaseSnapshot,
    "activate-stage1d-obligation", activationAt));
  later = store.recordHorizonReport(cas(later,
    "record-stage1d-delayed-report", reportedAt, {
      horizonId: selectedHorizonId, consequenceReportHash: report.consequenceHash }));
  const obligationHorizon = later.state.mandatoryHorizons.find(
    ({ horizonId }) => horizonId === selectedHorizonId);
  assert.equal(obligationHorizon.dueAfterMs, selectedHorizonDueAfterMs);
  const affectedPartyReportSetHash = networkIntakeDigest(
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS.affectedPartyReportSet,
    report.affectedPartyReports);
  const normalizedObservationHash = networkIntakeDigest(
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS.normalizedObservation, {
      consequenceReportHash: report.consequenceHash, affectedPartyReportSetHash,
      recoveryEvidenceSetHash: null, horizonId: report.horizonId,
      observedAt: report.observedAt });
  const observation = { role: "RESOURCE_OWNER_READBACK",
    observationStatus: "OBSERVED", observedAt: report.observedAt,
    normalizedObservationHash, consequenceReportHash: report.consequenceHash,
    affectedPartyReportSetHash, recoveryEvidenceSetHash: null };
  const sourceObjects = [{ objectId: "stage1d-resource-owner-readback",
    immutableVersion: "revision-1",
    bytes: Buffer.from(JSON.stringify(observation), "utf8") }];
  const sourceManifest = createOutsiderOutcomeWitnessSourceManifest({
    sourceId: "stage1d-resource-owner-instrument-feed",
    sourceClass: "RESOURCE_OWNER_READBACK", objects: sourceObjects,
    rightsReviewHash: h("stage1d:witness-rights-review"),
    privacyReviewHash: h("stage1d:witness-privacy-review"), retentionDays: 30 });
  const descriptor = createOutsiderOutcomeWitnessAdapterDescriptor({
    adapterId:
      OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS.JSON_OBSERVATION_V1,
    adapterVersion: "1.0.0", sourceClass: sourceManifest.sourceClass,
    sourceSchema: { mediaType: "application/json", record: "observation-v1" },
    instrumentHash: h("stage1d:witness-instrument") });
  const registry = new OutsiderOutcomeWitnessAdapterRegistry();
  registry.register({ descriptor,
    sourceSchema: { mediaType: "application/json", record: "observation-v1" } });
  const witnessFoundation = createStage5CensusAndActor(
    predecessor.common, "stage1d-witness");
  const witnessIdentity = { source: witnessFoundation.actorSource,
    envelope: witnessFoundation.actorEnvelope };
  const actorIdentity = { source: predecessor.foundation.actorSource,
    envelope: predecessor.foundation.actorEnvelope };
  const target = { claimHash: predecessor.common.claimHash,
    wayHash: predecessor.common.wayHash, worldHash: predecessor.common.worldHash,
    episodeHash: predecessor.common.episodeHash,
    attemptHash: predecessor.common.attemptHash, executionEvidenceHash };
  const horizon = { horizonId: selectedHorizonId,
    obligationHorizonCommitmentHash: obligationHorizon.horizonCommitmentHash,
    affectedPartyHorizonBindingHash: outcomeHorizon.horizonHash };
  const replayReceipt = registry.replay({ adapterId: descriptor.adapterId,
    sourceManifest, sourceObjects, target, horizon, witnessIdentity });
  const witnessSigning = stage5Pair();
  const relationshipSigning = stage5Pair();
  const actorRoots = relationshipRoots(actorIdentity);
  const witnessRoots = relationshipRoots(witnessIdentity);
  const reviewBody = {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview,
    schemaVersion: "1.0.0", registryId: "stage1d-relationship-registry",
    reviewId: "stage1d-actor-witness-review-0001",
    actor: { identityEnvelopeHash:
        predecessor.foundation.actorEnvelope.actorIdentityEnvelopeHash,
      subjectHash: predecessor.foundation.actorEnvelope.actorSubjectHash,
      correlationRootHashes: actorRoots },
    witness: { identityEnvelopeHash:
        witnessFoundation.actorEnvelope.actorIdentityEnvelopeHash,
      subjectHash: witnessFoundation.actorEnvelope.actorSubjectHash,
      correlationRootHashes: witnessRoots },
    relationshipClassesReviewed:
      [...OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES].sort(),
    relationshipEvidenceSetHash: h("stage1d:relationship-evidence-set"),
    finding: "NO_KNOWN_SHARED_CONTROL_WITHIN_DECLARED_SCOPE",
    issuedAt: "2026-08-28T00:09:00.000Z",
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
    issuerOrganizationHash: h("stage1d:relationship-review-issuer"),
  };
  const relationshipReview = signRelationshipReview(reviewBody,
    relationshipSigning);
  const trustPolicy = makeTrustPolicy({
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy,
    expectedWitnessRegistryId: "stage1d-witness-registry",
    expectedRelationshipRegistryId: relationshipReview.registryId,
    expectedActorIdentityEnvelopeHash:
      predecessor.foundation.actorEnvelope.actorIdentityEnvelopeHash,
    expectedActorSubjectHash: predecessor.foundation.actorEnvelope.actorSubjectHash,
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
    signedAt: witnessSignedAt },
  { witnessPrivateKeyPem: witnessSigning.privateKey });
  const v2Payload = {
    schema: NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2,
    baseActionOutcomeManifestHash: baseActionBundle.preview.manifest.manifestHash,
    baseActionOutcomeBundleHash: baseActionBundle.bundleHash,
    baseActionOutcomeOccurrenceIdentityHash:
      baseActionBundle.preview.manifest.occurrenceIdentityHash,
    attemptRecordHash: predecessor.common.attemptHash, executionEvidenceHash,
    observationStatus: "OBSERVED", outcomeWitnessEnvelopeHash: envelope.envelopeHash,
    witnessSourceManifestHash: sourceManifest.sourceManifestHash,
    witnessReplayReceiptHash: replayReceipt.replayReceiptHash,
    witnessRelationshipReviewHash: relationshipReview.reviewHash,
    consequenceReportHash: report.consequenceHash,
    affectedPartyRegisterRootHash: outcomeRegister.affectedPartyRootHash,
    affectedPartyReportSetHash, recoveryEvidenceSetHash: null,
    obligationGenesisHash: later.genesis.genesisHash,
    obligationStateHash: later.stateHash, horizonId: selectedHorizonId,
    obligationHorizonCommitmentHash: obligationHorizon.horizonCommitmentHash,
    affectedPartyHorizonBindingHash: outcomeHorizon.horizonHash,
    observedAt: report.observedAt, externalOutcomeVerified: false,
    causalAttributionEstablished: false, obligationClosed: false,
  };
  const successorRow = createStage5NodeBundle({ lane: "ACTION_OUTCOME",
    subject: predecessor.network.subject, payload: v2Payload,
    source: { sourceManifestHash: sourceManifest.sourceManifestHash,
      instrumentHash: descriptor.instrumentHash,
      rightsReviewHash: sourceManifest.rightsReviewHash,
      privacyReviewHash: sourceManifest.privacyReviewHash },
    clientSubmissionId: "stage1d_action_outcome_witness_successor",
    createdAt: successorCreatedAt, ordinal: 4 });
  const certificateInput = {
    baseEpisode: liveBaseEpisode,
    outcomeWitness: { nodeSubmissionBundle: successorRow.bundle, witnessIdentity,
      sourceManifest, sourceObjects, relationshipReview, envelope },
    preActionAffectedPartyDeclaration: { source: preActionSource,
      register: preActionRegister },
    outcomeAffectedPartyRegister: { source: outcomeSource,
      register: outcomeRegister },
    consequence: { boundary, claim, execution, report },
    laterObligationPrefix: { directory: liveDirectory,
      expectedRevision: later.revision, expectedStateHash: later.stateHash,
      expectedGenesisHash: later.genesis.genesisHash },
  };
  const certificateContext = {
    baseLaneTrust: predecessor.network.laneTrust,
    expectedBaseJoinHash: predecessor.network.join.joinHash,
    outcomeWitnessNetworkTrust: { expectedBundleHash: successorRow.bundle.bundleHash,
      trustPolicy: successorRow.trustRow.trustPolicy },
    outcomeWitnessTrustPolicy: trustPolicy,
    outcomeWitnessAdapterRegistry: registry,
    outcomeWitnessAdapterId: descriptor.adapterId,
  };
  const certificate = createOutsiderFirstGovernedRealityEpisodeCertificateV2(
    certificateInput, certificateContext);
  const sourceReview = sourceReviewFixture(t, certificateInput.outcomeWitness,
    v2Payload, predecessor.network.subject);
  const input = {
    recordedAt: "2026-09-01T00:01:00.000Z",
    predecessor: { receipt: predecessor.receipt, input: predecessor.input,
      context: predecessor.context },
    delayedWitness: { certificate, input: certificateInput,
      context: certificateContext },
    lifecycle: { exportPageBytes: [sourceReview.pageBytes],
      checkpoint: sourceReview.checkpoint,
      outboxRequest: sourceReview.outboxRequest },
    sourceReview: { export: sourceReview.exportRecord, input: sourceReview.input },
  };
  const context = {
    expectedPredecessorReceiptHash: predecessor.receipt.sourceReplayReceiptHash,
    expectedCertificateHash: certificate.certificateHash,
    expectedLifecycleCheckpointHash: sourceReview.checkpoint.checkpointHash,
    expectedSourceReviewExportHash: sourceReview.exportRecord.exportHash,
    expectedSourceReviewSetRoot: sourceReview.sourceReviewSetRoot,
  };
  return { predecessor, liveDirectory, liveBaseSnapshot, liveBaseEpisode,
    boundary, claim, execution, report, later,
    preActionSource, preActionRegister, outcomeSource, outcomeRegister,
    outcomeHorizon, obligationHorizon, sourceObjects, sourceManifest,
    descriptor, registry, witnessIdentity, relationshipReview, trustPolicy,
    envelope, v2Payload, successorRow, certificateInput, certificateContext,
    certificate, sourceReview, input, context };
}
