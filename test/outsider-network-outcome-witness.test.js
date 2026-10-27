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
import {
  OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES,
  OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS,
  OutsiderOutcomeWitnessAdapterRegistry,
  createOutsiderOutcomeWitnessAdapterDescriptor,
  createOutsiderOutcomeWitnessEnvelope,
  createOutsiderOutcomeWitnessSourceManifest,
  verifyOutsiderOutcomeWitnessEnvelope,
  verifyOutsiderOutcomeWitnessRelationshipReview,
} from "../src/outsider-network-outcome-witness.js";

function h(label) {
  return `sha256:${createHash("sha256").update(`witness:${label}`).digest("hex")}`;
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

function keyEpoch(key, validFrom = "2026-08-27T00:00:00.000Z",
  validUntil = "2026-08-30T00:00:00.000Z") {
  return { keyId: keyId(key.publicKey), publicKeyPem: key.publicKey,
    validFrom, validUntil };
}

function assurance(prefix, label, assuranceClass = "SOURCE_REPLAYED_REFERENCE") {
  return assuranceClass === "NONE" ? { class: "NONE", evidenceRefHash: null } : {
    class: assuranceClass,
    evidenceRefHash: h(`${prefix}:assurance:${label}`),
  };
}

function normalizedAssurance(value) {
  return { class: value.class, evidenceRefHash: value.evidenceRefHash,
    effectiveAssurance: "UNVERIFIED_REFERENCE_ONLY", externallyEstablished: false };
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

function identityInput(prefix, common) {
  const modelRefHash = h(`${prefix}:model-ref`);
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
    modelArtifactRefHashes: [modelRefHash],
    dataRootHashes: [h(`${prefix}:data-root`)],
    toolchainRootHashes: [h(`${prefix}:toolchain-root`)],
    assurance: assurance(prefix, "deployment-revision"),
  };
  return {
    bindings: {
      claimWayWorld: { claimHash: common.claimHash, wayHash: common.wayHash,
        worldHash: common.worldHash },
      run: { episodeHash: common.episodeHash, attemptHash: common.attemptHash,
        censusHash: common.censusHash, observedAt: "2026-08-28T00:00:00.000Z" },
    },
    principalEpoch: {
      principalRefHash: h(`${prefix}:principal`),
      epochRefHash: h(`${prefix}:principal-epoch`),
      trustDomainRefHash: h(`${prefix}:trust-domain`),
      controllerKeyRefHash: h(`${prefix}:controller-key`),
      credentialRefHash: h(`${prefix}:credential`),
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-30T00:00:00.000Z",
      assurance: assurance(prefix, "principal", "LEGAL_BINDING_REFERENCE"),
    },
    deploymentLineage,
    deploymentRevision,
    modelArtifacts: [{
      modelArtifactRefHash: modelRefHash,
      providerRevisionRefHash: h(`${prefix}:provider-model-revision`),
      artifactRootHash: h(`${prefix}:model-artifact-root`),
      baseModelRefHash: h(`${prefix}:base-model`),
      tokenizerRootHash: h(`${prefix}:tokenizer`),
      quantizationRootHash: h(`${prefix}:quantization`),
      fineTuneState: "PROVENANCE_REFERENCE_PRESENT",
      fineTuneProvenanceRefHash: h(`${prefix}:fine-tune-provenance`),
      assurance: assurance(prefix, "model"),
    }],
    modelRoute: {
      transparency: "EXACT_ARTIFACT_BOUND",
      routePolicyHash: h(`${prefix}:route-policy`),
      selectedModelArtifactRefHashes: [modelRefHash],
      routeEvidenceRefHash: h(`${prefix}:route-evidence`),
      assurance: assurance(prefix, "route", "OPERATOR_SIGNED_REFERENCE"),
    },
    runtimeInstance: {
      runtimeInstanceRefHash: h(`${prefix}:runtime-instance`),
      instanceKeyRefHash: h(`${prefix}:runtime-instance-key`),
      bootEpochRefHash: h(`${prefix}:boot-epoch`),
      loadedWayHash: common.wayHash,
      loadedDeploymentRevisionHash:
        deploymentRevisionHash(deploymentRevision, deploymentLineage),
      workloadAttestationRefHash: h(`${prefix}:workload-attestation`),
      memoryStateMode: "BOUND",
      memoryStateCommitmentHash: h(`${prefix}:memory-state`),
      validFrom: "2026-08-27T12:00:00.000Z",
      validUntil: "2026-08-29T00:00:00.000Z",
      assurance: assurance(prefix, "runtime", "WORKLOAD_ATTESTATION_REFERENCE"),
    },
    embodimentRevision: null,
    delegationEdges: [],
    lifecycleEdges: [],
  };
}

function identity(prefix, common) {
  const source = createActorIdentityEnvelopeSource(identityInput(prefix, common));
  return { source, envelope: buildActorIdentityEnvelope(source) };
}

function projection(identityRecord) {
  const envelope = identityRecord.envelope;
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

function correlationRoots(identityRecord) {
  return Object.values(projection(identityRecord)).sort();
}

function relationshipReview(body, signer) {
  const reviewHash = digest(OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview,
    body);
  return { ...body, reviewHash, signature: { algorithm: "Ed25519",
    keyId: keyId(signer.publicKey),
    value: cryptoSign(null, Buffer.from(reviewHash), signer.privateKey).toString("base64") } };
}

function trustPolicy(body) {
  return { ...body, policyHash: digest(
    OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy, body) };
}

function fixture({ observationStatus = "OBSERVED" } = {}) {
  const common = { claimHash: h("claim"), wayHash: h("way"), worldHash: h("world"),
    episodeHash: h("episode"), attemptHash: h("attempt"), censusHash: h("census") };
  const actor = identity("actor", common);
  const witness = identity("witness", common);
  const witnessSigning = pair();
  const relationshipSigning = pair();
  const actorRoots = correlationRoots(actor);
  const witnessRoots = correlationRoots(witness);
  const target = { claimHash: common.claimHash, wayHash: common.wayHash,
    worldHash: common.worldHash, episodeHash: common.episodeHash,
    attemptHash: common.attemptHash, executionEvidenceHash: h("execution-evidence") };
  const horizon = { horizonId: "delayed",
    obligationHorizonCommitmentHash: h("obligation-horizon"),
    affectedPartyHorizonBindingHash: h("affected-party-horizon") };
  const observed = observationStatus === "OBSERVED";
  const observation = {
    role: "RESOURCE_OWNER_READBACK",
    observationStatus,
    observedAt: "2026-08-28T00:05:00.000Z",
    normalizedObservationHash: h("normalized-observation"),
    consequenceReportHash: observed ? h("consequence-report") : null,
    affectedPartyReportSetHash: observed ? h("affected-party-report-set") : null,
    recoveryEvidenceSetHash: observed ? h("recovery-evidence-set") : null,
  };
  const sourceObjects = [{ objectId: "owner-readback", immutableVersion: "rev-17",
    bytes: Buffer.from(JSON.stringify(observation), "utf8") }];
  const sourceManifest = createOutsiderOutcomeWitnessSourceManifest({
    sourceId: "owner-instrument-feed",
    sourceClass: "RESOURCE_OWNER_READBACK",
    objects: sourceObjects,
    rightsReviewHash: h("rights-review"),
    privacyReviewHash: h("privacy-review"),
    retentionDays: 30,
  });
  const descriptor = createOutsiderOutcomeWitnessAdapterDescriptor({
    adapterId:
      OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS.JSON_OBSERVATION_V1,
    adapterVersion: "1.0.0",
    sourceClass: sourceManifest.sourceClass,
    sourceSchema: { mediaType: "application/json", record: "outcome-observation-v1" },
    instrumentHash: h("owner-instrument"),
  });
  const registry = new OutsiderOutcomeWitnessAdapterRegistry();
  registry.register({ descriptor,
    sourceSchema: { mediaType: "application/json", record: "outcome-observation-v1" } });
  const replayReceipt = registry.replay({ adapterId: descriptor.adapterId,
    sourceManifest, sourceObjects, target, horizon, witnessIdentity: witness });
  const reviewBody = {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview,
    schemaVersion: "1.0.0",
    registryId: "relationship-registry-a",
    reviewId: "actor-witness-review-0001",
    actor: { identityEnvelopeHash: actor.envelope.actorIdentityEnvelopeHash,
      subjectHash: actor.envelope.actorSubjectHash, correlationRootHashes: actorRoots },
    witness: { identityEnvelopeHash: witness.envelope.actorIdentityEnvelopeHash,
      subjectHash: witness.envelope.actorSubjectHash,
      correlationRootHashes: witnessRoots },
    relationshipClassesReviewed:
      [...OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES].sort(),
    relationshipEvidenceSetHash: h("relationship-evidence-set"),
    finding: "NO_KNOWN_SHARED_CONTROL_WITHIN_DECLARED_SCOPE",
    issuedAt: "2026-08-28T00:04:00.000Z",
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
    issuerOrganizationHash: h("relationship-review-issuer"),
  };
  const review = relationshipReview(reviewBody, relationshipSigning);
  const policyBody = {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy,
    expectedWitnessRegistryId: "witness-registry-a",
    expectedRelationshipRegistryId: review.registryId,
    expectedActorIdentityEnvelopeHash: actor.envelope.actorIdentityEnvelopeHash,
    expectedActorSubjectHash: actor.envelope.actorSubjectHash,
    expectedActorCorrelationRootSetHash: digest(
      "outsider/outcome-witness-correlation-root-set/v1", actorRoots),
    expectedWitnessIdentityEnvelopeHash: witness.envelope.actorIdentityEnvelopeHash,
    expectedWitnessActorSubjectHash: witness.envelope.actorSubjectHash,
    expectedWitnessPrincipalEpochProjectionHash:
      witness.envelope.principalEpochProjectionHash,
    expectedWitnessCorrelationRootSetHash: digest(
      "outsider/outcome-witness-correlation-root-set/v1", witnessRoots),
    expectedRelationshipReviewHash: review.reviewHash,
    witnessSigningKeyEpochs: [keyEpoch(witnessSigning)],
    relationshipReviewIssuer: { organizationHash: review.issuerOrganizationHash,
      keyEpochs: [keyEpoch(relationshipSigning)] },
    requiredRelationshipClasses:
      [...OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES].sort(),
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
  };
  const policy = trustPolicy(policyBody);
  const envelope = createOutsiderOutcomeWitnessEnvelope({ replayReceipt,
    witnessIdentity: witness, relationshipReviewHash: review.reviewHash,
    witnessRegistryId: policy.expectedWitnessRegistryId,
    signedAt: "2026-08-28T00:06:00.000Z" },
  { witnessPrivateKeyPem: witnessSigning.privateKey });
  const context = { expectedEnvelopeHash: envelope.envelopeHash,
    witnessIdentity: witness,
    sourceReplay: { registry, adapterId: descriptor.adapterId, sourceManifest,
      sourceObjects, target, horizon }, relationshipReview: review, trustPolicy: policy };
  return { common, actor, witness, witnessSigning, relationshipSigning, target, horizon,
    observation, sourceObjects, sourceManifest, descriptor, registry, replayReceipt,
    reviewBody, review, policyBody, policy, envelope, context };
}

test("exact source bytes, pinned adapter, second identity and external review replay HOLD-only",
  () => {
    const f = fixture();
    const checked = verifyOutsiderOutcomeWitnessEnvelope(f.envelope, f.context);
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.sourceByteReplayComplete, true);
    assert.equal(checked.adapterProjectionSpecificationAndSchemaReplayed, true);
    assert.equal(checked.adapterImplementationOrCodeClosureReplayed, false);
    assert.equal(f.descriptor.adapterProjectionSpecificationReplayed, true);
    assert.equal(f.descriptor.adapterImplementationOrCodeClosureReplayed, false);
    assert.equal("implementationHash" in f.descriptor, false);
    assert.equal(f.descriptor.projectionSpecification.outputProjection.observation,
      "SOURCE_OBJECT_0_JSON_ROOT");
    assert.equal(checked.secondTypedActorIdentityReplayed, true);
    assert.equal(checked.independencePolicyVerifiedWithinScope, true);
    assert.equal(checked.organizationalIndependenceEstablished, false);
    assert.equal(checked.independentOutcomeTruthEstablished, false);
    assert.equal(checked.causalAttributionEstablished, false);
    assert.equal(checked.obligationClosed, false);
    assert.equal(checked.status, "HOLD");
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.trainingRows, 0);
    assert.equal(checked.causalExperienceUnits, 0);
    assert.deepEqual(checked.boundary, OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY);
    assert.equal("bytes" in f.sourceManifest.objects[0], false);
    assert.equal("bytes" in f.replayReceipt, false);
    assert.equal(JSON.stringify(f.envelope).includes("owner-readback"), false);
  });

