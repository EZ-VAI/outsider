import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { after, before, test } from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  ANCHOR_OPERATOR_RELATIONSHIPS,
  EXTERNAL_ANCHOR_PROFILES,
  createExternalAnchorTrustPolicy,
} from "../src/outsider-external-anchor.js";
import {
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY,
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_PROOF_MATRIX,
  captureEpisodeAttemptSetExternalWitnessCandidateV2,
  createEpisodeAttemptSetExternalWitnessRequestV2,
  createEpisodeAttemptSetExternalWitnessTransportPolicyV2,
  verifyEpisodeAttemptSetExternalWitnessCandidateV2,
} from "../src/outsider-episode-attempt-set-external-witness-v2.js";
import {
  createAutonomousWorkOrderStage1EngineeringIntegrationFixture,
} from "./helpers/outsider-autonomous-work-order-stage1-engineering-integration-fixture.js";

const REQUESTED_AT = "2026-09-01T00:04:00.000Z";
const RECEIVED_AT = "2026-09-01T00:04:01.000Z";
const ENDPOINT = "https://rekor-attempt-witness.fixture.test";
const PROVIDER_ID = "rekor-attempt-witness.fixture.test";
const LOG_ORIGIN = "rekor-attempt-witness.fixture.test";
const WITNESS_NAME = "checkpoint-witness.fixture.test";
const WITNESS_OPERATOR_ID = "checkpoint-witness-operator.fixture.test";
const PROOF_MEDIA_TYPE = "application/vnd.outsider.transport-proof+json";

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest();
}

