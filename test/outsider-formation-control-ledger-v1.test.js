import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_BOUNDARY,
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS,
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES,
  createFormationControlEventV1,
  createFormationControlLedgerSourcePinV1,
  createFormationControlLedgerV1,
  verifyFormationControlLedgerV1,
} from "../src/outsider-formation-control-ledger-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function id(prefix, label) {
  return `${prefix}_${h(label).slice("sha256:".length, "sha256:".length + 32)}`;
}

function tenderFixture(label = "formation-control") {
  const evidenceId = id("evidence", `${label}:evidence`);
  return compileOutsiderOutcomeTenderV1({
    tenderId: id("tender", label),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h(`${label}:work-order`),
    typedGraph: {
      principalEpoch: { principalRefHash: h(`${label}:principal`),
        epochRefHash: h(`${label}:epoch`),
        principalEpochProjectionHash: h(`${label}:epoch-projection`) },
      accountableDeployment: {
        deploymentLineageRefHash: h(`${label}:deployment-lineage`),
        deploymentRevisionHash: h(`${label}:deployment-revision`),
        accountableDeploymentSubjectHash: h(`${label}:deployment-subject`),
      },
      runtime: { runtimeInstanceRefHash: h(`${label}:runtime-ref`),
        runtimeInstanceHash: h(`${label}:runtime`) },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
        delegationEdgeHash: h(`${label}:delegation-edge`) },
      episode: { episodeHash: h(`${label}:episode`),
        networkCompleteEpisodeJoinHash: h(`${label}:episode-join`) },
      attempt: { attemptHash: h(`${label}:attempt`),
        attemptActorSubjectHash: h(`${label}:attempt-actor`) },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h(`${label}:actor-envelope`),
      delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
      delegationEdgeHash: h(`${label}:delegation-edge`),
      authorityScopeRefHash: h(`${label}:authority-scope`),
      resourceOwnerAuthorizationRefHash: h(`${label}:owner-auth`),
      rightsPrivacyPolicyRefHash: h(`${label}:rights-policy`),
    },
    exactOutcome: {
      outcomeKindCode: "BOUNDED_COORDINATION_COMPLETE",
      outcomeSpecRefHash: h(`${label}:outcome-spec`),
      subjectRefHash: h(`${label}:subject`),
      acceptanceCriteriaRefHash: h(`${label}:acceptance-criteria`),
      conditions: [{
        conditionId: id("condition", `${label}:complete`),
        metricCode: "OUTCOME_STATE",
        comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "COMPLETE", unitCode: null },
        observationWindowMs: 0,
        conditionRefHash: h(`${label}:condition`),
        mandatory: true,
      }],
      deadline: "2026-09-02T16:00:00.000Z",
    },
    formationDeadline: "2026-09-02T12:40:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: id("resource", `${label}:primary`),
      resourceClassCode: "GENERIC_BOUNDED_RESOURCE",
      capabilityRefHash: h(`${label}:capability`),
      quantity: 1,
      unitCode: "TASK_SLOT",
      regionRefHash: h(`${label}:region`),
      requiredBy: "2026-09-02T15:00:00.000Z",
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "INDEPENDENT_OUTCOME_OBSERVATION",
      evidenceRequirementRefHash: h(`${label}:evidence-ref`),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2026-09-02T16:00:00.000Z",
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: id("recovery", `${label}:alternate`),
      triggerRefHash: h(`${label}:recovery-trigger`),
      recoveryOutcomeRefHash: h(`${label}:recovery-outcome`),
      resourceClassCode: "ALTERNATE_BOUNDED_RESOURCE",
      maximumAttempts: 2,
      completionDeadline: "2026-09-02T16:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h(`${label}:consequence`),
      consequenceClassCode: "BOUNDED_DELAY",
      measureCode: "MAXIMUM_DELAY_MINUTES",
      maximumValue: 120,
      unitCode: "MINUTE",
      affectedChannelRefHashes: [h(`${label}:affected-channel`)],
      irreversibleHarmAllowed: false,
      unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  });
}

function ledgerIdFor(label) {
  return id("ledger", label);
}

