import assert from "node:assert/strict";
import { createHash, createPublicKey, generateKeyPairSync,
  sign as cryptoSign } from "node:crypto";
import test from "node:test";
import { isProxy } from "node:util/types";

import {
  NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS,
  NETWORK_ACTION_OUTCOME_V2_OBSERVATION_STATUSES,
  NETWORK_INTAKE_BOUNDARY, NETWORK_INTAKE_LANES, NETWORK_INTAKE_MAX_PAYLOAD_BYTES,
  NETWORK_INTAKE_PAYLOAD_SCHEMAS, NETWORK_INTAKE_SCHEMAS,
  createNetworkIntakeChallenge, createNetworkIntakeManifest,
  createNetworkIntakePayloadEnvelope, createNetworkIntakeReceipt,
  createNetworkIntakeReservation, createNetworkIntakeRevocation,
  createNetworkIntakeRevocationAcknowledgment,
  encodeNetworkIntakePayload, networkIntakeDigest,
  verifyNetworkIntakeChallenge, verifyNetworkIntakeManifest,
  verifyNetworkIntakePayloadEnvelope, verifyNetworkIntakeReceipt,
  verifyNetworkIntakePayloadTransportProof, verifyNetworkIntakeReservation,
  verifyNetworkIntakeRevocation, verifyNetworkIntakeRevocationAcknowledgment,
} from "../src/outsider-network-intake.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
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

function addressedSignedForTest(body, domain, hashField, signer) {
  const unsigned = { ...body, signature: null };
  const valueHash = networkIntakeDigest(domain, unsigned);
  return { ...unsigned, [hashField]: valueHash,
    signature: { algorithm: "Ed25519", keyId: keyId(signer.publicKey),
      publicKeyPem: signer.publicKey,
      value: cryptoSign(null, Buffer.from(valueHash), signer.privateKey).toString("base64") } };
}

function subject(lane) {
  const materialized = lane !== "PROSPECTIVE_CENSUS";
  return {
    claimHash: h(`claim:${lane}`), wayHash: h(`way:${lane}`), worldHash: h(`world:${lane}`),
    episodeHash: materialized ? h(`episode:${lane}`) : null,
    attemptHash: materialized ? h(`attempt:${lane}`) : null,
    actorIdentityEnvelopeHash: materialized ? h(`actor-envelope:${lane}`) : null,
    accountableDeploymentSubjectHash: materialized ? h(`deployment:${lane}`) : null,
    attemptActorSubjectHash: materialized ? h(`acting-stack:${lane}`) : null,
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
      sourceArtifactHash: h(`source-artifact:${suffix}`),
      sourceReplayReferenceHash: h(`source-replay:${suffix}`),
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
    instrumentPlanHash: h(`instrument-plan:${suffix}`),
    preActionRegistrationReferenceHash: h(`registration:${suffix}`),
    externalTimeAnchorHash: null,
    prospectiveRegistrationEstablishedAtNetworkEdge: false,
    scientificCensusCompletenessEstablishedAtNetworkEdge: false,
  };
}

function actionOutcomeV2Payload(selectedSubject, observationStatus = "OBSERVED",
  suffix = "v2") {
  const observed = observationStatus === "OBSERVED";
  return {
    schema: NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2,
    baseActionOutcomeManifestHash: h(`base-manifest:${suffix}`),
    baseActionOutcomeBundleHash: h(`base-bundle:${suffix}`),
    baseActionOutcomeOccurrenceIdentityHash: h(`base-occurrence:${suffix}`),
    attemptRecordHash: selectedSubject.attemptHash,
    executionEvidenceHash: h(`execution:${suffix}`),
    observationStatus,
    outcomeWitnessEnvelopeHash: h(`witness-envelope:${suffix}`),
    witnessSourceManifestHash: h(`witness-source:${suffix}`),
    witnessReplayReceiptHash: h(`witness-replay:${suffix}`),
    witnessRelationshipReviewHash: h(`witness-relationship:${suffix}`),
    consequenceReportHash: observed ? h(`consequence:${suffix}`) : null,
    affectedPartyRegisterRootHash: h(`affected-party-root:${suffix}`),
    affectedPartyReportSetHash: observed ? h(`affected-party-reports:${suffix}`) : null,
    recoveryEvidenceSetHash: observed ? h(`recovery-evidence:${suffix}`) : null,
    obligationGenesisHash: h(`obligation-genesis:${suffix}`),
    obligationStateHash: h(`obligation-state:${suffix}`),
    horizonId: "delayed",
    obligationHorizonCommitmentHash: h(`obligation-horizon:${suffix}`),
    affectedPartyHorizonBindingHash: h(`affected-party-horizon:${suffix}`),
    observedAt: "2026-08-28T00:08:00.000Z",
    externalOutcomeVerified: false,
    causalAttributionEstablished: false,
    obligationClosed: false,
  };
}

