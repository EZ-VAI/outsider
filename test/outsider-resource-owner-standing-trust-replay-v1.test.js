import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  ACTOR_IDENTITY_ENVELOPE_SCHEMAS,
  buildActorIdentityEnvelope,
  createActorIdentityEnvelopeSource,
} from "../src/outsider-actor-identity-envelope.js";
import { normalizeDelegationRadius }
  from "../src/outsider-delegation-radius.js";
import {
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  createNetworkIntakeChallenge,
  createNetworkIntakeManifest,
  createNetworkIntakePayloadEnvelope,
  createNetworkIntakeReceipt,
  createNetworkIntakeReservation,
  networkIntakeDigest,
} from "../src/outsider-network-intake.js";
import { networkQuarantineSourceReviewFileHash }
  from "../src/outsider-network-quarantine-source-review.js";
import {
  OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1,
  OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1,
  createExternalCapacityVerifierContextV1,
  createInitialOneUseTenderResponseV1,
  createOneUseTenderResponseDescendantV1,
  createOneUseTenderResponseOccurrenceV1,
  externalCapacitySourceSigningMessageV1,
} from "../src/outsider-one-use-tender-response-lifecycle-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_RESOURCE_OWNER_STANDING_EVENT_GENESIS_V1,
  OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY,
  OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS,
  createResourceOwnerStandingTrustReplayV1,
  createResourceOwnerStandingTrustVerifierContextV1,
  resourceOwnerStandingSourceSigningMessageV1,
  verifyResourceOwnerStandingTrustReplayV1,
} from "../src/outsider-resource-owner-standing-trust-replay-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function sha(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function alias(prefix, label) {
  return `${prefix}_${h(label).slice(7, 39)}`;
}

function mutable(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map((item) => mutable(item));
  if (value !== null && typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = mutable(item);
    return output;
  }
  return value;
}

function keyFixture() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const keyId = sha(pair.publicKey.export({ type: "spki", format: "der" }));
  return { privateKey: pair.privateKey, privateKeyPem, publicKeyPem, keyId };
}

function assurance() {
  return { class: "NONE", evidenceRefHash: null };
}

function normalizedAssurance() {
  return {
    class: "NONE",
    evidenceRefHash: null,
    effectiveAssurance: "UNVERIFIED_REFERENCE_ONLY",
    externallyEstablished: false,
  };
}

function domainDigest(domain, value) {
  return sha(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function principalProjectionHash(value) {
  return domainDigest("outsider/actor-principal-epoch-projection/v1", {
    principalRefHash: value.principalRefHash,
    epochRefHash: value.epochRefHash,
    trustDomainRefHash: value.trustDomainRefHash,
    controllerKeyRefHash: value.controllerKeyRefHash,
    credentialRefHash: value.credentialRefHash,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    assurance: normalizedAssurance(),
  });
}

function lineageProjectionHash(value) {
  return domainDigest("outsider/actor-deployment-lineage-projection/v1", {
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    issuerPrincipalRefHash: value.issuerPrincipalRefHash,
    lineageDeclarationRefHash: value.lineageDeclarationRefHash,
    assurance: normalizedAssurance(),
  });
}

function revisionHash(value, lineage) {
  const body = {
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision,
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    deploymentLineageProjectionHash: lineageProjectionHash(lineage),
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
    assurance: normalizedAssurance(),
    exactBuildClosureExternallyEstablished: false,
    deploymentContinuityEstablished: false,
  };
  return domainDigest(ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision, body);
}

function radius(label, scopeHash, limit) {
  return normalizeDelegationRadius({
    validity: {
      validFrom: "2026-09-02T00:00:00.000Z",
      validUntil: "2026-09-03T00:00:00.000Z",
    },
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [scopeHash],
      budget: { unitHash: h(`radius-unit:${label}`), limit },
    }],
  });
}

function actorFixture(label, { controllerKeyRefHash = h(`controller-key:${label}`),
  episodeHash = h(`episode:${label}`), attemptHash = h(`attempt:${label}`) } = {}) {
  const wayHash = h(`way:${label}`);
  const modelRefHash = h(`model:${label}`);
  const principalEpoch = {
    principalRefHash: h(`principal:${label}`),
    epochRefHash: h(`epoch:${label}`),
    trustDomainRefHash: h(`trust-domain:${label}`),
    controllerKeyRefHash,
    credentialRefHash: null,
    validFrom: "2026-09-01T00:00:00.000Z",
    validUntil: "2026-09-04T00:00:00.000Z",
    assurance: assurance(),
  };
  const deploymentLineage = {
    deploymentLineageRefHash: h(`lineage:${label}`),
    issuerPrincipalRefHash: principalEpoch.principalRefHash,
    lineageDeclarationRefHash: h(`lineage-declaration:${label}`),
    assurance: assurance(),
  };
  const deploymentRevision = {
    deploymentLineageRefHash: deploymentLineage.deploymentLineageRefHash,
    wayHash,
    runtimeClosureHash: h(`runtime-closure:${label}`),
    configClosureHash: h(`config-closure:${label}`),
    memoryPolicyHash: h(`memory-policy:${label}`),
    controllerImplementationHash: h(`controller:${label}`),
    adapterHash: h(`adapter:${label}`),
    providerRootHash: h(`provider-root:${label}`),
    topologyHash: h(`topology:${label}`),
    modelArtifactRefHashes: [modelRefHash],
    dataRootHashes: [],
    toolchainRootHashes: [],
    assurance: assurance(),
  };
  const delegationScopeHash = h(`delegation-scope:${label}`);
  const parentRadius = radius(label, delegationScopeHash, "2");
  const childRadius = normalizeDelegationRadius({
    validity: parentRadius.validity,
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [delegationScopeHash],
      budget: { unitHash: h(`radius-unit:${label}`), limit: "1" },
    }],
  });
  const source = createActorIdentityEnvelopeSource({
    bindings: {
      claimWayWorld: {
        claimHash: h(`claim:${label}`),
        wayHash,
        worldHash: h(`world:${label}`),
      },
      run: {
        episodeHash,
        attemptHash,
        censusHash: h(`census:${label}`),
        observedAt: "2026-09-02T13:30:00.000Z",
      },
    },
    principalEpoch,
    deploymentLineage,
    deploymentRevision,
    modelArtifacts: [{
      modelArtifactRefHash: modelRefHash,
      providerRevisionRefHash: h(`provider-model:${label}`),
      artifactRootHash: null,
      baseModelRefHash: null,
      tokenizerRootHash: null,
      quantizationRootHash: null,
      fineTuneState: "UNKNOWN",
      fineTuneProvenanceRefHash: null,
      assurance: assurance(),
    }],
    modelRoute: {
      transparency: "UNKNOWN",
      routePolicyHash: null,
      selectedModelArtifactRefHashes: [],
      routeEvidenceRefHash: null,
      assurance: assurance(),
    },
    runtimeInstance: {
      runtimeInstanceRefHash: h(`runtime-ref:${label}`),
      instanceKeyRefHash: h(`runtime-key:${label}`),
      bootEpochRefHash: h(`boot:${label}`),
      loadedWayHash: wayHash,
      loadedDeploymentRevisionHash: revisionHash(deploymentRevision,
        deploymentLineage),
      workloadAttestationRefHash: null,
      memoryStateMode: "OPAQUE",
      memoryStateCommitmentHash: null,
      validFrom: "2026-09-02T00:00:00.000Z",
      validUntil: "2026-09-03T00:00:00.000Z",
      assurance: assurance(),
    },
    embodimentRevision: null,
    delegationEdges: [{
      parent: {
        kind: "PRINCIPAL_EPOCH",
        refHash: principalProjectionHash(principalEpoch),
      },
      child: {
        kind: "ACCOUNTABLE_DEPLOYMENT",
        refHash: h(`delegated-subject:${label}`),
      },
      parentRadius,
      childRadius,
      delegationEvidenceRefHash: h(`delegation-evidence:${label}`),
      assurance: assurance(),
    }],
    lifecycleEdges: [],
  });
  return { source, envelope: buildActorIdentityEnvelope(source) };
}

