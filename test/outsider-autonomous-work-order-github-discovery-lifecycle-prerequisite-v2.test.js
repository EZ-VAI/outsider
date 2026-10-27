import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_SCHEMA,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_VERIFICATION_SCHEMA,
  createAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2,
  parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2,
  verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2,
} from "../src/outsider-autonomous-work-order-github-discovery-lifecycle-prerequisite-v2.js";

const AUDITED_AT = "2026-09-01T01:00:59.364Z";

function createReceiptBytes() {
  return createAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2({
    auditedAtLocalClock: AUDITED_AT,
  });
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

test("v2 is a pure HOLD-only protocol receipt and cannot lift a kill gate", () => {
  const boundary
    = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_BOUNDARY;
  assert.equal(boundary.pureDataContractOnly, true);
  assert.equal(boundary.filesystemCapabilityPresent, false);
  assert.equal(boundary.networkCapabilityPresent, false);
  assert.equal(boundary.processExecutionCapabilityPresent, false);
  assert.equal(boundary.deletionCapabilityPresent, false);
  assert.equal(boundary.readsRawBytes, false);
  assert.equal(boundary.readsPaths, false);
  assert.equal(boundary.writesLifecycleIntent, false);
  assert.equal(boundary.writesLifecycleReceipt, false);
  assert.equal(boundary.deletesRawBytes, false);
  assert.equal(boundary.externalLifecycleTombstoneEstablished, false);
  assert.equal(boundary.descendantCascadePerformed, false);
  assert.equal(boundary.crashRecoveryPerformed, false);
  assert.equal(boundary.secureEraseEstablished, false);
  assert.equal(boundary.rightsClearanceEstablished, false);
  assert.equal(boundary.privacyClearanceEstablished, false);
  assert.equal(boundary.liveKillGateRemainsRequired, true);
  assert.equal(boundary.decisionState, "HOLD");
  assert.equal(boundary.authority, "NONE");
});
test("canonical receipt binds the exact audited parent bytes", () => {
  const first = createReceiptBytes();
  const second = createReceiptBytes();
  assert.deepEqual(first, second);
  const receipt
    = parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(first);
  assert.equal(receipt.schema,
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_SCHEMA);
  assert.equal(receipt.protocolVersion, 2);
  assert.equal(receipt.protocolState, "AUDITED_DRAFT_NOT_INTEGRATED");
  assert.equal(receipt.auditedAtLocalClock, AUDITED_AT);
  assert.equal(receipt.localClockIsIndependentTime, false);
  assert.deepEqual(receipt.parentBindings, [
    {
      role: "GITHUB_DISCOVERY_SNAPSHOT_V1",
      file: "src/outsider-autonomous-work-order-github-discovery-snapshot.js",
      bytes: 117_472,
      sha256:
        "sha256:b6253409183d5f3b7d81ae4986ca5c60c1a58546227f1793cbe1cc718ae8a6f6",
    },
    {
      role: "GITHUB_DISCOVERY_ACQUISITION_DRAFT_V1",
      file: "scripts/acquire-autonomous-work-order-github-discovery-snapshot.mjs",
      bytes: 49_241,
      sha256:
        "sha256:eaa74e2209e848415d34200ae538d81cb975a57db1c9838675ec694af7283167",
    },
    {
      role: "GITHUB_DISCOVERY_PURGE_DRAFT_V1",
      file: "scripts/purge-autonomous-work-order-github-discovery-snapshot.mjs",
      bytes: 54_004,
      sha256:
        "sha256:c957204b28bdebb699142ce51cd72cd41d8484d7842076e8005dd30522f3e5c9",
    },
    {
      role: "DISPUTE_REVIEW_SOURCE_BUNDLE_V1",
      file: "src/outsider-autonomous-work-order-dispute-review-source-bundle.js",
      bytes: 74_504,
      sha256:
        "sha256:2d8b97ad59513c1f5632358197ad1c85311299f4da307794149b57f3bd0134f0",
    },
  ]);
});

test("fixed ignored roots and an external tombstone-before-raw protocol are exact",
  () => {
    const receipt
      = parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
        createReceiptBytes(),
      );
    assert.deepEqual(receipt.fixedRoots, {
      workspaceRelativeIgnoredRoot: "artifacts",
      acquisitionRoot: "artifacts/private-source-captures",
      externalLifecycleRoot: "artifacts/private-source-captures/lifecycle",
      publicationDescendantRoot:
        "artifacts/private-source-captures/publication-descendants",
      exactLiteralRootsOnly: true,
      callerRootOverrideAllowed: false,
      environmentRootOverrideAllowed: false,
      rootFilesystemPathAllowed: false,
      homeDirectoryAliasAllowed: false,
      symlinkRootAllowed: false,
      gitignoreMustContainExactArtifactsEntry: true,
      gitignoreNegationBelowArtifactsAllowed: false,
    });
    const tombstone = receipt.externalTombstoneBeforeRawRead;
    assert.deepEqual(tombstone.captureLifecycleDirectoryComponents,
      ["lifecycle", "<captureDirectoryId>"]);
    assert.equal(tombstone.purgeIntentFile, "purge-intent-v2.json");
    assert.equal(tombstone.intentNoClobber, true);
    assert.equal(tombstone.independentLifecycleRegistryHeadRequired, true);
    assert.equal(
      tombstone.registryMissingUnavailableRollbackOrUnknownDecision,
      "HOLD",
    );
    assert.equal(tombstone.ownerRollbackResistanceEstablished, false);
    assert.equal(tombstone.forkExclusionEstablished, false);
    assert.equal(tombstone.durableExternalHeadEstablished, false);
    assert.equal(tombstone.independentExternalWitnessEstablished, false);
    assert.equal(tombstone.intentMustBeDurableBeforeCaptureDirectoryStat, true);
    assert.equal(tombstone.intentMustBeDurableBeforeRawPathStat, true);
    assert.equal(tombstone.intentMustBeDurableBeforeRawOpen, true);
    assert.equal(tombstone.intentMustBeDurableBeforeRawReadOrBufferCopy, true);
    assert.equal(tombstone.tombstoneCheckedAtEveryRawReaderEntry, true);
    assert.equal(
      tombstone.tombstoneCheckedImmediatelyBeforeEveryRawPathStatOpenReadOrCopy,
      true,
    );
    assert.equal(tombstone.disputeReviewSourceBundlePublisherBlockedByIntent,
      true);
    assert.equal(tombstone.purgeWorkerIsOnlyRawReaderAllowedAfterIntent, true);
  });

