import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import test from "node:test";

import {
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS,
  createFormationControlEventV1,
  createFormationControlLedgerSourcePinV1,
  createFormationControlLedgerV1,
} from "../src/outsider-formation-control-ledger-v1.js";
import {
  createOutcomeFormationTemporaryNetworkCoordinatorV1,
} from "../src/outsider-outcome-formation-temporary-network-coordinator-v1.js";
import {
  OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1,
  createTransactionSurfaceAdapterContractSourcePinV1,
  createTransactionSurfaceAdapterContractV1,
} from "../src/outsider-transaction-surface-adapter-contract-v1.js";
import {
  createPermissionedTransactionInterfaceSourceReplayV1,
} from "../src/outsider-permissioned-transaction-interface-source-replay-v1.js";
import {
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY,
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1,
  appendUserHeldMailboxShadowSpoolV1,
  createUserHeldMailboxShadowCapabilityV1,
  readUserHeldMailboxShadowSpoolV1,
} from "../src/outsider-user-held-mailbox-shadow-driver-v1.js";
import {
  OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_BOUNDARY,
  runOutcomeFormationShadowV1,
} from "../src/outsider-outcome-formation-shadow-runner-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256").update(label)
  .digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;

function mutable(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(mutable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, item]) => [key, mutable(item)]));
  }
  return value;
}

function contractCapability(capability) {
  const supported = capability === "PERMITTED_ROUTE_DISCOVERY"
    || capability === "ONE_USE_TENDER_DELIVERY"
    || capability === "STRICT_RESPONSE_OBSERVATION";
  return {
    capability,
    supported,
    transportProfileRefHashes: supported
      ? [OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1
        .transportProfileRefHash] : [],
    maximumSideEffectsPerTender:
      capability === "ONE_USE_TENDER_DELIVERY" ? 1 : 0,
  };
}

function adapterContractSource(transactionSource, label) {
  return {
    observedAt: transactionSource.observedAt,
    privateAdapterInstanceRefHash: h(`${label}:private-adapter-instance`),
    privateProjectionNonce: h(`${label}:adapter-private-projection`),
    adapterClosure: {
      adapterImplementationHash:
        transactionSource.adapterContext.adapterArtifactHash,
      adapterPackageProfileHash:
        transactionSource.adapterContext.adapterRevisionHash,
    },
    supportedTransportProfiles: [mutable(
      OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1)],
    inputContracts: {
      permission: {
        inputSchemaHash: h(`${label}:permission-input`),
        replayVerifierImplementationHash: h(`${label}:permission-verifier`),
        lifecycleHeadSchemaHash: h(`${label}:permission-head`),
        appendOnlyLifecycleRequired: true,
        currentGrantRequiredAtEachEffect: true,
        revocationFailClosed: true,
        callerDeclarationAloneSufficient: false,
      },
      credentialLease: {
        inputSchemaHash: h(`${label}:credential-input`),
        replayVerifierImplementationHash: h(`${label}:credential-verifier`),
        leaseReceiptSchemaHash: h(`${label}:credential-receipt`),
        finiteExpiryRequired: true,
        exactScopeRequired: true,
        revalidationAtEachCredentialedEffect: true,
        rawCredentialMaterialProjected: false,
        callerDeclarationAloneSufficient: false,
      },
      rights: {
        inputSchemaHash: h(`${label}:rights-input`),
        replayVerifierImplementationHash: h(`${label}:rights-verifier`),
        reviewReceiptSchemaHash: h(`${label}:rights-receipt`),
        sourceRevisionPinRequired: true,
        purposeAndJurisdictionBound: true,
        revocationReplayRequired: true,
        callerDeclarationAloneSufficient: false,
      },
      privacy: {
        inputSchemaHash: h(`${label}:privacy-input`),
        replayVerifierImplementationHash: h(`${label}:privacy-verifier`),
        reviewReceiptSchemaHash: h(`${label}:privacy-receipt`),
        dataMinimizationRequired: true,
        privateIdentifierProjectionAllowed: false,
        rawSourceProjectionAllowed: false,
        callerDeclarationAloneSufficient: false,
      },
    },
    oneUseControls: {
      oneTenderScopeRequired: true,
      idempotencyKeyHashRequired: true,
      idempotencyObservedBeforeEffectRequired: true,
      nonceHashRequired: true,
      nonceReservationBeforeEffectRequired: true,
      nonceSingleConsumptionRequired: true,
      consumedNonceReplayRejected: true,
      exactFormationDeadlineRequired: true,
      newFormationEffectsAfterDeadlineForbidden: true,
      lateResponseCannotFormCommitment: true,
      reservationRequiresExplicitBoundResponse: true,
      cancellationRequiresReservationBinding: true,
      revocationRequiresPermissionLifecycleBinding: true,
      cancellationAndRevocationIdempotent: true,
      terminalStateCannotReopen: true,
      standingCapacityInferred: false,
    },
    capabilityDeclarations:
      OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1.map(contractCapability),
    maximumAggregateSideEffectsPerTender: 1,
  };
}

