import test from "node:test";
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
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_BOUNDARY,
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

const LEDGER_ID = "ledger_0123456789abcdef0123456789abcdef";
const DEADLINE = "2026-09-04T14:00:00.000Z";
const TIMES = Object.freeze({
  INTENT_ADMITTED: "2026-09-04T12:00:00.000Z",
  SUBMIT_RESERVED: "2026-09-04T12:01:00.000Z",
  SUBMIT_ATTEMPTED: "2026-09-04T12:02:00.000Z",
  ENDPOINT_RECEIPT_OBSERVED: "2026-09-04T12:03:00.000Z",
  REVOKED_BEFORE_SUBMIT: "2026-09-04T12:01:30.000Z",
  EXPIRED_BEFORE_SUBMIT: "2026-09-04T14:00:00.000Z",
  AMBIGUOUS_NO_RETRY_HOLD: "2026-09-04T12:04:00.000Z",
});

function privateTarget(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-one-use-ledger-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

function event(type, previousEffectEventHash = null, overrides = {}) {
  const effectLabel = overrides.effectLabel ?? "effect-1";
  const nonceLabel = overrides.nonceLabel ?? "nonce-1";
  const idempotencyLabel = overrides.idempotencyLabel ?? "idempotency-1";
  const bodyLabel = overrides.bodyLabel ?? "body-1";
  const eventLabel = overrides.eventLabel ?? `${effectLabel}:${type}`;
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: overrides.ledgerId ?? LEDGER_ID,
    eventType: type,
    effectIdHash: h(effectLabel),
    transactionBindingHash: h(overrides.transactionLabel ?? "transaction-1"),
    endpointBindingHash: h(overrides.endpointLabel ?? "endpoint-1"),
    adapterInstanceRefHash: h(overrides.adapterLabel ?? "adapter-1"),
    permissionGrantHash: h(overrides.permissionLabel ?? "permission-1"),
    oneUseNonceHash: h(nonceLabel),
    idempotencyKeyHash: h(idempotencyLabel),
    bodyHash: h(bodyLabel),
    effectDeadline: overrides.effectDeadline ?? DEADLINE,
    recordedAt: overrides.recordedAt ?? TIMES[type],
    previousEffectEventHash,
    occurrenceNonceHash: h(`occurrence:${eventLabel}`),
    endpointReceiptHash: type === "ENDPOINT_RECEIPT_OBSERVED"
      ? h(overrides.receiptLabel ?? "endpoint-receipt-1") : null,
    terminalEvidenceHash: type === "REVOKED_BEFORE_SUBMIT"
      || type === "EXPIRED_BEFORE_SUBMIT"
      || type === "AMBIGUOUS_NO_RETRY_HOLD"
      ? h(overrides.terminalLabel ?? `terminal:${eventLabel}`) : null,
  });
}

function initialize(t) {
  const directory = privateTarget(t);
  const intent = event("INTENT_ADMITTED");
  const result = initializeDurableOneUseEndpointEffectLedgerV1({
    directory, ledgerId: LEDGER_ID, genesisEvent: intent,
  });
  return { directory, intent, result };
}

function appendEvent(directory, head, nextEvent) {
  return appendDurableOneUseEndpointEffectLedgerV1({
    directory,
    ledgerId: LEDGER_ID,
    event: nextEvent,
    expectedLocalHeadHash: head.head.headHash,
  });
}

test("durable one-use ledger persists and replays the complete receipt chain",
  (t) => {
    const initialized = initialize(t);
    const reserved = event("SUBMIT_RESERVED", initialized.intent.eventHash);
    const reservation = appendEvent(initialized.directory,
      initialized.result, reserved);
    const attempted = event("SUBMIT_ATTEMPTED", reserved.eventHash);
    const attempt = appendEvent(initialized.directory, reservation, attempted);
    const receipt = event("ENDPOINT_RECEIPT_OBSERVED", attempted.eventHash);
    const observed = appendEvent(initialized.directory, attempt, receipt);

    const restarted = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: initialized.directory,
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: observed.head.headHash,
    });
    assert.equal(restarted.ok, true);
    assert.equal(restarted.head.entryCount, 4);
    assert.equal(restarted.head.exactOccurrenceCount, 4);
    assert.equal(restarted.head.effectCount, 1);
    assert.equal(restarted.head.terminalEffectCount, 1);
    assert.equal(restarted.head.nonceIndexCount, 1);
    assert.equal(restarted.head.idempotencyIndexCount, 1);
    assert.equal(restarted.head.idempotencyBodyPairIndexCount, 1);
    assert.deepEqual(restarted.head.transitionCounts, {
      INTENT_ADMITTED: 1,
      SUBMIT_RESERVED: 1,
      SUBMIT_ATTEMPTED: 1,
      ENDPOINT_RECEIPT_OBSERVED: 1,
      REVOKED_BEFORE_SUBMIT: 0,
      EXPIRED_BEFORE_SUBMIT: 0,
      AMBIGUOUS_NO_RETRY_HOLD: 0,
    });
    assert.equal(restarted.fullAncestryReplayVerified, true);
    assert.equal(restarted.twoPassEntrySnapshotStabilityVerified, true);
    assert.equal(restarted.networkIoPerformed, false);
    assert.equal(restarted.endpointContactPerformed, false);
    assert.equal(restarted.authority, "NONE");
    assert.equal(restarted.decisionState, "HOLD");

    const entries = path.join(initialized.directory, "entries");
    const temporary = path.join(initialized.directory, "tmp");
    assert.equal(statSync(initialized.directory).mode & 0o777, 0o700);
    assert.equal(statSync(entries).mode & 0o777, 0o700);
    assert.equal(statSync(temporary).mode & 0o777, 0o700);
    assert.deepEqual(readdirSync(entries), [
      "000000000001.json", "000000000002.json",
      "000000000003.json", "000000000004.json",
    ]);
    for (const name of readdirSync(entries)) {
      assert.equal(statSync(path.join(entries, name)).mode & 0o777, 0o600);
    }
    assert.deepEqual(readdirSync(temporary), []);
  });