function addEvent(events, tender, ledgerId, eventType, recordedAt, payload,
  nonceLabel = `${eventType}:${events.length + 1}`) {
  const event = createFormationControlEventV1({
    ledgerId,
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    eventType,
    ordinal: events.length + 1,
    previousOccurrenceHash: events.length === 0
      ? OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS
      : events[events.length - 1].occurrenceHash,
    recordedAt,
    occurrenceNonceHash: h(`occurrence:${nonceLabel}`),
    payload,
  });
  events.push(event);
  return event;
}

function openedFixture(label = "formation-control") {
  const tender = tenderFixture(label);
  const ledgerId = ledgerIdFor(label);
  const events = [];
  addEvent(events, tender, ledgerId, "FORMATION_OPENED",
    "2026-09-02T12:01:00.000Z",
    { formationDeadline: tender.formationDeadline }, `${label}:open`);
  return { tender, ledgerId, events };
}

function sourceFor(fixture, observedAt = "2026-09-02T12:10:00.000Z",
  overrides = {}) {
  const events = overrides.events ?? fixture.events;
  return {
    ledgerId: overrides.ledgerId ?? fixture.ledgerId,
    tender: overrides.tender ?? fixture.tender,
    expectedTenderHash:
      overrides.expectedTenderHash ?? fixture.tender.tenderHash,
    observedAt: overrides.observedAt ?? observedAt,
    events,
    expectedOccurrenceCount:
      overrides.expectedOccurrenceCount ?? events.length,
    expectedHeadHash: overrides.expectedHeadHash
      ?? events[events.length - 1].occurrenceHash,
  };
}

function checked(source) {
  const record = createFormationControlLedgerV1(source);
  const expectedSourceHash = createFormationControlLedgerSourcePinV1(source);
  const verification = verifyFormationControlLedgerV1(record, {
    source,
    expectedSourceHash,
    expectedLedgerHash: record.ledgerHash,
  });
  assert.equal(verification.ok, true);
  return { record, verification, expectedSourceHash };
}

test("exact replay keeps every occurrence while semantic objects may dedup", () => {
  const fixture = openedFixture("happy");
  const reserved = addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "NONCE_RESERVED", "2026-09-02T12:02:00.000Z", {
      nonceHash: h("happy:one-use-nonce"),
      purposeCode: "RESOURCE_TENDER",
      reservationExpiresAt: "2026-09-02T12:35:00.000Z",
    }, "happy:reserve");
  const idempotencyPayload = {
    idempotencyKeyHash: h("happy:idempotency-key"),
    objectHash: h("happy:idempotency-object"),
  };
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "IDEMPOTENCY_OBSERVED", "2026-09-02T12:03:00.000Z",
    idempotencyPayload, "happy:idempotency:first");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "IDEMPOTENCY_OBSERVED", "2026-09-02T12:04:00.000Z",
    idempotencyPayload, "happy:idempotency:repeat");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "NONCE_CONSUMED", "2026-09-02T12:05:00.000Z", {
      nonceHash: h("happy:one-use-nonce"),
      reservationOccurrenceHash: reserved.occurrenceHash,
    }, "happy:consume");
  const source = sourceFor(fixture);
  const { record, verification } = checked(source);

  assert.equal(record.controlDecision.controlState,
    OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.forming);
  assert.equal(record.controlDecision.disposition,
    "CONTINUE_AUTOMATED_FORMATION_HOLD");
  assert.equal(record.occurrenceCensus.totalOccurrenceCount, 5);
  assert.equal(record.occurrenceCensus.uniqueEventObjectCount, 4);
  assert.equal(record.occurrenceCensus.duplicateEventObjectOccurrenceCount, 1);
  assert.equal(record.idempotencyCensus.occurrenceCount, 2);
  assert.equal(record.idempotencyCensus.uniqueKeyCount, 1);
  assert.equal(record.idempotencyCensus.uniqueObjectCount, 1);
  assert.equal(record.idempotencyCensus.repeatedOccurrenceCount, 1);
  assert.equal(record.nonceLifecycle.consumedReservationCount, 1);
  assert.equal(record.nonceLifecycle.liveUnconsumedReservationCount, 0);
  assert.equal(verification.appendOnlyPredecessorAndHeadVerified, true);
  assert.equal(verification.occurrenceDenominatorReplayed, true);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.occurrenceCensus), true);
});

