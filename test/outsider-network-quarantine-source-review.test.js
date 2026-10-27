import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  createNetworkIntakeChallenge,
  createNetworkIntakeManifest,
  createNetworkIntakeReservation,
  networkIntakeDigest,
} from "../src/outsider-network-intake.js";
import {
  NETWORK_QUARANTINE_SOURCE_REVIEW_BOUNDARY,
  NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS,
  NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS,
  createNetworkQuarantineSourceReviewExport,
  networkQuarantineSourceArtifactBindingSetRoot,
  networkQuarantineSourceReviewFileHash,
  networkQuarantineSourceReviewSetRoot,
  verifyNetworkQuarantineSourceReviewExportStructure,
} from "../src/outsider-network-quarantine-source-review.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function pair() {
  const generated = generateKeyPairSync("ed25519");
  return {
    privateKey: generated.privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKey: generated.publicKey.export({ type: "spki", format: "pem" }),
    keyId: `sha256:${createHash("sha256").update(generated.publicKey.export({
      type: "spki", format: "der",
    })).digest("hex")}`,
  };
}

function sourceBytes() {
  return {
    sourceManifest: Buffer.from(
      "{\"schema\":\"fixture/source-manifest/v1\",\"slice\":\"bounded\"}\n", "utf8"),
    instrument: Buffer.from(
      "{\"schema\":\"fixture/instrument/v1\",\"measurement\":\"offline\"}\n", "utf8"),
    rightsReview: Buffer.from(
      "{\"schema\":\"fixture/rights-review/v1\",\"authority\":false}\n", "utf8"),
    privacyReview: Buffer.from(
      "{\"schema\":\"fixture/privacy-review/v1\",\"clearance\":false}\n", "utf8"),
  };
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
    censusSlotHash: h("census-slot"),
  };
}

function payload(selectedSubject) {
  return {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
    attemptRecordHash: selectedSubject.attemptHash,
    executionEvidenceHash: h("execution"),
    outcomeEvidenceHash: h("outcome"),
    obligationStateHash: h("obligation"),
    sourceArtifactHash: h("source-artifact"),
    sourceReplayReferenceHash: h("source-replay"),
    externalOutcomeVerified: false,
    causalAttributionEstablished: false,
    obligationClosed: false,
  };
}

function stableOccurrenceSubjectHash(manifest) {
  return networkIntakeDigest("stable-occurrence-subject", {
    lane: manifest.lane,
    claimHash: manifest.subject.claimHash,
    wayHash: manifest.subject.wayHash,
    worldHash: manifest.subject.worldHash,
    episodeHash: manifest.subject.episodeHash,
    attemptHash: manifest.subject.attemptHash,
    cohortHash: manifest.subject.cohortHash,
    censusSlotHash: manifest.subject.censusSlotHash,
  });
}

function eventFor(reservation) {
  const manifest = reservation.manifest;
  const body = {
    schema: "outsider/network-intake-event/v2",
    ordinal: 2,
    previousEventHash: h("reserved-event"),
    reservationHash: reservation.reservationHash,
    manifestHash: manifest.manifestHash,
    lane: manifest.lane,
    clientSubmissionId: manifest.clientSubmissionId,
    challengeServerKeyId: h("challenge-server-key"),
    registryId: "source-review-test-registry",
    retentionPolicyVersion: "outsider/network-retention-policy/v1",
    appliedRetentionDays: 30,
    retentionUntil: "2026-09-29T00:03:00.000Z",
    eventType: "QUARANTINED",
    objectIdentityHash: manifest.payload.objectIdentityHash,
    occurrenceIdentityHash: manifest.occurrenceIdentityHash,
    stableOccurrenceSubjectHash: stableOccurrenceSubjectHash(manifest),
    semanticSubjectHash: manifest.subject.attemptActorSubjectHash,
    censusSlotHash: manifest.subject.censusSlotHash,
    occurredAt: "2026-08-30T00:03:00.000Z",
    disposition: "QUARANTINED",
    reasonCode: "PENDING_CURATE_REVIEW",
  };
  return { ...body, eventHash: networkIntakeDigest("lifecycle-event", body) };
}

function sourceFields(bytes) {
  return Object.fromEntries(NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS.map(
    (binding) => [binding.manifestField,
      networkQuarantineSourceReviewFileHash(binding.kind, bytes[binding.inputField])]));
}

