import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_BOUNDARY,
  captureEpisodeAttemptSetExternalHeadCandidateV1,
  createEpisodeAttemptSetExternalHeadCandidateRequestV1,
  verifyEpisodeAttemptSetExternalHeadCandidateV1,
} from "../src/outsider-episode-attempt-set-external-head-candidate-v1.js";
import {
  createAutonomousWorkOrderStage1EngineeringIntegrationFixture,
} from "./helpers/outsider-autonomous-work-order-stage1-engineering-integration-fixture.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;

function build(t, suffix = "alpha") {
  const fixture = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
  const localHead = fixture.context.localAttemptSet;
  const request = createEpisodeAttemptSetExternalHeadCandidateRequestV1({
    localHead,
    requestedAt: "2026-09-01T00:03:00.000Z",
  });
  const artifactBytes = Buffer.from(JSON.stringify({
    fixture: `opaque-${suffix}`,
    requestHash: request.requestHash,
    callerSuppliedOnly: true,
  }), "utf8");
  const candidate = captureEpisodeAttemptSetExternalHeadCandidateV1({
    request,
    artifactBytes,
    artifactMediaType: "application/json",
    receivedAtLocallyObserved: "2026-09-01T00:03:01.000Z",
  });
  const context = {
    localHead,
    expectedRequestHash: request.requestHash,
    expectedCandidateHash: candidate.candidateHash,
  };
  return { fixture, localHead, request, artifactBytes, candidate, context };
}

test("v1 request binds only the local-head subject digest and is not publishable", (t) => {
  const { fixture, localHead, request } = build(t);
  assert.equal(request.requestClass,
    "LOCAL_HEAD_DIGEST_ONLY_FUTURE_EXTERNAL_ACQUISITION_REQUEST_HOLD_ONLY");
  assert.equal(request.requestedAtIsExternalTimeEvidence, false);
  assert.equal(request.subject.digestHex,
    localHead.expectedLocalHeadHash.slice("sha256:".length));
  assert.equal(request.localReplayScope
    .fullAncestryReplayVerifiedInOneObservedLocalRegistry,
    true);
  assert.equal(request.localReplayScope.oneObservedLocalRegistryOnly, true);
  assert.equal(request.localReplayScope.localHeadOnly, true);
  assert.equal(request.disclosure.digestOnly, true);
  assert.equal(request.disclosure.onlySubjectDigestIncluded, true);
  assert.equal(request.disclosure.registryIdIncluded, false);
  assert.equal(request.disclosure.registryIdHashIncluded, false);
  assert.equal(request.disclosure.directoryPathIncluded, false);
  assert.equal(request.disclosure.entryBytesIncluded, false);
  assert.equal(request.disclosure.additionalLocalHeadHashesIncluded, false);
  assert.equal(request.disclosure.localHeadCountsIncluded, false);
  assert.equal(request.requestPublicationNetworkSafe, false);
  assert.equal(request.providerProfileSelected, false);
  assert.equal(request.trustPolicySelected, false);
  assert.equal(request.networkSubmissionPerformed, false);
  assert.equal(request.externalFacts.independentPinProvenanceEstablished, false);
  assert.equal(request.externalFacts.externalHeadPinVerified, false);
  assert.equal(request.externalFacts.nonEquivocationEstablished, false);
  assert.equal(request.decisionState, "HOLD");
  assert.equal(request.authority, "NONE");
  const encoded = JSON.stringify(request);
  assert.equal(encoded.includes(localHead.directory), false);
  assert.equal(encoded.includes(localHead.registryId), false);
  assert.equal(encoded.includes(fixture.attemptSet.head.episodeBinding.episodeHash), false);
  assert.equal(encoded.includes(fixture.attemptSet.appended.head.headEntryHash), false);
  assert.equal(encoded.includes(fixture.attemptSet.appended.head.entrySetRoot), false);
  assert.equal(Object.hasOwn(request, "headBinding"), false);
  assert.equal(Object.hasOwn(request.localReplayScope, "registryIdHash"), false);
  assert.equal(Object.hasOwn(request.localReplayScope, "episodeHash"), false);
  assert.equal(Object.hasOwn(request.localReplayScope, "entryCount"), false);
  assert.equal(Object.hasOwn(request.localReplayScope, "attemptCount"), false);
  assert.equal(Object.hasOwn(request.localReplayScope, "reportOccurrenceCount"), false);
  assert.equal(request.useBoundary.registryIdHashProjected, false);
  assert.equal(request.useBoundary.additionalLocalHeadHashesProjected, false);
  assert.equal(request.useBoundary.localHeadCountsProjected, false);
  assert.equal(request.useBoundary.requestPublicationNetworkSafe, false);
  assert.equal(request.useBoundary,
    EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_BOUNDARY);
});

