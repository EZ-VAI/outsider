import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  NETWORK_INTAKE_BOUNDARY,
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  createNetworkIntakeManifest,
  networkIntakeDigest,
} from "../src/outsider-network-intake.js";
import {
  OUTSIDER_NETWORK_NODE_ADAPTER_KINDS,
  OUTSIDER_NETWORK_NODE_SDK_BOUNDARY,
  buildOutsiderNetworkNodeConformance,
  createOutsiderNetworkNodeSdkSource,
  verifyOutsiderNetworkNodeConformance,
} from "../src/outsider-network-node-sdk.js";
import {
  buildProviderPatternReviewProjection,
} from "../src/outsider-provider-pattern-registry.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

const REQUIRED = Object.freeze({
  DELEGATION_RESPONSIBILITY: ["ACTOR_IDENTITY", "DELEGATION_RESPONSIBILITY"],
  ACTION_OUTCOME: ["ACTOR_IDENTITY", "COMMAND_EFFECT", "OUTCOME_RECOVERY",
    "OBLIGATION_LIFECYCLE"],
  PROSPECTIVE_CENSUS: ["PROSPECTIVE_CENSUS"],
});

function subject(lane) {
  const materialized = lane !== "PROSPECTIVE_CENSUS";
  return {
    claimHash: h(`claim:${lane}`), wayHash: h(`way:${lane}`),
    worldHash: h(`world:${lane}`),
    episodeHash: materialized ? h(`episode:${lane}`) : null,
    attemptHash: materialized ? h(`attempt:${lane}`) : null,
    actorIdentityEnvelopeHash: materialized ? h(`actor:${lane}`) : null,
    accountableDeploymentSubjectHash: materialized ? h(`deployment:${lane}`) : null,
    attemptActorSubjectHash: materialized ? h(`attempt-actor:${lane}`) : null,
    cohortHash: h(`cohort:${lane}`), censusSlotHash: h(`slot:${lane}`),
  };
}

function payloadForLane(lane, selectedSubject, suffix = "base") {
  if (lane === "DELEGATION_RESPONSIBILITY") {
    return {
      schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS[lane],
      accountableDeploymentSubjectHash: selectedSubject.accountableDeploymentSubjectHash,
      delegationEnvelopeHash: h(`delegation:${suffix}`),
      capabilityRadiusHash: h(`capability:${suffix}`),
      authorityRadiusHash: h(`authority:${suffix}`),
      evidenceRadiusHash: h(`evidence:${suffix}`),
      responsibilityRadiusHash: h(`responsibility:${suffix}`),
      responsibilityCommitmentHash: h(`responsibility-commitment:${suffix}`),
      ownerWriteGateConformanceHash: null,
      authorityEstablished: false,
      responsibilityCoverageEstablished: false,
    };
  }
  if (lane === "ACTION_OUTCOME") {
    return {
      schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS[lane],
      attemptRecordHash: selectedSubject.attemptHash,
      executionEvidenceHash: h(`execution:${suffix}`),
      outcomeEvidenceHash: h(`outcome:${suffix}`),
      obligationStateHash: h(`obligation:${suffix}`),
      sourceArtifactHash: h(`source:${suffix}`),
      sourceReplayReferenceHash: h(`replay:${suffix}`),
      externalOutcomeVerified: false,
      causalAttributionEstablished: false,
      obligationClosed: false,
    };
  }
  return {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS[lane],
    cohortCommitmentHash: selectedSubject.cohortHash,
    censusSlotCommitmentHash: selectedSubject.censusSlotHash,
    eligibilityRuleHash: h(`eligibility:${suffix}`),
    assignmentPolicyHash: h(`assignment:${suffix}`),
    instrumentPlanHash: h(`instrument:${suffix}`),
    preActionRegistrationReferenceHash: h(`registration:${suffix}`),
    externalTimeAnchorHash: null,
    prospectiveRegistrationEstablishedAtNetworkEdge: false,
    scientificCensusCompletenessEstablishedAtNetworkEdge: false,
  };
}

function transportPair(lane) {
  const selectedSubject = subject(lane);
  const payload = payloadForLane(lane, selectedSubject);
  const manifest = createNetworkIntakeManifest({
    lane,
    clientSubmissionId: `node_sdk_${lane.toLowerCase()}`,
    payloadSchema: NETWORK_INTAKE_PAYLOAD_SCHEMAS[lane],
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
  });
  return { payload, manifest };
}

