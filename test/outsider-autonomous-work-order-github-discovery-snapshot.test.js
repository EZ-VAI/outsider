import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  unlinkSync, rmdirSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { main as acquireGithubDiscoverySnapshot }
  from "../scripts/acquire-autonomous-work-order-github-discovery-snapshot.mjs";
import { main as purgeGithubDiscoverySnapshot }
  from "../scripts/purge-autonomous-work-order-github-discovery-snapshot.mjs";

import {
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH,
  createAutonomousWorkOrderGithubDiscoveryPreflightReview,
  createAutonomousWorkOrderGithubDiscoveryProjectionKey,
  deriveAutonomousWorkOrderGithubDiscoverySnapshot,
  loadAutonomousWorkOrderGithubDiscoveryAcquisitionDirectory,
  parseAutonomousWorkOrderGithubDiscoveryHeadersManifest,
  parseAutonomousWorkOrderGithubDiscoveryPreflightReview,
  publishAutonomousWorkOrderGithubDiscoveryNetworkSafeProjectionFromAcquisitionDirectory,
  publishAutonomousWorkOrderGithubDiscoverySnapshot,
  publishAutonomousWorkOrderGithubDiscoverySnapshotFromAcquisitionDirectory,
  verifyAutonomousWorkOrderGithubDiscoverySnapshotAgainstTrustedFacts,
  verifyAutonomousWorkOrderGithubDiscoverySnapshotBundle,
} from "../src/outsider-autonomous-work-order-github-discovery-snapshot.js";

const ROLES = ["issueBefore", "commentsA", "issueMid", "commentsB", "issueAfter"];

const ISSUE_URL
  = "https://api.github.com/repos/anthropics/claude-code/issues/64056";
const COMMENTS_URL
  = `${ISSUE_URL}/comments?per_page=100&page=1`;