test("exact opaque candidate bytes replay but establish no external fact", (t) => {
  const { artifactBytes, candidate, context } = build(t);
  assert.equal(candidate.artifact.byteLength, artifactBytes.length);
  assert.equal(Buffer.from(candidate.artifact.bytesBase64, "base64")
    .equals(artifactBytes), true);
  assert.equal(candidate.artifact.exactBytesEncodedInRecord, true);
  assert.equal(candidate.artifact.callerMustTreatRecordAsPrivate, true);
  assert.equal(candidate.artifact.privateStoragePermissionsEstablished, false);
  assert.equal(candidate.artifact.networkProjectionPermitted, false);
  assert.equal(candidate.intakeSource.acquisitionClass, "CALLER_SUPPLIED_BYTES");
  assert.equal(candidate.intakeSource.networkTransportObservedByThisModule, false);
  assert.equal(candidate.intakeSource.providerResponseEstablished, false);
  assert.equal(candidate.intakeSource.independentAcquisitionEstablished, false);
  assert.equal(candidate.receivedAtIsExternalTimeEvidence, false);
  assert.equal(candidate.privateStoragePermissionsEstablished, false);
  assert.equal(candidate.candidatePublicationNetworkSafe, false);
  assert.equal(candidate.externalFacts.durableExternalHeadEstablished, false);

  const verified = verifyEpisodeAttemptSetExternalHeadCandidateV1(candidate, context);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.localHeadFreshFullAncestryReplayVerified, true);
  assert.equal(verified.requestRebuiltFromFreshLocalHead, true);
  assert.equal(verified.exactCandidateArtifactBytesReplayed, true);
  assert.equal(verified.artifactByteHashMatched, true);
  assert.equal(verified.rawArtifactBytesProjected, false);
  assert.equal(verified.artifactReferenceFieldsPrivateOnly, true);
  assert.equal(verified.artifactReferenceFieldsNetworkProjectionPermitted, false);
  assert.equal(verified.verificationPublicationNetworkSafe, false);
  assert.equal(verified.privateStoragePermissionsEstablished, false);
  assert.equal(verified.directoryPathProjected, false);
  assert.equal(verified.registryIdProjected, false);
  assert.equal(verified.transportOrNetworkPerformed, false);
  assert.equal(verified.artifactRepresentsProviderResponseEstablished, false);
  assert.equal(verified.cryptographicSubjectBindingVerified, false);
  assert.equal(verified.independentlyObtainedArtifactBytesEstablished, false);
  assert.equal(verified.independentlySourcedTrustPolicyEstablished, false);
  assert.equal(verified.independentPinProvenanceEstablished, false);
  assert.equal(verified.externalHeadPinVerified, false);
  assert.equal(verified.externalAnchorEstablished, false);
  assert.equal(verified.nonEquivocationEstablished, false);
  assert.equal(verified.durableExternalHeadEstablished, false);
  assert.equal(verified.stage1EngineeringGatePassed, false);
  assert.equal(verified.stage1Complete, false);
  assert.equal(verified.stage2Permitted, false);
  assert.equal(verified.enabledCapabilityCount, 0);
  assert.equal(verified.provenAuthorityCount, 0);
  assert.equal(verified.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(verified.consequenceReach, "NONE");
});

test("same exact bytes and local observation are deterministic but still caller supplied", (t) => {
  const { request, artifactBytes, candidate } = build(t);
  const repeated = captureEpisodeAttemptSetExternalHeadCandidateV1({
    request,
    artifactBytes,
    artifactMediaType: "application/json",
    receivedAtLocallyObserved: candidate.receivedAtLocallyObserved,
  });
  assert.deepEqual(repeated, candidate);
  assert.equal(repeated.intakeSource.transportProvenanceEstablished, false);
  assert.equal(repeated.intakeSource.trustPolicyProvenanceEstablished, false);
  assert.equal(repeated.externalFacts.independentPinProvenanceEstablished, false);
});

