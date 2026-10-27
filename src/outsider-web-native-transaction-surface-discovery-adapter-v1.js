/*
 * Outcome Formation Engine: seller-owned Web transaction-surface discovery v1.
 *
 * This adapter is the read-only fallback after a seller does not publish an
 * Outsider descriptor.  It reads only the already-discovered seller origin
 * (and same-origin redirects), then records observable HTML forms, mailto
 * links, and schema.org potentialAction targets.  An observation is not an
 * invitation, permission, offer, acceptance, price, capacity, or authority.
 * Raw URLs and mailbox identifiers stay in a one-use, in-memory private lease;
 * the replay-safe projection contains only order-scoped salted references.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { TextDecoder } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_LIMITS,
  createPinnedPublicHttpsFetchV1,
} from "./outsider-public-https-read-only-fetch-transport-v1.js";

const PREFIX = "OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REQUIREMENT_ID = /^(?:resource|evidence|recovery)_[a-f0-9]{32}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAXIMUM_TIMEOUT_MS = 60_000;
const DEFAULT_MAXIMUM_DOCUMENT_BYTES = 512 * 1024;
const MAXIMUM_DOCUMENT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAXIMUM_REDIRECTS = 2;
const MAXIMUM_REDIRECTS = 5;
const MAXIMUM_TAGS = 20_000;
const MAXIMUM_TAG_BYTES = 32 * 1024;
const MAXIMUM_ATTRIBUTE_BYTES = 8 * 1024;
const MAXIMUM_SURFACE_OCCURRENCES = 256;
const MAXIMUM_JSON_LD_SCRIPTS = 64;
const MAXIMUM_JSON_TREE_NODES = 20_000;
const MAXIMUM_JSON_TREE_DEPTH = 64;
const MAXIMUM_TARGET_BYTES = 8 * 1024;
const MAXIMUM_LEASE_MS = 24 * 60 * 60 * 1000;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const RAW_OR_INERT_TEXT_ELEMENTS = new Set([
  "script", "style", "textarea", "title", "xmp", "iframe", "noembed",
  "noframes", "template", "noscript", "plaintext",
]);
const NON_PUBLIC_SUFFIXES = Object.freeze([
  ".local", ".localhost", ".internal", ".home", ".lan", ".onion",
  ".test", ".invalid", ".example", ".arpa",
]);
const PRIVATE_RESULTS = new WeakMap();
const SAFE_URI_TEMPLATE_EXPRESSION
  = /\{[./;?&]?[a-z0-9_](?:[a-z0-9_.]*)(?:\*|:[1-9][0-9]{0,3})?(?:,[a-z0-9_](?:[a-z0-9_.]*)(?:\*|:[1-9][0-9]{0,3})?)*\}/giu;
const OVERSIZED_ATTRIBUTE = Symbol("OUTSIDER_OVERSIZED_ATTRIBUTE");

export const OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_LIMITS
  = Object.freeze({
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    maximumTimeoutMs: MAXIMUM_TIMEOUT_MS,
    effectivePinnedTransportMaximumTimeoutMs:
      OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_LIMITS
        .maximumTimeoutMs,
    defaultMaximumDocumentBytes: DEFAULT_MAXIMUM_DOCUMENT_BYTES,
    maximumDocumentBytes: MAXIMUM_DOCUMENT_BYTES,
    defaultMaximumRedirects: DEFAULT_MAXIMUM_REDIRECTS,
    maximumRedirects: MAXIMUM_REDIRECTS,
    maximumSurfaceOccurrences: MAXIMUM_SURFACE_OCCURRENCES,
  });

export const OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_BOUNDARY
  = deepFreeze({
    position: "SELLER_OWNED_WEB_NATIVE_SURFACE_OBSERVATION_HOLD_ONLY",
    intendedFallbackAfterWellKnownDescriptorAbsent: true,
    globalProviderRegistryCreated: false,
    providerEnrollmentRequired: false,
    sellerOriginAlreadyDiscoveredRequired: true,
    publicHttpsOriginRequired: true,
    ipLiteralAccepted: false,
    nonPublicHostnameSuffixAccepted: false,
    pinnedAllPublicDnsTransportRequired: true,
    tlsHostnameAndRemoteAddressBindingRequired: true,
    sameOriginRedirectsOnly: true,
    sameOriginHttpsFormAndEntryPointTargetsOnly: true,
    maximumRedirects: MAXIMUM_REDIRECTS,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    maximumTimeoutMs: MAXIMUM_TIMEOUT_MS,
    timeoutScope: "WHOLE_DISCOVERY_ATTEMPT_INCLUDING_REDIRECTS",
    maximumDocumentBytes: MAXIMUM_DOCUMENT_BYTES,
    permittedNetworkMethod: "GET",
    automaticRedirectFollowingPermitted: false,
    credentialsPermitted: false,
    cookiesPermitted: false,
    postPerformed: false,
    mailboxResolutionPerformed: false,
    emailSent: false,
    formSubmitted: false,
    jsonLdActionInvoked: false,
    paymentPerformed: false,
    rawOriginProjected: false,
    rawUrlProjected: false,
    rawContactProjected: false,
    rawDocumentProjected: false,
    sourceStatusBodyHashAndByteCountReplayed: true,
    observationsAreSourceOccurrencesNotProviderObjects: true,
    observedSurfaceIsPermission: false,
    observedSurfaceIsProviderAcceptance: false,
    observedSurfaceIsCapacity: false,
    observedSurfaceIsPrice: false,
    observedSurfaceIsAuthority: false,
    observedSurfaceIsContactabilityProof: false,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    knownCoverageLimits: Object.freeze([
      "NO_JAVASCRIPT_RENDERING",
      "NO_SHADOW_DOM_OR_IFRAME_TRAVERSAL",
      "NO_SUBMITTER_FORMACTION_OVERRIDE_EXPANSION",
      "NO_EXTERNAL_LINKED_DOCUMENT_TRAVERSAL",
      "CONSERVATIVE_JSON_LD_CONTEXT_AND_URL_TEMPLATE_PARSING",
    ]),
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function plainObject(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_INVALID`);
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, "value")) fail(`${code}_INVALID`);
  }
  return value;
}

function exactObject(value, fields, code) {
  plainObject(value, code);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) =>
    typeof key !== "string" || !fields.includes(key))) fail(`${code}_INVALID`);
  return value;
}

function optionsObject(value, fields, code) {
  plainObject(value, code);
  if (Reflect.ownKeys(value).some((key) =>
    typeof key !== "string" || !fields.includes(key))) fail(`${code}_INVALID`);
  return value;
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function privateRef(nonce, tenderHash, requirementId, kind, value) {
  return `sha256:${createHash("sha256")
    .update("outsider/web-native-transaction-surface-private-ref/v1\0")
    .update(nonce).update("\0").update(tenderHash).update("\0")
    .update(requirementId).update("\0").update(kind).update("\0")
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function projectionHash(value) {
  return `sha256:${createHash("sha256")
    .update("outsider/web-native-transaction-surface-projection/v1\0")
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function normalizeInstant(raw, code) {
  if (typeof raw !== "string" || !INSTANT.test(raw)) fail(code);
  const milliseconds = Date.parse(raw);
  if (!Number.isFinite(milliseconds)
    || new Date(milliseconds).toISOString() !== raw) fail(code);
  return milliseconds;
}

function normalizeOrigin(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 8_192) {
    fail("SELLER_ORIGIN_INVALID");
  }
  let url;
  try { url = new URL(raw); } catch { fail("SELLER_ORIGIN_INVALID"); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  const labels = hostname.split(".");
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || url.pathname !== "/" || url.search || url.hash || isIP(hostname) !== 0
    || hostname === "localhost" || labels.length < 2 || hostname.length > 253
    || labels.some((label) => !DNS_LABEL.test(label))
    || NON_PUBLIC_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    fail("PUBLIC_HTTPS_SELLER_ORIGIN_REQUIRED");
  }
  url.hostname = hostname;
  return url.origin;
}

function boundedInteger(value, fallback, maximum, code) {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized < 0
    || normalized > maximum) fail(code);
  return normalized;
}

function decodeAttribute(value) {
  return value.replace(/&(?:amp|quot|lt|gt)(?:;|(?=[^a-z0-9=]|$))|&apos;|&#\d{1,7};?|&#x[a-f0-9]{1,6};?/giu,
    (entity) => {
      const lower = entity.toLowerCase();
      if (/^&amp;?$/u.test(lower)) return "&";
      if (/^&quot;?$/u.test(lower)) return '"';
      if (lower === "&apos;") return "'";
      if (/^&lt;?$/u.test(lower)) return "<";
      if (/^&gt;?$/u.test(lower)) return ">";
      const hexadecimal = lower.startsWith("&#x");
      const withoutSemicolon = entity.endsWith(";") ? entity.slice(0, -1) : entity;
      const digits = withoutSemicolon.slice(hexadecimal ? 3 : 2);
      const point = Number.parseInt(digits, hexadecimal ? 16 : 10);
      return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff
        && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : "\ufffd";
    });
}

function parseAttributes(source) {
  const attributes = new Map();
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /[\t\n\f\r ]/u.test(source[index])) index += 1;
    if (index >= source.length || source[index] === "/") break;
    const nameStart = index;
    while (index < source.length
      && !/[\t\n\f\r />=]/u.test(source[index])) index += 1;
    if (index === nameStart) { index += 1; continue; }
    const name = source.slice(nameStart, index).toLowerCase();
    while (index < source.length && /[\t\n\f\r ]/u.test(source[index])) index += 1;
    let value = "";
    if (source[index] === "=") {
      index += 1;
      while (index < source.length && /[\t\n\f\r ]/u.test(source[index])) index += 1;
      if (source[index] === '"' || source[index] === "'") {
        const quote = source[index]; index += 1;
        const start = index;
        while (index < source.length && source[index] !== quote) index += 1;
        value = source.slice(start, index);
        if (source[index] === quote) index += 1;
      } else {
        const start = index;
        while (index < source.length && !/[\t\n\f\r >]/u.test(source[index])) {
          index += 1;
        }
        value = source.slice(start, index);
      }
    }
    if (Buffer.byteLength(name, "utf8") <= 256 && !attributes.has(name)) {
      attributes.set(name, Buffer.byteLength(value, "utf8")
        <= MAXIMUM_ATTRIBUTE_BYTES ? decodeAttribute(value)
        : OVERSIZED_ATTRIBUTE);
    }
  }
  return attributes;
}

function findTagEnd(text, start) {
  let quote = null;
  const maximum = Math.min(text.length, start + MAXIMUM_TAG_BYTES);
  for (let index = start; index < maximum; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") return index;
  }
  return -1;
}

function findRawTextEnd(text, lower, name, start) {
  if (name === "plaintext") return null;
  const needle = `</${name}`;
  let candidate = lower.indexOf(needle, start);
  while (candidate >= 0) {
    const delimiter = lower[candidate + needle.length];
    if (delimiter === undefined || /[\t\n\f\r />]/u.test(delimiter)) {
      const end = findTagEnd(text, candidate + needle.length);
      return end < 0 ? null : { start: candidate, end };
    }
    candidate = lower.indexOf(needle, candidate + needle.length);
  }
  return null;
}

function findNestedTemplateEnd(text, lower, start) {
  let depth = 1;
  let cursor = start;
  while (cursor < text.length) {
    const open = text.indexOf("<", cursor);
    if (open < 0) return null;
    if (text.startsWith("<!--", open)) {
      const commentEnd = text.indexOf("-->", open + 4);
      if (commentEnd < 0) return null;
      cursor = commentEnd + 3;
      continue;
    }
    let index = open + 1;
    const closing = text[index] === "/";
    if (closing) index += 1;
    if (text[index] === "!" || text[index] === "?") {
      const end = findTagEnd(text, index + 1);
      if (end < 0) return null;
      cursor = end + 1;
      continue;
    }
    while (index < text.length && /[\t\n\f\r ]/u.test(text[index])) index += 1;
    const nameStart = index;
    while (index < text.length && /[a-zA-Z0-9:-]/u.test(text[index])) index += 1;
    if (index === nameStart) { cursor = open + 1; continue; }
    const name = lower.slice(nameStart, index);
    const delimiter = lower[index];
    if (delimiter !== undefined && !/[\t\n\f\r />]/u.test(delimiter)) {
      cursor = index + 1;
      continue;
    }
    const end = findTagEnd(text, index);
    if (end < 0) return null;
    if (name === "template") {
      depth += closing ? -1 : 1;
      if (depth === 0) return { start: open, end };
      cursor = end + 1;
      continue;
    }
    if (!closing && RAW_OR_INERT_TEXT_ELEMENTS.has(name)) {
      const rawEnd = findRawTextEnd(text, lower, name, end + 1);
      if (rawEnd === null) return null;
      cursor = rawEnd.end + 1;
      continue;
    }
    cursor = end + 1;
  }
  return null;
}

function scanRelevantMarkup(text) {
  const lower = text.toLowerCase();
  const tags = [];
  const jsonLdBodies = [];
  let index = 0;
  let tagCount = 0;
  while (index < text.length && tagCount < MAXIMUM_TAGS) {
    const open = text.indexOf("<", index);
    if (open < 0) break;
    if (text.startsWith("<!--", open)) {
      const close = text.indexOf("-->", open + 4);
      index = close < 0 ? text.length : close + 3;
      continue;
    }
    if (text[open + 1] === "!" || text[open + 1] === "?"
      || text[open + 1] === "/") {
      const close = findTagEnd(text, open + 2);
      index = close < 0 ? text.length : close + 1;
      continue;
    }
    let cursor = open + 1;
    while (cursor < text.length && /[\t\n\f\r ]/u.test(text[cursor])) cursor += 1;
    const nameStart = cursor;
    while (cursor < text.length && /[a-zA-Z0-9:-]/u.test(text[cursor])) cursor += 1;
    if (cursor === nameStart) { index = open + 1; continue; }
    const name = text.slice(nameStart, cursor).toLowerCase();
    const end = findTagEnd(text, cursor);
    if (end < 0) break;
    tagCount += 1;
    const attributes = parseAttributes(text.slice(cursor, end));
    if (name === "form" || name === "a" || name === "area" || name === "base") {
      tags.push({ name, attributes });
    }
    if (RAW_OR_INERT_TEXT_ELEMENTS.has(name)) {
      const close = name === "template"
        ? findNestedTemplateEnd(text, lower, end + 1)
        : findRawTextEnd(text, lower, name, end + 1);
      const scriptType = attributes.get("type");
      if (name === "script" && typeof scriptType === "string"
        && scriptType.trim().toLowerCase() === "application/ld+json"
        && jsonLdBodies.length < MAXIMUM_JSON_LD_SCRIPTS) {
        jsonLdBodies.push(text.slice(end + 1,
          close === null ? text.length : close.start));
      }
      index = close === null ? text.length : close.end + 1;
    } else index = end + 1;
  }
  return { tags, jsonLdBodies, maximumTagCountReached: tagCount >= MAXIMUM_TAGS };
}

function sameOriginHttpsTarget(raw, base, origin) {
  if (typeof raw !== "string" || raw.length === 0
    || Buffer.byteLength(raw, "utf8") > MAXIMUM_TARGET_BYTES
    || /[\0\r\n\\]/u.test(raw)
    /* The minimal tokenizer decodes numeric and legacy references. Refuse
     * every remaining named reference instead of letting a browser later
     * reinterpret a structural character such as &colon; or &sol;. */
    || /&[a-z][a-z0-9]{1,31}(?:;|(?=[^a-z0-9=]|$))/iu.test(raw)) return null;
  let url;
  try { url = new URL(raw, base); } catch { return null; }
  if (url.protocol !== "https:" || url.origin !== origin || url.username
    || url.password || url.port || Buffer.byteLength(url.href, "utf8")
      > MAXIMUM_TARGET_BYTES) return null;
  url.hash = "";
  return { privateTarget: url.href, normalizedForPolicy: url.href };
}