function manifestInput(lane, payload = undefined) {
  const selectedSubject = subject(lane);
  const selectedPayload = payload ?? payloadForLane(lane, selectedSubject);
  return {
    lane, clientSubmissionId: `submission_${lane.toLowerCase()}`,
    payloadSchema: selectedPayload.schema,
    payload: selectedPayload, subject: selectedSubject,
    source: { sourceManifestHash: h(`source:${lane}`), instrumentHash: h(`instrument:${lane}`),
      rightsReviewHash: h(`rights:${lane}`), privacyReviewHash: h(`privacy:${lane}`) },
    consentHash: h(`consent:${lane}`), retentionDays: 30,
    createdAt: "2026-08-28T00:00:00.000Z",
  };
}

function buildChain(lane = "ACTION_OUTCOME", payload = undefined, keys = {}) {
  const transport = keys.transport ?? pair();
  const server = keys.server ?? pair();
  const audience = "https://intake.outsider.example";
  const input = manifestInput(lane, payload);
  const exactPayload = input.payload;
  const manifest = createNetworkIntakeManifest(input);
  const challenge = createNetworkIntakeChallenge({ manifestHash: manifest.manifestHash,
    transportSignerKeyId: keyId(transport.publicKey), audience,
    nonce: `nonce_${lane.toLowerCase()}_000001`, issuedAt: "2026-08-28T00:00:01.000Z",
    expiresAt: "2026-08-28T00:10:01.000Z", serverPrivateKeyPem: server.privateKey });
  const reservation = createNetworkIntakeReservation({ manifest, challenge,
    transportPrivateKeyPem: transport.privateKey, serverPublicKeyPem: server.publicKey,
    expectedAudience: audience, reservedAt: "2026-08-28T00:05:00.000Z",
    expiresAt: "2026-08-28T00:09:00.000Z" });
  const payloadEnvelope = createNetworkIntakePayloadEnvelope({ reservation, challenge,
    payload: exactPayload,
    transportPrivateKeyPem: transport.privateKey, serverPublicKeyPem: server.publicKey,
    expectedAudience: audience, createdAt: "2026-08-28T00:06:00.000Z" });
  const receipt = createNetworkIntakeReceipt({ reservation, payloadEnvelope, challenge,
    serverPublicKeyPem: server.publicKey, expectedAudience: audience, registryId: "registry-a",
    eventOrdinal: 1, eventHash: h(`event:${lane}`), objectAlreadyPresent: false,
    receivedAt: "2026-08-28T00:07:00.000Z", retentionUntil: "2026-09-27T00:07:00.000Z",
    serverPrivateKeyPem: server.privateKey });
  return { transport, server, audience, payload: exactPayload, manifest, challenge, reservation,
    payloadEnvelope, receipt };
}

test("the three lanes complete an exact signed chain and remain QUARANTINED", () => {
  assert.deepEqual(NETWORK_INTAKE_LANES, ["DELEGATION_RESPONSIBILITY", "ACTION_OUTCOME",
    "PROSPECTIVE_CENSUS"]);
  for (const lane of NETWORK_INTAKE_LANES) {
    const f = buildChain(lane);
    const results = [
      verifyNetworkIntakeManifest(f.manifest, { payload: f.payload }),
      verifyNetworkIntakeChallenge(f.challenge, { serverPublicKeyPem: f.server.publicKey,
        expectedAudience: f.audience, expectedManifestHash: f.manifest.manifestHash,
        expectedTransportSignerKeyId: keyId(f.transport.publicKey),
        at: "2026-08-28T00:05:00.000Z" }),
      verifyNetworkIntakeReservation(f.reservation, { challenge: f.challenge,
        serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience }),
      verifyNetworkIntakePayloadEnvelope(f.payloadEnvelope, { reservation: f.reservation,
        challenge: f.challenge, serverPublicKeyPem: f.server.publicKey,
        expectedAudience: f.audience }),
      verifyNetworkIntakeReceipt(f.receipt, { reservation: f.reservation,
        payloadEnvelope: f.payloadEnvelope, challenge: f.challenge,
        serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience }),
    ];
    for (const result of results) {
      assert.equal(result.ok, true);
      assert.deepEqual(result.useBoundary, NETWORK_INTAKE_BOUNDARY);
      assert.equal(result.useBoundary.disposition, "QUARANTINED");
      assert.equal(result.useBoundary.automaticTraining, false);
      assert.equal(result.useBoundary.trainingRows, 0);
      assert.equal(result.useBoundary.permitsCuratePromotion, false);
      assert.equal(result.useBoundary.authority, "NONE");
      assert.equal(result.useBoundary.actionReady, false);
      assert.equal(result.useBoundary.executable, false);
      assert.equal(result.useBoundary.causalExperienceUnits, 0);
    }
  }
});