test("caller cannot inject trust, provider, transport, or positive external facts", (t) => {
  const { request, artifactBytes, candidate, context } = build(t);
  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    request,
    artifactBytes,
    artifactMediaType: "application/json",
    receivedAtLocallyObserved: "2026-09-01T00:03:01.000Z",
    trustPolicyHash: h("caller-trust-policy"),
  }), /CAPTURE_INPUT_FIELDS_INVALID/u);

  const linkable = structuredClone(request);
  linkable.registryIdHash = h("caller-registry-id");
  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    request: linkable,
    artifactBytes,
    artifactMediaType: "application/json",
    receivedAtLocallyObserved: "2026-09-01T00:03:01.000Z",
  }), /REQUEST_FIELDS_INVALID/u);

  const positive = structuredClone(candidate);
  positive.externalFacts.independentPinProvenanceEstablished = true;
  const rejected = verifyEpisodeAttemptSetExternalHeadCandidateV1(positive, context);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error,
    /^EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_/u);
  assert.equal(rejected.independentPinProvenanceEstablished, false);
  assert.equal(rejected.externalHeadPinVerified, false);
  assert.equal(rejected.nonEquivocationEstablished, false);
  assert.equal(rejected.stage2Permitted, false);
});

test("artifact substitution and caller-pin substitution fail closed", (t) => {
  const { candidate, context } = build(t);
  const byteSwap = structuredClone(candidate);
  byteSwap.artifact.bytesBase64 = Buffer.from("substituted", "utf8").toString("base64");
  const badBytes = verifyEpisodeAttemptSetExternalHeadCandidateV1(byteSwap, context);
  assert.equal(badBytes.ok, false);
  assert.equal(badBytes.exactCandidateArtifactBytesReplayed, false);
  assert.equal(badBytes.independentPinProvenanceEstablished, false);

  const badPin = verifyEpisodeAttemptSetExternalHeadCandidateV1(candidate, {
    ...context,
    expectedCandidateHash: h("caller-replacement-pin"),
  });
  assert.equal(badPin.ok, false);
  assert.match(badPin.error, /EXPECTED_HASH_MISMATCH/u);
  assert.equal(badPin.durableExternalHeadEstablished, false);
});

test("stale or unrelated local head context cannot replay the candidate", (t) => {
  const { candidate, context, localHead } = build(t);
  const rejected = verifyEpisodeAttemptSetExternalHeadCandidateV1(candidate, {
    ...context,
    localHead: {
      ...localHead,
      expectedLocalHeadHash: h("unrelated-local-head"),
    },
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /LOCAL_HEAD_V2_FRESH_REPLAY_FAILED/u);
  assert.equal(rejected.requestRebuiltFromFreshLocalHead, false);
  assert.equal(rejected.externalHeadPinVerified, false);
  assert.equal(rejected.stage1Complete, false);
});

test("capture time is local-only and cannot precede request creation", (t) => {
  const { request, artifactBytes } = build(t);
  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    request,
    artifactBytes,
    artifactMediaType: "application/json",
    receivedAtLocallyObserved: "2026-09-01T00:02:59.000Z",
  }), /LOCAL_CAPTURE_PRECEDES_REQUEST/u);
});

test("failure output redacts directory and untrusted exception details", (t) => {
  const { candidate, context, localHead } = build(t);
  const failure = verifyEpisodeAttemptSetExternalHeadCandidateV1(candidate, {
    ...context,
    localHead: {
      ...localHead,
      directory: `${localHead.directory}/does-not-exist/private-secret`,
    },
  });
  assert.equal(failure.ok, false);
  assert.equal(JSON.stringify(failure).includes(localHead.directory), false);
  assert.equal(failure.rawArtifactBytesProjected, false);
  assert.equal(failure.directoryPathProjected, false);

  const accessor = {};
  Object.defineProperty(accessor, "localHead", {
    enumerable: true,
    get() { throw new Error("PRIVATE_ACCESSOR_SECRET"); },
  });
  const poisoned = verifyEpisodeAttemptSetExternalHeadCandidateV1(candidate, accessor);
  assert.equal(poisoned.ok, false);
  assert.equal(poisoned.error.includes("PRIVATE_ACCESSOR_SECRET"), false);
  assert.equal(poisoned.independentPinProvenanceEstablished, false);
});

