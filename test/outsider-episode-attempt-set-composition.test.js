import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS,
  EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES,
  EPISODE_ATTEMPT_SET_BOUNDARY,
  EPISODE_ATTEMPT_SET_SCHEMAS,
  createEpisodeAttemptSetComposition,
  verifyEpisodeAttemptSetComposition,
} from "../src/outsider-episode-attempt-set-composition.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const episodeHash = h("episode");
const at = (second) => `2026-09-01T00:00:${String(second).padStart(2, "0")}.000Z`;

function attempt(ordinal, { kind, retryOf = null, recoveryOf = null } = {}) {
  return {
    attemptOrdinal: ordinal, occurredAt: at(ordinal), episodeHash,
    attemptHash: h(`attempt-${ordinal}`),
    attemptActorSubjectHash: h(`attempt-actor-${ordinal}`), kind,
    retryOfAttemptHash: retryOf === null ? null : h(`attempt-${retryOf}`),
    recoveryOfAttemptHash: recoveryOf === null ? null : h(`attempt-${recoveryOf}`),
  };
}

function attempts() {
  return [
    attempt(1, { kind: "PRIMARY" }),
    attempt(2, { kind: "RETRY", retryOf: 1 }),
    attempt(3, { kind: "RETRY", retryOf: 2 }),
    attempt(4, { kind: "RETRY", retryOf: 3 }),
    attempt(5, { kind: "RETRY", retryOf: 4 }),
    attempt(6, { kind: "RECOVERY", recoveryOf: 1 }),
    attempt(7, { kind: "RECOVERY", recoveryOf: 6 }),
    attempt(8, { kind: "RETRY", retryOf: 7 }),
  ];
}

function report(ordinal, attemptOrdinal, { executionDisposition,
  outcomeObservationStatus, networkObject = `network-object-${ordinal}`,
  consequences = [] } = {}) {
  return {
    reportOrdinal: ordinal, reportedAt: at(9 + ordinal), episodeHash,
    occurrenceIdentityHash: h(`report-occurrence-${ordinal}`),
    attemptHash: h(`attempt-${attemptOrdinal}`),
    networkObjectIdentityHash: h(networkObject),
    networkReceiptHash: h(`network-receipt-${ordinal}`),
    executionDisposition, outcomeObservationStatus,
    reportedOutcomeEvidenceHash: outcomeObservationStatus === "OBSERVED"
      ? h(`outcome-evidence-${ordinal}`) : null,
    consequenceEvidenceHashes: consequences.map((label) => h(label)),
  };
}

function reports() {
  return [
    report(1, 1, { executionDisposition: "FAILED",
      outcomeObservationStatus: "MISSING", networkObject: "shared-network-object",
      consequences: ["consequence-1"] }),
    report(2, 1, { executionDisposition: "SUCCEEDED",
      outcomeObservationStatus: "OBSERVED", networkObject: "shared-network-object" }),
    report(3, 2, { executionDisposition: "REFUSED",
      outcomeObservationStatus: "REFUSED" }),
    report(4, 3, { executionDisposition: "ABORTED",
      outcomeObservationStatus: "UNKNOWN", consequences: ["consequence-4"] }),
    report(5, 4, { executionDisposition: "TIMED_OUT",
      outcomeObservationStatus: "CENSORED" }),
    report(6, 5, { executionDisposition: "UNKNOWN",
      outcomeObservationStatus: "UNAVAILABLE" }),
    report(7, 6, { executionDisposition: "FAILED",
      outcomeObservationStatus: "OBSERVED" }),
    report(8, 7, { executionDisposition: "REJECTED",
      outcomeObservationStatus: "OBSERVED" }),
  ];
}

function input(attemptRows = attempts(), reportRows = reports(), overrides = {}) {
  const base = {
    recordedAt: at(19),
    episodeBinding: {
      principalEpochProjectionHash: h("principal-epoch-projection"),
      accountableDeploymentSubjectHash: h("accountable-deployment-subject"),
      runtimeInstanceHash: h("runtime-instance"),
      embodimentRevisionHash: h("embodiment-revision"),
      delegationEdgeHash: h("delegation-edge"), episodeHash,
      workOrderProjectionHash: h("work-order-projection"),
      networkCompleteEpisodeJoinHash: h("network-complete-episode-join"),
      prospectiveCensusProjectionHash: h("prospective-census-projection"),
      realityObligationGenesisHash: h("reality-obligation-genesis"),
      realityObligationStateHash: h("reality-obligation-state"),
      genesisObligationAttemptHash: h("attempt-1"),
    },
    appendOnlyLineage: { revision: 0, predecessorCompositionHash: null,
      supersedesCompositionHash: null },
    attempts: attemptRows, reportOccurrences: reportRows,
  };
  return { ...base, ...overrides };
}

