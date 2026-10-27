import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { normalizeDelegationRadius } from "../src/outsider-delegation-radius.js";
import {
  ACTOR_IDENTITY_ENVELOPE_SCHEMAS,
  ACTOR_IDENTITY_LIFECYCLE_KINDS,
  ACTOR_IDENTITY_NO_AUTHORITY,
  buildActorIdentityEnvelope,
  createActorIdentityEnvelopeSource,
  verifyActorIdentityEnvelope,
} from "../src/outsider-actor-identity-envelope.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function assurance(label, assuranceClass = "SELF_DECLARED_REFERENCE") {
  return assuranceClass === "NONE"
    ? { class: "NONE", evidenceRefHash: null }
    : { class: assuranceClass, evidenceRefHash: h(`assurance:${label}`) };
}

function domainDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function normalizedAssurance(value) {
  return {
    class: value.class,
    evidenceRefHash: value.evidenceRefHash,
    effectiveAssurance: "UNVERIFIED_REFERENCE_ONLY",
    externallyEstablished: false,
  };
}

function principalEpochProjectionHash(value) {
  const projection = {
    principalRefHash: value.principalRefHash,
    epochRefHash: value.epochRefHash,
    trustDomainRefHash: value.trustDomainRefHash,
    controllerKeyRefHash: value.controllerKeyRefHash,
    credentialRefHash: value.credentialRefHash,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    assurance: normalizedAssurance(value.assurance),
  };
  return domainDigest("outsider/actor-principal-epoch-projection/v1", projection);
}

function deploymentLineageProjectionHash(value) {
  const projection = {
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    issuerPrincipalRefHash: value.issuerPrincipalRefHash,
    lineageDeclarationRefHash: value.lineageDeclarationRefHash,
    assurance: normalizedAssurance(value.assurance),
  };
  return domainDigest("outsider/actor-deployment-lineage-projection/v1", projection);
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
  return domainDigest(ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision, body);
}

function runtimeInstanceHash(value) {
  const body = {
    runtimeInstanceRefHash: value.runtimeInstanceRefHash,
    instanceKeyRefHash: value.instanceKeyRefHash,
    bootEpochRefHash: value.bootEpochRefHash,
    loadedWayHash: value.loadedWayHash,
    loadedDeploymentRevisionHash: value.loadedDeploymentRevisionHash,
    workloadAttestationRefHash: value.workloadAttestationRefHash,
    memoryStateMode: value.memoryStateMode,
    memoryStateCommitmentHash: value.memoryStateCommitmentHash,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    assurance: normalizedAssurance(value.assurance),
    runtimeIdentityEstablished: false,
  };
  return domainDigest("outsider/actor-runtime-instance/v1", body);
}

function radius(label, atoms = ["OBSERVE"], validity = {
  validFrom: "2026-08-27T00:00:00.000Z",
  validUntil: "2026-08-28T00:00:00.000Z",
}) {
  const grants = [];
  for (let index = 0; index < atoms.length; index += 1) {
    grants.push({
      atom: atoms[index],
      scopeHashes: [h(`${label}:scope:${atoms[index]}`)],
      budget: { unitHash: h(`${label}:unit:${atoms[index]}`), limit: "2" },
    });
  }
  return normalizeDelegationRadius({
    validity,
    grants,
  });
}

function childRadiusFrom(parent, validity = parent.validity) {
  return normalizeDelegationRadius({
    validity,
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [parent.cells[0].scopeHashes[0]],
      budget: { unitHash: parent.cells[0].budget.unitHash, limit: "1" },
    }],
  });
}

function lifecycle(kind, predecessors, successors, suffix = kind) {
  return {
    kind,
    predecessorRefHashes: predecessors,
    successorRefHashes: successors,
    declarationEvidenceRefHash: h(`lifecycle:${suffix}`),
    declaredAt: "2026-08-27T00:00:00.000Z",
    assurance: assurance(`lifecycle:${suffix}`, "OPERATOR_SIGNED_REFERENCE"),
  };
}