function sameOriginHttpsTemplate(raw, base, origin) {
  if (typeof raw !== "string" || raw.length === 0
    || Buffer.byteLength(raw, "utf8") > MAXIMUM_TARGET_BYTES
    || /[\0\r\n\\#]/u.test(raw)
    || /&[a-z][a-z0-9]{1,31}(?:;|(?=[^a-z0-9=]|$))/iu.test(raw)) return null;
  const expressions = [...raw.matchAll(SAFE_URI_TEMPLATE_EXPRESSION)];
  const withoutExpressions = raw.replace(SAFE_URI_TEMPLATE_EXPRESSION,
    "OUTSIDER_TEMPLATE_VALUE");
  if (/[{}]/u.test(withoutExpressions)) return null;
  if (expressions.length === 0) return sameOriginHttpsTarget(raw, base, origin);
  /* Refuse reserved and fragment expansion (+ and #), and require a fixed
   * URL prefix before any variable. This prevents a template value from
   * supplying a scheme/authority while preserving the exact RFC6570 syntax
   * for a later, separately-authorized adapter. */
  const firstExpression = expressions[0].index;
  if (firstExpression === 0 || raw.startsWith("//")) return null;
  const prefix = raw.slice(0, firstExpression);
  let resolvedPrefix;
  try { resolvedPrefix = new URL(prefix, base); } catch { return null; }
  if (resolvedPrefix.protocol !== "https:" || resolvedPrefix.origin !== origin
    || resolvedPrefix.username || resolvedPrefix.password || resolvedPrefix.port) {
    return null;
  }
  let policyUrl;
  try { policyUrl = new URL(withoutExpressions, base); } catch { return null; }
  if (policyUrl.protocol !== "https:" || policyUrl.origin !== origin
    || policyUrl.username || policyUrl.password || policyUrl.port) return null;
  resolvedPrefix.hash = "";
  const privateTarget = `${resolvedPrefix.href}${raw.slice(firstExpression)}`;
  if (Buffer.byteLength(privateTarget, "utf8") > MAXIMUM_TARGET_BYTES) return null;
  return { privateTarget, normalizedForPolicy: policyUrl.href };
}

function mailtoTarget(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") < 8
    || Buffer.byteLength(raw, "utf8") > MAXIMUM_TARGET_BYTES
    || /[\0\r\n]/u.test(raw) || !/^mailto:/iu.test(raw)
    || /&[a-z][a-z0-9]{1,31}(?:;|(?=[^a-z0-9=]|$))/iu.test(raw)
    || /^mailto:\/\//iu.test(raw) || raw.slice(7).length === 0) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "mailto:") return null;
    return `mailto:${raw.slice(7)}`;
  } catch { return null; }
}

