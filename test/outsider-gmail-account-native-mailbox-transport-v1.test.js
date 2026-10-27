import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
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
import { pathToFileURL } from "node:url";

import {
  OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_BOUNDARY,
  OUTSIDER_GMAIL_OFFICIAL_SOURCE_PINS_V1,
  claimGmailReplyObservationSourcesV1,
  createGmailAccountNativeMailboxTransportV1,
  inspectGmailOAuthCapabilityV1,
  issueGmailReadOAuthCapabilityV1,
  issueGmailSendOAuthCapabilityV1,
  revokeGmailOAuthCapabilityV1,
} from "../src/outsider-gmail-account-native-mailbox-transport-v1.js";
import {
  createPermissionedMailboxOneUseTenderTransportV1,
} from "../src/outsider-permissioned-mailbox-one-use-tender-transport-v1.js";

const hash = (value) => `sha256:${createHash("sha256")
  .update(value, "utf8").digest("hex")}`;
const byteHash = (value) => `sha256:${createHash("sha256")
  .update(value).digest("hex")}`;
const journalId = (value) => `journal_${createHash("sha256")
  .update(value, "utf8").digest("hex").slice(0, 32)}`;
const NOW = "2099-01-01T00:00:10.000Z";
const EXPIRY = "2099-01-01T01:00:00.000Z";
const RECIPIENT = "orders@seller.example.com";
const SENDER = "buyer@outsider.example.com";
const SEND_TOKEN = "TEST_SEND_TOKEN_NOT_AMBIENT_0123456789";
const READ_TOKEN = "TEST_READ_TOKEN_NOT_AMBIENT_0123456789";

function privateRoot(t, label) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `${label}-`)));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function issueSend(token = SEND_TOKEN) {
  return issueGmailSendOAuthCapabilityV1({
    accessToken: token,
    accountRefHash: hash("gmail-account"),
    oauthGrantHash: hash("gmail-send-grant"),
    senderAddress: SENDER,
    issuedAt: "2099-01-01T00:00:00.000Z",
    expiresAt: EXPIRY,
  });
}

function issueRead(token = READ_TOKEN) {
  return issueGmailReadOAuthCapabilityV1({
    accessToken: token,
    accountRefHash: hash("gmail-account"),
    oauthGrantHash: hash("gmail-read-grant"),
    senderAddress: SENDER,
    issuedAt: "2099-01-01T00:00:00.000Z",
    expiresAt: EXPIRY,
  });
}

function exactDelivery(label = "direct") {
  const tenderBytes = Buffer.from(JSON.stringify({
    schema: "outsider/human-readable-one-use-tender/v1",
    requestedOutcome: "Return a fixed quote and completion window.",
    responseUrl: "https://response.outsider.example/one-use/test",
  }), "utf8");
  return {
    recipient: RECIPIENT,
    candidateRefHash: hash(`${label}:candidate`),
    tenderBytes,
    tenderBodyHash: byteHash(tenderBytes),
    transactionBindingHash: hash(`${label}:transaction`),
    authorityGrantHash: hash(`${label}:authority`),
    effectDeadline: "2099-01-01T00:30:00.000Z",
    idempotencyKey: `${label}:idempotency`,
    oneUseNonceHash: hash(`${label}:nonce`),
  };
}

function journalEvents(directory, id) {
  return readFileSync(path.join(directory, `${id}.events.jsonl`), "utf8")
    .trimEnd().split("\n").map((line) => JSON.parse(line));
}

