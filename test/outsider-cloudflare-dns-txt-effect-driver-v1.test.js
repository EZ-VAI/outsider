import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const ZONE_ID = "a".repeat(32);
const RECORD_ID = "b".repeat(32);
const ZONE_NAME = "example.com";
const API_TOKEN = "cf_test_token_abcdefghijklmnopqrstuvwxyz0123456789";
const clock = { now: Date.parse("2026-09-02T12:30:00.000Z") };
let activeFetch = null;
const priorFetch = globalThis.fetch;
const priorNow = Date.now;
globalThis.fetch = (...args) => activeFetch(...args);
Date.now = () => clock.now;
const subject = await import(
  "../src/outsider-cloudflare-dns-txt-interface-v1.js?effect-driver-tests=1");
globalThis.fetch = priorFetch;
Date.now = priorNow;

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function privateLedger(t, label) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    `outsider-cloudflare-driver-${label}-`)));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

let ledgerOrdinal = 0;

async function prepare(t, label) {
  clock.now = Date.parse("2026-09-02T12:30:00.000Z");
  const calls = [];
  activeFetch = async (rawUrl, options) => {
    const url = new URL(rawUrl);
    calls.push({ url, options });
    if (url.pathname === "/client/v4/user/tokens/verify") {
      return json({ success: true, result: { status: "active" } });
    }
    if (url.pathname === `/client/v4/zones/${ZONE_ID}`) {
      return json({ success: true,
        result: { id: ZONE_ID, name: ZONE_NAME } });
    }
    if (url.pathname === `/client/v4/zones/${ZONE_ID}/dns_records`
      && options.method === "GET") {
      return json({ success: true, result: [] });
    }
    return json({ success: false }, 404);
  };
  const tender = createTemporaryNetworkV2MultiSlotFixture({
    fixtureLabel: `cloudflare-driver-${label}`,
  }).tender;
  const credential = subject.sealCloudflareDnsTxtUserCapabilityV1({
    apiToken: API_TOKEN,
    zoneId: ZONE_ID,
    zoneName: ZONE_NAME,
  });
  const preflight = await subject.preflightCloudflareDnsTxtInterfaceV1({
    credentialCapability: credential,
    tender,
    expectedTenderHash: tender.tenderHash,
    publicOutcomeCommitmentHash: tender.exactOutcome.exactOutcomeHash,
    createDeadline: "2026-09-02T13:00:00.000Z",
    witnessDeadline: "2026-09-02T13:20:00.000Z",
    deleteDeadline: "2026-09-02T13:40:00.000Z",
  }, { timeoutMs: 100 });
  const fqdn = calls[2].url.searchParams.get("name");
  const handoff = subject.claimCloudflareDnsTxtDescribedInterfaceLeaseV1(
    preflight, { tender, expectedTenderHash: tender.tenderHash });
  ledgerOrdinal += 1;
  const ledgerDirectory = privateLedger(t, label);
  const driver = subject.createCloudflareDnsTxtEffectDriverV1(handoff, {
    ledgerDirectory,
    ledgerId: `ledger_${ledgerOrdinal.toString(16).padStart(32, "0")}`,
    expectedTenderHash: tender.tenderHash,
    expectedOutcomeCommitmentHash: tender.exactOutcome.exactOutcomeHash,
    adapterInstanceRefHash: h(`adapter:${label}`),
    permissionGrantHash: h(`caller-asserted-permission:${label}`),
    privateProjectionNonce: createHash("sha256")
      .update(`private:${label}`, "utf8").digest("hex"),
  });
  return { calls, driver, fqdn,
    ledgerDirectory,
    planHash: driver.publicProjection.planHash,
    outcomeHash: tender.exactOutcome.exactOutcomeHash };
}

test("driver admission is private, durable, redacted, and performs no I/O",
  async (t) => {
    const prepared = await prepare(t, "admit");
    assert.equal(prepared.calls.length, 3);
    const projection = prepared.driver.publicProjection;
    assert.equal(projection.stage, "DURABLY_ADMITTED_NO_NETWORK_HOLD");
    assert.equal(projection.durableOccurrenceCount, 1);
    assert.equal(projection.networkIoPerformedByThisCall, false);
    assert.equal(projection.resourceOwnerAuthorityEstablished, false);
    assert.equal(projection.capacityReserved, false);
    assert.equal(projection.decisionState, "HOLD");
    assert.deepEqual(projection.enabledCapabilities, []);
    assert.deepEqual(projection.provenAuthorityCapabilities, []);
    const serialized = JSON.stringify(prepared.driver);
    assert.equal(serialized.includes(API_TOKEN), false);
    assert.equal(serialized.includes(ZONE_ID), false);
    assert.equal(serialized.includes(ZONE_NAME), false);
    assert.equal(serialized.includes(prepared.fqdn), false);
    await assert.rejects(subject.createCloudflareDnsTxtRecordOnceV1(
      { ...prepared.driver }, { expectedPlanHash: prepared.planHash },
      { timeoutMs: 10 }), /EFFECT_DRIVER_NOT_MODULE_ISSUED/u);
    assert.equal(prepared.calls.length, 3);
  });

