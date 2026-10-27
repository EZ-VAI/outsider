import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  claimOneUseTenderResponseLinkPrivateSourceV1,
  createOneUseTenderResponseLinkDefinitionV1,
  createOneUseTenderResponseLinkHandlerV1,
  oneUseTenderResponseTokenHashV1,
  OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_BOUNDARY,
} from "../src/outsider-one-use-tender-response-link-handler-v1.js";
import {
  createCloudflareSqliteDurableObjectOneUseTenderResponseStoreV1,
  OUTSIDER_CLOUDFLARE_SQLITE_DO_ONE_USE_TENDER_RESPONSE_STORE_V1_BOUNDARY,
} from "../src/outsider-cloudflare-sqlite-do-one-use-tender-response-store-v1.js";
import {
  createCloudflareOneUseTenderResponseTokenV1,
  verifyCloudflareOneUseTenderResponseTokenV1,
} from "../src/outsider-cloudflare-one-use-tender-response-token-v1.js";
import responseLinkWorker, {
  OneUseTenderResponseLink,
} from "../deploy/cloudflare-one-use-tender-response-link/src/worker.mjs";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const TOKEN = Buffer.alloc(32, 0xa7).toString("base64url");
const TENDER_HASH = h("one-use-response-link-tender");

function definition() {
  return createOneUseTenderResponseLinkDefinitionV1({
    tenderHash: TENDER_HASH,
    requirementKind: "RESOURCE",
    requirementId: "resource_0123456789abcdef0123456789abcdef",
    issuedAt: "2026-09-04T12:00:00.000Z",
    expiresAt: "2026-09-04T13:00:00.000Z",
    summary: {
      title: "Frozen test order <not markup>",
      outcome: "Deliver one bounded result.",
      quantity: "1 outcome",
      dueBy: "2026-09-04T15:00:00.000Z",
      supplierInstructions: "Reply with a quote and exact service window.",
    },
    acceptedCurrencyCodes: ["EUR", "USD"],
    responsibilityTermsText: "responsibility-terms",
    responsibilityTermsHash: h("responsibility-terms"),
    responseToken: TOKEN,
  });
}

function memoryStore(shared = { events: [] }) {
  return {
    async read() {
      if (shared.events.length === 0) return null;
      return structuredClone({
        headHash: shared.events.at(-1).eventHash,
        events: shared.events,
      });
    },
    async compareAndAppend({ expectedHeadHash, event }) {
      const current = shared.events.at(-1)?.eventHash ?? null;
      if (current !== expectedHeadHash) {
        return { status: "CONFLICT", headHash: current };
      }
      shared.events.push(structuredClone(event));
      return { status: "APPENDED", headHash: event.eventHash };
    },
  };
}

function offerBytes(totalMinorUnits = 12_500) {
  return Buffer.from(JSON.stringify({
    tenderHash: TENDER_HASH,
    choice: "OFFER",
    quote: { currencyCode: "USD", totalMinorUnits },
    serviceWindow: {
      from: "2026-09-04T13:30:00.000Z",
      until: "2026-09-04T14:30:00.000Z",
    },
    offerExpiresAt: "2026-09-04T14:45:00.000Z",
    responsibility: {
      accepted: true,
      termsHash: h("responsibility-terms"),
    },
  }), "utf8");
}

function handler(store, clock = () => "2026-09-04T12:30:00.000Z") {
  return createOneUseTenderResponseLinkHandlerV1({
    definition: definition(), store, clock,
  });
}