test("deadline is exact: before holds automatically; at deadline declines", () => {
  const beforeFixture = openedFixture("deadline-before");
  const before = checked(sourceFor(beforeFixture,
    "2026-09-02T12:39:59.999Z")).record;
  assert.equal(before.formationDeadline.reached, false);
  assert.equal(before.controlDecision.controlState,
    "CONTINUE_AUTOMATED_FORMATION_HOLD");
  assert.equal(before.zeroInternalOps.humanQueueCreated, false);

  const atFixture = openedFixture("deadline-at");
  const at = checked(sourceFor(atFixture,
    "2026-09-02T12:40:00.000Z")).record;
  assert.equal(at.formationDeadline.reached, true);
  assert.equal(at.controlDecision.controlState, "DECLINE_NOT_HUMAN_QUEUE");
  assert.equal(at.controlDecision.disposition, "DECLINE_NOT_HUMAN_QUEUE");
  assert.equal(at.controlDecision.permanentlyDisqualifiedFromCommitment, true);
  assert.equal(at.zeroInternalOps.humanQueueCreated, false);
});

test("one-use nonce consumption is reservation-bound, live, and exactly once", () => {
  const fixture = openedFixture("nonce-once");
  const reserved = addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "NONCE_RESERVED", "2026-09-02T12:02:00.000Z", {
      nonceHash: h("nonce-once:value"), purposeCode: "FORMATION_CONTROL",
      reservationExpiresAt: "2026-09-02T12:20:00.000Z",
    }, "nonce-once:reserve");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "NONCE_CONSUMED", "2026-09-02T12:03:00.000Z", {
      nonceHash: h("nonce-once:value"),
      reservationOccurrenceHash: reserved.occurrenceHash,
    }, "nonce-once:consume");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "NONCE_CONSUMED", "2026-09-02T12:04:00.000Z", {
      nonceHash: h("nonce-once:value"),
      reservationOccurrenceHash: reserved.occurrenceHash,
    }, "nonce-once:consume-again");
  assert.throws(() => createFormationControlLedgerV1(sourceFor(fixture)),
    /NONCE_CONSUMPTION_INVALID_REPLAYED_OR_EXPIRED/u);

  const expired = openedFixture("nonce-expired");
  const expiredReservation = addEvent(expired.events, expired.tender,
    expired.ledgerId, "NONCE_RESERVED", "2026-09-02T12:02:00.000Z", {
      nonceHash: h("nonce-expired:value"), purposeCode: "RESOURCE_RESPONSE",
      reservationExpiresAt: "2026-09-02T12:03:00.000Z",
    }, "nonce-expired:reserve");
  addEvent(expired.events, expired.tender, expired.ledgerId,
    "NONCE_CONSUMED", "2026-09-02T12:03:00.000Z", {
      nonceHash: h("nonce-expired:value"),
      reservationOccurrenceHash: expiredReservation.occurrenceHash,
    }, "nonce-expired:consume");
  assert.throws(() => createFormationControlLedgerV1(sourceFor(expired)),
    /NONCE_CONSUMPTION_INVALID_REPLAYED_OR_EXPIRED/u);

  const unreserved = openedFixture("nonce-unreserved");
  addEvent(unreserved.events, unreserved.tender, unreserved.ledgerId,
    "NONCE_CONSUMED", "2026-09-02T12:02:00.000Z", {
      nonceHash: h("nonce-unreserved:value"),
      reservationOccurrenceHash: h("nonce-unreserved:fake-reservation"),
    }, "nonce-unreserved:consume");
  assert.throws(() => createFormationControlLedgerV1(sourceFor(unreserved)),
    /NONCE_CONSUMPTION_INVALID_REPLAYED_OR_EXPIRED/u);
});

