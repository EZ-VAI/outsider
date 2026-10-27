import { spawnSync } from "node:child_process";
import {
  createHash, createPublicKey, randomBytes, verify as cryptoVerify,
} from "node:crypto";
import {
  mkdtempSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

/*
 * This module deliberately does not perform network writes. It prepares a
 * commitment-only request, captures a provider artifact, and verifies that
 * artifact offline against trust material supplied out of record.
 *
 * Standards boundaries:
 * - RFC 3161: proof that a digest existed no later than the TSA time. It is
 *   not an append-only log and cannot by itself prove non-omission.
 * - Sigstore Rekor v2: a concrete software-signature transparency log. A
 *   bundle proves inclusion in a signed checkpoint; a bare log signature is
 *   not an independent anti-equivocation witness.
 * - RFC 9943 SCITT: the provider-neutral long-term profile. Full COSE/CBOR
 *   verification is intentionally delegated to a separately pinned verifier
 *   until a reviewed implementation is included in Outsider's dependency
 *   closure.
 */

export const EXTERNAL_ANCHOR_PROFILES = Object.freeze({
  RFC3161: "RFC3161_TIMESTAMP",
  REKOR_V2: "SIGSTORE_REKOR_V2_HASHEDREKORD",
  SCITT: "SCITT_RFC9943",
});

export const ANCHOR_OPERATOR_RELATIONSHIPS = Object.freeze({
  LOCAL_SELF: "LOCAL_SELF",
  FIRST_PARTY_REMOTE: "FIRST_PARTY_REMOTE",
  INDEPENDENT_PROVIDER: "INDEPENDENT_PROVIDER",
});

export const EXTERNAL_ANCHOR_ASSURANCE = Object.freeze({
  CRYPTOGRAPHIC_ONLY:
    "BUILT_IN_CRYPTOGRAPHIC_ARTIFACT_VERIFIED_AGAINST_CALLER_SELECTED_TRUST_ROOT_NO_OPERATOR_INDEPENDENCE",
  VERIFICATION_DECISION_ONLY:
    "CALLER_SELECTED_VERIFIER_DECISION_ACCEPTED_NO_BUILT_IN_CRYPTOGRAPHIC_VERIFICATION_OR_OPERATOR_INDEPENDENCE",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const HEX = /^[a-f0-9]+$/;
const PROFILE_VALUES = new Set(Object.values(EXTERNAL_ANCHOR_PROFILES));
const RELATIONSHIP_VALUES = new Set(Object.values(ANCHOR_OPERATOR_RELATIONSHIPS));
const MAX_ARTIFACT_BYTES = 1024 * 1024;

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function digestBytes(value) {
  return createHash("sha256").update(value).digest();
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${digestBytes(bytes).toString("hex")}`;
}

function withHash(body, field) {
  canonicalizeStrict(body);
  return { ...body, [field]: digest(body) };
}

function canonicalIso(value) {
  return typeof value === "string" && value.length === 24
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function providerIdValid(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
}

function strictBase64(value, { expectedBytes = null, maximumBytes = MAX_ARTIFACT_BYTES } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumBytes * 2
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("EXTERNAL_ANCHOR_BASE64_INVALID");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length > maximumBytes || decoded.toString("base64") !== value
    || (expectedBytes !== null && decoded.length !== expectedBytes)) {
    throw new Error("EXTERNAL_ANCHOR_BASE64_INVALID");
  }
  return decoded;
}

function assertCommitment(commitment) {
  const expected = ["anchorCommitmentHash", "anchorPolicyHash", "contractBoundCount",
    "disclosure", "entryCount", "headEntryHash", "ledgerId", "openCount", "prefixRoot",
    "schema", "startedCount", "terminalCount"];
  if (!exactKeys(commitment, expected)) {
    throw new Error("EXTERNAL_ANCHOR_COMMITMENT_SHAPE_INVALID");
  }
  const { anchorCommitmentHash, ...body } = commitment;
  if (body.schema !== "outsider/census-anchor-commitment/v1"
    || !HASH.test(anchorCommitmentHash) || anchorCommitmentHash !== digest(body)
    || !HASH.test(body.anchorPolicyHash)
    || body.disclosure !== "COMMITMENT_ONLY_NO_RUN_PROMPT_PATH_OUTPUT_OR_EVENT_DATA") {
    throw new Error("EXTERNAL_ANCHOR_COMMITMENT_INVALID");
  }
}

function derLength(length) {
  if (!Number.isSafeInteger(length) || length < 0) throw new Error("DER_LENGTH_INVALID");
  if (length < 128) return Buffer.from([length]);
  const bytes = [];
  for (let current = length; current > 0; current >>>= 8) bytes.unshift(current & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag, value) {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
}

function derInteger(bytes) {
  let value = Buffer.from(bytes);
  while (value.length > 1 && value[0] === 0 && (value[1] & 0x80) === 0) value = value.subarray(1);
  if ((value[0] & 0x80) !== 0) value = Buffer.concat([Buffer.from([0]), value]);
  return der(0x02, value);
}

function rfc3161Query(messageImprint, nonce) {
  // id-sha256 = 2.16.840.1.101.3.4.2.1
  const sha256Oid = Buffer.from("608648016503040201", "hex");
  const algorithm = der(0x30, Buffer.concat([der(0x06, sha256Oid), Buffer.from([0x05, 0x00])]));
  const imprint = der(0x30, Buffer.concat([algorithm, der(0x04, messageImprint)]));
  return der(0x30, Buffer.concat([
    derInteger(Buffer.from([1])), imprint, derInteger(nonce), Buffer.from([0x01, 0x01, 0xff]),
  ]));
}

function normalizeNonce(nonceHex) {
  const value = nonceHex ?? randomBytes(16).toString("hex");
  if (typeof value !== "string" || !HEX.test(value) || value.length < 16 || value.length > 64
    || value.length % 2 !== 0 || /^0+$/.test(value)) {
    throw new Error("EXTERNAL_ANCHOR_RFC3161_NONCE_INVALID");
  }
  return value;
}

function requestWire(profile, subject, nonceHex) {
  if (profile === EXTERNAL_ANCHOR_PROFILES.RFC3161) {
    const nonce = normalizeNonce(nonceHex);
    const query = rfc3161Query(Buffer.from(subject.digestHex, "hex"), Buffer.from(nonce, "hex"));
    return {
      mediaType: "application/timestamp-query",
      bodyBase64: query.toString("base64"),
      bodyHash: digest(query),
      messageImprintAlgorithm: "SHA-256",
      messageImprintHex: subject.digestHex,
      nonceHex: nonce,
      certificateRequested: true,
      networkSubmissionPerformed: false,
    };
  }
  if (profile === EXTERNAL_ANCHOR_PROFILES.REKOR_V2) {
    return {
      mediaType: "application/json",
      apiVersion: "2",
      kind: "hashedrekord",
      artifactDigestAlgorithm: "SHA2_256",
      artifactDigestBase64: Buffer.from(subject.digestHex, "hex").toString("base64"),
      issuerSignatureAndVerifierRequired: true,
      networkSubmissionPerformed: false,
    };
  }
  const statement = Buffer.from(canonicalizeStrict({
    schema: "outsider/scitt-anchor-statement/v1",
    subjectDigest: subject,
  }));
  return {
    registrationMediaType: "application/scitt-statement+cose",
    statementPayloadMediaType: "application/vnd.outsider.census-anchor-commitment+json",
    statementPayloadBase64: statement.toString("base64"),
    statementPayloadHash: digest(statement),
    issuerCoseSign1Required: true,
    networkSubmissionPerformed: false,
  };
}

function profileMetadata(profile) {
  if (profile === EXTERNAL_ANCHOR_PROFILES.RFC3161) {
    return { specification: "RFC3161", receiptMediaType: "application/timestamp-reply",
      irreversibleDisclosure: "NONE_REQUIRED_BY_PROTOCOL" };
  }
  if (profile === EXTERNAL_ANCHOR_PROFILES.REKOR_V2) {
    return { specification: "SIGSTORE_REKOR_V2_HASHEDREKORD_0.0.2",
      receiptMediaType: "application/json",
      irreversibleDisclosure: "PUBLIC_DIGEST_SIGNATURE_AND_KEY_OR_CERTIFICATE" };
  }
  return { specification: "RFC9943_SCITT_WITH_RFC9942_COSE_RECEIPT",
    receiptMediaType: "application/scitt-receipt+cose",
    irreversibleDisclosure: "TRANSPARENCY_SERVICE_PROFILE_DEPENDENT" };
}

export function createExternalAnchorRequest({ commitment, profile, nonceHex = null } = {}) {
  assertCommitment(commitment);
  if (!PROFILE_VALUES.has(profile)) throw new Error("EXTERNAL_ANCHOR_PROFILE_UNSUPPORTED");
  const subjectDigest = {
    algorithm: "SHA-256",
    digestHex: commitment.anchorCommitmentHash.slice("sha256:".length),
  };
  const metadata = profileMetadata(profile);
  const body = {
    schema: "outsider/external-anchor-request/v1",
    profile: { kind: profile, specification: metadata.specification },
    anchorCommitmentHash: commitment.anchorCommitmentHash,
    anchorPolicyHash: commitment.anchorPolicyHash,
    subjectDigest,
    disclosure: {
      outboundRunData: false,
      content: "COMMITMENT_DIGEST_ONLY_NO_PROMPT_PATH_OUTPUT_OR_EVENT_DATA",
      irreversibleDisclosure: metadata.irreversibleDisclosure,
    },
    expectedReceiptMediaType: metadata.receiptMediaType,
    wire: requestWire(profile, subjectDigest, nonceHex),
  };
  return withHash(body, "requestHash");
}

function assertRequest(request) {
  const expected = ["schema", "profile", "anchorCommitmentHash", "anchorPolicyHash",
    "subjectDigest", "disclosure", "expectedReceiptMediaType", "wire", "requestHash"];
  if (!exactKeys(request, expected)) throw new Error("EXTERNAL_ANCHOR_REQUEST_SHAPE_INVALID");
  const { requestHash, ...body } = request;
  if (body.schema !== "outsider/external-anchor-request/v1" || requestHash !== digest(body)
    || !HASH.test(body.anchorCommitmentHash) || !HASH.test(body.anchorPolicyHash)
    || !exactKeys(body.profile, ["kind", "specification"])
    || !PROFILE_VALUES.has(body.profile.kind)
    || !exactKeys(body.subjectDigest, ["algorithm", "digestHex"])
    || body.subjectDigest.algorithm !== "SHA-256"
    || body.subjectDigest?.digestHex !== body.anchorCommitmentHash.slice("sha256:".length)
    || !exactKeys(body.disclosure, ["outboundRunData", "content", "irreversibleDisclosure"])
    || body.disclosure.outboundRunData !== false
    || body.disclosure.content !== "COMMITMENT_DIGEST_ONLY_NO_PROMPT_PATH_OUTPUT_OR_EVENT_DATA") {
    throw new Error("EXTERNAL_ANCHOR_REQUEST_INVALID");
  }
  const metadata = profileMetadata(body.profile.kind);
  if (body.profile.specification !== metadata.specification
    || body.expectedReceiptMediaType !== metadata.receiptMediaType
    || body.disclosure.irreversibleDisclosure !== metadata.irreversibleDisclosure) {
    throw new Error("EXTERNAL_ANCHOR_REQUEST_PROFILE_INVALID");
  }
  if (body.profile.kind === EXTERNAL_ANCHOR_PROFILES.RFC3161) {
    if (!exactKeys(body.wire, ["mediaType", "bodyBase64", "bodyHash",
      "messageImprintAlgorithm", "messageImprintHex", "nonceHex", "certificateRequested",
      "networkSubmissionPerformed"])
      || body.wire.mediaType !== "application/timestamp-query"
      || body.wire.messageImprintAlgorithm !== "SHA-256"
      || body.wire.messageImprintHex !== body.subjectDigest.digestHex
      || body.wire.certificateRequested !== true
      || body.wire.networkSubmissionPerformed !== false) {
      throw new Error("EXTERNAL_ANCHOR_RFC3161_REQUEST_INVALID");
    }
    const nonce = normalizeNonce(body.wire.nonceHex);
    const expected = rfc3161Query(Buffer.from(body.subjectDigest.digestHex, "hex"),
      Buffer.from(nonce, "hex"));
    const actual = strictBase64(body.wire.bodyBase64);
    if (!actual.equals(expected) || body.wire.bodyHash !== digest(actual)) {
      throw new Error("EXTERNAL_ANCHOR_RFC3161_REQUEST_INVALID");
    }
  } else if (body.profile.kind === EXTERNAL_ANCHOR_PROFILES.REKOR_V2) {
    if (!exactKeys(body.wire, ["mediaType", "apiVersion", "kind",
      "artifactDigestAlgorithm", "artifactDigestBase64", "issuerSignatureAndVerifierRequired",
      "networkSubmissionPerformed"])
      || body.wire.mediaType !== "application/json" || body.wire.apiVersion !== "2"
      || body.wire.kind !== "hashedrekord" || body.wire.artifactDigestAlgorithm !== "SHA2_256"
      || body.wire.issuerSignatureAndVerifierRequired !== true
      || body.wire.networkSubmissionPerformed !== false
      || !strictBase64(body.wire.artifactDigestBase64,
        { expectedBytes: 32, maximumBytes: 32 })
        .equals(Buffer.from(body.subjectDigest.digestHex, "hex"))) {
      throw new Error("EXTERNAL_ANCHOR_REKOR_REQUEST_INVALID");
    }
  } else {
    if (!exactKeys(body.wire, ["registrationMediaType", "statementPayloadMediaType",
      "statementPayloadBase64", "statementPayloadHash", "issuerCoseSign1Required",
      "networkSubmissionPerformed"])
      || body.wire.registrationMediaType !== "application/scitt-statement+cose"
      || body.wire.statementPayloadMediaType
        !== "application/vnd.outsider.census-anchor-commitment+json"
      || body.wire.issuerCoseSign1Required !== true
      || body.wire.networkSubmissionPerformed !== false) {
      throw new Error("EXTERNAL_ANCHOR_SCITT_REQUEST_INVALID");
    }
    const expected = Buffer.from(canonicalizeStrict({
      schema: "outsider/scitt-anchor-statement/v1",
      subjectDigest: body.subjectDigest,
    }));
    const actual = strictBase64(body.wire.statementPayloadBase64);
    if (!actual.equals(expected) || body.wire.statementPayloadHash !== digest(actual)) {
      throw new Error("EXTERNAL_ANCHOR_SCITT_REQUEST_INVALID");
    }
  }
  return body;
}

export function captureExternalAnchorEvidence({ request, providerId, artifact,
  artifactMediaType = null, receivedAtLocal = new Date().toISOString() } = {}) {
  const requestBody = assertRequest(request);
  if (!providerIdValid(providerId)) throw new Error("EXTERNAL_ANCHOR_PROVIDER_ID_INVALID");
  if (!canonicalIso(receivedAtLocal)) throw new Error("EXTERNAL_ANCHOR_CAPTURE_TIME_INVALID");
  const bytes = Buffer.isBuffer(artifact) ? Buffer.from(artifact)
    : typeof artifact === "string" ? strictBase64(artifact) : null;
  if (!bytes || bytes.length === 0 || bytes.length > MAX_ARTIFACT_BYTES) {
    throw new Error("EXTERNAL_ANCHOR_ARTIFACT_INVALID");
  }
  const mediaType = artifactMediaType ?? requestBody.expectedReceiptMediaType;
  if (mediaType !== requestBody.expectedReceiptMediaType) {
    throw new Error("EXTERNAL_ANCHOR_ARTIFACT_MEDIA_TYPE_MISMATCH");
  }
  const body = {
    schema: "outsider/external-anchor-evidence/v1",
    requestHash: request.requestHash,
    profile: requestBody.profile.kind,
    providerId,
    receivedAtLocal,
    localTimeAuthority: "LOCAL_CAPTURE_TIME_NOT_PROVIDER_PROOF",
    artifact: {
      mediaType,
      bytesBase64: bytes.toString("base64"),
      byteLength: bytes.length,
      artifactHash: digest(bytes),
    },
  };
  return withHash(body, "evidenceHash");
}

function validateTrustMaterial(profile, value, independentWitnessQuorum, providerId = null) {
  if (!plain(value)) throw new Error("EXTERNAL_ANCHOR_TRUST_MATERIAL_INVALID");
  if (profile === EXTERNAL_ANCHOR_PROFILES.RFC3161) {
    if (!exactKeys(value, ["kind", "caCertificatesPem", "untrustedCertificatesPem"])
      || value.kind !== "RFC3161_X509_TRUST"
      || typeof value.caCertificatesPem !== "string" || value.caCertificatesPem.length < 32
      || !(value.untrustedCertificatesPem === null
        || typeof value.untrustedCertificatesPem === "string")
      || independentWitnessQuorum !== 0) {
      throw new Error("EXTERNAL_ANCHOR_RFC3161_TRUST_INVALID");
    }
    return;
  }
  if (profile === EXTERNAL_ANCHOR_PROFILES.REKOR_V2) {
    if (!exactKeys(value, ["kind", "origin", "logPublicKeyPem", "witnesses"])
      || value.kind !== "REKOR_V2_CHECKPOINT_TRUST"
      || typeof value.origin !== "string" || value.origin.length === 0
      || /[+\s]/u.test(value.origin) || typeof value.logPublicKeyPem !== "string"
      || !Array.isArray(value.witnesses) || value.witnesses.length > 16
      || !value.witnesses.every((item) => exactKeys(item, ["name", "operatorId",
        "operatorRelationship", "relationshipEvidenceHash", "publicKeyPem"])
        && typeof item.name === "string" && item.name.length > 0 && !/[+\s]/u.test(item.name)
        && providerIdValid(item.operatorId) && item.operatorId !== providerId
        && item.operatorRelationship === ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER
        && HASH.test(item.relationshipEvidenceHash)
        && typeof item.publicKeyPem === "string")
      || independentWitnessQuorum > value.witnesses.length) {
      throw new Error("EXTERNAL_ANCHOR_REKOR_TRUST_INVALID");
    }
    const witnessNames = new Set();
    const witnessOperators = new Set();
    const witnessKeys = new Set();
    for (const witness of value.witnesses) {
      const key = createPublicKey(witness.publicKeyPem);
      const keyFingerprint = digest(key.export({ type: "spki", format: "der" }));
      if (witnessNames.has(witness.name) || witnessOperators.has(witness.operatorId)
        || witnessKeys.has(keyFingerprint)) {
        throw new Error("EXTERNAL_ANCHOR_REKOR_WITNESS_DUPLICATE");
      }
      witnessNames.add(witness.name);
      witnessOperators.add(witness.operatorId);
      witnessKeys.add(keyFingerprint);
    }
    return;
  }
  if (!exactKeys(value, ["kind", "transparencyServiceIssuer", "trustedKeysHash",
    "verifierPin", "witnessPolicyHash"])
    || value.kind !== "SCITT_RFC9943_VERIFIER"
    || typeof value.transparencyServiceIssuer !== "string"
    || value.transparencyServiceIssuer.length === 0
    || !HASH.test(value.trustedKeysHash) || !HASH.test(value.verifierPin)
    || !(value.witnessPolicyHash === null || HASH.test(value.witnessPolicyHash))
    || (independentWitnessQuorum > 0 && !HASH.test(String(value.witnessPolicyHash ?? "")))) {
    throw new Error("EXTERNAL_ANCHOR_SCITT_TRUST_INVALID");
  }
}

function defaultRequirements(profile, independentWitnessQuorum) {
  if (profile === EXTERNAL_ANCHOR_PROFILES.RFC3161) {
    return { existenceTimeRequired: true, inclusionProofRequired: false,
      appendOnlyConsistencyRequired: false, independentWitnessQuorum: 0 };
  }
  return { existenceTimeRequired: false, inclusionProofRequired: true,
    appendOnlyConsistencyRequired: independentWitnessQuorum > 0,
    independentWitnessQuorum };
}

export function createExternalAnchorTrustPolicy({ providerId, operatorRelationship, profile,
  endpointOrigin = null, relationshipEvidenceHash = null, trustMaterial,
  independentWitnessQuorum = 0 } = {}) {
  if (!providerIdValid(providerId)) throw new Error("EXTERNAL_ANCHOR_PROVIDER_ID_INVALID");
  if (!RELATIONSHIP_VALUES.has(operatorRelationship)) {
    throw new Error("EXTERNAL_ANCHOR_OPERATOR_RELATIONSHIP_INVALID");
  }
  if (!PROFILE_VALUES.has(profile)) throw new Error("EXTERNAL_ANCHOR_PROFILE_UNSUPPORTED");
  if (!(endpointOrigin === null || (typeof endpointOrigin === "string"
    && /^https:\/\/[^\s]+$/.test(endpointOrigin)))) {
    throw new Error("EXTERNAL_ANCHOR_ENDPOINT_INVALID");
  }
  if (!(relationshipEvidenceHash === null || HASH.test(relationshipEvidenceHash))) {
    throw new Error("EXTERNAL_ANCHOR_RELATIONSHIP_EVIDENCE_INVALID");
  }
  if (operatorRelationship === ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER
    && !HASH.test(String(relationshipEvidenceHash ?? ""))) {
    throw new Error("EXTERNAL_ANCHOR_INDEPENDENCE_EVIDENCE_REQUIRED");
  }
  if (!Number.isSafeInteger(independentWitnessQuorum) || independentWitnessQuorum < 0) {
    throw new Error("EXTERNAL_ANCHOR_WITNESS_QUORUM_INVALID");
  }
  validateTrustMaterial(profile, trustMaterial, independentWitnessQuorum, providerId);
  const body = {
    schema: "outsider/external-anchor-trust-policy/v1",
    provider: {
      providerId,
      operatorRelationship,
      relationshipAuthority: {
        basis: "OUT_OF_RECORD_POLICY_ASSERTION_NOT_RECEIPT_SELF_REPORT",
        evidenceHash: relationshipEvidenceHash,
      },
    },
    profile: { kind: profile, endpointOrigin },
    trustMaterial,
    requirements: defaultRequirements(profile, independentWitnessQuorum),
  };
  return withHash(body, "policyHash");
}

function assertPolicy(policy) {
  const expected = ["schema", "provider", "profile", "trustMaterial", "requirements",
    "policyHash"];
  if (!exactKeys(policy, expected)) throw new Error("EXTERNAL_ANCHOR_POLICY_SHAPE_INVALID");
  const { policyHash, ...body } = policy;
  if (body.schema !== "outsider/external-anchor-trust-policy/v1"
    || policyHash !== digest(body)
    || !exactKeys(body.provider,
      ["providerId", "operatorRelationship", "relationshipAuthority"])
    || !providerIdValid(body.provider.providerId)
    || !RELATIONSHIP_VALUES.has(body.provider.operatorRelationship)
    || !exactKeys(body.profile, ["kind", "endpointOrigin"])
    || !PROFILE_VALUES.has(body.profile.kind)
    || !(body.profile.endpointOrigin === null || (typeof body.profile.endpointOrigin === "string"
      && /^https:\/\/[^\s]+$/.test(body.profile.endpointOrigin)))
    || !exactKeys(body.provider?.relationshipAuthority, ["basis", "evidenceHash"])
    || body.provider.relationshipAuthority.basis
      !== "OUT_OF_RECORD_POLICY_ASSERTION_NOT_RECEIPT_SELF_REPORT"
    || !exactKeys(body.requirements, ["existenceTimeRequired", "inclusionProofRequired",
      "appendOnlyConsistencyRequired", "independentWitnessQuorum"])) {
    throw new Error("EXTERNAL_ANCHOR_POLICY_INVALID");
  }
  const relationshipHash = body.provider.relationshipAuthority.evidenceHash;
  if (!(relationshipHash === null || HASH.test(relationshipHash))
    || (body.provider.operatorRelationship === ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER
      && relationshipHash === null)) {
    throw new Error("EXTERNAL_ANCHOR_POLICY_RELATIONSHIP_INVALID");
  }
  const quorum = body.requirements.independentWitnessQuorum;
  const expectedRequirements = defaultRequirements(body.profile.kind, quorum);
  if (!Number.isSafeInteger(quorum) || quorum < 0
    || canonicalizeStrict(body.requirements) !== canonicalizeStrict(expectedRequirements)) {
    throw new Error("EXTERNAL_ANCHOR_POLICY_REQUIREMENTS_INVALID");
  }
  validateTrustMaterial(body.profile.kind, body.trustMaterial,
    quorum, body.provider.providerId);
  return body;
}

function assertEvidence(evidence) {
  const expected = ["schema", "requestHash", "profile", "providerId", "receivedAtLocal",
    "localTimeAuthority", "artifact", "evidenceHash"];
  if (!exactKeys(evidence, expected)) throw new Error("EXTERNAL_ANCHOR_EVIDENCE_SHAPE_INVALID");
  const { evidenceHash, ...body } = evidence;
  if (body.schema !== "outsider/external-anchor-evidence/v1" || evidenceHash !== digest(body)
    || !HASH.test(body.requestHash) || !PROFILE_VALUES.has(body.profile)
    || !providerIdValid(body.providerId) || !canonicalIso(body.receivedAtLocal)
    || body.localTimeAuthority !== "LOCAL_CAPTURE_TIME_NOT_PROVIDER_PROOF"
    || !exactKeys(body.artifact,
      ["mediaType", "bytesBase64", "byteLength", "artifactHash"])) {
    throw new Error("EXTERNAL_ANCHOR_EVIDENCE_INVALID");
  }
  const bytes = strictBase64(body.artifact.bytesBase64);
  if (bytes.length !== body.artifact.byteLength || digest(bytes) !== body.artifact.artifactHash) {
    throw new Error("EXTERNAL_ANCHOR_ARTIFACT_HASH_INVALID");
  }
  return { body, bytes };
}

function verifyRfc3161({ request, artifact, policy, opensslPath }) {
  const query = strictBase64(request.wire.bodyBase64);
  if (digest(query) !== request.wire.bodyHash
    || request.wire.messageImprintHex !== request.subjectDigest.digestHex
    || request.expectedReceiptMediaType !== "application/timestamp-reply") {
    throw new Error("EXTERNAL_ANCHOR_RFC3161_REQUEST_INVALID");
  }
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-rfc3161-verify-"));
  const queryFile = path.join(directory, "request.tsq");
  const responseFile = path.join(directory, "response.tsr");
  const caFile = path.join(directory, "ca.pem");
  const untrustedFile = path.join(directory, "untrusted.pem");
  let providerProofTime = null;
  try {
    writeFileSync(queryFile, query, { mode: 0o600 });
    writeFileSync(responseFile, artifact, { mode: 0o600 });
    writeFileSync(caFile, policy.trustMaterial.caCertificatesPem, { mode: 0o600 });
    const args = ["ts", "-verify", "-queryfile", queryFile, "-in", responseFile,
      "-CAfile", caFile];
    if (policy.trustMaterial.untrustedCertificatesPem) {
      writeFileSync(untrustedFile, policy.trustMaterial.untrustedCertificatesPem, { mode: 0o600 });
      args.push("-untrusted", untrustedFile);
    }
    const result = spawnSync(opensslPath, args, {
      encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error || result.status !== 0 || !/Verification:\s*OK/i.test(result.stdout)) {
      throw new Error("EXTERNAL_ANCHOR_RFC3161_VERIFICATION_FAILED");
    }
    /* The authenticated genTime is inside the same response that was just
       verified against the exact query (imprint + nonce) and pinned X.509
       path.  A local capture timestamp is never substituted for it. */
    const inspected = spawnSync(opensslPath,
      ["ts", "-reply", "-in", responseFile, "-text"], {
        encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    const match = inspected.status === 0
      ? /^Time stamp:\s*(.+?)\s*$/mi.exec(inspected.stdout) : null;
    const parsed = match ? Date.parse(match[1]) : Number.NaN;
    if (inspected.error || inspected.status !== 0 || !Number.isFinite(parsed)) {
      throw new Error("EXTERNAL_ANCHOR_RFC3161_PROVIDER_TIME_UNAVAILABLE");
    }
    providerProofTime = new Date(parsed).toISOString();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return {
    cryptographicBindingReportedByVerifierProcess:
      "RFC3161_MESSAGE_IMPRINT_NONCE_AND_X509_PATH_CALLER_SELECTABLE_PROCESS_DECISION_ACCEPTED",
    verificationDecisionAccepted: true,
    reportedExistenceTimeClaim: true,
    reportedProviderProofTime: providerProofTime,
    reportedProviderProofTimeClaim: true,
    existenceTimeVerified: false,
    providerProofTime: null,
    providerProofTimeVerified: false,
    inclusionProofVerified: false,
    checkpointSignatureVerified: false,
    appendOnlyConsistencyVerified: false,
    publicAuditabilityEstablished: false,
    auditabilityProfile: "NONE",
    witnessSignaturesVerified: 0,
    witnessOperatorIndependenceEstablished: false,
    verificationBoundary:
      "CALLER_SELECTABLE_OPENSSL_PROCESS_AND_CALLER_SUPPLIED_TRUST_ROOT",
  };
}

function uint(value, label) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label}_INVALID`);
  }
  const parsed = BigInt(value);
  if (parsed > 0x7fffffffffffffffn) throw new Error(`${label}_INVALID`);
  return parsed;
}

function parseCheckpoint(envelope) {
  if (typeof envelope !== "string" || Buffer.byteLength(envelope) > 128 * 1024
    || !envelope.endsWith("\n") || /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(envelope)) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_CHECKPOINT_INVALID");
  }
  const separator = envelope.indexOf("\n\n");
  if (separator < 0) throw new Error("EXTERNAL_ANCHOR_REKOR_CHECKPOINT_INVALID");
  const noteText = envelope.slice(0, separator + 1);
  const signatureBlock = envelope.slice(separator + 2);
  const noteLines = noteText.slice(0, -1).split("\n");
  if (noteLines.length < 3 || noteLines.some((line) => line.length === 0)) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_CHECKPOINT_INVALID");
  }
  const root = strictBase64(noteLines[2], { expectedBytes: 32, maximumBytes: 32 });
  const signatures = signatureBlock.trimEnd().split("\n").map((line) => {
    const match = /^— ([^+\s]+) ([A-Za-z0-9+/]+={0,2})$/u.exec(line);
    if (!match) throw new Error("EXTERNAL_ANCHOR_REKOR_CHECKPOINT_SIGNATURE_INVALID");
    return { name: match[1], bytes: strictBase64(match[2], { maximumBytes: 8192 }) };
  });
  if (signatures.length === 0 || signatures.length > 16) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_CHECKPOINT_SIGNATURE_INVALID");
  }
  return { noteText, origin: noteLines[0], treeSize: uint(noteLines[1],
    "EXTERNAL_ANCHOR_REKOR_TREE_SIZE"), root, signatures };
}

