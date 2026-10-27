/*
 * Outcome Formation Engine: official MCP Registry discovery adapter v1.
 *
 * This adapter performs one unauthenticated GET against the fixed, public
 * MCP Registry v0.1 server-list endpoint. Registry rows are discovery
 * occurrences, not providers. Only literal public HTTPS remote transports
 * become module-private, one-use candidates. Server names, versions,
 * descriptions, URLs, raw responses, result counts, and result-derived hashes
 * never enter the public projection.
 *
 * A registry listing is metadata supplied by a publisher. It establishes no
 * endpoint reachability, identity, ownership, safety, authority, willingness,
 * price, capacity, reservation, or outcome truth.
 */

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const MCP_REGISTRY_ORIGIN = "https://registry.modelcontextprotocol.io";
const MCP_REGISTRY_SERVERS_PATH = "/v0.1/servers";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_SEARCH_BYTES = 400;
const MAX_SEARCH_WORDS = 50;
const MAX_RESULTS = 10;
const MAX_REMOTES_PER_OCCURRENCE = 64;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const PREFIX = "OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REQUIREMENT_ID = /^(?:resource|evidence|recovery)_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const REMOTE_TRANSPORT_TYPES = new Set(["streamable-http", "sse"]);
const EPHEMERAL_ENVELOPES = new WeakMap();
const FEDERATION_NODE_KIND = "mcp.registry.v01";

export const OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_SCHEMAS
  = Object.freeze({
    privateEphemeral:
      "outsider/mcp-registry-caller-private-ephemeral-remote-discovery/v1",
    publicProjection:
      "outsider/mcp-registry-privacy-closed-transport-summary/v1",
  });

export const OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_ENDPOINT
  = Object.freeze({
    origin: MCP_REGISTRY_ORIGIN,
    path: MCP_REGISTRY_SERVERS_PATH,
    apiVersion: "v0.1",
    method: "GET",
  });