function tenderFixture(accountable) {
  const graphEdge = accountable.envelope.delegationEdges[0];
  const evidenceId = alias("evidence", "owner-trust-evidence");
  return compileOutsiderOutcomeTenderV1({
    tenderId: alias("tender", "owner-trust"),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h("work-order"),
    typedGraph: {
      principalEpoch: {
        principalRefHash: accountable.envelope.principalEpoch.principalRefHash,
        epochRefHash: accountable.envelope.principalEpoch.epochRefHash,
        principalEpochProjectionHash:
          accountable.envelope.principalEpochProjectionHash,
      },
      accountableDeployment: {
        deploymentLineageRefHash:
          accountable.envelope.deploymentLineage.deploymentLineageRefHash,
        deploymentRevisionHash:
          accountable.envelope.deploymentRevision.deploymentRevisionHash,
        accountableDeploymentSubjectHash: accountable.envelope.actorSubjectHash,
      },
      runtime: {
        runtimeInstanceRefHash:
          accountable.envelope.runtimeInstance.runtimeInstanceRefHash,
        runtimeInstanceHash: accountable.envelope.runtimeInstance.runtimeInstanceHash,
      },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: {
        delegationEvidenceRefHash: graphEdge.delegationEvidenceRefHash,
        delegationEdgeHash: graphEdge.delegationEdgeHash,
      },
      episode: {
        episodeHash: accountable.envelope.bindings.run.episodeHash,
        networkCompleteEpisodeJoinHash: h("network-episode-join"),
      },
      attempt: {
        attemptHash: accountable.envelope.bindings.run.attemptHash,
        attemptActorSubjectHash: accountable.envelope.attemptActorSubjectHash,
      },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: accountable.envelope.actorIdentityEnvelopeHash,
      delegationEvidenceRefHash: graphEdge.delegationEvidenceRefHash,
      delegationEdgeHash: graphEdge.delegationEdgeHash,
      authorityScopeRefHash: h("authority-scope"),
      resourceOwnerAuthorizationRefHash: h("resource-owner-authorization"),
      rightsPrivacyPolicyRefHash: h("rights-privacy-policy"),
    },
    exactOutcome: {
      outcomeKindCode: "BOUNDED_RESOURCE_READY",
      outcomeSpecRefHash: h("outcome-spec"),
      subjectRefHash: h("subject"),
      acceptanceCriteriaRefHash: h("acceptance"),
      conditions: [{
        conditionId: alias("condition", "ready"),
        metricCode: "RESOURCE_READY_STATE",
        comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "READY", unitCode: null },
        observationWindowMs: 0,
        conditionRefHash: h("condition-ref"),
        mandatory: true,
      }],
      deadline: "2026-09-02T18:00:00.000Z",
    },
    formationDeadline: "2026-09-02T14:00:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: alias("resource", "primary"),
      resourceClassCode: "GENERIC_BOUNDED_RESOURCE",
      capabilityRefHash: h("capability"),
      quantity: 1,
      unitCode: "RESOURCE_UNIT",
      regionRefHash: h("region"),
      requiredBy: "2026-09-02T17:00:00.000Z",
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "INDEPENDENT_RESOURCE_OBSERVATION",
      evidenceRequirementRefHash: h("evidence-ref"),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2026-09-02T18:00:00.000Z",
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", "alternate"),
      triggerRefHash: h("trigger"),
      recoveryOutcomeRefHash: h("recovery-outcome"),
      resourceClassCode: "ALTERNATE_BOUNDED_RESOURCE",
      maximumAttempts: 1,
      completionDeadline: "2026-09-02T18:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h("consequence"),
      consequenceClassCode: "BOUNDED_DELAY",
      measureCode: "MAXIMUM_DELAY_MINUTES",
      maximumValue: 60,
      unitCode: "MINUTE",
      affectedChannelRefHashes: [h("channel")],
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
  });
}

