import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  chmodSync, linkSync, lstatSync, mkdtempSync, readFileSync, readdirSync, symlinkSync,
  unlinkSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createAutonomousWorkOrderDisputeReviewLedger,
} from "../src/outsider-autonomous-work-order-dispute-review.js";
import {
  AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES,
  AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES,
  AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS,
  deriveAutonomousWorkOrderDisputeReviewPrivateSourceProjection,
  publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle,
  verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleAgainstTrustedSources,
  verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure,
} from "../src/outsider-autonomous-work-order-dispute-review-source-bundle.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function aliases() {
  return {
    caseScopedAlias: `case_${h("synthetic-case-salt").slice(7, 39)}`,
    caseScopedParticipantAlias:
      `participant_${h("synthetic-case-participant-salt").slice(7, 39)}`,
  };
}

function reconstruction() {
  return {
    promiseRefCommitment: h("synthetic:promise"),
    attemptRefCommitment: h("synthetic:attempt"),
    observationRefCommitment: h("synthetic:observation"),
    unresolvedRefCommitment: h("synthetic:unresolved"),
  };
}

function reconstructionHash(value) {
  return domainHash(
    "outsider.autonomous-work-order.dispute-review-reconstruction.v1", value);
}

function syntheticBytes(revision = 0) {
  return {
    historicalCaseManifest: Buffer.from(
      `SYNTHETIC_ONLY historical manifest ${revision} person@example.invalid`, "utf8"),
    reconstructionPacket: Buffer.from(
      "SYNTHETIC_ONLY exact review packet; never a real participant record", "utf8"),
    externalChannelInvitation: Buffer.from(
      `SYNTHETIC_ONLY external invitation ${revision} nonce`, "utf8"),
    externalChannelResponse: Buffer.from(
      `SYNTHETIC_ONLY external response ${revision} https://invalid.example/private`,
      "utf8"),
    rightsEvidence: Buffer.from(`SYNTHETIC_ONLY rights unresolved ${revision}`, "utf8"),
    privacyEvidence: Buffer.from(`SYNTHETIC_ONLY privacy unresolved ${revision}`, "utf8"),
    lifecycleEvidence: Buffer.from(`SYNTHETIC_ONLY lifecycle current ${revision}`, "utf8"),
  };
}

function materialDelta() {
  return {
    changeKind: "EVIDENCE_REQUEST",
    decisionPointRefCommitment: h("synthetic:decision-point"),
    beforeRefCommitment: h("synthetic:before"),
    changedRefCommitment: h("synthetic:changed"),
    triggeringComponents: ["ATTEMPT", "OBSERVATION"],
  };
}

function context(revision = 0) {
  const scoped = aliases();
  const reconstructionRecord = reconstruction();
  return {
    bundleRevision: revision,
    ...scoped,
    workOrderHash: h("synthetic:work-order"),
    episodeHash: h("synthetic:episode"),
    attemptSetCompositionHash: h("synthetic:attempt-set"),
    reconstructionHash: reconstructionHash(reconstructionRecord),
    purposeHash: h("synthetic:purpose"),
    audienceHash: h("synthetic:audience"),
    invitationOccurrenceIdentityHash: h("synthetic:invitation-occurrence"),
    responseOccurrenceIdentityHash: h("synthetic:response-occurrence"),
    challengeNonceCommitmentHash: h("synthetic:challenge"),
  };
}

function derivation(revision = 0, bytes = syntheticBytes(revision),
  key = Buffer.alloc(32, revision + 1)) {
  const bindingContext = context(revision);
  const derived = deriveAutonomousWorkOrderDisputeReviewPrivateSourceProjection({
    bindingContext, sourceBytes: bytes, commitmentKey: key,
  });
  return { bindingContext, sourceBytes: bytes, commitmentKey: key, derived };
}