test("GET renders only the frozen summary and a form DECLINE records one private source",
  async () => {
    const shared = { events: [] };
    const target = handler(memoryStore(shared));
    const initialized = await target.initialize();
    assert.equal(initialized.status, "LINK_ISSUED");
    assert.equal(initialized.decisionState, "HOLD");

    const page = await target.handle({ method: "GET", token: TOKEN,
      contentType: null, bodyBytes: null });
    assert.equal(page.statusCode, 200);
    const html = page.bodyBytes.toString("utf8");
    assert.match(html, /Frozen test order &lt;not markup&gt;/u);
    assert.match(html, /responsibility-terms/u);
    assert.equal(html.includes(TOKEN), false);
    assert.equal(page.headers["cache-control"], "no-store, max-age=0");

    const form = new URLSearchParams({ tenderHash: TENDER_HASH,
      choice: "DECLINE", reasonCode: "NO_CAPACITY" }).toString();
    const result = await target.handle({ method: "POST", token: TOKEN,
      contentType: "application/x-www-form-urlencoded",
      bodyBytes: Buffer.from(form, "utf8") });
    assert.equal(result.statusCode, 201);
    assert.equal(result.publicProjection.sourceDeclaredChoice, "DECLINE");
    assert.equal(result.publicProjection.responseOccurrenceObserved, true);
    assert.equal(result.publicProjection.respondentIdentityEstablished, false);
    assert.equal(result.publicProjection.resourceOwnerAuthorityEstablished, false);
    assert.equal(result.publicProjection.capacityReserved, false);
    assert.equal(result.publicProjection.decisionState, "HOLD");
    assert.equal(JSON.stringify(result.publicProjection).includes(form), false);
    assert.equal(JSON.stringify(result.publicProjection).includes(TOKEN), false);

    const privateSource = claimOneUseTenderResponseLinkPrivateSourceV1(result);
    assert.equal(privateSource.sourceBytes.toString("utf8"), form);
    assert.equal(privateSource.normalizedResponse.choice, "DECLINE");
    assert.equal(privateSource.decisionState, "HOLD");
    assert.throws(() => claimOneUseTenderResponseLinkPrivateSourceV1(result),
      /PRIVATE_SOURCE_UNAVAILABLE/u);
    assert.equal(shared.events.length, 2);
  });

test("two simultaneous OFFER submissions have exactly one atomic winner",
  async () => {
    const shared = { events: [] };
    const left = handler(memoryStore(shared));
    const right = handler(memoryStore(shared));
    await left.initialize();
    const request = { method: "POST", token: TOKEN,
      contentType: "application/json", bodyBytes: offerBytes() };
    const results = await Promise.all([left.handle(request), right.handle(request)]);
    assert.deepEqual(results.map((item) => item.statusCode).sort(), [201, 409]);
    assert.equal(shared.events.length, 2);
    const winner = results.find((item) => item.statusCode === 201);
    assert.equal(winner.publicProjection.sourceDeclaredChoice, "OFFER");
    assert.equal(winner.publicProjection.priceEstablished, false);
    assert.equal(winner.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(winner.publicProjection.boundary,
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_BOUNDARY);
    const privateSource = claimOneUseTenderResponseLinkPrivateSourceV1(winner);
    assert.equal(privateSource.normalizedResponse.quote.totalMinorUnits, 12_500);
  });

test("wrong tender binding, expiry, revocation, and malformed token fail closed",
  async () => {
    const target = handler(memoryStore());
    await target.initialize();
    const wrong = JSON.parse(offerBytes().toString("utf8"));
    wrong.tenderHash = h("wrong-tender");
    assert.equal((await target.handle({ method: "POST", token: TOKEN,
      contentType: "application/json",
      bodyBytes: Buffer.from(JSON.stringify(wrong)) })).statusCode, 400);
    assert.equal((await target.handle({ method: "GET", token: "bad",
      contentType: null, bodyBytes: null })).statusCode, 404);

    const expired = handler(memoryStore(),
      () => "2026-09-04T13:00:00.000Z");
    await expired.initialize();
    assert.equal((await expired.handle({ method: "POST", token: TOKEN,
      contentType: "application/json", bodyBytes: offerBytes() })).statusCode,
    410);

    const revoked = handler(memoryStore());
    await revoked.initialize();
    const projection = await revoked.revoke({ expectedTenderHash: TENDER_HASH,
      reasonCode: "REQUESTER_REVOKED" });
    assert.equal(projection.status, "LINK_REVOKED");
    assert.equal((await revoked.handle({ method: "POST", token: TOKEN,
      contentType: "application/json", bodyBytes: offerBytes() })).statusCode,
    410);
  });

class FakeSqliteStorage {
  constructor(database = { definition: null, events: [] }) {
    this.database = database;
    this.sql = { exec: (statement, ...bindings) =>
      this.#exec(statement, bindings) };
  }

  transactionSync(callback) { return callback(); }

  #cursor(rows = [], rowsWritten = 0) {
    return { rowsWritten, toArray: () => structuredClone(rows) };
  }

  #exec(statement, bindings) {
    const sql = statement.replace(/\s+/gu, " ").trim();
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) return this.#cursor();
    if (sql.startsWith("SELECT token_hash, definition_hash, definition_json")) {
      return this.#cursor(this.database.definition
        ? [this.database.definition] : []);
    }
    if (sql.startsWith("INSERT INTO outsider_response_link_definition_v1")) {
      if (this.database.definition) throw new Error("UNIQUE constraint failed");
      this.database.definition = { token_hash: bindings[0],
        definition_hash: bindings[1], definition_json: bindings[2] };
      return this.#cursor([], 1);
    }
    if (sql.startsWith("SELECT token_hash FROM")) {
      return this.#cursor(this.database.definition
        ? [{ token_hash: this.database.definition.token_hash }] : []);
    }
    if (sql.includes("FROM outsider_response_link_events_v1 ORDER BY ordinal ASC")) {
      return this.#cursor(this.database.events);
    }
    if (sql.startsWith("SELECT ordinal, event_hash")
      && sql.includes("ORDER BY ordinal DESC")) {
      const row = this.database.events.at(-1);
      return this.#cursor(row ? [{ ordinal: row.ordinal,
        event_hash: row.event_hash }] : []);
    }
    if (sql.startsWith("INSERT INTO outsider_response_link_events_v1")) {
      if (this.database.events.some((row) => row.ordinal === bindings[0]
        || row.event_hash === bindings[2])) throw new Error("UNIQUE constraint failed");
      this.database.events.push({ ordinal: bindings[0], token_hash: bindings[1],
        event_hash: bindings[2], previous_event_hash: bindings[3],
        event_json: bindings[4] });
      return this.#cursor([], 1);
    }
    if (sql.startsWith("SELECT event_hash, event_json")) {
      const row = this.database.events.find((item) => item.ordinal === bindings[0]);
      return this.#cursor(row ? [{ event_hash: row.event_hash,
        event_json: row.event_json }] : []);
    }
    throw new Error(`unhandled fake SQL: ${sql}`);
  }
}