function requestForSlot(slot, label) {
  const transactionSource = mutable(slot.mailbox.source);
  const transactionRecord
    = createPermissionedTransactionInterfaceSourceReplayV1(transactionSource);
  const contractSource = adapterContractSource(transactionSource, label);
  const contractPin = createTransactionSurfaceAdapterContractSourcePinV1(
    contractSource);
  const contractRecord = createTransactionSurfaceAdapterContractV1(
    contractSource);
  const outbound = JSON.parse(
    transactionSource.outboundMessageSourceBytes.toString("utf8")).payload;
  return {
    adapterContractReplay: {
      record: contractRecord,
      source: contractSource,
      expectedSourceHash: contractPin.sourceHash,
      expectedContractHash: contractRecord.contractHash,
    },
    permissionedTransactionReplay: {
      source: transactionSource,
      expectedReplayHash: transactionRecord.replayHash,
    },
    invocation: {
      invokedAt: transactionSource.observedAt,
      formationDeadline: transactionSource.tender.formationDeadline,
      oneUseNonceHash: outbound.transportOccurrenceNonceHash,
      idempotencyKeyHash: outbound.idempotencyKeyHash,
    },
    privateProjectionNonce: h(`${label}:request-private`).slice(7),
  };
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
    occurrenceNonceHash: h(`${label}:${eventType}:${events.length}`),
    payload,
  });
  events.push(event);
  return event;
}

