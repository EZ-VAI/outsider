import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS,
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES,
  createFormationControlEventV1,
  createFormationControlLedgerSourcePinV1,
  createFormationControlLedgerV1,
} from "../src/outsider-formation-control-ledger-v1.js";
import {
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_BOUNDARY,
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_LIMITS,
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_STATES,
  createOutcomeFormationTemporaryNetworkCoordinatorV1,
  verifyOutcomeFormationTemporaryNetworkCoordinatorV1,
} from "../src/outsider-outcome-formation-temporary-network-coordinator-v1.js";
import { OUTSIDER_OUTCOME_TENDER_V1_LIMITS }
  from "../src/outsider-outcome-tender-v1.js";
import {
  createTemporaryNetworkV2MultiSlotFixture,
} from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label).digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;

function mutable(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(mutable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, mutable(item)]));
  }
  return value;
}

function addControlEvent(events, tender, ledgerId, eventType, recordedAt,
  payload, label) {
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
      : events.at(-1).occurrenceHash,
    recordedAt,
    occurrenceNonceHash: h(`coordinator-control:${label}`),
    payload,
  });
  events.push(event);
  return event;
}

function controlReplay(fixture, options = {}) {
  const tender = fixture.tender;
  const ledgerId = alias("ledger", options.label ?? "coordinator");
  const events = [];
  addControlEvent(events, tender, ledgerId, "FORMATION_OPENED",
    "2026-09-02T12:00:30.000Z",
    { formationDeadline: tender.formationDeadline }, "open");
  const terminal = options.terminal ?? null;
  if (terminal === "CANCELLED") {
    addControlEvent(events, tender, ledgerId, "FORMATION_CANCELLED",
      "2026-09-02T13:20:00.000Z",
      { reasonCode: "PRINCIPAL_CANCELLED" }, "cancel");
  } else if (terminal === "REVOKED" || terminal === "STAFF_AFTER_REVOKE") {
    addControlEvent(events, tender, ledgerId, "FORMATION_REVOKED",
      "2026-09-02T13:20:00.000Z",
      { reasonCode: "DELEGATION_REVOKED" }, "revoke");
  }
  if (terminal === "STAFF" || terminal === "STAFF_AFTER_REVOKE") {
    addControlEvent(events, tender, ledgerId,
      "OUTSIDER_STAFF_TOUCH_RECORDED",
      terminal === "STAFF_AFTER_REVOKE"
        ? "2026-09-02T13:21:00.000Z" : "2026-09-02T13:20:00.000Z",
      { staffActorRefHash: h("private-staff-actor-canary"),
        touchClassCode: "MANUAL_SOURCING" }, "staff");
  }
  const source = {
    ledgerId,
    tender,
    expectedTenderHash: tender.tenderHash,
    observedAt: fixture.observedAt,
    events,
    expectedOccurrenceCount: events.length,
    expectedHeadHash: events.at(-1).occurrenceHash,
  };
  const record = createFormationControlLedgerV1(source);
  return {
    record,
    source,
    expectedSourceHash: createFormationControlLedgerSourcePinV1(source),
    expectedLedgerHash: record.ledgerHash,
  };
}

function coordinatorFixture(options = {}) {
  const multi = createTemporaryNetworkV2MultiSlotFixture(options);
  const source = {
    observedAt: multi.observedAt,
    slotReplays: multi.slotReplays,
    controlLedgerReplay: controlReplay(multi, options.control ?? {}),
    privateProjectionNonce: h(options.privateNonceLabel
      ?? "coordinator-private-projection").slice(7),
  };
  return { multi, source };
}

