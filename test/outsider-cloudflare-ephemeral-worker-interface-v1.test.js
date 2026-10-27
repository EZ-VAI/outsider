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

import { canonicalizeStrict } from "../src/canonical.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const ACCOUNT_ID = "a".repeat(32);
const ACCOUNT_SUBDOMAIN = "outsider-test-account";
const API_TOKEN = "cf_test_token_abcdefghijklmnopqrstuvwxyz0123456789";
const clock = { now: Date.parse("2026-09-02T12:30:00.000Z") };
let activeFetch;
const priorFetch = globalThis.fetch;
const priorNow = Date.now;
globalThis.fetch = (...args) => activeFetch(...args);
Date.now = () => clock.now;
const subject = await import(
  "../src/outsider-cloudflare-ephemeral-worker-interface-v1.js?tests=1");
globalThis.fetch = priorFetch;
Date.now = priorNow;

function h(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status,
    headers: { "content-type": "application/json", ...headers } });
}

function ledgerTarget(t, label) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    `outsider-worker-${label}-`)));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

let ordinal = 0;

async function prepare(t, label) {
  clock.now = Date.parse("2026-09-02T12:30:00.000Z");
  const preflightCalls = [];
  activeFetch = async (rawUrl, options) => {
    const url = new URL(rawUrl);
    preflightCalls.push({ url, options });
    if (url.pathname === "/client/v4/user/tokens/verify") {
      return json({ success: true, result: { status: "active" } });
    }
    if (url.pathname
      === `/client/v4/accounts/${ACCOUNT_ID}/workers/subdomain`) {
      return json({ success: true,
        result: { subdomain: ACCOUNT_SUBDOMAIN } });
    }
    if (/\/workers\/scripts\/outsider-proof-[a-f0-9]{32}\/subdomain$/u
      .test(url.pathname)) return new Response(null, { status: 404 });
    return json({ success: false }, 500);
  };
  const tender = createTemporaryNetworkV2MultiSlotFixture({
    fixtureLabel: `ephemeral-worker-${label}`,
  }).tender;
  const capability = subject.sealCloudflareEphemeralWorkerCapabilityV1({
    apiToken: API_TOKEN,
    accountId: ACCOUNT_ID,
    workersDevSubdomain: ACCOUNT_SUBDOMAIN,
  });
  const preflight = await subject.preflightCloudflareEphemeralWorkerV1({
    credentialCapability: capability,
    tender,
    expectedTenderHash: tender.tenderHash,
    publicOutcomeCommitmentHash: tender.exactOutcome.exactOutcomeHash,
    uploadDeadline: "2026-09-02T13:00:00.000Z",
    witnessDeadline: "2026-09-02T13:20:00.000Z",
    deleteDeadline: "2026-09-02T13:40:00.000Z",
  }, { timeoutMs: 100 });
  const scriptName = preflightCalls[2].url.pathname.split("/").at(-2);
  const handoff = subject.claimCloudflareEphemeralWorkerLeaseV1(preflight, {
    tender, expectedTenderHash: tender.tenderHash,
  });
  const ledgerDirectory = ledgerTarget(t, label);
  ordinal += 1;
  const driver = subject.createCloudflareEphemeralWorkerDriverV1(handoff, {
    ledgerDirectory,
    ledgerId: `ledger_${ordinal.toString(16).padStart(32, "0")}`,
    expectedTenderHash: tender.tenderHash,
    expectedOutcomeCommitmentHash: tender.exactOutcome.exactOutcomeHash,
    adapterInstanceRefHash: h(`adapter:${label}`),
    permissionGrantHash: h(`caller-permission:${label}`),
    privateProjectionNonce: createHash("sha256")
      .update(`private:${label}`, "utf8").digest("hex"),
  });
  const responseBytes = Buffer.from(canonicalizeStrict({
    schema: "outsider/cloudflare-ephemeral-worker-proof-response/v1",
    schemaVersion: "1.0.0",
    exactOutcomeHash: tender.exactOutcome.exactOutcomeHash,
  }), "utf8");
  return { driver, ledgerDirectory, preflightCalls, scriptName,
    workerUrl: `https://${scriptName}.${ACCOUNT_SUBDOMAIN}.workers.dev/`,
    responseBytes, planHash: driver.publicProjection.planHash };
}