test("send-only Gmail edge fsyncs before one POST and emits readable exact one-recipient MIME",
  async (t) => {
    const directory = privateRoot(t, "outsider-gmail-send-v1");
    const id = journalId("send-readable");
    const send = issueSend();
    const delivery = exactDelivery("send-readable");
    const receiptBytes = Buffer.from(JSON.stringify({
      id: "gmail_message_1", threadId: "gmail_thread_1",
    }), "utf8");
    let posts = 0;
    let mime;
    const requestImpl = async (request) => {
      posts += 1;
      assert.equal(request.method, "POST");
      assert.equal(request.url,
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
      assert.equal(request.headers.authorization, `Bearer ${SEND_TOKEN}`);
      const eventsBeforePost = journalEvents(directory, id);
      assert.deepEqual(eventsBeforePost.map((event) => event.eventType),
        ["SEND_ATTEMPTED"]);
      assert.equal(statSync(path.join(directory, `${id}.events.jsonl`)).mode
        & 0o777, 0o600);
      mime = Buffer.from(JSON.parse(request.body.toString("utf8")).raw,
        "base64url");
      return { status: 200, body: receiptBytes };
    };
    const first = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability: send,
      readOAuthCapability: null,
      requestImpl,
      clock: () => NOW,
      directory,
      journalId: id,
    });
    const delivered = await first.deliverExact(delivery);
    assert.deepEqual(delivered.deliveryReceiptBytes, receiptBytes);
    assert.equal(posts, 1);
    const [headerBlock, body] = mime.toString("utf8").split("\r\n\r\n");
    assert.equal((headerBlock.match(/^To: /gmu) ?? []).length, 1);
    assert.match(headerBlock, /^To: orders@seller\.example\.com$/mu);
    assert.match(headerBlock, /^Content-Type: text\/plain; charset=utf-8$/mu);
    assert.match(headerBlock, /^Content-Transfer-Encoding: 8bit$/mu);
    assert.match(headerBlock,
      /^Message-ID: <outsider\.[a-f0-9]{64}@one-use\.invalid>$/mu);
    assert.equal(/^(?:Cc|Bcc):/imu.test(headerBlock), false);
    assert.equal(body, `${delivery.tenderBytes.toString("utf8")}\r\n`);
    const events = journalEvents(directory, id);
    assert.deepEqual(events.map((event) => event.eventType),
      ["SEND_ATTEMPTED", "SEND_COMPLETED"]);
    assert.equal(Buffer.from(events[1].payload.receiptBase64, "base64")
      .equals(receiptBytes), true);
    assert.equal(readdirSync(path.join(directory, ".response-handles-v1"))
      .length, 0);

    const restarted = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability: send,
      readOAuthCapability: null,
      requestImpl,
      clock: () => NOW,
      directory,
      journalId: id,
    });
    const replayed = await restarted.deliverExact(exactDelivery("send-readable"));
    assert.deepEqual(replayed.deliveryReceiptBytes, receiptBytes);
    assert.equal(posts, 1);
    const publicJson = JSON.stringify(restarted);
    for (const secret of [SEND_TOKEN, SENDER, RECIPIENT,
      receiptBytes.toString("utf8"), directory]) {
      assert.equal(publicJson.includes(secret), false, secret);
    }
    assert.equal(restarted.deliveryReceiptIsAcceptance, false);
    assert.equal(restarted.counterpartyResponseCreatesCapacity, false);
  });

