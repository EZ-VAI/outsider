/*
 * Outcome Formation Engine: web-native mailto transaction-surface adapter v1.
 *
 * One Brave/federation-selected seller-origin probe remains an opaque,
 * one-claim candidate. This adapter privately resolves exactly one observed
 * mailto surface and binds it to one injected account-native mailbox closure.
 * It plugs into the generic transaction-surface one-use route runtime; no
 * provider registry, ambient credential, browser driver, payment, or human
 * outreach path is introduced here.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { claimSellerOriginReadOnlyProbePrivateV2 }
  from "./outsider-seller-origin-read-only-probe-v2.js";
import {
  OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1,
  createTransactionSurfaceAdapterContractSourcePinV1,
  createTransactionSurfaceAdapterContractV1,
} from "./outsider-transaction-surface-adapter-contract-v1.js";
import { createTransactionSurfaceOneUseRouteAdapterV1 }
  from "./outsider-transaction-surface-one-use-route-runtime-v1.js";

const PREFIX
  = "OUTSIDER_WEB_NATIVE_MAILTO_TRANSACTION_SURFACE_ROUTE_ADAPTER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ASCII_LOCAL_PART
  = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u;
const ASCII_DOMAIN_LABEL
  = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export const OUTSIDER_WEB_NATIVE_MAILTO_TRANSACTION_SURFACE_ROUTE_ADAPTER_V1_BOUNDARY
  = Object.freeze({
    position:
      "BRAVE_OR_FEDERATION_CANDIDATE_TO_ACCOUNT_NATIVE_MAILBOX_ONE_USE_ROUTE",
    providerRegistryCreated: false,
    sellerRegistrationRequired: false,
    sourceSpecificPrivateCandidateClaimRequired: true,
    sellerOriginProbeClaimsPerRoute: 1,
    supportedSurfaceKind: "MAILTO_LINK",
    supportedTransportFamily: "PERMISSIONED_MAILBOX",
    accountNativeMailboxClosureInjectedPerAdapter: true,
    ambientCredentialAccepted: false,
    rawCredentialAccepted: false,
    credentialProjected: false,
    maximumDeliveryClosureCallsPerTender: 1,
    genericBrowserDriverPresent: false,
    formPostPerformed: false,
    paymentPerformed: false,
    deliveryReceiptIsAcceptance: false,
    counterpartyResponseRequiresSeparateReplay: true,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function boundedSourceBytes(value, code) {
  if (!Buffer.isBuffer(value) || value.length < 1
    || value.length > MAX_SOURCE_BYTES) fail(code);
  return Buffer.from(value);
}

function nullableSourceBytes(value, code) {
  return value === null ? null : boundedSourceBytes(value, code);
}

function recipientFromMailto(target) {
  if (typeof target !== "string" || !/^mailto:/iu.test(target)
    || target.length > 16_384 || target.includes("#")) fail("MAILTO_INVALID");
  const separator = target.indexOf("?");
  const encoded = target.slice(7, separator < 0 ? undefined : separator);
  let recipient;
  try { recipient = decodeURIComponent(encoded); }
  catch { fail("MAILTO_RECIPIENT_ENCODING_INVALID"); }
  if (recipient.length < 3 || Buffer.byteLength(recipient, "utf8") > 254
    || /[^\x21-\x7e]/u.test(recipient) || /[,;]/u.test(recipient)) {
    fail("EXACTLY_ONE_MAILTO_RECIPIENT_REQUIRED");
  }
  const separatorIndex = recipient.lastIndexOf("@");
  if (separatorIndex < 1 || separatorIndex !== recipient.indexOf("@")) {
    fail("EXACTLY_ONE_MAILTO_RECIPIENT_REQUIRED");
  }
  const local = recipient.slice(0, separatorIndex);
  const domain = recipient.slice(separatorIndex + 1);
  const labels = domain.split(".");
  if (Buffer.byteLength(local, "ascii") > 64
    || !ASCII_LOCAL_PART.test(local) || labels.length < 2
    || domain.length > 253
    || labels.some((label) => !ASCII_DOMAIN_LABEL.test(label))) {
    fail("EXACTLY_ONE_CANONICAL_ADDR_SPEC_REQUIRED");
  }
  return `${local}@${domain.toLowerCase()}`;
}

function semanticHash(kind) {
  return digest(
    "outsider/web-native-mailto-route-adapter-semantic-artifact/v1", {
      module:
        "outsider-web-native-mailto-transaction-surface-route-adapter-v1",
      kind,
    });
}

function capabilityDeclaration(capability, profileRef) {
  const supported = ["PERMITTED_ROUTE_DISCOVERY", "ONE_USE_TENDER_DELIVERY",
    "STRICT_RESPONSE_OBSERVATION"].includes(capability);
  return {
    capability, supported,
    transportProfileRefHashes: supported ? [profileRef] : [],
    maximumSideEffectsPerTender:
      supported && capability === "ONE_USE_TENDER_DELIVERY" ? 1 : 0,
  };
}

function contractSource(input) {
  const profileRef = semanticHash("PERMISSIONED_MAILBOX_PROFILE");
  const source = {
    observedAt: input.contractObservedAt,
    privateAdapterInstanceRefHash: input.privateAdapterInstanceRefHash,
    privateProjectionNonce: input.privateProjectionNonce,
    adapterClosure: {
      adapterImplementationHash: semanticHash("ADAPTER_IMPLEMENTATION"),
      adapterPackageProfileHash: semanticHash("ADAPTER_PACKAGE_PROFILE"),
    },
    supportedTransportProfiles: [{
      transportProfileRefHash: profileRef,
      transportFamily: "PERMISSIONED_MAILBOX",
      profileVersion: "1.0.0",
      requestSchemaHash: semanticHash("MAILBOX_REQUEST_SCHEMA"),
      responseSchemaHash: semanticHash("MAILBOX_RESPONSE_SCHEMA"),
      lifecycleSchemaHash: semanticHash("MAILBOX_LIFECYCLE_SCHEMA"),
      strictFiniteResponseGrammarRequired: true,
      naturalLanguageResponseAccepted: false,
      serverAcknowledgementIsAcceptance: false,
      deliveryReceiptIsAcceptance: false,
      arbitraryUrlExecutionPermitted: false,
      genericBrowserDriverPermitted: false,
    }],
    inputContracts: {
      permission: {
        inputSchemaHash: semanticHash("PERMISSION_INPUT_SCHEMA"),
        replayVerifierImplementationHash:
          semanticHash("PERMISSION_REPLAY_IMPLEMENTATION"),
        lifecycleHeadSchemaHash: semanticHash("PERMISSION_LIFECYCLE_SCHEMA"),
        appendOnlyLifecycleRequired: true,
        currentGrantRequiredAtEachEffect: true,
        revocationFailClosed: true,
        callerDeclarationAloneSufficient: false,
      },
      credentialLease: {
        inputSchemaHash: semanticHash("CREDENTIAL_LEASE_INPUT_SCHEMA"),
        replayVerifierImplementationHash:
          semanticHash("CREDENTIAL_LEASE_REPLAY_IMPLEMENTATION"),
        leaseReceiptSchemaHash: semanticHash("CREDENTIAL_LEASE_RECEIPT_SCHEMA"),
        finiteExpiryRequired: true,
        exactScopeRequired: true,
        revalidationAtEachCredentialedEffect: true,
        rawCredentialMaterialProjected: false,
        callerDeclarationAloneSufficient: false,
      },
      rights: {
        inputSchemaHash: semanticHash("RIGHTS_INPUT_SCHEMA"),
        replayVerifierImplementationHash:
          semanticHash("RIGHTS_REPLAY_IMPLEMENTATION"),
        reviewReceiptSchemaHash: semanticHash("RIGHTS_REVIEW_RECEIPT_SCHEMA"),
        sourceRevisionPinRequired: true,
        purposeAndJurisdictionBound: true,
        revocationReplayRequired: true,
        callerDeclarationAloneSufficient: false,
      },
      privacy: {
        inputSchemaHash: semanticHash("PRIVACY_INPUT_SCHEMA"),
        replayVerifierImplementationHash:
          semanticHash("PRIVACY_REPLAY_IMPLEMENTATION"),
        reviewReceiptSchemaHash: semanticHash("PRIVACY_REVIEW_RECEIPT_SCHEMA"),
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
      OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1.map((capability) =>
        capabilityDeclaration(capability, profileRef)),
    maximumAggregateSideEffectsPerTender: 1,
  };
  return { source, profileRef };
}

function publicMailtoSurface(candidateLease, candidateRefHash) {
  const projection = candidateLease?.publicProjection;
  const web = projection?.webNativeFallback?.projection;
  if (candidateLease?.schema
      !== "outsider/seller-origin-read-only-private-lease/v2"
    || projection?.schema !== "outsider/seller-origin-read-only-probe/v2"
    || projection.selectedSurfaceFamily !== "WEB_NATIVE_OBSERVATION"
    || web?.schema
      !== "outsider/web-native-transaction-surface-privacy-closed-summary/v1"
    || !Array.isArray(web.surfaceOccurrences)) {
    fail("SELLER_PROBE_CANDIDATE_INVALID");
  }
  const matches = web.surfaceOccurrences.filter((surface) =>
    surface?.surfaceRefHash === candidateRefHash);
  if (matches.length !== 1 || matches[0].surfaceKind !== "MAILTO_LINK"
    || matches[0].targetKind !== "MAILTO_URI"
    || matches[0].methodCode !== "MAIL_COMPOSE") {
    fail("EXACT_MAILTO_SURFACE_NOT_FOUND");
  }
  return matches[0];
}

function claimMailtoCandidate(candidateLease, binding) {
  publicMailtoSurface(candidateLease, binding.candidateRefHash);
  const claimed = claimSellerOriginReadOnlyProbePrivateV2(candidateLease);
  if (claimed.selectedSurfaceFamily !== "WEB_NATIVE_OBSERVATION"
    || !Array.isArray(claimed.observations)) {
    fail("PRIVATE_SELLER_PROBE_CLAIM_INVALID");
  }
  const matches = claimed.observations.filter((surface) =>
    surface?.surfaceRefHash === binding.candidateRefHash);
  if (matches.length !== 1 || matches[0].surfaceKind !== "MAILTO_LINK"
    || matches[0].targetKind !== "MAILTO_URI"
    || matches[0].methodCode !== "MAIL_COMPOSE"
    || matches[0].invocationPermittedByObservation !== false) {
    fail("PRIVATE_MAILTO_SURFACE_INVALID");
  }
  return {
    candidateRefHash: binding.candidateRefHash,
    expiresAt: instant(claimed.sourceObservationExpiresAt,
      "SOURCE_OBSERVATION_EXPIRY_INVALID"),
    route: Object.freeze({
      recipient: recipientFromMailto(matches[0].target),
      candidateRefHash: binding.candidateRefHash,
      surfaceKind: "MAILTO_LINK",
    }),
  };
}

/**
 * Create one source-specific capability for the generic one-use route runtime.
 * The injected closures own any mailbox credential; this factory never accepts
 * or projects raw credential material.
 */