test("SQLite Durable Object seam survives restart and never reuses the token",
  async () => {
    const database = { definition: null, events: [] };
    const firstStore
      = createCloudflareSqliteDurableObjectOneUseTenderResponseStoreV1({
        storage: new FakeSqliteStorage(database),
      });
    const frozen = definition();
    assert.equal(firstStore.initializeDefinition({ definition: frozen }).status,
      "INITIALIZED");
    const first = createOneUseTenderResponseLinkHandlerV1({ definition: frozen,
      store: firstStore, clock: () => "2026-09-04T12:30:00.000Z" });
    await first.initialize();
    const accepted = await first.handle({ method: "POST", token: TOKEN,
      contentType: "application/json", bodyBytes: offerBytes() });
    assert.equal(accepted.statusCode, 201);

    const restartedStore
      = createCloudflareSqliteDurableObjectOneUseTenderResponseStoreV1({
        storage: new FakeSqliteStorage(database),
      });
    const replayedDefinition = restartedStore.readDefinition();
    assert.equal(restartedStore.initializeDefinition({ definition: frozen }).status,
      "EXISTING");
    const restarted = createOneUseTenderResponseLinkHandlerV1({
      definition: replayedDefinition, store: restartedStore,
      clock: () => "2026-09-04T12:31:00.000Z",
    });
    const duplicate = await restarted.handle({ method: "POST", token: TOKEN,
      contentType: "application/json", bodyBytes: offerBytes(13_000) });
    assert.equal(duplicate.statusCode, 409);
    const persisted = await restarted.readPersistedPrivateResponseSource();
    assert.equal(persisted.status, "RESPONSE_SOURCE_RECORDED_HOLD");
    assert.equal(persisted.privateSource.sourceBytes.equals(offerBytes()), true);
    assert.equal(persisted.privateSource.event.eventHash,
      persisted.privateSource.eventHash);
    assert.equal(persisted.privateSource.providerIdentityEstablished, false);
    assert.equal(persisted.privateSource.capacityReserved, false);
    assert.equal(database.events.length, 2);
    assert.equal(JSON.stringify(database.definition).includes(TOKEN), false);
    assert.equal(JSON.stringify(duplicate.publicProjection)
      .includes("totalMinorUnits"), false);
    assert.equal(OUTSIDER_CLOUDFLARE_SQLITE_DO_ONE_USE_TENDER_RESPONSE_STORE_V1_BOUNDARY
      .workersKvUsedForConsumeOnce, false);
  });