function schemaContextPresent(value) {
  if (typeof value === "string") {
    return /^https?:\/\/schema\.org\/?$/iu.test(value);
  }
  /* Arrays can reset or remap a context in order. Keep only the one-element
   * subset whose meaning is unambiguous without a full JSON-LD processor. */
  if (Array.isArray(value)) {
    return value.length === 1 && schemaContextPresent(value[0]);
  }
  if (value && typeof value === "object") {
    /* A prefix mapping does not make unqualified names schema.org terms, and
     * sibling term definitions may override @vocab. Accept only bare @vocab. */
    return Reflect.ownKeys(value).length === 1
      && Object.hasOwn(value, "@vocab")
      && schemaContextPresent(value["@vocab"]);
  }
  return false;
}

function schemaProperty(object, name) {
  for (const key of [name, `https://schema.org/${name}`,
    `http://schema.org/${name}`]) {
    if (Object.hasOwn(object, key)) return object[key];
  }
  return undefined;
}

function declaredHttpMethod(value) {
  if (typeof value !== "string") return "UNDECLARED";
  const normalized = value.trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(normalized)
    ? normalized : "OTHER_DECLARED";
}

function schemaTypeIncludes(value, expected) {
  const types = value && typeof value === "object" ? value["@type"] : null;
  return (Array.isArray(types) ? types : [types]).some((type) =>
    typeof type === "string" && (type === expected
      || type === `https://schema.org/${expected}`
      || type === `http://schema.org/${expected}`));
}