function signedEnvelope(kind, payload, keys,
  signingMessage = resourceOwnerStandingSourceSigningMessageV1) {
  const signature = cryptoSign(null, signingMessage(kind, payload),
    keys.privateKey).toString("base64");
  return Buffer.from(canonicalizeStrict({
    payload,
    signature: { algorithm: "ED25519", keyId: keys.keyId,
      valueBase64: signature },
  }), "utf8");
}

function lifecycleEventPayload(base) {
  return {
    ...base,
    objectIdentityHash: networkIntakeDigest(
      "outsider/resource-owner-standing-lifecycle-object/v1", {
        sourceSystemRefHash: base.sourceSystemRefHash,
        registryRefHash: base.registryRefHash,
        lifecycleStreamRefHash: base.lifecycleStreamRefHash,
        adoptionSourceHash: base.adoptionSourceHash,
      }),
    occurrenceIdentityHash: networkIntakeDigest(
      "outsider/resource-owner-standing-lifecycle-occurrence/v1", {
        adoptionSourceHash: base.adoptionSourceHash,
        ordinal: base.ordinal,
        previousEventSourceHash: base.previousEventSourceHash,
        eventState: base.eventState,
        occurredAt: base.occurredAt,
      }),
  };
}

function intakeChain({ payload, subject, sources, objectAlreadyPresent = true }) {
  const transport = keyFixture();
  const server = keyFixture();
  const audience = "https://intake.outsider.example";
  const manifest = createNetworkIntakeManifest({
    lane: "PROSPECTIVE_CENSUS",
    clientSubmissionId: "submission_owner_standing_0001",
    payloadSchema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS,
    payload,
    subject,
    source: sources,
    consentHash: h("network-consent"),
    retentionDays: 30,
    createdAt: "2026-09-02T12:15:00.000Z",
  });
  const challenge = createNetworkIntakeChallenge({
    manifestHash: manifest.manifestHash,
    transportSignerKeyId: transport.keyId,
    audience,
    nonce: "owner_standing_nonce_0001",
    issuedAt: "2026-09-02T12:15:01.000Z",
    expiresAt: "2026-09-02T12:25:01.000Z",
    serverPrivateKeyPem: server.privateKeyPem,
  });
  const reservation = createNetworkIntakeReservation({
    manifest,
    challenge,
    transportPrivateKeyPem: transport.privateKeyPem,
    serverPublicKeyPem: server.publicKeyPem,
    expectedAudience: audience,
    reservedAt: "2026-09-02T12:16:00.000Z",
    expiresAt: "2026-09-02T12:24:00.000Z",
  });
  const payloadEnvelope = createNetworkIntakePayloadEnvelope({
    reservation,
    challenge,
    payload,
    transportPrivateKeyPem: transport.privateKeyPem,
    serverPublicKeyPem: server.publicKeyPem,
    expectedAudience: audience,
    createdAt: "2026-09-02T12:17:00.000Z",
  });
  const receipt = createNetworkIntakeReceipt({
    reservation,
    payloadEnvelope,
    challenge,
    serverPublicKeyPem: server.publicKeyPem,
    expectedAudience: audience,
    registryId: "owner-standing-registry",
    eventOrdinal: 11,
    eventHash: h("network-event-owner-standing"),
    objectAlreadyPresent,
    receivedAt: "2026-09-02T12:18:00.000Z",
    retentionUntil: "2026-10-02T12:18:00.000Z",
    serverPrivateKeyPem: server.privateKeyPem,
  });
  return {
    manifest,
    payload,
    expectedManifestHash: manifest.manifestHash,
    challenge,
    reservation,
    payloadEnvelope,
    receipt,
    challengeServerPublicKeyPem: server.publicKeyPem,
    receiptServerPublicKeyPem: server.publicKeyPem,
    expectedAudience: audience,
    expectedReservationHash: reservation.reservationHash,
    expectedReceiptHash: receipt.receiptHash,
  };
}