function invitationRow(bindingContext, bindings) {
  return {
    occurrenceOrdinal: 1,
    occurredAt: "2026-08-31T00:00:01.000Z",
    occurrenceIdentityHash: bindingContext.invitationOccurrenceIdentityHash,
    suppliedPrivateObjectCommitmentHash:
      bindings.suppliedPrivateInvitationObjectCommitmentHash,
    caseScopedParticipantAlias: bindingContext.caseScopedParticipantAlias,
    reviewPacketHash: bindings.reviewPacketHash,
    reconstructionHash: bindingContext.reconstructionHash,
    kind: "INVITATION",
    respondsToOccurrenceIdentityHash: null,
    challengeNonceCommitmentHash: bindingContext.challengeNonceCommitmentHash,
    responseVerdict: null,
    sourceChannelContinuityCommitmentHash: null,
    directParticipationLinkCommitmentHash: null,
    materialDelta: null,
    materialCorrectionCommitmentHash: null,
  };
}

function responseRow(bindingContext, bindings) {
  return {
    occurrenceOrdinal: 2,
    occurredAt: "2026-08-31T00:00:02.000Z",
    occurrenceIdentityHash: bindingContext.responseOccurrenceIdentityHash,
    suppliedPrivateObjectCommitmentHash:
      bindings.suppliedPrivateResponseObjectCommitmentHash,
    caseScopedParticipantAlias: bindingContext.caseScopedParticipantAlias,
    reviewPacketHash: bindings.reviewPacketHash,
    reconstructionHash: bindingContext.reconstructionHash,
    kind: "RESPONSE",
    respondsToOccurrenceIdentityHash:
      bindingContext.invitationOccurrenceIdentityHash,
    challengeNonceCommitmentHash: bindingContext.challengeNonceCommitmentHash,
    responseVerdict: "YES_WOULD_HAVE_CHANGED",
    sourceChannelContinuityCommitmentHash:
      bindings.sourceChannelContinuityCommitmentHash,
    directParticipationLinkCommitmentHash:
      bindings.directParticipationLinkCommitmentHash,
    materialDelta: materialDelta(),
    materialCorrectionCommitmentHash: null,
  };
}

function ledgerInput(derivedFixture, rows, revision = 0, predecessor = null) {
  const { bindingContext, derived } = derivedFixture;
  const bindings = derived.privateLedgerBindings;
  return {
    recordedAt: `2026-08-31T00:01:0${revision}.000Z`,
    caseBinding: {
      caseScopedAlias: bindingContext.caseScopedAlias,
      privateBundleRootCommitment: bindings.privateBundleRootCommitment,
      workOrderHash: bindingContext.workOrderHash,
      episodeHash: bindingContext.episodeHash,
      attemptSetCompositionHash: bindingContext.attemptSetCompositionHash,
      reconstructionHash: bindingContext.reconstructionHash,
      reviewPacketHash: bindings.reviewPacketHash,
      purposeHash: bindingContext.purposeHash,
      audienceHash: bindingContext.audienceHash,
      rightsReviewRootCommitment: bindings.rightsReviewRootCommitment,
      privacyReviewRootCommitment: bindings.privacyReviewRootCommitment,
    },
    reconstruction: reconstruction(),
    appendOnlyLineage: {
      revision,
      predecessorLedgerHash: predecessor?.ledgerHash ?? null,
      supersedesLedgerHash: predecessor?.ledgerHash ?? null,
      revisionBasisKind: revision === 0 ? "GENESIS" : "OCCURRENCE_APPEND_ONLY",
      revisionBasisCommitmentHash: null,
    },
    reviewOccurrences: rows,
  };
}

function occurrenceInputs(ledger) {
  return ledger.reviewOccurrences.map((row) => ({
    occurrenceOrdinal: row.occurrenceOrdinal,
    occurredAt: row.occurredAt,
    occurrenceIdentityHash: row.occurrenceIdentityHash,
    suppliedPrivateObjectCommitmentHash: row.suppliedPrivateObjectCommitmentHash,
    caseScopedParticipantAlias: row.caseScopedParticipantAlias,
    reviewPacketHash: row.reviewPacketHash,
    reconstructionHash: row.reconstructionHash,
    kind: row.kind,
    respondsToOccurrenceIdentityHash: row.respondsToOccurrenceIdentityHash,
    challengeNonceCommitmentHash: row.challengeNonceCommitmentHash,
    responseVerdict: row.responseVerdict,
    sourceChannelContinuityCommitmentHash: row.sourceChannelContinuityCommitmentHash,
    directParticipationLinkCommitmentHash: row.directParticipationLinkCommitmentHash,
    materialDelta: row.materialDelta === null ? null : {
      changeKind: row.materialDelta.changeKind,
      decisionPointRefCommitment: row.materialDelta.decisionPointRefCommitment,
      beforeRefCommitment: row.materialDelta.beforeRefCommitment,
      changedRefCommitment: row.materialDelta.changedRefCommitment,
      triggeringComponents: [...row.materialDelta.triggeringComponents],
    },
    materialCorrectionCommitmentHash: row.materialCorrectionCommitmentHash,
  }));
}

