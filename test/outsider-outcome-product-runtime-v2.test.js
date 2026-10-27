import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
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
import { issueBuyerNativeTransactionAccountCapabilityV1 }
  from "../src/outsider-buyer-native-transaction-capability-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import {
  createOutsiderOutcomeProductRuntimeV2,
  OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS,
}
  from "../src/outsider-outcome-product-runtime-v2.js";

const NOW = "2026-09-04T12:00:00.000Z";
const FORMATION_DEADLINE = "2026-09-04T12:10:00.000Z";
const COMPLETION_DEADLINE = "2026-09-04T12:30:00.000Z";
const AUTHORITY_EXPIRY = "2026-09-04T12:20:00.000Z";
const ARTIFACT_HASH = `sha256:${"a".repeat(64)}`;

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function privateDirectory(t, prefix) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function providerResult(role, operation, behavior) {
  let sourceState;
  let sourceRecordClass;
  if (operation === "QUOTE") {
    sourceState = behavior.unavailable ? "REJECTED" : "QUOTE_AVAILABLE";
    sourceRecordClass = "PUBLISHED_INVENTORY";
  } else if (operation === "HOLD") {
    sourceState = "CART_READY";
    sourceRecordClass = "CHECKOUT_RECEIPT";
  } else if (operation === "STATUS") {
    sourceState = behavior.cart && !behavior.committed
      ? "CART_READY" : behavior.committed ? "FULFILLED" : "STATE_OBSERVED";
    sourceRecordClass = "STATUS_RECEIPT";
  } else if (operation === "RESERVE") {
    sourceState = "RESERVATION_ACKNOWLEDGED";
    sourceRecordClass = "RESERVATION_RECEIPT";
  } else if (operation === "COMMIT") {
    behavior.committed = true;
    sourceState = "COMMIT_ACKNOWLEDGED";
    sourceRecordClass = "CHECKOUT_RECEIPT";
  } else if (operation === "RECOVER") {
    behavior.committed = true;
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
      || sourceState === "CART_READY" ? AUTHORITY_EXPIRY : null,
    sourceRecordClass,
  };
}

function capability(role, behavior, calls) {
  const operations = role === "PRIMARY"
    ? ["QUOTE", "HOLD", "STATUS", "RESERVE", "COMMIT", "CANCEL"]
    : role === "RECOVERY"
      ? ["QUOTE", "HOLD", "STATUS", "RESERVE", "RECOVER", "CANCEL"]
      : ["QUOTE", "HOLD", "STATUS", "RESERVE", "CANCEL"];
  const metadata = {
    capabilityRefHash: h(`${role}:capability`),
    accountRefHash: h(`${role}:account`),
    nodeRefHash: h(`${role}:node`),
    issuedAt: "2026-09-04T11:50:00.000Z",
    expiresAt: AUTHORITY_EXPIRY,
    supportedOperations: operations,
  };
  return issueBuyerNativeTransactionAccountCapabilityV1(metadata, {
    async requestImpl(request) {
      calls.push({ role, operation: request.operation });
      return providerResult(role, request.operation, behavior);
    },
    async revalidateImpl(input) {
      return { active: true, capabilityRefHash: metadata.capabilityRefHash,
        accountRefHash: metadata.accountRefHash,
        observedAt: input.observedAt, expiresAt: metadata.expiresAt };
    },
  });
}

function routePlan(role, cart) {
  const bytes = (phase) => Buffer.from(`${role}:${phase}`, "utf8");
  return {
    quoteBytes: bytes("quote"),
    holdBytes: cart ? bytes("cart") : null,
    readinessStatusBytes: bytes("readiness"),
    reserveBytes: bytes("reserve"),
    commitBytes: role === "primary" ? bytes("commit") : null,
    executionStatusBytes: role === "independentWitness"
      ? null : bytes("execution-status"),
    cancelBytes: bytes("cancel"),
    recoverBytes: role === "recovery" ? bytes("recover") : null,
  };
}

function compile(request) {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: `program_${request.requestId}`,
    orderId: request.requestId,
    createdAt: request.requestedAt,
    formationDeadline: FORMATION_DEADLINE,
    completionDeadline: request.completionDeadline,
    cleanupDeadline: "2026-09-04T12:40:00.000Z",
    artifactHash: ARTIFACT_HASH,
    currency: request.budget.currency,
    maximumAmountMinor: request.budget.maximumAmountMinor,
    statement: request.goal,
  });
}