const mutable = (value) => JSON.parse(JSON.stringify(value));
const create = (value, predecessor = null) =>
  createEpisodeAttemptSetComposition(value, { predecessor });
function verify(record, predecessor = null,
  expectedCompositionHash = record.compositionHash,
  expectedPredecessorCompositionHash = predecessor?.compositionHash ?? null) {
  return verifyEpisodeAttemptSetComposition(record, { predecessor,
    expectedCompositionHash, expectedPredecessorCompositionHash });
}

function assertHeld(value) {
  assert.equal(value.status, "HOLD");
  assert.equal(value.decisionState, "HOLD");
  assert.equal(value.authority, "NONE");
  assert.equal(value.actionReady, false);
  assert.equal(value.executable, false);
  assert.equal(value.moneyMovementEnabled, false);
  assert.equal(value.permitsPricing, false);
  assert.equal(value.permitsGuarantee, false);
  assert.equal(value.permitsInsurance, false);
  assert.equal(value.permitsSettlement, false);
}

test("separates execution disposition from outcome observation status", () => {
  const record = create(input());
  const result = verify(record);
  assert.deepEqual(EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS,
    ["ABORTED", "FAILED", "REFUSED", "REJECTED", "SUCCEEDED", "TIMED_OUT",
      "UNKNOWN"]);
  assert.deepEqual(EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES,
    ["CENSORED", "MISSING", "OBSERVED", "REFUSED", "UNAVAILABLE", "UNKNOWN"]);
  assert.equal(record.reportOccurrences[0].executionDisposition, "FAILED");
  assert.equal(record.reportOccurrences[0].outcomeObservationStatus, "MISSING");
  assert.equal(record.reportOccurrences[1].executionDisposition, "SUCCEEDED");
  assert.equal(record.reportOccurrences[1].outcomeObservationStatus, "OBSERVED");
  assert.equal(record.reportOccurrenceCensus.countsByExecutionDisposition.TIMED_OUT, 1);
  assert.equal(record.reportOccurrenceCensus.countsByOutcomeObservationStatus.MISSING, 1);
  assert.equal(record.reportOccurrenceCensus.countsByOutcomeObservationStatus.UNKNOWN, 1);
  assert.equal(record.reportOccurrenceCensus.countsByOutcomeObservationStatus.CENSORED, 1);
  assert.equal(record.reportOccurrenceCensus.countsByOutcomeObservationStatus.UNAVAILABLE, 1);
  assert.equal(record.reportOccurrenceCensus.countsByOutcomeObservationStatus.REFUSED, 1);
  assert.equal(record.reportOccurrenceCensus.countsByOutcomeObservationStatus.OBSERVED, 3);
  assert.equal(record.reportOccurrenceCensus.reportedConsequenceOccurrenceCount, 2);
  assert.equal(record.retentionBoundary
    .withinCallerSuppliedImmediatePrefixLaterSuccessDoesNotEraseOccurrences, true);
  assert.equal(record.retentionBoundary
    .withinCallerSuppliedImmediatePrefixLaterSuccessDoesNotEraseConsequences, true);
  assert.equal(record.retentionBoundary.parallelGenesisExclusionEstablished, false);
  assert.equal(record.retentionBoundary.forkExclusionEstablished, false);
  assert.equal(result.ok, true);
  assert.equal(result.independentOutcomeEstablished, false);
  assertHeld(result);
});

test("counts Attempts, report occurrences, and network objects independently", () => {
  const record = create(input());
  assert.equal(record.attemptCensus.attemptCount, 8);
  assert.equal(record.reportOccurrenceCensus.reportOccurrenceCount, 8);
  assert.equal(record.objectDedupView
    .distinctSuppliedNetworkObjectIdentityHashCount, 7);
  assert.equal(record.objectDedupView
    .duplicateSuppliedNetworkObjectHashReportOccurrenceCount, 1);
  assert.equal(record.objectDedupView.networkObjectIdentitySourceReplayVerified, false);
  assert.equal(record.objectDedupView.contentAddressedObjectIdentityEstablished, false);
  assert.equal(record.reportOccurrences[0].attemptHash,
    record.reportOccurrences[1].attemptHash);
  assert.notEqual(record.reportOccurrences[0].occurrenceIdentityHash,
    record.reportOccurrences[1].occurrenceIdentityHash);
  assert.equal(record.attemptCensus.attemptCountDerivedFromReportOccurrenceCount, false);
  assert.equal(record.objectDedupView.attemptCountDerivedFromObjectCount, false);
  assert.equal(record.objectDedupView.reportOccurrenceCountDerivedFromObjectCount, false);
  assert.equal(record.attemptCensus.everySuppliedAttemptRetained, true);
  assert.equal(record.reportOccurrenceCensus.everySuppliedReportOccurrenceRetained, true);
});