export const OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_BOUNDARY
  = deepFreeze({
    position: "ORDER_SCOPED_PUBLIC_MCP_REGISTRY_DISCOVERY_ONLY",
    fixedOfficialRegistryOrigin: MCP_REGISTRY_ORIGIN,
    fixedOfficialRegistryPath: MCP_REGISTRY_SERVERS_PATH,
    registryApiVersion: "v0.1",
    registryReleaseState: "PREVIEW",
    arbitraryOriginAccepted: false,
    arbitraryEndpointAccepted: false,
    unauthenticatedReadOnlyRequest: true,
    credentialsAccepted: false,
    maximumRequestAttempts: 1,
    maximumResultOccurrencesRequested: MAX_RESULTS,
    retryPermitted: false,
    redirectPermitted: false,
    externalInfrastructureNetworkIoPossible: true,
    maximumResponseBytes: MAX_RESPONSE_BYTES,
    responseBodyLimitEnforcedBeforeJsonParsing: true,
    jsonContentTypeRequired: true,
    exactTenderRequirementWindowBindingRequired: true,
    callerDeclaredAsOfTrustedTime: false,
    serverNameProjected: false,
    serverVersionProjected: false,
    serverDescriptionProjected: false,
    remoteTransportUrlProjected: false,
    rawResponseProjected: false,
    resultDerivedCountProjected: false,
    resultDerivedHashProjected: false,
    occurrenceRowsTreatedAsProviders: false,
    occurrenceRowsMayRepresentMultipleVersions: true,
    providerRegistryCreated: false,
    candidateLeaseRetention: "CALLER_PRIVATE_EPHEMERAL_DO_NOT_PERSIST",
    candidateLeaseConsumableOnce: true,
    candidateRemoteReachabilityEstablished: false,
    providerIdentityEstablished: false,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    safetyEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    providerContactPerformed: false,
    tenderDelivered: false,
    providerAcceptanceEstablished: false,
    priceEstablished: false,
    settlementPermitted: false,
    productionExecutionAuthorityReplayed: false,
    productionExecutionPermitted: false,
    internalHumanFallbackPermitted: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
    infrastructureConsequenceReach:
      "ONE_BOUNDED_UNAUTHENTICATED_MCP_REGISTRY_GET",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

export const OUTSIDER_MCP_REGISTRY_DISCOVERY_FAILURE_CODES_V1
  = Object.freeze([
    "SOURCE_PERMISSION_DENIED",
    "SOURCE_RATE_LIMITED",
    "SOURCE_TIMEOUT",
    "SOURCE_REDIRECT_REFUSED",
    "SOURCE_MALFORMED",
    "SOURCE_TRANSPORT_UNAVAILABLE",
  ]);

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${code}_OBJECT_INVALID`);
  }
  if (isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
}

function verifiedTender(tender) {
  const descriptor = tender === null || typeof tender !== "object"
    ? null : Object.getOwnPropertyDescriptor(tender, "tenderHash");
  if (!descriptor || !Object.hasOwn(descriptor, "value")) {
    fail("TENDER_HASH_REQUIRED");
  }
  const checked = verifyOutsiderOutcomeTenderV1(tender, {
    expectedTenderHash: descriptor.value,
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

function requirementBinding(tender, kind, id) {
  if (!(kind === "RESOURCE" || kind === "EVIDENCE" || kind === "RECOVERY")) {
    fail("REQUIREMENT_KIND_INVALID");
  }
  if (typeof id !== "string" || !REQUIREMENT_ID.test(id)) {
    fail("REQUIREMENT_ID_INVALID");
  }
  const rows = kind === "RESOURCE" ? tender.resourceRequirements.items
    : kind === "EVIDENCE" ? tender.evidenceRequirements.items
      : tender.recoveryRequirements.items;
  const requirementSetHash = kind === "RESOURCE"
    ? tender.resourceRequirements.requirementSetHash
    : kind === "EVIDENCE" ? tender.evidenceRequirements.requirementSetHash
      : tender.recoveryRequirements.requirementSetHash;
  const idField = kind === "RESOURCE" ? "resourceRequirementId"
    : kind === "EVIDENCE" ? "evidenceRequirementId"
      : "recoveryRequirementId";
  const matches = rows.filter((row) => row[idField] === id);
  if (matches.length !== 1) fail("REQUIREMENT_NOT_EXACTLY_PRESENT_IN_TENDER");
  return deepFreeze({
    requirementKind: kind,
    requirementId: id,
    requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: tender.tenderHash,
        requirementKind: kind,
        requirementSetHash,
        requirement: matches[0],
      }),
  });
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function normalizeDiscovery(value) {
  exactObject(value, ["search", "limit"], "DISCOVERY");
  if (typeof value.search !== "string") fail("DISCOVERY_SEARCH_INVALID");
  const search = value.search.trim();
  if (search.length === 0
    || Buffer.byteLength(search, "utf8") > MAX_SEARCH_BYTES
    || search.split(/\s+/u).length > MAX_SEARCH_WORDS
    || /[\u0000-\u001f\u007f]/u.test(search)) {
    fail("DISCOVERY_SEARCH_INVALID");
  }
  if (!Number.isSafeInteger(value.limit)
    || value.limit < 1 || value.limit > MAX_RESULTS) {
    fail("DISCOVERY_LIMIT_INVALID");
  }
  return deepFreeze({ search, limit: value.limit });
}

function normalizeInput(input) {
  exactObject(input, ["tender", "requirementKind", "requirementId",
    "discovery", "asOf", "expiresAt", "privateBindingNonce"], "INPUT");
  const tender = verifiedTender(input.tender);
  const requirement = requirementBinding(tender, input.requirementKind,
    input.requirementId);
  const discovery = normalizeDiscovery(input.discovery);
  const asOf = instant(input.asOf, "AS_OF");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (Date.parse(asOf) < Date.parse(tender.compiledAt)
    || Date.parse(asOf) >= Date.parse(tender.formationDeadline)
    || Date.parse(expiresAt) <= Date.parse(asOf)
    || Date.parse(expiresAt) > Date.parse(tender.formationDeadline)) {
    fail("DISCOVERY_TIME_WINDOW_INVALID");
  }
  if (typeof input.privateBindingNonce !== "string"
    || !HASH.test(input.privateBindingNonce)) {
    fail("PRIVATE_BINDING_NONCE_INVALID");
  }
  return { tender, requirement, discovery, asOf, expiresAt,
    privateBindingNonce: input.privateBindingNonce };
}

function normalizeDependencies(dependencies) {
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies)) fail("DEPENDENCIES_INVALID");
  const prototype = Object.getPrototypeOf(dependencies);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("DEPENDENCIES_INVALID");
  }
  const keys = Reflect.ownKeys(dependencies);
  if (!keys.every((key) => key === "fetchImpl" || key === "timeoutMs")
    || !keys.includes("fetchImpl")) fail("DEPENDENCIES_FIELDS_INVALID");
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(dependencies, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail("DEPENDENCIES_FIELDS_INVALID");
  }
  const fetchImpl = dependencies.fetchImpl;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_INVALID");
  if (!Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) fail("TIMEOUT_INVALID");
  return { fetchImpl, timeoutMs };
}

function requestUrl(discovery) {
  const url = new URL(MCP_REGISTRY_SERVERS_PATH, MCP_REGISTRY_ORIGIN);
  url.searchParams.set("search", discovery.search);
  url.searchParams.set("limit", String(discovery.limit));
  return url;
}

function privateBinding(normalized) {
  const binding = {
    tenderHash: normalized.tender.tenderHash,
    workOrderHash: normalized.tender.workOrderHash,
    typedGraphHash: normalized.tender.typedGraph.typedGraphHash,
    requirementKind: normalized.requirement.requirementKind,
    requirementId: normalized.requirement.requirementId,
    requirementSetHash: normalized.requirement.requirementSetHash,
    requirementObjectHash: normalized.requirement.requirementObjectHash,
    endpoint: OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_ENDPOINT,
    discovery: normalized.discovery,
    asOf: normalized.asOf,
    expiresAt: normalized.expiresAt,
  };
  return deepFreeze({
    tenderHash: normalized.tender.tenderHash,
    requirementKind: normalized.requirement.requirementKind,
    requirementId: normalized.requirement.requirementId,
    requirementObjectHash: normalized.requirement.requirementObjectHash,
    asOf: normalized.asOf,
    expiresAt: normalized.expiresAt,
    discoveryHash: digest(
      "outsider/mcp-registry-exact-private-discovery/v1",
      normalized.discovery),
    exactTenderRequirementDiscoveryWindowBindingHash: digest(
      "outsider/mcp-registry-private-tender-requirement-window-binding/v1", {
        privateBindingNonce: normalized.privateBindingNonce,
        binding,
      }),
  });
}

function safePublicRemoteUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 16_384
    || raw.includes("{") || raw.includes("}")) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.port !== "") return null;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")
    || hostname.endsWith(".local") || isIP(hostname) !== 0) return null;
  parsed.hash = "";
  return parsed.href;
}

function hasNoRemoteInputs(remote) {
  const headers = Object.hasOwn(remote, "headers") ? remote.headers : null;
  const variables = Object.hasOwn(remote, "variables")
    ? remote.variables : null;
  const noHeaders = headers === null || headers === undefined
    || (Array.isArray(headers) && headers.length === 0);
  const noVariables = variables === null || variables === undefined
    || (typeof variables === "object" && !Array.isArray(variables)
      && Object.keys(variables).length === 0);
  return noHeaders && noVariables;
}

function extractCandidates(raw, maximum) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)
    || !Array.isArray(raw.servers) || raw.servers.length > maximum) {
    return null;
  }
  const candidates = [];
  const seen = new Set();
  for (const occurrence of raw.servers) {
    if (occurrence === null || typeof occurrence !== "object"
      || Array.isArray(occurrence) || occurrence.server === null
      || typeof occurrence.server !== "object"
      || Array.isArray(occurrence.server)) return null;
    const remotes = occurrence.server.remotes;
    if (remotes === undefined || remotes === null) continue;
    if (!Array.isArray(remotes)
      || remotes.length > MAX_REMOTES_PER_OCCURRENCE) return null;
    for (const remote of remotes) {
      if (remote === null || typeof remote !== "object"
        || Array.isArray(remote)) return null;
      if (!REMOTE_TRANSPORT_TYPES.has(remote.type)
        || !hasNoRemoteInputs(remote)) continue;
      const remoteTransportUrl = safePublicRemoteUrl(remote.url);
      if (remoteTransportUrl === null) continue;
      const key = `${remote.type}\0${remoteTransportUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(deepFreeze({
        routeKind: "PUBLIC_MCP_REMOTE_TRANSPORT",
        remoteTransportType: remote.type,
        remoteTransportUrl,
        remoteTransportReachabilityEstablished: false,
        serverIdentityEstablished: false,
        providerIdentityEstablished: false,
        providerOwnershipEstablished: false,
        resourceOwnerAuthorityEstablished: false,
        safetyEstablished: false,
        capacityEstablished: false,
        capacityReserved: false,
        actionPermitted: false,
      }));
    }
  }
  return deepFreeze(candidates);
}

