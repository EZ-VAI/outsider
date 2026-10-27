import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";

import {
  createOneUseTenderResponseLinkDefinitionV1,
  createOneUseTenderResponseLinkHandlerV1,
  oneUseTenderResponseTokenHashV1,
} from "../../../src/outsider-one-use-tender-response-link-handler-v1.js";
import {
  createCloudflareSqliteDurableObjectOneUseTenderResponseStoreV1,
} from "../../../src/outsider-cloudflare-sqlite-do-one-use-tender-response-store-v1.js";
import {
  verifyCloudflareOneUseTenderResponseTokenV1,
} from "../../../src/outsider-cloudflare-one-use-tender-response-token-v1.js";

const TOKEN = /^[A-Za-z0-9_-]{43,86}$/u;
const TOKEN_HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_ADMIN_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function json(status, value) {
  return new Response(`${JSON.stringify(value)}\n`, {
    status, headers: JSON_HEADERS,
  });
}

function exact(value, fields) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Reflect.ownKeys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function adminAuthorized(request, env) {
  const expected = String(env.ADMIN_BEARER_TOKEN ?? "");
  if (expected.length < 32 || expected.length > 512) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = createHash("sha256").update(presented).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right) && presented.length === expected.length;
}

function tokenMacKeys(env) {
  let value;
  try { value = JSON.parse(String(env.RESPONSE_LINK_TOKEN_MAC_KEYRING_JSON)); }
  catch { return []; }
  return Array.isArray(value) && value.length >= 1 && value.length <= 8
    && value.every((item) => typeof item === "string"
      && Buffer.byteLength(item, "utf8") >= 32
      && Buffer.byteLength(item, "utf8") <= 512) ? value : [];
}

function validRoutingToken(token, env) {
  return tokenMacKeys(env).some((key) =>
    verifyCloudflareOneUseTenderResponseTokenV1(token, key));
}

function route(pathname) {
  let match = /^\/r\/v1\/([A-Za-z0-9_-]{43,86})$/u.exec(pathname);
  if (match) return { kind: "PUBLIC_RESPONSE", token: match[1] };
  match = /^\/internal\/v1\/response-links\/([A-Za-z0-9_-]{43,86})$/u
    .exec(pathname);
  if (match) return { kind: "INITIALIZE", token: match[1] };
  match = /^\/internal\/v1\/response-links\/([A-Za-z0-9_-]{43,86})\/revoke$/u
    .exec(pathname);
  if (match) return { kind: "REVOKE", token: match[1] };
  match = /^\/internal\/v1\/response-links\/([A-Za-z0-9_-]{43,86})\/source$/u
    .exec(pathname);
  if (match) return { kind: "SOURCE", token: match[1] };
  match = /^\/internal\/v1\/response-link-sources\/(sha256:[a-f0-9]{64})$/u
    .exec(pathname);
  if (match) return { kind: "SOURCE_BY_HASH", tokenHash: match[1] };
  return null;
}

function routeMaterialValid(matched) {
  return matched !== null && (typeof matched.token === "string"
    ? TOKEN.test(matched.token) : TOKEN_HASH.test(matched.tokenHash));
}

async function boundedBytes(request, maximum) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^[0-9]{1,10}$/u.test(declared)
    || Number(declared) > maximum)) throw new Error("BODY_TOO_LARGE");
  if (request.body === null) throw new Error("BODY_TOO_LARGE");
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("BODY_STREAM_INVALID");
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel("body limit exceeded");
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total < 1) throw new Error("BODY_TOO_LARGE");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function jsonBody(request, maximum) {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error("CONTENT_TYPE_INVALID");
  }
  const bytes = await boundedBytes(request, maximum);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("JSON_INVALID"); }
}

function errorStatus(error) {
  const code = String(error?.outsiderCode ?? error?.message ?? error)
    .split(":", 1)[0];
  if (code.includes("NOT_INITIALIZED") || code.includes("NOT_FOUND")) {
    return 404;
  }
  if (code.includes("CONFLICT") || code.includes("ALREADY")) return 409;
  if (code.includes("TOO_LARGE")) return 413;
  if (code.includes("STORED_") || code.includes("READBACK")
    || code.includes("MISMATCH")) return 500;
  return 400;
}

function publicError(error) {
  const status = errorStatus(error);
  return json(status, { ok: false,
    error: status === 500 ? "INTERNAL_STATE_INVALID" : "REQUEST_INVALID" });
}

function handlerResponse(result) {
  return new Response(result.bodyBytes, {
    status: result.statusCode,
    headers: result.headers,
  });
}

export class OneUseTenderResponseLink {
  constructor(ctx, env) {
    this.env = env;
    this.store = createCloudflareSqliteDurableObjectOneUseTenderResponseStoreV1({
      storage: ctx.storage,
    });
  }