function ed25519Raw(publicKey) {
  const derBytes = publicKey.export({ type: "spki", format: "der" });
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  if (derBytes.length !== prefix.length + 32 || !derBytes.subarray(0, prefix.length).equals(prefix)) {
    throw new Error("EXTERNAL_ANCHOR_ED25519_KEY_INVALID");
  }
  return derBytes.subarray(prefix.length);
}

function checkpointKey(name, publicKeyPem, signatureType) {
  const key = createPublicKey(publicKeyPem);
  const derBytes = key.export({ type: "spki", format: "der" });
  if (signatureType === "LOG") {
    if (key.asymmetricKeyType === "ed25519") {
      const fullId = digestBytes(Buffer.concat([
        Buffer.from(`${name}\n`), Buffer.from([0x01]), ed25519Raw(key),
      ]));
      return { key, id: fullId.subarray(0, 4), fullId, algorithm: "Ed25519" };
    }
    if (key.asymmetricKeyType === "ec") {
      const fullId = digestBytes(derBytes);
      return { key, id: fullId.subarray(0, 4), fullId, algorithm: "ECDSA_SHA256" };
    }
    throw new Error("EXTERNAL_ANCHOR_REKOR_LOG_KEY_UNSUPPORTED");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("EXTERNAL_ANCHOR_REKOR_WITNESS_KEY_UNSUPPORTED");
  }
  const fullId = digestBytes(Buffer.concat([
    Buffer.from(`${name}\n`), Buffer.from([0x04]), ed25519Raw(key),
  ]));
  return { key, id: fullId.subarray(0, 4), fullId, algorithm: "ED25519_COSIGNATURE_V1" };
}

