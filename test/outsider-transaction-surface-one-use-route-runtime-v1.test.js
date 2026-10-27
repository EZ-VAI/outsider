import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createTransactionSurfaceAdapterContractSourcePinV1,
  createTransactionSurfaceAdapterContractV1,
} from "../src/outsider-transaction-surface-adapter-contract-v1.js";
import { verifyDurableOneUseEndpointEffectLedgerV1 }
  from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import {
  claimTransactionSurfaceOneUseRouteSourcesV1,
  createTransactionSurfaceOneUseRouteAdapterV1,
  driveTransactionSurfaceOneUseTenderRouteV1,
} from "../src/outsider-transaction-surface-one-use-route-runtime-v1.js";

const h = (value) => `sha256:${createHash("sha256")
  .update(value, "utf8").digest("hex")}`;

function capability(capabilityCode, supported, profileRef) {
  return { capability: capabilityCode, supported,
    transportProfileRefHashes: supported ? [profileRef] : [],
    maximumSideEffectsPerTender: supported
      && ["STRUCTURED_QUOTE_REQUEST", "ONE_USE_TENDER_DELIVERY",
        "CAPACITY_RESERVATION_REQUEST", "RESERVATION_CANCELLATION",
        "PERMISSION_REVOCATION"].includes(capabilityCode) ? 1 : 0 };
}

function contractFixture(label, transportFamily, strictResponse = true) {
  const profileRef = h(`${label}:profile-ref`);
  const source = {
    observedAt: "2099-01-01T00:00:00.000Z",
    privateAdapterInstanceRefHash: h(`${label}:private-adapter`),
    privateProjectionNonce: h(`${label}:private-projection`),
    adapterClosure: {
      adapterImplementationHash: h(`${label}:implementation`),
      adapterPackageProfileHash: h(`${label}:package`),
    },
    supportedTransportProfiles: [{
      transportProfileRefHash: profileRef,
      transportFamily,
      profileVersion: "1.0.0",
      requestSchemaHash: h(`${label}:request-schema`),
      responseSchemaHash: h(`${label}:response-schema`),
      lifecycleSchemaHash: h(`${label}:lifecycle-schema`),
      strictFiniteResponseGrammarRequired: true,
      naturalLanguageResponseAccepted: false,
      serverAcknowledgementIsAcceptance: false,
      deliveryReceiptIsAcceptance: false,
      arbitraryUrlExecutionPermitted: false,
      genericBrowserDriverPermitted: false,
    }],
    inputContracts: {
      permission: {
        inputSchemaHash: h(`${label}:permission-input`),
        replayVerifierImplementationHash: h(`${label}:permission-replay`),
        lifecycleHeadSchemaHash: h(`${label}:permission-lifecycle`),
        appendOnlyLifecycleRequired: true,
        currentGrantRequiredAtEachEffect: true,
        revocationFailClosed: true,
        callerDeclarationAloneSufficient: false,
      },
      credentialLease: {
        inputSchemaHash: h(`${label}:credential-input`),
        replayVerifierImplementationHash: h(`${label}:credential-replay`),
        leaseReceiptSchemaHash: h(`${label}:credential-receipt`),
        finiteExpiryRequired: true,
        exactScopeRequired: true,
        revalidationAtEachCredentialedEffect: true,
        rawCredentialMaterialProjected: false,
        callerDeclarationAloneSufficient: false,
      },
      rights: {
        inputSchemaHash: h(`${label}:rights-input`),
        replayVerifierImplementationHash: h(`${label}:rights-replay`),
        reviewReceiptSchemaHash: h(`${label}:rights-receipt`),
        sourceRevisionPinRequired: true,
        purposeAndJurisdictionBound: true,
        revocationReplayRequired: true,
        callerDeclarationAloneSufficient: false,
      },
      privacy: {
        inputSchemaHash: h(`${label}:privacy-input`),
        replayVerifierImplementationHash: h(`${label}:privacy-replay`),
        reviewReceiptSchemaHash: h(`${label}:privacy-receipt`),
        dataMinimizationRequired: true,
        privateIdentifierProjectionAllowed: false,
        rawSourceProjectionAllowed: false,
        callerDeclarationAloneSufficient: false,
      },
    },
    oneUseControls: {
      oneTenderScopeRequired: true,
      idempotencyKeyHashRequired: true,
      idempotencyObservedBeforeEffectRequired: true,
      nonceHashRequired: true,
      nonceReservationBeforeEffectRequired: true,
      nonceSingleConsumptionRequired: true,
      consumedNonceReplayRejected: true,
      exactFormationDeadlineRequired: true,
      newFormationEffectsAfterDeadlineForbidden: true,
      lateResponseCannotFormCommitment: true,
      reservationRequiresExplicitBoundResponse: true,
      cancellationRequiresReservationBinding: true,
      revocationRequiresPermissionLifecycleBinding: true,
      cancellationAndRevocationIdempotent: true,
      terminalStateCannotReopen: true,
      standingCapacityInferred: false,
    },
    capabilityDeclarations: [
      capability("PERMITTED_ROUTE_DISCOVERY", true, profileRef),
      capability("STRUCTURED_QUOTE_REQUEST", false, profileRef),
      capability("STRICT_QUOTE_OBSERVATION", false, profileRef),
      capability("ONE_USE_TENDER_DELIVERY", true, profileRef),
      capability("STRICT_RESPONSE_OBSERVATION", strictResponse, profileRef),
      capability("CAPACITY_RESERVATION_REQUEST", false, profileRef),
      capability("RESERVATION_CANCELLATION", false, profileRef),
      capability("PERMISSION_REVOCATION", false, profileRef),
    ],
    maximumAggregateSideEffectsPerTender: 1,
  };
  const contractRecord = createTransactionSurfaceAdapterContractV1(source);
  const pin = createTransactionSurfaceAdapterContractSourcePinV1(source);
  return { source, contractRecord, sourceHash: pin.sourceHash, profileRef };
}