function moduleFromMultipart(body, contentType) {
  const boundary = /boundary=([^;\s]+)/u.exec(contentType)?.[1];
  assert.ok(boundary);
  const text = Buffer.from(body).toString("utf8");
  const part = text.split(`--${boundary}`).find((value) =>
    value.includes('name="worker.mjs"'));
  assert.ok(part);
  const start = part.indexOf("\r\n\r\n") + 4;
  return Buffer.from(part.slice(start).replace(/\r\n$/u, ""), "utf8");
}

test("sealed preflight and admitted plan touch no existing Worker or network effect",
  async (t) => {
    const prepared = await prepare(t, "admit");
    assert.deepEqual(prepared.preflightCalls.map(({ options }) => options.method),
      ["GET", "GET", "GET"]);
    assert.equal(prepared.preflightCalls.some(({ url }) =>
      url.pathname.endsWith("/workers/scripts")), false);
    assert.equal(prepared.preflightCalls[2].url.pathname.includes(
      `/workers/scripts/${prepared.scriptName}/subdomain`), true);
    assert.equal(prepared.driver.publicProjection.stage,
      "DURABLY_ADMITTED_NO_NETWORK_HOLD");
    assert.equal(prepared.driver.publicProjection.durableOccurrenceCount, 1);
    const serialized = JSON.stringify(prepared.driver);
    for (const secret of [API_TOKEN, ACCOUNT_ID, ACCOUNT_SUBDOMAIN,
      prepared.scriptName, prepared.workerUrl]) {
      assert.equal(serialized.includes(secret), false);
    }
    assert.deepEqual(readdirSync(path.join(prepared.ledgerDirectory, "entries")),
      ["000000000001.json"]);
  });

test("fixed PUT, subdomain enable, exact workers.dev effect, DELETE and absence close",
  async (t) => {
    const prepared = await prepare(t, "happy");
    const calls = [];
    let deleted = false;
    let absenceReads = 0;
    activeFetch = async (rawUrl, options) => {
      const url = new URL(rawUrl);
      calls.push({ url, options });
      if (url.origin === "https://api.cloudflare.com"
        && options.method === "PUT") {
        assert.deepEqual(readdirSync(path.join(prepared.ledgerDirectory,
          "entries")), ["000000000001.json", "000000000002.json",
          "000000000003.json"]);
        assert.match(options.headers["content-type"],
          /^multipart\/form-data; boundary=outsider-/u);
        return json({ success: true, result: { etag: "provider-etag" } });
      }
      if (url.origin === "https://api.cloudflare.com"
        && options.method === "POST") {
        assert.deepEqual(JSON.parse(Buffer.from(options.body).toString("utf8")),
          { enabled: true, previews_enabled: false });
        return json({ success: true,
          result: { enabled: true, previews_enabled: false } });
      }
      if (url.href === prepared.workerUrl && !deleted) {
        return new Response(prepared.responseBytes, { status: 200, headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        } });
      }
      if (url.origin === "https://api.cloudflare.com"
        && options.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (url.href === prepared.workerUrl) {
        absenceReads += 1;
        return absenceReads === 1
          ? new Response(prepared.responseBytes, { status: 200, headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          } })
          : new Response("not found", { status: 404 });
      }
      return json({ success: false }, 500);
    };
    const input = { expectedPlanHash: prepared.planHash };
    await subject.uploadCloudflareEphemeralWorkerOnceV1(prepared.driver,
      input, { timeoutMs: 50 });
    await subject.enableCloudflareEphemeralWorkerSubdomainOnceV1(
      prepared.driver, input, { timeoutMs: 50 });
    const observed = await subject
      .observeCloudflareEphemeralWorkerPublicEffectV1(prepared.driver,
        input, { requestTimeoutMs: 50, pollIntervalMs: 1, maxWaitMs: 5 });
    assert.equal(observed.publicProjection.publicEffectObservedAtWorkersDev,
      true);
    assert.equal(observed.publicProjection
      .workersDevObservationIsIndependentOutcomeTruth, false);
    const deletedResult = await subject.deleteCloudflareEphemeralWorkerOnceV1(
      prepared.driver, input, { timeoutMs: 50 });
    assert.equal(deletedResult.publicProjection.deleteProviderReceiptObserved,
      true);
    assert.equal(deletedResult.publicProjection
      .publicAbsenceObservedAtWorkersDev, false);
    const absent = await subject.observeCloudflareEphemeralWorkerAbsenceV1(
      prepared.driver, input,
      { requestTimeoutMs: 50, pollIntervalMs: 1, maxWaitMs: 5 });
    assert.equal(absent.publicProjection.publicAbsenceObservedAtWorkersDev,
      true);
    assert.equal(absent.publicProjection
      .workersDevAbsenceIsIndependentRecoveryTruth, false);
    assert.deepEqual(calls.map(({ options }) => options.method),
      ["PUT", "POST", "GET", "DELETE", "GET", "GET"]);
    assert.equal(calls[2].options.headers.Authorization, undefined);
  });

