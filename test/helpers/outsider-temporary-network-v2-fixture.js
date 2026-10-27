import {
  createExternalCapacityReservationReceiptBindingV1,
  createOwnerOneUseMandateV1,
  createProviderOneUseAcceptanceV1,
} from "../../src/outsider-one-use-commitments-v1.js";
import { verifyOneUseTenderResponseLifecycleV1 }
  from "../../src/outsider-one-use-tender-response-lifecycle-v1.js";
import {
  createOutcomeFormationFoundationBoundEvaluationV1,
} from "../../src/outsider-outcome-formation-foundation-replay-v1.js";
import {
  createOutcomeFormationTemporaryNetworkNorthStarSourceV1,
  createOutcomeFormationTemporaryNetworkNorthStarV1,
} from "../../src/outsider-outcome-formation-temporary-network-north-star-v1.js";
import {
  createOutcomeFormationTemporaryNetworkV1,
  verifyOutcomeFormationTemporaryNetworkV1,
} from "../../src/outsider-outcome-formation-temporary-network-v1.js";
import {
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_BOUNDARY,
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_STATES,
  createOutcomeFormationTemporaryNetworkV2,
  verifyOutcomeFormationTemporaryNetworkV2,
} from "../../src/outsider-outcome-formation-temporary-network-v2.js";

import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";

import { canonicalizeStrict } from "../../src/canonical.js";
import {
  ACTOR_IDENTITY_ENVELOPE_SCHEMAS,
  buildActorIdentityEnvelope,
  createActorIdentityEnvelopeSource,
} from "../../src/outsider-actor-identity-envelope.js";
import { normalizeDelegationRadius }
  from "../../src/outsider-delegation-radius.js";
import {
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  createNetworkIntakeChallenge,
  createNetworkIntakeManifest,
  createNetworkIntakePayloadEnvelope,
  createNetworkIntakeReceipt,
  createNetworkIntakeReservation,
  networkIntakeDigest,
} from "../../src/outsider-network-intake.js";
import { networkQuarantineSourceReviewFileHash }
  from "../../src/outsider-network-quarantine-source-review.js";
import {
  createOutcomeResourceRouteDiscoverySnapshotV1,
} from "../../src/outsider-outcome-resource-route-discovery-v1.js";
import {
  OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1,
  createExternalCapacityVerifierContextV1,
  createInitialOneUseTenderResponseV1,
  createOneUseTenderResponseDescendantV1,
  createOneUseTenderResponseOccurrenceV1,
  externalCapacitySourceSigningMessageV1,
} from "../../src/outsider-one-use-tender-response-lifecycle-v1.js";
import {
  OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
  OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_BOUNDARY,
  OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS,
  OUTSIDER_PERMISSIONED_TRANSACTION_PERMISSION_EVENT_GENESIS_V1,
  OUTSIDER_PERMISSIONED_TRANSACTION_TRANSPORT_OCCURRENCE_GENESIS_V1,
  createPermissionedTransactionInterfaceSourceReplayV1,
  permissionedTransactionChallengeResponseNonceHashV1,
  permissionedTransactionInterfaceAdapterContextHashV1,
  permissionedTransactionInterfaceSourceSigningMessageV1,
  verifyPermissionedTransactionInterfaceSourceReplayV1,
} from "../../src/outsider-permissioned-transaction-interface-source-replay-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_RESOURCE_OWNER_STANDING_EVENT_GENESIS_V1,
  OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS,
  createResourceOwnerStandingTrustReplayV1,
  createResourceOwnerStandingTrustVerifierContextV1,
  resourceOwnerStandingSourceSigningMessageV1,
} from "../../src/outsider-resource-owner-standing-trust-replay-v1.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const sha = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;

function digest(domain, value) {
  return sha(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function setRoot(domain, hashes) {
  return digest(domain, { count: hashes.length, hashes: [...hashes].sort() });
}

function mutable(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(mutable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => (
      [key, mutable(item)])));
  }
  return value;
}

function keys() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const keyId = sha(pair.publicKey.export({ type: "spki", format: "der" }));
  return { privateKey: pair.privateKey, privateKeyPem, publicKeyPem, keyId };
}

function signed(kind, payload, key, signingMessage) {
  const signature = cryptoSign(null, signingMessage(kind, payload),
    key.privateKey).toString("base64");
  return Buffer.from(canonicalizeStrict({
    payload,
    signature: { algorithm: "ED25519", keyId: key.keyId,
      valueBase64: signature },
  }), "utf8");
}

function signedMailbox(kind, payload, key) {
  return signed(kind, payload, key,
    permissionedTransactionInterfaceSourceSigningMessageV1);
}

function assurance() {
  return { class: "NONE", evidenceRefHash: null };
}

function normalizedAssurance() {
  return { class: "NONE", evidenceRefHash: null,
    effectiveAssurance: "UNVERIFIED_REFERENCE_ONLY",
    externallyEstablished: false };
}