function replayBindings(bytes, source) {
  return NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS.map((binding) => ({
    kind: binding.kind,
    manifestField: binding.manifestField,
    hashDomain: binding.hashDomain,
    bytes: bytes[binding.inputField].length,
    replayedHash: source[binding.manifestField],
    expectedHash: source[binding.manifestField],
    matched: true,
    localPathProjected: false,
    rawBytesProjected: false,
  }));
}

function setPin(event, bindings) {
  const checkpointHash = h("local-checkpoint-preparation-only");
  const artifactBindingSetRoot = networkQuarantineSourceArtifactBindingSetRoot(bindings);
  const sourceReviewSetRoot = networkQuarantineSourceReviewSetRoot({
    checkpointHash,
    reservationHash: event.reservationHash,
    manifestHash: event.manifestHash,
    eventHash: event.eventHash,
    artifactBindingSetRoot,
  });
  return {
    schema: NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.sourceReviewSetPin,
    checkpointHash,
    reservationHash: event.reservationHash,
    manifestHash: event.manifestHash,
    eventHash: event.eventHash,
    artifactBindingSetRoot,
    sourceReviewSetRoot,
  };
}

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-source-review-"));
  chmodSync(directory, 0o700);
  const bytes = sourceBytes();
  const files = {
    sourceManifest: "source-manifest.json",
    instrument: "instrument.json",
    rightsReview: "rights-review.json",
    privacyReview: "privacy-review.json",
  };
  for (const [role, relative] of Object.entries(files)) {
    writeFileSync(path.join(directory, relative), bytes[role], { mode: 0o600 });
    chmodSync(path.join(directory, relative), 0o600);
  }
  const selectedSubject = subject();
  const selectedPayload = payload(selectedSubject);
  const manifest = createNetworkIntakeManifest({
    lane: "ACTION_OUTCOME",
    clientSubmissionId: "source_review_fixture_0001",
    payloadSchema: selectedPayload.schema,
    payload: selectedPayload,
    subject: selectedSubject,
    source: sourceFields(bytes),
    consentHash: h("consent"),
    retentionDays: 30,
    createdAt: "2026-08-30T00:00:00.000Z",
  });
  const transport = pair();
  const server = pair();
  const audience = "https://intake.outsider.example";
  const challenge = createNetworkIntakeChallenge({
    manifestHash: manifest.manifestHash,
    transportSignerKeyId: transport.keyId,
    audience,
    nonce: "source_review_nonce_0001",
    issuedAt: "2026-08-30T00:01:00.000Z",
    expiresAt: "2026-08-30T00:11:00.000Z",
    serverPrivateKeyPem: server.privateKey,
  });
  const reservation = createNetworkIntakeReservation({
    manifest,
    challenge,
    transportPrivateKeyPem: transport.privateKey,
    serverPublicKeyPem: server.publicKey,
    expectedAudience: audience,
    reservedAt: "2026-08-30T00:02:00.000Z",
    expiresAt: "2026-08-30T00:10:00.000Z",
  });
  const event = eventFor(reservation);
  const item = {
    event,
    object: selectedPayload,
    derivedState: { reservationStatus: "SETTLED" },
    retention: {
      retentionUntil: event.retentionUntil,
      payloadTombstoned: false,
      tombstonedAt: null,
    },
  };
  const bindings = replayBindings(bytes, manifest.source);
  const sourceReviewSetPin = setPin(event, bindings);
  const input = {
    persistedContract: reservation,
    v1ExportItem: item,
    sourceReviewDirectory: directory,
    sourceReviewFiles: files,
    sourceReviewSetPin,
    reviewedAt: "2026-08-30T00:05:00.000Z",
    externalHeadPin: null,
  };
  return { directory, bytes, files, manifest, reservation, event, item,
    bindings, sourceReviewSetPin, selectedPayload, input };
}

function resealExport(value) {
  const copy = structuredClone(value);
  delete copy.exportHash;
  return { ...copy, exportHash: networkIntakeDigest(
    NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.export, copy) };
}

function withFixture(callback) {
  const selected = fixture();
  try { return callback(selected); }
  finally { rmSync(selected.directory, { recursive: true, force: true }); }
}

