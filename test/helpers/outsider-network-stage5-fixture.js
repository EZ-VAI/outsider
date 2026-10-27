import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalizeStrict } from "../../src/canonical.js";
import {
  ACTOR_IDENTITY_ENVELOPE_SCHEMAS,
  buildActorIdentityEnvelope,
  createActorIdentityEnvelopeSource,
} from "../../src/outsider-actor-identity-envelope.js";
import {
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  createNetworkIntakeChallenge,
  createNetworkIntakePayloadEnvelope,
  createNetworkIntakeReceipt,
  createNetworkIntakeReservation,
  networkIntakeDigest,
} from "../../src/outsider-network-intake.js";
import {
  OUTSIDER_NETWORK_NODE_ADAPTER_KINDS,
} from "../../src/outsider-network-node-sdk.js";
import {
  OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
  OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS,
  createOutsiderNetworkNodeSubmissionPreview,
  verifyOutsiderNetworkNodeSubmissionBundle,
} from "../../src/outsider-network-node-client.js";
import {
  buildProspectiveEpisodeCensusProjection,
  createProspectiveEpisodeCensusSource,
} from "../../src/outsider-prospective-episode-census.js";
import {
  RealityObligationStore,
} from "../../src/outsider-reality-obligation-store.js";
import {
  createOutsiderNetworkCompleteEpisodeJoin,
} from "../../src/outsider-network-complete-episode.js";

export function stage5Hash(label) {
  return `sha256:${createHash("sha256").update(`stage5:${label}`).digest("hex")}`;
}

export function stage5Digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

export function stage5Pair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

export function stage5KeyId(publicKeyPem) {
  return `sha256:${createHash("sha256")
    .update(createPublicKey(publicKeyPem).export({ type: "spki", format: "der" }))
    .digest("hex")}`;
}

export function stage5KeyEpoch(key, {
  validFrom = "2026-08-27T00:00:00.000Z",
  validUntil = "2026-08-30T00:00:00.000Z",
} = {}) {
  return { keyId: stage5KeyId(key.publicKey), publicKeyPem: key.publicKey,
    validFrom, validUntil };
}

function assurance(prefix, label, assuranceClass = "SOURCE_REPLAYED_REFERENCE") {
  return assuranceClass === "NONE" ? { class: "NONE", evidenceRefHash: null } : {
    class: assuranceClass,
    evidenceRefHash: stage5Hash(`${prefix}:assurance:${label}`),
  };
}

function normalizedAssurance(value) {
  return { class: value.class, evidenceRefHash: value.evidenceRefHash,
    effectiveAssurance: "UNVERIFIED_REFERENCE_ONLY", externallyEstablished: false };
}

function deploymentLineageProjectionHash(value) {
  return stage5Digest("outsider/actor-deployment-lineage-projection/v1", {
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    issuerPrincipalRefHash: value.issuerPrincipalRefHash,
    lineageDeclarationRefHash: value.lineageDeclarationRefHash,
    assurance: normalizedAssurance(value.assurance),
  });
}

function deploymentRevisionHash(value, lineage) {
  return stage5Digest(ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision, {
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision,
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    deploymentLineageProjectionHash: deploymentLineageProjectionHash(lineage),
    wayHash: value.wayHash,
    runtimeClosureHash: value.runtimeClosureHash,
    configClosureHash: value.configClosureHash,
    memoryPolicyHash: value.memoryPolicyHash,
    controllerImplementationHash: value.controllerImplementationHash,
    adapterHash: value.adapterHash,
    providerRootHash: value.providerRootHash,
    topologyHash: value.topologyHash,
    modelArtifactRefHashes: [...value.modelArtifactRefHashes].sort(),
    dataRootHashes: [...value.dataRootHashes].sort(),
    toolchainRootHashes: [...value.toolchainRootHashes].sort(),
    assurance: normalizedAssurance(value.assurance),
    exactBuildClosureExternallyEstablished: false,
    deploymentContinuityEstablished: false,
  });
}

