import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createAutonomousWorkOrderProjection,
} from "../src/outsider-autonomous-work-order.js";
import {
  createEpisodeAttemptSetComposition,
} from "../src/outsider-episode-attempt-set-composition.js";
import {
  AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_PRIVATE_FILES,
  createAutonomousWorkOrderPrivateLineage,
  createPendingAutonomousWorkOrderSourceBoundEnvelope,
  publishAutonomousWorkOrderPrivateBundle,
  verifyAutonomousWorkOrderPrivateBundleAgainstTrustedSources,
  verifyAutonomousWorkOrderPrivateBundleStructure,
} from "../src/outsider-autonomous-work-order-private-bundle.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const mode = (target) => lstatSync(target).mode & 0o777;
const mutable = (value) => JSON.parse(JSON.stringify(value));

function workOrderInput(label = "one") {
  const provider = h(`${label}:provider`);
  return {
    orderId: `awo_${h(`order:${label}`).slice(7, 39)}`,
    recordedAt: "2026-09-01T00:00:00.000Z",
    appendOnlyLineage: {
      revision: 0,
      predecessorProjectionHash: null,
      supersedesProjectionHash: null,
    },
    typedGraph: {
      principalEpoch: {
        principalRefHash: h(`${label}:principal`),
        epochRefHash: h(`${label}:principal-epoch`),
        principalEpochProjectionHash: h(`${label}:principal-epoch-projection`),
      },
      accountableDeployment: {
        deploymentLineageRefHash: h(`${label}:deployment-lineage`),
        deploymentRevisionHash: h(`${label}:deployment-revision`),
        accountableDeploymentSubjectHash: h(`${label}:deployment-subject`),
      },
      runtime: {
        runtimeInstanceRefHash: h(`${label}:runtime-ref`),
        runtimeInstanceHash: h(`${label}:runtime`),
      },
      embodiment: {
        present: true,
        deviceLineageRefHash: h(`${label}:device-lineage`),
        embodimentRevisionHash: h(`${label}:embodiment-revision`),
      },
      delegation: {
        delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
        delegationEdgeHash: h(`${label}:delegation-edge`),
      },
      episode: {
        episodeHash: h(`${label}:episode`),
        networkCompleteEpisodeJoinHash: h(`${label}:complete-episode`),
      },
      attempt: {
        attemptHash: h(`${label}:attempt`),
        attemptActorSubjectHash: h(`${label}:attempt-actor`),
      },
    },
    contractReferences: {
      actorIdentityEnvelopeHash: h(`${label}:actor-envelope`),
      realitySemanticBundleHash: h(`${label}:semantic-bundle`),
      realityObligationGenesisHash: h(`${label}:obligation-genesis`),
      realityObligationStateHash: h(`${label}:obligation-state`),
      affectedPartyRootHash: h(`${label}:affected-party-root`),
      outcomeWitnessEnvelopeHash: null,
    },
    resourceOwner: {
      resourceOwnerRefHash: h(`${label}:resource-owner`),
      ownerAdoptionEvidenceRefHash: null,
      externalAdoptionEstablished: false,
    },
    promisedOutcome: {
      promisedOutcomeRefHash: h(`${label}:promised-outcome`),
      acceptanceCriteriaHash: h(`${label}:acceptance-criteria`),
      outcomeWitnessRequirementHash: h(`${label}:witness-requirement`),
      consequenceChannelHashes: [h(`${label}:channel-a`)],
    },
    observationHorizons: [
      { horizonId: "immediate", dueAfterMs: 0,
        observationRequirementHash: h(`${label}:observe-now`), mandatory: true },
      { horizonId: "delayed", dueAfterMs: 1000,
        observationRequirementHash: h(`${label}:observe-later`), mandatory: true },
    ],
    obligors: [
      { obligorRefHash: provider, role: "PRIMARY_PERFORMANCE",
        obligationRefHash: h(`${label}:primary-duty`) },
      { obligorRefHash: provider, role: "RECOVERY",
        obligationRefHash: h(`${label}:recovery-duty`) },
    ],
    remedyMenu: [
      { remedyId: "reperform", kind: "REPERFORM",
        remedyTermsHash: h(`${label}:remedy-terms`),
        obligorRefHashes: [provider] },
    ],
    protectionFunding: { status: "NONE" },
    orderStatus: "STRUCTURAL_PRECOMMITMENT_HOLD",
    challenge: { opened: false, challengeRefHash: null,
      standingExternallyVerified: false },
    closure: { closed: false, closureRefHash: null,
      externalClosureVerified: false },
    proofAccessPolicy: {
      roleScopedProofPolicyHash: h(`${label}:proof-policy`),
      redactionPolicyHash: h(`${label}:redaction-policy`),
    },
  };
}

