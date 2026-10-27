import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
} from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1,
  createTransactionSurfaceAdapterContractSourcePinV1,
  createTransactionSurfaceAdapterContractV1,
} from "../src/outsider-transaction-surface-adapter-contract-v1.js";
import {
  OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS,
  createPermissionedTransactionInterfaceSourceReplayV1,
  permissionedTransactionInterfaceSourceSigningMessageV1,
  verifyPermissionedTransactionInterfaceSourceReplayV1,
} from "../src/outsider-permissioned-transaction-interface-source-replay-v1.js";
import {
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_BOUNDARY,
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY,
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1,
  appendUserHeldMailboxShadowSpoolV1,
  createUserHeldMailboxShadowCapabilityV1,
  readUserHeldMailboxShadowSpoolV1,
} from "../src/outsider-user-held-mailbox-shadow-driver-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256").update(label)
  .digest("hex")}`;
const sha = (bytes) => `sha256:${createHash("sha256").update(bytes)
  .digest("hex")}`;
const digest = (domain, value) => sha(Buffer.from(
  `${domain}\0${canonicalizeStrict(value)}`, "utf8"));

function mutable(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(mutable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, item]) => [key, mutable(item)]));
  }
  return value;
}

function contractCapability(capability) {
  const supported = capability === "PERMITTED_ROUTE_DISCOVERY"
    || capability === "ONE_USE_TENDER_DELIVERY"
    || capability === "STRICT_RESPONSE_OBSERVATION";
  return {
    capability,
    supported,
    transportProfileRefHashes: supported
      ? [OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1
        .transportProfileRefHash] : [],
    maximumSideEffectsPerTender:
      capability === "ONE_USE_TENDER_DELIVERY" ? 1 : 0,
  };
}

function adapterContractSource(transactionSource, label) {
  return {
    observedAt: transactionSource.observedAt,
    privateAdapterInstanceRefHash: h(`${label}:private-adapter-instance`),
    privateProjectionNonce: h(`${label}:adapter-private-projection`),
    adapterClosure: {
      adapterImplementationHash:
        transactionSource.adapterContext.adapterArtifactHash,
      adapterPackageProfileHash:
        transactionSource.adapterContext.adapterRevisionHash,
    },
    supportedTransportProfiles: [mutable(
      OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1)],
    inputContracts: {
      permission: {
        inputSchemaHash: h(`${label}:permission-input`),
        replayVerifierImplementationHash: h(`${label}:permission-verifier`),
        lifecycleHeadSchemaHash: h(`${label}:permission-head`),
        appendOnlyLifecycleRequired: true,
        currentGrantRequiredAtEachEffect: true,
        revocationFailClosed: true,
        callerDeclarationAloneSufficient: false,
      },
      credentialLease: {
        inputSchemaHash: h(`${label}:credential-input`),
        replayVerifierImplementationHash: h(`${label}:credential-verifier`),
        leaseReceiptSchemaHash: h(`${label}:credential-receipt`),
        finiteExpiryRequired: true,
        exactScopeRequired: true,
        revalidationAtEachCredentialedEffect: true,
        rawCredentialMaterialProjected: false,
        callerDeclarationAloneSufficient: false,
      },
      rights: {
        inputSchemaHash: h(`${label}:rights-input`),
        replayVerifierImplementationHash: h(`${label}:rights-verifier`),
        reviewReceiptSchemaHash: h(`${label}:rights-receipt`),
        sourceRevisionPinRequired: true,
        purposeAndJurisdictionBound: true,
        revocationReplayRequired: true,
        callerDeclarationAloneSufficient: false,
      },
      privacy: {
        inputSchemaHash: h(`${label}:privacy-input`),
        replayVerifierImplementationHash: h(`${label}:privacy-verifier`),
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
    capabilityDeclarations:
      OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1.map(contractCapability),
    maximumAggregateSideEffectsPerTender: 1,
  };
}

function parseEnvelope(bytes) {
  return JSON.parse(bytes.toString("utf8"));
}

function signedMailbox(kind, payload, key) {
  const valueBase64 = cryptoSign(null,
    permissionedTransactionInterfaceSourceSigningMessageV1(kind, payload),
    key.privateKey).toString("base64");
  return Buffer.from(canonicalizeStrict({
    payload,
    signature: { algorithm: "ED25519", keyId: key.keyId, valueBase64 },
  }), "utf8");
}

function permissionObjectIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-permission-object/v1", {
      adapterContextHash: payload.adapterContextHash,
      permissionIdHash: payload.permissionIdHash,
      bindingHash: payload.binding.bindingHash,
      privateScope: payload.privateScope,
      challengeCommitmentHash: payload.challengeCommitmentHash,
      responseChoiceSetHash: payload.responseChoiceSetHash,
      outboundTemplateCommitmentHash: payload.outboundTemplateCommitmentHash,
      sendIdempotencyKeyHash: payload.sendIdempotencyKeyHash,
      maxSendCount: payload.maxSendCount,
      allowedOperations: payload.allowedOperations,
    });
}

function permissionOccurrenceIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-permission-occurrence/v1", {
      permissionIdHash: payload.permissionIdHash,
      ordinal: payload.ordinal,
      previousEventSourceHash: payload.previousEventSourceHash,
      eventState: payload.eventState,
      reasonCode: payload.reasonCode,
      occurredAt: payload.occurredAt,
      validUntil: payload.validUntil,
      permissionOccurrenceNonceHash: payload.permissionOccurrenceNonceHash,
      objectIdentityHash: payload.objectIdentityHash,
    });
}

function setRoot(domain, hashes) {
  return digest(domain, { count: hashes.length, hashes: [...hashes].sort() });
}

function addPermissionRevocation(slot, label) {
  const source = mutable(slot.mailbox.source);
  const grant = parseEnvelope(source.permissionLifecycleEventSourceBytes[0]).payload;
  const terminal = {
    ...mutable(grant),
    ordinal: 2,
    previousEventSourceHash:
      source.expectedPermissionLifecycleEventSourceHashes[0],
    eventState: "REVOKED",
    reasonCode: "USER_SOURCE_DECLARED_REVOCATION",
    occurredAt: "2026-09-02T13:00:00.000Z",
    permissionOccurrenceNonceHash: h(`${label}:permission-revocation-nonce`),
  };
  terminal.objectIdentityHash = permissionObjectIdentity(terminal);
  terminal.occurrenceIdentityHash = permissionOccurrenceIdentity(terminal);
  const terminalBytes = signedMailbox("PERMISSION_EVENT", terminal,
    slot.mailbox.mailboxKey);
  source.permissionLifecycleEventSourceBytes.push(terminalBytes);
  source.expectedPermissionLifecycleEventSourceHashes.push(sha(terminalBytes));
  source.expectedPermissionLifecycleEventCount = 2;

  const priorHead = parseEnvelope(source.permissionLifecycleHeadSourceBytes).payload;
  const permissionHeadPayload = {
    ...mutable(priorHead),
    eventCount: 2,
    coveredToOrdinal: 2,
    headEventSourceHash: sha(terminalBytes),
    currentState: "REVOKED",
    currentOccurredAt: terminal.occurredAt,
    eventSetRootHash: setRoot(
      "outsider/permissioned-transaction-interface-permission-event-set/v1",
      source.expectedPermissionLifecycleEventSourceHashes),
  };
  const headBytes = signedMailbox("PERMISSION_HEAD", permissionHeadPayload,
    slot.mailbox.mailboxKey);
  source.permissionLifecycleHeadSourceBytes = headBytes;
  source.expectedPermissionLifecycleHeadSourceHash = sha(headBytes);
  return source;
}

function fixture(label, options = {}) {
  const network = createTemporaryNetworkV2MultiSlotFixture({
    fixtureLabel: label,
    observedAt: options.observedAt,
  });
  const slot = network.slots[0];
  const transactionSource = options.revoked
    ? addPermissionRevocation(slot, label) : mutable(slot.mailbox.source);
  const transactionRecord
    = createPermissionedTransactionInterfaceSourceReplayV1(transactionSource);
  const contractSource = adapterContractSource(transactionSource, label);
  const contractPin = createTransactionSurfaceAdapterContractSourcePinV1(
    contractSource);
  const contractRecord = createTransactionSurfaceAdapterContractV1(
    contractSource);
  const outbound = parseEnvelope(
    transactionSource.outboundMessageSourceBytes).payload;
  const request = mutable({
    adapterContractReplay: {
      record: contractRecord,
      source: contractSource,
      expectedSourceHash: contractPin.sourceHash,
      expectedContractHash: contractRecord.contractHash,
    },
    permissionedTransactionReplay: {
      source: transactionSource,
      expectedReplayHash: transactionRecord.replayHash,
    },
    invocation: {
      invokedAt: transactionSource.observedAt,
      formationDeadline: transactionSource.tender.formationDeadline,
      oneUseNonceHash: outbound.transportOccurrenceNonceHash,
      idempotencyKeyHash: outbound.idempotencyKeyHash,
    },
    privateProjectionNonce: h(`${label}:driver-private-projection`).slice(7),
  });
  return { network, slot, transactionRecord, contractRecord, request };
}

test("module-issued capability appends one exact replayable shadow lifecycle", () => {
  const f = fixture("shadow-happy");
  const capability = createUserHeldMailboxShadowCapabilityV1();
  const receipt = appendUserHeldMailboxShadowSpoolV1(capability, f.request);

  assert.equal(capability.mode, "SHADOW_ONLY");
  assert.equal(capability.allowedUse, "TEST_OR_RESEARCH");
  assert.equal(Object.isFrozen(capability), true);
  assert.equal(receipt.mode, "SHADOW_ONLY");
  assert.equal(receipt.allowedUse, "TEST_OR_RESEARCH");
  assert.equal(receipt.shadowSpoolAppendOccurrenceCount, 1);
  assert.equal(receipt.transportOccurrenceCount,
    f.transactionRecord.transportOccurrenceCount);
  assert.equal(receipt.rawSourceBytesPubliclyProjected, false);
  assert.match(receipt.saltedPrivateBindingCommitmentHash,
    /^sha256:[a-f0-9]{64}$/u);
  assert.equal(receipt.realMailboxAuthorityEstablished, false);
  assert.equal(receipt.realSendAuthorized, false);
  assert.equal(receipt.realTenderDelivered, false);
  assert.equal(receipt.providerContactPerformed, false);
  assert.equal(receipt.networkIoPerformed, false);
  assert.equal(receipt.filesystemIoPerformed, false);
  assert.equal(receipt.externalCapacityEstablished, false);
  assert.equal(receipt.capacityReserved, false);
  assert.equal(receipt.priceEstablished, false);
  assert.equal(receipt.guaranteeEstablished, false);
  assert.equal(receipt.settlementPermitted, false);
  assert.equal(receipt.outsiderStaffTouchCount, null);
  assert.equal(receipt.staffTouchDenominatorComplete, false);
  assert.equal(receipt.zeroInternalOpsEstablished, false);
  assert.equal(receipt.internalHumanFallbackPermitted, false);
  assert.equal(receipt.moduleInstanceLocalNonceConsumed, true);
  assert.equal(receipt.moduleInstanceLocalIdempotencyObservedBeforeAppend, true);
  assert.equal(receipt.processWideNonceFreshnessEstablished, false);
  assert.equal(receipt.processWideIdempotencyEstablished, false);
  assert.deepEqual(receipt.enabledCapabilities,
    [OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY]);
  assert.deepEqual(receipt.provenAuthorityCapabilities,
    [OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY]);
  assert.deepEqual(receipt.enabledCapabilities,
    receipt.provenAuthorityCapabilities);
  assert.equal(receipt.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(receipt.decisionState, "HOLD");
  assert.equal(receipt.actionReady, false);
  assert.equal(receipt.executable, false);
  assert.deepEqual(receipt.boundary,
    OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_BOUNDARY);
  assert.equal(receipt.boundary.outsiderStaffTouchCount, null);
  assert.equal(receipt.boundary.staffTouchDenominatorComplete, false);
  assert.equal(receipt.boundary.zeroInternalOpsEstablished, false);
  assert.equal(receipt.boundary.humanFallbackPermitted, false);
  assert.equal(receipt.boundary.moduleInstanceLocalNonceConsumptionTracked,
    true);
  assert.equal(receipt.boundary.moduleInstanceLocalIdempotencyTracked, true);
  assert.equal(receipt.boundary.processWideNonceFreshnessEstablished, false);
  assert.equal(receipt.boundary.processWideIdempotencyEstablished, false);
  assert.equal(receipt.boundary.completeDependencyRealmIntegrityEstablished,
    false);
  assert.equal(receipt.boundary.unguardedDependencyClosureDecision, "HOLD");

  const publicText = canonicalizeStrict(receipt);
  const outbound = parseEnvelope(
    f.request.permissionedTransactionReplay.source.outboundMessageSourceBytes)
    .payload;
  assert.equal(publicText.includes(outbound.challengeToken), false);
  assert.equal(publicText.includes(outbound.idempotencyKeyHash), false);
  assert.equal(publicText.includes(outbound.transportOccurrenceNonceHash), false);
  assert.equal(publicText.includes("canary-counterparty-mailbox"), false);
  for (const privateHandle of [
    f.request.adapterContractReplay.expectedSourceHash,
    f.request.adapterContractReplay.expectedContractHash,
    f.request.permissionedTransactionReplay.expectedReplayHash,
    f.transactionRecord.privateSourceBundleCommitmentHash,
    f.transactionRecord.routeObjectHash,
    f.transactionRecord.currentCandidateHash,
  ]) assert.equal(publicText.includes(privateHandle), false);

  const privateReadback = readUserHeldMailboxShadowSpoolV1(capability);
  assert.equal(privateReadback.transportOccurrenceSourceBytes.length,
    receipt.transportOccurrenceCount);
  assert.notStrictEqual(privateReadback.permissionedTransactionReplay.source
    .outboundMessageSourceBytes,
  f.request.permissionedTransactionReplay.source.outboundMessageSourceBytes);
  const checked = verifyPermissionedTransactionInterfaceSourceReplayV1(
    privateReadback.permissionedTransactionReplay.source,
    privateReadback.permissionedTransactionReplay.expectedReplayHash);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.replayHash, f.transactionRecord.replayHash);
  assert.equal(privateReadback.exactPrivateBindings.adapterContractHash,
    f.request.adapterContractReplay.expectedContractHash);
  assert.equal(privateReadback.exactPrivateBindings.routeObjectHash,
    f.transactionRecord.routeObjectHash);
  assert.equal(privateReadback.exactPrivateBindings.currentCandidateHash,
    f.transactionRecord.currentCandidateHash);
});

test("capability is identity-issued and cannot be serialized, copied, or proxied", () => {
  const f = fixture("shadow-capability");
  const capability = createUserHeldMailboxShadowCapabilityV1();
  const forged = Object.freeze({ ...capability });
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(forged, f.request),
    /MODULE_ISSUED_SHADOW_CAPABILITY_REQUIRED/u);
  const serialized = JSON.parse(JSON.stringify(capability));
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(serialized, f.request),
    /MODULE_ISSUED_SHADOW_CAPABILITY_REQUIRED/u);
  let trapCount = 0;
  const proxy = new Proxy(capability, {
    get() { trapCount += 1; throw new Error("must not touch proxy"); },
    ownKeys() { trapCount += 1; throw new Error("must not touch proxy"); },
  });
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(proxy, f.request),
    /MODULE_ISSUED_SHADOW_CAPABILITY_REQUIRED/u);
  assert.equal(trapCount, 0);
  assert.throws(() => readUserHeldMailboxShadowSpoolV1(forged),
    /MODULE_ISSUED_SHADOW_CAPABILITY_REQUIRED/u);
});

test("exact duplicate is idempotent and a capability appends at most once", () => {
  const f = fixture("shadow-idempotent");
  const capability = createUserHeldMailboxShadowCapabilityV1();
  const first = appendUserHeldMailboxShadowSpoolV1(capability, f.request);
  const second = appendUserHeldMailboxShadowSpoolV1(capability, mutable(f.request));
  assert.strictEqual(second, first);
  assert.equal(readUserHeldMailboxShadowSpoolV1(capability)
    .transportOccurrenceSourceBytes.length, first.transportOccurrenceCount);

  const different = mutable(f.request);
  different.privateProjectionNonce = h("shadow-idempotent:different").slice(7);
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(capability, different),
    /CAPABILITY_ALREADY_CONSUMED/u);
});

test("cross-capability reuse cannot race one-use nonce or idempotency", () => {
  const f = fixture("shadow-cross-capability");
  const first = createUserHeldMailboxShadowCapabilityV1();
  const second = createUserHeldMailboxShadowCapabilityV1();
  appendUserHeldMailboxShadowSpoolV1(first, f.request);
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(second,
    mutable(f.request)), /ONE_USE_NONCE_ALREADY_CONSUMED/u);
  assert.throws(() => readUserHeldMailboxShadowSpoolV1(second),
    /SHADOW_SPOOL_EMPTY/u);

  const tamperedNonce = mutable(f.request);
  tamperedNonce.invocation.oneUseNonceHash = h("shadow-cross-capability:nonce");
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), tamperedNonce),
  /ONE_USE_CONTROL_SPLICE/u);
  const tamperedKey = mutable(f.request);
  tamperedKey.invocation.idempotencyKeyHash = h("shadow-cross-capability:key");
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), tamperedKey),
  /ONE_USE_CONTROL_SPLICE/u);
});

test("separate module instances do not claim process-wide one-use controls",
  async () => {
    const f = fixture("shadow-module-instance-local");
    const moduleUrl = new URL(
      "../src/outsider-user-held-mailbox-shadow-driver-v1.js",
      import.meta.url).href;
    const firstDriver = await import(`${moduleUrl}?module-local=first`);
    const secondDriver = await import(`${moduleUrl}?module-local=second`);
    const first = firstDriver.appendUserHeldMailboxShadowSpoolV1(
      firstDriver.createUserHeldMailboxShadowCapabilityV1(), f.request);
    const second = secondDriver.appendUserHeldMailboxShadowSpoolV1(
      secondDriver.createUserHeldMailboxShadowCapabilityV1(), f.request);
    for (const receipt of [first, second]) {
      assert.equal(receipt.moduleInstanceLocalNonceConsumed, true);
      assert.equal(receipt.moduleInstanceLocalIdempotencyObservedBeforeAppend,
        true);
      assert.equal(receipt.processWideNonceFreshnessEstablished, false);
      assert.equal(receipt.processWideIdempotencyEstablished, false);
      assert.equal(receipt.durableOrExternalNonceFreshnessEstablished, false);
      assert.equal(receipt.durableOrExternalIdempotencyEstablished, false);
    }
  });

test("no observed staff event is not treated as a complete zero-ops proof", () => {
  const f = fixture("shadow-staff-denominator");
  const receipt = appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), f.request);
  assert.equal(receipt.outsiderStaffTouchCount, null);
  assert.equal(receipt.staffTouchDenominatorComplete, false);
  assert.equal(receipt.zeroInternalOpsEstablished, false);
  assert.equal(receipt.internalHumanFallbackPermitted, false);
  assert.equal(receipt.boundary.outsiderStaffTouchCount, null);
  assert.equal(receipt.boundary.staffTouchDenominatorComplete, false);
  assert.equal(receipt.boundary.zeroInternalOpsEstablished, false);
});

test("formation deadline is exact and fail-closed at the boundary", () => {
  const f = fixture("shadow-deadline", {
    observedAt: "2026-09-02T14:00:00.000Z",
  });
  assert.equal(f.request.invocation.invokedAt,
    f.request.invocation.formationDeadline);
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), f.request),
  /FORMATION_DEADLINE_REACHED/u);

  const splice = fixture("shadow-deadline-splice");
  splice.request.invocation.formationDeadline = "2026-09-02T14:01:00.000Z";
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), splice.request),
  /INVOCATION_TIME_OR_DEADLINE_SPLICE/u);
});

test("a replayed permission revocation cannot enter the shadow spool", () => {
  const f = fixture("shadow-revoked", { revoked: true });
  assert.equal(f.transactionRecord.ok, true);
  assert.equal(f.transactionRecord.sourceDeclaredPermissionCurrentAtObservedAt,
    false);
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), f.request),
  /PERMISSIONED_TRANSACTION_SOURCE_REPLAY_NOT_CURRENT_HOLD/u);
});

test("adapter profile, closure, and transaction source splices fail closed", () => {
  const profile = fixture("shadow-profile-splice");
  profile.request.adapterContractReplay.source.supportedTransportProfiles[0]
    .requestSchemaHash = h("wrong-shadow-request-schema");
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), profile.request),
  /EXPECTED_SOURCE_HASH_MISMATCH/u);

  const expansion = fixture("shadow-capability-expansion");
  const quoteObservation = expansion.request.adapterContractReplay.source
    .capabilityDeclarations.find((item) => (
      item.capability === "STRICT_QUOTE_OBSERVATION"));
  quoteObservation.supported = true;
  quoteObservation.transportProfileRefHashes = [
    OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1
      .transportProfileRefHash,
  ];
  const expandedRecord = createTransactionSurfaceAdapterContractV1(
    expansion.request.adapterContractReplay.source);
  const expandedPin = createTransactionSurfaceAdapterContractSourcePinV1(
    expansion.request.adapterContractReplay.source);
  expansion.request.adapterContractReplay.record = expandedRecord;
  expansion.request.adapterContractReplay.expectedContractHash =
    expandedRecord.contractHash;
  expansion.request.adapterContractReplay.expectedSourceHash =
    expandedPin.sourceHash;
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), expansion.request),
  /ADAPTER_CAPABILITY_SET_NOT_EXACT/u);

  const closure = fixture("shadow-closure-splice");
  closure.request.adapterContractReplay.source.adapterClosure
    .adapterImplementationHash = h("wrong-shadow-implementation");
  const rebuilt = createTransactionSurfaceAdapterContractV1(
    closure.request.adapterContractReplay.source);
  const repin = createTransactionSurfaceAdapterContractSourcePinV1(
    closure.request.adapterContractReplay.source);
  closure.request.adapterContractReplay.record = rebuilt;
  closure.request.adapterContractReplay.expectedContractHash =
    rebuilt.contractHash;
  closure.request.adapterContractReplay.expectedSourceHash = repin.sourceHash;
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), closure.request),
  /ADAPTER_CONTRACT_OR_PROFILE_SPLICE/u);

  const transaction = fixture("shadow-source-splice");
  transaction.request.permissionedTransactionReplay.source
    .outboundMessageSourceBytes[0] ^= 1;
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    createUserHeldMailboxShadowCapabilityV1(), transaction.request),
  /PERMISSIONED_TRANSACTION_SOURCE_REPLAY_NOT_CURRENT_HOLD/u);
});

test("hostile input is rejected before traps, replay, or append", () => {
  const f = fixture("shadow-hostile");
  const capability = createUserHeldMailboxShadowCapabilityV1();
  let trapCount = 0;
  const proxy = new Proxy(f.request, {
    get() { trapCount += 1; throw new Error("must not invoke get"); },
    ownKeys() { trapCount += 1; throw new Error("must not invoke ownKeys"); },
  });
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(capability, proxy),
    /PROXY_FORBIDDEN/u);
  assert.equal(trapCount, 0);

  let accessorCount = 0;
  const accessor = mutable(f.request);
  Object.defineProperty(accessor.invocation, "invokedAt", {
    enumerable: true,
    get() { accessorCount += 1; return f.request.invocation.invokedAt; },
  });
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(capability, accessor),
    /OBJECT_FIELD_FORBIDDEN/u);
  assert.equal(accessorCount, 0);

  const shared = mutable(f.request);
  shared.unexpectedAlias = shared.invocation;
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(capability, shared),
    /SHARED_OR_CYCLIC_INPUT_FORBIDDEN/u);

  const decorated = mutable(f.request);
  decorated.permissionedTransactionReplay.source.inboundMessageSourceBytes
    .extra = "not-an-occurrence";
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(capability, decorated),
    /ARRAY_BUDGET_OR_SHAPE_INVALID/u);
  if (typeof SharedArrayBuffer === "function") {
    const sharedMemory = mutable(f.request);
    const original = sharedMemory.permissionedTransactionReplay.source
      .outboundMessageSourceBytes;
    const backing = new SharedArrayBuffer(original.length);
    new Uint8Array(backing).set(original);
    sharedMemory.permissionedTransactionReplay.source
      .outboundMessageSourceBytes = Buffer.from(backing);
    assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
      capability, sharedMemory), /SHARED_MEMORY_BUFFER_FORBIDDEN/u);
  }
  assert.throws(() => readUserHeldMailboxShadowSpoolV1(capability),
    /SHADOW_SPOOL_EMPTY/u);
});

test("oversized bytes and arrays fail before descriptor expansion", () => {
  const capability = createUserHeldMailboxShadowCapabilityV1();
  const oversizedArray = new Array(150_001).fill(null);
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    capability, oversizedArray), /ARRAY_BUDGET_OR_SHAPE_INVALID/u);

  const f = fixture("shadow-oversized-buffer");
  const oversizedRequest = mutable(f.request);
  let accessorCount = 0;
  const oversizedBuffer = Buffer.alloc(1024 * 1024 + 1, 0x61);
  Object.defineProperty(oversizedBuffer, "canary", {
    configurable: true,
    enumerable: true,
    get() {
      accessorCount += 1;
      throw new Error("oversized buffer canary must not run");
    },
  });
  oversizedRequest.permissionedTransactionReplay.source
    .outboundMessageSourceBytes = oversizedBuffer;
  assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
    capability, oversizedRequest), /BUFFER_TOO_LARGE/u);
  assert.equal(accessorCount, 0);
  assert.throws(() => readUserHeldMailboxShadowSpoolV1(capability),
    /SHADOW_SPOOL_EMPTY/u);
});

test("post-import dependency intrinsic poisoning invokes no hostile callback",
  () => {
    const f = fixture("shadow-dependency-intrinsic-poison");
    const publicKey = createPublicKey({
      key: Buffer.from(`302a300506032b6570032100${"00".repeat(32)}`, "hex"),
      format: "der",
      type: "spki",
    });
    const publicKeyPrototype = Object.getPrototypeOf(publicKey);
    const cases = [
      [Array.prototype, Symbol.iterator, "ARRAY_ITERATOR"],
      [Array.prototype, "push", "ARRAY_PUSH"],
      [Array.prototype, "find", "ARRAY_FIND"],
      [Set.prototype, "add", "SET_ADD"],
      [Buffer, "from", "BUFFER_FROM"],
      [Buffer, "isBuffer", "BUFFER_IS_BUFFER"],
      [Buffer, "concat", "BUFFER_CONCAT"],
      [Object.getPrototypeOf(createHash("sha256")), "update", "HASH_UPDATE"],
      [Object.getPrototypeOf(createHash("sha256")), "digest", "HASH_DIGEST"],
      [publicKeyPrototype, "export", "PUBLIC_KEY_EXPORT"],
    ];
    let trapCount = 0;
    for (let index = 0; index < cases.length; index += 1) {
      const [owner, key, label] = cases[index];
      const capability = createUserHeldMailboxShadowCapabilityV1();
      const original = Object.getOwnPropertyDescriptor(owner, key);
      let caught = null;
      try {
        Object.defineProperty(owner, key, {
          configurable: original.configurable,
          enumerable: original.enumerable,
          get() {
            trapCount += 1;
            throw new Error("dependency intrinsic getter must not run");
          },
        });
        try { appendUserHeldMailboxShadowSpoolV1(capability, f.request); }
        catch (error) { caught = error; }
      } finally {
        Object.defineProperty(owner, key, original);
      }
      assert.match(caught?.message ?? "",
        new RegExp(`DEPENDENCY_INTRINSIC_CHANGED_${label}`, "u"));
      assert.throws(() => readUserHeldMailboxShadowSpoolV1(capability),
        /SHADOW_SPOOL_EMPTY/u);
    }
    assert.equal(trapCount, 0);
  });

test("private readback is copied and cannot mutate retained spool bytes", () => {
  const f = fixture("shadow-readback-copy");
  const capability = createUserHeldMailboxShadowCapabilityV1();
  appendUserHeldMailboxShadowSpoolV1(capability, f.request);
  const first = readUserHeldMailboxShadowSpoolV1(capability);
  const original = first.permissionedTransactionReplay.source
    .outboundMessageSourceBytes[0];
  first.permissionedTransactionReplay.source.outboundMessageSourceBytes[0] ^= 1;
  first.transportOccurrenceSourceBytes[1].sourceBytes[0] ^= 1;

  const second = readUserHeldMailboxShadowSpoolV1(capability);
  assert.equal(second.permissionedTransactionReplay.source
    .outboundMessageSourceBytes[0], original);
  assert.equal(second.transportOccurrenceSourceBytes[1].sourceBytes[0], original);
  const checked = verifyPermissionedTransactionInterfaceSourceReplayV1(
    second.permissionedTransactionReplay.source,
    second.permissionedTransactionReplay.expectedReplayHash);
  assert.equal(checked.ok, true, checked.error);
});

test("private replay hashes cannot escape directly or through receiptHash",
  async () => {
    const f = fixture("shadow-private-replay-correlation");
    const variant = mutable(f.request);
    variant.permissionedTransactionReplay.source.privateProjectionNonce
      = h("shadow-private-replay-correlation:alternate-source-nonce").slice(7);
    const variantReplay = createPermissionedTransactionInterfaceSourceReplayV1(
      variant.permissionedTransactionReplay.source);
    variant.permissionedTransactionReplay.expectedReplayHash
      = variantReplay.replayHash;
    variant.adapterContractReplay.source.privateProjectionNonce
      = h("shadow-private-replay-correlation:alternate-adapter-nonce");
    const variantContractPin
      = createTransactionSurfaceAdapterContractSourcePinV1(
        variant.adapterContractReplay.source);
    variant.adapterContractReplay.expectedSourceHash
      = variantContractPin.sourceHash;
    assert.notEqual(variantReplay.replayHash,
      f.request.permissionedTransactionReplay.expectedReplayHash);
    assert.notEqual(variantReplay.privateSourceBundleCommitmentHash,
      f.transactionRecord.privateSourceBundleCommitmentHash);

    const moduleUrl = new URL(
      "../src/outsider-user-held-mailbox-shadow-driver-v1.js",
      import.meta.url).href;
    const firstDriver = await import(`${moduleUrl}?privacy-realm=first`);
    const secondDriver = await import(`${moduleUrl}?privacy-realm=second`);
    const first = firstDriver.appendUserHeldMailboxShadowSpoolV1(
      firstDriver.createUserHeldMailboxShadowCapabilityV1(), f.request);
    const second = secondDriver.appendUserHeldMailboxShadowSpoolV1(
      secondDriver.createUserHeldMailboxShadowCapabilityV1(), variant);
    assert.notEqual(first.saltedPrivateBindingCommitmentHash,
      second.saltedPrivateBindingCommitmentHash);
    assert.notEqual(first.receiptHash, second.receiptHash);
    const firstSafe = mutable(first);
    const secondSafe = mutable(second);
    delete firstSafe.saltedPrivateBindingCommitmentHash;
    delete firstSafe.receiptHash;
    delete secondSafe.saltedPrivateBindingCommitmentHash;
    delete secondSafe.receiptHash;
    assert.deepEqual(firstSafe, secondSafe);
    const firstPublic = canonicalizeStrict(first);
    const secondPublic = canonicalizeStrict(second);
    for (const privateHandle of [
      f.request.adapterContractReplay.expectedSourceHash,
      variant.adapterContractReplay.expectedSourceHash,
      f.request.adapterContractReplay.expectedContractHash,
      f.request.permissionedTransactionReplay.expectedReplayHash,
      variantReplay.replayHash,
      f.transactionRecord.privateSourceBundleCommitmentHash,
      variantReplay.privateSourceBundleCommitmentHash,
      f.transactionRecord.routeObjectHash,
      f.transactionRecord.currentCandidateHash,
    ]) {
      assert.equal(firstPublic.includes(privateHandle), false);
      assert.equal(secondPublic.includes(privateHandle), false);
    }
    assert.equal(first.exactPrivateBindingValuesRetainedInPrivateSpoolOnly,
      true);
  });

test("there is no path, callback, credential, or domain-task input surface", () => {
  for (const [index, field] of ["path", "callback", "credential", "meeting",
    "professor"].entries()) {
    const f = fixture(`shadow-forbidden-field-${index}`);
    f.request[field] = field;
    assert.throws(() => appendUserHeldMailboxShadowSpoolV1(
      createUserHeldMailboxShadowCapabilityV1(), f.request),
    /REQUEST_FIELDS_INVALID/u);
  }
  assert.equal(OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_BOUNDARY
    .domainSpecificTaskFieldsAccepted, false);
  assert.equal(OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_BOUNDARY
    .callbackInterfacePresent, false);
  assert.equal(OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_BOUNDARY
    .ambientCredentialInterfacePresent, false);
  assert.equal(OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_BOUNDARY
    .pathInterfacePresent, false);
});
