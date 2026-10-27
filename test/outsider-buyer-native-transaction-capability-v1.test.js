import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
  statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
  issueBuyerNativeTransactionAccountCapabilityV1,
  OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";

const ALL = Object.freeze([
  "QUOTE", "HOLD", "RESERVE", "COMMIT", "STATUS", "CANCEL", "RECOVER",
]);
const NOW = "2026-09-04T12:00:00.000Z";
const SOURCE_EXPIRY = "2026-09-04T13:00:00.000Z";
const OPERATION_EXPIRY = "2026-09-04T13:30:00.000Z";
const FORMATION_EXPIRY = "2026-09-04T14:00:00.000Z";
const CAPABILITY_EXPIRY = "2026-09-04T15:00:00.000Z";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function domainDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function privateDirectory(t, label) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    `outsider-buyer-native-${label}-`)));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function response(operation, suffix = "") {
  const table = {
    QUOTE: ["QUOTE_AVAILABLE", "PUBLISHED_INVENTORY"],
    HOLD: ["HOLD_ACKNOWLEDGED", "HOLD_RECEIPT"],
    RESERVE: ["RESERVATION_ACKNOWLEDGED", "RESERVATION_RECEIPT"],
    COMMIT: ["COMMIT_ACKNOWLEDGED", "COMMIT_RECEIPT"],
    STATUS: [suffix === "failed" ? "FAILED"
      : suffix === "observed" ? "STATE_OBSERVED" : "FULFILLED",
    "STATUS_RECEIPT"],
    CANCEL: ["CANCELLATION_ACKNOWLEDGED", "CANCELLATION_RECEIPT"],
    RECOVER: ["RECOVERY_COMMIT_ACKNOWLEDGED", "RECOVERY_RECEIPT"],
  };
  return {
    sourceBytes: Buffer.from(`exact-${operation.toLowerCase()}-${suffix}`, "utf8"),
    sourceState: table[operation][0],
    sourceExpiresAt: ["QUOTE", "HOLD", "RESERVE"].includes(operation)
      ? SOURCE_EXPIRY : null,
    sourceRecordClass: operation === "COMMIT" && suffix === "primary"
      ? "CHECKOUT_RECEIPT" : table[operation][1],
  };
}

function capability(label, requestImpl) {
  const metadata = {
    capabilityRefHash: h(`${label}:capability`),
    accountRefHash: h(`${label}:account`),
    nodeRefHash: h(`${label}:node`),
    issuedAt: "2026-09-04T11:00:00.000Z",
    expiresAt: CAPABILITY_EXPIRY,
    supportedOperations: ALL,
  };
  const issued = issueBuyerNativeTransactionAccountCapabilityV1(metadata, {
    requestImpl,
    async revalidateImpl(input) {
      return {
        active: true,
        capabilityRefHash: metadata.capabilityRefHash,
        accountRefHash: metadata.accountRefHash,
        observedAt: input.observedAt,
        expiresAt: metadata.expiresAt,
      };
    },
  });
  return { issued, metadata };
}

function runtime(directory, journalId, role, issued, clock = () => NOW) {
  return createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: directory,
    journalId,
    transactionRefHash: h("shared-transaction"),
    outcomeIntentRefHash: h("shared-outcome-intent"),
    routeRole: role,
    formationExpiresAt: FORMATION_EXPIRY,
  }, { capability: issued, clock });
}

function command(label, previous = null, trigger = null) {
  return {
    operationNonce: `operation-nonce-${label}-00000001`,
    requestBytes: Buffer.from(`request:${label}`, "utf8"),
    expiresAt: OPERATION_EXPIRY,
    expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: trigger,
  };
}