test("append-only descendant retains both supplied prefixes and separate caller pin", () => {
  const predecessor = create(input(attempts().slice(0, 5), reports().slice(0, 6), {
    recordedAt: at(15),
  }));
  const descendant = create(input(attempts(), reports(), {
    appendOnlyLineage: { revision: 1,
      predecessorCompositionHash: predecessor.compositionHash,
      supersedesCompositionHash: predecessor.compositionHash },
  }), predecessor);
  const checked = verify(descendant, predecessor);
  assert.equal(checked.ok, true);
  assert.equal(checked.callerSuppliedImmediatePredecessorSelfHashAndPrefixMatched, true);
  assert.equal(checked.callerSuppliedExpectedPredecessorHashMatched, true);
  assert.equal(checked.externalHeadPinVerified, false);
  assert.equal(checked.fullAncestryReplayVerified, false);

  const changedAttemptPrefix = attempts();
  changedAttemptPrefix[0].attemptActorSubjectHash = h("changed-attempt-actor");
  assert.throws(() => create(input(changedAttemptPrefix, reports(), {
    appendOnlyLineage: { revision: 1,
      predecessorCompositionHash: predecessor.compositionHash,
      supersedesCompositionHash: predecessor.compositionHash },
  }), predecessor), /ATTEMPT_PREFIX_CHANGED_OR_DROPPED/u);

  const changedReportPrefix = reports();
  changedReportPrefix[0].executionDisposition = "SUCCEEDED";
  assert.throws(() => create(input(attempts(), changedReportPrefix, {
    appendOnlyLineage: { revision: 1,
      predecessorCompositionHash: predecessor.compositionHash,
      supersedesCompositionHash: predecessor.compositionHash },
  }), predecessor), /REPORT_PREFIX_CHANGED_OR_DROPPED/u);

  assert.throws(() => create(input(attempts().slice(0, 5), reports().slice(0, 6), {
    recordedAt: at(15), appendOnlyLineage: { revision: 1,
      predecessorCompositionHash: predecessor.compositionHash,
      supersedesCompositionHash: predecessor.compositionHash },
  }), predecessor), /MUST_APPEND_ATTEMPT_OR_REPORT_OCCURRENCE/u);

  const wrongPin = verifyEpisodeAttemptSetComposition(descendant, { predecessor,
    expectedCompositionHash: descendant.compositionHash,
    expectedPredecessorCompositionHash: h("wrong-predecessor-pin") });
  assert.equal(wrongPin.ok, false);
  assert.match(wrongPin.error, /EXPECTED_PREDECESSOR_HASH_MISMATCH/u);
});

test("parallel genesis and forks remain explicitly outside the retention claim", () => {
  const original = create(input());
  const successOnly = report(1, 1, { executionDisposition: "SUCCEEDED",
    outcomeObservationStatus: "OBSERVED" });
  const parallelGenesis = create(input(attempts().slice(0, 1), [successOnly], {
    recordedAt: at(11),
  }));
  assert.notEqual(parallelGenesis.compositionHash, original.compositionHash);
  assert.equal(original.appendOnlyLineage.revision, 0);
  assert.equal(parallelGenesis.appendOnlyLineage.revision, 0);
  assert.equal(EPISODE_ATTEMPT_SET_BOUNDARY.parallelGenesisExclusionEstablished,
    false);
  assert.equal(EPISODE_ATTEMPT_SET_BOUNDARY.forkExclusionEstablished, false);
  assert.equal(parallelGenesis.retentionBoundary
    .withinCallerSuppliedImmediatePrefixLaterSuccessDoesNotEraseOccurrences, true);
  assert.equal(parallelGenesis.retentionBoundary.durableAppendOnlyHistoryEstablished,
    false);
});

