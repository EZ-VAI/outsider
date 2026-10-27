/*
 * Privacy-closed production probe for one order-scoped seller route.
 *
 * This performs at most one Brave Web Search request and, if the selected
 * transient candidate exists, one read-only `/.well-known/outsider` probe on
 * the seller origin. It never POSTs a tender. The separately exported
 * OutcomeProgram one-use route is the write path and additionally requires an
 * exact caller contact-authority reference, a seller-declared compatible
 * endpoint, durable no-retry state, and the exact body binding.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
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
import { discoverSellerTransactionInterfaceV2 }
  from "./outsider-seller-transaction-interface-discovery-adapter-v2.js";

const PREFIX = "OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDS = Object.freeze({
  federationId: /^federation_[a-f0-9]{32}$/u,
  occurrenceId: /^discovery_[a-f0-9]{32}$/u,
  nodeSlotId: /^node_[a-f0-9]{32}$/u,
});
const ROLE_TO_TENDER_KIND = Object.freeze({
  PRIMARY: "RESOURCE",
  RECOVERY: "RECOVERY",
  INDEPENDENT_WITNESS: "EVIDENCE",
});

export const OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_SCHEMA
  = "outsider/brave-one-use-tender-production-probe-input/v1";

export const OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_BOUNDARY
  = Object.freeze({
    position: "LIVE_DISCOVERY_AND_SELLER_INTERFACE_READ_ONLY_PROBE",
    mode: "PROBE_ONLY_NO_TENDER_POST",
    maximumBraveRequests: 1,
    maximumSelectedCandidates: 1,
    maximumSellerDescriptorProbes: 1,
    tenderPostPermitted: false,
    paymentPermitted: false,
    providerRegistrationRequired: false,
    providerRegistryCreated: false,
    queryProjected: false,
    braveResultProjected: false,
    sellerOriginProjected: false,
    sellerEndpointProjected: false,
    credentialProjected: false,
    exactCallerContactAuthorityRequiredForSeparateWritePath: true,
    sellerCompatibleInterfaceRequiredForSeparateWritePath: true,
    humanQueueCreated: false,
    disposition: "DECLINE_NOT_HUMAN_QUEUE",
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
      !== OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_SCHEMA
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
  for (const value of Object.values(input.nonces)) {
    hash(value, "NONCE_INVALID");
  }
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
  const postBlockers = ["PROBE_MODE_FORBIDS_TENDER_POST"];
  if (!facts.sellerInterfaceDescribed) {
    postBlockers.push("SELLER_COMPATIBLE_INTERFACE_NOT_ESTABLISHED");
  }
  if (input.exactCallerContactAuthorityRefHash === null) {
    postBlockers.push("EXACT_CALLER_CONTACT_AUTHORITY_ABSENT");
  }
  const body = {
    schema: "outsider/brave-one-use-tender-production-probe/v1",
    schemaVersion: "1.0.0",
    recordClass: "PRIVACY_CLOSED_ORDER_SCOPED_SELLER_ROUTE_PROBE",
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
    sellerDescriptorProbeInvocationCount: facts.descriptorAttempted ? 1 : 0,
    compatibleSellerInterfaceCount: facts.sellerInterfaceDescribed ? 1 : 0,
    tenderPostAttemptCount: 0,
    paymentAttemptCount: 0,
    sellerInterfaceDescribed: facts.sellerInterfaceDescribed,
    exactCallerContactAuthorityPresent:
      input.exactCallerContactAuthorityRefHash !== null,
    oneUseTenderPostPermitted: false,
    postBlockers,
    queryProjected: false,
    braveResultProjected: false,
    sellerOriginProjected: false,
    sellerEndpointProjected: false,
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
    authority: "NONE",
    decisionState: "HOLD",
    boundary: OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_BOUNDARY,
  };
  return Object.freeze({ ...body,
    probeHash: digest(body.schema, body) });
}

/** Run one read-only candidate/interface probe. No POST branch exists here. */
export async function runBraveOneUseTenderProductionProbeV1(input = {},
  dependencies = {}) {
  const normalized = validateInput(input);
  exact(dependencies, ["apiToken", "braveFetchImpl", "braveTimeoutMs",
    "descriptorTransportConfig", "descriptorTimeoutMs"],
  "DEPENDENCIES_INVALID");
  if (typeof dependencies.apiToken !== "string"
    || dependencies.apiToken.length < 1
    || typeof dependencies.braveFetchImpl !== "function"
    || !Number.isSafeInteger(dependencies.braveTimeoutMs)
    || dependencies.braveTimeoutMs < 1
    || dependencies.braveTimeoutMs > 30_000
    || !Number.isSafeInteger(dependencies.descriptorTimeoutMs)
    || dependencies.descriptorTimeoutMs < 1
    || dependencies.descriptorTimeoutMs > 30_000) {
    fail("DEPENDENCIES_INVALID");
  }

  const capability = createBraveSellerOriginDiscoveryNodeV1({
    apiToken: dependencies.apiToken,
    fetchImpl: dependencies.braveFetchImpl,
    timeoutMs: dependencies.braveTimeoutMs,
    candidateIndex: 0,
  });
  const result = await runOrderScopedDiscoveryFederationV1({
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
    capabilityBindings: [{
      nodeSlotId: input.identifiers.nodeSlotId,
      capability,
    }],
  });
  const occurrence = result.publicProjection.occurrences[0];
  if (occurrence?.status !== "SUCCEEDED") {
    return projection(input, normalized, {
      status: "NO_DISCOVERY_CANDIDATE",
      failureCode: occurrence?.failureCode ?? "DISCOVERY_FAILED",
      braveRequestAttemptCount:
        occurrence?.federationInvocationAttemptCount ?? 0,
      candidateSelected: false,
      descriptorAttempted: false,
      sellerInterfaceDescribed: false,
    });
  }

  let lease;
  try {
    lease = claimOrderScopedDiscoveryNodeResultV1(result,
      input.identifiers.occurrenceId);
  } catch {
    return projection(input, normalized, {
      status: "NO_DISCOVERY_CANDIDATE",
      failureCode: "CANDIDATE_LEASE_UNAVAILABLE",
      braveRequestAttemptCount: occurrence.federationInvocationAttemptCount,
      candidateSelected: false,
      descriptorAttempted: false,
      sellerInterfaceDescribed: false,
    });
  }

  try {
    await discoverSellerTransactionInterfaceV2({
      sellerOriginLease: lease,
      originBinding: originBinding(input, normalized),
      asOf: normalized.descriptorAsOf,
      expiresAt: normalized.expiresAt,
      privateBindingNonce: input.nonces.descriptorPrivateBindingNonce,
    }, {
      transportConfig: dependencies.descriptorTransportConfig,
      timeoutMs: dependencies.descriptorTimeoutMs,
    });
    return projection(input, normalized, {
      status: "SELLER_INTERFACE_DESCRIBED_POST_DISABLED",
      failureCode: null,
      braveRequestAttemptCount: occurrence.federationInvocationAttemptCount,
      candidateSelected: true,
      descriptorAttempted: true,
      sellerInterfaceDescribed: true,
    });
  } catch {
    return projection(input, normalized, {
      status: "SELLER_INTERFACE_NOT_DESCRIBED",
      failureCode: "SELLER_DESCRIPTOR_UNAVAILABLE_OR_INCOMPATIBLE",
      braveRequestAttemptCount: occurrence.federationInvocationAttemptCount,
      candidateSelected: true,
      descriptorAttempted: true,
      sellerInterfaceDescribed: false,
    });
  }
}