function adapterDeclarations(lane, { allDeclared = false } = {}) {
  return OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.map((kind) => {
    const declared = allDeclared || REQUIRED[lane].includes(kind);
    return {
      kind,
      status: declared ? "DECLARED_UNVERIFIED" : "NOT_APPLICABLE_FOR_LANE",
      artifactSchema: declared ? `outsider/node-adapter-${kind.toLowerCase()}/v1` : null,
      adapterImplementationHash: declared ? h(`implementation:${kind}`) : null,
      conformanceEvidenceRefHash: declared ? h(`conformance:${kind}`) : null,
    };
  }).reverse();
}

function sourceInput(lane = "ACTION_OUTCOME", options = {}) {
  const pair = transportPair(lane);
  return {
    sdkReleaseHash: h("node-sdk-release-1"),
    nodeSoftwareRevisionHash: h(`node-revision:${lane}`),
    providerPatternReview: options.providerPatternReview ?? null,
    networkManifest: pair.manifest,
    payload: pair.payload,
    adapterDeclarations: adapterDeclarations(lane,
      { allDeclared: options.allDeclared === true }),
    nativeSafetyEvidenceRefs: options.nativeSafetyEvidenceRefs ?? [],
  };
}

function build(lane = "ACTION_OUTCOME", options = {}) {
  const input = sourceInput(lane, options);
  const source = createOutsiderNetworkNodeSdkSource(input);
  const conformance = buildOutsiderNetworkNodeConformance(source);
  return { input, source, conformance };
}

test("all three lanes reuse the existing typed subject and remain quarantine-only", () => {
  for (const lane of ["DELEGATION_RESPONSIBILITY", "ACTION_OUTCOME",
    "PROSPECTIVE_CENSUS"]) {
    const fixture = build(lane);
    const checked = verifyOutsiderNetworkNodeConformance(fixture.conformance, {
      source: fixture.source,
      expectedSourceHash: fixture.source.sourceHash,
      expectedConformanceHash: fixture.conformance.conformanceHash,
    });
    assert.equal(checked.ok, true);
    assert.deepEqual(fixture.conformance.networkProjection.typedSubject,
      fixture.source.networkManifest.subject);
    assert.equal(fixture.conformance.networkProjection.lane, lane);
    assert.deepEqual(fixture.conformance.networkProjection.quarantineBoundary,
      NETWORK_INTAKE_BOUNDARY);
    assert.equal(fixture.conformance.coverageDeclaration.totalExplicitAdapterRows, 6);
    assert.equal(fixture.conformance.coverageDeclaration.laneMinimumAdapterReferencesDeclared,
      true);
    assert.equal(fixture.conformance.coverageDeclaration.adapterFunctionalityVerified, false);
    assert.equal(checked.compatibilityOnly, true);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
    assert.equal(checked.executable, false);
    assert.equal(checked.trainingRows, 0);
    assert.equal(checked.causalExperienceUnits, 0);
    assert.deepEqual(checked.boundary, OUTSIDER_NETWORK_NODE_SDK_BOUNDARY);
  }
});

test("six declared adapter references and vendor safety evidence remain unverified claims", () => {
  const nativeSafetyEvidenceRefs = [{
    controlClass: "COLLISION_AVOIDANCE",
    vendorEvidenceRefHash: h("vendor-collision-avoidance-evidence"),
    referenceSemantics: "VENDOR_NATIVE_SAFETY_EVIDENCE_REFERENCE_ONLY",
    effectivenessEstablished: false,
    outsiderAuthorityEstablished: false,
  }, {
    controlClass: "EMERGENCY_STOP",
    vendorEvidenceRefHash: h("vendor-e-stop-evidence"),
    referenceSemantics: "VENDOR_NATIVE_SAFETY_EVIDENCE_REFERENCE_ONLY",
    effectivenessEstablished: false,
    outsiderAuthorityEstablished: false,
  }];
  const providerPatternReview = buildProviderPatternReviewProjection("BRIDGE_AFK");
  const fixture = build("ACTION_OUTCOME", { allDeclared: true,
    nativeSafetyEvidenceRefs, providerPatternReview });
  assert.equal(fixture.conformance.coverageDeclaration.completeEpisodeAdapterSetDeclared, true);
  assert.equal(fixture.conformance.coverageDeclaration.completeEpisodeCaptureVerified, false);
  assert.equal(fixture.conformance.compatibilityChecks.providerPatternReviewReplayed, true);
  assert.equal(fixture.conformance.compatibilityChecks.vendorSafetyEffectivenessEstablished,
    false);
  assert.equal(fixture.conformance.providerPatternReviewRef.entityId, "BRIDGE_AFK");
  assert.equal(fixture.conformance.providerPatternReviewRef.semantics,
    "CONSERVATIVE_REQUIREMENTS_REFERENCE_NOT_CONTROL_OR_COVERAGE_PROOF");
  assert.equal(fixture.conformance.nativeSafetyEvidenceRefs.length, 2);
  assert.equal(fixture.conformance.boundary.vendorSafetyEffectivenessEstablished, false);
  assert.equal(fixture.conformance.boundary.permitsPricing, false);
  assert.equal(fixture.conformance.boundary.permitsGuarantee, false);
  assert.equal(fixture.conformance.boundary.permitsSettlement, false);
});