test("canonical bytes, semantic hash, object identity and occurrence identity are distinct", () => {
  const firstInput = manifestInput("ACTION_OUTCOME");
  const payload = firstInput.payload;
  const manifest = createNetworkIntakeManifest(firstInput);
  const reordered = { obligationClosed: false, schema: payload.schema,
    sourceReplayReferenceHash: payload.sourceReplayReferenceHash,
    externalOutcomeVerified: false, outcomeEvidenceHash: payload.outcomeEvidenceHash,
    sourceArtifactHash: payload.sourceArtifactHash,
    causalAttributionEstablished: false, executionEvidenceHash: payload.executionEvidenceHash,
    obligationStateHash: payload.obligationStateHash,
    attemptRecordHash: payload.attemptRecordHash };
  assert.equal(verifyNetworkIntakeManifest(manifest, { payload: reordered }).ok, true);
  const changed = { ...payload, outcomeEvidenceHash: h("changed-outcome") };
  assert.equal(verifyNetworkIntakeManifest(manifest, { payload: changed }).ok, false);
  assert.match(manifest.payload.payloadByteHash, /^sha256:/u);
  assert.match(manifest.payload.payloadSemanticHash, /^sha256:/u);
  assert.match(manifest.payload.objectIdentityHash, /^sha256:/u);
  assert.match(manifest.occurrenceIdentityHash, /^sha256:/u);
  assert.notEqual(manifest.payload.objectIdentityHash, manifest.occurrenceIdentityHash);
  const secondInput = manifestInput("ACTION_OUTCOME", payload);
  secondInput.clientSubmissionId = "submission_action_outcome_second";
  secondInput.createdAt = "2026-08-28T00:00:01.000Z";
  const second = createNetworkIntakeManifest(secondInput);
  assert.equal(second.payload.objectIdentityHash, manifest.payload.objectIdentityHash,
    "identical canonical payloads share one CAS identity");
  assert.notEqual(second.occurrenceIdentityHash, manifest.occurrenceIdentityHash,
    "separate submissions remain separate denominator occurrences");
});

test("ACTION_OUTCOME/v1 golden bytes remain frozen while v2 is an append-only lane schema", () => {
  const v1 = payloadForLane("ACTION_OUTCOME", subject("ACTION_OUTCOME"));
  const encoded = encodeNetworkIntakePayload(v1);
  assert.equal(encoded.payloadBytes, 733);
  assert.equal(encoded.payloadByteHash,
    "sha256:fd9831c33373dae60409936c9c9017a38e5c585f2d40374be16de750ef553c50");
  assert.equal(encoded.payloadSemanticHash,
    "sha256:a17e96c4a2ccd8b0d59d16d3643ed1cb38ad7d1becde41714c28d18eabe9a4d4");
  assert.equal(NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V1,
    NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME);
  assert.equal(NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
    "outsider/network-action-outcome-projection/v1");

  const selectedSubject = subject("ACTION_OUTCOME");
  const payload = actionOutcomeV2Payload(selectedSubject);
  const manifest = createNetworkIntakeManifest(manifestInput("ACTION_OUTCOME", payload));
  assert.equal(manifest.lane, "ACTION_OUTCOME");
  assert.equal(manifest.payloadSchema, NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2);
  assert.equal(verifyNetworkIntakeManifest(manifest, { payload }).ok, true);
  assert.equal(manifest.useBoundary.disposition, "QUARANTINED");
  assert.equal(manifest.useBoundary.trainingRows, 0);
  assert.equal(manifest.useBoundary.causalExperienceUnits, 0);
});

test("ACTION_OUTCOME/v2 observation states and role hashes fail closed", () => {
  assert.deepEqual(NETWORK_ACTION_OUTCOME_V2_OBSERVATION_STATUSES,
    ["CENSORED", "MISSING", "OBSERVED", "REFUSED", "UNAVAILABLE"]);
  for (const status of NETWORK_ACTION_OUTCOME_V2_OBSERVATION_STATUSES) {
    const selectedSubject = subject("ACTION_OUTCOME");
    const payload = actionOutcomeV2Payload(selectedSubject, status, status.toLowerCase());
    assert.doesNotThrow(() => createNetworkIntakeManifest(
      manifestInput("ACTION_OUTCOME", payload)));
  }
  const missingWithEvidence = actionOutcomeV2Payload(subject("ACTION_OUTCOME"), "MISSING");
  missingWithEvidence.consequenceReportHash = h("forged-missing-consequence");
  assert.throws(() => createNetworkIntakeManifest(manifestInput("ACTION_OUTCOME",
    missingWithEvidence)), /UNOBSERVED_EVIDENCE_MUST_BE_NULL/u);

  const observedWithoutReport = actionOutcomeV2Payload(subject("ACTION_OUTCOME"));
  observedWithoutReport.affectedPartyReportSetHash = null;
  assert.throws(() => createNetworkIntakeManifest(manifestInput("ACTION_OUTCOME",
    observedWithoutReport)), /OBSERVED_EVIDENCE_REQUIRED/u);

  const roleCollision = actionOutcomeV2Payload(subject("ACTION_OUTCOME"));
  roleCollision.witnessReplayReceiptHash = roleCollision.outcomeWitnessEnvelopeHash;
  assert.throws(() => createNetworkIntakeManifest(manifestInput("ACTION_OUTCOME",
    roleCollision)), /WITNESS_REFERENCE_ROLE_COLLISION/u);

  const wrongLane = manifestInput("DELEGATION_RESPONSIBILITY",
    actionOutcomeV2Payload(subject("DELEGATION_RESPONSIBILITY")));
  assert.throws(() => createNetworkIntakeManifest(wrongLane),
    /PAYLOAD_SCHEMA_NOT_ALLOWLISTED_FOR_LANE/u);

  for (const field of ["externalOutcomeVerified", "causalAttributionEstablished",
    "obligationClosed"]) {
    const escalated = actionOutcomeV2Payload(subject("ACTION_OUTCOME"));
    escalated[field] = true;
    assert.throws(() => createNetworkIntakeManifest(manifestInput("ACTION_OUTCOME",
      escalated)), /MUST_REMAIN_FALSE/u);
  }
});

