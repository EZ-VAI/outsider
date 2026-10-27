import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  claimOrderScopedDiscoveryNodeResultV1,
  createOrderScopedDiscoveryNodeCapabilityV1,
  runOrderScopedDiscoveryFederationV1,
} from "../src/outsider-order-scoped-discovery-federation-v1.js";
import {
  createOrderScopedSellerOriginIssuerV1,
  sealSellerOriginFromDiscoveryInvocationV1,
} from "../src/outsider-order-scoped-seller-origin-lease-v1.js";
import {
  OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_NODE_KIND,
  createBraveSellerOriginDiscoveryNodeV2,
} from "../src/outsider-brave-seller-origin-discovery-node-v2.js";
import { probeSellerOriginReadOnlyV2 }
  from "../src/outsider-seller-origin-read-only-probe-v2.js";
import {
  claimSellerTransactionEndpointLeaseV2,
  discoverSellerTransactionInterfaceV2,
} from "../src/outsider-seller-transaction-interface-discovery-adapter-v2.js";
import { handleSellerOwnedHttpOneUseTenderRequestV1 }
  from "../src/outsider-seller-owned-http-one-use-tender-endpoint-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";
import { createWebNativeMailtoTransactionSurfaceRouteAdapterV1 }
  from "../src/outsider-web-native-mailto-transaction-surface-route-adapter-v1.js";
import { driveTransactionSurfaceOneUseTenderRouteV1 }
  from "../src/outsider-transaction-surface-one-use-route-runtime-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const id = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const digest = (domain, value) => h(
  `${domain}\0${canonicalizeStrict(value)}`);
const PUBLIC_V4 = "93.184.216.34";
const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "seller-origin-endpoint-gap",
});

function futureTender(base) {
  const resource = base.resourceRequirements.items[0];
  const evidence = base.evidenceRequirements.items[0];
  const recovery = base.recoveryRequirements.items[0];
  return compileOutsiderOutcomeTenderV1({
    tenderId: base.tenderId,
    compiledAt: "2099-01-01T00:00:00.000Z",
    lineage: {
      revision: base.lineage.revision,
      predecessorTenderHash: base.lineage.predecessorTenderHash,
      supersedesTenderHash: base.lineage.supersedesTenderHash,
    },
    workOrderHash: base.workOrderHash,
    typedGraph: {
      principalEpoch: base.typedGraph.principalEpoch,
      accountableDeployment: base.typedGraph.accountableDeployment,
      runtime: base.typedGraph.runtime,
      embodiment: base.typedGraph.embodiment,
      delegation: base.typedGraph.delegation,
      episode: base.typedGraph.episode,
      attempt: base.typedGraph.attempt,
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash:
        base.authorizationBinding.actorIdentityEnvelopeHash,
      delegationEvidenceRefHash:
        base.authorizationBinding.delegationEvidenceRefHash,
      delegationEdgeHash: base.authorizationBinding.delegationEdgeHash,
      authorityScopeRefHash:
        base.authorizationBinding.authorityScopeRefHash,
      resourceOwnerAuthorizationRefHash:
        base.authorizationBinding.resourceOwnerAuthorizationRefHash,
      rightsPrivacyPolicyRefHash:
        base.authorizationBinding.rightsPrivacyPolicyRefHash,
    },
    exactOutcome: {
      outcomeKindCode: base.exactOutcome.outcomeKindCode,
      outcomeSpecRefHash: base.exactOutcome.outcomeSpecRefHash,
      subjectRefHash: base.exactOutcome.subjectRefHash,
      acceptanceCriteriaRefHash: base.exactOutcome.acceptanceCriteriaRefHash,
      conditions: base.exactOutcome.conditions,
      deadline: "2099-01-02T00:00:00.000Z",
    },
    formationDeadline: "2099-01-01T00:10:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: resource.resourceRequirementId,
      resourceClassCode: resource.resourceClassCode,
      capabilityRefHash: resource.capabilityRefHash,
      quantity: resource.quantity,
      unitCode: resource.unitCode,
      regionRefHash: resource.regionRefHash,
      requiredBy: "2099-01-01T00:11:00.000Z",
      mandatory: resource.mandatory,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidence.evidenceRequirementId,
      evidenceClassCode: evidence.evidenceClassCode,
      evidenceRequirementRefHash: evidence.evidenceRequirementRefHash,
      sourceControl: evidence.sourceControl,
      observationMode: evidence.observationMode,
      dueBy: "2099-01-02T00:00:00.000Z",
      mandatory: evidence.mandatory,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: recovery.recoveryRequirementId,
      triggerRefHash: recovery.triggerRefHash,
      recoveryOutcomeRefHash: recovery.recoveryOutcomeRefHash,
      resourceClassCode: recovery.resourceClassCode,
      maximumAttempts: recovery.maximumAttempts,
      completionDeadline: "2099-01-02T00:00:00.000Z",
      recoveryEvidenceRequirementId: recovery.recoveryEvidenceRequirementId,
      routePolicy: recovery.routePolicy,
      mandatory: recovery.mandatory,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash:
        base.maximumConsequence.consequenceEnvelopeRefHash,
      consequenceClassCode: base.maximumConsequence.consequenceClassCode,
      measureCode: base.maximumConsequence.measureCode,
      maximumValue: base.maximumConsequence.maximumValue,
      unitCode: base.maximumConsequence.unitCode,
      affectedChannelRefHashes:
        base.maximumConsequence.affectedChannelRefHashes,
      irreversibleHarmAllowed:
        base.maximumConsequence.irreversibleHarmAllowed,
      unboundedConsequenceAllowed:
        base.maximumConsequence.unboundedConsequenceAllowed,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed:
        base.zeroInternalOps.outsiderStaffInterventionsAllowed,
      internalManualSourcingAllowed:
        base.zeroInternalOps.internalManualSourcingAllowed,
      internalManualCoordinationAllowed:
        base.zeroInternalOps.internalManualCoordinationAllowed,
      internalManualVerificationAllowed:
        base.zeroInternalOps.internalManualVerificationAllowed,
      internalManualRecoveryAllowed:
        base.zeroInternalOps.internalManualRecoveryAllowed,
      humanQueueFallbackAllowed:
        base.zeroInternalOps.humanQueueFallbackAllowed,
      failureDisposition: base.zeroInternalOps.failureDisposition,
    },
  });
}