function findAndVerifyLogSignature(checkpoint, trust) {
  const known = checkpointKey(trust.origin, trust.logPublicKeyPem, "LOG");
  let verified = false;
  for (const signature of checkpoint.signatures) {
    if (signature.name !== trust.origin || signature.bytes.length < 5
      || !signature.bytes.subarray(0, 4).equals(known.id)) continue;
    const signatureBytes = signature.bytes.subarray(4);
    const ok = known.algorithm === "Ed25519"
      ? cryptoVerify(null, Buffer.from(checkpoint.noteText), known.key, signatureBytes)
      : cryptoVerify("sha256", Buffer.from(checkpoint.noteText), known.key, signatureBytes);
    if (!ok) throw new Error("EXTERNAL_ANCHOR_REKOR_KNOWN_LOG_SIGNATURE_INVALID");
    verified = true;
  }
  if (!verified) throw new Error("EXTERNAL_ANCHOR_REKOR_LOG_SIGNATURE_UNTRUSTED");
  return known;
}

function verifyWitnesses(checkpoint, witnesses) {
  const verifiedNames = new Set();
  for (const witness of witnesses) {
    const known = checkpointKey(witness.name, witness.publicKeyPem, "WITNESS");
    for (const signature of checkpoint.signatures) {
      if (signature.name !== witness.name || signature.bytes.length !== 76
        || !signature.bytes.subarray(0, 4).equals(known.id)) continue;
      const timestampBytes = signature.bytes.subarray(4, 12);
      const timestamp = timestampBytes.readBigUInt64BE();
      if (timestamp === 0n || timestamp > 0x7fffffffffffffffn) {
        throw new Error("EXTERNAL_ANCHOR_REKOR_WITNESS_TIME_INVALID");
      }
      const signedMessage = Buffer.from(`cosignature/v1\ntime ${timestamp}\n${checkpoint.noteText}`);
      if (!cryptoVerify(null, signedMessage, known.key, signature.bytes.subarray(12))) {
        throw new Error("EXTERNAL_ANCHOR_REKOR_KNOWN_WITNESS_SIGNATURE_INVALID");
      }
      verifiedNames.add(witness.name);
    }
  }
  return verifiedNames.size;
}