function inputFixture({ actor = "alpha", model = "shared", transparency =
  "EXACT_ARTIFACT_BOUND", artifactRootKnown = true,
fineTuneState = "PROVENANCE_REFERENCE_PRESENT", memoryStateMode = "BOUND",
embodied = true, lifecycleEdges = [], delegationEdges = undefined } = {}) {
  const wayHash = h(`way:${actor}`);
  const modelRef = h(`model-ref:${model}`);
  const runtimeRef = h(`runtime:${actor}`);
  const parent = radius(`delegation:${actor}`);
  const child = childRadiusFrom(parent);
  const exactRoute = transparency === "EXACT_ARTIFACT_BOUND";
  const providerRoute = transparency === "PROVIDER_REVISION_ATTESTED_REFERENCE";
  const result = {
    bindings: {
      claimWayWorld: {
        claimHash: h(`claim:${actor}`),
        wayHash,
        worldHash: h(`world:${actor}`),
      },
      run: {
        episodeHash: h(`episode:${actor}`),
        attemptHash: h(`attempt:${actor}`),
        censusHash: h(`census:${actor}`),
        observedAt: "2026-08-27T00:00:00.000Z",
      },
    },
    principalEpoch: {
      principalRefHash: h(`principal:${actor}`),
      epochRefHash: h(`principal-epoch:${actor}`),
      trustDomainRefHash: h(`trust-domain:${actor}`),
      controllerKeyRefHash: h(`controller-key:${actor}`),
      credentialRefHash: h(`credential:${actor}`),
      validFrom: "2026-08-26T00:00:00.000Z",
      validUntil: "2026-08-30T00:00:00.000Z",
      assurance: assurance(`principal:${actor}`, "LEGAL_BINDING_REFERENCE"),
    },
    deploymentLineage: {
      deploymentLineageRefHash: h(`lineage:${actor}`),
      issuerPrincipalRefHash: h(`principal:${actor}`),
      lineageDeclarationRefHash: h(`lineage-declaration:${actor}`),
      assurance: assurance(`lineage:${actor}`, "OPERATOR_SIGNED_REFERENCE"),
    },
    deploymentRevision: {
      deploymentLineageRefHash: h(`lineage:${actor}`),
      wayHash,
      runtimeClosureHash: h(`runtime-closure:${actor}`),
      configClosureHash: h(`config-closure:${actor}`),
      memoryPolicyHash: h(`memory-policy:${actor}`),
      controllerImplementationHash: h(`controller:${actor}`),
      adapterHash: h(`adapter:${actor}`),
      providerRootHash: h(`provider:${actor}`),
      topologyHash: h(`topology:${actor}`),
      modelArtifactRefHashes: [modelRef],
      dataRootHashes: [h(`data:${actor}`)],
      toolchainRootHashes: [h(`toolchain:${actor}`)],
      assurance: assurance(`revision:${actor}`, "SOURCE_REPLAYED_REFERENCE"),
    },
    modelArtifacts: [{
      modelArtifactRefHash: modelRef,
      providerRevisionRefHash: h(`provider-model-revision:${model}`),
      artifactRootHash: artifactRootKnown ? h(`model-artifact-root:${model}`) : null,
      baseModelRefHash: h(`base-model:${model}`),
      tokenizerRootHash: artifactRootKnown ? h(`tokenizer:${model}`) : null,
      quantizationRootHash: artifactRootKnown ? h(`quantization:${model}`) : null,
      fineTuneState,
      fineTuneProvenanceRefHash: fineTuneState === "PROVENANCE_REFERENCE_PRESENT"
        ? h(`fine-tune:${model}`) : null,
      assurance: assurance(`model:${model}`, exactRoute
        ? "SOURCE_REPLAYED_REFERENCE" : "OPERATOR_SIGNED_REFERENCE"),
    }],
    modelRoute: {
      transparency,
      routePolicyHash: transparency === "UNKNOWN" ? null : h(`route-policy:${actor}`),
      selectedModelArtifactRefHashes: exactRoute || providerRoute ? [modelRef] : [],
      routeEvidenceRefHash: exactRoute || providerRoute ? h(`route-evidence:${actor}`) : null,
      assurance: assurance(`route:${actor}`, transparency === "UNKNOWN"
        ? "NONE" : "OPERATOR_SIGNED_REFERENCE"),
    },
    runtimeInstance: {
      runtimeInstanceRefHash: runtimeRef,
      instanceKeyRefHash: h(`instance-key:${actor}`),
      bootEpochRefHash: h(`boot:${actor}`),
      loadedWayHash: wayHash,
      loadedDeploymentRevisionHash: null,
      workloadAttestationRefHash: h(`workload-attestation:${actor}`),
      memoryStateMode,
      memoryStateCommitmentHash: memoryStateMode === "BOUND"
        ? h(`memory-state:${actor}`) : null,
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-28T00:00:00.000Z",
      assurance: assurance(`runtime:${actor}`, "WORKLOAD_ATTESTATION_REFERENCE"),
    },
    embodimentRevision: embodied ? {
      deviceLineageRefHash: h(`device:${actor}`),
      hardwareArtifactRootHash: h(`hardware:${actor}`),
      firmwareRootHash: h(`firmware:${actor}`),
      calibrationRootHash: h(`calibration:${actor}`),
      controllerImplementationHash: h(`controller:${actor}`),
      hardwareAttestationRefHash: h(`hardware-attestation:${actor}`),
      assurance: assurance(`embodiment:${actor}`, "HARDWARE_ATTESTATION_REFERENCE"),
    } : null,
    delegationEdges: [],
    lifecycleEdges,
  };
  result.runtimeInstance.loadedDeploymentRevisionHash
    = deploymentRevisionHash(result.deploymentRevision, result.deploymentLineage);
  result.delegationEdges = delegationEdges === undefined ? [{
    parent: {
      kind: "PRINCIPAL_EPOCH",
      refHash: principalEpochProjectionHash(result.principalEpoch),
    },
    child: {
      kind: "ACCOUNTABLE_DEPLOYMENT",
      refHash: h(`delegated-deployment:${actor}`),
    },
    parentRadius: parent,
    childRadius: child,
    delegationEvidenceRefHash: h(`delegation-evidence:${actor}`),
    assurance: assurance(`delegation:${actor}`, "OPERATOR_SIGNED_REFERENCE"),
  }] : delegationEdges;
  return result;
}

function built(options = {}) {
  const input = inputFixture(options);
  const source = createActorIdentityEnvelopeSource(input);
  const envelope = buildActorIdentityEnvelope(source);
  const verification = verifyActorIdentityEnvelope(envelope, {
    source,
    expectedSourceHash: source.sourceHash,
    expectedEnvelopeHash: envelope.actorIdentityEnvelopeHash,
  });
  return { input, source, envelope, verification };
}

function resealEnvelope(value) {
  const changed = structuredClone(value);
  delete changed.actorIdentityEnvelopeHash;
  changed.actorIdentityEnvelopeHash = `sha256:${createHash("sha256")
    .update(`${ACTOR_IDENTITY_ENVELOPE_SCHEMAS.envelope}\0${canonicalizeStrict(changed)}`,
      "utf8").digest("hex")}`;
  return changed;
}