function actorInput(prefix, common, censusHash, delegationEdges) {
  const modelRefHash = stage5Hash(`${prefix}:model-ref`);
  const deploymentLineage = {
    deploymentLineageRefHash: stage5Hash(`${prefix}:deployment-lineage`),
    issuerPrincipalRefHash: stage5Hash(`${prefix}:principal`),
    lineageDeclarationRefHash: stage5Hash(`${prefix}:lineage-declaration`),
    assurance: assurance(prefix, "lineage", "OPERATOR_SIGNED_REFERENCE"),
  };
  const deploymentRevision = {
    deploymentLineageRefHash: deploymentLineage.deploymentLineageRefHash,
    wayHash: common.wayHash,
    runtimeClosureHash: stage5Hash(`${prefix}:runtime-closure`),
    configClosureHash: stage5Hash(`${prefix}:config-closure`),
    memoryPolicyHash: stage5Hash(`${prefix}:memory-policy`),
    controllerImplementationHash: stage5Hash(`${prefix}:controller`),
    adapterHash: stage5Hash(`${prefix}:adapter`),
    providerRootHash: stage5Hash(`${prefix}:provider`),
    topologyHash: stage5Hash(`${prefix}:topology`),
    modelArtifactRefHashes: [modelRefHash],
    dataRootHashes: [stage5Hash(`${prefix}:data-root`)],
    toolchainRootHashes: [stage5Hash(`${prefix}:toolchain-root`)],
    assurance: assurance(prefix, "deployment-revision"),
  };
  return {
    bindings: { claimWayWorld: { claimHash: common.claimHash,
      wayHash: common.wayHash, worldHash: common.worldHash },
    run: { episodeHash: common.episodeHash, attemptHash: common.attemptHash,
      censusHash, observedAt: "2026-08-28T00:00:00.000Z" } },
    principalEpoch: {
      principalRefHash: stage5Hash(`${prefix}:principal`),
      epochRefHash: stage5Hash(`${prefix}:principal-epoch`),
      trustDomainRefHash: stage5Hash(`${prefix}:trust-domain`),
      controllerKeyRefHash: stage5Hash(`${prefix}:controller-key`),
      credentialRefHash: stage5Hash(`${prefix}:credential`),
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-30T00:00:00.000Z",
      assurance: assurance(prefix, "principal", "LEGAL_BINDING_REFERENCE"),
    },
    deploymentLineage,
    deploymentRevision,
    modelArtifacts: [{
      modelArtifactRefHash: modelRefHash,
      providerRevisionRefHash: stage5Hash(`${prefix}:provider-model-revision`),
      artifactRootHash: stage5Hash(`${prefix}:model-artifact-root`),
      baseModelRefHash: stage5Hash(`${prefix}:base-model`),
      tokenizerRootHash: stage5Hash(`${prefix}:tokenizer`),
      quantizationRootHash: stage5Hash(`${prefix}:quantization`),
      fineTuneState: "PROVENANCE_REFERENCE_PRESENT",
      fineTuneProvenanceRefHash: stage5Hash(`${prefix}:fine-tune-provenance`),
      assurance: assurance(prefix, "model"),
    }],
    modelRoute: {
      transparency: "EXACT_ARTIFACT_BOUND",
      routePolicyHash: stage5Hash(`${prefix}:route-policy`),
      selectedModelArtifactRefHashes: [modelRefHash],
      routeEvidenceRefHash: stage5Hash(`${prefix}:route-evidence`),
      assurance: assurance(prefix, "route", "OPERATOR_SIGNED_REFERENCE"),
    },
    runtimeInstance: {
      runtimeInstanceRefHash: stage5Hash(`${prefix}:runtime-instance`),
      instanceKeyRefHash: stage5Hash(`${prefix}:runtime-instance-key`),
      bootEpochRefHash: stage5Hash(`${prefix}:boot-epoch`),
      loadedWayHash: common.wayHash,
      loadedDeploymentRevisionHash:
        deploymentRevisionHash(deploymentRevision, deploymentLineage),
      workloadAttestationRefHash: stage5Hash(`${prefix}:workload-attestation`),
      memoryStateMode: "BOUND",
      memoryStateCommitmentHash: stage5Hash(`${prefix}:memory-state`),
      validFrom: "2026-08-27T12:00:00.000Z",
      validUntil: "2026-08-29T00:00:00.000Z",
      assurance: assurance(prefix, "runtime", "WORKLOAD_ATTESTATION_REFERENCE"),
    },
    embodimentRevision: null,
    delegationEdges,
    lifecycleEdges: [],
  };
}