test("a durable SUBMIT_ATTEMPTED forbids a second submit and permits only reconciliation",
  (t) => {
    const initialized = initialize(t);
    const reserved = event("SUBMIT_RESERVED", initialized.intent.eventHash);
    const reservation = appendEvent(initialized.directory,
      initialized.result, reserved);
    const attempted = event("SUBMIT_ATTEMPTED", reserved.eventHash);
    const attempt = appendEvent(initialized.directory, reservation, attempted);
    const retry = event("SUBMIT_ATTEMPTED", attempted.eventHash, {
      eventLabel: "effect-1:second-submit",
      recordedAt: "2026-09-04T12:03:00.000Z",
    });
    assert.throws(() => appendEvent(initialized.directory, attempt, retry),
      /SUBMIT_ATTEMPT_RETRY_OR_INVALID_RECONCILIATION_FORBIDDEN/u);
    let replay = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: initialized.directory,
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: attempt.head.headHash,
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.head.entryCount, 3);

    const ambiguous = event("AMBIGUOUS_NO_RETRY_HOLD", attempted.eventHash);
    replay = appendEvent(initialized.directory, attempt, ambiguous);
    assert.equal(replay.head.entryCount, 4);
    assert.equal(replay.head.terminalEffectCount, 1);
    const lateReceipt = event("ENDPOINT_RECEIPT_OBSERVED", ambiguous.eventHash, {
      eventLabel: "effect-1:late-receipt",
      recordedAt: "2026-09-04T12:05:00.000Z",
    });
    assert.throws(() => appendEvent(initialized.directory, replay, lateReceipt),
      /EFFECT_STATE_TRANSITION_INVALID/u);
  });

test("pre-submit revocation and expiry are terminal and do not consume submit state",
  (t) => {
    const revokedLedger = initialize(t);
    const revoked = event("REVOKED_BEFORE_SUBMIT",
      revokedLedger.intent.eventHash);
    const revokedResult = appendEvent(revokedLedger.directory,
      revokedLedger.result, revoked);
    assert.equal(revokedResult.head.terminalEffectCount, 1);
    assert.equal(revokedResult.head.transitionCounts.SUBMIT_ATTEMPTED, 0);

    const expiryDirectory = privateTarget(t);
    const expiryLedgerId = "ledger_fedcba9876543210fedcba9876543210";
    const expiryIntent = event("INTENT_ADMITTED", null, {
      ledgerId: expiryLedgerId,
      effectLabel: "expiry-effect",
      nonceLabel: "expiry-nonce",
      idempotencyLabel: "expiry-key",
      bodyLabel: "expiry-body",
      eventLabel: "expiry-intent",
    });
    const expiryInit = initializeDurableOneUseEndpointEffectLedgerV1({
      directory: expiryDirectory,
      ledgerId: expiryLedgerId,
      genesisEvent: expiryIntent,
    });
    const expired = event("EXPIRED_BEFORE_SUBMIT", expiryIntent.eventHash, {
      ledgerId: expiryLedgerId,
      effectLabel: "expiry-effect",
      nonceLabel: "expiry-nonce",
      idempotencyLabel: "expiry-key",
      bodyLabel: "expiry-body",
      eventLabel: "expiry-terminal",
    });
    const expiryResult = appendDurableOneUseEndpointEffectLedgerV1({
      directory: expiryDirectory,
      ledgerId: expiryLedgerId,
      event: expired,
      expectedLocalHeadHash: expiryInit.head.headHash,
    });
    assert.equal(expiryResult.head.transitionCounts.EXPIRED_BEFORE_SUBMIT, 1);
    assert.equal(expiryResult.head.transitionCounts.SUBMIT_ATTEMPTED, 0);
  });

