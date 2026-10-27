/*
 * Append-only, agent-neutral route-proposal occurrence registry v1.
 *
 * This descendant complements the Outcome OS lifecycle without changing it.
 * It preserves any number of hash-only proposal occurrences for one verified
 * Outcome contract. A proposal is neither selection, execution, capacity,
 * authority, nor Outcome truth.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { replayOutcomeOsLifecycleV1 }
  from "./outsider-outcome-os-lifecycle-v1.js";

const PREFIX = "OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_EVENTS = 100_000;

export const OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS
  = Object.freeze({
    event: "outsider/agent-neutral-route-proposal-registry-event/v1",
    head: "outsider/agent-neutral-route-proposal-registry-head/v1",
    receipt: "outsider/agent-neutral-route-proposal-registry-receipt/v1",
    result: "outsider/agent-neutral-route-proposal-registry-result/v1",
    replay: "outsider/agent-neutral-route-proposal-registry-replay/v1",
  });

export const OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS
  = `sha256:${createHash("sha256")
    .update("outsider/agent-neutral-route-proposal-registry/genesis/v1", "utf8")
    .digest("hex")}`;

export const OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_BOUNDARY
  = deepFreeze({
    position: "APPEND_ONLY_AGENT_NEUTRAL_ROUTE_PROPOSAL_OCCURRENCE_REGISTRY",
    outcomeLifecycleSourceReplayRequired: true,
    outcomeContractBound: true,
    outcomeOsArtifactBound: true,
    typedGraphBound: true,
    multipleProposalOccurrencesSupported: true,
    occurrenceDenominatorSeparateFromProposalObjectDeduplication: true,
    sameProposalReferenceMayAppearInDistinctOccurrences: true,
    duplicateOccurrencePermitted: false,
    exactIdempotencyRequired: true,
    agentClientIdentityAccepted: false,
    agentBrandAccepted: false,
    providerNameAccepted: false,
    arbitraryUrlsAccepted: false,
    directPiiAccepted: false,
    credentialsAccepted: false,
    paymentMaterialAccepted: false,
    routeProposalAcceptedAsSelectedRoute: false,
    routeProposalAcceptedAsExecutableCapability: false,
    routeProposalAcceptedAsCapacity: false,
    routeProposalAcceptedAsAuthority: false,
    routeProposalAcceptedAsOutcomeTruth: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

const APPEND_INPUT_FIELDS = Object.freeze([
  "outcomeLifecycleEvents", "registryEvents", "proposal",
]);
const REPLAY_INPUT_FIELDS = Object.freeze([
  "outcomeLifecycleEvents", "registryEvents",
]);
const PROPOSAL_FIELDS = Object.freeze([
  "recordedAt", "idempotencyKeyHash", "expectedRegistryHeadHash",
  "routeProposalRefHash", "occurrenceRefHash",
]);
const LINEAGE_FIELDS = Object.freeze([
  "revision", "predecessorEventHash", "appendOnly", "inPlaceMutationAllowed",
]);
const EVENT_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "contractId",
  "outcomeOsArtifactHash", "typedGraphRefHash",
  "outcomeLifecycleGenesisEventHash", "appendOnlyLineage", "recordedAt",
  "idempotencyKeyHash", "operationHash", "routeProposalRefHash",
  "occurrenceRefHash", "proposalStatus", "agentClientIdentityProjected",
  "routeSelected", "executableCapabilityEstablished", "capacityEstablished",
  "authorityMinted", "outcomeTruthEstablished", "outcomePromiseIssued",
  "guaranteeCreated", "outcomeCommitIssued", "decisionState", "authority",
  "actionReady", "executable", "boundary", "eventHash",
]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function denseEvents(value, code, allowEmpty) {
  if (!Array.isArray(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || (!allowEmpty && value.length === 0) || value.length > MAX_EVENTS
    || Reflect.ownKeys(value).length !== value.length + 1) fail(`${code}_INVALID`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isSafeInteger(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function frozenClone(value) {
  return deepFreeze(JSON.parse(canonicalizeStrict(value)));
}

function lifecycleBinding(inputEvents) {
  const events = frozenClone(denseEvents(inputEvents,
    "OUTCOME_LIFECYCLE_EVENTS", false));
  const replay = replayOutcomeOsLifecycleV1(events);
  if (replay.head.state !== "OPEN") fail("OUTCOME_LIFECYCLE_NOT_OPEN");
  const genesis = events[0];
  const opened = events.find((event) => event.eventType === "CONTRACT_OPENED");
  if (opened === undefined) fail("OUTCOME_LIFECYCLE_OPEN_EVENT_MISSING");
  const completionDeadline = genesis.payload?.outcomeOs?.completionDeadline;
  instant(completionDeadline, "OUTCOME_COMPLETION_DEADLINE");
  return deepFreeze({
    events,
    contractId: replay.head.contractId,
    outcomeOsArtifactHash: replay.head.outcomeOsArtifactHash,
    typedGraphRefHash: replay.head.typedGraphRefHash,
    outcomeLifecycleGenesisEventHash: genesis.eventHash,
    currentOutcomeLifecycleHeadHash: replay.head.headHash,
    outcomeLifecycleOpenedAt: opened.recordedAt,
    completionDeadline,
  });
}

function operationHash(binding, proposal) {
  return digest("outsider/agent-neutral-route-proposal-operation/v1", {
    contractId: binding.contractId,
    outcomeOsArtifactHash: binding.outcomeOsArtifactHash,
    typedGraphRefHash: binding.typedGraphRefHash,
    outcomeLifecycleGenesisEventHash: binding.outcomeLifecycleGenesisEventHash,
    recordedAt: proposal.recordedAt,
    routeProposalRefHash: proposal.routeProposalRefHash,
    occurrenceRefHash: proposal.occurrenceRefHash,
  });
}

function buildEvent(binding, proposal, revision, predecessorEventHash) {
  const body = {
    schema: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS.event,
    schemaVersion: "1.0.0",
    recordClass: "APPEND_ONLY_HASH_ONLY_ROUTE_PROPOSAL_OCCURRENCE",
    contractId: binding.contractId,
    outcomeOsArtifactHash: binding.outcomeOsArtifactHash,
    typedGraphRefHash: binding.typedGraphRefHash,
    outcomeLifecycleGenesisEventHash:
      binding.outcomeLifecycleGenesisEventHash,
    appendOnlyLineage: deepFreeze({
      revision,
      predecessorEventHash,
      appendOnly: true,
      inPlaceMutationAllowed: false,
    }),
    recordedAt: proposal.recordedAt,
    idempotencyKeyHash: proposal.idempotencyKeyHash,
    operationHash: operationHash(binding, proposal),
    routeProposalRefHash: proposal.routeProposalRefHash,
    occurrenceRefHash: proposal.occurrenceRefHash,
    proposalStatus: "DECLARED_HASH_REFERENCE_ONLY",
    agentClientIdentityProjected: false,
    routeSelected: false,
    executableCapabilityEstablished: false,
    capacityEstablished: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, eventHash: digest(body.schema, body) });
}

function normalizeProposal(value) {
  exactObject(value, PROPOSAL_FIELDS, "PROPOSAL");
  return deepFreeze({
    recordedAt: instant(value.recordedAt, "RECORDED_AT"),
    idempotencyKeyHash: hash(value.idempotencyKeyHash,
      "IDEMPOTENCY_KEY_HASH"),
    expectedRegistryHeadHash: hash(value.expectedRegistryHeadHash,
      "EXPECTED_REGISTRY_HEAD_HASH"),
    routeProposalRefHash: hash(value.routeProposalRefHash,
      "ROUTE_PROPOSAL_REF_HASH"),
    occurrenceRefHash: hash(value.occurrenceRefHash, "OCCURRENCE_REF_HASH"),
  });
}

function emptyState(binding) {
  return {
    binding,
    events: [],
    headEventHash: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
    latestRecordedAt: binding.outcomeLifecycleOpenedAt,
    idempotency: new Map(),
    occurrences: new Set(),
    routeProposals: new Set(),
  };
}

function verifyAndApplyEvent(state, value, revision) {
  exactObject(value, EVENT_FIELDS, "EVENT");
  exactObject(value.appendOnlyLineage, LINEAGE_FIELDS, "EVENT_LINEAGE");
  if (value.schema
      !== OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS.event
    || value.schemaVersion !== "1.0.0"
    || value.recordClass !== "APPEND_ONLY_HASH_ONLY_ROUTE_PROPOSAL_OCCURRENCE"
    || value.contractId !== state.binding.contractId
    || value.outcomeOsArtifactHash !== state.binding.outcomeOsArtifactHash
    || value.typedGraphRefHash !== state.binding.typedGraphRefHash
    || value.outcomeLifecycleGenesisEventHash
      !== state.binding.outcomeLifecycleGenesisEventHash
    || value.appendOnlyLineage.revision !== revision
    || value.appendOnlyLineage.predecessorEventHash !== state.headEventHash
    || value.appendOnlyLineage.appendOnly !== true
    || value.appendOnlyLineage.inPlaceMutationAllowed !== false
    || value.proposalStatus !== "DECLARED_HASH_REFERENCE_ONLY"
    || value.agentClientIdentityProjected !== false
    || value.routeSelected !== false
    || value.executableCapabilityEstablished !== false
    || value.capacityEstablished !== false || value.authorityMinted !== false
    || value.outcomeTruthEstablished !== false
    || value.outcomePromiseIssued !== false || value.guaranteeCreated !== false
    || value.outcomeCommitIssued !== false || value.decisionState !== "HOLD"
    || value.authority !== "NONE" || value.actionReady !== false
    || value.executable !== false
    || !same(value.boundary,
      OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_BOUNDARY)) {
    fail("EVENT_FIXED_STATE_OR_BINDING_INVALID");
  }
  const proposal = normalizeProposal({
    recordedAt: value.recordedAt,
    idempotencyKeyHash: value.idempotencyKeyHash,
    expectedRegistryHeadHash: value.appendOnlyLineage.predecessorEventHash,
    routeProposalRefHash: value.routeProposalRefHash,
    occurrenceRefHash: value.occurrenceRefHash,
  });
  const rebuilt = buildEvent(state.binding, proposal, revision,
    state.headEventHash);
  if (value.operationHash !== rebuilt.operationHash
    || value.eventHash !== rebuilt.eventHash || !same(value, rebuilt)) {
    fail("EVENT_DERIVATION_OR_HASH_INVALID");
  }
  if (Date.parse(value.recordedAt) < Date.parse(state.latestRecordedAt)
    || Date.parse(value.recordedAt)
      >= Date.parse(state.binding.completionDeadline)) fail("EVENT_TIME_INVALID");
  if (state.idempotency.has(value.idempotencyKeyHash)) {
    fail("STORED_IDEMPOTENCY_KEY_DUPLICATE");
  }
  if (state.occurrences.has(value.occurrenceRefHash)) {
    fail("STORED_OCCURRENCE_REF_DUPLICATE");
  }
  state.idempotency.set(value.idempotencyKeyHash, {
    revision, operationHash: value.operationHash,
  });
  state.occurrences.add(value.occurrenceRefHash);
  state.routeProposals.add(value.routeProposalRefHash);
  state.events.push(value);
  state.headEventHash = value.eventHash;
  state.latestRecordedAt = value.recordedAt;
}

function headFrom(state) {
  const eventHashes = state.events.map((event) => event.eventHash);
  const body = {
    schema: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS.head,
    schemaVersion: "1.0.0",
    contractId: state.binding.contractId,
    outcomeOsArtifactHash: state.binding.outcomeOsArtifactHash,
    typedGraphRefHash: state.binding.typedGraphRefHash,
    outcomeLifecycleGenesisEventHash:
      state.binding.outcomeLifecycleGenesisEventHash,
    currentOutcomeLifecycleHeadHash:
      state.binding.currentOutcomeLifecycleHeadHash,
    currentRevision: state.events.length - 1,
    proposalOccurrenceCount: state.events.length,
    distinctRouteProposalCount: state.routeProposals.size,
    headEventHash: state.headEventHash,
    eventSetRoot: digest(
      "outsider/agent-neutral-route-proposal-registry-event-set/v1",
      eventHashes),
    routeSelected: false,
    executableCapabilityEstablished: false,
    capacityEstablished: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, headHash: digest(body.schema, body) });
}

function replayInternal(outcomeLifecycleEvents, registryEvents) {
  const binding = lifecycleBinding(outcomeLifecycleEvents);
  const events = frozenClone(denseEvents(registryEvents, "REGISTRY_EVENTS", true));
  const state = emptyState(binding);
  for (let revision = 0; revision < events.length; revision += 1) {
    verifyAndApplyEvent(state, events[revision], revision);
  }
  return { binding, events: deepFreeze(state.events), state,
    head: headFrom(state) };
}

function receipt(event) {
  const body = {
    schema:
      OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    contractId: event.contractId,
    revision: event.appendOnlyLineage.revision,
    eventHash: event.eventHash,
    occurrenceRefHash: event.occurrenceRefHash,
    routeProposalRefHash: event.routeProposalRefHash,
    idempotencyKeyHash: event.idempotencyKeyHash,
    routeSelected: false,
    capacityEstablished: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomeCommitIssued: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(body.schema, body) });
}

/** Append one proposal occurrence after replaying both supplied histories. */
export function appendAgentNeutralRouteProposalV1(input = {}) {
  exactObject(input, APPEND_INPUT_FIELDS, "APPEND_INPUT");
  const before = replayInternal(input.outcomeLifecycleEvents,
    input.registryEvents);
  const proposal = normalizeProposal(input.proposal);
  const operation = operationHash(before.binding, proposal);
  const existing = before.state.idempotency.get(proposal.idempotencyKeyHash);
  if (existing !== undefined) {
    if (existing.operationHash !== operation) fail("IDEMPOTENCY_KEY_CONFLICT");
    const existingEvent = before.events[existing.revision];
    return buildResult(before.events, before.head, existingEvent, true, false);
  }
  if (proposal.expectedRegistryHeadHash !== before.state.headEventHash) {
    fail("EXPECTED_REGISTRY_HEAD_HASH_MISMATCH");
  }
  if (before.state.occurrences.has(proposal.occurrenceRefHash)) {
    fail("OCCURRENCE_REF_DUPLICATE");
  }
  if (Date.parse(proposal.recordedAt) < Date.parse(before.state.latestRecordedAt)
    || Date.parse(proposal.recordedAt)
      >= Date.parse(before.binding.completionDeadline)) fail("PROPOSAL_TIME_INVALID");
  const event = buildEvent(before.binding, proposal, before.events.length,
    before.state.headEventHash);
  const nextEvents = deepFreeze([...before.events, event]);
  const after = replayInternal(input.outcomeLifecycleEvents, nextEvents);
  return buildResult(after.events, after.head, event, false, true);
}

function buildResult(events, head, event, idempotentReplay, eventAppended) {
  const body = {
    schema: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    recordClass: "SOURCE_REPLAYED_ROUTE_PROPOSAL_REGISTRY_APPEND",
    receipt: receipt(event),
    head,
    exportedEvents: frozenClone(events),
    idempotentReplay,
    eventAppended,
    routeSelected: false,
    executableCapabilityEstablished: false,
    capacityEstablished: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, resultHash: digest(body.schema, body) });
}

/** Replay an existing proposal registry against its exact Outcome lifecycle. */
export function replayAgentNeutralRouteProposalRegistryV1(input = {}) {
  exactObject(input, REPLAY_INPUT_FIELDS, "REPLAY_INPUT");
  const replayed = replayInternal(input.outcomeLifecycleEvents,
    input.registryEvents);
  const body = {
    schema: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS.replay,
    schemaVersion: "1.0.0",
    head: replayed.head,
    fullOutcomeLifecycleReplayed: true,
    fullProposalRegistryReplayed: true,
    routeSelected: false,
    executableCapabilityEstablished: false,
    capacityEstablished: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, replayHash: digest(body.schema, body) });
}