test("create is durably attempted before one POST; Cloudflare ACK is not outcome",
  async (t) => {
    const prepared = await prepare(t, "create-witness");
    const effectCalls = [];
    activeFetch = async (rawUrl, options) => {
      const url = new URL(rawUrl);
      effectCalls.push({ url, options });
      if (url.origin === "https://api.cloudflare.com"
        && options.method === "POST") {
        assert.deepEqual(readdirSync(path.join(prepared.ledgerDirectory,
          "entries")), ["000000000001.json", "000000000002.json",
          "000000000003.json"]);
        const body = JSON.parse(Buffer.from(options.body).toString("utf8"));
        assert.deepEqual(body, { type: "TXT", name: prepared.fqdn,
          content: prepared.outcomeHash, ttl: 60 });
        return json({ success: true, result: {
          id: RECORD_ID, ...body,
        } });
      }
      if (url.origin === "https://dns.google") {
        return json({ Status: 0, Answer: [{ type: 16,
          data: `"${prepared.outcomeHash}"` }] });
      }
      return json({ success: false }, 404);
    };
    const created = await subject.createCloudflareDnsTxtRecordOnceV1(
      prepared.driver, { expectedPlanHash: prepared.planHash },
      { timeoutMs: 50 });
    assert.equal(created.publicProjection.createPostPerformedByThisCall, true);
    assert.equal(created.publicProjection.totalSubmitAttemptOccurrenceCount, 1);
    assert.equal(created.publicProjection.createProviderReceiptObserved, true);
    assert.equal(created.publicProjection.createIndependentlyObserved, false);
    assert.equal(created.publicProjection
      .createProviderReceiptIsIndependentOutcomeTruth, false);
    assert.equal(effectCalls.length, 1);
    assert.equal(effectCalls[0].url.origin, "https://api.cloudflare.com");
    const witnessed = await subject.observeCloudflareDnsTxtCreationV1(
      prepared.driver, { expectedPlanHash: prepared.planHash }, {
        requestTimeoutMs: 50, pollIntervalMs: 1, maxWaitMs: 5,
      });
    assert.equal(witnessed.publicProjection.createIndependentlyObserved, true);
    assert.match(witnessed.publicProjection
      .createIndependentObservationEvidenceHash,
    /^sha256:[a-f0-9]{64}$/u);
    assert.equal(effectCalls[1].url.origin, "https://dns.google");
    assert.equal(effectCalls[1].options.headers.Authorization, undefined);
  });

test("ambiguous POST is never retried and only exact GET may reconcile it",
  async (t) => {
    const prepared = await prepare(t, "create-reconcile");
    const effectCalls = [];
    activeFetch = async (rawUrl, options) => {
      effectCalls.push({ url: new URL(rawUrl), options });
      return new Promise(() => {});
    };
    const ambiguous = await subject.createCloudflareDnsTxtRecordOnceV1(
      prepared.driver, { expectedPlanHash: prepared.planHash },
      { timeoutMs: 2 });
    assert.equal(ambiguous.publicProjection.stage,
      "CREATE_COMMIT_UNKNOWN_READ_ONLY_RECONCILE_HOLD");
    assert.equal(effectCalls.length, 1);
    await subject.createCloudflareDnsTxtRecordOnceV1(prepared.driver,
      { expectedPlanHash: prepared.planHash }, { timeoutMs: 2 });
    assert.equal(effectCalls.length, 1);
    activeFetch = async (rawUrl, options) => {
      const url = new URL(rawUrl);
      effectCalls.push({ url, options });
      return json({ success: true, result: [{
        id: RECORD_ID, type: "TXT", name: prepared.fqdn,
        content: prepared.outcomeHash, ttl: 60,
      }] });
    };
    const reconciled = await subject.reconcileCloudflareDnsTxtCreateV1(
      prepared.driver, { expectedPlanHash: prepared.planHash },
      { timeoutMs: 50 });
    assert.equal(reconciled.publicProjection.createProviderReceiptObserved,
      true);
    assert.equal(effectCalls.length, 2);
    assert.deepEqual(effectCalls.map(({ options }) => options.method),
      ["POST", "GET"]);
    assert.equal(effectCalls[1].url.origin, "https://api.cloudflare.com");
  });

