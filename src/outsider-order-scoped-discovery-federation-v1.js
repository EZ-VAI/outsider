/*
 * Outcome Formation Engine: order-scoped discovery federation v1.
 *
 * This module is a pure, bounded orchestrator. Each tender supplies a public
 * plan, while executable node capabilities (and any credentials captured by
 * them) are injected separately. The federation itself performs no network
 * I/O, keeps no provider registry, and gives no discovery result authority.
 * Private node inputs and results stay in process memory and are never part of
 * the serializable projection.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const FEDERATION_ID = /^federation_[a-f0-9]{32}$/u;
const OCCURRENCE_ID = /^discovery_[a-f0-9]{32}$/u;
const NODE_SLOT_ID = /^node_[a-f0-9]{32}$/u;
const REQUIREMENT_ID = /^(?:resource|evidence|recovery)_[a-f0-9]{32}$/u;
const NODE_KIND = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_JOBS_PER_ORDER = 64;
const MAX_CONCURRENCY_PER_ORDER = 8;
const MAX_RUNTIME_MS_PER_JOB = 30_000;
const MAX_NODE_KIND_BYTES = 96;
const MAX_PRIVATE_TREE_DEPTH = 32;
const MAX_PRIVATE_TREE_NODES = 4_096;
const MAX_PRIVATE_ARRAY_LENGTH = 512;
const MAX_PRIVATE_OBJECT_KEYS = 256;
const MAX_PRIVATE_STRING_BYTES = 64 * 1024;
const MAX_PRIVATE_CANONICAL_BYTES = 256 * 1024;

const CAPABILITY_IMPLEMENTATIONS = new WeakMap();
const ISSUED_INVOCATIONS = new WeakMap();
const ISSUED_NODE_RECEIPTS = new WeakMap();
const PRIVATE_FEDERATION_RESULTS = new WeakMap();

const NODE_FAILURE_CODES = new Set([
  "SOURCE_PERMISSION_DENIED",
  "SOURCE_RATE_LIMITED",
  "SOURCE_TIMEOUT",
  "SOURCE_MALFORMED",
  "SOURCE_TRANSPORT_UNAVAILABLE",
  "NODE_DECLARED_FAILURE",
]);

export const OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS
  = Object.freeze({
    plan: "outsider/order-scoped-discovery-federation-plan/v1",
    capability: "outsider/order-scoped-discovery-node-capability/v1",
    invocation: "outsider/order-scoped-discovery-node-invocation/v1",
    nodeReceipt: "outsider/order-scoped-discovery-node-receipt/v1",
    publicProjection:
      "outsider/order-scoped-discovery-federation-privacy-closed-summary/v1",
    privateEphemeral:
      "outsider/order-scoped-discovery-federation-private-ephemeral/v1",
  });

export const OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_LIMITS
  = Object.freeze({
    maximumJobsPerOrder: MAX_JOBS_PER_ORDER,
    maximumConcurrencyPerOrder: MAX_CONCURRENCY_PER_ORDER,
    maximumRuntimeMsPerJob: MAX_RUNTIME_MS_PER_JOB,
    maximumGlobalNodeCount: null,
  });

export const OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_BOUNDARY
  = deepFreeze({
    position: "ORDER_SCOPED_MULTI_NODE_DISCOVERY_FEDERATION_HOLD",
    temporaryDiscoveryNetworkFormedPerTender: true,
    providerRegistryCreated: false,
    standingProviderMembershipRequired: false,
    nodeKindVocabularyHardCoded: false,
    nodeKindMustBeNonSensitivePublicCode: true,
    globalNodeRegistryMaintained: false,
    maximumKnownGlobalNodeCount: null,
    maximumJobsPerOrder: MAX_JOBS_PER_ORDER,
    maximumConcurrencyPerOrder: MAX_CONCURRENCY_PER_ORDER,
    maximumRuntimeMsPerJob: MAX_RUNTIME_MS_PER_JOB,
    atomicFullPlanPreflightBeforeNodeInvocation: true,
    maximumFederationInvocationsPerJob: 1,
    federationRetryPermitted: false,
    deterministicOccurrenceOutputOrder: true,
    federationCoreNetworkIoPerformed: false,
    injectedNodeNetworkIoPossible: true,
    injectedNodeSideEffects: "NOT_INDEPENDENTLY_ESTABLISHED",
    injectedNodeMayIgnoreAbortSignal: true,
    postTimeoutSideEffectsPrevented: false,
    nodeCapabilitiesInjectedPerRun: true,
    nodeCredentialsAcceptedAsSerializableInput: false,
    nodeCredentialsRemainInsideCapabilityClosure: true,
    noNamedNodeReceivesPrivilegedRole: true,
    occurrenceCensusSeparatedFromProviderObjectDedup: true,
    providerObjectDedupPerformed: false,
    providerIdentityOrGlobalScoreCreated: false,
    queryProjected: false,
    queryHashProjected: false,
    rawTokenProjected: false,
    candidateSellerUrlProjected: false,
    resultTitleProjected: false,
    resultSnippetProjected: false,
    resultContactProjected: false,
    resultPoiProjected: false,
    resultDerivedCountProjected: false,
    resultRankingProjected: false,
    resultDerivedFingerprintProjected: false,
    rawNodeResultProjected: false,
    privateNodeResultsDurablyPersisted: false,
    freshSellerOwnedSourceRequiredForDurableCollectorAdmission: true,
    trustedTimeEstablished: false,
    providerContactPerformed: "NOT_INDEPENDENTLY_ESTABLISHED",
    tenderDelivered: "NOT_INDEPENDENTLY_ESTABLISHED",
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    economicsEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    enabledCapabilityCount: 0,
    enabledCapabilityCountScope: "TASK_PROVIDER_ACTION_ONLY",
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NOT_INDEPENDENTLY_ESTABLISHED",
    consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
    hardGateAdmissionPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function ownValue(value, field, code) {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (!descriptor || !Object.hasOwn(descriptor, "value")
    || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  return descriptor.value;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) ownValue(value, field, code);
}

function denseArray(value, maximum, code, allowEmpty = false) {
  if (!Array.isArray(value) || isProxy(value)
    || value.length > maximum || (!allowEmpty && value.length === 0)
    || Reflect.ownKeys(value).length !== value.length + 1) {
    fail(`${code}_INVALID`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_INVALID`);
  }
  return value;
}

function codeString(value, expression, maximumBytes, code) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8")
    > maximumBytes || !expression.test(value)) fail(`${code}_INVALID`);
  return value;
}

function hash(value, code) {
  return codeString(value, HASH, 71, code);
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function verifiedTender(tender) {
  const tenderHash = tender === null || typeof tender !== "object"
    ? null : ownValue(tender, "tenderHash", "TENDER");
  const checked = verifyOutsiderOutcomeTenderV1(tender, {
    expectedTenderHash: tenderHash,
  });
  if (checked.ok !== true || checked.structuralTenderVerified !== true
    || checked.derivationVerified !== true || checked.selfHashVerified !== true
    || checked.expectedHashMatched !== true
    || checked.typedGraphReferencesPreserved !== true
    || checked.zeroInternalOpsVerified !== true
    || checked.authorizationEstablished !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false
    || tender.zeroInternalOps.outsiderStaffInterventionsAllowed !== 0
    || tender.zeroInternalOps.humanQueueFallbackAllowed !== false) {
    fail("TENDER_SOURCE_REPLAY_FAILED");
  }
  return tender;
}

function exactRequirement(tender, kind, id) {
  if (!(["RESOURCE", "EVIDENCE", "RECOVERY"].includes(kind))) {
    fail("REQUIREMENT_KIND_INVALID");
  }
  codeString(id, REQUIREMENT_ID, 41, "REQUIREMENT_ID");
  const section = kind === "RESOURCE" ? tender.resourceRequirements
    : kind === "EVIDENCE" ? tender.evidenceRequirements
      : tender.recoveryRequirements;
  const idField = kind === "RESOURCE" ? "resourceRequirementId"
    : kind === "EVIDENCE" ? "evidenceRequirementId"
      : "recoveryRequirementId";
  const matches = section.items.filter((row) => row[idField] === id);
  if (matches.length !== 1) fail("REQUIREMENT_NOT_EXACTLY_PRESENT_IN_TENDER");
  return deepFreeze({
    requirementKind: kind,
    requirementId: id,
    requirementSetHash: section.requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: tender.tenderHash,
        requirementKind: kind,
        requirementSetHash: section.requirementSetHash,
        requirement: matches[0],
      }),
    requirement: matches[0],
  });
}

function clonePrivateJson(value) {
  const seen = new Set();
  const budget = { nodes: 0 };
  const visit = (current, depth) => {
    budget.nodes += 1;
    if (budget.nodes > MAX_PRIVATE_TREE_NODES
      || depth > MAX_PRIVATE_TREE_DEPTH) fail("PRIVATE_NODE_INPUT_TOO_LARGE");
    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) fail("PRIVATE_NODE_INPUT_INVALID");
      return current;
    }
    if (typeof current === "string") {
      if (Buffer.byteLength(current, "utf8") > MAX_PRIVATE_STRING_BYTES) {
        fail("PRIVATE_NODE_INPUT_TOO_LARGE");
      }
      return current;
    }
    if (typeof current !== "object" || isProxy(current)
      || seen.has(current)) fail("PRIVATE_NODE_INPUT_INVALID");
    seen.add(current);
    if (Array.isArray(current)) {
      denseArray(current, MAX_PRIVATE_ARRAY_LENGTH, "PRIVATE_NODE_INPUT", true);
      const copy = [];
      for (let index = 0; index < current.length; index += 1) {
        copy.push(visit(ownValue(current, String(index),
          "PRIVATE_NODE_INPUT"), depth + 1));
      }
      return copy;
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("PRIVATE_NODE_INPUT_INVALID");
    }
    const keys = Reflect.ownKeys(current);
    if (keys.length > MAX_PRIVATE_OBJECT_KEYS
      || keys.some((key) => typeof key !== "string")) {
      fail("PRIVATE_NODE_INPUT_INVALID");
    }
    const copy = Object.create(null);
    for (const key of keys) {
      if (key === "__proto__" || key === "prototype" || key === "constructor"
        || Buffer.byteLength(key, "utf8") > 128) {
        fail("PRIVATE_NODE_INPUT_INVALID");
      }
      const child = ownValue(current, key, "PRIVATE_NODE_INPUT");
      Object.defineProperty(copy, key, {
        value: visit(child, depth + 1), enumerable: true,
        writable: true, configurable: true,
      });
    }
    return copy;
  };
  const copy = visit(value, 0);
  if (Buffer.byteLength(canonicalizeStrict(copy), "utf8")
    > MAX_PRIVATE_CANONICAL_BYTES) fail("PRIVATE_NODE_INPUT_TOO_LARGE");
  return deepFreeze(copy);
}

/**
 * Create a process-local node capability. `invoke` and everything it closes
 * over (fetch client, API token, local index, remote client) never become part
 * of the capability's serializable metadata or a federation projection.
 */
