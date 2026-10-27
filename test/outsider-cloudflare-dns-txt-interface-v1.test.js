import assert from "node:assert/strict";
import test from "node:test";

import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const ZONE_ID = "a".repeat(32);
const ZONE_NAME = "example.com";
const API_TOKEN = "cf_test_token_abcdefghijklmnopqrstuvwxyz0123456789";
const START = Date.parse("2026-09-02T12:30:00.000Z");
let moduleOrdinal = 0;

async function loadWith(fetchImpl, initialNow = START) {
  const priorFetch = globalThis.fetch;
  const priorNow = Date.now;
  const clock = { now: initialNow };
  globalThis.fetch = fetchImpl;
  Date.now = () => clock.now;
  try {
    moduleOrdinal += 1;
    const module = await import(
      `../src/outsider-cloudflare-dns-txt-interface-v1.js?test=${moduleOrdinal}`);
    return { module, clock };
  } finally {
    globalThis.fetch = priorFetch;
    Date.now = priorNow;
  }
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function successfulFetch(calls) {
  return async (rawUrl, options) => {
    const url = new URL(rawUrl);
    calls.push({ url, options });
    if (url.pathname === "/client/v4/user/tokens/verify") {
      return json({ success: true, result: { status: "active" } });
    }
    if (url.pathname === `/client/v4/zones/${ZONE_ID}`) {
      return json({ success: true,
        result: { id: ZONE_ID, name: ZONE_NAME } });
    }
    if (url.pathname === `/client/v4/zones/${ZONE_ID}/dns_records`) {
      return json({ success: true, result: [] });
    }
    return json({ success: false }, 404);
  };
}

function request(module, tender, credentialCapability, overrides = {}) {
  return {
    credentialCapability,
    tender,
    expectedTenderHash: tender.tenderHash,
    publicOutcomeCommitmentHash: tender.exactOutcome.exactOutcomeHash,
    createDeadline: "2026-09-02T13:00:00.000Z",
    witnessDeadline: "2026-09-02T13:20:00.000Z",
    deleteDeadline: "2026-09-02T13:40:00.000Z",
    ...overrides,
  };
}

function credential(module, overrides = {}) {
  return module.sealCloudflareDnsTxtUserCapabilityV1({
    apiToken: API_TOKEN,
    zoneId: ZONE_ID,
    zoneName: ZONE_NAME,
    ...overrides,
  });
}

test("fixed Cloudflare reads authenticate access and issue only a private HOLD lease",
  async () => {
    const calls = [];
    const { module } = await loadWith(successfulFetch(calls));
    const tender = createTemporaryNetworkV2MultiSlotFixture({
      fixtureLabel: "cloudflare-success",
    }).tender;
    const capability = credential(module);
    assert.deepEqual(Reflect.ownKeys(capability), []);
    assert.equal(JSON.stringify(capability), "{}");

    const result = await module.preflightCloudflareDnsTxtInterfaceV1(
      request(module, tender, capability), { timeoutMs: 100 });
    const projection = result.publicProjection;
    assert.equal(projection.status, "SUCCEEDED");
    assert.equal(projection.phase, "ACCESS_AUTHENTICATED");
    assert.equal(projection.txtContent, tender.exactOutcome.exactOutcomeHash);
    assert.equal(projection.txtTtlSeconds, 60);
    assert.equal(projection.describedInterfaceLeaseAvailable, true);
    assert.equal(projection.offerEstablished, false);
    assert.equal(projection.capacityReserved, false);
    assert.equal(projection.resourceOwnerAuthorityEstablished, false);
    assert.equal(projection.decisionState, "HOLD");
    assert.equal(projection.authority, "NONE");
    assert.equal(projection.actionReady, false);
    assert.equal(projection.executable, false);
    assert.equal(JSON.stringify(result).includes(API_TOKEN), false);
    assert.equal(JSON.stringify(result).includes(ZONE_ID), false);
    assert.equal(JSON.stringify(result).includes(ZONE_NAME), false);

    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(({ url }) => url.origin), [
      "https://api.cloudflare.com",
      "https://api.cloudflare.com",
      "https://api.cloudflare.com",
    ]);
    assert.deepEqual(calls.map(({ options }) => options.method),
      ["GET", "GET", "GET"]);
    for (const { options } of calls) {
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      assert.equal(options.headers.Authorization, `Bearer ${API_TOKEN}`);
      assert.equal(Object.hasOwn(options.headers, "Cookie"), false);
    }
    const recordRequest = calls[2].url;
    assert.equal(recordRequest.searchParams.get("type"), "TXT");
    assert.equal(recordRequest.searchParams.get("per_page"), "2");
    assert.match(recordRequest.searchParams.get("name"),
      /^outsider-proof-[a-f0-9]{32}\.example\.com$/u);
    assert.equal(projection.recursiveDnsQueryPerformed, false);
    assert.equal(module.OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_PROFILE
      .adapterContractReplayedByThisPreflight, false);
  });