test("SQLite Durable Object compare-and-append serializes concurrent handlers",
  async () => {
    const database = { definition: null, events: [] };
    const makeStore = () =>
      createCloudflareSqliteDurableObjectOneUseTenderResponseStoreV1({
        storage: new FakeSqliteStorage(database),
      });
    const frozen = definition();
    const bootstrap = makeStore();
    bootstrap.initializeDefinition({ definition: frozen });
    const left = createOneUseTenderResponseLinkHandlerV1({ definition: frozen,
      store: bootstrap, clock: () => "2026-09-04T12:30:00.000Z" });
    await left.initialize();
    const right = createOneUseTenderResponseLinkHandlerV1({ definition: frozen,
      store: makeStore(), clock: () => "2026-09-04T12:30:00.000Z" });
    const request = { method: "POST", token: TOKEN,
      contentType: "application/json", bodyBytes: offerBytes() };
    const results = await Promise.all([left.handle(request), right.handle(request)]);
    assert.deepEqual(results.map((item) => item.statusCode).sort(), [201, 409]);
    assert.equal(database.events.length, 2);
  });

test("a future-issued clock and lifecycle-incompatible OFFER cannot poison state",
  async () => {
    const shared = { events: [] };
    const future = handler(memoryStore(shared),
      () => "2026-09-04T11:59:00.000Z");
    await future.initialize();
    const tooEarly = await future.handle({ method: "POST", token: TOKEN,
      contentType: "application/json", bodyBytes: offerBytes() });
    assert.equal(tooEarly.statusCode, 425);
    assert.equal((await future.revoke({ expectedTenderHash: TENDER_HASH,
      reasonCode: "REQUESTER_REVOKED" })).status, "LINK_NOT_YET_ACTIVE");
    assert.equal(shared.events.length, 1);

    const afterIssued = { events: [] };
    const active = handler(memoryStore(afterIssued));
    await active.initialize();
    const pastStart = JSON.parse(offerBytes().toString("utf8"));
    pastStart.serviceWindow.from = "2026-09-04T12:29:59.999Z";
    assert.equal((await active.handle({ method: "POST", token: TOKEN,
      contentType: "application/json",
      bodyBytes: Buffer.from(JSON.stringify(pastStart)) })).statusCode, 400);
    assert.equal(afterIssued.events.length, 1);
    assert.throws(() => createOneUseTenderResponseLinkDefinitionV1({
      tenderHash: TENDER_HASH,
      requirementKind: "RESOURCE",
      requirementId: "resource_0123456789abcdef0123456789abcdef",
      issuedAt: "2026-09-04T12:00:00.000Z",
      expiresAt: "2026-09-04T13:00:00.000Z",
      summary: definition().summary,
      acceptedCurrencyCodes: ["USD"],
      responsibilityTermsText: "different terms",
      responsibilityTermsHash: h("responsibility-terms"),
      responseToken: TOKEN,
    }), /RESPONSIBILITY_TERMS_CONTENT_HASH_MISMATCH/u);
  });