function syntheticGenesis() {
  const source = derivation();
  const bindings = source.derived.privateLedgerBindings;
  const invitation = invitationRow(source.bindingContext, bindings);
  const response = responseRow(source.bindingContext, bindings);
  const ledger = createAutonomousWorkOrderDisputeReviewLedger(
    ledgerInput(source, [invitation, response]));
  return { ...source, ledger };
}

function opaqueDirectory(root, label) {
  return path.join(root, `bundle_${h(label).slice(7, 39)}`);
}

function publicationOptions(root, output, fixture, predecessorBundle = null,
  predecessorReceiptHash = null) {
  return {
    trustedRoot: root,
    outputDirectory: output,
    expectedLedgerHash: fixture.ledger.ledgerHash,
    expectedNetworkProjectionHash:
      fixture.derived.networkProjection.projectionHash,
    expectedPrivateBundleRootCommitment:
      fixture.derived.privateLedgerBindings.privateBundleRootCommitment,
    predecessorBundleDirectory: predecessorBundle,
    expectedPredecessorReceiptHash: predecessorReceiptHash,
  };
}

function publishGenesis(label = "synthetic") {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-dispute-source-"));
  chmodSync(root, 0o700);
  const output = opaqueDirectory(root, label);
  const fixture = syntheticGenesis();
  const published = publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle({
    ledger: fixture.ledger,
    ledgerPredecessor: null,
    bindingContext: fixture.bindingContext,
    sourceBytes: fixture.sourceBytes,
    commitmentKey: fixture.commitmentKey,
    lifecycleDisposition: "CURRENT",
  }, publicationOptions(root, output, fixture));
  return { root, output, fixture, published };
}

function syntheticWithdrawalDescendant(genesis) {
  const descendantSource = derivation(1, {
    ...genesis.fixture.sourceBytes,
    lifecycleEvidence: Buffer.from("SYNTHETIC_ONLY lifecycle withdrawn 1", "utf8"),
  }, genesis.fixture.commitmentKey);
  const rows = occurrenceInputs(genesis.fixture.ledger);
  rows.push({
    occurrenceOrdinal: 3,
    occurredAt: "2026-08-31T00:00:03.000Z",
    occurrenceIdentityHash: h("synthetic:withdrawal-occurrence"),
    suppliedPrivateObjectCommitmentHash: h("synthetic:withdrawal-object"),
    caseScopedParticipantAlias: descendantSource.bindingContext.caseScopedParticipantAlias,
    reviewPacketHash: descendantSource.derived.privateLedgerBindings.reviewPacketHash,
    reconstructionHash: descendantSource.bindingContext.reconstructionHash,
    kind: "WITHDRAWAL",
    respondsToOccurrenceIdentityHash:
      descendantSource.bindingContext.responseOccurrenceIdentityHash,
    challengeNonceCommitmentHash:
      descendantSource.bindingContext.challengeNonceCommitmentHash,
    responseVerdict: null,
    sourceChannelContinuityCommitmentHash: h("synthetic:withdrawal-channel"),
    directParticipationLinkCommitmentHash: h("synthetic:withdrawal-participation"),
    materialDelta: null,
    materialCorrectionCommitmentHash: null,
  });
  const ledger = createAutonomousWorkOrderDisputeReviewLedger(
    ledgerInput(descendantSource, rows, 1, genesis.fixture.ledger), {
      predecessor: genesis.fixture.ledger,
    });
  return { ...descendantSource, ledger };
}