function meta(ordinal, overrides = {}) {
  const requestUrl = ordinal === 2 || ordinal === 4 ? COMMENTS_URL : ISSUE_URL;
  return {
    captureOrdinal: ordinal,
    requestMethod: "GET",
    requestUrl,
    authVisibilityProfile: "PUBLIC_ANONYMOUS_NO_CREDENTIALS",
    credentialsSent: false,
    redirectCount: 0,
    requestAccept: "application/vnd.github+json",
    requestAcceptEncoding: "identity",
    requestedApiVersion: "2026-03-10",
    responseStatus: 200,
    selectedApiVersion: "2026-03-10",
    etag: `W/"${String(ordinal).padStart(64, "0")}"`,
    lastModified: null,
    responseDate: `Tue, 01 Sep 2026 04:04:2${ordinal} GMT`,
    contentType: "application/json; charset=utf-8",
    contentEncoding: null,
    link: null,
    requestId: `SYNTHETIC-REQUEST-${ordinal}`,
    ...overrides,
  };
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function syntheticPrivatePolicyBytes({ retentionSeconds = 86_400,
  startedOffsetMs = -30_000 } = {}) {
  const localNowMs = Date.now();
  const reviewedAt = new Date(localNowMs - 60_000).toISOString();
  const validThrough = new Date(localNowMs + 86_400_000).toISOString();
  const startedAtMs = localNowMs + startedOffsetMs;
  const startedAt = new Date(startedAtMs).toISOString();
  const retentionUntil = new Date(startedAtMs + retentionSeconds * 1000)
    .toISOString();
  const preflightReviewBytes
    = createAutonomousWorkOrderGithubDiscoveryPreflightReview({
      reviewId: "awo_0123456789abcdef0123456789abcdef",
      reviewedAt,
      validThrough,
      reviewerPairwiseAlias: "reviewer_0123456789abcdef0123456789abcdef",
      reviewBasisCommitment:
        "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      retentionSeconds,
    });
  const review = parseAutonomousWorkOrderGithubDiscoveryPreflightReview(
    preflightReviewBytes);
  const acquisitionLifecycleReceiptBytes = canonicalBytes({
    schema:
      "outsider/autonomous-work-order-github-discovery-acquisition-lifecycle-receipt/v1",
    attemptId: "acq_0123456789abcdef0123456789abcdef",
    state: "INCOMPLETE",
    preflightReviewHash: review.reviewHash,
    preflightReviewFileSha256: sha256(preflightReviewBytes),
    targetProfileHash: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH,
    transportClass: "NODE_HTTPS_FIXED_PUBLIC_API",
    startedAtPublisherClock: startedAt,
    publisherClockIsIndependentTime: false,
    retentionSeconds,
    retentionUntilPublisherClock: retentionUntil,
    purgeRequired: true,
    manifestLastRequiredForTerminalInterpretation: true,
    wholeDirectoryAtomicPublicationEstablished: false,
    independentOccurrenceWitness: false,
    externalProvenanceEstablished: false,
  });
  return { preflightReviewBytes, acquisitionLifecycleReceiptBytes };
}

function syntheticInput() {
  const policy = syntheticPrivatePolicyBytes();
  return {
    captures: {
      issueBefore: {
        bytes: Buffer.alloc(
          AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.bytes, 0x41),
        meta: meta(1),
      },
      commentsA: {
        bytes: Buffer.alloc(
          AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.bytes, 0x42),
        meta: meta(2),
      },
      issueMid: {
        bytes: Buffer.alloc(
          AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.bytes, 0x41),
        meta: meta(3),
      },
      commentsB: {
        bytes: Buffer.alloc(
          AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.bytes, 0x42),
        meta: meta(4),
      },
      issueAfter: {
        bytes: Buffer.alloc(
          AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.bytes, 0x41),
        meta: meta(5),
      },
    },
    acquisitionLifecycleReceiptBytes: policy.acquisitionLifecycleReceiptBytes,
    acquisitionCaptureManifestBytes: Buffer.from("{}\n", "utf8"),
    preflightReviewBytes: policy.preflightReviewBytes,
    projectionKey: Buffer.alloc(32, 0x7a),
  };
}

test("frozen pins and boundary keep the public issue lane structural and non-authorizing",
  () => {
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS, {
      requestedAndSelectedApiVersion: "2026-03-10",
      issue: {
        bytes: 10_175,
        sha256:
          "sha256:e429691ddcf684248168c8333942b6a3d6bba74085aab669da25748ce207dbe5",
      },
      comments: {
        bytes: 16_132,
        sha256:
          "sha256:0a9515e8edf2bd829cf11ea659f7d4b260650fc6386eaeac29cde5549d0750aa",
        expectedCurrentObjectCount: 6,
      },
      bracketRawBytes: 62_789,
      captureCount: 5,
    });
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .offlineAdapterPerformsNetworkIo, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .callerSlotRequestedVersionMustEqualSelectedVersion, true);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .crossVersionNormalizationAllowed, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .currentSnapshotProvesHistoricalCompleteness, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .externalHttpResponseOccurrenceCountEstablished, 0);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .appendOnlyLineageEstablished, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .sourceEntryState, "PENDING_ACQUISITION");
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .rawRetentionLifecycleEnforcementIntegrated, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .currentTimeCheckedBeforeRawRead, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .durablePurgeQueueIntegrated, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .rawReadRejectedBeforePathStatOrBufferCopy, true);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .rawAcquisitionLoaderEnabled, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .rawDescendantPublisherEnabled, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .trustedExternalFactEstablished, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .stage1ExternalFactGateSatisfied, false);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY.authority, "NONE");
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY.trainingRows, 0);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_BOUNDARY
        .causalExperienceUnits, 0);
    assert.equal(JSON.stringify(AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_FILES)
      .includes("64056"), false);
  });

