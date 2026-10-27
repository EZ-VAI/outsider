/*
 * Shared public HTTPS read-only fetch transport v1.
 *
 * This is the narrow transport seam used by source-specific discovery
 * adapters.  It extracts the already exercised DNS/IP/TLS pinning mechanics
 * from the MCP remote observer without importing that observer's MCP and
 * federation semantics.  It accepts only public HTTPS HEAD/GET requests and
 * returns a small Response-like object.  It does not follow redirects.
 */

import { Buffer } from "node:buffer";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity as tlsCheckServerIdentity } from "node:tls";
import { isProxy } from "node:util/types";

const PREFIX = "OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAXIMUM_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAXIMUM_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAXIMUM_RESOLVED_ADDRESSES = 16;
const MAXIMUM_URL_BYTES = 16 * 1024;
const MAXIMUM_HEADER_VALUE_BYTES = 32 * 1024;
const MAXIMUM_RESPONSE_HEADER_BYTES = 64 * 1024;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const PERMITTED_REQUEST_HEADERS = new Set(["accept", "accept-language"]);
const PROJECTED_RESPONSE_HEADERS = Object.freeze([
  "cache-control", "content-length", "content-type", "etag", "last-modified",
  "link", "location",
]);

export const OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_LIMITS
  = Object.freeze({
    maximumTimeoutMs: MAX_TIMEOUT_MS,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    maximumResponseBytes: MAXIMUM_RESPONSE_BYTES,
    defaultMaximumResponseBytes: DEFAULT_MAXIMUM_RESPONSE_BYTES,
    maximumResolvedAddresses: MAXIMUM_RESOLVED_ADDRESSES,
    maximumUrlBytes: MAXIMUM_URL_BYTES,
    maximumResponseHeaderBytes: MAXIMUM_RESPONSE_HEADER_BYTES,
  });

export const OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_BOUNDARY
  = Object.freeze({
    position: "PUBLIC_HTTPS_READ_ONLY_PINNED_TRANSPORT_ONLY",
    permittedMethods: Object.freeze(["HEAD", "GET"]),
    httpsRequired: true,
    standardTlsPortRequired: true,
    hostnameRequired: true,
    ipLiteralAccepted: false,
    dnsAllAddressResolutionRequired: true,
    maximumResolvedAddresses: MAXIMUM_RESOLVED_ADDRESSES,
    allResolvedAddressesMustBePublic: true,
    mixedPublicAndNonPublicAddressSetsAccepted: false,
    selectedAddressPinnedIntoHttpsLookup: true,
    tlsServernameBoundToOriginalHostname: true,
    tlsCertificateHostnameVerificationRequired: true,
    tlsSocketRemoteAddressReplayRequired: true,
    redirectsFollowed: false,
    retryPerformed: false,
    credentialsPermitted: false,
    cookiesPermitted: false,
    responseBodyBoundedBeforeReturn: true,
    sourceSpecificMeaningEstablished: false,
    providerIdentityEstablished: false,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    offerEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    actionAuthorityEstablished: false,
  });

function transportError(code) {
  const error = new Error(`${PREFIX}${code}`);
  error.outsiderCode = code;
  return error;
}

function fail(code) {
  throw transportError(code);
}

function ownValue(value, key, code) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")
    || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  return descriptor.value;
}

function optionsObject(value, allowed, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  for (const key of keys) ownValue(value, key, code);
  return value;
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
  return ipv6InSubnet(value, "2000::", 3)
    && !ipv6InSubnet(value, "2001::", 23)
    && !ipv6InSubnet(value, "2001:db8::", 32)
    && !ipv6InSubnet(value, "2002::", 16)
    && !ipv6InSubnet(value, "3fff::", 20);
}

function normalizedAddress(address) {
  if (isIP(address) === 4) {
    return { family: 4, value: BigInt(ipv4Number(address)) };
  }
  if (isIP(address) === 6) {
    return { family: 6, value: ipv6BigInt(address) };
  }
  return null;
}

function sameAddress(left, right) {
  const a = normalizedAddress(left);
  const b = normalizedAddress(right);
  return a !== null && b !== null && a.family === b.family
    && a.value === b.value;
}

function normalizeLookupRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0
    || rows.length > MAXIMUM_RESOLVED_ADDRESSES) {
    fail("DNS_RESOLUTION_REFUSED");
  }
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)
      || isProxy(row)) fail("DNS_RESOLUTION_REFUSED");
    const address = ownValue(row, "address", "DNS_ROW");
    const family = ownValue(row, "family", "DNS_ROW");
    if (!isPublicAddress(address, family)) {
      fail("DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED");
    }
    const canonical = normalizedAddress(address);
    const key = `${canonical.family}:${canonical.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ address, family: canonical.family });
    }
  }
  if (result.length === 0) fail("DNS_RESOLUTION_REFUSED");
  return result;
}

function normalizeUrl(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") < 1
    || Buffer.byteLength(raw, "utf8") > MAXIMUM_URL_BYTES) {
    fail("URL_INVALID");
  }
  let url;
  try { url = new URL(raw); } catch { fail("URL_INVALID"); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  const labels = hostname.split(".");
  if (url.protocol !== "https:" || url.username !== ""
    || url.password !== "" || (url.port !== "" && url.port !== "443")
    || url.hash !== "" || hostname.length < 1 || hostname.length > 253
    || labels.length < 2 || labels.some((label) => !DNS_LABEL.test(label))
    || hostname === "localhost" || hostname.endsWith(".localhost")
    || hostname.endsWith(".local") || isIP(hostname) !== 0) {
    fail("PUBLIC_HTTPS_URL_REQUIRED");
  }
  url.hostname = hostname;
  url.port = "";
  return url;
}

function normalizeRequestHeaders(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail("REQUEST_HEADERS_INVALID");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("REQUEST_HEADERS_INVALID");
  }
  const normalized = {};
  const seen = new Set();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail("REQUEST_HEADERS_INVALID");
    const lower = key.toLowerCase();
    if (!PERMITTED_REQUEST_HEADERS.has(lower) || seen.has(lower)) {
      fail("REQUEST_HEADER_FORBIDDEN");
    }
    const item = ownValue(value, key, "REQUEST_HEADERS");
    if (typeof item !== "string" || item.length === 0
      || Buffer.byteLength(item, "utf8") > MAXIMUM_HEADER_VALUE_BYTES
      || /[\r\n\0]/u.test(item)) fail("REQUEST_HEADER_VALUE_INVALID");
    seen.add(lower);
    normalized[lower === "accept" ? "Accept" : "Accept-Language"] = item;
  }
  normalized.Connection = "close";
  return Object.freeze(normalized);
}

function normalizeFetchOptions(value) {
  optionsObject(value, new Set(["method", "headers", "redirect",
    "credentials", "signal"]), "FETCH_OPTIONS");
  if (Reflect.ownKeys(value).length !== 5) fail("FETCH_OPTIONS_FIELDS_INVALID");
  const method = ownValue(value, "method", "FETCH_OPTIONS");
  if (method !== "HEAD" && method !== "GET") fail("METHOD_FORBIDDEN");
  if (ownValue(value, "redirect", "FETCH_OPTIONS") !== "error") {
    fail("REDIRECT_POLICY_REQUIRED");
  }
  if (ownValue(value, "credentials", "FETCH_OPTIONS") !== "omit") {
    fail("CREDENTIALS_OMIT_REQUIRED");
  }
  const signal = ownValue(value, "signal", "FETCH_OPTIONS");
  if (signal === null || typeof signal !== "object"
    || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function"
    || typeof signal.removeEventListener !== "function") {
    fail("ABORT_SIGNAL_REQUIRED");
  }
  return { method, headers: normalizeRequestHeaders(
    ownValue(value, "headers", "FETCH_OPTIONS")), signal };
}

async function defaultLookup(hostname, options) {
  return dnsLookup(hostname, options);
}

function responseHeaderGetter(headers) {
  const selected = new Map();
  let total = 0;
  const read = (name) => {
    if (headers && typeof headers.get === "function") return headers.get(name);
    if (headers && typeof headers === "object") {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name) {
          return Array.isArray(value) ? value.join(", ") : value ?? null;
        }
      }
    }
    return null;
  };
  for (const name of PROJECTED_RESPONSE_HEADERS) {
    const value = read(name);
    if (value === null || value === undefined) continue;
    if (typeof value !== "string" || /[\r\n\0]/u.test(value)) {
      fail("RESPONSE_HEADERS_INVALID");
    }
    total += Buffer.byteLength(name, "utf8") + Buffer.byteLength(value, "utf8");
    if (total > MAXIMUM_RESPONSE_HEADER_BYTES) fail("RESPONSE_HEADERS_TOO_LARGE");
    selected.set(name, value);
  }
  return Object.freeze({
    get(name) {
      if (typeof name !== "string") return null;
      return selected.get(name.toLowerCase()) ?? null;
    },
  });
}

function defaultPinnedRequest(request) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let certificateHostnameVerified = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const req = httpsRequest(request.url, {
      method: request.method,
      headers: request.headers,
      agent: false,
      rejectUnauthorized: true,
      servername: request.hostname,
      checkServerIdentity(hostname, certificate) {
        if (hostname !== request.hostname) {
          return transportError("TLS_SERVERNAME_BINDING_MISMATCH");
        }
        const error = tlsCheckServerIdentity(hostname, certificate);
        if (error === undefined) certificateHostnameVerified = true;
        return error;
      },
      signal: request.signal,
      family: request.family,
      autoSelectFamily: false,
      maxHeaderSize: MAXIMUM_RESPONSE_HEADER_BYTES,
      lookup(hostname, options, callback) {
        if (hostname.toLowerCase().replace(/\.$/u, "")
          !== request.hostname) {
          callback(transportError("TLS_SERVERNAME_BINDING_MISMATCH"));
          return;
        }
        if (options && options.all === true) {
          callback(null, [{ address: request.address,
            family: request.family }]);
        } else callback(null, request.address, request.family);
      },
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > request.maximumResponseBytes) {
          response.destroy(transportError("RESPONSE_TOO_LARGE"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => finish(resolve, {
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks, bytes),
        remoteAddress: response.socket.remoteAddress,
        remoteFamily: response.socket.remoteFamily,
        tlsAuthorized: response.socket.authorized === true,
        tlsServernameVerified: certificateHostnameVerified,
        tlsCertificateHostnameVerified: certificateHostnameVerified,
      }));
      response.on("error", (error) => finish(reject, error));
    });
    req.on("socket", (socket) => {
      socket.once("secureConnect", () => {
        if (socket.authorized !== true || !certificateHostnameVerified
          || !sameAddress(socket.remoteAddress, request.address)) {
          req.destroy(transportError("TLS_REMOTE_OR_CERTIFICATE_MISMATCH"));
        }
      });
    });
    req.on("error", (error) => finish(reject, error));
    req.end();
  });
}

function normalizeDependencies(value) {
  if (value === undefined) value = {};
  optionsObject(value, new Set(["lookupImpl", "requestImpl", "timeoutMs",
    "maximumResponseBytes"]), "TRANSPORT_CONFIG");
  const lookupImpl = value.lookupImpl ?? defaultLookup;
  const requestImpl = value.requestImpl ?? defaultPinnedRequest;
  const timeoutMs = value.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumResponseBytes = value.maximumResponseBytes
    ?? DEFAULT_MAXIMUM_RESPONSE_BYTES;
  if (typeof lookupImpl !== "function") fail("LOOKUP_IMPLEMENTATION_INVALID");
  if (typeof requestImpl !== "function") fail("REQUEST_IMPLEMENTATION_INVALID");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
    || timeoutMs > MAX_TIMEOUT_MS) fail("TIMEOUT_INVALID");
  if (!Number.isSafeInteger(maximumResponseBytes)
    || maximumResponseBytes < 1
    || maximumResponseBytes > MAXIMUM_RESPONSE_BYTES) {
    fail("MAXIMUM_RESPONSE_BYTES_INVALID");
  }
  return { lookupImpl, requestImpl, timeoutMs, maximumResponseBytes };
}

function normalizedPinnedResponse(value, selected, maximumResponseBytes) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail("RESPONSE_SHAPE_INVALID");
  const status = value.status;
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    fail("RESPONSE_SHAPE_INVALID");
  }
  let body;
  if (Buffer.isBuffer(value.body)) body = Buffer.from(value.body);
  else if (value.body instanceof Uint8Array) body = Buffer.from(value.body);
  else if (typeof value.body === "string") body = Buffer.from(value.body, "utf8");
  else if (value.body === null || value.body === undefined) body = Buffer.alloc(0);
  else fail("RESPONSE_SHAPE_INVALID");
  if (body.length > maximumResponseBytes) fail("RESPONSE_TOO_LARGE");
  if (value.tlsAuthorized !== true || value.tlsServernameVerified !== true
    || value.tlsCertificateHostnameVerified !== true
    || !sameAddress(value.remoteAddress, selected.address)
    || !((selected.family === 4 && (value.remoteFamily === 4
      || value.remoteFamily === "IPv4"))
      || (selected.family === 6 && (value.remoteFamily === 6
        || value.remoteFamily === "IPv6")))) {
    fail("TLS_REMOTE_OR_CERTIFICATE_MISMATCH");
  }
  return { status, headers: responseHeaderGetter(value.headers), body };
}

function responseLike(normalized) {
  const body = Buffer.from(normalized.body);
  return Object.freeze({
    status: normalized.status,
    headers: normalized.headers,
    body: null,
    async arrayBuffer() {
      const copy = Buffer.from(body);
      return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    },
    async text() { return body.toString("utf8"); },
  });
}

function safeUnderlyingError(error) {
  if (error && typeof error === "object"
    && typeof error.outsiderCode === "string") return error;
  return transportError("TRANSPORT_UNAVAILABLE");
}

/**
 * Create a fetch-compatible function for injection into read-only adapters.
 * The optional dependencies exist for offline conformance tests; every
 * injected response must still carry and pass the address/TLS replay fields.
 */
export function createPublicHttpsReadOnlyFetchTransportV1(config) {
  const dependencies = normalizeDependencies(config);
  return async function publicHttpsReadOnlyFetch(rawUrl, fetchOptions) {
    const url = normalizeUrl(rawUrl);
    const options = normalizeFetchOptions(fetchOptions);
    if (options.signal.aborted) throw transportError("ABORTED");
    const controller = new AbortController();
    let resolveCallerAbort;
    const callerAbort = new Promise((resolve) => {
      resolveCallerAbort = resolve;
    });
    const abortFromCaller = () => {
      controller.abort();
      resolveCallerAbort({ kind: "ABORTED" });
    };
    options.signal.addEventListener("abort", abortFromCaller, { once: true });
    if (options.signal.aborted) abortFromCaller();
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: "TIMEOUT" });
      }, dependencies.timeoutMs);
    });
    const work = (async () => {
      const rows = await dependencies.lookupImpl(url.hostname, {
        all: true, verbatim: true, signal: controller.signal,
      });
      const addresses = normalizeLookupRows(rows);
      const selected = addresses[0];
      const raw = await dependencies.requestImpl({
        url: url.href,
        hostname: url.hostname,
        address: selected.address,
        family: selected.family,
        method: options.method,
        headers: options.headers,
        signal: controller.signal,
        maximumResponseBytes: dependencies.maximumResponseBytes,
      });
      return { kind: "RESPONSE", value: normalizedPinnedResponse(raw,
        selected, dependencies.maximumResponseBytes) };
    })().catch((error) => ({ kind: "ERROR", error }));
    try {
      const outcome = await Promise.race([work, timeout, callerAbort]);
      if (outcome.kind === "TIMEOUT") throw transportError("TIMEOUT");
      if (outcome.kind === "ABORTED") throw transportError("ABORTED");
      if (outcome.kind === "ERROR") throw safeUnderlyingError(outcome.error);
      return responseLike(outcome.value);
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", abortFromCaller);
      controller.abort();
    }
  };
}

export const createPinnedPublicHttpsFetchV1
  = createPublicHttpsReadOnlyFetchTransportV1;