test("primary failure activates an already-reserved explicit recovery route",
  async (t) => {
    const directory = privateDirectory(t, "network");
    const primaryCalls = [];
    const recoveryCalls = [];
    const primaryCapability = capability("primary", async (request) => {
      primaryCalls.push(request);
      return response(request.operation,
        request.operation === "STATUS" ? "failed" : "primary");
    }).issued;
    const recoveryCapability = capability("recovery", async (request) => {
      recoveryCalls.push(request);
      return response(request.operation, "recovery");
    }).issued;
    const primary = runtime(directory,
      "transaction_00000000000000000000000000000001", "PRIMARY",
      primaryCapability);
    const recovery = runtime(directory,
      "transaction_00000000000000000000000000000002", "RECOVERY",
      recoveryCapability);

    const primaryQuote = await primary.quote(command("primary-quote"));
    const primaryHold = await primary.hold(command("primary-hold",
      primaryQuote.publicProjection.sourceOccurrenceHash));
    const primaryReserve = await primary.reserve(command("primary-reserve",
      primaryHold.publicProjection.sourceOccurrenceHash));
    const primaryCommit = await primary.commit(command("primary-commit",
      primaryReserve.publicProjection.sourceOccurrenceHash));

    const recoveryQuote = await recovery.quote(command("recovery-quote"));
    const recoveryReserve = await recovery.reserve(command("recovery-reserve",
      recoveryQuote.publicProjection.sourceOccurrenceHash));
    assert.equal(recoveryReserve.publicProjection.runtimeState,
      "RECOVERY_RESERVED");

    const primaryFailure = await primary.status(command("primary-status",
      primaryCommit.publicProjection.sourceOccurrenceHash));
    assert.equal(primaryFailure.publicProjection.runtimeState, "PRIMARY_FAILED");
    const recovered = await recovery.recover(command("recovery-activate",
      recoveryReserve.publicProjection.sourceOccurrenceHash,
      primaryFailure.publicProjection.sourceOccurrenceHash));
    const recoveredStatus = await recovery.status(command("recovery-status",
      recovered.publicProjection.sourceOccurrenceHash));
    const primaryCancelled = await primary.cancel(command("primary-cancel",
      primaryFailure.publicProjection.sourceOccurrenceHash));

    assert.deepEqual(primaryCalls.map(({ operation }) => operation),
      ["QUOTE", "HOLD", "RESERVE", "COMMIT", "STATUS", "CANCEL"]);
    assert.deepEqual(recoveryCalls.map(({ operation }) => operation),
      ["QUOTE", "RESERVE", "RECOVER", "STATUS"]);
    assert.equal(recoveryCalls[2].triggerOccurrenceHash,
      primaryFailure.publicProjection.sourceOccurrenceHash);
    assert.equal(recoveredStatus.publicProjection.runtimeState,
      "RECOVERY_SOURCE_DECLARED_FULFILLED");
    assert.equal(recoveredStatus.publicProjection.independentOutcomeEstablished,
      false);
    assert.equal(recoveryReserve.publicProjection.capacityReserved, true);
    assert.equal(recoveryReserve.publicProjection.resourceOwnerAuthorityEstablished,
      false);
    assert.equal(primaryCommit.publicProjection.sourceRecordClass,
      "CHECKOUT_RECEIPT");
    assert.equal(primaryCommit.publicProjection.checkoutReceiptEstablishesCapacity,
      false);
    assert.equal(primaryCommit.publicProjection.userResultCommitted, false);
    assert.equal(primaryCancelled.publicProjection.runtimeState,
      "PRIMARY_SOURCE_DECLARED_CANCELLED");

    const exact = claimBuyerNativeTransactionSourceOccurrenceV1(primaryQuote);
    assert.equal(exact.sourceBytes.toString("utf8"), "exact-quote-primary");
    assert.throws(() =>
      claimBuyerNativeTransactionSourceOccurrenceV1(primaryQuote),
      /INVALID_OR_REPLAYED/u);
  });

test("cold replay returns exact source bytes and never duplicates a completed or ambiguous effect",
  async (t) => {
    const directory = privateDirectory(t, "replay");
    let completedCalls = 0;
    const completedDriver = async (request) => {
      completedCalls += 1;
      return response(request.operation, "cold");
    };
    const firstCapability = capability("cold", completedDriver);
    const journalId = "transaction_00000000000000000000000000000003";
    const first = runtime(directory, journalId, "PRIMARY",
      firstCapability.issued);
    const quoteCommand = command("cold-quote");
    const observed = await first.quote(quoteCommand);
    assert.equal(completedCalls, 1);

    const recreatedCapability = capability("cold", completedDriver).issued;
    const restarted = runtime(directory, journalId, "PRIMARY",
      recreatedCapability);
    const replayed = await restarted.quote(quoteCommand);
    assert.equal(completedCalls, 1);
    assert.equal(replayed.publicProjection.replayed, true);
    assert.equal(replayed.publicProjection.sourceOccurrenceHash,
      observed.publicProjection.sourceOccurrenceHash);
    assert.equal(claimBuyerNativeTransactionSourceOccurrenceV1(replayed)
      .sourceBytes.toString("utf8"), "exact-quote-cold");

    let ambiguousCalls = 0;
    const failingDriver = async () => {
      ambiguousCalls += 1;
      throw new Error("connection result unknown");
    };
    const ambiguousId = "transaction_00000000000000000000000000000004";
    const ambiguousCapability = capability("ambiguous", failingDriver);
    const ambiguousRuntime = runtime(directory, ambiguousId, "PRIMARY",
      ambiguousCapability.issued);
    const ambiguousCommand = command("ambiguous-quote");
    const held = await ambiguousRuntime.quote(ambiguousCommand);
    assert.equal(held.publicProjection.operationState,
      "AMBIGUOUS_NO_RETRY_HOLD");
    assert.equal(held.publicProjection.retryPermitted, false);
    const ambiguousRestart = runtime(directory, ambiguousId, "PRIMARY",
      capability("ambiguous", failingDriver).issued);
    const heldAgain = await ambiguousRestart.quote(ambiguousCommand);
    assert.equal(ambiguousCalls, 1);
    assert.equal(heldAgain.publicProjection.replayed, true);

    for (const name of readdirSync(directory)) {
      const location = path.join(directory, name);
      assert.equal(statSync(location).mode & 0o077, 0);
      if (statSync(location).isDirectory()) {
        for (const child of readdirSync(location)) {
          assert.equal(statSync(path.join(location, child)).mode & 0o077, 0);
        }
      }
    }
  });

