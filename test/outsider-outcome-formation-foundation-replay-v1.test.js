import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
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
  createActionEvidenceCommitment,
  createActionResponsibilityCommitment,
  createUnresolvedExternalAuthoritySlot,
  requestActionAdmission,
} from "../src/outsider-action-admission.js";
import { deriveActionObligationResponsibilityRefHash }
  from "../src/outsider-action-obligation-hold-composition.js";
import { createAutonomousWorkOrderProjection }
  from "../src/outsider-autonomous-work-order.js";
import { normalizeDelegationRadius }
  from "../src/outsider-delegation-radius.js";
import { createEpisodeAttemptSetComposition }
  from "../src/outsider-episode-attempt-set-composition.js";
import {
  OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS,
  OutsiderOutcomeWitnessAdapterRegistry,
  createOutsiderOutcomeWitnessAdapterDescriptor,
  createOutsiderOutcomeWitnessEnvelope,
  createOutsiderOutcomeWitnessSourceManifest,
} from "../src/outsider-network-outcome-witness.js";
import {
  OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY,
  OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS,
  createOutcomeFormationFoundationBoundEvaluationV1,
  createOutcomeFormationFoundationReplayV1,
  verifyOutcomeFormationFoundationBoundEvaluationV1,
  verifyOutcomeFormationFoundationReplayV1,
} from "../src/outsider-outcome-formation-foundation-replay-v1.js";
import {
  createExternalCapacityReservationReceiptBindingV1,
  createOwnerOneUseMandateV1,
  createProviderOneUseAcceptanceV1,
} from "../src/outsider-one-use-commitments-v1.js";
import { RealityObligationStore }
  from "../src/outsider-reality-obligation-store.js";
import { compileOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(`foundation-replay:${label}`, "utf8").digest("hex")}`;
const id = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const mutable = (value) => JSON.parse(JSON.stringify(value));
const domainDigest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

function keyPair() {
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
    validFrom: "2026-09-01T00:00:00.000Z",
    validUntil: "2026-09-04T00:00:00.000Z",
  };
}

function assurance(prefix, label, assuranceClass = "SOURCE_REPLAYED_REFERENCE") {
  return {
    class: assuranceClass,
    evidenceRefHash: h(`${prefix}:assurance:${label}`),
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
  return domainDigest("outsider/actor-deployment-lineage-projection/v1", {
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    issuerPrincipalRefHash: value.issuerPrincipalRefHash,
    lineageDeclarationRefHash: value.lineageDeclarationRefHash,
    assurance: normalizedAssurance(value.assurance),
  });
}

function deploymentRevisionHash(value, lineage) {
  return domainDigest(ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision, {
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

function witnessIdentityInput(prefix, common) {
  const modelArtifactRefHash = h(`${prefix}:model-ref`);
  const deploymentLineage = {
    deploymentLineageRefHash: h(`${prefix}:deployment-lineage`),
    issuerPrincipalRefHash: h(`${prefix}:principal`),
    lineageDeclarationRefHash: h(`${prefix}:lineage-declaration`),
    assurance: assurance(prefix, "lineage", "OPERATOR_SIGNED_REFERENCE"),
  };
  const deploymentRevision = {
    deploymentLineageRefHash: deploymentLineage.deploymentLineageRefHash,
    wayHash: common.wayHash,
    runtimeClosureHash: h(`${prefix}:runtime-closure`),
    configClosureHash: h(`${prefix}:config-closure`),
    memoryPolicyHash: h(`${prefix}:memory-policy`),
    controllerImplementationHash: h(`${prefix}:controller`),
    adapterHash: h(`${prefix}:adapter`),
    providerRootHash: h(`${prefix}:provider`),
    topologyHash: h(`${prefix}:topology`),
    modelArtifactRefHashes: [modelArtifactRefHash],
    dataRootHashes: [h(`${prefix}:data-root`)],
    toolchainRootHashes: [h(`${prefix}:toolchain-root`)],
    assurance: assurance(prefix, "deployment"),
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
        censusHash: common.censusHash,
        observedAt: "2026-09-02T12:00:00.000Z",
      },
    },
    principalEpoch: {
      principalRefHash: h(`${prefix}:principal`),
      epochRefHash: h(`${prefix}:principal-epoch`),
      trustDomainRefHash: h(`${prefix}:trust-domain`),
      controllerKeyRefHash: h(`${prefix}:controller-key`),
      credentialRefHash: h(`${prefix}:credential`),
      validFrom: "2026-09-01T00:00:00.000Z",
      validUntil: "2026-09-04T00:00:00.000Z",
      assurance: assurance(prefix, "principal", "LEGAL_BINDING_REFERENCE"),
    },
    deploymentLineage,
    deploymentRevision,
    modelArtifacts: [{
      modelArtifactRefHash,
      providerRevisionRefHash: h(`${prefix}:provider-model-revision`),
      artifactRootHash: h(`${prefix}:model-artifact-root`),
      baseModelRefHash: h(`${prefix}:base-model`),
      tokenizerRootHash: h(`${prefix}:tokenizer`),
      quantizationRootHash: h(`${prefix}:quantization`),
      fineTuneState: "PROVENANCE_REFERENCE_PRESENT",
      fineTuneProvenanceRefHash: h(`${prefix}:fine-tune`),
      assurance: assurance(prefix, "model"),
    }],
    modelRoute: {
      transparency: "EXACT_ARTIFACT_BOUND",
      routePolicyHash: h(`${prefix}:route-policy`),
      selectedModelArtifactRefHashes: [modelArtifactRefHash],
      routeEvidenceRefHash: h(`${prefix}:route-evidence`),
      assurance: assurance(prefix, "route", "OPERATOR_SIGNED_REFERENCE"),
    },
    runtimeInstance: {
      runtimeInstanceRefHash: h(`${prefix}:runtime-instance`),
      instanceKeyRefHash: h(`${prefix}:instance-key`),
      bootEpochRefHash: h(`${prefix}:boot-epoch`),
      loadedWayHash: common.wayHash,
      loadedDeploymentRevisionHash:
        deploymentRevisionHash(deploymentRevision, deploymentLineage),
      workloadAttestationRefHash: h(`${prefix}:workload-attestation`),
      memoryStateMode: "BOUND",
      memoryStateCommitmentHash: h(`${prefix}:memory-state`),
      validFrom: "2026-09-01T00:00:00.000Z",
      validUntil: "2026-09-04T00:00:00.000Z",
      assurance: assurance(prefix, "runtime", "WORKLOAD_ATTESTATION_REFERENCE"),
    },
    embodimentRevision: null,
    delegationEdges: [],
    lifecycleEdges: [],
  };
}

function witnessIdentity(prefix, common) {
  const source = createActorIdentityEnvelopeSource(
    witnessIdentityInput(prefix, common));
  return { source, envelope: buildActorIdentityEnvelope(source) };
}

function identityProjection(value) {
  const envelope = value.envelope;
  return {
    actorIdentityEnvelopeHash: envelope.actorIdentityEnvelopeHash,
    actorSubjectHash: envelope.actorSubjectHash,
    attemptActorSubjectHash: envelope.attemptActorSubjectHash,
    principalEpochProjectionHash: envelope.principalEpochProjectionHash,
    deploymentLineageProjectionHash: envelope.deploymentLineageProjectionHash,
    runtimeInstanceHash: envelope.runtimeInstance.runtimeInstanceHash,
    controllerKeyRefHash: envelope.principalEpoch.controllerKeyRefHash,
    providerRootHash: envelope.deploymentRevision.providerRootHash,
    trustDomainRefHash: envelope.principalEpoch.trustDomainRefHash,
  };
}

function signedRelationshipReview(body, signer) {
  const reviewHash = domainDigest(
    OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview, body);
  return {
    ...body,
    reviewHash,
    signature: {
      algorithm: "Ed25519",
      keyId: keyId(signer.publicKey),
      value: cryptoSign(null, Buffer.from(reviewHash), signer.privateKey)
        .toString("base64"),
    },
  };
}

function witnessTrustPolicy(body) {
  return {
    ...body,
    policyHash: domainDigest(
      OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy, body),
  };
}

function graph() {
  return {
    principalEpoch: {
      principalRefHash: h("principal"),
      epochRefHash: h("epoch"),
      principalEpochProjectionHash: h("principal-epoch"),
    },
    accountableDeployment: {
      deploymentLineageRefHash: h("deployment-lineage"),
      deploymentRevisionHash: h("deployment-revision"),
      accountableDeploymentSubjectHash: h("deployment-subject"),
    },
    runtime: {
      runtimeInstanceRefHash: h("runtime-ref"),
      runtimeInstanceHash: h("runtime"),
    },
    embodiment: {
      present: true,
      deviceLineageRefHash: h("device-lineage"),
      embodimentRevisionHash: h("embodiment-revision"),
    },
    delegation: {
      delegationEvidenceRefHash: h("delegation-evidence"),
      delegationEdgeHash: h("delegation-edge"),
    },
    episode: {
      episodeHash: h("episode"),
      networkCompleteEpisodeJoinHash: h("complete-episode"),
    },
    attempt: {
      attemptHash: h("attempt"),
      attemptActorSubjectHash: h("attempt-actor"),
    },
  };
}

function workOrder({
  genesisHash = h("obligation-genesis"),
  stateHash = h("obligation-state"),
} = {}) {
  const typedGraph = graph();
  const provider = h("provider");
  return createAutonomousWorkOrderProjection({
    orderId: id("awo", "work-order"),
    recordedAt: "2026-09-02T12:00:00.000Z",
    appendOnlyLineage: {
      revision: 0,
      predecessorProjectionHash: null,
      supersedesProjectionHash: null,
    },
    typedGraph,
    contractReferences: {
      actorIdentityEnvelopeHash: h("identity-envelope"),
      realitySemanticBundleHash: h("semantic-bundle"),
      realityObligationGenesisHash: genesisHash,
      realityObligationStateHash: stateHash,
      affectedPartyRootHash: h("affected-party-root"),
      outcomeWitnessEnvelopeHash: null,
    },
    resourceOwner: {
      resourceOwnerRefHash: h("owner"),
      ownerAdoptionEvidenceRefHash: null,
      externalAdoptionEstablished: false,
    },
    promisedOutcome: {
      promisedOutcomeRefHash: h("outcome-spec"),
      acceptanceCriteriaHash: h("acceptance-criteria"),
      outcomeWitnessRequirementHash: h("probe-requirement"),
      consequenceChannelHashes: [h("affected-channel")],
    },
    observationHorizons: [{
      horizonId: "immediate",
      dueAfterMs: 0,
      observationRequirementHash: h("probe-requirement"),
      mandatory: true,
    }, {
      horizonId: "longitudinal",
      dueAfterMs: 86_400_000,
      observationRequirementHash: h("probe-requirement"),
      mandatory: true,
    }],
    obligors: [{
      obligorRefHash: provider,
      role: "PRIMARY_PERFORMANCE",
      obligationRefHash: h("performance-obligation"),
    }, {
      obligorRefHash: provider,
      role: "RECOVERY",
      obligationRefHash: h("recovery-obligation"),
    }],
    remedyMenu: [{
      remedyId: "reperform",
      kind: "REPERFORM",
      remedyTermsHash: h("recovery-outcome"),
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
      roleScopedProofPolicyHash: h("proof-policy"),
      redactionPolicyHash: h("redaction-policy"),
    },
  });
}

function tender(order, overrides = {}) {
  const evidenceId = id("evidence", "independent-evidence");
  return compileOutcomeTenderV1({
    tenderId: id("tender", "tender"),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: {
      revision: 0,
      predecessorTenderHash: null,
      supersedesTenderHash: null,
    },
    workOrderHash: order.workOrderHash,
    typedGraph: graph(),
    authorizationBinding: {
      actorIdentityEnvelopeHash: h("identity-envelope"),
      delegationEvidenceRefHash: h("delegation-evidence"),
      delegationEdgeHash: h("delegation-edge"),
      authorityScopeRefHash: h("authority-scope"),
      resourceOwnerAuthorizationRefHash: h("owner-authorization"),
      rightsPrivacyPolicyRefHash: h("rights-policy"),
    },
    exactOutcome: {
      outcomeKindCode: "NETWORK_CONNECTIVITY_RESTORED",
      outcomeSpecRefHash: overrides.outcomeSpecRefHash ?? h("outcome-spec"),
      subjectRefHash: h("private-subject"),
      acceptanceCriteriaRefHash: overrides.acceptanceCriteriaRefHash
        ?? h("acceptance-criteria"),
      conditions: [{
        conditionId: id("condition", "connected"),
        metricCode: "CONNECTIVITY_STATE",
        comparator: "EQUAL",
        target: {
          valueKind: "STATE_CODE",
          booleanValue: null,
          integerValue: null,
          stateCode: "CONNECTED",
          unitCode: null,
        },
        observationWindowMs: 0,
        conditionRefHash: h("connected-condition"),
        mandatory: true,
      }],
      deadline: "2026-09-03T12:00:00.000Z",
    },
    formationDeadline: "2026-09-02T12:30:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: id("resource", "technician"),
      resourceClassCode: "NETWORK_TECHNICIAN",
      capabilityRefHash: h("technician-capability"),
      quantity: 1,
      unitCode: "PERSON_VISIT",
      regionRefHash: h("private-region"),
      requiredBy: "2026-09-03T08:00:00.000Z",
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "INDEPENDENT_NETWORK_PROBE",
      evidenceRequirementRefHash: overrides.evidenceRequirementRefHash
        ?? h("probe-requirement"),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "LONGITUDINAL",
      dueBy: "2026-09-03T12:00:00.000Z",
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: id("recovery", "alternate"),
      triggerRefHash: h("recovery-trigger"),
      recoveryOutcomeRefHash: overrides.recoveryOutcomeRefHash
        ?? h("recovery-outcome"),
      resourceClassCode: "ALTERNATE_NETWORK_TECHNICIAN",
      maximumAttempts: 2,
      completionDeadline: "2026-09-03T12:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h("consequence-envelope"),
      consequenceClassCode: "BOUNDED_SERVICE_INTERRUPTION",
      measureCode: "MAXIMUM_INTERRUPTION_MINUTES",
      maximumValue: 240,
      unitCode: "MINUTE",
      affectedChannelRefHashes: [h("affected-channel")],
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

function radius(limit) {
  return normalizeDelegationRadius({
    validity: {
      validFrom: "2026-09-02T11:00:00.000Z",
      validUntil: "2026-09-02T13:00:00.000Z",
    },
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [h("scope")],
      budget: { unitHash: h("budget-unit"), limit },
    }],
  });
}

function actionSource(run = {
  episodeHash: h("episode"),
  attemptHash: h("attempt"),
  censusHash: h("prospective-census"),
}, overrides = {}) {
  const capability = radius("1");
  const effect = radius("2");
  const authority = radius("3");
  const evidence = radius("4");
  const responsibility = radius("5");
  const channel = h("affected-channel");
  const horizonHashes = overrides.horizonHashes ?? [h("horizon")];
  const claimWayWorld = overrides.claimWayWorld ?? {
    claimHash: h("claim"),
    wayHash: h("way"),
    worldHash: h("world"),
  };
  return {
    bindings: {
      claimWayWorld: {
        claimHash: claimWayWorld.claimHash,
        wayHash: claimWayWorld.wayHash,
        worldHash: claimWayWorld.worldHash,
      },
      run,
      governance: {
        ownerGateSlotHash: h("owner-gate"),
        adoptionSlotHash: h("adoption"),
        revocationStatusSlotHash: h("revocation"),
      },
      state: { beforeStateHash: h("before-state") },
      validity: {
        validitySlotHash: h("validity-slot"),
        evaluatedAt: "2026-09-02T12:05:00.000Z",
      },
    },
    capabilityRadius: capability,
    effectRadius: effect,
    referencedAuthority: {
      radius: authority,
      externalVerifierSlot: createUnresolvedExternalAuthoritySlot({
        externalVerifierContractHash: h("authority-verifier"),
        authorityArtifactRefHash: h("authority-artifact"),
        authorityRadiusHash: authority.radiusHash,
      }),
    },
    evidence: {
      radius: evidence,
      commitment: createActionEvidenceCommitment({
        commitmentRefHash: h("evidence-commitment"),
        radius: evidence,
        affectedChannelHashes: [channel],
        horizonHashes,
        custodianRefHashes: [h("custodian")],
      }),
    },
    responsibility: {
      radius: responsibility,
      commitment: createActionResponsibilityCommitment({
        commitmentRefHash: overrides.responsibilityRefHash
          ?? h("responsibility-commitment"),
        radius: responsibility,
        affectedChannelHashes: [channel],
        horizonHashes,
        responsiblePartyRefHashes: [h("responsible-party")],
      }),
    },
    consequenceEnvelope: {
      affectedChannelHashes: [channel],
      horizonHashes,
    },
  };
}

function attemptSet(order, censusHash = h("prospective-census")) {
  return createEpisodeAttemptSetComposition({
    recordedAt: "2026-09-02T12:02:00.000Z",
    episodeBinding: {
      principalEpochProjectionHash: h("principal-epoch"),
      accountableDeploymentSubjectHash: h("deployment-subject"),
      runtimeInstanceHash: h("runtime"),
      embodimentRevisionHash: h("embodiment-revision"),
      delegationEdgeHash: h("delegation-edge"),
      episodeHash: h("episode"),
      workOrderProjectionHash: order.workOrderHash,
      networkCompleteEpisodeJoinHash: h("complete-episode"),
      prospectiveCensusProjectionHash: censusHash,
      realityObligationGenesisHash:
        order.contractReferences.realityObligationGenesisHash,
      realityObligationStateHash:
        order.contractReferences.realityObligationStateHash,
      genesisObligationAttemptHash: h("attempt"),
    },
    appendOnlyLineage: {
      revision: 0,
      predecessorCompositionHash: null,
      supersedesCompositionHash: null,
    },
    attempts: [{
      attemptOrdinal: 1,
      occurredAt: "2026-09-02T12:01:00.000Z",
      episodeHash: h("episode"),
      attemptHash: h("attempt"),
      attemptActorSubjectHash: h("attempt-actor"),
      kind: "PRIMARY",
      retryOfAttemptHash: null,
      recoveryOfAttemptHash: null,
    }],
    reportOccurrences: [],
  }, { predecessor: null });
}

function fixture(action = actionSource()) {
  const order = workOrder();
  const compiledTender = tender(order);
  const request = requestActionAdmission(action);
  const composition = attemptSet(order, action.bindings.run.censusHash);
  return {
    expectedTenderHash: compiledTender.tenderHash,
    tender: compiledTender,
    autonomousWorkOrder: order,
    actionAdmissionReplay: { request, source: action },
    attemptSetReplay: { composition, predecessor: null },
    networkOutcomeWitnessReplay: null,
    actionObligationHoldCompositionInput: null,
  };
}

function obligationFixture(t, label) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-formation-bridge-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, label);
  const obligationStore = RealityObligationStore.create({
    directory,
    obligationId: `formation-bridge-${label}`,
    bindings: {
      claimHash: h("claim"),
      wayHash: h("way"),
      worldHash: h("world"),
      episodeHash: h("episode"),
      attemptHash: h("attempt"),
      censusRegistrationHash: h("prospective-census"),
      responsibilityGraphHash: h(`responsibility-graph:${label}`),
      affectedPartyRootHash: h(`affected-party-root:${label}`),
      budgetCommitmentHash: h(`budget:${label}`),
      recoveryPolicyHash: h(`recovery-policy:${label}`),
      challengePolicyHash: h(`challenge-policy:${label}`),
    },
    consequenceChannelHashes: [h("affected-channel")],
    mandatoryHorizons: [{
      horizonId: "immediate",
      dueAfterMs: 0,
      observationRequirementHash: h(`obligation-immediate:${label}`),
      mandatory: true,
    }, {
      horizonId: "delayed",
      dueAfterMs: 86_400_000,
      observationRequirementHash: h(`obligation-delayed:${label}`),
      mandatory: true,
    }],
    createdAt: "2026-09-02T11:30:00.000Z",
  });
  const snapshot = obligationStore.snapshot();
  const order = workOrder({
    genesisHash: snapshot.genesis.genesisHash,
    stateHash: snapshot.stateHash,
  });
  const compiledTender = tender(order);
  const horizonHashes = snapshot.genesis.mandatoryHorizons
    .map(({ horizonCommitmentHash }) => horizonCommitmentHash);
  const responsibilityRefHash = deriveActionObligationResponsibilityRefHash({
    genesisHash: snapshot.genesis.genesisHash,
    stateHash: snapshot.stateHash,
  });
  const action = actionSource({
    episodeHash: h("episode"),
    attemptHash: h("attempt"),
    censusHash: h("prospective-census"),
  }, {
    horizonHashes,
    responsibilityRefHash,
  });
  const request = requestActionAdmission(action);
  const composition = attemptSet(order, action.bindings.run.censusHash);
  const actionObligationHoldCompositionInput = {
    admissionRequest: request,
    admissionSource: action,
    expectedAdmissionRequestHash: request.admissionRequestHash,
    obligationDirectory: directory,
    expectedObligationGenesisHash: snapshot.genesis.genesisHash,
    expectedObligationStateHash: snapshot.stateHash,
  };
  return {
    snapshot,
    source: {
      expectedTenderHash: compiledTender.tenderHash,
      tender: compiledTender,
      autonomousWorkOrder: order,
      actionAdmissionReplay: { request, source: action },
      attemptSetReplay: { composition, predecessor: null },
      networkOutcomeWitnessReplay: null,
      actionObligationHoldCompositionInput,
    },
  };
}

function witnessReplayFixture(attemptHash = h("attempt")) {
  const common = {
    claimHash: h("claim"),
    wayHash: h("way"),
    worldHash: h("world"),
    episodeHash: h("episode"),
    attemptHash,
    censusHash: h("prospective-census"),
  };
  const actor = witnessIdentity("witness-actor", common);
  const witness = witnessIdentity("independent-witness", common);
  const witnessSigning = keyPair();
  const relationshipSigning = keyPair();
  const actorRoots = Object.values(identityProjection(actor)).sort();
  const witnessRoots = Object.values(identityProjection(witness)).sort();
  const target = {
    claimHash: common.claimHash,
    wayHash: common.wayHash,
    worldHash: common.worldHash,
    episodeHash: common.episodeHash,
    attemptHash: common.attemptHash,
    executionEvidenceHash: h("execution-evidence"),
  };
  const horizon = {
    horizonId: "delayed",
    obligationHorizonCommitmentHash: h("witness-obligation-horizon"),
    affectedPartyHorizonBindingHash: h("witness-affected-party-horizon"),
  };
  const observation = {
    role: "RESOURCE_OWNER_READBACK",
    observationStatus: "OBSERVED",
    observedAt: "2026-09-02T12:06:00.000Z",
    normalizedObservationHash: h("normalized-observation"),
    consequenceReportHash: h("consequence-report"),
    affectedPartyReportSetHash: h("affected-party-report-set"),
    recoveryEvidenceSetHash: h("recovery-evidence-set"),
  };
  const sourceObjects = [{
    objectId: "owner-readback",
    immutableVersion: "revision-1",
    bytes: Buffer.from(JSON.stringify(observation), "utf8"),
  }];
  const sourceManifest = createOutsiderOutcomeWitnessSourceManifest({
    sourceId: "owner-instrument-feed",
    sourceClass: "RESOURCE_OWNER_READBACK",
    objects: sourceObjects,
    rightsReviewHash: h("witness-rights-review"),
    privacyReviewHash: h("witness-privacy-review"),
    retentionDays: 30,
  });
  const descriptor = createOutsiderOutcomeWitnessAdapterDescriptor({
    adapterId:
      OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS.JSON_OBSERVATION_V1,
    adapterVersion: "1.0.0",
    sourceClass: sourceManifest.sourceClass,
    sourceSchema: {
      mediaType: "application/json",
      record: "outcome-observation-v1",
    },
    instrumentHash: h("owner-instrument"),
  });
  const registry = new OutsiderOutcomeWitnessAdapterRegistry();
  registry.register({
    descriptor,
    sourceSchema: {
      mediaType: "application/json",
      record: "outcome-observation-v1",
    },
  });
  const replayReceipt = registry.replay({
    adapterId: descriptor.adapterId,
    sourceManifest,
    sourceObjects,
    target,
    horizon,
    witnessIdentity: witness,
  });
  const reviewBody = {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview,
    schemaVersion: "1.0.0",
    registryId: "relationship-registry-formation-bridge",
    reviewId: "formation-bridge-review-0001",
    actor: {
      identityEnvelopeHash: actor.envelope.actorIdentityEnvelopeHash,
      subjectHash: actor.envelope.actorSubjectHash,
      correlationRootHashes: actorRoots,
    },
    witness: {
      identityEnvelopeHash: witness.envelope.actorIdentityEnvelopeHash,
      subjectHash: witness.envelope.actorSubjectHash,
      correlationRootHashes: witnessRoots,
    },
    relationshipClassesReviewed:
      [...OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES].sort(),
    relationshipEvidenceSetHash: h("relationship-evidence"),
    finding: "NO_KNOWN_SHARED_CONTROL_WITHIN_DECLARED_SCOPE",
    issuedAt: "2026-09-02T12:04:00.000Z",
    validFrom: "2026-09-01T00:00:00.000Z",
    validUntil: "2026-09-04T00:00:00.000Z",
    issuerOrganizationHash: h("relationship-review-issuer"),
  };
  const relationshipReview = signedRelationshipReview(reviewBody,
    relationshipSigning);
  const policyBody = {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy,
    expectedWitnessRegistryId: "witness-registry-formation-bridge",
    expectedRelationshipRegistryId: relationshipReview.registryId,
    expectedActorIdentityEnvelopeHash: actor.envelope.actorIdentityEnvelopeHash,
    expectedActorSubjectHash: actor.envelope.actorSubjectHash,
    expectedActorCorrelationRootSetHash: domainDigest(
      "outsider/outcome-witness-correlation-root-set/v1", actorRoots),
    expectedWitnessIdentityEnvelopeHash:
      witness.envelope.actorIdentityEnvelopeHash,
    expectedWitnessActorSubjectHash: witness.envelope.actorSubjectHash,
    expectedWitnessPrincipalEpochProjectionHash:
      witness.envelope.principalEpochProjectionHash,
    expectedWitnessCorrelationRootSetHash: domainDigest(
      "outsider/outcome-witness-correlation-root-set/v1", witnessRoots),
    expectedRelationshipReviewHash: relationshipReview.reviewHash,
    witnessSigningKeyEpochs: [keyEpoch(witnessSigning)],
    relationshipReviewIssuer: {
      organizationHash: relationshipReview.issuerOrganizationHash,
      keyEpochs: [keyEpoch(relationshipSigning)],
    },
    requiredRelationshipClasses:
      [...OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES].sort(),
    validFrom: "2026-09-01T00:00:00.000Z",
    validUntil: "2026-09-04T00:00:00.000Z",
  };
  const trustPolicy = witnessTrustPolicy(policyBody);
  const envelope = createOutsiderOutcomeWitnessEnvelope({
    replayReceipt,
    witnessIdentity: witness,
    relationshipReviewHash: relationshipReview.reviewHash,
    witnessRegistryId: trustPolicy.expectedWitnessRegistryId,
    signedAt: "2026-09-02T12:07:00.000Z",
  }, { witnessPrivateKeyPem: witnessSigning.privateKey });
  return {
    envelope,
    context: {
      expectedEnvelopeHash: envelope.envelopeHash,
      witnessIdentity: witness,
      sourceReplay: {
        registry,
        adapterId: descriptor.adapterId,
        sourceManifest,
        sourceObjects,
        target,
        horizon,
      },
      relationshipReview,
      trustPolicy,
    },
  };
}

const assertions = () => ({
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
});

function oneUse(compiledTender) {
  const commercialTerm = {
    quoteRefHash: h("quote-reference"),
    currency: "USD",
    amountMinor: "12500",
  };
  const ownerMandate = createOwnerOneUseMandateV1({
    tenderHash: compiledTender.tenderHash,
    scopeHash: compiledTender.exactOutcome.exactOutcomeHash,
    ownerPrincipalRefHash: h("owner-principal"),
    delegationEnvelopeHash: h("owner-delegation"),
    evidencePlanHash: compiledTender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: compiledTender.recoveryRequirements.requirementSetHash,
    commercialTerm,
    issuedAt: "2026-09-02T12:01:00.000Z",
    expiresAt: "2026-09-02T12:30:00.000Z",
    oneUseNonceHash: h("owner-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("owner-signature"),
  });
  const providerAcceptance = createProviderOneUseAcceptanceV1({
    tenderHash: compiledTender.tenderHash,
    scopeHash: compiledTender.exactOutcome.exactOutcomeHash,
    providerRefHash: h("provider"),
    evidencePlanHash: compiledTender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: compiledTender.recoveryRequirements.requirementSetHash,
    commercialTerm,
    acceptedAt: "2026-09-02T12:02:00.000Z",
    expiresAt: "2026-09-02T12:30:00.000Z",
    oneUseNonceHash: h("provider-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("provider-signature"),
  });
  const capacityReservationReceipt
    = createExternalCapacityReservationReceiptBindingV1({
      tenderHash: compiledTender.tenderHash,
      scopeHash: compiledTender.exactOutcome.exactOutcomeHash,
      providerAcceptanceHash: providerAcceptance.providerAcceptanceHash,
      commercialTermHash: providerAcceptance.commercialTerm.commercialTermHash,
      externalSystemRefHash: h("capacity-system"),
      externalReservationRefHash: h("capacity-reservation"),
      externalReceiptArtifactHash: h("capacity-artifact"),
      issuedAt: "2026-09-02T12:03:00.000Z",
      reservedFrom: "2026-09-02T12:03:00.000Z",
      reservedUntil: "2026-09-03T13:00:00.000Z",
      status: "RESERVED",
      signatureRefHash: h("capacity-signature"),
    });
  return { ownerMandate, providerAcceptance, capacityReservationReceipt };
}

test("replays and cross-binds work order, action admission, and Attempt-set records",
  () => {
    const source = fixture();
    const receipt = createOutcomeFormationFoundationReplayV1(source);
    const checked = verifyOutcomeFormationFoundationReplayV1(receipt, {
      source,
      expectedFoundationReplayHash: receipt.foundationReplayHash,
    });

    assert.equal(receipt.schema,
      OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.replay);
    assert.equal(receipt.tenderAssessment.verifierOk, true);
    assert.equal(receipt.autonomousWorkOrderAssessment
      .structuralProjectionRederived, true);
    assert.equal(receipt.autonomousWorkOrderAssessment
      .referencedExternalSourcesReplayed, false);
    assert.equal(receipt.autonomousWorkOrderAssessment
      .promisedOutcomeRefMatchedTender, true);
    assert.equal(receipt.autonomousWorkOrderAssessment
      .acceptanceCriteriaMatchedTender, true);
    assert.equal(receipt.autonomousWorkOrderAssessment
      .observationRequirementsCoveredByTenderEvidence, true);
    assert.equal(receipt.autonomousWorkOrderAssessment
      .remedyReferencesCoveredByTenderRecovery, true);
    assert.equal(receipt.autonomousWorkOrderAssessment
      .fullPromisedOutcomeObservationRecoveryCrossBinding, true);
    assert.equal(receipt.actionAdmissionAssessment.sourceArtifactsRederived,
      true);
    assert.equal(receipt.actionAdmissionAssessment.authorityEstablished, false);
    assert.equal(receipt.actionAdmissionAssessment
      .episodeAttemptCrossBindingEstablished, true);
    assert.equal(receipt.actionAdmissionAssessment
      .claimWayWorldCrossBindingToOrderEstablished, false);
    assert.equal(receipt.actionAdmissionAssessment
      .beforeStateCrossBindingToOrderEstablished, false);
    assert.equal(receipt.actionAdmissionAssessment
      .governanceCrossBindingToOrderEstablished, false);
    assert.equal(receipt.actionAdmissionAssessment
      .fullOrderSemanticBindingEstablished, false);
    assert.equal(receipt.actionAdmissionAssessment.foundationBindingScope,
      "EPISODE_ATTEMPT_ONLY_UNBOUND_ORDER_SEMANTICS");
    assert.equal(receipt.attemptSetAssessment
      .fullTypedGraphEpisodeAttemptCrossBinding, true);
    assert.equal(receipt.attemptSetAssessment
      .censusMatchedVerifiedActionAdmission, true);
    assert.equal(receipt.allCoreFoundationRecordsRederivedAndCrossBound, true);
    assert.equal(receipt.allRequiredFormationFoundationsReplayed, false);
    assert.equal(receipt.foundationBindings.autonomousWorkOrderHash,
      source.autonomousWorkOrder.workOrderHash);
    assert.equal(receipt.foundationBindings.actionAdmissionHash,
      source.actionAdmissionReplay.request.admissionRequestHash);
    assert.equal(receipt.foundationBindings.attemptSetCompositionHash,
      source.attemptSetReplay.composition.compositionHash);
    for (const field of ["networkOutcomeWitnessHash", "realityObligationHash",
      "recoveryCapacityReservationHash", "rightsPrivacyDecisionHash",
      "riskCapitalReservationHash", "custodyAuthorityHash",
      "adjudicationAuthorityHash", "externalTrustPolicyHash"]) {
      assert.equal(receipt.foundationBindings[field], null);
    }
    assert.ok(receipt.gapCodes.includes(
      "NETWORK_OUTCOME_WITNESS_REPLAY_NOT_SUPPLIED"));
    assert.ok(receipt.gapCodes.includes(
      "ACTION_ADMISSION_FULL_ORDER_SEMANTIC_BINDING_UNPROVEN"));
    assert.equal(receipt.decisionState, "HOLD");
    assert.equal(receipt.authority, "NONE");
    assert.equal(receipt.actionReady, false);
    assert.equal(receipt.executable, false);
    assert.equal(receipt.consequenceReach, "NONE");
    assert.deepEqual(receipt.boundary,
      OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY);
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceRecordsReplayed, true);
    assert.equal(checked.callerFoundationHashesUnableToMintBindings, true);
    assert.ok(Object.isFrozen(receipt));
    assert.ok(Object.isFrozen(receipt.foundationBindings));
  });

test("a replayed but cross-tender Action/Attempt splice cannot enter a binding slot",
  () => {
    const mismatchedAction = actionSource({
      episodeHash: h("episode"),
      attemptHash: h("different-attempt"),
      censusHash: h("prospective-census"),
    });
    const source = fixture(mismatchedAction);
    const receipt = createOutcomeFormationFoundationReplayV1(source);

    assert.equal(receipt.actionAdmissionAssessment.verifierOk, true);
    assert.equal(receipt.actionAdmissionAssessment.attemptHashMatchedTender,
      false);
    assert.equal(receipt.actionAdmissionAssessment.foundationBindingAdmitted,
      false);
    assert.equal(receipt.foundationBindings.actionAdmissionHash, null);
    assert.equal(receipt.foundationBindings.attemptSetCompositionHash, null);
    assert.ok(receipt.gapCodes.includes(
      "ACTION_ADMISSION_TENDER_EPISODE_ATTEMPT_CROSS_BINDING_FAILED"));
    assert.equal(receipt.decisionState, "HOLD");
    assert.equal(receipt.actionReady, false);
  });

test("outcome A cannot reuse work-order B even with the same graph and hash pin",
  () => {
    const orderB = workOrder();
    const outcomeATender = tender(orderB, {
      outcomeSpecRefHash: h("different-outcome-a"),
    });
    const action = actionSource();
    const request = requestActionAdmission(action);
    const composition = attemptSet(orderB, action.bindings.run.censusHash);
    const source = {
      expectedTenderHash: outcomeATender.tenderHash,
      tender: outcomeATender,
      autonomousWorkOrder: orderB,
      actionAdmissionReplay: { request, source: action },
      attemptSetReplay: { composition, predecessor: null },
      networkOutcomeWitnessReplay: null,
      actionObligationHoldCompositionInput: null,
    };
    const receipt = createOutcomeFormationFoundationReplayV1(source);
    const assessment = receipt.autonomousWorkOrderAssessment;

    assert.equal(assessment.verifierOk, true);
    assert.equal(assessment.exactWorkOrderHashMatchedTender, true);
    assert.equal(assessment.exactTypedGraphMatchedTender, true);
    assert.equal(assessment.promisedOutcomeRefMatchedTender, false);
    assert.equal(assessment.acceptanceCriteriaMatchedTender, true);
    assert.equal(assessment
      .fullPromisedOutcomeObservationRecoveryCrossBinding, false);
    assert.equal(assessment.foundationBindingAdmitted, false);
    assert.equal(receipt.foundationBindings.autonomousWorkOrderHash, null);
    assert.equal(receipt.foundationBindings.attemptSetCompositionHash, null);
    assert.ok(receipt.gapCodes.includes(
      "AUTONOMOUS_WORK_ORDER_OUTCOME_OBSERVATION_RECOVERY_TENDER_CROSS_BINDING_FAILED"));
    assert.equal(receipt.decisionState, "HOLD");
    assert.equal(receipt.authority, "NONE");
  });

test("naked hashes and rehashed nested authority claims cannot bypass source replay",
  () => {
    const source = fixture();
    assert.throws(() => createOutcomeFormationFoundationReplayV1({
      ...source,
      foundationBindings: {
        autonomousWorkOrderHash: source.autonomousWorkOrder.workOrderHash,
      },
    }), /REPLAY_INPUT_FIELDS_INVALID/u);

    const receipt = createOutcomeFormationFoundationReplayV1(source);
    const forged = mutable(receipt);
    forged.actionAdmissionAssessment.authorityEstablished = true;
    delete forged.foundationReplayHash;
    forged.foundationReplayHash = `sha256:${createHash("sha256").update(
      `${OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.replay}\0${
        canonicalizeStrict(forged)}`, "utf8").digest("hex")}`;
    const checked = verifyOutcomeFormationFoundationReplayV1(forged, {
      source,
      expectedFoundationReplayHash: forged.foundationReplayHash,
    });
    assert.equal(checked.ok, false);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
  });

test("an exact byte-replayed witness populates only a HOLD witness-reference slot",
  () => {
    const witnessReplay = witnessReplayFixture();
    const source = {
      ...fixture(),
      networkOutcomeWitnessReplay: witnessReplay,
    };
    const receipt = createOutcomeFormationFoundationReplayV1(source);
    const assessment = receipt.networkOutcomeWitnessAssessment;

    assert.equal(assessment.verifierInvoked, true);
    assert.equal(assessment.verifierOk, true);
    assert.equal(assessment.sourceByteReplayComplete, true);
    assert.equal(assessment.secondTypedActorIdentityReplayed, true);
    assert.equal(assessment.independencePolicyVerifiedWithinScope, true);
    assert.equal(assessment.organizationalIndependenceEstablished, false);
    assert.equal(assessment.independentOutcomeTruthEstablished, false);
    assert.equal(assessment.claimWayWorldMatchedVerifiedActionAdmission, true);
    assert.equal(assessment.episodeMatchedTender, true);
    assert.equal(assessment.attemptMatchedTender, true);
    assert.equal(assessment.foundationBindingAdmitted, true);
    assert.equal(receipt.foundationBindings.networkOutcomeWitnessHash,
      witnessReplay.envelope.envelopeHash);
    assert.ok(receipt.gapCodes.includes(
      "INDEPENDENT_WITNESS_STANDING_AND_OUTCOME_TRUTH_UNPROVEN"));
    assert.equal(receipt.decisionState, "HOLD");
    assert.equal(receipt.authority, "NONE");
    assert.equal(receipt.actionReady, false);

    const checked = verifyOutcomeFormationFoundationReplayV1(receipt, {
      source,
      expectedFoundationReplayHash: receipt.foundationReplayHash,
    });
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceRecordsReplayed, true);
  });

test("a byte-valid witness for another Attempt is rejected as a cross-order splice",
  () => {
    const source = {
      ...fixture(),
      networkOutcomeWitnessReplay:
        witnessReplayFixture(h("different-attempt")),
    };
    const receipt = createOutcomeFormationFoundationReplayV1(source);

    assert.equal(receipt.networkOutcomeWitnessAssessment.verifierOk, true,
      "the foreign witness remains valid against its own exact context");
    assert.equal(receipt.networkOutcomeWitnessAssessment.attemptMatchedTender,
      false);
    assert.equal(receipt.networkOutcomeWitnessAssessment
      .foundationBindingAdmitted, false);
    assert.equal(receipt.foundationBindings.networkOutcomeWitnessHash, null);
    assert.ok(receipt.gapCodes.includes(
      "NETWORK_OUTCOME_WITNESS_ACTION_TENDER_CROSS_BINDING_FAILED"));
    assert.equal(receipt.authority, "NONE");
    assert.equal(receipt.actionReady, false);
  });

test("rehashing cannot turn a valid witness reference into independent outcome truth",
  () => {
    const source = {
      ...fixture(),
      networkOutcomeWitnessReplay: witnessReplayFixture(),
    };
    const receipt = createOutcomeFormationFoundationReplayV1(source);
    const forged = mutable(receipt);
    forged.networkOutcomeWitnessAssessment
      .organizationalIndependenceEstablished = true;
    forged.networkOutcomeWitnessAssessment.independentOutcomeTruthEstablished
      = true;
    delete forged.foundationReplayHash;
    forged.foundationReplayHash = `sha256:${createHash("sha256").update(
      `${OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.replay}\0${
        canonicalizeStrict(forged)}`, "utf8").digest("hex")}`;

    const checked = verifyOutcomeFormationFoundationReplayV1(forged, {
      source,
      expectedFoundationReplayHash: forged.foundationReplayHash,
    });
    assert.equal(checked.ok, false);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
  });

test("action-obligation replay is blocked before the unsafe source reader can run",
  (t) => {
    const { source, snapshot } = obligationFixture(t, "reference-integrity");
    source.actionObligationHoldCompositionInput = {
      ...source.actionObligationHoldCompositionInput,
      obligationDirectory: path.join(tmpdir(),
        "outsider-formation-bridge-path-must-not-be-read"),
    };
    const receipt = createOutcomeFormationFoundationReplayV1(source);
    const assessment = receipt.actionObligationAssessment;

    assert.equal(assessment.verifierInvoked, false);
    assert.equal(assessment.unsafeUnderlyingReaderBlocked, true);
    assert.equal(assessment.verifierReturnedOk, false,
      "the existing verifier intentionally has no ok:true semantic path");
    assert.equal(assessment.referenceIntegrityVerified, false);
    assert.equal(assessment.structuralCompositionVerified, false);
    assert.equal(assessment.semanticObligationVerificationEstablished, false);
    assert.equal(assessment.obligationLedgerSourceReplayComplete, false);
    assert.equal(assessment.admissionReplayMatchedCoreAction, false);
    assert.equal(assessment.censusMatchedVerifiedAttemptSetAndAction, false);
    assert.equal(assessment.obligationGenesisMatchedVerifiedWorkOrder, false);
    assert.equal(assessment.obligationStateMatchedVerifiedWorkOrder, false);
    assert.equal(assessment.affectedPartyRootSourceReplayed, false);
    assert.equal(assessment.responsibilityGraphSourceReplayed, false);
    assert.equal(assessment.consequenceEnvelopeSourceProjectedFromEffect, false);
    assert.equal(assessment.foundationBindingAdmitted, false);
    assert.equal(receipt.foundationBindings.realityObligationHash, null);
    assert.ok(receipt.gapCodes.includes(
      "ACTION_OBLIGATION_REPLAY_DISABLED_UNSAFE_SOURCE_READER"));
    assert.equal(JSON.stringify(receipt).includes(
      "outsider-formation-bridge-path-must-not-be-read"), false);
    assert.notEqual(snapshot.stateHash, null);
    assert.equal(receipt.authority, "NONE");
    assert.equal(receipt.actionReady, false);

    const checked = verifyOutcomeFormationFoundationReplayV1(receipt, {
      source,
      expectedFoundationReplayHash: receipt.foundationReplayHash,
    });
    assert.equal(checked.ok, true);
    assert.equal(checked.holdBoundaryVerified, true);
  });

test("foreign action-obligation input is blocked without reading either order", (t) => {
  const first = obligationFixture(t, "order-a");
  const second = obligationFixture(t, "order-b");
  const splicedSource = {
    ...first.source,
    actionObligationHoldCompositionInput:
      second.source.actionObligationHoldCompositionInput,
  };
  const receipt = createOutcomeFormationFoundationReplayV1(splicedSource);

  assert.equal(receipt.actionObligationAssessment.referenceIntegrityVerified,
    false);
  assert.equal(receipt.actionObligationAssessment.verifierInvoked, false);
  assert.equal(receipt.actionObligationAssessment.unsafeUnderlyingReaderBlocked,
    true);
  assert.equal(receipt.actionObligationAssessment
    .admissionReplayMatchedCoreAction, false);
  assert.equal(receipt.actionObligationAssessment.foundationBindingAdmitted,
    false);
  assert.equal(receipt.foundationBindings.realityObligationHash, null);
  assert.ok(receipt.gapCodes.includes(
    "ACTION_OBLIGATION_REPLAY_DISABLED_UNSAFE_SOURCE_READER"));
  assert.equal(receipt.decisionState, "HOLD");
  assert.equal(receipt.authority, "NONE");
});

test("rehashing cannot promote obligation reference integrity into semantics or authority",
  (t) => {
    const { source } = obligationFixture(t, "rehashed-poisoning");
    const receipt = createOutcomeFormationFoundationReplayV1(source);
    const forged = mutable(receipt);
    forged.actionObligationAssessment.semanticObligationVerificationEstablished
      = true;
    forged.actionObligationAssessment.authorityEstablished = true;
    delete forged.foundationReplayHash;
    forged.foundationReplayHash = `sha256:${createHash("sha256").update(
      `${OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.replay}\0${
        canonicalizeStrict(forged)}`, "utf8").digest("hex")}`;

    const checked = verifyOutcomeFormationFoundationReplayV1(forged, {
      source,
      expectedFoundationReplayHash: forged.foundationReplayHash,
    });
    assert.equal(checked.ok, false);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
    assert.equal(checked.executable, false);
  });

test("high-level helper carries the witness reference while blocking obligation I/O",
  (t) => {
    const obligation = obligationFixture(t, "bound-helper");
    const witnessReplay = witnessReplayFixture();
    const replaySource = {
      ...obligation.source,
      networkOutcomeWitnessReplay: witnessReplay,
    };
    const commitments = oneUse(replaySource.tender);
    const source = {
      formationId: id("formation", "witness-obligation-bound"),
      evaluatedAt: "2026-09-02T12:05:00.000Z",
      expectedTenderHash: replaySource.expectedTenderHash,
      tender: replaySource.tender,
      ownerMandate: commitments.ownerMandate,
      providerAcceptance: commitments.providerAcceptance,
      capacityReservationReceipt: commitments.capacityReservationReceipt,
      consumedNonceHashes: [],
      untrustedCallerAssertions: assertions(),
      autonomousWorkOrder: replaySource.autonomousWorkOrder,
      actionAdmissionReplay: replaySource.actionAdmissionReplay,
      attemptSetReplay: replaySource.attemptSetReplay,
      networkOutcomeWitnessReplay: replaySource.networkOutcomeWitnessReplay,
      actionObligationHoldCompositionInput:
        replaySource.actionObligationHoldCompositionInput,
    };
    const value = createOutcomeFormationFoundationBoundEvaluationV1(source);

    assert.equal(value.formationEvaluation.foundationBindings
      .networkOutcomeWitnessHash, witnessReplay.envelope.envelopeHash);
    assert.equal(value.formationEvaluation.foundationBindings
      .realityObligationHash, null);
    assert.equal(value.formationEvaluation.foundationCoverage
      .networkOutcomeWitnessReferenceSlotPresent, true);
    assert.equal(value.formationEvaluation.foundationCoverage
      .realityObligationReferencePresent, false);
    assert.equal(value.formationEvaluation.foundationCoverage
      .recoveryCapacityReferencePresent, false);
    assert.equal(value.formationEvaluation.strongestStateReached, false);
    assert.equal(value.foundationReplay.networkOutcomeWitnessAssessment
      .independentOutcomeTruthEstablished, false);
    assert.equal(value.foundationReplay.actionObligationAssessment
      .semanticObligationVerificationEstablished, false);
    assert.equal(value.foundationReplay.actionObligationAssessment
      .unsafeUnderlyingReaderBlocked, true);
    assert.equal(value.decisionState, "HOLD");
    assert.equal(value.authority, "NONE");
    assert.equal(value.actionReady, false);
    assert.equal(value.price, null);
    assert.equal(value.guarantee, null);
    assert.equal(value.settlement, null);
  });

test("high-level helper gives the engine only replay-derived bindings and stays HOLD",
  () => {
    const replay = fixture();
    const commitments = oneUse(replay.tender);
    const source = {
      formationId: id("formation", "foundation-bound"),
      evaluatedAt: "2026-09-02T12:05:00.000Z",
      expectedTenderHash: replay.expectedTenderHash,
      tender: replay.tender,
      ownerMandate: commitments.ownerMandate,
      providerAcceptance: commitments.providerAcceptance,
      capacityReservationReceipt: commitments.capacityReservationReceipt,
      consumedNonceHashes: [],
      untrustedCallerAssertions: assertions(),
      autonomousWorkOrder: replay.autonomousWorkOrder,
      actionAdmissionReplay: replay.actionAdmissionReplay,
      attemptSetReplay: replay.attemptSetReplay,
      networkOutcomeWitnessReplay: replay.networkOutcomeWitnessReplay,
      actionObligationHoldCompositionInput:
        replay.actionObligationHoldCompositionInput,
    };
    const value = createOutcomeFormationFoundationBoundEvaluationV1(source);
    const checked = verifyOutcomeFormationFoundationBoundEvaluationV1(value, {
      source,
      expectedFoundationBoundEvaluationHash:
        value.foundationBoundEvaluationHash,
    });

    assert.deepEqual(value.formationEvaluation.foundationBindings,
      value.foundationReplay.foundationBindings);
    assert.equal(value.formationEvaluation.foundationCoverage
      .evidencePathReferenceSlotsPresent, true);
    assert.equal(value.formationEvaluation.foundationCoverage
      .networkOutcomeWitnessReferenceSlotPresent, false);
    assert.equal(value.formationEvaluation.strongestStateReached, false);
    assert.equal(value.allRequiredFormationFoundationsReplayed, false);
    assert.equal(value.externalTrustStillRequired, true);
    assert.equal(value.decisionState, "HOLD");
    assert.equal(value.authority, "NONE");
    assert.equal(value.actionReady, false);
    assert.equal(value.executable, false);
    assert.equal(value.consequenceReach, "NONE");
    assert.equal(value.price, null);
    assert.equal(value.guarantee, null);
    assert.equal(value.settlement, null);
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceRecordsReplayed, true);
    assert.equal(checked.engineEvaluationRederived, true);
    assert.equal(checked.holdBoundaryVerified, true);
  });
