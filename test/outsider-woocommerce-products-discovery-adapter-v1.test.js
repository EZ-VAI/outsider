import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { discoverBraveSearchRoutesV1 }
  from "../src/outsider-brave-search-route-discovery-adapter-v1.js";
import { adaptBraveSearchDiscoveryProjectionV1 }
  from "../src/outsider-brave-search-discovery-federation-node-v1.js";
import {
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  createOrderScopedDiscoveryNodeCapabilityV1,
  runOrderScopedDiscoveryFederationV1,
} from "../src/outsider-order-scoped-discovery-federation-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_BOUNDARY,
  claimWooCommerceProductCandidateV1,
  discoverWooCommerceProductsV1,
  importWooCommerceSellerOriginFromBraveFederationV1,
} from "../src/outsider-woocommerce-products-discovery-adapter-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

function tender(label = "woo") {
  const evidenceId = alias("evidence", `${label}:evidence`);
  return compileOutsiderOutcomeTenderV1({
    tenderId: alias("tender", label),
    compiledAt: "2099-09-03T12:00:00.000Z",
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h(`${label}:work-order`),
    typedGraph: {
      principalEpoch: { principalRefHash: h(`${label}:principal`),
        epochRefHash: h(`${label}:epoch`),
        principalEpochProjectionHash: h(`${label}:principal-epoch`) },
      accountableDeployment: {
        deploymentLineageRefHash: h(`${label}:lineage`),
        deploymentRevisionHash: h(`${label}:deployment-revision`),
        accountableDeploymentSubjectHash: h(`${label}:deployment-subject`) },
      runtime: { runtimeInstanceRefHash: h(`${label}:runtime-ref`),
        runtimeInstanceHash: h(`${label}:runtime`) },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
        delegationEdgeHash: h(`${label}:delegation-edge`) },
      episode: { episodeHash: h(`${label}:episode`),
        networkCompleteEpisodeJoinHash: h(`${label}:episode-join`) },
      attempt: { attemptHash: h(`${label}:attempt`),
        attemptActorSubjectHash: h(`${label}:attempt-subject`) },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h(`${label}:actor-envelope`),
      delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
      delegationEdgeHash: h(`${label}:delegation-edge`),
      authorityScopeRefHash: h(`${label}:authority-scope`),
      resourceOwnerAuthorizationRefHash: h(`${label}:owner-authorization`),
      rightsPrivacyPolicyRefHash: h(`${label}:rights-policy`),
    },
    exactOutcome: {
      outcomeKindCode: "GENERIC_OUTCOME_ESTABLISHED",
      outcomeSpecRefHash: h(`${label}:outcome-spec`),
      subjectRefHash: h(`${label}:subject`),
      acceptanceCriteriaRefHash: h(`${label}:acceptance-criteria`),
      conditions: [{ conditionId: alias("condition", `${label}:condition`),
        metricCode: "GENERIC_STATE", comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "COMPLETE", unitCode: null },
        observationWindowMs: 0,
        conditionRefHash: h(`${label}:condition-ref`), mandatory: true }],
      deadline: "2099-09-04T12:00:00.000Z",
    },
    formationDeadline: "2099-09-03T12:15:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: alias("resource", `${label}:primary`),
      resourceClassCode: "GENERIC_PRIMARY_RESOURCE",
      capabilityRefHash: h(`${label}:capability`), quantity: 1,
      unitCode: "RESOURCE", regionRefHash: h(`${label}:region`),
      requiredBy: "2099-09-04T10:00:00.000Z", mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "GENERIC_INDEPENDENT_EVIDENCE",
      evidenceRequirementRefHash: h(`${label}:evidence-ref`),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2099-09-04T12:00:00.000Z", mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", `${label}:recovery`),
      triggerRefHash: h(`${label}:trigger`),
      recoveryOutcomeRefHash: h(`${label}:recovery-outcome`),
      resourceClassCode: "GENERIC_RECOVERY_RESOURCE", maximumAttempts: 2,
      completionDeadline: "2099-09-04T12:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED", mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h(`${label}:consequence`),
      consequenceClassCode: "BOUNDED_GENERIC_FAILURE",
      measureCode: "MAXIMUM_DELAY", maximumValue: 120, unitCode: "MINUTE",
      affectedChannelRefHashes: [h(`${label}:channel`)],
      irreversibleHarmAllowed: false, unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  });
}