test("lane and lane-specific identity requirements fail closed", () => {
  const unknownLane = manifestInput("ACTION_OUTCOME");
  unknownLane.lane = "UNKNOWN";
  assert.throws(() => createNetworkIntakeManifest(unknownLane), /LANE_INVALID/);
  const missingActor = manifestInput("ACTION_OUTCOME");
  missingActor.subject.attemptActorSubjectHash = null;
  assert.throws(() => createNetworkIntakeManifest(missingActor), /MATERIALIZED_SUBJECT_REQUIRED/);
  const partialCensus = manifestInput("PROSPECTIVE_CENSUS");
  partialCensus.subject.episodeHash = h("post-hoc-episode");
  assert.throws(() => createNetworkIntakeManifest(partialCensus),
    /CENSUS_SUBJECT_PARTIALLY_MATERIALIZED/);
});

test("extras, accessors, sparse arrays and proxies are rejected without invoking traps", () => {
  const extra = manifestInput("ACTION_OUTCOME");
  extra.extra = false;
  assert.throws(() => createNetworkIntakeManifest(extra), /FIELDS_INVALID/);
  let invoked = 0;
  const accessor = manifestInput("ACTION_OUTCOME");
  Object.defineProperty(accessor.payload, "trap", { enumerable: true, get() { invoked += 1; } });
  assert.throws(() => createNetworkIntakeManifest(accessor),
    /ACCESSOR_FORBIDDEN|enumerable data properties/);
  assert.equal(invoked, 0);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => encodeNetworkIntakePayload(sparse), /dense and undecorated/);
  const proxied = new Proxy({ kind: "fact" }, { get() { invoked += 1; return "trap"; } });
  assert.equal(isProxy(proxied), true);
  assert.throws(() => encodeNetworkIntakePayload(proxied), /PROXY_FORBIDDEN/);
  assert.equal(invoked, 0);
});

test("obvious URLs, media, direct identifiers, secrets and oversize payloads are rejected", () => {
  for (const payload of [{ endpoint: "https://example.invalid/raw" },
    { picture: "data:image/png;base64,AA==" }, { access_token: "secret" },
    { privateKey: "secret" }, { imageBase64: "AA==" }, { fullName: "Example Person" },
    { emailAddress: "person@example.invalid" }, { phoneNumber: "+1-555-0100" },
    { preciseLocation: "somewhere" }, { ipAddress: "192.0.2.1" }]) {
    assert.throws(() => encodeNetworkIntakePayload(payload), /PAYLOAD_/);
  }
  assert.throws(() => encodeNetworkIntakePayload({ value: "x".repeat(
    NETWORK_INTAKE_MAX_PAYLOAD_BYTES + 1) }), /PAYLOAD_/);
  assert.equal(NETWORK_INTAKE_BOUNDARY.structuralPrivacyGuards, true);
  assert.equal(NETWORK_INTAKE_BOUNDARY.noPiiGuaranteed, false);
  assert.equal(NETWORK_INTAKE_BOUNDARY.noRawMediaGuaranteed, false);
  assert.equal(NETWORK_INTAKE_BOUNDARY.payloadSchemaAllowlistEnforced, true);
  assert.equal(NETWORK_INTAKE_BOUNDARY.acceptedPayloadsAreExactHashOnlyProjections, true);
  assert.equal(NETWORK_INTAKE_BOUNDARY.publicDeploymentReady, false);
});