test("explicit Episode crosswalk rejects cross-subject and unknown rows", () => {
  const crossAttempt = attempts();
  crossAttempt[2].episodeHash = h("other-episode");
  assert.throws(() => create(input(crossAttempt, reports())),
    /ATTEMPT_EPISODE_CROSSWALK_MISMATCH/u);
  const crossReport = reports();
  crossReport[2].episodeHash = h("other-episode");
  assert.throws(() => create(input(attempts(), crossReport)),
    /REPORT_EPISODE_CROSSWALK_MISMATCH/u);
  const unknownAttempt = reports();
  unknownAttempt[2].attemptHash = h("unknown-attempt");
  assert.throws(() => create(input(attempts(), unknownAttempt)),
    /REPORT_NAMES_UNKNOWN_ATTEMPT/u);
  const early = reports();
  early[0].reportedAt = at(0);
  assert.throws(() => create(input(attempts(), early)), /REPORT_PRECEDES_ATTEMPT/u);
});

test("identity uniqueness allows multi-report Attempt and duplicate network object", () => {
  const record = create(input());
  assert.equal(record.reportOccurrences[0].attemptHash,
    record.reportOccurrences[1].attemptHash);
  assert.equal(record.reportOccurrences[0].networkObjectIdentityHash,
    record.reportOccurrences[1].networkObjectIdentityHash);
  const duplicateAttempt = attempts();
  duplicateAttempt[1].attemptHash = duplicateAttempt[0].attemptHash;
  assert.throws(() => create(input(duplicateAttempt, reports())),
    /ATTEMPT_HASH_DUPLICATE/u);
  const duplicateOccurrence = reports();
  duplicateOccurrence[1].occurrenceIdentityHash
    = duplicateOccurrence[0].occurrenceIdentityHash;
  assert.throws(() => create(input(attempts(), duplicateOccurrence)),
    /REPORT_OCCURRENCE_IDENTITY_DUPLICATE/u);
  const duplicateReceipt = reports();
  duplicateReceipt[1].networkReceiptHash = duplicateReceipt[0].networkReceiptHash;
  assert.throws(() => create(input(attempts(), duplicateReceipt)),
    /NETWORK_RECEIPT_DUPLICATE/u);
});

test("OBSERVED and explicit missingness have non-overlapping evidence states", () => {
  const observedWithoutEvidence = reports();
  observedWithoutEvidence[1].reportedOutcomeEvidenceHash = null;
  assert.throws(() => create(input(attempts(), observedWithoutEvidence)),
    /OBSERVED_STATUS_AND_OUTCOME_EVIDENCE_PRESENCE_MISMATCH/u);
  const missingWithEvidence = reports();
  missingWithEvidence[0].reportedOutcomeEvidenceHash = h("contradictory-outcome");
  assert.throws(() => create(input(attempts(), missingWithEvidence)),
    /OBSERVED_STATUS_AND_OUTCOME_EVIDENCE_PRESENCE_MISMATCH/u);
  const timedOutAndMissing = reports();
  timedOutAndMissing[0].executionDisposition = "TIMED_OUT";
  const record = create(input(attempts(), timedOutAndMissing));
  assert.equal(record.reportOccurrences[0].executionDisposition, "TIMED_OUT");
  assert.equal(record.reportOccurrences[0].outcomeObservationStatus, "MISSING");
});

test("obligation and membership facts remain caller-supplied and un-replayed", () => {
  const wrongGenesis = input();
  wrongGenesis.episodeBinding.genesisObligationAttemptHash = h("attempt-2");
  assert.throws(() => create(wrongGenesis),
    /CALLER_SUPPLIED_GENESIS_ATTEMPT_CROSSWALK_INVALID/u);
  const record = create(input());
  assert.equal(record.episodeBinding.episodeMembershipCallerSuppliedOnly, true);
  assert.equal(record.episodeBinding.episodeMembershipSourceReplayVerified, false);
  assert.equal(record.episodeBinding
    .callerSuppliedGenesisObligationReferenceMatchesFirstAttempt, true);
  assert.equal(record.episodeBinding.obligationSourceReplayVerified, false);
  assert.equal(record.episodeBinding
    .entireAttemptSetObligationCoverageEstablished, false);
  assert.equal(record.retentionBoundary
    .onlyGenesisAttemptCrosswalkStructurallyChecked, true);
});

