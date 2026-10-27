import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createAtomicBuyerNativeTemporaryNetworkCoordinatorV1,
  issueCurrentUserTransactionAuthorityV1,
  issuePrincipalPaymentAndLossAuthorizationV1,
  pinAtomicBuyerNativeFrozenArtifactV1,
} from "../src/outsider-atomic-buyer-native-temporary-network-coordinator-v1.js";
import {
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";

const NOW = "2026-09-04T12:00:00.000Z";
const SOURCE_EXPIRY = "2026-09-04T13:00:00.000Z";
const FORMATION_EXPIRY = "2026-09-04T14:00:00.000Z";
const AUTHORITY_EXPIRY = "2026-09-04T15:00:00.000Z";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-atomic-network-v1-")));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function providerResponse(role, operation, behavior) {
  let sourceState;
  let sourceRecordClass;
  if (operation === "QUOTE") {
    sourceState = "QUOTE_AVAILABLE";
    sourceRecordClass = "PUBLISHED_INVENTORY";
  } else if (operation === "HOLD") {
    sourceState = behavior.cart ? "CART_READY" : "HOLD_ACKNOWLEDGED";
    sourceRecordClass = "CHECKOUT_RECEIPT";
  } else if (operation === "STATUS") {
    if (behavior.cart && !behavior.executionStarted) sourceState = "CART_READY";
    else if (role === "PRIMARY" && behavior.primaryFails
      && behavior.executionStarted) sourceState = "FAILED";
    else if (behavior.executionStarted) sourceState = "FULFILLED";
    else sourceState = "STATE_OBSERVED";
    sourceRecordClass = "STATUS_RECEIPT";
  } else if (operation === "RESERVE") {
    sourceState = behavior.reserveRejected ? "REJECTED"
      : "RESERVATION_ACKNOWLEDGED";
    sourceRecordClass = "RESERVATION_RECEIPT";
  } else if (operation === "COMMIT") {
    behavior.executionStarted = true;
    sourceState = "COMMIT_ACKNOWLEDGED";
    sourceRecordClass = "CHECKOUT_RECEIPT";
  } else if (operation === "RECOVER") {
    behavior.executionStarted = true;
    sourceState = "RECOVERY_COMMIT_ACKNOWLEDGED";
    sourceRecordClass = "RECOVERY_RECEIPT";
  } else {
    sourceState = "CANCELLATION_ACKNOWLEDGED";
    sourceRecordClass = "CANCELLATION_RECEIPT";
  }
  return {
    sourceBytes: Buffer.from(`${role}:${operation}:${sourceState}`, "utf8"),
    sourceState,
    sourceExpiresAt: ["QUOTE", "HOLD", "RESERVE"].includes(operation)
      || sourceState === "CART_READY" ? SOURCE_EXPIRY : null,
    sourceRecordClass,
  };
}

function makeCapability(role, behavior, calls) {
  const operations = role === "PRIMARY"
    ? ["QUOTE", "HOLD", "STATUS", "RESERVE", "COMMIT", "CANCEL"]
    : role === "RECOVERY"
      ? ["QUOTE", "HOLD", "STATUS", "RESERVE", "RECOVER", "CANCEL"]
      : ["QUOTE", "HOLD", "STATUS", "RESERVE", "CANCEL"];
  const metadata = {
    capabilityRefHash: h(`${role}:capability`),
    accountRefHash: h(`${role}:account`),
    nodeRefHash: h(`${role}:node`),
    issuedAt: "2026-09-04T11:00:00.000Z",
    expiresAt: AUTHORITY_EXPIRY,
    supportedOperations: operations,
  };
  return issueBuyerNativeTransactionAccountCapabilityV1(metadata, {
    async requestImpl(request) {
      calls.push({ role, operation: request.operation,
        triggerOccurrenceHash: request.triggerOccurrenceHash });
      return providerResponse(role, request.operation, behavior);
    },
    async revalidateImpl(input) {
      return { active: true, capabilityRefHash: metadata.capabilityRefHash,
        accountRefHash: metadata.accountRefHash,
        observedAt: input.observedAt, expiresAt: metadata.expiresAt };
    },
  });
}

function bytes(label) {
  return Buffer.from(`provider-request:${label}`, "utf8");
}