test("cascade is explicit and finite across acquisition and publication descendants",
  () => {
    const receipt
      = parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
        createReceiptBytes(),
      );
    const cascade = receipt.descendantCascade;
    assert.equal(cascade.acquisitionDescendantClass,
      "PRIVATE_GITHUB_DISCOVERY_ACQUISITION_DIRECTORY");
    assert.deepEqual(cascade.publicationDescendantClasses, [
      "PRIVATE_GITHUB_DISCOVERY_SNAPSHOT_BUNDLE",
      "NETWORK_SAFE_GITHUB_DISCOVERY_PROJECTION",
      "PRIVATE_DISPUTE_REVIEW_SOURCE_BUNDLE",
    ]);
    assert.equal(cascade.exactFiniteDescendantCensusRequiredBeforeIntent, true);
    assert.equal(cascade.globalDescendantCensusCompletenessMustBeProven, true);
    assert.equal(cascade.callerClaimIsNotDescendantCensusProof, true);
    assert.equal(cascade.directoryScanIsNotDescendantCensusProof, true);
    assert.equal(cascade.globDiscoveryAllowed, false);
    assert.equal(cascade.recursiveTraversalAllowed, false);
    assert.equal(cascade.intentMustBindEveryDescendantIdAndReceiptHash, true);
    assert.equal(
      cascade.allDescendantTombstonesDurableBeforeAnyRawPathStatOrRead,
      true,
    );
    assert.equal(cascade.missingOrUnprovenDescendantCensusDecision, "HOLD");
  });