test("v2 response handles keep source bytes above the canonical string budget in a private hash-bound object",
  async (t) => {
    const directory = privateDirectory(t, "large-source-v2");
    const sourceBytes = Buffer.alloc(300_000, 0x61);
    let calls = 0;
    const driver = async () => {
      calls += 1;
      return { sourceBytes: Buffer.from(sourceBytes),
        sourceState: "QUOTE_AVAILABLE", sourceExpiresAt: SOURCE_EXPIRY,
        sourceRecordClass: "PUBLISHED_INVENTORY" };
    };
    const journalId = "transaction_00000000000000000000000000000008";
    const first = runtime(directory, journalId, "PRIMARY",
      capability("large-source-v2", driver).issued);
    const quoteCommand = command("large-source-v2-quote");
    const observed = await first.quote(quoteCommand);
    assert.equal(observed.publicProjection.operationState,
      "SOURCE_OCCURRENCE_OBSERVED");
    const firstClaim = claimBuyerNativeTransactionSourceOccurrenceV1(observed);
    assert.deepEqual(firstClaim.sourceBytes, sourceBytes);

    const responseDirectory = path.join(directory, `${journalId}.responses`);
    const names = readdirSync(responseDirectory).sort();
    assert.equal(names.filter((name) => name.endsWith(".json")).length, 1);
    assert.equal(names.filter((name) => name.endsWith(".source-v2.bin")).length,
      1);
    const metadata = JSON.parse(readFileSync(path.join(responseDirectory,
      names.find((name) => name.endsWith(".json"))), "utf8"));
    assert.equal(metadata.schema,
      OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .responseHandleV2);
    assert.equal(metadata.schemaVersion, "2.0.0");
    assert.equal(metadata.schemaLineage.supersedesSchema,
      OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .responseHandleV1);
    assert.equal(metadata.sourceBytesLength, sourceBytes.length);
    assert.equal(Object.hasOwn(metadata, "sourceBytesBase64"), false);
    assert.equal(statSync(path.join(responseDirectory,
      names.find((name) => name.endsWith(".source-v2.bin")))).mode & 0o077, 0);

    const restarted = runtime(directory, journalId, "PRIMARY",
      capability("large-source-v2", driver).issued);
    const replayed = await restarted.quote(quoteCommand);
    assert.equal(calls, 1);
    assert.equal(replayed.publicProjection.replayed, true);
    assert.deepEqual(claimBuyerNativeTransactionSourceOccurrenceV1(replayed)
      .sourceBytes, sourceBytes);
  });