function fixture({ terminalState = "ADOPTED", objectAlreadyPresent = true,
  genesisOccurredAt = "2026-09-02T12:10:00.000Z" } = {}) {
  const registryKeys = keyFixture();
  const externalKeys = keyFixture();
  const accountable = actorFixture("accountable", {
    episodeHash: h("episode:accountable"),
    attemptHash: h("attempt:accountable"),
  });
  const owner = actorFixture("owner", {
    controllerKeyRefHash: registryKeys.keyId,
  });
  const tender = tenderFixture(accountable);
  const requirement = tender.resourceRequirements.items[0];
  const response = createInitialOneUseTenderResponseV1({
    tender,
    expectedTenderHash: tender.tenderHash,
    providerRefHash: h("provider"),
    requirementKind: "RESOURCE",
    requirementId: requirement.resourceRequirementId,
    discoveryRouteObjectHash: h("route-object"),
    discoveryCandidateHash: h("route-candidate"),
    quantity: requirement.quantity,
    unitCode: requirement.unitCode,
    serviceFrom: "2026-09-02T15:00:00.000Z",
    serviceUntil: "2026-09-02T16:00:00.000Z",
    responseState: "OFFERED",
    stateAt: "2026-09-02T12:05:00.000Z",
    expiresAt: "2026-09-02T17:00:00.000Z",
    reasonCode: "ONE_USE_OFFER_CREATED",
    responseNonceHash: h("response-nonce"),
    sourceResponseRefHash: h("response-source"),
  });
  const occurrence = createOneUseTenderResponseOccurrenceV1({
    response,
    ordinal: 1,
    previousOccurrenceHash:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1,
    recordedAt: "2026-09-02T12:05:01.000Z",
    occurrenceNonceHash: h("response-occurrence"),
  });
  const responses = [response];
  const responseOccurrences = [occurrence];
  if (terminalState === "EXPIRED") {
    const expiredResponse = createOneUseTenderResponseDescendantV1({
      tender,
      expectedTenderHash: tender.tenderHash,
      predecessorResponse: response,
      responseState: "EXPIRED",
      stateAt: "2026-09-02T17:00:00.000Z",
      reasonCode: "OFFER_WINDOW_EXPIRED",
      responseNonceHash: h("response-expired-nonce"),
      sourceResponseRefHash: h("response-expired-source"),
    });
    responses.push(expiredResponse);
    responseOccurrences.push(createOneUseTenderResponseOccurrenceV1({
      response: expiredResponse,
      ordinal: 2,
      previousOccurrenceHash: occurrence.occurrenceHash,
      recordedAt: "2026-09-02T17:00:00.000Z",
      occurrenceNonceHash: h("response-expired-occurrence"),
    }));
  }
  const externalContext = createExternalCapacityVerifierContextV1({
    verifierId: "example.capacity.adapter",
    verifierRevisionHash: h("capacity-verifier-revision"),
    adapterArtifactHash: h("capacity-adapter"),
    sourceSystemId: "example.capacity.source",
    semanticsSchema: "example/capacity-semantics/v1",
    standingSchema: "example/resource-owner-standing/v1",
    receiptSchema: "example/capacity-receipt/v1",
    lifecycleEventSchema: "example/capacity-event/v1",
    lifecycleHeadSchema: "example/capacity-head/v1",
    sourcePublicKeyPem: externalKeys.publicKeyPem,
    expectedSourceKeyId: externalKeys.keyId,
    sourceTrustPolicyRefHash: h("external-source-policy"),
    rightsPrivacyPolicyRefHash:
      tender.authorizationBinding.rightsPrivacyPolicyRefHash,
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-01T23:00:00.000Z",
    maximumLifecycleHeadAgeMs: 600_000,
  });
  const standingPayload = {
    schema: externalContext.standingSchema,
    sourceSystemId: externalContext.sourceSystemId,
    providerRefHash: response.providerRefHash,
    resourceOwnerRefHash: owner.envelope.principalEpochProjectionHash,
    discoveryRouteObjectHash: response.discoveryRouteObjectHash,
    discoveryCandidateHash: response.discoveryCandidateHash,
    scopeHash: response.scopeHash,
    requirementKind: response.requirementKind,
    requirementId: response.requirementId,
    requirementSetHash: response.requirementSetHash,
    requirementObjectHash: response.requirementObjectHash,
    requirementClassCode: response.requirementClassCode,
    requirementScopeRefHash: response.requirementScopeRefHash,
    quantity: response.quantity,
    unitCode: response.unitCode,
    regionRefHash: response.regionRefHash,
    quantitySemantics: response.quantitySemantics,
    validFrom: "2026-09-02T12:00:00.000Z",
    validUntil: "2026-09-02T17:00:00.000Z",
    issuedAt: "2026-09-02T11:59:00.000Z",
    standingState: "SOURCE_DECLARED_ACTIVE",
    standingEvidenceRefHash: h("standing-evidence"),
  };
  const standingBytes = signedEnvelope("STANDING", standingPayload,
    externalKeys, externalCapacitySourceSigningMessageV1);

  const context = createResourceOwnerStandingTrustVerifierContextV1({
    registryRefHash: h("owner-registry"),
    sourceSystemRefHash: h("owner-registry-source-system"),
    adapterArtifactHash: h("owner-registry-adapter"),
    semanticsSchema:
      OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.semantics,
    adoptionSchema:
      OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.adoption,
    lifecycleEventSchema:
      OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.lifecycleEvent,
    lifecycleHeadSchema:
      OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.lifecycleHead,
    rightsReviewSchema:
      OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.rightsReview,
    privacyReviewSchema:
      OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.privacyReview,
    sourcePublicKeyPem: registryKeys.publicKeyPem,
    expectedSourceKeyId: registryKeys.keyId,
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-01T23:00:00.000Z",
    maximumLifecycleHeadAgeMs: 600_000,
  });
  const semanticsBytes = signedEnvelope("SEMANTICS", {
    schema: context.semanticsSchema,
    sourceSystemRefHash: context.sourceSystemRefHash,
    registryRefHash: context.registryRefHash,
    adapterArtifactHash: context.adapterArtifactHash,
    adoptionSchema: context.adoptionSchema,
    lifecycleEventSchema: context.lifecycleEventSchema,
    lifecycleHeadSchema: context.lifecycleHeadSchema,
    rightsReviewSchema: context.rightsReviewSchema,
    privacyReviewSchema: context.privacyReviewSchema,
    ownerKeyRoleSemanticCode:
      "SOURCE_KEY_SIGNS_REGISTRY_DECLARATIONS_NOT_LEGAL_OWNER_IDENTITY",
    occurrencePolicy:
      "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-01T23:30:00.000Z",
  }, registryKeys);
  const adoptionBytes = signedEnvelope("ADOPTION", {
    schema: context.adoptionSchema,
    sourceSystemRefHash: context.sourceSystemRefHash,
    registryRefHash: context.registryRefHash,
    semanticsSourceHash: sha(semanticsBytes),
    resourceOwnerRefHash: owner.envelope.principalEpochProjectionHash,
    ownerActorIdentityEnvelopeHash: owner.envelope.actorIdentityEnvelopeHash,
    ownerPrincipalEpochProjectionHash: owner.envelope.principalEpochProjectionHash,
    providerRefHash: response.providerRefHash,
    externalStandingSourceHash: sha(standingBytes),
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    resourceOwnerAuthorizationRefHash:
      tender.authorizationBinding.resourceOwnerAuthorizationRefHash,
    scopeHash: response.scopeHash,
    lifecycleStreamRefHash: h("owner-standing-lifecycle-stream"),
    adoptedAt: "2026-09-02T12:10:00.000Z",
    validUntil: "2026-09-02T17:00:00.000Z",
    adoptionState: "SOURCE_DECLARED_ADOPTED",
  }, registryKeys);
  const reviewBase = {
    sourceSystemRefHash: context.sourceSystemRefHash,
    registryRefHash: context.registryRefHash,
    adoptionSourceHash: sha(adoptionBytes),
    policyRefHash: tender.authorizationBinding.rightsPrivacyPolicyRefHash,
    reviewState: "SOURCE_DECLARED_REVIEW_PRESENT_NOT_ADJUDICATED",
    reviewerIndependenceClaimed: false,
    issuedAt: "2026-09-02T12:10:30.000Z",
    validFrom: "2026-09-02T12:10:30.000Z",
    validUntil: "2026-09-02T17:00:00.000Z",
  };
  const rightsBytes = signedEnvelope("RIGHTS_REVIEW", {
    schema: context.rightsReviewSchema,
    ...reviewBase,
    reviewKind: "RIGHTS",
    sourceArtifactRefHash: h("rights-source-artifact"),
  }, registryKeys);
  const privacyBytes = signedEnvelope("PRIVACY_REVIEW", {
    schema: context.privacyReviewSchema,
    ...reviewBase,
    reviewKind: "PRIVACY",
    sourceArtifactRefHash: h("privacy-source-artifact"),
  }, registryKeys);

  const events = [];
  const eventHashes = [];
  const firstEvent = signedEnvelope("LIFECYCLE_EVENT", lifecycleEventPayload({
    schema: context.lifecycleEventSchema,
    sourceSystemRefHash: context.sourceSystemRefHash,
    registryRefHash: context.registryRefHash,
    lifecycleStreamRefHash: h("owner-standing-lifecycle-stream"),
    adoptionSourceHash: sha(adoptionBytes),
    ordinal: 1,
    previousEventSourceHash:
      OUTSIDER_RESOURCE_OWNER_STANDING_EVENT_GENESIS_V1,
    eventState: "ADOPTED",
    occurredAt: genesisOccurredAt,
  }), registryKeys);
  events.push(firstEvent);
  eventHashes.push(sha(firstEvent));
  if (terminalState !== "ADOPTED") {
    const occurredAt = terminalState === "EXPIRED"
      ? "2026-09-02T17:00:00.000Z" : "2026-09-02T13:25:00.000Z";
    const terminal = signedEnvelope("LIFECYCLE_EVENT", lifecycleEventPayload({
      schema: context.lifecycleEventSchema,
      sourceSystemRefHash: context.sourceSystemRefHash,
      registryRefHash: context.registryRefHash,
      lifecycleStreamRefHash: h("owner-standing-lifecycle-stream"),
      adoptionSourceHash: sha(adoptionBytes),
      ordinal: 2,
      previousEventSourceHash: sha(firstEvent),
      eventState: terminalState,
      occurredAt,
    }), registryKeys);
    events.push(terminal);
    eventHashes.push(sha(terminal));
  }
  const headObservedAt = terminalState === "EXPIRED"
    ? "2026-09-02T17:00:00.000Z" : "2026-09-02T13:29:00.000Z";
  const headBytes = signedEnvelope("LIFECYCLE_HEAD", {
    schema: context.lifecycleHeadSchema,
    sourceSystemRefHash: context.sourceSystemRefHash,
    registryRefHash: context.registryRefHash,
    lifecycleStreamRefHash: h("owner-standing-lifecycle-stream"),
    adoptionSourceHash: sha(adoptionBytes),
    eventCount: events.length,
    coveredFromOrdinal: 1,
    coveredToOrdinal: events.length,
    headEventSourceHash: eventHashes[eventHashes.length - 1],
    currentState: terminalState,
    observedAt: headObservedAt,
    occurrencePolicy:
      "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
    rightsReviewSourceHash: sha(rightsBytes),
    privacyReviewSourceHash: sha(privacyBytes),
  }, registryKeys);
  const intakePayload = {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS,
    cohortCommitmentHash: response.providerRefHash,
    censusSlotCommitmentHash: sha(adoptionBytes),
    eligibilityRuleHash: sha(semanticsBytes),
    assignmentPolicyHash: sha(standingBytes),
    instrumentPlanHash: networkQuarantineSourceReviewFileHash(
      "INSTRUMENT", adoptionBytes),
    preActionRegistrationReferenceHash: eventHashes[0],
    externalTimeAnchorHash: null,
    prospectiveRegistrationEstablishedAtNetworkEdge: false,
    scientificCensusCompletenessEstablishedAtNetworkEdge: false,
  };
  const networkIntakeReplay = intakeChain({
    payload: intakePayload,
    subject: {
      claimHash: tender.workOrderHash,
      wayHash: accountable.envelope.bindings.claimWayWorld.wayHash,
      worldHash: accountable.envelope.bindings.claimWayWorld.worldHash,
      episodeHash: tender.typedGraph.episode.episodeHash,
      attemptHash: tender.typedGraph.attempt.attemptHash,
      actorIdentityEnvelopeHash: accountable.envelope.actorIdentityEnvelopeHash,
      accountableDeploymentSubjectHash:
        tender.typedGraph.accountableDeployment.accountableDeploymentSubjectHash,
      attemptActorSubjectHash:
        tender.typedGraph.attempt.attemptActorSubjectHash,
      cohortHash: response.providerRefHash,
      censusSlotHash: sha(adoptionBytes),
    },
    sources: {
      sourceManifestHash: networkQuarantineSourceReviewFileHash(
        "SOURCE_MANIFEST", semanticsBytes),
      instrumentHash: networkQuarantineSourceReviewFileHash(
        "INSTRUMENT", adoptionBytes),
      rightsReviewHash: networkQuarantineSourceReviewFileHash(
        "RIGHTS_REVIEW", rightsBytes),
      privacyReviewHash: networkQuarantineSourceReviewFileHash(
        "PRIVACY_REVIEW", privacyBytes),
    },
    objectAlreadyPresent,
  });
  const source = {
    tender,
    expectedTenderHash: tender.tenderHash,
    accountableIdentityReplay: {
      source: accountable.source,
      envelope: accountable.envelope,
      expectedSourceHash: accountable.source.sourceHash,
      expectedEnvelopeHash: accountable.envelope.actorIdentityEnvelopeHash,
    },
    ownerIdentityReplay: {
      source: owner.source,
      envelope: owner.envelope,
      expectedSourceHash: owner.source.sourceHash,
      expectedEnvelopeHash: owner.envelope.actorIdentityEnvelopeHash,
    },
    oneUseResponseReplay: {
      responses,
      occurrences: responseOccurrences,
      expectedOccurrenceCount: responseOccurrences.length,
      expectedLifecycleHeadHash:
        responseOccurrences[responseOccurrences.length - 1].occurrenceHash,
    },
    externalStandingReplay: {
      verifierContext: externalContext,
      expectedVerifierContextHash: externalContext.verifierContextHash,
      standingSourceBytes: standingBytes,
      expectedStandingSourceHash: sha(standingBytes),
    },
    registryContext: context,
    expectedRegistryContextHash: context.contextHash,
    semanticsSourceBytes: semanticsBytes,
    expectedSemanticsSourceHash: sha(semanticsBytes),
    adoptionSourceBytes: adoptionBytes,
    expectedAdoptionSourceHash: sha(adoptionBytes),
    lifecycleEventSourceBytes: events,
    expectedLifecycleEventSourceHashes: eventHashes,
    expectedLifecycleEventCount: events.length,
    lifecycleHeadSourceBytes: headBytes,
    expectedLifecycleHeadSourceHash: sha(headBytes),
    rightsReviewSourceBytes: rightsBytes,
    expectedRightsReviewSourceHash: sha(rightsBytes),
    privacyReviewSourceBytes: privacyBytes,
    expectedPrivacyReviewSourceHash: sha(privacyBytes),
    networkIntakeReplay,
    observedAt: terminalState === "EXPIRED"
      ? "2026-09-02T17:00:00.000Z" : "2026-09-02T13:30:00.000Z",
  };
  return { source, tender, response, accountable, owner, registryKeys,
    externalKeys };
}