function structuralInput(bundle) {
  return {
    ledger: bundle.fixture.ledger,
    ledgerPredecessor: null,
    expectedLedgerHash: bundle.fixture.ledger.ledgerHash,
    expectedReceiptHash: bundle.published.receiptHash,
    expectedNetworkProjectionHash:
      bundle.fixture.derived.networkProjection.projectionHash,
    predecessorBundleDirectory: null,
    expectedPredecessorReceiptHash: null,
  };
}

function resealPrivateReceipt(bundle, mutate) {
  const receiptPath = path.join(bundle.output,
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES.receipt);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  mutate(receipt);
  const { receiptHash: ignored, ...body } = receipt;
  receipt.receiptHash = domainHash(
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_SCHEMAS.privateReceipt,
    body);
  writeFileSync(receiptPath, `${canonicalizeStrict(receipt)}\n`, { mode: 0o600 });
  return receipt.receiptHash;
}

test("synthetic derivation exposes only role lengths and framed domain commitments", () => {
  const left = derivation(0, {
    ...syntheticBytes(),
    historicalCaseManifest: Buffer.from("ab"),
    externalChannelInvitation: Buffer.from("c"),
  });
  const right = derivation(0, {
    ...syntheticBytes(),
    historicalCaseManifest: Buffer.from("a"),
    externalChannelInvitation: Buffer.from("bc"),
  });
  const projection = left.derived.networkProjection;
  assert.equal(projection.sourceRoles.length,
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_ROLES.length);
  assert.equal(projection.rawBytesIncluded, false);
  assert.equal(projection.exactFileHashesIncluded, false);
  assert.equal(projection.filenamesOrPathsIncluded, false);
  assert.equal(projection.piiAccountOrKeyIdentifiersIncluded, false);
  assert.notEqual(projection.privateBundleRootCommitment,
    right.derived.networkProjection.privateBundleRootCommitment,
  "length framing separates ambiguous raw part concatenations");
  const networkBytes = canonicalizeStrict(projection);
  assert.doesNotMatch(networkBytes, /person@example|invalid\.example|fileName|exactSha256/u);
  assert.throws(() => derivation(0, syntheticBytes(), Buffer.alloc(32)),
    /ALL_ZERO_COMMITMENT_KEY_FORBIDDEN/u);
});

test("publishes and stably rereads one exact synthetic private ten-file bundle", () => {
  const bundle = publishGenesis("stable");
  assert.equal(bundle.published.ok, true);
  assert.equal(bundle.published.stage1ExternalFactGateSatisfied, false);
  assert.equal(lstatSync(bundle.output).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(bundle.output).sort(), Object.values(
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES).sort());
  for (const fileName of Object.values(
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES)) {
    const stat = lstatSync(path.join(bundle.output, fileName));
    assert.equal(stat.isFile(), true);
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(stat.nlink, 1);
  }
  const first = verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
    bundle.output, structuralInput(bundle));
  const second = verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
    bundle.output, structuralInput(bundle));
  assert.deepEqual(second, first);
  assert.equal(first.ok, true);
  assert.equal(first.sourceRoleByteReplayVerified, true);
  assert.equal(first.occurrenceCensusPreserved, true);
  assert.equal(first.objectHashEqualityCanReduceOccurrenceDenominator, false);
  assert.equal(first.externalChannelContinuityReplayed, false);
  assert.equal(first.sourceLinkedDirectParticipationClaimReplayed, false);
  assert.equal(first.exactMaterialDeltaReplayed, false);
  assert.equal(first.rightsClearanceEstablished, false);
  assert.equal(first.stage1ExternalFactGateSatisfied, false);
  assert.deepEqual(first.boundary,
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_BUNDLE_BOUNDARY);
});