test("replaced raw source bytes fail even if an attacker self-reseals downstream hashes", () => {
  const f = fixture();
  const replaced = [{ objectId: "owner-readback", immutableVersion: "rev-17",
    bytes: Buffer.from(JSON.stringify({ ...f.observation,
      normalizedObservationHash: h("attacker-observation") })) }];
  const changedContext = { ...f.context,
    sourceReplay: { ...f.context.sourceReplay, sourceObjects: replaced } };
  const checked = verifyOutsiderOutcomeWitnessEnvelope(f.envelope, changedContext);
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_MANIFEST_BYTE_REPLAY_INVALID/u);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.trainingRows, 0);
});

test("relationship self-sign, key epoch splice, issuer splice and root collisions fail", () => {
  const f = fixture();
  const selfReview = relationshipReview(f.reviewBody, f.witnessSigning);
  const selfPolicy = trustPolicy({ ...f.policyBody,
    expectedRelationshipReviewHash: selfReview.reviewHash,
    relationshipReviewIssuer: { organizationHash: selfReview.issuerOrganizationHash,
      keyEpochs: [keyEpoch(f.witnessSigning)] } });
  assert.equal(verifyOutsiderOutcomeWitnessRelationshipReview(selfReview, {
    trustPolicy: selfPolicy, at: f.observation.observedAt,
  }).ok, false);

  const wrongIssuer = pair();
  const epochSplice = structuredClone(f.policy);
  epochSplice.relationshipReviewIssuer.keyEpochs = [keyEpoch(wrongIssuer)];
  const { policyHash: ignoredPolicyHash, ...epochSpliceBody } = epochSplice;
  epochSplice.policyHash = digest(OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy,
    epochSpliceBody);
  assert.equal(verifyOutsiderOutcomeWitnessRelationshipReview(f.review, {
    trustPolicy: epochSplice, at: f.observation.observedAt,
  }).ok, false);

  const issuerSplice = structuredClone(f.policy);
  issuerSplice.relationshipReviewIssuer.organizationHash = h("spliced-issuer");
  const { policyHash: ignoredIssuerHash, ...issuerSpliceBody } = issuerSplice;
  issuerSplice.policyHash = digest(OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy,
    issuerSpliceBody);
  assert.equal(verifyOutsiderOutcomeWitnessRelationshipReview(f.review, {
    trustPolicy: issuerSplice, at: f.observation.observedAt,
  }).ok, false);

  const collidedBody = structuredClone(f.reviewBody);
  collidedBody.witness.correlationRootHashes[0]
    = collidedBody.actor.correlationRootHashes[0];
  collidedBody.witness.correlationRootHashes.sort();
  const collided = relationshipReview(collidedBody, f.relationshipSigning);
  const collisionPolicy = trustPolicy({ ...f.policyBody,
    expectedWitnessCorrelationRootSetHash: digest(
      "outsider/outcome-witness-correlation-root-set/v1",
      collidedBody.witness.correlationRootHashes),
    expectedRelationshipReviewHash: collided.reviewHash });
  assert.equal(verifyOutsiderOutcomeWitnessRelationshipReview(collided, {
    trustPolicy: collisionPolicy, at: f.observation.observedAt,
  }).ok, false);
});

