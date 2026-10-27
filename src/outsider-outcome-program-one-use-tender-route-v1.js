/*
 * OutcomeProgram -> live, order-scoped one-use tender route v1.
 *
 * This is composition, not a new trust layer. It joins the existing generic
 * discovery federation, opaque seller-origin lease, seller-owned
 * `/.well-known/outsider` descriptor, exact contact permission, durable
 * one-use POST, and five-source response replay. No provider is registered or
 * named here. A successful dispatch remains HOLD: a seller response or HTTP
 * acknowledgement is not owner authority, reserved capacity, or an outcome.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  claimBraveSearchCandidateForSellerObservationV1,
  discoverBraveSearchRoutesV1,
  verifyBraveSearchDiscoveryEnvelopeForFederationV1,
} from "./outsider-brave-search-route-discovery-adapter-v1.js";
import {
  claimOrderScopedDiscoveryNodeResultV1,
  createOrderScopedDiscoveryNodeCapabilityV1,
} from "./outsider-order-scoped-discovery-federation-v1.js";
import {
  createOrderScopedSellerOriginIssuerV1,
  sealSellerOriginFromDiscoveryInvocationV1,
} from "./outsider-order-scoped-seller-origin-lease-v1.js";
import {
  createOpaqueOrderScopedOneUseTenderInvocationV1,
  createRequesterExactTenderContactPermissionV1,
  invokeExactTender,
} from "./outsider-opaque-order-scoped-one-use-tender-invocation-v1.js";
import { verifyOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";
import { verifyOneUseTenderResponseLifecycleV1 }
  from "./outsider-one-use-tender-response-lifecycle-v1.js";
import { discoverSellerTransactionInterfaceV2 }
  from "./outsider-seller-transaction-interface-discovery-adapter-v2.js";

const PREFIX = "OUTSIDER_OUTCOME_PROGRAM_ONE_USE_TENDER_ROUTE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const OCCURRENCE_ID = /^discovery_[a-f0-9]{32}$/u;
const ROLE_TO_TENDER_KIND = Object.freeze({
  PRIMARY: "RESOURCE",
  RECOVERY: "RECOVERY",
  INDEPENDENT_WITNESS: "EVIDENCE",
});

export const OUTSIDER_OUTCOME_PROGRAM_ONE_USE_TENDER_ROUTE_V1_BOUNDARY
  = Object.freeze({
    position: "OUTCOME_PROGRAM_TO_ORDER_SCOPED_ONE_USE_TENDER_HOLD",
    providerRegistrationRequired: false,
    globalProviderRegistryCreated: false,
    discoveryNodeKindHardcoded: false,
    outcomeDomainHardcoded: false,
    sellerOriginProjected: false,
    sellerEndpointProjected: false,
    credentialsAcceptedByComposition: false,
    exactProgramTenderAndRequirementBindingRequired: true,
    exactRequesterContactAuthorityReferenceRequired: true,
    existingDiscoveryFederationReused: true,
    existingSellerOriginLeaseReused: true,
    existingSellerDescriptorDiscoveryReused: true,
    existingDurableOneUsePostReused: true,
    existingFiveSourceLifecycleVerifierReused: true,
    transportAcknowledgementIsOutcome: false,
    sellerDeclarationMintsAuthority: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    paymentPerformed: false,
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

function identifier(value, code, pattern = ID) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
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

function canonicalRequest(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2
    || bytes.length > 2 * 1024 * 1024) fail("REQUEST_BYTES_INVALID");
  const copy = Buffer.from(bytes);
  const text = copy.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(copy)) fail("REQUEST_UTF8_INVALID");
  let body;
  try { body = JSON.parse(text); } catch { fail("REQUEST_JSON_INVALID"); }
  if (canonicalizeStrict(body) !== text
    && `${canonicalizeStrict(body)}\n` !== text) {
    fail("REQUEST_NOT_CANONICAL");
  }
  return { body, bytes: copy };
}

function programRequirement(program, requirementId) {
  identifier(requirementId, "PROGRAM_REQUIREMENT_ID_INVALID");
  const requirement = program.requirements.find((item) =>
    item.requirementId === requirementId);
  if (requirement === undefined) fail("PROGRAM_REQUIREMENT_NOT_FOUND");
  return requirement;
}

function tenderRequirement(tender, kind, requirementId) {
  if (!Object.values(ROLE_TO_TENDER_KIND).includes(kind)) {
    fail("TENDER_REQUIREMENT_KIND_INVALID");
  }
  const section = kind === "RESOURCE" ? tender.resourceRequirements
    : kind === "RECOVERY" ? tender.recoveryRequirements
      : tender.evidenceRequirements;
  const idField = kind === "RESOURCE" ? "resourceRequirementId"
    : kind === "RECOVERY" ? "recoveryRequirementId"
      : "evidenceRequirementId";
  const requirement = section.items.find((item) =>
    item[idField] === requirementId);
  if (requirement === undefined) fail("TENDER_REQUIREMENT_NOT_FOUND");
  return { requirement, section, idField };
}

function federationJob(discovery, tender, kind, requirementId) {
  const projection = discovery.federationResult?.publicProjection;
  if (projection === null || typeof projection !== "object"
    || projection.tenderHash !== tender.tenderHash
    || projection.workOrderHash !== tender.workOrderHash
    || projection.typedGraphHash !== tender.typedGraph.typedGraphHash
    || !Array.isArray(projection.jobs)) fail("FEDERATION_BINDING_INVALID");
  const matches = projection.jobs.filter((item) =>
    item.occurrenceId === discovery.occurrenceId);
  if (matches.length !== 1) fail("FEDERATION_OCCURRENCE_NOT_UNIQUE");
  const job = matches[0];
  if (job.requirementKind !== kind || job.requirementId !== requirementId) {
    fail("FEDERATION_REQUIREMENT_MISMATCH");
  }
  return job;
}

function originBinding(tender, job) {
  return {
    tenderHash: tender.tenderHash,
    workOrderHash: tender.workOrderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    occurrenceId: job.occurrenceId,
    nodeSlotId: job.nodeSlotId,
    nodeKind: job.nodeKind,
    requirementKind: job.requirementKind,
    requirementId: job.requirementId,
    requirementSetHash: job.requirementSetHash,
    requirementObjectHash: job.requirementObjectHash,
    expiresAt: job.expiresAt,
  };
}

/**
 * Turn any source-specific live candidate resolver into the generic federation
 * node result consumed by this route. The resolver and its credentials remain
 * in a process-local closure; only the opaque one-use origin lease continues.
 */