export function createOrderScopedDiscoveryNodeCapabilityV1(input) {
  exactObject(input, ["nodeKind", "invoke"], "CAPABILITY_INPUT");
  const nodeKind = codeString(input.nodeKind, NODE_KIND,
    MAX_NODE_KIND_BYTES, "NODE_KIND");
  if (typeof input.invoke !== "function") fail("NODE_INVOKE_INVALID");
  const capability = deepFreeze({
    schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.capability,
    schemaVersion: "1.0.0",
    nodeKind,
    capabilityClass: "PROCESS_LOCAL_DISCOVERY_NODE_CLOSURE",
    maximumFederationInvocationsPerJob: 1,
    federationRetryPermitted: false,
    credentialsProjected: false,
    authorityConferred: false,
  });
  CAPABILITY_IMPLEMENTATIONS.set(capability, input.invoke);
  return capability;
}

/** Create the only node receipt shape accepted by this federation. */
export function createOrderScopedDiscoveryNodeReceiptV1(invocation, input) {
  const invocationState = ISSUED_INVOCATIONS.get(invocation);
  if (invocationState === undefined || invocationState.open !== true) {
    fail("INVOCATION_NOT_CURRENTLY_MODULE_ISSUED");
  }
  if (invocationState.receiptIssued === true) {
    fail("INVOCATION_RECEIPT_ALREADY_ISSUED");
  }
  exactObject(input, ["status", "failureCode",
    "externalInfrastructureNetworkIoAttempted"], "NODE_RECEIPT_INPUT");
  if (!(input.status === "SUCCEEDED" || input.status === "FAILED")) {
    fail("NODE_RECEIPT_STATUS_INVALID");
  }
  if ((input.status === "SUCCEEDED" && input.failureCode !== null)
    || (input.status === "FAILED"
      && !NODE_FAILURE_CODES.has(input.failureCode))) {
    fail("NODE_RECEIPT_FAILURE_CODE_INVALID");
  }
  if (typeof input.externalInfrastructureNetworkIoAttempted !== "boolean") {
    fail("NODE_RECEIPT_NETWORK_IO_FLAG_INVALID");
  }
  const receipt = deepFreeze({
    schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.nodeReceipt,
    schemaVersion: "1.0.0",
    status: input.status,
    failureCode: input.failureCode,
    externalInfrastructureNetworkIoAttempted:
      input.externalInfrastructureNetworkIoAttempted,
    nodeDeclaredDiscoverySucceeded: input.status === "SUCCEEDED",
    federationInvocationAttemptCount: 1,
    federationRetryCount: 0,
    providerContactPerformed: "NOT_INDEPENDENTLY_ESTABLISHED",
    tenderDelivered: "NOT_INDEPENDENTLY_ESTABLISHED",
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    economicsEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
  invocationState.receiptIssued = true;
  ISSUED_NODE_RECEIPTS.set(receipt, {
    invocation,
    exactPrivateBindingHash: invocationState.exactPrivateBindingHash,
    consumed: false,
  });
  return receipt;
}

function normalizePlan(plan, tender, asOf) {
  exactObject(plan, ["schema", "federationId", "tenderHash",
    "workOrderHash", "typedGraphHash", "concurrencyLimit", "jobs"],
  "PLAN");
  if (plan.schema
      !== OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan) {
    fail("PLAN_SCHEMA_INVALID");
  }
  codeString(plan.federationId, FEDERATION_ID, 43, "FEDERATION_ID");
  if (plan.tenderHash !== tender.tenderHash
    || plan.workOrderHash !== tender.workOrderHash
    || plan.typedGraphHash !== tender.typedGraph.typedGraphHash) {
    fail("PLAN_TENDER_BINDING_MISMATCH");
  }
  if (!Number.isSafeInteger(plan.concurrencyLimit)
    || plan.concurrencyLimit < 1
    || plan.concurrencyLimit > MAX_CONCURRENCY_PER_ORDER) {
    fail("CONCURRENCY_LIMIT_INVALID");
  }
  denseArray(plan.jobs, MAX_JOBS_PER_ORDER, "JOBS");
  const occurrenceIds = new Set();
  const slotKinds = new Map();
  const jobs = plan.jobs.map((job) => {
    exactObject(job, ["occurrenceId", "nodeSlotId", "nodeKind",
      "requirementKind", "requirementId", "requirementSetHash",
      "requirementObjectHash", "expiresAt", "maximumRuntimeMs"], "JOB");
    codeString(job.occurrenceId, OCCURRENCE_ID, 42, "OCCURRENCE_ID");
    codeString(job.nodeSlotId, NODE_SLOT_ID, 37, "NODE_SLOT_ID");
    const nodeKind = codeString(job.nodeKind, NODE_KIND,
      MAX_NODE_KIND_BYTES, "NODE_KIND");
    if (occurrenceIds.has(job.occurrenceId)) fail("OCCURRENCE_ID_DUPLICATE");
    occurrenceIds.add(job.occurrenceId);
    if (slotKinds.has(job.nodeSlotId)
      && slotKinds.get(job.nodeSlotId) !== nodeKind) {
      fail("NODE_SLOT_KIND_CONFLICT");
    }
    slotKinds.set(job.nodeSlotId, nodeKind);
    const requirement = exactRequirement(tender, job.requirementKind,
      job.requirementId);
    if (job.requirementSetHash !== requirement.requirementSetHash
      || job.requirementObjectHash !== requirement.requirementObjectHash) {
      fail("JOB_REQUIREMENT_BINDING_MISMATCH");
    }
    const expiresAt = instant(job.expiresAt, "JOB_EXPIRES_AT");
    if (Date.parse(expiresAt) <= Date.parse(asOf)
      || Date.parse(expiresAt) > Date.parse(tender.formationDeadline)) {
      fail("JOB_TIME_WINDOW_INVALID");
    }
    if (!Number.isSafeInteger(job.maximumRuntimeMs)
      || job.maximumRuntimeMs < 1
      || job.maximumRuntimeMs > MAX_RUNTIME_MS_PER_JOB) {
      fail("JOB_MAXIMUM_RUNTIME_MS_INVALID");
    }
    return deepFreeze({
      occurrenceId: job.occurrenceId,
      nodeSlotId: job.nodeSlotId,
      nodeKind,
      requirementKind: requirement.requirementKind,
      requirementId: requirement.requirementId,
      requirementSetHash: requirement.requirementSetHash,
      requirementObjectHash: requirement.requirementObjectHash,
      expiresAt,
      maximumRuntimeMs: job.maximumRuntimeMs,
      requirement: requirement.requirement,
    });
  });
  const publicJobs = jobs.map((job) => ({
    occurrenceId: job.occurrenceId,
    nodeSlotId: job.nodeSlotId,
    nodeKind: job.nodeKind,
    requirementKind: job.requirementKind,
    requirementId: job.requirementId,
    requirementSetHash: job.requirementSetHash,
    requirementObjectHash: job.requirementObjectHash,
    expiresAt: job.expiresAt,
    maximumRuntimeMs: job.maximumRuntimeMs,
  }));
  const planHash = digest(
    OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan, {
      schema: plan.schema,
      federationId: plan.federationId,
      tenderHash: tender.tenderHash,
      workOrderHash: tender.workOrderHash,
      typedGraphHash: tender.typedGraph.typedGraphHash,
      concurrencyLimit: plan.concurrencyLimit,
      jobs: publicJobs,
    });
  return { federationId: plan.federationId,
    concurrencyLimit: plan.concurrencyLimit, jobs, slotKinds, planHash };
}

function normalizePrivateJobs(privateJobs, jobs, tender, asOf,
  privateProjectionNonce) {
  denseArray(privateJobs, MAX_JOBS_PER_ORDER, "PRIVATE_JOBS");
  if (privateJobs.length !== jobs.length) fail("PRIVATE_JOB_BIJECTION_INVALID");
  const nonces = new Set();
  return privateJobs.map((privateJob, index) => {
    exactObject(privateJob, ["occurrenceId", "nodeInput",
      "privateBindingNonce"], "PRIVATE_JOB");
    if (privateJob.occurrenceId !== jobs[index].occurrenceId) {
      fail("PRIVATE_JOB_BIJECTION_INVALID");
    }
    hash(privateJob.privateBindingNonce, "PRIVATE_BINDING_NONCE");
    if (nonces.has(privateJob.privateBindingNonce)) {
      fail("PRIVATE_BINDING_NONCE_DUPLICATE");
    }
    nonces.add(privateJob.privateBindingNonce);
    const nodeInput = clonePrivateJson(privateJob.nodeInput);
    const job = jobs[index];
    const exactPrivateBindingHash = digest(
      "outsider/order-scoped-discovery-private-job-binding/v1", {
        privateProjectionNonce,
        privateBindingNonce: privateJob.privateBindingNonce,
        tenderHash: tender.tenderHash,
        workOrderHash: tender.workOrderHash,
        typedGraphHash: tender.typedGraph.typedGraphHash,
        asOf,
        publicJob: {
          occurrenceId: job.occurrenceId,
          nodeSlotId: job.nodeSlotId,
          nodeKind: job.nodeKind,
          requirementKind: job.requirementKind,
          requirementId: job.requirementId,
          requirementSetHash: job.requirementSetHash,
          requirementObjectHash: job.requirementObjectHash,
          expiresAt: job.expiresAt,
          maximumRuntimeMs: job.maximumRuntimeMs,
        },
        nodeInput,
      });
    return deepFreeze({
      occurrenceId: privateJob.occurrenceId,
      nodeInput,
      privateBindingNonce: privateJob.privateBindingNonce,
      exactPrivateBindingHash,
    });
  });
}

function normalizeCapabilities(dependencies, slotKinds) {
  exactObject(dependencies, ["capabilityBindings"], "DEPENDENCIES");
  denseArray(dependencies.capabilityBindings, MAX_JOBS_PER_ORDER,
    "CAPABILITY_BINDINGS");
  if (dependencies.capabilityBindings.length !== slotKinds.size) {
    fail("CAPABILITY_BINDING_BIJECTION_INVALID");
  }
  const capabilities = new Map();
  for (const binding of dependencies.capabilityBindings) {
    exactObject(binding, ["nodeSlotId", "capability"],
      "CAPABILITY_BINDING");
    codeString(binding.nodeSlotId, NODE_SLOT_ID, 37, "NODE_SLOT_ID");
    if (!slotKinds.has(binding.nodeSlotId)
      || capabilities.has(binding.nodeSlotId)) {
      fail("CAPABILITY_BINDING_BIJECTION_INVALID");
    }
    const invoke = CAPABILITY_IMPLEMENTATIONS.get(binding.capability);
    if (invoke === undefined || binding.capability.nodeKind
      !== slotKinds.get(binding.nodeSlotId)) {
      fail("CAPABILITY_BINDING_INVALID");
    }
    capabilities.set(binding.nodeSlotId, deepFreeze({
      nodeKind: binding.capability.nodeKind,
      invoke,
    }));
  }
  return capabilities;
}

function preflight(input, dependencies) {
  exactObject(input, ["tender", "asOf", "publicPlan", "privateJobs",
    "privateProjectionNonce"], "INPUT");
  const tender = verifiedTender(input.tender);
  const asOf = instant(input.asOf, "AS_OF");
  if (Date.parse(asOf) < Date.parse(tender.compiledAt)
    || Date.parse(asOf) >= Date.parse(tender.formationDeadline)) {
    fail("AS_OF_OUTSIDE_FORMATION_WINDOW");
  }
  hash(input.privateProjectionNonce, "PRIVATE_PROJECTION_NONCE");
  const plan = normalizePlan(input.publicPlan, tender, asOf);
  const privateJobs = normalizePrivateJobs(input.privateJobs, plan.jobs,
    tender, asOf, input.privateProjectionNonce);
  const capabilities = normalizeCapabilities(dependencies, plan.slotKinds);
  return { tender, asOf, privateProjectionNonce: input.privateProjectionNonce,
    ...plan, privateJobs, capabilities };
}

function validateNodeResult(value, invocation) {
  try {
    exactObject(value, ["publicReceipt", "privateEphemeral"], "NODE_RESULT");
    const receiptState = ISSUED_NODE_RECEIPTS.get(value.publicReceipt);
    if (receiptState === undefined || receiptState.invocation !== invocation
      || receiptState.exactPrivateBindingHash
        !== invocation.exactPrivateBindingHash
      || receiptState.consumed === true) return null;
    receiptState.consumed = true;
    return { receipt: value.publicReceipt,
      privateEphemeral: value.privateEphemeral };
  } catch {
    return null;
  }
}

function failedOccurrence(job, failureCode, networkIoAttempted,
  invocationAttemptCount = 1) {
  return deepFreeze({
    occurrenceId: job.occurrenceId,
    nodeSlotId: job.nodeSlotId,
    nodeKind: job.nodeKind,
    requirementKind: job.requirementKind,
    requirementId: job.requirementId,
    requirementSetHash: job.requirementSetHash,
    requirementObjectHash: job.requirementObjectHash,
    expiresAt: job.expiresAt,
    maximumRuntimeMs: job.maximumRuntimeMs,
    status: "FAILED",
    failureCode,
    federationInvocationAttemptCount: invocationAttemptCount,
    federationRetryCount: 0,
    externalInfrastructureNetworkIoAttempted: networkIoAttempted,
    nodeInternalRetryAbsenceIndependentlyEstablished: false,
    providerContactPerformed: "NOT_INDEPENDENTLY_ESTABLISHED",
    tenderDelivered: "NOT_INDEPENDENTLY_ESTABLISHED",
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    economicsEstablished: false,
    resultMaterialProjected: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}

function successfulOccurrence(job, receipt) {
  return deepFreeze({
    occurrenceId: job.occurrenceId,
    nodeSlotId: job.nodeSlotId,
    nodeKind: job.nodeKind,
    requirementKind: job.requirementKind,
    requirementId: job.requirementId,
    requirementSetHash: job.requirementSetHash,
    requirementObjectHash: job.requirementObjectHash,
    expiresAt: job.expiresAt,
    maximumRuntimeMs: job.maximumRuntimeMs,
    status: receipt.status,
    failureCode: receipt.failureCode,
    federationInvocationAttemptCount: 1,
    federationRetryCount: 0,
    externalInfrastructureNetworkIoAttempted:
      receipt.externalInfrastructureNetworkIoAttempted,
    nodeInternalRetryAbsenceIndependentlyEstablished: false,
    providerContactPerformed: "NOT_INDEPENDENTLY_ESTABLISHED",
    tenderDelivered: "NOT_INDEPENDENTLY_ESTABLISHED",
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    economicsEstablished: false,
    resultMaterialProjected: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}

async function invokeOne(prepared, index) {
  const job = prepared.jobs[index];
  const privateJob = prepared.privateJobs[index];
  const capability = prepared.capabilities.get(job.nodeSlotId);
  const localNowBeforeInvocation = Date.now();
  const expiresAtMs = Date.parse(job.expiresAt);
  if (localNowBeforeInvocation >= expiresAtMs) {
    return { occurrence: failedOccurrence(job,
      "NODE_EXPIRED_BEFORE_INVOCATION", false, 0), privateEphemeral: null };
  }
  const controller = new AbortController();
  const invocation = {
    schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.invocation,
    tender: prepared.tender,
    asOf: prepared.asOf,
    occurrenceId: job.occurrenceId,
    nodeSlotId: job.nodeSlotId,
    nodeKind: job.nodeKind,
    requirementKind: job.requirementKind,
    requirementId: job.requirementId,
    requirementSetHash: job.requirementSetHash,
    requirementObjectHash: job.requirementObjectHash,
    requirement: job.requirement,
    expiresAt: job.expiresAt,
    maximumRuntimeMs: job.maximumRuntimeMs,
    nodeInput: privateJob.nodeInput,
    privateBindingNonce: privateJob.privateBindingNonce,
    exactPrivateBindingHash: privateJob.exactPrivateBindingHash,
    federationRetryCount: 0,
  };
  for (const key of Reflect.ownKeys(invocation)) {
    deepFreeze(invocation[key]);
  }
  Object.defineProperty(invocation, "abortSignal", {
    value: controller.signal,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.freeze(invocation);
  const invocationState = {
    open: true,
    receiptIssued: false,
    exactPrivateBindingHash: privateJob.exactPrivateBindingHash,
  };
  ISSUED_INVOCATIONS.set(invocation, invocationState);
  const maximumRuntimeMs = Math.min(job.maximumRuntimeMs,
    Math.max(1, expiresAtMs - localNowBeforeInvocation));
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "TIMEOUT" });
    }, maximumRuntimeMs);
  });
  const call = Promise.resolve()
    .then(() => capability.invoke(invocation))
    .then((value) => ({ kind: "RESULT", value }),
      () => ({ kind: "THREW" }));
  const outcome = await Promise.race([call, timeout]);
  clearTimeout(timer);
  invocationState.open = false;
  if (outcome.kind === "TIMEOUT") {
    return { occurrence: failedOccurrence(job, "NODE_INVOCATION_TIMEOUT",
      null), privateEphemeral: null };
  }
  if (outcome.kind === "THREW") {
    return { occurrence: failedOccurrence(job, "NODE_INVOCATION_FAILED",
      null), privateEphemeral: null };
  }
  const checked = validateNodeResult(outcome.value, invocation);
  if (checked === null) {
    return { occurrence: failedOccurrence(job, "NODE_RESULT_MALFORMED",
      null), privateEphemeral: null };
  }
  return { occurrence: successfulOccurrence(job, checked.receipt),
    privateEphemeral: checked.privateEphemeral };
}

function createEnvelope(prepared, completed) {
  const occurrences = completed.map((row) => row.occurrence);
  const succeeded = occurrences.filter((row) => row.status === "SUCCEEDED")
    .length;
  const publicJobs = prepared.jobs.map((job) => deepFreeze({
    occurrenceId: job.occurrenceId,
    nodeSlotId: job.nodeSlotId,
    nodeKind: job.nodeKind,
    requirementKind: job.requirementKind,
    requirementId: job.requirementId,
    requirementSetHash: job.requirementSetHash,
    requirementObjectHash: job.requirementObjectHash,
    expiresAt: job.expiresAt,
    maximumRuntimeMs: job.maximumRuntimeMs,
  }));
  const publicProjection = deepFreeze({
    schema:
      OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.publicProjection,
    schemaVersion: "1.0.0",
    recordClass: "ORDER_SCOPED_DISCOVERY_FEDERATION_PRIVACY_CLOSED_SUMMARY",
    federationId: prepared.federationId,
    planHash: prepared.planHash,
    tenderHash: prepared.tender.tenderHash,
    workOrderHash: prepared.tender.workOrderHash,
    typedGraphHash: prepared.tender.typedGraph.typedGraphHash,
    asOf: prepared.asOf,
    concurrencyLimit: prepared.concurrencyLimit,
    jobs: publicJobs,
    occurrences,
    occurrenceCensus: {
      plannedOccurrenceCount: occurrences.length,
      invokedOccurrenceCount: occurrences.reduce((sum, row) =>
        sum + row.federationInvocationAttemptCount, 0),
      succeededOccurrenceCount: succeeded,
      failedOccurrenceCount: occurrences.length - succeeded,
      countsAreDiscoveryJobOccurrencesNotSearchResults: true,
      occurrenceCensusSeparatedFromProviderObjectDedup: true,
      providerObjectDedupPerformed: false,
      providerCount: null,
    },
    exactTenderRequirementBindingVerified: true,
    fullPlanPreflightCompletedBeforeFirstInvocation: true,
    federationCoreNetworkIoPerformed: false,
    injectedNodeNetworkIoPossible: true,
    injectedNodeSideEffects: "NOT_INDEPENDENTLY_ESTABLISHED",
    injectedNodeMayIgnoreAbortSignal: true,
    postTimeoutSideEffectsPrevented: false,
    localWallClockExpiryRefusalEnforced: true,
    maximumFederationInvocationsPerJob: 1,
    federationRetryPermitted: false,
    providerRegistryCreated: false,
    queryProjected: false,
    queryHashProjected: false,
    rawTokenProjected: false,
    candidateSellerUrlProjected: false,
    resultTitleProjected: false,
    resultSnippetProjected: false,
    resultContactProjected: false,
    resultPoiProjected: false,
    resultDerivedCountProjected: false,
    resultRankingProjected: false,
    resultDerivedFingerprintProjected: false,
    rawNodeResultProjected: false,
    freshSellerOwnedSourceRequiredForDurableCollectorAdmission: true,
    trustedTimeEstablished: false,
    providerContactPerformed: "NOT_INDEPENDENTLY_ESTABLISHED",
    tenderDelivered: "NOT_INDEPENDENTLY_ESTABLISHED",
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    economicsEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    enabledCapabilityCount: 0,
    enabledCapabilityCountScope: "TASK_PROVIDER_ACTION_ONLY",
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NOT_INDEPENDENTLY_ESTABLISHED",
    consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
    hardGateAdmissionPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    result: "DISCOVERY_OCCURRENCES_RECORDED_HOLD",
    boundary: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_BOUNDARY,
  });
  const privateEphemeral = deepFreeze({
    schema:
      OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.privateEphemeral,
    retention: "PROCESS_MEMORY_UNTIL_CLAIM_OR_GARBAGE_COLLECTION",
    exactPrivateBindingHashes: prepared.privateJobs.map(
      (job) => job.exactPrivateBindingHash),
    nodeResultsConsumableOnce: true,
    rawNodeResultsInSerializableEnvelope: false,
    credentialsRetainedInResult: false,
  });
  const result = { publicProjection };
  Object.defineProperty(result, "privateEphemeral", {
    value: privateEphemeral,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.freeze(result);
  const leases = new Map();
  for (let index = 0; index < completed.length; index += 1) {
    if (completed[index].privateEphemeral !== null) {
      leases.set(prepared.jobs[index].occurrenceId, {
        value: completed[index].privateEphemeral, consumed: false,
      });
    }
  }
  PRIVATE_FEDERATION_RESULTS.set(result, leases);
  return result;
}

/**
 * Invoke a bounded, order-scoped set of injected discovery nodes.
 * All inputs and bindings are validated before any capability is invoked.
 */
export async function runOrderScopedDiscoveryFederationV1(input,
  dependencies) {
  const prepared = preflight(input, dependencies);
  const completed = new Array(prepared.jobs.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= prepared.jobs.length) return;
      completed[index] = await invokeOne(prepared, index);
    }
  };
  const workers = [];
  const workerCount = Math.min(prepared.concurrencyLimit,
    prepared.jobs.length);
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return createEnvelope(prepared, completed);
}

/** Claim one exact module-issued private node result, once. */
export function claimOrderScopedDiscoveryNodeResultV1(result,
  occurrenceId) {
  const leases = PRIVATE_FEDERATION_RESULTS.get(result);
  if (leases === undefined) fail("FEDERATION_RESULT_NOT_MODULE_ISSUED");
  codeString(occurrenceId, OCCURRENCE_ID, 42, "OCCURRENCE_ID");
  const lease = leases.get(occurrenceId);
  if (lease === undefined) fail("PRIVATE_NODE_RESULT_NOT_AVAILABLE");
  if (lease.consumed) fail("PRIVATE_NODE_RESULT_ALREADY_CONSUMED");
  lease.consumed = true;
  return lease.value;
}

export const runOutsiderOrderScopedDiscoveryFederationV1
  = runOrderScopedDiscoveryFederationV1;