function principalProjectionHash(value) {
  return digest("outsider/actor-principal-epoch-projection/v1", {
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
  return digest("outsider/actor-deployment-lineage-projection/v1", {
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    issuerPrincipalRefHash: value.issuerPrincipalRefHash,
    lineageDeclarationRefHash: value.lineageDeclarationRefHash,
    assurance: normalizedAssurance(),
  });
}

function deploymentRevisionHash(value, lineage) {
  return digest(ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision, {
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
  });
}

function actor(label, options = {}) {
  const controllerKeyRefHash = options.controllerKeyRefHash
    ?? h(`controller-key:${label}`);
  const episodeHash = options.episodeHash ?? h(`episode:${label}`);
  const attemptHash = options.attemptHash ?? h(`attempt:${label}`);
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
  const scopeHash = h(`delegation-scope:${label}`);
  const radiusUnit = h(`radius-unit:${label}`);
  const parentRadius = normalizeDelegationRadius({
    validity: { validFrom: "2026-09-02T00:00:00.000Z",
      validUntil: "2026-09-03T00:00:00.000Z" },
    grants: [{ atom: "OBSERVE", scopeHashes: [scopeHash],
      budget: { unitHash: radiusUnit, limit: "2" } }],
  });
  const childRadius = normalizeDelegationRadius({
    validity: parentRadius.validity,
    grants: [{ atom: "OBSERVE", scopeHashes: [scopeHash],
      budget: { unitHash: radiusUnit, limit: "1" } }],
  });
  const source = createActorIdentityEnvelopeSource({
    bindings: {
      claimWayWorld: { claimHash: h(`claim:${label}`), wayHash,
        worldHash: h(`world:${label}`) },
      run: { episodeHash, attemptHash, censusHash: h(`census:${label}`),
        observedAt: "2026-09-02T13:30:00.000Z" },
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
    modelRoute: { transparency: "UNKNOWN", routePolicyHash: null,
      selectedModelArtifactRefHashes: [], routeEvidenceRefHash: null,
      assurance: assurance() },
    runtimeInstance: {
      runtimeInstanceRefHash: h(`runtime-ref:${label}`),
      instanceKeyRefHash: h(`runtime-key:${label}`),
      bootEpochRefHash: h(`boot:${label}`),
      loadedWayHash: wayHash,
      loadedDeploymentRevisionHash:
        deploymentRevisionHash(deploymentRevision, deploymentLineage),
      workloadAttestationRefHash: null,
      memoryStateMode: "OPAQUE",
      memoryStateCommitmentHash: null,
      validFrom: "2026-09-02T00:00:00.000Z",
      validUntil: "2026-09-03T00:00:00.000Z",
      assurance: assurance(),
    },
    embodimentRevision: null,
    delegationEdges: [{
      parent: { kind: "PRINCIPAL_EPOCH",
        refHash: principalProjectionHash(principalEpoch) },
      child: { kind: "ACCOUNTABLE_DEPLOYMENT",
        refHash: h(`delegated-subject:${label}`) },
      parentRadius,
      childRadius,
      delegationEvidenceRefHash: h(`delegation-evidence:${label}`),
      assurance: assurance(),
    }],
    lifecycleEdges: [],
  });
  return { source, envelope: buildActorIdentityEnvelope(source) };
}

function tenderFor(accountable, options = {}) {
  const edge = accountable.envelope.delegationEdges[0];
  const evidenceId = alias("evidence", "mailbox-independent");
  return compileOutsiderOutcomeTenderV1({
    tenderId: alias("tender", "mailbox"),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h("mailbox-work-order"),
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
      delegation: { delegationEvidenceRefHash: edge.delegationEvidenceRefHash,
        delegationEdgeHash: edge.delegationEdgeHash },
      episode: { episodeHash: accountable.envelope.bindings.run.episodeHash,
        networkCompleteEpisodeJoinHash: h("mailbox-episode-join") },
      attempt: { attemptHash: accountable.envelope.bindings.run.attemptHash,
        attemptActorSubjectHash: accountable.envelope.attemptActorSubjectHash },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: accountable.envelope.actorIdentityEnvelopeHash,
      delegationEvidenceRefHash: edge.delegationEvidenceRefHash,
      delegationEdgeHash: edge.delegationEdgeHash,
      authorityScopeRefHash: h("mailbox-authority-scope"),
      resourceOwnerAuthorizationRefHash: h("mailbox-owner-authorization"),
      rightsPrivacyPolicyRefHash: h("mailbox-rights-policy"),
    },
    exactOutcome: {
      outcomeKindCode: "BOUNDED_RESOURCE_READY",
      outcomeSpecRefHash: h("mailbox-outcome-spec"),
      subjectRefHash: h("mailbox-subject"),
      acceptanceCriteriaRefHash: h("mailbox-acceptance"),
      conditions: [{ conditionId: alias("condition", "ready"),
        metricCode: "RESOURCE_READY_STATE", comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "READY", unitCode: null },
        observationWindowMs: 0, conditionRefHash: h("mailbox-condition"),
        mandatory: true }],
      deadline: "2026-09-02T18:00:00.000Z",
    },
    formationDeadline: options.formationDeadline ?? "2026-09-02T14:00:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: alias("resource", "mailbox-primary"),
      resourceClassCode: "GENERIC_BOUNDED_RESOURCE",
      capabilityRefHash: h("mailbox-capability"), quantity: 1,
      unitCode: "RESOURCE_UNIT", regionRefHash: h("mailbox-region"),
      requiredBy: "2026-09-02T17:00:00.000Z", mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "INDEPENDENT_RESOURCE_OBSERVATION",
      evidenceRequirementRefHash: h("mailbox-evidence-ref"),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2026-09-02T18:00:00.000Z", mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", "mailbox-alternate"),
      triggerRefHash: h("mailbox-trigger"),
      recoveryOutcomeRefHash: h("mailbox-recovery-outcome"),
      resourceClassCode: "ALTERNATE_BOUNDED_RESOURCE", maximumAttempts: 1,
      completionDeadline: "2026-09-02T18:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED", mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h("mailbox-consequence"),
      consequenceClassCode: "BOUNDED_DELAY",
      measureCode: "MAXIMUM_DELAY_MINUTES", maximumValue: 60,
      unitCode: "MINUTE", affectedChannelRefHashes: [h("mailbox-channel")],
      irreversibleHarmAllowed: false, unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: { outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE" },
  });
}

function routeFor(tender, options = {}) {
  const requirement = tender.resourceRequirements.items[0];
  const candidateSources = [{
    occurrenceId: alias("routeocc", "mailbox"),
    requirementKind: "RESOURCE",
    requirementId: requirement.resourceRequirementId,
    routeKind: "USER_HELD_ACCOUNT",
    observedAt: "2026-09-02T12:02:00.000Z",
    validUntil: options.validUntil ?? "2026-09-02T14:00:00.000Z",
    sourceReference: {
      transactionSurfaceRefHash: h("canary-user-held-account"),
      sourceArtifactHash: h("mailbox-route-artifact"),
      sourceRevisionHash: h("mailbox-route-revision"),
      sourceRecordHash: h("mailbox-route-record"),
      sourceReplayReceiptHash: null,
      rightsReviewRefHash: null,
      privacyReviewRefHash: null,
      resourceOwnerAuthorityRefHash: null,
      contactabilityEvidenceRefHash: null,
      capacityEvidenceRefHash: null,
      providerPatternProjectionHash: null,
      networkIntakeManifestHash: null,
      networkNodeConformanceHash: null,
      federatedHandoffHash: null,
      standingCapacityGrantHash: null,
    },
    lifecycle: { revision: 0, predecessorCandidateHash: null,
      supersedesCandidateHash: null,
      revokedAt: options.revokedAt ?? null,
      revocationRefHash: options.revokedAt === undefined
        ? null : h("mailbox-route-revocation") },
  }];
  const source = { tender,
    asOf: options.asOf ?? "2026-09-02T12:02:00.000Z",
    candidateSources };
  const record = createOutcomeResourceRouteDiscoverySnapshotV1(source);
  return { source, record, candidate: record.candidateOccurrences[0],
    object: record.routeObjects[0] };
}

function requirementFor(tender, requirementKind) {
  if (requirementKind === "RESOURCE") {
    return tender.resourceRequirements.items[0];
  }
  if (requirementKind === "EVIDENCE") {
    return tender.evidenceRequirements.items[0];
  }
  if (requirementKind === "RECOVERY") {
    return tender.recoveryRequirements.items[0];
  }
  throw new TypeError(`unsupported fixture requirement kind:${requirementKind}`);
}

function requirementIdFor(requirement, requirementKind) {
  return requirementKind === "RESOURCE"
    ? requirement.resourceRequirementId
    : requirementKind === "EVIDENCE"
      ? requirement.evidenceRequirementId
      : requirement.recoveryRequirementId;
}

function multiRouteFor(tender, options = {}) {
  const kinds = ["RESOURCE", "EVIDENCE", "RECOVERY"];
  const candidateSources = kinds.map((requirementKind) => {
    const label = requirementKind.toLowerCase();
    const requirement = requirementFor(tender, requirementKind);
    return {
      occurrenceId: alias("routeocc", `multi-slot-${label}`),
      requirementKind,
      requirementId: requirementIdFor(requirement, requirementKind),
      routeKind: "USER_HELD_ACCOUNT",
      observedAt: "2026-09-02T12:02:00.000Z",
      validUntil: tender.formationDeadline,
      sourceReference: {
        transactionSurfaceRefHash: h(`multi-slot-${label}:account`),
        sourceArtifactHash: h(`multi-slot-${label}:route-artifact`),
        sourceRevisionHash: h(`multi-slot-${label}:route-revision`),
        sourceRecordHash: h(`multi-slot-${label}:route-record`),
        sourceReplayReceiptHash: null,
        rightsReviewRefHash: null,
        privacyReviewRefHash: null,
        resourceOwnerAuthorityRefHash: null,
        contactabilityEvidenceRefHash: null,
        capacityEvidenceRefHash: null,
        providerPatternProjectionHash: null,
        networkIntakeManifestHash: null,
        networkNodeConformanceHash: null,
        federatedHandoffHash: null,
        standingCapacityGrantHash: null,
      },
      lifecycle: { revision: 0, predecessorCandidateHash: null,
        supersedesCandidateHash: null,
        revokedAt: options.knownRouteRevokedAt ?? null,
        revocationRefHash: options.knownRouteRevokedAt === undefined
          || options.knownRouteRevokedAt === null
          ? null : h(`multi-slot-${label}:route-revocation`) },
    };
  });
  const source = { tender, asOf: "2026-09-02T12:02:00.000Z",
    candidateSources };
  const record = createOutcomeResourceRouteDiscoverySnapshotV1(source);
  const byKind = {};
  for (let index = 0; index < kinds.length; index += 1) {
    const requirementKind = kinds[index];
    const requirement = requirementFor(tender, requirementKind);
    const requirementId = requirementIdFor(requirement, requirementKind);
    const candidate = record.candidateOccurrences.find((row) =>
      row.requirementBinding.requirementKind === requirementKind
        && row.requirementBinding.requirementId === requirementId);
    const object = record.routeObjects.find((row) =>
      row.routeObjectHash === candidate.routeObject.routeObjectHash);
    byKind[requirementKind] = { source, record, candidate, object };
  }
  return { source, record, byKind };
}

function intakeFor({ tender, accountable, response, semanticsBytes,
  adoptionBytes, standingBytes, rightsBytes, privacyBytes, firstEventHash,
  label = "mailbox" }) {
  const transport = keys();
  const server = keys();
  const audience = "https://intake.outsider.example";
  const payload = {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS,
    cohortCommitmentHash: response.providerRefHash,
    censusSlotCommitmentHash: sha(adoptionBytes),
    eligibilityRuleHash: sha(semanticsBytes),
    assignmentPolicyHash: sha(standingBytes),
    instrumentPlanHash: networkQuarantineSourceReviewFileHash(
      "INSTRUMENT", adoptionBytes),
    preActionRegistrationReferenceHash: firstEventHash,
    externalTimeAnchorHash: null,
    prospectiveRegistrationEstablishedAtNetworkEdge: false,
    scientificCensusCompletenessEstablishedAtNetworkEdge: false,
  };
  const subject = {
    claimHash: tender.workOrderHash,
    wayHash: accountable.envelope.bindings.claimWayWorld.wayHash,
    worldHash: accountable.envelope.bindings.claimWayWorld.worldHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    actorIdentityEnvelopeHash: accountable.envelope.actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash:
      tender.typedGraph.accountableDeployment.accountableDeploymentSubjectHash,
    attemptActorSubjectHash: tender.typedGraph.attempt.attemptActorSubjectHash,
    cohortHash: response.providerRefHash,
    censusSlotHash: sha(adoptionBytes),
  };
  const sourceRefs = {
    sourceManifestHash: networkQuarantineSourceReviewFileHash(
      "SOURCE_MANIFEST", semanticsBytes),
    instrumentHash: networkQuarantineSourceReviewFileHash(
      "INSTRUMENT", adoptionBytes),
    rightsReviewHash: networkQuarantineSourceReviewFileHash(
      "RIGHTS_REVIEW", rightsBytes),
    privacyReviewHash: networkQuarantineSourceReviewFileHash(
      "PRIVACY_REVIEW", privacyBytes),
  };
  const manifest = createNetworkIntakeManifest({
    lane: "PROSPECTIVE_CENSUS",
    clientSubmissionId: `submission_${label}_owner_0001`,
    payloadSchema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS,
    payload,
    subject,
    source: sourceRefs,
    consentHash: h("mailbox-network-consent"),
    retentionDays: 30,
    createdAt: "2026-09-02T12:15:00.000Z",
  });
  const challenge = createNetworkIntakeChallenge({
    manifestHash: manifest.manifestHash,
    transportSignerKeyId: transport.keyId,
    audience,
    nonce: `${label}_owner_standing_nonce_0001`,
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
    registryId: `${label}-owner-standing-registry`,
    eventOrdinal: 1,
    eventHash: h("mailbox-network-event"),
    objectAlreadyPresent: false,
    receivedAt: "2026-09-02T12:18:00.000Z",
    retentionUntil: "2026-10-02T12:18:00.000Z",
    serverPrivateKeyPem: server.privateKeyPem,
  });
  return { manifest, payload, expectedManifestHash: manifest.manifestHash,
    challenge, reservation, payloadEnvelope, receipt,
    challengeServerPublicKeyPem: server.publicKeyPem,
    receiptServerPublicKeyPem: server.publicKeyPem,
    expectedAudience: audience,
    expectedReservationHash: reservation.reservationHash,
    expectedReceiptHash: receipt.receiptHash };
}

function ownerStandingFor({ tender, accountable, owner, registryKey,
  response, responses, occurrences, standingKey, label = "mailbox",
  observedAt = "2026-09-02T13:30:00.000Z" }) {
  const externalContext = createExternalCapacityVerifierContextV1({
    verifierId: "example.mailbox.capacity.adapter",
    verifierRevisionHash: h("mailbox-capacity-verifier-revision"),
    adapterArtifactHash: h("mailbox-capacity-adapter"),
    sourceSystemId: "example.mailbox.capacity.source",
    semanticsSchema: "example/mailbox-capacity-semantics/v1",
    standingSchema: "example/mailbox-resource-owner-standing/v1",
    receiptSchema: "example/mailbox-capacity-receipt/v1",
    lifecycleEventSchema: "example/mailbox-capacity-event/v1",
    lifecycleHeadSchema: "example/mailbox-capacity-head/v1",
    sourcePublicKeyPem: standingKey.publicKeyPem,
    expectedSourceKeyId: standingKey.keyId,
    sourceTrustPolicyRefHash: h("mailbox-external-source-policy"),
    rightsPrivacyPolicyRefHash:
      tender.authorizationBinding.rightsPrivacyPolicyRefHash,
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-01T23:00:00.000Z",
    maximumLifecycleHeadAgeMs: 24 * 60 * 60 * 1_000,
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
    standingEvidenceRefHash: h("mailbox-standing-evidence"),
  };
  const standingBytes = signed("STANDING", standingPayload, standingKey,
    externalCapacitySourceSigningMessageV1);
  const context = createResourceOwnerStandingTrustVerifierContextV1({
    registryRefHash: h("mailbox-owner-registry"),
    sourceSystemRefHash: h("mailbox-owner-registry-source"),
    adapterArtifactHash: h("mailbox-owner-registry-adapter"),
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
    sourcePublicKeyPem: registryKey.publicKeyPem,
    expectedSourceKeyId: registryKey.keyId,
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-01T23:00:00.000Z",
    maximumLifecycleHeadAgeMs: 24 * 60 * 60 * 1_000,
  });
  const ownerSigned = (kind, payload) => signed(kind, payload, registryKey,
    resourceOwnerStandingSourceSigningMessageV1);
  const semanticsBytes = ownerSigned("SEMANTICS", {
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
  });
  const stream = h(`${label}:owner-standing-stream`);
  const adoptionBytes = ownerSigned("ADOPTION", {
    schema: context.adoptionSchema,
    sourceSystemRefHash: context.sourceSystemRefHash,
    registryRefHash: context.registryRefHash,
    semanticsSourceHash: sha(semanticsBytes),
    resourceOwnerRefHash: owner.envelope.principalEpochProjectionHash,
    ownerActorIdentityEnvelopeHash: owner.envelope.actorIdentityEnvelopeHash,
    ownerPrincipalEpochProjectionHash:
      owner.envelope.principalEpochProjectionHash,
    providerRefHash: response.providerRefHash,
    externalStandingSourceHash: sha(standingBytes),
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    resourceOwnerAuthorizationRefHash:
      tender.authorizationBinding.resourceOwnerAuthorizationRefHash,
    scopeHash: response.scopeHash,
    lifecycleStreamRefHash: stream,
    adoptedAt: "2026-09-02T12:10:00.000Z",
    validUntil: "2026-09-02T17:00:00.000Z",
    adoptionState: "SOURCE_DECLARED_ADOPTED",
  });
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
  const rightsBytes = ownerSigned("RIGHTS_REVIEW", {
    schema: context.rightsReviewSchema,
    ...reviewBase,
    reviewKind: "RIGHTS",
    sourceArtifactRefHash: h("mailbox-rights-artifact"),
  });
  const privacyBytes = ownerSigned("PRIVACY_REVIEW", {
    schema: context.privacyReviewSchema,
    ...reviewBase,
    reviewKind: "PRIVACY",
    sourceArtifactRefHash: h("mailbox-privacy-artifact"),
  });
  const eventBase = {
    schema: context.lifecycleEventSchema,
    sourceSystemRefHash: context.sourceSystemRefHash,
    registryRefHash: context.registryRefHash,
    lifecycleStreamRefHash: stream,
    adoptionSourceHash: sha(adoptionBytes),
    ordinal: 1,
    previousEventSourceHash: OUTSIDER_RESOURCE_OWNER_STANDING_EVENT_GENESIS_V1,
    eventState: "ADOPTED",
    occurredAt: "2026-09-02T12:10:00.000Z",
  };
  const eventPayload = {
    ...eventBase,
    objectIdentityHash: networkIntakeDigest(
      "outsider/resource-owner-standing-lifecycle-object/v1", {
        sourceSystemRefHash: eventBase.sourceSystemRefHash,
        registryRefHash: eventBase.registryRefHash,
        lifecycleStreamRefHash: eventBase.lifecycleStreamRefHash,
        adoptionSourceHash: eventBase.adoptionSourceHash,
      }),
    occurrenceIdentityHash: networkIntakeDigest(
      "outsider/resource-owner-standing-lifecycle-occurrence/v1", {
        adoptionSourceHash: eventBase.adoptionSourceHash,
        ordinal: 1,
        previousEventSourceHash: eventBase.previousEventSourceHash,
        eventState: "ADOPTED",
        occurredAt: eventBase.occurredAt,
      }),
  };
  const eventBytes = ownerSigned("LIFECYCLE_EVENT", eventPayload);
  const eventHash = sha(eventBytes);
  const headBytes = ownerSigned("LIFECYCLE_HEAD", {
    schema: context.lifecycleHeadSchema,
    sourceSystemRefHash: context.sourceSystemRefHash,
    registryRefHash: context.registryRefHash,
    lifecycleStreamRefHash: stream,
    adoptionSourceHash: sha(adoptionBytes),
    eventCount: 1,
    coveredFromOrdinal: 1,
    coveredToOrdinal: 1,
    headEventSourceHash: eventHash,
    currentState: "ADOPTED",
    observedAt: "2026-09-02T13:29:00.000Z",
    occurrencePolicy:
      "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
    rightsReviewSourceHash: sha(rightsBytes),
    privacyReviewSourceHash: sha(privacyBytes),
  });
  const intake = intakeFor({ tender, accountable, response, semanticsBytes,
    adoptionBytes, standingBytes, rightsBytes, privacyBytes,
    firstEventHash: eventHash, label });
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
    oneUseResponseReplay: { responses, occurrences,
      expectedOccurrenceCount: occurrences.length,
      expectedLifecycleHeadHash: occurrences.at(-1).occurrenceHash },
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
    lifecycleEventSourceBytes: [eventBytes],
    expectedLifecycleEventSourceHashes: [eventHash],
    expectedLifecycleEventCount: 1,
    lifecycleHeadSourceBytes: headBytes,
    expectedLifecycleHeadSourceHash: sha(headBytes),
    rightsReviewSourceBytes: rightsBytes,
    expectedRightsReviewSourceHash: sha(rightsBytes),
    privacyReviewSourceBytes: privacyBytes,
    expectedPrivacyReviewSourceHash: sha(privacyBytes),
    networkIntakeReplay: intake,
    observedAt,
  };
  const replay = createResourceOwnerStandingTrustReplayV1(source);
  return { source, replay };
}

function graphBinding(tender) {
  return {
    principalEpochProjectionHash:
      tender.typedGraph.principalEpoch.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      tender.typedGraph.accountableDeployment.accountableDeploymentSubjectHash,
    runtimeInstanceHash: tender.typedGraph.runtime.runtimeInstanceHash,
    embodimentRevisionHash: tender.typedGraph.embodiment.embodimentRevisionHash,
    delegationEdgeHash: tender.typedGraph.delegation.delegationEdgeHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
  };
}

function requirementBinding(response) {
  return {
    requirementKind: response.requirementKind,
    requirementId: response.requirementId,
    requirementSetHash: response.requirementSetHash,
    requirementObjectHash: response.requirementObjectHash,
    requirementClassCode: response.requirementClassCode,
    requirementScopeRefHash: response.requirementScopeRefHash,
    quantity: response.quantity,
    unitCode: response.unitCode,
    regionRefHash: response.regionRefHash,
    dueBy: response.dueBy,
    evidencePlanHash: response.evidencePlanHash,
    remedyPlanHash: response.remedyPlanHash,
  };
}

function exactBinding({ tender, route, accountable, owner, response, provider }) {
  const body = {
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .binding,
    tenderHash: tender.tenderHash,
    workOrderHash: tender.workOrderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    graph: graphBinding(tender),
    requirement: requirementBinding(response),
    routeKind: "USER_HELD_ACCOUNT",
    routeObjectHash: route.object.routeObjectHash,
    currentCandidateHash: route.candidate.candidateHash,
    transactionSurfaceRefHash:
      route.candidate.sourceReference.transactionSurfaceRefHash,
    accountableActorIdentityEnvelopeHash:
      accountable.envelope.actorIdentityEnvelopeHash,
    ownerActorIdentityEnvelopeHash: owner.envelope.actorIdentityEnvelopeHash,
    resourceOwnerRefHash: owner.envelope.principalEpochProjectionHash,
    providerRefHash: provider,
  };
  return { ...body, bindingHash: digest(
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
      .binding, body) };
}

function permissionObjectIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-permission-object/v1", {
      adapterContextHash: payload.adapterContextHash,
      permissionIdHash: payload.permissionIdHash,
      bindingHash: payload.binding.bindingHash,
      privateScope: payload.privateScope,
      challengeCommitmentHash: payload.challengeCommitmentHash,
      responseChoiceSetHash: payload.responseChoiceSetHash,
      outboundTemplateCommitmentHash: payload.outboundTemplateCommitmentHash,
      sendIdempotencyKeyHash: payload.sendIdempotencyKeyHash,
      maxSendCount: payload.maxSendCount,
      allowedOperations: payload.allowedOperations,
    });
}

function permissionOccurrenceIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-permission-occurrence/v1", {
      permissionIdHash: payload.permissionIdHash,
      ordinal: payload.ordinal,
      previousEventSourceHash: payload.previousEventSourceHash,
      eventState: payload.eventState,
      reasonCode: payload.reasonCode,
      occurredAt: payload.occurredAt,
      validUntil: payload.validUntil,
      permissionOccurrenceNonceHash: payload.permissionOccurrenceNonceHash,
      objectIdentityHash: payload.objectIdentityHash,
    });
}

function transportOccurrenceIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-transport-occurrence/v1", {
      permissionIdHash: payload.permissionIdHash,
      ordinal: payload.ordinal,
      previousTransportOccurrenceHash:
        payload.previousTransportOccurrenceHash,
      occurredAt: payload.occurredAt,
      idempotencyKeyHash: payload.idempotencyKeyHash,
      transportOccurrenceNonceHash: payload.transportOccurrenceNonceHash,
      objectIdentityHash: payload.objectIdentityHash,
    });
}

function withTransportIdentities(payload, domain, body) {
  const objectIdentityHash = digest(domain, body(payload));
  const occurrenceIdentityHash = transportOccurrenceIdentity({
    ...payload, objectIdentityHash,
  });
  return { ...payload, objectIdentityHash, occurrenceIdentityHash };
}