function extractJsonLdTargets(bodies, base, origin, add, rejected) {
  let nodes = 0;
  function visit(value, inheritedContext, depth) {
    if (depth > MAXIMUM_JSON_TREE_DEPTH || nodes >= MAXIMUM_JSON_TREE_NODES) {
      rejected.jsonLdTreeLimitCount += 1;
      return;
    }
    if (Array.isArray(value)) {
      nodes += 1;
      for (const item of value) visit(item, inheritedContext, depth + 1);
      return;
    }
    if (value === null || typeof value !== "object") return;
    nodes += 1;
    const context = Object.hasOwn(value, "@context")
      ? schemaContextPresent(value["@context"]) : inheritedContext;
    const actions = schemaProperty(value, "potentialAction");
    if (context && actions !== undefined) {
      for (const action of Array.isArray(actions) ? actions : [actions]) {
        if (action === null || typeof action !== "object" || Array.isArray(action)) {
          rejected.jsonLdMalformedActionCount += 1;
          continue;
        }
        const actionContext = Object.hasOwn(action, "@context")
          ? schemaContextPresent(action["@context"]) : context;
        if (!actionContext) {
          rejected.jsonLdMalformedActionCount += 1;
          continue;
        }
        const targets = schemaProperty(action, "target");
        if (targets === undefined) {
          rejected.jsonLdMissingTargetCount += 1;
          continue;
        }
        for (const target of Array.isArray(targets) ? targets : [targets]) {
          let raw;
          let kind;
          let method = declaredHttpMethod(schemaProperty(action, "httpMethod"));
          if (typeof target === "string") {
            raw = target;
            kind = "SCHEMA_ORG_POTENTIAL_ACTION_TARGET";
          } else if (target && typeof target === "object" && !Array.isArray(target)) {
            const targetContext = Object.hasOwn(target, "@context")
              ? schemaContextPresent(target["@context"]) : actionContext;
            if (!targetContext) {
              rejected.jsonLdUnsafeOrUnsupportedTargetCount += 1;
              continue;
            }
            raw = schemaProperty(target, "urlTemplate");
            method = declaredHttpMethod(schemaProperty(target, "httpMethod")
              ?? schemaProperty(action, "httpMethod"));
            kind = schemaTypeIncludes(target, "EntryPoint")
              ? "SCHEMA_ORG_ENTRY_POINT"
              : "SCHEMA_ORG_POTENTIAL_ACTION_STRUCTURED_TARGET";
          }
          const normalized = sameOriginHttpsTemplate(raw, base, origin);
          if (normalized === null) {
            rejected.jsonLdUnsafeOrUnsupportedTargetCount += 1;
            continue;
          }
          add({ kind, targetKind: "HTTPS_URL_TEMPLATE", methodCode: method,
            privateTarget: normalized.privateTarget,
            metadata: { schemaOrgContextObserved: true,
              entryPointTypeObserved: kind === "SCHEMA_ORG_ENTRY_POINT",
              targetSameOriginHttps: true } });
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "potentialAction" && !key.endsWith("/potentialAction")) {
        visit(child, context, depth + 1);
      }
    }
  }
  for (const body of bodies) {
    let document;
    try { document = JSON.parse(body); } catch {
      rejected.jsonLdParseFailureCount += 1;
      continue;
    }
    visit(document, false, 0);
  }
}

function extractSurfaces(text, documentUrl, origin, binding) {
  const scanned = scanRelevantMarkup(text);
  const rejected = {
    unsafeOrCrossOriginFormCount: 0,
    nonNetworkFormMethodCount: 0,
    malformedMailtoCount: 0,
    unsafeBaseCount: 0,
    jsonLdParseFailureCount: 0,
    jsonLdMalformedActionCount: 0,
    jsonLdMissingTargetCount: 0,
    jsonLdUnsafeOrUnsupportedTargetCount: 0,
    jsonLdTreeLimitCount: 0,
    maximumSurfaceCountReached: false,
    maximumTagCountReached: scanned.maximumTagCountReached,
  };
  const firstBase = scanned.tags.find((tag) => tag.name === "base"
    && tag.attributes.has("href"));
  let base = documentUrl;
  if (firstBase) {
    const normalized = sameOriginHttpsTarget(firstBase.attributes.get("href"),
      documentUrl, origin);
    if (normalized === null) rejected.unsafeBaseCount += 1;
    else base = normalized.privateTarget;
  }
  const publicObservations = [];
  const privateObservations = [];
  const add = (surface) => {
    if (publicObservations.length >= MAXIMUM_SURFACE_OCCURRENCES) {
      rejected.maximumSurfaceCountReached = true;
      return;
    }
    const occurrenceIndex = publicObservations.length;
    const surfaceRefHash = privateRef(binding.privateProjectionNonce,
      binding.tenderHash, binding.requirementId, surface.kind, {
        targetKind: surface.targetKind,
        privateTarget: surface.privateTarget,
        methodCode: surface.methodCode,
      });
    publicObservations.push({ occurrenceIndex, surfaceKind: surface.kind,
      surfaceRefHash, targetKind: surface.targetKind,
      methodCode: surface.methodCode, ...surface.metadata,
      rawTargetProjected: false, contactProjected: false,
      observationOnly: true, permissionEstablished: false,
      providerAcceptanceEstablished: false, capacityReserved: false,
      priceEstablished: false, authority: "NONE", decisionState: "HOLD" });
    privateObservations.push({ occurrenceIndex, surfaceKind: surface.kind,
      surfaceRefHash, targetKind: surface.targetKind,
      target: surface.privateTarget, methodCode: surface.methodCode,
      invocationPermittedByObservation: false,
      providerAcceptanceEstablished: false, capacityReserved: false,
      authorityEstablished: false });
  };
  for (const tag of scanned.tags) {
    if (tag.name === "form") {
      const rawMethod = tag.attributes.get("method");
      if (rawMethod !== undefined && typeof rawMethod !== "string") {
        rejected.unsafeOrCrossOriginFormCount += 1;
        continue;
      }
      const normalizedMethod = rawMethod === undefined || rawMethod.trim() === ""
        ? "GET" : rawMethod.trim().toUpperCase();
      if (normalizedMethod === "DIALOG") {
        rejected.nonNetworkFormMethodCount += 1;
        continue;
      }
      const methodCode = normalizedMethod === "POST" ? "POST" : "GET";
      const actionPresent = tag.attributes.has("action");
      const rawAction = actionPresent ? tag.attributes.get("action") : documentUrl;
      const normalized = sameOriginHttpsTarget(rawAction || documentUrl,
        actionPresent ? base : documentUrl, origin);
      if (normalized === null) {
        rejected.unsafeOrCrossOriginFormCount += 1;
        continue;
      }
      add({ kind: "HTML_FORM", targetKind: "HTTPS_URL",
        methodCode, privateTarget: normalized.privateTarget,
        metadata: { actionAttributeObserved: actionPresent,
          methodAttributeObserved: rawMethod !== undefined,
          targetSameOriginHttps: true } });
    } else if (tag.name === "a" || tag.name === "area") {
      const href = tag.attributes.get("href");
      if (typeof href !== "string" || !/^mailto:/iu.test(href.trim())) continue;
      const normalized = mailtoTarget(href.trim());
      if (normalized === null) {
        rejected.malformedMailtoCount += 1;
        continue;
      }
      add({ kind: "MAILTO_LINK", targetKind: "MAILTO_URI",
        methodCode: "MAIL_COMPOSE", privateTarget: normalized,
        metadata: { targetSameOriginHttps: false,
          sameOriginHttpsNotApplicableToMailto: true } });
    }
  }
  extractJsonLdTargets(scanned.jsonLdBodies, base, origin, add, rejected);
  return { publicObservations, privateObservations, rejected };
}

async function readResponseText(response, maximumDocumentBytes) {
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status) || response.status < 100
    || response.status > 599 || response.headers === null
    || typeof response.headers !== "object"
    || typeof response.headers.get !== "function"
    || typeof response.arrayBuffer !== "function") {
    fail("TRANSPORT_RESPONSE_INVALID");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/u.test(declared)) fail("CONTENT_LENGTH_INVALID");
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes > maximumDocumentBytes) {
      fail("DOCUMENT_TOO_LARGE");
    }
  }
  const arrayBuffer = await response.arrayBuffer();
  if (!(arrayBuffer instanceof ArrayBuffer)) fail("TRANSPORT_RESPONSE_INVALID");
  const body = Buffer.from(arrayBuffer);
  if (body.length > maximumDocumentBytes) fail("DOCUMENT_TOO_LARGE");
  let text = null;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(body); } catch {}
  return { status: response.status, headers: response.headers,
    text, bodyHash: sha256Bytes(body), bodyBytes: body.length };
}