test("replay-derived indices reject nonce and idempotency/body reuse before append",
  (t) => {
    const initialized = initialize(t);
    const reusedNonce = event("INTENT_ADMITTED", null, {
      effectLabel: "effect-2",
      nonceLabel: "nonce-1",
      idempotencyLabel: "idempotency-2",
      bodyLabel: "body-2",
    });
    assert.throws(() => appendEvent(initialized.directory,
      initialized.result, reusedNonce), /ONE_USE_NONCE_ALREADY_BOUND/u);

    const bodySplice = event("INTENT_ADMITTED", null, {
      effectLabel: "effect-2",
      nonceLabel: "nonce-2",
      idempotencyLabel: "idempotency-1",
      bodyLabel: "different-body",
    });
    assert.throws(() => appendEvent(initialized.directory,
      initialized.result, bodySplice), /IDEMPOTENCY_KEY_BODY_SPLICE/u);

    const pairReuse = event("INTENT_ADMITTED", null, {
      effectLabel: "effect-2",
      nonceLabel: "nonce-2",
      idempotencyLabel: "idempotency-1",
      bodyLabel: "body-1",
    });
    assert.throws(() => appendEvent(initialized.directory,
      initialized.result, pairReuse), /IDEMPOTENCY_BODY_PAIR_ALREADY_BOUND/u);

    const exactReplay = appendEvent(initialized.directory,
      initialized.result, initialized.intent);
    assert.equal(exactReplay.appended, false);
    assert.equal(exactReplay.idempotentReplay, true);
    assert.equal(exactReplay.head.entryCount, 1);
  });

test("expected-head CAS and exclusive lock reject without changing durable entries",
  (t) => {
    const initialized = initialize(t);
    const reserved = event("SUBMIT_RESERVED", initialized.intent.eventHash);
    assert.throws(() => appendDurableOneUseEndpointEffectLedgerV1({
      directory: initialized.directory,
      ledgerId: LEDGER_ID,
      event: reserved,
      expectedLocalHeadHash: h("stale-head"),
    }), /COMPARE_AND_SWAP_LOCAL_HEAD_MISMATCH/u);
    const entries = path.join(initialized.directory, "entries");
    assert.deepEqual(readdirSync(entries), ["000000000001.json"]);
    assert.equal(readdirSync(initialized.directory).includes("append.lock"),
      false);

    const lock = path.join(initialized.directory, "append.lock");
    writeFileSync(lock, "cooperating writer lock\n", { mode: 0o600 });
    assert.throws(() => appendEvent(initialized.directory,
      initialized.result, reserved), /WRITER_LOCK_PRESENT/u);
    assert.deepEqual(readdirSync(entries), ["000000000001.json"]);
    unlinkSync(lock);
  });

test("canonical no-clobber entry paths and private modes fail closed",
  (t) => {
    const initialized = initialize(t);
    const entries = path.join(initialized.directory, "entries");
    const first = path.join(entries, "000000000001.json");
    chmodSync(first, 0o644);
    let verified = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: initialized.directory,
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: null,
    });
    assert.equal(verified.ok, false);
    assert.match(verified.error, /ENTRY_FILE_PERMISSIONS_INVALID/u);
    chmodSync(first, 0o600);

    const occupied = path.join(entries, "000000000002.json");
    writeFileSync(occupied, "not canonical and must not be overwritten\n",
      { mode: 0o600, flag: "wx" });
    const before = readFileSync(occupied);
    const reserved = event("SUBMIT_RESERVED", initialized.intent.eventHash);
    assert.throws(() => appendEvent(initialized.directory,
      initialized.result, reserved));
    assert.deepEqual(readFileSync(occupied), before);
    assert.equal(statSync(occupied).mode & 0o777, 0o600);
  });

test("published boundary remains a local HOLD, not endpoint authority",
  () => {
    const boundary = OUTSIDER_DURABLE_ONE_USE_ENDPOINT_EFFECT_LEDGER_V1_BOUNDARY;
    assert.equal(boundary.networkInterfacePresent, false);
    assert.equal(boundary.urlInterfacePresent, false);
    assert.equal(boundary.credentialInterfacePresent, false);
    assert.equal(boundary.callbackInterfacePresent, false);
    assert.equal(boundary.providerRegistryPresent, false);
    assert.equal(boundary.humanQueueCreated, false);
    assert.equal(boundary.endpointContactPerformed, false);
    assert.equal(boundary.resourceOwnerAuthorityEstablished, false);
    assert.equal(boundary.externalCapacityEstablished, false);
    assert.equal(boundary.externalHeadAnchorEstablished, false);
    assert.equal(boundary.filesystemOwnerRollbackOrReplacementExcluded, false);
    assert.equal(boundary.trustedClockEstablished, false);
    assert.equal(boundary.timestampsAreCallerAsserted, true);
    assert.equal(boundary.deadlineEnforcementAuthoritative, false);
    assert.equal(boundary.decisionState, "HOLD");
    assert.equal(boundary.authority, "NONE");
    assert.deepEqual(boundary.enabledCapabilityTypes,
      boundary.provenAuthorityCapabilityTypes);
  });
