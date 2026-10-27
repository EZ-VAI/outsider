import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  ACTOR_IDENTITY_ENVELOPE_SCHEMAS,
  buildActorIdentityEnvelope,
  createActorIdentityEnvelopeSource,
} from "../src/outsider-actor-identity-envelope.js";
import {
  NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS,
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  createNetworkIntakeChallenge,
  createNetworkIntakePayloadEnvelope,
  createNetworkIntakeReceipt,
  createNetworkIntakeReservation,
  networkIntakeDigest,
} from "../src/outsider-network-intake.js";
import {
  OUTSIDER_NETWORK_NODE_ADAPTER_KINDS,
} from "../src/outsider-network-node-sdk.js";
import {
  OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
  OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS,
  createOutsiderNetworkNodeSubmissionPreview,
  verifyOutsiderNetworkNodeSubmissionBundle,
} from "../src/outsider-network-node-client.js";
import {
  buildProspectiveEpisodeCensusProjection,
  createProspectiveEpisodeCensusSource,
} from "../src/outsider-prospective-episode-census.js";
import {
  RealityObligationStore,
} from "../src/outsider-reality-obligation-store.js";
import {
  OUTSIDER_NETWORK_COMPLETE_EPISODE_BOUNDARY,
  createOutsiderNetworkCompleteEpisodeJoin,
  verifyOutsiderNetworkCompleteEpisodeJoin,
} from "../src/outsider-network-complete-episode.js";