test("lane payload schemas are exact, hash-only and cannot self-assert promotion", () => {
  for (const lane of NETWORK_INTAKE_LANES) {
    const input = manifestInput(lane);
    assert.equal(input.payload.schema, NETWORK_INTAKE_PAYLOAD_SCHEMAS[lane]);
    assert.doesNotThrow(() => createNetworkIntakeManifest(input));
    const wrongSchema = structuredClone(input);
    wrongSchema.payloadSchema = lane === "ACTION_OUTCOME"
      ? NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS
      : NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME;
    assert.throws(() => createNetworkIntakeManifest(wrongSchema),
      /PAYLOAD_SCHEMA_NOT_ALLOWLISTED_FOR_LANE/);
    const extra = structuredClone(input);
    extra.payload.note = "no free text";
    assert.throws(() => createNetworkIntakeManifest(extra), /PAYLOAD.*FIELDS_INVALID/);
  }
  const delegation = manifestInput("DELEGATION_RESPONSIBILITY");
  const changedManifestSubject = structuredClone(delegation);
  changedManifestSubject.subject.accountableDeploymentSubjectHash = h("another-account");
  assert.throws(() => createNetworkIntakeManifest(changedManifestSubject),
    /DELEGATION_SUBJECT_BINDING_MISMATCH/);
  const changedPayloadSubject = structuredClone(delegation);
  changedPayloadSubject.payload.accountableDeploymentSubjectHash = h("another-account");
  assert.throws(() => createNetworkIntakeManifest(changedPayloadSubject),
    /DELEGATION_SUBJECT_BINDING_MISMATCH/);
  const sameAccountNewAttempt = structuredClone(delegation);
  sameAccountNewAttempt.subject.episodeHash = h("another-episode");
  sameAccountNewAttempt.subject.attemptHash = h("another-attempt");
  sameAccountNewAttempt.subject.attemptActorSubjectHash = h("another-acting-stack");
  assert.doesNotThrow(() => createNetworkIntakeManifest(sameAccountNewAttempt));
  for (const mutation of [
    ["DELEGATION_RESPONSIBILITY", "authorityEstablished"],
    ["DELEGATION_RESPONSIBILITY", "responsibilityCoverageEstablished"],
    ["ACTION_OUTCOME", "externalOutcomeVerified"],
    ["ACTION_OUTCOME", "causalAttributionEstablished"],
    ["ACTION_OUTCOME", "obligationClosed"],
    ["PROSPECTIVE_CENSUS", "prospectiveRegistrationEstablishedAtNetworkEdge"],
    ["PROSPECTIVE_CENSUS", "scientificCensusCompletenessEstablishedAtNetworkEdge"],
  ]) {
    const input = manifestInput(mutation[0]);
    input.payload[mutation[1]] = true;
    assert.throws(() => createNetworkIntakeManifest(input), /MUST_REMAIN_FALSE/);
  }
});

test("payload transport proof is separable from payload truth and admission", () => {
  const f = buildChain();
  const proof = verifyNetworkIntakePayloadTransportProof(f.payloadEnvelope, {
    expectedReservationHash: f.reservation.reservationHash,
    expectedTransportSignerKeyId: f.reservation.transportSignerKeyId,
    expectedPublicKeyPem: f.reservation.signature.publicKeyPem,
  });
  assert.equal(proof.ok, true);
  assert.equal(proof.transportProofVerified, true);
  assert.equal(proof.useBoundary.authority, "NONE");
  assert.equal(proof.useBoundary.automaticTraining, false);
  assert.equal(verifyNetworkIntakePayloadTransportProof(f.payloadEnvelope, {
    expectedReservationHash: h("another-reservation"),
    expectedTransportSignerKeyId: f.reservation.transportSignerKeyId,
    expectedPublicKeyPem: f.reservation.signature.publicKeyPem,
  }).ok, false);
});

test("submission identifiers have one replay-safe grammar", () => {
  for (const clientSubmissionId of ["_abcdefg", "-abcdefg"]) {
    const input = manifestInput("ACTION_OUTCOME");
    input.clientSubmissionId = clientSubmissionId;
    assert.throws(() => createNetworkIntakeManifest(input), /CLIENT_SUBMISSION_ID_INVALID/);
  }
  const input = manifestInput("ACTION_OUTCOME");
  input.clientSubmissionId = "a_b-cdef";
  assert.doesNotThrow(() => createNetworkIntakeManifest(input));
});

test("exact replay rejects extras, self-rehash and fake transport/server signatures", () => {
  const f = buildChain();
  const extra = structuredClone(f.manifest);
  extra.unknown = false;
  assert.equal(verifyNetworkIntakeManifest(extra).ok, false);
  const selfRehash = structuredClone(f.manifest);
  selfRehash.subject.claimHash = h("attacker-change");
  selfRehash.manifestHash = h("attacker-self-rehash");
  assert.equal(verifyNetworkIntakeManifest(selfRehash).ok, false);
  const fakeTransport = structuredClone(f.payloadEnvelope);
  fakeTransport.signature.value = `${"A".repeat(86)}==`;
  assert.equal(verifyNetworkIntakePayloadEnvelope(fakeTransport, { reservation: f.reservation,
    challenge: f.challenge, serverPublicKeyPem: f.server.publicKey,
    expectedAudience: f.audience }).ok, false);
  const fakeServer = structuredClone(f.receipt);
  fakeServer.signature.value = `${"A".repeat(86)}==`;
  assert.equal(verifyNetworkIntakeReceipt(fakeServer, { reservation: f.reservation,
    payloadEnvelope: f.payloadEnvelope, challenge: f.challenge,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience }).ok, false);
  const nonCanonicalBase64 = structuredClone(f.payloadEnvelope);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lastDataIndex = nonCanonicalBase64.signature.value.length - 3;
  const canonicalIndex = alphabet.indexOf(nonCanonicalBase64.signature.value[lastDataIndex]);
  nonCanonicalBase64.signature.value = nonCanonicalBase64.signature.value.slice(0, lastDataIndex)
    + alphabet[(canonicalIndex & 48) | ((canonicalIndex + 1) & 15)]
    + nonCanonicalBase64.signature.value.slice(lastDataIndex + 1);
  assert.deepEqual(Buffer.from(nonCanonicalBase64.signature.value, "base64"),
    Buffer.from(f.payloadEnvelope.signature.value, "base64"));
  assert.equal(verifyNetworkIntakePayloadEnvelope(nonCanonicalBase64, {
    reservation: f.reservation, challenge: f.challenge,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience }).ok, false);
});

