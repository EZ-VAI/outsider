import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
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
import { RealityObligationStore } from "../src/outsider-reality-obligation-store.js";
import {
  createOutsiderNetworkCompleteEpisodeJoin,
} from "../src/outsider-network-complete-episode.js";
import {
  OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_BOUNDARY,
  OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_SCHEMAS,
  buildOutsiderNetworkNodeContractConformance,
  verifyOutsiderNetworkNodeContractConformance,
} from "../src/outsider-network-node-contract-conformance.js";

function h(label) {
  return `sha256:${createHash("sha256").update(`contract:${label}`).digest("hex")}`;
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

function keyEpoch(key) {
  return {
    keyId: keyId(key.publicKey),
    publicKeyPem: key.publicKey,
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-29T00:00:00.000Z",
  };
}

function trustPolicy(server) {
  return {
    expectedAudience: "https://intake.outsider.example",
    expectedRegistryId: "registry-a",
    expectedRetentionPolicyVersion: "outsider/network-retention-policy/v1",
    maxAppliedRetentionDays: 30,
    challengeServerKeyEpochs: [keyEpoch(server)],
    receiptServerKeyEpochs: [keyEpoch(server)],
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
  retentionUntil, eventType, reasonCode }) {
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
    registryId: "registry-a",
    retentionPolicyVersion: "outsider/network-retention-policy/v1",
    appliedRetentionDays: 30,
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

function contractTarget(kind, lane, payload, references) {
  if (lane === "DELEGATION_RESPONSIBILITY" && kind === "ACTOR_IDENTITY") {
    return references.actorIdentityEnvelopeHash;
  }
  if (lane === "DELEGATION_RESPONSIBILITY"
    && kind === "DELEGATION_RESPONSIBILITY") return payload.delegationEnvelopeHash;
  if (lane === "ACTION_OUTCOME" && kind === "COMMAND_EFFECT") {
    return payload.executionEvidenceHash;
  }
  if (lane === "ACTION_OUTCOME" && kind === "OUTCOME_RECOVERY") {
    return payload.outcomeEvidenceHash;
  }
  if (lane === "ACTION_OUTCOME" && kind === "OBLIGATION_LIFECYCLE") {
    return references.obligationStateHash;
  }
  if (lane === "PROSPECTIVE_CENSUS" && kind === "PROSPECTIVE_CENSUS") {
    return references.prospectiveCensusProjectionHash;
  }
  return h(`unused-conformance:${lane}:${kind}`);
}

function adapters(lane, payload, references, mismatchKind) {
  return OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.map((kind) => ({
    kind,
    status: "DECLARED_UNVERIFIED",
    artifactSchema: `outsider/node-adapter-${kind.toLowerCase()}/v1`,
    adapterImplementationHash: h(`implementation:${lane}:${kind}`),
    conformanceEvidenceRefHash: mismatchKind === kind
      ? h(`mismatch:${lane}:${kind}`) : contractTarget(kind, lane, payload, references),
  }));
}

function lanePayload(lane, selectedSubject, census, obligationStateHash) {
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
  references, mismatchKind) {
  const transport = pair();
  const server = pair();
  const payload = lanePayload(lane, selectedSubject, census, obligationStateHash);
  const preview = createOutsiderNetworkNodeSubmissionPreview({
    manifestInput: {
      lane,
      clientSubmissionId: `contract_${lane.toLowerCase()}`,
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
    adapterDeclarations: adapters(lane, payload, references, mismatchKind),
    nativeSafetyEvidenceRefs: [],
  });
  const manifest = preview.manifest;
  const expectedAudience = "https://intake.outsider.example";
  const challenge = createNetworkIntakeChallenge({
    manifestHash: manifest.manifestHash,
    transportSignerKeyId: keyId(transport.publicKey),
    audience: expectedAudience,
    nonce: `contract_${lane.toLowerCase()}_nonce_000001`,
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
  const retentionUntil = "2026-09-27T00:02:30.000Z";
  const reservationEvent = lifecycleEvent({
    reservation,
    challenge,
    ordinal: ordinal * 2 - 1,
    previousEventHash: h(`previous-event:${lane}`),
    occurredAt: "2026-08-28T00:02:30.000Z",
    retentionUntil,
    eventType: "RESERVED",
    reasonCode: null,
  });
  const settlementEvent = lifecycleEvent({
    reservation,
    challenge,
    ordinal: reservationEvent.ordinal + 1,
    previousEventHash: reservationEvent.eventHash,
    occurredAt: "2026-08-28T00:04:00.000Z",
    retentionUntil,
    eventType: "QUARANTINED",
    reasonCode: "PENDING_CURATE_REVIEW",
  });
  const receipt = createNetworkIntakeReceipt({
    reservation,
    payloadEnvelope,
    challenge,
    serverPublicKeyPem: server.publicKey,
    expectedAudience,
    registryId: "registry-a",
    eventOrdinal: settlementEvent.ordinal,
    eventHash: settlementEvent.eventHash,
    objectAlreadyPresent: ordinal === 3,
    receivedAt: "2026-08-28T00:04:00.000Z",
    retentionUntil,
    serverPrivateKeyPem: server.privateKey,
  });
  const policy = trustPolicy(server);
  const body = {
    schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle,
    bundleClass: "EXISTING_NETWORK_WIRE_SOURCE_REPLAYED_QUARANTINE_HOLD_ONLY",
    preview,
    networkTrust: {
      expectedAudience,
      expectedRegistryId: "registry-a",
      expectedRetentionPolicyVersion: "outsider/network-retention-policy/v1",
      maxAppliedRetentionDays: 30,
      challengeServerKeyId: keyId(server.publicKey),
      challengeKeyEpochValidAtIssuedAt: true,
      receiptServerKeyId: keyId(server.publicKey),
      receiptKeyEpochValidAtReceivedAt: true,
      externalTrustPinsApplied: true,
    },
    challenge,
    reservation,
    payloadEnvelope,
    reservationEvent,
    settlementEvent,
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
  const bundle = { ...body, bundleHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle, body) };
  const checked = verifyOutsiderNetworkNodeSubmissionBundle(bundle, {
    expectedBundleHash: bundle.bundleHash,
    trustPolicy: policy,
  });
  assert.equal(checked.ok, true, checked.error);
  return {
    bundle,
    trustRow: { lane, expectedBundleHash: bundle.bundleHash, trustPolicy: policy },
  };
}

function fixture(t, { mismatchKind = null, mismatchLane = null } = {}) {
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
  const actorSource = createActorIdentityEnvelopeSource(
    actorInput(common, censusProjection.projectionHash));
  const actorEnvelope = buildActorIdentityEnvelope(actorSource);
  const root = mkdtempSync(path.join(tmpdir(), "outsider-node-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const obligationDirectory = path.join(root, "obligation");
  const store = RealityObligationStore.create({
    directory: obligationDirectory,
    obligationId: "node-contract-obligation",
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
  const references = {
    actorIdentityEnvelopeHash: actorEnvelope.actorIdentityEnvelopeHash,
    prospectiveCensusProjectionHash: censusProjection.projectionHash,
    obligationStateHash: obligation.stateHash,
  };
  const census = { source: censusSource, projection: censusProjection };
  const lanes = [
    ["PROSPECTIVE_CENSUS", censusProjection.networkProjection.subject, 1],
    ["DELEGATION_RESPONSIBILITY", materializedSubject, 2],
    ["ACTION_OUTCOME", materializedSubject, 3],
  ].map(([lane, subject, ordinal]) => laneBundle(lane, structuredClone(subject), census,
    obligation.stateHash, ordinal, references, lane === mismatchLane ? mismatchKind : null));
  const input = {
    prospectiveCensus: census,
    actorIdentity: { source: actorSource, envelope: actorEnvelope },
    laneBundles: lanes.map(({ bundle }) => bundle),
    obligationPrefix: {
      directory: obligationDirectory,
      expectedRevision: obligation.revision,
      expectedStateHash: obligation.stateHash,
      expectedGenesisHash: obligation.genesis.genesisHash,
    },
  };
  const laneTrust = lanes.map(({ trustRow }) => trustRow);
  const join = createOutsiderNetworkCompleteEpisodeJoin(input, { laneTrust });
  return {
    completeEpisode: { input, join },
    pins: { expectedJoinHash: join.joinHash, laneTrust },
    obligation,
  };
}

function row(record, kind) {
  return record.adapterContractBindings.find((entry) => entry.kind === kind);
}

test("v2 binds six exact adapter targets and three replay roots without authority", (t) => {
  const f = fixture(t);
  const record = buildOutsiderNetworkNodeContractConformance(
    f.completeEpisode, f.pins);
  const checked = verifyOutsiderNetworkNodeContractConformance(record, {
    completeEpisode: f.completeEpisode,
    pins: f.pins,
    expectedConformanceHash: record.conformanceHash,
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(record.schema,
    OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_SCHEMAS.conformance);
  assert.equal(record.adapterContractBindings.length, 6);
  assert.equal(record.networkReplayRoots.length, 3);
  assert.equal(row(record, "ACTOR_IDENTITY").derivedTargetHash,
    f.completeEpisode.input.actorIdentity.envelope.actorIdentityEnvelopeHash);
  assert.equal(row(record, "PROSPECTIVE_CENSUS").derivedTargetHash,
    f.completeEpisode.input.prospectiveCensus.projection.projectionHash);
  assert.equal(row(record, "OBLIGATION_LIFECYCLE").derivedTargetHash,
    f.obligation.stateHash);
  for (const kind of ["DELEGATION_RESPONSIBILITY", "COMMAND_EFFECT",
    "OUTCOME_RECOVERY"]) {
    assert.equal(row(record, kind).targetReplayStatus,
      "REFERENCE_BOUND_SOURCE_NOT_REPLAYED");
  }
  assert.equal(new Set(record.adapterContractBindings.map(
    ({ derivedTargetHash }) => derivedTargetHash)).size, 6);
  for (const binding of record.adapterContractBindings) {
    assert.equal(binding.declaredConformanceEvidenceRefHash,
      binding.derivedTargetHash);
    assert.equal(binding.adapterImplementationSourceReplayed, false);
    assert.equal(binding.adapterArtifactSchemaVerified, false);
    assert.equal(binding.adapterFunctionalityVerified, false);
  }
  for (const root of record.networkReplayRoots) {
    assert.notEqual(root.objectIdentityHash, root.occurrenceIdentityHash);
    assert.equal(root.occurrenceRecorded, true);
    assert.equal(root.networkDenominatorIncremented, true);
    assert.equal(root.nodeAdapterRowsReceiptAttested, false);
    assert.equal(root.externalHeadAnchored, false);
    assert.equal(root.transportSignerIsServerActorWitnessOrAuthority, false);
  }
  assert.equal(record.typedGraph.delegationEnvelopeSourceReplayed, false);
  assert.equal(record.typedGraph.runtimeToDelegationEdgeEstablished, false);
  assert.equal(record.typedGraph.endToEndGraphContinuityEstablished, false);
  assert.equal(record.conformanceChecks.crossLaneNodeSoftwareRevisionContinuityEstablished,
    false);
  assert.equal(record.conformanceChecks.durableResponsibilitySourceReplayed, false);
  assert.equal(record.conformanceChecks.consequenceReachCommittedEvidenceEstablished, false);
  assert.equal(record.supersession.preservedV1NodeConformanceLinks.length, 3);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.equal(checked.trainingRows, 0);
  assert.deepEqual(checked.boundary,
    OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_BOUNDARY);
});

test("one SDK declaration mismatch fails closed after complete-episode replay", (t) => {
  const good = fixture(t);
  const record = buildOutsiderNetworkNodeContractConformance(
    good.completeEpisode, good.pins);
  const mismatch = fixture(t, {
    mismatchKind: "OUTCOME_RECOVERY",
    mismatchLane: "ACTION_OUTCOME",
  });
  assert.throws(() => buildOutsiderNetworkNodeContractConformance(
    mismatch.completeEpisode, mismatch.pins),
  /OUTCOME_RECOVERY_CONFORMANCE_EVIDENCE_TARGET_MISMATCH_HOLD/);
  const checked = verifyOutsiderNetworkNodeContractConformance(record, {
    completeEpisode: mismatch.completeEpisode,
    pins: mismatch.pins,
    expectedConformanceHash: record.conformanceHash,
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.status, "HOLD");
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.match(checked.error,
    /OUTCOME_RECOVERY_CONFORMANCE_EVIDENCE_TARGET_MISMATCH_HOLD/);
});

test("self-rehash and coordinated caller-pin replacement cannot verify", (t) => {
  const f = fixture(t);
  const record = buildOutsiderNetworkNodeContractConformance(
    f.completeEpisode, f.pins);
  const selfRehashed = structuredClone(record);
  selfRehashed.adapterContractBindings[0].derivedTargetHash = h("replacement-target");
  selfRehashed.adapterContractBindings[0].declaredConformanceEvidenceRefHash
    = selfRehashed.adapterContractBindings[0].derivedTargetHash;
  const body = structuredClone(selfRehashed);
  delete body.conformanceHash;
  selfRehashed.conformanceHash = networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_SCHEMAS.conformance, body);
  const selfChecked = verifyOutsiderNetworkNodeContractConformance(selfRehashed, {
    completeEpisode: f.completeEpisode,
    pins: f.pins,
    expectedConformanceHash: selfRehashed.conformanceHash,
  });
  assert.equal(selfChecked.ok, false);
  assert.match(selfChecked.error, /CONFORMANCE_SOURCE_REPLAY_INVALID/);

  const replacedPins = structuredClone(f.pins);
  replacedPins.laneTrust[0].expectedBundleHash = h("replacement-bundle-pin");
  const pinChecked = verifyOutsiderNetworkNodeContractConformance(record, {
    completeEpisode: f.completeEpisode,
    pins: replacedPins,
    expectedConformanceHash: record.conformanceHash,
  });
  assert.equal(pinChecked.ok, false);
  assert.match(pinChecked.error, /COMPLETE_EPISODE_REPLAY_REQUIRED_FIRST/);

  const conformancePinChecked = verifyOutsiderNetworkNodeContractConformance(record, {
    completeEpisode: f.completeEpisode,
    pins: f.pins,
    expectedConformanceHash: h("replacement-conformance-pin"),
  });
  assert.equal(conformancePinChecked.ok, false);
  assert.match(conformancePinChecked.error, /EXPECTED_CONFORMANCE_HASH_MISMATCH/);
});