export function createWebNativeMailtoTransactionSurfaceRouteAdapterV1(
  input = {}) {
  exact(input, ["contractObservedAt", "privateAdapterInstanceRefHash",
    "privateProjectionNonce", "clock", "revalidateContactAuthority",
    "deliverExact"], "INPUT_INVALID");
  instant(input.contractObservedAt, "CONTRACT_OBSERVED_AT_INVALID");
  hash(input.privateAdapterInstanceRefHash,
    "PRIVATE_ADAPTER_INSTANCE_REF_HASH_INVALID");
  hash(input.privateProjectionNonce, "PRIVATE_PROJECTION_NONCE_INVALID");
  for (const field of ["clock", "revalidateContactAuthority", "deliverExact"]) {
    if (typeof input[field] !== "function") fail(`${field.toUpperCase()}_INVALID`);
  }
  const contract = contractSource(input);
  const contractRecord = createTransactionSurfaceAdapterContractV1(
    contract.source);
  const sourcePin = createTransactionSurfaceAdapterContractSourcePinV1(
    contract.source);
  return createTransactionSurfaceOneUseRouteAdapterV1({
    contractRecord,
    contractSource: contract.source,
    expectedSourceHash: sourcePin.sourceHash,
    expectedContractHash: contractRecord.contractHash,
    transportProfileRefHash: contract.profileRef,
    clock: input.clock,
    claimCandidate: async (candidateLease, binding) =>
      claimMailtoCandidate(candidateLease, binding),
    revalidateExact: async (request) => {
      let source;
      try {
        source = await input.revalidateContactAuthority({
          recipient: request.route.recipient,
          candidateRefHash: request.route.candidateRefHash,
          transactionBindingHash: request.transactionBindingHash,
          authorityGrantHash: request.authorityGrantHash,
          effectDeadline: request.effectDeadline,
        });
      } catch { fail("CONTACT_AUTHORITY_CLOSURE_FAILED"); }
      exact(source, ["decision", "evaluatedAt", "validUntil", "sourceBytes"],
        "CONTACT_AUTHORITY_RESULT_INVALID");
      if (!["AUTHORIZED", "REVOKED"].includes(source.decision)
        || (source.decision === "REVOKED" && source.validUntil !== null)) {
        fail("CONTACT_AUTHORITY_RESULT_INVALID");
      }
      const evaluatedAt = instant(source.evaluatedAt,
        "CONTACT_AUTHORITY_EVALUATED_AT_INVALID");
      const validUntil = source.validUntil === null ? null
        : instant(source.validUntil, "CONTACT_AUTHORITY_VALID_UNTIL_INVALID");
      return {
        transactionBindingHash: request.transactionBindingHash,
        decision: source.decision,
        evaluatedAt,
        validUntil,
        sourceOccurrences: [{
          sourceKind: "CONTACT_AUTHORITY_REVALIDATION",
          observedAt: evaluatedAt,
          bytes: boundedSourceBytes(source.sourceBytes,
            "CONTACT_AUTHORITY_SOURCE_BYTES_INVALID"),
        }],
      };
    },
    submitExact: async (request) => {
      let source;
      try {
        source = await input.deliverExact({
          recipient: request.route.recipient,
          candidateRefHash: request.route.candidateRefHash,
          tenderBytes: request.tenderBytes,
          tenderBodyHash: request.tenderBodyHash,
          transactionBindingHash: request.transactionBindingHash,
          authorityGrantHash: request.authorityGrantHash,
          effectDeadline: request.effectDeadline,
          idempotencyKey: request.idempotencyKey,
          oneUseNonceHash: request.oneUseNonceHash,
        });
      } catch { fail("ACCOUNT_NATIVE_DELIVERY_CLOSURE_FAILED"); }
      exact(source, ["completedAt", "deliveryReceiptBytes",
        "counterpartyResponseBytes", "reservationReceiptBytes"],
      "ACCOUNT_NATIVE_DELIVERY_RESULT_INVALID");
      const completedAt = instant(source.completedAt,
        "ACCOUNT_NATIVE_DELIVERY_COMPLETED_AT_INVALID");
      const values = [
        ["DELIVERY_RECEIPT", nullableSourceBytes(source.deliveryReceiptBytes,
          "DELIVERY_RECEIPT_BYTES_INVALID")],
        ["COUNTERPARTY_RESPONSE", nullableSourceBytes(
          source.counterpartyResponseBytes,
          "COUNTERPARTY_RESPONSE_BYTES_INVALID")],
        ["RESERVATION_RECEIPT", nullableSourceBytes(
          source.reservationReceiptBytes,
          "RESERVATION_RECEIPT_BYTES_INVALID")],
      ];
      const sourceOccurrences = values.filter(([, bytes]) => bytes !== null)
        .map(([sourceKind, bytes]) => ({ sourceKind,
          observedAt: completedAt, bytes }));
      if (sourceOccurrences.length === 0) {
        fail("ACCOUNT_NATIVE_DELIVERY_SOURCE_REQUIRED");
      }
      return {
        transactionBindingHash: request.transactionBindingHash,
        completedAt,
        attemptedEffectCount: 1,
        sourceOccurrences,
      };
    },
  });
}
