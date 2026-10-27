import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimCloudflareOneUseTenderResponseLinkSourceV1,
  createCloudflareOneUseTenderResponseLinkAccountNativeClientV1,
} from "../src/outsider-cloudflare-one-use-tender-response-link-account-native-client-v1.js";
import {
  verifyCloudflareOneUseTenderResponseTokenV1,
} from "../src/outsider-cloudflare-one-use-tender-response-token-v1.js";
import {
  createOneUseTenderResponseLinkDefinitionV1,
} from "../src/outsider-one-use-tender-response-link-handler-v1.js";

const h = (value) => `sha256:${createHash("sha256")
  .update(value, "utf8").digest("hex")}`;
const bh = (bytes) => `sha256:${createHash("sha256")
  .update(bytes).digest("hex")}`;
const ADMIN = "private-admin-bearer-material-at-least-32-bytes";
const MAC = "private-response-token-mac-material-at-least-32-bytes";
const ORIGIN = "https://response.example";
const TENDER_HASH = h("response-link-client-tender");
const JOURNAL_ID = "journal_0123456789abcdef0123456789abcdef";

function root(t, label) {
  const value = realpathSync(mkdtempSync(path.join(tmpdir(), `${label}-`)));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function definition(overrides = {}) {
  return {
    tenderHash: TENDER_HASH,
    requirementKind: "RESOURCE",
    requirementId: "resource_0123456789abcdef0123456789abcdef",
    issuedAt: "2099-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T01:00:00.000Z",
    summary: {
      title: "One exact outcome request",
      outcome: "Deliver the frozen requested result.",
      quantity: "1 outcome",
      dueBy: "2099-01-02T00:00:00.000Z",
      supplierInstructions: "Return one fixed quote or decline.",
    },
    acceptedCurrencyCodes: ["USD"],
    responsibilityTermsText: "Bounded one-use responsibility terms.",
    responsibilityTermsHash: bh(Buffer.from(
      "Bounded one-use responsibility terms.", "utf8")),
    ...overrides,
  };
}

function events(directory, journalId = JOURNAL_ID) {
  return readFileSync(path.join(directory, `${journalId}.events.jsonl`),
    "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
}

function clientAt(directory, requestImpl, options = {}) {
  return createCloudflareOneUseTenderResponseLinkAccountNativeClientV1({
    serviceOrigin: ORIGIN,
    adminBearerToken: ADMIN,
    tokenMacKey: MAC,
    async randomBytesImpl() { return Buffer.alloc(32, 0x41); },
    requestImpl,
    clock: options.clock ?? (() => "2099-01-01T00:10:00.000Z"),
    directory,
    journalId: options.journalId ?? JOURNAL_ID,
  });
}

function initializationResponse(request) {
  const token = new URL(request.url).pathname.split("/").at(-1);
  const body = JSON.parse(request.body.toString("utf8"));
  const compiled = createOneUseTenderResponseLinkDefinitionV1({
    ...body, responseToken: token,
  });
  return Buffer.from(JSON.stringify({ ok: true, publicProjection: {
    tenderHash: compiled.tenderHash,
    definitionHash: compiled.definitionHash,
    status: "LINK_ISSUED",
  } }), "utf8");
}

test("initializes one HMAC seller route, composes readable Gmail text, and replays exact OFFER source bytes",
  async (t) => {
    const directory = root(t, "outsider-response-link-client-normal");
    const requests = [];
    const sellerSource = Buffer.from(JSON.stringify({
      tenderHash: TENDER_HASH,
      choice: "OFFER",
      quote: { currencyCode: "USD", totalMinorUnits: 12_500 },
      serviceWindow: { from: "2099-01-01T02:00:00.000Z",
        until: "2099-01-01T03:00:00.000Z" },
      offerExpiresAt: "2099-01-01T03:30:00.000Z",
      responsibility: { accepted: true,
        termsHash: definition().responsibilityTermsHash },
    }), "utf8");
    const requestImpl = async (request) => {
      requests.push(request);
      assert.equal(request.headers.authorization, `Bearer ${ADMIN}`);
      const before = events(directory);
      assert.equal(before.at(-1).eventType, "OPERATION_ATTEMPTED");
      assert.equal(statSync(path.join(directory,
        `${JOURNAL_ID}.events.jsonl`)).mode & 0o777, 0o600);
      if (request.method === "PUT") {
        const token = new URL(request.url).pathname.split("/").at(-1);
        assert.equal(verifyCloudflareOneUseTenderResponseTokenV1(token, MAC),
          true);
        return { status: 201, body: initializationResponse(request) };
      }
      if (request.method === "GET") {
        const prepared = events(directory)[0].payload;
        assert.equal(new URL(request.url).pathname,
          `/internal/v1/response-link-sources/${
            prepared.definition.tokenHash}`);
        assert.equal(request.url.includes(prepared.responseToken), false);
        const source = {
          schema: "outsider/one-use-tender-response-link-private-source/v1",
          schemaVersion: "1.0.0",
          event: { tenderHash: TENDER_HASH,
            tokenHash: prepared.definition.tokenHash,
            eventHash: h("seller-offer-event") },
          eventHash: h("seller-offer-event"),
          sourceBodyHash: bh(sellerSource),
          sourceByteLength: sellerSource.length,
          contentType: "application/json",
          sourceBodyBase64: sellerSource.toString("base64"),
          normalizedResponse: { choice: "OFFER" },
          responseOccurrenceOnly: true,
          providerIdentityEstablished: false,
          resourceOwnerAuthorityEstablished: false,
          capacityReserved: false,
          decisionState: "HOLD",
        };
        return { status: 200, body: Buffer.from(JSON.stringify({
          ok: true, status: "RESPONSE_SOURCE_RECORDED_HOLD", source,
        }), "utf8") };
      }
      throw new Error("unexpected request");
    };
    const client = clientAt(directory, requestImpl);
    const initialized = await client.initializeExact({
      definition: definition(),
    });
    assert.equal(initialized.publicProjection.state, "LINK_INITIALIZED_HOLD");
    assert.equal(initialized.publicProjection.capacityReserved, false);
    const route = client.privateSellerRouteExact({
      expectedTenderHash: TENDER_HASH,
    });
    assert.match(route.sellerResponseUrl,
      /^https:\/\/response\.example\/r\/v1\/[A-Za-z0-9_-]{86}$/u);
    const gmailBody = client.composeGmailTenderBodyExact({
      expectedTenderHash: TENDER_HASH,
      tenderText: "Please review this exact work order.",
    });
    assert.equal(gmailBody.toString("utf8").includes(route.sellerResponseUrl),
      true);
    assert.equal(/(^|[^\r])\n/u.test(gmailBody.toString("utf8")), false);

    const polled = await client.pollSourceExact({
      expectedTenderHash: TENDER_HASH,
    });
    assert.equal(polled.publicProjection.state,
      "RESPONSE_OFFER_SOURCE_OBSERVED_HOLD");
    assert.equal(polled.publicProjection.declaredChoice, "OFFER");
    assert.equal(polled.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(polled.publicProjection.capacityReserved, false);
    const claimed = claimCloudflareOneUseTenderResponseLinkSourceV1(polled);
    assert.deepEqual(claimed.sellerSourceBytes, sellerSource);
    const captured = events(directory).findLast((event) =>
      event.eventType === "HTTP_RESPONSE_CAPTURED");
    assert.equal(claimed.httpResponseBytes.equals(Buffer.from(
      captured.payload.responseBase64, "base64")), true);
    assert.throws(() => claimCloudflareOneUseTenderResponseLinkSourceV1(polled),
      /INVALID_OR_REPLAYED/u);
    const publicText = JSON.stringify({ client, initialized, polled });
    for (const secret of [ADMIN, MAC, route.sellerResponseUrl, sellerSource
      .toString("utf8")]) assert.equal(publicText.includes(secret), false);
    assert.deepEqual(requests.map((request) => request.method), ["PUT", "GET"]);
  });

test("restart reuses completed init/revoke and local expiry performs no external request",
  async (t) => {
    const directory = root(t, "outsider-response-link-client-restart");
    let now = "2099-01-01T00:10:00.000Z";
    let puts = 0;
    let revokes = 0;
    const requestImpl = async (request) => {
      if (request.method === "PUT") {
        puts += 1;
        return { status: 201, body: initializationResponse(request) };
      }
      if (request.method === "POST") {
        revokes += 1;
        return { status: 200, body: Buffer.from(JSON.stringify({
          ok: true, publicProjection: { tenderHash: TENDER_HASH,
            status: "LINK_REVOKED" },
        }), "utf8") };
      }
      throw new Error("GET must remain local after revoke/expiry");
    };
    let client = clientAt(directory, requestImpl, { clock: () => now });
    await client.initializeExact({ definition: definition() });
    client = clientAt(directory, requestImpl, { clock: () => now });
    await client.initializeExact({ definition: definition() });
    assert.equal(puts, 1);
    const revoked = await client.revokeExact({
      expectedTenderHash: TENDER_HASH,
      reasonCode: "REQUESTER_REVOKED",
    });
    assert.equal(revoked.publicProjection.state, "LINK_REVOKED_HOLD");
    client = clientAt(directory, requestImpl, { clock: () => now });
    const replayedRevoke = await client.revokeExact({
      expectedTenderHash: TENDER_HASH,
      reasonCode: "REQUESTER_REVOKED",
    });
    assert.equal(replayedRevoke.publicProjection.state, "LINK_REVOKED_HOLD");
    assert.equal(revokes, 1);
    const noResponse = await client.pollSourceExact({
      expectedTenderHash: TENDER_HASH,
    });
    assert.equal(noResponse.publicProjection.state,
      "LINK_REVOKED_NO_RESPONSE_HOLD");

    const expiredDirectory = root(t, "outsider-response-link-client-expiry");
    let external = 0;
    const expiredClient = clientAt(expiredDirectory, async (request) => {
      external += 1;
      return { status: 201, body: initializationResponse(request) };
    }, { clock: () => now });
    await expiredClient.initializeExact({ definition: definition() });
    now = "2099-01-01T01:00:00.000Z";
    const expired = await expiredClient.pollSourceExact({
      expectedTenderHash: TENDER_HASH,
    });
    assert.equal(expired.publicProjection.state,
      "LINK_EXPIRED_NO_RESPONSE_HOLD");
    assert.equal(external, 1);
  });

test("429 initialization and ambiguous revocation are durable no-retry HOLDs",
  async (t) => {
    const rateDirectory = root(t, "outsider-response-link-client-429");
    let rateCalls = 0;
    let rateClient = clientAt(rateDirectory, async () => {
      rateCalls += 1;
      return { status: 429, body: Buffer.from("rate limited", "utf8") };
    });
    const limited = await rateClient.initializeExact({
      definition: definition(),
    });
    assert.equal(limited.publicProjection.state,
      "INITIALIZE_HTTP_429_NO_RETRY_HOLD");
    rateClient = clientAt(rateDirectory, async () => {
      rateCalls += 1;
      throw new Error("must not retry");
    });
    assert.equal((await rateClient.initializeExact({ definition: definition() }))
      .publicProjection.state, "INITIALIZE_HTTP_429_NO_RETRY_HOLD");
    assert.equal(rateCalls, 1);

    const ambiguousDirectory = root(t,
      "outsider-response-link-client-ambiguous");
    let revokeCalls = 0;
    const requestImpl = async (request) => {
      if (request.method === "PUT") {
        return { status: 201, body: initializationResponse(request) };
      }
      revokeCalls += 1;
      throw new Error("response unknown");
    };
    let ambiguousClient = clientAt(ambiguousDirectory, requestImpl);
    await ambiguousClient.initializeExact({ definition: definition() });
    const ambiguous = await ambiguousClient.revokeExact({
      expectedTenderHash: TENDER_HASH,
      reasonCode: "POLICY_REVOKED",
    });
    assert.equal(ambiguous.publicProjection.state,
      "REVOKE_AMBIGUOUS_NO_RETRY_HOLD");
    ambiguousClient = clientAt(ambiguousDirectory, requestImpl);
    assert.equal((await ambiguousClient.revokeExact({
      expectedTenderHash: TENDER_HASH,
      reasonCode: "POLICY_REVOKED",
    })).publicProjection.state, "REVOKE_AMBIGUOUS_NO_RETRY_HOLD");
    assert.equal(revokeCalls, 1);
    assert.equal(existsSync(path.join(ambiguousDirectory,
      ".external-operation.lock")), false);
  });