test("v2 replays four private role-separated files and remains a hash-only HOLD descendant",
  () => withFixture((selected) => {
    const artifact = createNetworkQuarantineSourceReviewExport(selected.input);
    assert.equal(artifact.schema,
      "outsider/network-quarantine-source-review-export/v2");
    assert.match(artifact.exportHash, HASH);
    assert.equal(artifact.sourceReviewSetRoot,
      selected.sourceReviewSetPin.sourceReviewSetRoot);
    assert.equal(artifact.sourceReview.fileCount, 4);
    assert.equal(artifact.sourceReview.totalBytes,
      Object.values(selected.bytes).reduce((sum, bytes) => sum + bytes.length, 0));
    assert.deepEqual(artifact.sourceReview.bindings.map((binding) => binding.kind),
      ["SOURCE_MANIFEST", "INSTRUMENT", "RIGHTS_REVIEW", "PRIVACY_REVIEW"]);
    assert.equal(artifact.sourceReview.bindings.every((binding) =>
      binding.expectedHash === binding.replayedHash && binding.matched), true);
    assert.equal(artifact.sourceReview.predecessorV1EstablishedHashConvention, false);
    assert.equal(artifact.sourceReview.replayEstablishedOnlyUnderDescendantConvention, true);
    assert.equal(artifact.sourceReview.rightsClearanceEstablished, false);
    assert.equal(artifact.sourceReview.privacyClearanceEstablished, false);
    assert.equal(artifact.sourceReview.networkProjectionAuthorized, false);
    assert.equal(artifact.networkSnapshot.object, null);
    assert.equal(artifact.networkSnapshot.objectSuppressed, true);
    assert.equal(artifact.networkSnapshot.predecessorObjectWasPresent, true);
    assert.equal(artifact.lifecycle.payloadAccessibleInDescendant, false);
    assert.equal(artifact.occurrenceCensus.observedQuarantinedOccurrences, 1);
    assert.equal(artifact.objectDedup.referencedDistinctObjectIdentities, 1);
    assert.equal(artifact.objectDedup.occurrenceCountDerivedFromObjectCount, false);
    assert.equal(artifact.occurrenceObjectConflated, false);
    assert.equal(artifact.persistedContract.reservationSelfSignatureVerified, true);
    assert.equal(artifact.persistedContract.reservationChallengeReplayVerified, false);
    assert.equal(artifact.externalHeadAnchor.externalHeadAnchorEstablished, false);
    assert.equal(artifact.useBoundary,
      NETWORK_QUARANTINE_SOURCE_REVIEW_BOUNDARY);
    assert.equal(artifact.useBoundary.authorityGrants, 0);
    assert.equal(artifact.useBoundary.actionAdmissions, 0);
    assert.equal(artifact.useBoundary.trainingRows, 0);
    assert.equal(artifact.useBoundary.causalExperienceUnits, 0);
    assert.equal(artifact.useBoundary.pricingAuthorized, false);
    assert.equal(artifact.useBoundary.guaranteeEstablished, false);
    assert.equal(artifact.useBoundary.settlementAuthorized, false);

    const encoded = JSON.stringify(artifact);
    assert.equal(encoded.includes(selected.directory), false);
    for (const bytes of Object.values(selected.bytes)) {
      assert.equal(encoded.includes(bytes.toString("utf8").trim()), false);
    }
    assert.equal(encoded.includes(selected.reservation.signature.publicKeyPem), false);

    const checked = verifyNetworkQuarantineSourceReviewExportStructure(artifact, {
      expectedExportHash: artifact.exportHash,
      expectedSourceReviewSetRoot: artifact.sourceReviewSetRoot,
    });
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.structuralOnly, true);
    assert.equal(checked.sourceByteReplayReperformed, false);

    const manifestOnly = createNetworkQuarantineSourceReviewExport({
      ...selected.input,
      persistedContract: selected.manifest,
      v1ExportItem: null,
      eventObjectSnapshot: { event: selected.event, object: selected.selectedPayload },
    });
    assert.equal(manifestOnly.supersession.structuralFixtureOnly, true);
    assert.equal(manifestOnly.supersession.networkPublicationAdmissible, false);
    assert.equal(manifestOnly.persistedContract.kind, "MANIFEST_ONLY");
    assert.equal(verifyNetworkQuarantineSourceReviewExportStructure(manifestOnly).ok, true);

    const pinnedReference = createNetworkQuarantineSourceReviewExport({
      ...selected.input,
      externalHeadPin: {
        schema: NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.externalHeadPin,
        eventOrdinal: selected.event.ordinal,
        eventHash: selected.event.eventHash,
        checkpointHash: selected.sourceReviewSetPin.checkpointHash,
        anchorBundleHash: h("anchor-bundle-reference"),
        trustPolicyHash: h("trust-policy-reference"),
        anchoredEventCount: selected.event.ordinal,
        anchoredTailHash: selected.event.eventHash,
      },
    });
    assert.equal(pinnedReference.externalHeadAnchor.pinned, true);
    assert.equal(pinnedReference.externalHeadAnchor.externalHeadAnchorEstablished, false);
    assert.equal(pinnedReference.externalHeadAnchor.independentWitnessEstablished, false);
    assert.equal(verifyNetworkQuarantineSourceReviewExportStructure(pinnedReference).ok, true);
  }));