test("an existing exact TXT name stays HOLD and receives no lease", async () => {
  const calls = [];
  const fetchImpl = async (rawUrl, options) => {
    const url = new URL(rawUrl);
    calls.push({ url, options });
    if (url.pathname === "/client/v4/user/tokens/verify") {
      return json({ success: true, result: { status: "active" } });
    }
    if (url.pathname === `/client/v4/zones/${ZONE_ID}`) {
      return json({ success: true,
        result: { id: ZONE_ID, name: ZONE_NAME } });
    }
    return json({ success: true, result: [{ id: "existing" }] });
  };
  const { module } = await loadWith(fetchImpl);
  const tender = createTemporaryNetworkV2MultiSlotFixture({
    fixtureLabel: "cloudflare-existing",
  }).tender;
  const result = await module.preflightCloudflareDnsTxtInterfaceV1(
    request(module, tender, credential(module)), { timeoutMs: 100 });
  assert.equal(calls.length, 3);
  assert.equal(result.publicProjection.status, "FAILED");
  assert.equal(result.publicProjection.failureCode, "TXT_RECORD_NOT_UNIQUE");
  assert.equal(result.publicProjection.describedInterfaceLeaseAvailable, false);
  assert.throws(() => module.claimCloudflareDnsTxtDescribedInterfaceLeaseV1(
    result, { tender, expectedTenderHash: tender.tenderHash }),
  /DESCRIBED_INTERFACE_LEASE_NOT_MODULE_ISSUED/u);
});

test("copied, cross-tender, reused, and expired leases reject without I/O",
  async () => {
    const calls = [];
    const { module, clock } = await loadWith(successfulFetch(calls));
    const tender = createTemporaryNetworkV2MultiSlotFixture({
      fixtureLabel: "cloudflare-lease-a",
    }).tender;
    const otherTender = createTemporaryNetworkV2MultiSlotFixture({
      fixtureLabel: "cloudflare-lease-b",
    }).tender;
    const cap = credential(module);
    const first = await module.preflightCloudflareDnsTxtInterfaceV1(
      request(module, tender, cap), { timeoutMs: 100 });
    const expired = await module.preflightCloudflareDnsTxtInterfaceV1(
      request(module, tender, cap), { timeoutMs: 100 });
    const afterPreflights = calls.length;

    assert.throws(() => module.claimCloudflareDnsTxtDescribedInterfaceLeaseV1(
      { ...first }, { tender, expectedTenderHash: tender.tenderHash }),
    /DESCRIBED_INTERFACE_LEASE_NOT_MODULE_ISSUED/u);
    assert.throws(() => module.claimCloudflareDnsTxtDescribedInterfaceLeaseV1(
      first, { tender: otherTender,
        expectedTenderHash: otherTender.tenderHash }), /LEASE_TENDER_MISMATCH/u);
    const handoff = module.claimCloudflareDnsTxtDescribedInterfaceLeaseV1(
      first, { tender, expectedTenderHash: tender.tenderHash });
    assert.deepEqual(Reflect.ownKeys(handoff), []);
    assert.equal(JSON.stringify(handoff), "{}");
    assert.throws(() => module.claimCloudflareDnsTxtDescribedInterfaceLeaseV1(
      first, { tender, expectedTenderHash: tender.tenderHash }),
    /DESCRIBED_INTERFACE_LEASE_ALREADY_CLAIMED/u);

    clock.now = Date.parse("2026-09-02T13:00:00.000Z");
    assert.throws(() => module.claimCloudflareDnsTxtDescribedInterfaceLeaseV1(
      expired, { tender, expectedTenderHash: tender.tenderHash }),
    /LEASE_EXPIRED/u);
    assert.equal(calls.length, afterPreflights);
  });

test("malformed zone, capability, tender binding, and deadlines fail before I/O",
  async () => {
    const calls = [];
    const { module } = await loadWith(successfulFetch(calls));
    const tender = createTemporaryNetworkV2MultiSlotFixture({
      fixtureLabel: "cloudflare-malformed",
    }).tender;
    assert.throws(() => credential(module, { zoneName: "EXAMPLE.com" }),
      /ZONE_NAME_INVALID/u);
    assert.throws(() => credential(module, { zoneId: "not-a-zone" }),
      /ZONE_ID_INVALID/u);
    const cap = credential(module);
    assert.rejects(module.preflightCloudflareDnsTxtInterfaceV1(
      request(module, tender, { ...cap }), { timeoutMs: 100 }),
    /CAPABILITY_NOT_MODULE_ISSUED/u);
    assert.rejects(module.preflightCloudflareDnsTxtInterfaceV1(
      request(module, tender, cap, {
        expectedTenderHash: `sha256:${"0".repeat(64)}`,
      }), { timeoutMs: 100 }), /TENDER_SOURCE_REPLAY_FAILED/u);
    assert.rejects(module.preflightCloudflareDnsTxtInterfaceV1(
      request(module, tender, cap, {
        witnessDeadline: "2026-09-02T12:59:00.000Z",
      }), { timeoutMs: 100 }), /DEADLINE_ORDER_OR_WINDOW_INVALID/u);
    assert.equal(calls.length, 0);
  });

test("the whole preflight is time bounded even when transport ignores abort",
  async () => {
    let calls = 0;
    const { module } = await loadWith(async () => {
      calls += 1;
      return new Promise(() => {});
    });
    const tender = createTemporaryNetworkV2MultiSlotFixture({
      fixtureLabel: "cloudflare-timeout",
    }).tender;
    const result = await module.preflightCloudflareDnsTxtInterfaceV1(
      request(module, tender, credential(module)), { timeoutMs: 2 });
    assert.equal(calls, 1);
    assert.equal(result.publicProjection.status, "FAILED");
    assert.equal(result.publicProjection.failureCode, "TIMEOUT");
    assert.equal(result.publicProjection.describedInterfaceLeaseAvailable, false);
  });