test("a nonce cannot be reserved twice and occurrence nonces cannot replay", () => {
  const duplicateReservation = openedFixture("duplicate-reservation");
  const payload = { nonceHash: h("duplicate-reservation:value"),
    purposeCode: "RESOURCE_TENDER",
    reservationExpiresAt: "2026-09-02T12:30:00.000Z" };
  addEvent(duplicateReservation.events, duplicateReservation.tender,
    duplicateReservation.ledgerId, "NONCE_RESERVED",
    "2026-09-02T12:02:00.000Z", payload, "duplicate-reservation:first");
  addEvent(duplicateReservation.events, duplicateReservation.tender,
    duplicateReservation.ledgerId, "NONCE_RESERVED",
    "2026-09-02T12:03:00.000Z", payload, "duplicate-reservation:second");
  assert.throws(() => createFormationControlLedgerV1(
    sourceFor(duplicateReservation)), /NONCE_RESERVATION_INVALID_OR_REUSED/u);

  const occurrenceReplay = openedFixture("occurrence-replay");
  addEvent(occurrenceReplay.events, occurrenceReplay.tender,
    occurrenceReplay.ledgerId, "IDEMPOTENCY_OBSERVED",
    "2026-09-02T12:02:00.000Z", {
      idempotencyKeyHash: h("occurrence-replay:key"),
      objectHash: h("occurrence-replay:object"),
    }, "occurrence-replay:open");
  assert.throws(() => createFormationControlLedgerV1(
    sourceFor(occurrenceReplay)), /OCCURRENCE_NONCE_REPLAY_DETECTED/u);
});

test("idempotency occurrences count but one key cannot splice objects", () => {
  const fixture = openedFixture("idempotency-splice");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "IDEMPOTENCY_OBSERVED", "2026-09-02T12:02:00.000Z", {
      idempotencyKeyHash: h("idempotency-splice:key"),
      objectHash: h("idempotency-splice:object-a"),
    }, "idempotency-splice:first");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "IDEMPOTENCY_OBSERVED", "2026-09-02T12:03:00.000Z", {
      idempotencyKeyHash: h("idempotency-splice:key"),
      objectHash: h("idempotency-splice:object-b"),
    }, "idempotency-splice:second");
  assert.throws(() => createFormationControlLedgerV1(sourceFor(fixture)),
    /IDEMPOTENCY_KEY_OBJECT_SPLICE/u);
});

test("any Outsider staff touch permanently disqualifies commitment", () => {
  const fixture = openedFixture("staff-touch");
  const staffActorRefHash = h("PRIVATE_STAFF_ACTOR_CANARY");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "OUTSIDER_STAFF_TOUCH_RECORDED", "2026-09-02T12:02:00.000Z", {
      staffActorRefHash,
      touchClassCode: "MANUAL_COORDINATION",
    }, "staff-touch:first");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "IDEMPOTENCY_OBSERVED", "2026-09-02T12:03:00.000Z", {
      idempotencyKeyHash: h("staff-touch:audit-key"),
      objectHash: h("staff-touch:audit-object"),
    }, "staff-touch:audit");
  const record = checked(sourceFor(fixture)).record;
  assert.equal(record.controlDecision.controlState,
    OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.staffTouch);
  assert.equal(record.controlDecision.disposition, "DECLINE_NOT_HUMAN_QUEUE");
  assert.equal(record.zeroInternalOps.outsiderStaffTouchesAllowed, 0);
  assert.equal(record.zeroInternalOps.outsiderStaffTouchOccurrenceCount, 1);
  assert.equal(record.zeroInternalOps.staffTouchPermanentlyDisqualifiesCommitment,
    true);
  assert.equal(record.controlDecision.formationCommitmentAuthorized, false);

  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "NONCE_RESERVED", "2026-09-02T12:04:00.000Z", {
      nonceHash: h("staff-touch:post-touch-nonce"),
      purposeCode: "FORMATION_CONTROL",
      reservationExpiresAt: "2026-09-02T12:30:00.000Z",
    }, "staff-touch:post-touch-reserve");
  assert.throws(() => createFormationControlLedgerV1(sourceFor(fixture)),
    /NONCE_RESERVATION_AFTER_STAFF_TOUCH_FORBIDDEN/u);
});

