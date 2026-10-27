/*
 * Outcome Formation Engine: observed seller mailto -> one-use tender bridge.
 *
 * This is the narrow composition between a module-issued, one-use private
 * web-native observation and the existing durable PERMISSIONED_MAILBOX
 * transport.  Observing a mailto link grants nothing.  An independently
 * supplied exact contact-authority grant is still revalidated by the mailbox
 * transport at admission and immediately before its single outbound attempt.
 *
 * Raw recipient and response bytes remain behind a one-use private claim.  A
 * send acknowledgement or response remains source material: neither is
 * supplier acceptance, capacity, price, authority, or outcome truth.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { inspectPermissionedMailboxOneUseTenderTransportV1 }
  from "./outsider-permissioned-mailbox-one-use-tender-transport-v1.js";
import { claimWebNativeTransactionSurfaceLeaseV1 }
  from "./outsider-web-native-transaction-surface-discovery-adapter-v1.js";

const PREFIX = "OUTSIDER_WEB_NATIVE_MAILTO_ONE_USE_TENDER_BRIDGE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ASCII_LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u;
const ASCII_DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const TRANSPORT_STATES = new Set([
  "RESPONSE_OBSERVED",
  "RESPONSE_ALREADY_OBSERVED",
  "PAUSED_RETRYABLE",
  "AMBIGUOUS_NO_RETRY_HOLD",
  "EXPIRED_BEFORE_SEND",
  "REVOKED_BEFORE_SEND",
  "REVOKED_BEFORE_SUBMIT",
  "EXPIRED_BEFORE_SUBMIT",
]);
const PRIVATE_RESULTS = new WeakMap();

export const OUTSIDER_WEB_NATIVE_MAILTO_ONE_USE_TENDER_BRIDGE_V1_BOUNDARY
  = Object.freeze({
    position: "OBSERVED_MAILTO_TO_PERMISSIONED_ONE_USE_TENDER_TRANSPORT",
    providerOrDomainSpecific: false,
    sellerRegistrationRequired: false,
    ambientCredentialsAccepted: false,
    mailboxCredentialsRemainInsideInjectedAccountNativeClosure: true,
    observedMailtoIsPermission: false,
    exactContactAuthorityReferenceRequired: true,
    factoryIssuedMailboxTransportRequired: true,
    frozenMailboxTransportBindingRequired: true,
    idempotencyAndNonceDerivedFromExactBinding: true,
    authorityRevalidationEvidenceProjected: false,
    maximumOutboundSendsPerBoundEffect: 1,
    durableAttemptBeforeSendInherited: true,
    webFormPostPerformed: false,
    paymentPerformed: false,
    acknowledgementIsAcceptance: false,
    responseIsAutomaticallyAccepted: false,
    providerAcceptanceEstablished: false,
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

function byteHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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

function transportBinding(input, transport) {
  let binding;
  try { binding = inspectPermissionedMailboxOneUseTenderTransportV1(transport); }
  catch { fail("MAILBOX_TRANSPORT_NOT_FACTORY_ISSUED"); }
  if (binding.transportBindingHash
    !== input.expectedMailboxTransportBindingHash) {
    fail("MAILBOX_TRANSPORT_BINDING_MISMATCH");
  }
  return binding;
}

function derivedEffect(input, recipient, tenderBodyHash, binding) {
  const recipientAddressHash = digest(
    "outsider/permissioned-mailbox-recipient-address/v1", recipient);
  const oneUseNonceHash = digest(
    "outsider/web-native-mailto-one-use-nonce/v1", {
      tenderHash: input.tenderHash,
      tenderBodyHash,
      surfaceRefHash: input.surfaceRefHash,
      authorityGrantHash: input.authorityGrantHash,
      effectDeadline: input.effectDeadline,
      mailboxTransportBindingHash: binding.transportBindingHash,
    });
  const idempotencyKey = `outsider-mailto-${digest(
    "outsider/web-native-mailto-idempotency-key/v1", {
      tenderHash: input.tenderHash,
      tenderBodyHash,
      surfaceRefHash: input.surfaceRefHash,
      authorityGrantHash: input.authorityGrantHash,
      mailboxTransportBindingHash: binding.transportBindingHash,
    }).slice(7)}`;
  const idempotencyKeyHash = digest(
    "outsider/permissioned-mailbox-idempotency-key/v1", idempotencyKey);
  const exactBinding = {
    tenderHash: input.tenderHash,
    bodyHash: tenderBodyHash,
    recipientAddressHash,
    recipientMailboxRefHash: input.surfaceRefHash,
    authorityGrantHash: input.authorityGrantHash,
    effectDeadline: input.effectDeadline,
    oneUseNonceHash,
    idempotencyKeyHash,
  };
  const transactionBindingHash = digest(
    "outsider/permissioned-mailbox-one-use-transaction-binding/v1",
    exactBinding);
  const endpointBindingHash = digest(
    "outsider/permissioned-mailbox-exact-recipient-binding/v1", {
      recipientAddressHash,
      recipientMailboxRefHash: input.surfaceRefHash,
    });
  const effectIdHash = digest(
    "outsider/permissioned-mailbox-one-use-effect/v1", {
      transactionBindingHash,
      endpointBindingHash,
    });
  return { recipientAddressHash, oneUseNonceHash, idempotencyKey,
    idempotencyKeyHash, effectIdHash };
}

function publicSurface(input) {
  const projection = input.surfaceDiscoveryResult?.publicProjection;
  if (projection === null || typeof projection !== "object"
    || projection.schema
      !== "outsider/web-native-transaction-surface-privacy-closed-summary/v1"
    || projection.tenderHash !== input.tenderHash
    || typeof projection.requirementId !== "string"
    || !Array.isArray(projection.surfaceOccurrences)
    || projection.expiresAt === undefined) fail("SURFACE_PROJECTION_INVALID");
  instant(projection.expiresAt, "SURFACE_EXPIRY_INVALID");
  const matches = projection.surfaceOccurrences.filter((surface) =>
    surface?.surfaceRefHash === input.surfaceRefHash);
  if (matches.length !== 1 || matches[0].surfaceKind !== "MAILTO_LINK"
    || matches[0].targetKind !== "MAILTO_URI"
    || matches[0].methodCode !== "MAIL_COMPOSE") {
    fail("EXACT_MAILTO_SURFACE_NOT_FOUND");
  }
  if (Date.parse(input.effectDeadline) > Date.parse(projection.expiresAt)) {
    fail("EFFECT_DEADLINE_AFTER_SURFACE_EXPIRY");
  }
  return { projection, surface: matches[0] };
}

/**
 * Drive one exact mailto surface through an already configured account-native
 * mailbox transport. The transport owns credential handling and authority
 * revalidation; this bridge owns the one-use surface-to-recipient binding.
 */