function networkFixture(t, label, options = {}) {
  const journalDirectory = privateDirectory(t, `outsider-product-v2-net-${label}-`);
  const frozenOutcome = deepFreeze({ outcome: label, version: 1 });
  const frozenTender = deepFreeze({ tender: label, requiredSlots: 3 });
  const outcomeHash = pinAtomicBuyerNativeFrozenArtifactV1("OUTCOME",
    frozenOutcome);
  const tenderHash = pinAtomicBuyerNativeFrozenArtifactV1("TENDER",
    frozenTender);
  const authorityInput = {
    authorityRefHash: h(`${label}:authority`),
    principalEpochRefHash: h(`${label}:principal`),
    outcomeHash,
    tenderHash,
    issuedAt: "2026-09-04T11:50:00.000Z",
    expiresAt: AUTHORITY_EXPIRY,
  };
  const authority = issueCurrentUserTransactionAuthorityV1(authorityInput, {
    async revalidateImpl(input) {
      return { active: true,
        authorityRefHash: authorityInput.authorityRefHash,
        observedAt: input.observedAt,
        expiresAt: authorityInput.expiresAt };
    },
  });
  const calls = [];
  const coordinator = createAtomicBuyerNativeTemporaryNetworkCoordinatorV1({
    journalDirectory,
    networkId: `network_${h(label).slice(7, 39)}`,
    frozenOutcome,
    frozenTender,
    expectedOutcomeHash: outcomeHash,
    expectedTenderHash: tenderHash,
    formationExpiresAt: FORMATION_DEADLINE,
    commercialTerms: { currency: "USD", totalAmountMinor: "2500",
      maximumLossMinor: "5000" },
    routeRequests: {
      primary: routePlan("primary", options.cart === true),
      recovery: routePlan("recovery", options.cart === true),
      independentWitness: routePlan("independentWitness", false),
    },
  }, {
    currentTransactionAuthority: authority,
    primaryCapability: capability("PRIMARY", {
      cart: options.cart === true,
      unavailable: options.unavailable === true,
      committed: false,
    }, calls),
    recoveryCapability: capability("RECOVERY", {
      cart: options.cart === true, committed: false,
    }, calls),
    independentWitnessCapability: capability("INDEPENDENT_WITNESS", {
      cart: false, committed: false,
    }, calls),
    clock: () => NOW,
  });
  function approval(name = "approval") {
    return issuePrincipalPaymentAndLossAuthorizationV1({
      approvalRefHash: h(`${label}:${name}`),
      transactionAuthorityRefHash: authority.authorityRefHash,
      principalEpochRefHash: authority.principalEpochRefHash,
      outcomeHash,
      tenderHash,
      currency: "USD",
      authorizedAmountMinor: "2500",
      maximumLossMinor: "5000",
      deliveryAddressRefHash: h(`${label}:address`),
      paymentMethodRefHash: h(`${label}:payment`),
      issuedAt: "2026-09-04T11:55:00.000Z",
      expiresAt: "2026-09-04T12:09:00.000Z",
      paymentAuthorized: true,
    });
  }
  return { coordinator, calls, approval };
}

function request(requestId) {
  return {
    requestId,
    goal: "Deliver one exact result through a temporary three-party network.",
    budget: { currency: "USD", maximumAmountMinor: "5000" },
    completionDeadline: COMPLETION_DEADLINE,
    context: { locale: "en-US" },
  };
}

function formationAuthorization() {
  return {
    secret: "formation-only-secret-not-for-disk",
    formationOperationsAuthorized: true,
    commitWithoutSeparatePaymentAuthorization: false,
  };
}

function exactTerms(program, coordinator, preparation) {
  const byRole = Object.fromEntries(preparation.slots.map((slot) =>
    [slot.routeRole, slot]));
  return deepFreeze({
    schema: "outsider/exact-commitment-terms/v2",
    programHash: program.programHash,
    networkId: coordinator.networkId,
    coordinatorBindingHash: coordinator.coordinatorBindingHash,
    primaryReadinessRefHash:
      byRole.PRIMARY.latestSourceOccurrenceHash,
    recoveryReadinessRefHash:
      byRole.RECOVERY.latestSourceOccurrenceHash,
    independentWitnessReadinessRefHash:
      byRole.INDEPENDENT_WITNESS.latestSourceOccurrenceHash,
    currency: "USD",
    totalAmountMinor: "2500",
    maximumLossMinor: "5000",
    completionDeadline: program.completionDeadline,
    validUntil: "2026-09-04T12:09:00.000Z",
  });
}