function requirementBinding(record) {
  const section = record.resourceRequirements;
  const requirement = section.items[0];
  return {
    requirementKind: "RESOURCE",
    requirementId: requirement.resourceRequirementId,
    requirementSetHash: section.requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: record.tenderHash,
        requirementKind: "RESOURCE",
        requirementSetHash: section.requirementSetHash,
        requirement,
      }),
  };
}

async function sellerFederation(label = "seller-federation") {
  const record = tender(label);
  const slot = alias("node", `${label}:brave-slot`);
  const plannedJob = {
    occurrenceId: alias("discovery", `${label}:brave-occurrence`),
    nodeSlotId: slot,
    nodeKind: "brave.web_search.v1",
    ...requirementBinding(record),
    expiresAt: "2099-09-03T12:14:00.000Z",
    maximumRuntimeMs: 1_000,
  };
  const capability = createOrderScopedDiscoveryNodeCapabilityV1({
    nodeKind: "brave.web_search.v1",
    async invoke(context) {
      const adapterResult = await discoverBraveSearchRoutesV1({
        tender: context.tender,
        requirementKind: context.requirementKind,
        requirementId: context.requirementId,
        query: context.nodeInput.query,
        asOf: context.asOf,
        privateBindingNonce: context.privateBindingNonce,
      }, {
        apiToken: "PRIVATE_BRAVE_TOKEN_CANARY",
        timeoutMs: 100,
        fetchImpl: async () => ({
          status: 200,
          headers: { get() { return null; } },
          async text() {
            return JSON.stringify({ type: "search", web: { type: "search",
              results: [{ title: "PRIVATE_RESULT_TITLE_CANARY",
                description: "PRIVATE_RESULT_DESCRIPTION_CANARY",
                url: "https://seller.example/private-product-page" }] } });
          },
        }),
      });
      return { publicReceipt: adaptBraveSearchDiscoveryProjectionV1(
        adapterResult, context), privateEphemeral: adapterResult };
    },
  });
  const query = {
    text: "PRIVATE_BRAVE_QUERY_CANARY",
    country: "US",
    searchLang: "en",
    count: 3,
    expiresAt: plannedJob.expiresAt,
  };
  const result = await runOrderScopedDiscoveryFederationV1({
    tender: record,
    asOf: "2099-09-03T12:01:00.000Z",
    publicPlan: {
      schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId: alias("federation", `${label}:federation`),
      tenderHash: record.tenderHash,
      workOrderHash: record.workOrderHash,
      typedGraphHash: record.typedGraph.typedGraphHash,
      concurrencyLimit: 1,
      jobs: [plannedJob],
    },
    privateJobs: [{ occurrenceId: plannedJob.occurrenceId,
      nodeInput: { query }, privateBindingNonce: h(`${label}:private`) }],
    privateProjectionNonce: h(`${label}:projection`),
  }, { capabilityBindings: [{ nodeSlotId: slot, capability }] });
  const sellerOriginLease
    = importWooCommerceSellerOriginFromBraveFederationV1({
      federationResult: result,
      expectedTenderHash: record.tenderHash,
      occurrenceId: plannedJob.occurrenceId,
      candidateIndex: 0,
    });
  return { record, result, plannedJob, sellerOriginLease };
}

function headers(values = {}) {
  const map = new Map(Object.entries(values)
    .map(([key, value]) => [key.toLowerCase(), value]));
  return { get(name) { return map.get(name.toLowerCase()) ?? null; } };
}

function jsonResponse(body, values = {}) {
  return { status: 200, headers: headers({
    "content-type": "application/json; charset=utf-8", ...values,
  }), async text() { return JSON.stringify(body); } };
}

