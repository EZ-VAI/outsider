import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";

import { canonicalizeStrict } from "../../src/canonical.js";
import {
  ANCHOR_OPERATOR_RELATIONSHIPS,
  EXTERNAL_ANCHOR_PROFILES,
  createExternalAnchorTrustPolicy,
} from "../../src/outsider-external-anchor.js";
import {
  captureEpisodeAttemptSetExternalWitnessCandidateV2,
  createEpisodeAttemptSetExternalWitnessRequestV2,
  createEpisodeAttemptSetExternalWitnessTransportPolicyV2,
  verifyEpisodeAttemptSetExternalWitnessCandidateV2,
} from "../../src/outsider-episode-attempt-set-external-witness-v2.js";
import {
  createEpisodeAttemptSetExternalWitnessKeyPolicyV3,
  createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3,
  replayEpisodeAttemptSetExternalWitnessTrustMaterialV3,
} from "../../src/outsider-episode-attempt-set-external-witness-trust-material-v3.js";
import {
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY,
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS,
  createEpisodeAttemptSetExternalWitnessTrustBindingPolicyV4,
} from "../../src/outsider-episode-attempt-set-external-witness-trust-bound-v4.js";
import {
  createAutonomousWorkOrderStage1EngineeringIntegrationFixture,
} from "./outsider-autonomous-work-order-stage1-engineering-integration-fixture.js";

const SPEC = "1.0";
const NOW = "2026-09-01T12:00:00Z";
const EXPIRES = "2027-09-01T12:00:00Z";
const REQUESTED_AT = "2026-09-01T00:04:00.000Z";
const RECEIVED_AT = "2026-09-01T00:04:01.000Z";
const ENDPOINT_ORIGIN = "https://log-v2.trust-bound.fixture.test";
const LOG_ORIGIN = "log-v2.trust-bound.fixture.test";
const EXTERNAL_PROVIDER_ID = "rekor-provider.trust-bound.fixture.test";
const SIGSTORE_OPERATOR = "rekor-operator.trust-bound.fixture.test";
const TRUSTED_ROOT_PATH = "trusted_root.v0.2.json";
const SIGNING_CONFIG_PATH = "signing_config.v0.2.json";
const PROOF_MEDIA_TYPE = "application/vnd.outsider.transport-proof+json";

function digestBytes(value) {
  return createHash("sha256").update(value).digest();
}

export function trustBoundV4Hash(value) {
  const input = Buffer.isBuffer(value) || typeof value === "string"
    ? value : canonicalizeStrict(value);
  return `sha256:${digestBytes(input).toString("hex")}`;
}

function ed25519Pair() {
  const generated = generateKeyPairSync("ed25519");
  const der = generated.publicKey.export({ type: "spki", format: "der" });
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  assert.equal(der.subarray(0, prefix.length).equals(prefix), true);
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    der,
    raw: der.subarray(prefix.length),
    pem: generated.publicKey.export({ type: "spki", format: "pem" }),
  };
}

function p256Pair() {
  const generated = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    der: generated.publicKey.export({ type: "spki", format: "der" }),
    pem: generated.publicKey.export({ type: "spki", format: "pem" }),
  };
}

