import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_BOUNDARY,
  OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS,
  OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1,
  createTransactionSurfaceAdapterContractSourcePinV1,
  createTransactionSurfaceAdapterContractV1,
  verifyTransactionSurfaceAdapterContractV1,
} from "../src/outsider-transaction-surface-adapter-contract-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function mutable(value) {
  if (Array.isArray(value)) return value.map(mutable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, item]) => [key, mutable(item)]));
  }
  return value;
}

function transportProfile(label, transportFamily) {
  return {
    transportProfileRefHash: h(`transport-ref:${label}`),
    transportFamily,
    profileVersion: "1.0.0",
    requestSchemaHash: h(`request-schema:${label}`),
    responseSchemaHash: h(`response-schema:${label}`),
    lifecycleSchemaHash: h(`lifecycle-schema:${label}`),
    strictFiniteResponseGrammarRequired: true,
    naturalLanguageResponseAccepted: false,
    serverAcknowledgementIsAcceptance: false,
    deliveryReceiptIsAcceptance: false,
    arbitraryUrlExecutionPermitted: false,
    genericBrowserDriverPermitted: false,
  };
}

function capability(capabilityCode, supported, references, maximum) {
  return {
    capability: capabilityCode,
    supported,
    transportProfileRefHashes: references,
    maximumSideEffectsPerTender: maximum,
  };
}