test("a self-resealed receipt cannot rewrite ledger semantics or its file manifest", () => {
  const attacks = [
    (receipt) => { receipt.recordedAt = "2026-08-31T00:01:09.000Z"; },
    (receipt) => { receipt.ledgerBinding.responseVerdict = "NO_WOULD_NOT_HAVE_CHANGED"; },
    (receipt) => { receipt.structurallyCurrentPositiveCandidateOnly = false; },
    (receipt) => {
      receipt.publication.files[0].domainCommitmentHash = h("forged-domain-commitment");
    },
  ];
  for (let index = 0; index < attacks.length; index += 1) {
    const bundle = publishGenesis(`self-reseal-${index}`);
    const resealedReceiptHash = resealPrivateReceipt(bundle, attacks[index]);
    const checked = verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
      bundle.output, {
        ...structuralInput(bundle),
        expectedReceiptHash: resealedReceiptHash,
      });
    assert.equal(checked.ok, false);
    assert.equal(checked.stage1ExternalFactGateSatisfied, false);
  }
});

test("filesystem type checks do not trust mutable Stats prototype methods", () => {
  const bundle = publishGenesis("stats-prototype");
  const prototype = Object.getPrototypeOf(lstatSync(bundle.output, { bigint: true }));
  const methodNames = ["isDirectory", "isFile", "isSymbolicLink"];
  const ownDescriptors = Object.fromEntries(methodNames.map((name) => [
    name, Object.getOwnPropertyDescriptor(prototype, name),
  ]));
  let checked;
  try {
    prototype.isDirectory = () => false;
    prototype.isFile = () => false;
    prototype.isSymbolicLink = () => true;
    checked = verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
      bundle.output, structuralInput(bundle));
  } finally {
    for (const name of methodNames) {
      if (ownDescriptors[name] === undefined) delete prototype[name];
      else Object.defineProperty(prototype, name, ownDescriptors[name]);
    }
  }
  assert.equal(checked.ok, true);
  assert.equal(checked.stage1ExternalFactGateSatisfied, false);
});

test("trusted descendant remains NOT_INTEGRATED despite complete synthetic bytes and pins", () => {
  const bundle = publishGenesis("trusted-hold");
  const checked
    = verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleAgainstTrustedSources(
      bundle.output, {
        ...structuralInput(bundle),
        externalProvenancePins: {
          historicalCaseExternalRevisionPinHash: h("caller:historical-pin"),
          externalChannelRelationshipProvenancePinHash: h("caller:channel-pin"),
          externalLifecycleHeadPinHash: h("caller:lifecycle-pin"),
        },
      });
  assert.equal(checked.ok, false);
  assert.equal(checked.structuralPrivateSourceBundleVerified, true);
  assert.equal(checked.privateSourceRoleBytesReplayed, true);
  assert.equal(checked.callerSuppliedExternalProvenancePinsPresent, true);
  assert.equal(checked.independentExternalProvenancePinsVerified, false);
  assert.equal(checked.actualPastCaseSourceReplayVerified, false);
  assert.equal(checked.externalAccountOrChannelContinuityVerified, false);
  assert.equal(checked.directHistoricalParticipationVerified, false);
  assert.equal(checked.stage1ExternalFactGateSatisfied, false);
  assert.equal(checked.result,
    "TRUSTED_EXTERNAL_PROVENANCE_REPLAY_NOT_INTEGRATED");

  const callback = verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleAgainstTrustedSources(
    bundle.output, { ...structuralInput(bundle), callback: () => true,
      externalProvenancePins: {
        historicalCaseExternalRevisionPinHash: h("a"),
        externalChannelRelationshipProvenancePinHash: h("b"),
        externalLifecycleHeadPinHash: h("c"),
      } });
  assert.equal(callback.ok, false);
  assert.equal(callback.structuralPrivateSourceBundleVerified, false);
  assert.equal(callback.stage1ExternalFactGateSatisfied, false);
});