function ledger(t, label) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(),
    `outsider-surface-runtime-${label}-`)));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { directory: path.join(root, "ledger"),
    ledgerId: `ledger_${h(label).slice(7, 39)}` };
}

function clock(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function driveInput(candidateLease, fixture, ledgerInput) {
  return {
    candidateLease,
    candidateRefHash: h("candidate"),
    programHash: h("program"),
    tenderHash: h("tender"),
    workOrderHash: h("work-order"),
    typedGraphHash: h("typed-graph"),
    requirementKind: "RESOURCE",
    requirementId: "resource_0123456789abcdef0123456789abcdef",
    discoveryOccurrenceId: "discovery_0123456789abcdef0123456789abcdef",
    tenderBytes: Buffer.from("exact structured one-use tender", "utf8"),
    authorityGrantHash: h("exact-contact-grant"),
    effectDeadline: "2099-01-01T00:30:00.000Z",
    expectedContractHash: fixture.contractRecord.contractHash,
    expectedTransportProfileRefHash: fixture.profileRef,
    ledger: ledgerInput,
  };
}

function adapterFixture(fixture, overrides = {}) {
  const consumed = new WeakSet();
  const calls = { claims: 0, authorizations: 0, submits: 0 };
  const capability = createTransactionSurfaceOneUseRouteAdapterV1({
    contractRecord: fixture.contractRecord,
    contractSource: fixture.source,
    expectedSourceHash: fixture.sourceHash,
    expectedContractHash: fixture.contractRecord.contractHash,
    transportProfileRefHash: fixture.profileRef,
    clock: clock("2099-01-01T00:00:01.000Z",
      "2099-01-01T00:00:03.000Z", "2099-01-01T00:00:04.000Z",
      "2099-01-01T00:00:06.000Z", "2099-01-01T00:00:07.000Z"),
    async claimCandidate(candidate, binding) {
      calls.claims += 1;
      if (consumed.has(candidate)) throw new Error("consumed");
      consumed.add(candidate);
      return { candidateRefHash: binding.candidateRefHash,
        expiresAt: "2099-01-01T01:00:00.000Z",
        route: { secretEndpoint: candidate.secretEndpoint } };
    },
    async revalidateExact({ transactionBindingHash }) {
      calls.authorizations += 1;
      return { transactionBindingHash, decision: "AUTHORIZED",
        evaluatedAt: "2099-01-01T00:00:02.000Z",
        validUntil: "2099-01-01T00:40:00.000Z",
        sourceOccurrences: [{
          sourceKind: "CONTACT_AUTHORITY_REVALIDATION",
          observedAt: "2099-01-01T00:00:02.000Z",
          bytes: Buffer.from("current exact contact grant", "utf8"),
        }] };
    },
    async submitExact(input) {
      calls.submits += 1;
      assert.equal(input.route.secretEndpoint,
        "https://private.seller.example/submit");
      assert.equal(input.tenderBytes.toString("utf8"),
        "exact structured one-use tender");
      const sameBytes = Buffer.from("same external receipt bytes", "utf8");
      return { transactionBindingHash: input.transactionBindingHash,
        completedAt: "2099-01-01T00:00:05.000Z",
        attemptedEffectCount: 1,
        sourceOccurrences: [
          { sourceKind: "DELIVERY_RECEIPT",
            observedAt: "2099-01-01T00:00:05.000Z", bytes: sameBytes },
          { sourceKind: "COUNTERPARTY_RESPONSE",
            observedAt: "2099-01-01T00:00:05.000Z", bytes: sameBytes },
        ] };
    },
    ...overrides,
  });
  return { capability, calls };
}

test("one runtime drives unrelated native transport families without a provider registry",
  async (t) => {
    for (const [label, family] of [["official-api", "OFFICIAL_PROVIDER_API"],
      ["buyer-api", "MARKETPLACE_BUYER_API"]]) {
      const fixture = contractFixture(label, family);
      const adapter = adapterFixture(fixture);
      const candidate = {
        secretEndpoint: "https://private.seller.example/submit",
      };
      const result = await driveTransactionSurfaceOneUseTenderRouteV1(
        adapter.capability, driveInput(candidate, fixture, ledger(t, label)));
      const projection = result.publicProjection;
      assert.equal(projection.state, "SOURCE_RECEIPTS_OBSERVED_HOLD");
      assert.equal(projection.transportFamily, family);
      assert.equal(projection.adapterCandidateClaimCount, 1);
      assert.equal(projection.adapterAuthorityRevalidationCallCount, 1);
      assert.equal(projection.adapterSubmitCallCount, 1);
      assert.equal(projection.durableEffectOccurrenceCount, 4);
      assert.equal(projection.sourceOccurrenceCount, 3);
      assert.equal(projection.uniqueSourceObjectCount, 2);
      assert.equal(projection.repeatedSourceOccurrenceCount, 1);
      assert.equal(projection.deliveryReceiptObserved, true);
      assert.equal(projection.counterpartyResponseObserved, true);
      assert.equal(projection.providerRegistryCreated, false);
      assert.equal(projection.providerAcceptanceEstablished, false);
      assert.equal(projection.capacityReserved, false);
      assert.equal(projection.outcomeEstablished, false);
      assert.equal(projection.humanQueueCreated, false);
      const publicText = JSON.stringify(result);
      assert.equal(publicText.includes("private.seller.example"), false);
      assert.equal(publicText.includes("same external receipt bytes"), false);
      assert.deepEqual(adapter.calls,
        { claims: 1, authorizations: 1, submits: 1 });
    }
  });

test("exact receipt occurrences are privately claimable once and never deduplicated",
  async (t) => {
    const fixture = contractFixture("private-sources", "OFFICIAL_PROVIDER_API");
    const adapter = adapterFixture(fixture);
    const result = await driveTransactionSurfaceOneUseTenderRouteV1(
      adapter.capability, driveInput({
        secretEndpoint: "https://private.seller.example/submit",
      }, fixture, ledger(t, "private-sources")));
    const sources = claimTransactionSurfaceOneUseRouteSourcesV1(result);
    assert.equal(sources.sourceOccurrences.length, 3);
    assert.equal(sources.sourceOccurrences[1].bytes.toString("utf8"),
      "same external receipt bytes");
    assert.equal(sources.sourceOccurrences[2].bytes.toString("utf8"),
      "same external receipt bytes");
    assert.notStrictEqual(sources.sourceOccurrences[1].bytes,
      sources.sourceOccurrences[2].bytes);
    assert.throws(() => claimTransactionSurfaceOneUseRouteSourcesV1(result),
      /PRIVATE_RESULT_INVALID_OR_REPLAYED/u);
  });

test("revoked contact authority closes before the source-specific submit call",
  async (t) => {
    const fixture = contractFixture("revoked", "PERMISSIONED_MAILBOX");
    const adapter = adapterFixture(fixture, {
      async revalidateExact({ transactionBindingHash }) {
        adapter.calls.authorizations += 1;
        return { transactionBindingHash, decision: "REVOKED",
          evaluatedAt: "2099-01-01T00:00:02.000Z", validUntil: null,
          sourceOccurrences: [{
            sourceKind: "CONTACT_AUTHORITY_REVALIDATION",
            observedAt: "2099-01-01T00:00:02.000Z",
            bytes: Buffer.from("grant revoked", "utf8"),
          }] };
      },
    });
    const result = await driveTransactionSurfaceOneUseTenderRouteV1(
      adapter.capability, driveInput({
        secretEndpoint: "https://private.seller.example/submit",
      }, fixture, ledger(t, "revoked")));
    assert.equal(result.publicProjection.state, "REVOKED_BEFORE_EFFECT");
    assert.equal(result.publicProjection.adapterSubmitCallCount, 0);
    assert.equal(result.publicProjection.durableEffectOccurrenceCount, 2);
    assert.equal(adapter.calls.submits, 0);
  });

test("malformed or failed submit is terminal ambiguous after one durable attempt",
  async (t) => {
    const fixture = contractFixture("ambiguous", "OFFICIAL_PROVIDER_API");
    const adapter = adapterFixture(fixture, {
      async submitExact() {
        adapter.calls.submits += 1;
        throw new Error("raw provider secret must not escape");
      },
    });
    const result = await driveTransactionSurfaceOneUseTenderRouteV1(
      adapter.capability, driveInput({
        secretEndpoint: "https://private.seller.example/submit",
      }, fixture, ledger(t, "ambiguous")));
    assert.equal(result.publicProjection.state, "AMBIGUOUS_NO_RETRY_HOLD");
    assert.equal(result.publicProjection.adapterSubmitCallCount, 1);
    assert.equal(result.publicProjection.durableEffectOccurrenceCount, 4);
    assert.equal(result.publicProjection.transportFailureReceiptObserved, true);
    assert.equal(JSON.stringify(result).includes("provider secret"), false);
  });

test("the durable attempted occurrence exists before source-specific effect code runs",
  async (t) => {
    const fixture = contractFixture("attempt-before-effect",
      "OFFICIAL_PROVIDER_API");
    const ledgerInput = ledger(t, "attempt-before-effect");
    let headInsideEffect = null;
    const adapter = adapterFixture(fixture, {
      async submitExact(input) {
        adapter.calls.submits += 1;
        headInsideEffect = verifyDurableOneUseEndpointEffectLedgerV1({
          directory: ledgerInput.directory,
          ledgerId: ledgerInput.ledgerId,
          expectedLocalHeadHash: null,
        }).head;
        return { transactionBindingHash: input.transactionBindingHash,
          completedAt: "2099-01-01T00:00:05.000Z",
          attemptedEffectCount: 1,
          sourceOccurrences: [{ sourceKind: "DELIVERY_RECEIPT",
            observedAt: "2099-01-01T00:00:05.000Z",
            bytes: Buffer.from("real delivery receipt", "utf8") }] };
      },
    });
    const result = await driveTransactionSurfaceOneUseTenderRouteV1(
      adapter.capability, driveInput({
        secretEndpoint: "https://private.seller.example/submit",
      }, fixture, ledgerInput));
    assert.equal(headInsideEffect.exactOccurrenceCount, 3);
    assert.equal(headInsideEffect.transitionCounts.SUBMIT_ATTEMPTED, 1);
    assert.equal(headInsideEffect.transitionCounts.ENDPOINT_RECEIPT_OBSERVED, 0);
    assert.equal(result.publicProjection.durableEffectOccurrenceCount, 4);
  });

test("a discovery candidate is one-use and replay fails before another effect ledger exists",
  async (t) => {
    const fixture = contractFixture("one-use", "OFFICIAL_PROVIDER_API");
    const adapter = adapterFixture(fixture);
    const candidate = {
      secretEndpoint: "https://private.seller.example/submit",
    };
    await driveTransactionSurfaceOneUseTenderRouteV1(adapter.capability,
      driveInput(candidate, fixture, ledger(t, "one-use-first")));
    await assert.rejects(driveTransactionSurfaceOneUseTenderRouteV1(
      adapter.capability,
      driveInput(candidate, fixture, ledger(t, "one-use-second"))),
    /CANDIDATE_CLAIM_FAILED/u);
    assert.equal(adapter.calls.submits, 1);
  });

test("contract/profile pins and response capability are enforced at the seam",
  async (t) => {
    const fixture = contractFixture("no-response", "OFFICIAL_PROVIDER_API",
      false);
    const adapter = adapterFixture(fixture);
    await assert.rejects(driveTransactionSurfaceOneUseTenderRouteV1(
      adapter.capability, {
        ...driveInput({
          secretEndpoint: "https://private.seller.example/submit",
        }, fixture, ledger(t, "wrong-pin")),
        expectedContractHash: h("wrong-contract"),
      }), /ADAPTER_PIN_MISMATCH/u);

    const result = await driveTransactionSurfaceOneUseTenderRouteV1(
      adapter.capability, driveInput({
        secretEndpoint: "https://private.seller.example/submit",
      }, fixture, ledger(t, "no-response")));
    assert.equal(result.publicProjection.state, "AMBIGUOUS_NO_RETRY_HOLD");
    /* The unsupported occurrence is quarantined, not erased. */
    assert.equal(result.publicProjection.counterpartyResponseObserved, true);
    assert.equal(result.publicProjection.transportFailureReceiptObserved, true);
    assert.equal(result.publicProjection.adapterSubmitCallCount, 1);
  });

test("only factory-issued adapter capabilities can drive the runtime", async () => {
  await assert.rejects(driveTransactionSurfaceOneUseTenderRouteV1(
    Object.freeze({}), {}), /ADAPTER_NOT_FACTORY_ISSUED/u);
});