test("exact source replay reaches only the explicit source-declarations HOLD", () => {
  const f = fixture();
  const created = createResourceOwnerStandingTrustReplayV1(f.source);
  const checked = verifyResourceOwnerStandingTrustReplayV1(f.source,
    created.replayHash);
  assert.equal(checked.ok, true);
  assert.equal(checked.strongestState,
    "SOURCE_DECLARATIONS_REPLAYED_EXTERNAL_OWNER_TRUST_ROOT_UNESTABLISHED_HOLD");
  assert.equal(checked.typedGraphPathBoundExactly, true);
  assert.equal(checked.rawSourceReplayPerformed, true);
  assert.equal(checked.ownerIdentityReferenceGraphReplayed, true);
  assert.equal(checked.externalStandingExactBytesReplayed, true);
  assert.equal(checked.ownerRegistrySignaturesVerifiedForPinnedSource, true);
  assert.equal(checked.lifecycleOccurrenceDenominatorReplayed, true);
  assert.equal(checked.preActionRegistrationReferenceHash,
    sha(f.source.lifecycleEventSourceBytes[0]));
  assert.notEqual(checked.preActionRegistrationReferenceHash,
    checked.lifecycleHeadSourceHash);
  assert.equal(checked.preActionRegistrationGenesisEventReplayed, true);
  assert.equal(
    checked.preActionRegistrationPrecededIntakeManifestAndReceipt, true);
  assert.equal(
    checked.currentLifecycleHeadReplayedSeparatelyFromPreActionRegistration,
    true);
  assert.equal(checked.rightsReviewExactBytesReplayed, true);
  assert.equal(checked.privacyReviewExactBytesReplayed, true);
  assert.equal(checked.networkIntakeChainSourceReplayed, false);
  assert.equal(checked.callerScopedNetworkTransportConsistencyChecked, true);
  assert.equal(
    checked.callerScopedReceiptSignatureConsistentWithCallerProvidedServerKey,
    true);
  assert.equal(checked.callerScopedReceiptDeclaredObjectAlreadyPresent, true);
  assert.notEqual(checked.callerScopedNetworkObjectIdentityHash,
    checked.callerScopedNetworkOccurrenceIdentityHash);
  assert.equal(checked.networkOccurrenceRecorded, false);
  assert.equal(checked.externalNetworkCensusEvidenceEstablished, false);
  assert.equal(checked.sourceDeclaredOwnerStandingCurrent, true);
  assert.equal(checked.independentResourceOwnerTrustAnchorReplayed, false);
  assert.equal(checked.resourceOwnerLegalIdentityEstablished, false);
  assert.equal(checked.resourceOwnerStandingEstablished, false);
  assert.equal(checked.externalCapacityEstablished, false);
  assert.equal(checked.capacityReserved, false);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.equal(checked.executable, false);
  assert.equal(checked.enabledCapabilityCount, 0);
  assert.equal(checked.provenAuthorityCount, 0);
  assert.equal(checked.consequenceReach, "NONE");
  assert.deepEqual(checked.boundary,
    OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY);
  for (const forbidden of ["sourcePublicKeyPem", "sourceSystemId", "rawBytes",
    "privateKey", "deviceId"]) {
    assert.equal(Object.hasOwn(checked, forbidden), false);
  }
  assert.equal(canonicalizeStrict(checked).includes("-----BEGIN PUBLIC KEY-----"),
    false);
  assert.equal(checked.ipAddressAcceptedAsIdentity, false);
  assert.equal(checked.baseModelAcceptedAsIdentity, false);
  assert.equal(checked.globalScoreCreated, false);
});