test("canonical operator policy review is bounded but proves no reviewer authority or external time",
  () => {
    const bytes = createAutonomousWorkOrderGithubDiscoveryPreflightReview({
      reviewId: "awo_0123456789abcdef0123456789abcdef",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      validThrough: "2026-09-02T00:00:00.000Z",
      reviewerPairwiseAlias: "reviewer_0123456789abcdef0123456789abcdef",
      reviewBasisCommitment:
        "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      retentionSeconds: 86_400,
    });
    const review = parseAutonomousWorkOrderGithubDiscoveryPreflightReview(bytes);
    assert.equal(review.acquisitionScope.targetProfileHash,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH);
    assert.equal(review.operatorReviewOccurrence.reviewerIdentityVerified, false);
    assert.equal(review.operatorReviewOccurrence.reviewerAuthorityEstablished, false);
    assert.equal(review.operatorReviewOccurrence.reviewSignatureVerified, false);
    assert.equal(review.operatorReviewOccurrence.reviewBasisReplayed, false);
    assert.equal(review.legalBoundary.legalClearanceEstablished, false);

    const impossibleDate = JSON.parse(bytes.toString("utf8"));
    impossibleDate.operatorReviewOccurrence.reviewedAt
      = "2026-02-31T00:00:00.000Z";
    assert.throws(() => parseAutonomousWorkOrderGithubDiscoveryPreflightReview(
      Buffer.from(`${JSON.stringify(impossibleDate)}\n`, "utf8")),
    /PREFLIGHT_REVIEWED_AT_INVALID/u);

    assert.throws(() => createAutonomousWorkOrderGithubDiscoveryPreflightReview({
      reviewId: "awo_0123456789abcdef0123456789abcdef",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      validThrough: "2026-09-09T00:00:00.000Z",
      reviewerPairwiseAlias: "reviewer_0123456789abcdef0123456789abcdef",
      reviewBasisCommitment:
        "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      retentionSeconds: 86_400,
    }), /PREFLIGHT_REVIEW_OCCURRENCE_INVALID/u);
    assert.throws(() => parseAutonomousWorkOrderGithubDiscoveryPreflightReview(
      Buffer.from('{"schema":1,"schema":2}\n', "utf8")),
    /DUPLICATE_JSON_KEY/u);
    assert.throws(() => parseAutonomousWorkOrderGithubDiscoveryPreflightReview(
      Buffer.from([0xff, 0xff])), /PREFLIGHT_REVIEW_JSON_INVALID/u);
  });

test("raw derive kill gate precedes lifecycle receipt inspection",
  () => {
    const input = syntheticInput();
    input.acquisitionLifecycleReceiptBytes = Buffer.from("{}\n", "utf8");
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(input),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
  });

test("raw derive kill gate precedes capture metadata inspection",
  () => {
    const input = syntheticInput();
    input.captures.issueBefore.meta.selectedApiVersion = "2022-11-28";
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(input),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
  });

test("raw derive kill gate precedes source-byte parsing or copying",
  () => {
    const input = syntheticInput();
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(input),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
    input.captures.issueBefore.bytes = Buffer.from("{}\n", "utf8");
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(input),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
  });

test("raw derive kill gate precedes caller object traversal",
  () => {
    const extra = syntheticInput();
    extra.captures.issueBefore.meta.callerSaysOfficial = true;
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(extra),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);

    const accessor = syntheticInput();
    Object.defineProperty(accessor.captures.issueBefore.meta, "selectedApiVersion", {
      enumerable: true, configurable: true, get: () => "2026-03-10",
    });
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(accessor),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);

    const proxy = syntheticInput();
    proxy.captures.issueBefore.meta = new Proxy(proxy.captures.issueBefore.meta, {});
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(proxy),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);

    const duplicateRequest = syntheticInput();
    duplicateRequest.captures.commentsA.meta.requestId
      = duplicateRequest.captures.issueBefore.meta.requestId;
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(duplicateRequest),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);

    const zeroKey = syntheticInput();
    zeroKey.projectionKey = Buffer.alloc(32);
    assert.throws(() => deriveAutonomousWorkOrderGithubDiscoverySnapshot(zeroKey),
      /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
  });

test("headers manifest has an exact offline schema and also rejects selected-version drift",
  () => {
    const captures = {};
    for (let index = 0; index < ROLES.length; index += 1) {
      captures[ROLES[index]] = meta(index + 1);
    }
    const manifest = {
      schema:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.headersManifest,
      captures,
    };
    const parsed = parseAutonomousWorkOrderGithubDiscoveryHeadersManifest(
      Buffer.from(JSON.stringify(manifest), "utf8"));
    assert.equal(parsed.captures.issueAfter.captureOrdinal, 5);

    manifest.captures.issueAfter.selectedApiVersion = "2022-11-28";
    assert.throws(() => parseAutonomousWorkOrderGithubDiscoveryHeadersManifest(
      Buffer.from(JSON.stringify(manifest), "utf8")),
    /CAPTURE_META_INVALID:issueAfter/u);
  });