test("unobserved statuses stay evidence-null and never become path-complete truth", () => {
  for (const observationStatus of ["CENSORED", "MISSING", "REFUSED", "UNAVAILABLE"]) {
    const f = fixture({ observationStatus });
    const checked = verifyOutsiderOutcomeWitnessEnvelope(f.envelope, f.context);
    assert.equal(checked.ok, true, checked.error);
    assert.equal(f.envelope.observation.consequenceReportHash, null);
    assert.equal(checked.independentOutcomeTruthEstablished, false);
    assert.equal(checked.status, "HOLD");
  }
});

test("declarative projection rejects same-source different-closure functions", () => {
  const f = fixture();
  const alteredDescriptor = structuredClone(f.descriptor);
  alteredDescriptor.instrumentHash = h("another-instrument");
  const registry = new OutsiderOutcomeWitnessAdapterRegistry();
  assert.throws(() => registry.register({ descriptor: alteredDescriptor,
    sourceSchema: { mediaType: "application/json", record: "outcome-observation-v1" } }),
  /ADAPTER_DESCRIPTOR_REPLAY_INVALID/u);

  function closureAdapterFactory(normalizedObservationHash) {
    return ({ objects, target, horizon, outputContract }) => ({
      schema: outputContract.schema,
      target,
      horizon,
      observation: { ...JSON.parse(objects[0].bytes.toString("utf8")),
        normalizedObservationHash },
    });
  }
  const closureA = closureAdapterFactory(h("closure-output-a"));
  const closureB = closureAdapterFactory(h("closure-output-b"));
  assert.equal(Function.prototype.toString.call(closureA),
    Function.prototype.toString.call(closureB));
  const sample = { objects: f.sourceObjects, target: f.target, horizon: f.horizon,
    outputContract: { schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.adapterOutput } };
  assert.notEqual(closureA(sample).observation.normalizedObservationHash,
    closureB(sample).observation.normalizedObservationHash,
    "identical function source can hide different closure state");
  const descriptorInput = {
    adapterId:
      OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS.JSON_OBSERVATION_V1,
    adapterVersion: "1.0.0",
    sourceClass: f.sourceManifest.sourceClass,
    sourceSchema: { mediaType: "application/json", record: "outcome-observation-v1" },
    instrumentHash: h("owner-instrument"),
  };
  assert.throws(() => createOutsiderOutcomeWitnessAdapterDescriptor({
    ...descriptorInput, adapter: closureA,
  }), /ADAPTER_DESCRIPTOR_INPUT_FIELDS_INVALID/u);
  assert.throws(() => createOutsiderOutcomeWitnessAdapterDescriptor({
    ...descriptorInput, adapter: closureB,
  }), /ADAPTER_DESCRIPTOR_INPUT_FIELDS_INVALID/u);
  assert.throws(() => registry.register({ descriptor: f.descriptor,
    sourceSchema: descriptorInput.sourceSchema, adapter: closureA,
  }), /REGISTER_INPUT_FIELDS_INVALID/u);
});