test("cancellation and revocation are terminal with audit-only descendants", () => {
  for (const terminal of [
    { type: "FORMATION_CANCELLED", payload: {
      reasonCode: "PRINCIPAL_CANCELLED" }, state:
      OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.cancelled },
    { type: "FORMATION_REVOKED", payload: {
      reasonCode: "DELEGATION_REVOKED" }, state:
      OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.revoked },
  ]) {
    const fixture = openedFixture(`terminal:${terminal.type}`);
    addEvent(fixture.events, fixture.tender, fixture.ledgerId, terminal.type,
      "2026-09-02T12:02:00.000Z", terminal.payload,
      `terminal:${terminal.type}:event`);
    addEvent(fixture.events, fixture.tender, fixture.ledgerId,
      "IDEMPOTENCY_OBSERVED", "2026-09-02T12:03:00.000Z", {
        idempotencyKeyHash: h(`terminal:${terminal.type}:audit-key`),
        objectHash: h(`terminal:${terminal.type}:audit-object`),
      }, `terminal:${terminal.type}:audit`);
    const record = checked(sourceFor(fixture)).record;
    assert.equal(record.controlDecision.controlState, terminal.state);
    assert.equal(record.controlDecision.disposition,
      "DECLINE_NOT_HUMAN_QUEUE");

    addEvent(fixture.events, fixture.tender, fixture.ledgerId,
      "NONCE_RESERVED", "2026-09-02T12:04:00.000Z", {
        nonceHash: h(`terminal:${terminal.type}:nonce`),
        purposeCode: "FORMATION_CONTROL",
        reservationExpiresAt: "2026-09-02T12:30:00.000Z",
      }, `terminal:${terminal.type}:reserve`);
    assert.throws(() => createFormationControlLedgerV1(sourceFor(fixture)),
      /TERMINAL_LIFECYCLE_DESCENDANT_FORBIDDEN/u);
  }
});

test("exact ordinal, predecessor, occurrence count, and head pins fail closed",
  () => {
    const badPrevious = openedFixture("bad-previous");
    const forged = createFormationControlEventV1({
      ledgerId: badPrevious.ledgerId,
      tenderHash: badPrevious.tender.tenderHash,
      typedGraphHash: badPrevious.tender.typedGraph.typedGraphHash,
      episodeHash: badPrevious.tender.typedGraph.episode.episodeHash,
      attemptHash: badPrevious.tender.typedGraph.attempt.attemptHash,
      eventType: "IDEMPOTENCY_OBSERVED",
      ordinal: 2,
      previousOccurrenceHash: h("wrong-previous"),
      recordedAt: "2026-09-02T12:02:00.000Z",
      occurrenceNonceHash: h("bad-previous:occurrence"),
      payload: { idempotencyKeyHash: h("bad-previous:key"),
        objectHash: h("bad-previous:object") },
    });
    badPrevious.events.push(forged);
    assert.throws(() => createFormationControlLedgerV1(sourceFor(badPrevious)),
      /APPEND_ONLY_PREDECESSOR_CHAIN_INVALID/u);

    const count = openedFixture("bad-count");
    assert.throws(() => createFormationControlLedgerV1(sourceFor(count,
      undefined, { expectedOccurrenceCount: 2 })),
    /OCCURRENCE_DENOMINATOR_MISMATCH/u);

    const head = openedFixture("bad-head");
    assert.throws(() => createFormationControlLedgerV1(sourceFor(head,
      undefined, { expectedHeadHash: h("wrong-head") })),
    /HEAD_PIN_MISMATCH/u);
  });

test("tender and typed-graph splices fail exact source replay", () => {
  const fixture = openedFixture("graph-splice");
  const spliced = createFormationControlEventV1({
    ledgerId: fixture.ledgerId,
    tenderHash: fixture.tender.tenderHash,
    typedGraphHash: fixture.tender.typedGraph.typedGraphHash,
    episodeHash: fixture.tender.typedGraph.episode.episodeHash,
    attemptHash: h("different-attempt"),
    eventType: "IDEMPOTENCY_OBSERVED",
    ordinal: 2,
    previousOccurrenceHash: fixture.events[0].occurrenceHash,
    recordedAt: "2026-09-02T12:02:00.000Z",
    occurrenceNonceHash: h("graph-splice:occurrence"),
    payload: { idempotencyKeyHash: h("graph-splice:key"),
      objectHash: h("graph-splice:object") },
  });
  fixture.events.push(spliced);
  assert.throws(() => createFormationControlLedgerV1(sourceFor(fixture)),
    /EVENT_TENDER_OR_TYPED_GRAPH_SPLICE/u);

  const tenderPin = openedFixture("tender-pin");
  assert.throws(() => createFormationControlLedgerV1(sourceFor(tenderPin,
    undefined, { expectedTenderHash: h("wrong-tender") })),
  /TENDER_SOURCE_REPLAY_FAILED/u);
});