test("pre-descriptor budgets reject wide, long, over-arrayed, and scalar-heavy input", () => {
  const base = {
    artifactBytes: Buffer.from("x", "utf8"),
    artifactMediaType: "application/json",
    receivedAtLocallyObserved: "2026-09-01T00:03:01.000Z",
  };
  const tooWide = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [
    `field${index}`,
    null,
  ]));
  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    ...base,
    request: tooWide,
  }), /VALUE_OBJECT_OWN_KEY_BUDGET_EXCEEDED/u);

  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    ...base,
    request: new Array(10_001).fill(null),
  }), /VALUE_ARRAY_LENGTH_BUDGET_EXCEEDED/u);

  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    ...base,
    request: "x".repeat(6 * 1024 * 1024 + 1),
  }), /VALUE_STRING_TOO_LARGE/u);

  const scalarHeavy = [new Array(9_000).fill(null),
    new Array(9_000).fill(null), new Array(9_000).fill(null)];
  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    ...base,
    request: scalarHeavy,
  }), /VALUE_SCALAR_BUDGET_EXCEEDED/u);

  const topLevelWide = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [
    `field${index}`,
    null,
  ]));
  const rejected = verifyEpisodeAttemptSetExternalHeadCandidateV1(topLevelWide, {});
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /VALUE_TOP_LEVEL_OWN_KEY_BUDGET_EXCEEDED/u);
  assert.equal(rejected.independentPinProvenanceEstablished, false);
});

test("canonical-byte budget runs before semantic request validation", (t) => {
  const { request, artifactBytes } = build(t);
  const oversized = structuredClone(request);
  // Stay within each scalar limit while exceeding the total canonical bytes.
  oversized.requestClass = Array.from({length: 10}, () => "a".repeat(900_000));
  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    request: oversized,
    artifactBytes,
    artifactMediaType: "application/json",
    receivedAtLocallyObserved: "2026-09-01T00:03:01.000Z",
  }), /CANONICAL_BYTE_BUDGET_EXCEEDED/u);
});

test("Buffer own length accessor is rejected without invoking it", (t) => {
  const { request } = build(t);
  const poisoned = Buffer.from("opaque-candidate", "utf8");
  let getterCalls = 0;
  Object.defineProperty(poisoned, "length", {
    configurable: true,
    enumerable: false,
    get() {
      getterCalls += 1;
      throw new Error("PRIVATE_BUFFER_LENGTH_SECRET");
    },
  });
  assert.throws(() => captureEpisodeAttemptSetExternalHeadCandidateV1({
    request,
    artifactBytes: poisoned,
    artifactMediaType: "application/json",
    receivedAtLocallyObserved: "2026-09-01T00:03:01.000Z",
  }), /VALUE_BUFFER_SHAPE_INVALID/u);
  assert.equal(getterCalls, 0);
});

test("failure sanitizer ignores poisoned Error @@hasInstance and proxy details", () => {
  const previous = Object.getOwnPropertyDescriptor(Error, Symbol.hasInstance);
  Object.defineProperty(Error, Symbol.hasInstance, {
    configurable: true,
    value() {
      throw new Error("PRIVATE_HAS_INSTANCE_SECRET");
    },
  });
  let failure;
  try {
    failure = verifyEpisodeAttemptSetExternalHeadCandidateV1(
      new Proxy(new Error("PRIVATE_PROXY_ERROR_SECRET"), {}), {});
  } finally {
    if (previous === undefined) delete Error[Symbol.hasInstance];
    else Object.defineProperty(Error, Symbol.hasInstance, previous);
  }
  assert.equal(failure.ok, false);
  assert.match(failure.error,
    /^EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_[A-Z0-9_:]+$/u);
  assert.equal(failure.error.includes("PRIVATE_HAS_INSTANCE_SECRET"), false);
  assert.equal(failure.error.includes("PRIVATE_PROXY_ERROR_SECRET"), false);
  assert.equal(failure.independentPinProvenanceEstablished, false);
  assert.equal(failure.stage2Permitted, false);
});