test("delete ACK stays HOLD until Google observes absence, with bounded polling",
  async (t) => {
    const prepared = await prepare(t, "delete-witness");
    let deleted = false;
    let recoveryReads = 0;
    const effectCalls = [];
    activeFetch = async (rawUrl, options) => {
      const url = new URL(rawUrl);
      effectCalls.push({ url, options });
      if (url.origin === "https://api.cloudflare.com"
        && options.method === "POST") {
        const body = JSON.parse(Buffer.from(options.body).toString("utf8"));
        return json({ success: true, result: { id: RECORD_ID, ...body } });
      }
      if (url.origin === "https://api.cloudflare.com"
        && options.method === "DELETE") {
        deleted = true;
        return json({ success: true, result: { id: RECORD_ID } });
      }
      if (url.origin === "https://dns.google" && !deleted) {
        return json({ Status: 0, Answer: [{ type: 16,
          data: `"${prepared.outcomeHash}"` }] });
      }
      if (url.origin === "https://dns.google") {
        recoveryReads += 1;
        return recoveryReads === 1
          ? json({ Status: 0, Answer: [{ type: 16,
            data: `"${prepared.outcomeHash}"` }] })
          : json({ Status: 3 });
      }
      return json({ success: false }, 404);
    };
    await subject.createCloudflareDnsTxtRecordOnceV1(prepared.driver,
      { expectedPlanHash: prepared.planHash }, { timeoutMs: 50 });
    await subject.observeCloudflareDnsTxtCreationV1(prepared.driver,
      { expectedPlanHash: prepared.planHash }, {
        requestTimeoutMs: 50, pollIntervalMs: 1, maxWaitMs: 5,
      });
    const deletion = await subject.deleteCloudflareDnsTxtRecordOnceV1(
      prepared.driver, { expectedPlanHash: prepared.planHash },
      { timeoutMs: 50 });
    assert.equal(deletion.publicProjection.deleteProviderReceiptObserved, true);
    assert.equal(deletion.publicProjection.recoveryIndependentlyObserved, false);
    assert.equal(deletion.publicProjection
      .deleteProviderReceiptIsIndependentRecoveryTruth, false);
    const recovered = await subject.observeCloudflareDnsTxtRecoveryV1(
      prepared.driver, { expectedPlanHash: prepared.planHash }, {
        requestTimeoutMs: 50, pollIntervalMs: 1, maxWaitMs: 5,
      });
    assert.equal(recoveryReads, 2);
    assert.equal(recovered.publicProjection.recoveryIndependentlyObserved,
      true);
    assert.match(recovered.publicProjection
      .recoveryIndependentObservationEvidenceHash,
    /^sha256:[a-f0-9]{64}$/u);
    const methods = effectCalls.map(({ options }) => options.method);
    assert.deepEqual(methods, ["POST", "GET", "DELETE", "GET", "GET"]);
  });

test("ambiguous DELETE is never retried and exact absence reconciles only receipt",
  async (t) => {
    const prepared = await prepare(t, "delete-reconcile");
    let phase = "create";
    const effectCalls = [];
    activeFetch = async (rawUrl, options) => {
      const url = new URL(rawUrl);
      effectCalls.push({ url, options });
      if (phase === "create" && options.method === "POST") {
        const body = JSON.parse(Buffer.from(options.body).toString("utf8"));
        return json({ success: true, result: { id: RECORD_ID, ...body } });
      }
      if (phase === "witness" && url.origin === "https://dns.google") {
        return json({ Status: 0, Answer: [{ type: 16,
          data: `"${prepared.outcomeHash}"` }] });
      }
      if (phase === "delete" && options.method === "DELETE") {
        return new Promise(() => {});
      }
      if (phase === "reconcile" && options.method === "GET") {
        return json({ success: true, result: [] });
      }
      return json({ success: false }, 404);
    };
    await subject.createCloudflareDnsTxtRecordOnceV1(prepared.driver,
      { expectedPlanHash: prepared.planHash }, { timeoutMs: 50 });
    phase = "witness";
    await subject.observeCloudflareDnsTxtCreationV1(prepared.driver,
      { expectedPlanHash: prepared.planHash }, {
        requestTimeoutMs: 50, pollIntervalMs: 1, maxWaitMs: 5,
      });
    phase = "delete";
    const ambiguous = await subject.deleteCloudflareDnsTxtRecordOnceV1(
      prepared.driver, { expectedPlanHash: prepared.planHash },
      { timeoutMs: 2 });
    assert.equal(ambiguous.publicProjection.stage,
      "DELETE_COMMIT_UNKNOWN_READ_ONLY_RECONCILE_HOLD");
    const countAfterDelete = effectCalls.length;
    await subject.deleteCloudflareDnsTxtRecordOnceV1(prepared.driver,
      { expectedPlanHash: prepared.planHash }, { timeoutMs: 2 });
    assert.equal(effectCalls.length, countAfterDelete);
    phase = "reconcile";
    const reconciled = await subject.reconcileCloudflareDnsTxtDeleteV1(
      prepared.driver, { expectedPlanHash: prepared.planHash },
      { timeoutMs: 50 });
    assert.equal(reconciled.publicProjection.deleteProviderReceiptObserved,
      true);
    assert.equal(reconciled.publicProjection.recoveryIndependentlyObserved,
      false);
    assert.equal(effectCalls.filter(({ options }) => options.method === "DELETE")
      .length, 1);
  });