test("verification requires exact source and independently retained pins", () => {
  const fixture = openedFixture("source-pin");
  const source = sourceFor(fixture);
  const { record, expectedSourceHash } = checked(source);

  const outputOnly = verifyFormationControlLedgerV1(record, {
    source: undefined,
    expectedSourceHash,
    expectedLedgerHash: record.ledgerHash,
  });
  assert.equal(outputOnly.ok, false);
  assert.equal(outputOnly.outputOnlyVerificationPermitted, false);

  const changedSource = { ...source,
    observedAt: "2026-09-02T12:11:00.000Z" };
  const changedRecord = createFormationControlLedgerV1(changedSource);
  const stalePin = verifyFormationControlLedgerV1(changedRecord, {
    source: changedSource,
    expectedSourceHash,
    expectedLedgerHash: changedRecord.ledgerHash,
  });
  assert.equal(stalePin.ok, false);
  assert.match(stalePin.error, /EXPECTED_SOURCE_HASH_MISMATCH/u);

  const wrongOutputPin = verifyFormationControlLedgerV1(record, {
    source,
    expectedSourceHash,
    expectedLedgerHash: h("wrong-ledger-output-pin"),
  });
  assert.equal(wrongOutputPin.ok, false);
  assert.match(wrongOutputPin.error, /EXPECTED_LEDGER_HASH_MISMATCH/u);
});

test("public projection omits private event, nonce, idempotency, and staff refs",
  () => {
    const fixture = openedFixture("privacy");
    const nonceHash = h("PRIVATE_NONCE_CANARY");
    const idempotencyKeyHash = h("PRIVATE_IDEMPOTENCY_CANARY");
    const objectHash = h("PRIVATE_OBJECT_CANARY");
    const staffActorRefHash = h("PRIVATE_STAFF_CANARY");
    addEvent(fixture.events, fixture.tender, fixture.ledgerId,
      "NONCE_RESERVED", "2026-09-02T12:02:00.000Z", {
        nonceHash, purposeCode: "SOURCE_REPLAY",
        reservationExpiresAt: "2026-09-02T12:30:00.000Z",
      }, "privacy:reserve");
    addEvent(fixture.events, fixture.tender, fixture.ledgerId,
      "IDEMPOTENCY_OBSERVED", "2026-09-02T12:03:00.000Z", {
        idempotencyKeyHash, objectHash,
      }, "privacy:idempotency");
    addEvent(fixture.events, fixture.tender, fixture.ledgerId,
      "OUTSIDER_STAFF_TOUCH_RECORDED", "2026-09-02T12:04:00.000Z", {
        staffActorRefHash, touchClassCode: "MANUAL_VERIFICATION",
      }, "privacy:staff");
    const source = sourceFor(fixture);
    const { record, verification, expectedSourceHash } = checked(source);
    const publicText = JSON.stringify({ record, verification });
    assert.equal(publicText.includes(nonceHash), false);
    assert.equal(publicText.includes(idempotencyKeyHash), false);
    assert.equal(publicText.includes(objectHash), false);
    assert.equal(publicText.includes(staffActorRefHash), false);
    assert.equal(publicText.includes(expectedSourceHash), false);
    assert.equal(Object.hasOwn(record, "events"), false);
    assert.equal(Object.hasOwn(record.zeroInternalOps,
      "firstOutsiderStaffTouchAt"), false);
    assert.equal(record.sourceReplayBoundary.privateSourceProjected, false);
    assert.equal(record.boundary,
      OUTSIDER_FORMATION_CONTROL_LEDGER_V1_BOUNDARY);
  });