test("source replay binds typed actor layers to exact Claim x Way x World and run census", () => {
  const fixture = built();
  assert.equal(fixture.verification.ok, true);
  assert.equal(fixture.verification.sourceReplayComplete, true);
  assert.equal(fixture.source.bindings.claimWayWorld.wayHash,
    fixture.source.deploymentRevision.wayHash);
  assert.equal(fixture.source.runtimeInstance.loadedWayHash,
    fixture.source.deploymentRevision.wayHash);
  assert.equal(fixture.envelope.actorSubjectHash, fixture.source.actorSubjectHash);
  assert.equal(fixture.verification.actorSubjectHash, fixture.source.actorSubjectHash);
  assert.equal(fixture.source.principalEpochProjectionHash,
    fixture.source.principalEpoch.principalEpochProjectionHash);
  assert.equal(fixture.source.deploymentLineageProjectionHash,
    fixture.source.deploymentLineage.deploymentLineageProjectionHash);
  assert.equal(fixture.envelope.principalEpochProjectionHash,
    fixture.source.principalEpochProjectionHash);
  assert.equal(fixture.verification.deploymentLineageProjectionHash,
    fixture.source.deploymentLineageProjectionHash);
  assert.equal(fixture.envelope.attemptActorSubjectHash,
    fixture.source.attemptActorSubjectHash);
  assert.equal(fixture.verification.attemptActorSubjectHash,
    fixture.source.attemptActorSubjectHash);
  assert.equal(fixture.envelope.subjectAggregationPolicy,
    "ACTOR_SUBJECT_HASH_FOR_ACCOUNT_ATTEMPT_ACTOR_SUBJECT_HASH_FOR_EXECUTION");
  for (const artifact of [fixture.source, fixture.envelope, fixture.verification]) {
    assert.equal(artifact.creditAggregationPolicy,
      "TYPED_CONTEXTUAL_FACTS_ONLY_NO_GLOBAL_SCALAR_SCORE_NO_IMPLICIT_INHERITANCE");
    assert.equal(Object.hasOwn(artifact, "globalScore"), false);
  }
  assert.equal(fixture.source.bindings.run.episodeHash, h("episode:alpha"));
  assert.equal(fixture.source.bindings.run.attemptHash, h("attempt:alpha"));
  assert.equal(fixture.source.bindings.run.censusHash, h("census:alpha"));
  assert.equal(fixture.source.bindings.run.observedAt, "2026-08-27T00:00:00.000Z");
  assert.equal(fixture.source.deploymentRevision.configClosureHash,
    h("config-closure:alpha"));
  assert.equal(fixture.source.deploymentRevision.memoryPolicyHash,
    h("memory-policy:alpha"));
  assert.equal(fixture.source.runtimeInstance.memoryStateMode, "BOUND");
  assert.equal(fixture.envelope.decisionState, "HOLD");
  assert.equal(fixture.envelope.externalAuthorityEstablished, false);
  assert.equal(fixture.envelope.actionReady, false);
  assert.equal(fixture.envelope.executable, false);
  assert.equal(fixture.envelope.causalExperienceUnits, 0);
  assert.deepEqual(fixture.envelope.authority, ACTOR_IDENTITY_NO_AUTHORITY);
  assert.equal(Object.isFrozen(fixture.envelope), true);

  const scalar = inputFixture();
  scalar.globalScore = 742;
  assert.throws(() => createActorIdentityEnvelopeSource(scalar), /FIELDS_INVALID/u);
});

test("run observedAt is inside both principal and runtime half-open validity windows", () => {
  const atValidFrom = inputFixture({ delegationEdges: [] });
  atValidFrom.runtimeInstance.validFrom = atValidFrom.principalEpoch.validFrom;
  atValidFrom.bindings.run.observedAt = atValidFrom.principalEpoch.validFrom;
  assert.doesNotThrow(() => createActorIdentityEnvelopeSource(atValidFrom));

  const beforePrincipal = inputFixture({ delegationEdges: [] });
  beforePrincipal.bindings.run.observedAt = "2026-08-25T23:59:59.999Z";
  assert.throws(() => createActorIdentityEnvelopeSource(beforePrincipal),
    /RUN_OBSERVED_AT_OUTSIDE_PRINCIPAL_EPOCH/u);

  const atPrincipalUntil = inputFixture({ delegationEdges: [] });
  atPrincipalUntil.runtimeInstance.validUntil = atPrincipalUntil.principalEpoch.validUntil;
  atPrincipalUntil.bindings.run.observedAt = atPrincipalUntil.principalEpoch.validUntil;
  assert.throws(() => createActorIdentityEnvelopeSource(atPrincipalUntil),
    /RUN_OBSERVED_AT_OUTSIDE_PRINCIPAL_EPOCH/u);

  const afterPrincipal = inputFixture({ delegationEdges: [] });
  afterPrincipal.runtimeInstance.validUntil = afterPrincipal.principalEpoch.validUntil;
  afterPrincipal.bindings.run.observedAt = "2026-08-30T00:00:00.001Z";
  assert.throws(() => createActorIdentityEnvelopeSource(afterPrincipal),
    /RUN_OBSERVED_AT_OUTSIDE_PRINCIPAL_EPOCH/u);

  const beforeRuntime = inputFixture({ delegationEdges: [] });
  beforeRuntime.bindings.run.observedAt = "2026-08-26T23:59:59.999Z";
  assert.throws(() => createActorIdentityEnvelopeSource(beforeRuntime),
    /RUN_OBSERVED_AT_OUTSIDE_RUNTIME_INSTANCE/u);

  const atRuntimeUntil = inputFixture({ delegationEdges: [] });
  atRuntimeUntil.bindings.run.observedAt = atRuntimeUntil.runtimeInstance.validUntil;
  assert.throws(() => createActorIdentityEnvelopeSource(atRuntimeUntil),
    /RUN_OBSERVED_AT_OUTSIDE_RUNTIME_INSTANCE/u);

  const afterRuntime = inputFixture({ delegationEdges: [] });
  afterRuntime.bindings.run.observedAt = "2026-08-28T00:00:00.001Z";
  assert.throws(() => createActorIdentityEnvelopeSource(afterRuntime),
    /RUN_OBSERVED_AT_OUTSIDE_RUNTIME_INSTANCE/u);
});