function fixture(label = "one") {
  const projection = createAutonomousWorkOrderProjection(workOrderInput(label));
  const attemptSetComposition = createEpisodeAttemptSetComposition({
    recordedAt: "2026-09-01T00:00:01.000Z",
    episodeBinding: {
      principalEpochProjectionHash:
        projection.typedGraph.principalEpoch.principalEpochProjectionHash,
      accountableDeploymentSubjectHash:
        projection.typedGraph.accountableDeployment.accountableDeploymentSubjectHash,
      runtimeInstanceHash: projection.typedGraph.runtime.runtimeInstanceHash,
      embodimentRevisionHash:
        projection.typedGraph.embodiment.embodimentRevisionHash,
      delegationEdgeHash: projection.typedGraph.delegation.delegationEdgeHash,
      episodeHash: projection.typedGraph.episode.episodeHash,
      workOrderProjectionHash: projection.workOrderHash,
      networkCompleteEpisodeJoinHash:
        projection.typedGraph.episode.networkCompleteEpisodeJoinHash,
      prospectiveCensusProjectionHash: h(`${label}:census-projection`),
      realityObligationGenesisHash:
        projection.contractReferences.realityObligationGenesisHash,
      realityObligationStateHash:
        projection.contractReferences.realityObligationStateHash,
      genesisObligationAttemptHash: projection.typedGraph.attempt.attemptHash,
    },
    appendOnlyLineage: {
      revision: 0,
      predecessorCompositionHash: null,
      supersedesCompositionHash: null,
    },
    attempts: [{
      attemptOrdinal: 1,
      occurredAt: "2026-09-01T00:00:00.500Z",
      episodeHash: projection.typedGraph.episode.episodeHash,
      attemptHash: projection.typedGraph.attempt.attemptHash,
      attemptActorSubjectHash:
        projection.typedGraph.attempt.attemptActorSubjectHash,
      kind: "PRIMARY",
      retryOfAttemptHash: null,
      recoveryOfAttemptHash: null,
    }],
    reportOccurrences: [{
      reportOrdinal: 1,
      reportedAt: "2026-09-01T00:00:00.750Z",
      episodeHash: projection.typedGraph.episode.episodeHash,
      occurrenceIdentityHash: h(`${label}:occurrence`),
      attemptHash: projection.typedGraph.attempt.attemptHash,
      networkObjectIdentityHash: h(`${label}:network-object`),
      networkReceiptHash: h(`${label}:network-receipt`),
      executionDisposition: "UNKNOWN",
      outcomeObservationStatus: "UNKNOWN",
      reportedOutcomeEvidenceHash: null,
      consequenceEvidenceHashes: [],
    }],
  });
  const sourceBoundEnvelope =
    createPendingAutonomousWorkOrderSourceBoundEnvelope({
      workOrderHash: projection.workOrderHash,
      attemptSetCompositionHash: attemptSetComposition.compositionHash,
    });
  const lineage = createAutonomousWorkOrderPrivateLineage({
    projection,
    attemptSetComposition,
    sourceBoundEnvelope,
    predecessor: null,
  });
  return { projection, attemptSetComposition, sourceBoundEnvelope, lineage };
}