test("hostile Proxy, accessor, sparse, shared, symbol, and budget inputs fail",
  () => {
    const fixture = openedFixture("hostile");
    const source = sourceFor(fixture);
    assert.throws(() => createFormationControlLedgerV1(new Proxy(source, {})),
      /PROXY_FORBIDDEN/u);

    const accessor = { ...source };
    Object.defineProperty(accessor, "observedAt", {
      enumerable: true, get() { return source.observedAt; },
    });
    assert.throws(() => createFormationControlLedgerV1(accessor),
      /SOURCE_DESCRIPTOR_INVALID/u);

    const sparse = { ...source, events: new Array(2) };
    sparse.events[0] = fixture.events[0];
    assert.throws(() => createFormationControlLedgerV1(sparse),
      /ARRAY_INVALID/u);

    const shared = { ...source,
      events: [fixture.events[0], fixture.events[0]],
      expectedOccurrenceCount: 2 };
    assert.throws(() => createFormationControlLedgerV1(shared),
      /SHARED_OR_CYCLIC_OBJECT_FORBIDDEN/u);

    const symbol = { ...source };
    symbol[Symbol("hidden")] = true;
    assert.throws(() => createFormationControlLedgerV1(symbol),
      /SOURCE_DESCRIPTOR_INVALID/u);

    const nonEnumerable = { ...source };
    Object.defineProperty(nonEnumerable, "observedAt", {
      value: source.observedAt, enumerable: false,
    });
    assert.throws(() => createFormationControlLedgerV1(nonEnumerable),
      /SOURCE_DESCRIPTOR_INVALID/u);

    assert.throws(() => createFormationControlEventV1({
      ledgerId: `ledger_${"a".repeat(20_000)}`,
    }), /STRING_BUDGET_EXCEEDED/u);

    const aggregateStrings = { ...source,
      padding: Array.from({ length: 513 }, () => "x".repeat(16_384)) };
    assert.throws(() => createFormationControlLedgerV1(aggregateStrings),
      /AGGREGATE_STRING_BUDGET_EXCEEDED/u);
  });

test("fixed boundary never mints authority, capacity, action, or money", () => {
  const fixture = openedFixture("fixed-boundary");
  const { record, verification } = checked(sourceFor(fixture));
  assert.deepEqual(record.authorityBoundary.enabledCapabilities, []);
  assert.deepEqual(record.authorityBoundary.provenAuthorities, []);
  assert.equal(record.authorityBoundary.cEnabledSubsetAProven, true);
  assert.equal(record.authorityBoundary.capacityReserved, false);
  assert.equal(record.controlDecision.formationCommitmentAuthorized, false);
  assert.equal(record.economicBoundary.priceEstablished, false);
  assert.equal(record.economicBoundary.guaranteeCreated, false);
  assert.equal(record.economicBoundary.settlementPermitted, false);
  assert.equal(record.economicBoundary.moneyMovementEnabled, false);
  assert.equal(record.decisionState, "HOLD");
  assert.equal(record.authority, "NONE");
  assert.equal(record.actionReady, false);
  assert.equal(record.executable, false);
  assert.equal(verification.formationCommitmentAuthorized, false);
  assert.equal(verification.capacityReserved, false);
});

test("post-import Map/Set intrinsic poisoning cannot alter replay", () => {
  const fixture = openedFixture("map-size-poison");
  addEvent(fixture.events, fixture.tender, fixture.ledgerId,
    "IDEMPOTENCY_OBSERVED", "2026-09-02T12:02:00.000Z", {
      idempotencyKeyHash: h("map-size-poison:key"),
      objectHash: h("map-size-poison:object"),
    }, "map-size-poison:idempotency");
  const sourceJson = JSON.stringify(sourceFor(fixture));
  const moduleUrl = new URL(
    "../src/outsider-formation-control-ledger-v1.js", import.meta.url).href;
  const program = `
    const ledger = await import(process.argv[1]);
    const source = JSON.parse(process.argv[2]);
    const sizeDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "size");
    const originalSetAdd = Set.prototype.add;
    Object.defineProperty(Map.prototype, "size", {
      configurable: true,
      get() { throw new Error("poisoned Map size getter reached"); },
    });
    Set.prototype.add = function poisonedSetAdd() {
      throw new Error("poisoned Set add reached");
    };
    try {
      const record = ledger.createFormationControlLedgerV1(source);
      if (record.idempotencyCensus.uniqueKeyCount !== 1
        || record.nonceLifecycle.uniqueReservedNonceCount !== 0) {
        throw new Error("unexpected replay result");
      }
    } finally {
      Object.defineProperty(Map.prototype, "size", sizeDescriptor);
      Set.prototype.add = originalSetAdd;
    }
  `;
  const child = spawnSync(process.execPath,
    ["--input-type=module", "--eval", program, moduleUrl, sourceJson], {
      encoding: "utf8",
      timeout: 10_000,
    });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
});