test("a hard process exit after the fsynced HTTP-200 handle cold-recovers completion without POST",
  async (t) => {
    const directory = privateRoot(t, "outsider-gmail-crash-v1");
    const id = journalId("crash-window");
    const delivery = exactDelivery("crash-window");
    const moduleUrl = pathToFileURL(path.resolve(
      "src/outsider-gmail-account-native-mailbox-transport-v1.js")).href;
    const childSource = `
      import { createHash } from "node:crypto";
      import { ${"createGmailAccountNativeMailboxTransportV1"},
        ${"issueGmailSendOAuthCapabilityV1"} } from ${JSON.stringify(moduleUrl)};
      const h = (v) => "sha256:" + createHash("sha256").update(v).digest("hex");
      const capability = issueGmailSendOAuthCapabilityV1(${JSON.stringify({
        accessToken: SEND_TOKEN,
        accountRefHash: hash("gmail-account"),
        oauthGrantHash: hash("gmail-send-grant"),
        senderAddress: SENDER,
        issuedAt: "2099-01-01T00:00:00.000Z",
        expiresAt: EXPIRY,
      })});
      let calls = 0;
      const transport = createGmailAccountNativeMailboxTransportV1({
        sendOAuthCapability: capability, readOAuthCapability: null,
        directory: ${JSON.stringify(directory)}, journalId: ${JSON.stringify(id)},
        clock() { calls += 1; if (calls === 3) process.exit(86); return ${JSON.stringify(NOW)}; },
        async requestImpl() { return { status: 200,
          body: Buffer.from(${JSON.stringify(JSON.stringify({
            id: "gmail_message_crash", threadId: "gmail_thread_crash",
          }))}) }; },
      });
      await transport.deliverExact({
        recipient: ${JSON.stringify(delivery.recipient)},
        candidateRefHash: ${JSON.stringify(delivery.candidateRefHash)},
        tenderBytes: Buffer.from(${JSON.stringify(delivery.tenderBytes.toString("utf8"))}),
        tenderBodyHash: ${JSON.stringify(delivery.tenderBodyHash)},
        transactionBindingHash: ${JSON.stringify(delivery.transactionBindingHash)},
        authorityGrantHash: ${JSON.stringify(delivery.authorityGrantHash)},
        effectDeadline: ${JSON.stringify(delivery.effectDeadline)},
        idempotencyKey: ${JSON.stringify(delivery.idempotencyKey)},
        oneUseNonceHash: ${JSON.stringify(delivery.oneUseNonceHash)},
      });
    `;
    const child = spawnSync(process.execPath,
      ["--input-type=module", "-e", childSource], { encoding: "utf8" });
    assert.equal(child.status, 86, child.stderr);
    assert.deepEqual(journalEvents(directory, id).map((event) => event.eventType),
      ["SEND_ATTEMPTED"]);
    const responseDirectory = path.join(directory, ".response-handles-v1");
    assert.equal(readdirSync(responseDirectory).length, 1);
    assert.equal(statSync(path.join(responseDirectory,
      readdirSync(responseDirectory)[0])).mode & 0o777, 0o600);

    let unexpectedPosts = 0;
    const restarted = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability: issueSend(),
      readOAuthCapability: null,
      async requestImpl() { unexpectedPosts += 1; throw new Error("no POST"); },
      clock: () => NOW,
      directory,
      journalId: id,
    });
    const recovered = await restarted.deliverExact(exactDelivery("crash-window"));
    assert.deepEqual(JSON.parse(recovered.deliveryReceiptBytes.toString("utf8")),
      { id: "gmail_message_crash", threadId: "gmail_thread_crash" });
    assert.equal(unexpectedPosts, 0);
    assert.deepEqual(journalEvents(directory, id).map((event) => event.eventType),
      ["SEND_ATTEMPTED", "SEND_COMPLETED"]);
    assert.equal(journalEvents(directory, id)[1].payload
      .recoveredFromDurableResponseHandle, true);
    assert.equal(readdirSync(responseDirectory).length, 0);
    assert.equal(readdirSync(path.join(directory, ".send-locks-v1")).length, 0);
  });

