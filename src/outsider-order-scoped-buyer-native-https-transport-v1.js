/*
 * Order-scoped buyer-native HTTPS transport v1.
 *
 * This is the concrete transport closure consumed by the Adafruit and
 * SparkFun guest-cart adapters. A finite per-order origin set is fixed when
 * the closure is created. Fetch always uses manual redirect handling; a 3xx
 * response is returned only after its Location is proven same-origin. The
 * transport never follows a redirect on the adapter's behalf.
 *
 * Cookies are transport-private state. They are held in an owner-only,
 * fsync-backed file so an anonymous Adafruit cart survives a cold process
 * restart. Exact response bytes and fetch-observed headers are returned only
 * to the source-specific adapter and are not part of this transport's public
 * inspection surface.
 */

import { randomBytes } from "node:crypto";
import {
  constants as fsConstants,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_ORDER_SCOPED_BUYER_NATIVE_HTTPS_TRANSPORT_V1_";
const SCHEMA = "outsider/order-scoped-buyer-native-cookie-jar/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const MAXIMUM_ORIGINS = 8;
const MAXIMUM_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAXIMUM_RESPONSE_BYTES = 768 * 1024;
const MAXIMUM_REQUEST_BYTES = 256 * 1024;
const MAXIMUM_HEADER_BYTES = 64 * 1024;
const MAXIMUM_COOKIE_FILE_BYTES = 256 * 1024;
const MAXIMUM_COOKIES = 128;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAXIMUM_TIMEOUT_MS = 60_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const OPERATIONS = new Set(["QUOTE", "HOLD", "STATUS", "CANCEL"]);
const METHODS = new Set(["GET", "POST", "DELETE"]);
const REQUEST_HEADERS = new Set(["accept", "content-type"]);
const TRANSPORTS = new WeakMap();

export const OUTSIDER_ORDER_SCOPED_BUYER_NATIVE_HTTPS_TRANSPORT_V1_LIMITS
  = Object.freeze({
    maximumOrigins: MAXIMUM_ORIGINS,
    maximumResponseBytes: MAXIMUM_RESPONSE_BYTES,
    defaultMaximumResponseBytes: DEFAULT_MAXIMUM_RESPONSE_BYTES,
    maximumRequestBytes: MAXIMUM_REQUEST_BYTES,
    maximumHeaderBytes: MAXIMUM_HEADER_BYTES,
    maximumCookies: MAXIMUM_COOKIES,
    maximumTimeoutMs: MAXIMUM_TIMEOUT_MS,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  });

export const OUTSIDER_ORDER_SCOPED_BUYER_NATIVE_HTTPS_TRANSPORT_V1_BOUNDARY
  = Object.freeze({
    position: "ORDER_SCOPED_BUYER_NATIVE_HTTPS_TRANSPORT",
    finiteOriginAllowlistRequired: true,
    httpsOnly: true,
    permittedMethods: Object.freeze(["GET", "POST", "DELETE"]),
    redirectMode: "MANUAL_SAME_ORIGIN_ONLY",
    redirectsFollowed: false,
    crossOriginRedirectAccepted: false,
    callerCookieHeaderAccepted: false,
    callerAuthorizationHeaderAccepted: false,
    cookieJarOrderScoped: true,
    cookieJarDurable: true,
    cookieJarDirectoryMode: "0700",
    cookieJarFileMode: "0600",
    cookieSecretsProjected: false,
    exactResponseBytesReturnedToAdapter: true,
    exactFetchObservedHeadersReturnedToAdapter: true,
    checkoutImplemented: false,
    paymentImplemented: false,
    orderSubmissionImplemented: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function transportError(code) {
  const error = new Error(`${PREFIX}${code}`);
  error.outsiderCode = code;
  return error;
}

function fail(code) {
  throw transportError(code);
}

function plainObject(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  return value;
}

function optionsObject(value, allowed, code) {
  plainObject(value, code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function sha256(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function positiveInteger(value, fallback, maximum, code) {
  const selected = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    fail(`${code}_INVALID`);
  }
  return selected;
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 2048) {
    fail("ORIGIN_INVALID");
  }
  let url;
  try { url = new URL(value); } catch { fail("ORIGIN_INVALID"); }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || url.pathname !== "/" || url.search !== "" || url.hash !== ""
    || (url.port !== "" && url.port !== "443") || url.hostname === "") {
    fail("ORIGIN_INVALID");
  }
  return url.origin;
}

function normalizeOrigins(value) {
  if (!Array.isArray(value) || value.length < 1
    || value.length > MAXIMUM_ORIGINS) fail("ALLOWED_ORIGINS_INVALID");
  const normalized = value.map(normalizeOrigin);
  if (new Set(normalized).size !== normalized.length) {
    fail("ALLOWED_ORIGINS_DUPLICATE");
  }
  return Object.freeze(normalized);
}

function exactRequest(value) {
  plainObject(value, "REQUEST");
  const expected = [
    "schema", "schemaVersion", "provider", "sessionRefHash", "operation",
    "step", "method", "url", "headers", "bodyBytes", "redirectPolicy",
    "maximumResponseBytes",
  ];
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length
    || expected.some((key) => !Object.hasOwn(value, key))) {
    fail("REQUEST_FIELDS_INVALID");
  }
  if (value.schema !== "outsider/source-specific-buyer-native-https-request/v1"
    || value.schemaVersion !== "1.0.0"
    || typeof value.provider !== "string" || value.provider.length < 1
    || value.provider.length > 128
    || typeof value.step !== "string" || value.step.length < 1
    || value.step.length > 128 || !OPERATIONS.has(value.operation)
    || !METHODS.has(value.method)
    || value.redirectPolicy !== "MANUAL_SAME_ORIGIN_ONLY") {
    fail("REQUEST_INVALID");
  }
  sha256(value.sessionRefHash, "SESSION_REF_HASH");
  const bodyBytes = value.bodyBytes === null ? null : value.bodyBytes;
  if (bodyBytes !== null && !Buffer.isBuffer(bodyBytes)) {
    fail("REQUEST_BODY_INVALID");
  }
  if (bodyBytes !== null && bodyBytes.length > MAXIMUM_REQUEST_BYTES) {
    fail("REQUEST_BODY_TOO_LARGE");
  }
  if ((value.method === "GET" || value.method === "DELETE")
    && bodyBytes !== null) fail("REQUEST_BODY_NOT_ALLOWED");
  const maximumResponseBytes = positiveInteger(value.maximumResponseBytes,
    undefined, MAXIMUM_RESPONSE_BYTES, "REQUEST_MAXIMUM_RESPONSE_BYTES");
  return { ...value, bodyBytes: bodyBytes === null ? null : Buffer.from(bodyBytes),
    maximumResponseBytes };
}

function normalizedUrl(raw, allowedOrigins) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 16 * 1024) {
    fail("URL_INVALID");
  }
  let url;
  try { url = new URL(raw); } catch { fail("URL_INVALID"); }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || url.hash !== "" || (url.port !== "" && url.port !== "443")
    || !allowedOrigins.includes(url.origin)) fail("URL_NOT_ALLOWLISTED");
  return url;
}