function merkleInclusion({ leaf, index, size, path: proof, expectedRoot }) {
  if (size <= 0n || index < 0n || index >= size) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_INCLUSION_POSITION_INVALID");
  }
  let node = digestBytes(Buffer.concat([Buffer.from([0x00]), leaf]));
  let fn = index;
  let sn = size - 1n;
  for (const sibling of proof) {
    if ((fn & 1n) === 1n || fn === sn) {
      node = digestBytes(Buffer.concat([Buffer.from([0x01]), sibling, node]));
      while (fn !== 0n && (fn & 1n) === 0n) {
        fn >>= 1n;
        sn >>= 1n;
      }
    } else {
      node = digestBytes(Buffer.concat([Buffer.from([0x01]), node, sibling]));
    }
    fn >>= 1n;
    sn >>= 1n;
  }
  if (sn !== 0n || !node.equals(expectedRoot)) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_INCLUSION_PROOF_INVALID");
  }
}

function extractRekorSubject(canonicalizedBody) {
  let body;
  try { body = JSON.parse(canonicalizedBody.toString("utf8")); } catch {
    throw new Error("EXTERNAL_ANCHOR_REKOR_BODY_JSON_INVALID");
  }
  if (!exactKeys(body, ["apiVersion", "kind", "spec"])
    || body.apiVersion !== "0.0.2" || body.kind !== "hashedrekord" || !plain(body.spec)) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_BODY_UNSUPPORTED");
  }
  const specKeys = Object.keys(body.spec);
  if (specKeys.length !== 1
    || !["hashedRekordV002", "hashedRekordV0_0_2"].includes(specKeys[0])) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_BODY_UNSUPPORTED");
  }
  const record = body.spec[specKeys[0]];
  if (!exactKeys(record, ["data", "signature"])
    || !exactKeys(record.data, ["algorithm", "digest"])
    || record.data.algorithm !== "SHA2_256"
    || !exactKeys(record.signature, ["content", "verifier"])
    || typeof record.signature.content !== "string"
    || !plain(record.signature.verifier)
    || typeof record.signature.verifier.keyDetails !== "string"
    || record.signature.verifier.keyDetails.length === 0) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_BODY_UNSUPPORTED");
  }
  strictBase64(record.signature.content, { maximumBytes: 64 * 1024 });
  const verifierKeys = Object.keys(record.signature.verifier).sort();
  if (verifierKeys.join("\0") !== ["keyDetails", "publicKey"].sort().join("\0")
    && verifierKeys.join("\0") !== ["keyDetails", "x509Certificate"].sort().join("\0")) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_BODY_UNSUPPORTED");
  }
  const verifierMaterial = record.signature.verifier.publicKey
    ?? record.signature.verifier.x509Certificate;
  if (!exactKeys(verifierMaterial, ["rawBytes"])) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_BODY_UNSUPPORTED");
  }
  strictBase64(verifierMaterial.rawBytes, { maximumBytes: 64 * 1024 });
  return strictBase64(record.data.digest, { expectedBytes: 32, maximumBytes: 32 });
}