function assertFixedHold(value) {
  assert.equal(value.decisionState, "HOLD");
  assert.equal(value.authority, "NONE");
  assert.equal(value.actionReady, false);
  assert.equal(value.executable, false);
  assert.equal(value.independentResourceOwnerTrustRootEstablished, false);
  assert.equal(value.externalCapacityEstablished, false);
  assert.equal(value.capacityReserved, false);
  assert.equal(value.authorityEstablished, false);
  assert.equal(value.sendAuthorized, false);
  assert.equal(value.providerContactPerformed, false);
  assert.equal(value.liveSearchingPerformed, false);
  assert.equal(value.liveIoPerformed, false);
  assert.equal(value.pricingPermitted, false);
  assert.equal(value.guaranteeEstablished, false);
  assert.equal(value.settlementPermitted, false);
  assert.equal(value.price, null);
  assert.equal(value.guarantee, null);
  assert.equal(value.settlement, null);
  assert.equal(value.authorityBoundary.enabledCapabilityCount, 0);
  assert.equal(value.authorityBoundary.provenAuthorityCount, 0);
  assert.equal(value.authorityBoundary
    .enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(value.consequenceReach, "NONE");
}

test("three mandatory transaction slots form an exact shared-predecessor bijection and remain HOLD",
  () => {
    const fixture = coordinatorFixture();
    const value = createOutcomeFormationTemporaryNetworkCoordinatorV1(
      fixture.source);
    const checked = verifyOutcomeFormationTemporaryNetworkCoordinatorV1(
      fixture.source, value.coordinatorHash);

    assert.equal(value.ok, true);
    assert.equal(checked.ok, true);
    assert.equal(value.disposition,
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_STATES
        .forming);
    assert.equal(value.mandatoryNetworkCoverage.mandatoryRequirementCount, 3);
    assert.equal(value.mandatoryNetworkCoverage.transactionSlotCount, 3);
    assert.equal(value.mandatoryNetworkCoverage.selectedV1RouteResponseCount, 3);
    assert.equal(value.mandatoryNetworkCoverage.resourceRequirementSlotCount, 1);
    assert.equal(value.mandatoryNetworkCoverage.evidenceRequirementSlotCount, 1);
    assert.equal(value.mandatoryNetworkCoverage.recoveryRequirementSlotCount, 1);
    assert.equal(value.mandatoryNetworkCoverage
      .mandatoryRequirementToV2SlotToSelectedV1RowBijectionVerified, true);
    assert.equal(value.lineage.sharedPredecessorSourceRebuiltAndPinned, true);
    assert.equal(value.control.exactRawControlLedgerSourceRebuiltAndPinned, true);
    assert.equal(value.zeroInternalOpsBoundary.humanQueueCreated, false);
    assertFixedHold(value);
  });

test("slot order is semantically irrelevant but raw-source and output pins are exact",
  () => {
    const fixture = coordinatorFixture();
    const value = createOutcomeFormationTemporaryNetworkCoordinatorV1(
      fixture.source);
    const reordered = mutable(fixture.source);
    reordered.slotReplays.reverse();
    const sameValue = createOutcomeFormationTemporaryNetworkCoordinatorV1(
      reordered);
    assert.equal(sameValue.coordinatorHash, value.coordinatorHash);

    const wrongPin = verifyOutcomeFormationTemporaryNetworkCoordinatorV1(
      fixture.source, h("wrong-coordinator-pin"));
    assert.equal(wrongPin.ok, false);
    assert.equal(wrongPin.actionReady, false);
    const outputOnly = verifyOutcomeFormationTemporaryNetworkCoordinatorV1(
      value, value.coordinatorHash);
    assert.equal(outputOnly.ok, false);
  });

test("missing, duplicate, or cross-predecessor slots cannot satisfy total mandatory coverage",
  () => {
    const fixture = coordinatorFixture();
    const missing = mutable(fixture.source);
    missing.slotReplays.pop();
    assert.throws(() =>
      createOutcomeFormationTemporaryNetworkCoordinatorV1(missing),
    /SLOT_REPLAYS_COUNT_INVALID|SLOT_COUNT_NOT_MANDATORY_REQUIREMENT_COUNT/u);

    const duplicate = mutable(fixture.source);
    duplicate.slotReplays[2] = mutable(duplicate.slotReplays[0]);
    assert.throws(() =>
      createOutcomeFormationTemporaryNetworkCoordinatorV1(duplicate),
    /SLOT_NOT_EXACTLY_ONE_MANDATORY_REQUIREMENT|DUPLICATE_REQUIREMENT/u);

    const other = coordinatorFixture({ fixtureLabel: "other-coordinator" });
    const spliced = mutable(fixture.source);
    spliced.slotReplays[2] = mutable(other.source.slotReplays[2]);
    assert.throws(() =>
      createOutcomeFormationTemporaryNetworkCoordinatorV1(spliced),
    /SLOTS_DO_NOT_SHARE_EXACT_V1_PREDECESSOR|SLOT_TENDER_TYPED_GRAPH/u);
  });

test("control precedence is staff touch, revocation, cancellation, then deadline; none creates a human queue",
  () => {
    const cases = [
      ["CANCELLED", OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.cancelled],
      ["REVOKED", OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.revoked],
      ["STAFF", OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.staffTouch],
      ["STAFF_AFTER_REVOKE",
        OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.staffTouch],
    ];
    for (const [terminal, expectedState] of cases) {
      const fixture = coordinatorFixture({ control: { terminal,
        label: terminal.toLowerCase() } });
      const value = createOutcomeFormationTemporaryNetworkCoordinatorV1(
        fixture.source);
      assert.equal(value.disposition,
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_STATES
          .declined);
      assert.equal(value.control.controlState, expectedState);
      assert.equal(value.control.permanentlyDisqualifiedFromCommitment, true);
      assert.equal(value.zeroInternalOpsBoundary.humanQueueCreated, false);
      assert.equal(value.zeroInternalOpsBoundary.internalHumanFallbackPermitted,
        false);
      assertFixedHold(value);
    }
  });

test("at the formation deadline an incomplete network declines instead of entering a human queue",
  () => {
    const fixture = coordinatorFixture({
      observedAt: "2026-09-02T14:00:00.000Z",
      formationDeadline: "2026-09-02T14:00:00.000Z",
    });
    const value = createOutcomeFormationTemporaryNetworkCoordinatorV1(
      fixture.source);
    assert.equal(value.deadlineReached, true);
    assert.equal(value.disposition, "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(value.control.controlState,
      OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.deadlineDecline);
    assert.equal(value.zeroInternalOpsBoundary.declineInsteadOfHumanQueue, true);
    assert.equal(value.zeroInternalOpsBoundary.humanQueueCreated, false);
    assertFixedHold(value);
  });

test("the full North Star atomic gate remains explicit and every unproven premise remains false",
  () => {
    const value = createOutcomeFormationTemporaryNetworkCoordinatorV1(
      coordinatorFixture().source);
    const gate = value.atomicCommitmentGate;
    assert.equal(gate.exactMandatoryRequirementSlotBijectionReplayed, true);
    for (const field of [
      "resourceOwnerAuthorityEstablished",
      "primaryExecutionCapacityReserved",
      "recoveryCapacityReserved",
      "independentWitnessCapacityReserved",
      "independentWitnessIndependenceEstablished",
      "maximumLossBoundEstablished",
      "fundingAndCapitalSufficiencyEstablished",
      "lawfulTransactionAndPaymentPathEstablished",
      "trustedTimeEstablished",
      "externalNonOmissionEstablished",
      "externalNonEquivocationEstablished",
      "zeroStaffTouchCompletenessEstablished",
      "transactionDriverPresent",
      "authorityAndActionAdmissionEstablished",
      "atomicCommitmentGateSatisfied",
      "partialPromisePermitted",
      "manualOverridePermitted",
      "userOutcomePromiseIssued",
    ]) assert.equal(gate[field], false, field);
  });

test("private transaction and control identifiers are not projected as direct or per-source handles",
  () => {
    const fixture = coordinatorFixture({ control: { terminal: "STAFF" } });
    const value = createOutcomeFormationTemporaryNetworkCoordinatorV1(
      fixture.source);
    const serialized = JSON.stringify(value);
    const forbidden = [
      fixture.source.controlLedgerReplay.source.ledgerId,
      fixture.source.controlLedgerReplay.source.expectedHeadHash,
      fixture.source.controlLedgerReplay.expectedSourceHash,
      fixture.source.controlLedgerReplay.expectedLedgerHash,
      h("private-staff-actor-canary"),
    ];
    for (const slot of fixture.multi.slots) {
      forbidden.push(slot.expectedTemporaryNetworkHash);
      const transaction = slot.source.transactionInterfaceReplay.source;
      forbidden.push(transaction.adapterContext.sourceSystemId);
      forbidden.push(transaction.adapterContext.expectedSourceKeyId);
      forbidden.push(slot.mailbox.privateScope.counterpartyMailboxRefHash);
      forbidden.push(slot.mailbox.privateScope.threadRefHash);
    }
    for (const canary of forbidden) {
      assert.equal(serialized.includes(canary), false, canary);
    }
    assert.match(value.replayBoundary.privateDependencyBundleCommitmentHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.equal(value.replayBoundary.individualPrivateSourceReplayHashesProjected,
      false);
  });

test("hostile aggregate shapes fail before dependency replay",
  () => {
    const fixture = coordinatorFixture();
    assert.throws(() => createOutcomeFormationTemporaryNetworkCoordinatorV1(
      new Proxy(fixture.source, {})), /PROXY_FORBIDDEN/u);

    const accessor = mutable(fixture.source);
    Object.defineProperty(accessor, "observedAt", { enumerable: true,
      get() { throw new Error("getter executed"); } });
    assert.throws(() => createOutcomeFormationTemporaryNetworkCoordinatorV1(
      accessor), /ACCESSOR_FORBIDDEN/u);

    const sparse = mutable(fixture.source);
    sparse.slotReplays = new Array(3);
    sparse.slotReplays[0] = mutable(fixture.source.slotReplays[0]);
    assert.throws(() => createOutcomeFormationTemporaryNetworkCoordinatorV1(
      sparse), /SPARSE_OR_DECORATED_ARRAY_FORBIDDEN/u);

    const nonEnumerable = mutable(fixture.source);
    Object.defineProperty(nonEnumerable, "extra", { value: true,
      enumerable: false });
    assert.throws(() => createOutcomeFormationTemporaryNetworkCoordinatorV1(
      nonEnumerable), /NON_ENUMERABLE_FIELD_FORBIDDEN/u);

    const decorated = mutable(fixture.source);
    const buffer = decorated.slotReplays[0].source.transactionInterfaceReplay
      .source.outboundRfc822Bytes;
    Object.defineProperty(buffer, "length", { configurable: true,
      get() { return 1; } });
    assert.throws(() => createOutcomeFormationTemporaryNetworkCoordinatorV1(
      decorated), /DECORATED_SOURCE_BUFFER_FORBIDDEN/u);
  });

test("boundary states the no-I/O, no-human-queue, no-authority contract",
  () => {
    const boundary
      = OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_BOUNDARY;
    assert.equal(boundary.oneRawReplayedV2SlotPerMandatoryRequirement, true);
    assert.equal(boundary.selectedV1RowBijectionRequired, true);
    assert.equal(boundary.liveIoPerformed, false);
    assert.equal(boundary.liveSearchingPerformed, false);
    assert.equal(boundary.providerRegistrationRequired, false);
    assert.equal(boundary.internalHumanFallbackPermitted, false);
    assert.equal(boundary.humanQueueCreated, false);
    assert.equal(boundary.authorityEstablished, false);
    assert.equal(boundary.capacityReserved, false);
    assert.equal(boundary.priceEstablished, false);
    assert.equal(boundary.guaranteeEstablished, false);
    assert.equal(boundary.settlementPermitted, false);
  });

test("coordinator slot cardinality covers the complete frozen tender requirement vocabulary",
  () => {
    const tenderMaximum
      = OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumResourceRequirements
        + OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumEvidenceRequirements
        + OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumRecoveryRequirements;
    assert.equal(tenderMaximum, 160);
    assert.equal(
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_LIMITS
        .maximumTransactionSlots,
      tenderMaximum);
  });