test("expired challenges and payloads outside their reservation fail", () => {
  const f = buildChain();
  assert.equal(verifyNetworkIntakeChallenge(f.challenge, { serverPublicKeyPem: f.server.publicKey,
    expectedAudience: f.audience, expectedManifestHash: f.manifest.manifestHash,
    expectedTransportSignerKeyId: keyId(f.transport.publicKey), at: f.challenge.expiresAt }).ok,
  false);
  assert.throws(() => createNetworkIntakePayloadEnvelope({ reservation: f.reservation,
    challenge: f.challenge, payload: f.payload, transportPrivateKeyPem: f.transport.privateKey,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience,
    createdAt: f.reservation.expiresAt }), /PAYLOAD_OUTSIDE_RESERVATION/);
  assert.throws(() => createNetworkIntakeReceipt({ reservation: f.reservation,
    payloadEnvelope: f.payloadEnvelope, challenge: f.challenge,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience,
    registryId: "registry-a", eventOrdinal: 2, eventHash: h("late-event"),
    objectAlreadyPresent: false, receivedAt: f.reservation.expiresAt,
    retentionUntil: "2026-09-27T00:09:00.000Z",
    serverPrivateKeyPem: f.server.privateKey }), /RECEIPT_TIME_INVALID/);
});

test("transport identity role collapse and retention expansion are rejected", () => {
  const transport = pair();
  const server = pair();
  const audience = "https://intake.outsider.example";
  const input = manifestInput("ACTION_OUTCOME");
  input.subject.actorIdentityEnvelopeHash = keyId(transport.publicKey);
  const manifest = createNetworkIntakeManifest(input);
  const challenge = createNetworkIntakeChallenge({ manifestHash: manifest.manifestHash,
    transportSignerKeyId: keyId(transport.publicKey), audience,
    nonce: "nonce_role_collision_000001", issuedAt: "2026-08-28T00:00:01.000Z",
    expiresAt: "2026-08-28T00:10:01.000Z", serverPrivateKeyPem: server.privateKey });
  assert.throws(() => createNetworkIntakeReservation({ manifest, challenge,
    transportPrivateKeyPem: transport.privateKey, serverPublicKeyPem: server.publicKey,
    expectedAudience: audience, reservedAt: "2026-08-28T00:05:00.000Z",
    expiresAt: "2026-08-28T00:09:00.000Z" }), /TRANSPORT_SIGNER_IDENTITY_ROLE_COLLISION/);

  const f = buildChain();
  assert.throws(() => createNetworkIntakeReceipt({ reservation: f.reservation,
    payloadEnvelope: f.payloadEnvelope, challenge: f.challenge,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience,
    registryId: "registry-a", eventOrdinal: 2, eventHash: h("event:retention-expansion"),
    objectAlreadyPresent: false, receivedAt: "2026-08-28T00:07:00.000Z",
    retentionUntil: "2026-09-28T00:07:00.000Z",
    serverPrivateKeyPem: f.server.privateKey }), /RECEIPT_TIME_INVALID/);
});

test("challenge and reservation bindings prevent cross-manifest replay", () => {
  const oneSubject = subject("ACTION_OUTCOME");
  const one = buildChain("ACTION_OUTCOME",
    payloadForLane("ACTION_OUTCOME", oneSubject, "one"));
  const two = createNetworkIntakeManifest(manifestInput("ACTION_OUTCOME",
    payloadForLane("ACTION_OUTCOME", subject("ACTION_OUTCOME"), "two")));
  assert.throws(() => createNetworkIntakeReservation({ manifest: two, challenge: one.challenge,
    transportPrivateKeyPem: one.transport.privateKey, serverPublicKeyPem: one.server.publicKey,
    expectedAudience: one.audience, reservedAt: "2026-08-28T00:05:00.000Z",
    expiresAt: "2026-08-28T00:20:00.000Z" }), /CHALLENGE_INVALID_FOR_RESERVATION/);
  const swapped = structuredClone(one.payloadEnvelope);
  swapped.manifestHash = two.manifestHash;
  assert.equal(verifyNetworkIntakePayloadEnvelope(swapped, { reservation: one.reservation,
    challenge: one.challenge, serverPublicKeyPem: one.server.publicKey,
    expectedAudience: one.audience }).ok, false);
});