export function createOrderScopedSellerOriginDiscoveryNodeV1(input = {}) {
  exact(input, ["nodeKind", "discoverSellerOrigin"], "NODE_INPUT_INVALID");
  identifier(input.nodeKind, "NODE_KIND_INVALID",
    /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}$/u);
  if (typeof input.discoverSellerOrigin !== "function") {
    fail("SELLER_ORIGIN_RESOLVER_INVALID");
  }
  return createOrderScopedDiscoveryNodeCapabilityV1({
    nodeKind: input.nodeKind,
    async invoke(invocation) {
      const issuer = createOrderScopedSellerOriginIssuerV1({
        tenderHash: invocation.tender.tenderHash,
        workOrderHash: invocation.tender.workOrderHash,
        typedGraphHash: invocation.tender.typedGraph.typedGraphHash,
        occurrenceId: invocation.occurrenceId,
        nodeSlotId: invocation.nodeSlotId,
        nodeKind: invocation.nodeKind,
        requirementKind: invocation.requirementKind,
        requirementId: invocation.requirementId,
        requirementSetHash: invocation.requirementSetHash,
        requirementObjectHash: invocation.requirementObjectHash,
        expiresAt: invocation.expiresAt,
        privateBindingNonce: invocation.privateBindingNonce,
      });
      const result = await input.discoverSellerOrigin(invocation);
      exact(result, ["sellerOrigin", "externalInfrastructureNetworkIoAttempted"],
        "SELLER_ORIGIN_RESULT_INVALID");
      return sealSellerOriginFromDiscoveryInvocationV1(issuer, invocation,
        result);
    },
  });
}

