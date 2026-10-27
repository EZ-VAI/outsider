import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createPermissionedMailboxOneUseTenderTransportV1,
} from "../src/outsider-permissioned-mailbox-one-use-tender-transport-v1.js";
import {
  claimWebNativeMailtoOneUseTenderSourcesV1,
  dispatchWebNativeMailtoOneUseTenderV1,
} from "../src/outsider-web-native-mailto-one-use-tender-bridge-v1.js";
import {
  discoverWebNativeTransactionSurfacesV1,
} from "../src/outsider-web-native-transaction-surface-discovery-adapter-v1.js";

const PUBLIC_ADDRESS = "93.184.216.34";
const h = (value) => `sha256:${createHash("sha256")
  .update(value, "utf8").digest("hex")}`;

function response(body) {
  const bytes = Buffer.from(body, "utf8");
  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8",
      "content-length": String(bytes.length) },
    body: bytes,
    remoteAddress: PUBLIC_ADDRESS,
    remoteFamily: "IPv4",
    tlsAuthorized: true,
    tlsServernameVerified: true,
    tlsCertificateHostnameVerified: true,
  };
}

async function discovery(body =
  "<a href='mailto:orders@seller.example.com?subject=One-use%20tender'>Request</a>") {
  return discoverWebNativeTransactionSurfacesV1({
    sellerOrigin: "https://seller.example.com",
    tenderHash: h("tender"),
    requirementId: "resource_0123456789abcdef0123456789abcdef",
    observedAt: "2099-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T01:00:00.000Z",
    privateProjectionNonce: h("surface-private-nonce"),
  }, { transportConfig: {
    async lookupImpl() {
      return [{ address: PUBLIC_ADDRESS, family: 4 }];
    },
    async requestImpl() { return response(body); },
  } });
}