test("no-clobber, exact allowlist, private modes, hardlink and role pins fail closed", () => {
  const bundle = publishGenesis("attacks");
  assert.throws(() => publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle({
    ledger: bundle.fixture.ledger,
    ledgerPredecessor: null,
    bindingContext: bundle.fixture.bindingContext,
    sourceBytes: bundle.fixture.sourceBytes,
    commitmentKey: bundle.fixture.commitmentKey,
    lifecycleDisposition: "CURRENT",
  }, publicationOptions(bundle.root, bundle.output, bundle.fixture)),
  /OUTPUT_DIRECTORY_EXISTS/u);

  writeFileSync(path.join(bundle.output, "extra.json"), "{}\n", { mode: 0o600 });
  assert.equal(verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
    bundle.output, structuralInput(bundle)).ok, false);

  const hardlinked = publishGenesis("hardlink");
  const rawFile = path.join(hardlinked.output,
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES.externalChannelResponse);
  linkSync(rawFile, path.join(hardlinked.root, "second-link"));
  assert.equal(verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
    hardlinked.output, structuralInput(hardlinked)).ok, false);

  const symlinked = publishGenesis("symlink");
  const privacyFile = path.join(symlinked.output,
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SOURCE_FILES.privacyEvidence);
  const victim = path.join(symlinked.root, "victim");
  writeFileSync(victim, "victim", { mode: 0o600 });
  unlinkSync(privacyFile);
  symlinkSync(victim, privacyFile);
  assert.equal(verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
    symlinked.output, structuralInput(symlinked)).ok, false);

  const swappedBytes = {
    ...bundle.fixture.sourceBytes,
    historicalCaseManifest: bundle.fixture.sourceBytes.externalChannelResponse,
    externalChannelResponse: bundle.fixture.sourceBytes.historicalCaseManifest,
  };
  const wrongOutput = opaqueDirectory(bundle.root, "wrong-role");
  assert.throws(() => publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle({
    ledger: bundle.fixture.ledger,
    ledgerPredecessor: null,
    bindingContext: bundle.fixture.bindingContext,
    sourceBytes: swappedBytes,
    commitmentKey: bundle.fixture.commitmentKey,
    lifecycleDisposition: "CURRENT",
  }, publicationOptions(bundle.root, wrongOutput, bundle.fixture)),
  /PROJECTION_OR_ROOT_PIN_MISMATCH/u);
  assert.equal(lstatSync(bundle.root).isDirectory(), true);
});

test("a descendant rejects a self-resealed predecessor receipt with a forged ledger crosswalk", () => {
  const genesis = publishGenesis("forged-prior-genesis");
  const descendant = syntheticWithdrawalDescendant(genesis);
  const forgedPriorReceiptHash = resealPrivateReceipt(genesis, (receipt) => {
    receipt.ledgerBinding.ledgerHash = h("forged-predecessor-ledger");
  });
  assert.throws(() => publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle({
    ledger: descendant.ledger,
    ledgerPredecessor: genesis.fixture.ledger,
    bindingContext: descendant.bindingContext,
    sourceBytes: descendant.sourceBytes,
    commitmentKey: descendant.commitmentKey,
    lifecycleDisposition: "WITHDRAWN",
  }, publicationOptions(genesis.root,
    opaqueDirectory(genesis.root, "forged-prior-descendant"), descendant,
    genesis.output, forgedPriorReceiptHash)),
  /PREDECESSOR|SEMANTIC|LEDGER/u);
});