function projectionBody(status, failureCode) {
  return {
    schema:
      OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_SCHEMAS.publicProjection,
    schemaVersion: "1.0.0",
    recordClass: "MCP_REGISTRY_PRIVACY_CLOSED_TRANSPORT_STATUS",
    status,
    failureCode,
    requestAttempted: true,
    requestMethod: "GET",
    fixedOfficialEndpointUsed: true,
    credentialPresented: false,
    redirectFollowed: false,
    retryPerformed: false,
    timeoutEnforced: true,
    responseBodyLimitEnforcedBeforeJsonParsing: true,
    registryReadSucceeded: status === "SUCCEEDED",
    serverNameProjected: false,
    serverVersionProjected: false,
    serverDescriptionProjected: false,
    remoteTransportUrlProjected: false,
    rawResponseProjected: false,
    resultDerivedHashProjected: false,
    occurrenceRowsTreatedAsProviders: false,
    providerIdentityEstablished: false,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    safetyEstablished: false,
    capacityEstablished: false,
    productionExecutionAuthorityReplayed: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
}

function envelope(binding, candidates, status, failureCode) {
  const body = projectionBody(status, failureCode);
  const publicProjection = deepFreeze({
    ...body,
    projectionHash: digest(
      OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_SCHEMAS.publicProjection,
      body),
  });
  const privateEphemeral = deepFreeze({
    schema:
      OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_SCHEMAS.privateEphemeral,
    retention: "CALLER_PRIVATE_EPHEMERAL_DO_NOT_PERSIST",
    binding,
    candidateLeaseCount: candidates.length,
    candidateLeaseConsumableOnce: true,
    occurrenceRowsAreNotProviders: true,
    rawResponseRetained: false,
    serverMetadataRetained: false,
    resultDerivedHashRetained: false,
    credentialRetained: false,
  });
  const result = { publicProjection };
  Object.defineProperty(result, "privateEphemeral", {
    value: privateEphemeral,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.freeze(result);
  EPHEMERAL_ENVELOPES.set(result, {
    binding,
    candidates,
    consumed: new Set(),
  });
  return result;
}

/**
 * Verify, without consuming a remote candidate lease, that an adapter envelope
 * was issued by this module for this exact live federation invocation.
 */
export function verifyMcpRegistryDiscoveryEnvelopeForFederationV1(
  result, invocation) {
  const state = EPHEMERAL_ENVELOPES.get(result);
  if (state === undefined) fail("FEDERATION_ENVELOPE_NOT_MODULE_ISSUED");
  if (invocation === null || typeof invocation !== "object"
    || Array.isArray(invocation) || isProxy(invocation)) {
    fail("FEDERATION_INVOCATION_INVALID");
  }
  const required = ["tender", "asOf", "nodeKind", "requirementKind",
    "requirementId", "requirementSetHash", "requirementObjectHash",
    "expiresAt", "nodeInput", "privateBindingNonce"];
  for (const field of required) {
    const descriptor = Object.getOwnPropertyDescriptor(invocation, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      fail("FEDERATION_INVOCATION_INVALID");
    }
  }
  if (invocation.nodeKind !== FEDERATION_NODE_KIND) {
    fail("FEDERATION_NODE_KIND_MISMATCH");
  }
  exactObject(invocation.nodeInput, ["discovery"],
    "FEDERATION_NODE_INPUT");
  const normalized = normalizeInput({
    tender: invocation.tender,
    requirementKind: invocation.requirementKind,
    requirementId: invocation.requirementId,
    discovery: invocation.nodeInput.discovery,
    asOf: invocation.asOf,
    expiresAt: invocation.expiresAt,
    privateBindingNonce: invocation.privateBindingNonce,
  });
  if (invocation.requirementSetHash
      !== normalized.requirement.requirementSetHash
    || invocation.requirementObjectHash
      !== normalized.requirement.requirementObjectHash
    || !isDeepStrictEqual(state.binding, privateBinding(normalized))) {
    fail("FEDERATION_INVOCATION_BINDING_MISMATCH");
  }
  return true;
}

/**
 * Consume one module-issued remote candidate. The candidate is still only a
 * registry claim and must pass fresh endpoint/owner/authority checks before it
 * can contribute to any capability or commitment.
 */
export function claimMcpRegistryRemoteCandidateForObservationV1(
  result, index) {
  const state = EPHEMERAL_ENVELOPES.get(result);
  if (state === undefined) fail("EPHEMERAL_ENVELOPE_NOT_MODULE_ISSUED");
  if (!Number.isSafeInteger(index) || index < 0
    || index >= state.candidates.length) fail("CANDIDATE_INDEX_INVALID");
  if (state.consumed.has(index)) fail("CANDIDATE_ALREADY_CONSUMED");
  state.consumed.add(index);
  return state.candidates[index];
}

function statusFailureCode(status) {
  if (status === 301 || status === 302 || status === 303
    || status === 307 || status === 308) return "SOURCE_REDIRECT_REFUSED";
  if (status === 401 || status === 403) return "SOURCE_PERMISSION_DENIED";
  if (status === 429) return "SOURCE_RATE_LIMITED";
  if (status === 408 || status === 504) return "SOURCE_TIMEOUT";
  if (status === 400 || status === 404 || status === 422) {
    return "SOURCE_MALFORMED";
  }
  return "SOURCE_TRANSPORT_UNAVAILABLE";
}

async function boundedJson(response, controller) {
  const declared = response.headers
    && typeof response.headers.get === "function"
    ? response.headers.get("content-length") : null;
  if (declared !== null && declared !== "") {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0
      || bytes > MAX_RESPONSE_BYTES) {
      controller.abort();
      return null;
    }
  }
  let text;
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) {
        controller.abort();
        try { await reader.cancel(); } catch { /* fail closed below */ }
        return null;
      }
      total += part.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        controller.abort();
        try { await reader.cancel(); } catch { /* already rejected */ }
        return null;
      }
      chunks.push(Buffer.from(part.value));
    }
    text = Buffer.concat(chunks, total).toString("utf8");
  } else if (typeof response.text === "function") {
    text = await response.text();
    if (typeof text !== "string"
      || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      controller.abort();
      return null;
    }
  } else {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function oneRequest(url, dependencies, controller) {
  const response = await dependencies.fetchImpl(url.href, {
    method: "GET",
    headers: Object.freeze({ Accept: "application/json" }),
    redirect: "error",
    signal: controller.signal,
  });
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status)) {
    return { kind: "MALFORMED" };
  }
  if (response.status !== 200) {
    return { kind: "STATUS", status: response.status };
  }
  const contentType = response.headers
    && typeof response.headers.get === "function"
    ? response.headers.get("content-type") : null;
  if (typeof contentType !== "string"
    || !/^application\/json(?:\s*;|\s*$)/iu.test(contentType)) {
    controller.abort();
    return { kind: "MALFORMED" };
  }
  try {
    const raw = await boundedJson(response, controller);
    return raw === null ? { kind: "MALFORMED" } : { kind: "JSON", raw };
  } catch {
    return { kind: "MALFORMED" };
  }
}