function verifyRekor({ request, artifact, policy }) {
  let bundle;
  try { bundle = JSON.parse(artifact.toString("utf8")); } catch {
    throw new Error("EXTERNAL_ANCHOR_REKOR_BUNDLE_JSON_INVALID");
  }
  if (!plain(bundle) || !plain(bundle.inclusionProof)
    || typeof bundle.canonicalizedBody !== "string"
    || typeof bundle.inclusionProof.checkpoint?.envelope !== "string"
    || !Array.isArray(bundle.inclusionProof.hashes)) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_BUNDLE_SHAPE_INVALID");
  }
  const canonicalizedBody = strictBase64(bundle.canonicalizedBody,
    { maximumBytes: 256 * 1024 });
  const subject = extractRekorSubject(canonicalizedBody);
  if (!subject.equals(Buffer.from(request.subjectDigest.digestHex, "hex"))) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_SUBJECT_MISMATCH");
  }
  if (bundle.kindVersion?.kind !== "hashedrekord" || bundle.kindVersion?.version !== "0.0.2") {
    throw new Error("EXTERNAL_ANCHOR_REKOR_KIND_VERSION_MISMATCH");
  }
  const checkpoint = parseCheckpoint(bundle.inclusionProof.checkpoint.envelope);
  if (checkpoint.origin !== policy.trustMaterial.origin) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_ORIGIN_MISMATCH");
  }
  const logKey = findAndVerifyLogSignature(checkpoint, policy.trustMaterial);
  if (!plain(bundle.logId) || strictBase64(bundle.logId.keyId,
    { expectedBytes: 32, maximumBytes: 32 }).equals(logKey.fullId) === false) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_LOG_ID_MISMATCH");
  }
  const logIndex = uint(String(bundle.logIndex), "EXTERNAL_ANCHOR_REKOR_LOG_INDEX");
  if (bundle.inclusionProof.hashes.length > 63) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_INCLUSION_PROOF_INVALID");
  }
  const path = bundle.inclusionProof.hashes.map((value) => strictBase64(value,
    { expectedBytes: 32, maximumBytes: 32 }));
  merkleInclusion({ leaf: canonicalizedBody, index: logIndex, size: checkpoint.treeSize,
    path, expectedRoot: checkpoint.root });
  const witnessCount = verifyWitnesses(checkpoint, policy.trustMaterial.witnesses);
  if (witnessCount < policy.requirements.independentWitnessQuorum) {
    throw new Error("EXTERNAL_ANCHOR_REKOR_WITNESS_QUORUM_NOT_MET");
  }
  const witnessed = policy.requirements.independentWitnessQuorum > 0;
  return {
    cryptographicBindingVerified:
      "REKOR_V2_HASHEDREKORD_DIGEST_IN_SIGNED_CHECKPOINT",
    verificationDecisionAccepted: true,
    existenceTimeVerified: witnessed,
    /* Rekor v2's integratedTime is deliberately zero.  A checkpoint or
       cosignature can prove inclusion/consistency, but this profile does not
       promote a local capture time to a provider-authenticated existence
       timestamp.  Pair it with RFC 3161 when time ordering is required. */
    providerProofTime: null,
    providerProofTimeVerified: false,
    inclusionProofVerified: true,
    checkpointSignatureVerified: true,
    appendOnlyConsistencyVerified: witnessed,
    publicAuditabilityEstablished: false,
    auditabilityProfile: "REKOR_TRANSPARENCY_LOG_OFFLINE_BUNDLE_ONLY",
    witnessSignaturesVerified: witnessCount,
    witnessOperatorIndependenceEstablished: false,
    verificationBoundary: "BUILT_IN_REKOR_V2_CHECKPOINT_AND_RFC6962_PROOF_VERIFIER",
  };
}