test("failed source validation creates no partial publication directory", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-github-discovery-"));
  chmodSync(root, 0o700);
  const output = path.join(root, "snapshot_0123456789abcdef0123456789abcdef");
  assert.throws(() => publishAutonomousWorkOrderGithubDiscoverySnapshot(
    syntheticInput(), { trustedRoot: root, outputDirectory: output }),
  /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
  assert.equal(existsSync(output), false);
});

test("network-safe projection publication remains NOT_INTEGRATED and creates no directory",
  () => {
    const root = mkdtempSync(path.join(os.tmpdir(),
      "outsider-github-projection-disabled-"));
    chmodSync(root, 0o700);
    const output = path.join(root,
      "snapshot_44444444444444444444444444444444");
    assert.throws(() =>
      publishAutonomousWorkOrderGithubDiscoveryNetworkSafeProjectionFromAcquisitionDirectory(
        "not-read", { outputDirectory: output }),
    /NETWORK_SAFE_PROJECTION_NOT_INTEGRATED_FAIL_CLOSED/u);
    assert.equal(existsSync(output), false);
  });

test("production acquisition loader kill gate precedes all control and raw file reads",
  () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "outsider-github-acquisition-"));
    chmodSync(root, 0o700);
    const lifecycleRoot = path.join(root, "lifecycle");
    mkdirSync(lifecycleRoot, { mode: 0o700 });
    chmodSync(lifecycleRoot, 0o700);
    const acquisition = path.join(root,
      "snapshot_abcdef0123456789abcdef0123456789");
    mkdirSync(acquisition, { mode: 0o700 });
    chmodSync(acquisition, 0o700);
    const payloads = {};
    const policy = syntheticPrivatePolicyBytes();
    const acquisitionRoles = ["acquisitionLifecycleReceipt", "preflightReview",
      "issueBefore", "commentsA", "issueMid", "commentsB", "issueAfter",
      "acquisitionCaptureManifest"];
    for (const role of acquisitionRoles) {
      const file = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES[role];
      const bytes = role === "preflightReview"
        ? policy.preflightReviewBytes
        : (role === "acquisitionLifecycleReceipt"
          ? policy.acquisitionLifecycleReceiptBytes
          : Buffer.from(role === "acquisitionCaptureManifest"
            ? "{}\n" : `synthetic-${role}\n`, "utf8"));
      payloads[role] = bytes;
      writeFileSync(path.join(acquisition, file), bytes, { mode: 0o600 });
      chmodSync(path.join(acquisition, file), 0o600);
    }
    const pins = {
      trustedAcquisitionRoot: root,
      trustedLifecycleRoot: lifecycleRoot,
      expectedCaptureManifestSha256:
        sha256(payloads.acquisitionCaptureManifest),
      expectedLifecycleReceiptSha256:
        sha256(payloads.acquisitionLifecycleReceipt),
      expectedPreflightReviewSha256: sha256(payloads.preflightReview),
    };
    assert.throws(() =>
      loadAutonomousWorkOrderGithubDiscoveryAcquisitionDirectory(acquisition, pins),
    /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);

    writeFileSync(path.join(acquisition, "operator-meta.json"), "{}\n", {
      mode: 0o600,
    });
    assert.throws(() =>
      loadAutonomousWorkOrderGithubDiscoveryAcquisitionDirectory(acquisition, pins),
    /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);

    assert.throws(() =>
      publishAutonomousWorkOrderGithubDiscoverySnapshotFromAcquisitionDirectory(
        acquisition, {
          trustedRoot: root,
          outputDirectory: path.join(root,
            "snapshot_0123456789abcdef0123456789abcdef"),
          projectionKey: Buffer.alloc(32, 0x11),
        }), /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
  });