/**
 * Run one order-scoped official MCP Registry discovery request.
 *
 * The enumerable result contains only a privacy-closed status projection.
 * Exact binding metadata is non-enumerable, and remote candidates can only be
 * consumed once through claimMcpRegistryRemoteCandidateForObservationV1.
 */
export async function discoverMcpRegistryRemoteRoutesV1(input, dependencies) {
  const normalized = normalizeInput(input);
  const deps = normalizeDependencies(dependencies);
  const binding = privateBinding(normalized);
  const url = requestUrl(normalized.discovery);
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "TIMEOUT" });
    }, deps.timeoutMs);
  });
  const request = oneRequest(url, deps, controller)
    .catch(() => ({ kind: "TRANSPORT_FAILURE" }));
  const outcome = await Promise.race([request, timeout]);
  clearTimeout(timer);

  if (outcome.kind === "TIMEOUT") {
    return envelope(binding, deepFreeze([]), "FAILED", "SOURCE_TIMEOUT");
  }
  if (outcome.kind === "TRANSPORT_FAILURE") {
    return envelope(binding, deepFreeze([]), "FAILED",
      "SOURCE_TRANSPORT_UNAVAILABLE");
  }
  if (outcome.kind === "STATUS") {
    return envelope(binding, deepFreeze([]), "FAILED",
      statusFailureCode(outcome.status));
  }
  if (outcome.kind !== "JSON") {
    return envelope(binding, deepFreeze([]), "FAILED", "SOURCE_MALFORMED");
  }
  const candidates = extractCandidates(outcome.raw,
    normalized.discovery.limit);
  outcome.raw = null;
  if (candidates === null) {
    return envelope(binding, deepFreeze([]), "FAILED", "SOURCE_MALFORMED");
  }
  return envelope(binding, candidates, "SUCCEEDED", null);
}

export const runMcpRegistryDiscoveryAdapterV1
  = discoverMcpRegistryRemoteRoutesV1;