function tufCanonicalize(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") {
    return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(tufCanonicalize).join(",")}]`;
  const keys = Object.keys(value).sort((left, right) => {
    const leftPoints = [...left];
    const rightPoints = [...right];
    const length = Math.min(leftPoints.length, rightPoints.length);
    for (let index = 0; index < length; index += 1) {
      const leftPoint = leftPoints[index].codePointAt(0);
      const rightPoint = rightPoints[index].codePointAt(0);
      if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
    }
    return leftPoints.length - rightPoints.length;
  });
  return `{${keys.map((key) => `${tufCanonicalize(key)}:${
    tufCanonicalize(value[key])}`).join(",")}}`;
}

function tufKey(pair) {
  return {
    keytype: "ed25519",
    scheme: "ed25519",
    keyval: { public: pair.raw.toString("hex") },
    keyid_hash_algorithms: ["sha256"],
    "x-fixture-owner": "trust-bound fixture\nsecurity@example.test",
  };
}

function tufKeyId(pair) {
  return createHash("sha256").update(tufCanonicalize(tufKey(pair))).digest("hex");
}

function tufSignature(signed, key) {
  return {
    keyid: tufKeyId(key),
    sig: sign(null, Buffer.from(tufCanonicalize(signed)), key.privateKey).toString("hex"),
  };
}

function envelope(signed, keys) {
  return { signatures: keys.map((key) => tufSignature(signed, key)), signed };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function metadataDescription(raw, version) {
  return {
    version,
    length: raw.length,
    hashes: { sha256: trustBoundV4Hash(raw).slice("sha256:".length) },
  };
}

function targetDescription(raw) {
  return {
    length: raw.length,
    hashes: { sha256: trustBoundV4Hash(raw).slice("sha256:".length) },
  };
}

function checkpointKeyId(name, discriminator, rawPublicKey) {
  return digestBytes(Buffer.concat([
    Buffer.from(`${name}\n`, "utf8"),
    Buffer.from([discriminator]),
    rawPublicKey,
  ]));
}

function signedCheckpoint(root, log, witnesses) {
  const noteText = `${LOG_ORIGIN}\n1\n${root.toString("base64")}\n`;
  const logId = digestBytes(log.der);
  const signatures = [
    `— ${LOG_ORIGIN} ${Buffer.concat([
      logId.subarray(0, 4),
      sign("sha256", Buffer.from(noteText, "utf8"), log.privateKey),
    ]).toString("base64")}`,
  ];
  const timestamp = 1788221041n;
  const timestampBytes = Buffer.alloc(8);
  timestampBytes.writeBigUInt64BE(timestamp);
  for (const witness of witnesses) {
    const witnessId = checkpointKeyId(witness.name, 0x04, witness.key.raw);
    const message = Buffer.from(
      `cosignature/v1\ntime ${timestamp}\n${noteText}`, "utf8");
    signatures.push(`— ${witness.name} ${Buffer.concat([
      witnessId.subarray(0, 4),
      timestampBytes,
      sign(null, message, witness.key.privateKey),
    ]).toString("base64")}`);
  }
  return {
    envelope: `${noteText}\n${signatures.join("\n")}\n`,
    logId,
  };
}

function rekorArtifact(request, log, witnesses) {
  const issuer = p256Pair();
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
            publicKey: { rawBytes: issuer.der.toString("base64") },
          },
        },
      },
    },
  }), "utf8");
  const root = digestBytes(Buffer.concat([Buffer.from([0x00]), canonicalizedBody]));
  const checkpoint = signedCheckpoint(root, log, witnesses);
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

function buildTrustMaterial(log, witnesses, witnessQuorum) {
  const root = ed25519Pair();
  const timestampKey = ed25519Pair();
  const snapshotKey = ed25519Pair();
  const targetsKey = ed25519Pair();
  const allKeys = [root, timestampKey, snapshotKey, targetsKey];
  const keys = Object.fromEntries(allKeys.map((key) => [tufKeyId(key), tufKey(key)]));
  const rootSigned = {
    _type: "root",
    spec_version: SPEC,
    version: 1,
    expires: EXPIRES,
    consistent_snapshot: true,
    keys,
    roles: {
      root: { keyids: [tufKeyId(root)], threshold: 1 },
      timestamp: { keyids: [tufKeyId(timestampKey)], threshold: 1 },
      snapshot: { keyids: [tufKeyId(snapshotKey)], threshold: 1 },
      targets: { keyids: [tufKeyId(targetsKey)], threshold: 1 },
    },
    "x-fixture-note": "unknown signed root extension\ncovered exactly",
  };
  const bootstrapRootBytes = jsonBytes(envelope(rootSigned, [root]));
  const logIdBase64 = digestBytes(log.der).toString("base64");
  const checkpointKeyIdBase64 = digestBytes(log.der).subarray(0, 4).toString("base64");
  const trustedRootBytes = jsonBytes({
    mediaType: "application/vnd.dev.sigstore.trustedroot.v0.2+json",
    tlogs: [{
      baseUrl: ENDPOINT_ORIGIN,
      hashAlgorithm: "SHA2_256",
      publicKey: {
        rawBytes: log.der.toString("base64"),
        keyDetails: "PKIX_ECDSA_P256_SHA_256",
        validFor: { start: "2025-01-01T00:00:00Z" },
      },
      logId: { keyId: logIdBase64 },
      checkpointKeyId: { keyId: checkpointKeyIdBase64 },
      operator: SIGSTORE_OPERATOR,
    }],
    certificateAuthorities: [],
    ctlogs: [],
    timestampAuthorities: [],
  });
  const signingConfigBytes = jsonBytes({
    mediaType: "application/vnd.dev.sigstore.signingconfig.v0.2+json",
    caUrls: [],
    oidcUrls: [],
    rekorTlogUrls: [{
      url: ENDPOINT_ORIGIN,
      majorApiVersion: 2,
      validFor: { start: "2025-01-01T00:00:00Z" },
      operator: SIGSTORE_OPERATOR,
    }],
    rekorTlogConfig: { selector: "ANY" },
    tsaUrls: [],
    tsaConfig: { selector: "ANY" },
  });
  const targetsSigned = {
    _type: "targets",
    spec_version: SPEC,
    version: 7,
    expires: EXPIRES,
    targets: {
      [TRUSTED_ROOT_PATH]: targetDescription(trustedRootBytes),
      [SIGNING_CONFIG_PATH]: targetDescription(signingConfigBytes),
    },
  };
  const targetsBytes = jsonBytes(envelope(targetsSigned, [targetsKey]));
  const snapshotSigned = {
    _type: "snapshot",
    spec_version: SPEC,
    version: 8,
    expires: EXPIRES,
    meta: { "targets.json": metadataDescription(targetsBytes, 7) },
  };
  const snapshotBytes = jsonBytes(envelope(snapshotSigned, [snapshotKey]));
  const timestampSigned = {
    _type: "timestamp",
    spec_version: SPEC,
    version: 9,
    expires: EXPIRES,
    meta: { "snapshot.json": metadataDescription(snapshotBytes, 8) },
  };
  const timestampBytes = jsonBytes(envelope(timestampSigned, [timestampKey]));
  const witnessPolicy = createEpisodeAttemptSetExternalWitnessKeyPolicyV3({
    providerOrigin: ENDPOINT_ORIGIN,
    providerOperator: SIGSTORE_OPERATOR,
    quorum: witnessQuorum,
    witnesses: witnesses.map((witness) => ({
      name: witness.name,
      operator: witness.operator,
      publicKey: {
        keyDetails: "PKIX_ED25519",
        rawBytes: witness.key.der.toString("base64"),
      },
    })),
  });
  const policy = createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3({
    repositoryId: "sigstore-root.trust-bound.fixture.test",
    tufSpecVersion: SPEC,
    updateStartTime: NOW,
    bootstrapRootHash: trustBoundV4Hash(bootstrapRootBytes),
    bootstrapRootVersion: 1,
    expectedFinalRootVersion: 1,
    expectedTimestampVersion: 9,
    expectedSnapshotVersion: 8,
    expectedTargetsVersion: 7,
    trustedRootTargetPath: TRUSTED_ROOT_PATH,
    signingConfigTargetPath: SIGNING_CONFIG_PATH,
    rekor: {
      endpointOrigin: ENDPOINT_ORIGIN,
      operator: SIGSTORE_OPERATOR,
      logIdBase64,
      checkpointKeyIdBase64,
    },
    witnessPolicy,
    expectedWitnessPolicyHash: witnessPolicy.policyHash,
  });
  const record = {
    policy,
    bootstrapRootBytes,
    rootRotationBytes: [],
    timestampBytes,
    snapshotBytes,
    targetsBytes,
    trustedRootBytes,
    signingConfigBytes,
  };
  const context = { expectedPolicyHash: policy.policyHash };
  const report = replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(record, context);
  assert.equal(report.ok, true, report.error);
  return { record, context, report, witnessPolicy, policy, logIdBase64,
    checkpointKeyIdBase64 };
}

function buildExternalWitness(registrar, log, witnesses, witnessQuorum,
  localHeadOverride = null) {
  const stage1 = localHeadOverride === null
    ? createAutonomousWorkOrderStage1EngineeringIntegrationFixture(registrar) : null;
  const trustPolicy = createExternalAnchorTrustPolicy({
    providerId: EXTERNAL_PROVIDER_ID,
    operatorRelationship: ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER,
    profile: EXTERNAL_ANCHOR_PROFILES.REKOR_V2,
    endpointOrigin: ENDPOINT_ORIGIN,
    relationshipEvidenceHash: trustBoundV4Hash("synthetic-provider-crosswalk-claim"),
    trustMaterial: {
      kind: "REKOR_V2_CHECKPOINT_TRUST",
      origin: LOG_ORIGIN,
      logPublicKeyPem: log.pem,
      witnesses: witnesses.map((witness) => ({
        name: witness.name,
        operatorId: witness.operator,
        operatorRelationship: ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER,
        relationshipEvidenceHash: trustBoundV4Hash(
          `synthetic-${witness.name}-relationship-claim`),
        publicKeyPem: witness.key.pem,
      })),
    },
    independentWitnessQuorum: witnessQuorum,
  });
  const transportPolicy = createEpisodeAttemptSetExternalWitnessTransportPolicyV2({
    endpointOrigin: ENDPOINT_ORIGIN,
    opaqueTransportProofMediaType: PROOF_MEDIA_TYPE,
  });
  const localHead = localHeadOverride ?? stage1.context.localAttemptSet;
  const request = createEpisodeAttemptSetExternalWitnessRequestV2({
    localHead,
    requestedAt: REQUESTED_AT,
    trustPolicy,
    expectedTrustPolicyHash: trustPolicy.policyHash,
    transportPolicy,
    expectedTransportPolicyHash: transportPolicy.policyHash,
  });
  /* A Rekor checkpoint admits at most sixteen signature lines including the
     log signature.  A sixteen-key policy therefore uses a fifteen-signature
     quorum while retaining all sixteen keys in the exact ordered mapping. */
  const artifactBytes = rekorArtifact(request, log,
    witnesses.slice(0, witnessQuorum));
  const transportProofBytes = Buffer.from(canonicalizeStrict({
    fixtureOnly: true,
    endpointOrigin: ENDPOINT_ORIGIN,
    requestHash: request.externalAnchorRequest.requestHash,
    artifactByteHash: trustBoundV4Hash(artifactBytes),
    callerSuppliedOpaqueCapture: true,
  }), "utf8");
  const candidate = captureEpisodeAttemptSetExternalWitnessCandidateV2({
    request,
    providerId: EXTERNAL_PROVIDER_ID,
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
  const report = verifyEpisodeAttemptSetExternalWitnessCandidateV2(candidate, context);
  assert.equal(report.ok, true, report.error);
  return { stage1, candidate, context, report, trustPolicy, transportPolicy,
    request, artifactBytes, transportProofBytes };
}

export function cloneTrustBoundV4FixtureValue(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(cloneTrustBoundV4FixtureValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, cloneTrustBoundV4FixtureValue(item),
    ]));
  }
  return value;
}

export function createEpisodeAttemptSetExternalWitnessTrustBoundV4Fixture(registrar,
  { witnessCount = 2, witnessQuorum = witnessCount, localHead = null } = {}) {
  assert.equal(Number.isSafeInteger(witnessCount), true);
  assert.equal(witnessCount >= 1 && witnessCount <= 16, true);
  assert.equal(Number.isSafeInteger(witnessQuorum), true);
  assert.equal(witnessQuorum >= 1 && witnessQuorum <= witnessCount, true);
  assert.equal(witnessQuorum <= 15, true);
  const log = p256Pair();
  const witnesses = Array.from({ length: witnessCount }, (_, index) => ({
    name: `witness-${index + 1}.trust-bound.fixture.test`,
    operator: `witness-${index + 1}-operator.trust-bound.fixture.test`,
    key: ed25519Pair(),
  }));
  const externalWitnessV2 = buildExternalWitness(registrar, log, witnesses,
    witnessQuorum, localHead);
  const trustMaterialV3 = buildTrustMaterial(log, witnesses, witnessQuorum);
  const bindingPolicyInput = {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS.bindingPolicy,
    policyClass: "EXACT_TWO_PARENT_REPLAY_AND_PRIVATE_TRUST_CROSSWALK_HOLD_ONLY",
    parentPins: {
      externalWitnessV2VerificationHash: externalWitnessV2.report.verificationHash,
      trustMaterialV3VerificationHash: trustMaterialV3.report.verificationHash,
      externalWitnessTrustPolicyHash: externalWitnessV2.trustPolicy.policyHash,
      externalWitnessTransportPolicyHash: externalWitnessV2.transportPolicy.policyHash,
      trustMaterialV3PolicyHash: trustMaterialV3.policy.policyHash,
      localWitnessPolicyV3Hash: trustMaterialV3.witnessPolicy.policyHash,
    },
    providerOperatorMapping: {
      externalWitnessProviderId: EXTERNAL_PROVIDER_ID,
      sigstoreOperator: SIGSTORE_OPERATOR,
      basis: "CALLER_ASSERTED_IDENTIFIER_CROSSWALK_NOT_EXTERNAL_PROVENANCE",
      evidenceHash: trustBoundV4Hash("synthetic-provider-operator-crosswalk"),
      externalProvenanceEstablished: false,
    },
    requirements: {
      profile: "SIGSTORE_REKOR_V2_HASHEDREKORD_0.0.2",
      endpointPath: "/api/v2/log/entries",
      method: "POST",
      redirectPolicy: "ERROR",
      logKeyDetails: "PKIX_ECDSA_P256_SHA_256",
      logKeyMapping:
        "EXACT_SPKI_DER_SHA256_LOG_ID_AND_TRUNCATED_CHECKPOINT_ID",
      checkpointOriginMapping: "V2_ORIGIN_EQUALS_REKOR_ENDPOINT_HOST_PORT",
      witnessMapping: "EXACT_ORDERED_NAME_OPERATOR_ED25519_SPKI_AND_QUORUM",
      maximumWitnessCount: 16,
      bothParentsFreshReplayRequired: true,
    },
    callerMappingIsExternalProvenance: false,
    status: "PARTIAL",
    decisionState: "HOLD",
    authority: "NONE",
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY,
  };
  const bindingPolicy = createEpisodeAttemptSetExternalWitnessTrustBindingPolicyV4(
    bindingPolicyInput);
  const record = {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS.record,
    bindingPolicy,
    externalWitnessCandidateV2: externalWitnessV2.candidate,
    trustMaterialRecordV3: trustMaterialV3.record,
  };
  const context = {
    externalWitnessV2: externalWitnessV2.context,
    trustMaterialV3: trustMaterialV3.context,
    expectedBindingPolicyHash: bindingPolicy.policyHash,
  };
  return { record, context, bindingPolicyInput, bindingPolicy, externalWitnessV2,
    trustMaterialV3, log, witnesses };
}