  async fetch(request) {
    try {
      const matched = route(new URL(request.url).pathname);
      if (!routeMaterialValid(matched)) {
        return json(404, { ok: false, error: "NOT_FOUND" });
      }
      if (matched.token !== undefined
        && !validRoutingToken(matched.token, this.env)) {
        return json(404, { ok: false, error: "NOT_FOUND" });
      }
      const actualTokenHash = matched.tokenHash
        ?? oneUseTenderResponseTokenHashV1(matched.token);
      if (matched.kind === "INITIALIZE") {
        if (request.method !== "PUT" || !adminAuthorized(request, this.env)) {
          return json(request.method === "PUT" ? 404 : 405,
            { ok: false, error: "NOT_FOUND" });
        }
        const body = await jsonBody(request, MAX_ADMIN_BODY_BYTES);
        if (!exact(body, ["tenderHash", "requirementKind", "requirementId",
          "issuedAt", "expiresAt", "summary", "acceptedCurrencyCodes",
          "responsibilityTermsText", "responsibilityTermsHash"])) {
          throw new Error("DEFINITION_BODY_INVALID");
        }
        const definition = createOneUseTenderResponseLinkDefinitionV1({
          ...body, responseToken: matched.token,
        });
        if (definition.tokenHash !== actualTokenHash) {
          throw new Error("TOKEN_HASH_MISMATCH");
        }
        const stored = this.store.initializeDefinition({ definition });
        const handler = createOneUseTenderResponseLinkHandlerV1({
          definition: stored.definition,
          store: this.store,
          clock: () => new Date().toISOString(),
        });
        const projection = await handler.initialize();
        return json(stored.status === "INITIALIZED" ? 201 : 200,
          { ok: true, publicProjection: projection });
      }

      const definition = this.store.readDefinition();
      if (definition === null || definition.tokenHash !== actualTokenHash) {
        return json(404, { ok: false, error: "NOT_FOUND" });
      }
      const handler = createOneUseTenderResponseLinkHandlerV1({
        definition, store: this.store,
        clock: () => new Date().toISOString(),
      });

      if (matched.kind === "REVOKE") {
        if (request.method !== "POST" || !adminAuthorized(request, this.env)) {
          return json(request.method === "POST" ? 404 : 405,
            { ok: false, error: "NOT_FOUND" });
        }
        const projection = await handler.revoke(await jsonBody(request,
          MAX_ADMIN_BODY_BYTES));
        return json(200, { ok: true, publicProjection: projection });
      }

      if (matched.kind === "SOURCE" || matched.kind === "SOURCE_BY_HASH") {
        if (request.method !== "GET" || !adminAuthorized(request, this.env)) {
          return json(request.method === "GET" ? 404 : 405,
            { ok: false, error: "NOT_FOUND" });
        }
        const replay = await handler.readPersistedPrivateResponseSource();
        if (replay.privateSource === null) {
          const statusCode = replay.status === "AWAITING_RESPONSE" ? 202 : 404;
          return json(statusCode, { ok: statusCode === 202,
            status: replay.status, decisionState: "HOLD" });
        }
        const source = replay.privateSource;
        return json(200, { ok: true, status: replay.status,
          source: {
            schema: source.schema,
            schemaVersion: source.schemaVersion,
            event: source.event,
            eventHash: source.eventHash,
            sourceBodyHash: source.sourceBodyHash,
            sourceByteLength: source.sourceByteLength,
            contentType: source.contentType,
            sourceBodyBase64: source.sourceBytes.toString("base64"),
            normalizedResponse: source.normalizedResponse,
            responseOccurrenceOnly: true,
            providerIdentityEstablished: false,
            resourceOwnerAuthorityEstablished: false,
            capacityReserved: false,
            decisionState: "HOLD",
          } });
      }

      if (!new Set(["GET", "POST"]).has(request.method)) {
        return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
      }
      const bodyBytes = request.method === "POST"
        ? await boundedBytes(request, MAX_RESPONSE_BODY_BYTES) : null;
      const contentType = request.method === "POST"
        ? request.headers.get("content-type")?.split(";", 1)[0]
          ?.trim().toLowerCase() ?? ""
        : null;
      const result = await handler.handle({ method: request.method,
        token: matched.token, contentType, bodyBytes });
      return handlerResponse(result);
    } catch (error) {
      return publicError(error);
    }
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/healthz") {
      if (request.method !== "GET") {
        return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
      }
      return json(200, { ok: true,
        service: "outsider-one-use-tender-response-link",
        version: "1.0.0", mode: "HOLD" });
    }
    const matched = route(pathname);
    if (!routeMaterialValid(matched)) {
      return json(404, { ok: false, error: "NOT_FOUND" });
    }
    if (matched.kind !== "PUBLIC_RESPONSE"
      && !adminAuthorized(request, env)) {
      return json(404, { ok: false, error: "NOT_FOUND" });
    }
    if (matched.token !== undefined && !validRoutingToken(matched.token, env)) {
      return json(404, { ok: false, error: "NOT_FOUND" });
    }
    let tokenHash = matched.tokenHash;
    try { tokenHash ??= oneUseTenderResponseTokenHashV1(matched.token); }
    catch { return json(404, { ok: false, error: "NOT_FOUND" }); }
    const namespace = env.RESPONSE_LINKS;
    if (namespace === null || typeof namespace !== "object"
      || typeof namespace.idFromName !== "function"
      || typeof namespace.get !== "function") {
      return json(500, { ok: false, error: "BINDING_UNAVAILABLE" });
    }
    const stub = namespace.get(namespace.idFromName(tokenHash));
    return stub.fetch(request);
  },
};