export function createStage5CensusAndActor(common, prefix = "actor", {
  delegationEdges = [],
} = {}) {
  const censusSource = createProspectiveEpisodeCensusSource({
    bindings: { claimHash: common.claimHash, wayHash: common.wayHash,
      worldHash: common.worldHash, cohortHash: common.cohortHash,
      censusSlotHash: common.slotHash },
    registration: { registeredAt: "2026-08-27T00:00:00.000Z",
      plannedNotBefore: "2026-08-28T00:00:00.000Z",
      plannedNotAfter: "2026-08-29T00:00:00.000Z",
      preActionRegistrationReferenceHash: common.registrationHash,
      externalTimeAnchorHash: null },
    design: { eligibilityRuleHash: stage5Hash("eligibility"),
      assignmentPolicyHash: stage5Hash("assignment"),
      instrumentPlanHash: stage5Hash("instrument-plan"),
      outcomePlanHash: stage5Hash("outcome-plan"),
      stoppingPolicyHash: stage5Hash("stopping-policy"),
      monitorPlanHash: stage5Hash("monitor-plan"),
      stewardshipPlanHash: stage5Hash("stewardship-plan") },
  });
  const censusProjection = buildProspectiveEpisodeCensusProjection(censusSource);
  const actorSource = createActorIdentityEnvelopeSource(actorInput(prefix, common,
    censusProjection.projectionHash, delegationEdges));
  const actorEnvelope = buildActorIdentityEnvelope(actorSource);
  return { censusSource, censusProjection, actorSource, actorEnvelope };
}

function adapters(conformanceEvidenceTargets = null) {
  return OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.map((kind) => ({
    kind,
    status: "DECLARED_UNVERIFIED",
    artifactSchema: `outsider/node-adapter-${kind.toLowerCase()}/v1`,
    adapterImplementationHash: stage5Hash(`implementation:${kind}`),
    conformanceEvidenceRefHash: conformanceEvidenceTargets === null
      ? stage5Hash(`conformance:${kind}`)
      : conformanceEvidenceTargets[kind],
  }));
}

function networkDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:network-intake:${domain}:v1\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function stableOccurrenceSubjectHash(manifest) {
  const subject = manifest.subject;
  return networkDigest("stable-occurrence-subject", {
    lane: manifest.lane, claimHash: subject.claimHash, wayHash: subject.wayHash,
    worldHash: subject.worldHash, episodeHash: subject.episodeHash,
    attemptHash: subject.attemptHash, cohortHash: subject.cohortHash,
    censusSlotHash: subject.censusSlotHash,
  });
}

function semanticSubjectHash(manifest) {
  if (manifest.lane === "DELEGATION_RESPONSIBILITY") {
    return manifest.subject.accountableDeploymentSubjectHash;
  }
  if (manifest.lane === "ACTION_OUTCOME") {
    return manifest.subject.attemptActorSubjectHash;
  }
  return manifest.subject.censusSlotHash;
}