test("crash resume never restores raw permission and deletion is exact-only", () => {
  const receipt
    = parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
      createReceiptBytes(),
    );
  assert.deepEqual(receipt.crashResume.stateSequence, [
    "NO_INTENT",
    "INTENT_DURABLE_RAW_FORBIDDEN",
    "EXACT_RAW_UNLINKS_IN_PROGRESS",
    "RAW_ABSENCE_VERIFIED",
    "DESCENDANT_TOMBSTONES_VERIFIED",
    "RECEIPT_DURABLE",
  ]);
  assert.equal(receipt.crashResume.intentImmutableNoOverwrite, true);
  assert.equal(receipt.crashResume.alreadyAbsentTargetAcceptedOnlyWhenBoundByDurableIntent,
    true);
  assert.equal(receipt.crashResume.remainingTargetSetDerivedFromIntentRowsOnly,
    true);
  assert.equal(receipt.crashResume.directoryFsyncAfterEveryUnlink, true);
  assert.equal(receipt.crashResume.ambiguousIntentWriteRequiresRawForbiddenRecovery,
    true);
  assert.equal(receipt.crashResume.incompleteIntentOrReceiptNeverRestoresRawReadPermission,
    true);

  const deletion = receipt.deletionBoundary;
  assert.deepEqual(deletion.exactRawFileAllowlist, [
    { ordinal: 1, role: "ISSUE_BEFORE", file: "issue-before.json" },
    { ordinal: 2, role: "COMMENTS_SCAN_A", file: "comments-scan-a.json" },
    { ordinal: 3, role: "ISSUE_MID", file: "issue-mid.json" },
    { ordinal: 4, role: "COMMENTS_SCAN_B", file: "comments-scan-b.json" },
    { ordinal: 5, role: "ISSUE_AFTER", file: "issue-after.json" },
  ]);
  assert.equal(deletion.callerAbsoluteTargetAllowed, false);
  assert.equal(deletion.callerRelativeTargetAllowed, false);
  assert.equal(deletion.globAllowed, false);
  assert.equal(deletion.wildcardAllowed, false);
  assert.equal(deletion.recursiveDeleteAllowed, false);
  assert.equal(deletion.captureDirectoryDeleteAllowed, false);
  assert.equal(deletion.symlinkTargetAllowed, false);
  assert.equal(deletion.hardlinkTargetAllowed, false);
  assert.equal(deletion.exactBytesAndSha256MustMatchIntentBeforeUnlink, true);
  assert.equal(deletion.secureEraseEstablished, false);
  assert.equal(deletion.physicalMediaErasureEstablished, false);
  assert.equal(deletion.remoteCopyDeletionEstablished, false);
});

test("rights and privacy remain independent blockers", () => {
  const receipt
    = parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
      createReceiptBytes(),
    );
  const boundary = receipt.rightsPrivacyBoundary;
  assert.equal(boundary.lifecycleProtocolIsRightsAdjudication, false);
  assert.equal(boundary.lifecycleProtocolIsPrivacyAdjudication, false);
  assert.equal(boundary.sourceSpecificRightsClearanceEstablished, false);
  assert.equal(boundary.sourceSpecificPrivacyClearanceEstablished, false);
  assert.equal(boundary.redistributionPermissionEstablished, false);
  assert.equal(boundary.publicationPermissionEstablished, false);
  assert.equal(boundary.retentionPermissionEstablished, false);
  assert.equal(boundary.trainingPermissionEstablished, false);
  assert.equal(boundary.purgeReceiptCanProveRemoteDeletion, false);
  assert.equal(boundary.purgeReceiptCanProveSecureErase, false);
  assert.equal(boundary.ledgerRecordedOccurrenceNonResurrectionEstablished,
    false);
  assert.equal(boundary.futureDescendantMustNotRestoreRawOrPublicationEligibility,
    true);
});

