import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdtempSync, readdirSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createAutonomousWorkOrderProjection }
  from "../src/outsider-autonomous-work-order.js";
import { pinAtomicBuyerNativeFrozenArtifactV1 }
  from "../src/outsider-atomic-buyer-native-temporary-network-coordinator-v1.js";
import { OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1 }
  from "../src/outsider-first-physical-outcome-production-composition-v1.js";
import { createFirstPhysicalOutcomeUnifiedProductV1 }
  from "../src/outsider-first-physical-outcome-unified-product-v1.js";

const NOW = "2026-09-04T15:00:00.000Z";
const COMPLETE = "2026-09-08T15:00:00.000Z";
const AUTHORITY_EXPIRY = "2026-09-04T16:00:00.000Z";
const MASKED_CART = "maskedSparkFunCartForUnified001";

const h = (value) => `sha256:${createHash("sha256")
  .update(value, "utf8").digest("hex")}`;

function privateDirectory(t) {
  const directory = mkdtempSync(path.join(tmpdir(),
    "outsider-unified-physical-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function draft() {
  const discovery = (term) => ({ queryTerms: [term],
    routeKinds: ["PROVIDER_OWNED_PUBLIC_ENTRY"], maximumCandidates: 8 });
  const product = { quantity: 1, connectorA: "USB_A_MALE",
    connectorB: "USB_C_MALE", minimumLengthMm: 900,
    maximumLengthMm: 1100, dataRequired: true, fiveVoltPowerRequired: true,
    condition: "NEW" };
  return {
    schema: "outsider/private-outcome-formation-model-draft/v1",
    outcomeKindCode: "PHYSICAL_GOODS_DELIVERY",
    conditions: [{ metricCode: "DELIVERY_COMPLETE", comparator: "EQUAL",
      target: { valueKind: "BOOLEAN", booleanValue: true,
        integerValue: null, stateCode: null, unitCode: null },
      observationWindowMs: 0 }],
    acceptance: [{ criterionId: "exact_item", comparator: "ALL_FIELDS_EQUAL",
      subject: "delivered cable", expected: product }],
    routes: {
      primary: { capability: "PURCHASE_AND_DELIVER_MATCHING_ITEM",
        classCode: "PHYSICAL_GOODS_SELLER", quantity: 1, unitCode: "ITEM",
        constraints: { product }, discovery: discovery("matching cable seller"),
        observationMode: null, maximumAttempts: null },
      recovery: { capability: "ALTERNATE_PURCHASE_AND_DELIVERY_ROUTE",
        classCode: "PHYSICAL_GOODS_SELLER", quantity: 1, unitCode: "ITEM",
        constraints: { product, distinctFromPrimary: true },
        discovery: discovery("alternate matching cable seller"),
        observationMode: null, maximumAttempts: 1 },
      independentWitness: {
        capability: "INDEPENDENT_DELIVERY_AND_ITEM_OBSERVATION",
        classCode: "DELIVERY_OUTCOME_WITNESS", quantity: 1,
        unitCode: "OBSERVATION", constraints: {
          providerSelfReportSufficient: false,
        }, discovery: discovery("independent delivery outcome witness"),
        observationMode: "LONGITUDINAL", maximumAttempts: null,
      },
    },
  };
}

function genericButWrongPhysicalDraft() {
  const value = draft();
  return {
    ...value,
    routes: {
      ...value.routes,
      primary: {
        ...value.routes.primary,
        capability: "SEND_EMAIL",
      },
    },
  };
}

function workOrderFor(outcomeIntentRefHash) {
  const owner = h("owner");
  return createAutonomousWorkOrderProjection({
    orderId: "awo_0123456789abcdef0123456789abcdee",
    recordedAt: "2026-09-04T14:50:00.000Z",
    appendOnlyLineage: { revision: 0, predecessorProjectionHash: null,
      supersedesProjectionHash: null },
    typedGraph: {
      principalEpoch: { principalRefHash: h("principal"),
        epochRefHash: h("epoch"),
        principalEpochProjectionHash: h("principal-epoch") },
      accountableDeployment: { deploymentLineageRefHash: h("deployment-lineage"),
        deploymentRevisionHash: h("deployment-revision"),
        accountableDeploymentSubjectHash: h("deployment") },
      runtime: { runtimeInstanceRefHash: h("runtime-ref"),
        runtimeInstanceHash: h("runtime") },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h("delegation-evidence"),
        delegationEdgeHash: h("delegation-edge") },
      episode: { episodeHash: h("episode"),
        networkCompleteEpisodeJoinHash: h("episode-join") },
      attempt: { attemptHash: h("attempt"),
        attemptActorSubjectHash: h("attempt-actor") },
    },
    contractReferences: { actorIdentityEnvelopeHash: h("actor-envelope"),
      realitySemanticBundleHash: h("semantic"),
      realityObligationGenesisHash: h("obligation-genesis"),
      realityObligationStateHash: h("obligation-state"),
      affectedPartyRootHash: h("affected-party"),
      outcomeWitnessEnvelopeHash: null },
    resourceOwner: { resourceOwnerRefHash: owner,
      ownerAdoptionEvidenceRefHash: null, externalAdoptionEstablished: false },
    promisedOutcome: { promisedOutcomeRefHash: outcomeIntentRefHash,
      acceptanceCriteriaHash: h("acceptance"),
      outcomeWitnessRequirementHash: h("witness-requirement"),
      consequenceChannelHashes: [h("consequence-channel")] },
    observationHorizons: [
      { horizonId: "immediate", dueAfterMs: 0,
        observationRequirementHash: h("observe-now"), mandatory: true },
      { horizonId: "delayed", dueAfterMs: 86_400_000,
        observationRequirementHash: h("observe-later"), mandatory: true },
    ],
    obligors: [
      { obligorRefHash: owner, role: "PRIMARY_PERFORMANCE",
        obligationRefHash: h("primary-obligation") },
      { obligorRefHash: owner, role: "RECOVERY",
        obligationRefHash: h("recovery-obligation") },
    ],
    remedyMenu: [{ remedyId: "replace", kind: "REPLACE",
      remedyTermsHash: h("replace-terms"), obligorRefHashes: [owner] }],
    protectionFunding: { status: "NONE" },
    orderStatus: "STRUCTURAL_PRECOMMITMENT_HOLD",
    challenge: { opened: false, challengeRefHash: null,
      standingExternallyVerified: false },
    closure: { closed: false, closureRefHash: null,
      externalClosureVerified: false },
    proofAccessPolicy: { roleScopedProofPolicyHash: h("proof-policy"),
      redactionPolicyHash: h("redaction-policy") },
  });
}

function fakeWorld() {
  const calls = [];
  let adafruitPresent = false;
  let sparkfunPresent = false;
  function response(body, contentType = "text/html", status = 200,
    headers = {}) {
    return new Response(status === 302 ? null
      : typeof body === "string" ? body : JSON.stringify(body), {
      status, headers: { "content-type": contentType,
        date: "Fri, 04 Sep 2026 15:00:00 GMT", ...headers },
    });
  }
  return { calls, async fetch(url, init) {
    calls.push({ url, method: init.method });
    const parsed = new URL(url);
    if (parsed.hostname === "www.adafruit.com") {
      if (parsed.pathname === "/product/4474") {
        return response(`<!doctype html><script type="application/ld+json">${JSON.stringify({
          "@context": "http://schema.org", "@type": "Product", sku: 4474,
          name: "USB Type A to Type C Cable - approx 1 meter / 3 ft long",
          offers: { "@type": "Offer", availability:
            "http://schema.org/InStock", price: "4.9500",
          priceCurrency: "USD" },
        })}</script><form action="/added" method="post"><input name="securityToken" value="adafruit-private-token"></form>`);
      }
      if (parsed.pathname === "/shopping_cart") {
        const row = adafruitPresent
          ? '<div role="row" class="cart-row" data-pid="4474" data-qty="1" data-price="4.95">item</div>' : "";
        return response(`<!doctype html>${row}<form action="/shopping_cart" method="post" data-empty-cart-confirm><input type="hidden" name="securityToken" value="cart-token"></form>`);
      }
      if (parsed.pathname === "/added") {
        adafruitPresent = true;
        return response(null, "text/html", 302, { location: url });
      }
    }
    if (parsed.hostname === "www.sparkfun.com") {
      if (parsed.pathname === "/usb-3-1-cable-a-to-c-3-foot.html") {
        const provider = { "*": { "Magento_Catalog/js/product/view/provider": {
          data: { items: { "4636": { id: 4636,
            name: "USB 3.1 Cable A to C - 3 Foot",
            price_info: { final_price: 7.95 }, currency_code: "USD",
            is_salable: "1", is_available: true } } } } } };
        const context = { productId: 4636, sku: "CAB-14743",
          updatedAt: "2025-05-08 18:25:57" };
        return response(`<!doctype html><script type="text/x-magento-init">${JSON.stringify(provider)}</script><script>magentoStorefrontEvents.context.setProduct(${JSON.stringify(context)})</script>`);
      }
      if (parsed.pathname === "/rest/V1/guest-carts" && init.method === "POST") {
        return response(JSON.stringify(MASKED_CART),
          "application/json; charset=utf-8");
      }
      if (parsed.pathname.endsWith("/items") && init.method === "POST") {
        sparkfunPresent = true;
        return response({ item_id: 2124971, sku: "CAB-14743", qty: 1,
          name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
          product_type: "simple", quote_id: "2316323" },
        "application/json; charset=utf-8");
      }
      if (/\/rest\/V1\/guest-carts\/[^/]+\/totals$/u.test(parsed.pathname)) {
        return response({ grand_total: sparkfunPresent ? 7.95 : 0,
          base_grand_total: sparkfunPresent ? 7.95 : 0,
          subtotal: sparkfunPresent ? 7.95 : 0, shipping_amount: 0,
          tax_amount: 0, items_qty: sparkfunPresent ? 1 : 0,
          base_currency_code: "USD", quote_currency_code: "USD" },
        "application/json; charset=utf-8");
      }
      if (/\/rest\/V1\/guest-carts\/[^/]+$/u.test(parsed.pathname)) {
        return response({ id: 2316323, is_active: true,
          items: sparkfunPresent ? [{ item_id: 2124971, sku: "CAB-14743",
            qty: 1, name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
            product_type: "simple", quote_id: "2316323" }] : [],
          items_count: sparkfunPresent ? 1 : 0,
          items_qty: sparkfunPresent ? 1 : 0 },
        "application/json; charset=utf-8");
      }
    }
    throw new Error(`unexpected ${init.method} ${url}`);
  } };
}

function dependencies(world) {
  return {
    clock: () => NOW,
    fetchImpl: world.fetch,
    async modelInference() { return draft(); },
    async resolveFoundationContext(input) {
      const outcomeIntentRefHash = pinAtomicBuyerNativeFrozenArtifactV1(
        "OUTCOME", input.frozenOutcome);
      const workOrder = workOrderFor(outcomeIntentRefHash);
      return {
        workOrderProjection: workOrder,
        expectedWorkOrderHash: workOrder.workOrderHash,
        prospectiveCensusProjectionHash: h("prospective-census"),
        foundationBindings: {
          workOrderHash: workOrder.workOrderHash,
          typedGraph: workOrder.typedGraph,
          authorizationBinding: {
            actorIdentityEnvelopeHash: h("actor-envelope"),
            delegationEvidenceRefHash: h("delegation-evidence"),
            delegationEdgeHash: h("delegation-edge"),
            authorityScopeRefHash: h("authority-scope"),
            resourceOwnerAuthorizationRefHash: h("owner-authorization"),
            rightsPrivacyPolicyRefHash: h("rights-privacy"),
          },
          subjectRefHash: h("subject"), regionRefHash: h("region"),
          consequenceEnvelopeRefHash: h("consequence-envelope"),
          affectedChannelRefHashes: [h("consequence-channel")],
          maximumConsequence: { consequenceClassCode: "BOUNDED_DELAY",
            measureCode: "MAXIMUM_DELAY", maximumValue: 4,
            unitCode: "DAY" },
        },
      };
    },
    resolveRouteRequests: null,
    resolveTargetCandidateBinding: null,
    resolveBestBuyCandidateBinding: null,
    bestBuyCandidateSourceRead: null,
    async revalidateTransactionAuthority(entry) {
      return { active: true, authorityRefHash: entry.authorityRefHash,
        observedAt: entry.observedAt, expiresAt: AUTHORITY_EXPIRY };
    },
    async witnessReadinessImpl({ request }) {
      return { sourceBytes: Buffer.from("candidate witness readiness only"),
        sourceState: request.operation === "QUOTE"
          ? "QUOTE_AVAILABLE" : "STATE_OBSERVED",
        sourceExpiresAt: request.operation === "QUOTE"
          ? AUTHORITY_EXPIRY : null,
        sourceRecordClass: request.operation === "QUOTE"
          ? "QUOTE" : "STATUS_RECEIPT" };
    },
    selectShippingRate: null,
  };
}

function request() {
  return { requestId: "physical_unified", goal:
    OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1,
  budget: { currency: "USD", maximumAmountMinor: "2500" },
  completionDeadline: COMPLETE, context: { locale: "en-US" } };
}

function injected() {
  return {
    formationAuthorization: { formationOperationsAuthorized: true,
      commitWithoutSeparatePaymentAuthorization: false },
    transactionAuthority: { authorityRefHash: h("transaction-authority"),
      principalEpochRefHash: h("principal-epoch"),
      issuedAt: "2026-09-04T14:55:00.000Z", expiresAt: AUTHORITY_EXPIRY },
    destination: null,
  };
}

test("one unified path compiles, forms real-adapter carts, and writes the existing Episode/Attempt data path",
  async (t) => {
    const directory = privateDirectory(t);
    const world = fakeWorld();
    const product = createFirstPhysicalOutcomeUnifiedProductV1({ directory,
      formationWindowMs: 30 * 60_000,
      cleanupWindowMs: 24 * 60 * 60_000 }, dependencies(world));
    const first = await product.requestOutcome(request(), injected());
    assert.equal(first.product.workflowState, "NEEDS_DESTINATION");
    assert.equal(first.modelComputeFoundationConnected, true);
    assert.equal(first.existingTypedGraphConnected, true);
    assert.equal(first.buyerNativeExecutionConnected, true);
    assert.equal(first.episodeData.occurrenceCensus
      .buyerNativeTransactionOccurrenceCount, 8);
    assert.equal(first.episodeData.occurrenceCensus
      .productFormationOccurrenceCount, 1);
    assert.equal(first.episodeData.occurrenceCensus.sourceOccurrenceCount, 9);
    assert.equal(first.episodeData.externalOutcomeEstablished, false);
    assert.equal(first.paymentAttempted, false);
    assert.equal(first.orderSubmitted, false);
    const externalCalls = world.calls.length;

    const restarted = createFirstPhysicalOutcomeUnifiedProductV1({ directory,
      formationWindowMs: 30 * 60_000,
      cleanupWindowMs: 24 * 60 * 60_000 }, dependencies(world));
    const resumed = await restarted.resumeOutcome("physical_unified", injected());
    assert.equal(world.calls.length, externalCalls);
    assert.equal(resumed.episodeData.occurrenceCensus
      .buyerNativeTransactionOccurrenceCount, 8);
    assert.equal(resumed.episodeData.occurrenceCensus
      .productFormationOccurrenceCount, 2);
    assert.equal(resumed.episodeData.occurrenceCensus.sourceOccurrenceCount, 10);
    assert.equal(resumed.product.outcomePromiseIssued, false);
  });

test("a durable binding replays its full compilation across the pre-physical-persistence crash window",
  async (t) => {
    const directory = privateDirectory(t);
    const seedWorld = fakeWorld();
    const seeded = createFirstPhysicalOutcomeUnifiedProductV1({ directory,
      formationWindowMs: 30 * 60_000,
      cleanupWindowMs: 24 * 60 * 60_000 }, dependencies(seedWorld));
    await seeded.requestOutcome(request(), injected());

    const physicalDirectory = path.join(directory, "physical-product");
    rmSync(physicalDirectory, { recursive: true, force: true });
    assert.equal(existsSync(physicalDirectory), false);
    assert.equal(readdirSync(path.join(directory, "episode-bindings")).length,
      1);

    let modelInferenceCalls = 0;
    let foundationResolutionCalls = 0;
    const replayWorld = fakeWorld();
    const replayDependencies = dependencies(replayWorld);
    replayDependencies.modelInference = async () => {
      modelInferenceCalls += 1;
      throw new Error("durable compilation should bypass model inference");
    };
    replayDependencies.resolveFoundationContext = async () => {
      foundationResolutionCalls += 1;
      throw new Error("durable compilation should bypass foundation resolution");
    };
    const restarted = createFirstPhysicalOutcomeUnifiedProductV1({ directory,
      formationWindowMs: 30 * 60_000,
      cleanupWindowMs: 24 * 60 * 60_000 }, replayDependencies);
    assert.deepEqual(readdirSync(path.join(physicalDirectory,
      "foundation-compilation")), []);
    assert.deepEqual(readdirSync(path.join(physicalDirectory,
      "product-runtime")), []);

    const continued = await restarted.requestOutcome(request(), injected());
    assert.equal(continued.product.workflowState, "NEEDS_DESTINATION");
    assert.equal(continued.modelComputeFoundationConnected, true);
    assert.equal(modelInferenceCalls, 0);
    assert.equal(foundationResolutionCalls, 0);
    assert.ok(replayWorld.calls.length > 0);
    assert.equal(readdirSync(path.join(physicalDirectory,
      "foundation-compilation")).length, 1);
    assert.equal(readdirSync(path.join(physicalDirectory,
      "product-runtime")).some((name) => name.endsWith(".request.v2.json")),
    true);
  });

test("a schema-valid draft rejected by the fixed physical route cannot poison its requestId binding",
  async (t) => {
    const directory = privateDirectory(t);
    const world = fakeWorld();
    const deps = dependencies(world);
    let modelInferenceCalls = 0;
    let foundationResolutionCalls = 0;
    const resolveFoundationContext = deps.resolveFoundationContext;
    deps.modelInference = async () => {
      modelInferenceCalls += 1;
      return modelInferenceCalls === 1
        ? genericButWrongPhysicalDraft() : draft();
    };
    deps.resolveFoundationContext = async (input) => {
      foundationResolutionCalls += 1;
      return resolveFoundationContext(input);
    };
    const product = createFirstPhysicalOutcomeUnifiedProductV1({ directory,
      formationWindowMs: 30 * 60_000,
      cleanupWindowMs: 24 * 60 * 60_000 }, deps);

    await assert.rejects(product.requestOutcome(request(), injected()),
      (error) => error?.outsiderCode
        === "FOUNDATION_NOT_BOUND_TO_FIXED_PHYSICAL_ROUTES");
    assert.deepEqual(readdirSync(path.join(directory, "episode-bindings")), []);
    assert.deepEqual(readdirSync(path.join(directory, "physical-product",
      "foundation-compilation")), []);
    assert.deepEqual(readdirSync(path.join(directory, "physical-product",
      "product-runtime")), []);
    assert.equal(world.calls.length, 0);

    const retried = await product.requestOutcome(request(), injected());
    assert.equal(retried.product.workflowState, "NEEDS_DESTINATION");
    assert.equal(modelInferenceCalls, 2);
    assert.equal(foundationResolutionCalls, 2);
    assert.equal(readdirSync(path.join(directory, "episode-bindings")).length,
      1);
    assert.ok(world.calls.length > 0);
  });
