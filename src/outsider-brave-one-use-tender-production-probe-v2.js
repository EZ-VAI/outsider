/*
 * Brave -> one seller-origin lease -> unified seller read-only probe v2.
 *
 * Input remains the v1 compiled probe input. This descendant changes only the
 * seller observation path: one Brave request yields one candidate lease; one
 * private consumer checks /.well-known/outsider and then, only if needed, the
 * seller Web root. It has no tender POST or payment capability.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { OUTSIDER_BRAVE_WEB_SEARCH_COUNTRIES_V1 }
  from "./outsider-brave-search-route-discovery-adapter-v1.js";
import {
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  claimOrderScopedDiscoveryNodeResultV1,
  runOrderScopedDiscoveryFederationV1,
} from "./outsider-order-scoped-discovery-federation-v1.js";
import { createBraveSellerOriginDiscoveryNodeV1 }
  from "./outsider-outcome-program-one-use-tender-route-v1.js";
import { verifyOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";
import { probeSellerOriginReadOnlyV2 }
  from "./outsider-seller-origin-read-only-probe-v2.js";
import { preflightSellerOriginReadOnlyProbeV2 }
  from "./outsider-seller-origin-read-only-probe-v2.js";

const PREFIX = "OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDS = Object.freeze({
  federationId: /^federation_[a-f0-9]{32}$/u,
  occurrenceId: /^discovery_[a-f0-9]{32}$/u,
  nodeSlotId: /^node_[a-f0-9]{32}$/u,
});
const ROLE_TO_TENDER_KIND = Object.freeze({
  PRIMARY: "RESOURCE", RECOVERY: "RECOVERY",
  INDEPENDENT_WITNESS: "EVIDENCE",
});
const BRAVE_COUNTRIES = new Set(OUTSIDER_BRAVE_WEB_SEARCH_COUNTRIES_V1);
const BRAVE_SEARCH_LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u;
const MAXIMUM_BRAVE_QUERY_BYTES = 400;
const MAXIMUM_BRAVE_QUERY_WORDS = 50;
const MAXIMUM_BRAVE_RESULTS = 20;
const PRODUCTION_WEB_DOCUMENT_BYTES = 2 * 1024 * 1024;

export const OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_INPUT_SCHEMA
  = "outsider/brave-one-use-tender-production-probe-input/v1";

export const OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_BOUNDARY
  = Object.freeze({
    position: "ONE_BRAVE_CANDIDATE_ONE_LEASE_UNIFIED_SELLER_READ_ONLY_PROBE",
    acceptsExistingV1CompiledInput: true,
    maximumBraveRequests: 1,
    maximumSelectedCandidates: 1,
    sellerOriginLeaseMaximumClaims: 1,
    maximumSellerDescriptorProbes: 1,
    maximumSellerWebDocumentBytes: PRODUCTION_WEB_DOCUMENT_BYTES,
    webNativeFallbackOnlyAfterDescriptorFailure: true,
    secondBraveSearchPermitted: false,
    tenderPostPermitted: false,
    paymentPermitted: false,
    providerRegistrationRequired: false,
    providerRegistryCreated: false,
    queryProjected: false,
    braveResultProjected: false,
    sellerOriginProjected: false,
    sellerTargetProjected: false,
    sellerDocumentProjected: false,
    credentialProjected: false,
    observedSurfaceIsNotPermissionAcceptanceCapacityOrPrice: true,
    humanQueueCreated: false,
    disposition: "DECLINE_NOT_HUMAN_QUEUE",
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  error.braveRequestAttemptCount = 0;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function hash(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function tenderRequirement(tender, kind, requirementId) {
  const section = kind === "RESOURCE" ? tender.resourceRequirements
    : kind === "RECOVERY" ? tender.recoveryRequirements
      : tender.evidenceRequirements;
  const idField = kind === "RESOURCE" ? "resourceRequirementId"
    : kind === "RECOVERY" ? "recoveryRequirementId"
      : "evidenceRequirementId";
  const requirement = section.items.find((item) =>
    item[idField] === requirementId);
  if (requirement === undefined) fail("TENDER_REQUIREMENT_NOT_FOUND");
  return {
    requirementKind: kind,
    requirementId,
    requirementSetHash: section.requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: tender.tenderHash,
        requirementKind: kind,
        requirementSetHash: section.requirementSetHash,
        requirement,
      }),
  };
}

function validateInput(input) {
  exact(input, ["schema", "schemaVersion", "mode", "program", "tender",
    "programRequirementId", "tenderRequirement", "query", "asOf",
    "descriptorAsOf", "identifiers", "nonces", "maximumRuntimeMs",
    "exactCallerContactAuthorityRefHash"], "INPUT_INVALID");
  if (input.schema
      !== OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_INPUT_SCHEMA
    || input.schemaVersion !== "1.0.0"
    || input.mode !== "PROBE_ONLY_NO_TENDER_POST") fail("SCHEMA_INVALID");
  exact(input.tenderRequirement, ["kind", "requirementId"],
    "TENDER_REQUIREMENT_INVALID");
  exact(input.identifiers, ["federationId", "occurrenceId", "nodeSlotId"],
    "IDENTIFIERS_INVALID");
  exact(input.nonces, ["discoveryPrivateBindingNonce",
    "privateProjectionNonce", "descriptorPrivateBindingNonce"],
  "NONCES_INVALID");
  exact(input.query, ["text", "country", "searchLang", "count", "expiresAt"],
    "QUERY_INVALID");
  if (typeof input.query.text !== "string") fail("QUERY_TEXT_INVALID");
  const normalizedQueryText = input.query.text.trim();
  if (normalizedQueryText.length < 1
    || normalizedQueryText !== input.query.text
    || Buffer.byteLength(normalizedQueryText, "utf8")
      > MAXIMUM_BRAVE_QUERY_BYTES
    || normalizedQueryText.split(/\s+/u).length > MAXIMUM_BRAVE_QUERY_WORDS
    || /[\u0000-\u001f\u007f]/u.test(normalizedQueryText)) {
    fail("QUERY_TEXT_INVALID");
  }
  if (input.query.country !== null
    && (typeof input.query.country !== "string"
      || !BRAVE_COUNTRIES.has(input.query.country))) {
    fail("QUERY_COUNTRY_UNSUPPORTED");
  }
  if (input.query.searchLang !== null
    && (typeof input.query.searchLang !== "string"
      || !BRAVE_SEARCH_LANGUAGE.test(input.query.searchLang))) {
    fail("QUERY_SEARCH_LANGUAGE_INVALID");
  }
  if (!Number.isSafeInteger(input.query.count) || input.query.count < 1
    || input.query.count > MAXIMUM_BRAVE_RESULTS) fail("QUERY_COUNT_INVALID");
  const program = verifyOutcomeProgramV1(input.program);
  const tenderHash = input.tender?.tenderHash;
  const tender = verifyOutsiderOutcomeTenderV1(input.tender, {
    expectedTenderHash: tenderHash,
  });
  if (!tender.ok || program.tenderHash === null
    || program.tenderHash !== tenderHash) fail("PROGRAM_TENDER_MISMATCH");
  const requirement = program.requirements.find((item) =>
    item.requirementId === input.programRequirementId);
  if (requirement === undefined) fail("PROGRAM_REQUIREMENT_NOT_FOUND");
  const kind = ROLE_TO_TENDER_KIND[requirement.role];
  if (kind !== input.tenderRequirement.kind) {
    fail("PROGRAM_ROLE_TENDER_KIND_MISMATCH");
  }
  const tenderBinding = tenderRequirement(input.tender, kind,
    input.tenderRequirement.requirementId);
  for (const [field, pattern] of Object.entries(IDS)) {
    if (typeof input.identifiers[field] !== "string"
      || !pattern.test(input.identifiers[field])) fail("IDENTIFIER_INVALID");
  }
  for (const value of Object.values(input.nonces)) hash(value, "NONCE_INVALID");
  hash(input.exactCallerContactAuthorityRefHash,
    "CONTACT_AUTHORITY_REF_INVALID", true);
  const asOf = instant(input.asOf, "AS_OF_INVALID");
  const descriptorAsOf = instant(input.descriptorAsOf,
    "DESCRIPTOR_AS_OF_INVALID");
  const expiresAt = instant(input.query.expiresAt, "EXPIRES_AT_INVALID");
  if (Date.parse(asOf) < Date.parse(input.tender.compiledAt)
    || Date.parse(asOf) >= Date.parse(expiresAt)
    || Date.parse(descriptorAsOf) < Date.parse(asOf)
    || Date.parse(descriptorAsOf) >= Date.parse(expiresAt)
    || Date.parse(expiresAt) > Date.parse(input.tender.formationDeadline)) {
    fail("TIME_WINDOW_INVALID");
  }
  if (!Number.isSafeInteger(input.maximumRuntimeMs)
    || input.maximumRuntimeMs < 1 || input.maximumRuntimeMs > 30_000) {
    fail("MAXIMUM_RUNTIME_INVALID");
  }
  return { program, requirement, tenderBinding, asOf, descriptorAsOf,
    expiresAt };
}

function originBinding(input, normalized) {
  return {
    tenderHash: input.tender.tenderHash,
    workOrderHash: input.tender.workOrderHash,
    typedGraphHash: input.tender.typedGraph.typedGraphHash,
    occurrenceId: input.identifiers.occurrenceId,
    nodeSlotId: input.identifiers.nodeSlotId,
    nodeKind: "brave.web_search.v1",
    ...normalized.tenderBinding,
    expiresAt: normalized.expiresAt,
  };
}

function projection(input, normalized, facts) {
  const surfaceObserved = facts.sellerReadOnlyProbe !== null
    && facts.sellerReadOnlyProbe.selectedSurfaceFamily !== null;
  const postBlockers = ["PROBE_MODE_FORBIDS_TENDER_POST",
    "OBSERVED_WEB_SURFACE_DOES_NOT_ESTABLISH_INVOCATION_PERMISSION"];
  if (!surfaceObserved) postBlockers.push("NO_SUPPORTED_SELLER_SURFACE_OBSERVED");
  if (input.exactCallerContactAuthorityRefHash === null) {
    postBlockers.push("EXACT_CALLER_CONTACT_AUTHORITY_ABSENT");
  }
  const seller = facts.sellerReadOnlyProbe;
  const body = {
    schema: "outsider/brave-one-use-tender-production-probe/v2",
    schemaVersion: "2.0.0",
    recordClass: "PRIVACY_CLOSED_ORDER_SCOPED_UNIFIED_SELLER_READ_PROBE",
    programHash: normalized.program.programHash,
    programRequirementId: normalized.requirement.requirementId,
    programRequirementRole: normalized.requirement.role,
    programCapability: normalized.requirement.capability,
    tenderHash: input.tender.tenderHash,
    tenderRequirementKind: normalized.tenderBinding.requirementKind,
    tenderRequirementId: normalized.tenderBinding.requirementId,
    status: facts.status,
    failureCode: facts.failureCode,
    braveRequestAttemptCount: facts.braveRequestAttemptCount,
    selectedCandidateCount: facts.candidateSelected ? 1 : 0,
    sellerOriginLeaseClaimCount: seller?.sellerOriginLeaseClaimCount ?? 0,
    secondBraveSearchRequestCount: 0,
    sellerDescriptorProbeInvocationCount:
      seller?.descriptorProbe.attempted === true ? 1 : 0,
    sellerWebNativeFallbackInvocationCount:
      seller?.webNativeFallback.attempted === true ? 1 : 0,
    compatibleSellerInterfaceCount:
      seller?.descriptorProbe.compatible === true ? 1 : 0,
    observedWebNativeSurfaceOccurrenceCount:
      seller?.webNativeFallback.surfaceOccurrenceCount ?? 0,
    selectedSurfaceFamily: seller?.selectedSurfaceFamily ?? null,
    sellerReadOnlyProbe: seller,
    tenderPostAttemptCount: 0,
    paymentAttemptCount: 0,
    exactCallerContactAuthorityPresent:
      input.exactCallerContactAuthorityRefHash !== null,
    oneUseTenderPostPermitted: false,
    postBlockers,
    queryProjected: false,
    braveResultProjected: false,
    sellerOriginProjected: false,
    sellerTargetProjected: false,
    sellerDocumentProjected: false,
    credentialProjected: false,
    providerRegistrationRequired: false,
    providerRegistryCreated: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    paymentPerformed: false,
    outsiderStaffTouchCount: null,
    outsiderStaffTouchMeasurementObserved: false,
    humanQueueCreated: false,
    formationDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    authority: "NONE", decisionState: "HOLD",
    boundary: OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_BOUNDARY,
  };
  Object.freeze(postBlockers);
  return Object.freeze({ ...body, probeHash: digest(body.schema, body) });
}

export async function runBraveOneUseTenderProductionProbeV2(input = {},
  dependencies = {}) {
  const normalized = validateInput(input);
  exact(dependencies, ["apiToken", "braveFetchImpl", "braveTimeoutMs",
    "descriptorTransportConfig", "descriptorTimeoutMs"],
  "DEPENDENCIES_INVALID");
  if (typeof dependencies.apiToken !== "string"
    || dependencies.apiToken.length < 1
    || typeof dependencies.braveFetchImpl !== "function"
    || !Number.isSafeInteger(dependencies.braveTimeoutMs)
    || dependencies.braveTimeoutMs < 1 || dependencies.braveTimeoutMs > 30_000
    || !Number.isSafeInteger(dependencies.descriptorTimeoutMs)
    || dependencies.descriptorTimeoutMs < 1
    || dependencies.descriptorTimeoutMs > 30_000) {
    fail("DEPENDENCIES_INVALID");
  }
  const sellerProbeDependencies = preflightSellerOriginReadOnlyProbeV2({
    transportConfig: dependencies.descriptorTransportConfig,
    timeoutMs: dependencies.descriptorTimeoutMs,
    maximumWebDocumentBytes: PRODUCTION_WEB_DOCUMENT_BYTES,
  });
  const capability = createBraveSellerOriginDiscoveryNodeV1({
    apiToken: dependencies.apiToken,
    fetchImpl: dependencies.braveFetchImpl,
    timeoutMs: dependencies.braveTimeoutMs,
    candidateIndex: 0,
  });
  const federation = await runOrderScopedDiscoveryFederationV1({
    tender: input.tender,
    asOf: normalized.asOf,
    publicPlan: {
      schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId: input.identifiers.federationId,
      tenderHash: input.tender.tenderHash,
      workOrderHash: input.tender.workOrderHash,
      typedGraphHash: input.tender.typedGraph.typedGraphHash,
      concurrencyLimit: 1,
      jobs: [{
        occurrenceId: input.identifiers.occurrenceId,
        nodeSlotId: input.identifiers.nodeSlotId,
        nodeKind: "brave.web_search.v1",
        ...normalized.tenderBinding,
        expiresAt: normalized.expiresAt,
        maximumRuntimeMs: input.maximumRuntimeMs,
      }],
    },
    privateJobs: [{
      occurrenceId: input.identifiers.occurrenceId,
      nodeInput: { query: input.query },
      privateBindingNonce: input.nonces.discoveryPrivateBindingNonce,
    }],
    privateProjectionNonce: input.nonces.privateProjectionNonce,
  }, {
    capabilityBindings: [{ nodeSlotId: input.identifiers.nodeSlotId,
      capability }],
  });
  const occurrence = federation.publicProjection.occurrences[0];
  if (occurrence?.status !== "SUCCEEDED") {
    return projection(input, normalized, {
      status: "NO_DISCOVERY_CANDIDATE",
      failureCode: occurrence?.failureCode ?? "DISCOVERY_FAILED",
      braveRequestAttemptCount:
        occurrence?.federationInvocationAttemptCount ?? 0,
      candidateSelected: false,
      sellerReadOnlyProbe: null,
    });
  }
  let lease;
  try {
    lease = claimOrderScopedDiscoveryNodeResultV1(federation,
      input.identifiers.occurrenceId);
  } catch {
    return projection(input, normalized, {
      status: "NO_DISCOVERY_CANDIDATE",
      failureCode: "CANDIDATE_LEASE_UNAVAILABLE",
      braveRequestAttemptCount: occurrence.federationInvocationAttemptCount,
      candidateSelected: false,
      sellerReadOnlyProbe: null,
    });
  }
  let sellerResult;
  try {
    sellerResult = await probeSellerOriginReadOnlyV2({
      sellerOriginLease: lease,
      originBinding: originBinding(input, normalized),
      asOf: normalized.descriptorAsOf,
      expiresAt: normalized.expiresAt,
      privateBindingNonce: input.nonces.descriptorPrivateBindingNonce,
    }, {
      ...sellerProbeDependencies,
    });
  } catch (error) {
    const code = typeof error?.outsiderCode === "string"
      ? error.outsiderCode : "SELLER_READ_ONLY_PROBE_FAILED";
    return projection(input, normalized, {
      status: "SELLER_READ_ONLY_PROBE_FAILED", failureCode: code,
      braveRequestAttemptCount: occurrence.federationInvocationAttemptCount,
      candidateSelected: true, sellerReadOnlyProbe: null,
    });
  }
  const seller = sellerResult.publicProjection;
  const status = seller.status === "OUTSIDER_DESCRIPTOR_OBSERVED"
    ? "SELLER_OUTSIDER_INTERFACE_OBSERVED_POST_DISABLED"
    : seller.status === "WEB_NATIVE_SURFACES_OBSERVED"
      ? "SELLER_WEB_NATIVE_SURFACES_OBSERVED_POST_DISABLED"
      : seller.status === "SELLER_READ_FAILED"
        ? "SELLER_READ_ONLY_PROBE_FAILED"
        : "SELLER_NO_SUPPORTED_SURFACE_OBSERVED";
  return projection(input, normalized, {
    status,
    failureCode: status === "SELLER_READ_ONLY_PROBE_FAILED"
      ? seller.webNativeFallback.failureCode : null,
    braveRequestAttemptCount: occurrence.federationInvocationAttemptCount,
    candidateSelected: true,
    sellerReadOnlyProbe: seller,
  });
}