test("structural verification is not lifecycle integration or Stage 1 evidence", () => {
  const verification
    = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
      createReceiptBytes(),
    );
  assert.equal(verification.schema,
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_VERIFICATION_SCHEMA);
  assert.equal(verification.ok, true);
  assert.equal(verification.structuralProtocolVerified, true);
  assert.equal(verification.exactParentByteReferencesVerified, false);
  assert.equal(
    verification.exactParentByteReferencesDeclaredAndStructurallyMatched,
    true,
  );
  assert.equal(verification.currentParentFilesRehashedByContract, false);
  assert.equal(verification.currentGitignoreBytesVerifiedByContract, false);
  assert.equal(verification.fixedIgnoredRootsSpecified, true);
  assert.equal(verification.externalTombstoneBeforeRawReadSpecified, true);
  assert.equal(verification.acquisitionAndPublicationDescendantCascadeSpecified,
    true);
  assert.equal(verification.crashResumableIntentSpecified, true);
  assert.equal(verification.exactNonRecursiveDeletionPlanSpecified, true);
  assert.equal(verification.secureEraseEstablished, false);
  assert.equal(verification.lifecycleIntegrated, false);
  assert.equal(verification.eligibleToLiftExistingKillGate, false);
  assert.equal(verification.stage1EngineeringGateSatisfied, false);
  assert.equal(verification.stage1ExternalFactGateSatisfied, false);
  assert.equal(verification.decisionState, "HOLD");
  assert.equal(verification.authority, "NONE");
  const receipt
    = parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
      createReceiptBytes(),
    );
  assert.equal(receipt.integrationGate.provenAuthorityUnits, 0);
  assert.equal(receipt.integrationGate.enabledConsequenceUnits, 0);
  assert.equal(receipt.integrationGate.consequenceReach, "NONE");
  assert.equal(receipt.integrationGate.exactParentByteReferencesDeclared, true);
  assert.equal(receipt.integrationGate.currentParentFilesRehashedByContract,
    false);
});

test("tampering and non-canonical receipts fail closed without authority", () => {
  const receipt = JSON.parse(createReceiptBytes().toString("utf8"));
  receipt.integrationGate.eligibleToLiftExistingKillGate = true;
  let verification
    = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
      canonicalBytes(receipt),
    );
  assert.equal(verification.ok, false);
  assert.match(verification.error, /INTEGRATION_GATE_INVALID/u);
  assert.equal(verification.lifecycleIntegrated, false);
  assert.equal(verification.eligibleToLiftExistingKillGate, false);
  assert.equal(verification.stage1EngineeringGateSatisfied, false);
  assert.equal(verification.authority, "NONE");

  const deletionTamper = JSON.parse(createReceiptBytes().toString("utf8"));
  deletionTamper.deletionBoundary.recursiveDeleteAllowed = true;
  verification = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
    canonicalBytes(deletionTamper),
  );
  assert.equal(verification.ok, false);
  assert.match(verification.error, /DELETION_BOUNDARY_INVALID/u);

  const nonCanonical = Buffer.from(
    createReceiptBytes().toString("utf8").replace("{", "{ "),
    "utf8",
  );
  verification = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
    nonCanonical,
  );
  assert.equal(verification.ok, false);
  assert.match(verification.error, /RECEIPT_NOT_CANONICAL/u);
});

test("hostile input shape is rejected before receipt creation", () => {
  assert.throws(() =>
    createAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2({
      auditedAtLocalClock: AUDITED_AT,
      liftKillGate: true,
    }), /INPUT_FIELDS_INVALID/u);
  const accessor = {};
  Object.defineProperty(accessor, "auditedAtLocalClock", {
    enumerable: true,
    get() { return AUDITED_AT; },
  });
  assert.throws(() =>
    createAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(accessor),
  /INPUT_FIELDS_INVALID/u);
  assert.throws(() =>
    createAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2({
      auditedAtLocalClock: "2026-02-31T00:00:00.000Z",
    }), /AUDITED_AT_INVALID/u);
});