const transportObjectBodies = {
  route: (p) => ({ permissionIdHash: p.permissionIdHash,
    bindingHash: p.binding.bindingHash, privateScope: p.privateScope,
    routeDiscoverySnapshotHash: p.routeDiscoverySnapshotHash,
    selectedRouteOccurrenceHash: p.selectedRouteOccurrenceHash }),
  outbound: (p) => ({ permissionIdHash: p.permissionIdHash,
    bindingHash: p.binding.bindingHash, privateScope: p.privateScope,
    permissionGenesisSourceHash: p.permissionGenesisSourceHash,
    routeObservationSourceHash: p.routeObservationSourceHash,
    challengeToken: p.challengeToken, responseChoices: p.responseChoices,
    responseChoiceSetHash: p.responseChoiceSetHash,
    outboundTemplateCommitmentHash: p.outboundTemplateCommitmentHash,
    messageRefHash: p.messageRefHash,
    senderAccountRefHash: p.senderAccountRefHash,
    recipientMailboxRefHash: p.recipientMailboxRefHash,
    threadRefHash: p.threadRefHash, direction: p.direction,
    messageKind: p.messageKind, rfc822SourceHash: p.rfc822SourceHash,
    challengeLineOctetStart: p.challengeLineOctetStart,
    challengeLineOctetEnd: p.challengeLineOctetEnd }),
  ack: (p) => ({ permissionIdHash: p.permissionIdHash,
    bindingHash: p.binding.bindingHash,
    outboundMessageSourceHash: p.outboundMessageSourceHash,
    messageRefHash: p.messageRefHash,
    acknowledgementRefHash: p.acknowledgementRefHash,
    serverStatusCode: p.serverStatusCode,
    serverAcknowledged: p.serverAcknowledged, queuedClaimed: p.queuedClaimed,
    deliveredClaimed: p.deliveredClaimed, openedClaimed: p.openedClaimed,
    readClaimed: p.readClaimed, dkimResult: p.dkimResult,
    arcResult: p.arcResult, spfResult: p.spfResult,
    dmarcResult: p.dmarcResult, messageKind: p.messageKind }),
  inbound: (p) => ({ permissionIdHash: p.permissionIdHash,
    bindingHash: p.binding.bindingHash,
    outboundMessageSourceHash: p.outboundMessageSourceHash,
    sendAcknowledgementSourceHash: p.sendAcknowledgementSourceHash,
    senderMailboxRefHash: p.senderMailboxRefHash,
    recipientAccountRefHash: p.recipientAccountRefHash,
    threadRefHash: p.threadRefHash, direction: p.direction,
    messageKind: p.messageKind,
    automatedMessageClass: p.automatedMessageClass,
    replyPlacement: p.replyPlacement, machineReplyLine: p.machineReplyLine,
    naturalLanguageBody: p.naturalLanguageBody,
    serverAcknowledged: p.serverAcknowledged,
    deliveredClaimed: p.deliveredClaimed, openedClaimed: p.openedClaimed,
    readClaimed: p.readClaimed, dkimResult: p.dkimResult,
    arcResult: p.arcResult, spfResult: p.spfResult,
    dmarcResult: p.dmarcResult,
    vendorClaimedOffer: p.vendorClaimedOffer,
    modelLabeledOffer: p.modelLabeledOffer,
    rfc822SourceHash: p.rfc822SourceHash,
    replyLineOctetStart: p.replyLineOctetStart,
    replyLineOctetEnd: p.replyLineOctetEnd }),
};

function rawLine(line, label) {
  const prefix = Buffer.from(`From: ${label}@example.invalid\r\n\r\n`, "utf8");
  const lineBytes = Buffer.from(line, "utf8");
  const bytes = Buffer.concat([prefix, lineBytes, Buffer.from("\r\n", "utf8")]);
  return { bytes, start: prefix.length, end: prefix.length + lineBytes.length };
}

