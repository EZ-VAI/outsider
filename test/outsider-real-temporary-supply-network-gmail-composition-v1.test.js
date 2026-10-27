import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCloudflareOneUseTenderResponseLinkAccountNativeClientV1,
} from "../src/outsider-cloudflare-one-use-tender-response-link-account-native-client-v1.js";
import {
  createGmailAccountNativeMailboxTransportV1,
  issueGmailSendOAuthCapabilityV1,
} from "../src/outsider-gmail-account-native-mailbox-transport-v1.js";
import {
  createOneUseTenderResponseLinkDefinitionV1,
  createOneUseTenderResponseLinkHandlerV1,
} from "../src/outsider-one-use-tender-response-link-handler-v1.js";
import {
  runRealTemporarySupplyNetworkGmailCompositionV1,
} from "../src/outsider-real-temporary-supply-network-gmail-composition-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (value) => `sha256:${createHash("sha256")
  .update(value, "utf8").digest("hex")}`;
const bh = (value) => `sha256:${createHash("sha256")
  .update(value).digest("hex")}`;
const ADMIN = "test-admin-bearer-with-at-least-32-bytes";
const MAC = "test-token-mac-with-at-least-32-bytes";
const AUTHORITY_BYTES = Buffer.from("frozen requester contact authority");

function privateRoot(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-real-network-gmail-v1-")));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function recipientHash(address) {
  return `sha256:${createHash("sha256").update(
    `outsider/real-temporary-network-recipient/v1\0${JSON.stringify(
      address.toLowerCase())}`, "utf8").digest("hex")}`;
}

function source() {
  const fixture = createTemporaryNetworkV2MultiSlotFixture({
    fixtureLabel: "real-gmail-composition",
  });
  const byKind = Object.fromEntries(fixture.slots.map((slot) =>
    [slot.requirementKind, slot]));
  const route = (kind, recipient) => ({
    requirementKind: kind,
    requirementId: byKind[kind].requirementId,
    candidateRefHash: h(`${kind}:surface`),
    providerRefHash: byKind[kind].mailbox.response.providerRefHash,
    discoveryRouteObjectHash:
      byKind[kind].mailbox.route.object.routeObjectHash,
    discoveryCandidateHash:
      byKind[kind].mailbox.route.candidate.candidateHash,
    recipient,
  });
  const primary = route("RESOURCE", "primary@seller.example.com");
  const recovery = route("RECOVERY", "recovery@seller.example.com");
  const witness = route("EVIDENCE", null);
  const responsibilityTermsText
    = "Bounded one-use responsibility terms for this frozen outcome.";
  const definition = (candidate, title) => ({
    tenderHash: fixture.tender.tenderHash,
    requirementKind: candidate.requirementKind,
    requirementId: candidate.requirementId,
    issuedAt: "2026-09-02T12:02:00.000Z",
    expiresAt: "2026-09-02T12:15:00.000Z",
    summary: {
      title,
      outcome: "Deliver the exact frozen outcome.",
      quantity: "1 exact requirement",
      dueBy: candidate.requirementKind === "RESOURCE"
        ? fixture.tender.resourceRequirements.items[0].requiredBy
        : fixture.tender.recoveryRequirements.items[0].completionDeadline,
      supplierInstructions: "Offer once or decline; registration is not required.",
    },
    acceptedCurrencyCodes: ["USD"],
    responsibilityTermsText,
    responsibilityTermsHash: bh(Buffer.from(responsibilityTermsText)),
  });
  return {
    formationId: fixture.v1.source.foundationBoundEvaluationReplay.source
      .formationId,
    plannedAt: "2026-09-02T12:04:00.000Z",
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    ownerMandate: fixture.v1.source.foundationBoundEvaluationReplay.source
      .ownerMandate,
    contactAuthority: {
      tenderHash: fixture.tender.tenderHash,
      authorityGrantHash: h("requester-contact-grant"),
      sourceReplayHash: bh(AUTHORITY_BYTES),
      validFrom: "2026-09-02T12:00:00.000Z",
      validUntil: "2026-09-02T12:30:00.000Z",
      allowedContactBindings: [
        { role: "primary", candidateRefHash: primary.candidateRefHash,
          recipientAddressHash: recipientHash(primary.recipient) },
        { role: "recovery", candidateRefHash: recovery.candidateRefHash,
          recipientAddressHash: recipientHash(recovery.recipient) },
      ],
    },
    candidates: { primary, recovery, witness },
    responseLinkDefinitions: {
      primary: definition(primary, "Primary one-use request"),
      recovery: definition(recovery, "Recovery one-use request"),
    },
    tenderTexts: {
      primary: "Please review the exact primary one-use request.",
      recovery: "Please review the exact recovery one-use request.",
    },
    effectDeadline: "2026-09-02T12:20:00.000Z",
    employeeTouchCount: 0,
    foundationBindings: {
      autonomousWorkOrderHash: fixture.tender.workOrderHash,
      actionAdmissionHash: null,
      attemptSetCompositionHash: null,
      networkOutcomeWitnessHash: null,
      realityObligationHash: null,
      recoveryCapacityReservationHash: null,
      rightsPrivacyDecisionHash: null,
      riskCapitalReservationHash: null,
      custodyAuthorityHash: null,
      adjudicationAuthorityHash: null,
      externalTrustPolicyHash: null,
    },
  };
}

function atomicStore() {
  const events = [];
  return {
    async read() {
      return events.length === 0 ? null : {
        headHash: events.at(-1).eventHash,
        events: structuredClone(events),
      };
    },
    async compareAndAppend({ expectedHeadHash, event }) {
      const actual = events.length === 0 ? null : events.at(-1).eventHash;
      if (actual !== expectedHeadHash) return { status: "CONFLICT",
        headHash: actual };
      events.push(structuredClone(event));
      return { status: "APPENDED", headHash: event.eventHash };
    },
  };
}

function responseClient(t, root, role, sourceInput, requests) {
  const definitionRequest = sourceInput.responseLinkDefinitions[role];
  let handler = null;
  let token = null;
  let responded = false;
  const requestImpl = async (request) => {
    requests.push({ role, method: request.method, url: request.url });
    if (request.method === "PUT") {
      token = new URL(request.url).pathname.split("/").at(-1);
      const definition = createOneUseTenderResponseLinkDefinitionV1({
        ...JSON.parse(request.body.toString("utf8")), responseToken: token,
      });
      handler = createOneUseTenderResponseLinkHandlerV1({
        definition, store: atomicStore(),
        clock: () => "2026-09-02T12:05:00.000Z",
      });
      const publicProjection = await handler.initialize();
      return { status: 201, body: Buffer.from(JSON.stringify({ ok: true,
        publicProjection })) };
    }
    if (request.method === "GET") {
      if (!responded) {
        const body = Buffer.from(JSON.stringify({
          tenderHash: sourceInput.tender.tenderHash,
          choice: "OFFER",
          quote: { currencyCode: "USD",
            totalMinorUnits: role === "primary" ? 12000 : 3000 },
          serviceWindow: { from: "2026-09-02T15:00:00.000Z",
            until: "2026-09-02T16:00:00.000Z" },
          offerExpiresAt: "2026-09-02T17:00:00.000Z",
          responsibility: { accepted: true,
            termsHash: definitionRequest.responsibilityTermsHash },
        }));
        const posted = await handler.handle({ method: "POST", token,
          contentType: "application/json", bodyBytes: body });
        assert.equal(posted.statusCode, 201);
        responded = true;
      }
      const replay = await handler.readPersistedPrivateResponseSource();
      const sourceValue = replay.privateSource;
      return { status: 200, body: Buffer.from(JSON.stringify({ ok: true,
        status: replay.status,
        source: {
          schema: sourceValue.schema,
          schemaVersion: sourceValue.schemaVersion,
          event: sourceValue.event,
          eventHash: sourceValue.eventHash,
          sourceBodyHash: sourceValue.sourceBodyHash,
          sourceByteLength: sourceValue.sourceByteLength,
          contentType: sourceValue.contentType,
          sourceBodyBase64: sourceValue.sourceBytes.toString("base64"),
          normalizedResponse: sourceValue.normalizedResponse,
          responseOccurrenceOnly: true,
          providerIdentityEstablished: false,
          resourceOwnerAuthorityEstablished: false,
          capacityReserved: false,
          decisionState: "HOLD",
        },
      })) };
    }
    if (request.method === "POST") {
      const publicProjection = await handler.revoke(JSON.parse(
        request.body.toString("utf8")));
      return { status: 200, body: Buffer.from(JSON.stringify({ ok: true,
        publicProjection })) };
    }
    throw new Error("unexpected request");
  };
  return createCloudflareOneUseTenderResponseLinkAccountNativeClientV1({
    serviceOrigin: "https://response.example",
    adminBearerToken: ADMIN,
    tokenMacKey: MAC,
    async randomBytesImpl() {
      return Buffer.alloc(32, role === "primary" ? 0x41 : 0x42);
    },
    requestImpl,
    clock: () => "2026-09-02T12:05:00.000Z",
    directory: path.join(root, "links", role),
    journalId: `journal_${h(`link:${role}`).slice(7, 39)}`,
  });
}

function gmailTransport(root, role, posts, failSend = false) {
  const capability = issueGmailSendOAuthCapabilityV1({
    accessToken: `test-gmail-token-${role}-with-at-least-32-bytes`,
    accountRefHash: h("gmail-account"),
    oauthGrantHash: h("gmail-grant"),
    senderAddress: "buyer@example.com",
    issuedAt: "2026-09-02T12:00:00.000Z",
    expiresAt: "2026-09-02T13:00:00.000Z",
  });
  return createGmailAccountNativeMailboxTransportV1({
    sendOAuthCapability: capability,
    readOAuthCapability: null,
    async requestImpl(request) {
      posts.push({ role, request });
      if (failSend) throw new Error("simulated response loss");
      return { status: 200, body: Buffer.from(JSON.stringify({
        id: `gmail_message_${role}`,
        threadId: `gmail_thread_${role}`,
      })) };
    },
    clock: () => "2026-09-02T12:04:30.000Z",
    directory: path.join(root, "gmail", role),
    journalId: `journal_${h(`gmail:${role}`).slice(7, 39)}`,
  });
}

function dependencies(t, input, options = {}) {
  const root = privateRoot(t);
  const requests = [];
  const posts = [];
  const authorityCalls = [];
  return { root, requests, posts, authorityCalls, value: {
    responseLinkClients: {
      primary: responseClient(t, root, "primary", input, requests),
      recovery: responseClient(t, root, "recovery", input, requests),
    },
    gmailTransports: {
      primary: gmailTransport(root, "primary", posts),
      recovery: gmailTransport(root, "recovery", posts,
        options.failRecovery === true),
    },
    async revalidateContactAuthority(request) {
      authorityCalls.push(request);
      return { decision: "AUTHORIZED",
        evaluatedAt: "2026-09-02T12:04:00.000Z",
        validUntil: input.contactAuthority.validUntil,
        sourceBytes: Buffer.from(AUTHORITY_BYTES) };
    },
    clock: () => "2026-09-02T12:06:00.000Z",
  } };
}

test("default dry-run plans two seller routes and performs zero external I/O",
  async () => {
    const input = source();
    const result = await runRealTemporarySupplyNetworkGmailCompositionV1(input,
      {}, { mode: "DRY_RUN" });
    assert.equal(result.state, "DRY_RUN_HOLD");
    assert.equal(result.routes.length, 2);
    assert.equal(result.externalMutationCount, 0);
    assert.equal(result.userOutcomePromiseIssued, false);
    assert.equal(result.primaryCapacityReserved, false);
    assert.equal(result.recoveryCapacityReserved, false);
    assert.equal(result.independentWitnessEstablished, false);
  });

test("live pass persists two links, sends two Gmail tenders, replays two offers, and still cannot COMMIT",
  async (t) => {
    const input = source();
    const deps = dependencies(t, input);
    const result = await runRealTemporarySupplyNetworkGmailCompositionV1(input,
      deps.value, { mode: "LIVE" });
    assert.equal(result.state, "TWO_SOURCE_REPLAYED_OFFERS_HOLD");
    assert.equal(deps.posts.length, 2);
    assert.equal(deps.requests.filter((item) => item.method === "PUT").length,
      2);
    assert.equal(deps.requests.filter((item) => item.method === "GET").length,
      2);
    assert.equal(deps.authorityCalls.length, 4);
    assert.deepEqual(new Set(deps.authorityCalls.map((item) => item.phase)),
      new Set(["ADMISSION", "BEFORE_SEND"]));
    assert.equal(result.routes.every((route) =>
      route.lifecycleVerificationHash !== null), true);
    assert.equal(result.routes.every((route) =>
      route.deliveryState === "DELIVERED_ACK_HOLD"), true);
    assert.equal(result.providerAcceptanceEstablished, false);
    assert.equal(result.primaryCapacityReserved, false);
    assert.equal(result.recoveryCapacityReserved, false);
    assert.equal(result.formation.providerAcceptancePresent, false);
    assert.equal(result.formation.capacityReceiptPresent, false);
    assert.equal(result.userOutcomePromiseIssued, false);
    const publicText = JSON.stringify(result);
    for (const secret of ["primary@seller.example.com",
      "recovery@seller.example.com", ADMIN, MAC,
      AUTHORITY_BYTES.toString("utf8"), "/r/v1/"]) {
      assert.equal(publicText.includes(secret), false, secret);
    }
  });

test("one Gmail failure revokes both response links and cannot become capacity",
  async (t) => {
    const input = source();
    const deps = dependencies(t, input, { failRecovery: true });
    const result = await runRealTemporarySupplyNetworkGmailCompositionV1(input,
      deps.value, { mode: "LIVE" });
    assert.equal(result.state, "DELIVERY_PAIR_UNAVAILABLE_HOLD");
    assert.equal(deps.posts.length, 2);
    assert.equal(deps.requests.filter((item) => item.method === "POST").length,
      2);
    assert.equal(result.routes[0].deliveryState, "DELIVERED_ACK_HOLD");
    assert.equal(result.routes[1].deliveryState,
      "AMBIGUOUS_OR_FAILED_NO_RETRY_HOLD");
    assert.equal(result.routes.every((route) =>
      route.capacityReserved === false), true);
    assert.equal(result.userOutcomePromiseIssued, false);
    assert.equal(result.nextAction, "UNAVAILABLE");
  });