function lifecycleEvent({ reservation, challenge, ordinal, previousEventHash,
  occurredAt, retentionUntil, registryId, retentionPolicyVersion,
  appliedRetentionDays, eventType, reasonCode }) {
  const manifest = reservation.manifest;
  const body = { schema: "outsider/network-intake-event/v2", ordinal,
    previousEventHash, reservationHash: reservation.reservationHash,
    manifestHash: manifest.manifestHash, lane: manifest.lane,
    clientSubmissionId: manifest.clientSubmissionId,
    challengeServerKeyId: challenge.signature.keyId, registryId,
    retentionPolicyVersion, appliedRetentionDays, retentionUntil, eventType,
    objectIdentityHash: manifest.payload.objectIdentityHash,
    occurrenceIdentityHash: manifest.occurrenceIdentityHash,
    stableOccurrenceSubjectHash: stableOccurrenceSubjectHash(manifest),
    semanticSubjectHash: semanticSubjectHash(manifest),
    censusSlotHash: manifest.subject.censusSlotHash, occurredAt,
    disposition: "QUARANTINED", reasonCode };
  return { ...body, eventHash: networkDigest("lifecycle-event", body) };
}

function trustPolicy(server, expectedAudience, registryId,
  retentionPolicyVersion, maxAppliedRetentionDays) {
  return { expectedAudience, expectedRegistryId: registryId,
    expectedRetentionPolicyVersion: retentionPolicyVersion,
    maxAppliedRetentionDays,
    challengeServerKeyEpochs: [stage5KeyEpoch(server)],
    receiptServerKeyEpochs: [stage5KeyEpoch(server)] };
}

function isoAdd(value, milliseconds) {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

export function createStage5NodeBundle({ lane, subject, payload, source,
  clientSubmissionId, createdAt, ordinal,
  adapterConformanceEvidenceTargets = null,
  previousEventHash = stage5Hash(`previous-event:${clientSubmissionId}`) }) {
  const transport = stage5Pair();
  const server = stage5Pair();
  const expectedAudience = "https://intake.outsider.example";
  const registryId = "registry-a";
  const retentionPolicyVersion = "outsider/network-retention-policy/v1";
  const appliedRetentionDays = 30;
  const preview = createOutsiderNetworkNodeSubmissionPreview({
    manifestInput: { lane, clientSubmissionId, payloadSchema: payload.schema,
      payload, subject, source, consentHash: stage5Hash(`consent:${clientSubmissionId}`),
      retentionDays: 30, createdAt },
    sdkReleaseHash: stage5Hash("sdk-release"),
    nodeSoftwareRevisionHash: stage5Hash(`node-revision:${clientSubmissionId}`),
    providerPatternReview: null,
    adapterDeclarations: adapters(adapterConformanceEvidenceTargets),
    nativeSafetyEvidenceRefs: [],
  });
  const challenge = createNetworkIntakeChallenge({
    manifestHash: preview.manifest.manifestHash,
    transportSignerKeyId: stage5KeyId(transport.publicKey),
    audience: expectedAudience,
    nonce: `stage5_${clientSubmissionId}_nonce_000001`,
    issuedAt: isoAdd(createdAt, 1_000), expiresAt: isoAdd(createdAt, 601_000),
    serverPrivateKeyPem: server.privateKey,
  });
  const reservation = createNetworkIntakeReservation({ manifest: preview.manifest,
    challenge, transportPrivateKeyPem: transport.privateKey,
    serverPublicKeyPem: server.publicKey, expectedAudience,
    reservedAt: isoAdd(createdAt, 2_000), expiresAt: isoAdd(createdAt, 540_000) });
  const payloadEnvelope = createNetworkIntakePayloadEnvelope({ reservation, challenge,
    payload, transportPrivateKeyPem: transport.privateKey,
    serverPublicKeyPem: server.publicKey, expectedAudience,
    createdAt: isoAdd(createdAt, 3_000) });
  const reservationOccurredAt = isoAdd(createdAt, 2_500);
  const receivedAt = isoAdd(createdAt, 4_000);
  const retentionUntil = isoAdd(reservationOccurredAt,
    appliedRetentionDays * 86_400_000);
  const reservedEvent = lifecycleEvent({ reservation, challenge,
    ordinal: ordinal * 2 - 1,
    previousEventHash,
    occurredAt: reservationOccurredAt, retentionUntil, registryId,
    retentionPolicyVersion, appliedRetentionDays, eventType: "RESERVED",
    reasonCode: null });
  const settledEvent = lifecycleEvent({ reservation, challenge,
    ordinal: reservedEvent.ordinal + 1, previousEventHash: reservedEvent.eventHash,
    occurredAt: receivedAt, retentionUntil, registryId, retentionPolicyVersion,
    appliedRetentionDays, eventType: "QUARANTINED",
    reasonCode: "PENDING_CURATE_REVIEW" });
  const receipt = createNetworkIntakeReceipt({ reservation, payloadEnvelope, challenge,
    serverPublicKeyPem: server.publicKey, expectedAudience, registryId,
    eventOrdinal: settledEvent.ordinal, eventHash: settledEvent.eventHash,
    objectAlreadyPresent: false, receivedAt, retentionUntil,
    serverPrivateKeyPem: server.privateKey });
  const policy = trustPolicy(server, expectedAudience, registryId,
    retentionPolicyVersion, appliedRetentionDays);
  const body = {
    schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle,
    bundleClass: "EXISTING_NETWORK_WIRE_SOURCE_REPLAYED_QUARANTINE_HOLD_ONLY",
    preview,
    networkTrust: { expectedAudience, expectedRegistryId: registryId,
      expectedRetentionPolicyVersion: retentionPolicyVersion,
      maxAppliedRetentionDays: appliedRetentionDays,
      challengeServerKeyId: stage5KeyId(server.publicKey),
      challengeKeyEpochValidAtIssuedAt: true,
      receiptServerKeyId: stage5KeyId(server.publicKey),
      receiptKeyEpochValidAtReceivedAt: true,
      externalTrustPinsApplied: true },
    challenge, reservation, payloadEnvelope,
    reservationEvent: reservedEvent, settlementEvent: settledEvent, receipt,
    transport: { transportSignerKeyId: reservation.transportSignerKeyId,
      transportPossessionProofVerified: true,
      transportSignerIsActorIdentity: false,
      transportSignerIsAuthority: false,
      transportSignerIsOutcomeAdjudicator: false },
    disposition: "QUARANTINED", decision: "HOLD",
    boundary: OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
  };
  const bundle = { ...body, bundleHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle, body) };
  const checked = verifyOutsiderNetworkNodeSubmissionBundle(bundle, {
    expectedBundleHash: bundle.bundleHash, trustPolicy: policy });
  if (!checked.ok) throw new Error(checked.error);
  return { bundle, trustRow: { lane, expectedBundleHash: bundle.bundleHash,
    trustPolicy: policy }, transport, server };
}