/**
 * One replaceable PUBLIC_INDEX node implementation. Brave is used only inside
 * this adapter closure; the generic federation and route composition never
 * depend on Brave and receive no token, query, URL, rank, or result material.
 */
export function createBraveSellerOriginDiscoveryNodeV1(input = {}) {
  exact(input, ["apiToken", "fetchImpl", "timeoutMs", "candidateIndex"],
    "BRAVE_NODE_INPUT_INVALID");
  if (typeof input.apiToken !== "string" || input.apiToken.length < 1
    || Buffer.byteLength(input.apiToken, "utf8") > 4_096
    || /[\r\n\u0000]/u.test(input.apiToken)
    || typeof input.fetchImpl !== "function"
    || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1
    || input.timeoutMs > 30_000
    || !Number.isSafeInteger(input.candidateIndex)
    || input.candidateIndex < 0 || input.candidateIndex > 19) {
    fail("BRAVE_NODE_INPUT_INVALID");
  }
  return createOrderScopedSellerOriginDiscoveryNodeV1({
    nodeKind: "brave.web_search.v1",
    async discoverSellerOrigin(invocation) {
      const result = await discoverBraveSearchRoutesV1({
        tender: invocation.tender,
        requirementKind: invocation.requirementKind,
        requirementId: invocation.requirementId,
        query: invocation.nodeInput.query,
        asOf: invocation.asOf,
        privateBindingNonce: invocation.privateBindingNonce,
      }, {
        apiToken: input.apiToken,
        fetchImpl: input.fetchImpl,
        timeoutMs: input.timeoutMs,
      });
      verifyBraveSearchDiscoveryEnvelopeForFederationV1(result, invocation);
      const candidate = claimBraveSearchCandidateForSellerObservationV1(
        result, input.candidateIndex);
      return {
        sellerOrigin: candidate.sellerUrl,
        externalInfrastructureNetworkIoAttempted: true,
      };
    },
  });
}

/**
 * Dispatch one exact OutcomeProgram requirement through one already-completed
 * live federation occurrence. Every external effect is performed by an
 * existing bounded transport. The result is intentionally not an orchestrator
 * reservation: it can feed external owner/capacity replay, but cannot COMMIT.
 */