const tenderRecord = futureTender(fixture.tender);

function requirementBinding(tender) {
  const requirement = tender.resourceRequirements.items[0];
  return {
    requirementKind: "RESOURCE",
    requirementId: requirement.resourceRequirementId,
    requirementSetHash: tender.resourceRequirements.requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: tender.tenderHash,
        requirementKind: "RESOURCE",
        requirementSetHash: tender.resourceRequirements.requirementSetHash,
        requirement,
      }),
  };
}

async function originLease(label, nodeKind, sellerOrigin) {
  const tender = tenderRecord;
  const requirement = requirementBinding(tender);
  const binding = {
    tenderHash: tender.tenderHash,
    workOrderHash: tender.workOrderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    occurrenceId: id("discovery", label),
    nodeSlotId: id("node", label),
    nodeKind,
    ...requirement,
    expiresAt: "2099-01-01T00:09:00.000Z",
    privateBindingNonce: h(`${label}:private-binding`),
  };
  const issuer = createOrderScopedSellerOriginIssuerV1(binding);
  const capability = createOrderScopedDiscoveryNodeCapabilityV1({
    nodeKind,
    async invoke(invocation) {
      return sealSellerOriginFromDiscoveryInvocationV1(issuer, invocation, {
        sellerOrigin,
        externalInfrastructureNetworkIoAttempted: false,
      });
    },
  });
  const job = {
    occurrenceId: binding.occurrenceId,
    nodeSlotId: binding.nodeSlotId,
    nodeKind,
    ...requirement,
    expiresAt: binding.expiresAt,
  };
  const result = await runOrderScopedDiscoveryFederationV1({
    tender,
    asOf: "2099-01-01T00:01:00.000Z",
    publicPlan: {
      schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId: id("federation", label),
      tenderHash: tender.tenderHash,
      workOrderHash: tender.workOrderHash,
      typedGraphHash: tender.typedGraph.typedGraphHash,
      concurrencyLimit: 1,
      jobs: [{ ...job, maximumRuntimeMs: 1_000 }],
    },
    privateJobs: [{
      occurrenceId: binding.occurrenceId,
      nodeInput: {},
      privateBindingNonce: binding.privateBindingNonce,
    }],
    privateProjectionNonce: h(`${label}:projection`),
  }, {
    capabilityBindings: [{ nodeSlotId: binding.nodeSlotId, capability }],
  });
  const lease = claimOrderScopedDiscoveryNodeResultV1(
    result, binding.occurrenceId);
  const originBinding = { ...binding };
  delete originBinding.privateBindingNonce;
  return { lease, originBinding, binding };
}