function attemptSetInput(record) {
  return {
    recordedAt: record.recordedAt,
    episodeBinding: {
      principalEpochProjectionHash: record.episodeBinding.principalEpochProjectionHash,
      accountableDeploymentSubjectHash:
        record.episodeBinding.accountableDeploymentSubjectHash,
      runtimeInstanceHash: record.episodeBinding.runtimeInstanceHash,
      embodimentRevisionHash: record.episodeBinding.embodimentRevisionHash,
      delegationEdgeHash: record.episodeBinding.delegationEdgeHash,
      episodeHash: record.episodeBinding.episodeHash,
      workOrderProjectionHash: record.episodeBinding.workOrderProjectionHash,
      networkCompleteEpisodeJoinHash:
        record.episodeBinding.networkCompleteEpisodeJoinHash,
      prospectiveCensusProjectionHash:
        record.episodeBinding.prospectiveCensusProjectionHash,
      realityObligationGenesisHash:
        record.episodeBinding.realityObligationGenesisHash,
      realityObligationStateHash: record.episodeBinding.realityObligationStateHash,
      genesisObligationAttemptHash:
        record.episodeBinding.callerSuppliedGenesisObligationAttemptHash,
    },
    appendOnlyLineage: {
      revision: record.appendOnlyLineage.revision,
      predecessorCompositionHash:
        record.appendOnlyLineage.predecessorCompositionHash,
      supersedesCompositionHash:
        record.appendOnlyLineage.supersedesCompositionHash,
    },
    attempts: record.attempts.map((row) => ({
      attemptOrdinal: row.attemptOrdinal,
      occurredAt: row.occurredAt,
      episodeHash: row.episodeHash,
      attemptHash: row.attemptHash,
      attemptActorSubjectHash: row.attemptActorSubjectHash,
      kind: row.kind,
      retryOfAttemptHash: row.retryOfAttemptHash,
      recoveryOfAttemptHash: row.recoveryOfAttemptHash,
    })),
    reportOccurrences: record.reportOccurrences.map((row) => ({
      reportOrdinal: row.reportOrdinal,
      reportedAt: row.reportedAt,
      episodeHash: row.episodeHash,
      occurrenceIdentityHash: row.occurrenceIdentityHash,
      attemptHash: row.attemptHash,
      networkObjectIdentityHash: row.networkObjectIdentityHash,
      networkReceiptHash: row.networkReceiptHash,
      executionDisposition: row.executionDisposition,
      outcomeObservationStatus: row.outcomeObservationStatus,
      reportedOutcomeEvidenceHash: row.reportedOutcomeEvidenceHash,
      consequenceEvidenceHashes: row.consequenceEvidenceHashes,
    })),
  };
}

function options(root, output, bundle) {
  return {
    trustedRoot: root,
    outputDirectory: output,
    expectedWorkOrderHash: bundle.projection.workOrderHash,
    expectedAttemptSetCompositionHash:
      bundle.attemptSetComposition.compositionHash,
    expectedSourceBoundEnvelopeHash:
      bundle.sourceBoundEnvelope.sourceBoundEnvelopeHash,
    expectedLineageHash: bundle.lineage.lineageHash,
    attemptSetPredecessor: null,
  };
}

function publish(label = "one") {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-awo-private-"));
  const output = path.join(root, `release-${label}`);
  const bundle = fixture(label);
  const published = publishAutonomousWorkOrderPrivateBundle(bundle,
    options(root, output, bundle));
  return { root, output, bundle, published };
}

test("publishes one exact private five-file structural bundle and remains HOLD", () => {
  const { output, bundle, published } = publish("basic");
  assert.equal(published.ok, true);
  assert.equal(published.structuralBundleVerified, true);
  assert.equal(published.sourceReplayVerified, false);
  assert.equal(published.trustedSourceReplayVerifierIntegrated, false);
  assert.equal(published.networkOrderEstablished, false);
  assert.equal(mode(output), 0o700);
  assert.deepEqual(Object.values(AUTONOMOUS_WORK_ORDER_PRIVATE_FILES).sort(),
    published.actualFiles.map((file) => file.fileName).sort());
  assert.equal(published.actualFiles.length, 5);
  for (const file of Object.values(AUTONOMOUS_WORK_ORDER_PRIVATE_FILES)) {
    assert.equal(mode(path.join(output, file)), 0o600);
    assert.equal(lstatSync(path.join(output, file)).nlink, 1);
  }
  assert.equal(published.bundle.receipt.workOrderHash,
    bundle.projection.workOrderHash);
  assert.equal(published.bundle.receipt.attemptSetCompositionHash,
    bundle.attemptSetComposition.compositionHash);
  assert.deepEqual(published.boundary,
    AUTONOMOUS_WORK_ORDER_PRIVATE_BUNDLE_BOUNDARY);

  const checked = verifyAutonomousWorkOrderPrivateBundleStructure(output);
  assert.equal(checked.ok, true);
  assert.equal(checked.receiptToActualFileByteBindingEstablished, true);
  assert.equal(checked.exactFileSetEstablished, true);
  assert.equal(checked.sourceReplayVerified, false);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.equal(checked.executable, false);
});