test("revoked or purged state suppresses sidecars, review files, objects and replay claims",
  () => withFixture((selected) => {
    const revokedItem = structuredClone(selected.item);
    revokedItem.object = null;
    revokedItem.derivedState.reservationStatus = "REVOKED";
    revokedItem.retention.payloadTombstoned = true;
    revokedItem.retention.tombstonedAt = "2026-08-30T00:04:00.000Z";
    const terminal = createNetworkQuarantineSourceReviewExport({
      persistedContract: null,
      v1ExportItem: revokedItem,
      sourceReviewDirectory: path.join(selected.directory, "does-not-exist"),
      sourceReviewFiles: {
        sourceManifest: "missing-a", instrument: "missing-b",
        rightsReview: "missing-c", privacyReview: "missing-d",
      },
      sourceReviewSetPin: null,
      reviewedAt: "2026-08-30T00:05:00.000Z",
      externalHeadPin: null,
    });
    assert.equal(terminal.lifecycle.revoked, true);
    assert.equal(terminal.lifecycle.payloadAccessibleInDescendant, false);
    assert.equal(terminal.networkSnapshot.object, null);
    assert.equal(terminal.persistedContract.kind,
      "SUPPRESSED_BY_RESERVATION_LIFECYCLE");
    assert.equal(terminal.persistedContract.persistedContractHash, null);
    assert.equal(terminal.persistedContract.persistedSidecarRead, false);
    assert.equal(terminal.sourceReviewSetRoot, null);
    assert.equal(terminal.sourceReviewSetPin, null);
    assert.equal(terminal.sourceReview.fileCount, 0);
    assert.equal(terminal.sourceReview.localFilesRead, false);
    assert.equal(terminal.sourceReview.rightsReviewByteReplayEstablished, false);
    assert.equal(terminal.sourceReview.privacyReviewByteReplayEstablished, false);
    assert.equal(verifyNetworkQuarantineSourceReviewExportStructure(terminal).ok, true);

    const resurrected = structuredClone(revokedItem);
    resurrected.object = selected.selectedPayload;
    assert.throws(() => createNetworkQuarantineSourceReviewExport({
      ...selected.input, v1ExportItem: resurrected,
    }), /NETWORK_QUARANTINE_SOURCE_REVIEW_LIFECYCLE_OBJECT_VISIBILITY_INCONSISTENT/u);

    const untombstoned = structuredClone(revokedItem);
    untombstoned.retention.payloadTombstoned = false;
    untombstoned.retention.tombstonedAt = null;
    assert.throws(() => createNetworkQuarantineSourceReviewExport({
      ...selected.input, v1ExportItem: untombstoned,
    }), /NETWORK_QUARANTINE_SOURCE_REVIEW_LIFECYCLE_TOMBSTONE_INCONSISTENT/u);

    const clearanceEscalation = structuredClone(terminal);
    clearanceEscalation.sourceReview.rightsClearanceEstablished = true;
    assert.equal(verifyNetworkQuarantineSourceReviewExportStructure(
      resealExport(clearanceEscalation)).ok, false);
    const anchorEscalation = structuredClone(terminal);
    anchorEscalation.externalHeadAnchor.externalHeadAnchorEstablished = true;
    assert.equal(verifyNetworkQuarantineSourceReviewExportStructure(
      resealExport(anchorEscalation)).ok, false);
  }));