function h(label) {
  return `sha256:${createHash("sha256").update(`complete:${label}`).digest("hex")}`;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function pair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function keyId(publicKeyPem) {
  return `sha256:${createHash("sha256")
    .update(createPublicKey(publicKeyPem).export({ type: "spki", format: "der" }))
    .digest("hex")}`;
}

function keyEpoch(key, { validFrom = "2026-08-27T00:00:00.000Z",
  validUntil = "2026-08-29T00:00:00.000Z" } = {}) {
  return {
    keyId: keyId(key.publicKey),
    publicKeyPem: key.publicKey,
    validFrom,
    validUntil,
  };
}

function trustPolicy(server, options = {}) {
  const receiptServer = options.receiptServer ?? server;
  return {
    expectedAudience: options.expectedAudience ?? "https://intake.outsider.example",
    expectedRegistryId: options.expectedRegistryId ?? "registry-a",
    expectedRetentionPolicyVersion: options.expectedRetentionPolicyVersion
      ?? "outsider/network-retention-policy/v1",
    maxAppliedRetentionDays: options.maxAppliedRetentionDays ?? 30,
    challengeServerKeyEpochs: options.challengeServerKeyEpochs
      ?? [keyEpoch(server, options.challengeEpoch)],
    receiptServerKeyEpochs: options.receiptServerKeyEpochs
      ?? [keyEpoch(receiptServer, options.receiptEpoch)],
  };
}

function networkDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:network-intake:${domain}:v1\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function stableOccurrenceSubjectHash(manifest) {
  const subject = manifest.subject;
  return networkDigest("stable-occurrence-subject", {
    lane: manifest.lane,
    claimHash: subject.claimHash,
    wayHash: subject.wayHash,
    worldHash: subject.worldHash,
    episodeHash: subject.episodeHash,
    attemptHash: subject.attemptHash,
    cohortHash: subject.cohortHash,
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

function lifecycleEvent({ reservation, challenge, ordinal, previousEventHash, occurredAt,
  retentionUntil, registryId, retentionPolicyVersion, appliedRetentionDays,
  eventType, reasonCode }) {
  const manifest = reservation.manifest;
  const body = {
    schema: "outsider/network-intake-event/v2",
    ordinal,
    previousEventHash,
    reservationHash: reservation.reservationHash,
    manifestHash: manifest.manifestHash,
    lane: manifest.lane,
    clientSubmissionId: manifest.clientSubmissionId,
    challengeServerKeyId: challenge.signature.keyId,
    registryId,
    retentionPolicyVersion,
    appliedRetentionDays,
    retentionUntil,
    eventType,
    objectIdentityHash: manifest.payload.objectIdentityHash,
    occurrenceIdentityHash: manifest.occurrenceIdentityHash,
    stableOccurrenceSubjectHash: stableOccurrenceSubjectHash(manifest),
    semanticSubjectHash: semanticSubjectHash(manifest),
    censusSlotHash: manifest.subject.censusSlotHash,
    occurredAt,
    disposition: "QUARANTINED",
    reasonCode,
  };
  return { ...body, eventHash: networkDigest("lifecycle-event", body) };
}

function assurance(label, assuranceClass = "SOURCE_REPLAYED_REFERENCE") {
  return assuranceClass === "NONE" ? { class: "NONE", evidenceRefHash: null } : {
    class: assuranceClass,
    evidenceRefHash: h(`assurance:${label}`),
  };
}

function normalizedAssurance(value) {
  return {
    class: value.class,
    evidenceRefHash: value.evidenceRefHash,
    effectiveAssurance: "UNVERIFIED_REFERENCE_ONLY",
    externallyEstablished: false,
  };
}

function deploymentLineageProjectionHash(value) {
  return digest("outsider/actor-deployment-lineage-projection/v1", {
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    issuerPrincipalRefHash: value.issuerPrincipalRefHash,
    lineageDeclarationRefHash: value.lineageDeclarationRefHash,
    assurance: normalizedAssurance(value.assurance),
  });
}

function deploymentRevisionHash(value, lineage) {
  const body = {
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
  };
  return digest(ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision, body);
}

function actorInput(common, censusHash) {
  const modelRefHash = h("model-ref");
  const deploymentLineage = {
    deploymentLineageRefHash: h("deployment-lineage"),
    issuerPrincipalRefHash: h("principal"),
    lineageDeclarationRefHash: h("lineage-declaration"),
    assurance: assurance("lineage", "OPERATOR_SIGNED_REFERENCE"),
  };
  const deploymentRevision = {
    deploymentLineageRefHash: deploymentLineage.deploymentLineageRefHash,
    wayHash: common.wayHash,
    runtimeClosureHash: h("runtime-closure"),
    configClosureHash: h("config-closure"),
    memoryPolicyHash: h("memory-policy"),
    controllerImplementationHash: h("controller"),
    adapterHash: h("adapter"),
    providerRootHash: h("provider"),
    topologyHash: h("topology"),
    modelArtifactRefHashes: [modelRefHash],
    dataRootHashes: [h("data-root")],
    toolchainRootHashes: [h("toolchain-root")],
    assurance: assurance("deployment-revision"),
  };
  return {
    bindings: {
      claimWayWorld: {
        claimHash: common.claimHash,
        wayHash: common.wayHash,
        worldHash: common.worldHash,
      },
      run: {
        episodeHash: common.episodeHash,
        attemptHash: common.attemptHash,
        censusHash,
        observedAt: "2026-08-28T00:00:00.000Z",
      },
    },
    principalEpoch: {
      principalRefHash: h("principal"),
      epochRefHash: h("principal-epoch"),
      trustDomainRefHash: h("trust-domain"),
      controllerKeyRefHash: h("controller-key"),
      credentialRefHash: h("credential"),
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-30T00:00:00.000Z",
      assurance: assurance("principal", "LEGAL_BINDING_REFERENCE"),
    },
    deploymentLineage,
    deploymentRevision,
    modelArtifacts: [{
      modelArtifactRefHash: modelRefHash,
      providerRevisionRefHash: h("provider-model-revision"),
      artifactRootHash: h("model-artifact-root"),
      baseModelRefHash: h("base-model"),
      tokenizerRootHash: h("tokenizer"),
      quantizationRootHash: h("quantization"),
      fineTuneState: "PROVENANCE_REFERENCE_PRESENT",
      fineTuneProvenanceRefHash: h("fine-tune-provenance"),
      assurance: assurance("model"),
    }],
    modelRoute: {
      transparency: "EXACT_ARTIFACT_BOUND",
      routePolicyHash: h("route-policy"),
      selectedModelArtifactRefHashes: [modelRefHash],
      routeEvidenceRefHash: h("route-evidence"),
      assurance: assurance("route", "OPERATOR_SIGNED_REFERENCE"),
    },
    runtimeInstance: {
      runtimeInstanceRefHash: h("runtime-instance"),
      instanceKeyRefHash: h("runtime-instance-key"),
      bootEpochRefHash: h("boot-epoch"),
      loadedWayHash: common.wayHash,
      loadedDeploymentRevisionHash:
        deploymentRevisionHash(deploymentRevision, deploymentLineage),
      workloadAttestationRefHash: h("workload-attestation"),
      memoryStateMode: "BOUND",
      memoryStateCommitmentHash: h("memory-state"),
      validFrom: "2026-08-27T12:00:00.000Z",
      validUntil: "2026-08-29T00:00:00.000Z",
      assurance: assurance("runtime", "WORKLOAD_ATTESTATION_REFERENCE"),
    },
    embodimentRevision: null,
    delegationEdges: [],
    lifecycleEdges: [],
  };
}

function adapters() {
  return OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.map((kind) => ({
    kind,
    status: "DECLARED_UNVERIFIED",
    artifactSchema: `outsider/node-adapter-${kind.toLowerCase()}/v1`,
    adapterImplementationHash: h(`implementation:${kind}`),
    conformanceEvidenceRefHash: h(`conformance:${kind}`),
  }));
}

function lanePayload(lane, selectedSubject, census, obligationStateHash,
  actionPayloadVersion = "v1") {
  if (lane === "PROSPECTIVE_CENSUS") {
    return structuredClone(census.projection.networkProjection.payload);
  }
  if (lane === "DELEGATION_RESPONSIBILITY") {
    return {
      schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.DELEGATION_RESPONSIBILITY,
      accountableDeploymentSubjectHash: selectedSubject.accountableDeploymentSubjectHash,
      delegationEnvelopeHash: h("delegation-envelope"),
      capabilityRadiusHash: h("capability-radius"),
      authorityRadiusHash: h("authority-radius"),
      evidenceRadiusHash: h("evidence-radius"),
      responsibilityRadiusHash: h("responsibility-radius"),
      responsibilityCommitmentHash: h("responsibility-commitment"),
      ownerWriteGateConformanceHash: null,
      authorityEstablished: false,
      responsibilityCoverageEstablished: false,
    };
  }
  if (actionPayloadVersion === "v2") {
    return {
      schema: NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2,
      baseActionOutcomeManifestHash: h("base-action-manifest"),
      baseActionOutcomeBundleHash: h("base-action-bundle"),
      baseActionOutcomeOccurrenceIdentityHash: h("base-action-occurrence"),
      attemptRecordHash: selectedSubject.attemptHash,
      executionEvidenceHash: h("execution-evidence"),
      observationStatus: "OBSERVED",
      outcomeWitnessEnvelopeHash: h("outcome-witness-envelope"),
      witnessSourceManifestHash: h("witness-source-manifest"),
      witnessReplayReceiptHash: h("witness-replay-receipt"),
      witnessRelationshipReviewHash: h("witness-relationship-review"),
      consequenceReportHash: h("consequence-report"),
      affectedPartyRegisterRootHash: h("affected-party-register-root"),
      affectedPartyReportSetHash: h("affected-party-report-set"),
      recoveryEvidenceSetHash: h("recovery-evidence-set"),
      obligationGenesisHash: h("obligation-genesis"),
      obligationStateHash,
      horizonId: "delayed",
      obligationHorizonCommitmentHash: h("obligation-horizon-commitment"),
      affectedPartyHorizonBindingHash: h("affected-party-horizon-binding"),
      observedAt: "2026-08-28T00:05:00.000Z",
      externalOutcomeVerified: false,
      causalAttributionEstablished: false,
      obligationClosed: false,
    };
  }
  return {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
    attemptRecordHash: selectedSubject.attemptHash,
    executionEvidenceHash: h("execution-evidence"),
    outcomeEvidenceHash: h("outcome-evidence"),
    obligationStateHash,
    sourceArtifactHash: h("source-artifact"),
    sourceReplayReferenceHash: h("source-replay"),
    externalOutcomeVerified: false,
    causalAttributionEstablished: false,
    obligationClosed: false,
  };
}

function laneBundle(lane, selectedSubject, census, obligationStateHash, ordinal,
  actionPayloadVersion = "v1") {
  const transport = pair();
  const server = pair();
  const expectedAudience = "https://intake.outsider.example";
  const payload = lanePayload(lane, selectedSubject, census, obligationStateHash,
    actionPayloadVersion);
  const preview = createOutsiderNetworkNodeSubmissionPreview({
    manifestInput: {
      lane,
      clientSubmissionId: `complete_episode_${lane.toLowerCase()}`,
      payloadSchema: payload.schema,
      payload,
      subject: selectedSubject,
      source: {
        sourceManifestHash: h(`source-manifest:${lane}`),
        instrumentHash: h(`instrument:${lane}`),
        rightsReviewHash: h(`rights:${lane}`),
        privacyReviewHash: h(`privacy:${lane}`),
      },
      consentHash: h(`consent:${lane}`),
      retentionDays: 30,
      createdAt: "2026-08-28T00:00:00.000Z",
    },
    sdkReleaseHash: h("sdk-release"),
    nodeSoftwareRevisionHash: h(`node-revision:${lane}`),
    providerPatternReview: null,
    adapterDeclarations: adapters(),
    nativeSafetyEvidenceRefs: [],
  });
  const manifest = preview.manifest;
  const challenge = createNetworkIntakeChallenge({
    manifestHash: manifest.manifestHash,
    transportSignerKeyId: keyId(transport.publicKey),
    audience: expectedAudience,
    nonce: `complete_episode_${lane.toLowerCase()}_nonce_000001`,
    issuedAt: "2026-08-28T00:00:01.000Z",
    expiresAt: "2026-08-28T00:10:01.000Z",
    serverPrivateKeyPem: server.privateKey,
  });
  const reservation = createNetworkIntakeReservation({
    manifest,
    challenge,
    transportPrivateKeyPem: transport.privateKey,
    serverPublicKeyPem: server.publicKey,
    expectedAudience,
    reservedAt: "2026-08-28T00:02:00.000Z",
    expiresAt: "2026-08-28T00:09:00.000Z",
  });
  const payloadEnvelope = createNetworkIntakePayloadEnvelope({
    reservation,
    challenge,
    payload,
    transportPrivateKeyPem: transport.privateKey,
    serverPublicKeyPem: server.publicKey,
    expectedAudience,
    createdAt: "2026-08-28T00:03:00.000Z",
  });
  const registryId = "registry-a";
  const retentionPolicyVersion = "outsider/network-retention-policy/v1";
  const appliedRetentionDays = 30;
  const reservationOccurredAt = "2026-08-28T00:02:30.000Z";
  const receivedAt = "2026-08-28T00:04:00.000Z";
  const retentionUntil = "2026-09-27T00:02:30.000Z";
  const reservedEvent = lifecycleEvent({
    reservation,
    challenge,
    ordinal: ordinal * 2 - 1,
    previousEventHash: h(`previous-event:${lane}`),
    occurredAt: reservationOccurredAt,
    retentionUntil,
    registryId,
    retentionPolicyVersion,
    appliedRetentionDays,
    eventType: "RESERVED",
    reasonCode: null,
  });
  const settledEvent = lifecycleEvent({
    reservation,
    challenge,
    ordinal: reservedEvent.ordinal + 1,
    previousEventHash: reservedEvent.eventHash,
    occurredAt: receivedAt,
    retentionUntil,
    registryId,
    retentionPolicyVersion,
    appliedRetentionDays,
    eventType: "QUARANTINED",
    reasonCode: "PENDING_CURATE_REVIEW",
  });
  const receipt = createNetworkIntakeReceipt({
    reservation,
    payloadEnvelope,
    challenge,
    serverPublicKeyPem: server.publicKey,
    expectedAudience,
    registryId,
    eventOrdinal: settledEvent.ordinal,
    eventHash: settledEvent.eventHash,
    objectAlreadyPresent: false,
    receivedAt,
    retentionUntil,
    serverPrivateKeyPem: server.privateKey,
  });
  const policy = trustPolicy(server, {
    expectedAudience,
    expectedRegistryId: registryId,
    expectedRetentionPolicyVersion: retentionPolicyVersion,
    maxAppliedRetentionDays: appliedRetentionDays,
  });
  const body = {
    schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle,
    bundleClass: "EXISTING_NETWORK_WIRE_SOURCE_REPLAYED_QUARANTINE_HOLD_ONLY",
    preview,
    networkTrust: {
      expectedAudience,
      expectedRegistryId: registryId,
      expectedRetentionPolicyVersion: retentionPolicyVersion,
      maxAppliedRetentionDays: appliedRetentionDays,
      challengeServerKeyId: keyId(server.publicKey),
      challengeKeyEpochValidAtIssuedAt: true,
      receiptServerKeyId: keyId(server.publicKey),
      receiptKeyEpochValidAtReceivedAt: true,
      externalTrustPinsApplied: true,
    },
    challenge,
    reservation,
    payloadEnvelope,
    reservationEvent: reservedEvent,
    settlementEvent: settledEvent,
    receipt,
    transport: {
      transportSignerKeyId: reservation.transportSignerKeyId,
      transportPossessionProofVerified: true,
      transportSignerIsActorIdentity: false,
      transportSignerIsAuthority: false,
      transportSignerIsOutcomeAdjudicator: false,
    },
    disposition: "QUARANTINED",
    decision: "HOLD",
    boundary: OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
  };
  const bundle = {
    ...body,
    bundleHash: networkIntakeDigest(OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle, body),
  };
  const trustRow = { lane, expectedBundleHash: bundle.bundleHash, trustPolicy: policy };
  const checked = verifyOutsiderNetworkNodeSubmissionBundle(bundle, {
    expectedBundleHash: bundle.bundleHash,
    trustPolicy: policy,
  });
  assert.equal(checked.ok, true, checked.error);
  return { bundle, trustRow, server };
}

function temporaryObligation(t) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-complete-episode-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, directory: path.join(root, "obligation") };
}

function fixture(t, { actorCensusHash = null, slotEqualsRegistration = false,
  actionObligationStateHash = null, actionEpisodeHash = null,
  actionPayloadVersion = "v1" } = {}) {
  const common = {
    claimHash: h("claim"),
    wayHash: h("way"),
    worldHash: h("world"),
    episodeHash: h("episode"),
    attemptHash: h("attempt"),
    cohortHash: h("cohort"),
    slotHash: h("slot"),
    registrationHash: h("registration"),
  };
  if (slotEqualsRegistration) common.slotHash = common.registrationHash;
  const censusSource = createProspectiveEpisodeCensusSource({
    bindings: {
      claimHash: common.claimHash,
      wayHash: common.wayHash,
      worldHash: common.worldHash,
      cohortHash: common.cohortHash,
      censusSlotHash: common.slotHash,
    },
    registration: {
      registeredAt: "2026-08-27T00:00:00.000Z",
      plannedNotBefore: "2026-08-28T00:00:00.000Z",
      plannedNotAfter: "2026-08-29T00:00:00.000Z",
      preActionRegistrationReferenceHash: common.registrationHash,
      externalTimeAnchorHash: null,
    },
    design: {
      eligibilityRuleHash: h("eligibility"),
      assignmentPolicyHash: h("assignment"),
      instrumentPlanHash: h("instrument-plan"),
      outcomePlanHash: h("outcome-plan"),
      stoppingPolicyHash: h("stopping-policy"),
      monitorPlanHash: h("monitor-plan"),
      stewardshipPlanHash: h("stewardship-plan"),
    },
  });
  const censusProjection = buildProspectiveEpisodeCensusProjection(censusSource);
  const actorSource = createActorIdentityEnvelopeSource(actorInput(common,
    actorCensusHash ?? censusProjection.projectionHash));
  const actorEnvelope = buildActorIdentityEnvelope(actorSource);
  const temporary = temporaryObligation(t);
  const store = RealityObligationStore.create({
    directory: temporary.directory,
    obligationId: "complete-episode-obligation",
    bindings: {
      claimHash: common.claimHash,
      wayHash: common.wayHash,
      worldHash: common.worldHash,
      episodeHash: common.episodeHash,
      attemptHash: common.attemptHash,
      censusRegistrationHash: common.registrationHash,
      responsibilityGraphHash: h("responsibility-graph"),
      affectedPartyRootHash: h("affected-party-root"),
      budgetCommitmentHash: h("budget-commitment"),
      recoveryPolicyHash: h("recovery-policy"),
      challengePolicyHash: h("challenge-policy"),
    },
    consequenceChannelHashes: [h("consequence-channel")],
    mandatoryHorizons: [{
      horizonId: "immediate",
      dueAfterMs: 0,
      observationRequirementHash: h("immediate-observation"),
      mandatory: true,
    }, {
      horizonId: "delayed",
      dueAfterMs: 86_400_000,
      observationRequirementHash: h("delayed-observation"),
      mandatory: true,
    }],
    createdAt: "2026-08-28T00:00:00.000Z",
  });
  const obligation = store.snapshot();
  const materializedSubject = {
    claimHash: common.claimHash,
    wayHash: common.wayHash,
    worldHash: common.worldHash,
    episodeHash: common.episodeHash,
    attemptHash: common.attemptHash,
    actorIdentityEnvelopeHash: actorEnvelope.actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash: actorEnvelope.actorSubjectHash,
    attemptActorSubjectHash: actorEnvelope.attemptActorSubjectHash,
    cohortHash: common.cohortHash,
    censusSlotHash: common.slotHash,
  };
  const censusSubject = structuredClone(censusProjection.networkProjection.subject);
  const actionSubject = structuredClone(materializedSubject);
  if (actionEpisodeHash !== null) actionSubject.episodeHash = actionEpisodeHash;
  const laneResults = [
    laneBundle("PROSPECTIVE_CENSUS", censusSubject,
      { source: censusSource, projection: censusProjection }, obligation.stateHash, 1),
    laneBundle("DELEGATION_RESPONSIBILITY", materializedSubject,
      { source: censusSource, projection: censusProjection }, obligation.stateHash, 2),
    laneBundle("ACTION_OUTCOME", actionSubject,
      { source: censusSource, projection: censusProjection },
      actionObligationStateHash ?? obligation.stateHash, 3, actionPayloadVersion),
  ];
  const laneBundles = laneResults.map((row) => row.bundle);
  const laneTrust = laneResults.map((row) => row.trustRow);
  const input = {
    prospectiveCensus: { source: censusSource, projection: censusProjection },
    actorIdentity: { source: actorSource, envelope: actorEnvelope },
    laneBundles,
    obligationPrefix: {
      directory: temporary.directory,
      expectedRevision: obligation.revision,
      expectedStateHash: obligation.stateHash,
      expectedGenesisHash: obligation.genesis.genesisHash,
    },
  };
  return { common, input, laneTrust, laneResults, obligation, temporary };
}

function createJoin(f) {
  return createOutsiderNetworkCompleteEpisodeJoin(f.input, { laneTrust: f.laneTrust });
}

function verifyJoin(join, f) {
  return verifyOutsiderNetworkCompleteEpisodeJoin(join, {
    input: f.input,
    expectedJoinHash: join.joinHash,
    laneTrust: f.laneTrust,
  });
}

test("all existing sources join structurally while independent outcome and authority remain absent",
  (t) => {
    const f = fixture(t);
    const beforeMembers = readdirSync(f.temporary.directory).sort();
    const join = createJoin(f);
    const checked = verifyJoin(join, f);
    assert.equal(checked.ok, true);
    assert.equal(join.result, "COMPLETE_EPISODE_JOIN_STRUCTURE_VERIFIED_HOLD");
    assert.equal(join.status, "HOLD");
    assert.equal(join.structuralChecks.structuralJoinVerified, true);
    assert.equal(join.sourceReplay.laneReferences.length, 3);
    assert.equal(join.sourceReplay.networkSourceReplayComplete, true);
    assert.equal(join.sourceReplay.networkSourceReplayTrusted, true);
    assert.equal(checked.networkSourceReplayTrusted, true);
    assert.equal(join.sourceReplay.obligationImmutablePrefixReplayComplete, true);
    assert.equal(join.sourceReplay.fullObligationLedgerSourceReplayComplete, false);
    assert.equal(join.sourceReplay.mutableObligationHeadRead, false);
    assert.equal(join.sourceReplay.writesPerformed, false);
    assert.equal(join.outcomeBoundary.outcomeObserverIdentityPresentInExistingSchema, false);
    assert.equal(join.outcomeBoundary.independentOutcomeEstablished, false);
    assert.equal(join.outcomeBoundary.sameSubjectSelfReportAcceptedAsIndependentOutcome, false);
    assert.equal(join.outcomeBoundary.vendorSuccessAcceptedAsOutcomeTruth, false);
    assert.equal(join.outcomeBoundary.missingIndependentOutcomeDecision, "HOLD");
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
    assert.equal(checked.trainingRows, 0);
    assert.equal(checked.causalExperienceUnits, 0);
    assert.deepEqual(checked.boundary, OUTSIDER_NETWORK_COMPLETE_EPISODE_BOUNDARY);
    assert.deepEqual(readdirSync(f.temporary.directory).sort(), beforeMembers,
      "the join verifier performs no writes");
  });

test("registration, actor census and obligation registration crosswalk while slot and ledger stay distinct",
  (t) => {
    const f = fixture(t);
    const join = createJoin(f);
    const crosswalk = join.censusCrosswalk;
    assert.equal(crosswalk.preActionRegistrationReferenceHash, f.common.registrationHash);
    assert.equal(crosswalk.actorCensusHash, crosswalk.censusLedgerProjectionHash);
    assert.equal(crosswalk.obligationCensusRegistrationHash, f.common.registrationHash);
    assert.notEqual(crosswalk.censusSlotHash,
      crosswalk.preActionRegistrationReferenceHash);
    assert.notEqual(crosswalk.censusLedgerProjectionHash,
      crosswalk.preActionRegistrationReferenceHash);
    assert.notEqual(crosswalk.censusLedgerProjectionHash, crosswalk.censusSlotHash);
    assert.equal(crosswalk.actorCensusHashEqualsCensusLedgerProjectionHash, true);
    assert.equal(crosswalk.slotHashIsRegistrationHash, false);
    assert.equal(crosswalk.registrationHashIsCensusLedgerHash, false);
  });

test("private obligation artifacts are temporary and remain 0700/0600", (t) => {
  const f = fixture(t);
  assert.equal(statSync(f.temporary.root).mode & 0o777, 0o700);
  assert.equal(statSync(f.temporary.directory).mode & 0o777, 0o700);
  assert.equal(statSync(path.join(f.temporary.directory, "genesis.json")).mode & 0o777, 0o600);
  assert.equal(statSync(path.join(f.temporary.directory, "head.json")).mode & 0o777, 0o600);
});

test("crosswalk mismatch and semantic hash role collapse fail closed", (t) => {
  const wrongActor = fixture(t, { actorCensusHash: h("different-registration") });
  assert.throws(() => createJoin(wrongActor),
    /REGISTRATION_ACTOR_OBLIGATION_CROSSWALK_MISMATCH/u);
  const collapsed = fixture(t, { slotEqualsRegistration: true });
  assert.throws(() => createJoin(collapsed),
    /SLOT_REGISTRATION_LEDGER_HASHES_MUST_REMAIN_DISTINCT/u);
});

test("ACTION_OUTCOME must bind the exact pinned obligation prefix", (t) => {
  const f = fixture(t, { actionObligationStateHash: h("another-obligation-state") });
  assert.throws(() => createJoin(f),
    /ACTION_OUTCOME_OBLIGATION_PREFIX_STATE_MISMATCH/u);
});

test("the v1 complete-episode join explicitly refuses an ACTION_OUTCOME/v2 successor",
  (t) => {
    const f = fixture(t, { actionPayloadVersion: "v2" });
    assert.equal(f.input.laneBundles[2].preview.manifest.payloadSchema,
      NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2);
    assert.throws(() => createJoin(f), /ACTION_OUTCOME_V1_REQUIRED_FOR_V1_JOIN/u);
  });

test("lane receipt, actor tuple and final join tampering never self-authorize", (t) => {
  const f = fixture(t);
  const receiptTampered = structuredClone(f.input);
  receiptTampered.laneBundles[0].receipt.receiptHash = h("forged-receipt");
  assert.throws(() => createOutsiderNetworkCompleteEpisodeJoin(receiptTampered,
    { laneTrust: f.laneTrust }), /LANE_NODE_SUBMISSION_BUNDLE_REPLAY_FAILED/u);

  const tupleMismatch = fixture(t, { actionEpisodeHash: h("different-episode") });
  assert.throws(() => createJoin(tupleMismatch),
    /DELEGATION_ACTION_MATERIALIZED_SUBJECT_MISMATCH/u);

  const join = createJoin(f);
  const selfRehashed = structuredClone(join);
  selfRehashed.outcomeBoundary.independentOutcomeEstablished = true;
  const { joinHash: ignoredJoinHash, ...selfRehashedBody } = selfRehashed;
  selfRehashed.joinHash = networkIntakeDigest(
    "outsider/network-complete-episode-join/v1", selfRehashedBody);
  const checked = verifyOutsiderNetworkCompleteEpisodeJoin(selfRehashed, {
    input: f.input,
    expectedJoinHash: selfRehashed.joinHash,
    laneTrust: f.laneTrust,
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.status, "HOLD");
  assert.equal(checked.independentOutcomeEstablished, false);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.equal(checked.trainingRows, 0);
});

test("external per-lane bundle and key-epoch pins are mandatory; lane self-signing is not trust",
  (t) => {
    const f = fixture(t);
    assert.equal(new Set(f.laneTrust.map((row) =>
      row.trustPolicy.challengeServerKeyEpochs[0].keyId)).size, 3,
    "the fixture deliberately uses a different self-signed server key per lane");

    assert.throws(() => createOutsiderNetworkCompleteEpisodeJoin(f.input),
      /JOIN_CONTEXT_FIELDS_INVALID/u);
    const join = createJoin(f);
    const missingPins = verifyOutsiderNetworkCompleteEpisodeJoin(join, {
      input: f.input,
      expectedJoinHash: join.joinHash,
    });
    assert.equal(missingPins.ok, false);
    assert.equal(missingPins.networkSourceReplayComplete, false);
    assert.equal(missingPins.networkSourceReplayTrusted, false);
    assert.equal(missingPins.status, "HOLD");
    assert.equal(missingPins.authority, "NONE");

    const wrongLaneKeyPins = structuredClone(f.laneTrust);
    wrongLaneKeyPins[0].trustPolicy.challengeServerKeyEpochs
      = structuredClone(f.laneTrust[1].trustPolicy.challengeServerKeyEpochs);
    wrongLaneKeyPins[0].trustPolicy.receiptServerKeyEpochs
      = structuredClone(f.laneTrust[1].trustPolicy.receiptServerKeyEpochs);
    assert.throws(() => createOutsiderNetworkCompleteEpisodeJoin(f.input, {
      laneTrust: wrongLaneKeyPins,
    }), /LANE_NODE_SUBMISSION_BUNDLE_REPLAY_FAILED/u);

    const wrongBundlePin = structuredClone(f.laneTrust);
    wrongBundlePin[0].expectedBundleHash = h("untrusted-node-submission-bundle");
    assert.throws(() => createOutsiderNetworkCompleteEpisodeJoin(f.input, {
      laneTrust: wrongBundlePin,
    }), /LANE_BUNDLE_EXTERNAL_HASH_PIN_MISSING/u);
  });

test("per-lane registry and retention epochs are bound outside submission bundles", (t) => {
  const f = fixture(t);
  const registrySplice = structuredClone(f.laneTrust);
  registrySplice[0].trustPolicy.expectedRegistryId = "registry-b";
  assert.throws(() => createOutsiderNetworkCompleteEpisodeJoin(f.input, {
    laneTrust: registrySplice,
  }), /LANE_NODE_SUBMISSION_BUNDLE_REPLAY_FAILED/u);

  const retentionSplice = structuredClone(f.laneTrust);
  retentionSplice[1].trustPolicy.expectedRetentionPolicyVersion
    = "outsider/network-retention-policy/v2";
  assert.throws(() => createOutsiderNetworkCompleteEpisodeJoin(f.input, {
    laneTrust: retentionSplice,
  }), /LANE_NODE_SUBMISSION_BUNDLE_REPLAY_FAILED/u);

  const retentionExpansion = structuredClone(f.laneTrust);
  retentionExpansion[2].trustPolicy.maxAppliedRetentionDays = 29;
  assert.throws(() => createOutsiderNetworkCompleteEpisodeJoin(f.input, {
    laneTrust: retentionExpansion,
  }), /LANE_NODE_SUBMISSION_BUNDLE_REPLAY_FAILED/u);
});