test("production v2 source contains no filesystem, transport, process, or delete API",
  () => {
    const source = readFileSync(new URL(
      "../src/outsider-autonomous-work-order-github-discovery-lifecycle-prerequisite-v2.js",
      import.meta.url,
    ), "utf8");
    assert.doesNotMatch(source,
      /from\s+["']node:(?:fs|fs\/promises|http|https|net|tls|child_process|worker_threads)["']/u);
    assert.doesNotMatch(source,
      /\b(?:fetch|request|openSync|readFileSync|writeFileSync|mkdirSync|readdirSync|lstatSync|statSync|realpathSync|unlinkSync|rmdirSync|rmSync|spawn|exec|execFile)\s*\(/u);
  });

test("own length accessors and Buffer subclass shapes are rejected unopened", () => {
  const canonical = createReceiptBytes();
  const accessor = Buffer.from(canonical);
  let accessorCalls = 0;
  Object.defineProperty(accessor, "length", {
    configurable: true,
    enumerable: false,
    get() {
      accessorCalls += 1;
      throw new Error("caller length accessor must remain unreachable");
    },
  });
  let verification
    = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(accessor);
  assert.equal(accessorCalls, 0);
  assert.equal(verification.ok, false);
  assert.match(verification.error,
    /^AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_[A-Z0-9_]+$/u);
  assert.match(verification.error, /RECEIPT_BUFFER_SHAPE_INVALID$/u);
  assert.equal(verification.lifecycleIntegrated, false);
  assert.equal(verification.eligibleToLiftExistingKillGate, false);

  const subclass = Buffer.from(canonical);
  const subclassPrototype = Object.create(Buffer.prototype);
  Object.setPrototypeOf(subclass, subclassPrototype);
  verification
    = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(subclass);
  assert.equal(verification.ok, false);
  assert.match(verification.error, /RECEIPT_BUFFER_SHAPE_INVALID$/u);
  assert.equal(verification.lifecycleIntegrated, false);
  assert.equal(verification.eligibleToLiftExistingKillGate, false);
});

test("oversized Buffer fails the typed size gate before receipt traversal", () => {
  const oversized = Buffer.alloc((64 * 1024) + 1, 0x20);
  const verification
    = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(oversized);
  assert.equal(verification.ok, false);
  assert.match(verification.error,
    /^AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_RECEIPT_BYTES_INVALID$/u);
  assert.equal(verification.structuralProtocolVerified, false);
  assert.equal(verification.lifecycleIntegrated, false);
  assert.equal(verification.eligibleToLiftExistingKillGate, false);
  assert.equal(verification.decisionState, "HOLD");
  assert.equal(verification.authority, "NONE");
});

test("post-import Error prototype accessors cannot launder failure text", () => {
  const originalMessage = Object.getOwnPropertyDescriptor(
    Error.prototype,
    "message",
  );
  try {
    Object.defineProperty(Error.prototype, "message", {
      configurable: true,
      get() { throw new Error("poisoned inherited message"); },
    });
    const verification
      = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
        Buffer.from("{}\n", "utf8"),
      );
    assert.equal(verification.ok, false);
    assert.match(verification.error,
      /^AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_PREREQUISITE_V2_[A-Z0-9_]+$/u);
    assert.equal(verification.lifecycleIntegrated, false);
    assert.equal(verification.authority, "NONE");
  } finally {
    if (originalMessage) {
      Object.defineProperty(Error.prototype, "message", originalMessage);
    } else {
      delete Error.prototype.message;
    }
  }
});

test("post-import Hash and TextDecoder prototype poisoning cannot change replay",
  () => {
    const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
    const originalUpdate = hashPrototype.update;
    const originalDigest = hashPrototype.digest;
    const originalDecode = TextDecoder.prototype.decode;
    try {
      hashPrototype.update = () => { throw new Error("poisoned hash update"); };
      hashPrototype.digest = () => { throw new Error("poisoned hash digest"); };
      TextDecoder.prototype.decode = () => { throw new Error("poisoned decode"); };
      const receiptBytes = createReceiptBytes();
      const verification
        = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
          receiptBytes,
        );
      assert.equal(verification.ok, true);
      assert.equal(verification.lifecycleIntegrated, false);
      assert.equal(verification.eligibleToLiftExistingKillGate, false);
    } finally {
      hashPrototype.update = originalUpdate;
      hashPrototype.digest = originalDigest;
      TextDecoder.prototype.decode = originalDecode;
    }
  });