test("a later revocation head replays independently of pre-action registration", () => {
  const f = fixture({ terminalState: "REVOKED" });
  const created = createResourceOwnerStandingTrustReplayV1(f.source);
  const currentHead = JSON.parse(
    f.source.lifecycleHeadSourceBytes.toString("utf8"));
  assert.equal(Date.parse(currentHead.payload.observedAt)
    > Date.parse(f.source.networkIntakeReplay.receipt.receivedAt), true);
  assert.equal(created.ok, true);
  assert.equal(created.lifecycleEventCount, 2);
  assert.equal(created.lifecycleDistinctObjectCount, 1,
    "content dedup does not reduce the two-occurrence denominator");
  assert.equal(created.preActionRegistrationReferenceHash,
    sha(f.source.lifecycleEventSourceBytes[0]));
  assert.notEqual(created.preActionRegistrationReferenceHash,
    created.lifecycleHeadSourceHash);
  assert.equal(created.preActionRegistrationGenesisEventReplayed, true);
  assert.equal(
    created.currentLifecycleHeadReplayedSeparatelyFromPreActionRegistration,
    true);
  assert.equal(created.sourceDeclaredOwnerStandingCurrent, false);
  assert.equal(created.resourceOwnerStandingEstablished, false);
  assert.equal(created.capacityReserved, false);
});

