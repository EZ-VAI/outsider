import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { createEpisodeAttemptSetComposition }
  from "../src/outsider-episode-attempt-set-composition.js";
import {
  EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_BOUNDARY,
  EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_COMMIT_STATUS_UNKNOWN_ERROR,
  appendEpisodeAttemptSetLocalHeadV2,
  initializeEpisodeAttemptSetLocalHeadV2,
  verifyEpisodeAttemptSetLocalHeadV2,
} from "../src/outsider-episode-attempt-set-local-head-v2.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const episodeHash = h("local-head-v2:episode");
const at = (second) => `2026-09-01T00:00:${String(second).padStart(2, "0")}.000Z`;

const binding = {
  principalEpochProjectionHash: h("principal-epoch"),
  accountableDeploymentSubjectHash: h("deployment"),
  runtimeInstanceHash: h("runtime"),
  embodimentRevisionHash: null,
  delegationEdgeHash: h("delegation"),
  episodeHash,
  workOrderProjectionHash: h("work-order"),
  networkCompleteEpisodeJoinHash: h("complete-episode"),
  prospectiveCensusProjectionHash: h("census"),
  realityObligationGenesisHash: h("obligation-genesis"),
  realityObligationStateHash: h("obligation-state"),
  genesisObligationAttemptHash: h("attempt-1"),
};

function attempt(ordinal, kind, predecessor = null) {
  return {
    attemptOrdinal: ordinal,
    occurredAt: at(ordinal),
    episodeHash,
    attemptHash: h(`attempt-${ordinal}`),
    attemptActorSubjectHash: h(`actor-${ordinal}`),
    kind,
    retryOfAttemptHash: kind === "RETRY" ? h(`attempt-${predecessor}`) : null,
    recoveryOfAttemptHash: kind === "RECOVERY" ? h(`attempt-${predecessor}`) : null,
  };
}

function report(ordinal, attemptOrdinal, status = "MISSING") {
  return {
    reportOrdinal: ordinal,
    reportedAt: at(10 + ordinal),
    episodeHash,
    occurrenceIdentityHash: h(`occurrence-${ordinal}`),
    attemptHash: h(`attempt-${attemptOrdinal}`),
    networkObjectIdentityHash: h(`object-${ordinal}`),
    networkReceiptHash: h(`receipt-${ordinal}`),
    executionDisposition: ordinal === 1 ? "FAILED" : "SUCCEEDED",
    outcomeObservationStatus: status,
    reportedOutcomeEvidenceHash: status === "OBSERVED" ? h(`outcome-${ordinal}`) : null,
    consequenceEvidenceHashes: ordinal === 1 ? [h("consequence-1")] : [],
  };
}

function compose({ predecessor = null, attempts, reports, recordedAt }) {
  const revision = predecessor === null ? 0 : predecessor.appendOnlyLineage.revision + 1;
  return createEpisodeAttemptSetComposition({
    recordedAt,
    episodeBinding: binding,
    appendOnlyLineage: {
      revision,
      predecessorCompositionHash: predecessor?.compositionHash ?? null,
      supersedesCompositionHash: predecessor?.compositionHash ?? null,
    },
    attempts,
    reportOccurrences: reports,
  }, { predecessor });
}

function chain() {
  const genesis = compose({
    attempts: [attempt(1, "PRIMARY")],
    reports: [],
    recordedAt: at(1),
  });
  const revision1 = compose({
    predecessor: genesis,
    attempts: [attempt(1, "PRIMARY")],
    reports: [report(1, 1)],
    recordedAt: at(11),
  });
  const revision2 = compose({
    predecessor: revision1,
    attempts: [attempt(1, "PRIMARY"), attempt(2, "RETRY", 1)],
    reports: [report(1, 1), report(2, 2, "OBSERVED")],
    recordedAt: at(12),
  });
  return { genesis, revision1, revision2 };
}

function locations(label) {
  const parent = mkdtempSync(path.join(tmpdir(), `outsider-local-head-v2-${label}-`));
  chmodSync(parent, 0o700);
  return { parent, directory: path.join(parent, "registry") };
}