function pinnedDescriptorTransport(origin, calls) {
  const endpoint = `${origin}/outsider/v1/one-use-tender-responses`;
  const descriptor = JSON.stringify({
    schema: "https://outsider.network/schemas/transaction-interface/v1",
    version: "1.0.0",
    expiresAt: "2099-01-01T00:08:00.000Z",
    machineUse: true,
    oneUseTender: {
      accepted: true,
      endpoint,
      method: "POST",
      contentType: "application/json",
    },
  });
  return {
    async lookupImpl(hostname, options) {
      calls.push({ phase: "dns", hostname, all: options.all,
        verbatim: options.verbatim });
      return [{ address: PUBLIC_V4, family: 4 }];
    },
    async requestImpl(request) {
      calls.push({ phase: "https", url: request.url,
        address: request.address, method: request.method });
      return {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(descriptor, "utf8")),
        },
        body: Buffer.from(descriptor, "utf8"),
        remoteAddress: PUBLIC_V4,
        remoteFamily: "IPv4",
        tlsAuthorized: true,
        tlsServernameVerified: true,
        tlsCertificateHostnameVerified: true,
      };
    },
  };
}

test("two generic node kinds reach a pinned well-known descriptor, but v2 has no opaque bridge into formation",
  async () => {
    const cases = [
      ["directory.edge.v1", "directory-edge", "https://directory-edge.example"],
      ["device.local.v1", "device-local", "https://device-local.example"],
    ];
    for (const [nodeKind, label, origin] of cases) {
      const issued = await originLease(label, nodeKind, origin);
      assert.equal(Object.hasOwn(issued.lease, "origin"), false);
      const calls = [];
      const descriptorLease = await discoverSellerTransactionInterfaceV2({
        sellerOriginLease: issued.lease,
        originBinding: issued.originBinding,
        asOf: "2099-01-01T00:03:00.000Z",
        expiresAt: issued.binding.expiresAt,
        privateBindingNonce: issued.binding.privateBindingNonce,
      }, {
        transportConfig: pinnedDescriptorTransport(origin, calls),
        timeoutMs: 1_000,
      });
      assert.equal(descriptorLease.publicProjection.status,
        "INTERFACE_DESCRIBED");
      assert.equal(descriptorLease.publicProjection.sameOriginEndpointVerified,
        true);
      assert.equal(descriptorLease.publicProjection.endpointProjected, false);
      assert.deepEqual(calls.map((item) => item.phase), ["dns", "https"]);
      assert.equal(calls[1].url,
        `${origin}/.well-known/outsider`);

      const claimed = claimSellerTransactionEndpointLeaseV2(descriptorLease);
      assert.equal(claimed.invocationPermittedByThisLease, false);
      assert.equal(claimed.authorityEstablished, false);
      assert.equal(claimed.capacityReserved, false);
      /* This is the exact missing seam: v2 materializes a naked URL on claim,
         while the injected seller endpoint is a distinct WeakMap capability.
         Passing the claimed lease cannot enter the endpoint or formation path. */
      assert.equal(Object.hasOwn(claimed, "endpoint"), true);
      assert.throws(() => handleSellerOwnedHttpOneUseTenderRequestV1(
        claimed, {}), /ENDPOINT_CAPABILITY_INVALID/u);
    }
  });