test("IP, host, caller booleans, and raw model names cannot become identity keys", () => {
  const ip = inputFixture();
  ip.principalEpoch.ipAddress = "203.0.113.17";
  assert.throws(() => createActorIdentityEnvelopeSource(ip), /FIELDS_INVALID/u);

  const host = inputFixture();
  host.runtimeInstance.host = "workstation-7";
  assert.throws(() => createActorIdentityEnvelopeSource(host), /FIELDS_INVALID/u);

  const raw = inputFixture();
  raw.modelArtifacts[0].modelName = "open-model-fine-tuned-v7";
  assert.throws(() => createActorIdentityEnvelopeSource(raw), /FIELDS_INVALID/u);

  const positive = inputFixture();
  positive.principalEpoch.verified = true;
  assert.throws(() => createActorIdentityEnvelopeSource(positive), /FIELDS_INVALID/u);

  const nonHash = inputFixture();
  nonHash.principalEpoch.principalRefHash = "192.0.2.44";
  assert.throws(() => createActorIdentityEnvelopeSource(nonHash), /HASH_INVALID/u);
});

test("the same model component cannot transfer history across two actor deployments", () => {
  const left = built({ actor: "left", model: "same-component" });
  const right = built({ actor: "right", model: "same-component" });
  assert.equal(left.envelope.modelArtifacts[0].modelArtifactRefHash,
    right.envelope.modelArtifacts[0].modelArtifactRefHash);
  assert.notEqual(left.envelope.principalEpoch.principalRefHash,
    right.envelope.principalEpoch.principalRefHash);
  assert.notEqual(left.envelope.deploymentLineage.deploymentLineageRefHash,
    right.envelope.deploymentLineage.deploymentLineageRefHash);
  assert.notEqual(left.envelope.deploymentRevision.wayHash,
    right.envelope.deploymentRevision.wayHash);
  assert.notEqual(left.envelope.actorIdentityEnvelopeHash,
    right.envelope.actorIdentityEnvelopeHash);
  for (const envelope of [left.envelope, right.envelope]) {
    assert.equal(envelope.historyInheritanceEstablished, false);
    assert.equal(envelope.modelAttributionEstablished, false);
    assert.equal(envelope.creditAttributionEstablished, false);
    assert.equal(envelope.incidentAttributionEstablished, false);
  }
});

test("same caller lineage and exact build under different principals has a different subject", () => {
  const leftInput = inputFixture({ actor: "shared-build-owner", delegationEdges: [] });
  const rightInput = structuredClone(leftInput);
  rightInput.principalEpoch.principalRefHash = h("principal:transferred-owner");
  rightInput.principalEpoch.epochRefHash = h("principal-epoch:transferred-owner");
  rightInput.principalEpoch.trustDomainRefHash = h("trust-domain:transferred-owner");
  rightInput.principalEpoch.controllerKeyRefHash = h("controller-key:transferred-owner");
  rightInput.principalEpoch.credentialRefHash = h("credential:transferred-owner");
  rightInput.principalEpoch.assurance = assurance("principal:transferred-owner",
    "LEGAL_BINDING_REFERENCE");
  rightInput.deploymentLineage.issuerPrincipalRefHash
    = rightInput.principalEpoch.principalRefHash;
  rightInput.runtimeInstance.loadedDeploymentRevisionHash
    = deploymentRevisionHash(rightInput.deploymentRevision,
      rightInput.deploymentLineage);
  rightInput.lifecycleEdges = [lifecycle("CONTROL_TRANSFER",
    [leftInput.principalEpoch.principalRefHash],
    [rightInput.principalEpoch.principalRefHash], "explicit-control-transfer")];

  const leftSource = createActorIdentityEnvelopeSource(leftInput);
  const rightSource = createActorIdentityEnvelopeSource(rightInput);
  const leftEnvelope = buildActorIdentityEnvelope(leftSource);
  const rightEnvelope = buildActorIdentityEnvelope(rightSource);
  assert.equal(leftSource.deploymentLineage.deploymentLineageRefHash,
    rightSource.deploymentLineage.deploymentLineageRefHash);
  assert.equal(leftSource.deploymentRevision.wayHash,
    rightSource.deploymentRevision.wayHash);
  assert.equal(leftSource.deploymentRevision.configClosureHash,
    rightSource.deploymentRevision.configClosureHash);
  assert.notEqual(leftSource.deploymentRevision.deploymentRevisionHash,
    rightSource.deploymentRevision.deploymentRevisionHash);
  assert.notEqual(leftSource.actorSubjectHash, rightSource.actorSubjectHash);
  assert.equal(rightEnvelope.subjectAggregationPolicy,
    "ACTOR_SUBJECT_HASH_FOR_ACCOUNT_ATTEMPT_ACTOR_SUBJECT_HASH_FOR_EXECUTION");
  assert.equal(rightEnvelope.identityContinuityEstablished, false);
  assert.equal(rightEnvelope.historyInheritanceEstablished, false);
  assert.equal(rightEnvelope.creditAttributionEstablished, false);
  assert.equal(rightEnvelope.lifecycleEdges[0].continuityEstablished, false);
  assert.equal(rightEnvelope.lifecycleEdges[0].historyInheritanceEstablished, false);
});