test("v2 stores and replays one exact local genesis without minting durability", () => {
  const { directory } = locations("genesis");
  const { genesis } = chain();
  const created = initializeEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-alpha",
    genesisComposition: genesis,
  });
  assert.equal(created.ok, true);
  assert.equal(created.entryFileCount, 1);
  assert.equal(created.head.headCompositionRevision, 0);
  assert.equal(created.head.headCompositionHash, genesis.compositionHash);
  assert.equal(created.fullAncestryReplayVerified, true);
  assert.equal(created.twoPassEntrySnapshotStabilityVerified, true);
  assert.equal(created.entryImmutabilityEstablished, false);
  assert.equal(created.boundary.entryWriterUsesAtomicCreatePerV1Revision, true);
  assert.equal(created.boundary.entryImmutabilityEstablished, false);
  assert.equal(created.boundary.appendFailureCanRequireReplay, true);
  assert.equal(created.boundary.automaticStaleLockRecovery, false);
  assert.equal(created.boundary.commitStatusUnknownErrorCode,
    EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_COMMIT_STATUS_UNKNOWN_ERROR);
  assert.equal(created.localUniqueHeadStructuralHistoryEstablished, true);
  assert.equal(created.externalHeadPinVerified, false);
  assert.equal(created.parallelGenesisExclusionEstablished, false);
  assert.equal(created.forkExclusionEstablished, false);
  assert.equal(created.durableAppendOnlyHistoryEstablished, false);
  assert.equal(created.authority, "NONE");
  assert.equal(created.actionReady, false);
  assert.equal(created.causalExperienceUnits, 0);
  assert.equal(created.permitsGuarantee, false);
  assert.equal(created.boundary,
    EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_BOUNDARY);
});

test("append CAS yields a single local head and full v1 ancestry replay", () => {
  const { directory } = locations("append");
  const { genesis, revision1, revision2 } = chain();
  const first = initializeEpisodeAttemptSetLocalHeadV2({
    directory, registryId: "attempt-set-local-beta", genesisComposition: genesis,
  });
  const second = appendEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-beta",
    composition: revision1,
    expectedLocalHeadHash: first.head.headHash,
  });
  const third = appendEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-beta",
    composition: revision2,
    expectedLocalHeadHash: second.head.headHash,
  });
  assert.equal(third.ok, true);
  assert.equal(third.entryFileCount, 3);
  assert.equal(third.head.headCompositionRevision, 2);
  assert.equal(third.head.headCompositionHash, revision2.compositionHash);
  assert.equal(third.head.attemptCount, 2);
  assert.equal(third.head.reportOccurrenceCount, 2);
  assert.equal(third.entryByteCommitments.length, 3);
  assert.equal(third.everyStoredV1CompositionDerivationVerified, true);
  assert.equal(third.everyStoredV1ImmediatePrefixVerified, true);
  assert.equal(third.expectedLocalHeadHashProvided, false);
  assert.equal(third.expectedLocalHeadHashMatched, false);
  assert.equal(third.appendPredecessorExpectedLocalHeadHash,
    second.head.headHash);
  assert.equal(third.appendPredecessorCasMatched, true);
  assert.equal(third.appendPredecessorCasIsConcurrencyOnly, true);
  const pinned = verifyEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-beta",
    expectedLocalHeadHash: third.head.headHash,
  });
  assert.equal(pinned.ok, true);
  assert.equal(pinned.expectedLocalHeadHashMatched, true);
  assert.equal(pinned.expectedLocalHeadHashIsConcurrencyTokenOnly, true);
  assert.equal(pinned.callerSelfPinAcceptedAsDurabilityProof, false);
});

test("stale CAS, same-revision reseal, and a current-head fork are rejected", () => {
  const { directory } = locations("cas");
  const { genesis, revision1, revision2 } = chain();
  const first = initializeEpisodeAttemptSetLocalHeadV2({
    directory, registryId: "attempt-set-local-gamma", genesisComposition: genesis,
  });
  const second = appendEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-gamma",
    composition: revision1,
    expectedLocalHeadHash: first.head.headHash,
  });
  assert.throws(() => appendEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-gamma",
    composition: revision2,
    expectedLocalHeadHash: first.head.headHash,
  }), /COMPARE_AND_SWAP_LOCAL_HEAD_MISMATCH/u);
  assert.throws(() => appendEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-gamma",
    composition: revision1,
    expectedLocalHeadHash: second.head.headHash,
  }), /EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_V1_COMPOSITION_REPLAY_FAILED:EPISODE_ATTEMPT_SET_DESCENDANT_PREDECESSOR_REVISION_OR_HASH_MISMATCH/u);
  const forkFromGenesis = compose({
    predecessor: genesis,
    attempts: [attempt(1, "PRIMARY"), attempt(2, "RECOVERY", 1)],
    reports: [],
    recordedAt: at(12),
  });
  assert.throws(() => appendEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-gamma",
    composition: forkFromGenesis,
    expectedLocalHeadHash: second.head.headHash,
  }), /EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_V1_COMPOSITION_REPLAY_FAILED:EPISODE_ATTEMPT_SET_DESCENDANT_PREDECESSOR_REVISION_OR_HASH_MISMATCH/u);
  const unchanged = verifyEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-gamma",
    expectedLocalHeadHash: second.head.headHash,
  });
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.entryFileCount, 2);
});

