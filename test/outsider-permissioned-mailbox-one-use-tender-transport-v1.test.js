import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createPermissionedMailboxOneUseTenderTransportV1,
} from "../src/outsider-permissioned-mailbox-one-use-tender-transport-v1.js";
import { verifyDurableOneUseEndpointEffectLedgerV1 }
  from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function privateLedger(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-permissioned-mailbox-live-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

function delivery(overrides = {}) {
  return {
    tenderBytes: Buffer.from("exact one-use tender bytes\n", "utf8"),
    tenderHash: h("tender-001"),
    recipient: "resource-owner@example.net",
    recipientMailboxRefHash: h("mailbox:resource-owner"),
    authorityGrantHash: h("authority:grant:001"),
    effectDeadline: "2026-09-04T13:00:00.000Z",
    idempotencyKey: "order-001:mailbox-tender:once",
    oneUseNonceHash: h("one-use-nonce:001"),
    ...overrides,
  };
}

function clock(...instants) {
  let index = 0;
  return () => instants[Math.min(index++, instants.length - 1)];
}

function config(directory, overrides = {}) {
  return {
    directory,
    ledgerId: "ledger_0123456789abcdef0123456789abcdef",
    adapterInstanceRefHash: h("account-native-mailbox-adapter:001"),
    clock: clock(
      "2026-09-04T12:00:00.000Z",
      "2026-09-04T12:00:01.000Z",
      "2026-09-04T12:00:02.000Z",
      "2026-09-04T12:00:03.000Z",
    ),
    async revalidateAuthority({ binding }) {
      return {
        authorized: true,
        authorityGrantHash: binding.authorityGrantHash,
        validUntil: "2026-09-04T13:00:00.000Z",
      };
    },
    ...overrides,
  };
}

test("sends one exactly bound tender through account-native closures and exposes uninterpreted response bytes",
  async (t) => {
    const directory = privateLedger(t);
    const sent = [];
    let receives = 0;
    const response = Buffer.from(
      "From: resource-owner@example.net\r\n\r\nACCEPT challenge-001\r\n",
      "utf8");
    const transport = createPermissionedMailboxOneUseTenderTransportV1(
      config(directory, {
        async sendExact(request) {
          sent.push(request);
          return {
            status: "SENT",
            acknowledgementBytes: Buffer.from("250 queued", "utf8"),
          };
        },
        async receiveExact(request) {
          receives += 1;
          assert.equal(request.recipient,
            "resource-owner@example.net");
          return { status: "RESPONSE", responseBytes: response };
        },
      }));

    const result = await transport.drive(delivery());
    assert.equal(result.state, "RESPONSE_OBSERVED");
    assert.deepEqual(result.responseBytes, response);
    assert.equal(result.responseSemantics, "UNINTERPRETED_SOURCE_BYTES");
    assert.equal(result.responseSourceReplayRequired, true);
    assert.equal(result.sendAcknowledgementIsAcceptance, false);
    assert.equal(result.sendAcknowledgementIsCapacity, false);
    assert.equal(result.capacityReserved, false);
    assert.equal(result.outcomeEstablished, false);
    assert.equal(result.humanQueueCreated, false);
    assert.equal(result.paymentPerformed, false);
    assert.equal(sent.length, 1);
    assert.equal(receives, 1);
    assert.equal(sent[0].recipient, delivery().recipient);
    assert.deepEqual(sent[0].tenderBytes, delivery().tenderBytes);
    assert.equal(sent[0].tenderHash, delivery().tenderHash);
    assert.equal(sent[0].authorityGrantHash,
      delivery().authorityGrantHash);
    assert.equal(sent[0].effectDeadline, delivery().effectDeadline);
    assert.equal(sent[0].idempotencyKey, delivery().idempotencyKey);

    const replay = verifyDurableOneUseEndpointEffectLedgerV1({
      directory,
      ledgerId: "ledger_0123456789abcdef0123456789abcdef",
      expectedLocalHeadHash: result.ledgerHeadHash,
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.head.entryCount, 4);
    assert.deepEqual(replay.head.transitionCounts, {
      INTENT_ADMITTED: 1,
      SUBMIT_RESERVED: 1,
      SUBMIT_ATTEMPTED: 1,
      ENDPOINT_RECEIPT_OBSERVED: 1,
      REVOKED_BEFORE_SUBMIT: 0,
      EXPIRED_BEFORE_SUBMIT: 0,
      AMBIGUOUS_NO_RETRY_HOLD: 0,
    });

    const replayed = await transport.drive(delivery());
    assert.equal(replayed.state, "RESPONSE_ALREADY_OBSERVED");
    assert.equal(replayed.responseSourceHash, result.responseSourceHash);
    assert.equal(sent.length, 1, "terminal replay cannot send again");
    assert.equal(receives, 1, "terminal replay cannot observe again");
  });

test("restart receives a pending response without repeating the durable outbound send",
  async (t) => {
    const directory = privateLedger(t);
    let sends = 0;
    let receives = 0;
    const common = {
      async sendExact() {
        sends += 1;
        return { status: "SENT", acknowledgementBytes: null };
      },
      async receiveExact() {
        receives += 1;
        return receives === 1
          ? { status: "PENDING", retryAfter: null }
          : {
            status: "RESPONSE",
            responseBytes: Buffer.from("strict source reply", "utf8"),
          };
      },
    };
    const firstTransport = createPermissionedMailboxOneUseTenderTransportV1(
      config(directory, common));
    const first = await firstTransport.drive(delivery());
    assert.equal(first.state, "PAUSED_RETRYABLE");
    assert.deepEqual(first.retry, {
      reason: "RESPONSE_NOT_YET_OBSERVED",
      retryAfter: null,
    });

    const restartedTransport
      = createPermissionedMailboxOneUseTenderTransportV1(config(directory, {
        ...common,
        clock: () => "2026-09-04T12:01:00.000Z",
      }));
    const completed = await restartedTransport.drive(delivery());
    assert.equal(completed.state, "RESPONSE_OBSERVED");
    assert.equal(completed.responseBytes.toString("utf8"),
      "strict source reply");
    assert.equal(sends, 1);
    assert.equal(receives, 2);

    const replay = verifyDurableOneUseEndpointEffectLedgerV1({
      directory,
      ledgerId: "ledger_0123456789abcdef0123456789abcdef",
      expectedLocalHeadHash: completed.ledgerHeadHash,
    });
    assert.equal(replay.head.transitionCounts.SUBMIT_ATTEMPTED, 1);
    assert.equal(replay.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED, 1);
  });

test("an ambiguous account-native send is terminal and is never retried",
  async (t) => {
    const directory = privateLedger(t);
    let sends = 0;
    let receives = 0;
    const settings = config(directory, {
      async sendExact() {
        sends += 1;
        throw new Error("account API result unknown");
      },
      async receiveExact() {
        receives += 1;
        return { status: "PENDING", retryAfter: null };
      },
    });
    const first = await createPermissionedMailboxOneUseTenderTransportV1(
      settings).drive(delivery());
    assert.equal(first.state, "AMBIGUOUS_NO_RETRY_HOLD");
    const second = await createPermissionedMailboxOneUseTenderTransportV1({
      ...settings,
      clock: () => "2026-09-04T12:05:00.000Z",
    }).drive(delivery());
    assert.equal(second.state, "AMBIGUOUS_NO_RETRY_HOLD");
    assert.equal(sends, 1);
    assert.equal(receives, 0);
    const replay = verifyDurableOneUseEndpointEffectLedgerV1({
      directory,
      ledgerId: "ledger_0123456789abcdef0123456789abcdef",
      expectedLocalHeadHash: second.ledgerHeadHash,
    });
    assert.equal(replay.head.transitionCounts.SUBMIT_ATTEMPTED, 1);
    assert.equal(replay.head.transitionCounts.AMBIGUOUS_NO_RETRY_HOLD, 1);
  });

test("idempotency and durable recipient bindings fail before another send",
  async (t) => {
    const firstDirectory = privateLedger(t);
    let sends = 0;
    const edge = {
      async sendExact() {
        sends += 1;
        return { status: "SENT" };
      },
      async receiveExact() {
        return { status: "PENDING", retryAfter: null };
      },
    };
    const first = createPermissionedMailboxOneUseTenderTransportV1(
      config(firstDirectory, edge));
    await assert.rejects(first.drive(delivery({
      expectedIdempotencyKeyHash: h("wrong-idempotency-hash"),
    })), /IDEMPOTENCY_KEY_HASH_MISMATCH/u);
    assert.equal(sends, 0);

    const pending = await first.drive(delivery());
    assert.equal(pending.state, "PAUSED_RETRYABLE");
    assert.equal(sends, 1);
    await assert.rejects(first.drive(delivery({
      recipient: "different-resource-owner@example.net",
    })), /BOUND_EFFECT_NOT_FOUND/u);
    assert.equal(sends, 1,
      "a changed recipient cannot create a second effect in this ledger");
  });