export async function dispatchOutcomeProgramOneUseTenderV1(input = {},
  dependencies = {}) {
  exact(input, ["program", "tender", "programRequirementId",
    "tenderRequirement", "discovery", "contact", "ledger", "verifier",
    "lifecycle"], "INPUT_INVALID");
  exact(input.tenderRequirement, ["kind", "requirementId"],
    "TENDER_REQUIREMENT_INPUT_INVALID");
  exact(input.discovery, ["federationResult", "occurrenceId", "asOf",
    "privateBindingNonce"], "DISCOVERY_INPUT_INVALID");
  exact(input.contact, ["bodyBytes", "requesterContactAuthorityRefHash",
    "oneUseNonceHash", "idempotencyKeyHash", "effectDeadline"],
  "CONTACT_INPUT_INVALID");
  exact(input.ledger, ["directory", "ledgerId", "adapterInstanceRefHash"],
    "LEDGER_INPUT_INVALID");
  exact(input.verifier, ["context", "expectedContextHash", "observedAt"],
    "VERIFIER_INPUT_INVALID");
  exact(input.lifecycle, ["admittedAt", "reservedAt", "attemptedAt",
    "reconciledAt"], "LIFECYCLE_INPUT_INVALID");
  exact(dependencies, ["descriptorTransportConfig", "descriptorTimeoutMs",
    "tenderTransportConfig", "signal"], "DEPENDENCIES_INVALID");

  const program = verifyOutcomeProgramV1(input.program);
  const tenderHash = input.tender?.tenderHash;
  const tenderCheck = verifyOutsiderOutcomeTenderV1(input.tender, {
    expectedTenderHash: tenderHash,
  });
  if (!tenderCheck.ok || program.tenderHash === null
    || program.tenderHash !== tenderHash) fail("PROGRAM_TENDER_MISMATCH");
  const requirement = programRequirement(program,
    input.programRequirementId);
  const expectedKind = ROLE_TO_TENDER_KIND[requirement.role];
  if (input.tenderRequirement.kind !== expectedKind) {
    fail("PROGRAM_ROLE_TENDER_KIND_MISMATCH");
  }
  const mapped = tenderRequirement(input.tender, expectedKind,
    input.tenderRequirement.requirementId);

  identifier(input.discovery.occurrenceId,
    "DISCOVERY_OCCURRENCE_ID_INVALID", OCCURRENCE_ID);
  const descriptorAsOf = instant(input.discovery.asOf,
    "DESCRIPTOR_AS_OF_INVALID");
  hash(input.discovery.privateBindingNonce,
    "DISCOVERY_PRIVATE_BINDING_NONCE_INVALID");
  const effectDeadline = instant(input.contact.effectDeadline,
    "EFFECT_DEADLINE_INVALID");
  hash(input.contact.requesterContactAuthorityRefHash,
    "REQUESTER_CONTACT_AUTHORITY_REF_HASH_INVALID");
  hash(input.contact.oneUseNonceHash, "ONE_USE_NONCE_HASH_INVALID");
  hash(input.contact.idempotencyKeyHash, "IDEMPOTENCY_KEY_HASH_INVALID");
  hash(input.ledger.adapterInstanceRefHash,
    "ADAPTER_INSTANCE_REF_HASH_INVALID");
  hash(input.verifier.expectedContextHash,
    "EXPECTED_VERIFIER_CONTEXT_HASH_INVALID");
  instant(input.verifier.observedAt, "VERIFIER_OBSERVED_AT_INVALID");
  for (const field of ["admittedAt", "reservedAt", "attemptedAt",
    "reconciledAt"]) instant(input.lifecycle[field],
    `${field.toUpperCase()}_INVALID`);
  if (Date.parse(effectDeadline) > Date.parse(program.formationDeadline)
    || Date.parse(effectDeadline) > Date.parse(input.tender.formationDeadline)) {
    fail("EFFECT_DEADLINE_OUTSIDE_FORMATION_WINDOW");
  }
  if (typeof input.ledger.directory !== "string"
    || input.ledger.directory.length < 1
    || typeof input.ledger.ledgerId !== "string"
    || !/^ledger_[a-f0-9]{32}$/u.test(input.ledger.ledgerId)
    || !Number.isSafeInteger(dependencies.descriptorTimeoutMs)
    || dependencies.descriptorTimeoutMs < 1
    || dependencies.signal === null
    || typeof dependencies.signal !== "object") fail("LOCAL_INPUT_INVALID");

  const request = canonicalRequest(input.contact.bodyBytes);
  if (request.body.tender?.tenderHash !== tenderHash
    || request.body.expectedTenderHash !== tenderHash
    || request.body.tender?.workOrderHash !== input.tender.workOrderHash) {
    fail("REQUEST_TENDER_MISMATCH");
  }
  const lifecycle = verifyOneUseTenderResponseLifecycleV1({
    tender: request.body.tender,
    expectedTenderHash: request.body.expectedTenderHash,
    responses: request.body.responses,
    occurrences: request.body.responseOccurrences,
    expectedOccurrenceCount: request.body.expectedResponseOccurrenceCount,
    expectedLifecycleHeadHash: request.body.expectedResponseLifecycleHeadHash,
    observedAt: input.verifier.observedAt,
  });
  if (!lifecycle.ok || lifecycle.requirementKind !== expectedKind
    || lifecycle.requirementId !== input.tenderRequirement.requirementId) {
    fail("REQUEST_RESPONSE_LIFECYCLE_REQUIREMENT_MISMATCH");
  }

  const job = federationJob(input.discovery, input.tender, expectedKind,
    input.tenderRequirement.requirementId);
  if (job.requirementSetHash !== mapped.section.requirementSetHash) {
    fail("FEDERATION_REQUIREMENT_SET_MISMATCH");
  }
  const sellerOriginLease = claimOrderScopedDiscoveryNodeResultV1(
    input.discovery.federationResult, input.discovery.occurrenceId);
  const descriptor = await discoverSellerTransactionInterfaceV2({
    sellerOriginLease,
    originBinding: originBinding(input.tender, job),
    asOf: descriptorAsOf,
    expiresAt: job.expiresAt,
    privateBindingNonce: input.discovery.privateBindingNonce,
  }, {
    transportConfig: dependencies.descriptorTransportConfig,
    timeoutMs: dependencies.descriptorTimeoutMs,
  });

  const requirementHash = digest(
    "outsider/outcome-program-one-use-tender-requirement-binding/v1", {
      programHash: program.programHash,
      programRequirement: requirement,
      tenderHash,
      tenderRequirementKind: expectedKind,
      tenderRequirementId: input.tenderRequirement.requirementId,
      tenderRequirementSetHash: mapped.section.requirementSetHash,
      tenderRequirement: mapped.requirement,
    });
  const binding = {
    tenderHash,
    workOrderHash: input.tender.workOrderHash,
    typedGraphHash: input.tender.typedGraph.typedGraphHash,
    requirementHash,
    descriptorProjectionHash: descriptor.publicProjection.projectionHash,
    bodyHash: byteHash(request.bytes),
    oneUseNonceHash: input.contact.oneUseNonceHash,
    idempotencyKeyHash: input.contact.idempotencyKeyHash,
    effectDeadline,
  };
  const programBoundContactAuthorityHash = digest(
    "outsider/outcome-program-exact-contact-authority-binding/v1", {
      requesterContactAuthorityRefHash:
        input.contact.requesterContactAuthorityRefHash,
      programHash: program.programHash,
      programRequirementId: requirement.requirementId,
      requirementHash,
    });
  const permission = createRequesterExactTenderContactPermissionV1({
    ...binding,
    requesterDelegationPermissionHash: programBoundContactAuthorityHash,
  });
  const capability = createOpaqueOrderScopedOneUseTenderInvocationV1({
    descriptorResult: descriptor,
    contactPermission: permission,
    binding,
    ledgerDirectory: input.ledger.directory,
    ledgerId: input.ledger.ledgerId,
    adapterInstanceRefHash: input.ledger.adapterInstanceRefHash,
    verifierContext: input.verifier.context,
    expectedVerifierContextHash: input.verifier.expectedContextHash,
    observedAt: input.verifier.observedAt,
  });
  const result = await invokeExactTender(capability, {
    bodyBytes: request.bytes,
    ...input.lifecycle,
  }, {
    transportConfig: dependencies.tenderTransportConfig,
    signal: dependencies.signal,
  });

  const projection = {
    schema: "outsider/outcome-program-one-use-tender-route/v1",
    schemaVersion: "1.0.0",
    recordClass: "ORDER_SCOPED_ONE_USE_TENDER_ROUTE",
    programHash: program.programHash,
    programRequirementId: requirement.requirementId,
    programRequirementRole: requirement.role,
    programCapability: requirement.capability,
    tenderHash,
    tenderRequirementKind: expectedKind,
    tenderRequirementId: input.tenderRequirement.requirementId,
    requirementHash,
    discoveryOccurrenceId: input.discovery.occurrenceId,
    sellerInterfaceDescribed: true,
    exactTenderDelivered: true,
    sellerFiveSourceLifecycleVerified:
      result.sellerFiveSourceLifecycleVerified === true,
    sellerOriginProjected: false,
    sellerEndpointProjected: false,
    providerRegistrationRequired: false,
    transportReceiptIsOutcome: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    ledgerHeadHash: result.ledgerHeadHash,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return Object.freeze({
    ...projection,
    routeHash: digest(projection.schema, projection),
  });
}