test("the same directory rejects parallel genesis but a second root remains possible", () => {
  const one = locations("parallel-one");
  const two = locations("parallel-two");
  const { genesis } = chain();
  const first = initializeEpisodeAttemptSetLocalHeadV2({
    directory: one.directory,
    registryId: "attempt-set-local-delta",
    genesisComposition: genesis,
  });
  assert.throws(() => initializeEpisodeAttemptSetLocalHeadV2({
    directory: one.directory,
    registryId: "attempt-set-local-delta",
    genesisComposition: genesis,
  }), /DIRECTORY_ALREADY_EXISTS/u);
  const parallel = initializeEpisodeAttemptSetLocalHeadV2({
    directory: two.directory,
    registryId: "attempt-set-local-delta",
    genesisComposition: genesis,
  });
  assert.equal(parallel.ok, true);
  assert.equal(parallel.head.headHash, first.head.headHash);
  assert.equal(parallel.parallelGenesisExclusionEstablished, false);
  assert.equal(parallel.boundary.secondDirectoryForSameEpisodePrevented, false);
  assert.equal(parallel.durableAppendOnlyHistoryEstablished, false);
});

test("missing, rewritten, non-canonical, and broad-permission entry bytes fail closed", () => {
  const { directory } = locations("tamper");
  const { genesis } = chain();
  const created = initializeEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-epsilon",
    genesisComposition: genesis,
  });
  const entry = path.join(directory, "entries", "000000000001.json");
  const original = readFileSync(entry);

  writeFileSync(entry, Buffer.from(`${canonicalizeStrict({ fake: true })}\n`));
  let checked = verifyEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-epsilon",
    expectedLocalHeadHash: created.head.headHash,
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.fullAncestryReplayVerified, false);
  assert.equal(checked.durableAppendOnlyHistoryEstablished, false);

  writeFileSync(entry, original.subarray(0, original.length - 1));
  checked = verifyEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-epsilon",
    expectedLocalHeadHash: created.head.headHash,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /BYTES_INVALID/u);

  writeFileSync(entry, original);
  chmodSync(entry, 0o644);
  checked = verifyEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId: "attempt-set-local-epsilon",
    expectedLocalHeadHash: created.head.headHash,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /PERMISSIONS_TOO_BROAD/u);
});

test("post-import Buffer prototype poisoning cannot change canonical replay", {
  concurrency: false,
}, () => {
  const toStringDescriptor = Object.getOwnPropertyDescriptor(Buffer.prototype, "toString");
  const equalsDescriptor = Object.getOwnPropertyDescriptor(Buffer.prototype, "equals");
  assert.ok(toStringDescriptor);
  assert.ok(equalsDescriptor);
  try {
    Object.defineProperty(Buffer.prototype, "toString", {
      ...toStringDescriptor,
      value() { throw new Error("POISONED_BUFFER_TO_STRING"); },
    });
    Object.defineProperty(Buffer.prototype, "equals", {
      ...equalsDescriptor,
      value() { throw new Error("POISONED_BUFFER_EQUALS"); },
    });
    const { directory } = locations("buffer-poison");
    const { genesis } = chain();
    const created = initializeEpisodeAttemptSetLocalHeadV2({
      directory,
      registryId: "attempt-set-local-buffer-poison",
      genesisComposition: genesis,
    });
    assert.equal(created.ok, true);
    assert.equal(created.twoPassEntrySnapshotStabilityVerified, true);
  } finally {
    Object.defineProperty(Buffer.prototype, "toString", toStringDescriptor);
    Object.defineProperty(Buffer.prototype, "equals", equalsDescriptor);
  }
});