function normalizedRequestHeaders(value) {
  plainObject(value, "REQUEST_HEADERS");
  const output = Object.create(null);
  let bytes = 0;
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.toLowerCase();
    if (rawName !== name || !REQUEST_HEADERS.has(name)
      || typeof rawValue !== "string" || /[\r\n]/u.test(rawValue)) {
      fail("REQUEST_HEADER_NOT_ALLOWED");
    }
    bytes += Buffer.byteLength(name, "utf8")
      + Buffer.byteLength(rawValue, "utf8");
    if (bytes > MAXIMUM_HEADER_BYTES) fail("REQUEST_HEADERS_TOO_LARGE");
    output[name] = rawValue;
  }
  return output;
}

function pathDefault(url) {
  const index = url.pathname.lastIndexOf("/");
  if (index <= 0) return "/";
  return url.pathname.slice(0, index + 1);
}

function domainMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function cookieRecord(value) {
  plainObject(value, "COOKIE");
  const fields = ["name", "value", "domain", "hostOnly", "path", "secure",
    "httpOnly", "sameSite", "expiresAt", "creationIndex"];
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((key) => !Object.hasOwn(value, key))
    || typeof value.name !== "string" || !TOKEN.test(value.name)
    || typeof value.value !== "string" || /[;\u0000-\u001f\u007f]/u.test(value.value)
    || typeof value.domain !== "string" || value.domain === ""
    || typeof value.hostOnly !== "boolean" || typeof value.path !== "string"
    || !value.path.startsWith("/") || typeof value.secure !== "boolean"
    || typeof value.httpOnly !== "boolean"
    || ![null, "LAX", "STRICT", "NONE"].includes(value.sameSite)
    || (value.expiresAt !== null && (!Number.isSafeInteger(value.expiresAt)
      || value.expiresAt < 0))
    || !Number.isSafeInteger(value.creationIndex) || value.creationIndex < 0) {
    fail("COOKIE_STATE_INVALID");
  }
  return { ...value };
}