test("all six adapter rows are explicit and lane-required rows cannot hide behind N/A", () => {
  const missing = sourceInput();
  missing.adapterDeclarations.pop();
  assert.throws(() => createOutsiderNetworkNodeSdkSource(missing),
    /ADAPTER_DECLARATIONS_DENSE_ARRAY_REQUIRED/);

  const duplicate = sourceInput();
  duplicate.adapterDeclarations[0] = structuredClone(duplicate.adapterDeclarations[1]);
  assert.throws(() => createOutsiderNetworkNodeSdkSource(duplicate),
    /ALL_SIX_ADAPTER_ROWS_REQUIRED_EXACTLY_ONCE/);

  const hidden = sourceInput("ACTION_OUTCOME");
  const effect = hidden.adapterDeclarations.find(({ kind }) => kind === "COMMAND_EFFECT");
  effect.status = "NOT_APPLICABLE_FOR_LANE";
  effect.artifactSchema = null;
  effect.adapterImplementationHash = null;
  effect.conformanceEvidenceRefHash = null;
  assert.throws(() => createOutsiderNetworkNodeSdkSource(hidden),
    /REQUIRED_LANE_ADAPTER_CANNOT_BE_NOT_APPLICABLE/);

  const unavailable = sourceInput("ACTION_OUTCOME");
  const outcome = unavailable.adapterDeclarations.find(({ kind }) => kind === "OUTCOME_RECOVERY");
  outcome.status = "NOT_AVAILABLE";
  outcome.artifactSchema = null;
  outcome.adapterImplementationHash = null;
  outcome.conformanceEvidenceRefHash = null;
  const source = createOutsiderNetworkNodeSdkSource(unavailable);
  const conformance = buildOutsiderNetworkNodeConformance(source);
  assert.equal(conformance.coverageDeclaration.laneMinimumAdapterReferencesDeclared, false);
  assert.equal(conformance.compatibilityResult,
    "QUARANTINE_TRANSPORT_COMPATIBLE_ADAPTER_GAPS_DECLARED");
  assert.equal(conformance.decision, "HOLD");
});

test("manifest/payload mismatches and caller-positive native safety claims fail closed", () => {
  const mismatch = sourceInput("ACTION_OUTCOME");
  mismatch.payload.outcomeEvidenceHash = h("different-outcome");
  assert.throws(() => createOutsiderNetworkNodeSdkSource(mismatch),
    /NETWORK_MANIFEST_INVALID/);

  for (const field of ["effectivenessEstablished", "outsiderAuthorityEstablished"]) {
    const positive = sourceInput("ACTION_OUTCOME", { nativeSafetyEvidenceRefs: [{
      controlClass: "EMERGENCY_STOP",
      vendorEvidenceRefHash: h("vendor-e-stop"),
      referenceSemantics: "VENDOR_NATIVE_SAFETY_EVIDENCE_REFERENCE_ONLY",
      effectivenessEstablished: false,
      outsiderAuthorityEstablished: false,
    }] });
    positive.nativeSafetyEvidenceRefs[0][field] = true;
    assert.throws(() => createOutsiderNetworkNodeSdkSource(positive),
      /NATIVE_SAFETY_REFERENCE_MUST_REMAIN_EVIDENCE_ONLY/);
  }
  const semanticPromotion = sourceInput("ACTION_OUTCOME", { nativeSafetyEvidenceRefs: [{
    controlClass: "EMERGENCY_STOP",
    vendorEvidenceRefHash: h("vendor-e-stop"),
    referenceSemantics: "PROVEN_EFFECTIVE_CONTROL",
    effectivenessEstablished: false,
    outsiderAuthorityEstablished: false,
  }] });
  assert.throws(() => createOutsiderNetworkNodeSdkSource(semanticPromotion),
    /NATIVE_SAFETY_REFERENCE_MUST_REMAIN_EVIDENCE_ONLY/);
});

