/*
 * Outcome Formation Engine: one-use commercial commitments and optional
 * standing-capacity grants.
 *
 * This module is deliberately capability-free.  It binds explicit caller
 * supplied statements to an opaque tender hash and returns immutable canonical
 * records.  It does not contact a provider, reserve capacity, verify a legal
 * identity, validate a signature, move money, price an outcome, or mint
 * authority.  In particular, a provider's one-use ACCEPT is not standing
 * capacity.  Standing capacity requires a later, separate, explicit grant and
 * remains revocable.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const NumberIsFinite = Number.isFinite;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;
const HashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);

const PREFIX = "OUTSIDER_ONE_USE_COMMITMENTS_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const AMOUNT_MINOR = /^(?:0|[1-9]\d{0,30})$/u;
const MAX_CONSUMED_NONCES = 65_536;

export const OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS = ObjectFreeze({
  commercialTerm: "outsider/outcome-formation-quoted-commercial-term/v1",
  ownerMandate: "outsider/outcome-formation-owner-one-use-mandate/v1",
  providerAcceptance: "outsider/outcome-formation-provider-one-use-acceptance/v1",
  capacityReservationReceipt:
    "outsider/outcome-formation-external-capacity-reservation-receipt-binding/v1",
  verification: "outsider/outcome-formation-one-use-commitments-verification/v1",
  capacityGrantInvitation:
    "outsider/outcome-formation-standing-capacity-grant-invitation/v1",
  capacityGrant: "outsider/outcome-formation-standing-capacity-grant/v1",
  capacityGrantRevocation:
    "outsider/outcome-formation-standing-capacity-grant-revocation/v1",
  capacityGrantVerification:
    "outsider/outcome-formation-standing-capacity-grant-verification/v1",
});

export const OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY = deepFreeze({
  position:
    "EXPLICIT_ONE_USE_COMMERCIAL_COMMITMENT_BINDINGS_NOT_AUTHORITY_OR_EXECUTION",
  opaqueTenderHashBindingOnly: true,
  tenderSourceReplayedByThisModule: false,
  quotedCommercialTermCallerSuppliedOnly: true,
  pricingPerformed: false,
  priceAuthorityEstablished: false,
  silenceAcceptedAsConsent: false,
  explicitAffirmativeResponseRequired: true,
  oneUseNonceRequired: true,
  nonceLedgerPersistedByThisModule: false,
  providerOneUseAcceptanceCreatesStandingCapacity: false,
  completionCreatesStandingCapacity: false,
  autoEnrollmentAllowed: false,
  separateStandingCapacityOptInRequired: true,
  standingCapacityRevocable: true,
  signatureReferenceCryptographicallyVerified: false,
  signatureOrHashEstablishesLegalIdentity: false,
  signatureOrHashMintsAuthority: false,
  structuralConformanceMintsAuthority: false,
  providerAcceptanceAloneReservesCapacity: false,
  explicitExternalCapacityReceiptRequired: true,
  externalReceiptAuthenticityVerifiedByThisModule: false,
  capacityReceiptReferenceEstablishesActualCapacity: false,
  externalCapacityEstablished: false,
  capacityReceiptStructuralVerificationMintsAuthority: false,
  standingGrantReferenceEstablishesActualStandingCapacity: false,
  trustedStandingLifecycleHeadVerified: false,
  actionReady: false,
  executable: false,
  authority: "NONE",
});

export const OUTSIDER_ONE_USE_COMMITMENTS_V1_REVOCATION_REASONS
  = ObjectFreeze([
    "PROVIDER_REQUEST",
    "CAPACITY_CHANGE",
    "SCOPE_CHANGE",
    "SAFETY_CHANGE",
    "RIGHTS_CHANGE",
    "OTHER_DECLARED",
  ]);

function fail(code) {
  throw new TypeErrorConstructor(`${PREFIX}${code}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) {
    return value;
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value);
    }
  }
  return ObjectFreeze(value);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return array;
}

function exactObject(value, fields, code) {
  canonicalizeStrict(value);
  if (value === null || typeof value !== "object" || ArrayIsArray(value)) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, maximum = MAX_CONSUMED_NONCES) {
  canonicalizeStrict(value);
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function iso(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function interval(start, end, code) {
  const normalizedStart = iso(start, `${code}_START`);
  const normalizedEnd = iso(end, `${code}_END`);
  if (DateParse(normalizedEnd) <= DateParse(normalizedStart)) {
    fail(`${code}_EMPTY`);
  }
  return [normalizedStart, normalizedEnd];
}

function requireLiteral(value, literal, code) {
  if (value !== literal) fail(code);
  return value;
}

function oneOf(value, values, code) {
  for (let index = 0; index < values.length; index += 1) {
    if (value === values[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function normalizeQuotedCommercialTerm(value) {
  exactObject(value, ["quoteRefHash", "currency", "amountMinor"],
    "COMMERCIAL_TERM_INPUT");
  if (typeof value.currency !== "string"
    || !RegExpTest(CURRENCY, value.currency)) fail("COMMERCIAL_TERM_CURRENCY_INVALID");
  if (typeof value.amountMinor !== "string"
    || !RegExpTest(AMOUNT_MINOR, value.amountMinor)) {
    fail("COMMERCIAL_TERM_AMOUNT_MINOR_INVALID");
  }
  const body = {
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.commercialTerm,
    quoteRefHash: hash(value.quoteRefHash, "COMMERCIAL_TERM_QUOTE_REF_HASH"),
    currency: value.currency,
    amountMinor: value.amountMinor,
    source: "CALLER_SUPPLIED_QUOTED_COMMERCIAL_TERM",
    amountOrPriceVerified: false,
    priceAuthorityEstablished: false,
    pricingPerformedByThisModule: false,
  };
  return deepFreeze({
    ...body,
    commercialTermHash: digest(
      OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.commercialTerm, body),
  });
}

function quotedCommercialTermInput(value) {
  return {
    quoteRefHash: value.quoteRefHash,
    currency: value.currency,
    amountMinor: value.amountMinor,
  };
}

function verifyQuotedCommercialTerm(value) {
  exactObject(value, ["schema", "quoteRefHash", "currency", "amountMinor",
    "source", "amountOrPriceVerified", "priceAuthorityEstablished",
    "pricingPerformedByThisModule", "commercialTermHash"], "COMMERCIAL_TERM");
  const rebuilt = normalizeQuotedCommercialTerm(quotedCommercialTermInput(value));
  if (!same(value, rebuilt)) fail("COMMERCIAL_TERM_SELF_HASH_OR_STATE_INVALID");
  return rebuilt;
}

function seal(schema, hashField, body) {
  return deepFreeze({ ...body, [hashField]: digest(schema, body) });
}

const OWNER_INPUT_FIELDS = ObjectFreeze([
  "tenderHash",
  "scopeHash",
  "ownerPrincipalRefHash",
  "delegationEnvelopeHash",
  "evidencePlanHash",
  "remedyPlanHash",
  "commercialTerm",
  "issuedAt",
  "expiresAt",
  "oneUseNonceHash",
  "response",
  "signatureRefHash",
]);

export function createOwnerOneUseMandateV1(input) {
  exactObject(input, OWNER_INPUT_FIELDS, "OWNER_MANDATE_INPUT");
  const [issuedAt, expiresAt] = interval(input.issuedAt, input.expiresAt,
    "OWNER_MANDATE_VALIDITY");
  requireLiteral(input.response, "ACCEPT", "OWNER_MANDATE_EXPLICIT_ACCEPT_REQUIRED");
  const body = {
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.ownerMandate,
    schemaVersion: "1.0.0",
    recordClass: "EXPLICIT_OWNER_ONE_USE_MANDATE_REFERENCE",
    tenderHash: hash(input.tenderHash, "OWNER_MANDATE_TENDER_HASH"),
    scopeHash: hash(input.scopeHash, "OWNER_MANDATE_SCOPE_HASH"),
    ownerPrincipalRefHash: hash(input.ownerPrincipalRefHash,
      "OWNER_MANDATE_PRINCIPAL_REF_HASH"),
    delegationEnvelopeHash: hash(input.delegationEnvelopeHash,
      "OWNER_MANDATE_DELEGATION_ENVELOPE_HASH"),
    evidencePlanHash: hash(input.evidencePlanHash,
      "OWNER_MANDATE_EVIDENCE_PLAN_HASH"),
    remedyPlanHash: hash(input.remedyPlanHash,
      "OWNER_MANDATE_REMEDY_PLAN_HASH"),
    commercialTerm: normalizeQuotedCommercialTerm(input.commercialTerm),
    issuedAt,
    expiresAt,
    oneUseNonceHash: hash(input.oneUseNonceHash, "OWNER_MANDATE_NONCE_HASH"),
    response: "ACCEPT",
    explicitAffirmativeResponseObserved: true,
    silenceAccepted: false,
    evidencePlanAccepted: true,
    remedyPlanAccepted: true,
    signatureRefHash: nullableHash(input.signatureRefHash,
      "OWNER_MANDATE_SIGNATURE_REF_HASH"),
    signatureCryptographicallyVerified: false,
    signerLegalIdentityEstablished: false,
    ownerLegalAuthorityEstablished: false,
    standingAuthorityEstablished: false,
    oneUseOnly: true,
    autoEnrollStandingCapacity: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return seal(OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.ownerMandate,
    "ownerMandateHash", body);
}

const OWNER_RECORD_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "tenderHash", "scopeHash",
  "ownerPrincipalRefHash", "delegationEnvelopeHash", "evidencePlanHash",
  "remedyPlanHash", "commercialTerm", "issuedAt", "expiresAt",
  "oneUseNonceHash", "response", "explicitAffirmativeResponseObserved",
  "silenceAccepted", "evidencePlanAccepted", "remedyPlanAccepted",
  "signatureRefHash", "signatureCryptographicallyVerified",
  "signerLegalIdentityEstablished", "ownerLegalAuthorityEstablished",
  "standingAuthorityEstablished", "oneUseOnly", "autoEnrollStandingCapacity",
  "decisionState", "authority", "actionReady", "executable", "ownerMandateHash",
]);

function ownerInputFromRecord(value) {
  return {
    tenderHash: value.tenderHash,
    scopeHash: value.scopeHash,
    ownerPrincipalRefHash: value.ownerPrincipalRefHash,
    delegationEnvelopeHash: value.delegationEnvelopeHash,
    evidencePlanHash: value.evidencePlanHash,
    remedyPlanHash: value.remedyPlanHash,
    commercialTerm: quotedCommercialTermInput(value.commercialTerm),
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    oneUseNonceHash: value.oneUseNonceHash,
    response: value.response,
    signatureRefHash: value.signatureRefHash,
  };
}

function verifyOwnerRecord(value) {
  exactObject(value, OWNER_RECORD_FIELDS, "OWNER_MANDATE");
  verifyQuotedCommercialTerm(value.commercialTerm);
  const rebuilt = createOwnerOneUseMandateV1(ownerInputFromRecord(value));
  if (!same(value, rebuilt)) fail("OWNER_MANDATE_DERIVATION_INVALID");
  return rebuilt;
}

const PROVIDER_INPUT_FIELDS = ObjectFreeze([
  "tenderHash",
  "scopeHash",
  "providerRefHash",
  "evidencePlanHash",
  "remedyPlanHash",
  "commercialTerm",
  "acceptedAt",
  "expiresAt",
  "oneUseNonceHash",
  "response",
  "signatureRefHash",
]);

export function createProviderOneUseAcceptanceV1(input) {
  exactObject(input, PROVIDER_INPUT_FIELDS, "PROVIDER_ACCEPTANCE_INPUT");
  const [acceptedAt, expiresAt] = interval(input.acceptedAt, input.expiresAt,
    "PROVIDER_ACCEPTANCE_VALIDITY");
  requireLiteral(input.response, "ACCEPT",
    "PROVIDER_ACCEPTANCE_EXPLICIT_ACCEPT_REQUIRED");
  const body = {
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.providerAcceptance,
    schemaVersion: "1.0.0",
    recordClass: "EXPLICIT_PROVIDER_ONE_USE_ACCEPTANCE_REFERENCE",
    tenderHash: hash(input.tenderHash, "PROVIDER_ACCEPTANCE_TENDER_HASH"),
    scopeHash: hash(input.scopeHash, "PROVIDER_ACCEPTANCE_SCOPE_HASH"),
    providerRefHash: hash(input.providerRefHash,
      "PROVIDER_ACCEPTANCE_PROVIDER_REF_HASH"),
    evidencePlanHash: hash(input.evidencePlanHash,
      "PROVIDER_ACCEPTANCE_EVIDENCE_PLAN_HASH"),
    remedyPlanHash: hash(input.remedyPlanHash,
      "PROVIDER_ACCEPTANCE_REMEDY_PLAN_HASH"),
    commercialTerm: normalizeQuotedCommercialTerm(input.commercialTerm),
    acceptedAt,
    expiresAt,
    oneUseNonceHash: hash(input.oneUseNonceHash,
      "PROVIDER_ACCEPTANCE_NONCE_HASH"),
    response: "ACCEPT",
    explicitAffirmativeResponseObserved: true,
    silenceAccepted: false,
    evidencePlanAccepted: true,
    remedyPlanAccepted: true,
    signatureRefHash: nullableHash(input.signatureRefHash,
      "PROVIDER_ACCEPTANCE_SIGNATURE_REF_HASH"),
    signatureCryptographicallyVerified: false,
    signerLegalIdentityEstablished: false,
    providerStandingEstablished: false,
    providerLegalAuthorityEstablished: false,
    capacityReserved: false,
    oneUseOnly: true,
    createsStandingCapacity: false,
    autoEnrollStandingCapacity: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return seal(OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.providerAcceptance,
    "providerAcceptanceHash", body);
}

const PROVIDER_RECORD_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "tenderHash", "scopeHash",
  "providerRefHash", "evidencePlanHash", "remedyPlanHash", "commercialTerm",
  "acceptedAt", "expiresAt", "oneUseNonceHash", "response",
  "explicitAffirmativeResponseObserved", "silenceAccepted",
  "evidencePlanAccepted", "remedyPlanAccepted", "signatureRefHash",
  "signatureCryptographicallyVerified", "signerLegalIdentityEstablished",
  "providerStandingEstablished", "providerLegalAuthorityEstablished",
  "capacityReserved", "oneUseOnly", "createsStandingCapacity",
  "autoEnrollStandingCapacity", "decisionState", "authority", "actionReady",
  "executable", "providerAcceptanceHash",
]);

function providerInputFromRecord(value) {
  return {
    tenderHash: value.tenderHash,
    scopeHash: value.scopeHash,
    providerRefHash: value.providerRefHash,
    evidencePlanHash: value.evidencePlanHash,
    remedyPlanHash: value.remedyPlanHash,
    commercialTerm: quotedCommercialTermInput(value.commercialTerm),
    acceptedAt: value.acceptedAt,
    expiresAt: value.expiresAt,
    oneUseNonceHash: value.oneUseNonceHash,
    response: value.response,
    signatureRefHash: value.signatureRefHash,
  };
}

function verifyProviderRecord(value) {
  exactObject(value, PROVIDER_RECORD_FIELDS, "PROVIDER_ACCEPTANCE");
  verifyQuotedCommercialTerm(value.commercialTerm);
  const rebuilt = createProviderOneUseAcceptanceV1(providerInputFromRecord(value));
  if (!same(value, rebuilt)) fail("PROVIDER_ACCEPTANCE_DERIVATION_INVALID");
  return rebuilt;
}

const RESERVATION_INPUT_FIELDS = ObjectFreeze([
  "tenderHash",
  "scopeHash",
  "providerAcceptanceHash",
  "commercialTermHash",
  "externalSystemRefHash",
  "externalReservationRefHash",
  "externalReceiptArtifactHash",
  "issuedAt",
  "reservedFrom",
  "reservedUntil",
  "status",
  "signatureRefHash",
]);

export function createExternalCapacityReservationReceiptBindingV1(input) {
  exactObject(input, RESERVATION_INPUT_FIELDS, "CAPACITY_RESERVATION_INPUT");
  const [reservedFrom, reservedUntil] = interval(input.reservedFrom,
    input.reservedUntil, "CAPACITY_RESERVATION_WINDOW");
  const issuedAt = iso(input.issuedAt, "CAPACITY_RESERVATION_ISSUED_AT");
  if (DateParse(issuedAt) > DateParse(reservedUntil)) {
    fail("CAPACITY_RESERVATION_ISSUED_AFTER_WINDOW");
  }
  requireLiteral(input.status, "RESERVED",
    "CAPACITY_RESERVATION_EXPLICIT_RESERVED_STATUS_REQUIRED");
  const body = {
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityReservationReceipt,
    schemaVersion: "1.0.0",
    recordClass: "EXPLICIT_EXTERNAL_CAPACITY_RESERVATION_RECEIPT_REFERENCE",
    tenderHash: hash(input.tenderHash, "CAPACITY_RESERVATION_TENDER_HASH"),
    scopeHash: hash(input.scopeHash, "CAPACITY_RESERVATION_SCOPE_HASH"),
    providerAcceptanceHash: hash(input.providerAcceptanceHash,
      "CAPACITY_RESERVATION_PROVIDER_ACCEPTANCE_HASH"),
    commercialTermHash: hash(input.commercialTermHash,
      "CAPACITY_RESERVATION_COMMERCIAL_TERM_HASH"),
    externalSystemRefHash: hash(input.externalSystemRefHash,
      "CAPACITY_RESERVATION_EXTERNAL_SYSTEM_REF_HASH"),
    externalReservationRefHash: hash(input.externalReservationRefHash,
      "CAPACITY_RESERVATION_EXTERNAL_RESERVATION_REF_HASH"),
    externalReceiptArtifactHash: hash(input.externalReceiptArtifactHash,
      "CAPACITY_RESERVATION_EXTERNAL_RECEIPT_ARTIFACT_HASH"),
    issuedAt,
    reservedFrom,
    reservedUntil,
    status: "RESERVED",
    explicitExternalReceiptReferenceSupplied: true,
    signatureRefHash: nullableHash(input.signatureRefHash,
      "CAPACITY_RESERVATION_SIGNATURE_REF_HASH"),
    externalReceiptContentSourceReplayed: false,
    externalReceiptAuthenticityEstablished: false,
    signatureCryptographicallyVerified: false,
    signerLegalIdentityEstablished: false,
    reservationAuthorityEstablished: false,
    authority: "NONE",
  };
  return seal(
    OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityReservationReceipt,
    "capacityReservationReceiptHash", body);
}

const RESERVATION_RECORD_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "tenderHash", "scopeHash",
  "providerAcceptanceHash", "commercialTermHash", "externalSystemRefHash",
  "externalReservationRefHash", "externalReceiptArtifactHash", "issuedAt",
  "reservedFrom", "reservedUntil", "status",
  "explicitExternalReceiptReferenceSupplied", "signatureRefHash",
  "externalReceiptContentSourceReplayed", "externalReceiptAuthenticityEstablished",
  "signatureCryptographicallyVerified", "signerLegalIdentityEstablished",
  "reservationAuthorityEstablished", "authority",
  "capacityReservationReceiptHash",
]);

function reservationInputFromRecord(value) {
  return {
    tenderHash: value.tenderHash,
    scopeHash: value.scopeHash,
    providerAcceptanceHash: value.providerAcceptanceHash,
    commercialTermHash: value.commercialTermHash,
    externalSystemRefHash: value.externalSystemRefHash,
    externalReservationRefHash: value.externalReservationRefHash,
    externalReceiptArtifactHash: value.externalReceiptArtifactHash,
    issuedAt: value.issuedAt,
    reservedFrom: value.reservedFrom,
    reservedUntil: value.reservedUntil,
    status: value.status,
    signatureRefHash: value.signatureRefHash,
  };
}

function verifyReservationRecord(value) {
  exactObject(value, RESERVATION_RECORD_FIELDS, "CAPACITY_RESERVATION_RECEIPT");
  const rebuilt = createExternalCapacityReservationReceiptBindingV1(
    reservationInputFromRecord(value));
  if (!same(value, rebuilt)) fail("CAPACITY_RESERVATION_DERIVATION_INVALID");
  return rebuilt;
}

function normalizedConsumedNonces(value) {
  denseArray(value, "CONSUMED_NONCE_HASHES");
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    append(result, hash(value[index], "CONSUMED_NONCE_HASH"));
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail("CONSUMED_NONCE_DUPLICATE");
  }
  return result;
}

function includes(value, candidate) {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === candidate) return true;
  }
  return false;
}

function oneUseFailure(error) {
  const message = error instanceof ErrorConstructor
    ? error.message : "OUTSIDER_ONE_USE_COMMITMENTS_V1_UNKNOWN_FAILURE";
  return deepFreeze({
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.verification,
    ok: false,
    structuralBindingsVerified: false,
    explicitOwnerAcceptanceVerified: false,
    explicitProviderAcceptanceVerified: false,
    tenderScopeEvidenceRemedyAndCommercialTermMatched: false,
    oneUseNoncePairUniqueInRecords: false,
    noConsumedNonceMatchInCallerSnapshot: false,
    nonceGlobalFreshnessEstablished: false,
    nonceConsumptionPersisted: false,
    externalCapacityReceiptSupplied: false,
    externalCapacityReceiptStructurallyVerified: false,
    capacityReceiptReferenceStructurallyPresent: false,
    capacityReservationWindowReferenceCurrent: false,
    externalCapacityReceiptAuthenticityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    providerStandingEstablished: false,
    legalIdentityEstablished: false,
    authorityEstablished: false,
    pricingAuthorityEstablished: false,
    formationState: "REJECTED_FAIL_CLOSED",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: message,
    boundary: OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY,
  });
}

const VERIFY_INPUT_FIELDS = ObjectFreeze([
  "expectedTenderHash",
  "ownerMandate",
  "providerAcceptance",
  "capacityReservationReceipt",
  "observedAt",
  "consumedNonceHashes",
]);

export function verifyOneUseCommitmentsV1(input) {
  try {
    exactObject(input, VERIFY_INPUT_FIELDS, "VERIFY_INPUT");
    if (input.ownerMandate === null) fail("OWNER_MANDATE_MISSING");
    if (input.providerAcceptance === null) fail("PROVIDER_ACCEPTANCE_MISSING");
    const expectedTenderHash = hash(input.expectedTenderHash,
      "EXPECTED_TENDER_HASH");
    const owner = verifyOwnerRecord(input.ownerMandate);
    const provider = verifyProviderRecord(input.providerAcceptance);
    const observedAt = iso(input.observedAt, "OBSERVED_AT");
    if (owner.tenderHash !== expectedTenderHash
      || provider.tenderHash !== expectedTenderHash) fail("TENDER_HASH_MISMATCH");
    if (owner.scopeHash !== provider.scopeHash) fail("SCOPE_HASH_MISMATCH");
    if (owner.evidencePlanHash !== provider.evidencePlanHash) {
      fail("EVIDENCE_PLAN_HASH_MISMATCH");
    }
    if (owner.remedyPlanHash !== provider.remedyPlanHash) {
      fail("REMEDY_PLAN_HASH_MISMATCH");
    }
    if (owner.commercialTerm.commercialTermHash
      !== provider.commercialTerm.commercialTermHash) {
      fail("COMMERCIAL_TERM_HASH_MISMATCH");
    }
    if (DateParse(observedAt) < DateParse(owner.issuedAt)
      || DateParse(observedAt) < DateParse(provider.acceptedAt)) {
      fail("COMMITMENTS_NOT_YET_EFFECTIVE");
    }
    if (DateParse(observedAt) >= DateParse(owner.expiresAt)
      || DateParse(observedAt) >= DateParse(provider.expiresAt)) {
      fail("COMMITMENTS_EXPIRED");
    }
    if (owner.oneUseNonceHash === provider.oneUseNonceHash) {
      fail("ONE_USE_NONCE_PAIR_MUST_BE_DISTINCT");
    }
    const consumed = normalizedConsumedNonces(input.consumedNonceHashes);
    if (includes(consumed, owner.oneUseNonceHash)
      || includes(consumed, provider.oneUseNonceHash)) {
      fail("ONE_USE_NONCE_ALREADY_CONSUMED");
    }

    let reservation = null;
    if (input.capacityReservationReceipt !== null) {
      reservation = verifyReservationRecord(input.capacityReservationReceipt);
      if (reservation.tenderHash !== expectedTenderHash
        || reservation.scopeHash !== owner.scopeHash
        || reservation.providerAcceptanceHash !== provider.providerAcceptanceHash
        || reservation.commercialTermHash
          !== provider.commercialTerm.commercialTermHash) {
        fail("CAPACITY_RESERVATION_CROSSWALK_MISMATCH");
      }
      if (DateParse(reservation.issuedAt) > DateParse(observedAt)) {
        fail("CAPACITY_RESERVATION_RECEIPT_FROM_FUTURE");
      }
      if (DateParse(reservation.reservedFrom) > DateParse(observedAt)) {
        fail("CAPACITY_RESERVATION_WINDOW_NOT_YET_CURRENT");
      }
      if (DateParse(reservation.reservedUntil) <= DateParse(observedAt)) {
        fail("CAPACITY_RESERVATION_EXPIRED");
      }
    }

    const capacityReceiptReferenceStructurallyPresent = reservation !== null;
    return deepFreeze({
      schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.verification,
      ok: true,
      structuralBindingsVerified: true,
      ownerMandateHash: owner.ownerMandateHash,
      providerAcceptanceHash: provider.providerAcceptanceHash,
      tenderHash: expectedTenderHash,
      scopeHash: owner.scopeHash,
      evidencePlanHash: owner.evidencePlanHash,
      remedyPlanHash: owner.remedyPlanHash,
      commercialTermHash: owner.commercialTerm.commercialTermHash,
      explicitOwnerAcceptanceVerified: true,
      explicitProviderAcceptanceVerified: true,
      silenceAccepted: false,
      tenderScopeEvidenceRemedyAndCommercialTermMatched: true,
      oneUseNoncePairUniqueInRecords: true,
      noConsumedNonceMatchInCallerSnapshot: true,
      nonceLedgerSnapshotCallerSupplied: true,
      nonceLedgerSnapshotSourceReplayed: false,
      nonceGlobalFreshnessEstablished: false,
      nonceConsumptionPersisted: false,
      externalCapacityReceiptSupplied: capacityReceiptReferenceStructurallyPresent,
      externalCapacityReceiptStructurallyVerified:
        capacityReceiptReferenceStructurallyPresent,
      capacityReceiptReferenceStructurallyPresent,
      capacityReservationWindowReferenceCurrent:
        capacityReceiptReferenceStructurallyPresent,
      capacityReservationReceiptHash:
        capacityReceiptReferenceStructurallyPresent
          ? reservation.capacityReservationReceiptHash : null,
      externalCapacityReceiptAuthenticityEstablished: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      capacityReservationBasis: capacityReceiptReferenceStructurallyPresent
        ? "NONE_STRUCTURAL_EXTERNAL_RECEIPT_REFERENCE_IS_NOT_CAPACITY_TRUTH"
        : "NONE_PROVIDER_ACCEPTANCE_ALONE_NEVER_RESERVES_CAPACITY",
      providerStandingEstablished: false,
      oneUseAcceptanceCreatesStandingCapacity: false,
      legalIdentityEstablished: false,
      signatureCryptographicallyVerified: false,
      authorityEstablished: false,
      pricingAuthorityEstablished: false,
      formationState: capacityReceiptReferenceStructurallyPresent
        ? "ONE_USE_BINDINGS_AND_CURRENT_CAPACITY_RECEIPT_REFERENCE_STRUCTURALLY_VERIFIED_EXTERNAL_CAPACITY_UNESTABLISHED_HOLD"
        : "ONE_USE_BINDINGS_VERIFIED_CAPACITY_UNRESERVED_HOLD",
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      error: null,
      boundary: OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY,
    });
  } catch (error) {
    return oneUseFailure(error);
  }
}

const INVITATION_INPUT_FIELDS = ObjectFreeze([
  "sourceTenderHash",
  "sourceProviderAcceptanceHash",
  "inviterRefHash",
  "providerRefHash",
  "scopeHash",
  "capacityTermsHash",
  "safetyEnvelopeHash",
  "evidencePlanHash",
  "remedyPlanHash",
  "validFrom",
  "validUntil",
  "issuedAt",
  "expiresAt",
  "invitationNonceHash",
]);

export function createStandingCapacityGrantInvitationV1(input) {
  exactObject(input, INVITATION_INPUT_FIELDS, "CAPACITY_GRANT_INVITATION_INPUT");
  const [validFrom, validUntil] = interval(input.validFrom, input.validUntil,
    "CAPACITY_GRANT_VALIDITY");
  const [issuedAt, expiresAt] = interval(input.issuedAt, input.expiresAt,
    "CAPACITY_GRANT_INVITATION_VALIDITY");
  if (DateParse(expiresAt) > DateParse(validUntil)) {
    fail("CAPACITY_GRANT_INVITATION_EXPIRES_AFTER_GRANT_VALIDITY");
  }
  const body = {
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrantInvitation,
    schemaVersion: "1.0.0",
    recordClass: "SEPARATE_EXPLICIT_STANDING_CAPACITY_OPT_IN_INVITATION",
    sourceTenderHash: hash(input.sourceTenderHash,
      "CAPACITY_GRANT_SOURCE_TENDER_HASH"),
    sourceProviderAcceptanceHash: hash(input.sourceProviderAcceptanceHash,
      "CAPACITY_GRANT_SOURCE_PROVIDER_ACCEPTANCE_HASH"),
    inviterRefHash: hash(input.inviterRefHash, "CAPACITY_GRANT_INVITER_REF_HASH"),
    providerRefHash: hash(input.providerRefHash,
      "CAPACITY_GRANT_PROVIDER_REF_HASH"),
    scopeHash: hash(input.scopeHash, "CAPACITY_GRANT_SCOPE_HASH"),
    capacityTermsHash: hash(input.capacityTermsHash,
      "CAPACITY_GRANT_TERMS_HASH"),
    safetyEnvelopeHash: hash(input.safetyEnvelopeHash,
      "CAPACITY_GRANT_SAFETY_ENVELOPE_HASH"),
    evidencePlanHash: hash(input.evidencePlanHash,
      "CAPACITY_GRANT_EVIDENCE_PLAN_HASH"),
    remedyPlanHash: hash(input.remedyPlanHash,
      "CAPACITY_GRANT_REMEDY_PLAN_HASH"),
    validFrom,
    validUntil,
    issuedAt,
    expiresAt,
    invitationNonceHash: hash(input.invitationNonceHash,
      "CAPACITY_GRANT_INVITATION_NONCE_HASH"),
    status: "INVITED_AWAITING_EXPLICIT_PROVIDER_OPT_IN",
    explicitSeparateResponseRequired: true,
    silenceAccepted: false,
    completionAutoEnrollmentAllowed: false,
    scopeExpansionAllowedOnAcceptance: false,
    safetyEnvelopeExpansionAllowedOnAcceptance: false,
    standingCapacityGranted: false,
    capacityReservedForAnyTender: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return seal(
    OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrantInvitation,
    "capacityGrantInvitationHash", body);
}

const INVITATION_RECORD_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "sourceTenderHash",
  "sourceProviderAcceptanceHash", "inviterRefHash", "providerRefHash",
  "scopeHash", "capacityTermsHash", "safetyEnvelopeHash", "evidencePlanHash",
  "remedyPlanHash", "validFrom", "validUntil", "issuedAt", "expiresAt",
  "invitationNonceHash", "status", "explicitSeparateResponseRequired",
  "silenceAccepted", "completionAutoEnrollmentAllowed",
  "scopeExpansionAllowedOnAcceptance", "safetyEnvelopeExpansionAllowedOnAcceptance",
  "standingCapacityGranted", "capacityReservedForAnyTender", "authority",
  "actionReady", "executable", "capacityGrantInvitationHash",
]);

function invitationInputFromRecord(value) {
  return {
    sourceTenderHash: value.sourceTenderHash,
    sourceProviderAcceptanceHash: value.sourceProviderAcceptanceHash,
    inviterRefHash: value.inviterRefHash,
    providerRefHash: value.providerRefHash,
    scopeHash: value.scopeHash,
    capacityTermsHash: value.capacityTermsHash,
    safetyEnvelopeHash: value.safetyEnvelopeHash,
    evidencePlanHash: value.evidencePlanHash,
    remedyPlanHash: value.remedyPlanHash,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    invitationNonceHash: value.invitationNonceHash,
  };
}

function verifyInvitationRecord(value) {
  exactObject(value, INVITATION_RECORD_FIELDS, "CAPACITY_GRANT_INVITATION");
  const rebuilt = createStandingCapacityGrantInvitationV1(
    invitationInputFromRecord(value));
  if (!same(value, rebuilt)) fail("CAPACITY_GRANT_INVITATION_DERIVATION_INVALID");
  return rebuilt;
}

const GRANT_INPUT_FIELDS = ObjectFreeze([
  "invitation",
  "acceptedAt",
  "grantNonceHash",
  "response",
  "signatureRefHash",
]);

export function acceptStandingCapacityGrantV1(input) {
  exactObject(input, GRANT_INPUT_FIELDS, "CAPACITY_GRANT_ACCEPTANCE_INPUT");
  const invitation = verifyInvitationRecord(input.invitation);
  const acceptedAt = iso(input.acceptedAt, "CAPACITY_GRANT_ACCEPTED_AT");
  if (DateParse(acceptedAt) < DateParse(invitation.issuedAt)
    || DateParse(acceptedAt) >= DateParse(invitation.expiresAt)) {
    fail("CAPACITY_GRANT_INVITATION_NOT_ACCEPTABLE_AT_TIME");
  }
  requireLiteral(input.response, "ACCEPT",
    "CAPACITY_GRANT_EXPLICIT_ACCEPT_REQUIRED");
  const grantNonceHash = hash(input.grantNonceHash,
    "CAPACITY_GRANT_NONCE_HASH");
  if (grantNonceHash === invitation.invitationNonceHash) {
    fail("CAPACITY_GRANT_NONCE_MUST_DIFFER_FROM_INVITATION_NONCE");
  }
  const body = {
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrant,
    schemaVersion: "1.0.0",
    recordClass: "SEPARATELY_ACCEPTED_REVOCABLE_STANDING_CAPACITY_GRANT",
    capacityGrantInvitationHash: invitation.capacityGrantInvitationHash,
    sourceTenderHash: invitation.sourceTenderHash,
    sourceProviderAcceptanceHash: invitation.sourceProviderAcceptanceHash,
    inviterRefHash: invitation.inviterRefHash,
    providerRefHash: invitation.providerRefHash,
    scopeHash: invitation.scopeHash,
    capacityTermsHash: invitation.capacityTermsHash,
    safetyEnvelopeHash: invitation.safetyEnvelopeHash,
    evidencePlanHash: invitation.evidencePlanHash,
    remedyPlanHash: invitation.remedyPlanHash,
    validFrom: invitation.validFrom,
    validUntil: invitation.validUntil,
    acceptedAt,
    grantNonceHash,
    response: "ACCEPT",
    signatureRefHash: nullableHash(input.signatureRefHash,
      "CAPACITY_GRANT_SIGNATURE_REF_HASH"),
    explicitSeparateOptInObserved: true,
    silenceAccepted: false,
    completionAutoEnrollmentUsed: false,
    scopeCopiedExactlyFromInvitation: true,
    scopeExpansionAllowed: false,
    safetyEnvelopeCopiedExactlyFromInvitation: true,
    providerStandingStructurallyDeclared: true,
    standingGrantReferenceStructurallyAccepted: true,
    standingCapacityEstablished: false,
    standingCapacityActive: false,
    trustedLifecycleHeadVerified: false,
    capacityReservedForAnyTender: false,
    signatureCryptographicallyVerified: false,
    signerLegalIdentityEstablished: false,
    legalAuthorityEstablished: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return seal(OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrant,
    "capacityGrantHash", body);
}

const GRANT_RECORD_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "capacityGrantInvitationHash",
  "sourceTenderHash", "sourceProviderAcceptanceHash", "inviterRefHash",
  "providerRefHash", "scopeHash", "capacityTermsHash", "safetyEnvelopeHash",
  "evidencePlanHash", "remedyPlanHash", "validFrom", "validUntil",
  "acceptedAt", "grantNonceHash", "response", "signatureRefHash",
  "explicitSeparateOptInObserved", "silenceAccepted",
  "completionAutoEnrollmentUsed", "scopeCopiedExactlyFromInvitation",
  "scopeExpansionAllowed", "safetyEnvelopeCopiedExactlyFromInvitation",
  "providerStandingStructurallyDeclared",
  "standingGrantReferenceStructurallyAccepted", "standingCapacityEstablished",
  "standingCapacityActive", "trustedLifecycleHeadVerified",
  "capacityReservedForAnyTender", "signatureCryptographicallyVerified",
  "signerLegalIdentityEstablished", "legalAuthorityEstablished", "authority",
  "actionReady", "executable", "capacityGrantHash",
]);

function grantInputFromRecord(value, invitation) {
  return {
    invitation,
    acceptedAt: value.acceptedAt,
    grantNonceHash: value.grantNonceHash,
    response: value.response,
    signatureRefHash: value.signatureRefHash,
  };
}

function verifyGrantRecord(value, invitation) {
  exactObject(value, GRANT_RECORD_FIELDS, "CAPACITY_GRANT");
  const rebuilt = acceptStandingCapacityGrantV1(
    grantInputFromRecord(value, invitation));
  if (!same(value, rebuilt)) fail("CAPACITY_GRANT_DERIVATION_INVALID");
  return rebuilt;
}

const REVOCATION_INPUT_FIELDS = ObjectFreeze([
  "capacityGrant",
  "invitation",
  "revokedAt",
  "reasonCode",
  "revocationNonceHash",
  "response",
  "signatureRefHash",
]);

export function revokeStandingCapacityGrantV1(input) {
  exactObject(input, REVOCATION_INPUT_FIELDS, "CAPACITY_GRANT_REVOCATION_INPUT");
  const invitation = verifyInvitationRecord(input.invitation);
  const grant = verifyGrantRecord(input.capacityGrant, invitation);
  const revokedAt = iso(input.revokedAt, "CAPACITY_GRANT_REVOKED_AT");
  if (DateParse(revokedAt) < DateParse(grant.acceptedAt)) {
    fail("CAPACITY_GRANT_REVOKED_BEFORE_ACCEPTANCE");
  }
  requireLiteral(input.response, "REVOKE",
    "CAPACITY_GRANT_EXPLICIT_REVOKE_REQUIRED");
  const revocationNonceHash = hash(input.revocationNonceHash,
    "CAPACITY_GRANT_REVOCATION_NONCE_HASH");
  if (revocationNonceHash === grant.grantNonceHash
    || revocationNonceHash === invitation.invitationNonceHash) {
    fail("CAPACITY_GRANT_REVOCATION_NONCE_MUST_BE_DISTINCT");
  }
  const body = {
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrantRevocation,
    schemaVersion: "1.0.0",
    recordClass: "EXPLICIT_PROVIDER_STANDING_CAPACITY_REVOCATION",
    capacityGrantHash: grant.capacityGrantHash,
    capacityGrantInvitationHash: invitation.capacityGrantInvitationHash,
    providerRefHash: grant.providerRefHash,
    scopeHash: grant.scopeHash,
    revokedAt,
    reasonCode: oneOf(input.reasonCode,
      OUTSIDER_ONE_USE_COMMITMENTS_V1_REVOCATION_REASONS,
      "CAPACITY_GRANT_REVOCATION_REASON"),
    revocationNonceHash,
    response: "REVOKE",
    signatureRefHash: nullableHash(input.signatureRefHash,
      "CAPACITY_GRANT_REVOCATION_SIGNATURE_REF_HASH"),
    explicitRevocationObserved: true,
    silenceAccepted: false,
    scopeExpansionAllowed: false,
    standingCapacityActive: false,
    capacityReservedForAnyTender: false,
    signatureCryptographicallyVerified: false,
    signerLegalIdentityEstablished: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return seal(
    OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrantRevocation,
    "capacityGrantRevocationHash", body);
}

const REVOCATION_RECORD_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "capacityGrantHash",
  "capacityGrantInvitationHash", "providerRefHash", "scopeHash", "revokedAt",
  "reasonCode", "revocationNonceHash", "response", "signatureRefHash",
  "explicitRevocationObserved", "silenceAccepted", "scopeExpansionAllowed",
  "standingCapacityActive", "capacityReservedForAnyTender",
  "signatureCryptographicallyVerified", "signerLegalIdentityEstablished",
  "authority", "actionReady", "executable", "capacityGrantRevocationHash",
]);

function revocationInputFromRecord(value, invitation, capacityGrant) {
  return {
    capacityGrant,
    invitation,
    revokedAt: value.revokedAt,
    reasonCode: value.reasonCode,
    revocationNonceHash: value.revocationNonceHash,
    response: value.response,
    signatureRefHash: value.signatureRefHash,
  };
}

function verifyRevocationRecord(value, invitation, capacityGrant) {
  exactObject(value, REVOCATION_RECORD_FIELDS, "CAPACITY_GRANT_REVOCATION");
  const rebuilt = revokeStandingCapacityGrantV1(
    revocationInputFromRecord(value, invitation, capacityGrant));
  if (!same(value, rebuilt)) fail("CAPACITY_GRANT_REVOCATION_DERIVATION_INVALID");
  return rebuilt;
}

function capacityGrantFailure(error) {
  const message = error instanceof ErrorConstructor
    ? error.message : "OUTSIDER_ONE_USE_COMMITMENTS_V1_UNKNOWN_FAILURE";
  return deepFreeze({
    schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrantVerification,
    ok: false,
    invitationStructurallyVerified: false,
    separateExplicitOptInVerified: false,
    scopeBoundedToInvitation: false,
    safetyEnvelopeBoundedToInvitation: false,
    completionAutoEnrollmentUsed: false,
    standingGrantReferenceStructurallyActive: false,
    standingCapacityEstablished: false,
    standingCapacityActive: false,
    trustedLifecycleHeadVerified: false,
    capacityReservedForAnyTender: false,
    authorityEstablished: false,
    standingCapacityState: "REJECTED_FAIL_CLOSED",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: message,
    boundary: OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY,
  });
}

const GRANT_VERIFY_FIELDS = ObjectFreeze([
  "expectedScopeHash",
  "invitation",
  "capacityGrant",
  "revocation",
  "observedAt",
]);

export function verifyStandingCapacityGrantV1(input) {
  try {
    exactObject(input, GRANT_VERIFY_FIELDS, "CAPACITY_GRANT_VERIFY_INPUT");
    const expectedScopeHash = hash(input.expectedScopeHash,
      "CAPACITY_GRANT_EXPECTED_SCOPE_HASH");
    const invitation = verifyInvitationRecord(input.invitation);
    const observedAt = iso(input.observedAt, "CAPACITY_GRANT_OBSERVED_AT");
    if (invitation.scopeHash !== expectedScopeHash) {
      fail("CAPACITY_GRANT_EXPECTED_SCOPE_MISMATCH");
    }
    if (input.capacityGrant === null) {
      return deepFreeze({
        schema:
          OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrantVerification,
        ok: true,
        invitationStructurallyVerified: true,
        capacityGrantInvitationHash: invitation.capacityGrantInvitationHash,
        capacityGrantHash: null,
        capacityGrantRevocationHash: null,
        providerRefHash: invitation.providerRefHash,
        scopeHash: invitation.scopeHash,
        separateExplicitOptInVerified: false,
        silenceAccepted: false,
        scopeBoundedToInvitation: true,
        safetyEnvelopeBoundedToInvitation: true,
        completionAutoEnrollmentUsed: false,
        standingGrantReferenceStructurallyActive: false,
        standingCapacityEstablished: false,
        standingCapacityActive: false,
        trustedLifecycleHeadVerified: false,
        capacityReservedForAnyTender: false,
        signatureCryptographicallyVerified: false,
        legalIdentityEstablished: false,
        authorityEstablished: false,
        standingCapacityState: DateParse(observedAt) >= DateParse(invitation.expiresAt)
          ? "INVITATION_EXPIRED_WITHOUT_ACCEPTANCE"
          : "INVITED_AWAITING_SEPARATE_EXPLICIT_OPT_IN",
        decisionState: "HOLD",
        authority: "NONE",
        actionReady: false,
        executable: false,
        error: null,
        boundary: OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY,
      });
    }
    const grant = verifyGrantRecord(input.capacityGrant, invitation);
    if (DateParse(observedAt) < DateParse(grant.acceptedAt)) {
      fail("CAPACITY_GRANT_NOT_YET_ACCEPTED");
    }
    let revocation = null;
    if (input.revocation !== null) {
      revocation = verifyRevocationRecord(input.revocation, invitation, grant);
      if (DateParse(revocation.revokedAt) > DateParse(observedAt)) {
        fail("CAPACITY_GRANT_REVOCATION_FROM_FUTURE");
      }
    }
    const expired = DateParse(observedAt) < DateParse(grant.validFrom)
      || DateParse(observedAt) >= DateParse(grant.validUntil);
    const standingGrantReferenceStructurallyActive
      = revocation === null && !expired;
    return deepFreeze({
      schema: OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.capacityGrantVerification,
      ok: true,
      invitationStructurallyVerified: true,
      capacityGrantInvitationHash: invitation.capacityGrantInvitationHash,
      capacityGrantHash: grant.capacityGrantHash,
      capacityGrantRevocationHash:
        revocation === null ? null : revocation.capacityGrantRevocationHash,
      providerRefHash: grant.providerRefHash,
      scopeHash: grant.scopeHash,
      separateExplicitOptInVerified: true,
      silenceAccepted: false,
      scopeBoundedToInvitation: true,
      safetyEnvelopeBoundedToInvitation: true,
      completionAutoEnrollmentUsed: false,
      standingGrantReferenceStructurallyActive,
      standingCapacityEstablished: false,
      standingCapacityActive: false,
      trustedLifecycleHeadVerified: false,
      capacityReservedForAnyTender: false,
      signatureCryptographicallyVerified: false,
      legalIdentityEstablished: false,
      authorityEstablished: false,
      standingCapacityState: revocation !== null
        ? "REVOKED"
        : expired ? "NOT_CURRENT" : "ACTIVE_STRUCTURAL_GRANT_REFERENCE",
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      error: null,
      boundary: OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY,
    });
  } catch (error) {
    return capacityGrantFailure(error);
  }
}

/* Explicit aliases keep the public vocabulary discoverable without changing
 * any existing index or frozen export surface. */
export const createOwnerMandateV1 = createOwnerOneUseMandateV1;
export const createProviderAcceptanceV1 = createProviderOneUseAcceptanceV1;
export const createCapacityReservationReceiptBindingV1
  = createExternalCapacityReservationReceiptBindingV1;
export const createExternalCapacityReceiptReferenceV1
  = createExternalCapacityReservationReceiptBindingV1;
export const verifyOutsiderOneUseCommitmentsV1 = verifyOneUseCommitmentsV1;
export const verifyOneUseCommitmentReferencesV1 = verifyOneUseCommitmentsV1;
export const createCapacityGrantInvitationV1
  = createStandingCapacityGrantInvitationV1;
export const acceptCapacityGrantV1 = acceptStandingCapacityGrantV1;
export const revokeCapacityGrantV1 = revokeStandingCapacityGrantV1;
export const verifyCapacityGrantV1 = verifyStandingCapacityGrantV1;
export const verifyStandingCapacityGrantReferenceV1
  = verifyStandingCapacityGrantV1;
