/*
 * Outcome Formation Engine: credential-free MCP remote interface observer v1.
 *
 * This module consumes one exact, module-issued discovery-federation result
 * and the registry adapter's one-use candidate leases. It never accepts a URL
 * from its caller. Observation is limited to the MCP lifecycle handshake and
 * tools/list; tools/call and every other task-effecting method are forbidden.
 *
 * Registry publication and a valid MCP response are discovery evidence only.
 * They establish no provider identity, ownership, authority, offer, capacity,
 * reservation, price, safety, or outcome truth.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isProxy } from "node:util/types";

import { claimMcpRegistryRemoteCandidateForObservationV1 }
  from "./outsider-mcp-registry-discovery-adapter-v1.js";
import { verifyMcpRegistryFederationPrivateResultForObservationV1 }
  from "./outsider-mcp-registry-discovery-federation-node-v1.js";
import { claimOrderScopedDiscoveryNodeResultV1 }
  from "./outsider-order-scoped-discovery-federation-v1.js";

const PREFIX = "OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const OCCURRENCE_ID = /^discovery_[a-f0-9]{32}$/u;
const MCP_NODE_KIND = "mcp.registry.v01";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const ACCEPTED_MCP_PROTOCOL_VERSIONS = new Set([
  "2025-11-25",
  "2025-06-18",
]);
const MAX_CANDIDATES = 3;
const MAX_PER_CANDIDATE_MS = 8_000;
const MAX_TOTAL_MS = 20_000;
const MAX_TOTAL_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RESOLVED_ADDRESSES = 16;
const MAX_SESSION_ID_BYTES = 1_024;
const MAX_TOOLS_IN_SHAPE_CHECK = 4_096;

export const OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_SCHEMA
  = "outsider/mcp-remote-interface-observation-privacy-closed/v1";

export const OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_LIMITS
  = Object.freeze({
    maximumCandidatesPerObservation: MAX_CANDIDATES,
    maximumRuntimeMsPerCandidate: MAX_PER_CANDIDATE_MS,
    maximumTotalRuntimeMs: MAX_TOTAL_MS,
    maximumTotalResponseBytes: MAX_TOTAL_RESPONSE_BYTES,
    maximumTotalRequestAndResponseBodyBytes: MAX_TOTAL_RESPONSE_BYTES,
    maximumHttpRequestsPerCandidate: 3,
    maximumDnsAddressesPerCandidate: MAX_RESOLVED_ADDRESSES,
  });

export const OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_BOUNDARY
  = deepFreeze({
    position: "ORDER_SCOPED_CREDENTIAL_FREE_MCP_INTERFACE_OBSERVATION_HOLD",
    fullModuleIssuedFederationResultRequired: true,
    exactOccurrencePrivateResultClaimRequired: true,
    moduleIssuedRegistryCandidateLeaseRequired: true,
    copiedFederationEnvelopeAccepted: false,
    crossOccurrenceLeaseAccepted: false,
    reusableFederationOrCandidateLeaseAccepted: false,
    nakedUrlAccepted: false,
    inputUrlFieldAccepted: false,
    acceptedTransport: "streamable-http",
    initializeRequestedProtocolVersion: MCP_PROTOCOL_VERSION,
    acceptedNegotiatedProtocolVersions: [...ACCEPTED_MCP_PROTOCOL_VERSIONS],
    arbitraryDateShapedProtocolVersionAccepted: false,
    httpsRequired: true,
    portRequired: 443,
    userInfoAccepted: false,
    redirectsPermitted: false,
    retriesPermitted: false,
    preexistingAuthorizationCredentialsAccepted: false,
    preexistingAuthorizationCredentialPresented: false,
    networkAnonymityEstablished: false,
    serverCanObserveTransportMetadata: true,
    serverIssuedSessionStateMayBeUsedTransiently: true,
    serverIssuedSessionStateProjectedOrRetained: false,
    authorizationHeaderPermitted: false,
    cookieHeaderPermitted: false,
    dnsResolvedBeforeConnect: true,
    allResolvedAddressesMustBePublic: true,
    mixedPublicAndNonPublicAddressSetsAccepted: false,
    connectionPinnedToResolvedAddress: true,
    tlsServerNameBoundToCandidateHostname: true,
    tlsRemoteAddressReplayRequired: true,
    maximumCandidatesPerObservation: MAX_CANDIDATES,
    maximumRuntimeMsPerCandidate: MAX_PER_CANDIDATE_MS,
    maximumTotalRuntimeMs: MAX_TOTAL_MS,
    maximumTotalResponseBytes: MAX_TOTAL_RESPONSE_BYTES,
    maximumTotalRequestAndResponseBodyBytes: MAX_TOTAL_RESPONSE_BYTES,
    maximumHttpRequestsPerCandidate: 3,
    localWallClockExpiryRefusalEnforced: true,
    trustedTimeEstablished: false,
    injectedTransportMayIgnoreAbortSignal: true,
    postTimeoutTransportEffectsPrevented: false,
    permittedJsonRpcMethods: [
      "initialize", "notifications/initialized", "tools/list",
    ],
    toolsCallPermitted: false,
    arbitraryJsonRpcMethodPermitted: false,
    tenderMaterialTransmitted: false,
    queryProjected: false,
    candidateUrlProjected: false,
    serverNameProjected: false,
    toolNameProjected: false,
    toolDescriptionProjected: false,
    toolSchemaProjected: false,
    rawResponseProjected: false,
    resultDerivedCountProjected: false,
    resultDerivedHashProjected: false,
    providerIdentityEstablished: false,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    providerOfferEstablished: false,
    providerAcceptanceEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    safetyEstablished: false,
    outcomeTruthEstablished: false,
    settlementPermitted: false,
    productionExecutionPermitted: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
    infrastructureConsequenceReach:
      "BOUNDED_CREDENTIAL_FREE_MCP_INITIALIZE_AND_TOOLS_LIST",
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

function denseCandidateIndexes(value) {
  if (!Array.isArray(value) || isProxy(value) || value.length === 0
    || value.length > MAX_CANDIDATES
    || Reflect.ownKeys(value).length !== value.length + 1) {
    fail("CANDIDATE_INDEXES_INVALID");
  }
  const seen = new Set();
  const indexes = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidateIndex = ownValue(value, String(index), "CANDIDATE_INDEXES");
    if (!Number.isSafeInteger(candidateIndex) || candidateIndex < 0
      || seen.has(candidateIndex)) fail("CANDIDATE_INDEXES_INVALID");
    seen.add(candidateIndex);
    indexes.push(candidateIndex);
  }
  return indexes;
}

function normalizeInput(input) {
  exactObject(input, ["federationResult", "expectedTenderHash", "occurrenceId",
    "candidateIndexes"], "INPUT");
  if (typeof input.expectedTenderHash !== "string"
    || !HASH.test(input.expectedTenderHash)) fail("EXPECTED_TENDER_HASH_INVALID");
  if (typeof input.occurrenceId !== "string"
    || !OCCURRENCE_ID.test(input.occurrenceId)) fail("OCCURRENCE_ID_INVALID");
  return {
    federationResult: input.federationResult,
    expectedTenderHash: input.expectedTenderHash,
    occurrenceId: input.occurrenceId,
    candidateIndexes: denseCandidateIndexes(input.candidateIndexes),
  };
}

function normalizeDependencies(dependencies) {
  if (dependencies === undefined) {
    return {
      lookupImpl: defaultLookup,
      requestImpl: defaultPinnedRequest,
      perCandidateTimeoutMs: MAX_PER_CANDIDATE_MS,
      totalTimeoutMs: MAX_TOTAL_MS,
    };
  }
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || isProxy(dependencies)) {
    fail("DEPENDENCIES_INVALID");
  }
  const prototype = Object.getPrototypeOf(dependencies);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("DEPENDENCIES_INVALID");
  }
  const allowed = new Set(["lookupImpl", "requestImpl",
    "perCandidateTimeoutMs", "totalTimeoutMs"]);
  const keys = Reflect.ownKeys(dependencies);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    fail("DEPENDENCIES_FIELDS_INVALID");
  }
  for (const key of keys) ownValue(dependencies, key, "DEPENDENCIES");
  const lookupImpl = dependencies.lookupImpl ?? defaultLookup;
  const requestImpl = dependencies.requestImpl ?? defaultPinnedRequest;
  const perCandidateTimeoutMs = dependencies.perCandidateTimeoutMs
    ?? MAX_PER_CANDIDATE_MS;
  const totalTimeoutMs = dependencies.totalTimeoutMs ?? MAX_TOTAL_MS;
  if (typeof lookupImpl !== "function") fail("LOOKUP_IMPLEMENTATION_INVALID");
  if (typeof requestImpl !== "function") {
    fail("REQUEST_IMPLEMENTATION_INVALID");
  }
  if (!Number.isSafeInteger(perCandidateTimeoutMs)
    || perCandidateTimeoutMs < 1
    || perCandidateTimeoutMs > MAX_PER_CANDIDATE_MS) {
    fail("PER_CANDIDATE_TIMEOUT_INVALID");
  }
  if (!Number.isSafeInteger(totalTimeoutMs) || totalTimeoutMs < 1
    || totalTimeoutMs > MAX_TOTAL_MS) fail("TOTAL_TIMEOUT_INVALID");
  return { lookupImpl, requestImpl, perCandidateTimeoutMs, totalTimeoutMs };
}

function preclaimExpectedTenderHash(federationResult, expectedTenderHash) {
  if (federationResult === null || typeof federationResult !== "object"
    || Array.isArray(federationResult) || isProxy(federationResult)) {
    fail("FEDERATION_RESULT_INVALID");
  }
  const projectionDescriptor = Object.getOwnPropertyDescriptor(
    federationResult, "publicProjection");
  if (!projectionDescriptor || !Object.hasOwn(projectionDescriptor, "value")
    || projectionDescriptor.enumerable !== true) {
    fail("FEDERATION_RESULT_INVALID");
  }
  const projection = projectionDescriptor.value;
  if (projection === null || typeof projection !== "object"
    || Array.isArray(projection) || isProxy(projection)) {
    fail("FEDERATION_PROJECTION_INVALID");
  }
  const tenderDescriptor = Object.getOwnPropertyDescriptor(
    projection, "tenderHash");
  if (!tenderDescriptor || !Object.hasOwn(tenderDescriptor, "value")
    || tenderDescriptor.enumerable !== true
    || tenderDescriptor.value !== expectedTenderHash) {
    fail("EXPECTED_TENDER_HASH_MISMATCH");
  }
}

function ipv4Number(address) {
  const parts = address.split(".").map(Number);
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256
    + parts[3]) >>> 0;
}

function ipv4InSubnet(value, base, prefixLength) {
  const shift = 32 - prefixLength;
  return (value >>> shift) === (ipv4Number(base) >>> shift);
}

const NON_PUBLIC_IPV4 = Object.freeze([
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]);

function ipv6BigInt(address) {
  const split = address.toLowerCase().split("::");
  if (split.length > 2) return null;
  const expand = (side) => {
    if (side === "") return [];
    const pieces = side.split(":");
    const output = [];
    for (const piece of pieces) {
      if (piece.includes(".")) {
        if (isIP(piece) !== 4) return null;
        const ipv4 = ipv4Number(piece);
        output.push(((ipv4 >>> 16) & 0xffff).toString(16));
        output.push((ipv4 & 0xffff).toString(16));
      } else {
        if (!/^[a-f0-9]{1,4}$/u.test(piece)) return null;
        output.push(piece);
      }
    }
    return output;
  };
  const left = expand(split[0]);
  const right = expand(split.length === 2 ? split[1] : "");
  if (left === null || right === null) return null;
  const missing = 8 - left.length - right.length;
  if ((split.length === 1 && missing !== 0)
    || (split.length === 2 && missing < 1)) return null;
  const words = [...left, ...Array(missing).fill("0"), ...right];
  if (words.length !== 8) return null;
  let value = 0n;
  for (const word of words) value = (value << 16n) | BigInt(`0x${word}`);
  return value;
}

function ipv6InSubnet(value, base, prefixLength) {
  const baseValue = ipv6BigInt(base);
  const shift = 128n - BigInt(prefixLength);
  return (value >> shift) === (baseValue >> shift);
}

function isPublicAddress(address, family) {
  if (typeof address !== "string" || address.includes("%")) return false;
  const detected = isIP(address);
  if ((family === 4 || family === "IPv4") && detected !== 4) return false;
  if ((family === 6 || family === "IPv6") && detected !== 6) return false;
  if (detected === 4) {
    const value = ipv4Number(address);
    return !NON_PUBLIC_IPV4.some(([base, prefixLength]) =>
      ipv4InSubnet(value, base, prefixLength));
  }
  if (detected !== 6) return false;
  const value = ipv6BigInt(address);
  if (value === null) return false;
  // Permit ordinary global unicast only. Explicitly remove documentation,
  // transition, benchmarking, local, multicast, and IPv4-mapped space.
  return ipv6InSubnet(value, "2000::", 3)
    && !ipv6InSubnet(value, "2001::", 23)
    && !ipv6InSubnet(value, "2001:db8::", 32)
    && !ipv6InSubnet(value, "2002::", 16)
    && !ipv6InSubnet(value, "3fff::", 20);
}

function normalizedAddress(address) {
  if (isIP(address) === 4) return { family: 4, value: BigInt(ipv4Number(address)) };
  if (isIP(address) === 6) return { family: 6, value: ipv6BigInt(address) };
  return null;
}

function sameAddress(left, right) {
  const a = normalizedAddress(left);
  const b = normalizedAddress(right);
  return a !== null && b !== null && a.family === b.family
    && a.value === b.value;
}

function validatedCandidateUrl(candidate) {
  if (candidate === null || typeof candidate !== "object"
    || Array.isArray(candidate) || isProxy(candidate)
    || candidate.routeKind !== "PUBLIC_MCP_REMOTE_TRANSPORT"
    || candidate.remoteTransportType !== "streamable-http") return null;
  if (typeof candidate.remoteTransportUrl !== "string") return null;
  let url;
  try {
    url = new URL(candidate.remoteTransportUrl);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (url.protocol !== "https:" || url.username !== ""
    || url.password !== "" || (url.port !== "" && url.port !== "443")
    || hostname.length === 0 || hostname.startsWith("[")
    || hostname.endsWith("]") || hostname === "localhost"
    || hostname.endsWith(".localhost") || hostname.endsWith(".local")
    || isIP(hostname) !== 0) return null;
  url.hostname = hostname;
  url.port = "";
  url.hash = "";
  return url;
}

function normalizeLookupRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0
    || rows.length > MAX_RESOLVED_ADDRESSES) {
    throw observerError("DNS_RESOLUTION_REFUSED");
  }
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw observerError("DNS_RESOLUTION_REFUSED");
    }
    const address = row.address;
    const family = row.family;
    if (!isPublicAddress(address, family)) {
      throw observerError("DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED");
    }
    const canonical = normalizedAddress(address);
    const key = `${canonical.family}:${canonical.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ address, family: canonical.family });
    }
  }
  if (result.length === 0) throw observerError("DNS_RESOLUTION_REFUSED");
  return result;
}

async function defaultLookup(hostname) {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function observerError(code) {
  const error = new Error(`${PREFIX}${code}`);
  error.outsiderCode = code;
  return error;
}

function selectedHeaders(headers) {
  if (headers !== null && typeof headers === "object"
    && Object.hasOwn(headers, "contentType")
    && Object.hasOwn(headers, "location")
    && Object.hasOwn(headers, "sessionId")
    && Object.hasOwn(headers, "protocolVersion")) {
    return {
      contentType: headers.contentType,
      location: headers.location,
      sessionId: headers.sessionId,
      protocolVersion: headers.protocolVersion,
    };
  }
  const read = (name) => {
    if (headers && typeof headers.get === "function") return headers.get(name);
    if (headers && typeof headers === "object") {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name) return Array.isArray(value)
          ? value.join(", ") : value ?? null;
      }
    }
    return null;
  };
  return {
    contentType: read("content-type"),
    location: read("location"),
    sessionId: read("mcp-session-id"),
    protocolVersion: read("mcp-protocol-version"),
  };
}

function defaultPinnedRequest(request) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const req = httpsRequest(request.url, {
      method: "POST",
      headers: request.headers,
      agent: false,
      rejectUnauthorized: true,
      servername: request.hostname,
      signal: request.signal,
      lookup(hostname, options, callback) {
        if (hostname.toLowerCase().replace(/\.$/u, "")
          !== request.hostname) {
          callback(observerError("TLS_HOSTNAME_BINDING_MISMATCH"));
          return;
        }
        if (options && options.all === true) {
          callback(null, [{ address: request.address,
            family: request.family }]);
        } else {
          callback(null, request.address, request.family);
        }
      },
      family: request.family,
      autoSelectFamily: false,
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > request.maximumResponseBytes) {
          response.destroy(observerError("RESPONSE_TOO_LARGE"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => finish(resolve, {
        status: response.statusCode,
        headers: selectedHeaders(response.headers),
        body: Buffer.concat(chunks),
        remoteAddress: response.socket.remoteAddress,
        remoteFamily: response.socket.remoteFamily,
        tlsAuthorized: response.socket.authorized === true,
      }));
      response.on("error", (error) => finish(reject, error));
    });
    req.on("socket", (socket) => {
      socket.once("secureConnect", () => {
        if (socket.authorized !== true
          || !sameAddress(socket.remoteAddress, request.address)) {
          req.destroy(observerError("TLS_REMOTE_ADDRESS_MISMATCH"));
        }
      });
    });
    req.on("error", (error) => finish(reject, error));
    req.end(request.body);
  });
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw observerError("RESPONSE_SHAPE_INVALID");
}

function normalizedResponse(value, request, maximumResponseBytes) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) throw observerError("RESPONSE_SHAPE_INVALID");
  const status = value.status;
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    throw observerError("RESPONSE_SHAPE_INVALID");
  }
  const body = asBuffer(value.body ?? Buffer.alloc(0));
  if (body.length > maximumResponseBytes) {
    throw observerError("RESPONSE_TOO_LARGE");
  }
  if (value.tlsAuthorized !== true
    || !sameAddress(value.remoteAddress, request.address)
    || !((request.family === 4 && (value.remoteFamily === 4
      || value.remoteFamily === "IPv4"))
      || (request.family === 6 && (value.remoteFamily === 6
        || value.remoteFamily === "IPv6")))) {
    throw observerError("TLS_REMOTE_ADDRESS_MISMATCH");
  }
  const headers = selectedHeaders(value.headers);
  return { status, body, headers };
}

function checkHttpStatus(response, allowEmptySuccess = false) {
  if (response.status >= 300 && response.status <= 399) {
    throw observerError("SOURCE_REDIRECT_REFUSED");
  }
  if (response.status === 401 || response.status === 403) {
    throw observerError("SOURCE_PERMISSION_DENIED");
  }
  if (response.status === 429) throw observerError("SOURCE_RATE_LIMITED");
  if (allowEmptySuccess
    && (response.status === 200 || response.status === 202
      || response.status === 204)) return;
  if (response.status !== 200) {
    throw observerError("SOURCE_TRANSPORT_UNAVAILABLE");
  }
}

function jsonRpcFromResponse(response, expectedId) {
  const contentType = typeof response.headers.contentType === "string"
    ? response.headers.contentType.toLowerCase().split(";", 1)[0].trim() : "";
  let values;
  if (contentType === "application/json") {
    try {
      values = [JSON.parse(response.body.toString("utf8"))];
    } catch {
      throw observerError("MCP_RESPONSE_MALFORMED");
    }
  } else if (contentType === "text/event-stream") {
    const events = response.body.toString("utf8").split(/\r?\n\r?\n/u);
    if (events.length > 128) throw observerError("MCP_RESPONSE_MALFORMED");
    values = [];
    for (const event of events) {
      const data = event.split(/\r?\n/u)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /u, "")).join("\n");
      if (data === "" || data === "[DONE]") continue;
      try { values.push(JSON.parse(data)); } catch {
        throw observerError("MCP_RESPONSE_MALFORMED");
      }
    }
  } else {
    throw observerError("MCP_RESPONSE_MEDIA_TYPE_REFUSED");
  }
  const matches = values.filter((value) => value !== null
    && typeof value === "object" && !Array.isArray(value)
    && value.jsonrpc === "2.0" && value.id === expectedId);
  if (values.length !== 1 || matches.length !== 1
    || Object.hasOwn(matches[0], "error")) {
    throw observerError("MCP_JSON_RPC_SHAPE_INVALID");
  }
  return matches[0];
}

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateInitialize(message) {
  if (!plainRecord(message.result)
    || typeof message.result.protocolVersion !== "string"
    || !plainRecord(message.result.capabilities)
    || !plainRecord(message.result.serverInfo)
    || typeof message.result.serverInfo.name !== "string"
    || message.result.serverInfo.name.length === 0
    || typeof message.result.serverInfo.version !== "string"
    || message.result.serverInfo.version.length === 0) {
    throw observerError("MCP_INITIALIZE_SHAPE_INVALID");
  }
  if (!ACCEPTED_MCP_PROTOCOL_VERSIONS.has(
    message.result.protocolVersion)) {
    throw observerError("MCP_PROTOCOL_VERSION_REFUSED");
  }
  return message.result.protocolVersion;
}

function validateToolsList(message) {
  if (!plainRecord(message.result) || !Array.isArray(message.result.tools)
    || message.result.tools.length > MAX_TOOLS_IN_SHAPE_CHECK) {
    throw observerError("MCP_TOOLS_LIST_SHAPE_INVALID");
  }
  for (const tool of message.result.tools) {
    if (!plainRecord(tool) || typeof tool.name !== "string"
      || tool.name.length === 0 || tool.name.length > 1_024
      || !plainRecord(tool.inputSchema)) {
      throw observerError("MCP_TOOLS_LIST_SHAPE_INVALID");
    }
  }
}

function validSessionId(value) {
  return value === null || (typeof value === "string" && value.length > 0
    && Buffer.byteLength(value, "utf8") <= MAX_SESSION_ID_BYTES
    && /^[\x21-\x7e]+$/u.test(value));
}

function requestBody(id, method, params) {
  const value = id === null
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id, method, params };
  return Buffer.from(JSON.stringify(value), "utf8");
}

function candidateAttempt(ordinal, fields) {
  return deepFreeze({
    attemptOrdinal: ordinal,
    status: fields.status,
    failureCode: fields.failureCode,
    dnsResolutionAttempted: fields.dnsResolutionAttempted,
    publicDnsResolutionVerified: fields.publicDnsResolutionVerified,
    httpRequestAttemptCount: fields.httpRequestAttemptCount,
    requestBytes: fields.requestBytes,
    responseBytes: fields.responseBytes,
    tlsRemoteAddressReplayVerified: fields.tlsRemoteAddressReplayVerified,
    initializeJsonRpcShapeObserved: fields.initializeJsonRpcShapeObserved,
    initializedLifecycleStepCompleted:
      fields.initializedLifecycleStepCompleted,
    toolsListJsonRpcShapeObserved: fields.toolsListJsonRpcShapeObserved,
    serverIssuedSessionStatePresented:
      fields.serverIssuedSessionStatePresented,
    resultMaterialProjected: false,
  });
}

function failureCode(error) {
  if (error && typeof error === "object"
    && typeof error.outsiderCode === "string") return error.outsiderCode;
  if (error && typeof error === "object" && error.name === "AbortError") {
    return "SOURCE_TIMEOUT";
  }
  return "SOURCE_TRANSPORT_UNAVAILABLE";
}

async function withDeadline(promise, deadline, controller) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw observerError("SOURCE_TIMEOUT");
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(observerError("SOURCE_TIMEOUT"));
    }, remaining);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function observeCandidate(candidate, ordinal, dependencies,
  totalDeadline, byteBudget) {
  const fields = {
    status: "FAILED",
    failureCode: null,
    dnsResolutionAttempted: false,
    publicDnsResolutionVerified: false,
    httpRequestAttemptCount: 0,
    requestBytes: 0,
    responseBytes: 0,
    tlsRemoteAddressReplayVerified: false,
    initializeJsonRpcShapeObserved: false,
    initializedLifecycleStepCompleted: false,
    toolsListJsonRpcShapeObserved: false,
    serverIssuedSessionStatePresented: false,
  };
  const url = validatedCandidateUrl(candidate);
  if (url === null) {
    fields.failureCode = candidate?.remoteTransportType === "sse"
      ? "UNSUPPORTED_TRANSPORT" : "CANDIDATE_ENDPOINT_REFUSED";
    return candidateAttempt(ordinal, fields);
  }
  const controller = new AbortController();
  const candidateDeadline = Math.min(totalDeadline,
    Date.now() + dependencies.perCandidateTimeoutMs);
  const runRequest = async (body, headers) => {
    if (Date.now() >= candidateDeadline || Date.now() >= totalDeadline) {
      throw observerError("SOURCE_TIMEOUT");
    }
    if (body.length > byteBudget.remaining) {
      throw observerError("TOTAL_BODY_BYTES_EXHAUSTED");
    }
    fields.httpRequestAttemptCount += 1;
    fields.requestBytes += body.length;
    byteBudget.remaining -= body.length;
    const selected = byteBudget.addresses[0];
    const raw = await withDeadline(dependencies.requestImpl({
      url: url.href,
      hostname: url.hostname,
      address: selected.address,
      family: selected.family,
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      maximumResponseBytes: byteBudget.remaining,
    }), candidateDeadline, controller);
    const response = normalizedResponse(raw, {
      address: selected.address, family: selected.family,
    }, byteBudget.remaining);
    fields.tlsRemoteAddressReplayVerified = true;
    fields.responseBytes += response.body.length;
    byteBudget.remaining -= response.body.length;
    if (byteBudget.remaining < 0) throw observerError("RESPONSE_TOO_LARGE");
    return response;
  };
  try {
    fields.dnsResolutionAttempted = true;
    const rows = await withDeadline(dependencies.lookupImpl(url.hostname, {
      all: true, verbatim: true, signal: controller.signal,
    }), candidateDeadline, controller);
    byteBudget.addresses = normalizeLookupRows(rows);
    fields.publicDnsResolutionVerified = true;

    const initializeBody = requestBody(1, "initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "outsider-interface-observer", version: "1.0.0" },
    });
    const baseHeaders = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Connection: "close",
    };
    const initializeResponse = await runRequest(initializeBody, baseHeaders);
    checkHttpStatus(initializeResponse);
    const negotiatedVersion = validateInitialize(jsonRpcFromResponse(
      initializeResponse, 1));
    fields.initializeJsonRpcShapeObserved = true;
    const sessionId = initializeResponse.headers.sessionId;
    if (!validSessionId(sessionId)) {
      throw observerError("MCP_SESSION_ID_REFUSED");
    }
    const lifecycleHeaders = {
      ...baseHeaders,
      "MCP-Protocol-Version": negotiatedVersion,
      ...(sessionId === null ? {} : { "MCP-Session-Id": sessionId }),
    };
    fields.serverIssuedSessionStatePresented = sessionId !== null;
    const initializedResponse = await runRequest(requestBody(null,
      "notifications/initialized", {}), lifecycleHeaders);
    checkHttpStatus(initializedResponse, true);
    fields.initializedLifecycleStepCompleted = true;

    const toolsResponse = await runRequest(requestBody(2, "tools/list", {}),
      lifecycleHeaders);
    checkHttpStatus(toolsResponse);
    validateToolsList(jsonRpcFromResponse(toolsResponse, 2));
    fields.toolsListJsonRpcShapeObserved = true;
    fields.status = "SUCCEEDED";
    fields.failureCode = null;
  } catch (error) {
    controller.abort();
    fields.failureCode = failureCode(error);
  }
  return candidateAttempt(ordinal, fields);
}

function exactOccurrence(federationResult, occurrenceId) {
  const projection = federationResult.publicProjection;
  if (projection === null || typeof projection !== "object") {
    fail("FEDERATION_PROJECTION_INVALID");
  }
  const matches = projection.occurrences.filter((occurrence) =>
    occurrence.occurrenceId === occurrenceId);
  if (matches.length !== 1 || matches[0].nodeKind !== MCP_NODE_KIND
    || matches[0].status !== "SUCCEEDED") {
    fail("MCP_OCCURRENCE_NOT_EXACTLY_AVAILABLE");
  }
  const occurrenceIndex = projection.jobs.findIndex((job) =>
    job.occurrenceId === occurrenceId);
  if (occurrenceIndex < 0
    || projection.jobs[occurrenceIndex].nodeSlotId !== matches[0].nodeSlotId
    || !Array.isArray(federationResult.privateEphemeral
      ?.exactPrivateBindingHashes)
    || typeof federationResult.privateEphemeral
      .exactPrivateBindingHashes[occurrenceIndex] !== "string") {
    fail("MCP_OCCURRENCE_PRIVATE_BINDING_INVALID");
  }
  return { projection, occurrence: matches[0], occurrenceIndex };
}

function exactAdapterBinding(projection, occurrence, adapterResult) {
  const binding = adapterResult.privateEphemeral?.binding;
  if (binding === null || typeof binding !== "object"
    || binding.tenderHash !== projection.tenderHash
    || binding.requirementKind !== occurrence.requirementKind
    || binding.requirementId !== occurrence.requirementId
    || binding.requirementObjectHash !== occurrence.requirementObjectHash
    || binding.asOf !== projection.asOf
    || binding.expiresAt !== occurrence.expiresAt
    || adapterResult.publicProjection?.status !== "SUCCEEDED") {
    fail("MCP_PRIVATE_RESULT_OCCURRENCE_BINDING_MISMATCH");
  }
}

/**
 * Observe up to three one-use registry candidates for one exact federation
 * occurrence. Misbound or replayed inputs throw before DNS or HTTP begins.
 */