test("global purge integration kill gate precedes an expired acquisition raw open", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-github-expired-"));
  chmodSync(root, 0o700);
  const lifecycleRoot = path.join(root, "lifecycle");
  mkdirSync(lifecycleRoot, { mode: 0o700 });
  chmodSync(lifecycleRoot, 0o700);
  const acquisition = path.join(root,
    "snapshot_11111111111111111111111111111111");
  mkdirSync(acquisition, { mode: 0o700 });
  chmodSync(acquisition, 0o700);
  const policy = syntheticPrivatePolicyBytes({
    retentionSeconds: 1,
    startedOffsetMs: -10_000,
  });
  const manifestBytes = Buffer.from("{}\n", "utf8");
  const rawRoles = ["issueBefore", "commentsA", "issueMid", "commentsB",
    "issueAfter"];
  const controls = {
    acquisitionLifecycleReceipt: policy.acquisitionLifecycleReceiptBytes,
    acquisitionCaptureManifest: manifestBytes,
    preflightReview: policy.preflightReviewBytes,
  };
  for (const role of Object.keys(controls)) {
    const file = path.join(acquisition,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES[role]);
    writeFileSync(file, controls[role], { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  for (const role of rawRoles) {
    const file = path.join(acquisition,
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES[role]);
    writeFileSync(file, Buffer.from(`unreadable-${role}\n`, "utf8"), {
      mode: 0o600,
    });
    chmodSync(file, 0o000);
  }
  assert.throws(() =>
    loadAutonomousWorkOrderGithubDiscoveryAcquisitionDirectory(acquisition, {
      trustedAcquisitionRoot: root,
      trustedLifecycleRoot: lifecycleRoot,
      expectedCaptureManifestSha256: sha256(manifestBytes),
      expectedLifecycleReceiptSha256:
        sha256(policy.acquisitionLifecycleReceiptBytes),
      expectedPreflightReviewSha256: sha256(policy.preflightReviewBytes),
    }), /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
});

test("global purge integration kill gate precedes external lifecycle or raw reads", () => {
  const root = mkdtempSync(path.join(os.tmpdir(),
    "outsider-github-purge-guard-"));
  chmodSync(root, 0o700);
  const lifecycleRoot = path.join(root, "lifecycle");
  mkdirSync(lifecycleRoot, { mode: 0o700 });
  chmodSync(lifecycleRoot, 0o700);
  const snapshotId = "snapshot_33333333333333333333333333333333";
  const acquisition = path.join(root, snapshotId);
  mkdirSync(acquisition, { mode: 0o700 });
  chmodSync(acquisition, 0o700);
  const lifecycleEntry = path.join(lifecycleRoot, snapshotId);
  mkdirSync(lifecycleEntry, { mode: 0o700 });
  chmodSync(lifecycleEntry, 0o700);
  const zero = `sha256:${"0".repeat(64)}`;
  assert.throws(() =>
    loadAutonomousWorkOrderGithubDiscoveryAcquisitionDirectory(acquisition, {
      trustedAcquisitionRoot: root,
      trustedLifecycleRoot: lifecycleRoot,
      expectedCaptureManifestSha256: zero,
      expectedLifecycleReceiptSha256: zero,
      expectedPreflightReviewSha256: zero,
    }), /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
});

test("live acquisition kill gate creates no capture directory and reaches no transport",
  async () => {
    const nonce = randomBytes(16).toString("hex");
    const preflight = `.outsider-github-live-kill-${nonce}.json`;
    const preflightPath = path.join(process.cwd(), preflight);
    const output = path.join(process.cwd(), "artifacts", "private-source-captures",
      `snapshot_${nonce}`);
    const now = Date.now();
    const preflightBytes
      = createAutonomousWorkOrderGithubDiscoveryPreflightReview({
        reviewId: `awo_${nonce}`,
        reviewedAt: new Date(now - 60_000).toISOString(),
        validThrough: new Date(now + 3_600_000).toISOString(),
        reviewerPairwiseAlias: `reviewer_${nonce}`,
        reviewBasisCommitment:
          `sha256:${"3".repeat(64)}`,
        retentionSeconds: 3_600,
      });
    assert.equal(existsSync(output), false);
    try {
      writeFileSync(preflightPath, preflightBytes, { mode: 0o600 });
      chmodSync(preflightPath, 0o600);
      await assert.rejects(
        acquireGithubDiscoverySnapshot([output, preflight]),
        /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u,
      );
      assert.equal(existsSync(output), false);
    } finally {
      if (existsSync(preflightPath)) unlinkSync(preflightPath);
    }
  });

test("injected transport cannot write pinned or synthetic raw before purge integration",
  async () => {
    const nonce = randomBytes(16).toString("hex");
    const testRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(),
      "outsider-github-disabled-transport-")));
    chmodSync(testRoot, 0o700);
    const preflight = "preflight-review.json";
    const preflightPath = path.join(testRoot, preflight);
    const output = path.join(testRoot, `snapshot_${nonce}`);
    const now = Date.now();
    const preflightBytes
      = createAutonomousWorkOrderGithubDiscoveryPreflightReview({
        reviewId: `awo_${nonce}`,
        reviewedAt: new Date(now - 60_000).toISOString(),
        validThrough: new Date(now + 3_600_000).toISOString(),
        reviewerPairwiseAlias: `reviewer_${nonce}`,
        reviewBasisCommitment: `sha256:${"4".repeat(64)}`,
        retentionSeconds: 3_600,
      });
    let transportCalls = 0;
    try {
      writeFileSync(preflightPath, preflightBytes, { mode: 0o600 });
      chmodSync(preflightPath, 0o600);
      await assert.rejects(
        acquireGithubDiscoverySnapshot([output, preflight], {
          testRoot,
          transport: async () => {
            transportCalls += 1;
            throw new Error("transport must remain unreachable");
          },
        }),
        /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u,
      );
      assert.equal(transportCalls, 0);
      assert.equal(existsSync(output), false);
    } finally {
      if (existsSync(preflightPath)) unlinkSync(preflightPath);
      rmdirSync(testRoot);
    }
  });

test("purge draft kill gate precedes argument and filesystem inspection", () => {
  const sentinel = path.join(os.tmpdir(),
    `outsider-purge-must-not-exist-${randomBytes(16).toString("hex")}`);
  assert.equal(existsSync(sentinel), false);
  assert.throws(() => purgeGithubDiscoverySnapshot([sentinel]),
    /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
  assert.equal(existsSync(sentinel), false);
});

test("structural and trusted verifiers stay HOLD on missing or unaudited bytes", () => {
  const missing = path.join(os.tmpdir(),
    "snapshot_ffffffffffffffffffffffffffffffff");
  const expected = `sha256:${"0".repeat(64)}`;
  const structural = verifyAutonomousWorkOrderGithubDiscoverySnapshotBundle(missing, {
    trustedLifecycleRoot: path.join(os.tmpdir(), "lifecycle"),
    expectedReceiptHash: expected,
    expectedNetworkSafeReportHash: expected,
    expectedPublicationLifecycleReceiptHash: expected,
  });
  assert.equal(structural.ok, false);
  assert.equal(structural.trustedExternalFactEstablished, false);
  assert.equal(structural.stage1ExternalFactGateSatisfied, false);
  assert.equal(structural.decisionState, "HOLD");
  assert.equal(structural.authority, "NONE");

  const trusted = verifyAutonomousWorkOrderGithubDiscoverySnapshotAgainstTrustedFacts(
    missing, {
      trustedLifecycleRoot: path.join(os.tmpdir(), "lifecycle"),
      expectedReceiptHash: expected,
      expectedNetworkSafeReportHash: expected,
      expectedPublicationLifecycleReceiptHash: expected,
    });
  assert.equal(trusted.ok, false);
  assert.equal(trusted.trustedExternalFactAdaptersIntegrated, false);
  assert.equal(trusted.trustedExternalFactEstablished, false);
  assert.equal(trusted.stage1ExternalFactGateSatisfied, false);
  assert.equal(trusted.result, "NOT_INTEGRATED");
  assert.equal(trusted.authority, "NONE");
});

test("the adapter and key helper contain no network client path", () => {
  const source = readFileSync(new URL(
    "../src/outsider-autonomous-work-order-github-discovery-snapshot.js",
    import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /from\s+["']node:(?:http|https)["']/u);
  assert.doesNotMatch(source,
    /\.(?:map|sort|push|startsWith|includes|toLowerCase|toUpperCase|equals|delete)\s*\(/u);
  assert.doesNotMatch(source, /\.is(?:File|Directory|SymbolicLink)\s*\(/u);
  const key = createAutonomousWorkOrderGithubDiscoveryProjectionKey();
  assert.equal(Buffer.isBuffer(key), true);
  assert.equal(key.length, 32);
  assert.notDeepEqual(key, Buffer.alloc(32));
});