function verifyScitt({ request, artifact, policy, scittVerifier }) {
  if (typeof scittVerifier !== "function") {
    throw new Error("EXTERNAL_ANCHOR_SCITT_PINNED_VERIFIER_REQUIRED");
  }
  const pin = policy.trustMaterial.verifierPin;
  const decision = scittVerifier({
    receipt: Buffer.from(artifact),
    receiptMediaType: "application/scitt-receipt+cose",
    subjectDigest: `sha256:${request.subjectDigest.digestHex}`,
    transparencyServiceIssuer: policy.trustMaterial.transparencyServiceIssuer,
    trustedKeysHash: policy.trustMaterial.trustedKeysHash,
    witnessPolicyHash: policy.trustMaterial.witnessPolicyHash,
    verifierPin: pin,
  });
  if (!exactKeys(decision, ["ok", "verifierPin", "subjectDigest",
    "transparencyServiceIssuer", "inclusionVerified", "consistencyVerified",
    "existenceTimeVerified", "providerProofTime", "providerProofTimeVerified",
    "independentWitnessesVerified"])
    || decision.ok !== true || decision.verifierPin !== pin
    || decision.subjectDigest !== `sha256:${request.subjectDigest.digestHex}`
    || decision.transparencyServiceIssuer
      !== policy.trustMaterial.transparencyServiceIssuer
    || decision.inclusionVerified !== true
    || typeof decision.consistencyVerified !== "boolean"
    || typeof decision.existenceTimeVerified !== "boolean"
    || typeof decision.providerProofTimeVerified !== "boolean"
    || (decision.providerProofTimeVerified
      ? (!canonicalIso(decision.providerProofTime)
        || decision.existenceTimeVerified !== true)
      : decision.providerProofTime !== null)
    || !Number.isSafeInteger(decision.independentWitnessesVerified)
    || decision.independentWitnessesVerified < 0
    || (policy.requirements.appendOnlyConsistencyRequired
      && decision.consistencyVerified !== true)
    || decision.independentWitnessesVerified
      < policy.requirements.independentWitnessQuorum) {
    throw new Error("EXTERNAL_ANCHOR_SCITT_VERIFIER_DECISION_INVALID");
  }
  return {
    cryptographicBindingReportedByVerifierCallback:
      "SCITT_RFC9943_CALLER_PINNED_VERIFIER_DECISION_ACCEPTED",
    verificationDecisionAccepted: true,
    reportedExistenceTimeClaim: decision.existenceTimeVerified,
    reportedProviderProofTime: decision.providerProofTime,
    reportedProviderProofTimeClaim: decision.providerProofTimeVerified,
    reportedInclusionClaim: decision.inclusionVerified,
    reportedConsistencyClaim: decision.consistencyVerified,
    reportedWitnessCount: decision.independentWitnessesVerified,
    existenceTimeVerified: false,
    providerProofTime: null,
    providerProofTimeVerified: false,
    inclusionProofVerified: false,
    checkpointSignatureVerified: false,
    appendOnlyConsistencyVerified: false,
    publicAuditabilityEstablished: false,
    auditabilityProfile: "SCITT_RFC9943_RECEIPT_OFFLINE_ONLY",
    witnessSignaturesVerified: 0,
    witnessOperatorIndependenceEstablished: false,
    verificationBoundary:
      "CALLER_SUPPLIED_PINNED_SCITT_CALLBACK_NO_MAINTAINER_VERIFIER_REGISTRY",
  };
}