test("ambiguous upload is never retried and exact module GET reconciles",
  async (t) => {
    const prepared = await prepare(t, "upload-reconcile");
    const calls = [];
    let uploadedModule;
    activeFetch = async (rawUrl, options) => {
      const url = new URL(rawUrl);
      calls.push({ url, options });
      if (options.method === "PUT") {
        uploadedModule = moduleFromMultipart(options.body,
          options.headers["content-type"]);
        return new Promise(() => {});
      }
      if (options.method === "GET") {
        return new Response(uploadedModule, { status: 200,
          headers: { "content-type": "application/javascript" } });
      }
      return json({ success: false }, 500);
    };
    const input = { expectedPlanHash: prepared.planHash };
    const ambiguous = await subject.uploadCloudflareEphemeralWorkerOnceV1(
      prepared.driver, input, { timeoutMs: 2 });
    assert.equal(ambiguous.publicProjection.stage,
      "UPLOAD_COMMIT_UNKNOWN_GET_RECONCILE_ONLY_HOLD");
    await subject.uploadCloudflareEphemeralWorkerOnceV1(prepared.driver,
      input, { timeoutMs: 2 });
    assert.equal(calls.length, 1);
    const reconciled = await subject
      .reconcileCloudflareEphemeralWorkerUploadV1(prepared.driver,
        input, { timeoutMs: 50 });
    assert.equal(reconciled.publicProjection.uploadProviderReceiptObserved,
      true);
    assert.deepEqual(calls.map(({ options }) => options.method), ["PUT", "GET"]);
  });

test("ambiguous subdomain enable and DELETE each allow exact GET only",
  async (t) => {
    const prepared = await prepare(t, "two-reconciles");
    const calls = [];
    let phase = "upload";
    activeFetch = async (rawUrl, options) => {
      const url = new URL(rawUrl);
      calls.push({ url, options, phase });
      if (phase === "upload" && options.method === "PUT") {
        return json({ success: true, result: { etag: "ok" } });
      }
      if (phase === "enable" && options.method === "POST") {
        return new Promise(() => {});
      }
      if (phase === "enable-reconcile" && options.method === "GET") {
        return json({ success: true,
          result: { enabled: true, previews_enabled: false } });
      }
      if (phase === "delete" && options.method === "DELETE") {
        return new Promise(() => {});
      }
      if (phase === "delete-reconcile" && options.method === "GET") {
        return new Response(null, { status: 404 });
      }
      return json({ success: false }, 500);
    };
    const input = { expectedPlanHash: prepared.planHash };
    await subject.uploadCloudflareEphemeralWorkerOnceV1(prepared.driver,
      input, { timeoutMs: 50 });
    phase = "enable";
    await subject.enableCloudflareEphemeralWorkerSubdomainOnceV1(
      prepared.driver, input, { timeoutMs: 2 });
    const afterEnable = calls.length;
    await subject.enableCloudflareEphemeralWorkerSubdomainOnceV1(
      prepared.driver, input, { timeoutMs: 2 });
    assert.equal(calls.length, afterEnable);
    phase = "enable-reconcile";
    await subject.reconcileCloudflareEphemeralWorkerSubdomainV1(
      prepared.driver, input, { timeoutMs: 50 });
    phase = "delete";
    await subject.deleteCloudflareEphemeralWorkerOnceV1(prepared.driver,
      input, { timeoutMs: 2 });
    const afterDelete = calls.length;
    await subject.deleteCloudflareEphemeralWorkerOnceV1(prepared.driver,
      input, { timeoutMs: 2 });
    assert.equal(calls.length, afterDelete);
    phase = "delete-reconcile";
    const reconciled = await subject
      .reconcileCloudflareEphemeralWorkerDeleteV1(prepared.driver,
        input, { timeoutMs: 50 });
    assert.equal(reconciled.publicProjection.deleteProviderReceiptObserved,
      true);
    assert.equal(calls.filter(({ options }) => options.method === "POST").length,
      1);
    assert.equal(calls.filter(({ options }) => options.method === "DELETE").length,
      1);
  });