export async function discoverWebNativeTransactionSurfacesV1(input,
  dependencies = {}) {
  exactObject(input, ["sellerOrigin", "tenderHash", "requirementId",
    "observedAt", "expiresAt", "privateProjectionNonce"], "INPUT");
  optionsObject(dependencies, ["transportConfig", "timeoutMs",
    "maximumDocumentBytes", "maximumRedirects"], "DEPENDENCIES");
  const origin = normalizeOrigin(input.sellerOrigin);
  if (typeof input.tenderHash !== "string" || !HASH.test(input.tenderHash)
    || typeof input.privateProjectionNonce !== "string"
    || !HASH.test(input.privateProjectionNonce)
    || typeof input.requirementId !== "string"
    || !REQUIREMENT_ID.test(input.requirementId)) fail("BINDING_INVALID");
  const observedAtMs = normalizeInstant(input.observedAt, "OBSERVED_AT_INVALID");
  const expiresAtMs = normalizeInstant(input.expiresAt, "EXPIRES_AT_INVALID");
  if (expiresAtMs <= observedAtMs || expiresAtMs - observedAtMs
    > MAXIMUM_LEASE_MS) fail("LEASE_WINDOW_INVALID");
  const timeoutMs = boundedInteger(dependencies.timeoutMs,
    DEFAULT_TIMEOUT_MS, MAXIMUM_TIMEOUT_MS, "TIMEOUT_INVALID");
  if (timeoutMs < 1) fail("TIMEOUT_INVALID");
  const maximumDocumentBytes = boundedInteger(
    dependencies.maximumDocumentBytes, DEFAULT_MAXIMUM_DOCUMENT_BYTES,
    MAXIMUM_DOCUMENT_BYTES, "MAXIMUM_DOCUMENT_BYTES_INVALID");
  if (maximumDocumentBytes < 1) fail("MAXIMUM_DOCUMENT_BYTES_INVALID");
  const maximumRedirects = boundedInteger(dependencies.maximumRedirects,
    DEFAULT_MAXIMUM_REDIRECTS, MAXIMUM_REDIRECTS,
    "MAXIMUM_REDIRECTS_INVALID");
  const transportConfig = dependencies.transportConfig ?? {};
  plainObject(transportConfig, "TRANSPORT_CONFIG");
  const sourceHops = [];
  let currentUrl = `${origin}/`;
  let terminal;
  const deadlineMs = Date.now() + timeoutMs;
  for (let requestIndex = 0; requestIndex <= maximumRedirects; requestIndex += 1) {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs < 1) fail("TIMEOUT");
    const fetchImpl = createPinnedPublicHttpsFetchV1({ ...transportConfig,
      timeoutMs: Math.min(remainingMs,
        OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_LIMITS.maximumTimeoutMs),
      maximumResponseBytes: maximumDocumentBytes });
    const response = await fetchImpl(currentUrl, { method: "GET",
      headers: { Accept: "text/html, application/xhtml+xml;q=0.9" },
      redirect: "error", credentials: "omit",
      signal: new AbortController().signal });
    const read = await readResponseText(response, maximumDocumentBytes);
    const location = response.headers.get("location");
    sourceHops.push({ requestIndex, status: read.status,
      bodyHash: read.bodyHash, bodyBytes: read.bodyBytes,
      requestRefHash: privateRef(input.privateProjectionNonce,
        input.tenderHash, input.requirementId, "SOURCE_REQUEST", currentUrl),
      redirectLocationRefHash: location === null ? null
        : privateRef(input.privateProjectionNonce, input.tenderHash,
          input.requirementId, "REDIRECT_LOCATION", location) });
    if (!REDIRECT_STATUS.has(read.status)) { terminal = read; break; }
    if (location === null || requestIndex >= maximumRedirects) {
      fail("REDIRECT_LIMIT_OR_LOCATION_INVALID");
    }
    const normalized = sameOriginHttpsTarget(location, currentUrl, origin);
    if (normalized === null) fail("REDIRECT_CROSS_ORIGIN_OR_UNSAFE_REFUSED");
    currentUrl = normalized.privateTarget;
  }
  if (terminal === undefined) fail("TERMINAL_RESPONSE_MISSING");
  const contentType = terminal.headers.get("content-type") ?? "";
  const successful = terminal.status >= 200 && terminal.status <= 299;
  const htmlMediaType
    = /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/iu.test(contentType);
  const charsetMatch = /(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/iu
    .exec(contentType);
  const supportedEncoding = (charsetMatch === null
    || /^(?:utf-8|utf8)$/iu.test(charsetMatch[1])) && terminal.text !== null;
  const html = successful && htmlMediaType && supportedEncoding;
  let extracted = { publicObservations: [], privateObservations: [],
    rejected: { unsafeOrCrossOriginFormCount: 0,
      nonNetworkFormMethodCount: 0, malformedMailtoCount: 0,
      unsafeBaseCount: 0, jsonLdParseFailureCount: 0,
      jsonLdMalformedActionCount: 0, jsonLdMissingTargetCount: 0,
      jsonLdUnsafeOrUnsupportedTargetCount: 0, jsonLdTreeLimitCount: 0,
      maximumSurfaceCountReached: false, maximumTagCountReached: false } };
  if (html) extracted = extractSurfaces(terminal.text, currentUrl, origin, input);
  const status = !successful ? "SOURCE_HTTP_STATUS_ONLY"
    : htmlMediaType && !supportedEncoding
      ? "SOURCE_NOT_SUPPORTED_DOCUMENT_ENCODING"
      : !html ? "SOURCE_NOT_SUPPORTED_DOCUMENT"
      : extracted.publicObservations.length > 0
        ? "SURFACES_OBSERVED" : "NO_SUPPORTED_SURFACE_OBSERVED";
  const projection = {
    schema: "outsider/web-native-transaction-surface-privacy-closed-summary/v1",
    schemaVersion: "1.0.0", tenderHash: input.tenderHash,
    requirementId: input.requirementId, observedAt: input.observedAt,
    expiresAt: input.expiresAt, status,
    sellerOriginRefHash: privateRef(input.privateProjectionNonce,
      input.tenderHash, input.requirementId, "SELLER_ORIGIN", origin),
    sourceReplay: { requestCount: sourceHops.length,
      redirectCount: sourceHops.length - 1,
      terminalStatus: terminal.status,
      terminalBodyHash: terminal.bodyHash,
      terminalBodyBytes: terminal.bodyBytes,
      bodyRepresentation: "EXACT_RAW_RESPONSE_BYTES_FROM_PINNED_TRANSPORT",
      hops: sourceHops },
    surfaceOccurrenceCount: extracted.publicObservations.length,
    surfaceOccurrences: extracted.publicObservations,
    rejectedObservationCounts: extracted.rejected,
    originProjected: false, urlProjected: false, contactProjected: false,
    documentProjected: false, networkMethodUsed: "GET",
    providerContactPerformed: false, tenderDelivered: false,
    formSubmitted: false, emailSent: false, paymentPerformed: false,
    observationIsNotPermissionOrAcceptanceOrCapacityOrPrice: true,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false, capacityReserved: false,
    priceEstablished: false, authority: "NONE", decisionState: "HOLD",
    actionReady: false, executable: false,
  };
  projection.projectionHash = projectionHash(projection);
  const result = deepFreeze({
    schema: "outsider/web-native-transaction-surface-private-lease/v1",
    schemaVersion: "1.0.0", publicProjection: deepFreeze(projection),
  });
  PRIVATE_RESULTS.set(result, { consumed: false, origin, currentUrl,
    expiresAt: input.expiresAt, tenderHash: input.tenderHash,
    requirementId: input.requirementId,
    observations: extracted.privateObservations.map((item) => ({ ...item })) });
  return result;
}

export function claimWebNativeTransactionSurfaceLeaseV1(result) {
  const state = PRIVATE_RESULTS.get(result);
  if (state === undefined || state.consumed) fail("PRIVATE_LEASE_INVALID_OR_REPLAYED");
  state.consumed = true;
  return deepFreeze({
    schema: "outsider/web-native-transaction-surface-private-claim/v1",
    schemaVersion: "1.0.0", tenderHash: state.tenderHash,
    requirementId: state.requirementId, expiresAt: state.expiresAt,
    observations: state.observations,
    discoveryObservationOnly: true, invocationPermitted: false,
    permissionEstablished: false, providerAcceptanceEstablished: false,
    capacityReserved: false, authority: "NONE", decisionState: "HOLD",
  });
}