test("read-only reply observation binds thread, recipient, time and Message-ID while retaining exact bytes",
  async (t) => {
    const directory = privateRoot(t, "outsider-gmail-reply-v1");
    const id = journalId("reply");
    const delivery = exactDelivery("reply");
    let outboundMessageId;
    const exactListBytes = Buffer.from(JSON.stringify({
      messages: [{ id: "gmail_reply_1", threadId: "gmail_thread_reply" }],
    }), "utf8");
    let exactGetBytes;
    let exactReplyBytes;
    const seen = [];
    const transport = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability: issueSend(),
      readOAuthCapability: issueRead(),
      directory,
      journalId: id,
      clock: () => NOW,
      async requestImpl(request) {
        seen.push({ method: request.method, url: request.url,
          authorization: request.headers.authorization });
        if (request.method === "POST") {
          const mime = Buffer.from(JSON.parse(request.body.toString("utf8")).raw,
            "base64url").toString("utf8");
          outboundMessageId = /^Message-ID: (.+)$/mu.exec(mime)[1];
          return { status: 200, body: Buffer.from(JSON.stringify({
            id: "gmail_sent_reply", threadId: "gmail_thread_reply",
          }), "utf8") };
        }
        if (!request.url.includes("format=raw")) {
          return { status: 200, body: exactListBytes };
        }
        exactReplyBytes = Buffer.from([
          `From: ${RECIPIENT}`,
          `To: ${SENDER}`,
          `In-Reply-To: ${outboundMessageId}`,
          `References: ${outboundMessageId}`,
          "Subject: Re: one-use tender",
          "",
          "We can quote this request.",
          "",
        ].join("\r\n"), "utf8");
        exactGetBytes = Buffer.from(JSON.stringify({
          id: "gmail_reply_1",
          threadId: "gmail_thread_reply",
          internalDate: String(Date.parse(NOW) + 1_000),
          raw: exactReplyBytes.toString("base64url"),
        }), "utf8");
        return { status: 200, body: exactGetBytes };
      },
    });
    const delivered = await transport.deliverExact(delivery);
    const observation = await transport.observeReplyExact({
      transactionBindingHash: delivery.transactionBindingHash,
      recipient: RECIPIENT,
      afterTimestamp: delivered.completedAt,
      maximumPages: 2,
      maximumMessagesPerPage: 25,
      maximumGetRequests: 8,
    });
    assert.equal(observation.publicProjection.state,
      "COUNTERPARTY_RESPONSE_OBSERVED");
    assert.equal(observation.publicProjection.counterpartyResponseIsAcceptance,
      false);
    assert.equal(observation.publicProjection.counterpartyResponseCreatesCapacity,
      false);
    assert.equal(observation.publicProjection.capacityReserved, false);
    const listUrl = new URL(seen[1].url);
    assert.equal(listUrl.searchParams.get("q"),
      `from:(${RECIPIENT}) after:2099/01/01`);
    assert.equal(seen[1].authorization, `Bearer ${READ_TOKEN}`);
    assert.equal(seen[2].url.endsWith("/gmail_reply_1?format=raw"), true);
    const privateSources = claimGmailReplyObservationSourcesV1(observation);
    assert.deepEqual(privateSources.sourceOccurrences.map((source) =>
      source.bytes), [exactListBytes, exactGetBytes, exactReplyBytes]);
    assert.deepEqual(privateSources.responseBytes, exactReplyBytes);
    assert.throws(() => claimGmailReplyObservationSourcesV1(observation),
      /INVALID_OR_REPLAYED/u);
    const events = journalEvents(directory, id);
    assert.equal(events.at(-1).eventType, "REPLY_OBSERVATION_RECORDED");
    assert.deepEqual(Buffer.from(events.at(-1).payload.responseBase64, "base64"),
      exactReplyBytes);
    assert.equal(JSON.stringify(observation).includes(RECIPIENT), false);
    assert.equal(JSON.stringify(observation).includes("We can quote"), false);
  });

test("429 and ambiguous send outcomes remain durable no-retry holds across reconstruction",
  async (t) => {
    for (const scenario of ["429", "ambiguous"]) {
      const directory = privateRoot(t, `outsider-gmail-${scenario}-v1`);
      const id = journalId(scenario);
      const delivery = exactDelivery(scenario);
      let posts = 0;
      const requestImpl = async () => {
        posts += 1;
        if (scenario === "429") {
          return { status: 429, body: Buffer.from("rate limited", "utf8") };
        }
        throw new Error("connection outcome unknown");
      };
      const first = createGmailAccountNativeMailboxTransportV1({
        sendOAuthCapability: issueSend(), readOAuthCapability: null,
        requestImpl, clock: () => NOW, directory, journalId: id,
      });
      await assert.rejects(first.deliverExact(delivery), scenario === "429"
        ? /HTTP_429_NO_RETRY/u : /AMBIGUOUS_NO_RETRY/u);
      const restarted = createGmailAccountNativeMailboxTransportV1({
        sendOAuthCapability: issueSend(), readOAuthCapability: null,
        requestImpl, clock: () => NOW, directory, journalId: id,
      });
      await assert.rejects(restarted.deliverExact(exactDelivery(scenario)),
        /SEND_ALREADY_ATTEMPTED_NO_RETRY/u);
      assert.equal(posts, 1);
      assert.deepEqual(journalEvents(directory, id).map((event) => event.eventType),
        ["SEND_ATTEMPTED"]);
    }
  });