function wooInput(sellerOriginLease, overrides = {}) {
  return {
    sellerOriginLease,
    search: "PRIVATE_PRODUCT_SEARCH_CANARY",
    limit: 4,
    asOf: "2099-09-03T12:02:00.000Z",
    expiresAt: sellerOriginLease.expiresAt,
    privateBindingNonce: h("woo-private-binding"),
    ...overrides,
  };
}

test("module-issued seller lease performs only bounded seller-owned reads",
  async () => {
    const { sellerOriginLease } = await sellerFederation();
    assert.equal(Object.hasOwn(sellerOriginLease, "sellerOrigin"), false);
    assert.equal(Object.hasOwn(sellerOriginLease, "url"), false);
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push([url, options]);
      if (calls.length === 1) {
        return { status: 200, headers: headers({ link:
          '<https://seller.example/wp-json/>; rel="https://api.w.org/"' }) };
      }
      if (calls.length === 2) {
        return jsonResponse({ namespaces: ["wp/v2", "wc/store/v1"],
          routes: { "/wc/store/v1/products": { methods: ["GET"] } } });
      }
      return jsonResponse([{ id: 41,
        name: "PRIVATE_PRODUCT_NAME_CANARY", slug: "private-product",
        prices: { currency_code: "USD", currency_minor_unit: 2,
          price: "1299" }, is_purchasable: true, is_in_stock: true,
        has_options: false,
        add_to_cart: { text: "PRIVATE_ADD_TO_CART_CANARY" } }]);
    };
    const result = await discoverWooCommerceProductsV1(
      wooInput(sellerOriginLease), { fetchImpl, timeoutMs: 100 });

    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(([url, options]) => [new URL(url).pathname,
      options.method]), [["/", "HEAD"], ["/wp-json/", "GET"],
      ["/wp-json/wc/store/v1/products", "GET"]]);
    const productsUrl = new URL(calls[2][0]);
    assert.equal(productsUrl.searchParams.get("search"),
      "PRIVATE_PRODUCT_SEARCH_CANARY");
    assert.equal(productsUrl.searchParams.get("per_page"), "4");
    for (const [, options] of calls) {
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      assert.equal(Object.hasOwn(options.headers, "Authorization"), false);
      assert.equal(Object.hasOwn(options.headers, "Cookie"), false);
    }
    assert.equal(calls.some(([url]) => /\/(?:cart|checkout)(?:\/|$)/iu
      .test(new URL(url).pathname)), false);
    assert.equal(result.publicProjection.status, "SUCCEEDED");
    assert.equal(result.publicProjection.readOnlyHttpAttemptCount, 3);
    assert.equal(result.publicProjection.authority, "NONE");
    assert.equal(result.publicProjection.decisionState, "HOLD");
    assert.equal(result.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(result.publicProjection.inventoryReservationEstablished, false);
    assert.equal(result.publicProjection.capacityReserved, false);

    const durable = JSON.stringify(result);
    for (const canary of ["seller.example", "PRIVATE_PRODUCT_SEARCH_CANARY",
      "PRIVATE_PRODUCT_NAME_CANARY", "private-product", "1299", "USD",
      "PRIVATE_ADD_TO_CART_CANARY", "PRIVATE_BRAVE_TOKEN_CANARY",
      "PRIVATE_BRAVE_QUERY_CANARY"]) assert.equal(durable.includes(canary), false);
    const candidate = claimWooCommerceProductCandidateV1(result, 0);
    assert.equal(candidate.productId, 41);
    assert.equal(candidate.productName, "PRIVATE_PRODUCT_NAME_CANARY");
    assert.equal(candidate.sellerPublishedInStock, true);
    assert.equal(candidate.sellerPublishedPurchasable, true);
    assert.equal(candidate.resourceOwnerAuthorityEstablished, false);
    assert.equal(candidate.bindingOfferEstablished, false);
    assert.equal(candidate.inventoryReservationEstablished, false);
    assert.equal(candidate.capacityEstablished, false);
    assert.equal(candidate.actionPermitted, false);
    assert.throws(() => claimWooCommerceProductCandidateV1(result, 0),
      /PRODUCT_CANDIDATE_ALREADY_CONSUMED/u);
  });