test("trusted entrypoint matches caller-supplied byte pins but refuses to invent source replay", () => {
  const { output, published } = publish("trusted-pending");
  const checked = verifyAutonomousWorkOrderPrivateBundleAgainstTrustedSources(
    output, {
      expectedReceiptHash: published.receiptHash,
      expectedActualFileSetHash: published.actualFileSetHash,
      attemptSetPredecessor: null,
      sourceReplayVerified: true,
    });
  assert.equal(checked.ok, false);
  assert.equal(checked.structuralBundleVerified, true);
  assert.equal(checked.callerSuppliedBytePinsMatched, true);
  assert.equal(checked.externalPinProvenanceEstablished, false);
  assert.equal(checked.trustedSourceReplayVerifierIntegrated, false);
  assert.equal(checked.sourceReplayVerified, false);
  assert.equal(checked.networkOrderEstablished, false);
  assert.match(checked.error, /TRUSTED_SOURCE_REPLAY_VERIFIER_NOT_INTEGRATED/u);

  const wrongPin = verifyAutonomousWorkOrderPrivateBundleAgainstTrustedSources(
    output, {
      expectedReceiptHash: h("wrong-receipt"),
      expectedActualFileSetHash: published.actualFileSetHash,
    });
  assert.equal(wrongPin.ok, false);
  assert.equal(wrongPin.callerSuppliedBytePinsMatched, false);
  assert.equal(wrongPin.externalPinProvenanceEstablished, false);
  assert.equal(wrongPin.sourceReplayVerified, false);
});

test("publication is no-clobber and never resumes a partial or identical target", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-awo-existing-"));
  const output = path.join(root, "release");
  mkdirSync(output, { mode: 0o700 });
  const sentinel = path.join(output, "do-not-change");
  writeFileSync(sentinel, "ORIGINAL", { mode: 0o600 });
  const bundle = fixture("existing");
  assert.throws(() => publishAutonomousWorkOrderPrivateBundle(bundle,
    options(root, output, bundle)), /OUTPUT_DIRECTORY_EXISTS/u);
  assert.equal(readFileSync(sentinel, "utf8"), "ORIGINAL");
});

test("publisher rejects a symlink target without touching its victim", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-awo-link-target-"));
  const victim = path.join(root, "victim");
  writeFileSync(victim, "VICTIM", { mode: 0o600 });
  const output = path.join(root, "release");
  symlinkSync(victim, output);
  const bundle = fixture("link-target");
  assert.throws(() => publishAutonomousWorkOrderPrivateBundle(bundle,
    options(root, output, bundle)), /OUTPUT_DIRECTORY_EXISTS/u);
  assert.equal(readFileSync(victim, "utf8"), "VICTIM");
});

test("structural verifier rejects extra, missing, symlinked, hardlinked and non-private files", () => {
  {
    const { output } = publish("extra");
    writeFileSync(path.join(output, "unreceipted.json"), "{}\n", { mode: 0o600 });
    assert.equal(verifyAutonomousWorkOrderPrivateBundleStructure(output).ok, false);
  }
  {
    const { output } = publish("missing");
    unlinkSync(path.join(output, AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.lineage));
    assert.equal(verifyAutonomousWorkOrderPrivateBundleStructure(output).ok, false);
  }
  {
    const { root, output } = publish("symlink-file");
    const target = path.join(root, "victim.json");
    writeFileSync(target, "VICTIM", { mode: 0o600 });
    const file = path.join(output, AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.projection);
    unlinkSync(file);
    symlinkSync(target, file);
    const checked = verifyAutonomousWorkOrderPrivateBundleStructure(output);
    assert.equal(checked.ok, false);
    assert.equal(readFileSync(target, "utf8"), "VICTIM");
  }
  {
    const { root, output } = publish("hardlink");
    const file = path.join(output,
      AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.attemptSetComposition);
    linkSync(file, path.join(root, "second-hardlink"));
    assert.equal(lstatSync(file).nlink, 2);
    assert.equal(verifyAutonomousWorkOrderPrivateBundleStructure(output).ok, false);
  }
  {
    const { output } = publish("mode");
    chmodSync(path.join(output, AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.lineage), 0o644);
    assert.equal(verifyAutonomousWorkOrderPrivateBundleStructure(output).ok, false);
  }
});

test("receipt transplant, payload mutation and post-receipt touch all fail closed", () => {
  {
    const left = publish("transplant-left");
    const right = publish("transplant-right");
    copyFileSync(path.join(left.output, AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.receipt),
      path.join(right.output, AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.receipt));
    chmodSync(path.join(right.output, AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.receipt),
      0o600);
    assert.equal(verifyAutonomousWorkOrderPrivateBundleStructure(right.output).ok,
      false);
  }
  {
    const { output } = publish("mutation");
    const file = path.join(output,
      AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.sourceBoundEnvelope);
    writeFileSync(file, "{}\n", { mode: 0o600 });
    assert.equal(verifyAutonomousWorkOrderPrivateBundleStructure(output).ok, false);
  }
  {
    const { output } = publish("receipt-order");
    const file = path.join(output, AUTONOMOUS_WORK_ORDER_PRIVATE_FILES.projection);
    const future = new Date(Date.now() + 60_000);
    utimesSync(file, future, future);
    const checked = verifyAutonomousWorkOrderPrivateBundleStructure(output);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /RECEIPT_NOT_LAST/u);
  }
});