test("recreated generic mailbox child resumes with receiveExact and never invokes Gmail sendExact twice",
  async (t) => {
    const root = privateRoot(t, "outsider-gmail-child-resume-v1");
    const gmailDirectory = path.join(root, "gmail");
    const childDirectory = path.join(root, "child-ledger");
    const id = journalId("generic-child");
    let posts = 0;
    const requestImpl = async () => {
      posts += 1;
      return { status: 200, body: Buffer.from(JSON.stringify({
        id: "gmail_child_sent", threadId: "gmail_child_thread",
      }), "utf8") };
    };
    const edge1 = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability: issueSend(), readOAuthCapability: null,
      requestImpl, clock: () => NOW, directory: gmailDirectory, journalId: id,
    });
    let firstSendCalls = 0;
    let firstReceiveCalls = 0;
    const makeChild = (edge, counters) =>
      createPermissionedMailboxOneUseTenderTransportV1({
        directory: childDirectory,
        ledgerId: "ledger_0123456789abcdef0123456789abcdef",
        adapterInstanceRefHash: hash("gmail-child-adapter"),
        clock: () => NOW,
        async revalidateAuthority({ binding }) {
          return { authorized: true,
            authorityGrantHash: binding.authorityGrantHash,
            validUntil: EXPIRY };
        },
        async sendExact(input) {
          counters.send += 1;
          return edge.sendExact(input);
        },
        async receiveExact(input) {
          counters.receive += 1;
          return edge.receiveExact(input);
        },
      });
    const body = Buffer.from(JSON.stringify({
      schema: "outsider/human-readable-one-use-tender/v1",
      requestedOutcome: "Return one fixed quote.",
    }), "utf8");
    const driveInput = {
      recipient: RECIPIENT,
      recipientMailboxRefHash: hash("gmail-child-mailbox"),
      tenderBytes: body,
      tenderHash: hash("gmail-child-tender"),
      authorityGrantHash: hash("gmail-child-authority"),
      effectDeadline: "2099-01-01T00:30:00.000Z",
      oneUseNonceHash: hash("gmail-child-nonce"),
      idempotencyKey: "gmail-child-idempotency",
    };
    const counters1 = { send: 0, receive: 0 };
    const first = await makeChild(edge1, counters1).drive(driveInput);
    firstSendCalls = counters1.send;
    firstReceiveCalls = counters1.receive;
    assert.equal(first.state, "PAUSED_RETRYABLE");
    assert.equal(firstSendCalls, 1);
    assert.equal(firstReceiveCalls, 1);

    const edge2 = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability: issueSend(), readOAuthCapability: null,
      requestImpl, clock: () => NOW, directory: gmailDirectory, journalId: id,
    });
    const counters2 = { send: 0, receive: 0 };
    const second = await makeChild(edge2, counters2).drive(driveInput);
    assert.equal(second.state, "PAUSED_RETRYABLE");
    assert.equal(counters2.send, 0);
    assert.equal(counters2.receive, 1);
    assert.equal(posts, 1);
  });