test("a future genesis event cannot masquerade as pre-action registration", () => {
  const f = fixture({
    genesisOccurredAt: "2026-09-02T12:20:00.000Z",
  });
  const failed = verifyResourceOwnerStandingTrustReplayV1(f.source,
    h("unreachable-replay-pin"));
  assert.equal(failed.ok, false);
  assert.match(failed.error,
    /NETWORK_INTAKE_PRE_ACTION_REGISTRATION_AFTER_INTAKE/u);
  assert.equal(failed.preActionRegistrationGenesisEventReplayed, false);
  assert.equal(
    failed.preActionRegistrationPrecededIntakeManifestAndReceipt, false);
  assert.equal(failed.networkOccurrenceRecorded, false);
  assert.equal(failed.resourceOwnerStandingEstablished, false);
  assert.equal(failed.capacityReserved, false);
  assert.equal(failed.authority, "NONE");
  assert.equal(failed.actionReady, false);
});

test("expiration remains replayable history without a current standing claim", () => {
  const f = fixture({ terminalState: "EXPIRED" });
  const created = createResourceOwnerStandingTrustReplayV1(f.source);
  assert.equal(created.ok, true);
  assert.equal(created.lifecycleEventCount, 2);
  assert.equal(created.sourceDeclaredOwnerStandingCurrent, false);
  assert.equal(created.externalStandingCurrentAtObservedAt, false);
  assert.equal(created.rightsReviewCurrentAtObservedAt, false);
  assert.equal(created.privacyReviewCurrentAtObservedAt, false);
  assert.equal(created.capacityReserved, false);
});

test("derived output and a resealed output cannot substitute for raw source replay", () => {
  const f = fixture();
  const created = createResourceOwnerStandingTrustReplayV1(f.source);
  const outputOnly = verifyResourceOwnerStandingTrustReplayV1(created,
    created.replayHash);
  assert.equal(outputOnly.ok, false);
  assert.equal(outputOnly.rawSourceReplayPerformed, false);
  const resealed = mutable(created);
  resealed.capacityReserved = true;
  resealed.replayHash = domainDigest(
    OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.replay,
    Object.fromEntries(Object.entries(resealed)
      .filter(([key]) => key !== "replayHash")));
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(resealed,
    resealed.replayHash).ok, false);
});

test("typed graph splices fail across every fixed identity path", () => {
  const fields = [
    ["principalEpoch", "principalEpochProjectionHash"],
    ["accountableDeployment", "accountableDeploymentSubjectHash"],
    ["runtime", "runtimeInstanceHash"],
    ["delegation", "delegationEdgeHash"],
    ["episode", "episodeHash"],
    ["attempt", "attemptHash"],
  ];
  for (const [layer, field] of fields) {
    const f = fixture();
    const source = mutable(f.source);
    source.tender.typedGraph[layer][field] = h(`splice:${layer}:${field}`);
    assert.equal(verifyResourceOwnerStandingTrustReplayV1(source, h("pin")).ok,
      false, `${layer}.${field}`);
  }
});

test("owner identity, controller-key reference, and standing owner cannot be spliced", () => {
  const ownerRef = fixture();
  const standing = JSON.parse(ownerRef.source.externalStandingReplay
    .standingSourceBytes.toString("utf8"));
  standing.payload.resourceOwnerRefHash = h("different-owner");
  ownerRef.source.externalStandingReplay.standingSourceBytes
    = Buffer.from(canonicalizeStrict(standing));
  ownerRef.source.externalStandingReplay.expectedStandingSourceHash
    = sha(ownerRef.source.externalStandingReplay.standingSourceBytes);
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(ownerRef.source,
    h("pin")).ok, false);

  const controller = fixture();
  const controllerSource = mutable(controller.source);
  controllerSource.ownerIdentityReplay.source.principalEpoch.controllerKeyRefHash
    = h("different-controller");
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(controllerSource,
    h("pin")).ok, false);
});

test("lifecycle occurrence denominator, order, and caller-pinned head are exact", () => {
  const missing = fixture({ terminalState: "REVOKED" });
  missing.source.lifecycleEventSourceBytes.pop();
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(missing.source,
    h("pin")).ok, false);

  const duplicate = fixture({ terminalState: "REVOKED" });
  const second = JSON.parse(duplicate.source.lifecycleEventSourceBytes[1]
    .toString("utf8"));
  const first = JSON.parse(duplicate.source.lifecycleEventSourceBytes[0]
    .toString("utf8"));
  second.payload.occurrenceIdentityHash = first.payload.occurrenceIdentityHash;
  duplicate.source.lifecycleEventSourceBytes[1]
    = Buffer.from(canonicalizeStrict(second));
  duplicate.source.expectedLifecycleEventSourceHashes[1]
    = sha(duplicate.source.lifecycleEventSourceBytes[1]);
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(duplicate.source,
    h("pin")).ok, false);

  const head = fixture();
  head.source.expectedLifecycleHeadSourceHash = h("wrong-head");
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(head.source, h("pin")).ok,
    false);
});

test("rights and privacy bytes are kind-separated, exact, and never clearance", () => {
  const f = fixture();
  const swapped = mutable(f.source);
  swapped.rightsReviewSourceBytes = f.source.privacyReviewSourceBytes;
  swapped.expectedRightsReviewSourceHash
    = f.source.expectedPrivacyReviewSourceHash;
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(swapped, h("pin")).ok,
    false);
  const checked = createResourceOwnerStandingTrustReplayV1(f.source);
  assert.equal(checked.rightsReviewSemanticsAdjudicated, false);
  assert.equal(checked.privacyReviewSemanticsAdjudicated, false);
  assert.equal(checked.rightsEstablished, false);
  assert.equal(checked.privacyEstablished, false);
});