export async function dispatchWebNativeMailtoOneUseTenderV1(input = {},
  dependencies = {}) {
  exact(input, ["surfaceDiscoveryResult", "surfaceRefHash", "tenderBytes",
    "tenderHash", "authorityGrantHash", "effectDeadline",
    "expectedMailboxTransportBindingHash"], "INPUT_INVALID");
  exact(dependencies, ["mailboxTransport"], "DEPENDENCIES_INVALID");
  hash(input.surfaceRefHash, "SURFACE_REF_HASH_INVALID");
  hash(input.tenderHash, "TENDER_HASH_INVALID");
  hash(input.authorityGrantHash, "AUTHORITY_GRANT_HASH_INVALID");
  hash(input.expectedMailboxTransportBindingHash,
    "EXPECTED_MAILBOX_TRANSPORT_BINDING_HASH_INVALID");
  instant(input.effectDeadline, "EFFECT_DEADLINE_INVALID");
  const mailboxBinding = transportBinding(input,
    dependencies.mailboxTransport);
  let tenderBytes;
  try { tenderBytes = Buffer.from(input.tenderBytes); }
  catch { fail("TENDER_BYTES_INVALID"); }
  if (tenderBytes.length < 1 || tenderBytes.length > 8 * 1024 * 1024) {
    fail("TENDER_BYTES_INVALID");
  }
  const observed = publicSurface(input);
  const privateLease = claimWebNativeTransactionSurfaceLeaseV1(
    input.surfaceDiscoveryResult);
  if (privateLease.tenderHash !== input.tenderHash
    || privateLease.requirementId !== observed.projection.requirementId
    || privateLease.expiresAt !== observed.projection.expiresAt
    || !Array.isArray(privateLease.observations)) {
    fail("PRIVATE_SURFACE_BINDING_INVALID");
  }
  const privateMatches = privateLease.observations.filter((surface) =>
    surface?.surfaceRefHash === input.surfaceRefHash);
  if (privateMatches.length !== 1
    || privateMatches[0].surfaceKind !== "MAILTO_LINK"
    || privateMatches[0].targetKind !== "MAILTO_URI"
    || privateMatches[0].methodCode !== "MAIL_COMPOSE"
    || privateMatches[0].invocationPermittedByObservation !== false) {
    fail("PRIVATE_MAILTO_SURFACE_INVALID");
  }
  const recipient = recipientFromMailto(privateMatches[0].target);
  const tenderBodyHash = byteHash(tenderBytes);
  const effect = derivedEffect(input, recipient, tenderBodyHash,
    mailboxBinding);
  let transportResult;
  try {
    transportResult = await dependencies.mailboxTransport.drive({
      tenderBytes,
      tenderHash: input.tenderHash,
      recipient,
      recipientMailboxRefHash: input.surfaceRefHash,
      authorityGrantHash: input.authorityGrantHash,
      effectDeadline: input.effectDeadline,
      idempotencyKey: effect.idempotencyKey,
      oneUseNonceHash: effect.oneUseNonceHash,
      expectedTenderBodyHash: tenderBodyHash,
      expectedIdempotencyKeyHash: effect.idempotencyKeyHash,
    });
  } catch {
    fail("MAILBOX_TRANSPORT_FAILED");
  } finally {
    tenderBytes.fill(0);
  }
  if (transportResult === null || typeof transportResult !== "object"
    || transportResult.transportFamily !== "PERMISSIONED_MAILBOX"
    || transportResult.tenderHash !== input.tenderHash
    || transportResult.tenderBodyHash !== tenderBodyHash
    || transportResult.recipientMailboxRefHash !== input.surfaceRefHash
    || transportResult.recipientAddressHash !== effect.recipientAddressHash
    || transportResult.authorityGrantHash !== input.authorityGrantHash
    || transportResult.effectDeadline !== input.effectDeadline
    || transportResult.idempotencyKeyHash !== effect.idempotencyKeyHash
    || transportResult.effectIdHash !== effect.effectIdHash
    || !TRANSPORT_STATES.has(transportResult.state)
    || !HASH.test(transportResult.ledgerHeadHash)) {
    fail("MAILBOX_TRANSPORT_RESULT_INVALID");
  }
  const acknowledgementBytes = Buffer.isBuffer(
    transportResult.sendAcknowledgementBytes)
    ? Buffer.from(transportResult.sendAcknowledgementBytes) : null;
  const responseBytes = Buffer.isBuffer(transportResult.responseBytes)
    ? Buffer.from(transportResult.responseBytes) : null;
  const body = {
    schema: "outsider/web-native-mailto-one-use-tender-bridge/v1",
    schemaVersion: "1.0.0",
    recordClass: "ORDER_SCOPED_OBSERVED_MAILTO_TENDER_TRANSPORT",
    tenderHash: input.tenderHash,
    tenderBodyHash,
    requirementId: observed.projection.requirementId,
    surfaceProjectionHash: observed.projection.projectionHash,
    surfaceRefHash: input.surfaceRefHash,
    surfaceKind: "MAILTO_LINK",
    authorityGrantHash: input.authorityGrantHash,
    effectDeadline: input.effectDeadline,
    mailboxTransportBindingHash: mailboxBinding.transportBindingHash,
    oneUseNonceHash: effect.oneUseNonceHash,
    idempotencyKeyHash: effect.idempotencyKeyHash,
    effectIdHash: effect.effectIdHash,
    transportState: transportResult.state,
    ledgerHeadHash: transportResult.ledgerHeadHash,
    acknowledgementSourceHash: acknowledgementBytes === null
      ? null : byteHash(acknowledgementBytes),
    responseSourceHash: typeof transportResult.responseSourceHash === "string"
      && HASH.test(transportResult.responseSourceHash)
      ? transportResult.responseSourceHash
      : responseBytes === null ? null : byteHash(responseBytes),
    sellerOriginProjected: false,
    recipientProjected: false,
    rawSurfaceTargetProjected: false,
    acknowledgementBytesProjected: false,
    responseBytesProjected: false,
    surfaceObservationIsPermission: false,
    exactContactAuthorityReferenceBound: true,
    mailboxTransportFactoryIssuedVerified: true,
    mailboxTransportFrozenBindingMatched: true,
    exactContactAuthorityRevalidatedByMailboxTransport: false,
    authorityRevalidationEvidenceProjected: false,
    transportAcknowledgementIsAcceptance: false,
    responseRequiresSeparateSourceReplay: true,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    outcomeEstablished: false,
    webFormPostPerformed: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const publicProjection = Object.freeze({ ...body,
    bridgeHash: digest(body.schema, body),
    boundary: OUTSIDER_WEB_NATIVE_MAILTO_ONE_USE_TENDER_BRIDGE_V1_BOUNDARY });
  const result = Object.freeze({ publicProjection });
  PRIVATE_RESULTS.set(result, { consumed: false, recipient,
    transportResult });
  return result;
}

/** Claim the raw account-native source material once for source replay. */
export function claimWebNativeMailtoOneUseTenderSourcesV1(result) {
  const privateResult = PRIVATE_RESULTS.get(result);
  if (privateResult === undefined || privateResult.consumed) {
    fail("PRIVATE_BRIDGE_RESULT_INVALID_OR_REPLAYED");
  }
  privateResult.consumed = true;
  return Object.freeze({
    schema: "outsider/web-native-mailto-one-use-tender-private-sources/v1",
    schemaVersion: "1.0.0",
    recipient: privateResult.recipient,
    transportResult: privateResult.transportResult,
    interpretationPermitted: false,
    responseSourceReplayRequired: true,
  });
}