test("missing, swapped, mismatched, linked, non-regular and insecure review files fail closed",
  () => {
    withFixture((selected) => {
      writeFileSync(path.join(selected.directory, selected.files.rightsReview),
        Buffer.from("tampered-rights-review\n"), { mode: 0o600 });
      chmodSync(path.join(selected.directory, selected.files.rightsReview), 0o600);
      assert.throws(() => createNetworkQuarantineSourceReviewExport(selected.input),
        /NETWORK_QUARANTINE_SOURCE_REVIEW_SOURCE_REVIEW_HASH_MISMATCH:RIGHTS_REVIEW/u);
    });
    withFixture((selected) => {
      assert.throws(() => createNetworkQuarantineSourceReviewExport({
        ...selected.input,
        sourceReviewFiles: { ...selected.files,
          rightsReview: selected.files.privacyReview,
          privacyReview: selected.files.rightsReview },
      }), /NETWORK_QUARANTINE_SOURCE_REVIEW_SOURCE_REVIEW_HASH_MISMATCH/u);
    });
    withFixture((selected) => {
      unlinkSync(path.join(selected.directory, selected.files.rightsReview));
      assert.throws(() => createNetworkQuarantineSourceReviewExport(selected.input),
        /NETWORK_QUARANTINE_SOURCE_REVIEW_SOURCE_REVIEW_FILE_MISSING/u);
    });
    withFixture((selected) => {
      const rights = path.join(selected.directory, selected.files.rightsReview);
      unlinkSync(rights);
      symlinkSync(path.join(selected.directory, selected.files.privacyReview), rights);
      assert.throws(() => createNetworkQuarantineSourceReviewExport(selected.input),
        /NETWORK_QUARANTINE_SOURCE_REVIEW_SOURCE_REVIEW_FILE_UNSAFE/u);
    });
    withFixture((selected) => {
      chmodSync(path.join(selected.directory, selected.files.rightsReview), 0o644);
      assert.throws(() => createNetworkQuarantineSourceReviewExport(selected.input),
        /NETWORK_QUARANTINE_SOURCE_REVIEW_SOURCE_REVIEW_FILE_UNSAFE/u);
    });
    withFixture((selected) => {
      const rights = path.join(selected.directory, selected.files.rightsReview);
      unlinkSync(rights);
      linkSync(path.join(selected.directory, selected.files.privacyReview), rights);
      assert.throws(() => createNetworkQuarantineSourceReviewExport(selected.input),
        /NETWORK_QUARANTINE_SOURCE_REVIEW_SOURCE_REVIEW_FILE_UNSAFE/u);
    });
    withFixture((selected) => {
      const rights = path.join(selected.directory, selected.files.rightsReview);
      unlinkSync(rights);
      mkdirSync(rights, { mode: 0o700 });
      assert.throws(() => createNetworkQuarantineSourceReviewExport(selected.input),
        /NETWORK_QUARANTINE_SOURCE_REVIEW_SOURCE_REVIEW_FILE_UNSAFE/u);
    });
    withFixture((selected) => {
      const badPin = structuredClone(selected.sourceReviewSetPin);
      badPin.sourceReviewSetRoot = h("wrong-source-review-root");
      assert.throws(() => createNetworkQuarantineSourceReviewExport({
        ...selected.input, sourceReviewSetPin: badPin,
      }), /NETWORK_QUARANTINE_SOURCE_REVIEW_SOURCE_REVIEW_SET_PIN_ROOT_INVALID/u);
    });
    withFixture((selected) => {
      const conflated = structuredClone(selected.item);
      conflated.event.occurrenceIdentityHash = conflated.event.objectIdentityHash;
      const { eventHash: _eventHash, ...body } = conflated.event;
      conflated.event.eventHash = networkIntakeDigest("lifecycle-event", body);
      assert.throws(() => createNetworkQuarantineSourceReviewExport({
        ...selected.input, v1ExportItem: conflated,
      }), /NETWORK_QUARANTINE_SOURCE_REVIEW_OCCURRENCE_OBJECT_IDENTITY_CONFLATION/u);
    });
  });