function splitCombinedSetCookie(value) {
  if (typeof value !== "string" || value === "") return [];
  return value.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/u)
    .map((item) => item.trim()).filter(Boolean);
}

function setCookieLines(headers) {
  if (headers === null || typeof headers !== "object") return [];
  if (typeof headers.getSetCookie === "function") {
    const values = headers.getSetCookie();
    if (Array.isArray(values) && values.length > 0) return values.map(String);
  }
  if (typeof headers.raw === "function") {
    const raw = headers.raw();
    const values = raw?.["set-cookie"];
    if (Array.isArray(values) && values.length > 0) return values.map(String);
  }
  if (typeof headers.get === "function") {
    return splitCombinedSetCookie(headers.get("set-cookie"));
  }
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== "set-cookie") continue;
    if (Array.isArray(value)) return value.map(String);
    return splitCombinedSetCookie(String(value));
  }
  return [];
}

function parseSetCookie(line, responseUrl, now, creationIndex) {
  if (typeof line !== "string" || line.length > 16 * 1024
    || /[\r\n]/u.test(line)) return null;
  const parts = line.split(";");
  const first = parts.shift();
  const equals = first.indexOf("=");
  if (equals < 1) return null;
  const name = first.slice(0, equals).trim();
  const value = first.slice(equals + 1).trim();
  if (!TOKEN.test(name) || /[;\u0000-\u001f\u007f]/u.test(value)) return null;
  let domain = responseUrl.hostname.toLowerCase();
  let hostOnly = true;
  let cookiePath = pathDefault(responseUrl);
  let secure = false;
  let httpOnly = false;
  let sameSite = null;
  let expiresAt = null;
  let maxAgeSeen = false;
  for (const part of parts) {
    const split = part.indexOf("=");
    const rawName = (split < 0 ? part : part.slice(0, split)).trim();
    const rawValue = split < 0 ? "" : part.slice(split + 1).trim();
    const attribute = rawName.toLowerCase();
    if (attribute === "domain") {
      const candidate = rawValue.toLowerCase().replace(/^\./u, "");
      if (candidate === "" || !domainMatches(responseUrl.hostname, candidate)) {
        return null;
      }
      domain = candidate;
      hostOnly = false;
    } else if (attribute === "path" && rawValue.startsWith("/")) {
      cookiePath = rawValue;
    } else if (attribute === "secure") {
      secure = true;
    } else if (attribute === "httponly") {
      httpOnly = true;
    } else if (attribute === "samesite") {
      const selected = rawValue.toUpperCase();
      if (["LAX", "STRICT", "NONE"].includes(selected)) sameSite = selected;
    } else if (attribute === "max-age" && /^-?\d+$/u.test(rawValue)) {
      const seconds = Number(rawValue);
      if (Number.isSafeInteger(seconds)) {
        expiresAt = seconds <= 0 ? 0
          : Math.min(Number.MAX_SAFE_INTEGER, now + seconds * 1000);
        maxAgeSeen = true;
      }
    } else if (attribute === "expires" && !maxAgeSeen) {
      const parsed = Date.parse(rawValue);
      if (Number.isFinite(parsed)) expiresAt = Math.max(0, Math.trunc(parsed));
    }
  }
  if (name.startsWith("__Secure-") && !secure) return null;
  if (name.startsWith("__Host-")
    && (!secure || !hostOnly || cookiePath !== "/")) return null;
  return { name, value, domain, hostOnly, path: cookiePath, secure, httpOnly,
    sameSite, expiresAt, creationIndex };
}

function cookieIdentity(cookie) {
  return `${cookie.name}\0${cookie.domain}\0${cookie.path}`;
}

function applySetCookies(cookies, lines, responseUrl, now, nextCreationIndex) {
  const byIdentity = new Map(cookies.map((cookie) =>
    [cookieIdentity(cookie), cookie]));
  let next = nextCreationIndex;
  for (const line of lines) {
    const parsed = parseSetCookie(line, responseUrl, now, next);
    if (parsed === null) continue;
    const identity = cookieIdentity(parsed);
    const previous = byIdentity.get(identity);
    if (previous !== undefined) parsed.creationIndex = previous.creationIndex;
    else next += 1;
    if (parsed.expiresAt !== null && parsed.expiresAt <= now) {
      byIdentity.delete(identity);
    } else {
      byIdentity.set(identity, parsed);
    }
  }
  const result = [...byIdentity.values()];
  if (result.length > MAXIMUM_COOKIES) fail("COOKIE_LIMIT_EXCEEDED");
  return { cookies: result, nextCreationIndex: next };
}