test("the server receipt binds the exact transport envelope, not only its payload", () => {
  const f = buildChain();
  const secondEnvelope = createNetworkIntakePayloadEnvelope({ reservation: f.reservation,
    challenge: f.challenge, payload: f.payload, transportPrivateKeyPem: f.transport.privateKey,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience,
    createdAt: "2026-08-28T00:06:01.000Z" });
  assert.notEqual(secondEnvelope.payloadEnvelopeHash, f.payloadEnvelope.payloadEnvelopeHash);
  assert.equal(verifyNetworkIntakeReceipt(f.receipt, { reservation: f.reservation,
    payloadEnvelope: secondEnvelope, challenge: f.challenge,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience }).ok, false);
});

test("challenge and receipt server key epochs can rotate without rewriting history", () => {
  const f = buildChain();
  const nextServer = pair();
  const rotatedReceipt = createNetworkIntakeReceipt({ reservation: f.reservation,
    payloadEnvelope: f.payloadEnvelope, challenge: f.challenge,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience,
    registryId: "registry-a", eventOrdinal: 3, eventHash: h("rotated-key-event"),
    objectAlreadyPresent: false, receivedAt: "2026-08-28T00:07:00.000Z",
    retentionUntil: "2026-09-27T00:07:00.000Z",
    serverPrivateKeyPem: nextServer.privateKey });
  assert.equal(verifyNetworkIntakeReceipt(rotatedReceipt, { reservation: f.reservation,
    payloadEnvelope: f.payloadEnvelope, challenge: f.challenge,
    challengeServerPublicKeyPem: f.server.publicKey,
    receiptServerPublicKeyPem: nextServer.publicKey,
    expectedAudience: f.audience }).ok, true);
  assert.equal(verifyNetworkIntakeReceipt(rotatedReceipt, { reservation: f.reservation,
    payloadEnvelope: f.payloadEnvelope, challenge: f.challenge,
    serverPublicKeyPem: f.server.publicKey, expectedAudience: f.audience }).ok, false);
});

test("transport withdrawal binds one exact reservation and a signed zero-authority acknowledgment",
  () => {
    for (const priorStatus of ["OPEN", "SETTLED"]) {
      const f = buildChain();
      const receiptServer = pair();
      const revocation = createNetworkIntakeRevocation({ reservation: f.reservation,
        audience: f.audience, registryId: "registry-a",
        requestedAt: "2026-08-28T00:08:00.000Z",
        transportPrivateKeyPem: f.transport.privateKey });
      const checked = verifyNetworkIntakeRevocation(revocation, { reservation: f.reservation,
        expectedAudience: f.audience, expectedRegistryId: "registry-a",
        expectedTransportPublicKeyPem: f.transport.publicKey,
        at: "2026-08-28T00:08:01.000Z" });
      assert.equal(checked.ok, true, checked.error);
      assert.equal(revocation.scope, "EXACT_RESERVATION_TRANSPORT_WITHDRAWAL");
      assert.equal(revocation.reasonCode, "TRANSPORT_SUBMISSION_WITHDRAWN");
      assert.equal(revocation.transportSignerRole, "TRANSPORT_POSSESSION_ONLY");
      const occurrenceExisted = priorStatus === "SETTLED";
      const acknowledgment = createNetworkIntakeRevocationAcknowledgment({ revocation,
        reservation: f.reservation, priorStatus,
        processedAt: "2026-08-28T00:08:01.000Z", revokedEventOrdinal: 9,
        revokedEventHash: h(`revoked-event:${priorStatus}`), occurrenceExisted,
        objectPayloadRemoved: occurrenceExisted,
        sharedObjectPayloadRetained: false,
        serverPrivateKeyPem: receiptServer.privateKey });
      const acknowledgmentCheck = verifyNetworkIntakeRevocationAcknowledgment(acknowledgment, {
        revocation, reservation: f.reservation, expectedAudience: f.audience,
        expectedRegistryId: "registry-a",
        receiptServerPublicKeyPem: receiptServer.publicKey });
      assert.equal(acknowledgmentCheck.ok, true, acknowledgmentCheck.error);
      assert.equal(acknowledgment.consentHash, f.manifest.consentHash);
      assert.equal(acknowledgment.networkDenominatorDecremented, false);
      assert.equal(acknowledgment.historicalOccurrenceRemoved, false);
      assert.equal(acknowledgment.revokedOccurrencePayloadAccessible, false);
      assert.equal(acknowledgment.futureSettlementBlocked, true);
      assert.equal(acknowledgment.disposition, "QUARANTINED");
      assert.equal(acknowledgment.useBoundary.authority, "NONE");
      assert.equal(acknowledgment.useBoundary.trainingRows, 0);
      assert.equal(acknowledgment.useBoundary.causalExperienceUnits, 0);
    }
  });