function productRuntime(directory, network, prepare, counters,
  formationEventSink = null) {
  return createOutsiderOutcomeProductRuntimeV2({
    directory,
    clock: () => NOW,
    restoreCoordinator: null,
    formationEventSink,
    async compileGoal(input) {
      counters.compile += 1;
      return compile(input);
    },
    async prepareFormation(input) {
      counters.prepare += 1;
      assert.equal(input.formationAuthorization.secret,
        "formation-only-secret-not-for-disk");
      const preparation = await network.coordinator.prepare();
      return { coordinator: network.coordinator, preparation,
        exactCommitment: prepare(input, preparation) };
    },
  });
}

test("configured formation sink is fail-closed and receives stable replay delivery",
  async (t) => {
    const directory = privateDirectory(t, "outsider-product-v2-sink-");
    const network = networkFixture(t, "sink");
    const counters = { compile: 0, prepare: 0 };
    const events = [];
    let rejectOnce = true;
    const runtime = productRuntime(directory, network, () => null, counters,
      async (event) => {
        events.push(event);
        if (rejectOnce) {
          rejectOnce = false;
          throw new Error("sink temporarily unavailable");
        }
        return {
          schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS
            .formationEventSinkReceipt,
          schemaVersion: "2.0.0",
          accepted: true,
          eventIdHash: event.eventIdHash,
          duplicateDelivery: events.length > 2,
        };
      });
    await assert.rejects(runtime.requestOutcome(request("order_sink"), {
      formationAuthorization: formationAuthorization(),
    }), /FORMATION_EVENT_SINK_FAILED/u);
    const replay = await runtime.requestOutcome(request("order_sink"), {
      formationAuthorization: formationAuthorization(),
    });
    assert.equal(replay.state, "BACKGROUND_FORMING");
    assert.equal(counters.compile, 1);
    assert.equal(counters.prepare, 1);
    assert.equal(events.length, 2);
    assert.equal(events[0].eventIdHash, events[1].eventIdHash);
    assert.equal(events[1].providerSourceBytesIncluded, false);
  });

test("one goal forms one exact three-slot proposal, then separate approval reaches the atomic coordinator once",
  async (t) => {
    const directory = privateDirectory(t, "outsider-product-v2-");
    const network = networkFixture(t, "ready");
    const counters = { compile: 0, prepare: 0 };
    const runtime = productRuntime(directory, network,
      (input, preparation) => exactTerms(input.program,
        network.coordinator, preparation), counters);
    const formationOnlyAuthority = formationAuthorization();
    const first = await runtime.requestOutcome(request("order_ready"), {
      formationAuthorization: formationOnlyAuthority,
    });
    assert.equal(first.state, "COMMITMENT_PROPOSAL_READY");
    assert.equal(first.nextAction, "CONFIRM_EXACT_PROPOSAL_ONCE");
    assert.equal(first.outcomePromiseIssued, false);
    assert.equal(first.humanQueueCreated, false);
    assert.equal(network.calls.some(({ operation }) => operation === "RESERVE"),
      false);
    assert.equal(network.calls.some(({ operation }) => operation === "COMMIT"),
      false);

    const beforeReplay = network.calls.length;
    const replay = await runtime.requestOutcome(request("order_ready"), {
      formationAuthorization: formationOnlyAuthority,
    });
    assert.equal(replay.exactCommitmentProposal.proposalHash,
      first.exactCommitmentProposal.proposalHash);
    assert.equal(counters.compile, 1);
    assert.equal(counters.prepare, 1);
    assert.equal(network.calls.length, beforeReplay);

    const forgedAuthorization = { ...network.approval() };
    await assert.rejects(runtime.confirmOutcome({
      requestId: "order_ready",
      proposalHash: first.exactCommitmentProposal.proposalHash,
    }, { paymentAndLossAuthorization: forgedAuthorization }),
    /PAYMENT_APPROVAL_INVALID/);
    assert.equal(readdirSync(directory).some((name) =>
      name.endsWith(".confirmation.v2.json")), false);

    const confirmed = await runtime.confirmOutcome({
      requestId: "order_ready",
      proposalHash: first.exactCommitmentProposal.proposalHash,
    }, { paymentAndLossAuthorization: network.approval() });
    assert.equal(confirmed.state,
      "PRIMARY_SOURCE_DECLARED_FULFILLED_AWAITING_INDEPENDENT_WITNESS");
    assert.equal(confirmed.outcomePromiseIssued, false);
    assert.equal(network.calls.filter(({ operation }) => operation === "RESERVE")
      .length, 3);
    assert.equal(network.calls.filter(({ operation }) => operation === "COMMIT")
      .length, 1);

    const afterCommit = network.calls.length;
    const confirmedReplay = await runtime.confirmOutcome({
      requestId: "order_ready",
      proposalHash: first.exactCommitmentProposal.proposalHash,
    }, { paymentAndLossAuthorization: network.approval() });
    assert.equal(confirmedReplay.state, confirmed.state);
    assert.equal(network.calls.length, afterCommit);

    for (const name of readdirSync(directory)) {
      const file = path.join(directory, name);
      assert.equal(statSync(file).mode & 0o077, 0);
      assert.equal(readFileSync(file, "utf8")
        .includes("formation-only-secret-not-for-disk"), false);
    }
  });