test("one Brave candidate reaches the generic one-use runtime through a private mailto adapter closure",
  async (t) => {
    const label = "brave-mailto-runtime";
    const tender = tenderRecord;
    const requirement = requirementBinding(tender);
    const binding = {
      tenderHash: tender.tenderHash,
      workOrderHash: tender.workOrderHash,
      typedGraphHash: tender.typedGraph.typedGraphHash,
      occurrenceId: id("discovery", label),
      nodeSlotId: id("node", label),
      nodeKind: OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_NODE_KIND,
      ...requirement,
      expiresAt: "2099-01-01T00:09:00.000Z",
      privateBindingNonce: h(`${label}:private-binding`),
    };
    let braveRequests = 0;
    const braveCapability = createBraveSellerOriginDiscoveryNodeV2({
      apiToken: "PRIVATE_TEST_BRAVE_TOKEN",
      timeoutMs: 1_000,
      candidateIndex: 0,
      async fetchImpl() {
        braveRequests += 1;
        return {
          status: 200,
          headers: { get() { return null; } },
          async text() {
            return JSON.stringify({ type: "search", web: { results: [{
              title: "PRIVATE SELLER",
              url: "https://seller.example.com/private/catalog",
              description: "PRIVATE DESCRIPTION",
            }] } });
          },
        };
      },
    });
    const federation = await runOrderScopedDiscoveryFederationV1({
      tender,
      asOf: "2099-01-01T00:01:00.000Z",
      publicPlan: {
        schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
        federationId: id("federation", label),
        tenderHash: binding.tenderHash,
        workOrderHash: binding.workOrderHash,
        typedGraphHash: binding.typedGraphHash,
        concurrencyLimit: 1,
        jobs: [{
          occurrenceId: binding.occurrenceId,
          nodeSlotId: binding.nodeSlotId,
          nodeKind: binding.nodeKind,
          ...requirement,
          expiresAt: binding.expiresAt,
          maximumRuntimeMs: 1_000,
        }],
      },
      privateJobs: [{
        occurrenceId: binding.occurrenceId,
        privateBindingNonce: binding.privateBindingNonce,
        nodeInput: { query: {
          text: "supplier public request contact",
          country: null,
          searchLang: "en",
          count: 1,
          expiresAt: binding.expiresAt,
        } },
      }],
      privateProjectionNonce: h(`${label}:federation-projection`),
    }, { capabilityBindings: [{ nodeSlotId: binding.nodeSlotId,
      capability: braveCapability }] });
    assert.equal(braveRequests, 1);
    const sellerOriginLease = claimOrderScopedDiscoveryNodeResultV1(
      federation, binding.occurrenceId);
    const originBinding = { ...binding };
    delete originBinding.privateBindingNonce;
    const sellerReads = [];
    const sellerProbeResult = await probeSellerOriginReadOnlyV2({
      sellerOriginLease,
      originBinding,
      asOf: "2099-01-01T00:02:00.000Z",
      expiresAt: binding.expiresAt,
      privateBindingNonce: h(`${label}:seller-probe`),
    }, {
      timeoutMs: 1_000,
      maximumWebDocumentBytes: 64 * 1024,
      maximumWebRedirects: 0,
      transportConfig: {
        async lookupImpl() {
          return [{ address: PUBLIC_V4, family: 4 }];
        },
        async requestImpl(request) {
          sellerReads.push(request.url);
          const descriptor = request.url.endsWith("/.well-known/outsider");
          const body = descriptor ? "not found"
            : "<a href='mailto:orders@seller.example.com'>Request quote</a>";
          return {
            status: descriptor ? 404 : 200,
            headers: {
              "content-type": descriptor
                ? "text/plain" : "text/html; charset=utf-8",
              "content-length": String(Buffer.byteLength(body, "utf8")),
            },
            body: Buffer.from(body, "utf8"),
            remoteAddress: PUBLIC_V4,
            remoteFamily: "IPv4",
            tlsAuthorized: true,
            tlsServernameVerified: true,
            tlsCertificateHostnameVerified: true,
          };
        },
      },
    });
    assert.equal(sellerProbeResult.publicProjection.status,
      "WEB_NATIVE_SURFACES_OBSERVED");
    const surface = sellerProbeResult.publicProjection.webNativeFallback
      .projection.surfaceOccurrences[0];
    assert.equal(surface.surfaceKind, "MAILTO_LINK");

    const times = ["2099-01-01T00:04:00.000Z",
      "2099-01-01T00:04:02.000Z", "2099-01-01T00:04:03.000Z",
      "2099-01-01T00:04:05.000Z"];
    let timeIndex = 0;
    const contacts = [];
    const adapter = createWebNativeMailtoTransactionSurfaceRouteAdapterV1({
      contractObservedAt: "2099-01-01T00:03:00.000Z",
      privateAdapterInstanceRefHash: h(`${label}:adapter-instance`),
      privateProjectionNonce: h(`${label}:adapter-projection`),
      clock: () => times[Math.min(timeIndex++, times.length - 1)],
      async revalidateContactAuthority(input) {
        assert.equal(input.recipient, "orders@seller.example.com");
        return { decision: "AUTHORIZED",
          evaluatedAt: "2099-01-01T00:04:01.000Z",
          validUntil: "2099-01-01T00:08:30.000Z",
          sourceBytes: Buffer.from("current account-native contact grant",
            "utf8") };
      },
      async deliverExact(input) {
        contacts.push(input);
        return {
          completedAt: "2099-01-01T00:04:04.000Z",
          deliveryReceiptBytes: Buffer.from("mailbox accepted one message",
            "utf8"),
          counterpartyResponseBytes: null,
          reservationReceiptBytes: null,
        };
      },
    });
    const ledgerRoot = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-brave-mailto-route-runtime-")));
    chmodSync(ledgerRoot, 0o700);
    t.after(() => rmSync(ledgerRoot, { recursive: true, force: true }));
    const routeResult = await driveTransactionSurfaceOneUseTenderRouteV1(
      adapter, {
        candidateLease: sellerProbeResult,
        candidateRefHash: surface.surfaceRefHash,
        programHash: h(`${label}:program`),
        tenderHash: tender.tenderHash,
        workOrderHash: tender.workOrderHash,
        typedGraphHash: tender.typedGraph.typedGraphHash,
        requirementKind: requirement.requirementKind,
        requirementId: requirement.requirementId,
        discoveryOccurrenceId: binding.occurrenceId,
        tenderBytes: Buffer.from(canonicalizeStrict({
          schema: "outsider/one-use-tender-wire-test/v1",
          tenderHash: tender.tenderHash,
        }), "utf8"),
        authorityGrantHash: h(`${label}:contact-authority`),
        effectDeadline: "2099-01-01T00:08:00.000Z",
        expectedContractHash: adapter.contractHash,
        expectedTransportProfileRefHash: adapter.transportProfileRefHash,
        ledger: { directory: path.join(ledgerRoot, "effect-ledger"),
          ledgerId: `ledger_${h(label).slice(7, 39)}` },
      });
    assert.equal(routeResult.publicProjection.state,
      "SOURCE_RECEIPTS_OBSERVED_HOLD");
    assert.equal(routeResult.publicProjection.transportFamily,
      "PERMISSIONED_MAILBOX");
    assert.equal(routeResult.publicProjection.adapterSubmitCallCount, 1);
    assert.equal(routeResult.publicProjection.deliveryReceiptObserved, true);
    assert.equal(routeResult.publicProjection.providerAcceptanceEstablished,
      false);
    assert.equal(routeResult.publicProjection.capacityReserved, false);
    assert.equal(routeResult.publicProjection.paymentPerformed, false);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].recipient, "orders@seller.example.com");
    assert.deepEqual(sellerReads, [
      "https://seller.example.com/.well-known/outsider",
      "https://seller.example.com/",
    ]);
    const publicBytes = JSON.stringify(routeResult);
    for (const privateValue of ["PRIVATE_TEST_BRAVE_TOKEN", "PRIVATE SELLER",
      "seller.example.com", "orders@seller.example.com",
      "mailbox accepted one message"]) {
      assert.equal(publicBytes.includes(privateValue), false, privateValue);
    }
  });