function privateLedger(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-web-native-mailto-bridge-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

function clock() {
  const values = [
    "2099-01-01T00:01:00.000Z",
    "2099-01-01T00:01:01.000Z",
    "2099-01-01T00:01:02.000Z",
    "2099-01-01T00:01:03.000Z",
  ];
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function bridgeInput(surfaceDiscoveryResult, surfaceRefHash, transport) {
  return {
    surfaceDiscoveryResult,
    surfaceRefHash,
    tenderBytes: Buffer.from("exact one-use tender\n", "utf8"),
    tenderHash: h("tender"),
    authorityGrantHash: h("owner-authorized-contact"),
    effectDeadline: "2099-01-01T00:30:00.000Z",
    expectedMailboxTransportBindingHash: transport.transportBindingHash,
  };
}

function mailboxAt(directory, overrides = {}) {
  return createPermissionedMailboxOneUseTenderTransportV1({
    directory,
    ledgerId: "ledger_0123456789abcdef0123456789abcdef",
    adapterInstanceRefHash: h("account-native-mailbox-adapter"),
    clock: clock(),
    async revalidateAuthority({ binding }) {
      return { authorized: true,
        authorityGrantHash: binding.authorityGrantHash,
        validUntil: "2099-01-01T01:00:00.000Z" };
    },
    async sendExact() {
      return { status: "SENT",
        acknowledgementBytes: Buffer.from("queued", "utf8") };
    },
    async receiveExact() {
      return { status: "RESPONSE",
        responseBytes: Buffer.from("counterparty source bytes", "utf8") };
    },
    ...overrides,
  });
}

function mailbox(t, overrides = {}) {
  return mailboxAt(privateLedger(t), overrides);
}

test("binds one observed mailto to one permissioned mailbox effect without projecting private sources",
  async (t) => {
    const surfaceResult = await discovery();
    const surface = surfaceResult.publicProjection.surfaceOccurrences[0];
    const sends = [];
    const transport = mailbox(t, {
      async sendExact(input) {
        sends.push(input);
        return { status: "SENT",
          acknowledgementBytes: Buffer.from("queued", "utf8") };
      },
    });
    const result = await dispatchWebNativeMailtoOneUseTenderV1(
      bridgeInput(surfaceResult, surface.surfaceRefHash, transport), {
        mailboxTransport: transport,
      });
    assert.equal(result.publicProjection.transportState, "RESPONSE_OBSERVED");
    assert.equal(result.publicProjection.surfaceRefHash,
      surface.surfaceRefHash);
    assert.equal(result.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(result.publicProjection.capacityReserved, false);
    assert.equal(result.publicProjection.paymentPerformed, false);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].recipient, "orders@seller.example.com");
    assert.equal(sends[0].recipientMailboxRefHash, surface.surfaceRefHash);
    const publicJson = JSON.stringify(result);
    assert.equal(publicJson.includes("orders@seller.example.com"), false);
    assert.equal(publicJson.includes("counterparty source bytes"), false);
    assert.equal(publicJson.includes("queued"), false);

    const sources = claimWebNativeMailtoOneUseTenderSourcesV1(result);
    assert.equal(sources.recipient, "orders@seller.example.com");
    assert.equal(sources.transportResult.responseBytes.toString("utf8"),
      "counterparty source bytes");
    assert.throws(() => claimWebNativeMailtoOneUseTenderSourcesV1(result),
      /PRIVATE_BRIDGE_RESULT_INVALID_OR_REPLAYED/u);
  });

test("a non-existent public surface fails before consuming the private lease or invoking send",
  async (t) => {
    const surfaceResult = await discovery();
    const actual = surfaceResult.publicProjection.surfaceOccurrences[0];
    let sends = 0;
    const transport = mailbox(t, { async sendExact() {
      sends += 1;
      return { status: "SENT" };
    } });
    await assert.rejects(dispatchWebNativeMailtoOneUseTenderV1(
      bridgeInput(surfaceResult, h("different-surface"), transport), {
        mailboxTransport: transport,
      }), /EXACT_MAILTO_SURFACE_NOT_FOUND/u);
    assert.equal(sends, 0);
    const result = await dispatchWebNativeMailtoOneUseTenderV1(
      bridgeInput(surfaceResult, actual.surfaceRefHash, transport), {
        mailboxTransport: transport,
      });
    assert.equal(result.publicProjection.transportState, "RESPONSE_OBSERVED");
    assert.equal(sends, 1);
  });

test("contact authority refusal prevents the account-native send",
  async (t) => {
    const surfaceResult = await discovery();
    const surface = surfaceResult.publicProjection.surfaceOccurrences[0];
    let sends = 0;
    const transport = mailbox(t, {
      async revalidateAuthority({ binding }) {
        return { authorized: false,
          authorityGrantHash: binding.authorityGrantHash,
          validUntil: "2099-01-01T01:00:00.000Z" };
      },
      async sendExact() {
        sends += 1;
        return { status: "SENT" };
      },
    });
    await assert.rejects(dispatchWebNativeMailtoOneUseTenderV1(
      bridgeInput(surfaceResult, surface.surfaceRefHash, transport), {
        mailboxTransport: transport,
      }), /MAILBOX_TRANSPORT_FAILED/u);
    assert.equal(sends, 0);
  });

test("an observed mailto with multiple recipients is never passed to the mailbox edge",
  async (t) => {
    const surfaceResult = await discovery(
      "<a href='mailto:a@seller.example.com,b@seller.example.com'>Request</a>");
    const surface = surfaceResult.publicProjection.surfaceOccurrences[0];
    let sends = 0;
    const transport = mailbox(t, { async sendExact() {
      sends += 1;
      return { status: "SENT" };
    } });
    await assert.rejects(dispatchWebNativeMailtoOneUseTenderV1(
      bridgeInput(surfaceResult, surface.surfaceRefHash, transport), {
        mailboxTransport: transport,
      }), /EXACTLY_ONE_MAILTO_RECIPIENT_REQUIRED/u);
    assert.equal(sends, 0);
  });

test("only a factory-issued transport with the frozen binding can consume the surface",
  async (t) => {
    const firstSurfaceResult = await discovery();
    const firstSurface = firstSurfaceResult.publicProjection.surfaceOccurrences[0];
    let forgedCalls = 0;
    await assert.rejects(dispatchWebNativeMailtoOneUseTenderV1({
      ...bridgeInput(firstSurfaceResult, firstSurface.surfaceRefHash, {
        transportBindingHash: h("forged-binding"),
      }),
    }, { mailboxTransport: { async drive() { forgedCalls += 1; } } }),
    /MAILBOX_TRANSPORT_NOT_FACTORY_ISSUED/u);
    assert.equal(forgedCalls, 0);

    const secondSurfaceResult = await discovery();
    const secondSurface = secondSurfaceResult.publicProjection
      .surfaceOccurrences[0];
    const expectedTransport = mailbox(t);
    const differentTransport = mailbox(t);
    await assert.rejects(dispatchWebNativeMailtoOneUseTenderV1(
      bridgeInput(secondSurfaceResult, secondSurface.surfaceRefHash,
        expectedTransport), { mailboxTransport: differentTransport }),
    /MAILBOX_TRANSPORT_BINDING_MISMATCH/u);
  });

test("re-discovery plus transport restart resumes the same deterministic effect without a second send",
  async (t) => {
    const directory = privateLedger(t);
    let sends = 0;
    let receives = 0;
    const edge = {
      async sendExact() {
        sends += 1;
        return { status: "SENT", acknowledgementBytes: null };
      },
      async receiveExact() {
        receives += 1;
        return receives === 1
          ? { status: "PENDING", retryAfter: null }
          : { status: "RESPONSE",
            responseBytes: Buffer.from("later exact response", "utf8") };
      },
    };
    const firstTransport = mailboxAt(directory, edge);
    const firstDiscovery = await discovery();
    const firstSurface = firstDiscovery.publicProjection.surfaceOccurrences[0];
    const first = await dispatchWebNativeMailtoOneUseTenderV1(
      bridgeInput(firstDiscovery, firstSurface.surfaceRefHash,
        firstTransport), { mailboxTransport: firstTransport });
    assert.equal(first.publicProjection.transportState, "PAUSED_RETRYABLE");

    const restartedTransport = mailboxAt(directory, {
      ...edge,
      clock: () => "2099-01-01T00:02:00.000Z",
    });
    assert.equal(restartedTransport.transportBindingHash,
      firstTransport.transportBindingHash);
    const rediscovered = await discovery();
    const rediscoveredSurface = rediscovered.publicProjection
      .surfaceOccurrences[0];
    assert.equal(rediscoveredSurface.surfaceRefHash, firstSurface.surfaceRefHash);
    const resumed = await dispatchWebNativeMailtoOneUseTenderV1(
      bridgeInput(rediscovered, rediscoveredSurface.surfaceRefHash,
        firstTransport), { mailboxTransport: restartedTransport });
    assert.equal(resumed.publicProjection.transportState, "RESPONSE_OBSERVED");
    assert.equal(sends, 1);
    assert.equal(receives, 2);
    assert.equal(resumed.publicProjection.effectIdHash,
      first.publicProjection.effectIdHash);
  });

test("encoded separators, whitespace, aliases, and malformed addr-spec never reach send",
  async (t) => {
    const targets = [
      "a%40seller.example.com%3Bb%40seller.example.com",
      "%20orders%40seller.example.com",
      "Display%20Name%20%3Corders%40seller.example.com%3E",
      "orders%40localhost",
    ];
    for (const target of targets) {
      const surfaceResult = await discovery(
        `<a href='mailto:${target}'>Request</a>`);
      const surface = surfaceResult.publicProjection.surfaceOccurrences[0];
      let sends = 0;
      const transport = mailbox(t, { async sendExact() {
        sends += 1;
        return { status: "SENT" };
      } });
      await assert.rejects(dispatchWebNativeMailtoOneUseTenderV1(
        bridgeInput(surfaceResult, surface.surfaceRefHash, transport), {
          mailboxTransport: transport,
        }), /EXACTLY_ONE_(?:MAILTO_RECIPIENT|CANONICAL_ADDR_SPEC)_REQUIRED/u);
      assert.equal(sends, 0);
    }
  });