test("network receipt stays caller-scoped and is not external census evidence", () => {
  const f = fixture({ objectAlreadyPresent: false });
  const checked = createResourceOwnerStandingTrustReplayV1(f.source);
  assert.equal(checked.callerScopedReceiptDeclaredObjectAlreadyPresent, false);
  assert.equal(checked.callerScopedNetworkTransportConsistencyChecked, true);
  assert.equal(checked.networkIntakeChainSourceReplayed, false);
  assert.equal(checked.networkOccurrenceRecorded, false);
  assert.equal(checked.externalNetworkCensusEvidenceEstablished, false);
  assert.equal(checked.occurrenceCensusSeparatedFromObjectDedup, true);
  assert.equal(checked.networkIntakeOwnerStandingLaneAvailable, false);
  assert.equal(checked.prospectiveCensusLaneUsedForOccurrenceOnly, true);
  assert.equal(checked.networkLifecycleSingleEventMembershipProofEstablished,
    false);
  assert.equal(checked.externalTransparencyAnchorEstablished, false);
  assert.equal(checked.sourceNonEquivocationEstablished, false);
  assert.equal(checked.sourceCompletenessBeyondPinnedHeadEstablished, false);
});

test("fresh self-signing cannot splice the eight intake graph subject fields", () => {
  const f = fixture();
  const original = f.source.networkIntakeReplay;
  const source = mutable(f.source);
  source.networkIntakeReplay = intakeChain({
    payload: original.payload,
    subject: {
      ...original.manifest.subject,
      claimHash: h("spliced-intake-claim"),
      wayHash: h("spliced-intake-way"),
      worldHash: h("spliced-intake-world"),
      episodeHash: h("spliced-intake-episode"),
      attemptHash: h("spliced-intake-attempt"),
      actorIdentityEnvelopeHash: h("spliced-intake-actor-envelope"),
      accountableDeploymentSubjectHash:
        h("spliced-intake-accountable-deployment"),
      attemptActorSubjectHash: h("spliced-intake-attempt-actor"),
    },
    sources: original.manifest.source,
    objectAlreadyPresent: true,
  });
  const failed = verifyResourceOwnerStandingTrustReplayV1(source,
    h("unreachable-replay-pin"));
  assert.equal(failed.ok, false);
  assert.match(failed.error,
    /NETWORK_INTAKE_OWNER_OCCURRENCE_BINDING_MISMATCH/u);
  assert.equal(failed.callerScopedNetworkTransportConsistencyChecked, false);
  assert.equal(failed.networkIntakeChainSourceReplayed, false);
  assert.equal(failed.networkOccurrenceRecorded, false);
  assert.equal(failed.externalNetworkCensusEvidenceEstablished, false);
  assert.equal(failed.resourceOwnerStandingEstablished, false);
  assert.equal(failed.capacityReserved, false);
  assert.equal(failed.authority, "NONE");
  assert.equal(failed.actionReady, false);
});

test("generated intake server keys prove only caller-scoped transport consistency", () => {
  const f = fixture();
  const checked = createResourceOwnerStandingTrustReplayV1(f.source);
  assert.equal(checked.ok, true);
  assert.equal(checked.callerScopedNetworkTransportConsistencyChecked, true);
  assert.equal(
    checked.callerScopedReceiptSignatureConsistentWithCallerProvidedServerKey,
    true);
  assert.equal(checked.networkIntakeServerTrustPolicyExternallyPinned, false);
  assert.equal(checked.networkIntakeAudienceExternallyPinned, false);
  assert.equal(checked.networkIntakeChainSourceReplayed, false);
  assert.equal(checked.networkOccurrenceRecorded, false);
  assert.equal(checked.externalNetworkCensusEvidenceEstablished, false);
  assert.equal(checked.independentResourceOwnerTrustAnchorReplayed, false);
  assert.equal(checked.resourceOwnerStandingEstablished, false);
  assert.equal(checked.externalCapacityEstablished, false);
  assert.equal(checked.capacityReserved, false);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
});

test("Proxy, accessor, sparse array, and byte-budget inputs fail before replay", () => {
  const proxy = fixture();
  proxy.source.networkIntakeReplay = new Proxy(proxy.source.networkIntakeReplay,
    {});
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(proxy.source, h("pin")).ok,
    false);

  const accessor = fixture();
  Object.defineProperty(accessor.source, "observedAt", {
    get() { throw new Error("must not execute"); },
    enumerable: true,
  });
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(accessor.source,
    h("pin")).ok, false);

  const sparse = fixture();
  sparse.source.lifecycleEventSourceBytes.length = 2;
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(sparse.source, h("pin")).ok,
    false);

  const oversized = fixture();
  oversized.source.semanticsSourceBytes = Buffer.alloc(1024 * 1024 + 1, 0x61);
  assert.equal(verifyResourceOwnerStandingTrustReplayV1(oversized.source,
    h("pin")).ok, false);
});

test("a mismatched replay pin fails closed without enabling any capability", () => {
  const f = fixture();
  const failed = verifyResourceOwnerStandingTrustReplayV1(f.source, h("wrong"));
  assert.equal(failed.ok, false);
  assert.match(failed.error, /EXPECTED_REPLAY_HASH_MISMATCH/u);
  assert.equal(failed.capacityReserved, false);
  assert.equal(failed.authority, "NONE");
  assert.equal(failed.actionReady, false);
  assert.equal(failed.executable, false);
});

test("boundary remains cross-provider HOLD and never promotes finance or action", () => {
  assert.equal(OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY
    .sourceSignaturesEstablishLegalOwnerIdentity, false);
  assert.equal(OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY
    .networkTransportReceiptEstablishesOwnerStanding, false);
  assert.equal(OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY
    .independentResourceOwnerTrustAnchorReplayed, false);
  assert.equal(OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY
    .pricingPermitted, false);
  assert.equal(OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY
    .guaranteeEstablished, false);
  assert.equal(OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY
    .settlementPermitted, false);
  assert.equal(OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1.startsWith("sha256:"),
    true);
  assert.equal(createPublicKey(fixture().registryKeys.publicKeyPem)
    .asymmetricKeyType, "ed25519");
});
