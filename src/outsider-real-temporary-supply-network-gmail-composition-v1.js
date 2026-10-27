/*
 * Real temporary supply-network composition v1.
 *
 * The caller supplies one frozen Outcome Tender, one requester contact grant,
 * and exactly three already-selected candidates.  This module discovers
 * nothing.  In explicit LIVE mode it creates two registration-free response
 * links, sends the primary and recovery tenders through two factory-issued
 * account-native Gmail journals, and polls the authenticated response source.
 * A hosted response is replayed as an occurrence.  It is never promoted into
 * provider identity, provider authority, capacity, price, or COMMIT.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  claimCloudflareOneUseTenderResponseLinkSourceV1,
  inspectCloudflareOneUseTenderResponseLinkAccountNativeClientV1,
} from "./outsider-cloudflare-one-use-tender-response-link-account-native-client-v1.js";
import { inspectGmailAccountNativeMailboxTransportV1 }
  from "./outsider-gmail-account-native-mailbox-transport-v1.js";
import {
  OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1,
  createInitialOneUseTenderResponseV1,
  createOneUseTenderResponseOccurrenceV1,
  verifyOneUseTenderResponseLifecycleV1,
} from "./outsider-one-use-tender-response-lifecycle-v1.js";
import { createOutcomeFormationEvaluationV1 }
  from "./outsider-outcome-formation-engine-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_REAL_TEMPORARY_SUPPLY_NETWORK_GMAIL_COMPOSITION_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const FORMATION_ID = /^formation_[a-f0-9]{32}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u;
const ROLES = Object.freeze(["primary", "recovery"]);
const MAX_SOURCE_BYTES = 256 * 1024;

export const OUTSIDER_REAL_TEMPORARY_SUPPLY_NETWORK_GMAIL_COMPOSITION_V1_BOUNDARY
  = Object.freeze({
    position: "REAL_TWO_ROUTE_GMAIL_TENDER_AND_RESPONSE_REPLAY_HOLD",
    providerRegistryCreated: false,
    discoveryPerformed: false,
    candidatesMustBeCallerSupplied: true,
    sellerRegistrationRequired: false,
    primaryAndRecoveryResponseLinksRequired: true,
    accountNativeGmailRequired: true,
    dryRunDefault: true,
    explicitLiveModeRequired: true,
    serverAcknowledgementIsAcceptance: false,
    deliveryIsAcceptance: false,
    hostedResponseIsProviderIdentity: false,
    hostedResponseIsResourceOwnerAuthority: false,
    hostedOfferIsCapacity: false,
    witnessCandidateIsWitnessReadiness: false,
    providerAcceptanceEstablished: false,
    capacityReserved: false,
    userOutcomePromiseIssued: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    zeroInternalOpsRequired: true,
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

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || Buffer.isBuffer(value)) return value;
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function requirement(tender, kind, id) {
  const details = kind === "RESOURCE"
    ? [tender.resourceRequirements.items, "resourceRequirementId",
      "requiredBy", "quantity", "unitCode"]
    : kind === "RECOVERY"
      ? [tender.recoveryRequirements.items, "recoveryRequirementId",
        "completionDeadline", null, null]
      : [tender.evidenceRequirements.items, "evidenceRequirementId",
        "dueBy", null, null];
  const item = details[0].find((candidate) => candidate[details[1]] === id);
  if (item === undefined) fail("CANDIDATE_REQUIREMENT_NOT_IN_TENDER");
  return { item, dueBy: item[details[2]],
    quantity: details[3] === null ? 1 : item[details[3]],
    unitCode: details[4] === null ? "REQUIREMENT" : item[details[4]] };
}

function recipient(value, code) {
  if (typeof value !== "string" || value.length > 254 || !EMAIL.test(value)
    || /[\u0000\r\n]/u.test(value)) fail(code);
  return value;
}

function recipientHash(value) {
  return digest("outsider/real-temporary-network-recipient/v1",
    value.toLowerCase());
}

function candidate(value, role, tender) {
  exact(value, ["requirementKind", "requirementId", "candidateRefHash",
    "providerRefHash", "discoveryRouteObjectHash", "discoveryCandidateHash",
    "recipient"], `${role.toUpperCase()}_CANDIDATE_INVALID`);
  const expectedKind = role === "primary" ? "RESOURCE"
    : role === "recovery" ? "RECOVERY" : "EVIDENCE";
  if (value.requirementKind !== expectedKind) fail("CANDIDATE_ROLE_KIND_MISMATCH");
  requirement(tender, value.requirementKind, value.requirementId);
  for (const field of ["candidateRefHash", "providerRefHash",
    "discoveryRouteObjectHash", "discoveryCandidateHash"]) {
    hash(value[field], `${role.toUpperCase()}_${field.toUpperCase()}`);
  }
  const address = role === "witness" ? value.recipient === null
    ? null : fail("WITNESS_RECIPIENT_MUST_BE_NULL")
    : recipient(value.recipient, `${role.toUpperCase()}_RECIPIENT_INVALID`);
  return { ...value, recipient: address,
    recipientAddressHash: address === null ? null : recipientHash(address) };
}

function definition(value, role, route, tender) {
  exact(value, ["tenderHash", "requirementKind", "requirementId", "issuedAt",
    "expiresAt", "summary", "acceptedCurrencyCodes",
    "responsibilityTermsText", "responsibilityTermsHash"],
  `${role.toUpperCase()}_LINK_DEFINITION_INVALID`);
  exact(value.summary, ["title", "outcome", "quantity", "dueBy",
    "supplierInstructions"], `${role.toUpperCase()}_LINK_SUMMARY_INVALID`);
  const required = requirement(tender, route.requirementKind,
    route.requirementId);
  if (value.tenderHash !== tender.tenderHash
    || value.requirementKind !== route.requirementKind
    || value.requirementId !== route.requirementId
    || value.summary.dueBy !== required.dueBy) {
    fail("LINK_DEFINITION_TENDER_BINDING_MISMATCH");
  }
  instant(value.issuedAt, "LINK_ISSUED_AT_INVALID");
  instant(value.expiresAt, "LINK_EXPIRES_AT_INVALID");
  hash(value.responsibilityTermsHash, "RESPONSIBILITY_TERMS_HASH_INVALID");
  if (byteHash(Buffer.from(value.responsibilityTermsText, "utf8"))
      !== value.responsibilityTermsHash) fail("RESPONSIBILITY_TERMS_HASH_MISMATCH");
  if (!Array.isArray(value.acceptedCurrencyCodes)
    || value.acceptedCurrencyCodes.length < 1) fail("CURRENCY_CODES_INVALID");
  return value;
}

function normalizedInput(input) {
  exact(input, ["formationId", "plannedAt", "tender", "expectedTenderHash",
    "ownerMandate", "contactAuthority", "candidates",
    "responseLinkDefinitions", "tenderTexts", "effectDeadline",
    "employeeTouchCount", "foundationBindings"], "INPUT_INVALID");
  if (typeof input.formationId !== "string"
    || !FORMATION_ID.test(input.formationId)) fail("FORMATION_ID_INVALID");
  instant(input.plannedAt, "PLANNED_AT_INVALID");
  hash(input.expectedTenderHash, "EXPECTED_TENDER_HASH_INVALID");
  const verified = verifyOutsiderOutcomeTenderV1(input.tender,
    { expectedTenderHash: input.expectedTenderHash });
  if (!verified.ok || verified.expectedHashMatched !== true
    || verified.zeroInternalOpsVerified !== true) fail("TENDER_REPLAY_FAILED");
  exact(input.candidates, ["primary", "recovery", "witness"],
    "CANDIDATES_INVALID");
  const candidates = {
    primary: candidate(input.candidates.primary, "primary", input.tender),
    recovery: candidate(input.candidates.recovery, "recovery", input.tender),
    witness: candidate(input.candidates.witness, "witness", input.tender),
  };
  if (new Set(Object.values(candidates)
    .map((value) => value.candidateRefHash)).size !== 3) {
    fail("CANDIDATE_ROLES_MUST_BE_DISTINCT");
  }
  exact(input.responseLinkDefinitions, ROLES,
    "RESPONSE_LINK_DEFINITIONS_INVALID");
  const responseLinkDefinitions = {
    primary: definition(input.responseLinkDefinitions.primary, "primary",
      candidates.primary, input.tender),
    recovery: definition(input.responseLinkDefinitions.recovery, "recovery",
      candidates.recovery, input.tender),
  };
  exact(input.tenderTexts, ROLES, "TENDER_TEXTS_INVALID");
  for (const role of ROLES) {
    if (typeof input.tenderTexts[role] !== "string"
      || input.tenderTexts[role].length < 1
      || /(^|[^\r])\n/u.test(input.tenderTexts[role])
      || /\r(?!\n)/u.test(input.tenderTexts[role])) fail("TENDER_TEXT_INVALID");
  }
  const effectDeadline = instant(input.effectDeadline,
    "EFFECT_DEADLINE_INVALID");
  if (Date.parse(effectDeadline) > Date.parse(input.tender.formationDeadline)
    || ROLES.some((role) => Date.parse(responseLinkDefinitions[role].expiresAt)
      > Date.parse(effectDeadline))) fail("FORMATION_WINDOW_EXCEEDED");
  if (!Number.isSafeInteger(input.employeeTouchCount)
    || input.employeeTouchCount < 0) fail("EMPLOYEE_TOUCH_COUNT_INVALID");
  const authority = input.contactAuthority;
  exact(authority, ["tenderHash", "authorityGrantHash", "sourceReplayHash",
    "validFrom", "validUntil", "allowedContactBindings"],
  "CONTACT_AUTHORITY_INVALID");
  if (authority.tenderHash !== input.tender.tenderHash) {
    fail("CONTACT_AUTHORITY_TENDER_MISMATCH");
  }
  hash(authority.authorityGrantHash, "AUTHORITY_GRANT_HASH_INVALID");
  hash(authority.sourceReplayHash, "AUTHORITY_SOURCE_REPLAY_HASH_INVALID");
  instant(authority.validFrom, "AUTHORITY_VALID_FROM_INVALID");
  instant(authority.validUntil, "AUTHORITY_VALID_UNTIL_INVALID");
  if (!Array.isArray(authority.allowedContactBindings)
    || authority.allowedContactBindings.length !== 2) {
    fail("AUTHORITY_CONTACT_BINDINGS_INVALID");
  }
  for (const role of ROLES) {
    const matches = authority.allowedContactBindings.filter((entry) =>
      entry?.role === role
      && entry.candidateRefHash === candidates[role].candidateRefHash
      && entry.recipientAddressHash === candidates[role].recipientAddressHash);
    if (matches.length !== 1) fail("AUTHORITY_CONTACT_BINDING_MISSING");
  }
  return { ...input, candidates, responseLinkDefinitions, effectDeadline,
    planHash: digest(
      "outsider/real-temporary-supply-network-gmail-plan/v1", {
        formationId: input.formationId,
        tenderHash: input.tender.tenderHash,
        contactAuthorityHash: digest(
          "outsider/requester-contact-authority-snapshot/v1", authority),
        candidateBindings: Object.fromEntries(Object.entries(candidates)
          .map(([role, value]) => [role, {
            requirementKind: value.requirementKind,
            requirementId: value.requirementId,
            candidateRefHash: value.candidateRefHash,
            providerRefHash: value.providerRefHash,
            discoveryRouteObjectHash: value.discoveryRouteObjectHash,
            discoveryCandidateHash: value.discoveryCandidateHash,
            recipientAddressHash: value.recipientAddressHash,
          }])),
        linkDefinitionHashes: Object.fromEntries(ROLES.map((role) => [role,
          digest("outsider/one-use-response-link-request/v1",
            responseLinkDefinitions[role])])),
        effectDeadline,
      }),
  };
}

function blankAssertions() {
  return { capacityReceiptAuthentic: false, externalTrustEstablished: false,
    authorityEstablished: false, riskCapitalEstablished: false,
    custodyEstablished: false, adjudicationEstablished: false,
    independentWitnessEstablished: false, rightsPrivacyCleared: false,
    actionReady: false, priceAuthorityEstablished: false,
    guaranteeAuthorityEstablished: false,
    settlementAuthorityEstablished: false };
}

function formation(input, observedAt) {
  const result = createOutcomeFormationEvaluationV1({
    formationId: input.formationId,
    evaluatedAt: observedAt,
    expectedTenderHash: input.expectedTenderHash,
    tender: input.tender,
    ownerMandate: input.ownerMandate,
    providerAcceptance: null,
    capacityReservationReceipt: null,
    consumedNonceHashes: [],
    foundationBindings: input.foundationBindings,
    untrustedCallerAssertions: blankAssertions(),
  });
  return { formationEvaluationHash: result.formationEvaluationHash,
    formationState: result.primaryState,
    formationDecisionState: result.decisionState,
    providerAcceptancePresent: result.oneUseAssessment.providerAcceptancePresent,
    capacityReceiptPresent:
      result.oneUseAssessment.capacityReservationReceiptPresent };
}

function publicCandidate(role, candidateValue) {
  return { role, requirementKind: candidateValue.requirementKind,
    requirementId: candidateValue.requirementId,
    candidateRefHash: candidateValue.candidateRefHash,
    providerRefHash: candidateValue.providerRefHash,
    discoveryRouteObjectHash: candidateValue.discoveryRouteObjectHash,
    discoveryCandidateHash: candidateValue.discoveryCandidateHash,
    recipientAddressHash: candidateValue.recipientAddressHash };
}

function projection(input, observedAt, state, routeStates, formationState,
  extra = {}) {
  const body = {
    schema: "outsider/real-temporary-supply-network-gmail-composition/v1",
    schemaVersion: "1.0.0",
    formationId: input.formationId,
    tenderHash: input.tender.tenderHash,
    planHash: input.planHash,
    observedAt,
    state,
    candidates: [publicCandidate("primary", input.candidates.primary),
      publicCandidate("recovery", input.candidates.recovery),
      publicCandidate("witness", input.candidates.witness)],
    routes: routeStates,
    employeeTouchCount: input.employeeTouchCount,
    zeroInternalOpsSatisfied: input.employeeTouchCount === 0,
    discoveryPerformed: false,
    sellerRegistrationRequired: false,
    serverAcknowledgementIsAcceptance: false,
    deliveryIsAcceptance: false,
    responseOccurrenceOnly: true,
    providerIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false,
    primaryCapacityReserved: false,
    recoveryCapacityReserved: false,
    independentWitnessEstablished: false,
    userOutcomePromiseIssued: false,
    priceEstablished: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    formation: formationState,
    authority: "NONE",
    decisionState: "HOLD",
    ...extra,
    boundary:
      OUTSIDER_REAL_TEMPORARY_SUPPLY_NETWORK_GMAIL_COMPOSITION_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, compositionHash: digest(body.schema, body) });
}

function dryRoutes(input) {
  return ROLES.map((role) => ({ role,
    requirementKind: input.candidates[role].requirementKind,
    requirementId: input.candidates[role].requirementId,
    candidateRefHash: input.candidates[role].candidateRefHash,
    linkState: "NOT_CREATED_DRY_RUN",
    deliveryState: "NOT_SENT_DRY_RUN",
    responseState: "NOT_POLLED_DRY_RUN",
    lifecycleVerificationHash: null,
    capacityReserved: false }));
}

function authorityResult(value, input, route, phase) {
  exact(value, ["decision", "evaluatedAt", "validUntil", "sourceBytes"],
    "CONTACT_AUTHORITY_REVALIDATION_RESULT_INVALID");
  const evaluatedAt = instant(value.evaluatedAt,
    "CONTACT_AUTHORITY_EVALUATED_AT_INVALID");
  const validUntil = value.validUntil === null ? null
    : instant(value.validUntil, "CONTACT_AUTHORITY_RESULT_EXPIRY_INVALID");
  if (!Buffer.isBuffer(value.sourceBytes) || value.sourceBytes.length < 1
    || value.sourceBytes.length > MAX_SOURCE_BYTES
    || byteHash(value.sourceBytes) !== input.contactAuthority.sourceReplayHash
    || !["AUTHORIZED", "REVOKED"].includes(value.decision)
    || (value.decision === "REVOKED" && validUntil !== null)
    || (value.decision === "AUTHORIZED"
      && (validUntil !== input.contactAuthority.validUntil
        || Date.parse(evaluatedAt) < Date.parse(input.contactAuthority.validFrom)
        || Date.parse(evaluatedAt) >= Date.parse(validUntil)))) {
    fail("CONTACT_AUTHORITY_REVALIDATION_RESULT_INVALID");
  }
  return { phase, role: route.role, decision: value.decision, evaluatedAt,
    validUntil, sourceReplayHash: byteHash(value.sourceBytes) };
}

async function revalidateAll(input, dependencies, phase) {
  const results = await Promise.all(ROLES.map(async (role) => {
    const route = { role, ...input.candidates[role] };
    let value;
    try {
      value = await dependencies.revalidateContactAuthority(Object.freeze({
        phase,
        tenderHash: input.tender.tenderHash,
        authorityGrantHash: input.contactAuthority.authorityGrantHash,
        candidateRefHash: route.candidateRefHash,
        recipient: route.recipient,
        recipientAddressHash: route.recipientAddressHash,
        effectDeadline: input.effectDeadline,
      }));
    } catch { fail("CONTACT_AUTHORITY_REVALIDATION_FAILED"); }
    return authorityResult(value, input, route, phase);
  }));
  return results.every((value) => value.decision === "AUTHORIZED");
}

async function revokeInitialized(input, clients, initialized) {
  await Promise.allSettled(ROLES.filter((role) => initialized.has(role))
    .map((role) => clients[role].revokeExact({
      expectedTenderHash: input.tender.tenderHash,
      reasonCode: "POLICY_REVOKED",
    })));
}

function parseSourceEvent(input, role, privateSource, initProjection) {
  const bytes = privateSource.sellerSourceBytes;
  const event = privateSource.persistedEvent;
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_SOURCE_BYTES
    || event === null || typeof event !== "object"
    || event.tenderHash !== input.tender.tenderHash
    || event.definitionHash !== initProjection.definitionHash
    || event.sourceBodyHash !== byteHash(bytes)
    || event.sourceByteLength !== bytes.length
    || event.ordinal !== 2 || event.eventType !== "RESPONSE_OFFERED"
    || event.privatePayload === null
    || event.privatePayload.sourceBodyBase64 !== bytes.toString("base64")) {
    fail("SELLER_SOURCE_EVENT_INVALID");
  }
  const eventBody = { ...event };
  delete eventBody.eventHash;
  if (digest(event.schema, eventBody) !== event.eventHash) {
    fail("SELLER_SOURCE_EVENT_HASH_INVALID");
  }
  let raw;
  try {
    if (event.privatePayload.contentType === "application/json") {
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } else if (event.privatePayload.contentType
      === "application/x-www-form-urlencoded") {
      const params = new URLSearchParams(new TextDecoder("utf-8",
        { fatal: true }).decode(bytes));
      raw = Object.fromEntries(params.entries());
    } else fail("SELLER_SOURCE_CONTENT_TYPE_INVALID");
  } catch (error) {
    if (error?.outsiderCode !== undefined) throw error;
    fail("SELLER_SOURCE_PARSE_FAILED");
  }
  if (raw?.choice !== "OFFER" || raw.tenderHash !== input.tender.tenderHash) {
    fail("SELLER_SOURCE_NOT_OFFER");
  }
  const normalized = event.privatePayload.normalizedResponse;
  if (normalized?.choice !== "OFFER"
    || normalized.responsibility?.accepted !== true
    || normalized.responsibility.termsHash
      !== input.responseLinkDefinitions[role].responsibilityTermsHash) {
    fail("SELLER_SOURCE_NORMALIZED_BINDING_INVALID");
  }
  if (event.privatePayload.contentType === "application/json") {
    if (canonicalizeStrict(raw) !== canonicalizeStrict({
      tenderHash: input.tender.tenderHash,
      choice: "OFFER",
      quote: normalized.quote,
      serviceWindow: normalized.serviceWindow,
      offerExpiresAt: normalized.offerExpiresAt,
      responsibility: normalized.responsibility,
    })) fail("SELLER_SOURCE_NORMALIZED_MISMATCH");
  }
  return { event, normalized, sourceBodyHash: byteHash(bytes) };
}

function lifecycleFromOffer(input, role, source, observedAt) {
  const route = input.candidates[role];
  const required = requirement(input.tender, route.requirementKind,
    route.requirementId);
  const response = createInitialOneUseTenderResponseV1({
    tender: input.tender,
    expectedTenderHash: input.tender.tenderHash,
    providerRefHash: route.providerRefHash,
    discoveryRouteObjectHash: route.discoveryRouteObjectHash,
    discoveryCandidateHash: route.discoveryCandidateHash,
    requirementKind: route.requirementKind,
    requirementId: route.requirementId,
    quantity: required.quantity,
    unitCode: required.unitCode,
    serviceFrom: source.normalized.serviceWindow.from,
    serviceUntil: source.normalized.serviceWindow.until,
    responseState: "OFFERED",
    stateAt: source.event.recordedAt,
    expiresAt: source.normalized.offerExpiresAt,
    reasonCode: "ONE_USE_OFFER_CREATED",
    responseNonceHash: digest(
      "outsider/cloudflare-hosted-offer-response-nonce/v1", {
        role, eventHash: source.event.eventHash,
      }),
    sourceResponseRefHash: source.sourceBodyHash,
  });
  const occurrence = createOneUseTenderResponseOccurrenceV1({
    response,
    ordinal: 1,
    previousOccurrenceHash:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1,
    recordedAt: source.event.recordedAt,
    occurrenceNonceHash: digest(
      "outsider/cloudflare-hosted-offer-occurrence-nonce/v1", {
        role, eventHash: source.event.eventHash,
      }),
  });
  const verification = verifyOneUseTenderResponseLifecycleV1({
    tender: input.tender,
    expectedTenderHash: input.tender.tenderHash,
    responses: [response],
    occurrences: [occurrence],
    expectedOccurrenceCount: 1,
    expectedLifecycleHeadHash: occurrence.occurrenceHash,
    observedAt,
  });
  if (!verification.ok) fail("OFFER_LIFECYCLE_REPLAY_FAILED");
  return { responseHash: response.responseHash,
    lifecycleHeadHash: occurrence.occurrenceHash,
    lifecycleVerificationHash: verification.verificationHash,
    declaredCommercialTermsHash: digest(
      "outsider/cloudflare-hosted-offer-declared-commercial-terms/v1",
      source.normalized.quote) };
}

function liveDependencies(value) {
  exact(value, ["responseLinkClients", "gmailTransports",
    "revalidateContactAuthority", "clock"], "LIVE_DEPENDENCIES_INVALID");
  exact(value.responseLinkClients, ROLES, "RESPONSE_LINK_CLIENTS_INVALID");
  exact(value.gmailTransports, ROLES, "GMAIL_TRANSPORTS_INVALID");
  if (typeof value.revalidateContactAuthority !== "function"
    || typeof value.clock !== "function") fail("LIVE_DEPENDENCY_INVALID");
  for (const role of ROLES) {
    inspectCloudflareOneUseTenderResponseLinkAccountNativeClientV1(
      value.responseLinkClients[role]);
    inspectGmailAccountNativeMailboxTransportV1(value.gmailTransports[role]);
  }
  if (value.responseLinkClients.primary.clientBindingHash
      === value.responseLinkClients.recovery.clientBindingHash
    || value.gmailTransports.primary.transportBindingHash
      === value.gmailTransports.recovery.transportBindingHash) {
    fail("PRIMARY_RECOVERY_JOURNALS_MUST_BE_DISTINCT");
  }
  return value;
}

function now(dependencies) {
  let value;
  try { value = dependencies.clock(); } catch { fail("CLOCK_FAILED"); }
  return instant(value, "CLOCK_INVALID");
}

/**
 * Run one bounded pass.  DRY_RUN performs no I/O.  LIVE is explicit and polls
 * each source once; another process invocation may safely reuse child journals.
 */