test("source bytes reject proxy and accessor traps before byte predicates or copy", () => {
  const f = fixture();
  let traps = 0;
  const sourceProxy = new Proxy(f.sourceObjects[0], {});
  assert.throws(() => f.registry.replay({ adapterId: f.descriptor.adapterId,
    sourceManifest: f.sourceManifest, sourceObjects: [sourceProxy],
    target: f.target, horizon: f.horizon, witnessIdentity: f.witness }),
  /PROXY_FORBIDDEN|SOURCE_OBJECT_INPUT_OBJECT_INVALID/u);

  const bytesProxy = new Proxy(Buffer.from(f.sourceObjects[0].bytes), {
    get() { traps += 1; throw new Error("bytes get trap entered"); },
    getPrototypeOf() { traps += 1; throw new Error("bytes prototype trap entered"); },
    ownKeys() { traps += 1; throw new Error("bytes keys trap entered"); },
    getOwnPropertyDescriptor() {
      traps += 1;
      throw new Error("bytes descriptor trap entered");
    },
  });
  assert.throws(() => createOutsiderOutcomeWitnessSourceManifest({
    sourceId: "trap-source", sourceClass: "RESOURCE_OWNER_READBACK",
    objects: [{ objectId: "trap-object", immutableVersion: "rev-1",
      bytes: bytesProxy }],
    rightsReviewHash: h("trap-rights"), privacyReviewHash: h("trap-privacy"),
    retentionDays: 1,
  }), /SOURCE_OBJECT_BYTES_PROXY_FORBIDDEN/u);

  const accessorObject = { objectId: "accessor-object", immutableVersion: "rev-1" };
  Object.defineProperty(accessorObject, "bytes", { enumerable: true,
    get() { traps += 1; throw new Error("bytes getter entered"); } });
  assert.throws(() => createOutsiderOutcomeWitnessSourceManifest({
    sourceId: "accessor-source", sourceClass: "RESOURCE_OWNER_READBACK",
    objects: [accessorObject], rightsReviewHash: h("accessor-rights"),
    privacyReviewHash: h("accessor-privacy"), retentionDays: 1,
  }), /SOURCE_OBJECT_INPUT_FIELDS_INVALID/u);

  const bytesWithAccessor = new Uint8Array([1, 2, 3]);
  Object.defineProperty(bytesWithAccessor, "length", { configurable: true,
    get() { traps += 1; throw new Error("byte length getter entered"); } });
  assert.throws(() => createOutsiderOutcomeWitnessSourceManifest({
    sourceId: "byte-accessor-source", sourceClass: "RESOURCE_OWNER_READBACK",
    objects: [{ objectId: "byte-accessor-object", immutableVersion: "rev-1",
      bytes: bytesWithAccessor }],
    rightsReviewHash: h("byte-accessor-rights"),
    privacyReviewHash: h("byte-accessor-privacy"), retentionDays: 1,
  }), /SOURCE_OBJECT_BYTES_OWN_OVERRIDE_FORBIDDEN/u);

  assert.throws(() => createOutsiderOutcomeWitnessSourceManifest({
    sourceId: "exotic-source", sourceClass: "RESOURCE_OWNER_READBACK",
    objects: [{ objectId: "exotic-object", immutableVersion: "rev-1",
      bytes: new DataView(new ArrayBuffer(3)) }],
    rightsReviewHash: h("exotic-rights"), privacyReviewHash: h("exotic-privacy"),
    retentionDays: 1,
  }), /SOURCE_OBJECT_BYTES_EXOTIC_FORBIDDEN/u);
  assert.equal(traps, 0);
});