test("legacy v1 inline response handles remain readable on cold replay",
  async (t) => {
    const directory = privateDirectory(t, "legacy-v1-replay");
    const sourceBytes = Buffer.from("legacy-v1-exact-source", "utf8");
    let calls = 0;
    const driver = async () => {
      calls += 1;
      return { sourceBytes: Buffer.from(sourceBytes),
        sourceState: "QUOTE_AVAILABLE", sourceExpiresAt: SOURCE_EXPIRY,
        sourceRecordClass: "PUBLISHED_INVENTORY" };
    };
    const journalId = "transaction_00000000000000000000000000000009";
    const quoteCommand = command("legacy-v1-replay-quote");
    const first = runtime(directory, journalId, "PRIMARY",
      capability("legacy-v1-replay", driver).issued);
    await first.quote(quoteCommand);
    const responseDirectory = path.join(directory, `${journalId}.responses`);
    const jsonName = readdirSync(responseDirectory)
      .find((name) => name.endsWith(".json"));
    const v2 = JSON.parse(readFileSync(path.join(responseDirectory, jsonName),
      "utf8"));
    const legacyBody = {
      schema: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .responseHandleV1,
      schemaVersion: "1.0.0",
      transactionRefHash: v2.transactionRefHash,
      routeRole: v2.routeRole,
      operation: v2.operation,
      effectIdHash: v2.effectIdHash,
      sourceBytesBase64: sourceBytes.toString("base64"),
      sourceBytesHash: v2.sourceBytesHash,
      sourceState: v2.sourceState,
      sourceExpiresAt: v2.sourceExpiresAt,
      sourceRecordClass: v2.sourceRecordClass,
    };
    const legacy = { ...legacyBody,
      handleHash: domainDigest(legacyBody.schema, legacyBody) };
    writeFileSync(path.join(responseDirectory, jsonName),
      canonicalizeStrict(legacy), { mode: 0o600 });
    const rawName = readdirSync(responseDirectory)
      .find((name) => name.endsWith(".source-v2.bin"));
    unlinkSync(path.join(responseDirectory, rawName));

    const journalFile = path.join(directory, `${journalId}.events.jsonl`);
    const events = readFileSync(journalFile, "utf8").trimEnd()
      .split("\n").map((line) => JSON.parse(line));
    const terminal = events.at(-1);
    assert.equal(terminal.eventType, "SOURCE_OCCURRENCE_OBSERVED");
    const { eventHash: ignored, ...terminalBody } = terminal;
    terminalBody.responseHandleHash = legacy.handleHash;
    events[events.length - 1] = { ...terminalBody,
      eventHash: domainDigest(terminalBody.schema, terminalBody) };
    writeFileSync(journalFile,
      `${events.map((event) => canonicalizeStrict(event)).join("\n")}\n`,
      { mode: 0o600 });

    const restarted = runtime(directory, journalId, "PRIMARY",
      capability("legacy-v1-replay", driver).issued);
    const replayed = await restarted.quote(quoteCommand);
    assert.equal(calls, 1);
    assert.equal(replayed.publicProjection.replayed, true);
    assert.equal(claimBuyerNativeTransactionSourceOccurrenceV1(replayed)
      .sourceBytes.toString("utf8"), "legacy-v1-exact-source");
  });

test("inventory and checkout receipts stay source-only while role, ancestry, nonce and expiry gates fail closed",
  async (t) => {
    const directory = privateDirectory(t, "gates");
    let now = NOW;
    const requests = [];
    const account = capability("gates", async (request) => {
      requests.push(request);
      return response(request.operation,
        request.operation === "STATUS" ? "observed" : "gates");
    });
    const recovery = runtime(directory,
      "transaction_00000000000000000000000000000005", "RECOVERY",
      account.issued, () => now);
    const quoteCommand = command("gate-shared-nonce");
    const quote = await recovery.quote(quoteCommand);
    assert.equal(quote.publicProjection.sourceRecordClass,
      "PUBLISHED_INVENTORY");
    assert.equal(quote.publicProjection.publishedInventoryEstablishesCapacity,
      false);
    assert.equal(Reflect.ownKeys(requests[0]).includes("credential"), false);
    assert.equal(Reflect.ownKeys(requests[0]).includes("url"), false);
    const cartStatus = await recovery.status(command("cart-status",
      quote.publicProjection.sourceOccurrenceHash));
    assert.equal(cartStatus.publicProjection.runtimeState, "RECOVERY_QUOTED");
    assert.equal(cartStatus.publicProjection.sourceState, "STATE_OBSERVED");

    await assert.rejects(recovery.commit(command("recovery-illegal-commit",
      cartStatus.publicProjection.sourceOccurrenceHash)),
    /OPERATION_STATE_TRANSITION_INVALID/u);
    const reused = command("gate-shared-nonce",
      cartStatus.publicProjection.sourceOccurrenceHash);
    reused.requestBytes = Buffer.from("different request", "utf8");
    await assert.rejects(recovery.reserve(reused), /OPERATION_NONCE_REUSED/u);

    now = SOURCE_EXPIRY;
    await assert.rejects(recovery.reserve(command("expired-reserve",
      cartStatus.publicProjection.sourceOccurrenceHash)),
    /PRIOR_SOURCE_STATE_EXPIRED/u);
    assert.equal(requests.length, 2);
  });