export async function runRealTemporarySupplyNetworkGmailCompositionV1(
  source = {}, dependencies = {}, options = { mode: "DRY_RUN" }) {
  exact(options, ["mode"], "OPTIONS_INVALID");
  if (!['DRY_RUN', 'LIVE'].includes(options.mode)) fail("MODE_INVALID");
  const input = normalizedInput(source);
  const dryFormation = formation(input, input.plannedAt);
  if (options.mode === "DRY_RUN") {
    return projection(input, input.plannedAt, "DRY_RUN_HOLD",
      dryRoutes(input), dryFormation, { externalMutationCount: 0,
        nextAction: "EXPLICIT_LIVE_MODE_WITH_ACCOUNT_NATIVE_CAPABILITIES" });
  }
  if (input.employeeTouchCount !== 0) {
    return projection(input, input.plannedAt,
      "EMPLOYEE_TOUCH_DISQUALIFIED_HOLD", dryRoutes(input), dryFormation, {
        externalMutationCount: 0, nextAction: "UNAVAILABLE" });
  }
  const deps = liveDependencies(dependencies);
  const startedAt = now(deps);
  if (Date.parse(startedAt) >= Date.parse(input.effectDeadline)
    || Date.parse(startedAt) >= Date.parse(input.tender.formationDeadline)) {
    return projection(input, startedAt, "FORMATION_WINDOW_CLOSED_HOLD",
      dryRoutes(input), formation(input, startedAt), {
        externalMutationCount: 0, nextAction: "UNAVAILABLE" });
  }
  if (!await revalidateAll(input, deps, "ADMISSION")) {
    const at = now(deps);
    return projection(input, at, "CONTACT_AUTHORITY_UNAVAILABLE_HOLD",
      dryRoutes(input), formation(input, at), {
        externalMutationCount: 0, nextAction: "UNAVAILABLE" });
  }

  const initialized = new Set();
  const initResults = await Promise.allSettled(ROLES.map(async (role) => {
    const result = await deps.responseLinkClients[role].initializeExact({
      definition: input.responseLinkDefinitions[role],
    });
    if (result.publicProjection.state !== "LINK_INITIALIZED_HOLD") {
      throw new Error("LINK_NOT_INITIALIZED");
    }
    initialized.add(role);
    return result;
  }));
  if (initResults.some((result) => result.status !== "fulfilled")) {
    await revokeInitialized(input, deps.responseLinkClients, initialized);
    const at = now(deps);
    return projection(input, at, "RESPONSE_LINK_PAIR_UNAVAILABLE_HOLD",
      dryRoutes(input), formation(input, at), {
        externalMutationCount: initialized.size, nextAction: "UNAVAILABLE" });
  }
  const initByRole = Object.fromEntries(ROLES.map((role, index) =>
    [role, initResults[index].value.publicProjection]));
  const bodies = Object.fromEntries(ROLES.map((role) => [role,
    deps.responseLinkClients[role].composeGmailTenderBodyExact({
      expectedTenderHash: input.tender.tenderHash,
      tenderText: input.tenderTexts[role],
    })]));
  if (!await revalidateAll(input, deps, "BEFORE_SEND")) {
    await revokeInitialized(input, deps.responseLinkClients, initialized);
    const at = now(deps);
    return projection(input, at, "CONTACT_AUTHORITY_REVOKED_BEFORE_SEND_HOLD",
      dryRoutes(input), formation(input, at), {
        externalMutationCount: 4, nextAction: "UNAVAILABLE" });
  }
  const deliveryResults = await Promise.allSettled(ROLES.map((role) => {
    const body = bodies[role];
    const tenderBodyHash = byteHash(body);
    const transactionBindingHash = digest(
      "outsider/real-temporary-network-gmail-transaction/v1", {
        planHash: input.planHash, role,
        candidateRefHash: input.candidates[role].candidateRefHash,
        tenderBodyHash,
      });
    return deps.gmailTransports[role].deliverExact({
      recipient: input.candidates[role].recipient,
      candidateRefHash: input.candidates[role].candidateRefHash,
      tenderBytes: body,
      tenderBodyHash,
      transactionBindingHash,
      authorityGrantHash: input.contactAuthority.authorityGrantHash,
      effectDeadline: input.effectDeadline,
      idempotencyKey: `${input.tender.tenderHash}:${role}`,
      oneUseNonceHash: digest(
        "outsider/real-temporary-network-gmail-nonce/v1", {
          planHash: input.planHash, role,
        }),
    });
  }));
  if (deliveryResults.some((result) => result.status !== "fulfilled")) {
    await revokeInitialized(input, deps.responseLinkClients, initialized);
    const at = now(deps);
    return projection(input, at, "DELIVERY_PAIR_UNAVAILABLE_HOLD",
      ROLES.map((role, index) => ({ role,
        requirementKind: input.candidates[role].requirementKind,
        requirementId: input.candidates[role].requirementId,
        candidateRefHash: input.candidates[role].candidateRefHash,
        linkState: "REVOKE_REQUESTED_AFTER_DELIVERY_FAILURE_HOLD",
        deliveryState: deliveryResults[index].status === "fulfilled"
          ? "DELIVERED_ACK_HOLD" : "AMBIGUOUS_OR_FAILED_NO_RETRY_HOLD",
        responseState: "NOT_POLLED_HOLD",
        lifecycleVerificationHash: null,
        capacityReserved: false })), formation(input, at), {
        externalMutationCount: 4, nextAction: "UNAVAILABLE" });
  }

  const polls = await Promise.allSettled(ROLES.map((role) =>
    deps.responseLinkClients[role].pollSourceExact({
      expectedTenderHash: input.tender.tenderHash,
    })));
  const at = now(deps);
  const routeStates = [];
  for (let index = 0; index < ROLES.length; index += 1) {
    const role = ROLES[index];
    const polled = polls[index];
    let responseState = polled.status === "fulfilled"
      ? polled.value.publicProjection.state : "SOURCE_POLL_UNAVAILABLE_HOLD";
    let lifecycle = null;
    let responseEventHash = null;
    let declaredCommercialTermsHash = null;
    if (polled.status === "fulfilled"
      && responseState === "RESPONSE_OFFER_SOURCE_OBSERVED_HOLD") {
      const claimed = claimCloudflareOneUseTenderResponseLinkSourceV1(
        polled.value);
      const sourceEvent = parseSourceEvent(input, role, claimed,
        initByRole[role]);
      responseEventHash = sourceEvent.event.eventHash;
      lifecycle = lifecycleFromOffer(input, role, sourceEvent, at);
      declaredCommercialTermsHash = lifecycle.declaredCommercialTermsHash;
      responseState = "SOURCE_REPLAYED_OFFER_HOLD";
    } else if (polled.status === "fulfilled"
      && responseState === "RESPONSE_DECLINE_SOURCE_OBSERVED_HOLD") {
      const claimed = claimCloudflareOneUseTenderResponseLinkSourceV1(
        polled.value);
      responseEventHash = claimed.persistedEvent?.eventHash ?? null;
      responseState = "SOURCE_REPLAYED_DECLINE_UNAVAILABLE_HOLD";
    }
    routeStates.push({ role,
      requirementKind: input.candidates[role].requirementKind,
      requirementId: input.candidates[role].requirementId,
      candidateRefHash: input.candidates[role].candidateRefHash,
      linkState: initByRole[role].state,
      deliveryState: "DELIVERED_ACK_HOLD",
      responseState,
      responseEventHash,
      lifecycleHeadHash: lifecycle?.lifecycleHeadHash ?? null,
      lifecycleVerificationHash: lifecycle?.lifecycleVerificationHash ?? null,
      declaredCommercialTermsHash,
      priceEstablished: false,
      capacityReserved: false });
  }
  const formationState = formation(input, at);
  const bothOffers = routeStates.every((route) =>
    route.responseState === "SOURCE_REPLAYED_OFFER_HOLD");
  const anyDecline = routeStates.some((route) =>
    route.responseState === "SOURCE_REPLAYED_DECLINE_UNAVAILABLE_HOLD");
  return projection(input, at, anyDecline
    ? "SELLER_DECLINED_UNAVAILABLE_HOLD"
    : bothOffers ? "TWO_SOURCE_REPLAYED_OFFERS_HOLD"
      : "AWAITING_SELLER_RESPONSES_HOLD", routeStates, formationState, {
    externalMutationCount: 4,
    nextAction: anyDecline ? "UNAVAILABLE"
      : bothOffers ? "SOURCE_SPECIFIC_OWNER_TRUST_AND_CAPACITY_REPLAY_REQUIRED"
        : "POLL_AUTHENTICATED_RESPONSE_SOURCES_AGAIN",
  });
}