function source(overrides = {}) {
  const mailbox = transportProfile("mailbox", "PERMISSIONED_MAILBOX");
  const api = transportProfile("provider-api", "OFFICIAL_PROVIDER_API");
  const mailboxRef = mailbox.transportProfileRefHash;
  const apiRef = api.transportProfileRefHash;
  return {
    observedAt: "2026-09-03T02:00:00.000Z",
    privateAdapterInstanceRefHash: h("private-adapter-instance"),
    privateProjectionNonce: h("private-projection-nonce"),
    adapterClosure: {
      adapterImplementationHash: h("adapter-implementation"),
      adapterPackageProfileHash: h("adapter-package-profile"),
    },
    supportedTransportProfiles: [mailbox, api],
    inputContracts: {
      permission: {
        inputSchemaHash: h("permission-input-schema"),
        replayVerifierImplementationHash: h("permission-replay-verifier"),
        lifecycleHeadSchemaHash: h("permission-lifecycle-head-schema"),
        appendOnlyLifecycleRequired: true,
        currentGrantRequiredAtEachEffect: true,
        revocationFailClosed: true,
        callerDeclarationAloneSufficient: false,
      },
      credentialLease: {
        inputSchemaHash: h("credential-lease-input-schema"),
        replayVerifierImplementationHash: h("credential-replay-verifier"),
        leaseReceiptSchemaHash: h("credential-lease-receipt-schema"),
        finiteExpiryRequired: true,
        exactScopeRequired: true,
        revalidationAtEachCredentialedEffect: true,
        rawCredentialMaterialProjected: false,
        callerDeclarationAloneSufficient: false,
      },
      rights: {
        inputSchemaHash: h("rights-input-schema"),
        replayVerifierImplementationHash: h("rights-replay-verifier"),
        reviewReceiptSchemaHash: h("rights-review-receipt-schema"),
        sourceRevisionPinRequired: true,
        purposeAndJurisdictionBound: true,
        revocationReplayRequired: true,
        callerDeclarationAloneSufficient: false,
      },
      privacy: {
        inputSchemaHash: h("privacy-input-schema"),
        replayVerifierImplementationHash: h("privacy-replay-verifier"),
        reviewReceiptSchemaHash: h("privacy-review-receipt-schema"),
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
      capability("PERMISSION_REVOCATION", true, [apiRef, mailboxRef], 1),
      capability("RESERVATION_CANCELLATION", true, [apiRef], 1),
      capability("CAPACITY_RESERVATION_REQUEST", true, [apiRef], 1),
      capability("STRICT_RESPONSE_OBSERVATION", true, [mailboxRef], 0),
      capability("ONE_USE_TENDER_DELIVERY", true, [mailboxRef], 1),
      capability("STRICT_QUOTE_OBSERVATION", false, [], 0),
      capability("STRUCTURED_QUOTE_REQUEST", false, [], 0),
      capability("PERMITTED_ROUTE_DISCOVERY", true, [apiRef, mailboxRef], 0),
    ],
    maximumAggregateSideEffectsPerTender: 4,
    ...overrides,
  };
}

function verifiedFixture() {
  const raw = source();
  const pin = createTransactionSurfaceAdapterContractSourcePinV1(raw);
  const record = createTransactionSurfaceAdapterContractV1(raw);
  return { raw, pin, record };
}

test("source-specific adapter contract is canonical, immutable, and fixed HOLD", () => {
  const raw = source();
  const record = createTransactionSurfaceAdapterContractV1(raw);
  const before = canonicalizeStrict(record);

  raw.adapterClosure.adapterImplementationHash = h("mutated-implementation");
  raw.supportedTransportProfiles[0].profileVersion = "9.9.9";

  assert.equal(canonicalizeStrict(record), before);
  assert.equal(record.schema,
    OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS.contract);
  assert.equal(record.adapterClosure.adapterImplementationHash,
    h("adapter-implementation"));
  assert.equal(record.adapterClosure.adapterPackageProfileHash,
    h("adapter-package-profile"));
  assert.deepEqual(record.capabilityDeclarations.map((item) => item.capability),
    OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1);
  assert.equal(record.sideEffectCardinality
    .maximumAggregateSideEffectsPerTender, 4);
  assert.equal(record.sideEffectCardinality
    .maximumRouteDiscoverySideEffectsPerTender, 0);
  assert.equal(record.sideEffectCardinality
    .maximumResponseObservationSideEffectsPerTender, 0);
  assert.equal(record.sideEffectCardinality
    .maximumTenderDeliverySideEffectsPerTender, 1);
  assert.equal(record.sideEffectCardinality
    .contractArtifactPerformedSideEffectCount, 0);
  assert.equal(record.structuralConformanceVerified, true);
  assert.equal(record.permissionEstablished, false);
  assert.equal(record.resourceOwnerAuthorityEstablished, false);
  assert.equal(record.contactabilityEstablished, false);
  assert.equal(record.externalCapacityEstablished, false);
  assert.equal(record.zeroInternalOpsEstablished, false);
  assert.equal(record.networkIoPerformed, false);
  assert.equal(record.providerContactPerformed, false);
  assert.equal(record.priceEstablished, false);
  assert.equal(record.guaranteeEstablished, false);
  assert.equal(record.settlementPermitted, false);
  assert.equal(record.authority, "NONE");
  assert.equal(record.decisionState, "HOLD");
  assert.equal(record.decision, "HOLD");
  assert.equal(record.actionReady, false);
  assert.equal(record.executable, false);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.capabilityDeclarations));
  assert.ok(Object.isFrozen(record.inputContracts.permission));
  assert.match(record.transportProfileSetHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(record.capabilitySetHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(record.contractHash, /^sha256:[a-f0-9]{64}$/u);
});

test("exact private source and output are replayed without projecting identifiers", () => {
  const { raw, pin, record } = verifiedFixture();
  const verification = verifyTransactionSurfaceAdapterContractV1(record, {
    source: raw,
    expectedSourceHash: pin.sourceHash,
    expectedContractHash: record.contractHash,
  });
  const publicBytes = canonicalizeStrict(record);
  const verificationBytes = canonicalizeStrict(verification);

  assert.equal(verification.ok, true);
  assert.equal(verification.exactPrivateSourceHashVerified, true);
  assert.equal(verification.sourceRebuildVerified, true);
  assert.equal(verification.exactContractHashVerified, true);
  assert.equal(verification.privateAdapterInstanceIdentifierProjected, false);
  assert.equal(verification.structuralConformanceMintsRights, false);
  assert.equal(verification.resourceOwnerAuthorityEstablished, false);
  assert.equal(verification.liveIoPerformed, false);
  assert.equal(verification.actionAuthorized, false);
  assert.equal(verification.decisionState, "HOLD");
  assert.equal(verification.decision, "HOLD");
  assert.equal(publicBytes.includes(raw.privateAdapterInstanceRefHash), false);
  assert.equal(publicBytes.includes(raw.privateProjectionNonce), false);
  assert.equal(publicBytes.includes(pin.sourceHash), false);
  assert.equal(verificationBytes.includes(raw.privateAdapterInstanceRefHash),
    false);
  assert.equal(verificationBytes.includes(raw.privateProjectionNonce), false);
  assert.equal(verificationBytes.includes(pin.sourceHash), false);
  assert.ok(Object.isFrozen(verification));
  assert.match(verification.verificationHash, /^sha256:[a-f0-9]{64}$/u);
});

test("source splicing, wrong pins, and resealed output fail closed", () => {
  const { raw, pin, record } = verifiedFixture();
  const spliced = mutable(raw);
  spliced.adapterClosure.adapterPackageProfileHash = h("spliced-package");
  assert.throws(() => verifyTransactionSurfaceAdapterContractV1(record, {
    source: spliced,
    expectedSourceHash: pin.sourceHash,
    expectedContractHash: record.contractHash,
  }), /EXPECTED_SOURCE_HASH_MISMATCH/u);

  assert.throws(() => verifyTransactionSurfaceAdapterContractV1(record, {
    source: raw,
    expectedSourceHash: h("wrong-source-pin"),
    expectedContractHash: record.contractHash,
  }), /EXPECTED_SOURCE_HASH_MISMATCH/u);

  assert.throws(() => verifyTransactionSurfaceAdapterContractV1(record, {
    source: raw,
    expectedSourceHash: pin.sourceHash,
    expectedContractHash: h("wrong-contract-pin"),
  }), /EXPECTED_CONTRACT_HASH_MISMATCH/u);

  const resealed = mutable(record);
  resealed.contactabilityEstablished = true;
  assert.throws(() => verifyTransactionSurfaceAdapterContractV1(resealed, {
    source: raw,
    expectedSourceHash: pin.sourceHash,
    expectedContractHash: record.contractHash,
  }), /RECORD_SOURCE_REBUILD_MISMATCH/u);
});

test("transport profiles cannot become arbitrary URL or browser drivers", () => {
  for (const [field, value, error] of [
    ["transportFamily", "GENERIC_URL", /TRANSPORT_FAMILY_INVALID/u],
    ["arbitraryUrlExecutionPermitted", true,
      /ARBITRARY_URL_EXECUTION_FORBIDDEN/u],
    ["genericBrowserDriverPermitted", true,
      /GENERIC_BROWSER_DRIVER_FORBIDDEN/u],
    ["naturalLanguageResponseAccepted", true,
      /NATURAL_LANGUAGE_RESPONSE_FORBIDDEN/u],
    ["serverAcknowledgementIsAcceptance", true,
      /SERVER_ACK_ACCEPTANCE_FORBIDDEN/u],
    ["deliveryReceiptIsAcceptance", true,
      /DELIVERY_RECEIPT_ACCEPTANCE_FORBIDDEN/u],
    ["strictFiniteResponseGrammarRequired", false,
      /STRICT_FINITE_RESPONSE_GRAMMAR_REQUIRED/u],
  ]) {
    const raw = source();
    raw.supportedTransportProfiles[0][field] = value;
    assert.throws(() => createTransactionSurfaceAdapterContractV1(raw), error);
  }
});

test("permission, lease, rights, privacy, and one-use controls cannot weaken", () => {
  const mutations = [
    ["inputContracts.permission.callerDeclarationAloneSufficient", true,
      /PERMISSION_CALLER_DECLARATION_SUFFICIENT_FORBIDDEN/u],
    ["inputContracts.credentialLease.rawCredentialMaterialProjected", true,
      /RAW_MATERIAL_PROJECTION_FORBIDDEN/u],
    ["inputContracts.rights.sourceRevisionPinRequired", false,
      /RIGHTS_SOURCE_REVISION_PIN_REQUIRED/u],
    ["inputContracts.privacy.privateIdentifierProjectionAllowed", true,
      /PRIVATE_IDENTIFIER_PROJECTION_FORBIDDEN/u],
    ["oneUseControls.idempotencyObservedBeforeEffectRequired", false,
      /IDEMPOTENCY_OBSERVATION_BEFORE_EFFECT_REQUIRED/u],
    ["oneUseControls.nonceSingleConsumptionRequired", false,
      /NONCE_SINGLE_CONSUMPTION_REQUIRED/u],
    ["oneUseControls.lateResponseCannotFormCommitment", false,
      /LATE_RESPONSE_COMMITMENT_FORBIDDEN/u],
    ["oneUseControls.terminalStateCannotReopen", false,
      /TERMINAL_STATE_REOPEN_FORBIDDEN/u],
    ["oneUseControls.standingCapacityInferred", true,
      /STANDING_CAPACITY_INFERENCE_FORBIDDEN/u],
  ];
  for (const [path, value, error] of mutations) {
    const raw = source();
    const parts = path.split(".");
    let target = raw;
    for (let index = 0; index < parts.length - 1; index += 1) {
      target = target[parts[index]];
    }
    target[parts.at(-1)] = value;
    assert.throws(() => createTransactionSurfaceAdapterContractV1(raw), error);
  }
});

test("capability sets are complete, profile-bound, and cardinality-bounded", () => {
  const missing = source();
  missing.capabilityDeclarations.pop();
  assert.throws(() => createTransactionSurfaceAdapterContractV1(missing),
    /CAPABILITY_DECLARATIONS_INCOMPLETE/u);

  const duplicate = source();
  duplicate.capabilityDeclarations[0] = mutable(
    duplicate.capabilityDeclarations[1]);
  assert.throws(() => createTransactionSurfaceAdapterContractV1(duplicate),
    /CAPABILITY_DECLARATION_DUPLICATE|CAPABILITY_DECLARATIONS_INCOMPLETE/u);

  const unknownProfile = source();
  unknownProfile.capabilityDeclarations[0].transportProfileRefHashes = [
    h("unknown-profile"),
  ];
  assert.throws(() => createTransactionSurfaceAdapterContractV1(unknownProfile),
    /CAPABILITY_TRANSPORT_PROFILE_REF_UNKNOWN/u);

  const unsupportedWithProfile = source();
  unsupportedWithProfile.capabilityDeclarations[5]
    .transportProfileRefHashes = [h("transport-ref:mailbox")];
  assert.throws(
    () => createTransactionSurfaceAdapterContractV1(unsupportedWithProfile),
    /UNSUPPORTED_CAPABILITY_TRANSPORT_PROFILE_FORBIDDEN/u);

  const readEffect = source();
  readEffect.capabilityDeclarations[3].maximumSideEffectsPerTender = 1;
  assert.throws(() => createTransactionSurfaceAdapterContractV1(readEffect),
    /CAPABILITY_SIDE_EFFECT_CARDINALITY_INVALID/u);

  const aggregate = source({ maximumAggregateSideEffectsPerTender: 5 });
  assert.throws(() => createTransactionSurfaceAdapterContractV1(aggregate),
    /AGGREGATE_SIDE_EFFECT_CARDINALITY_MISMATCH/u);
});

test("hostile preflight rejects proxies, accessors, sparse arrays, and sharing", () => {
  let proxyTrapTouched = false;
  const proxy = new Proxy(source(), {
    ownKeys() {
      proxyTrapTouched = true;
      throw new Error("proxy trap must not run");
    },
  });
  assert.throws(() => createTransactionSurfaceAdapterContractV1(proxy),
    /SOURCE_PROXY_FORBIDDEN/u);
  assert.equal(proxyTrapTouched, false);

  let accessorInvoked = false;
  const accessor = source();
  Object.defineProperty(accessor.adapterClosure, "adapterImplementationHash", {
    enumerable: true,
    configurable: true,
    get() {
      accessorInvoked = true;
      return h("accessor");
    },
  });
  assert.throws(() => createTransactionSurfaceAdapterContractV1(accessor),
    /SOURCE_DATA_FIELDS_REQUIRED/u);
  assert.equal(accessorInvoked, false);

  const sparse = source();
  sparse.capabilityDeclarations[0].transportProfileRefHashes = new Array(1);
  assert.throws(() => createTransactionSurfaceAdapterContractV1(sparse),
    /SOURCE_DENSE_ARRAY_REQUIRED/u);

  const decorated = source();
  decorated.capabilityDeclarations.extra = "not-an-occurrence";
  assert.throws(() => createTransactionSurfaceAdapterContractV1(decorated),
    /SOURCE_DENSE_ARRAY_REQUIRED/u);

  const shared = source();
  shared.inputContracts.rights = shared.inputContracts.permission;
  assert.throws(() => createTransactionSurfaceAdapterContractV1(shared),
    /SOURCE_SHARED_OR_CYCLIC_OBJECT_FORBIDDEN/u);

  const hidden = source();
  Object.defineProperty(hidden.adapterClosure, "hidden", {
    value: h("hidden-field"), enumerable: false, configurable: true,
  });
  assert.throws(() => createTransactionSurfaceAdapterContractV1(hidden),
    /SOURCE_DATA_FIELDS_REQUIRED/u);
});

test("captured intrinsics survive post-import collection prototype poisoning", () => {
  const raw = source();
  const descriptors = [
    [Array.prototype, "map", Object.getOwnPropertyDescriptor(
      Array.prototype, "map")],
    [Set.prototype, "add", Object.getOwnPropertyDescriptor(Set.prototype,
      "add")],
    [Set.prototype, "has", Object.getOwnPropertyDescriptor(Set.prototype,
      "has")],
    [Map.prototype, "get", Object.getOwnPropertyDescriptor(Map.prototype,
      "get")],
    [Map.prototype, "has", Object.getOwnPropertyDescriptor(Map.prototype,
      "has")],
    [Map.prototype, "set", Object.getOwnPropertyDescriptor(Map.prototype,
      "set")],
  ];
  const poison = () => { throw new Error("poisoned collection intrinsic"); };
  try {
    for (const [prototype, name] of descriptors) {
      Object.defineProperty(prototype, name, {
        value: poison, writable: true, enumerable: false, configurable: true,
      });
    }
    const record = createTransactionSurfaceAdapterContractV1(raw);
    assert.equal(record.decisionState, "HOLD");
    assert.equal(record.decision, "HOLD");
    assert.equal(record.sideEffectCardinality
      .maximumAggregateSideEffectsPerTender, 4);
  } finally {
    for (const [prototype, name, descriptor] of descriptors) {
      Object.defineProperty(prototype, name, descriptor);
    }
  }
});

test("boundary states structural conformance is never real-world authority", () => {
  const boundary = OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_BOUNDARY;
  assert.equal(boundary.genericArbitraryUrlDriverPermitted, false);
  assert.equal(boundary.genericBrowserDriverPermitted, false);
  assert.equal(boundary.privateAdapterInstanceIdentifierProjected, false);
  assert.equal(boundary.structuralConformanceMintsRights, false);
  assert.equal(boundary.structuralConformanceMintsOwnerAuthority, false);
  assert.equal(boundary.structuralConformanceEstablishesMailboxOwnership, false);
  assert.equal(boundary.structuralConformanceEstablishesAccountOwnership, false);
  assert.equal(boundary.structuralConformanceEstablishesContactability, false);
  assert.equal(boundary.structuralConformanceEstablishesCapacity, false);
  assert.equal(boundary.structuralConformanceEstablishesZeroInternalOps, false);
  assert.equal(boundary.structuralConformanceEnablesAction, false);
  assert.equal(boundary.structuralConformanceEnablesPricing, false);
  assert.equal(boundary.structuralConformanceEnablesGuarantee, false);
  assert.equal(boundary.structuralConformanceEnablesSettlement, false);
  assert.equal(boundary.networkIoPerformed, false);
  assert.equal(boundary.enabledCapabilityCount, 0);
  assert.equal(boundary.provenAuthorityCount, 0);
  assert.equal(boundary.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(boundary.consequenceReach, "NONE");
  assert.equal(boundary.authority, "NONE");
  assert.equal(boundary.decisionState, "HOLD");
  assert.equal(boundary.decision, "HOLD");
  assert.ok(Object.isFrozen(boundary));
});