test("accessors and proxies are rejected without invoking attacker code", () => {
  let invoked = 0;
  const accessor = sourceInput();
  Object.defineProperty(accessor.adapterDeclarations[0], "trap", {
    enumerable: true,
    get() { invoked += 1; return false; },
  });
  assert.throws(() => createOutsiderNetworkNodeSdkSource(accessor), /ACCESSOR_FORBIDDEN/);
  assert.equal(invoked, 0);

  const proxied = sourceInput();
  proxied.nativeSafetyEvidenceRefs = [new Proxy({}, {
    get() { invoked += 1; return false; },
  })];
  assert.throws(() => createOutsiderNetworkNodeSdkSource(proxied), /PROXY_FORBIDDEN/);
  assert.equal(invoked, 0);

  const accessorSource = structuredClone(build().source);
  Object.defineProperty(accessorSource, "sourceHash", {
    enumerable: true,
    get() { invoked += 1; return h("accessor-source-hash"); },
  });
  assert.throws(() => buildOutsiderNetworkNodeConformance(accessorSource),
    /ACCESSOR_FORBIDDEN/);
  assert.equal(invoked, 0);

  const fixture = build();
  const poisonedRecord = structuredClone(fixture.conformance);
  Object.defineProperty(poisonedRecord, "trap", {
    enumerable: true,
    get() { invoked += 1; return false; },
  });
  assert.equal(verifyOutsiderNetworkNodeConformance(poisonedRecord, {
    source: fixture.source,
    expectedSourceHash: fixture.source.sourceHash,
    expectedConformanceHash: fixture.conformance.conformanceHash,
  }).ok, false);
  assert.equal(invoked, 0);
});

test("self-rehash and coordinated source replacement cannot escape expected external roots", () => {
  const fixture = build();
  const selfRehash = structuredClone(fixture.conformance);
  selfRehash.networkProjection.typedSubject.claimHash = h("attacker-claim");
  const body = { ...selfRehash };
  delete body.conformanceHash;
  selfRehash.conformanceHash = networkIntakeDigest(
    "outsider/network-node-sdk-conformance/v1", body);
  assert.equal(verifyOutsiderNetworkNodeConformance(selfRehash, {
    source: fixture.source,
    expectedSourceHash: fixture.source.sourceHash,
    expectedConformanceHash: selfRehash.conformanceHash,
  }).ok, false);

  const replacementInput = sourceInput();
  replacementInput.nodeSoftwareRevisionHash = h("attacker-replacement-node");
  const replacementSource = createOutsiderNetworkNodeSdkSource(replacementInput);
  const replacementConformance = buildOutsiderNetworkNodeConformance(replacementSource);
  assert.equal(verifyOutsiderNetworkNodeConformance(replacementConformance, {
    source: replacementSource,
    expectedSourceHash: fixture.source.sourceHash,
    expectedConformanceHash: replacementConformance.conformanceHash,
  }).ok, false);
});

test("captured intrinsics preserve exact normalization after prototype replacement", () => {
  const input = sourceInput();
  const originalSort = Array.prototype.sort;
  const originalDescriptors = Object.getOwnPropertyDescriptors;
  const originalParse = JSON.parse;
  let source;
  try {
    Array.prototype.sort = () => [];
    Object.getOwnPropertyDescriptors = () => ({});
    JSON.parse = () => ({ poisoned: true });
    source = createOutsiderNetworkNodeSdkSource(input);
  } finally {
    Array.prototype.sort = originalSort;
    Object.getOwnPropertyDescriptors = originalDescriptors;
    JSON.parse = originalParse;
  }
  const conformance = buildOutsiderNetworkNodeConformance(source);
  assert.equal(verifyOutsiderNetworkNodeConformance(conformance, {
    source,
    expectedSourceHash: source.sourceHash,
    expectedConformanceHash: conformance.conformanceHash,
  }).ok, true);
  assert.equal(Object.isFrozen(source), true);
  assert.equal(Object.isFrozen(source.adapterDeclarations), true);
  assert.equal(Object.isFrozen(conformance.networkProjection.typedSubject), true);
});