function responseInput({ tender, route, provider, responseNonceHash,
  sourceResponseRefHash, serviceFrom = "2026-09-02T15:00:00.000Z",
  serviceUntil = "2026-09-02T16:00:00.000Z",
  expiresAt = "2026-09-02T17:00:00.000Z",
  requirementKind = "RESOURCE" }) {
  const requirement = requirementFor(tender, requirementKind);
  const quantity = requirementKind === "RESOURCE" ? requirement.quantity : 1;
  const unitCode = requirementKind === "RESOURCE"
    ? requirement.unitCode : "REQUIREMENT";
  return {
    tender,
    expectedTenderHash: tender.tenderHash,
    providerRefHash: provider,
    requirementKind,
    requirementId: requirementIdFor(requirement, requirementKind),
    discoveryRouteObjectHash: route.object.routeObjectHash,
    discoveryCandidateHash: route.candidate.candidateHash,
    quantity,
    unitCode,
    serviceFrom,
    serviceUntil,
    responseState: "OFFERED",
    stateAt: "2026-09-02T12:05:00.000Z",
    expiresAt,
    reasonCode: "ONE_USE_OFFER_CREATED",
    responseNonceHash,
    sourceResponseRefHash,
  };
}

function fixture(options = {}) {
  const slotLabel = options.slotLabel ?? "resource";
  const requirementKind = options.requirementKind ?? "RESOURCE";
  const observedAt = options.observedAt ?? "2026-09-02T13:30:00.000Z";
  const slotHash = (value) => h(`${slotLabel}:${value}`);
  const shared = options.shared ?? null;
  const mailboxKey = shared?.mailboxKey ?? keys();
  const registryKey = shared?.registryKey ?? keys();
  const standingKey = shared?.standingKey ?? keys();
  const accountable = shared?.accountable
    ?? actor(options.accountableLabel ?? "mailbox-accountable", {
      episodeHash: h("mailbox-episode"), attemptHash: h("mailbox-attempt") });
  const owner = shared?.owner ?? actor("mailbox-owner", {
    controllerKeyRefHash: registryKey.keyId });
  const tender = shared?.tender ?? tenderFor(accountable, options);
  const route = shared?.routeByKind?.[requirementKind] ?? routeFor(tender, {
    asOf: options.routeSnapshotAsOf,
    revokedAt: options.routeRevokedAt,
    validUntil: options.routeValidUntil,
  });
  const provider = slotHash("mailbox-provider");
  const expiring = options.responseTerminal === "EXPIRED";
  const serviceFrom = expiring ? "2026-09-02T12:10:00.000Z"
    : "2026-09-02T15:00:00.000Z";
  const serviceUntil = expiring ? "2026-09-02T12:20:00.000Z"
    : "2026-09-02T16:00:00.000Z";
  const responseExpiresAt = expiring ? "2026-09-02T13:00:00.000Z"
    : "2026-09-02T17:00:00.000Z";
  const provisional = createInitialOneUseTenderResponseV1(responseInput({
    tender, route, provider, responseNonceHash: slotHash("provisional-nonce"),
    sourceResponseRefHash: slotHash("provisional-source"), serviceFrom,
    serviceUntil, expiresAt: responseExpiresAt, requirementKind,
  }));
  const binding = exactBinding({ tender, route, accountable, owner,
    response: provisional, provider });
  const privateScope = {
    userHeldAccountRefHash: binding.transactionSurfaceRefHash,
    counterpartyMailboxRefHash: slotHash("canary-counterparty-mailbox"),
    recipientSetCommitmentHash: slotHash("canary-recipient-set"),
    threadRefHash: slotHash("canary-private-thread"),
  };
  const challengeToken = slotHash("mailbox-one-use-challenge").slice(7);
  const challengeCommitmentHash = digest(
    "outsider/permissioned-transaction-interface-challenge/v1",
    { challengeToken });
  const responseChoices = [{ choiceCode: "PRIMARY",
    serviceFrom, serviceUntil, expiresAt: responseExpiresAt }];
  const responseChoiceSetHash = digest(
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
      .responseChoiceSet, { choices: responseChoices });
  const outboundTemplateCommitmentHash = digest(
    "outsider/permissioned-transaction-interface-outbound-template/v1", {
      bindingHash: binding.bindingHash,
      userHeldAccountRefHash: privateScope.userHeldAccountRefHash,
      counterpartyMailboxRefHash: privateScope.counterpartyMailboxRefHash,
      recipientSetCommitmentHash: privateScope.recipientSetCommitmentHash,
      threadRefHash: privateScope.threadRefHash,
      challengeCommitmentHash,
      responseChoiceSetHash,
    });
  const adapterContext = {
    profile: OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
    adapterArtifactHash: h("mailbox-adapter-artifact"),
    adapterRevisionHash: h("mailbox-adapter-revision"),
    sourceSystemId: "canary.mailbox.source.system",
    sourcePublicKeyPem: mailboxKey.publicKeyPem,
    expectedSourceKeyId: mailboxKey.keyId,
    sourceTrustPolicyRefHash: h("canary-mailbox-trust-policy"),
    rightsPrivacyPolicyRefHash:
      tender.authorizationBinding.rightsPrivacyPolicyRefHash,
    issuedAt: "2026-09-01T23:00:00.000Z",
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    maximumLifecycleHeadAgeMs: 24 * 60 * 60 * 1_000,
  };
  const contextHash = permissionedTransactionInterfaceAdapterContextHashV1(
    adapterContext);
  const permissionIdHash = slotHash("mailbox-permission-id");
  const sendIdempotencyKeyHash = slotHash("mailbox-send-idempotency");
  const grantAt = options.grantAt ?? "2026-09-02T12:01:59.000Z";
  const grantBase = {
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .permissionLifecycleEvent,
    sourceSystemId: adapterContext.sourceSystemId,
    adapterContextHash: contextHash,
    permissionIdHash,
    ordinal: 1,
    previousEventSourceHash:
      OUTSIDER_PERMISSIONED_TRANSACTION_PERMISSION_EVENT_GENESIS_V1,
    eventState: "GRANTED",
    reasonCode: "USER_SOURCE_DECLARED_PERMISSION",
    occurredAt: grantAt,
    validUntil: "2026-09-02T17:00:00.000Z",
    binding,
    privateScope,
    challengeCommitmentHash,
    responseChoiceSetHash,
    outboundTemplateCommitmentHash,
    sendIdempotencyKeyHash,
    maxSendCount: 1,
    allowedOperations: ["DISCOVER_ROUTE", "EMIT_ONE_USE_TENDER",
      "INGEST_CHALLENGE_REPLY"],
    permissionOccurrenceNonceHash: slotHash("permission-occurrence-1"),
  };
  grantBase.objectIdentityHash = permissionObjectIdentity(grantBase);
  grantBase.occurrenceIdentityHash = permissionOccurrenceIdentity(grantBase);
  const permissionEvents = [signedMailbox("PERMISSION_EVENT", grantBase,
    mailboxKey)];
  const permissionPayloads = [grantBase];
  if (options.permissionTerminal === "REVOKED") {
    const terminal = { ...grantBase, ordinal: 2,
      previousEventSourceHash: sha(permissionEvents[0]),
      eventState: "REVOKED",
      reasonCode: "USER_SOURCE_DECLARED_REVOCATION",
      occurredAt: options.permissionTerminalAt
        ?? "2026-09-02T12:02:30.000Z",
      permissionOccurrenceNonceHash: slotHash("permission-occurrence-2") };
    terminal.objectIdentityHash = permissionObjectIdentity(terminal);
    terminal.occurrenceIdentityHash = permissionOccurrenceIdentity(terminal);
    permissionEvents.push(signedMailbox("PERMISSION_EVENT", terminal,
      mailboxKey));
    permissionPayloads.push(terminal);
  }
  const permissionHashes = permissionEvents.map(sha);
  const lastPermission = permissionPayloads.at(-1);
  const permissionHead = signedMailbox("PERMISSION_HEAD", {
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .permissionLifecycleHead,
    sourceSystemId: adapterContext.sourceSystemId,
    adapterContextHash: contextHash,
    permissionIdHash,
    eventCount: permissionEvents.length,
    coveredFromOrdinal: 1,
    coveredToOrdinal: permissionEvents.length,
    headEventSourceHash: permissionHashes.at(-1),
    currentState: lastPermission.eventState,
    currentOccurredAt: lastPermission.occurredAt,
    permissionObjectIdentityHash: grantBase.objectIdentityHash,
    eventSetRootHash: setRoot(
      "outsider/permissioned-transaction-interface-permission-event-set/v1",
      permissionHashes),
    observedAt: "2026-09-02T13:29:00.000Z",
    signedAt: "2026-09-02T13:29:10.000Z",
    occurrencePolicy:
      "EVERY_PERMISSION_EVENT_COUNTS_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
  }, mailboxKey);

  const common = { sourceSystemId: adapterContext.sourceSystemId,
    adapterContextHash: contextHash, permissionIdHash, binding, privateScope };
  const routePayload = withTransportIdentities({
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .routeObservation,
    ...common,
    ordinal: 1,
    previousTransportOccurrenceHash:
      OUTSIDER_PERMISSIONED_TRANSACTION_TRANSPORT_OCCURRENCE_GENESIS_V1,
    occurredAt: "2026-09-02T12:02:00.000Z",
    idempotencyKeyHash: slotHash("route-idempotency"),
    transportOccurrenceNonceHash: slotHash("route-occurrence-nonce"),
    routeDiscoverySnapshotHash: route.record.snapshotHash,
    selectedRouteOccurrenceHash:
      route.candidate.routeOccurrence.occurrenceHash,
  }, "outsider/permissioned-transaction-interface-route-observation-object/v1",
  transportObjectBodies.route);
  const routeBytes = signedMailbox("ROUTE_OBSERVATION", routePayload,
    mailboxKey);

  const challengeLine = `OUTSIDER_CHALLENGE_V1 ${challengeToken} ${responseChoiceSetHash}`;
  const outboundRaw = rawLine(challengeLine, `sender-${slotLabel}`);
  const outboundPayload = withTransportIdentities({
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .outboundTender,
    ...common,
    ordinal: 2,
    previousTransportOccurrenceHash: routePayload.occurrenceIdentityHash,
    occurredAt: "2026-09-02T12:03:00.000Z",
    idempotencyKeyHash: sendIdempotencyKeyHash,
    transportOccurrenceNonceHash: slotHash("outbound-occurrence-nonce"),
    permissionGenesisSourceHash: permissionHashes[0],
    routeObservationSourceHash: sha(routeBytes),
    challengeToken,
    responseChoices,
    responseChoiceSetHash,
    outboundTemplateCommitmentHash,
    messageRefHash: slotHash("canary-outbound-message"),
    senderAccountRefHash: privateScope.userHeldAccountRefHash,
    recipientMailboxRefHash: privateScope.counterpartyMailboxRefHash,
    threadRefHash: privateScope.threadRefHash,
    direction: "OUTBOUND",
    messageKind: "ONE_USE_TENDER_INVITATION",
    rfc822SourceHash: sha(outboundRaw.bytes),
    challengeLineOctetStart: outboundRaw.start,
    challengeLineOctetEnd: outboundRaw.end,
  }, "outsider/permissioned-transaction-interface-outbound-tender-object/v1",
  transportObjectBodies.outbound);
  const outboundBytes = signedMailbox("OUTBOUND_TENDER", outboundPayload,
    mailboxKey);

  const signal = { serverAcknowledged: true, deliveredClaimed: true,
    openedClaimed: true, readClaimed: true, dkimResult: "PASS",
    arcResult: "PASS", spfResult: "PASS", dmarcResult: "PASS" };
  const ackPayload = withTransportIdentities({
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .sendAcknowledgement,
    ...common,
    ordinal: 3,
    previousTransportOccurrenceHash: outboundPayload.occurrenceIdentityHash,
    occurredAt: "2026-09-02T12:04:00.000Z",
    idempotencyKeyHash: slotHash("ack-idempotency"),
    transportOccurrenceNonceHash: slotHash("ack-occurrence-nonce"),
    outboundMessageSourceHash: sha(outboundBytes),
    messageRefHash: outboundPayload.messageRefHash,
    acknowledgementRefHash: slotHash("canary-server-ack"),
    serverStatusCode: "250",
    ...signal,
    queuedClaimed: true,
    messageKind: "TRANSPORT_ACK_ONLY",
  }, "outsider/permissioned-transaction-interface-send-ack-object/v1",
  transportObjectBodies.ack);
  const ackBytes = signedMailbox("SEND_ACKNOWLEDGEMENT", ackPayload,
    mailboxKey);

  const strictReplyLine = `OUTSIDER_REPLY_V1 OFFERED PRIMARY ${challengeToken}`;
  const inboundSpecs = options.inboundMode === "NOISE_ONLY"
    ? [{ strict: false, at: "2026-09-02T12:05:00.000Z" }]
    : options.inboundMode === "DUPLICATE_STRICT"
      ? [
        { strict: true, at: "2026-09-02T12:05:00.000Z",
          rawLabel: "duplicate-reply", idempotencyLabel: "duplicate-reply",
          messageLabel: "duplicate-reply" },
        { strict: true, at: "2026-09-02T12:05:01.000Z",
          rawLabel: "duplicate-reply", idempotencyLabel: "duplicate-reply",
          messageLabel: "duplicate-reply" },
      ]
      : [{ strict: false, at: "2026-09-02T12:04:30.000Z" },
        { strict: true, at: "2026-09-02T12:05:00.000Z" }];
  const inboundBytes = [];
  const inboundRfc822Bytes = [];
  const inboundPayloads = [];
  let previous = ackPayload.occurrenceIdentityHash;
  for (let index = 0; index < inboundSpecs.length; index += 1) {
    const spec = inboundSpecs[index];
    const raw = rawLine(spec.strict ? strictReplyLine
      : "Yes, I accept. OFFERED. DKIM and ARC pass.",
    spec.rawLabel ?? `reply-${index}`);
    const payload = withTransportIdentities({
      schema:
        OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
          .inboundMessage,
      ...common,
      ordinal: index + 4,
      previousTransportOccurrenceHash: previous,
      occurredAt: spec.at,
      idempotencyKeyHash:
        slotHash(`inbound-idempotency-${spec.idempotencyLabel ?? index}`),
      transportOccurrenceNonceHash: slotHash(`inbound-occurrence-${index}`),
      outboundMessageSourceHash: sha(outboundBytes),
      sendAcknowledgementSourceHash: sha(ackBytes),
      messageRefHash:
        slotHash(`canary-inbound-message-${spec.messageLabel ?? index}`),
      senderMailboxRefHash: privateScope.counterpartyMailboxRefHash,
      recipientAccountRefHash: privateScope.userHeldAccountRefHash,
      threadRefHash: privateScope.threadRefHash,
      direction: "INBOUND",
      messageKind: "COUNTERPARTY_REPLY_OBSERVATION",
      automatedMessageClass: spec.strict ? "NONE" : "SERVER_ACK",
      replyPlacement: spec.strict
        ? "NEWLY_AUTHORED_PLAIN_TEXT_SINGLE_LINE"
        : "NO_MACHINE_REPLY_PRESENT",
      machineReplyLine: spec.strict ? strictReplyLine : null,
      naturalLanguageBody: "Yes, I accept this offer in plain language.",
      ...signal,
      vendorClaimedOffer: true,
      modelLabeledOffer: true,
      rfc822SourceHash: sha(raw.bytes),
      replyLineOctetStart: spec.strict ? raw.start : null,
      replyLineOctetEnd: spec.strict ? raw.end : null,
    }, "outsider/permissioned-transaction-interface-inbound-message-object/v1",
    transportObjectBodies.inbound);
    const bytes = signedMailbox("INBOUND_MESSAGE", payload, mailboxKey);
    inboundRfc822Bytes.push(raw.bytes);
    inboundPayloads.push(payload);
    inboundBytes.push(bytes);
    previous = payload.occurrenceIdentityHash;
  }
  const strictIndex = inboundSpecs.findIndex((item) => item.strict);
  const responseSourceIndex = strictIndex < 0 ? 0 : strictIndex;
  const responseNonceHash = permissionedTransactionChallengeResponseNonceHashV1({
    challengeCommitmentHash,
    tenderHash: tender.tenderHash,
    routeObjectHash: route.object.routeObjectHash,
    candidateHash: route.candidate.candidateHash,
    providerRefHash: provider,
    responseState: "OFFERED",
    reasonCode: "ONE_USE_OFFER_CREATED",
    choiceCode: "PRIMARY",
  });
  const response = createInitialOneUseTenderResponseV1(responseInput({
    tender, route, provider, responseNonceHash,
    sourceResponseRefHash: sha(inboundBytes[responseSourceIndex]),
    serviceFrom, serviceUntil, expiresAt: responseExpiresAt, requirementKind,
  }));
  const responses = [response];
  const strictResponseTimes = inboundSpecs.filter((item) => item.strict)
    .map((item) => item.at);
  if (strictResponseTimes.length === 0) {
    strictResponseTimes.push("2026-09-02T12:05:00.000Z");
  }
  const occurrences = [];
  let previousResponseOccurrenceHash
    = OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1;
  for (let index = 0; index < strictResponseTimes.length; index += 1) {
    const occurrence = createOneUseTenderResponseOccurrenceV1({
      response,
      ordinal: index + 1,
      previousOccurrenceHash: previousResponseOccurrenceHash,
      recordedAt: strictResponseTimes[index],
      occurrenceNonceHash: slotHash(`response-occurrence-${index + 1}`),
    });
    occurrences.push(occurrence);
    previousResponseOccurrenceHash = occurrence.occurrenceHash;
  }
  if (options.responseTerminal === "REVOKED"
    || options.responseTerminal === "EXPIRED") {
    const terminalAt = options.responseTerminal === "EXPIRED"
      ? responseExpiresAt : "2026-09-02T13:00:00.000Z";
    const descendant = createOneUseTenderResponseDescendantV1({
      tender,
      expectedTenderHash: tender.tenderHash,
      predecessorResponse: response,
      responseState: options.responseTerminal,
      stateAt: terminalAt,
      reasonCode: options.responseTerminal === "EXPIRED"
        ? "OFFER_WINDOW_EXPIRED" : "CAPACITY_WITHDRAWN",
      responseNonceHash: slotHash(`response-${options.responseTerminal}-nonce`),
      sourceResponseRefHash:
        slotHash(`response-${options.responseTerminal}-source`),
    });
    responses.push(descendant);
    occurrences.push(createOneUseTenderResponseOccurrenceV1({
      response: descendant,
      ordinal: occurrences.length + 1,
      previousOccurrenceHash: occurrences.at(-1).occurrenceHash,
      recordedAt: terminalAt,
      occurrenceNonceHash:
        slotHash(`response-${options.responseTerminal}-occurrence`),
    }));
  }
  const ownerStanding = ownerStandingFor({ tender, accountable, owner,
    registryKey, response, responses, occurrences, standingKey,
    label: slotLabel, observedAt });

  const occurrenceHashes = [routePayload, outboundPayload, ackPayload,
    ...inboundPayloads].map((item) => item.occurrenceIdentityHash);
  const objectHashes = [...new Set([routePayload, outboundPayload, ackPayload,
    ...inboundPayloads].map((item) => item.objectIdentityHash))];
  const inboundSourceHashes = inboundBytes.map(sha);
  const inboundRfc822Hashes = inboundRfc822Bytes.map(sha);
  const transportHead = signedMailbox("TRANSPORT_HEAD", {
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .transportHead,
    sourceSystemId: adapterContext.sourceSystemId,
    adapterContextHash: contextHash,
    permissionIdHash,
    occurrenceCount: occurrenceHashes.length,
    coveredFromOrdinal: 1,
    coveredToOrdinal: occurrenceHashes.length,
    headOccurrenceHash: occurrenceHashes.at(-1),
    occurrenceSetRootHash: setRoot(
      "outsider/permissioned-transaction-interface-transport-occurrence-set/v1",
      occurrenceHashes),
    objectSetRootHash: setRoot(
      "outsider/permissioned-transaction-interface-transport-object-set/v1",
      objectHashes),
    distinctObjectCount: objectHashes.length,
    outboundMessageSourceHash: sha(outboundBytes),
    outboundRfc822SourceHash: sha(outboundRaw.bytes),
    sendAcknowledgementSourceHash: sha(ackBytes),
    inboundMessageSourceSetRootHash: setRoot(
      "outsider/permissioned-transaction-interface-inbound-source-set/v1",
      inboundSourceHashes),
    inboundRfc822SourceSetRootHash: setRoot(
      "outsider/permissioned-transaction-interface-inbound-rfc822-set/v1",
      inboundRfc822Hashes),
    observedAt: "2026-09-02T13:29:00.000Z",
    signedAt: "2026-09-02T13:29:10.000Z",
    occurrencePolicy:
      "EVERY_TRANSPORT_OCCURRENCE_COUNTS_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
  }, mailboxKey);
  const source = {
    tender,
    expectedTenderHash: tender.tenderHash,
    routeDiscoveryReplay: { record: route.record, source: route.source,
      expectedSnapshotHash: route.record.snapshotHash },
    selectedRouteObjectHash: route.object.routeObjectHash,
    selectedCandidateHash: route.candidate.candidateHash,
    ownerStandingReplay: { source: ownerStanding.source,
      expectedReplayHash: ownerStanding.replay.replayHash },
    oneUseResponseReplay: { responses, occurrences,
      expectedOccurrenceCount: occurrences.length,
      expectedLifecycleHeadHash: occurrences.at(-1).occurrenceHash },
    adapterContext,
    expectedAdapterContextHash: contextHash,
    permissionLifecycleEventSourceBytes: permissionEvents,
    expectedPermissionLifecycleEventSourceHashes: permissionHashes,
    expectedPermissionLifecycleEventCount: permissionEvents.length,
    permissionLifecycleHeadSourceBytes: permissionHead,
    expectedPermissionLifecycleHeadSourceHash: sha(permissionHead),
    routeObservationSourceBytes: routeBytes,
    expectedRouteObservationSourceHash: sha(routeBytes),
    outboundMessageSourceBytes: outboundBytes,
    expectedOutboundMessageSourceHash: sha(outboundBytes),
    outboundRfc822Bytes: outboundRaw.bytes,
    expectedOutboundRfc822Hash: sha(outboundRaw.bytes),
    sendAcknowledgementSourceBytes: ackBytes,
    expectedSendAcknowledgementSourceHash: sha(ackBytes),
    inboundMessageSourceBytes: inboundBytes,
    expectedInboundMessageSourceHashes: inboundSourceHashes,
    inboundRfc822Bytes,
    expectedInboundRfc822Hashes: inboundRfc822Hashes,
    expectedInboundMessageOccurrenceCount: inboundBytes.length,
    expectedTransportOccurrenceCount: occurrenceHashes.length,
    transportHeadSourceBytes: transportHead,
    expectedTransportHeadSourceHash: sha(transportHead),
    observedAt,
    privateProjectionNonce:
      slotHash("mailbox-private-projection-nonce").slice(7),
  };
  return { source, mailboxKey, registryKey, standingKey, accountable, owner,
    tender, binding, privateScope, route, response, ownerStanding,
    inboundPayloads, adapterContext, requirementKind, slotLabel };
}


