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
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  NETWORK_INTAKE_SCHEMAS,
  createNetworkIntakeChallenge,
  createNetworkIntakeReceipt,
  createNetworkIntakeRevocationAcknowledgment,
  networkIntakeDigest,
  verifyNetworkIntakeReservation,
} from "../src/outsider-network-intake.js";
import {
  OUTSIDER_NETWORK_NODE_ADAPTER_KINDS,
} from "../src/outsider-network-node-sdk.js";
import {
  OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
  OUTSIDER_NETWORK_NODE_CLIENT_NETWORK_SERVER_BOUNDARY_FOR_TESTS,
  OUTSIDER_NETWORK_NODE_REVOCATION_BOUNDARY,
  createOutsiderNetworkNodeSubmissionPreview,
  sendOutsiderNetworkNodeRevocation,
  sendOutsiderNetworkNodeSubmission,
  verifyOutsiderNetworkNodeRevocationBundle,
  verifyOutsiderNetworkNodeSubmissionBundle,
  verifyOutsiderNetworkNodeSubmissionPreview,
} from "../src/outsider-network-node-client.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function pair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function keyId(key) {
  return `sha256:${createHash("sha256")
    .update(createPublicKey(key).export({ type: "spki", format: "der" }))
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

function keyEpoch(key, { validFrom = "2026-08-27T00:00:00.000Z",
  validUntil = "2026-08-29T00:00:00.000Z" } = {}) {
  return { keyId: keyId(key.publicKey), publicKeyPem: key.publicKey, validFrom, validUntil };
}

function trustPolicy(server, options = {}) {
  const receiptServer = options.receiptServer ?? server;
  return {
    expectedAudience: options.expectedAudience ?? "https://intake.outsider.example",
    expectedRegistryId: options.expectedRegistryId ?? "registry-a",
    expectedRetentionPolicyVersion: options.expectedRetentionPolicyVersion
      ?? "outsider/network-retention-policy/v1",
    maxAppliedRetentionDays: options.maxAppliedRetentionDays ?? 30,
    challengeServerKeyEpochs: options.challengeServerKeyEpochs
      ?? [keyEpoch(server, options.challengeEpoch)],
    receiptServerKeyEpochs: options.receiptServerKeyEpochs
      ?? [keyEpoch(receiptServer, options.receiptEpoch)],
  };
}

function networkDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:network-intake:${domain}:v1\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function subject() {
  return {
    claimHash: h("claim"),
    wayHash: h("way"),
    worldHash: h("world"),
    episodeHash: h("episode"),
    attemptHash: h("attempt"),
    actorIdentityEnvelopeHash: h("actor-envelope"),
    accountableDeploymentSubjectHash: h("accountable-deployment"),
    attemptActorSubjectHash: h("attempt-actor"),
    cohortHash: h("cohort"),
    censusSlotHash: h("slot"),
  };
}

function actionPayload(selectedSubject = subject()) {
  return {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
    attemptRecordHash: selectedSubject.attemptHash,
    executionEvidenceHash: h("execution"),
    outcomeEvidenceHash: h("outcome"),
    obligationStateHash: h("obligation-state"),
    sourceArtifactHash: h("source-artifact"),
    sourceReplayReferenceHash: h("source-replay"),
    externalOutcomeVerified: false,
    causalAttributionEstablished: false,
    obligationClosed: false,
  };
}

function adapters() {
  return OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.map((kind) => ({
    kind,
    status: "DECLARED_UNVERIFIED",
    artifactSchema: `outsider/node-adapter-${kind.toLowerCase()}/v1`,
    adapterImplementationHash: h(`adapter:${kind}`),
    conformanceEvidenceRefHash: h(`conformance:${kind}`),
  }));
}

function preview(selectedSubject = subject()) {
  const payload = actionPayload(selectedSubject);
  return createOutsiderNetworkNodeSubmissionPreview({
    manifestInput: {
      lane: "ACTION_OUTCOME",
      clientSubmissionId: "anchor_node_action_outcome_0001",
      payloadSchema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
      payload,
      subject: selectedSubject,
      source: {
        sourceManifestHash: h("source-manifest"),
        instrumentHash: h("instrument"),
        rightsReviewHash: h("rights"),
        privacyReviewHash: h("privacy"),
      },
      consentHash: h("consent"),
      retentionDays: 30,
      createdAt: "2026-08-28T00:00:00.000Z",
    },
    sdkReleaseHash: h("sdk-release"),
    nodeSoftwareRevisionHash: h("node-revision"),
    providerPatternReview: null,
    adapterDeclarations: adapters(),
    nativeSafetyEvidenceRefs: [{
      controlClass: "EMERGENCY_STOP",
      vendorEvidenceRefHash: h("vendor-e-stop"),
      referenceSemantics: "VENDOR_NATIVE_SAFETY_EVIDENCE_REFERENCE_ONLY",
      effectivenessEstablished: false,
      outsiderAuthorityEstablished: false,
    }],
  });
}

function stableOccurrenceSubjectHash(manifest) {
  const identity = manifest.subject;
  return networkDigest("stable-occurrence-subject", {
    lane: manifest.lane,
    claimHash: identity.claimHash,
    wayHash: identity.wayHash,
    worldHash: identity.worldHash,
    episodeHash: identity.episodeHash,
    attemptHash: identity.attemptHash,
    cohortHash: identity.cohortHash,
    censusSlotHash: identity.censusSlotHash,
  });
}

function lifecycleEvent({ ordinal, previousEventHash, reservation, challenge,
  retentionUntil, occurredAt, eventType, reasonCode, registryId = "registry-a",
  retentionPolicyVersion = "outsider/network-retention-policy/v1",
  appliedRetentionDays = 30 }) {
  const manifest = reservation.manifest;
  const body = {
    schema: "outsider/network-intake-event/v2",
    ordinal,
    previousEventHash,
    reservationHash: reservation.reservationHash,
    manifestHash: manifest.manifestHash,
    lane: manifest.lane,
    clientSubmissionId: manifest.clientSubmissionId,
    challengeServerKeyId: challenge.signature.keyId,
    registryId,
    retentionPolicyVersion,
    appliedRetentionDays,
    retentionUntil,
    eventType,
    objectIdentityHash: manifest.payload.objectIdentityHash,
    occurrenceIdentityHash: manifest.occurrenceIdentityHash,
    stableOccurrenceSubjectHash: stableOccurrenceSubjectHash(manifest),
    semanticSubjectHash: manifest.subject.attemptActorSubjectHash,
    censusSlotHash: manifest.subject.censusSlotHash,
    occurredAt,
    disposition: "QUARANTINED",
    reasonCode,
  };
  return { ...body, eventHash: networkDigest("lifecycle-event", body) };
}

function mockGateway({ server, receiptServer = server, endpoint, tamperReceipt = false,
  registryId = "registry-a",
  retentionPolicyVersion = "outsider/network-retention-policy/v1",
  appliedRetentionDays = 30,
  challengeIssuedAt = "2026-08-28T00:00:00.000Z",
  receiptReceivedAt = "2026-08-28T00:01:03.000Z",
  settlementPreviousEventHash = null }) {
  const calls = [];
  let challenge;
  let reservation;
  let reservedEvent;
  const retentionUntil = new Date(Date.parse("2026-08-28T00:01:01.000Z")
    + appliedRetentionDays * 86_400_000).toISOString();
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["content-type"], "application/json");
    const input = JSON.parse(options.body);
    assert.equal(options.body, canonicalizeStrict(input));
    if (calls.length === 1) {
      assert.equal(url, `${endpoint}/v1/network/challenges`);
      challenge = createNetworkIntakeChallenge({
        manifestHash: input.manifest.manifestHash,
        transportSignerKeyId: input.transportSignerKeyId,
        audience: endpoint,
        nonce: "anchor_node_client_nonce_000001",
        issuedAt: challengeIssuedAt,
        expiresAt: "2026-08-28T00:05:00.000Z",
        serverPrivateKeyPem: server.privateKey,
      });
      return new Response(JSON.stringify(challenge), { status: 200 });
    }
    if (calls.length === 2) {
      assert.equal(url, `${endpoint}/v1/network/reservations`);
      assert.deepEqual(input.challenge, challenge);
      reservation = input.reservation;
      const checked = verifyNetworkIntakeReservation(reservation, {
        challenge,
        serverPublicKeyPem: server.publicKey,
        expectedAudience: endpoint,
      });
      assert.equal(checked.ok, true);
      reservedEvent = lifecycleEvent({
        ordinal: 1,
        previousEventHash: h("network-event-genesis"),
        reservation,
        challenge,
        retentionUntil,
        occurredAt: "2026-08-28T00:01:01.000Z",
        eventType: "RESERVED",
        reasonCode: null,
        registryId,
        retentionPolicyVersion,
        appliedRetentionDays,
      });
      return new Response(JSON.stringify({
        accepted: true,
        duplicate: false,
        reservationHash: reservation.reservationHash,
        authenticatedAt: "2026-08-28T00:01:01.000Z",
        status: "OPEN",
        retention: {
          retentionPolicyVersion,
          appliedRetentionDays,
          retentionUntil,
        },
        event: reservedEvent,
        useBoundary: OUTSIDER_NETWORK_NODE_CLIENT_NETWORK_SERVER_BOUNDARY_FOR_TESTS,
      }), { status: 200 });
    }
    assert.equal(calls.length, 3);
    assert.equal(url,
      `${endpoint}/v1/network/reservations/${reservation.reservationHash}/payload`);
    const payloadEnvelope = input;
    const settledEvent = lifecycleEvent({
      ordinal: 2,
      previousEventHash: settlementPreviousEventHash ?? reservedEvent.eventHash,
      reservation,
      challenge,
      retentionUntil,
      occurredAt: receiptReceivedAt,
      eventType: "QUARANTINED",
      reasonCode: "PENDING_CURATE_REVIEW",
      registryId,
      retentionPolicyVersion,
      appliedRetentionDays,
    });
    let receipt = createNetworkIntakeReceipt({
      reservation,
      payloadEnvelope,
      challenge,
      serverPublicKeyPem: server.publicKey,
      expectedAudience: endpoint,
      registryId,
      eventOrdinal: settledEvent.ordinal,
      eventHash: settledEvent.eventHash,
      objectAlreadyPresent: false,
      receivedAt: settledEvent.occurredAt,
      retentionUntil,
      serverPrivateKeyPem: receiptServer.privateKey,
    });
    if (tamperReceipt) {
      receipt = structuredClone(receipt);
      receipt.receiptHash = h("tampered-receipt");
    }
    return new Response(JSON.stringify({
      appended: true,
      duplicate: false,
      objectAlreadyPresent: false,
      occurrenceOrdinal: 1,
      event: settledEvent,
      receipt,
      useBoundary: OUTSIDER_NETWORK_NODE_CLIENT_NETWORK_SERVER_BOUNDARY_FOR_TESTS,
    }), { status: 200 });
  };
  return { calls, fetchImpl };
}

function clock() {
  const values = ["2026-08-28T00:01:00.000Z", "2026-08-28T00:01:02.000Z"];
  return () => values.shift();
}

function mockRevocationGateway({ server, endpoint, submission, priorStatus = "SETTLED",
  objectPayloadRemoved = priorStatus === "SETTLED", tamperAcknowledgment = false,
  processedAt = "2026-08-28T00:02:01.000Z", forgeChronology = false }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(calls.length, 1);
    assert.equal(url, `${endpoint}/v1/network/revocations`);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["content-type"], "application/json");
    const revocation = JSON.parse(options.body);
    assert.equal(options.body, canonicalizeStrict(revocation));
    const event = lifecycleEvent({
      ordinal: 9,
      previousEventHash: h("revocation-predecessor"),
      reservation: submission.reservation,
      challenge: submission.challenge,
      retentionUntil: submission.reservationEvent.retentionUntil,
      occurredAt: processedAt,
      eventType: "REVOKED",
      reasonCode: "SIGNED_TRANSPORT_WITHDRAWAL",
    });
    const safeProcessedAt = forgeChronology
      ? new Date(Date.parse(revocation.requestedAt) + 1_000).toISOString() : event.occurredAt;
    let acknowledgment = createNetworkIntakeRevocationAcknowledgment({
      revocation,
      reservation: submission.reservation,
      priorStatus,
      processedAt: safeProcessedAt,
      revokedEventOrdinal: event.ordinal,
      revokedEventHash: forgeChronology ? h("safe-revocation-event") : event.eventHash,
      occurrenceExisted: priorStatus === "SETTLED",
      objectPayloadRemoved,
      sharedObjectPayloadRetained: priorStatus === "SETTLED" && !objectPayloadRemoved,
      serverPrivateKeyPem: server.privateKey,
    });
    if (forgeChronology) {
      const { acknowledgmentHash: ignoredHash, signature: ignoredSignature,
        ...acknowledgmentBody } = acknowledgment;
      acknowledgment = addressedSignedForTest({ ...acknowledgmentBody,
        processedAt: event.occurredAt, revokedEventHash: event.eventHash },
      NETWORK_INTAKE_SCHEMAS.revocationAcknowledgment, "acknowledgmentHash", server);
    }
    if (tamperAcknowledgment) {
      acknowledgment = structuredClone(acknowledgment);
      acknowledgment.consentHash = h("spliced-consent");
    }
    return new Response(JSON.stringify({
      revoked: true,
      duplicate: false,
      event,
      acknowledgment,
      useBoundary: OUTSIDER_NETWORK_NODE_CLIENT_NETWORK_SERVER_BOUNDARY_FOR_TESTS,
    }), { status: 200 });
  };
  return { calls, fetchImpl };
}

test("preview is pure, exact-source-replayed, and HOLD-only", () => {
  const record = preview();
  const checked = verifyOutsiderNetworkNodeSubmissionPreview(record, {
    expectedPreviewHash: record.previewHash,
  });
  assert.equal(checked.ok, true);
  assert.equal(record.transport.requestPerformed, false);
  assert.equal(record.transport.transportSignerBound, false);
  assert.equal(record.transport.transportSignerIsActorIdentity, false);
  assert.equal(record.transport.callerManagedPrivateKeyFileModeRequired, "0600");
  assert.equal(record.nodeConformance.decision, "HOLD");
  assert.equal(record.nodeConformance.boundary.vendorSafetyEffectivenessEstablished, false);
  assert.equal(checked.actionReady, false);
  assert.equal(checked.trainingRows, 0);
  assert.deepEqual(checked.boundary, OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY);
});

test("injected send reuses the existing three-step wire and returns a replayed quarantine bundle",
  async () => {
    const transport = pair();
    const server = pair();
    const endpoint = "https://intake.outsider.example";
    const gateway = mockGateway({ server, endpoint });
    const record = await sendOutsiderNetworkNodeSubmission({
      preview: preview(),
      endpoint,
      transportPrivateKeyPem: transport.privateKey,
      trustPolicy: trustPolicy(server),
      fetchImpl: gateway.fetchImpl,
      clock: clock(),
    });
    assert.equal(gateway.calls.length, 3);
    assert.equal(record.transport.transportSignerKeyId, keyId(transport.privateKey));
    assert.notEqual(record.transport.transportSignerKeyId,
      record.preview.manifest.subject.actorIdentityEnvelopeHash);
    assert.equal(record.transport.transportSignerIsActorIdentity, false);
    assert.equal(record.receipt.disposition, "QUARANTINED");
    assert.equal(record.settlementEvent.ordinal, record.reservationEvent.ordinal + 1);
    assert.equal(record.settlementEvent.previousEventHash,
      record.reservationEvent.eventHash);
    assert.equal(record.settlementEvent.registryId, record.reservationEvent.registryId);
    assert.equal(record.settlementEvent.retentionUntil,
      record.reservationEvent.retentionUntil);
    assert.equal(record.decision, "HOLD");
    assert.equal(record.boundary.actionReady, false);
    assert.equal(record.boundary.trainingRows, 0);
    const checked = verifyOutsiderNetworkNodeSubmissionBundle(record, {
      expectedBundleHash: record.bundleHash,
      trustPolicy: trustPolicy(server),
    });
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceReplayComplete, true);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.causalExperienceUnits, 0);
  });

test("tampered preview fails before the injected fetch is called", async () => {
  const record = structuredClone(preview());
  record.payload.outcomeEvidenceHash = h("tampered-outcome");
  let calls = 0;
  await assert.rejects(sendOutsiderNetworkNodeSubmission({
    preview: record,
    endpoint: "https://intake.outsider.example",
    transportPrivateKeyPem: pair().privateKey,
    trustPolicy: trustPolicy(pair()),
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
    clock: clock(),
  }), /PREVIEW_/u);
  assert.equal(calls, 0);
});

test("non-HTTPS origins and receipt tampering fail closed", async () => {
  let calls = 0;
  await assert.rejects(sendOutsiderNetworkNodeSubmission({
    preview: preview(),
    endpoint: "http://127.0.0.1:8787",
    transportPrivateKeyPem: pair().privateKey,
    trustPolicy: trustPolicy(pair()),
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
    clock: clock(),
  }), /ENDPOINT_HTTPS_ORIGIN_REQUIRED/u);
  assert.equal(calls, 0);

  const audienceServer = pair();
  await assert.rejects(sendOutsiderNetworkNodeSubmission({
    preview: preview(),
    endpoint: "https://intake.outsider.example",
    transportPrivateKeyPem: pair().privateKey,
    trustPolicy: trustPolicy(audienceServer, {
      expectedAudience: "https://other-intake.outsider.example",
    }),
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
    clock: clock(),
  }), /ENDPOINT_AUDIENCE_MISMATCH/u);
  assert.equal(calls, 0, "endpoint/audience mismatch fails before any fetch");

  const preflightServer = pair();
  await assert.rejects(sendOutsiderNetworkNodeSubmission({
    preview: preview(),
    endpoint: "https://intake.outsider.example",
    transportPrivateKeyPem: pair().privateKey,
    trustPolicy: trustPolicy(preflightServer, { receiptServerKeyEpochs: [] }),
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
    clock: clock(),
  }), /RECEIPT_SERVER_KEY_EPOCHS_EMPTY/u);
  assert.equal(calls, 0);

  const transport = pair();
  const server = pair();
  const endpoint = "https://intake.outsider.example";
  const gateway = mockGateway({ server, endpoint, tamperReceipt: true });
  await assert.rejects(sendOutsiderNetworkNodeSubmission({
    preview: preview(),
    endpoint,
    transportPrivateKeyPem: transport.privateKey,
    trustPolicy: trustPolicy(server),
    fetchImpl: gateway.fetchImpl,
    clock: clock(),
  }), /SETTLEMENT_RESPONSE_EVENT_RECEIPT_MISMATCH|RECEIPT_INVALID/u);
  assert.equal(gateway.calls.length, 3);
});

test("transport key collision with an actor reference is rejected", async () => {
  const transport = pair();
  const selectedSubject = subject();
  selectedSubject.actorIdentityEnvelopeHash = keyId(transport.privateKey);
  const record = preview(selectedSubject);
  const server = pair();
  const endpoint = "https://intake.outsider.example";
  const gateway = mockGateway({ server, endpoint });
  await assert.rejects(sendOutsiderNetworkNodeSubmission({
    preview: record,
    endpoint,
    transportPrivateKeyPem: transport.privateKey,
    trustPolicy: trustPolicy(server),
    fetchImpl: gateway.fetchImpl,
    clock: clock(),
  }), /TRANSPORT_SIGNER_IDENTITY_ROLE_COLLISION/u);
  assert.equal(gateway.calls.length, 1,
    "the collision is caught before reservation or payload submission");
});

test("self-rehashed bundle and untrusted server epochs do not verify", async () => {
  const transport = pair();
  const server = pair();
  const endpoint = "https://intake.outsider.example";
  const gateway = mockGateway({ server, endpoint });
  const record = await sendOutsiderNetworkNodeSubmission({
    preview: preview(), endpoint, transportPrivateKeyPem: transport.privateKey,
    trustPolicy: trustPolicy(server),
    fetchImpl: gateway.fetchImpl, clock: clock(),
  });
  const tampered = structuredClone(record);
  tampered.settlementEvent.occurredAt = "2026-08-28T00:01:04.000Z";
  const { eventHash: ignoredEventHash, ...eventBody } = tampered.settlementEvent;
  tampered.settlementEvent.eventHash = networkDigest("lifecycle-event", eventBody);
  const { bundleHash: ignoredBundleHash, ...tamperedBody } = tampered;
  tampered.bundleHash = networkIntakeDigest(
    "outsider/network-node-submission-bundle/v1", tamperedBody);
  assert.equal(verifyOutsiderNetworkNodeSubmissionBundle(tampered, {
    expectedBundleHash: tampered.bundleHash,
    trustPolicy: trustPolicy(server),
  }).ok, false);
  assert.equal(verifyOutsiderNetworkNodeSubmissionBundle(record, {
    expectedBundleHash: record.bundleHash,
    trustPolicy: trustPolicy(pair(), { receiptServer: server }),
  }).ok, false);
});

test("a trusted receipt cannot splice a rehashed settlement onto another predecessor",
  async () => {
    const server = pair();
    const endpoint = "https://intake.outsider.example";
    const gateway = mockGateway({
      server,
      endpoint,
      settlementPreviousEventHash: h("forged-reservation-predecessor"),
    });
    await assert.rejects(sendOutsiderNetworkNodeSubmission({
      preview: preview(),
      endpoint,
      transportPrivateKeyPem: pair().privateKey,
      trustPolicy: trustPolicy(server),
      fetchImpl: gateway.fetchImpl,
      clock: clock(),
    }), /RESERVATION_SETTLEMENT_EVENT_CHAIN_INVALID/u);
    assert.equal(gateway.calls.length, 3,
      "the attack recomputes the settlement hash and re-signs its receipt with a trusted key");
  });

test("signed exact-reservation withdrawal returns a replayed HOLD-only revocation bundle",
  async () => {
    const transport = pair();
    const server = pair();
    const endpoint = "https://intake.outsider.example";
    const submissionGateway = mockGateway({ server, endpoint });
    const submission = await sendOutsiderNetworkNodeSubmission({
      preview: preview(), endpoint, transportPrivateKeyPem: transport.privateKey,
      trustPolicy: trustPolicy(server), fetchImpl: submissionGateway.fetchImpl,
      clock: clock(),
    });
    const unchangedSubmission = canonicalizeStrict(submission);
    const revocationGateway = mockRevocationGateway({
      server, endpoint, submission, objectPayloadRemoved: false,
    });
    const record = await sendOutsiderNetworkNodeRevocation({
      reservation: submission.reservation,
      challenge: submission.challenge,
      endpoint,
      transportPrivateKeyPem: transport.privateKey,
      trustPolicy: trustPolicy(server),
      fetchImpl: revocationGateway.fetchImpl,
      clock: () => "2026-08-28T00:02:00.000Z",
    });
    assert.equal(revocationGateway.calls.length, 1);
    assert.equal(canonicalizeStrict(submission), unchangedSubmission,
      "revocation does not mutate the old submission bundle or its hash");
    assert.equal(record.acknowledgment.priorStatus, "SETTLED");
    assert.equal(record.acknowledgment.occurrenceExisted, true);
    assert.equal(record.acknowledgment.objectPayloadRemoved, false);
    assert.equal(record.acknowledgment.sharedObjectPayloadRetained, true);
    assert.equal(record.acknowledgment.consentHash,
      submission.reservation.manifest.consentHash);
    assert.equal(record.acknowledgment.scope,
      "EXACT_RESERVATION_TRANSPORT_WITHDRAWAL");
    assert.equal(record.acknowledgment.reasonCode,
      "TRANSPORT_SUBMISSION_WITHDRAWN");
    assert.equal(record.networkTrust.revocationEventFullChainInclusionEstablished, false);
    assert.equal(record.networkTrust.externalEventHeadAnchored, false);
    assert.deepEqual(record.boundary, OUTSIDER_NETWORK_NODE_REVOCATION_BOUNDARY);
    const checked = verifyOutsiderNetworkNodeRevocationBundle(record, {
      expectedRevocationBundleHash: record.revocationBundleHash,
      trustPolicy: trustPolicy(server),
    });
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceReplayComplete, true);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.trainingRows, 0);
    assert.equal(checked.causalExperienceUnits, 0);
  });

test("revocation rejects endpoint or transport-key substitution before fetch", async () => {
  const transport = pair();
  const server = pair();
  const endpoint = "https://intake.outsider.example";
  const gateway = mockGateway({ server, endpoint });
  const submission = await sendOutsiderNetworkNodeSubmission({
    preview: preview(), endpoint, transportPrivateKeyPem: transport.privateKey,
    trustPolicy: trustPolicy(server), fetchImpl: gateway.fetchImpl, clock: clock(),
  });
  let calls = 0;
  const mustNotFetch = async () => { calls += 1; throw new Error("must not fetch"); };
  await assert.rejects(sendOutsiderNetworkNodeRevocation({
    reservation: submission.reservation,
    challenge: submission.challenge,
    endpoint,
    transportPrivateKeyPem: pair().privateKey,
    trustPolicy: trustPolicy(server),
    fetchImpl: mustNotFetch,
    clock: () => "2026-08-28T00:02:00.000Z",
  }), /REVOCATION_TRANSPORT_SIGNER_MISMATCH/u);
  await assert.rejects(sendOutsiderNetworkNodeRevocation({
    reservation: submission.reservation,
    challenge: submission.challenge,
    endpoint,
    transportPrivateKeyPem: transport.privateKey,
    trustPolicy: trustPolicy(server, {
      expectedAudience: "https://other-intake.outsider.example",
    }),
    fetchImpl: mustNotFetch,
    clock: () => "2026-08-28T00:02:00.000Z",
  }), /ENDPOINT_AUDIENCE_MISMATCH/u);
  assert.equal(calls, 0);
});

test("revocation bundle rejects an untrusted acknowledgment epoch and ack splicing",
  async () => {
    const transport = pair();
    const server = pair();
    const endpoint = "https://intake.outsider.example";
    const gateway = mockGateway({ server, endpoint });
    const submission = await sendOutsiderNetworkNodeSubmission({
      preview: preview(), endpoint, transportPrivateKeyPem: transport.privateKey,
      trustPolicy: trustPolicy(server), fetchImpl: gateway.fetchImpl, clock: clock(),
    });
    const untrustedServer = pair();
    const untrustedGateway = mockRevocationGateway({
      server: untrustedServer, endpoint, submission,
    });
    await assert.rejects(sendOutsiderNetworkNodeRevocation({
      reservation: submission.reservation,
      challenge: submission.challenge,
      endpoint,
      transportPrivateKeyPem: transport.privateKey,
      trustPolicy: trustPolicy(server),
      fetchImpl: untrustedGateway.fetchImpl,
      clock: () => "2026-08-28T00:02:00.000Z",
    }), /REVOCATION_ACKNOWLEDGMENT_SERVER_KEY_EPOCH_NO_UNIQUE_VALID_EXTERNAL_EPOCH/u);
    assert.equal(untrustedGateway.calls.length, 1);

    const tamperedGateway = mockRevocationGateway({
      server, endpoint, submission, tamperAcknowledgment: true,
    });
    await assert.rejects(sendOutsiderNetworkNodeRevocation({
      reservation: submission.reservation,
      challenge: submission.challenge,
      endpoint,
      transportPrivateKeyPem: transport.privateKey,
      trustPolicy: trustPolicy(server),
      fetchImpl: tamperedGateway.fetchImpl,
      clock: () => "2026-08-28T00:02:00.000Z",
    }), /REVOCATION_BUNDLE_ACKNOWLEDGMENT_INVALID/u);
    assert.equal(tamperedGateway.calls.length, 1);
  });

test("trusted revocation responses cannot be future-dated or cross retention", async () => {
  const transport = pair();
  const server = pair();
  const endpoint = "https://intake.outsider.example";
  const gateway = mockGateway({ server, endpoint });
  const submission = await sendOutsiderNetworkNodeSubmission({
    preview: preview(), endpoint, transportPrivateKeyPem: transport.privateKey,
    trustPolicy: trustPolicy(server), fetchImpl: gateway.fetchImpl, clock: clock(),
  });

  const futureGateway = mockRevocationGateway({ server, endpoint, submission,
    processedAt: "2030-08-28T00:02:01.000Z", forgeChronology: true });
  await assert.rejects(sendOutsiderNetworkNodeRevocation({
    reservation: submission.reservation,
    challenge: submission.challenge,
    endpoint,
    transportPrivateKeyPem: transport.privateKey,
    trustPolicy: trustPolicy(server, { receiptEpoch: {
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2031-01-01T00:00:00.000Z",
    } }),
    fetchImpl: futureGateway.fetchImpl,
    clock: () => "2026-08-28T00:02:00.000Z",
  }), /REVOCATION_BUNDLE_ACKNOWLEDGMENT_INVALID.*TIME_INVALID/u);
  assert.equal(futureGateway.calls.length, 1,
    "the response is signed by a trusted epoch but too far after the request");

  const postRetentionGateway = mockRevocationGateway({ server, endpoint, submission,
    processedAt: "2026-09-28T00:02:01.000Z" });
  await assert.rejects(sendOutsiderNetworkNodeRevocation({
    reservation: submission.reservation,
    challenge: submission.challenge,
    endpoint,
    transportPrivateKeyPem: transport.privateKey,
    trustPolicy: trustPolicy(server, { receiptEpoch: {
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
    } }),
    fetchImpl: postRetentionGateway.fetchImpl,
    clock: () => "2026-09-28T00:02:00.000Z",
  }), /LIFECYCLE_EVENT_OUTSIDE_RETENTION_WINDOW/u);
  assert.equal(postRetentionGateway.calls.length, 1,
    "request and ack are close in time, but both are after committed retention");
});

test("redirects, future or expired key epochs, registry splice and retention drift fail closed",
  async () => {
    const endpoint = "https://intake.outsider.example";
    const redirectServer = pair();
    let redirectCalls = 0;
    await assert.rejects(sendOutsiderNetworkNodeSubmission({
      preview: preview(), endpoint, transportPrivateKeyPem: pair().privateKey,
      trustPolicy: trustPolicy(redirectServer),
      fetchImpl: async (url, options) => {
        redirectCalls += 1;
        assert.equal(options.redirect, "error");
        return Response.redirect("https://redirect.invalid", 302);
      },
      clock: clock(),
    }), /CHALLENGE_HTTP_302/u);
    assert.equal(redirectCalls, 1);

    const expiredServer = pair();
    const expiredGateway = mockGateway({ server: expiredServer, endpoint });
    await assert.rejects(sendOutsiderNetworkNodeSubmission({
      preview: preview(), endpoint, transportPrivateKeyPem: pair().privateKey,
      trustPolicy: trustPolicy(expiredServer, { challengeEpoch: {
        validFrom: "2026-08-27T00:00:00.000Z",
        validUntil: "2026-08-28T00:00:00.000Z",
      } }),
      fetchImpl: expiredGateway.fetchImpl, clock: clock(),
    }), /CHALLENGE_SERVER_KEY_EPOCH_NO_UNIQUE_VALID_EXTERNAL_EPOCH/u);
    assert.equal(expiredGateway.calls.length, 1,
      "challenge issuedAt at validUntil is outside the half-open epoch");

    const futureServer = pair();
    const futureGateway = mockGateway({ server: futureServer, endpoint });
    await assert.rejects(sendOutsiderNetworkNodeSubmission({
      preview: preview(), endpoint, transportPrivateKeyPem: pair().privateKey,
      trustPolicy: trustPolicy(futureServer, { receiptEpoch: {
        validFrom: "2026-08-28T00:01:04.000Z",
        validUntil: "2026-08-29T00:00:00.000Z",
      } }),
      fetchImpl: futureGateway.fetchImpl, clock: clock(),
    }), /RECEIPT_SERVER_KEY_EPOCH_NO_UNIQUE_VALID_EXTERNAL_EPOCH/u);
    assert.equal(futureGateway.calls.length, 3);

    const registryServer = pair();
    const registryGateway = mockGateway({ server: registryServer, endpoint,
      registryId: "registry-splice" });
    await assert.rejects(sendOutsiderNetworkNodeSubmission({
      preview: preview(), endpoint, transportPrivateKeyPem: pair().privateKey,
      trustPolicy: trustPolicy(registryServer), fetchImpl: registryGateway.fetchImpl,
      clock: clock(),
    }), /LIFECYCLE_EVENT_BINDING_INVALID/u);
    assert.equal(registryGateway.calls.length, 2);

    const retentionServer = pair();
    const retentionGateway = mockGateway({ server: retentionServer, endpoint,
      retentionPolicyVersion: "outsider/network-retention-policy/v2" });
    await assert.rejects(sendOutsiderNetworkNodeSubmission({
      preview: preview(), endpoint, transportPrivateKeyPem: pair().privateKey,
      trustPolicy: trustPolicy(retentionServer), fetchImpl: retentionGateway.fetchImpl,
      clock: clock(),
    }), /RESERVATION_RESPONSE_STATE_INVALID/u);
    assert.equal(retentionGateway.calls.length, 2);

    const maximumServer = pair();
    const maximumGateway = mockGateway({ server: maximumServer, endpoint });
    await assert.rejects(sendOutsiderNetworkNodeSubmission({
      preview: preview(), endpoint, transportPrivateKeyPem: pair().privateKey,
      trustPolicy: trustPolicy(maximumServer, { maxAppliedRetentionDays: 10 }),
      fetchImpl: maximumGateway.fetchImpl, clock: clock(),
    }), /RESERVATION_RESPONSE_STATE_INVALID/u);
    assert.equal(maximumGateway.calls.length, 2);
  });

test("captured endpoint intrinsics preserve the externally pinned origin after import poisoning",
  async () => {
    const endpoint = "https://intake.outsider.example";
    const transport = pair();
    const server = pair();
    const recordPreview = preview();
    const policy = trustPolicy(server);
    const gateway = mockGateway({ server, endpoint });
    const replace = String.prototype.replace;
    const includes = Array.prototype.includes;
    const toString = URL.prototype.toString;
    const names = ["protocol", "username", "password", "search", "hash", "pathname"];
    const descriptors = new Map(names.map((name) => [name,
      Object.getOwnPropertyDescriptor(URL.prototype, name)]));
    try {
      String.prototype.replace = () => "https://poison.invalid";
      Array.prototype.includes = () => false;
      URL.prototype.toString = () => "https://poison.invalid/";
      for (const name of names) {
        const descriptor = descriptors.get(name);
        Object.defineProperty(URL.prototype, name, {
          ...descriptor,
          get() { return name === "protocol" ? "http:" : "poison"; },
        });
      }
      const record = await sendOutsiderNetworkNodeSubmission({
        preview: recordPreview, endpoint, transportPrivateKeyPem: transport.privateKey,
        trustPolicy: policy, fetchImpl: gateway.fetchImpl, clock: clock(),
      });
      assert.equal(record.networkTrust.expectedAudience, endpoint);
      assert.equal(gateway.calls.length, 3);
    } finally {
      String.prototype.replace = replace;
      Array.prototype.includes = includes;
      URL.prototype.toString = toString;
      for (const name of names) Object.defineProperty(URL.prototype, name, descriptors.get(name));
    }
  });