test("append-only withdrawal bundle cannot resurrect the response or erase its census", () => {
  const genesis = publishGenesis("withdraw-genesis");
  const descendant = syntheticWithdrawalDescendant(genesis);
  const output = opaqueDirectory(genesis.root, "withdraw-descendant");
  const published = publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle({
    ledger: descendant.ledger,
    ledgerPredecessor: genesis.fixture.ledger,
    bindingContext: descendant.bindingContext,
    sourceBytes: descendant.sourceBytes,
    commitmentKey: descendant.commitmentKey,
    lifecycleDisposition: "WITHDRAWN",
  }, publicationOptions(genesis.root, output, descendant, genesis.output,
    genesis.published.receiptHash));
  assert.equal(published.lifecycleDisposition, "WITHDRAWN");
  assert.equal(descendant.ledger.reviewOccurrenceCensus.reviewOccurrenceCount, 3);
  assert.equal(descendant.ledger.reviewOccurrenceCensus
    .countsByVerdict.YES_WOULD_HAVE_CHANGED, 1);
  const checked = verifyAutonomousWorkOrderDisputeReviewPrivateSourceBundleStructure(
    output, {
      ledger: descendant.ledger,
      ledgerPredecessor: genesis.fixture.ledger,
      expectedLedgerHash: descendant.ledger.ledgerHash,
      expectedReceiptHash: published.receiptHash,
      expectedNetworkProjectionHash:
        descendant.derived.networkProjection.projectionHash,
      predecessorBundleDirectory: genesis.output,
      expectedPredecessorReceiptHash: genesis.published.receiptHash,
    });
  assert.equal(checked.ok, true);
  assert.equal(checked.predecessorByteBundleCrosswalked, true);
  assert.equal(checked.lifecycleDisposition, "WITHDRAWN");
  assert.equal(checked.stage1ExternalFactGateSatisfied, false);

  assert.throws(() => publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle({
    ledger: descendant.ledger,
    ledgerPredecessor: genesis.fixture.ledger,
    bindingContext: descendant.bindingContext,
    sourceBytes: descendant.sourceBytes,
    commitmentKey: descendant.commitmentKey,
    lifecycleDisposition: "CURRENT",
  }, publicationOptions(genesis.root,
    opaqueDirectory(genesis.root, "resurrection"), descendant, genesis.output,
    genesis.published.receiptHash)), /CANNOT_BE_RESURRECTED/u);

  assert.throws(() => publishAutonomousWorkOrderDisputeReviewPrivateSourceBundle({
    ledger: descendant.ledger,
    ledgerPredecessor: genesis.fixture.ledger,
    bindingContext: descendant.bindingContext,
    sourceBytes: descendant.sourceBytes,
    commitmentKey: descendant.commitmentKey,
    lifecycleDisposition: "PURGED",
  }, publicationOptions(genesis.root,
    opaqueDirectory(genesis.root, "purged-raw-forbidden"), descendant,
    genesis.output, genesis.published.receiptHash)),
  /PURGED_REQUIRES_RAW_UNAVAILABLE_TOMBSTONE/u);
});

test("captured hash and HMAC methods keep synthetic commitments stable", () => {
  const fixture = derivation();
  const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
  const hmacPrototype = Object.getPrototypeOf(createHmac("sha256", Buffer.alloc(32, 1)));
  const hashUpdate = hashPrototype.update;
  const hashDigest = hashPrototype.digest;
  const hmacUpdate = hmacPrototype.update;
  const hmacDigest = hmacPrototype.digest;
  const arrayPush = Array.prototype.push;
  const arrayMap = Array.prototype.map;
  const arraySort = Array.prototype.sort;
  let after;
  try {
    hashPrototype.update = function poisonedHashUpdate() {
      throw new Error("POISONED_HASH_UPDATE");
    };
    hashPrototype.digest = function poisonedHashDigest() {
      throw new Error("POISONED_HASH_DIGEST");
    };
    hmacPrototype.update = function poisonedHmacUpdate() {
      throw new Error("POISONED_HMAC_UPDATE");
    };
    hmacPrototype.digest = function poisonedHmacDigest() {
      throw new Error("POISONED_HMAC_DIGEST");
    };
    Array.prototype.push = function poisonedPush() {
      throw new Error("POISONED_ARRAY_PUSH");
    };
    Array.prototype.map = function poisonedMap() {
      throw new Error("POISONED_ARRAY_MAP");
    };
    Array.prototype.sort = function poisonedSort() {
      throw new Error("POISONED_ARRAY_SORT");
    };
    after = deriveAutonomousWorkOrderDisputeReviewPrivateSourceProjection({
      bindingContext: fixture.bindingContext,
      sourceBytes: fixture.sourceBytes,
      commitmentKey: fixture.commitmentKey,
    });
  } finally {
    hashPrototype.update = hashUpdate;
    hashPrototype.digest = hashDigest;
    hmacPrototype.update = hmacUpdate;
    hmacPrototype.digest = hmacDigest;
    Array.prototype.push = arrayPush;
    Array.prototype.map = arrayMap;
    Array.prototype.sort = arraySort;
  }
  assert.deepEqual(after, fixture.derived);
});