test("pending envelope and genesis lineage reject caller-positive trust and supersession", () => {
  const bundle = fixture("escalation");
  const forgedEnvelope = mutable(bundle.sourceBoundEnvelope);
  forgedEnvelope.sourceReplayVerified = true;
  assert.throws(() => createAutonomousWorkOrderPrivateLineage({
    projection: bundle.projection,
    attemptSetComposition: bundle.attemptSetComposition,
    sourceBoundEnvelope: forgedEnvelope,
    predecessor: null,
  }), /SOURCE_BOUND_ENVELOPE_STATE_INVALID/u);

  assert.throws(() => createAutonomousWorkOrderPrivateLineage({
    projection: bundle.projection,
    attemptSetComposition: bundle.attemptSetComposition,
    sourceBoundEnvelope: bundle.sourceBoundEnvelope,
    predecessor: {
      revision: 0,
      orderIdentityHash: bundle.projection.episodeAlias.orderIdentityHash,
      workOrderHash: h("prior-work-order"),
      attemptSetCompositionHash: h("prior-attempt-set"),
      sourceBoundEnvelopeHash: h("prior-source-envelope"),
      publicationReceiptHash: h("prior-receipt"),
      actualFileSetHash: h("prior-file-set"),
    },
  }), /GENESIS_LINEAGE_PREDECESSOR_FORBIDDEN/u);
});

test("bundle rejects a different genesis Attempt under the same Episode", () => {
  const base = fixture("attempt-splice");
  const input = attemptSetInput(base.attemptSetComposition);
  const otherAttemptHash = h("attempt-splice:other-attempt");
  const otherAttemptActorSubjectHash = h("attempt-splice:other-attempt-actor");
  input.episodeBinding.genesisObligationAttemptHash = otherAttemptHash;
  input.attempts[0].attemptHash = otherAttemptHash;
  input.attempts[0].attemptActorSubjectHash = otherAttemptActorSubjectHash;
  input.reportOccurrences[0].attemptHash = otherAttemptHash;
  const attemptSetComposition = createEpisodeAttemptSetComposition(input);
  const sourceBoundEnvelope = createPendingAutonomousWorkOrderSourceBoundEnvelope({
    workOrderHash: base.projection.workOrderHash,
    attemptSetCompositionHash: attemptSetComposition.compositionHash,
  });
  const lineage = createAutonomousWorkOrderPrivateLineage({
    projection: base.projection,
    attemptSetComposition,
    sourceBoundEnvelope,
    predecessor: null,
  });
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-awo-splice-"));
  const output = path.join(root, "release");
  const spliced = { projection: base.projection, attemptSetComposition,
    sourceBoundEnvelope, lineage };
  assert.throws(() => publishAutonomousWorkOrderPrivateBundle(spliced,
    options(root, output, spliced)), /PAYLOAD_CROSSWALK_INVALID/u);
  assert.equal(lstatSync(root).isDirectory(), true);
  assert.throws(() => lstatSync(output), /ENOENT/u,
    "crosswalk rejection happens before any publication directory is created");
});

test("private bundle hashes remain stable after Hash prototype poisoning", () => {
  const bundle = fixture("hash-intrinsics");
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-awo-hash-"));
  const output = path.join(root, "release");
  const prototype = Object.getPrototypeOf(createHash("sha256"));
  const originalUpdate = prototype.update;
  const originalDigest = prototype.digest;
  try {
    prototype.update = function poisonedUpdate() {
      throw new Error("POISONED_HASH_UPDATE");
    };
    prototype.digest = function poisonedDigest() {
      throw new Error("POISONED_HASH_DIGEST");
    };
    const published = publishAutonomousWorkOrderPrivateBundle(bundle,
      options(root, output, bundle));
    assert.equal(published.ok, true);
    assert.equal(published.sourceReplayVerified, false);
    assert.equal(published.receiptHash, published.bundle.receipt.receiptHash);
  } finally {
    prototype.update = originalUpdate;
    prototype.digest = originalDigest;
  }
});