test("OAuth scopes are separate, revocable, expiry-bound and never projected with secrets",
  async (t) => {
    const send = issueSend();
    const read = issueRead();
    assert.equal(inspectGmailOAuthCapabilityV1(send).scope,
      "https://www.googleapis.com/auth/gmail.send");
    assert.equal(inspectGmailOAuthCapabilityV1(read).scope,
      "https://www.googleapis.com/auth/gmail.readonly");
    assert.equal(OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_BOUNDARY
      .broaderModifyOrFullMailboxScopeRequired, false);
    assert.equal(OUTSIDER_GMAIL_OFFICIAL_SOURCE_PINS_V1.sources.length, 6);
    const projection = JSON.stringify({ send, read,
      boundary: OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_BOUNDARY });
    for (const secret of [SEND_TOKEN, READ_TOKEN, SENDER]) {
      assert.equal(projection.includes(secret), false, secret);
    }
    revokeGmailOAuthCapabilityV1(send, { revokedAt: NOW });
    let requests = 0;
    const directory = privateRoot(t, "outsider-gmail-revoked-v1");
    const transport = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability: send, readOAuthCapability: null,
      async requestImpl() { requests += 1; throw new Error("not called"); },
      clock: () => NOW, directory, journalId: journalId("revoked"),
    });
    await assert.rejects(transport.deliverExact(exactDelivery("revoked")),
      /SEND_OAUTH_NOT_CURRENT/u);
    assert.equal(requests, 0);
    assert.equal(existsSync(path.join(directory,
      `${journalId("revoked")}.events.jsonl`)), false);

    const expired = issueGmailSendOAuthCapabilityV1({
      accessToken: "TEST_EXPIRED_TOKEN_NOT_AMBIENT_012345",
      accountRefHash: hash("gmail-account"),
      oauthGrantHash: hash("gmail-expired-send-grant"),
      senderAddress: SENDER,
      issuedAt: "2099-01-01T00:00:00.000Z",
      expiresAt: NOW,
    });
    const expiredDirectory = path.join(privateRoot(t,
      "outsider-gmail-expired-v1"), "journal");
    const expiredTransport = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability: expired, readOAuthCapability: null,
      async requestImpl() { requests += 1; throw new Error("not called"); },
      clock: () => NOW,
      directory: expiredDirectory,
      journalId: journalId("expired"),
    });
    await assert.rejects(expiredTransport.deliverExact(
      exactDelivery("expired")), /SEND_OAUTH_NOT_CURRENT/u);
    assert.equal(requests, 0);
  });

test('an exact order reply address resumes supplier messages in a new thread without mixing other orders', async t => {
  const directory = privateRoot(t, 'outsider-gmail-order-route');
  const id = journalId('order-route'), replyToAddress = 'buyer+order-one@outsider.example.com';
  const delivery = { ...exactDelivery('order-route'), replyToAddress };
  let posts = 0;
  const replies = {
    unrelated_order: { from: RECIPIENT, to: 'buyer+order-two@outsider.example.com' },
    unrelated_supplier: { from: 'other@seller.example.com', to: replyToAddress },
    intended_reply: { from: RECIPIENT, to: replyToAddress },
  };
  const requestImpl = async request => {
    if (request.method === 'POST') {
      posts++;
      return { status: 200, body: Buffer.from(JSON.stringify({ id: 'sent_order', threadId: 'original_thread' })) };
    }
    if (!request.url.includes('format=raw')) return { status: 200,
      body: Buffer.from(JSON.stringify({ messages: Object.keys(replies).map(key => ({ id: key, threadId: `${key}_thread` })) })) };
    const key = new URL(request.url).pathname.split('/').at(-1), reply = replies[key];
    const raw = Buffer.from([`From: ${reply.from}`, `To: ${reply.to}`, 'Subject: Updated quote', '', `Quote from ${key}`, ''].join('\r\n'));
    return { status: 200, body: Buffer.from(JSON.stringify({ id: key, threadId: `${key}_thread`,
      internalDate: String(Date.parse(NOW) + 1000), raw: raw.toString('base64url') })) };
  };
  const makeTransport = () => createGmailAccountNativeMailboxTransportV1({ sendOAuthCapability: issueSend(),
    readOAuthCapability: issueRead(), directory, journalId: id, clock: () => NOW, requestImpl });
  await makeTransport().deliverExact(delivery);
  const restarted = makeTransport();
  const received = await restarted.receiveExact({ transactionBindingHash: delivery.transactionBindingHash, recipient: RECIPIENT });
  assert.equal(received.status, 'RESPONSE');
  assert.match(received.responseBytes.toString(), /Quote from intended_reply/u);
  assert.doesNotMatch(received.responseBytes.toString(), /unrelated_order|unrelated_supplier/u);
  assert.equal(posts, 1);
  await assert.rejects(restarted.deliverExact({ ...exactDelivery('order-route'), replyToAddress: 'buyer+changed@outsider.example.com' }), /TRANSACTION_BINDING_CONFLICT/u);
  assert.equal(posts, 1, 'a changed route never resends the original inquiry');
});