test("naked or fabricated origins are rejected before network I/O", async () => {
  let calls = 0;
  const dependencies = { fetchImpl: async () => { calls += 1; },
    timeoutMs: 100 };
  await assert.rejects(discoverWooCommerceProductsV1({
    sellerOriginLease: {}, search: "product", limit: 1,
    asOf: "2099-09-03T12:02:00.000Z",
    expiresAt: "2099-09-03T12:14:00.000Z",
    privateBindingNonce: h("fake"),
  }, dependencies), /SELLER_ORIGIN_LEASE_NOT_MODULE_ISSUED/u);
  await assert.rejects(discoverWooCommerceProductsV1({
    sellerOriginLease: {}, sellerOrigin: "https://attacker.example",
    search: "product", limit: 1,
    asOf: "2099-09-03T12:02:00.000Z",
    expiresAt: "2099-09-03T12:14:00.000Z",
    privateBindingNonce: h("fake-extra"),
  }, dependencies), /INPUT_FIELDS_INVALID/u);
  assert.equal(calls, 0);
});

test("invalid API index and oversized JSON fail closed without products call",
  async () => {
    const first = await sellerFederation("invalid-index");
    let calls = 0;
    const invalid = await discoverWooCommerceProductsV1(
      wooInput(first.sellerOriginLease), {
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) return { status: 200, headers: headers() };
          return jsonResponse({ namespaces: ["wp/v2"], routes: {} });
        }, timeoutMs: 100,
      });
    assert.equal(calls, 2);
    assert.equal(invalid.publicProjection.status, "FAILED");
    assert.equal(invalid.publicProjection.terminalStage, "WORDPRESS_API_INDEX");
    assert.equal(invalid.publicProjection.capacityEstablished, false);

    const second = await sellerFederation("oversized-index");
    let bodyRead = false;
    let signal;
    const oversized = await discoverWooCommerceProductsV1(
      wooInput(second.sellerOriginLease), {
        fetchImpl: async (_url, options) => {
          calls += 1;
          if (options.method === "HEAD") {
            return { status: 200, headers: headers() };
          }
          signal = options.signal;
          return { status: 200, headers: headers({
            "content-type": "application/json",
            "content-length": String(1024 * 1024 + 1),
          }), async text() { bodyRead = true; return "PRIVATE_RAW_CANARY"; } };
        }, timeoutMs: 100,
      });
    assert.equal(bodyRead, false);
    assert.equal(signal.aborted, true);
    assert.equal(oversized.publicProjection.status, "FAILED");
    assert.equal(JSON.stringify(oversized).includes("PRIVATE_RAW_CANARY"), false);
  });

test("boundary is read-only, bounded, private, and cannot reserve capacity",
  () => {
    const boundary = OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_BOUNDARY;
    assert.equal(boundary.nakedUrlAccepted, false);
    assert.equal(boundary.privateCandidateLeaseRequiredForOriginImport, true);
    assert.equal(boundary.maximumHttpRequests, 3);
    assert.equal(boundary.retriesPermitted, false);
    assert.equal(boundary.redirectsPermitted, false);
    assert.deepEqual(boundary.permittedMethods, ["HEAD", "GET"]);
    assert.equal(boundary.cartMutationPermitted, false);
    assert.equal(boundary.checkoutPermitted, false);
    assert.equal(boundary.orderCreationPermitted, false);
    assert.equal(boundary.paymentPermitted, false);
    assert.equal(boundary.sellerOriginProjected, false);
    assert.equal(boundary.productPriceProjected, false);
    assert.equal(boundary.providerAcceptanceEstablished, false);
    assert.equal(boundary.inventoryReservationEstablished, false);
    assert.equal(boundary.capacityReserved, false);
    assert.equal(boundary.authority, "NONE");
    assert.equal(boundary.decisionState, "HOLD");
    assert.equal(boundary.executable, false);
  });
