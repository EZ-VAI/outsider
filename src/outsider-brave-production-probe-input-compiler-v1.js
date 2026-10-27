/*
 * Pure production input compiler for the read-only Brave seller-route probe.
 *
 * Plain query text remains only in the private probe input. Public tender and
 * OutcomeProgram surfaces carry a salted query commitment derived from the
 * caller's opaque request-scope reference. Typed-graph and authorization
 * references are copied from the caller and are never synthesized or upgraded
 * into authority. The result remains HOLD and has no tender-send path.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_SCHEMA,
} from "./outsider-brave-one-use-tender-production-probe-v1.js";
import { compileOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_BRAVE_PRODUCTION_PROBE_INPUT_COMPILER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export const OUTSIDER_BRAVE_PRODUCTION_PROBE_INPUT_COMPILER_V1_BOUNDARY
  = Object.freeze({
    mode: "PROBE_ONLY_NO_TENDER_POST",
    queryIsPrivateProbeInput: true,
    queryProjectedIntoTenderOrProgram: false,
    typedGraphReferencesCallerSupplied: true,
    authorizationReferencesCallerSupplied: true,
    referenceExistenceOrAuthorityEstablished: false,
    contactAuthorityInvented: false,
    providerContactPerformed: false,
    networkIoPerformed: false,
    tenderPostPermitted: false,
    paymentPermitted: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function opaqueId(prefix, scope) {
  return `${prefix}_${createHash("sha256").update(scope, "utf8")
    .digest("hex").slice(0, 32)}`;
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

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function references(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("REFERENCES_INVALID");
  }
  hash(value.requestScopeRefHash, "REQUEST_SCOPE_REF_HASH_INVALID");
  hash(value.workOrderHash, "WORK_ORDER_HASH_INVALID");
  hash(value.subjectRefHash, "SUBJECT_REF_HASH_INVALID");
  hash(value.regionRefHash, "REGION_REF_HASH_INVALID");
  hash(value.consequenceEnvelopeRefHash,
    "CONSEQUENCE_ENVELOPE_REF_HASH_INVALID");
  if (!Array.isArray(value.affectedChannelRefHashes)
    || value.affectedChannelRefHashes.length < 1) {
    fail("AFFECTED_CHANNEL_REF_HASHES_INVALID");
  }
  for (const item of value.affectedChannelRefHashes) {
    hash(item, "AFFECTED_CHANNEL_REF_HASH_INVALID");
  }
  if (value.typedGraph === null || typeof value.typedGraph !== "object"
    || value.authorizationBinding === null
    || typeof value.authorizationBinding !== "object") {
    fail("TYPED_GRAPH_OR_AUTHORIZATION_REFERENCES_INVALID");
  }
  return value;
}

export function compileBraveProductionProbeInputV1(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("INPUT_INVALID");
  }
  if (typeof input.requestId !== "string"
    || !REQUEST_ID.test(input.requestId)) fail("REQUEST_ID_INVALID");
  if (typeof input.query !== "string") fail("QUERY_INVALID");
  const query = input.query.trim();
  if (query.length < 1 || Buffer.byteLength(query, "utf8") > 2_048
    || /[\u0000-\u001f\u007f]/u.test(query)) fail("QUERY_INVALID");
  const currentTime = instant(input.currentTime, "CURRENT_TIME_INVALID");
  const formationDeadline = instant(input.formationDeadline,
    "FORMATION_DEADLINE_INVALID");
  const completionDeadline = instant(input.completionDeadline,
    "COMPLETION_DEADLINE_INVALID");
  if (Date.parse(currentTime) >= Date.parse(formationDeadline)
    || Date.parse(formationDeadline) >= Date.parse(completionDeadline)) {
    fail("DEADLINE_ORDER_INVALID");
  }
  const refs = references(input.references);
  const exactContactAuthority = hash(
    input.exactCallerContactAuthorityRefHash ?? null,
    "EXACT_CALLER_CONTACT_AUTHORITY_REF_HASH_INVALID", true);
  const scope = `${input.requestId}\0${refs.requestScopeRefHash}`;
  const queryCommitmentHash = digest(
    "outsider/brave-production-probe-private-query-commitment/v1", {
      requestScopeRefHash: refs.requestScopeRefHash,
      query,
    });
  const derivedRef = (label) => digest(
    `outsider/brave-production-probe-${label}-reference/v1`, {
      requestScopeRefHash: refs.requestScopeRefHash,
      queryCommitmentHash,
    });
  const resourceId = opaqueId("resource", `${scope}\0resource`);
  const evidenceId = opaqueId("evidence", `${scope}\0evidence`);
  const recoveryId = opaqueId("recovery", `${scope}\0recovery`);
  const conditionId = opaqueId("condition", `${scope}\0condition`);
  const tender = compileOutsiderOutcomeTenderV1({
    tenderId: opaqueId("tender", scope),
    compiledAt: currentTime,
    lineage: {
      revision: 0,
      predecessorTenderHash: null,
      supersedesTenderHash: null,
    },
    workOrderHash: refs.workOrderHash,
    typedGraph: refs.typedGraph,
    authorizationBinding: refs.authorizationBinding,
    exactOutcome: {
      outcomeKindCode: "REQUESTED_OUTCOME_DELIVERED",
      outcomeSpecRefHash: queryCommitmentHash,
      subjectRefHash: refs.subjectRefHash,
      acceptanceCriteriaRefHash: derivedRef("acceptance-criteria"),
      conditions: [{
        conditionId,
        metricCode: "OUTCOME_STATE",
        comparator: "EQUAL",
        target: {
          valueKind: "STATE_CODE",
          booleanValue: null,
          integerValue: null,
          stateCode: "DELIVERED",
          unitCode: null,
        },
        observationWindowMs: 0,
        conditionRefHash: derivedRef("outcome-condition"),
        mandatory: true,
      }],
      deadline: completionDeadline,
    },
    formationDeadline,
    resourceRequirements: [{
      resourceRequirementId: resourceId,
      resourceClassCode: "OUTCOME_PROVIDER",
      capabilityRefHash: derivedRef("resource-capability"),
      quantity: 1,
      unitCode: "PROVIDER_ROUTE",
      regionRefHash: refs.regionRefHash,
      requiredBy: completionDeadline,
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "INDEPENDENT_OUTCOME_WITNESS",
      evidenceRequirementRefHash: derivedRef("evidence-requirement"),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: completionDeadline,
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: recoveryId,
      triggerRefHash: derivedRef("recovery-trigger"),
      recoveryOutcomeRefHash: derivedRef("recovery-outcome"),
      resourceClassCode: "ALTERNATE_OUTCOME_PROVIDER",
      maximumAttempts: 1,
      completionDeadline,
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: refs.consequenceEnvelopeRefHash,
      consequenceClassCode: "NO_COMMITTED_EXTERNAL_CONSEQUENCE",
      measureCode: "MAXIMUM_COMMITTED_LOSS",
      maximumValue: 0,
      unitCode: "UNSPECIFIED_UNIT",
      affectedChannelRefHashes: refs.affectedChannelRefHashes,
      irreversibleHarmAllowed: false,
      unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  });
  const reservationMs = Math.max(1,
    Date.parse(formationDeadline) - Date.parse(currentTime));
  const program = compileOutcomeProgramV1({
    programId: opaqueId("program", scope),
    orderId: opaqueId("order", scope),
    createdAt: currentTime,
    formationDeadline,
    completionDeadline,
    tenderHash: tender.tenderHash,
    outcome: {
      statement:
        "Form one external resource route for the opaque requested outcome.",
      acceptance: [{
        criterionId: "route_observed",
        comparator: "SOURCE_SPECIFIC",
        subject: "one source-replayed external resource route",
        expected: { queryCommitmentHash },
      }],
      budget: { currency: "USD", maximumAmountMinor: "0" },
    },
    requirements: [
      {
        requirementId: "primary_resource_route",
        role: "PRIMARY",
        capability: "ONE_USE_TENDER_RESOURCE_ROUTE_DISCOVERY",
        constraints: { queryCommitmentHash, tenderRequirementId: resourceId },
        minimumReservationMs: reservationMs,
        dependsOnRequirementIds: [],
      },
      {
        requirementId: "recovery_resource_route",
        role: "RECOVERY",
        capability: "ALTERNATE_RESOURCE_ROUTE_DISCOVERY",
        constraints: { queryCommitmentHash, tenderRequirementId: recoveryId },
        minimumReservationMs: reservationMs,
        dependsOnRequirementIds: [],
      },
      {
        requirementId: "independent_route_witness",
        role: "INDEPENDENT_WITNESS",
        capability: "INDEPENDENT_RESOURCE_ROUTE_OBSERVATION",
        constraints: { queryCommitmentHash, tenderRequirementId: evidenceId },
        minimumReservationMs: reservationMs,
        dependsOnRequirementIds: [
          "primary_resource_route",
          "recovery_resource_route",
        ],
      },
    ],
    nodes: [{
      nodeId: "form_external_resource_route",
      kind: "EFFECT",
      dependsOn: [],
      primaryRequirementId: "primary_resource_route",
      recoveryRequirementId: "recovery_resource_route",
      witnessRequirementId: "independent_route_witness",
      input: { queryCommitmentHash },
      acceptance: ["route_observed"],
    }],
    obligations: [
      {
        obligationId: "release_primary_route",
        trigger: "ALWAYS",
        targetRequirementId: "primary_resource_route",
        nodeId: "form_external_resource_route",
        action: "RELEASE_DISCOVERY_ROUTE",
        input: {},
        deadline: completionDeadline,
      },
      {
        obligationId: "release_recovery_route",
        trigger: "ALWAYS",
        targetRequirementId: "recovery_resource_route",
        nodeId: "form_external_resource_route",
        action: "RELEASE_DISCOVERY_ROUTE",
        input: {},
        deadline: completionDeadline,
      },
      {
        obligationId: "release_route_witness",
        trigger: "ALWAYS",
        targetRequirementId: "independent_route_witness",
        nodeId: "form_external_resource_route",
        action: "RELEASE_DISCOVERY_OBSERVATION",
        input: {},
        deadline: completionDeadline,
      },
    ],
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false },
  });
  const result = {
    schema: OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V1_SCHEMA,
    schemaVersion: "1.0.0",
    mode: "PROBE_ONLY_NO_TENDER_POST",
    program,
    tender,
    programRequirementId: "primary_resource_route",
    tenderRequirement: { kind: "RESOURCE", requirementId: resourceId },
    query: {
      text: query,
      country: "ALL",
      searchLang: null,
      count: 1,
      expiresAt: formationDeadline,
    },
    asOf: currentTime,
    descriptorAsOf: currentTime,
    identifiers: {
      federationId: opaqueId("federation", `${scope}\0federation`),
      occurrenceId: opaqueId("discovery", `${scope}\0occurrence`),
      nodeSlotId: opaqueId("node", `${scope}\0node`),
    },
    nonces: {
      discoveryPrivateBindingNonce: derivedRef("discovery-private-binding"),
      privateProjectionNonce: derivedRef("private-projection"),
      descriptorPrivateBindingNonce: derivedRef("descriptor-private-binding"),
    },
    maximumRuntimeMs: 8_000,
    exactCallerContactAuthorityRefHash: exactContactAuthority,
  };
  return deepFreeze(JSON.parse(canonicalizeStrict(result)));
}