test("attempt subject changes on execution state while account subject changes on build or route", () => {
  const baseInput = inputFixture({ actor: "two-level-key" });
  const base = createActorIdentityEnvelopeSource(baseInput);

  const changedAttempt = structuredClone(baseInput);
  changedAttempt.bindings.run.attemptHash = h("two-level-key:attempt:changed");
  const attempt = createActorIdentityEnvelopeSource(changedAttempt);
  assert.equal(attempt.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(attempt.attemptActorSubjectHash, base.attemptActorSubjectHash);

  const changedMemory = structuredClone(baseInput);
  changedMemory.runtimeInstance.memoryStateCommitmentHash
    = h("two-level-key:memory:changed");
  const memory = createActorIdentityEnvelopeSource(changedMemory);
  assert.equal(memory.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(memory.attemptActorSubjectHash, base.attemptActorSubjectHash);

  const changedBody = structuredClone(baseInput);
  changedBody.embodimentRevision.calibrationRootHash
    = h("two-level-key:calibration:changed");
  const body = createActorIdentityEnvelopeSource(changedBody);
  assert.equal(body.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(body.attemptActorSubjectHash, base.attemptActorSubjectHash);

  const changedDelegation = structuredClone(baseInput);
  changedDelegation.delegationEdges[0].delegationEvidenceRefHash
    = h("two-level-key:delegation:changed");
  const delegation = createActorIdentityEnvelopeSource(changedDelegation);
  assert.equal(delegation.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(delegation.attemptActorSubjectHash, base.attemptActorSubjectHash);

  const changedRoute = structuredClone(baseInput);
  changedRoute.modelRoute.routePolicyHash = h("two-level-key:route-policy:changed");
  const route = createActorIdentityEnvelopeSource(changedRoute);
  assert.notEqual(route.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(route.attemptActorSubjectHash, base.attemptActorSubjectHash);

  const changedModel = structuredClone(baseInput);
  changedModel.modelArtifacts[0].artifactRootHash = h("two-level-key:model:changed");
  const model = createActorIdentityEnvelopeSource(changedModel);
  assert.notEqual(model.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(model.attemptActorSubjectHash, base.attemptActorSubjectHash);

  const changedBuild = structuredClone(baseInput);
  changedBuild.deploymentRevision.configClosureHash = h("two-level-key:config:changed");
  changedBuild.runtimeInstance.loadedDeploymentRevisionHash
    = deploymentRevisionHash(changedBuild.deploymentRevision,
      changedBuild.deploymentLineage);
  const build = createActorIdentityEnvelopeSource(changedBuild);
  assert.notEqual(build.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(build.attemptActorSubjectHash, base.attemptActorSubjectHash);

  const mismatchedLoadedRevision = structuredClone(baseInput);
  mismatchedLoadedRevision.runtimeInstance.loadedDeploymentRevisionHash = h("wrong-revision");
  assert.throws(() => createActorIdentityEnvelopeSource(mismatchedLoadedRevision),
    /RUNTIME_DEPLOYMENT_REVISION_BINDING_MISMATCH/u);
});

test("principal epochs and deployment lineage projections rotate both aggregation keys", () => {
  const baseInput = inputFixture({ actor: "projection-rotation", delegationEdges: [] });
  const base = createActorIdentityEnvelopeSource(baseInput);

  const principalMutations = [
    (input) => { input.principalEpoch.controllerKeyRefHash = h("rotated-controller-key"); },
    (input) => { input.principalEpoch.credentialRefHash = h("rotated-credential"); },
    (input) => { input.principalEpoch.validUntil = "2026-08-29T00:00:00.000Z"; },
    (input) => {
      input.principalEpoch.assurance = assurance("rotated-principal-assurance",
        "EXTERNAL_ANCHOR_REFERENCE");
    },
  ];
  for (const mutate of principalMutations) {
    const changedInput = structuredClone(baseInput);
    mutate(changedInput);
    const changed = createActorIdentityEnvelopeSource(changedInput);
    assert.notEqual(changed.principalEpochProjectionHash,
      base.principalEpochProjectionHash);
    assert.notEqual(changed.actorSubjectHash, base.actorSubjectHash);
    assert.notEqual(changed.attemptActorSubjectHash, base.attemptActorSubjectHash);
  }

  const lineageDeclarationInput = structuredClone(baseInput);
  lineageDeclarationInput.deploymentLineage.lineageDeclarationRefHash
    = h("rotated-lineage-declaration");
  lineageDeclarationInput.runtimeInstance.loadedDeploymentRevisionHash
    = deploymentRevisionHash(lineageDeclarationInput.deploymentRevision,
      lineageDeclarationInput.deploymentLineage);
  const lineageDeclaration = createActorIdentityEnvelopeSource(lineageDeclarationInput);
  assert.notEqual(lineageDeclaration.deploymentLineageProjectionHash,
    base.deploymentLineageProjectionHash);
  assert.notEqual(lineageDeclaration.deploymentRevision.deploymentRevisionHash,
    base.deploymentRevision.deploymentRevisionHash);
  assert.notEqual(lineageDeclaration.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(lineageDeclaration.attemptActorSubjectHash,
    base.attemptActorSubjectHash);

  const lineageAssuranceInput = structuredClone(baseInput);
  lineageAssuranceInput.deploymentLineage.assurance
    = assurance("rotated-lineage-assurance", "EXTERNAL_ANCHOR_REFERENCE");
  lineageAssuranceInput.runtimeInstance.loadedDeploymentRevisionHash
    = deploymentRevisionHash(lineageAssuranceInput.deploymentRevision,
      lineageAssuranceInput.deploymentLineage);
  const lineageAssurance = createActorIdentityEnvelopeSource(lineageAssuranceInput);
  assert.notEqual(lineageAssurance.deploymentLineageProjectionHash,
    base.deploymentLineageProjectionHash);
  assert.notEqual(lineageAssurance.actorSubjectHash, base.actorSubjectHash);
  assert.notEqual(lineageAssurance.attemptActorSubjectHash,
    base.attemptActorSubjectHash);
});

test("opaque routes and unknown fine-tunes require model attribution ABSTAIN", () => {
  const opaque = built({ transparency: "OPAQUE", artifactRootKnown: false,
    fineTuneState: "UNKNOWN", memoryStateMode: "OPAQUE" });
  assert.equal(opaque.envelope.modelAttributionStatus, "ABSTAIN_ROUTE_UNOBSERVED");
  assert.equal(opaque.envelope.modelAttributionEstablished, false);
  assert.equal(opaque.envelope.modelArtifacts[0].artifactRootHash, null);
  assert.equal(opaque.envelope.modelArtifacts[0].providerRevisionRefHash,
    h("provider-model-revision:shared"));
  assert.ok(opaque.envelope.gapReasons.includes("MODEL_ROUTE_OPAQUE"));
  assert.ok(opaque.envelope.gapReasons.includes("MODEL_FINE_TUNE_PROVENANCE_UNKNOWN"));
  assert.ok(opaque.envelope.gapReasons.includes("MODEL_ARTIFACT_BYTES_UNAVAILABLE"));
  assert.ok(opaque.envelope.gapReasons.includes("RUNTIME_MEMORY_STATE_OPAQUE"));

  const unknownTune = built({ fineTuneState: "UNKNOWN" });
  assert.equal(unknownTune.envelope.modelAttributionStatus,
    "ABSTAIN_FINE_TUNE_LINEAGE_UNKNOWN");
  assert.equal(unknownTune.envelope.modelAttributionEstablished, false);
});

test("all lifecycle declarations are consistency-only and cannot wash clone history", () => {
  const a = h("life:a");
  const b = h("life:b");
  const c = h("life:c");
  const d = h("life:d");
  const edges = [
    lifecycle("REVISION", [a], [b]),
    lifecycle("FORK", [a], [b, c]),
    lifecycle("MERGE", [b, c], [d]),
    lifecycle("KEY_ROTATION", [h("key:old")], [h("key:new")]),
    lifecycle("CONTROL_TRANSFER", [h("control:old")], [h("control:new")]),
    lifecycle("RETIRE", [d], []),
  ];
  const fixture = built({ lifecycleEdges: edges });
  assert.deepEqual([...ACTOR_IDENTITY_LIFECYCLE_KINDS].sort(),
    fixture.envelope.lifecycleEdges.map((edge) => edge.kind).sort());
  assert.ok(fixture.envelope.lifecycleEdges.every((edge) =>
    edge.declarationShapeConsistent === true
      && edge.continuityEstablished === false
      && edge.historyInheritanceEstablished === false));
  assert.equal(fixture.envelope.identityContinuityEstablished, false);
  assert.equal(fixture.envelope.historyInheritanceEstablished, false);
  assert.ok(fixture.envelope.gapReasons.includes(
    "LIFECYCLE_DECLARATIONS_DO_NOT_ESTABLISH_CONTINUITY"));

  const invalid = inputFixture({ lifecycleEdges: [lifecycle("MERGE", [a], [b])] });
  assert.throws(() => createActorIdentityEnvelopeSource(invalid),
    /LIFECYCLE_CARDINALITY_INVALID/u);
});

test("delegation edges replay exact radii and reject child expansion without granting authority", () => {
  const fixture = built();
  const edge = fixture.envelope.delegationEdges[0];
  assert.deepEqual(edge.parent, {
    kind: "PRINCIPAL_EPOCH",
    refHash: fixture.source.principalEpochProjectionHash,
  });
  assert.equal(edge.child.kind, "ACCOUNTABLE_DEPLOYMENT");
  assert.equal(edge.structuralContractionVerified, true);
  assert.equal(edge.delegationAuthorityEstablished, false);
  assert.equal(edge.continuityEstablished, false);
  assert.equal(fixture.envelope.authority.delegationAuthorityEstablished, false);

  const invalid = inputFixture({ delegationEdges: [] });
  const narrow = radius("bad-delegation", ["OBSERVE"]);
  const wider = normalizeDelegationRadius({
    validity: narrow.validity,
    grants: [{
      atom: "PHYSICAL_ACTUATE",
      scopeHashes: [h("bad:physical-scope")],
      budget: { unitHash: h("bad:physical-unit"), limit: "1" },
    }],
  });
  invalid.delegationEdges = [{
    parent: {
      kind: "PRINCIPAL_EPOCH",
      refHash: principalEpochProjectionHash(invalid.principalEpoch),
    },
    child: { kind: "ACCOUNTABLE_DEPLOYMENT", refHash: h("bad-child") },
    parentRadius: narrow,
    childRadius: wider,
    delegationEvidenceRefHash: h("bad-delegation-evidence"),
    assurance: assurance("bad-delegation"),
  }];
  assert.throws(() => createActorIdentityEnvelopeSource(invalid),
    /DELEGATION_CHILD_RADIUS_EXPANDS_PARENT/u);
});

test("delegation endpoints are typed, domain-separated, and bind the current actor", () => {
  const input = inputFixture({ actor: "typed-edge", delegationEdges: [] });
  const parentRadius = radius("typed-edge");
  const childRadius = childRadiusFrom(parentRadius);
  const sharedBytes = h("same-endpoint-bytes");
  const currentRuntime = runtimeInstanceHash(input.runtimeInstance);
  const common = {
    child: { kind: "RUNTIME_INSTANCE", refHash: currentRuntime },
    parentRadius,
    childRadius,
    delegationEvidenceRefHash: h("typed-edge-evidence"),
    assurance: assurance("typed-edge", "OPERATOR_SIGNED_REFERENCE"),
  };
  input.delegationEdges = [{
    ...structuredClone(common),
    parent: { kind: "PRINCIPAL_EPOCH", refHash: sharedBytes },
  }, {
    ...structuredClone(common),
    parent: { kind: "ACCOUNTABLE_DEPLOYMENT", refHash: sharedBytes },
  }];
  const source = createActorIdentityEnvelopeSource(input);
  assert.equal(source.delegationEdges.length, 2);
  assert.notEqual(source.delegationEdges[0].delegationEdgeHash,
    source.delegationEdges[1].delegationEdgeHash);

  const modelEndpoint = inputFixture({ actor: "model-endpoint", delegationEdges: [] });
  const modelParentRadius = radius("model-endpoint");
  modelEndpoint.delegationEdges = [{
    parent: {
      kind: "MODEL_ARTIFACT",
      refHash: modelEndpoint.modelArtifacts[0].modelArtifactRefHash,
    },
    child: {
      kind: "RUNTIME_INSTANCE",
      refHash: runtimeInstanceHash(modelEndpoint.runtimeInstance),
    },
    parentRadius: modelParentRadius,
    childRadius: childRadiusFrom(modelParentRadius),
    delegationEvidenceRefHash: h("model-endpoint-evidence"),
    assurance: assurance("model-endpoint"),
  }];
  assert.throws(() => createActorIdentityEnvelopeSource(modelEndpoint),
    /DELEGATION_PARENT_ENDPOINT_KIND_INVALID/u);

  const unbound = inputFixture({ actor: "unbound-endpoint", delegationEdges: [] });
  const unboundRadius = radius("unbound-endpoint");
  unbound.delegationEdges = [{
    parent: { kind: "PRINCIPAL_EPOCH", refHash: h("unbound-parent") },
    child: { kind: "ACCOUNTABLE_DEPLOYMENT", refHash: h("unbound-child") },
    parentRadius: unboundRadius,
    childRadius: childRadiusFrom(unboundRadius),
    delegationEvidenceRefHash: h("unbound-endpoint-evidence"),
    assurance: assurance("unbound-endpoint"),
  }];
  assert.throws(() => createActorIdentityEnvelopeSource(unbound),
    /DELEGATION_EDGE_DOES_NOT_BIND_CURRENT_ACTOR/u);
});

test("every delegation radius contains run observedAt using half-open validity", () => {
  const atFrom = inputFixture({ actor: "radius-at-from" });
  const atFromParent = radius("radius-at-from", ["OBSERVE"], {
    validFrom: atFrom.bindings.run.observedAt,
    validUntil: "2026-08-28T00:00:00.000Z",
  });
  atFrom.delegationEdges[0].parentRadius = atFromParent;
  atFrom.delegationEdges[0].childRadius = childRadiusFrom(atFromParent);
  assert.doesNotThrow(() => createActorIdentityEnvelopeSource(atFrom));

  const future = inputFixture({ actor: "radius-future" });
  const futureParent = radius("radius-future", ["OBSERVE"], {
    validFrom: "2026-08-27T00:00:00.001Z",
    validUntil: "2026-08-28T00:00:00.000Z",
  });
  future.delegationEdges[0].parentRadius = futureParent;
  future.delegationEdges[0].childRadius = childRadiusFrom(futureParent);
  assert.throws(() => createActorIdentityEnvelopeSource(future),
    /DELEGATION_RADIUS_NOT_VALID_AT_RUN_OBSERVED_AT/u);

  const atUntil = inputFixture({ actor: "radius-at-until" });
  const atUntilParent = radius("radius-at-until", ["OBSERVE"], {
    validFrom: "2026-08-26T00:00:00.000Z",
    validUntil: atUntil.bindings.run.observedAt,
  });
  atUntil.delegationEdges[0].parentRadius = atUntilParent;
  atUntil.delegationEdges[0].childRadius = childRadiusFrom(atUntilParent);
  assert.throws(() => createActorIdentityEnvelopeSource(atUntil),
    /DELEGATION_RADIUS_NOT_VALID_AT_RUN_OBSERVED_AT/u);

  const expiredChild = inputFixture({ actor: "radius-expired-child" });
  const broadParent = radius("radius-expired-child", ["OBSERVE"], {
    validFrom: "2026-08-26T00:00:00.000Z",
    validUntil: "2026-08-28T00:00:00.000Z",
  });
  expiredChild.delegationEdges[0].parentRadius = broadParent;
  expiredChild.delegationEdges[0].childRadius = childRadiusFrom(broadParent, {
    validFrom: "2026-08-26T00:00:00.000Z",
    validUntil: "2026-08-26T23:59:59.999Z",
  });
  assert.throws(() => createActorIdentityEnvelopeSource(expiredChild),
    /DELEGATION_RADIUS_NOT_VALID_AT_RUN_OBSERVED_AT/u);
});

test("physical delegation without a local embodiment remains HOLD with an explicit gap", () => {
  const input = inputFixture({ actor: "remote-physical", embodied: false,
    delegationEdges: [] });
  const parent = radius("remote-physical", ["PHYSICAL_ACTUATE"]);
  const child = normalizeDelegationRadius({
    validity: parent.validity,
    grants: [{
      atom: "PHYSICAL_ACTUATE",
      scopeHashes: [parent.cells[4].scopeHashes[0]],
      budget: { unitHash: parent.cells[4].budget.unitHash, limit: "1" },
    }],
  });
  input.delegationEdges = [{
    parent: {
      kind: "PRINCIPAL_EPOCH",
      refHash: principalEpochProjectionHash(input.principalEpoch),
    },
    child: {
      kind: "ACCOUNTABLE_DEPLOYMENT",
      refHash: h("remote-physical-child"),
    },
    parentRadius: parent,
    childRadius: child,
    delegationEvidenceRefHash: h("remote-physical-edge"),
    assurance: assurance("remote-physical-edge"),
  }];
  const source = createActorIdentityEnvelopeSource(input);
  const envelope = buildActorIdentityEnvelope(source);
  assert.equal(envelope.decisionState, "HOLD");
  assert.ok(envelope.gapReasons.includes(
    "PHYSICAL_ACTUATION_WITHOUT_BOUND_EMBODIMENT_OR_REMOTE_TARGET"));
});

test("self-rehash, strong assurance labels, and a clone declaration cannot promote identity", () => {
  const fixture = built({ lifecycleEdges: [lifecycle("FORK", [h("clone-source")],
    [h("clone-a"), h("clone-b")])] });
  const forged = structuredClone(fixture.envelope);
  forged.actionReady = true;
  const resealed = resealEnvelope(forged);
  const rejected = verifyActorIdentityEnvelope(resealed, {
    source: fixture.source,
    expectedSourceHash: fixture.source.sourceHash,
    expectedEnvelopeHash: resealed.actorIdentityEnvelopeHash,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.actionReady, false);
  assert.equal(rejected.executable, false);

  const changed = built({ actor: "replacement" });
  const pinned = verifyActorIdentityEnvelope(changed.envelope, {
    source: changed.source,
    expectedSourceHash: fixture.source.sourceHash,
    expectedEnvelopeHash: changed.envelope.actorIdentityEnvelopeHash,
  });
  assert.equal(pinned.ok, false);
  assert.equal(changed.envelope.principalEpoch.assurance.class, "LEGAL_BINDING_REFERENCE");
  assert.equal(changed.envelope.principalEpoch.assurance.externallyEstablished, false);
  assert.equal(changed.envelope.principalEpoch.legalIdentityEstablished, false);
  assert.equal(changed.envelope.historyInheritanceEstablished, false);
});

test("accessors, sparse arrays, symbols, and decorated records fail before values are read", () => {
  const accessor = inputFixture();
  let invoked = false;
  Object.defineProperty(accessor.principalEpoch, "principalRefHash", {
    enumerable: true,
    get() { invoked = true; return h("getter-principal"); },
  });
  assert.throws(() => createActorIdentityEnvelopeSource(accessor),
    /canonical objects must contain enumerable data properties/u);
  assert.equal(invoked, false);

  const sparse = inputFixture();
  sparse.modelArtifacts = new Array(1);
  assert.throws(() => createActorIdentityEnvelopeSource(sparse),
    /canonical arrays must be dense and undecorated/u);

  const symbol = inputFixture();
  symbol.runtimeInstance[Symbol("hidden")] = h("symbol-value");
  assert.throws(() => createActorIdentityEnvelopeSource(symbol),
    /symbol properties/u);

  const decorated = inputFixture();
  Object.defineProperty(decorated.modelArtifacts, "hidden", {
    value: true, enumerable: false,
  });
  assert.throws(() => createActorIdentityEnvelopeSource(decorated),
    /dense and undecorated/u);
});

test("captured crypto Hash methods prevent post-import subject collisions", () => {
  const leftInput = inputFixture({ actor: "crypto-left", delegationEdges: [] });
  const rightInput = inputFixture({ actor: "crypto-right", delegationEdges: [] });
  const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
  const savedUpdate = hashPrototype.update;
  const savedDigest = hashPrototype.digest;
  let leftSource;
  let rightSource;
  let verification;
  try {
    hashPrototype.update = function poisonedUpdate() { return this; };
    hashPrototype.digest = () => "0".repeat(64);
    leftSource = createActorIdentityEnvelopeSource(leftInput);
    rightSource = createActorIdentityEnvelopeSource(rightInput);
    const envelope = buildActorIdentityEnvelope(leftSource);
    verification = verifyActorIdentityEnvelope(envelope, {
      source: leftSource,
      expectedSourceHash: leftSource.sourceHash,
      expectedEnvelopeHash: envelope.actorIdentityEnvelopeHash,
    });
  } finally {
    hashPrototype.update = savedUpdate;
    hashPrototype.digest = savedDigest;
  }
  assert.notEqual(leftSource.principalEpochProjectionHash,
    rightSource.principalEpochProjectionHash);
  assert.notEqual(leftSource.actorSubjectHash, rightSource.actorSubjectHash);
  assert.notEqual(leftSource.sourceHash, rightSource.sourceHash);
  assert.equal(verification.ok, true);
  assert.equal(verification.creditAttributionEstablished, false);
  assert.equal(verification.actionReady, false);
});

test("post-import intrinsic poisoning cannot forge identity, attribution, or radius containment", () => {
  const sourceInput = inputFixture({ actor: "poison-safe" });
  const invalidInput = inputFixture({ actor: "poison-invalid", delegationEdges: [] });
  const parent = radius("poison-parent", ["OBSERVE"]);
  const child = radius("poison-child", ["PHYSICAL_ACTUATE"]);
  invalidInput.delegationEdges = [{
    parent: {
      kind: "PRINCIPAL_EPOCH",
      refHash: principalEpochProjectionHash(invalidInput.principalEpoch),
    },
    child: { kind: "ACCOUNTABLE_DEPLOYMENT", refHash: h("poison-child-actor") },
    parentRadius: parent,
    childRadius: child,
    delegationEvidenceRefHash: h("poison-edge"),
    assurance: assurance("poison-edge"),
  }];

  const saved = {
    every: Array.prototype.every,
    sort: Array.prototype.sort,
    values: Object.values,
    dateParse: Date.parse,
    regexTest: RegExp.prototype.test,
    setHas: Set.prototype.has,
    localeCompare: String.prototype.localeCompare,
  };
  let verification;
  let invalidRejected = false;
  try {
    Array.prototype.every = () => true;
    Array.prototype.sort = () => [];
    Object.values = () => [];
    Date.parse = () => 0;
    RegExp.prototype.test = () => true;
    Set.prototype.has = () => true;
    String.prototype.localeCompare = () => 0;
    const source = createActorIdentityEnvelopeSource(sourceInput);
    const envelope = buildActorIdentityEnvelope(source);
    verification = verifyActorIdentityEnvelope(envelope, {
      source,
      expectedSourceHash: source.sourceHash,
      expectedEnvelopeHash: envelope.actorIdentityEnvelopeHash,
    });
    try {
      createActorIdentityEnvelopeSource(invalidInput);
    } catch {
      invalidRejected = true;
    }
  } finally {
    Array.prototype.every = saved.every;
    Array.prototype.sort = saved.sort;
    Object.values = saved.values;
    Date.parse = saved.dateParse;
    RegExp.prototype.test = saved.regexTest;
    Set.prototype.has = saved.setHas;
    String.prototype.localeCompare = saved.localeCompare;
  }
  assert.equal(verification.ok, true);
  assert.equal(verification.modelAttributionEstablished, false);
  assert.equal(verification.creditAttributionEstablished, false);
  assert.equal(verification.externalAuthorityEstablished, false);
  assert.equal(verification.actionReady, false);
  assert.equal(verification.executable, false);
  assert.equal(invalidRejected, true);
});