test("Cloudflare ingress rejects allocation probes and replays private source after restart",
  async () => {
    const admin = "admin-secret-material-that-is-at-least-thirty-two-bytes";
    const currentMac = "current-mac-key-material-that-is-at-least-32-bytes";
    const oldMac = "old-mac-key-material-that-is-at-least-thirty-two";
    const cloudflareToken = createCloudflareOneUseTenderResponseTokenV1({
      entropyBytes: Buffer.alloc(32, 0x39), macKey: currentMac,
    });
    assert.equal(verifyCloudflareOneUseTenderResponseTokenV1(cloudflareToken,
      currentMac), true);
    assert.equal(verifyCloudflareOneUseTenderResponseTokenV1(cloudflareToken,
      oldMac), false);

    const database = { definition: null, events: [] };
    const env = { ADMIN_BEARER_TOKEN: admin,
      RESPONSE_LINK_TOKEN_MAC_KEYRING_JSON: JSON.stringify([currentMac, oldMac]) };
    let instance = new OneUseTenderResponseLink({
      storage: new FakeSqliteStorage(database),
    }, env);
    let durableObjectLookups = 0;
    env.RESPONSE_LINKS = {
      idFromName(value) { durableObjectLookups += 1; return value; },
      get() { return { fetch: (request) => instance.fetch(request) }; },
    };

    let response = await responseLinkWorker.fetch(new Request(
      "https://response.example/healthz"), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true,
      service: "outsider-one-use-tender-response-link",
      version: "1.0.0", mode: "HOLD" });
    assert.equal(durableObjectLookups, 0);

    const invalidMacToken = Buffer.alloc(64, 0x22).toString("base64url");
    response = await responseLinkWorker.fetch(new Request(
      `https://response.example/r/v1/${invalidMacToken}`), env);
    assert.equal(response.status, 404);
    assert.equal(durableObjectLookups, 0);

    const now = Date.now();
    const iso = (offset) => new Date(now + offset).toISOString();
    const initBody = {
      tenderHash: TENDER_HASH,
      requirementKind: "RESOURCE",
      requirementId: "resource_0123456789abcdef0123456789abcdef",
      issuedAt: iso(-60_000),
      expiresAt: iso(3_600_000),
      summary: { title: "Real private reply seam",
        outcome: "Record exactly one seller response.", quantity: "1 outcome",
        dueBy: iso(10_800_000),
        supplierInstructions: "Choose decline or submit an exact offer." },
      acceptedCurrencyCodes: ["USD"],
      responsibilityTermsText: "bounded production test terms",
      responsibilityTermsHash: h("bounded production test terms"),
    };
    const authHeaders = { authorization: `Bearer ${admin}`,
      "content-type": "application/json" };
    const base = `https://response.example/internal/v1/response-links/${cloudflareToken}`;
    response = await responseLinkWorker.fetch(new Request(base, { method: "PUT",
      headers: authHeaders, body: JSON.stringify(initBody) }), env);
    assert.equal(response.status, 201);

    response = await responseLinkWorker.fetch(new Request(`${base}/source`, {
      headers: { authorization: `Bearer ${admin}` },
    }), env);
    assert.equal(response.status, 202);
    assert.equal((await response.json()).decisionState, "HOLD");

    response = await responseLinkWorker.fetch(new Request(
      `https://response.example/r/v1/${cloudflareToken}`, { method: "POST",
        headers: { "content-type": "application/json" },
        body: Buffer.alloc(64 * 1024 + 1, 0x20) }), env);
    assert.equal(response.status, 413);
    assert.equal(database.events.length, 1);

    const rawOffer = Buffer.from(JSON.stringify({
      tenderHash: TENDER_HASH, choice: "OFFER",
      quote: { currencyCode: "USD", totalMinorUnits: 27_500 },
      serviceWindow: { from: iso(5_400_000), until: iso(7_200_000) },
      offerExpiresAt: iso(9_000_000),
      responsibility: { accepted: true,
        termsHash: h("bounded production test terms") },
    }), "utf8");
    response = await responseLinkWorker.fetch(new Request(
      `https://response.example/r/v1/${cloudflareToken}`, { method: "POST",
        headers: { "content-type": "application/json" }, body: rawOffer }), env);
    assert.equal(response.status, 201);

    instance = new OneUseTenderResponseLink({
      storage: new FakeSqliteStorage(database),
    }, env);
    env.RESPONSE_LINK_TOKEN_MAC_KEYRING_JSON = JSON.stringify([oldMac]);
    const tokenHash = oneUseTenderResponseTokenHashV1(cloudflareToken);
    const sourceByHash = `https://response.example/internal/v1/response-link-sources/${tokenHash}`;
    const beforeUnauthorized = durableObjectLookups;
    response = await responseLinkWorker.fetch(new Request(sourceByHash), env);
    assert.equal(response.status, 404);
    assert.equal(durableObjectLookups, beforeUnauthorized);

    response = await responseLinkWorker.fetch(new Request(sourceByHash, {
      headers: { authorization: `Bearer ${admin}` },
    }), env);
    assert.equal(response.status, 200);
    const replay = await response.json();
    assert.equal(replay.status, "RESPONSE_SOURCE_RECORDED_HOLD");
    assert.equal(Buffer.from(replay.source.sourceBodyBase64, "base64")
      .equals(rawOffer), true);
    assert.equal(replay.source.sourceBodyHash, replay.source.event.sourceBodyHash);
    assert.equal(replay.source.normalizedResponse.offerExpiresAt, iso(9_000_000));
    assert.equal(replay.source.capacityReserved, false);
    assert.equal(replay.source.decisionState, "HOLD");
    assert.equal(JSON.stringify(replay).includes(cloudflareToken), false);

    response = await responseLinkWorker.fetch(new Request(
      "https://response.example/internal/v1/response-link-sources", {
        headers: { authorization: `Bearer ${admin}` },
      }), env);
    assert.equal(response.status, 404);
  });