test("strict options reject accessor, proxy, and unknown fields before use", () => {
  const value = input();
  assert.throws(() => createEpisodeAttemptSetComposition(value, {
    predecessor: null, callback: "forbidden",
  }), /CREATE_OPTIONS_FIELDS_INVALID/u);
  let getterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "predecessor", {
    get() { getterCalls += 1; return null; }, enumerable: true,
  });
  assert.throws(() => createEpisodeAttemptSetComposition(value, accessorOptions),
    /ACCESSOR_FORBIDDEN/u);
  assert.equal(getterCalls, 0);
  assert.throws(() => createEpisodeAttemptSetComposition(value,
    new Proxy({ predecessor: null }, {})), /PROXY_FORBIDDEN/u);
  const record = create(value);
  const badVerify = verifyEpisodeAttemptSetComposition(record, { predecessor: null,
    expectedCompositionHash: record.compositionHash,
    expectedPredecessorCompositionHash: null, authority: "PRODUCTION" });
  assert.equal(badVerify.ok, false);
  assert.match(badVerify.error, /VERIFY_OPTIONS_FIELDS_INVALID/u);
  const unknownInput = input();
  unknownInput.authority = "PRODUCTION";
  assert.throws(() => create(unknownInput), /CREATE_INPUT_FIELDS_INVALID/u);
});

test("self-hash and caller pin reject unsealed mutation while remaining HOLD", () => {
  const record = create(input());
  const mutations = [
    (value) => { value.attempts[0].attemptHash = h("changed-attempt"); },
    (value) => { value.reportOccurrences[0].outcomeObservationStatus = "OBSERVED"; },
    (value) => { value.attemptCensus.attemptCount = 1; },
    (value) => { value.reportOccurrenceCensus.reportOccurrenceCount = 1; },
    (value) => {
      value.objectDedupView.distinctSuppliedNetworkObjectIdentityHashCount = 1;
    },
    (value) => { value.authority = "PRODUCTION"; },
    (value) => { value.executable = true; },
    (value) => { value.compositionHash = h("forged-composition"); },
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    const changed = mutable(record);
    mutations[index](changed);
    const result = verify(changed, null, record.compositionHash);
    assert.equal(result.ok, false, String(index));
    assertHeld(result);
  }
  const wrongPin = verify(record, null, h("wrong-current-pin"));
  assert.equal(wrongPin.ok, false);
  assert.match(wrongPin.error, /EXPECTED_COMPOSITION_HASH_MISMATCH/u);
});

test("captured crypto, Date, and Array intrinsics resist post-import poisoning", () => {
  const value = input();
  const expected = create(value);
  const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
  const originalUpdate = hashPrototype.update;
  const originalDigest = hashPrototype.digest;
  const originalToISOString = Date.prototype.toISOString;
  const originalSort = Array.prototype.sort;
  let actual;
  try {
    hashPrototype.update = function poisonedUpdate() { throw new Error("poisoned hash"); };
    hashPrototype.digest = function poisonedDigest() { throw new Error("poisoned hash"); };
    Date.prototype.toISOString = function poisonedDate() { throw new Error("poisoned date"); };
    Array.prototype.sort = function poisonedSort() { throw new Error("poisoned sort"); };
    actual = createEpisodeAttemptSetComposition(value, { predecessor: null });
  } finally {
    hashPrototype.update = originalUpdate;
    hashPrototype.digest = originalDigest;
    Date.prototype.toISOString = originalToISOString;
    Array.prototype.sort = originalSort;
  }
  assert.equal(actual.compositionHash, expected.compositionHash);
  const invalidCalendar = input();
  invalidCalendar.attempts[0].occurredAt = "2026-02-31T00:00:01.000Z";
  assert.throws(() => create(invalidCalendar), /ATTEMPT_OCCURRED_AT_INVALID/u);
});

test("proxy/accessor rows reject and source mutation cannot alter frozen output", () => {
  const proxied = input();
  proxied.attempts[0] = new Proxy(proxied.attempts[0], {});
  assert.throws(() => create(proxied), /PROXY_FORBIDDEN/u);
  const accessor = input();
  Object.defineProperty(accessor.reportOccurrences[0], "attemptHash", {
    get() { return h("attempt-1"); }, enumerable: true,
  });
  assert.throws(() => create(accessor), /ACCESSOR_FORBIDDEN/u);
  const source = input();
  const record = create(source);
  source.reportOccurrences[0].executionDisposition = "SUCCEEDED";
  assert.equal(record.reportOccurrences[0].executionDisposition, "FAILED");
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.attempts), true);
  assert.equal(Object.isFrozen(record.reportOccurrences), true);
  assert.equal(verify(record).ok, true);
  assert.deepEqual(record.boundary, EPISODE_ATTEMPT_SET_BOUNDARY);
  assert.equal(record.schema, EPISODE_ATTEMPT_SET_SCHEMAS.composition);
});