function plan(role, cart) {
  return {
    quoteBytes: bytes(`${role}:quote`),
    holdBytes: cart ? bytes(`${role}:cart`) : null,
    readinessStatusBytes: bytes(`${role}:readiness-status`),
    reserveBytes: bytes(`${role}:reserve`),
    commitBytes: role === "primary" ? bytes("primary:commit") : null,
    executionStatusBytes: role === "independentWitness"
      ? null : bytes(`${role}:execution-status`),
    cancelBytes: bytes(`${role}:cancel`),
    recoverBytes: role === "recovery" ? bytes("recovery:activate") : null,
  };
}

function fixture(t, options = {}) {
  const directory = privateDirectory(t);
  const frozenOutcome = deepFreeze({ exactOutcome: "deliver bounded result",
    outcomeVersion: 1 });
  const frozenTender = deepFreeze({ tenderClass: "ONE_USE",
    acceptance: "independent witness required" });
  const outcomeHash = pinAtomicBuyerNativeFrozenArtifactV1("OUTCOME",
    frozenOutcome);
  const tenderHash = pinAtomicBuyerNativeFrozenArtifactV1("TENDER",
    frozenTender);
  const authorityInput = {
    authorityRefHash: h("current-user-transaction-authority"),
    principalEpochRefHash: h("principal-epoch"), outcomeHash, tenderHash,
    issuedAt: "2026-09-04T11:00:00.000Z", expiresAt: AUTHORITY_EXPIRY,
  };
  const authority = issueCurrentUserTransactionAuthorityV1(authorityInput, {
    async revalidateImpl(input) {
      return { active: true, authorityRefHash: authorityInput.authorityRefHash,
        observedAt: input.observedAt, expiresAt: authorityInput.expiresAt };
    },
  });
  const calls = [];
  const behaviors = {
    PRIMARY: { cart: options.cart === true,
      primaryFails: options.primaryFails === true, executionStarted: false },
    RECOVERY: { cart: options.cart === true,
      reserveRejected: options.recoveryReserveRejected === true,
      executionStarted: false },
    INDEPENDENT_WITNESS: { cart: false, executionStarted: false },
  };
  const coordinator = createAtomicBuyerNativeTemporaryNetworkCoordinatorV1({
    journalDirectory: directory,
    networkId: options.networkId
      ?? "network_0123456789abcdef0123456789abcdef",
    frozenOutcome, frozenTender, expectedOutcomeHash: outcomeHash,
    expectedTenderHash: tenderHash, formationExpiresAt: FORMATION_EXPIRY,
    commercialTerms: { currency: "USD", totalAmountMinor: "2500",
      maximumLossMinor: "5000" },
    routeRequests: {
      primary: plan("primary", options.cart === true),
      recovery: plan("recovery", options.cart === true),
      independentWitness: plan("independentWitness", false),
    },
  }, {
    currentTransactionAuthority: authority,
    primaryCapability: makeCapability("PRIMARY", behaviors.PRIMARY, calls),
    recoveryCapability: makeCapability("RECOVERY", behaviors.RECOVERY, calls),
    independentWitnessCapability: makeCapability("INDEPENDENT_WITNESS",
      behaviors.INDEPENDENT_WITNESS, calls),
    clock: () => NOW,
  });
  function approval(label = "approval") {
    return issuePrincipalPaymentAndLossAuthorizationV1({
      approvalRefHash: h(label),
      transactionAuthorityRefHash: authority.authorityRefHash,
      principalEpochRefHash: authority.principalEpochRefHash,
      outcomeHash, tenderHash, currency: "USD", authorizedAmountMinor: "2500",
      maximumLossMinor: "5000", deliveryAddressRefHash: h("address"),
      paymentMethodRefHash: h("payment-method"),
      issuedAt: "2026-09-04T11:30:00.000Z",
      expiresAt: "2026-09-04T13:30:00.000Z", paymentAuthorized: true,
    });
  }
  return { coordinator, calls, directory, approval };
}

test("cart readiness remains NEEDS_ADDRESS_AND_PAYMENT and never becomes hold, reserve or commit",
  async (t) => {
    const context = fixture(t, { cart: true });
    const result = await context.coordinator.prepare();
    assert.equal(result.networkState, "NEEDS_ADDRESS_AND_PAYMENT");
    assert.equal(result.reservationAttempted, false);
    assert.equal(result.primaryCommitCalled, false);
    const primary = result.slots.find(({ routeRole }) =>
      routeRole === "PRIMARY");
    assert.equal(primary.cartReady, true);
    assert.equal(primary.runtimeState, "PRIMARY_CART_READY");
    assert.equal(primary.reserved, false);
    assert.equal(result.cartReadyCountsAsHold, false);
    assert.equal(result.cartReadyCountsAsReservation, false);
    assert.equal(context.calls.some(({ operation }) => operation === "RESERVE"),
      false);
    assert.equal(context.calls.some(({ operation }) => operation === "COMMIT"),
      false);
  });