function cookiePathMatches(requestPath, cookiePath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

function cookieHeader(cookies, requestUrl, now) {
  const selected = cookies.filter((cookie) =>
    (cookie.expiresAt === null || cookie.expiresAt > now)
      && (cookie.hostOnly ? requestUrl.hostname === cookie.domain
        : domainMatches(requestUrl.hostname, cookie.domain))
      && cookiePathMatches(requestUrl.pathname, cookie.path)
      && (!cookie.secure || requestUrl.protocol === "https:"));
  selected.sort((left, right) => right.path.length - left.path.length
    || left.creationIndex - right.creationIndex);
  return selected.length === 0 ? null
    : selected.map(({ name, value }) => `${name}=${value}`).join("; ");
}

function responseHeaderSnapshot(headers) {
  if (headers === null || typeof headers !== "object") fail("RESPONSE_HEADERS_INVALID");
  const values = new Map();
  const append = (rawName, rawValue) => {
    const name = String(rawName).toLowerCase();
    const value = String(rawValue);
    if (!TOKEN.test(name) || /[\r\n]/u.test(value)) {
      fail("RESPONSE_HEADERS_INVALID");
    }
    const previous = values.get(name);
    if (previous === undefined) values.set(name, value);
    else if (Array.isArray(previous)) previous.push(value);
    else values.set(name, [previous, value]);
  };
  if (typeof headers.entries === "function") {
    for (const [name, value] of headers.entries()) append(name, value);
  } else {
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) value.forEach((entry) => append(name, entry));
      else append(name, value);
    }
  }
  let bytes = 0;
  const output = Object.create(null);
  for (const [name, value] of values) {
    bytes += Buffer.byteLength(name, "utf8");
    if (Array.isArray(value)) {
      bytes += value.reduce((sum, item) => sum + Buffer.byteLength(item, "utf8"), 0);
      output[name] = Object.freeze([...value]);
    } else {
      bytes += Buffer.byteLength(value, "utf8");
      output[name] = value;
    }
    if (bytes > MAXIMUM_HEADER_BYTES) fail("RESPONSE_HEADERS_TOO_LARGE");
  }
  return Object.freeze(output);
}

function responseHeader(headers, name) {
  const value = headers[name];
  if (value === undefined) return null;
  return Array.isArray(value) ? value[0] : value;
}

async function boundedResponseBytes(response, maximum) {
  const declared = typeof response.headers?.get === "function"
    ? response.headers.get("content-length") : null;
  if (declared !== null && /^\d+$/u.test(declared)
    && Number(declared) > maximum) fail("RESPONSE_TOO_LARGE");
  if (response.body === null || response.body === undefined) return Buffer.alloc(0);
  if (typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) fail("RESPONSE_BODY_INVALID");
        length += value.byteLength;
        if (length > maximum) {
          try { await reader.cancel(); } catch {}
          fail("RESPONSE_TOO_LARGE");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    return Buffer.concat(chunks, length);
  }
  if (typeof response.arrayBuffer !== "function") fail("RESPONSE_BODY_INVALID");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximum) fail("RESPONSE_TOO_LARGE");
  return bytes;
}

function responseStatus(response) {
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status)
    || response.status < 100 || response.status > 599) {
    fail("RESPONSE_INVALID");
  }
  return response.status;
}

async function ensurePrivatePaths(config) {
  await mkdir(config.privateStateDirectory, { recursive: true, mode: 0o700 });
  const stat = await lstat(config.privateStateDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o700) fail("PRIVATE_DIRECTORY_MODE_INVALID");
  const directory = await realpath(config.privateStateDirectory);
  const file = path.join(directory,
    `${config.orderRefHash.slice("sha256:".length)}.cookies-v1.json`);
  return { directory, file };
}