export function createStage5BaseEpisode(t, { common, foundation,
  affectedPartyRootHash, consequenceChannelHashes, horizonId, horizonDueAfterMs,
  executionEvidenceHash }) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "outsider-stage5-network-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const directory = path.join(temporaryRoot, "obligation");
  const store = RealityObligationStore.create({ directory,
    obligationId: "stage5-first-governed-reality-obligation",
    bindings: { claimHash: common.claimHash, wayHash: common.wayHash,
      worldHash: common.worldHash, episodeHash: common.episodeHash,
      attemptHash: common.attemptHash,
      censusRegistrationHash: common.registrationHash,
      responsibilityGraphHash: stage5Hash("responsibility-graph"),
      affectedPartyRootHash,
      budgetCommitmentHash: stage5Hash("budget-commitment"),
      recoveryPolicyHash: stage5Hash("recovery-policy"),
      challengePolicyHash: stage5Hash("challenge-policy") },
    consequenceChannelHashes,
    mandatoryHorizons: [{ horizonId: "immediate", dueAfterMs: 0,
      observationRequirementHash: stage5Hash("immediate-observation"),
      mandatory: true }, { horizonId, dueAfterMs: horizonDueAfterMs,
      observationRequirementHash: stage5Hash("delayed-observation"),
      mandatory: true }],
    createdAt: "2026-08-28T00:00:00.000Z" });
  const obligation = store.snapshot();
  const materializedSubject = { claimHash: common.claimHash, wayHash: common.wayHash,
    worldHash: common.worldHash, episodeHash: common.episodeHash,
    attemptHash: common.attemptHash,
    actorIdentityEnvelopeHash: foundation.actorEnvelope.actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash: foundation.actorEnvelope.actorSubjectHash,
    attemptActorSubjectHash: foundation.actorEnvelope.attemptActorSubjectHash,
    cohortHash: common.cohortHash, censusSlotHash: common.slotHash };
  const censusSubject = structuredClone(
    foundation.censusProjection.networkProjection.subject);
  const censusPayload = structuredClone(
    foundation.censusProjection.networkProjection.payload);
  const delegationPayload = {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.DELEGATION_RESPONSIBILITY,
    accountableDeploymentSubjectHash: materializedSubject.accountableDeploymentSubjectHash,
    delegationEnvelopeHash: stage5Hash("delegation-envelope"),
    capabilityRadiusHash: stage5Hash("capability-radius"),
    authorityRadiusHash: stage5Hash("authority-radius"),
    evidenceRadiusHash: stage5Hash("evidence-radius"),
    responsibilityRadiusHash: stage5Hash("responsibility-radius"),
    responsibilityCommitmentHash: stage5Hash("responsibility-commitment"),
    ownerWriteGateConformanceHash: null,
    authorityEstablished: false,
    responsibilityCoverageEstablished: false,
  };
  const actionPayload = {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
    attemptRecordHash: common.attemptHash,
    executionEvidenceHash,
    outcomeEvidenceHash: stage5Hash("base-outcome-evidence"),
    obligationStateHash: obligation.stateHash,
    sourceArtifactHash: stage5Hash("base-source-artifact"),
    sourceReplayReferenceHash: stage5Hash("base-source-replay"),
    externalOutcomeVerified: false,
    causalAttributionEstablished: false,
    obligationClosed: false,
  };
  const rows = [
    createStage5NodeBundle({ lane: "PROSPECTIVE_CENSUS", subject: censusSubject,
      payload: censusPayload, source: { sourceManifestHash: stage5Hash("census-source"),
        instrumentHash: stage5Hash("census-instrument"),
        rightsReviewHash: stage5Hash("census-rights"),
        privacyReviewHash: stage5Hash("census-privacy") },
      clientSubmissionId: "stage5_census_base", createdAt: "2026-08-28T00:00:00.000Z",
      ordinal: 1 }),
    createStage5NodeBundle({ lane: "DELEGATION_RESPONSIBILITY",
      subject: materializedSubject, payload: delegationPayload,
      source: { sourceManifestHash: stage5Hash("delegation-source"),
        instrumentHash: stage5Hash("delegation-instrument"),
        rightsReviewHash: stage5Hash("delegation-rights"),
        privacyReviewHash: stage5Hash("delegation-privacy") },
      clientSubmissionId: "stage5_delegation_base",
      createdAt: "2026-08-28T00:00:00.000Z", ordinal: 2 }),
    createStage5NodeBundle({ lane: "ACTION_OUTCOME", subject: materializedSubject,
      payload: actionPayload, source: { sourceManifestHash: stage5Hash("action-source"),
        instrumentHash: stage5Hash("action-instrument"),
        rightsReviewHash: stage5Hash("action-rights"),
        privacyReviewHash: stage5Hash("action-privacy") },
      clientSubmissionId: "stage5_action_base",
      createdAt: "2026-08-28T00:00:00.000Z", ordinal: 3 }),
  ];
  const input = { prospectiveCensus: { source: foundation.censusSource,
    projection: foundation.censusProjection },
  actorIdentity: { source: foundation.actorSource, envelope: foundation.actorEnvelope },
  laneBundles: rows.map(({ bundle }) => bundle),
  obligationPrefix: { directory, expectedRevision: obligation.revision,
    expectedStateHash: obligation.stateHash,
    expectedGenesisHash: obligation.genesis.genesisHash } };
  const laneTrust = rows.map(({ trustRow }) => trustRow);
  const join = createOutsiderNetworkCompleteEpisodeJoin(input, { laneTrust });
  return { temporaryRoot, directory, store, obligation, materializedSubject,
    rows, input, laneTrust, join };
}