function controlReplay(multi, requests, label, terminal = null) {
  const tender = multi.tender;
  const ledgerId = alias("ledger", label);
  const events = [];
  addControlEvent(events, tender, ledgerId, "FORMATION_OPENED",
    "2026-09-02T12:00:30.000Z",
    { formationDeadline: tender.formationDeadline }, label);
  for (let index = 0; index < requests.length; index += 1) {
    addControlEvent(events, tender, ledgerId, "NONCE_RESERVED",
      `2026-09-02T12:01:${String(index).padStart(2, "0")}.000Z`, {
        nonceHash: requests[index].invocation.oneUseNonceHash,
        purposeCode: "RESOURCE_TENDER",
        reservationExpiresAt: "2026-09-02T13:59:00.000Z",
      }, label);
  }
  for (let index = 0; index < requests.length; index += 1) {
    addControlEvent(events, tender, ledgerId, "IDEMPOTENCY_OBSERVED",
      `2026-09-02T12:02:${String(index).padStart(2, "0")}.000Z`, {
        idempotencyKeyHash: requests[index].invocation.idempotencyKeyHash,
        objectHash:
          requests[index].permissionedTransactionReplay.expectedReplayHash,
      }, label);
  }
  if (terminal === "CANCELLED") {
    addControlEvent(events, tender, ledgerId, "FORMATION_CANCELLED",
      "2026-09-02T13:20:00.000Z",
      { reasonCode: "PRINCIPAL_CANCELLED" }, label);
  } else if (terminal === "STAFF") {
    addControlEvent(events, tender, ledgerId,
      "OUTSIDER_STAFF_TOUCH_RECORDED", "2026-09-02T13:20:00.000Z",
      { staffActorRefHash: h(`${label}:private-staff`),
        touchClassCode: "MANUAL_SOURCING" }, label);
  }
  const source = {
    ledgerId,
    tender,
    expectedTenderHash: tender.tenderHash,
    observedAt: multi.observedAt,
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

function runnerFixture(label, options = {}) {
  const multi = createTemporaryNetworkV2MultiSlotFixture({
    fixtureLabel: label,
    observedAt: options.observedAt,
    formationDeadline: options.formationDeadline,
    knownRouteRevokedAt: options.knownRouteRevokedAt,
  });
  const requests = multi.slots.map((slot, index) =>
    requestForSlot(slot, `${label}:${index}`));
  const control = controlReplay(multi, requests, label,
    options.terminal ?? null);
  const coordinatorSource = {
    observedAt: multi.observedAt,
    slotReplays: mutable(multi.slotReplays),
    controlLedgerReplay: mutable(control),
    privateProjectionNonce: h(`${label}:coordinator-private`).slice(7),
  };
  const coordinator = createOutcomeFormationTemporaryNetworkCoordinatorV1(
    coordinatorSource);
  const capabilities = [
    createUserHeldMailboxShadowCapabilityV1(),
    createUserHeldMailboxShadowCapabilityV1(),
    createUserHeldMailboxShadowCapabilityV1(),
  ];
  const input = {
    shadowCapabilities: capabilities,
    shadowAppendRequests: requests,
    coordinatorReplay: {
      source: coordinatorSource,
      expectedCoordinatorHash: coordinator.coordinatorHash,
    },
    controlLedgerReplay: mutable(control),
    privateProjectionNonce: h(`${label}:runner-private`).slice(7),
  };
  return { multi, requests, control, coordinatorSource, coordinator,
    capabilities, input };
}

function assertEmpty(capability) {
  assert.throws(() => readUserHeldMailboxShadowSpoolV1(capability),
    /SHADOW_SPOOL_EMPTY/u);
}

function assertHold(value) {
  assert.equal(value.decisionState, "HOLD");
  assert.equal(value.authority, "NONE");
  assert.equal(value.actionReady, false);
  assert.equal(value.executable, false);
  assert.equal(value.resourceOwnerAuthorityEstablished, false);
  assert.equal(value.externalCapacityEstablished, false);
  assert.equal(value.capacityReserved, false);
  assert.equal(value.priceEstablished, false);
  assert.equal(value.guaranteeEstablished, false);
  assert.equal(value.settlementPermitted, false);
  assert.equal(value.atomicCommitmentGateSatisfied, false);
  assert.equal(value.userOutcomePromiseIssued, false);
  assert.equal(value.outsiderStaffTouchCount, null);
  assert.equal(value.staffTouchDenominatorComplete, false);
  assert.equal(value.zeroInternalOpsEstablished, false);
  assert.equal(value.oneUsePermissionGrantReuseAcrossSlotsPermitted, false);
  assert.equal(value.credentialsAcceptedOrHandled, false);
  assert.equal(value.credentialLeaseEstablished, false);
}

test("three exact mandatory requests append three shadow spools and nothing real",
  () => {
    const f = runnerFixture("shadow-runner-happy");
    f.input.shadowAppendRequests.reverse();
    f.input.shadowCapabilities.reverse();
    const value = runOutcomeFormationShadowV1(f.input);
    assert.equal(value.ok, true, value.error);
    assert.equal(value.shadowRunCompleted, true);
    assert.equal(value.resultState,
      "THREE_MODULE_PRIVATE_SHADOW_SPOOLS_APPENDED_HOLD");
    assert.equal(value.requestBijectionVerified, true);
    assert.equal(value.exactResourceEvidenceRecoveryBijectionVerified, true);
    assert.equal(value
      .allMandatorySourceDeclaredPathsCurrentAtCoordinatorObservedAtVerified,
    true);
    assert.equal(value
      .eachSlotSourceDeclaredResponseCurrentAtCoordinatorObservedAtVerified,
    true);
    assert.equal(value
      .eachSlotSourceDeclaredOwnerStandingCurrentAtCoordinatorObservedAtVerified,
    true);
    assert.equal(value.sourceDeclaredCurrentMintsAuthorityOrCapacity, false);
    assert.equal(value.threeDistinctAdapterInstanceAndSourcePinsVerified, true);
    assert.equal(value.oneUsePermissionIdsAndGenesisPinsDistinct, true);
    assert.equal(value.occurrenceCensus.appendInvocationCount, 3);
    assert.equal(value.occurrenceCensus.succeededAppendInvocationCount, 3);
    assert.equal(value.occurrenceCensus.failedAppendInvocationCount, 0);
    assert.equal(value.occurrenceCensus.shadowSpoolAppendOccurrenceCount, 3);
    assert.equal(value.occurrenceCensus.shadowSpoolDistinctObjectCount, 3);
    assert.equal(value.occurrenceCensus
      .appendedPermissionLifecycleOccurrenceCount > 0, true);
    assert.equal(value.occurrenceCensus
      .appendedOneUseResponseOccurrenceCount > 0, true);
    assert.equal(value.occurrenceCensus.appendedTransportOccurrenceCount > 0,
      true);
    assert.equal(value.occurrenceCensus.appendedInboundOccurrenceCount > 0,
      true);
    assert.equal(value.occurrenceCensus
      .appendedOwnerLifecycleOccurrenceCount > 0, true);
    assert.equal(value.occurrenceCensus.appendedRfc822SourceCount > 0, true);
    assert.equal(value.occurrenceCensus
      .appendedExactTransportSourceByteCount > 0, true);
    assert.equal(value.occurrenceCensus
      .allRunObservedShadowAppendOccurrencesPreserved, true);
    assert.equal(value.allMandatoryShadowAppendsObserved, true);
    assert.equal(value.partialShadowAppendOccurred, false);
    assert.equal(value.crossSpoolAtomicAppendEstablished, false);
    assert.equal(value.capabilityBearerStateProbed, true);
    assert.equal(value.validatedCapabilityBearerCountBeforeEffects, 3);
    assert.equal(value.historicalConsumedCapabilityBearerCount, 3);
    assert.equal(value.enabledCapabilityBearerCountAfterRun, 0);
    assert.equal(value.provenAuthorityCapabilityBearerCountAfterRun, 0);
    assert.deepEqual(value.enabledCapabilityTypes,
      [OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY]);
    assert.deepEqual(value.enabledCapabilityTypes,
      value.provenAuthorityCapabilityTypes);
    assert.equal(value.enabledCapabilitiesSubsetOfProvenAuthority, true);
    assert.equal(value.performedConsequenceReach,
      "THREE_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY");
    assert.equal(value.remainingEnabledConsequenceReach, "NONE");
    assert.equal(value.consequenceReach,
      "AT_MOST_THREE_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY");
    assert.deepEqual(value.mandatoryShadowSlots.map((slot) =>
      slot.requirementKind), ["RESOURCE", "EVIDENCE", "RECOVERY"]);
    for (const slot of value.mandatoryShadowSlots) {
      assert.equal(slot.appendState, "APPENDED");
      assert.equal(slot.shadowSpoolAppendOccurrenceCount, 1);
      assert.equal(slot.permissionLifecycleOccurrenceCount > 0, true);
      assert.equal(slot.oneUseResponseOccurrenceCount > 0, true);
      assert.equal(slot.transportOccurrenceCount > 0, true);
      assert.equal(slot.ownerLifecycleOccurrenceCount > 0, true);
      assert.equal(slot.rfc822SourceCount > 0, true);
      assert.equal(slot.exactTransportSourceByteCount > 0, true);
    }
    for (const capability of f.capabilities) {
      assert.equal(readUserHeldMailboxShadowSpoolV1(capability).mode,
        "SHADOW_ONLY");
    }
    assertHold(value);
  });

test("runner public result exposes one salted aggregate and no private handles",
  () => {
    const f = runnerFixture("shadow-runner-privacy");
    const value = runOutcomeFormationShadowV1(f.input);
    assert.equal(value.ok, true, value.error);
    assert.match(value.saltedPrivateRunCommitmentHash,
      /^sha256:[a-f0-9]{64}$/u);
    const publicText = JSON.stringify(value);
    const forbidden = [
      f.input.coordinatorReplay.expectedCoordinatorHash,
      f.input.controlLedgerReplay.expectedSourceHash,
      f.input.controlLedgerReplay.expectedLedgerHash,
      f.input.controlLedgerReplay.source.ledgerId,
    ];
    for (let index = 0; index < f.requests.length; index += 1) {
      const request = f.requests[index];
      const slot = f.multi.slots[index];
      const outboundPayload = JSON.parse(request.permissionedTransactionReplay
        .source.outboundMessageSourceBytes.toString("utf8")).payload;
      forbidden.push(request.adapterContractReplay.expectedSourceHash,
        request.adapterContractReplay.expectedContractHash,
        request.adapterContractReplay.source.privateAdapterInstanceRefHash,
        outboundPayload.permissionIdHash,
        outboundPayload.permissionGenesisSourceHash,
        request.permissionedTransactionReplay.expectedReplayHash,
        request.invocation.oneUseNonceHash,
        request.invocation.idempotencyKeyHash,
        slot.transactionReplay.routeObjectHash,
        slot.transactionReplay.currentCandidateHash,
        slot.mailbox.privateScope.counterpartyMailboxRefHash,
        slot.mailbox.privateScope.threadRefHash,
        readUserHeldMailboxShadowSpoolV1(f.capabilities[index]).receipt
          .receiptHash);
    }
    for (const handle of forbidden) {
      assert.equal(publicText.includes(handle), false, handle);
    }
    assert.equal(value.individualPrivateSourceReplayHashesProjected, false);
    assert.equal(value.perSlotRouteCandidateTransactionOrReceiptHashesProjected,
      false);
    assert.equal(value.capabilityHandlesPubliclyProjected, false);
  });

test("request or raw-control splice rejects before any capability consumption",
  () => {
    const f = runnerFixture("shadow-runner-splice");
    const other = runnerFixture("shadow-runner-splice-other");
    f.input.shadowAppendRequests[2] = mutable(other.requests[2]);
    const requestSplice = runOutcomeFormationShadowV1(f.input);
    assert.equal(requestSplice.ok, false);
    assert.equal(requestSplice.shadowSpoolAppendOccurrenceCount, 0);
    for (const capability of f.capabilities) assertEmpty(capability);

    const control = runnerFixture("shadow-runner-control-splice");
    control.input.controlLedgerReplay.expectedSourceHash = h("wrong-control");
    const controlSplice = runOutcomeFormationShadowV1(control.input);
    assert.equal(controlSplice.ok, false);
    assert.equal(controlSplice.shadowSpoolAppendOccurrenceCount, 0);
    for (const capability of control.capabilities) assertEmpty(capability);

    const missingBinding = runnerFixture("shadow-runner-control-binding");
    const incompleteControl = controlReplay(missingBinding.multi,
      missingBinding.requests.slice(0, 2),
      "shadow-runner-control-binding-incomplete");
    missingBinding.input.coordinatorReplay.source.controlLedgerReplay
      = mutable(incompleteControl);
    missingBinding.input.controlLedgerReplay = mutable(incompleteControl);
    const rebuiltCoordinator
      = createOutcomeFormationTemporaryNetworkCoordinatorV1(
        missingBinding.input.coordinatorReplay.source);
    missingBinding.input.coordinatorReplay.expectedCoordinatorHash
      = rebuiltCoordinator.coordinatorHash;
    const missingControlBinding = runOutcomeFormationShadowV1(
      missingBinding.input);
    assert.equal(missingControlBinding.ok, false);
    assert.match(missingControlBinding.error,
      /REQUEST_ONE_USE_CONTROL_LEDGER_BINDING_INVALID/u);
    assert.equal(missingControlBinding.shadowSpoolAppendOccurrenceCount, 0);
    for (const capability of missingBinding.capabilities) {
      assertEmpty(capability);
    }
  });

test("one-use adapter instance and exact source cannot span three slot effects",
  () => {
    const f = runnerFixture("shadow-runner-adapter-instance-reuse");
    f.input.shadowAppendRequests[1].adapterContractReplay = mutable(
      f.input.shadowAppendRequests[0].adapterContractReplay);
    f.input.shadowAppendRequests[2].adapterContractReplay = mutable(
      f.input.shadowAppendRequests[0].adapterContractReplay);
    const value = runOutcomeFormationShadowV1(f.input);
    assert.equal(value.ok, false);
    assert.match(value.error,
      /ADAPTER_INSTANCE_OR_SOURCE_REUSED_ACROSS_MANDATORY_SLOTS/u);
    assert.equal(value.shadowSpoolAppendOccurrenceCount, 0);
    assert.equal(value.performedConsequenceReach, "NONE");
    assert.equal(value.capabilityBearerStateProbed, false);
    for (const capability of f.capabilities) assertEmpty(capability);
  });

test("staff, cancellation, and deadline gates make zero append invocations",
  () => {
    const cases = [
      ["STAFF", {}, /CONTROL_STAFF_TOUCH_DISQUALIFIED/u],
      ["CANCELLED", {}, /CONTROL_CANCELLED/u],
      [null, { observedAt: "2026-09-02T14:00:00.000Z",
        formationDeadline: "2026-09-02T14:00:00.000Z" },
      /FORMATION_DEADLINE_REACHED/u],
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const [terminal, times, errorPattern] = cases[index];
      const f = runnerFixture(`shadow-runner-terminal-${index}`, {
        terminal, ...times,
      });
      const value = runOutcomeFormationShadowV1(f.input);
      assert.equal(value.ok, false);
      assert.match(value.error, errorPattern);
      assert.equal(value.controlGate
        .terminalOrDeadlinePreventedAllAppendAttempts, true);
      assert.equal(value.occurrenceCensus.appendInvocationCount, 0);
      assert.equal(value.occurrenceCensus.shadowSpoolAppendOccurrenceCount, 0);
      assert.equal(value.performedConsequenceReach, "NONE");
      assert.equal(value.capabilityBearerStateProbed, false);
      assert.equal(value.enabledCapabilityBearerCountAfterRun, null);
      assert.equal(value.remainingEnabledConsequenceReach,
        "CAPABILITY_STATE_NOT_PROBED");
      for (const capability of f.capabilities) assertEmpty(capability);
      assertHold(value);
    }
  });

test("known route revocation before runner observation blocks every capability",
  () => {
    const f = runnerFixture("shadow-runner-known-route-revoked", {
      knownRouteRevokedAt: "2026-09-02T13:00:00.000Z",
    });
    assert.equal(f.coordinator.formationAssessment
      .allMandatorySourceDeclaredPathsCurrent, false);
    assert.equal(f.coordinator.atomicCommitmentGate
      .allMandatorySourceDeclaredPathsCurrent, false);
    assert.deepEqual(f.coordinator.mandatoryNetworkCoverage.slots.map(
      (slot) => slot.sourceDeclaredPathCurrent), [false, false, false]);
    const value = runOutcomeFormationShadowV1(f.input);
    assert.equal(value.ok, false);
    assert.match(value.error,
      /MANDATORY_SOURCE_DECLARED_PATHS_NOT_CURRENT/u);
    assert.equal(value.shadowSpoolAppendOccurrenceCount, 0);
    assert.equal(value.capabilityBearerStateProbed, false);
    assert.equal(value.performedConsequenceReach, "NONE");
    for (const capability of f.capabilities) assertEmpty(capability);
    assertHold(value);
  });

test("append-time nonce collision preserves an explicit partial shadow history",
  () => {
    const f = runnerFixture("shadow-runner-partial");
    appendUserHeldMailboxShadowSpoolV1(
      createUserHeldMailboxShadowCapabilityV1(), f.requests[1]);
    const value = runOutcomeFormationShadowV1(f.input);
    assert.equal(value.ok, false);
    assert.match(value.error, /ONE_USE_NONCE_ALREADY_CONSUMED/u);
    assert.equal(value.resultState,
      "PARTIAL_SHADOW_SPOOL_APPEND_HISTORY_HOLD");
    assert.equal(value.occurrenceCensus.appendInvocationCount, 2);
    assert.equal(value.occurrenceCensus.succeededAppendInvocationCount, 1);
    assert.equal(value.occurrenceCensus.failedAppendInvocationCount, 1);
    assert.equal(value.occurrenceCensus.unattemptedAppendCount, 1);
    assert.equal(value.occurrenceCensus.shadowSpoolAppendOccurrenceCount, 1);
    assert.equal(value.occurrenceCensus
      .appendedPermissionLifecycleOccurrenceCount,
    value.mandatoryShadowSlots[0].permissionLifecycleOccurrenceCount);
    assert.equal(value.occurrenceCensus.appendedTransportOccurrenceCount,
      value.mandatoryShadowSlots[0].transportOccurrenceCount);
    assert.equal(value.occurrenceCensus.appendedOwnerLifecycleOccurrenceCount,
      value.mandatoryShadowSlots[0].ownerLifecycleOccurrenceCount);
    assert.equal(value.partialShadowAppendOccurred, true);
    assert.equal(value.partialShadowAppendHistoryPreserved, true);
    assert.equal(value.partialShadowAppendCanMintCommitment, false);
    assert.equal(value.crossSpoolAtomicAppendEstablished, false);
    assert.equal(value.atomicCommitmentGateSatisfied, false);
    assert.equal(value.userOutcomePromiseIssued, false);
    assert.equal(value.mandatoryShadowSlots[0].appendState, "APPENDED");
    assert.equal(value.mandatoryShadowSlots[1].appendState, "APPEND_REJECTED");
    assert.equal(value.mandatoryShadowSlots[2].appendState, "NOT_ATTEMPTED");
    assert.equal(value.capabilityBearerStateProbed, true);
    assert.equal(value.validatedCapabilityBearerCountBeforeEffects, 3);
    assert.equal(value.historicalConsumedCapabilityBearerCount, 1);
    assert.equal(value.enabledCapabilityBearerCountAfterRun, 2);
    assert.equal(value.provenAuthorityCapabilityBearerCountAfterRun, 2);
    assert.equal(value.performedConsequenceReach,
      "PARTIAL_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY");
    assert.equal(value.remainingEnabledConsequenceReach,
      "REMAINING_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY");
    assert.equal(readUserHeldMailboxShadowSpoolV1(f.capabilities[0]).mode,
      "SHADOW_ONLY");
    assertEmpty(f.capabilities[1]);
    assertEmpty(f.capabilities[2]);
    assertHold(value);
  });

test("capability and hostile aggregate preflight invokes no traps or effects",
  () => {
    const f = runnerFixture("shadow-runner-hostile");
    f.input.shadowCapabilities[2] = f.input.shadowCapabilities[0];
    const duplicate = runOutcomeFormationShadowV1(f.input);
    assert.equal(duplicate.ok, false);
    assert.match(duplicate.error, /CAPABILITIES_NOT_DISTINCT/u);
    for (const capability of f.capabilities) assertEmpty(capability);

    const hostile = runnerFixture("shadow-runner-proxy");
    let trapCount = 0;
    const proxy = new Proxy(hostile.input, {
      get() { trapCount += 1; throw new Error("get trap must not run"); },
      ownKeys() { trapCount += 1; throw new Error("ownKeys trap must not run"); },
    });
    const rejected = runOutcomeFormationShadowV1(proxy);
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /INPUT_OBJECT_REQUIRED/u);
    assert.equal(trapCount, 0);
    for (const capability of hostile.capabilities) assertEmpty(capability);
  });

test("oversized aggregate inputs fail before per-element or byte descriptors",
  () => {
    const arrayFixture = runnerFixture("shadow-runner-array-budget");
    arrayFixture.input.shadowAppendRequests
      = new Array(1_000_001).fill(null);
    const arrayResult = runOutcomeFormationShadowV1(arrayFixture.input);
    assert.equal(arrayResult.ok, false);
    assert.match(arrayResult.error, /ARRAY_BUDGET_EXCEEDED/u);
    for (const capability of arrayFixture.capabilities) assertEmpty(capability);

    const bufferFixture = runnerFixture("shadow-runner-buffer-budget");
    let accessorCount = 0;
    const oversized = Buffer.alloc(1024 * 1024 + 1, 0x61);
    Object.defineProperty(oversized, "canary", {
      configurable: true,
      enumerable: true,
      get() {
        accessorCount += 1;
        throw new Error("oversized byte canary must not run");
      },
    });
    bufferFixture.input.shadowAppendRequests[0]
      .permissionedTransactionReplay.source.outboundMessageSourceBytes
        = oversized;
    const bufferResult = runOutcomeFormationShadowV1(bufferFixture.input);
    assert.equal(bufferResult.ok, false);
    assert.match(bufferResult.error, /BUFFER_TOO_LARGE/u);
    assert.equal(accessorCount, 0);
    for (const capability of bufferFixture.capabilities) {
      assertEmpty(capability);
    }
  });

test("dependency intrinsic poisoning is rejected with zero callback traps",
  () => {
    const f = runnerFixture("shadow-runner-intrinsic-poison");
    const publicKey = createPublicKey({
      key: Buffer.from(`302a300506032b6570032100${"00".repeat(32)}`, "hex"),
      format: "der",
      type: "spki",
    });
    const cases = [
      [Array.prototype, Symbol.iterator, "ARRAY_ITERATOR"],
      [Array.prototype, "push", "ARRAY_PUSH"],
      [Set.prototype, "add", "SET_ADD"],
      [RegExp.prototype, "exec", "REGEXP_EXEC"],
      [Object.getPrototypeOf(publicKey), "export", "PUBLIC_KEY_EXPORT"],
    ];
    let trapCount = 0;
    for (let index = 0; index < cases.length; index += 1) {
      const [owner, key, label] = cases[index];
      const original = Object.getOwnPropertyDescriptor(owner, key);
      let value;
      try {
        Object.defineProperty(owner, key, {
          configurable: original.configurable,
          enumerable: original.enumerable,
          get() {
            trapCount += 1;
            throw new Error("dependency getter must not run");
          },
        });
        value = runOutcomeFormationShadowV1(f.input);
      } finally {
        Object.defineProperty(owner, key, original);
      }
      assert.equal(value.ok, false);
      assert.match(value.error,
        new RegExp(`DEPENDENCY_INTRINSIC_CHANGED_${label}`, "u"));
      for (const capability of f.capabilities) assertEmpty(capability);
    }
    assert.equal(trapCount, 0);
  });

test("Error Symbol.hasInstance poisoning cannot enter capability probing",
  () => {
    const f = runnerFixture("shadow-runner-has-instance-poison");
    const attackerCapability = createUserHeldMailboxShadowCapabilityV1();
    let trapCount = 0;
    let value;
    try {
      Object.defineProperty(Error, Symbol.hasInstance, {
        configurable: true,
        enumerable: false,
        get() {
          trapCount += 1;
          appendUserHeldMailboxShadowSpoolV1(attackerCapability,
            f.requests[0]);
          return Function.prototype[Symbol.hasInstance];
        },
      });
      value = runOutcomeFormationShadowV1(f.input);
    } finally {
      delete Error[Symbol.hasInstance];
    }
    assert.equal(value.ok, false);
    assert.match(value.error, /DEPENDENCY_CONSTRUCTOR_CHANGED_ERROR/u);
    assert.equal(value.shadowSpoolAppendOccurrenceCount, 0);
    assert.equal(value.capabilityBearerStateProbed, false);
    assert.equal(trapCount, 0);
    assertEmpty(attackerCapability);
    for (const capability of f.capabilities) assertEmpty(capability);
  });

test("boundary is shadow-only and never claims outcome or economic authority",
  () => {
    const boundary = OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_BOUNDARY;
    assert.deepEqual(boundary.mandatoryRequirementKinds,
      ["RESOURCE", "EVIDENCE", "RECOVERY"]);
    assert.equal(boundary.exactlyThreeDistinctModuleIssuedCapabilitiesRequired,
      true);
    assert.equal(boundary.threeDistinctAdapterInstanceAndSourcePinsRequired,
      true);
    assert.equal(boundary.oneUsePermissionGrantReuseAcrossSlotsPermitted,
      false);
    assert.equal(boundary.credentialsAcceptedOrHandled, false);
    assert.equal(boundary.credentialLeaseEstablished, false);
    assert.equal(boundary
      .capabilityBearerAccountingSeparatesHistoricalEffectsFromRemainingBearers,
    true);
    assert.equal(boundary.terminalControlCheckedBeforeAnyAppendAttempt, true);
    assert.equal(boundary.crossSpoolAtomicAppendEstablished, false);
    assert.equal(boundary.partialShadowAppendHistoryPreserved, true);
    assert.equal(boundary.partialShadowAppendCanMintCommitment, false);
    assert.equal(boundary.networkInterfacePresent, false);
    assert.equal(boundary.callbackInterfacePresent, false);
    assert.equal(boundary.ambientCredentialInterfacePresent, false);
    assert.equal(boundary.staffTouchDenominatorComplete, false);
    assert.equal(boundary.zeroInternalOpsEstablished, false);
    assert.equal(boundary.resourceOwnerAuthorityEstablished, false);
    assert.equal(boundary.capacityReserved, false);
    assert.equal(boundary.priceEstablished, false);
    assert.equal(boundary.guaranteeEstablished, false);
    assert.equal(boundary.settlementPermitted, false);
    assert.equal(boundary.actionReady, false);
    assert.equal(boundary.executable, false);
  });