function h(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${sha256Bytes(bytes).toString("hex")}`;
}

function ed25519Pair() {
  const pair = generateKeyPairSync("ed25519");
  const publicDer = pair.publicKey.export({ type: "spki", format: "der" });
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  assert.equal(publicDer.subarray(0, prefix.length).equals(prefix), true);
  return {
    privateKey: pair.privateKey,
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }),
    rawPublicKey: publicDer.subarray(prefix.length),
  };
}

function checkpointKeyId(name, discriminator, rawPublicKey) {
  return sha256Bytes(Buffer.concat([
    Buffer.from(`${name}\n`, "utf8"), Buffer.from([discriminator]), rawPublicKey,
  ]));
}

function signedCheckpoint(root, log, witness) {
  const noteText = `${LOG_ORIGIN}\n1\n${root.toString("base64")}\n`;
  const logId = checkpointKeyId(LOG_ORIGIN, 0x01, log.rawPublicKey);
  const logSignature = Buffer.concat([
    logId.subarray(0, 4), sign(null, Buffer.from(noteText, "utf8"), log.privateKey),
  ]).toString("base64");
  const witnessId = checkpointKeyId(WITNESS_NAME, 0x04, witness.rawPublicKey);
  const timestamp = 1788221041n;
  const timestampBytes = Buffer.alloc(8);
  timestampBytes.writeBigUInt64BE(timestamp);
  const witnessMessage = Buffer.from(
    `cosignature/v1\ntime ${timestamp}\n${noteText}`, "utf8");
  const witnessSignature = Buffer.concat([
    witnessId.subarray(0, 4), timestampBytes,
    sign(null, witnessMessage, witness.privateKey),
  ]).toString("base64");
  return {
    envelope:
      `${noteText}\n— ${LOG_ORIGIN} ${logSignature}\n— ${WITNESS_NAME} ${witnessSignature}\n`,
    logId,
  };
}

function rekorArtifact(request, log, witness) {
  const issuer = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const issuerPublicDer = issuer.publicKey.export({ type: "spki", format: "der" });
  const subjectBytes = Buffer.from(request.subject.digestHex, "hex");
  const canonicalizedBody = Buffer.from(canonicalizeStrict({
    apiVersion: "0.0.2",
    kind: "hashedrekord",
    spec: {
      hashedRekordV002: {
        data: {
          algorithm: "SHA2_256",
          digest: subjectBytes.toString("base64"),
        },
        signature: {
          content: sign("sha256", subjectBytes, issuer.privateKey).toString("base64"),
          verifier: {
            keyDetails: "PKIX_ECDSA_P256_SHA_256",
            publicKey: {
              rawBytes: issuerPublicDer.toString("base64"),
            },
          },
        },
      },
    },
  }), "utf8");
  const root = sha256Bytes(Buffer.concat([Buffer.from([0x00]), canonicalizedBody]));
  const checkpoint = signedCheckpoint(root, log, witness);
  return Buffer.from(JSON.stringify({
    canonicalizedBody: canonicalizedBody.toString("base64"),
    inclusionProof: {
      checkpoint: { envelope: checkpoint.envelope },
      hashes: [],
      logIndex: "0",
      rootHash: root.toString("base64"),
      treeSize: "1",
    },
    kindVersion: { kind: "hashedrekord", version: "0.0.2" },
    logId: { keyId: checkpoint.logId.toString("base64") },
    logIndex: "0",
  }), "utf8");
}

const cleanup = [];
let baseline;

before(() => {
  const fixture = createAutonomousWorkOrderStage1EngineeringIntegrationFixture({
    after(callback) { cleanup.push(callback); },
  });
  const log = ed25519Pair();
  const witness = ed25519Pair();
  const trustPolicy = createExternalAnchorTrustPolicy({
    providerId: PROVIDER_ID,
    operatorRelationship: ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER,
    profile: EXTERNAL_ANCHOR_PROFILES.REKOR_V2,
    endpointOrigin: ENDPOINT,
    relationshipEvidenceHash: h("synthetic-provider-relationship-claim"),
    trustMaterial: {
      kind: "REKOR_V2_CHECKPOINT_TRUST",
      origin: LOG_ORIGIN,
      logPublicKeyPem: log.publicKeyPem,
      witnesses: [{
        name: WITNESS_NAME,
        operatorId: WITNESS_OPERATOR_ID,
        operatorRelationship: ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER,
        relationshipEvidenceHash: h("synthetic-witness-relationship-claim"),
        publicKeyPem: witness.publicKeyPem,
      }],
    },
    independentWitnessQuorum: 1,
  });
  const transportPolicy
    = createEpisodeAttemptSetExternalWitnessTransportPolicyV2({
      endpointOrigin: ENDPOINT,
      opaqueTransportProofMediaType: PROOF_MEDIA_TYPE,
    });
  const localHead = fixture.context.localAttemptSet;
  const request = createEpisodeAttemptSetExternalWitnessRequestV2({
    localHead,
    requestedAt: REQUESTED_AT,
    trustPolicy,
    expectedTrustPolicyHash: trustPolicy.policyHash,
    transportPolicy,
    expectedTransportPolicyHash: transportPolicy.policyHash,
  });
  const artifactBytes = rekorArtifact(request, log, witness);
  const transportProofBytes = Buffer.from(canonicalizeStrict({
    fixtureOnly: true,
    endpointOrigin: ENDPOINT,
    requestHash: request.externalAnchorRequest.requestHash,
    artifactByteHash: h(artifactBytes),
    callerSuppliedOpaqueCapture: true,
  }), "utf8");
  const candidate = captureEpisodeAttemptSetExternalWitnessCandidateV2({
    request,
    providerId: PROVIDER_ID,
    anchorArtifactBytes: artifactBytes,
    receivedAtLocallyObserved: RECEIVED_AT,
    transportProofBytes,
    transportProofMediaType: PROOF_MEDIA_TYPE,
  });
  const context = {
    localHead,
    trustPolicy,
    expectedTrustPolicyHash: trustPolicy.policyHash,
    transportPolicy,
    expectedTransportPolicyHash: transportPolicy.policyHash,
    expectedRequestHash: request.requestHash,
    expectedCandidateHash: candidate.candidateHash,
    expectedAnchorEvidenceHash: candidate.externalAnchorEvidence.evidenceHash,
    expectedTransportProofByteHash: candidate.transportCapture.proof.byteHash,
  };
  baseline = { fixture, trustPolicy, transportPolicy, localHead, request,
    artifactBytes, transportProofBytes, candidate, context };
});

after(() => {
  for (let index = cleanup.length - 1; index >= 0; index -= 1) cleanup[index]();
});

test("v2 privately binds the complete replayed head and every exact entry byte commitment",
  () => {
    const { request, localHead } = baseline;
    assert.equal(request.headBinding.localHeadHash, localHead.expectedLocalHeadHash);
    assert.equal(request.headBinding.localHeadVerificationHash.startsWith("sha256:"), true);
    assert.equal(request.headBinding.entryByteCommitments.length,
      request.headBinding.entryCount);
    assert.equal(request.headBinding.fullAncestryReplayVerified, true);
    assert.equal(request.headBinding.everyStoredV1CompositionDerivationVerified, true);
    assert.equal(request.headBinding.everyStoredV1ImmediatePrefixVerified, true);
    assert.equal(request.headBinding.exactStoredEntrySetReplayed, true);
    assert.equal(request.headBinding.twoPassEntrySnapshotStabilityVerified, true);
    assert.equal(request.subject.headBindingHash, request.headBinding.headBindingHash);
    assert.equal(request.externalAnchorRequest.anchorCommitmentHash,
      request.headBinding.headBindingHash);
    assert.equal(request.externalAnchorRequest.anchorPolicyHash,
      baseline.trustPolicy.policyHash);
    assert.equal(request.externalAnchorRequest.subjectDigest.digestHex,
      request.headBinding.headBindingHash.slice("sha256:".length));
    assert.equal(request.transportPolicyBinding.endpointPath,
      "/api/v2/log/entries");
    assert.equal(request.transportPolicyBinding.endpointUrl,
      `${ENDPOINT}/api/v2/log/entries`);
    assert.equal(request.disclosure.headBindingIncludedInExternalWire, false);
    assert.equal(request.disclosure.entryByteCommitmentsIncludedInExternalWire, false);
    assert.equal(request.disclosure.entryOrCompositionBytesIncludedInExternalWire, false);
    assert.equal(request.requestPublicationNetworkSafe, false);
    assert.equal(request.networkSubmissionPerformed, false);
    assert.deepEqual(
      EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_PROOF_MATRIX
        .attemptSetExternalWitnessV2.stillDoesNotProve,
      [
        "INDEPENDENTLY_SOURCED_TRUST_OR_ACQUISITION",
        "OPERATOR_OR_WITNESS_RELATIONSHIP_INDEPENDENCE",
        "CROSS_CHECKPOINT_CONSISTENCY_SPLIT_VIEW_EXCLUSION_OR_NON_EQUIVOCATION",
        "DURABLE_EXTERNAL_HEAD_STAGE1_GATE_OR_STAGE2_PERMISSION",
      ]);
  });

test("exact policies and synthetic Rekor checkpoint/cosignature replay remain PARTIAL/HOLD",
  () => {
    const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
      baseline.candidate, baseline.context);
    assert.equal(report.ok, true, report.error);
    assert.equal(report.localHeadFreshFullAncestryReplayVerified, true);
    assert.equal(report.everyEntryByteCommitmentBoundAndReplayed, true);
    assert.equal(report.completeHeadVectorBoundAndReplayed, true);
    assert.equal(report.exactTrustPolicyReplayed, true);
    assert.equal(report.exactTransportPolicyReplayed, true);
    assert.equal(report.exactAnchorArtifactBytesReplayed, true);
    assert.equal(report.exactTransportProofBytesReplayed, true);
    assert.equal(report.anchorArtifactDigestInSignedCheckpointVerifiedUnderCallerPolicy, true);
    assert.equal(report.signedCheckpointVerifiedUnderCallerPolicy, true);
    assert.equal(report.checkpointCosignatureQuorumCryptographicallyVerified, true);
    assert.equal(report.checkpointCosignaturesVerified, 1);
    assert.equal(report.transportProofCryptographicVerificationPerformed, false);
    assert.equal(report.networkOrTransportPerformed, false);
    assert.equal(report.callerPinsAcceptedAsExternalProvenance, false);
    assert.equal(report.operatorSelfSignatureAcceptedAsIndependentWitness, false);
    assert.equal(report.singleTimestampAcceptedAsNonEquivocationProof, false);
    assert.equal(report.singleSignedCheckpointAcceptedAsNonEquivocationProof, false);
    assert.equal(report.checkpointCosignatureCountAcceptedAsWitnessIndependenceProof, false);
    assert.equal(report.independentlySourcedTrustPolicyEstablished, false);
    assert.equal(report.transportProvenanceEstablished, false);
    assert.equal(report.hashedRekordIssuerSignatureVerified, false);
    assert.equal(report.sigstoreTufTrustedRootReplayVerified, false);
    assert.equal(report.sigstoreSigningConfigReplayVerified, false);
    assert.equal(report.publicProviderInteroperabilityObserved, false);
    assert.equal(report.publicProviderLiveArtifactEstablished, false);
    assert.equal(report.providerAuthenticatedExistenceTimeEstablished, false);
    assert.equal(report.providerProofTimeVerified, false);
    assert.equal(report.independentWitnessEstablished, false);
    assert.equal(report.longTermMonitoringEstablished, false);
    assert.equal(report.crossCheckpointConsistencyVerified, false);
    assert.equal(report.splitViewExcluded, false);
    assert.equal(report.nonEquivocationEstablished, false);
    assert.equal(report.externalHeadPinVerified, false);
    assert.equal(report.externalAnchorEstablished, false);
    assert.equal(report.durableExternalHeadEstablished, false);
    assert.equal(report.stage1EngineeringGatePassed, false);
    assert.equal(report.stage1ExternalFactGatePassed, false);
    assert.equal(report.stage1Complete, false);
    assert.equal(report.stage2Permitted, false);
    assert.equal(report.status, "PARTIAL");
    assert.equal(report.decisionState, "HOLD");
    assert.equal(report.authority, "NONE");
    assert.equal(report.boundary, EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY);
  });

test("raw anchor and transport bytes remain exact, private, and unprojected", () => {
  const { candidate, artifactBytes, transportProofBytes } = baseline;
  assert.equal(Buffer.from(candidate.externalAnchorEvidence.artifact.bytesBase64,
    "base64").equals(artifactBytes), true);
  assert.equal(Buffer.from(candidate.transportCapture.proof.bytesBase64,
    "base64").equals(transportProofBytes), true);
  assert.equal(candidate.rawAnchorArtifactPrivateOnly, true);
  assert.equal(candidate.rawTransportProofPrivateOnly, true);
  assert.equal(candidate.privateStoragePermissionsEstablished, false);
  assert.equal(candidate.candidatePublicationNetworkSafe, false);
  assert.equal(candidate.transportCapture.proof.networkProjectionPermitted, false);
  assert.equal(candidate.transportCapture.transportProvenanceEstablished, false);
  assert.equal(candidate.transportCapture.endpointUrl,
    `${ENDPOINT}/api/v2/log/entries`);
  assert.equal(candidate.transportCapture.providerResponseEstablished, false);
});

test("caller policy, transport, evidence, proof, request, and candidate pins are all exact",
  () => {
    const attacks = [
      { expectedTrustPolicyHash: h("wrong-trust-policy") },
      { expectedTransportPolicyHash: h("wrong-transport-policy") },
      { expectedRequestHash: h("wrong-request") },
      { expectedCandidateHash: h("wrong-candidate") },
      { expectedAnchorEvidenceHash: h("wrong-evidence") },
      { expectedTransportProofByteHash: h("wrong-transport-proof") },
    ];
    for (const override of attacks) {
      const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
        baseline.candidate, { ...baseline.context, ...override });
      assert.equal(report.ok, false);
      assert.equal(report.externalHeadPinVerified, false);
      assert.equal(report.nonEquivocationEstablished, false);
      assert.equal(report.stage1Complete, false);
      assert.equal(report.stage2Permitted, false);
    }
  });

test("artifact, transport proof, and embedded head-binding splices fail closed", () => {
  const artifactSplice = structuredClone(baseline.candidate);
  const artifact = Buffer.from(artifactSplice.externalAnchorEvidence.artifact.bytesBase64,
    "base64");
  artifact[artifact.length - 2] ^= 1;
  artifactSplice.externalAnchorEvidence.artifact.bytesBase64 = artifact.toString("base64");
  const proofSplice = structuredClone(baseline.candidate);
  const proof = Buffer.from(proofSplice.transportCapture.proof.bytesBase64, "base64");
  proof[0] ^= 1;
  proofSplice.transportCapture.proof.bytesBase64 = proof.toString("base64");
  const bindingSplice = structuredClone(baseline.candidate);
  bindingSplice.request.headBinding.attemptCount += 1;
  for (const attacked of [artifactSplice, proofSplice, bindingSplice]) {
    const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(attacked,
      baseline.context);
    assert.equal(report.ok, false);
    assert.equal(report.anchorArtifactDigestInSignedCheckpointVerifiedUnderCallerPolicy,
      false);
    assert.equal(report.externalAnchorEstablished, false);
    assert.equal(report.nonEquivocationEstablished, false);
    assert.equal(report.decisionState, "HOLD");
  }
});

test("freshly recaptured subject, log-signature, and cosignature attacks fail crypto replay",
  () => {
    function recapture(artifactBytes) {
      const candidate = captureEpisodeAttemptSetExternalWitnessCandidateV2({
        request: baseline.request,
        providerId: PROVIDER_ID,
        anchorArtifactBytes: artifactBytes,
        receivedAtLocallyObserved: RECEIVED_AT,
        transportProofBytes: baseline.transportProofBytes,
        transportProofMediaType: PROOF_MEDIA_TYPE,
      });
      return {
        candidate,
        context: {
          ...baseline.context,
          expectedCandidateHash: candidate.candidateHash,
          expectedAnchorEvidenceHash: candidate.externalAnchorEvidence.evidenceHash,
          expectedTransportProofByteHash: candidate.transportCapture.proof.byteHash,
        },
      };
    }
    function artifactObject() {
      return JSON.parse(baseline.artifactBytes.toString("utf8"));
    }
    const subjectSwap = artifactObject();
    const stored = JSON.parse(Buffer.from(subjectSwap.canonicalizedBody, "base64")
      .toString("utf8"));
    stored.spec.hashedRekordV002.data.digest = Buffer.alloc(32, 0xa5)
      .toString("base64");
    subjectSwap.canonicalizedBody = Buffer.from(canonicalizeStrict(stored), "utf8")
      .toString("base64");

    function flipCheckpointSignature(targetName) {
      const artifact = artifactObject();
      const lines = artifact.inclusionProof.checkpoint.envelope.split("\n");
      const prefix = `— ${targetName} `;
      const index = lines.findIndex((line) => line.startsWith(prefix));
      assert.notEqual(index, -1);
      const bytes = Buffer.from(lines[index].slice(prefix.length), "base64");
      bytes[bytes.length - 1] ^= 1;
      lines[index] = `${prefix}${bytes.toString("base64")}`;
      artifact.inclusionProof.checkpoint.envelope = lines.join("\n");
      return artifact;
    }

    const attacks = [subjectSwap, flipCheckpointSignature(LOG_ORIGIN),
      flipCheckpointSignature(WITNESS_NAME)];
    for (const attack of attacks) {
      const value = recapture(Buffer.from(JSON.stringify(attack), "utf8"));
      const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
        value.candidate, value.context);
      assert.equal(report.ok, false);
      assert.equal(report.anchorArtifactDigestInSignedCheckpointVerifiedUnderCallerPolicy,
        false);
      assert.equal(report.checkpointCosignatureQuorumCryptographicallyVerified, false);
      assert.equal(report.externalAnchorEstablished, false);
      assert.equal(report.nonEquivocationEstablished, false);
      assert.equal(report.stage1Complete, false);
    }
  });

test("a stale or different local-head context cannot replay the external subject", () => {
  const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
    baseline.candidate, {
      ...baseline.context,
      localHead: {
        ...baseline.localHead,
        expectedLocalHeadHash: h("different-local-head"),
      },
    });
  assert.equal(report.ok, false);
  assert.equal(report.localHeadFreshFullAncestryReplayVerified, false);
  assert.equal(report.externalHeadPinVerified, false);
  assert.equal(report.stage2Permitted, false);
});

test("self-resealed positive external or authority claims are structurally rejected", () => {
  for (const [field, value] of [
    ["networkSubmissionPerformed", true],
    ["authority", "EXECUTE"],
  ]) {
    const attacked = structuredClone(baseline.candidate);
    attacked[field] = value;
    const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(attacked,
      baseline.context);
    assert.equal(report.ok, false);
    assert.equal(report.networkOrTransportPerformed, false);
    assert.equal(report.authority, "NONE");
    assert.equal(report.externalAnchorEstablished, false);
    assert.equal(report.stage1Complete, false);
  }
});

test("v1 opaque candidate is explicitly not consumed or promoted", () => {
  assert.deepEqual(baseline.request.predecessorCandidateV1, {
    consumed: false,
    promoted: false,
    reason:
      "OPAQUE_CALLER_BYTES_CANNOT_BE_UPGRADED_WITHOUT_NEW_EXACT_POLICY_AND_ACQUISITION_EVIDENCE",
  });
  assert.equal(baseline.request.boundary.predecessorCandidateV1Promoted, false);
  assert.equal(baseline.request.boundary.callerSuppliedTrustPolicyIsExternalPinProvenance,
    false);
  assert.equal(baseline.request.boundary.callerSuppliedTransportProofIsTransportProvenance,
    false);
});

test("offline verification never calls the ambient network transport", () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("NETWORK_MUST_NOT_BE_USED");
    };
    const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
      baseline.candidate, baseline.context);
    assert.equal(report.ok, true, report.error);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0);
});

test("accessors and proxies fail before any caller getter can emulate external proof", () => {
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "request", {
    enumerable: true,
    get() { getterCalls += 1; return baseline.request; },
  });
  for (const key of ["providerId", "anchorArtifactBytes", "receivedAtLocallyObserved",
    "transportProofBytes", "transportProofMediaType"]) {
    Object.defineProperty(accessor, key, { enumerable: true, value: null });
  }
  assert.throws(() => captureEpisodeAttemptSetExternalWitnessCandidateV2(accessor),
    /CAPTURE_INPUT_FIELDS_INVALID/u);
  assert.equal(getterCalls, 0);
  const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
    new Proxy({}, {}), baseline.context);
  assert.equal(report.ok, false);
  assert.equal(report.error,
    "EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_PROXY_FORBIDDEN");
  assert.equal(report.externalHeadPinVerified, false);

  const coercion = structuredClone(baseline.candidate);
  coercion.request.headBinding.entryByteCommitments[0].byteHash = {
    toString() { getterCalls += 1; return h("forged-coercion"); },
    valueOf() { getterCalls += 1; return h("forged-coercion"); },
  };
  const coercionReport = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
    coercion, baseline.context);
  assert.equal(coercionReport.ok, false);
  assert.equal(getterCalls, 0);
});

test("100k-wide public and nested negative inputs never enumerate or read metadata getters",
  () => {
  let getterCalls = 0;
  const getter = () => { getterCalls += 1; return "MUST_NOT_BE_READ"; };

  const nestedWide = structuredClone(baseline.candidate);
  nestedWide.request.headBinding.attemptCount += 1;
  for (let index = 0; index < 100_005; index += 1) {
    Object.defineProperty(nestedWide.request.headBinding, `getter${index}`, {
      enumerable: true, get: getter,
    });
  }
  const nestedReport = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
    nestedWide, baseline.context);
  assert.equal(nestedReport.ok, false);
  assert.equal(nestedReport.error,
    "EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_REQUEST_INVALID");
  assert.equal(getterCalls, 0);

  const wideCapture = {
    request: baseline.request,
    providerId: "wrong-provider.fixture.test",
    anchorArtifactBytes: baseline.artifactBytes,
    receivedAtLocallyObserved: RECEIVED_AT,
    transportProofBytes: baseline.transportProofBytes,
    transportProofMediaType: PROOF_MEDIA_TYPE,
  };
  for (let index = 0; index < 100_005; index += 1) {
    Object.defineProperty(wideCapture, `extra${index}`, {
      enumerable: true, get: getter,
    });
  }
  assert.throws(() => captureEpisodeAttemptSetExternalWitnessCandidateV2(wideCapture),
    /PROVIDER_ID_MISMATCH/u);
  assert.equal(getterCalls, 0);
  });

test("hidden and symbol metadata is inert and never forwarded", () => {
  let getterCalls = 0;
  const transportInput = {
    endpointOrigin: ENDPOINT,
    opaqueTransportProofMediaType: PROOF_MEDIA_TYPE,
  };
  Object.defineProperty(transportInput, "hidden", {
    enumerable: false,
    get() { getterCalls += 1; return "MUST_NOT_BE_READ"; },
  });
  Object.defineProperty(transportInput, "unknownEnumerable", {
    enumerable: true,
    get() { getterCalls += 1; return "MUST_NOT_BE_READ"; },
  });
  const marker = Symbol("untrusted-marker");
  Object.defineProperty(transportInput, marker, {
    enumerable: true,
    get() { getterCalls += 1; return "MUST_NOT_BE_READ"; },
  });
  const policy = createEpisodeAttemptSetExternalWitnessTransportPolicyV2(
    transportInput);
  assert.equal(getterCalls, 0);
  assert.equal(Object.hasOwn(policy, "hidden"), false);
  assert.equal(Object.hasOwn(policy, "unknownEnumerable"), false);
  assert.equal(Object.getOwnPropertySymbols(policy).length, 0);

  const record = structuredClone(baseline.candidate);
  Object.defineProperty(record, "hidden", {
    enumerable: false,
    get() { getterCalls += 1; return "MUST_NOT_BE_READ"; },
  });
  Object.defineProperty(record, "unknownEnumerable", {
    enumerable: true,
    get() { getterCalls += 1; return "MUST_NOT_BE_READ"; },
  });
  Object.defineProperty(record, marker, {
    enumerable: true,
    get() { getterCalls += 1; return "MUST_NOT_BE_READ"; },
  });
  const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
    record, baseline.context);
  assert.equal(report.ok, true, report.error);
  assert.equal(getterCalls, 0);
  assert.equal(Object.hasOwn(report, "hidden"), false);
  assert.equal(Object.hasOwn(report, "unknownEnumerable"), false);
  assert.equal(Object.getOwnPropertySymbols(report).length, 0);
});