function foundationForMailbox(f) {
  const tender = f.source.tender;
  const providerRefHash = f.response.providerRefHash;
  const commercialTerm = {
    quoteRefHash: h("gate4-v1-quote"),
    currency: "USD",
    amountMinor: "10000",
  };
  const ownerMandate = createOwnerOneUseMandateV1({
    tenderHash: tender.tenderHash,
    scopeHash: tender.exactOutcome.exactOutcomeHash,
    ownerPrincipalRefHash: h("gate4-v1-owner"),
    delegationEnvelopeHash: h("gate4-v1-owner-delegation"),
    evidencePlanHash: tender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: tender.recoveryRequirements.requirementSetHash,
    commercialTerm,
    issuedAt: "2026-09-02T12:01:00.000Z",
    expiresAt: "2026-09-02T13:59:00.000Z",
    oneUseNonceHash: h("gate4-v1-owner-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("gate4-v1-owner-signature"),
  });
  const providerAcceptance = createProviderOneUseAcceptanceV1({
    tenderHash: tender.tenderHash,
    scopeHash: tender.exactOutcome.exactOutcomeHash,
    providerRefHash,
    evidencePlanHash: tender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: tender.recoveryRequirements.requirementSetHash,
    commercialTerm,
    acceptedAt: "2026-09-02T12:02:00.000Z",
    expiresAt: "2026-09-02T13:59:00.000Z",
    oneUseNonceHash: h("gate4-v1-provider-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("gate4-v1-provider-signature"),
  });
  const capacityReservationReceipt
    = createExternalCapacityReservationReceiptBindingV1({
      tenderHash: tender.tenderHash,
      scopeHash: tender.exactOutcome.exactOutcomeHash,
      providerAcceptanceHash: providerAcceptance.providerAcceptanceHash,
      commercialTermHash: providerAcceptance.commercialTerm.commercialTermHash,
      externalSystemRefHash: h("gate4-v1-capacity-system"),
      externalReservationRefHash: h("gate4-v1-capacity-reservation"),
      externalReceiptArtifactHash: h("gate4-v1-capacity-receipt"),
      issuedAt: "2026-09-02T12:03:00.000Z",
      reservedFrom: "2026-09-02T15:00:00.000Z",
      reservedUntil: "2026-09-02T16:30:00.000Z",
      status: "RESERVED",
      signatureRefHash: h("gate4-v1-capacity-signature"),
    });
  const source = {
    formationId: alias("formation", "gate4-mailbox"),
    evaluatedAt: f.source.observedAt,
    expectedTenderHash: tender.tenderHash,
    tender,
    ownerMandate,
    providerAcceptance,
    capacityReservationReceipt,
    consumedNonceHashes: [],
    untrustedCallerAssertions: {
      capacityReceiptAuthentic: false,
      externalTrustEstablished: false,
      authorityEstablished: false,
      riskCapitalEstablished: false,
      custodyEstablished: false,
      adjudicationEstablished: false,
      independentWitnessEstablished: false,
      rightsPrivacyCleared: false,
      actionReady: false,
      priceAuthorityEstablished: false,
      guaranteeAuthorityEstablished: false,
      settlementAuthorityEstablished: false,
    },
    autonomousWorkOrder: null,
    actionAdmissionReplay: null,
    attemptSetReplay: null,
    networkOutcomeWitnessReplay: null,
    actionObligationHoldCompositionInput: null,
  };
  return {
    source,
    record: createOutcomeFormationFoundationBoundEvaluationV1(source),
  };
}

function temporaryNetworkV1ForMailbox(f) {
  const foundation = foundationForMailbox(f);
  const northStarSource
    = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
  const northStarRecord
    = createOutcomeFormationTemporaryNetworkNorthStarV1(northStarSource);
  const responseLifecycleSource = {
    tender: f.source.tender,
    expectedTenderHash: f.source.expectedTenderHash,
    responses: f.source.oneUseResponseReplay.responses,
    occurrences: f.source.oneUseResponseReplay.occurrences,
    expectedOccurrenceCount:
      f.source.oneUseResponseReplay.expectedOccurrenceCount,
    expectedLifecycleHeadHash:
      f.source.oneUseResponseReplay.expectedLifecycleHeadHash,
    observedAt: f.source.observedAt,
  };
  const responseCheck = verifyOneUseTenderResponseLifecycleV1(
    responseLifecycleSource);
  assert.equal(responseCheck.ok, true, responseCheck.error);
  const source = {
    temporaryNetworkId: alias("network", "gate4-mailbox"),
    observedAt: f.source.observedAt,
    northStarReplay: {
      record: northStarRecord,
      source: northStarSource,
      expectedNorthStarInvariantHash: northStarRecord.northStarInvariantHash,
    },
    foundationBoundEvaluationReplay: {
      record: foundation.record,
      source: foundation.source,
      expectedFoundationBoundEvaluationHash:
        foundation.record.foundationBoundEvaluationHash,
    },
    routeDiscoveryReplay: f.source.routeDiscoveryReplay,
    selectedRouteResponseSources: [{
      routeObjectHash: f.source.selectedRouteObjectHash,
      currentCandidateHash: f.source.selectedCandidateHash,
      responseLifecycleSource,
      expectedResponseLifecycleVerificationHash:
        responseCheck.verificationHash,
      externalCapacityLifecycleSource: null,
      expectedExternalCapacityVerificationHash: null,
    }],
  };
  const record = createOutcomeFormationTemporaryNetworkV1(source);
  const checked = verifyOutcomeFormationTemporaryNetworkV1(record, {
    source,
    expectedTemporaryNetworkHash: record.temporaryNetworkHash,
  });
  assert.equal(checked.ok, true, checked.error);
  return { source, record };
}


function responseLifecycleSourceForMailbox(mailbox) {
  return {
    tender: mailbox.source.tender,
    expectedTenderHash: mailbox.source.expectedTenderHash,
    responses: mailbox.source.oneUseResponseReplay.responses,
    occurrences: mailbox.source.oneUseResponseReplay.occurrences,
    expectedOccurrenceCount:
      mailbox.source.oneUseResponseReplay.expectedOccurrenceCount,
    expectedLifecycleHeadHash:
      mailbox.source.oneUseResponseReplay.expectedLifecycleHeadHash,
    observedAt: mailbox.source.observedAt,
  };
}

function temporaryNetworkV1ForMailboxes(mailboxes, label) {
  const primary = mailboxes[0];
  const foundation = foundationForMailbox(primary);
  const northStarSource
    = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
  const northStarRecord
    = createOutcomeFormationTemporaryNetworkNorthStarV1(northStarSource);
  const selectedRouteResponseSources = mailboxes.map((mailbox) => {
    const responseLifecycleSource = responseLifecycleSourceForMailbox(mailbox);
    const responseCheck = verifyOneUseTenderResponseLifecycleV1(
      responseLifecycleSource);
    assert.equal(responseCheck.ok, true, responseCheck.error);
    return {
      routeObjectHash: mailbox.source.selectedRouteObjectHash,
      currentCandidateHash: mailbox.source.selectedCandidateHash,
      responseLifecycleSource,
      expectedResponseLifecycleVerificationHash:
        responseCheck.verificationHash,
      externalCapacityLifecycleSource: null,
      expectedExternalCapacityVerificationHash: null,
    };
  });
  const source = {
    temporaryNetworkId: alias("network", `coordinator-${label}`),
    observedAt: primary.source.observedAt,
    northStarReplay: {
      record: northStarRecord,
      source: northStarSource,
      expectedNorthStarInvariantHash: northStarRecord.northStarInvariantHash,
    },
    foundationBoundEvaluationReplay: {
      record: foundation.record,
      source: foundation.source,
      expectedFoundationBoundEvaluationHash:
        foundation.record.foundationBoundEvaluationHash,
    },
    routeDiscoveryReplay: primary.source.routeDiscoveryReplay,
    selectedRouteResponseSources,
  };
  const record = createOutcomeFormationTemporaryNetworkV1(source);
  const checked = verifyOutcomeFormationTemporaryNetworkV1(record, {
    source,
    expectedTemporaryNetworkHash: record.temporaryNetworkHash,
  });
  assert.equal(checked.ok, true, checked.error);
  return { source, record };
}

export function createTemporaryNetworkV2MultiSlotFixture(options = {}) {
  const label = options.fixtureLabel ?? "coordinator";
  const observedAt = options.observedAt ?? "2026-09-02T13:30:00.000Z";
  const accountable = actor(`mailbox-accountable-${label}`, {
    episodeHash: h(`mailbox-episode-${label}`),
    attemptHash: h(`mailbox-attempt-${label}`),
  });
  const tender = tenderFor(accountable, {
    formationDeadline: options.formationDeadline,
  });
  const routeDiscovery = multiRouteFor(tender, options);
  const shared = { accountable, tender, routeByKind: routeDiscovery.byKind };
  const kinds = ["RESOURCE", "EVIDENCE", "RECOVERY"];
  const mailboxes = kinds.map((requirementKind) => fixture({
    shared,
    requirementKind,
    slotLabel: `${label}-${requirementKind.toLowerCase()}`,
    observedAt,
  }));
  const v1 = temporaryNetworkV1ForMailboxes(mailboxes, label);
  const slots = mailboxes.map((mailbox) => {
    const transactionReplay
      = createPermissionedTransactionInterfaceSourceReplayV1(mailbox.source);
    const source = {
      observedAt,
      temporaryNetworkV1Replay: {
        record: v1.record,
        source: v1.source,
        expectedTemporaryNetworkHash: v1.record.temporaryNetworkHash,
      },
      transactionInterfaceReplay: {
        profile: OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
        source: mailbox.source,
        expectedReplayHash: transactionReplay.replayHash,
      },
      resourceOwnerStandingReplay: {
        source: mailbox.ownerStanding.source,
        expectedReplayHash: mailbox.ownerStanding.replay.replayHash,
      },
      privateProjectionNonce:
        h(`${label}:${mailbox.requirementKind}:v2-private`).slice(7),
    };
    const record = createOutcomeFormationTemporaryNetworkV2(source);
    const checked = verifyOutcomeFormationTemporaryNetworkV2(
      source, record.temporaryNetworkHash);
    assert.equal(checked.ok, true, checked.error);
    return {
      requirementKind: mailbox.requirementKind,
      requirementId: record.normalizedTransactionSlot.requirementId,
      source,
      record,
      expectedTemporaryNetworkHash: record.temporaryNetworkHash,
      transactionReplay,
      ownerStanding: mailbox.ownerStanding,
      mailbox,
    };
  });
  return {
    observedAt,
    tender,
    accountable,
    owner: mailboxes[0].owner,
    routeDiscovery,
    v1,
    slots,
    slotReplays: slots.map((slot) => ({
      source: slot.source,
      expectedTemporaryNetworkHash: slot.expectedTemporaryNetworkHash,
    })),
  };
}