test("captured intrinsics preserve hashes and HOLD under post-import poisoning", () => {
  const f = fixture();
  const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
  const originals = { sort: Array.prototype.sort, hasOwn: Object.hasOwn,
    stringify: JSON.stringify, String: globalThis.String,
    update: hashPrototype.update, digest: hashPrototype.digest };
  let checked;
  try {
    Array.prototype.sort = () => { throw new Error("poisoned sort"); };
    Object.hasOwn = () => { throw new Error("poisoned hasOwn"); };
    globalThis.String = () => "poisoned";
    hashPrototype.update = function poisonedUpdate() { return this; };
    hashPrototype.digest = function poisonedDigest() { return "0".repeat(64); };
    checked = verifyOutsiderOutcomeWitnessEnvelope(f.envelope, f.context);
  } finally {
    Array.prototype.sort = originals.sort;
    Object.hasOwn = originals.hasOwn;
    JSON.stringify = originals.stringify;
    globalThis.String = originals.String;
    hashPrototype.update = originals.update;
    hashPrototype.digest = originals.digest;
  }
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.independentOutcomeTruthEstablished, false);
});

test("the production surface does not export a relationship-review creator", async () => {
  const api = await import("../src/outsider-network-outcome-witness.js");
  assert.equal(Object.keys(api).some((name) =>
    /create.*relationship.*review/iu.test(name)), false);
});