async function loadCookieState(config, privatePaths) {
  let stat;
  try { stat = await lstat(privatePaths.file); }
  catch (error) {
    if (error?.code === "ENOENT") return { cookies: [], nextCreationIndex: 0 };
    fail("COOKIE_STATE_LOAD_FAILED");
  }
  if (!stat.isFile() || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o600
    || stat.size < 1 || stat.size > MAXIMUM_COOKIE_FILE_BYTES) {
    fail("COOKIE_STATE_FILE_INVALID");
  }
  let handle;
  try {
    handle = await open(privatePaths.file,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const bytes = await handle.readFile();
    let source;
    try { source = JSON.parse(bytes.toString("utf8")); }
    catch { fail("COOKIE_STATE_JSON_INVALID"); }
    plainObject(source, "COOKIE_STATE");
    const fields = ["schema", "schemaVersion", "orderRefHash",
      "nextCreationIndex", "cookies"];
    const keys = Reflect.ownKeys(source);
    if (keys.length !== fields.length
      || fields.some((field) => !Object.hasOwn(source, field))
      || source.schema !== SCHEMA || source.schemaVersion !== "1.0.0"
      || source.orderRefHash !== config.orderRefHash
      || !Number.isSafeInteger(source.nextCreationIndex)
      || source.nextCreationIndex < 0 || !Array.isArray(source.cookies)
      || source.cookies.length > MAXIMUM_COOKIES) fail("COOKIE_STATE_INVALID");
    const cookies = source.cookies.map(cookieRecord);
    return { cookies, nextCreationIndex: source.nextCreationIndex };
  } catch (error) {
    if (error?.outsiderCode !== undefined) throw error;
    fail("COOKIE_STATE_LOAD_FAILED");
  } finally {
    try { await handle?.close(); } catch {}
  }
}

async function durableCookieState(config, privatePaths, state) {
  const bytes = Buffer.from(canonicalizeStrict({
    schema: SCHEMA,
    schemaVersion: "1.0.0",
    orderRefHash: config.orderRefHash,
    nextCreationIndex: state.nextCreationIndex,
    cookies: state.cookies,
  }), "utf8");
  if (bytes.length > MAXIMUM_COOKIE_FILE_BYTES) fail("COOKIE_STATE_TOO_LARGE");
  const temporary = `${privatePaths.file}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  let handle;
  try {
    handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT
      | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, privatePaths.file);
    const directory = await open(privatePaths.directory, fsConstants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) {
    try { await handle?.close(); } catch {}
    try { await unlink(temporary); } catch {}
    if (error?.outsiderCode !== undefined) throw error;
    fail("COOKIE_STATE_STORE_FAILED");
  }
}

function normalizeConfig(input, dependencies) {
  optionsObject(input, new Set(["privateStateDirectory", "orderRefHash",
    "allowedOrigins", "timeoutMs", "maximumResponseBytes"]), "CONFIG");
  optionsObject(dependencies, new Set(["fetchImpl", "clock"]), "DEPENDENCIES");
  if (typeof input.privateStateDirectory !== "string"
    || !path.isAbsolute(input.privateStateDirectory)) {
    fail("PRIVATE_STATE_DIRECTORY_INVALID");
  }
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const clock = dependencies.clock ?? Date.now;
  if (typeof fetchImpl !== "function" || isProxy(fetchImpl)) fail("FETCH_IMPL_INVALID");
  if (typeof clock !== "function" || isProxy(clock)) fail("CLOCK_INVALID");
  return {
    privateStateDirectory: input.privateStateDirectory,
    orderRefHash: sha256(input.orderRefHash, "ORDER_REF_HASH"),
    allowedOrigins: normalizeOrigins(input.allowedOrigins),
    timeoutMs: positiveInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS,
      MAXIMUM_TIMEOUT_MS, "TIMEOUT_MS"),
    maximumResponseBytes: positiveInteger(input.maximumResponseBytes,
      DEFAULT_MAXIMUM_RESPONSE_BYTES, MAXIMUM_RESPONSE_BYTES,
      "MAXIMUM_RESPONSE_BYTES"),
    fetchImpl,
    clock,
  };
}

function currentTime(clock) {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 0) fail("CLOCK_VALUE_INVALID");
  return value;
}

async function performRequest(config, state, rawRequest) {
  const request = exactRequest(rawRequest);
  if (request.maximumResponseBytes > config.maximumResponseBytes) {
    fail("REQUEST_RESPONSE_LIMIT_EXCEEDS_TRANSPORT_LIMIT");
  }
  const requestUrl = normalizedUrl(request.url, config.allowedOrigins);
  const requestHeaders = normalizedRequestHeaders(request.headers);
  const now = currentTime(config.clock);
  const liveCookies = state.cookies.filter((cookie) =>
    cookie.expiresAt === null || cookie.expiresAt > now);
  if (liveCookies.length !== state.cookies.length) {
    state.cookies = liveCookies;
    await durableCookieState(config, state.privatePaths, state);
  }
  const selectedCookieHeader = cookieHeader(state.cookies, requestUrl, now);
  if (selectedCookieHeader !== null) requestHeaders.cookie = selectedCookieHeader;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  timer.unref?.();
  let response;
  try {
    response = await config.fetchImpl(requestUrl.href, {
      method: request.method,
      headers: requestHeaders,
      ...(request.bodyBytes === null ? {} : { body: Buffer.from(request.bodyBytes) }),
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
    });
    const status = responseStatus(response);
    const headers = responseHeaderSnapshot(response.headers);
    let finalUrl;
    try {
      finalUrl = new URL(typeof response.url === "string" && response.url !== ""
        ? response.url : requestUrl.href);
    } catch { fail("RESPONSE_FINAL_URL_INVALID"); }
    if (finalUrl.origin !== requestUrl.origin
      || !config.allowedOrigins.includes(finalUrl.origin)) {
      fail("RESPONSE_FINAL_URL_CROSS_ORIGIN");
    }
    if (REDIRECT_STATUSES.has(status)) {
      const location = responseHeader(headers, "location");
      if (typeof location !== "string" || location === "") {
        fail("REDIRECT_LOCATION_INVALID");
      }
      let redirectUrl;
      try { redirectUrl = new URL(location, finalUrl); }
      catch { fail("REDIRECT_LOCATION_INVALID"); }
      if (redirectUrl.origin !== requestUrl.origin
        || !config.allowedOrigins.includes(redirectUrl.origin)) {
        fail("CROSS_ORIGIN_REDIRECT_REFUSED");
      }
    }
    const bodyBytes = await boundedResponseBytes(response,
      request.maximumResponseBytes);
    const lines = setCookieLines(response.headers);
    if (lines.length > 0) {
      const updated = applySetCookies(state.cookies, lines, finalUrl, now,
        state.nextCreationIndex);
      state.cookies = updated.cookies;
      state.nextCreationIndex = updated.nextCreationIndex;
      await durableCookieState(config, state.privatePaths, state);
    }
    return Object.freeze({ status, headers, bodyBytes,
      finalUrl: finalUrl.href });
  } catch (error) {
    if (error?.outsiderCode !== undefined) throw error;
    fail(controller.signal.aborted ? "FETCH_TIMEOUT" : "FETCH_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

export function createOrderScopedBuyerNativeHttpsTransportV1(input = {},
  dependencies = {}) {
  const config = normalizeConfig(input, dependencies);
  const state = { privatePaths: null, cookies: [], nextCreationIndex: 0,
    initialized: false, queue: Promise.resolve() };

  const httpsRequestImpl = async (request) => {
    const run = state.queue.then(async () => {
      if (!state.initialized) {
        state.privatePaths = await ensurePrivatePaths(config);
        const loaded = await loadCookieState(config, state.privatePaths);
        state.cookies = loaded.cookies;
        state.nextCreationIndex = loaded.nextCreationIndex;
        state.initialized = true;
      }
      return performRequest(config, state, request);
    });
    state.queue = run.catch(() => undefined);
    return run;
  };
  const frozen = Object.freeze(httpsRequestImpl);
  TRANSPORTS.set(frozen, Object.freeze({
    allowedOrigins: config.allowedOrigins,
    maximumResponseBytes: config.maximumResponseBytes,
    timeoutMs: config.timeoutMs,
  }));
  return frozen;
}

export function inspectOrderScopedBuyerNativeHttpsTransportV1(transport) {
  const state = TRANSPORTS.get(transport);
  if (state === undefined) fail("TRANSPORT_NOT_FACTORY_ISSUED");
  return Object.freeze({
    allowedOrigins: state.allowedOrigins,
    maximumResponseBytes: state.maximumResponseBytes,
    timeoutMs: state.timeoutMs,
    cookieJarOrderScoped: true,
    cookieJarDurable: true,
    cookieJarDirectoryMode: "0700",
    cookieJarFileMode: "0600",
    cookieSecretsProjected: false,
    redirectsFollowed: false,
    crossOriginRedirectAccepted: false,
    checkoutImplemented: false,
    paymentImplemented: false,
    orderSubmissionImplemented: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}