export function verifyExternalAnchorEvidence({ request, evidence, trustPolicy,
  opensslPath = "/usr/bin/openssl", scittVerifier = null } = {}) {
  try {
    const requestBody = assertRequest(request);
    const { body: evidenceBody, bytes } = assertEvidence(evidence);
    const policyBody = assertPolicy(trustPolicy);
    if (evidenceBody.requestHash !== request.requestHash
      || evidenceBody.profile !== requestBody.profile.kind
      || policyBody.profile.kind !== requestBody.profile.kind
      || evidenceBody.providerId !== policyBody.provider.providerId
      || evidenceBody.artifact.mediaType !== requestBody.expectedReceiptMediaType) {
      throw new Error("EXTERNAL_ANCHOR_BINDING_MISMATCH");
    }
    let proof;
    if (requestBody.profile.kind === EXTERNAL_ANCHOR_PROFILES.RFC3161) {
      proof = verifyRfc3161({ request: requestBody, artifact: bytes,
        policy: policyBody, opensslPath });
    } else if (requestBody.profile.kind === EXTERNAL_ANCHOR_PROFILES.REKOR_V2) {
      proof = verifyRekor({ request: requestBody, artifact: bytes, policy: policyBody });
    } else {
      proof = verifyScitt({ request: requestBody, artifact: bytes,
        policy: policyBody, scittVerifier });
    }
    const relationship = policyBody.provider.operatorRelationship;
    const builtInCryptographicVerification = requestBody.profile.kind
      === EXTERNAL_ANCHOR_PROFILES.REKOR_V2;
    return {
      ok: true,
      assurance: builtInCryptographicVerification
        ? EXTERNAL_ANCHOR_ASSURANCE.CRYPTOGRAPHIC_ONLY
        : EXTERNAL_ANCHOR_ASSURANCE.VERIFICATION_DECISION_ONLY,
      verificationDecisionAccepted: true,
      builtInCryptographicVerification,
      cryptographicArtifactVerified: builtInCryptographicVerification,
      trustBoundary:
        "CALLER_SUPPLIED_POLICY_AND_TRUST_ROOT_NO_MAINTAINER_EXTERNAL_REGISTRY",
      operatorRelationshipClaimed: relationship,
      remoteClaimed: relationship !== ANCHOR_OPERATOR_RELATIONSHIPS.LOCAL_SELF,
      independent: false,
      operatorIndependenceEstablished: false,
      independenceBasis: "OUT_OF_RECORD_POLICY_ASSERTION_NOT_CRYPTOGRAPHICALLY_DERIVED",
      requestHash: request.requestHash,
      evidenceHash: evidence.evidenceHash,
      policyHash: trustPolicy.policyHash,
      providerId: policyBody.provider.providerId,
      networkSubmissionPerformedByThisModule: false,
      proof,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