test("one principal approval reserves all three slots before primary commit and cold replay emits no duplicate effects",
  async (t) => {
    const context = fixture(t, {
      networkId: "network_1123456789abcdef0123456789abcdef",
    });
    const prepared = await context.coordinator.prepare();
    assert.equal(prepared.networkState,
      "READY_FOR_PRINCIPAL_PAYMENT_APPROVAL");
    assert.deepEqual(context.calls.slice(0, 3).map(({ operation }) => operation),
      ["QUOTE", "QUOTE", "QUOTE"]);
    const approval = context.approval();
    const committed = await context.coordinator.authorizeCommit(approval);
    assert.equal(committed.networkState,
      "PRIMARY_SOURCE_DECLARED_FULFILLED_AWAITING_INDEPENDENT_WITNESS");
    assert.equal(committed.allThreeSlotsReservedBeforePrimaryCommit, true);
    assert.equal(committed.primaryCommitCalled, true);
    assert.equal(committed.recoveryCalled, false);
    assert.equal(committed.independentWitnessObservationRequired, true);
    assert.equal(committed.userResultCommitted, false);
    const commitIndex = context.calls.findIndex(({ operation }) =>
      operation === "COMMIT");
    const reserveIndexes = context.calls.map(({ operation }, index) =>
      operation === "RESERVE" ? index : -1).filter((index) => index >= 0);
    assert.equal(reserveIndexes.length, 3);
    assert.equal(reserveIndexes.every((index) => index < commitIndex), true);
    const count = context.calls.length;
    const replayed = await context.coordinator.authorizeCommit(approval);
    assert.equal(replayed.networkState, committed.networkState);
    assert.equal(context.calls.length, count);
    const marker = readdirSync(context.directory).find((name) =>
      name.endsWith("principal-approval.json"));
    assert.ok(marker);
    assert.equal(statSync(path.join(context.directory, marker)).mode & 0o077, 0);
  });

test("a partial reservation cancels every live slot and cannot call primary commit",
  async (t) => {
    const context = fixture(t, { recoveryReserveRejected: true,
      networkId: "network_2123456789abcdef0123456789abcdef" });
    const result = await context.coordinator.authorizeCommit(
      context.approval("partial"));
    assert.equal(result.networkState, "PARTIAL_RESERVE_CANCELLED");
    assert.equal(result.primaryCommitCalled, false);
    assert.equal(context.calls.filter(({ operation }) => operation === "RESERVE")
      .length, 3);
    assert.equal(context.calls.filter(({ operation }) => operation === "CANCEL")
      .length, 3);
    assert.equal(context.calls.some(({ operation }) => operation === "COMMIT"),
      false);
  });

test("recovery is activated only after an explicit primary FAILED occurrence",
  async (t) => {
    const context = fixture(t, { primaryFails: true,
      networkId: "network_3123456789abcdef0123456789abcdef" });
    const result = await context.coordinator.authorizeCommit(
      context.approval("recovery"));
    assert.equal(result.networkState,
      "RECOVERY_SOURCE_DECLARED_FULFILLED_AWAITING_INDEPENDENT_WITNESS");
    assert.equal(result.recoveryCalled, true);
    assert.match(result.recoveryTriggerOccurrenceHash,
      /^sha256:[a-f0-9]{64}$/u);
    const primaryStatusIndexes = context.calls.map((call, index) =>
      call.role === "PRIMARY" && call.operation === "STATUS" ? index : -1)
      .filter((index) => index >= 0);
    assert.equal(primaryStatusIndexes.length, 2);
    const primaryStatusIndex = primaryStatusIndexes.at(-1);
    const recoverIndex = context.calls.findIndex(({ operation }) =>
      operation === "RECOVER");
    assert.ok(primaryStatusIndex >= 0);
    assert.ok(recoverIndex > primaryStatusIndex);
    assert.equal(context.calls[recoverIndex].triggerOccurrenceHash,
      result.recoveryTriggerOccurrenceHash);
    assert.equal(result.userResultCommitted, false);
  });