test("revocation rejects wrong keys, registry or audience splice and impossible CAS outcomes", () => {
  const f = buildChain();
  const wrongTransport = pair();
  assert.throws(() => createNetworkIntakeRevocation({ reservation: f.reservation,
    audience: f.audience, registryId: "registry-a",
    requestedAt: "2026-08-28T00:08:00.000Z",
    transportPrivateKeyPem: wrongTransport.privateKey }), /SIGNATURE_OR_HASH_INVALID/);
  const revocation = createNetworkIntakeRevocation({ reservation: f.reservation,
    audience: f.audience, registryId: "registry-a",
    requestedAt: "2026-08-28T00:08:00.000Z",
    transportPrivateKeyPem: f.transport.privateKey });
  assert.equal(verifyNetworkIntakeRevocation(revocation, { reservation: f.reservation,
    expectedAudience: f.audience, expectedRegistryId: "registry-b",
    expectedTransportPublicKeyPem: f.transport.publicKey,
    at: "2026-08-28T00:08:01.000Z" }).ok, false);
  assert.equal(verifyNetworkIntakeRevocation(revocation, { reservation: f.reservation,
    expectedAudience: "https://other.example", expectedRegistryId: "registry-a",
    expectedTransportPublicKeyPem: f.transport.publicKey,
    at: "2026-08-28T00:08:01.000Z" }).ok, false);
  const tampered = structuredClone(revocation);
  tampered.consentHash = h("other-consent");
  assert.equal(verifyNetworkIntakeRevocation(tampered, { reservation: f.reservation,
    expectedAudience: f.audience, expectedRegistryId: "registry-a",
    expectedTransportPublicKeyPem: f.transport.publicKey,
    at: "2026-08-28T00:08:01.000Z" }).ok, false);
  assert.throws(() => createNetworkIntakeRevocationAcknowledgment({ revocation,
    reservation: f.reservation, priorStatus: "SETTLED",
    processedAt: "2026-08-28T00:08:01.000Z", revokedEventOrdinal: 9,
    revokedEventHash: h("revoked-event"), occurrenceExisted: true,
    objectPayloadRemoved: true, sharedObjectPayloadRetained: true,
    serverPrivateKeyPem: f.server.privateKey }), /SETTLED_OUTCOME_INVALID/);

  const validAcknowledgment = createNetworkIntakeRevocationAcknowledgment({ revocation,
    reservation: f.reservation, priorStatus: "SETTLED",
    processedAt: "2026-08-28T00:08:01.000Z", revokedEventOrdinal: 9,
    revokedEventHash: h("bounded-revoked-event"), occurrenceExisted: true,
    objectPayloadRemoved: true, sharedObjectPayloadRetained: false,
    serverPrivateKeyPem: f.server.privateKey });
  const { acknowledgmentHash: ignoredHash, signature: ignoredSignature,
    ...acknowledgmentBody } = validAcknowledgment;
  const futureAcknowledgment = addressedSignedForTest({ ...acknowledgmentBody,
    processedAt: "2026-08-28T00:20:01.000Z" },
  NETWORK_INTAKE_SCHEMAS.revocationAcknowledgment, "acknowledgmentHash", f.server);
  const futureCheck = verifyNetworkIntakeRevocationAcknowledgment(futureAcknowledgment, {
    revocation, reservation: f.reservation, expectedAudience: f.audience,
    expectedRegistryId: "registry-a", receiptServerPublicKeyPem: f.server.publicKey,
  });
  assert.equal(futureCheck.ok, false,
    "even a trusted-key acknowledgment cannot be arbitrarily future-dated");
  assert.match(futureCheck.error, /REVOCATION_ACKNOWLEDGMENT_TIME_INVALID/u);
  assert.throws(() => createNetworkIntakeRevocationAcknowledgment({ revocation,
    reservation: f.reservation, priorStatus: "OPEN",
    processedAt: "2026-08-28T00:20:01.000Z", revokedEventOrdinal: 10,
    revokedEventHash: h("future-revoked-event"), occurrenceExisted: false,
    objectPayloadRemoved: false, sharedObjectPayloadRetained: false,
    serverPrivateKeyPem: f.server.privateKey }), /REVOCATION_ACKNOWLEDGMENT_TIME_INVALID/u);
});

test("captured hash intrinsics survive post-import prototype replacement", () => {
  const prototype = Object.getPrototypeOf(createHash("sha256"));
  const originalUpdate = prototype.update;
  const originalDigest = prototype.digest;
  try {
    prototype.update = function poisonedUpdate() { return this; };
    prototype.digest = function poisonedDigest() { return "0".repeat(64); };
    const first = networkIntakeDigest("outsider/test/v1", { n: 1 });
    const second = networkIntakeDigest("outsider/test/v1", { n: 2 });
    assert.match(first, /^sha256:[a-f0-9]{64}$/u);
    assert.notEqual(first, second);
  } finally {
    prototype.update = originalUpdate;
    prototype.digest = originalDigest;
  }
});