export async function observeMcpRemoteInterfacesV1(input, dependencies) {
  const normalized = normalizeInput(input);
  const deps = normalizeDependencies(dependencies);

  preclaimExpectedTenderHash(normalized.federationResult,
    normalized.expectedTenderHash);
  // The generic result claim is deliberately first. A copied/replayed result
  // cannot cause even DNS resolution through this module.
  const adapterResult = claimOrderScopedDiscoveryNodeResultV1(
    normalized.federationResult, normalized.occurrenceId);
  const { projection, occurrence, occurrenceIndex } = exactOccurrence(
    normalized.federationResult, normalized.occurrenceId);

  verifyMcpRegistryFederationPrivateResultForObservationV1(adapterResult, {
    tenderHash: projection.tenderHash,
    workOrderHash: projection.workOrderHash,
    typedGraphHash: projection.typedGraphHash,
    asOf: projection.asOf,
    occurrenceId: occurrence.occurrenceId,
    nodeSlotId: occurrence.nodeSlotId,
    nodeKind: occurrence.nodeKind,
    requirementKind: occurrence.requirementKind,
    requirementId: occurrence.requirementId,
    requirementSetHash: occurrence.requirementSetHash,
    requirementObjectHash: occurrence.requirementObjectHash,
    expiresAt: occurrence.expiresAt,
    exactPrivateBindingHash: normalized.federationResult.privateEphemeral
      .exactPrivateBindingHashes[occurrenceIndex],
  });
  exactAdapterBinding(projection, occurrence, adapterResult);
  if (Date.now() >= Date.parse(occurrence.expiresAt)) {
    fail("OCCURRENCE_EXPIRED_BEFORE_OBSERVATION");
  }

  // Consume and validate every requested candidate before the first DNS call,
  // so a bad or replayed candidate never follows an earlier candidate onto the
  // network in the same observation.
  const candidateLeaseCount = adapterResult.privateEphemeral
    .candidateLeaseCount;
  if (!Number.isSafeInteger(candidateLeaseCount)
    || normalized.candidateIndexes.some((candidateIndex) =>
      candidateIndex >= candidateLeaseCount)) fail("CANDIDATE_INDEX_INVALID");
  const candidates = normalized.candidateIndexes.map((candidateIndex) =>
    claimMcpRegistryRemoteCandidateForObservationV1(
      adapterResult, candidateIndex));

  const totalDeadline = Math.min(Date.now() + deps.totalTimeoutMs,
    Date.parse(occurrence.expiresAt));
  const byteBudget = { remaining: MAX_TOTAL_RESPONSE_BYTES, addresses: [] };
  const attempts = [];
  for (let index = 0; index < candidates.length; index += 1) {
    if (Date.now() >= totalDeadline) {
      attempts.push(candidateAttempt(index + 1, {
        status: "FAILED", failureCode: "TOTAL_RUNTIME_EXHAUSTED",
        dnsResolutionAttempted: false, publicDnsResolutionVerified: false,
        httpRequestAttemptCount: 0, requestBytes: 0, responseBytes: 0,
        tlsRemoteAddressReplayVerified: false,
        initializeJsonRpcShapeObserved: false,
        initializedLifecycleStepCompleted: false,
        toolsListJsonRpcShapeObserved: false,
        serverIssuedSessionStatePresented: false,
      }));
      continue;
    }
    attempts.push(await observeCandidate(candidates[index], index + 1,
      deps, totalDeadline, byteBudget));
  }
  const totalRequestBytes = attempts.reduce((sum, attempt) =>
    sum + attempt.requestBytes, 0);
  const totalResponseBytes = attempts.reduce((sum, attempt) =>
    sum + attempt.responseBytes, 0);
  const body = {
    schema: OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_SCHEMA,
    schemaVersion: "1.0.0",
    recordClass: "MCP_REMOTE_INTERFACE_PRIVACY_CLOSED_OBSERVATION",
    federationId: projection.federationId,
    tenderHash: projection.tenderHash,
    workOrderHash: projection.workOrderHash,
    typedGraphHash: projection.typedGraphHash,
    occurrenceId: occurrence.occurrenceId,
    nodeKind: occurrence.nodeKind,
    status: attempts.some((attempt) => attempt.status === "SUCCEEDED")
      ? "SUCCEEDED" : "FAILED",
    attempts,
    totalHttpRequestAttemptCount: attempts.reduce((sum, attempt) =>
      sum + attempt.httpRequestAttemptCount, 0),
    totalRequestBytes,
    totalResponseBytes,
    maximumCandidatesPerObservation: MAX_CANDIDATES,
    maximumRuntimeMsPerCandidate: deps.perCandidateTimeoutMs,
    maximumTotalRuntimeMs: deps.totalTimeoutMs,
    maximumTotalResponseBytes: MAX_TOTAL_RESPONSE_BYTES,
    maximumTotalRequestAndResponseBodyBytes: MAX_TOTAL_RESPONSE_BYTES,
    initializeRequestedProtocolVersion: MCP_PROTOCOL_VERSION,
    acceptedNegotiatedProtocolVersions: [
      ...ACCEPTED_MCP_PROTOCOL_VERSIONS,
    ],
    arbitraryDateShapedProtocolVersionAccepted: false,
    localWallClockExpiryRefusalEnforced: true,
    trustedTimeEstablished: false,
    injectedTransportMayIgnoreAbortSignal: true,
    postTimeoutTransportEffectsPrevented: false,
    redirectsFollowed: 0,
    retriesPerformed: 0,
    preexistingAuthorizationCredentialPresented: false,
    networkAnonymityEstablished: false,
    serverCanObserveTransportMetadata: true,
    serverIssuedSessionStateMayBePresented: true,
    serverIssuedSessionStatePresented: attempts.some((attempt) =>
      attempt.serverIssuedSessionStatePresented),
    serverIssuedSessionStateProjectedOrRetained: false,
    toolsCallPerformed: false,
    arbitraryJsonRpcMethodPerformed: false,
    tenderMaterialTransmitted: false,
    queryProjected: false,
    candidateUrlProjected: false,
    serverNameProjected: false,
    toolNameProjected: false,
    toolDescriptionProjected: false,
    toolSchemaProjected: false,
    rawResponseProjected: false,
    resultDerivedCountProjected: false,
    resultDerivedHashProjected: false,
    providerIdentityEstablished: false,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    providerOfferEstablished: false,
    providerAcceptanceEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    safetyEstablished: false,
    outcomeTruthEstablished: false,
    settlementPermitted: false,
    productionExecutionPermitted: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
    infrastructureConsequenceReach:
      "BOUNDED_CREDENTIAL_FREE_MCP_INITIALIZE_AND_TOOLS_LIST",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_MCP_REMOTE_INTERFACE_OBSERVER_V1_BOUNDARY,
  };
  return deepFreeze(body);
}

export const observeOutsiderMcpRemoteInterfacesV1
  = observeMcpRemoteInterfacesV1;