test("missing exact terms stay BACKGROUND_FORMING until explicit resume forms them",
  async (t) => {
    const directory = privateDirectory(t, "outsider-product-v2-");
    const network = networkFixture(t, "background");
    const counters = { compile: 0, prepare: 0 };
    const runtime = productRuntime(directory, network,
      (input, preparation) => counters.prepare === 1 ? null
        : exactTerms(input.program, network.coordinator, preparation), counters);
    const authorization = formationAuthorization();
    const first = await runtime.requestOutcome(request("order_background"), {
      formationAuthorization: authorization,
    });
    assert.equal(first.state, "BACKGROUND_FORMING");
    assert.equal(first.userActionRequired, false);
    assert.equal(first.exactCommitmentProposal, null);
    assert.equal(first.humanQueueCreated, false);

    const resumed = await runtime.resumeFormation("order_background", {
      formationAuthorization: authorization,
    });
    assert.equal(resumed.state, "COMMITMENT_PROPOSAL_READY");
    assert.equal(resumed.formationAttempt, 2);
    const prepareCount = counters.prepare;
    const terminalReplay = await runtime.resumeFormation("order_background", {
      formationAuthorization: authorization,
    });
    assert.equal(terminalReplay.state, "COMMITMENT_PROPOSAL_READY");
    assert.equal(counters.prepare, prepareCount);
  });

test("cart-only formation asks for destination and never emits an exact proposal",
  async (t) => {
    const directory = privateDirectory(t, "outsider-product-v2-");
    const network = networkFixture(t, "cart", { cart: true });
    const counters = { compile: 0, prepare: 0 };
    const runtime = productRuntime(directory, network, () => null, counters);
    const result = await runtime.requestOutcome(request("order_cart"), {
      formationAuthorization: formationAuthorization(),
    });
    assert.equal(result.state, "NEEDS_DESTINATION");
    assert.equal(result.nextAction, "AUTHORIZE_DESTINATION_FOR_FORMATION");
    assert.equal(result.exactCommitmentProposal, null);
    assert.equal(network.calls.some(({ operation }) => operation === "RESERVE"),
      false);
    assert.equal(network.calls.some(({ operation }) => operation === "COMMIT"),
      false);
  });

test("unavailable formation is terminal, creates no human queue, and replays without I/O",
  async (t) => {
    const directory = privateDirectory(t, "outsider-product-v2-");
    const network = networkFixture(t, "unavailable", { unavailable: true });
    const counters = { compile: 0, prepare: 0 };
    const runtime = productRuntime(directory, network, () => null, counters);
    const authorization = formationAuthorization();
    const result = await runtime.requestOutcome(request("order_unavailable"), {
      formationAuthorization: authorization,
    });
    assert.equal(result.state, "UNAVAILABLE");
    assert.equal(result.nextAction, "NONE");
    assert.equal(result.humanQueueCreated, false);
    const callCount = network.calls.length;
    const replay = await runtime.resumeFormation("order_unavailable", {
      formationAuthorization: authorization,
    });
    assert.equal(replay.state, "UNAVAILABLE");
    assert.equal(network.calls.length, callCount);
    assert.equal(counters.prepare, 1);
  });
